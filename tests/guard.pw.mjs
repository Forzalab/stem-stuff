// W104 Sleeping guard: an MC item that is out of tries (locked) or redeemed. Needs a running server and Playwright:
//   node tests/guard.pw.mjs <port> [shotDir]      (starts its own serve.py on that port; real grading, its own banks folder)
// Locked: a guard row (lock + words + napping Cluck) and no click gets through.
// Redeemed live: Cluck wakes, the feather burst plays once (never under prefers-reduced-motion); a revisit is frozen, no burst.
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { writeFileSync, mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { pw = require("/opt/node22/lib/node_modules/playwright"); }
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = /^\d+$/.test(process.argv[2] || "") ? process.argv[2] : "8874", BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = process.argv[3] || "";
const tmp = mkdtempSync(join(tmpdir(), "w104-")), banks = join(tmp, "banks");
mkdirSync(banks);
const mc = n => ({ code: `CALC1_G4M${n}`, title: `W104 mc ${n}`, type: "mc", shuffle: false, body: [{ type: "text", md: `Mc ${n}: pick one.` }], correct: "a",
  choices: ["one", "two", "three", "four"].map((md, i) => ({ id: "abcd"[i], md })) });
writeFileSync(join(banks, "BANK_G104.json"), JSON.stringify({ v: 1, problems: [mc(1), mc(2)] }));
const srv = spawn("python3", [join(ROOT, "serve.py"), PORT], { env: { ...process.env, STEM_BANKS: banks, STEM_TRIES: join(tmp, "tries.json"), OPENROUTER_API_KEY: "" }, stdio: "ignore" });
for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + "/")).ok) break; } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 100)); }
let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); }
  catch (e) { failures++; console.log("FAIL", name, "\n     ", String(e.message).slice(0, 600)); }
}
async function open(page, redeem) {
  await page.goto("about:blank"); await page.goto(`${BASE}/#BANK_G104`);
  await page.waitForFunction(() => /_G4/.test(document.querySelector("#pcode")?.textContent || "") && !document.querySelector("#freeze").hidden, null, { timeout: 10000 });
  await page.evaluate(() => window.Rewards && window.Rewards.config({ minDwell: 1e12 }));
  if (redeem) await page.evaluate(() => window.stemRedo.set(document.querySelector("#pcode").textContent, 1, true));
  await page.waitForFunction(() => Date.now() - window.__drill.state.start > 2100, null, { timeout: 6000 });
}
const graded = (page, n) => page.waitForFunction(k => window.__drill.state.tries.length >= k, n, { timeout: 5000 });
const pick = async (page, i) => {
  await page.waitForFunction(n => document.querySelectorAll("#q .opt:not(:disabled)").length > n, i, { timeout: 5000 });
  const t0 = await page.evaluate(() => window.__drill.state.tries.length);
  await (await page.$$("#q .opt:not(:disabled)"))[i].click(); await page.click("#q .ch:has(.opt[aria-checked=true]) .send"); await graded(page, t0 + 1);
};
async function run(w, h) {
  const b = await pw.chromium.launch({ args: ["--no-sandbox"] });
  const fresh = async o => (await b.newContext({ viewport: { width: w, height: h }, ...o })).newPage();   // a new browser id = a fresh item (tries live on the server, per id)
  let page = await fresh();
  const shot = async n => { if (SHOTS) { await page.mouse.move(0, 0); await page.waitForTimeout(900); await page.screenshot({ path: `${SHOTS}/${n}-${w}.png` }); } };
  await step(`${w} locked: guard shows lock + words + napping Cluck, choices take no click`, async () => {
    await open(page); await pick(page, 1); await pick(page, 1);
    await page.waitForSelector("#q.closed .guard.lock", { timeout: 4000 });
    const g = await page.$eval("#q .guard", e => ({ txt: e.textContent, lock: !!e.querySelector(".gd-lock svg"), duck: !!e.querySelector(".gd-duck svg"), burst: !!e.querySelector(".burst") }));
    assert.ok(g.lock && g.duck, "lock icon + Cluck");
    assert.match(g.txt, /guarding/); assert.ok(!g.burst, "no burst when locked");
    const snap = () => page.evaluate(() => JSON.stringify({ t: window.__drill.state.tries.length, c: [...document.querySelectorAll("#q .opt")].map(x => x.getAttribute("aria-checked")) }));
    const s0 = await snap();
    for (const el of await page.$$("#q .opt")) await el.click({ force: true });
    await page.waitForTimeout(200);
    assert.equal(await snap(), s0, "a click on a locked choice changed something");
    assert.ok((await page.$$eval("#q .opt", a => a.map(x => x.disabled && x.getAttribute("aria-disabled") === "true"))).every(Boolean), "every choice disabled");
    await shot("locked");
  });
  await step(`${w} redeemed live: Cluck wakes, burst plays, word in the site's font`, async () => {
    page = await fresh(); await open(page, true); await pick(page, 0);
    await page.waitForSelector("#q.closed .guard.won", { timeout: 4000 });
    assert.equal(await page.$$eval("#q .guard .burst i", a => a.length), 8, "8 feathers");
    const same = await page.$eval("#q .guard .gd-win", e => getComputedStyle(e).fontFamily === getComputedStyle(document.querySelector("#rtag")).fontFamily);
    assert.ok(same, "site font family");
    await shot("live");
  });
  await step(`${w} redeemed revisit: frozen, no burst, uneditable`, async () => {
    await page.reload(); await page.waitForSelector("#q.closed .guard.won", { timeout: 8000 });
    assert.equal(await page.$$eval("#q .guard .burst", a => a.length), 0, "no burst on a revisit");
    assert.match(await page.$eval("#q .guard", e => e.textContent), /locked in/i);
    const ctl = await page.$$eval("#q .opt", a => a.map(x => x.disabled || x.getAttribute("aria-disabled") === "true"));
    assert.ok(ctl.every(Boolean), "every choice disabled");
    const s0 = await page.evaluate(() => window.__drill.state.tries.length);
    for (const el of await page.$$("#q .opt")) await el.click({ force: true });
    await page.waitForTimeout(200);
    assert.equal(await page.evaluate(() => window.__drill.state.tries.length), s0, "revisit took a click");
    await shot("revisit");
  });
  await b.close();
  const b2 = await pw.chromium.launch({ args: ["--no-sandbox"] });
  const p2 = await (await b2.newContext({ viewport: { width: w, height: h }, reducedMotion: "reduce" })).newPage();
  await step(`${w} reduced motion: redeem live has no burst`, async () => {
    await open(p2, true); await pick(p2, 0);
    await p2.waitForSelector("#q.closed .guard.won", { timeout: 4000 });
    assert.equal(await p2.$$eval("#q .guard .burst", a => a.length), 0, "no burst under reduced motion");
  });
  await b2.close();
}
await run(390, 844);
await run(1280, 800);
console.log(failures ? `${failures} failed` : "all ok");
srv.kill();
process.exit(failures ? 1 : 0);
