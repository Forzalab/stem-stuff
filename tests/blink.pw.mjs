// One blink (20261010-B2, STYLE.md §1.6 / §2.8): a sugar right answer plays its reward FX ONE group at a time, the Cluck chip's wiggle
// stops after 2 runs, and reduced motion is one fade. An in-page sampler reads every running animation every 20 ms (WAAPI + CSS
// animations + transitions, active phase only, plus a painted confetti canvas) and sorts it into a group by where it sits.
// Starts its own serve.py on a free port with a throwaway bank (the base URL run-all.sh passes is not used):
//   node tests/blink.pw.mjs [ignored-base-url] [log-dir]     → prints the peak + duration per case, writes blink-<case>.json to log-dir
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { try { pw = require("/opt/node22/lib/node_modules/playwright"); } catch { pw = require("/opt/node-tools/node_modules/playwright"); } }

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LOGS = process.argv[3] || null;
const PORT = await new Promise(r => { const s = createServer().listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => r(p)); }); });
const BASE = `http://127.0.0.1:${PORT}`;
const TMP = mkdtempSync(join(tmpdir(), "blink-")), BANKS = join(TMP, "banks");
const ch = (...m) => m.map((md, i) => ({ id: "abcde"[i], md }));
const real = (code, n) => ({ code, type: "mc", shuffle: false, body: [{ type: "text", md: `Real ${n}: pick a.` }], choices: ch("one", "two", "three", "four", "five"),
  correct: "a", wrong: [{ choice: "b", hint: "QUACK. Not b." }, { choice: "c", hint: "QUACK. Not c." }],
  saccharine: { title: `Practice Exam 2, Question ${n}`, key: "Use: a\nAnswer: a", slip: { b: "b slip" } } });
mkdirSync(BANKS);
writeFileSync(join(BANKS, "BANK_BL12.json"), JSON.stringify({ v: 1, problems: [1, 2, 3, 4, 5, 6].map(n => real(`CALC1_B0${n}`, n)) }));
const srv = spawn("python3", [join(ROOT, "serve.py"), String(PORT)], { env: { ...process.env, STEM_BANKS: BANKS, STEM_TRIES: join(TMP, "tries.json"), OPENROUTER_API_KEY: "" }, stdio: "ignore" });
for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + "/")).ok) break; } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 100)); }

let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); }
  catch (e) { failures++; console.log("FAIL", name, "\n     ", e.message.slice(0, 900)); }
}

/* the sampler, in the page: every 20 ms, the set of groups that move. A group = one place on screen that the eye follows */
const SAMPLER = () => {
  const painted = c => performance.now() - (c.__drawn || -1e9) < 60;          // canvas-confetti drew a frame just now (DRAWN below)
  const groupOf = t => {
    if (!t || !t.closest) return ["?", "?"];
    const cls = (t.className && t.className.baseVal == null ? String(t.className) : "").split(" ")[0] || t.tagName.toLowerCase();
    if (t.closest(".fx-ov")) return ["overlay", "ov:" + cls];
    if (t.closest(".fx-toast")) return ["banner", "toast"];
    if (/\bfx-(sp|flash)/.test(t.className)) return ["stars", "sparks"];
    if (t.closest(".fx-ring")) return ["ring", "ring"];
    if (t.closest(".fx-float")) return ["ribbon", "float"];
    if (t.closest(".fx-fly")) return ["coins", "coins"];
    if (t.closest(".rw-chip")) return ["chip", "chip"];
    if (t.closest(".rw-hud")) return ["hud", "hud:" + cls];
    if (t.closest("#q .ch, #q .opt, #ff, .ff, #fb")) return ["answer", "answer"];        // the picked row, the rest of the list and the verdict line settling = the answer
    return ["page", "page:" + (t.id ? "#" + t.id : cls)];
  };
  const S = window.__blink = { t0: performance.now(), rows: [], anims: new Set(), transformed: new Set(), starts: {} };
  const tick = () => {
    const g = new Set(), f = new Set();
    for (const a of document.getAnimations()) {
      if (a.playState !== "running" || !a.effect) continue;
      const ct = a.effect.getComputedTiming(), lt = ct.localTime;
      if (lt == null || lt < ct.delay || lt >= ct.delay + ct.activeDuration) continue;    // waiting (delay) or done: not moving
      const [k, fine] = groupOf(a.effect.target);
      g.add(k); f.add(fine);
      if (a.startTime != null) { const st = Math.round(a.startTime + ct.delay - S.t0); if (!(st >= S.starts[k])) S.starts[k] = st; }   // exact, from the animation clock
      S.anims.add(fine + (a.animationName ? "@" + a.animationName : a.transitionProperty ? "~" + a.transitionProperty : ""));
      try { if (a.effect.getKeyframes().some(x => x.transform && x.transform !== "none") || a.transitionProperty === "transform") S.transformed.add(fine); } catch { /* */ }
    }
    for (const c of document.querySelectorAll("canvas.fx-canvas")) if (painted(c)) { g.add(c.closest(".fx-ov") ? "overlay" : "stars"); f.add("confetti"); S.anims.add("confetti"); }
    S.rows.push([Math.round(performance.now() - S.t0), [...g].sort(), [...f].sort()]);
  };
  S.timer = setInterval(tick, 20);
};
const STOP = () => { const S = window.__blink; clearInterval(S.timer); return { rows: S.rows, anims: [...S.anims], transformed: [...S.transformed], starts: S.starts }; };
function summary(log, skip = []) {
  const rows = log.rows.map(([t, g, f]) => [t, g.filter(x => !skip.includes(x)), f]);
  const on = rows.filter(r => r[1].length);
  const peak = Math.max(0, ...rows.map(r => r[1].length)), finePeak = Math.max(0, ...rows.map(r => r[2].length));
  const over = rows.filter(r => r[1].length > 1);
  const order = []; for (const r of on) { const k = r[1].join("+"); if (order.at(-1) !== k) order.push(k); }
  return { peak, finePeak, start: on[0]?.[0] ?? null, end: on.at(-1)?.[0] ?? null, duration: on.length ? on.at(-1)[0] - on[0][0] : 0,
    overlapMs: over.length * 20, starts: log.starts, firstOverlap: over[0] ? over[0][0] : null, worst: (rows.find(r => r[1].length === peak) || [])[2], order, anims: log.anims, transformed: log.transformed };
}
const save = (name, s, log) => { if (!LOGS) return; mkdirSync(LOGS, { recursive: true }); writeFileSync(join(LOGS, `blink-${name}.json`), JSON.stringify({ ...s, rows: log.rows }, null, 1)); };
const say = (name, s) => console.log(`     ${name}: peak ${s.peak} group(s) (fine ${s.finePeak}: ${(s.worst || []).join(",")}), moving ${s.start}..${s.end} ms = ${s.duration} ms, >1 group for ${s.overlapMs} ms; order ${s.order.join(" > ")}; starts ${JSON.stringify(s.starts)}`);

const opened = (page, code) => page.waitForFunction(c => document.querySelector("#pcode")?.textContent === c && !document.querySelector("#freeze").hidden, code, { timeout: 8000 });
const go = async (page, code) => { await page.evaluate(c => { location.hash = c; }, code); await opened(page, code); };
async function pickNoWait(page, id) { await page.click(`#q .opt[data-id="${id}"]`); await page.click(`#q .ch[data-id="${id}"] .send`); }
async function pick(page, id) {
  const n = await page.evaluate(() => window.__drill.state.tries.length);
  await pickNoWait(page, id);
  await page.waitForFunction(k => window.__drill.state.tries.length > k, n, { timeout: 6000 });
}
const rig = (page, q) => page.evaluate(q => { const R = window.Rewards, A = R.answer; R.answer = o => { const r = Math.random; Math.random = () => q.length ? q.shift() : r();
  try { return A(o); } finally { Math.random = r; R.answer = A; } }; }, q);
const calm = page => page.waitForFunction(() => !document.querySelector(".fx-ov") && !document.getAnimations().some(a => a.playState === "running" && !a.effect?.target?.closest?.(".rw-chip")), null, { timeout: 12000 });
/* answer right and sample for ms; the clock starts at the Check tap */
async function sampleRight(page, ms) {
  await calm(page);
  await page.click(`#q .opt[data-id="a"]`);
  await page.evaluate(SAMPLER);
  await page.click(`#q .ch[data-id="a"] .send`);
  await page.waitForTimeout(ms);
  return page.evaluate(STOP);
}
/* stamp every confetti frame on its canvas (cheap: no pixel read-back that would slow the page it measures) */
const DRAWN = () => { const P = CanvasRenderingContext2D.prototype, f = P.fill; P.fill = function (...a) { this.canvas.__drawn = performance.now(); return f.apply(this, a); }; };
const fresh = async (browser, rm) => {
  const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, hasTouch: true, isMobile: true, serviceWorkers: "block", reducedMotion: rm ? "reduce" : "no-preference" });
  await ctx.addInitScript(DRAWN);
  await ctx.addInitScript(() => { try { localStorage.setItem("stem-ob", "done"); localStorage.setItem("stem-voice", "off"); } catch { /* */ } });
  const page = await ctx.newPage();
  await page.route("**/explain", r => r.fulfill({ status: 200, contentType: "text/plain", body: "QUACK. Pick a." }));   // Cluck answers at once (no key here)
  await page.goto(BASE + "/#CALC1_B01"); await opened(page, "CALC1_B01");
  await page.waitForFunction(() => window.Rewards && window.FX, null, { timeout: 8000 });
  return { ctx, page };
};
const resetCap = page => page.evaluate(() => { const k = Object.keys(localStorage).find(x => x.startsWith("stem-rw:")); if (!k) return; const s = JSON.parse(localStorage.getItem(k)); s.lastBurst = 0; s.dry = 0; localStorage.setItem(k, JSON.stringify(s)); });

const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
try {
  const { ctx, page } = await fresh(browser, false);

  await step("sugar right answer, 393x852: the reward FX move one group at a time (peak 1), stars → ribbon → coins 200 ms apart, all still by 2 s", async () => {
    await rig(page, [0.5, 0.99]);                                               // 14 XP, no drop, no level up
    const log = await sampleRight(page, 2400);
    const s = summary(log); save("right", s, log); say("right", s);
    assert.ok(s.start != null, "something moved: " + JSON.stringify(log.anims));
    assert.equal(s.peak, 1, `peak ${s.peak} at ${s.firstOverlap} ms: ${JSON.stringify(s.worst)}`);
    const want = ["answer", "stars", "ribbon", "coins", "hud", "ribbon"];      // palette order: stars → ribbon → button (coins → HUD), the ribbon leaves last
    assert.deepEqual(s.order, want, "order " + s.order.join(" > "));
    const st = log.starts, gap = (a, b) => st[b] - st[a];
    for (const [a, b] of [["stars", "ribbon"], ["ribbon", "coins"]]) assert.ok(Math.abs(gap(a, b) - 200) <= 20, `${a} → ${b} ${gap(a, b)} ms apart, want 200: ${JSON.stringify(st)}`);
    assert.ok(gap("answer", "stars") >= 180 && gap("answer", "stars") <= 520, "the stars wait for the answer to settle: " + JSON.stringify(st));
    assert.ok(s.end < 2000, "still by 2 s after the tap (main: ~2.4 s), was " + s.end);
  });

  await step("a right answer with a drop: the slot reels, then the WIN burst, one group at a time", async () => {
    await go(page, "CALC1_B02");
    await resetCap(page);
    await rig(page, [0, 0, 0, 0]);                                              // a drop, common
    await page.waitForTimeout(1100);                                            // past the 1 s dwell
    const log = await sampleRight(page, 7000);
    const s = summary(log); save("drop", s, log); say("drop", s);
    assert.ok(log.anims.some(a => a.startsWith("ov:")), "the drop played: " + log.anims.join(","));
    assert.equal(s.peak, 1, `peak ${s.peak} at ${s.firstOverlap} ms: ${JSON.stringify(s.worst)}`);
    const inside = log.rows.find(r => r[2].filter(x => x.startsWith("ov:")).length > 1);
    assert.ok(!inside, "inside the reels / burst, one part at a time: " + JSON.stringify(inside));
    await calm(page);
  });

  await step("the Cluck chip wiggles at most 2 times, then stays still", async () => {
    await go(page, "CALC1_B03");
    await pick(page, "b");                                                      // a wrong try: "Explain my mistake"
    await page.waitForSelector(".wchip.rw-wiggle", { timeout: 5000 });              // app.js repaints #wish: always query it fresh
    const css = await page.$eval(".wchip", e => { const c = getComputedStyle(e); return { n: c.animationIterationCount, d: c.animationDuration, delay: c.animationDelay }; });
    assert.ok(css.n !== "infinite" && +css.n <= 2, "iterations " + JSON.stringify(css));
    const end = (parseFloat(css.delay) + parseFloat(css.d) * +css.n) * 1000;
    await page.waitForTimeout(end + 400);
    const now = await page.$eval(".wchip", e => ({ running: e.getAnimations().filter(a => a.playState === "running").length, left: e.getAnimations().length, tf: getComputedStyle(e).transform }));
    assert.deepEqual(now, { running: 0, left: 0, tf: "none" }, "still and upright after " + end + " ms");
  });

  await step("while a reward plays, a wiggling chip pauses (html.fx-busy), so it is never a second group", async () => {
    await go(page, "CALC1_B04");
    await pick(page, "b");
    await page.waitForSelector(".wchip.rw-wiggle", { timeout: 5000 });
    await page.waitForTimeout(1300);                                            // the wiggle is under way
    await rig(page, [0.99]);
    await page.click(`#q .opt[data-id="a"]`);
    await page.evaluate(SAMPLER);
    await page.click(`#q .ch[data-id="a"] .send`);
    await page.waitForTimeout(2000);
    const log = await page.evaluate(STOP), s = summary(log); save("right-with-chip", s, log); say("right-with-chip", s);
    assert.equal(s.peak, 1, `peak ${s.peak} at ${s.firstOverlap} ms: ${JSON.stringify(s.worst)}`);
  });
  await ctx.close();

  const rm = await fresh(browser, true);
  await step("reduced motion: a right answer is one fade (one group, opacity only, no transform)", async () => {
    await rig(rm.page, [0.5, 0.99]);
    const log = await sampleRight(rm.page, 2000);
    const s = summary(log); save("right-rm", s, log); say("right-rm", s);
    assert.ok(s.peak <= 1, `peak ${s.peak}: ${JSON.stringify(s.worst)}`);
    assert.deepEqual(s.transformed, [], "transform in reduced motion: " + s.transformed.join(","));
    assert.ok(s.order.length <= 1, "one fade, was " + s.order.join(" > "));
    assert.ok(log.anims.every(a => /float/.test(a)), "only the +N XP fades: " + log.anims.join(","));
    assert.match(await rm.page.textContent("#rwHud .rw-num"), /^14$/, "the HUD number changes at once");
  });
  await rm.ctx.close();
} finally {
  await browser.close();
  srv.kill();
}
console.log(failures ? `${failures} FAIL` : "all ok");
process.exit(failures ? 1 : 0);
