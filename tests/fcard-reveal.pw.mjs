// Key formulas card with NO p.ladder (every Exam 3 item): it must not give everything away (Tony, Oct 21 spec: big pieces first, then step by step, then the arrows).
//   no ladder  on load: only row 1, 0 arrows. Each graded wrong try (and each stemLadder.step(), Jev's hit) shows the next row; then the arrows, one per step; then nothing more
//   ladder     an item WITH a ladder is unchanged: a wrong try reveals nothing, stemLadder.step() pops its mid pieces then arrows as before
// FR_W=1280,393 (desk, phone); default both. Own serve.py (no AI key: Cluck is off, nothing here needs it).
//   node tests/fcard-reveal.pw.mjs <port>
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { writeFileSync, mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { skipRetryWait } from "./lib/clock.mjs";   // the second try waits 10 s (retry-wait.pw.mjs)
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { try { pw = require("/opt/node22/lib/node_modules/playwright"); } catch { pw = require("/opt/node-tools/node_modules/playwright"); } }
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = /^\d+$/.test(process.argv[2] || "") ? process.argv[2] : "8885", BASE = `http://127.0.0.1:${PORT}`;
const W = (process.env.FR_W || "1280,393").split(",").map(Number);
const tmp = mkdtempSync(join(tmpdir(), "fcr-")), banks = join(tmp, "banks");
mkdirSync(banks);
writeFileSync(join(banks, "formula-sheet.json"), JSON.stringify({ v: 3, groups: [{ name: "Work and Energy", rows: [
  { id: "FA", tex: "W = F d" }, { id: "FB", tex: "K = \\tfrac12 m v^2" }, { id: "FC", tex: "P = W / t" }] }] }));
const item = (code, extra) => ({ code, title: code, type: "num", body: [{ type: "text", md: "Reveal " + code }], answer: "42", saccharine: { title: code, part: ["FA", "FB", "FC"], ...extra } });
writeFileSync(join(banks, "BANK_FRV.json"), JSON.stringify({ v: 1, problems: [item("CALC1_FR1"), item("CALC1_FR2", { ladder: { mid: [{ of: "FA", tex: "F = m a" }], arrows: [{ from: "FA", to: "FB" }] } })] }));
const srv = spawn("python3", [join(ROOT, "serve.py"), PORT], { env: { ...process.env, STEM_BANKS: banks, STEM_TRIES: join(tmp, "tries.json"), OPENROUTER_API_KEY: "" }, stdio: "ignore" });
for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + "/")).ok) break; } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 100)); }
let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); }
  catch (e) { failures++; console.log("FAIL", name, "\n     ", String(e.message).slice(0, 900)); }
}
const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
async function open(w, code) {
  const phone = w < 500;
  const ctx = await browser.newContext({ viewport: { width: w, height: phone ? 852 : 800 }, hasTouch: phone, isMobile: phone, serviceWorkers: "block" });
  await ctx.addInitScript(() => { try { localStorage.setItem("stem-ob", "done"); for (const b of ["right", "miss", "three"]) localStorage.setItem("stem-ob-rw-" + b, "9"); } catch { /* */ } });
  await ctx.route(/youtube|ytimg|googlevideo/, r => r.abort());
  const page = await ctx.newPage();
  page.errs = []; page.on("pageerror", e => page.errs.push(String(e)));
  await page.goto(BASE + "/#BANK_FRV");
  await page.waitForFunction(() => !document.getElementById("splash") && !!(window.stemBank && window.stemBank.code) && !document.getElementById("freeze").hidden, null, { timeout: 10000 });
  await page.evaluate(c => { location.hash = "#" + c; }, code);
  await page.waitForFunction(c => document.querySelector("#pcode")?.textContent === c && !!document.querySelector("#fcard") && !!document.querySelector("#ans"), code, { timeout: 8000 });
  await page.waitForTimeout(400);
  return page;
}
const shown = (page, sel) => page.$$eval("#fcard " + sel, es => es.filter(e => !e.hidden && getComputedStyle(e).display !== "none").length);
const state = async page => [await shown(page, "li.f:not(.mid)"), await shown(page, "li.f.mid"), await shown(page, "li.to")];
const miss = async page => { await skipRetryWait(page); const n = await page.evaluate(() => window.__drill?.state?.tries?.length ?? 0); await page.fill("#ans", "999"); await page.press("#ans", "Enter");
  await page.waitForFunction(n => (window.__drill?.state?.tries?.length ?? 0) > n, n, { timeout: 8000 }); await page.waitForTimeout(150); };
const jev = page => page.evaluate(() => window.stemLadder.step());
for (const w of W) {
  await step(`@${w} no ladder: row 1 only on load; a wrong try shows row 2; Jev's hits show row 3, then the arrows one by one; then nothing more`, async () => {
    const page = await open(w, "CALC1_FR1");
    assert.deepEqual(await state(page), [1, 0, 0], "on load: 1 row, 0 arrows");
    await miss(page);
    assert.deepEqual(await state(page), [2, 0, 0], "one wrong try: 2 rows");
    assert.equal(await jev(page), true); assert.deepEqual(await state(page), [3, 0, 0], "a Jev hit: all 3 rows, no arrow yet");
    assert.equal(await jev(page), true); assert.deepEqual(await state(page), [3, 0, 1], "then arrow 1");
    assert.equal(await jev(page), true); assert.deepEqual(await state(page), [3, 0, 2], "then arrow 2");
    assert.equal(await jev(page), false, "everything out: nothing more");
    await miss(page);
    assert.deepEqual(await state(page), [3, 0, 2], "a later wrong try adds nothing");
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "no sideways scroll");
    assert.deepEqual(page.errs, [], "no page errors");
    await page.context().close();
  });
  await step(`@${w} with a ladder: unchanged (a wrong try reveals nothing; steps pop the mid piece, then the arrow)`, async () => {
    const page = await open(w, "CALC1_FR2");
    assert.deepEqual(await state(page), [3, 0, 1], "big pieces all in; the mid piece and the laddered arrow wait (the unladdered one is always out, as before)");
    await miss(page);
    assert.deepEqual(await state(page), [3, 0, 1], "a wrong try reveals nothing");
    assert.equal(await jev(page), true); assert.deepEqual(await state(page), [3, 1, 1]);
    assert.equal(await jev(page), true); assert.deepEqual(await state(page), [3, 1, 2]);
    assert.equal(await jev(page), false);
    await page.context().close();
  });
}
await browser.close(); srv.kill();
console.log(failures ? `${failures} FAILED` : "all ok");
process.exit(failures ? 1 : 0);
