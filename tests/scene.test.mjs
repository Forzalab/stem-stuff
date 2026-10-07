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

/* ---------- kits (author/kits/<name>/KIT.md + examples/*.json; VISUAL-LANGUAGE.md §5): the gate ---------- */
import { readdirSync } from "node:fs";
const KITS = new URL("author/kits/", root);
const kitDirs = readdirSync(KITS, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name);
const kitOf = name => JSON.parse(readFileSync(new URL(`${name}/KIT.md`, KITS), "utf8").match(/<!-- kit -->\s*```json\n([\s\S]*?)\n```/)[1]);

export function uses(s, kit) {                               // components outside the kit = [] when the scene keeps to it
  const c = kit.components, out = [];
  for (const m of s.marks) {
    if (m.mark && !c.marks.includes(m.mark)) out.push(`mark ${m.mark}`);
    if (m.sym && !c.syms.includes(m.sym)) out.push(`sym ${m.sym}`);
  }
  for (const t of s.trace || []) if (!c.ops.includes(t.op)) out.push(`op ${t.op}`);
  for (const h of s.handles || []) { const k = h.constraint.split(":")[0]; if (!c.constraints.includes(k)) out.push(`constraint ${k}`); }
  return out;
}
const grid = over => {                                       // 6 points per param, every combination
  let pts = [{}];
  for (const [p, [a, b]] of Object.entries(over)) pts = pts.flatMap(o => Array.from({ length: 6 }, (_, i) => ({ ...o, [p]: a + (b - a) * i / 5 })));
  return pts;
};
function at(s, vals) {                                       // every derive at these param values
  const sc = { ...Object.fromEntries(Object.entries(s.params || {}).map(([k, v]) => [k, v.init])), t: 0, ...vals };
  for (let pass = 0; pass < 4; pass++) for (const [k, src] of Object.entries(s.derive || {})) { try { sc[k] = evaluate(src, { ...sc }); } catch { /* a later pass */ } }
  return sc;
}
export function invariant(s, inv) {                          // "" = holds; else what broke
  if (inv.type === "conserved") for (const v of grid(inv.over)) {
    const sc = at(s, v), sum = inv.of.reduce((a, k) => a + sc[k], 0);
    if (!(Math.abs(sum - sc[inv.total]) < 1e-9)) return `conserved: ${inv.of.join(" + ")} = ${sum} ≠ ${inv.total} = ${sc[inv.total]} at ${JSON.stringify(v)}`;
  }
  if (inv.type === "pythag") for (const v of grid(inv.over)) {
    const sc = at(s, v), l = inv.legs.reduce((a, k) => a + sc[k] ** 2, 0);
    if (!(Math.abs(l - sc[inv.hyp] ** 2) < 1e-9)) return `pythag: ${l} ≠ ${sc[inv.hyp] ** 2} at ${JSON.stringify(v)}`;
  }
  if (inv.type === "finite") for (const v of grid(inv.over)) {
    const sc = at(s, v);
    for (const k of Object.keys(s.derive || {})) if (!Number.isFinite(sc[k])) return `finite: ${k} = ${sc[k]} at ${JSON.stringify(v)}`;
  }
  const nodes = s.marks.filter(m => m.mark === "node").map(m => m.id), visits = (s.trace || []).filter(t => t.op === "visit").map(t => t.args[0]);
  if (inv.type === "visit_once") {
    for (const n of nodes) if (visits.filter(x => x === n).length !== 1) return `visit_once: ${n} visited ${visits.filter(x => x === n).length}×`;
  }
  if (inv.type === "visits_follow_edges") {
    const e = s.marks.filter(m => m.mark === "edge").map(m => [m.from, m.to]);
    for (let i = 1; i < visits.length; i++) if (!e.some(([a, b]) => (a === visits[i] && visits.slice(0, i).includes(b)) || (b === visits[i] && visits.slice(0, i).includes(a))))
      return `visits_follow_edges: ${visits[i]} has no edge to ${visits.slice(0, i)}`;
  }
  return "";
}

test("kits: there are 3, each with 2 examples", () => {
  assert.deepEqual(kitDirs.sort(), ["energy-bars", "graph-search", "mechanics"]);
  for (const d of kitDirs) assert.equal(kitOf(d).examples.length, 2, d);
});
for (const d of kitDirs) {
  const kit = kitOf(d);
  test(`kit ${d}: name matches its folder, one-line description, subjects from the closed list`, () => {
    assert.equal(kit.name, d);
    assert.ok(kit.description.length > 10 && !kit.description.includes("\n"));
    for (const s of kit.subjects) assert.ok(["physics.mechanics", "physics.em", "discrete", "cs"].includes(s), s);
  });
  for (const ex of kit.examples) {
    const s = JSON.parse(readFileSync(new URL(`${d}/examples/${ex.file}`, KITS), "utf8"));
    test(`kit ${d} / ${ex.file}: schema, sound, kit components only, invariants hold`, () => {
      assert.ok(validate(s), JSON.stringify(validate.errors, null, 1));
      assert.deepEqual(check(s), []);
      assert.deepEqual(uses(s, kit), [], "components outside the kit");
      for (const inv of ex.invariants) assert.equal(invariant(s, inv), "", inv.type);
    });
  }
}
test("kits: the gate catches a component outside the kit and a broken invariant", () => {
  const mech = kitOf("mechanics"), en = kitOf("energy-bars"), gs = kitOf("graph-search");
  const inc = JSON.parse(readFileSync(new URL("mechanics/examples/incline-forces.json", KITS), "utf8"));
  inc.marks.push({ id: "q", mark: "node", x: 1, y: 1 });
  assert.deepEqual(uses(inc, mech), ["mark node"]);
  const rs = JSON.parse(readFileSync(new URL("energy-bars/examples/ramp-spring.json", KITS), "utf8"));
  rs.derive.Ug = "f*(d + xm - min(s, d))";                    // Q2 b's slip: the height stops falling at first touch
  assert.match(invariant(rs, en.examples[0].invariants[0]), /^conserved/);
  const dfs = JSON.parse(readFileSync(new URL("graph-search/examples/dfs.json", KITS), "utf8"));
  dfs.trace.push({ op: "visit", args: ["A"] });
  assert.match(invariant(dfs, gs.examples[1].invariants[0]), /visit_once: A visited 2×/);
  dfs.trace.push({ op: "sort", args: ["S"] });
  assert.deepEqual(uses(dfs, gs), ["op sort"]);
});

/* ---------- bank profile (SCHEMA.md "profile", gen-UI step 5) ---------- */
test("bank profile: valid shapes pass, bad ones fail; its kits enum is exactly the kit folders", () => {
  const vp = validator("problems");
  const bank = { v: 1, problems: [{ code: "CALC1_PF1", type: "num", body: [{ type: "text", md: "1 + 1?" }], answer: "2", wrong: [], nudge: "QUACK." }] };
  const withP = p => ({ ...bank, profile: p });
  const ok = vp(bank);
  if (!ok) return assert.fail("the base bank must validate: " + JSON.stringify(vp.errors));
  assert.ok(vp(withP({ subject: "cs", audience: "first-year CS majors in data structures.", skill_domains: ["algebra"], kits: ["graph-search"] })), JSON.stringify(vp.errors));
  for (const [what, p] of Object.entries({ "bad subject": { subject: "chemistry" }, "short audience": { audience: "kids" }, "unknown kit": { kits: ["sorting"] }, "unknown key": { colour: "red" } }))
    assert.equal(vp(withP(p)), false, what);
  const kits = require_enum(vp, "kits");
  assert.deepEqual([...kits].sort(), [...kitDirs].sort(), "SCHEMA.md profile.kits must list exactly author/kits/*");
});
function require_enum() {                                    // the profile.kits enum, read from SCHEMA.md
  const s = JSON.parse(readFileSync(new URL("SCHEMA.md", root), "utf8").match(/<!-- schema: problems -->\s*```json\n([\s\S]*?)\n```/)[1]);
  return s.properties.profile.properties.kits.items.enum;
}
