"""The From line may nudge the content score but never outweigh it (v2.2)."""
import json, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]; sys.path.insert(0, str(ROOT))
from campusguard.predict import CampusGuard, SENDER_PULL, TRUSTED_SENDER_DISCOUNT
cg = CampusGuard()
HACK = "Dear Student, your account will be suspended today. Reply with your username and password to keep access. IT Help Desk"
CLEAN = "Hi all, the lab report is due Friday at midnight on Canvas. Office hours are Thursday 1-3pm. See you in class."
fails = 0
def check(name, cond, info=""):
    global fails
    print(("PASS " if cond else "FAIL ") + name, info); fails += (not cond)

r = cg.analyze(HACK, "IT Help Desk <helpdesk@aamu.edu>")
check("hacked aamu.edu account asking for a password is not Likely Safe", r["risk_level"] != "low", f'{r["verdict"]} {r["risk_score"]}')
check("...and is flagged as a risky request from an official address", any(f["flag"] == "sender_trusted_risky_request" for f in r["red_flags"]))
check("...and gets no discount", r["risk_score"] == r["content_score"])
r = cg.analyze(CLEAN, "Dr. Reed <reed@aamu-support.com>")
check("clean content + lookalike sender: sender flagged", any(f["flag"] == "sender_lookalike" for f in r["red_flags"]))
check("...but the content still leads (stays Likely Safe)", r["risk_level"] == "low", f'{r["content_score"]} -> {r["risk_score"]}')
r = cg.analyze(CLEAN, "Dr. Reed <reed@aamu.edu>")
check("official sender discount is at most 25%", r["risk_score"] >= r["content_score"] * (1 - TRUSTED_SENDER_DISCOUNT) - 1e-4, f'{r["content_score"]} -> {r["risk_score"]}')
# every battery message: the sender's effect stays within its bound
worst = 0.0
for f in ["realistic_battery", "blind_battery"]:
    for l in open(ROOT / f"tests/{f}.jsonl"):
        x = json.loads(l); o = cg.analyze(x["text"], x.get("sender"))
        if o["input_type"] != "message": continue
        c, fr = o["content_score"], o["risk_score"]
        bound = max(SENDER_PULL.values()) * (1 - c) if fr >= c else TRUSTED_SENDER_DISCOUNT * c
        worst = max(worst, abs(fr - c) - bound)
check("sender effect within bounds on all 85 battery messages", worst <= 1e-3, f"max overshoot {worst:.4f}")
sys.exit(1 if fails else 0)
