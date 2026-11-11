// LADDER-UI (Tony's phone, Nov 3: Exam 3 welcome ladder, step 3 "Area of the big piston", A = π(□)², chips d/2 · d · 2d):
//   band      no step row is taller than what it shows: the unseen "why" follow-up kept its full
//             room (visibility: hidden) from the start, a ~200px empty band under the chips: it is now a masked preview in that room (W129 L6 kept)
//   contrast  every chip's text reads 4.5:1 on its real background (preview, live, done; opacity counted): a done step's other chips sat at 55%
//   weight    every chip border is --bw (1px) (STYLE.md "one weight"): the welcome chips were 1.5px
// 393 phone (touch) + 1280 + 721, sugar + diet. Own serve.py + a throwaway bank (no brain bank).   node tests/ladder-ui.pw.mjs <port> [shots dir]
//   LU_W=393 or LU_W=1280,721 picks the widths (default all).
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
const PORT = /^\d+$/.test(process.argv[2] || "") ? +process.argv[2] : 8887, BASE = `http://localhost:${PORT}`;
const TMP = mkdtempSync(join(tmpdir(), "ladder-ui-")), BANKS = join(TMP, "banks"), SHOTS = process.argv[3] || "";
const MAX_BAND = 16;                                                          // px between a row's last shown box and its foot (the row's own padding is --s2 = 8)
const welcome = {
  code: "PHYS_LQ1", type: "num", answer: "3.74", tol: 0.01, welcome: true, noob: { tier: 1 }, saccharine: { title: "Lift", tip: "Pressure = force / area.", key: "$P=F/A$\nAnswer: 3.74" },
  body: [{ type: "text", md: "A $70\\ \\text{kg}$ student on the small piston of a hydraulic lift balances a $1200\\ \\text{kg}$ elephant standing on the big piston, of diameter $2.0\\ \\text{m}$. Find that pressure (in kPa)." }],
  repair: { steps: [
    { id: "who", label: "Which weight presses on the big piston?", kind: "pick", opts: [{ id: "a", md: "the elephant's" }, { id: "b", md: "the student's" }, { id: "c", md: "both" }], ok: "a" },
    { id: "sheet", label: "Which formula line do you use for pressure?", kind: "sheet", pool: ["PRESSURE", "DENSITY", "P_DEPTH"], ok: "PRESSURE" },
    { id: "area", label: "Area of the big piston", kind: "fill", tex: "A=\\pi(▢)^2", opts: ["d/2", "d", "2d"], ok: "d/2", fam: "off-by-factor",
      miss: { d: "You used the diameter. What do you square in the area? QUACK." },
      why: { q: "Why half?", opts: ["the diameter is the radius", "you halve it for the second student", "area uses the radius, and the radius is half the diameter"], ok: 2 } },
    { id: "answer", label: "Final answer", kind: "num" }
  ] }
};
mkdirSync(BANKS);
writeFileSync(join(BANKS, "BANK_LUI.json"), JSON.stringify({ v: 1, problems: [welcome] }));
writeFileSync(join(BANKS, "formula-sheet.json"), JSON.stringify({ v: 3, groups: [{ name: "Fluids", rows: [
  { id: "PRESSURE", tex: "P=\\frac{F}{A}" }, { id: "DENSITY", tex: "\\rho=\\frac{M}{V}" }, { id: "P_DEPTH", tex: "P=P_0+\\rho g h" }] }] }));
const srv = spawn("python3", [join(ROOT, "server", "http_server", "serve.py"), String(PORT)], { env: { ...process.env, STEM_BANKS: BANKS, STEM_FRONT: "BANK_LUI", STEM_FRONT_TITLE: "Exam 3",
  STEM_TODAY: "2026-11-03", STEM_TRIES: join(TMP, "tries.json") }, stdio: "ignore" });
for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + "/")).ok) break; } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 100)); }

let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log("ok  ", name); } catch (e) { failures++; console.log("FAIL", name, "\n     ", String(e.message).slice(0, 900)); }
}
/* per row: its foot (border box minus its bottom padding) minus the lowest box it shows; a row of the ladder only */
const bands = page => page.evaluate(() => [...document.querySelectorAll("#q section.wl .rp-step")].map(li => {
  const r = li.getBoundingClientRect(), foot = r.bottom - parseFloat(getComputedStyle(li).paddingBottom);
  let low = r.top;
  for (const e of li.querySelectorAll("*")) {
    const cs = getComputedStyle(e);
    if (cs.visibility !== "visible" || !e.getClientRects().length || e.closest('[aria-hidden="true"].rp-miss')) continue;
    if (e.children.length && ![...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && !e.matches("button, input, svg, .katex")) continue;   // a wrapper: its kids count
    low = Math.max(low, e.getBoundingClientRect().bottom);
  }
  return { id: li.dataset.id, state: li.dataset.state, band: Math.round(foot - low) };
}));
/* every shown chip: its text's contrast on its real background (the chip's fill over the card, the chip's opacity counted) + its border width */
const chips = page => page.evaluate(() => {
  const rgba = s => {
    let m = /rgba?\(([^)]+)\)/.exec(s);
    if (m) { const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p[3] == null ? 1 : p[3]]; }
    m = /color\(srgb ([^)]+)\)/.exec(s);
    if (m) { const p = m[1].split(/[\s/]+/).filter(Boolean).map(Number); return [p[0] * 255, p[1] * 255, p[2] * 255, p[3] == null ? 1 : p[3]]; }
    return [0, 0, 0, 0];
  };
  const over = (f, b) => [0, 1, 2].map(i => f[i] * f[3] + b[i] * (1 - f[3])).concat(1);
  const lum = c => { const [r, g, b] = c.slice(0, 3).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const bgUnder = el => {                                                    // the colours under el, composited from the page up
    const chain = []; for (let e = el; e; e = e.parentElement) chain.unshift(rgba(getComputedStyle(e).backgroundColor));
    return chain.reduce((b, f) => over(f, b), [0, 0, 0, 1]);
  };
  return [...document.querySelectorAll("#q section.wl .rp-chip")].filter(c => c.getClientRects().length && getComputedStyle(c).visibility === "visible" && !c.closest(".rp-mask")).map(c => {   // a masked why preview shows no words
    let o = 1; for (let e = c; e && !e.matches("section.wl"); e = e.parentElement) o *= +getComputedStyle(e).opacity;
    const cs = getComputedStyle(c), under = bgUnder(c.parentElement), fill = over(rgba(cs.backgroundColor), under);
    const t = over(rgba(cs.color), fill), mix = (a, b) => [0, 1, 2].map(i => a[i] * o + b[i] * (1 - o)).concat(1);
    const box = c.closest(".rp-val-ui, .rp-why");
    return { step: c.closest(".rp-step").dataset.id, text: c.textContent.replace(/\s+/g, " ").trim().slice(0, 24), how: box.classList.contains("rp-ghost") ? "preview" : box.classList.contains("rp-locked") ? "done" : "live",
      cr: +ratio(mix(t, under), mix(fill, under)).toFixed(2), bw: cs.borderTopWidth };
  });
});
const W = (process.env.LU_W || "393,1280,721").split(",").map(Number);
const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
try {
  for (const mode of ["sugar", "diet"]) for (const w of W) {
    const T = `${mode} ${w}`, phone = w < 500;
    const ctx = await browser.newContext({ viewport: { width: w, height: phone ? 852 : 800 }, hasTouch: phone, isMobile: phone, deviceScaleFactor: phone ? 3 : 1, serviceWorkers: "block" });   // DPR 3 (iPhone): a 1.5px border computes as 1.5px (DPR 1 floors it to 1)
    await ctx.route(/youtube|ytimg|googlevideo/, r => r.abort());
    if (mode === "diet") await ctx.addCookies([{ name: "stem-mode", value: "diet", url: BASE }, { name: "stem-mode-v", value: "2", url: BASE }]);
    await ctx.addInitScript(() => { try { localStorage.setItem("stem-ob", "done"); for (const b of ["right", "miss", "three", "redo"]) localStorage.setItem("stem-ob-rw-" + b, "9"); } catch { /* blocked */ } });
    const page = await ctx.newPage(), errs = [];
    page.on("pageerror", e => errs.push(String(e)));
    const act = '#q .rp-step[data-state="active"]';
    const noBand = async when => {
      const b = await bands(page), bad = b.filter(x => x.band > MAX_BAND);
      assert.deepEqual(bad, [], `${when}: a row taller than what it shows (max ${MAX_BAND}px): ${JSON.stringify(b)}`);
    };
    const readable = async when => {
      const c = await chips(page), bad = c.filter(x => x.cr < 4.5 || x.bw !== "1px");
      assert.deepEqual(bad, [], `${when}: a chip under 4.5:1 or not 1px: ${JSON.stringify(bad)}`);
    };
    try {
      await page.goto(BASE + "/");
      await page.waitForSelector('#q .wl .rp-step[data-state="active"] .rp-chip', { timeout: 10000 });
      await page.evaluate(() => document.fonts && document.fonts.ready);
      await step(`${T}: open: no empty band under any row (step 3's preview chips end its row); chips 4.5:1, 1px`, async () => {
        await noBand("open"); await readable("open");
      });
      await page.click(`${act} .rp-chip[data-v="a"]`);
      await page.click(`${act} .rp-chip[data-v="PRESSURE"]`);
      await page.waitForSelector('#q .rp-step[data-id="area"][data-state="active"]');
      await step(`${T}: step 3 live (A = π(□)², d/2 · d · 2d): its row ends at its chips; done chips 4.5:1`, async () => {
        await noBand("step 3 live"); await readable("step 3 live");
        const pv = await page.evaluate(() => { const w = document.querySelector('#q .rp-step[data-id="area"] .rp-why'), t = w && w.querySelector(".rp-mask-t"), r = w && w.querySelector(".rp-real");
          return { mask: !!w && w.classList.contains("rp-mask"), shown: t && getComputedStyle(t).visibility === "visible" ? t.textContent : null, real: r ? getComputedStyle(r).color : null, h: w ? Math.round(w.getBoundingClientRect().height) : 0 }; });
        assert.ok(pv.mask && pv.shown === "Why is that?" && pv.real === "rgba(0, 0, 0, 0)" && pv.h > 0, "before d/2 the why is a masked preview (no 'Why half?'): " + JSON.stringify(pv));
        if (SHOTS) await page.locator('#q .rp-step[data-id="area"]').screenshot({ path: join(SHOTS, `lu-area-${mode}-${w}.png`) });
      });
      await page.click(`${act} .rp-chip[data-v="d"]`);
      await page.waitForSelector('#q .rp-step[data-id="area"] .rp-miss');
      await page.click(`${act} .rp-chip[data-v="d/2"]`);
      await page.waitForSelector('#q .rp-step[data-id="area"] .rp-why .rp-chip:not(:disabled)', { state: "visible" });
      await step(`${T}: wrong then right: the why shows its words in its own room (desk-layout pins that nothing moves); no band`, async () => {
        const m = await page.evaluate(() => { const w = document.querySelector('#q .rp-step[data-id="area"] .rp-why'); return { mask: w.classList.contains("rp-mask"), q: w.querySelector(".rp-q").textContent }; });
        assert.deepEqual(m, { mask: false, q: "Why half?" }, "the why after d/2");
        await noBand("why open");
      });
      await page.click(`${act} .rp-why .rp-chip[data-why="2"]`);
      await page.waitForSelector('#q .rp-step[data-id="answer"][data-state="active"]');
      await step(`${T}: step 3 done: no band, every chip 4.5:1 and 1px; no sideways scroll; no page errors`, async () => {
        await noBand("step 3 done"); await readable("step 3 done");
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "sideways scroll");
        assert.deepEqual(errs, [], "page errors");
      });
    } finally { await ctx.close(); }
  }
} finally { await browser.close(); srv.kill(); }
console.log(failures ? `\n${failures} failing` : "\nall ok");
process.exit(failures ? 1 : 0);
