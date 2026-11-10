"""v2.3 synthetic training messages for the gaps found in testing.

  * gift-card requests from fake professors, deans, coaches and bosses (and harmless
    messages that mention gift cards, so the model learns the request, not the words)
  * Spanish and French scams and everyday messages
  * scams written to dodge filters: spaced-out letters, digits for letters, misspellings
  * payment notices and casual money texts that ask for nothing (false-alarm fix)

These are randomised templates. The regression cases in tests/regression_cases.jsonl and the
blind battery were written separately by hand and are never generated here.
"""
from __future__ import annotations

import json
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

FIRST = ["Jordan", "Aaliyah", "Marcus", "Chidi", "Tiana", "Kofi", "Destiny", "Malik", "Imani", "Ethan",
         "Grace", "Amara", "Brandon", "Jasmine", "Darius", "Nia", "Samuel", "Kayla", "Andre", "Bisi"]
LAST = ["Williams", "Johnson", "Okafor", "Brown", "Davis", "Adeyemi", "Harris", "Lee", "Mensah", "Thomas",
        "Carter", "Robinson", "Walker", "Moore"]
TITLES = ["Dr.", "Prof.", "Professor", "Dean", "Coach", "Pastor", "Mr.", "Mrs.", "Ms."]
ROLES = ["your professor", "the department chair", "the dean", "your advisor", "your supervisor", "Coach",
         "your RA", "the lab director", "your manager"]
FREEMAIL = ["gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "aol.com", "icloud.com"]
CARDS = ["Apple gift cards", "Google Play gift cards", "Steam gift cards", "Amazon gift cards", "iTunes cards",
         "Visa gift cards", "eBay gift cards", "Target gift cards", "Vanilla gift cards", "Walmart gift cards"]
REASONS = ["for some students in my class", "for the department awards", "as a surprise for the staff",
           "for a client meeting", "for my niece's birthday", "for the volunteers", "for the team",
           "for a charity drive", "as prizes for the seminar", "for the graduating seniors"]
PRETEXT = ["I'm in a meeting right now and can't take calls", "I'm about to board a flight",
           "I'm tied up in a conference all day", "I can't talk on the phone at the moment",
           "I'm in back-to-back meetings", "my phone can only text right now", "I'm stuck in a seminar",
           "I'm traveling and my card isn't working here"]
FRIENDS = ["Jay", "Mimi", "Tobi", "Kemi", "Chris", "Ada", "Ty", "Bri", "Seun", "Dee", "Mo", "Nnamdi"]
FOODS = ["pizza", "wings", "the Uber", "groceries", "the movie tickets", "gas", "dinner", "the textbook",
         "concert tickets", "the Airbnb", "Chipotle", "the laundry card", "printing"]
DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


def r(x):
    return random.choice(x)


def money():
    return f"${random.randint(5, 400)}.{random.randint(0, 99):02d}"


def person():
    return f"{r(TITLES)} {r(LAST)}"


def fake_sender(nm):
    local = nm.split()[-1].lower() + r(["", ".office", ".aamu", str(random.randint(1, 99)), ".dept", "_edu"])
    return f"{nm} <{local}@{r(FREEMAIL)}>"


# ------------------------------------------------------------------ gift-card scams
def giftcard_scam():
    nm, n, amt = person(), random.randint(2, 8), r([25, 50, 100, 100, 200])
    opener = r(["Hello", "Hi", "Good morning", "Hey", "Are you on campus today?", "Do you have a minute?",
                "Are you around?", "I need a favor.", "Hope you're well."])
    ask = r([f"I need you to purchase {n} {r(CARDS)} (${amt} each) {r(REASONS)}.",
             f"Can you help me buy {n} {r(CARDS)} worth ${amt} each {r(REASONS)}?",
             f"Could you go get {r(CARDS)} {r(REASONS)}? {n} cards at ${amt} each.",
             f"Please pick up {n} {r(CARDS)}, ${amt} each, {r(REASONS)}.",
             f"I want you to buy {r(CARDS)} for me, total ${n * amt}."])
    send = r(["Once you have them, scratch off the back and send me clear photos of the codes.",
              "Email me the card numbers and PINs as soon as you get them.",
              "Text me pictures of the back of each card with the codes showing.",
              "Scratch the cards and send the codes to this email.",
              "Send me the redemption codes and keep the receipts."])
    pay = r(["I'll reimburse you tomorrow.", "You will be paid back before the end of the day.",
             "I'll pay you back with an extra $50 for your time.", "Keep the receipt so I can refund you.", ""])
    pretext = r(PRETEXT) + "."
    parts = [opener, pretext, ask, send, pay, r(["Thanks.", "Let me know asap.", "This is urgent, please.", "Keep this between us for now.", ""]), nm]
    random.shuffle(parts[1:3])
    t = " ".join(p for p in parts if p)
    return {"text": t, "sender": r([fake_sender(nm), fake_sender(nm), None]), "label": 1, "topic": "v23_giftcard_scam"}


def giftcard_legit():
    k = r(["raffle", "survey", "bday", "store", "prize", "thanks", "bookstore", "receipt"])
    if k == "raffle":
        t = f"Congratulations to our {r(['Homecoming', 'Spring Fest', 'Career Fair', 'Library Week'])} raffle winners! Each winner receives a ${r([10, 25, 50])} {r(['Amazon', 'Target', 'bookstore'])} gift card. Winners can collect it at the {r(['Student Center', 'SGA office', 'library front desk'])} with their student ID."
    elif k == "survey":
        t = f"Thank you for completing the {r(['dining', 'housing', 'technology', 'advising'])} survey. As promised, a ${r([5, 10, 15])} gift card will be emailed to your aamu.edu address within two weeks. No reply is needed."
    elif k == "bday":
        t = r([f"I got {r(FRIENDS)} a {r(['Sephora', 'Starbucks', 'Amazon', 'Target'])} gift card for her birthday, want to sign the card?",
               f"lol my aunt sent me a gift card for {r(['Christmas', 'my birthday', 'graduation'])}, finally getting those headphones",
               f"what do we get the professor for the end of the semester? maybe a coffee gift card from all of us?"])
    elif k == "store":
        t = f"Gift cards make the perfect present. Shop {r(['Target', 'Best Buy', 'Starbucks'])} gift cards in any amount, in store or online. Gift cards never expire."
    elif k == "prize":
        t = f"Great job at the {r(['hackathon', 'pitch competition', 'coding challenge'])}! First place teams get ${r([100, 200, 250])} in {r(['Amazon', 'Visa'])} gift cards, which will be handed out at the closing ceremony on {r(DAYS)}."
    elif k == "thanks":
        t = f"Thanks so much for the {r(['Starbucks', 'Chick-fil-A', 'Barnes & Noble'])} gift card, that was really kind. See you in class {r(DAYS)}!"
    elif k == "bookstore":
        t = "The campus bookstore now accepts gift cards and financial aid book vouchers. Visit us in person or call during business hours with any questions."
    else:
        t = f"Your order is confirmed: 1 x {r(['Amazon', 'Apple', 'Target'])} eGift card, {money()}. It will be delivered to the recipient's email on the date you chose. View your order in your account."
    return {"text": t, "sender": None, "label": 0, "topic": "v23_giftcard_legit"}


# ------------------------------------------------------------------ Spanish / French
ES_SCAM = [
    "Estimado usuario: su cuenta de correo {u} será suspendida en 24 horas. Verifique su contraseña de inmediato para evitar la cancelación.",
    "Aviso de seguridad: detectamos un inicio de sesión sospechoso. Confirme sus datos y su clave respondiendo a este mensaje.",
    "Su buzón está lleno. Para seguir recibiendo correos, actualice su cuenta e ingrese su usuario y contraseña.",
    "Último aviso: su ayuda financiera está retenida. Envíe su número de seguro social y su cuenta bancaria hoy.",
    "Felicidades, usted es el ganador de un premio de {m}. Para recibirlo debe pagar una tarifa de procesamiento.",
    "Hola, estoy en una reunión y no puedo hablar. Necesito que compres {n} tarjetas de regalo de {c} y me envíes los códigos.",
    "Su acceso al portal estudiantil ha sido bloqueado. Inicie sesión con su contraseña actual para restaurarlo hoy mismo.",
    "Banco: su tarjeta de débito fue desactivada. Responda con el número de tarjeta y la fecha de nacimiento para reactivarla.",
    "Le enviamos un código de verificación. Por favor, compártalo con nosotros para confirmar su identidad.",
    "Oferta de trabajo desde casa: gane {m} por semana. Envíe sus datos bancarios para el depósito directo.",
]
ES_HAM = [
    "Hola mamá, ya terminé las clases. ¿Hablamos esta noche?",
    "¿Vamos a estudiar juntos para el examen del {d}? Yo llevo los apuntes.",
    "Recordatorio: su cita en el centro de salud es el {d} a las 10 de la mañana.",
    "La reunión del club de español es el {d} en la biblioteca. ¡Traigan bocadillos!",
    "Gracias por tu ayuda con la tarea, te debo una.",
    "Tu pedido ha sido enviado y llegará el {d}. Puedes ver el estado en la aplicación.",
    "Feliz cumpleaños, prima. Que tengas un día increíble.",
    "La clase de mañana se cancela. Nos vemos el {d} a la hora de siempre.",
    "Ya te mandé {m} por Zelle para la renta, avísame si llegó.",
    "El partido empieza a las siete, ¿pasas por mí?",
]
FR_SCAM = [
    "Votre compte de messagerie sera suspendu dans 24 heures. Confirmez votre mot de passe immédiatement.",
    "Alerte de sécurité : connexion inhabituelle détectée. Vérifiez votre identité en répondant avec vos identifiants.",
    "Votre colis est en attente. Des frais de livraison de {m} sont requis pour le recevoir.",
    "Dernier avertissement : votre carte bancaire a été bloquée. Envoyez le numéro de la carte pour la débloquer.",
    "Je suis en réunion et je ne peux pas appeler. Achetez {n} cartes cadeaux {c} et envoyez-moi les codes.",
    "Félicitations, vous êtes le gagnant d'un remboursement de {m}. Fournissez vos coordonnées bancaires.",
]
FR_HAM = [
    "Salut, on se retrouve à la bibliothèque à 18h pour réviser ?",
    "Merci pour hier soir, c'était super. À bientôt !",
    "Rappel : votre rendez-vous est prévu le {d} à 14h.",
    "Ta commande a été expédiée et arrivera {d}.",
    "Bon anniversaire ! Passe une excellente journée.",
    "Le cours de demain est annulé, on se voit {d}.",
]


def multilang(label):
    pool = (ES_SCAM + FR_SCAM) if label else (ES_HAM + FR_HAM)
    t = r(pool).format(u=r(FIRST).lower() + "@aamu.edu", m=money(), n=random.randint(2, 6),
                       c=r(["Apple", "Google Play", "Amazon", "Steam"]), d=r(DAYS))
    return {"text": t, "sender": None, "label": label, "topic": "v23_multilang_" + ("scam" if label else "ham")}


# ------------------------------------------------------------------ filter-dodging scams (no links)
def spaced(w):
    sep = r([" ", ".", "-", " "])
    return sep.join(w)


LEET = {"o": "0", "a": "4", "e": "3", "i": "1", "s": "5"}
TYPO = {"password": ["pasword", "passwrd", "pssword", "passsword"], "account": ["acount", "accout", "acct", "accnt"],
        "verify": ["verfy", "verifiy", "vrify"], "suspended": ["suspnded", "suspened", "susp ended"],
        "immediately": ["immediatly", "imediately", "immediatley"], "confirm": ["confim", "confrim"],
        "please": ["plese", "pls", "plz"], "mailbox": ["mail box", "mailbx"], "login": ["log in", "logon", "loggin"]}


def leet(w):
    i = random.randrange(1, len(w) - 1)
    c = w[i]
    return w[:i] + LEET.get(c, c) + w[i + 1:]


def obfuscated_scam():
    base = r(["Your {account} will be {suspended} today. {verify} your {password} by replying to this message.",
              "{please} {confirm} your {login} details {immediately} or your {mailbox} will be closed.",
              "Unusual sign in detected. {verify} your {account} and send your {password} to the help desk {immediately}.",
              "Final notice: your {mailbox} is full. {confirm} your {password} to restore access.",
              "Your student {account} has been {suspended}. Reply with your username and {password} to {verify}."])
    style = r(["spaced", "leet", "typo", "typo", "mixed"])

    def word(w):
        if style == "spaced" or (style == "mixed" and random.random() < 0.3):
            return spaced(w) if random.random() < 0.7 else w
        if style == "leet" or (style == "mixed" and random.random() < 0.3):
            return leet(w) if random.random() < 0.7 else w
        if style in ("typo", "mixed") and w in TYPO and random.random() < 0.8:
            return r(TYPO[w])
        return w
    keys = ["account", "suspended", "verify", "password", "please", "confirm", "login", "immediately", "mailbox"]
    vals = {k: word(k) for k in keys}
    t = base.format(**vals)
    t = t[0].upper() + t[1:]
    return {"text": t, "sender": None, "label": 1, "topic": "v23_obfuscated_scam"}


# ------------------------------------------------------------------ notices and casual money texts (ask nothing)
def payment_notice():
    nm, app = f"{r(FIRST)} {r(LAST)}", r(["Venmo", "Cash App", "Zelle", "PayPal", "Apple Cash"])
    t = r([f"{nm} paid you {money()}. Note: {r(FOODS)}. The money is in your {app} balance.",
           f"You received {money()} from {nm} via {app}. Memo: {r(FOODS)}. No action needed.",
           f"{app}: {nm} sent you {money()} for \"{r(FOODS)}\". It's now in your balance.",
           f"You paid {nm} {money()} for {r(FOODS)}. See your activity in the {app} app.",
           f"{app}: your transfer of {money()} to your bank account ending in {random.randint(1000, 9999)} is complete. Funds arrive in 1-3 business days.",
           f"Payment received. {nm} sent you {money()} with {app}. Reply STOP to stop these alerts.",
           f"Your {app} payment request to {nm} for {money()} was completed. Note: {r(FOODS)}."])
    return {"text": t, "sender": None, "label": 0, "topic": "v23_payment_notice"}


PLACES = ["the library", "the caf", "Walmart", "the gym", "church", "practice", "the lab", "my room", "the bus stop",
          "Target", "the student center", "work", "my mom's", "the dining hall", "the game", "class"]
TIMES = ["at 5", "at 7", "tonight", "tomorrow", "after class", "in 10 mins", "around 6", "this weekend", "later",
         "rn", "tmrw", "after practice", "before noon"]
THINGS = ["charger", "hoodie", "notes", "calculator", "keys", "laptop", "umbrella", "textbook", "headphones", "ID"]
OPEN = ["", "", "yo ", "hey ", "ok ", "lol ", "bro ", "girl ", "wait ", "sooo ", "omg ", "hey hey "]
CLOSE = ["", "", "", " lol", " 😂", " 🙏", " !!", " ??", " lmk", " k", " haha", " ok?", " 😭", " thx"]


def chat_line():
    f, p, tm, th = r(FRIENDS), r(PLACES), r(TIMES), r(THINGS)
    body = r([f"where you at", f"I'm at {p}", f"meet me at {p} {tm}", f"you going to {p} {tm}", f"leaving {p} now",
              f"did you see {f}'s story", f"{f} is coming too", f"can I borrow your {th} {tm}", f"I left my {th} at {p}",
              f"what time is the exam", f"did you do the reading", f"I'm so tired", f"that test was crazy",
              f"save me a plate", f"call me {tm}", f"running late", f"be there {tm}", f"just woke up", f"on my way",
              f"what are you wearing to the party", f"the line at {p} is so long", f"you want anything from {p}",
              f"text me when you get home", f"I'll pick you up {tm}", f"we still on for {tm}", f"did you eat yet",
              f"good night", f"good morning", f"congrats on the internship", f"proud of you fr", f"miss you guys",
              f"can you send me the slides", f"which room is the review session", f"prof cancelled class",
              f"who has the group doc link", f"I'll finish my part {tm}", f"my phone is about to die",
              f"the shuttle is late again", f"traffic is crazy", f"I got the job!!", f"pray for me on this exam",
              f"happy birthday {f}", f"thank you so much", f"no worries", f"sounds good", f"bet", f"say less",
              f"I owe you one", f"pay you back {tm}", f"I'll venmo you {tm}", f"lunch is on me {tm}",
              f"how much was {r(FOODS)}", f"I got {r(FOODS)} covered", f"I sent it",
              f"did the money go through", f"mom sent money for books", f"rent is due friday, I'll send my half"])
    t = r(OPEN) + body + r(CLOSE)
    if random.random() < 0.35:
        t += r([". ", " ", "\n"]) + r(OPEN).strip() + " " + r(["ok", "see you", "thanks", "love you", "ttyl", "talk later", "on the way", "lol"])
    return t.strip()


def casual_scam():
    """Scams written in a friend's voice. Casual everyday texts were added for the false-alarm fix;
    these keep the model from learning that a casual tone means safe."""
    f = r(FRIENDS)
    opener = r(["yo", "hey", "bro", "omg", "heyy", "sis", "girl", "hey it's " + f, "hi", "wassup", ""])
    body = r([
        "I got locked out of my account and the reset code went to your phone. can you send me the 6 digit code real quick",
        "can you log into your account for me and send me the password, I need to check something for the group project",
        "I'm doing a giveaway for followers, send me your cash tag and your card number so I can send you $500",
        "my cousin can flip $100 into $1,000 on cash app, just send her the money and she sends it back in an hour",
        "you're in this video?? lol look " + r(["bit.ly/3vX9qP", "tinyurl.com/yourvid22", "vid-share.top/watch", "insta-clip.xyz/v"]),
        "vote for me in this contest pls, you just have to log in with your email and password " + r(["bit.ly/votenow7", "best-pic-vote.online", "contest-vote.site/login"]),
        "can you buy me a $50 apple card, I'll pay you back tonight, just send me a pic of the code",
        "the scholarship office said they need your student ID, date of birth and SSN for the form, just text them to me and I'll submit it",
        "I made $2k this week trading crypto, send $200 to my guy and he'll set you up, it's legit",
        "they're giving free money to students, just send your bank login and routing number to the lady on whatsapp",
        "my account got hacked, can you send me the code they texted you so I can get back in",
        "selling my old iphone for $80, just zelle me first and I'll ship it tomorrow, I promise",
        "your account is about to get deleted, the admin said send your username and password to fix it",
        "need a favor, can you give me your email login? mine is blocked and I need to send my assignment",
        "I'm stuck at the airport and my card got declined, can you send $300 on zelle, I'll pay you back monday",
    ])
    return {"text": (opener + " " + body).strip() + r(["", "", " pls", " asap", " 🙏", " lol"]), "sender": None,
            "label": 1, "topic": "v23_casual_scam"}


def casual_text():
    if random.random() < 0.7:
        return {"text": chat_line(), "sender": None, "label": 0, "topic": "v23_casual"}
    f = r(FRIENDS)
    t = r([f"can you venmo me {money()} for {r(FOODS)}? whenever you get a chance",
           f"just sent you {money()} for {r(FOODS)}, we're even now",
           f"how much do I owe you for {r(FOODS)}?",
           f"{f} said she'll pay you back {r(DAYS)} for {r(FOODS)}",
           f"did you get the money I sent for {r(FOODS)}?",
           f"splitting {r(FOODS)}, it's like {money()} each. cash app or zelle?",
           f"omw, save me a seat",
           f"you still have my calculator? need it for the test {r(DAYS)}",
           f"lmk when you're done with class, we can grab food",
           f"can't talk rn, in the library. text you after",
           f"I'm in a meeting till 3, call you after",
           f"bro the wifi in the dorm is down again 😩",
           f"Mom said call her when you're free",
           f"who's driving to the game {r(DAYS)}?",
           f"thanks for covering {r(FOODS)} last night, I'll get you next time",
           f"are you coming to the study group {r(DAYS)}?",
           f"the professor posted the grades on Canvas",
           f"happy {r(DAYS)}!! good luck on your presentation",
           f"I owe you {money()}, sending it tonight",
           f"do you need anything from Walmart? going now"])
    return {"text": t, "sender": None, "label": 0, "topic": "v23_casual"}


def generate(seed=23):
    random.seed(seed)
    rows = ([giftcard_scam() for _ in range(260)] + [giftcard_legit() for _ in range(120)]
            + [multilang(1) for _ in range(200)] + [multilang(0) for _ in range(200)]
            + [obfuscated_scam() for _ in range(220)]
            + [payment_notice() for _ in range(220)] + [casual_text() for _ in range(1200)])
    # casual_scam() was tried as well: it raised false alarms on unseen texts (5.8% -> 7.2%) and lowered
    # recall, so it is left out. The request floor in predict.py covers friend-voice asks instead.
    seen, out = set(), []
    for x in rows:
        if x["text"] not in seen:
            seen.add(x["text"])
            out.append(x)
    return out


if __name__ == "__main__":
    rows = generate()
    p = ROOT / "data" / "synthetic" / "v23_synthetic_train.jsonl"
    with open(p, "w") as f:
        for x in rows:
            f.write(json.dumps(x, ensure_ascii=False) + "\n")
    from collections import Counter
    print(len(rows), "v2.3 rows ->", p, dict(Counter(x["topic"] for x in rows)))
