/* CampusGuard service worker: runs the model locally for the popup, the mail panel and the
   right-click menu. No network requests are ever made. */
if (typeof importScripts === "function" && !self.CampusGuardEngine) importScripts("model/campusguard-model.js", "js/campusguard-engine.js");
const engine = self.CampusGuardEngine.create(self.CG_MODEL);

function slim(r) { const o = Object.assign({}, r); delete o.trace; return o; }

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: "cg-selection", title: "Check selected text with CampusGuard", contexts: ["selection"] });
  chrome.contextMenus.create({ id: "cg-link", title: "Check this link with CampusGuard (without opening it)", contexts: ["link"] });
  chrome.storage.sync.get({ autoScan: true }, v => chrome.storage.sync.set(v));
});

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg && msg.type === "cg-analyze") {
    try { reply({ ok: true, result: slim(engine.analyze(msg.text || "", msg.sender || "")) }); }
    catch (e) { reply({ ok: false, error: String(e) }); }
    return true;
  }
  if (msg && msg.type === "cg-open-report") {
    chrome.storage.session.set({ cgReport: msg.payload }).then(() => chrome.tabs.create({ url: chrome.runtime.getURL("report.html") }));
    return false;
  }
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const text = info.menuItemId === "cg-link" ? info.linkUrl : info.selectionText;
  if (!text) return;
  const result = slim(engine.analyze(text, ""));
  await chrome.storage.session.set({ cgReport: { text, sender: "", result } });
  chrome.tabs.create({ url: chrome.runtime.getURL("report.html") });
});
