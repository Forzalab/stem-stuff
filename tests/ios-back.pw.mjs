// iOS-only Back button (design/NAV.md "iOS exception"): left of the question-bank button, pops the topmost thing
// (Cluck sheet, question list, popover, notes split), else the in-app previous question; never leaves the site.
// Starts its own serve.py with a throwaway banks/ folder:   node tests/ios-back.pw.mjs [port] [shotDir]
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { pw = require("/opt/node22/lib/node_modules/playwright"); }

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = +(process.argv[2] || 8827), BASE = `http://localhost:${PORT}`, SHOTS = process.argv[3] || "";
const TMP = mkdtempSync(join(tmpdir(), "iosback-")), BANKS = join(TMP, "banks");
const num = (code, answer, md) => ({ code, type: "num", answer, body: [{ type: "text", md }] });
const CODES = ["CALC1_N01", "CALC1_N02", "CALC1_N03", "CALC1_N04"];
mkdirSync(BANKS);
writeFileSync(join(BANKS, "BANK_IB12.json"), JSON.stringify({ v: 1, problems: CODES.map((c, i) => num(c, String(i + 2), `Back ${i + 1}: 1 + ${i + 1}`)) }));

const { qFresh } = await import("../shuffle.mjs");   // pin the queue's salt so Next plays file order
const SEED = Array.from({ length: 2000 }, (_, i) => "k" + i).find(s => qFresh(CODES, s).every((c, i) => c === CODES[i]));
const srv = spawn("python3", [join(ROOT, "serve.py"), String(PORT)], { env: { ...process.env, STEM_BANKS: BANKS, STEM_TRIES: join(TMP, "tries.json") }, stdio: "ignore" });
for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + "/")).ok) break; } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 100)); }

const IOS = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36";

let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); }
  catch (e) { failures++; console.log("FAIL", name, "\n     ", e.message.slice(0, 700)); }
}
const opened = async (page, code, timeout = 8000) => {
  try {
    await page.waitForFunction(c => document.querySelector("#pcode")?.textContent === c && !document.querySelector("#freeze").hidden
      && (!document.querySelector("#splash") || getComputedStyle(document.querySelector("#splash")).opacity === "0"), code, { timeout });
  } catch { assert.fail(`wanted ${code}, page has ${await page.textContent("#pcode").catch(() => "?")} at ${page.url()}`); }
};
const SHOWN = "(() => { const b = document.querySelector('#qback'); return !!b && !b.hidden && getComputedStyle(b).display !== 'none' && b.getClientRects().length > 0; })()";
const backShown = page => page.evaluate(SHOWN);
const waitBack = async (page, want, why) => {
  try { await page.waitForFunction(`${SHOWN} === ${want}`, null, { timeout: 4000 }); }
  catch { assert.fail(`#qback ${want ? "not shown" : "still shown"}: ${why}`); }
};
const pcode = page => page.textContent("#pcode");
/* Next plays the hidden queue, and a browser Back is a showing like any other: read where Next went, never assume file order */
const nextOf = async page => { const from = await pcode(page); await page.click("#qnext"); await page.waitForFunction(c => document.querySelector("#pcode")?.textContent !== c, from, { timeout: 8000 }); const to = await pcode(page); await opened(page, to); return to; };

const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
async function phone({ ua = IOS, w = 390, h = 844, dnt = false, dpr = 1 } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, userAgent: ua, serviceWorkers: "block", hasTouch: true, isMobile: true, deviceScaleFactor: dpr });
  await ctx.addCookies([{ name: "stem-mode", value: "diet", url: BASE }, { name: "stem-mode-v", value: "2", url: BASE }]);   // the phone pad (notes split) is diet's
  await ctx.addInitScript(([s, dnt]) => {
    try { if (!localStorage.getItem("stem-q-BANK_IB12")) localStorage.setItem("stem-q-BANK_IB12", JSON.stringify({ v: 1, salt: s, pos: 0, seen: {}, hist: [], at: -1 })); } catch { /* blocked */ }
    try { localStorage.setItem("stem-ob", "done"); } catch { /* */ }
    if (dnt) Object.defineProperty(Navigator.prototype, "doNotTrack", { get: () => "1", configurable: true });
  }, [SEED, dnt]);
  const page = await ctx.newPage();
  const errors = []; page.on("pageerror", e => { errors.push(String(e)); console.log("pageerror", String(e).slice(0, 300)); });
  return { ctx, page, errors };
}
const spy = page => page.evaluate(() => { window.__nb = []; const o = window.stemT; window.stemT = (n, p) => { if (n === "nav_back") window.__nb.push(p); return o && o(n, p); }; });

try {
  for (const [w, h] of [[390, 844], [360, 640]]) {
    const { ctx, page, errors } = await phone({ w, h });
    await page.goto(BASE + "/#BANK_IB12");
    await opened(page, CODES[0]);
    await spy(page);
    const nxt = () => nextOf(page);
    const tapBack = async to => { await page.tap("#qback"); await opened(page, to); };

    await step(`${w}: first question of the tab: Back hidden`, async () => { await waitBack(page, false, "root screen"); });

    await step(`${w}: Next -> Back shows, >= 48x48, left of the list button, same top; tap goes to the previous question; hidden again at root`, async () => {
      await nxt();
      await waitBack(page, true, "after Next");
      const g = await page.evaluate(() => { const r = s => document.querySelector(s).getBoundingClientRect(), b = r("#qback"), l = r("#qlistBtn");
        return { bw: b.width, bh: b.height, bt: b.top, br: b.right, lt: l.top, ll: l.left, sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }; });
      assert.ok(g.bw >= 48 && g.bh >= 48, `size ${g.bw}x${g.bh}`);
      assert.ok(g.br <= g.ll + 0.5, `Back (right ${g.br}) is not left of the list button (left ${g.ll})`);
      assert.ok(Math.abs(g.bt - g.lt) <= 1, `tops ${g.bt} vs ${g.lt}`);
      assert.ok(g.sw <= g.cw, `horizontal scroll ${g.sw} > ${g.cw}`);
      await tapBack(CODES[0]);
      await waitBack(page, false, "back at the root");
    });

    await step(`${w}: two Nexts -> two Backs walk the questions in order`, async () => {
      const a = await nxt(), b = await nxt();
      await tapBack(a); await waitBack(page, true, "depth 1");
      await tapBack(CODES[0]); await waitBack(page, false, "depth 0");
      assert.notEqual(a, b);
    });

    await step(`${w}: question list open -> Back closes the list, the question is unchanged`, async () => {
      const q = await nxt(); await waitBack(page, true, "before list");
      await page.click("#qlistBtn");
      await page.waitForSelector("#qlist:not([hidden])");
      await waitBack(page, true, "list open");
      await page.tap("#qback");
      await page.waitForSelector("#qlist", { state: "hidden" });
      assert.equal(await pcode(page), q, "the question moved");
      await waitBack(page, true, "depth 1 after the list");
      await tapBack(CODES[0]);
    });

    await step(`${w}: a popover open -> Back closes the popover, not the question`, async () => {
      const q = await nxt();
      await page.evaluate(() => window.Pop.open(document.querySelector("#pcode"), { variant: "note", label: "Test", build: el => { el.textContent = "A popover."; } }));
      await page.waitForSelector(".pop");
      await waitBack(page, true, "popover open");
      await page.tap("#qback");
      await page.waitForSelector(".pop", { state: "detached", timeout: 4000 });
      assert.equal(await pcode(page), q, "the question moved");
      await waitBack(page, true, "depth 1 after the popover");
      await tapBack(CODES[0]);
    });

    await step(`${w}: Cluck sheet open -> Back closes the sheet, not the question`, async () => {
      const q = await nxt();
      const open = async () => { await page.evaluate(() => window.stemClOpen("explain", null)); await page.waitForFunction(() => window.stemCluckOpen()); await waitBack(page, true, "Cluck open"); };
      const shut = async () => { await page.waitForFunction(() => !window.stemCluckOpen(), null, { timeout: 4000 }); assert.equal(await pcode(page), q); await waitBack(page, true, "still depth 1 after Cluck"); };
      /* the sheet's dim (z 44) lies over the top bar and closes the sheet on a tap: a finger on Back's corner closes it, and a click on Back itself (keyboard, VoiceOver) does the same */
      await open();
      const r = await page.evaluate(() => { const b = document.querySelector("#qback").getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; });
      await page.touchscreen.tap(r.x, r.y); await shut();
      await open();
      await page.evaluate(() => document.querySelector("#qback").click()); await shut();
      await tapBack(CODES[0]);
    });

    await step(`${w}: notes split open -> Back closes the split, then the question`, async () => {
      const q = await nxt();
      await page.click("#padFab");
      await page.waitForFunction(() => document.documentElement.classList.contains("mt"));
      await waitBack(page, true, "notes split open");
      await page.tap("#qback");
      await page.waitForFunction(() => !document.documentElement.classList.contains("mt"), null, { timeout: 4000 });
      assert.equal(await pcode(page), q, "closing the split changed the question");
      await waitBack(page, true, "depth 1 after the split");
      await tapBack(CODES[0]); await waitBack(page, false, "root again");
    });

    await step(`${w}: depth survives a reload (Back still shows, and works)`, async () => {
      const q = await nxt();
      await page.reload(); await opened(page, q);
      await waitBack(page, true, "after reload");
      await tapBack(CODES[0]);
    });

    await step(`${w}: no horizontal scroll, the list label truncates inside the row`, async () => {
      await nxt(); await waitBack(page, true, "Next");
      const g = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, vw: innerWidth,
        nextR: document.querySelector("#qnext").getBoundingClientRect().right, nameOver: getComputedStyle(document.querySelector("#qlistName")).textOverflow }));
      assert.ok(g.sw <= g.cw, `scroll ${g.sw} > ${g.cw}`);
      assert.ok(g.nextR <= g.vw, `Next off screen ${g.nextR}`);
      assert.equal(g.nameOver, "ellipsis");
    });

    assert.deepEqual(errors, [], "page errors");
    await ctx.close();
  }

  /* screenshots for Tony: dpr 2, iPhone UA, 390x844 */
  if (SHOTS) {
    const { ctx, page } = await phone({ dpr: 2 });
    await page.goto(BASE + "/#BANK_IB12"); await opened(page, CODES[0]); await page.waitForTimeout(500);
    await page.screenshot({ path: `${SHOTS}/back-root.png` });
    await nextOf(page); await page.waitForTimeout(500);
    await page.screenshot({ path: `${SHOTS}/back-visible.png` });
    await page.click("#qlistBtn"); await page.waitForSelector("#qlist:not([hidden])"); await page.waitForTimeout(600);
    await page.screenshot({ path: `${SHOTS}/back-list.png` });
    await ctx.close();
  }

  await step("Android UA: Back is never shown", async () => {
    const { ctx, page } = await phone({ ua: ANDROID });
    await page.goto(BASE + "/#BANK_IB12"); await opened(page, CODES[0]);
    await page.click("#qnext"); await page.waitForTimeout(800);
    assert.equal(await backShown(page), false);
    await ctx.close();
  });

  await step("desktop at a wide window: Back is never shown", async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: "block" });
    const page = await ctx.newPage();
    await page.goto(BASE + "/#BANK_IB12"); await opened(page, CODES[0]);
    await nextOf(page);
    assert.equal(await backShown(page), false);
    await ctx.close();
  });

  await step("never leaves the site: a prior page is not reachable by Back", async () => {
    const { ctx, page } = await phone();
    await page.goto("about:blank");
    await page.goto(BASE + "/#BANK_IB12"); await opened(page, CODES[0]);
    await waitBack(page, false, "first question after another page");
    await nextOf(page); await waitBack(page, true, "depth 1");
    await page.tap("#qback"); await opened(page, CODES[0]);
    await waitBack(page, false, "back at the root, the prior page must not be offered");
    assert.ok(page.url().startsWith(BASE), "left the app: " + page.url());
    await ctx.close();
  });

  await step("nav_back telemetry: from + code + depth", async () => {
    const { ctx, page } = await phone();
    await page.goto(BASE + "/#BANK_IB12"); await opened(page, CODES[0]); await spy(page);
    const qa = await nextOf(page); await waitBack(page, true, "depth 1");
    await page.tap("#qback"); await opened(page, CODES[0]);
    const q2 = await nextOf(page);
    await page.click("#qlistBtn"); await page.waitForSelector("#qlist:not([hidden])");
    await page.tap("#qback"); await page.waitForSelector("#qlist", { state: "hidden" });
    const log = await page.evaluate(() => window.__nb);
    assert.deepEqual(log.map(p => p.from), ["question", "list"]);
    assert.deepEqual(log.map(p => p.code), [qa, q2]);
    assert.deepEqual(log.map(p => p.depth), [1, 1]);
    await ctx.close();
  });

  await step("DNT: tapping Back sends nothing to the collectors (stemT is the no-op)", async () => {
    const { ctx, page } = await phone({ dnt: true });
    const hits = [];
    await ctx.route(/posthog\.com|clarity\.ms/, r => { hits.push(r.request().url()); r.fulfill({ status: 200, contentType: "application/javascript", body: "" }); });
    await ctx.route(u => new URL(u).pathname === "/" || new URL(u).pathname === "/index.html", async r => {
      const res = await r.fetch(), html = await res.text();
      return r.fulfill({ response: res, body: html.replace('<meta name="stem-t" content="">', '<meta name="stem-t" content="phc_testtoken123" data-host="https://us.i.posthog.com" data-clarity="abc123">') });
    });
    await page.goto(BASE + "/#BANK_IB12"); await opened(page, CODES[0]);
    await nextOf(page); await waitBack(page, true, "DNT depth 1");
    await page.tap("#qback"); await opened(page, CODES[0]);
    await page.waitForTimeout(500);
    assert.equal(await page.evaluate(() => !!window.posthog || !!window.clarity), false, "a collector library loaded under DNT");
    assert.deepEqual(hits, []);
    await ctx.close();
  });
} finally {
  await browser.close(); srv.kill();
}
console.log(failures ? `${failures} FAILED` : "all ok");
process.exit(failures ? 1 : 0);
