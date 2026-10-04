// mc pick all under click spam (prove mode is gone in both modes since #57, so its cases went with it) (Tony, Oct 3: "I can click multiple times"). The /check route is slowed so taps land while a
// request is out. Every burst must send ONE request and spend at most one try; a finished problem sends nothing more.
// Starts its own serve.py with a throwaway tries.json:   node tests/choose-all-spam.pw.mjs [port]
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { pw = require("/opt/node22/lib/node_modules/playwright"); }

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = +(process.argv[2] || 8823), BASE = `http://localhost:${PORT}`;
const TRIES = join(mkdtempSync(join(tmpdir(), "spam-")), "tries.json");
const srv = spawn("python3", [join(ROOT, "serve.py"), String(PORT)], { env: { ...process.env, STEM_TRIES: TRIES }, stdio: "ignore" });
for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + "/")).ok) break; } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 100)); }

let fails = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); }
  catch (e) { fails++; console.log("FAIL", name, "\n     ", e.message.slice(0, 700)); }
}
const opened = (page, code) => page.waitForFunction(c => document.querySelector("#pcode")?.textContent === c && !document.querySelector("#freeze").hidden
  && (!document.querySelector("#splash") || getComputedStyle(document.querySelector("#splash")).opacity === "0"), code, { timeout: 8000 });
const row = (page, id) => page.locator(`#q .opt[data-id="${id}"]`);
const st = page => page.evaluate(() => ({
  on: [...document.querySelectorAll("#q .opt")].filter(o => o.getAttribute("aria-checked") === "true").map(o => o.dataset.id).sort(),
  wrong: [...document.querySelectorAll("#q .opt.wrong")].map(o => o.dataset.id), right: [...document.querySelectorAll("#q .opt.right")].map(o => o.dataset.id).sort(),
  go: document.querySelector("#mcGo")?.disabled, goShown: !!document.querySelector("#mcGo") && document.querySelector("#mcGo").offsetParent !== null,
  fb: document.querySelector("#fb").textContent, finished: window.__drill.state.finished, tries: window.__drill.state.tries.length }));

/* a page that counts /check requests, keeps their verdicts, and holds each one DELAY ms before it reaches the server */
const DELAY = 450;
async function rig(ctx) {
  const page = await ctx.newPage(), sent = [], got = [];
  await page.route("**/check", async r => { sent.push(r.request().postDataJSON()); await new Promise(f => setTimeout(f, DELAY)); await r.continue(); });
  page.on("response", async res => { if (res.url().endsWith("/check")) { try { got.push(await res.json()); } catch { /* aborted */ } } });
  return { page, sent, got };
}
/* n taps on Check inside one task (faster than any finger), then a dblclick and Enter while the request is out */
async function burst(page, touch, n = 6) {
  await page.evaluate(k => { const b = document.querySelector("#mcGo"); for (let i = 0; i < k; i++) b.click(); }, n);
  if (touch) await page.locator("#mcGo").tap({ force: true, timeout: 500 }).catch(() => {});
  else await page.locator("#mcGo").dblclick({ force: true, timeout: 500 }).catch(() => {});
  await page.keyboard.press("Enter").catch(() => {});
  await page.waitForTimeout(DELAY + 600);                       // the held request lands, the UI settles
}

const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
try {
  for (const [name, viewport, touch] of [["phone", { width: 390, height: 844 }, true], ["desktop", { width: 1280, height: 900 }, false]]) {
    const tapOn = (page, id) => touch ? row(page, id).tap() : row(page, id).click();

    /* plain pick all (CSCI26_A7K, right = a + c): wrong set, then a second wrong set, then nothing more */
    let ctx = await browser.newContext({ viewport, hasTouch: touch, serviceWorkers: "block" });
    let { page, sent, got } = await rig(ctx);
    await page.goto(`${BASE}/#CSCI26_A7K`); await opened(page, "CSCI26_A7K");
    await step(`${name}: wrong set spammed = one request, one try, one strike`, async () => {
      for (const id of ["a", "b", "d"]) await tapOn(page, id);
      await burst(page, touch);
      const s = await st(page);
      assert.equal(sent.length, 1, `requests sent: ${sent.length}`);
      assert.deepEqual([got.at(-1).verdict, got.at(-1).triesLeft], ["wrong", 1]);
      assert.equal(s.tries, 1, "one try recorded"); assert.deepEqual(s.wrong, ["b"]); assert.equal(s.finished, false);
      assert.equal(await page.locator("#toast.on").count() <= 1, true);
    });
    await step(`${name}: second set spammed = one more request, then closed`, async () => {
      await burst(page, touch);                                  // ticks a + d stay: a new set (a subset of right = miss)
      const s = await st(page);
      assert.equal(sent.length, 2, `requests sent: ${sent.length}`); assert.equal(s.tries, 2); assert.equal(s.finished, true);
      assert.equal(got.filter(r => r.verdict !== "locked").length, 2, "no extra graded try");
    });
    await step(`${name}: finished: taps, Enter and a direct click send nothing`, async () => {
      await page.evaluate(() => document.querySelector("#mcGo")?.click());
      await page.keyboard.press("Enter"); await page.waitForTimeout(DELAY + 300);
      assert.equal(sent.length, 2); assert.equal((await st(page)).tries, 2);
    });
    await ctx.close();

    /* right set spammed: one request, correct once, survives a reload */
    ({ page, sent, got } = await rig(ctx = await browser.newContext({ viewport, hasTouch: touch, serviceWorkers: "block" })));
    await page.goto(`${BASE}/#CSCI26_A7K`); await opened(page, "CSCI26_A7K");
    await step(`${name}: right set spammed = one request, correct, one try`, async () => {
      await tapOn(page, "c"); await tapOn(page, "a");
      await burst(page, touch);
      const s = await st(page);
      assert.equal(sent.length, 1); assert.equal(got[0].verdict, "correct"); assert.deepEqual(s.right, ["a", "c"]);
      assert.equal(s.tries, 1); assert.equal(s.finished, true);
      await page.reload(); await opened(page, "CSCI26_A7K"); await page.waitForTimeout(300);
      const r = await st(page); assert.deepEqual(r.right, ["a", "c"]); assert.equal(r.tries, 1);
    });
    await ctx.close();
  }
} finally {
  await browser.close(); srv.kill();
}
console.log(fails ? `${fails} FAILED` : "ALL OK");
process.exit(fails ? 1 : 0);
