# CampusGuard v2.2 · AI-Powered Phishing Detection

Team Catalysts: Esan Toluwani, Osamwengumwenro Oni-Ojo, Yin-Chih Lan, Olayiwola Ajibode, Uchenna Justin · UN SDG 4 (4.4, 4.a)

## What's in the box

| Part | Where | What it does |
|---|---|---|
| **Paste & check web app** | `web/` (served by the API), `dist/campusguard.html` (single file, works offline) | Paste an email, text, DM or link, then get a verdict dial, named red flags with severity, the message marked up inline, a breakdown of each link, signs pointing the other way, "what to do", a copyable summary, and the "Spot the scam" practice quiz |
| **"How it works" animation** | Button on the page | 10-step walkthrough driven by the real model on whatever you pasted: clean → words → TF-IDF → detectors → link inspector → weighing the evidence (SHAP) → combining text + links → **checking the sender** → decision and explanation. Presentation controls: ←/→, Space, Esc, speed |
| **Sender check** | Results panel, animation step 9, extension report, API (`sender_check`) | Shows how the From line was judged: the address split into name / mailbox / real owner, each rule as a Yes/No question with the reason, a bar showing the content score, the band the sender is allowed to move it within, and where it landed, plus the exact formula (e.g. `54% + 0.20 × (100% − 54%) = 63%`) |
| **Browser extension** | `extension/`, `dist/campusguard-extension-*.zip` | Gmail & Outlook web: a verdict card above every opened email. Also a popup paste-checker, a right-click "Check selected text / this link", and a full report page. Chrome, Edge, Brave and Firefox |
| **API server** | `server/app.py`, `Dockerfile` | FastAPI: `POST /api/analyze`, `GET /api/health`, optional `POST /api/explain` (LLM rewrite of the flags), and it hosts the web app. No database, no body logging, rate limited, security headers |
| **Models** | `campusguard/`, `models/` | Message model (logistic regression + 23 red-flag detectors) and link model (gradient-boosted trees). Python reference plus an identical JavaScript port |

**Privacy:** the web app and the extension run the model **inside the browser**. The message never leaves the device, nothing is stored, and links are read as text and never opened. The optional AI explanation sends only the red-flag labels, never the message.

## Quick start

```bash
# 1) Just the app: double-click dist/campusguard.html (no install, works offline)

# 2) API + app
pip install -r requirements.txt
uvicorn server.app:app --port 8000          # open http://localhost:8000
# optional friendlier explanations:
export ANTHROPIC_API_KEY=...                # adds an "Explain like a friend (AI)" button

# 3) Extension
#   Chrome/Edge/Brave: unzip dist/campusguard-extension-chromium.zip -> chrome://extensions -> Developer mode -> Load unpacked
#   Firefox: about:debugging -> This Firefox -> Load Temporary Add-on -> pick manifest.json from the firefox zip

# 4) Deploy with HTTPS: push the Dockerfile to Render / Railway / Fly.io (they terminate TLS)
```

API example:
```bash
curl -s localhost:8000/api/analyze -H 'content-type: application/json' \
  -d '{"text":"Your mailbox will be deactivated today. Verify: http://45.89.127.22/login","sender":"IT <it@aamu-support.com>"}'
```

## How the model works (v2.2)

1. **Clean**: strip HTML/mail headers, remove corpus-specific names (leakage), replace links, emails, $ amounts and numbers with placeholders.
2. **Message model**: TF-IDF over 25,000 words and two-word phrases, plus 23 red-flag detectors (urgency, threats, password requests, asks you to send codes/IDs, upfront payment, impersonation, money bait, job scams, secrecy, generic greeting, 8 link checks, freemail-official, shouting). Logistic regression; **exact SHAP** values (coef × (x − mean)) become the named flags and highlights.
3. **Link model**: 25 string-only features (IP host, lookalike/homoglyph, subdomain depth, shortener, risky TLD, @ and // tricks, punycode…) → 250 gradient-boosted trees, explained by per-tree path attribution.
4. **Content first**: a link can only raise the score (risk = max(text, average of text and riskiest link)); an IP/lookalike/punycode link sets at least 60%. This is the **content score**.
   **The From line only nudges it, never outweighs it:**
   - Lookalike sender domain: closes at most **30%** of the gap to 100%. Name/address mismatch or official-sounding Gmail: at most **20%**. Clean content with a fake sender is flagged but stays Likely Safe.
   - Official sender (aamu.edu or a known brand): lowers the risk by at most **25%**, and only when every link is official and the message makes **no risky request** (send passwords/codes/IDs, pay first). Otherwise no discount, plus the flag "Official address, but a risky request", because hacked accounts send from real addresses.
   - Red-flag detector weights are trained with a non-negative constraint, so no warning sign can ever count as evidence of safety.
5. **Decide**: Suspicious from 54.6%, High Risk from 80%. The threshold is chosen so legit mail from *unseen* sources stays under 5% false alarms (leave-one-source-out).

**Training data**: Nazario phishing, advance-fee/fraud emails, SMS scam texts, PhishTank URLs. Legit: SpamAssassin, Enron, CEAS-2008 and Ling ham, casual SMS, ISCX/DMOZ URLs. Plus generated campus and modern examples on both sides (`scripts/synth_campus.py`), so the model learns the red flags rather than the topic. 11,782 messages and 20,622 URLs in total.

## Results

| Test | v1 (deck data only) | **v2.2** |
|---|---|---|
| Held-out test (1,768 msgs): recall / false alarms / F1 | 73.1% / 3.9% / 0.82 | **97.4% / 0.6% / 0.98** |
| Unseen money/advance-fee scams: recall | ~51% | **~99%** |
| Unseen CEAS + Ling legit mail: false alarms | 2.1% | **0.8%** |
| **Blind battery** (hand-written modern scams + everyday mail, `tests/blind_battery.jsonl`) | v2.0: 16/22 caught, 2/18 false alarms | **22/22 caught, 1/18 false alarms** |
| Dev battery (`tests/realistic_battery.jsonl`, used for tuning) | v2.0: 21/25, 4/20 | 25/25, 0/20 |
| Link model (domain-grouped split) | n/a | recall 80%, false alarms 9%, ROC-AUC 0.93 |
| Speed | | ~2–5 ms per message in the browser, under 0.5 s worst case |
| Python ↔ JavaScript engine parity | | 924/924 identical |

Leave-one-source-out false alarms on unseen legit sources: SpamAssassin 1.3%, Enron 5.3%, CEAS 4.8%, Ling 2.0%, casual SMS 11.6%. Casual texting is the hardest style for the model.

Details: `reports/metrics_v2.json`, `reports/*battery_results.json`, `reports/campus_manual_review.json`.

## Known limits

- One blind false alarm: a real Venmo "you were paid $18" notice (content 75%, 56% after the official-sender discount). Money + Venmo wording still reads as scam-like to the text model.
- The 30-message campus set shares wording with the generated training examples, so its 30/30 is a sanity check, not a benchmark. The blind battery is the honest test.
- Casual texts from friends can still trip false alarms more often than email (about 1 in 10 on unseen SMS).
- Real AAMU mail (de-identified, from Campus IT) remains the single best next improvement.

## Rebuild everything

```bash
scripts/download_data.sh && pip install pandas tldextract   # tldextract only to regenerate the suffix list
scripts/rebuild_all.sh    # data -> train -> export JS -> parity + battery tests -> web + extension packages
python3 tests/test_api.py # API tests;  tests/ui_test.py and tests/extension_test.py drive a real browser
```

Campus settings (trusted domains, campus names, brands) live at the top of `campusguard/features.py`. Run `scripts/rebuild_all.sh` after editing them.
