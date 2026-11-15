// F-PORT ladder + verdict smoke (PROTO-3WAY pick F, port f-port-ladder-verdict; brain ui-polish/proto3way/SPEC.md R5, REVIEW2 section 3; ui-v7-decisions VERDICT-DUCK-BLEED, CONTRAST-PORT).
// Flag ON (?ui=v7): the welcome ladder card, its chips, its Final answer input and Check button have NO border (width 0, fill steps instead), chip text >= 4.5:1, tap >= 44,
// the verdict drawer is a borderless float with only its two buttons (no duck/mask), about its flag-off height. Flag OFF (?ui=off): today's 1px edges.
// Own serve.py, throwaway banks, a stub OpenRouter (the drawer needs a live Cluck). Smoke size, feature-local:   node tests/fport-ladder-verdict.pw.mjs [port]   (SHOTS=<dir> saves screenshots)
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { skipRetryWait } from "./lib/clock.mjs";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { try { pw = require("/opt/node22/lib/node_modules/playwright"); } catch { pw = require("/opt/node-tools/node_modules/playwright"); } }

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = /^\d+$/.test(process.argv[2] || "") ? +process.argv[2] : 8897, BASE = `http://127.0.0.1:${PORT}`;
const TMP = mkdtempSync(join(tmpdir(), "fport-lv-")), BANKS = join(TMP, "banks"), SHOTS = process.env.SHOTS || "";
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const welcome = {
  code: "PHYS_FP1", type: "num", answer: "3.74", tol: 0.01, welcome: true, noob: { tier: 1 }, saccharine: { title: "Lift", tip: "Pressure = force / area.", key: "$P=F/A$\nAnswer: 3.74" },
  body: [{ type: "text", md: "A $70\\ \\text{kg}$ student on the small piston of a hydraulic lift balances a $1200\\ \\text{kg}$ elephant on the big piston, of diameter $2.0\\ \\text{m}$. Find the pressure." }],
  repair: { steps: [
    { id: "who", label: "Which weight presses on the big piston?", kind: "pick", opts: [{ id: "a", md: "the load's" }, { id: "b", md: "the air's" }], ok: "a" },
    { id: "answer", label: "Final answer", kind: "num", unit: "m/s" }
  ] }
};
const roll = { code: "PHYS_FP2", title: "Roll", type: "num", answer: "1.38", tol: 0.01, unit: "m/s", how: "Number only, in m/s.",
  body: [{ type: "text", md: "A solid sphere rolls without slipping down a 1.0 m ramp. How fast is it moving at the bottom?" }],
  wrong: [{ value: "1.636", error: "spin", hint: "QUACK. A rolling ball also spins." }, { value: "0.650", error: "trig", hint: "QUACK. Which trig function?" }],
  saccharine: { title: "Roll", key: "Use: energy with spin\nAnswer: 1.38", slip: { "1.636": "Left out the spin." } } };
mkdirSync(BANKS);
writeFileSync(join(BANKS, "BANK_FPV.json"), JSON.stringify({ v: 1, problems: [welcome, roll] }));
const stub = createServer(async (req, res) => {
  let body = ""; for await (const c of req) body += c;
  if (!JSON.parse(body || "{}").stream) { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ choices: [{ message: { content: '{"verdict": "on"}' } }] })); return; }
  res.writeHead(200, { "Content-Type": "text/event-stream" });
  res.end(`data: ${JSON.stringify({ choices: [{ delta: { content: "The ball also spins." } }] })}\n\ndata: [DONE]\n\n`);
});
await new Promise(r => stub.listen(0, "127.0.0.1", r));
const srv = spawn("python3", [join(ROOT, "server", "http_server", "serve.py"), String(PORT)], { env: { ...process.env, STEM_BANKS: BANKS, STEM_FRONT: "BANK_FPV", STEM_FRONT_TITLE: "Exam 3",
  STEM_TODAY: "2026-11-03", STEM_TRIES: join(TMP, "tries.json"), OPENROUTER_BASE: `http://127.0.0.1:${stub.address().port}`, OPENROUTER_API_KEY: "sk-test", CLAUDE_API: "" }, stdio: "ignore" });
for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + "/")).ok) break; } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 100)); }

let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); } catch (e) { failures++; console.log("FAIL", name, "\n     ", String(e.message).slice(0, 900)); }
}
const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
async function open(w, flag, hash = "") {
  const phone = w < 500;
  const ctx = await browser.newContext({ viewport: { width: w, height: phone ? 852 : 800 }, hasTouch: phone, isMobile: phone, deviceScaleFactor: 2, serviceWorkers: "block" });
  await ctx.addInitScript(() => { try { localStorage.setItem("stem-ob", "done"); localStorage.setItem("stem-jev", "0"); for (const b of ["right", "miss", "three", "redo"]) localStorage.setItem("stem-ob-rw-" + b, "9"); } catch { /* blocked */ } });
  await ctx.route(/youtube|ytimg|googlevideo/, r => r.abort());
  const page = await ctx.newPage();
  page.errs = []; page.on("pageerror", e => page.errs.push(String(e)));
  await page.goto(`${BASE}/?ui=${flag}${hash}`);
  await page.evaluate(() => document.fonts && document.fonts.ready);
  return page;
}
/* the ladder: every shown control's border width, radius, height, and chip text contrast on its composited fill */
const ladder = page => page.evaluate(() => {
  const rgba = s => { const m = /rgba?\(([^)]+)\)/.exec(s) || /color\(srgb ([^)]+)\)/.exec(s); if (!m) return [0, 0, 0, 0]; const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number); const k = /srgb/.test(s) ? 255 : 1; return [p[0] * k, p[1] * k, p[2] * k, p[3] == null ? 1 : p[3]]; };
  const over = (f, b) => [0, 1, 2].map(i => f[i] * f[3] + b[i] * (1 - f[3])).concat(1);
  const lum = c => { const [r, g, b] = c.slice(0, 3).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const bg = el => { const ch = []; for (let e = el; e; e = e.parentElement) ch.unshift(rgba(getComputedStyle(e).backgroundColor)); return ch.reduce((b, f) => over(f, b), [0, 0, 0, 1]); };
  const card = document.querySelector("#q section.wl");
  const ctl = [...document.querySelectorAll("#q section.wl :is(.rp-chip, .rp-in, .rp-check)")].filter(e => e.getClientRects().length && getComputedStyle(e).visibility === "visible");
  const bw = e => ["Top", "Right", "Bottom", "Left"].map(s => getComputedStyle(e)["border" + s + "Width"]).join(" ");
  return { card: card && { bw: bw(card), radius: getComputedStyle(card).borderTopLeftRadius, fill: getComputedStyle(card).backgroundColor },
    ctl: ctl.map(e => { const cs = getComputedStyle(e), fill = bg(e), t = over(rgba(cs.color), fill);
      return { cls: e.className, bw: bw(e), radius: cs.borderTopLeftRadius, h: Math.round(e.getBoundingClientRect().height), cr: e.matches(".rp-chip, .rp-check") ? +ratio(t, fill).toFixed(2) : null, dashed: cs.borderTopStyle === "dashed" }; }) };
});
/* open the Roll item, miss it, and return the open verdict drawer's height (the same flow for either flag) */
async function drawerH(w, flag) {
  const page = await open(w, flag, "#PHYS_FP2");
  try {
    await page.waitForSelector("#ff input, #ff textarea", { timeout: 10000 });
    const typeAnswer = async v => { await skipRetryWait(page); const f = page.locator("#ff :is(input, textarea)").first(); await f.fill(v); await f.press("Enter"); };
    await typeAnswer("1.636");
    if (!await page.waitForSelector("#q .vdrawer:not([hidden]) .wchip", { state: "visible", timeout: 4000 }).then(() => true, () => false)) {
      await page.waitForTimeout(2200); await typeAnswer("0.650");
      await page.waitForSelector("#q .vdrawer:not([hidden]) .wchip", { state: "visible", timeout: 6000 });
    }
    await page.waitForTimeout(600);
    return await page.evaluate(() => document.querySelector("#q .vdrawer:not([hidden])").getBoundingClientRect().height);
  } finally { await page.context().close(); }
}
const ZERO = "0px 0px 0px 0px";
const W = [390, 1366];
try {
  for (const w of W) {
    await step(`${w}: flag on: ladder card, chips, input, Check have no border; chip text >= 4.5:1; tap >= 44`, async () => {
      const page = await open(w, "v7");
      try {
        await page.waitForSelector('#q section.wl .rp-step[data-state="active"] .rp-chip', { timeout: 10000 });
        await page.waitForTimeout(400);
        const m = await ladder(page);
        if (SHOTS) await page.locator("#q section.wl").screenshot({ path: join(SHOTS, `ladder-${w}.png`) });
        assert.equal(m.card.bw, ZERO, "card border " + JSON.stringify(m.card));
        assert.equal(m.card.radius, "16px");
        assert.notEqual(m.card.fill, "rgba(0, 0, 0, 0)", "the card is a fill");
        assert.ok(m.ctl.length >= 3, "chips + input + check shown: " + JSON.stringify(m.ctl));
        const bad = m.ctl.filter(c => c.bw !== ZERO || c.radius.includes("%") || (c.cr != null && c.cr < 4.5) || c.h < 44);
        assert.deepEqual(bad, [], "a control with an edge, a circle, <4.5:1 or <44px: " + JSON.stringify(m.ctl));
        const lines = await page.evaluate(() => [...document.querySelectorAll("#q section.wl, #q section.wl *")].filter(e => !e.closest(".katex") && e.getClientRects().length && !e.matches(":focus-visible, .bad")).map(e => { const cs = getComputedStyle(e); return { cls: String(e.className).slice(0, 30) || e.tagName, bw: ["Top", "Right", "Bottom", "Left"].map(x => cs["border" + x + "Width"]).join(" ") }; }).filter(x => x.bw !== "0px 0px 0px 0px"));
        assert.deepEqual(lines, [], "a border left inside the ladder card at rest: " + JSON.stringify(lines));
        // type into the Final-answer path: pick a chip, the next step's input appears; focus ring is an outline, not a border
        await page.click('#q section.wl .rp-step[data-state="active"] .rp-chip');
        const inp = await page.waitForSelector("#q section.wl .rp-in", { state: "visible", timeout: 6000 });
        await inp.focus();
        const f = await page.evaluate(() => { const e = document.querySelector("#q section.wl .rp-in"), cs = getComputedStyle(e); return { bw: cs.borderTopWidth, ow: cs.outlineWidth, os: cs.outlineStyle }; });
        assert.deepEqual(f, { bw: "0px", ow: "2px", os: "solid" }, "focused input: 2px ring only");
        assert.deepEqual(page.errs, [], "page errors");
      } finally { await page.context().close(); }
    });
    await step(`${w}: flag on: wrong row: no tray exists (VERDICT-CARD #563, CLUCK-BTN), the X slot is a plain status icon`, async () => {
      const page = await open(w, "v7", "#PHYS_FP2");
      try {
        await page.waitForSelector("#ff input, #ff textarea", { timeout: 10000 });
        const typeAnswer = async v => { await skipRetryWait(page); const f = page.locator("#ff :is(input, textarea)").first(); await f.fill(v); await f.press("Enter"); };
        await typeAnswer("1.636");
        await page.waitForFunction(() => window.__drill && window.__drill.state && window.__drill.state.tries.length === 1, null, { timeout: 6000 });
        await page.waitForFunction(() => { const b = document.querySelector("#cluckBtn"); return !!b && !b.hasAttribute("aria-disabled"); }, null, { timeout: 8000 });   // CLUCK-BTN: the one button on the card replaces the tray
        await page.waitForTimeout(600);
        const d = await page.evaluate(() => { const e = document.querySelector("#q .vdrawer"); return { shown: !!e && e.getClientRects().length > 0 }; });
        const bad = await page.evaluate(() => { const e = document.querySelector("#q .ff.bad, #q .ff.rbox.cue:not(.ok)"); if (!e) return null; const cs = getComputedStyle(e), i = getComputedStyle(e.querySelector("input") || e);
          return { bw: ["Top", "Right", "Bottom", "Left"].map(x => cs["border" + x + "Width"]).join(" "), bg: cs.backgroundColor, color: i.color }; });
        const kids = await page.evaluate(() => [...document.querySelectorAll("#q .ff.bad *, #q .ff.rbox.cue:not(.ok) *")].filter(e => e.getClientRects().length).map(e => { const cs = getComputedStyle(e); return { c: String(e.className.baseVal ?? e.className).slice(0, 24) || e.tagName, bw: cs.borderTopWidth + cs.borderRightWidth + cs.borderBottomWidth + cs.borderLeftWidth }; }).filter(x => x.bw !== "0px0px0px0px"));
        assert.deepEqual(kids, [], "a border inside the wrong box (its X button): " + JSON.stringify(kids));
        const slot = await page.evaluate(() => { const ff = document.querySelector("#q .ff.bad"), b = ff.querySelector(".btn-go"), cs = getComputedStyle(b), r = ff.getBoundingClientRect(), hit = document.elementFromPoint(r.right - 2, r.bottom - 2);
          return { bg: cs.backgroundColor, bw: cs.borderTopWidth, dotR: getComputedStyle(ff, "::after").borderTopLeftRadius, dotOutline: getComputedStyle(ff, "::after").outlineWidth, hit: !!hit && !!hit.closest(".ff"), hitDrawer: !!hit && !!hit.closest(".vdrawer"), shadow: getComputedStyle(ff).boxShadow }; });
        assert.equal(slot.bg, "rgba(0, 0, 0, 0)", "the X slot is no raised tile (ui-v7: glyph only)"); assert.equal(slot.bw, "0px");
        assert.ok(!slot.hitDrawer, "the tray must not show in the row's rounded bottom-right corner: " + JSON.stringify(slot));
        assert.ok(slot.dotR !== "50%" && slot.dotOutline === "0px", "the Cluck dot is no circle / no ring: " + slot.dotR + " " + slot.dotOutline);
        const wait = await page.evaluate(() => { const b = document.querySelector("#q .ff.bad .btn-go"), cs = b && getComputedStyle(b, "::before"); return b && b.classList.contains("waiting") ? { bgi: cs.backgroundImage, h: cs.height, name: cs.animationName } : null; });
        if (SHOTS && wait) await page.screenshot({ path: join(SHOTS, `waiting-${w}.png`) });
        assert.ok(!wait || (wait.bgi === "none" && wait.name === "vd-wait"), "the retry wait keeps its keyframes (under ui-v7 the bar is not painted): " + JSON.stringify(wait));
        const ln = await page.evaluate(() => { const l = document.querySelector("#q .ansl"), d = document.querySelector("#q .vdrawer:not([hidden])"); if (!l || !d || !l.getClientRects().length) return null; const a = l.getBoundingClientRect(), b = d.getBoundingClientRect(); return { a: a.toJSON(), b: b.toJSON(), hit: !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top + 0.5 || a.top >= b.bottom) }; });
        assert.ok(!ln || !ln.hit, "the verdict line is covered by the tray: " + JSON.stringify(ln));
        assert.notEqual(slot.shadow, "none", "the row casts a shadow onto the tray");
        if (SHOTS) { const bb = await page.locator("#q .ff.bad").boundingBox(); await page.screenshot({ path: join(SHOTS, `corner-${w}.png`), clip: { x: Math.max(0, bb.x + bb.width - 120), y: bb.y + bb.height - 40, width: 120 + 8, height: 100 } }); }
        assert.ok(bad, "a judged-wrong typed box");
        assert.equal(bad.bw, ZERO, "wrong box has no dash: " + JSON.stringify(bad));
        assert.equal(bad.bg, "rgb(62, 20, 30)", "the MC bento wrong fill #3e141e");
        const L = c => { const [r, g, b] = c.match(/[\d.]+/g).slice(0, 3).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
        const cr = (L(bad.color) + 0.05) / (L(bad.bg) + 0.05); assert.ok(cr >= 4.5, "wrong text contrast " + cr.toFixed(2));
        if (SHOTS) { await page.locator("#q .ff.bad").scrollIntoViewIfNeeded(); await page.screenshot({ path: join(SHOTS, `verdict-${w}.png`) }); }
        assert.equal(d.shown, false, "no verdict tray is shown under the row");
        assert.deepEqual(page.errs, [], "page errors");
      } finally { await page.context().close(); }
    });
  }
  for (const w of W) await step(`${w}: flag on: right answer = green row (no border), tick slot --correct-deep, verdict line stays hidden (live region), no tray`, async () => {
    const page = await open(w, "v7", "#PHYS_FP2");
    try {
      await page.waitForSelector("#ff input, #ff textarea", { timeout: 10000 });
      await skipRetryWait(page); const f = page.locator("#ff :is(input, textarea)").first(); await f.fill("1.38"); await f.press("Enter");
      await page.waitForSelector("#q .ff.rbox.ok .vk", { timeout: 8000 }); await page.waitForTimeout(900);
      const m = await page.evaluate(() => { const ff = document.querySelector("#q .ff.rbox.ok"), v = ff.querySelector(".vk"), cs = getComputedStyle(v), fs = getComputedStyle(ff);
        return { row: fs.backgroundColor, rbw: ["Top", "Right", "Bottom", "Left"].map(x => fs["border" + x + "Width"]).join(" "), ln: (() => { const l = document.querySelector("#q .ansl"), d = document.querySelector("#q .vdrawer"); if (!l || !d) return { missing: !l ? "line" : "drawer" }; const a = l.getBoundingClientRect(), b = d.getBoundingClientRect(); return { hit: !(!d || d.getClientRects().length === 0) || (a.width > 2 && a.height > 2) }; })(), slot: cs.backgroundColor, h: v.getBoundingClientRect().height, text: getComputedStyle(ff.querySelector("input")).color }; });
      assert.equal(m.slot, "rgba(0, 0, 0, 0)", "tick is glyph only, no --correct-deep tile"); assert.equal(m.row, "rgb(12, 44, 34)", "row = #0c2c22");
      assert.equal(m.rbw, ZERO, "the right row has no border: " + m.rbw);
      assert.ok(m.ln && !m.ln.hit, "the verdict line must stay visually hidden and no tray shown (VERDICT-CARD): " + JSON.stringify(m.ln));
      // the correct fill is the MC bento right tile: --mc-right #0c2c22 + --correct-on text (#b9efd8), on the reveal pill and on a plain judged-right box
      assert.equal(m.text, "rgb(185, 239, 216)", "right text = --correct-on: " + m.text);
      const plain = await page.evaluate(() => { const ff = document.querySelector("#q .ff.rbox.ok"); ff.classList.remove("rbox"); const cs = getComputedStyle(ff), i = getComputedStyle(ff.querySelector("input"));
        return { bg: cs.backgroundColor, bw: cs.borderTopWidth, r: cs.borderTopLeftRadius, color: i.color }; });
      assert.deepEqual(plain, { bg: "rgb(12, 44, 34)", bw: "0px", r: "16px", color: "rgb(185, 239, 216)" }, "the plain judged-right box = the MC right tile (was the soft --correct-fill): " + JSON.stringify(plain));
      if (SHOTS) await page.screenshot({ path: join(SHOTS, `right-${w}.png`) });
    } finally { await page.context().close(); }
  });
  for (const w of W) await step(`${w}: flag on: typed answer field is a borderless inset well in idle, focus and typed (no border line, the glow on focus)`, async () => {
    const page = await open(w, "v7", "#PHYS_FP2");
    try {
      await page.waitForSelector("#ff input, #ff textarea", { timeout: 10000 });
      await page.waitForTimeout(300);
      const read = () => page.evaluate(() => { const ff = document.querySelector("#q #ff.ff"), cs = getComputedStyle(ff);
        return { bw: ["Top", "Right", "Bottom", "Left"].map(x => cs["border" + x + "Width"]).join(" "), shadow: cs.boxShadow, bg: cs.backgroundColor }; });
      const idle = await read();
      assert.equal(idle.bw, ZERO, "idle: no border " + JSON.stringify(idle));
      assert.ok(/rgba\(0, 0, 0, 0\.45\) 0px 2px 3px 0px inset/.test(idle.shadow) && /rgb\(42, 58, 102\) 0px -1px 0px 0px inset/.test(idle.shadow), "idle: inset top shadow + lighter bottom lip: " + idle.shadow);
      await page.locator("#ff :is(input, textarea)").first().focus(); await page.waitForTimeout(250);
      const focus = await read();
      assert.equal(focus.bw, ZERO, "focus: no border " + JSON.stringify(focus));
      assert.ok(!/0px 0px 0px 2px/.test(focus.shadow), "focus (mouse): no glow ring, the well only: " + focus.shadow);
      await page.locator("#ff :is(input, textarea)").first().fill("1.5"); await page.waitForTimeout(250);
      const typed = await read();
      assert.equal(typed.bw, ZERO, "typed: no border " + JSON.stringify(typed));
      assert.deepEqual(page.errs, [], "page errors");
    } finally { await page.context().close(); }
  });
  for (const w of W) await step(`${w}: flag on: the typed field's tick/cross is no button (aria-hidden, no tab stop); a tap shows the toast, opens nothing`, async () => {
    const page = await open(w, "v7", "#PHYS_FP2");
    try {
      await page.waitForSelector("#ff input, #ff textarea", { timeout: 10000 });
      await skipRetryWait(page); const f = page.locator("#ff :is(input, textarea)").first(); await f.fill("1.636"); await f.press("Enter");
      await page.waitForSelector("#q .ff.bad .vk", { timeout: 8000 }); await page.waitForTimeout(600);
      const a = await page.evaluate(() => { const v = document.querySelector("#q .ff .vk"); return { role: v.getAttribute("role"), tab: v.getAttribute("tabindex"), hidden: v.getAttribute("aria-hidden"), expanded: v.getAttribute("aria-expanded") }; });
      assert.deepEqual(a, { role: null, tab: null, hidden: "true", expanded: null }, "the mark is decoration: " + JSON.stringify(a));
      await page.locator("#q .ff .vk").first().click({ force: true });
      await page.waitForFunction(() => [...document.querySelectorAll(".stoast-t")].some(e => e.textContent.trim() === "Tap Ask Cluck for help" && e.getClientRects().length), null, { timeout: 12000 }).then(() => true, () => false)
        .then(ok => assert.ok(ok, "the tap shows the toast 'Tap Ask Cluck for help'"));
      const drawer = await page.evaluate(() => { const d = document.querySelector("#q .vdrawer:not([hidden])"); return !!d && d.getClientRects().length > 0; });
      assert.equal(drawer, false, "nothing else opens (no verdict drawer)");
      assert.deepEqual(page.errs, [], "page errors");
    } finally { await page.context().close(); }
  });
  for (const w of W) await step(`${w}: flag on (round 3): the cross and tick sit vertically centred, no dot or bar under them; no caption; focus by mouse = no ring, by Tab = outline`, async () => {
    const page = await open(w, "v7", "#PHYS_FP2");
    try {
      await page.waitForSelector("#ff input, #ff textarea", { timeout: 10000 });
      await skipRetryWait(page); const f = page.locator("#ff :is(input, textarea)").first(); await f.fill("1.636"); await f.press("Enter");
      await page.waitForSelector("#q .ff.bad .vk", { timeout: 8000 }); await page.waitForTimeout(500);
      const geo = () => page.evaluate(() => { const ff = document.querySelector("#q #ff.ff"), v = ff.querySelector(".vk"), r = ff.getBoundingClientRect(), vr = v.getBoundingClientRect();
        const painted = [...ff.querySelectorAll("*")].filter(e => !e.closest(".vk") && e.getClientRects().length && e.getBoundingClientRect().right > r.right - 60 && getComputedStyle(e).backgroundColor !== "rgba(0, 0, 0, 0)" && e.className !== "send").map(e => String(e.className || e.tagName).slice(0, 30));
        const wb = ff.querySelector(".btn-go"), wd = wb && getComputedStyle(wb, "::before").display;
        return { dy: Math.abs((vr.top + vr.height / 2) - (r.top + r.height / 2)), right: Math.round(r.right - vr.right), painted, wd }; });
      const wrong = await geo();
      assert.ok(wrong.dy <= 1, "wrong: the cross is vertically centred: " + JSON.stringify(wrong));
      assert.equal(wrong.wd, "none", "wrong: no red bar / dot under the cross");
      assert.deepEqual(wrong.painted, [], "wrong: nothing painted in the field's right 60px except the mark");
      await page.locator("#ff :is(input, textarea)").first().focus();
            // caption gone, mouse focus: no ring
      await page.locator("#q #ff.ff input").first().click({ force: true }); await page.waitForTimeout(250);
      const mouse = await page.evaluate(() => { const ff = document.querySelector("#q #ff.ff"), i = ff.querySelector("input"), cs = getComputedStyle(i), fl = ff.querySelector(".fl");
        return { ol: cs.outlineStyle, sh: getComputedStyle(ff).boxShadow, fl: fl ? getComputedStyle(fl).display : "none", ptr: ff.hasAttribute("data-ptr") }; });
      assert.equal(mouse.fl, "none", "no caption"); assert.ok(!mouse.ol || mouse.ol === "none", "mouse focus: no outline: " + JSON.stringify(mouse));
      assert.ok(!/0px 0px 0px 2px/.test(mouse.sh), "mouse focus: no glow ring: " + mouse.sh);
      assert.deepEqual(page.errs, [], "page errors");
    } finally { await page.context().close(); }
  });
  for (const w of W) await step(`${w}: flag on (round 4): a fresh field, Tab in = the offset outline on the whole field (not the input), no glow; mouse focus = no ring`, async () => {
    const page = await open(w, "v7", "#PHYS_FP2");
    try {
      await page.waitForSelector("#ff input, #ff textarea", { timeout: 10000 });
      await page.evaluate(() => { document.activeElement && document.activeElement.blur(); document.body.focus(); });
      let hit = false; for (let k = 0; k < 40 && !hit; k++) { await page.keyboard.press("Tab"); hit = await page.evaluate(() => document.activeElement.tagName === "INPUT" && !!document.activeElement.closest("#q #ff.ff")); }
      assert.ok(hit, "Tab reaches the field");
      const kb = await page.evaluate(() => { const i = document.activeElement, ff = getComputedStyle(document.querySelector("#q #ff.ff")); return { input: getComputedStyle(i).outlineStyle, ol: ff.outlineStyle, w: ff.outlineWidth, off: ff.outlineOffset, sh: ff.boxShadow }; });
      assert.deepEqual([kb.input, kb.ol, kb.w, kb.off], ["none", "solid", "2px", "4px"], "keyboard focus: the outline wraps the field: " + JSON.stringify(kb));
      assert.ok(!/0px 0px 0px 2px/.test(kb.sh), "no glow ring: " + kb.sh);
      await page.evaluate(() => document.activeElement.blur());
      await page.locator("#q #ff.ff input").first().click({ force: true }); await page.waitForTimeout(200);
      const ms = await page.evaluate(() => getComputedStyle(document.querySelector("#q #ff.ff")).outlineStyle);
      assert.ok(ms === "none", "mouse focus: no ring: " + ms);
      assert.deepEqual(page.errs, [], "page errors");
    } finally { await page.context().close(); }
  });
  for (const w of W) await step(`${w}: flag on (round 4): typed + Enter (keyboard): the judged input shows no outline; the cross and the tick are centred on the pill within 1px`, async () => {
    const page = await open(w, "v7", "#PHYS_FP2");
    try {
      await page.waitForSelector("#ff input, #ff textarea", { timeout: 10000 });
      const tabTo = async () => { await page.evaluate(() => { document.activeElement && document.activeElement.blur(); document.body.focus(); }); for (let k = 0; k < 40; k++) { await page.keyboard.press("Tab"); if (await page.evaluate(() => document.activeElement.tagName === "INPUT" && !!document.activeElement.closest("#ff"))) return; } throw new Error("Tab never reached the field"); };
      const dy = () => page.evaluate(() => { const ff = document.querySelector("#q #ff.ff"), v = ff.querySelector(".vk"), r = ff.getBoundingClientRect(), vr = v.getBoundingClientRect(); return { dy: +((vr.top + vr.height / 2) - (r.top + r.height / 2)).toFixed(1), input: getComputedStyle(ff.querySelector("input")).outlineStyle, cls: ff.className }; });
      await tabTo(); await page.keyboard.type("1.636"); await page.keyboard.press("Enter");
      await page.waitForSelector("#q .ff.bad .vk", { timeout: 9000 }); await page.waitForTimeout(500);
      const wrong = await dy();
      assert.ok(Math.abs(wrong.dy) <= 1, "wrong: the cross centred on the field within 1px: " + JSON.stringify(wrong));
      assert.equal(wrong.input, "none", "wrong: the judged input shows no outline (a keyboard submit): " + JSON.stringify(wrong));
      await page.waitForFunction(() => !window.__drill.state.wait, null, { timeout: 12000 });
      await tabTo(); await page.keyboard.type("1.38"); await page.keyboard.press("Enter");
      await page.waitForSelector("#q .ff.rbox.ok .vk", { timeout: 9000 }); await page.waitForTimeout(800);
      const right = await dy();
      assert.ok(Math.abs(right.dy) <= 1, "correct: the tick centred on the pill within 1px: " + JSON.stringify(right));
      assert.equal(right.input, "none", "correct: no input outline: " + JSON.stringify(right));
      assert.deepEqual(page.errs, [], "page errors");
    } finally { await page.context().close(); }
  });
  await step("flag off: ladder keeps its 1px edges", async () => {
    const page = await open(1366, "off");
    try {
      await page.waitForSelector('#q section.wl .rp-step[data-state="active"] .rp-chip', { timeout: 10000 });
      const m = await ladder(page);
      assert.equal(m.card.bw, "1px 1px 1px 1px", "card keeps its rim");
      assert.ok(m.ctl.some(c => c.bw === "1px 1px 1px 1px"), "chips keep their edge: " + JSON.stringify(m.ctl));
    } finally { await page.context().close(); }
  });
} finally {
  await browser.close(); srv.kill(); stub.close();
}
if (failures) { console.log(`${failures} FAILED`); process.exit(1); }
console.log("all ok");
