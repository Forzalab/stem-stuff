// W98c PR1 (cluckbtn v3c, Tony Nov 2 09:44-09:59): the desktop has ONE way into Cluck, the Ask Cluck door (#door).
//   D1 before the first try: no Cluck control anywhere. After the first try and every graded state (wrong, right, out of tries), on every
//      Cluck-able type (typed, pick one, pick all): exactly ONE visible Cluck control and it is #door. No-key questions: zero Cluck controls.
//   D2 the killed entries are never visible on desktop: #wish chip, .cl-peek .cl-cta ("okay, but how?"), #clBack ("Show him"), #origHd.
//   D3 the door hides while Cluck is open and is back on close (X: the column goes, the door is the way back).
//   D4 across 3 consecutive questions (Next between): no door before a try, one door after it.
//   D5 the sunrise is a status: not clickable (a click opens nothing), not focusable, no CTA wording; it jiggles the door once
//      (.jiggle, none with reduced motion).
//   D6 phone 390: unchanged: the old entries are still there and there is no door.
// Sizes 1024 / 1280 / 1440, sugar. Starts its own serve.py + bank.   node tests/cluck-door.pw.mjs [port]
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
const PORT = +(process.argv[2] || 8889), BASE = `http://localhost:${PORT}`;
const TMP = mkdtempSync(join(tmpdir(), "cluck-door-")), BANKS = join(TMP, "banks");
const SHOT = process.env.SHOT_DIR || "";
const sac = n => ({ title: `Door ${n}`, tip: "Pressure = force / area.", key: "$P=F/A$\nAnswer: 4" });
const ch = (...t) => t.map((md, i) => ({ id: "abcd"[i], md }));
const P = [
  { code: "PHYS_DN1", type: "num", answer: "4", tries: 2, body: [{ type: "text", md: "What is 2 + 2?" }], noob: { tier: 1 }, saccharine: sac(1) },
  { code: "PHYS_DM1", type: "mc", shuffle: false, correct: "a", body: [{ type: "text", md: "Pick the first one." }], choices: ch("one", "two", "three", "four"),
    wrong: ["b", "c", "d"].map(c => ({ choice: c, hint: "QUACK. Not " + c })), saccharine: sac(2) },
  { code: "PHYS_DA1", type: "mc", pick: "all", shuffle: false, correct: ["a", "c"], body: [{ type: "text", md: "Pick the odd ones." }], choices: ch("one", "two", "three", "four"),
    wrong: ["b", "d"].map(c => ({ choice: c, error: "misread", hint: "QUACK. Not " + c })), saccharine: sac(3) },
  { code: "PHYS_DX1", type: "num", answer: "4", tries: 2, body: [{ type: "text", md: "No key here: 2 + 2?" }], noob: { tier: 1 } },
];
mkdirSync(BANKS);
writeFileSync(join(BANKS, "BANK_DOOR.json"), JSON.stringify({ v: 1, problems: P }));
const srv = spawn("python3", [join(ROOT, "serve.py"), String(PORT)], { env: { ...process.env, STEM_BANKS: BANKS, STEM_FRONT: "BANK_DOOR", STEM_FRONT_TITLE: "Exam 3", STEM_TODAY: "2026-10-23", STEM_TRIES: join(TMP, "tries.json") }, stdio: "ignore" });
for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + "/")).ok) break; } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 100)); }
let failures = 0;
async function step(name, fn) { if (process.env.ONLY && !name.includes(process.env.ONLY)) return; try { await fn(); console.log("ok  ", name); } catch (e) { failures++; console.log("FAIL", name, "\n     ", String(e.message).slice(0, 700)); } }
async function open(browser, w, h, code, o = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, serviceWorkers: "block", reducedMotion: o.reduced ? "reduce" : "no-preference" });
  await ctx.addCookies([{ name: "stem-mode", value: "sugar", url: BASE }, { name: "stem-mode-v", value: "2", url: BASE }]);
  await ctx.route(/youtube|ytimg|googlevideo/, r => r.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><body></body>" }));
  await ctx.route(/\/explain$/, r => r.fulfill({ status: 200, contentType: "text/plain; charset=utf-8", body: "Pressure is force over area." }));
  await ctx.addInitScript(() => { try { localStorage.setItem("stem-ob", "done"); localStorage.setItem("stem-welcome-BANK_DOOR", "1"); localStorage.setItem("stem-jev", "0"); for (const b of ["right", "miss", "three", "redo"]) localStorage.setItem("stem-ob-rw-" + b, "9"); } catch { /* blocked */ } });
  nth = 0;
  const page = await ctx.newPage();
  await page.goto(`${BASE}/#${code}`);
  await page.waitForFunction(c => document.querySelector("#pcode")?.textContent === c || !!document.querySelector("#q .opt, #ans"), code, { timeout: 10000 });
  await page.waitForTimeout(700);
  return { ctx, page };
}
/* every Cluck control that could be on screen on desktop: visible = laid out, not hidden */
const KILLED = "#wish .wchip, .rbox .wchip, .cue-chip, .cl-peek .cl-cta, #clBack, #origHd";
const vis = (page, sel) => page.evaluate(s => [...document.querySelectorAll(s)].filter(e => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== "hidden" && !e.closest("[hidden]")).map(e => e.id || e.className), sel);
const ctl = page => vis(page, "#door, " + KILLED);
let nth = 0;
const answer = async (page, type, right) => {
  const bad = ["b", "c"][nth++ % 2];
  if (type === "num") { await page.fill("#ans", right ? "4" : "1"); await page.keyboard.press("Enter"); }
  else if (type === "mc") { await page.click(`#q .opt[data-id=${right ? "a" : bad}]`); await page.keyboard.press("Enter"); }
  else { for (const id of right ? ["a", "c"] : [bad]) await page.click(`#q .opt[data-id=${id}]`); await page.evaluate(() => document.querySelector("#mcGo").click()); }
  await page.waitForTimeout(1300);
};
const TYPES = [["num", "PHYS_DN1"], ["mc", "PHYS_DM1"], ["all", "PHYS_DA1"]];
const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
try {
  for (const w of [1024, 1280, 1440]) {
    for (const [type, code] of TYPES) {
      for (const state of ["wrong", "right", "out"]) await step(`${w} ${type} ${state}: none before the try; then exactly one control, #door, none of the killed entries`, async () => {
        const { ctx, page } = await open(browser, w, 800, code);
        assert.deepEqual(await ctl(page), [], "a Cluck control before the first try");
        if (state === "out") { await answer(page, type, false); await answer(page, type, false); }
        else await answer(page, type, state === "right");
        const c = await ctl(page);
        assert.deepEqual(c, ["door"], "controls: " + JSON.stringify(c));
        if (SHOT) await page.screenshot({ path: join(SHOT, `${w}-${type}-${state}.png`) });
        await ctx.close();
      });
    }
    await step(`${w} no-key question: zero Cluck controls before and after grading`, async () => {
      const { ctx, page } = await open(browser, w, 800, "PHYS_DX1");
      assert.deepEqual(await ctl(page), []);
      await answer(page, "num", false); assert.deepEqual(await ctl(page), [], "a door on a question with no key");
      await answer(page, "num", true); assert.deepEqual(await ctl(page), []);
      await ctx.close();
    });
    await step(`${w} the door hides while Cluck is open, is back on close (X: the column goes)`, async () => {
      const { ctx, page } = await open(browser, w, 800, "PHYS_DN1");
      await answer(page, "num", false);
      await page.click("#door");
      await page.waitForSelector("#cluck:not([hidden])");
      assert.deepEqual(await ctl(page), [], "a Cluck control while Cluck is open: the door must hide");
      await page.click("#cluck .cl-x");
      await page.waitForTimeout(500);
      assert.deepEqual(await ctl(page), ["door"], "after the X: one door, no 'Show him'");
      await page.click("#door"); await page.waitForSelector("#cluck:not([hidden])");
      await ctx.close();
    });
    await step(`${w} the sunrise is a status: a click opens nothing, no focus, no CTA words; it jiggles the door once`, async () => {
      const { ctx, page } = await open(browser, w, 800, "PHYS_DN1");
      await answer(page, "num", false);
      await page.evaluate(() => { window.__tap = 0; window.stemDuck.rise({ line: "Stuck? Click me.", onTap: () => { window.__tap++; } }); });
      await page.waitForTimeout(400);
      const s = await page.evaluate(() => { const b = document.querySelector(".ck-rise .ck-peek"), r = document.querySelector(".ck-rise");
        return { dis: b.disabled, tab: b.tabIndex, hid: b.getAttribute("aria-hidden"), cur: getComputedStyle(b).cursor, say: r.querySelector(".ck-say").textContent, jig: document.querySelector("#door").classList.contains("jiggle") }; });
      assert.ok(s.dis && s.tab === -1 && s.hid === "true", "the duck is focusable / exposed as a button: " + JSON.stringify(s));
      assert.notEqual(s.cur, "pointer");
      assert.ok(!/click|tap|ask/i.test(s.say), "CTA wording in the sunrise: " + s.say);
      assert.ok(s.jig, "the door did not jiggle");
      await page.click(".ck-rise .ck-peek", { force: true, timeout: 1500 }).catch(() => {});
      assert.equal(await page.evaluate(() => window.__tap), 0, "a tap on the status ran an action");
      assert.ok(await page.evaluate(() => document.querySelector("#cluck")?.hidden !== false), "the status opened Cluck");
      await ctx.close();
    });
    await step(`${w} reduced motion: the sunrise does not jiggle the door`, async () => {
      const { ctx, page } = await open(browser, w, 800, "PHYS_DN1", { reduced: true });
      await answer(page, "num", false);
      await page.evaluate(() => window.stemDuck.rise({ line: "Cluck's right here." }));
      await page.waitForTimeout(300);
      assert.equal(await page.evaluate(() => document.querySelector("#door").classList.contains("jiggle")), false);
      await ctx.close();
    });
  }
  await step("4 consecutive questions (Next between; types and the key-less one in bank order): no door before a try, one after (none on the key-less)", async () => {
    const { ctx, page } = await open(browser, 1280, 800, "PHYS_DN1");
    const seen = new Set();
    for (let i = 0; i < 4; i++) {
      const code = await page.evaluate(() => document.querySelector("#pcode")?.textContent), type = await page.evaluate(() => document.querySelector("#ans") ? "num" : document.querySelector("#q .choices.all") ? "all" : "mc");
      seen.add(code);
      const want = code === "PHYS_DX1" ? [] : ["door"];
      assert.deepEqual(await ctl(page), [], `${code}: a control before the try`);
      nth = 0; await answer(page, type, false);
      assert.deepEqual(await ctl(page), want, `${code}: after the first try`);
      if (type === "num") await answer(page, type, true); else if (type === "mc") await answer(page, type, true); else await answer(page, type, true);
      assert.deepEqual(await ctl(page), want, `${code}: after grading`);
      await page.evaluate(() => document.querySelector("#q .nx")?.click());
      await page.waitForTimeout(900);
    }
    assert.ok(seen.size >= 3, "the walk did not reach 3 different questions: " + [...seen]);
    await ctx.close();
  });
  await step("phone 390: the old entries are still there (no door)", async () => {
    const { ctx, page } = await open(browser, 390, 844, "PHYS_DN1");
    await answer(page, "num", false);
    assert.equal((await vis(page, "#door")).length, 0, "a door on the phone");
    assert.ok((await vis(page, "#wish .wchip, .cl-peek .cl-cta")).length >= 1, "the phone lost its Cluck entry");
    await ctx.close();
  });
} finally { await browser.close(); srv.kill(); }
console.log(failures ? `${failures} FAIL` : "all ok");
process.exit(failures ? 1 : 0);
