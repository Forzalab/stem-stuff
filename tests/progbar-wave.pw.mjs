// PROGBAR P7 wave smoke (brain ui-polish/wave/P7-SPEC.md): the streak notches spring-wave on land, behind html.ui-v7. Flag ON: transform dips below 0.75,
// never above 1, clears after the wave; reduced motion and flag OFF: never a transform. Smoke size, feature-local. Own serve.py, throwaway bank.
//   node tests/progbar-wave.pw.mjs [port]
import { launchBrowser } from "./pw-browser.mjs";
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { serverUp } from "./lib/boot.mjs";   // CI-ARCH B3: a dead serve.py fails at once, with its URL
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { pw = require("/opt/node22/lib/node_modules/playwright"); }
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = +(process.argv[2] || 8889), BASE = `http://localhost:${PORT}`;
const TMP = mkdtempSync(join(tmpdir(), "pbwave-")), BANKS = join(TMP, "banks");
const ch = (...m) => m.map((md, i) => ({ id: "abcde"[i], md }));
const sac = n => ({ title: `Practice Exam 2, Question ${n}`, key: "Use: a\nAnswer: a", slip: { b: "b slip" } });
const real = (code, n) => ({ code, type: "mc", shuffle: false, body: [{ type: "text", md: `Real ${n}: pick a.` }], choices: ch("one", "two", "three", "four", "five"),
  correct: "a", wrong: [{ choice: "b", hint: "QUACK. Not b." }, { choice: "c", hint: "QUACK. Not c." }], saccharine: sac(n) });
const multi = code => ({ code, type: "multi", body: [{ type: "text", md: "Two parts." }], saccharine: sac(9),
  parts: [{ type: "num", answer: "1", prompt: "one" }, { type: "num", answer: "2", prompt: "two" }] });
mkdirSync(BANKS);
writeFileSync(join(BANKS, "BANK_PB1.json"), JSON.stringify({ v: 1, problems: [1, 2, 3, 4, 5].map(n => real("CALC1_P0" + n, n)).concat([multi("CALC1_PM1")]) }));
const srv = spawn("python3", [join(ROOT, "server", "http_server", "serve.py"), String(PORT)], { env: { ...process.env, STEM_BANKS: BANKS, STEM_TODAY: "2026-10-23", STEM_TRIES: join(TMP, "tries.json"), OPENROUTER_API_KEY: "" }, stdio: "ignore" });
await serverUp(BASE);

let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); }
  catch (e) { failures++; console.log("FAIL", name, "\n     ", String(e.message).slice(0, 700)); }
}
const go = async (page, code) => { await page.evaluate(c => { location.hash = c; }, code); await page.waitForFunction(c => document.querySelector("#pcode")?.textContent === c && !document.querySelector("#freeze").hidden, code, { timeout: 8000 }); };
async function pick(page, id) {
  const n = await page.evaluate(() => window.__drill.state.tries.length);
  await page.click(`#q .opt[data-id="${id}"]`); await page.click(`#q .ch[data-id="${id}"] .send`);
  await page.waitForFunction(k => window.__drill.state.tries.length > k, n, { timeout: 6000 });
}
async function typePart(page, i, v) {
  const n = await page.evaluate(() => window.__drill.state.tries.length);
  await page.fill(`#q .part[data-i="${i}"] .ans`, v); await page.press(`#q .part[data-i="${i}"] .ans`, "Enter");
  await page.waitForFunction(k => window.__drill.state.tries.length > k, n, { timeout: 6000 });
}
/* a fresh context on the bank; flag = "on" stores stem-ui=v7 (fx.js then sets html.ui-v7 before first paint), "off" leaves it */
async function fresh(browser, flag, w = 390, h = 844, extra = {}) {
  const c = await browser.newContext({ viewport: { width: w, height: h }, serviceWorkers: "block", ...extra });
  await c.addInitScript(f => { try { localStorage.setItem("stem-ob", "done"); localStorage.setItem("stem-jev", "0"); localStorage.setItem("stem-voice", "off");
    for (const b of ["right", "miss", "three", "redo"]) localStorage.setItem("stem-ob-rw-" + b, "9"); } catch { /* */ }
    if (f === "on") localStorage.setItem("stem-ui", "v7"); }, flag);   // the real path: fx.js reads it in <head> and sets html.ui-v7
  const p = await c.newPage();
  const errs = []; p.on("pageerror", e => errs.push(String(e.message))); p.__errs = errs;
  await p.goto(BASE + "/#BANK_PB1");
  await p.waitForFunction(() => /^CALC1_/.test(document.querySelector("#pcode")?.textContent || ""), null, { timeout: 8000 });
  await p.waitForSelector("#qnav:not([hidden])");
  return [c, p];
}
const geo = p => p.evaluate(() => {
  const r = s => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height, r: b.right }; };
  const ns = [...document.querySelectorAll("#pbTile .pb-n")].map(e => { const b = e.getBoundingClientRect(); return { x: b.x, w: b.width, h: b.height, cls: e.className.replace("pb-n ", "") }; });
  return { list: r(".pb-list"), tile: r("#pbTile"), nav: r(".pb-nav"), prev: r("#qprev"), next: r("#qnext"), back: r("#qback"), btn: r("#qlistBtn"), ns,
    sw: document.documentElement.scrollWidth, vw: innerWidth, aria: document.querySelector("#pbTile")?.getAttribute("aria-label") };
});
const states = p => p.evaluate(() => [...document.querySelectorAll("#pbTile .pb-n")].map(e => e.className.replace("pb-n ", "")));

const browser = await launchBrowser(pw, { args: ["--no-sandbox"] });
/* three rights in a row; a per-frame sampler (started before the 3rd) records every streak notch's inline transform. Returns the samples after 3 s. */
async function run(flag, extra = {}) {
  const [c, p] = await fresh(browser, flag, 390, 844, extra);
  for (const n of [1, 2]) { await go(p, "CALC1_P0" + n); await pick(p, "a"); }
  await p.evaluate(() => { window.__w = []; const t0 = performance.now(); const f = () => { const ns = [...document.querySelectorAll("#pbTile .pb-n.streak")];
    window.__w.push({ t: performance.now() - t0, s: ns.map(e => e.style.transform) }); if (performance.now() - t0 < 4500) requestAnimationFrame(f); }; requestAnimationFrame(f); });
  await go(p, "CALC1_P03"); await pick(p, "a");
  if (flag === "on") await p.waitForFunction(() => document.querySelectorAll("#pbTile .pb-n.streak").length === 3);
  await p.waitForTimeout(3000);
  const w = await p.evaluate(() => window.__w), end = await p.evaluate(() => [...document.querySelectorAll("#pbTile .pb-n.streak")].map(e => e.style.transform + "|" + e.style.willChange));
  assert.deepEqual(p.__errs, []); await c.close();
  return { sc: w.flatMap(r => r.s.filter(Boolean).map(s => +/scaleY\(([\d.]+)\)/.exec(s)[1])), end };
}
try {
  await step("flag ON: the 3-streak waves: dips below 0.75, never above 1, back to rest (no inline transform, no will-change) after the wave", async () => {
    const { sc, end } = await run("on");
    assert.ok(sc.length > 20, "transform was written over time");
    assert.ok(Math.min(...sc) < 0.75, "dips below 0.75: " + Math.min(...sc));
    assert.ok(Math.max(...sc) <= 1.0001, "never above rest");
    assert.deepEqual(end, ["|", "|", "|"]);
  });
  await step("prefers-reduced-motion: no transform ever", async () => {
    assert.equal((await run("on", { reducedMotion: "reduce" })).sc.length, 0);
  });
  await step("flag OFF: no transform ever", async () => {
    assert.equal((await run("off")).sc.length, 0);
  });
} finally {
  await browser.close(); srv.kill();
}
if (failures) { console.log(`\n${failures} FAILED`); process.exit(1); }
console.log("\nALL OK");
