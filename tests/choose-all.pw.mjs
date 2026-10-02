// mc pick all (design/CHOOSE-ALL.md §4): checkboxes, exclusive "None of these", keys, strike + ticks kept, miss, restore on reload.
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
async function check(page) { await page.click("#mcGo"); await page.waitForSelector("#fb .verdict", { timeout: 4000 }); await page.waitForTimeout(150); }

const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
try {
  for (const [name, viewport, touch] of [["phone", { width: 390, height: 844 }, true], ["desktop", { width: 1280, height: 900 }, false]]) {
    const ctx = await browser.newContext({ viewport, hasTouch: touch, serviceWorkers: "block" }), page = await ctx.newPage();
    const tap = l => touch ? l.tap() : l.click();
    await page.goto(`${BASE}/#${CODE}`); await opened(page, CODE);

    await step(`${name}: checkbox group, how line, Check off, never one row`, async () => {
      const a = await page.evaluate(() => {
        const g = document.querySelector("#q .choices");
        return { role: g.getAttribute("role"), lab: g.getAttribute("aria-labelledby"), how: document.querySelector("#how")?.textContent,
          roles: [...g.querySelectorAll(".opt")].map(o => o.getAttribute("role")), inline: g.classList.contains("inline"),
          radius: getComputedStyle(g.querySelector(".badge")).borderRadius, letters: [...g.querySelectorAll(".lt")].map(x => x.textContent).join(""),
          arrows: g.querySelectorAll(".send").length };
      });
      assert.deepEqual([a.role, a.lab, a.inline, a.letters, a.arrows], ["group", "how", false, "ABCDE", 0]);
      assert.ok(a.how && a.how.length > 3, "how line");
      assert.ok(a.roles.every(r => r === "checkbox"));
      assert.equal(a.radius, "4px", "square badge");
      assert.equal((await st(page)).go, true, "Check disabled with nothing ticked");
    });
    await step(`${name}: ticks toggle; None of these is exclusive; no lock-in dimming`, async () => {
      await tap(row(page, "a")); await tap(row(page, "c"));
      let s = await st(page); assert.deepEqual(s.on, ["a", "c"]); assert.equal(s.go, false);
      assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector("#problem")).filter), "none");
      await tap(row(page, "e")); assert.deepEqual((await st(page)).on, ["e"]);
      await tap(row(page, "b")); assert.deepEqual((await st(page)).on, ["b"]);
      await tap(row(page, "b")); s = await st(page); assert.deepEqual(s.on, []); assert.equal(s.go, true);
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
      await page.waitForSelector("#fb .verdict"); await page.waitForTimeout(150);
      const s = await st(page);
      assert.deepEqual(s.wrong, ["b"]); assert.deepEqual(s.dis, ["b"]); assert.deepEqual(s.on, ["a", "d"]);
      assert.match(s.fb, /One more try/); assert.match(s.fb, /QUACK/); assert.equal(s.finished, false);
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
      let s = await st(p2); assert.deepEqual(s.right, ["a", "c"]); assert.equal(s.finished, true); assert.match(s.fb, /Correct/);
      await p2.reload(); await opened(p2, CODE); await p2.waitForTimeout(300);
      s = await st(p2); assert.deepEqual(s.right, ["a", "c"]); assert.equal(s.finished, true); assert.match(s.fb, /Correct/);
    });
    await c2.close();

    /* prove mode (fix): every unlocked row ticked or X'd, every X with its typed fix */
    const c3 = await browser.newContext({ viewport, hasTouch: touch, serviceWorkers: "block" }), p3 = await c3.newPage();
    const P = "CSCI26_A8F", t3 = id => touch ? row(p3, id).tap() : row(p3, id).click();
    const box = id => p3.locator(`#q .ch[data-id="${id}"] .fix`);
    const marks = () => p3.$$eval("#q .opt", os => Object.fromEntries(os.map(o => [o.dataset.id, o.getAttribute("aria-checked") === "true" ? "on" : o.dataset.mark || ""])));
    await step(`${name} prove: tap cycles blank, tick, X (box shows), blank; keys X / Backspace / Space`, async () => {
      await p3.goto(`${BASE}/#${P}`); await opened(p3, P);
      assert.equal(await p3.locator("#q .fix:not([hidden])").count(), 0);
      await t3("a"); assert.equal((await marks()).a, "on");
      await t3("a"); assert.equal((await marks()).a, "x"); assert.ok(await box("a").isVisible());
      assert.equal(await p3.getAttribute('#q .ch[data-id="a"] .fix input', "placeholder"), "Type the correct count.");
      await t3("a"); assert.equal((await marks()).a, ""); assert.ok(!(await box("a").isVisible()));
      await row(p3, "b").focus();
      await p3.keyboard.press("x"); assert.equal((await marks()).b, "x");
      await p3.keyboard.press("Backspace"); assert.equal((await marks()).b, "");
      await p3.keyboard.press(" "); assert.equal((await marks()).b, "on");
      await p3.keyboard.press(" "); assert.equal((await marks()).b, "");
    });
    await step(`${name} prove: Check needs every row marked and every X filled; a wrong fix turns its box red`, async () => {
      await t3("a"); await t3("c"); await t3("b"); await t3("b"); await t3("d"); await t3("d");
      assert.deepEqual(await marks(), { a: "on", b: "x", c: "on", d: "x" });
      assert.equal((await st(p3)).go, true, "empty fixes: Check off");
      await box("b").locator("input").fill("20");
      assert.equal((await st(p3)).go, true, "one fix still empty");
      await box("d").locator("input").fill("16");
      assert.equal((await st(p3)).go, false);
      await check(p3);
      const s = await st(p3);
      assert.match(s.fb, /You kept the order/); assert.equal(s.finished, false);
      assert.ok(await box("b").evaluate(e => e.classList.contains("bad"))); assert.ok(!(await box("d").evaluate(e => e.classList.contains("bad"))));
      assert.deepEqual(await marks(), { a: "on", b: "x", c: "on", d: "x" });
      const t = await p3.evaluate(() => window.__drill.state.tries.at(-1));
      assert.deepEqual(t.f, { b: "20", d: "16" }); assert.equal(t.w, "b");
      assert.deepEqual(Object.values(t.a.fix).sort(), ["16", "20"]);           // copy payload: fixes by letter
    });
    await step(`${name} prove: reload restores marks, texts and the red box; then the right fix is correct`, async () => {
      await p3.reload(); await opened(p3, P); await p3.waitForTimeout(300);
      assert.deepEqual(await marks(), { a: "on", b: "x", c: "on", d: "x" });
      assert.equal(await box("b").locator("input").inputValue(), "20");
      assert.ok(await box("b").evaluate(e => e.classList.contains("bad")));
      await box("b").locator("input").fill("10");
      assert.ok(!(await box("b").evaluate(e => e.classList.contains("bad"))), "typing clears the red");
      await box("b").locator("input").press("Enter");                          // Enter in the last box = Check
      await p3.waitForTimeout(400);
      const s = await st(p3);
      assert.match(s.fb, /Correct/); assert.deepEqual(s.right, ["a", "c"]);
      assert.ok(await box("d").evaluate(e => e.classList.contains("ok")));
    });
    await c3.close();
    const c4 = await browser.newContext({ viewport, hasTouch: touch, serviceWorkers: "block" }), p4 = await c4.newPage();
    await step(`${name} prove: a ticked false one is struck, X'd, and its box takes focus`, async () => {
      await p4.goto(`${BASE}/#${P}`); await opened(p4, P);
      for (const id of ["a", "b", "c", "d", "d"]) await (touch ? row(p4, id).tap() : row(p4, id).click());
      await p4.fill('#q .ch[data-id="d"] .fix input', "16");
      await check(p4);
      const s = await st(p4);
      assert.deepEqual(s.wrong, ["b"]); assert.match(s.fb, /Divide by what/);
      assert.equal(await p4.evaluate(() => document.activeElement === document.querySelector('#q .ch[data-id="b"] .fix input')), true);
      assert.equal(s.go, true, "struck row's fix is empty: Check off");
      await p4.fill('#q .ch[data-id="b"] .fix input', "10");
      assert.equal((await st(p4)).go, false);
      await p4.reload(); await opened(p4, P); await p4.waitForTimeout(300);
      const r = await st(p4);
      assert.deepEqual(r.wrong, ["b"]); assert.ok(await p4.isVisible('#q .ch[data-id="b"] .fix'), "struck row keeps its box after reload");
    });
    await c4.close();
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
    s = await st(page); assert.deepEqual(s.right, ["a", "c"]); assert.match(s.fb, /Correct/);
  });
  await ctx.close();
} finally { await browser.close(); srv.kill(); }
if (fails) { console.log(`${fails} failing`); process.exit(1); }
console.log("all ok");
