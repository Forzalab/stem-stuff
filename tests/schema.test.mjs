import { test } from "node:test";
import assert from "node:assert/strict";
import katex from "katex";
import { compile, evaluate } from "mathjs";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { validator, bank } from "./schemas.mjs";
import { isBankId, isBuiltin, isReserved, prefixOf } from "../codes.mjs";

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
/* the bank flag rule (SCHEMA.md "Codes"), as a list of faults: [] = sound. id = the flag, else the file stem (hosted banks need no flag).
   Built-in prefixes are free; every other prefix must equal the id minus BANK_ and may not be reserved. */
function prefixFaults(doc, stem) {
  const out = [], id = doc.bank ?? stem;
  if (doc.bank !== undefined && !isBankId(doc.bank)) out.push(`bad flag ${doc.bank}`);
  if (doc.bank !== undefined && stem && doc.bank !== stem) out.push(`flag ${doc.bank} is not the file stem ${stem}`);
  for (const p of doc.problems) {
    const pre = prefixOf(p.code);
    if (isBuiltin(pre)) continue;
    if (isReserved(pre)) out.push(`${p.code}: reserved prefix`);
    else if (!isBankId(id) || pre !== id.slice(5)) out.push(`${p.code}: prefix is not ${id} minus BANK_`);
  }
  return out;
}
/* custom-prefix suffixes: the authoring rule (3 characters, no O/0/I/1), unique inside the prefix */
function suffixFaults(doc) {
  const out = [], seen = new Set();
  for (const { code } of doc.problems) {
    if (isBuiltin(prefixOf(code))) continue;
    if (!/^[A-Z0-9]+_[A-HJ-NP-Z2-9]{3}$/.test(code)) out.push(`${code}: suffix is not 3 of A-HJ-NP-Z2-9`);
    if (seen.has(code)) out.push(`${code}: repeated`);
    seen.add(code);
  }
  return out;
}
test("bank flag: bank:BANK_BEAR validates; bear / BANK_AB / BANK_ABCDEFG do not", () => {
  const one = { ...B, problems: [B.problems[0]] };
  assert.ok(validate({ ...one, bank: "BANK_BEAR" }), JSON.stringify(validate.errors));
  for (const bad of ["bear", "BANK_AB", "BANK_ABCDEFG", "BANK_bear", "BEAR", 7]) assert.ok(!validate({ ...one, bank: bad }), String(bad));
});
test("the flag rule: custom prefix = flag minus BANK_ (synthetic files)", () => {
  const mk = (codes, bank) => ({ ...(bank ? { bank } : {}), problems: codes.map(code => ({ code })) });
  assert.deepEqual(prefixFaults(mk(["PSY_ABC", "PHYS_ABC", "CALC1_ABC", "CSCI26_ABC"]), "BANK_PSY6"), [], "built-ins need no flag");
  assert.deepEqual(prefixFaults(mk(["BEAR_QAA", "PSY_ABC"], "BANK_BEAR")), []);
  assert.equal(prefixFaults(mk(["BEAR_QAA"])).length, 1, "custom prefix, no flag");
  assert.equal(prefixFaults(mk(["BEAR_QAA"], "BANK_XYZ")).length, 1, "flag names another prefix");
  assert.equal(prefixFaults(mk(["BEAR_QAA", "COW_QAA"], "BANK_BEAR")).length, 1, "two custom prefixes");
  assert.equal(prefixFaults(mk(["DIET_QAA"], "BANK_DIET")).length, 1, "reserved");
  assert.equal(prefixFaults(mk(["BEAR_QAA"], "bear")).length >= 1, true, "bad flag");
  assert.equal(prefixFaults(mk(["BEAR_QAA"], "BANK_BEAR"), "BANK_COW").length, 1, "hosted: flag and file stem differ");
});
test("custom-prefix suffixes: 3 characters without O/0/I/1, unique inside the prefix (synthetic)", () => {
  const mk = (...codes) => ({ problems: codes.map(code => ({ code })) });
  assert.deepEqual(suffixFaults(mk("BEAR_QAA", "BEAR_QAB", "PSY_O0I")), []);
  assert.equal(suffixFaults(mk("BEAR_QOA")).length, 1);
  assert.equal(suffixFaults(mk("BEAR_QA")).length, 1);
  assert.equal(suffixFaults(mk("BEAR_QAA", "BEAR_QAA")).length, 1);
});

// practice banks (design/BANK.md): banks/BANK_XXX.json, the same format; problem codes shared with another file = the same problem
{
  const dir = new URL("../banks/", import.meta.url), seen = new Map(problems.map(p => [p.code, JSON.stringify(p)]));
  for (const f of existsSync(dir) ? readdirSync(dir).filter(f => f.endsWith(".json")) : []) {
    test(`banks/${f}: name, schema, no clashing codes`, () => {
      assert.match(f, /^BANK_[A-Z0-9]{3,6}\.json$/);
      const b = JSON.parse(readFileSync(new URL(f, dir), "utf8"));
      assert.ok(validate(b), JSON.stringify(validate.errors, null, 1));
      const stem = f.replace(/\.json$/, "");
      assert.deepEqual(prefixFaults(b, stem), [], "flag / prefix rule (SCHEMA.md Codes)");
      assert.deepEqual(suffixFaults(b), [], "custom-prefix suffix rule");
      for (const p of b.problems) {
        const j = JSON.stringify(p);
        assert.ok(!seen.has(p.code) || seen.get(p.code) === j, `${p.code}: in two files with different content`);
        seen.set(p.code, j);
      }
    });
  }
}

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

// kind: network (SCHEMA.md): what the schema can't say. Returns a list of problems, [] if sound.
function networkFaults(b) {
  const out = [], ids = b.nodes.map(n => typeof n === "string" ? n : n.id), seen = new Set();
  for (const n of ids) { if (seen.has(n)) out.push(`repeated id ${n}`); seen.add(n); }
  for (const e of b.edges) for (const s of [e.from, e.to]) if (!seen.has(s)) out.push(`unknown id ${s}`);
  if (b.layout === "free" && b.nodes.some(n => typeof n === "string" || !n.at)) out.push("free layout: a node has no at");
  if (b.layout === "tree") {
    if (!seen.has(b.root)) out.push(`root ${b.root} is not a node`);
    if (b.edges.length !== ids.length - 1 || b.edges.some(e => e.from === e.to)) out.push("tree: needs n-1 edges and no loop");
    const reach = new Set([b.root]), q = [b.root];
    while (q.length) { const u = q.pop(); for (const e of b.edges) for (const [x, y] of [[e.from, e.to], [e.to, e.from]]) if (x === u && !reach.has(y)) { reach.add(y); q.push(y); } }
    if (reach.size < ids.length) out.push("tree: not every node hangs off the root");
  }
  return out;
}
const networkOf = code => problems.find(p => p.code === code).body.find(b => b.kind === "network");
test("network: bad graphs are caught, bad shapes fail the schema", () => {
  const withBlock = (code, b) => ({ ...B, problems: [{ ...problems.find(p => p.code === code), body: [b] }] });
  const edit = (base, f) => { const b = structuredClone(base); f(b); return b; };
  for (const code of ["CSCI26_G3H", "CSCI26_G2T"]) {
    const b = networkOf(code);
    assert.ok(validate(withBlock(code, b)), JSON.stringify(validate.errors));
    assert.deepEqual(networkFaults(b), []);
  }
  const multi = networkOf("CSCI26_G3H"), tree = networkOf("CSCI26_G2T");
  // schema-valid, but unsound
  for (const [name, code, b, re] of [
    ["unknown id", "CSCI26_G3H", edit(multi, b => { b.edges[0].to = "z"; }), /unknown id z/],
    ["repeated id", "CSCI26_G3H", edit(multi, b => { b.nodes.push("a"); }), /repeated id a/],
    ["free without at", "CSCI26_G3H", edit(multi, b => { b.layout = "free"; }), /no at/],
    ["tree with a cycle", "CSCI26_G2T", edit(tree, b => { b.edges[5] = { from: "f", to: "r" }; b.edges.push({ from: "c", to: "d" }); }), /n-1|hangs/],
    ["tree, cut off", "CSCI26_G2T", edit(tree, b => { b.edges[4] = { from: "d", to: "c" }; }), /hangs/]
  ]) {
    assert.ok(validate(withBlock(code, b)), `${name}: ${JSON.stringify(validate.errors)}`);
    assert.match(networkFaults(b).join("; "), re, name);
  }
  // shapes: the schema says no
  for (const [name, b] of [
    ["tree without root", edit(tree, b => { delete b.root; })],
    ["bad layout", edit(multi, b => { b.layout = "spring"; })],
    ["string weight", edit(multi, b => { b.edges[0].w = "3"; })],
    ["unknown edge key", edit(multi, b => { b.edges[0].weight = 3; })],
    ["bad id", edit(multi, b => { b.nodes[0] = "1a"; })],
    ["13 nodes", edit(multi, b => { b.nodes = Array.from({ length: 13 }, (_, i) => "v" + i); })]
  ]) assert.ok(!validate(withBlock("CSCI26_G3H", b)), name);
  // the rest of the variants validate
  assert.ok(validate(withBlock("CSCI26_G3H", edit(multi, b => {
    b.directed = true; b.layout = "free";
    b.nodes = b.nodes.map((id, i) => ({ id, at: [i, "pi/2"], ...(i ? {} : { color: "c2", label: "$s$" }) }));
    b.edges[0] = { ...b.edges[0], w: 2.5, color: "c1", dash: true };
  }))), JSON.stringify(validate.errors));
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
      const right = [p.correct].flat();                                   // pick all: a list (design/CHOOSE-ALL.md)
      assert.ok(right.every(r => ids.includes(r)), "correct id not in choices");
      const got = p.wrong.map(w => w.choice);
      assert.ok(got.every(Boolean), "mc wrong entries use choice, not match/re");
      assert.deepEqual([...got].sort(), ids.filter(i => !right.includes(i)).sort());
      if (p.pick === "all") assert.ok(right.length < Math.min(5, ids.length), "pick all: ticking everything must lose");
      if (p.fix) for (const w of p.wrong) {                               // prove mode: every false, unlocked row has a fix
        const locked = p.choices.find(c => c.id === w.choice).lock;
        assert.ok(locked ? !w.fix : w.fix, `${w.choice}: ${locked ? "locked rows take no fix" : "missing fix"}`);
      }
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
  test(`${f}: form equals the answer (tools/slips.py)`, () => {
    for (const u of units) {
      if (!u.form) continue;
      const tol = u.tol ?? 1e-6, ans = num(u.answer), v = num(u.form);
      assert.ok(Math.abs(v - ans) <= tol * Math.max(1, Math.abs(ans)) || v.toPrecision(3) === ans.toPrecision(3), `${u.form} != ${u.answer}`);
    }
  });

  // loose on purpose (SCHEMA.md "Hint check"): only answers of 2+ chars the body doesn't already show
  test(`${f}: hints never state the answer`, () => {
    const fixes = (p.wrong ?? []).flatMap(w => w.fix ? [w.fix.answer, ...(w.fix.accept ?? [])] : []);
    const answers = p.type === "mc" ? [...p.choices.filter(c => [p.correct].flat().includes(c.id)).map(c => c.md), ...fixes] : units.flatMap(u => [u.answer, ...(u.accept ?? [])]);
    const bodyText = squash(JSON.stringify(p.body).replace(/\$/g, ""));
    const hints = [...(p.wrong ?? []), ...(p.wrong ?? []).flatMap(w => w.fix?.wrong ?? []), ...units.flatMap(u => u.wrong ?? [])].map(w => w.hint).concat(p.nudge ?? [], p.miss ?? []);
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

  const networks = p.body.filter(b => b.type === "graph" && b.kind === "network");
  if (networks.length) test(`${f}: network is sound`, () => {
    for (const b of networks) assert.deepEqual(networkFaults(b), []);
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

// skills.json (SCHEMA.md "Skills"): the catalog validates, ids are unique, families exist; every question's skills are known ids
{
  const S = JSON.parse(readFileSync(new URL("../skills.json", import.meta.url), "utf8")), check = validator("skills");
  const ids = new Set(S.skills.map(s => s.id));
  test("skills.json: schema, unique ids, known families", () => {
    assert.ok(check(S), JSON.stringify(check.errors, null, 1));
    assert.equal(ids.size, S.skills.length, "duplicate skill id");
    for (const s of S.skills) assert.ok(s.family in S.families, `${s.id}: unknown family ${s.family}`);
  });
  const dir = new URL("../banks/", import.meta.url);
  const files = [["problems.json", problems], ...(existsSync(dir) ? readdirSync(dir).filter(f => f.endsWith(".json")).map(f => [f, JSON.parse(readFileSync(new URL(f, dir), "utf8")).problems ?? []]) : [])];
  test("saccharine.skills: every id is in skills.json", () => {
    for (const [f, ps] of files) for (const p of ps) {
      const sg = p.saccharine ?? {};
      for (const list of [sg.skills, ...(sg.split ?? []).map(r => r.skills)]) for (const id of list ?? []) assert.ok(ids.has(id), `${f} ${p.code}: unknown skill ${id}`);
    }
  });
  test("skills: the schema takes a list and refuses junk", () => {
    const base = problems.find(p => p.saccharine) ?? problems[0];
    const withSkills = skills => ({ ...B, problems: [{ ...base, saccharine: { ...(base.saccharine ?? { title: "Practice Exam 2, Question 1" }), skills } }] });
    assert.ok(validate(withSkills(["negative_work", "shape_area"])), JSON.stringify(validate.errors));
    assert.ok(!validate(withSkills([])));
    assert.ok(!validate(withSkills(["Bad Id"])));
    assert.ok(!validate(withSkills(["shape_area", "shape_area"])));
  });
}
test("saccharine.dead (T28): the 6 dead-easy fixtures validate; a non-boolean or a typo does not", () => {
  const fx = JSON.parse(readFileSync(new URL("fixtures/dead-easy.json", import.meta.url), "utf8"));
  assert.ok(validate({ ...B, problems: fx.problems }), JSON.stringify(validate.errors, null, 1));
  const one = (k, v) => ({ ...B, problems: [{ ...fx.problems[0], saccharine: { ...fx.problems[0].saccharine, [k]: v } }] });
  assert.ok(!validate(one("dead", "yes")));
  assert.ok(!validate(one("deed", true)));
});
