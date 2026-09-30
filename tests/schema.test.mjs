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
test("part.prompt: string or lines validate; other types and unknown keys do not", () => {
  const withPart = part => ({ ...B, problems: [{ ...B.problems.find(p => p.type === "multi"), parts: [part, part] }] });
  const base = { type: "num", answer: "1" };
  assert.ok(validate(withPart({ ...base, prompt: "How many? $x$" })), JSON.stringify(validate.errors));
  assert.ok(validate(withPart({ ...base, prompt: ["line one", "", "line two"] })), JSON.stringify(validate.errors));
  assert.ok(!validate(withPart({ ...base, prompt: 5 })));
  assert.ok(!validate(withPart({ ...base, prompt: "" })));
  assert.ok(!validate(withPart({ ...base, prompts: "typo" })));
});
test("problems.json: has problems", () => assert.ok(problems.length > 0));

// kind: circuit wiring (SCHEMA.md): what the schema can't say. Returns a list of problems, [] if sound.
function circuitFaults(b) {
  const out = [], names = [...b.inputs.map(i => typeof i === "string" ? i : i.name), ...b.gates.map(g => g.id)];
  const seen = new Set();
  for (const n of names) { if (seen.has(n)) out.push(`repeated name ${n}`); seen.add(n); }
  const gate = new Map(b.gates.map(g => [g.id, g]));
  for (const r of [...b.gates.flatMap(g => g.in), ...b.outputs.map(o => o.from)]) if (!seen.has(r)) out.push(`unknown id ${r}`);
  const state = new Map();   // DFS: 1 = on the stack, 2 = done
  const visit = id => {
    if (!gate.has(id) || state.get(id) === 2) return;
    if (state.get(id) === 1) { out.push(`cycle through ${id}`); return; }
    state.set(id, 1); gate.get(id).in.forEach(visit); state.set(id, 2);
  };
  b.gates.forEach(g => visit(g.id));
  const live = new Set(), up = id => { if (live.has(id)) return; live.add(id); gate.get(id)?.in.forEach(up); };
  b.outputs.forEach(o => up(o.from));
  for (const g of b.gates) if (!live.has(g.id)) out.push(`gate ${g.id} reaches no output`);
  return out;
}
const circuitOf = code => problems.find(p => p.code === code).body.find(b => b.kind === "circuit");
test("circuit: bad wiring is caught, bad shapes fail the schema", () => {
  const base = circuitOf("CSCI26_L3G");
  const withBlock = b => ({ ...B, problems: [{ ...problems.find(p => p.code === "CSCI26_L3G"), body: [b] }] });
  const edit = f => { const b = structuredClone(base); f(b); return b; };
  assert.ok(validate(withBlock(base)), JSON.stringify(validate.errors));
  assert.deepEqual(circuitFaults(base), []);
  // wiring: schema-valid, but unsound
  const unknown = edit(b => { b.gates[2].in[0] = "g9"; });
  const cycle = edit(b => { b.gates[0].in[1] = "g3"; });
  for (const [name, b, re] of [["unknown id", unknown, /unknown id g9/], ["cycle", cycle, /cycle/]]) {
    assert.ok(validate(withBlock(b)), `${name}: ${JSON.stringify(validate.errors)}`);
    assert.match(circuitFaults(b).join("; "), re, name);
  }
  // shapes: the schema says no
  for (const [name, f] of [
    ["not with 2 inputs", b => { b.gates[1].in = ["c", "a"]; }],
    ["and with 1 input", b => { b.gates[0].in = ["a"]; }],
    ["bad op", b => { b.gates[0].op = "andd"; }],
    ["output with value", b => { b.outputs[0].value = 1; }],
    ["input value 2", b => { b.inputs[2] = { name: "c", value: 2 }; }],
    ["bad name", b => { b.inputs[0] = "1a"; }]
  ]) assert.ok(!validate(withBlock(edit(f))), name);
  // an input with a value is fine
  assert.ok(validate(withBlock(edit(b => { b.inputs[2] = { name: "c", value: 1 }; }))), JSON.stringify(validate.errors));
});

for (const p of problems) {
  const f = p.code;

  // answer units: the problem itself, or each part of a multi
  const units = p.type === "multi" ? p.parts : p.type === "mc" ? [] : [p];
  const squash = t => String(t).toLowerCase().replace(/\s+/g, "");
  test(`${f}: answers evaluate`, () => {
    for (const u of units) {
      if (u.type === "text" || u.answer === "dne") continue;
      const c = compile(norm(u.answer));
      const scope = u.type === "expr" ? { [u.var ?? "x"]: u.points[0] } : {};
      assert.ok(Number.isFinite(Number(c.evaluate(scope))), u.answer);
    }
  });

  test(`${f}: TeX renders`, () => {
    const srcs = [];
    for (const [k, v, par] of walk(p.body)) {
      if (k === "md" && par?.type === "text") srcs.push(md(par));
      if (["label", "text", "unit"].includes(k) && typeof v === "string" && par?.type !== "text") srcs.push(v);
    }
    for (const u of p.parts ?? []) if (u.prompt) srcs.push(md({ md: u.prompt }));   // sub-question text: same TeX rules
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
  }
  test(`${f}: known wrong answers read and are actually wrong`, () => {
    for (const u of units) {
      const tol = u.tol ?? 1e-6;
      for (const w of u.wrong ?? []) {
        assert.ok(!w.choice, "freeform wrong entries use match/re");
        if (w.re) { new RegExp(w.re, "i"); continue; }
        if (u.type === "text") {
          assert.ok(![u.answer, ...(u.accept ?? [])].map(squash).includes(squash(w.match)), `${w.match} equals the answer`);
          continue;
        }
        const ans = u.answer === "dne" ? NaN : num(u.answer), v = num(w.match);
        assert.ok(Number.isFinite(v), w.match);
        assert.ok(!(Math.abs(v - ans) <= tol * Math.max(1, Math.abs(ans))), `${w.match} equals the answer`);
      }
    }
  });

  // loose on purpose (SCHEMA.md "Hint check"): only answers of 2+ chars the body doesn't already show
  test(`${f}: hints never state the answer`, () => {
    const answers = p.type === "mc" ? [p.choices.find(c => c.id === p.correct).md] : units.flatMap(u => [u.answer, ...(u.accept ?? [])]);
    const bodyText = squash(JSON.stringify(p.body).replace(/\$/g, ""));
    const hints = [...(p.wrong ?? []), ...units.flatMap(u => u.wrong ?? [])].map(w => w.hint).concat(p.nudge ?? []);
    for (const raw of answers) {
      const ans = squash(raw.replace(/\$/g, ""));
      if (ans.length < 2 || bodyText.includes(ans)) continue;
      const re = new RegExp(`(^|[^0-9.a-z])${ans.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^0-9.a-z]|$)`);
      for (const h of hints) assert.ok(!re.test(squash(h.replace(/\$/g, ""))), h);
    }
  });

  const circuits = p.body.filter(b => b.type === "graph" && b.kind === "circuit");
  if (circuits.length) test(`${f}: circuit wiring is sound`, () => {
    for (const b of circuits) assert.deepEqual(circuitFaults(b), []);
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
