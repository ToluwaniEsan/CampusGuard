#!/usr/bin/env bash
# Fetches the public corpora used for training into data/raw/ (~400 MB).
set -euo pipefail
cd "$(dirname "$0")/../data/raw"
# Nazario phishing, SpamAssassin, Enron (+ Nigerian fraud for the cross-source test)
git clone --depth 1 https://github.com/rokibulroni/Phishing-Email-Dataset emails
B=https://raw.githubusercontent.com/shreyagopal/Phishing-Website-Detection-by-Machine-Learning-Techniques/master/DataFiles
curl -sL -o phishtank_online_valid.csv "$B/2.online-valid.csv"   # PhishTank verified-online dump
curl -sL -o benign_urls.csv "$B/1.Benign_list_big_final.csv"      # ISCX-URL-2016 benign
curl -sL -o faizann_urls.csv https://raw.githubusercontent.com/faizann24/Using-machine-learning-to-detect-malicious-URLs/master/data/data.csv
curl -sL -o sms.tsv https://raw.githubusercontent.com/justmarkham/pycon-2016-tutorial/master/data/sms.tsv   # UCI SMS collection
echo "done"
