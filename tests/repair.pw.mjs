// repair.js (DESIGN-v3 §3, v2 §B): the Repair ladder, driven through its lab page (design/repair-lab.html; a hand-made Exam 2 item, no fetch).
// A sign slip blanks the `fam` step (+ its why), every step before it is worked; 2 wrong tries auto-fill the step with its why; no family
// (or SLIP_TIE) = the fallback ladder: all worked, answer blank, why on step 1; alt = the item's other ladder; full = the worked solution
// with Next dim for 10 s; welcome = unfailable (no red, a wrong tap is the next hint). Text only (no markup from data), 360px, ✓/✗ glyphs.
//   node tests/repair.pw.mjs                          (the lab from disk)
//   node tests/repair.pw.mjs http://localhost:8823    (the lab through serve.py)
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { pw = require("/opt/node22/lib/node_modules/playwright"); }
const LAB = process.argv[2] ? process.argv[2].replace(/\/$/, "") + "/design/repair-lab.html"
  : "file://" + join(dirname(fileURLToPath(import.meta.url)), "..", "design", "repair-lab.html");

let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); }
  catch (e) { failures++; console.log("FAIL", name, "\n     ", e.message.slice(0, 700)); }
}
const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
try {
  const page = await browser.newPage({ viewport: { width: 360, height: 800 } });
  const errs = []; page.on("pageerror", e => errs.push(e.message));
  await page.goto(LAB);
  const mount = o => page.evaluate(o => window.lab(o), o);
  const states = () => page.$$eval(".rp-step", s => s.map(x => x.dataset.id + ":" + x.dataset.state));
  const ev = () => page.evaluate(() => window.__ev);
  const act = sel => page.click(`.rp-step[data-state="active"] ${sel}`);
  const noSideScroll = async () => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "no sideways scroll at 360");

  await step("blankStep: the fam step for a matched family (a k=2 family too), null for none / SLIP_TIE", async () => {
    assert.deepEqual(await page.evaluate(() => [Repair.blankStep(FIX, "sign"), Repair.blankStep(FIX, "drop+sign"), Repair.blankStep(FIX, null),
      Repair.blankStep(FIX, "SLIP_TIE"), Repair.blankStep(FIX, "power"), Repair.blankStep({}, "sign")]), ["signs", "signs", null, null, null, null]);
  });

  await step("sign slip: the fam step is blank with its why, the steps before it ✓, the rest dim", async () => {
    await mount({ variant: "repair", error: "sign" });
    assert.deepEqual(await states(), ["given:done", "sheet:done", "signs:active", "plug:future", "answer:future"]);
    assert.equal(await page.$$eval('.rp-step[data-state="done"]', s => s.every(x => x.textContent.includes("✓"))), true, "a done step says ✓ (not hue alone)");
    assert.equal(await page.$$eval('.rp-step[data-state="active"] .rp-why .rp-chip', c => c.length), 3, "3 why chips on the fam step");
    assert.equal(await page.$$eval('.rp-step[data-state="future"] .rp-chip, .rp-step[data-state="future"] input', c => c.length), 0, "a future step is a label only");
    assert.match(await page.textContent(".rp-line"), /\S/, "Cluck's line");
    await noSideScroll();
  });

  await step("a wrong pick: ✗ on that chip + the miss line, still the active step; − and the right why → ✓, the worked step after it ✓", async () => {
    await act('.rp-val-opts .rp-chip[data-v="+"]');
    assert.equal(await page.textContent('.rp-step[data-id="signs"] .rp-chip[data-v="+"]').then(t => t.includes("✗")), true);
    assert.match(await page.textContent('.rp-step[data-id="signs"] .rp-miss'), /\S/);
    assert.equal(await page.getAttribute('.rp-step[data-id="signs"]', "data-state"), "active");
    await act('.rp-val-opts .rp-chip[data-v="−"]');
    assert.equal(await page.getAttribute('.rp-step[data-id="signs"]', "data-state"), "active", "the why is still to answer");
    await act('.rp-why .rp-chip[data-why="0"]');
    assert.deepEqual(await states(), ["given:done", "sheet:done", "signs:done", "plug:done", "answer:active"]);
  });

  await step("the right final answer → repair_done{why_ok:true}; a wrong one first is a miss, not done", async () => {
    await page.fill('.rp-step[data-state="active"] input', "5");
    await act(".rp-check");
    assert.equal((await ev()).some(e => e[0] === "repair_done"), false);
    await page.fill('.rp-step[data-state="active"] input', "1.0");
    await act(".rp-check");
    const done = (await ev()).filter(e => e[0] === "repair_done");
    assert.equal(done.length, 1);
    assert.equal(done[0][1].why_ok, true);
    assert.equal(done[0][1].variant, "repair");
    assert.equal(await page.$$eval(".rp-step", s => s.every(x => x.dataset.state === "done")), true);
  });

  await step("2 wrong tries: the step auto-fills with its why shown and moves on; why_ok false", async () => {
    await mount({ variant: "repair", error: "sign" });
    await act('.rp-val-opts .rp-chip[data-v="+"]');
    await act('.rp-val-opts .rp-chip[data-v="×"]');
    assert.equal(await page.getAttribute('.rp-step[data-id="signs"]', "data-state"), "done");
    assert.match(await page.textContent('.rp-step[data-id="signs"]'), /opposite ways/, "its why is shown");
    await page.fill('.rp-step[data-state="active"] input', "1");
    await act(".rp-check");
    assert.equal((await ev()).find(e => e[0] === "repair_done")[1].why_ok, false);
  });

  await step("no family / SLIP_TIE: fallback ladder, step 1 worked + its why, then all ✓, answer blank", async () => {
    for (const error of [null, "SLIP_TIE"]) {
      await mount({ variant: "repair", error });
      assert.deepEqual(await states(), ["given:active", "sheet:future", "signs:future", "plug:future", "answer:future"]);
      assert.equal(await page.$$eval('.rp-step[data-id="given"] .rp-val-opts .rp-chip', c => c.length), 0, "step 1 is worked: no value to pick");
      assert.equal(await page.$$eval('.rp-step[data-id="given"] .rp-why .rp-chip', c => c.length), 3);
      await act('.rp-why .rp-chip[data-why="0"]');
      assert.deepEqual(await states(), ["given:done", "sheet:done", "signs:done", "plug:done", "answer:active"]);
    }
  });

  await step("alt: the item's other ladder (fallback rule), not the same one again", async () => {
    await mount({ variant: "alt", error: "sign" });
    assert.equal(await page.getAttribute(".rp", "data-ladder"), "alt");
    assert.deepEqual(await states(), ["units:active", "size:future", "answer:future"]);
    await act('.rp-why .rp-chip[data-why="0"]');
    await act('.rp-val-opts .rp-chip[data-v="b"]');
    await act('.rp-val-opts .rp-chip[data-v="a"]');
    assert.equal((await ev()).some(e => e[0] === "repair_done" && e[1].variant === "alt"), true);
  });

  await step("full: every step worked, the answer shown, Next dim for 10 s (study pause)", async () => {
    const p = await browser.newPage({ viewport: { width: 360, height: 800 } });
    await p.clock.install();
    await p.goto(LAB);
    await p.clock.pauseAt(await p.evaluate(() => Date.now()) + 1000);           // the fake clock stops: real time no longer leaks in
    await p.evaluate(() => window.lab({ variant: "full", error: "sign" }));
    assert.equal(await p.$$eval(".rp-step", s => s.every(x => x.dataset.state === "done")), true);
    assert.match(await p.textContent('.rp-step[data-id="answer"]'), /1\.0/);
    assert.equal(await p.isDisabled(".rp-next"), true);
    await p.clock.runFor(9900);
    assert.equal(await p.isDisabled(".rp-next"), true, "still dim at 9.9 s");
    await p.clock.runFor(200);
    assert.equal(await p.isDisabled(".rp-next"), false, "live after 10 s");
    await p.click(".rp-next");
    assert.equal((await p.evaluate(() => window.__ev)).some(e => e[0] === "repair_next"), true);
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await p.close();
  });

  await step("welcome: every step shown, a wrong tap is a hint (no ✗, no .wrong), never auto-filled", async () => {
    await mount({ variant: "welcome", error: null });
    assert.equal(await page.$$eval(".rp-step .rp-label", l => l.every(x => x.offsetParent !== null)), true, "all labels visible");
    for (let i = 0; i < 3; i++) await act('.rp-val-opts .rp-chip[data-v="b"]');
    assert.equal(await page.getAttribute('.rp-step[data-id="given"]', "data-state"), "active", "unfailable: no auto-fill");
    assert.equal(await page.$$eval(".rp .wrong, .rp [data-wrong]", x => x.length), 0);
    assert.equal(await page.textContent(".rp").then(t => t.includes("✗")), false);
    assert.match(await page.textContent('.rp-step[data-id="given"] .rp-miss'), /\S/, "the hint");
  });

  await step("text only: a label with markup lands as text, never as an element", async () => {
    await page.evaluate(() => { window.__x = 0; });
    await mount({ variant: "repair", error: null, label: "<img src=x onerror=window.__x=1>" });
    assert.equal(await page.$$eval(".rp img", x => x.length), 0);
    assert.match(await page.textContent(".rp"), /<img src=x/);
    assert.equal(await page.evaluate(() => window.__x), 0);
  });

  await step("skip: 'Skip for now' logs repair_skip", async () => {
    await mount({ variant: "repair", error: "sign" });
    await page.click(".rp-skip");
    assert.equal((await ev()).some(e => e[0] === "repair_skip"), true);
  });

  await step("no page errors", async () => assert.deepEqual(errs, []));
} finally {
  await browser.close();
}
if (failures) { console.log(`\n${failures} failing`); process.exit(1); }
console.log("\nall ok");
