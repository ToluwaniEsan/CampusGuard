(function () {
  const $ = s => document.querySelector(s);
  let last = null;
  $("#ver").textContent = "v" + chrome.runtime.getManifest().version;
  chrome.storage.sync.get({ autoScan: true }, v => { $("#auto").checked = v.autoScan; });
  $("#auto").addEventListener("change", e => chrome.storage.sync.set({ autoScan: e.target.checked }));
  function check() {
    const text = $("#text").value, sender = $("#sender").value;
    if (!text.trim()) { $("#out").innerHTML = '<div class="muted">Paste something first.</div>'; return; }
    chrome.runtime.sendMessage({ type: "cg-analyze", text, sender }, res => {
      if (!res || !res.ok) { $("#out").innerHTML = '<div class="muted">Could not analyze that. Try again.</div>'; return; }
      last = { text, sender, result: res.result };
      const r = res.result;
      $("#out").innerHTML = CGRender.verdict(r) + CGRender.flags(r, 4) + CGRender.good(r);
      $("#full").hidden = false;
    });
  }
  $("#check").addEventListener("click", check);
  $("#text").addEventListener("keydown", e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) check(); });
  $("#full").addEventListener("click", () => last && chrome.runtime.sendMessage({ type: "cg-open-report", payload: last }));
  $("#text").focus();
})();
