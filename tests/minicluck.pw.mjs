// minicluck.js (DESIGN-v3 §4, Tony #13 + #25.4): the tiny Cluck on a sub-step, driven through its lab (design/mini-lab.html?live, /mini stubbed
// here by page.route). Open: the page dims but the stem and the student's work stay clear; a chip tap sends its text; the type-in box sends;
// the reply is an OpenUI Lang program drawn by views.js, the model's raw HTML stays text; X / Esc close it (mini_dismiss), focus back on the step;
// inside a 360 viewport, no sideways scroll.
//   python3 serve.py 8830 & node tests/minicluck.pw.mjs http://localhost:8830
import { createRequire } from "node:module";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { pw = require("/opt/node22/lib/node_modules/playwright"); }
const BASE = process.argv[2] || "http://localhost:8830";

const PROG = 'root = View([a])\na = Text("<img src=x onerror=window.pwned=1> **Which way** does the friction push?")';
let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); }
  catch (e) { failures++; console.log("FAIL", name, "\n     ", e.message.slice(0, 700)); }
}
const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
try {
  const page = await browser.newPage({ viewport: { width: 360, height: 800 } });
  const errs = []; page.on("pageerror", e => errs.push(e.message));
  const sent = [];
  await page.route("**/mini", r => { sent.push(JSON.parse(r.request().postData() || "{}")); r.fulfill({ status: 200, contentType: "text/plain", body: PROG }); });
  await page.goto(BASE + "/design/mini-lab.html?live");
  const mini = () => page.$$eval(".ai-box .pop.mini", ps => ps.length);
  const at = sel => page.$eval(sel, el => { const b = el.getBoundingClientRect(), t = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return el.contains(t) ? "clear" : t.className; });

  await step("open: a tiny Cluck on the step, the page dims, the stem and the student's work stay clear", async () => {
    assert.equal(await mini(), 0, "lazy");
    await page.click("#open");
    assert.equal(await mini(), 1);
    assert.equal(await page.$eval(".pop.mini", p => p.dataset.variant), "mini");
    assert.equal(await page.$$eval(".dim", d => d.length), 1, ".dim on the page");
    assert.equal(await at("#stem"), "clear", "stem undimmed");
    assert.equal(await at("#work"), "clear", "student work undimmed");
    assert.match(await at("#other"), /\bdim\b/, "the rest of the page is under the dim");
    assert.ok((await page.$$eval(".pop.mini .mini-chip", c => c.length)) >= 2, "2-3 chips");
    assert.ok(await page.$(".pop.mini input, .pop.mini textarea"), "a type-in box");
  });
  await step("a chip tap sends its text; the OpenUI Lang reply renders, raw HTML stays text", async () => {
    const chip = await page.$eval(".pop.mini .mini-chip", c => c.textContent);
    await page.click(".pop.mini .mini-chip");
    await page.waitForSelector(".pop.mini .vw p");
    assert.equal(sent.at(-1).text, chip);
    assert.equal(sent.at(-1).code, "PHYS_LAB1", "the caller's context rides along");
    const r = await page.$eval(".pop.mini", p => [p.querySelector(".vw p").textContent, !!p.querySelector("img"), p.querySelector(".vw p b")?.textContent]);
    assert.deepEqual(r, ["<img src=x onerror=window.pwned=1> Which way does the friction push?", false, "Which way"]);
    assert.equal(await page.evaluate(() => window.pwned), undefined);
  });
  await step("the type-in box sends what the student typed", async () => {
    await page.fill(".pop.mini .mini-in", "it pushes back?");
    await page.press(".pop.mini .mini-in", "Enter");
    for (let i = 0; i < 40 && sent.length < 2; i++) await page.waitForTimeout(50);
    assert.equal(sent.at(-1).text, "it pushes back?");
    assert.equal(await mini(), 1, "still open");
  });
  await step("fits a 360 viewport: 16px edges, no sideways scroll", async () => {
    const r = await page.$eval(".pop.mini", p => { const b = p.getBoundingClientRect(); return [Math.round(b.left) >= 16, Math.round(b.right) <= innerWidth - 16, document.documentElement.scrollWidth <= innerWidth]; });
    assert.deepEqual(r, [true, true, true]);
  });
  await step("Esc closes it: no dim, focus back on the step, mini_dismiss logged", async () => {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(50);
    assert.equal(await mini(), 0);
    assert.equal(await page.$$eval(".dim", d => d.length), 0);
    assert.equal(await page.evaluate(() => document.activeElement.id), "s2");
    assert.deepEqual(await page.evaluate(() => window.ev.filter(e => e[0] === "mini_dismiss").map(e => e[1].how)), ["esc"]);
  });
  await step("X closes it too", async () => {
    await page.click("#open");
    await page.click(".pop.mini .mini-x");
    await page.waitForTimeout(50);
    assert.equal(await mini(), 0);
    assert.equal(await page.$$eval(".dim", d => d.length), 0);
    assert.deepEqual(await page.evaluate(() => window.ev.filter(e => e[0] === "mini_dismiss").map(e => e[1].how)), ["esc", "x"]);
  });
  await step("no page errors", async () => assert.deepEqual(errs, []));
} finally { await browser.close(); }
console.log(failures ? `${failures} failed` : "all ok");
process.exit(failures ? 1 : 0);
