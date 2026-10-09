// T17a next-cue shots at 393x852 (Chromium, Playwright from tests/node_modules). Local serve.py only.
// usage: node shot-next-cue.mjs <baseUrl> <outDir>
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
const require = createRequire(new URL("../../../tests/package.json", import.meta.url));
const pw = require("playwright-core");
const [BASE, OUT] = process.argv.slice(2);
mkdirSync(OUT, { recursive: true });
const U = q => `${BASE}/try/next-cue-variants.html?bare=1&${q}`;
const b = await pw.chromium.launch({ args: ["--no-sandbox"] });
const ctx = async rm => b.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, reducedMotion: rm ? "reduce" : "no-preference" });
const ready = p => p.waitForFunction(() => document.querySelector("#sprite symbol"), null, { timeout: 8000 });
// covers: does the cue's box hit the question card or a choice row (visible parts)?
const covers = () => { const cue = [document.querySelector("#nx.cue"), document.querySelector("#res2.on"), document.querySelector("#sheet3.on")].filter(Boolean);
  const sc = document.querySelector("#scroll").getBoundingClientRect();
  const hit = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  const vis = r => ({ left: r.left, right: r.right, top: Math.max(r.top, sc.top), bottom: Math.min(r.bottom, sc.bottom) });
  const live = [...document.querySelectorAll(".p, #choices .opt")].map(e => vis(e.getBoundingClientRect())).filter(r => r.bottom > r.top);
  return cue.map(c => (c.id || c.className) + ":" + (live.some(l => hit(c.getBoundingClientRect(), l)) ? "COVERS" : "clear")).join(" ") || "no cue"; };
const res = [];
async function shot(name, q, { rm = false, wait = 2500 } = {}) {
  const c = await ctx(rm), p = await c.newPage();
  await p.goto(U(q)); await ready(p); await p.waitForTimeout(wait);
  const cv = await p.evaluate(covers), inview = await p.evaluate(() => { const e = document.querySelector("#res2.on, #sheet3.on, #nx.cue"); if (!e) return "-"; const r = e.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight ? "in view" : "OFF SCREEN"; });
  await p.screenshot({ path: `${OUT}/${name}-chromium-393x852.png` });
  res.push(`${name}: ${cv}; cue ${inview}`); await c.close();
}
// one-blink: play the real flow (tap a choice) and sample the distinct animated elements every 20 ms for 3 s
async function blinkMax(name, q, pick, rm = false) {
  const c = await ctx(rm), p = await c.newPage();
  await p.goto(U(q + "&s=open")); await ready(p); await p.waitForTimeout(300);
  await p.click(`.ch[data-id="${pick}"] .opt`);
  const r = await p.evaluate(() => new Promise(done => { let max = 0, at = []; const t0 = performance.now();
    const t = setInterval(() => { const x = window.__running(); if (x.length > max) { max = x.length; at = x; }
      if (performance.now() - t0 > 4500) { clearInterval(t); done({ max, at }); } }, 20); }));
  res.push(`one-blink ${name}: max ${r.max} animated element(s) at once [${r.at.join(", ")}]`); await c.close();
}
try {
  for (const v of [1, 2, 3]) {
    await shot(`v${v}-before`, `v=${v}&s=before&r=ok`);
    await shot(`v${v}-after`, `v=${v}&s=after&r=ok`);
    await shot(`v${v}-out-after`, `v=${v}&s=after&r=out`);
    await shot(`v${v}-after-rm`, `v=${v}&s=after&r=ok`, { rm: true });
    await blinkMax(`v${v} correct`, `v=${v}`, "c");
    await blinkMax(`v${v} out+cluck stream`, `v=${v}&cluck=1`, "a");
    await blinkMax(`v${v} correct, reduced motion`, `v=${v}`, "c", true);
  }
  await shot("v1-peak", "v=1&s=after&r=ok&peak=1");
} finally { await b.close(); }
console.log(res.join("\n"));
