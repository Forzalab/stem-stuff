// Formula card math is never cut off top or bottom (todo 115; Tony, Oct 28: "K = ½mv²" next to its copy icon, the fraction looked cut off).
// .fcard .fm scrolls sideways (a wide formula, BUOY / P2X Q7), so its overflow-y cannot be visible: a \frac, \tfrac12, \sqrt or ^{...} whose ink
// rises or drops past the 1.4 line box was clipped at the box edge (main, Oct 29: 88-142 of the 163 exam-3 sheet rows, every engine and size).
// For every card formula at 1280x800, 1440x900, 390x844 and 360x740, on chromium, firefox and webkit: the math box does not overflow vertically
// (scrollHeight <= clientHeight + 1) and the KaTeX ink (every painted box under .katex-html) sits inside it (1 px slack). Kept: a wide formula
// still scrolls inside .fm (never the page), and the "?" and the copy keep their 44px tap areas. Chromium is required; a missing firefox /
// webkit prints NOT COVERED (run-all lists it). Own serve.py with a throwaway bank + formula sheet.   node tests/fcard-clip.pw.mjs <port> [shots dir]
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { try { pw = require("/opt/node22/lib/node_modules/playwright"); } catch { pw = require("/opt/node-tools/node_modules/playwright"); } }

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = /^\d+$/.test(process.argv[2] || "") ? process.argv[2] : "8897", BASE = `http://127.0.0.1:${PORT}`;
const TMP = mkdtempSync(join(tmpdir(), "fcc-")), BANKS = join(TMP, "banks"), SHOTS = process.argv[3] || "";
mkdirSync(BANKS); if (SHOTS) mkdirSync(SHOTS, { recursive: true });
/* the tall shapes of the real exam-3 sheet (verbatim rows where noted), Tony's card, and a formula wider than a phone */
const ROWS = [
  { id: "KE", tex: "K = \\frac{1}{2}mv^2", doc: { purpose: "Kinetic energy.", sym: [{ s: "m", m: "mass", u: "kg" }, { s: "v", m: "speed", u: "m/s" }] } },
  { id: "VMAG", tex: "v = \\sqrt{v_x^2 + v_y^2}" },                                                                         // sheet
  { id: "VAVG", tex: "\\bar v_x = \\frac{\\text{displacement}}{\\text{elapsed time}} = \\frac{\\Delta x}{\\Delta t} = \\frac{x_f-x_i}{t_f-t_i}" },   // sheet
  { id: "VRMS", tex: "v_{rms} = \\sqrt{\\frac{3k_BT}{m}} = \\sqrt{\\frac{3RT}{M}}" },                                        // sheet
  { id: "KEP", tex: "T^2 = \\left(\\frac{4\\pi^2}{GM}\\right)r^3" },                                                          // sheet
  { id: "DY", tex: "\\Delta y = v_{y,0}t - \\tfrac12 gt^2", doc: { purpose: "Height in free fall." } },                       // sheet
  { id: "KE2", tex: "KE = \\tfrac12 mv^2" },                                                                                  // sheet
  { id: "WIDE", tex: "F_B = \\rho_{fluid} V_{sub} g = \\rho_{fluid}\\left(\\frac{m_{obj}}{\\rho_{obj}}\\right) g = m_{obj}\\, g\\, \\frac{\\rho_{fluid}}{\\rho_{obj}} = W_{apparent} + T_{rope}" }];
const PROBS = [["CALC1_FC1", ["KE", "VMAG"]], ["CALC1_FC2", ["VAVG", "VRMS", "KEP", "DY"]], ["CALC1_FC3", ["WIDE", "KE2"]]];
writeFileSync(join(BANKS, "formula-sheet.json"), JSON.stringify({ v: 3, groups: [{ name: "Clip", rows: ROWS }] }));
writeFileSync(join(BANKS, "BANK_FCC.json"), JSON.stringify({ v: 1, problems: PROBS.map(([code, part]) => ({ code, title: code, type: "expr", var: "x",
  points: [1, 2, 3], body: [{ type: "text", md: "Type $x$." }], answer: "x", saccharine: { title: code, part } })) }));
const srv = spawn("python3", [join(ROOT, "serve.py"), PORT], { env: { ...process.env, STEM_BANKS: BANKS, STEM_TRIES: join(TMP, "tries.json"),
  OPENROUTER_API_KEY: "", CLAUDE_API: "" }, stdio: "ignore" });
for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + "/")).ok) break; } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 100)); }

let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); }
  catch (e) { failures++; console.log("FAIL", name, "\n     ", String(e.message).slice(0, 900)); }
}
const go = async (page, code) => {
  await page.evaluate(c => { location.hash = c; }, code);
  await page.waitForFunction(c => document.querySelector("#pcode")?.textContent === c && document.querySelector("#fcard li.f .katex"), code, { timeout: 8000 });
  await page.evaluate(() => document.fonts.ready);
};
/* each visible card formula: [tex, overflow px (scrollHeight - clientHeight), ink past the top, ink past the bottom] */
const clip = page => page.$$eval("#fcard li.f .fm", fms => fms.filter(fm => fm.checkVisibility()).map(fm => {
  const r = fm.getBoundingClientRect();
  let t = Infinity, b = -Infinity;
  for (const e of fm.querySelectorAll(".katex-html, .katex-html *")) { const q = e.getBoundingClientRect(); if (q.width && q.height) { t = Math.min(t, q.top); b = Math.max(b, q.bottom); } }
  return [fm.querySelector("annotation")?.textContent, fm.scrollHeight - fm.clientHeight, +(r.top - t).toFixed(1), +(b - r.bottom).toFixed(1)];
}));
/* the 3 points 12px above, at and 12px below a 16px mark's centre all hit it (its 44px ::after) */
const tap = (page, sel) => page.$$eval(sel, es => es.map(x => {
  x.scrollIntoView({ block: "center" });
  const r = x.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  return [-12, 0, 12].every(dy => x.contains(document.elementFromPoint(cx, cy + dy))) && [-12, 12].every(dx => x.contains(document.elementFromPoint(cx + dx, cy)));
}));

const SIZES = [[1280, 800], [1440, 900], [390, 844], [360, 740]];
for (const [label, type] of [["chromium", pw.chromium], ["firefox", pw.firefox], ["webkit", pw.webkit]]) {
  let b;
  try { b = await type.launch(label === "chromium" ? { args: ["--no-sandbox"] } : {}); }
  catch (e) {
    if (label === "chromium") { failures++; console.log("FAIL chromium: no browser", e.message.split("\n")[0]); continue; }
    console.log(`NOT COVERED ${label}: no browser (${e.message.split("\n")[0]})`); continue;
  }
  for (const [width, height] of SIZES) {
    const ctx = await b.newContext({ viewport: { width, height }, serviceWorkers: "block", deviceScaleFactor: SHOTS ? 2 : 1 });
    await ctx.addInitScript(() => { try { localStorage.setItem("stem-ob", "done"); localStorage.setItem("stem-voice", "off"); } catch { /* */ } });
    await ctx.route(/youtube|ytimg|googlevideo/, r => r.abort());
    const page = await ctx.newPage();
    const errs = []; page.on("pageerror", e => errs.push(String(e)));
    await page.goto(`${BASE}/#BANK_FCC`);
    await page.waitForFunction(() => !document.getElementById("splash") && !!(window.stemBank && window.stemBank.code) && /^#CALC1_/.test(location.hash), null, { timeout: 15000 });
    await step(`${label} ${width}x${height}: no card formula is cut off top or bottom`, async () => {
      const bad = [];
      for (const [code] of PROBS) {
        await go(page, code);
        for (const [tex, over, top, bot] of await clip(page)) if (over > 1 || top > 1 || bot > 1) bad.push(`${tex}: overflow ${over}px, ink ${top}px over the top, ${bot}px under the bottom`);
      }
      assert.deepEqual(bad, []);
    });
    await step(`${label} ${width}x${height}: a wide formula scrolls in its box, never the page; the "?" and copy keep 44px tap areas`, async () => {
      await go(page, "CALC1_FC3");
      const [fmW, pageW] = await page.evaluate(() => { const fm = document.querySelector("#fcard li.f .fm"); return [fm.scrollWidth - fm.clientWidth, document.scrollingElement.scrollWidth - innerWidth]; });
      assert.ok(pageW <= 0, `the page scrolls sideways by ${pageW}px`);
      if (width < 500) assert.ok(fmW > 0, "the wide formula should scroll inside .fm at phone width");
      await go(page, "CALC1_FC1");
      assert.deepEqual(await tap(page, "#fcard .fq"), [true], "the ?'s tap area");
      assert.deepEqual(await tap(page, "#fcard li.f .mcopy"), [true, true], "the copies' tap areas");
      assert.deepEqual(errs, []);
    });
    if (SHOTS && label === "chromium" && (width === 1440 || width === 390)) for (const [code] of PROBS.slice(0, 2)) {
      await go(page, code); await page.locator("#fcard").scrollIntoViewIfNeeded();
      await page.locator("#fcard").screenshot({ path: join(SHOTS, `fcard-${code.slice(-3)}-${width}.png`) });
    }
    await ctx.close();
  }
  await b.close();
}

/* todo 115 step 5 (Tony, Oct 29): on a hover + fine-pointer device the formula copy is invisible at rest (opacity 0, still in the row: no shift, still focusable), shown
   while the pointer is over its row or focus is in it, with no fade under reduced motion; on touch it is always visible. Chromium. */
{
  const b = await pw.chromium.launch({ args: ["--no-sandbox"] });
  const open = async (opts, motion) => {
    const ctx = await b.newContext({ serviceWorkers: "block", reducedMotion: motion, ...opts });
    await ctx.addInitScript(() => { try { localStorage.setItem("stem-ob", "done"); localStorage.setItem("stem-voice", "off"); } catch { /* */ } });
    await ctx.route(/youtube|ytimg|googlevideo/, r => r.abort());
    const page = await ctx.newPage();
    await page.goto(`${BASE}/#BANK_FCC`);
    await page.waitForFunction(() => !document.getElementById("splash") && !!(window.stemBank && window.stemBank.code) && /^#CALC1_/.test(location.hash), null, { timeout: 15000 });
    await go(page, "CALC1_FC1");
    return [ctx, page];
  };
  const st = page => page.$eval("#fcard li.f .mcopy", e => { const r = e.getBoundingClientRect(); return { o: +getComputedStyle(e).opacity, t: getComputedStyle(e).transitionDuration, x: r.x, y: r.y, w: r.width }; });
  await step("desktop (hover + fine pointer): the formula copy is hidden at rest, in place, and shows on row hover and on keyboard focus; no fade under reduced motion", async () => {
    let [ctx, page] = await open({ viewport: { width: 1440, height: 900 } }, "no-preference");
    assert.ok(await page.evaluate(() => matchMedia("(hover: hover) and (pointer: fine)").matches), "headless desktop should be hover + fine");
    const rest = await st(page); assert.equal(rest.o, 0, "copy visible at rest");
    assert.ok(rest.w > 0, "copy must keep its box (no layout shift)");
    await page.locator("#fcard li.f .fm").first().hover();
    await page.waitForTimeout(400); const hov = await st(page); assert.equal(hov.o, 1, "copy not shown on row hover");
    assert.deepEqual([hov.x, hov.y], [rest.x, rest.y], "the copy moved");
    if (SHOTS) await page.locator("#fcard").screenshot({ path: join(SHOTS, "copy-hover-1440.png") });
    await page.mouse.move(5, 5); await page.waitForTimeout(400); assert.equal((await st(page)).o, 0, "copy stays after the pointer leaves");
    if (SHOTS) await page.locator("#fcard").screenshot({ path: join(SHOTS, "copy-rest-1440.png") });
    await page.keyboard.press("Tab"); for (let i = 0; i < 30 && !(await page.evaluate(() => document.activeElement?.classList.contains("mcopy"))); i++) await page.keyboard.press("Tab");
    assert.ok(await page.evaluate(() => document.activeElement?.classList.contains("mcopy")), "the copy is not focusable by keyboard");
    await page.waitForTimeout(400); assert.equal((await st(page)).o, 1, "copy hidden under keyboard focus");
    await ctx.close();
    [ctx, page] = await open({ viewport: { width: 1440, height: 900 } }, "reduce");
    assert.equal((await st(page)).t.split(",")[0], "0s", "the copy fades under reduced motion");
    await ctx.close();
  });
  await step("touch (no hover): the formula copy is visible at rest", async () => {
    const [ctx, page] = await open({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }, "no-preference");
    assert.equal(await page.evaluate(() => matchMedia("(hover: hover)").matches), false);
    assert.equal((await st(page)).o, 1, "copy hidden on touch");
    await ctx.close();
  });
  await b.close();
}
srv.kill();
console.log(failures ? `${failures} FAIL` : "fcard-clip: all ok");
process.exit(failures ? 1 : 0);
