"""Manual-review set (deck: '25+ flagged messages reviewed to verify explanations name
real warning signs'). Runs CampusGuard on 30 campus-style messages (15 phishing written
from the lures on slide 2 and the real job-scam screenshot on slide 13, 15 legitimate)
and writes a review sheet with verdicts, flags and explanations.

NOTE: these messages are synthetic, written for evaluation only. They are a sanity check
of campus fit, not a substitute for real campus data (see Next Steps: 'Expand Data').
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from campusguard.predict import CampusGuard  # noqa: E402

cg = CampusGuard()
rows = [json.loads(l) for l in open(ROOT / "data" / "campus_eval" / "campus_synthetic.jsonl")]
out, tp, fp, tn, fn, lat = [], 0, 0, 0, 0, []
for r in rows:
    res = cg.analyze(r["text"], r["sender"])
    flagged = res["risk_level"] in ("high", "medium")
    tp += flagged and r["label"] == 1
    fn += (not flagged) and r["label"] == 1
    fp += flagged and r["label"] == 0
    tn += (not flagged) and r["label"] == 0
    lat.append(res["latency_ms"])
    out.append({"id": r["id"], "label": r["label"], "lure": r["lure"], "verdict": res["verdict"],
                "risk": res["risk_score"], "msg_score": res["message_model_score"],
                "flags": [f"{f['label']} [{f['severity']}] {f['evidence'][:3]}" for f in res["red_flags"][:5]],
                "explanation": res["explanation"]})
summary = {"n": len(rows), "flagged_phishing(recall)": f"{tp}/{tp+fn}", "flagged_legit(false_pos)": f"{fp}/{fp+tn}",
           "max_latency_ms": max(lat), "median_latency_ms": sorted(lat)[len(lat)//2]}
(ROOT / "reports" / "campus_manual_review.json").write_text(json.dumps({"summary": summary, "rows": out}, indent=2))
print(json.dumps(summary, indent=2))
for o in out:
    print(f"{o['id']} y={o['label']} {o['verdict']:<12} risk={o['risk']:.2f} msg={o['msg_score']:.2f} | {o['explanation'][:170]}")
