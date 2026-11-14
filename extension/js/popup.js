/* CampusGuard v3.1 toolbar drop-down.
   One compact card: colour, verdict, score and the top reasons. The long report opens in its own tab.
   Pasting is hidden behind "Check something else"; settings behind the gear. */
(function () {
  "use strict";
  const $ = s => document.querySelector(s);
  const S = CGSites, R = CGRender, esc = R.esc;
  const DEFAULTS = { autoCheck: true, popAlert: true, sites: {} };
  const READER = ["js/mail-reader.js", "js/mail-watch.js"];
  const HEAD = { high: "Don't click, reply or pay.", medium: "Be careful with this one.", low: "Nothing worrying found." };
  const SKIP = new Set(["suspicious_wording"]);
  let tab = null, url = "", origin = null, host = "", lastEmail = null, lastPaste = null, autoOpened = false;

  $("#ver").textContent = "v" + chrome.runtime.getManifest().version;
  const getSettings = () => chrome.storage.local.get(DEFAULTS).then(v => Object.assign({}, DEFAULTS, v));
  const send = msg => new Promise(res => chrome.runtime.sendMessage(msg, r => { void chrome.runtime.lastError; res(r); }));
  const on = (sel, fn) => { const el = $(sel); if (el) el.addEventListener("click", fn); };
  const main = html => { $("#v-main").innerHTML = html; };

  // ------------------------------------------------------------------ views: main / paste / settings
  function view(name) {
    $("#v-main").hidden = name !== "main"; $("#v-paste").hidden = name !== "paste"; $("#v-settings").hidden = name !== "settings";
    $("#back").hidden = name === "main"; $("#gear").hidden = name === "settings"; $("#other").hidden = name !== "main";
    if (name === "settings") drawSettings();
    if (name === "paste") $("#text").focus();
    stopFade();
  }
  on("#gear", () => view("settings"));
  on("#back", () => view("main"));
  on("#other", () => view("paste"));

  // ------------------------------------------------------------------ the compact result card
  const RANK = { High: 0, Medium: 1, Low: 2 };
  const topFlags = r => (r.red_flags || []).filter(f => !SKIP.has(f.flag)).map((f, i) => [f, i])
    .sort((a, b) => (RANK[a[0].severity] - RANK[b[0].severity]) || (a[1] - b[1])).slice(0, 3).map(x => x[0]);
  function card(r, sender) {
    const lvl = r.risk_level;
    let items;
    if (lvl === "low") items = (r.good_signs || []).filter(g => g.indexOf("Reads like") !== 0).slice(0, 2).map(g => ({ label: g }));
    else {
      const seen = new Set();
      items = topFlags(r).map(f => { const ev = (f.evidence || []).find(e => !seen.has(e)); if (ev) seen.add(ev); return { label: f.label, ev }; });
    }
    return '<div class="lvl-' + lvl + '"><div class="res" role="status"><div class="top"><div class="vt"><b>' + esc(r.verdict) + "</b><span>" + HEAD[lvl] + "</span></div>" +
      '<div class="num" title="How closely this matches known scams. It ranks risk; it is not a probability."><b>' + R.pct(r.risk_score) + "</b><small>risk / 100</small></div></div></div>" +
      (autoOpened && lvl === "medium" ? '<div class="fade" id="fadebar"></div>' : "") +
      (items.length ? '<div class="why"><h3>' + (lvl === "low" ? "Why it looks fine" : "Why") + "</h3><ul>" +
        items.map(i => "<li><span>" + esc(i.label) + (i.ev ? "<small>“" + esc(i.ev) + "”</small>" : "") + "</span></li>").join("") + "</ul></div>" : "") +
      (sender ? '<div class="from" title="' + esc(sender) + '">From: ' + esc(sender) + "</div>" : "") +
      '<div class="acts"><button class="btn primary small" data-full>See full breakdown</button>' + (lvl !== "low" ? '<button class="linkbtn" data-report>How to report it</button>' : "") + "</div>" +
      '<div class="tip" data-tip hidden></div></div>';
  }
  function wireCard(scope, payload) {
    scope.querySelector("[data-full]").addEventListener("click", () => send({ type: "cg-open-report", payload }));
    const rep = scope.querySelector("[data-report]");
    if (rep) rep.addEventListener("click", () => { const t = scope.querySelector("[data-tip]"); t.hidden = false; t.textContent = S.reportTip(payload.url || url); });
  }

  // Suspicious alerts that popped up on their own fade after 8 seconds, unless the user is using the popup.
  let fadeTimer = null;
  function startFade() { fadeTimer = setTimeout(() => window.close(), 8000); }
  function stopFade() { clearTimeout(fadeTimer); const b = $("#fadebar"); if (b) b.remove(); }
  document.addEventListener("pointerdown", stopFade);
  document.addEventListener("keydown", stopFade);

  // ------------------------------------------------------------------ what's on the current tab
  async function isAllowed() {
    if (!origin) return false;
    const s = await getSettings();
    if (!s.sites[origin]) return false;
    try { return await chrome.permissions.contains({ origins: [S.pattern(origin)] }); } catch (e) { return false; }
  }

  async function start() {
    const params = new URLSearchParams(location.search);       // ?tab=ID is used by the automated tests
    tab = params.get("tab") ? await chrome.tabs.get(Number(params.get("tab"))) : (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
    try {
      const a = (await chrome.storage.session.get("cgAuto")).cgAuto;
      if (a && tab && a.tabId === tab.id && Date.now() - a.at < 5000) autoOpened = true;
      await chrome.storage.session.remove("cgAuto");
    } catch (e) { /* older browsers */ }
    url = (tab && tab.url) || "";
    origin = S.originOf(url);
    if (!origin) { notWeb(); return; }
    host = new URL(url).hostname;
    const s = await getSettings();
    if (await isAllowed()) { if (s.sites[origin].enabled === false) turnedOff(); else checkAllowed(); }
    else if (S.known(url)) consent();
    else checkOnce(true);
  }

  function note(title, text, buttons) {
    main('<div class="note"><h2>' + title + "</h2><p>" + text + "</p>" + (buttons ? '<div class="row">' + buttons + "</div>" : "") + "</div>");
  }
  function notWeb() { note("Open your email in this tab", "CampusGuard checks the email you have open. To check something else, use the link below."); }

  function consent(msg) {
    note("Check emails on " + esc(S.siteName(url)) + "?",
      "CampusGuard reads <b>only the email you open</b>, checks it on this device and saves nothing." + (msg ? "<br><b>" + esc(msg) + "</b>" : ""),
      '<button class="btn primary small" id="allow">Allow on ' + esc(host) + '</button><button class="btn small" id="once">Just this email</button>');
    on("#allow", allow); on("#once", () => checkOnce(false));
  }

  function turnedOff() {
    note("Off for " + esc(host), "Turn it back on to check emails here.", '<button class="btn primary small" id="turn-on">Turn it on</button>');
    on("#turn-on", async () => {
      const s = await getSettings(); s.sites[origin] = { enabled: true };
      await chrome.storage.local.set({ sites: s.sites }); main('<p class="muted pad">Checking…</p>'); setTimeout(checkAllowed, 700);
    });
  }

  async function allow() {
    let ok = false;   // must come first in the click handler, or the browser won't show its prompt
    try { ok = await chrome.permissions.request({ origins: [S.pattern(origin)] }); } catch (e) { ok = false; }
    if (!ok) { consent("Not allowed. You can still check just this email."); return; }
    const s = await getSettings(); s.sites[origin] = { enabled: true };
    await chrome.storage.local.set({ sites: s.sites });
    main('<p class="muted pad">Allowed. Checking the open email…</p>');
    setTimeout(checkAllowed, 700);
  }

  async function readFromTab() {
    const ask = () => new Promise(res => chrome.tabs.sendMessage(tab.id, { type: "cg-get-email" }, r => { void chrome.runtime.lastError; res(r || null); }));
    let r = await ask();
    if (!r) {
      try { await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: READER }); } catch (e) { return null; }
      await new Promise(x => setTimeout(x, 250));
      r = await ask();
    }
    return r;
  }

  async function checkAllowed() {
    const r = await readFromTab();
    const s = await getSettings();
    if (!r) { note("Couldn't read this page", "Reload the page and click CampusGuard again."); return; }
    if (!r.email) { note("No email open", s.autoCheck ? "Open an email and CampusGuard checks it. The icon shows the result." : "Open an email, then click CampusGuard."); return; }
    await showEmail(r.email, false);
  }

  async function checkOnce(unknownSite) {
    main('<p class="muted pad">Looking for an open email…</p>');
    let r = null;
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["js/mail-reader.js"] });
      const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => CGMailReader.readPlain(document, location) });
      r = res && res.result;
    } catch (e) { r = null; }
    if (!r) { note("Can't read this page", "Browsers don't let extensions read some pages. Use “Check something else” to paste it."); return; }
    if (!r.isMailPage) { note("This doesn't look like an email", "CampusGuard only reads email pages. Use “Check something else” to paste a message."); return; }
    if (!r.email) { note("No email open", "Open an email and click CampusGuard again."); if (unknownSite) addAsk(); return; }
    await showEmail(r.email, unknownSite);
  }

  function addAsk() {
    $("#v-main").insertAdjacentHTML("beforeend", '<div class="ask" id="always"><b>Always check emails on ' + esc(host) + '?</b><div class="row"><button class="btn primary small" id="always-yes">Yes, always</button><button class="btn small" id="always-no">No thanks</button></div></div>');
    on("#always-yes", allow); on("#always-no", () => $("#always").remove());
  }

  async function showEmail(email, offerAlways) {
    const res = await send({ type: "cg-analyze", text: (email.subject ? email.subject + "\n" : "") + email.text, sender: email.sender });
    if (!res || !res.ok) { note("Something went wrong", "Try again."); return; }
    const r = res.result;
    lastEmail = { result: r, text: email.text, sender: email.sender, url };
    send({ type: "cg-show-result", tabId: tab.id, result: r });
    main(card(r, email.sender));
    wireCard($("#v-main"), lastEmail);
    if (offerAlways) addAsk();
    if (autoOpened && r.risk_level === "medium") startFade();
  }

  // ------------------------------------------------------------------ "Check something else"
  async function check() {
    const text = $("#text").value, sender = $("#sender").value;
    if (!text.trim()) { $("#paste-out").innerHTML = '<p class="muted">Paste something first.</p>'; return; }
    const res = await send({ type: "cg-analyze", text, sender });
    if (!res || !res.ok) { $("#paste-out").innerHTML = '<p class="muted">Could not check that. Try again.</p>'; return; }
    lastPaste = { text, sender, result: res.result };
    $("#text").rows = 2;
    $("#paste-out").innerHTML = card(res.result, "");
    wireCard($("#paste-out"), lastPaste);
  }
  on("#check", check);
  $("#text").addEventListener("keydown", e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) check(); });

  // ------------------------------------------------------------------ settings
  async function drawSettings() {
    const s = await getSettings();
    $("#s-auto").checked = s.autoCheck; $("#s-alert").checked = s.popAlert;
    const rows = [];
    for (const o of Object.keys(s.sites).sort()) {
      let granted = false;
      try { granted = await chrome.permissions.contains({ origins: [S.pattern(o)] }); } catch (e) { granted = false; }
      if (!granted) continue;
      const h = new URL(o).hostname;
      rows.push('<div class="siterow"><div class="grow">' + esc(h) + "</div>" +
        '<input type="checkbox" role="switch" data-site="' + esc(o) + '" aria-label="Check emails on ' + esc(h) + '"' + (s.sites[o].enabled !== false ? " checked" : "") + ">" +
        '<button class="linkbtn" data-remove="' + esc(o) + '" aria-label="Remove ' + esc(h) + '">Remove</button></div>');
    }
    $("#s-sites").innerHTML = rows.length ? rows.join("") : '<p class="muted">None yet. Open your webmail, click CampusGuard and choose Allow.</p>';
    $("#s-sites").querySelectorAll("[data-site]").forEach(el => el.addEventListener("change", async () => {
      const v = await getSettings(); v.sites[el.dataset.site] = { enabled: el.checked }; await chrome.storage.local.set({ sites: v.sites });
    }));
    $("#s-sites").querySelectorAll("[data-remove]").forEach(el => el.addEventListener("click", async () => {
      const o = el.dataset.remove;
      try { await chrome.permissions.remove({ origins: [S.pattern(o)] }); } catch (e) { /* already gone */ }
      const v = await getSettings(); delete v.sites[o]; await chrome.storage.local.set({ sites: v.sites });
      drawSettings();
    }));
  }
  $("#s-auto").addEventListener("change", e => chrome.storage.local.set({ autoCheck: e.target.checked }));
  $("#s-alert").addEventListener("change", e => chrome.storage.local.set({ popAlert: e.target.checked }));

  view("main");
  send({ type: "cg-dev-check" });              // a copy loaded with "Load unpacked" reloads itself if its files changed
  start();
})();
