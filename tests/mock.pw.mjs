// The night-before mock (W103b, PLAN §6.9; shuffle.mjs mockList / mockNext / mockAnswer, nav.js): ?mock=1 or the #qmodes button plays the
// front bank's PE3 questions in exam order (title "X3 Q<n> ..., practice" until exam_q / twins land), ONE try each, no hint / Cluck
// peek / reveal; then the score line, and each miss comes back in exam order with the normal flow (hint, a second try, Cluck).
// A fixture bank stands in for BANK_P3X. Starts its own serve.py with a throwaway banks/ folder:   node tests/mock.pw.mjs [port]
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
const PORT = +(process.argv[2] || 8841), BASE = `http://localhost:${PORT}`;
const TMP = mkdtempSync(join(tmpdir(), "mock-")), BANKS = join(TMP, "banks");
/* file order is not exam order; a twin, an other-quiz item and two dead-easy (T28 opener) stay out of the mock */
const ITEMS = [["PHYS_MQ3", "X3 Q3 third, practice"], ["PHYS_OQ1", "Quiz 11 Q1: other"], ["PHYS_MQ1", "X3 Q1 first, practice"],
  ["PHYS_WQ1", "X3 Q1 twin first numbers"], ["PHYS_MQ2", "X3 Q2 second, practice"], ["PHYS_DQ1", "Warm-up one"], ["PHYS_DQ2", "Warm-up two"]];
const ANS = Object.fromEntries(ITEMS.map(([c], i) => [c, String(i + 3)]));
mkdirSync(BANKS);
writeFileSync(join(BANKS, "BANK_P3X.json"), JSON.stringify({ v: 1, problems: ITEMS.map(([code, title], i) => ({ code, title, type: "num", answer: ANS[code],
  nudge: "Check the units of your answer.", body: [{ type: "text", md: `${title}: 2 + ${i + 1}` }], ...(/^PHYS_DQ/.test(code) ? { saccharine: { dead: true } } : {}) })) }));
/* the queue salt pinned to one whose opener is TWO dead-easy (shuffle.mjs deadOpen): "/" opens on a dead-easy (never on X3 Q1, so ?mock=1
   must navigate after app.js's first load), and the mock's first Next must beat the opener's second dead-easy */
const { deadOpen } = await import("../shuffle.mjs");
const SALT = Array.from({ length: 200 }, (_, i) => "m" + i).find(s => deadOpen({ salt: s, pos: 1, seen: { PHYS_DQ1: { n: 1 } }, hist: [{ c: "PHYS_DQ1" }] }, ["PHYS_DQ1", "PHYS_DQ2"]) === "PHYS_DQ2");
assert.ok(SALT, "no salt with a two dead-easy opener");
const srv = spawn("python3", [join(ROOT, "serve.py"), String(PORT)], { env: { ...process.env, STEM_BANKS: BANKS, STEM_FRONT: "BANK_P3X", STEM_FRONT_TITLE: "Exam 3", STEM_TRIES: join(TMP, "tries.json") }, stdio: "ignore" });
for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + "/")).ok) break; } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 100)); }

let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); }
  catch (e) { failures++; console.log("FAIL", name, "\n     ", e.message.slice(0, 700)); }
}
const opened = (page, c, timeout = 8000) => page.waitForFunction(c => document.querySelector("#pcode")?.textContent === c && !document.querySelector("#freeze").hidden
  && !document.querySelector("#q").classList.contains("closed") && (!document.querySelector("#splash") || getComputedStyle(document.querySelector("#splash")).opacity === "0"), c, { timeout });
const tries = page => page.evaluate(() => window.__drill.state.tries.length);
async function answer(page, v) {
  const n = await tries(page);
  await page.fill("#ans", v); await page.click("#ansGo");
  await page.waitForFunction(n => window.__drill.state.tries.length > n, n, { timeout: 4000 });
  await page.waitForTimeout(1200);                                  // past the wrong-answer peek's ~0.7 s
}
const look = page => page.evaluate(() => ({
  closed: document.querySelector("#q").classList.contains("closed"),
  hint: !!document.querySelector("#fb .cluck, #q .chk .cluck"),
  pips: !!document.querySelector("#q .pips:not(.spent)"),
  wish: !!document.querySelector("#wish:not([hidden])"),
  duck: !!document.querySelector(".ck-rise.on:not([hidden]):not(.out)"),
}));
const next = page => page.click("#qnext");
const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, serviceWorkers: "block" });
  await ctx.addInitScript(s => { try {
    localStorage.setItem("stem-ob", "done"); for (const b of ["right", "miss", "three", "redo"]) localStorage.setItem("stem-ob-rw-" + b, "9");
    if (!localStorage.getItem("stem-q-BANK_P3X")) localStorage.setItem("stem-q-BANK_P3X", JSON.stringify({ v: 1, salt: s, pos: 0, seen: {}, hist: [], at: -1 }));
  } catch { /* blocked */ } }, SALT);
  const page = await ctx.newPage();
  const errs = []; page.on("pageerror", e => errs.push(e.message));

  await step("?mock=1: the mock opens on X3 Q1, the query goes, the button hides while it runs", async () => {
    await page.goto(BASE + "/?mock=1");
    await opened(page, "PHYS_MQ1");
    assert.equal(new URL(page.url()).search, "", "the ?mock=1 query stayed");
    assert.deepEqual(await page.evaluate(() => window.stemMock.state().list), ["PHYS_MQ1", "PHYS_MQ2", "PHYS_MQ3"], "exam order, templates only");
    assert.equal(await page.$eval("#qmock", b => b.hidden), true, "the mock button shows while the mock runs");
  });
  await step("mock phase: a wrong answer closes the question (one try), no hint, no pips, no Cluck peek", async () => {
    await answer(page, "999");
    assert.deepEqual(await look(page), { closed: true, hint: false, pips: false, wish: false, duck: false });
  });
  await step("mock phase: Next plays the exam order; a right one, then a skipped one", async () => {
    await next(page); await opened(page, "PHYS_MQ2");
    await answer(page, ANS.PHYS_MQ2);
    await next(page); await opened(page, "PHYS_MQ3");
  });
  await step("the end: the score line, then the misses in exam order, open again, with the normal flow (hint, a second try, Cluck)", async () => {
    await next(page); await opened(page, "PHYS_MQ1");
    await page.waitForFunction(() => /1 \/ 3/.test(document.querySelector("#toast")?.textContent || ""), null, { timeout: 3000 });
    await answer(page, "999");
    const L = await look(page);
    assert.equal(L.closed, false, "the replay has its second try");
    assert.equal(L.hint, true, "the replay shows the hint");
    assert.equal(L.pips, true, "the replay shows its tries");
    assert.equal(L.duck, true, "Cluck peeks after the replay's first wrong");
    await next(page); await opened(page, "PHYS_MQ3");
    assert.equal(await page.evaluate(() => window.stemMock.on()), false);
    await next(page);
    await page.waitForFunction(() => window.stemMock.state().done === true, null, { timeout: 4000 });
    assert.equal(await page.$eval("#qmock", b => b.hidden), false, "the button is back");
  });
  await step("the #qmodes button on X3 Q1 itself restarts it in place (a fresh round, no 'only question' note); a reload keeps the mock", async () => {
    await page.evaluate(() => { location.hash = "#PHYS_MQ1"; });
    await page.waitForFunction(() => document.querySelector("#pcode")?.textContent === "PHYS_MQ1" && document.querySelector("#q").classList.contains("closed"), null, { timeout: 8000 })
      .catch(() => { throw new Error("X3 Q1 by its code: not shown closed (its mock try)"); });
    await page.click("#qlistBtn");
    await page.click("#qmock");
    await opened(page, "PHYS_MQ1").catch(async () => { throw new Error("the restart did not reopen X3 Q1: " + JSON.stringify(await page.evaluate(() => ({ m: window.stemMock.state(), item: window.stemQueue.item(), closed: document.querySelector("#q").classList.contains("closed"), toast: document.querySelector("#toast")?.textContent })))); });
    assert.equal(await page.evaluate(() => window.stemMock.state().at), 1, "X3 Q1 is the mock's first");
    assert.equal(await page.evaluate(() => window.stemMock.on()), true);
    assert.doesNotMatch(await page.evaluate(() => document.querySelector("#toast")?.textContent || ""), /only question/);
    await page.reload();
    await page.waitForFunction(() => document.querySelector("#pcode")?.textContent === "PHYS_MQ1", null, { timeout: 8000 });
    await next(page); await opened(page, "PHYS_MQ2");
    assert.deepEqual(errs, [], "no page errors");
  });
  await ctx.close();
} finally {
  await browser.close();
  srv.kill();
}
console.log(failures ? `${failures} FAIL` : "all ok");
process.exit(failures ? 1 : 0);
