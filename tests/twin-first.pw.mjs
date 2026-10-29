// todo 121: live served PHYS_C3Z (the `a` twin of PHYS_WYS, tier 1) to a fresh device as a normal deck item. A twin stays out of the
// deck (noob ramp and shuffle queue) until its template has a graded miss (shuffle.mjs twinGate); the night-before mock keeps its own
// twin pick (mockList, tests/shuffle.test.mjs). Fixture front bank: two tier-1 templates, their tier-1 twins, two tier-2 items.
// Starts its own serve.py with a throwaway banks/ folder and tries.json:
//   node tests/twin-first.pw.mjs [port]
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
const PORT = +(process.argv[2] || 8836), BASE = `http://localhost:${PORT}`;
const TMP = mkdtempSync(join(tmpdir(), "twin-first-")), BANKS = join(TMP, "banks");
/* twins listed first, so neither file order nor the ramp's tier sort keeps them out */
const SPEC = { PHYS_WA1: [1, "PHYS_TA1"], PHYS_WB1: [1, "PHYS_TB1"], PHYS_TA1: [1], PHYS_TB1: [1], PHYS_TC2: [2], PHYS_TD2: [2] };
const CODES = Object.keys(SPEC), TWINS = CODES.filter(c => SPEC[c][1]);
const ANS = Object.fromEntries(CODES.map((c, i) => [c, String(i + 3)]));
const item = (c, i) => ({ code: c, type: "num", answer: ANS[c], body: [{ type: "text", md: `Item ${i + 1}: 2 + ${i + 1}` }], noob: { tier: SPEC[c][0] },
  ...(SPEC[c][1] ? { twin: "a", parent_template: SPEC[c][1], title: "twin" } : { title: "template" }) });
mkdirSync(BANKS);
writeFileSync(join(BANKS, "BANK_P3X.json"), JSON.stringify({ v: 1, problems: CODES.map(item) }));

const srv = spawn("python3", [join(ROOT, "serve.py"), String(PORT)], { env: { ...process.env, STEM_BANKS: BANKS, STEM_FRONT: "BANK_P3X", STEM_FRONT_TITLE: "Exam 3", STEM_TRIES: join(TMP, "tries.json") }, stdio: "ignore" });
for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + "/")).ok) break; } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 100)); }

let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); }
  catch (e) { failures++; console.log("FAIL", name, "\n     ", e.message.slice(0, 700)); }
}
const code = page => page.textContent("#pcode");
const anyOpen = page => page.waitForFunction(() => document.querySelector("#pcode")?.textContent && !document.querySelector("#freeze").hidden
  && (!document.querySelector("#splash") || getComputedStyle(document.querySelector("#splash")).opacity === "0"), null, { timeout: 8000 });
async function next(page) {
  const was = await code(page);
  await page.click("#qnext");
  await page.waitForFunction(c => document.querySelector("#pcode")?.textContent !== c && !document.querySelector("#freeze").hidden, was, { timeout: 4000 });
}
async function answer(page, c, ok) {                               // a graded first try (a wrong one under 2 s is spam = a skip, nav.js)
  if (!ok) await page.waitForTimeout(2300);
  await page.fill("#ans", ok ? ANS[c] : "999"); await page.click("#ansGo");
  await page.waitForFunction(() => window.stemQueue.state().seen[document.querySelector("#pcode").textContent]?.first, null, { timeout: 4000 });
}
const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
async function fresh(salt) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, serviceWorkers: "block" });
  await ctx.addInitScript(s => { try {
    localStorage.setItem("stem-ob", "done"); for (const b of ["right", "miss", "three", "redo"]) localStorage.setItem("stem-ob-rw-" + b, "9");
    if (!localStorage.getItem("stem-q-BANK_P3X")) localStorage.setItem("stem-q-BANK_P3X", JSON.stringify({ v: 1, salt: s, pos: 0, seen: {}, hist: [], at: -1 }));
  } catch { /* blocked */ } }, salt);
  const page = await ctx.newPage();
  await page.goto(BASE + "/"); await anyOpen(page);
  return { ctx, page };
}
try {
  for (const salt of ["s1", "s2", "s3"]) await step(`fresh device (salt ${salt}), noob ramp: no twin in the first 4 showings`, async () => {
    const { ctx, page } = await fresh(salt), run = [await code(page)];
    for (let i = 0; i < 3; i++) { await next(page); run.push(await code(page)); }
    await ctx.close();
    assert.deepEqual(run.filter(c => TWINS.includes(c)), [], `served ${run.join(" ")}`);
  });

  await step("fresh device, shuffle queue: no twin in the first 4 showings either", async () => {
    const { ctx, page } = await fresh("s4");
    await page.click("#qlistBtn"); await page.click("#qmix");
    assert.equal(await page.evaluate(() => window.stemQueue.mode()), "mix");
    const run = [];
    for (let i = 0; i < 4; i++) { await next(page); run.push(await code(page)); }
    await ctx.close();
    assert.deepEqual(run.filter(c => TWINS.includes(c)), [], `served ${run.join(" ")}`);
  });

  await step("a graded miss on a template lets its own twin into the deck", async () => {
    const { ctx, page } = await fresh("s5");
    let c = await code(page);
    for (let i = 0; i < 4 && !["PHYS_TA1", "PHYS_TB1"].includes(c); i++) { await next(page); c = await code(page); }
    assert.ok(["PHYS_TA1", "PHYS_TB1"].includes(c), `no template in reach, at ${c}`);
    await answer(page, c, false);
    assert.equal(await page.evaluate(c => window.stemQueue.state().seen[c].miss, c), 1, "the miss did not count");
    const mine = TWINS.find(t => SPEC[t][1] === c), run = [];
    for (let i = 0; i < 5 && !run.includes(mine); i++) { await next(page); run.push(await code(page)); }
    await ctx.close();
    assert.ok(run.includes(mine), `missed ${c}, then ${run.join(" ")}`);
    assert.ok(!run.includes(TWINS.find(t => t !== mine)), `the other template's twin came in: ${run.join(" ")}`);
  });
} finally {
  await browser.close();
  srv.kill();
}
console.log(failures ? `${failures} FAIL` : "all ok");
process.exit(failures ? 1 : 0);
