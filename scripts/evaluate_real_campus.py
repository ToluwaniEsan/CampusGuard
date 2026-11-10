"""Evaluate CampusGuard on real, anonymised AAMU mail (improvement 3).

Reads data/campus_real/campus_real.jsonl (made by scripts/anonymize_campus.py). The messages
are used ONLY as a test set: they are never added to training, so the numbers here are an
honest measure of how CampusGuard does on our own students' mail.

Writes reports/campus_real_results.json with recall, false-alarm rate, every miss and every
false alarm, so the team can read why each one happened.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from campusguard.predict import CampusGuard  # noqa: E402

SRC = ROOT / "data" / "campus_real" / "campus_real.jsonl"


def main():
    if not SRC.exists():
        print(f"No real campus data yet ({SRC} not found). Run scripts/anonymize_campus.py first.")
        return
    cg = CampusGuard()
    rows = [json.loads(l) for l in SRC.open() if l.strip()]
    tp = fn = fp = tn = 0
    misses, alarms = [], []
    for r in rows:
        o = cg.analyze(r["text"], r.get("sender"))
        flagged = o["risk_level"] != "low"
        y = int(r["label"])
        tp += flagged and y == 1
        fn += (not flagged) and y == 1
        fp += flagged and y == 0
        tn += (not flagged) and y == 0
        item = {"id": r["id"], "verdict": o["verdict"], "risk": o["risk_score"],
                "flags": [f["label"] for f in o["red_flags"][:4]], "explanation": o["explanation"]}
        if y == 1 and not flagged:
            misses.append(item)
        if y == 0 and flagged:
            alarms.append(item)
    summary = {"n": len(rows), "scams": tp + fn, "genuine": fp + tn,
               "recall": round(tp / max(tp + fn, 1), 4), "false_alarm_rate": round(fp / max(fp + tn, 1), 4),
               "scams_caught": f"{tp}/{tp + fn}", "genuine_flagged": f"{fp}/{fp + tn}"}
    out = ROOT / "reports" / "campus_real_results.json"
    out.write_text(json.dumps({"summary": summary, "missed_scams": misses, "false_alarms": alarms}, indent=2))
    print(json.dumps(summary, indent=2))
    print(f"details in {out}")


if __name__ == "__main__":
    main()
