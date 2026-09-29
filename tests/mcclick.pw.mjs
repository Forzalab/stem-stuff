// Regression: opening MC problems one after another stacked a click listener on #q per load, so one tap
// ran select() twice (select, then "tap again = deselect") and the choice showed only its hover border.
// usage: node tests/mcclick.pw.mjs http://localhost:8812
import { createRequire } from "node:module";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
let pw; try { pw = require("playwright"); } catch { pw = require("/opt/node22/lib/node_modules/playwright"); }
const BASE = process.argv[2] || "http://localhost:8812";
const CODES = ["CALC1_X2P", "CSCI26_CE05", "CSCI26_CE07", "CSCI26_TF3"];

const b = await pw.chromium.launch({ args: ["--no-sandbox"] });
let fails = 0;
for (const [name, viewport, touch] of [["phone", { width: 390, height: 844 }, true], ["desktop", { width: 1920, height: 1080 }, false]]) {
  const page = await (await b.newContext({ viewport, hasTouch: touch })).newPage();
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  for (const [i, code] of CODES.entries()) {
    await page.evaluate(c => { location.hash = c; }, code);
    await page.waitForFunction(c => document.querySelector("#pcode")?.textContent === c, code);
    const opt = page.locator("#q .opt").first();
    await (touch ? opt.tap() : opt.click());
    try {
      assert.equal(await opt.getAttribute("aria-checked"), "true", `${code} (MC load #${i + 1}): tap did not select`);
      assert.ok(await opt.locator("xpath=..").locator(".send").isVisible(), `${code}: submit arrow not shown`);
      await (touch ? opt.tap() : opt.click());
      assert.equal(await opt.getAttribute("aria-checked"), "false", `${code}: second tap did not deselect`);
      console.log(`ok   ${name} ${code} (load #${i + 1})`);
    } catch (e) { fails++; console.log(`FAIL ${name} ${e.message}`); }
  }
}
await b.close();
if (fails) { console.log(`${fails} failing`); process.exit(1); }
console.log("all ok");
