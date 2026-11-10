/* CampusGuard v3: runs only on email sites the user has allowed.
   Watches for the open email to change, hands that one email to the extension's own service worker
   (which runs the model on this device) and, if the user turned it on, shows a small card above it.
   Nothing is saved and nothing leaves the browser. */
(function () {
  "use strict";
  if (window.__cgWatch && window.__cgWatch.stop) { try { window.__cgWatch.stop(); } catch (e) { /* old copy from before an update */ } }

  const DEFAULTS = { autoCheck: true, inPageCard: false, sites: {} };
  let settings = DEFAULTS, lastKey = null, hiddenFor = null, lastResult = null, card = null, timer = null, stopped = false;
  const origin = location.origin;
  const siteOn = () => !(settings.sites[origin] && settings.sites[origin].enabled === false);

  function send(msg) {
    return new Promise(res => {
      try { chrome.runtime.sendMessage(msg, r => { void chrome.runtime.lastError; res(r); }); } catch (e) { stop(); res(null); }
    });
  }

  // ---------------------------------------------------------------- the loop
  async function tick() {
    if (stopped) return;
    if (!siteOn()) { if (lastKey !== "off") { lastKey = "off"; removeCard(); send({ type: "cg-state", state: "off" }); } return; }
    const r = CGMailReader.read(document, location);
    if (!r.isMailPage || !r.email) {
      const state = r.isMailPage ? "no-email" : "not-mail";
      if (lastKey !== state) { lastKey = state; lastResult = null; removeCard(); send({ type: "cg-state", state }); }
      return;
    }
    if (r.email.key === lastKey && (!settings.inPageCard || card || hiddenFor === lastKey)) return;
    lastKey = r.email.key;
    if (!settings.autoCheck) { removeCard(); send({ type: "cg-state", state: "ready" }); return; }
    const res = await send({ type: "cg-mail", email: r.email });
    if (!res || !res.ok || lastKey !== r.email.key) return;
    lastResult = { result: res.result, email: r.email };
    if (settings.inPageCard) drawCard(r.el, res.result, r.email); else removeCard();
  }
  function soon(ms) { clearTimeout(timer); timer = setTimeout(tick, ms == null ? 700 : ms); }

  const obs = new MutationObserver(() => soon());
  obs.observe(document.documentElement, { childList: true, subtree: true, characterData: false });
  window.addEventListener("hashchange", () => soon(300));
  window.addEventListener("popstate", () => soon(300));

  const onMsg = (msg, _sender, reply) => {
    if (!msg || msg.type !== "cg-get-email") return;
    const r = CGMailReader.readPlain(document, location);
    reply(r);
  };
  chrome.runtime.onMessage.addListener(onMsg);

  const onStore = (changes, area) => {
    if (area !== "local") return;
    for (const k of Object.keys(changes)) if (k in DEFAULTS) settings = Object.assign({}, settings, { [k]: changes[k].newValue === undefined ? DEFAULTS[k] : changes[k].newValue });
    if (!settings.inPageCard) removeCard();
    lastKey = null; soon(50);
  };
  chrome.storage.onChanged.addListener(onStore);

  function stop() {
    stopped = true; obs.disconnect(); clearTimeout(timer); removeCard();
    try { chrome.runtime.onMessage.removeListener(onMsg); chrome.storage.onChanged.removeListener(onStore); } catch (e) { /* extension gone */ }
  }
  window.__cgWatch = { stop };

  chrome.storage.local.get(DEFAULTS, v => { settings = Object.assign({}, DEFAULTS, v); soon(0); });

  // ---------------------------------------------------------------- optional in-page card
  const CSS = `
  :host { all: initial; }
  .cg { font: 14px/1.45 "Mukta", "Segoe UI", system-ui, -apple-system, sans-serif; color: #17153a; background: #fff; border: 1px solid #dddbee;
        border-left: 5px solid var(--c); border-radius: 12px; padding: 10px 12px; margin: 8px 0 12px; max-width: 720px;
        box-shadow: 0 1px 2px rgba(23,21,58,.06), 0 6px 18px rgba(23,21,58,.08); }
  .top { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .logo { display: flex; align-items: center; gap: 6px; font-weight: 700; color: #2b2470; }
  .pill { background: var(--s); color: var(--c); font-weight: 700; padding: 3px 10px; border-radius: 999px; }
  .pct { margin-left: auto; font-weight: 700; color: var(--c); font-variant-numeric: tabular-nums; }
  ul { margin: 6px 0 0; padding: 0; list-style: none; display: grid; gap: 3px; }
  li { display: flex; gap: 6px; align-items: baseline; }
  li::before { content: ""; width: 7px; height: 7px; border-radius: 50%; background: var(--c); flex: none; transform: translateY(-1px); }
  .sub { color: #4a4770; margin: 4px 0 0; }
  .row { display: flex; gap: 8px; margin-top: 8px; flex-wrap: wrap; }
  button { font: inherit; border: 1px solid #dddbee; background: #fff; color: #17153a; border-radius: 8px; padding: 5px 10px; cursor: pointer; font-weight: 600; }
  button.main { background: #9b3f7d; border-color: #9b3f7d; color: #fff; }
  button:focus-visible { outline: 3px solid #0a6f67; outline-offset: 2px; }
  .x { margin-left: 4px; border: 0; padding: 2px 6px; color: #605c86; background: transparent; }
  @media (prefers-color-scheme: dark) {
    .cg { background: #161538; color: #ecebff; border-color: #2c2a5c; border-left-color: var(--c); } .logo { color: #cdc6ff; } .sub { color: #b9b6e6; }
    button { background: #1c1a45; color: #ecebff; border-color: #2c2a5c; } .x { background: transparent; color: #b9b6e6; }
  }`;
  const COLORS = { high: ["#b81f3b", "#fde6ea"], medium: ["#855400", "#fff1d1"], low: ["#126c42", "#dcf4e7"] };
  const SHIELD = '<svg width="18" height="20" viewBox="0 0 34 38" aria-hidden="true"><path d="M17 1 32 7v11c0 9.5-6.4 16.4-15 19C8.4 34.4 2 27.5 2 18V7L17 1Z" fill="#4fd1c5"/><path d="m10.5 18.5 4.5 4.5 8.5-9" fill="none" stroke="#17153a" stroke-width="3.4" stroke-linecap="round"/></svg>';
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function removeCard() { if (card) { card.remove(); card = null; } }
  function drawCard(anchor, r, email) {
    removeCard();
    if (!anchor || !anchor.parentNode) return;
    card = document.createElement("div");
    card.className = "cg-holder";
    card.style.cssText = "display:block;";
    anchor.parentNode.insertBefore(card, anchor);
    const root = card.attachShadow({ mode: "open" });
    const [c, s] = COLORS[r.risk_level] || COLORS.low;
    const flags = (r.red_flags || []).filter(f => f.flag !== "suspicious_wording").slice(0, 3);
    const n = (r.red_flags || []).length;
    root.innerHTML = "<style>" + CSS + '</style><div class="cg" role="status" style="--c:' + c + ";--s:" + s + '">' +
      '<div class="top"><span class="logo">' + SHIELD + 'CampusGuard</span><span class="pill">' + esc(r.verdict) + '</span>' +
      '<span class="pct" title="How closely this matches known scams. It ranks risk; it is not a probability.">Risk score ' + Math.round(r.risk_score * 100) + '/100</span>' +
      '<button class="x" title="Hide this card" aria-label="Hide this card">✕</button></div>' +
      (r.risk_level === "low" ? '<div class="sub">No strong warning signs found.</div>'
        : '<div class="sub">' + n + " warning sign" + (n === 1 ? "" : "s") + "</div><ul>" + flags.map(f => "<li>" + esc(f.label) + "</li>").join("") + "</ul>") +
      '<div class="row"><button class="main" data-a="full">View full analysis</button></div></div>';
    root.querySelector(".x").onclick = () => { hiddenFor = lastKey; removeCard(); };
    root.querySelector('[data-a="full"]').onclick = () => send({ type: "cg-open-report", payload: { result: r, text: email.text, sender: email.sender, url: location.href } });
  }
})();
