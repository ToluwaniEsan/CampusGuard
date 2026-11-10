"""v2.3 regression cases: every failure named in the improvements report stays fixed.
Each case says the lowest (or highest) verdict it may get and, for some, a red flag that must
(or must not) appear. Run after every retrain."""
import json, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]; sys.path.insert(0, str(ROOT))
from campusguard.predict import CampusGuard
cg = CampusGuard()
ORDER = {"low": 0, "medium": 1, "high": 2}
bad = 0
rows = [json.loads(l) for l in open(ROOT / "tests" / "regression_cases.jsonl") if l.strip()]
for c in rows:
    r = cg.analyze(c["text"], c.get("sender"))
    lv, fl = r["risk_level"], [f["flag"] for f in r["red_flags"]]
    ok = not ("min_level" in c and ORDER[lv] < ORDER[c["min_level"]]) and not ("max_level" in c and ORDER[lv] > ORDER[c["max_level"]]) \
        and not ("need_flag" in c and c["need_flag"] not in fl) and not ("no_flag" in c and c["no_flag"] in fl)
    bad += not ok
    print("PASS" if ok else "FAIL", f'{c["id"]:<20} {r["verdict"]:<12} {r["risk_score"]:.2f}', ", ".join(fl[:4]))
print(f"regression: {len(rows) - bad}/{len(rows)} pass")
sys.exit(1 if bad else 0)
