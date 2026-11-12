"""Records a screen video of the CampusGuard extension in a real Chromium window, using the dummy inbox
in tests/fixtures/mail/demo-inbox.html (no real email, no network).

Needs Linux with Xvfb, ffmpeg and xdotool. The whole screen is recorded, so the toolbar icon and the
drop-down are visible, and the real mouse pointer is moved and clicked.

    CG_CHROMIUM=/path/to/chrome python3 tests/record_demo.py out_dir [--probe]

--probe only opens the window and saves a screenshot (to find the toolbar icon's position).
"""
import asyncio, hashlib, json, os, shutil, subprocess, sys, tempfile, time
from pathlib import Path
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = Path(sys.argv[1]); OUT.mkdir(parents=True, exist_ok=True)
PROBE = "--probe" in sys.argv
W, H, DISP = 1280, 800, ":99"
SITE = "https://mail.catalysts-demo.test"
ICON = tuple(int(v) for v in os.environ.get("CG_ICON", "1186,62").split(","))   # toolbar icon, found with --probe


def ext_id(path):  # how Chrome names an unpacked extension
    return "".join(chr(ord("a") + int(c, 16)) for c in hashlib.sha256(str(path).encode()).hexdigest()[:32])


def xdo(*a):
    subprocess.run(["xdotool", *map(str, a)], env={**os.environ, "DISPLAY": DISP}, check=False)


def glide(x, y, steps=18, dur=0.45):
    out = subprocess.run(["xdotool", "getmouselocation", "--shell"], env={**os.environ, "DISPLAY": DISP}, capture_output=True, text=True).stdout
    cur = dict(l.split("=") for l in out.split() if "=" in l)
    x0, y0 = int(cur.get("X", 640)), int(cur.get("Y", 400))
    for i in range(1, steps + 1):
        t = i / steps; t = t * t * (3 - 2 * t)
        xdo("mousemove", round(x0 + (x - x0) * t), round(y0 + (y - y0) * t)); time.sleep(dur / steps)


def click(x, y):
    glide(x, y); time.sleep(0.15); xdo("click", 1)


async def main():
    work = Path(tempfile.mkdtemp())
    ext = work / "ext"
    shutil.copytree(ROOT / "extension", ext)
    m = json.loads((ext / "manifest.json").read_text())
    m["host_permissions"] = ["<all_urls>"]      # skips Chrome's own permission prompt, which a script can't click
    (ext / "manifest.json").write_text(json.dumps(m))
    prof = work / "profile"; (prof / "Default").mkdir(parents=True)
    (prof / "Default" / "Preferences").write_text(json.dumps({"extensions": {"pinned_extensions": [ext_id(ext)]}}))

    xvfb = subprocess.Popen(["Xvfb", DISP, "-screen", "0", f"{W}x{H}x24", "-nolisten", "tcp"])
    time.sleep(1.2)
    os.environ["DISPLAY"] = DISP
    rec = None
    try:
        async with async_playwright() as p:
            ctx = await p.chromium.launch_persistent_context(
                str(prof), headless=False, executable_path=os.environ.get("CG_CHROMIUM") or None, no_viewport=True,
                args=["--no-first-run", "--window-position=0,0", f"--window-size={W},{H}", "--hide-crash-restore-bubble",
                      f"--disable-extensions-except={ext}", f"--load-extension={ext}"])
            inbox = (ROOT / "tests/fixtures/mail/demo-inbox.html").read_text()
            await ctx.route(lambda u: u.startswith("http"), lambda r: r.fulfill(status=200, content_type="text/html", body=inbox) if r.request.url.startswith(SITE) else r.abort())
            sw = ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event("serviceworker")
            # the site was allowed once beforehand (in real use: click the icon → Allow on this site)
            await asyncio.sleep(2.5)                     # let the first-run setup finish
            await sw.evaluate("o => chrome.storage.local.set({ sites: { [o]: { enabled: true } } })", SITE)
            await asyncio.sleep(1.5)
            assert SITE in json.dumps(await sw.evaluate("chrome.storage.local.get('sites')")), "site not allowed"
            pg = ctx.pages[0] if ctx.pages else await ctx.new_page()
            await pg.goto(SITE + "/mail/inbox"); await asyncio.sleep(1.5)
            if PROBE:
                subprocess.run(["import", "-window", "root", str(OUT / "probe.png")]); await ctx.close(); return
            top = await pg.evaluate("window.outerHeight - window.innerHeight")

            async def at(sel):
                b = await pg.locator(sel).bounding_box()
                return round(b["x"] + b["width"] / 2), round(top + b["y"] + b["height"] / 2)

            async def shot(name):
                subprocess.run(["import", "-window", "root", str(OUT / name)])

            rec = subprocess.Popen(["ffmpeg", "-y", "-loglevel", "error", "-f", "x11grab", "-draw_mouse", "1", "-video_size", f"{W}x{H}", "-framerate", "25",
                                    "-i", DISP, "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", str(OUT / "campusguard-demo.mp4")], stdin=subprocess.PIPE)
            await asyncio.sleep(1.5)
            glide(700, 420); await asyncio.sleep(1.5)
            # 1. a scam: the drop-down opens from the icon by itself
            click(*await at('.row[data-id="finaid"]')); await asyncio.sleep(2.2); await shot("1-scam-alert.png"); await asyncio.sleep(4)
            click(*await at(".message-body")); await asyncio.sleep(1.5)     # click the page to close it
            # 2. suspicious: drops down, fades after 8 seconds
            click(*await at('.row[data-id="rewards"]')); await asyncio.sleep(2.2); await shot("2-suspicious-alert.png"); glide(700, 600); await asyncio.sleep(8.5)
            # 3. a normal email: green OK on the icon, no pop-up
            click(*await at('.row[data-id="reed"]')); await asyncio.sleep(1.5)
            glide(*ICON); await asyncio.sleep(1.8); await shot("3-safe-badge.png")
            # 4. click the icon to see the result, then the gear for settings
            xdo("click", 1); await asyncio.sleep(2.5); await shot("4-safe-clicked.png")
            gx, gy = int(os.environ.get("CG_GEAR", "0").split(",")[0]), int((os.environ.get("CG_GEAR", "0,0").split(",") + ["0"])[1])
            if gx: click(gx, gy); await asyncio.sleep(3); await shot("5-settings.png")
            xdo("key", "Escape"); await asyncio.sleep(1.2)
            await ctx.close()
    finally:
        if rec:
            rec.stdin.write(b"q"); rec.stdin.flush(); rec.wait(timeout=20)
        xvfb.terminate()
    print("saved", OUT / "campusguard-demo.mp4")


asyncio.run(main())
