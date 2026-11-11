// The once-per-user welcome redirect (welcome-first.js; Tony Nov 6): during the cram window a first visit on a deep link goes to the start (the welcome item) once.
// Own serve.py with a fixture BANK_P3X (welcome item) + BANK_OTH1:  node tests/welcome-first.pw.mjs [port]
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { pw = require("/opt/node22/lib/node_modules/playwright"); }

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = +(process.argv[2] || 8897), BASE = `http://localhost:${PORT}`;
const TMP = mkdtempSync(join(tmpdir(), "welcome-first-")), BANKS = join(TMP, "banks");
// the cram window is over (calc/cram.json enabled:false in the repo): this spec tests the cram surfaces, so it serves a forced-on copy (as cram-off.pw.mjs forces off)
const CRAM_ON = JSON.stringify({ ...JSON.parse(readFileSync(join(ROOT, "client", "calc", "cram.json"), "utf8")), enabled: true }), CRAM = join(TMP, "cram.json");
writeFileSync(CRAM, CRAM_ON);
const cramOn = (ctx) => ctx.route("**/client/calc/cram.json", r => r.fulfill({ status: 200, contentType: "application/json", body: CRAM_ON }));
const num = (code, n) => ({ code, type: "num", answer: String(n + 2), body: [{ type: "text", md: `Plain ${n}: 2 + ${n}` }], noob: { tier: 1 } });
const welcome = { code: "PHYS_PWQ1", type: "num", answer: "4", form: "8/2", tol: 0.01, welcome: true, noob: { tier: 1 },
  body: [{ type: "text", md: "Pressure of $8\\ \\text{N}$ over $2\\ \\text{m}^2$, in $\\text{Pa}$." }],
  repair: { steps: [{ id: "answer", label: "Final answer", kind: "num" }] } };
mkdirSync(BANKS);
writeFileSync(join(BANKS, "BANK_P3X.json"), JSON.stringify({ v: 1, problems: [welcome, num("PHYS_PA1", 1)] }));
writeFileSync(join(BANKS, "BANK_OTH1.json"), JSON.stringify({ v: 1, problems: [num("OTH_W01", 1)] }));
writeFileSync(join(BANKS, "formula-sheet.json"), JSON.stringify({ v: 3, groups: [] }));
const srv = spawn("python3", [join(ROOT, "server", "http_server", "serve.py"), String(PORT)], { env: { ...process.env, STEM_BANKS: BANKS, STEM_FRONT: "BANK_P3X", STEM_FRONT_TITLE: "Exam 3", STEM_TRIES: join(TMP, "tries.json"), STEM_CRAM: CRAM }, stdio: "ignore" });
for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + "/")).ok) break; } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 100)); }
let failures = 0;
async function step(name, fn) { try { await fn(); console.log("ok  ", name); } catch (e) { failures++; console.log("FAIL", name, "\n     ", e.message.slice(0, 700)); } }
const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
const FLAG = "cram-welcome-2026-11";
// Pin the page clock inside welcome-first.js's window (2026-11-05T08:00Z..2026-11-10T07:59:59Z): the real clock made this spec go red after the window ended.
const PIN = new Date(process.env.WELCOME_PIN || "2026-11-07T12:00:00Z");
const newCtx = async () => { const c = await browser.newContext({ serviceWorkers: "block" }); await c.clock.setFixedTime(PIN); await cramOn(c); return c; };
const code = page => page.waitForFunction(() => document.querySelector("#pcode")?.textContent, null, { timeout: 8000 }).then(() => page.textContent("#pcode"));
try {
  await step("a first visit on a deep link lands on the welcome item once; the flag is set; a later deep link works", async () => {
    const ctx = await newCtx();
    await ctx.addInitScript(() => { window.__welcomeFirst = true; try { localStorage.setItem("stem-ob", "done"); localStorage.setItem("stem-welcome-BANK_P3X", "1"); } catch { /* */ } });   // an established user: the old keys do not exempt
    const page = await ctx.newPage();
    await page.goto(BASE + "/#PHYS_PA1");
    assert.equal(await code(page), "PHYS_PWQ1", "sent to the welcome item");
    assert.equal(await page.evaluate(k => localStorage.getItem(k), FLAG), "1");
    assert.equal(await page.evaluate(() => location.hash.slice(1)), "PHYS_PWQ1");
    await page.goto(BASE + "/#PHYS_PA1"); await page.reload();
    assert.equal(await code(page), "PHYS_PA1", "second visit: the deep link works (no loop)");
    assert.equal((await (await fetch(BASE + "/calc", { headers: {} })).json()).welcomed, false, "(a different sid: not welcomed)");
    await ctx.close();
  });
  await step("the server flag follows the sid: cleared localStorage, same cookie, no second redirect", async () => {
    const ctx = await newCtx();
    await ctx.addInitScript(() => { window.__welcomeFirst = true; });
    const page = await ctx.newPage();
    await page.goto(BASE + "/#OTH_W01"); assert.equal(await code(page), "PHYS_PWQ1");
    await page.waitForTimeout(400);
    await page.evaluate(k => localStorage.removeItem(k), FLAG);
    await page.goto(BASE + "/#OTH_W01"); await page.reload();
    assert.notEqual(await code(page), "PHYS_PWQ1", "the server remembered");
    await ctx.close();
  });
  await step("automated browsers (webdriver) are never redirected", async () => {
    const ctx = await newCtx(), page = await ctx.newPage();
    await page.goto(BASE + "/#PHYS_PA1"); assert.equal(await code(page), "PHYS_PA1"); await ctx.close();
  });
} finally { await browser.close(); srv.kill(); }
if (failures) { console.log(failures + " failed"); process.exit(1); }
console.log("all ok");
