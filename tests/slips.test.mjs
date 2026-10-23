// slips.mjs: the JS twin of slips.py (design/HANDOFF-slips-v2.md unit C). Golden parity against tests/fixtures/slips-golden.json,
// the fixture tests/test_slips.py checks on the Python side. Parity is EXACT, not set-based: same families in the same order (values
// ascending within a family, as slips.py sorts them), each value within 1e-9 relative.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as mathjs from "mathjs";
import { mutants, match, close, FAMILIES, FAMILY_HINT, EPS } from "../slips.mjs";

globalThis.math = mathjs;                                 // the browser has the global from vendor/math.min.js
const GOLDEN = JSON.parse(readFileSync(new URL("fixtures/slips-golden.json", import.meta.url), "utf8"));

test("golden fixture has the 8 forms", () => assert.equal(GOLDEN.length, 8));
for (const g of GOLDEN) {
  test(`golden parity: ${g.form}`, () => {
    const got = mutants(g.form);
    assert.deepEqual(got.map(([f]) => f), g.mutants.map(([f]) => f), "families, in order");
    got.forEach(([, v], i) => {
      const w = g.mutants[i][1];
      assert.ok(Math.abs(v - w) <= EPS * Math.max(1, Math.abs(w)), `${g.mutants[i][0]} #${i}: ${v} vs ${w}`);
    });
  });
}
test("families and hints: the 10 families in handoff order, one QUACK. line each", () => {
  assert.deepEqual(FAMILIES, ["sign", "drop", "reciprocal", "power", "factor", "distribute", "dream", "trig", "units", "g"]);
  assert.deepEqual(Object.keys(FAMILY_HINT), FAMILIES);
  for (const f of FAMILIES) assert.match(FAMILY_HINT[f], /^QUACK\. /, f);
});
test("match: the first family within tol (or to 3 s.f.), else null; a bad form or value is null, never a throw", () => {
  assert.equal(match("1/((4/3)^2+(1/3)^2+(2/3)^2)", 0.692, 1e-6), "sign");
  assert.equal(match("2*9.8*3", 60, 1e-6), "g");
  assert.equal(match("sqrt(9+16)", 7, 1e-6), "dream");
  assert.equal(match("10-(1+2+4)", 13, 1e-6), "distribute");
  assert.equal(match("10-(1+2+4)", 3.5, 1e-6), null);
  assert.equal(match("1+", 1, 1e-6), null);
  assert.equal(match("2*3", NaN, 1e-6), null);
  assert.ok(close(0.6921, 0.6923, 1e-9) && !close(0.69, 0.6923, 1e-9) && close(1000.4, 1001, 1e-9));
});
