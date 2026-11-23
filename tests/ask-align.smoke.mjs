// ASK-ALIGN state matrix (Tony, Nov 22). ONE invariant for Cluck's ask field, checked in every state we could think of:
//   empty field   = one line (height <= 50px) and the placeholder line's centre within 2px of the send button's centre;
//   one typed line = the same for the caret line; many lines grow the field, clearing it (any way) shrinks it back to one line.
// Each state prints one line: ok/FAIL + the numbers (h = field height, d = line centre minus button centre, px).
// Own serve.py + an uploaded bank; /explain and /chat are stubbed (no LLM).   node tests/ask-align.smoke.mjs [port] [shots dir]
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
const ROOT = join(dirname(fileURLToPath(import.meta.url)), ".."), PORT = +(process.argv[2] || 8849), BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = process.argv[3] || ""; if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const TRIES = join(mkdtempSync(join(tmpdir(), "askal-")), "tries.json");
const P = (code, md) => ({ code, type: "num", answer: "42", tol: 0.01, wish: true, how: "Number only.", body: [{ type: "text", md }] });
const FILE = { v: 1, problems: [P("PSY_T61", "What is six times seven? Say it as a number."), P("PSY_T62", "What is six times eight? Say it as a number.")] };
const srv = spawn("python3", [join(ROOT, "server", "http_server", "serve.py"), String(PORT)], { env: { ...process.env, STEM_TRIES: TRIES, STEM_TODAY: "2026-10-23" }, stdio: "ignore" });
await serverUp(BASE);
let fails = 0;
async function step(name, fn) {
  try { const info = await fn(); console.log("ok  ", name, info ? `  [${info}]` : ""); }
  catch (e) { fails++; console.log("FAIL", name, "\n     ", String(e.message).slice(0, 500)); }
}
const browser = await launchBrowser(pw, { args: ["--no-sandbox"] });
const TA = "#cluck .ask textarea", SEND = "#cluck .ask .send";
const nap = (page, ms = 250) => page.waitForTimeout(ms);
const live = page => page.evaluate(sel => { const t = document.querySelector(sel); return !!t && !t.disabled && t.getClientRects().length > 0; }, TA);   // the field is open to type in (not a locked strip, not gone)

// a desktop page with Cluck's idle box open, or a phone page after one wrong answer. o: dsf, motion (real motion on), fontDelay (ms to hold the webfonts)
async function open(vp, o = {}) {
  const phone = vp.width < 500;
  const ctx = await browser.newContext({ viewport: vp, hasTouch: phone, isMobile: phone, serviceWorkers: "block", deviceScaleFactor: o.dsf || 1, ...(o.motion ? { reducedMotion: "no-preference" } : {}) });
  await ctx.addCookies([{ name: "stem-mode-v", value: "2", url: BASE }]);
  await ctx.addInitScript(() => { try { localStorage.setItem("stem-ob", "done"); } catch { /* */ } });
  const page = await ctx.newPage(); page.mode = "ok";
  await page.route("**/chat", r => {                                          // /chat by mode: ok | 404 | 500 | abort | limit
    const m = page.mode;
    if (m === "404") return r.fulfill({ status: 404, body: "no" });
    if (m === "500") return r.fulfill({ status: 500, body: "boom" });
    if (m === "abort") return r.abort("failed");
    if (m === "limit") return r.fulfill({ status: 429, contentType: "application/json", body: JSON.stringify({ error: "limit" }) });
    return r.fulfill({ status: 200, contentType: "text/plain; charset=utf-8", body: "Quack. Because six times seven is forty-two.\n" });
  });
  await page.route("**/explain", r => r.fulfill({ status: 200, contentType: "text/plain; charset=utf-8", body: "POOF! A short canned reply.\n" }));
  if (o.fontDelay) await page.route(/\.woff2?(\?|$)/, async r => { await new Promise(res => setTimeout(res, o.fontDelay)); r.continue().catch(() => {}); });
  await page.goto(`${BASE}/?ui=v7`);
  const [fc] = await Promise.all([page.waitForEvent("filechooser"), page.click("#upload")]);
  await fc.setFiles({ name: "ask.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(FILE)) });
  await page.waitForFunction(() => (document.querySelector("#pcode")?.textContent || "") === "PSY_T61" && !document.querySelector("#freeze").hidden, null, { timeout: 8000 });
  await settled(page);
  /* a wrong answer makes the sheet + its ask field. Nov 22 (the glass Ask bar): before the first try the field is a locked strip on desktop too, so every page lands one wrong try first */
  await page.click("#ans"); await page.keyboard.type("7"); await page.keyboard.press("Enter");
  await page.waitForFunction(() => window.__drill.state.tries.length > 0, null, { timeout: 10000 }); await page.waitForTimeout(1000);
  if (phone) await page.evaluate(() => window.stemClOpen("explain", null));
  else await page.click("#cluckBtn", { force: true });
  await page.waitForSelector(TA, { state: "visible", timeout: 8000 });
  await page.waitForFunction(sel => { const t = document.querySelector(sel); return !!t && !t.disabled; }, TA, { timeout: 10000 });
  await settled(page, "#cluck");
  return { ctx, page };
}
// the text line's centre (the textarea's content box: padding-top + half a line) against the send button's centre
const geo = page => page.evaluate(() => {
  const ta = document.querySelector("#cluck .ask textarea"), sd = document.querySelector("#cluck .ask .send");
  if (!ta || !sd) return null;
  const cs = getComputedStyle(ta), r = ta.getBoundingClientRect(), s = sd.getBoundingClientRect(), px = v => parseFloat(v) || 0;
  const top = r.top + px(cs.paddingTop) + px(cs.borderTopWidth), lh = px(cs.lineHeight) || px(cs.fontSize) * 1.4;
  const lf = document.querySelector("#cluck .ask .left"), fm = document.querySelector("#cluck .ask"), l = lf && lf.getBoundingClientRect();
  return { line: top + lh / 2, btn: s.top + s.height / 2, h: r.height, vis: r.width > 0 && r.height > 0 && s.height > 0, left: l ? l.top + l.height / 2 : null, form: fm.getBoundingClientRect().height };
});
const fmt = g => `h=${g.h.toFixed(0)} d=${(g.line - g.btn).toFixed(1)}`;
async function one(page, what) {                                              // the invariant for the field as it is now (one line expected)
  const g = await geo(page); assert.ok(g && g.vis, `${what}: no visible ask field`);
  assert.ok(g.h <= 50, `${what}: field ${g.h.toFixed(0)}px tall (one line = 44)`);
  assert.ok(Math.abs(g.line - g.btn) <= 2, `${what}: line centre ${g.line.toFixed(1)} vs button ${g.btn.toFixed(1)} (d ${(g.line - g.btn).toFixed(1)})`);
  if (g.left != null) assert.ok(Math.abs(g.left - g.btn) <= 2, `${what}: "N left" centre ${g.left.toFixed(1)} vs button ${g.btn.toFixed(1)}`);
  assert.ok(g.form <= 72, `${what}: the whole ask row is ${g.form.toFixed(0)}px tall (one line = ~60)`);
  return g;
}
const put = async (page, v) => { await page.fill(TA, v); };                  // fill fires a real input event
// empty -> one typed line -> empty again, each held to the invariant. Returns the numbers.
async function chk(page, what) {
  await nap(page, 120);
  const a = await one(page, `${what} empty`);
  await put(page, "why is it 42?"); const b = await one(page, `${what} typed`);
  await put(page, ""); const c = await one(page, `${what} cleared`);
  return `${fmt(a)} | typed ${fmt(b)} | cleared ${fmt(c)}`;
}
const send = async (page, text) => {
  await put(page, text); await page.click(SEND);
  await page.waitForFunction(() => { const s = document.querySelector("#cluck .ask .send"); return !document.querySelector("#cluck .wbusy") && !document.querySelector("#cluck .wcaret") && (!s || !s.disabled || !document.querySelector("#cluck .ask")); }, null, { timeout: 10000 });
  await nap(page, 400);
};
const crop = async (page, n) => { if (SHOTS) { const b = await page.locator("#cluck .cl-ft").boundingBox().catch(() => null); if (b) await page.screenshot({ path: join(SHOTS, `ask-${n}.png`), clip: b }); } };
const MULTI = "line one of a long question\nline two of it\nline three\nline four";
const growth = async (page, what) => { await put(page, MULTI); const g = await geo(page); assert.ok(g.h > 80, `${what}: 4 lines did not grow the field (${g.h}px)`); return g; };

// ---- group A: one desktop page, states in sequence ----
{
  const { ctx, page } = await open({ width: 1280, height: 800 });
  await step("00 baseline 1280", () => chk(page, "baseline"));
  await step("01 after a reply (4 left)", async () => { await send(page, "why is it 42?"); await crop(page, "reply"); return await chk(page, "reply"); });
  await step("01b after a reply + column momentarily narrow (askFit on the empty field)", async () => {
    await page.evaluate(() => { const ft = document.querySelector("#cluck .cl-ft"), ta = ft.querySelector("textarea"); const w = ft.style.width; ft.style.width = "150px"; ta.dispatchEvent(new Event("input")); ft.style.width = w; });
    return await chk(page, "narrow input");
  });
  for (const m of ["404", "abort"]) await step(`02 after a ${m} reply (error)`, async () => { page.mode = m; await send(page, "and then?"); await crop(page, "err-" + m); page.mode = "ok"; return await chk(page, m); });
  await step("04a multi-line, cleared by Ctrl+A Delete", async () => { await growth(page, "ctrl+a"); await page.press(TA, "Control+a"); await page.press(TA, "Delete"); return await chk(page, "ctrl+a del"); });
  await step("04b multi-line, cleared by Backspace", async () => { await put(page, "a\nb\nc"); await page.focus(TA); await page.press(TA, "Control+End"); for (let i = 0; i < 6; i++) await page.press(TA, "Backspace"); return await chk(page, "backspace"); });
  await step("04c multi-line, cleared by cut (Ctrl+X)", async () => { await growth(page, "cut"); await page.press(TA, "Control+a"); await page.press(TA, "Control+x"); return await chk(page, "cut"); });
  await step("04d multi-line, cleared by sending (Enter)", async () => { await growth(page, "send"); await page.press(TA, "Enter"); await page.waitForFunction(() => !document.querySelector("#cluck .wbusy") && !document.querySelector("#cluck .wcaret"), null, { timeout: 10000 }); await nap(page, 400); return await chk(page, "sent"); });
  await step("04e multi-line, cleared by the send button (click), then Shift+Enter + Backspace", async () => {
    await growth(page, "click send"); await page.click(SEND); await page.waitForFunction(() => !document.querySelector("#cluck .wbusy") && !document.querySelector("#cluck .wcaret"), null, { timeout: 10000 }); await nap(page, 400);
    const a = await chk(page, "click-sent"); await page.focus(TA); await page.keyboard.type("x"); await page.keyboard.press("Shift+Enter"); await page.keyboard.press("Backspace"); await page.keyboard.press("Backspace");
    return a + " || " + await chk(page, "shift-enter+bs");
  });
  await step("04f whitespace only, and one unbroken 120-char word, then cleared", async () => {
    await put(page, "   \n  \n "); await put(page, ""); const a = await chk(page, "ws");
    await put(page, "x".repeat(120)); const g = await geo(page); await put(page, ""); return `long word h=${g.h.toFixed(0)} || ` + a + " || " + await chk(page, "word cleared");
  });
  await step("05 paste a long line, then undo", async () => {
    await page.focus(TA); await page.keyboard.insertText("word ".repeat(80)); await page.dispatchEvent(TA, "input"); const g = await geo(page); assert.ok(g.h > 80, `long paste did not grow (${g.h}px)`);
    await page.press(TA, "Control+z"); await page.dispatchEvent(TA, "input"); await put(page, ""); return await chk(page, "paste undo");
  });
  await step("06a resize 1280 -> 900 -> 1280", async () => {
    await page.setViewportSize({ width: 900, height: 800 }); await nap(page, 400); const a = await chk(page, "900");
    await page.setViewportSize({ width: 1280, height: 800 }); await nap(page, 400); return a + " || " + await chk(page, "back 1280");
  });
  await step("06b resize 2133x1200 -> 1280x800", async () => {
    await page.setViewportSize({ width: 2133, height: 1200 }); await nap(page, 400); const a = await chk(page, "2133");
    await page.setViewportSize({ width: 1280, height: 800 }); await nap(page, 400); return a + " || " + await chk(page, "back 1280");
  });
  await step("06c typed text wrapped when narrow, window widened: the field refits to one line", async () => {
    await page.setViewportSize({ width: 900, height: 800 }); await nap(page, 400);
    await put(page, "this question is typed on a narrow window and wraps"); const n = await geo(page); assert.ok(n.h > 60, `did not wrap at 900 (${n.h}px)`);
    await page.setViewportSize({ width: 2133, height: 1200 }); await nap(page, 500);
    const w = await one(page, "widened with text"); await put(page, ""); await page.setViewportSize({ width: 1280, height: 800 }); await nap(page, 400);
    return `narrow h=${n.h.toFixed(0)} -> wide ${fmt(w)} || ` + await chk(page, "back 1280");
  });
  await step("07 sash drag to 1/3 and back, double-click", async () => {
    const sash = page.locator("#sash"); if (!(await sash.isVisible())) return "sash hidden: n/a";
    const b = await sash.boundingBox(), cx = b.x + b.width / 2, cy = b.y + b.height / 2;
    await page.mouse.move(cx, cy); await page.mouse.down(); await page.mouse.move(1280 / 3, cy, { steps: 6 }); await page.mouse.up(); await nap(page, 400);
    const a = await chk(page, "sash 1/3");
    const b2 = await sash.boundingBox(); await page.mouse.move(b2.x + b2.width / 2, cy); await page.mouse.down(); await page.mouse.move(cx, cy, { steps: 6 }); await page.mouse.up(); await nap(page, 400);
    const c = await chk(page, "sash back");
    await sash.dblclick({ force: true }).catch(() => {}); await nap(page, 400);
    return a + " || " + c + " || " + await chk(page, "sash dbl");
  });
  await step("08 hide / show the brainrot", async () => {
    const t = page.locator("button:has-text('brainrot'), [role=button]:has-text('brainrot'), a:has-text('brainrot')").first();
    if (!(await t.isVisible().catch(() => false))) return "no brainrot toggle: n/a";
    await t.click(); await nap(page, 500); const a = await chk(page, "hidden");
    await t.click(); await nap(page, 500); return a + " || " + await chk(page, "shown");
  });
  await step("09 collapse / re-open the column (X, Escape, back)", async () => {
    await page.keyboard.press("Escape"); await nap(page, 300);
    const x = page.locator("#cluck .cl-x:visible").first(); if (await x.count()) { await x.click(); await nap(page, 500); }
    const back = page.locator("#clBack:visible").first(); if (await back.count()) { await back.click(); await nap(page, 600); }
    if (!(await page.locator(TA).isVisible().catch(() => false))) return "column stays (permanent box, no dismiss): field still visible check skipped";
    return await chk(page, "reopened");
  });
  await step("10f while Cluck is replying (field disabled, busy rim), 1.5s slow reply", async () => {
    await page.unroute("**/chat"); await page.route("**/chat", async r => { await new Promise(res => setTimeout(res, 1500)); r.fulfill({ status: 200, contentType: "text/plain; charset=utf-8", body: "Slow quack, then the answer.\n" }); });
    await put(page, "why?"); await page.click(SEND); await nap(page, 500);
    const a = await one(page, "busy"); await crop(page, "busy");
    await page.waitForFunction(() => !document.querySelector("#cluck .wbusy") && !document.querySelector("#cluck .wcaret"), null, { timeout: 10000 }); await nap(page, 300);
    return `busy ${fmt(a)} || ` + await chk(page, "after slow");
  });
  await step("11 focus, blur, Escape in the field", async () => {
    await page.focus(TA); const a = await chk(page, "focus"); await page.press(TA, "Escape"); await page.evaluate(() => document.activeElement.blur()); await nap(page, 200);
    return a + " || " + await chk(page, "blur+esc");
  });
  await step("14 next question, then back", async () => {
    await page.evaluate(() => { location.hash = "#PSY_T62"; }); await page.waitForFunction(() => document.querySelector("#pcode")?.textContent === "PSY_T62", null, { timeout: 8000 }); await nap(page, 700);
    const a = await live(page) ? await chk(page, "T62") : "T62: no open field (before the first try the glass bar is a locked strip): n/a";
    await page.evaluate(() => { location.hash = "#PSY_T61"; }); await page.waitForFunction(() => document.querySelector("#pcode")?.textContent === "PSY_T61", null, { timeout: 8000 }); await nap(page, 700);
    return a + " || " + (await live(page) ? await chk(page, "back T61") : "T61: no open field on return: n/a");
  });
  await ctx.close();
}
// ---- group B: separate pages for states that need their own start ----
{
  const { ctx, page } = await open({ width: 1280, height: 800 });
  await step("03 limit reached (429) and re-enabled", async () => {
    page.mode = "limit"; await send(page, "one more?"); let a = "429 sent";
    if (await page.locator(TA).isVisible().catch(() => false)) a = await chk(page, "429"); else a = "field replaced by the done row (0 left): n/a";
    page.mode = "ok"; for (let i = 0; i < 6 && await page.locator(TA).isVisible().catch(() => false); i++) await send(page, "q" + i);   // run the turns out (0 left)
    await page.evaluate(() => { location.hash = "#PSY_T62"; }); await page.waitForFunction(() => document.querySelector("#pcode")?.textContent === "PSY_T62", null, { timeout: 8000 }); await nap(page, 900);
    await page.waitForSelector(TA, { state: "visible", timeout: 5000 }).catch(() => {});
    return a + " || next question (locked until its first try): " + (await live(page) ? await chk(page, "re-enabled") : "locked strip");
  });
  await ctx.close();
}
for (const [tag, vp, o] of [["10a zoom 0.9 (dsf)", { width: 1280, height: 800 }, { dsf: 0.9 }], ["10b zoom 1.1 (dsf)", { width: 1280, height: 800 }, { dsf: 1.1 }], ["10c zoom 1.25 (dsf)", { width: 1280, height: 800 }, { dsf: 1.25 }],
  ["10d viewport 2133x1200 (1920 @ 90%)", { width: 2133, height: 1200 }, {}], ["10e viewport 1707x960 (1920 @ 112%)", { width: 1707, height: 960 }, {}],
  ["15 motion on (reduced-motion off)", { width: 1280, height: 800 }, { motion: true }]]) {
  await step(tag, async () => { const { ctx, page } = await open(vp, o); try { await send(page, "why is it 42?"); return await chk(page, tag); } finally { await ctx.close(); } });
}
await step("12 webfonts arrive late (held 2.5s), typing meanwhile", async () => {
  const { ctx, page } = await open({ width: 1280, height: 800 }, { fontDelay: 2500 });
  try {
    await put(page, "early text\nwith two lines"); await put(page, "");                 // askFit with the fallback face
    const early = await geo(page); await page.evaluate(() => document.fonts.ready); await nap(page, 3000);
    return `early ${fmt(early)} || ` + await chk(page, "after fonts");
  } finally { await ctx.close(); }
});
await step("13 phone 390x844, then landscape 844x390, then back", async () => {
  const { ctx, page } = await open({ width: 390, height: 844 });
  try {
    const a = await chk(page, "390");
    await page.setViewportSize({ width: 844, height: 390 }); await nap(page, 500);
    const b = await page.locator(TA).isVisible().catch(() => false) ? await chk(page, "844x390") : "landscape: sheet closed (n/a)";
    await page.setViewportSize({ width: 390, height: 844 }); await nap(page, 500); await page.evaluate(() => window.stemClOpen?.("explain", null)); await nap(page, 600);
    return a + " || " + b + " || " + (await page.locator(TA).isVisible().catch(() => false) ? await chk(page, "back 390") : "no field");
  } finally { await ctx.close(); }
});
await browser.close(); srv.kill();
console.log(fails ? `${fails} failed` : "all ok"); process.exit(fails ? 1 : 0);
