// The night-before mock (W103b, PLAN §6.9; shuffle.mjs mockList / mockNext / mockAnswer / mockNight, nav.js): ?mock=1 or a mock night
// (W139: no button; Sun / Tue / Thu 18:00-03:59 local, once per night per device; on a fake clock here) plays the
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

  await step("?mock=1: the mock opens on X3 Q1, the query goes; no mock button, no 'Explore other banks' (W139)", async () => {
    await page.goto(BASE + "/?mock=1");
    await opened(page, "PHYS_MQ1");
    assert.equal(new URL(page.url()).search, "", "the ?mock=1 query stayed");
    assert.deepEqual(await page.evaluate(() => window.stemMock.state().list), ["PHYS_MQ1", "PHYS_MQ2", "PHYS_MQ3"], "exam order, templates only");
    assert.equal(await page.locator("#qmock, #qbanks").count(), 0, "a removed button is back");
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
  /* families met (W103c, todo 103 MUST 1): Q1 Q2 Q3 = 3 families; a clean MQ2 meets twinless Q2; Q1's missed template would not have
     counted anyway (it has a title twin, PHYS_WQ1). The row lives in the HUD popover (shuffle.mjs familiesMet, rewards/engine.js families) */
  await step("families met: the P3X popover row says 1 / 3 after one clean twinless template", async () => {
    await page.waitForFunction(() => /Families met\s*1 \/ 3/.test(document.querySelector("#rwPop .rw-pop-h ~ dl")?.textContent || ""), null, { timeout: 3000 })
      .catch(async () => { throw new Error("no 'Families met 1 / 3' row: " + JSON.stringify(await page.evaluate(() => [window.Rewards.state()?.families, document.querySelector("#rwPop dl")?.textContent]))); });
    assert.deepEqual(await page.evaluate(() => window.Rewards.state().families), { met: 1, of: 3 });
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
  });
  /* the night, on a fake clock (a real user: navigator.webdriver is false; nav.js keeps automation on a real clock out of it) */
  const night = async (t, clear = true) => {
    if (clear) await page.evaluate(() => localStorage.removeItem("stem-mock-night"));
    await page.clock.setSystemTime(new Date(t));
  };
  const load = async c => { await page.goto("about:blank"); await page.goto(BASE + "/#" + c); };   // a real load (a hash-only goto keeps the page)
  await page.addInitScript(() => { try { Object.defineProperty(Navigator.prototype, "webdriver", { get: () => false, configurable: true }); } catch { /* */ } try { Object.defineProperty(navigator, "webdriver", { get: () => false, configurable: true }); } catch { /* */ } });
  await page.clock.install({ time: new Date("2026-10-31T15:00:00") });   // a Saturday afternoon (local time)
  await step("a normal day (Saturday 15:00, Monday 04:00, Wednesday 21:00): no mock starts", async () => {
    for (const t of ["2026-10-31T15:00:00", "2026-11-02T04:00:00", "2026-11-04T21:00:00"]) {
      await night(t);
      await load("PHYS_MQ2");
      await page.waitForFunction(() => document.querySelector("#pcode")?.textContent === "PHYS_MQ2", null, { timeout: 8000 });
      await page.waitForTimeout(600);
      assert.equal(await page.evaluate(() => localStorage.getItem("stem-mock-night")), null, t);
      assert.equal(await page.evaluate(() => window.stemMock.state()?.done), true, t + ": the finished mock restarted");
    }
  });
  await step("a mock night (Sunday 21:00) opened on X3 Q1 itself restarts it in place (a fresh round, no 'only question' note); a reload keeps the mock", async () => {
    await night("2026-11-01T21:00:00");
    await load("PHYS_MQ1");
    await opened(page, "PHYS_MQ1").catch(async () => { throw new Error("the restart did not reopen X3 Q1: " + JSON.stringify(await page.evaluate(() => ({ m: window.stemMock.state(), item: window.stemQueue.item(), closed: document.querySelector("#q").classList.contains("closed"), toast: document.querySelector("#toast")?.textContent })))); });
    assert.equal(await page.evaluate(() => window.stemMock.state().at), 1, "X3 Q1 is the mock's first");
    assert.equal(await page.evaluate(() => localStorage.getItem("stem-mock-night")), "2026-11-01");
    assert.equal(await page.evaluate(() => window.stemMock.on()), true);
    assert.doesNotMatch(await page.evaluate(() => document.querySelector("#toast")?.textContent || ""), /only question/);
    await page.reload();
    await page.waitForFunction(() => document.querySelector("#pcode")?.textContent === "PHYS_MQ1", null, { timeout: 8000 });
    await next(page); await opened(page, "PHYS_MQ2");
  });
  await step("once per night: Monday 01:00 (still Sunday night) does not restart it; Tuesday 18:00 (a new night) does", async () => {
    await night("2026-11-02T01:00:00", false);
    await load("PHYS_MQ2"); await opened(page, "PHYS_MQ2");
    await page.waitForTimeout(600);
    assert.equal(await page.evaluate(() => window.stemMock.state().at), 2, "the same night restarted the mock");
    await night("2026-11-03T18:00:00", false);
    await load("PHYS_MQ2");
    await page.waitForFunction(() => window.stemMock.state()?.at === 1 && localStorage.getItem("stem-mock-night") === "2026-11-03", null, { timeout: 8000 });
    await opened(page, "PHYS_MQ1");
    assert.deepEqual(errs, [], "no page errors");
  });
  await ctx.close();
} finally {
  await browser.close();
  srv.kill();
}
console.log(failures ? `${failures} FAIL` : "all ok");
process.exit(failures ? 1 : 0);
