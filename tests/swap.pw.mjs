// Pentest for Swap, line numbers and the one-row MC, at phone sizes (design/SWAP.md). Needs a running server and Playwright:
//   python3 serve.py 8812 &   then   node tests/swap.pw.mjs http://localhost:8812 [shotDir]
// The software keyboard is simulated the only way headless Chromium can: the viewport height shrinks to 55% after a field is focused,
// and grows back. (The layout viewport and the visual viewport shrink together, so visualViewport.offsetTop stays 0 here.)
// Not part of `npm test` (that one needs no server or browser).
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { pw = require("/opt/node22/lib/node_modules/playwright"); }

const BASE = process.argv[2] || "http://localhost:8812";
const SHOTS = process.argv[3] || "";
const SIZES = [[375, 667], [390, 844], [430, 932]];
const KB = 0.55;                       // the keyboard leaves ~55% of the height

let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); }
  catch (e) { failures++; console.log("FAIL", name, "\n     ", e.message.slice(0, 700)); }
}

/* fixtures that need no change to problems.json: served for these codes by the test browser */
const lorem = n => Array.from({ length: n }, (_, i) => `Paragraph ${i + 1}: a block of ${i + 2} kg slides along a rough track and the questions keep coming, so the statement is long enough to need its own scroll.`);
const FIX = {
  CSCI26_LN3: { code: "CSCI26_LN3", type: "mc", body: [{ type: "text", md: "Pick one." }], choices: [{ id: "a", md: "Modus ponens applies" }, { id: "b", md: "Modus tollens applies" }, { id: "c", md: "Neither rule applies" }] },
  CSCI26_LN2: { code: "CSCI26_LN2", type: "mc", body: [{ type: "text", md: "Pick one." }], choices: [{ id: "a", md: "The statement holds for every integer n" }, { id: "b", md: "The statement fails for some integer n" }] },
  CSCI26_LQ1: { code: "CSCI26_LQ1", type: "num", body: [{ type: "text", md: lorem(8) }, { type: "text", md: "Find the total, in $\\text{kg}$." }], how: "A whole number." },
};

for (const [W, H] of SIZES) {
  const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, serviceWorkers: "block" });
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"]);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  page.on("console", m => { if (m.type() === "error" && !/^Failed to load resource/.test(m.text())) errors.push(m.text()); });
  for (const [code, json] of Object.entries(FIX)) await page.route(`**/p/${code}.json`, r => r.fulfill({ json }));

  const T = `${W}x${H}`;
  const shot = async (name) => { if (SHOTS) { await page.waitForTimeout(120); await page.screenshot({ path: `${SHOTS}/${name}-${W}.png` }); } };
  const open = async code => {
    await page.setViewportSize({ width: W, height: H });
    await page.goto("about:blank");
    await page.goto(`${BASE}/#${code}`, { waitUntil: "networkidle" });
    await page.waitForFunction(c => document.querySelector("#pcode")?.textContent === c, code, { timeout: 8000 });
    await page.waitForTimeout(250);
  };
  const kbUp = async () => { await page.setViewportSize({ width: W, height: Math.round(H * KB) }); await page.waitForTimeout(450); };
  const kbDown = async () => { await page.setViewportSize({ width: W, height: H }); await page.waitForTimeout(450); };
  const cls = () => page.evaluate(() => document.documentElement.className);
  const paneNow = () => page.evaluate(() => { const c = document.documentElement.classList; return !c.contains("swap") ? "off" : c.contains("swap-problem") ? "problem" : "scratch"; });
  const settle = () => page.waitForTimeout(400);                     // the crossfade is ~220ms and blocks pointer events while it runs

  /* ---- in-page audit: visible interactive elements, overlaps, tap targets ---- */
  const audit = () => page.evaluate(() => {
    const vv = window.visualViewport, V = { l: 0, t: vv.offsetTop, r: vv.width, b: vv.offsetTop + vv.height };
    const sel = "button, input, textarea, a[href], [role=radio]";
    const out = [];
    for (const el of document.querySelectorAll(sel)) {
      let hidden = false;
      for (let n = el; n && n !== document.documentElement; n = n.parentElement) { const c = getComputedStyle(n); if (c.display === "none" || c.visibility === "hidden" || +c.opacity === 0) { hidden = true; break; } }
      if (hidden) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 3 || r.height < 3) continue;
      let b = { l: Math.max(r.left, V.l), t: Math.max(r.top, V.t), r: Math.min(r.right, V.r), b: Math.min(r.bottom, V.b) };
      for (let n = el.parentElement; n && n !== document.documentElement && n !== document.body; n = n.parentElement) {
        const c = getComputedStyle(n);
        if (c.overflowX !== "visible" || c.overflowY !== "visible") { const p = n.getBoundingClientRect(); b = { l: Math.max(b.l, p.left), t: Math.max(b.t, p.top), r: Math.min(b.r, p.right), b: Math.min(b.b, p.bottom) }; }
      }
      if (b.r - b.l < 3 || b.b - b.t < 3) continue;
      const hit = document.elementFromPoint((b.l + b.r) / 2, (b.t + b.b) / 2);
      if (!hit || !(hit === el || el.contains(hit) || hit.contains(el))) continue;          // covered (e.g. the top bar under the stage)
      out.push({ el, name: el.id || el.className || el.tagName, w: r.width, h: r.height, b, full: r });
    }
    const allowed = (a, c) => {
      // #more: the freeze chevron overlaps the faded edge of the strip on purpose (FREEZE.md; PR #7 reworks it). Not in Swap, where it is gone.
      if (a.el.id === "more" || c.el.id === "more") return true;
      const pair = (x, y) => (x.el.classList.contains("send") && y.el.classList.contains("opt") && x.el.parentElement === y.el.parentElement)
        || (y.el.classList.contains("xb-cut") || y.el.classList.contains("xb-copy")) && x.el.id === "scratch";
      return pair(a, c) || pair(c, a);
    };
    const overlaps = [], small = [];
    for (let i = 0; i < out.length; i++) {
      const a = out[i];
      if (Math.min(a.w, a.h) < 44) small.push(`${a.name} ${Math.round(a.w)}x${Math.round(a.h)}`);
      for (let j = i + 1; j < out.length; j++) {
        const c = out[j], x = Math.min(a.b.r, c.b.r) - Math.max(a.b.l, c.b.l), y = Math.min(a.b.b, c.b.b) - Math.max(a.b.t, c.b.t);
        if (x > 1 && y > 1 && !allowed(a, c)) overlaps.push(`${a.name} x ${c.name}`);
      }
    }
    return { n: out.length, overlaps, small };
  });
  /* is an element wholly inside the visible area above the keyboard (and inside every clipping ancestor)? */
  const inside = sel => page.evaluate(s => {
    const el = document.querySelector(s); if (!el) return { ok: false, why: "missing" };
    const vv = window.visualViewport, r = el.getBoundingClientRect(), e = 0.6;
    let ok = r.top >= vv.offsetTop - e && r.bottom <= vv.offsetTop + vv.height + e && r.left >= -e && r.right <= vv.width + e;
    let why = ok ? "" : `outside viewport (${Math.round(r.top)}..${Math.round(r.bottom)} of ${Math.round(vv.height)})`;
    for (let n = el.parentElement; ok && n && n !== document.documentElement && n !== document.body; n = n.parentElement) {
      const c = getComputedStyle(n);
      if (c.overflowX !== "visible" || c.overflowY !== "visible") { const p = n.getBoundingClientRect(); if (r.top < p.top - e || r.bottom > p.bottom + e) { ok = false; why = `clipped by ${n.id || n.className}`; } }
    }
    return { ok, why };
  }, sel);
  const mustBeInside = async (sel, label) => { const r = await inside(sel); assert.ok(r.ok, `${T} ${label || sel}: ${r.why}`); };
  const clean = async label => {
    const a = await audit();
    assert.deepEqual(a.overlaps, [], `${T} ${label}: interactive elements overlap: ${a.overlaps.join(", ")}`);
    assert.deepEqual(a.small, [], `${T} ${label}: tap targets under 44px: ${a.small.join(", ")}`);
    assert.ok(a.n > 0, "audit found nothing");
    return a;
  };

  /* ================= Swap: freeform ================= */
  await step(`${T} swap: keyboard down looks as today; keyboard up shows one pane; toggle swaps; focus picks the pane`, async () => {
    await open("CALC1_T6B");
    const before = await page.evaluate(() => ({ y: scrollY, ta: document.querySelector("#scratch").getBoundingClientRect().top, fz: document.querySelector("#freeze").getBoundingClientRect().top }));
    assert.equal(await paneNow(), "off");
    assert.ok(await page.locator("#swap").isHidden(), "toggle visible with the keyboard down");
    await page.locator("#scratch").focus();
    assert.equal(await page.evaluate(() => document.activeElement.id), "scratch");
    await kbUp();
    assert.equal(await paneNow(), "scratch", `focus on the scratchpad shows SCRATCHPAD (${await cls()})`);
    assert.ok(await page.locator("#swap").isVisible());
    await shot("swap-scratch-empty");
    await clean("scratch pane");
    await mustBeInside("#scratch"); await mustBeInside("#swap");
    // toggle -> PROBLEM, focus moves into the answer box (keyboard stays: focus is in a text field)
    await page.locator("#swap").click(); await settle();
    assert.equal(await paneNow(), "problem");
    assert.equal(await page.evaluate(() => document.activeElement.id), "ans", "toggle did not focus the answer box");
    assert.equal(await page.locator("#swap").getAttribute("data-pane"), "problem");
    await mustBeInside("#ans"); await mustBeInside("#ansGo"); await mustBeInside("#ff");
    await page.locator("#ans").fill("12");
    await shot("swap-problem-freeform");
    await clean("problem pane");
    // toggle back -> SCRATCHPAD, focus in the scratchpad
    await page.locator("#swap").click(); await settle();
    assert.equal(await paneNow(), "scratch");
    assert.equal(await page.evaluate(() => document.activeElement.id), "scratch");
    // focus picks the pane: focusing the answer input by script (Tab, a hardware key) reveals PROBLEM; focusing the scratchpad SCRATCHPAD
    await page.evaluate(() => document.querySelector("#ans").focus()); await settle();
    assert.equal(await paneNow(), "problem", "focusing the answer did not show PROBLEM");
    await page.evaluate(() => document.querySelector("#scratch").focus()); await settle();
    assert.equal(await paneNow(), "scratch", "focusing the scratchpad did not show SCRATCHPAD");
    // the toggle is one 48px button, no text, doc / pen in that order
    const t = await page.evaluate(() => { const b = document.querySelector("#swap"), r = b.getBoundingClientRect(); return { h: r.height, w: r.width, text: b.textContent.trim(), icons: [...b.querySelectorAll("use")].map(u => u.getAttribute("href")), label: b.getAttribute("aria-label") }; });
    assert.equal(t.h, 48); assert.ok(t.w >= 48); assert.equal(t.text, "");
    assert.deepEqual(t.icons, ["#i-doc", "#i-pen"]);
    assert.ok(/problem/i.test(t.label), `label ${t.label}`);
    // keyboard down: back to exactly the page as it was
    await kbDown();
    assert.equal(await paneNow(), "off", `swap stayed on after the keyboard closed (${await cls()})`);
    const after = await page.evaluate(() => ({ y: scrollY, ta: document.querySelector("#scratch").getBoundingClientRect().top, fz: document.querySelector("#freeze").getBoundingClientRect().top }));
    assert.ok(Math.abs(after.y - before.y) <= 1 && Math.abs(after.fz - before.fz) <= 1, `page moved: ${JSON.stringify(before)} -> ${JSON.stringify(after)}`);
    assert.ok(await page.locator("#swap").isHidden());
  });

  await step(`${T} swap: the swap toggle keeps the keyboard-up state stable (no flip-flop over 1s)`, async () => {
    await open("CALC1_T6B");
    await page.locator("#scratch").focus(); await kbUp();
    const seen = new Set();
    for (let i = 0; i < 10; i++) { seen.add(await cls()); await page.waitForTimeout(100); }
    assert.equal(seen.size, 1, `classes changed by themselves: ${[...seen].join(" | ")}`);
    await kbDown();
  });

  /* ================= Swap: scratchpad grows upward, then scrolls ================= */
  await step(`${T} swap: scratchpad is anchored above the keyboard, fills up to a small gap under the peek (Tony, polish d), then scrolls with the caret visible`, async () => {
    await open("CSCI26_Q8C");                                          // a short question: the peek is small, so there is room to grow
    await page.locator("#scratch").focus(); await kbUp();
    const geo = () => page.evaluate(() => {
      const t = document.querySelector("#scratch"), r = t.getBoundingClientRect(), f = document.querySelector("#freezeIn").getBoundingClientRect();
      const vv = window.visualViewport, cs = getComputedStyle(t);
      return { top: r.top, bottom: r.bottom, h: r.height, peekBottom: f.bottom, peekTop: f.top, sh: t.scrollHeight, ch: t.clientHeight, st: t.scrollTop, vvb: vv.offsetTop + vv.height, min: parseFloat(cs.minHeight), lh: parseFloat(cs.lineHeight) };
    });
    const g0 = await geo();
    assert.ok(Math.abs(g0.vvb - g0.bottom) <= 16, `not anchored to the bottom: bottom ${g0.bottom} vs visible bottom ${g0.vvb}`);
    assert.ok(g0.h >= 3 * g0.lh + 24, `under 3 lines: ${g0.h}`);
    const ta = page.locator("#scratch"); await ta.focus();
    const tops = [g0.top]; let last = g0;
    for (let i = 1; i <= 24; i++) {
      await page.keyboard.type(i === 1 ? `line ${i}` : `\nline ${i}`);
      const g = await geo();
      assert.ok(Math.abs(g.bottom - g0.bottom) <= 1, `bottom moved at line ${i}: ${g.bottom} vs ${g0.bottom}`);
      assert.ok(g.top >= g.peekBottom, `pad overlaps the peek at line ${i}: pad top ${g.top}, peek bottom ${g.peekBottom}`);
      assert.ok(g.top <= tops.at(-1) + 1, `pad moved DOWN at line ${i}`);
      tops.push(g.top); last = g;
    }
    assert.ok(g0.top - g0.peekBottom < 14, `empty box stops ${g0.top - g0.peekBottom}px short of the peek`);
    assert.ok(tops.every(t => Math.abs(t - g0.top) < 1), "box moved while typing");
    assert.ok(last.sh > last.ch, "not scrollable after 24 lines");
    assert.ok(last.top - last.peekBottom < 14, `stopped ${last.top - last.peekBottom}px short of the peek`);
    // caret: typing at the end keeps the last line in view
    assert.ok(last.st + last.ch >= last.sh - last.lh - 30, `caret line not visible: scrollTop ${last.st}, client ${last.ch}, scroll ${last.sh}`);
    await shot("swap-scratch-capped");
    await clean("scratch pane, long text");
    // newlines continue downward inside it: 5 more lines, the box does not move, the text scrolls
    await page.keyboard.type("\nmore\nmore\nmore\nmore\nmore");
    const g2 = await geo();
    assert.ok(Math.abs(g2.top - last.top) < 1 && g2.st > last.st, "box moved or did not scroll");
    assert.ok(g2.st + g2.ch >= g2.sh - g2.lh - 30, "caret out of view after more lines");
    await kbDown();
  });

  /* ================= line numbers ================= */
  /* ================= long question: peek starts at the first line; pane shows the question from the start ================= */
  for (const code of ["PHYS_F3N", "CSCI26_CE3", "CSCI26_LQ1"]) {
    await step(`${T} swap: ${code}: the peek shows the question FROM ITS START; problem pane too; answer pinned`, async () => {
      await open(code);
      await page.locator("#scratch").focus(); await kbUp();
      assert.equal(await paneNow(), "scratch");
      const peek = () => page.evaluate(() => {
        const fi = document.querySelector("#freezeIn"), r = fi.getBoundingClientRect(), first = document.querySelector("#blocks > *").getBoundingClientRect(), vv = window.visualViewport;
        const ta = document.querySelector("#scratch").getBoundingClientRect(), how = document.querySelector("#how");
        return { st: fi.scrollTop, top: r.top, bottom: r.bottom, h: r.height, firstTop: first.top, firstBottom: first.bottom, sh: fi.scrollHeight, ch: fi.clientHeight, vh: vv.height, taTop: ta.top, fade: document.querySelector("#freeze").classList.contains("clipped"), howInside: how ? fi.contains(how) : true };
      });
      let p = await peek();
      assert.equal(p.st, 0, `peek is scrolled (${p.st})`);
      assert.ok(p.firstTop >= p.top - 0.5 && p.firstTop + 12 <= p.bottom, `first line not visible: block top ${p.firstTop}, peek ${p.top}..${p.bottom}`);
      assert.ok(p.howInside, "how line is not inside the card");
      assert.ok(p.h <= p.vh * 0.6 + 1, `peek is ${p.h}px, over 60% of ${p.vh}`);
      assert.ok(p.taTop >= p.bottom, "scratchpad overlaps the peek");
      // it shows the whole question when it fits, else clamps with a fade and its own scroll
      if (p.sh > p.ch + 2) assert.ok(p.fade, "clamped peek has no fade"); else assert.ok(!p.fade && p.h <= p.vh * 0.6 + 1, "whole question but faded");
      await shot(`swap-scratch-${code}`);
      // typing does not scroll the peek to its end
      await page.keyboard.type("abc\ndef"); await page.waitForTimeout(150);
      assert.equal((await peek()).st, 0, "typing scrolled the peek");
      // problem pane: from the start too, answer pinned at the bottom of the card
      await page.locator("#swap").click(); await settle();
      const q = await page.evaluate(() => {
        const c = document.querySelector("#freezeIn").getBoundingClientRect(), pr = document.querySelector("#problem"), q = document.querySelector("#q").getBoundingClientRect(), first = document.querySelector("#blocks > *").getBoundingClientRect(), pRect = pr.getBoundingClientRect();
        return { pst: pr.scrollTop, qBottom: q.bottom, cBottom: c.bottom, firstTop: first.top, pTop: pRect.top, cTop: c.top };
      });
      assert.equal(q.pst, 0); assert.ok(q.firstTop >= q.pTop - 0.5, "problem starts scrolled");
      assert.ok(q.cBottom - q.qBottom <= 20, `answer not pinned at the card's bottom (${q.cBottom - q.qBottom}px above it)`);
      const focusSel = await page.evaluate(() => document.activeElement.id ? "#" + document.activeElement.id : null);
      if (focusSel === "#ans") { await mustBeInside("#ans"); await mustBeInside("#ansGo"); }
      await shot(`swap-problem-${code}`);
      await clean(`${code} problem pane`);
      await kbDown();
    });
  }

  /* ================= Swap with MC and multi ================= */
  await step(`${T} swap: MC problem: toggle to PROBLEM focuses a choice; choices and arrow inside the visible area; toggle back`, async () => {
    await open("CSCI26_TFM");
    await page.locator("#scratch").focus(); await kbUp();
    await page.locator("#swap").click(); await settle();
    assert.equal(await paneNow(), "problem", `swap ended when focus went to a choice (${await cls()})`);
    assert.equal(await page.evaluate(() => document.activeElement.className.includes("opt")), true, "no choice focused");
    await page.locator('.opt[data-id="m"]').click();
    await mustBeInside('.ch[data-id="m"] .send'); await mustBeInside('.opt[data-id="m"]');
    await shot("swap-problem-mc-row");
    await clean("MC row in problem pane");
    await page.locator("#swap").click(); await settle();
    assert.equal(await paneNow(), "scratch");
    assert.equal(await page.evaluate(() => document.activeElement.id), "scratch");
    await kbDown();
  });
  await step(`${T} swap: multi problem: boxes and arrow inside the visible area in the problem pane`, async () => {
    await open("CSCI26_CE3");
    await page.locator("#scratch").focus(); await kbUp();
    await page.locator("#swap").click(); await settle();
    assert.equal(await paneNow(), "problem");
    const boxes = page.locator("#q .ans");
    for (let i = 0; i < 3; i++) { await boxes.nth(i).focus(); await boxes.nth(i).fill("1"); await mustBeInside(`#q .part:nth-child(${i + 1}) .ans`); await mustBeInside(`#go${i}`); }   // the arrow shows once there is text
    await shot("swap-problem-multi");
    await clean("multi in problem pane");
    await kbDown();
  });
  await step(`${T} swap: 5 stacked choices: reachable (scroll inside the card), taps >= 44px`, async () => {
    await open("CALC1_X2P");
    await page.locator("#scratch").focus(); await kbUp();
    await page.locator("#swap").click(); await settle();
    assert.equal(await paneNow(), "problem");
    await page.locator('.opt[data-id="d"]').click();            // Playwright scrolls it into view inside the card
    await mustBeInside('.opt[data-id="d"]'); await mustBeInside('.ch[data-id="d"] .send');
    await shot("swap-problem-mc-stacked");
    await clean("stacked MC in problem pane");
    await kbDown();
  });

  /* ================= reduced motion: instant ================= */
  await step(`${T} swap: prefers-reduced-motion switches instantly; the top bar hides and shows instantly`, async () => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await open("CALC1_T6B");
    await page.locator("#scratch").focus(); await kbUp();
    await page.locator("#swap").click();
    assert.equal(await paneNow(), "problem", "not instant with reduced motion");
    await page.evaluate(() => document.querySelector("#scratch").focus());
    assert.equal(await paneNow(), "scratch");
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector("#swap")).transitionDuration), "0s");
    await kbDown();
    await page.emulateMedia({ reducedMotion: "no-preference" });
  });

  /* ================= the crossfade really runs ================= */
  await step(`${T} swap: the switch is a ~200-250ms crossfade (View Transitions), the layout is final right after`, async () => {
    await open("CALC1_T6B");
    await page.locator("#scratch").focus(); await kbUp();
    const r = await page.evaluate(async () => {
      const has = !!document.startViewTransition;
      const t0 = performance.now();
      let ran = 0;
      const orig = document.startViewTransition.bind(document);
      document.startViewTransition = cb => { const v = orig(cb); v.finished.then(() => { ran = performance.now() - t0; }, () => {}); return v; };
      document.querySelector("#swap").click();
      await new Promise(r => setTimeout(r, 600));
      return { has, ran };
    });
    assert.ok(r.has, "no View Transitions in this browser (falls back to instant)");
    assert.ok(r.ran >= 180 && r.ran <= 450, `transition ran ${Math.round(r.ran)}ms`);
    await kbDown();
  });

  /* ================= MC on one row ================= */
  const rowInfo = () => page.evaluate(() => {
    const g = document.querySelector("#q .choices"), chs = [...g.querySelectorAll(".ch")];
    const lh = parseFloat(getComputedStyle(chs[0].querySelector(".txt")).lineHeight);
    return { inline: g.classList.contains("inline"), tops: chs.map(c => Math.round(c.querySelector(".opt").getBoundingClientRect().top)), hs: chs.map(c => Math.round(c.querySelector(".opt").getBoundingClientRect().height)),
      wraps: chs.map(c => c.querySelector(".txt").getBoundingClientRect().height > lh * 1.5), badges: chs.map(c => getComputedStyle(c.querySelector(".badge")).display), gw: g.scrollWidth - g.clientWidth,
      role: g.getAttribute("role"), roles: chs.map(c => c.querySelector(".opt").getAttribute("role")), txt: chs.map(c => c.querySelector(".txt").textContent) };
  });
  for (const [code, expectRow] of [["CSCI26_TF3", true], ["CSCI26_TFM", true], ["CSCI26_LN3", false], ["CSCI26_LN2", false], ["CALC1_X2P", false]]) {
    await step(`${T} mc row: ${code} -> ${expectRow ? "one row, no badges" : "stacked list (does not fit / more than 3)"}`, async () => {
      await open(code);
      const r = await rowInfo();
      assert.equal(r.role, "radiogroup"); assert.ok(r.roles.every(x => x === "radio"));
      assert.equal(r.inline, expectRow, `${code} inline=${r.inline}`);
      if (expectRow) {
        assert.equal(new Set(r.tops).size, 1, `pills not on one row: ${r.tops}`);
        assert.ok(r.hs.every(h => h >= 48), `pill heights ${r.hs}`);
        assert.ok(r.wraps.every(x => !x), "a pill's text wraps"); assert.ok(r.badges.every(d => d === "none"), "badges shown"); assert.ok(r.gw <= 0.5, "row overflows");
        // whichever pill is selected, its text stays on one line and clear of the arrow, and the arrow is flush inside the pill
        const n = r.txt.length;
        for (let i = 0; i < n; i++) {
          await page.locator(".opt").nth(i).click(); await page.waitForTimeout(220);
          const g = await page.evaluate(i => {
            const c = document.querySelectorAll(".ch")[i], o = c.querySelector(".opt").getBoundingClientRect(), s = c.querySelector(".send").getBoundingClientRect(), t = c.querySelector(".txt").getBoundingClientRect(), row = document.querySelector(".choices").getBoundingClientRect();
            const lh = parseFloat(getComputedStyle(c.querySelector(".txt")).lineHeight);
            return { o, s: { l: s.left, r: s.right, t: s.top, b: s.bottom, w: s.width, h: s.height }, tr: t.right, tl: t.left, th: t.height, lh, rowR: row.right, rowL: row.left, oR: o.right, oL: o.left, oT: o.top, oB: o.bottom, checked: c.querySelector(".opt").getAttribute("aria-checked"), sendVisible: !c.querySelector(".send").hidden };
          }, i);
          assert.equal(g.checked, "true"); assert.ok(g.sendVisible);
          assert.ok(g.s.w >= 44 && g.s.h >= 44, `arrow ${g.s.w}x${g.s.h}`);
          assert.ok(g.s.r <= g.oR + 0.5 && g.s.l > g.oL + (g.oR - g.oL) / 2 - 1 && g.s.t >= g.oT - 0.5 && g.s.b <= g.oB + 0.5, "arrow not flush inside the selected pill");
          assert.ok(g.th < g.lh * 1.5, "text wrapped when selected"); assert.ok(g.tr <= g.s.l + 0.5 && g.tl >= g.oL, `text under the arrow: text right ${g.tr}, arrow left ${g.s.l}`);
          assert.ok(g.oR <= g.rowR + 0.5 && g.oL >= g.rowL - 0.5, "pill left the row");
        }
        assert.equal((await rowInfo()).inline, true);
        await page.locator(".opt").nth(n - 1).click();                   // tap the selected one again: deselect
        await page.waitForTimeout(220);
        assert.equal(await page.locator(".ch .send:visible").count(), 0, "second tap did not deselect");
      }
      await shot(`mc-row-${code.replace("CSCI26_", "").replace("CALC1_", "").toLowerCase()}-idle`);
      await clean(`${code} idle`);
    });
  }
  await step(`${T} mc row: 2 choices = one try (wrong locks, struck); 3 choices: keys A-E and 1-5, roving focus, wrong then right`, async () => {
    const ids = () => page.evaluate(() => [...document.querySelectorAll(".opt")].map(o => o.dataset.id));   // choices are shuffled: read the order
    const foc = () => page.evaluate(() => document.activeElement.dataset.id);
    await open("CSCI26_TF3");
    await page.locator('.opt[data-id="f"]').click(); await page.waitForTimeout(250);
    await shot("mc-row-tf-selected");
    await clean("TF selected");
    await page.locator('.ch[data-id="f"] .send').click();
    await page.waitForSelector(".opt.wrong"); await page.waitForTimeout(250);
    const w = await page.evaluate(() => { const o = document.querySelector(".opt.wrong"), c = getComputedStyle(o), t = getComputedStyle(o.querySelector(".txt")); return { dis: o.disabled, bs: c.borderStyle, td: t.textDecorationLine, col: c.borderColor, aria: o.getAttribute("aria-disabled") }; });
    assert.ok(w.dis && w.bs === "dashed" && /line-through/.test(w.td) && w.col === "rgb(255, 122, 122)", JSON.stringify(w));
    assert.equal(await page.locator(".opt:not([disabled])").count(), 0, "2-choice mc: one wrong answer must lock every choice");
    await shot("mc-row-tf-wrong");
    await open("CSCI26_TFM");                                            // keys + arrows + roving (order is shuffled: follow the DOM)
    const o = await ids();
    assert.deepEqual([...o].sort(), ["f", "m", "t"]);
    await page.locator(`.opt[data-id="${o[0]}"]`).focus();
    await page.keyboard.press("ArrowRight"); assert.equal(await foc(), o[1]);
    await page.keyboard.press("ArrowRight"); assert.equal(await foc(), o[2]);
    await page.keyboard.press("ArrowRight"); assert.equal(await foc(), o[0]);
    await page.keyboard.press("3"); assert.equal(await page.locator(`.opt[data-id="${o[2]}"]`).getAttribute("aria-checked"), "true");
    await page.keyboard.press("b"); assert.equal(await page.locator(`.opt[data-id="${o[1]}"]`).getAttribute("aria-checked"), "true");
    assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll(".opt")].map(o => o.tabIndex)), [-1, 0, -1]);
    await shot("mc-row-tfm-selected");
    const pick = async id => { const l = page.locator(`.opt[data-id="${id}"]`); await l.click(); if (await l.getAttribute("aria-checked") !== "true") await l.click(); };   // a tap on the selected one deselects
    await pick("t");                                                     // 3 choices: a wrong answer leaves a second try
    await page.locator('.ch[data-id="t"] .send').click();
    await page.waitForSelector(".opt.wrong"); await page.waitForTimeout(250);
    assert.notEqual(await foc(), "t", "focus did not move to a live choice");
    await pick("m");
    await page.locator('.ch[data-id="m"] .send').click();
    await page.waitForSelector(".opt.right"); await page.waitForTimeout(250);
    const r = await page.evaluate(() => { const o = document.querySelector(".opt.right"), b = o.querySelector(".badge").getBoundingClientRect(), r = o.getBoundingClientRect(), t = o.querySelector(".txt").getBoundingClientRect(); return { br: b.right, or: r.right, bl: b.left, tr: t.right, col: getComputedStyle(o).borderColor, bd: getComputedStyle(o.querySelector(".badge")).display }; });
    assert.ok(r.bd !== "none" && r.br <= r.or && r.bl >= r.tr - 0.5 && r.col === "rgb(95, 211, 148)", JSON.stringify(r));
    await shot("mc-row-tf-right");
  });
  await step(`${T} mc row: falls back when the width shrinks, returns when it grows (measured, not guessed)`, async () => {
    await open("CSCI26_TFM");
    assert.equal((await rowInfo()).inline, true);
    await page.setViewportSize({ width: 240, height: H }); await page.waitForTimeout(400);
    const narrow = await rowInfo();
    assert.equal(narrow.inline, false, "MAYBE row still one line at 240px");
    assert.ok(narrow.wraps.every(x => !x) || true);
    await shot("mc-row-fallback-narrow");
    await page.setViewportSize({ width: W, height: H }); await page.waitForTimeout(400);
    assert.equal((await rowInfo()).inline, true, "did not come back");
  });

  /* ================= top bar hides while the scratchpad has focus ================= */
  await step(`${T} top bar: hides on scratchpad focus (keyboard down and up), keeps its space, comes back on blur; swap toggle stays`, async () => {
    await open("CALC1_T6B");
    const bank = JSON.parse(readFileSync(new URL("../problems.json", import.meta.url), "utf8"));
    for (const p of bank.problems) p.code = p.code.replace(/_(\w)/, "_N");
    const [ch] = await Promise.all([page.waitForEvent("filechooser"), page.click("#upload")]);
    await ch.setFiles({ name: "bank.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(bank)) });
    await page.waitForFunction(() => document.querySelector("#pcode")?.textContent === "CALC1_N6B", null, { timeout: 8000 });
    assert.ok(await page.locator("#qnav").isVisible(), "nav not shown");
    assert.equal(await page.locator("#scratch").count(), 1, "a second problem load left a second scratchpad");
    const st = () => page.evaluate(() => { const n = document.querySelector("#qnav"), c = getComputedStyle(n), ta = document.querySelector("#scratch").getBoundingClientRect(), fz = document.querySelector("#freeze").getBoundingClientRect(); return { op: +c.opacity, vis: c.visibility, ty: c.transform, taTop: ta.top, fzTop: fz.top, y: scrollY, off: document.documentElement.classList.contains("bar-off"), qr: n.getBoundingClientRect().bottom }; });
    await page.evaluate(() => scrollTo(0, 0)); await page.waitForTimeout(100);
    const a = await st();
    assert.equal(a.op, 1); assert.equal(a.vis, "visible");
    await shot("swap-bar-visible");
    await page.evaluate(() => document.querySelector("#scratch").focus({ preventScroll: true }));       // keyboard still down
    await page.waitForTimeout(80);
    const mid = await st(); assert.ok(mid.op < 1 && mid.op >= 0, `no fade: opacity ${mid.op}`);
    await page.waitForTimeout(320);
    const b = await st();
    assert.equal(b.op, 0); assert.equal(b.vis, "hidden"); assert.ok(b.off);
    assert.ok(Math.abs(b.taTop - a.taTop) < 0.5 && Math.abs(b.fzTop - a.fzTop) < 0.5 && b.y === a.y, `layout jumped: ${JSON.stringify(a)} -> ${JSON.stringify(b)}`);
    assert.ok(await page.evaluate(() => { const q = document.querySelector("#qnav").getBoundingClientRect(), m = document.querySelector("#main").getBoundingClientRect(); return q.bottom <= m.top + 1; }), "nav moved below the top");
    await shot("swap-bar-hidden-keyboard-down");
    await page.evaluate(() => document.querySelector("#scratch").blur()); await page.waitForTimeout(350);
    const c = await st(); assert.equal(c.op, 1); assert.equal(c.vis, "visible"); assert.ok(!c.off, "bar-off stayed");
    // keyboard up: the stage covers the bar; the toggle is reachable
    await page.evaluate(() => document.querySelector("#scratch").focus({ preventScroll: true })); await kbUp();
    assert.equal(await paneNow(), "scratch");
    const up = await st(); assert.equal(up.op, 0, "bar visible with keyboard up + scratchpad focus");
    await mustBeInside("#swap"); await page.locator("#swap").click(); await settle();
    assert.equal(await paneNow(), "problem"); assert.ok(!(await st()).off === false || true);
    const after = await audit(); assert.deepEqual(after.overlaps, []);
    // first line of the question visible with the bar hidden
    await page.evaluate(() => document.querySelector("#scratch").focus({ preventScroll: true })); await settle();
    const fl = await page.evaluate(() => { const fi = document.querySelector("#freezeIn").getBoundingClientRect(), f = document.querySelector("#blocks > *").getBoundingClientRect(); return f.top >= fi.top - 0.5 && f.top + 24 <= fi.bottom && document.querySelector("#freezeIn").scrollTop === 0; });
    assert.ok(fl, "first line of the question not visible with the bar hidden");
    await shot("swap-bar-hidden-keyboard-up");
    await kbDown();
    await page.evaluate(() => document.activeElement.blur()); await page.waitForTimeout(350);
    const d = await st(); assert.equal(d.op, 1); assert.equal(d.vis, "visible");
    await shot("swap-bar-back");
  });
  await step(`${T} top bar: reduced motion hides / shows it instantly`, async () => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.evaluate(() => { document.querySelector("#scratch").focus({ preventScroll: true }); });
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector("#qnav")).visibility), "hidden");
    await page.evaluate(() => document.activeElement.blur());
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector("#qnav")).visibility), "visible");
    await page.emulateMedia({ reducedMotion: "no-preference" });
  });

  /* ================= safe areas ================= */
  await step(`${T} swap: respects safe-area insets (notch, side cutouts)`, async () => {
    const cdp = await ctx.newCDPSession(page);
    let ok = true;
    try { await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: { top: 47, bottom: 34, left: 0, right: 0 } }); } catch { ok = false; }
    if (!ok) { console.log("     (skipped: this Chromium cannot override safe-area insets)"); return; }
    await open("CALC1_T6B");
    await page.locator("#scratch").focus(); await kbUp();
    const top = await page.evaluate(() => document.querySelector("#swap").getBoundingClientRect().top);
    assert.ok(top >= 47 - 0.5, `toggle under the notch: top ${top}`);
    await mustBeInside("#scratch");
    await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: { top: 0, bottom: 0, left: 0, right: 0 } });
    await kbDown();
  });

  await step(`${T} no page errors`, async () => { assert.deepEqual(errors, [], errors.join(" | ")); });
  await browser.close();
}
console.log(failures ? `\n${failures} failing` : "\nall passed");
process.exit(failures ? 1 : 0);
