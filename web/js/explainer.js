/* "How it works" — a step-by-step animation of the real pipeline, driven by the engine's
   trace for whatever the user pasted (presentation mode: arrows, space, esc). */
(function (root) {
  "use strict";
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pct = x => Math.round(x * 100);
  const $ = s => document.querySelector(s);
  let S = null;

  function timers() { const list = []; return { set(fn, ms) { list.push(setTimeout(fn, ms * S.speed)); }, clear() { list.forEach(clearTimeout); list.length = 0; } }; }

  // ------------------------------------------------------------------ step builders
  function stepPaste(r, sender) {
    const raw = r.trace.raw;
    const shown = raw.length > 900 ? raw.slice(0, 900) + "…" : raw;
    return {
      title: "1. You paste a message", sub: "It goes into this browser tab's memory only. No account, no upload, nothing saved.", dur: 4200,
      html: (sender ? '<div class="formula" style="margin-bottom:8px">From: <b>' + esc(sender) + "</b></div>" : "") + '<div class="xp-box"><div class="xp-text" id="xp-type"></div></div>',
      play(t) {
        const el = $("#xp-type"); let i = 0; const n = shown.length; const stepN = Math.max(1, Math.ceil(n / 90));
        const tick = () => { i = Math.min(n, i + stepN); el.innerHTML = esc(shown.slice(0, i)) + '<span class="caret"></span>'; if (i < n) t.set(tick, 30); };
        tick();
      },
    };
  }

  function markCleaned(clean) {
    return esc(clean).replace(/\b(urltoken|emailtoken|moneytoken)\b/g, '<span class="swap">[$1]</span>').replace(/(^|\s)0(?=\s|$)/g, '$1<span class="swap">#</span>');
  }
  function stepClean(r) {
    const tr = r.trace;
    const raw = tr.raw.length > 700 ? tr.raw.slice(0, 700) + "…" : tr.raw;
    const cleaned = tr.cleaned.length > 700 ? tr.cleaned.slice(0, 700) + "…" : tr.cleaned;
    const urls = (r.urls || []).length, emails = (tr.cleaned.match(/emailtoken/g) || []).length, money = (tr.cleaned.match(/moneytoken/g) || []).length;
    return {
      title: "2. Clean it up", sub: "Strip HTML and mail headers, then swap links, email addresses, dollar amounts and numbers for placeholders so the model learns the pattern, not the specific address.", dur: 5200,
      html: '<div class="xp-cols"><div class="xp-box"><h4>As pasted</h4><div class="xp-text">' + esc(raw) + '</div></div><div class="xp-box"><h4>What the model reads</h4><div class="xp-text" id="xp-clean" style="opacity:.15;transition:opacity .8s">' + markCleaned(cleaned) + "</div></div></div>" +
        '<div class="checks"><div class="check on fine">Links → [urltoken]: <b>&nbsp;' + urls + '</b></div><div class="check on fine">Emails → [emailtoken]: <b>&nbsp;' + emails + '</b></div><div class="check on fine">Money → [moneytoken]: <b>&nbsp;' + money + '</b></div><div class="check on fine">Lower-cased, numbers → #</div></div>',
      play(t) { t.set(() => { const e = $("#xp-clean"); if (e) e.style.opacity = 1; }, 600); },
    };
  }

  function stepTokens(r) {
    const tr = r.trace;
    const vocab = new Set(tr.term_contrib.map(x => x.term));
    const toks = tr.tokens.slice(0, 70);
    return {
      title: "3. Break it into words and phrases", sub: "Every word, plus every two-word phrase, is looked up in the 25,000-term vocabulary learned from about 12,000 real and scam messages.", dur: 5200,
      html: '<div class="final-row" style="margin-bottom:16px"><div><div class="big-num" id="xp-count">0</div><div class="formula">words found</div></div><div class="formula">' + tr.n_tokens + " words + " + (tr.n_grams - tr.n_tokens) + " two-word phrases = <b>" + tr.n_grams + "</b> pieces · <b>" + tr.vocab_hits + "</b> of them are in the vocabulary of " + tr.vocab_size.toLocaleString() + "</div></div>" +
        '<div class="xp-box"><div class="tok-cloud" id="xp-toks"></div></div>',
      play(t) {
        const box = $("#xp-toks"); const cnt = $("#xp-count");
        toks.forEach((w, i) => t.set(() => {
          const s = document.createElement("span"); s.className = "tok" + (vocab.has(w) ? " known" : ""); s.textContent = w; box.appendChild(s);
          cnt.textContent = Math.round((i + 1) / toks.length * tr.n_tokens);
        }, 40 * i));
      },
    };
  }

  function stepTfidf(r) {
    const tr = r.trace;
    const top = tr.term_contrib.slice().sort((a, b) => b.tfidf - a.tfidf).slice(0, 10);
    const mx = Math.max(...top.map(x => x.tfidf), 0.01);
    return {
      title: "4. Score how telling each word is (TF-IDF)", sub: "Words that are common here but rare in everyday mail weigh more. Pink leans scam, teal leans normal, based on what the model learned.", dur: 5200,
      html: '<div class="xp-box"><h4>Top words in this message</h4><div class="weights">' + (top.length ? top.map(x =>
        '<div class="wrow"><span title="' + esc(x.term) + '">' + esc(x.term) + '</span><div class="wtrack"><i data-w="' + (x.tfidf / mx * 100).toFixed(1) + '" style="background:' + (x.contribution > 0 ? "#d77ab6" : "#4fd1c5") + '"></i></div><em>' + x.tfidf.toFixed(2) + "</em></div>").join("")
        : '<div class="formula">No known words, so the detectors below carry the decision.</div>') + "</div></div>",
      play(t) { t.set(() => document.querySelectorAll(".wtrack i").forEach(i => i.style.width = i.dataset.w + "%"), 200); },
    };
  }

  function stepDetectors(r) {
    const tr = r.trace;
    const all = tr.flag_hits.concat(tr.eng_contrib.filter(e => e.name.startsWith("url_") || e.name.startsWith("sender") || e.name === "shouting")
      .map(e => ({ name: e.name, label: e.label, count: e.value, examples: [] })));
    const seen = new Set(); const lamps = all.filter(x => !seen.has(x.name) && seen.add(x.name));
    const lit = lamps.filter(l => l.count > 0).length;
    return {
      title: "5. Run the red-flag detectors", sub: "Hand-built detectors look for the tricks named in our research: urgency, threats, password requests, impersonation, money bait, job scams, secrecy and more. Reassurances like \"we'll never ask for your password\" are ignored.", dur: 5600,
      html: '<div class="formula" style="margin-bottom:12px"><b id="xp-lit">0</b> of ' + lamps.length + " detectors triggered</div><div class=\"lamps\">" + lamps.map((l, i) =>
        '<div class="lamp" data-i="' + i + '" data-on="' + (l.count > 0 ? 1 : 0) + '"><b>' + esc(l.label) + "</b><small>" + (l.count > 0 ? (l.examples.length ? "“" + esc(l.examples.slice(0, 2).join("”, “")) + "”" : "found") : "not found") + "</small></div>").join("") + "</div>",
      play(t) {
        let n = 0;
        document.querySelectorAll(".lamp").forEach((el, i) => { if (el.dataset.on === "1") t.set(() => { el.classList.add("lit"); $("#xp-lit").textContent = ++n; }, 250 + 220 * n + i * 10); });
        if (!lit) $("#xp-lit").textContent = "0";
      },
    };
  }

  function dissect(u) {
    const p = u.parts, raw = u.url, host = p.host || "";
    const i = raw.toLowerCase().indexOf(host);
    if (!host || i < 0) return '<span class="p-dom">' + esc(raw) + "</span>";
    const reg = p.registered_domain || "", hostRaw = raw.slice(i, i + host.length);
    const j = hostRaw.toLowerCase().lastIndexOf(reg);
    const sub = j > 0 ? hostRaw.slice(0, j) : "";
    const regRaw = j >= 0 ? hostRaw.slice(j) : hostRaw;
    const dot = regRaw.indexOf(".");
    const name = dot > 0 && !p.ip_host ? regRaw.slice(0, dot) : regRaw, suf = dot > 0 && !p.ip_host ? regRaw.slice(dot) : "";
    return '<span class="p-path">' + esc(raw.slice(0, i)) + '</span><span class="p-sub">' + esc(sub) + '</span><span class="p-dom">' + esc(name) + '</span><span class="p-suf">' + esc(suf) + '</span><span class="p-path">' + esc(raw.slice(i + host.length)) + "</span>";
  }
  function stepLinks(r) {
    const u = (r.urls || [])[0];
    if (!u) return {
      title: "6. Inspect the links", sub: "No links in this message, so the link model sits this one out.", dur: 2600,
      html: '<div class="xp-box"><div class="formula">0 links found. Scams without links usually try to get a reply, a code or a payment instead, which the detectors in step 5 look for.</div></div>', play() {},
    };
    const p = u.parts, st = u._struct || {};
    const checks = [
      ["Raw IP address instead of a name", p.ip_host], ["Imitates a trusted name" + (p.lookalike_target ? " (" + p.lookalike_target + ")" : ""), !!p.lookalike_target],
      ["Subdomains hiding the owner: " + p.subdomains, p.subdomains >= 3], ["Link shortener", p.shortener], ["Unusual ending (.xyz, .top…)", p.suspicious_tld],
      ["Login / verify words in the link", (u.reasons || []).some(x => /login|verify|account/i.test(x))],
    ];
    return {
      title: "6. Inspect the links (without opening them)", sub: "Each link is split into parts. The real owner is the highlighted name right before the ending, no matter what comes before it.", dur: 6200,
      html: '<div class="xp-box"><div class="url-dissect">' + dissect(u) + '</div><div class="formula" style="margin-top:10px">Real owner: <b>' + esc(u.domain) + '</b> · <span style="color:#4fd1c5">never visited, read as text</span></div>' +
        '<div class="checks">' + checks.map(c => '<div class="check ' + (c[1] ? "bad" : "fine") + '">' + (c[1] ? "✕ " : "✓ ") + esc(c[0]) + "</div>").join("") + "</div>" +
        '<div style="margin-top:16px"><h4>Link model (250 decision trees)</h4><div class="wrow"><span>risk</span><div class="wtrack"><i data-w="' + pct(u.risk_score) + '" style="background:' + (u.risky ? "#ff6b82" : "#4ade9a") + '"></i></div><em>' + pct(u.risk_score) + "%</em></div></div></div>" +
        ((r.urls || []).length > 1 ? '<div class="formula" style="margin-top:8px">+ ' + (r.urls.length - 1) + " more link(s) checked the same way.</div>" : ""),
      play(t) {
        document.querySelectorAll(".check").forEach((el, i) => t.set(() => el.classList.add("on"), 400 + i * 420));
        t.set(() => document.querySelectorAll(".wtrack i").forEach(i => i.style.width = i.dataset.w + "%"), 400 + checks.length * 420);
      },
    };
  }

  function stepWeigh(r) {
    const tr = r.trace;
    const items = tr.term_contrib.map(x => ({ label: "“" + x.term + "”", c: x.contribution })).concat(tr.eng_contrib.map(e => ({ label: e.label, c: e.contribution })))
      .filter(x => Math.abs(x.c) > 0.01).sort((a, b) => Math.abs(b.c) - Math.abs(a.c)).slice(0, 9);
    const used = items.reduce((a, x) => a + x.c, 0);
    const rest = tr.z - tr.intercept - used;
    const sig = z => 1 / (1 + Math.exp(-z));
    return {
      title: "7. Weigh the evidence", sub: "Logistic regression adds up every piece of evidence: each word and detector pushes toward scam or toward safe. SHAP values say exactly how hard each one pushed.", dur: 7200,
      html: '<div class="tug-labels"><span>← looks normal</span><span>looks like a scam →</span></div><div class="tug"><div class="knob" id="xp-knob"></div></div>' +
        '<div class="xp-cols"><div class="xp-box"><h4>Biggest pushes</h4><div class="weights" id="xp-push"></div></div><div class="xp-box"><h4>The math</h4>' +
        '<div class="formula">score z = starting point <b>' + tr.intercept.toFixed(2) + '</b> + Σ pushes</div><div class="big-num" id="xp-z" style="margin:10px 0">' + tr.intercept.toFixed(2) + '</div>' +
        '<div class="formula">probability = 1 / (1 + e<sup>−z</sup>) = <b id="xp-p">' + pct(sig(tr.intercept)) + "%</b></div></div></div>",
      play(t) {
        const knob = $("#xp-knob"), push = $("#xp-push"), zEl = $("#xp-z"), pEl = $("#xp-p");
        let z = tr.intercept;
        const set = () => { knob.style.left = (4 + 92 * sig(z)) + "%"; zEl.textContent = z.toFixed(2); pEl.textContent = pct(sig(z)) + "%"; };
        set();
        const mx = Math.max(...items.map(x => Math.abs(x.c)), 0.01);
        items.forEach((x, i) => t.set(() => {
          z += x.c; set();
          const row = document.createElement("div"); row.className = "wrow";
          row.innerHTML = "<span title=\"" + esc(x.label) + "\">" + esc(x.label) + '</span><div class="wtrack"><i style="width:' + (Math.abs(x.c) / mx * 100).toFixed(1) + "%;background:" + (x.c > 0 ? "#ff6b82" : "#4fd1c5") + '"></i></div><em>' + (x.c > 0 ? "+" : "") + x.c.toFixed(2) + "</em>";
          push.appendChild(row);
        }, 500 + i * 520));
        t.set(() => {
          z = tr.z; set();
          const row = document.createElement("div"); row.className = "wrow";
          row.innerHTML = '<span>everything else</span><div class="wtrack"></div><em>' + (rest > 0 ? "+" : "") + rest.toFixed(2) + "</em>";
          push.appendChild(row);
        }, 500 + items.length * 520 + 200);
      },
    };
  }

  function stepDecide(r) {
    const tr = r.trace, M = self.CG_MODEL.message_model;
    const rows = [["Text model", pct(tr.p_msg) + "%"]];
    if (tr.p_url != null) { rows.push(["Riskiest link", pct(tr.p_url) + "%"]); rows.push(["Text + links (a link can only raise it)", pct(tr.fused) + "%"]); }
    (tr.rules || []).filter(x => x.floor != null).forEach(x => rows.push([x.rule, "at least " + pct(x.floor) + "%"]));
    rows.push(["Content score", pct(tr.content) + "%"]);
    return {
      title: "8. Combine the text and the links", sub: "This is the content score, and it leads the decision. A risky link can only push it up; a raw IP or lookalike link sets at least 60%.", dur: 5200,
      html: '<div class="final-row"><div id="xp-gauge"></div><div class="fuse">' + rows.map(x => "<div><span>" + esc(x[0]) + "</span><b>" + esc(x[1]) + "</b></div>").join("") + "</div></div>",
      play(t) {
        const g = $("#xp-gauge");
        g.innerHTML = gauge(0, M.threshold, M.high_threshold);
        document.querySelectorAll(".fuse div").forEach((el, i) => t.set(() => el.classList.add("on"), 300 + i * 600));
        t.set(() => { g.innerHTML = gauge(tr.content, M.threshold, M.high_threshold, "Content"); }, 300 + rows.length * 600);
      },
    };
  }

  function senderDissect(sc) {
    if (!sc.address) return '<span class="p-path">' + esc(sc.raw) + "</span>";
    return (sc.display_name ? '<span class="p-path">"' + esc(sc.display_name) + '" </span>' : "") + '<span class="p-path">&lt;' + esc(sc.local) + "@</span>" +
      (sc.subdomain ? '<span class="p-sub">' + esc(sc.subdomain) + ".</span>" : "") + '<span class="p-dom">' + esc(sc.domain) + '</span><span class="p-path">&gt;</span>';
  }
  function stepSender(r) {
    const sc = r.sender_check || { provided: false, checks: [] }, M = self.CG_MODEL.message_model, INF = self.CG_MODEL.infer;
    const rules = [
      ["sender_lookalike", "Address imitates a trusted domain", "closes up to " + pct(INF.sender_pull.sender_lookalike) + "% of the gap to 100%"],
      ["sender_display_mismatch", "Name doesn't match the address", "closes up to " + pct(INF.sender_pull.sender_display_mismatch) + "% of the gap"],
      ["sender_freemail", "Official-sounding name on Gmail/Yahoo", "closes up to " + pct(INF.sender_pull.sender_freemail) + "% of the gap"],
      ["lower", "Official domain + official links + no risky request", "lowers the risk by up to " + pct(INF.trusted_sender_discount) + "%"],
      ["no_discount", "Official domain but asks for passwords, codes or money", "no discount, flagged as a possible hacked account"],
    ];
    const hitNames = (r.red_flags || []).map(f => f.flag);
    const applied = k => (k === "lower" || k === "no_discount") ? sc.effect === k : hitNames.indexOf(k) !== -1;
    const table = '<div class="xp-box"><h4>The From-line rules (the content always counts more)</h4>' + rules.map(x =>
      '<div class="rule-row' + (applied(x[0]) ? " on" : "") + '"><span>' + esc(x[1]) + "</span><b>" + esc(x[2]) + "</b></div>").join("") + "</div>";
    if (!sc.provided) return {
      title: "9. Check the sender", sub: "No From line was pasted, so the content score stands on its own. When a sender is given, it can only nudge the score within a fixed limit.", dur: 5000,
      html: table, play(t) { document.querySelectorAll(".rule-row").forEach((el, i) => { el.style.opacity = 0; t.set(() => { el.style.opacity = 1; }, 200 + i * 350); }); },
    };
    const c = sc.content_score, f = sc.final_score, lo = c * (1 - sc.max_lower), hi = c + sc.max_raise * (1 - c);
    const L = x => (x * 100).toFixed(2) + "%";
    return {
      title: "9. Check the sender", sub: "The address is split into parts and run through four checks. Then it nudges the content score, never by more than the dashed band allows.", dur: 8200,
      html: '<div class="xp-box"><div class="url-dissect">' + senderDissect(sc) + '</div><div class="formula" style="margin-top:8px">Real owner of the address: <b>' + esc(sc.domain || "none found") + "</b></div>" +
        '<div class="checks">' + sc.checks.map(x => { const good = x.id === "official"; const bad = x.hit && !good;
          return '<div class="check ' + (bad ? "bad" : "fine") + '" title="' + esc(x.detail) + '"><span style="flex:1">' + esc(x.label) + (x.id === "address" ? "" : "?") + '</span><b>' + (x.id === "address" ? "missing" : x.hit ? "YES" : "no") + "</b></div>"; }).join("") + "</div></div>" +
        '<div class="xp-box" style="margin-top:14px"><h4>How far the sender may move the score</h4>' +
        '<div class="xband"><div class="xband-track"><i style="left:0;width:' + L(M.threshold) + ';background:#2f6b55"></i><i style="left:' + L(M.threshold) + ";width:" + L(M.high_threshold - M.threshold) + ';background:#7a6326"></i><i style="left:' + L(M.high_threshold) + ";width:" + L(1 - M.high_threshold) + ';background:#7a2a3c"></i></div>' +
        '<div class="xband-allowed" id="xb-allowed" style="left:' + L(lo) + ";width:" + L(hi - lo) + '"></div>' +
        '<div class="xband-dot content" style="left:' + L(c) + '"><span>content ' + pct(c) + '%</span></div>' +
        '<div class="xband-dot final" id="xb-final" style="left:' + L(c) + '"><span>final ' + pct(f) + "%</span></div></div>" +
        '<div class="formula" id="xb-formula" style="opacity:0;transition:opacity .5s;margin-top:8px"><b>' + esc(sc.formula) + "</b> · " + esc(sc.summary) + "</div></div>" + table,
      play(t) {
        document.querySelectorAll(".check").forEach((el, i) => t.set(() => el.classList.add("on"), 300 + i * 450));
        const n = sc.checks.length;
        const al = $("#xb-allowed"); al.style.opacity = 0; t.set(() => { al.style.opacity = 1; }, 400 + n * 450);
        t.set(() => { $("#xb-final").style.left = L(f); }, 1200 + n * 450);
        t.set(() => { $("#xb-formula").style.opacity = 1; }, 2000 + n * 450);
        document.querySelectorAll(".rule-row").forEach(el => { if (!el.classList.contains("on")) el.style.opacity = .45; });
      },
    };
  }

  function gauge(v, thr, high, verdict) {
    const a = x => Math.PI * (1 - x), pt = (x, rr) => [120 + rr * Math.cos(a(x)), 120 - rr * Math.sin(a(x))];
    const arc = (v0, v1, c) => { const [x0, y0] = pt(v0, 95), [x1, y1] = pt(v1, 95); return '<path d="M' + x0 + " " + y0 + " A95 95 0 0 1 " + x1 + " " + y1 + '" stroke="' + c + '" stroke-width="18" fill="none"/>'; };
    const [nx, ny] = pt(v, 78);
    const col = v >= high ? "#ff6b82" : v >= thr ? "#f5c04a" : "#4ade9a";
    return '<svg viewBox="0 0 240 160" width="260" style="max-width:100%">' + arc(0, thr, "#2f6b55") + arc(thr, high, "#7a6326") + arc(high, 1, "#7a2a3c") +
      '<line x1="120" y1="120" x2="' + nx + '" y2="' + ny + '" stroke="#fff" stroke-width="5" stroke-linecap="round"/><circle cx="120" cy="120" r="9" fill="#fff"/>' +
      '<text x="120" y="150" text-anchor="middle" font-size="22" font-weight="600" fill="' + col + '" font-family="Prompt, sans-serif">' + (verdict ? esc(verdict) + " · " + pct(v) + "%" : "…") + "</text></svg>";
  }

  function stepExplain(r) {
    const flags = (r.red_flags || []).slice(0, 5);
    return {
      title: "9. Decide and explain", sub: "Below " + pct(self.CG_MODEL.message_model.threshold) + "% is likely safe, " + pct(self.CG_MODEL.message_model.high_threshold) + "% and up is high risk. Every flag is named, shown in the message and paired with what to do.", dur: 7000,
      html: '<div class="xp-cols"><div><div id="xp-gauge2" style="margin-bottom:8px"></div><div id="xp-flags"></div>' + (!flags.length ? '<div class="formula">No red flags. ' + esc((r.good_signs || []).join(" · ")) + "</div>" : "") + '</div><div class="xp-box"><h4>What the student sees</h4><div class="xp-text" id="xp-expl"></div></div></div>',
      play(t) {
        const M = self.CG_MODEL.message_model, g2 = $("#xp-gauge2");
        if (g2) { g2.innerHTML = gauge(r.trace.content != null ? r.trace.content : 0, M.threshold, M.high_threshold); t.set(() => { g2.innerHTML = gauge(r.risk_score, M.threshold, M.high_threshold, r.verdict); }, 300); }
        const box = $("#xp-flags");
        flags.forEach((f, i) => t.set(() => {
          const d = document.createElement("div"); d.className = "xp-flag";
          d.style.borderColor = f.severity === "High" ? "#ff6b82" : f.severity === "Medium" ? "#f5c04a" : "#6c63c9";
          d.innerHTML = "<b>" + esc(f.label) + "</b><small>" + esc((f.evidence || []).slice(0, 2).join(" · ")) + "</small>";
          box.appendChild(d);
        }, 300 + i * 500));
        const txt = r.explanation + "\n\nWhat to do: " + (r.recommended_action || "");
        let k = 0; const el = $("#xp-expl");
        const tick = () => { k = Math.min(txt.length, k + 3); el.innerHTML = esc(txt.slice(0, k)) + '<span class="caret"></span>'; if (k < txt.length) t.set(tick, 22); };
        t.set(tick, 600);
      },
    };
  }

  // URL-only flow
  function stepUrlPaste(r) {
    return { title: "1. You paste a link", sub: "It's treated as plain text. CampusGuard never opens it, so nothing on the other end can run.", dur: 3200,
      html: '<div class="xp-box"><div class="url-dissect">' + esc(r.trace.raw) + "</div></div>", play() {} };
  }
  function stepUrlTrees(r) {
    const rep = r.trace.url_report;
    const top = rep._contrib.filter(x => Math.abs(x.contribution) > 0.02).sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution)).slice(0, 8);
    const mx = Math.max(...top.map(x => Math.abs(x.contribution)), 0.01);
    return { title: "3. Ask 250 decision trees", sub: "A gradient-boosted model trained on about 20,000 real phishing and safe links votes, and we trace which link features drove the vote.", dur: 5600,
      html: '<div class="xp-box"><div class="weights">' + top.map(x => '<div class="wrow"><span title="' + esc(x.label) + '">' + esc(x.label) + '</span><div class="wtrack"><i data-w="' + (Math.abs(x.contribution) / mx * 100).toFixed(1) + '" style="background:' + (x.contribution > 0 ? "#ff6b82" : "#4fd1c5") + '"></i></div><em>' + (x.contribution > 0 ? "+" : "") + x.contribution.toFixed(2) + "</em></div>").join("") + "</div></div>",
      play(t) { t.set(() => document.querySelectorAll(".wtrack i").forEach(i => i.style.width = i.dataset.w + "%"), 200); } };
  }
  function stepUrlDecide(r) {
    const thr = self.CG_MODEL.url_model.threshold;
    return { title: "4. Decide", sub: "Hard rules can only raise the score: a raw IP, a lookalike or punycode name is always treated as dangerous. Official campus and well-known domains are capped low.", dur: 4200,
      html: '<div class="final-row"><div id="xp-gauge"></div><div class="fuse"><div class="on"><span>Link risk</span><b>' + pct(r.risk_score) + "%</b></div></div></div>",
      play(t) { const g = $("#xp-gauge"); g.innerHTML = gauge(0, thr, 0.8); t.set(() => g.innerHTML = gauge(r.risk_score, thr, 0.8, r.verdict), 500); } };
  }

  // ------------------------------------------------------------------ player
  function renumber(steps) { steps.forEach((st, i) => { st.title = (i + 1) + ". " + st.title.replace(/^\d+\.\s*/, ""); }); return steps; }
  function build(r, sender) {
    if (r.input_type === "url") {
      const fake = Object.assign({}, r, { urls: [Object.assign({}, r.trace.url_report)] });
      const s2 = stepLinks(fake); s2.title = s2.title.replace("6.", "2.");
      const e = stepExplain(r); e.title = e.title.replace("9.", "5.");
      return renumber([stepUrlPaste(r), s2, stepUrlTrees(r), stepUrlDecide(r), e]);
    }
    const withPriv = Object.assign({}, r, { urls: (r.trace.url_reports || []) });
    return renumber([stepPaste(r, sender), stepClean(r), stepTokens(r), stepTfidf(r), stepDetectors(r), stepLinks(withPriv), stepWeigh(r), stepDecide(r), stepSender(r), stepExplain(r)]);
  }

  function show(i) {
    S.t.clear();
    S.i = Math.max(0, Math.min(S.steps.length - 1, i));
    const st = S.steps[S.i];
    $("#xp-stage").innerHTML = '<h3 class="xp-title">' + esc(st.title) + '</h3><p class="xp-sub">' + esc(st.sub) + "</p>" + st.html;
    $("#xp-steps").querySelectorAll("li").forEach((li, k) => { li.className = k === S.i ? "on" : k < S.i ? "done" : ""; });
    st.play(S.t);
    S.start = performance.now(); S.elapsed = 0;
  }
  function loop(now) {
    if (!S) return;
    if (S.playing) {
      const st = S.steps[S.i], dur = st.dur * S.speed;
      const el = now - S.start;
      $("#xp-prog").style.width = (((S.i + Math.min(1, el / dur)) / S.steps.length) * 100).toFixed(2) + "%";
      if (el >= dur) { if (S.i < S.steps.length - 1) show(S.i + 1); else setPlaying(false); }
    }
    S.raf = requestAnimationFrame(loop);
  }
  function setPlaying(p) {
    S.playing = p;
    $("#xp-play").textContent = p ? "❚❚ Pause" : "▶ Play";
    if (p) { if (S.i === S.steps.length - 1 && performance.now() - S.start > S.steps[S.i].dur * S.speed) show(0); S.start = performance.now() - (S.pausedAt || 0); }
    else S.pausedAt = performance.now() - S.start;
  }
  function key(e) {
    if (!S) return;
    if (e.key === "Escape") close();
    else if (e.key === "ArrowRight") { show(S.i + 1); }
    else if (e.key === "ArrowLeft") { show(S.i - 1); }
    else if (e.key === " ") { e.preventDefault(); setPlaying(!S.playing); }
  }
  function close() {
    if (!S) return;
    S.t.clear(); cancelAnimationFrame(S.raf);
    $("#xp").hidden = true; document.removeEventListener("keydown", key); document.body.style.overflow = "";
    const back = S.opener; S = null; if (back && back.focus) back.focus();
  }
  function open(result, sender) {
    if (S) close();
    S = { i: 0, playing: true, speed: Number($("#xp-speed").value) || 1, opener: document.activeElement };
    S.t = timers();
    S.steps = build(result, sender);
    $("#xp-steps").innerHTML = S.steps.map((s, k) => "<li data-k=\"" + k + "\"><b>" + (k + 1) + "</b><span>" + esc(s.title.replace(/^\d+\.\s*/, "")) + "</span></li>").join("");
    $("#xp-steps").querySelectorAll("li").forEach(li => li.addEventListener("click", () => show(Number(li.dataset.k))));
    $("#xp").hidden = false; document.body.style.overflow = "hidden";
    document.addEventListener("keydown", key);
    show(0);
    S.raf = requestAnimationFrame(loop);
    $("#xp-close").focus();
  }
  function wire() {
    $("#xp-close").addEventListener("click", close);
    $("#xp-next").addEventListener("click", () => S && show(S.i + 1));
    $("#xp-prev").addEventListener("click", () => S && show(S.i - 1));
    $("#xp-play").addEventListener("click", () => S && setPlaying(!S.playing));
    $("#xp-speed").addEventListener("change", e => { if (S) { S.speed = Number(e.target.value); show(S.i); } });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire); else wire();
  root.CampusGuardExplainer = { open, close };
})(typeof self !== "undefined" ? self : globalThis);
