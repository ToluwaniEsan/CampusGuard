"""Package the browser extension for Chromium browsers (Chrome, Edge, Brave, Opera) and Firefox."""
import json, shutil, zipfile
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
EXT, DIST = ROOT / "extension", ROOT / "dist"
DIST.mkdir(exist_ok=True)
shutil.copy(ROOT / "web/js/campusguard-engine.js", EXT / "js/campusguard-engine.js")
shutil.copy(ROOT / "web/model/campusguard-model.js", EXT / "model/campusguard-model.js")

def pack(name, manifest):
    with zipfile.ZipFile(DIST / name, "w", zipfile.ZIP_DEFLATED) as z:
        for p in EXT.rglob("*"):
            if p.is_file() and p.name != "manifest.json":
                z.write(p, p.relative_to(EXT))
        z.writestr("manifest.json", json.dumps(manifest, indent=2))
    print("wrote", DIST / name)

m = json.loads((EXT / "manifest.json").read_text())
pack("campusguard-extension-chromium.zip", m)
ff = json.loads(json.dumps(m))
ff["background"] = {"scripts": ["model/campusguard-model.js", "js/campusguard-engine.js", "background.js"]}
ff["browser_specific_settings"] = {"gecko": {"id": "campusguard@team-catalysts", "strict_min_version": "115.0"}}
pack("campusguard-extension-firefox.zip", ff)
