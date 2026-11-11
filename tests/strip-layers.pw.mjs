// B3 PR-B1 answer strip, typed answers (num / expr / num with a graph / proof): the cabinet drawer under the answer bar.
// Ported from the mock's checks (brain mock-opus/strip/tests): overlap.js, drawer.js, drawer9.js, v9check2.js, lines.js, and run against the LIVE app.
//   overlap  an open drawer is never painted under later content (elementFromPoint at 4 points inside it)
//   drawer   layer order bar > drawer > later content (3px above the bar's bottom edge = the bar; 3 points inside the drawer = the drawer); the drawer is a
//            SIBLING of the bar, never a child; reflow 0 (opening / closing it moves nothing)
//   v9check2 44px targets, no cut label, drawer = 2/3 of the bar, right-aligned, tucked one radius under it, no Next inside (Next stays in the Check slot until PR-C)
//   lines    every border the strip draws is 1px; the drawer's edge is the neutral --line
//   motion   open 380ms, close 240ms on cubic-bezier(.32,.72,0,1); prefers-reduced-motion = a fade
//   duck     the sunrise duck is a status nudge: a tap only dismisses it (no Cluck, no callback); the drawer's Ask Cluck is the action
// The mock waits 500 ms (> the 380 ms slide; clip-path hides the drawer mid-slide). So does this spec: every check runs after SETTLE.
// Starts its own serve.py (static files); the bank and /check are routed.   node tests/strip-layers.pw.mjs [port] [shotDir]
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { skipRetryWait } from "./lib/clock.mjs";   // the second try waits 10 s (retry-wait.pw.mjs)
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { try { pw = require("/opt/node22/lib/node_modules/playwright"); } catch { pw = require("/opt/node-tools/node_modules/playwright"); } }
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = +(process.argv[2] || 8861), BASE = `http://localhost:${PORT}`;
const SHOTS = process.argv[3] || "";
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const srv = spawn("python3", [join(ROOT, "server", "http_server", "serve.py"), String(PORT)], { env: { ...process.env, OPENROUTER_API_KEY: "" }, stdio: "ignore" });
for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + "/")).ok) break; } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 100)); }
let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); } catch (e) { failures++; console.log("FAIL", name, "\n     ", String(e.message).slice(0, 900)); }
}
const SETTLE = 500;   // > the 380 ms drawer slide

const txt = md => [{ type: "text", md }];
const GRAPH = { type: "graph", kind: "cartesian", alt: "x(t) for a cart: a line through (0,1) and (4,9)", x: { min: -1, max: 5, label: "$t$" }, y: { min: -1, max: 10, label: "$x$" }, grid: true, axes: true, marks: [{ type: "fn", y: "2*x+1" }] };
const P = [
  { code: "STP_NUM", title: "Practice, Question 1", type: "num", unit: "s", how: "Number, in s", wish: true, body: txt("A ball drops from 45 m, from rest. How long until it lands?") },
  { code: "STP_EXP", title: "Practice, Question 2", type: "expr", how: "Use x in your answer", wish: true, body: txt("f(x) = x^2 + x. Write its derivative.") },
  { code: "STP_GRA", title: "Practice, Question 3", type: "num", how: "Number", wish: true, body: [...txt("Read the slope of the line."), GRAPH] },
  { code: "STP_PRF", title: "Practice, Question 4", type: "proof", how: "Write the base case, then what you assume for $k$, then prove it for $k+1$.", wish: true, body: txt("Prove 1 + 2 + ... + n = n(n+1)/2 for every n >= 1.") },
];
const RIGHT = { STP_NUM: "3.03", STP_EXP: "2x+1", STP_GRA: "2", STP_PRF: "OKPROOF" };
const WRONGV = { STP_NUM: "2", STP_EXP: "2x", STP_GRA: "3", STP_PRF: "nope" };
const BANK = "BANK_STRIP1";
async function pageFor(browser, W, H, o = {}) {
  const wide = W >= 1000;
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, hasTouch: !wide, isMobile: !wide, serviceWorkers: "block", reducedMotion: o.reduced ? "reduce" : "no-preference" });
  await ctx.addInitScript(spent => { try { localStorage.setItem("stem-ob", "done"); localStorage.setItem("stem-jev", "0"); for (const b of ["right", "miss", "three", "redo"]) localStorage.setItem("stem-ob-rw-" + b, "9"); if (spent) localStorage.setItem("stem-wish", JSON.stringify(Array(5).fill(Date.now()))); } catch { /* blocked */ } }, o.stream ? false : true);   // spent = this hour's 5 auto asks used: a wrong answer shows the Ask Cluck chip, not a streaming reply
  await ctx.addCookies([{ name: "stem-mode-v", value: "2", url: BASE }]);
  const page = await ctx.newPage(); page.ctx = ctx; page.setDefaultTimeout(8000);
  page.errs = []; page.on("pageerror", e => page.errs.push(String(e)));
  const tries = {};
  await page.route(`**/b/${BANK}.json`, r => r.fulfill({ json: { code: BANK, problems: P, marks: {}, at: "STP_NUM" } }));
  await page.route("**/state/**", r => r.fulfill({ status: 404, body: "{}" }));
  await page.route("**/explain", r => r.fulfill({ status: 200, contentType: "text/plain", body: "1. Step one\n$t = \\sqrt{2h/g}$" }));
  await page.route("**/check", r => {
    const b = r.request().postDataJSON(), code = b.code;
    if (b.answer === RIGHT[code]) return r.fulfill({ json: { verdict: "correct" } });
    tries[code] = (tries[code] || 0) + 1;
    const left = Math.max(0, 2 - tries[code]);
    return r.fulfill({ json: { verdict: "wrong", triesLeft: left, ...(code === "STP_PRF" ? { grade: "partial" } : {}), ...(left === 0 ? { correct: code === "STP_PRF" ? "Base. Assume. Prove." : RIGHT[code] } : {}) } });
  });
  await page.goto(`${BASE}/#${BANK}`, { waitUntil: "load" });
  await page.waitForFunction(() => document.querySelector("#pcode")?.textContent === "STP_NUM", null, { timeout: 10000 });
  await page.waitForFunction(() => !document.querySelector("#qnav").hidden, null, { timeout: 6000 });
  await page.waitForTimeout(400);
  return page;
}
/* walk to question n by the bar's own Next (nav.js go(1)): the queue order is the bank order */
async function goTo(page, code) {
  for (let i = 0; i < 6 && (await page.textContent("#pcode")) !== code; i++) {
    await page.evaluate(() => document.querySelector("#qnext").click());
    await page.waitForTimeout(500);
  }
  assert.equal(await page.textContent("#pcode"), code);
  await page.waitForSelector("#ff");
}
const fieldSel = "#ans";
async function submit(page, v) {
  await skipRetryWait(page);
  await page.fill(fieldSel, v);
  await page.evaluate(() => document.querySelector("#ansGo").click());
}
/* drive one question to a state: wrong (1 try left), then out (the second miss, same page), or right (a page of its own) */
async function reach(page, code, state) {
  if (state !== "out") await goTo(page, code);
  if (state === "out") { await skipRetryWait(page); await page.fill(fieldSel, WRONGV[code] + "0"); await page.evaluate(() => document.querySelector("#ansGo").click()); await page.waitForSelector("#q.closed"); }
  else if (state === "wrong") { await submit(page, WRONGV[code]); await page.waitForFunction(() => window.__drill.state.tries.length >= 1); }
  else { await submit(page, RIGHT[code]); await page.waitForSelector("#q.closed"); }
  await page.waitForTimeout(SETTLE + 300);
}
const geo = page => page.evaluate(() => {
  const R = e => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
  const bar = document.querySelector("#ff"), d = document.querySelector("#q .vdrawer");
  return { bar: R(bar), d: d && !d.hidden && getComputedStyle(d).display !== "none" ? R(d) : null };
});

const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
const TYPES = [["STP_NUM", "num"], ["STP_EXP", "expr"], ["STP_GRA", "graph"], ["STP_PRF", "proof"]];
const VPS = [[360, 740], [390, 844], [1280, 800]].filter(v => !process.env.SL_W || v[0] === +process.env.SL_W);   // SL_W=390: one width (quick mutation runs)
for (const [W, H] of VPS) {
  for (const [code, kind] of TYPES) {
   if (W === 360 && kind !== "num" && kind !== "proof") continue;   // 360 is the narrowest bar (Next beside it): num + proof cover it; the rest run at 390 + 1280
   let pg = null;
   for (const state of ["wrong", "out", "right"]) {
    const T = `${W} ${kind} ${state}`;
    // wrong then out share a page (the second miss closes it); right needs a fresh question
    if (state !== "out") { if (pg) await pg.ctx.close(); pg = await pageFor(browser, W, H); }
    await reach(pg, code, state);
    if (kind === "proof" && state === "wrong") {   // a proof wrong with a try left has no verdict mark on its bar (the rubric chips carry it): no drawer to hang from
      await step(`${T}: no verdict mark on the bar, so no drawer (the rubric chips and Cluck's chip stay as they are)`, async () => {
        assert.equal((await geo(pg)).d, null); assert.ok(await pg.isVisible("#rubric"), "rubric chips");
      });
      continue;
    }
    const g = await geo(pg);
    await step(`${T}: the drawer is open after the verdict, a SIBLING of the bar (never a child)`, async () => {
      assert.ok(g.d, "no open drawer after the verdict");
      const rel = await pg.evaluate(() => { const bar = document.querySelector("#ff"), d = document.querySelector("#q .vdrawer"); return { child: bar.contains(d), sib: d.parentElement === bar.parentElement, nest: d.parentElement.closest("#ff") }; });
      assert.ok(!rel.child && rel.sib && !rel.nest, JSON.stringify(rel));
    });
    if (!g.d) continue;
    await step(`${T}: overlap: 4 points inside the open drawer are the drawer, not later content`, async () => {
      const out = await pg.evaluate(() => {
        const t = document.querySelector("#q .vdrawer"), bad = [];
        t.scrollIntoView({ block: "center" });
        const a = t.getBoundingClientRect();
        for (const [fx, fy] of [[.1, .85], [.5, .85], [.9, .85], [.5, .5]]) {
          const e = document.elementFromPoint(a.left + a.width * fx, a.top + a.height * fy);
          if (!e || !t.contains(e)) bad.push(fx + "," + fy + "=" + (e ? e.className || e.tagName : "null"));
        }
        return bad;
      });
      assert.deepEqual(out, [], "later content over the drawer");
    });
    await step(`${T}: drawer: 3px above the bar's bottom edge is the bar; inside the drawer is the drawer`, async () => {
      const out = await pg.evaluate(() => {
        const t = document.querySelector("#q .vdrawer"), bar = document.querySelector("#ff"), bad = [];
        t.scrollIntoView({ block: "center" });
        const f = bar.getBoundingClientRect(), a = t.getBoundingClientRect();
        const e1 = document.elementFromPoint(a.left + a.width * .5, f.bottom - 3);
        if (!e1 || t.contains(e1)) bad.push("drawer over bar");
        for (const fx of [.1, .5, .9]) { const e = document.elementFromPoint(a.left + a.width * fx, a.top + a.height * .8); if (!e || !t.contains(e)) bad.push("content over drawer=" + (e && e.className)); }
        return bad;
      });
      assert.deepEqual(out, []);
    });
    await step(`${T}: shape: 2/3 of the bar (wider only when the label needs it), right-aligned, top tucked 2px behind the bar bottom edge, over everything below (Tony, Nov 5)`, async () => {
      assert.ok(g.d.w >= g.bar.w * 2 / 3 - 1.5 && g.d.w <= g.bar.w + 0.5, `drawer ${g.d.w} vs 2/3 of ${g.bar.w}`);
      if (W >= 1000) assert.ok(Math.abs(g.d.w - g.bar.w * 2 / 3) <= 1.5, `at ${W} the label fits in 2/3: drawer ${g.d.w} vs ${g.bar.w * 2 / 3}`);
      assert.ok(Math.abs(g.d.r - g.bar.r) <= 1, `right edges ${g.d.r} vs ${g.bar.r}`);
      assert.ok(g.d.t >= g.bar.b - 8 && g.d.t <= g.bar.b + 2, `top ${g.d.t} vs bar bottom ${g.bar.b} (-8..+2: tucked behind the bar border, never below it)`);
    });
    await step(`${T}: contents: Ask Cluck + a 44px+ close, full words, nothing cut, no Next inside`, async () => {
      const c = await pg.evaluate(() => {
        const d = document.querySelector("#q .vdrawer"), chip = d.querySelector(".wchip"), x = d.querySelector(".vd-x");
        const r = e => { const b = e.getBoundingClientRect(); return { w: b.width, h: b.height }; };
        const lab = chip && chip.querySelector("span");
        return { chip: chip && r(chip), x: x && r(x), cut: chip ? chip.scrollWidth > chip.clientWidth + 1 : null, text: chip && chip.textContent.trim(), nx: !!d.querySelector(".nx"), btns: d.querySelectorAll("button").length,
          inside: chip && (() => { const a = d.getBoundingClientRect(), b = chip.getBoundingClientRect(); return b.left >= a.left - 0.5 && b.right <= a.right + 0.5; })(), lab: !!lab };
      });
      assert.ok(c.chip && c.x, "chip + close"); assert.ok(c.chip.h >= 44 && c.x.h >= 44 && c.x.w >= 44, JSON.stringify(c));
      assert.ok(!c.cut && c.inside, "label cut / chip outside the drawer: " + JSON.stringify(c)); assert.ok(!c.nx, "Next must not live in the drawer (it stays in the Check slot until PR-C)");
      assert.equal(state === "wrong" ? /Ask Cluck/.test(c.text) : /See steps|Ask Cluck/.test(c.text), true, "label: " + c.text);
    });
    await step(`${T}: lines: every border the strip draws is 1px; the drawer's edge is the neutral --line`, async () => {
      const l = await pg.evaluate(() => {
        const out = [], d = document.querySelector("#q .vdrawer"), tok = document.createElement("i"); tok.style.color = "var(--line)"; document.body.append(tok); const line = getComputedStyle(tok).color; tok.remove();
        for (const e of [document.querySelector("#ff"), d, d.querySelector(".wchip"), d.querySelector(".vd-x")]) {
          const cs = getComputedStyle(e);
          for (const s of ["Top", "Right", "Bottom", "Left"]) { const w = parseFloat(cs["border" + s + "Width"]); if (w > 0 && w !== 1) out.push(`${e.className} ${s} ${w}px`); }
        }
        const cs = getComputedStyle(d);
        return { out, edge: cs.borderBottomColor, line, left: cs.borderLeftColor, bw: cs.borderBottomWidth, bs: cs.borderBottomStyle };
      });
      assert.deepEqual(l.out, []); assert.equal(l.edge, l.line, "drawer edge colour"); assert.equal(l.left, l.line); assert.equal(l.bw, "1px"); assert.equal(l.bs, "solid");
    });
    await step(`${T}: reflow 0: closing the drawer moves nothing (field, card, the line under it)`, async () => {
      const m = () => pg.evaluate(() => { const t = s => { const e = document.querySelector(s); return e ? Math.round(e.getBoundingClientRect().top + scrollY) : null; };
        return { ff: t("#ff"), pv: t("#preview"), q: Math.round(document.querySelector("#q").getBoundingClientRect().height), nx: t("#q .nx"), fb: t("#fb"), wish: t("#wish") }; });
      const a = await m();
      await pg.click("#q .vdrawer .vd-x"); await pg.waitForTimeout(SETTLE);
      const b = await m();
      assert.deepEqual(b, a, "something moved when the drawer closed");
      assert.equal((await geo(pg)).d, null, "the drawer is still showing after close");
      assert.equal(await pg.evaluate(() => document.activeElement && document.activeElement.matches("#ff .vk")), true, "focus returns to the verdict icon");
    });
    await step(`${T}: the verdict icon reopens it (aria-expanded), Esc closes it, a tap outside closes it, focus returns to the icon`, async () => {
      const vk = "#ff .vk";
      assert.equal(await pg.getAttribute(vk, "aria-expanded"), "false");
      await pg.click(vk); await pg.waitForTimeout(SETTLE);
      assert.ok((await geo(pg)).d, "icon did not reopen"); assert.equal(await pg.getAttribute(vk, "aria-expanded"), "true");
      await pg.keyboard.press("Escape"); await pg.waitForTimeout(SETTLE);
      assert.equal((await geo(pg)).d, null, "Esc did not close");
      await pg.click(vk); await pg.waitForTimeout(SETTLE);
      await pg.mouse.click(5, 5); await pg.waitForTimeout(SETTLE);
      assert.equal((await geo(pg)).d, null, "an outside tap did not close");
    });
    if (SHOTS && state !== "right") { await pg.click("#ff .vk"); await pg.waitForTimeout(SETTLE); await pg.screenshot({ path: `${SHOTS}/${kind}-${state}-${W}.png` }); }
    assert.deepEqual(pg.errs, [], "page errors");
   }
   if (pg) await pg.ctx.close();
  }
}

/* motion: the live drawer's computed animation (read mid-flight, so the class is on) */
await step("motion: open 380ms and close 240ms on the iOS sheet curve; reduced motion = none (Tony Nov 2: no fade at all)", async () => {
  for (const reduced of [false, true]) {
    const pg = await pageFor(browser, 390, 844, { reduced });
    await goTo(pg, "STP_NUM"); await submit(pg, "2");
    await pg.waitForSelector("#q .vdrawer");
    const open = await pg.evaluate(() => { const d = document.querySelector("#q .vdrawer"), cs = getComputedStyle(d); return { n: cs.animationName, d: cs.animationDuration, f: cs.animationTimingFunction }; });
    await pg.waitForTimeout(SETTLE);
    await pg.click("#q .vdrawer .vd-x");
    const shut = await pg.evaluate(() => { const d = document.querySelector("#q .vdrawer"), cs = getComputedStyle(d); return { n: cs.animationName, d: cs.animationDuration, f: cs.animationTimingFunction, hid: d.hidden }; });
    if (!reduced) {
      assert.equal(open.d, "0.38s"); assert.equal(open.f, "cubic-bezier(0.32, 0.72, 0, 1)"); assert.match(open.n, /vd-out/);
      assert.equal(shut.d, "0.24s"); assert.match(shut.n, /vd-in/);
    } else {
      assert.equal(open.n, "none", "reduced motion: no fade, no slide, the drawer just appears: " + JSON.stringify(open));
      assert.ok(!/vd-out|vd-in/.test(shut.n), "reduced motion close must not slide: " + JSON.stringify(shut));
    }
    await pg.ctx.close();
  }
});

await step("a reward overlay still playing (a level-up burst): the drawer opens at rest, no slide (one animation group at a time, blink-fx)", async () => {
  const pg = await pageFor(browser, 390, 844);
  await goTo(pg, "STP_NUM");
  await pg.evaluate(() => { const o = document.createElement("div"); o.className = "fx-ov fx-levelup"; o.style.cssText = "position:fixed;left:0;top:0;width:1px;height:1px;pointer-events:none"; document.body.append(o); });
  await submit(pg, "2");
  await pg.waitForSelector("#q .vdrawer");
  const n = await pg.evaluate(() => getComputedStyle(document.querySelector("#q .vdrawer")).animationName);
  assert.equal(n, "none", "the drawer slid while an overlay played: " + n);
  await pg.evaluate(() => document.querySelector(".fx-ov").remove());
  await pg.ctx.close();
});

/* doneExit's 900 ms beat blurs the active element after a right answer; it must leave the strip's own focus (verdict icon, drawer) alone.
   Before: a close (or Esc) inside the beat put focus on the icon and the beat then blurred it (CI flake of "focus returns", PR #382 x #381). */
await step("right answer: focus put on the verdict icon inside doneExit's beat survives it", async () => {
  const pg = await pageFor(browser, 390, 844);
  await goTo(pg, "STP_NUM"); await submit(pg, RIGHT.STP_NUM); await pg.waitForSelector("#q.closed");
  await pg.evaluate(() => document.querySelector("#ff .vk").focus());
  await pg.waitForTimeout(1300);
  assert.equal(await pg.evaluate(() => document.activeElement && document.activeElement.matches("#ff .vk")), true, "the beat blurred the verdict icon");
  await pg.ctx.close();
});

/* the status nudge: the sunrise duck is not an action. A tap only dismisses it; Ask Cluck in the drawer is the action */
await step("duck: a tap on the sunrise duck only dismisses it (Cluck stays closed, no callback); Jev's away path runs", async () => {
  const pg = await pageFor(browser, 390, 844);
  await pg.evaluate(() => { window.__tap = 0; window.__away = 0; document.documentElement.classList.add("sugar"); });
  const rose = await pg.evaluate(() => window.stemDuck.say("Need a hand?", { onTap: () => { window.__tap++; }, onAway: () => { window.__away++; } }));
  assert.equal(rose, true, "the duck did not rise");
  await pg.waitForTimeout(SETTLE);
  assert.equal(await pg.evaluate(() => window.stemDuck.up), true);
  const label = await pg.getAttribute(".ck-peek", "aria-label");
  assert.match(label, /dismiss/i, "the only action is dismiss, say so: " + label);
  await pg.click(".ck-peek"); await pg.waitForTimeout(SETTLE + 400);
  assert.equal(await pg.evaluate(() => window.stemDuck.up), false, "the tap must dismiss the duck");
  assert.equal(await pg.evaluate(() => window.stemCluckOpen()), false, "the duck must not open Cluck");
  assert.equal(await pg.evaluate(() => window.__tap), 0, "the duck must not run the action callback");
  assert.equal(await pg.evaluate(() => window.__away), 1, "a dismissal is the 'put away' path (Jev backs off)");
  await pg.ctx.close();
});

/* Cluck's reply already streaming (the auto ask went out): GENMISS (Tony, Nov 3, "a tray with the cluck button ONLY"): the tray carries Ask Cluck, no hint-card peek / "okay, but how?" */
await step("Cluck's reply already streaming: the tray's Ask Cluck is the only Cluck entry (no peek), no page error", async () => {
  const pg = await pageFor(browser, 390, 844, { stream: true });
  await goTo(pg, "STP_NUM"); await submit(pg, "2");
  await pg.waitForFunction(() => window.__drill.state.tries.length >= 1); await pg.waitForTimeout(SETTLE + 600);
  const g = await pg.evaluate(() => ({ tray: !!document.querySelector("#q .vdrawer:not([hidden]) .wchip"), peek: !!document.querySelector(".cl-peek, .cl-cta") }));
  assert.deepEqual(g, { tray: true, peek: false });
  assert.deepEqual(pg.errs, []); await pg.ctx.close();
});

/* diet / no Cluck key: nothing changes (no drawer, no wash) */
await step("a question without Cluck's key has no drawer and no wash", async () => {
  const pg = await pageFor(browser, 390, 844);
  await goTo(pg, "STP_NUM");
  await pg.evaluate(() => { window.__drill.state.prob.wish = false; });
  await submit(pg, "2"); await pg.waitForFunction(() => window.__drill.state.tries.length >= 1); await pg.waitForTimeout(SETTLE);
  assert.equal(await pg.evaluate(() => !!document.querySelector("#q .vdrawer:not([hidden])")), false);
  await pg.ctx.close();
});

await browser.close();
srv.kill();
console.log(failures ? `${failures} FAIL` : "all ok");
process.exit(failures ? 1 : 0);
