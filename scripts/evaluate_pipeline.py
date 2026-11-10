"""End-to-end evaluation of the deployed pipeline (v2.3).

scripts/train.py scores the message model on its own. Students see the full pipeline: the model,
the link model, the rules (dangerous-link floor, request floor) and the sender check. This script
runs CampusGuard.analyze() exactly as the app does on:
  * the held-out test set
  * 1,000 unseen legitimate messages from each real ham source (never used in training)
Writes reports/pipeline_eval.json.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from campusguard.predict import CampusGuard  # noqa: E402

HAM = ["spamassassin_ham", "enron_ham", "ceas_ham", "ling_ham", "sms_ham"]


def flagged(cg, text, sender):
    return cg.analyze(text, sender if isinstance(sender, str) else None)["risk_level"] != "low"


def main():
    cg = CampusGuard()
    te = pd.read_pickle(ROOT / "data/processed/test_set.pkl")
    pred = [flagged(cg, t, s) for t, s in zip(te.text, te.sender)]
    y = te.label.values
    tp = sum(p and l == 1 for p, l in zip(pred, y)); fn = sum((not p) and l == 1 for p, l in zip(pred, y))
    fp = sum(p and l == 0 for p, l in zip(pred, y)); tn = sum((not p) and l == 0 for p, l in zip(pred, y))
    out = {"held_out_test": {"n": len(te), "recall": round(tp / (tp + fn), 4), "false_alarm_rate": round(fp / (fp + tn), 4),
                             "f1": round(2 * tp / (2 * tp + fp + fn), 4)}}
    pool = pd.read_pickle(ROOT / "data/processed/email_pool.pkl")
    corp = pd.read_pickle(ROOT / "data/processed/email_corpus_v2.pkl")
    unseen = pool[~pool.clean.isin(corp.clean)]
    out["unseen_legit_false_alarms"] = {}
    for s in HAM:
        u = unseen[unseen.source == s].sample(min(1000, (unseen.source == s).sum()), random_state=42)
        f = sum(flagged(cg, t, sd) for t, sd in zip(u.text, u.sender))
        out["unseen_legit_false_alarms"][s] = {"n": len(u), "false_alarm_rate": round(f / len(u), 4)}
    (ROOT / "reports" / "pipeline_eval.json").write_text(json.dumps(out, indent=2))
    print(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()
