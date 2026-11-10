"""Text cleaning shared by training and inference (Python AND the JavaScript engine).

Deck: "Preprocessing strips headers & source-specific names to prevent dataset leakage."
Every regex lives in PATTERNS as a plain source string so `scripts/export_js.py` can
ship the exact same patterns to the browser. Python compiles them with re.ASCII so
\\b, \\w, \\s behave like JavaScript's.
"""
from __future__ import annotations

import re
import unicodedata

# name -> (pattern source, flags)  flags: i = ignore case, m = multiline
PATTERNS = {
    # unicode spaces -> space, zero-width characters removed (phishers use them to split words)
    "zero_width": (r"[​-‍⁠﻿­]", ""),
    "uni_space": (r"[   -     　\t\r\f\v]", ""),
    # letters split by single spaces/dots/dashes to dodge filters: "V e r i f y" -> "Verify" (4+ letters)
    "spaced_word": (r"(?<![A-Za-z0-9])[A-Za-z]([ .\-_*])[A-Za-z](?:\1[A-Za-z]){2,}(?![A-Za-z0-9])", ""),
    "non_letter": (r"[^A-Za-z]", ""),
    # digits used as letters inside a word: passw0rd, acc0unt, l0gin (detection copy only)
    "leet": (r"(?<=[A-Za-z])[01345](?=[A-Za-z])", ""),
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


# --------------------------------------------------------------------- folding (v2.3)
# Look-alike letters from other alphabets (Cyrillic, Greek) and accented Latin letters are
# mapped to plain ASCII one character at a time, so offsets never move. The browser engine
# receives this exact table, so both engines fold identically.
HOMOGLYPH_LETTERS = {
    "\u0430": "a", "\u0435": "e", "\u043e": "o", "\u0440": "p", "\u0441": "c", "\u0443": "y", "\u0445": "x",
    "\u0456": "i", "\u0455": "s", "\u0458": "j", "\u0501": "d", "\u04bb": "h", "\u043a": "k", "\u043c": "m",
    "\u0442": "t", "\u0432": "b", "\u043d": "h", "\u0410": "A", "\u0415": "E", "\u041e": "O", "\u0420": "P",
    "\u0421": "C", "\u0425": "X", "\u0406": "I", "\u0405": "S", "\u0408": "J", "\u041a": "K", "\u041c": "M",
    "\u0422": "T", "\u0412": "B", "\u041d": "H", "\u03bf": "o", "\u03b1": "a", "\u03bd": "v", "\u03c1": "p",
    "\u03b9": "i", "\u03ba": "k", "\u03c4": "t", "\u0399": "I", "\u039f": "O", "\u0391": "A", "\u0392": "B",
    "\u0395": "E", "\u0397": "H", "\u039a": "K", "\u039c": "M", "\u039d": "N", "\u03a1": "P", "\u03a4": "T",
    "\u03a7": "X", "\u0261": "g", "\u0131": "i",
}


def _build_fold():
    m = dict(HOMOGLYPH_LETTERS)
    for cp in range(0xC0, 0x250):
        c = chr(cp)
        base = "".join(ch for ch in unicodedata.normalize("NFKD", c) if not unicodedata.combining(ch))
        if len(base) == 1 and base.isascii() and base.isalpha():
            m[c] = base
    m["\u00df"] = "s"     # sharp s: one char in, one char out
    return m


FOLD = _build_fold()
LEET = {"0": "o", "1": "i", "3": "e", "4": "a", "5": "s"}


def fold_text(text: str) -> str:
    """Detection copy of the text: same length, plain ASCII letters, in-word digits read as letters."""
    t = "".join(FOLD.get(c, c) for c in text)
    return RX["leet"].sub(lambda m: LEET[m.group(0)], t)


def _unspace(m):
    return RX["non_letter"].sub("", m.group(0))


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
    t = RX["spaced_word"].sub(_unspace, t)
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
    t = fold_text(t)
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
