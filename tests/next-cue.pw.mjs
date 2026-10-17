// T17b-1 DEFAULT CUE (queue 20261011-T17b-1, r5/B cue3.html R3 REC set): after a right answer / out of tries a labelled Next lands
// in the Check slot of the last try, for every answer type (num, text, expr, multi part, mc row, mc pill, pick all).
// The Fail-if lines, one check each:
//   - Next covers the Check rect (±1px), Next 48 tall, right edges flush (≤2px), the card moves 0px (393x852 + 393x659), focus on Next,
//     a held Enter (e.repeat) never skips the next question
//   - sugar right row/box: the 3px --field ring round the face (fix A), the 10% wash; diet: no ring, no wash
//   - the filled ▶ (#i-tri) only inside the filled Next; the nav bar Next keeps the chevron (#i-next)
//   - the duck chip: sugar only, one line at 393px, inside the gutter, ≥44px tall; a tap pays no XP
//   - one blink: at most one animation running at a time after Check (20ms sampling, non-reward questions + diet); reduced motion =
//     g-next-fade only
//   - out of tries: every untried mc row still dimmed (.5), no reveal of the right answer, no out-of-tries text line
// Every problem, the bank and every verdict come from page.route: deterministic, no answers needed, no server state touched.
// usage: python3 serve.py 8812 &   then   node tests/next-cue.pw.mjs http://localhost:8812 [shotDir]
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import fs from "node:fs";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { pw = require("/opt/node22/lib/node_modules/playwright"); }

const BASE = process.argv[2] || "http://localhost:8812";
const SHOTS = process.argv[3] || "";
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); }
  catch (e) { failures++; console.log("FAIL", name, "\n     ", String(e.message).slice(0, 900)); }
}

const txt = md => [{ type: "text", md }];
const MC4 = [{ id: "a", md: "attitude" }, { id: "b", md: "attitude centrality" }, { id: "c", md: "attitude accessibility" }, { id: "d", md: "negativity bias" }];
/* the bank: one problem per answer type; W* carry Cluck's key (wish) = the sugar chip + rewards; the others are calm (no reward FX) */
const P = [
  { code: "PHYS_TNM", title: "Practice, Question 1", type: "num", how: "Number, in s", body: txt("A ball drops from 20 m, from rest. How long until it lands? Use g = 9.8 m/s².") },
  { code: "PHYS_TTX", title: "Practice, Question 2", type: "text", how: "A word or two", body: txt("Which term matches: the tendency to give negative information more weight?") },
  { code: "PHYS_TEX", title: "Practice, Question 3", type: "expr", var: "x", body: txt("Differentiate $x^3$.") },
  { code: "PHYS_TMC", title: "Practice, Question 4", type: "mc", shuffle: false, body: txt("Which term matches this definition? An evaluation of an object in a positive or negative fashion."), choices: MC4 },
  { code: "PHYS_TTF", title: "Practice, Question 5", type: "mc", shuffle: false, body: txt("True or false: F = ma is Newton's second law."), choices: [{ id: "a", md: "True" }, { id: "b", md: "False" }] },
  { code: "PHYS_TMU", title: "Practice, Question 6", type: "multi", how: "Numbers, with units", body: txt("A 12 V battery drives a 4 Ω resistor for 10 s."),
    parts: [{ label: "a", prompt: "Current?" }, { label: "b", prompt: "Power?" }, { label: "c", prompt: "Charge?" }, { label: "d", prompt: "Energy?" }] },
  { code: "PHYS_TPA", title: "Practice, Question 7", type: "mc", pick: "all", shuffle: false, body: txt("Tick every true one."), choices: MC4 },
  { code: "PHYS_WNM", title: "Practice, Question 8", type: "num", how: "Number, in s", wish: true, body: txt("A ball drops from 45 m, from rest. How long until it lands?") },
  { code: "PHYS_WMC", title: "Practice, Question 9", type: "mc", shuffle: false, wish: true, body: txt("Which law says F = ma?"),
    choices: [{ id: "a", md: "Newton's second law" }, { id: "b", md: "Newton's first law" }, { id: "c", md: "Newton's third law" }, { id: "d", md: "Hooke's law" }] },
  { code: "PHYS_WMU", title: "Practice, Question 10", type: "multi", wish: true, body: txt("A 12 V battery drives a 4 Ω resistor for 10 s."),
    parts: [{ label: "a", prompt: "Current?" }, { label: "b", prompt: "Power?" }, { label: "c", prompt: "Charge?" }, { label: "d", prompt: "Energy?" }] }
];
const BANK = "BANK_TQCUE";
const RIGHT = "RIGHT", RIGHT_IDS = ["a"], RIGHT_SET = ["a", "b"];

async function ctxFor(browser, { mode, W, H, rm = false }) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, serviceWorkers: "block",
    reducedMotion: rm ? "reduce" : "no-preference" });
  await ctx.addInitScript(() => { try { localStorage.setItem("stem-ob", "done"); for (const b of ["right", "miss", "three"]) localStorage.setItem("stem-ob-rw-" + b, "9"); } catch { /* blocked */ } });
  await ctx.addCookies(mode === "diet" ? [{ name: "stem-mode", value: "diet", url: BASE }, { name: "stem-mode-v", value: "2", url: BASE }] : [{ name: "stem-mode-v", value: "2", url: BASE }]);
  return ctx;
}
async function pageFor(browser, o, at) {
  const ctx = await ctxFor(browser, o), page = await ctx.newPage();   // a fresh context per question: no done record, rewards or nod record carried over
  page.ctx = ctx;
  page.setDefaultTimeout(8000);
  const errors = []; page.on("pageerror", e => errors.push(String(e)));
  const tries = {};
  await page.route(`**/b/${BANK}.json`, r => r.fulfill({ json: { code: BANK, problems: P, marks: {}, at } }));
  await page.route("**/state/**", r => r.fulfill({ status: 404, body: "{}" }));
  await page.route("**/explain", r => r.fulfill({ status: 200, contentType: "text/plain", body: "1. Fall time — from rest\n$t = \\sqrt{2h/g}$" }));
  await page.route("**/check", r => {
    const b = r.request().postDataJSON(), p = P.find(x => x.code === b.code), k = b.code + ":" + (b.part ?? "");
    const max = p.type === "mc" && p.choices.length === 2 ? 1 : 2;
    const ok = p.pick === "all" ? JSON.stringify([...(b.choices || [])].sort()) === JSON.stringify(RIGHT_SET)
      : p.type === "mc" ? RIGHT_IDS.includes(b.choice) : b.answer === RIGHT;
    if (ok) return r.fulfill({ json: { verdict: "correct", ...(b.part != null ? { part: b.part } : {}) } });
    tries[k] = (tries[k] || 0) + 1;
    const left = Math.max(0, max - tries[k]), wrongIds = (b.choices || []).filter(c => !RIGHT_SET.includes(c));
    return r.fulfill({ json: { verdict: "wrong", triesLeft: left, ...(b.part != null ? { part: b.part } : {}), ...(p.pick === "all" && wrongIds[0] ? { struck: wrongIds[0] } : {}) } });
  });
  page.errors = errors;
  await page.goto(`${BASE}/#${BANK}`, { waitUntil: "load" });
  await page.waitForFunction(c => document.querySelector("#pcode")?.textContent === c, at, { timeout: 10000 });
  await page.waitForFunction(() => !document.querySelector("#qnav").hidden, null, { timeout: 6000 });
  await page.waitForTimeout(400);
  return page;
}
const R = e => e && (({ left, top, right, bottom, width, height }) => ({ left, top, right, bottom, width, height }))(e.getBoundingClientRect());
const geo = page => page.evaluate(() => {
  const R = e => e && (({ left, top, right, bottom, width, height }) => ({ left, top, right, bottom, width, height }))(e.getBoundingClientRect());
  return { card: R(document.querySelector("#blocks")), q: R(document.querySelector("#q")), y: scrollY };
});
/* the sampler: every 20 ms from the verdict (#q.closed) on, how many on-screen elements are moving: an element with animations in their
   active phase (delay passed, not ended) is one group (a colour tween splits into one transition per border side: still one thing moving) */
const startSampler = page => page.evaluate(() => {
  window.__s = { peak: 0, names: new Set(), at: [] };
  let t0 = 0;
  window.__si = setInterval(() => {
    if (!document.querySelector("#q.closed")) return;
    if (!t0) t0 = performance.now();
    const moving = new Set();
    for (const a of document.getAnimations()) {
      if (a.playState !== "running") continue;
      const tg = a.effect && a.effect.target;
      if (!tg || !tg.isConnected || !tg.getClientRects().length) continue;   // a hidden Check's press tween is not on screen
      const c = a.effect.getComputedTiming(), lt = c.localTime;
      if (lt != null && lt >= (c.delay || 0) && lt < (c.delay || 0) + c.activeDuration) {
        moving.add(tg); window.__s.names.add((a.animationName || a.transitionProperty || "?") + "@" + (tg.className?.baseVal ?? tg.className ?? tg.id ?? ""));
      }
    }
    if (moving.size > window.__s.peak) window.__s.peak = moving.size;
    if (moving.size > 1) window.__s.at.push(Math.round(performance.now() - t0));
  }, 20);
});
const stopSampler = page => page.evaluate(() => { clearInterval(window.__si); return { peak: window.__s.peak, names: [...window.__s.names], at: window.__s.at.slice(0, 5) }; });

/* drive one question to its close; returns { check, before } = the Check rect and the geometry right before the closing tap */
async function close(page, type, outcome, { code } = {}) {
  const p = P.find(x => x.code === code);
  const right = outcome === "right";
  if (p.type === "mc" && p.pick === "all") {
    const ids = right ? RIGHT_SET : ["c"];
    if (!right) { await page.tap(`#q .opt[data-id="c"]`); await page.tap("#mcGo"); await page.waitForSelector("#q .opt.wrong"); await page.waitForTimeout(450); await page.tap(`#q .opt[data-id="d"]`); }
    else for (const id of ids) await page.tap(`#q .opt[data-id="${id}"]`);
    const go = page.locator("#mcGo"); await go.scrollIntoViewIfNeeded(); await page.waitForTimeout(150);
    const check = await go.evaluate(R), before = await geo(page);
    await startSampler(page); await go.tap();
    return { check, before };
  }
  if (p.type === "mc") {
    if (!right && p.choices.length > 2) { await page.tap(`#q .opt[data-id="c"]`); await page.tap(`#q .ch[data-id="c"] .send`); await page.waitForSelector(`#q .opt.wrong`); await page.waitForTimeout(450); }
    const id = right ? "a" : p.choices.length > 2 ? "d" : "b";
    await page.tap(`#q .opt[data-id="${id}"]`);
    const go = page.locator(`#q .ch[data-id="${id}"] .send`); await go.scrollIntoViewIfNeeded(); await page.waitForTimeout(350);   // the lock-in dim settles
    const check = await go.evaluate(R), before = await geo(page);
    await startSampler(page); await go.tap();
    return { check, before };
  }
  if (p.type === "multi") {
    for (let i = 0; i < 3; i++) { await page.fill(`#q .part[data-i="${i}"] .ans`, RIGHT); await page.tap(`#go${i}`); await page.waitForSelector(`#q .part[data-i="${i}"] .ff.shut`); }
    if (!right) { await page.fill(`#q .part[data-i="3"] .ans`, "1"); await page.tap("#go3"); await page.waitForSelector(`#q .part[data-i="3"] .ff.bad`); await page.waitForTimeout(450); }
    await page.fill(`#q .part[data-i="3"] .ans`, right ? RIGHT : "2");
    const go = page.locator("#go3"); await go.scrollIntoViewIfNeeded(); await page.waitForTimeout(150);
    const check = await go.evaluate(R), before = await geo(page);
    await startSampler(page); await go.tap();
    return { check, before };
  }
  if (!right) { await page.fill("#ans", "1"); await page.tap("#ansGo"); await page.waitForSelector("#ff.bad"); await page.waitForTimeout(450); }
  await page.fill("#ans", right ? RIGHT : "2");
  const go = page.locator("#ansGo"); await go.scrollIntoViewIfNeeded(); await page.waitForTimeout(150);
  const check = await go.evaluate(R), before = await geo(page);
  await startSampler(page); await go.tap();
  return { check, before };
}

const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
const CASES = [["num", "PHYS_TNM"], ["text", "PHYS_TTX"], ["expr", "PHYS_TEX"], ["mc", "PHYS_TMC"], ["mc-pill", "PHYS_TTF"], ["multi", "PHYS_TMU"], ["pick-all", "PHYS_TPA"]];
const field = "rgb(10, 19, 34)";
for (const [W, H] of [[393, 852], [393, 659]]) for (const mode of ["sugar", "diet"]) {
  const O = { mode, W, H };
  for (const [type, code] of CASES) for (const outcome of ["right", "out"]) {
    const T = `${mode} ${W}x${H} ${type} ${outcome}`;
    const page = await pageFor(browser, O, code);
    let got = null;
    await step(`${T}: Next lands on the Check rect, 48 tall, right flush, card moves 0px, focus on Next, one blink`, async () => {
      const { check, before } = await close(page, type, outcome, { code });
      await page.waitForSelector("#q .nx", { timeout: 4000 });
      await page.waitForTimeout(700);
      const blink = await stopSampler(page);
      got = await page.evaluate(() => {
        const R = e => e && (({ left, top, right, bottom, width, height }) => ({ left, top, right, bottom, width, height }))(e.getBoundingClientRect());
        const nx = document.querySelector("#q .nx"), nf = nx.querySelector(".nf"), car = nx.closest(".ch, .ff, .chk"), o = car.querySelector(".opt") || car;
        const cs = getComputedStyle(nf), ccs = getComputedStyle(o);
        const rgb = c => { const m = /^color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)\)$/.exec(c); return m ? `rgb(${m.slice(1).map(v => Math.round(v * 255)).join(", ")})` : c; };
        return { nx: R(nx), nf: R(nf), n: document.querySelectorAll("#q .nx").length, card: R(document.querySelector("#blocks")), y: scrollY,
          focus: document.activeElement === nx, label: nx.textContent.trim(), ring: ((b, f, o) => /^(none|normal)$/.test(b.content) ? "none" : `${Math.round(f.top - o.top - parseFloat(b.top))}px ${b.backgroundColor}`)(getComputedStyle(nx, "::before"), nf.getBoundingClientRect(), nx.getBoundingClientRect()), wash: rgb(ccs.backgroundColor), all: car.matches(".chk"), rim: ccs.borderTopWidth + " " + ccs.borderTopColor,
          face: rgb(getComputedStyle(nf).backgroundColor), right: !!document.querySelector("#q .opt.right, #q .ff.ok"), carrierOpacity: getComputedStyle(car).opacity,
          tri: [...document.querySelectorAll('use[href="#i-tri"]')].map(u => !!u.closest(".nx")), nav: document.querySelector("#qnext use").getAttribute("href"),
          untried: [...document.querySelectorAll("#q .opt:not(.wrong):not(.right)")].map(x => getComputedStyle(x).opacity),
          rightShown: !!document.querySelector("#q .opt.right"), fb: document.querySelector("#fb").textContent, chip: R(document.querySelector("#wish:not([hidden]) .cue-chip")) };
      });
      const c = check, n = got.nx;
      assert.equal(got.n, 1, "exactly one Next");
      assert.equal(got.label, "Next");
      assert.ok(n.left <= c.left + 1 && n.top <= c.top + 1 && n.right >= c.right - 1 && n.bottom >= c.bottom - 1, `Check ${JSON.stringify(c)} not inside Next ${JSON.stringify(n)}`);
      assert.ok(Math.abs(n.height - 48) <= 0.5, `Next height ${n.height}`);
      assert.ok(Math.abs(n.right - c.right) <= 2, `right edges ${n.right} vs ${c.right}`);
      assert.equal(got.card.top - before.card.top, 0, `card moved ${got.card.top - before.card.top}px (scrollY ${before.y} -> ${got.y})`);
      assert.equal(got.y, before.y, "the page scrolled");
      assert.ok(got.focus, "focus is not on Next");
      assert.ok(got.tri.length >= 1 && got.tri.every(Boolean), "▶ (#i-tri) outside the filled Next");
      assert.equal(got.nav, "#i-next", "the nav bar Next lost its chevron");
      assert.notEqual(got.carrierOpacity, "0.5", "the carrier of Next is dimmed");
      assert.ok(!/Out of tries/.test(got.fb), "an out-of-tries line is on the page: " + got.fb);
      if (outcome === "right") assert.ok(got.right, "the right row/box lost its ok look");
      if (mode === "sugar" && outcome === "right" && !got.all) {   // pick all: Next sits in the Check row under the list, not on a green row
        assert.equal(got.ring, "3px " + field, "sugar right: no 3px --field ring round the face: " + got.ring);
        assert.ok(Math.abs(got.nf.height - 44) <= 0.5, `face ${got.nf.height} (44)`);
      } else assert.equal(got.ring, "none", "a ring outside the sugar right row: " + got.ring);
      if (outcome === "right" && !got.all) {   // V1 thin light, both modes: a 1px --correct ring, no fill (the row keeps its rest surface)
        assert.match(got.rim, /^1px rgb\(78, 230, 175\)/, "right ring (1px --correct): " + got.rim);
        assert.ok(["rgb(22, 36, 58)", "rgb(10, 19, 34)"].includes(got.wash), "a fill on the right row/box: " + got.wash);
      }
      assert.equal(got.face, outcome === "right" ? "rgb(78, 230, 175)" : "rgb(32, 48, 74)", "Next face: --correct after right, --raised out of tries (PALETTE-v3 §6)");
      if (outcome === "out") {
        assert.equal(got.rightShown, false, "a reveal: the right row is marked");
        if (type === "mc") assert.ok(got.untried.length && got.untried.every(o => o === "1"), "untried mc rows dimmed (V1: rows never dim): " + got.untried);
      }
      assert.equal(got.chip, null, "a duck chip on a question without Cluck's key");
      assert.ok(blink.peak <= 1, `two animation groups at once: peak ${blink.peak} ${JSON.stringify(blink)}`);
      assert.ok(blink.names.some(x => x.startsWith("g-next-in")), "no g-next-in: " + blink.names);
      assert.deepEqual(page.errors, []);
    });
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/after-${mode}-${type}-${outcome}-${H}.png` });
    await page.ctx.close();
    if (type === "num" && outcome === "right" && got) {
      const kp = await pageFor(browser, O, code);
      await step(`${T}: the Enter that sent Check, held (e.repeat), stays on this question; a fresh Enter on Next goes on`, async () => {
        await kp.fill("#ans", RIGHT); await kp.focus("#ans");
        const h0 = await kp.evaluate(() => location.hash);
        await kp.keyboard.down("Enter");                                          // sends Check
        await kp.waitForSelector("#q .nx"); await kp.waitForTimeout(400);
        assert.ok(await kp.evaluate(() => document.activeElement.matches(".nx")), "focus is not on Next");
        await kp.keyboard.down("Enter"); await kp.keyboard.down("Enter");           // still held: Playwright marks these repeat: true
        await kp.waitForTimeout(500);
        assert.equal(await kp.evaluate(() => location.hash), h0, "a held Enter skipped the question");
        await kp.keyboard.up("Enter");
        await kp.keyboard.press("Enter");
        await kp.waitForFunction(h => location.hash !== h, h0, { timeout: 4000 });
      });
      await kp.ctx.close();
    }
  }
}

/* sugar questions with Cluck's key: the duck chip, one line, no XP for a tap; diet: none of it */
for (const [W, H] of [[393, 852], [393, 659]]) for (const mode of ["sugar", "diet"]) {
  const O = { mode, W, H };
  for (const [type, code] of [["num", "PHYS_WNM"], ["mc", "PHYS_WMC"], ["multi", "PHYS_WMU"]]) for (const outcome of ["right", "out"]) {
    const T = `${mode} ${W}x${H} chip ${type} ${outcome}`;
    const page = await pageFor(browser, O, code);
    await step(`${T}: ${mode === "sugar" ? "the duck chip, one line in the gutter, ≥44 tall, the right label; a tap pays no XP" : "no chip, no duck, no wash"}`, async () => {
      const { check } = await close(page, type, outcome, { code });
      await page.waitForSelector("#q .nx"); await page.waitForTimeout(900); await stopSampler(page);
      const g = await page.evaluate(() => {
        const c = document.querySelector("#wish:not([hidden]) .cue-chip"), s = c && c.querySelector("span"), r = c && c.getBoundingClientRect();
        return { has: !!c, any: !!document.querySelector(".cue-chip, .g-nod, #wish:not([hidden])"), label: s && s.textContent, r: r && { l: r.left, r: r.right, h: r.height },
          lines: s ? Math.round(s.getBoundingClientRect().height / parseFloat(getComputedStyle(s).lineHeight === "normal" ? 16 : getComputedStyle(s).lineHeight)) : 0,
          sh: s ? s.getClientRects().length : 0, clip: c ? c.scrollWidth > c.clientWidth + 0.5 : false, vw: innerWidth,
          duck: c && c.querySelector("img.dk")?.getAttribute("src"), dh: c && c.querySelector("img.dk")?.getBoundingClientRect().height,
          xp: window.Rewards && window.Rewards.state && window.Rewards.state() ? window.Rewards.state().xp : null };
      });
      if (mode === "diet") { assert.equal(g.any, false, "diet shows the chip / a duck / a nod"); return; }
      assert.ok(g.has, "no duck chip");
      assert.equal(g.label, outcome === "right" ? "Compare with Cluck's steps" : "Ask Cluck");
      assert.equal(g.sh, 1, "the label wraps"); assert.equal(g.clip, false, "the label is cut");
      assert.ok(g.r.l >= 16 - 0.5 && g.r.r <= g.vw - 16 + 0.5, `chip outside the 16px gutter: ${g.r.l}-${g.r.r}`);
      assert.ok(g.r.h >= 44, `chip ${g.r.h} tall`);
      assert.match(g.duck, outcome === "right" ? /duck-calm-nod-128\.webp$/ : /duck-out-shrug-128\.webp$/);
      assert.ok(Math.abs(g.dh - 48) <= 0.5, `duck ${g.dh}px (48)`);
      const nod = await page.evaluate(() => { const d = document.querySelector("#wish .cue-chip img.g-nod"), n = d && getComputedStyle(d);
        return d ? { name: n.animationName, delay: parseFloat(n.animationDelay) * (n.animationDelay.endsWith("ms") ? 1 : 1000), iter: n.animationIterationCount } : null; });
      if (outcome === "right") {                                                   // a fresh browser: the first right of the day nods, once, after Next has landed (120 + 200 ms)
        assert.ok(nod && nod.name === "g-nod" && nod.iter === "1" && nod.delay >= 320, "the calm nod: " + JSON.stringify(nod));
      } else assert.equal(nod, null, "out of tries nods");
      if (SHOTS && type !== "multi") await page.screenshot({ path: `${SHOTS}/after-${mode}-chip-${type}-${outcome}-${H}.png` });
      const xp0 = g.xp;
      assert.equal(typeof xp0, "number", "no rewards state to compare");
      const ls0 = await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).filter(k => /rw|reward/i.test(k)).map(k => [k, localStorage.getItem(k)])));
      await page.tap("#wish .cue-chip"); await page.waitForTimeout(800);
      const xp1 = await page.evaluate(() => window.Rewards && window.Rewards.state && window.Rewards.state() ? window.Rewards.state().xp : null);
      const ls1 = await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).filter(k => /rw|reward/i.test(k)).map(k => [k, localStorage.getItem(k)])));
      assert.equal(xp1, xp0, `a chip tap paid XP: ${xp0} -> ${xp1}`);
      assert.deepEqual(ls1, ls0, "a chip tap changed the rewards record");
      assert.ok(await page.evaluate(() => !!document.querySelector("#cluck:not([hidden])")), "the chip did not open Cluck");
      void check;
    });
    if (SHOTS && mode === "diet" && type !== "multi") await page.screenshot({ path: `${SHOTS}/after-${mode}-chip-${type}-${outcome}-${H}.png` });
    await page.ctx.close();
  }
}

/* reduced motion: only the g-next-fade (no transform), no nod */
for (const mode of ["sugar", "diet"]) {
  const O = { mode, W: 393, H: 852, rm: true };
  for (const [type, code] of [["num", "PHYS_WNM"], ["mc", "PHYS_TMC"], ["multi", "PHYS_TMU"]]) {
    const page = await pageFor(browser, O, code);
    await step(`${mode} reduced motion ${type}: g-next-fade only, no nod, no other motion`, async () => {
      /* a random reward drop (rewards/fx.js overlay, wish questions only) is the live reward FX = task B2, out of this scope: it is kept
         apart, and under reduced motion it may only fade (opacity keyframes, nothing moves). Everything else: g-next-fade only */
      await page.evaluate(() => { window.__rm = new Set(); window.__fx = new Set(); const t = setInterval(() => document.getAnimations().forEach(a => {
        const tg = a.effect && a.effect.target, n = a.animationName || ("transition:" + a.transitionProperty);
        if (tg && tg.closest && tg.closest(".fx-ov")) window.__fx.add(n + "[" + [...new Set((a.effect.getKeyframes?.() || []).flatMap(k => Object.keys(k).filter(x => !["offset", "easing", "composite", "computedOffset"].includes(x))))].join(",") + "]");
        else window.__rm.add(n);
      }), 10); window.__rmt = t; });
      await close(page, type, "right", { code });
      await page.waitForSelector("#q .nx"); await page.waitForTimeout(900);
      const [names, fx] = await page.evaluate(() => { clearInterval(window.__rmt); return [[...window.__rm], [...window.__fx]]; });
      assert.deepEqual(names.filter(n => n !== "g-next-fade"), [], "motion besides the fade: " + names);
      assert.ok(names.includes("g-next-fade"), "no g-next-fade: " + names);
      assert.ok(fx.every(n => /\[opacity\]$/.test(n)), "reduced motion: a reward overlay moves (B2): " + fx);
      if (fx.length) console.log("      note (B2): reward drop overlay faded in under reduced motion: " + fx.join(" "));
    });
    await page.ctx.close();
  }
}

/* a restored question (reload): Next is there, still (no g-next-in), focus left alone */
{
  const page = await pageFor(browser, { mode: "sugar", W: 393, H: 852 }, "PHYS_TNM");
  await step("restore: a reloaded closed question shows Next in the slot, without the landing motion", async () => {
    await close(page, "num", "right", { code: "PHYS_TNM" }); await page.waitForSelector("#q .nx"); await stopSampler(page);
    await page.reload({ waitUntil: "load" });
    await page.waitForFunction(() => document.querySelector("#pcode")?.textContent === "PHYS_TNM");
    await page.waitForSelector("#q .nx", { timeout: 6000 });
    const g = await page.evaluate(() => ({ cls: document.querySelector("#q .nx").className, focus: document.activeElement?.matches?.(".nx") }));
    assert.ok(!/g-next/.test(g.cls), "a restore animates Next: " + g.cls);
    assert.equal(g.focus, false, "a restore stole focus");
  });
  await page.ctx.close();
}

await browser.close();
console.log(failures ? `\n${failures} FAILED` : "\nall next-cue checks passed");
process.exit(failures ? 1 : 0);
