"""Python reference vs JavaScript engine on the same inputs. Must agree on every verdict."""
import json, subprocess, sys, random
from pathlib import Path
import pandas as pd
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from campusguard.predict import CampusGuard

random.seed(0)
inputs = []
te = pd.read_pickle(ROOT / "data/processed/test_set.pkl")
for _, r in te.sample(min(500, len(te)), random_state=1).iterrows():
    inputs.append({"text": r.text, "sender": r.sender if isinstance(r.sender, str) else None})
urls = pd.read_pickle(ROOT / "data/processed/urls_balanced.pkl").url.sample(300, random_state=1)
inputs += [{"text": u, "sender": None} for u in urls]
for f in ["data/campus_eval/campus_synthetic.jsonl", "tests/realistic_battery.jsonl", "tests/blind_battery.jsonl"]:
    p = ROOT / f
    if p.exists():
        inputs += [{"text": json.loads(l)["text"], "sender": json.loads(l).get("sender")} for l in open(p) if l.strip()]
inputs += [{"text": t, "sender": s} for t, s in [
    ("", None), ("hello", None), ("Café résumé &amp; naïve &#8217; &nbsp;​pass​word", None),
    ("<html><body><p>Dear user, <a href='http://1.2.3.4/x'>click</a></p></body></html>", "Help Desk <a@gmail.com>"),
    ("http://xn--pple-43d.com/login", None), ("bit.ly/abc", None), ("aamu.edu", None), ("PAYPAL ACCOUNT LOCKED!!! VERIFY NOW", "PayPal <service@paypa1.com>"),
    ("Reply to j.doe@outlook.com for the job. $500 weekly", None)]]
tmp = ROOT / "tests" / "_in.jsonl"; out = ROOT / "tests" / "_out.jsonl"
tmp.write_text("\n".join(json.dumps(x) for x in inputs))
subprocess.run(["node", str(ROOT / "tests/parity_run.js"), str(tmp), str(out)], check=True)
js = [json.loads(l) for l in out.read_text(encoding="utf-8").split("\n")]
cg = CampusGuard()
bad, maxdiff = 0, 0.0
for x, j in zip(inputs, js):
    p = cg.analyze(x["text"], x["sender"]); p.pop("latency_ms", None)
    d = abs(p["risk_score"] - j["risk_score"]); maxdiff = max(maxdiff, d)
    same = (p["verdict"] == j["verdict"] and d < 1e-3
            and [(f["flag"], f["severity"]) for f in p["red_flags"]] == [(f["flag"], f["severity"]) for f in j["red_flags"]]
            and [(h["start"], h["end"], h["flag"]) for h in p["highlights"]] == [(h["start"], h["end"], h["flag"]) for h in j["highlights"]]
            and p["explanation"] == j["explanation"] and p.get("good_signs") == j.get("good_signs") and p.get("sender_check") == j.get("sender_check") and p["analyzed_text"] == j["analyzed_text"])
    if not same:
        bad += 1
        if bad <= 5:
            print("MISMATCH:", repr(x["text"][:100]))
            for k in ["verdict", "risk_score", "explanation", "analyzed_text"]:
                if p[k] != j[k]: print("  ", k, "\n   PY", repr(p[k])[:300], "\n   JS", repr(j[k])[:300])
            pf=[(f["flag"], f["severity"]) for f in p["red_flags"]]; jf=[(f["flag"], f["severity"]) for f in j["red_flags"]]
            if p.get("sender_check") != j.get("sender_check"): print("   sender PY", p.get("sender_check"), "\n   sender JS", j.get("sender_check"))
            if pf!=jf: print("   flags PY", pf, "\n   flags JS", jf)
            ph=[(h["start"], h["end"], h["flag"]) for h in p["highlights"]]; jh=[(h["start"], h["end"], h["flag"]) for h in j["highlights"]]
            if ph!=jh: print("   hl PY", ph[:12], "\n   hl JS", jh[:12])
print(f"parity: {len(inputs)-bad}/{len(inputs)} identical, max risk diff {maxdiff:.2e}")
tmp.unlink(); out.unlink()
sys.exit(1 if bad else 0)
