import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fastapi.testclient import TestClient
from server.app import app
c = TestClient(app)
h = c.get("/api/health").json(); print("health", h)
r = c.post("/api/analyze", json={"text": "Dear user, your mailbox will be deactivated today. Verify now: http://45.89.127.22/login", "sender": "IT Desk <it@aamu-support.com>"}).json()
assert r["risk_level"] == "high", r; print("analyze", r["verdict"], r["risk_score"], [f["flag"] for f in r["red_flags"]][:4])
r = c.post("/api/analyze", json={"text": "aamu.edu"}).json(); assert r["input_type"] == "url" and r["risk_level"] == "low"; print("url ok")
assert c.post("/api/analyze", json={"text": "x" * 60000}).status_code == 413
assert c.post("/api/explain", json={"verdict": "High Risk", "risk_score": 0.9, "red_flags": []}).status_code == 503
p = c.get("/"); assert p.status_code == 200 and "CampusGuard" in p.text and "Content-Security-Policy" in p.headers
assert c.get("/model/campusguard-model.js").status_code == 200
print("api tests passed")
