// INPUTBOX-STATIC smoke (IB-1 "Soft lift" + IB-2 focus/typing + IB-3 thinking, Tony Nov 24): the look and motion of the two typed-answer inputs under html.ui-v7 only.
//   single answer box: 60px, 1.5px outline, Atkinson 600 value, Check key outside on the right (60x60), <= 400px wide on desktop.
//   multi-part rows: 36px letter column + 12 gutter, 40px bare letter, 17/24 prompt and hint, 60px field, 24px gap, no hairline.
//   IB-2: focus = scale(1.014) in place + shadow underneath + --action 75% edge (.42s); key press nudges the edge 90%/60% and back in ~320ms;
//   judged fields never lift; reduced motion = colours only.
//   IB-3: while a typed answer is checked the ring animates ONLY transform (perimeter-spaced rotate keyframes: equal px/step on 286x60 and
//   400x60), the box sinks scale(.986), the input is readOnly, the typed key loses app.css's spinner (MC keeps it), reduced motion = a static
//   --action ring, no sink/blur.   flag off: nothing.   Own serve.py + an uploaded bank. No verdict look here (later slices).
//   node tests/inputbox-static.smoke.mjs [port]      SHOTS=<dir> also writes app + mock stills.
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
  { code: "PSY_C1A", type: "mc", pick: "all", how: "Tick all that apply.", body: T("Tick the even numbers."),
    choices: [{ id: "a", md: "2" }, { id: "b", md: "3" }], correct: ["a"],
    wrong: [{ match: "b", error: "pick", hint: "3 is odd." }] },
] };
const srv = spawn("python3", [join(ROOT, "server", "http_server", "serve.py"), String(PORT)], { env: { ...process.env, STEM_TRIES: TRIES, STEM_TODAY: "2026-11-24" }, stdio: "ignore" });
await serverUp(BASE);
let fails = 0;
async function step(name, fn) {
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
async function holdGrade(page, codes) {
  let release; const held = new Promise(f => { release = f; });
  await page.evaluate(cs => {
    window.__ib3has = window.stemOffline.has;
    window.stemOffline.has = c => cs.indexOf(c) >= 0 ? false : window.__ib3has(c);
  }, codes);
  await page.route("**/check", async r => {
    if (r.request().method() !== "POST") return r.continue();
    await held;
    await r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ verdict: "correct", triesLeft: 1 }) });
  });
  return {
    release,
    async done() {
      await page.unroute("**/check");
      await page.evaluate(() => { if (window.__ib3has) { window.stemOffline.has = window.__ib3has; delete window.__ib3has; } });
    },
  };
}
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
const SCALE = "matrix(1.014, 0, 0, 1.014, 0, 0)";
async function shot(page, name, sel) {
  if (!SHOTS) return;
  try { await page.locator(sel).first().screenshot({ path: join(SHOTS, name) }); }
  catch (e) { console.log("shot skip", name, e.message.slice(0, 120)); }
}
for (const vp of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
  const w = vp.width, { ctx, page } = await fresh(true, vp);
  await step(`${w}: multi field at rest`, async () => {
    await go(page, "PSY_M1A");
    const m = await page.evaluate(MET);
    await page.locator("#q .mparts .part").first().hover().catch(() => {});
    const hoverCol = await page.evaluate(() => { const s = getComputedStyle(document.querySelector("#q .mparts .part > .ff")); return s.outlineStyle !== "none" ? s.outlineColor : s.borderTopColor; });
    assert.equal(m.kind, "multi");
    assert.ok(near(m.h, 60), `field height ${m.h} (want 60)`);
    assert.equal(m.edgeStyle, "solid", `edge style ${m.edgeStyle}`);
    assert.match(m.authored, /1\.5px/, `authored edge ${m.authored}`);
    assert.ok(m.edgeW === "1.5px" || m.edgeW === "1px", `computed edge width ${m.edgeW} (Chromium rounds 1.5px to 1)`);
    assert.match(m.transition, /0\.42s/, `IB-2 transition at rest (${m.transition})`);
    assert.equal(m.animation, "none", `no animation at rest (${m.animation})`);
    assert.match(m.font, /Atkinson/i, "value face is Atkinson: " + m.font);
    assert.equal(m.fweight, "600", `value weight ${m.fweight}`);
    assert.equal(m.mk, "a", `letter is bare: ${JSON.stringify(m.mk)}`);
    assert.equal(m.mkSize, "40px", `letter size ${m.mkSize}`);
    assert.match(m.mkFamily, /Schibsted/i, "letter face is the app's display face: " + m.mkFamily);
    assert.ok(near(m.mkBase, m.prBase, 1), `letter/prompt line baselines ${m.mkBase} vs ${m.prBase}`);
    assert.ok(near(m.mkGlyph, m.prGlyph, 1), `letter/prompt GLYPH baselines ${m.mkGlyph} vs ${m.prGlyph}`);
    if (w >= 900) assert.ok(near(m.valueBase, m.prBase, 1), `value/prompt baselines ${m.valueBase} vs ${m.prBase}`);
    assert.equal(m.prSize, "17px", `prompt size ${m.prSize}`);
    assert.equal(m.prLh, "24px", `prompt leading ${m.prLh}`);
    assert.ok(parseFloat(m.skin.pr) >= 48, `multi field right padding ${m.skin.pr} (live in-box Check room)`);
    assert.ok(m.overflow <= 0, `sideways overflow ${m.overflow}px at ${w}`);
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
    assert.notEqual(bad.bg, idle.bg, `multi wrong fill is still the idle ground (${bad.bg})`);
    assert.ok(bad.bw === "0px" || bad.bs === "none", `multi wrong edge is still the resting 1.5px border (${bad.bw} ${bad.bs})`);
    assert.notEqual(bad.sh, idle.sh, "multi wrong keeps the inset dish instead of the verdict raise");
    return `h ${m.h} edge ${m.edgeW} gap ${m.overflow} line ${m.mkBase}/${m.prBase} glyph ${m.mkGlyph}/${m.prGlyph}${w >= 900 ? " value " + m.valueBase : ""} bad ${bad.bg} ${bad.bw}`;
  });
  await step(`${w}: single field at rest + key outside`, async () => {
    await go(page, "PSY_S1A");
    const m = await page.evaluate(MET);
    assert.equal(m.kind, "single");
    assert.ok(near(m.h, 60), `field height ${m.h} (want 60)`);
    assert.equal(m.edgeStyle, "solid", `edge style ${m.edgeStyle}`);
    assert.match(m.authored, /1\.5px/, `authored edge ${m.authored}`);
    assert.ok(m.edgeW === "1.5px" || m.edgeW === "1px", `computed edge width ${m.edgeW} (Chromium rounds 1.5px to 1)`);
    assert.match(m.transition, /0\.42s/, `IB-2 transition at rest (${m.transition})`);
    assert.equal(m.animation, "none", `no animation at rest (${m.animation})`);
    assert.match(m.font, /Atkinson/i, "value face is Atkinson: " + m.font);
    assert.equal(m.fsize, "28px", `value size ${m.fsize}`);
    assert.equal(m.fweight, "600", `value weight ${m.fweight}`);
    assert.ok(m.unit, "the unit is in the box");
    assert.equal(m.unitSize, "17px", `unit size ${m.unitSize}`);
    assert.match(m.unitFamily, /Atkinson/i, "unit face is Atkinson: " + m.unitFamily);
    assert.ok(m.key, "the Check key is on the page");
    assert.ok(near(m.key.w, 60) && near(m.key.h, 60), `key ${m.key.w}x${m.key.h} (want 60x60)`);
    assert.ok(m.key.left >= m.boxRight + 11 && m.key.left <= m.boxRight + 13, `key sits 12px right of the box: ${m.key.left} vs ${m.boxRight}`);
    assert.ok(near(m.key.top, m.boxTop, 1), `key is level with the box: ${m.key.top} vs ${m.boxTop}`);
    if (w >= 900) {
      assert.equal(m.maxW, "400px", `single box max-width ${m.maxW}`);
      assert.ok(m.boxW <= 400.5, `single box ${m.boxW} wide (cap 400)`);
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
        return {
          tr: getComputedStyle(ff).transform, ro: inp.readOnly, busy: ff.getAttribute("aria-busy"),
          anims: anims.length, keys, names: anims.map(a => a.animationName || ""),
          ringOp: +getComputedStyle(ring).opacity, ringPad: getComputedStyle(ring).paddingTop, rings: ff.querySelectorAll(".ib3-ring").length,
          glowFilter: getComputedStyle(glow).filter, glowOp: +getComputedStyle(glow).opacity,
          blur: getComputedStyle(inp).filter, blurUnit: unit ? getComputedStyle(unit).filter : "blur(0.8px)",
          keyOp: +getComputedStyle(key).opacity, after: ka.content, afterAnim: ka.animationName,
          arrow: getComputedStyle(key.querySelector(".ib1-go")).display,
          fv: ff.matches(":has(input:focus-visible)"), ol: getComputedStyle(ff).outlineStyle,
          ow: getComputedStyle(ff).outlineWidth, bc: getComputedStyle(ff).borderTopColor,
        };
      });
      assert.match(t.tr, /matrix\(0\.986, 0, 0, 0\.986/, `the box sinks to .986: ${t.tr}`);
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
    assert.match(f.dur, /0\.42s/, `transform + shadow share .42s (${f.dur})`);
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
  await step(`${w}: single wrong keeps the live verdict fill`, async () => {
    await go(page, "PSY_S2A");
    const idle = (await page.evaluate(MET)).skin;
    await page.fill("#ans", "9.9"); await page.press("#ans", "Enter");
    await page.waitForSelector("#q #ff.bad", { timeout: 6000 });
    const bad = await skinOf(page, "#q #ff.bad");
    assert.notEqual(bad.bg, idle.bg, `single wrong fill is still the idle ground (${bad.bg})`);
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
    assert.notEqual(ok.bg, idle.bg, `single right fill is still the idle ground (${ok.bg})`);
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
      assert.match(m[0].tr, /matrix\(0\.986, 0, 0, 0\.986/, `the checked part sinks: ${m[0].tr}`);
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
    await shot(page, "multi-390-off-app.png", "#q");
    await page.evaluate(() => document.documentElement.classList.add("ui-v7"));
    const late = await page.evaluate(() => ({ mk: document.querySelector(".mk").innerText, paren: getComputedStyle(document.querySelector(".mk-p")).display }));
    assert.equal(late.mk, "a", `late ui-v7 marker ${JSON.stringify(late.mk)}`);
    assert.equal(late.paren, "none", "late ui-v7 still shows the )");
    await page.evaluate(() => document.documentElement.classList.remove("ui-v7"));
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
