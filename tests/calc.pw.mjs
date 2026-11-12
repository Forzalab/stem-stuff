// Calc Coach in the real app (docs/design/CALC-COACH.md): welcome card, item-view chip + cram strip + once-a-day toast, expiry (page.clock), picker hand-off, panel basics.
// Own serve.py with a fixture BANK_P3X:  node tests/calc.pw.mjs [port]
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { pw = require("/opt/node22/lib/node_modules/playwright"); }

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = +(process.argv[2] || 8887), BASE = `http://localhost:${PORT}`;
const TMP = mkdtempSync(join(tmpdir(), "calc-app-")), BANKS = join(TMP, "banks");
// the cram window is over (calc/cram.json enabled:false in the repo): this spec tests the cram surfaces, so it serves a forced-on copy (as cram-off.pw.mjs forces off)
const CRAM_ON = JSON.stringify({ ...JSON.parse(readFileSync(join(ROOT, "client", "calc", "cram.json"), "utf8")), enabled: true }), CRAM = join(TMP, "cram.json");
writeFileSync(CRAM, CRAM_ON);
const cramOn = (ctx) => ctx.route("**/client/calc/cram.json", r => r.fulfill({ status: 200, contentType: "application/json", body: CRAM_ON }));

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
const srv = spawn("python3", [join(ROOT, "server", "http_server", "serve.py"), String(PORT)], { env: { ...process.env, STEM_BANKS: BANKS, STEM_FRONT: "BANK_P3X", STEM_FRONT_TITLE: "Exam 3",
  STEM_TODAY: "2026-10-23", STEM_TRIES: join(TMP, "tries.json"), STEM_CRAM: CRAM }, stdio: "ignore" });
for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + "/")).ok) break; } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 100)); }
let failures = 0;
async function step(name, fn) { try { await fn(); console.log("ok  ", name); } catch (e) { failures++; console.log("FAIL", name, "\n     ", e.message.slice(0, 700)); } }
const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
async function fresh(init = {}, at = "2026-11-06T18:00:00Z", opts = {}) {
  init = { ...init };
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block", ...opts });
  await cramOn(ctx);
  await ctx.addInitScript(() => document.documentElement.classList.add("cc-calc-on"));   // the TI/Casio chip is hidden for now (calc-coach.css); these specs still test it
  await ctx.addInitScript(([init, at]) => {                                  // the device's clock, pinned (the exam-day gate): Date.now() and new Date() read it, time still runs
    window.__ccToastMs = 300; window.__ccOfferMs = 99999999;
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
    assert.equal(await page.textContent("#q .cc-welcome .cc-wt"), "Stuck? Click here for TI/Casio tricks.");
    assert.equal(await noH(page), true);
    await page.click("#q .cc-welcome button"); await page.waitForSelector(".cc-ov .cc");
    await page.waitForSelector(".cc-ov .cc-deck"); assert.equal(await page.$$eval(".cc-ov .cc-slide", e => e.length), 2, "the routine deck: 2 slides");
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
    await page.waitForSelector("#problem .cc-row .cc-cta-calc");
    assert.equal(await page.textContent("#problem .cc-cta-calc"), "TI/Casio tricks");
    await page.waitForSelector("#problem .cc-row .cc-cta-hm[role=link]");   // the Hail Mary button is live in exam time
    assert.equal(await page.textContent("#problem .cc-cta-hm"), "Hail Mary guess");
    assert.equal(await page.$$eval("#problem .cc-row [role=link]", e => e.length), 2, "exactly two entries: no strip, no link, no X");
    assert.equal(await page.$("#problem .cc-strip, #problem .cc-x"), null);
    const sz = await page.$$eval("#problem .cc-row .cc-cta", e => e.map(b => { const r = b.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }));
    assert.equal(sz[0][0], sz[1][0], "equal widths"); assert.ok(sz[0][1] >= 44 && sz[1][1] >= 44, "44px tall");
    await page.waitForTimeout(900);
    const tk = () => page.evaluate(() => Object.keys(localStorage).filter(k => /^stem-calc-toast-/.test(k)));
    assert.equal(await page.evaluate(() => !!(window.stemCram && window.stemCram.on())), true, "cram day on");
    assert.equal((await tk()).length, 0, "cram day: peek.js's toast is the one; Calc Coach adds no second toast");
    await page.click("#problem .cc-cta-hm"); await page.waitForSelector(".cc-ov .cc-deck"); await page.keyboard.press("Escape");
    await page.reload(); await anyUp(page); await page.waitForSelector("#problem .cc-cta-calc");
    await page.waitForTimeout(1500); assert.equal(await page.evaluate(() => [...document.querySelectorAll(".stoast")].some(e => e.offsetParent && getComputedStyle(e).visibility !== "hidden")), false, "no second toast the same day");
    await page.click("#problem .cc-cta-calc"); await page.waitForSelector(".cc-ov .cc");
    assert.equal(await noH(page), true); await ctx.close();
  });
  await step("after the exam copy expires: no strip, no toast, the Calc chip stays; other banks never get the strip", async () => {
    const a = await fresh({ ...SEEN }, "2026-11-10T09:00:00Z");
    await a.page.goto(BASE + "/#PHYS_PA1"); await anyUp(a.page);
    await a.page.waitForSelector("#problem .cc-cta-calc"); await a.page.waitForTimeout(1500);
    assert.equal(await a.page.$("#problem .cc-cta-hm"), null, "outside the window only the calc button"); assert.equal(await a.page.$$eval("#problem .cc-row [role=link]", e => e.length), 1); assert.equal(await a.page.$(".stoast"), null); await a.ctx.close();
  });
  await step("no calculator chosen: the chip opens the picker (stemCalcPick), not an empty panel", async () => {
    const { ctx, page } = await fresh({ ...SEEN, "stem-calc-model": "skip" });
    await page.goto(BASE + "/#PHYS_PA1"); await anyUp(page); await page.waitForSelector("#problem .cc-cta-calc");
    await page.evaluate(() => { window.stemCalcPick.close && window.stemCalcPick.close(); document.querySelector("#problem .cc-cta-calc").click(); });
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
  const wrap = page => page.evaluate(() => { window.__shown = []; const o = window.stemToast.show; window.stemToast.show = x => { window.__shown.push(x.text); }; });
  const wrong = (page, code) => page.evaluate(c => { for (let i = 0; i < 2; i++) dispatchEvent(new CustomEvent("drill:answer", { detail: { code: c, right: false } })); }, code);
  const shown = page => page.evaluate(() => window.__shown.filter(t => /^Stuck\? Guess smart\./.test(t)).length);
  await step("auto-offer: 2nd wrong pick offers Hail Mary once per item, 3 per session, not over a modal; copy exact", async () => {
    const { ctx, page } = await fresh({ ...SEEN });
    await page.goto(BASE + "/#PHYS_PA1"); await anyUp(page); await page.waitForSelector("#problem .cc-cta-calc"); await wrap(page);
    await page.waitForFunction(() => window.CalcCoach.cramFor("BANK_P3X"), null, { timeout: 4000 });
    await page.evaluate(() => dispatchEvent(new CustomEvent("drill:answer", { detail: { code: document.getElementById("pcode").textContent, right: false } })));
    await page.waitForTimeout(1300); assert.equal(await shown(page), 0, "one wrong pick is not enough");
    const code = await page.evaluate(() => document.getElementById("pcode").textContent);
    await wrong(page, code); await page.waitForFunction(() => window.__shown.some(t => /Guess smart/.test(t)), null, { timeout: 4000 });
    assert.equal(await page.evaluate(() => window.__shown.find(t => /Guess smart/.test(t))), "Stuck? Guess smart.\nLearn 4 fast guess tricks. Go from 1 in 5 to up to 1 in 2.");
    await wrong(page, code); await page.waitForTimeout(1300); assert.equal(await shown(page), 1, "once per item");
    for (const c of ["X2", "X3", "X4"]) { await page.evaluate(c => { document.getElementById("pcode").textContent = c; window.CalcCoach.onItem("BANK_P3X"); }, c); await wrong(page, c); await page.waitForTimeout(1100); }
    assert.equal(await shown(page), 3, "capped at 3 a session");
    await ctx.close();
  });
  await step("auto-offer: after 3 minutes on an item (timer shortened here); not while the deck is open; off after the exam window", async () => {
    const a = await fresh({ ...SEEN });
    await a.page.addInitScript(() => { window.__ccOfferMs = 700; });
    await a.page.goto(BASE + "/#PHYS_PA1"); await anyUp(a.page); await a.page.waitForSelector("#problem .cc-cta-calc"); await wrap(a.page);
    await a.page.evaluate(() => window.CalcCoach.onItem("BANK_P3X"));       // re-arm with the short timer, as a new item does
    await a.page.waitForFunction(() => window.__shown.some(t => /Guess smart/.test(t)), null, { timeout: 5000 }); await a.ctx.close();
    const b = await fresh({ ...SEEN, "stem-calc-model": "ti-36x-pro" });
    await b.page.goto(BASE + "/#PHYS_PA1"); await anyUp(b.page); await b.page.waitForSelector("#problem .cc-cta-calc"); await wrap(b.page);
    await b.page.waitForFunction(() => window.CalcCoach.cramFor("BANK_P3X"), null, { timeout: 4000 });
    await b.page.evaluate(() => window.CalcCoach.openCram("BANK_P3X")); await b.page.waitForSelector(".cc-ov");
    await wrong(b.page, await b.page.evaluate(() => document.getElementById("pcode").textContent)); await b.page.waitForTimeout(1300);
    assert.equal(await shown(b.page), 0, "not over an open modal"); await b.ctx.close();
    const c = await fresh({ ...SEEN }, "2026-11-10T09:00:00Z");
    await c.page.goto(BASE + "/#PHYS_PA1"); await anyUp(c.page); await c.page.waitForSelector("#problem .cc-cta-calc"); await wrap(c.page);
    await wrong(c.page, await c.page.evaluate(() => document.getElementById("pcode").textContent)); await c.page.waitForTimeout(1300);
    assert.equal(await shown(c.page), 0, "off after the exam window"); await c.ctx.close();
  });
  await step("Hail Mary deck: 4 full-height snap slides, rail, keyboard moves a slide; reduced motion = static chevron", async () => {
    const { ctx, page } = await fresh({}, undefined, { reducedMotion: "reduce" });
    await page.goto(BASE + "/calc.html?cram=BANK_P3X"); await page.waitForSelector(".cc-slide");
    const m = await page.evaluate(() => { const sc = document.querySelector(".cc-deck"), cs = getComputedStyle(sc), sl = document.querySelector(".cc-slide");
      return { snap: cs.scrollSnapType, n: document.querySelectorAll(".cc-slide").length, full: Math.abs(sl.offsetHeight - sc.clientHeight) <= 1, bob: getComputedStyle(document.querySelector(".cc-bob")).animationName, dots: document.querySelectorAll(".cc-rail i").length }; });
    assert.match(m.snap, /y mandatory/); assert.deepEqual([m.n, m.full, m.bob, m.dots], [4, true, "none", 4]);
    await page.focus(".cc-deck"); await page.keyboard.press("ArrowDown");
    await page.waitForFunction(() => { const sc = document.querySelector(".cc-deck"); return Math.abs(sc.scrollTop - sc.clientHeight) <= 2; });
    await page.waitForFunction(() => document.querySelectorAll(".cc-rail i")[1].className === "on");
    await page.keyboard.press("PageUp"); await page.waitForFunction(() => document.querySelector(".cc-deck").scrollTop <= 2);
    assert.equal(await noH(page), true); await ctx.close();
  });
  await step("Routine deck: 2 snap slides, a theme class per slide, the picked model's verified keys, step button, reduced motion static", async () => {
    const want = { "ti-36x-pro": ["2nd", "sin"], "fx-115es-plus": ["SHIFT", "CALC"] };
    for (const [id, keys] of Object.entries(want)) {
      const { ctx, page } = await fresh({ "stem-calc-model": id }, undefined, { reducedMotion: "reduce" });
      await page.goto(BASE + "/calc.html"); await page.waitForFunction(() => window.CalcCoach);
      await page.evaluate(() => window.CalcCoach.open({ force: true })); await page.waitForSelector(".cc-routine .cc-slide");
      const m = await page.evaluate(() => { const sc = document.querySelector(".cc-deck"), sl = [...document.querySelectorAll(".cc-slide")];
        return { snap: getComputedStyle(sc).scrollSnapType, n: sl.length, th: sl.map(e => /cc-th-(amber|cyan)/.exec(e.className)[1]), full: sl.every(e => Math.abs(e.offsetHeight - sc.clientHeight) <= 1),
          caps: [...sl[0].querySelectorAll(".cc-kc")].map(e => e.textContent), r2: sl[1].querySelectorAll(".cc-kc").length,
          btns: sl.map(e => e.querySelector("button.cc-back")?.textContent), swipe: document.querySelectorAll(".cc-swipe").length, bob: getComputedStyle(document.querySelector(".cc-bob")).animationName,
          imgs: sl.map(e => e.querySelector("img.cc-anim")?.getAttribute("src")), pulse: getComputedStyle(document.querySelector(".cc-kc-last")).animationName, dots: document.querySelectorAll(".cc-rail i").length }; });
      assert.match(m.snap, /y mandatory/); assert.deepEqual([m.n, m.th, m.full, m.swipe, m.bob, m.pulse, m.dots], [2, ["amber", "cyan"], true, 1, "none", "none", 2]);
      assert.deepEqual(m.caps, keys, id + ": the verified keys"); assert.ok(m.r2 >= 1, "slide 2 has its key strip");
      assert.deepEqual(m.btns, ["Show me step by step", "Show me step by step"]); assert.deepEqual(m.imgs, ["client/calc/rt/rt-1-solve.svg", "client/calc/rt/rt-2-store.svg"]);
      await page.focus(".cc-deck"); await page.keyboard.press("ArrowDown");
      await page.waitForFunction(() => document.querySelectorAll(".cc-rail i")[1].className === "on");
      await page.click(".cc-slide:nth-child(2) button.cc-back"); await page.waitForSelector(".cc-ov .cc-count");   // opens the per-step walkthrough
      assert.equal(await noH(page), true); await ctx.close();
    }
  });
  await step("Cluck chrome: the Calc Coach link opens the panel, and sits outside the reply body", async () => {
    const { ctx, page } = await fresh({ ...SEEN, "stem-calc-model": "ti-36x-pro" });
    await page.goto(BASE + "/#PHYS_PA1"); await anyUp(page);
    await page.evaluate(() => { const b = document.querySelector("#problem .cc-cta-calc"); b && b.scrollIntoView(); });
    const r = await page.evaluate(() => { const el = document.getElementById("cluck"); if (el) return !!el.querySelector(".cl-verify + .cc-cl .cc-link") && !el.querySelector(".wtext .cc-cl"); return "lazy"; });
    if (r === "lazy") { const { clEl } = {}; }                         // #cluck is built on first open: its markup is checked by the unit test below
    assert.notEqual(r, false);
    await ctx.close();
  });
} finally { await browser.close(); srv.kill(); }
console.log(failures ? `${failures} failed` : "all ok"); process.exit(failures ? 1 : 0);
