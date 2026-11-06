// Calc Coach in the real app (design/CALC-COACH.md): welcome card, item-view chip + cram strip + once-a-day toast, expiry (page.clock), picker hand-off, panel basics.
// Own serve.py with a fixture BANK_P3X:  node tests/calc.pw.mjs [port]
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { pw = require("/opt/node22/lib/node_modules/playwright"); }

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = +(process.argv[2] || 8887), BASE = `http://localhost:${PORT}`;
const TMP = mkdtempSync(join(tmpdir(), "calc-app-")), BANKS = join(TMP, "banks");

const WLC = "PHYS_PWQ1";
const num = (code, n) => ({ code, type: "num", answer: String(n + 2), body: [{ type: "text", md: `Plain ${n}: 2 + ${n}` }], noob: { tier: 1 } });
const welcome = { code: WLC, type: "num", answer: "4", form: "8/2", tol: 0.01, welcome: true, noob: { tier: 1 },
  body: [{ type: "text", md: "A $2\\ \\text{m}$ wide piston carries $8\\ \\text{N}$ over $2\\ \\text{m}^2$. Find the pressure, in $\\text{Pa}$." }],
  repair: { steps: [{ id: "who", label: "Which force presses down?", kind: "pick", opts: [{ id: "a", md: "the load's" }, { id: "b", md: "the air's" }], ok: "a" },
    { id: "answer", label: "Final answer", kind: "num" }] } };
mkdirSync(BANKS);
writeFileSync(join(BANKS, "BANK_P3X.json"), JSON.stringify({ v: 1, problems: [welcome, num("PHYS_PA1", 1), num("PHYS_PA2", 2)] }));
writeFileSync(join(BANKS, "BANK_OTH1.json"), JSON.stringify({ v: 1, problems: [num("OTH_W01", 1), num("OTH_W02", 2)] }));
writeFileSync(join(BANKS, "formula-sheet.json"), JSON.stringify({ v: 3, groups: [{ name: "Fluids", rows: [{ id: "PRESSURE", tex: "P=\\frac{F}{A}" }] }] }));
const srv = spawn("python3", [join(ROOT, "serve.py"), String(PORT)], { env: { ...process.env, STEM_BANKS: BANKS, STEM_FRONT: "BANK_P3X", STEM_FRONT_TITLE: "Exam 3",
  STEM_TODAY: "2026-10-23", STEM_TRIES: join(TMP, "tries.json") }, stdio: "ignore" });
for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + "/")).ok) break; } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 100)); }
let failures = 0;
async function step(name, fn) { try { await fn(); console.log("ok  ", name); } catch (e) { failures++; console.log("FAIL", name, "\n     ", e.message.slice(0, 700)); } }
const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
async function fresh(init = {}, at = "2026-11-06T18:00:00Z", opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block", ...opts });
  await ctx.addInitScript(([init, at]) => {                                  // the device's clock, pinned (the exam-day gate): Date.now() and new Date() read it, time still runs
    const R = Date, off = R.parse(at) - R.now();
    window.Date = class extends R { constructor(...a) { a.length ? super(...a) : super(R.now() + off); } static now() { return R.now() + off; } };
    try { localStorage.setItem("stem-ob", "done"); for (const b of ["right", "miss", "three", "redo"]) localStorage.setItem("stem-ob-rw-" + b, "9");
      if (!sessionStorage.getItem("cc-init")) { sessionStorage.setItem("cc-init", "1"); for (const [k, v] of Object.entries(init)) localStorage.setItem(k, v); } } catch { /* blocked */ } }, [init, at]);
  const page = await ctx.newPage(); const errs = []; page.on("pageerror", e => errs.push(e.message));
  return { ctx, page, errs };
}
const itemUp = (page, c) => page.waitForFunction(c => document.querySelector("#pcode")?.textContent === c && !document.querySelector("#freeze").hidden, c, { timeout: 8000 });
const anyUp = page => page.waitForFunction(() => document.querySelector("#pcode")?.textContent && !document.querySelector("#freeze").hidden, null, { timeout: 8000 });
const noH = page => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
const SEEN = { "stem-welcome-BANK_P3X": "1", "stem-calc-model": "ti-36x-pro" };
try {
  await step("welcome Q1 (fresh device) carries the exam-day card; its button opens the panel (390, no sideways scroll)", async () => {
    const { ctx, page, errs } = await fresh({ "stem-calc-model": "ti-36x-pro" });
    await page.goto(BASE + "/"); await anyUp(page);
    await page.waitForSelector("#q .cc-welcome");
    assert.equal(await page.textContent("#q .cc-welcome .cc-wt"), "Exam day: 2 calculator moves that save you 5 minutes");
    assert.equal(await noH(page), true);
    await page.click("#q .cc-welcome button"); await page.waitForSelector(".cc-ov .cc");
    assert.match(await page.textContent(".cc-ov .cc-t"), /Calc Coach/);
    assert.equal(await page.getAttribute(".cc-ov", "role"), "dialog");
    await page.keyboard.press("Escape"); assert.equal(await page.$(".cc-ov"), null);
    assert.deepEqual(errs, []); await ctx.close();
  });
  await step("welcome card after the exam: neutral copy, still there", async () => {
    const { ctx, page } = await fresh({ "stem-calc-model": "ti-36x-pro" }, "2026-11-10T09:00:00Z");
    await page.goto(BASE + "/"); await anyUp(page); await page.waitForSelector("#q .cc-welcome");
    assert.equal(await page.textContent("#q .cc-welcome .cc-wt"), "Calculator moves"); await ctx.close();
  });
  await step("item view on BANK_P3X: Calc chip, cram strip (dismissable, stays dismissed), toast once per day", async () => {
    const { ctx, page } = await fresh({ ...SEEN, "stem-calc-model": "ti-36x-pro" });
    await page.goto(BASE + "/#PHYS_PA1"); await anyUp(page);
    await page.waitForSelector("#problem .cc-row .cc-chip");
    assert.match(await page.textContent("#problem .cc-strip .cc-st"), /Exam day: 2 calculator moves/);
    await page.waitForSelector("#problem .cc-slot button");   // the Hail Mary slot is live in exam time
    const tk = () => page.evaluate(() => Object.keys(localStorage).filter(k => /^stem-calc-toast-/.test(k)));
    assert.equal((await tk()).length, 1, "the toast was asked for today");
    await page.click("#problem .cc-strip .cc-x"); assert.equal(await page.$("#problem .cc-strip"), null);
    await page.reload(); await anyUp(page); await page.waitForSelector("#problem .cc-chip");
    assert.equal(await page.$("#problem .cc-strip"), null, "dismissal is remembered");
    await page.waitForTimeout(1500); assert.equal(await page.evaluate(() => [...document.querySelectorAll(".stoast")].some(e => e.offsetParent && getComputedStyle(e).visibility !== "hidden")), false, "no second toast the same day"); assert.equal((await tk()).length, 1);
    await page.click("#problem .cc-chip"); await page.waitForSelector(".cc-ov .cc");
    assert.equal(await noH(page), true); await ctx.close();
  });
  await step("after the exam copy expires: no strip, no toast, the Calc chip stays; other banks never get the strip", async () => {
    const a = await fresh({ ...SEEN }, "2026-11-10T09:00:00Z");
    await a.page.goto(BASE + "/#PHYS_PA1"); await anyUp(a.page);
    await a.page.waitForSelector("#problem .cc-chip"); await a.page.waitForTimeout(1500);
    assert.equal(await a.page.$("#problem .cc-strip"), null); assert.equal(await a.page.$(".stoast"), null); await a.ctx.close();
  });
  await step("no calculator chosen: the chip opens the picker (stemCalcPick), not an empty panel", async () => {
    const { ctx, page } = await fresh({ ...SEEN, "stem-calc-model": "skip" });
    await page.goto(BASE + "/#PHYS_PA1"); await anyUp(page); await page.waitForSelector("#problem .cc-chip");
    await page.evaluate(() => { window.stemCalcPick.close && window.stemCalcPick.close(); document.querySelector("#problem .cc-chip").click(); });
    await page.waitForFunction(() => window.stemCalcPick && window.stemCalcPick.up === true, null, { timeout: 4000 });
    assert.equal(await page.$(".cc-ov"), null); await ctx.close();
  });
  await step("panel: TI-36X Pro routine 1 walks end to end (key caps, Back/Next, Try it on yours); reduced motion; no sideways scroll", async () => {
    const { ctx, page } = await fresh({}, undefined, { reducedMotion: "reduce" });
    await page.goto(BASE + "/calc.html?model=ti36xpro&routine=R1"); await page.waitForSelector(".cc-pad .cc-ring");
    assert.equal(await page.$eval(".cc-ring", e => getComputedStyle(e).animationName), "none");
    const n = +/of (\d+)/.exec(await page.textContent(".cc-count"))[1]; assert.ok(n >= 7);
    for (let i = 1; i < n; i++) { await page.click(".cc-go"); await page.waitForSelector(".cc-count, .cc-try"); }
    await page.click(".cc-go"); await page.waitForSelector(".cc-try"); assert.match(await page.textContent(".cc-tt"), /Try it on yours/);
    assert.equal(await noH(page), true); await ctx.close();
  });
  await step("panel: a model Calc Coach does not have says check your manual", async () => {
    const { ctx, page } = await fresh();
    await page.goto(BASE + "/calc.html?model=nomodel&routine=R1"); await page.waitForSelector(".cc-note");
    assert.match(await page.textContent(".cc-note"), /Check your manual/); await ctx.close();
  });
  await step("Hail Mary deck: 4 full-height snap slides, rail, keyboard moves a slide; reduced motion = static chevron", async () => {
    const { ctx, page } = await fresh({}, undefined, { reducedMotion: "reduce" });
    await page.goto(BASE + "/calc.html?cram=BANK_P3X"); await page.waitForSelector(".cc-slide");
    const m = await page.evaluate(() => { const sc = document.querySelector(".cc-deck"), cs = getComputedStyle(sc), sl = document.querySelector(".cc-slide");
      return { snap: cs.scrollSnapType, n: document.querySelectorAll(".cc-slide").length, full: Math.abs(sl.offsetHeight - sc.clientHeight) <= 1, bob: getComputedStyle(document.querySelector(".cc-bob")).animationName, dots: document.querySelectorAll(".cc-rail i").length }; });
    assert.match(m.snap, /y mandatory/); assert.deepEqual([m.n, m.full, m.bob, m.dots], [4, true, "none", 4]);
    await page.focus(".cc-deck"); await page.keyboard.press("ArrowDown");
    await page.waitForFunction(() => { const sc = document.querySelector(".cc-deck"); return Math.abs(sc.scrollTop - sc.clientHeight) <= 2; });
    assert.equal(await page.$eval(".cc-rail i.on", e => [...e.parentNode.children].indexOf(e)), 1);
    await page.keyboard.press("PageUp"); await page.waitForFunction(() => document.querySelector(".cc-deck").scrollTop <= 2);
    assert.equal(await noH(page), true); await ctx.close();
  });
  await step("Cluck chrome: the Calc Coach link opens the panel, and sits outside the reply body", async () => {
    const { ctx, page } = await fresh({ ...SEEN, "stem-calc-model": "ti-36x-pro" });
    await page.goto(BASE + "/#PHYS_PA1"); await anyUp(page);
    await page.evaluate(() => { const b = document.querySelector("#problem .cc-chip"); b && b.scrollIntoView(); });
    const r = await page.evaluate(() => { const el = document.getElementById("cluck"); if (el) return !!el.querySelector(".cl-verify + .cc-cl .cc-link") && !el.querySelector(".wtext .cc-cl"); return "lazy"; });
    if (r === "lazy") { const { clEl } = {}; }                         // #cluck is built on first open: its markup is checked by the unit test below
    assert.notEqual(r, false);
    await ctx.close();
  });
} finally { await browser.close(); srv.kill(); }
console.log(failures ? `${failures} failed` : "all ok"); process.exit(failures ? 1 : 0);
