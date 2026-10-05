(function () {
  chrome.storage.session.get("cgReport", v => {
    const p = v.cgReport; if (!p) return;
    const r = p.result, R = CGRender;
    let h = (p.sender ? '<div class="muted">From: ' + R.esc(p.sender) + "</div>" : "") + R.verdict(r);
    if ((r.red_flags || []).length) h += "<section><h2>Red flags</h2>" + R.flags(r) + "</section>";
    const g = R.good(r); if (g) h += "<section><h2>Signs pointing the other way</h2>" + g + "</section>";
    const sc = r.sender_check;
    if (sc && sc.provided) h += "<section><h2>Sender check</h2>" + '<div class="link"><div class="u">' + R.esc(sc.raw) + "</div><ul>" +
      sc.checks.map(c => "<li>" + R.esc(c.label) + (c.id === "address" ? "" : "? ") + "<b>" + (c.hit ? "Yes" : "No") + "</b> · " + R.esc(c.detail) + "</li>").join("") +
      '</ul><div class="todo" style="font-family:var(--f-mono)">' + R.esc(sc.formula) + "</div><p class=\"expl\">" + R.esc(sc.summary) + "</p></div></section>";
    if (r.input_type === "message") h += "<section><h2>The message, marked up</h2>" + R.annotated(r) + "</section>";
    if ((r.urls || []).length) h += "<section><h2>Links (read as text, never opened)</h2>" + R.links(r) + "</section>";
    h += '<section><h2>Report it</h2><div class="todo">In Gmail, open the message menu (⋮) and choose <b>Report phishing</b>. In Outlook, choose <b>Report → Report phishing</b>. Then delete it. If you clicked a link or entered your password, change your password and contact the campus IT help desk right away.</div></section>';
    document.getElementById("body").innerHTML = h;
    chrome.storage.session.remove("cgReport");
  });
})();
