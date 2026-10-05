/* CampusGuard for Gmail & Outlook on the web.
   Finds each opened email, sends its text to the extension's own service worker (which runs the
   model locally) and shows a compact verdict card above the message. Nothing leaves the browser. */
(function () {
  "use strict";
  if (window.__cgMail) return;
  window.__cgMail = true;
  const host = location.hostname;
  const isGmail = host === "mail.google.com";

  const CSS = `
  :host { all: initial; }
  .cg { font: 14px/1.45 "Segoe UI", system-ui, -apple-system, sans-serif; color: #17153a; background: #fff; border: 1px solid #dddbee;
        border-left: 6px solid var(--c); border-radius: 12px; padding: 10px 12px; margin: 8px 0 12px; max-width: 720px;
        box-shadow: 0 1px 2px rgba(23,21,58,.06), 0 6px 18px rgba(23,21,58,.08); }
  .top { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .logo { display: flex; align-items: center; gap: 6px; font-weight: 700; color: #2b2470; }
  .pill { background: var(--s); color: var(--c); font-weight: 700; padding: 3px 10px; border-radius: 999px; }
  .pct { margin-left: auto; font-weight: 700; color: var(--c); font-variant-numeric: tabular-nums; }
  .meter { height: 5px; background: #ecebf6; border-radius: 999px; overflow: hidden; margin: 8px 0; }
  .meter i { display: block; height: 100%; background: var(--c); }
  ul { margin: 4px 0 0; padding: 0; list-style: none; display: grid; gap: 3px; }
  li { display: flex; gap: 6px; align-items: baseline; }
  li::before { content: ""; width: 7px; height: 7px; border-radius: 50%; background: var(--c); flex: none; transform: translateY(-1px); }
  .sub { color: #4a4770; margin: 4px 0 0; }
  .row { display: flex; gap: 8px; margin-top: 8px; flex-wrap: wrap; }
  button { font: inherit; border: 1px solid #dddbee; background: #fff; color: #17153a; border-radius: 8px; padding: 5px 10px; cursor: pointer; font-weight: 600; }
  button.main { background: #9b3f7d; border-color: #9b3f7d; color: #fff; }
  .x { margin-left: 6px; border: 0; padding: 2px 6px; color: #7a77a0; }
  .tip { margin-top: 8px; padding: 8px; background: #f7f6fc; border-radius: 8px; color: #4a4770; }
  @media (prefers-color-scheme: dark) {
    .cg { background: #161538; color: #ecebff; border-color: #2c2a5c; } .logo { color: #cdc6ff; } .sub, .tip { color: #b9b6e6; }
    .tip { background: #1c1a45; } button { background: #1c1a45; color: #ecebff; border-color: #2c2a5c; } .meter { background: #2c2a5c; }
  }`;
  const COLORS = { high: ["#d62f4b", "#fde6ea"], medium: ["#b97a00", "#fff1d1"], low: ["#188a55", "#dcf4e7"] };
  const SHIELD = '<svg width="18" height="20" viewBox="0 0 34 38" aria-hidden="true"><path d="M17 1 32 7v11c0 9.5-6.4 16.4-15 19C8.4 34.4 2 27.5 2 18V7L17 1Z" fill="#4fd1c5"/><path d="m10.5 18.5 4.5 4.5 8.5-9" fill="none" stroke="#17153a" stroke-width="3.4" stroke-linecap="round"/></svg>';
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  let autoScan = true;
  try { chrome.storage.sync.get({ autoScan: true }, v => { autoScan = v.autoScan; scan(); }); } catch (e) { /* ignore */ }

  // ---------------------------------------------------------- extraction
  function gmailMessages() {
    const out = [];
    document.querySelectorAll("div.a3s").forEach(body => {
      if (!body.offsetParent || body.closest(".gmail_quote")) return;
      const box = body.closest("div.adn") || body.parentElement;
      const s = box && box.querySelector("span.gD");
      const sender = s ? ((s.getAttribute("name") || s.textContent || "").trim() + " <" + (s.getAttribute("email") || "") + ">") : "";
      const subj = document.querySelector("h2.hP");
      out.push({ body, anchor: body, sender, subject: subj ? subj.textContent.trim() : "" });
    });
    return out;
  }
  function outlookMessages() {
    const out = [];
    document.querySelectorAll('div[aria-label="Message body"], div[aria-label="Message Body"]').forEach(body => {
      if (!body.offsetParent) return;
      const pane = body.closest('[role="main"]') || document;
      const heading = pane.querySelector('[role="heading"][aria-level="2"], [role="heading"]');
      let sender = "";
      const cand = pane.querySelector('span[title*="@"], [aria-label^="From"] span, [data-testid="SenderPersona"]');
      if (cand) {
        const t = cand.getAttribute("title") || cand.textContent || "";
        const m = t.match(/[^\s<>()]+@[^\s<>()]+/);
        sender = m ? ((cand.textContent || "").replace(m[0], "").replace(/[<>]/g, "").trim() + " <" + m[0] + ">") : t;
      }
      out.push({ body, anchor: body, sender, subject: heading ? heading.textContent.trim() : "" });
    });
    return out;
  }

  // ---------------------------------------------------------- panel
  function mount(msg) {
    const holder = document.createElement("div");
    holder.className = "cg-holder";
    holder.style.cssText = "display:block;";
    msg.anchor.parentNode.insertBefore(holder, msg.anchor);
    const root = holder.attachShadow({ mode: "open" });
    return { holder, root };
  }
  function bodyText(el) {
    // innerText keeps line breaks; links' visible text is kept and their real targets appended
    let t = el.innerText || el.textContent || "";
    const hrefs = [...el.querySelectorAll("a[href]")].map(a => a.getAttribute("href")).filter(h => /^https?:/i.test(h) && t.indexOf(h) === -1);
    const uniq = [...new Set(hrefs)].slice(0, 15);
    if (uniq.length) t += "\n\nLinks in this email: " + uniq.join(" ");
    return t;
  }
  function analyze(msg, ui) {
    const text = (msg.subject ? msg.subject + "\n" : "") + bodyText(msg.body);
    chrome.runtime.sendMessage({ type: "cg-analyze", text, sender: msg.sender }, res => {
      if (!res || !res.ok) return;
      draw(ui, res.result, { text, sender: msg.sender });
    });
  }
  function draw(ui, r, payload) {
    const [c, s] = COLORS[r.risk_level] || COLORS.low;
    const flags = (r.red_flags || []).filter(f => f.flag !== "suspicious_wording").slice(0, 3);
    const n = (r.red_flags || []).length;
    ui.root.innerHTML = "<style>" + CSS + '</style><div class="cg" style="--c:' + c + ";--s:" + s + '">' +
      '<div class="top"><span class="logo">' + SHIELD + 'CampusGuard</span><span class="pill">' + esc(r.verdict) + '</span><span class="pct">' + Math.round(r.risk_score * 100) + '% phishing risk</span><button class="x" title="Hide">✕</button></div>' +
      '<div class="meter"><i style="width:' + Math.round(r.risk_score * 100) + '%"></i></div>' +
      (r.risk_level === "low" ? '<div class="sub">No strong warning signs found.' + ((r.good_signs || [])[0] ? " " + esc(r.good_signs[0]) + "." : "") + "</div>"
        : '<div class="sub">' + n + " warning sign" + (n === 1 ? "" : "s") + " detected</div><ul>" + flags.map(f => "<li>" + esc(f.label) + "</li>").join("") + "</ul>") +
      '<div class="row"><button class="main" data-a="full">View full analysis</button>' + (r.risk_level !== "low" ? '<button data-a="report">Report phishing</button>' : "") + '</div><div class="tip" hidden></div></div>';
    ui.root.querySelector(".x").onclick = () => ui.holder.remove();
    ui.root.querySelector('[data-a="full"]').onclick = () => chrome.runtime.sendMessage({ type: "cg-open-report", payload: Object.assign({ result: r }, payload) });
    const rep = ui.root.querySelector('[data-a="report"]');
    if (rep) rep.onclick = () => {
      const tip = ui.root.querySelector(".tip"); tip.hidden = false;
      tip.textContent = isGmail ? "Open this email's ⋮ menu (top right of the message) and choose \"Report phishing\", then delete it. Clicked a link or typed your password? Change it now and contact the IT help desk."
        : "Choose Report → Report phishing in the Outlook toolbar, then delete it. Clicked a link or typed your password? Change it now and contact the IT help desk.";
    };
  }
  function drawButton(ui, msg) {
    ui.root.innerHTML = "<style>" + CSS + '</style><div class="cg" style="--c:#4fd1c5;--s:#dff4f1;padding:6px 10px"><div class="top"><span class="logo">' + SHIELD + 'CampusGuard</span><button class="main" style="margin-left:auto">Check this email</button></div></div>';
    ui.root.querySelector("button").onclick = () => analyze(msg, ui);
  }

  // ---------------------------------------------------------- loop
  function scan() {
    const msgs = isGmail ? gmailMessages() : outlookMessages();
    for (const m of msgs) {
      const key = (m.subject + "|" + (m.body.innerText || "").slice(0, 200)).length + ":" + (m.body.innerText || "").slice(0, 80);
      if (m.body.dataset.cgKey === key) continue;
      m.body.dataset.cgKey = key;
      const prev = m.body.previousElementSibling;
      if (prev && prev.classList.contains("cg-holder")) prev.remove();
      const ui = mount(m);
      if (autoScan) analyze(m, ui); else drawButton(ui, m);
    }
  }
  let t = null;
  new MutationObserver(() => { clearTimeout(t); t = setTimeout(scan, 600); }).observe(document.body, { childList: true, subtree: true });
  scan();
})();
