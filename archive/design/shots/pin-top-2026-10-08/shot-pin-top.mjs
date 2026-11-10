// Pinned top bar shots (Chromium). Local serve.py only; /explain is stubbed.
// usage: node shot-pin-top.mjs <appRoot> <before|after> <outDir> <port> <banksDir>
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { try { pw = require("/home/user/wt-pin-top/tests/node_modules/playwright"); } catch { pw = require("/opt/node22/lib/node_modules/playwright"); } }
const [ROOT, TAG, OUTDIR, PORT, BANKS] = process.argv.slice(2);
const BASE = `http://localhost:${PORT}`;
const ch = (...m) => m.map((md, i) => ({ id: "abcde"[i], md }));
const longQ = n => ({ code: `CALC1_L0${n}`, type: "mc", shuffle: false, correct: "b",
  body: [{ type: "text", md: `Long question ${n}. A 2.0 kg cart rolls at $3.0$ m/s and sticks to a 1.0 kg cart. ` + "The track is level and has no friction at all, so keep going. ".repeat(40) + "How fast do they move after?" }],
  choices: ch("1.0 m/s", "2.0 m/s", "3.0 m/s"), wrong: [{ choice: "a", hint: "QUACK. Total mass." }],
  saccharine: { title: `Practice Exam 2, Question ${n}`, tip: "Momentum before equals after.", key: "Answer: b" } });
mkdirSync(BANKS, { recursive: true }); mkdirSync(OUTDIR, { recursive: true });
writeFileSync(join(BANKS, "BANK_PT12.json"), JSON.stringify({ v: 1, problems: [longQ(1), longQ(2)] }));
const srv = spawn("python3", [join(ROOT, "serve.py"), PORT], { cwd: ROOT, env: { ...process.env, STEM_BANKS: BANKS, STEM_TRIES: join(BANKS, "..", `tries-${TAG}.json`), OPENROUTER_API_KEY: "" }, stdio: "ignore" });
const body = "Momentum is conserved in the sticking collision. Before: 2.0 kg times 3.0 m/s. After: 3.0 kg times v. So v is 2.0 m/s, which is choice b.\n\nCheck: the heavier cart slows the pair.";
const ready = async page => {
  await page.route("**/explain", r => r.fulfill({ contentType: "text/plain", body }));
  await page.goto(BASE + "/#BANK_PT12");
  await page.waitForFunction(() => /^CALC1_L0/.test(document.querySelector("#pcode")?.textContent || "") && !document.querySelector("#qnav").hidden, null, { timeout: 10000 });
  await page.waitForFunction(() => !document.querySelector("#splash") || getComputedStyle(document.querySelector("#splash")).opacity === "0", null, { timeout: 8000 });
  await page.waitForTimeout(800);
};
const rect = page => page.evaluate(() => { const r = document.querySelector(".top").getBoundingClientRect(); return { top: r.top, h: r.height, y: scrollY, max: document.documentElement.scrollHeight - innerHeight }; });
try {
  for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + "/")).ok) break; } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 100)); }
  const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
  try {
    const mk = (w, h, phone) => browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: phone ? 2 : 1, hasTouch: phone, isMobile: phone, serviceWorkers: "block" })
      .then(async c => { await c.addInitScript(() => { try { localStorage.setItem("stem-ob", "done"); } catch { /* */ } }); return c; });
    // 393x852: scrolled down a long question
    let ctx = await mk(393, 852, true), page = await ctx.newPage();
    await ready(page);
    await page.screenshot({ path: join(OUTDIR, `phone-scroll0-${TAG}-393x852.png`) });
    await page.evaluate(() => window.scrollTo(0, 600)); await page.waitForTimeout(500);
    console.log(TAG, "phone scrolled", JSON.stringify(await rect(page)));
    await page.screenshot({ path: join(OUTDIR, `phone-scrolled-${TAG}-393x852.png`) });
    if (TAG === "after") {
      // the list open over the scrolled page: one even dim over the bar too
      await page.click("#qlistBtn");
      await page.waitForFunction(() => getComputedStyle(document.querySelector("#qlDim")).opacity === "1", null, { timeout: 2000 }); await page.waitForTimeout(300);
      await page.screenshot({ path: join(OUTDIR, `phone-list-open-${TAG}-393x852.png`) });
      await page.keyboard.press("Escape"); await page.waitForTimeout(500);
      // the Cluck sheet open over the scrolled page: the sheet is over the bar
      await page.evaluate(() => document.querySelector('#q .opt[data-id="a"]').scrollIntoView({ block: "center" }));
      await page.evaluate(() => { document.querySelector('#q .opt[data-id="a"]').click(); }); await page.waitForTimeout(200);
      await page.evaluate(() => { document.querySelector('#q .ch[data-id="a"] .send').click(); });   // the video corner floats over the choices: click through JS
      await page.waitForSelector("#wish .wchip:not([hidden])", { timeout: 6000 });
      await page.evaluate(() => { document.querySelector("#wish .wchip").click(); });
      await page.waitForFunction(() => /Check: the heavier/.test(document.querySelector("#cluck .wtext")?.textContent || "") && !document.querySelector("#cluck .wtext.wrun"), null, { timeout: 10000 });
      await page.waitForTimeout(500);
      console.log(TAG, "cluck", JSON.stringify(await page.evaluate(() => { const cl = document.querySelector(".cl"), r = cl.getBoundingClientRect(), t = document.querySelector(".top").getBoundingClientRect();
        return { cl: [r.top, r.bottom], bar: [t.top, t.bottom], atBar: document.elementFromPoint(100, 20)?.closest(".cl") ? "sheet" : document.elementFromPoint(100, 20)?.className }; })));
      await page.screenshot({ path: join(OUTDIR, `phone-cluck-open-${TAG}-393x852.png`) });
    }
    await ctx.close();
    // 1280x800 desktop: must not change
    ctx = await mk(1280, 800, false); page = await ctx.newPage();
    await ready(page);
    await page.addStyleTag({ content: "#rot { visibility: hidden !important; }" });   // the video corner's spinners animate: they would show up as a pixel diff that is not layout
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(OUTDIR, `desktop-scroll0-${TAG}-1280x800.png`) });
    await page.evaluate(() => window.scrollTo(0, 600)); await page.waitForTimeout(500);
    console.log(TAG, "desktop scrolled", JSON.stringify(await rect(page)));
    await page.screenshot({ path: join(OUTDIR, `desktop-scrolled-${TAG}-1280x800.png`) });
    await ctx.close();
  } finally { await browser.close(); }
} finally { srv.kill(); }
