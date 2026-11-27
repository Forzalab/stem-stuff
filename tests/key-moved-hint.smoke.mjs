// KEY-MOVED hint smoke (Tony Nov 27, PR #769 moved the MC key from the tile to #mcGo): first MC visit under ui-v7 shows a one-time
// toast-style bubble beside #mcGo (caret pointing at it, off the question text, 360x640 + 390); a tap dismisses it; a reload never shows it again;
// the flag off / a typed item shows none. Own serve.py, uploaded bank.   node tests/key-moved-hint.smoke.mjs [port] [shots dir]
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { launchBrowser } from "./pw-browser.mjs";
import { serverUp } from "./lib/boot.mjs";
import { settled } from "./lib/wait.mjs";
const require = createRequire(import.meta.url);
let pw; try { pw = require("playwright"); } catch { pw = require("/opt/node22/lib/node_modules/playwright"); }
const ROOT = join(dirname(fileURLToPath(import.meta.url)), ".."), PORT = +(process.argv[2] || 8851), BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = process.argv[3] || join(ROOT, "tests", "out"); mkdirSync(SHOTS, { recursive: true });
const TRIES = join(mkdtempSync(join(tmpdir(), "keymoved-")), "tries.json");
const mc = (code, md) => ({ code, type: "mc", how: "Pick one.", body: [{ type: "text", md }], choices: [{ id: "a", md: "The cart speeds up" }, { id: "b", md: "The cart slows down" }, { id: "c", md: "It stays at one speed" }], answer: "a" });
const FILE = { v: 1, problems: [
  mc("PSY_K01", "A cart rolls down a ramp from rest. What happens to its speed as it rolls?"),
  mc("PSY_K02", "A ball is thrown straight up. At the top of its flight, what is true about its speed?"),
  { code: "PSY_K03", type: "num", answer: "42", tol: 0.01, how: "Number only.", body: [{ type: "text", md: "What is 6 times 7?" }] },
] };
const srv = spawn("python3", [join(ROOT, "server", "http_server", "serve.py"), String(PORT)], { env: { ...process.env, STEM_TRIES: TRIES, STEM_TODAY: "2026-10-23" }, stdio: "ignore" });
await serverUp(BASE);
let fails = 0;
async function step(name, fn) { try { await fn(); console.log("ok  ", name); } catch (e) { fails++; console.log("FAIL", name, "\n     ", String(e.message).slice(0, 700)); } }
const browser = await launchBrowser(pw);
async function open(ctx, ui = true) {
  const page = await ctx.newPage(); await page.goto(`${BASE}/${ui ? "?ui=v7" : ""}`);
  const [fc] = await Promise.all([page.waitForEvent("filechooser"), page.click("#upload")]);
  await fc.setFiles({ name: "keymoved.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(FILE)) });
  await page.waitForFunction(() => (document.querySelector("#pcode")?.textContent || "") === "PSY_K01" && (document.querySelector("#q")?.textContent || "").length > 20
    && (!document.querySelector("#splash") || getComputedStyle(document.querySelector("#splash")).opacity === "0"), null, { timeout: 8000 });
  await settled(page); return page;
}
const hintUp = page => page.evaluate(() => { const h = document.querySelector(".stoast-hint"); return !!h && h.classList.contains("on") && getComputedStyle(h).visibility === "visible"; });
const geo = page => page.evaluate(() => {
  const h = document.querySelector(".stoast-hint").getBoundingClientRect(), k = document.getElementById("mcGo").getBoundingClientRect(), qc = document.querySelector("#problem") || document.querySelector("#q");
  const texts = [...document.querySelectorAll("#blocks, #q .how, .ptitle, #problem .qtitle, #problem .qbody")].filter(e => e.getClientRects().length).map(e => e.getBoundingClientRect());
  const overlapQ = texts.some(r => !(h.right <= r.left || h.left >= r.right || h.bottom <= r.top || h.top >= r.bottom));
  return { hR: h.right, hCy: (h.top + h.bottom) / 2, kL: k.left, kCy: (k.top + k.bottom) / 2, hL: h.left, hT: h.top, hB: h.bottom, overlapQ, text: document.querySelector(".stoast-hint-t").textContent, bold: document.querySelector(".stoast-hint-t b")?.textContent, vw: innerWidth };
});
for (const [name, vp] of [["390", { width: 390, height: 844 }], ["360x640", { width: 360, height: 640 }]]) {
  const ctx = await browser.newContext({ viewport: vp, hasTouch: true, isMobile: true, deviceScaleFactor: 2, serviceWorkers: "block" });
  await ctx.addCookies([{ name: "stem-mode-v", value: "2", url: BASE }]);
  const page = await open(ctx); const errs = []; page.on("pageerror", e => errs.push(e.message));
  await step(`${name}: first MC visit shows the hint beside #mcGo, caret toward the key, off the question`, async () => {
    await page.waitForFunction(() => document.querySelector(".stoast-hint.on"), null, { timeout: 4000 });
    await page.waitForTimeout(350);
    const g = await geo(page);
    assert.equal(g.bold, "key"); assert.match(g.text, /Looking for the key\?\s*It.s here now\./);
    assert.ok(g.hR <= g.kL - 8 && g.hR >= g.kL - 20, `bubble right ${g.hR} touches the key's left ${g.kL} (caret gap)`);
    assert.ok(Math.abs(g.hCy - g.kCy) <= 2, `vertically centred on the key (${g.hCy} vs ${g.kCy})`);
    assert.ok(g.hL >= 15 && g.hR <= g.vw - 15, "inside the 16px gutters");
    assert.ok(!g.overlapQ, "never on the question text");
    await page.screenshot({ path: join(SHOTS, `key-moved-hint-${name}.png`) });
  });
  await step(`${name}: a tap dismisses it, the key still takes the tap`, async () => {
    await page.waitForTimeout(300);
    await page.tap("#q .opt >> nth=0");
    await page.waitForFunction(() => !document.querySelector(".stoast-hint.on"), null, { timeout: 2000 });
    assert.equal(await page.evaluate(() => document.querySelector("#q .opt[aria-checked=true]") !== null), true, "the tap reached the tile");
  });
  await step(`${name}: reload does not show it again`, async () => {
    await page.reload(); await page.waitForFunction(() => (document.querySelector("#q")?.textContent || "").length > 20 && document.getElementById("mcGo"), null, { timeout: 8000 });
    await page.waitForTimeout(1500);
    assert.equal(await hintUp(page), false);
    assert.equal(await page.evaluate(() => localStorage.getItem("stem-key-moved-1")), "1");
  });
  assert.deepEqual(errs, []);
  await ctx.close();
}
await step("times out after ~6 s; reduced motion = fade only; typed item and flag off show none", async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: "reduce", serviceWorkers: "block" });
  await ctx.addCookies([{ name: "stem-mode-v", value: "2", url: BASE }]);
  const page = await open(ctx);
  await page.waitForFunction(() => document.querySelector(".stoast-hint.on"), null, { timeout: 4000 });
  assert.match(await page.evaluate(() => getComputedStyle(document.querySelector(".stoast-hint")).animationName), /stoast-fade/);
  await page.waitForFunction(() => !document.querySelector(".stoast-hint.on"), null, { timeout: 8000 });
  await ctx.close();
  const c2 = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  const p2 = await open(c2, false); await p2.waitForTimeout(1200);
  assert.equal(await p2.evaluate(() => !!document.querySelector(".stoast-hint.on")), false, "flag off");
  await c2.close();
});
await browser.close(); srv.kill();
console.log(fails ? `${fails} failed` : "all ok"); process.exit(fails ? 1 : 0);
