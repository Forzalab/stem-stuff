// D6 (Oct 7): a browser still carrying the old stem-mode=diet|hard cookie (no stem-mode-v=2 flag) opens in sugar, once, with no
// message; its progress (localStorage) stays. After that, DIET_<code> opts into diet and sticks across reloads (mode.mjs, serve.py mode_of).
//   node tests/mode-reset.pw.mjs [base]      (a running serve.py)
import { createRequire } from "node:module";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { pw = require("/opt/node22/lib/node_modules/playwright"); }

const BASE = (process.argv[2] || "http://localhost:8812").replace(/\/$/, "") + "/";
let fails = 0;
const step = async (name, fn) => { try { await fn(); console.log("ok   " + name); } catch (e) { fails++; console.log("FAIL " + name + ": " + e.message); } };
const browser = await pw.chromium.launch();
async function showCode(page) {
  for (const s of ["#qlistBtn", "#codeChip", "#barTab"]) { if (await page.isVisible("#code")) return; if (await page.isVisible(s)) await page.click(s); }
}
const sugarOn = page => page.evaluate(async () => (await import("./mode.mjs")).modeOf() === "sugar");   // the instance app.js uses
const jar = async ctx => Object.fromEntries((await ctx.cookies(BASE)).map(c => [c.name, c]));
try {
  for (const old of ["diet", "hard"]) {
    const ctx = await browser.newContext({ serviceWorkers: "block" });
    await ctx.addCookies([{ name: "stem-mode", value: old, url: BASE }]);
    await ctx.addInitScript(() => { if (!localStorage.getItem("stem-progress-probe")) localStorage.setItem("stem-progress-probe", "kept"); });
    const page = await ctx.newPage();
    await step(`old stem-mode=${old}, no flag: sugar on load, flag set for a year, no message, progress kept`, async () => {
      await page.goto(BASE);
      await page.waitForTimeout(800);
      assert.equal(await sugarOn(page), true, "sugar");
      const c = await jar(ctx);
      assert.equal(c["stem-mode"], undefined, "old mode cookie cleared");
      assert.equal(c["stem-mode-v"]?.value, "2");
      assert.ok(c["stem-mode-v"].expires > Date.now() / 1000 + 360 * 86400, "Max-Age a year");
      assert.equal(c["stem-mode-v"].sameSite, "Lax");
      assert.equal((await page.textContent("#entryMsg").catch(() => "")).trim(), "", "no message");
      assert.equal(await page.evaluate(() => localStorage.getItem("stem-progress-probe")), "kept");
    });
    await step(`then DIET_ opts into diet and it sticks across reloads (was ${old})`, async () => {
      await showCode(page);
      await page.fill("#code", "DIET_CALC1_T6B"); await page.press("#code", "Enter");
      await page.waitForFunction(() => /stem-mode=diet/.test(document.cookie), null, { timeout: 6000 });
      for (let i = 0; i < 2; i++) {
        await page.reload();
        await page.waitForTimeout(800);
        assert.equal(await sugarOn(page), false, "still diet after reload " + i);
        assert.equal((await jar(ctx))["stem-mode"]?.value, "diet");
      }
      assert.equal((await jar(ctx))["stem-mode-v"]?.value, "2", "the flag rides along (serve.py mode_of reads both)");
    });
    await ctx.close();
  }
} finally {
  await browser.close();
}
console.log(fails ? `${fails} FAIL` : "all ok");
process.exit(fails ? 1 : 0);
