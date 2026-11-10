/* CampusGuard v3 toolbar drop-down: "This email", "Paste a message" and "Settings". */
(function () {
  "use strict";
  const $ = s => document.querySelector(s);
  const S = CGSites, R = CGRender, esc = R.esc;
  const DEFAULTS = { autoCheck: true, inPageCard: false, sites: {} };
  const READER = ["js/mail-reader.js", "js/mail-watch.js"];
  let tab = null, url = "", origin = null, host = "", lastEmail = null, lastPaste = null;

  $("#ver").textContent = "v" + chrome.runtime.getManifest().version;
  const getSettings = () => chrome.storage.local.get(DEFAULTS).then(v => Object.assign({}, DEFAULTS, v));
  const send = msg => new Promise(res => chrome.runtime.sendMessage(msg, r => { void chrome.runtime.lastError; res(r); }));

  // ------------------------------------------------------------------ tabs (keyboard: arrows, Home, End)
  const TABS = ["email", "paste", "settings"];
  function select(name, focus) {
    for (const t of TABS) {
      const on = t === name, b = $("#t-" + t);
      b.setAttribute("aria-selected", on); b.tabIndex = on ? 0 : -1; $("#p-" + t).hidden = !on;
      if (on && focus) b.focus();
    }
    if (name === "settings") drawSettings();
    if (name === "paste") $("#text").focus();
  }
  TABS.forEach((t, i) => {
    const b = $("#t-" + t);
    b.addEventListener("click", () => select(t));
    b.addEventListener("keydown", e => {
      const k = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: TABS.length - 1 }[e.key];
      if (k === undefined) return;
      e.preventDefault(); select(TABS[(k + TABS.length) % TABS.length], true);
    });
  });

  // ------------------------------------------------------------------ "This email"
  const out = html => { $("#email-out").innerHTML = html; };
  const on = (sel, fn) => { const el = $(sel); if (el) el.addEventListener("click", fn); };

  async function isAllowed() {
    if (!origin) return false;
    const s = await getSettings();
    if (!s.sites[origin]) return false;
    try { return await chrome.permissions.contains({ origins: [S.pattern(origin)] }); } catch (e) { return false; }
  }

  async function start() {
    const params = new URLSearchParams(location.search);       // ?tab=ID is used by the automated tests
    tab = params.get("tab") ? await chrome.tabs.get(Number(params.get("tab"))) : (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
    url = (tab && tab.url) || "";
    origin = S.originOf(url);
    if (!origin) { notWeb(); return; }
    host = new URL(url).hostname;
    $("#site").hidden = false; $("#site").textContent = host; $("#site").title = host;
    const s = await getSettings();
    if (await isAllowed()) {
      if (s.sites[origin].enabled === false) turnedOff(); else checkAllowed();
    } else if (S.known(url)) consent();
    else checkOnce(true);
  }

  function notWeb() {
    out('<div class="card"><h2>Open your email in this tab</h2><p>CampusGuard checks the email you have open on a webmail site. You can also paste any message.</p>' +
      '<div class="row"><button class="btn primary small" id="go-paste">Paste a message</button></div></div>');
    on("#go-paste", () => select("paste"));
  }

  function consent(note) {
    const name = S.siteName(url);
    out('<div class="card"><h2>Check emails on ' + esc(name) + '?</h2>' +
      "<p>When you open an email, CampusGuard reads <b>only that email</b> (sender, subject, text and where its links go), checks it on this device and shows the result on its icon. Nothing is saved or sent.</p>" +
      (note ? '<p role="alert"><b>' + esc(note) + "</b></p>" : "") +
      '<div class="row"><button class="btn primary" id="allow">Allow on ' + esc(host) + '</button><button class="btn" id="once">Check just this email</button></div>' +
      '<p class="muted">Your browser will ask you to confirm. You can turn it off any time in Settings.</p></div>');
    on("#allow", allow);
    on("#once", () => checkOnce(false));
  }

  function turnedOff() {
    out('<div class="card"><h2>CampusGuard is off for ' + esc(host) + '</h2><p>Turn it back on to check emails here.</p>' +
      '<div class="row"><button class="btn primary small" id="turn-on">Turn it on</button></div></div>');
    on("#turn-on", async () => {
      const s = await getSettings(); s.sites[origin] = { enabled: true };
      await chrome.storage.local.set({ sites: s.sites }); out('<p class="muted">Checking…</p>'); setTimeout(checkAllowed, 700);
    });
  }

  async function allow() {
    // must be the first thing in the click handler: browsers only show the prompt for a direct click
    let ok = false;
    try { ok = await chrome.permissions.request({ origins: [S.pattern(origin)] }); } catch (e) { ok = false; }
    if (!ok) { consent("Not allowed. You can still check just this email."); return; }
    const s = await getSettings(); s.sites[origin] = { enabled: true };
    await chrome.storage.local.set({ sites: s.sites });
    out('<p class="muted">Allowed. Checking the open email…</p>');
    setTimeout(checkAllowed, 700);
  }

  async function readFromTab() {
    const ask = () => new Promise(res => chrome.tabs.sendMessage(tab.id, { type: "cg-get-email" }, r => { void chrome.runtime.lastError; res(r || null); }));
    let r = await ask();
    if (!r) {                                     // tab was open before access was given: start the reader now
      try { await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: READER }); } catch (e) { return null; }
      await new Promise(x => setTimeout(x, 250));
      r = await ask();
    }
    return r;
  }

  async function checkAllowed() {
    const r = await readFromTab();
    const s = await getSettings();
    if (!r) { out('<div class="card"><h2>Couldn\'t read this page</h2><p>Reload the page and click CampusGuard again.</p></div>'); return; }
    if (!r.email) {
      out('<div class="card"><h2>No email is open</h2><p>' + (s.autoCheck ? "Open an email and CampusGuard checks it automatically. The result shows on the icon." : "Open an email, then click CampusGuard to check it.") + "</p></div>");
      return;
    }
    await showEmail(r.email, false);
  }

  async function checkOnce(unknownSite) {
    // one-time access from the click (activeTab): read the open email once, keep nothing
    out('<p class="muted">Looking for an open email…</p>');
    let r = null;
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["js/mail-reader.js"] });
      const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => CGMailReader.readPlain(document, location) });
      r = res && res.result;
    } catch (e) { r = null; }
    if (!r) { out('<div class="card"><h2>CampusGuard can\'t read this page</h2><p>Browsers don\'t let extensions read some pages (like settings or store pages). Paste the message instead.</p><div class="row"><button class="btn primary small" id="go-paste">Paste a message</button></div></div>'); on("#go-paste", () => select("paste")); return; }
    if (!r.isMailPage) {
      out('<div class="card"><h2>This doesn\'t look like an email</h2><p>CampusGuard only reads email pages. To check something else, paste it.</p><div class="row"><button class="btn primary small" id="go-paste">Paste a message</button></div></div>');
      on("#go-paste", () => select("paste"));
      return;
    }
    if (!r.email) {
      out('<div class="card"><h2>No email is open</h2><p>This looks like an email site. Open an email and click CampusGuard again.</p></div>' + (unknownSite ? alwaysAsk() : ""));
      wireAlways();
      return;
    }
    await showEmail(r.email, unknownSite);
  }

  function alwaysAsk() {
    return '<div class="ask" id="always"><p><b>Always check emails on ' + esc(host) + "?</b> CampusGuard will check each email you open here, reading only that email.</p>" +
      '<div class="row"><button class="btn primary small" id="always-yes">Yes, always</button><button class="btn small" id="always-no">No thanks</button></div></div>';
  }
  function wireAlways() {
    on("#always-yes", allow);
    on("#always-no", () => { const a = $("#always"); if (a) a.remove(); });
  }

  async function showEmail(email, offerAlways) {
    const res = await send({ type: "cg-analyze", text: (email.subject ? email.subject + "\n" : "") + email.text, sender: email.sender });
    if (!res || !res.ok) { out('<div class="card"><h2>Something went wrong</h2><p>Try again.</p></div>'); return; }
    const r = res.result;
    lastEmail = { result: r, text: email.text, sender: email.sender, url };
    send({ type: "cg-show-result", tabId: tab.id, result: r });
    out('<div class="meta">' + (email.sender ? "<span><b>From:</b> " + esc(email.sender) + "</span>" : "") + (email.subject ? "<span><b>Subject:</b> " + esc(email.subject) + "</span>" : "") + "</div>" +
      R.verdict(r) + (offerAlways ? alwaysAsk() : "") + R.flags(r, 4) + R.good(r) +
      '<div class="row"><button class="btn primary small" id="e-full">View full analysis</button>' + (r.risk_level !== "low" ? '<button class="btn small" id="e-report">How to report it</button>' : "") + "</div>" +
      '<div class="todo" id="e-tip" hidden></div>');
    on("#e-full", () => send({ type: "cg-open-report", payload: lastEmail }));
    on("#e-report", () => { const t = $("#e-tip"); t.hidden = false; t.textContent = S.reportTip(url); });
    wireAlways();
  }

  // ------------------------------------------------------------------ "Paste a message"
  async function check() {
    const text = $("#text").value, sender = $("#sender").value;
    if (!text.trim()) { $("#out").innerHTML = '<div class="muted">Paste something first.</div>'; return; }
    const res = await send({ type: "cg-analyze", text, sender });
    if (!res || !res.ok) { $("#out").innerHTML = '<div class="muted">Could not check that. Try again.</div>'; return; }
    lastPaste = { text, sender, result: res.result };
    $("#out").innerHTML = R.verdict(res.result) + R.flags(res.result, 4) + R.good(res.result);
    $("#full").hidden = false;
  }
  $("#check").addEventListener("click", check);
  $("#text").addEventListener("keydown", e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) check(); });
  $("#full").addEventListener("click", () => lastPaste && send({ type: "cg-open-report", payload: lastPaste }));

  // ------------------------------------------------------------------ "Settings"
  async function drawSettings() {
    const s = await getSettings();
    $("#s-auto").checked = s.autoCheck; $("#s-card").checked = s.inPageCard;
    const rows = [];
    for (const o of Object.keys(s.sites).sort()) {
      let granted = false;
      try { granted = await chrome.permissions.contains({ origins: [S.pattern(o)] }); } catch (e) { granted = false; }
      if (!granted) continue;
      const h = new URL(o).hostname, k = S.known(o + "/" + (h === "www.icloud.com" ? "mail" : ""));
      rows.push('<div class="siterow"><div class="grow"><b>' + esc(h) + "</b><small>" + esc(k ? k.name : "Email site") + "</small></div>" +
        '<input type="checkbox" role="switch" data-site="' + esc(o) + '" aria-label="Check emails on ' + esc(h) + '"' + (s.sites[o].enabled !== false ? " checked" : "") + ">" +
        '<button class="btn small" data-remove="' + esc(o) + '" aria-label="Remove ' + esc(h) + '">Remove</button></div>');
    }
    $("#s-sites").innerHTML = rows.length ? rows.join("") : '<p class="muted" style="margin:0">No sites yet. Open your webmail, click CampusGuard and choose Allow.</p>';
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
  $("#s-card").addEventListener("change", e => chrome.storage.local.set({ inPageCard: e.target.checked }));

  start();
})();
