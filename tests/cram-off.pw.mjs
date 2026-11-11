// Cram flag OFF (ticket 03 rescope): one `enabled` flag in calc/cram.json gates every cram surface. With a temp copy forced off:
// a deep link is not sent to the welcome item, no Hail Mary slot/panel appears, the idle peek keeps its normal cadence (no cram toast),
// and GET /calc carries no cram fields. CRAM_SPEC_ON=1 flips the temp copy back on (the red demo: the same assertions must fail).
// Own serve.py with a fixture BANK_P3X + BANK_OTH1: node tests/cram-off.pw.mjs [port]
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { try { pw = require("/opt/node22/lib/node_modules/playwright"); } catch { pw = require("/opt/node-tools/node_modules/playwright"); } }

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = /^\d+$/.test(process.argv[2] || "") ? process.argv[2] : "8899", BASE = `http://127.0.0.1:${PORT}`;
const TMP = mkdtempSync(join(tmpdir(), "cram-off-")), BANKS = join(TMP, "banks"), CRAM = join(TMP, "cram.json");
const ON = process.env.CRAM_SPEC_ON === "1";                       // red demo only
const cram = JSON.parse(readFileSync(join(ROOT, "client", "calc", "cram.json"), "utf8"));
cram.enabled = ON;
writeFileSync(CRAM, JSON.stringify(cram));
const num = (code, n) => ({ code, type: "num", answer: String(n + 2), body: [{ type: "text", md: `Plain ${n}: 2 + ${n}` }], noob: { tier: 1 } });
const welcome = { code: "PHYS_PWQ1", type: "num", answer: "4", form: "8/2", tol: 0.01, welcome: true, noob: { tier: 1 },
  body: [{ type: "text", md: "Pressure of $8\\ \\text{N}$ over $2\\ \\text{m}^2$, in $\\text{Pa}$." }],
  repair: { steps: [{ id: "answer", label: "Final answer", kind: "num" }] } };
mkdirSync(BANKS);
writeFileSync(join(BANKS, "BANK_P3X.json"), JSON.stringify({ v: 1, problems: [welcome, num("PHYS_PA1", 1), num("PHYS_PA2", 2)] }));
writeFileSync(join(BANKS, "BANK_OTH1.json"), JSON.stringify({ v: 1, problems: [num("OTH_W01", 1)] }));
writeFileSync(join(BANKS, "formula-sheet.json"), JSON.stringify({ v: 3, groups: [] }));
const srv = spawn("python3", [join(ROOT, "server", "http_server", "serve.py"), PORT], { env: { ...process.env, STEM_BANKS: BANKS, STEM_FRONT: "BANK_P3X", STEM_FRONT_TITLE: "Exam 3",
  STEM_TODAY: "2026-10-23", STEM_TRIES: join(TMP, "tries.json"), STEM_CRAM: CRAM }, stdio: "ignore" });
for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + "/")).ok) break; } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 100)); }

let failures = 0;
async function step(name, fn) { try { await fn(); console.log("ok  ", name); } catch (e) { failures++; console.log("FAIL", name, "\n     ", e.message.slice(0, 700)); } }
const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
const PIN = new Date("2026-11-07T12:00:00Z");                      // inside welcome-first.js's window, so only the flag can stop the redirect
async function newPage() {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  await ctx.clock.setFixedTime(PIN);
  await ctx.addInitScript(() => { window.__welcomeFirst = true; });   // automated browsers otherwise skip welcome-first (only the flag may stop the redirect)
  await ctx.route("**/client/calc/cram.json", r => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(cram) }));
  const page = await ctx.newPage(); const errs = []; page.on("pageerror", e => errs.push(e.message)); page.errs = errs;
  return { ctx, page };
}
const up = page => page.waitForFunction(() => document.querySelector("#pcode")?.textContent && !document.querySelector("#freeze").hidden, null, { timeout: 8000 });
try {
  await step("/calc carries no cram fields with the flag off", async () => {
    const j = await (await fetch(BASE + "/calc")).json();
    assert.equal("cram" in j, false, "the flag off: no cram fields");
  });
  await step("a deep link is not sent to the welcome item", async () => {
    const { ctx, page } = await newPage();
    await page.goto(BASE + "/#PHYS_PA1"); await up(page);
    assert.equal(await page.textContent("#pcode"), "PHYS_PA1", "the deep link stays put");
    assert.notEqual(await page.evaluate(() => location.hash), "#PHYS_PWQ1");
    assert.deepEqual(page.errs, []); await ctx.close();
  });
  await step("no Hail Mary slot or panel; cramFor is null", async () => {
    const { ctx, page } = await newPage();
    await page.goto(BASE + "/#PHYS_PA1"); await up(page);
    await page.waitForSelector("#problem .cc-row .cc-cta-calc", { timeout: 8000 });
    assert.equal(await page.evaluate(() => window.CalcCoach.loadCram().then(x => x.enabled === false)), true, "the one flag is off");
    await page.waitForTimeout(300);
    assert.equal(await page.$("#problem .cc-cta-hm"), null, "no Hail Mary button");
    assert.equal(await page.$$eval("#problem .cc-row [role=link]", e => e.length), 1, "only the Calc entry");
    assert.equal(await page.evaluate(() => window.CalcCoach.cramFor("BANK_P3X")), null);
    assert.deepEqual(page.errs, []); await ctx.close();
  });
  await step("peek keeps the normal cadence: no cram toast, stemCram.on false", async () => {
    const { ctx, page } = await newPage();
    await page.goto(BASE + "/#PHYS_PA1"); await up(page);
    await page.waitForTimeout(1000);                                // the one-time cram.json read resolves
    assert.equal(await page.evaluate(() => !!(window.stemCram && window.stemCram.on() === false)), true, "normal timings");
    await page.waitForTimeout(3000);                                // past peek.js's 2.5 s cram-toast delay
    assert.equal(await page.evaluate(() => localStorage.getItem("stem-cram-toast")), null);
    assert.equal(await page.evaluate(() => [...document.querySelectorAll(".stoast")].some(e => e.offsetParent && getComputedStyle(e).visibility !== "hidden")), false);
    assert.deepEqual(page.errs, []); await ctx.close();
  });
} finally { await browser.close(); srv.kill(); }
if (failures) { console.log(failures + " failed"); process.exit(1); }
console.log("all ok");
