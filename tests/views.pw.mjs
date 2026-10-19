// try/views-demo.html in Chromium (P1.1, render plan v2): views.js + views.css on real tokens, streamed programs.
// Shots at 390 and 1280 (+ 390 greyscale) for the eye; asserts: no sideways scroll, nothing past the right edge, no console errors,
// append-only paint (a painted statement keeps its node while later ones stream in), Steps' Back/Next bounds, the Doodle fallback,
// and the P11 answer is nowhere in the DOM, localStorage or sessionStorage before Check (F4/F5); after Check the Reveal opens.
// usage: python3 serve.py 8815 &   node tests/views.pw.mjs http://localhost:8815 [shotDir]
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { pw = require("/opt/node22/lib/node_modules/playwright"); }
const BASE = process.argv[2] || "http://localhost:8815";
const SHOTS = process.argv[3] || "";
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); }
  catch (e) { failures++; console.log("FAIL", name, "\n     ", e.message.slice(0, 600)); }
}
const ANSWER = ["χ(P) = 3", "Three classes cover"];   // the Reveal body: only the fake server has it before the stage changes

const b = await pw.chromium.launch({ args: ["--no-sandbox"] });
for (const W of [390, 1280]) {
  const phone = W < 700;
  const ctx = await b.newContext({ viewport: { width: W, height: phone ? 844 : 900 }, hasTouch: phone, isMobile: phone, serviceWorkers: "block" });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  // views/library.json 404s until P0.2's registry lands; views-lib.js then falls back to its own list (by design)
  page.on("console", m => { if (m.type() === "error" && !m.location().url.endsWith("/views/library.json")) errors.push(m.text()); });
  const open = async (qs = "") => {
    await page.goto(`${BASE}/try/views-demo.html${qs}`);
    await page.waitForFunction(() => document.documentElement.getAttribute("data-ready") === "1", null, { timeout: 15000 });
    await page.evaluate(() => document.fonts.ready);
  };
  const shot = async n => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/views-${n}-${W}.png`, fullPage: true }); };
  const fits = async () => {
    const r = await page.evaluate(() => {
      const de = document.documentElement, w = de.clientWidth;
      const over = [...document.querySelectorAll("body *")].filter(e => e.getBoundingClientRect().right > w + 0.5).map(e => e.className?.baseVal ?? e.className);
      return { sw: de.scrollWidth, w, over: over.slice(0, 5) };
    });
    assert.equal(r.sw, r.w, `scrollWidth ${r.sw} vs ${r.w}`);
    assert.deepEqual(r.over, [], "elements past the right edge");
  };
  const leaks = () => page.evaluate(words => {
    const where = { dom: document.documentElement.outerHTML, local: JSON.stringify({ ...localStorage }), session: JSON.stringify({ ...sessionStorage }) };
    return Object.entries(where).flatMap(([k, v]) => words.filter(w => v.includes(w)).map(w => `${k}: ${w}`));
  }, ANSWER);

  await step(`${W} streamed: append-only paint, every view done, no answer before Check`, async () => {
    await page.goto(`${BASE}/try/views-demo.html`);
    await page.waitForSelector('#v1 [data-slot="head"].on');
    await page.evaluate(() => { window.__head = document.querySelector('#v1 [data-slot="head"]').firstChild; window.__slots = document.querySelectorAll("#v1 .vw-slot").length; });
    await page.waitForFunction(() => document.documentElement.getAttribute("data-ready") === "1", null, { timeout: 15000 });
    const r = await page.evaluate(() => ({ same: document.querySelector('#v1 [data-slot="head"]').firstChild === window.__head,
      slots: [window.__slots, document.querySelectorAll("#v1 .vw-slot").length], done: [...document.querySelectorAll(".dmount")].every(m => m.hasAttribute("data-vw-done")) }));
    assert.ok(r.same, "the head node was repainted while later statements streamed in");
    assert.deepEqual(r.slots, [3, 3], "slots are reserved when the root arrives");
    assert.ok(r.done);
    assert.deepEqual(await leaks(), []);
  });

  await step(`${W} fast: layout fits, Steps bounds, fallback Doodle, locked Reveal, no leak`, async () => {
    await open("?fast=1");
    await shot("step1");
    await fits();
    const s = await page.evaluate(() => {
      const f = document.querySelector("#v1 .vw-foot"), [back, next] = f.querySelectorAll(".btn");
      return { n: f.querySelector(".vw-n").textContent, back: back.disabled, next: next.disabled, rows: document.querySelectorAll("#v1 .vw-tb tbody tr").length,
        legend: document.querySelectorAll("#v1 .vw-chips[aria-label=legend] .vw-chip").length, figs: document.querySelectorAll("#v1 .vw-fig svg .nd").length };
    });
    assert.deepEqual(s, { n: "Step 1 of 4", back: true, next: false, rows: 5, legend: 6, figs: 5 });
    for (let i = 0; i < 3; i++) await page.click("#v1 .vw-foot .btn:nth-child(2)");
    assert.equal(await page.textContent("#v1 .vw-n"), "Step 4 of 4");
    assert.ok(await page.$eval("#v1 .vw-foot .btn:nth-child(2)", e => e.disabled), "Next is off on the last step");
    assert.ok(await page.$("#v1 .nd.rec") && await page.$("#v1 .ed.skip"), "step 4 draws recorded-only and not-examined");
    assert.ok(await page.$("#v4 .vw-fallback .vw-doodle.duck"), "every statement dropped -> the duck");
    assert.ok(await page.$("#v5 .vw-doodle.heart"));
    const [dh, cap] = await page.$eval("#v4 .vw-doodle svg", e => [e.getBoundingClientRect().height, Math.min(innerHeight * 0.28, 3 * parseFloat(getComputedStyle(e).getPropertyValue("--btn")))]);
    assert.ok(dh > 40 && dh <= cap + 8, `doodle height ${dh} within the figure slot (${cap})`);   // + the outline drawn past the box
    assert.ok(await page.$("#v2 .vw-reveal:not(.open) .vw-lock"), "a visible locked row");
    assert.equal(await page.$$eval("#v2 .vw-pill.wrong", e => e.map(x => x.textContent).join()), "4", "the earlier pick is pre-struck");
    assert.deepEqual(await leaks(), []);
    await page.evaluate(() => scrollTo(0, 0));
    assert.deepEqual(errors, []);
  });

  await step(`${W} Check a wrong pick: try 2, the Reveal patch opens in place, Predict keeps its node`, async () => {
    await open("?fast=1");
    await page.evaluate(() => { window.__pred = document.querySelector('#v2 [data-slot="pick"]').firstChild; });
    await page.click('#v2 .vw-pill[data-v="5"]');
    assert.deepEqual(await leaks(), [], "a pick alone sends nothing back");
    await page.click("#v2 .vw-go");
    await page.waitForSelector("#v2 .vw-reveal.open");
    const r = await page.evaluate(() => ({ same: document.querySelector('#v2 [data-slot="pick"]').firstChild === window.__pred,
      verdict: document.querySelector("#v2 .vw-verdict").textContent, used: document.querySelectorAll("#v2 .vw-pips i.used").length,
      digits: [...document.querySelectorAll("#v2 .cm text")].map(t => t.textContent).join(""), ans: document.querySelector("#v2 .vw-ans").textContent }));
    assert.deepEqual(r, { same: true, verdict: "Not 5.", used: 2, digits: "1212321332", ans: "χ(P) = 3" });
    await page.waitForTimeout(400);
    await fits();
    await shot("reveal");
    assert.deepEqual(errors, []);
  });

  if (phone) await step(`${W} greyscale shots`, async () => {
    await open("?fast=1&grey=1");
    await shot("grey");
    await open("?fast=1&grey=1&reveal=1&s1=4");
    await page.waitForTimeout(400);
    await shot("grey-reveal");
    assert.deepEqual(errors, []);
  });
  await ctx.close();
}
await b.close();
if (failures) { console.log(`${failures} FAIL`); process.exit(1); }
console.log("all ok");
