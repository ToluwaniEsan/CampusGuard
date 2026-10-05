"""Feature pipeline, model factories and explainers for CampusGuard (v2).

Everything here is deliberately simple enough to re-implement 1:1 in JavaScript:
  * tokeniser = one regex, unigrams + bigrams joined by a space
  * TF-IDF    = sublinear tf, smooth idf, L2 norm (sklearn defaults)
  * message model = Logistic Regression; its exact SHAP values are coef * (x - E[x])
  * URL model = small tree ensemble; explained with per-tree path attribution
"""
from __future__ import annotations

import re

import numpy as np
import pandas as pd
from scipy import sparse
from sklearn.ensemble import GradientBoostingClassifier, RandomForestClassifier
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import MaxAbsScaler

from .features import ENGINEERED_NAMES, URL_MODEL_FEATURES, message_features, url_struct
from .preprocess import clean_for_tfidf, normalise_raw

PLACEHOLDERS = {"urltoken", "emailtoken", "moneytoken", "0"}
TOKEN_SRC = r"\b[a-z][a-z0-9']+\b|\b0\b"
TOKEN_RX = re.compile(TOKEN_SRC, re.A)


def analyzer(clean: str):
    toks = TOKEN_RX.findall(clean)
    return toks + [toks[i] + " " + toks[i + 1] for i in range(len(toks) - 1)]


def prepare(texts):
    """raw texts -> (normalised, cleaned, engineered DataFrame). Run once, reuse everywhere."""
    norms, cleans, rows = [], [], []
    for t in texts:
        n = normalise_raw(t)
        norms.append(n)
        cleans.append(clean_for_tfidf(n, already_normalised=True))
        rows.append(message_features(n, normalised=True)[1])
    return norms, cleans, pd.DataFrame(rows, columns=ENGINEERED_NAMES).astype(float)


class EmailVectorizer:
    """TF-IDF over cleaned text + up-weighted engineered red-flag features."""

    def __init__(self, max_features: int = 25000, engineered_weight: float = 2.0, min_df: int = 3):
        self.tfidf = TfidfVectorizer(analyzer=analyzer, min_df=min_df, max_df=0.6,
                                     max_features=max_features, sublinear_tf=True)
        self.scaler = MaxAbsScaler()
        self.engineered_weight = engineered_weight

    def fit(self, cleans, eng: pd.DataFrame):
        self.tfidf.fit(cleans)
        self.scaler.fit(eng.values)
        return self

    def transform(self, cleans, eng: pd.DataFrame):
        a = self.tfidf.transform(cleans)
        b = self.scaler.transform(eng.values) * self.engineered_weight
        return sparse.hstack([a, sparse.csr_matrix(b)]).tocsr()

    @property
    def feature_names(self):
        return [f"word:{w}" for w in self.tfidf.get_feature_names_out()] + list(ENGINEERED_NAMES)


class SignConstrainedLogReg:
    """L2 logistic regression where chosen coefficients are forced to be >= 0.

    The red-flag detectors are meant to be warning signs. An unconstrained model can learn a
    negative weight for one of them when it overlaps with words (v2.1 learned -1.49 for
    "official request from a personal email"), which makes a red flag count as evidence of
    safety. Bounding those weights at 0 keeps every detector pointing the right way.
    Objective: 0.5*||w||^2 + C * sum(balanced_weight * logloss); intercept unpenalised.
    """

    def __init__(self, C: float = 3.0, nonneg: slice | None = None, max_iter: int = 3000):
        self.C, self.nonneg, self.max_iter = C, nonneg, max_iter

    def fit(self, X, y):
        from scipy.optimize import minimize
        X = sparse.csr_matrix(X)
        y = np.asarray(y, dtype=float)
        n, d = X.shape
        pos = y.mean()
        sw = np.where(y == 1, 0.5 / pos, 0.5 / (1 - pos))      # class_weight="balanced"
        C = self.C

        def f(theta):
            w, b = theta[:d], theta[d]
            z = X @ w + b
            # stable log(1+exp(-y*z)) with y in {-1,1}
            ys = 2 * y - 1
            m = -ys * z
            loss = np.where(m > 0, m + np.log1p(np.exp(-m)), np.log1p(np.exp(m)))
            p = 1 / (1 + np.exp(-z))
            g = sw * (p - y)
            obj = 0.5 * w @ w + C * (sw * loss).sum()
            grad = np.empty(d + 1)
            grad[:d] = w + C * (X.T @ g)
            grad[d] = C * g.sum()
            return obj, grad

        bounds = [(None, None)] * (d + 1)
        if self.nonneg is not None:
            for j in range(*self.nonneg.indices(d)):
                bounds[j] = (0.0, None)
        res = minimize(f, np.zeros(d + 1), jac=True, method="L-BFGS-B", bounds=bounds,
                       options={"maxiter": self.max_iter})
        self.coef_ = res.x[:d].reshape(1, -1)
        self.intercept_ = np.array([res.x[d]])
        self.classes_ = np.array([0, 1])
        self.converged_ = bool(res.success)
        return self

    def decision_function(self, X):
        return np.asarray(X @ self.coef_.ravel() + self.intercept_[0]).ravel()

    def predict_proba(self, X):
        p = 1 / (1 + np.exp(-self.decision_function(X)))
        return np.column_stack([1 - p, p])


def make_lr(C: float = 3.0, n_words: int | None = None):
    """Message model. Red-flag detector weights (the columns after the n_words TF-IDF terms)
    are constrained to be non-negative."""
    return SignConstrainedLogReg(C=C, nonneg=slice(n_words, None) if n_words is not None else None)


def make_rf(seed: int = 42):
    return RandomForestClassifier(n_estimators=400, max_features="sqrt", class_weight="balanced_subsample",
                                  n_jobs=-1, random_state=seed)


def linear_shap(clf, x_row: np.ndarray, background_mean: np.ndarray) -> np.ndarray:
    """Exact SHAP values of a linear model with independent features (== shap.LinearExplainer)."""
    return clf.coef_.ravel() * (x_row - background_mean)


# ---------------------------------------------------------------- URL model
def url_matrix(urls) -> pd.DataFrame:
    return pd.DataFrame([{k: url_struct(u)[k] for k in URL_MODEL_FEATURES} for u in urls]).astype(float)


def make_url_models(seed: int = 42):
    return {
        "gradient_boosting": GradientBoostingClassifier(n_estimators=250, max_depth=4, learning_rate=0.1,
                                                        subsample=0.9, random_state=seed),
        "random_forest": RandomForestClassifier(n_estimators=120, max_depth=16, min_samples_leaf=3,
                                                n_jobs=-1, random_state=seed),
        "logreg": LogisticRegression(C=1.0, max_iter=5000),
    }


def export_trees(model) -> dict:
    """Serialise a fitted RF / GB into plain lists (used by the JS engine and by path_attribution)."""
    if isinstance(model, GradientBoostingClassifier):
        trees = [e[0].tree_ for e in model.estimators_]
        kind, scale = "gb", float(model.learning_rate)
        init = model._raw_predict_init(np.zeros((1, model.n_features_in_)))[0, 0]
        vals = lambda t: t.value[:, 0, 0]  # noqa: E731
    else:
        trees = [e.tree_ for e in model.estimators_]
        kind, scale, init = "rf", 1.0 / len(trees), 0.0
        vals = lambda t: t.value[:, 0, 1] / t.value[:, 0, :].sum(axis=1)  # noqa: E731
    out = []
    for t in trees:
        out.append({"l": t.children_left.tolist(), "r": t.children_right.tolist(),
                    "f": t.feature.tolist(), "t": [float(x) for x in t.threshold],
                    "v": [float(x) for x in vals(t)]})
    return {"kind": kind, "scale": scale, "init": float(init), "trees": out}


def tree_predict_explain(exported: dict, x: list[float]):
    """Probability + per-feature path attribution (Saabas). Same maths in the JS engine."""
    contrib = [0.0] * len(x)
    total = exported["init"]
    for t in exported["trees"]:
        node = 0
        val = t["v"][0]
        total += exported["scale"] * val if exported["kind"] == "rf" else 0.0
        while t["l"][node] != -1:
            f = t["f"][node]
            nxt = t["l"][node] if x[f] <= t["t"][node] else t["r"][node]
            contrib[f] += exported["scale"] * (t["v"][nxt] - t["v"][node])
            node = nxt
        if exported["kind"] == "rf":
            total += exported["scale"] * (t["v"][node] - val)
        else:
            total += exported["scale"] * t["v"][node]
    if exported["kind"] == "gb":
        p = 1.0 / (1.0 + np.exp(-total))
    else:
        p = total
    return float(p), contrib


def pick_threshold(y, p, max_fpr=0.02, floor=0.0, **_):
    """Lowest threshold (= highest recall) whose FPR stays within `max_fpr`, never below `floor`."""
    y = np.asarray(y)
    p = np.asarray(p)
    best = 0.5
    for t in np.unique(np.round(p, 4))[::-1]:
        pred = p >= t
        fpr = (pred & (y == 0)).sum() / max((y == 0).sum(), 1)
        if fpr <= max_fpr:
            best = float(t)
        else:
            break
    return max(best, floor)
