"""Synthetic campus-style training messages (deck Next Step 3: 'Add campus-specific
phishing training examples').

Phishing and legitimate messages are generated from the SAME topics (financial aid,
IT accounts, jobs, scholarships, tuition, LMS, payroll, packages) so the model cannot
learn "mentions financial aid => phishing". It has to learn the red flags themselves:
pressure, credential requests, lookalike links, personal mailboxes, money bait.

These are randomised templates. The evaluation sets (data/campus_eval/*.jsonl and
tests/realistic_battery.jsonl) were written separately by hand and are never generated
here, so they stay an independent check.
"""
from __future__ import annotations

import json
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

FIRST = ["Jordan", "Aaliyah", "Marcus", "Chidi", "Tiana", "Kofi", "Destiny", "Malik", "Imani", "Ethan",
         "Grace", "Toluwani", "Amara", "Brandon", "Jasmine", "Darius", "Nia", "Samuel", "Kayla", "Andre"]
LAST = ["Williams", "Johnson", "Okafor", "Brown", "Davis", "Adeyemi", "Harris", "Lee", "Mensah", "Thomas"]
OFFICES = {
    "finaid": ("Office of Student Financial Aid", "finaid"),
    "it": ("Information Technology Services", "its"),
    "registrar": ("Office of the Registrar", "registrar"),
    "bursar": ("Bursar's Office", "bursar"),
    "hr": ("Human Resources", "hr"),
    "career": ("Career Development Services", "careers"),
    "housing": ("Residence Life", "reslife"),
    "library": ("University Library", "library"),
    "honors": ("Honors College", "honors"),
    "mail": ("Campus Mail Services", "mailservices"),
}
CAMPUS = ["AAMU", "Alabama A&M University", "the University", "AAMU"]
OFFICIAL = "aamu.edu"
FAKE_DOMAINS = ["aamu-support.com", "aamu-edu.net", "aamu-portal.online", "aamu.edu.secure-login.xyz",
                "aamuedu-verify.com", "portal-aamu.info", "aamu-financialaid.org", "myaamu-account.top",
                "aamu.edu-auth.site", "aarnu.edu.co", "aamu-helpdesk.live", "student-aid-office.net",
                "webmail-aamu.club", "secure-campus-portal.com", "edu-verification.services",
                "185.212.44.10", "45.77.3.201", "bit.ly", "tinyurl.com", "canvas-instructure.support",
                "office365-mailbox.com", "micros0ft-login.net", "studentaid-gov.info", "docusign-review.org"]
REAL_LINK_HOSTS = ["aamu.edu", "www.aamu.edu", "studentaid.gov", "aamu.instructure.com",
                   "app.joinhandshake.com", "my.aamu.edu", "aamu.edu/library", "outlook.office.com"]
FREEMAIL = ["gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "aol.com"]
PATHS = ["login", "verify", "account/update", "secure/signin", "portal/auth", "validate", "sso/login",
         "owa/auth.php", "finaid/verify-login", "student/confirm", "billing/pay", "claim", "apply", "index.php"]
MONTHS = ["January", "February", "March", "April", "September", "October", "November", "December"]
DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]


def r(x):
    return random.choice(x)


def name():
    return f"{r(FIRST)} {r(LAST)}"


def date():
    return f"{r(MONTHS)} {random.randint(1, 28)}"


def fake_link():
    d = r(FAKE_DOMAINS)
    scheme = r(["http://", "https://", "", "http://"])
    if d in ("bit.ly", "tinyurl.com"):
        return f"{scheme}{d}/{''.join(random.choices('abcdefghijkmnpqrstuvwxyz23456789', k=7))}"
    return f"{scheme}{d}/{r(PATHS)}{r(['', '?id=' + str(random.randint(1000, 99999)), '.html'])}"


def real_link():
    h = r(REAL_LINK_HOSTS)
    return f"https://{h}{r(['', '/students', '/financial-aid', '/registration', '/its/help', '/events'])}"


# ------------------------------------------------------------------------- phishing
def phish():
    topic = r(["finaid", "it", "bursar", "hr", "career", "honors", "mail", "lms", "scholarship", "it", "finaid"])
    greet = r(["Dear Student,", "Dear User,", "Dear Students and Staff,", "Hello,", "Dear Account Holder,",
               "Dear Employee,", "Attention:", "Dear Valued Student,", "Hi,", ""])
    urgency = r(["within 24 hours", "immediately", "today", "before 5:00 PM today", "within 48 hours",
                 "as soon as possible", "without delay", "by end of day"])
    threat = r(["your account will be suspended", "your access will be permanently disabled",
                "your disbursement will be cancelled", "you will be dropped from your classes",
                "your mailbox will be deactivated", "your next paycheck will be withheld",
                "your enrollment will be placed on hold", "your scholarship will be forfeited"])
    link = fake_link()
    cta = r([f"Click here to verify: {link}", f"Verify your account now: {link}", f"Log in at {link}",
             f"CLICK HERE TO CONFIRM {link}", f"Use the secure link below to continue.\n{link}",
             f"Follow the link to restore access {link}", f"Sign in with your username and password at {link}"])
    sig_office = OFFICES.get(topic, OFFICES["it"])[0] if topic in OFFICES else r([o[0] for o in OFFICES.values()])
    sig = r([f"{sig_office}", f"{r(CAMPUS)} {sig_office}", f"{sig_office}\n{r(CAMPUS)}", "IT Help Desk",
             "Student Support Team", "Webmail Administrator", "Security Team"])
    if topic == "finaid":
        body = r([
            f"Your financial aid account requires immediate verification. Your refund of ${random.randint(800, 4800):,} has been placed on hold. {cta}. Failure to comply {urgency} means {threat}.",
            f"We were unable to process your {r(['Pell Grant', 'aid disbursement', 'student refund'])} because your banking information is incomplete. Reply {urgency} with your bank account and routing number or {threat}.",
            f"Financial aid delayed. Our records show missing verification documents. Upload a photo of your driver's license and provide your SSN {urgency}. {cta}",
        ])
    elif topic == "it":
        body = r([
            f"Your {r(CAMPUS)} email password will expire {urgency}. To keep your current password, {cta.lower()} and confirm your credentials, otherwise {threat}.",
            f"MAILBOX QUOTA EXCEEDED!!! You can no longer send or receive messages. Re-validate your mailbox {urgency}: {link}",
            f"We detected unusual sign-in activity on your account from an unknown device. {cta}. If you do not verify {urgency}, {threat}.",
            f"As part of our security upgrade all students and staff must reply with their username, password and verification code {urgency}. This request is confidential.",
            f"Your Microsoft 365 account has {random.randint(3, 19)} pending messages held by our server. Release them now: {link}",
        ])
    elif topic == "bursar":
        body = r([
            f"Final notice: your tuition balance of ${random.randint(300, 6000):,} is past due. Pay {urgency} at {link} with a debit card or {threat}.",
            f"Your student account shows an overpayment. To receive your refund, confirm your card number and CVV at {link} {urgency}.",
        ])
    elif topic == "hr":
        body = r([
            f"Action required: due to a payroll system upgrade, update your direct deposit details {urgency} or {threat}. Sign in with your {r(CAMPUS)} username and password at {link}.",
            f"Please review your updated salary adjustment document. Open the attached file and enter your login details to view it.",
            f"I need a quick favor. Are you available? I need you to purchase {random.randint(3, 8)} gift cards for a staff appreciation event. I will reimburse you today. Reply to my personal email.",
        ])
    elif topic == "career":
        pay = random.randint(300, 900)
        body = r([
            f"We have a great opportunity for students interested in becoming a Personal Assistant (Remote). Only {random.randint(5, 12)} hours per week. Flexible hours. Pay: ${pay} weekly. Send your resume to my alternative email {r(FIRST).lower()}.{r(LAST).lower()}{random.randint(1, 99)}@{r(FREEMAIL)}.",
            f"Part-time job offer: work from home as a research assistant, no experience needed, ${pay} per week. Text me on WhatsApp with your full name and phone number to get started.",
            f"You have been selected for a paid remote internship. I will send you a check to purchase equipment, then you send the balance back via Zelle. Kindly reply with your bank details.",
            f"Exciting part-time opportunity with flexible hours! Earn ${pay} a week. Interested students should reply with their personal email and cell number. Hiring is on a first come basis.",
        ])
    elif topic == "honors" or topic == "scholarship":
        body = r([
            f"Congratulations! You have been selected as a winner of the {random.randint(2026, 2027)} Excellence Scholarship worth ${random.randint(1, 10)},000. To claim your award, confirm your student ID, date of birth and social security number at {link} {urgency}.",
            f"You are eligible for a ${random.randint(500, 2500):,} student relief grant. This offer expires today. Pay the small processing fee with your credit card to receive your grant: {link}",
        ])
    elif topic == "mail":
        body = r([
            f"You have a package waiting at the campus mail center. Delivery failed due to an incomplete address. Pay the ${random.randint(1, 4)}.99 redelivery fee {urgency}: {link} or the package will be returned.",
            f"Your parcel could not be delivered. Confirm your address and payment details {urgency} at {link}.",
        ])
    else:  # lms
        body = r([
            f"Unusual sign-in activity on your Canvas account. Your access to courses will be restricted. Verify your identity now: {link}",
            f"Your Blackboard session expired and your grades are locked. {cta} {urgency} to avoid losing your coursework.",
        ])
    subject = r(["URGENT: Action Required", "Account Verification Required", "Final Notice", "Important Update",
                 "Financial Aid Delayed", "Password Expiration Notice", "Job Opportunity", "Congratulations!",
                 "Security Alert", "Re: Pending Request", "Payment Failed", "Your Account Will Be Suspended",
                 "Part-Time Position Available", "Delivery Notice"])
    sender_choice = random.random()
    if sender_choice < 0.4:
        sender = f"{sig.splitlines()[0]} <{r(['support', 'admin', 'helpdesk', 'noreply', 'office'])}@{r(FAKE_DOMAINS[:15])}>"
    elif sender_choice < 0.7:
        sender = f"{sig.splitlines()[0]} <{r(FIRST).lower()}.{r(['office', 'jobs', 'aid', 'admin'])}{random.randint(1, 99)}@{r(FREEMAIL)}>"
    else:
        sender = None
    text = f"{subject}\n{greet}\n{body}\n{r(['Thank you,', 'Regards,', 'Best Regards,', 'Sincerely,', ''])}\n{sig}"
    return {"text": text, "sender": sender, "label": 1, "topic": topic}


# ------------------------------------------------------------------------- legitimate
def legit():
    topic = r(["finaid", "it", "registrar", "bursar", "hr", "career", "housing", "library", "honors", "class",
               "club", "mail", "lms", "finaid", "it"])
    first = r(FIRST)
    greet = r([f"Hi {first},", f"Hello {first},", "Hello class,", "Hi everyone,", f"Dear {first} {r(LAST)},",
               "Good afternoon,", "Hey all,", f"{first},", "Greetings Bulldogs,"])
    when = f"{r(DAYS)}, {date()}"
    room = f"{r(['Patton Hall', 'Engineering Building', 'Student Union', 'Library', 'Carter Hall', 'Wilson Building'])} room {random.randint(100, 330)}"
    link = real_link()
    office = OFFICES.get(topic, (None, None))[0]
    if topic == "finaid":
        body = r([
            f"The {date().split()[0]} FAFSA is now open. We encourage students to complete it early at studentaid.gov. Our office is open Monday through Friday, 8am to 5pm, in {room}. We will never ask for your password or bank details by email.",
            f"Your financial aid award for the spring semester has been posted. You can review and accept it in your student portal. If you have questions, schedule an appointment with your financial aid counselor.",
            f"Reminder: verification documents for selected students are due {when}. Please submit them in person or through the secure student portal you normally use. Contact our office with any questions.",
            f"Refunds for the fall term will be disbursed starting {when}. Make sure your direct deposit information is current in the student portal. Do not reply to this message with personal information.",
        ])
    elif topic == "it":
        body = r([
            f"Campus Wi-Fi and Banner will be unavailable {when} from 11pm to 3am for scheduled maintenance. No action is needed on your part. ITS will never ask for your password by email.",
            f"As announced earlier this semester, all students must enroll in two-factor authentication by {date()}. Visit the ITS page on aamu.edu or stop by the help desk in {room} for assistance.",
            f"Reminder: phishing emails are circulating that pretend to be from the help desk. Do not click links asking you to verify your account. Report suspicious messages to ITS.",
            f"The new printing system goes live {when}. Your print balance will carry over automatically. Instructions are posted on the ITS website.",
        ])
    elif topic == "registrar":
        body = r([
            f"Registration for the next term opens {when} for seniors. Please meet with your academic advisor beforehand to have your advising hold removed. You can view your time ticket in Banner Self-Service.",
            f"Applications for May graduation are due {when}. Complete the form in the student portal and pay the graduation fee at the Bursar's Office.",
            f"Final grades will be available in the student portal after {when}. Transcripts can be requested online.",
        ])
    elif topic == "bursar":
        body = r([
            f"Tuition and fees for the spring term are due {when}. You can pay online through the student portal or in person at the Bursar's Office in {room}. Payment plans are available.",
            f"Your 1098-T tax form is now available in the student portal. Please consult a tax advisor with questions.",
        ])
    elif topic == "hr":
        body = r([
            f"Open enrollment for health and retirement benefits runs through {date()}. Information sessions will be held in {room}. Review your options in the employee portal or contact HR.",
            f"Payroll for the {r(['first', 'second'])} half of the month will be deposited on {when} as scheduled. Pay stubs are available in Employee Self-Service.",
            f"Annual compliance training is due {when}. The course is available in the training portal you normally use.",
        ])
    elif topic == "career":
        body = r([
            f"Join us at the Career and Internship Fair {when} from 10am to 2pm in the Student Union ballroom. Over {random.randint(30, 80)} employers will attend. Bring copies of your resume and register on Handshake.",
            f"Resume review sessions are available every {r(DAYS)} in {room}. Sign up through Handshake to reserve a slot.",
            f"On-campus student worker positions for next semester are posted on Handshake. Applications go through the official portal and are reviewed by the hiring department.",
        ])
    elif topic == "housing":
        body = r([
            f"There will be a scheduled fire drill in all residence halls {when} between 7 and 9pm. Please exit using the nearest stairwell. Thank you for your cooperation.",
            f"Room selection for next year begins {when}. Housing deposits can be paid through the housing portal.",
        ])
    elif topic == "library":
        body = r([
            f"This is a courtesy reminder that your borrowed items are due {when}. You can renew items online through your library account or at the circulation desk.",
            f"The library will extend hours during finals week. Group study rooms can be booked online.",
        ])
    elif topic == "honors":
        body = r([
            f"The Honors College is accepting applications for the spring merit scholarship. Submit your application through the scholarship portal linked from the Honors College page on aamu.edu by {date()}.",
            f"Congratulations to the students named to the Dean's List this semester! A recognition ceremony will be held {when} in {room}.",
        ])
    elif topic == "class":
        body = r([
            f"The project milestone deadline has been moved to {when} to give everyone time after the career fair. Please upload your design document to Canvas under Assignments. Office hours are {r(DAYS)} 2-4pm in {room}.",
            f"I will hold a midterm review session {when} at 5pm in {room}. The practice exam is posted on Canvas. Good luck studying.",
            f"Class is cancelled {when}. Please use the time to work on your lab report, which is still due {r(DAYS)}.",
            f"Great job on the presentations today. Grades and feedback will be posted on Canvas by the end of the week.",
        ])
    elif topic == "club":
        body = r([
            f"Our next chapter meeting is {when} at 6pm in {room}. We'll be planning the hackathon and voting on new officers. Pizza will be provided!",
            f"Thanks to everyone who volunteered at the community cleanup. Photos are on our Instagram page. See you at the next meeting.",
        ])
    elif topic == "mail":
        body = r([
            f"You have a package available for pickup at Campus Mail Services. Bring your student ID to the mail center in {room} between 9am and 4pm.",
        ])
    else:
        body = r([
            f"A new announcement has been posted in your course on Canvas: Lab {random.randint(1, 9)} instructions are now available. Log in to Canvas as usual to view it.",
            f"Your submission for Assignment {random.randint(1, 9)} was received on {date()}. You can view it in Canvas.",
        ])
    subject = r([f"Reminder: {when}", "Upcoming deadline", "Important information", "Weekly update", "Schedule change",
                 "Event this week", "Next steps", "FYI", "Office hours", "Announcement", "Thank you"])
    sign = r([f"{office}" if office else f"Dr. {r(LAST)}", f"{name()}\n{office or 'Department of Computer Science'}",
              f"Prof. {r(LAST)}", f"{name()}", "ACM Student Chapter", "Student Government Association"])
    extra = r(["", f"\nMore information: {link}", f"\nVisit {link} for details.", "", f"\nQuestions? Email us at {OFFICES.get(topic, ('', 'info'))[1]}@aamu.edu."])
    sender = r([f"{(office or 'Faculty')} <{OFFICES.get(topic, ('', r(LAST).lower()))[1]}@aamu.edu>", None,
                f"{name()} <{r(FIRST).lower()[0]}{r(LAST).lower()}@aamu.edu>"])
    text = f"{subject}\n{greet}\n{body}{extra}\n{r(['Thanks,', 'Best,', 'Regards,', 'Sincerely,', 'Go Bulldogs!', ''])}\n{sign}"
    return {"text": text, "sender": sender, "label": 0, "topic": topic}


def generate(n_each=700, seed=7):
    random.seed(seed)
    rows = [phish() for _ in range(n_each)] + [legit() for _ in range(n_each)]
    seen, out = set(), []
    for x in rows:
        if x["text"] not in seen:
            seen.add(x["text"])
            out.append(x)
    return out


if __name__ == "__main__":
    rows = generate()
    p = ROOT / "data" / "synthetic" / "campus_synthetic_train.jsonl"
    p.parent.mkdir(parents=True, exist_ok=True)
    with open(p, "w") as f:
        for x in rows:
            f.write(json.dumps(x) + "\n")
    print(len(rows), "rows ->", p, "| phishing:", sum(x["label"] for x in rows))
    print(rows[0]["text"], "\n---\n", rows[-1]["text"])


# =====================================================================================
# v2.1: modern everyday messages (texts, DMs, transactional email)
# Real-world testing showed v2 over-flagged modern receipts/alerts (training ham is
# 2001-2008) and missed link-less conversational scams. These generators add both sides.
# =====================================================================================
BRANDS = [("Amazon", "amazon.com"), ("Target", "target.com"), ("Walmart", "walmart.com"), ("Spotify", "spotify.com"),
          ("Apple", "apple.com"), ("Netflix", "netflix.com"), ("Uber", "uber.com"), ("DoorDash", "doordash.com"),
          ("Chase", "chase.com"), ("Bank of America", "bankofamerica.com"), ("Wells Fargo", "wellsfargo.com"),
          ("PayPal", "paypal.com"), ("Venmo", "venmo.com"), ("Google", "google.com"), ("Microsoft", "microsoft.com"),
          ("Hulu", "hulu.com"), ("Best Buy", "bestbuy.com"), ("Chegg", "chegg.com"), ("Delta", "delta.com"),
          ("Discover", "discover.com"), ("Capital One", "capitalone.com"), ("Zoom", "zoom.us"), ("LinkedIn", "linkedin.com")]
ITEMS = ["USB-C charger", "wireless earbuds", "graphing calculator", "desk lamp", "backpack", "notebook set",
         "laptop stand", "water bottle", "phone case", "textbook: Operating System Concepts", "hoodie", "monitor"]
FRIENDS = ["Jay", "Mimi", "Tobi", "Kemi", "Chris", "Ada", "Ty", "Bri", "Seun", "Dee", "Mo", "Nnamdi"]


def money():
    return f"${random.randint(3, 950)}.{random.randint(0, 99):02d}"


def scam_link(brand=None):
    b = (brand or r(["account", "secure", "verify", "billing", "support", "delivery", "refund", "claim"])).lower().replace(" ", "")
    tld = r(["xyz", "top", "info", "online", "live", "site", "support", "click", "com", "net", "co", "icu", "shop"])
    pat = r([f"{b}-{r(['verify', 'secure', 'help', 'billing', 'center', 'update', 'alerts'])}.{tld}",
             f"{r(['secure', 'my', 'login', 'account'])}-{b}.{tld}", f"{b}.{r(['account', 'support', 'auth'])}-{random.randint(10, 999)}.{tld}",
             f"{random.randint(23, 223)}.{random.randint(1, 254)}.{random.randint(1, 254)}.{random.randint(1, 254)}",
             f"bit.ly/{''.join(random.choices('abcdefghjkmnpqrstuvwxyzABCDEFGH23456789', k=7))}",
             f"{b}{random.randint(1, 99)}.{tld}"])
    return f"{r(['https://', 'http://', '', 'https://'])}{pat}{r(['', '/login', '/verify', '/account', '/pay', '/track', '/claim'])}"


def modern_scam():
    brand, dom = r(BRANDS)
    k = r(["zelle_reversal", "rental", "code_steal", "marketplace", "toll", "acct_lock", "billing", "delivery",
           "crypto", "tech_support", "job_text", "prize_text", "refund", "family_emergency", "subscription",
           "acct_lock", "billing", "delivery", "code_steal", "job_text"])
    if k == "zelle_reversal":
        t = r([f"Hi! I accidentally sent you {money()} on {r(['Zelle', 'Cash App', 'Venmo'])}, it was meant for my {r(['landlord', 'cousin', 'mechanic'])}. Can you please send it back? My bank won't reverse it.",
               f"Hey sorry to bother you, I think I sent {money()} to the wrong number on {r(['Cash App', 'Venmo', 'Zelle'])}. Could you refund it to me please? God bless you",
               f"Hello I mistakenly transferred {money()} to your {r(['Zelle', 'Cash App'])}. Kindly return it to me as soon as you can, my kids need it"])
    elif k == "rental":
        t = r([f"The {r(['1', '2', '3'])} bedroom apartment near campus is still available for ${random.randint(4, 8)}00/month. I'm out of the country right now so I can't show it, but if you send the deposit via {r(['Zelle', 'Cash App', 'wire transfer'])} I'll mail you the keys. Lots of students are interested so act fast.",
               f"Hi, yes the room is available. Rent is ${random.randint(3, 7)}50 including utilities. I'm currently overseas for work. Send the first month and deposit through {r(['Zelle', 'Venmo'])} to hold it and I will ship the keys to you.",
               f"Apartment for rent close to AAMU, very cheap. Owner is out of state. To reserve, pay a {money()} application fee by gift card and text me a photo of the card."])
    elif k == "code_steal":
        t = r([f"Hi I saw your post about selling your {r(ITEMS)}. Before I pay I need to make sure you're real, I'm sending a code to your phone, please tell me the 6 digit code.",
               f"Hey it's {r(FRIENDS)}, I got locked out of my account and they sent a verification code to your number by mistake. Can you send it to me real quick?",
               f"Is your {r(ITEMS)} still for sale? I'll pay {money()} via {r(['Cash App', 'Zelle', 'PayPal'])}. Just verify you're not a bot by sharing the Google Voice code I sent you."])
    elif k == "marketplace":
        t = r([f"I'm interested in your {r(ITEMS)}. I'll send a cashier's check for {money()}, which is more than the price. Please send the extra back to my mover via {r(['Zelle', 'Cash App'])} and they will pick it up.",
               f"I want to buy your {r(ITEMS)} for my nephew. I already sent the payment, please check your email from {r(['PayPal', 'Zelle'])} and confirm. You have to upgrade your account to a business account to receive it."])
    elif k == "toll":
        t = r([f"{r(['E-ZPass', 'SunPass', 'Toll Services', 'State Toll Authority'])}: You have an unpaid toll balance of {money()}. Pay now to avoid a ${random.randint(30, 90)} late fee: {scam_link('toll')}",
               f"DMV notice: your license will be suspended due to unpaid traffic fines. Settle your balance today at {scam_link('dmv')}"])
    elif k == "acct_lock":
        t = r([f"{brand}: We detected unusual activity on your account and temporarily locked it. Verify your identity within 24 hours to restore access: {scam_link(brand)}",
               f"Your {brand} account has been suspended due to a failed security check. Confirm your login details here {scam_link(brand)} or it will be closed permanently.",
               f"Security notice from {brand}: someone tried to sign in from a new device in {r(['Lagos', 'Moscow', 'Beijing', 'Kyiv', 'Sao Paulo'])}. If this wasn't you, secure your account now: {scam_link(brand)}"])
    elif k == "billing":
        t = r([f"Your {brand} subscription payment failed. Update your billing information within 48 hours to avoid interruption of service: {scam_link(brand)}",
               f"{brand} Billing: we couldn't charge your card on file. Your membership is on hold. Please re-enter your card details at {scam_link(brand)}"])
    elif k == "delivery":
        t = r([f"{r(['USPS', 'FedEx', 'UPS', 'DHL'])}: Your package could not be delivered due to an incomplete address. Update your details within 12 hours: {scam_link(r(['usps', 'fedex', 'ups', 'dhl']))}",
               f"Your parcel is held at our warehouse. A redelivery fee of ${random.randint(1, 3)}.{random.randint(10, 99)} is required. Pay here: {scam_link('parcel')}"])
    elif k == "crypto":
        t = r([f"Congratulations! You've been selected for our student crypto airdrop worth {money()}. Connect your wallet within 24 hours to claim: {scam_link('crypto')}",
               f"I made {money()} in one week with this Bitcoin trading platform. My account manager can help you too, just send $200 to start. DM me for the link."])
    elif k == "tech_support":
        t = r([f"{brand} Security: Your computer has been infected with a virus. Call our support line immediately at 1-8{random.randint(10, 99)}-{random.randint(100, 999)}-{random.randint(1000, 9999)} to prevent data loss.",
               f"Your {brand} order of {money()} for an {r(['iPhone 15', 'Xbox', 'MacBook'])} has been placed. If you did not make this purchase, call us now to cancel and get a refund."])
    elif k == "job_text":
        t = r([f"Hello, I'm a recruiter from {r(['TalentBridge', 'Remote Staffing', 'Global Careers'])}. We have a remote position paying ${random.randint(25, 45)}/hour, flexible hours, no experience required. Please reply YES to learn more on WhatsApp.",
               f"Hi! Your resume was recommended to us. Part-time online job, earn ${random.randint(200, 600)} a day liking videos. Add me on Telegram to start today.",
               f"We are hiring students for a mystery shopper assignment. You'll receive a check for {money()}, keep $300 as pay and send the rest via Zelle."])
    elif k == "prize_text":
        t = r([f"Congratulations, you've won a {r(['$1,000 Walmart gift card', 'new iPhone', 'PS5', '$500 Amazon gift card'])}! Claim your prize here: {scam_link('prize')}",
               f"You have been selected as our lucky winner for this month's giveaway. Reply with your name and address to receive your reward."])
    elif k == "refund":
        t = r([f"{brand}: you are eligible for a refund of {money()}. To receive it, verify your bank account at {scam_link(brand)}",
               f"IRS: You have a pending tax refund of {money()}. Submit your Social Security Number and bank details to receive it: {scam_link('irs')}"])
    elif k == "family_emergency":
        t = r([f"Hi mum, this is my new number, my phone broke. I need to pay a bill urgently, can you send {money()} to my friend's account? I'll explain later.",
               f"Hey it's me, I'm in trouble and can't talk right now. Please buy {random.randint(2, 5)} Apple gift cards and send me the codes, don't tell anyone."])
    else:
        t = r([f"Your {brand} free trial ends today and you will be charged {money()}. To cancel, log in here: {scam_link(brand)}",
               f"Thank you for your purchase of {brand} Total Protection for {money()}. If you did not authorize this charge call our refund department immediately."])
    sender = r([None, None, f"{brand} <{r(['support', 'service', 'alerts', 'no-reply'])}@{r([dom.split('.')[0] + '-' + r(['secure', 'alerts', 'support']) + '.' + r(['com', 'net', 'info']), dom.split('.')[0] + str(random.randint(1, 99)) + '.com'])}>",
                f"{r(FRIENDS)} <{r(FRIENDS).lower()}{random.randint(10, 999)}@{r(FREEMAIL)}>"])
    return {"text": t, "sender": sender, "label": 1, "topic": "modern_" + k}


def modern_legit():
    brand, dom = r(BRANDS)
    k = r(["order", "ship", "receipt", "bank_alert", "security_alert", "otp", "newsletter", "social", "appointment",
           "friend", "family", "group", "work", "delivered", "subscription", "friend", "group", "receipt", "bank_alert"])
    name1 = r(FIRST)
    if k == "order":
        t = f"Hi {name1}, thanks for your order! We're getting your {r(ITEMS)} ready. Order total: {money()}. We'll email you when it ships. View your order anytime in your {brand} account."
    elif k == "ship":
        t = f"Your {brand} order has shipped. Your {r(ITEMS)} is on the way and should arrive {r(DAYS)}. Track your package in the {brand} app or at {dom}."
    elif k == "delivered":
        t = f"{r(['UPS', 'FedEx', 'USPS', 'Amazon'])}: Your package was delivered {r(DAYS)} at {random.randint(1, 11)}:{random.randint(10, 59)} PM and left at the front door. No action is needed."
    elif k == "receipt":
        t = r([f"Your receipt from {brand}\n{brand} {r(['Premium Student', 'Monthly Plan', 'Plus'])} - {money()}\nPayment method: {r(['Visa', 'Mastercard', 'Discover'])} ending in {random.randint(1000, 9999)}\nYour plan renews automatically. Manage it anytime in your account settings.",
               f"Thanks for riding with {r(['Uber', 'Lyft'])}, {name1}. Total: {money()}. Trip from {r(['Campus', 'Walmart', 'the airport'])} to {r(['Home', 'Campus', 'Downtown'])}. Rate your driver in the app.",
               f"Payment received. Thank you, {name1}. We received your payment of {money()} on {date()}. No further action is needed."])
    elif k == "bank_alert":
        t = r([f"{brand}: A purchase of {money()} at {r(['Publix', 'Target', 'Chick-fil-A', 'Shell'])} was made with your card ending in {random.randint(1000, 9999)}. If you don't recognize it, call the number on the back of your card. We will never ask for your password or PIN.",
               f"{brand}: Your direct deposit of {money()} has posted to your checking account ending in {random.randint(1000, 9999)}. View details in the {brand} app.",
               f"{brand} alert: your statement for {r(MONTHS)} is ready. Log in through the {brand} app or website to view it. We will never ask you to confirm your account details by email."])
    elif k == "security_alert":
        t = r([f"{brand}: A new sign-in to your account on {r(['Windows', 'an iPhone', 'a Mac', 'Chrome'])}. If this was you, you don't need to do anything. If not, review your account activity in settings.",
               f"Your {brand} password was changed on {date()}. If you made this change, no further action is needed. If you didn't, visit {dom} directly to secure your account."])
    elif k == "otp":
        t = r([f"{random.randint(100000, 999999)} is your {brand} verification code. Don't share this code with anyone. {brand} will never call or text you to ask for it.",
               f"Your {brand} login code is {random.randint(100000, 999999)}. It expires in 10 minutes. If you didn't request this, you can ignore this message."])
    elif k == "newsletter":
        t = f"This week at {brand}: new arrivals, student discounts and our fall picks. Plus, tips for getting the most out of your semester. You're receiving this because you subscribed. Unsubscribe or manage preferences at the bottom of this email."
    elif k == "social":
        t = r([f"{r(FRIENDS)} commented on your post: \"{r(['congrats!!', 'this is fire', 'so proud of you', 'see you there'])}\". See the conversation on {r(['Instagram', 'LinkedIn', 'Facebook'])}.",
               f"You have {random.randint(2, 9)} new connection requests on LinkedIn. {name1}, grow your network by accepting invitations from people you know."])
    elif k == "appointment":
        t = f"Reminder: your appointment with {r(['Dr. Patel', 'the Student Health Center', 'Career Services', 'your advisor'])} is on {when_()}. Reply C to confirm or call our office to reschedule."
    elif k == "friend":
        t = r([f"yo are we still studying for the {r(['algo', 'OS', 'networks', 'database'])} exam tonight? library at 7?",
               f"Did you finish the lab? I'm stuck on part 3 lol",
               f"{r(FRIENDS)} said the party got moved to Saturday. you coming?",
               f"bro I left my charger in your car, can I grab it tomorrow before class",
               f"Can you send me the notes from {r(DAYS)}? I missed class",
               f"happy birthday!! hope you have the best day 🎉",
               f"I sent you {money()} on {r(['Cash App', 'Venmo', 'Zelle'])} for the pizza, thanks for covering"])
    elif k == "family":
        t = r(["Hi dear, how was your exam? Remember to eat well. Call me when you're free.",
               "Your dad says hi. Did you get the package we sent? Let us know.",
               f"I just sent your allowance, check your account. Don't spend it all at once 😄",
               "We're praying for you this week. You'll do great on the interview!"])
    elif k == "group":
        t = r([f"Hey team, I pushed the updated code to GitHub. Can someone review the PR before {r(DAYS)}?",
               f"Meeting moved to {random.randint(3, 8)}pm in the library, bring your laptops",
               f"Reminder: Bible study this {r(DAYS)} at 7pm in the fellowship hall. Bring a friend!",
               f"Practice is at {random.randint(4, 7)} today, don't be late. Coach wants everyone there."])
    elif k == "work":
        t = r([f"Hi {name1}, your shift on {r(DAYS)} has been changed to 2-6pm. Let me know if that works for you.",
               f"Thanks for applying to {r(['ADTRAN', 'Lockheed Martin', 'Dynetics', 'Boeing'])}. We've received your application for the Software Engineering Intern role and will be in touch if your qualifications match our needs."])
    else:
        t = f"Your {brand} subscription will renew on {date()} for {money()}. No action is needed. To make changes, go to Account settings in the {brand} app."
    sender = r([None, None, f"{brand} <{r(['no-reply', 'alerts', 'info', 'orders'])}@{dom}>", f"{r(FRIENDS)} <{r(FRIENDS).lower()}{random.randint(1, 99)}@{r(FREEMAIL)}>"]) \
        if k not in ("friend", "family", "group") else None
    return {"text": t, "sender": sender, "label": 0, "topic": "modern_" + k}


def when_():
    return f"{r(DAYS)}, {date()} at {random.randint(8, 11)}:{r(['00', '15', '30', '45'])} {r(['AM', 'PM'])}"


def generate_modern(n_each=900, seed=11):
    random.seed(seed)
    rows = [modern_scam() for _ in range(n_each)] + [modern_legit() for _ in range(n_each)]
    seen, out = set(), []
    for x in rows:
        if x["text"] not in seen:
            seen.add(x["text"])
            out.append(x)
    return out


if __name__ == "__main__":
    rows = generate_modern()
    p = ROOT / "data" / "synthetic" / "modern_synthetic_train.jsonl"
    with open(p, "w") as f:
        for x in rows:
            f.write(json.dumps(x) + "\n")
    print(len(rows), "modern rows ->", p, "| scams:", sum(x["label"] for x in rows))
