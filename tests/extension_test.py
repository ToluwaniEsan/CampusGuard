"""Loads the unpacked extension in Chromium, tests the popup and the Gmail panel on a mock Gmail page."""
import asyncio, sys, tempfile
from playwright.async_api import async_playwright
EXT = "/home/claude/campusguard/extension"
OUT = sys.argv[1] if len(sys.argv) > 1 else "/tmp/claude-0/ext"
GMAIL = """<html><head><title>Inbox - Gmail</title></head><body style="font-family:Arial;margin:0">
<div style="display:flex"><div style="width:220px;background:#f6f8fc;height:100vh;padding:16px">Inbox<br>Starred<br>Sent</div>
<div style="flex:1;padding:20px"><h2 class="hP">URGENT: Verify Your Financial Aid Information</h2>
<div class="adn ads"><div><span class="gD" email="financialaid@aamu-support.com" name="Alabama A&M University Financial Aid">Alabama A&M University Financial Aid</span></div>
<div class="a3s aiL">Dear Student,<br><br>Your financial aid account requires immediate verification. Click below to prevent your account from being suspended.<br><br>
<a href="http://aamu-support.com/finaid/verify-login">Verify Your Account</a><br><br>Thank you,<br>AAMU Financial Aid Office</div></div>
<hr><div class="adn ads"><div><span class="gD" email="monica.reed@aamu.edu" name="Dr. Monica Reed">Dr. Monica Reed</span></div>
<div class="a3s aiL">Hi Toluwani,<br>Good question. For part B you only need the time complexity analysis. I'll clarify in class Tuesday.<br>Best,<br>Dr. Reed</div></div>
</div></div></body></html>"""
async def main():
    async with async_playwright() as p:
        d = tempfile.mkdtemp()
        ctx = await p.chromium.launch_persistent_context(d, headless=False, executable_path="/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args=["--no-first-run", f"--disable-extensions-except={EXT}", f"--load-extension={EXT}"])
        sw = ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event("serviceworker")
        ext_id = sw.url.split("/")[2]; print("extension id", ext_id)
        errs = []
        # popup
        pg = await ctx.new_page(); pg.on("pageerror", lambda e: errs.append(str(e)))
        await pg.set_viewport_size({"width": 400, "height": 760})
        await pg.goto(f"chrome-extension://{ext_id}/popup.html")
        await pg.fill("#text", "Hey it's Jay, I got locked out and they sent the 6 digit code to your number by mistake. Can you text it to me real quick?")
        await pg.click("#check"); await pg.wait_for_timeout(600)
        print("popup verdict:", await pg.inner_text(".pill"))
        await pg.screenshot(path=f"{OUT}/popup.png", full_page=True)
        # report page
        await pg.click("#full"); await pg.wait_for_timeout(1200)
        rp = [x for x in ctx.pages if "report.html" in x.url][0]
        await rp.set_viewport_size({"width": 900, "height": 900}); await rp.wait_for_timeout(300)
        await rp.screenshot(path=f"{OUT}/report.png", full_page=True)
        print("report has flags:", await rp.locator(".flag").count())
        # mock gmail
        g = await ctx.new_page(); g.on("pageerror", lambda e: errs.append(str(e)))
        await g.set_viewport_size({"width": 1280, "height": 800})
        await g.route("https://mail.google.com/**", lambda r: r.fulfill(status=200, content_type="text/html", body=GMAIL))
        await g.goto("https://mail.google.com/mail/u/0/#inbox/abc")
        await g.wait_for_timeout(2500)
        n = await g.locator(".cg-holder").count(); print("panels injected:", n)
        texts = await g.evaluate("[...document.querySelectorAll('.cg-holder')].map(h => h.shadowRoot.querySelector('.pill') && h.shadowRoot.querySelector('.pill').textContent)")
        print("panel verdicts:", texts)
        await g.screenshot(path=f"{OUT}/gmail.png")
        await ctx.close()
        print("errors:", errs)
asyncio.run(main())
