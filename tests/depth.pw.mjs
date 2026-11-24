// DEPTH 1 smoke (brain ui-polish/depth/PROPOSALS.txt; Tony's DEPTH GRILL, Nov 14): light from above on the ui-v7 surfaces.
// Flag ON (?ui=v7): unchosen .opt rows and the primary .btn-go carry the lit top edge (inset 0 1px 0) + a tiny shadow; the question card
// .p floats with the bar's drop shadow, no lit top (ICK4-FLOAT, Tony Nov 18); the Cluck box has no rim or lit top; the Cluck input .ask is a recessed well with a
// raised send; the proof box .xb and the short-answer .ff are recessed wells. HARD GATE (WCAG 1.4.11): the field vs its card >= 3:1 by
// computed colours, else the 1px edge stays (both are reported). Flag OFF: none of the depth shadows, no change.
// Own serve.py, throwaway banks. Smoke size, feature-local:   node tests/depth.pw.mjs [port]
import { launchBrowser } from "./pw-browser.mjs";
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { serverUp } from "./lib/boot.mjs";   // CI-ARCH B3: a dead serve.py fails at once, with its URL
import { settled } from "./lib/wait.mjs";   // CI-ARCH D1: wait on state (animations ended + 2 frames), not a fixed sleep
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
await serverUp(BASE);

let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); }
  catch (e) { failures++; console.log("FAIL", name, "\n     ", String(e.message).slice(0, 700)); }
}
const browser = await launchBrowser(pw, { args: ["--no-sandbox"] });
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
  await settled(p);   // the card's styles are at rest before the computed-style reads
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
/* computed colour -> [r,g,b,a] in 0-255 / 0-1; handles rgb(), rgba() and color(srgb r g b / a) */
const col = s => {
  if (/^color\(srgb/i.test(s)) { const m = s.match(/[\d.]+/g).map(Number); return [m[0] * 255, m[1] * 255, m[2] * 255, m[3] ?? 1]; }
  if (/^oklab/i.test(s)) {                                      // color-mix(in oklab, ...) serializes as oklab(); convert to sRGB
    const m = s.match(/-?\d*\.?\d+/g).map(Number), L = m[0], A = m[1], B = m[2], alpha = m[3] ?? 1;
    const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
    const mm = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
    const ss = (L - 0.0894841775 * A - 1.2914855480 * B) ** 3;
    const lin = [4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * ss, -1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * ss, -0.0041960863 * l - 0.7034186147 * mm + 1.7076147010 * ss];
    return [...lin.map(v => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.max(v, 0) ** (1 / 2.4) - 0.055)), alpha];
  }
  const m = s.match(/[\d.]+/g).map(Number); return [m[0], m[1], m[2], m[3] ?? 1];
};
const over = (fg, bg) => { const a = fg[3]; return [0, 1, 2].map(i => Math.round(fg[i] * a + bg[i] * (1 - a))); };
const rgb = a => `rgb(${a[0]}, ${a[1]}, ${a[2]})`;
const DISH = /rgba\(0, 0, 0, 0\.3\) 1px 1px 3px 0px inset/;   // SOFT-LIFT §3 dish (INSET light from above, no well)
/* the field's computed fill vs the nearest opaque ancestor surface (what the field sits on) */
const gate = (p, sel) => p.evaluate(s => {
  const f = document.querySelector(s); if (!f) return null;
  const fill = getComputedStyle(f).backgroundColor; let a = f.parentElement;
  while (a) { const bg = getComputedStyle(a).backgroundColor; if (bg && !/rgba\(.*,\s*0\)$|transparent/.test(bg)) break; a = a.parentElement; }
  const chain = []; for (let e = f.parentElement, i = 0; e && i < 7; e = e.parentElement, i++) chain.push(e.tagName + "." + e.className + " " + getComputedStyle(e).backgroundColor);
  return { fill, surround: a ? getComputedStyle(a).backgroundColor : "rgb(0, 0, 0)", via: a ? a.tagName + "." + a.className : "none", chain: chain.join(" | "), bw: getComputedStyle(f).borderTopWidth, bc: getComputedStyle(f).borderTopColor, bs: getComputedStyle(f).borderTopStyle, shadow: getComputedStyle(f).boxShadow };
}, sel);

/* computed order puts the inset last: "<colour> 0px 1px 0px 0px inset" */
const LIT = /0px 1px 0px 0px inset/, WELL = /0px 2px 3px 0px inset/;
const DROP = /0px 6px 16px -4px/;   // ICK4-FLOAT (Tony Nov 18): the top bar's drop shadow on resting cards

await step("flag on: an unchosen .opt tile floats (ICK4-FLOAT: the bar's drop shadow, no lit top, no edge at rest)", async () => {
  const [c, p] = await open("on", "BANK_DP1", 390, 844, 1, "CALC1_DP01");
  const o = await css(p, "#q .opt:not([aria-checked='true']):not(.pend):not(.reveal)");
  assert.ok(o, "an .opt row is shown");
  assert.match(o.shadow, DROP, "ICK4-FLOAT (Tony Nov 18): the resting tile floats: " + o.shadow); assert.doesNotMatch(o.shadow, LIT, "Tony Nov 14: a lit top on a resting tile reads as a border: " + o.shadow);
  assert.equal(o.bw, "0px", "rest edge stays gone (NO-BORDER 1)");
  const card = await css(p, "#q .p, .p");
  assert.equal(o.bg, card.bg, "NAVY-MIN: option rest fill = card fill (one surface, navy-800)");
  assert.equal(o.bg, "rgb(13, 20, 42)", "navy-800");
  await p.click('#q .opt[data-id="a"]');
  const k = await css(p, "#q .opt[aria-checked='true']");
  assert.equal(k.shadow, "none", "checked: no lit top, no shadow below");
  await c.close();
});
await step("flag on: the option letter badge is a rounded square, not a circle (owner rule: circles only on the Cluck avatar)", async () => {
  const [c, p] = await open("on", "BANK_DP1", 390, 844, 1, "CALC1_DP01");
  const b = await css(p, "#q .opt .badge");
  assert.ok(b, "an option badge is shown");
  const r = await p.evaluate(() => getComputedStyle([...document.querySelectorAll("#q .opt .badge")].find(e => e.getClientRects().length)).borderTopLeftRadius);
  assert.ok(["8px", "0px"].includes(r), "badge is a rounded square or (MC-BENTO corner letter) no shape, never a circle: " + r);
  await c.close();
});
await step("flag on: the single answer key is the flat chip key (SOFT-LIFT §5), no lit top", async () => {
  const [c, p] = await open("on", "BANK_DP1", 390, 844, 1, "CALC1_DP02");
  const b = await css(p, "#ansGo, #q .btn-go");
  assert.ok(b, "the single answer key is shown");
  assert.doesNotMatch(b.shadow, LIT, "SOFT-LIFT §5: the key is a flat chip, no lit top: " + b.shadow);
  assert.equal(b.bg, "rgb(40, 51, 82)", "the key face is --chip navy-600 (SOFT-LIFT §5)");
  assert.ok(b.bw === "0px" || b.bs === "none", "the key has no edge: " + b.bw + " " + b.bs);
  await c.close();
});
await step("flag on: the question card .p floats (ICK4-FLOAT: drop shadow, no lit top)", async () => {
  const [c, p] = await open("on", "BANK_DP1", 390, 844, 1, "CALC1_DP01");
  const card = await css(p, "#q .p, .p");
  assert.ok(card, "a question card is shown");
  assert.match(card.shadow, DROP, "ICK4-FLOAT: the card floats: " + card.shadow); assert.doesNotMatch(card.shadow, LIT, "no lit top: " + card.shadow);
  await c.close();
});
await step("flag on: the short-answer .ff is the Soft-lift dish; its resting edge reaches 3:1 (WCAG 1.4.11)", async () => {
  const [c, p] = await open("on", "BANK_DP1", 390, 844, 1, "CALC1_DP02");
  const g = await gate(p, "#q .ff");
  assert.ok(g, "a short-answer field is shown");
  assert.match(g.shadow, DISH, "SOFT-LIFT §3: the inset dish, not the old well: " + g.shadow);
  const edge = over(col(g.bc), col(g.fill));                    // border colour over the field ground (background-clip: border-box)
  const er = ratio(rgb(edge), g.surround);                      // the edge pixel vs the card
  const fr = ratio(g.fill, g.surround);
  console.log(`     .ff edge ${rgb(edge)} vs ${g.surround} (${g.via}): ${er.toFixed(2)}:1 (fill ${fr.toFixed(2)}:1, border ${g.bw} ${g.bc})`);
  assert.ok(er >= 3, "the resting edge reaches 3:1: " + er.toFixed(2) + ":1 (" + rgb(edge) + " vs " + g.surround + ")");
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
await step("flag on: Cluck box has no lit top; the ask field is the floating glass bar (outer drop shadow, glass layer) with a flat send", async () => {
  const [c, p] = await open("on", "BANK_DP1", 1280, 800, 1, "CALC1_DP01");   // desk sugar: the Cluck box is a permanent column box (cluck-permanent.pw.mjs)
  const cl = await css(p, "#cluck.cl, .cl");
  assert.ok(cl, "the Cluck box is shown");
  assert.doesNotMatch(cl.shadow, LIT, "no lit top on the Cluck box: " + cl.shadow);
  /* html.ui-v7: the ask field is the R3 glass Ask bar (client/cluck/ask_glass/), floating: an outer drop shadow, a glass layer, no recessed well (Tony Nov 22, CLUCK-PRETRY) */
  const ask = await css(p, "#cluck .ask.ag, .cl .ask.ag");
  assert.ok(ask, "the glass Ask bar is shown");
  assert.doesNotMatch(ask.shadow, /inset/, "the floating bar has no inset (well) shadow: " + ask.shadow);
  assert.match(ask.shadow, /\d+px \d+px \d+px 0px(?!.*inset)|^rgba?\([^)]*\) \d+px \d+px \d+px/, "the bar has an outer drop shadow: " + ask.shadow);
  const glass = await p.evaluate(() => { const b = [...document.querySelectorAll(".cl .ask.ag")].find(x => x.getClientRects().length > 0); return b ? { layers: !!(b.querySelector(":scope > .g-copy") && b.querySelector(":scope > .g-tint")) } : null; });
  assert.ok(glass && glass.layers, "the bar carries its glass layers (.g-copy + .g-tint)");
  const send = await p.evaluate(() => { const e = [...document.querySelectorAll(".cl .ask.ag > .send")].find(x => x.getClientRects().length > 0); if (!e) return null; const cs = getComputedStyle(e); return { shadow: cs.boxShadow, img: cs.backgroundImage, bw: cs.borderTopWidth, bs: cs.borderTopStyle }; });
  assert.ok(send, "the send button is shown");
  assert.equal(send.shadow, "none", "the send is flat at idle, no raised or inset shadow: " + send.shadow);
  assert.equal(send.img, "none", "the send has no gradient at idle: " + send.img);
  assert.ok(send.bw === "0px" || send.bs === "none", "the send has no border at idle: " + send.bw + " " + send.bs);
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
