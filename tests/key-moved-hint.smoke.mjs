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
const browser = await launchBrowser(pw, { keyhint: true, motion: true });
async function open(ctx, ui = true, file = FILE, first = "PSY_K01", quick = false) {
  const page = await ctx.newPage(); await page.goto(`${BASE}/${ui ? "?ui=v7" : ""}`);
  const [fc] = await Promise.all([page.waitForEvent("filechooser"), page.click("#upload")]);
  await fc.setFiles({ name: "keymoved.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(file)) });
  await page.waitForFunction(first => (document.querySelector("#pcode")?.textContent || "") === first && (document.querySelector("#q")?.textContent || "").length > 20
    && (!document.querySelector("#splash") || getComputedStyle(document.querySelector("#splash")).opacity === "0"), first, { timeout: 8000 });
  if (!quick) await settled(page); return page;
}
const toastUp = page => page.evaluate(() => { const t = document.querySelector(".stoast"); return !!t && t.classList.contains("on") && getComputedStyle(t).visibility === "visible" ? t.querySelector(".stoast-t").textContent : null; });
const MSG = /Looking for the key\?/, SUB = /It.s at the bottom right now\./;
for (const [name, vp] of [["390", { width: 390, height: 844 }], ["360x640", { width: 360, height: 640 }]]) {
  const ctx = await browser.newContext({ viewport: vp, hasTouch: true, isMobile: true, deviceScaleFactor: 2, serviceWorkers: "block" });
  await ctx.addCookies([{ name: "stem-mode-v", value: "2", url: BASE }]);
  const page = await open(ctx, true, FILE, "PSY_K01", true); const errs = []; page.on("pageerror", e => errs.push(e.message));
  await step(`${name}: first MC visit shows the plain toast once, the key rings 2 pulses then clears`, async () => {
    await page.waitForFunction(() => document.getElementById("mcGo")?.classList.contains("key-hint"), null, { polling: "raf", timeout: 6000 });
    await page.waitForTimeout(250);
    assert.match(await toastUp(page), MSG);
    const r = await page.evaluate(() => { const k = document.getElementById("mcGo"), c = getComputedStyle(k); return { on: k.classList.contains("key-hint"), n: c.animationIterationCount, name: c.animationName, os: c.outlineStyle, ow: c.outlineWidth }; });
    assert.equal(r.on, true); assert.equal(r.n, "2"); assert.match(r.name, /key-hint-pulse/); assert.equal(r.os, "solid"); assert.notEqual(r.ow, "0px");
    if (name === "390") await page.screenshot({ path: join(SHOTS, "keyplain-pulse-390.png") });
    await page.waitForFunction(() => !document.getElementById("mcGo").classList.contains("key-hint"), null, { timeout: 3000 });
    assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById("mcGo")).outlineStyle !== "solid"), true, "ring gone after the pulses");
 assert.match(await page.evaluate(() => document.querySelector(".stoast-s").textContent), SUB);
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
await step("reduced motion = static ring, no animation; a really focused key keeps its ring", async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: "reduce", serviceWorkers: "block" });
  await ctx.addCookies([{ name: "stem-mode-v", value: "2", url: BASE }]);
  const page = await open(ctx, true, FILE, "PSY_K01", true);
  await page.waitForFunction(() => document.getElementById("mcGo")?.classList.contains("key-hint"), null, { polling: "raf", timeout: 6000 });
  const r = await page.evaluate(() => { const c = getComputedStyle(document.getElementById("mcGo")); return { name: c.animationName, os: c.outlineStyle }; });
  assert.equal(r.name, "none"); assert.equal(r.os, "solid");
  await page.tap("#q .opt >> nth=0"); await page.keyboard.press("Shift");
  await page.evaluate(() => document.getElementById("mcGo").focus());
  await page.waitForFunction(() => !document.getElementById("mcGo").classList.contains("key-hint"), null, { timeout: 3000 });
  const f = await page.evaluate(() => { const k = document.getElementById("mcGo"), c = getComputedStyle(k); return { fv: k.matches(":focus-visible"), os: c.outlineStyle }; });
  assert.equal(f.fv, true); assert.equal(f.os, "solid", "focus ring stays");
  await ctx.close();
});
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
