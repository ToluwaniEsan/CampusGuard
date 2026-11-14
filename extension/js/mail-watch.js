/* CampusGuard v3: runs only on email sites the user has allowed.
   Watches for the open email to change, hands that one email to the extension's own service worker
   (which runs the model on this device) and lets it raise the scam alert.
   Nothing is saved and nothing leaves the browser. */
(function () {
  "use strict";
  if (window.__cgWatch && window.__cgWatch.stop) { try { window.__cgWatch.stop(); } catch (e) { /* old copy from before an update */ } }

  const DEFAULTS = { autoCheck: true, popAlert: true, sites: {} };
  let settings = DEFAULTS, lastKey = null, hiddenFor = null, lastResult = null, card = null, timer = null, stopped = false;
  const origin = location.origin;
  const siteOn = () => !(settings.sites[origin] && settings.sites[origin].enabled === false);

  function send(msg) {
    return new Promise(res => {
      try { chrome.runtime.sendMessage(msg, r => { void chrome.runtime.lastError; res(r); }); } catch (e) { stop(); res(null); }
    });
  }

  // ---------------------------------------------------------------- the loop
  // Each email is read ONCE, right after it opens: CampusGuard waits until its text has finished loading
  // (the same text twice in a row, 0.4 s apart), checks it, and then ignores later changes to that page.
  // An email counts as "the same" while its address in the tab, sender and subject stay the same.
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const identOf = e => location.pathname + location.hash + "|" + e.sender + "|" + e.subject;
  let lastIdent = null, reading = null;
  let lastHref = location.href;
  async function tick() {
    if (stopped) return;
    if (location.href !== lastHref) { lastHref = location.href; lastIdent = null; lastKey = null; }   // moved: report again
    if (!siteOn()) { if (lastKey !== "off") { lastKey = "off"; lastIdent = null; removeCard(); send({ type: "cg-state", state: "off" }); } return; }
    const r = CGMailReader.read(document, location);
    if (!r.isMailPage || !r.email) {
      const state = r.isMailPage ? "no-email" : "not-mail";
      if (lastKey !== state) { lastKey = state; lastIdent = null; lastResult = null; removeCard(); send({ type: "cg-state", state }); }
      return;
    }
    const ident = identOf(r.email);
    if (ident === lastIdent || ident === reading) return;      // already checked, or being read right now
    reading = ident;
    let email = r.email, el = r.el;
    for (let i = 0; i < 6; i++) {                               // let the first load finish (at most ~2.4 s)
      await sleep(400);
      const again = CGMailReader.read(document, location);
      if (!again.email || identOf(again.email) !== ident) { reading = null; soon(0); return; }   // they moved on
      if (again.email.text === email.text) break;
      email = again.email; el = again.el;
    }
    reading = null; lastIdent = ident; lastKey = email.key;
    if (!settings.autoCheck) { removeCard(); send({ type: "cg-state", state: "ready" }); return; }
    const res = await send({ type: "cg-mail", email });
    if (!res || !res.ok || lastIdent !== ident) return;
    lastResult = { result: res.result, email };
    if (res.alert === "page" && hiddenFor !== ident) drawAlert(res.result, email); else removeCard();
  }
  // Noticing that a new email was opened: webmail pages change constantly (Gmail many times a second), so
  // look at most once per 600 ms after a change, plus a 2 s heartbeat. Looking is cheap; an email is only
  // read and checked once (above).
  let due = 0;
  function soon(ms) {
    const at = Date.now() + (ms == null ? 600 : ms);
    if (timer && at >= due) return;               // a check is already coming soon enough
    clearTimeout(timer); due = at;
    timer = setTimeout(() => { timer = null; tick(); }, Math.max(0, at - Date.now()));
  }
  const beat = setInterval(() => { if (!chrome.runtime || !chrome.runtime.id) { stop(); return; } if (!document.hidden) soon(0); }, 2000);

  const obs = new MutationObserver(() => soon());
  obs.observe(document.documentElement, { childList: true, subtree: true, characterData: false });
  window.addEventListener("hashchange", () => soon(300));
  window.addEventListener("popstate", () => soon(300));

  const onMsg = (msg, _sender, reply) => {
    if (msg && msg.type === "cg-recheck") { lastIdent = null; lastKey = null; soon(150); return; }
    if (!msg || msg.type !== "cg-get-email") return;
    const r = CGMailReader.readPlain(document, location);
    reply(r);
  };
  chrome.runtime.onMessage.addListener(onMsg);

  const onStore = (changes, area) => {
    if (area !== "local") return;
    for (const k of Object.keys(changes)) if (k in DEFAULTS) settings = Object.assign({}, settings, { [k]: changes[k].newValue === undefined ? DEFAULTS[k] : changes[k].newValue });
    if (!settings.popAlert) removeCard();
    lastKey = null; lastIdent = null; soon(50);
  };
  chrome.storage.onChanged.addListener(onStore);

  function stop() {
    stopped = true; obs.disconnect(); clearTimeout(timer); clearInterval(beat); removeCard();
    try { chrome.runtime.onMessage.removeListener(onMsg); chrome.storage.onChanged.removeListener(onStore); } catch (e) { /* extension gone */ }
  }
  window.__cgWatch = { stop };

  chrome.storage.local.get(DEFAULTS, v => { settings = Object.assign({}, DEFAULTS, v); soon(0); });

  // ---------------------------------------------------------------- backup alert
  // Normally the scam alert is the CampusGuard drop-down itself. Browsers that won't let an extension open it
  // (or a window that isn't focused) get this small card in the top-right corner, under the toolbar icon.
  const CSS = `
  :host { all: initial; }
  .cg { position: fixed; top: 10px; right: 14px; z-index: 2147483647; width: 320px; font: 13px/1.4 "Segoe UI", system-ui, -apple-system, sans-serif;
        color: #17153a; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 30px rgba(23,21,58,.25), 0 1px 3px rgba(23,21,58,.2);
        animation: drop .22s ease-out; }
  @keyframes drop { from { transform: translateY(-12px); opacity: 0; } }
  .res { border-left: 6px solid var(--c); background: var(--s); padding: 10px 12px; display: flex; gap: 10px; align-items: center; }
  .vt { flex: 1; } .vt b { display: block; font-size: 16px; color: var(--c); } .vt span { font-size: 12px; }
  .num { color: var(--c); text-align: center; line-height: 1; } .num b { display: block; font-size: 26px; } .num small { font-size: 10px; color: #4a4770; }
  ul { margin: 8px 12px 4px; padding: 0; list-style: none; display: grid; gap: 4px; }
  li { display: flex; gap: 7px; align-items: baseline; } li::before { content: ""; width: 7px; height: 7px; border-radius: 50%; background: var(--c); flex: none; }
  .acts { display: flex; gap: 8px; padding: 6px 12px 10px; align-items: center; }
  button { font: inherit; font-weight: 600; border-radius: 8px; padding: 5px 10px; cursor: pointer; border: 1px solid #9b3f7d; background: #9b3f7d; color: #fff; }
  button.x { margin-left: auto; border: 0; background: transparent; color: #4a4770; padding: 4px 6px; }
  button:focus-visible { outline: 3px solid #0a6f67; outline-offset: 2px; }
  @media (prefers-color-scheme: dark) { .cg { background: #161538; color: #ecebff; } .num small { color: #b9b6e6; } button.x { color: #b9b6e6; } }
  @media (prefers-reduced-motion: reduce) { .cg { animation: none; } }`;
  const COLORS = { high: ["#b81f3b", "#fde6ea"], medium: ["#855400", "#fff1d1"], low: ["#126c42", "#dcf4e7"] };
  const HEAD = { high: "Don't click, reply or pay.", medium: "Be careful with this one." };
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  let fadeT = null;

  function removeCard() { clearTimeout(fadeT); if (card) { card.remove(); card = null; } }
  // built with DOM calls, not innerHTML: Gmail's page security (Trusted Types) can block HTML strings
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const k in attrs || {}) { if (k === "class") el.className = attrs[k]; else if (k === "style") el.style.cssText = attrs[k]; else el.setAttribute(k, attrs[k]); }
    for (const c of kids) if (c != null) el.append(c);
    return el;
  }
  function drawAlert(r, email) {
    removeCard();
    card = document.createElement("div");
    card.className = "cg-holder";
    document.documentElement.appendChild(card);
    const root = card.attachShadow({ mode: "open" });
    const [c, s] = COLORS[r.risk_level] || COLORS.medium;
    const RANK = { High: 0, Medium: 1, Low: 2 };
    const flags = (r.red_flags || []).filter(f => f.flag !== "suspicious_wording").map((f, i) => [f, i])
      .sort((a, b) => (RANK[a[0].severity] - RANK[b[0].severity]) || (a[1] - b[1])).slice(0, 3).map(x => x[0]);
    const style = document.createElement("style"); style.textContent = CSS;
    const full = h("button", null, "See full breakdown"), x = h("button", { class: "x", "aria-label": "Close" }, "✕");
    const tag = r.category && r.category.id !== "personal" ? " · " + r.category.label : "";
    const box = h("div", { class: "cg", role: "alert", style: "--c:" + c + ";--s:" + s },
      h("div", { class: "res" },
        h("div", { class: "vt" }, h("b", null, r.verdict), h("span", null, (HEAD[r.risk_level] || "") + tag)),
        h("div", { class: "num" }, h("b", null, String(Math.round(r.risk_score * 100))), h("small", null, "risk / 100"))),
      h("ul", null, ...flags.map(f => h("li", null, f.label))),
      h("div", { class: "acts" }, full, x));
    root.append(style, box);
    x.onclick = () => { hiddenFor = lastIdent; removeCard(); };
    full.onclick = () => send({ type: "cg-open-report", payload: { result: r, text: email.text, sender: email.sender, url: location.href } });
    if (r.risk_level === "medium") {                 // Suspicious fades after 8 s; High Risk stays until closed
      fadeT = setTimeout(removeCard, 8000);
      box.addEventListener("mouseenter", () => clearTimeout(fadeT));
    }
  }
})();
