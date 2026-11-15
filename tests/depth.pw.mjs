// DEPTH 1 smoke (brain ui-polish/depth/PROPOSALS.txt; Tony's DEPTH GRILL, Nov 14): light from above on the ui-v7 surfaces.
// Flag ON (?ui=v7): unchosen .opt rows and the primary .btn-go carry the lit top edge (inset 0 1px 0) + a tiny shadow; the question card
// .p gets its soft second shadow; the Cluck box keeps its warm rim and gains the lit top; the Cluck input .ask is a recessed well with a
// raised send; the proof box .xb and the short-answer .ff are recessed wells. HARD GATE (WCAG 1.4.11): the field vs its card >= 3:1 by
// computed colours, else the 1px edge stays (both are reported). Flag OFF: none of the depth shadows, no change.
// Own serve.py, throwaway banks. Smoke size, feature-local:   node tests/depth.pw.mjs [port]
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { pw = require("/opt/node22/lib/node_modules/playwright"); }
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = +(process.argv[2] || 8894), BASE = `http://localhost:${PORT}`;
const TMP = mkdtempSync(join(tmpdir(), "depth-")), BANKS = join(TMP, "banks");
const ch = (...m) => m.map((md, i) => ({ id: "abcde"[i], md }));
const sac = n => ({ title: `Practice Exam 2, Question ${n}`, key: "Use: a\nAnswer: a", slip: { b: "b slip" } });
const mc = code => ({ code, type: "mc", shuffle: false, body: [{ type: "text", md: "Pick a." }], choices: ch("one", "two", "three", "four", "five"),
  correct: "a", wrong: [{ choice: "b", hint: "QUACK. Not b." }, { choice: "c", hint: "QUACK. Not c." }], saccharine: sac(1) });
const num = code => ({ code, title: "Plain number", type: "num", answer: "4", body: [{ type: "text", md: "What is 2 + 2?" }], noob: { tier: 1 }, saccharine: sac(2) });
mkdirSync(BANKS);
writeFileSync(join(BANKS, "BANK_DP1.json"), JSON.stringify({ v: 1, problems: [mc("CALC1_DP01"), num("CALC1_DP02")] }));
copyFileSync(join(ROOT, "tests/fixtures/proof-bank.json"), join(BANKS, "BANK_PRF.json"));
const srv = spawn("python3", [join(ROOT, "server", "http_server", "serve.py"), String(PORT)], { env: { ...process.env, STEM_BANKS: BANKS, STEM_TODAY: "2026-10-23", STEM_TRIES: join(TMP, "tries.json"), OPENROUTER_API_KEY: "" }, stdio: "ignore" });
for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + "/")).ok) break; } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 100)); }

let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); }
  catch (e) { failures++; console.log("FAIL", name, "\n     ", String(e.message).slice(0, 700)); }
}
const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
/* a fresh context; flag "on" stores stem-ui=v7 (fx.js sets html.ui-v7 before first paint) */
async function open(flag, hash, w = 390, h = 844, dsf = 1, code = hash) {
  const phone = w < 500;
  const c = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dsf, serviceWorkers: "block" });
  await c.addInitScript(f => { try { localStorage.setItem("stem-ob", "done"); localStorage.setItem("stem-jev", "0"); localStorage.setItem("stem-voice", "off");
    for (const b of ["right", "miss", "three", "redo"]) localStorage.setItem("stem-ob-rw-" + b, "9"); } catch { /* */ }
    if (f === "on") localStorage.setItem("stem-ui", "v7"); }, flag);
  const p = await c.newPage();
  p.errs = []; p.on("pageerror", e => p.errs.push(String(e.message)));
  if (hash.startsWith("PRF_")) await c.addCookies([{ name: "stem-mode", value: "diet", url: BASE }, { name: "stem-mode-v", value: "2", url: BASE }]);   // the proof box shows in diet (proof.pw.mjs)
  await p.goto(BASE + "/#" + hash);   // a bank name (BANK_*) loads its first problem; a problem code opens that problem
  await p.waitForFunction(() => /^(CALC1_|PRF_)/.test(document.querySelector("#pcode")?.textContent || ""), null, { timeout: 10000 }).catch(e => { throw e; });
  if (!hash.startsWith("PRF_")) {
    await p.evaluate(h => { location.hash = h; }, code);
    await p.waitForFunction(h => document.querySelector("#pcode")?.textContent === h, code, { timeout: 8000 });
  }
  await p.waitForSelector(hash.startsWith("PRF_") ? "#ans" : "#qnav:not([hidden])", { timeout: 10000 });
  await p.waitForTimeout(400);
  return [c, p];
}
/* computed box-shadow / border of the first visible match */
const css = (p, sel) => p.evaluate(s => {
  const e = [...document.querySelectorAll(s)].find(x => x.getClientRects().length > 0);
  if (!e) return null;
  const cs = getComputedStyle(e);
  return { shadow: cs.boxShadow, bw: cs.borderTopWidth, bg: cs.backgroundColor };
}, sel);
/* WCAG relative luminance and contrast from computed rgb(a) strings */
const lum = s => { const m = s.match(/[\d.]+/g).map(Number); const [r, g, b] = m.slice(0, 3).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
/* the field's computed fill vs the nearest opaque ancestor surface (what the field sits on) */
const gate = (p, sel) => p.evaluate(s => {
  const f = document.querySelector(s); if (!f) return null;
  const fill = getComputedStyle(f).backgroundColor; let a = f.parentElement;
  while (a) { const bg = getComputedStyle(a).backgroundColor; if (bg && !/rgba\(.*,\s*0\)$|transparent/.test(bg)) break; a = a.parentElement; }
  const chain = []; for (let e = f.parentElement, i = 0; e && i < 7; e = e.parentElement, i++) chain.push(e.tagName + "." + e.className + " " + getComputedStyle(e).backgroundColor);
  return { fill, surround: a ? getComputedStyle(a).backgroundColor : "rgb(0, 0, 0)", via: a ? a.tagName + "." + a.className : "none", chain: chain.join(" | "), bw: getComputedStyle(f).borderTopWidth, shadow: getComputedStyle(f).boxShadow };
}, sel);

/* computed order puts the inset last: "<colour> 0px 1px 0px 0px inset" */
const LIT = /0px 1px 0px 0px inset/, WELL = /0px 2px 3px 0px inset/;

await step("flag on: an unchosen .opt row is raised (lit top + tiny shadow), no edge at rest", async () => {
  const [c, p] = await open("on", "BANK_DP1", 390, 844, 1, "CALC1_DP01");
  const o = await css(p, "#q .opt:not([aria-checked='true']):not(.pend):not(.reveal)");
  assert.ok(o, "an .opt row is shown");
  assert.match(o.shadow, LIT, "the lit top edge: " + o.shadow);
  assert.match(o.shadow, /0px 1px 2px/, "the tiny shadow: " + o.shadow);
  assert.equal(o.bw, "0px", "rest edge stays gone (NO-BORDER 1)");
  await c.close();
});
await step("flag on: the option letter badge is a rounded square, not a circle (owner rule: circles only on the Cluck avatar)", async () => {
  const [c, p] = await open("on", "BANK_DP1", 390, 844, 1, "CALC1_DP01");
  const b = await css(p, "#q .opt .badge");
  assert.ok(b, "an option badge is shown");
  const r = await p.evaluate(() => getComputedStyle([...document.querySelectorAll("#q .opt .badge")].find(e => e.getClientRects().length)).borderTopLeftRadius);
  assert.equal(r, "8px", "badge radius: " + r);
  await c.close();
});
await step("flag on: the primary .btn-go is raised (lit top + small shadow)", async () => {
  const [c, p] = await open("on", "BANK_DP1", 390, 844, 1, "CALC1_DP02");
  const b = await css(p, "#ansGo, #q .btn-go");
  assert.ok(b, "the primary button is shown");
  assert.match(b.shadow, LIT, "the lit top edge: " + b.shadow);
  await c.close();
});
await step("flag on: the question card .p has its lit top and a soft second shadow", async () => {
  const [c, p] = await open("on", "BANK_DP1", 390, 844, 1, "CALC1_DP01");
  const card = await css(p, "#q .p, .p");
  assert.ok(card, "a question card is shown");
  assert.match(card.shadow, LIT, "the lit top edge: " + card.shadow);
  assert.match(card.shadow, /0px 6px 14px/, "the soft second shadow: " + card.shadow);
  await c.close();
});
await step("flag on: the short-answer .ff is a recessed well, its edge gated on 3:1 (WCAG 1.4.11)", async () => {
  const [c, p] = await open("on", "BANK_DP1", 390, 844, 1, "CALC1_DP02");
  const g = await gate(p, "#q .ff");
  assert.ok(g, "a short-answer field is shown");
  assert.match(g.shadow, WELL, "the recessed well: " + g.shadow);
  const r = ratio(g.fill, g.surround);
  console.log(`     .ff field ${g.fill} vs ${g.surround} (${g.via}): ${r.toFixed(2)}:1, border ${g.bw}`);
  assert.equal(g.bw, r >= 3 ? "0px" : "1px", "no edge only when the field reaches 3:1; else the 1px edge is kept");
  await c.close();
});
await step("flag on: the proof box .xb is a recessed well, its edge gated on 3:1 (WCAG 1.4.11)", async () => {
  const [c, p] = await open("on", "PRF_PRA");
  const g = await gate(p, ".xb textarea");   // computed style: the explain-box field is hidden on the proof page (Explain opens it), its colours still resolve
  assert.ok(g, "the proof box is shown");
  assert.match(g.shadow, WELL, "the recessed well: " + g.shadow);
  const r = ratio(g.fill, g.surround);
  console.log(`     .xb field ${g.fill} vs ${g.surround} (${g.via}): ${r.toFixed(2)}:1, border ${g.bw}`);
  assert.equal(g.bw, r >= 3 ? "0px" : "1px", "no edge only when the field reaches 3:1; else the 1px edge is kept");
  await c.close();
});
await step("flag on: Cluck keeps its warm rim, gains the lit top; the input is a recessed well with a raised send", async () => {
  const [c, p] = await open("on", "BANK_DP1", 1280, 800, 1, "CALC1_DP01");   // desk sugar: the Cluck box is a permanent column box (cluck-permanent.pw.mjs)
  const cl = await css(p, "#cluck.cl, .cl");
  assert.ok(cl, "the Cluck box is shown");
  assert.match(cl.shadow, LIT, "the lit top on the Cluck box: " + cl.shadow);
  const ask = await css(p, "#cluck .ask, .cl .ask");
  assert.ok(ask, "the Cluck input is shown");
  assert.match(ask.shadow, WELL, "the recessed well: " + ask.shadow);
  const send = await css(p, "#cluck .ask .send, .cl .ask .send");
  assert.match(send.shadow, LIT, "the raised send: " + send.shadow);
  await c.close();
});
await step("flag off: no depth shadow on any of these surfaces (byte-identical to main)", async () => {
  const [c, p] = await open("off", "BANK_DP1", 390, 844, 1, "CALC1_DP01");
  for (const s of ["#q .opt:not([aria-checked='true'])", "#q .p", ".cl .ask", ".cl .ask .send"]) {
    const x = await css(p, s);
    if (!x) continue;
    assert.doesNotMatch(x.shadow, LIT, s + " has no lit top off the flag: " + x.shadow);
    assert.doesNotMatch(x.shadow, WELL, s + " has no well off the flag: " + x.shadow);
  }
  const o = await css(p, "#q .opt:not([aria-checked='true'])");
  assert.equal(o.bw, "1px", "flag off .opt keeps its 1px --line edge");
  await c.close();
});
await step("no page errors (flag on)", async () => {
  const [c, p] = await open("on", "BANK_DP1", 390, 844, 1, "CALC1_DP01");
  assert.deepEqual(p.errs, []);
  await c.close();
});

await browser.close(); srv.kill();
if (failures) { console.log(`\n${failures} FAILED`); process.exit(1); }
console.log("\nALL OK");
