// BUG-THINK-LIGHT-SCROLL (Tony, live after #711): the Cluck Ask bar's thinking light (ask-glass.js §think: the lit lens clones
// swapped on .g-copy by a clock) stopped the moment the reply was scrolled and came back when scrolling stopped.
// The scroll path has its own filter on the same node ("adaptive chroma": the 1-pass `_m` clone, restored ~150 ms after the last
// scroll) and the clock was a requestAnimationFrame loop, which iOS/WebKit stops while a scroll is in flight. Checks:
//   idle    thinking OFF: a scroll still swaps .g-copy to the 1-pass `_m` filter, then restores the lens (adaptive chroma kept)
//   owner   thinking starts during a scroll: .g-copy is handed to the light at once (a lit clone), never left on `_m`
//   orbit   600 ms of scrolling while thinking: the computed filter keeps changing, never `_m`
//   paused  600 ms with requestAnimationFrame blocked (an iOS/WebKit momentum scroll): the light still changes (timer clock)
// 1280x800 desk, own serve.py + a slow stub OpenRouter. The lens needs a strong device tier, so the fx frame probe is skipped and
// the tier is pinned (hardwareConcurrency/deviceMemory) before first paint.
//   node tests/think-light-scroll.pw.mjs <port>
import { launchBrowser } from "./pw-browser.mjs";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { writeFileSync, mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { serverUp } from "./lib/boot.mjs";   // CI-ARCH B3: a dead serve.py fails at once, with its URL
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { try { pw = require("/opt/node22/lib/node_modules/playwright"); } catch { pw = require("/opt/node-tools/node_modules/playwright"); } }

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = /^\d+$/.test(process.argv[2] || "") ? process.argv[2] : "8891", BASE = `http://127.0.0.1:${PORT}`;
const tmp = mkdtempSync(join(tmpdir(), "think-")), banks = join(tmp, "banks");
mkdirSync(banks);
const txt = md => [{ type: "text", md }];
writeFileSync(join(banks, "BANK_THINK.json"), JSON.stringify({ v: 20261022, problems: [{
  code: "CALC1_THK1", title: "Think light", type: "mc", shuffle: false, body: txt("Pick one."), correct: "a",
  choices: ["a one", "b two", "c three", "d four"].map((md, i) => ({ id: "abcd"[i], md })),
  saccharine: { title: "Think light", key: "Tick: a", slip: { b: "Half." } } }] }));
/* the miss reply (long: the body must scroll) then a slow follow-up chat: thinking stays on for ~7 s */
const LONG = [];
for (let i = 0; i < 18; i++) LONG.push(`Paragraph ${i}. Friction is the only thing turning the car, so it has to supply the whole centripetal force. The mass cancels on both sides.\n\n$$r = \\frac{v^2}{\\mu_s g}$$\n\n`);
LONG.push("Tick: a. Egg-cellent.");
const SLOW = Array.from({ length: 90 }, (_, i) => `chunk ${i} of the slow follow-up answer with a bit of prose to fill the line. `);
const stub = createServer(async (req, res) => {
  let body = ""; for await (const c of req) body += c;
  let j = {}; try { j = JSON.parse(body); } catch { /* */ }
  if (!j.stream) { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ choices: [{ message: { content: '{"verdict": "on"}' } }] })); return; }
  res.writeHead(200, { "Content-Type": "text/event-stream" });
  const isChat = JSON.stringify(j).includes("why does the mass cancel");   // the follow-up; everything else is the miss reply
  const parts = isChat ? SLOW : LONG;
  let i = 0;
  const t = setInterval(() => {
    if (i < parts.length) res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: parts[i++] } }] })}\n\n`);
    else { res.end("data: [DONE]\n\n"); clearInterval(t); }
  }, isChat ? 110 : 30);
});
await new Promise(r => stub.listen(0, "127.0.0.1", r));
const srv = spawn("python3", [join(ROOT, "server", "http_server", "serve.py"), PORT], { env: { ...process.env, STEM_BANKS: banks, STEM_TRIES: join(tmp, "tries.json"),
  OPENROUTER_BASE: `http://127.0.0.1:${stub.address().port}`, OPENROUTER_API_KEY: "sk-test", CLAUDE_API: "" }, stdio: "ignore" });
const kill = () => { try { srv.kill(); } catch { /* */ } try { stub.close(); } catch { /* */ } };
process.on("exit", kill); process.on("SIGINT", () => { kill(); process.exit(130); }); process.on("SIGTERM", () => { kill(); process.exit(143); });
await serverUp(BASE);

const REF = /url\("?#([^)"]+)"?\)/;                       // computed filter -> the SVG filter id
const lit = f => { const m = REF.exec(f || ""); return !!m && /_\d+$/.test(m[1]); };   // a think clone (hgN_0..hgN_119)
const mid = f => { const m = REF.exec(f || ""); return !!m && /_m$/.test(m[1]); };     // the scroll path's 1-pass clone
const ids = rows => [...new Set(rows.map(r => { const m = REF.exec(r.f || ""); return m ? m[1] : ""; }))];

let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); }
  catch (e) { failures++; console.log("FAIL", name, "\n     ", String(e.message).slice(0, 900)); }
}
const browser = await launchBrowser(pw, { args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: "block", reducedMotion: "no-preference" });
await ctx.addInitScript(() => { try {
  localStorage.setItem("stem-ob", "done"); localStorage.setItem("stem-ui", "v7"); localStorage.setItem("stem-jev", "0");
  sessionStorage.setItem("stem-fx-probed", "1");                                        // no frame probe: the lens is being tested, not the tier
  for (const b of ["right", "miss", "three"]) localStorage.setItem("stem-ob-rw-" + b, "9");
} catch { /* */ }
  try { Object.defineProperty(Navigator.prototype, "hardwareConcurrency", { get: () => 8 }); } catch { /* */ }
  try { Object.defineProperty(Navigator.prototype, "deviceMemory", { get: () => 8 }); } catch { /* */ }
});
const page = await ctx.newPage();
page.errs = []; page.on("pageerror", e => page.errs.push(String(e)));
await page.goto(BASE + "/#BANK_THINK");
await page.waitForFunction(() => !document.getElementById("splash") && !!window.stemBank && !!window.__drill, null, { timeout: 15000 });
const n0 = await page.evaluate(() => window.__drill.state.tries.length);
await page.click('.opt[data-id="b"]'); await page.click('.ch[data-id="b"] .send');
await page.waitForFunction(n => window.__drill.state.tries.length > n, n0, { timeout: 8000 });
await page.evaluate(() => window.stemIdleTap());
await page.waitForFunction(() => window.stemCluckOpen(), null, { timeout: 5000 });
await page.waitForSelector("#cluck .ask.ag > .g-copy", { timeout: 5000 });
/* skip the reply's typing and let it finish: the body is long enough to scroll and the ask field enables */
await page.click("#cluck .wtext").catch(() => {});
await page.waitForFunction(() => { const w = document.querySelector("#cluck .wtext"); return !!w && /Egg-cellent/.test(w.textContent || "") && !w.classList.contains("wrun"); }, null, { timeout: 10000 });
const env = await page.evaluate(() => { const f = document.querySelector("#cluck .ask.ag"), c = f && f.querySelector(":scope > .g-copy"), sc = document.querySelector("#cluck .cl-bd");
  return { html: document.documentElement.className, form: !!f && f.className, filter: c && c.style.filter, cw: c && c.offsetWidth, locked: !!f && f.classList.contains("locked"),
    scrollable: !!sc && sc.scrollHeight - sc.clientHeight > 200 }; });

await step("setup: the v7 glass bar is unlocked, lit (a lens filter) and its reply scrolls", async () => {
  assert.ok(env.form, "the ask bar exists");
  assert.doesNotMatch(env.html, /\bfx-dim\b/, "the lens is on (not the fx-dim solid fallback): " + env.html);
  assert.ok(!env.locked, "the bar is unlocked after the graded try");
  assert.ok(env.cw > 0, "the .g-copy copy is laid out");
  assert.ok(REF.test(env.filter || ""), "the lens filter is set: " + env.filter);
  assert.ok(env.scrollable, "the reply body can scroll");
});

const scrollAt = (top) => page.evaluate(t => { const sc = document.querySelector("#cluck .cl-bd"); sc.scrollTop = t; sc.dispatchEvent(new Event("scroll")); }, top);
const filterNow = () => page.evaluate(() => getComputedStyle(document.querySelector("#cluck .ask.ag > .g-copy")).filter);
const thinkOn = () => page.evaluate(() => document.querySelector("#cluck .ask.ag").classList.contains("think"));

await step("idle: a scroll while NOT thinking wears the 1-pass filter, then restores the lens", async () => {
  await scrollAt(50);
  await page.waitForFunction(() => /_m"?\)$/.test(getComputedStyle(document.querySelector("#cluck .ask.ag > .g-copy")).filter), null, { timeout: 1500 });
  assert.ok(mid(await filterNow()), "the scroll path's `_m` filter shows while idle");
  await page.waitForFunction(() => !/_m"?\)$/.test(getComputedStyle(document.querySelector("#cluck .ask.ag > .g-copy")).filter), null, { timeout: 2000 });
  assert.ok(!(await thinkOn()), "the light is off before the follow-up");
});

await step("owner: thinking that starts during a scroll takes .g-copy at once (never `_m`)", async () => {
  await page.evaluate(() => {
    const sc = document.querySelector("#cluck .cl-bd"), f = document.querySelector("#cluck .ask.ag"), c = f.querySelector(":scope > .g-copy");
    sc.scrollTop = 120; sc.dispatchEvent(new Event("scroll"));                       // the scroll path owns `_m` this instant
    window.__thinkAt = null;
    const mo = new MutationObserver(() => { if (f.classList.contains("think") && window.__thinkAt === null) { window.__thinkAt = c.style.filter; mo.disconnect(); } });
    mo.observe(f, { attributes: true, attributeFilter: ["class"] });
    const ta = f.querySelector("textarea"); ta.value = "why does the mass cancel"; ta.dispatchEvent(new Event("input", { bubbles: true })); f.requestSubmit();
  });
  await page.waitForFunction(() => window.__thinkAt !== null, null, { timeout: 4000 });
  const at = await page.evaluate(() => ({ f: window.__thinkAt, on: document.querySelector("#cluck .ask.ag").classList.contains("think") }));
  assert.ok(at.on, "the bar is thinking");
  assert.ok(!mid(at.f), "the first frame of thinking is not the scroll path's 1-pass filter: " + at.f);
  assert.ok(lit(at.f), "the light owns .g-copy the moment thinking starts: " + at.f);
});

await step("orbit: 600 ms of scrolling while thinking keeps the lit filter changing, never `_m`", async () => {
  const rows = await page.evaluate(async () => {
    const sc = document.querySelector("#cluck .cl-bd"), f = document.querySelector("#cluck .ask.ag"), c = f.querySelector(":scope > .g-copy");
    const out = [], t0 = performance.now();
    while (performance.now() - t0 < 650) {
      sc.scrollTop = (sc.scrollTop + 80) % Math.max(1, sc.scrollHeight - sc.clientHeight);
      sc.dispatchEvent(new Event("scroll"));
      out.push({ t: Math.round(performance.now() - t0), f: getComputedStyle(c).filter, on: f.classList.contains("think") });
      await new Promise(r => setTimeout(r, 40));
    }
    return out;
  });
  const bad = rows.filter(r => mid(r.f));
  assert.deepEqual(bad.map(r => r.f), [], "no sample wears the `_m` filter while thinking");
  assert.ok(rows.every(r => r.on), "the light stays on through the scroll");
  const seen = ids(rows);
  assert.ok(seen.length >= 4, `the light orbits while scrolling (${seen.length} ids over 600 ms: ${seen.join(", ")})`);
});

await step("paused rAF (iOS/WebKit scroll): the light still changes (a timer clock, not rAF)", async () => {
  await page.waitForFunction(() => { const m = /_(\d+)"?\)$/.exec(getComputedStyle(document.querySelector("#cluck .ask.ag > .g-copy")).filter); return !!m && +m[1] >= 50; }, null, { timeout: 12000 });
  const out = await page.evaluate(async () => {
    const sc = document.querySelector("#cluck .cl-bd"), f = document.querySelector("#cluck .ask.ag"), c = f.querySelector(":scope > .g-copy");
    const raf = window.requestAnimationFrame.bind(window);
    let blocked = 0;
    window.requestAnimationFrame = () => { blocked++; return 0; };                  // the engine stops rAF until the scroll ends
    const rows = [], t0 = performance.now();
    try {
      while (performance.now() - t0 < 650) {
        sc.scrollTop = (sc.scrollTop + 80) % Math.max(1, sc.scrollHeight - sc.clientHeight);
        sc.dispatchEvent(new Event("scroll"));
        rows.push({ t: Math.round(performance.now() - t0), f: getComputedStyle(c).filter, on: f.classList.contains("think") });
        await new Promise(r => setTimeout(r, 40));
      }
    } finally { window.requestAnimationFrame = raf; }
    return { rows, blocked };
  });
  assert.ok(out.blocked > 0, "requestAnimationFrame was really blocked");
  assert.ok(out.rows.every(r => r.on), "the light stays on through the paused scroll");
  assert.deepEqual(out.rows.filter(r => mid(r.f)).map(r => r.f), [], "never the `_m` filter");
  const seen = ids(out.rows);
  assert.ok(seen.length >= 4, `the light keeps moving without rAF (${seen.length} ids: ${seen.join(", ")})`);
});

await step("no page errors", async () => assert.deepEqual(page.errs, []));

await browser.close();
srv.kill(); stub.close();
console.log(failures ? `\n${failures} FAILED` : "\nall ok");
process.exit(failures ? 1 : 0);
