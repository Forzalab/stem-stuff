// CRAM-CTA-OFF smoke (Tony Nov 14): under ui-v7 the item card's "TI/Casio tricks" and "Hail Mary guess" buttons are cut (calc-coach.css,
// html.ui-v7 .cc-row { display: none }); the calc tip lives in the toast. Without ui-v7 the row stays as before. Cram window + cc-calc-on forced.
// Own serve.py with a fixture BANK_P3X:  node tests/cram-cta-off.pw.mjs [port]
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { launchBrowser } from "./pw-browser.mjs";
import { serverUp } from "./lib/boot.mjs";   // CI-ARCH B3: a dead serve.py fails at once, with its URL
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { try { pw = require("/opt/node22/lib/node_modules/playwright"); } catch { pw = require("/opt/node-tools/node_modules/playwright"); } }

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = /^\d+$/.test(process.argv[2] || "") ? +process.argv[2] : 8891, BASE = `http://127.0.0.1:${PORT}`;
const TMP = mkdtempSync(join(tmpdir(), "cram-cta-off-")), BANKS = join(TMP, "banks"), CRAM = join(TMP, "cram.json");
// the cram window is over in the repo (enabled:false): serve a forced-on copy, as calc.pw.mjs does
const CRAM_ON = JSON.stringify({ ...JSON.parse(readFileSync(join(ROOT, "client", "calc", "cram.json"), "utf8")), enabled: true });
writeFileSync(CRAM, CRAM_ON);
const num = (code, n) => ({ code, type: "num", answer: String(n + 2), body: [{ type: "text", md: `Plain ${n}: 2 + ${n}` }], noob: { tier: 1 } });
const welcome = { code: "PHYS_PWQ1", type: "num", answer: "4", form: "8/2", tol: 0.01, welcome: true, noob: { tier: 1 },
  body: [{ type: "text", md: "Pressure of $8\\ \\text{N}$ over $2\\ \\text{m}^2$, in $\\text{Pa}$." }],
  repair: { steps: [{ id: "answer", label: "Final answer", kind: "num" }] } };
mkdirSync(BANKS);
writeFileSync(join(BANKS, "BANK_P3X.json"), JSON.stringify({ v: 1, problems: [welcome, num("PHYS_PA1", 1), num("PHYS_PA2", 2)] }));
writeFileSync(join(BANKS, "BANK_OTH1.json"), JSON.stringify({ v: 1, problems: [num("OTH_W01", 1)] }));
writeFileSync(join(BANKS, "formula-sheet.json"), JSON.stringify({ v: 3, groups: [] }));
const srv = spawn("python3", [join(ROOT, "server", "http_server", "serve.py"), String(PORT)], { env: { ...process.env, STEM_BANKS: BANKS, STEM_FRONT: "BANK_P3X", STEM_FRONT_TITLE: "Exam 3",
  STEM_TODAY: "2026-10-23", STEM_TRIES: join(TMP, "tries.json"), STEM_CRAM: CRAM }, stdio: "ignore" });
await serverUp(BASE);

let failures = 0;
async function step(name, fn) { try { await fn(); console.log("ok  ", name); } catch (e) { failures++; console.log("FAIL", name, "\n     ", e.message.slice(0, 700)); } }
const browser = await launchBrowser(pw, { args: ["--no-sandbox"] });
const AT = "2026-11-06T18:00:00Z";                                   // inside the cram window (until 2026-11-10)
async function fresh() {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  await ctx.route("**/client/calc/cram.json", r => r.fulfill({ status: 200, contentType: "application/json", body: CRAM_ON }));
  await ctx.addInitScript(() => document.addEventListener("readystatechange", () => document.documentElement.classList.add("cc-calc-on"), { once: true }));
  await ctx.addInitScript((at) => {                                  // the device clock pinned into the cram window; time still runs
    const R = Date, off = R.parse(at) - R.now();
    window.Date = class extends R { constructor(...a) { a.length ? super(...a) : super(R.now() + off); } static now() { return R.now() + off; } };
    try { localStorage.setItem("stem-ob", "done"); for (const b of ["right", "miss", "three", "redo"]) localStorage.setItem("stem-ob-rw-" + b, "9"); } catch { /* blocked */ } }, AT);
  const page = await ctx.newPage(); const errs = []; page.on("pageerror", e => errs.push(e.message));
  return { ctx, page, errs };
}
const anyUp = page => page.waitForFunction(() => document.querySelector("#pcode")?.textContent && !document.querySelector("#freeze").hidden, null, { timeout: 8000 });
try {
  await step("ui-v7: the TI/Casio and Hail Mary buttons are not visible on the item card", async () => {
    const { ctx, page, errs } = await fresh();
    await page.goto(BASE + "/?ui=v7#PHYS_PA1"); await anyUp(page);
    await page.waitForSelector("#problem .cc-row .cc-cta-calc", { state: "attached", timeout: 8000 });   // the buttons exist: the check is not vacuous
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains("ui-v7")), true, "the flag is on");
    assert.equal(await page.locator("#problem .cc-cta-calc").first().isVisible(), false, ".cc-cta-calc hidden");
    assert.equal(await page.locator("#problem .cc-cta-hm").first().isVisible().catch(() => false), false, ".cc-cta-hm hidden");
    assert.equal(await page.locator("#problem .cc-row").first().isVisible(), false, ".cc-row hidden");
    assert.deepEqual(errs, []); await ctx.close();
  });
  await step("no ui-v7: the item card's .cc-row is visible (cram window + cc-calc-on)", async () => {
    const { ctx, page, errs } = await fresh();
    await page.goto(BASE + "/#PHYS_PA1"); await anyUp(page);
    await page.waitForSelector("#problem .cc-row", { state: "visible", timeout: 8000 });
    assert.equal(await page.locator("#problem .cc-row").first().isVisible(), true, ".cc-row visible without ui-v7");
    assert.equal(await page.locator("#problem .cc-cta-calc").first().isVisible(), true, ".cc-cta-calc visible without ui-v7");
    assert.deepEqual(errs, []); await ctx.close();
  });
} finally { await browser.close(); srv.kill(); }
if (failures) { console.log(failures + " failed"); process.exit(1); }
console.log("all ok");
