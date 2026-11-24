// SHEET-LAG smoke (CLUCK-SHEET-LAG): dragging Cluck's phone sheet was laggy (390x844 touch, html.ui-v7). Three measured causes, three deterministic counters (no timing asserts):
//   a  innerHeight is read once per drag (begin), not per pointermove: every read right after a style write forces a full style recalc of the sheet
//   b  --rr / --pp (inherited custom properties) are written only when their value changed: an equal rewrite restyles the whole subtree
//   c  the ask bar's copy of the reply (cloneNode(true) of .cl-bd) is NOT rebuilt at drag release when the reply did not change, and IS rebuilt when the reply text or the size changes
//   d  sanity: the sheet settles to the expected snap state, the copy is shown again and scroll-synced
// Own serve.py + a throwaway bank; /explain is stubbed in the page (no LLM).   node tests/sheet-lag.smoke.mjs [port]
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { launchBrowser } from "./pw-browser.mjs";
import { serverUp } from "./lib/boot.mjs";
import { settled } from "./lib/wait.mjs";
const require = createRequire(import.meta.url);
let pw; try { pw = require("playwright"); } catch { try { pw = require("/opt/node22/lib/node_modules/playwright"); } catch { pw = require("/opt/node-tools/node_modules/playwright"); } }

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = /^\d+$/.test(process.argv[2] || "") ? process.argv[2] : "8891", BASE = `http://127.0.0.1:${PORT}`;
const TMP = mkdtempSync(join(tmpdir(), "sheetlag-")), BANKS = join(TMP, "banks");
mkdirSync(BANKS);
writeFileSync(join(BANKS, "BANK_SHL.json"), JSON.stringify({ v: 1, problems: [{ code: "CALC1_SHL1", title: "SHL 1", type: "num", answer: "42", body: [{ type: "text", md: "How many students are in the lab? Say it as a number." }],
  saccharine: { title: "SHL 1", key: "Tick: 42" } }] }));
const srv = spawn("python3", [join(ROOT, "server", "http_server", "serve.py"), PORT], { env: { ...process.env, STEM_TODAY: "2026-10-23", STEM_BANKS: BANKS, STEM_TRIES: join(TMP, "tries.json"),
  OPENROUTER_API_KEY: "", CLAUDE_API: "" }, stdio: "ignore" });
await serverUp(BASE);

let fails = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); }
  catch (e) { fails++; console.log("FAIL", name, "\n     ", String(e.message).slice(0, 900)); }
}
const browser = await launchBrowser(pw, { args: ["--no-sandbox"], motion: true });

async function openSheet() {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, serviceWorkers: "block", reducedMotion: "no-preference" });
  await ctx.addInitScript(() => { try { localStorage.setItem("stem-ob", "done"); localStorage.setItem("stem-voice", "off"); } catch { /* */ } });
  await ctx.route(/youtube|ytimg|googlevideo/, r => r.abort());
  const page = await ctx.newPage(); page.errs = [];
  page.on("pageerror", e => page.errs.push(String(e)));
  await page.route("**/explain", r => r.fulfill({ status: 200, contentType: "text/plain; charset=utf-8", body: "POOF! A short canned reply.\n" }));
  await page.goto(`${BASE}/?ui=v7#BANK_SHL`);
  await page.waitForFunction(() => !document.getElementById("splash") && !!(window.stemBank && window.stemBank.code) && !document.getElementById("freeze").hidden, null, { timeout: 15000 });
  await page.waitForFunction(() => document.querySelector("#pcode")?.textContent === "CALC1_SHL1", null, { timeout: 8000 });
  await settled(page);
  await page.click("#ans"); await page.keyboard.type("7"); await page.keyboard.press("Enter");
  await page.waitForFunction(() => window.__drill.state.tries.length > 0, null, { timeout: 10000 });
  await page.evaluate(() => window.stemClOpen("explain", null));
  await page.waitForFunction(() => document.getElementById("cluck").dataset.state === "peek", null, { timeout: 6000 });   // the rise has settled
  await page.waitForFunction(() => !!document.querySelector("#cluck .cl-fi .ask .g-copy .ag-clone"), null, { timeout: 8000 });   // the glass bar has its copy
  await settled(page, "#cluck");
  return page;
}
/* the counters, all in the page */
const instrument = page => page.evaluate(() => {
  const W = window.__sl = { ih: 0, own: 0, props: [], clones: 0 };
  const d = Object.getOwnPropertyDescriptor(window, "innerHeight");
  Object.defineProperty(window, "innerHeight", { configurable: true, enumerable: true, get() { W.ih++; if (/cluck\/cluck\.js/.test(new Error().stack.split("\n")[2] || "")) W.own++; return d.get.call(window); } });
  const sp = CSSStyleDeclaration.prototype.setProperty, cl = document.getElementById("cluck");
  CSSStyleDeclaration.prototype.setProperty = function (k, v, ...r) { if (this === cl.style && (k === "--rr" || k === "--pp")) W.props.push([k, String(v)]); return sp.call(this, k, v, ...r); };
  const cn = Node.prototype.cloneNode;
  Node.prototype.cloneNode = function (deep, ...r) { if (deep && this.classList && this.classList.contains("cl-bd")) W.clones++; return cn.call(this, deep, ...r); };
});
const geo = page => page.evaluate(() => { const el = document.getElementById("cluck"); return { top: Math.round(el.getBoundingClientRect().top * 10) / 10, state: el.dataset.state || "", clTop: el.style.getPropertyValue("--cl-top") }; });
const ticks = (page, ms = 300) => page.evaluate(ms => new Promise(r => setTimeout(r, ms)), ms);   // the copy's rebuild timer is 40 ms: let it run, then count

await step("sheet drag: innerHeight once, no equal --rr/--pp rewrite, no copy rebuild at release; a changed reply or size still rebuilds; copy back + synced", async () => {
  const page = await openSheet();
  await page.evaluate(() => { const H = document.documentElement; setInterval(() => H.classList.remove("fx-dim"), 20); H.classList.remove("fx-dim"); });   // headless reads as the low tier (fx.js latches fx-dim, the copy is display:none): keep it off so the copy is visible and its return can be checked
  await page.waitForFunction(() => document.querySelector("#cluck .g-copy").offsetWidth > 0, null, { timeout: 3000 });
  const before = await geo(page);
  await instrument(page);
  const b = await page.locator("#cluck .cl-bar").boundingBox();
  const x = b.x + b.width / 2, y = b.y + b.height / 2;
  await page.mouse.move(x, y); await page.mouse.down();
  await page.evaluate(() => { window.__sl.ih = 0; window.__sl.own = 0; window.__sl.props = []; });   // count from the press: the 60 moves below
  for (let i = 1; i <= 30; i++) await page.mouse.move(x, y + i);          // down 30 px (below the dock: radius and progress stay put)
  for (let i = 29; i >= 0; i--) await page.mouse.move(x, y + i);          // and back to where it started
  const dur = await page.evaluate(() => ({ ih: window.__sl.ih, own: window.__sl.own, props: window.__sl.props.slice() }));
  await page.evaluate(() => { window.__sl.clones = 0; });
  await page.mouse.up();
  await page.waitForFunction(() => { const s = document.getElementById("cluck").dataset.state; return s === "full" || s === "peek"; }, null, { timeout: 5000 });
  await settled(page, "#cluck"); await ticks(page);
  const clonesAfter = await page.evaluate(() => window.__sl.clones);
  const bad = [], ok = (c, m) => { if (!c) bad.push(m); };   // every counter is reported, not only the first to fail
  // a
  ok(dur.own <= 3, `cluck.js read innerHeight ${dur.own}x during a 60-move drag (want <= 3)`);
  ok(dur.ih <= 10, `innerHeight read ${dur.ih}x in all during a 60-move drag (shell.js layoutFreeze reads it per state change, a small constant; want < 60)`);
  // b
  for (const k of ["--rr", "--pp"]) {
    const w = dur.props.filter(p => p[0] === k).map(p => p[1]);
    ok(w.length >= 1, k + " is written at least once");
    ok(w.every((v, i) => i === 0 || v !== w[i - 1]), `${k} rewritten with an equal value: ${JSON.stringify(w.slice(0, 8))} (${w.length} writes)`);
    ok(w.length <= new Set(w).size, `${k}: ${w.length} writes for ${new Set(w).size} distinct values`);
  }
  // c: no rebuild at release
  ok(clonesAfter === 0, `the reply was cloned ${clonesAfter}x from release to settled, nothing in it changed`);
  // d
  const after = await geo(page);
  assert.deepEqual(bad, [], "counters:\n      " + bad.join("\n      "));
  assert.equal(after.state, "peek", "released where it started: docked");
  assert.equal(after.top, before.top, "same docked top as before the drag");
  const cp = await page.evaluate(() => {
    const f = document.querySelector("#cluck .cl-fi .ask"), c = f.querySelector(".g-copy .ag-clone"), sc = document.querySelector("#cluck .cl-bd");
    return { has: !!c, shown: !!c && c.offsetWidth > 0 && getComputedStyle(f.querySelector(".g-copy")).display !== "none", tf: c && c.style.transform, st: sc.scrollTop, frost: f.classList.contains("ag-frost") };
  });
  assert.ok(cp.has && cp.shown, "the copy is shown again after the drag: " + JSON.stringify(cp));
  assert.equal(cp.tf, `translate3d(0px, ${-cp.st}px, 0px)`, "the copy is scroll-synced: " + JSON.stringify(cp));
  // c: a restyle that changes the reply's scrollHeight (child padding here) with NO DOM mutation, then the .cl state flips: the copy rebuilds
  const sh = await page.evaluate(async () => {
    const sc = document.querySelector("#cluck .cl-bd"), cl = document.getElementById("cluck"), h0 = sc.scrollHeight;
    window.__sl.clones = 0; for (const c of sc.children) c.style.paddingBottom = "900px";
    const h1 = sc.scrollHeight; cl.dataset.state = "moving"; await new Promise(r => setTimeout(r, 0)); cl.dataset.state = "peek";
    return { h0, h1 };
  });
  assert.notEqual(sh.h0, sh.h1, "the restyle must change scrollHeight: " + JSON.stringify(sh));
  await page.waitForFunction(() => window.__sl.clones >= 1, null, { timeout: 3000 }).catch(() => { throw new Error("a reflow without a DOM mutation did not rebuild the copy"); });
  await page.evaluate(() => { [...document.querySelector("#cluck .cl-bd").children].forEach(c => { c.style.paddingBottom = ""; }); });
  await ticks(page);
  // c: a changed reply rebuilds
  await page.evaluate(() => { window.__sl.clones = 0; const sc = document.querySelector("#cluck .cl-bd"); const p = document.createElement("p"); p.textContent = "A new line in the reply."; sc.appendChild(p); });
  await page.waitForFunction(() => window.__sl.clones >= 1, null, { timeout: 3000 }).catch(() => { throw new Error("a changed reply did not rebuild the copy"); });
  // c: a changed size rebuilds
  await ticks(page); await page.evaluate(() => { window.__sl.clones = 0; });
  await page.setViewportSize({ width: 360, height: 800 });
  await page.waitForFunction(() => window.__sl.clones >= 1, null, { timeout: 3000 }).catch(() => { throw new Error("a resize did not rebuild the copy"); });
  assert.deepEqual(page.errs, [], "no page errors");
  await page.context().close();
});

await step("sheet drag up to full: settles at full, the copy is rebuilt for the new box (it sits elsewhere in the bar)", async () => {
  const page = await openSheet();
  await instrument(page);
  const b = await page.locator("#cluck .cl-bar").boundingBox();
  const x = b.x + b.width / 2, y = b.y + b.height / 2;
  await page.mouse.move(x, y); await page.mouse.down();
  for (let i = 1; i <= 40; i++) await page.mouse.move(x, y - i * 8);
  await page.evaluate(() => { window.__sl.clones = 0; });
  await page.mouse.up();
  await page.waitForFunction(() => document.getElementById("cluck").dataset.state === "full", null, { timeout: 5000 });
  await settled(page, "#cluck"); await ticks(page);
  const r = await page.evaluate(() => {
    const f = document.querySelector("#cluck .cl-fi .ask"), c = f.querySelector(".g-copy .ag-clone"), sc = document.querySelector("#cluck .cl-bd");
    const fr = f.getBoundingClientRect(), br = sc.getBoundingClientRect();
    return { top: document.getElementById("cluck").getBoundingClientRect().top, clones: window.__sl.clones, left: c.style.left, top2: c.style.top, wantLeft: (br.left - fr.left) + "px", wantTop: (br.top - fr.top) + "px" };
  });
  assert.equal(r.top, 0, "full: top edge 0");
  assert.ok(r.clones >= 1, "the box moved (peek -> full): the copy was rebuilt for it");
  assert.equal(r.left, r.wantLeft, "copy left follows the scroller: " + JSON.stringify(r));
  assert.equal(r.top2, r.wantTop, "copy top follows the scroller: " + JSON.stringify(r));
  assert.deepEqual(page.errs, [], "no page errors");
  await page.context().close();
});

await browser.close(); srv.kill();
console.log(fails ? `${fails} FAIL` : "all ok");
process.exit(fails ? 1 : 0);
