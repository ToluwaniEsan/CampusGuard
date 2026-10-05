"""CampusGuard API + web host (FastAPI).

  GET  /              the paste & check web app (static files from web/)
  GET  /api/health    status, model version, whether the optional AI explanation is enabled
  POST /api/analyze   {"text": "...", "sender": "optional"} -> verdict, flags, highlights, links
  POST /api/explain   {"verdict", "risk_score", "red_flags"} -> friendly LLM explanation (optional)

Privacy by design (deck: "No accounts. Nothing stored."):
  * no database, no request-body logging; message text lives only in memory for one request
  * links are parsed as strings and never fetched
  * /api/explain sends the red-flag labels to the LLM, never the message itself
  * serve behind HTTPS (any PaaS such as Render/Fly/Railway terminates TLS for you)

Run:  uvicorn server.app:app --host 0.0.0.0 --port 8000
"""
from __future__ import annotations

import json
import logging
import os
import sys
import time
import urllib.request
from collections import defaultdict, deque
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from campusguard.predict import CampusGuard, llm_prompt  # noqa: E402

logging.getLogger("uvicorn.access").disabled = True   # access logs would include client IPs/paths only, but keep it quiet
log = logging.getLogger("campusguard")

MAX_CHARS = 50_000
RATE_PER_MIN = int(os.getenv("CG_RATE_PER_MIN", "120"))
LLM_MODEL = os.getenv("CG_LLM_MODEL", "claude-haiku-4-5")
ANTHROPIC_KEY = os.getenv("ANTHROPIC_API_KEY", "")

guard = CampusGuard()
app = FastAPI(title="CampusGuard", version=guard.version, docs_url="/api/docs", redoc_url=None)
_hits: dict[str, deque] = defaultdict(deque)


class AnalyzeIn(BaseModel):
    text: str = Field(..., description="Pasted message or link")
    sender: str | None = Field(None, description="Optional From line, e.g. 'IT Help Desk <it@aamu-support.com>'")


class FlagIn(BaseModel):
    label: str
    evidence: list[str] = []


class ExplainIn(BaseModel):
    verdict: str
    risk_score: float
    red_flags: list[FlagIn] = []


@app.middleware("http")
async def headers_and_rate_limit(request: Request, call_next):
    if request.url.path.startswith("/api/") and request.method == "POST":
        ip = request.client.host if request.client else "?"
        q, now = _hits[ip], time.time()
        while q and now - q[0] > 60:
            q.popleft()
        if len(q) >= RATE_PER_MIN:
            return JSONResponse({"detail": "Too many checks in a minute. Wait a moment and try again."}, status_code=429)
        q.append(now)
    resp = await call_next(request)
    resp.headers["X-Content-Type-Options"] = "nosniff"
    resp.headers["Referrer-Policy"] = "no-referrer"
    resp.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    resp.headers["Content-Security-Policy"] = (
        "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com 'unsafe-inline'; "
        "font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'")
    if request.url.path.startswith("/api/"):
        resp.headers["Cache-Control"] = "no-store"
    return resp


@app.get("/api/health")
def health():
    return {"status": "ok", "model_version": guard.version, "llm": bool(ANTHROPIC_KEY),
            "threshold": guard.threshold, "high_threshold": guard.high_threshold}


@app.post("/api/analyze")
def analyze(body: AnalyzeIn):
    if len(body.text) > MAX_CHARS:
        raise HTTPException(413, f"That's longer than {MAX_CHARS:,} characters. Paste just the message body.")
    return guard.analyze(body.text, body.sender)


@app.post("/api/explain")
def explain(body: ExplainIn):
    result = {"verdict": body.verdict, "risk_score": body.risk_score,
              "red_flags": [{"label": f.label, "evidence": f.evidence[:3]} for f in body.red_flags[:6]]}
    if not ANTHROPIC_KEY:
        raise HTTPException(503, "AI explanations are not enabled on this server.")
    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=json.dumps({"model": LLM_MODEL, "max_tokens": 220,
                         "messages": [{"role": "user", "content": llm_prompt(result)}]}).encode(),
        headers={"x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=8) as r:
            data = json.loads(r.read())
        text = "".join(b.get("text", "") for b in data.get("content", []) if b.get("type") == "text").strip()
        return {"explanation": text or None, "model": LLM_MODEL}
    except Exception as e:  # never fail the user experience over the optional layer
        log.warning("LLM explanation failed: %s", type(e).__name__)
        raise HTTPException(502, "The AI explanation is unavailable right now.")


WEB = ROOT / "web"
app.mount("/css", StaticFiles(directory=WEB / "css"), name="css")
app.mount("/js", StaticFiles(directory=WEB / "js"), name="js")
app.mount("/model", StaticFiles(directory=WEB / "model"), name="model")


@app.get("/")
def index():
    return FileResponse(WEB / "index.html")
