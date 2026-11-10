/* CampusGuard v3: webmail sites CampusGuard recognises by name.
   On these the toolbar icon lights up, and the drop-down offers to check emails there.
   Any other site can still be checked: click the icon and CampusGuard looks for an open email. */
(function (root) {
  "use strict";
  const KNOWN_MAIL = [
    { host: "mail.google.com", name: "Gmail", report: "Open the email's ⋮ menu (top right of the message) and choose Report phishing, then delete it." },
    { host: "outlook.live.com", name: "Outlook", report: "Choose Report → Report phishing in the Outlook toolbar, then delete it." },
    { host: "outlook.office.com", name: "Outlook", report: "Choose Report → Report phishing in the Outlook toolbar, then delete it." },
    { host: "outlook.office365.com", name: "Outlook", report: "Choose Report → Report phishing in the Outlook toolbar, then delete it." },
    { host: "outlook.cloud.microsoft", name: "Outlook", report: "Choose Report → Report phishing in the Outlook toolbar, then delete it." },
    { host: "www.icloud.com", name: "iCloud Mail", path: "/mail" },
    { host: "mail.yahoo.com", name: "Yahoo Mail" },
    { host: "mail.aol.com", name: "AOL Mail" },
    { host: "mail.proton.me", name: "Proton Mail" },
    { host: "mail.zoho.com", name: "Zoho Mail" },
    { host: "app.fastmail.com", name: "Fastmail" },
    { host: "app.tuta.com", name: "Tuta Mail" },
  ];
  const GENERIC_REPORT = "Use your mail app's Report phishing (or Report spam) option, then delete it.";
  const AFTER_CLICK = " Clicked a link or typed your password? Change it now and contact the IT help desk.";

  function parse(url) { try { const u = new URL(url); return /^https?:$/.test(u.protocol) ? u : null; } catch (e) { return null; } }
  function known(url) {
    const u = parse(url); if (!u) return null;
    const k = KNOWN_MAIL.find(s => s.host === u.hostname);
    if (!k) return null;
    if (k.path && !u.pathname.startsWith(k.path)) return null;
    return k;
  }
  function originOf(url) { const u = parse(url); return u ? u.origin : null; }
  function pattern(origin) { return origin + "/*"; }
  function reportTip(url) { const k = known(url); return ((k && k.report) || GENERIC_REPORT) + AFTER_CLICK; }
  function siteName(url) { const k = known(url); const u = parse(url); return k ? k.name : (u ? u.hostname : "this site"); }

  root.CGSites = { KNOWN_MAIL, known, originOf, pattern, reportTip, siteName, parse };
})(typeof self !== "undefined" ? self : globalThis);
