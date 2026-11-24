// INPUTBOX-STATIC smoke (IB-1 "Soft lift", Tony Nov 24): the STATIC look of the two typed-answer inputs under html.ui-v7 only.
//   single answer box: 60px, 1.5px outline, Atkinson 600 value, Check key outside on the right (60x60), <= 400px wide on desktop.
//   multi-part rows: 36px letter column + 12 gutter, 40px bare letter, 17/24 prompt and hint, 60px field, 24px gap, no hairline.
//   flag off: the old field (no outline, --fld height, "a)" marker, no 400px cap) is untouched.
// Own serve.py + an uploaded bank. No motion, no verdict states here (later slices).   node tests/inputbox-static.smoke.mjs [port]
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
const SHOTS = process.env.SHOTS || "";
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
try { browser = await launchBrowser(pw, { args: ["--no-sandbox"] }); }
catch { browser = await launchBrowser(pw, { args: ["--no-sandbox"], executablePath: "/opt/pw-browsers/chromium" }); }
async function fresh(ui, vp) {
  const phone = vp.width < 500, ctx = await browser.newContext({ viewport: vp, hasTouch: phone, isMobile: phone, serviceWorkers: "block", deviceScaleFactor: 2 });
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
    assert.equal(m.transition, "0s", `no transition at rest (${m.transition})`);
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
    const focus = await page.evaluate(() => { const c = getComputedStyle(document.querySelector("#q .mparts .part:first-child .ff")); return { r: c.borderRadius, bw: c.borderTopWidth, sh: c.boxShadow }; });
    const tile = await page.evaluate(() => CSS.supports("corner-shape", "superellipse(2)") ? "20px" : "16px");
    assert.equal(focus.r, tile, `focus keeps the live tile radius (${focus.r}, want ${tile}); IB-2 owns the lift`);
    assert.equal(focus.bw, "1px", `focus keeps the live 1px hairline: ${JSON.stringify(focus)}`);
    assert.match(focus.sh, /rgba\(0, 0, 0, 0\.45\) 0px 2px 3px 0px inset/, "focus keeps the live well shadow: " + focus.sh);
    await page.evaluate(() => document.activeElement?.blur());
    await shot(page, `multi-${w}-app.png`, "#q");
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
    assert.equal(m.transition, "0s", `no transition at rest (${m.transition})`);
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
    await shot(page, `single-${w}-app.png`, "#q");
    return `h ${m.h} box ${m.boxW} key ${m.key.w}x${m.key.h} gap ${(m.key.left - m.boxRight).toFixed(1)}`;
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
  await step("flag off 1280: single has no 400px cap", async () => {
    await go(page, "PSY_S1A");
    const m = await page.evaluate(MET);
    assert.equal(m.maxW, "none", `flag-off max-width ${m.maxW} should stay unset`);
    return `max-width ${m.maxW}, w ${m.boxW}`;
  });
  await ctx.close();
}
/* side-by-side material: the mock's own cards at the same widths (only with SHOTS) */
if (SHOTS) {
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
        await page.locator(sel).nth(0).screenshot({ path: join(SHOTS, `multi-${w}-mock.png`) }).catch(e => console.log("mock shot", e.message.slice(0, 100)));
        await page.locator(sel).nth(1).screenshot({ path: join(SHOTS, `single-${w}-mock.png`) }).catch(e => console.log("mock shot", e.message.slice(0, 100)));
      } else console.log("mock cards not found at", w, n);
      await ctx.close();
    }
  } catch (e) { console.log("mock shots unavailable:", e.message.slice(0, 200)); }
}
await browser.close(); srv.kill();
console.log(fails ? `${fails} FAILED` : "all ok");
process.exit(fails ? 1 : 0);
