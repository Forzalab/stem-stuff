// slips.mjs: the JS twin of slips.py (design/HANDOFF-slips-v2.md unit C). Golden parity against tests/fixtures/slips-golden.json,
// the fixture tests/test_slips.py checks on the Python side. Parity is EXACT, not set-based: same families in the same order (values
// ascending within a family, as slips.py sorts them), each value within 1e-9 relative.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as mathjs from "mathjs";
import { mutants, match, close, FAMILIES, FAMILY_HINT, EPS, SLIP_WIN } from "../slips.mjs";

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
  assert.deepEqual(FAMILIES, ["distribute", "sign", "drop", "reciprocal", "power", "factor", "dream", "trig", "units", "g"]);
  assert.deepEqual(Object.keys(FAMILY_HINT), FAMILIES);
  for (const f of FAMILIES) assert.match(FAMILY_HINT[f], /^QUACK\. /, f);
});
test("match: the first family within tol (or to 3 s.f.), else null; a bad form or value is null, never a throw", () => {
  assert.equal(match("1/((4/3)^2+(1/3)^2+(2/3)^2)", 0.692, 1e-6), "sign");
  assert.equal(match("2*9.8*3", 60, 1e-6), "g");
  assert.equal(match("sqrt(9+16)", 7, 1e-6), "dream");
  assert.equal(match("10-(1+2+4)", 15, 1e-6), "distribute");
  assert.notEqual(match("10-(1+2+4)", 13, 1e-6), "distribute");   // the minus reaches the first term only (Tony, Oct 23)
  assert.equal(match("10-(4+1)", 7, 1e-6), "distribute");          // written order: 10-4+1
  assert.equal(match("10-(1+2+4)", 3.5, 1e-6), null);
  assert.equal(match("1+", 1, 1e-6), null);
  assert.equal(match("2*3", NaN, 1e-6), null);
  assert.ok(close(0.6921, 0.6923, 1e-9) && !close(0.69, 0.6923, 1e-9) && close(1000.4, 1001, 1e-9));
});

test("FAMILY_HINT is byte-equal to serve.py's", () => {
  const py = readFileSync(new URL("../serve.py", import.meta.url), "utf8").match(/FAMILY_HINT = \{([\s\S]*?)\n\}/)[1];
  const want = Object.fromEntries([...py.matchAll(/"(\w+)":\s*"([^"]*)"/g)].map(m => [m[1], m[2]]));
  assert.deepEqual(FAMILY_HINT, want);
});

test("match skips the answer and the ignore_slips values", () => {
  const f = "1/((4/3)^2+(1/3)^2+(2/3)^2)";
  assert.equal(match(f, 9 / 17, 1e-3), "drop");
  assert.equal(match(f, 9 / 17, 1e-3, [3 / 7, 9 / 17]), null);
  assert.equal(match(f, 9 / 13, 1e-3, [3 / 7, 9 / 17]), "sign");
});

test("slip window is SLIP_WIN (Tony D2): 0.5% or 3 s.f., never the grading tol", () => {
  assert.equal(SLIP_WIN, 0.005);
  assert.equal(match("1/((4/3)^2+(1/3)^2+(2/3)^2)", 0.532), "drop");
  assert.equal(match("12/(100+200+300)", 0.0609), null);
});

test("distribute wins a tie with sign: 10-(3+2) typed 9", () => assert.equal(match("10-(3+2)", 9, 1e-6), "distribute"));

test("close() parity with slips.py: ties round away from zero in both (tests/fixtures/slips-close.json, also run by test_slips.py)", () => {
  const cases = JSON.parse(readFileSync(new URL("fixtures/slips-close.json", import.meta.url), "utf8"));
  for (const [a, b, tol, want] of cases) {
    assert.equal(close(a, b, tol), want, `${a} ${b}`);
    assert.equal(close(b, a, tol), want, `${b} ${a}`);
  }
});
