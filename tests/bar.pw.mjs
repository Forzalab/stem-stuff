// Grab handle (replaces the #more chevron) and the bottom code bar strip (phones). Needs a running server and Playwright:
//   python3 serve.py 8816 &   then   node tests/bar.pw.mjs http://localhost:8816 [shotDir]
import { createRequire } from "node:module";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { pw = require("/opt/node22/lib/node_modules/playwright"); }
const BASE = process.argv[2] || "http://localhost:8816";
const SHOTS = process.argv[3] || "";
let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); }
  catch (e) { failures++; console.log("FAIL", name, "\n     ", e.message.slice(0, 600)); }
}
const opened = (page, code) => page.waitForFunction(c => document.querySelector("#pcode")?.textContent === c && !document.querySelector("#freeze").hidden, code, { timeout: 8000 });
const cls = page => page.evaluate(() => document.documentElement.className);
/* caret position on screen: a mirror of the textarea up to the caret */
const caret = page => page.$eval("#scratch", t => {
  const m = document.createElement("div"), cs = getComputedStyle(t), r = t.getBoundingClientRect();
  for (const k of ["font", "letterSpacing", "padding", "border", "boxSizing", "whiteSpace", "overflowWrap", "tabSize", "lineHeight"]) m.style[k] = cs[k];
  Object.assign(m.style, { position: "fixed", visibility: "hidden", left: r.left + "px", top: r.top + "px", width: r.width + "px" });
  m.textContent = t.value.slice(0, t.selectionEnd); const s = document.createElement("span"); s.textContent = "|"; m.append(s);
  document.body.append(m); const y = s.getBoundingClientRect().top - t.scrollTop; m.remove();
  const bar = document.querySelector("#dock").getBoundingClientRect();
  return { y: Math.round(y), top: Math.round(r.top), h: Math.round(r.height), barTop: Math.round(bar.top), focus: document.activeElement === t };
});
/* long enough to freeze and clip, so the handle shows */
const LONG = { code: "PHYS_ZZ1", type: "num", body: [
  ...Array.from({ length: 14 }, (_, i) => i + 1).map(i => ({ type: "text", md: `Part ${i} of the setup: the ramp is fixed, the block starts from rest, and air drag is small enough to ignore.` })),
  { type: "text", md: "Find the acceleration, in $\\text{m/s}^2$." }] };

for (const [W, H] of [[375, 667], [390, 844], [430, 932], [1920, 1080]]) {
  const phone = W < 1000;
  const b = await pw.chromium.launch({ args: ["--no-sandbox"] });
  const ctx = await b.newContext({ viewport: { width: W, height: H }, hasTouch: phone, isMobile: phone, serviceWorkers: "block" });
  const page = await ctx.newPage();
  await page.route("**/p/PHYS_ZZ1.json", r => r.fulfill({ json: LONG }));
  const shot = async n => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/bar-${n}-${W}.png` }); };

  await step(`${W} (e) grab handle: shown when clipped, tap opens and folds, drag down opens, drag up folds`, async () => {
    await page.goto(BASE + "/#PHYS_ZZ1"); await opened(page, "PHYS_ZZ1");
    await page.mouse.wheel(0, 600); await page.waitForTimeout(500);
    const more = page.locator("#more");
    if (!phone) {   // desktop is side by side now (design/MULTITASK.md "Desktop, revised"): no frozen strip over the pad, so no strip handle
      assert.ok(await more.isHidden(), "no strip handle side by side");
      const g = await page.evaluate(() => [document.querySelector("#freeze").getBoundingClientRect().right, document.querySelector("#work").getBoundingClientRect().left]);
      assert.ok(g[1] > g[0], "pad beside the problem");
      return;
    }
    assert.ok(await more.isVisible(), "handle visible on a clipped strip");
    const look = await more.evaluate(e => { const s = getComputedStyle(e), p = getComputedStyle(e, "::before"); return { bg: s.backgroundColor, bw: s.borderTopWidth, w: e.offsetWidth, h: e.offsetHeight, pw: p.width, ph: p.height }; });
    assert.deepEqual([look.bg, look.bw, look.pw, look.ph], ["rgba(0, 0, 0, 0)", "0px", "36px", "4px"], "a pill, no button chrome");
    assert.ok(look.w >= 44 && look.h >= 44, "44px touch area");
    await shot("handle");
    await more.click(); await page.waitForTimeout(250);
    assert.equal(await more.getAttribute("aria-expanded"), "true");
    await more.click(); await page.waitForTimeout(250);
    assert.equal(await more.getAttribute("aria-expanded"), "false");
    const r = await more.boundingBox(), x = r.x + r.width / 2, y = r.y + r.height / 2;
    await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x, y + 40, { steps: 4 }); await page.mouse.up(); await page.waitForTimeout(250);
    assert.equal(await more.getAttribute("aria-expanded"), "true", "drag down opens");
    await more.scrollIntoViewIfNeeded(); await page.waitForTimeout(200);
    const r2 = await more.boundingBox(), x2 = r2.x + r2.width / 2, y2 = r2.y + r2.height / 2;
    await page.mouse.move(x2, y2); await page.mouse.down(); await page.mouse.move(x2, y2 - 40, { steps: 4 }); await page.mouse.up(); await page.waitForTimeout(250);
    assert.equal(await more.getAttribute("aria-expanded"), "false", "drag up folds");
  });

  if (!phone) {
    await step(`${W} (f) desktop: the bar stays at the top, whole`, async () => {
      assert.ok(!/bar-mini/.test(await cls(page)));
      assert.ok(await page.isVisible("#code"));
      assert.ok(!(await page.isVisible("#barTab")));
    });
  } else {
    await step(`${W} (f) no problem: the full bar; problem open: a strip with the up-chevron`, async () => {
      await page.goto(BASE + "/"); await page.waitForTimeout(400);
      assert.ok(await page.isVisible("#code"), "full bar with nothing open");
      assert.ok(!(await page.isVisible("#barTab")));
      await page.fill("#code", "CALC1_X2P"); await page.press("#code", "Enter"); await opened(page, "CALC1_X2P");
      await page.waitForTimeout(300);
      assert.ok(!(await page.isVisible("#code")), "code box put away");
      const tab = await page.locator("#barTab").boundingBox();
      assert.ok(tab.height <= 44 && tab.y + tab.height >= H - 2, `strip at the bottom: ${JSON.stringify(tab)}`);
      assert.equal(await page.getAttribute("#barTab", "aria-expanded"), "false");
      await shot("strip");
    });
    await step(`${W} (f) tap and swipe up reveal it over the page (no reflow); tap and swipe down put it away`, async () => {
      const at = () => page.$eval("#xb", e => Math.round(e.getBoundingClientRect().top + scrollY));
      const y0 = await at(), docH = await page.evaluate(() => document.documentElement.scrollHeight);
      await page.tap("#barTab"); await page.waitForTimeout(250);
      assert.ok(await page.isVisible("#code"), "tap reveals");
      assert.equal(await at(), y0, "nothing moved"); assert.equal(await page.evaluate(() => document.documentElement.scrollHeight), docH, "page height kept");
      await shot("revealed");
      await page.tap("#barTab"); await page.waitForTimeout(250);
      assert.ok(!(await page.isVisible("#code")), "tap hides");
      const swipe = async dy => { const r = await page.locator("#barTab").boundingBox(), x = r.x + r.width / 2, y = r.y + r.height / 2;
        await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x, y + dy, { steps: 4 }); await page.mouse.up(); await page.waitForTimeout(250); };
      await swipe(-40); assert.ok(await page.isVisible("#code"), "swipe up reveals");
      await swipe(40); assert.ok(!(await page.isVisible("#code")), "swipe down hides");
    });
    await step(`${W} (grow) the scratchpad grows DOWN into the freed room; revealing the bar while typing moves nothing`, async () => {
      await page.goto(BASE + "/#PHYS_ZZ1"); await opened(page, "PHYS_ZZ1");
      await page.locator("#scratch").focus();
      await page.$eval("#scratch", e => e.scrollIntoView({ block: "start" }));
      await page.waitForTimeout(300);
      const top0 = (await caret(page)).top;
      for (let i = 1; i <= 40; i++) await page.keyboard.type(i === 1 ? "line 1" : `\nline ${i}`);
      await page.waitForTimeout(300);
      const c0 = await caret(page);
      assert.equal(c0.top, top0, "top edge fixed while it grew");
      const room = await page.evaluate(() => { const v = visualViewport, t = document.querySelector("#scratch").getBoundingClientRect(); return Math.round(v.offsetTop + v.height - t.bottom); });
      assert.ok(room >= 40 && room <= 50, `box stops at the strip (room under it ${room}px)`);
      assert.ok(c0.y >= c0.top && c0.y < c0.barTop, "caret visible above the strip");
      await page.tap("#barTab"); await page.waitForTimeout(300);
      const c1 = await caret(page);
      assert.ok(c1.focus, "focus kept");
      const lh = await page.$eval("#scratch", t => parseFloat(getComputedStyle(t).lineHeight));
      assert.ok(c1.y + lh <= c1.barTop, `caret line under the revealed bar: ${c1.y}+${lh} > ${c1.barTop}`);
      assert.equal(c1.y, c0.y, "caret did not move on reveal"); assert.equal(c1.h, c0.h, "box did not shrink");
      await shot("typing-revealed");
      await page.keyboard.type("!");
      await page.tap("#barTab"); await page.waitForTimeout(300);
      const c2 = await caret(page);
      assert.equal(c2.y, c0.y, "caret did not move on hide"); assert.ok(c2.focus);
      assert.ok(c2.y + lh <= c2.barTop, "caret visible");
      await shot("typing");
    });
  }
  await b.close();
}
console.log(failures ? `${failures} failed` : "all ok");
process.exit(failures ? 1 : 0);
