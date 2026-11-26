// ASK-GLASS smoke (Nov 22): Cluck's ask field as the R3 glass Ask bar, plus the pre-try rules, under html.ui-v7, at 390 and 1280:
//   (i)   before a try the Ask Cluck button has no data-st="first" and no aria-disabled (no note); the box shows the locked strip "Available after your first try." (44px, input disabled)
//   (ii)  a bank item with `starter` shows ONE chip (the "Free" tag + its text) that sends POST /chat {starter:true} with history length 2, last entry = the text; no /explain before a try;
//         an item without `starter` keeps the 3 generic chips
//   (iii) after a graded try the bar is 56px (radius 20, desktop width <= 560) and the input is enabled
//   (iv)  typing sets the send button .on (the tangerine circle), clearing takes it off
//   gecko Firefox UA (engine 'gecko'): no lens, no copy of the reply, the bar is ag-frost (backdrop-filter blur(16px) saturate(1.5)); gate dim keeps ag-solid
//   off   without ?ui=v7 nothing of the glass bar exists
//   repro the bug-log repro, RED on origin/main (button data-st="first" while the desktop Cluck box is open before a try), GREEN here:   node tests/ask-glass.smoke.mjs 8890 repro
// Own serve.py + a throwaway bank; /explain and /chat are stubbed in the page (no LLM).   node tests/ask-glass.smoke.mjs [port] [repro]
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
let pw; try { pw = require("playwright"); } catch { pw = require("/opt/node22/lib/node_modules/playwright"); }

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = /^\d+$/.test(process.argv[2] || "") ? process.argv[2] : "8890", BASE = `http://127.0.0.1:${PORT}`, ONLY = process.argv[3] || "";
const TMP = mkdtempSync(join(tmpdir(), "askglass-")), BANKS = join(TMP, "banks");
mkdirSync(BANKS);
const STARTER = "Why does the torque use sin here?";
const P = (n, extra) => ({ code: `CALC1_AG${n}`, title: `AG ${n}`, type: "num", answer: "42", body: [{ type: "text", md: `How many students are in the lab (${n})? Say it as a number.` }],
  saccharine: { title: `AG ${n}`, key: "Tick: 42" }, ...extra });
writeFileSync(join(BANKS, "BANK_AGL.json"), JSON.stringify({ v: 1, problems: [P(1, { starter: STARTER }), P(2, {})] }));
const srv = spawn("python3", [join(ROOT, "server", "http_server", "serve.py"), PORT], { env: { ...process.env, STEM_TODAY: "2026-10-23", STEM_BANKS: BANKS, STEM_TRIES: join(TMP, "tries.json"),
  OPENROUTER_API_KEY: "", CLAUDE_API: "" }, stdio: "ignore" });
await serverUp(BASE);

let fails = 0;
async function step(name, fn) {
  if (ONLY && !name.includes(ONLY)) return;
  try { await fn(); console.log("ok  ", name); }
  catch (e) { fails++; console.log("FAIL", name, "\n     ", String(e.message).slice(0, 900)); }
}
let browser;
try { browser = await launchBrowser(pw, { args: ["--no-sandbox"], motion: true }); }
catch { browser = await launchBrowser(pw, { args: ["--no-sandbox"], motion: true, executablePath: "/opt/pw-browsers/chromium" }); }
const TA = "#cluck .ask textarea", SEND = "#cluck .ask .send", FORM = "#cluck .cl-fi .ask";
// a page on the bank's item n (ui: "?ui=v7" or ""): /explain and /chat are stubbed, /chat bodies are kept in page.chats, /explain calls in page.explains
async function open(w, n = 1, ui = "?ui=v7") {
  const phone = w < 500;
  const ctx = await browser.newContext({ viewport: { width: w, height: phone ? 844 : 800 }, hasTouch: phone, isMobile: phone, serviceWorkers: "block", reducedMotion: "no-preference" });
  await ctx.addInitScript(() => { try { localStorage.setItem("stem-ob", "done"); localStorage.setItem("stem-voice", "off"); } catch { /* */ } });
  await ctx.route(/youtube|ytimg|googlevideo/, r => r.abort());
  const page = await ctx.newPage(); page.errs = []; page.chats = []; page.explains = 0;
  page.on("pageerror", e => page.errs.push(String(e)));
  await page.route("**/chat", r => { page.chats.push(JSON.parse(r.request().postData() || "{}")); r.fulfill({ status: 200, contentType: "text/plain; charset=utf-8", body: "Quack. Because six times seven is forty-two.\n" }); });
  await page.route("**/explain", r => { page.explains++; r.fulfill({ status: 200, contentType: "text/plain; charset=utf-8", body: "POOF! A short canned reply.\n" }); });
  await page.goto(`${BASE}/${ui}#BANK_AGL`);
  await page.waitForFunction(() => !document.getElementById("splash") && !!(window.stemBank && window.stemBank.code) && !document.getElementById("freeze").hidden, null, { timeout: 15000 });
  if (n === 2) { await page.evaluate(() => { location.hash = "#CALC1_AG2"; }); await page.waitForFunction(() => document.querySelector("#pcode")?.textContent === "CALC1_AG2", null, { timeout: 8000 }); }
  else await page.waitForFunction(() => document.querySelector("#pcode")?.textContent === "CALC1_AG1", null, { timeout: 8000 });
  await settled(page);
  return page;
}
const btn = page => page.evaluate(() => { const b = document.getElementById("cluckBtn"); return b && { st: b.dataset.st || null, aria: b.getAttribute("aria-disabled"), why: document.getElementById("cluckWhy")?.textContent || "", label: b.getAttribute("aria-label") }; });
// Cluck's box before a try: on desktop it is open from the first paint, on a phone the button opens the sheet
async function showBox(page, w) { if (w < 500) await page.click("#cluckBtn"); await page.waitForSelector(FORM, { state: "visible", timeout: 8000 }); await settled(page, "#cluck"); }
const form = page => page.evaluate(sel => { const f = document.querySelector(sel); if (!f) return null; const r = f.getBoundingClientRect(), cs = getComputedStyle(f), t = f.querySelector("textarea"), s = f.querySelector(".send");
  return { h: r.height, w: r.width, rad: parseFloat(cs.borderTopLeftRadius), locked: f.classList.contains("locked"), busy: f.classList.contains("opening") || f.classList.contains("sweep"), disabled: t.disabled, on: s.classList.contains("on"),
    txt: f.querySelector(".g-lock .txt")?.textContent || "", clone: !!f.querySelector(".g-copy .ag-clone"), solid: f.classList.contains("ag-solid"), frost: f.classList.contains("ag-frost"), filt: f.querySelector(".g-copy").style.filter }; }, FORM);
const wrongTry = async (page, w) => {
  await page.click("#ans"); await page.keyboard.type("7"); await page.keyboard.press("Enter");
  await page.waitForFunction(() => window.__drill.state.tries.length > 0, null, { timeout: 10000 });
  if (w < 500) await page.evaluate(() => window.stemClOpen("explain", null)); else await page.click("#cluckBtn", { force: true });
  await page.waitForFunction(sel => { const f = document.querySelector(sel), t = f && f.querySelector("textarea"); return !!t && !t.disabled && !f.classList.contains("locked") && !f.classList.contains("opening") && !f.classList.contains("sweep"); }, FORM, { timeout: 12000 });
  await page.waitForTimeout(700); // keep: the unlock spring (44 -> 56) and the glass re-applied at the new size settle
};

for (const w of [390, 1280]) {
  await step(`${w} repro: the Ask Cluck button before a try is ready (no data-st="first", no aria-disabled) while Cluck's box is open`, async () => {
    const page = await open(w);
    try {
      if (w >= 720) await page.waitForSelector("#cluck", { state: "visible", timeout: 8000 });   // the desktop box is open from the first paint (the old bug: first state + an open box)
      const b = await btn(page); assert.ok(b, "no #cluckBtn");
      assert.notEqual(b.st, "first", "data-st is still 'first'"); assert.equal(b.st, "ready"); assert.equal(b.aria, null, "aria-disabled before a try");
    } finally { await page.context().close(); }
  });
  await step(`${w} (i): no note; a press opens the box on the locked strip "Available after your first try." (44px, input disabled), no /explain`, async () => {
    const page = await open(w);
    try {
      const b = await btn(page); assert.equal(b.why, "", "a note: " + b.why); assert.equal(b.label, "Ask Cluck");
      await page.click("#cluckBtn"); await page.waitForSelector(FORM, { state: "visible", timeout: 8000 }); await settled(page, "#cluck");
      const f = await form(page); assert.ok(f.locked, "the bar is not locked"); assert.equal(f.txt, "Available after your first try.");
      assert.ok(Math.abs(f.h - 44) <= 1.5, "strip height " + f.h); assert.ok(Math.abs(f.rad - 14) <= .5, "strip radius " + f.rad); assert.equal(f.disabled, true, "the field is not disabled");
      assert.equal(await page.evaluate(sel => { const t = document.querySelector(sel); t.focus(); return document.activeElement === t; }, TA), false, "the locked field took focus");
      assert.equal(page.explains, 0, "an /explain call before a try");
      if (w >= 720) assert.equal(await page.evaluate(() => document.activeElement?.classList.contains("cl-starter")), true, "the press did not focus the chip");
      assert.deepEqual(page.errs, []);
    } finally { await page.context().close(); }
  });
  await step(`${w} (ii): a bank with a starter: ONE "Free" chip; a tap sends /chat {starter:true}, history 2, last = its text`, async () => {
    const page = await open(w);
    try {
      await showBox(page, w);
      const chips = await page.$$eval("#cluck > .cl-bd .cl-starter", els => els.filter(e => e.getClientRects().length).map(e => ({ t: e.textContent, free: e.querySelector(".free")?.textContent })));
      assert.deepEqual(chips, [{ t: "Free" + STARTER, free: "Free" }], JSON.stringify(chips));
      await page.click("#cluck > .cl-bd .cl-starter");
      await page.waitForFunction(() => /forty-two/.test(document.querySelector("#cluck > .cl-bd .cl-thread")?.innerText || ""), null, { timeout: 10000 });
      assert.equal(page.chats.length, 1); const c = page.chats[0];
      assert.equal(c.starter, true, "starter flag"); assert.equal(c.history.length, 2, "history length"); assert.equal(c.history.at(-1).content, STARTER); assert.equal(c.history.at(-1).role, "user");
      assert.equal(page.explains, 0, "an /explain call before a try");
      assert.equal(await page.evaluate(() => [...document.querySelectorAll("#cluck > .cl-bd .cl-starter")].some(e => e.getClientRects().length)), false, "the chip stays after it is used");
      assert.equal((await form(page)).locked, true, "the strip stays locked after the free ask");
    } finally { await page.context().close(); }
  });
  await step(`${w} (ii): a bank item without a starter keeps the 3 generic chips (no starter flag)`, async () => {
    const page = await open(w, 2);
    try {
      await showBox(page, w);
      const chips = await page.$$eval("#cluck > .cl-bd .cl-starter", els => els.filter(e => e.getClientRects().length).map(e => e.textContent));
      assert.deepEqual(chips, ["What is this asking?", "Which formula fits?", "Check my setup"]);
      await page.click('#cluck > .cl-bd .cl-starter:has-text("Which formula fits?")');
      await page.waitForFunction(() => /forty-two/.test(document.querySelector("#cluck > .cl-bd .cl-thread")?.innerText || ""), null, { timeout: 10000 });
      assert.equal(page.chats[0].starter, undefined, "a generic chip must not claim the free ask");
    } finally { await page.context().close(); }
  });
  await step(`${w} (iii) + (iv): after a graded try the bar is 56px with the input enabled; typing sets send .on`, async () => {
    const page = await open(w);
    try {
      await wrongTry(page, w);
      const f = await form(page); assert.equal(f.locked, false); assert.equal(f.disabled, false, "the field is still disabled");
      assert.ok(Math.abs(f.h - 56) <= 1.5, "bar height " + f.h); assert.ok(Math.abs(f.rad - 20) <= .5, "bar radius " + f.rad);
      if (w >= 720) assert.ok(f.w <= 560.5, "the desktop bar is " + f.w + "px wide (cap 560)");
      assert.ok(f.clone || f.solid || f.frost, "the glass copy is missing and no fallback class is set: " + JSON.stringify(f));
      if (!f.solid && !f.frost) assert.match(f.filt, /url\(/, "the lens filter is not applied");
      await page.fill(TA, "why sin and not cos?");
      assert.equal((await form(page)).on, true, "send is not .on with text");
      assert.equal(await page.evaluate(sel => getComputedStyle(document.querySelector(sel)).backgroundColor, SEND), "rgba(0, 0, 0, 0)", "send has a fill at rest");
      await page.fill(TA, ""); assert.equal((await form(page)).on, false, "send is still .on when empty");
      assert.deepEqual(page.errs, []);
    } finally { await page.context().close(); }
  });
}
await step("gecko: a Firefox UA gets the plain frost: no lens filter, empty .g-copy, class ag-frost + backdrop-filter (fx-dim still wins: ag-solid)", async () => {
  const FF = "Mozilla/5.0 (Android 14; Mobile; rv:132.0) Gecko/132.0 Firefox/132.0";
  for (const dim of [false, true]) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, serviceWorkers: "block", reducedMotion: "no-preference", userAgent: FF });
    await ctx.addInitScript(dim => { try { localStorage.setItem("stem-ob", "done"); localStorage.setItem("stem-voice", "off"); if (dim) localStorage.setItem("stem-fx", "dim"); } catch { /* */ }
      Object.defineProperty(navigator, "userAgentData", { get: () => undefined }); }, dim);
    await ctx.route(/youtube|ytimg|googlevideo/, r => r.abort());
    const page = await ctx.newPage();
    await page.route("**/explain", r => r.fulfill({ status: 200, contentType: "text/plain; charset=utf-8", body: "POOF! A short canned reply.\n" }));
    try {
      await page.goto(`${BASE}/?ui=v7#BANK_AGL`);
      await page.waitForFunction(() => !document.getElementById("splash") && document.querySelector("#pcode")?.textContent === "CALC1_AG1", null, { timeout: 15000 });
      await settled(page); await wrongTry(page, 390);
      const r = await page.evaluate(sel => { const f = document.querySelector(sel), gc = f.querySelector(".g-copy");
        return { cls: f.className, kids: gc.children.length, lens: [...document.querySelectorAll("#cluck *")].filter(e => /url\(/.test(getComputedStyle(e).filter)).length, bf: getComputedStyle(f).backdropFilter, defs: !!document.querySelector("svg filter feImage") }; }, FORM);
      assert.equal(r.kids, 0, "the reply copy was built: " + JSON.stringify(r)); assert.equal(r.lens, 0, "a lens filter is applied"); assert.equal(r.defs, false, "lens filter defs exist");
      if (dim) { assert.match(r.cls, /ag-solid/); assert.doesNotMatch(r.cls, /ag-frost/); assert.equal(r.bf, "none"); }
      else { assert.match(r.cls, /ag-frost/); assert.doesNotMatch(r.cls, /ag-solid/); assert.match(r.bf, /blur\(16px\)/); }
    } finally { await ctx.close(); }
  }
});
await step("off: without ?ui=v7 there is no glass bar (today's footer field)", async () => {
  const page = await open(1280, 1, "");
  try {
    await wrongTry(page, 1280).catch(async () => { /* the field state of the old look: only the markup is checked */ });
    const r = await page.evaluate(() => ({ ag: document.querySelectorAll("#cluck .ask.ag, #cluck .g-copy").length, pos: getComputedStyle(document.querySelector("#cluck .cl-ft")).position }));
    assert.equal(r.ag, 0); assert.notEqual(r.pos, "absolute");
  } finally { await page.context().close(); }
});
await browser.close(); srv.kill();
console.log(fails ? `${fails} FAILED` : "all ok");
process.exit(fails ? 1 : 0);
