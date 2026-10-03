// Math in choice rows wraps cleanly at every width (design/STYLE.md "Math in text"):
// no punctuation alone at the start of a line after math, no formula broken over lines ("d =" / "- x" alone), no inline math
// wider than its row, no word split mid-word.
// Starts its own serve.py with a throwaway bank of nasty rows:   node tests/katex-wrap.pw.mjs [port]
// Survey real banks instead (counts only, no verdict):           KW_BANKS=<dir with BANK_*.json> node tests/katex-wrap.pw.mjs [port]
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { pw = require("/opt/node22/lib/node_modules/playwright"); }

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = +(process.argv[2] || 8823), BASE = `http://localhost:${PORT}`;
const TMP = mkdtempSync(join(tmpdir(), "kw-"));
const SURVEY = process.env.KW_BANKS || "";
let BANKS = SURVEY;
if (!SURVEY) {
  BANKS = join(TMP, "banks"); mkdirSync(BANKS);
  const mc = (code, rows) => ({ code, type: "mc", body: [{ type: "text", md: "Which is right?" }],
    choices: rows.map((md, i) => ({ id: "abcde"[i], md })), correct: "a" });
  const P = [
    mc("CALC1_KW1", ["The normal force equals $mg\\cos\\theta$.", "The net force on the car is $m\\dfrac{v^2}{r}$, toward the center.",
      "Friction ($\\mu_s N$) points down the bank.", "Its speed is $\\sqrt{rg\\,\\dfrac{\\sin\\theta+\\mu_s\\cos\\theta}{\\cos\\theta-\\mu_s\\sin\\theta}}$."]),
    mc("CALC1_KW2", ["$d = \\dfrac{kx^2}{2mg(\\sin\\theta-\\mu_k\\cos\\theta)} - x$", "$d = \\dfrac{kx^2}{2mg(\\sin\\theta+\\mu_k\\cos\\theta)} + x + \\dfrac{\\mu_k mg\\cos\\theta\\,x}{mg\\sin\\theta}$.",
      "Kinetic energy is conserved; the collision is elastic, and $K_f = K_i = \\tfrac12 m_1 v_0^2$.", "Momentum along $x$: $m_1v_0 = m_1v_1\\cos30^\\circ + m_2v_2\\cos60^\\circ$."]),
    mc("CALC1_KW3", ["$T = 2\\pi(R+h)\\sqrt{\\dfrac{R+h}{GM_E}}$, about $7.32\\ \\text{h}$.", "$a = \\dfrac{GM_E}{(R_E+h)^2} = 0.6125\\ \\text{m/s}^2$;",
      "Escape speed ratio $\\left(1+\\dfrac{h}{R}\\right)^{-1/2}$!", "Power: $P = mgv\\sin\\theta = 71 \\times 9.80 \\times 2.7 \\times \\sin 26^\\circ$ watts."]),
  ];
  writeFileSync(join(BANKS, "BANK_KW1.json"), JSON.stringify({ v: 1, problems: P }));
}
const codes = readdirSync(BANKS).filter(f => /^BANK_[A-Z0-9]{3,6}\.json$/.test(f))
  .flatMap(f => JSON.parse(readFileSync(join(BANKS, f), "utf8")).problems.filter(p => p.type === "mc").map(p => p.code));
const srv = spawn("python3", [join(ROOT, "serve.py"), String(PORT)], { env: { ...process.env, STEM_BANKS: BANKS, STEM_TRIES: join(TMP, "tries.json") }, stdio: "ignore" });
for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + "/")).ok) break; } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 100)); }

/* runs in the page: one count per kind of bad wrap, plus where */
function measure() {
  const out = { orphan: 0, broken: 0, overflow: 0, split: 0, shrunk: 0, scrolled: 0, where: [] };
  const PUNCT = /^[.,;:!?)]/;
  for (const t of document.querySelectorAll("#q .opt .txt")) {
    const box = t.getBoundingClientRect(), row = t.closest(".opt").dataset.l;
    for (const k of t.querySelectorAll(".katex")) {
      const r = k.getBoundingClientRect(), sc = k.closest(".kx-scroll"), v = (sc || k).getBoundingClientRect();   // a scroller shows only its box
      if (v.right > box.right + 1 || v.left < box.left - 1) { out.overflow++; out.where.push(`${row} overflow`); }
      const bs = [...k.querySelectorAll(".katex-html > .base")].map(b => b.getBoundingClientRect());   // a new line starts below where the last one ended
      if (bs.some((b, i) => i && b.top >= bs[i - 1].bottom - 1)) { out.broken++; out.where.push(`${row} broken`); }
      if (sc) out.scrolled++;
      if (k.style.fontSize) out.shrunk++;
      const n = k.nextSibling;
      if (n && n.nodeType === 3 && PUNCT.test(n.data)) {
        const g = document.createRange(); g.setStart(n, 0); g.setEnd(n, 1);
        const c = g.getBoundingClientRect();                         // on the same line it sits right of the math
        if (c.left < r.right - 1) { out.orphan++; out.where.push(`${row} orphan "${n.data[0]}"`); }
      }
    }
    const w = document.createTreeWalker(t, NodeFilter.SHOW_TEXT, { acceptNode: n => n.parentElement.closest(".katex") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
    for (let n; (n = w.nextNode());) {
      for (const m of n.data.matchAll(/[A-Za-z]{2,}/g)) {
        const g = document.createRange(); g.setStart(n, m.index); g.setEnd(n, m.index + m[0].length);
        const tops = new Set([...g.getClientRects()].map(q => Math.round(q.top)));
        if (tops.size > 1) { out.split++; out.where.push(`${row} split "${m[0]}"`); }
      }
    }
  }
  return out;
}

const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
let bad = 0;
try {
  for (const width of [320, 390, 768, 1440]) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: "block", isMobile: width < 700, hasTouch: width < 700 });
    const page = await ctx.newPage();
    const tot = { orphan: 0, broken: 0, overflow: 0, split: 0, shrunk: 0, scrolled: 0 }, where = [];
    for (const code of codes) {
      await page.goto(`${BASE}/#${code}`);
      await page.waitForFunction(c => document.querySelector("#pcode")?.textContent === c && document.querySelector("#q .opt"), code, { timeout: 8000 });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(120);                                   // the fit pass runs on the next frame
      const m = await page.evaluate(measure);
      for (const k of Object.keys(tot)) tot[k] += m[k];
      where.push(...m.where.map(x => `${code} ${x}`));
    }
    const n = tot.orphan + tot.broken + tot.overflow + tot.split;   // shrunk / scrolled are the fixes at work, not faults
    bad += n;
    console.log(`${n ? "FAIL" : "ok  "} ${width}px: ${codes.length} problems, orphan ${tot.orphan}, broken ${tot.broken}, overflow ${tot.overflow}, split ${tot.split} (shrunk ${tot.shrunk}, scrolls ${tot.scrolled})`);
    for (const x of where.slice(0, 12)) console.log("       ", x);
    await ctx.close();
  }
} finally {
  await browser.close();
  srv.kill();
}
if (bad && !SURVEY) process.exit(1);
