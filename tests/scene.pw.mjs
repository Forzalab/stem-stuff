// Scene steppers in a real browser (viz MVP, todo 120; views/scene-contract.md): the five vizbench cases (rod roll junction cg loop),
// gated by views_gate for their own problem (tests/scene-cases.mjs), drawn by views.js + scene.js inside Cluck's dark surface
// (.ai-box tokens, a .wtext reply slot) at 1440x900 and 390x844. Every step of every case: no sideways scroll, the figure inside its
// slot, no two labels overlapping on screen (measured, not estimated), no label under 13 px, no console error.
// Then: Next tweens (a mid-frame between the two states; 200 ms), Back tweens back and replays exactly, reduced motion = instant.
// usage: python3 serve.py 8815 &   node tests/scene.pw.mjs http://localhost:8815 [shotDir]   (shots: <case>-<width>-s<k>.png)
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { cases, NAMES } from "./scene-cases.mjs";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { pw = require("/opt/node22/lib/node_modules/playwright"); }
const BASE = process.argv[2] || "http://localhost:8815";
const SHOTS = process.argv[3] || "";
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); }
  catch (e) { failures++; console.log("FAIL", name, "\n     ", String(e.message).slice(0, 900)); }
}
const CASES = cases();
const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="/app.css"><link rel="stylesheet" href="/views.css"><script src="/graph.js"></script>
<style>body{margin:0;background:var(--help-sheet)} #sheet{padding:var(--s4)}</style></head>
<body><div id="sheet" class="ai-skin ai-box"><div class="wtext"><div id="ph" class="fig wfig wview"></div></div></div>
<script type="module">import * as V from "/views.js"; window.V = V; document.documentElement.dataset.ready = "1";</script></body></html>`;

const b = await pw.chromium.launch({ args: ["--no-sandbox"] });
async function open(W, motion = "reduce") {
  const phone = W < 700;
  const ctx = await b.newContext({ viewport: { width: W, height: phone ? 844 : 900 }, hasTouch: phone, isMobile: phone, serviceWorkers: "block", reducedMotion: motion, colorScheme: "dark" });
  const page = await ctx.newPage();
  page.errs = [];
  page.on("pageerror", e => page.errs.push(String(e)));
  page.on("console", m => { if (m.type() === "error" || m.type() === "warning") page.errs.push(m.text()); });
  await page.route(`${BASE}/__scene.html`, r => r.fulfill({ contentType: "text/html", body: PAGE }));
  await page.goto(`${BASE}/__scene.html`);
  await page.waitForFunction(() => document.documentElement.dataset.ready === "1");
  await page.evaluate(() => document.fonts.ready);
  return page;
}
const draw = (page, src, stage) => page.evaluate(([s, st]) => { const v = window.V.render(s, document.getElementById("ph"), { stage: st }); return v.errors.map(e => e.message); }, [src, stage]);
const measure = page => page.evaluate(() => {
  const de = document.documentElement, ph = document.getElementById("ph"), svg = ph.querySelector(".vw-sc svg");
  const boxes = [...ph.querySelectorAll(".sc-lab text")].map(t => { const r = t.getBoundingClientRect(); return { t: t.textContent, x: r.left, y: r.top, w: r.width, h: r.height, fs: parseFloat(getComputedStyle(t).fontSize) * (svg ? svg.getBoundingClientRect().width / 360 : 1) }; });
  const over = [];
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const p = boxes[i], q = boxes[j], ox = Math.min(p.x + p.w, q.x + q.w) - Math.max(p.x, q.x), oy = Math.min(p.y + p.h, q.y + q.h) - Math.max(p.y, q.y);
    if (ox > 1 && oy > 1) over.push(`"${p.t}" x "${q.t}"`);
  }
  const fr = ph.getBoundingClientRect(), sr = svg ? svg.getBoundingClientRect() : fr;
  const out = boxes.filter(p => p.x < sr.left - 1 || p.x + p.w > sr.right + 1 || p.y < sr.top - 1 || p.y + p.h > sr.bottom + 1).map(p => p.t);
  const small = boxes.filter(p => p.fs < 12.5).map(p => `${p.t} ${p.fs.toFixed(1)}px`);
  return { sw: de.scrollWidth, w: de.clientWidth, over, out, small, fig: [Math.round(fr.width), Math.round(sr.height)], n: ph.querySelector(".vw-n")?.textContent };
});

try {
  for (const W of [1440, 390]) {
    const page = await open(W);
    for (const name of NAMES) {
      await step(`${W} ${name}: every step draws, fits, no label overlap, no label under 13 px`, async () => {
        assert.deepEqual(CASES[name].log.wrong, ["ok"], "the gate passes it");
        assert.deepEqual(await draw(page, CASES[name].wrong, "wrong"), []);
        const n = CASES[name].wrong.match(/^p\d+ = Step\(/gm).length;
        for (let k = 1; k <= n; k++) {
          const m = await measure(page);
          assert.equal(m.n, `Step ${k} of ${n}`);
          assert.equal(m.sw, m.w, `step ${k}: sideways scroll ${m.sw} > ${m.w}`);
          assert.deepEqual(m.over, [], `step ${k}: labels overlap`);
          assert.deepEqual(m.out, [], `step ${k}: a label leaves the figure`);
          assert.deepEqual(m.small, [], `step ${k}: a label under 13 px`);
          if (SHOTS) await page.locator("#sheet").screenshot({ path: `${SHOTS}/${name}-${W}-s${k}.png` });
          if (k < n) await page.click("#ph .vw-foot .btn:nth-child(2)");
        }
        assert.deepEqual(page.errs, []);
      });
    }
    await page.context().close();
  }

  await step("1440 rod: Next tweens the tilt (a mid-frame between 0 and -6, then -6), Back tweens back and replays step 3 exactly", async () => {
    const page = await open(1440, "no-preference");
    await draw(page, CASES.rod.wrong, "wrong");
    const next = "#ph .vw-foot .btn:nth-child(2)", back = "#ph .vw-foot .btn:nth-child(1)";
    await page.click(next); await page.click(next);
    await page.waitForTimeout(300);
    const s3 = await page.evaluate(() => document.querySelector("#ph .vw-sc svg").innerHTML);
    const rot = () => page.evaluate(() => +document.querySelector('#ph [data-id="rod"]').getAttribute("data-rot"));
    const seen = await page.evaluate(sel => new Promise(res => {
      const out = [], t0 = performance.now();
      document.querySelector(sel).click();
      const f = () => { out.push(+document.querySelector('#ph [data-id="rod"]').getAttribute("data-rot")); if (performance.now() - t0 < 320) requestAnimationFrame(f); else res(out); };
      requestAnimationFrame(f);
    }), next);
    assert.ok(seen.some(r => r < -0.3 && r > -5.7), `a mid-frame: ${seen.join(",")}`);
    assert.equal(await rot(), -6);
    await page.click(back);
    await page.waitForTimeout(320);
    assert.equal(await rot(), 0);
    assert.equal(await page.evaluate(() => document.querySelector("#ph .vw-sc svg").innerHTML), s3, "Back = the exact step-3 drawing");
    assert.deepEqual(page.errs, []);
    await page.context().close();
  });

  await step("390 roll: reduced motion draws the next state at once (no mid-frame)", async () => {
    const page = await open(390, "reduce");
    await draw(page, CASES.roll.wrong, "wrong");
    const a = await page.evaluate(() => document.querySelector("#ph .vw-sc svg").innerHTML);
    await page.click("#ph .vw-foot .btn:nth-child(2)"); await page.click("#ph .vw-foot .btn:nth-child(2)");
    const b2 = await page.evaluate(() => document.querySelector("#ph .vw-sc svg").innerHTML);
    await page.waitForTimeout(260);
    assert.equal(await page.evaluate(() => document.querySelector("#ph .vw-sc svg").innerHTML), b2, "nothing moves after the tap");
    assert.notEqual(a, b2);
    await page.context().close();
  });

  await step("1440 post stage: the rod's answer may show (W = 160 after a solve); wrong stage never", async () => {
    const page = await open(1440);
    await draw(page, CASES.rod.wrong, "wrong");
    for (let k = 1; k < 6; k++) await page.click("#ph .vw-foot .btn:nth-child(2)");
    assert.doesNotMatch(await page.textContent("#ph"), /\b160\b/);
    await page.context().close();
  });
} finally {
  await b.close();
}
console.log(failures ? `${failures} FAIL` : "all ok");
process.exit(failures ? 1 : 0);
