"""Interpretable features: NLP red-flag detectors + URL structure scoring + sender checks.

Deck slide 5: "NLP classifies text for urgency, credential requests & impersonation" and
"URL scoring by structure: IP-as-domain, lookalike spellings, subdomains".
Every model feature maps 1:1 to a plain-language red flag so SHAP output can be shown to
a student without jargon. URLs are only ever parsed as strings, never fetched.

All regex sources are plain strings so scripts/export_js.py ships identical patterns to
the browser engine (campusguard-engine.js).
"""
from __future__ import annotations

import ipaddress
import math
import re
from collections import Counter
from urllib.parse import urlsplit

from .preprocess import RX, _compile, normalise_raw
from .psl import split_host

# --------------------------------------------------------------------------------------
# Campus configuration (edit per institution)
# --------------------------------------------------------------------------------------
TRUSTED_CAMPUS_DOMAINS = ["aamu.edu"]
CAMPUS_NAMES = ["alabama a&m", "aamu", "alabama a & m"]
TRUSTED_BRANDS = {
    "paypal.com": "paypal", "microsoft.com": "microsoft", "office.com": "office",
    "office365.com": "office365", "outlook.com": "outlook", "live.com": "live",
    "microsoftonline.com": "microsoftonline", "google.com": "google", "gmail.com": "gmail",
    "apple.com": "apple", "icloud.com": "icloud", "amazon.com": "amazon", "netflix.com": "netflix",
    "chase.com": "chase", "wellsfargo.com": "wellsfargo", "bankofamerica.com": "bankofamerica",
    "usaa.com": "usaa", "docusign.com": "docusign", "docusign.net": "docusign", "dropbox.com": "dropbox",
    "studentaid.gov": "studentaid", "fafsa.gov": "fafsa", "ed.gov": "ed", "instructure.com": "instructure",
    "blackboard.com": "blackboard", "joinhandshake.com": "handshake", "dhl.com": "dhl", "fedex.com": "fedex",
    "ups.com": "ups", "usps.com": "usps", "irs.gov": "irs", "adobe.com": "adobe", "linkedin.com": "linkedin",
    "facebook.com": "facebook", "instagram.com": "instagram", "zoom.us": "zoom", "venmo.com": "venmo",
    "zellepay.com": "zelle", "cash.app": "cashapp", "coinbase.com": "coinbase", "steampowered.com": "steam",
    "youtube.com": "youtube", "github.com": "github", "okta.com": "okta", "duosecurity.com": "duosecurity",
    "sharepoint.com": "sharepoint", "onedrive.com": "onedrive", "spotify.com": "spotify", "uber.com": "uber",
    "target.com": "target", "walmart.com": "walmart", "capitalone.com": "capitalone", "discover.com": "discover",
    "t-mobile.com": "t-mobile", "verizon.com": "verizon", "att.com": "att",
}
# extra names that only appear in lookalike domains (the real service lives on another domain)
LOOKALIKE_KEYWORDS = ["canvas-lms", "canvaslms", "bannerweb", "banner-self", "selfservice-aamu", "office365",
                      "outlook365", "webmail-", "-webmail", "icloud-", "appleid", "apple-id", "paypal"]
FREE_MAIL = ["gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "aol.com", "icloud.com", "proton.me",
             "protonmail.com", "mail.com", "gmx.com", "yandex.com", "rediffmail.com", "live.com", "msn.com",
             "ymail.com", "zoho.com"]
SHORTENERS = ["bit.ly", "tinyurl.com", "goo.gl", "t.co", "ow.ly", "is.gd", "buff.ly", "rebrand.ly",
              "cutt.ly", "shorturl.at", "tiny.cc", "rb.gy", "t.ly", "s.id", "bit.do", "lnkd.in", "qrco.de",
              "tinyurl.at", "shorturl.gg", "v.gd", "x.co", "bl.ink", "short.io"]
SUSPICIOUS_TLDS = ["ru", "cn", "tk", "ml", "ga", "cf", "gq", "xyz", "top", "online", "site", "club", "live",
                   "icu", "work", "click", "link", "info", "biz", "buzz", "rest", "fit", "monster", "su", "pw",
                   "cc", "ws", "support", "services", "digital", "today", "vip", "shop", "store", "cfd", "sbs",
                   "lol", "quest", "zip", "mov", "best", "bar", "cam", "loan", "win", "bid", "download"]
SENSITIVE_URL_WORDS = ["login", "log-in", "signin", "sign-in", "verify", "verification", "account", "secure",
                       "update", "confirm", "webscr", "banking", "password", "auth", "validate", "wallet",
                       "billing", "unlock", "suspend", "recover", "support", "portal", "sso", "owa"]

# --------------------------------------------------------------------------------------
# Text red flags: (name, label, why, [regex sources])   -- all case-insensitive
# --------------------------------------------------------------------------------------
TEXT_FLAGS = [
    ("urgency", "Urgent or pressure language", "Scammers rush you so you act before you think.", [
        r"\burgent(ly)?\b", r"\bimmediate(ly)?\b", r"\bas soon as possible\b", r"\basap\b",
        r"\bwithin (24|48|72|twenty[- ]four|forty[- ]eight) ?h(ou)?rs?\b", r"\bwithin \d+ (hours|days|minutes)\b",
        r"\bfinal (notice|warning|reminder|attempt)\b", r"\baction (is )?required\b", r"\bact now\b",
        r"\bexpir(e|es|ed|ing|ation)\b", r"\b(right away|without delay|by end of day|before \d)",
        r"\btime[- ]sensitive\b", r"\blast (chance|warning)\b", r"\bfailure to (comply|verify|respond|update)\b"]),
    ("threat", "Threat of losing access", "Real offices rarely threaten to shut your account by email.", [
        r"\b(will|may|would|shall) be (permanently )?(suspended|terminated|closed|locked|deactivated|disabled|deleted|blocked|cancell?ed|forfeited|withheld)\b",
        r"\b(suspend|terminat|deactivat|disabl|block|lock|restrict)\w*\b.{0,30}\b(account|mailbox|access)\b",
        r"\b(account|mailbox|access)\b.{0,30}\b(suspend|terminat|deactivat|disabl|block|lock|restrict)\w*",
        r"\blose (access|your)\b", r"\bunusual (sign[- ]in|activity|login)\b",
        r"\b(unauthori[sz]ed|suspicious) (access|activity|login|sign[- ]in|transaction)\b",
        r"\bpermanently (deleted|closed|removed|disabled)\b", r"\b(placed )?on hold\b",
        r"\b(aid|disbursement|refund|payment|paycheck|scholarship|enrollment)\b.{0,25}\b(delayed|withheld|on hold|cancell?ed|forfeited)\b",
        r"\bdropped from\b", r"\blegal action\b|\barrest\b|\bwarrant\b"]),
    ("credential_request", "Asks for your password or login",
     "No campus office will ask you to confirm a password through a link or reply.", [
        r"\bpassword\b", r"\b(user ?name|user ?id|login (details|credentials|information))\b",
        r"\bverify (your|the)? ?(account|identity|information|details|email|mailbox)\b",
        r"\bconfirm (your|the)? ?(account|identity|information|details|email|password|credentials)\b",
        r"\b(update|validate|re-?activate|restore|unlock|re-?validate)\s+(your|the)?\s*(account|information|details|mailbox|email|access)\b",
        r"\b(log ?in|sign ?in|log on)\b", r"\bcredentials?\b",
        r"\bmfa code\b|\bverification code\b|\bone[- ]time (code|passcode|password)\b|\b(\d|six|four)[- ]digit (code|number|pin)\b"]),
    ("sensitive_info", "Requests personal or banking details",
     "Requests for SSN, bank or card numbers by email are a classic scam.", [
        r"\bsocial security\b", r"\bssn\b", r"\bbank(ing)? (account|details|information|info)\b",
        r"\brouting number\b", r"\baccount number\b", r"\bcredit card\b", r"\bdebit card\b",
        r"\bcard (number|details)\b", r"\bcvv\b", r"\bdate of birth\b",
        r"\b(driver'?s licen[cs]e|passport|government[- ]issued id|photo id)\b",
        r"\bdirect deposit\b", r"\bgift ?cards?\b", r"\bwire transfer\b", r"\bzelle\b|\bcash ?app\b|\bvenmo\b|\bbitcoin\b|\bcrypto\b"]),
    ("click_cta", "Pushes you to click a link or open a file",
     "The whole message exists to get you to one link or attachment.", [
        r"\bclick (here|below|the link|on the link|this link|the button)\b",
        r"\b(follow|use|visit|open) the (link|url|attachment|document|secure link)\b",
        r"\b(click|tap) (to|and)\b", r"\bopen the attached\b", r"\bdownload the attach",
        r"\bview (document|message|invoice|statement)s?\b", r"\bclick\b", r"\breview (the )?document\b"]),
    ("impersonation", "Claims to be an official office or service",
     "Phishers borrow the name of IT, Financial Aid, banks and big brands.", [
        r"\b(it|technical|tech) (help ?desk|support|department|team|services)\b",
        r"\bhelp ?desk\b", r"\b(system|email|mail|web) ?(administrator|admin|master|team)\b",
        r"\bwebmaster\b", r"\bfinancial aid\b", r"\bbursar\b", r"\bregistrar\b",
        r"\bpayroll\b", r"\bhuman resources\b|\bhr department\b",
        r"\b(security|account|billing|support) (team|department|center|centre)\b",
        r"\bstudent (services|accounts?|affairs)\b", r"\boffice of\b",
        r"\b(paypal|apple|microsoft|office ?365|outlook|netflix|amazon|docusign|usaa|wells fargo|chase|bank of america|irs|fedex|dhl|usps|ups)\b"]),
    ("money_lure", "Too-good-to-be-true money or prize", "Unexpected money, prizes or easy pay are bait.", [
        r"\$ ?\d[\d,]*", r"\b(usd|us\$) ?\d", r"\b(prize|winner|won|lottery|jackpot|reward)\b",
        r"\b(grant|stipend|scholarship|refund|reimbursement|compensation)\b",
        r"\b(million|thousand) (dollars|usd|pounds)\b", r"\b(inheritance|beneficiary|next of kin|fund transfer)\b",
        r"\bfree (money|gift|iphone)\b", r"\b(claim|receive) your\b"]),
    ("job_scam", "Easy remote job offer", "Unsolicited, flexible, high-pay jobs are a top student scam.", [
        r"\bpart[- ]time\b", r"\b(work|working) from home\b", r"\bremote (job|position|work|internship)\b",
        r"\bpersonal assistant\b", r"\bflexible (hours|schedule)\b",
        r"\b(weekly|per week|a week|/week|hourly|per hour)\b.{0,15}\b(pay|salary|\$)",
        r"\$ ?\d+ ?(per|a|/) ?(week|hour|hr)\b", r"\bjob (offer|opportunity)\b",
        r"\b(hiring|recruit(ing|ment)|vacancy|position available)\b", r"\bno experience\b",
        r"\bsend you a (check|cheque)\b", r"\bmystery shopper\b"]),
    ("asks_for_secrets", "Asks you to send passwords, codes or personal info",
     "Legit people and offices never need you to send a password, code, card or ID number in a message.", [
        r"\b(send|reply with|provide|give|enter|submit|share|text|tell me|confirm|forward|type in|input)\b[^.!?\n]{0,40}\b(password|login|log-in|credentials|ssn|social security|bank|card number|cvv|date of birth|student id|id number|username|user name|pin|passcode|verification code|6[- ]digit code|the code|fsa id|routing)\b",
        r"\b(password|login|ssn|bank login|card details|verification code|the code)\b[^.!?\n]{0,25}\b(to me|so (i|we) can|to verify|to confirm|to receive)\b",
        r"\b(code|pin|passcode)\b[^?]{0,90}\b(send|text|give|share|forward|tell|read)\b[^.!?\n]{0,12}\b(it|them|that|the numbers)\b[^.!?\n]{0,12}\b(to me|back|over)\b"]),
    ("upfront_payment", "Asks you to pay first or move money",
     "Paying a fee, buying gift cards or forwarding money to 'unlock' something is how advance-fee scams work.", [
        r"\b(processing|delivery|application|induction|release|redelivery|handling|registration|activation|clearance|shipping|transfer) fee\b",
        r"\b(pay|paying|send|buy|purchase)\b[^.!?\n]{0,30}\b(gift ?cards?|itunes|steam cards?|bitcoin|fee|deposit|fine)\b",
        r"\b(send|return|refund|give) (it|the (money|extra|rest|balance|difference)) back\b|\bsend the (rest|extra|balance|difference)\b",
        r"\b(deposit|cash) (the|this|a) (check|cheque)\b|\bcashier'?s check\b"]),
    ("generic_greeting", "Generic greeting", "Messages from real offices usually use your name.", [
        r"\bdear (user|customer|client|member|student|students|account holder|valued|sir|madam|sir/madam|friend|beneficiary|recipient|email user|webmail user|employee|staff|students and staff)\b",
        r"\bhello (user|customer|dear)\b", r"\bdear [a-z0-9._-]+@", r"\battention ?:"]),
    ("secrecy", "Asks you to keep it secret or reply privately",
     "Legit offices do not ask for secrecy or replies to personal accounts.", [
        r"\b(confidential|strictly private|keep (this|it) (secret|private|between))\b",
        r"\b(reply|respond|send|contact) (to|via|on|me on) (my|this|the) (personal|private|alternative|other) (email|address|number)\b",
        r"\balternative email\b", r"\bpersonal email\b", r"\btext me\b|\bwhatsapp\b|\btelegram\b|\bsignal app\b",
        r"\bare you available\b", r"\bquick favou?r\b"]),
]
TEXT_FLAG_NAMES = [f[0] for f in TEXT_FLAGS]
TEXT_FLAG_RX = {name: [_compile(p, "i") for p in pats] for name, _, _, pats in TEXT_FLAGS}
NEGATED_FLAGS = ["credential_request", "sensitive_info", "asks_for_secrets"]
NEGATION_SRC = r"\b(never|will not|won't|do not|don't|not|no one)\b[^.!?\n]{0,40}\b(ask|share|request|send|give|reply|click)"
NEGATION_RX = _compile(NEGATION_SRC, "i")

URL_FLAG_META = {
    "url_ip_host": ("Link uses a raw IP address", "Real sites use names, not numbers like 192.168.0.1."),
    "url_lookalike": ("Lookalike web address", "The domain imitates a trusted name (e.g. aamu-support.com)."),
    "url_many_subdomains": ("Link hides behind many subdomains", "Long chains like login.aamu.edu.verify.xyz hide the real owner."),
    "url_shortener": ("Shortened link hides the destination", "bit.ly-style links hide where you will land."),
    "url_suspicious_tld": ("Unusual web address ending", "Endings like .xyz, .ru, .top are common in scams."),
    "url_at_or_redirect": ("Link contains tricks (@ or //)", "Characters that make a link go somewhere other than it looks."),
    "url_sensitive_words": ("Link contains login/verify words", "Words like 'secure-login-verify' in a link are a warning sign."),
    "url_non_campus_official": ("Official-sounding message linking off campus", "It claims to be the school but its links go elsewhere."),
}
URL_FLAG_NAMES = list(URL_FLAG_META)
OTHER_META = {
    "sender_freemail_official": ("Official request from a personal email", "Campus offices write from @aamu.edu, not Gmail or Yahoo."),
    "shouting": ("Excessive capitals or exclamation marks", "SHOUTING and !!! are used to create panic."),
    "n_urls": ("Several links", "Bait messages are built around links."),
}
SENDER_RULE_META = {
    "sender_lookalike": ("Sender address imitates a trusted domain", "The From address looks official but isn't (e.g. @aamu-support.com)."),
    "sender_display_mismatch": ("Sender name doesn't match their address", "It says it's from the school or a brand, but the address belongs to someone else."),
    "sender_freemail": ("Official-sounding sender using a personal mailbox", "Offices and companies don't send official notices from Gmail/Yahoo."),
    "sender_trusted_risky_request": ("Official address, but a risky request", "Real offices never ask for passwords, codes or payments by message. A hacked account can send from a real address."),
}
ENGINEERED_NAMES = TEXT_FLAG_NAMES + URL_FLAG_NAMES + ["sender_freemail_official", "shouting", "n_urls"]


def flag_meta(name: str):
    for n, label, why, _ in TEXT_FLAGS:
        if n == name:
            return label, why
    for d in (URL_FLAG_META, OTHER_META, SENDER_RULE_META):
        if name in d:
            return d[name]
    return name, ""


# --------------------------------------------------------------------------------------
# URL structure (shared by email model and standalone URL model)
# --------------------------------------------------------------------------------------
HOMOGLYPH = {"0": "o", "1": "l", "3": "e", "5": "s", "@": "a", "$": "s", "7": "t"}
SCHEME_RX = _compile(r"^[a-z][a-z0-9+.-]*://", "i")
HXXP_RX = _compile(r"^hxxp", "i")
IPV4_RX = _compile(r"^\d{1,3}(\.\d{1,3}){3}$", "")
IP_ODD_RX = _compile(r"^(0x[0-9a-f]+|\d+)(\.(0x[0-9a-f]+|\d+)){3}$", "i")
FILE_RX = _compile(r"\.(php|html?|asp|aspx|cgi|exe|zip)\b", "i")


def homoglyph(s: str) -> str:
    return "".join(HOMOGLYPH.get(c, c) for c in s)


def is_ip(host: str) -> bool:
    h = host.strip("[]")
    if IPV4_RX.match(h):
        return all(int(p) <= 255 for p in h.split("."))
    if ":" in h:
        try:
            ipaddress.IPv6Address(h)
            return True
        except ValueError:
            return False
    return bool(IP_ODD_RX.match(h)) or (h.isdigit() and len(h) >= 8)


def lev(a: str, b: str) -> int:
    if a == b:
        return 0
    if abs(len(a) - len(b)) > 2:
        return 3
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


def entropy(s: str) -> float:
    if not s:
        return 0.0
    c = Counter(s)
    n = len(s)
    return -sum(v / n * math.log2(v / n) for v in c.values())


def parse_url(url: str):
    u = url.strip().strip(".,;:!?)]}>\"'")
    u = HXXP_RX.sub("http", u)
    if not SCHEME_RX.match(u):
        u = "http://" + u
    rest = u.split("://", 1)[1]
    # manual split keeps Python and JS identical
    cut = len(rest)
    for ch in "/?#":
        i = rest.find(ch)
        if i != -1 and i < cut:
            cut = i
    authority, tail = rest[:cut], rest[cut:]
    host = authority.rsplit("@", 1)[-1]
    port = ""
    if host.startswith("["):
        end = host.find("]")
        port = host[end + 2:] if end != -1 and host[end + 1:end + 2] == ":" else ""
        host = host[1:end] if end != -1 else host
    elif host.count(":") == 1:
        host, port = host.split(":")
    path, query = tail, ""
    if "#" in path:
        path = path.split("#", 1)[0]
    if "?" in path:
        path, query = path.split("?", 1)
    return rest, host.lower().strip("."), port, path, query


def lookalike_of(sld: str, sub: str, registered: str) -> str:
    """Return the trusted name being imitated, or ''."""
    trusted = TRUSTED_CAMPUS_DOMAINS + list(TRUSTED_BRANDS)
    if not registered or registered in trusted:
        return ""
    sld_n = homoglyph(sld).replace("-", "")
    sub_n = homoglyph(sub.lower())
    for dom in trusted:
        base = dom.split(".")[0]
        if len(base) < 4 and base != "aamu":
            continue
        if base in sld and sld != base:
            return dom
        if len(sld_n) >= 4 and lev(sld_n, base) <= (1 if len(base) <= 5 else 2):
            return dom
        if base in sub_n:
            return dom
    for kw in LOOKALIKE_KEYWORDS:
        if kw in sld or kw in sub.lower():
            return kw.strip("-")
    return ""


def url_struct(url: str) -> dict:
    """Pure string analysis of one URL. Never resolves or visits it."""
    rest, host, port, path, query = parse_url(url)
    ip = is_ip(host) if host else False
    if ip or not host:
        sub, sld, suffix = "", host, ""
        registered = host
    else:
        sub, sld, suffix = split_host(host)
        registered = f"{sld}.{suffix}" if suffix else sld
    tld = suffix.split(".")[-1] if suffix else ""
    sub_parts = [s for s in sub.split(".") if s and s != "www"]
    lower_rest = rest.lower()
    path_q = (path + ("?" + query if query else "")).lower()
    host_tokens = [t for t in re.split(r"[.-]", host) if t]
    look = "" if ip else lookalike_of(sld, sub, registered)
    digits = sum(ch.isdigit() for ch in rest)
    return {
        "host": host, "registered_domain": registered, "lookalike_target": look,
        "ip_host": int(ip),
        "lookalike": int(bool(look)),
        "n_subdomains": len(sub_parts),
        "shortener": int(registered in SHORTENERS or host in SHORTENERS),
        "suspicious_tld": int(tld in SUSPICIOUS_TLDS),
        "common_tld": int(tld in ("com", "org", "net", "edu", "gov")),
        "at_symbol": int("@" in rest),
        "double_slash": int("//" in rest[1:]),
        "hyphen_host": host.count("-"),
        "digits_host": 0 if ip else sum(ch.isdigit() for ch in host),
        "digit_ratio": digits / max(len(rest), 1),
        "punycode": int("xn--" in host),
        "has_port": int(port not in ("", "80", "443")),
        "url_len": len(rest),
        "host_len": len(host),
        "path_depth": path.count("/"),
        "query_len": len(query),
        "n_special": sum(lower_rest.count(c) for c in "-_=&%~+"),
        "n_dots": host.count("."),
        "longest_host_token": max((len(t) for t in host_tokens), default=0),
        "host_entropy": entropy(host),
        "sensitive_words": sum(w in lower_rest for w in SENSITIVE_URL_WORDS),
        "brand_in_path": int(any(b in path_q for b in TRUSTED_BRANDS.values() if len(b) > 4)),
        "brand_in_sub": int(any(b in sub.lower() for b in TRUSTED_BRANDS.values() if len(b) > 4) or "aamu" in sub.lower()),
        "php_or_html": int(bool(FILE_RX.search(path_q))),
        "campus_domain": int(registered in TRUSTED_CAMPUS_DOMAINS),
        "trusted_brand": int(registered in TRUSTED_BRANDS),
    }


URL_MODEL_FEATURES = ["ip_host", "lookalike", "n_subdomains", "shortener", "suspicious_tld", "common_tld",
                      "at_symbol", "double_slash", "hyphen_host", "digits_host", "digit_ratio", "punycode",
                      "has_port", "url_len", "host_len", "path_depth", "query_len", "n_special", "n_dots",
                      "longest_host_token", "host_entropy", "sensitive_words", "brand_in_path", "brand_in_sub",
                      "php_or_html"]
URL_MODEL_LABELS = {
    "ip_host": "Uses a raw IP address instead of a name",
    "lookalike": "Domain imitates a trusted name",
    "n_subdomains": "Many subdomains hiding the real owner",
    "shortener": "Shortened link hides the destination",
    "suspicious_tld": "Unusual web address ending",
    "common_tld": "Uncommon web address ending",
    "at_symbol": "Contains '@', which can redirect the link",
    "double_slash": "Contains '//' redirect trick",
    "hyphen_host": "Hyphens in the domain name",
    "digits_host": "Numbers mixed into the domain name",
    "digit_ratio": "Lots of numbers in the link",
    "punycode": "Uses look-alike foreign characters (punycode)",
    "has_port": "Uses an unusual port number",
    "url_len": "Very long link",
    "host_len": "Very long domain name",
    "path_depth": "Deeply nested path",
    "query_len": "Long tracking/query string",
    "n_special": "Many special characters",
    "n_dots": "Many dots in the domain",
    "longest_host_token": "Unusually long word in the domain",
    "host_entropy": "Random-looking domain name",
    "sensitive_words": "Contains login/verify/account words",
    "brand_in_path": "Brand name buried in the path, not the domain",
    "brand_in_sub": "Brand or school name in a subdomain",
    "php_or_html": "Points straight at a script or file",
}


# --------------------------------------------------------------------------------------
# Message-level extraction
# --------------------------------------------------------------------------------------
def _sentence(text: str, i: int) -> str:
    a = max(text.rfind(".", 0, i), text.rfind("!", 0, i), text.rfind("?", 0, i), text.rfind("\n", 0, i)) + 1
    ends = [x for x in (text.find(".", i), text.find("!", i), text.find("?", i), text.find("\n", i)) if x != -1]
    return text[a:min(ends) if ends else len(text)]


def find_text_flags(text: str) -> dict:
    """{flag: [(start, end, match)]}. Credential/personal-data cues inside a reassurance
    ('we will never ask for your password') are ignored."""
    out = {}
    for name in TEXT_FLAG_NAMES:
        spans = []
        for rx in TEXT_FLAG_RX[name]:
            for m in rx.finditer(text):
                if m.end() == m.start():
                    continue
                if name in NEGATED_FLAGS and NEGATION_RX.search(_sentence(text, m.start())):
                    continue
                spans.append((m.start(), m.end(), m.group(0)))
        spans.sort(key=lambda s: (s[0], -s[1]))
        merged = []
        for s in spans:
            if merged and s[0] < merged[-1][1]:
                continue
            merged.append(s)
        out[name] = merged
    return out


def extract_urls(text: str):
    out = []
    for m in RX["url"].finditer(text):
        u = m.group(0)
        # skip the domain part of an email address (x@aamu.edu)
        if m.start() > 0 and text[m.start() - 1] == "@":
            continue
        out.append((m.start(), m.end(), u))
    return out


SHOUT_RX = _compile(r"\b[A-Z]{4,}(?:\s+[A-Z]{2,})+\b|!{2,}", "")


def mentions_campus(lower: str) -> bool:
    return any(n in lower for n in CAMPUS_NAMES)


def message_features(raw_text: str, sender: str | None = None, normalised: bool = False):
    """Engineered model features + evidence spans for inline highlighting.
    `sender` is NOT used for model features (training mail mostly lacks it); see sender_rules()."""
    text = raw_text if normalised else normalise_raw(raw_text)
    lower = text.lower()
    tflags = find_text_flags(text)
    urls = extract_urls(text)
    structs = [(s, e, u, url_struct(u)) for s, e, u in urls]
    official_claim = bool(tflags["impersonation"]) or mentions_campus(lower)

    url_ev = {k: [] for k in URL_FLAG_NAMES}
    for s, e, u, st in structs:
        if st["ip_host"]:
            url_ev["url_ip_host"].append((s, e, u))
        if st["lookalike"]:
            url_ev["url_lookalike"].append((s, e, u))
        if st["n_subdomains"] >= 3:
            url_ev["url_many_subdomains"].append((s, e, u))
        if st["shortener"]:
            url_ev["url_shortener"].append((s, e, u))
        if st["suspicious_tld"]:
            url_ev["url_suspicious_tld"].append((s, e, u))
        if st["at_symbol"] or st["double_slash"]:
            url_ev["url_at_or_redirect"].append((s, e, u))
        if st["sensitive_words"] >= 1 and not (st["campus_domain"] or st["trusted_brand"]):
            url_ev["url_sensitive_words"].append((s, e, u))
        if mentions_campus(lower) and not (st["campus_domain"] or st["trusted_brand"]):
            url_ev["url_non_campus_official"].append((s, e, u))

    addr = [(m.start(), m.end(), m.group(0)) for m in RX["email"].finditer(text)]
    free = [a for a in addr if a[2].split("@")[-1].lower() in FREE_MAIL]
    freemail_official = int(official_claim and bool(free))

    letters = [c for c in text if c.isalpha() and c.isascii()]
    caps_ratio = (sum(c.isupper() for c in letters) / len(letters)) if letters else 0.0
    shout = [(m.start(), m.end(), m.group(0)) for m in SHOUT_RX.finditer(text)]
    shouting = min(1.0, max(0.0, (caps_ratio - 0.15) * 3)) + min(len(shout), 5) / 5

    feats = {n: min(len(tflags[n]), 5) for n in TEXT_FLAG_NAMES}
    for n in URL_FLAG_NAMES:
        feats[n] = min(len(url_ev[n]), 3)
    feats["sender_freemail_official"] = freemail_official
    feats["shouting"] = shouting
    feats["n_urls"] = math.log1p(len(urls))
    evidence = {**tflags, **url_ev, "sender_freemail_official": free if freemail_official else [],
                "shouting": shout, "n_urls": urls}
    return text, feats, evidence, [dict(url=u, start=s, end=e, **st) for s, e, u, st in structs]


OFFICIAL_LOCAL_WORDS = ["office", "helpdesk", "admin", "registrar", "bursar", "payroll", "finaid", "financialaid",
                        "president", "dean", "support", "security", "noreply", "no reply", "hr ", "itservices"]
DISPLAY_RX = _compile(r"^\s*\"?([^\"<]*?)\"?\s*<", "")


OFFICIAL_DISPLAY_WORDS = ["office", "aid", "help desk", "helpdesk", "it ", "services", "support", "admin",
                          "department", "registrar", "bursar", "payroll", "security", "university", "team"]


def sender_profile(sender: str | None):
    """Everything the From-line rules look at, so the UI can show its working."""
    if not sender or not sender.strip():
        return None
    dm = DISPLAY_RX.match(sender)
    display_raw = dm.group(1).strip() if dm else ""
    m = RX["email"].search(sender)
    prof = {"raw": sender.strip(), "display_name": display_raw, "address": "", "local": "", "host": "",
            "subdomain": "", "domain": "", "freemail": False, "official": False, "lookalike": "",
            "claims": [], "official_words": [], "hits": []}
    if not m:
        return prof
    addr = m.group(0).lower()
    local_raw, dom = addr.split("@")[0], addr.split("@")[-1]
    sub, sld, suffix = split_host(dom)
    registered = f"{sld}.{suffix}" if suffix else sld
    display = display_raw.lower()
    look = lookalike_of(sld, sub, registered)
    claims_campus = mentions_campus(display)
    claims_brand = [b for b in TRUSTED_BRANDS.values() if len(b) > 4 and b in display.replace(" ", "")]
    local = local_raw.replace(".", " ").replace("_", " ").replace("-", " ") + " "
    words = []
    for w in [w for w in OFFICIAL_DISPLAY_WORDS if w in display + " "] + [w for w in OFFICIAL_LOCAL_WORDS if w in local]:
        if w.strip() not in words:
            words.append(w.strip())
    freemail = registered in FREE_MAIL
    trusted = registered in TRUSTED_CAMPUS_DOMAINS or registered in TRUSTED_BRANDS
    hits = []
    if look:
        hits.append(("sender_lookalike", addr, look))
    if not trusted and not look and (claims_campus or (claims_brand and not freemail)):
        hits.append(("sender_display_mismatch", addr, display))
    if freemail and (claims_brand or words):
        hits.append(("sender_freemail", addr, display))
    prof.update({"address": addr, "local": local_raw, "host": dom, "subdomain": sub, "domain": registered,
                 "freemail": freemail, "official": trusted and not freemail, "lookalike": look,
                 "claims": (["AAMU"] if claims_campus else []) + claims_brand, "official_words": words, "hits": hits})
    return prof


def sender_rules(sender: str | None, text: str = ""):
    """Rule-based checks on the From line (used at inference only)."""
    prof = sender_profile(sender)
    return prof["hits"] if prof else []
