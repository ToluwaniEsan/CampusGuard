/* CampusGuard "How it decided": a camera travels along one straight line of stations.
 *
 *   overview (whole line) -> travel to the next dot -> zoom in -> the station plays -> zoom out -> ...
 *
 * Everything is a pure function of one clock, so Pause freezes it anywhere (even mid-zoom),
 * Back / Next / clicking a dot jump cleanly, and the speed setting just scales the clock.
 * The stations are driven by the real result for whatever was just checked.
 */
(function (root) {
  "use strict";
  const $ = (s, el) => (el || document).querySelector(s);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pct = x => Math.round(x * 100);
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const ease = k => k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;      // in-out cubic
  const out3 = k => 1 - Math.pow(1 - k, 3);
  const sig = z => 1 / (1 + Math.exp(-z));
  const ico = n => '<svg class="ico" aria-hidden="true"><use href="#h-' + n + '"/></svg>';
  const cut = (s, n) => s.length > n ? s.slice(0, n).replace(/\s+\S*$/, "") + "…" : s;

  const T = { intro: 900, travel: 700, zin: 1200, zout: 1000 };
  let J = null;

  // ------------------------------------------------------------------ station content
  // Each station: { key, name, title, line, hold, html, update(el, p) }.
  // Elements with data-at="0.4" get class "on" once the station's progress passes 0.4.
  function stRead(d) {
    const kind = { link: ["link", "A link"], email: ["mail", "An email"], message: ["chat", "A message"] }[d.p.kind];
    const shots = d.images.filter(i => i.url).slice(0, 2).map(i => '<img src="' + i.url + '" alt="">').join("");
    return {
      key: "read", name: "Read", title: "Read what you pasted", line: "First it works out what it's looking at.", hold: 3800,
      html: '<div class="j-read">' + (shots ? '<div class="j-shots" data-at="0.05">' + shots + '</div><div class="j-arrow" data-at="0.25">' + ico("arrow") + "</div>" : "") +
        '<div class="j-paper" data-at="' + (shots ? 0.4 : 0.05) + '">' + esc(cut(d.raw, 460)) + "</div>" +
        '<div class="j-stamp" data-at="0.62">' + ico(kind[0]) + "<span>" + kind[1] + (d.ocrUsed ? " · read from a screenshot" : "") + "</span></div></div>",
    };
  }

  function stSeparate(d) {
    const bodyLines = new Set(d.p.body.split("\n").map(l => l.trim()).filter(Boolean));
    const addr = (d.p.sender.match(/[^\s<>]+@[^\s<>]+/) || [""])[0].toLowerCase();
    const nm = d.p.sender.replace(/<.*$/, "").trim().toLowerCase();
    const lines = d.raw.split("\n").map(l => l.trim()).filter(Boolean).slice(0, 7).map(l => {
      const low = l.toLowerCase();
      const cls = (addr && low.indexOf(addr) !== -1) || (nm && nm.length > 3 && low === nm) || /^(from|sender)\s*:/i.test(l) ? "who"
        : /^subject\s*:/i.test(l) ? "what" : bodyLines.has(l) ? "what" : "junk";
      return '<div class="j-ln ' + cls + '">' + esc(cut(l, 110)) + "</div>";
    }).join("");
    const found = !!d.p.sender;
    return {
      key: "separate", name: "Separate", title: "Separate the sender from the message", hold: 4600,
      line: found ? "Who sent it and what it says are judged separately." : "No sender line was found, so only the message is judged.",
      html: '<div class="j-sep"><div class="j-lines" data-at="0.05">' + lines + "</div>" +
        '<div class="j-split"><div class="j-box who" data-at="0.6"><small>' + ico("user") + "Who sent it</small><b>" + (found ? esc(d.p.sender) : "Not given") + "</b></div>" +
        '<div class="j-box what" data-at="0.72"><small>' + ico("chat") + "What it says</small><b>" + esc(cut(d.p.body.replace(/\s+/g, " "), 120)) + "</b></div></div></div>",
      update(el, p) { el.querySelector(".j-lines").classList.toggle("sorted", p >= 0.3); },
    };
  }

  function stClean(d) {
    const P = root.CG_MODEL.patterns;
    const src = "(" + P.email[0] + ")|(" + P.url[0] + ")|(" + P.money[0] + ")|(\\d+)";
    const re = new RegExp(src, "gi");
    const text = cut(d.r.trace.normalised || d.r.analyzed_text, 520);
    let out = "", pos = 0, m, n = 0;
    while ((m = re.exec(text)) !== null) {
      if (!m[0]) { re.lastIndex++; continue; }
      const lab = m[1] ? "[address]" : m[0].match(/^\$/) ? "[amount]" : /^\d+$/.test(m[0]) ? "#" : "[link]";
      out += esc(text.slice(pos, m.index)) + '<span class="j-swap"><i>' + esc(m[0]) + "</i><b>" + lab + "</b></span>";
      pos = m.index + m[0].length; n++;
    }
    out += esc(text.slice(pos));
    return {
      key: "clean", name: "Clean", title: "Clean it up", hold: 4200,
      line: n ? "Links, addresses and amounts become placeholders, so it learns the pattern and not the specifics." : "Nothing to swap here. The text is lower-cased and tidied.",
      html: '<div class="j-paper j-clean" data-at="0.05">' + out + "</div>",
      update(el, p) { el.querySelector(".j-clean").classList.toggle("swapped", p >= 0.42); },
    };
  }

  function stSigns(d) {
    const r = d.r, t = r.analyzed_text;
    const hs = (r.highlights || []).filter(h => h.flag !== "suspicious_wording");
    const lim = 620;
    let out = "", pos = 0, k = 0;
    const shown = hs.filter(h => h.end <= lim);
    for (const h of shown) {
      if (h.start < pos) continue;
      const at = (0.12 + 0.62 * (k / Math.max(shown.length, 1))).toFixed(3); k++;
      out += esc(t.slice(pos, h.start)) + '<mark data-at="' + at + '">' + esc(t.slice(h.start, h.end)) + "</mark>"; pos = h.end;
    }
    out += esc(cut(t.slice(pos), Math.max(40, lim - pos)));
    const flags = (r.red_flags || []).filter(f => f.flag !== "suspicious_wording" && f.flag.indexOf("sender_") !== 0);
    const chips = flags.slice(0, 5).map((f, i) => '<div class="j-chip" data-at="' + (0.2 + 0.12 * i).toFixed(2) + '"><span>' + ico((root.CG_SIGN || {})[f.flag] || "alert") + "</span>" + esc(f.label) + "</div>").join("") +
      (flags.length > 5 ? '<div class="j-chip more" data-at="0.82">+ ' + (flags.length - 5) + " more</div>" : "");
    return {
      key: "signs", name: "Spot the signs", title: "Spot the warning signs", hold: 5600,
      line: flags.length ? flags.length + " warning sign" + (flags.length === 1 ? "" : "s") + " found in the words." : "No warning signs in the words.",
      html: '<div class="j-signs"><div class="j-paper" data-at="0.03">' + out + '</div><div class="j-chips">' + (chips || '<div class="j-chip ok" data-at="0.4"><span>' + ico("check") + "</span>Nothing flagged</div>") + "</div></div>",
    };
  }

  function linkParts(u) {
    const raw = u.url, host = (u.parts.host || ""), reg = u.parts.registered_domain || "";
    const i = raw.toLowerCase().indexOf(host);
    if (!host || i < 0) return '<b class="own">' + esc(raw) + "</b>";
    const hostRaw = raw.slice(i, i + host.length), j = hostRaw.toLowerCase().lastIndexOf(reg);
    return '<i>' + esc(raw.slice(0, i) + (j > 0 ? hostRaw.slice(0, j) : "")) + '</i><b class="own">' + esc(j >= 0 ? hostRaw.slice(j) : hostRaw) + "</b><i>" + esc(cut(raw.slice(i + host.length), 60)) + "</i>";
  }
  function stLinks(d) {
    const urls = d.r.input_type === "url" ? [d.r.trace.url_report] : (d.r.trace.url_reports || []);
    const u = urls.slice().sort((a, b) => b.risk_score - a.risk_score)[0];
    const good = /Official|trusted/;
    const rs = (u.reasons || []).slice(0, 4);
    return {
      key: "links", name: "Check the links", title: urls.length > 1 ? "Check the links (" + urls.length + ")" : "Check the link", hold: 5000,
      line: "Read as text and never opened. The highlighted part is who really owns it.",
      html: '<div class="j-link"><div class="j-url" data-at="0.05">' + linkParts(u) + '</div><div class="j-owner" data-at="0.3">' + ico("user") + "Real owner: <b>" + esc(u.domain || "unknown") + "</b></div>" +
        '<div class="j-checks">' + (rs.length ? rs.map((x, i) => '<div class="j-check ' + (good.test(x) ? "ok" : "bad") + '" data-at="' + (0.42 + i * 0.1).toFixed(2) + '">' + ico(good.test(x) ? "check" : "alert") + esc(x) + "</div>").join("")
          : '<div class="j-check ok" data-at="0.45">' + ico("check") + "Nothing unusual in its structure</div>") + "</div>" +
        '<div class="j-meter" data-at="0.8"><div class="j-meter-t"><i style="--w:' + pct(u.risk_score) + '%" class="' + (u.risk_score >= 0.8 ? "hi" : u.risky ? "mid" : "lo") + '"></i></div><b>' + pct(u.risk_score) + "% risky</b></div></div>",
    };
  }

  function stWeigh(d) {
    const tr = d.r.trace, isUrl = d.r.input_type === "url";
    let base, items, endZ;
    if (isUrl) {
      const rep = tr.url_report, UM = root.CG_MODEL.url_model;
      items = rep._contrib.filter(x => Math.abs(x.contribution) > 0.03).map(x => ({ label: x.label, c: x.contribution }));
      const sum = items.reduce((a, x) => a + x.c, 0), all = rep._contrib.reduce((a, x) => a + x.contribution, 0);
      endZ = Math.log(clamp(rep.risk_score, 1e-4, 1 - 1e-4) / (1 - clamp(rep.risk_score, 1e-4, 1 - 1e-4)));
      base = endZ - all; void sum; void UM;
    } else {
      items = tr.term_contrib.map(x => ({ label: "“" + x.term + "”", c: x.contribution })).concat(tr.eng_contrib.map(e => ({ label: e.label, c: e.contribution }))).filter(x => Math.abs(x.c) > 0.02);
      base = tr.intercept; endZ = tr.z;
    }
    items.sort((a, b) => Math.abs(b.c) - Math.abs(a.c));
    items = items.slice(0, 6);
    const rest = endZ - base - items.reduce((a, x) => a + x.c, 0);
    const mx = Math.max(0.01, ...items.map(x => Math.abs(x.c)));
    const at = i => 0.14 + 0.1 * i;
    const rows = items.map((x, i) => '<div class="j-push ' + (x.c > 0 ? "up" : "down") + '" data-at="' + at(i).toFixed(2) + '"><span>' + esc(cut(x.label, 34)) + '</span><div><i style="--w:' + (Math.abs(x.c) / mx * 100).toFixed(1) + '%"></i></div><b>' + (x.c > 0 ? "▲" : "▼") + "</b></div>").join("");
    return {
      key: "weigh", name: "Weigh it", title: "Weigh the evidence", hold: 6200,
      line: "Every piece of evidence pushes the score toward scam or toward safe.",
      html: '<div class="j-weigh"><div class="j-scale" data-at="0.03"><div class="j-scale-t"></div><div class="j-knob" id="j-knob"></div><span class="l">safe</span><span class="r">scam</span></div>' +
        '<div class="j-score" id="j-wnum" data-at="0.03">0%</div><div class="j-pushes">' + rows + "</div></div>",
      update(el, p) {
        let z = base;
        items.forEach((x, i) => { z += x.c * out3(clamp((p - at(i)) / 0.09, 0, 1)); });
        z += rest * out3(clamp((p - at(items.length)) / 0.1, 0, 1));
        const v = sig(z);
        el.querySelector("#j-knob").style.left = (v * 100).toFixed(2) + "%";
        const n = el.querySelector("#j-wnum"); n.textContent = pct(v) + "%";
        n.dataset.z = v >= d.M.high_threshold ? "hi" : v >= d.M.threshold ? "mid" : "lo";
      },
    };
  }

  function dial(v, M) {
    const a = x => Math.PI * (1 - x), pt = (x, r) => [100 + r * Math.cos(a(x)), 100 - r * Math.sin(a(x))];
    const arc = (v0, v1, c) => { const [x0, y0] = pt(v0, 82), [x1, y1] = pt(v1, 82); return '<path d="M' + x0.toFixed(1) + " " + y0.toFixed(1) + " A82 82 0 0 1 " + x1.toFixed(1) + " " + y1.toFixed(1) + '" stroke="' + c + '" stroke-width="14" fill="none"/>'; };
    return '<svg class="j-dial" viewBox="0 0 200 110" aria-hidden="true">' + arc(0, M.threshold, "var(--ok)") + arc(M.threshold, M.high_threshold, "var(--warn)") + arc(M.high_threshold, 1, "var(--danger)") +
      '<g id="j-needle" style="transform-origin:100px 100px;transform:rotate(' + (-90 + v * 180) + 'deg)"><line x1="100" y1="100" x2="100" y2="34" stroke="var(--ink)" stroke-width="4" stroke-linecap="round"/></g><circle cx="100" cy="100" r="8" fill="var(--ink)"/></svg>';
  }
  function stVerdict(d) {
    const r = d.r, sc = r.sender_check, isUrl = r.input_type === "url";
    const content = isUrl ? r.risk_score : (r.content_score != null ? r.content_score : r.risk_score), fin = r.risk_score;
    const head = { high: isUrl ? "Don't open this link" : "Don't click, reply or pay", medium: "Be careful with this one", low: isUrl ? "This link looks fine" : "This looks fine" }[r.risk_level];
    let snd = "";
    if (!isUrl) {
      if (sc && sc.provided && sc.address) {
        const moved = sc.effect === "raise" || sc.effect === "lower";
        const hit = sc.checks.filter(c => c.hit && c.id !== "official")[0], off = sc.checks.filter(c => c.id === "official" && c.hit)[0];
        snd = '<div class="j-snd" data-at="0.08"><small>' + ico("user") + 'Sender</small><div class="j-addr ' + (hit ? "bad" : off ? "ok" : "") + '">' + esc(sc.domain) + "</div><p>" + esc(hit ? hit.detail : off ? off.detail : "Nothing unusual about the address.") + "</p>" +
          '<div class="j-move" data-at="0.3"><b>' + pct(content) + "%</b>" + ico("arrow") + "<b>" + pct(fin) + "%</b><span>" + (moved ? (pct(content) === pct(fin) ? "already at the top, so no room to move" : "the sender can only nudge the score") : "no change") + "</span></div></div>";
      } else snd = '<div class="j-snd" data-at="0.08"><small>' + ico("user") + 'Sender</small><p>No sender given, so the message decides on its own.</p></div>';
    }
    const t0 = 0.42, t1 = 0.8;
    return {
      key: "verdict", name: isUrl ? "Verdict" : "Sender and verdict", title: isUrl ? "The verdict" : "Check the sender, then decide", hold: 6000,
      line: isUrl ? "Dangerous structure can only raise the score." : "The message leads. The sender can only nudge it.",
      html: '<div class="j-verdict">' + snd + '<div class="j-final" data-at="0.36">' + dial(0, d.M) + '<div class="j-score" id="j-vnum">0%</div><h4 data-at="0.84">' + head + "</h4></div></div>",
      update(el, p) {
        const k = out3(clamp((p - t0) / (t1 - t0), 0, 1));
        const start = isUrl ? 0 : content;
        const v = p < t0 ? (isUrl ? 0 : content * out3(clamp((p - 0.36) / 0.06, 0, 1))) : start + (fin - start) * k;
        el.querySelector("#j-needle").style.transform = "rotate(" + (-90 + v * 180) + "deg)";
        const n = el.querySelector("#j-vnum"); n.textContent = pct(v) + "%";
        n.dataset.z = v >= d.M.high_threshold ? "hi" : v >= d.M.threshold ? "mid" : "lo";
      },
    };
  }

  function buildStations(d) {
    if (d.r.input_type === "url") return [stRead(d), stLinks(d), stWeigh(d), stVerdict(d)];
    const s = [stRead(d), stSeparate(d), stClean(d), stSigns(d)];
    if ((d.r.trace.url_reports || []).length) s.push(stLinks(d));
    s.push(stWeigh(d), stVerdict(d));
    return s;
  }

  // ------------------------------------------------------------------ timeline
  function buildTimeline(n, motion) {
    const k = motion ? 1 : 0, segs = [];
    let t = 0;
    const add = (type, i, dur) => { segs.push({ type, i, t0: t, dur }); t += dur; };
    add("intro", 0, T.intro * k);
    for (let i = 0; i < n; i++) {
      add("travel", i, T.travel * k);
      add("in", i, T.zin * k);
      add("hold", i, J.stations[i].hold);
      add("out", i, T.zout * k);
    }
    add("end", n - 1, 1200 * k + 1);
    return { segs, total: t };
  }
  function segAt(t) {
    const s = J.tl.segs;
    for (let i = s.length - 1; i >= 0; i--) if (t >= s[i].t0) return s[i];
    return s[0];
  }
  function stationStart(i) { return J.tl.segs.find(s => s.type === "travel" && s.i === i).t0; }

  // ------------------------------------------------------------------ layout + camera
  function layout() {
    const view = J.root.querySelector(".j-view");
    const vw = view.clientWidth, vh = view.clientHeight, n = J.stations.length;
    J.pw = Math.min(980, vw - 32); J.ph = Math.max(260, Math.min(640, vh - 20));
    J.gap = Math.max(J.pw + 260, vw * 0.95);
    J.span = (n - 1) * J.gap;
    J.s0 = (vw - Math.max(72, vw * 0.14)) / Math.max(J.span, 1);
    J.vw = vw; J.vh = vh; J.cy = vh / 2;
    J.showNames = J.gap * J.s0 >= 118;
    const inv = 1 / J.s0;
    J.world.style.setProperty("--inv", inv.toFixed(4));
    J.world.style.setProperty("--pw", J.pw + "px"); J.world.style.setProperty("--ph", J.ph + "px");
    J.world.classList.toggle("no-names", !J.showNames);
    J.world.querySelector(".j-line").style.width = J.span + "px";
    J.stEls.forEach((el, i) => { el.style.left = (i * J.gap) + "px"; });
    J.dotEls.forEach((el, i) => { el.style.left = (i * J.gap) + "px"; });
  }
  function camera(x, f) {            // f: 0 = overview, 1 = at the station
    const s = J.s0 * Math.pow(1 / J.s0, f);
    const cx = (J.span / 2) + (x - J.span / 2) * f;
    J.world.style.transform = "translate(" + (J.vw / 2 - cx * s).toFixed(2) + "px," + J.cy.toFixed(2) + "px) scale(" + s.toFixed(5) + ")";
    J.world.style.setProperty("--f", f.toFixed(3));
  }

  function draw() {
    const t = clamp(J.t, 0, J.tl.total), sg = segAt(t), k = sg.dur > 0 ? clamp((t - sg.t0) / sg.dur, 0, 1) : 1;
    const i = sg.i, x = i * J.gap;
    let f = 0, marker = x, active = -1, p = 0;
    if (sg.type === "travel") { const from = i === 0 ? x : (i - 1) * J.gap; marker = from + (x - from) * ease(k); }
    else if (sg.type === "in") { f = ease(k); active = i; }
    else if (sg.type === "hold") { f = 1; active = i; p = k; }
    else if (sg.type === "out") { f = 1 - ease(k); active = i; p = 1; }
    camera(x, f);
    J.marker.style.left = marker + "px";
    const doneUpTo = sg.type === "out" || sg.type === "end" ? i : i - 1;
    J.fill.style.width = (sg.type === "travel" ? marker : sg.type === "intro" ? 0 : x) + "px";
    J.dotEls.forEach((el, j) => { el.classList.toggle("done", j <= doneUpTo); el.classList.toggle("now", j === i && sg.type !== "intro" && sg.type !== "end"); });
    J.railEls.forEach((el, j) => { el.classList.toggle("done", j <= doneUpTo); el.classList.toggle("now", j === i && sg.type !== "intro"); });
    J.stEls.forEach((el, j) => {
      const on = j === active;
      el.classList.toggle("live", on);
      if (on) {
        el.querySelectorAll("[data-at]").forEach(e => e.classList.toggle("on", p >= Number(e.dataset.at)));
        if (J.stations[j].update) J.stations[j].update(el, p);
      }
    });
    $("#j-where").textContent = sg.type === "intro" ? "The route" : sg.type === "end" ? "Done" : (i + 1) + " of " + J.stations.length + " · " + J.stations[i].name;
    $("#j-bar").style.width = (t / J.tl.total * 100).toFixed(2) + "%";
    if (t >= J.tl.total && J.playing) setPlaying(false);
  }

  function tick(now) {
    if (!J) return;
    if (J.playing) { J.t = Math.min(J.tl.total, J.t + (now - J.last) * J.speed); }
    J.last = now;
    draw();
    J.raf = requestAnimationFrame(tick);
  }
  function setPlaying(on) {
    if (on && J.t >= J.tl.total) J.t = 0;
    J.playing = on;
    const b = $("#j-play"); b.innerHTML = on ? ico("pause") + "<span>Pause</span>" : ico("play") + "<span>" + (J.t >= J.tl.total ? "Replay" : "Play") + "</span>";
  }
  function current() { return segAt(clamp(J.t, 0, J.tl.total)).i; }
  function go(i) {
    i = clamp(i, 0, J.stations.length - 1);
    // jump to the moment the camera starts zooming into that station
    J.t = J.tl.segs.find(s => s.type === "in" && s.i === i).t0;
    if (!J.motion) J.t = J.tl.segs.find(s => s.type === "hold" && s.i === i).t0;
  }
  function next() { const sg = segAt(J.t); if (sg.type === "end" || (sg.i === J.stations.length - 1 && sg.type === "out")) return; go(sg.type === "intro" || sg.type === "travel" ? sg.i : sg.i + 1); }
  function back() { const sg = segAt(J.t); const early = sg.type === "intro" || sg.type === "travel" || sg.type === "in" || (sg.type === "hold" && J.t - sg.t0 < 900); go(early ? sg.i - 1 : sg.i); }

  function key(e) {
    if (!J) return;
    if (e.key === "Escape") close();
    else if (e.key === "ArrowRight") { e.preventDefault(); next(); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); back(); }
    else if (e.key === " " && e.target.tagName !== "SELECT") { e.preventDefault(); setPlaying(!J.playing); }
    else if (e.key === "Tab") {       // keep focus inside the overlay
      const f = [...J.root.querySelectorAll("button, select")].filter(x => !x.disabled && x.offsetParent !== null);
      if (!f.length) return;
      const a = document.activeElement, first = f[0], last = f[f.length - 1];
      if (e.shiftKey && a === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && a === last) { e.preventDefault(); first.focus(); }
    }
  }

  function close() {
    if (!J) return;
    cancelAnimationFrame(J.raf);
    document.removeEventListener("keydown", key); window.removeEventListener("resize", J.onResize);
    J.root.remove(); document.body.style.overflow = J.prevOverflow;
    const o = J.opener; J = null; if (o && o.focus) o.focus();
  }

  function open(d) {
    if (J) close();
    d.M = root.CG_MODEL.message_model;
    J = { t: 0, playing: true, speed: 1, motion: d.motion !== false, opener: document.activeElement, prevOverflow: document.body.style.overflow };
    J.stations = buildStations(d);
    const n = J.stations.length;
    const el = document.createElement("div");
    el.className = "jr"; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("aria-label", "How CampusGuard decided");
    el.innerHTML =
      '<div class="j-top"><b>How it decided</b><span id="j-where"></span><button type="button" class="j-x" id="j-close" aria-label="Close">' + ico("x") + "</button></div>" +
      '<div class="j-view"><div class="j-world" id="j-world"><div class="j-line"><i id="j-fill"></i></div><div class="j-marker" id="j-marker"></div>' +
      J.stations.map((s, i) => '<button type="button" class="j-dot" data-i="' + i + '" aria-label="Go to step ' + (i + 1) + ": " + esc(s.name) + '"><span class="n">' + (i + 1) + '</span><span class="c">' + ico("check") + '</span><em>' + esc(s.name) + "</em></button>").join("") +
      J.stations.map((s, i) => '<section class="j-st" data-key="' + s.key + '"><div class="j-card"><div class="j-eyebrow">Step ' + (i + 1) + " of " + n + "</div><h3>" + esc(s.title) + '</h3><p class="j-cap">' + esc(s.line) + '</p><div class="j-body">' + s.html + "</div></div></section>").join("") +
      "</div></div>" +
      '<div class="j-hud"><div class="j-rail">' + J.stations.map((s, i) => '<button type="button" data-i="' + i + '" title="' + esc(s.name) + '" aria-label="Go to step ' + (i + 1) + ": " + esc(s.name) + '"></button>').join("") + '</div>' +
      '<div class="j-prog"><i id="j-bar"></i></div><div class="j-ctl"><button type="button" class="j-btn" id="j-back">' + ico("back") + '<span>Back</span></button>' +
      '<button type="button" class="j-btn main" id="j-play"></button><button type="button" class="j-btn" id="j-next"><span>Next</span>' + ico("arrow") + "</button>" +
      '<label class="j-speed">Speed <select id="j-speed" aria-label="Speed"><option value="0.6">Slow</option><option value="1" selected>Normal</option><option value="1.7">Fast</option></select></label>' +
      '<span class="j-keys">← → step · Space play/pause · Esc close</span></div></div>';
    document.body.appendChild(el);
    document.body.style.overflow = "hidden";
    J.root = el; J.world = $("#j-world", el); J.marker = $("#j-marker", el); J.fill = $("#j-fill", el);
    J.stEls = [...el.querySelectorAll(".j-st")]; J.dotEls = [...el.querySelectorAll(".j-dot")]; J.railEls = [...el.querySelectorAll(".j-rail button")];
    J.tl = buildTimeline(n, J.motion);
    if (!J.motion) J.t = J.tl.segs.find(s => s.type === "hold" && s.i === 0).t0;
    layout();
    J.onResize = () => { if (J) { layout(); draw(); } };
    window.addEventListener("resize", J.onResize);
    document.addEventListener("keydown", key);
    $("#j-close", el).addEventListener("click", close);
    $("#j-play", el).addEventListener("click", () => setPlaying(!J.playing));
    $("#j-next", el).addEventListener("click", next);
    $("#j-back", el).addEventListener("click", back);
    $("#j-speed", el).addEventListener("change", e => { J.speed = Number(e.target.value) || 1; });
    const jump = e => { const b = e.target.closest("[data-i]"); if (b) go(Number(b.dataset.i)); };
    $(".j-rail", el).addEventListener("click", jump);
    J.world.addEventListener("click", e => { if (e.target.closest(".j-dot")) jump(e); });
    setPlaying(true);
    J.last = performance.now();
    draw();
    J.raf = requestAnimationFrame(tick);
    $("#j-play", el).focus();
  }

  // jump to a station at a given progress (0..1) and pause: used for testing and for presenting a still frame
  function seek(i, p) { if (!J) return; const h = J.tl.segs.find(s => s.type === "hold" && s.i === i); J.t = h.t0 + h.dur * clamp(p, 0, 1); setPlaying(false); draw(); }
  root.CampusGuardJourney = { open, close, seek, _state: () => J && { t: J.t, total: J.tl.total, playing: J.playing, seg: segAt(J.t).type, i: segAt(J.t).i, n: J.stations.length, f: J.world.style.getPropertyValue("--f") } };
})(typeof self !== "undefined" ? self : globalThis);
