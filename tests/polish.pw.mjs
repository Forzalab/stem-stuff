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
  /* phones since round 3b: the pad is off the page; the Scratchpad button opens the pad page (design/MULTITASK.md) */
  const padPage = async () => { if (!phone || await page.evaluate(() => document.documentElement.classList.contains("mt"))) return;
    await page.click("#padFab"); await page.waitForFunction(() => document.documentElement.classList.contains("mt")); await page.waitForTimeout(300); };
  await step(`${W} (a) focused scratchpad: one ring (the border), no outline`, async () => {
    await padPage();
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
    await step(`${W} (b) pad page: the top bar is out of the way while it is open; back when it closes`, async () => {
      await padPage();
      const navSeen = () => page.evaluate(() => { const n = document.querySelector("#qnav"); if (!n || n.hidden) return false;
        const r = n.getBoundingClientRect(), h = document.elementFromPoint(r.left + r.width / 2, Math.max(1, r.top + r.height / 2)); return !!h && n.contains(h); });
      if (!ONLY_SHOTS) assert.ok(!(await navSeen()), "top bar visible over the pad page");
      await kbUp(); await kbDown();
      if (!ONLY_SHOTS) assert.ok(!(await navSeen()), "top bar back while the pad page is still open");
      await shot("pad-page");
      await page.click("#mtExp"); await page.waitForFunction(() => !document.documentElement.classList.contains("mt")); await page.waitForTimeout(300);
      if (!ONLY_SHOTS) assert.ok(await navSeen(), "top bar not back after the pad page closed");
    });
    await step(`${W} (c) same type sizes in the pad page's tile (q and a) as in the normal view`, async () => {
      await padPage();
      if (!ONLY_SHOTS) assert.equal(await fontOf(page, "#blocks .md p"), normal.p, "question text");
      await shot("tile-q");
      await page.click("#mtMode"); await page.waitForTimeout(400);
      await shot("tile-a");
      if (!ONLY_SHOTS) assert.equal(await fontOf(page, "#q .opt .txt"), normal.opt, "choices");
      await page.click("#mtMode"); await page.waitForTimeout(300);
    });
    await step(`${W} (d) pad page: the pad starts a small gap under the tile and reaches the bottom`, async () => {
      await padPage();
      const g = await page.evaluate(() => {
        const f = document.querySelector("#freeze").getBoundingClientRect(), t = document.querySelector("#scratch").getBoundingClientRect(),
          m = document.querySelector("#main").getBoundingClientRect(), v = visualViewport;
        return { gap: t.top - f.bottom, bottomRoom: Math.min(m.bottom, v.offsetTop + v.height) - t.bottom };
      });
      if (!ONLY_SHOTS) {
        assert.ok(g.gap >= 4 && g.gap <= 16, `gap to the tile ${g.gap}px`);
        assert.ok(g.bottomRoom >= 0 && g.bottomRoom <= 16, `pad reaches the bottom (${g.bottomRoom}px left)`);
      }
      await page.click("#mtExp"); await page.waitForFunction(() => !document.documentElement.classList.contains("mt"));
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
