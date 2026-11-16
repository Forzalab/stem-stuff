// QCARD-SWISS v3 smoke (owner pick V3, Nov 15; brain ui-v7-decisions): under html.ui-v7 the question card is ONE surface, top to bottom: ghost numeral (ECHO trail, 6 copies), headline,
// ONE text block (setup + the question sentence; scrolls inside past a max height, no Show all), meta row (exam . q#, Twist chip, answer hint). Ask Cluck top right, SOLID (opaque, no border)
// and never over the numeral's front copy. The echo animates on prev/next (transform + opacity only, will-change only while it runs, none under reduced motion). Flag off: untouched.
// Own serve.py + throwaway bank.   node tests/qcard.pw.mjs [port]
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
writeFileSync(join(BANKS, "BANK_QCS.json"), JSON.stringify({ v: 1, problems: [short, long, ...filler] }));
const srv = spawn("python3", [join(ROOT, "server", "http_server", "serve.py"), String(PORT)], { env: { ...process.env, STEM_BANKS: BANKS, STEM_FRONT: "BANK_QCS", STEM_FRONT_TITLE: "Exam 3",
  STEM_TODAY: "2026-11-03", STEM_TRIES: join(TMP, "tries.json"), CLAUDE_API: "" }, stdio: "ignore" });
for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + "/")).ok) break; } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 100)); }
let failures = 0;
async function step(name, fn) { try { await fn(); console.log("ok  ", name); } catch (e) { failures++; console.log("FAIL", name, "\n     ", String(e.message).slice(0, 900)); } }
const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
async function open(w, flag, code) {
  const phone = w < 500;
  const ctx = await browser.newContext({ viewport: { width: w, height: phone ? 852 : 800 }, hasTouch: phone, isMobile: phone, deviceScaleFactor: 1, serviceWorkers: "block" });
  await ctx.addInitScript(() => { try { localStorage.setItem("stem-ob", "done"); localStorage.setItem("stem-jev", "0"); localStorage.setItem("stem-twist-seen", "1"); } catch { /* blocked */ } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/?ui=${flag}&qcecho=tl#${code}`);   // tl = the old top-left numeral layout these geometry checks pin; default is qbr (QC-NOFRONT)
  await page.waitForSelector("#blocks .md", { timeout: 10000 });
  await page.evaluate(() => document.fonts && document.fonts.ready); await page.waitForTimeout(500);
  return page;
}
const geo = page => page.evaluate(() => {
  const r = s => { const e = document.querySelector(s); return e && e.getBoundingClientRect(); };
  const lead = document.querySelector("#blocks .qlead"), set = document.querySelector("#blocks .qsetup"), btn = document.querySelector("#cluckBtn"), tx = document.querySelector("#blocks .qscroll");
  const cs = btn && getComputedStyle(btn), alpha = c => { const m = c.match(/rgba?\(([^)]+)\)/); const v = m[1].split(/[ ,\/]+/).filter(Boolean); return v.length > 3 ? +v[3] : 1; };
  return { lead: lead && lead.textContent.trim(), l: r(".qlead"), s: set && r(".qsetup"), p: r("#problem"), b: btn && btn.getBoundingClientRect(), front: r(".qghost i:nth-child(1)"), head: r(".qhead"), meta: r(".qmeta"),
    headTx: (document.querySelector(".qhead") || {}).textContent, gbox: r(".qghostbox"), qtx: (document.querySelector(".qtext") || {}).textContent, gap: document.querySelector(".qhead").getBoundingClientRect().top - document.querySelector(".qghostbox").getBoundingClientRect().bottom, metaTx: (document.querySelector(".qmeta") || {}).textContent,
    ghosts: document.querySelectorAll(".qghost i").length, ghostHidden: document.querySelector(".qghostbox").getAttribute("aria-hidden"), twist: !!document.querySelector(".qmeta #twistChip"),
    chipAlpha: alpha(cs.backgroundColor), chipBorder: cs.borderTopWidth, chipShadow: cs.boxShadow, qOut: !document.querySelector(".qscroll .qlead"), scrollTop: tx ? tx.scrollTop : -1, txOv: tx && getComputedStyle(tx).overflowY, txMax: tx && getComputedStyle(tx).maxHeight, txH: tx && tx.clientHeight,
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
        assert.ok(g.gbox.bottom <= g.head.top + 0.5, "numeral block above the headline"); assert.ok(g.l.bottom <= g.meta.top + 0.5, "meta under the text");
        assert.ok(g.b && g.b.right > g.p.right - 40 && g.b.top < g.p.top + 40, "Ask Cluck top right");
        assert.equal(g.chipAlpha, 1, "chip fill opaque"); assert.equal(g.chipBorder, "0px", "chip: no border"); assert.match(g.chipShadow, /0px 1px 2px/, "tight under-shadow"); assert.doesNotMatch(g.chipShadow, /0px 0px 0px 6px/, "no halo ring");
        assert.ok(!hit(g.b, g.front), "chip box does not touch the front numeral");
        assert.equal(g.show, 0, "no Show all"); assert.equal(g.sw, g.vw, "no horizontal scroll");
        assert.ok(!/Schibsted/.test(await page.evaluate(() => getComputedStyle(document.querySelector("#ans, #q input, #q textarea")).fontFamily)), "inputs keep Atkinson");
      } finally { await page.context().close(); }
    });
    await step(`${w}: long question: setup then the question in ONE text block on one left edge, scroll container with a max height, no Show all`, async () => {
      const page = await open(w, "v7", "PHYS_QL2");
      try {
        const g = await geo(page);
        assert.match(g.lead, /^What is the smallest TOTAL number/); assert.ok(g.s, "setup kept");
        assert.ok(Math.abs(g.l.left - g.s.left) < 0.5 && Math.abs(g.head.left - g.s.left) < 0.5 && Math.abs(g.meta.left - g.s.left) < 0.5, "one left edge: headline, text, meta");
        assert.ok(g.s.top < g.l.top, "setup above the question");
        assert.equal(g.headTx, "Hydraulic lift", "whole topic word"); assert.ok(g.gap <= 17, "no empty band under the numeral: " + g.gap);
        assert.ok(g.qtx.includes("2.55\u00a0m"), "number + unit joined by a no-break space"); assert.ok(!/\s[.,;:?]/.test(g.qtx), "no stray space before punctuation: " + g.qtx.match(/.{8}\s[.,;:?].{3}/));
        assert.equal(g.txOv, "auto"); assert.equal(g.txMax, w < 900 ? "170px" : "190px"); assert.ok(g.txH <= (w < 900 ? 170 : 190) + 1, "setup scroll box capped"); assert.ok(g.qOut, "question sits outside the scroll box"); assert.equal(g.scrollTop, 0, "scroll box starts at its first line");
        assert.equal(g.show, 0, "no Show all"); assert.ok(!hit(g.b, g.front), "chip clear of the numeral");
      } finally { await page.context().close(); }
    });
  }
  await step("text block scrolls inside when over the max height (long setup)", async () => {
    const page = await open(390, "v7", "PHYS_QL2");
    try {
      await page.evaluate(() => { const t = document.querySelector(".qscroll"); const d = document.createElement("div"); d.className = "md qsetup"; d.innerHTML = "<p>" + "More setup text that goes on and on. ".repeat(40) + "</p>"; t.insertBefore(d, t.firstChild); });
      const o = await page.evaluate(() => { const t = document.querySelector(".qscroll"); t.scrollTop = 9999; t.dispatchEvent(new Event("scroll")); const l = document.querySelector(".qlead").getBoundingClientRect(), c = document.querySelector("#problem").getBoundingClientRect(); return { h: t.clientHeight, sh: t.scrollHeight, st: t.scrollTop, qft: t.classList.contains("qft"), qfb: t.classList.contains("qfb"), leadIn: l.top >= c.top && l.bottom <= c.bottom }; });
      assert.ok(o.sh > o.h && o.st > 0 && o.h <= 171 && o.qft && !o.qfb && o.leadIn, JSON.stringify(o));
    } finally { await page.context().close(); }
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
        else { assert.equal(a.length, 6, "6 trail copies animate"); assert.ok(a.every(x => x.k === "opacity,transform"), JSON.stringify(a)); assert.ok(a.every(x => /transform/.test(x.wc)), "will-change while running"); }
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
            return { n: gh.dataset.n, ink, text: r(".qhead").left - card.left, textR: card.right - r(".qmeta").right, inkRel: ink - card.left, qlead: r(".qlead").left - card.left, hit: b.left < fr.right && fr.left < b.right && b.top < fr.bottom && fr.top < b.bottom }; });
          edges.push(e);
        }
        const t0 = edges[0].text;
        for (const e of edges) { assert.ok(Math.abs(e.text - t0) < 0.5 && Math.abs(e.qlead - t0) < 0.5, `${w}: text left moved at q${e.n}: ${JSON.stringify(e)}`); assert.ok(Math.abs(e.inkRel - e.text) <= 1, `${w}: numeral ink edge ${e.inkRel} vs text ${e.text} at q${e.n}`); assert.ok(!e.hit, `${w}: chip touches the numeral at q${e.n}`); }
        assert.ok(Math.abs(edges[0].textR - t0) <= 1, "symmetric inner padding: right margin = left");
      } finally { await page.context().close(); }
    }
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
