// 20261015-T45 idle peek (design/IDLE-PEEK.md, peek.js): in a sugar bank, after 3 min with no input Cluck peeks up at a sunrise; any
// input puts him away; one more after 10 more idle min, max 2 per bank. Diet, the start page and a lone question get none.
// A fake clock (Playwright clock) runs the minutes; the CSS run is jumped to its end (getAnimations().finish()). Phone + desktop,
// motion + reduce. Own serve.py + banks folder, never the student's real tries.json.
//   node tests/idle-peek.pw.mjs <port>      (starts its own serve.py on that port)
import { createRequire } from "node:module";
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
const PORT = /^\d+$/.test(process.argv[2] || "") ? process.argv[2] : "8874", BASE = `http://127.0.0.1:${PORT}`;
const tmp = mkdtempSync(join(tmpdir(), "t45-")), banks = join(tmp, "banks");
mkdirSync(banks);
const txt = md => [{ type: "text", md }];
const PROBS = [1, 2, 3].map(n => ({ code: `CALC1_T45M${n}`, title: `T45 ${n}`, type: "mc", shuffle: false, body: txt(`Question ${n}: pick one.`), correct: "a",
  choices: ["one", "two", "three", "four"].map((md, i) => ({ id: "abcd"[i], md })) }));
writeFileSync(join(banks, "BANK_T45.json"), JSON.stringify({ v: 1, problems: PROBS }));
const srv = spawn("python3", [join(ROOT, "serve.py"), PORT], { env: { ...process.env, STEM_BANKS: banks, STEM_TRIES: join(tmp, "tries.json"), OPENROUTER_API_KEY: "" }, stdio: "ignore" });
for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + "/")).ok) break; } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 100)); }

let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); }
  catch (e) { failures++; console.log("FAIL", name, "\n     ", String(e.message).slice(0, 900)); }
}
const MIN = 60000;
const DIET = [{ name: "stem-mode", value: "diet", url: BASE }, { name: "stem-mode-v", value: "2", url: BASE }];
const browser = await pw.chromium.launch();

/* a page on a fake clock; errors collected; /explain and /chat counted (a tap must never call the AI) */
async function open(o = {}) {
  const ctx = await browser.newContext({ viewport: o.vp || { width: 390, height: 844 }, reducedMotion: o.rm ? "reduce" : "no-preference", hasTouch: !!o.touch });
  if (o.diet) await ctx.addCookies(DIET);
  const page = await ctx.newPage();
  page.errs = []; page.ai = 0;
  page.on("pageerror", e => page.errs.push(String(e)));
  page.on("console", m => { if (m.type() === "error" && !/favicon|Failed to load resource/.test(m.text())) page.errs.push(m.text()); });
  page.on("request", r => { if (/\/(explain|chat)$/.test(new URL(r.url()).pathname)) page.ai++; });
  /* the page's clock is PAUSED from its first script on: only runFor moves it, never real time. A ticking (installed, not paused)
     Playwright clock has a second runner, the real-time sync: it fires the due timers and waits a real task after each one; a runFor
     that lands in that gap runs ahead, then the sync's run ends and sets the clock BACK to where it began (clockSource _runTo ->
     _advanceNow, Playwright 1.56). Under load that undid whole runFor calls after the page had seen them (the "after the calm" flake:
     a 1.6 s + 2 s wait came out as 1.6 s, so the move landed inside the 2.5 s calm). Paused, there is no second runner. */
  const t0 = Date.now();
  await page.clock.install({ time: t0 });
  await page.clock.pauseAt(t0 + 1000);
  await page.goto(BASE + "/" + (o.hash ?? "#BANK_T45"));
  await page.clock.runFor(3000);
  await until(page, () => !!window.stemDuck && !document.getElementById("splash"));
  /* the idle clock starts when the bank opens (peek.js drill:bank): wait for the bank (and the question in it) so every runFor below
     counts from a fixed start, not from a network-timed one (the 2:59 / 3:00 flake) */
  if (o.hash === undefined) await until(page, () => !!(window.stemBank && window.stemBank.code) && /^#CALC1_/.test(location.hash) && !document.getElementById("freeze").hidden);
  return page;
}
/* wait for fn in the page while the paused clock steps 50 ms at a time (the page's own timers still run, in order); 10 s real time max */
async function until(page, fn, arg) {
  const end = Date.now() + 10000;
  while (!(await page.evaluate(fn, arg))) {
    if (Date.now() > end) throw new Error("timed out waiting for " + String(fn));
    await page.clock.runFor(50);
  }
}
const up = page => page.evaluate(() => window.stemDuck.up);
/* the clock is paused (open), so runFor is the only thing that moves it: every wait below is exactly the time it says (checked) */
async function idle(page, ms) {
  const t0 = await page.evaluate(() => performance.now());
  await page.clock.runFor(ms);
  const moved = (await page.evaluate(() => performance.now())) - t0;
  assert.ok(Math.abs(moved - ms) < 1, `the page clock moved ${moved} ms, not ${ms}`);
}
const settle = page => page.evaluate(() => document.getAnimations().forEach(a => { if (a.effect?.target?.closest?.(".ck-rise")) a.finish(); }));
const nudge = page => page.mouse.click(5, 300);                      // a tap on empty page: input, no control
/* the end state of a rise: geometry + styles */
const look = page => page.evaluate(() => {
  const r = s => { const b = document.querySelector(s).getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom, w: b.width, h: b.height }; };
  const st = s => getComputedStyle(document.querySelector(s));
  const duck = r(".ck-peek"), sky = r(".ck-sky"), box = document.querySelector(".ck-rise");
  const sunX = sky.l + parseFloat(box.style.getPropertyValue("--sun-x"));
  const ctl = [...document.querySelectorAll("button, a, input, textarea, [role=button], .opt")].filter(e => !e.closest(".ck-rise") && e.getClientRects().length && getComputedStyle(e).visibility !== "hidden")
    .map(e => [e.id || e.className, e.getBoundingClientRect()]);
  const hit = (a, b) => a.l < b.right && a.r > b.left && a.t < b.bottom && a.b > b.top;
  const fr = document.getElementById("freeze").getBoundingClientRect();
  return { duck, sky, sunX, cx: duck.l + duck.w / 2, say: document.querySelector(".ck-say").textContent, sayOp: +st(".ck-say").opacity,
    label: document.querySelector(".ck-peek").getAttribute("aria-label"), duckOp: +st(".ck-duck").opacity, duckTf: st(".ck-duck").transform,
    skyTf: [...document.querySelectorAll(".ck-sky i")].map(i => getComputedStyle(i).transform), skyOp: [...document.querySelectorAll(".ck-sky i")].map(i => +getComputedStyle(i).opacity),
    over: ctl.filter(([, b]) => hit(duck, b) || hit(r(".ck-say"), b)).map(([n]) => n), W: document.documentElement.clientWidth,
    scrollW: document.documentElement.scrollWidth, col: { l: fr.left, r: fr.right, cx: fr.left + fr.width / 2 } };
});

for (const [name, vp] of [["phone", { width: 390, height: 844 }], ["desktop", { width: 1440, height: 900 }]]) for (const rm of [false, true]) {
  const tag = `${name}${rm ? " reduce" : ""}`;
  await step(`${tag}: no peek at 2:59, the peek at 3:00, then the sunrise ends with the duck up over the sun`, async () => {
    const page = await open({ vp, rm, touch: name === "phone" });
    await idle(page, 3 * MIN - 5000);
    assert.equal(await up(page), false, "no peek before 3 min");
    assert.equal(await page.evaluate(() => document.querySelector(".ck-rise")?.hidden ?? true), true, "nothing in the tab order before");
    await idle(page, 6000);
    assert.equal(await up(page), true, "the peek at 3 min");
    await settle(page);
    const L = await look(page);
    assert.ok(Math.abs(L.sunX - L.cx) < 1, `sun core under the duck (${L.sunX} vs ${L.cx})`);
    if (name === "phone") assert.ok(Math.abs(L.cx - L.W / 2) < 1, "phone: the duck at the bottom centre");
    else {
      assert.ok(Math.abs(L.cx - L.col.cx) < 1, "desktop: the duck at the Question column's foot");
      assert.ok(Math.abs(L.sky.l - (L.col.l - 48)) < 1 && Math.abs(L.sky.r - (L.col.r + 48)) < 1, "desktop: the sky = the column + a soft bleed");
    }
    assert.ok(L.duck.b <= vp.height + 1 && L.duck.w >= 44 && L.duck.h >= 44, "a 44px+ target on screen");
    assert.equal(L.say, name === "phone" ? "Stuck? Tap me." : "Stuck? Click me.");
    assert.equal(L.sayOp, 1, "the line shows");
    assert.equal(L.label, "Cluck: want a hint?");
    assert.deepEqual(L.over, [], "the duck and its line rest on no control");
    assert.ok(L.scrollW <= L.W, "no sideways scroll");
    assert.deepEqual(L.skyOp, [1, 1, 1], "sunrise done");
    if (rm) {
      assert.equal(L.duckTf, "none", "reduce: the duck never moves");
      assert.deepEqual(L.skyTf, ["none", "none", "none"], "reduce: the sky never moves");
      assert.equal(L.duckOp, 1, "reduce: up = full opacity");
    } else {
      assert.match(L.duckTf, /matrix\(1, 0, 0, 1, 0, 0\)|none/, "motion: the duck is all the way up");
      assert.ok(L.skyTf.every(t => /matrix\(1, 0, 0, 1, 0, -(4|8|14)\)/.test(t)), `motion: the sky layers rose 4 / 8 / 14px (${L.skyTf})`);
    }
    await page.screenshot({ path: join(tmp, `${tag.replace(" ", "-")}-up.png`) });
    assert.deepEqual(page.errs, [], "no console errors");
    await page.context().close();
  });
}

await step("reduce, mid-run: the peek is the duck at 45%, in place", async () => {
  const page = await open({ rm: true });
  await idle(page, 3 * MIN + 1000);
  await page.evaluate(() => document.getAnimations().forEach(a => { if (a.effect?.target?.closest?.(".ck-rise")) { a.pause(); a.currentTime = 8250; } }));
  const L = await look(page);
  assert.equal(L.duckOp, 0.45); assert.equal(L.duckTf, "none");
  await page.context().close();
});

await step("motion, mid-run: the peek shows the eyes only (42px of 64)", async () => {
  const page = await open({});
  await idle(page, 3 * MIN + 1000);
  await page.evaluate(() => document.getAnimations().forEach(a => { if (a.effect?.target?.closest?.(".ck-rise")) { a.pause(); a.currentTime = 8250; } }));
  const L = await look(page);
  assert.equal(L.duckTf, "matrix(1, 0, 0, 1, 0, 22)");
  await page.context().close();
});

await step("any input puts him away; a 10px mouse jitter does not, a 30px move does; the timer starts over", async () => {
  const page = await open({ vp: { width: 1440, height: 900 } });
  await idle(page, 3 * MIN + 1000);
  assert.equal(await up(page), true);
  await page.mouse.move(600, 600); await page.mouse.move(610, 600);
  assert.equal(await up(page), true, "jitter is not input");
  await page.mouse.move(640, 600);
  assert.equal(await up(page), false, "a real move is");
  await idle(page, 800);
  assert.equal(await page.evaluate(() => document.querySelector(".ck-rise").hidden), true, "gone (out of the tab order)");
  await idle(page, 3 * MIN);
  assert.equal(await up(page), false, "the second one waits 10 more min");
  await page.keyboard.press("Shift");
  await idle(page, 10 * MIN - 2000);
  assert.equal(await up(page), false, "a key reset the 10 min");
  await idle(page, 3000);
  assert.equal(await up(page), true, "the second peek");
  await nudge(page);
  await idle(page, 60 * MIN);
  assert.equal(await up(page), false, "max 2 per bank");
  await page.context().close();
});

await step("input in the 3 min (a pick, a wheel) pushes the peek out; a question change by code does not reset it", async () => {
  const page = await open({});
  await idle(page, 2 * MIN);
  await page.evaluate(() => document.querySelector("#q").dispatchEvent(new WheelEvent("wheel", { deltaY: 40, bubbles: true })));   // mouse.wheel waits on a real frame
  await idle(page, 2 * MIN);
  assert.equal(await up(page), false, "the wheel reset it");
  await page.evaluate(() => { location.hash = "#CALC1_T45M2"; });   // by code, no input
  await until(page, () => document.querySelector("#pcode").textContent === "CALC1_T45M2");
  await idle(page, MIN + 2000);
  assert.equal(await up(page), true, "a code change did not restart the wait");
  await page.context().close();
});

await step("a tap on the duck: no AI call, he goes, the timer starts over", async () => {
  const page = await open({ touch: true });
  await idle(page, 3 * MIN + 1000);
  await settle(page);
  await page.tap(".ck-peek");
  assert.equal(await up(page), false);
  await idle(page, 500);
  assert.equal(page.ai, 0, "no /explain, no /chat");
  assert.deepEqual(page.errs, []);
  await page.context().close();
});

await step("Cluck open: no peek (one glow at a time); hidden tab: the time does not count", async () => {
  const page = await open({});
  await page.evaluate(() => { window.__open = true; const f = window.stemCluckOpen; window.stemCluckOpen = () => window.__open || f(); });
  await idle(page, 4 * MIN);
  assert.equal(await up(page), false, "Cluck open");
  await page.evaluate(() => { window.__open = false; });
  await nudge(page);                                                   // closing Cluck is a tap: a fresh wait
  const hide = v => page.evaluate(v => { Object.defineProperty(document, "visibilityState", { value: v, configurable: true }); document.dispatchEvent(new Event("visibilitychange")); }, v);
  await idle(page, 2 * MIN);
  await hide("hidden"); await idle(page, 30 * MIN); await hide("visible");
  assert.equal(await up(page), false, "hidden time is not idle time");
  await idle(page, 2 * MIN);
  assert.equal(await up(page), true, "the rest of the wait after");
  await page.context().close();
});

await step("diet, the start page, a lone question: no peek", async () => {
  for (const o of [{ diet: true }, { hash: "" }, { hash: "#CALC1_T45M1" }]) {
    const page = await open(o);
    await idle(page, 15 * MIN);
    assert.equal(await up(page), false, JSON.stringify(o));
    await page.context().close();
  }
});

/* the first wrong answer of a question starts the same sunrise ~0.7 s after the feedback (Tony, Oct 17): once per question, sugar only,
   never over Cluck's sheet, a cooldown between peeks, and the 3 min idle peek still comes */
const wrongPick = async (page, id = "b") => {
  const n = await page.evaluate(() => window.__drill.state.tries.length);
  await page.click(`.opt[data-id="${id}"]`);
  await page.click(`.ch[data-id="${id}"] .send`);
  await until(page, n => window.__drill.state.tries.length > n, n);
};
for (const [name, vp, rm] of [["phone", { width: 390, height: 844 }, false], ["desktop", { width: 1440, height: 900 }, false], ["desktop reduce", { width: 1440, height: 900 }, true]]) {
  await step(`${name}: the first wrong answer starts the sunrise in ~0.7 s, once per question, then the 3 min idle peek still comes`, async () => {
    const page = await open({ vp, rm, touch: name === "phone" });
    await idle(page, 5000);
    await wrongPick(page);
    await idle(page, 300);
    assert.equal(await up(page), false, "not yet (the feedback settles first)");
    await idle(page, 900);
    assert.equal(await up(page), true, "up ~0.7 s after the wrong answer");
    await settle(page);
    const L = await look(page);
    assert.ok(Math.abs(L.sunX - L.cx) < 1, "sun core under the duck");
    assert.equal(L.label, "Cluck: want a hint?");
    if (rm) assert.equal(L.duckTf, "none", "reduce: the duck never moves");
    assert.equal(await page.evaluate(() => document.querySelectorAll(".ck-rise").length), 1, "one duck");
    await nudge(page);                                                  // input puts him away
    await idle(page, 800);
    assert.equal(await up(page), false, "input puts him away");
    await wrongPick(page, "c");                                         // the second wrong on the same question: no new peek
    await idle(page, 3000);
    assert.equal(await up(page), false, "once per question");
    await page.evaluate(() => { location.hash = "#CALC1_T45M2"; });    // another question, inside the cooldown: none
    await until(page, () => document.querySelector("#pcode").textContent === "CALC1_T45M2");
    await wrongPick(page);
    await idle(page, 3000);
    assert.equal(await up(page), false, "cooldown between peeks");
    await idle(page, 3 * MIN + 1000);
    assert.equal(await up(page), true, "the idle peek still comes after 3 min");
    assert.deepEqual(page.errs, [], "no console errors");
    await page.context().close();
  });
}

await step("desktop, wrong-answer peek: a 100px mouse move at +1 s keeps him up (2.5 s calm), a click puts him away; after the calm a move does", async () => {
  const page = await open({ vp: { width: 1440, height: 900 } });
  await wrongPick(page);
  await page.mouse.move(700, 400);
  await idle(page, 1600);                                              // 0.7 s wait + 0.9 s up
  assert.equal(await up(page), true, "up");
  await page.mouse.move(800, 500); await page.mouse.move(900, 450);
  await idle(page, 100);
  assert.equal(await up(page), true, "a 100px move in the calm does not dismiss");
  await nudge(page);
  await idle(page, 800);
  assert.equal(await up(page), false, "a click puts him away");
  await page.context().close();
  const p2 = await open({ vp: { width: 1440, height: 900 } });
  await wrongPick(p2);
  await p2.mouse.move(700, 400);
  await idle(p2, 1600);
  await idle(p2, 2000);                                                // past the calm
  await p2.mouse.move(900, 500); await p2.mouse.move(700, 300);
  await idle(p2, 800);
  assert.equal(await up(p2), false, "after the calm a move dismisses as before");
  await p2.context().close();
});

await step("a wrong answer: no peek while Cluck's sheet is open, none in diet; an input in the 0.7 s cancels it", async () => {
  const page = await open({});
  await page.evaluate(() => { window.__open = true; const f = window.stemCluckOpen; window.stemCluckOpen = () => window.__open || f(); });
  await wrongPick(page);
  await idle(page, 2000);
  assert.equal(await up(page), false, "Cluck open: no duck, no second glow");
  await page.context().close();
  const d = await open({ diet: true });
  await wrongPick(d);
  await idle(d, 2000);
  assert.equal(await up(d), false, "diet: none");
  await d.context().close();
  const c = await open({});
  await wrongPick(c);
  await idle(c, 300);
  await c.keyboard.press("Shift");
  await idle(c, 2000);
  assert.equal(await up(c), false, "typing inside the 0.7 s cancels it");
  await c.context().close();
});

await browser.close(); srv.kill();
console.log(failures ? `${failures} FAIL` : "all ok", "· shots:", tmp);
process.exit(failures ? 1 : 0);
