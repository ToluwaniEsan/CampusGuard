"""CampusGuard inference (Python reference; web/campusguard-engine.js mirrors it 1:1).

paste text or a URL -> verdict, risk score, named red flags with severity, inline highlight
spans, per-link reports, plain-English explanation, recommended action.
Everything happens in memory: nothing is written anywhere and URLs are never fetched.
"""
from __future__ import annotations

import math
import re
import time
from pathlib import Path

import joblib
import numpy as np

from .features import (ENGINEERED_NAMES, FREE_MAIL, TRUSTED_BRANDS, TRUSTED_CAMPUS_DOMAINS, URL_MODEL_FEATURES,
                       URL_MODEL_LABELS, flag_meta, lookalike_of, message_features, sender_profile, url_struct)
from .psl import split_host
from .model import PLACEHOLDERS, analyzer, tree_predict_explain
from .preprocess import EMAIL_RE, URL_RE, clean_for_tfidf, normalise_raw

MODELS = Path(__file__).resolve().parents[1] / "models"

ACTIONS = {
    "sender_lookalike": "Delete it. The sender is pretending to be a trusted address. If unsure, contact the office through aamu.edu.",
    "credential_request": "Don't enter your password anywhere this message sends you. Type the official address yourself instead.",
    "sensitive_info": "Never send SSN, bank, card or ID details by email or text. Call the office using a number from the official website.",
    "url_lookalike": "Don't click. The link only looks like a trusted address.",
    "job_scam": "Real campus jobs are posted through Career Services or Handshake. Don't reply to personal email addresses or send money.",
    "money_lure": "Unexpected money or prizes that need a fee or your details are scams. Don't reply.",
    "impersonation": "If it claims to be a campus office, contact that office directly through aamu.edu, not through the message.",
    "sender_freemail": "Official offices don't write from Gmail/Yahoo. Contact the office through its official website.",
    "sender_display_mismatch": "The sender name and address don't match. Verify through an official channel before doing anything.",
    "sender_trusted_risky_request": "Don't send anything. The address is real, but offices never ask for this by message, so the account may be hacked. Call or visit the office using contact details from aamu.edu.",
}
DEFAULT_ACTION = "Don't click links or reply. Report it to the campus IT help desk."
SAFE_ACTION = "No strong warning signs. If anything still feels off, contact the sender through an official channel."
FLOOR_MEDIUM = {"url_lookalike", "url_ip_host", "url_at_or_redirect", "sender_freemail_official",
                "sensitive_info", "credential_request"}
STRUCT_FLOOR = 0.6   # IP-host, lookalike or punycode link present (part of the content)
# --- From line: the content leads, the sender only nudges (v2.2) -----------------------
# A suspicious sender closes at most this share of the gap between the content score and 100%.
SENDER_PULL = {"sender_lookalike": 0.30, "sender_display_mismatch": 0.20, "sender_freemail": 0.20}
# An official sender removes at most this share of the content score, and only when the
# content makes no risky request and every link is official. Hacked accounts are real.
TRUSTED_SENDER_DISCOUNT = 0.25
RISKY_REQUEST_FLAGS = ["asks_for_secrets", "upfront_payment"]
MAX_URLS = 10
VERDICTS = {"high": "High Risk", "medium": "Suspicious", "low": "Likely Safe"}


def pct(x):
    return round(x * 100)


def build_sender_check(prof, effect, rate, content, final, risky_request):
    """Step-by-step record of how the From line was judged and how far it moved the score."""
    if prof is None:
        return {"provided": False, "summary": "No sender given. Add the From line to include it in the check.",
                "content_score": round(content, 4), "final_score": round(final, 4), "effect": "none", "rate": 0.0,
                "formula": "", "checks": []}
    d = prof["domain"]
    hit_names = [h[0] for h in prof["hits"]]
    checks = []
    if not prof["address"]:
        checks.append({"id": "address", "label": "Email address found", "hit": True,
                       "detail": "No email address in the From line, so only the content counts"})
    else:
        checks.append({"id": "lookalike", "label": "Imitates a trusted domain", "hit": "sender_lookalike" in hit_names,
                       "detail": f"@{d} imitates {prof['lookalike']}" if prof["lookalike"] else f"@{d} doesn't imitate a trusted name"})
        if "sender_display_mismatch" in hit_names:
            det = f'Name says "{prof["display_name"]}" but the address is @{d}'
        elif not prof["display_name"]:
            det = "No display name to compare"
        else:
            det = "Name and address don't contradict each other"
        checks.append({"id": "display_mismatch", "label": "Name doesn't match the address",
                       "hit": "sender_display_mismatch" in hit_names, "detail": det})
        if "sender_freemail" in hit_names:
            det = f"@{d} is a personal mailbox, but the sender sounds official (" + ", ".join(prof["official_words"] + prof["claims"]) + ")"
        elif prof["freemail"]:
            det = f"@{d} is a personal mailbox, which is normal for a person"
        else:
            det = f"@{d} is not a personal mailbox"
        checks.append({"id": "freemail", "label": "Official-sounding sender on a personal mailbox",
                       "hit": "sender_freemail" in hit_names, "detail": det})
        checks.append({"id": "official", "label": "On the trusted-domain list", "hit": prof["official"],
                       "detail": f"{d} is on the trusted list" if prof["official"] else f"{d} is not on the trusted list"})
        if prof["official"]:
            checks.append({"id": "risky_request", "label": "Message asks for passwords, codes or money", "hit": risky_request,
                           "detail": "Yes, so the official address earns no discount" if risky_request else "No"})
    pc, pf = pct(content), pct(final)
    if effect == "raise":
        formula = f"{pc}% + {rate:.2f} \u00d7 (100% \u2212 {pc}%) = {pf}%"
        summary = f"The sender looks suspicious, so it closes {pct(rate)}% of the gap to 100%. The content still leads."
    elif effect == "lower":
        formula = f"{pc}% \u00d7 (1 \u2212 {rate:.2f}) = {pf}%"
        summary = f"Official sender and only official links, so the risk drops by {pct(rate)}%. That's the most a sender can lower it."
    elif effect == "no_discount":
        formula = f"{pc}% (no change)"
        summary = "The address is official, but the message asks for something risky, so it gets no discount. Real accounts get hacked."
    elif effect == "official_links_elsewhere":
        formula = f"{pc}% (no change)"
        summary = "The address is official, but some links go to other sites, so it gets no discount."
    else:
        formula = f"{pc}% (no change)"
        summary = "Nothing unusual about the sender. The score comes from the content alone."
    return {"provided": True, "raw": prof["raw"], "display_name": prof["display_name"], "address": prof["address"],
            "local": prof["local"], "host": prof["host"], "subdomain": prof["subdomain"], "domain": d,
            "checks": checks, "effect": effect, "rate": rate, "content_score": round(content, 4),
            "final_score": round(final, 4), "formula": formula, "summary": summary,
            "max_raise": max(SENDER_PULL.values()), "max_lower": TRUSTED_SENDER_DISCOUNT}


def utf16_offsets(text, highlights):
    """Convert code-point offsets to UTF-16 offsets so spans index JavaScript strings correctly."""
    if all(ord(c) < 0x10000 for c in text):
        return highlights
    pref, acc = [0], 0
    for c in text:
        acc += 2 if ord(c) >= 0x10000 else 1
        pref.append(acc)
    return [{**h, "start": pref[h["start"]], "end": pref[h["end"]]} for h in highlights]


def sigmoid(z):
    return 1.0 / (1.0 + math.exp(-z)) if z > -700 else 0.0


def is_bare_url(s: str) -> bool:
    if not s or len(s.split()) != 1 or EMAIL_RE.fullmatch(s):
        return False
    return bool(URL_RE.fullmatch(s)) or bool(re.match(
        r"^([a-z][a-z0-9+.-]*://)?[\w-]+(\.[\w-]+)*\.[a-z]{2,}\.?(:\d+)?(/\S*)?$|^[a-z][a-z0-9+.-]*://\S+$", s, re.I | re.A))


class CampusGuard:
    def __init__(self, models_dir: Path | str = MODELS):
        models_dir = Path(models_dir)
        m = joblib.load(models_dir / "campusguard_message_model.joblib")
        self.vec, self.clf = m["vectorizer"], m["model"]
        self.threshold, self.high_threshold = m["threshold"], m["high_threshold"]
        self.bg_mean = m["background_mean"]
        self.version = m.get("version", "2")
        self.vocab = self.vec.tfidf.vocabulary_
        self.idf = self.vec.tfidf.idf_
        self.n_words = len(self.idf)
        self.coef = self.clf.coef_.ravel()
        self.intercept = float(self.clf.intercept_[0])
        self.scale = self.vec.scaler.scale_
        self.w = self.vec.engineered_weight
        self.words = {i: w for w, i in self.vocab.items()}
        u = joblib.load(models_dir / "campusguard_url_model.joblib")
        self.url_trees, self.url_threshold = u["exported"], u["threshold"]

    # ------------------------------------------------------------------ public API
    def analyze(self, content: str, sender: str | None = None) -> dict:
        t0 = time.perf_counter()
        content = (content or "").strip()
        sender = (sender or "").strip() or None
        if not content:
            out = {"input_type": "empty", "verdict": "Nothing to check", "risk_level": "low", "risk_score": 0.0,
                   "red_flags": [], "highlights": [], "urls": [], "analyzed_text": "", "good_signs": [],
                   "explanation": "Paste a message or a link to check it.", "recommended_action": ""}
        elif is_bare_url(content):
            out = self._analyze_url_only(content)
        else:
            out = self._analyze_message(content, sender)
        out["model_version"] = self.version
        out["latency_ms"] = round((time.perf_counter() - t0) * 1000, 1)
        return out

    # ------------------------------------------------------------------ vectorising
    def _vector(self, clean: str, feats: dict):
        toks = analyzer(clean)
        counts = {}
        for t in toks:
            j = self.vocab.get(t)
            if j is not None:
                counts[j] = counts.get(j, 0) + 1
        vals = {j: (1.0 + math.log(c)) * self.idf[j] for j, c in counts.items()}
        norm = math.sqrt(sum(v * v for v in vals.values())) or 1.0
        x = {j: v / norm for j, v in vals.items()}
        for k, name in enumerate(ENGINEERED_NAMES):
            v = feats[name] / self.scale[k] * self.w
            if v != 0:
                x[self.n_words + k] = v
        return x

    def _message_score(self, x: dict):
        z = self.intercept + sum(self.coef[j] * v for j, v in x.items())
        return sigmoid(z), z

    # ------------------------------------------------------------------ message path
    def _analyze_message(self, content, sender):
        norm = normalise_raw(content)
        clean = clean_for_tfidf(norm, already_normalised=True)
        text, feats, evidence, url_structs = message_features(norm, normalised=True)
        x = self._vector(clean, feats)
        p_msg, _ = self._message_score(x)
        # exact linear SHAP for present features: coef * (x - E[x])
        contrib = {j: float(self.coef[j] * (v - self.bg_mean[j])) for j, v in x.items()}
        flags, highlights = self._flags(contrib, x, text, evidence)

        seen, url_reports = set(), []
        for s in url_structs:
            if s["url"] in seen or len(url_reports) >= MAX_URLS:
                continue
            seen.add(s["url"])
            url_reports.append(self._score_url(s["url"]))
        p_url = max((r["risk_score"] for r in url_reports), default=0.0)
        risk = p_msg if not url_reports else max(p_msg, 0.5 * p_msg + 0.5 * p_url)

        # ---- 1. content score (text model + links); dangerous link structure is content
        if any(s["ip_host"] or s["lookalike"] or s["punycode"] for s in url_structs):
            risk = max(risk, STRUCT_FLOOR)
        content_risk = risk

        # ---- 2. From line: a bounded nudge that can never outweigh the content
        good, sender_flags = [], []
        prof = sender_profile(sender)
        hits = prof["hits"] if prof else []
        all_links_official = all(r["parts"]["registered_domain"] in TRUSTED_CAMPUS_DOMAINS or
                                 r["parts"]["registered_domain"] in TRUSTED_BRANDS for r in url_reports)
        if url_reports and all_links_official:
            good.append("All links go to official websites")
        effect, rate, risky_asks = "none", 0.0, []
        if hits:
            effect, rate = "raise", max(SENDER_PULL[name] for name, _, _ in hits)
            risk = risk + rate * (1.0 - risk)
            for name, addr, detail in hits:
                label, why = flag_meta(name)
                ev = [addr] + ([f"imitates {detail}"] if name == "sender_lookalike" else [])
                sender_flags.append({"flag": name, "label": label, "why": why, "contribution": None,
                                     "severity": "High" if name == "sender_lookalike" else "Medium", "evidence": ev})
        elif prof and prof["official"]:
            good.insert(0, f"Sent from an official domain ({prof['domain']})")
            risky_asks = [n for n in RISKY_REQUEST_FLAGS if feats.get(n, 0) > 0]
            if risky_asks:
                effect = "no_discount"
                label, why = flag_meta("sender_trusted_risky_request")
                ev = [prof["domain"]] + [e[2] for n in risky_asks for e in evidence.get(n, [])][:2]
                sender_flags.append({"flag": "sender_trusted_risky_request", "label": label, "why": why,
                                     "contribution": None, "severity": "High", "evidence": ev})
            elif all_links_official:
                effect, rate = "lower", TRUSTED_SENDER_DISCOUNT
                risk = risk * (1.0 - TRUSTED_SENDER_DISCOUNT)
            else:
                effect = "official_links_elsewhere"
        sender_check = build_sender_check(prof, effect, rate, content_risk, risk, bool(risky_asks))
        flags = flags + sender_flags

        level = self._level(risk)
        highlights = utf16_offsets(text, highlights)
        return {
            "input_type": "message", "verdict": VERDICTS[level], "risk_level": level,
            "risk_score": round(risk, 4), "content_score": round(content_risk, 4), "message_model_score": round(p_msg, 4),
            "url_model_score": round(p_url, 4) if url_reports else None,
            "red_flags": flags, "highlights": highlights, "analyzed_text": text, "urls": url_reports,
            "good_signs": good + self._normal_words(contrib), "sender_check": sender_check,
            "explanation": self._plain_english(level, risk, flags, url_reports),
            "recommended_action": self._action(level, flags),
        }

    @staticmethod
    def _sender_domain(sender):
        if not sender:
            return ""
        m = EMAIL_RE.search(sender)
        if not m:
            return ""
        sub, sld, suffix = split_host(m.group(0).lower().split("@")[-1])
        return f"{sld}.{suffix}" if suffix else sld

    def _normal_words(self, contrib):
        neg = [(c, self.words[j]) for j, c in contrib.items() if j < self.n_words and c < -0.05
               and not (set(self.words[j].split()) & PLACEHOLDERS)]
        neg.sort(key=lambda t: (t[0], t[1]))
        if not neg:
            return []
        return ["Reads like normal conversation: " + ", ".join(f'"{w}"' for _, w in neg[:4])]

    def _flags(self, contrib, x, text, evidence):
        flags, highlights = [], []
        for k, name in enumerate(ENGINEERED_NAMES):
            j = self.n_words + k
            c = contrib.get(j, 0.0)
            if j not in x or c <= 0.02:
                continue
            label, why = flag_meta(name)
            ev = evidence.get(name, [])
            uniq = []
            for e in ev:
                if e[2] not in uniq:
                    uniq.append(e[2])
            flags.append({"flag": name, "label": label, "why": why, "contribution": round(c, 4),
                          "evidence": uniq[:5]})
            for s, e, frag in ev[:8]:
                if s >= 0:
                    highlights.append({"start": s, "end": e, "text": frag, "flag": name})

        words = [(c, self.words[j]) for j, c in contrib.items() if j < self.n_words and c > 0.02
                 and not (set(self.words[j].split()) & PLACEHOLDERS)]
        words.sort(key=lambda t: (-t[0], t[1]))
        top = words[:8]
        if top:
            flags.append({"flag": "suspicious_wording", "label": "Wording common in scams",
                          "why": "These words and phrases show up far more often in scam messages.",
                          "contribution": round(sum(c for c, _ in top), 4), "evidence": [w for _, w in top]})
            lower = text.lower()
            for _, w in top:
                parts = w.split()
                pat = re.compile(r"\b" + r"[\W_]+".join(re.escape(p) for p in parts) + r"\b", re.I | re.A)
                for m in list(pat.finditer(lower))[:3]:
                    highlights.append({"start": m.start(), "end": m.end(), "text": text[m.start():m.end()],
                                       "flag": "suspicious_wording"})
        flags.sort(key=lambda f: -f["contribution"])
        total = sum(f["contribution"] for f in flags) or 1.0
        for f in flags:
            share = f["contribution"] / total
            f["severity"] = "High" if share >= 0.25 else "Medium" if share >= 0.10 else "Low"
            if f["flag"] in FLOOR_MEDIUM and f["severity"] == "Low":
                f["severity"] = "Medium"
        highlights.sort(key=lambda h: (h["start"], -(h["end"] - h["start"])))
        merged = []
        for h in highlights:
            if merged and h["start"] < merged[-1]["end"]:
                continue
            merged.append(h)
        return flags, merged

    # ------------------------------------------------------------------ URL path
    def _score_url(self, url):
        st = url_struct(url)
        xv = [float(st[k]) for k in URL_MODEL_FEATURES]
        p, contrib = tree_predict_explain(self.url_trees, xv)
        order = sorted(range(len(contrib)), key=lambda i: (-contrib[i], i))
        reasons = [URL_MODEL_LABELS[URL_MODEL_FEATURES[i]] for i in order[:4]
                   if contrib[i] > 0.05 and xv[i] > 0 and URL_MODEL_FEATURES[i] != "common_tld"]
        hard = [("ip_host", "Uses a raw IP address instead of a name"),
                ("lookalike", "Domain imitates a trusted name"),
                ("punycode", "Uses look-alike foreign characters (punycode)"),
                ("at_symbol", "Contains '@', which can redirect the link"),
                ("shortener", "Shortened link hides the destination")]
        for k, lab in reversed(hard):
            if st[k]:
                if lab in reasons:
                    reasons.remove(lab)
                reasons.insert(0, lab)
        if st["lookalike"]:
            reasons[reasons.index("Domain imitates a trusted name")] = f"Domain imitates {st['lookalike_target']}"
        if st["ip_host"] or st["lookalike"] or st["punycode"]:
            p = max(p, 0.85)
        if st["campus_domain"] and st["n_subdomains"] <= 2 and not st["at_symbol"]:
            p, reasons = min(p, 0.1), ["Official campus domain"]
        elif st["trusted_brand"] and not st["at_symbol"] and st["n_subdomains"] <= 3:
            p, reasons = min(p, 0.2), ["Known trusted domain"]
        return {"url": url, "domain": st["registered_domain"], "risk_score": round(p, 4),
                "risky": p >= self.url_threshold, "reasons": reasons[:5],
                "parts": {"host": st["host"], "registered_domain": st["registered_domain"],
                          "subdomains": st["n_subdomains"], "ip_host": bool(st["ip_host"]),
                          "lookalike_target": st["lookalike_target"], "shortener": bool(st["shortener"]),
                          "suspicious_tld": bool(st["suspicious_tld"])}}

    def _analyze_url_only(self, url):
        r = self._score_url(url)
        level = "high" if r["risk_score"] >= 0.8 else "medium" if r["risky"] else "low"
        flags = [{"flag": "url", "label": x, "why": "", "severity": "High" if i == 0 else "Medium",
                  "contribution": None, "evidence": [url]} for i, x in enumerate(r["reasons"])
                 if x not in ("Official campus domain", "Known trusted domain")]
        return {"input_type": "url", "verdict": VERDICTS[level], "risk_level": level,
                "risk_score": r["risk_score"], "message_model_score": None, "url_model_score": r["risk_score"],
                "red_flags": flags,
                "highlights": [{"start": 0, "end": len(url), "text": url, "flag": "url"}] if level != "low" else [],
                "analyzed_text": url, "urls": [r],
                "good_signs": [x for x in r["reasons"] if x in ("Official campus domain", "Known trusted domain")],
                "explanation": self._plain_english(level, r["risk_score"], flags, [r]),
                "recommended_action": DEFAULT_ACTION if level != "low" else
                "Looks OK, but only enter passwords on sites you typed in yourself."}

    # ------------------------------------------------------------------ helpers
    def _level(self, p):
        return "high" if p >= self.high_threshold else "medium" if p >= self.threshold else "low"

    @staticmethod
    def _action(level, flags):
        if level == "low":
            return SAFE_ACTION
        if any(f["flag"] == "sender_trusted_risky_request" for f in flags):
            return ACTIONS["sender_trusted_risky_request"]
        for f in flags:
            if f["flag"] in ACTIONS:
                return ACTIONS[f["flag"]]
        return DEFAULT_ACTION

    @staticmethod
    def _plain_english(level, risk, flags, urls):
        pct = round(risk * 100)
        if level == "low":
            head = f"This looks safe ({pct}% risk)."
            minor = [f for f in flags if f["flag"] != "suspicious_wording" and f["severity"] == "High"]
            return head + (" We didn't find strong warning signs." if not minor else
                           f" One thing to keep in mind: {minor[0]['label'].lower()}.")
        head = ("This looks like a scam" if level == "high" else "This message is suspicious") + f" ({pct}% risk)."
        content = [f for f in flags if not f["flag"].startswith("sender_")]
        ordered = [f for f in content if f["flag"] != "suspicious_wording"] + \
                  [f for f in content if f["flag"] == "suspicious_wording"]
        parts = []
        for f in ordered[:3]:
            ev = f.get("evidence") or []
            q = f' ("{ev[0]}")' if ev and f["flag"] not in ("n_urls", "url") else ""
            parts.append(f"{f['label'].lower()}{q}")
        bad = [u for u in urls if u.get("risky")]
        if bad and not any(f["flag"] == "url" for f in flags):
            parts.append(f"its link goes to {bad[0]['domain'] or bad[0]['url']}, which isn't a trusted address")
        snd = [f for f in flags if f["flag"].startswith("sender_")]
        if snd:
            parts.append(f"also, {snd[0]['label'].lower()}")
        return head + (" Warning signs: " + "; ".join(parts) + "." if parts else "")


def llm_prompt(result: dict) -> str:
    """Grounded prompt for the optional LLM explanation (it rephrases; it never decides)."""
    flags = "\n".join(f"- {f['label']}: {', '.join(map(str, f.get('evidence') or []))}" for f in result["red_flags"][:6])
    return ("You explain phishing warnings to college students in plain, friendly English. Max 70 words, no jargon, "
            "no markdown.\n"
            f"Verdict: {result['verdict']} ({round(result['risk_score'] * 100)}% risk).\n"
            f"Red flags found by the detector:\n{flags or '- none'}\n"
            "Explain why these signs matter and what the student should do next. "
            "Do not invent red flags that are not listed and do not change the verdict.")
