"""End-to-end test of the v3 browser extension in Chromium, on mock email pages (no real inbox, no network).

Checks:
  * a known site that isn't allowed yet shows the "asks first" screen and reads nothing on its own
  * "Check just this email" works once without allowing the site
  * after "Allow", each opened email is checked automatically and the toolbar badge shows the result
  * switching emails updates the badge; with no email open the badge is cleared
  * opening a scam email drops the CampusGuard popup down from the icon by itself (once per email);
    safe emails do not; a tab in the background gets the small backup alert on the page instead
  * the popup is one compact card that fits without scrolling
  * turning a site off stops the checks; removing it removes it from Settings
  * an unknown webmail is recognised on click and offers "Always check emails on this site?"
  * pages that are not email (a news article, a blog with Reply buttons) are not read
  * the extension makes no network requests

Chrome can't click its own permission prompt in a test, so this test loads a copy of the extension that
already has browser access to every site. CampusGuard still treats a site as allowed only after the user
chooses Allow in its drop-down, so the consent flow is exercised the same way.

    CG_CHROMIUM=/path/to/chrome xvfb-run python3 tests/extension_test.py [screenshot_dir]
"""
import asyncio, json, os, shutil, sys, tempfile
from pathlib import Path
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[1]
FIX = ROOT / "tests" / "fixtures" / "mail"
OUT = Path(sys.argv[1] if len(sys.argv) > 1 else tempfile.mkdtemp())
OUT.mkdir(parents=True, exist_ok=True)
SITES = {
    "https://mail.google.com/": "gmail.html",
    "https://outlook.live.com/": "outlook.html",
    "https://webmail.campusmail.test/": "webmail.html",
    "https://news.example.test/": "news.html",
    "https://blog.example.test/": "blog.html",
}
results = []


def check(name, ok, detail=""):
    results.append((name, bool(ok)))
    print(("PASS " if ok else "FAIL ") + name + (f"  ({detail})" if detail else ""))


async def main():
    ext = Path(tempfile.mkdtemp()) / "ext"
    shutil.copytree(ROOT / "extension", ext)
    m = json.loads((ext / "manifest.json").read_text())
    m["host_permissions"] = ["<all_urls>"]            # test-only, see the note above
    (ext / "manifest.json").write_text(json.dumps(m))

    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context(
            tempfile.mkdtemp(), headless=False, executable_path=os.environ.get("CG_CHROMIUM") or None,
            args=["--no-first-run", f"--disable-extensions-except={ext}", f"--load-extension={ext}"])
        outside = []

        async def serve(route):
            u = route.request.url
            for base, f in SITES.items():
                if u.startswith(base):
                    return await route.fulfill(status=200, content_type="text/html", body=(FIX / f).read_text())
            outside.append(u)
            await route.abort()
        await ctx.route(lambda u: u.startswith("http"), serve)

        sw = ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event("serviceworker")
        ext_id = sw.url.split("/")[2]
        errs = []

        async def tab_id(prefix):
            return await sw.evaluate("p => chrome.tabs.query({}).then(t => t.find(x => (x.url||'').startsWith(p)).id)", prefix)

        async def badge(tid):
            return await sw.evaluate("id => chrome.action.getBadgeText({tabId: id})", tid)

        async def popups():
            return await sw.evaluate("chrome.runtime.getContexts({contextTypes: ['POPUP']}).then(c => c.length)")

        async def popup_height():
            pg = await popup(gid)
            h = await pg.evaluate("document.body.scrollHeight")
            await pg.screenshot(path=str(OUT / "2b-compact-card.png"), clip={"x": 0, "y": 0, "width": 340, "height": h})
            await pg.close()
            return h

        async def popup(tid, size=(340, 600)):
            pg = await ctx.new_page(); pg.on("pageerror", lambda e: errs.append(str(e)))
            await pg.set_viewport_size({"width": size[0], "height": size[1]})
            await pg.goto(f"chrome-extension://{ext_id}/popup.html?tab={tid}")
            await pg.wait_for_timeout(700)
            return pg

        async def open_page(url):
            pg = await ctx.new_page(); pg.on("pageerror", lambda e: errs.append(str(e)))
            await pg.set_viewport_size({"width": 1200, "height": 760})
            await pg.goto(url); await pg.wait_for_timeout(800)
            return pg

        # ---------------------------------------------------------- Gmail, not allowed yet
        g = await open_page("https://mail.google.com/mail/u/0/#inbox/phish")
        gid = await tab_id("https://mail.google.com/")
        check("not allowed: no badge, nothing read", await badge(gid) == "" and await g.locator(".cg-holder").count() == 0)
        pop = await popup(gid)
        check("not allowed: asks first", "Check emails on Gmail?" in await pop.inner_text("#v-main"))
        await pop.screenshot(path=str(OUT / "1-consent.png"))
        await pop.click("#once"); await pop.wait_for_timeout(700)
        check("check just this email (once)", await pop.inner_text(".res .vt b") == "High Risk", await pop.inner_text(".res .vt b"))
        await pop.screenshot(path=str(OUT / "2-once-result.png"), full_page=True)
        st = await sw.evaluate("chrome.storage.local.get(null)")
        check("once: site not added", "https://mail.google.com" not in st.get("sites", {}))
        await pop.close()

        # ---------------------------------------------------------- allow Gmail
        pop = await popup(gid)
        await pop.click("#allow"); await pop.wait_for_timeout(1500)
        check("after Allow: result in drop-down", (await pop.locator(".res").count()) and await pop.inner_text(".res .vt b") == "High Risk")
        await pop.close()
        await g.reload(); await g.wait_for_timeout(1500)
        check("auto-check: badge shows high", await badge(gid) == "!", await badge(gid))
        title = await sw.evaluate("id => chrome.action.getTitle({tabId: id})", gid)
        check("hover title has verdict and score", "High Risk" in title and "/100" in title, title)
        check("in-page card off by default", await g.locator(".cg-holder").count() == 0)
        await g.evaluate("location.hash = '#inbox/legit'"); await g.wait_for_timeout(1500)
        check("next email: badge shows OK", await badge(gid) == "OK", await badge(gid))
        await g.evaluate("location.hash = '#inbox'"); await g.wait_for_timeout(1500)
        check("no email open: badge cleared", await badge(gid) == "", await badge(gid))

        # ---------------------------------------------------------- settings: in-page card, auto-check, site switch
        pop = await popup(gid)
        await pop.click("#gear"); await pop.wait_for_timeout(300)
        check("settings lists Gmail", "mail.google.com" in await pop.inner_text("#s-sites"))
        await pop.screenshot(path=str(OUT / "3-settings.png"))
        check("settings fits without scrolling", await pop.evaluate("document.body.scrollHeight <= 600"))
        await pop.close()
        # opening a scam email drops the popup down by itself; a safe one doesn't
        await g.bring_to_front()
        await g.evaluate("location.hash = '#inbox/phish'"); await g.wait_for_timeout(1800)
        check("scam email: popup opened by itself", await popups() == 1, str(await popups()))
        check("popup fits without scrolling", await popup_height() <= 600, str(await popup_height()))
        await g.evaluate("location.hash = '#inbox/legit'"); await g.wait_for_timeout(1500)
        check("safe email: no popup", await popups() == 0, str(await popups()))
        log = await sw.evaluate("chrome.storage.session.get('cgLog').then(x => x.cgLog || [])")
        check("each email checked once (log)", len(log) >= 2 and log[0]["level"] == "low" and log[1]["level"] == "high", str([(x["level"], x["alert"]) for x in log[:3]]))
        check("check log says the drop-down opened", log[1]["alert"] == "drop-down opened", log[1]["alert"])
        # a scam opened in a background tab gets the backup alert on the page
        g2 = await open_page("https://mail.google.com/mail/u/0/#inbox")
        await g.bring_to_front()
        await g2.evaluate("location.hash = '#inbox/phish'"); await g2.wait_for_timeout(1800)
        alert = await g2.evaluate("(() => { const h = document.querySelector('.cg-holder'); return h ? h.shadowRoot.querySelector('.vt b').textContent : null; })()")
        check("background tab: backup alert on the page", alert == "High Risk", str(alert))
        await g2.screenshot(path=str(OUT / "4-backup-alert.png"))
        await g2.close()
        pop = await popup(gid)
        await pop.click("#gear"); await pop.wait_for_timeout(300)
        await pop.click("#s-sites [data-site]"); await pop.wait_for_timeout(1200)
        await g.evaluate("location.hash = '#inbox/legit'"); await g.wait_for_timeout(1500)
        check("site switched off: no check", await badge(gid) == "", await badge(gid))
        await pop.click("#s-sites [data-site]"); await pop.wait_for_timeout(1500)
        await g.reload(); await g.wait_for_timeout(1500)
        check("site back on: checks again", await badge(gid) == "OK", await badge(gid))
        await pop.close()

        # ---------------------------------------------------------- Outlook (known site) after allowing
        o = await open_page("https://outlook.live.com/mail/0/")
        oid = await tab_id("https://outlook.live.com/")
        pop = await popup(oid)
        await pop.click("#allow"); await pop.wait_for_timeout(1500)
        check("Outlook: gift-card scam flagged", await pop.inner_text(".res .vt b") == "High Risk")
        await pop.screenshot(path=str(OUT / "5-outlook.png"), full_page=True)
        await pop.close()
        await o.wait_for_timeout(1200)
        check("Outlook: badge set without reload", await badge(oid) == "!", await badge(oid))

        # ---------------------------------------------------------- unknown webmail, checked on click
        w = await open_page("https://webmail.campusmail.test/?_task=mail&_uid=12")
        wid = await tab_id("https://webmail.campusmail.test/")
        pop = await popup(wid)
        txt = await pop.inner_text("#v-main")
        check("unknown webmail recognised on click", (await pop.locator(".res").count()) and await pop.inner_text(".res .vt b") == "High Risk", txt[:80])
        check("offers Always check this site", "Always check emails on webmail.campusmail.test?" in txt)
        check("generic reader found sender", "micros0ft-office365.com" in txt)
        await pop.screenshot(path=str(OUT / "6-unknown-webmail.png"), full_page=True)
        await pop.click("#always-yes"); await pop.wait_for_timeout(1200)
        await pop.close()
        await w.reload(); await w.wait_for_timeout(1500)
        check("after Always: auto-checked", await badge(wid) == "!", await badge(wid))

        # ---------------------------------------------------------- pages that are not email
        for url, label in (("https://news.example.test/2026/park", "news article"), ("https://blog.example.test/study-tips", "blog with Reply buttons")):
            n = await open_page(url)
            pop = await popup(await tab_id(url.split("/2026")[0].split("/study")[0] + "/"))
            check(f"not email: {label}", "doesn't look like an email" in await pop.inner_text("#v-main"))
            if label == "news article":
                await pop.screenshot(path=str(OUT / "7-not-email.png"), full_page=True)
            await pop.close(); await n.close()

        # ---------------------------------------------------------- remove a site
        pop = await popup(gid)
        await pop.click("#gear"); await pop.wait_for_timeout(300)
        await pop.click('[data-remove="https://mail.google.com"]'); await pop.wait_for_timeout(800)
        check("remove site", "mail.google.com" not in await pop.inner_text("#s-sites"))
        reg = await sw.evaluate("chrome.scripting.getRegisteredContentScripts().then(r => r.map(x => x.matches))")
        check("reader no longer registered for Gmail", not any("https://mail.google.com/*" in m for m in reg), str(reg))
        await pop.close()

        # ---------------------------------------------------------- paste tab and report page
        pop = await popup(gid)
        await pop.click("#other")
        await pop.fill("#text", "Hey it's Jay, I got locked out and they sent the 6 digit code to your number by mistake. Can you text it to me real quick?")
        await pop.click("#check"); await pop.wait_for_timeout(500)
        check("paste tab works", await pop.inner_text("#paste-out .res .vt b") == "High Risk")
        await pop.click("#paste-out [data-full]"); await pop.wait_for_timeout(1200)
        rp = [x for x in ctx.pages if "report.html" in x.url]
        check("full report opens", rp and await rp[0].locator(".flag").count() > 0)

        check("no network requests outside the mock pages", not outside, str(outside[:3]))
        check("no page errors", not errs, str(errs[:3]))
        await ctx.close()

    bad = [n for n, ok in results if not ok]
    print(f"\n{len(results) - len(bad)}/{len(results)} passed. Screenshots in {OUT}")
    sys.exit(1 if bad else 0)


asyncio.run(main())
