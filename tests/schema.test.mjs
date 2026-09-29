import { test } from "node:test";
import assert from "node:assert/strict";
import katex from "katex";
import { compile, evaluate } from "mathjs";
import { validator, bank } from "./schemas.mjs";

// problems.json: the whole bank in one file (SCHEMA.md)
const validate = validator("problems");
const B = bank();
const problems = B.problems ?? [];
const num = s => Number(evaluate(s.replace(/ln\s*\(/g, "log(")));

// Walk every value; yields [key, value, parent].
function* walk(v, k = "", parent = null) {
  yield [k, v, parent];
  if (v && typeof v === "object") for (const [kk, vv] of Object.entries(v)) yield* walk(vv, kk, v);
}
const md = b => Array.isArray(b.md) ? b.md.join("\n") : b.md;
const MATH = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g;
const EXPR = new Set(["y", "f", "g", "of", "x", "fn"]);
const norm = s => s.replace(/ln\s*\(/g, "log(");

test("problems.json: schema", () => assert.ok(validate(B), JSON.stringify(validate.errors, null, 1)));
test("problems.json: has problems", () => assert.ok(problems.length > 0));

for (const p of problems) {
  const f = p.code;

  test(`${f}: answer evaluates`, () => {
    if (p.type === "mc" || p.answer === "dne") return;
    const c = compile(norm(p.answer));
    const scope = p.type === "expr" ? { [p.var ?? "x"]: p.points[0] } : {};
    assert.ok(Number.isFinite(Number(c.evaluate(scope))), p.answer);
  });

  test(`${f}: TeX renders`, () => {
    const srcs = [];
    for (const [k, v, par] of walk(p.body)) {
      if (k === "md" && par?.type === "text") srcs.push(md(par));
      if (["label", "text", "unit"].includes(k) && typeof v === "string" && par?.type !== "text") srcs.push(v);
    }
    for (const s of srcs) for (const m of s.matchAll(MATH))
      katex.renderToString(m[1] ?? m[2], { throwOnError: true, displayMode: !!m[1] });
  });

  // A force drawn from a body's point acts on that body: it must be solid.
  // Dashed forces are only ones NOT acting on the body (drawn elsewhere).
  test(`${f}: forces acting on a body are solid`, () => {
    for (const b of p.body.filter(b => b.type === "graph")) {
      const bodies = (b.marks ?? []).filter(m => m.mark === "body" && Array.isArray(m.at));
      for (const m of b.marks ?? []) {
        if (m.mark !== "force" || !m.dash) continue;
        const on = bodies.some(o => Math.hypot(o.at[0] - m.at[0], o.at[1] - m.at[1]) < 1e-6);
        assert.ok(!on, `force ${m.label ?? ""} at [${m.at}] acts on a body but is dashed`);
      }
    }
  });

  if (p.type === "mc") {
    test(`${f}: every distractor has exactly one error+hint`, () => {
      const ids = p.choices.map(c => c.id);
      assert.equal(new Set(ids).size, ids.length, "duplicate choice ids");
      assert.ok(ids.includes(p.correct), "correct id not in choices");
      const got = p.wrong.map(w => w.choice);
      assert.ok(got.every(Boolean), "mc wrong entries use choice, not match/re");
      assert.deepEqual([...got].sort(), ids.filter(i => i !== p.correct).sort());
    });
  } else {
    test(`${f}: known wrong answers evaluate and are actually wrong`, () => {
      const tol = p.tol ?? 1e-6, ans = p.answer === "dne" ? NaN : num(p.answer);
      for (const w of p.wrong ?? []) {
        assert.ok(!w.choice, "freeform wrong entries use match/re");
        if (w.re) { new RegExp(w.re, "i"); continue; }
        const v = num(w.match);
        assert.ok(Number.isFinite(v), w.match);
        assert.ok(!(Math.abs(v - ans) <= tol * Math.max(1, Math.abs(ans))), `${w.match} equals the answer`);
      }
    });
  }

  test(`${f}: hints never state the answer`, () => {
    const answer = p.type === "mc" ? p.choices.find(c => c.id === p.correct).md.replace(/\$/g, "") : p.answer;
    const re = new RegExp(`(^|[^0-9.])${answer.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^0-9.]|$)`);
    for (const h of [...(p.wrong ?? []).map(w => w.hint), p.nudge ?? ""]) assert.ok(!re.test(h.replace(/\$/g, "")), h);
  });

  test(`${f}: graph math compiles, <= 6 labels`, () => {
    for (const b of p.body.filter(b => b.type === "graph")) {
      let labels = 0;
      for (const [k, v, par] of walk(b)) {
        if (k === "label" || (k === "text" && par?.mark === "text")) labels++;
        if (typeof v === "string" && par?.mark && EXPR.has(k) && !(k === "x" && par.mark === "vline")) compile(norm(v));
      }
      assert.ok(labels <= 6, `${labels} labels`);
    }
  });
}

test("codes unique, suffixes unique across subjects", () => {
  const seen = new Map();
  for (const { code } of problems) {
    const s = code.replace(/^[A-Z0-9]+_/, "");
    assert.ok(!seen.has(s), `${code} clashes with ${seen.get(s)}`);
    seen.set(s, code);
  }
});
