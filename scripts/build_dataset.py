"""Build the v2 corpora.

v1 (deck list)  : Nazario phishing  vs  SpamAssassin ham + Enron ham
v2 (strengthened, deck Next Step 'Expand Data'):
  phishing / scam : Nazario + advance-fee/money scams (Nigerian-fraud corpus) + SMS scam texts (UCI SMS
                    collection) + synthetic campus lures + synthetic modern text/email scams
  legitimate      : SpamAssassin ham + Enron ham + CEAS-2008 ham + Ling ham + casual SMS (UCI)
                    + synthetic campus notices + synthetic modern receipts/alerts/chats
URL model         : PhishTank verified URLs vs ISCX + DMOZ benign URLs (scheme stripped, <=5 URLs/domain)

Spam rows are always dropped (spam is not phishing). Features are pre-computed once
(normalised text, cleaned text, engineered red flags) and cached in a pickle.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from campusguard.features import url_struct  # noqa: E402
from campusguard.model import prepare  # noqa: E402
from campusguard.preprocess import combine_subject_body  # noqa: E402

RAW = ROOT / "data" / "raw"
OUT = ROOT / "data" / "processed"
OUT.mkdir(parents=True, exist_ok=True)
RNG = 42
POOL_CAP = 3200   # max rows per source kept in the pool (train + test + cross-source pools)


def load_emails() -> pd.DataFrame:
    e = RAW / "emails"
    parts = []

    def add(df, source, label_filter=None, year=None):
        if label_filter is not None:
            df = df[df.label == label_filter]
        parts.append(pd.DataFrame({
            "text": [combine_subject_body(s, b) for s, b in zip(df["subject"], df["body"])],
            "sender": df["sender"].values if "sender" in df else np.nan,
            "label": df["label"].values, "source": source,
            "year": year if year is not None else pd.to_datetime(df["date"], errors="coerce", utc=True, format="mixed").dt.year.values,
        }))

    add(pd.read_csv(e / "Nazario.csv"), "nazario")
    add(pd.read_csv(e / "Nigerian_Fraud.csv"), "fraud_scam", year=np.nan)
    add(pd.read_csv(e / "SpamAssasin.csv"), "spamassassin_ham", 0, 2002)
    add(pd.read_csv(e / "Enron.csv"), "enron_ham", 0, 2001)
    add(pd.read_csv(e / "CEAS_08.csv"), "ceas_ham", 0, 2008)
    add(pd.read_csv(e / "Ling.csv"), "ling_ham", 0, 2000)
    sms = pd.read_csv(RAW / "sms.tsv", sep="\t", header=None, names=["label", "text"], quoting=3)
    parts.append(pd.DataFrame({"text": sms.text, "sender": np.nan, "label": (sms.label == "spam").astype(int),
                               "source": np.where(sms.label == "spam", "sms_scam", "sms_ham"), "year": 2010}))
    mod = pd.read_json(ROOT / "data" / "synthetic" / "modern_synthetic_train.jsonl", lines=True)
    parts.append(pd.DataFrame({"text": mod.text, "sender": mod.sender, "label": mod.label,
                               "source": np.where(mod.label == 1, "modern_synth_scam", "modern_synth_ham"), "year": 2026}))
    syn = pd.read_json(ROOT / "data" / "synthetic" / "campus_synthetic_train.jsonl", lines=True)
    parts.append(pd.DataFrame({"text": syn.text, "sender": syn.sender, "label": syn.label,
                               "source": np.where(syn.label == 1, "synthetic_phish", "synthetic_ham"), "year": 2026}))
    d = pd.concat(parts, ignore_index=True)
    d = d[d.text.notna() & ~d.text.str.contains("FOLDER INTERNAL DATA", na=False)]
    d["text"] = d.text.str.slice(0, 20000)
    d = d.sample(frac=1, random_state=RNG).groupby("source").head(POOL_CAP)
    print("preparing", len(d), "messages ...", flush=True)
    norms, cleans, eng = prepare(d.text.tolist())
    d = d.reset_index(drop=True)
    d["norm"], d["clean"] = norms, cleans
    d = pd.concat([d, eng.reset_index(drop=True)], axis=1)
    short_ok = d.source.isin(["sms_ham", "sms_scam", "modern_synth_scam", "modern_synth_ham"])
    d = d[d.clean.str.split().str.len().between(3, 4000) & (short_ok | (d.clean.str.split().str.len() >= 8))]
    d = d.drop_duplicates("clean").reset_index(drop=True)
    return d


TRAIN_MIX = {"nazario": None, "fraud_scam": 1500, "synthetic_phish": None,
             "spamassassin_ham": 1300, "enron_ham": 1300, "ceas_ham": 1300, "ling_ham": 600,
             "synthetic_ham": None, "sms_ham": 1500, "sms_scam": 500,
             "modern_synth_scam": None, "modern_synth_ham": None}


def corpus(pool: pd.DataFrame) -> pd.DataFrame:
    parts = []
    for src, n in TRAIN_MIX.items():
        g = pool[pool.source == src]
        parts.append(g if n is None else g.sample(min(n, len(g)), random_state=RNG))
    return pd.concat(parts).sample(frac=1, random_state=RNG)


def load_urls() -> pd.DataFrame:
    pt = pd.read_csv(RAW / "phishtank_online_valid.csv")
    pt = pd.DataFrame({"url": pt.url, "label": 1, "source": "phishtank"})
    bn = pd.read_csv(RAW / "benign_urls.csv", header=None, names=["url"]).assign(label=0, source="iscx_benign")
    fz = pd.read_csv(RAW / "faizann_urls.csv")
    fz = pd.DataFrame({"url": fz[fz.label == "good"].url, "label": 0, "source": "dmoz_benign"})
    u = pd.concat([pt, bn, fz], ignore_index=True).dropna()
    u["url"] = u.url.str.replace(r"(?i)^[a-z]+://", "", regex=True)
    u = u.drop_duplicates("url")
    u = u.sample(frac=1, random_state=RNG)
    u = u.groupby("label").head(60000)
    u["registered_domain"] = u.url.map(lambda x: url_struct(x)["registered_domain"])
    u = u.groupby(["label", "registered_domain"]).head(5)
    ph, be = u[u.label == 1], u[u.label == 0]
    n = min(len(ph), len(be))
    u = pd.concat([ph.sample(n, random_state=RNG), be.sample(n, random_state=RNG)])
    return u.sample(frac=1, random_state=RNG).reset_index(drop=True)


if __name__ == "__main__":
    pool = load_emails()
    pool.to_pickle(OUT / "email_pool.pkl")
    tr = corpus(pool)
    tr.to_pickle(OUT / "email_corpus_v2.pkl")
    print("pool:\n", pool.groupby(["source", "label"]).size())
    print("training corpus v2:\n", tr.groupby(["source", "label"]).size(), "\ntotal", len(tr), "phish share", round(tr.label.mean(), 3))
    urls = load_urls()
    urls.to_pickle(OUT / "urls_balanced.pkl")
    print("URL corpus:\n", urls.groupby(["source", "label"]).size(), "\nunique domains:", urls.registered_domain.nunique())
    (OUT / "build_summary.json").write_text(json.dumps({
        "pool": pool.groupby("source").size().to_dict(),
        "train_corpus": tr.groupby("source").size().to_dict(),
        "urls": urls.groupby("source").size().to_dict()}, indent=2))
