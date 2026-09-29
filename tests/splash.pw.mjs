// The loading splash (design/SPLASH.md). Needs a running server and Playwright:
//   python3 serve.py 8812 &   then   node tests/splash.pw.mjs http://localhost:8812
import { createRequire } from "node:module";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { pw = require("/opt/node22/lib/node_modules/playwright"); }

const BASE = process.argv[2] || "http://localhost:8812";
let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); }
  catch (e) { failures++; console.log("FAIL", name, "\n     ", e.message.slice(0, 400)); }
}
const browser = await pw.chromium.launch();
const fresh = async (opts = {}) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, ...opts });
  await ctx.addInitScript(() => { try { indexedDB.deleteDatabase("stem-stuff"); } catch { /* no idb */ } });
  return ctx;
};
// records when #splash appears and when it starts leaving (class "out") or is removed, in page time
const watch = `(() => {
  window.__sp = { seen: 0, out: 0, gone: 0 };
  new MutationObserver(() => {
    const s = document.getElementById("splash"), t = performance.now();
    if (s && !window.__sp.seen) window.__sp.seen = t;
    if (s && s.classList.contains("out") && !window.__sp.out) window.__sp.out = t;
    if (!s && window.__sp.seen && !window.__sp.gone) window.__sp.gone = t;
  }).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
})()`;
const gone = (page, timeout) => page.waitForSelector("#splash", { state: "detached", timeout });

await step("markup is inline, before the stylesheets and scripts that load files; no text; aria-hidden", async () => {
  const html = await (await fetch(BASE + "/")).text();
  const at = s => html.indexOf(s);
  assert.ok(at('id="splash"') > 0, "no #splash in the HTML");
  assert.ok(at('id="splash"') < at('rel="stylesheet"'), "splash comes after a stylesheet link");
  const m = html.match(/<div id="splash"([^>]*)>([\s\S]*?)<\/div>/);
  assert.match(m[1], /aria-hidden="true"/);
  assert.equal(m[2].replace(/<[^>]*>/g, "").trim(), "", "the splash has text");
});

await step("visible on first paint, before app.css arrives", async () => {
  const ctx = await fresh(), page = await ctx.newPage();
  await ctx.route("**/app.css", async r => { await new Promise(x => setTimeout(x, 1500)); r.continue(); });
  await page.goto(BASE + "/", { waitUntil: "commit" });
  await page.waitForSelector("#splash", { state: "attached" });
  const box = await page.evaluate(() => { const b = document.querySelector("#splash svg").getBoundingClientRect(); return [b.width, b.height, b.x + b.width / 2, b.y + b.height / 2]; });
  assert.deepEqual(box.slice(0, 2), [64, 64]);
  assert.ok(Math.abs(box[2] - 195) < 1 && Math.abs(box[3] - 422) < 1, "not centred: " + box);
  await page.waitForFunction(() => performance.getEntriesByName("first-paint").length > 0, null, { timeout: 5000 });
  await gone(page, 8000);
  const t = await page.evaluate(() => ({ paint: performance.getEntriesByName("first-paint")[0].startTime, css: performance.getEntriesByType("resource").find(r => /app\.css/.test(r.name)).responseEnd }));
  assert.ok(t.paint < t.css - 500, `first paint ${t.paint | 0} ms was not before app.css ${t.css | 0} ms`);
  await ctx.close();
});

await step("gone after load, busy cleared, shown at least 300 ms, fades out", async () => {
  const ctx = await fresh(), page = await ctx.newPage();
  await ctx.addInitScript(watch);
  await page.goto(BASE + "/#CALC1_T6B", { waitUntil: "commit" });
  await page.waitForSelector("#splash", { state: "attached" });
  assert.equal(await page.evaluate(() => document.body.getAttribute("aria-busy")), "true");
  assert.equal(await page.evaluate(() => document.getElementById("splash").getAttribute("aria-hidden")), "true");
  await gone(page, 4000);
  const s = await page.evaluate(() => window.__sp);
  assert.ok(await page.evaluate(() => !document.body.hasAttribute("aria-busy")), "aria-busy still set");
  assert.ok(s.out - s.seen >= 290, `left after ${(s.out - s.seen) | 0} ms, under 300`);
  assert.ok(s.gone - s.out >= 150 && s.gone - s.out < 400, `fade took ${(s.gone - s.out) | 0} ms`);
  await page.waitForFunction(() => document.querySelector("#pcode")?.textContent === "CALC1_T6B", null, { timeout: 8000 });   // the page works underneath
  await ctx.close();
});

for (const [how, handler] of [["aborted", r => r.abort()], ["hung", () => {}]]) {
  await step(`gone within 4 s even if KaTeX is ${how}`, async () => {
    const ctx = await fresh(), page = await ctx.newPage();
    await ctx.route("**/katex.min.js", handler);
    const t0 = Date.now();
    await page.goto(BASE + "/", { waitUntil: "commit" });
    await page.waitForSelector("#splash", { state: "attached" });
    await gone(page, 6000);
    const ms = Date.now() - t0;
    assert.ok(ms < 4600, `took ${ms} ms`);
    if (how === "hung") assert.ok(ms >= 3800, `hung load should hit the cap, left at ${ms} ms`);
    assert.ok(await page.evaluate(() => !document.body.hasAttribute("aria-busy")));
    await ctx.close().catch(() => {});
  });
}

await step("reduced motion: static mark, no animation, no fade", async () => {
  const ctx = await fresh({ reducedMotion: "reduce" }), page = await ctx.newPage();
  await ctx.addInitScript(watch);
  await page.goto(BASE + "/", { waitUntil: "commit" });
  await page.waitForSelector("#splash", { state: "attached" });
  const r = await page.evaluate(() => {
    const c = getComputedStyle(document.querySelector(".sp-curve")), d = getComputedStyle(document.querySelector(".sp-dot"));
    return { anims: document.getAnimations().length, c: c.animationName, d: d.animationName, off: c.strokeDashoffset, tr: getComputedStyle(document.getElementById("splash")).transitionDuration };
  });
  assert.equal(r.anims, 0); assert.equal(r.c, "none"); assert.equal(r.d, "none");
  assert.ok(parseFloat(r.off) === 0, "curve not fully drawn: " + r.off);
  assert.equal(r.tr, "0s");
  await gone(page, 4000);
  const s = await page.evaluate(() => window.__sp);
  assert.equal(s.out, 0, "reduced motion should not fade");
  await ctx.close();
  // control: with motion the mark is animated
  const ctx2 = await fresh(), p2 = await ctx2.newPage();
  await p2.goto(BASE + "/", { waitUntil: "commit" });
  await p2.waitForSelector("#splash", { state: "attached" });
  assert.ok(await p2.evaluate(() => document.getAnimations().length) >= 2, "no animation with motion on");
  await ctx2.close();
});

await step("pageshow persisted: no splash (while loading, and after)", async () => {
  const ctx = await fresh(), page = await ctx.newPage();
  await ctx.route("**/katex.min.js", () => {});   // keeps the splash up
  await page.goto(BASE + "/", { waitUntil: "commit" });
  await page.waitForSelector("#splash", { state: "attached" });
  await page.evaluate(() => dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));
  await gone(page, 500);
  assert.ok(await page.evaluate(() => !document.body.hasAttribute("aria-busy")));
  await ctx.close().catch(() => {});
  const c2 = await fresh(), p2 = await c2.newPage();
  await p2.goto(BASE + "/", { waitUntil: "load" }); await gone(p2, 4000);
  await p2.evaluate(() => dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));
  await p2.waitForTimeout(100);
  assert.equal(await p2.locator("#splash").count(), 0);
  await c2.close();
});

await browser.close();
console.log(failures ? `${failures} failed` : "all passed");
process.exit(failures ? 1 : 0);
