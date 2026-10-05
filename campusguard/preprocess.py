"""Text cleaning shared by training and inference (Python AND the JavaScript engine).

Deck: "Preprocessing strips headers & source-specific names to prevent dataset leakage."
Every regex lives in PATTERNS as a plain source string so `scripts/export_js.py` can
ship the exact same patterns to the browser. Python compiles them with re.ASCII so
\\b, \\w, \\s behave like JavaScript's.
"""
from __future__ import annotations

import re

# name -> (pattern source, flags)  flags: i = ignore case, m = multiline
PATTERNS = {
    # unicode spaces -> space, zero-width characters removed (phishers use them to split words)
    "zero_width": (r"[​-‍⁠﻿­]", ""),
    "uni_space": (r"[   -     　\t\r\f\v]", ""),
    "script_style": (r"<(script|style)[^>]*>[\s\S]*?</(script|style)>", "i"),
    "tag": (r"<[^>]{1,500}>", ""),
    "header_line": (r"^(?:return-path|received|x-[\w-]+|message-id|content-[\w-]+|mime-version|"
                    r"delivered-to|envelope-to|dkim-signature|authentication-results|status|"
                    r"in-reply-to|references|thread-index|thread-topic|importance|precedence|"
                    r"list-[\w-]+|errors-to|sender|reply-to|cc|bcc|to|from|date|subject)[ ]*:[^\n]{0,300}$", "im"),
    "header_token": (r"\b(?:return-path|received|x-[a-z-]+|message-id|content-transfer-encoding|"
                     r"content-type|mime-version|delivered-to|dkim-signature|x-original-to)[ ]*:", "i"),
    "footer": (r"_{10,}[\s\S]*$", ""),
    "apos_split": (r"(\w)[ \n]+'[ \n]*(s|t|re|ve|ll|d|m)\b", "i"),
    "space_before_punct": (r"[ \n]+([.,!?;:%)\]'])", ""),
    "space_after_punct": (r"([(\[$])[ \n]+", ""),
    "multi_space": (r"[ ]{2,}", ""),
    "multi_newline": (r"\n[ \n]*\n", ""),
    "url": (r"\b(?:(?:https?://|hxxps?://|www\.)[^\s<>\"')\]]+|"
            r"(?:[a-z0-9-]+\.)+(?:com|net|org|edu|gov|mil|info|biz|io|co|ru|cn|xyz|top|online|site|club|live|me|"
            r"us|uk|tk|ml|ga|cf|gq|ly|gl|gd|to|cc|ws|su|pw|icu|app|dev|ai|tv|ng|in|de|fr|ca|au|br|shop|store|"
            r"link|click|work|support|help|cloud|page|digital|services|today|vip|buzz|rest|fit|monster|ac|ms)"
            r"(?:/[^\s<>\"')\]]*)?)", "i"),
    "email": (r"\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b", "i"),
    "source_names": (r"\b(?:jose|monkey\.org|monkey|nazario|enron|ect|hou|hpl|kaminski|vince|corp|"
                     r"spamassassin|exmh|razor|sourceforge|zzzz|geocrawler|fork|xent|lockergnome|freshrpms|"
                     r"rpm-list|ilug|linux\.ie|spambayes|python-dev|ceas|linguist)\b", "i"),
    "money": (r"\$[ ]?\d[\d,]*(?:\.\d+)?", ""),
    "digits": (r"\d+", ""),
    "non_ascii": (r"[^\x00-\x7f]+", ""),
    "whitespace": (r"\s+", ""),
}


def _compile(src, flags):
    f = re.A
    if "i" in flags:
        f |= re.I
    if "m" in flags:
        f |= re.M
    return re.compile(src, f)


RX = {k: _compile(*v) for k, v in PATTERNS.items()}
URL_RE = RX["url"]
EMAIL_RE = RX["email"]

# Minimal, explicit entity table (the JS engine uses the identical table)
ENTITIES = {"amp": "&", "lt": "<", "gt": ">", "quot": '"', "apos": "'", "nbsp": " ", "#39": "'",
            "ndash": "-", "mdash": "-", "rsquo": "'", "lsquo": "'", "rdquo": '"', "ldquo": '"',
            "hellip": "...", "copy": "(c)", "reg": "(r)", "trade": "(tm)", "bull": "*", "middot": "*"}
ENTITY_RE = re.compile(r"&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z0-9]{2,8});", re.I | re.A)


def unescape(text: str) -> str:
    def rep(m):
        e = m.group(1)
        el = e.lower()
        if el.startswith("#x"):
            try:
                return chr(int(el[2:], 16))
            except ValueError:
                return m.group(0)
        if el.startswith("#"):
            try:
                return chr(int(el[1:]))
            except ValueError:
                return m.group(0)
        return ENTITIES.get(el, m.group(0))
    return ENTITY_RE.sub(rep, text)


def normalise_raw(text: str) -> str:
    """Keeps URLs/emails/case intact; used before red-flag extraction and for display."""
    if not isinstance(text, str):
        return ""
    t = text.replace("\r\n", "\n")
    t = RX["script_style"].sub(" ", t)
    t = RX["tag"].sub(" ", t)
    t = unescape(t)
    t = RX["zero_width"].sub("", t)
    t = RX["uni_space"].sub(" ", t)
    t = RX["header_line"].sub(" ", t)
    t = RX["header_token"].sub(" ", t)
    t = RX["footer"].sub(" ", t)
    t = RX["apos_split"].sub(r"\1'\2", t)
    t = RX["space_before_punct"].sub(r"\1", t)
    t = RX["space_after_punct"].sub(r"\1", t)
    t = RX["multi_space"].sub(" ", t)
    t = RX["multi_newline"].sub("\n\n", t)
    return t.strip()


def clean_for_tfidf(text: str, already_normalised: bool = False) -> str:
    """Bag-of-words view: placeholders for URLs, emails, money, numbers; corpus names removed."""
    t = text if already_normalised else normalise_raw(text)
    t = RX["email"].sub(" emailtoken ", t)
    t = RX["url"].sub(" urltoken ", t)
    t = RX["source_names"].sub(" ", t)
    t = RX["money"].sub(" moneytoken ", t)
    t = RX["digits"].sub(" 0 ", t)
    t = RX["non_ascii"].sub(" ", t)
    t = RX["whitespace"].sub(" ", t.lower())
    return t.strip()


def combine_subject_body(subject, body) -> str:
    subject = subject if isinstance(subject, str) else ""
    body = body if isinstance(body, str) else ""
    return (subject + "\n" + body).strip()
