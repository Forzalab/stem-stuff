// INPUTBOX-STATIC smoke (IB-1 "Soft lift" + IB-2 focus/typing + IB-3 thinking + IB-4 verdict, Tony Nov 24): the look and motion of the two typed-answer inputs under html.ui-v7 only.
//   single answer box: 60px, 1.5px outline, Atkinson 600 value, Check key outside on the right (60x60), fills the column on desktop (no 400px cap, Tony Nov 25).
//   multi-part rows: 22px hang column (18 + --s1), the ONE shared answer letter (16/24, 600, uppercase, --ink-qnum), 16/24 prompt and hint, 60px field (1fr, fills the row), 16px gap (Nov 25, was 24), no hairline, the grey hint under each box (.phow).
//   IB-2: focus = scale(1.014) in place + shadow underneath + --action 75% edge (.42s); key press nudges the edge 90%/60% and back in ~320ms;
//   judged fields never lift; reduced motion = colours only.
//   IB-3: while a typed answer is checked the ring animates ONLY transform (perimeter-spaced rotate keyframes: equal px/step on 286x60 and
//   400x60), the box sinks scale(.986), the input is readOnly, the typed key loses app.css's spinner (MC keeps it), reduced motion = a static
//   --action ring, no sink/blur.
//   IB-4: the verdict ring starts as the frozen aurora arc (~173deg, NOT a full ring), closes in 440ms with transform-only conic arcs, the
//   real border is never recoloured, the final frame is pixel-identical to the static done render, the typed key skips §verdict-morph and
//   stays dimmed after a miss, the hint is the navy card for single + multi, the tick/cross waits for the close; MC keeps its full morph;
//   reduced motion = a closed static ring.
//   IB-5: each multi part's key sits OUTSIDE its field (60x60, 12px gap, same #ansGo squircle), visible but dimmed + inert on an empty box in its
//   reserved slot (KEY-ALL, Nov 25; the field width never jumps), dims while grading (no spinner), dimmed on wrong and full on the next keystroke, gone when
//   the part is right.   flag off: the live in-box arrow, nothing moves.
//   node tests/inputbox-static.smoke.mjs [port]      SHOTS=<dir> also writes app + mock stills.
//   STEP_FILTER=<text> runs only the named steps (the whole file is an orc-run >2 min test; the cloud worker runs IB-4 alone).
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";
import { launchBrowser } from "./pw-browser.mjs";
import { serverUp } from "./lib/boot.mjs";
import { settled } from "./lib/wait.mjs";
const require = createRequire(import.meta.url);
let pw; try { pw = require("playwright"); } catch { pw = require("/opt/node22/lib/node_modules/playwright"); }
const ROOT = join(dirname(fileURLToPath(import.meta.url)), ".."), PORT = +(process.argv[2] || 8862), BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = process.env.SHOTS || "", SHOTS_APP = process.env.SHOTS_APP === "1";   // SHOTS_APP: app stills only (the mock block is slow; used to re-take the IB-3 thinking shots)
const MOCK = process.env.MOCK || "/tmp/claude-0/-home-user-stem-stuff/e68c7368-bfe4-55d9-bc9b-0ddd1157720e/scratchpad/ib/PICK-soft-lift.src.html";
if (SHOTS) { try { mkdirSync(SHOTS, { recursive: true }); } catch (e) { console.log("SHOTS dir unavailable:", e.message); } }
const TRIES = join(mkdtempSync(join(tmpdir(), "ibstatic-")), "tries.json");
const T = (md) => [{ type: "text", md }];
const FILE = { v: 1, problems: [
  { code: "PSY_M1A", type: "multi", how: "Number only in each box.", body: T("Two sets, $A$ and $B$."), parts: [
    { label: "a", prompt: "How many are in $A\\cup B$?", type: "num", answer: "14" },
    { label: "b", prompt: "How many are in exactly one set?", type: "num", answer: "11" },
  ] },
  /* BENTO: a, b short (num) + c long (expr) -> row 1 [a][b], row 2 [c full] */
  { code: "PSY_B3A", type: "multi", how: "Number only in each box.", body: T("A stone is thrown."), parts: [
    { label: "a", prompt: "How long is it in the air?", type: "num", answer: "2.8" },
    { label: "b", prompt: "How far does it land?", type: "num", answer: "33.4" },
    { label: "c", prompt: "Write the height as a function of time.", type: "expr", answer: "38-4.9*t^2" },
  ] },
  /* IB-5 uses its own multi code: the key-outside steps grade it, so the IB-1 multi step must stay untouched. */
  { code: "PSY_K1A", type: "multi", how: "Number only in each box.", body: T("Two sets, $A$ and $B$."), parts: [
    { label: "a", prompt: "How many are in $A\\cup B$?", type: "num", answer: "14" },
    { label: "b", prompt: "How many are in exactly one set?", type: "num", answer: "11" },
  ] },
  { code: "PSY_S1A", type: "num", how: "Number only.", body: T("Find the magnitude of the block's acceleration."), answer: "3.2", unit: "m/s^2", wish: true },
  { code: "PSY_S2A", type: "num", how: "Number only.", body: T("Find the magnitude of the cart's acceleration."), answer: "3.2", unit: "m/s^2" },
  { code: "PSY_S3A", type: "num", how: "Number only.", body: T("Find the magnitude of the sled's acceleration."), answer: "5", unit: "m/s^2" },
  { code: "PSY_S4A", type: "num", how: "Number only.", body: T("Find the mass of the cart."), answer: "7", unit: { bad: true } },
  /* IB-3 uses its own codes: those items FINISH in the thinking steps, and go() only reloads on a hash change */
  { code: "PSY_T1A", type: "num", how: "Number only.", body: T("Find the magnitude of the block's acceleration."), answer: "3.2", unit: "m/s^2", wish: true },
  { code: "PSY_T2A", type: "num", how: "Number only.", body: T("Find the magnitude of the block's acceleration."), answer: "3.2", unit: "m/s^2" },
  { code: "PSY_T3A", type: "multi", how: "Number only in each box.", body: T("Two sets, $A$ and $B$."), parts: [
    { label: "a", prompt: "How many are in $A\\cup B$?", type: "num", answer: "14" },
    { label: "b", prompt: "How many are in exactly one set?", type: "num", answer: "11" },
  ] },
  /* IB-4's own codes: the IB-3 steps above finish T1A/T2A/T3A (a held "correct"), so they cannot be answered again. */
  { code: "PSY_V1A", type: "num", how: "Number only.", body: T("Find the magnitude of the block's acceleration."), answer: "3.2", unit: "m/s^2", wish: true },
  { code: "PSY_V2A", type: "num", how: "Number only.", body: T("Find the magnitude of the cart's acceleration."), answer: "3.2", unit: "m/s^2" },
  { code: "PSY_V3A", type: "multi", how: "Number only in each box.", body: T("Two sets, $A$ and $B$."), parts: [
    { label: "a", prompt: "How many are in $A\\cup B$?", type: "num", answer: "14" },
    { label: "b", prompt: "How many are in exactly one set?", type: "num", answer: "11" },
  ] },
  { code: "PSY_V4A", type: "mc", pick: "all", how: "Tick all that apply.", body: T("Tick the even numbers."),
    choices: [{ id: "a", md: "2" }, { id: "b", md: "3" }], correct: ["a"],
    wrong: [{ match: "b", error: "pick", hint: "3 is odd." }] },
  { code: "PSY_V5A", type: "multi", how: "Number only in each box.", body: T("Two sets, $A$ and $B$."), parts: [
    { label: "a", prompt: "How many are in $A\\cup B$?", type: "num", answer: "14" },
    { label: "b", prompt: "How many are in exactly one set?", type: "num", answer: "11" },
  ] },
  { code: "PSY_C1A", type: "mc", pick: "all", how: "Tick all that apply.", body: T("Tick the even numbers."),
    choices: [{ id: "a", md: "2" }, { id: "b", md: "3" }], correct: ["a"],
    wrong: [{ match: "b", error: "pick", hint: "3 is odd." }] },
  /* IB-7's own codes: the miss hint card's gap under the typed box (single + multi), so no earlier step has tried them. */
  { code: "PSY_G1A", type: "num", how: "Number only.", body: T("Find the magnitude of the block's acceleration."), answer: "3.2", unit: "m/s^2", wish: true },
  { code: "PSY_G2A", type: "multi", how: "Number only in each box.", body: T("Two sets, $A$ and $B$."), parts: [
    { label: "a", prompt: "How many are in $A\\cup B$?", type: "num", answer: "14" },
    { label: "b", prompt: "How many are in exactly one set?", type: "num", answer: "11" },
  ] },
] };
const srv = spawn("python3", [join(ROOT, "server", "http_server", "serve.py"), String(PORT)], { env: { ...process.env, STEM_TRIES: TRIES, STEM_TODAY: "2026-11-24" }, stdio: "ignore" });
await serverUp(BASE);
let fails = 0;
const FILTER = process.env.STEP_FILTER || "";   // e.g. STEP_FILTER=IB-4 runs only the IB-4 steps (the whole smoke is an orc-run >2 min test)
async function step(name, fn) {
  if (FILTER && name.indexOf(FILTER) < 0) return;
  try { const info = await fn(); console.log("ok  ", name, info ? `  [${info}]` : ""); }
  catch (e) { fails++; console.log("FAIL", name, "\n     ", String(e.message).slice(0, 700)); }
}
let browser;
try { browser = await launchBrowser(pw, { motion: true, args: ["--no-sandbox"] }); }
catch { browser = await launchBrowser(pw, { motion: true, args: ["--no-sandbox"], executablePath: "/opt/pw-browsers/chromium" }); }
async function fresh(ui, vp, opts = {}) {
  const phone = vp.width < 500, ctx = await browser.newContext({ viewport: vp, hasTouch: phone, isMobile: phone, serviceWorkers: "block", deviceScaleFactor: 2, ...opts });
  await ctx.addCookies([{ name: "stem-mode-v", value: "2", url: BASE }]);   // sugar, flag in the URL
  const page = await ctx.newPage(); await page.goto(`${BASE}/${ui ? "?ui=v7" : ""}`);
  const [fc] = await Promise.all([page.waitForEvent("filechooser"), page.click("#upload")]);
  await fc.setFiles({ name: "ib1.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(FILE)) });
  await page.waitForFunction(() => !!document.querySelector("#pcode") && !document.querySelector("#freeze").hidden
    && (!document.querySelector("#splash") || getComputedStyle(document.querySelector("#splash")).opacity === "0"), null, { timeout: 10000 });
  return { ctx, page };
}
const go = async (page, code) => {
  await page.evaluate(c => { location.hash = "#" + c; }, code);
  await page.waitForFunction(c => (document.querySelector("#pcode")?.textContent || "") === c && (document.querySelector("#q")?.textContent || "").length > 20, code, { timeout: 8000 });
  await settled(page);
};
/* the first-line baseline: a zero-size inline-block sits on the line's baseline, so its top IS the baseline */
const MET = () => {
  const q = document.querySelector("#q");
  const multi = document.querySelector("#q .mparts .part");
  const box = multi ? multi.querySelector(".ff") : document.querySelector("#q > .ff#ff");
  const inp = box && box.querySelector("input.ans");
  const mk = multi && multi.querySelector(".mk"), pr = multi && multi.querySelector(".pr");
  const key = multi ? null : document.getElementById("ansGo");
  const mc = document.getElementById("mcGo");
  const cs = box && getComputedStyle(box), rect = e => e ? e.getBoundingClientRect() : null;
  const cv = document.createElement("canvas").getContext("2d");
  /* a zero-size inline-block sits on the line's baseline; its rect bottom IS that baseline. Add the glyph's
     actual descent from the canvas so the number is the INK bottom, not the line box. */
  const base = el => {
    if (!el) return null;
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let n, first = null;
    while ((n = w.nextNode())) { if ((n.nodeValue || "").trim()) { first = n; break; } }
    const m = document.createElement("span");
    m.style.cssText = "display:inline-block;width:0;height:0;padding:0;margin:0;vertical-align:baseline";
    if (first) first.parentNode.insertBefore(m, first); else el.append(m);
    const y = m.getBoundingClientRect().bottom; m.remove();
    const pc = getComputedStyle(first ? first.parentElement : el), ch = ((first?.nodeValue || el.textContent || "").trim()[0] || "x");
    cv.font = `${pc.fontStyle} ${pc.fontWeight} ${pc.fontSize} ${pc.fontFamily}`;
    const d = cv.measureText(ch).actualBoundingBoxDescent || 0;
    return { line: y, glyph: y + d };
  };
  const valueBase = (() => {
    if (!inp) return null;
    const c = getComputedStyle(inp), r = inp.getBoundingClientRect();
    const lh = parseFloat(c.lineHeight) || parseFloat(c.fontSize) * 1.2;
    const top = r.top + parseFloat(c.paddingTop) + (r.height - lh) / 2;
    cv.font = `${c.fontStyle} ${c.fontWeight} ${c.fontSize} ${c.fontFamily}`;
    return top + cv.measureText("14").fontBoundingBoxAscent;
  })();
  const b = rect(box), k = rect(key), c = rect(mc);
  const mkB = base(mk), prB = base(pr);
  let authored = "";
  const edgeOf = r => { const st = r.style || {}; return st.outline && /1\.5px/.test(st.outline) ? st.outline : st.border && /1\.5px/.test(st.border) ? st.border : ""; };
  for (const ss of document.styleSheets) { try { for (const r of ss.cssRules) { if (r.style && /#q > \.ff#ff|mparts/.test(r.selectorText || "")) { const e = edgeOf(r); if (e) authored = e; } } } catch { /* cross-origin */ } }
  const useOutline = cs && cs.outlineStyle !== "none";
  return {
    kind: multi ? "multi" : "single",
    h: b && b.height, ow: cs && cs.outlineWidth, os: cs && cs.outlineStyle, ocol: cs && cs.outlineColor, authored,
    edgeW: !cs ? null : useOutline ? cs.outlineWidth : cs.borderTopWidth, edgeStyle: !cs ? null : useOutline ? cs.outlineStyle : cs.borderTopStyle,
    edgeCol: !cs ? null : useOutline ? cs.outlineColor : cs.borderTopColor,
    transition: cs && cs.transitionDuration, animation: cs && cs.animationName,
    font: inp && getComputedStyle(inp).fontFamily, fsize: inp && getComputedStyle(inp).fontSize, fweight: inp && getComputedStyle(inp).fontWeight,
    unit: !!(box && box.querySelector(".unit")), unitSize: box && box.querySelector(".unit") && getComputedStyle(box.querySelector(".unit")).fontSize,
    unitFamily: box && box.querySelector(".unit") && getComputedStyle(box.querySelector(".unit")).fontFamily,
    mk: mk ? mk.innerText : null, mkSize: mk && getComputedStyle(mk).fontSize, mkFamily: mk && getComputedStyle(mk).fontFamily,
    mkWeight: mk && getComputedStyle(mk).fontWeight, mkTt: mk && getComputedStyle(mk).textTransform, mkColor: mk && getComputedStyle(mk).color,
    prSize: pr && getComputedStyle(pr).fontSize, prLh: pr && getComputedStyle(pr).lineHeight, prMb: pr && getComputedStyle(pr).marginBottom,
    mkBase: mkB && mkB.line, prBase: prB && prB.line, mkGlyph: mkB && mkB.glyph, prGlyph: prB && prB.glyph, valueBase, maxW: cs && cs.maxWidth,
    skin: cs && { bg: cs.backgroundColor, bw: cs.borderTopWidth, bs: cs.borderTopStyle, bc: cs.borderTopColor, sh: cs.boxShadow, r: cs.borderRadius, pr: cs.paddingRight, h: b && b.height, w: b && b.width },
    boxW: b && b.width, boxLeft: b && b.left, boxRight: b && b.right, boxTop: b && b.top,
    key: k && { w: k.width, h: k.height, left: k.left, top: k.top, right: k.right },
    mc: c && { w: c.width, h: c.height, inChk: !!mc.closest(".chk") },
    overflow: document.documentElement.scrollWidth - innerWidth,
  };
};
const near = (a, b, px = 0.6) => a != null && b != null && Math.abs(a - b) <= px;
const skinOf = (page, sel) => page.evaluate(s => {
  const e = document.querySelector(s); if (!e) return null;
  const c = getComputedStyle(e), r = e.getBoundingClientRect();
  return { bg: c.backgroundColor, bw: c.borderTopWidth, bs: c.borderTopStyle, bc: c.borderTopColor, sh: c.boxShadow, r: c.borderRadius, pr: c.paddingRight, h: r.height, w: r.width, top: r.top, left: r.left, right: r.right };
}, sel);
/* IB-3: hold a typed grade open. The uploaded bank grades on device (app.js check -> gradeLocal), so for the IB-3 steps this
   page's stemOffline.has says "not mine" for the named codes: the app then makes its real POST /check, which page.route holds
   until release() (then a plain correct verdict comes back). The html.grading wait, the readOnly input and the ring are the app's own. */
async function holdGrade(page, codes, reply = { verdict: "correct", triesLeft: 1 }) {   // IB-4: reply picks the verdict (right / wrong + hint)
  let release; const held = new Promise(f => { release = f; });
  await page.evaluate(cs => {
    window.__ib3has = window.stemOffline.has;
    window.stemOffline.has = c => cs.indexOf(c) >= 0 ? false : window.__ib3has(c);
  }, codes);
  await page.route("**/check", async r => {
    if (r.request().method() !== "POST") return r.continue();
    await held;
    await r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(reply) });
  });
  return {
    release,
    async done() {
      await page.unroute("**/check");
      await page.evaluate(() => { if (window.__ib3has) { window.stemOffline.has = window.__ib3has; delete window.__ib3has; } });
    },
  };
}
/* IB-4: a PNG has no decoder in node's stdlib, so read IHDR + IDAT and inflate the RGBA rows (the tool's px diff, in the smoke). */
const pngOf = buf => {
  let p = 8, w = 0, h = 0, ct = 0, bd = 8; const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString("ascii", p + 4, p + 8), d = buf.subarray(p + 8, p + 8 + len);
    p += 12 + len;
    if (type === "IHDR") { w = d.readUInt32BE(0); h = d.readUInt32BE(4); bd = d[8]; ct = d[9]; }
    else if (type === "IDAT") idat.push(d);
  }
  if (bd !== 8) throw new Error("PNG bit depth " + bd);
  const bpp = ct === 6 ? 4 : ct === 2 ? 3 : ct === 4 ? 2 : 1, stride = w * bpp, raw = inflateSync(Buffer.concat(idat)), out = Buffer.alloc(h * stride);
  for (let y = 0, q = 0; y < h; y++) {
    const f = raw[q++], row = raw.subarray(q, q + stride); q += stride;
    const prev = y ? out.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride), cur = out.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0, b = prev[x], c = x >= bpp ? prev[x - bpp] : 0; let v = row[x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      cur[x] = v & 255;
    }
  }
  return { w, h, bpp, data: out };
};
const pxDiff = (a, b) => {
  if (a.w !== b.w || a.h !== b.h) return -1;
  let n = 0;
  for (let i = 0; i < a.data.length; i += a.bpp) if (a.data[i] !== b.data[i] || a.data[i + 1] !== b.data[i + 1] || a.data[i + 2] !== b.data[i + 2] || (a.bpp > 3 && a.data[i + 3] !== b.data[i + 3])) n++;
  return n;
};
/* IB-4: the RENDERED max luma of an element (Rec.709), so a dim is measured in pixels, not by one element's opacity. */
const maxLuma = async (page, sel) => {
  const p = pngOf(await page.locator(sel).screenshot());
  let m = 0;
  for (let i = 0; i < p.data.length; i += p.bpp) {
    const l = .2126 * p.data[i] + .7152 * p.data[i + 1] + .0722 * p.data[i + 2];
    if (l > m) m = l;
  }
  return +m.toFixed(1);
};
/* IB-4b: the verdict icon after the ring closes (display/opacity/24px grid/17.5 inset/2.25 stroke). */
const iconOf = (page, sel = "#q .ff") => page.evaluate(s => {
  const ff = document.querySelector(s), vk = ff && ff.querySelector(":scope > .vk"), svg = vk && vk.querySelector("svg.ico");
  const cs = vk && getComputedStyle(vk), ss = svg && getComputedStyle(svg), unit = ff && ff.querySelector(".unit");
  const r = vk && vk.getBoundingClientRect(), ur = unit && unit.getBoundingClientRect();
  return vk ? { display: cs.display, opacity: +cs.opacity, w: +r.width.toFixed(1), h: +r.height.toFixed(1), right: cs.right,
    stroke: ss ? ss.strokeWidth : null, vkLeft: +r.left.toFixed(1), unitRight: ur ? +ur.right.toFixed(1) : null, data: vk.dataset.v } : null;
}, sel);
/* finish a paused sweep so strip.js's finished promise adds .ib4-done (the icon's signal) */
const finishRing = page => page.evaluate(() => document.querySelectorAll("#q .ib4-arc").forEach(el => el.getAnimations().forEach(a => a.finish())));
/* IB-7: the mock's own gap, box (now: the grey hint under it) bottom -> hint card top. PICK-soft-lift.src.html, #states [data-force="wrong"]:
   the hint's margin-top is 12 and the field row ends at the box, measured 12 at 390 and 1280. */
const MOCK_GAP = 12;
const hintGapOf = page => page.evaluate(() => {
  const multi = document.querySelector("#q .mparts .part.hinted");
  const box = multi ? multi.querySelector(".ff") : document.querySelector("#q > .ff#ff");
  const card = multi ? multi.querySelector(".phint .cluck") : document.querySelector("#fb > .cluck");
  if (!box || !card) return { err: "no box or hint card", box: !!box, card: !!card };
  /* HINT UNDER THE BOX (Tony Nov 25): the grey .phow line sits between the box and the miss card; the card is measured from it (from the box when there is none) */
  const grey = multi ? multi.querySelector(".phow") : document.querySelector("#q > .phow");
  const b = (grey && getComputedStyle(grey).display !== "none" ? grey : box).getBoundingClientRect(), c = card.getBoundingClientRect();
  return { gap: +(c.top - b.bottom).toFixed(1), boxBottom: +b.bottom.toFixed(1), cardTop: +c.top.toFixed(1), inPhint: !!card.closest(".phint"), grey: !!grey };
});
/* IB-4: the aurora's current head angle (the .ib3-spin rotation); the verdict ring must start there. */
const auroraAt = page => page.evaluate(() => {
  const s = document.querySelector("#q .ib3-ring .ib3-spin, #q .mparts .part .ib3-ring .ib3-spin");
  if (!s) return null;
  const cs = getComputedStyle(s).transform, m = new DOMMatrix(cs === "none" ? "matrix(1,0,0,1,0,0)" : cs);
  let a = Math.atan2(m.b, m.a) * 180 / Math.PI; return a < 0 ? a + 360 : a;
});
/* IB-4: the verdict ring's arcs at time t (pauses the WAAPI sweep there), plus the union coverage in degrees. */
const ringAt = (page, t) => page.evaluate(t => {
  const ring = document.querySelector("#q .ib4-ring");
  if (!ring) return null;
  const ff = ring.parentElement;
  const arcs = [...ring.querySelectorAll(".ib4-arc")].map(el => {
    const an = el.getAnimations();
    if (t != null) an.forEach(a => { a.pause(); a.currentTime = t; });
    const cs = getComputedStyle(el).transform, m = new DOMMatrix(cs === "none" ? "matrix(1,0,0,1,0,0)" : cs);
    let r = Math.atan2(m.b, m.a) * 180 / Math.PI; if (r < 0) r += 360;
    return { cls: el.className, len: +el.dataset.len, rot: r, anims: an.length,
      keys: an.map(a => ({ dur: a.effect.getTiming().duration, ease: a.effect.getTiming().easing, kf: a.effect.getKeyframes().map(k => ({ offset: k.offset, props: Object.keys(k).filter(n => ["offset", "computedOffset", "easing", "composite"].indexOf(n) < 0) })) })) };
  });
  const vk = ff.querySelector(":scope > .vk"), key = ff.querySelector(":scope > .send, :scope > #ansGo");
  const cs = getComputedStyle(ff), ks = key && getComputedStyle(key);
  return { a0: +ring.dataset.a0, v: ring.dataset.v, done: ring.classList.contains("ib4-done"), still: ring.classList.contains("ib4-still"),
    w: ff.offsetWidth, h: ff.offsetHeight, arcs,
    vkOp: vk ? +getComputedStyle(vk).opacity : null, vkAnim: vk ? getComputedStyle(vk).animationName : null,
    keyHidden: key ? !!key.hidden || getComputedStyle(key).display === "none" : null, keyOp: ks ? +ks.opacity : null,
    edge: { bw: cs.borderTopWidth, bs: cs.borderTopStyle, bc: cs.borderTopColor }, bg: cs.backgroundColor,
    tone: getComputedStyle(ring.querySelector(".ib4-a")).backgroundImage,
    hint: (() => { const h = ff.closest(".part") ? ff.closest(".part").querySelector(".phint .cluck") : document.querySelector("#fb > .cluck"); if (!h) return null;
      const c = getComputedStyle(h); return { bg: c.backgroundColor, r: c.borderTopLeftRadius, sh: c.boxShadow, anim: c.animationName, inPhint: !!h.closest(".phint") }; })() };
}, t);
const coverageOf = arcs => {
  const ints = [];
  for (const a of arcs) {
    const s = ((a.rot % 360) + 360) % 360, e = s + a.len;
    if (e <= 360) ints.push([s, e]); else { ints.push([s, 360]); ints.push([0, e - 360]); }
  }
  ints.sort((x, y) => x[0] - y[0]);
  let cov = 0, cs = null, ce = null;
  for (const [s, e] of ints) { if (ce == null || s > ce + 1e-6) { if (ce != null) cov += ce - cs; cs = s; ce = e; } else ce = Math.max(ce, e); }
  return ce == null ? 0 : cov + ce - cs;
};
/* the head's px along the outline at time t (C's head = its transform + its 4.3% arc), the same edge() mapping as strip.js */
const headAt = (page, t) => page.evaluate(t => {
  const ring = document.querySelector("#q .ib4-ring"); if (!ring) return null;
  const ff = ring.parentElement, C = ring.querySelector(".ib4-c"), a0 = parseFloat(ring.dataset.a0);
  const w = ff.offsetWidth, h = ff.offsetHeight, P = 2 * (w + h);
  const ang = s => { s = ((s % P) + P) % P; let x, y;
    if (s < w / 2) { x = s; y = -h / 2; } else if (s < w / 2 + h) { x = w / 2; y = s - w / 2 - h / 2; }
    else if (s < 1.5 * w + h) { x = w / 2 - (s - w / 2 - h); y = h / 2; } else if (s < 1.5 * w + 2 * h) { x = -w / 2; y = h / 2 - (s - 1.5 * w - h); }
    else { x = s - 1.5 * w - 2 * h - w / 2; y = -h / 2; }
    const r = Math.atan2(x, -y) * 180 / Math.PI; return r < 0 ? r + 360 : r; };
  const pos = a => { a = ((a % 360) + 360) % 360; let lo = 0, hi = P; for (let i = 0; i < 24; i++) { const m = (lo + hi) / 2; if (ang(m) < a) lo = m; else hi = m; } return lo; };
  const an = C.getAnimations()[0]; if (t != null) { an.pause(); an.currentTime = t; }
  const cs = getComputedStyle(C).transform, m = new DOMMatrix(cs === "none" ? "matrix(1,0,0,1,0,0)" : cs);
  let r = Math.atan2(m.b, m.a) * 180 / Math.PI; if (r < 0) r += 360;
  const head = r + parseFloat(C.dataset.len), s0 = pos(a0);
  let d = pos(head) - s0; if (d < 0) d += P;
  if (t === 0) d = 0;
  return { t, s: +d.toFixed(3), P, w, h, lap: Math.min(2600, Math.max(1600, P / .475)) };
}, t);
/* IB-3: sample the ring's rotating layer at 8 equal times over one lap; head px = the perimeter distance of the gradient's from
   angle (mock tools/ring-speed.cjs). Returns the 8 px steps; even speed = every step is P/8. */
const speedOf = (page, wantW) => page.evaluate(async wantW => {
  const ff = document.querySelector("#q > .ff#ff");
  ff.style.maxWidth = "none"; ff.style.width = wantW + "px";
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));   // the ResizeObserver rebuild
  const spin = ff.querySelector(".ib3-ring .ib3-spin"), w = ff.offsetWidth, h = ff.offsetHeight, P = 2 * (w + h);
  const an = spin && spin.getAnimations().slice(-1)[0];
  if (!an) return { w, h, P, steps: [] };
  const ang = s => {
    s = ((s % P) + P) % P; let x, y;
    if (s < w / 2) { x = s; y = -h / 2; } else if (s < w / 2 + h) { x = w / 2; y = s - w / 2 - h / 2; }
    else if (s < 1.5 * w + h) { x = w / 2 - (s - w / 2 - h); y = h / 2; }
    else if (s < 1.5 * w + 2 * h) { x = -w / 2; y = h / 2 - (s - 1.5 * w - h); }
    else { x = s - 1.5 * w - 2 * h - w / 2; y = -h / 2; }
    const t = Math.atan2(x, -y) * 180 / Math.PI; return t < 0 ? t + 360 : t;
  };
  const pos = a0 => { a0 = ((a0 % 360) + 360) % 360; let lo = 0, hi = P; for (let i = 0; i < 24; i++) { const m = (lo + hi) / 2; if (ang(m) < a0) lo = m; else hi = m; } return lo; };
  an.pause();
  const lap = an.effect.getTiming().duration, s = [];
  for (let i = 0; i <= 8; i++) {
    an.currentTime = lap * i / 8;
    const cs = getComputedStyle(spin).transform, m = new DOMMatrix(cs === "none" ? "matrix(1,0,0,1,0,0)" : cs);
    let r = Math.atan2(m.b, m.a) * 180 / Math.PI; if (r < 0) r += 360;
    s.push(pos(r));
  }
  an.play();
  const steps = [];
  for (let i = 0; i < 8; i++) { let d = s[i + 1] - s[i]; if (d < 0) d += P; steps.push(+d.toFixed(2)); }
  return { w, h, P, lap, steps };
}, wantW);
/* IB-2: the whole focus motion contract in one read */
const liftOf = (page, sel) => page.evaluate(s => {
  const e = document.querySelector(s), c = getComputedStyle(e);
  return { tr: c.transform, sh: c.boxShadow, bc: c.borderTopColor, bw: c.borderTopWidth, r: c.borderTopLeftRadius,
    dur: c.transitionDuration, ease: c.transitionTimingFunction, prop: c.transitionProperty };
}, sel);
/* the focus edge is an edge: >= 3:1 against the card, composited over the field's own ground */
const edgeRatio = (page, sel) => page.evaluate(s => {
  const el = document.querySelector(s), cs = getComputedStyle(el);
  const cv = document.createElement("canvas"); cv.width = cv.height = 1;
  const cx = cv.getContext("2d", { willReadFrequently: true });
  const parse = t => { cx.clearRect(0, 0, 1, 1); cx.fillStyle = "#000"; cx.fillStyle = String(t); cx.fillRect(0, 0, 1, 1); const d = cx.getImageData(0, 0, 1, 1).data; return { r: d[0], g: d[1], b: d[2], a: d[3] / 255 }; };
  const over = (f, b) => ({ r: f.r * f.a + b.r * (1 - f.a), g: f.g * f.a + b.g * (1 - f.a), b: f.b * f.a + b.b * (1 - f.a) });
  const L = c => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }; return .2126 * f(c.r) + .7152 * f(c.g) + .0722 * f(c.b); };
  const ratio = (a, b) => { const x = L(a), y = L(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
  const bgOf = e => { const p = parse(getComputedStyle(e).backgroundColor); return p.a > 0 ? p : null; };
  const card = el.closest(".p") || document.querySelector("#q");
  const surround = bgOf(card) || bgOf(document.body) || bgOf(document.documentElement) || parse("#02040d");
  const edge = parse(cs.borderTopColor), fill = parse(cs.backgroundColor);
  return { ratio: edge && fill && surround ? ratio(over(edge, fill), surround) : null, edge: cs.borderTopColor, fill: cs.backgroundColor, surround: `rgb(${surround.r} ${surround.g} ${surround.b})` };
}, sel);
/* EDGE (Nov 25 token fix): the typed field's edge is the SOLID --line, not an alpha tint of it (87% failed 3:1: 2.99 page /
   2.76 card / 2.91 field; solid = 3.64 / 3.25 / 3.49). Compares the computed border colour to a probe painted var(--line);
   canvas gives the alpha, so a color-mix tint cannot pass. */
const edgeLine = (page, sel) => page.evaluate(s => {
  const ff = document.querySelector(s), cv = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  const rgba = t => { cv.clearRect(0, 0, 1, 1); cv.fillStyle = "#000"; cv.fillStyle = String(t); cv.fillRect(0, 0, 1, 1); const d = cv.getImageData(0, 0, 1, 1).data; return { rgb: d[0] + "," + d[1] + "," + d[2], a: d[3] }; };
  const probe = document.createElement("i"); probe.style.color = "var(--line)"; ff.append(probe);
  const line = getComputedStyle(probe).color; probe.remove();
  const bc = getComputedStyle(ff).borderTopColor, e = rgba(bc), l = rgba(line);
  const near3 = (a, b) => a.split(",").every((v, i) => Math.abs(+v - +b.split(",")[i]) <= 3);
  return { bc, line, eq: near3(e.rgb, l.rgb) && Math.abs(e.a - 102) <= 3 && l.a === 255, alpha: e.a };   // SINK (Tony Nov 25): the resting edge is --line at 40% (alpha 102), soft and low contrast
}, sel);
const SCALE = "matrix(1.014, 0, 0, 1.014, 0, 0)";
async function shot(page, name, sel) {
  if (!SHOTS) return;
  try { await page.locator(sel).first().screenshot({ path: join(SHOTS, name) }); }
  catch (e) { console.log("shot skip", name, e.message.slice(0, 120)); }
}
for (const vp of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
  const w = vp.width, { ctx, page } = await fresh(true, vp);
  await step(`${w}: IB-5 multi key outside the box`, async () => {
    await go(page, "PSY_K1A");
    await page.mouse.move(0, 0);
    const empty = await page.evaluate(() => [...document.querySelectorAll("#q .mparts .part")].map(p => {
      const ff = p.querySelector(".ff"), key = p.querySelector(".send"), r = ff.getBoundingClientRect();
      return { w: r.width, top: r.top, right: r.right, hidden: key.hidden || getComputedStyle(key).display === "none", dis: key.disabled, op: +getComputedStyle(key).opacity, kw: key.getBoundingClientRect().width };
    }));
    /* KEY-ALL (Tony Nov 25): every open part shows its key; an empty box dims it and makes it inert (disabled), the slot stays 60px */
    assert.deepEqual(empty.map(p => p.hidden), [false, false], "an empty part shows its key, dimmed: " + JSON.stringify(empty));
    assert.ok(empty.every(p => p.dis && p.op < 0.6 && near(p.kw, 60)), "an empty part's key is inert + dimmed in the 60px slot: " + JSON.stringify(empty));
    assert.ok(empty[0].w > 0, "the multi field measured");
    await shot(page, `ib5-${w}-empty-app.png`, "#q");
    const boxW = empty[0].w;
    await page.fill("#q .mparts .part[data-i='0'] input.ans", "17");
    await page.waitForFunction(() => !document.querySelector("#go0").disabled);
    await page.waitForFunction(() => +getComputedStyle(document.querySelector("#go0")).opacity >= .999, null, { timeout: 2000 });   // the key eases .35 -> 1 over .15s (#759, verdict-v7 §ib5-key): wait for it, a fixed sleep lost under load
    const typed = await page.evaluate(() => {
      const p = document.querySelector("#q .mparts .part[data-i='0']"), ff = p.querySelector(".ff"), key = p.querySelector(".send");
      const f = ff.getBoundingClientRect(), k = key.getBoundingClientRect(), cs = getComputedStyle(key);
      return { fw: f.width, fl: f.left, fr: f.right, ft: f.top, kw: k.width, kh: k.height, kl: k.left, kt: k.top,
        bg: cs.backgroundColor, r: cs.borderTopLeftRadius, bHidden: document.querySelector("#go1").disabled && !document.querySelector("#go1").hidden, kop: +getComputedStyle(document.querySelector("#go0")).opacity,
        overflow: document.documentElement.scrollWidth - innerWidth };
    });
    assert.equal(typed.bHidden, true, "the other part's key stays visible but inert");
    assert.equal(typed.kop, 1, "a typed part's key is full");
    assert.ok(near(typed.kw, 60, 1.2) && near(typed.kh, 60, 1.2), `key ${typed.kw}x${typed.kh} (want 60x60; the focused field lifts x1.014 and the key rides in it)`);
    assert.ok(typed.kl >= typed.fr + 8, `key is not outside the box: left ${typed.kl} vs box right ${typed.fr}`);
    assert.ok(typed.kl >= typed.fr + 11 && typed.kl <= typed.fr + 14, `key gap ${(typed.kl - typed.fr).toFixed(1)} (want 12)`);
    assert.ok(near(typed.kt, typed.ft, 1.5), `key is level with the box: ${typed.kt} vs ${typed.ft}`);
    assert.ok(Math.abs(typed.fw - boxW) <= boxW * .015 + .1, `box width jumps while typing: ${typed.fw} vs ${boxW} (x1.014 focus lift allowed)`);
    if (w >= 900) {   // Tony Nov 25: the multi field is 1fr, not 400px: no empty gap, it fills the row between the prompt and the 60px key column
      const row = await page.evaluate(() => { const p = document.querySelector("#q .mparts .part[data-i='0']"), cs = getComputedStyle(p), pr = p.querySelector(".pr").getBoundingClientRect();
        return { right: p.getBoundingClientRect().right - parseFloat(cs.paddingRight) - parseFloat(cs.borderRightWidth), prRight: pr.right, prBottom: pr.bottom }; });
      /* the focused field lifts x1.014 and the key rides in it (<= ~3.5px at 1280), and the box is pulled 2px out (--part-optical) */ assert.ok(near(typed.kl + typed.kw, row.right, 4), `multi key's right edge ${typed.kl + typed.kw} sits on the row's right edge ${row.right}`);
      assert.ok(typed.ft >= row.prBottom, `prompt ON TOP of its box at every width (Tony Nov 25): box top ${typed.ft} vs prompt bottom ${row.prBottom}`);
    }
    assert.ok(typed.overflow <= 0, `sideways overflow ${typed.overflow}px at ${w}`);
    assert.match(typed.r, /^(18|22\.5)px$/, `key squircle radius ${typed.r}`);
    await page.locator("#q .mparts .part[data-i='0'] input.ans").click();   // a real pointer: no keyboard focus ring in the shot (the mouse look)
    await shot(page, `ib5-${w}-typed-app.png`, "#q");
    const hold = await holdGrade(page, ["PSY_K1A"], { verdict: "wrong", triesLeft: 1, hint: "QUACK. Count both circles once." });
    let grading, wrong;
    try {
      await page.press("#q .mparts .part[data-i='0'] input.ans", "Enter");   // Enter still submits THIS part
      await page.waitForFunction(() => document.documentElement.classList.contains("grading"), null, { timeout: 5000 });
      await page.waitForFunction(() => +getComputedStyle(document.querySelector("#q .mparts .part[data-i='0'] .send")).opacity < 1, null, { timeout: 2000 });   // opacity eases .15s (#759)
      grading = await page.evaluate(() => {
        const p = document.querySelector("#q .mparts .part[data-i='0']"), key = p.querySelector(".send"), ff = p.querySelector(".ff");
        const k = key.getBoundingClientRect(), f = ff.getBoundingClientRect(), cs = getComputedStyle(key);
        return { op: +cs.opacity, after: getComputedStyle(key, "::after").content, show: cs.visibility,
          kl: k.left, fr: f.right, hidden: key.hidden };
      });
      assert.equal(grading.hidden, false, "the key stays up while its part is graded");
      assert.ok(grading.op < 1, `grading only dims the key: opacity ${grading.op}`);
      assert.equal(grading.after, "none", "no spinner on the typed key");
      assert.equal(grading.show, "visible", "the arrow stays visible while grading");
      assert.ok(grading.kl >= grading.fr + 8, `the key stays outside while grading: ${grading.kl} vs ${grading.fr}`);
      hold.release();
      await page.waitForSelector("#q .mparts .part[data-i='0'] .ff.bad", { timeout: 5000 });
      wrong = await page.evaluate(() => {
        const p = document.querySelector("#q .mparts .part[data-i='0']"), key = p.querySelector(".send"), ff = p.querySelector(".ff");
        const k = key.getBoundingClientRect(), f = ff.getBoundingClientRect();
        return { op: +getComputedStyle(key).opacity, hidden: key.hidden, kl: k.left, fr: f.right };
      });
      assert.equal(wrong.hidden, false, "a wrong part keeps its key (IB-4)");
      assert.ok(wrong.op < 1, `a wrong part's key is dimmed: ${wrong.op}`);
      assert.ok(wrong.kl >= wrong.fr + 8, "the dimmed key stays outside");
      await page.waitForTimeout(800);   // the shot shows the settled verdict (ring closed + tick/cross faded in), as the mock does
      await shot(page, `ib5-${w}-wrong-app.png`, "#q");
      await page.locator("#q .mparts .part[data-i='0'] input.ans").press("1");
      await page.waitForFunction(() => !document.querySelector("#q .mparts .part[data-i='0'] .ff.bad"));
      await page.waitForTimeout(260);   // opacity eases .15s (#759)
      assert.equal(await page.evaluate(() => +getComputedStyle(document.querySelector("#go0")).opacity), 1, "the next keystroke restores the key");
    } finally {
      hold.release();
      await page.waitForFunction(() => !document.documentElement.classList.contains("grading"), null, { timeout: 8000 }).catch(() => {});
      await hold.done();
    }
    await page.fill("#q .mparts .part[data-i='0'] input.ans", "14");
    await page.press("#q .mparts .part[data-i='0'] input.ans", "Enter");
    await page.waitForSelector("#q .mparts .part[data-i='0'] .ff.ok", { timeout: 8000 });
    const shut = await page.evaluate(() => ({ hidden: document.querySelector("#go0").hidden, ok: document.querySelector("#q .mparts .part[data-i='0'] .ff").classList.contains("ok") }));
    assert.equal(shut.ok, true, "a right part is shut");
    assert.equal(shut.hidden, true, "a shut part shows no key");
    return `box ${boxW.toFixed(1)} key ${typed.kw}x${typed.kh} gap ${(typed.kl - typed.fr).toFixed(1)} grading ${grading.op} wrong ${wrong.op}`;
  });
  await step(`${w}: multi field at rest`, async () => {
    await go(page, "PSY_M1A");
    await page.mouse.move(0, 0);   // IB-5 runs first and leaves the pointer on the field: idle must be measured with the pointer away
    const m = await page.evaluate(MET);
    const mEdge = await edgeLine(page, "#q .mparts .part > .ff");   // idle, before the hover probe below
    /* aim at the FIELD, not .part: since IB-5 the part centre sits ~1px under the field's top edge (the key column moved it),
       so the old proxy can hover the prompt/gap instead of the box. */
    await page.locator("#q .mparts .part > .ff").first().hover().catch(() => {});
    const hoverCol = await page.evaluate(() => { const s = getComputedStyle(document.querySelector("#q .mparts .part > .ff")); return s.outlineStyle !== "none" ? s.outlineColor : s.borderTopColor; });
    assert.equal(m.kind, "multi");
    assert.ok(near(m.h, 60), `field height ${m.h} (want 60)`);
    assert.equal(m.edgeStyle, "solid", `edge style ${m.edgeStyle}`);
    assert.match(m.authored, /1\.5px/, `authored edge ${m.authored}`);
    assert.ok(m.edgeW === "1.5px" || m.edgeW === "1px", `computed edge width ${m.edgeW} (Chromium rounds 1.5px to 1)`);
    assert.ok(mEdge.eq, `multi rest edge is the soft --line at alpha .4: ${mEdge.bc} vs ${mEdge.line} (alpha ${mEdge.alpha})`);
    assert.match(m.transition, /0\.18s/, `IB-2 transition at rest ${m.transition} (#759 feel-better, Tony: focus lift .42s -> .18s)`);
    assert.equal(m.animation, "none", `no animation at rest (${m.animation})`);
    assert.match(m.font, /Atkinson/i, "value face is Atkinson: " + m.font);
    assert.equal(m.fweight, "600", `value weight ${m.fweight}`);
    assert.equal(m.mk, "A", `letter is bare + upper-cased by CSS (#759, Tony Nov 25): ${JSON.stringify(m.mk)}`);
    assert.equal(m.mkSize, "16px", `letter size ${m.mkSize}`);   // the ONE shared answer letter (app.css --ans-letter-*: --fs-0 16px, 600, uppercase, --ink-qnum; MC / pick-all / typed multi, Tony Nov 26)
    assert.equal(m.mkWeight, "600", `letter weight ${m.mkWeight} (shared answer letter)`);
    assert.equal(m.mkTt, "uppercase", `letter transform ${m.mkTt} (shared answer letter)`);
    assert.equal(m.mkColor, "rgb(122, 138, 174)", `letter colour ${m.mkColor} (--ink-qnum, shared answer letter)`);
    assert.match(m.mkFamily, /Atkinson/i, "letter face is the typed-answer face --font-input (Atkinson; Tony: fonts unchanged): " + m.mkFamily);
    assert.ok(near(m.mkBase, m.prBase, 1), `letter/prompt line baselines ${m.mkBase} vs ${m.prBase}`);
    assert.ok(near(m.mkGlyph, m.prGlyph, 1), `letter/prompt GLYPH baselines ${m.mkGlyph} vs ${m.prGlyph}`);
    const hang = await page.evaluate(() => { const p = document.querySelector("#q .mparts .part"), mk = p.querySelector(".mk"), pr = p.querySelector(".pr"); return { part: p.getBoundingClientRect().left, mk: mk.getBoundingClientRect().left, pr: pr.getBoundingClientRect().left }; });
    assert.ok(near(hang.mk, hang.part, .5), `the typed letter hangs on the part edge: ${hang.mk} vs ${hang.part}`);
    assert.ok(near(hang.pr - hang.mk, 22, 1), `typed hang column ${(hang.pr - hang.mk).toFixed(1)} (want 22 = 18 + --s1)`);
    // Tony Nov 25: the prompt is above the box at every width, so there is no shared value/prompt baseline any more
    assert.equal(m.prSize, "16px", `prompt size ${m.prSize}`);   // typescale Major Third, Tony Nov 25 (was 17px)
    assert.equal(m.prLh, "24px", `prompt leading ${m.prLh}`);
    assert.ok(parseFloat(m.skin.pr) <= 20, `multi field right padding ${m.skin.pr} (IB-5: the key moved outside, no in-box room)`);
    assert.ok(m.overflow <= 0, `sideways overflow ${m.overflow}px at ${w}`);
    if (w < 900) {   // IB-5: the phone prompt keeps the mock's full text width (it spans the key column)
      const row = await page.evaluate(() => { const p = document.querySelector("#q .mparts .part"), pr = p.querySelector(".pr"); return { part: p.getBoundingClientRect().width, pr: pr.getBoundingClientRect().width }; });
      /* 22px hang column (18 + --s1, #759 B letter); the key column is part of the prompt span */ assert.ok(near(row.pr, row.part - 22, 1), `phone prompt spans the key column: ${row.pr} vs part ${row.part}`);
    }
    assert.notEqual(hoverCol, m.edgeCol, "hover changes the edge (idle -> hover)");
    await page.locator("#q .mparts .part:first-child input.ans").focus();
    await page.waitForTimeout(520);
    const focus = await liftOf(page, "#q .mparts .part:first-child .ff");
    const liftR = await page.evaluate(() => CSS.supports("corner-shape", "superellipse(2)") ? "22.5px" : "18px");
    assert.equal(focus.tr, SCALE, `focus lifts in place (IB-2): ${focus.tr}`);
    assert.equal(focus.r, liftR, `focus keeps the Soft-lift squircle (${focus.r}, want ${liftR})`);
    assert.equal(focus.bw, "1px", `focus keeps the 1.5px edge: ${JSON.stringify(focus)}`);
    assert.match(focus.sh, /0px 1px 0px 0px inset/, "focus: the lit top edge: " + focus.sh);
    assert.match(focus.sh, /0px 0px 0px 0\.5px/, "focus: the .5px halo edge: " + focus.sh);
    assert.match(focus.sh, /0px 12px 26px -8px/, "focus: the shadow straight underneath: " + focus.sh);
    assert.doesNotMatch(focus.sh, /rgba\(0, 0, 0, 0\.45\) 0px 2px 3px 0px inset/, "focus: the old well is gone: " + focus.sh);
    assert.notEqual(focus.bc, m.edgeCol, "focus turns the edge --action");
    const multiEdge = await edgeRatio(page, "#q .mparts .part:first-child .ff");
    assert.ok(multiEdge.ratio >= 3, `focus edge reaches 3:1: ${multiEdge.ratio && multiEdge.ratio.toFixed(2)} (${multiEdge.edge} over ${multiEdge.fill} vs ${multiEdge.surround})`);
    await page.evaluate(() => document.activeElement?.blur());
    await page.locator("#q .mparts .part:first-child input.ans").focus();
    await page.locator("#q .mparts .part:first-child input.ans").fill("17");
    await page.locator("#q .mparts .part:first-child input.ans").click();   // a real pointer: no keyboard ring in the shot (the mouse look)
    await shot(page, `multi-${w}-app.png`, "#q");
    await page.evaluate(() => document.activeElement?.blur());
    const idle = m.skin;
    await page.fill("#q .mparts .part:first-child input.ans", "17");
    await page.press("#q .mparts .part:first-child input.ans", "Enter");
    await page.waitForSelector("#q .mparts .part:first-child .ff.bad", { timeout: 6000 });
    const bad = await skinOf(page, "#q .mparts .part:first-child .ff");
    assert.equal(bad.bg, idle.bg, `multi wrong ground = the resting ground (SPEC §7 BACKGROUND) (${bad.bg})`);
    assert.ok(bad.bw === "0px" || bad.bs === "none", `multi wrong edge is still the resting 1.5px border (${bad.bw} ${bad.bs})`);
    assert.notEqual(bad.sh, idle.sh, "multi wrong keeps the inset dish instead of the verdict raise");
    return `h ${m.h} edge ${m.edgeW} gap ${m.overflow} line ${m.mkBase}/${m.prBase} glyph ${m.mkGlyph}/${m.prGlyph}${w >= 900 ? " value " + m.valueBase : ""} bad ${bad.bg} ${bad.bw}`;
  });
  await step(`${w}: single field at rest + key outside`, async () => {
    await go(page, "PSY_S1A");
    await page.mouse.move(0, 0);   // the pointer may sit where the multi field was: rest must be measured away from the box
    const m = await page.evaluate(MET);
    const sEdge = await edgeLine(page, "#q > .ff#ff");
    assert.equal(m.kind, "single");
    assert.ok(near(m.h, 60), `field height ${m.h} (want 60)`);
    assert.equal(m.edgeStyle, "solid", `edge style ${m.edgeStyle}`);
    assert.match(m.authored, /1\.5px/, `authored edge ${m.authored}`);
    assert.ok(m.edgeW === "1.5px" || m.edgeW === "1px", `computed edge width ${m.edgeW} (Chromium rounds 1.5px to 1)`);
    assert.ok(sEdge.eq, `single rest edge is the soft --line at alpha .4: ${sEdge.bc} vs ${sEdge.line} (alpha ${sEdge.alpha})`);
    assert.match(m.transition, /0\.18s/, `IB-2 transition at rest ${m.transition} (#759 feel-better, Tony: focus lift .42s -> .18s)`);
    assert.equal(m.animation, "none", `no animation at rest (${m.animation})`);
    assert.match(m.font, /Atkinson/i, "value face is Atkinson: " + m.font);
    assert.equal(m.fsize, "25px", `value size ${m.fsize}`);   // typescale Major Third, Tony Nov 25 (was 28px)
    assert.equal(m.fweight, "600", `value weight ${m.fweight}`);
    assert.ok(m.unit, "the unit is in the box");
    assert.equal(m.unitSize, "16px", `unit size ${m.unitSize}`);   // typescale Major Third, Tony Nov 25 (was 17px)
    assert.match(m.unitFamily, /Atkinson/i, "unit face is Atkinson: " + m.unitFamily);
    assert.ok(m.key, "the Check key is on the page");
    assert.ok(near(m.key.w, 60, 1.2) && near(m.key.h, 60, 1.2), `key ${m.key.w}x${m.key.h} (want 60x60; x1.014 while the field is focused)`);
    assert.ok(m.key.left >= m.boxRight + 11 && m.key.left <= m.boxRight + 13, `key sits 12px right of the box: ${m.key.left} vs ${m.boxRight}`);
    assert.ok(near(m.key.top, m.boxTop, 1), `key is level with the box: ${m.key.top} vs ${m.boxTop}`);
    if (w >= 900) {
      // Tony Nov 25: no 400px cap; the box fills the column and only the 60px key + 12px gap stay outside on its right
      assert.equal(m.maxW, "none", `single box max-width ${m.maxW} (no cap)`);
      const col = await page.evaluate(() => document.querySelector("#q > .ff#ff").parentElement.clientWidth);
      assert.ok(near(m.boxW, col - 72, 1), `single box ${m.boxW} wide: it fills the column ${col} minus the 72px key slot`);
    }
    assert.ok(m.overflow <= 0, `sideways overflow ${m.overflow}px at ${w}`);
    await page.locator("#ans").focus();
    await page.locator("#ans").fill("17");
    await page.locator("#ans").click();   // a real pointer: no keyboard ring in the shot (the mouse look)
    await shot(page, `single-${w}-app.png`, "#q");
    await page.evaluate(() => document.activeElement?.blur());
    return `h ${m.h} box ${m.boxW} key ${m.key.w}x${m.key.h} gap ${(m.key.left - m.boxRight).toFixed(1)}`;
  });
  await step(`${w}: IB-3 thinking: transform-only aurora, sink, readOnly input, typed key only dims`, async () => {
    await go(page, "PSY_T1A");
    await page.mouse.move(0, 0);   // no pointer hover: the rest edge is the authored IB-1 edge, not the hover edge
    const restEdge = await page.evaluate(() => getComputedStyle(document.querySelector("#q > .ff#ff")).borderTopColor);
    const hold = await holdGrade(page, ["PSY_T1A"]);
    try {
      await page.fill("#ans", "3.2"); await page.press("#ans", "Enter");
      await page.waitForFunction(() => document.documentElement.classList.contains("grading"), null, { timeout: 5000 });
      await page.waitForSelector("#q .ib3-ring .ib3-spin", { timeout: 3000 });
      await page.waitForTimeout(460);   // html.grading is 150 ms late; the sink is .42s
      const t = await page.evaluate(() => {
        const ff = document.querySelector("#q > .ff#ff"), inp = ff.querySelector("input.ans"), key = document.querySelector("#ansGo");
        const ring = ff.querySelector(".ib3-ring"), glow = ff.querySelector(".ib3-glow"), unit = ff.querySelector(".unit");
        const anims = [...ff.querySelectorAll(".ib3-spin")].flatMap(s => s.getAnimations());
        const keys = anims.map(a => (a.effect ? a.effect.getKeyframes() : []).map(k => Object.keys(k).filter(n => ["offset", "computedOffset", "easing", "composite"].indexOf(n) < 0)));
        const ka = getComputedStyle(key, "::after");
        const col = v => { const p = document.createElement("i"); p.style.color = v; ff.append(p); const c = getComputedStyle(p).color; p.remove(); return c; };
        return {
          tr: getComputedStyle(ff).transform, ro: inp.readOnly, busy: ff.getAttribute("aria-busy"),
          anims: anims.length, keys, names: anims.map(a => a.animationName || ""),
          spinBgs: [...ff.querySelectorAll(".ib3-spin")].map(s => getComputedStyle(s).backgroundImage),
          violet: col("var(--fig-violet-1, #8f78f5)"), correct: col("var(--correct)"),
          af: col("var(--action-fill)"), ac: col("var(--action)"), ao: col("var(--action-on)"),
          ringOp: +getComputedStyle(ring).opacity, ringPad: getComputedStyle(ring).paddingTop, rings: ff.querySelectorAll(".ib3-ring").length,
          glowFilter: getComputedStyle(glow).filter, glowOp: +getComputedStyle(glow).opacity,
          blur: getComputedStyle(inp).filter, blurUnit: unit ? getComputedStyle(unit).filter : "blur(0.8px)",
          keyOp: +getComputedStyle(key).opacity, after: ka.content, afterAnim: ka.animationName,
          arrow: getComputedStyle(key.querySelector(".ib1-go")).display,
          fv: ff.matches(":has(input:focus-visible)"), ol: getComputedStyle(ff).outlineStyle,
          ow: getComputedStyle(ff).outlineWidth, bc: getComputedStyle(ff).borderTopColor,
        };
      });
      assert.match(t.tr, /matrix\(0\.986\d*, 0, 0, 0\.986/, `the box sinks to .986: ${t.tr}`);
      assert.equal(t.fv, true, "precondition: the checking input keeps keyboard focus-visible");
      assert.ok(t.ol === "none" || parseFloat(t.ow) === 0, `thinking suppresses the focus-visible outline: ${t.ol} ${t.ow}`);
      assert.equal(t.bc, restEdge, `thinking edge is the RESTING edge, not --action: ${t.bc} vs ${restEdge}`);
      assert.equal(t.ro, true, "the typed input is readOnly while checking");
      assert.equal(t.busy, "true", "the checking field says aria-busy");
      assert.ok(t.anims >= 2, `the ring and its glow animate: ${t.anims}`);
      assert.ok(t.keys.length && t.keys.every(list => list.length > 1 && list.every(ks => ks.length === 1 && ks[0] === "transform")),
        "keyframes carry ONLY transform (no custom property): " + JSON.stringify(t.keys.slice(0, 1)).slice(0, 300));
      assert.ok(t.names.every(n => !n), "no CSS animation-name (Web Animations transform keyframes only): " + JSON.stringify(t.names));
      assert.equal(t.rings, 1, "one ring layer on the single box");
      assert.equal(t.ringOp, 1, `ring opacity ${t.ringOp}`);
      assert.equal(t.ringPad, "3.5px", `ring width ${t.ringPad} (want 3.5px)`);
      const flat = t.spinBgs.map(x => x.replace(/\s+/g, ""));
      assert.ok(flat.length >= 2, "the aurora and its glow copy are there: " + flat.length);
      for (const [i, bg] of flat.entries()) {
        assert.ok(!bg.includes(t.violet.replace(/\s+/g, "")), `spin ${i}: no fig-violet in the aurora (${t.violet}): ${bg.slice(0, 180)}`);
        assert.ok(!bg.includes(t.correct.replace(/\s+/g, "")), `spin ${i}: no verdict green in the aurora (${t.correct}): ${bg.slice(0, 180)}`);
        assert.ok(bg.includes(t.af.replace(/\s+/g, "")) && bg.includes(t.ac.replace(/\s+/g, "")) && bg.includes(t.ao.replace(/\s+/g, "")),
          `spin ${i}: the aurora is the action family (fill -> action -> on): ${bg.slice(0, 220)}`);
      }
      const th = await edgeLine(page, "#q > .ff#ff");
      assert.ok(th.eq, `thinking edge is the soft --line at alpha .4: ${th.bc} vs ${th.line} (alpha ${th.alpha})`);
      assert.equal(t.glowFilter, "blur(7px)", `glow filter ${t.glowFilter}`);
      assert.equal(t.glowOp, 0.45, `glow opacity ${t.glowOp}`);
      assert.equal(t.blur, "blur(0.8px)", `value blur ${t.blur}`);
      assert.equal(t.blurUnit, "blur(0.8px)", `unit blur ${t.blurUnit}`);
      assert.equal(t.after, "none", "typed Check has no ::after spinner");
      assert.equal(t.afterAnim, "none", `typed Check has no ring animation: ${t.afterAnim}`);
      assert.ok(t.keyOp < 1, `typed Check only dims: opacity ${t.keyOp}`);
      assert.equal(t.arrow, "block", "typed Check keeps its arrow");
      await shot(page, `single-${w}-thinking-app.png`, "#q");
    } finally {
      hold.release();
      await page.waitForFunction(() => !document.documentElement.classList.contains("grading") && !document.querySelector(".ib3-ring"), null, { timeout: 8000 }).catch(() => {});
      await hold.done();
    }
    const after = await page.evaluate(() => ({ ro: document.querySelector("#ans") && document.querySelector("#ans").readOnly, rings: document.querySelectorAll(".ib3-ring, .ib3-glow").length }));
    assert.notEqual(after.ro, true, "readOnly clears when the grade lands");
    assert.equal(after.rings, 0, "the ring layers leave when the grade lands");
    return "transform-only ring, sink, readOnly";
  });
  await step(`${w}: IB-2 single focus lift: scale in place, edge --action, shadow underneath`, async () => {
    await go(page, "PSY_S1A");
    const sel = "#q > .ff#ff";
    const rest = await liftOf(page, sel);
    await page.locator("#ans").focus();
    await page.waitForTimeout(520);
    const f = await liftOf(page, sel);
    const liftR = await page.evaluate(() => CSS.supports("corner-shape", "superellipse(2)") ? "22.5px" : "18px");
    assert.equal(f.tr, SCALE, `focus lifts in place: ${f.tr}`);
    assert.notEqual(f.tr, rest.tr, "rest is not lifted");
    assert.equal(f.r, liftR, `focus radius ${f.r} (want ${liftR})`);
    assert.match(f.sh, /0px 1px 0px 0px inset/, "the lit top edge: " + f.sh);
    assert.match(f.sh, /0px 0px 0px 0\.5px/, "the .5px halo edge: " + f.sh);
    assert.match(f.sh, /0px 2px 4px/, "the near shadow: " + f.sh);
    assert.match(f.sh, /0px 12px 26px -8px/, "the far shadow straight underneath: " + f.sh);
    assert.match(f.dur, /0\.18s/, `transform + shadow share .18s (#759: .42s -> .18s) (${f.dur})`);
    assert.match(f.ease, /cubic-bezier\(0\.22, 0\.61, 0\.36, 1\)/, `the one curve (${f.ease})`);
    assert.notEqual(f.bc, rest.bc, `focus turns the edge --action: ${rest.bc} -> ${f.bc}`);
    const er = await edgeRatio(page, sel);
    assert.ok(er.ratio >= 3, `focus edge reaches 3:1: ${er.ratio && er.ratio.toFixed(2)} (${er.edge} over ${er.fill} vs ${er.surround})`);
    return `tr ${f.tr}, edge ${f.bc}, ${er.ratio.toFixed(2)}:1`;
  });
  await step(`${w}: IB-2 key press: add 90%, delete 60%, back to 75% in ~320ms`, async () => {
    await go(page, "PSY_S1A");
    const sel = "#q > .ff#ff", col = async () => (await liftOf(page, sel)).bc;
    await page.locator("#ans").focus();
    await page.waitForTimeout(520);
    const focus = await col();
    await page.keyboard.type("1");
    const add = await col();
    assert.notEqual(add, focus, `a new character strengthens the edge: ${focus} -> ${add}`);
    await page.waitForTimeout(430);
    const back = await col();
    assert.equal(back, focus, `the edge returns to the focus colour (${back})`);
    await page.keyboard.press("Backspace");
    const del = await col();
    assert.notEqual(del, add, `a delete is weaker than an add: ${add} vs ${del}`);
    await page.waitForTimeout(430);
    const back2 = await col();
    assert.equal(back2, focus, `the delete edge returns too (${back2})`);
    return `add ${add} del ${del} focus ${focus}`;
  });
  await step(`${w}: IB-2 judged field does not lift on focus`, async () => {
    await go(page, "PSY_S4A");
    await page.fill("#ans", "9.9"); await page.press("#ans", "Enter");
    await page.waitForSelector("#q #ff.bad", { timeout: 6000 });
    await page.locator("#ans").focus();
    await page.waitForTimeout(520);
    const j = await liftOf(page, "#q #ff.bad");
    assert.equal(j.tr, "none", `a judged field never lifts: ${j.tr}`);
    assert.doesNotMatch(j.sh, /0px 12px 26px -8px/, "a judged field keeps its verdict raise: " + j.sh);
    return `tr ${j.tr} edge ${j.bc}`;
  });
  await step(`${w}: single wrong keeps the resting ground`, async () => {
    await go(page, "PSY_S2A");
    const idle = (await page.evaluate(MET)).skin;
    await page.fill("#ans", "9.9"); await page.press("#ans", "Enter");
    await page.waitForSelector("#q #ff.bad", { timeout: 6000 });
    const bad = await skinOf(page, "#q #ff.bad");
    assert.equal(bad.bg, idle.bg, `single wrong ground = the resting ground (SPEC §7 BACKGROUND) (${bad.bg})`);
    assert.ok(bad.bw === "0px" || bad.bs === "none", `single wrong edge is still the resting 1.5px border (${bad.bw} ${bad.bs})`);
    assert.notEqual(bad.sh, idle.sh, "single wrong keeps the inset dish instead of the verdict raise");
    const wait = await page.evaluate(() => { const f = document.querySelector("#q #ff.bad"), g = document.querySelector("#ansGo"); return { gLeft: g.getBoundingClientRect().left, fRight: f.getBoundingClientRect().right, nx: !!f.querySelector(".nx") }; });
    assert.ok(wait.gLeft >= wait.fRight + 10, `Check jumps inside while waiting: left ${wait.gLeft} vs field right ${wait.fRight}`);
    assert.equal(wait.nx, false, "Next appeared inside the waiting field");
    return `bad ${bad.bg} ${bad.bw}`;
  });
  await step(`${w}: reveal pill keeps its live padding and height`, async () => {
    await go(page, "PSY_S1A");
    await page.fill("#ans", "3.2"); await page.press("#ans", "Enter");
    await page.waitForSelector("#q #ff.rbox", { timeout: 6000 });
    await settled(page, "#q #ff");
    const box = await skinOf(page, "#q #ff.rbox");
    assert.ok(parseFloat(box.pr) >= 48, `rbox padding-right ${box.pr} (want >= 48)`);
    assert.ok(Math.abs(box.h - 60) > 1, `rbox height ${box.h} got the IB-1 60px box`);
    if (w >= 900) assert.ok(box.w > 400.5, `rbox width ${box.w} got the 400px idle cap`);
    return `pad ${box.pr} h ${box.h} w ${box.w}`;
  });
  await step(`${w}: single Next takes the outer key slot`, async () => {
    await go(page, "PSY_S3A");
    const idle = (await page.evaluate(MET)).skin;
    await page.fill("#ans", "5"); await page.press("#ans", "Enter");
    await page.waitForSelector("#q #ff > .nx", { timeout: 6000 });
    await settled(page, "#q #ff > .nx");
    const ok = await skinOf(page, "#q #ff.ok");
    assert.equal(ok.bg, idle.bg, `single right ground = the resting ground (SPEC §7 BACKGROUND) (${ok.bg})`);
    assert.ok(ok.bw === "0px" || ok.bs === "none", `single right edge is still the resting border (${ok.bw} ${ok.bs})`);
    const g = await page.evaluate(() => {
      const ff = document.querySelector("#q > #ff.ff"), nx = ff.querySelector(":scope > .nx");
      const f = ff.getBoundingClientRect(), n = nx.getBoundingClientRect();
      return { fRight: f.right, nLeft: n.left, nW: n.width, nH: n.height };
    });
    assert.ok(g.nLeft >= g.fRight + 10, `Next is inside the box: left ${g.nLeft} vs field right ${g.fRight}`);
    const fit = await page.evaluate(() => { const n = document.querySelector("#q #ff > .nx .nf"); return { sw: n.scrollWidth, cw: n.clientWidth, text: n.textContent.trim() }; });
    assert.ok(fit.sw <= fit.cw + 1, `Next label overflows its 60px slot: ${JSON.stringify(fit)}`);
    const key = await page.evaluate(() => { const g = document.querySelector("#ansGo"), r = g.getBoundingClientRect(); return { hidden: g.hidden, display: getComputedStyle(g).display, w: r.width, h: r.height }; });
    assert.ok(key.hidden || key.display === "none" || key.w === 0, `Check key still sits under Next: ${JSON.stringify(key)}`);
    return `gap ${(g.nLeft - g.fRight).toFixed(1)} size ${g.nW}x${g.nH} fit ${fit.sw}/${fit.cw}`;
  });
  if (w >= 900) await step("1280: IB-3 even head speed, 286x60 and 400x60 (px per 1/8 lap within +-10%)", async () => {
    await go(page, "PSY_T2A");
    const hold = await holdGrade(page, ["PSY_T2A"]);
    try {
      await page.fill("#ans", "3.2"); await page.press("#ans", "Enter");
      await page.waitForFunction(() => document.documentElement.classList.contains("grading"), null, { timeout: 5000 });
      await page.waitForSelector("#q .ib3-ring .ib3-spin", { timeout: 3000 });
      const log = [];
      for (const bw of [286, 400]) {
        const r = await speedOf(page, bw);
        assert.ok(Math.abs(r.w - bw) <= 1 && Math.abs(r.h - 60) <= 1, `box ${r.w}x${r.h} (want ${bw}x60)`);
        assert.equal(r.steps.length, 8, `eight samples on ${r.w}x${r.h}: ${JSON.stringify(r.steps)}`);
        const exp = r.P / 8;
        r.steps.forEach((d, i) => assert.ok(Math.abs(d - exp) <= exp * .10,
          `step ${i} = ${d}px on ${r.w}x${r.h}; want ${exp.toFixed(1)} +-10% (${r.steps.join("/")})`));
        const pxPerSec = exp / (r.lap / 8000);
        assert.ok(pxPerSec > 380 && pxPerSec < 560, `pace ${pxPerSec.toFixed(0)} px/s on ${r.w}x${r.h}`);
        log.push(`${r.w}x${r.h} lap ${Math.round(r.lap)}ms ${r.steps.map(x => x.toFixed(1)).join("/")}`);
      }
      return log.join(" | ");
    } finally {
      hold.release();
      await page.waitForFunction(() => !document.documentElement.classList.contains("grading") && !document.querySelector(".ib3-ring"), null, { timeout: 8000 }).catch(() => {});
      await hold.done();
    }
  });
  await step(`${w}: IB-3 multi: only the part being checked thinks`, async () => {
    await go(page, "PSY_T3A");
    await page.mouse.move(0, 0);
    const restEdge = await page.evaluate(() => getComputedStyle(document.querySelector("#q .mparts .part:first-child > .ff")).borderTopColor);
    const hold = await holdGrade(page, ["PSY_T3A"]);
    try {
      await page.fill("#q .mparts .part:first-child input.ans", "17");
      await page.press("#q .mparts .part:first-child input.ans", "Enter");
      await page.waitForFunction(() => document.documentElement.classList.contains("grading"), null, { timeout: 5000 });
      await page.waitForSelector("#q .mparts .part:first-child .ib3-ring", { timeout: 3000 });
      await page.waitForTimeout(460);
      const m = await page.evaluate(() => [...document.querySelectorAll("#q .mparts .part")].map((p, i) => {
        const ff = p.querySelector(".ff"), inp = p.querySelector("input.ans"), key = p.querySelector(".send");
        return { i, g: p.classList.contains("g-on"), ring: !!ff.querySelector(".ib3-ring"), ro: inp.readOnly,
          tr: getComputedStyle(ff).transform, after: getComputedStyle(key, "::after").content, rings: document.querySelectorAll(".ib3-ring").length,
          fv: ff.matches(":has(input:focus-visible)"), ol: getComputedStyle(ff).outlineStyle, ow: getComputedStyle(ff).outlineWidth,
          bc: getComputedStyle(ff).borderTopColor };
      }));
      assert.deepEqual(m.map(x => x.g), [true, false], "only the checked part is .g-on: " + JSON.stringify(m));
      assert.deepEqual(m.map(x => x.ring), [true, false], "only the checked part wears the ring: " + JSON.stringify(m));
      assert.equal(m[0].ro, true, "the checked part's input is readOnly");
      assert.equal(m[1].ro, false, "the idle part stays editable");
      assert.match(m[0].tr, /matrix\(0\.986\d*, 0, 0, 0\.986/, `the checked part sinks: ${m[0].tr}`);
      assert.equal(m[1].tr, "none", `the idle part does not sink: ${m[1].tr}`);
      assert.equal(m[0].after, "none", "the checked part's key has no spinner");
      assert.equal(m[0].fv, true, "precondition: the checked part keeps keyboard focus-visible");
      assert.ok(m[0].ol === "none" || parseFloat(m[0].ow) === 0, `the checked part has no focus-visible outline: ${m[0].ol} ${m[0].ow}`);
      assert.equal(m[0].bc, restEdge, `the checked part's edge is the RESTING edge: ${m[0].bc} vs ${restEdge}`);
      await shot(page, `multi-${w}-thinking-app.png`, "#q");
    } finally {
      hold.release();
      await page.waitForFunction(() => !document.documentElement.classList.contains("grading") && !document.querySelector(".ib3-ring"), null, { timeout: 8000 }).catch(() => {});
      await hold.done();
    }
    return "ring on the g-on part only";
  });
  await step(`${w}: non-string unit does not print [object Object]`, async () => {
    await go(page, "PSY_S4A");
    const u = await page.evaluate(() => ({ unit: document.querySelector("#q .unit")?.textContent || null, text: document.querySelector("#q").textContent }));
    assert.equal(u.unit, null, `object unit rendered: ${u.unit}`);
    assert.ok(!u.text.includes("[object Object]"), "object unit leaked into the card");
    return "no unit";
  });
  await step(`${w}: MC key (#mcGo) unchanged`, async () => {
    await go(page, "PSY_C1A");
    const m = await page.evaluate(MET);
    assert.ok(m.mc && near(m.mc.w, 56) && near(m.mc.h, 56), `#mcGo ${JSON.stringify(m.mc)}`);
    assert.equal(m.mc.inChk, true, "#mcGo still lives in .chk");
    return `${m.mc.w}x${m.mc.h} in .chk`;
  });
  if (w === 390) await step("390: IB-3 MC keeps the live key spinner (typed-only switch-off)", async () => {
    await go(page, "PSY_C1A");
    const hold = await holdGrade(page, ["PSY_C1A"]);
    try {
      await page.click('#q .opt[data-id="a"]');
      await page.waitForFunction(() => !document.querySelector("#mcGo").disabled);
      await page.click("#mcGo");
      await page.waitForFunction(() => document.documentElement.classList.contains("grading"), null, { timeout: 5000 });
      const k = await page.evaluate(() => {
        const b = document.querySelector("#mcGo"), a = getComputedStyle(b, "::after");
        return { content: a.content, anim: a.animationName, op: +getComputedStyle(b).opacity, rings: document.querySelectorAll(".ib3-ring, .ib3-glow").length };
      });
      assert.notEqual(k.content, "none", "MC still draws the ::after ring: " + JSON.stringify(k));
      assert.match(k.anim, /^grade-(spin|pulse)$/, `MC still spins its ring: ${k.anim}`);
      assert.ok(k.op < 1, `MC Check still dims: ${k.op}`);
      assert.equal(k.rings, 0, "no typed thinking ring on the MC key");
      return `MC ring ${k.anim}`;
    } finally {
      hold.release();
      await page.waitForFunction(() => !document.documentElement.classList.contains("grading"), null, { timeout: 8000 }).catch(() => {});
      await hold.done();
    }
  });
  await step(`${w}: IB-4 single wrong: ring starts as the aurora arc, key stays dimmed, hint card, border untouched`, async () => {
    await go(page, "PSY_V1A");
    await page.mouse.move(0, 0);
    const fullLuma = await maxLuma(page, "#ansGo");   // the key's RENDERED arrow at rest
    const rest = await page.evaluate(() => { const ff = document.querySelector("#q > .ff#ff"), inp = ff.querySelector("input.ans"); return { bg: getComputedStyle(ff).backgroundColor, color: getComputedStyle(inp).color }; });
    const hold = await holdGrade(page, ["PSY_V1A"], { verdict: "wrong", triesLeft: 1, hint: "QUACK. Square the time." });
    try {
      await page.fill("#ans", "3.2"); await page.press("#ans", "Enter");
      await page.waitForFunction(() => document.documentElement.classList.contains("grading"), null, { timeout: 5000 });
      await page.waitForSelector("#q .ib3-ring .ib3-spin", { timeout: 3000 });
      const aurora = await auroraAt(page);
      hold.release();
      await page.waitForSelector("#q .ib4-ring", { timeout: 5000 });
      const r0 = await ringAt(page, 0), cov = coverageOf(r0.arcs);
      assert.ok(r0.a0 >= 0 && r0.a0 < 360, `the frozen aurora angle is stored: ${r0.a0}`);
      const da0 = ((r0.a0 - aurora) % 360 + 360) % 360, da = Math.min(da0, 360 - da0);   // wrap-safe: 359.997 is 0.003 behind, not a quarter turn ahead
      assert.ok(aurora != null && da < 90, `t=0 starts at the aurora's live head: ${r0.a0} vs ${aurora} (delta ${da})`);
      assert.equal(r0.v, "bad", `ring verdict ${r0.v}`);
      assert.ok(cov > 170 && cov < 178, `t=0 shows the aurora's ~173deg arc, not a full ring: ${cov}`);
      assert.equal(r0.arcs[0].anims, 0, "A is the frozen aurora arc (no animation)");
      const anim = r0.arcs.slice(1);
      assert.ok(anim.every(a => a.anims >= 1), "the closing arcs animate: " + JSON.stringify(r0.arcs.map(a => a.anims)));
      assert.ok(anim.every(a => a.keys.every(k => k.kf.every(f => f.offset === 0 || f.offset > 0))), "keyframe 0 exists");
      assert.ok(anim.every(a => a.keys.every(k => k.kf.every(f => f.props.length === 1 && f.props[0] === "transform"))),
        "transform-only keyframes: " + JSON.stringify(anim[1] && anim[1].keys));
      assert.ok(anim.every(a => a.keys.every(k => k.dur === 440)), "440ms sweep: " + JSON.stringify(anim.map(a => a.keys.map(k => k.dur))));
      assert.ok(anim.every(a => a.keys.every(k => /^cubic-bezier\(0\.3, 0?\.\d+, 0?\.2, 1\)$/.test(k.ease))), "easing cubic-bezier(.3,.3k,.2,1): " + JSON.stringify(anim.map(a => a.keys.map(k => k.ease))));
      await ringAt(page, 200);
      await shot(page, `single-${w}-mid-ib4-app.png`, "#freezeIn");
      const mid = await page.evaluate(() => {
        const ff = document.querySelector("#q > .ff#ff"), inp = ff.querySelector("input.ans"), cs = getComputedStyle(ff), ins = getComputedStyle(inp);
        return { val: inp.value, color: ins.color, op: ins.opacity, vis: ins.visibility, w: ff.offsetWidth, maxW: cs.maxWidth, bg: cs.backgroundColor };
      });
      assert.equal(mid.val, "3.2", `the typed value stays during the verdict: ${JSON.stringify(mid)}`);
      assert.ok(mid.op === "1" && mid.vis === "visible", `the typed value is painted: ${JSON.stringify(mid)}`);
      assert.equal(mid.bg, rest.bg, `wrong ground stays the resting ground mid-sweep: ${mid.bg} vs ${rest.bg}`);
      if (w >= 900) assert.ok(mid.w > 400.5 && mid.maxW === "none", `single field keeps filling the column after the verdict: ${mid.w}px (max-width ${mid.maxW})`);   // Tony Nov 25: no 400px cap
      const heads = [];
      for (let t = 0; t <= 440; t += 40) heads.push(await headAt(page, t));
      for (let i = 1; i < heads.length; i++) assert.ok(heads[i].s >= heads[i - 1].s - 0.01, `head is monotonic: ${heads.map(x => x.s.toFixed(1)).join("/")}`);
      const full = coverageOf((await ringAt(page, 440)).arcs);
      assert.ok(full > 355, `the ring closes: coverage ${full}`);
      await finishRing(page);   // the real close (a paused sweep never resolves strip.js's finished promise)
      await page.waitForFunction(() => document.querySelector("#q .ff")?.classList.contains("ib4-done"), null, { timeout: 3000 });
      await page.waitForFunction(() => { const v = document.querySelector("#q .ff > .vk"); return v && +getComputedStyle(v).opacity >= .99; }, null, { timeout: 3000 });
      const icon = await iconOf(page, "#q .ff");
      assert.ok(icon && icon.display !== "none" && icon.opacity >= .99, `the wrong cross is visible after the close: ${JSON.stringify(icon)}`);
      assert.ok(near(icon.w, 24) && near(icon.h, 24), `the cross is on the 24px grid: ${icon.w}x${icon.h}`);
      assert.equal(icon.right, "17.5px", `the cross sits 17.5 from the right: ${icon.right}`);
      assert.ok(Math.abs(parseFloat(icon.stroke) - 2.25) < .01, `the cross stroke is 2.25: ${icon.stroke}`);
      assert.ok(icon.vkLeft >= icon.unitRight, `the cross is right of the unit: ${icon.vkLeft} vs ${icon.unitRight}`);
      await shot(page, `single-${w}-wrong-ib4-final-app.png`, "#freezeIn");
      const dimLuma = await maxLuma(page, "#ansGo");
      assert.ok(dimLuma < fullLuma * .8, `the Check key's PIXELS are dim: ${dimLuma} vs full ${fullLuma}`);
      const fin = await page.evaluate(() => { const ff = document.querySelector("#q > .ff#ff"), inp = ff.querySelector("input.ans"); return { val: inp.value, w: ff.offsetWidth, maxW: getComputedStyle(ff).maxWidth, bg: getComputedStyle(ff).backgroundColor, color: getComputedStyle(inp).color }; });
      assert.equal(fin.val, "3.2", `the typed value stays after the verdict: ${JSON.stringify(fin)}`);
      assert.equal(fin.bg, rest.bg, `wrong ground after the verdict == ground at rest: ${fin.bg} vs ${rest.bg}`);
      assert.equal(fin.color, rest.color, `wrong value keeps the resting ink: ${fin.color} vs ${rest.color}`);
      if (w >= 900) assert.ok(fin.w > 400.5 && fin.maxW === "none", `single field keeps filling the column at rest after the verdict: ${fin.w}px (max-width ${fin.maxW})`);   // Tony Nov 25: no 400px cap
      const h5 = await headAt(page, 5), spd = (h5.s - heads[0].s) / 5 * 1000, aur = heads[0].P / heads[0].lap * 1000;   // px/s at t=0 (5ms sample; t is ms)
      assert.ok(spd > aur * .75 && spd < aur * 1.25, `head leaves at the aurora pace: ${spd.toFixed(0)} vs ${aur.toFixed(0)} px/s`);
      assert.equal(r0.keyHidden, false, "wrong keeps the Check key visible");
      assert.ok(r0.keyOp < 1, `wrong dims the Check key: opacity ${r0.keyOp}`);
      assert.ok(r0.hint && r0.hint.bg !== "rgba(0, 0, 0, 0)" && parseFloat(r0.hint.r) >= 16, "the single hint is the navy card: " + JSON.stringify(r0.hint));
      assert.equal(r0.hint.inPhint, false, "the single hint is #fb's, not a multi .phint");
      assert.ok(r0.edge.bw === "0px" || r0.edge.bs === "none", `the real border is not recoloured: ${JSON.stringify(r0.edge)}`);
      const wrong = await page.evaluate(() => { const p = document.createElement("i"); p.style.color = "var(--wrong)"; document.querySelector("#q").append(p); const c = getComputedStyle(p).color; p.remove(); return c; });
      assert.ok(r0.tone.includes(wrong), `the ring carries --wrong (${wrong}): ${r0.tone.slice(0, 90)}`);
      await page.locator("#ans").press("1");
      await page.waitForTimeout(250);
      await page.waitForFunction(() => +getComputedStyle(document.querySelector("#ansGo")).opacity >= .999, null, { timeout: 2000 }).catch(() => {});   // the key eases back to full over .15s (#759); under load 250ms was not always enough
      const after = await page.evaluate(() => ({ ring: !!document.querySelector("#q .ib4-ring"), bad: document.querySelector("#ff").classList.contains("bad"),
        vk: !!document.querySelector("#ff .vk"), val: document.querySelector("#ans").value, ro: document.querySelector("#ans").readOnly, op: +getComputedStyle(document.querySelector("#ansGo")).opacity,
        w: document.querySelector("#q > .ff#ff").offsetWidth, attr: document.querySelector("#ff").getAttribute("data-ib4") }));
      assert.equal(after.ring, false, `a keystroke clears the verdict ring: ${JSON.stringify(after)}`);
      assert.equal(after.bad, false, `a keystroke clears .bad: ${JSON.stringify(after)}`);
      assert.equal(after.op, 1, `a keystroke returns the key to full: ${after.op}`);
      assert.equal(after.attr, null, "the keystroke clears the verdict ring hook");
      if (w >= 900) assert.ok(after.w > 400.5, `single field keeps filling the column when the retry is typed: ${after.w}px`);   // Tony Nov 25: no 400px cap
      await shot(page, `single-${w}-retry-ib4-app.png`, "#freezeIn");
      return `cov ${cov.toFixed(1)} -> ${full.toFixed(1)}, key ${dimLuma}/${fullLuma}, ${spd.toFixed(0)}/${aur.toFixed(0)} px/s`;
    } finally {
      hold.release();
      await page.waitForFunction(() => !document.documentElement.classList.contains("grading"), null, { timeout: 8000 }).catch(() => {});
      await hold.done();
    }
  });
  await step(`${w}: IB-4 single right: ring stays, no key morph, Next takes the slot, tick fades, pixel diff 0`, async () => {
    await go(page, "PSY_V2A");
    const rest = await page.evaluate(() => { const ff = document.querySelector("#q > .ff#ff"), inp = ff.querySelector("input.ans"); return { bg: getComputedStyle(ff).backgroundColor, color: getComputedStyle(inp).color }; });
    const hold = await holdGrade(page, ["PSY_V2A"], { verdict: "correct", triesLeft: 1 });
    try {
      await page.fill("#ans", "3.2"); await page.press("#ans", "Enter");
      await page.waitForFunction(() => document.documentElement.classList.contains("grading"), null, { timeout: 5000 });
      await page.waitForSelector("#q .ib3-ring .ib3-spin", { timeout: 3000 });
      hold.release();
      await page.waitForSelector("#q .ib4-ring", { timeout: 5000 });
      await page.waitForSelector("#q .ff.ok .nx", { timeout: 5000 });
      await settled(page, "#q .ff.ok .nx");   // g-next-in lands Next in the slot before the geometry read
      const nx = await page.evaluate(() => { const n = document.querySelector("#q .ff.ok .nx"); return { cls: n.className, ico: !!n.querySelector(".vm-ico"), v: n.dataset.v || null }; });
      assert.doesNotMatch(nx.cls, /vmorph/, "a typed key skips §verdict-morph: " + JSON.stringify(nx));
      assert.equal(nx.ico, false, "no morph tick/cross is drawn on a typed Next");
      const key = await page.evaluate(() => { const g = document.querySelector("#ansGo"), r = g.getBoundingClientRect(); return { hidden: g.hidden, w: r.width, op: +getComputedStyle(g).opacity }; });
      assert.ok(key.hidden || key.w === 0, "right hands the slot to Next: " + JSON.stringify(key));
      const glyph = await page.evaluate(() => { const f = document.querySelector("#q .ff.ok"), n = f.querySelector(".nx"), r = f.getBoundingClientRect(), nr = n.getBoundingClientRect(), cs = getComputedStyle(f), ns = getComputedStyle(n);
        return { outside: nr.left >= r.right + 10, w: nr.width, h: nr.height, fr: +r.right.toFixed(1), fl: +r.left.toFixed(1), fw: f.offsetWidth, nl: +nr.left.toFixed(1), pos: ns.position, left: ns.left, pl: cs.paddingLeft, pr: cs.paddingRight, bw: cs.borderLeftWidth, tf: cs.transform, par: n.offsetParent && n.offsetParent.className }; });
      assert.ok(glyph.outside, "Next takes the 60px outer key slot: " + JSON.stringify(glyph));
      if (w >= 900) assert.ok(glyph.fw > 400.5, `single right field keeps filling the column: ${glyph.fw}px`);   // Tony Nov 25: no 400px cap
      await page.waitForFunction(() => document.querySelector("#q .ff.ok")?.classList.contains("ib4-done"), null, { timeout: 3000 });
      await page.waitForFunction(() => +getComputedStyle(document.querySelector("#q .ff.ok .vk")).opacity >= .99, null, { timeout: 3000 });
      const done = await ringAt(page, null);
      assert.equal(done.done, true, "the ring is the settled outline (done)");
      assert.ok(done.vkOp >= .99, `the tick fades in after the ring closes: ${done.vkOp}`);
      const icon = await iconOf(page, "#q .ff.ok");
      assert.ok(icon && icon.display !== "none" && icon.opacity >= .99, `the right tick is visible after the close: ${JSON.stringify(icon)}`);
      assert.ok(near(icon.w, 24) && near(icon.h, 24), `the tick is on the 24px grid: ${icon.w}x${icon.h}`);
      assert.equal(icon.right, "17.5px", `the tick sits 17.5 from the right: ${icon.right}`);
      assert.ok(Math.abs(parseFloat(icon.stroke) - 2.25) < .01, `the tick stroke is 2.25: ${icon.stroke}`);
      assert.ok(icon.vkLeft >= icon.unitRight, `the tick is right of the unit: ${icon.vkLeft} vs ${icon.unitRight}`);
      const gnd = await page.evaluate(() => { const ff = document.querySelector("#q > .ff#ff"), inp = ff.querySelector("input.ans"); return { bg: getComputedStyle(ff).backgroundColor, color: getComputedStyle(inp).color }; });
      assert.equal(gnd.bg, rest.bg, `right ground after the verdict == ground at rest: ${gnd.bg} vs ${rest.bg}`);
      assert.equal(gnd.color, rest.color, `right value keeps the resting ink: ${gnd.color} vs ${rest.color}`);
      const A = pngOf(await page.locator("#q .ib4-ring").screenshot());
      await page.evaluate(() => {
        const ring = document.querySelector("#q .ib4-ring"), els = [...ring.querySelectorAll(".ib4-arc")];
        // the animation's own last keyframe (an exact rotate(Xdeg)), not the computed matrix: getComputedStyle rounds the matrix to ~6 digits, and on the
        // full-width box (arcs 816px wide, typescale branch) that rounding flips 2 antialiased pixels of the conic's hard stop. The check stays pixel-exact.
        const vals = els.map(el => { const a = el.getAnimations()[0], k = a && a.effect.getKeyframes(); return k ? k[k.length - 1].transform : getComputedStyle(el).transform; });
        els.forEach(el => el.getAnimations().forEach(a => a.cancel()));
        els.forEach((el, i) => { el.style.transform = vals[i]; });
        ring.classList.add("ib4-still");
      });
      const B = pngOf(await page.locator("#q .ib4-ring").screenshot());
      const diff = pxDiff(A, B);
      assert.ok(diff <= 8, `final sweep frame vs a static done render: ${diff}px differ (SPEC §7 pixel-exact: 0 on most runs after .ib4-arc kept its will-change; 1-3 px sub-pixel antialias flake under load, was 175-198 without it)`);
      await shot(page, `single-${w}-right-ib4-app.png`, "#freezeIn");
      return `pixel diff ${diff}, tick ${done.vkOp}, Next ${glyph.w}x${glyph.h}`;
    } finally {
      hold.release();
      await page.waitForFunction(() => !document.documentElement.classList.contains("grading"), null, { timeout: 8000 }).catch(() => {});
      await hold.done();
    }
  });
  await step(`${w}: IB-4 multi wrong: ring on the part + the same navy hint card`, async () => {
    await go(page, "PSY_V3A");
    await page.mouse.move(0, 0);
    const rest = await page.evaluate(() => { const ff = document.querySelector("#q .mparts .part:first-child > .ff"), inp = ff.querySelector("input.ans"); return { bg: getComputedStyle(ff).backgroundColor, color: getComputedStyle(inp).color }; });
    const hold = await holdGrade(page, ["PSY_V3A"], { verdict: "wrong", triesLeft: 1, hint: "QUACK. Count both circles once." });
    try {
      await page.fill("#q .mparts .part:first-child input.ans", "17");
      await page.waitForTimeout(80);
      const fullLuma = await maxLuma(page, "#q .mparts .part:first-child .send");
      await page.press("#q .mparts .part:first-child input.ans", "Enter");
      await page.waitForFunction(() => document.documentElement.classList.contains("grading"), null, { timeout: 5000 });
      await page.waitForSelector("#q .mparts .part:first-child .ib3-ring .ib3-spin", { timeout: 3000 });
      const aurora = await auroraAt(page);
      hold.release();
      await page.waitForSelector("#q .mparts .part:first-child .ib4-ring", { timeout: 5000 });
      const r0 = await ringAt(page, 0);
      assert.equal(r0.v, "bad", `part ring verdict ${r0.v}`);
      const da0 = ((r0.a0 - aurora) % 360 + 360) % 360, da = Math.min(da0, 360 - da0);   // wrap-safe: 359.997 is 0.003 behind, not a quarter turn ahead
      assert.ok(aurora != null && da < 90, `the part ring starts at the aurora's live head: ${r0.a0} vs ${aurora} (delta ${da})`);
      assert.ok(r0.hint && r0.hint.inPhint && r0.hint.bg !== "rgba(0, 0, 0, 0)" && parseFloat(r0.hint.r) >= 16,
        "the multi hint wears the same navy card: " + JSON.stringify(r0.hint));
      assert.equal(r0.keyHidden, false, "the part's Check stays visible on a miss");
      assert.ok(r0.keyOp < 1, `the part's Check dims: ${r0.keyOp}`);
      await ringAt(page, 200);
      await shot(page, `multi-${w}-mid-ib4-app.png`, "#freezeIn");
      await ringAt(page, 440);
      await finishRing(page);
      await page.waitForFunction(() => document.querySelector("#q .mparts .part:first-child > .ff")?.classList.contains("ib4-done"), null, { timeout: 3000 });
      await page.waitForFunction(() => { const v = document.querySelector("#q .mparts .part:first-child > .ff > .vk"); return v && +getComputedStyle(v).opacity >= .99; }, null, { timeout: 3000 });
      const icon = await iconOf(page, "#q .mparts .part:first-child > .ff");
      assert.ok(icon && icon.display !== "none" && icon.opacity >= .99, `the part cross is visible after the close: ${JSON.stringify(icon)}`);
      assert.ok(near(icon.w, 24) && near(icon.h, 24), `the part cross is on the 24px grid: ${icon.w}x${icon.h}`);
      assert.equal(icon.right, "17.5px", `the part cross sits 17.5 from the right: ${icon.right}`);
      assert.ok(Math.abs(parseFloat(icon.stroke) - 2.25) < .01, `the part cross stroke is 2.25: ${icon.stroke}`);
      const gnd = await page.evaluate(() => { const ff = document.querySelector("#q .mparts .part:first-child > .ff"), inp = ff.querySelector("input.ans"); return { bg: getComputedStyle(ff).backgroundColor, color: getComputedStyle(inp).color }; });
      assert.equal(gnd.bg, rest.bg, `multi wrong ground after the verdict == ground at rest: ${gnd.bg} vs ${rest.bg}`);
      assert.equal(gnd.color, rest.color, `multi wrong value keeps the resting ink: ${gnd.color} vs ${rest.color}`);
      await shot(page, `multi-${w}-wrong-ib4-final-app.png`, "#freezeIn");
      const dimLuma = await maxLuma(page, "#q .mparts .part:first-child .send");
      assert.ok(dimLuma < fullLuma * .8, `the part key's PIXELS are dim: ${dimLuma} vs full ${fullLuma}`);
      await page.locator("#q .mparts .part:first-child input.ans").press("1");
      await page.waitForFunction(() => !document.querySelector("#q .mparts .part .ib4-ring"), null, { timeout: 3000 });
      const after = await page.evaluate(() => +getComputedStyle(document.querySelector("#q .mparts .part:first-child .send")).opacity);
      await page.waitForTimeout(260);   // the key's opacity eases .15s (#759); read after it settles
      const after2 = await page.evaluate(() => +getComputedStyle(document.querySelector("#q .mparts .part:first-child .send")).opacity);
      assert.equal(after2, 1, `the next keystroke restores the part key: ${after} -> ${after2}`);
      await shot(page, `multi-${w}-retry-ib4-app.png`, "#freezeIn");
      return `multi card ${r0.hint.r}, key ${dimLuma}/${fullLuma} px luma, ${r0.keyOp} -> ${after}`;
    } finally {
      hold.release();
      await page.waitForFunction(() => !document.documentElement.classList.contains("grading"), null, { timeout: 8000 }).catch(() => {});
      await hold.done();
    }
  });
  await step(`${w}: IB-4 multi right: ground stays resting, tick visible`, async () => {
    await go(page, "PSY_V5A");
    const rest = await page.evaluate(() => { const ff = document.querySelector("#q .mparts .part:first-child > .ff"), inp = ff.querySelector("input.ans"); return { bg: getComputedStyle(ff).backgroundColor, color: getComputedStyle(inp).color }; });
    const hold = await holdGrade(page, ["PSY_V5A"], { verdict: "correct", triesLeft: 1 });
    try {
      await page.fill("#q .mparts .part:first-child input.ans", "14");
      await page.press("#q .mparts .part:first-child input.ans", "Enter");
      await page.waitForFunction(() => document.documentElement.classList.contains("grading"), null, { timeout: 5000 });
      await page.waitForSelector("#q .mparts .part:first-child .ib3-ring .ib3-spin", { timeout: 3000 });
      hold.release();
      await page.waitForSelector("#q .mparts .part:first-child .ib4-ring", { timeout: 5000 });
      await page.waitForSelector("#q .mparts .part:first-child > .ff.ok", { timeout: 5000 });
      await page.waitForFunction(() => document.querySelector("#q .mparts .part:first-child > .ff")?.classList.contains("ib4-done"), null, { timeout: 3000 });
      await page.waitForFunction(() => { const v = document.querySelector("#q .mparts .part:first-child > .ff > .vk"); return v && +getComputedStyle(v).opacity >= .99; }, null, { timeout: 3000 });
      const icon = await iconOf(page, "#q .mparts .part:first-child > .ff");
      assert.ok(icon && icon.display !== "none" && icon.opacity >= .99, `the part tick is visible after the close: ${JSON.stringify(icon)}`);
      assert.ok(near(icon.w, 24) && near(icon.h, 24), `the part tick is on the 24px grid: ${icon.w}x${icon.h}`);
      assert.equal(icon.right, "17.5px", `the part tick sits 17.5 from the right: ${icon.right}`);
      assert.ok(Math.abs(parseFloat(icon.stroke) - 2.25) < .01, `the part tick stroke is 2.25: ${icon.stroke}`);
      const gnd = await page.evaluate(() => { const ff = document.querySelector("#q .mparts .part:first-child > .ff"), inp = ff.querySelector("input.ans"); return { bg: getComputedStyle(ff).backgroundColor, color: getComputedStyle(inp).color }; });
      assert.equal(gnd.bg, rest.bg, `multi right ground after the verdict == ground at rest: ${gnd.bg} vs ${rest.bg}`);
      assert.equal(gnd.color, rest.color, `multi right value keeps the resting ink: ${gnd.color} vs ${rest.color}`);
      await shot(page, `multi-${w}-right-ib4-app.png`, "#freezeIn");
      return `multi right ${gnd.bg}, tick ${icon.opacity}`;
    } finally {
      hold.release();
      await page.waitForFunction(() => !document.documentElement.classList.contains("grading"), null, { timeout: 8000 }).catch(() => {});
      await hold.done();
    }
  });
  if (w === 390) await step("390: IB-4 verdict change: the ring follows the new verdict (bad -> ok)", async () => {
    await go(page, "PSY_V1A");
    await page.evaluate(() => { document.querySelector("#q > .ff#ff").classList.add("bad"); });
    await page.waitForSelector("#q .ib4-ring[data-v='bad']", { timeout: 3000 });
    await page.evaluate(() => { const ff = document.querySelector("#q > .ff#ff"); ff.classList.remove("bad"); ff.classList.add("ok"); });
    await page.waitForSelector("#q .ib4-ring[data-v='ok']", { timeout: 3000 });
    return "bad ring replaced by ok";
  });
  if (w === 390) await step("390: IB-4 MC keeps the full verdict morph (typed answers only skip it)", async () => {
    await go(page, "PSY_V4A");
    await page.click('#q .opt[data-id="a"]');
    await page.waitForFunction(() => !document.querySelector("#mcGo").disabled);
    await page.click("#mcGo");
    await page.waitForSelector("#q .nx.vmorph", { timeout: 6000 });
    const m = await page.evaluate(() => { const n = document.querySelector("#q .nx.vmorph"); return { v: n.dataset.v, ico: !!n.querySelector(".vm-ico"), anim: getComputedStyle(n).animationName }; });
    assert.equal(m.v, "ok", "MC's Next morphs as the verdict: " + JSON.stringify(m));
    assert.equal(m.ico, true, "MC keeps the drawn tick");
    assert.match(m.anim, /vm-flood/, `MC keeps the flood: ${m.anim}`);
    return `MC morph ${m.v}`;
  });
  await step(`${w}: IB-7 miss hint sits snug under the typed box (mock gap ${MOCK_GAP} +-4)`, async () => {
    const seen = [];
    for (const [code, multi] of [["PSY_G1A", false], ["PSY_G2A", true]]) {
      const hold = await holdGrade(page, [code], { verdict: "wrong", triesLeft: 1, hint: "QUACK. Square the time." });
      try {
        await go(page, code);
        const sel = multi ? "#q .mparts .part[data-i='0'] input.ans" : "#ans";
        await page.fill(sel, "9.9"); await page.press(sel, "Enter");
        await page.waitForFunction(() => document.documentElement.classList.contains("grading"), null, { timeout: 5000 });
        hold.release();
        await page.waitForSelector(multi ? "#q .mparts .phint .cluck" : "#fb > .cluck", { timeout: 6000 });
        await page.waitForTimeout(450);   // the mock's .hint pop is .3s: measure the settled card
        const g = await hintGapOf(page);
        assert.ok(!g.err, `no hint card: ${JSON.stringify(g)}`);
        assert.equal(g.inPhint, multi, `the hint card sits in the ${multi ? ".phint" : "#fb"}: ${JSON.stringify(g)}`);
        assert.ok(g.gap >= MOCK_GAP - 4 && g.gap <= MOCK_GAP + 4,
          `${multi ? "multi" : "single"} ${w}: the hint card is ${g.gap}px under the box; the mock's gap is ${MOCK_GAP} (want ${MOCK_GAP - 4}..${MOCK_GAP + 4})`);
        seen.push(`${multi ? "multi" : "single"} ${g.gap}`);
      } finally {
        hold.release();
        await page.waitForFunction(() => !document.documentElement.classList.contains("grading"), null, { timeout: 8000 }).catch(() => {});
        await hold.done();
      }
    }
    return seen.join(" / ");
  });
  /* GAP-BAND + hint under the box + tighter parts (Tony Nov 25). Repro of the band: `STEP_FILTER=GAP-BAND node tests/inputbox-static.smoke.mjs` (red on #756; v2 asserts the 24px gap) */
  await step(`${w}: GAP-BAND 24px gap card -> answer panel (rounded, card shadow); grey hint under each box; parts 16 apart`, async () => {
    await go(page, "PSY_M1A");
    await page.mouse.move(0, 0);
    const m = await page.evaluate(() => {
      const r = e => e.getBoundingClientRect(), card = r(document.querySelector("#problem")), q = r(document.querySelector("#q"));
      const parts = [...document.querySelectorAll("#q .mparts .part")].map(p => ({ top: r(p).top, bottom: r(p).bottom - parseFloat(getComputedStyle(p).paddingBottom), box: r(p.querySelector(".ff")), hint: p.querySelector(".phow") && { d: getComputedStyle(p.querySelector(".phow")).display, t: r(p.querySelector(".phow")).top, txt: p.querySelector(".phow").textContent } }));
      const top = document.querySelector("#q > .how");
      const cc = getComputedStyle(document.querySelector("#problem")), qc = getComputedStyle(document.querySelector("#q"));
      return { cardBottomR: Math.min(parseFloat(cc.borderBottomLeftRadius), parseFloat(cc.borderBottomRightRadius)), panelTopR: Math.min(parseFloat(qc.borderTopLeftRadius), parseFloat(qc.borderTopRightRadius)), cardShadow: cc.boxShadow, panelBg: qc.backgroundColor, panelShadow: qc.boxShadow,
        band: +(q.top - card.bottom).toFixed(1), parts, topHow: top ? getComputedStyle(top).display : "none" };
    });
    /* GAP-BAND v2 (Tony Nov 25, intent changed): a DELIBERATE --s5 = 24px gap, the card's shadow in it, both surfaces rounded (not a raw strip, not a joined seam) */
    assert.ok(Math.abs(m.band - 24) <= 1, `card -> answer panel gap is ${m.band}px (want 24 = --s5)`);
    /* BENTO (Tony Nov 26): the answer panel has no surface of its own (no background, border, shadow); the card keeps its lift shadow but casts no 18px cast into the gap */
    assert.ok(m.cardBottomR > 4, `the card's bottom corners stay rounded: ${m.cardBottomR}`);
    assert.ok(m.panelBg === "rgba(0, 0, 0, 0)" && m.panelShadow === "none", `no panel surface: bg ${m.panelBg}, shadow ${m.panelShadow}`);
    assert.ok(!/\b18px 24px\b/.test(m.cardShadow || ""), `no cast shadow into the gap: ${m.cardShadow}`);
    assert.equal(m.topHow, "none", "the shared hint no longer sits above the parts");
    for (const [i, p] of m.parts.entries()) {
      assert.ok(p.hint && p.hint.d === "block" && /Number only/.test(p.hint.txt), `part ${i} repeats the grey hint: ${JSON.stringify(p.hint)}`);
      assert.ok(p.hint.t >= p.box.bottom + 5 && p.hint.t <= p.box.bottom + 12, `part ${i}: the hint is ${(p.hint.t - p.box.bottom).toFixed(1)}px under its box (want ~8)`);
    }
    /* BENTO: two short parts sit side by side when the parts container is >= 424px (24px column gap), else stacked 16 apart */
    const side = Math.abs(m.parts[1].top - m.parts[0].top) < 2;
    const g = side ? m.parts[1].box.left - m.parts[0].box.right : m.parts[1].top - m.parts[0].bottom;
    if (side) assert.ok(m.parts[1].box.left > m.parts[0].box.left, "a, b tile side by side in reading order");
    else assert.ok(Math.abs(g - 16) <= 1, `parts are ${g.toFixed(1)}px apart (want 16)`);
    await go(page, "PSY_S2A");
    const s1 = await page.evaluate(() => { const b = document.querySelector("#q > .ff#ff").getBoundingClientRect(), h = document.querySelector("#q > .phow"); return { d: h && getComputedStyle(h).display, gap: h && +(h.getBoundingClientRect().top - b.bottom).toFixed(1) }; });
    assert.equal(s1.d, "block", "the single box has its grey hint");
    assert.ok(s1.gap >= 6 && s1.gap <= 10, `single: the hint is ${s1.gap}px under the box (want ~8)`);
    return `band ${m.band} / hint ${(m.parts[0].hint.t - m.parts[0].box.bottom).toFixed(1)} / parts ${g.toFixed(1)} / single ${s1.gap}`;
  });
  /* BENTO invariant (Tony Nov 26): 2-col mode: A.left = C.left, B key right = C key right, A + gap + B = C; 1-col below the container breakpoint (424) */
  await step(`${w}: BENTO a,b short side by side over c long; A.left = C.left, B key right = C key right`, async () => {
    await go(page, "PSY_B3A");
    const m = await page.evaluate(() => {
      const r = e => e.getBoundingClientRect(), P = [...document.querySelectorAll("#q .mparts .part")], pr = P.map(r);
      return { cw: r(document.querySelector("#q .mparts")).width, pr, k: P.map(p => r(p.querySelector(".send"))), box: P.map(p => r(p.querySelector(".ff"))) };
    });
    if (m.cw >= 424) {
      assert.ok(Math.abs(m.pr[0].top - m.pr[1].top) < 1 && m.pr[2].top >= m.pr[0].bottom - .5, "row 1 = a, b; row 2 = c");
      assert.ok(Math.abs(m.pr[0].left - m.pr[2].left) <= .5, `A.left ${m.pr[0].left} vs C.left ${m.pr[2].left}`);
      assert.ok(Math.abs(m.pr[1].right - m.pr[2].right) <= .5, `B cell right ${m.pr[1].right} vs C cell right ${m.pr[2].right}`);
      assert.ok(Math.abs(m.k[1].right - m.k[2].right) <= .5, `B key right ${m.k[1].right} vs C key right ${m.k[2].right}`);
      assert.ok(Math.abs(m.box[0].width + (m.box[1].left - m.box[0].right) + m.box[1].width - m.box[2].width) <= 1.5, "A + gap + B = C (box + gap + box)");
      return `A.left-C.left ${(m.pr[0].left - m.pr[2].left).toFixed(2)} / Bkey.right-Ckey.right ${(m.k[1].right - m.k[2].right).toFixed(2)} / cw ${m.cw}`;
    }
    assert.ok(m.pr[1].top >= m.pr[0].bottom - .5 && m.pr[2].top >= m.pr[1].bottom - .5 && m.pr[1].top > m.pr[0].top + 20, "one column under the 424 container breakpoint");
    return `1 col (container ${m.cw})`;
  });
  await ctx.close();
}

/* IB-2: prefers-reduced-motion = colours only: no scale, no transition */
{
  const { ctx, page } = await fresh(true, { width: 390, height: 844 }, { reducedMotion: "reduce" });
  await step("reduced motion: focus colours only, no scale, no transition", async () => {
    await go(page, "PSY_S1A");
    const sel = "#q > .ff#ff";
    const rest = await liftOf(page, sel);
    await page.locator("#ans").focus();
    await page.waitForTimeout(520);
    const f = await liftOf(page, sel);
    assert.equal(f.tr, "none", `no scale under reduced motion: ${f.tr}`);
    assert.equal(f.dur, "0s", `no transition under reduced motion: ${f.dur}`);
    assert.notEqual(f.bc, rest.bc, "the edge colour still changes (colours only)");
    await page.keyboard.type("7");
    const typed = await liftOf(page, sel);
    assert.equal(typed.tr, "none", `typing does not scale under reduced motion: ${typed.tr}`);
    return `edge ${f.bc}, transition ${f.dur}`;
  });
  await step("reduced motion: judged field still does not lift", async () => {
    await go(page, "PSY_S2A");
    await page.fill("#ans", "9.9"); await page.press("#ans", "Enter");
    await page.waitForSelector("#q #ff.bad", { timeout: 6000 });
    await page.locator("#ans").focus();
    const j = await liftOf(page, "#q #ff.bad");
    assert.equal(j.tr, "none", `judged: ${j.tr}`);
    return `tr ${j.tr}`;
  });
  await step("reduced motion: IB-3 thinking = static .6 --action ring, no rotation/sink/blur", async () => {
    await go(page, "PSY_T1A");
    const hold = await holdGrade(page, ["PSY_T1A"]);
    try {
      await page.fill("#ans", "3.2"); await page.press("#ans", "Enter");
      await page.waitForFunction(() => document.documentElement.classList.contains("grading"), null, { timeout: 5000 });
      await page.waitForSelector("#q .ib3-ring", { timeout: 3000 });
      const r = await page.evaluate(() => {
        const ff = document.querySelector("#q > .ff#ff"), ring = ff.querySelector(".ib3-ring"), spin = ff.querySelector(".ib3-spin"), glow = ff.querySelector(".ib3-glow");
        return { tr: getComputedStyle(ff).transform, blur: getComputedStyle(ff.querySelector("input.ans")).filter,
          bg: getComputedStyle(ring).backgroundColor, op: +getComputedStyle(ring).opacity,
          spin: getComputedStyle(spin).display, anims: spin.getAnimations().length, glow: getComputedStyle(glow).display };
      });
      assert.equal(r.tr, "none", `no sink under reduced motion: ${r.tr}`);
      assert.equal(r.blur, "none", `no value blur under reduced motion: ${r.blur}`);
      assert.equal(r.bg, "rgb(90, 169, 255)", `the static ring is --action: ${r.bg}`);
      assert.equal(r.op, 0.6, `the static ring is .6: ${r.op}`);
      assert.equal(r.spin, "none", "the rotating layer is hidden");
      assert.equal(r.anims, 0, `no rotation under reduced motion: ${r.anims} animations`);
      assert.equal(r.glow, "none", "no glow under reduced motion");
      return `static ${r.bg} @ ${r.op}`;
    } finally {
      hold.release();
      await page.waitForFunction(() => !document.documentElement.classList.contains("grading"), null, { timeout: 8000 }).catch(() => {});
      await hold.done();
    }
  });
  await step("reduced motion: IB-4 verdict ring = closed static verdict colour, icon + hint without motion", async () => {
    await go(page, "PSY_V1A");
    const hold = await holdGrade(page, ["PSY_V1A"], { verdict: "wrong", triesLeft: 1, hint: "QUACK. Square the time." });
    try {
      await page.fill("#ans", "3.2"); await page.press("#ans", "Enter");
      await page.waitForFunction(() => document.documentElement.classList.contains("grading"), null, { timeout: 5000 });
      await page.waitForSelector("#q .ib3-ring", { timeout: 3000 });
      hold.release();
      await page.waitForSelector("#q .ib4-ring", { timeout: 5000 });
      const r = await ringAt(page, null), cov = coverageOf(r.arcs);
      assert.equal(r.v, "bad", `ring verdict ${r.v}`);
      assert.equal(r.still, true, "reduced motion: the ring is the static done state");
      assert.ok(r.arcs.every(a => a.anims === 0), "no sweep under reduced motion: " + JSON.stringify(r.arcs.map(a => a.anims)));
      assert.ok(cov > 355, `the ring appears closed: ${cov}`);
      assert.ok(r.vkOp >= .99, `the icon is there at once: ${r.vkOp}`);
      assert.ok(r.hint && r.hint.anim === "none", "the hint arrives without motion: " + JSON.stringify(r.hint));
      return `static ${cov.toFixed(1)}deg, icon ${r.vkOp}`;
    } finally {
      hold.release();
      await page.waitForFunction(() => !document.documentElement.classList.contains("grading"), null, { timeout: 8000 }).catch(() => {});
      await hold.done();
    }
  });
  await ctx.close();
}
/* flag off: the old field and the old "a)" marker, no outline, no 400 cap */
{
  const { ctx, page } = await fresh(false, { width: 390, height: 844 });
  await step("flag off 390: multi rows unchanged", async () => {
    await go(page, "PSY_M1A");
    const m = await page.evaluate(MET);
    assert.equal(m.mk, "a)", `old marker ${JSON.stringify(m.mk)}`);
    assert.equal(m.os, "none", `old box has no outline (${m.os} ${m.ow})`);
    assert.ok(!near(m.h, 60, 1), `old field is --fld, not 60 (${m.h})`);
    await page.fill("#q .mparts .part:first-child input.ans", "17");
    const live = await page.evaluate(() => {
      const ff = document.querySelector("#q .mparts .part:first-child .ff"), key = document.querySelector("#go0");
      const f = ff.getBoundingClientRect(), k = key.getBoundingClientRect();
      return { hidden: key.hidden, inside: k.left >= f.left && k.right <= f.right + .5 && k.top >= f.top && k.bottom <= f.bottom + .5 };
    });
    assert.equal(live.hidden, false, "flag off: the live arrow appears on text");
    assert.equal(live.inside, true, "flag off: the live arrow stays INSIDE the box (IB-5 is ui-v7 only)");
    await shot(page, "multi-390-off-app.png", "#q");
    await page.evaluate(() => document.documentElement.classList.add("ui-v7"));
    try {
      const late = await page.evaluate(() => ({ mk: document.querySelector(".mk").innerText, paren: getComputedStyle(document.querySelector(".mk-p")).display }));
      assert.equal(late.mk, "A", `late ui-v7 marker ${JSON.stringify(late.mk)} (#759: the letter is upper-cased by CSS under ui-v7)`);
      assert.equal(late.paren, "none", "late ui-v7 still shows the )");
    } finally { await page.evaluate(() => document.documentElement.classList.remove("ui-v7")); }   // a failed assert must not leak ui-v7 into the later flag-off steps
    return `mk ${JSON.stringify(m.mk)} h ${m.h}`;
  });
  await step("flag off 390: single unchanged", async () => {
    await go(page, "PSY_S1A");
    const m = await page.evaluate(MET);
    assert.equal(m.os, "none", `old box has no outline (${m.os} ${m.ow})`);
    assert.ok(!near(m.h, 60, 1), `old field is --fld, not 60 (${m.h})`);
    await shot(page, "single-390-off-app.png", "#q");
    await page.evaluate(() => document.documentElement.classList.add("ui-v7"));
    const late = await page.evaluate(() => ({ go: getComputedStyle(document.querySelector("#ansGo .ib1-go")).display, ico: getComputedStyle(document.querySelector("#ansGo .ico")).display }));
    assert.equal(late.go, "block", "late ui-v7 has no outside arrow");
    assert.equal(late.ico, "none", "late ui-v7 still shows the sprite arrow");
    await page.evaluate(() => document.documentElement.classList.remove("ui-v7"));
    return `h ${m.h} ow ${m.ow}`;
  });
  await step("flag off 390: focus never lifts", async () => {
    await go(page, "PSY_S1A");
    await page.locator("#ans").focus();
    await page.waitForTimeout(300);
    const f = await liftOf(page, "#q > .ff#ff");
    assert.equal(f.tr, "none", `flag off focus transform ${f.tr}`);
    assert.doesNotMatch(f.dur, /0\.42s/, `flag off has no IB-2 transition: ${f.dur}`);
    return `tr ${f.tr} dur ${f.dur}`;
  });
  await step("flag off 390: IB-3 adds nothing while a typed grade is out", async () => {
    await go(page, "PSY_T1A");
    const hold = await holdGrade(page, ["PSY_T1A"]);
    try {
      await page.fill("#ans", "3.2"); await page.press("#ans", "Enter");
      await page.waitForFunction(() => document.documentElement.classList.contains("grading"), null, { timeout: 5000 });
      const r = await page.evaluate(() => {
        const ff = document.querySelector("#q > .ff#ff");
        return { rings: document.querySelectorAll(".ib3-ring, .ib3-glow").length, ro: ff.querySelector("input.ans").readOnly,
          tr: getComputedStyle(ff).transform, blur: getComputedStyle(ff.querySelector("input.ans")).filter,
          after: getComputedStyle(document.querySelector("#ansGo"), "::after").content };
      });
      assert.equal(r.rings, 0, "flag off: no ring layers");
      assert.equal(r.ro, false, "flag off: the input is not made readOnly");
      assert.equal(r.tr, "none", `flag off: no sink (${r.tr})`);
      assert.equal(r.blur, "none", `flag off: no value blur (${r.blur})`);
      assert.notEqual(r.after, "none", "flag off keeps the live typed Check spinner");
      return "flag off: nothing";
    } finally {
      hold.release();
      await page.waitForFunction(() => !document.documentElement.classList.contains("grading"), null, { timeout: 8000 }).catch(() => {});
      await hold.done();
    }
  });
  await step("flag off 390: IB-4 adds no verdict ring", async () => {
    await go(page, "PSY_S2A");
    await page.fill("#ans", "9.9"); await page.press("#ans", "Enter");
    await page.waitForSelector("#q #ff.bad", { timeout: 6000 });
    const bad = await page.evaluate(() => ({ rings: document.querySelectorAll(".ib4-ring, .ib4-arc").length, attr: document.querySelector("#ff").getAttribute("data-ib4"), vkAnim: getComputedStyle(document.querySelector("#q .ff .vk")).animationName }));
    assert.equal(bad.rings, 0, "flag off: no verdict ring layers");
    assert.equal(bad.attr, null, "flag off: no IB-4 hook on the field");
    assert.doesNotMatch(bad.vkAnim, /ib4/, "flag off: the verdict icon keeps its live timing: " + bad.vkAnim);
    await go(page, "PSY_S3A");
    await page.fill("#ans", "5"); await page.press("#ans", "Enter");
    await page.waitForSelector("#q #ff.ok", { timeout: 6000 });
    const ok = await page.evaluate(() => ({ rings: document.querySelectorAll(".ib4-ring, .ib4-arc").length, attr: document.querySelector("#ff").getAttribute("data-ib4") }));
    assert.equal(ok.rings, 0, "flag off right: no verdict ring layers");
    assert.equal(ok.attr, null, "flag off right: no IB-4 hook");
    return "flag off: nothing";
  });
  await step("flag off 390: IB-7 leaves the hint gap alone", async () => {
    const seen = [];
    for (const [code, multi, want] of [["PSY_S4A", false, 38.5], ["PSY_M1A", true, 8]]) {   // the pre-IB-7 gaps: the empty preview's room; the .phint's app.css margin 0
      const hold = await holdGrade(page, [code], { verdict: "wrong", triesLeft: 1, hint: "QUACK. Square the time." });
      try {
        await go(page, code);
        const sel = multi ? "#q .mparts .part[data-i='0'] input.ans" : "#ans";
        await page.fill(sel, "9.9"); await page.press(sel, "Enter");
        await page.waitForFunction(() => document.documentElement.classList.contains("grading"), null, { timeout: 5000 });
        hold.release();
        await page.waitForSelector(multi ? "#q .mparts .phint .cluck" : "#fb > .cluck", { timeout: 6000 });
        await page.waitForTimeout(450);
        const g = await hintGapOf(page);
        assert.ok(!g.err, `flag off ${multi ? "multi" : "single"}: no hint card: ${JSON.stringify(g)}`);
        assert.ok(Math.abs(g.gap - want) <= 1, `flag off ${multi ? "multi" : "single"}: gap ${g.gap}px (unchanged ${want})`);
        seen.push(`${multi ? "multi" : "single"} ${g.gap}`);
      } finally {
        hold.release();
        await page.waitForFunction(() => !document.documentElement.classList.contains("grading"), null, { timeout: 8000 }).catch(() => {});
        await hold.done();
      }
    }
    return seen.join(" / ");
  });
  await step("flag off 1280: single has no 400px cap", async () => {
    await go(page, "PSY_S1A");
    const m = await page.evaluate(MET);
    assert.equal(m.maxW, "none", `flag-off max-width ${m.maxW} should stay unset`);
    return `max-width ${m.maxW}, w ${m.boxW}`;
  });
  await ctx.close();
}
/* side-by-side material: the mock's own cards at the same widths (only with SHOTS; SHOTS_APP skips it) */
if (SHOTS && !SHOTS_APP) {
  try {
    for (const w of [390, 1280]) {
      const ctx = await browser.newContext({ viewport: { width: w, height: w === 390 ? 844 : 900 } });
      const page = await ctx.newPage();
      await page.goto("file://" + MOCK, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForFunction(() => document.querySelectorAll("#live .card").length >= 2, null, { timeout: 10000 }).catch(() => {});
      await page.evaluate(() => { document.documentElement.dataset.theme = "dark"; });   // the app is dark: the mock's dark card is the comparison
      await page.waitForTimeout(200);
      await page.evaluate(() => (document.fonts?.ready || Promise.resolve())).catch(() => {});
      const sel = w >= 900 ? "#desk .card" : "#live .card";
      const n = await page.locator(sel).count();
      if (n >= 2) {
        for (const [i, name] of [[0, "multi"], [1, "single"]]) {
          const card = page.locator(sel).nth(i);
          await card.locator(".f input").first().fill("17");   // IB-2: focus + typed, the lifted state
          await page.waitForTimeout(520);
          await card.screenshot({ path: join(SHOTS, `${name}-${w}-mock.png`) }).catch(e => console.log("mock shot", e.message.slice(0, 100)));
          await page.evaluate(() => document.activeElement?.blur());
          await page.waitForTimeout(520);
        }
        const chk = page.locator('#states [data-force="checking"] .card');
        for (const [i, name] of [[0, "multi"], [1, "single"]]) {
          if (await chk.nth(i).count()) await chk.nth(i).screenshot({ path: join(SHOTS, `${name}-${w}-mock-thinking.png`) }).catch(e => console.log("mock thinking shot", e.message.slice(0, 100)));
        }
      } else console.log("mock cards not found at", w, n);
      await ctx.close();
    }
  } catch (e) { console.log("mock shots unavailable:", e.message.slice(0, 200)); }
}
await browser.close(); srv.kill();
console.log(fails ? `${fails} FAILED` : "all ok");
process.exit(fails ? 1 : 0);
