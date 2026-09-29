// Tapping the "Scratchpad" title (or anywhere outside the box) must dismiss the keyboard: the title is not a <label>,
// which would refocus the textarea. Also: no line-number gutter, 16px text, 2-icon swap toggle.
// usage: node tests/blur.pw.mjs http://localhost:8812
import { createRequire } from "node:module";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
let pw; try { pw = require("playwright"); } catch { pw = require("/opt/node22/lib/node_modules/playwright"); }
const BASE = process.argv[2] || "http://localhost:8812";
const b = await pw.chromium.launch({ args: ["--no-sandbox"] });
const page = await (await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true })).newPage();
await page.goto(`${BASE}/#CALC1_T6B`, { waitUntil: "networkidle" });
await page.waitForSelector("#scratch");
await page.tap("#scratch");
assert.equal(await page.evaluate(() => document.activeElement.id), "scratch");
await page.tap("#xbLabel");
assert.notEqual(await page.evaluate(() => document.activeElement.id), "scratch", "tapping the title refocused the scratchpad");
assert.equal(await page.locator("#xbGutter, .xb-gutter").count(), 0, "line-number gutter still there");
assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector("#scratch")).fontSize), "16px");
assert.equal(await page.locator("#swap .ico").count(), 2, "swap toggle should be doc + pen only");
await b.close();
console.log("all ok");
