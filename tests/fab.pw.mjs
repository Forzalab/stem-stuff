// The Scratchpad button holds its place on the screen (phones): scrolling, the URL bar sliding (viewport height +-56px) and the bottom bar
// moving must not make it jump, and a resize or a drag end must never step it off answer controls (only (re)appearing does).
// Needs a running server and Playwright:
//   python3 serve.py 8812 &   then   node tests/fab.pw.mjs http://localhost:8812 [shotDir]
// With a shotDir it saves fab-{top,mid,end}-390.png (the button at three scroll positions).
import { createRequire } from "node:module";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { pw = require("/opt/node22/lib/node_modules/playwright"); }

const BASE = process.argv[2] || "http://localhost:8812";
const SHOTS = process.argv[3] || "";
let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); }
  catch (e) { failures++; console.log("FAIL", name, "\n     ", e.message.slice(0, 700)); }
}
const lorem = n => Array.from({ length: n }, (_, i) => `Claim ${i + 1}: a block of ${i + 2} kg slides along a rough track, and the friction force on it changes as the angle of the track is changed.`);
const CA = { code: "CSCI26_FB1", type: "mc", pick: "all", shuffle: false, body: [{ type: "text", md: lorem(14).join("\n\n") }],
  choices: ["a", "b", "c", "d", "e", "f"].map(id => ({ id, md: `Option ${id}: raising the angle changes the force on the block by some amount` })).concat([{ id: "g", md: "None of these", lock: true }]) };

const URL_BAR = 56;
const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
let n = 0;
for (const [W, H] of [[390, 844], [375, 667]]) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, serviceWorkers: "block" });
  await ctx.addInitScript(() => { try { localStorage.setItem("stem-ob", "done"); } catch { /* */ } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(6000);
  const errors = []; page.on("pageerror", e => errors.push(String(e)));
  await page.route(`**/p/${CA.code}.json`, r => r.fulfill({ json: CA }));
  const T = `${W}x${H}`;
  const fabTop = () => page.evaluate(() => Math.round(document.querySelector("#padFab").getBoundingClientRect().top * 10) / 10);
  const geo = () => page.evaluate(() => { const f = document.querySelector("#padFab").getBoundingClientRect(), d = document.querySelector("#dock").getBoundingClientRect();
    return { top: f.top, bottom: f.bottom, left: f.left, dockTop: d.top, vh: innerHeight, sy: Math.round(scrollY) }; });
  const settle = () => page.waitForTimeout(160);
  const shot = async name => { if (SHOTS && W === 390) { await page.waitForTimeout(150); await page.screenshot({ path: `${SHOTS}/fab-${name}-390.png` }); } };
  const range = () => page.evaluate(() => document.documentElement.scrollHeight - innerHeight);

  await page.goto(`${BASE}/#${CA.code}`, { waitUntil: "networkidle" });
  await page.waitForFunction(c => document.querySelector("#pcode")?.textContent === c, CA.code, { timeout: 8000 });
  await page.waitForTimeout(500);
  await page.evaluate(() => scrollTo(0, 0)); await settle();
  const start = await fabTop();

  await step(`${T} setup: the page scrolls and the button is shown`, async () => {
    assert.ok(await page.locator("#padFab").isVisible(), "button hidden");
    assert.ok(await range() > 600, `page too short to scroll: ${await range()}`);
  });

  await step(`${T} scrolling alone (scrollTo and wheel) never moves the button`, async () => {
    const max = await range();
    for (const y of [120, max * 0.3, max * 0.55, max * 0.8, max, 0]) {
      await page.evaluate(y => scrollTo(0, y), y); await settle();
      assert.ok(Math.abs(await fabTop() - start) <= 1, `scrollTo ${Math.round(y)}: top ${await fabTop()} vs ${start}`);
    }
    await page.mouse.move(W / 2, H / 3);
    for (let i = 0; i < 12; i++) { await page.mouse.wheel(0, 90); await page.waitForTimeout(30); assert.ok(Math.abs(await fabTop() - start) <= 1, `wheel step ${i}: ${await fabTop()}`); }
  });
  await page.evaluate(() => scrollTo(0, 0)); await settle();
  await shot("top");

  await step(`${T} the URL bar sliding at any scroll offset (height -${URL_BAR}px and back, fast and slow) puts the button back exactly`, async () => {
    const max = await range(), seen = [];
    for (const y of [0, 140, 260, 380, max * 0.5, max * 0.7, max * 0.9, max]) {
      await page.evaluate(y => scrollTo(0, y), y); await settle();
      const before = await fabTop();
      await page.setViewportSize({ width: W, height: H - URL_BAR }); await page.waitForTimeout(40);
      const g = await geo();
      assert.ok(g.top >= 0 && g.bottom <= g.dockTop + 0.5, `scroll ${g.sy}: out of bounds with the bar shown: ${g.top}..${g.bottom} dock ${g.dockTop}`);
      await page.setViewportSize({ width: W, height: H }); await settle();
      const after = await fabTop(); seen.push(`${g.sy}:${before}->${after}`);
      assert.ok(Math.abs(after - before) <= 1, `scroll ${g.sy}: button ${before} -> ${after} after the bar went and came back (${seen.join(" ")})`);
      assert.ok(Math.abs(after - start) <= 1, `scroll ${g.sy}: button ${after}, started at ${start}`);
    }
  });
  await page.evaluate(() => scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * 0.5)); await settle();
  await shot("mid");

  await step(`${T} no step-off on resize: the shifted place is the same at every scroll offset`, async () => {
    const max = await range(), tops = [];
    for (const y of [0, 200, 420, max * 0.6, max]) {
      await page.evaluate(y => scrollTo(0, y), y); await settle();
      await page.setViewportSize({ width: W, height: H - URL_BAR }); await settle();
      tops.push(await fabTop());
      await page.setViewportSize({ width: W, height: H }); await settle();
    }
    assert.ok(Math.max(...tops) - Math.min(...tops) <= 1, `with the bar shown the button sits at ${tops.join(", ")}`);
  });

  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight)); await settle();
  await shot("end");

  await step(`${T} drag to the left, mid-screen: it snaps left, keeps its height after reload, and scrolling still does not move it`, async () => {
    await page.evaluate(() => scrollTo(0, 0)); await settle();
    const f = await page.locator("#padFab").boundingBox();
    const cdp = await ctx.newCDPSession(page);
    const touch = (type, x, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] });
    const x0 = f.x + f.width / 2, y0 = f.y + f.height / 2, ty = H * 0.45;
    await touch("touchStart", x0, y0);
    for (let i = 1; i <= 8; i++) await touch("touchMove", x0 - i * (W * 0.6) / 8, y0 + i * (ty - y0) / 8);
    await touch("touchEnd"); await page.waitForTimeout(400);
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains("mt")), false, "a drag opened the pad page");
    const g = await geo(), placed = g.top;
    assert.ok(g.left <= 24, `not on the left edge: ${g.left}`);
    for (const y of [200, 500, 0]) { await page.evaluate(y => scrollTo(0, y), y); await settle(); assert.ok(Math.abs(await fabTop() - placed) <= 1, `scroll ${y}: ${await fabTop()} vs ${placed}`); }
    await page.setViewportSize({ width: W, height: H - URL_BAR }); await settle(); await page.setViewportSize({ width: W, height: H }); await settle();
    assert.ok(Math.abs(await fabTop() - placed) <= 1, `after the URL bar: ${await fabTop()} vs ${placed}`);
    await page.reload({ waitUntil: "networkidle" }); await page.waitForTimeout(700);
    const g2 = await geo();
    assert.ok(g2.left <= 24, "side not kept after reload");
    assert.ok(Math.abs(g2.top - placed) <= 24, `height not kept after reload: ${g2.top} vs ${placed}`);
  });

  if (W === 390) await step(`${T} drop on the answer choices: it stays where it was dropped (no step-off after a drag), also while scrolling`, async () => {
    /* a drop is the user's explicit choice: drag end keeps the spot (clamped, side snap only); the step-off is for (re)appearing only */
    const opts = page.locator("#q .opt");
    await opts.nth(2).evaluate(e => e.scrollIntoView({ block: "center" })); await settle();
    const c = await page.evaluate(() => { const r = [...document.querySelectorAll("#q .opt")].map(e => e.getBoundingClientRect()).filter(q => q.bottom > 0 && q.top < innerHeight);
      return { top: Math.min(...r.map(q => q.top)), bottom: Math.max(...r.map(q => q.bottom)) }; });
    const f = await page.locator("#padFab").boundingBox();
    const cdp = await ctx.newCDPSession(page);
    const touch = (type, x, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] });
    const x0 = f.x + f.width / 2, y0 = f.y + f.height / 2, ty = (c.top + c.bottom) / 2, tx = W * 0.75;
    await touch("touchStart", x0, y0);
    for (let i = 1; i <= 8; i++) await touch("touchMove", x0 + i * (tx - x0) / 8, y0 + i * (ty - y0) / 8);
    await touch("touchEnd"); await page.waitForTimeout(400);
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains("mt")), false, "a drag opened the pad page");
    const want = f.y + (ty - y0), g = await geo();
    const over = await page.evaluate(() => { const f = document.querySelector("#padFab").getBoundingClientRect();
      return [...document.querySelectorAll("#q .opt")].map(e => e.getBoundingClientRect()).some(q => q.right > f.left && q.left < f.right && q.bottom > f.top && q.top < f.bottom); });
    assert.ok(Math.abs(g.top - want) <= 2, `moved off the drop point: top ${g.top} vs dropped at ${Math.round(want)} (choices ${Math.round(c.top)}..${Math.round(c.bottom)})`);
    assert.ok(over, `rests over no choice: fab ${g.top}..${g.bottom}, choices ${c.top}..${c.bottom}`);
    for (const y of [0, 300, await range()]) { await page.evaluate(y => scrollTo(0, y), y); await settle(); assert.ok(Math.abs(await fabTop() - want) <= 2, `scroll ${y}: ${await fabTop()} vs ${Math.round(want)}`); }
  });

  await step(`${T} no page errors`, async () => assert.deepEqual(errors, []));
  await ctx.close();
}
await browser.close();
console.log(failures ? `${failures} FAILED` : "all ok");
