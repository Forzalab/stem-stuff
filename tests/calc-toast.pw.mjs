// Smoke: under html.ui-v7 the "Calculator moves" card is ONE compact toast that opens the keys directly (Tony, Nov 14); flag off = the card unchanged.
// Own serve.py with a fixture BANK_P3X:  node tests/calc-toast.pw.mjs [port] [shots dir]
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
const PORT = +(process.argv[2] || 8887), BASE = `http://localhost:${PORT}`;
const TMP = mkdtempSync(join(tmpdir(), "calc-toast-")), BANKS = join(TMP, "banks");
// the cram window is over (calc/cram.json enabled:false in the repo): this spec tests the cram surfaces, so it serves a forced-on copy (as cram-off.pw.mjs forces off)
const CRAM_ON = JSON.stringify({ ...JSON.parse(readFileSync(join(ROOT, "client", "calc", "cram.json"), "utf8")), enabled: true }), CRAM = join(TMP, "cram.json");
writeFileSync(CRAM, CRAM_ON);
const cramOn = (ctx) => ctx.route("**/client/calc/cram.json", r => r.fulfill({ status: 200, contentType: "application/json", body: CRAM_ON }));

const WLC = "PHYS_PWQ1";
const num = (code, n) => ({ code, type: "num", answer: String(n + 2), body: [{ type: "text", md: `Plain ${n}: 2 + ${n}` }], noob: { tier: 1 } });
const welcome = { code: WLC, type: "num", answer: "4", form: "8/2", tol: 0.01, welcome: true, noob: { tier: 1 },
  body: [{ type: "text", md: "A $2\\ \\text{m}$ wide piston carries $8\\ \\text{N}$ over $2\\ \\text{m}^2$. Find the pressure, in $\\text{Pa}$." }],
  repair: { steps: [{ id: "who", label: "Which force presses down?", kind: "pick", opts: [{ id: "a", md: "the load's" }, { id: "b", md: "the air's" }], ok: "a" },
    { id: "answer", label: "Final answer", kind: "num" }] } };
mkdirSync(BANKS);
writeFileSync(join(BANKS, "BANK_P3X.json"), JSON.stringify({ v: 1, problems: [welcome, num("PHYS_PA1", 1), num("PHYS_PA2", 2)] }));
writeFileSync(join(BANKS, "BANK_OTH1.json"), JSON.stringify({ v: 1, problems: [num("OTH_W01", 1), num("OTH_W02", 2)] }));
writeFileSync(join(BANKS, "formula-sheet.json"), JSON.stringify({ v: 3, groups: [{ name: "Fluids", rows: [{ id: "PRESSURE", tex: "P=\\frac{F}{A}" }] }] }));
const srv = spawn("python3", [join(ROOT, "server", "http_server", "serve.py"), String(PORT)], { env: { ...process.env, STEM_BANKS: BANKS, STEM_FRONT: "BANK_P3X", STEM_FRONT_TITLE: "Exam 3",
  STEM_TODAY: "2026-10-23", STEM_TRIES: join(TMP, "tries.json"), STEM_CRAM: CRAM }, stdio: "ignore" });
for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + "/")).ok) break; } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 100)); }
let failures = 0;
async function step(name, fn) { try { await fn(); console.log("ok  ", name); } catch (e) { failures++; console.log("FAIL", name, "\n     ", e.message.slice(0, 700)); } }
async function fresh(init = {}, at = "2026-11-06T18:00:00Z", opts = {}) {
  init = { ...init };
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block", ...opts });
  await cramOn(ctx);
  await ctx.addInitScript(() => document.addEventListener("readystatechange", () => document.documentElement.classList.add("cc-calc-on"), { once: true }));   // the TI/Casio chip is hidden for now (calc-coach.css); these specs still test it
  await ctx.addInitScript(([init, at]) => {                                  // the device's clock, pinned (the exam-day gate): Date.now() and new Date() read it, time still runs
    window.__ccToastMs = 300; window.__ccOfferMs = 99999999;
    const R = Date, off = R.parse(at) - R.now();
    window.Date = class extends R { constructor(...a) { a.length ? super(...a) : super(R.now() + off); } static now() { return R.now() + off; } };
    try { localStorage.setItem("stem-ob", "done"); for (const b of ["right", "miss", "three", "redo"]) localStorage.setItem("stem-ob-rw-" + b, "9");
      if (!sessionStorage.getItem("cc-init")) { sessionStorage.setItem("cc-init", "1"); for (const [k, v] of Object.entries(init)) localStorage.setItem(k, v); } } catch { /* blocked */ } }, [init, at]);
  const page = await ctx.newPage(); const errs = []; page.on("pageerror", e => errs.push(e.message));
  return { ctx, page, errs };
}
const SHOTS = process.argv[3] || join(ROOT, "tests", "out"); mkdirSync(SHOTS, { recursive: true });
const anyUp = page => page.waitForFunction(() => document.querySelector("#pcode")?.textContent && !document.querySelector("#freeze").hidden, null, { timeout: 8000 });
const AFTER = "2026-11-10T09:00:00Z", V7 = { "stem-ui": "v7" };
const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
try {
  await step("flag on, model picked: no card; one toast; click opens the keys directly (no Show me the keys step); once per day", async () => {
    const { ctx, page, errs } = await fresh({ ...V7, "stem-calc-model": "ti-36x-pro" }, AFTER);
    await page.goto(BASE + "/"); await anyUp(page);
    await page.waitForSelector(".stoast.on.stoast-c-calc", { timeout: 12000 });
    assert.equal(await page.$("#q .cc-welcome"), null, "no card");
    const t = await page.evaluate(() => { const e = document.querySelector(".stoast-c-calc"), b = e.querySelector(".stoast-b"), cs = getComputedStyle(e);
      return { text: e.querySelector(".stoast-t").textContent, border: cs.borderTopWidth, radius: cs.borderTopLeftRadius, h: b.getBoundingClientRect().height, x: e.querySelector(".stoast-x").getBoundingClientRect().width, role: b.getAttribute("role"), tab: b.tabIndex }; });
    assert.equal(t.text, "Calculator moves: solve in one go, store a number."); assert.equal(t.border, "0px"); assert.equal(t.radius, "16px");
    assert.ok(t.h >= 44 && t.x >= 44 && t.role === "button" && t.tab === 0, JSON.stringify(t));
    await page.waitForTimeout(2500); await page.screenshot({ path: join(SHOTS, "calc-toast-390.png") });
    await page.focus(".stoast-c-calc .stoast-b"); await page.keyboard.press("Enter");
    await page.waitForSelector(".cc-ov .cc-deck"); assert.equal(await page.$(".cpick[role=dialog]"), null, "keys, not the picker");
    await page.keyboard.press("Escape");
    await page.reload(); await anyUp(page); await page.waitForTimeout(1500);
    assert.equal(await page.$(".stoast-c-calc.on"), null, "once per day");
    assert.deepEqual(errs, []); await ctx.close();
  });
  await step("flag on, no model: the click opens the picker; X dismisses and stays dismissed", async () => {
    const { ctx, page } = await fresh({ ...V7 }, AFTER);
    await page.goto(BASE + "/"); await anyUp(page);
    await page.waitForSelector(".stoast.on.stoast-c-calc", { timeout: 12000 });
    await page.click(".stoast-c-calc .stoast-b"); await page.waitForSelector(".cpick[role=dialog]"); assert.equal(await page.$(".cc-ov"), null);
    await ctx.close();
    const b = await fresh({ ...V7, "stem-calc-model": "ti-36x-pro" }, AFTER);
    await b.page.goto(BASE + "/"); await anyUp(b.page); await b.page.waitForSelector(".stoast.on.stoast-c-calc", { timeout: 12000 });
    await b.page.click(".stoast-c-calc .stoast-x"); await b.page.waitForTimeout(600);
    assert.equal(await b.page.$(".stoast.on"), null); await b.page.reload(); await anyUp(b.page); await b.page.waitForTimeout(1500);
    assert.equal(await b.page.$(".stoast-c-calc.on"), null, "dismissed stays dismissed"); await b.ctx.close();
  });
  await step("desktop 1366 shot", async () => {
    const { ctx, page } = await fresh({ ...V7, "stem-calc-model": "ti-36x-pro" }, AFTER, { viewport: { width: 1366, height: 768 } });
    await page.goto(BASE + "/"); await anyUp(page);
    await page.waitForSelector(".stoast.on.stoast-c-calc", { timeout: 12000 }); await page.waitForTimeout(400);
    await page.screenshot({ path: join(SHOTS, "calc-toast-1366.png") }); await ctx.close();
  });
  await step("flag off: the card is unchanged, no toast", async () => {
    const { ctx, page } = await fresh({ "stem-calc-model": "ti-36x-pro" }, AFTER);
    await page.goto(BASE + "/"); await anyUp(page); await page.waitForSelector("#q .cc-welcome");
    assert.equal(await page.textContent("#q .cc-welcome .cc-wt"), "Calculator moves");
    assert.equal(await page.textContent("#q .cc-welcome .cc-btn"), "Show me the keys");
    await page.waitForTimeout(1200); assert.equal(await page.$(".stoast-c-calc.on"), null); await ctx.close();
  });
} finally { await browser.close(); srv.kill(); }
if (failures) process.exit(1);
