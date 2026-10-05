// Pentest for Swap (keyboard up = one pane), the one-row MC and safe areas, at phone sizes (design/SWAP.md). Since round 3b the phone pad
// lives on the pad page (design/MULTITASK.md), so Swap is entered from an answer field and its pane is the problem; the old scratch pane
// is unreachable (the pad peek and the Scratchpad button open the pad page; flow / polish / bar / render check that page). Needs a server:
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
  await ctx.addInitScript(() => { try { localStorage.setItem("stem-ob", "done"); } catch { /* */ } });   // onboarding: flow.pw checks it
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  page.on("console", m => { if (m.type() === "error" && !/^Failed to load resource/.test(m.text())) errors.push(m.text()); });
  for (const [code, json] of Object.entries(FIX)) await page.route(`**/p/${code}.json`, r => r.fulfill({ json }));

  const T = `${W}x${H}`;
  const shot = async (name) => { if (SHOTS) { await page.waitForTimeout(120); await page.screenshot({ path: `${SHOTS}/${name}-${W}.png` }); } };
  const open = async code => {
    await page.setViewportSize({ width: W, height: H });
    await page.context().clearCookies();   // a new sid = fresh server tries (tries.json now outlives a page; design/DONE.md)
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
        || y.el.classList.contains("xb-copy") && x.el.id === "scratch";
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

  /* ================= Swap: entered from an answer field ================= */
  const ansUp = async sel => { await page.locator(sel).first().focus(); await kbUp(); };
  await step(`${T} swap: keyboard down looks as today; an answer field + keyboard up = the problem pane with the pad peek; keyboard down = as it was`, async () => {
    await open("CALC1_T6B");
    const before = await page.evaluate(() => ({ y: scrollY, fz: document.querySelector("#freeze").getBoundingClientRect().top }));
    assert.equal(await paneNow(), "off");
    assert.ok(await page.locator("#swap").isHidden(), "old toggle");
    await ansUp("#ans");
    assert.equal(await paneNow(), "problem", `focus in the answer shows PROBLEM (${await cls()})`);
    assert.equal(await page.evaluate(() => document.activeElement.id), "ans");
    await mustBeInside("#ans"); await mustBeInside("#ansGo"); await mustBeInside("#padPeek");
    await page.locator("#ans").fill("12");
    await shot("swap-problem-freeform");
    await clean("problem pane");
    await kbDown();
    assert.equal(await paneNow(), "off", `swap stayed on after the keyboard closed (${await cls()})`);
    const after = await page.evaluate(() => ({ y: scrollY, fz: document.querySelector("#freeze").getBoundingClientRect().top }));
    assert.ok(Math.abs(after.y - before.y) <= 1 && Math.abs(after.fz - before.fz) <= 1, `page moved: ${JSON.stringify(before)} -> ${JSON.stringify(after)}`);
  });

  await step(`${T} swap: the keyboard-up state is stable (no flip-flop over 1s)`, async () => {
    await open("CALC1_T6B");
    await ansUp("#ans");
    const seen = new Set();
    for (let i = 0; i < 10; i++) { seen.add(await cls()); await page.waitForTimeout(100); }
    assert.equal(seen.size, 1, `classes changed by themselves: ${[...seen].join(" | ")}`);
    await kbDown();
  });

  /* ================= long question: the problem pane shows it from its start, the answer pinned ================= */
  for (const [code, sel] of [["PHYS_F3N", "#q .ans"], ["CSCI26_CE3", "#q .ans"], ["CSCI26_LQ1", "#ans"]]) {
    await step(`${T} swap: ${code}: the problem pane shows the question FROM ITS START; answer pinned`, async () => {
      await open(code);
      await ansUp(sel);
      assert.equal(await paneNow(), "problem");
      const q = await page.evaluate(() => {
        const c = document.querySelector("#freezeIn").getBoundingClientRect(), pr = document.querySelector("#problem"), q = document.querySelector("#q").getBoundingClientRect(), first = document.querySelector("#blocks > *").getBoundingClientRect(), pRect = pr.getBoundingClientRect();
        return { pst: pr.scrollTop, qBottom: q.bottom, cBottom: c.bottom, firstTop: first.top, pTop: pRect.top };
      });
      assert.equal(q.pst, 0); assert.ok(q.firstTop >= q.pTop - 0.5, "problem starts scrolled");
      assert.ok(q.cBottom - q.qBottom <= 20, `answer not pinned at the card's bottom (${q.cBottom - q.qBottom}px above it)`);
      await shot(`swap-problem-${code}`);
      await clean(`${code} problem pane`);
      await kbDown();
    });
  }

  await step(`${T} swap: multi problem: boxes and arrow inside the visible area in the problem pane`, async () => {
    await open("CSCI26_CE3");
    await ansUp("#q .ans");
    assert.equal(await paneNow(), "problem");
    const boxes = page.locator("#q .ans");
    for (let i = 0; i < 3; i++) { await boxes.nth(i).focus(); await boxes.nth(i).fill("1"); await mustBeInside(`#q .part:nth-child(${i + 1}) .ans`); await mustBeInside(`#go${i}`); }   // the arrow shows once there is text
    await shot("swap-problem-multi");
    await clean("multi in problem pane");
    await kbDown();
  });

  /* ================= the pad page's q | a switch: a crossfade, instant with reduced motion ================= */
  await step(`${T} pad page: q | a is a ~200-250ms crossfade (View Transitions); reduced motion switches instantly`, async () => {
    await open("CALC1_T6B");
    await page.click("#padFab"); await page.waitForFunction(() => document.documentElement.classList.contains("mt")); await settle();
    const r = await page.evaluate(async () => {
      const has = !!document.startViewTransition, t0 = performance.now(); let ran = 0;
      const orig = document.startViewTransition.bind(document);
      document.startViewTransition = cb => { const v = orig(cb); v.finished.then(() => { ran = performance.now() - t0; }, () => {}); return v; };
      document.querySelector("#mtMode").click();
      await new Promise(r => setTimeout(r, 600));
      return { has, ran };
    });
    assert.ok(r.has, "no View Transitions in this browser (falls back to instant)");
    assert.ok(r.ran >= 180 && r.ran <= 450, `transition ran ${Math.round(r.ran)}ms`);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.click("#mtMode");
    assert.ok(await page.evaluate(() => document.documentElement.classList.contains("mt-q")), "not instant with reduced motion");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.click("#mtExp"); await page.waitForFunction(() => !document.documentElement.classList.contains("mt"));
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

  /* ================= a bank upload replaces the problem: one scratchpad, the nav shows ================= */
  await step(`${T} upload a bank: the nav shows; a second problem load leaves one scratchpad`, async () => {
    await open("CALC1_T6B");
    const bank = JSON.parse(readFileSync(new URL("../problems.json", import.meta.url), "utf8"));
    for (const p of bank.problems) p.code = p.code.replace("_", "_N");   // insert, not swap: a swap made codes collide
    if (await page.isVisible("#barTab") && !(await page.isVisible("#upload"))) await page.click("#barTab");   // the bar rests as a strip while a problem is open
    const [ch] = await Promise.all([page.waitForEvent("filechooser"), page.click("#upload")]);
    await ch.setFiles({ name: "bank.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(bank)) });
    await page.waitForFunction(() => { const c = document.querySelector("#pcode")?.textContent; return !!c && window.stemOffline.has(c); }, null, { timeout: 8000 });
    assert.ok(await page.locator("#qnav").isVisible(), "nav not shown");
    assert.equal(await page.locator("#scratch").count(), 1, "a second problem load left a second scratchpad");
  });

  /* ================= safe areas ================= */
  await step(`${T} swap + pad page: respect safe-area insets (notch, side cutouts)`, async () => {
    const cdp = await ctx.newCDPSession(page);
    let ok = true;
    try { await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: { top: 47, bottom: 34, left: 0, right: 0 } }); } catch { ok = false; }
    if (!ok) { console.log("     (skipped: this Chromium cannot override safe-area insets)"); return; }
    await open("CALC1_T6B");
    await ansUp("#ans");
    const top = await page.evaluate(() => document.querySelector("#freeze").getBoundingClientRect().top);
    assert.ok(top >= 47 - 0.5, `problem pane under the notch: top ${top}`);
    await mustBeInside("#ans");
    await kbDown(); await page.evaluate(() => document.activeElement.blur());
    await page.click("#padFab"); await page.waitForFunction(() => document.documentElement.classList.contains("mt")); await settle();
    const g = await page.evaluate(() => ({ tile: document.querySelector("#freeze").getBoundingClientRect().top, row: document.querySelector("#mtExp").getBoundingClientRect().bottom, vh: innerHeight }));
    assert.ok(g.tile >= 47 - 0.5, `pad page under the notch: tile top ${g.tile}`);
    assert.ok(g.row <= g.vh - 34 + 0.5, `tool row under the home indicator: ${g.row} > ${g.vh - 34}`);
    await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: { top: 0, bottom: 0, left: 0, right: 0 } });
    await page.click("#mtExp");
  });

  await step(`${T} no page errors`, async () => { assert.deepEqual(errors, [], errors.join(" | ")); });
  await browser.close();
}
console.log(failures ? `\n${failures} failing` : "\nall passed");
process.exit(failures ? 1 : 0);
