"""Export the trained models + every regex/config the engine needs into one JSON bundle so
the browser (web app + extension) runs the *same* model locally. Nothing leaves the device.

Writes:
  web/model/campusguard-model.json   (fetched by the server-hosted web app)
  web/model/campusguard-model.js     (window.CG_MODEL = {...}; for file:// use and the extension)
  extension/model/campusguard-model.js
"""
from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

import joblib

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from campusguard import features as F  # noqa: E402
from campusguard import preprocess as P  # noqa: E402
from campusguard import predict as PR  # noqa: E402
from campusguard.model import TOKEN_SRC  # noqa: E402


def main():
    m = joblib.load(ROOT / "models" / "campusguard_message_model.joblib")
    u = joblib.load(ROOT / "models" / "campusguard_url_model.joblib")
    vec, clf = m["vectorizer"], m["model"]
    vocab = vec.tfidf.vocabulary_
    terms = [None] * len(vocab)
    for t, i in vocab.items():
        terms[i] = t
    n_words = len(terms)
    coef = clf.coef_.ravel().tolist()
    bundle = {
        "version": m.get("version", "2.0"),
        "created": m.get("created"),
        "message_model": {
            "terms": terms,
            "idf": vec.tfidf.idf_.tolist(),
            "coef": coef,
            "intercept": float(clf.intercept_[0]),
            "mean": m["background_mean"].tolist(),
            "n_words": n_words,
            "engineered": list(F.ENGINEERED_NAMES),
            "eng_scale": vec.scaler.scale_.tolist(),
            "eng_weight": vec.engineered_weight,
            "token_src": TOKEN_SRC,
            "threshold": m["threshold"],
            "high_threshold": m["high_threshold"],
        },
        "url_model": {**u["exported"], "features": u["features"], "threshold": u["threshold"],
                      "labels": F.URL_MODEL_LABELS},
        "patterns": P.PATTERNS,
        "entities": P.ENTITIES,
        "text_flags": [{"name": n, "label": l, "why": w, "patterns": p} for n, l, w, p in F.TEXT_FLAGS],
        "negated_flags": F.NEGATED_FLAGS,
        "negation_src": F.NEGATION_SRC,
        "meta": {**{k: list(v) for k, v in F.URL_FLAG_META.items()},
                 **{k: list(v) for k, v in F.OTHER_META.items()},
                 **{k: list(v) for k, v in F.SENDER_RULE_META.items()}},
        "config": {
            "trusted_campus_domains": F.TRUSTED_CAMPUS_DOMAINS,
            "campus_names": F.CAMPUS_NAMES,
            "trusted_brands": F.TRUSTED_BRANDS,
            "free_mail": F.FREE_MAIL,
            "shorteners": F.SHORTENERS,
            "suspicious_tlds": F.SUSPICIOUS_TLDS,
            "sensitive_url_words": F.SENSITIVE_URL_WORDS,
            "homoglyph": F.HOMOGLYPH,
            "official_local_words": F.OFFICIAL_LOCAL_WORDS,
            "lookalike_keywords": F.LOOKALIKE_KEYWORDS,
        },
        "infer": {
            "actions": PR.ACTIONS, "default_action": PR.DEFAULT_ACTION, "safe_action": PR.SAFE_ACTION,
            "floor_medium": sorted(PR.FLOOR_MEDIUM), "sender_pull": PR.SENDER_PULL,
            "struct_floor": PR.STRUCT_FLOOR, "trusted_sender_discount": PR.TRUSTED_SENDER_DISCOUNT,
            "risky_request_flags": PR.RISKY_REQUEST_FLAGS, "max_urls": PR.MAX_URLS, "verdicts": PR.VERDICTS,
            "placeholders": sorted(["urltoken", "emailtoken", "moneytoken", "0"]),
        },
        "psl": json.loads((ROOT / "campusguard" / "psl_rules.json").read_text()),
    }
    out_dir = ROOT / "web" / "model"
    out_dir.mkdir(parents=True, exist_ok=True)
    js = json.dumps(bundle, separators=(",", ":"), ensure_ascii=True)
    (out_dir / "campusguard-model.json").write_text(js)
    (out_dir / "campusguard-model.js").write_text("self.CG_MODEL=" + js + ";\n")
    ext = ROOT / "extension" / "model"
    ext.mkdir(parents=True, exist_ok=True)
    shutil.copy(out_dir / "campusguard-model.js", ext / "campusguard-model.js")
    print(f"exported {len(js)/1e6:.2f} MB, {n_words} terms, {len(bundle['url_model']['trees'])} URL trees")


if __name__ == "__main__":
    main()
