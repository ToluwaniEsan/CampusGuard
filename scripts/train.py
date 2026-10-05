"""Train + evaluate CampusGuard v2 (strengthened) and compare with the v1 deck recipe.

Message model : Logistic Regression vs Random Forest (deck), chosen on validation
Threshold     : chosen on LEAVE-ONE-SOURCE-OUT scores (unseen legit mail sources), because
                campus mail is always an unseen source for a model trained on public corpora
Evaluation    : held-out test, leave-one-ham-source-out, leave-one-scam-family-out,
                v1-vs-v2 comparison, URL model on a domain-grouped split
Outputs       : models/*.joblib, reports/metrics_v2.json
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.metrics import (average_precision_score, confusion_matrix, f1_score,
                             precision_score, recall_score, roc_auc_score)
from sklearn.model_selection import GroupShuffleSplit, train_test_split

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from campusguard.features import ENGINEERED_NAMES, URL_MODEL_FEATURES  # noqa: E402
from campusguard.model import (EmailVectorizer, export_trees, make_lr, make_rf,  # noqa: E402
                               make_url_models, pick_threshold, url_matrix)

PROC = ROOT / "data" / "processed"
MODELS = ROOT / "models"
REPORTS = ROOT / "reports"
MODELS.mkdir(exist_ok=True)
REPORTS.mkdir(exist_ok=True)
SEED = 42
HAM_SOURCES = ["spamassassin_ham", "enron_ham", "ceas_ham", "ling_ham", "sms_ham"]


def metrics(y, p, thr):
    y = np.asarray(y)
    pred = (np.asarray(p) >= thr).astype(int)
    tn, fp, fn, tp = confusion_matrix(y, pred, labels=[0, 1]).ravel()
    out = {"n": int(len(y)), "threshold": round(float(thr), 4),
           "recall": round(float(recall_score(y, pred, zero_division=0)), 4),
           "precision": round(float(precision_score(y, pred, zero_division=0)), 4),
           "f1": round(float(f1_score(y, pred, zero_division=0)), 4),
           "false_positive_rate": round(float(fp / max(fp + tn, 1)), 4),
           "tp": int(tp), "fp": int(fp), "tn": int(tn), "fn": int(fn)}
    if len(set(y.tolist())) == 2:
        out["roc_auc"] = round(float(roc_auc_score(y, p)), 4)
        out["pr_auc"] = round(float(average_precision_score(y, p)), 4)
    return out


def eng(df):
    return df[ENGINEERED_NAMES].astype(float)


def fit(df, kind="lr", C=3.0):
    vec = EmailVectorizer().fit(df.clean.tolist(), eng(df))
    X = vec.transform(df.clean.tolist(), eng(df))
    clf = make_lr(C, n_words=len(vec.tfidf.idf_)) if kind == "lr" else make_rf(SEED)
    clf.fit(X, df.label.values)
    return vec, clf


def score(vec, clf, df):
    return clf.predict_proba(vec.transform(df.clean.tolist(), eng(df)))[:, 1]


def main():
    t0 = time.time()
    R = {}
    pool = pd.read_pickle(PROC / "email_pool.pkl")
    corp = pd.read_pickle(PROC / "email_corpus_v2.pkl")
    unseen_pool = pool[~pool.clean.isin(corp.clean)]

    tr, tmp = train_test_split(corp, test_size=0.30, stratify=corp.source, random_state=SEED)
    va, te = train_test_split(tmp, test_size=0.50, stratify=tmp.source, random_state=SEED)
    R["split_sizes"] = {"train": len(tr), "val": len(va), "test": len(te)}
    print(R["split_sizes"], flush=True)

    # ---------------- 1. model selection on validation (threshold 0.5 for a fair comparison)
    cands = {}
    for C in (1.0, 3.0, 10.0, 30.0):
        v, c = fit(tr, "lr", C)
        cands[f"logreg_C{C}"] = (v, c, metrics(va.label, score(v, c, va), 0.5))
    v, c = fit(tr, "rf")
    cands["random_forest"] = (v, c, metrics(va.label, score(v, c, va), 0.5))
    R["validation@0.5"] = {k: x[2] for k, x in cands.items()}
    for k, x in cands.items():
        print("VAL", k, x[2], flush=True)
    lr_keys = [k for k in cands if k.startswith("logreg")]
    best_lr = max(lr_keys, key=lambda k: (cands[k][2]["f1"], cands[k][2]["recall"]))
    C = float(best_lr.split("C")[1])
    # LR is shipped (exact SHAP, exportable to the browser) unless RF is clearly better
    rf_gain = cands["random_forest"][2]["f1"] - cands[best_lr][2]["f1"]
    R["selected_model"] = best_lr if rf_gain < 0.01 else "random_forest"
    R["selection_note"] = f"RF F1 gain over best LR on validation = {rf_gain:+.4f}; LR kept unless gain >= 0.01"
    kind = "lr" if R["selected_model"].startswith("logreg") else "rf"

    # ---------------- 2. leave-one-ham-source-out: the deployment threshold
    loso, loso_scores = {}, []
    for S in HAM_SOURCES:
        trn = tr[tr.source != S]
        v, c = fit(trn, kind, C)
        unseen = unseen_pool[unseen_pool.source == S].sample(min(1000, (unseen_pool.source == S).sum()), random_state=SEED)
        phish_va = va[va.label == 1]
        ev = pd.concat([phish_va, unseen])
        p = score(v, c, ev)
        loso_scores.append(pd.DataFrame({"y": ev.label.values, "p": p, "src": S}))
        loso[S] = {"unseen_ham_n": len(unseen)}
    L = pd.concat(loso_scores)
    # pooled unseen-source FPR <= 5% (deck target), never below 0.5
    deploy_thr = pick_threshold(L.y, L.p, max_fpr=0.05, floor=0.5)
    for S in HAM_SOURCES:
        s = L[L.src == S]
        loso[S].update(metrics(s.y, s.p, deploy_thr))
        print("LOSO", S, loso[S], flush=True)
    R["threshold"] = {"deployment": deploy_thr, "high": max(0.8, deploy_thr + 0.15),
                      "rule": "lowest threshold with pooled unseen-legit-source FPR <= 5%, floor 0.5"}
    R["leave_one_ham_source_out"] = loso

    # ---------------- 3. leave-one-scam-family-out
    fam = {}
    for F, desc in (("fraud_scam", "money / advance-fee / fake-job scams"), ("nazario", "credential phishing"),
                    ("synthetic_phish", "campus-style lures"), ("sms_scam", "SMS prize/claim scams"),
                    ("modern_synth_scam", "modern text/email scams (synthetic)")):
        trn = tr[tr.source != F]
        v, c = fit(trn, kind, C)
        held = pd.concat([unseen_pool[unseen_pool.source == F], te[te.source == F]]).drop_duplicates("clean")
        held = held.sample(min(1000, len(held)), random_state=SEED)
        ham = te[te.label == 0]
        ev = pd.concat([held, ham])
        fam[F] = {"description": desc, **metrics(ev.label, score(v, c, ev), deploy_thr)}
        print("LOFO", F, fam[F], flush=True)
    R["leave_one_scam_family_out"] = fam

    # ---------------- 4. held-out test (both baselines, deployment threshold)
    R["test"] = {}
    for k in (best_lr, "random_forest"):
        v, c, _ = cands[k]
        R["test"][k] = metrics(te.label, score(v, c, te), deploy_thr)
        print("TEST", k, R["test"][k], flush=True)

    # ---------------- 5. v1 recipe (deck data only) vs v2, same code, same tests
    v1 = corp[corp.source.isin(["nazario", "spamassassin_ham", "enron_ham"])]
    v1 = v1[~v1.clean.isin(te.clean)]
    v1_ham = v1[v1.label == 0]
    v1 = pd.concat([v1[v1.label == 1], v1_ham.sample(min(len(v1_ham), (v1.label == 1).sum()), random_state=SEED)])
    vv1, cv1 = fit(v1, "lr", C)
    full = pd.concat([tr, va])
    vv2, cv2 = fit(full, kind, C)
    comp = {}
    unseen_ceas_ling = unseen_pool[unseen_pool.source.isin(["ceas_ham", "ling_ham"])].sample(1000, random_state=SEED)
    fraud_unseen = unseen_pool[unseen_pool.source == "fraud_scam"].sample(1000, random_state=SEED)
    camp = pd.read_json(ROOT / "data/campus_eval/campus_synthetic.jsonl", lines=True)
    from campusguard.model import prepare
    n_, c_, e_ = prepare(camp.text.tolist())
    camp = pd.concat([camp.reset_index(drop=True), e_], axis=1).assign(clean=c_)
    for name, (v, c) in {"v1_deck_data": (vv1, cv1), "v2_2_current": (vv2, cv2)}.items():
        comp[name] = {
            "held_out_test_v2": metrics(te.label, score(v, c, te), deploy_thr),
            "unseen_CEAS+Ling_ham_FPR": metrics(unseen_ceas_ling.label, score(v, c, unseen_ceas_ling), deploy_thr)["false_positive_rate"],
            "unseen_fraud_scam_recall": metrics(fraud_unseen.label, score(v, c, fraud_unseen), deploy_thr)["recall"],
            "campus_set_30": metrics(camp.label, score(v, c, camp), deploy_thr),
        }
        print("COMPARE", name, json.dumps(comp[name])[:400], flush=True)
    R["v1_vs_v2"] = comp
    R["test_final_refit"] = comp["v2_2_current"]["held_out_test_v2"]

    # ---------------- 6. URL model (domain-grouped split)
    u = pd.read_pickle(PROC / "urls_balanced.pkl")
    gss = GroupShuffleSplit(n_splits=1, test_size=0.3, random_state=SEED)
    i_tr, i_tmp = next(gss.split(u, groups=u.registered_domain))
    utr, utmp = u.iloc[i_tr], u.iloc[i_tmp]
    j_va, j_te = next(GroupShuffleSplit(n_splits=1, test_size=0.5, random_state=SEED).split(utmp, groups=utmp.registered_domain))
    uva, ute = utmp.iloc[j_va], utmp.iloc[j_te]
    Xtr, Xva, Xte = url_matrix(utr.url), url_matrix(uva.url), url_matrix(ute.url)
    ures, umods = {}, make_url_models(SEED)
    for k, m in umods.items():
        m.fit(Xtr, utr.label)
        pv = m.predict_proba(Xva)[:, 1]
        t = pick_threshold(uva.label, pv, max_fpr=0.10, floor=0.5)
        ures[k] = {"threshold": t, "val": metrics(uva.label, pv, t), "test": metrics(ute.label, m.predict_proba(Xte)[:, 1], t)}
        print("URL", k, ures[k]["test"], flush=True)
    tree_keys = [k for k in ures if k != "logreg"]
    best_url = max(tree_keys, key=lambda k: ures[k]["val"]["f1"])
    R["url_model"] = {"selected": best_url, "split": "grouped by registered domain", **ures}
    umod = umods[best_url]
    exported = export_trees(umod)

    # ---------------- 7. save
    X_full = vv2.transform(full.clean.tolist(), eng(full))
    bg_mean = np.asarray(X_full.mean(axis=0)).ravel()
    joblib.dump({"vectorizer": vv2, "model": cv2, "kind": kind, "C": C,
                 "threshold": R["threshold"]["deployment"], "high_threshold": R["threshold"]["high"],
                 "background_mean": bg_mean, "version": "2.2",
                 "trained_on": "Nazario + fraud scams + synthetic campus lures vs SpamAssassin/Enron/CEAS/Ling ham + synthetic campus notices",
                 "created": time.strftime("%Y-%m-%d")}, MODELS / "campusguard_message_model.joblib", compress=3)
    joblib.dump({"model": umod, "kind": best_url, "features": URL_MODEL_FEATURES, "exported": exported,
                 "threshold": ures[best_url]["threshold"], "trained_on": "PhishTank vs ISCX/DMOZ benign"},
                MODELS / "campusguard_url_model.joblib", compress=3)
    te[["text", "sender", "label", "source"]].to_pickle(PROC / "test_set.pkl")
    R["train_seconds"] = round(time.time() - t0)
    (REPORTS / "metrics_v2.json").write_text(json.dumps(R, indent=2))
    print("Saved. selected:", R["selected_model"], "threshold:", R["threshold"], "url:", best_url)


if __name__ == "__main__":
    main()
