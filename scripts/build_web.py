"""Bundle the web app into single self-contained HTML files.

dist/campusguard.html   full document; double-click to open offline, or host anywhere
dist/artifact.html      same page without <html>/<head>/<body> (for claude.ai Artifact hosting)
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web"
DIST = ROOT / "dist"
DIST.mkdir(exist_ok=True)

FONTS = ('<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@500;700'
         '&family=Mukta:wght@400;500;600&family=Prompt:wght@500;600&display=swap">')


def main():
    html = (WEB / "index.html").read_text()
    body = html.split("<!--CG:BODY-START-->")[1].split("<!--CG:BODY-END-->")[0]
    css = (WEB / "css" / "app.css").read_text()
    scripts = "".join(f"<script>\n{(WEB / p).read_text()}\n</script>\n" for p in
                      ["model/campusguard-model.js", "js/campusguard-engine.js", "js/explainer.js", "js/app.js"])
    scripts = scripts.replace("</script>\n<script>", "</script>\n<script>")
    head = f"<title>CampusGuard</title>\n{FONTS}\n<style>\n{css}\n</style>\n"
    artifact = head + body + scripts
    (DIST / "artifact.html").write_text(artifact)
    full = ("<!doctype html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n"
            "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1, viewport-fit=cover\">\n"
            + head + "</head>\n<body>\n" + body + scripts + "</body>\n</html>\n")
    (DIST / "campusguard.html").write_text(full)
    # new home page (design review): single take-all box, intake, screenshot OCR, theme toggle
    if (WEB / "home.html").exists():
        import base64
        hbody = (WEB / "home.html").read_text().split("<!--CG:BODY-START-->")[1].split("<!--CG:BODY-END-->")[0]
        ocr = WEB / "vendor" / "ocr"
        ocr_html = ""
        if ocr.exists():   # Tesseract.js, bundled so screenshots are read on the device (Apache-2.0)
            # one function holding the OCR core + worker code. home.js starts it either in a real
            # worker or, where the host forbids workers, inside the page itself.
            boot = ("window.__cgOcrBoot=function(self,globalThis,window,postMessage,addEventListener,importScripts){\n"
                    + (ocr / "tesseract-core-lstm.wasm.js").read_text() + "\n;self.TesseractCore=TesseractCore;\n"
                    + (ocr / "worker.min.js").read_text() + "\n};")
            ocr_html = ("<script>\n" + (ocr / "tesseract.min.js").read_text() + "\n</script>\n"
                        "<script>\n" + boot + "\n</script>\n"
                        '<script type="text/plain" id="ocr-lang">' + base64.b64encode((ocr / "eng.traineddata.gz").read_bytes()).decode() + "</script>\n")
        hscripts = ocr_html + "".join(f"<script>\n{(WEB / p).read_text()}\n</script>\n" for p in
                                      ["model/campusguard-model.js", "js/campusguard-engine.js", "js/campusguard-intake.js", "js/journey.js", "js/home.js"])
        hhead = f"<title>CampusGuard Layout Preview</title>\n{FONTS}\n<style>\n{(WEB / 'css' / 'home.css').read_text()}\n{(WEB / 'css' / 'journey.css').read_text()}\n</style>\n"
        (DIST / "preview_artifact.html").write_text(hhead + hbody + hscripts)
        (DIST / "campusguard_home.html").write_text(
            "<!doctype html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n"
            "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1, viewport-fit=cover\">\n"
            + hhead + "</head>\n<body>\n" + hbody + hscripts + "</body>\n</html>\n")
        print(f"dist/campusguard_home.html {len(hhead + hbody + hscripts)/1e6:.2f} MB")
    print(f"dist/artifact.html {len(artifact)/1e6:.2f} MB, dist/campusguard.html {len(full)/1e6:.2f} MB")


if __name__ == "__main__":
    main()
