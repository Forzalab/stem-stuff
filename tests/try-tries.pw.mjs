// try/tries.html (tries-left counter + coin flash test drive) and the try/ hub: every counter variant switches on the page and by ?v=,
// a wrong pick spends a try (each variant's words / pips), a right pick flashes the top-bar coin and pays XP (14 first try, 6 second,
// +1 per wrong try), both flash variants, ?rm=1 (no animations, a yellow "+N" pill for ~2 s, then the new total), out of tries,
// reset; no console errors; no horizontal scroll at 390; at 390 (touch) and 1366. try/index.html: every link answers 200.
// usage: node tests/try-tries.pw.mjs http://localhost:8816 [shotDir]
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
const require = createRequire(import.meta.url);
let pw; try { pw = require("playwright"); } catch { try { pw = require("/opt/node22/lib/node_modules/playwright"); } catch { pw = require("/opt/node-tools/node_modules/playwright"); } }
const BASE = process.argv[2] || "http://localhost:8816";
const SHOTS = process.argv[3] || "";
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const b = await pw.chromium.launch({ args: ["--no-sandbox"] });
let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); }
  catch (e) { failures++; console.log("FAIL", name, "\n     ", e.message.slice(0, 700)); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function open(w, h, touch, q = "") {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch, deviceScaleFactor: touch ? 2 : 1 });
  const page = await ctx.newPage();
  const errs = [];
  page.on("console", m => { if (m.type() === "error") errs.push(m.text()); });
  page.on("pageerror", e => errs.push(String(e)));
  await page.goto(`${BASE}/try/tries.html${q}`, { waitUntil: "networkidle" });
  await page.waitForSelector("#q .opt");
  const tap = sel => touch ? page.tap(sel) : page.click(sel);
  const pick = async l => { await tap(`#q .opt[data-l='${l}']`); await tap(`#q .opt[data-l='${l}'] + .send`); };
  const ctr = () => page.$eval("#ctr", e => ({ v: e.dataset.v, left: e.dataset.left, text: e.textContent.trim(), full: e.querySelectorAll(".pp i:not(.sp)").length, spent: e.querySelectorAll(".pp i.sp").length, done: e.classList.contains("done") }));
  const xp = () => page.textContent("#xp");
  const noScroll = async () => { const r = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]); assert.ok(r[0] <= r[1], `scrollWidth ${r[0]} > ${r[1]}`); };
  const shot = async name => { if (SHOTS) { await page.evaluate(() => scrollTo(0, 0)); await page.screenshot({ path: `${SHOTS}/tries-${name}-${w}.png`, fullPage: true }); } };
  return { page, ctx, errs, tap, pick, ctr, xp, noScroll, shot };
}

// the hub: every link on try/index.html answers 200
{
  const ctx = await b.newContext(); const page = await ctx.newPage();
  await step("hub: try/index.html lists every try page, every link 200", async () => {
    const r = await page.goto(`${BASE}/try/index.html`); assert.equal(r.status(), 200);
    const hrefs = await page.$$eval("#tries a", a => a.map(x => x.href));
    for (const need of ["tries.html", "ticker.html", "live-scene.html", "redo-variants.html"]) assert.ok(hrefs.some(h => h.endsWith("/try/" + need)), need);
    for (const h of hrefs) { const res = await page.request.get(h); assert.equal(res.status(), 200, h); }
    const dir = await page.request.get(`${BASE}/try/`); assert.equal(dir.status(), 200, "/try/ serves the hub");
  });
  await ctx.close();
}

const WORDS = {   // [start, after one miss, out of tries] per variant
  A: ["2 tries left", "1 try left", "No tries left"],
  C: ["Try 1 of 2", "Try 2 of 2 · last one", "Out of tries"] };

for (const [w, h, touch] of [[390, 844, true], [1366, 900, false]]) {
  const T = await open(w, h, touch, "?rm=0");
  const { page } = T;
  await step(`${w}: defaults: A, pulse, 2 tries, 31 XP; the counter sits on the "Question" row`, async () => {
    assert.deepEqual(await page.evaluate(() => [__tr.S.v, __tr.S.f, __tr.S.rm, __tr.MAX]), ["A", "pulse", false, 2]);
    assert.equal((await T.ctr()).text, "2 tries left");
    assert.equal(await T.xp(), "31");
    assert.ok(await page.$("#qrow > #ctr"), "counter inside the label row");
    const [lb, cb] = await page.evaluate(() => [document.querySelector("#qrow > span").getBoundingClientRect(), document.querySelector("#ctr").getBoundingClientRect()].map(r => ({ x: r.right, l: r.left, y: r.top + r.height / 2 })));
    assert.ok(cb.l - lb.x < 24 && Math.abs(cb.y - lb.y) < 6, `counter right of the label: ${JSON.stringify([lb, cb])}`);
    await T.noScroll();
  });
  for (const v of ["A", "B", "C", "D"]) {
    await step(`${w} ${v}: switch on the page, URL follows; a wrong pick spends a try live; second miss = out`, async () => {
      await page.click("#reset"); await T.tap(`.seg [data-v='${v}']`);
      assert.match(page.url(), new RegExp(`[?&]v=${v}`));
      let c = await T.ctr(); assert.equal(c.v, v); assert.equal(c.left, "2");
      if (WORDS[v]) assert.equal(c.text, WORDS[v][0]); else { assert.equal(c.full, 2); assert.equal(c.spent, 0); }
      await T.shot(`${v}-start`);
      await T.pick("A");
      c = await T.ctr(); assert.equal(c.left, "1");
      if (WORDS[v]) assert.equal(c.text, WORDS[v][1]); else { assert.equal(c.full, 1); assert.equal(c.spent, 1); }
      if (v === "D") assert.equal(c.text, "last try");
      assert.ok(await page.$eval("#q .opt[data-l='A']", e => e.classList.contains("wrong") && e.disabled));
      assert.equal(await T.xp(), "32", "a wrong try pays a quiet +1");
      await sleep(500); await T.shot(`${v}-miss`);
      await T.pick("B");
      c = await T.ctr(); assert.equal(c.left, "0");
      if (WORDS[v]) assert.equal(c.text, WORDS[v][2]); else assert.equal(c.spent, 2);
      assert.ok(await page.$eval("#q", e => e.classList.contains("closed")), "out of tries closes the question");
      assert.equal(await page.$$eval("#q .opt:not(:disabled)", e => e.length), 0);
    });
  }
  await step(`${w}: ?v=C loads C; Reset restores 2 tries and 31 XP`, async () => {
    await page.goto(`${BASE}/try/tries.html?v=C&rm=0`, { waitUntil: "networkidle" });
    assert.equal((await T.ctr()).text, "Try 1 of 2");
    assert.equal(await page.getAttribute(".seg [data-v='C']", "aria-pressed"), "true");
    await T.pick("D"); await page.click("#reset");
    assert.equal((await T.ctr()).text, "Try 1 of 2"); assert.equal(await T.xp(), "31");
  });
  await step(`${w} pulse: first-try correct: the coin pill rings + pops, a +14 tag, the number counts up to 45`, async () => {
    await T.tap(".seg [data-v='A']"); await T.tap(".seg [data-f='pulse']");
    await T.pick("C");
    assert.ok(await page.$eval("#q .opt[data-l='C']", e => e.classList.contains("right")));
    assert.equal((await T.ctr()).text, "Solved");
    assert.equal(await page.$eval("#rwCoin", e => e.dataset.flash), "pulse");
    assert.ok(await page.$eval("#rwCoin", e => e.classList.contains("cf-pulse")));
    assert.equal(await page.textContent(".cf-tag"), "+14");
    assert.ok(await page.$eval("#rwCoin", e => e.getAnimations().length > 0), "the pill animates");
    await sleep(250);
    const mid = +(await T.xp()); assert.ok(mid > 31 && mid <= 45, `counting up: ${mid}`);
    await page.waitForFunction(() => document.querySelector("#xp").textContent === "45", null, { timeout: 3000 });
    await page.waitForFunction(() => document.querySelector("#rwCoin").dataset.flash === "done", null, { timeout: 3000 });
    assert.equal(await page.$$eval(".cf-tag", e => e.length), 0, "the tag is gone");
    await T.noScroll();
  });
  await step(`${w} chip: second-try correct pays 6: a "+6 XP" chip rises off the right choice into the pill, then 38`, async () => {
    await page.click("#reset"); await T.tap(".seg [data-f='chip']");
    assert.match(page.url(), /f=chip/);
    await T.pick("E");
    await T.pick("C");
    assert.equal(await page.textContent(".cf-chip"), "+6 XP");
    await sleep(150);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/tries-flash-chip-${w}.png` });
    await page.waitForFunction(() => document.querySelector("#xp").textContent === "38", null, { timeout: 4000 });
    assert.equal(await page.$$eval(".cf-chip", e => e.length), 0);
    await page.waitForFunction(() => document.querySelector("#rwCoin").dataset.flash === "done", null, { timeout: 3000 });
  });
  await step(`${w} pulse shot`, async () => {
    await page.click("#reset"); await T.tap(".seg [data-f='pulse']"); await T.pick("C"); await sleep(260);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/tries-flash-pulse-${w}.png` });
    await page.waitForFunction(() => document.querySelector("#rwCoin").dataset.flash === "done", null, { timeout: 3000 });
  });
  await step(`${w}: no horizontal scroll after everything; zero console errors`, async () => { await T.noScroll(); assert.deepEqual(T.errs, []); });
  await T.ctx.close();

  // ---------- ?rm=1: nothing moves; the pill turns yellow and says +N for ~2 s, then the new total ----------
  const R = await open(w, h, touch, "?rm=1&v=D&f=chip");
  await step(`${w} rm: Reduced is on; a miss cracks a D token with no animation`, async () => {
    assert.equal(await R.page.getAttribute(".seg [data-rm='1']", "aria-pressed"), "true");
    await R.pick("B");
    const c = await R.ctr(); assert.equal(c.spent, 1); assert.equal(c.text, "last try");
    assert.equal(await R.page.evaluate(() => ["#rwHud", "#ctr"].reduce((n, q) => n + document.querySelector(q).getAnimations({ subtree: true }).length, 0)), 0, "nothing moves in the HUD or the counter");
    assert.equal(await R.xp(), "32");
  });
  await step(`${w} rm: correct: a static yellow pill "+6 XP", no animation, no flying chip; the total after ~2 s`, async () => {
    await R.pick("C");
    assert.equal(await R.page.$eval("#rwCoin", e => e.dataset.flash), "static");
    assert.ok(await R.page.$eval("#rwCoin", e => e.classList.contains("cf-static")));
    assert.equal(await R.xp(), "+6");
    const bg = await R.page.$eval("#rwCoin", e => getComputedStyle(e).backgroundColor); assert.equal(bg, "rgb(255, 225, 77)");
    assert.equal(await R.page.$$eval(".cf-chip, .cf-tag, .fx-float", e => e.length), 0);
    assert.equal(await R.page.evaluate(() => ["#rwHud", "#ctr"].reduce((n, q) => n + document.querySelector(q).getAnimations({ subtree: true }).length, 0)), 0, "nothing moves in the HUD or the counter");
    await sleep(400); await R.shot("rm-flash");
    await sleep(1000); assert.equal(await R.xp(), "+6", "still there at 1.4 s");
    await R.page.waitForFunction(() => document.querySelector("#xp").textContent === "38", null, { timeout: 2000 });
    assert.ok(!(await R.page.$eval("#rwCoin", e => e.classList.contains("cf-static"))));
    await R.noScroll(); assert.deepEqual(R.errs, []);
  });
  await R.ctx.close();
}
await b.close();
console.log(failures ? `${failures} FAILED` : "all ok");
process.exit(failures ? 1 : 0);
