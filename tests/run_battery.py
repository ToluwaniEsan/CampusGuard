"""Independent realistic battery (hand-written modern scams + tricky legit mail)."""
import json, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]; sys.path.insert(0, str(ROOT))
from campusguard.predict import CampusGuard
cg = CampusGuard()
name = sys.argv[1] if len(sys.argv) > 1 else "realistic_battery"
rows = [json.loads(l) for l in open(ROOT / f"tests/{name}.jsonl") if l.strip()]
res, tp, fn, fp, tn = [], 0, 0, 0, 0
for r in rows:
    o = cg.analyze(r["text"], r.get("sender"))
    flagged = o["risk_level"] != "low"
    tp += flagged and r["label"] == 1; fn += (not flagged) and r["label"] == 1
    fp += flagged and r["label"] == 0; tn += (not flagged) and r["label"] == 0
    res.append({"id": r["id"], "kind": r["kind"], "label": r["label"], "verdict": o["verdict"], "risk": o["risk_score"],
                "msg": o["message_model_score"], "top_flags": [f["label"] for f in o["red_flags"][:4]], "explanation": o["explanation"]})
summ = {"scams_caught": f"{tp}/{tp+fn}", "legit_flagged": f"{fp}/{fp+tn}"}
(ROOT / f"reports/{name}_results.json").write_text(json.dumps({"summary": summ, "rows": res}, indent=2))
print(summ)
for x in res:
    ok = (x["verdict"] != "Likely Safe") == (x["label"] == 1)
    print(("  " if ok else "XX"), x["id"], f'{x["kind"]:<24}', f'{x["verdict"]:<12}', f'{x["risk"]:.2f} msg={x["msg"] if x["msg"] is None else round(x["msg"],2)}', "|", "; ".join(x["top_flags"])[:110])
