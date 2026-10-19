// Cluck's scroll-down hint (Tony, Oct 19, variant A; app.js clMore, app.css .cl-more): a long reply = .cl-bd.below, a fade over the ask
// field's top edge and a chevron disc in it. The disc never covers a line you can read (the mock's sat on "r = 249 m"): every text line's
// visible part (above the fade's solid part) misses the disc. A tap scrolls ~80% down; at the bottom it goes; a short reply never shows it.
// Jev hears cluck_more shown (once) / tap / bottom, and telemetry.js never sends it. 390x844 + 1280x800; own serve.py + a stub OpenRouter.
//   node tests/cluck-more.pw.mjs <port> [shots dir]
import { createRequire } from "node:module";
import { createServer } from "node:http";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { writeFileSync, mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { try { pw = require("/opt/node22/lib/node_modules/playwright"); } catch { pw = require("/opt/node-tools/node_modules/playwright"); } }

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = /^\d+$/.test(process.argv[2] || "") ? process.argv[2] : "8877", BASE = `http://127.0.0.1:${PORT}`;
const tmp = mkdtempSync(join(tmpdir(), "cmore-")), banks = join(tmp, "banks"), SHOTS = process.argv[3] || tmp;
mkdirSync(banks); mkdirSync(SHOTS, { recursive: true });
const txt = md => [{ type: "text", md }];
const PROBS = [1, 2].map(n => ({ code: `CALC1_CMR${n}`, title: `More ${n}`, type: "mc", shuffle: false, body: txt(`A car rounds a flat curve at 45 m/s (${n}). Pick one.`), correct: "a",
  choices: ["one", "two", "three", "four"].map((md, i) => ({ id: "abcd"[i], md })), saccharine: { title: `More ${n}`, key: "Tick: a", slip: { b: "Two is not one." } } }));
writeFileSync(join(banks, "BANK_CMORE.json"), JSON.stringify({ v: 1, problems: PROBS }));
/* a stub OpenRouter: a LONG reply (prose + display math, the mock's) or a short one, in pieces 60 ms apart */
const LONG = ["Friction is the only thing turning the car, so it has to supply the whole centripetal force:\n\n$$\\mu_s m g = \\frac{m v^2}{r}$$\n\n",
  "The mass cancels on both sides, so you never needed it. Solve for $r$, the smallest radius that still holds the car:\n\n$$r = \\frac{v^2}{\\mu_s g}$$\n\n",
  "Then:\n\n$$r = \\frac{45^2}{9.80 \\cdot 0.830}$$\n\n$$r = 249\\ \\text{m}$$\n\n",
  "Any tighter than 249 m and the tyres slide out. A wetter road (smaller $\\mu_s$) needs an even bigger curve.\n\n",
  "Check the units: $\\frac{(\\text{m/s})^2}{\\text{m/s}^2} = \\text{m}$, a length, as a radius should be.\n\n$$\\frac{\\text{m}^2/\\text{s}^2}{\\text{m}/\\text{s}^2} = \\text{m}$$\n\n",
  "Now picture the same car at half the speed. The radius goes with $v^2$, so it shrinks by four:\n\n$$r' = \\frac{(22.5)^2}{9.80 \\cdot 0.830} \\approx 62\\ \\text{m}$$\n\n",
  "That is why slow corners can be tight and fast ones have to be wide. Picking two? That one forgot the square on $v$.\n\n",
  "Tick: a. Egg-cellent."];
const SHORT = ["POOF! A wish is a wish.\n", "Tick: a. Egg-cellent."];
let parts = LONG;
const stub = createServer(async (req, res) => {
  let body = ""; for await (const c of req) body += c;
  if (!JSON.parse(body).stream) { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ choices: [{ message: { content: '{"verdict": "on"}' } }] })); return; }
  res.writeHead(200, { "Content-Type": "text/event-stream" });
  const mine = parts; let i = 0;
  const t = setInterval(() => {
    if (i < mine.length) res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: mine[i++] } }] })}\n\n`);
    else { res.end("data: [DONE]\n\n"); clearInterval(t); }
  }, 60);
});
await new Promise(r => stub.listen(0, "127.0.0.1", r));
const srv = spawn("python3", [join(ROOT, "serve.py"), PORT], { env: { ...process.env, STEM_BANKS: banks, STEM_TRIES: join(tmp, "tries.json"),
  OPENROUTER_BASE: `http://127.0.0.1:${stub.address().port}`, OPENROUTER_API_KEY: "sk-test", CLAUDE_API: "" }, stdio: "ignore" });
for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + "/")).ok) break; } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 100)); }

let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); }
  catch (e) { failures++; console.log("FAIL", name, "\n     ", String(e.message).slice(0, 900)); }
}
const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
const VPS = [["390", { width: 390, height: 844 }], ["1280", { width: 1280, height: 800 }]];

/* a wrong pick streams Cluck's reply (prefetch); the idle duck's tap opens the sheet on it; the typing is skipped */
async function cluck(vp) {
  const phone = vp.width < 500;
  const ctx = await browser.newContext({ viewport: vp, hasTouch: phone, isMobile: phone, serviceWorkers: "block" });
  await ctx.addInitScript(() => { try { localStorage.setItem("stem-ob", "done"); for (const b of ["right", "miss", "three"]) localStorage.setItem("stem-ob-rw-" + b, "9"); } catch { /* */ } });
  await ctx.route(/youtube|ytimg|googlevideo/, r => r.abort());
  const page = await ctx.newPage();
  page.errs = []; page.net = [];
  page.on("pageerror", e => page.errs.push(String(e)));
  page.on("request", r => { if (/cluck_more/.test(r.postData() || "")) page.net.push(r.url()); });
  await page.goto(BASE + "/#BANK_CMORE");
  await page.waitForFunction(() => !document.getElementById("splash") && !!(window.stemBank && window.stemBank.code) && /^#CALC1_/.test(location.hash) && !document.getElementById("freeze").hidden, null, { timeout: 10000 });
  await page.evaluate(() => {                                           // Jev's ear: every cluck_more act, and whether .below ever showed
    window.__more = []; const o = window.stemT; window.stemT = (n, p) => { if (n === "cluck_more") window.__more.push(p.act); return o && o(n, p); };
  });
  const n = await page.evaluate(() => window.__drill.state.tries.length);
  await page.click('.opt[data-id="b"]'); await page.click('.ch[data-id="b"] .send');
  await page.waitForFunction(n => window.__drill.state.tries.length > n, n, { timeout: 5000 });
  await page.waitForFunction(() => /Egg-cellent/.test(localStorage.getItem("stem-cluck") || ""), null, { timeout: 10000, polling: 100 });
  await page.evaluate(() => window.stemIdleTap());
  await page.waitForFunction(() => window.stemCluckOpen(), null, { timeout: 4000 });
  await page.evaluate(() => {
    window.__below = false; const bd = document.querySelector("#cluck .cl-bd");
    new MutationObserver(() => { if (bd.classList.contains("below")) window.__below = true; }).observe(bd, { attributes: true, attributeFilter: ["class"] });
    if (bd.classList.contains("below")) window.__below = true;
  });
  await page.click("#cluck .wtext").catch(() => {});                    // a tap skips the typing
  await page.waitForFunction(() => /Egg-cellent/.test(document.querySelector("#cluck .wtext")?.textContent || "") && !document.querySelector("#cluck .wcaret"), null, { timeout: 6000 });
  await page.waitForTimeout(400);                                       // KaTeX + the 180 ms fade
  return page;
}
/* the hint's geometry: the disc (.cl-more's 28px ::before), the fade's solid top (its 12px ramp ends there), and every text line's
   visible part: inside the body's box and above that solid top (below it the fade hides the text). Lines = text-node line boxes + KaTeX */
const geo = page => page.evaluate(() => {
  const bd = document.querySelector("#cluck .cl-bd"), ft = document.querySelector("#cluck .cl-ft"), b = document.querySelector("#cluck .cl-more");
  const br = b.getBoundingClientRect(), disc = { left: br.left + 8, right: br.right - 8, top: br.top + 8, bottom: br.bottom - 8 };
  const fb = getComputedStyle(ft, "::before"), band = parseFloat(fb.height), solid = ft.getBoundingClientRect().top - band + 12, box = bd.getBoundingClientRect();
  const lines = [], walk = document.createTreeWalker(bd, NodeFilter.SHOW_TEXT);
  for (let t; (t = walk.nextNode());) {
    if (!t.textContent.trim() || !t.parentElement.checkVisibility()) continue;
    const r = document.createRange(); r.selectNodeContents(t);
    for (const q of r.getClientRects()) if (q.width > 1 && q.height > 1) lines.push({ left: q.left, right: q.right, top: q.top, bottom: q.bottom, t: t.textContent.slice(0, 24) });
  }
  const seen = lines.map(l => ({ ...l, top: Math.max(l.top, box.top), bottom: Math.min(l.bottom, box.bottom, solid) })).filter(l => l.bottom - l.top > 0.5);
  const hits = seen.filter(l => Math.min(l.right, disc.right) - Math.max(l.left, disc.left) > 0.5 && Math.min(l.bottom, disc.bottom) - Math.max(l.top, disc.top) > 0.5);
  const ask = document.querySelector("#cluck .ask").getBoundingClientRect();
  return { below: bd.classList.contains("below"), op: +getComputedStyle(b).opacity, fade: +fb.opacity, vis: b.checkVisibility({ visibilityProperty: true }),
    disc, solid, ask: ask.top, n: seen.length, hits: hits.map(h => h.t), top: bd.scrollTop, h: bd.clientHeight, max: bd.scrollHeight - bd.clientHeight };
});

for (const [tag, vp] of VPS) {
  await step(`${tag}: a long reply shows the hint; the disc covers no readable line; a tap scrolls ~80% down; at the bottom it goes; Jev hears it, the network does not`, async () => {
    parts = LONG;
    const page = await cluck(vp);
    let g = await geo(page);
    assert.ok(g.max > g.h * 0.5, "the reply is long: " + JSON.stringify(g));
    assert.ok(g.below && g.op === 1 && g.fade === 1 && g.vis, "the hint shows: " + JSON.stringify(g));
    assert.ok(g.n > 5, "text lines are on screen: " + g.n);
    assert.ok(g.disc.top >= g.solid - 0.5, `the disc sits in the fade's solid part (disc top ${g.disc.top}, solid from ${g.solid})`);
    assert.ok(g.disc.bottom <= g.ask, "the disc sits above the ask field");
    assert.deepEqual(g.hits, [], "no readable text line under the disc");
    await page.screenshot({ path: join(SHOTS, `built-more-${tag}.png`) });
    const t0 = g.top;
    await page.click("#cluck .cl-more");
    await page.waitForTimeout(900);                                     // the smooth scroll
    g = await geo(page);
    assert.ok(g.top - t0 >= Math.min(g.max - t0, g.h * 0.8) - 4, `a tap scrolls ~80% of the body (${t0} -> ${g.top}, height ${g.h}, max ${g.max})`);
    if (g.below) assert.deepEqual(g.hits, [], "after the tap: still no readable line under the disc");
    await page.evaluate(() => { const bd = document.querySelector("#cluck .cl-bd"); bd.scrollTop = bd.scrollHeight; });
    await page.waitForTimeout(400);
    g = await geo(page);
    assert.ok(!g.below && g.op === 0 && g.fade === 0 && !g.vis, "at the bottom the hint is gone: " + JSON.stringify(g));
    await page.screenshot({ path: join(SHOTS, `built-bottom-${tag}.png`) });
    await page.evaluate(() => { const bd = document.querySelector("#cluck .cl-bd"); bd.scrollTop = 0; });   // back up, down again: shown/bottom once per reply
    await page.waitForTimeout(300);
    assert.equal((await geo(page)).below, true, "scrolled back up: it shows again");
    await page.evaluate(() => { const bd = document.querySelector("#cluck .cl-bd"); bd.scrollTop = bd.scrollHeight; });
    await page.waitForTimeout(300);
    assert.deepEqual(await page.evaluate(() => window.__more), ["shown", "tap", "bottom"], "Jev: shown once, the tap, the bottom once");
    assert.deepEqual(page.net, [], "cluck_more never leaves the device");
    assert.deepEqual(page.errs, [], "no page errors");
    await page.context().close();
  });
  await step(`${tag}: a short reply never shows the hint`, async () => {
    parts = SHORT;
    const page = await cluck(vp);
    await page.waitForTimeout(400);
    const g = await geo(page);
    assert.ok(g.max <= 8, "the reply fits: " + JSON.stringify(g));
    assert.equal(await page.evaluate(() => window.__below), false, ".below never set (not even for a frame)");
    assert.ok(!g.below && g.op === 0 && !g.vis, "no hint");
    assert.deepEqual(await page.evaluate(() => window.__more), [], "Jev hears nothing");
    assert.deepEqual(page.errs, [], "no page errors");
    await page.context().close();
  });
}

await browser.close(); srv.kill(); stub.close();
console.log(failures ? `${failures} FAIL` : "all ok", "· shots:", SHOTS);
process.exit(failures ? 1 : 0);
