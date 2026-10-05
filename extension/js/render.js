/* Shared rendering for the extension popup and the full report page. */
(function (root) {
  "use strict";
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pct = x => Math.round(x * 100);
  const TONE = { url_ip_host: "hi", url_lookalike: "hi", sender_freemail_official: "hi", credential_request: "hi", sensitive_info: "hi",
    asks_for_secrets: "hi", upfront_payment: "hi", threat: "hi", url_at_or_redirect: "hi", url: "hi", suspicious_wording: "word" };

  function verdict(r) {
    return '<div class="verdict lvl-' + r.risk_level + '"><div class="vtop"><span class="pill">' + esc(r.verdict) + '</span><span class="riskn">' + pct(r.risk_score) + '%</span></div>' +
      '<div class="meter"><i style="width:' + pct(r.risk_score) + '%"></i></div><p class="expl">' + esc(r.explanation) + "</p>" +
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
    return '<div style="display:grid;gap:6px">' + r.urls.map(u => '<div class="link"><div class="u">' + esc(u.url) + '</div><div class="muted">Real owner: <b>' + esc(u.domain) + "</b> · " + pct(u.risk_score) + "% risky · never opened</div>" +
      (u.reasons.length ? "<ul>" + u.reasons.map(x => "<li>" + esc(x) + "</li>").join("") + "</ul>" : "") + "</div>").join("") + "</div>";
  }
  function good(r) {
    const g = (r.good_signs || []).filter(x => r.risk_level !== "high" || x.indexOf("Reads like") !== 0);
    return g.length ? '<div class="good">' + g.map(x => "<div>✓ " + esc(x) + "</div>").join("") + "</div>" : "";
  }
  root.CGRender = { verdict, flags, annotated, links, good, esc, pct };
})(typeof self !== "undefined" ? self : globalThis);
