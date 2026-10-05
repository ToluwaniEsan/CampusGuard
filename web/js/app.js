/* CampusGuard web app: paste & check, quiz, and the "how it works" launcher.
   All analysis runs locally through CampusGuardEngine; nothing is sent anywhere unless the
   page is served by the CampusGuard API and the user explicitly asks for an AI explanation. */
(function () {
  "use strict";
  const $ = (s, el) => (el || document).querySelector(s);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pct = x => Math.round(x * 100);

  const SAMPLES = [
    { label: "Fake financial aid", k: "s", sender: "AAMU Financial Aid <financialaid@aamu-support.com>",
      text: "URGENT: Verify Your Financial Aid Information\n\nDear Student,\n\nYour financial aid account requires immediate verification. Your Fall disbursement has been placed on hold. Click below to prevent your account from being suspended.\n\nVerify Your Account: http://aamu-support.com/finaid/verify-login\n\nThank you,\nAAMU Financial Aid Office" },
    { label: "IT password reset", k: "s", sender: "IT Help Desk <helpdesk@aamu.edu.mail-secure.xyz>",
      text: "Password Expiration Notice\n\nDear User,\nYour AAMU email password will expire today. To keep your current password, log in at http://aamu.edu.mail-secure.xyz/owa/login and confirm your credentials. Failure to do so will result in your mailbox being deactivated.\n\nIT Help Desk" },
    { label: "Remote job offer", k: "s", sender: "Student Coordinator <brucedavis.jobs@gmail.com>",
      text: "Exciting Part-Time Administrative Assistant Opportunity!\n\nDear Students and Staff,\nWe have a great opportunity for students interested in becoming a Personal Assistant (Remote). Only 11 hours per week, flexible hours.\nPay: $550 weekly.\n\nCLICK HERE TO APPLY or send a copy of your resume to my alternative email bruce.d.office@gmail.com.\n\nBest Regards,\nStudent Coordinator, Alabama A&M University" },
    { label: "\"President\" on Gmail", k: "s", sender: "Dr. Daniel Wims <president.office.aamu@gmail.com>",
      text: "Hello,\nAre you available? I need you to handle a quick favor for me discreetly. I'm in a meeting and can't talk right now. Reply as soon as possible.\nThanks" },
    { label: "Zelle mix-up text", k: "s", sender: "",
      text: "Hi! So sorry, I accidentally sent you $300 on Zelle, it was meant for my landlord. My bank says they can't reverse it. Could you please send it back to me today? Thank you so much, God bless" },
    { label: "Lookalike link", k: "u", sender: "", text: "http://aamu-edu.support/reset?user=student" },
    { label: "Real Canvas notice", k: "l", sender: "Canvas Notifications <notifications@instructure.com>",
      text: "Assignment Graded: Project Milestone 2, CS 405\n\nYour assignment Project Milestone 2 has been graded. Score: 46 out of 50.\nYou can view the submission and feedback here: https://aamu.instructure.com/courses/12345/assignments/67890" },
    { label: "Professor's email", k: "l", sender: "Dr. Monica Reed <monica.reed@aamu.edu>",
      text: "Re: Lab 4 rubric\n\nHi Toluwani,\nGood question. For part B you only need to show the time complexity analysis, not the full proof. I'll clarify this in class on Tuesday. Let me know if you have other questions.\n\nBest,\nDr. Reed" },
  ];

  const QUIZ = [
    { sender: "AAMU ITS <its@aamu.edu>", text: "Scheduled maintenance: Banner and campus Wi-Fi will be unavailable Saturday from 11pm to 3am. No action is needed on your part. ITS will never ask for your password by email.", scam: false,
      tip: "Official sender, nothing to click, nothing to give, and it even reminds you ITS never asks for passwords." },
    { sender: "Scholarship Committee <awards@aamu-scholarships.online>", text: "Congratulations! You were selected for the 2026 Presidential Excellence Scholarship worth $5,000. To claim your award, confirm your student ID, date of birth and social security number at http://aamu-scholarships.online/claim within 48 hours.", scam: true,
      tip: "A prize you never applied for, a 48-hour deadline, a request for your SSN, and a domain that only looks like AAMU." },
    { sender: "", text: "hey it's Jay from your OS class, I'm locked out of my account and they sent the verification code to your number by mistake. can you send it to me real quick?", scam: true,
      tip: "Nobody needs your verification code. Sharing it hands over your account." },
    { sender: "Career Development Services <careers@aamu.edu>", text: "Join us at the Fall Career and Internship Fair on October 14 from 10am to 2pm in the Student Union ballroom. Over 60 employers will attend. Bring copies of your resume and register on Handshake.", scam: false,
      tip: "Specific date, place, official office and domain, and it points you to the platform you already use." },
    { sender: "Microsoft 365 <security@micros0ft-office365.com>", text: "Your Office 365 account will be suspended. We could not verify your account. Open the attached document and enter your login details to keep access to email and OneDrive.", scam: true,
      tip: "Look closely: micros0ft uses a zero. A threat plus a login request is the classic combo." },
    { sender: "Chase <no.reply.alerts@chase.com>", text: "Your direct deposit of $612.40 has posted to your checking account ending in 4421. View your balance in the Chase app. Chase will never ask you for your password by email.", scam: false,
      tip: "Real bank domain, no link to click, no request, and it tells you to use the app you already have." },
    { sender: "Dr. Daniel Wims <president.office.aamu@gmail.com>", text: "Hello, are you available? I need you to handle a quick favor for me discreetly. I'm in a meeting and can't talk right now. Reply as soon as possible.", scam: true,
      tip: "\"The president\" writing from Gmail, asking for secrecy and speed. This usually ends in a gift-card request." },
    { sender: "", text: "Bible study moves to the fellowship hall this Wednesday at 7pm. Bring a friend! Choir rehearsal is Saturday at 10am as usual.", scam: false,
      tip: "No links, no money, no pressure. Just plans." },
    { sender: "", text: "USPS: Your package is on hold due to an incomplete address. Update your details within 12 hours to avoid return: https://usps-redelivery-help.top/track", scam: true,
      tip: "USPS doesn't text links on .top domains. Fake delivery texts are one of the most common scams." },
    { sender: "Handshake <jobs@notifications.joinhandshake.com>", text: "New jobs that match your profile: Software Engineering Intern at Adtran (Huntsville, AL); IT Support Student Assistant at Alabama A&M University. View and apply on Handshake.", scam: false,
      tip: "A job alert you signed up for, from the real Handshake domain, sending you to apply on the real site." },
  ];

  const FLAG_TONE = {
    url_ip_host: "hi", url_lookalike: "hi", sender_freemail_official: "hi", credential_request: "hi", sensitive_info: "hi",
    asks_for_secrets: "hi", upfront_payment: "hi", threat: "hi", url_at_or_redirect: "hi", url: "hi",
    suspicious_wording: "word",
  };

  let engine = null, mode = "msg", lastResult = null, liveTimer = null, apiAvailable = false;

  function toast(msg) {
    const t = $("#toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("show"), 1800);
  }

  // ------------------------------------------------------------------ boot
  function boot() {
    try {
      engine = CampusGuardEngine.create(self.CG_MODEL);
      window.CG_ENGINE = engine;
      $("#engine-status").textContent = "Model v" + engine.version + " · running on this device";
    } catch (e) {
      $("#engine-status").textContent = "The model failed to load. Reload the page.";
      console.error(e);
      return;
    }
    const s = $("#samples");
    SAMPLES.forEach((x, i) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "chip"; b.innerHTML = '<i class="' + x.k + '"></i>' + esc(x.label);
      b.title = x.k === "s" ? "Example scam" : x.k === "l" ? "Example legitimate message" : "Example link";
      b.addEventListener("click", () => loadSample(i));
      s.appendChild(b);
    });
    $("#check-form").addEventListener("submit", e => { e.preventDefault(); run(true); });
    $("#content").addEventListener("input", onInput);
    $("#sender").addEventListener("input", onInput);
    $("#clear-btn").addEventListener("click", () => { $("#content").value = ""; $("#sender").value = ""; onInput(); $("#content").focus(); });
    $("#tab-msg").addEventListener("click", () => setMode("msg"));
    $("#tab-url").addEventListener("click", () => setMode("url"));
    $("#explain-btn").addEventListener("click", openExplainer);
    $("#nav-explain").addEventListener("click", openExplainer);
    loadSample(0);
    quizInit();
    probeApi();
  }

  function setMode(m) {
    mode = m;
    $("#tab-msg").setAttribute("aria-selected", m === "msg");
    $("#tab-url").setAttribute("aria-selected", m === "url");
    $("#sender-field").hidden = m === "url";
    $("#content-label").textContent = m === "url" ? "Paste the link" : "Paste the message";
    $("#content").placeholder = m === "url" ? "e.g. http://aamu-edu.support/reset" : "Paste an email, text, DM or social media message here…";
    $("#content").style.minHeight = m === "url" ? "90px" : "";
  }

  function loadSample(i) {
    const x = SAMPLES[i];
    setMode(x.k === "u" ? "url" : "msg");
    $("#sender").value = x.sender || "";
    $("#content").value = x.text;
    updateCount();
    run(true);
  }

  function updateCount() {
    const n = $("#content").value.length;
    $("#char-count").textContent = n.toLocaleString() + " characters";
  }
  function onInput() {
    updateCount();
    if (!$("#live").checked) return;
    clearTimeout(liveTimer);
    liveTimer = setTimeout(() => run(false), 280);
  }

  function currentInput() {
    const text = $("#content").value;
    const sender = mode === "url" ? "" : $("#sender").value;
    return { text, sender };
  }

  function run(animate) {
    if (!engine) return;
    const { text, sender } = currentInput();
    if (!text.trim()) { renderEmpty(); return; }
    let r;
    try { r = engine.analyze(mode === "url" ? text.trim() : text, sender); }
    catch (e) { console.error(e); $("#result").innerHTML = '<div class="card panel">Something went wrong reading that message. Try removing unusual characters and check again.</div>'; return; }
    lastResult = r;
    render(r, animate);
  }

  // ------------------------------------------------------------------ rendering
  function renderEmpty() {
    lastResult = null;
    $("#result").innerHTML = '<div class="card panel"><h3 style="font-size:20px">Paste something to check</h3><p style="color:var(--ink-2);margin:8px 0 0">Copy the whole message, including the sender line if you can. CampusGuard will mark every warning sign it finds right inside the text.</p></div>';
  }

  function gaugeSvg(risk, thr, high) {
    // semicircle 0..1 mapped to 180deg
    const a = v => Math.PI * (1 - v);
    const pt = (v, r) => [100 + r * Math.cos(a(v)), 100 - r * Math.sin(a(v))];
    const arc = (v0, v1, color) => {
      const [x0, y0] = pt(v0, 80), [x1, y1] = pt(v1, 80);
      return '<path d="M' + x0.toFixed(1) + " " + y0.toFixed(1) + " A80 80 0 0 1 " + x1.toFixed(1) + " " + y1.toFixed(1) + '" stroke="' + color + '" stroke-width="16" fill="none"/>';
    };
    const deg = -90 + risk * 180;
    return '<svg class="gauge" viewBox="0 0 200 122" role="img" aria-label="Risk ' + pct(risk) + ' percent">' +
      arc(0, thr, "var(--ok)") + arc(thr, high, "var(--warn)") + arc(high, 1, "var(--danger)") +
      '<g class="needle" style="transform:rotate(-90deg)" data-deg="' + deg + '"><line x1="100" y1="100" x2="100" y2="30" stroke="var(--ink)" stroke-width="4" stroke-linecap="round"/></g>' +
      '<circle cx="100" cy="100" r="8" fill="var(--ink)"/>' +
      '<text x="100" y="94" text-anchor="middle" font-size="0" fill="var(--ink)"></text>' +
      '<text x="18" y="118" font-size="11" fill="var(--ink-3)">safe</text><text x="182" y="118" font-size="11" text-anchor="end" fill="var(--ink-3)">scam</text></svg>';
  }

  function annotated(text, highlights) {
    let out = "", pos = 0;
    for (const h of highlights) {
      if (h.start < pos) continue;
      out += esc(text.slice(pos, h.start));
      const tone = FLAG_TONE[h.flag] || "";
      out += '<mark class="' + tone + '" data-flag="' + esc(h.flag) + '" title="' + esc(labelFor(h.flag)) + '">' + esc(text.slice(h.start, h.end)) + "</mark>";
      pos = h.end;
    }
    return out + esc(text.slice(pos));
  }
  function labelFor(flag) {
    const f = (lastResult && lastResult.red_flags || []).find(x => x.flag === flag);
    return f ? f.label : flag;
  }

  function anatomy(u) {
    const host = u.parts.host || "", reg = u.parts.registered_domain || "";
    const raw = u.url;
    const i = raw.toLowerCase().indexOf(host);
    if (!host || i < 0) return '<span class="dom">' + esc(raw) + "</span>";
    const pre = raw.slice(0, i), hostRaw = raw.slice(i, i + host.length), rest = raw.slice(i + host.length);
    const j = hostRaw.toLowerCase().lastIndexOf(reg);
    const sub = j > 0 ? hostRaw.slice(0, j) : "", dom = j >= 0 ? hostRaw.slice(j) : hostRaw;
    return '<span class="rest">' + esc(pre) + '</span><span class="sub">' + esc(sub) + '</span><span class="dom">' + esc(dom) + '</span><span class="rest">' + esc(rest) + "</span>";
  }

  function render(r, animate) {
    const lvl = r.risk_level;
    const M = self.CG_MODEL.message_model;
    const flags = r.red_flags || [];
    const titleByLevel = {
      high: r.input_type === "url" ? "Don't open this link" : "Don't click, reply or pay",
      medium: r.input_type === "url" ? "Be careful with this link" : "Treat this with caution",
      low: r.input_type === "url" ? "This link looks OK" : "No strong warning signs",
    };
    let h = '<div class="card verdict lvl-' + lvl + (animate ? " fade-in" : "") + '">' +
      '<div style="display:grid;justify-items:center;gap:2px">' + gaugeSvg(r.risk_score, M.threshold, M.high_threshold) +
      '<div style="font:600 30px/1 var(--f-display);color:var(--vcolor);font-variant-numeric:tabular-nums" id="risk-num">' + pct(r.risk_score) + '%</div><div class="eyebrow">scam risk</div></div>' +
      '<div style="min-width:0"><span class="verdict-pill">' + esc(r.verdict) + "</span><h2>" + esc(titleByLevel[lvl]) + "</h2><p>" + esc(r.explanation) + "</p>" +
      (r.recommended_action ? '<div class="todo"><b>What to do:</b> ' + esc(r.recommended_action) + "</div>" : "") +
      '<div class="row-actions" style="margin-top:12px"><button type="button" class="btn ghost" id="copy-btn">Copy summary</button>' +
      '<button type="button" class="btn teal" id="explain-btn-2">Show me how it decided</button>' +
      (apiAvailable ? '<button type="button" class="btn ghost" id="ai-btn">Explain like a friend (AI)</button>' : "") +
      '</div><div id="ai-out"></div></div></div>';

    if (flags.length) {
      h += '<div class="card panel"><div class="section-h"><h3>Red flags (' + flags.length + ")</h3><span>Hover a flag to find it in the message</span></div><div class=\"flags\">";
      flags.forEach((f, idx) => {
        const ev = (f.evidence || []).slice(0, 4).map(e => "<code>" + esc(e) + "</code>").join("");
        h += '<div class="flag' + (idx >= 6 ? " extra" : "") + '"' + (idx >= 6 ? " hidden" : "") + ' data-flag="' + esc(f.flag) + '" tabindex="0"><span class="dot ' + f.severity + '"></span><div style="min-width:0"><b>' + esc(f.label) + "</b>" +
          (f.why ? "<small>" + esc(f.why) + "</small>" : "") + (ev ? '<div class="ev">' + ev + "</div>" : "") +
          '</div><span class="sev ' + f.severity + '">' + f.severity + "</span></div>";
      });
      h += "</div>" + (flags.length > 6 ? '<button type="button" class="btn ghost" id="more-flags" style="margin-top:10px">Show ' + (flags.length - 6) + " more</button>" : "") + "</div>";
    }
    if (r.input_type === "message") h += senderCard(r, M);
    const good = (r.good_signs || []).filter(g => lvl !== "high" || g.indexOf("Reads like") !== 0);
    if (good.length) {
      h += '<div class="card panel"><div class="section-h"><h3>' + (lvl === "low" ? "Signs it's legitimate" : "Signs pointing the other way") + '</h3></div><div class="good">' +
        good.map(g => '<div><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" aria-hidden="true"><path d="m5 12 5 5 9-10"/></svg><span>' + esc(g) + "</span></div>").join("") + "</div></div>";
    }
    if (r.input_type === "message") {
      h += '<div class="card panel"><div class="section-h"><h3>The message, marked up</h3><span>' + r.highlights.length + " spots marked</span></div>" +
        '<div class="annotated" id="annotated">' + annotated(r.analyzed_text, r.highlights) + "</div>" +
        '<div class="legend"><span><i style="background:var(--mark-danger);box-shadow:inset 0 -2px 0 var(--danger)"></i>serious red flag</span><span><i style="background:var(--mark-warn);box-shadow:inset 0 -2px 0 var(--warn)"></i>warning sign</span><span><i style="background:var(--mark-word);box-shadow:inset 0 -2px 0 var(--accent)"></i>wording common in scams</span></div></div>';
    }
    if ((r.urls || []).length) {
      h += '<div class="card panel"><div class="section-h"><h3>Links (' + r.urls.length + ')</h3><span>Read as text. Never opened.</span></div><div class="links">';
      for (const u of r.urls) {
        const col = u.risk_score >= 0.8 ? "var(--danger)" : u.risky ? "var(--warn)" : "var(--ok)";
        h += '<div class="link"><div class="anatomy' + (u.risky ? " bad" : "") + '">' + anatomy(u) + "</div>" +
          '<div style="display:flex;justify-content:space-between;gap:8px;margin-top:6px;font-size:14px;color:var(--ink-2)"><span>Real owner: <b class="mono">' + esc(u.domain || "?") + "</b></span><span>" + pct(u.risk_score) + "% risky</span></div>" +
          '<div class="bar"><i style="width:' + (animate ? 0 : pct(u.risk_score)) + "%;background:" + col + '" data-w="' + pct(u.risk_score) + '"></i></div>' +
          (u.reasons.length ? "<ul>" + u.reasons.map(x => "<li>" + esc(x) + "</li>").join("") + "</ul>" : "") + "</div>";
      }
      h += "</div></div>";
    }
    h += '<details class="card panel details"><summary>Model details</summary><div class="kv">' +
      '<div><span>Final risk</span><b>' + pct(r.risk_score) + "%</b></div>" +
      (r.content_score != null ? "<div><span>Content score</span><b>" + pct(r.content_score) + "%</b></div>" : "") +
      (r.message_model_score != null ? "<div><span>Text model</span><b>" + pct(r.message_model_score) + "%</b></div>" : "") +
      (r.url_model_score != null ? "<div><span>Link model</span><b>" + pct(r.url_model_score) + "%</b></div>" : "") +
      "<div><span>Time</span><b>" + r.latency_ms + " ms</b></div><div><span>Model</span><b>v" + esc(r.model_version) + "</b></div></div>" +
      '<p style="margin:10px 0 0">Suspicious from ' + pct(M.threshold) + "%, high risk from " + pct(M.high_threshold) + "%. The content decides: the From line can raise the score by at most 30% of the gap or lower it by at most 25%, and an official address never lowers a message that asks for passwords, codes or money. Logistic regression with exact SHAP attributions; links scored by gradient-boosted trees. Processed in your browser and discarded.</p></details>";

    const box = $("#result");
    box.innerHTML = h;
    // needle + bars animation
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const n = box.querySelector(".needle"); if (n) n.style.transform = "rotate(" + n.dataset.deg + "deg)";
      box.querySelectorAll(".bar i").forEach(b => b.style.width = b.dataset.w + "%");
    }));
    if (animate) countUp($("#risk-num"), pct(r.risk_score));
    wireResult(r);
  }

  function countUp(el, to) {
    if (!el || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t0 = performance.now(), d = 800;
    const step = t => { const k = Math.min(1, (t - t0) / d); el.textContent = Math.round(to * (1 - Math.pow(1 - k, 3))) + "%"; if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }

  // ---------------------------------------------------------------- sender check card
  function senderAnatomy(sc) {
    const bad = sc.checks.some(c => c.hit && c.id !== "official");
    const cls = sc.checks.some(c => c.id === "official" && c.hit) ? "ok" : bad ? "bad" : "";
    if (!sc.address) return '<span class="sa-name">' + esc(sc.raw) + "</span>";
    const sub = sc.subdomain ? sc.subdomain + "." : "";
    return (sc.display_name ? '<span class="sa-name">"' + esc(sc.display_name) + '"</span> ' : "") +
      '<span class="sa-rest">&lt;' + esc(sc.local) + "@" + esc(sub) + '</span><span class="sa-dom ' + cls + '">' + esc(sc.domain) + '</span><span class="sa-rest">&gt;</span>';
  }
  function edge(x) { return x < 0.1 ? "edge-l" : x > 0.9 ? "edge-r" : ""; }
  function bandBar(sc, thr, high) {
    const c = sc.content_score, f = sc.final_score;
    const lo = c * (1 - sc.max_lower), hi = c + sc.max_raise * (1 - c);
    const L = x => (x * 100).toFixed(2) + "%";
    return '<div class="band" role="img" aria-label="Content score ' + pct(c) + '%, after the sender ' + pct(f) + '%">' +
      '<div class="band-zones"><i style="left:0;width:' + L(thr) + ';background:var(--ok-soft)"></i><i style="left:' + L(thr) + ";width:" + L(high - thr) + ';background:var(--warn-soft)"></i><i style="left:' + L(high) + ";width:" + L(1 - high) + ';background:var(--danger-soft)"></i></div>' +
      '<div class="band-allowed" style="left:' + L(lo) + ";width:" + L(hi - lo) + '" title="The most the sender is allowed to move the score"></div>' +
      (Math.abs(f - c) > 0.004 ? '<div class="band-arrow" style="left:' + L(Math.min(c, f)) + ";width:" + L(Math.abs(f - c)) + '"></div>' : "") +
      '<div class="band-mark content ' + edge(c) + '" style="left:' + L(c) + '"><span>content ' + pct(c) + '%</span></div>' +
      '<div class="band-mark final ' + edge(f) + '" style="left:' + L(f) + '"><span>final ' + pct(f) + "%</span></div></div>" +
      '<div class="band-legend"><span><i class="lg-allowed"></i>how far the sender is allowed to move the score</span><span>risk scale 0–100%</span></div>';
  }
  function senderCard(r, M) {
    const sc = r.sender_check;
    if (!sc) return "";
    if (!sc.provided) return '<div class="card panel sender-card"><div class="section-h"><h3>Sender check</h3><span>Content-only score</span></div>' +
      '<p style="margin:0;color:var(--ink-2)">No From line was pasted, so the verdict comes from the message alone. Add the sender to see how the address is checked. It can nudge the score by up to ' + pct(0.3) + "% of the gap, never more.</p>" +
      '<button type="button" class="btn ghost" id="add-sender" style="margin-top:10px">Add the From line</button></div>';
    const delta = pct(sc.final_score) - pct(sc.content_score);
    const chip = sc.effect === "raise" ? (delta > 0 ? '<span class="sev High">Raised +' + delta + " pts</span>" : '<span class="sev High">Fired · already at max</span>')
      : sc.effect === "lower" ? '<span class="sev ok">Lowered ' + delta + " pts</span>" : '<span class="sev Low">No change</span>';
    const rows = sc.checks.map(c => {
      const trust = c.id === "official";
      const state = trust ? (c.hit ? "good" : "neutral") : (c.hit ? "bad" : "fine");
      const ans = c.id === "address" ? "Missing" : c.hit ? "Yes" : "No";
      return '<div class="sc-row ' + state + '"><div style="min-width:0"><b>' + esc(c.label) + (c.id === "address" ? "" : "?") + "</b><small>" + esc(c.detail) + '</small></div><span class="sc-ans">' + ans + "</span></div>";
    }).join("");
    return '<div class="card panel sender-card"><div class="section-h"><h3>Sender check</h3>' + chip + "</div>" +
      '<div class="sender-anatomy">' + senderAnatomy(sc) + "</div>" +
      '<div class="sc-rows">' + rows + "</div>" +
      '<div class="sc-score"><div class="eyebrow" style="margin-bottom:8px">How the sender moved the score</div>' + bandBar(sc, M.threshold, M.high_threshold) +
      '<div class="formula-line mono">' + esc(sc.formula) + '</div><p style="margin:6px 0 0;color:var(--ink-2)">' + esc(sc.summary) + "</p></div></div>";
  }

  function wireResult(r) {
    const ann = $("#annotated");
    document.querySelectorAll(".flag").forEach(el => {
      const on = () => {
        el.classList.add("active");
        if (!ann) return;
        const marks = ann.querySelectorAll('mark[data-flag="' + el.dataset.flag + '"]');
        marks.forEach(m => m.classList.add("pulse"));
        if (marks[0]) {
          const top = marks[0].offsetTop - ann.offsetTop - 40;
          ann.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
        }
      };
      const off = () => { el.classList.remove("active"); if (ann) ann.querySelectorAll("mark.pulse").forEach(m => m.classList.remove("pulse")); };
      el.addEventListener("mouseenter", on); el.addEventListener("mouseleave", off);
      el.addEventListener("focus", on); el.addEventListener("blur", off);
    });
    if (ann) ann.querySelectorAll("mark").forEach(m => {
      m.addEventListener("mouseenter", () => { const f = document.querySelector('.flag[data-flag="' + m.dataset.flag + '"]'); if (f) f.classList.add("active"); });
      m.addEventListener("mouseleave", () => document.querySelectorAll(".flag.active").forEach(f => f.classList.remove("active")));
    });
    const cb = $("#copy-btn");
    if (cb) cb.addEventListener("click", () => {
      const lines = ["CampusGuard: " + r.verdict + " (" + pct(r.risk_score) + "% risk)", r.explanation];
      (r.red_flags || []).slice(0, 6).forEach(f => lines.push("- " + f.label + ((f.evidence || []).length ? ": " + f.evidence.slice(0, 2).join(", ") : "")));
      if (r.recommended_action) lines.push("What to do: " + r.recommended_action);
      const txt = lines.join("\n");
      const fallback = () => { const ta = document.createElement("textarea"); ta.value = txt; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); toast("Summary copied"); } catch (e) { toast("Select and copy the summary manually"); } ta.remove(); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(() => toast("Summary copied"), fallback);
      else fallback();
    });
    const as = $("#add-sender"); if (as) as.addEventListener("click", () => { setMode("msg"); $("#sender").focus(); $("#check-form").scrollIntoView({ behavior: "smooth", block: "start" }); });
    const mf = $("#more-flags");
    if (mf) mf.addEventListener("click", () => { document.querySelectorAll(".flag.extra").forEach(x => x.hidden = false); mf.remove(); });
    const eb = $("#explain-btn-2"); if (eb) eb.addEventListener("click", openExplainer);
    const ab = $("#ai-btn"); if (ab) ab.addEventListener("click", () => askAi(r));
  }

  // ------------------------------------------------------------------ optional server features
  function probeApi() {
    if (location.protocol === "file:") return;
    fetch("api/health", { cache: "no-store" }).then(x => x.ok ? x.json() : null).then(j => {
      if (j && j.status === "ok") { apiAvailable = !!j.llm; if (apiAvailable && lastResult) render(lastResult, false); }
    }).catch(() => {});
  }
  function askAi(r) {
    const out = $("#ai-out"); out.innerHTML = '<div class="ai-box">Writing a friendly explanation…</div>';
    fetch("api/explain", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ verdict: r.verdict, risk_score: r.risk_score, red_flags: (r.red_flags || []).map(f => ({ label: f.label, evidence: f.evidence })) }) })
      .then(x => x.json()).then(j => { out.innerHTML = '<div class="ai-box">' + esc(j.explanation || "No explanation available right now.") + "</div>"; })
      .catch(() => { out.innerHTML = '<div class="ai-box">The AI explanation is unavailable right now. The red flags above still explain the verdict.</div>'; });
  }

  // ------------------------------------------------------------------ quiz
  const Q = { order: [], i: 0, right: 0, done: 0, streak: 0, answered: false };
  function quizInit() {
    Q.order = QUIZ.map((_, i) => i).sort(() => Math.random() - 0.5);
    Q.i = 0; Q.right = 0; Q.done = 0; Q.streak = 0;
    quizShow();
  }
  function quizShow() {
    const q = QUIZ[Q.order[Q.i]];
    Q.answered = false;
    $("#quiz-msg").innerHTML = '<div class="eyebrow" style="margin-bottom:10px">Message ' + (Q.i + 1) + " of " + QUIZ.length + "</div>" +
      (q.sender ? '<div class="from">From: ' + esc(q.sender) + "</div>" : '<div class="from">Text message</div>') +
      '<div class="body">' + esc(q.text) + "</div>";
    $("#quiz-side").innerHTML = '<div class="score"><div><b>' + Q.right + "/" + Q.done + '</b><span>Correct</span></div><div><b>' + Q.streak + '</b><span>Streak</span></div></div>' +
      '<p style="margin:0;color:var(--ink-2)">Scam or legit? Decide first, then see what CampusGuard found.</p>' +
      '<div class="guess"><button type="button" class="btn scam" id="g-scam">Scam</button><button type="button" class="btn legit" id="g-legit">Legit</button></div><div id="q-reveal"></div>';
    $("#g-scam").addEventListener("click", () => quizAnswer(true));
    $("#g-legit").addEventListener("click", () => quizAnswer(false));
  }
  function quizAnswer(saysScam) {
    if (Q.answered) return;
    Q.answered = true;
    const q = QUIZ[Q.order[Q.i]];
    const ok = saysScam === q.scam;
    Q.done++; if (ok) { Q.right++; Q.streak++; } else Q.streak = 0;
    const r = engine.analyze(q.text, q.sender);
    const top = (r.red_flags || []).filter(f => f.flag !== "suspicious_wording").slice(0, 3).map(f => "<li>" + esc(f.label) + "</li>").join("");
    $("#quiz-side").querySelector(".score").innerHTML = "<div><b>" + Q.right + "/" + Q.done + "</b><span>Correct</span></div><div><b>" + Q.streak + "</b><span>Streak</span></div>";
    $("#q-reveal").innerHTML = '<div class="reveal ' + (ok ? "right" : "wrong") + ' fade-in"><h4>' + (ok ? "Correct! " : "Not quite. ") + "It's " + (q.scam ? "a scam" : "legit") + ".</h4>" +
      '<p style="margin:0 0 8px;color:var(--ink-2)">' + esc(q.tip) + "</p>" +
      '<div style="font-size:14px;color:var(--ink-3)">CampusGuard says <b style="color:var(--ink)">' + esc(r.verdict) + "</b> (" + pct(r.risk_score) + "%)" + (top ? ":<ul style=\"margin:4px 0 0;padding-left:18px\">" + top + "</ul>" : ".") + "</div>" +
      '<div class="row-actions" style="margin-top:10px"><button type="button" class="btn primary" id="q-next">' + (Q.i + 1 < QUIZ.length ? "Next message" : "Play again") + '</button><button type="button" class="btn ghost" id="q-open">Open in checker</button></div></div>';
    $("#q-next").addEventListener("click", () => { if (Q.i + 1 < QUIZ.length) { Q.i++; quizShow(); } else quizInit(); });
    $("#q-open").addEventListener("click", () => { setMode("msg"); $("#sender").value = q.sender; $("#content").value = q.text; updateCount(); run(true); document.getElementById("check").scrollIntoView({ behavior: "smooth" }); });
  }

  // ------------------------------------------------------------------ explainer
  function openExplainer() {
    if (!engine) return;
    let { text, sender } = currentInput();
    if (!text.trim()) { text = SAMPLES[0].text; sender = SAMPLES[0].sender; }
    const r = engine.analyze(mode === "url" ? text.trim() : text, sender);
    CampusGuardExplainer.open(r, sender);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
