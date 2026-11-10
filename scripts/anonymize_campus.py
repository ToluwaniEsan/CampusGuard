"""Anonymise real AAMU emails before they leave the IT office (improvement 3).

Run this ON THE MACHINE THAT HOLDS THE REAL EMAILS, then share only the output file.

Input:  a folder of .eml files, or a .jsonl file with {"text", "sender", "subject"?, "label"} rows
        (label 1 = reported phishing, 0 = genuine campus mail).
Output: data/campus_real/campus_real.jsonl with {"id", "label", "sender", "text"} rows in which
        names, email addresses, phone numbers, student IDs and other numbers are replaced with
        placeholders. Sender domains are kept (they matter for the sender check); the mailbox
        part of each address is replaced.

    python3 scripts/anonymize_campus.py path/to/reported_phish --label 1
    python3 scripts/anonymize_campus.py path/to/campus_notices --label 0
    python3 scripts/anonymize_campus.py rows.jsonl

Nothing is uploaded anywhere. Review a sample of the output by hand before sharing it: no
automatic tool catches every name.
"""
from __future__ import annotations

import argparse
import email
import json
import re
import sys
from email import policy
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "campus_real" / "campus_real.jsonl"

EMAIL = re.compile(r"\b([a-z0-9._%+-]+)@([a-z0-9.-]+\.[a-z]{2,})\b", re.I)
PHONE = re.compile(r"(?:\+?1[\s.-]?)?\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b")
STUDENT_ID = re.compile(r"\b[A-Z]?\d{7,9}\b")                 # AAMU-style ID numbers and similar
SSN = re.compile(r"\b\d{3}-\d{2}-\d{4}\b")
CARD = re.compile(r"\b(?:\d[ -]?){13,19}\b")
GREETING = re.compile(r"\b(Dear|Hi|Hello|Hey|Good (?:morning|afternoon|evening))\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)", re.M)
SIGNOFF = re.compile(r"(\n\s*(?:Thanks|Thank you|Regards|Best|Sincerely|Cheers)[,!.]?\s*\n\s*)([A-Z][a-z]+(?:\s+[A-Z][a-z.]+){0,2})")
DISPLAY = re.compile(r'^\s*"?([^"<]*?)"?\s*<')


def scrub(text: str, extra_names: list[str]) -> str:
    t = SSN.sub("[SSN]", text)
    t = CARD.sub("[CARD]", t)
    t = EMAIL.sub(lambda m: "person@" + m.group(2).lower(), t)
    t = PHONE.sub("[PHONE]", t)
    t = STUDENT_ID.sub("[ID]", t)
    t = GREETING.sub(lambda m: m.group(1) + " [NAME]", t)
    t = SIGNOFF.sub(lambda m: m.group(1) + "[NAME]", t)
    for n in sorted({x for x in extra_names if len(x) >= 3}, key=len, reverse=True):
        t = re.sub(r"\b" + re.escape(n) + r"\b", "[NAME]", t, flags=re.I)
    return t


def scrub_sender(sender: str) -> tuple[str, list[str]]:
    if not sender:
        return "", []
    m = EMAIL.search(sender)
    dm = DISPLAY.match(sender)
    display = dm.group(1).strip() if dm else ""
    names = [p for p in re.split(r"[\s,.]+", display) if p[:1].isupper()]
    # keep office-style display names ("Financial Aid Office"); hide personal ones
    office = re.search(r"office|aid|services|support|desk|registrar|bursar|team|university|department|admin", display, re.I)
    shown = display if office else ("[NAME]" if display else "")
    addr = f"person@{m.group(2).lower()}" if m else ""
    out = f"{shown} <{addr}>" if shown and addr else (addr or shown)
    return out, ([] if office else names)


def read_eml(p: Path) -> dict:
    msg = email.message_from_bytes(p.read_bytes(), policy=policy.default)
    body = msg.get_body(preferencelist=("plain", "html"))
    text = body.get_content() if body else ""
    return {"sender": str(msg.get("From", "")), "subject": str(msg.get("Subject", "")), "text": text}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("source", help="folder of .eml files or a .jsonl file")
    ap.add_argument("--label", type=int, choices=[0, 1], help="label for every message in a folder")
    ap.add_argument("--append", action="store_true", help="add to the existing output instead of replacing it")
    a = ap.parse_args()
    src = Path(a.source)
    if src.is_dir():
        if a.label is None:
            sys.exit("--label is required for a folder")
        rows = [{**read_eml(p), "label": a.label} for p in sorted(src.glob("*.eml"))]
    else:
        rows = [json.loads(l) for l in src.read_text().splitlines() if l.strip()]
    OUT.parent.mkdir(parents=True, exist_ok=True)
    start = 0
    if a.append and OUT.exists():
        start = sum(1 for _ in OUT.open())
    with OUT.open("a" if a.append else "w") as f:
        for i, r in enumerate(rows, start=start):
            sender, names = scrub_sender(r.get("sender", ""))
            body = ((r.get("subject") or "") + "\n" + (r.get("text") or "")).strip()
            f.write(json.dumps({"id": f"R{i:04d}", "label": int(r["label"]), "sender": sender,
                                "text": scrub(body, names)}, ensure_ascii=False) + "\n")
    print(f"wrote {len(rows)} anonymised messages to {OUT}. Review a sample by hand before sharing.")


if __name__ == "__main__":
    main()
