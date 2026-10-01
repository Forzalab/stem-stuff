// Polish batch: (a) one focus ring on the scratchpad, (b) top bar stays away while the scratchpad has focus, keyboard or not,
// (c) one type scale across normal and Swap, (d) Swap scratchpad grows up to a small gap under the question.
// Needs a running server and Playwright:   python3 serve.py 8815 &   then   node tests/polish.pw.mjs http://localhost:8815 [shotDir] [prefix]
// The keyboard is simulated as in swap.pw.mjs: the viewport shrinks to 55% of its height.
import { createRequire } from "node:module";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { pw = require("/opt/node22/lib/node_modules/playwright"); }
const BASE = process.argv[2] || "http://localhost:8815";
const SHOTS = process.argv[3] || "";
const PREFIX = process.argv[4] || "polish";
const ONLY_SHOTS = !!process.env.ONLY_SHOTS;
let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); }
  catch (e) { failures++; console.log("FAIL", name, "\n     ", e.message.slice(0, 600)); }
}
const BANK = { v: 1, problems: [
  { code: "CALC1_ZZ9", type: "mc", body: [{ type: "text", md: "Solve for $x$:\n\n$$x + 2 = 11$$" }], correct: "a",
    choices: [{ id: "a", md: "$9$" }, { id: "b", md: "$13$" }, { id: "c", md: "$-9$" }, { id: "d", md: "$22$" }] },
  { code: "CALC1_ZZ8", type: "num", answer: "3", body: [{ type: "text", md: "What is $1 + 2$?" }] }] };
const fontOf = (page, sel) => page.$eval(sel, e => { const s = getComputedStyle(e); return `${s.fontSize}/${s.lineHeight}/${s.fontWeight}`; });

for (const [W, H] of [[375, 667], [390, 844], [430, 932], [1920, 1080]]) {
  const phone = W < 1000;
  const b = await pw.chromium.launch({ args: ["--no-sandbox"] });
  const ctx = await b.newContext({ viewport: { width: W, height: H }, hasTouch: phone, isMobile: phone, serviceWorkers: "block" });
  const page = await ctx.newPage();
  const shot = async n => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${PREFIX}-${n}-${W}.png` }); };
  const kbUp = async () => { await page.setViewportSize({ width: W, height: Math.round(H * 0.55) }); await page.waitForTimeout(500); };
  const kbDown = async () => { await page.setViewportSize({ width: W, height: H }); await page.waitForTimeout(500); };
  await page.goto(BASE + "/");
  const [fc] = await Promise.all([page.waitForEvent("filechooser"), page.click("#upload")]);
  await fc.setFiles({ name: "mine.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(BANK)) });
  await page.waitForFunction(() => /^CALC1_ZZ/.test(document.querySelector("#pcode")?.textContent || "") && !document.querySelector("#freeze").hidden);   // the first in the shuffled list
  await page.evaluate(() => { location.hash = "CALC1_ZZ9"; });
  await page.waitForFunction(() => document.querySelector("#pcode")?.textContent === "CALC1_ZZ9" && !document.querySelector("#freeze").hidden);
  await page.waitForTimeout(300);

  const normal = { p: await fontOf(page, "#blocks .md p"), opt: await fontOf(page, "#q .opt .txt") };
  await step(`${W} (a) focused scratchpad: one ring (the border), no outline`, async () => {
    await page.locator("#scratch").focus(); await page.waitForTimeout(200);
    await shot("focus");
    if (!ONLY_SHOTS) {
      const s = await page.$eval("#scratch", e => { const c = getComputedStyle(e); return { o: c.outlineStyle, w: c.outlineWidth, bc: c.borderTopColor, sh: c.boxShadow }; });
      assert.ok(s.o === "none" || s.w === "0px", `outline ${s.o} ${s.w}`);
      assert.equal(s.sh, "none");
      assert.equal(s.bc, "rgb(143, 176, 255)", "border in --focus");
    }
  });
  if (phone) {
    await step(`${W} (b) top bar stays away while the scratchpad keeps focus after the keyboard goes`, async () => {
      await page.locator("#scratch").focus(); await page.waitForTimeout(250);
      const hidden = () => page.$eval("#qnav", e => getComputedStyle(e).visibility === "hidden");
      if (!ONLY_SHOTS) assert.ok(await hidden(), "hidden on focus");
      await kbUp(); await kbDown();
      /* some browsers send focusout / focusin pairs while the layout changes under a focused field: must not bring it back */
      await page.$eval("#scratch", e => e.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
      await page.waitForTimeout(700);
      assert.equal(await page.evaluate(() => document.activeElement.id), "scratch");
      await shot("kb-down");
      if (!ONLY_SHOTS) assert.ok(await hidden(), "hidden after the keyboard went, focus kept");
      await page.$eval("#scratch", e => e.blur()); await page.waitForTimeout(500);
      if (!ONLY_SHOTS) assert.ok(!(await hidden()), "back after blur");
    });
    await step(`${W} (c) same type sizes in Swap as in the normal view`, async () => {
      await page.locator("#scratch").focus(); await kbUp();
      assert.ok(await page.evaluate(() => document.documentElement.classList.contains("swap-scratch")), "swap on");
      await shot("swap-scratch");
      const sw = { p: await fontOf(page, "#blocks .md p") };
      if (!ONLY_SHOTS) assert.equal(sw.p, normal.p, "question text");
      await page.click("#swap"); await page.waitForTimeout(400);
      await shot("swap-problem");
      if (!ONLY_SHOTS) { assert.equal(await fontOf(page, "#blocks .md p"), normal.p); assert.equal(await fontOf(page, "#q .opt .txt"), normal.opt); }
      await page.click("#swap"); await page.waitForTimeout(400);
    });
    await step(`${W} (d) Swap: scratchpad grows up to a small gap under the question`, async () => {
      const g = await page.evaluate(() => {
        const f = document.querySelector("#freeze").getBoundingClientRect(), t = document.querySelector("#scratch").getBoundingClientRect(),
          st = document.querySelector("#stage").getBoundingClientRect();
        return { gap: t.top - f.bottom, bottomRoom: st.bottom - t.bottom };
      });
      if (!ONLY_SHOTS) {
        assert.ok(g.gap >= 4 && g.gap <= 12, `gap to the question ${g.gap}px`);
        assert.ok(g.bottomRoom >= 0 && g.bottomRoom <= 8, `box reaches the stage bottom (${g.bottomRoom}px left)`);
      }
      await kbDown(); await page.$eval("#scratch", e => e.blur());
    });
  } else {
    await step(`${W} (c) type scale: problem, choices at body size; labels one size`, async () => {
      if (ONLY_SHOTS) return;
      const lab = await fontOf(page, "#xbName"), how = await page.$eval("#pcode", e => getComputedStyle(e).fontSize);
      assert.equal(normal.p.split("/")[0], normal.opt.split("/")[0], "problem = choices");
      assert.equal(lab.split("/")[0], how, "scratchpad title = problem code size");
    });
    await page.$eval("#scratch", e => e.blur()); await page.waitForTimeout(200);
    await shot("normal");
  }
  await b.close();
}
console.log(failures ? `${failures} failed` : "all ok");
process.exit(failures ? 1 : 0);
