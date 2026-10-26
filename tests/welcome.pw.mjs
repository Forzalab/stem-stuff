// welcome.js (DESIGN-v3 §2, TONY-DECISIONS #5): Q1 = the bank's `welcome` item through repair.js's welcome variant, driven through its lab
// page (design/welcome-lab.html; a hand-made dead-easy item, no fetch). Warm surface; opens with every sub-step shown (label + its input);
// the first step done collapses to ✓ and the rest fade to a label only, so the student walks alone; one why on the faded (fam) step;
// unfailable (a wrong tap is the next hint: no ✗, no red); the last step → welcome_done. Reduced motion: no fade animation. 360px, text only.
//   node tests/welcome.pw.mjs                          (the lab from disk)
//   node tests/welcome.pw.mjs http://localhost:8832    (the lab through serve.py)
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { pw = require("/opt/node22/lib/node_modules/playwright"); }
const LAB = process.argv[2] ? process.argv[2].replace(/\/$/, "") + "/design/welcome-lab.html"
  : "file://" + join(dirname(fileURLToPath(import.meta.url)), "..", "design", "welcome-lab.html");

let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); }
  catch (e) { failures++; console.log("FAIL", name, "\n     ", e.message.slice(0, 700)); }
}
const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
try {
  const page = await browser.newPage({ viewport: { width: 360, height: 800 } });
  const errs = []; page.on("pageerror", e => errs.push(e.message));
  await page.goto(LAB);
  const states = () => page.$$eval(".rp-step", s => s.map(x => x.dataset.id + ":" + x.dataset.state));
  const ev = () => page.evaluate(() => window.__ev);
  const act = sel => page.click(`.rp-step[data-state="active"] ${sel}`);
  const fields = id => page.$$eval(`.rp-step[data-id="${id}"] .wl-field:not(.wl-out)`, f => f.length);   // a sub-step's shown input (not one fading out)

  await step("open: a warm surface (not the page's), every step shown at full strength, each future one with its input", async () => {
    await page.evaluate(() => window.lab());
    const bg = await page.evaluate(() => {
      const v = getComputedStyle(document.querySelector(".wl")).backgroundColor, t = document.createElement("i");
      t.style.color = "var(--help-fill)"; document.body.append(t);
      const warm = getComputedStyle(t).color; t.remove();
      return { v, warm, page: getComputedStyle(document.body).backgroundColor };
    });
    assert.equal(bg.v, bg.warm, "Q1 sits on the warm token");
    assert.notEqual(bg.v, bg.page, "differently coloured from the page");
    assert.deepEqual(await states(), ["formula:active", "plug:future", "answer:future"]);
    assert.deepEqual(await page.$$eval(".rp-step", s => s.map(x => x.offsetParent !== null && getComputedStyle(x).opacity === "1")), [true, true, true],
      "all steps visible on open");
    assert.equal(await page.$$eval('.rp-step[data-id="formula"] .rp-val-opts .rp-chip', c => c.length), 3, "step one: its chips");
    assert.equal(await fields("plug"), 1, "step two shows its input");
    assert.equal(await fields("answer"), 1, "the last step shows its input");
    assert.equal(await page.getAttribute('.wl-field', "aria-hidden"), "true", "a shown input is a picture, not a control");
    assert.match(await page.textContent(".rp-line"), /\S/, "the warm line");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "no sideways scroll at 360");
  });

  await step("a wrong tap: no ✗, no .wrong / red class, the hint shows; another wrong tap = the next hint; still the active step", async () => {
    await act('.rp-val-opts .rp-chip[data-v="b"]');
    const h1 = await page.textContent('.rp-step[data-id="formula"] .rp-miss');
    assert.match(h1, /\S/, "a hint");
    await act('.rp-val-opts .rp-chip[data-v="c"]');
    const h2 = await page.textContent('.rp-step[data-id="formula"] .rp-miss');
    assert.notEqual(h2, h1, "the next hint");
    assert.equal(await page.$$eval(".wl *", x => x.filter(e => /wrong|red|err/i.test(typeof e.className === "string" ? e.className : "")).length), 0);
    assert.equal(await page.textContent(".wl").then(t => t.includes("✗")), false);
    assert.equal(await page.evaluate(() => {
      const m = getComputedStyle(document.querySelector(".rp-miss")).color, t = document.createElement("i");
      t.style.color = "var(--wrong)"; document.body.append(t); const w = getComputedStyle(t).color; t.remove(); return m === w;
    }), false, "the hint is not in the wrong colour");
    assert.equal(await page.getAttribute('.rp-step[data-id="formula"]', "data-state"), "active", "unfailable: no auto-fill");
  });

  await step("step one filled → collapses to ✓; step two is faded (label + its own input, no shown sub-step), the last a label only", async () => {
    await act('.rp-val-opts .rp-chip[data-v="a"]');
    assert.deepEqual(await states(), ["formula:done", "plug:active", "answer:future"]);
    assert.match(await page.textContent('.rp-step[data-id="formula"]'), /✓/);
    assert.equal(await page.$$eval('.rp-step[data-id="formula"] .rp-body', b => b.length), 0, "collapsed to one line");
    assert.equal(await fields("plug"), 0, "step two: no shown sub-step");
    assert.equal(await fields("answer"), 0, "faded: the last step is a label only");
    assert.equal(await page.$$eval('.rp-step[data-id="answer"] :is(input, button, .wl-field:not(.wl-out))', c => c.length), 0);
    assert.equal(await page.getAttribute(".wl", "data-fade"), "alone");
    assert.equal(await page.$$eval('.rp-step[data-id="plug"] .rp-why .rp-chip', c => c.length), 3, "one why on the faded step");
    assert.equal(await page.$$eval(".rp-why", w => w.length), 1, "only one why");
  });

  await step("finishing emits welcome_done once", async () => {
    await act('.rp-val-opts .rp-chip[data-v="+"]');                           // a wrong tap mid-way is still a hint
    assert.equal(await page.getAttribute('.rp-step[data-id="plug"]', "data-state"), "active");
    await act('.rp-val-opts .rp-chip[data-v="×"]');
    await act('.rp-why .rp-chip[data-why="0"]');
    await page.fill('.rp-step[data-state="active"] input', "6");
    await act(".rp-check");
    assert.equal(await page.$$eval(".rp-step", s => s.every(x => x.dataset.state === "done")), true);
    const done = (await ev()).filter(e => e[0] === "welcome_done");
    assert.equal(done.length, 1);
    assert.equal(await page.$$eval(".rp-skip", s => s.length), 0, "no skip on Q1");
  });

  await step("reduced motion: the fade does not animate (a fading sub-step is simply gone)", async () => {
    const p = await browser.newPage({ viewport: { width: 360, height: 800 }, reducedMotion: "reduce" });
    await p.goto(LAB);
    await p.click('.rp-step[data-state="active"] .rp-val-opts .rp-chip[data-v="a"]');
    const out = await p.$$eval(".wl-out", o => o.map(x => getComputedStyle(x).display));
    assert.ok(out.every(d => d === "none"), "fading sub-steps: " + out.join(","));
    assert.equal(await p.$$eval(".wl *", x => x.filter(e => getComputedStyle(e).animationName !== "none").length), 0, "nothing animates");
    await p.close();
  });

  await step("text only: a label with markup lands as text, never as an element", async () => {
    await page.evaluate(() => { window.__x = 0; window.lab({ label: "<img src=x onerror=window.__x=1>" }); });
    assert.equal(await page.$$eval(".wl img", x => x.length), 0);
    assert.match(await page.textContent(".wl"), /<img src=x/);
    assert.equal(await page.evaluate(() => window.__x), 0);
  });

  await step("destroy: removes Q1 and stops watching", async () => {
    await page.evaluate(() => { const h = document.getElementById("host"); const w = Welcome.mount(h, FIX, {}); w.destroy(); });
    assert.equal(await page.$$eval("#host .wl", x => x.length), 0);
  });

  await step("no page errors", async () => assert.deepEqual(errs, []));
} finally {
  await browser.close();
}
if (failures) { console.log(`\n${failures} failing`); process.exit(1); }
console.log("\nall ok");
