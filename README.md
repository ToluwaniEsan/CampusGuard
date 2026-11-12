# CampusGuard v2.3 · AI-Powered Phishing Detection

Team Catalysts: Esan Toluwani, Osamwengumwenro Oni-Ojo, Yin-Chih Lan, Olayiwola Ajibode, Uchenna Justin · UN SDG 4 (4.4, 4.a)

## What's in the box

| Part | Where | What it does |
|---|---|---|
| **Home page (current)** | `web/home.html`, `dist/campusguard_home.html` (1.7 MB; the screenshot reader `dist/ocr-bundle.js` loads only when an image is added), `dist/campusguard_home_offline.html` (everything in one file, works with no network) | One take-all box: paste a whole email, a text, a link, or drop in a screenshot. CampusGuard works out which part is the sender, the subject and the message, then shows the verdict first (Likely Safe / Suspicious / High Risk with an icon and what to do), the risk score beside it as a number out of 100, why it was flagged, the links, the sender check. One-click example messages, the privacy promise under the box, and the "Spot the scam" practice quiz. Light/dark switch and an animation off-switch |
| **Telling sender from message** | `web/js/campusguard-intake.js` | Rule-based intake that splits a pasted email or screenshot text into sender, subject and body (From:/Subject: headers, `Name <address>` lines, bare addresses, forwarded headers, mail-app clutter). The detected sender can be corrected on the page |
| **Screenshot reading** | `web/vendor/ocr/` (Tesseract.js, Apache-2.0) | Screenshots are read on the device, with the reader bundled inside the page. No image is uploaded |
| **"See how it decided" walkthrough** | `web/js/journey.js`, button under the result | Full-screen, left-to-right line of stations that zooms into each one and back out: Read → Separate → Clean → Spot the signs → Check the links → Weigh it → Sender and verdict, using the real numbers for what you pasted. Back / Play-Pause / Next, speed, ←/→, Space, Esc |
| **Original page** | `web/index.html`, `dist/campusguard.html` | The first two-column layout with a 10-step "How it works" animation. Still served by the API |
| **Real campus data tools** | `scripts/anonymize_campus.py`, `scripts/evaluate_real_campus.py` | Anonymise real AAMU emails on the machine that holds them (names, addresses, phone and ID numbers replaced), then test CampusGuard on them. Real mail is used only for testing and is git-ignored |
| **Sender check** | Results, walkthrough, extension report, API (`sender_check`) | Shows how the From line was judged: the address split into name / mailbox / real owner, each rule as a Yes/No question with the reason, a bar showing the content score, the band the sender is allowed to move it within, and where it landed, plus the exact formula (e.g. `54% + 0.20 × (100% − 54%) = 63%`) |
| **Browser extension (v3.1)** | `extension/`, `dist/campusguard-extension-*.zip`, [`extension/INSTALL.md`](extension/INSTALL.md) | Lives in the browser toolbar. Works on any webmail: Gmail, Outlook, iCloud, Yahoo, AOL, Proton and others are recognised by name, and any other site is checked when you click the icon. **Asks before reading a site**, then checks each email you open and shows the verdict on the icon (badge colour + hover text). When an email looks like a scam, a compact drop-down opens from the icon by itself (colour, score, top reasons). Reads only the open email. Settings: auto-check on/off, scam pop-up on/off, and the list of allowed sites. Pasting is there only when you click "Check something else". Chrome, Edge and Brave (Safari possible on a Mac) |
| **API server** | `server/app.py`, `Dockerfile` | FastAPI: `POST /api/analyze`, `GET /api/health`, optional `POST /api/explain` (LLM rewrite of the flags), and it hosts the web app. No database, no body logging, rate limited, security headers |
| **Models** | `campusguard/`, `models/` | Message model (logistic regression + 23 red-flag detectors) and link model (gradient-boosted trees). Python reference plus an identical JavaScript port |

**Privacy:** the web app and the extension run the model **inside the browser**. The message never leaves the device, nothing is stored, and links are read as text and never opened. The optional AI explanation sends only the red-flag labels, never the message.

## Quick start

```bash
# 1) Just the app: double-click dist/campusguard_home_offline.html (no install, works with no network)
#    dist/campusguard_home.html is the light version for hosting; keep dist/ocr-bundle.js beside it
#    (dist/campusguard.html is the original layout with the practice quiz)

# 2) API + app
pip install -r requirements.txt
uvicorn server.app:app --port 8000          # open http://localhost:8000
# optional friendlier explanations:
export ANTHROPIC_API_KEY=...                # adds an "Explain like a friend (AI)" button

# 3) Extension
#   Chrome/Edge/Brave: unzip dist/campusguard-extension-chromium.zip -> chrome://extensions -> Developer mode -> Load unpacked
#   (step-by-step, incl. Safari: extension/INSTALL.md)
#   Firefox: about:debugging -> This Firefox -> Load Temporary Add-on -> pick manifest.json from the firefox zip

# 4) Deploy with HTTPS: push the Dockerfile to Render / Railway / Fly.io (they terminate TLS)
```

API example:
```bash
curl -s localhost:8000/api/analyze -H 'content-type: application/json' \
  -d '{"text":"Your mailbox will be deactivated today. Verify: http://45.89.127.22/login","sender":"IT <it@aamu-support.com>"}'
```

## What changed in v2.3

| Improvement | What was done |
|---|---|
| 1. Gift-card scams | New red flags: "Asks you to buy gift cards or send card codes" and "Sender says they can't talk and wants a quick favor". A gift-card ask counts as a risky request, so a real aamu.edu address gets no discount for it. 260 generated gift-card scams and 86 harmless gift-card mentions added to training |
| 2. Disguised and non-English text | Letters split by spaces or dots are rejoined ("V e r i f y" → "Verify"); look-alike letters from other alphabets, accents and digits used as letters (passw0rd) are read as plain letters before the red flags run; common misspellings of key words; Spanish and French patterns in the main red flags; Spanish and French examples in training. Letter-group features were tested and left off: they made false alarms on unseen sources worse |
| 3. Real campus data | Anonymiser and evaluation scripts ready. Waiting on AAMU IT for the emails |
| 4. False alarms on casual texts | About 1,000 everyday texts and 220 payment notices (Venmo, Cash App, Zelle) that ask for nothing added to training; threshold now keeps false alarms on unseen sources at 3.5% or less (was 5%). A message that asks you to send passwords, codes or IDs, or to buy gift cards and send the codes, is at least Suspicious however casual it sounds |
| 5. Link checking | Lookalike check made stricter (it was flagging real sites such as techtarget.com, google.co.uk and livejournal.com, which caused most false alarms in the full app); nine new link features (closeness to a trusted name, free website hosts, random-looking names, and others) |
| 6. Clearer explanations | "Wording common in scams" is hidden on Likely Safe results, its severity now follows its real weight, and very short or common words are never shown as evidence |
| 7. Verdict first | The verdict, its icon and what to do lead the result; the score is a smaller number "out of 100, not a probability" |
| 8. Learning and trust up front | Practice quiz, one-click examples and the privacy line are on the main page |
| 9. Accessibility | Five colours darkened to pass WCAG AA contrast in light mode; zero axe-core violations in light and dark; verdicts carry an icon and a word, not only a colour; the result is announced to screen readers; the practice dialog keeps keyboard focus and closes with Esc |
| 10. Faster, consistent design | Main page 10.4 MB → 1.7 MB (the 8 MB screenshot reader loads on first image); model file rounded to 7 significant digits in both engines (2.2 → 1.5 MB, results unchanged); extension restyled to match |

## How the model works (v2.3)

1. **Clean**: strip HTML/mail headers, rejoin spaced-out letters, remove corpus-specific names (leakage), fold look-alike and accented letters to plain ones, replace links, emails, $ amounts and numbers with placeholders.
2. **Message model**: TF-IDF over 25,000 words and two-word phrases, plus 25 red-flag detectors (urgency, threats, password requests, asks you to send codes/IDs, upfront payment, gift-card requests, "can't talk" pretexts, impersonation, money bait, job scams, secrecy, generic greeting, 8 link checks, freemail-official, shouting; key ones also in Spanish and French). Logistic regression; **exact SHAP** values (coef × (x − mean)) become the named flags and highlights.
3. **Link model**: 34 string-only features (IP host, lookalike/homoglyph, subdomain depth, shortener, risky TLD, @ and // tricks, punycode…) → 250 gradient-boosted trees, explained by per-tree path attribution.
4. **Content first**: a link can only raise the score (risk = max(text, average of text and riskiest link)); an IP/lookalike/punycode link sets at least 60%; a request to send passwords, codes or IDs, or to buy gift cards and send the codes, sets at least 70%. This is the **content score**.
   **The From line only nudges it, never outweighs it:**
   - Lookalike sender domain: closes at most **30%** of the gap to 100%. Name/address mismatch or official-sounding Gmail: at most **20%**. Clean content with a fake sender is flagged but stays Likely Safe.
   - Official sender (aamu.edu or a known brand): lowers the risk by at most **25%**, and only when every link is official and the message makes **no risky request** (send passwords/codes/IDs, pay first). Otherwise no discount, plus the flag "Official address, but a risky request", because hacked accounts send from real addresses.
   - Red-flag detector weights are trained with a non-negative constraint, so no warning sign can ever count as evidence of safety.
5. **Decide**: Suspicious from 57, High Risk from 80 (risk score out of 100). The threshold is chosen so legit mail from *unseen* sources stays at 3.5% false alarms or less (leave-one-source-out).

**Training data**: Nazario phishing, advance-fee/fraud emails, SMS scam texts, PhishTank URLs. Legit: SpamAssassin, Enron, CEAS-2008 and Ling ham, casual SMS, ISCX/DMOZ URLs. Plus generated campus and modern examples on both sides (`scripts/synth_campus.py`), so the model learns the red flags rather than the topic. Plus v2.3 examples (`scripts/synth_v23.py`): gift-card scams, Spanish/French, disguised text, payment notices and everyday texts. 13,381 messages and 20,622 URLs in total.

## Results

| Test | v2.2 | **v2.3** |
|---|---|---|
| **Full app, end to end** (model + links + rules + sender check, `scripts/evaluate_pipeline.py`), same 2,008 held-out messages: scams caught / false alarms | 97.0% / 3.7% | **97.6% / 0.9%** |
| Full app on 1,000 unseen legit emails each: CEAS / SpamAssassin / Enron / Ling | 7.2% / 3.2% / 0.3% / 0.1% | **2.9% / 1.6% / 0.5% / 0.2%** |
| Message model alone, held-out test: recall / false alarms / F1 | 97.4% / 0.6% / 0.98 | 96.6% / 0.6% / 0.98 |
| Message model alone, unseen casual texts (leave-one-source-out) | 11.6% false alarms | **6.6%** |
| Unseen legit sources, model alone: SpamAssassin / Enron / CEAS / Ling | 1.3 / 5.3 / 4.8 / 2.0% | 1.7 / 3.8 / 4.6 / 0.8% |
| **Blind battery** (`tests/blind_battery.jsonl`) | 22/22 caught, 1/18 false alarms | **22/22 caught, 0/18** |
| Dev battery (`tests/realistic_battery.jsonl`) | 25/25, 0/20 | 25/25, 0/20 |
| Regression cases from the improvements report (`tests/regression_cases.jsonl`) | 6/15 | **15/15** |
| Link model (domain-grouped split): recall / false alarms / ROC-AUC | 79.2% / 8.4% / 0.932 | 79.7% / 8.6% / 0.937 |
| Python ↔ JavaScript engine parity | 924/924 | 944/944 |
| Main page size | 10.4 MB | 1.7 MB (+ 8 MB reader on first screenshot) |

The v2.2 end-to-end numbers come from retraining v2.2 and running it on the same messages; some of those messages may have been in v2.2's training data, so if anything they flatter v2.2. The full-app comparison exposed a v2.2 problem the model-only numbers hid: its lookalike check flagged ordinary sites, which caused most of its false alarms.

Details: `reports/metrics_v2.json`, `reports/pipeline_eval.json`, `reports/*battery_results.json`, `reports/campus_manual_review.json`.

## Known limits

- The link model is still the weakest part (about 80% of bad links caught at about 9% false alarms). The training links are older public lists; a fresh phishing feed would help most.
- Heavily misspelled scams with no link can still slip through (in a hand-written check, 5 of 12 such messages scored Likely Safe), and only Spanish and French get extra coverage.
- The new examples are generated from templates, so the held-out test includes similar messages. The blind battery and real campus mail are the honest tests.
- The 30-message campus set shares wording with the generated training examples, so its 30/30 is a sanity check, not a benchmark. The blind battery is the honest test.
- Casual texts from friends still trip false alarms more often than email (about 1 in 15 on unseen texts for the model alone).
- Screenshot reading is English only and depends on image quality.
- The API-served page still uses the original layout.
- Real AAMU mail (de-identified, from Campus IT) remains the single best next improvement.

## Rebuild everything

```bash
scripts/download_data.sh && pip install pandas tldextract   # tldextract only to regenerate the suffix list
scripts/rebuild_all.sh    # data -> train -> export JS -> parity, regression + battery tests -> web + extension packages
python3 scripts/evaluate_pipeline.py      # full-app numbers (model + links + rules + sender)
python3 scripts/anonymize_campus.py DIR --label 1   # then scripts/evaluate_real_campus.py, once real mail is available
python3 tests/test_api.py # API tests;  tests/ui_test.py and tests/extension_test.py drive a real browser
node tests/intake_test.js  # sender / subject / message separation
python3 scripts/build_web.py  # rebuild the single-file pages in dist/
```

Campus settings (trusted domains, campus names, brands) live at the top of `campusguard/features.py`. Run `scripts/rebuild_all.sh` after editing them.
