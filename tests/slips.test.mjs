// slips.mjs: the JS twin of slips.py (design/HANDOFF-slips-v2.md unit C). Golden parity against tests/fixtures/slips-golden.json,
// the fixture tests/test_slips.py checks on the Python side. Parity is EXACT, not set-based: same families in the same order (values
// ascending within a family, as slips.py sorts them), each value within 1e-9 relative.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as mathjs from "mathjs";
import { mutants, match, close, raw, parse, FAMILIES, FAMILY_HINT, EPS, SLIP_WIN, SLIP_K, OUTER_FAMS } from "../slips.mjs";

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

/* D4 (todo 17): every live bank form + parser corners, written by `python3 tools/slips.py --golden`; tests/test_slips.py runs the same file.
   Same families in the same order, each value within 1e-9 relative (0 only equals 0): no absolute floor, so tiny-constant forms count. */
const BANKS = JSON.parse(readFileSync(new URL("fixtures/slips-golden-banks.json", import.meta.url), "utf8"));
test("golden banks fixture: slips.mjs gives slips.py's mutants on every form", () => {
  assert.ok(BANKS.length >= 150, `${BANKS.length} forms`);
  const bad = [];
  for (const g of BANKS) {
    let got;
    try { got = mutants(g.form); } catch (e) { bad.push(`${g.form}: throws ${e.message}`); continue; }
    const fams = got.map(([f]) => f).join(" "), want = g.mutants.map(([f]) => f).join(" ");
    if (fams !== want) { bad.push(`${g.form}: families\n  js ${fams}\n  py ${want}`); continue; }
    got.forEach(([f, v], i) => { const w = g.mutants[i][1]; if (!(Math.abs(v - w) <= 1e-9 * Math.abs(w))) bad.push(`${g.form}: ${f} ${v} vs ${w}`); });
  }
  assert.deepEqual(bad, []);
});
const fam = (form, f) => Object.fromEntries(raw(form))[f];
test("S3: a unary minus on a bracket keeps its terms (-(3+4) is (-1)*(3+4), not -7); a number still folds", () => {
  assert.deepEqual(parse("-(3+4)"), { t: "mul", a: [{ t: "num", v: -1, rat: true }, { t: "add", a: [{ t: "num", v: 3, rat: true }, { t: "num", v: 4, rat: true }], bin: true }] });
  assert.deepEqual(fam("-(3+4)", "distribute"), [1]);
  assert.deepEqual(fam("-(3+4)", "drop"), [-4, -3]);
  assert.deepEqual(fam("-(3+4)*2", "distribute"), [2]);
  assert.deepEqual(parse("-(-3)"), { t: "num", v: 3, rat: true });
});
test("S1: a-k(b+c) gives the distribute slip (7-2*(2+3) -> 7-4+6)", () => {
  assert.deepEqual(fam("7-2*(2+3)", "distribute"), [9]);
  assert.deepEqual(fam("5-(3+1)*2", "distribute"), [1]);
  assert.deepEqual(fam("5-(3+1)/2", "distribute"), [4]);
  assert.equal(match("7-2*(2+3)", 9), "distribute");
  assert.deepEqual(fam("5+2*(3+1)", "distribute"), []);
});
test("N1: the literal 2.0 is a Float like sympy's, so -2.0*(3+4) is a sign slip, not distribute", () => {
  assert.equal(parse("2.0").rat, false);
  assert.equal(parse("1e3").rat, false);
  assert.equal(parse("12").rat, true);
  assert.deepEqual(fam("-2.0*(3+4)", "distribute"), []);
  assert.deepEqual(fam("-2*(3+4)", "distribute"), [2]);
});
test("tiny-constant form: slips under 1e-9 stay apart (the merge is relative, not EPS * max(1, |v|))", () => {
  const f = "6.67e-11*(3+2)/4";
  assert.equal(fam(f, "sign").length, 3);
  assert.equal(fam(f, "drop").length, 2);
  assert.equal(mutants(f).filter(([, v]) => Math.abs(v) < 1e-9).length, 10);
});
test("a name or syntax outside the form grammar throws (slips.py raises too); match() is null", () => {
  for (const f of ["x", "foo(2)", "2(3+4)", "e"]) assert.throws(() => mutants(f), /slips/, f);
  assert.equal(match("x+1", 1), null);
});

test("close() parity with slips.py: ties round away from zero in both (tests/fixtures/slips-close.json, also run by test_slips.py)", () => {
  const cases = JSON.parse(readFileSync(new URL("fixtures/slips-close.json", import.meta.url), "utf8"));
  for (const [a, b, tol, want] of cases) {
    assert.equal(close(a, b, tol), want, `${a} ${b}`);
    assert.equal(close(b, a, tol), want, `${b} ${a}`);
  }
});

/* k=2 (SLIP_K, Tony D1/D3): one inner slip + one whole-answer (outer) slip, family "inner+outer"; tests/test_slips.py K2 is the twin */
test("k=2: SLIP_K is 1, so the default match is today's", () => {
  assert.equal(SLIP_K, 1);
  assert.equal(match("10-(3+2)", -7), null);
});
test("k=2 hand cases: a typed value only inner + outer explains", () => {
  for (const [form, typed, want] of [["10-(3+2)", -7, "drop+sign"], ["2*9.8*3", 120, "g+factor"], ["sqrt(9+16)", 49, "dream+power"], ["sqrt(9+16)", -7, "dream+sign"]]) {
    assert.equal(match(form, typed, undefined, [], 1), null, form);
    assert.equal(match(form, typed, undefined, [], 2), want, form);
    assert.ok(mutants(form, 2).some(([f, v]) => f === want && v === typed), form);
  }
  assert.equal(match("2*3", -12, undefined, [], 2), null);         // two outer slips: not k=2
  assert.equal(match("10-(3+2)", 0.4, undefined, [], 2), null);
  assert.equal(match("10-(3+2)", -7, undefined, [-7], 2), null);   // skip holds at k=2
  assert.equal(match("10-(3+2)", 9, undefined, [], 2), "distribute");
  assert.deepEqual(mutants("10-(3+2)", 2).slice(0, mutants("10-(3+2)").length), mutants("10-(3+2)"));
  assert.ok(mutants("10-(3+2)", 2).every(([f]) => !f.includes("+") || OUTER_FAMS.includes(f.split("+")[1])));
});
const K2 = JSON.parse(readFileSync(new URL("fixtures/slips-golden-k2.json", import.meta.url), "utf8"));
test("golden k=2 fixture: slips.mjs gives slips.py's inner+outer entries on every bank form", () => {
  assert.deepEqual(K2.map(g => g.form), BANKS.map(g => g.form));
  const bad = [];
  for (const g of K2) {
    const got = mutants(g.form, 2).slice(mutants(g.form).length);
    const fams = got.map(([f]) => f).join(" "), want = g.pairs.map(([f]) => f).join(" ");
    if (fams !== want) { bad.push(`${g.form}: families\n  js ${fams}\n  py ${want}`); continue; }
    got.forEach(([f, v], i) => { const w = g.pairs[i][1]; if (!(Math.abs(v - w) <= 1e-9 * Math.abs(w))) bad.push(`${g.form}: ${f} ${v} vs ${w}`); });
    if (g.pairs.length && match(g.form, g.pairs[0][1], undefined, [], 2) === null) bad.push(`${g.form}: no k=2 match on ${g.pairs[0][1]}`);
  }
  assert.deepEqual(bad, []);
});
