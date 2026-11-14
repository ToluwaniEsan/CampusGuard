/* CampusGuard v3: finds the ONE email that is open on the page and reads only that:
   sender, subject, the message text and where its links really go. Nothing else on the page
   (inbox list, other tabs, contacts, drafts) is read. Nothing is stored or sent anywhere.

   Two layers:
   1. Site adapters for webmail we know (Gmail, Outlook, Yahoo/AOL, Proton, iCloud, Roundcube).
   2. A generic detector for any other webmail: it scores signs of an open email
      (Reply/Forward buttons, From/To/Subject labels, an email address, a message-sized block of text)
      and only reads the page if the score says it is one. */
(function (root) {
  "use strict";
  const MAX_TEXT = 20000;
  const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

  // ------------------------------------------------------------------ helpers
  const visible = el => !!el && (el.offsetParent !== null || (el.getClientRects && el.getClientRects().length > 0));
  const txt = el => (el ? (el.innerText || el.textContent || "") : "").replace(/ /g, " ").trim();
  const clean = s => (s || "").replace(/\s+/g, " ").trim();

  function docs(doc) {
    // the page plus any same-origin frames (Roundcube, iCloud and some others show the message in one)
    const out = [doc];
    doc.querySelectorAll("iframe").forEach(f => {
      try { if (f.contentDocument && f.contentDocument.body && visible(f)) out.push(f.contentDocument); } catch (e) { /* cross-origin: skip */ }
    });
    return out;
  }
  function q(doc, sel) { for (const d of docs(doc)) { const el = d.querySelector(sel); if (el) return el; } return null; }
  function qa(doc, sel) { const out = []; for (const d of docs(doc)) out.push(...d.querySelectorAll(sel)); return out; }
  function lastVisible(list) { const v = list.filter(visible); return v.length ? v[v.length - 1] : null; }

  function bodyText(el) {
    let t = txt(el);
    const hrefs = [...el.querySelectorAll("a[href]")].map(a => a.getAttribute("href") || "")
      .filter(h => /^https?:/i.test(h) && t.indexOf(h) === -1);
    const uniq = [...new Set(hrefs)].slice(0, 15);
    if (uniq.length) t += "\n\nLinks in this email: " + uniq.join(" ");
    // pictures: their alt text often carries the message in image-heavy emails (no image is downloaded or read)
    const alts = [...new Set([...el.querySelectorAll("img[alt]")].map(i => clean(i.getAttribute("alt"))).filter(a => a.length >= 3 && t.indexOf(a) === -1))].slice(0, 10);
    if (alts.length) t += "\n\nImage text: " + alts.join(" | ");
    return t.slice(0, MAX_TEXT);
  }
  function senderFrom(el) {
    if (!el) return "";
    const addr = el.getAttribute("email") || (el.getAttribute("title") || "").match(EMAIL_RE)?.[0] ||
      (el.getAttribute("href") || "").replace(/^mailto:/i, "").match(EMAIL_RE)?.[0] || txt(el).match(EMAIL_RE)?.[0] || "";
    const name = clean((el.getAttribute("name") || txt(el)).replace(addr, "").replace(/[<>()]/g, ""));
    return addr ? (name ? name + " <" + addr + ">" : addr) : name;
  }
  function hash(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
  function make(site, bodyEl, sender, subject) {
    if (!bodyEl) return null;
    const text = bodyText(bodyEl);
    if (text.length < 15) return null;
    subject = clean(subject).slice(0, 300); sender = clean(sender).slice(0, 300);
    return { el: bodyEl, email: { site, sender, subject, text, key: hash(sender + "|" + subject + "|" + text.slice(0, 3000)) } };
  }

  // ------------------------------------------------------------------ site adapters
  const ADAPTERS = {
    gmail(doc) {
      // a thread can have several messages expanded; the open one is the last expanded message
      const bodies = qa(doc, "div.a3s").filter(b => visible(b) && !b.closest(".gmail_quote"));
      const body = bodies[bodies.length - 1];
      if (!body) return null;
      const box = body.closest("div.adn") || body.parentElement;
      return make("gmail", body, senderFrom(box && box.querySelector("span.gD")), txt(q(doc, "h2.hP")));
    },
    outlook(doc) {
      const body = lastVisible(qa(doc, 'div[aria-label="Message body" i], div[aria-label="Message Body"]'));
      if (!body) return null;
      const pane = body.closest('[role="main"]') || doc;
      const s = pane.querySelector('span[title*="@"], [aria-label^="From" i] span, [data-testid="SenderPersona"]');
      const h = pane.querySelector('[role="heading"][aria-level="2"], [role="heading"]');
      return make("outlook", body, senderFrom(s), txt(h));
    },
    yahoo(doc) {
      const body = lastVisible(qa(doc, '[data-test-id="message-view-body-content"], [data-test-id="message-view-body"]'));
      if (!body) return null;
      const s = q(doc, '[data-test-id="message-from"] [title*="@"], [data-test-id="email-pill"] [title*="@"], [data-test-id="message-from"]');
      return make("yahoo", body, senderFrom(s), txt(q(doc, '[data-test-id="message-group-subject-text"], [data-test-id="message-subject"]')));
    },
    proton(doc) {
      const body = lastVisible(qa(doc, '[data-testid="message-content:body"], .message-content'));
      if (!body) return null;
      const s = q(doc, '[data-testid="recipients:sender"] [title*="@"], [data-testid="recipients:sender"]');
      return make("proton", body, senderFrom(s), txt(q(doc, '[data-testid="conversation-header:subject"], h1')));
    },
    roundcube(doc) {
      const body = q(doc, "#messagebody");
      if (!body || !visible(body)) return null;
      const s = q(doc, ".header .from a[href^='mailto:'], .from a[title*='@'], .header-headers .from");
      return make("roundcube", body, senderFrom(s), txt(q(doc, "h2.subject, .subject span, td.subject")));
    },
  };
  function adapterFor(loc, doc) {
    const h = loc.hostname;
    if (h === "mail.google.com") return "gmail";
    if (/^outlook\.(live|office|office365)\.com$|^outlook\.cloud\.microsoft$/.test(h)) return "outlook";
    if (h === "mail.yahoo.com" || h === "mail.aol.com") return "yahoo";
    if (h === "mail.proton.me") return "proton";
    if (doc.querySelector('meta[name="generator"][content*="Roundcube" i]') || doc.querySelector("#rcmloginuser, #messagecontframe, #messagebody")) return "roundcube";
    return null;
  }

  // ------------------------------------------------------------------ generic detector
  const ACTION_RE = /^(reply|reply all|reply to all|forward|responder|reenviar|répondre|transférer)$/i;
  const LABEL_RE = /^(from|to|cc|subject|de|para|asunto|à|objet)\s*:?$/i;

  function signals(doc, loc) {
    const s = { actions: 0, labels: 0, address: false, title: false, host: false };
    const seen = new Set();
    for (const el of qa(doc, 'button, [role="button"], a, [aria-label], [title]')) {
      if (!visible(el)) continue;
      const name = clean(el.getAttribute("aria-label") || el.getAttribute("title") || txt(el));
      if (name.length < 30 && ACTION_RE.test(name)) seen.add(name.toLowerCase().replace(/ to all/, " all"));
      if (seen.size >= 3) break;
    }
    s.actions = seen.size;
    let labels = 0, looked = 0;
    for (const el of qa(doc, "th, td, dt, label, span, div, b, strong")) {
      if (++looked > 6000) break;              // keep it quick on huge pages
      if (el.children.length > 1) continue;
      const t = clean(txt(el));
      if (t.length < 10 && LABEL_RE.test(t) && visible(el)) { labels++; if (labels >= 3) break; }
    }
    s.labels = labels;
    s.address = !!qa(doc, 'a[href^="mailto:"], [title*="@"], [email]').find(visible);
    s.title = /\b(inbox|mail|webmail|correo|courriel)\b/i.test(doc.title || "");
    s.host = /(^|\.)(web)?mail\.|^(web)?mail\b|outlook|inbox/i.test(loc.hostname);
    s.score = (s.actions >= 2 ? 3 : s.actions) + Math.min(s.labels, 2) + (s.address ? 1 : 0) + (s.title ? 1 : 0) + (s.host ? 1 : 0);
    return s;
  }
  function linkShare(el, len) { let l = 0; el.querySelectorAll("a").forEach(a => { l += txt(a).length; }); return l / Math.max(len, 1); }
  function messageBlock(doc) {
    // named containers first, then the tightest large block of real prose
    const named = lastVisible(qa(doc, '[aria-label*="message body" i], [data-testid*="message-body" i], [class*="message-body" i], [class*="messagebody" i], [class*="mail-body" i], [id*="messagebody" i], [class*="msg-body" i], [itemprop="articleBody"]'));
    if (named && txt(named).length >= 15) return named;
    const start = q(doc, '[role="main"]') || doc.body;
    if (!start) return null;
    let el = start, len = txt(el).length;
    for (let depth = 0; depth < 40; depth++) {
      let next = null;
      for (const c of el.children) {
        if (!visible(c) || /^(SCRIPT|STYLE|NAV|HEADER|FOOTER|ASIDE|FORM)$/.test(c.tagName)) continue;
        const cl = txt(c).length;
        if (cl >= len * 0.7) { next = c; len = cl; break; }
      }
      if (!next) break;
      el = next;
    }
    const n = txt(el).length;
    if (n < 40 || n > 60000 || linkShare(el, n) > 0.5 || el.querySelector("textarea, [contenteditable='true']")) return null;
    return el;
  }
  function genericSender(doc) {
    for (const el of qa(doc, "th, td, dt, label, span, div, b, strong")) {
      if (el.children.length > 1 || !/^(from|de)\s*:?$/i.test(clean(txt(el)))) continue;
      const row = el.parentElement;
      const m = row && txt(row).match(EMAIL_RE);
      if (m) return clean(txt(row).replace(/^(from|de)\s*:?/i, ""));
    }
    return senderFrom(qa(doc, 'a[href^="mailto:"], [email], [title*="@"]').find(visible));
  }
  function genericSubject(doc) {
    for (const el of qa(doc, "th, td, dt, label, span, div, b, strong")) {
      if (el.children.length > 1 || !/^(subject|asunto|objet)\s*:?$/i.test(clean(txt(el)))) continue;
      const row = el.parentElement; const t = row ? clean(txt(row).replace(/^(subject|asunto|objet)\s*:?/i, "")) : "";
      if (t) return t;
    }
    const h = qa(doc, '[role="main"] h1, [role="main"] h2, [role="main"] [role="heading"], h1, h2').find(visible);
    return h ? txt(h) : "";
  }

  // ------------------------------------------------------------------ public
  function read(doc, loc) {
    doc = doc || document; loc = loc || location;
    if (loc.hostname === "www.icloud.com" && !loc.pathname.startsWith("/mail")) return { isMailPage: false, site: "icloud", email: null, el: null };
    const name = adapterFor(loc, doc);
    if (name) {
      let found = null;
      try { found = ADAPTERS[name](doc); } catch (e) { found = null; }
      if (!found) { const b = messageBlock(doc); const sig = signals(doc, loc); if (b && sig.score >= 3) found = make(name, b, genericSender(doc), genericSubject(doc)); }
      if (found) found.email.hint = mailboxHint(loc);
      return { isMailPage: true, site: name, email: found ? found.email : null, el: found ? found.el : null };
    }
    const sig = signals(doc, loc);
    const isMailPage = sig.score >= 3;
    let found = null;
    // an email is "open" only when there are Reply/Forward controls or From/Subject labels on screen
    if (isMailPage && (sig.actions >= 1 || sig.labels >= 2)) found = make("generic", messageBlock(doc), genericSender(doc), genericSubject(doc));
    return { isMailPage, site: "generic", email: found ? found.email : null, el: found ? found.el : null, score: sig.score };
  }
  // Gmail sorts mail into tabs; an email opened from one has it in the address (#category/promotions/...).
  function mailboxHint(loc) {
    if (loc.hostname !== "mail.google.com") return null;
    const m = (loc.hash || "").match(/^#category\/(promotions|social|updates|forums)\b/);
    return m ? m[1] : null;
  }
  function readPlain(doc, loc) { const r = read(doc, loc); return { isMailPage: r.isMailPage, site: r.site, email: r.email }; }

  root.CGMailReader = { read, readPlain };
})(typeof self !== "undefined" ? self : globalThis);
