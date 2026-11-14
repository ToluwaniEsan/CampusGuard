"""Email categories (v2.4): what kind of email is this, and does that fit who sent it?

Inboxes sort mail into kinds: personal, promotions, social, updates (receipts, shipping, account notices),
forums and mailing lists, and official school or work mail. The kind matters for judging risk:

* A real promotion is supposed to say "limited time", "free" and "shop now". When the sender is a real
  company domain and every link goes back to that company, that wording should count for less.
* The same is true of a real social notification or a mailing-list digest.
* But scammers dress up as these kinds too, so the category never lowers the risk when the email asks
  for a password, money, gift cards or personal details, has a dangerous link, or the sender looks fake.
* And a mismatch between the kind of email and its sender is itself a warning sign: a "your package is on
  hold" notice from a personal Gmail address, or a "LinkedIn" notification whose sender isn't LinkedIn.

Everything here is a rule on the text, the From line and the link domains (no new model), and the JS
engine (web/js/campusguard-engine.js) mirrors it exactly.
"""
from __future__ import annotations

import re

from .preprocess import fold_text

CATEGORY_LABELS = {
    "personal": "Personal", "promotions": "Promotion", "social": "Social", "updates": "Update",
    "forums": "Forum or list", "school_work": "School or work",
}

# rules are tried on folded, lower-cased text
CUES = {
    "bulk_footer": r"\bunsubscribe\b|\bopt[ -]?out\b|manage (your )?(email )?(preferences|subscriptions?)|update (your )?(email )?(profile|preferences)"
                   r"|you (are|were) receiving this|this (e-?mail|message) was sent to|view (this|it|the) (e-?mail|message|newsletter)? ?(in|on) (your|a) (web )?browser"
                   r"|(e-?mail|mail) client (does not|doesn't|is unable to) (support|display|read)|add [^\s]+@[^\s]+ to your (address book|safe sender)"
                   r"|to ensure (that )?you receive (future|our) e-?mails|no longer wish to receive",
    "promo": r"\b\d{1,2} ?% off\b|\bsale\b|\bshop (now|our)\b|\bfree shipping\b|\bpromo(tion)? code\b|\bcoupon\b|\bdeals?\b|\bclearance\b"
             r"|\bsweepstakes\b|\bnewsletter\b|\bsave (up to|big|\d)|\blimited[- ]time offer\b|\bnew arrivals?\b|\bbest sellers?\b|\bspecial offer\b",
    "update": r"\breceipt\b|\byou (have )?paid\b|\bpayment details\b|\border (number|no\.?|#|confirmation|status|details)\b|\border #?\w*\d|\binvoice\b|\btracking (number|#)\b"
              r"|\b(has|have) (been )?shipped\b|\bout for delivery\b|\bdelivered\b|\brenewal (notice|reminder)\b|\bauto(matically)?[- ]renew"
              r"|\bstatement (is )?(ready|available)\b|\bpayment (received|confirmation|confirmed)\b|\bthank you for (your )?(order|purchase|payment)\b"
              r"|\bappointment (reminder|confirmation)\b|\breminder\b|\bweather alert\b|\bsign[- ]in alert\b|\bpassword (was )?changed\b",
    "forum": r"(^|\n)\s*>|\bwrote:|\bmailing list\b|\bdigest\b|\bgooglegroups\b|\blistinfo\b|\bmailman\b|\bnew messages in \d+ topics?\b"
             r"|^\s*(re: ?)*\[[^\]]{2,30}\]",
    "social": r"\b(commented on|replied to|reacted to|liked|shared) your\b|\btagged you\b|\bmentioned you\b|\bnew followers?\b|\bstarted following you\b"
              r"|\bsent you a (message|friend request|connection request)\b|\bwants to connect\b|\binvitation to connect\b|\bfriend request\b"
              r"|\bnew members? (joined|from your)\b|\bpeople you may know\b|\bviewed your profile\b",
    # fake receipt + phone number ("callback" scams): call us if you didn't make this payment
    "callback": r"(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}",
    "charge": r"\byou (have )?(paid|been charged|were charged)\b|\b(charged|debited|billed) (to )?your\b|\bauto(matically)?[- ]renew|\brefund\b|\bcancel (your|the|this)? ?(order|subscription|payment|renewal)\b|\bif you did not (make|authori[sz]e|place)\b",
    # "notice" wording scammers love: a delivery or account problem that needs action
    "notice": r"\byour (package|parcel|shipment|delivery|order|account|invoice|statement|payment|subscription|mailbox)\b[^.\n]{0,60}"
              r"\b(on hold|held|suspended|failed|unable|pending|update|confirm|verify|expired?|locked|limited|undeliverable|returned)\b",
}
CUES = {k: re.compile(v, re.I | re.M) for k, v in CUES.items()}

SOCIAL_PLATFORMS = {
    "linkedin": ["linkedin.com"], "facebook": ["facebook.com", "facebookmail.com"], "instagram": ["instagram.com", "mail.instagram.com"],
    "twitter": ["twitter.com", "x.com"], "tiktok": ["tiktok.com"], "snapchat": ["snapchat.com"], "discord": ["discord.com", "discordapp.com"],
    "reddit": ["reddit.com", "redditmail.com"], "handshake": ["joinhandshake.com"], "pinterest": ["pinterest.com"],
    "youtube": ["youtube.com"], "groupme": ["groupme.com"], "nextdoor": ["nextdoor.com"], "quora": ["quora.com"],
}
SOCIAL_DOMAINS = sorted({d for ds in SOCIAL_PLATFORMS.values() for d in ds})
# mailing services companies send newsletters through; their tracking links still count as the sender's
MAILING_SERVICES = ["constantcontact.com", "rs6.net", "list-manage.com", "mailchimp.com", "mcsv.net", "sendgrid.net", "exacttarget.com",
                    "createsend.com", "cmail19.com", "cmail20.com", "hubspotlinks.com", "hs-sites.com", "mktomail.com", "ct.sendgrid.net",
                    "googlegroups.com", "groups.google.com", "sourceforge.net"]

# Category step constants (exported to the JS engine)
CATEGORY_DISCOUNT = 0.25          # same size as the trusted-sender discount
CATEGORY_PULL = {"category_notice_personal_mailbox": 0.20, "category_fake_social": 0.25}
# Any of these means the category must not lower the risk
DANGER_FLAGS = ["asks_for_secrets", "upfront_payment", "gift_card_request", "credential_request", "sensitive_info", "threat",
                "job_scam", "secrecy", "unavailable_pretext", "url_ip_host", "url_lookalike", "url_at_or_redirect",
                "url_shortener", "url_suspicious_tld"]


def _same_org(link_dom: str, sender_dom: str) -> bool:
    if not link_dom or not sender_dom:
        return False
    if link_dom == sender_dom or link_dom in MAILING_SERVICES:
        return True
    a, b = link_dom.split(".")[0], sender_dom.split(".")[0]
    # brand-em.com / brandmail.com / e-brand.com style sending domains
    return len(a) >= 4 and len(b) >= 4 and (a in b or b in a)


def classify(text: str, prof: dict | None, link_domains: list[str], hint: str | None = None) -> dict:
    """Which kind of email this is, the signs that said so, and whether the sender and links fit it."""
    t = fold_text(text or "")
    hits = {k: bool(rx.search(t)) for k, rx in CUES.items()}
    dom = (prof or {}).get("domain", "")
    signals = []
    platform = next((p for p, ds in SOCIAL_PLATFORMS.items() if dom in ds), "")
    if platform:
        cat = "social"; signals.append(f"sent by {dom}")
    elif hits["social"] and not hits["bulk_footer"] and not hits["promo"]:
        cat = "social"; signals.append("notification wording")
    elif hits["forum"] and not hits["promo"]:
        cat = "forums"; signals.append("mailing-list or reply thread")
    elif hits["bulk_footer"] and (hits["promo"] or not hits["update"]):
        cat = "promotions"; signals.append("unsubscribe or view-in-browser footer")
    elif hits["promo"] and not hits["update"]:
        cat = "promotions"; signals.append("sale or offer wording")
    elif hits["update"] or hits["notice"]:
        cat = "updates"; signals.append("receipt, delivery or account-notice wording")
    elif prof and prof.get("official"):
        cat = "school_work"; signals.append(f"official domain ({dom})")
    else:
        cat = "personal"
    if hint in CATEGORY_LABELS and hint != cat and cat in ("personal", "school_work"):
        cat = hint; signals.append("the mailbox's own category")     # e.g. Gmail's Promotions tab
    has_sender = bool(dom) and not (prof or {}).get("freemail")
    links_fit = all(_same_org(d, dom) or (platform and d in SOCIAL_PLATFORMS[platform]) for d in link_domains)
    # the sender's domain must also be the organisation the email is from: named in the display name or the
    # text (e.g. "Casual Male XL" <...@e.casualmale.com>). A fake invoice from a random domain fails this.
    org = dom.split(".")[0]
    name = re.sub(r"[^a-z0-9]", "", fold_text((prof or {}).get("display_name", "")).lower())
    body = re.sub(r"[^a-z0-9]", "", t.lower())
    in_text = bool(re.search(r"\b" + re.escape(org) + r"\b", t.lower())) or (len(org) >= 6 and org in body)
    identity = bool(org) and len(org) >= 3 and (in_text or (len(name) >= 4 and (org in name or name in org))
                                                 or any(len(w) >= 4 and w in org for w in re.findall(r"[a-z0-9]+", fold_text((prof or {}).get("display_name", "")).lower())))
    consistent = has_sender and links_fit and identity
    # claims to be a social platform but isn't sent by it
    named = [p for p in SOCIAL_PLATFORMS if re.search(r"\b" + p + r"\b", t, re.I)]
    fake_social = bool(hits["social"] and named and dom and not platform and not any(dom in SOCIAL_PLATFORMS[p] for p in named))
    notice_personal = bool(hits["notice"] and (prof or {}).get("freemail"))
    callback = bool(hits["callback"] and hits["charge"])
    return {"category": cat, "label": CATEGORY_LABELS[cat], "signals": signals, "consistent": bool(consistent),
            "fake_social": fake_social, "fake_social_platform": named[0] if fake_social else "",
            "notice_personal": notice_personal, "callback": callback}
