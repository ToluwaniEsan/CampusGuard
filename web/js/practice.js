/* CampusGuard "Spot the scam" practice, on the main page (v2.3, improvement 8).
   Decide first, then see what CampusGuard found and why. Runs on the device like everything else. */
(function () {
  "use strict";
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const ico = n => '<svg class="ico" aria-hidden="true"><use href="#h-' + n + '"/></svg>';

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
    { sender: "Dr. Daniel Wims <president.office.aamu@gmail.com>", text: "Hello, are you available? I need a quick favor handled discreetly. I'm in a meeting and can't talk right now. Please pick up four $100 Apple gift cards for some students and send me pictures of the codes.", scam: true,
      tip: "\"The president\" on Gmail, can't talk, wants gift cards and the codes. No real official ever asks for this." },
    { sender: "", text: "Bible study moves to the fellowship hall this Wednesday at 7pm. Bring a friend! Choir rehearsal is Saturday at 10am as usual.", scam: false,
      tip: "No links, no money, no pressure. Just plans." },
    { sender: "", text: "USPS: Your package is on hold due to an incomplete address. Update your details within 12 hours to avoid return: https://usps-redelivery-help.top/track", scam: true,
      tip: "USPS doesn't text links on .top domains. Fake delivery texts are one of the most common scams." },
    { sender: "Handshake <jobs@notifications.joinhandshake.com>", text: "New jobs that match your profile: Software Engineering Intern at Adtran (Huntsville, AL); IT Support Student Assistant at Alabama A&M University. View and apply on Handshake.", scam: false,
      tip: "A job alert you signed up for, from the real Handshake domain, sending you to apply on the real site." },
    { sender: "", text: "Tu cuenta de correo AAMU será desactivada hoy. Responde con tu usuario y contraseña para mantenerla activa.", scam: true,
      tip: "Same trick in Spanish: a threat to close your account, then a request for your password." },
    { sender: "", text: "Jordan paid you $14.50. Note: tacos 🌮. The money is in your Venmo balance.", scam: false,
      tip: "A payment notice that asks you for nothing. Money arriving is not a warning sign on its own." },
  ];

  const Q = { order: [], i: 0, right: 0, done: 0, answered: false, opener: null };

  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  function score() { $("#pscore").textContent = Q.done ? Q.right + " of " + Q.done + " right" : ""; }
  function show() {
    const q = QUIZ[Q.order[Q.i]];
    Q.answered = false;
    $("#practice-body").innerHTML = '<div class="pcount">Message ' + (Q.i + 1) + " of " + QUIZ.length + "</div>" +
      '<div class="pmsg"><div class="from">' + (q.sender ? "From: " + esc(q.sender) : "Text message") + '</div><div class="body">' + esc(q.text) + "</div></div>" +
      '<div class="guess"><button type="button" class="g-scam" id="g-scam">' + ico("alert") + 'Scam</button><button type="button" class="g-legit" id="g-legit">' + ico("check") + "Legit</button></div>" +
      '<div id="q-reveal" aria-live="polite"></div>';
    $("#g-scam").addEventListener("click", () => answer(true));
    $("#g-legit").addEventListener("click", () => answer(false));
    score();
  }
  function answer(saysScam) {
    if (Q.answered) return;
    Q.answered = true;
    const q = QUIZ[Q.order[Q.i]], ok = saysScam === q.scam;
    Q.done++; if (ok) Q.right++;
    const engine = window.CG_ENGINE;
    const r = engine ? engine.analyze(q.text, q.sender) : null;
    const top = r ? (r.red_flags || []).filter(f => f.flag !== "suspicious_wording").slice(0, 3).map(f => "<li>" + esc(f.label) + "</li>").join("") : "";
    const last = Q.i + 1 >= QUIZ.length;
    $("#q-reveal").innerHTML = '<div class="reveal ' + (ok ? "right" : "wrong") + '"><h3>' + ico(ok ? "check" : "x") + (ok ? "Right. " : "Not quite. ") + "It's " + (q.scam ? "a scam" : "legit") + ".</h3>" +
      "<p>" + esc(q.tip) + "</p>" +
      (r ? "<p>CampusGuard says <b>" + esc(r.verdict) + "</b>" + (top ? ":</p><ul>" + top + "</ul>" : ".</p>") : "") +
      '<div class="row"><button type="button" class="btn" id="q-next">' + (last ? "Play again" : "Next message") + '</button><button type="button" class="btn ghost" id="q-open">Check it in CampusGuard</button></div></div>';
    score();
    $("#q-next").addEventListener("click", () => { if (last) start(); else { Q.i++; show(); } $("#g-scam").focus(); });
    $("#q-open").addEventListener("click", () => {
      close();
      const t = document.getElementById("content");
      t.value = (q.sender ? "From: " + q.sender + "\n\n" : "") + q.text;
      t.dispatchEvent(new Event("input"));
      document.getElementById("go").click();
    });
    $("#q-next").focus();
  }
  function start() { Q.order = shuffle(QUIZ.map((_, i) => i)); Q.i = 0; Q.right = 0; Q.done = 0; show(); }
  function open() {
    Q.opener = document.activeElement;
    $("#practice").hidden = false; document.body.style.overflow = "hidden";
    start(); $("#g-scam").focus();
  }
  function close() {
    $("#practice").hidden = true; document.body.style.overflow = "";
    if (Q.opener && Q.opener.focus) Q.opener.focus();
  }
  function boot() {
    const b = $("#practice-open"); if (!b) return;
    b.addEventListener("click", open);
    $("#practice-close").addEventListener("click", close);
    $("#practice").addEventListener("click", e => { if (e.target.id === "practice") close(); });
    document.addEventListener("keydown", e => {
      if ($("#practice").hidden) return;
      if (e.key === "Escape") { e.preventDefault(); close(); }
      if (e.key === "Tab") {      // keep focus inside the dialog
        const f = [...$("#practice").querySelectorAll("button")].filter(x => x.offsetParent !== null);
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
