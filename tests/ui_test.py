import asyncio, sys
from playwright.async_api import async_playwright
OUT = sys.argv[1] if len(sys.argv) > 1 else "/tmp/claude-0/shots"
URL = sys.argv[2] if len(sys.argv) > 2 else "file:///home/claude/campusguard/dist/campusguard.html"
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        errors = []
        for scheme in ["light", "dark"]:
            ctx = await b.new_context(viewport={"width": 1366, "height": 900}, color_scheme=scheme)
            pg = await ctx.new_page()
            pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
            pg.on("pageerror", lambda e: errors.append(str(e)))
            await pg.goto(URL); await pg.wait_for_timeout(1500)
            await pg.screenshot(path=f"{OUT}/desk_{scheme}.png", full_page=False)
            if scheme == "light":
                await pg.screenshot(path=f"{OUT}/desk_full.png", full_page=True)
                # legit sample
                await pg.click("text=Real Canvas notice"); await pg.wait_for_timeout(900)
                await pg.screenshot(path=f"{OUT}/legit.png")
                await pg.click("text=Lookalike link"); await pg.wait_for_timeout(900)
                await pg.screenshot(path=f"{OUT}/url.png")
                # typing live
                await pg.click("#tab-msg"); await pg.fill("#sender", ""); await pg.fill("#content", "hey can you send me the 6 digit code that just went to your phone? I got locked out of my account")
                await pg.wait_for_timeout(700)
                v = await pg.inner_text(".verdict-pill"); print("typed verdict:", v)
                # explainer on sample 0
                await pg.click("text=Fake financial aid"); await pg.wait_for_timeout(500)
                await pg.click("#explain-btn"); await pg.wait_for_timeout(300)
                await pg.click("#xp-play")  # pause
                for k in range(9):
                    await pg.wait_for_timeout(5500 if k in (6,) else 3800)
                    await pg.screenshot(path=f"{OUT}/xp_{k+1}.png")
                    await pg.click("#xp-next")
                await pg.keyboard.press("Escape")
                # quiz
                await pg.click("#g-scam"); await pg.wait_for_timeout(500)
                await pg.locator("#quiz").screenshot(path=f"{OUT}/quiz.png")
            await ctx.close()
        ctx = await b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True)
        pg = await ctx.new_page(); pg.on("pageerror", lambda e: errors.append(str(e)))
        await pg.goto(URL); await pg.wait_for_timeout(1500)
        sw = await pg.evaluate("document.documentElement.scrollWidth")
        print("mobile scrollWidth", sw)
        await pg.screenshot(path=f"{OUT}/mobile.png", full_page=True)
        await pg.click("#explain-btn"); await pg.wait_for_timeout(300); await pg.click("#xp-play")
        for k in range(6): await pg.click("#xp-next")
        await pg.wait_for_timeout(5000); await pg.screenshot(path=f"{OUT}/mobile_xp.png")
        await b.close()
        print("errors:", errors)
asyncio.run(main())
