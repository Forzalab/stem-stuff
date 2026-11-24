// BUG-SEND-MORPH-SNAP (Tony, live, verbatim): "iMessage animation .... uhhh.... flies the letter up but the bubble is still
// underneath, for liek half a sec, then the text snaps back into place lol."
// The v7 glass Ask bar's send morph (ask-glass.js §flip) must fly the WHOLE student bubble: one fixed clone from the typed
// text box to the new .msg.me pill, with the real pill hidden until it lands. Frames are sampled every rAF; checks:
//   flight  the clone exists for a real stretch (~420 ms), not one frame
//   hidden  while the clone flies the real student bubble is not visible underneath (visibility hidden / opacity 0)
//   fill    the clone at its last painted frame wears the bubble's own fill (not bare letters)
//   land    that last clone rect == the bubble's rect (+-1px)
//   rest    after the clone is removed the bubble is visible again and its text has not moved (+-1px)
// 1280x800, own serve.py + a fixture bank; /explain and /chat are stubbed in the page. The reply types client-side
// (wishType, 35 cps), so the thread keeps growing under the morph the way it does live.
// The bubble is read from the REAL pane (#clTabEP): the glass bar keeps a cloned copy of the reply (.g-copy), ids stripped.
//   node tests/send-morph.pw.mjs <port>
import { launchBrowser } from "./pw-browser.mjs";
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { serverUp } from "./lib/boot.mjs";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { try { pw = require("/opt/node22/lib/node_modules/playwright"); } catch { pw = require("/opt/node-tools/node_modules/playwright"); } }

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = /^\d+$/.test(process.argv[2] || "") ? process.argv[2] : "8896", BASE = `http://127.0.0.1:${PORT}`;
const TMP = mkdtempSync(join(tmpdir(), "sendmorph-")), BANKS = join(TMP, "banks");
mkdirSync(BANKS);
const txt = md => [{ type: "text", md }];
writeFileSync(join(BANKS, "BANK_SMR.json"), JSON.stringify({ v: 1, problems: [{
  code: "CALC1_SM1", title: "Send morph", type: "num", answer: "42", body: txt("How many students are in the lab? Say it as a number."),
  saccharine: { title: "Send morph", key: "Tick: 42" } }] }));
const srv = spawn("python3", [join(ROOT, "server", "http_server", "serve.py"), PORT], { env: { ...process.env, STEM_TODAY: "2026-10-23", STEM_BANKS: BANKS,
  STEM_TRIES: join(TMP, "tries.json"), OPENROUTER_API_KEY: "", CLAUDE_API: "" }, stdio: "ignore" });
const kill = () => { try { srv.kill(); } catch { /* */ } };
process.on("exit", kill); process.on("SIGINT", () => { kill(); process.exit(130); }); process.on("SIGTERM", () => { kill(); process.exit(143); });
await serverUp(BASE);

let fails = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); }
  catch (e) { fails++; console.log("FAIL", name, "\n     ", String(e.message).slice(0, 1200)); }
}
const browser = await launchBrowser(pw, { args: ["--no-sandbox"], motion: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: "block", reducedMotion: "no-preference" });
await ctx.addInitScript(() => { try { localStorage.setItem("stem-ob", "done"); localStorage.setItem("stem-ui", "v7"); localStorage.setItem("stem-voice", "off"); } catch { /* */ } });
const page = await ctx.newPage(); page.errs = []; page.chats = [];
page.on("pageerror", e => page.errs.push(String(e)));
await page.route("**/explain", r => r.fulfill({ status: 200, contentType: "text/plain; charset=utf-8", body: "POOF! A short canned reply.\n" }));
await page.route("**/chat", r => { page.chats.push(JSON.parse(r.request().postData() || "{}")); r.fulfill({ status: 200, contentType: "text/plain; charset=utf-8",
  body: "Because six times seven is forty-two, and the mass cancels on both sides of the equation so the car still turns around the bend.\n" }); });
await page.goto(BASE + "/?ui=v7#BANK_SMR");
await page.waitForFunction(() => !document.getElementById("splash") && !!window.stemBank && !!window.__drill, null, { timeout: 15000 });
await page.waitForFunction(() => document.querySelector("#pcode")?.textContent === "CALC1_SM1", null, { timeout: 8000 });
/* a graded wrong try: the bar unlocks (ask-glass setLocked) */
await page.click("#ans"); await page.keyboard.type("7"); await page.keyboard.press("Enter");
await page.waitForFunction(() => window.__drill.state.tries.length > 0, null, { timeout: 10000 });
const TA = "#cluck .ask.ag textarea", BUB = "#clTabEP > .cl-thread > .msg.me";
await page.waitForFunction(sel => { const f = document.querySelector("#cluck .ask.ag"), t = document.querySelector(sel);
  return !!f && !!t && !t.disabled && !f.classList.contains("locked") && !f.classList.contains("opening") && !f.classList.contains("sweep"); }, TA, { timeout: 12000 });
/* the explain reply types out first (wishTyped gates the next ask) */
await page.waitForFunction(() => { const w = document.querySelector("#cluck .wtext"); return !!w && /POOF/.test(w.textContent || "") && !w.classList.contains("wrun"); }, null, { timeout: 10000 });

/* sample frames from before the submit until well after the clone is gone (rAF only, no waits) */
const flightP = page.evaluate(`new Promise(res => {
  const R = el => { if (!el) return null; const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height }; };
  const T = el => { if (!el || !el.firstChild) return null; const g = document.createRange(); g.selectNodeContents(el); const r = g.getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height }; };
  const frames = [], t0 = performance.now();
  const tick = () => {
    const fly = document.querySelector('body > .ag-fly');
    const me = document.querySelector('#clTabEP > .cl-thread > .msg.me');
    const mc = me && getComputedStyle(me), fc = fly && getComputedStyle(fly);
    frames.push({ t: Math.round(performance.now() - t0), fly: !!fly, flyR: R(fly), me: R(me), md: R(me && me.querySelector('.md')),
      vis: mc ? mc.visibility : '', op: mc ? +mc.opacity : 1, mbg: mc ? mc.backgroundColor : '', bg: fc ? fc.backgroundColor : '', ftx: T(fly), mtx: T(me && me.querySelector('.md')) });
    if (performance.now() - t0 < 2000) requestAnimationFrame(tick); else res(frames);
  };
  requestAnimationFrame(tick);
})`);
await page.fill(TA, "why does the mass cancel?");
await page.press(TA, "Enter");
const frames = await flightP;

const flyF = frames.filter(f => f.fly);
const i0 = frames.findIndex(f => f.fly);
const i1 = frames.length - 1 - [...frames].reverse().findIndex(f => f.fly);
const last = i1 >= 0 ? frames[i1] : null;
const next = i1 >= 0 ? frames.slice(i1 + 1).find(f => !f.fly) : null;
const rect = r => r ? [r.l.toFixed(1), r.t.toFixed(1), r.w.toFixed(1), r.h.toFixed(1)] : null;
const meRect = f => f && f.me ? rect(f.me) : null;
const near = (a, b, e = 1) => !!a && !!b && Math.abs(a.l - b.l) <= e && Math.abs(a.t - b.t) <= e && Math.abs(a.w - b.w) <= e && Math.abs(a.h - b.h) <= e;
const rgb = s => { const m = /rgba?\(([^)]+)\)/.exec(s || ""); return m ? m[1].split(",").map(x => parseFloat(x)) : null; };
const sameFill = (a, b) => { const x = rgb(a), y = rgb(b); return !!x && !!y && (x[3] ?? 1) > 0.9 && Math.abs((x[3] ?? 1) - (y[3] ?? 1)) < .05
  && x.slice(0, 3).every((v, i) => Math.abs(v - y[i]) <= 4); };

await step("flight: the send morph really runs for ~420 ms", async () => {
  assert.ok(i0 >= 0 && last, "no .ag-fly clone was ever seen (chat posted: " + page.chats.length + ")");
  assert.ok(flyF.length >= 5, `only ${flyF.length} clone frames (${flyF.map(f => f.t).join(",")})`);
  assert.ok(last.t - frames[i0].t >= 250, `the clone lived ${last.t - frames[i0].t} ms (${frames[i0].t} -> ${last.t})`);
});

await step("hidden: the real student bubble is not visible under the flying clone", async () => {
  const shown = flyF.filter(f => !(f.vis === "hidden" || f.op === 0));
  assert.deepEqual(shown.slice(0, 3).map(f => ({ t: f.t, vis: f.vis, op: f.op, me: meRect(f) })), [],
    `the real bubble stayed visible during the flight (${shown.length}/${flyF.length} frames)`);
});

await step("fill: the clone wears the bubble's own fill at its last painted frame", async () => {
  assert.ok(last && last.bg, "the last clone frame has no background");
  assert.ok(sameFill(last.bg, last.mbg), `clone fill ${last.bg} != bubble fill ${last.mbg}`);
});

await step("land: the clone's last painted rect == the bubble's rect (+-1px)", async () => {
  assert.ok(near(last.flyR, last.me), `clone ${rect(last.flyR)} vs bubble ${meRect(last)}`);
});

await step("text: the clone's letters land on the bubble's letters (+-1px), no snap into the pill", async () => {
  assert.ok(last && last.ftx && last.mtx, "no text rect in the last clone frame");
  assert.ok(near(last.ftx, last.mtx), `clone text ${rect(last.ftx)} vs bubble text ${rect(last.mtx)}`);
});

await step("rest: after the clone is removed the bubble shows again and its text does not move", async () => {
  assert.ok(next, "no frame after the clone was removed");
  assert.notEqual(next.vis, "hidden", "the bubble is still hidden after the clone is gone");
  assert.ok(next.op > 0, "the bubble is still transparent after the clone is gone");
  assert.ok(near(next.me, last.me), `bubble jumped on landing: ${meRect(last)} -> ${meRect(next)}`);
  assert.ok(near(next.md, last.md), `bubble text jumped on landing: ${rect(last.md)} -> ${rect(next.md)}`);
});

await step("no page errors", async () => assert.deepEqual(page.errs, []));

await browser.close(); srv.kill();
console.log(fails ? `\n${fails} FAILED` : "\nall ok");
process.exit(fails ? 1 : 0);
