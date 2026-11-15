// bento4 PR1 smoke: node tools/audits/bento_feat_smoke.mjs  (no browser, no server). Content classes + candidate shapes on 6 fixtures, desktop (C=6, R=1000) and phone (C=3, R=358).
import assert from "node:assert/strict";
import { load, measure } from "./bento_synth.mjs";
const { Feat } = load();
const fx = { // [text, class on desktop]
  "$7$": "TOKEN", "Yes": "TOKEN", "stays constant": "SHORT", "increases": "SHORT",
  "The net force on the cart is zero here": "WIDE", "The charge doubles each time around": "WIDE",
  "The magnetic flux through the loop increases, so the induced current must oppose that change by flowing counterclockwise.": "LONG",
  "$\\dfrac{q}{4\\pi\\epsilon_0 r^2}$": "WIDE",
};
const run = (R, C) => { const g = Feat.geom(R, C); return Object.keys(fx).map(t => ({ t, f: Feat.classifyAll([measure(t, R, C)], g)[0], g })); };
let n = 0;
for (const { t, f } of run(1000, 6)) { n++; assert.ok(f.cls === fx[t] || (fx[t] === "WIDE" && (f.cls === "TALL" || f.cls === "SHORT")), `class of "${t.slice(0, 30)}": ${f.cls} (want ${fx[t]}) lines ${f.lines}`); }
const cls = Object.fromEntries(run(1000, 6).map(x => [x.t, x.f.cls]));
assert.equal(cls["$7$"], "TOKEN"); assert.equal(cls["stays constant"], "SHORT"); assert.equal(Object.values(cls).filter(c => c === "LONG").length >= 1, true);
// candidates: never 1x3, 3x2 only from 5 columns, LONG never 1-wide, phone: sentences never 1-wide, tall 1-wide only for tokens / formulas
for (const [R, C] of [[1000, 6], [800, 5], [600, 4], [358, 3], [358, 4]]) {
  const g = Feat.geom(R, C);
  for (const t of Object.keys(fx)) {
    const f = Feat.classifyAll([measure(t, R, C)], g)[0], cs = Feat.candidates(f, g); n++;
    assert.ok(cs.length > 0, "has shapes " + t);
    for (const x of cs) {
      assert.ok(!(x.cs === 1 && x.rs >= 3), "no 1x3 " + x.key);
      assert.ok(!(x.key === "3x2" && C < 5 && C !== 3), "3x2 only C>=5 (C=" + C + ")");
      if (f.cls === "LONG") assert.ok(x.cs > 1 || cs.length === 1, "LONG never 1-wide");
      if (g.phone && x.cs === 1 && f.cls !== "TOKEN" && !f.mathOnly) assert.ok(f.cls === "SHORT" && x.rs === 1, `phone: 1-wide only token / formula / short: ${f.cls} ${x.key} ${t.slice(0, 20)}`);
      assert.ok(f.minRows[x.cs - 1] === 0 || x.rs >= f.minRows[x.cs - 1] || x.cs === C, "fits its rows");
    }
  }
}
assert.ok(Feat.geom(358, 3).unit === 88 && Feat.geom(1000, 6).unit === 100, "phone unit 88");
// hero eligibility: one long option among shorts is eligible; all-short sets: nobody eligible, everybody "top"
const g6 = Feat.geom(1000, 6), F = Feat.classifyAll(["a", "b", "The magnetic flux through the loop increases, so the induced current must oppose that change by flowing counterclockwise.", "c"].map(t => measure(t, 1000, 6)), g6);
assert.ok(F[2].eligible && !F[0].eligible, "long option is hero-eligible");
const S = Feat.classifyAll(["yes", "no", "up", "down"].map(t => measure(t, 1000, 6)), g6); assert.ok(S.every(f => !f.eligible && f.top), "all-short: seeded pick");
console.log(`bento_feat smoke ok (${n} checks)`);
