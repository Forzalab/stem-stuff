// One blink (STYLE.md §1.6, §2.8; design/shots/blink-fx-2026-10-12): after Check, a sugar right answer moves at most ONE group at a time
// (the answer, the FX layer, the HUD, the slots, the burst, the drop banner, the Cluck chip, Next), sampled every 20 ms at 393x852;
// nothing on the reward UI loops for ever; the Cluck chip wiggles at most twice; reduced motion = one fade, nothing else.
// Starts its own serve.py (throwaway banks/ + tries.json) and a stub OpenRouter for the chip:
//   node tests/blink-fx.pw.mjs [port] [--measure] [--log file] [--shots dir --tag before|after] [--serve-only]
// --measure logs the numbers without asserting (the "before" run); --serve-only keeps the servers up for the WebKitGTK shots;
// BF_W / BF_H (env) change the 393x852 viewport. "Moving" = a running animation in its active phase (a delay or a fill is still).
import { createRequire } from "node:module";
import { createServer } from "node:http";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { appendFileSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { try { pw = require("/opt/node22/lib/node_modules/playwright"); } catch { pw = require("/opt/node-tools/node_modules/playwright"); } }

const argv = process.argv.slice(2), flag = k => argv.includes(k), opt = k => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
const MEASURE = flag("--measure"), LOG = opt("--log"), SHOTS = opt("--shots"), TAG = opt("--tag") || "now", SERVE_ONLY = flag("--serve-only");
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = +(argv[0] && /^\d+$/.test(argv[0]) ? argv[0] : 8851), BASE = `http://localhost:${PORT}`;
const TMP = mkdtempSync(join(tmpdir(), "blink-")), BANKS = join(TMP, "banks");
const log = s => { console.log(s); if (LOG) appendFileSync(LOG, s + "\n"); };
const ch = (...m) => m.map((md, i) => ({ id: "abcde"[i], md }));
const real = (code, n) => ({ code, type: "mc", shuffle: false, body: [{ type: "text", md: `Real ${n}: pick a.` }], choices: ch("one", "two", "three", "four", "five"),
  correct: "a", wrong: [{ choice: "b", hint: "QUACK. Not b." }, { choice: "c", hint: "QUACK. Not c." }],
  saccharine: { title: `Practice Exam 2, Question ${n}`, key: "Use: a\nAnswer: a", slip: { b: "b slip" } } });
mkdirSync(BANKS);
writeFileSync(join(BANKS, "BANK_BF12.json"), JSON.stringify({ v: 1, problems: [1, 2, 3, 4, 5, 6].map(n => real(`CALC1_B0${n}`, n)) }));
/* a stub OpenRouter (tests/easy.pw.mjs): Cluck's text in 3 pieces, so the chip shows after a wrong try */
const parts = ["POOF! Pick a.\n", "Use: a\n", "Answer: a. Egg-cellent."];
const stub = createServer(async (req, res) => {
  let body = ""; for await (const c of req) body += c;
  if (!JSON.parse(body).stream) { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ choices: [{ message: { content: '{"verdict": "on"}' } }] })); return; }
  res.writeHead(200, { "Content-Type": "text/event-stream" });
  let i = 0;
  const t = setInterval(() => { if (i < parts.length) res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: parts[i++] } }] })}\n\n`); else { res.end("data: [DONE]\n\n"); clearInterval(t); } }, 150);
});
await new Promise(r => stub.listen(0, "127.0.0.1", r));
const srv = spawn("python3", [join(ROOT, "serve.py"), String(PORT)], { env: { ...process.env, STEM_BANKS: BANKS, STEM_TRIES: join(TMP, "tries.json"),
  OPENROUTER_BASE: `http://127.0.0.1:${stub.address().port}`, OPENROUTER_API_KEY: "sk-test" }, stdio: "ignore" });
for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + "/")).ok) break; } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 100)); }
if (SERVE_ONLY) {
  console.log(`SERVING ${BASE} pid ${srv.pid} (Ctrl-C or kill ${process.pid} to stop)`);
  const stop = () => { srv.kill(); stub.close(); process.exit(0); };
  process.on("SIGTERM", stop); process.on("SIGINT", stop);
  await new Promise(() => {});
}

/* the probe, in the page: groups = the top-level thing each running animation moves (plus canvas confetti, which is not a WAAPI animation) */
const PROBE = () => {
  const ids = new WeakMap(); let n = 0;
  const id = e => { if (!ids.has(e)) ids.set(e, ++n); return ids.get(e); };
  const TOP = [[".fx-layer", "fx-layer"], [".fx-toast-host", "banner"], ["#rwHud", "hud"], ["#wish", "chip"], ["#qnext", "next"], ["#q", "answer"], ["#fb", "answer"],
    ["#toast", "toast"], ["#cluck", "cluck"], ["#orig", "hint"]];
  const top = t => {
    if (!t || !t.closest) return "doc";
    const ov = t.closest(".fx-ov"); if (ov) return (ov.classList.contains("fx-slots-ov") ? "slots#" : "burst#") + id(ov);
    for (const [s, k] of TOP) if (t.closest(s)) return k;
    return t.id ? "#" + t.id : t.tagName.toLowerCase() + "." + [...t.classList].join(".");
  };
  const REWARD = /^(fx-layer|banner|hud|chip|next|answer|slots#|burst#)/;
  const live = [];
  const wrapConf = () => {
    const C = window.confetti; if (!C || C.__bf) return;
    const cr = C.create;
    C.create = (c, o) => { const f = cr(c, o); const g = (...a) => { const p = f(...a); if (p && p.then) { live.push(c); p.then(() => live.splice(live.indexOf(c), 1)); } return p; }; g.reset = f.reset; return g; };
    C.__bf = 1;
  };
  const what = a => a.animationName || (a.transitionProperty ? "transition:" + a.transitionProperty + "@" + (a.effect?.target?.className || "").toString().split(" ")[0] : "waapi:" + [...new Set((a.effect?.getKeyframes() || []).flatMap(k => Object.keys(k)).filter(k => !["offset", "easing", "composite", "computedOffset"].includes(k)))].join("+"));
  function sample(ms) {
    const t0 = performance.now(), out = [], seen = new Map(), loops = new Set(), num = () => document.querySelector("#rwHud .rw-num")?.textContent;
    let n0 = num(), nt = -1e9;
    return new Promise(r => {
      const iv = setInterval(() => {
        const t = performance.now() - t0, g = new Set(), n1 = num();
        if (n1 !== n0) {                                                        // engine.js countUp ticks the text (not WAAPI): a change within
          if (t - nt < 150) { g.add("hud"); if (!seen.has("count")) seen.set("count", { k: "hud", what: "count-up (text)", t: Math.round(t) }); }   // 150 ms of the last
          n0 = n1; nt = t;                                                      // one is a count-up; a lone change is an instant set
        }
        for (const a of document.getAnimations()) {
          if (a.playState !== "running" || a.effect?.getComputedTiming().currentIteration == null) continue;   // moving = in its active phase (not a delay)
          const k = top(a.effect && a.effect.target);
          g.add(k);
          if (!seen.has(a)) seen.set(a, { k, what: what(a), t: Math.round(t) });
          if (REWARD.test(k) && a.effect.getComputedTiming().iterations === Infinity) loops.add(k + " " + what(a));
        }
        for (const c of live) { const k = top(c); g.add(k); if (!seen.has(c)) seen.set(c, { k, what: "confetti", t: Math.round(t) }); }
        out.push([Math.round(t), [...g].sort()]);
        if (t >= ms) { clearInterval(iv); r({ timeline: out, anims: [...seen.values()], loops: [...loops] }); }
      }, 20);
    });
  }
  /* the chip's wiggle runs: every rw-wiggle animation that reached its active phase counts currentIteration + 1 */
  function chipRuns(ms) {
    const t0 = performance.now(), runs = new Map();
    return new Promise(r => {
      const iv = setInterval(() => {
        for (const a of document.getAnimations()) {
          if (a.animationName !== "rw-wiggle") continue;
          const c = a.effect.getComputedTiming();
          const prev = runs.get(a) || { n: 0, inf: c.iterations === Infinity };
          if (c.currentIteration != null && a.playState === "running") prev.n = Math.max(prev.n, c.currentIteration + 1);
          runs.set(a, prev);
        }
        if (performance.now() - t0 >= ms) {
          clearInterval(iv);
          const still = document.getAnimations().filter(a => a.animationName === "rw-wiggle" && a.playState === "running").length;
          r({ runs: [...runs.values()].reduce((s, x) => s + x.n, 0), elements: runs.size, infinite: [...runs.values()].some(x => x.inf), runningAtEnd: still });
        }
      }, 50);
    });
  }
  window.__bf = { wrapConf, sample, chipRuns };
};

const opened = (page, code) => page.waitForFunction(c => document.querySelector("#pcode")?.textContent === c && !document.querySelector("#freeze").hidden, code, { timeout: 8000 });
const go = async (page, code) => { await page.evaluate(c => { location.hash = c; }, code); await opened(page, code); };
const rig = (page, q) => page.evaluate(q => { const R = window.Rewards, A = R.answer; R.answer = o => { const r = Math.random; Math.random = () => q.length ? q.shift() : r();
  try { return A(o); } finally { Math.random = r; R.answer = A; } }; }, q);
const unCap = page => page.evaluate(() => { const k = Object.keys(localStorage).find(x => x.startsWith("stem-rw:")); if (!k) return; const s = JSON.parse(localStorage.getItem(k)); s.lastBurst = 0; s.dry = 0; localStorage.setItem(k, JSON.stringify(s)); });
async function pick(page, id, armed) {
  const n = await page.evaluate(() => window.__drill.state.tries.length);
  await page.click(`#q .opt[data-id="${id}"]`);
  if (armed) await armed();
  await page.click(`#q .ch[data-id="${id}"] .send`);
  await page.waitForFunction(k => window.__drill.state.tries.length > k, n, { timeout: 6000 });
}
const quiet = page => page.waitForFunction(() => !document.querySelector(".fx-ov, .fx-toast"), null, { timeout: 12000 }).catch(() => {});
/* a right answer, sampled from the Check tap: peak = the most groups moving in one 20 ms sample */
async function sampled(page, id, ms) {
  await page.evaluate(() => window.__bf.wrapConf());
  await pick(page, id, () => page.evaluate(ms => { window.__bfRun = window.__bf.sample(ms); }, ms));
  const r = await page.evaluate(() => window.__bfRun);
  const peakIn = lim => Math.max(0, ...r.timeline.filter(([t]) => t <= lim).map(([, g]) => g.length));
  const busy = r.timeline.filter(([, g]) => g.length), dur = busy.length ? busy.at(-1)[0] : 0;
  return { ...r, peak3: peakIn(3000), peak: peakIn(1e9), dur, over1: r.timeline.filter(([, g]) => g.length > 1).length * 20 };
}
function report(name, r) {
  log(`== ${name}: peak groups ${r.peak} (first 3 s: ${r.peak3}), last motion at ${r.dur} ms, ${r.over1} ms with >1 group moving`);
  let prev = "";
  for (const [t, g] of r.timeline) { const s = g.join(" + ") || "(still)"; if (s !== prev) log(`   ${String(t).padStart(5)} ms  ${g.length}  ${s}`); prev = s; }
  log("   animations: " + r.anims.map(a => `${a.t}:${a.k}:${a.what}`).join(", "));
  if (r.loops.length) log("   INFINITE on reward UI: " + r.loops.join(", "));
}

let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); }
  catch (e) { failures++; console.log("FAIL", name, "\n     ", e.message.slice(0, 900)); }
}
const check = (ok, msg) => { if (MEASURE) { if (!ok) log("   (would fail) " + msg); } else assert.ok(ok, msg); };

const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
const phone = async rm => {
  const ctx = await browser.newContext({ viewport: { width: +(process.env.BF_W || 393), height: +(process.env.BF_H || 852) }, reducedMotion: rm || "no-preference", serviceWorkers: "block" });
  await ctx.addInitScript(() => { try { localStorage.setItem("stem-ob", "done"); for (const b of ["right", "miss", "three"]) localStorage.setItem("stem-ob-rw-" + b, "9"); localStorage.setItem("stem-voice", "off"); } catch { /* */ } });
  await ctx.addInitScript(PROBE);
  const page = await ctx.newPage();
  await page.goto(BASE + "/#CALC1_B01"); await opened(page, "CALC1_B01");
  await page.waitForSelector("#rwHud:not([hidden])", { timeout: 6000 });
  return { ctx, page };
};
try {
  log(`# blink-fx ${TAG} ${new Date().toISOString()} · Chromium ${browser.version()} · 393x852 · 20 ms samples`);
  const { ctx, page } = await phone();

  await step("a wrong try, then a right one with a drop (slots + WIN burst) while the Cluck chip is up: one group at a time", async () => {
    await pick(page, "b");
    await page.waitForSelector("#wish:not([hidden]) .wchip, .cl-peek .cl-cta", { timeout: 6000 });
    await page.waitForTimeout(1500);                                            // re-picked while the chip may still shake: the tap settles it
    await unCap(page); await rig(page, [0, 0, 0, 0]);                          // 6 XP (try 2), a drop, common
    const r = await sampled(page, "a", 7000);
    report("wrong, then right + drop (chip up)", r);
    check(r.anims.some(a => a.k.startsWith("slots#")) && r.anims.some(a => a.k.startsWith("burst#")), "the slots and the burst played");
    check(r.peak <= 1, `peak ${r.peak} groups at once (one blink = 1)`);
    check(!r.loops.length, "no infinite animation on the reward UI: " + r.loops.join(", "));
    await quiet(page);
  });

  await step("the Cluck chip / CTA wiggles at most twice, then stops (15 s)", async () => {
    await go(page, "CALC1_B02");
    await page.evaluate(() => { window.__bfChip = window.__bf.chipRuns(15000); });
    await pick(page, "b");
    await page.waitForSelector("#wish:not([hidden]) .wchip, .cl-peek .cl-cta", { timeout: 6000 });
    const c = await page.evaluate(() => window.__bfChip);
    log(`== chip wiggle over 15 s: ${c.runs} runs on ${c.elements} chip element(s), infinite: ${c.infinite}, still running at 15 s: ${c.runningAtEnd}`);
    check(c.runs <= 2, `wiggle runs ${c.runs} (want 0-2: the E1 CTA has no wiggle, Lane 2)`);
    check(!c.infinite && !c.runningAtEnd, "the wiggle stops");
  });

  await step("a first-try right with a level up (the bells + LEVEL UP burst): one group at a time", async () => {
    await go(page, "CALC1_B03"); await page.waitForTimeout(800);               // the question has opened (the HUD's own catch-up has played)
    await rig(page, [0.5, 0.99]);                                               // 14 XP, no drop; crosses level 2
    const r = await sampled(page, "a", 6000);
    report("first-try right + level up", r);
    check(r.peak <= 1, `peak ${r.peak} groups at once (one blink = 1)`);
    check(r.anims.some(a => a.k === "fx-layer") && r.anims.some(a => a.k === "hud"), "the bells still play (FX layer, HUD)");
    check(!r.loops.length, "no infinite animation on the reward UI: " + r.loops.join(", "));
    await quiet(page);
  });

  await ctx.close();

  await step("a level up, then a right answer on the next question ~1 s later: the level-up burst still plays (the cap is spent), then the new FX", async () => {
    const { ctx: lc, page: lp } = await phone();
    await lp.evaluate(() => window.__bf.wrapConf());
    await lp.waitForTimeout(1100); await rig(lp, [0.99, 0.99]);                 // 16 XP, no drop
    await pick(lp, "a");
    await lp.waitForFunction(() => !document.documentElement.classList.contains("fx-busy"), null, { timeout: 10000 });
    await go(lp, "CALC1_B02"); await lp.waitForTimeout(1100); await rig(lp, [0.5, 0.99]);   // 14 XP: 30, level 2
    await lp.evaluate(() => { window.__lvl = false; new MutationObserver(() => { if (document.querySelector(".fx-ov.fx-levelup")) window.__lvl = true; }).observe(document.body, { childList: true, subtree: true }); });
    await pick(lp, "a");
    await lp.waitForTimeout(1000);
    await go(lp, "CALC1_B03"); await rig(lp, [0.5, 0.99]);
    const r = await sampled(lp, "a", 7000);
    report("level up, then the next question right ~1 s later", r);
    check(await lp.evaluate(() => window.__lvl), "the level-up burst played");
    check(r.peak <= 1, `peak ${r.peak} groups at once`);
    await lc.close();
  });

  /* exact frames: a fresh page per frame; at the mark (from Check, or from the overlay's first frame) every animation pauses and rAF and
     timers stop, then the shot (no capture skew). 393x852 and 1920x1080, colour + -grey twins (written by the README's PIL step) */
  if (SHOTS) await step(`shots (${TAG}): frozen frames at 0/200/400/600/1000 ms after Check and after the burst opens, + the slots at 600 ms`, async () => {
    mkdirSync(SHOTS, { recursive: true });
    const jobs = [];
    for (const [W, H] of [[393, 852], [1920, 1080]]) {
      for (const m of [0, 200, 400, 600, 1000]) jobs.push([W, H, "check", m], [W, H, "burst", m]);
      jobs.push([W, H, "slots", 600]);
    }
    const one = async ([W, H, mode, m]) => {
      const c = await browser.newContext({ viewport: { width: W, height: H }, serviceWorkers: "block" });
      await c.addInitScript(() => { try { localStorage.setItem("stem-ob", "done"); for (const b of ["right", "miss", "three"]) localStorage.setItem("stem-ob-rw-" + b, "9"); localStorage.setItem("stem-voice", "off"); } catch { /* */ } });
      const p = await c.newPage();
      await p.goto(BASE + "/#CALC1_B01"); await opened(p, "CALC1_B01");
      await p.waitForSelector("#rwHud:not([hidden])", { timeout: 6000 });
      await p.waitForTimeout(1100); await rig(p, [0, 0, 0, 0]);               // 12 XP, a drop, common: slots + WIN burst
      await p.click('#q .opt[data-id="a"]');
      await p.evaluate(([mode, m]) => {
        const T = window.setTimeout.bind(window), sel = { burst: ".fx-ov.fx-burst", slots: ".fx-ov.fx-slots-ov" }[mode];
        const freeze = () => { document.getAnimations().forEach(a => { try { a.pause(); } catch { /* */ } }); window.requestAnimationFrame = () => 0; window.setTimeout = () => 0; window.setInterval = () => 0; window.__frozen = true; };
        if (sel) { const mo = new MutationObserver(() => { if (document.querySelector(sel)) { mo.disconnect(); T(freeze, m); } }); mo.observe(document.body, { childList: true, subtree: true }); }
        document.querySelector('#q .ch[data-id="a"] .send').click();
        if (!sel) T(freeze, m);
      }, [mode, m]);
      await p.waitForFunction(() => window.__frozen, null, { timeout: 15000 });
      const f = `${TAG}-chromium-${W}-${mode}-${String(m).padStart(4, "0")}.png`;
      await p.screenshot({ path: join(SHOTS, f) });
      await c.close();
      return f;
    };
    for (let i = 0; i < jobs.length; i += 4) for (const f of await Promise.all(jobs.slice(i, i + 4).map(one))) log("   shot " + f);
  });

  await step("reduced motion: a drop + burst is one fade, nothing else moves", async () => {
    const { ctx: rc, page: rp } = await phone("reduce");
    await rp.evaluate(() => window.__bf.wrapConf());
    await rp.waitForTimeout(1100);
    await unCap(rp); await rig(rp, [0, 0, 0, 0]);                               // 12 XP, a drop, common
    const r = await sampled(rp, "a", 6000);
    report("reduced motion: right + drop", r);
    const moves = r.anims.filter(a => !/^waapi:opacity$|^transition:opacity$/.test(a.what));
    check(r.anims.length <= 1, `${r.anims.length} animations under reduced motion (want at most one fade): ` + r.anims.map(a => a.k + ":" + a.what).join(", "));
    check(!moves.length, "only opacity: " + moves.map(a => a.k + ":" + a.what).join(", "));
    await rc.close();
  });
} finally {
  await browser.close();
  srv.kill(); stub.close();
}
console.log(failures ? `\n${failures} FAIL` : "\nall ok");
process.exit(failures ? 1 : 0);
