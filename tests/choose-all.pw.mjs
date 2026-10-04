// mc pick all (design/CHOOSE-ALL.md §4) in HARD mode (design/EASY.md: the stem-mode=hard cookie, as ADMIN_ sets it): checkboxes, no
// "None of these" row (nothing ticked is the answer "none"), keys, strike + ticks kept, miss, prove mode, restore on reload.
// Server mode uses CSCI26_A7K from problems.json; upload mode an inline file. Starts its own serve.py with a throwaway tries.json:
//   node tests/choose-all.pw.mjs [port]
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { pw = require("/opt/node22/lib/node_modules/playwright"); }

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = +(process.argv[2] || 8819), BASE = `http://localhost:${PORT}`;
const TRIES = join(mkdtempSync(join(tmpdir(), "chooseall-")), "tries.json");
const CODE = "CSCI26_A7K";
const FILE = { v: 1, problems: [{ code: "CSCI26_U01", type: "mc", pick: "all", shuffle: false, body: [{ type: "text", md: "Even numbers?" }],
  choices: [{ id: "a", md: "2" }, { id: "b", md: "3" }, { id: "c", md: "4" }, { id: "d", md: "5" }, { id: "e", md: "None of these", lock: true }],
  correct: ["a", "c"], miss: "QUACK. U01 miss", wrong: ["b", "d", "e"].map(c => ({ choice: c, error: "misread", hint: `QUACK. U01 ${c}` })) }] };
/* its own file: an upload opens the first problem in this browser's shuffled list order (offline.js first()), so a second problem in
   FILE would open instead of U01 half the time.
   prove mode + a locked "None of these" (PHYS_NPT, Oct 3: ticking None left the other rows blank, so Check never lit up) */
const FILE2 = { v: 1, problems: [{ code: "CSCI26_U02", type: "mc", pick: "all", shuffle: false, fix: { type: "num", how: "a number" }, body: [{ type: "text", md: "Squares?" }],
    choices: [{ id: "a", md: "$2^2 = 4$" }, { id: "b", md: "$3^2 = 8$" }, { id: "c", md: "None of these", lock: true }, { id: "d", md: "$4^2 = 15$" }],
    correct: ["a"], miss: "QUACK. U02 miss",
    wrong: [{ choice: "b", error: "misread", hint: "QUACK. U02 b", fix: { answer: "9" } }, { choice: "d", error: "misread", hint: "QUACK. U02 d", fix: { answer: "16" } },
      { choice: "c", error: "other", hint: "QUACK. U02 none" }] }] };

const srv = spawn("python3", [join(ROOT, "serve.py"), String(PORT)], { env: { ...process.env, STEM_TRIES: TRIES }, stdio: "ignore" });
for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + "/")).ok) break; } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 100)); }

let fails = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); }
  catch (e) { fails++; console.log("FAIL", name, "\n     ", e.message.slice(0, 700)); }
}
const opened = (page, code) => page.waitForFunction(c => document.querySelector("#pcode")?.textContent === c && !document.querySelector("#freeze").hidden
  && (!document.querySelector("#splash") || getComputedStyle(document.querySelector("#splash")).opacity === "0"), code, { timeout: 8000 });
const row = (page, id) => page.locator(`#q .opt[data-id="${id}"]`);
const st = page => page.evaluate(() => ({
  on: [...document.querySelectorAll("#q .opt")].filter(o => o.getAttribute("aria-checked") === "true").map(o => o.dataset.id).sort(),
  wrong: [...document.querySelectorAll("#q .opt.wrong")].map(o => o.dataset.id), right: [...document.querySelectorAll("#q .opt.right")].map(o => o.dataset.id).sort(),
  dis: [...document.querySelectorAll("#q .opt:disabled")].map(o => o.dataset.id).sort(), go: document.querySelector("#mcGo")?.disabled,
  fb: document.querySelector("#fb").textContent, finished: window.__drill.state.finished, focus: document.activeElement?.dataset?.id || document.activeElement?.id }));
/* graded: take 5f put no verdict words on the page (rows / boxes carry the icons, "One more try" is the toast), so wait for
   the feedback area (hint, lock or can't-read line) or a right row instead of "#fb .verdict" */
async function check(page) {
  await page.click("#mcGo");
  await page.waitForFunction(() => document.querySelector("#fb").textContent.trim() || document.querySelector("#q .opt.right"), null, { timeout: 4000 });
  await page.waitForTimeout(150);
}
const okRows = page => page.$$eval("#q .opt.right", os => os.filter(o => o.querySelector('.badge use[href="#i-ok"]')).map(o => o.dataset.id).sort());

const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
const newCtx = browser.newContext.bind(browser);
browser.newContext = async o => { const c = await newCtx(o); await c.addCookies([{ name: "stem-mode", value: "diet", url: BASE }]); return c; };
try {
  for (const [name, viewport, touch] of [["phone", { width: 390, height: 844 }, true], ["desktop", { width: 1280, height: 900 }, false]]) {
    const ctx = await browser.newContext({ viewport, hasTouch: touch, serviceWorkers: "block" }), page = await ctx.newPage();
    const tap = l => touch ? l.tap() : l.click();
    await page.goto(`${BASE}/#${CODE}`); await opened(page, CODE);

    await step(`${name}: checkbox group, no default how line in diet, no None row, Check live with nothing ticked, never one row`, async () => {
      const a = await page.evaluate(() => {
        const g = document.querySelector("#q .choices");
        return { role: g.getAttribute("role"), lab: g.getAttribute("aria-label"), how: document.querySelector("#how")?.textContent,
          roles: [...g.querySelectorAll(".opt")].map(o => o.getAttribute("role")), inline: g.classList.contains("inline"),
          radius: getComputedStyle(g.querySelector(".badge")).borderRadius, letters: [...g.querySelectorAll(".lt")].map(x => x.textContent).join(""),
          arrows: g.querySelectorAll(".send").length };
      });
      assert.deepEqual([a.role, a.lab, a.inline, a.letters, a.arrows], ["group", "Choices", false, "ABCD", 0]);
      assert.equal(a.how, undefined, "diet shows the question as authored: no default how line");
      assert.ok(a.roles.every(r => r === "checkbox"));
      assert.equal(a.radius, "4px", "square badge");
      assert.equal((await st(page)).go, false, "nothing ticked = none true: Check is live");
    });
    await step(`${name}: ticks toggle; no lock-in dimming; back to none keeps Check live`, async () => {
      await tap(row(page, "a")); await tap(row(page, "c"));
      let s = await st(page); assert.deepEqual(s.on, ["a", "c"]); assert.equal(s.go, false);
      assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector("#problem")).filter), "none");
      assert.equal(await row(page, "e").count(), 0, "None of these row");
      await tap(row(page, "b")); assert.deepEqual((await st(page)).on, ["a", "b", "c"]);
      for (const id of ["a", "b", "c"]) await tap(row(page, id));
      s = await st(page); assert.deepEqual(s.on, []); assert.equal(s.go, false);
    });
    await step(`${name}: keys: arrows move focus only, Space / letter / digit toggle`, async () => {
      const first = page.locator("#q .opt").first(), ids = await page.$$eval("#q .opt", os => os.map(o => o.dataset.id));
      await first.focus();
      await page.keyboard.press("ArrowDown");
      let s = await st(page); assert.equal(s.focus, ids[1]); assert.deepEqual(s.on, []);
      await page.keyboard.press(" "); assert.deepEqual((await st(page)).on, [ids[1]]);
      await page.keyboard.press(" "); assert.deepEqual((await st(page)).on, []);
      await page.keyboard.press("c"); s = await st(page); assert.deepEqual(s.on, [ids[2]]); assert.equal(s.focus, ids[2]);
      await page.keyboard.press("3"); assert.deepEqual((await st(page)).on, []);
    });
    await step(`${name}: wrong set: first distractor (authored order) struck, other ticks stay; Enter = Check`, async () => {
      await tap(row(page, "d")); await tap(row(page, "a")); await tap(row(page, "b"));
      await row(page, "a").focus(); await page.keyboard.press("Enter");
      await page.waitForSelector("#toast.on"); await page.waitForTimeout(150);
      const s = await st(page);
      assert.deepEqual(s.wrong, ["b"]); assert.deepEqual(s.dis, ["b"]); assert.deepEqual(s.on, ["a", "d"]);
      assert.match(await page.textContent("#toast.on"), /One more try/); assert.match(s.fb, /QUACK/); assert.equal(s.finished, false);
      const t = await page.evaluate(() => window.__drill.state.tries.at(-1));
      assert.deepEqual([[...t.c].sort(), t.v, t.s, t.a.length], [["a", "b", "d"], "wrong", "b", 3]);   // copy payload: ids + letters per try
      const ls = await page.$$eval("#q .opt", (os, c) => c.map(id => os.find(o => o.dataset.id === id).dataset.l), t.c);
      assert.deepEqual(t.l, ls);
    });
    await step(`${name}: reload restores the strike and the ticks`, async () => {
      await page.reload(); await opened(page, CODE); await page.waitForTimeout(300);
      const s = await st(page);
      assert.deepEqual(s.wrong, ["b"]); assert.deepEqual(s.on, ["a", "d"]); assert.equal(s.go, false); assert.match(s.fb, /QUACK/);
    });
    await step(`${name}: subset of correct = miss, out of tries, closed`, async () => {
      await tap(row(page, "d")); await check(page);
      const s = await st(page);
      assert.equal(s.finished, true); assert.match(s.fb, /Every tick you made is right/); assert.match(s.fb, /Ask Tony/);
      assert.deepEqual(s.wrong, ["b"]);
      assert.equal(await page.isVisible("#mcGo"), false);
    });
    await ctx.close();

    const c2 = await browser.newContext({ viewport, hasTouch: touch, serviceWorkers: "block" }), p2 = await c2.newPage();
    await step(`${name}: right set = correct; survives a reload`, async () => {
      await p2.goto(`${BASE}/#${CODE}`); await opened(p2, CODE);
      await (touch ? row(p2, "c").tap() : row(p2, "c").click()); await (touch ? row(p2, "a").tap() : row(p2, "a").click());
      await check(p2);
      let s = await st(p2); assert.deepEqual(s.right, ["a", "c"]); assert.equal(s.finished, true); assert.deepEqual(await okRows(p2), ["a", "c"]);
      await p2.reload(); await opened(p2, CODE); await p2.waitForTimeout(300);
      s = await st(p2); assert.deepEqual(s.right, ["a", "c"]); assert.equal(s.finished, true); assert.deepEqual(await okRows(p2), ["a", "c"]);
    });
    await c2.close();

    /* prove mode (X + typed fix boxes) is gone in both modes (Tony, Oct 3): a prove-mode question is plain tick-the-true-ones */
    const c3 = await browser.newContext({ viewport, hasTouch: touch, serviceWorkers: "block" }), p3 = await c3.newPage();
    await step(`${name}: a prove-mode question has no X and no boxes; nothing ticked can be checked`, async () => {
      await p3.goto(`${BASE}/#CSCI26_A8F`); await opened(p3, "CSCI26_A8F");
      const r = row(p3, "a"); await (touch ? r.tap() : r.click()); await (touch ? r.tap() : r.click());
      assert.equal(await r.getAttribute("aria-checked"), "false"); assert.equal(await r.getAttribute("data-mark"), null, "X mark");
      assert.equal(await p3.locator("#q .fix").count(), 0);
      assert.equal((await st(p3)).go, false, "Check off");
    });
    await c3.close();
  }

  /* upload mode: gradeLocal + its saved signatures */
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" }), page = await ctx.newPage();
  await step("upload: miss, a repeat is free, reload keeps state, then the right set", async () => {
    await page.goto(BASE + "/");
    const [fc] = await Promise.all([page.waitForEvent("filechooser"), page.click("#upload")]);
    await fc.setFiles({ name: "all.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(FILE)) });
    await opened(page, "CSCI26_U01");
    await row(page, "a").click(); await check(page);
    let s = await st(page); assert.match(s.fb, /U01 miss/); assert.deepEqual(s.on, ["a"]); assert.deepEqual(s.wrong, []);
    await check(page);
    assert.equal(await page.evaluate(() => window.__drill.state.triesLeft), 1, "same set again: no try spent");
    await page.reload(); await opened(page, "CSCI26_U01"); await page.waitForTimeout(300);
    s = await st(page); assert.deepEqual(s.on, ["a"]); assert.match(s.fb, /U01 miss/); assert.equal(s.finished, false);
    await row(page, "c").click(); await check(page);
    s = await st(page); assert.deepEqual(s.right, ["a", "c"]); assert.deepEqual(await okRows(page), ["a", "c"]);
  });

  await ctx.close();
} finally { await browser.close(); srv.kill(); }
if (fails) { console.log(`${fails} failing`); process.exit(1); }
console.log("all ok");
