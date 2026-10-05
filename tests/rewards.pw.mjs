// Sugar rewards in the real page (design/REWARDS-WIRING.md): the HUD row, XP + the bells on every correct, a quiet +1 on a wrong try,
// 6 XP on try 2, a drop (slots + the WIN burst, never with #toast), state across a reload, snacks right before their real, the fading original,
// and nothing at all in diet. Starts its own serve.py with a throwaway banks/ folder and tries.json:   node tests/rewards.pw.mjs [port]
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
const PORT = +(process.argv[2] || 8835), BASE = `http://localhost:${PORT}`;
const TMP = mkdtempSync(join(tmpdir(), "rw-")), BANKS = join(TMP, "banks");
const ch = (...m) => m.map((md, i) => ({ id: "abcde"[i], md }));
const real = (code, n) => ({ code, type: "mc", shuffle: false, body: [{ type: "text", md: `Real ${n}: pick a.` }], choices: ch("one", "two", "three", "four", "five"),
  correct: "a", wrong: [{ choice: "b", hint: "QUACK. Not b." }, { choice: "c", hint: "QUACK. Not c." }],
  saccharine: { title: `Practice Exam 2, Question ${n}`, key: "Use: a\nAnswer: a", slip: { b: "b slip" } } });
const snack = (code, before, q, solution) => ({ ...real(code, 9), sugar_only: true, body: [{ type: "text", md: "Snack: pick a." }],
  saccharine: { title: `Practice Exam 2, Question ${q}: k changed`, key: "Use: a", snack: true, before,
    original: { q, body: [{ type: "text", md: `The original question ${q}.` }], solution } } });
const SOL = ["Use: $F = kx$", "$F = 2 \\cdot 3 = 6$ N", "Answer: 6 N"];
mkdirSync(BANKS);
writeFileSync(join(BANKS, "BANK_RW12.json"), JSON.stringify({ v: 1, problems: [
  real("CALC1_R01", 1), real("CALC1_R02", 2), real("CALC1_R03", 3), snack("CALC1_S01", "CALC1_R01", 7, SOL), snack("CALC1_S02", "CALC1_R03", 7, SOL)] }));
const srv = spawn("python3", [join(ROOT, "serve.py"), String(PORT)], { env: { ...process.env, STEM_BANKS: BANKS, STEM_TRIES: join(TMP, "tries.json"), OPENROUTER_API_KEY: "" }, stdio: "ignore" });
for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + "/")).ok) break; } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 100)); }

let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); }
  catch (e) { failures++; console.log("FAIL", name, "\n     ", e.message.slice(0, 700)); }
}
const opened = (page, code) => page.waitForFunction(c => document.querySelector("#pcode")?.textContent === c && !document.querySelector("#freeze").hidden, code, { timeout: 8000 });
const go = async (page, code) => { await page.evaluate(c => { location.hash = c; }, code); await opened(page, code); };
async function typeCode(page, code) {
  if (await page.isVisible("#barTab") && !(await page.isVisible("#code"))) await page.click("#barTab");
  await page.fill("#code", code); await page.press("#code", "Enter");
}
async function pick(page, id) {
  const n = await page.evaluate(() => window.__drill.state.tries.length);
  await page.click(`#q .opt[data-id="${id}"]`); await page.click(`#q .ch[data-id="${id}"] .send`);
  await page.waitForFunction(k => window.__drill.state.tries.length > k, n, { timeout: 6000 })
    .catch(async e => { throw new Error(e.message + " | pick " + id + " | " + JSON.stringify(await page.evaluate(() => [window.__drill.state.tries, document.querySelector("#q").className,
      document.querySelector("#fb").textContent, document.querySelector("#toast")?.textContent]))); });
}
const xp = page => page.evaluate(() => window.Rewards.state().xp);
const quiet = page => page.waitForFunction(() => !document.querySelector(".fx-ov"), null, { timeout: 9000 });
/* the engine's rolls on the next answer only (confetti and the rest keep the real Math.random) */
const rig = (page, q) => page.evaluate(q => { const R = window.Rewards, A = R.answer; R.answer = o => { const r = Math.random; Math.random = () => q.length ? q.shift() : r();
  try { return A(o); } finally { Math.random = r; R.answer = A; } }; }, q);
/* the list toggle by script: on desktop the brainrot corner can sit over the toggle of an open list (a pre-existing race on main;
   the overlap is in design/UX-TOPDOWN.md), and this file tests rewards, not the corner */
const toggleList = page => page.$eval("#qlistBtn", b => b.click());
const listOrder = page => page.$$eval("#qlist a", as => as.map(a => a.getAttribute("href").slice(1)));
/* every .fx-* node added to the page from now on */
const watchFx = async page => { await page.waitForFunction(() => !document.querySelector(".fx-layer > :not(canvas), .fx-ov"), null, { timeout: 6000 }); return page.evaluate(() => { window.__fx = 0; window.__fxc = []; window.__fxo?.disconnect(); (window.__fxo = new MutationObserver(ms => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1 && /(^| )fx-/.test(n.className)) { window.__fx++; window.__fxc.push(n.className); } })).observe(document.body, { childList: true, subtree: true }); }); };
const rects = (page, sels) => page.evaluate(ss => ss.map(q => { const e = document.querySelector(q); return e && e.getClientRects().length ? e.getBoundingClientRect().toJSON() : null; }), sels);
const overlap = (a, b) => a && b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block" });
  await ctx.addInitScript(() => { try { localStorage.setItem("stem-ob", "done"); localStorage.setItem("stem-voice", "off"); } catch { /* */ } });
  const page = await ctx.newPage();
  await page.goto(BASE + "/");
  await typeCode(page, "BANK_RW12");
  await page.waitForFunction(() => /^CALC1_/.test(document.querySelector("#pcode")?.textContent || ""), null, { timeout: 8000 });

  await step("sugar: snacks sit right before their real in the list; the HUD row sits in the top bar", async () => {
    await toggleList(page); const o = await listOrder(page); await toggleList(page);
    assert.equal(o.length, 5);
    assert.equal(o[o.indexOf("CALC1_S01") + 1], "CALC1_R01", o.join(" "));
    assert.equal(o[o.indexOf("CALC1_S02") + 1], "CALC1_R03", o.join(" "));
    await go(page, "CALC1_R01");
    await page.waitForSelector("#rwHud:not([hidden])");
    const [hud, top, prev] = await rects(page, ["#rwHud", "header.top", "#qprev"]);
    assert.ok(hud.top >= top.top && hud.bottom <= top.bottom + 1, "in the top bar " + JSON.stringify([hud, top]));
    assert.ok(!overlap(hud, prev), "clear of Prev");
    assert.equal(await xp(page), 0);
  });

  await step("a first-try correct pays 12-16 XP with the bells (float, coins, coin-pill shine); #toast stays off", async () => {
    await watchFx(page);
    await rig(page, [0.5, 0.99]);                                               // 14 XP, no drop
    await pick(page, "a");
    await page.waitForSelector("#rwCoin.rw-shine", { state: "attached", timeout: 3000 });
    await page.waitForFunction(() => window.Rewards.state().xp > 0, null, { timeout: 4000 });
    const x = await xp(page);
    assert.equal(x, 14);
    const c = await page.evaluate(() => window.__fxc);
    for (const k of ["fx-float", "fx-fly"]) assert.ok(c.some(n => n.split(" ").includes(k)), k + " in " + c.join(","));
    assert.equal(await page.$eval("#toast", t => t.classList.contains("on")), false);
    await page.waitForFunction(x => document.querySelector("#rwHud .rw-num").textContent === String(x), x, { timeout: 3000 });
    assert.match(await page.getAttribute("#rwHud", "aria-label"), new RegExp(`^${x} XP \\(points\\), level 1`));
    await quiet(page);
  });

  await step("a wrong try: one small quiet +1, nothing else; the streak waits; the second-try correct pays 6 with the bells", async () => {
    await go(page, "CALC1_R02");
    const x0 = await xp(page), s0 = await page.evaluate(() => window.Rewards.state().streak);
    await watchFx(page);
    await pick(page, "b");
    await page.waitForTimeout(1500);
    assert.deepEqual(await page.evaluate(() => window.__fxc), ["fx-float fx-float-sm"], "a wrong try: only the small +1");
    assert.equal(await xp(page), x0 + 1);
    assert.equal(await page.evaluate(() => window.Rewards.state().streak), s0, "the streak never halves");
    await rig(page, [0.99]);                                                    // no drop
    await pick(page, "a");
    await page.waitForFunction(x => window.Rewards.state().xp === x, x0 + 7, { timeout: 3000 })
      .catch(async e => { throw new Error(e.message + " | x0 " + x0 + " | " + JSON.stringify(await page.evaluate(() => [window.Rewards.state(), window.__drill.state.tries]))); });
    assert.ok(await page.evaluate(() => window.__fx) > 1, "the bells on try 2");
    assert.equal(await page.evaluate(() => window.Rewards.state().real), 2);
    await quiet(page);                                                          // 21 XP: the level-up burst
  });

  await step("a common drop (held 1 s+): slots, then the WIN burst with stars, out of the 15 s cap; #toast never shows with it", async () => {
    await go(page, "CALC1_R03");
    await page.evaluate(() => { const k = Object.keys(localStorage).find(x => x.startsWith("stem-rw:")); const s = JSON.parse(localStorage.getItem(k)); s.lastBurst = 0; s.dry = 0; localStorage.setItem(k, JSON.stringify(s)); });
    await rig(page, [0, 0, 0, 0]);                                              // 12 XP, a drop, common, line 1
    await page.waitForTimeout(1100);
    await pick(page, "a");
    await page.waitForSelector(".fx-slots-ov", { timeout: 4000 });
    await page.waitForSelector(".fx-ov.fx-win .fx-stars", { timeout: 8000 });
    assert.match(await page.textContent(".fx-ov.fx-win .fx-title"), /WIN!/);
    assert.match(await page.textContent(".fx-ov.fx-win"), /QUACK! Brain \+1\./);
    assert.equal(await page.$eval("#toast", t => t.classList.contains("on")), false);
    assert.match(await page.textContent("#sr"), /Correct\. Plus \d+ XP\. QUACK! Brain \+1\./);
    await quiet(page);
  });

  await step("reload: XP kept; a done question pays nothing again", async () => {
    const x = await xp(page);
    await page.reload(); await opened(page, "CALC1_R03");
    await page.waitForSelector("#rwHud:not([hidden])");
    assert.equal(await xp(page), x);
    assert.equal(await page.evaluate(() => window.Rewards.answer({ code: "CALC1_R03", correct: true, firstTry: true, dwellMs: 9e3 }).xp), 0);
  });

  await step("Next steps over a snack only while the last 10 first tries are above 90%", async () => {
    await toggleList(page); const o = await listOrder(page); await toggleList(page);
    const before = o[o.indexOf("CALC1_S02") - 1];
    if (!before) return;                                                        // the snack opens the list: nothing steps onto it
    await go(page, before);
    await page.click("#qnext"); await page.waitForFunction(() => document.querySelector("#pcode").textContent === "CALC1_S02", null, { timeout: 4000 });
    await page.evaluate(() => { const k = Object.keys(localStorage).find(x => x.startsWith("stem-rw:")); const s = JSON.parse(localStorage.getItem(k)); s.hist = Array(10).fill(1); localStorage.setItem(k, JSON.stringify(s)); });
    await go(page, before);
    await page.click("#qnext"); await page.waitForFunction(() => document.querySelector("#pcode").textContent === "CALC1_R03", null, { timeout: 4000 });
  });

  await step("the original beside a snack fades: whole solution, then the last line behind Peek (2 XP), then folded", async () => {
    const dc = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block" });
    await dc.addInitScript(() => { try { localStorage.setItem("stem-ob", "done"); } catch { /* */ } });
    const d = await dc.newPage();
    await d.goto(BASE + "/#CALC1_S01"); await opened(d, "CALC1_S01");      // no bank: the first snack of Q7 this browser sees
    assert.equal(await d.$eval("#orig", e => e.parentElement.id), "work", "desktop: in the pad column");
    await d.waitForSelector("#work > #rot.dock", { state: "attached", timeout: 4000 });
    assert.equal(await d.$eval("#work", w => w.firstElementChild.id), "rot", "the docked videos stay above the original (D1)");
    assert.equal(await d.getAttribute("#origHd", "aria-expanded"), "true");
    assert.equal(await d.isHidden("#xb"), true, "in the scratchpad's place while open");
    assert.match(await d.textContent("#origHd"), /Similar solution steps/);   // T1 variant A: a button that says what you get
    assert.match(await d.textContent("#origHd"), /Practice Exam 2, question 7/);  // the screen reader still hears which question
    assert.equal(await d.$eval("#origHd", b => b.tagName), "BUTTON");
    assert.equal(await d.isVisible("#orig .rw-free"), true, "FREE while opening it costs nothing");
    assert.equal(await d.$$eval("#orig .orig-sol li:not([hidden])", l => l.length), 3);
    await d.click("#origHd");
    assert.equal(await d.isVisible("#xb"), true, "folded: the scratchpad is back");
    await pick(d, "b"); await rig(d, [0.99]); await pick(d, "a");             // not a first-try correct: the original stays unsolved
    await go(d, "CALC1_S02");
    assert.equal(await d.$$eval("#orig .orig-sol li:not([hidden])", l => l.length), 2, "level 2: the last line hidden");
    await d.click("#orig .orig-peek");
    assert.equal(await d.$$eval("#orig .orig-sol li:not([hidden])", l => l.length), 3);
    assert.equal(await d.isVisible("#orig .orig-note"), true);
    const x0 = await xp(d);
    await pick(d, "a");
    await d.waitForFunction(x => window.Rewards.state().xp > x, x0, { timeout: 4000 });
    assert.equal(await xp(d) - x0, 2, "a peeked snack pays 2");
    await go(d, "CALC1_S01");
    assert.equal(await d.getAttribute("#origHd", "aria-expanded"), "false", "level 3: folded after a first-try correct on Q7");
    assert.equal(await d.$$eval("#orig .rw-free", f => f.length), 0, "no FREE at level 3: looking again before answering is a peek");
    await dc.close();
    const pc = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, serviceWorkers: "block" });
    await pc.addInitScript(() => { try { localStorage.setItem("stem-ob", "done"); } catch { /* */ } });
    const p = await pc.newPage();
    await p.goto(BASE + "/#CALC1_S01"); await opened(p, "CALC1_S01");
    assert.equal(await p.$eval("#orig", e => e.parentElement.id), "freezeIn", "phone: on top of the problem");
    assert.equal(await p.getAttribute("#origHd", "aria-expanded"), "false", "phone: folded");
    await p.click("#origHd");
    assert.equal(await p.getAttribute("#origHd", "aria-expanded"), "true", "the tap opens it");
    await p.click("#orig .rw-free"); assert.equal(await p.getAttribute("#origHd", "aria-expanded"), "false", "a tap on the FREE sticker works the card too");
    await p.click("#origHd");
    assert.equal(await p.isVisible("#orig .orig-sol"), true);
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth), 390, "no sideways scroll");
    await pc.close();
  });

  await step("diet: no HUD node, no FX, no stem-rw key, no snack anywhere", async () => {
    await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith("stem-rw")) localStorage.removeItem(k); });
    await typeCode(page, "DIET_BANK_RW12");
    await page.waitForFunction(() => /stem-mode=diet/.test(document.cookie), null, { timeout: 4000 });
    await page.reload();
    await page.waitForFunction(() => /^CALC1_R/.test(document.querySelector("#pcode")?.textContent || ""), null, { timeout: 8000 });
    await toggleList(page); const o = await listOrder(page); await toggleList(page);
    assert.deepEqual([...o].sort(), ["CALC1_R01", "CALC1_R02", "CALC1_R03"]);
    await go(page, "CALC1_R02");
    await watchFx(page);
    await page.click('#q .opt[data-id="a"]').catch(() => {});
    assert.equal(await page.$$eval("#rwHud, .fx-layer, .fx-ov", e => e.length), 0);
    assert.equal(await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith("stem-rw")).length), 0);
    assert.equal((await fetch(BASE + "/p/CALC1_S01.json", { headers: { cookie: "stem-mode=diet" } })).status, 404);
    await typeCode(page, "SUGAR_BANK_RW12");
    await page.waitForFunction(() => !/stem-mode=diet/.test(document.cookie), null, { timeout: 4000 });
  });

  await step("phone 390x844: the HUD is its own row under the nav, clear of the nav, the code bar and the Scratchpad button", async () => {
    const ph = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, serviceWorkers: "block" });
    await ph.addInitScript(() => { try { localStorage.setItem("stem-ob", "done"); } catch { /* */ } });
    const p2 = await ph.newPage();
    await p2.goto(BASE + "/");
    await typeCode(p2, "BANK_RW12");
    await p2.waitForFunction(() => /^CALC1_/.test(document.querySelector("#pcode")?.textContent || ""), null, { timeout: 8000 });
    await go(p2, "CALC1_R01");
    await p2.waitForSelector("#rwHud:not([hidden])");
    const r = await rects(p2, ["#rwHud", "#qnav", "#dock", "#padFab"]);
    assert.ok(r[0] && r[1] && r[0].top >= r[1].bottom - 1, "under the nav row");
    for (const [i, name] of [[1, "nav"], [2, "dock"], [3, "Scratchpad button"]]) assert.ok(!overlap(r[0], r[i]), `HUD over the ${name}`);
    assert.ok(r[0].right <= 390 && r[0].left >= 0, "inside the page");
    assert.equal(await p2.evaluate(() => document.documentElement.scrollWidth), 390, "no sideways scroll");
    await ph.close();
  });

  await step("reduced motion: a correct answer pays but makes no particles", async () => {
    const rm = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: "reduce", serviceWorkers: "block" });
    await rm.addInitScript(() => { try { localStorage.setItem("stem-ob", "done"); } catch { /* */ } });
    const p3 = await rm.newPage();
    await p3.goto(BASE + "/#CALC1_R02"); await opened(p3, "CALC1_R02");
    await watchFx(p3);
    await rig(p3, [0.5, 0.99]);
    await pick(p3, "a");
    await p3.waitForFunction(() => window.Rewards.state().xp > 0, null, { timeout: 4000 });
    assert.equal(await p3.$$eval(".fx-sp, .fx-fly, .fx-ring", e => e.length), 0);
    await rm.close();
  });
} finally {
  await browser.close();
  srv.kill();
}
console.log(failures ? `${failures} FAIL` : "all ok");
process.exit(failures ? 1 : 0);
