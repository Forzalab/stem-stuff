// Drag lag (user, on a phone): dragging Cluck's phone sheet UP was laggy, DOWN was smooth. Cause: paint() set --cl-top every frame above
// the dock, so the sheet's inset top changed and the browser laid the whole sheet out per frame. The fix lays the sheet out once at full
// height and moves it with transform only; --cl-top is written at settle only. This spec (390x844) checks:
// --cl-top never changes during a drag, the footer stays on the screen bottom mid-drag, a release up ends at full (top 0), and a small
// pull down then release ends at the same top as before the drag. Own serve.py + a stub OpenRouter, like cluck-more.
//   node tests/cluck-drag.pw.mjs <port> [shots dir]
import { createRequire } from "node:module";
import { createServer } from "node:http";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { writeFileSync, mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { try { pw = require("/opt/node22/lib/node_modules/playwright"); } catch { pw = require("/opt/node-tools/node_modules/playwright"); } }

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = /^\d+$/.test(process.argv[2] || "") ? process.argv[2] : "8880", BASE = `http://127.0.0.1:${PORT}`;
const tmp = mkdtempSync(join(tmpdir(), "cdrag-")), banks = join(tmp, "banks"), SHOTS = process.argv[3] || tmp;
mkdirSync(banks); mkdirSync(SHOTS, { recursive: true });
const txt = md => [{ type: "text", md }];
const PROBS = [1, 2].map(n => ({ code: `CALC1_CDR${n}`, title: `Drag ${n}`, type: "mc", shuffle: false, body: txt(`A car rounds a flat curve (${n}). Pick one.`), correct: "a",
  choices: ["one", "two", "three", "four"].map((md, i) => ({ id: "abcd"[i], md })), saccharine: { title: `Drag ${n}`, key: "Tick: a", slip: { b: "Two is not one." } } }));
writeFileSync(join(banks, "BANK_CDRAG.json"), JSON.stringify({ v: 1, problems: PROBS }));
const REPLY = ["POOF! A wish is a wish.\n", "Tick: a. Egg-cellent."];
const stub = createServer(async (req, res) => {
  let body = ""; for await (const c of req) body += c;
  if (!JSON.parse(body).stream) { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ choices: [{ message: { content: '{"verdict": "on"}' } }] })); return; }
  res.writeHead(200, { "Content-Type": "text/event-stream" });
  let i = 0;
  const t = setInterval(() => {
    if (i < REPLY.length) res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: REPLY[i++] } }] })}\n\n`);
    else { res.end("data: [DONE]\n\n"); clearInterval(t); }
  }, 60);
});
await new Promise(r => stub.listen(0, "127.0.0.1", r));
const srv = spawn("python3", [join(ROOT, "server", "http_server", "serve.py"), PORT], { env: { ...process.env, STEM_TODAY: "2026-10-30", STEM_BANKS: banks, STEM_TRIES: join(tmp, "tries.json"),   // a pre-sunset date: the v:1 fixture bank loads (serve.py bank_notice)
  OPENROUTER_BASE: `http://127.0.0.1:${stub.address().port}`, OPENROUTER_API_KEY: "sk-test", CLAUDE_API: "" }, stdio: "ignore" });
for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + "/")).ok) break; } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 100)); }

let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); }
  catch (e) { failures++; console.log("FAIL", name, "\n     ", String(e.message).slice(0, 900)); }
}
const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
const VP = { width: 390, height: 844 };

/* a wrong pick streams Cluck's reply; the idle duck's tap opens the phone sheet on it (as cluck-more) */
async function openSheet() {
  const ctx = await browser.newContext({ viewport: VP, hasTouch: true, isMobile: true, serviceWorkers: "block" });
  await ctx.addInitScript(() => { try { localStorage.setItem("stem-ob", "done"); for (const b of ["right", "miss", "three"]) localStorage.setItem("stem-ob-rw-" + b, "9"); } catch { /* */ } });
  await ctx.route(/youtube|ytimg|googlevideo/, r => r.abort());
  const page = await ctx.newPage();
  page.errs = []; page.on("pageerror", e => page.errs.push(String(e)));
  await page.goto(BASE + "/#BANK_CDRAG");
  await page.waitForFunction(() => !document.getElementById("splash") && !!(window.stemBank && window.stemBank.code) && /^#CALC1_/.test(location.hash) && !document.getElementById("freeze").hidden, null, { timeout: 10000 });
  const n = await page.evaluate(() => window.__drill.state.tries.length);
  await page.click('.opt[data-id="b"]'); await page.click('.ch[data-id="b"] .send');
  await page.waitForFunction(n => window.__drill.state.tries.length > n, n, { timeout: 5000 });
  await page.waitForFunction(() => /Egg-cellent/.test(localStorage.getItem("stem-cluck") || ""), null, { timeout: 10000, polling: 100 });
  await page.evaluate(() => window.stemIdleTap());
  await page.waitForFunction(() => window.stemCluckOpen(), null, { timeout: 4000 });
  await page.waitForFunction(() => document.getElementById("cluck").dataset.state === "peek", null, { timeout: 4000 });   // the rise has settled
  await page.waitForTimeout(400);
  return page;
}
/* the sheet's numbers at rest or during a drag */
const geo = page => page.evaluate(() => {
  const el = document.getElementById("cluck"), r = el.getBoundingClientRect(), f = el.querySelector(".cl-ft").getBoundingClientRect();
  return { top: Math.round(r.top * 10) / 10, clTop: el.style.getPropertyValue("--cl-top"), state: el.dataset.state || "", ftBottom: Math.round(f.bottom * 10) / 10, innerH: innerHeight };
});
/* every write to the sheet's style attribute, with the --cl-top it held before (MutationObserver oldValue) */
const watchTop = page => page.evaluate(() => {
  const el = document.getElementById("cluck"), re = /--cl-top:\s*([^;]+)/; window.__ct = [];
  const seen = s => { const m = re.exec(s || ""); return m ? m[1].trim() : ""; };
  new MutationObserver(recs => { for (const r of recs) window.__ct.push(seen(r.oldValue)); }).observe(el, { attributes: true, attributeOldValue: true, attributeFilter: ["style"] });
});
/* a mouse drag from the header (dy < 0 = up), in steps; the mid-drag reads run before the release */
async function drag(page, dy) {
  const b = await page.locator("#cluck .cl-bar").boundingBox();
  const x = b.x + b.width / 2, y = b.y + b.height / 2;
  await page.mouse.move(x, y); await page.mouse.down();
  await page.mouse.move(x, y + dy / 2, { steps: 6 }); await page.mouse.move(x, y + dy, { steps: 12 });
  await page.waitForTimeout(60);
  const during = await geo(page);
  const n = await page.evaluate(() => window.__ct.length);
  await page.mouse.up();
  const ctDuring = await page.evaluate(n => window.__ct.slice(0, n), n);
  return { during, ctDuring };
}
const settled = page => page.waitForFunction(() => { const s = document.getElementById("cluck").dataset.state; return s === "full" || s === "peek"; }, null, { timeout: 4000 });

await step("drag up across the dock: --cl-top holds during the drag, footer stays on the screen bottom, release up ends at full", async () => {
  const page = await openSheet();
  const before = await geo(page);
  assert.equal(before.state, "peek", "docked at rest: " + JSON.stringify(before));
  await watchTop(page);
  const { ctDuring, during } = await drag(page, -420);
  assert.ok(ctDuring.length > 0, "the drag wrote the sheet's style");
  assert.deepEqual(ctDuring.filter(v => v !== before.clTop), [], `--cl-top changed during the drag (dock ${before.clTop}): ${JSON.stringify([...new Set(ctDuring)])}`);
  assert.ok(Math.abs(during.ftBottom - during.innerH) < 1.5, `the footer stays on the screen bottom mid-drag: ${JSON.stringify(during)}`);
  assert.ok(during.top < before.top - 100, `the sheet grew up mid-drag: ${before.top} -> ${during.top}`);
  await settled(page);
  const after = await geo(page);
  console.log("     up-release:", JSON.stringify({ dockTop: before.top, endTop: after.top, clTop: after.clTop, state: after.state }));
  assert.equal(after.state, "full", "released up: full");
  assert.equal(after.top, 0, "full: the sheet's top edge is 0");
  assert.equal(after.clTop, "0px", "--cl-top set at settle: " + after.clTop);
  assert.ok(Math.abs(after.ftBottom - after.innerH) < 1.5, "the footer sits on the bottom at full: " + JSON.stringify(after));
  assert.deepEqual(page.errs, [], "no page errors");
  await page.screenshot({ path: join(SHOTS, "drag-up-full-390.png") });
  await page.context().close();
});

await step("UIP6: a tap on the grab (no momentum) springs back to the dock with no overshoot (critical damping)", async () => {
  const page = await openSheet();
  const dock = (await geo(page)).top;
  await page.click("#cluck .cl-grab"); await settled(page);
  assert.equal((await geo(page)).state, "full", "tap: full");
  await page.evaluate(() => { window.__tops = []; const el = document.getElementById("cluck"); (function f() { window.__tops.push(el.getBoundingClientRect().top); if (window.__tops.length < 120) requestAnimationFrame(f); })(); });
  await page.click("#cluck .cl-grab"); await settled(page); await page.waitForTimeout(300);
  const max = Math.max(...await page.evaluate(() => window.__tops));
  console.log("     tap-back:", JSON.stringify({ dock, max }));
  assert.equal((await geo(page)).state, "peek", "second tap: peek");
  assert.ok(max <= dock + 0.05, `no overshoot past the dock: max top ${max} vs dock ${dock}`);
  assert.deepEqual(page.errs, [], "no page errors");
  await page.context().close();
});

await step("a small pull down, then release: --cl-top holds, the sheet ends at the same docked top as before the drag", async () => {
  const page = await openSheet();
  const before = await geo(page);
  await watchTop(page);
  const { ctDuring } = await drag(page, 30);
  assert.deepEqual(ctDuring.filter(v => v !== before.clTop), [], "--cl-top unchanged during the pull down: " + JSON.stringify([...new Set(ctDuring)]));
  await settled(page);
  const after = await geo(page);
  console.log("     down-release:", JSON.stringify({ dockTop: before.top, endTop: after.top, clTop: after.clTop, state: after.state }));
  assert.equal(after.state, "peek", "released back: docked");
  assert.equal(after.top, before.top, "ends at the same top as before the drag");
  assert.equal(after.clTop, before.clTop, "the same --cl-top as before");
  assert.deepEqual(page.errs, [], "no page errors");
  await page.context().close();
});

await browser.close(); srv.kill(); stub.close();
console.log(failures ? `${failures} FAIL` : "all ok", "· shots:", SHOTS);
process.exit(failures ? 1 : 0);
