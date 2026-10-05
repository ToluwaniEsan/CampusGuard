/* CampusGuard home: one take-all box (text, links, screenshots) -> intake -> model -> results.
   Everything runs in the browser: the message, the screenshot and its text never leave the device. */
(function () {
  "use strict";
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pct = x => Math.round(x * 100);
  const ico = n => '<svg class="ico" aria-hidden="true"><use href="#h-' + n + '"/></svg>';

  // sign icons (flag -> symbol). Injected once as an SVG sprite.
  const ICONS = {
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l3 3M14 9l2 2"/>',
    id: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M6 16c.6-1.5 5.4-1.5 6 0M15 10h3M15 14h3"/>',
    cursor: '<path d="m5 3 14 8-6 2-2 6z"/>',
    building: '<path d="M4 21V5l8-3 8 3v16M9 21v-5h6v5M8 9h.01M12 9h.01M16 9h.01M8 13h.01M12 13h.01M16 13h.01"/>',
    dollar: '<path d="M12 2v20M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
    briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18"/>',
    userq: '<circle cx="10" cy="8" r="4"/><path d="M3 21c0-4 3-6 7-6M17 9a2 2 0 1 1 3 1.7c-.7.5-1 .9-1 1.8M19 16h.01"/>',
    eyeoff: '<path d="m3 3 18 18M10.6 6.1A9.8 9.8 0 0 1 12 6c5 0 9 6 9 6a15 15 0 0 1-2.6 3.1M6.5 7.7A15 15 0 0 0 3 12s4 6 9 6c1.3 0 2.5-.3 3.6-.9"/>',
    card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/>',
    mega: '<path d="M3 11v2l11 5V6L3 11zM14 9a3 3 0 0 1 0 6M6 13.5V18h3v-3"/>',
    type: '<path d="M4 7V5h16v2M12 5v14M9 19h6"/>',
    mask: '<rect x="3" y="3" width="12" height="12" rx="2"/><rect x="9" y="9" width="12" height="12" rx="2"/>',
    hash: '<path d="M5 9h14M5 15h14M10 4 8 20M16 4l-2 16"/>',
    exit: '<path d="M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h5M17 16l4-4-4-4M21 12H9"/>',
    scissors: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  };
  const SIGN = { urgency: "clock", threat: "alert", credential_request: "key", sensitive_info: "id", click_cta: "cursor", impersonation: "building",
    money_lure: "dollar", job_scam: "briefcase", generic_greeting: "userq", secrecy: "eyeoff", asks_for_secrets: "chat", upfront_payment: "card",
    shouting: "mega", suspicious_wording: "type", sender_freemail_official: "mail", n_urls: "link", url_ip_host: "hash", url_lookalike: "mask",
    url_many_subdomains: "link", url_shortener: "scissors", url_suspicious_tld: "globe", url_at_or_redirect: "link", url_sensitive_words: "key",
    url_non_campus_official: "exit", sender_lookalike: "mask", sender_display_mismatch: "userq", sender_freemail: "mail", sender_trusted_risky_request: "user", url: "link" };

  const S = { images: [], busy: false, docked: false, senderOverride: null, last: null, showAll: false, showText: false, ocrUsed: false };
  let engine = null, ocrWorker = null;
  const box = () => $("#box"), ta = () => $("#content");

  // ------------------------------------------------------------------ theme
  function currentTheme() {
    const t = document.documentElement.getAttribute("data-theme");
    return t || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  }
  function initTheme() {
    try { const t = localStorage.getItem("cg-theme"); if (t === "dark" || t === "light") document.documentElement.setAttribute("data-theme", t); } catch (e) { /* storage unavailable */ }
    $("#theme").addEventListener("click", () => {
      const next = currentTheme() === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      try { localStorage.setItem("cg-theme", next); } catch (e) { /* storage unavailable */ }
    });
  }

  // ------------------------------------------------------------------ input
  function hasContent() { return ta().value.trim().length > 0 || S.images.length > 0; }
  function syncGo() {
    $("#go-wrap").classList.toggle("on", hasContent() && !S.docked);
    $("#go").firstChild.textContent = S.last ? "Check again " : "Check it ";
  }
  function autosize() { const t = ta(); t.style.height = "auto"; t.style.height = Math.min(t.scrollHeight, window.innerHeight * 0.46) + "px"; }
  function addImages(files) {
    for (const f of files) {
      if (!f.type || f.type.indexOf("image/") !== 0) continue;
      const im = { file: f, url: "" };
      S.images.push(im);
      const fr = new FileReader();
      fr.onload = () => { im.url = fr.result; drawThumbs(); };
      fr.readAsDataURL(f);
    }
    drawThumbs(); syncGo();
  }
  function drawThumbs() {
    $("#thumbs").innerHTML = S.images.map((im, i) => '<div class="thumb">' + (im.url ? '<img src="' + im.url + '" alt="Screenshot ' + (i + 1) + '">' : "") + '<button type="button" data-i="' + i + '" aria-label="Remove image">' +
      '<svg class="ico"><use href="#h-x"/></svg></button></div>').join("");
  }
  function wireInput() {
    ta().addEventListener("input", () => { S.senderOverride = null; autosize(); syncGo(); });
    ta().addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); if (hasContent()) submit(); } });
    ta().addEventListener("paste", e => { const fs = e.clipboardData && e.clipboardData.files; if (fs && fs.length) { const imgs = [...fs].filter(f => f.type.indexOf("image/") === 0); if (imgs.length) { e.preventDefault(); addImages(imgs); } } });
    $("#attach").addEventListener("click", e => { e.stopPropagation(); $("#file").click(); });
    $("#file").addEventListener("change", e => { addImages(e.target.files); e.target.value = ""; });
    $("#thumbs").addEventListener("click", e => { const b = e.target.closest("button[data-i]"); if (!b) return; e.stopPropagation(); S.images.splice(Number(b.dataset.i), 1); drawThumbs(); syncGo(); });
    ["dragenter", "dragover"].forEach(ev => document.addEventListener(ev, e => { if (e.dataTransfer && [...e.dataTransfer.types].indexOf("Files") !== -1) { e.preventDefault(); box().classList.add("drag"); } }));
    ["dragleave", "drop"].forEach(ev => document.addEventListener(ev, e => { if (ev === "drop") { e.preventDefault(); if (S.docked) undock(); addImages(e.dataTransfer.files); } box().classList.remove("drag"); }));
    $("#go").addEventListener("click", submit);
    box().addEventListener("click", () => { if (S.docked) undock(); });
    box().addEventListener("keydown", e => { if (S.docked && e.target === box() && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); undock(); } });
  }

  // ------------------------------------------------------------------ dock / undock (FLIP)
  function flip(move) {
    const b = box(), first = b.getBoundingClientRect();
    move();
    const last = b.getBoundingClientRect();
    if (!b.animate || !motionOn()) return;
    b.animate([{ transformOrigin: "top left", transform: "translate(" + (first.left - last.left) + "px," + (first.top - last.top) + "px) scale(" + (first.width / last.width) + "," + (first.height / last.height) + ")", opacity: .7 },
      { transformOrigin: "top left", transform: "none", opacity: 1 }], { duration: 480, easing: "cubic-bezier(.2,.8,.2,1)" });
  }
  function dock() {
    const text = ta().value.trim();
    $("#dock-text").textContent = (S.images.length ? "[" + S.images.length + " screenshot" + (S.images.length > 1 ? "s" : "") + "] " : "") + (text || "");
    flip(() => { $("#slot-dock").appendChild(box()); box().classList.add("docked"); document.body.classList.add("checked"); });
    box().setAttribute("role", "button"); box().setAttribute("tabindex", "0"); box().setAttribute("aria-label", "Edit what you pasted");
    S.docked = true; syncGo();
  }
  function undock() {
    flip(() => { $("#slot-hero").insertBefore(box(), $("#go-wrap")); box().classList.remove("docked"); });
    box().removeAttribute("role"); box().removeAttribute("tabindex"); box().removeAttribute("aria-label");
    S.docked = false; syncGo(); autosize(); ta().focus();
  }

  // ------------------------------------------------------------------ OCR (screenshots), fully local
  function b64ToBytes(b64) { const bin = atob(b64); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; }
  // The screenshot reader (Tesseract) normally runs in a background worker started from the copy
  // bundled in this page. Some hosts refuse to start workers from in-page code, so there is a second
  // way: run the very same reader code inside the page itself. Slower to feel (the page pauses while
  // it reads) but it needs no worker, no extra files and no network.
  function inPageWorkerClass() {
    return class InPageWorker {
      constructor() {
        const me = this; this._in = []; this.onmessage = null;
        const own = {
          postMessage: d => setTimeout(() => { if (me.onmessage) me.onmessage({ data: d }); }, 0),
          addEventListener: (t, fn) => { if (t === "message") me._in.push(fn); },
          removeEventListener: () => {}, importScripts: () => {},
        };
        const scope = new Proxy(own, {
          get(t, k) { if (k in t) return t[k]; const v = window[k]; return (typeof v === "function" && !("prototype" in v)) ? v.bind(window) : v; },
          set(t, k, v) { t[k] = v; return true; },
          has(t, k) { return k in t || k in window; },
        });
        own.self = scope; own.globalThis = scope; own.window = scope;
        window.__cgOcrBoot(scope, scope, scope, own.postMessage, own.addEventListener, own.importScripts);
      }
      postMessage(d) { setTimeout(() => this._in.forEach(fn => fn({ data: d })), 0); }
      terminate() { this._in = []; }
    };
  }
  // Logging must never be able to break the reader: some hosts provide only part of `console`.
  function note(msg) { try { if (typeof console !== "undefined" && typeof console.log === "function") console.log(msg); } catch (e) { /* ignore */ } }
  async function getOcr(onProgress) {
    if (ocrWorker) return ocrWorker;
    const lang = document.getElementById("ocr-lang");
    if (!self.Tesseract || !lang || typeof window.__cgOcrBoot !== "function") throw new Error("The screenshot reader is not bundled in this build");
    const langs = () => [{ code: "eng", data: b64ToBytes(lang.textContent.trim()) }];
    const opts = url => ({ workerPath: url, workerBlobURL: false, cacheMethod: "none", logger: m => { if (m.status === "recognizing text" && onProgress) onProgress(m.progress); } });
    const tries = [
      async () => {            // 1. real background worker
        const code = "(" + window.__cgOcrBoot.toString() + ")(self,self,self,self.postMessage.bind(self),self.addEventListener.bind(self),self.importScripts.bind(self));";
        const url = URL.createObjectURL(new Blob([code], { type: "application/javascript" }));
        const probe = new Worker(url); probe.terminate();     // hosts that forbid this throw right here
        return self.Tesseract.createWorker(langs(), 1, opts(url));
      },
      async () => {            // 2. same code, inside the page
        const RealWorker = window.Worker;
        window.Worker = inPageWorkerClass();
        try { const w = await self.Tesseract.createWorker(langs(), 1, opts("in-page")); S.ocrMode = "in-page"; return w; }
        finally { window.Worker = RealWorker; }
      },
    ];
    let lastErr = null;
    for (const t of tries) { try { ocrWorker = await t(); return ocrWorker; } catch (e) { lastErr = e; note("Screenshot reader: that way of starting is not available here, trying the next. " + (e && e.message ? e.message : e)); } }
    throw lastErr;
  }
  async function readImages(onProgress) {
    const w = await getOcr(onProgress);
    const parts = [];
    for (const im of S.images) { const r = await w.recognize(im.file); parts.push((r.data.text || "").trim()); }
    return parts.filter(Boolean).join("\n\n");
  }

  // ------------------------------------------------------------------ submit
  async function submit() {
    if (S.busy || !hasContent()) return;
    S.busy = true; $("#go").disabled = true;
    const res = $("#results");
    if (!$("#slot-dock")) res.innerHTML = '<div class="r-top"><div class="read" id="read"></div><div class="slot-dock" id="slot-dock"></div></div><div id="r-body"></div>';
    res.hidden = false;
    let text = ta().value, ocrText = "", ocrFail = false;
    if (!S.docked) dock();
    if (S.images.length) {
      $("#read").innerHTML = "";
      $("#r-body").innerHTML = '<div class="busy">Reading your screenshot<div class="barx"><i id="ocr-bar"></i></div></div>';
      await new Promise(r => requestAnimationFrame(() => setTimeout(r, 30)));     // let "Reading…" paint first
      try { ocrText = await readImages(p => { const b = document.getElementById("ocr-bar"); if (b) b.style.width = Math.max(8, Math.round(p * 100)) + "%"; }); }
      catch (e) { note("Screenshot reader failed: " + (e && e.message ? e.message : e)); ocrFail = true; }
    }
    const combined = [text.trim(), ocrText].filter(Boolean).join("\n\n");
    S.ocrUsed = !!ocrText;
    if (!combined) {
      $("#r-body").innerHTML = '<p class="note">' + (ocrFail ? "The screenshot reader couldn't start on this page. Paste the message text instead, or use the offline file." : "No text was found in that image. Try a sharper screenshot, or paste the text.") + "</p>";
    } else {
      S.combined = combined; S.showAll = false; S.showText = false; S.play = true;
      analyze();
    }
    S.busy = false; $("#go").disabled = false;
  }
  function analyze() {
    const p = CampusGuardIntake.parse(S.combined);
    if (S.senderOverride !== null && p.kind !== "link") { p.sender = S.senderOverride; if (p.sender) p.kind = p.kind === "message" ? "email" : p.kind; }
    const r = p.kind === "link" ? engine.analyze(p.body) : engine.analyze(p.body, p.sender);
    S.last = { p, r };
    render();
  }

  // ------------------------------------------------------------------ results
  function gauge(v, thr, high) {
    const a = x => Math.PI * (1 - x), pt = (x, r) => [100 + r * Math.cos(a(x)), 100 - r * Math.sin(a(x))];
    const arc = (v0, v1, c) => { const [x0, y0] = pt(v0, 82), [x1, y1] = pt(v1, 82); return '<path d="M' + x0.toFixed(1) + " " + y0.toFixed(1) + " A82 82 0 0 1 " + x1.toFixed(1) + " " + y1.toFixed(1) + '" stroke="' + c + '" stroke-width="14" stroke-linecap="butt" fill="none"/>'; };
    return '<svg class="gauge" viewBox="0 0 200 110" role="img" aria-label="Risk ' + pct(v) + ' percent">' + arc(0, thr, "var(--ok)") + arc(thr, high, "var(--warn)") + arc(high, 1, "var(--danger)") +
      '<g class="needle" style="transform:rotate(-90deg)" data-deg="' + (-90 + v * 180) + '"><line x1="100" y1="100" x2="100" y2="34" stroke="var(--ink)" stroke-width="4" stroke-linecap="round"/></g><circle cx="100" cy="100" r="8" fill="var(--ink)"/></svg>';
  }
  function annotated(r) {
    let out = "", pos = 0; const t = r.analyzed_text;
    const tone = f => /lookalike|ip_host|credential|sensitive|secrets|upfront|threat|redirect|^url$/.test(f) ? "hi" : f === "suspicious_wording" ? "word" : "";
    for (const h of r.highlights || []) { if (h.start < pos) continue; out += esc(t.slice(pos, h.start)) + '<mark class="' + tone(h.flag) + '">' + esc(t.slice(h.start, h.end)) + "</mark>"; pos = h.end; }
    return '<div class="annotated">' + out + esc(t.slice(pos)) + "</div>";
  }
  function render() {
    const { p, r } = S.last, M = self.CG_MODEL.message_model, lvl = r.risk_level;
    // what CampusGuard understood
    const kind = { link: ["link", "A link"], email: ["mail", "An email"], message: ["chat", "A message"] }[p.kind];
    let chips = "<small>What I'm looking at</small>" + '<span class="chip">' + ico(kind[0]) + "<b>" + kind[1] + "</b></span>";
    if (S.ocrUsed) chips += '<span class="chip">' + ico("img") + "read from your screenshot</span>";
    if (p.kind !== "link") chips += p.sender
      ? '<button type="button" class="chip" id="chip-sender" title="Not the sender? Click to fix it">' + ico("user") + "from <b>" + esc(p.sender) + "</b>" + ico("pen") + "</button>"
      : '<button type="button" class="chip" id="chip-sender">' + ico("user") + "Add who sent it</button>";
    const nl = (r.urls || []).length;
    if (p.kind !== "link" && nl) chips += '<span class="chip">' + ico("link") + "<b>" + nl + "</b> link" + (nl > 1 ? "s" : "") + "</span>";
    $("#read").innerHTML = chips;

    const head = { high: p.kind === "link" ? "Don't open this link" : "Don't click, reply or pay", medium: "Be careful with this one", low: p.kind === "link" ? "This link looks fine" : "This looks fine" }[lvl];
    const act = (r.recommended_action || "").split(/(?<=\.)\s/)[0];
    let h = '<div class="verdict lvl-' + lvl + '">' + gauge(r.risk_score, M.threshold, M.high_threshold) + '<div class="num" id="num">' + pct(r.risk_score) + "%</div><h2>" + head + "</h2>" + (act ? "<p>" + esc(act) + "</p>" : "") + "</div>";

    // why: content signs first, plain rows, a few at a time
    const flags = (r.red_flags || []).filter(f => f.flag !== "suspicious_wording").concat((r.red_flags || []).filter(f => f.flag === "suspicious_wording"));
    if (flags.length) {
      const shown = S.showAll ? flags : flags.slice(0, 3);
      h += '<div class="why lvl-' + lvl + '"><h3>Why</h3>' + shown.map(f => {
        const ev = (f.evidence || []).slice(0, 2).map(e => "<q>" + esc(e) + "</q>").join(", ");
        return '<div class="sign" title="' + esc(f.why || "") + '"><span class="b"><svg class="ico" aria-hidden="true"><use href="#h-' + (SIGN[f.flag] || "alert") + '"/></svg></span><div style="min-width:0"><b>' + esc(f.label) + "</b>" + (ev ? "<span>" + ev + "</span>" : "") + "</div></div>";
      }).join("") + (flags.length > 3 ? '<button type="button" class="quiet" id="more-signs">' + (S.showAll ? "Show fewer" : "Show all " + flags.length + " signs") + "</button>" : "") + "</div>";
    } else if ((r.good_signs || []).length) {
      h += '<div class="why lvl-low"><h3>Why</h3>' + r.good_signs.slice(0, 3).map(g => '<div class="sign"><span class="b">' + ico("check") + '</span><div style="min-width:0"><b>' + esc(g) + "</b></div></div>").join("") + "</div>";
    }
    h += '<div class="how"><button type="button" class="how-btn" id="how">' + ico("play") + "See how it decided</button></div>";
    if (p.kind !== "link") h += '<div class="more"><button type="button" class="quiet" id="more-text" style="margin-top:0">' + (S.showText ? "Hide the message" : "See the message marked up") + "</button>" + (S.showText ? '<div style="margin-top:16px">' + annotated(r) + "</div>" : "") + "</div>";
    if (S.ocrUsed) h += '<p class="note">Text was read from your screenshot on this device. Reading images isn\'t perfect, so glance over the marked-up message.</p>';
    $("#r-body").innerHTML = h;
    const play = S.play && motionOn(); S.play = false;
    $("#read").classList.toggle("play", play);
    if (play) playResult(r, M); else { const n = $("#r-body .needle"); if (n) n.style.transform = "rotate(" + n.dataset.deg + "deg)"; }

    const ms = $("#more-signs"); if (ms) ms.addEventListener("click", () => { S.showAll = !S.showAll; render(); });
    const hw = $("#how"); if (hw) hw.addEventListener("click", () => CampusGuardJourney.open({ p: S.last.p, r: S.last.r, raw: S.combined, ocrUsed: S.ocrUsed, images: S.images, motion: motionOn() }));
    const mt = $("#more-text"); if (mt) mt.addEventListener("click", () => { S.showText = !S.showText; render(); });
    const cs = $("#chip-sender"); if (cs) cs.addEventListener("click", () => editSender(p.sender));
  }
  // ------------------------------------------------------------------ result animation
  // The needle and the number climb together from 0 to the risk; then the verdict, the reasons
  // and the rest fade in one after another. The motion button (or the system setting) turns it off.
  function motionOn() { return S.motion !== false; }
  let playToken = 0;
  function playResult(r, M) {
    const token = ++playToken;
    const body = $("#r-body"), needle = body.querySelector(".needle"), num = $("#num"), verdict = body.querySelector(".verdict");
    const seq = [...document.querySelectorAll("#read > *"), ...body.querySelectorAll(".verdict h2, .verdict p, .why h3, .sign, #more-signs, .how, .more, .note")];
    const late = seq.filter(el => !el.closest("#read"));
    late.forEach(el => el.classList.add("rv"));
    const target = r.risk_score, dur = 900 + 1100 * target;
    const zone = v => v >= M.high_threshold ? "var(--danger)" : v >= M.threshold ? "var(--warn)" : "var(--ok)";
    needle.style.transform = "rotate(-90deg)"; num.textContent = "0%"; num.style.color = zone(0);
    verdict.classList.add("sweeping");
    const ease = k => 1 - Math.pow(1 - k, 3);
    function frame(now) {
      if (token !== playToken || !document.body.contains(needle)) return;
      const k = Math.min(1, (now - t0) / dur), v = target * ease(k);
      needle.style.transform = "rotate(" + (-90 + v * 180) + "deg)";
      num.textContent = Math.round(v * 100) + "%"; num.style.color = zone(v);
      if (k < 1) return requestAnimationFrame(frame);
      num.textContent = pct(target) + "%"; num.style.color = "";
      verdict.classList.remove("sweeping"); verdict.classList.add("landed");
      late.forEach((el, i) => setTimeout(() => { if (token === playToken) el.classList.add("in"); }, 180 + i * 140));
    }
    let t0 = 0;
    setTimeout(() => { t0 = performance.now(); requestAnimationFrame(frame); }, 320);   // let the box finish docking first
  }
  function initMotion() {
    let on = !matchMedia("(prefers-reduced-motion: reduce)").matches;
    try { const m = localStorage.getItem("cg-motion"); if (m === "on") on = true; if (m === "off") on = false; } catch (e) { /* storage unavailable */ }
    const apply = () => { S.motion = on; document.body.classList.toggle("no-motion", !on); const b = $("#motion"); b.setAttribute("aria-pressed", String(on)); b.title = on ? "Animations on. Click to turn off." : "Animations off. Click to turn on."; };
    apply();
    $("#motion").addEventListener("click", () => { on = !on; apply(); try { localStorage.setItem("cg-motion", on ? "on" : "off"); } catch (e) { /* storage unavailable */ } });
  }

  function editSender(cur) {
    const cs = $("#chip-sender");
    const wrap = document.createElement("span"); wrap.className = "chip";
    wrap.innerHTML = ico("user") + '<input id="sender-edit" aria-label="Sender" placeholder="Name &lt;address@example.com&gt;" value="' + esc(cur || "") + '">';
    cs.replaceWith(wrap);
    const inp = $("#sender-edit"); inp.focus(); inp.select();
    let done = false;
    const apply = () => { if (done) return; done = true; S.senderOverride = inp.value.trim(); S.play = true; analyze(); };
    inp.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); apply(); } else if (e.key === "Escape") { done = true; render(); } });
    inp.addEventListener("blur", apply);
  }

  function boot() {
    const sp = document.createElement("div"); sp.style.display = "none";
    sp.innerHTML = "<svg>" + Object.keys(ICONS).map(k => '<symbol id="h-' + k + '" viewBox="0 0 24 24">' + ICONS[k] + "</symbol>").join("") + "</svg>";
    document.body.prepend(sp);
    initTheme(); initMotion();
    engine = CampusGuardEngine.create(self.CG_MODEL);
    window.CG_ENGINE = engine; window.CG_SIGN = SIGN;
    wireInput(); autosize(); syncGo();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
