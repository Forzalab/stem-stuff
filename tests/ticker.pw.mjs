// try/ticker.html (work ticker test drive, v2 plain text): drag t across every pillar by pointer (touch at 390x844, mouse at 1366x768);
// the readout "W = 18.0 J" runs, the text ticker beside it shows a green "▲ +1.5 +4.5 +6 +6" run, a sign flip starts a red "▼ −0.5"
// run after it, a run fades ~1.5 s after its last entry, no cards; the reveal shows W and the chips +G / −R, dragging back reverses;
// ?rm=1: no fade, the ticker shows the current streak sum; the three follow-up replies render every block (an invalid one falls back to plain text);
// no console errors; no horizontal scroll at 390.
// usage: node tests/ticker.pw.mjs http://localhost:8812 [shotDir]
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
const require = createRequire(import.meta.url);
let pw; try { pw = require("playwright"); } catch { try { pw = require("/opt/node22/lib/node_modules/playwright"); } catch { pw = require("/opt/node-tools/node_modules/playwright"); } }
const BASE = process.argv[2] || "http://localhost:8812";
const SHOTS = process.argv[3] || "";
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const b = await pw.chromium.launch({ args: ["--no-sandbox"] });
let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); }
  catch (e) { failures++; console.log("FAIL", name, "\n     ", e.message.slice(0, 700)); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function open(w, h, touch, q) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch, deviceScaleFactor: touch ? 2 : 1 });
  const page = await ctx.newPage();
  const errs = [];
  page.on("console", m => { if (m.type() === "error") errs.push(m.text()); });
  page.on("pageerror", e => errs.push(String(e)));
  await page.goto(`${BASE}/try/ticker.html${q}`, { waitUntil: "networkidle" });
  await page.waitForSelector("#fig svg");
  const cdp = touch ? await ctx.newCDPSession(page) : null;
  // a pointer at world x (metres) on the figure, in page coordinates
  const at = x => page.evaluate(x => { const f = document.querySelector("#fig"), r = f.getBoundingClientRect(), X = f._X;
    return [r.left + X([x, 0])[0], r.top + r.height * 0.45]; }, x);
  let down = false;
  async function drag(xs) {                         // one continuous drag through the world xs
    await page.locator("#fig").scrollIntoViewIfNeeded();
    for (const x of xs) {
      const [px, py] = await at(x);
      if (touch) await cdp.send("Input.dispatchTouchEvent", { type: down ? "touchMove" : "touchStart", touchPoints: [{ x: px, y: py }] });
      else { await page.mouse.move(px, py); if (!down) await page.mouse.down(); }
      down = true;
      await sleep(25);
    }
  }
  async function lift() { if (touch) await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); else await page.mouse.up(); down = false; }
  const shot = async (name, full = false) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}-${w}.png`, fullPage: full }); };
  return { page, ctx, errs, drag, lift, shot };
}
const range = (a, z, n = 12) => Array.from({ length: n + 1 }, (_, i) => a + (z - a) * i / n);
const log = page => page.evaluate(() => window.__tk.log.map(l => [l.id, l.v]));

for (const [w, h, touch] of [[390, 844, true], [1366, 768, false]]) {
  const { page, ctx, errs, drag, lift, shot } = await open(w, h, touch, "?v=0&rm=0");   // v2 (before), still on the page as "v2 (before)"
  await step(`${w}: model: 7 pillars, G 22.5, R 0.5, W 22`, async () => {
    const m = await page.evaluate(() => ({ n: window.__tk.PIL.length, G: window.__tk.G, R: window.__tk.R, W: window.__tk.W, a: window.__tk.PIL.map(p => p.a) }));
    assert.deepEqual(m, { n: 7, G: 22.5, R: 0.5, W: 22, a: [1.5, 4.5, 6, 6, 4, 0.5, -0.5] });
  });
  await step(`${w}: no horizontal scroll, figure + tape on screen`, async () => {
    const r = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    assert.ok(r.sw <= r.cw, `scrollWidth ${r.sw} > ${r.cw}`);
  });
  await shot("1-start");
  const runs = () => page.$$eval("#tk .run", rs => rs.map(r => [r.dataset.sign, r.textContent.replace(/\s+/g, " ").trim()]));
  await step(`${w}: dragging t across 4 pillars: W = 18.0 J and one green run "▲ +1.5 +4.5 +6 +6" beside it`, async () => {
    await drag(range(0.05, 3.3));
    assert.deepEqual(await log(page), [["p1", 1.5], ["p2", 4.5], ["p3", 6], ["p4", 6]]);
    assert.equal(await page.textContent("#bigW"), "W = 18.0 J");
    assert.deepEqual(await runs(), [["1", "▲ +1.5 +4.5 +6 +6"]]);
    assert.equal(await page.$$eval(".fl, .stack, .led", e => e.length), 0, "no cards, no pile");
    const [wb, tb] = await page.evaluate(() => ["#bigW", "#tk"].map(q => document.querySelector(q).getBoundingClientRect()).map(r => ({ l: r.left, r: r.right, t: r.top, b: r.bottom })));
    assert.ok(tb.l >= wb.r - 1 && Math.abs(tb.t - wb.t) < 12, `the ticker sits right beside W: ${JSON.stringify([wb, tb])}`);
    assert.equal(await page.$eval("#tk .run", e => getComputedStyle(e).color), "rgb(95, 211, 148)");
  });
  await shot("2-streak");
  await step(`${w}: the pink pillar starts a red run right after the green one`, async () => {
    await drag(range(3.3, 5.75, 8));
    assert.deepEqual((await log(page)).slice(4), [["p5", 4], ["p6", 0.5], ["p7", -0.5]]);
    const r = await runs();
    assert.deepEqual(r[r.length - 1], ["-1", "▼ −0.5"]);
    assert.deepEqual(r[0], ["1", "▲ +4 +0.5"], "the green run keeps its last 2 entries");
    assert.equal(await page.textContent("#bigW"), "W = 22.0 J");
  });
  await shot("3-flip");
  await step(`${w}: a run fades out ~1.5 s after its last entry`, async () => {
    await sleep(2300);
    assert.deepEqual(await runs(), []);
    assert.equal(await page.textContent("#bigW"), "W = 22.0 J", "the readout stays");
  });
  await step(`${w}: t at the end: W = 22 J, chips +22.5 J and −0.5 J stay`, async () => {
    await drag(range(5.75, 6.4, 4)); await lift();
    await page.waitForFunction(() => document.querySelector("#bigW").textContent === "W = 22 J", null, { timeout: 4000 });
    assert.equal(await page.textContent("#chipG"), "+22.5 J");
    assert.equal(await page.textContent("#chipR"), "−0.5 J");
    assert.equal(await page.isVisible("#tk"), false);
    await sleep(500);
  });
  await shot("4-reveal");
  await step(`${w}: dragging back reverses (a green "▲ +0.5"), hides the chips, W = 22.5 J`, async () => {
    await drag(range(6, 5.3, 4)); await lift();
    assert.deepEqual((await log(page)).slice(7), [["p7", 0.5]]);
    assert.deepEqual((await runs()).pop(), ["1", "▲ +0.5"]);
    assert.equal(await page.isVisible("#chipG"), false);
    assert.equal(await page.textContent("#bigW"), "W = 22.5 J");
  });
  await step(`${w}: keyboard: End reveals, Home clears`, async () => {
    await page.focus("#fig"); await page.keyboard.press("End");
    await page.waitForFunction(() => document.querySelector("#bigW").textContent === "W = 22 J", null, { timeout: 4000 });
    await page.keyboard.press("Home");
    assert.equal(await page.evaluate(() => window.__tk.S.entered), 0);
  });
  await step(`${w}: follow-up (a): text + scenePatch + math; the pink pillar lights and t moves to it`, async () => {
    await page.click("[data-ex='a']");
    const blk = await page.$$eval("[data-x='a'] .blk", e => e.map(x => [x.dataset.type, x.dataset.ok]));
    assert.deepEqual(blk, [["text", "true"], ["scenePatch", "true"], ["math", "true"]]);
    await page.waitForFunction(() => window.__tk.S.t === 6 && window.__tk.S.hi.includes("p7"), null, { timeout: 5000 });
    assert.ok(await page.$eval("[data-x='a'] .wmath", e => !!e.querySelector(".katex-display")));
    await sleep(900);
  });
  await shot("5-followup-a");
  await step(`${w}: follow-up (b): 3 steps + a boxed answer`, async () => {
    await page.click("[data-ex='b']");
    await page.locator("[data-x='b']").scrollIntoViewIfNeeded();
    assert.equal(await page.$$eval("[data-x='b'] .wstep", e => e.length), 3);
    assert.ok(await page.$("[data-x='b'] .wans .fbox"), "boxed answer");
    assert.deepEqual(await page.$$eval("[data-x='b'] .blk", e => e.map(x => x.dataset.ok)), ["true", "true"]);
    await sleep(800);
  });
  if (SHOTS) await page.locator("#fu").screenshot({ path: `${SHOTS}/6-followup-b-${w}.png` });
  await step(`${w}: fallback demo: compare renders, the invalid block shows its text, nothing throws`, async () => {
    await page.click("[data-ex='f']");
    assert.deepEqual(await page.$$eval("[data-x='f'] .blk", e => e.map(x => [x.dataset.type, x.dataset.ok])), [["compare", "true"], ["chart3d", "false"]]);
    assert.match(await page.textContent("[data-x='f'] .blk[data-type='chart3d']"), /plain text instead/);
    const bad = await page.evaluate(() => window.__tk.renderReply({ blocks: [null, 5, "hi", { type: "steps", items: [1, 2, 3, 4] }, { type: "math" }, { type: "toString" }, { type: "scenePatch", ref: "q1" }, { type: "scenePatch", ref: "q1" }] }, { scenes: 0, after: [] }).map(r => r.ok));
    assert.deepEqual(bad, [false, false, false, false, false, false, true, false]);   // the 2nd scenePatch breaks the 1-scene budget
    await page.locator("[data-x='f']").scrollIntoViewIfNeeded(); await sleep(800);
  });
  if (SHOTS) await page.locator("#fu").screenshot({ path: `${SHOTS}/7-fallback-${w}.png` });
  await step(`${w}: replay (a) replaces it, no duplicate`, async () => {
    await page.click("[data-ex='a']");
    assert.equal(await page.$$eval("[data-x='a']", e => e.length), 1);
  });
  await step(`${w}: no horizontal scroll after everything; zero console errors`, async () => {
    const r = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    assert.ok(r.sw <= r.cw, `scrollWidth ${r.sw} > ${r.cw}`);
    assert.deepEqual(errs, []);
  });
  await ctx.close();

  // ---------- ?rm=1: no flashes, one accumulating number, green then red ----------
  const R = await open(w, h, touch, "?v=0&rm=1");
  const rruns = () => R.page.$$eval("#tk .run", rs => rs.map(r => [r.dataset.sign, r.textContent.replace(/\s+/g, " ").trim()]));
  await step(`${w} rm: the ticker is the streak sum "▲ +18", green, W = 18.0 J`, async () => {
    await R.drag(range(0.05, 3.3));
    assert.equal(await R.page.textContent("#bigW"), "W = 18.0 J");
    assert.deepEqual(await rruns(), [["1", "▲ +18"]]);
  });
  await step(`${w} rm: on the red pillar: W = 22.0 J first, the ticker turns red "▼ −0.5"; nothing fades`, async () => {
    await R.drag(range(3.3, 5.75, 8));
    assert.equal(await R.page.textContent("#bigW"), "W = 22.0 J");
    assert.deepEqual(await rruns(), [["-1", "▼ −0.5"]]);
    await sleep(2200);
    assert.deepEqual(await rruns(), [["-1", "▼ −0.5"]], "no fade under reduced motion");
    assert.equal(await R.page.evaluate(() => document.querySelector("#tape").getAnimations({ subtree: true }).length), 0);
  });
  await R.shot("8-rm");
  await step(`${w} rm: reveal: W and the same chips, at once`, async () => {
    await R.drag(range(5.75, 6.4, 3)); await R.lift();
    assert.equal(await R.page.textContent("#bigW"), "W = 22 J");
    assert.equal(await R.page.textContent("#chipG"), "+22.5 J");
    assert.equal(await R.page.textContent("#chipR"), "−0.5 J");
    assert.deepEqual(R.errs, []);
  });
  await R.shot("9-rm-reveal");
  await R.ctx.close();

  // ---------- v3 looks (Tony's TK1 notes, Oct 6): queue ticker + W badge in the body font + gains / losses table ----------
  for (const [v, max] of [["a", 4], ["b", 3], ["c", 3]]) for (const rm of [0, 1]) {
    const V = await open(w, h, touch, `?v=${v}&rm=${rm}`);
    const q = () => V.page.$$eval("#qq .qi:not(.gone)", es => es.map(e => [e.classList.contains("up") ? 1 : -1, e.firstChild.textContent]));
    await step(`${w} ${v}${rm ? " rm" : ""}: 4 pillars → W badge "W = 18.0 J" in the body font, the queue holds the last ${max} gains`, async () => {
      await V.drag(range(0.05, 3.3)); await sleep(400);
      assert.equal(await V.page.textContent("#wb"), "W = 18.0 J");
      assert.ok(!/Mono/.test(await V.page.$eval("#wb", e => getComputedStyle(e).fontFamily)), "the badge is not the mono font");
      assert.deepEqual(await q(), [[1, "+1.5"], [1, "+4.5"], [1, "+6"], [1, "+6"]].slice(-max));
      assert.equal(await V.page.isVisible("#tk"), false, "no v2 runs");
    });
    await step(`${w} ${v}${rm ? " rm" : ""}: the pink pillar joins the queue in red; the oldest left`, async () => {
      await V.drag(range(3.3, 5.75, 8)); await sleep(400);
      const r = await q();
      assert.equal(r.length, max);
      assert.deepEqual(r[r.length - 1], [-1, "−0.5"]);
      assert.equal(await V.page.textContent("#wb"), "W = 22.0 J");
      if (rm) assert.equal(await V.page.evaluate(() => document.querySelector("#tape").getAnimations({ subtree: true }).length), 0, "no motion under rm");
    });
    await step(`${w} ${v}${rm ? " rm" : ""}: the end → W = 22 J, the gains / losses table, no sideways scroll`, async () => {
      await V.drag(range(5.75, 6.4, 3)); await V.lift();
      assert.equal(await V.page.textContent("#wb"), "W = 22 J");
      assert.equal(await V.page.isVisible("#gl"), true);
      const t = (await V.page.innerText("#gl")).replace(/\s+/g, " ");
      for (const want of ["+1.5", "+4.5", "+0.5", "−0.5", "22"]) assert.ok(t.includes(want), `table has ${want}: ${t}`);
      assert.ok(await V.page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
      assert.deepEqual(V.errs, []);
    });
    if (!rm) await V.shot(`v3-${v}-end`);
    await V.ctx.close();
  }
}
await b.close();
console.log(failures ? `${failures} FAILED` : "all ok");
process.exit(failures ? 1 : 0);
