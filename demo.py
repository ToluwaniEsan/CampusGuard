"""Quick demo:  python demo.py            (sample message)
               python demo.py "paste text or a URL here" """
import json
import sys
import warnings

warnings.filterwarnings("ignore")
from campusguard.predict import CampusGuard  # noqa: E402

SAMPLE = """URGENT: Verify Your Financial Aid Information
Dear Student,
Your financial aid account requires immediate verification. Click below to prevent your account from being suspended.
Verify Your Account: http://aamu-support.com/finaid/verify-login
AAMU Financial Aid Office"""

text = sys.argv[1] if len(sys.argv) > 1 else SAMPLE
r = CampusGuard().analyze(text)
print(f"\n{r['verdict']}  ({round(r['risk_score']*100)}% risk, {r['latency_ms']} ms)\n")
print(r["explanation"], "\n")
for f in r["red_flags"]:
    print(f"  [{f['severity']}] {f['label']}: {', '.join(map(str, f['evidence'][:3]))}")
print("\nWhat to do:", r["recommended_action"])
print("\nInline highlights:", json.dumps([(h["text"], h["flag"]) for h in r["highlights"]][:10]))
