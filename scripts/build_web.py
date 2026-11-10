"""Bundle the web app into self-contained HTML files.

dist/campusguard_home.html          main page (v2.3). Light: the screenshot reader lives in
                                    dist/ocr-bundle.js and is fetched only when an image is added.
dist/ocr-bundle.js                  the screenshot reader (Tesseract.js + English data), loaded on demand
dist/campusguard_home_offline.html  main page with everything inside one file (works with no network
                                    and from a double-click; for demos)
dist/preview_artifact.html          same as the offline file without <html>/<head>/<body> (claude.ai hosting)
dist/campusguard.html, artifact.html  the original two-column page with the quiz
"""
import base64
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web"
DIST = ROOT / "dist"
DIST.mkdir(exist_ok=True)

FONTS = ('<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@500;700'
         '&family=Mukta:wght@400;500;600&family=Prompt:wght@500;600&display=swap">')
HEAD_META = ("<!doctype html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n"
             "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1, viewport-fit=cover\">\n")


def scripts(paths):
    return "".join(f"<script>\n{(WEB / p).read_text()}\n</script>\n" for p in paths)


def ocr_parts():
    """(tesseract library, boot function, base64 English data) or None when not vendored."""
    ocr = WEB / "vendor" / "ocr"
    if not ocr.exists():
        return None
    # one function holding the OCR core + worker code. home.js starts it either in a real
    # worker or, where the host forbids workers, inside the page itself.
    boot = ("window.__cgOcrBoot=function(self,globalThis,window,postMessage,addEventListener,importScripts){\n"
            + (ocr / "tesseract-core-lstm.wasm.js").read_text() + "\n;self.TesseractCore=TesseractCore;\n"
            + (ocr / "worker.min.js").read_text() + "\n};")
    return (ocr / "tesseract.min.js").read_text(), boot, base64.b64encode((ocr / "eng.traineddata.gz").read_bytes()).decode()


def main():
    # ---------------- original page
    html = (WEB / "index.html").read_text()
    body = html.split("<!--CG:BODY-START-->")[1].split("<!--CG:BODY-END-->")[0]
    css = (WEB / "css" / "app.css").read_text()
    sc = scripts(["model/campusguard-model.js", "js/campusguard-engine.js", "js/explainer.js", "js/app.js"])
    head = f"<title>CampusGuard</title>\n{FONTS}\n<style>\n{css}\n</style>\n"
    (DIST / "artifact.html").write_text(head + body + sc)
    (DIST / "campusguard.html").write_text(HEAD_META + head + "</head>\n<body>\n" + body + sc + "</body>\n</html>\n")

    # ---------------- home page (v2.3)
    hbody = (WEB / "home.html").read_text().split("<!--CG:BODY-START-->")[1].split("<!--CG:BODY-END-->")[0]
    app = scripts(["model/campusguard-model.js", "js/campusguard-engine.js", "js/campusguard-intake.js",
                   "js/journey.js", "js/practice.js", "js/home.js"])
    style = f"<style>\n{(WEB / 'css' / 'home.css').read_text()}\n{(WEB / 'css' / 'journey.css').read_text()}\n</style>\n"
    hhead = f"<title>CampusGuard</title>\n{FONTS}\n{style}"
    parts = ocr_parts()
    inline_ocr = ""
    if parts:
        lib, boot, lang = parts
        # light page: reader in a separate file, fetched on first image
        (DIST / "ocr-bundle.js").write_text(lib + "\n;\n" + boot + "\n;window.__cgOcrLang=\"" + lang + "\";\n")
        inline_ocr = ("<script>\n" + lib + "\n</script>\n<script>\n" + boot + "\n</script>\n"
                      '<script type="text/plain" id="ocr-lang">' + lang + "</script>\n")
    light = HEAD_META + '<meta name="cg-ocr" content="ocr-bundle.js">\n' + hhead + "</head>\n<body>\n" + hbody + app + "</body>\n</html>\n"
    (DIST / "campusguard_home.html").write_text(light)
    offline_inner = hhead + hbody + inline_ocr + app
    (DIST / "campusguard_home_offline.html").write_text(HEAD_META + hhead + "</head>\n<body>\n" + hbody + inline_ocr + app + "</body>\n</html>\n")
    (DIST / "preview_artifact.html").write_text(offline_inner)
    for f in ("campusguard_home.html", "ocr-bundle.js", "campusguard_home_offline.html", "campusguard.html"):
        if (DIST / f).exists():
            print(f"dist/{f:<32} {(DIST / f).stat().st_size / 1e6:.2f} MB")


if __name__ == "__main__":
    main()
