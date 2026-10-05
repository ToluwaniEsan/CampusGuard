"""Tiny Public Suffix List splitter (ICANN section only).

Replaces tldextract so the Python model and the in-browser JavaScript engine split
domains with byte-for-byte the same rules (the JS engine loads psl_rules.json).
"""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

RULES_PATH = Path(__file__).resolve().parent / "psl_rules.json"


def build_rules_file():
    """One-off: extract ICANN rules from the tldextract snapshot into psl_rules.json."""
    import tldextract
    snap = Path(tldextract.__file__).parent / ".tld_set_snapshot"
    text = snap.read_text(encoding="utf-8")
    text = text[: text.find("===END ICANN DOMAINS===")]
    rules = []
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("//"):
            continue
        rules.append(line.split()[0].lower())
    RULES_PATH.write_text(json.dumps(sorted(set(rules)), ensure_ascii=False))
    return len(rules)


@lru_cache(maxsize=1)
def _rules():
    rules = json.loads(RULES_PATH.read_text(encoding="utf-8"))
    normal, wild, exc = set(), set(), set()
    for r in rules:
        if r.startswith("!"):
            exc.add(r[1:])
        elif r.startswith("*."):
            wild.add(r[2:])
        else:
            normal.add(r)
    return normal, wild, exc


def split_host(host: str):
    """Return (subdomain, domain, suffix). Unknown TLDs fall back to the last label."""
    host = (host or "").strip(".").lower()
    if not host:
        return "", "", ""
    labels = host.split(".")
    normal, wild, exc = _rules()
    suffix_len = 0
    for i in range(len(labels)):
        cand = ".".join(labels[i:])
        if cand in exc:
            suffix_len = len(labels) - i - 1
            break
        if cand in normal:
            suffix_len = len(labels) - i
            break
        parent = ".".join(labels[i + 1:])
        if parent and parent in wild:
            suffix_len = len(labels) - i
            break
    if suffix_len == 0:          # not on the list: treat last label as suffix
        suffix_len = 1 if len(labels) > 1 else 0
    if suffix_len >= len(labels):
        return "", "", ".".join(labels)
    suffix = ".".join(labels[len(labels) - suffix_len:]) if suffix_len else ""
    domain = labels[len(labels) - suffix_len - 1]
    sub = ".".join(labels[: len(labels) - suffix_len - 1])
    return sub, domain, suffix


if __name__ == "__main__":
    print(build_rules_file(), "rules written")
    for h in ["a.b.aamu-support.co.uk", "aamu.edu", "x.y.github.io", "192.168.0.1", "foo.unknowntld", "bbc.co.uk"]:
        print(h, split_host(h))
