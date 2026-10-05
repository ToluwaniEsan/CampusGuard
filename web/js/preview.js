/* CampusGuard layout preview: signs first, words on hover/focus/tap. Same engine as the live app. */
(function () {
  "use strict";
  const $ = (s, el) => (el || document).querySelector(s);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pct = x => Math.round(x * 100);

  // ------------------------------------------------------------------ icons
  const ICONS = {
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    alert: '<path d="M12 3 2 20h20L12 3z"/><path d="M12 10v4M12 17h.01"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l3 3M14 9l2 2"/>',
    id: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M6 16c.6-1.5 5.4-1.5 6 0M15 10h3M15 14h3"/>',
    cursor: '<path d="m5 3 14 8-6 2-2 6z"/>',
    building: '<path d="M4 21V5l8-3 8 3v16M9 21v-5h6v5M8 9h.01M12 9h.01M16 9h.01M8 13h.01M12 13h.01M16 13h.01"/>',
    dollar: '<path d="M12 2v20M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
    briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18"/>',
    userq: '<circle cx="10" cy="8" r="4"/><path d="M3 21c0-4 3-6 7-6M17 9a2 2 0 1 1 3 1.7c-.7.5-1 .9-1 1.8M19 16h.01"/>',
    eyeoff: '<path d="m3 3 18 18M10.6 6.1A9.8 9.8 0 0 1 12 6c5 0 9 6 9 6a15 15 0 0 1-2.6 3.1M6.5 7.7A15 15 0 0 0 3 12s4 6 9 6c1.3 0 2.5-.3 3.6-.9M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
    chat: '<path d="M4 5h16v11H9l-5 4z"/><path d="M9 10.5h.01M12 10.5h.01M15 10.5h.01"/>',
    card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/>',
    mega: '<path d="M3 11v2l11 5V6L3 11zM14 9a3 3 0 0 1 0 6M6 13.5V18h3v-3"/>',
    type: '<path d="M4 7V5h16v2M12 5v14M9 19h6"/>',
    hash: '<path d="M5 9h14M5 15h14M10 4 8 20M16 4l-2 16"/>',
    mask: '<rect x="3" y="3" width="12" height="12" rx="2"/><rect x="9" y="9" width="12" height="12" rx="2"/>',
    layers: '<path d="m12 3 9 5-9 5-9-5 9-5zM3 13l9 5 9-5M3 17l9 5 9-5"/>',
    scissors: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    at: '<circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"/>',
    form: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 12h.01M11 12h.01M15 12h.01"/>',
    exit: '<path d="M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h5M17 16l4-4-4-4M21 12H9"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
    shield: '<path d="M12 2 20 5v6c0 5-3.4 8.7-8 10-4.6-1.3-8-5-8-10V5l8-3z"/><path d="m8.5 11.5 2.5 2.5 4.5-5"/>',
    link: '<path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    check: '<path d="m5 12 5 5 9-10"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    cpu: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>',
    bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z"/>',
    lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    nolink: '<path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1M3 3l18 18"/>',
    play: '<path d="M8 5v14l11-7z"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
    hand: '<path d="M12 22c4 0 7-3 7-7V8a1.5 1.5 0 0 0-3 0v3V5.5a1.5 1.5 0 0 0-3 0V11 4.5a1.5 1.5 0 0 0-3 0V11 6.5a1.5 1.5 0 0 0-3 0V14l-1.5-2a1.6 1.6 0 0 0-2.6 1.8L6 18c1.3 2.5 3.3 4 6 4z"/>',
    flame: '<path d="M12 22c4 0 7-2.7 7-7 0-3-2-5-3-7-1 2-2 2.5-3 2.5C13 7 12 4 9 2c.5 3-1 5-2 6.5S5 12 5 15c0 4.3 3 7 7 7z"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    doc: '<path d="M6 3h9l4 4v14H6zM14 3v5h5M9 13h6M9 17h6"/>',
    scale: '<path d="M12 4v16M6 20h12M4 8h16M4 8l-2 6a3 3 0 0 0 6 0L6 8M18 8l-2 6a3 3 0 0 0 6 0l-2-6"/>',
  };
  function sprite() {
    const s = document.createElement("div");
    s.style.display = "none";
    s.innerHTML = "<svg>" + Object.keys(ICONS).map(k => '<symbol id="i-' + k + '" viewBox="0 0 24 24">' + ICONS[k] + "</symbol>").join("") + "</svg>";
    document.body.prepend(s);
  }
  const ico = (n, cls) => '<svg class="v-ico ' + (cls || "") + '" aria-hidden="true"><use href="#i-' + n + '"/></svg>';

  // flag -> [icon, two-word caption]
  const SIGN = {
    urgency: ["clock", "Rush"], threat: ["alert", "Threat"], credential_request: ["key", "Password"], sensitive_info: ["id", "Personal info"],
    click_cta: ["cursor", "Click push"], impersonation: ["building", "Poses official"], money_lure: ["dollar", "Money bait"], job_scam: ["briefcase", "Job bait"],
    generic_greeting: ["userq", "Generic hello"], secrecy: ["eyeoff", "Secrecy"], asks_for_secrets: ["chat", "Asks secrets"], upfront_payment: ["card", "Pay first"],
    shouting: ["mega", "Shouting"], suspicious_wording: ["type", "Scam wording"], sender_freemail_official: ["mail", "Personal mail"], n_urls: ["link", "Many links"],
    url_ip_host: ["hash", "IP address"], url_lookalike: ["mask", "Lookalike"], url_many_subdomains: ["layers", "Hidden owner"], url_shortener: ["scissors", "Shortened"],
    url_suspicious_tld: ["globe", "Odd ending"], url_at_or_redirect: ["at", "Redirect trick"], url_sensitive_words: ["form", "Login words"], url_non_campus_official: ["exit", "Off campus"],
  };
  const TEXT_FLAGS = ["urgency", "threat", "credential_request", "sensitive_info", "click_cta", "impersonation", "money_lure", "job_scam", "generic_greeting", "secrecy", "asks_for_secrets", "upfront_payment", "shouting", "suspicious_wording", "sender_freemail_official"];
  const REASON_ICON = [[/IP address/i, "hash"], [/imitates/i, "mask"], [/subdomain/i, "layers"], [/Shortened/i, "scissors"], [/ending/i, "globe"], [/@|redirect/i, "at"], [/login|verify/i, "form"], [/Official|trusted/i, "shield"]];
  const SENDER_ICON = { lookalike: "mask", display_mismatch: "userq", freemail: "mail", official: "shield", risky_request: "chat", address: "at" };

  const SAMPLES = [
    { k: "s", tip: "Fake financial aid|Example scam", sender: "AAMU Financial Aid <financialaid@aamu-support.com>", text: "URGENT: Verify Your Financial Aid Information\n\nDear Student,\n\nYour financial aid account requires immediate verification. Your Fall disbursement has been placed on hold. Click below to prevent your account from being suspended.\n\nVerify Your Account: http://aamu-support.com/finaid/verify-login\n\nThank you,\nAAMU Financial Aid Office" },
    { k: "s", tip: "\"President\" on Gmail|Example scam", sender: "Dr. Daniel Wims <president.office.aamu@gmail.com>", text: "Hello,\nAre you available? I need you to handle a quick favor for me discreetly. I'm in a meeting and can't talk right now. Reply as soon as possible.\nThanks" },
    { k: "s", tip: "Remote job offer|Example scam", sender: "Student Coordinator <brucedavis.jobs@gmail.com>", text: "Exciting Part-Time Administrative Assistant Opportunity!\n\nDear Students and Staff,\nWe have a great opportunity for students interested in becoming a Personal Assistant (Remote). Only 11 hours per week, flexible hours.\nPay: $550 weekly.\n\nCLICK HERE TO APPLY or send a copy of your resume to my alternative email bruce.d.office@gmail.com.\n\nBest Regards,\nStudent Coordinator, Alabama A&M University" },
    { k: "s", tip: "Zelle mix-up text|Example scam", sender: "", text: "Hi! So sorry, I accidentally sent you $300 on Zelle, it was meant for my landlord. My bank says they can't reverse it. Could you please send it back to me today? Thank you so much, God bless" },
    { k: "u", tip: "Lookalike link|Example link", sender: "", text: "http://aamu-edu.support/reset?user=student" },
    { k: "l", tip: "Real Canvas notice|Example legit message", sender: "Canvas Notifications <notifications@instructure.com>", text: "Assignment Graded: Project Milestone 2, CS 405\n\nYour assignment Project Milestone 2 has been graded. Score: 46 out of 50.\nYou can view the submission and feedback here: https://aamu.instructure.com/courses/12345/assignments/67890" },
    { k: "l", tip: "Professor's email|Example legit message", sender: "Dr. Monica Reed <monica.reed@aamu.edu>", text: "Re: Lab 4 rubric\n\nHi Toluwani,\nGood question. For part B you only need to show the time complexity analysis, not the full proof. I'll clarify this in class on Tuesday.\n\nBest,\nDr. Reed" },
  ];
  const QUIZ = [
    { sender: "Scholarship Committee <awards@aamu-scholarships.online>", text: "Congratulations! You were selected for the 2026 Presidential Excellence Scholarship worth $5,000. To claim your award, confirm your student ID, date of birth and social security number at http://aamu-scholarships.online/claim within 48 hours.", scam: true },
    { sender: "AAMU ITS <its@aamu.edu>", text: "Scheduled maintenance: Banner and campus Wi-Fi will be unavailable Saturday from 11pm to 3am. No action is needed on your part. ITS will never ask for your password by email.", scam: false },
    { sender: "", text: "hey it's Jay from your OS class, I'm locked out of my account and they sent the verification code to your number by mistake. can you send it to me real quick?", scam: true },
    { sender: "Career Development Services <careers@aamu.edu>", text: "Join us at the Fall Career and Internship Fair on October 14 from 10am to 2pm in the Student Union ballroom. Over 60 employers will attend. Bring copies of your resume and register on Handshake.", scam: false },
    { sender: "", text: "USPS: Your package is on hold due to an incomplete address. Update your details within 12 hours to avoid return: https://usps-redelivery-help.top/track", scam: true },
    { sender: "", text: "Bible study moves to the fellowship hall this Wednesday at 7pm. Bring a friend! Choir rehearsal is Saturday at 10am as usual.", scam: false },
  ];

  let engine, last = null, lastSender = "", tab = "message", timer = null;

  // ------------------------------------------------------------------ popover (hover, focus, tap)
  const pop = () => $("#pop");
  let pinned = null;
  function showTip(el) {
    const raw = el.getAttribute("data-tip"); if (!raw) return;
    const [title, body, ev] = raw.split("|");
    pop().innerHTML = "<b>" + esc(title) + "</b>" + (body ? esc(body) : "") + (ev ? "<div>" + ev.split("~").filter(Boolean).slice(0, 4).map(e => "<code>" + esc(e) + "</code>").join("") + "</div>" : "");
    const r = el.getBoundingClientRect(), p = pop();
    p.classList.add("on");
    const w = p.offsetWidth, h = p.offsetHeight;
    let x = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2));
    let y = r.top - h - 10; if (y < 8) y = r.bottom + 10;
    p.style.left = x + "px"; p.style.top = y + "px";
    const f = el.getAttribute("data-flag");
    document.querySelectorAll(".annotated mark.pulse").forEach(m => m.classList.remove("pulse"));
    if (f) document.querySelectorAll('.annotated mark[data-flag="' + f + '"]').forEach(m => m.classList.add("pulse"));
  }
  function hideTip() { pop().classList.remove("on"); document.querySelectorAll(".annotated mark.pulse").forEach(m => m.classList.remove("pulse")); }
  function wireTips() {
    document.addEventListener("mouseover", e => { const t = e.target.closest("[data-tip]"); if (t && !pinned) showTip(t); });
    document.addEventListener("mouseout", e => { const t = e.target.closest("[data-tip]"); if (t && !pinned) hideTip(); });
    document.addEventListener("focusin", e => { const t = e.target.closest("[data-tip]"); if (t) showTip(t); });
    document.addEventListener("focusout", e => { if (e.target.closest("[data-tip]") && !pinned) hideTip(); });
    document.addEventListener("click", e => {
      const t = e.target.closest("[data-tip]");
      if (pinned) { pinned.classList.remove("pin"); pinned = null; hideTip(); }
      if (t && t.classList.contains("v-tile")) { pinned = t; t.classList.add("pin"); showTip(t); }
    });
    window.addEventListener("scroll", () => { if (!pinned) hideTip(); }, { passive: true });
  }
  const tip = (title, body, ev) => esc(title + "|" + (body || "") + "|" + (ev || []).join("~"));

  // ------------------------------------------------------------------ pieces
  function gauge(v, thr, high) {
    const a = x => Math.PI * (1 - x), pt = (x, r) => [100 + r * Math.cos(a(x)), 100 - r * Math.sin(a(x))];
    const arc = (v0, v1, c) => { const [x0, y0] = pt(v0, 80), [x1, y1] = pt(v1, 80); return '<path d="M' + x0.toFixed(1) + " " + y0.toFixed(1) + " A80 80 0 0 1 " + x1.toFixed(1) + " " + y1.toFixed(1) + '" stroke="' + c + '" stroke-width="16" fill="none"/>'; };
    return '<svg class="gauge" viewBox="0 0 200 112" role="img" aria-label="Risk ' + pct(v) + ' percent">' + arc(0, thr, "var(--ok)") + arc(thr, high, "var(--warn)") + arc(high, 1, "var(--danger)") +
      '<g class="needle" style="transform:rotate(-90deg)" data-deg="' + (-90 + v * 180) + '"><line x1="100" y1="100" x2="100" y2="32" stroke="var(--ink)" stroke-width="4" stroke-linecap="round"/></g><circle cx="100" cy="100" r="8" fill="var(--ink)"/></svg>';
  }
  function tile(f) {
    const s = SIGN[f.flag] || ["alert", f.label];
    const n = (f.evidence || []).length;
    return '<button type="button" class="v-tile ' + f.severity + '" data-flag="' + esc(f.flag) + '" data-tip="' + tip(f.label, f.why, f.evidence) + '"><span class="b">' + ico(s[0]) + (n > 1 ? "<em>" + n + "</em>" : "") + "</span>" + esc(s[1]) + "</button>";
  }
  function ring(v, risky) {
    const c = v >= 0.8 ? "var(--danger)" : risky ? "var(--warn)" : "var(--ok)", C = 2 * Math.PI * 14;
    return '<svg class="v-ring" viewBox="0 0 34 34"><circle cx="17" cy="17" r="14" fill="none" stroke="var(--line)" stroke-width="4"/><circle cx="17" cy="17" r="14" fill="none" stroke="' + c + '" stroke-width="4" stroke-linecap="round" stroke-dasharray="' + (C * v).toFixed(1) + " " + C.toFixed(1) + '" transform="rotate(-90 17 17)"/></svg>';
  }
  function laneMessage(r) {
    const flags = (r.red_flags || []).filter(f => TEXT_FLAGS.indexOf(f.flag) !== -1);
    const fired = new Set(flags.map(f => f.flag));
    const clear = TEXT_FLAGS.filter(n => !fired.has(n) && n !== "suspicious_wording" && n !== "sender_freemail_official").map(n => SIGN[n][1]);
    const worst = flags.some(f => f.severity === "High") ? "bad" : flags.length ? "warn" : "";
    return '<div class="v-lane"><div class="v-lane-h">' + ico("doc") + "Message<i class=\"" + worst + '"></i></div><div class="v-tiles">' + (flags.length ? flags.map(tile).join("") : '<span class="v-tiny">Nothing flagged</span>') + "</div>" +
      (clear.length ? '<button type="button" class="v-clear" data-tip="' + tip("Checked and clear", clear.join(", ")) + '">' + ico("check") + clear.length + " clear</button>" : "") + "</div>";
  }
  function laneLinks(r) {
    const urls = r.urls || [];
    const lf = (r.red_flags || []).filter(f => f.flag.indexOf("url") === 0);
    const worst = urls.some(u => u.risk_score >= 0.8) ? "bad" : urls.some(u => u.risky) ? "warn" : urls.length ? "" : "none";
    let h = '<div class="v-lane"><div class="v-lane-h">' + ico("link") + "Links<i class=\"" + worst + '"></i></div>';
    if (!urls.length) return h + '<span class="v-tiny">No links</span></div>';
    h += urls.slice(0, 3).map(u => '<button type="button" class="v-linkchip" data-tip="' + tip(u.url, pct(u.risk_score) + "% risky. Never opened.", u.reasons) + '">' + ring(u.risk_score, u.risky) + "<b>" + esc(u.domain || u.url) + "</b></button>").join("");
    if (r.input_type === "url") {
      const rs = urls[0].reasons || [];
      h += '<div class="v-tiles">' + rs.map(x => { const m = REASON_ICON.find(p => p[0].test(x)); const good = /Official|trusted/.test(x);
        return '<button type="button" class="v-tile ' + (good ? "good" : "Medium") + '" data-tip="' + tip(x) + '"><span class="b">' + ico(m ? m[1] : "alert") + "</span>" + esc(x.split(" ").slice(0, 2).join(" ")) + "</button>"; }).join("") + "</div>";
    } else h += '<div class="v-tiles">' + lf.map(tile).join("") + "</div>";
    return h + "</div>";
  }
  function laneSender(r) {
    const sc = r.sender_check;
    let h = '<div class="v-lane"><div class="v-lane-h">' + ico("user") + "Sender";
    if (!sc || !sc.provided) return h + '<i class="none"></i></div><button type="button" class="v-btn" id="add-sender">' + ico("user") + "Add sender</button></div>";
    const bad = sc.checks.some(c => c.hit && c.id !== "official"), ok = sc.checks.some(c => c.id === "official" && c.hit);
    h += '<i class="' + (bad ? "bad" : "") + '"></i></div><span class="v-addr ' + (bad ? "bad" : ok ? "ok" : "") + '" data-tip="' + tip("Real owner of the address", sc.address || sc.raw) + '">' + esc(sc.domain || "no address") + "</span>";
    h += '<div class="v-tiles">' + sc.checks.map(c => { const good = c.id === "official";
      const cls = good ? (c.hit ? "good" : "") : (c.hit ? "High" : "good");
      const cap = { lookalike: "Lookalike", display_mismatch: "Name match", freemail: "Mailbox", official: "Trusted", risky_request: "Risky ask", address: "No address" }[c.id];
      return '<button type="button" class="v-tile ' + cls + '" data-tip="' + tip(c.label + "? " + (c.hit ? "Yes" : "No"), c.detail) + '"><span class="b">' + ico(SENDER_ICON[c.id] || "user") + "</span>" + cap + "</button>"; }).join("") + "</div>";
    const c = sc.content_score, f = sc.final_score, lo = c * (1 - sc.max_lower), hi = c + sc.max_raise * (1 - c), L = x => (x * 100).toFixed(1) + "%";
    h += '<div class="v-mini" tabindex="0" data-tip="' + tip("Sender moved the score " + pct(c) + "% → " + pct(f) + "%", sc.summary, [sc.formula]) + '"><div class="t"></div><div class="a" style="left:' + L(lo) + ";width:" + L(hi - lo) + '"></div><div class="c" style="left:' + L(c) + '"></div><div class="m" style="left:' + L(f) + '"></div></div>';
    return h + "</div>";
  }
  function annotated(r) {
    let out = "", pos = 0; const t = r.analyzed_text;
    const tone = f => /lookalike|ip_host|credential|sensitive|secrets|upfront|threat|redirect|^url$/.test(f) ? "hi" : f === "suspicious_wording" ? "word" : "";
    for (const h of r.highlights || []) { if (h.start < pos) continue; out += esc(t.slice(pos, h.start)) + '<mark class="' + tone(h.flag) + '" data-flag="' + esc(h.flag) + '">' + esc(t.slice(h.start, h.end)) + "</mark>"; pos = h.end; }
    return '<div class="annotated">' + out + esc(t.slice(pos)) + "</div>";
  }
  function paneScore(r) {
    const tr = r.trace || {}, steps = [];
    if (r.input_type === "url") steps.push(["Link", r.risk_score, "Link model|250 decision trees on the link's structure"]);
    else {
      steps.push(["Text", tr.p_msg, "Text model|Words plus red-flag detectors"]);
      if (tr.p_url != null) steps.push(["+ Links", tr.fused, "Text + links|A risky link can only raise the score"]);
      steps.push(["Content", tr.content, "Content score|This leads the decision"]);
      const sc = r.sender_check;
      if (sc && sc.provided) steps.push(["Sender", sc.final_score, "After the sender|" + sc.summary + "|" + sc.formula]);
    }
    return '<div class="v-steps">' + steps.map((s, i) => (i ? '<span class="v-arrow"></span>' : "") + '<button type="button" class="v-step' + (i === steps.length - 1 ? " final" : "") + '" data-tip="' + esc(s[2]) + '"><b>' + pct(s[1]) + "</b>" + s[0] + "</button>").join("") + "</div>";
  }
  function pane(r) {
    if (tab === "message") return r.input_type === "message" ? annotated(r) : '<div class="mono" style="overflow-wrap:anywhere">' + esc(r.analyzed_text) + "</div>";
    if (tab === "score") return paneScore(r);
    return '<p style="margin:0 0 10px;color:var(--ink-2)">' + esc(r.explanation) + "</p>" + ((r.good_signs || []).length && r.risk_level !== "high" ? '<div class="good">' + r.good_signs.map(g => "<div>" + ico("check") + "<span>" + esc(g) + "</span></div>").join("") + "</div>" : "");
  }

  function render(r) {
    last = r;
    const M = self.CG_MODEL.message_model, lvl = r.risk_level;
    const head = { high: r.input_type === "url" ? "Don't open it" : "Don't click, reply or pay", medium: "Be careful", low: "Looks fine" }[lvl];
    let h = '<div class="v-verdict lvl-' + lvl + '"><div style="display:grid;justify-items:center;gap:4px">' + gauge(r.risk_score, M.threshold, M.high_threshold) + '<div class="v-num-big">' + pct(r.risk_score) + "%</div></div>" +
      '<div style="min-width:0"><span class="v-pill">' + esc(r.verdict) + "</span><h2>" + head + "</h2>" +
      (r.recommended_action ? '<div class="v-do">' + ico(lvl === "low" ? "check" : "hand") + "<span>" + esc(r.recommended_action.split(". ")[0].replace(/\.$/, "")) + ".</span></div>" : "") +
      '<div class="v-row" style="margin-top:16px"><button type="button" class="v-btn icon" id="b-play" data-tip="See how it decided|Step-by-step animation">' + ico("play") + '</button><button type="button" class="v-btn icon" id="b-copy" data-tip="Copy summary|To send to a friend or IT">' + ico("copy") + "</button></div></div></div>";
    h += '<div class="v-lanes">' + laneMessage(r) + laneLinks(r) + laneSender(r) + "</div>";
    h += '<div><div class="v-tabs" role="tablist">' + [["message", "doc", "Marked up"], ["score", "scale", "Score"], ["why", "info", "In words"]].map(t =>
      '<button type="button" role="tab" data-tab="' + t[0] + '" aria-selected="' + (tab === t[0]) + '">' + ico(t[1]) + "<span>" + t[2] + "</span></button>").join("") + '</div><div class="v-pane lvl-' + lvl + '" id="pane">' + pane(r) + "</div></div>";
    const box = $("#result"); box.innerHTML = h;
    requestAnimationFrame(() => requestAnimationFrame(() => { const n = box.querySelector(".needle"); if (n) n.style.transform = "rotate(" + n.dataset.deg + "deg)"; }));
    box.querySelectorAll("[data-tab]").forEach(b => b.addEventListener("click", () => { tab = b.dataset.tab; render(last); }));
    const as = $("#add-sender"); if (as) as.addEventListener("click", () => $("#sender").focus());
    $("#b-play").addEventListener("click", () => CampusGuardExplainer.open(last, lastSender));
    $("#b-copy").addEventListener("click", () => {
      const txt = "CampusGuard: " + r.verdict + " (" + pct(r.risk_score) + "% risk)\n" + r.explanation + "\nWhat to do: " + r.recommended_action;
      const done = () => { $("#status").textContent = "Copied"; setTimeout(() => { $("#status").textContent = ""; }, 1500); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done, () => {});
    });
  }

  function run() {
    const text = $("#content").value, sender = $("#sender").value;
    if (!text.trim()) { $("#result").innerHTML = '<div class="v-lane" style="text-align:center;padding:48px 20px;color:var(--ink-3)">' + ico("shield") + "<div>Paste something to check</div></div>"; return; }
    lastSender = sender;
    render(engine.analyze(text, sender));
  }

  // ------------------------------------------------------------------ quiz
  const Q = { i: 0, right: 0, streak: 0 };
  function quiz() {
    const q = QUIZ[Q.i % QUIZ.length];
    $("#qmsg").innerHTML = "<small>" + (q.sender ? esc(q.sender) : "Text message") + "</small>" + esc(q.text);
    $("#qside").innerHTML = '<div class="v-score"><span data-tip="Correct answers">' + ico("check") + Q.right + '</span><span data-tip="Streak">' + ico("flame") + Q.streak + "</span></div>" +
      '<div class="v-guess"><button type="button" class="scam" id="g1">' + ico("alert") + 'Scam</button><button type="button" class="legit" id="g0">' + ico("shield") + 'Legit</button></div><div class="v-reveal" id="qrev"></div>';
    const ans = says => {
      const ok = says === q.scam; if (ok) { Q.right++; Q.streak++; } else Q.streak = 0;
      const r = engine.analyze(q.text, q.sender);
      const tiles = (r.red_flags || []).filter(f => f.flag !== "suspicious_wording").slice(0, 4).map(tile).join("");
      $("#qrev").innerHTML = '<span class="v-pill lvl-' + (ok ? "low" : "high") + '" style="background:var(--vsoft);margin:0">' + (ok ? "Correct" : "Not quite") + " · " + (q.scam ? "scam" : "legit") + "</span>" + tiles +
        '<button type="button" class="v-btn" id="qn">Next</button>';
      $("#qn").addEventListener("click", () => { Q.i++; quiz(); });
      $("#g1").disabled = $("#g0").disabled = true;
    };
    $("#g1").addEventListener("click", () => ans(true)); $("#g0").addEventListener("click", () => ans(false));
  }

  function boot() {
    sprite();
    engine = CampusGuardEngine.create(self.CG_MODEL);
    $("#badges").innerHTML = [["bolt", "Instant|Verdict in milliseconds"], ["lock", "Private|Runs on your device. Nothing stored."], ["nolink", "Links never opened|Read as text only"]]
      .map(b => '<span class="v-badge" tabindex="0" data-tip="' + esc(b[1]) + '">' + ico(b[0]) + "</span>").join("");
    $("#samples").innerHTML = SAMPLES.map((s, i) => '<button type="button" class="v-dot ' + s.k + '" data-i="' + i + '" data-tip="' + esc(s.tip) + '">' + ico(s.k === "l" ? "check" : s.k === "u" ? "link" : "alert") + "</button>").join("");
    $("#samples").addEventListener("click", e => { const b = e.target.closest("[data-i]"); if (!b) return; const s = SAMPLES[b.dataset.i]; $("#sender").value = s.sender; $("#content").value = s.text; run(); });
    $("#form").addEventListener("submit", e => { e.preventDefault(); run(); });
    $("#clear").addEventListener("click", () => { $("#content").value = ""; $("#sender").value = ""; run(); });
    ["content", "sender"].forEach(id => $("#" + id).addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(run, 280); }));
    $("#stats").innerHTML = [["97%", "target", "scams caught|On 1,768 held-out test messages"], ["0.6%", "shield", "false alarms|Legit messages wrongly flagged"], ["3 ms", "bolt", "per check|Runs in your browser"]]
      .map(s => '<button type="button" class="v-stat" data-tip="' + esc(s[2].split("|")[0] + "|" + s[2].split("|")[1]) + '"><b>' + s[0] + "</b><span>" + ico(s[1]) + s[2].split("|")[0] + "</span></button>").join("") +
      '<button type="button" class="v-stat play" id="watch">' + ico("play") + "Watch how it works</button>";
    $("#watch").addEventListener("click", () => { if (last) CampusGuardExplainer.open(last, lastSender); });
    wireTips();
    $("#sender").value = SAMPLES[0].sender; $("#content").value = SAMPLES[0].text; run();
    quiz();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
