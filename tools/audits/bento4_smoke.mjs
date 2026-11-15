// bento4 PR2 smoke: node tools/audits/bento4_smoke.mjs [sets-per-config=150]   (no browser). Random option sets through the real bento_cost.js:
// exact cover (no holes / overlap, inside), reading order, determinism, hero caps, no 1x3, phone sentences wide, layout p95 < 5 ms,
// AMBITION: share of tiles > 1 cell over random N>=5 sets in 50..70 %, plus hero rate / fallback rate reported.
import assert from "node:assert/strict";
import { load, measure, mulberry, randomSet, check } from "./bento_synth.mjs";
const { Feat, Cost } = load(), SETS = +(process.argv[2] || 150);
const CFG = [[1000, 6], [800, 5], [600, 4], [358, 3], [358, 4]], rng = mulberry(20261115);
const ms = [], big = { n: 0, tiles: 0, sets: 0, hero: 0, fb: 0, relaxed: 0 }, per = {}, shapes = {}; let tot = 0;
for (const [R, C] of CFG) {
  let share = [0, 0], sets = 0, bigSets = 0, heroSets = 0;
  for (let s = 0; s < SETS; s++) {
    const N = 2 + Math.floor(rng() * 7), texts = randomSet(rng, N, null);
    if (C === 4 && R < 520) { for (let i = 0; i < N; i++) texts[i] = ["$7$", "$5.20$", "Yes", "No", "A", "$x^2$", "$9$", "$0.5$"][Math.floor(rng() * 8)]; }
    const m = texts.map(t => measure(t, R, C)), seed = "q" + s, t0 = performance.now(), cells = Cost.layout(m, R, C, { seed });
    ms.push(performance.now() - t0); tot++;
    const bad = check(cells, C, N); assert.deepEqual(bad, [], `cover/order ${R}x${C} N${N} ${texts.join(" | ").slice(0, 120)}`);
    assert.equal(JSON.stringify(Cost.layout(m, R, C, { seed })), JSON.stringify(cells), "deterministic");
    const g = Feat.geom(R, C), F = Feat.classifyAll(m, g), info = cells.info;
    cells.forEach((c, i) => {
      assert.ok(!(c.cs === 1 && c.rs >= 3), "no 1x3"); if (!info.fallback) assert.ok(!(c.cs === 3 && c.rs === 2 && C < 5 && C !== 3), "3x2 needs C>=5");
      if (g.phone && c.cs === 1 && !info.fallback && F[i].cls !== "TOKEN" && !F[i].mathOnly) assert.ok(F[i].cls === "SHORT" && c.rs === 1, "phone: sentences wide " + F[i].cls);
      shapes[c.cs + "x" + c.rs] = (shapes[c.cs + "x" + c.rs] || 0) + 1;
    });
    const heroes = cells.filter((c, i) => c.cs >= 2 && c.rs >= 2 && c.cs < C && F[i].minCells < 4).length;
    if (!info.fallback && !info.relaxed) assert.ok(heroes <= (N >= 7 && C >= 6 ? 2 : 1), `hero cap ${heroes} N${N} C${C}`);
    if (info.fallback) big.fb++; if (info.relaxed) big.relaxed++;
    if (N >= 5) { sets++; share[0] += cells.filter(c => c.cs * c.rs > 1).length; share[1] += N; if (cells.some(c => c.cs >= 2 && c.rs >= 2 && c.cs < C)) bigSets++; if (heroes) heroSets++; }
  }
  per[`${R}/C${C}`] = { share: +(100 * share[0] / share[1]).toFixed(1), heroRate: +(100 * heroSets / sets).toFixed(1), bigRate: +(100 * bigSets / sets).toFixed(1) };
  big.n += share[0]; big.tiles += share[1]; big.sets += sets; big.hero += heroSets;
}
ms.sort((a, b) => a - b); const p95 = ms[Math.floor(ms.length * .95)], pmax = ms[ms.length - 1];
const SH = 100 * big.n / big.tiles;
console.log(JSON.stringify({ layouts: tot, shareGt1x1: +SH.toFixed(1), heroRatePct: +(100 * big.hero / big.sets).toFixed(1), fallbackPct: +(100 * big.fb / tot).toFixed(2), relaxedPct: +(100 * big.relaxed / tot).toFixed(2), p95ms: +p95.toFixed(2), maxMs: +pmax.toFixed(2), per, shapes }));
assert.ok(SH >= 50 && SH <= 70, `ambition: share of tiles > 1 cell must be 50..70 %, got ${SH.toFixed(1)}`);
assert.ok(p95 < 5, `layout p95 ${p95.toFixed(2)} ms >= 5`);
assert.ok(big.fb / tot < .05, "fallback (stacked) rate < 5 %");
console.log("bento4 smoke ok");
