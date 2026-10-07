// The scene language (SCHEMA.md <!-- schema: scene -->, design/VISUAL-LANGUAGE.md §3, goals in design/VISUAL-GOALS.md).
// The schema checks the shape; check() below checks what a schema can't: every expression compiles in math.js and names only
// params, derives, t and math.js names; binds name real params; reveal / trace / handles name real mark ids; every derive
// evaluates to a finite number at the params' init values.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parse, evaluate } from "mathjs";
import * as math from "mathjs";
import { validator, root } from "./schemas.mjs";

const validate = validator("scene");
const md = f => readFileSync(new URL(f, root), "utf8");
// the two worked examples of VISUAL-LANGUAGE.md §3 (the first two ```json blocks there) + the Q1 b) scene of VISUAL-GOALS.md
const lang = [...md("design/VISUAL-LANGUAGE.md").matchAll(/```json\n([\s\S]*?)\n```/g)].map(m => JSON.parse(m[1]));
const q1b = JSON.parse(md("design/VISUAL-GOALS.md").match(/<!-- scene: q1-b -->\s*```json\n([\s\S]*?)\n```/)[1]);
const EXAMPLES = { projectile: lang[0], bfs: lang[1], "q1-b": q1b };

function names(src) {                                       // the free symbols of a math.js expression
  const out = new Set();
  parse(src).traverse((n, path, parent) => {
    if (n.type === "SymbolNode" && !(parent && parent.type === "FunctionNode" && path === "fn")) out.add(n.name);
  });
  return out;
}
const known = n => n in math && typeof math[n] !== "undefined";

export function check(s) {                                  // [] = sound; else the problems, one line each
  const bad = [], params = Object.keys(s.params || {}), derive = s.derive || {};
  const scope = new Set([...params, ...Object.keys(derive), "t"]);
  const ids = new Set((s.marks || []).map(m => m.id));
  const expr = (src, where, local = []) => {
    try { for (const n of names(src)) if (!scope.has(n) && !local.includes(n) && !known(n)) bad.push(`${where}: unknown name ${n} in ${src}`); }
    catch (e) { bad.push(`${where}: does not compile: ${src}`); }
  };
  for (const [k, src] of Object.entries(derive)) expr(src, `derive.${k}`);
  const walk = (v, where, local) => {
    if (typeof v === "string" && v.startsWith("=")) expr(v.slice(1), where, local);
    else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${where}[${i}]`, local));
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, `${where}.${k}`, local);
  };
  for (const m of s.marks || []) {
    const local = m.param ? [m.param] : [];                  // an fn / param mark's own sweep variable
    for (const [k, v] of Object.entries(m)) if (k !== "param") walk(v, `marks.${m.id}.${k}`, local);
    if (typeof m.x === "string" && !m.x.startsWith("=") && m.mark === "fn") expr(m.x, `marks.${m.id}.x`, local);
    if (typeof m.y === "string" && !m.y.startsWith("=") && m.mark === "fn") expr(m.y, `marks.${m.id}.y`, local);
  }
  const bind = (p, where) => { if (!params.includes(p)) bad.push(`${where}: ${p} is not a param`); };
  (s.handles || []).forEach((h, i) => { bind(h.bind, `handles[${i}]`); if (!ids.has(h.on.split(".")[0])) bad.push(`handles[${i}]: no mark ${h.on}`); });
  (s.knobs || []).forEach((k, i) => bind(k.bind, `knobs[${i}]`));
  const tl = s.timeline || {};
  if (tl.drive) { bind(tl.drive.param, "timeline.drive"); walk(tl.drive.from, "timeline.drive.from"); walk(tl.drive.to, "timeline.drive.to"); }
  (tl.keys || []).forEach((k, i) => Object.keys(k.set).forEach(p => bind(p, `timeline.keys[${i}]`)));
  (s.reveal || []).forEach((r, i) => r.show.forEach(id => { if (!ids.has(id) && !(id === "trace" && s.trace)) bad.push(`reveal[${i}]: no mark ${id}`); }));
  (s.trace || []).forEach((st, i) => { if (!ids.has(String(st.args[0]))) bad.push(`trace[${i}] ${st.op}: no mark ${st.args[0]}`); });
  if (!bad.length && Object.keys(derive).length) {           // derives evaluate at the init values (in any order: a few passes)
    const sc = Object.fromEntries(params.map(p => [p, s.params[p].init]));
    if (!("t" in sc)) sc.t = 0;
    for (let pass = 0; pass < 4; pass++) for (const [k, src] of Object.entries(derive)) { try { sc[k] = evaluate(src, { ...sc }); } catch { /* a later pass */ } }
    for (const k of Object.keys(derive)) if (typeof sc[k] !== "number" || !Number.isFinite(sc[k])) bad.push(`derive.${k}: not a finite number at the init values`);
  }
  return bad;
}

for (const [name, s] of Object.entries(EXAMPLES)) {
  test(`scene ${name}: schema`, () => assert.ok(validate(s), JSON.stringify(validate.errors, null, 1)));
  test(`scene ${name}: names, binds and ids are sound`, () => assert.deepEqual(check(s), []));
}

test("scene q1-b: W is 22 at t = 5 and 6, 22.5 at the top of the blue (the numbers VISUAL-GOALS.md promises)", () => {
  const W = t => evaluate(q1b.derive.W, { t });
  assert.equal(W(5), 22); assert.equal(W(6), 22); assert.equal(W(5.5), 22.5); assert.equal(W(4), 18);
});

test("scene: bad shapes fail the schema", () => {
  const base = () => structuredClone(q1b);
  const cases = {
    "unknown top key": s => { s.colour = "red"; },
    "unknown symbol": s => { s.marks.push({ id: "z", sym: "rocket" }); },
    "mark and sym both": s => { s.marks[0].sym = "block"; },
    "neither mark nor sym": s => { delete s.marks[0].mark; },
    "unknown trace op": s => { s.trace = [{ op: "teleport", args: ["blue"] }]; },
    "unknown ease": s => { s.timeline = { drive: { param: "t", from: 0, to: 6, dur: 1000, ease: "bounce" } }; },
    "bad handle constraint": s => { s.handles[0].constraint = "anywhere"; },
    "unknown knob kind": s => { s.knobs = [{ bind: "t", kind: "wheel" }]; },
    "bad reveal.after": s => { s.reveal[0].after = "later"; },
    "goal without say": s => { delete s.goal.say; },
    "approach other than POE": s => { s.goal.approach = "knobs"; },
    "param without init": s => { delete s.params.t.init; },
    "v2": s => { s.v = 2; }
  };
  for (const [what, f] of Object.entries(cases)) { const s = base(); f(s); assert.equal(validate(s), false, what); }
});

test("scene: bad meaning is caught (valid shape, wrong references)", () => {
  const base = () => structuredClone(q1b);
  const cases = {
    "unknown name in a derive": [s => { s.derive.W = "t + speed"; }, /unknown name speed/],
    "unknown name in a mark": [s => { s.marks[2].x = "=t + q"; }, /unknown name q/],
    "derive that does not compile": [s => { s.derive.F = "3 * (t"; }, /does not compile/],
    "handle bound to no param": [s => { s.handles[0].bind = "x"; }, /x is not a param/],
    "handle on no mark": [s => { s.handles[0].on = "nope"; }, /no mark nope/],
    "reveal of no mark": [s => { s.reveal[0].show = ["ghost"]; }, /no mark ghost/],
    "trace on no mark": [s => { s.trace = [{ op: "visit", args: ["Z"] }]; }, /no mark Z/],
    "derive that is not a number": [s => { s.derive.F = "1/0 - 1/0"; }, /not a finite number/]
  };
  for (const [what, [f, re]] of Object.entries(cases)) {
    const s = base(); f(s);
    assert.ok(validate(s), `${what}: the shape is still valid`);
    assert.ok(check(s).some(l => re.test(l)), `${what}: ${JSON.stringify(check(s))}`);
  }
});
