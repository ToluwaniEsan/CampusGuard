/*
 * CampusGuard intake: works out WHAT was pasted before the model scores it.
 *
 * People copy a whole email at once (sender line, date, subject, body) or drop a screenshot.
 * The model scores "who sent it" and "what it says" differently, so this step separates them:
 *   kind    : "link" | "email" | "message"
 *   sender  : 'Name <address>' when a From line / address line is found near the top
 *   subject : when a Subject line is present
 *   body    : everything else (subject kept as its first line, like the training data)
 *   found   : short notes for the UI ("Sender found", "Subject found", ...)
 *
 * It is rule-based on purpose: mail clients only have a handful of header layouts, so
 * patterns are exact and explainable, and there is no labelled data to train a model on.
 * The user can always correct the detected sender.
 */
(function (root) {
  "use strict";
  const EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
  const HEADER = /^\s*(from|sender|to|cc|bcc|date|sent|subject|reply-to|received|mailed-by|signed-by)\s*:\s*(.*)$/i;
  const ANGLE = /^(.*?)[<\[(]\s*([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})\s*[>\])](.*)$/i;
  const BARE = /^\s*([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})\s*$/i;
  const NOISE = /^\s*(inbox|external|spam|important|starred|unsubscribe|reply|reply all|forward|to me|to you|to:? ?me.*|\d+ of \d+|print all|in new window|-+\s*forwarded message\s*-+|-+\s*original message\s*-+)\s*$/i;
  const DATEISH = /^\s*(?:(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*,?\s*)?(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(?:,?\s*\d{4})?|\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})?[,\s]*(?:at\s*)?(?:\d{1,2}:\d{2}\s*(?:am|pm)?)?\s*(?:\(.*ago\))?\s*$/i;
  const URL_ONLY = /^([a-z][a-z0-9+.-]*:\/\/)?[\w-]+(\.[\w-]+)+\.?(:\d+)?(\/\S*)?$/i;

  function clean(s) { return s.replace(/^[\s"'“”]+|[\s"'“”,;:]+$/g, ""); }
  function isDateish(l) { return l.trim().length > 0 && l.trim().length <= 48 && DATEISH.test(l) && /\d/.test(l); }

  function parse(raw) {
    const text = String(raw || "").replace(/\r\n?/g, "\n").trim();
    const out = { kind: "message", sender: "", subject: "", body: text, found: [] };
    if (!text) return out;
    if (!/\s/.test(text) && URL_ONLY.test(text) && !BARE.test(text)) { out.kind = "link"; return out; }

    const lines = text.split("\n");
    const drop = new Set();
    let sender = "", subject = "";
    // nonempty lines near the top are where headers live
    const top = [];
    for (let i = 0; i < lines.length && top.length < 10; i++) if (lines[i].trim()) top.push(i);

    // A. explicit header lines (From:, Subject:, To:, Date:...)
    let headerHits = 0;
    for (const i of top) {
      const m = HEADER.exec(lines[i]);
      if (!m) continue;
      const key = m[1].toLowerCase(), val = m[2].trim();
      if (key === "from" || key === "sender") {
        if (!sender && val) {
          const a = ANGLE.exec(val);
          if (a) sender = clean(a[1]) ? clean(a[1]) + " <" + a[2] + ">" : a[2];
          else if (EMAIL.test(val)) { const e = EMAIL.exec(val)[0]; const n = clean(val.replace(e, "")); sender = n ? n + " <" + e + ">" : e; }
          else sender = val;             // a name with no address still helps the display-name checks
        }
        drop.add(i); headerHits++;
      } else if (key === "subject") { if (!subject) subject = val; drop.add(i); headerHits++; }
      else if (val.length <= 200) { drop.add(i); headerHits++; }
    }

    // B. "Name <address>" line near the top (Gmail / Outlook copy, screenshots)
    if (!sender) {
      for (let k = 0; k < top.length && k < 8; k++) {
        const i = top[k], l = lines[i];
        if (l.length > 140) continue;
        const a = ANGLE.exec(l);
        if (!a) continue;
        let name = clean(a[1]);
        const tail = a[3].trim();
        if (name.length > 70 || name.split(/\s+/).length > 9 || /[!?]/.test(name) || /\b(contact|e-?mail|reply|send|write|reach|call|at|to)\s*:?$/i.test(name) || /\b(contact|kindly|please|reply to|send (it|your))\b/i.test(name) || (tail && !isDateish(tail) && tail.length > 30)) continue;
        if (!name && k > 0) {          // name on the line above the address
          const p = lines[top[k - 1]].trim();
          if (p.length <= 60 && !EMAIL.test(p) && !/[.!?]$/.test(p)) { name = clean(p); drop.add(top[k - 1]); }
        }
        sender = name ? name + " <" + a[2] + ">" : a[2];
        drop.add(i);
        break;
      }
    }
    // C. a bare address on its own line near the top
    if (!sender) {
      for (let k = 0; k < top.length && k < 5; k++) {
        const i = top[k], b = BARE.exec(lines[i]);
        if (!b) continue;
        let name = "";
        if (k > 0) { const p = lines[top[k - 1]].trim(); if (p.length <= 60 && !/[.!?]$/.test(p)) { name = clean(p); drop.add(top[k - 1]); } }
        sender = name ? name + " <" + b[1] + ">" : b[1];
        drop.add(i);
        break;
      }
    }

    // D. once a sender/header block is known, strip mail-client clutter around it
    if (sender || headerHits >= 2) {
      for (const i of top) {
        if (drop.has(i)) continue;
        if (NOISE.test(lines[i]) || isDateish(lines[i])) drop.add(i);
      }
    }

    const bodyLines = lines.filter((_, i) => !drop.has(i));
    let body = bodyLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
    if (subject) body = subject + "\n" + body;
    if (!body) body = text;                // never analyse nothing
    out.sender = sender; out.subject = subject; out.body = body;
    out.kind = (sender || headerHits >= 2) ? "email" : "message";
    if (sender) out.found.push("sender");
    if (subject) out.found.push("subject");
    return out;
  }

  const api = { parse };
  root.CampusGuardIntake = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof self !== "undefined" ? self : globalThis);
