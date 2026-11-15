// VERDICT-CARD smoke (Tony Nov 14, markup-verdict-line-to-card; REVIEW2 s3 item 4): under html.ui-v7 the verdict line ("That's it! The answer is ...", "Not it. ...") is no longer a loose line
// under the judged row; the SAME .ansl node moves into the verdict tray (.vdrawer), which is a card: verdict + answer + copy on top, the buttons below, filled with the judged row's own step
// (right #0c2c22, wrong #3e141e), no border, radius 16. Its left/right edges = the row's left edge / the answer group's right edge. Flag off: the line stays loose, the tray as before.
// Own serve.py, throwaway bank, a stub OpenRouter.   node tests/verdict-card.pw.mjs [port]   (SHOTS=<dir> saves screenshots)
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

const GEO = process.env.GEO;
async function judge(w, flag, right) {
  const page = await open(w, flag, "#PHYS_FP2");
  await page.waitForSelector("#ff input, #ff textarea", { timeout: 10000 });
  const typeAnswer = async v => { await skipRetryWait(page); const f = page.locator("#ff :is(input, textarea)").first(); await f.fill(v); await f.press("Enter"); };
  if (right) { await typeAnswer("1.38"); await page.waitForSelector("#q .ff.rbox.ok .vk", { timeout: 8000 }); }
  else {
    await typeAnswer("1.636");
    if (!await page.waitForSelector("#q .vdrawer:not([hidden]) .wchip", { state: "visible", timeout: 4000 }).then(() => true, () => false)) {
      await page.waitForTimeout(2200); await typeAnswer("0.650");
    }
  }
  await page.waitForSelector("#q .vdrawer:not([hidden])", { state: "visible", timeout: 8000 });
  await page.waitForTimeout(900);
  return page;
}
/* the geometry: the row (.ff), the answer group, the drawer, the loose line */
const geo = page => page.evaluate(() => {
  const R = e => { if (!e) return null; const r = e.getBoundingClientRect(); return { l: +r.left.toFixed(1), r: +r.right.toFixed(1), t: +r.top.toFixed(1), b: +r.bottom.toFixed(1) }; };
  const d = document.querySelector("#q .vdrawer:not([hidden])"), ff = document.querySelector("#q .ff.rbox.ok, #q .ff.bad, #q #ff"), nx = document.querySelector("#q .nx"), q = document.querySelector("#q");
  const lines = [...document.querySelectorAll("#q .ansl")].map(l => ({ inDrawer: !!l.closest(".vdrawer"), shown: l.getClientRects().length > 0, text: l.textContent.replace(/\s+/g, " ").trim() }));
  const cs = d && getComputedStyle(d);
  return { d: R(d), ff: R(ff), nx: R(nx), q: R(q), grp: R(ff && ff.parentElement), lines, bg: cs && cs.backgroundColor, radius: cs && cs.borderTopLeftRadius,
    bw: cs && ["Top", "Right", "Bottom", "Left"].map(x => cs["border" + x + "Width"]).join(" "), cls: ff && ff.className, vw: innerWidth, sw: document.documentElement.scrollWidth,
    copy: !!(d && d.querySelector(".ansl .mcopy")), ask: d && [...d.querySelectorAll(".wchip")].map(b => ({ bg: getComputedStyle(b).backgroundColor, c: getComputedStyle(b).color })) };
});
const W = [360, 390, 768, 1366];
const near = (a, b, m) => assert.ok(Math.abs(a - b) <= 1, `${m}: ${a} vs ${b}`);
try {
  if (GEO) for (const w of W) for (const right of [true, false]) { const p = await judge(w, "v7", right); console.log(w, right ? "right" : "wrong", JSON.stringify(await geo(p))); await p.context().close(); }
  for (const w of W) for (const right of [true, false]) await step(`${w}: flag on: ${right ? "right" : "wrong"} = a card in the tray (line moved in, row-to-group width, own fill, no border)`, async () => {
    const page = await judge(w, "v7", right);
    try {
      const g = await geo(page);
      assert.deepEqual(g.lines.filter(l => !l.inDrawer && l.shown), [], "a loose verdict line is still shown: " + JSON.stringify(g.lines));
      if (right) {
        assert.equal(g.lines.length, 1, "one verdict line: " + JSON.stringify(g.lines)); assert.ok(g.lines[0].inDrawer && /That's it! The answer is 1\.38/.test(g.lines[0].text), JSON.stringify(g.lines));
        assert.ok(g.copy, "the copy button is in the card");
        assert.equal(await page.evaluate(() => { const l = document.querySelector("#q .vdrawer .ansl b"); return l && getComputedStyle(l).color; }), "rgb(78, 230, 175)", "the answer keeps its --correct green");
      }
      near(g.d.l, g.ff.l, "card left = the row's left"); near(g.d.r, g.grp.r, "card right = the answer group's right (the Next column's edge)");
      assert.ok(g.d.r <= g.vw - 8 && g.sw <= g.vw, "right gutter kept, no sideways scroll: " + JSON.stringify({ r: g.d.r, vw: g.vw, sw: g.sw }));
      assert.equal(g.bg, right ? "rgb(12, 44, 34)" : "rgb(62, 20, 30)", "the card takes the judged row's own step");
      assert.equal(g.bw, "0px 0px 0px 0px"); assert.equal(g.radius, "16px");
      if (!right) assert.deepEqual(g.ask, [{ bg: "rgb(53, 29, 9)", c: "rgb(255, 220, 192)" }], "no orange on red: Ask Cluck = warm-900 #351d09 chip, light ink");
      else assert.equal(g.ask[0].bg, "rgb(255, 166, 62)", "on green the Ask / steps chip keeps its orange");
      const below = await page.evaluate(() => { const d = document.querySelector("#q .vdrawer"), l = d.querySelector(".ansl"), b = d.querySelector(".wchip"); return !l || l.getBoundingClientRect().bottom <= b.getBoundingClientRect().top + 1; });
      assert.ok(below, "the buttons sit below the verdict line");
      if (SHOTS && (w === 390 || (w === 1366 && right))) { await page.locator("#q").scrollIntoViewIfNeeded(); await page.screenshot({ path: join(SHOTS, `vcard-${right ? "right" : "wrong"}-${w}.png`) }); }
      if (right && w === 390) {                              // collapse: the line goes back under the row, still readable
        await page.click("#q .vdrawer .vd-x"); await page.waitForTimeout(700);
        const back = await page.evaluate(() => { const l = document.querySelector("#q .ansl"); return l && { inDrawer: !!l.closest(".vdrawer"), shown: l.getClientRects().length > 0 }; });
        assert.deepEqual(back, { inDrawer: false, shown: true }, "collapsed: the verdict line returns under the row");
      }
      assert.deepEqual(page.errs, [], "page errors");
    } finally { await page.context().close(); }
  });
  await step("390: flag on: out of tries = 'Not it. The answer is ...' in the red card", async () => {
    const page = await open(390, "v7", "#PHYS_FP2");
    try {
      await page.waitForSelector("#ff input, #ff textarea", { timeout: 10000 });
      for (let i = 0; i < 5 && !await page.evaluate(() => !!document.querySelector("#q .ansl")); i++) {
        await skipRetryWait(page); const f = page.locator("#ff :is(input, textarea)").first(); await f.fill(["1.636", "0.650", "2.2", "3.3", "4.4"][i]); await f.press("Enter"); await page.waitForTimeout(2300);
      }
      await page.waitForSelector("#q .vdrawer:not([hidden]) .ansl", { timeout: 8000 }); await page.waitForTimeout(700);
      const g = await geo(page);
      assert.ok(g.lines.length === 1 && g.lines[0].inDrawer && /^Not it\. The answer is/.test(g.lines[0].text), JSON.stringify(g.lines));
      assert.equal(g.bg, "rgb(62, 20, 30)"); near(g.d.r, g.grp.r, "card right");
      if (SHOTS) { await page.locator("#q").scrollIntoViewIfNeeded(); await page.screenshot({ path: join(SHOTS, "vcard-notit-390.png") }); }
    } finally { await page.context().close(); }
  });
  await step("flag off: the verdict line stays a loose line under the row, the tray is not a card", async () => {
    const page = await judge(390, "off", true);
    try {
      const g = await geo(page);
      assert.ok(g.lines.length === 1 && !g.lines[0].inDrawer && g.lines[0].shown, JSON.stringify(g.lines));
      assert.notEqual(g.bg, "rgb(12, 44, 34)"); assert.ok(g.d.r < g.grp.r - 20, "the old narrower tray: " + JSON.stringify(g.d));
    } finally { await page.context().close(); }
  });
} finally {
  await browser.close(); srv.kill(); stub.close();
}
if (failures) { console.log(`${failures} FAILED`); process.exit(1); }
console.log("all ok");
