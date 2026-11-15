// QCARD-SWISS v2 smoke (Tony Nov 15; brain ui-v7-decisions): under html.ui-v7 the question card is a hero: the question sentence is the big title bottom-left,
// the ECHO B ghost numeral (6 copies) sits behind it, the setup is folded with "Show all", the Twist chip stays visible (meta row), Ask Cluck stays top right
// and never beside the title; title and body share ONE left edge. Flag off: the card is untouched. Own serve.py + throwaway bank.   node tests/qcard.pw.mjs [port]
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
const long = { code: "PHYS_QL2", title: "Lift", type: "num", answer: "4", tol: 0.01, unit: "", how: "Whole number.", wrong: [{ value: "3", error: "off", hint: "QUACK. Count." }],
  body: [{ type: "text", md: "A $80\\ \\text{kg}$ student on the small piston balances a $1800\\ \\text{kg}$ elephant on a hydraulic lift piston of diameter $2.2\\ \\text{m}$; the lift holds oil of density $860\\ \\text{kg/m}^3$. At first the two pistons are at the same height. More students climb on. What is the smallest TOTAL number of students on the small piston?" }],
  saccharine: { title: "Lift", key: "Answer: 4" } };
mkdirSync(BANKS);
writeFileSync(join(BANKS, "BANK_QCS.json"), JSON.stringify({ v: 1, problems: [short, long] }));
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
  await page.goto(`${BASE}/?ui=${flag}#${code}`);
  await page.waitForSelector("#blocks .md", { timeout: 10000 });
  await page.evaluate(() => document.fonts && document.fonts.ready); await page.waitForTimeout(500);
  return page;
}
const geo = page => page.evaluate(() => {
  const r = s => { const e = document.querySelector(s); return e && e.getBoundingClientRect(); };
  const lead = document.querySelector("#blocks .qlead"), set = document.querySelector("#blocks .qsetup"), btn = document.querySelector("#cluckBtn");
  return { lead: lead && lead.textContent.trim(), l: r(".qlead"), s: set && r(".qsetup"), p: r("#problem"), b: btn && btn.getBoundingClientRect(), hero: r(".qhero"),
    ghosts: document.querySelectorAll(".qghost i").length, ghostHidden: document.querySelector(".qghostbox").getAttribute("aria-hidden"), twist: !!document.querySelector(".qmeta #twistChip"),
    fold: set && set.classList.contains("qfold"), show: !!document.querySelector(".qshow:not([hidden])"), sw: document.documentElement.scrollWidth, vw: innerWidth };
});
try {
  for (const w of [390, 1366]) {
    await step(`${w}: short question: the sentence is the title, bottom-left of the hero, 6 ghost copies, Twist chip kept in the meta row, Ask Cluck top right and clear of the title`, async () => {
      const page = await open(w, "v7", "PHYS_QS1");
      try {
        const g = await geo(page);
        assert.equal(g.lead, "How fast is a rolling ball at the bottom?"); assert.equal(g.ghosts, 6); assert.equal(g.ghostHidden, "true"); assert.ok(g.twist, "Twist chip in the meta row");
        assert.ok(g.l.bottom <= g.hero.bottom && g.hero.bottom - g.l.bottom < 120, "title low in the hero");
        assert.ok(g.b && g.b.right > g.p.right - 40 && g.b.top < g.p.top + 40, "Ask Cluck top right");
        assert.ok(g.b.bottom <= g.l.top, "title below the button, never beside it");
        assert.equal(g.sw, g.vw, "no horizontal scroll");
        assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector(".qghost i")).filter), "none", "LITE: blur 0");
      } finally { await page.context().close(); }
    });
    await step(`${w}: long question: last sentence is the title, setup folded under it on the same left edge, Show all opens it`, async () => {
      const page = await open(w, "v7", "PHYS_QL2");
      try {
        let g = await geo(page);
        assert.match(g.lead, /^What is the smallest TOTAL number/); assert.ok(g.s, "setup kept"); if (w < 500) assert.ok(g.fold && g.show, "folded + Show all"); assert.equal(g.fold, g.show, "Show all only when folded");
        assert.ok(Math.abs(g.l.left - g.s.left) < 0.5, "one left edge: title and setup");
        assert.ok(g.s.top >= g.l.bottom, "setup under the title");
        if (g.show) await page.click(".qshow"); g = await geo(page);
        assert.equal(g.fold, false, "Show all opens it");
      } finally { await page.context().close(); }
    });
  }
  await step("flag off: the card is the one app.js draws (no hero, no ghost, no fold)", async () => {
    const page = await open(1366, "off", "PHYS_QL2");
    try {
      assert.equal(await page.evaluate(() => document.querySelectorAll(".qhero, .qghostbox, .qlead, .qsetup, .qshow, #problem.qc7").length), 0);
    } finally { await page.context().close(); }
  });
} finally { await browser.close(); srv.kill(); }
if (failures) { console.log(`${failures} FAILED`); process.exit(1); }
console.log("all ok");
