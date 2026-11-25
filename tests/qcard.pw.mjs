// QCARD-SWISS v3 smoke (owner pick V3, Nov 15; brain ui-v7-decisions): under html.ui-v7 the question card is ONE surface, top to bottom: ghost numeral (ECHO trail, 6 copies), headline,
// ONE text block (setup + the question sentence; no fold, no inner scroll: the page scrolls the card and its bold ask pins at the top, ICK PR-A), meta row (exam . q#, Twist chip, answer hint). Ask Cluck top right, SOLID (opaque, no border)
// and never over the numeral's front copy. The echo animates on prev/next (transform + opacity only, will-change only while it runs, none under reduced motion). Flag off: untouched.
// Own serve.py + throwaway bank.   node tests/qcard.pw.mjs [port]
import { launchBrowser } from "./pw-browser.mjs";
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { serverUp } from "./lib/boot.mjs";   // CI-ARCH B3: a dead serve.py fails at once, with its URL
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { try { pw = require("/opt/node22/lib/node_modules/playwright"); } catch { pw = require("/opt/node-tools/node_modules/playwright"); } }
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = /^\d+$/.test(process.argv[2] || "") ? +process.argv[2] : 8898, BASE = `http://127.0.0.1:${PORT}`;
const TMP = mkdtempSync(join(tmpdir(), "qcard-")), BANKS = join(TMP, "banks");
const short = { code: "PHYS_QS1", title: "Roll", type: "num", answer: "1.38", tol: 0.01, unit: "m/s", how: "Number only.", twist: true,
  wrong: [{ value: "1.6", error: "spin", hint: "QUACK. Spin." }], body: [{ type: "text", md: "How fast is a rolling ball at the bottom?" }], saccharine: { title: "Roll", key: "Answer: 1.38" } };
const long = { code: "PHYS_QL2", title: "Hydraulic lift", type: "num", answer: "4", tol: 0.01, unit: "", how: "Whole number.", wrong: [{ value: "3", error: "off", hint: "QUACK. Count." }],
  body: [{ type: "text", md: "A $80\\ \\text{kg}$ student on the small piston balances a $1800\\ \\text{kg}$ elephant on a hydraulic lift piston of diameter $2.2\\ \\text{m}$; the lift holds oil of density $860\\ \\text{kg/m}^3$. The lift rises 2.55 m at most. At first the two pistons are at the same height. More students climb on. What is the smallest TOTAL number of students on the small piston?" }],
  saccharine: { title: "Hydraulic lift", key: "Answer: 4" } };
mkdirSync(BANKS);
const filler = Array.from({ length: 26 }, (_, i) => { const n = i + 3, c = "PHYS_F" + String(n).padStart(2, "0");
  return { code: c, title: "Filler " + n, type: "num", answer: "1", tol: 0.01, unit: "", how: "Number only.", wrong: [{ value: "2", error: "off", hint: "QUACK. No." }], body: [{ type: "text", md: "Filler question " + n + "?" }], saccharine: { title: "Filler " + n, key: "Answer: 1" } }; });
/* TITLE-EXAMQ: appended LAST so the filler question numbers above stay 3..28 (the stable-layout step walks up to q28) */
const examq = { code: "PHYS_QE3", title: "Q1 · Net torque about the axle", type: "num", answer: "2", tol: 0.01, unit: "", how: "Number only.",
  wrong: [{ value: "3", error: "off", hint: "QUACK. Recheck." }], body: [{ type: "text", md: "A wrench turns a bolt. What is the net torque about the axle?" }], saccharine: { title: "Q1 · Net torque about the axle", key: "Answer: 2" } };
writeFileSync(join(BANKS, "BANK_QCS.json"), JSON.stringify({ v: 1, problems: [short, long, ...filler, examq] }));
const srv = spawn("python3", [join(ROOT, "server", "http_server", "serve.py"), String(PORT)], { env: { ...process.env, STEM_BANKS: BANKS, STEM_FRONT: "BANK_QCS", STEM_FRONT_TITLE: "Exam 3",
  STEM_TODAY: "2026-11-03", STEM_TRIES: join(TMP, "tries.json"), CLAUDE_API: "" }, stdio: "ignore" });
await serverUp(BASE);
let failures = 0;
async function step(name, fn) { try { await fn(); console.log("ok  ", name); } catch (e) { failures++; console.log("FAIL", name, "\n     ", String(e.message).slice(0, 900)); } }
const browser = await launchBrowser(pw, { motion: true, args: ["--no-sandbox"] });
async function open(w, flag, code, h) {
  const phone = w < 500;
  const ctx = await browser.newContext({ viewport: { width: w, height: h || (phone ? 852 : 800) }, hasTouch: phone, isMobile: phone, deviceScaleFactor: 1, serviceWorkers: "block" });
  await ctx.addInitScript(() => { try { localStorage.setItem("stem-ob", "done"); localStorage.setItem("stem-jev", "0"); localStorage.setItem("stem-twist-seen", "1"); } catch { /* blocked */ } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/?ui=${flag}&qcecho=tl#${code}`);   // tl = the old top-left numeral layout these geometry checks pin; default is qbr (QC-NOFRONT)
  await page.waitForSelector("#blocks .md", { timeout: 10000 });
  await page.evaluate(() => document.fonts && document.fonts.ready); await page.waitForTimeout(500);
  return page;
}
const geo = page => page.evaluate(() => {
  const r = s => { const e = document.querySelector(s); return e && e.getBoundingClientRect(); };
  const lead = document.querySelector("#blocks .qlead"), set = document.querySelector("#blocks .qsetup"), btn = document.querySelector("#cluckBtn");
  const cs = btn && getComputedStyle(btn), alpha = c => { const m = c.match(/rgba?\(([^)]+)\)/); const v = m[1].split(/[ ,\/]+/).filter(Boolean); return v.length > 3 ? +v[3] : 1; };
  return { lead: lead && lead.textContent.trim(), l: r(".qlead"), s: set && r(".qsetup"), p: r("#problem"), b: btn && btn.getBoundingClientRect(), front: r(".qghost i:nth-child(1)"), head: r(".qhead"), meta: r(".qmeta"),
    headTx: (document.querySelector(".qhead") || {}).textContent, gbox: r(".qghostbox"), qtx: (document.querySelector(".qtext") || {}).textContent, gap: document.querySelector(".qhead").getBoundingClientRect().top - document.querySelector(".qghostbox").getBoundingClientRect().bottom, metaTx: (document.querySelector(".qmeta") || {}).textContent,
    ghosts: document.querySelectorAll(".qghost i").length, ghostHidden: document.querySelector(".qghostbox").getAttribute("aria-hidden"), twist: !!document.querySelector(".qmeta #twistChip"),
    chipAlpha: alpha(cs.backgroundColor), chipBorder: cs.borderTopWidth, chipShadow: cs.boxShadow, folds: document.querySelectorAll(".qfold, .qscroll").length, cardOv: getComputedStyle(document.querySelector("#problem")).overflowY, cardMax: getComputedStyle(document.querySelector("#problem")).maxHeight, cardH: document.querySelector("#problem").clientHeight, cardSH: document.querySelector("#problem").scrollHeight,
    show: document.querySelectorAll(".qshow").length, sw: document.documentElement.scrollWidth, vw: innerWidth };
});
const hit = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
try {
  for (const w of [390, 1366]) {
    await step(`${w}: short question: ghost 6 copies, headline + one text block + meta row (exam . q#), Ask Cluck solid top right clear of the numeral`, async () => {
      const page = await open(w, "v7", "PHYS_QS1");
      try {
        const g = await geo(page);
        assert.equal(g.lead, "How fast is a rolling ball at the bottom?"); assert.equal(g.ghosts, 6); assert.equal(g.ghostHidden, "true"); assert.ok(!g.twist, "no Twist chip under ui-v7 (the row toast announces it)"); assert.ok(!(await page.evaluate(() => !!document.querySelector("#twistChip"))), "no #twistChip");
        assert.equal(g.headTx, "Roll"); assert.match(g.metaTx, /exam 3 · q1/); assert.doesNotMatch(g.metaTx, /Number only/, "hint stays below the card, not in the meta row");
        assert.ok(g.gbox.bottom <= g.head.top + 0.5, "numeral block above the headline"); assert.ok(!g.meta.height || g.l.bottom <= g.meta.top + 0.5, "meta under the text (NO-EXAM, Tony Nov 16: the row is hidden when it only held the exam line)");
        assert.ok(g.b && g.b.right > g.p.right - 40 && g.b.top < g.p.top + 40, "Ask Cluck top right");
        assert.equal(g.chipAlpha, 1, "chip fill opaque"); assert.equal(g.chipBorder, "0px", "chip: no border"); assert.match(g.chipShadow, /0px 1px 2px/, "tight under-shadow"); assert.doesNotMatch(g.chipShadow, /0px 0px 0px 6px/, "no halo ring");
        assert.ok(!hit(g.b, g.front), "chip box does not touch the front numeral");
        assert.equal(g.show, 0, "no Show all"); assert.equal(g.sw, g.vw, "no horizontal scroll");
        assert.ok(!/Schibsted/.test(await page.evaluate(() => getComputedStyle(document.querySelector("#ans, #q input, #q textarea")).fontFamily)), "inputs keep Atkinson");
      } finally { await page.context().close(); }
    });
    await step(`${w}: long question: setup then the question in ONE text block on one left edge, no fold, no inner scroll box, no Show all`, async () => {
      const page = await open(w, "v7", "PHYS_QL2");
      try {
        const g = await geo(page);
        assert.match(g.lead, /^What is the smallest TOTAL number/); assert.ok(g.s, "setup kept");
        assert.ok(Math.abs(g.l.left - g.s.left) < 0.5 && Math.abs(g.head.left - g.s.left) < 0.5 && (!g.meta.height || Math.abs(g.meta.left - g.s.left) < 0.5), "one left edge: headline, text, meta (when shown)");
        assert.ok(g.s.top < g.l.top, "setup above the question");
        assert.equal(g.headTx, "Hydraulic lift", "whole topic word"); assert.ok(g.gap <= 17, "no empty band under the numeral: " + g.gap);
        assert.ok(g.qtx.includes("2.55\u00a0m"), "number + unit joined by a no-break space"); assert.ok(!/\s[.,;:?]/.test(g.qtx), "no stray space before punctuation: " + g.qtx.match(/.{8}\s[.,;:?].{3}/));
        assert.equal(g.folds, 0, "no fold strip, no inner scroll box (ICK PR-A: the page scrolls the card)"); assert.equal(g.cardMax, "none"); assert.notEqual(g.cardOv, "auto"); assert.ok(g.cardSH <= g.cardH + 1, "the card shows all its text: " + g.cardSH + " vs " + g.cardH);
        assert.equal(g.show, 0, "no Show all"); assert.ok(!hit(g.b, g.front), "chip clear of the numeral");
      } finally { await page.context().close(); }
    });
  }
  await step("no fold + ask-pin (ICK PR-A, F1): in a 390x420 viewport the long card scrolls with the page and its bold ask strip pins at the top; a tap on the strip scrolls back to the full question; a short card on a short page never pins", async () => {
    const page = await open(390, "v7", "PHYS_QL2", 420);
    try {
      const o = await page.evaluate(async () => {
        const p = document.querySelector("#problem"), lead = document.querySelector("#problem .qlead"), q = (el, k) => getComputedStyle(el)[k];
        const base = { qpin: p.classList.contains("qpin"), pos: q(p, "position"), ov: q(p, "overflowY"), max: q(p, "maxHeight"), tall: p.offsetHeight, fold: document.querySelectorAll(".qfold, .qscroll").length, pad: document.documentElement.classList.contains("pad-off") };
        const sp = document.createElement("div"); sp.style.height = "900px"; document.querySelector("#freezeIn").appendChild(sp);   // the answers under this card are short: give the page the room a real long question has below it (a card only stays pinned while the page under it is long enough)
        window.scrollTo(0, 100000); await new Promise(r => setTimeout(r, 400));
        const r = lead.getBoundingClientRect(), c = p.getBoundingClientRect();
        return { base, y: scrollY, leadTop: r.top, leadBottom: r.bottom, cardTop: c.top, cardBottom: c.bottom, padB: parseFloat(q(p, "paddingBottom")), pinned: p.classList.contains("qpinned"), weight: q(lead, "fontWeight"), lh: q(lead.querySelector("p") || lead, "lineHeight"), shadow: q(lead, "boxShadow"), border: q(lead, "borderTopWidth"), pad: q(document.documentElement, "scrollPaddingTop") };
      });
      assert.deepEqual([o.base.fold, o.base.max, o.base.ov === "auto"], [0, "none", false], "no fold, no cap: " + JSON.stringify(o.base));
      assert.ok(o.base.pad && o.base.qpin && o.base.pos === "sticky", "the long card engages the pin: " + JSON.stringify(o.base));
      // typescale Major Third, Tony Nov 25: the ask is step 1 (20/28 bold, 3 lines here = 84px, was 16 x 1.35 = 2 lines), so the card's bottom edge sits ~184px down a 420 viewport, past the old 40% (168). The lead stays inside 40%; the card bottom is now bounded by what it is: the strip + the card's own bottom padding, nothing else of the card left on screen.
      assert.ok(o.pinned && o.leadTop >= -1 && o.leadBottom <= 420 * 0.4 && o.cardBottom <= o.leadBottom + o.padB + 1, "the ask strip is stuck at the top, the rest of the card scrolled away: " + JSON.stringify(o));
      assert.ok(parseFloat(o.pad) > 20, "scroll-padding-top = the strip height while pinned (WCAG 2.4.11): " + o.pad);
      assert.ok(+o.weight >= 600 && o.shadow === "none" && o.border === "0px", "bold ask, no box / shadow: " + JSON.stringify([o.weight, o.shadow, o.border]));
      await page.mouse.click(60, Math.round(o.cardBottom / 2));   // a tap on the visible strip (the card's bottom edge is the strip's)
      await page.waitForFunction(() => scrollY < 2, null, { timeout: 4000 });
      assert.ok(!(await page.evaluate(() => document.querySelector("#problem").classList.contains("qpinned"))), "tap = back to the full question, un-pinned");
    } finally { await page.context().close(); }
    const sp = await open(390, "v7", "PHYS_QS1");   // a short card on a page shorter than the screen: nothing scrolls, so nothing pins
    try { assert.ok(await sp.evaluate(async () => { window.scrollTo(0, 100000); await new Promise(r => setTimeout(r, 200)); return scrollY === 0 && !document.querySelector("#problem").classList.contains("qpinned"); }), "short card on a short page never pins"); } finally { await sp.context().close(); }
  });
  await step("echo animation: prev/next slides the trail in (transform + opacity only, will-change only while it runs); reduced motion: none", async () => {
    for (const rm of [false, true]) {
      const page = await open(1366, "v7", "PHYS_QS1");
      try {
        if (rm) await page.emulateMedia({ reducedMotion: "reduce" });
        assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector(".qghost i")).willChange), "auto", "idle: no will-change");
        await page.evaluate(() => { window.__ea = []; document.addEventListener("animationstart", e => { if (e.animationName !== "qecho") return; const an = e.target.getAnimations().find(x => x.animationName === "qecho"); window.__ea.push({ k: an ? Object.keys(an.effect.getKeyframes()[0]).filter(k => !["offset", "computedOffset", "easing", "composite"].includes(k)).sort().join() : "?", wc: getComputedStyle(e.target).willChange }); }, true); });
        await page.click("#qnext");
        await page.waitForFunction(() => document.querySelector(".qghost").getAttribute("data-n") !== "1", null, { timeout: 5000 });
        await page.waitForTimeout(150);
        const a = await page.evaluate(() => window.__ea);
        if (rm) assert.equal(a.length, 0, "reduced motion: no animation");
        else { assert.equal(a.length, 2, "the 2 shown copies animate (GHOST-ONE, Nov 17: the main numeral + one echo)"); assert.ok(a.every(x => x.k === "opacity,transform"), JSON.stringify(a)); assert.ok(a.every(x => /transform/.test(x.wc)), "will-change while running"); }
        await page.waitForTimeout(900);
        assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector(".qghost i")).willChange), "auto", "will-change dropped after");
      } finally { await page.context().close(); }
    }
  });
  await step("stable layout across numbers 1, 2, 7, 10, 12, 28: the text's left edge never moves and the front numeral's INK edge sits on it (<= 1px); chip clear of the numeral", async () => {
    for (const w of [390, 1366]) {
      const page = await open(w, "v7", "PHYS_QS1"); const edges = [];
      try {
        for (const n of [1, 2, 7, 10, 12, 28]) {
          const code = n === 1 ? "PHYS_QS1" : n === 2 ? "PHYS_QL2" : "PHYS_F" + String(n).padStart(2, "0");
          if (n > 1) { await page.evaluate(c => { location.hash = c; }, code); await page.waitForFunction(c => document.querySelector("#pcode").textContent === c, code, { timeout: 8000 }); await page.waitForFunction(n => document.querySelector(".qghost").getAttribute("data-n") === String(n), n, { timeout: 5000 }); await page.waitForTimeout(700); }
          const e = await page.evaluate(() => { const gh = document.querySelector(".qghost"), f = gh.firstChild, cs = getComputedStyle(gh), c = document.createElement("canvas").getContext("2d");
            c.font = "900 " + parseFloat(cs.fontSize) + "px \"G Archivo\""; c.fontStretch = "semi-expanded"; c.letterSpacing = "0px";
            const ink = f.getBoundingClientRect().left - c.measureText(f.textContent.charAt(0)).actualBoundingBoxLeft, card = document.querySelector("#problem").getBoundingClientRect(), r = s => document.querySelector(s).getBoundingClientRect(), b = document.querySelector("#cluckBtn").getBoundingClientRect(), fr = f.getBoundingClientRect();
            return { n: gh.dataset.n, ink, text: r(".qhead").left - card.left, textR: card.right - r(".qtext").right, inkRel: ink - card.left, qlead: r(".qlead").left - card.left, hit: b.left < fr.right && fr.left < b.right && b.top < fr.bottom && fr.top < b.bottom }; });
          edges.push(e);
        }
        const t0 = edges[0].text;
        for (const e of edges) { assert.ok(Math.abs(e.text - t0) < 0.5 && Math.abs(e.qlead - t0) < 0.5, `${w}: text left moved at q${e.n}: ${JSON.stringify(e)}`); assert.ok(Math.abs(e.inkRel - e.text) <= 1, `${w}: numeral ink edge ${e.inkRel} vs text ${e.text} at q${e.n}`); assert.ok(!e.hit, `${w}: chip touches the numeral at q${e.n}`); }
        assert.ok(Math.abs(edges[0].textR - t0) <= 1, "symmetric inner padding: right margin = left");
      } finally { await page.context().close(); }
    }
  });
  await step("exam-question prefix (TITLE-EXAMQ-DIM): the big title keeps a capital Q on the student's 'Q1 · ' prefix, dim (#7a8aae) and dot-free, one word space before the rest; the human rest stays lower case; a title without the prefix is unchanged", async () => {
    const page = await open(390, "v7", "PHYS_QE3");   // qcecho=tl is the layout whose headline is lower-cased (qcard.css .qhead)
    try {
      await page.waitForFunction(() => { const h = document.querySelector(".qhead"); return h && h.querySelector(".qexam .sr-only"); }, null, { timeout: 5000 });
      const t = await page.evaluate(() => {
        const h = document.querySelector(".qhead"), s = h.querySelector(".qexam"), hid = s.querySelector(".sr-only");
        const cs = getComputedStyle(s), hr = hid && hid.getBoundingClientRect(), sr = s.getBoundingClientRect();
        const tn = s.nextSibling; let glyph = null;
        if (tn && tn.nodeType === 3 && tn.nodeValue.length) { const rg = document.createRange(); rg.setStart(tn, 0); rg.setEnd(tn, 1); glyph = rg.getBoundingClientRect(); }
        return { inner: h.innerText, text: h.textContent, n: h.querySelectorAll(".qexam").length, span: s.textContent, tf: cs.textTransform, restTf: getComputedStyle(h).textTransform,
          color: cs.color, nowrap: cs.whiteSpace, svg: h.querySelectorAll("svg").length, lead: s.firstChild && s.firstChild.nodeValue,
          hidW: hr ? hr.width : null, hidH: hr ? hr.height : null, hidTx: hid && hid.textContent,
          gap: glyph ? glyph.left - sr.right : null, fs: parseFloat(getComputedStyle(h).fontSize), bg: getComputedStyle(document.querySelector("#problem")).backgroundColor };
      });
      const lum = c => { const m = c.match(/[\d.]+/g).map(Number), v = m.slice(0, 3).map(x => { x /= 255; return x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4; }); return .2126 * v[0] + .7152 * v[1] + .0722 * v[2]; };
      const ratio = (lum(t.color) + .05) / (lum(t.bg) + .05);
      assert.equal(t.span, "Q1 · ", "the prefix span holds exactly the exam prefix");
      assert.equal(t.tf, "none", "the prefix span is not transformed");
      assert.equal(t.restTf, "lowercase", "the human rest keeps the card's lower-case look");
      assert.equal(t.color, "rgb(122, 138, 174)", "the prefix is the dim ink #7a8aae: " + t.color);
      assert.ok(ratio >= 3, `the dim prefix on the card reads >= 3:1 (large bold): ${ratio.toFixed(2)}:1 on ${t.bg}`);
      assert.equal(t.lead, "Q1", "the visible prefix is 'Q1' only: no dot");
      assert.equal(t.svg, 0, "nothing is drawn in the dot's place");
      assert.equal(t.nowrap, "nowrap", "the exam number never breaks");
      assert.equal(t.hidTx, " · ", "the typed dot stays in the DOM for screen readers and copy");
      assert.ok(t.hidW !== null && t.hidW <= 1 && t.hidH <= 1, "the hidden dot takes no visible box: " + t.hidW + "x" + t.hidH);
      assert.ok(t.gap !== null && t.gap >= t.fs * .2 && t.gap <= t.fs * .4, `one word space between the prefix and the first title glyph: ${t.gap}px at ${t.fs}px`);
      assert.match(t.inner, /^Q1\b/, "visible title starts with a capital Q: " + t.inner);
      assert.equal(t.inner.replace(/\s+/g, " ").trim(), "Q1 · net torque about the axle", "title text: prefix kept, rest lower case: " + t.inner);
      assert.match(t.text, /^Q1 · Net torque about the axle$/, "text content keeps the bank title (dot included): " + t.text);
      assert.ok(t.text.startsWith("Q1 · "), "the title's textContent holds 'Q1 · '");
      const aria = await page.locator(".qhead").ariaSnapshot();
      assert.match(aria, /Q1 · [Nn]et torque about the axle/, "the accessible name keeps the typed dot in one piece: " + aria);
    } finally { await page.context().close(); }
    const plain = await open(390, "v7", "PHYS_QS1");   // no prefix: the same DOM as before (no span)
    try {
      const t = await plain.evaluate(() => { const h = document.querySelector(".qhead"); return { inner: h.innerText, text: h.textContent, html: h.innerHTML, n: h.querySelectorAll(".qexam").length }; });
      assert.equal(t.n, 0, "no prefix span on a plain title");
      assert.equal(t.html, "Roll", "plain title DOM unchanged");
      assert.equal(t.text, "Roll");
      assert.equal(t.inner, "roll", "plain title still lower-cased whole");
    } finally { await plain.context().close(); }
  });
  await step("flag off: the card is the one app.js draws (no text block, no ghost)", async () => {
    const page = await open(1366, "off", "PHYS_QL2");
    try {
      assert.equal(await page.evaluate(() => document.querySelectorAll(".qhead, .qtext, .qmeta, .qghostbox, .qlead, .qsetup, #problem.qc7").length), 0);
    } finally { await page.context().close(); }
  });
} finally { await browser.close(); srv.kill(); }
if (failures) { console.log(`${failures} FAILED`); process.exit(1); }
console.log("all ok");
