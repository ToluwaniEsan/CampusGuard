// node tests/intake_test.js : sender / body separation on the layouts people actually paste
const { parse } = require("../web/js/campusguard-intake.js");
const cases = [
  ["Outlook headers", "From: AAMU Financial Aid <financialaid@aamu-support.com>\nSent: Thursday, October 1, 2026 10:26 AM\nTo: Esan, Toluwani\nSubject: URGENT: Verify Your Financial Aid\n\nDear Student,\nYour aid is on hold. Verify at http://aamu-support.com/verify", { kind: "email", sender: "AAMU Financial Aid <financialaid@aamu-support.com>", subject: "URGENT: Verify Your Financial Aid", bodyHas: "Dear Student", bodyLacks: "Sent:" }],
  ["Gmail copy", "URGENT: Verify Your Financial Aid Information\nInbox\n\nAlabama A&M University Financial Aid <financialaid@aamu-support.com>\n10:26 AM (2 hours ago)\nto me\n\nDear Student,\nYour financial aid account requires immediate verification.", { kind: "email", sender: "Alabama A&M University Financial Aid <financialaid@aamu-support.com>", bodyHas: "URGENT: Verify", bodyLacks: "to me" }],
  ["Name line then bare address", "Bruce Davis\nbrucedavis.jobs@gmail.com\n\nDear Students and Staff,\nWe have a great opportunity. Send your resume to my alternative email bruce.d.office@gmail.com.", { kind: "email", sender: "Bruce Davis <brucedavis.jobs@gmail.com>", bodyHas: "alternative email bruce.d.office@gmail.com" }],
  ["Address only in header", "From: helpdesk@aamu.edu\nSubject: Password\n\nReply with your username and password.", { kind: "email", sender: "helpdesk@aamu.edu", subject: "Password" }],
  ["Plain text message", "Hi! I accidentally sent you $300 on Zelle. Could you please send it back to me today?", { kind: "message", sender: "" }],
  ["Address inside the body is not a sender", "Hello,\nWe have a job for you. It pays well and the hours are flexible, so reply soon.\nKindly contact our recruiter Mr. James <james.hr@gmail.com> for more details about the position and salary.", { sender: "" }],
  ["Bare link", "http://aamu-edu.support/reset?user=student", { kind: "link" }],
  ["Link without scheme", "bit.ly/3xYz", { kind: "link" }],
  ["Email address alone is not a link", "x@aamu.edu", { kindNot: "link" }],
  ["Screenshot OCR style", "CampusGuard test\nAlabama A&M University Financial Aid <financialaid@aamu-support.com>   10:26 AM\nto me v\nDear Student,\nYour financial aid account requires immediate verification.", { kind: "email", sender: "Alabama A&M University Financial Aid <financialaid@aamu-support.com>", bodyHas: "Dear Student" }],
  ["Forwarded", "---------- Forwarded message ---------\nFrom: IT Help Desk <helpdesk@aamu.edu.mail-secure.xyz>\nDate: Wed, Sep 30, 2026 at 9:12 AM\nSubject: Password Expiration Notice\nTo: <student@aamu.edu>\n\nDear User, your password will expire today.", { kind: "email", sender: "IT Help Desk <helpdesk@aamu.edu.mail-secure.xyz>", subject: "Password Expiration Notice", bodyLacks: "Date:" }],
  ["From with name only", "From: Dr. Karen Mitchell\nSubject: Job Opportunity\n\nGood day, I need a student assistant.", { kind: "email", sender: "Dr. Karen Mitchell" }],
  ["Title with a period (Dr.)", "Part-Time Job Offer\n\nDr. Karen Mitchell <karen.mitchell.lab@gmail.com> 9:14 AM\nto me\n\nGood day,\nI am looking for a student.", { kind: "email", sender: "Dr. Karen Mitchell <karen.mitchell.lab@gmail.com>", bodyHas: "Part-Time Job Offer", bodyLacks: "to me" }],
  ["Multi-paragraph chat", "hey are we still studying tonight?\nlibrary at 7?", { kind: "message", sender: "" }],
];
let fail = 0;
for (const [name, input, want] of cases) {
  const r = parse(input), errs = [];
  if (want.kind && r.kind !== want.kind) errs.push("kind=" + r.kind);
  if (want.kindNot && r.kind === want.kindNot) errs.push("kind=" + r.kind);
  if (want.sender !== undefined && r.sender !== want.sender) errs.push("sender=" + JSON.stringify(r.sender));
  if (want.subject !== undefined && r.subject !== want.subject) errs.push("subject=" + JSON.stringify(r.subject));
  if (want.bodyHas && r.body.indexOf(want.bodyHas) === -1) errs.push("body missing " + want.bodyHas);
  if (want.bodyLacks && r.body.indexOf(want.bodyLacks) !== -1) errs.push("body still has " + want.bodyLacks);
  console.log((errs.length ? "FAIL " : "PASS ") + name + (errs.length ? "  -> " + errs.join("; ") + "\n   body: " + JSON.stringify(r.body.slice(0, 160)) : ""));
  fail += errs.length ? 1 : 0;
}
console.log(cases.length - fail + "/" + cases.length + " intake cases pass");
process.exit(fail ? 1 : 0);
