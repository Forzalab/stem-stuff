// Scratchpad autosave: status timing, per-code draft restore, reduced motion. Needs a running server and Playwright:
//   python3 serve.py 8814 &   then   node tests/autosave.pw.mjs http://localhost:8814 [shotDir]
import { createRequire } from "node:module";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { pw = require("/opt/node22/lib/node_modules/playwright"); }
const BASE = process.argv[2] || "http://localhost:8814";
const SHOTS = process.argv[3] || "";
let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); }
  catch (e) { failures++; console.log("FAIL", name, "\n     ", e.message.slice(0, 600)); }
}
const opened = (page, code) => page.waitForFunction(c => document.querySelector("#pcode")?.textContent === c && !document.querySelector("#freeze").hidden, code, { timeout: 8000 });
const status = page => page.$eval("#xbSave", e => ({ t: e.textContent, c: e.className, anim: getComputedStyle(e).animationName }));

const b = await pw.chromium.launch({ args: ["--no-sandbox"] });
for (const [w, h] of [[390, 844], [1920, 1080]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  await step(`${w} status: nothing, then saving (sweep) at 3 s, saved, gone 2 s later`, async () => {
    await page.goto(BASE + "/#CALC1_X2P"); await opened(page, "CALC1_X2P");
    await page.fill("#scratch", "x = 9");
    const t0 = Date.now();
    await page.waitForTimeout(2000);
    assert.equal((await status(page)).t, "", "quiet while typing");
    await page.type("#scratch", "!");                                // an edit restarts the 3 s
    await page.waitForTimeout(2500);
    assert.equal((await status(page)).t, "", "restarted by the edit");
    await page.waitForFunction(() => document.querySelector("#xbSave").textContent === "saving", null, { timeout: 2000 });
    const s = await status(page);
    assert.equal(s.anim, "xb-sweep");
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/autosave-live-saving-${w}.png` });
    assert.equal(await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith("stem-pad:")).map(k => localStorage[k]).join()), "x = 9!");
    await page.waitForFunction(() => document.querySelector("#xbSave").textContent === "saved", null, { timeout: 2000 });
    const ts = Date.now();
    await page.waitForFunction(() => document.querySelector("#xbSave").textContent === "", null, { timeout: 3000 });
    const dt = Date.now() - ts;
    assert.ok(dt > 1700 && dt < 2600, `saved shown ${dt} ms`);
    assert.ok(Date.now() - t0 > 3000);
  });
  await step(`${w} draft is per code and comes back on reopen`, async () => {
    await page.goto(BASE + "/#CALC1_T6B"); await opened(page, "CALC1_T6B");
    assert.equal(await page.inputValue("#scratch"), "", "other code: empty");
    await page.fill("#scratch", "limit is 12");
    await page.goto(BASE + "/#CALC1_X2P"); await opened(page, "CALC1_X2P");   // left before 3 s: pagehide flushes
    assert.equal(await page.inputValue("#scratch"), "x = 9!");
    await page.goto("about:blank"); await page.goto(BASE + "/#CALC1_T6B"); await opened(page, "CALC1_T6B");
    assert.equal(await page.inputValue("#scratch"), "limit is 12");
    await page.fill("#scratch", "");                                          // emptied: the draft goes
    await page.waitForTimeout(3300);
    assert.equal(await page.evaluate(() => Object.keys(localStorage).filter(k => k.endsWith(":CALC1_T6B")).length), 0);
  });
  await ctx.close();
}
await step("reduced motion: saving is static", async () => {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.goto(BASE + "/#CALC1_X2P"); await opened(page, "CALC1_X2P");
  await page.fill("#scratch", "a");
  await page.waitForFunction(() => document.querySelector("#xbSave").textContent === "saving", null, { timeout: 4000 });
  const s = await page.$eval("#xbSave", e => { const c = getComputedStyle(e); return { a: c.animationName, m: c.maskImage || c.webkitMaskImage }; });
  assert.equal(s.a, "none"); assert.equal(s.m, "none");
  await ctx.close();
});
await b.close();
console.log(failures ? `${failures} failed` : "all ok");
process.exit(failures ? 1 : 0);
