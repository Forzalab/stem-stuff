// KEY-MOVED hint smoke (Tony Nov 27, PR #769 moved the MC key from the tile to #mcGo): first MC visit under ui-v7 shows a one-time
// PLAIN toast (stemToast.show, the normal row toast; the bubble look is archived in brain toast-bubble-v1) saying where the key is;
// a reload never shows it again; flag off / a typed item / the welcome Q1 show none. Own serve.py, uploaded bank.   node tests/key-moved-hint.smoke.mjs [port] [shots dir]
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
const browser = await launchBrowser(pw, { keyhint: true });
async function open(ctx, ui = true, file = FILE, first = "PSY_K01") {
  const page = await ctx.newPage(); await page.goto(`${BASE}/${ui ? "?ui=v7" : ""}`);
  const [fc] = await Promise.all([page.waitForEvent("filechooser"), page.click("#upload")]);
  await fc.setFiles({ name: "keymoved.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(file)) });
  await page.waitForFunction(first => (document.querySelector("#pcode")?.textContent || "") === first && (document.querySelector("#q")?.textContent || "").length > 20
    && (!document.querySelector("#splash") || getComputedStyle(document.querySelector("#splash")).opacity === "0"), first, { timeout: 8000 });
  await settled(page); return page;
}
const toastUp = page => page.evaluate(() => { const t = document.querySelector(".stoast"); return !!t && t.classList.contains("on") && getComputedStyle(t).visibility === "visible" ? t.querySelector(".stoast-t").textContent : null; });
const MSG = /Looking for the key\?/, SUB = /It.s at the bottom right now\./;
for (const [name, vp] of [["390", { width: 390, height: 844 }], ["360x640", { width: 360, height: 640 }]]) {
  const ctx = await browser.newContext({ viewport: vp, hasTouch: true, isMobile: true, deviceScaleFactor: 2, serviceWorkers: "block" });
  await ctx.addCookies([{ name: "stem-mode-v", value: "2", url: BASE }]);
  const page = await open(ctx); const errs = []; page.on("pageerror", e => errs.push(e.message));
  await step(`${name}: first MC visit shows the plain toast, once, inside the gutters`, async () => {
    await page.waitForFunction(() => document.querySelector(".stoast.on"), null, { timeout: 5000 });
    await page.waitForTimeout(350);
    assert.match(await toastUp(page), MSG); assert.match(await page.evaluate(() => document.querySelector(".stoast-s").textContent), SUB);
    const g = await page.evaluate(() => { const r = document.querySelector(".stoast").getBoundingClientRect(); return { l: r.left, r: r.right, vw: innerWidth, bubble: !!document.querySelector(".stoast-hint") }; });
    assert.ok(g.l >= 15 && g.r <= g.vw - 15, "inside the 16px gutters"); assert.equal(g.bubble, false, "no bubble element");
    assert.equal(await page.evaluate(() => localStorage.getItem("stem-key-moved-1")), "1");
    await page.screenshot({ path: join(SHOTS, `key-moved-plain-${name}.png`) });
  });
  await step(`${name}: reload does not show it again`, async () => {
    await page.reload(); await page.waitForFunction(() => (document.querySelector("#q")?.textContent || "").length > 20 && document.getElementById("mcGo"), null, { timeout: 8000 });
    await page.waitForTimeout(1500);
    assert.equal(await toastUp(page), null);
  });
  assert.deepEqual(errs, []);
  await ctx.close();
}
await step("typed item and flag off show none", async () => {
  const c1 = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  const p1 = await open(c1, false); await p1.waitForTimeout(1500);
  assert.equal(await toastUp(p1), null, "flag off");
  assert.equal(await p1.evaluate(() => localStorage.getItem("stem-key-moved-1")), null);
  await c1.close();
  const c2 = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, serviceWorkers: "block" });
  await c2.addCookies([{ name: "stem-mode-v", value: "2", url: BASE }]);
  const p2 = await open(c2, true, { v: 1, problems: [FILE.problems[2]] }, "PSY_K03"); await p2.waitForTimeout(1500);
  assert.equal(await toastUp(p2), null, "typed item");
  assert.equal(await p2.evaluate(() => localStorage.getItem("stem-key-moved-1")), null);
  await c2.close();
});
await browser.close(); srv.kill();
console.log(fails ? `${fails} failed` : "all ok"); process.exit(fails ? 1 : 0);
