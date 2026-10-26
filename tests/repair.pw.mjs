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

  // W71 copy lane: a k>1 slip (drop+sign) says "mistakes" (intro.repairMany, intro.repair until it lands); a leading *...* is an italic action
  await step("intro: repairMany for a multi-family slip, intro.repair for one family or while repairMany is undefined", async () => {
    await page.evaluate(() => { window.__intro0 = { ...__stemRepairLines.intro }; __stemRepairLines.intro.repairMany = "MANY"; });
    await mount({ variant: "repair", error: "drop+sign" });
    assert.equal(await page.textContent(".rp-line"), "MANY");
    await mount({ variant: "repair", error: "sign" });
    assert.equal(await page.textContent(".rp-line"), await page.evaluate(() => __stemRepairLines.intro.repair));
    await page.evaluate(() => { delete __stemRepairLines.intro.repairMany; });
    await mount({ variant: "repair", error: "drop+sign" });
    assert.equal(await page.textContent(".rp-line"), await page.evaluate(() => __stemRepairLines.intro.repair), "falls back");
  });

  await step("intro: a leading *action* is <em>, the rest lands as text", async () => {
    await page.evaluate(() => { __stemRepairLines.intro.repair = "*waddles to you* QUACK. <b>x</b> *not this*"; });
    await mount({ variant: "repair", error: "sign" });
    assert.deepEqual(await page.$$eval(".rp-line em", e => e.map(x => x.textContent)), ["waddles to you"]);
    assert.equal(await page.textContent(".rp-line"), "waddles to you QUACK. <b>x</b> *not this*");
    assert.equal(await page.$$eval(".rp-line b", x => x.length), 0);
    await page.evaluate(() => { __stemRepairLines.intro = window.__intro0; });
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

  // #29.7: the server drops the answer step's ok/opts/tol/miss; such a step is graded through the injected async opts.grade(value)
  await step("an answer step with no ok: a wrong value goes through opts.grade → false → the miss line, still active, no repair_done", async () => {
    await mount({ variant: "repair", error: null, remote: true });
    await act('.rp-why .rp-chip[data-why="0"]');
    assert.equal(await page.getAttribute('.rp-step[data-id="answer"]', "data-state"), "active");
    await page.fill('.rp-step[data-state="active"] input', "5");
    await act(".rp-check");
    await page.waitForFunction(() => window.__graded.length === 1);
    assert.deepEqual(await page.evaluate(() => window.__graded), ["5"], "grade got the typed value");
    await page.waitForSelector('.rp-step[data-id="answer"] .rp-miss');
    assert.equal(await page.textContent('.rp-step[data-id="answer"] .rp-miss'), await page.evaluate(() => __stemRepairLines.miss), "the generic miss line");
    assert.equal(await page.getAttribute('.rp-step[data-id="answer"]', "data-state"), "active");
    assert.equal((await ev()).some(e => e[0] === "repair_done"), false);
  });

  await step("an answer step with no ok: opts.grade → true advances it to ✓ (the typed value shown) and emits repair_done", async () => {
    await page.fill('.rp-step[data-state="active"] input', "1.0");
    await act(".rp-check");
    await page.waitForSelector('.rp-step[data-id="answer"][data-state="done"]');
    assert.deepEqual(await page.evaluate(() => window.__graded), ["5", "1.0"]);
    assert.match(await page.textContent('.rp-step[data-id="answer"]'), /1\.0.*✓/);
    assert.equal(await page.textContent('.rp-step[data-id="answer"]').then(t => t.includes("undefined")), false);
    assert.equal((await ev()).filter(e => e[0] === "repair_done").length, 1);
  });

  await step("a pick answer step with no ok/opts: the item's own choices, graded through opts.grade", async () => {
    await mount({ variant: "alt", error: null, remote: true });
    await act('.rp-why .rp-chip[data-why="0"]');
    assert.deepEqual(await states(), ["units:done", "size:done", "answer:active"]);
    assert.equal(await page.$$eval('.rp-step[data-id="answer"] .rp-val-opts .rp-chip', c => c.length), 2, "the item's 2 choices");
    await act('.rp-val-opts .rp-chip[data-v="b"]');
    await page.waitForSelector('.rp-step[data-id="answer"] .rp-miss');
    assert.equal(await page.getAttribute('.rp-step[data-id="answer"]', "data-state"), "active");
    await act('.rp-val-opts .rp-chip[data-v="a"]');
    await page.waitForSelector('.rp-step[data-id="answer"][data-state="done"]');
    assert.deepEqual(await page.evaluate(() => window.__graded), ["b", "a"]);
    assert.equal((await ev()).some(e => e[0] === "repair_done" && e[1].variant === "alt"), true);
  });

  // #33 A: /check takes {value, n} (n = the 1-based try on that step); after the 2nd miss it sends the answer's display string, and the
  // card turns into the worked solution: the problem with the answer filled in, the student's wrong answer crossed out, no green / red
  await step("the answer step counts its tries: opts.grade gets n = 1, 2 (a repeated value counts too)", async () => {
    await mount({ variant: "repair", error: null, remote: true });
    await act('.rp-why .rp-chip[data-why="0"]');
    for (const k of [1, 2]) {
      await page.fill('.rp-step[data-state="active"] input', "5");
      await act(".rp-check");
      await page.waitForFunction(k => window.__graded.length === k, k);
      await page.waitForTimeout(120);                                           // the stub's round trip lands
    }
    assert.deepEqual(await page.evaluate(() => window.__ns), [1, 2]);
  });

  await step("2nd miss with an answer: the line becomes the problem + the answer, the wrong one crossed out, the ladder neutral", async () => {
    await mount({ variant: "repair", error: null, remote: true });
    await act('.rp-why .rp-chip[data-why="0"]');
    await page.fill('.rp-step[data-state="active"] input', "5");
    await act(".rp-check");
    await page.waitForSelector('.rp-step[data-id="answer"] .rp-miss');
    assert.equal(await page.$$eval(".rp-solved", x => x.length), 0, "a 1st miss is a plain miss");
    await page.fill('.rp-step[data-state="active"] input', "7");
    await act(".rp-check");
    await page.waitForSelector(".rp-solved");
    assert.deepEqual(await page.evaluate(() => window.__ns), [1, 2]);
    assert.equal(await page.$$eval(".rp-line", x => x.length), 0, "Cluck's opening line is gone");
    assert.match(await page.textContent(".rp-solved .rp-stem"), /2\.0 kg cart/, "the problem");
    assert.equal(await page.textContent(".rp-solved del"), "7", "the student's wrong answer");
    assert.match(await page.textContent(".rp-solved del").then(() => page.$eval(".rp-solved del", d => getComputedStyle(d).textDecorationLine)), /line-through/);
    assert.equal(await page.textContent(".rp-solved .rp-ans"), "1.0 m/s", "the answer filled in");
    assert.equal(await page.$$eval(".rp-step", s => s.every(x => x.dataset.state === "done")), true, "the full solution");
    assert.equal(await page.textContent('.rp-step[data-id="answer"] .rp-val'), "1.0 m/s", "the answer step shows it too (no unit twice)");
    assert.equal(await page.$$eval('.rp-step[data-id="answer"] .rp-miss', x => x.length), 0, "no miss / auto line under it");
    assert.equal(await page.getAttribute(".rp", "data-solved"), "", "the card is marked solved");
    const [ok, n] = await page.$$eval(".rp-ok, .rp-n", x => [getComputedStyle(x.find(e => e.matches(".rp-ok"))).color, getComputedStyle(x.find(e => e.matches(".rp-n"))).color]);
    assert.equal(ok, n, "✓ in the neutral ink, not green");
    assert.equal(await page.$eval(".rp-solved del", d => getComputedStyle(d).color), await page.$eval(".rp-solved", d => getComputedStyle(d).color), "the crossed-out answer is not red");
    const done = (await ev()).filter(e => e[0] === "repair_done");
    assert.equal(done.length, 1);
    assert.equal(done[0][1].auto, 1, "the answer step counts as filled in");
    assert.equal(await page.$$eval(".rp-skip", x => x.length), 0);
    await noSideScroll();
  });

  await step("a step that still carries ok grades locally: opts.grade is never called", async () => {
    await mount({ variant: "repair", error: "sign", grade: true });
    await act('.rp-val-opts .rp-chip[data-v="−"]');
    await act('.rp-why .rp-chip[data-why="0"]');
    await page.fill('.rp-step[data-state="active"] input', "1.0");
    await act(".rp-check");
    assert.equal((await ev()).some(e => e[0] === "repair_done"), true);
    assert.deepEqual(await page.evaluate(() => window.__graded), []);
  });

  // #36 (contract v2, additive): doneBy by level + tail, hintBy tiers by the welcome wrong-tap count, auto / intro.full "" or missing → no line
  // (the auto-filled step's number badge carries data-auto instead), the full card shows the problem with the answer filled in
  const V2 = { doneBy: { L1: "D1!", L2: "D2!", L3: "D3!", tail: " TAIL" }, hintBy: { far: ["F0", "F1", "F2"], two: "TWO", three: ["T0", "T1"] },
    auto: "", intro: { full: "" } };
  const v2 = (patch = V2) => page.evaluate(p => { window.__lines0 ??= structuredClone(__stemRepairLines);
    Object.assign(__stemRepairLines, p, { intro: { ...__lines0.intro, ...p.intro } }); }, patch);
  const v2off = () => page.evaluate(() => { if (window.__lines0) window.__stemRepairLines = __lines0; delete window.__lines0; if (window.__rnd0) Math.random = window.__rnd0; });
  const rnd = x => page.evaluate(x => { window.__rnd0 ??= Math.random; Math.random = () => x; }, x);
  const finishSign = async () => { await act('.rp-val-opts .rp-chip[data-v="−"]'); await act('.rp-why .rp-chip[data-why="0"]');
    await page.fill('.rp-step[data-state="active"] input', "1.0"); await act(".rp-check"); };

  await step("v2 doneBy: L1 no wrong try → L1 + tail", async () => {
    await v2();
    await mount({ variant: "repair", error: "sign" });
    await finishSign();
    assert.equal(await page.textContent(".rp-done"), "D1! TAIL");
  });

  await step("v2 doneBy: L2 a wrong try, answer never revealed → L2 + tail", async () => {
    await mount({ variant: "repair", error: "sign" });
    await act('.rp-val-opts .rp-chip[data-v="+"]');
    await finishSign();
    assert.equal(await page.textContent(".rp-done"), "D2! TAIL");
  });

  await step("v2 doneBy: L3 the server revealed the answer → L3 + tail", async () => {
    await mount({ variant: "repair", error: null, remote: true });
    await act('.rp-why .rp-chip[data-why="0"]');
    for (const [k, v] of [[1, "5"], [2, "7"]]) {
      await page.fill('.rp-step[data-state="active"] input', v); await act(".rp-check");
      await page.waitForFunction(k => window.__graded.length === k, k); await page.waitForTimeout(120);
    }
    await page.waitForSelector(".rp-solved");
    assert.equal(await page.textContent(".rp-done"), "D3! TAIL");
  });

  await step("v2 hintBy: welcome wrong tap 1 → far[random], 2 → two, 3+ → three[random] (Math.random stubbed)", async () => {
    await mount({ variant: "welcome", error: null });
    await act('.rp-val-opts .rp-chip[data-v="a"]');                             // step 1 right: the sheet step (no authored miss) is next
    const miss = () => page.textContent('.rp-step[data-id="sheet"] .rp-miss');
    await rnd(0.99); await act('.rp-chip[data-v="KE"]'); assert.equal(await miss(), "F2");
    await rnd(0); await act('.rp-chip[data-v="IMPULSE"]'); assert.equal(await miss(), "TWO");
    await rnd(0); await act('.rp-chip[data-v="KE"]'); assert.equal(await miss(), "T0");
    await rnd(0.99); await act('.rp-chip[data-v="IMPULSE"]'); assert.equal(await miss(), "T1");
  });

  await step("v2 auto \"\" / missing: the auto-filled step shows no line, its number badge carries data-auto (no text added)", async () => {
    for (const drop of [false, true]) {
      if (drop) await page.evaluate(() => { delete __stemRepairLines.auto; });
      await mount({ variant: "repair", error: "sign" });
      await act('.rp-val-opts .rp-chip[data-v="+"]');
      await act('.rp-val-opts .rp-chip[data-v="×"]');
      assert.equal(await page.$$eval('.rp-step[data-id="signs"] .rp-miss', x => x.length), 0, "no auto line");
      assert.equal(await page.$eval('.rp-step[data-id="signs"] .rp-n', n => n.hasAttribute("data-auto")), true, "badge state");
      assert.equal(await page.textContent('.rp-step[data-id="signs"] .rp-n'), "3", "no text added");
      assert.equal(await page.$eval('.rp-step[data-id="given"] .rp-n', n => n.hasAttribute("data-auto")), false, "a worked step: no badge state");
    }
  });

  await step("v2 full: no intro line (intro.full \"\" or missing), the problem with the answer filled in", async () => {
    for (const drop of [false, true]) {
      await v2off(); await v2();
      if (drop) await page.evaluate(() => { delete __stemRepairLines.intro.full; });
      await mount({ variant: "full", error: "sign" });
      assert.equal(await page.$$eval(".rp-line", x => x.length), 0, "no intro line");
      assert.match(await page.textContent(".rp-solved .rp-stem"), /2\.0 kg cart/, "the problem");
      assert.equal(await page.textContent(".rp-solved .rp-ans"), "1.0 m/s", "the answer filled in");
      assert.equal(await page.$$eval(".rp-solved del", x => x.length), 0, "nothing to strike");
    }
    await mount({ variant: "full", error: null, remote: true, answer: "1.0 m/s" });   // no key on the device: the host passes opts.answer
    assert.equal(await page.textContent(".rp-solved .rp-ans"), "1.0 m/s");
    assert.equal(await page.textContent('.rp-step[data-id="answer"] .rp-val'), "1.0 m/s");
    await v2off();
  });

  await step("old shape: the full card keeps its intro line + the answer filled in; the auto line still shows, no badge state", async () => {
    await mount({ variant: "full", error: "sign" });
    assert.equal(await page.textContent(".rp-line"), await page.evaluate(() => __stemRepairLines.intro.full));
    assert.equal(await page.textContent(".rp-solved .rp-ans"), "1.0 m/s");
    await mount({ variant: "repair", error: "sign" });
    await act('.rp-val-opts .rp-chip[data-v="+"]'); await act('.rp-val-opts .rp-chip[data-v="×"]');
    assert.equal(await page.textContent('.rp-step[data-id="signs"] .rp-miss'), await page.evaluate(() => __stemRepairLines.auto));
    assert.equal(await page.$eval('.rp-step[data-id="signs"] .rp-n', n => n.hasAttribute("data-auto")), false);
  });

  await step("no page errors", async () => assert.deepEqual(errs, []));
} finally {
  await browser.close();
}
if (failures) { console.log(`\n${failures} failing`); process.exit(1); }
console.log("\nall ok");
