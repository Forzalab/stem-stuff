// GAP-1 (Tony, phone): a wrong pick on a welcome fill step put Cluck's hint at the very foot of the sheet, a half-screen band under the
// chips: the step's "why" follow-up keeps its room (hidden, for its right pick) and sat between the chips and the hint line.
// The hint must sit right under the chips. Own serve.py + throwaway banks.   node tests/repair-gap.pw.mjs [port]   SIZES=360x740,390x844,1280x800
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { pw = require("/opt/node22/lib/node_modules/playwright"); }

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = +(process.argv[2] || 8886), BASE = `http://localhost:${PORT}`;
const TMP = mkdtempSync(join(tmpdir(), "repair-gap-")), BANKS = join(TMP, "banks");
const MAX_GAP = 48;                                                         // px chips -> hint (the normal step gap is --s2 = 8)
const MISS_D = "You used the diameter. What do you square in the area? QUACK.", MISS_W0 = "A diameter is not a radius. Which one does the area use?";   // todo 76: per-option lines
const sac = n => ({ title: `Gap ${n}`, tip: "Pressure = force / area.", key: "$P=F/A$\nAnswer: 4" });
const welcome = {
  code: "PHYS_GQ1", type: "num", answer: "3.74", tol: 0.01, welcome: true, noob: { tier: 1 }, saccharine: sac(0),
  body: [{ type: "text", md: "A $70\\ \\text{kg}$ student on the small piston of a hydraulic lift balances a $1200\\ \\text{kg}$ elephant standing on the big piston, of diameter $2.0\\ \\text{m}$. Find that pressure (in kPa)." }],
  repair: { steps: [
    { id: "who", label: "Which weight presses on the big piston?", kind: "pick", opts: [{ id: "a", md: "the elephant's" }, { id: "b", md: "the student's" }, { id: "c", md: "both" }], ok: "a" },
    { id: "sheet", label: "Which formula line do you use for pressure?", kind: "sheet", pool: ["PRESSURE", "DENSITY", "P_DEPTH"], ok: "PRESSURE",
      why: { q: "Why this line?", opts: ["pressure is mass per volume", "pressure is force per area", "pressure grows with depth here"], ok: 1 } },
    { id: "area", label: "Area of the big piston", kind: "fill", tex: "A=\\pi(▢)^2", opts: ["d/2", "d", "2d"], ok: "d/2", fam: "off-by-factor",
      miss: { d: MISS_D },
      why: { q: "Why half?", opts: ["the diameter is the radius", "you halve it for the second student", "area uses the radius, and the radius is half the diameter"], ok: 2,
        miss: { 0: MISS_W0 } } },
    { id: "answer", label: "Final answer", kind: "num" }
  ] }
};
mkdirSync(BANKS);
writeFileSync(join(BANKS, "BANK_GAP.json"), JSON.stringify({ v: 1, problems: [welcome] }));
writeFileSync(join(BANKS, "formula-sheet.json"), JSON.stringify({ v: 3, groups: [{ name: "Fluids", rows: [
  { id: "PRESSURE", tex: "P=\\frac{F}{A}" }, { id: "DENSITY", tex: "\\rho=\\frac{M}{V}" }, { id: "P_DEPTH", tex: "P=P_0+\\rho g h" }] }] }));
const srv = spawn("python3", [join(ROOT, "server", "serve.py"), String(PORT)], { env: { ...process.env, STEM_BANKS: BANKS, STEM_FRONT: "BANK_GAP", STEM_FRONT_TITLE: "Exam 3",
  STEM_TODAY: "2026-10-23", STEM_TRIES: join(TMP, "tries.json") }, stdio: "ignore" });
for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + "/")).ok) break; } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 100)); }

const SIZES = (process.env.SIZES || "360x740,390x844,1280x800").split(",").map(s => { const [w, h] = s.split("x").map(Number); return { name: s, w, h }; });
let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); } catch (e) { failures++; console.log("FAIL", name, "\n     ", String(e.message).slice(0, 900)); }
}
const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
try {
  for (const sz of SIZES) {
    await step(`${sz.name}: a wrong pick on the fill step: its own line (chip + why chip), under the chips (gap <= ${MAX_GAP}px, no empty band)`, async () => {
      const ctx = await browser.newContext({ viewport: { width: sz.w, height: sz.h }, serviceWorkers: "block" });
      await ctx.route(/youtube|ytimg|googlevideo/, r => r.abort());
      await ctx.addInitScript(() => { try { localStorage.setItem("stem-ob", "done"); for (const b of ["right", "miss", "three", "redo"]) localStorage.setItem("stem-ob-rw-" + b, "9"); } catch { /* blocked */ } });
      const page = await ctx.newPage();
      try {
        await page.goto(BASE + "/");
        await page.waitForSelector('#q .wl .rp-step[data-state="active"] .rp-chip', { timeout: 10000 });
        await page.evaluate(() => document.fonts && document.fonts.ready);
        const act = '#q .rp-step[data-state="active"]';
        await page.click(`${act} .rp-chip[data-v="a"]`);
        await page.click(`${act} .rp-chip[data-v="PRESSURE"]`);
        await page.waitForSelector('#q .rp-step[data-id="area"][data-state="active"]');
        await page.click(`${act} .rp-chip[data-v="d"]`);                      // the wrong pick
        await page.waitForSelector('#q .rp-step[data-id="area"] .rp-miss', { timeout: 5000 });
        const m = await page.evaluate(() => {
          const li = document.querySelector('#q .rp-step[data-id="area"]'), chips = [...li.querySelectorAll(".rp-opts .rp-chip")].filter(c => !c.closest(".rp-why"));
          const hint = li.querySelector(".rp-miss"), cb = Math.max(...chips.map(c => c.getBoundingClientRect().bottom));
          return { gap: hint.getBoundingClientRect().top - cb, text: hint.textContent, vis: getComputedStyle(hint).visibility, whyH: li.querySelector(".rp-why").getBoundingClientRect().height };
        });
        assert.ok(m.text && m.vis === "visible", "the hint is not shown: " + JSON.stringify(m));
        assert.ok(m.gap >= 0 && m.gap <= MAX_GAP, `chips -> hint gap ${Math.round(m.gap)}px (max ${MAX_GAP}); the unseen why block is ${Math.round(m.whyH)}px tall`);
        console.log(`     ${sz.name} gap ${Math.round(m.gap)}px`);
        assert.equal(m.text, MISS_D, "a wrong chip with a miss line shows THAT line, not the generic hint");
        await page.click(`${act} .rp-chip[data-v="d/2"]`);
        await page.click(`${act} .rp-why .rp-chip[data-why="0"]`);        // a wrong why chip with a line (todo 76)
        await page.waitForFunction(t => [...document.querySelectorAll("#q .rp-miss")].some(e => e.textContent === t && getComputedStyle(e).visibility === "visible"), MISS_W0, { timeout: 5000 });
      } finally { await ctx.close(); }
    });
  }
} finally { await browser.close(); srv.kill(); }
console.log(failures ? `\n${failures} failing` : "\nall ok");
process.exit(failures ? 1 : 0);
