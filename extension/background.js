/* CampusGuard v3 service worker.
   - Runs the model on this device for the toolbar drop-down, the email checks and the right-click menu.
   - Keeps track of which email sites the user allowed, and runs the email reader only on those.
   - Shows each tab's result on the toolbar icon (badge, colour, hover text).
   No network requests are ever made, and no email text is stored. */
if (typeof importScripts === "function" && !self.CampusGuardEngine) importScripts("model/campusguard-model.js", "js/campusguard-engine.js", "js/sites.js");
const engine = self.CampusGuardEngine.create(self.CG_MODEL);
const S = self.CGSites;
const DEFAULTS = { autoCheck: true, popAlert: true, sites: {} };
const READER = ["js/mail-reader.js", "js/mail-watch.js"];
const BADGE = {
  high: { text: "!", color: "#b81f3b" },
  medium: { text: "?", color: "#855400" },
  low: { text: "OK", color: "#126c42" },
};
const ON_ICON = { 16: "icons/icon16.png", 32: "icons/icon32.png" };
const OFF_ICON = { 16: "icons/off16.png", 32: "icons/off32.png" };
const HAS_DC = !!(chrome.declarativeContent && chrome.declarativeContent.onPageChanged);

function slim(r) { const o = Object.assign({}, r); delete o.trace; return o; }
const getSettings = () => chrome.storage.local.get(DEFAULTS).then(v => Object.assign({}, DEFAULTS, v));
function analyze(text, sender) { return slim(engine.analyze(text || "", sender || "")); }

// ------------------------------------------------------------------ allowed sites
// A site counts as allowed when the browser has granted access to it AND it is in our list.
async function allowedOrigins() {
  const s = await getSettings();
  const out = [];
  for (const origin of Object.keys(s.sites)) {
    let ok = false;
    try { ok = await chrome.permissions.contains({ origins: [S.pattern(origin)] }); } catch (e) { ok = false; }
    if (ok) out.push({ origin, enabled: s.sites[origin].enabled !== false });
  }
  return out;
}

let syncing = Promise.resolve();
function sync() { syncing = syncing.then(doSync, doSync); return syncing; }
async function doSync() {
  const sites = await allowedOrigins();
  const on = sites.filter(x => x.enabled).map(x => S.pattern(x.origin));
  // 1. the email reader runs only on allowed sites that are switched on
  try { await chrome.scripting.unregisterContentScripts({ ids: ["cg-mail"] }); } catch (e) { /* not registered yet */ }
  if (on.length) {
    try { await chrome.scripting.registerContentScripts([{ id: "cg-mail", matches: on, js: READER, runAt: "document_idle", allFrames: false }]); }
    catch (e) { console.warn("CampusGuard: could not register the email reader", e); }
  }
  // 2. right-click menu only on those email pages
  await chrome.contextMenus.removeAll();
  if (on.length) {
    chrome.contextMenus.create({ id: "cg-selection", title: "Check selected text with CampusGuard", contexts: ["selection"], documentUrlPatterns: on });
    chrome.contextMenus.create({ id: "cg-link", title: "Check this link with CampusGuard (without opening it)", contexts: ["link"], documentUrlPatterns: on });
  }
  // 3. light the icon on known and allowed email sites
  if (HAS_DC) await iconRules(sites.map(x => new URL(x.origin).hostname));
}

let onImage = null;
async function iconImages() {
  if (onImage) return onImage;
  const out = {};
  for (const size of [16, 32]) {
    const blob = await (await fetch(chrome.runtime.getURL(ON_ICON[size]))).blob();
    const bmp = await createImageBitmap(blob);
    const c = new OffscreenCanvas(size, size), x = c.getContext("2d");
    x.drawImage(bmp, 0, 0, size, size);
    out[size] = x.getImageData(0, 0, size, size);
  }
  return (onImage = out);
}
async function iconRules(extraHosts) {
  const hosts = [...new Set(S.KNOWN_MAIL.map(k => k.host).concat(extraHosts))];
  try {
    const imageData = await iconImages();
    await new Promise(r => chrome.declarativeContent.onPageChanged.removeRules(undefined, r));
    const conditions = hosts.map(h => new chrome.declarativeContent.PageStateMatcher({ pageUrl: { hostEquals: h, schemes: ["https", "http"] } }));
    await new Promise(r => chrome.declarativeContent.onPageChanged.addRules([{ conditions, actions: [new chrome.declarativeContent.SetIcon({ imageData })] }], r));
  } catch (e) { console.warn("CampusGuard: icon rules unavailable", e); }
}

// inject the reader into tabs already open on a newly allowed site, so the user doesn't have to reload
async function injectOpenTabs(origin) {
  let tabs = [];
  try { tabs = await chrome.tabs.query({ url: S.pattern(origin) }); } catch (e) { return; }
  for (const t of tabs) {
    try { await chrome.scripting.executeScript({ target: { tabId: t.id }, files: READER }); } catch (e) { /* page not ready or blocked */ }
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  const s = await chrome.storage.local.get(null);
  await chrome.storage.local.set(Object.assign({}, DEFAULTS, s));
  try { await chrome.storage.sync.remove("autoScan"); await chrome.storage.local.remove("inPageCard"); } catch (e) { /* older settings, no longer used */ }
  sync();
});
chrome.runtime.onStartup.addListener(() => sync());

// access granted from the browser's own menus (not our drop-down) also counts as allowing the site
chrome.permissions.onAdded.addListener(async p => {
  const s = await getSettings(); let changed = false;
  for (const pat of p.origins || []) {
    const m = pat.match(/^(https?:\/\/[^/*]+)\/\*$/);
    if (m && !s.sites[m[1]]) { s.sites[m[1]] = { enabled: true }; changed = true; }
  }
  if (changed) await chrome.storage.local.set({ sites: s.sites }); else sync();
});
chrome.permissions.onRemoved.addListener(() => sync());
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== "local" || !changes.sites) return;
  await sync();
  const before = (changes.sites.oldValue) || {}, after = changes.sites.newValue || {};
  for (const o of Object.keys(after)) {
    const nowOn = after[o].enabled !== false, wasOn = before[o] && before[o].enabled !== false;
    if (nowOn && !wasOn) injectOpenTabs(o);
  }
});

// ------------------------------------------------------------------ toolbar icon per tab
function showResult(tabId, r) {
  const b = BADGE[r.risk_level] || BADGE.low;
  chrome.action.setBadgeText({ tabId, text: b.text });
  chrome.action.setBadgeBackgroundColor({ tabId, color: b.color });
  if (chrome.action.setBadgeTextColor) chrome.action.setBadgeTextColor({ tabId, color: "#ffffff" });
  chrome.action.setTitle({ tabId, title: "CampusGuard: " + r.verdict + ", risk score " + Math.round(r.risk_score * 100) + "/100. Click for details." });
  litIcon(tabId, true);
}
// The icon-lighting rules only apply on the next page load, so allowed sites also light the icon directly.
const litTabs = new Set();
function litIcon(tabId, lit) {
  if (lit) { litTabs.add(tabId); chrome.action.setIcon({ tabId, path: ON_ICON }); }
  else if (litTabs.has(tabId) || !HAS_DC) { litTabs.delete(tabId); chrome.action.setIcon({ tabId, path: OFF_ICON }); }
}
function showState(tabId, state) {
  chrome.action.setBadgeText({ tabId, text: "" });
  const title = {
    "no-email": "CampusGuard is on for this site. Open an email and it gets checked.",
    ready: "CampusGuard: click to check this email.",
    off: "CampusGuard is turned off for this site.",
    "not-mail": "CampusGuard",
  }[state] || "CampusGuard";
  chrome.action.setTitle({ tabId, title });
  litIcon(tabId, !(state === "not-mail" || state === "off"));
}
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status === "loading") showState(tabId, "not-mail");   // a new page: forget the old result
});

// ------------------------------------------------------------------ scam alert: drop the popup down from the icon
// Alerts once each time a scam email is opened (not again while it stays open). Returns "popup" when the drop-down opened, "page" when the content script should show
// its own small alert instead (a browser without openPopup, or the window isn't focused), or "none".
async function popAlert(tab, key) {
  const seen = (await chrome.storage.session.get("alerted")).alerted || {};
  if (seen[tab.id] === key) return "none";
  seen[tab.id] = key; await chrome.storage.session.set({ alerted: seen });
  if (!tab.active) return "page";
  if (chrome.action.openPopup) {
    try {
      await chrome.storage.session.set({ cgAuto: { tabId: tab.id, at: Date.now() } });
      await chrome.action.openPopup({ windowId: tab.windowId });
      return "popup";
    } catch (e) { /* not allowed right now */ }
  }
  return "page";
}
async function forgetAlert(id) {
  const seen = (await chrome.storage.session.get("alerted")).alerted || {};
  if (id in seen) { delete seen[id]; await chrome.storage.session.set({ alerted: seen }); }
}
chrome.tabs.onRemoved.addListener(forgetAlert);

// ------------------------------------------------------------------ messages
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (!msg) return;
  if (msg.type === "cg-analyze") {
    try { reply({ ok: true, result: analyze(msg.text, msg.sender) }); } catch (e) { reply({ ok: false, error: String(e) }); }
    return;
  }
  if (msg.type === "cg-mail" && sender.tab) {
    // only answer for sites the user allowed and switched on
    const origin = sender.origin || (sender.url && S.originOf(sender.url));
    getSettings().then(async s => {
      const site = s.sites[origin];
      if (!site || site.enabled === false || !s.autoCheck) { reply({ ok: false }); return; }
      try {
        const e = msg.email || {};
        const result = analyze((e.subject ? e.subject + "\n" : "") + (e.text || ""), e.sender);
        showResult(sender.tab.id, result);
        if (result.risk_level === "low") await forgetAlert(sender.tab.id);
        const alert = s.popAlert && result.risk_level !== "low" ? await popAlert(sender.tab, msg.email.key) : "none";
        reply({ ok: true, result, alert });
      } catch (err) { reply({ ok: false, error: String(err) }); }
    });
    return true;
  }
  if (msg.type === "cg-state" && sender.tab) { showState(sender.tab.id, msg.state); forgetAlert(sender.tab.id); return; }
  if (msg.type === "cg-show-result" && msg.tabId != null && msg.result) { showResult(msg.tabId, msg.result); return; }
  if (msg.type === "cg-open-report") {
    chrome.storage.session.set({ cgReport: msg.payload }).then(() => chrome.tabs.create({ url: chrome.runtime.getURL("report.html") }));
  }
});

chrome.contextMenus.onClicked.addListener(async (info) => {
  const text = info.menuItemId === "cg-link" ? info.linkUrl : info.selectionText;
  if (!text) return;
  await chrome.storage.session.set({ cgReport: { text, sender: "", result: analyze(text, ""), url: info.pageUrl } });
  chrome.tabs.create({ url: chrome.runtime.getURL("report.html") });
});
