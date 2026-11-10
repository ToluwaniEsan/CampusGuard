/* Shared rendering for the extension popup and the full report page. */
(function (root) {
  "use strict";
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pct = x => Math.round(x * 100);
  const TONE = { url_ip_host: "hi", url_lookalike: "hi", sender_freemail_official: "hi", credential_request: "hi", sensitive_info: "hi",
    asks_for_secrets: "hi", upfront_payment: "hi", threat: "hi", url_at_or_redirect: "hi", url: "hi", suspicious_wording: "word" };

  const ICON = {
    high: '<path d="M8 2h8l6 6v8l-6 6H8l-6-6V8z"/><path d="M12 7v6M12 17h.01"/>',
    medium: '<path d="M12 3 2 20h20L12 3z"/><path d="M12 10v4M12 17h.01"/>',
    low: '<path d="m5 12 5 5 9-10"/>',
  };
  const HEAD = { high: "Don't click, reply or pay", medium: "Be careful with this one", low: "This looks fine" };
  function verdict(r) {
    const lvl = r.risk_level, head = r.input_type === "url" ? { high: "Don't open this link", medium: "Be careful with this link", low: "This link looks fine" }[lvl] : HEAD[lvl];
    return '<div class="verdict lvl-' + lvl + '" role="status"><div class="vtop"><span class="badge"><svg viewBox="0 0 24 24" aria-hidden="true">' + ICON[lvl] + "</svg>" + esc(r.verdict) + "</span>" +
      '<span class="score" title="How closely this matches known scams. It ranks risk; it is not a probability."><b>' + pct(r.risk_score) + "</b>risk score / 100</span></div>" +
      '<h2 class="vhead">' + head + '</h2><p class="expl">' + esc(r.explanation) + "</p>" +
      (r.recommended_action ? '<div class="todo"><b>What to do:</b> ' + esc(r.recommended_action) + "</div>" : "") + "</div>";
  }
  function flags(r, max) {
    const f = (r.red_flags || []).slice(0, max || 99);
    if (!f.length) return "";
    return '<div class="flags">' + f.map(x => '<div class="flag"><span class="dot ' + x.severity + '"></span><div style="min-width:0"><b>' + esc(x.label) + "</b>" +
      (x.why ? "<small>" + esc(x.why) + "</small>" : "") + (x.evidence || []).slice(0, 3).map(e => "<code>" + esc(e) + "</code>").join("") +
      '</div><span class="sev ' + x.severity + '">' + x.severity + "</span></div>").join("") + "</div>";
  }
  function annotated(r) {
    let out = "", pos = 0; const t = r.analyzed_text || "";
    for (const h of r.highlights || []) {
      if (h.start < pos) continue;
      out += esc(t.slice(pos, h.start)) + '<mark class="' + (TONE[h.flag] || "") + '">' + esc(t.slice(h.start, h.end)) + "</mark>";
      pos = h.end;
    }
    return '<div class="annotated">' + out + esc(t.slice(pos)) + "</div>";
  }
  function links(r) {
    if (!(r.urls || []).length) return "";
    return '<div style="display:grid;gap:6px">' + r.urls.map(u => '<div class="link"><div class="u">' + esc(u.url) + '</div><div class="muted">Real owner: <b>' + esc(u.domain) + "</b> · link score " + pct(u.risk_score) + "/100 · never opened</div>" +
      (u.reasons.length ? "<ul>" + u.reasons.map(x => "<li>" + esc(x) + "</li>").join("") + "</ul>" : "") + "</div>").join("") + "</div>";
  }
  function good(r) {
    const g = (r.good_signs || []).filter(x => r.risk_level !== "high" || x.indexOf("Reads like") !== 0);
    return g.length ? '<div class="good">' + g.map(x => "<div>✓ " + esc(x) + "</div>").join("") + "</div>" : "";
  }
  root.CGRender = { verdict, flags, annotated, links, good, esc, pct };
})(typeof self !== "undefined" ? self : globalThis);
