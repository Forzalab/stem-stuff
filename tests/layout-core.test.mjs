// layout-core.mjs smoke + sanity (brain AGENTS.md directive 23): each point op, the DAG errors (parallel Meet, cycle, undefined),
// the layout checks (solid pair, surface sunk vs resting, inside escape, Vec head), pass-2 Fix, the mover, determinism,
// and every read_doc example + built-in scene through evaluate().
import test from "node:test";
import assert from "node:assert/strict";
import { evaluate, createSession, sceneSummary, ghostLine, formatFindings, freePointsHint } from "../layout-core.mjs";
import { docExamples, SCENES, TOPIC_NAMES, CORE } from "../layout-docs.mjs";

const llm = r => r.findings.filter(f => f.cls === "llm");
const close = (p, q) => assert.ok(Math.abs(p[0] - q[0]) < 1e-3 && Math.abs(p[1] - q[1]) < 1e-3, `${p} vs ${q}`);

test("point ops: Pt Mid Along Off Foot Rot Meet compute the right points", () => {
  const r = evaluate(`A = Pt(0, 0)
B = Pt(4, 0)
M = Mid(A, B)
T = Along(A, B, 0.25)
O = Off(M, 1, 2)
F = Foot(O, A, B)
R = Rot(A, B, 90)
X = Meet(A, Off(A, 1, 1), B, Off(B, -1, 1))
K = Mid(Off(A, 0, 2), B)`);
  close(r.points.M, [2, 0]); close(r.points.T, [1, 0]); close(r.points.O, [3, 2]); close(r.points.F, [3, 0]);
  close(r.points.R, [0, 4]); close(r.points.X, [2, 2]); close(r.points.K, [2, 1]);
  assert.equal(r.findings.length, 0);
});

test("parallel Meet: one error on the root, its dependents blocked by it (not N errors)", () => {
  const r = evaluate(`A = Pt(0, 0)
B = Pt(4, 0)
X = Meet(A, B, Off(A, 0, 1), Off(B, 0, 1))
s = Seg(X, B)
t = Label(X, "x")`);
  const f = llm(r);
  assert.equal(f.length, 1);
  assert.equal(f[0].code, "undefined");
  assert.deepEqual(f[0].ids, ["X"]);
  assert.deepEqual(f[0].blocked, ["s", "t"]);
  assert.equal(r.status.s, "blocked");
});

test("cycle: named once, with the loop", () => {
  const r = evaluate(`A = Pt(0, 0)
p = Mid(q, A)
q = Mid(p, A)
s = Seg(p, A)`);
  const f = llm(r).filter(x => x.code === "cycle");
  assert.equal(f.length, 1);
  assert.deepEqual(f[0].ids, ["p", "q"]);
  assert.match(f[0].hint, /p -> q -> p/);
});

test("solid overlap: the PAIR [later, earlier] with amount + push, ALL conflicts of the new line, and a ghost", () => {
  const r = evaluate(`a = Box(Pt(0, 0), 2, 2, 0)
b = Box(Pt(3, 0), 2, 2, 0)
c = Box(Pt(1.5, 1.5), 1.2, 1.2, 0)`);
  const f = llm(r);
  assert.equal(f.length, 2);
  for (const x of f) { assert.equal(x.code, "overlap"); assert.equal(x.ids[0], "c"); assert.ok(x.amount > 0 && x.mtv); }
  assert.deepEqual(f.map(x => x.ids[1]).sort(), ["a", "b"]);
  assert.equal(r.ghosts.length, 1);
  assert.equal(r.ghosts[0].id, "c");
  assert.match(ghostLine(r.ghosts[0]), /^c: move by .* -> centre/);
  assert.equal(llm(evaluate(`a = Box(Pt(0, 0), 2, 2, 0)\nb = Box(Pt(2, 0), 2, 2, 0)`)).length, 0, "touching is fine");
});

test("surface: a body resting on it is fine, a body sunk past tolerance is an error with the lift", () => {
  const base = `A = Pt(0, 0)\nB = Pt(10, 0)\nfloor = Seg(A, B, {kind: "surface"})\n`;
  assert.equal(llm(evaluate(base + `blk = Box(Pt(5, 0.5), 1, 1, 0)`)).length, 0);
  const f = llm(evaluate(base + `blk = Box(Pt(5, 0.3), 1, 1, 0)`));
  assert.equal(f.length, 1);
  assert.equal(f[0].code, "sunk");
  assert.deepEqual(f[0].ids, ["blk", "floor"]);
  assert.equal(f[0].amount, 0.2);
  assert.deepEqual(f[0].mtv, [0, 0.2]);
  const ramp = `A = Pt(0, 0)\nB = Pt(8, 0)\ntop = Meet(A, Rot(A, B, 30), B, Off(B, 0, 1))\nramp = Poly([A, B, top], {kind: "surface"})\nP = Along(A, top, 0.5)\n`;
  assert.equal(llm(evaluate(ramp + `blk = Box(Rot(P, Off(P, 0, 0.5), 30), 1, 1, 30)`)).length, 0, "resting on a slope via Along/Rot");
  assert.equal(llm(evaluate(ramp + `blk = Box(Rot(P, Off(P, 0, 0.2), 30), 1, 1, 30)`))[0].code, "sunk");
});

test("inside: a shape poking out of its container is an error; filling it exactly is fine", () => {
  const base = `cup = Box(Pt(0, 0), 4, 4, 0, {kind: "overlay"})\n`;
  assert.equal(llm(evaluate(base + `w = Box(Pt(0, -1), 4, 2, 0, {kind: "inside", in: cup})`)).length, 0);
  const f = llm(evaluate(base + `ball = Circle(Pt(1.8, 0), 0.5, {kind: "inside", in: cup})`));
  assert.equal(f[0].code, "escape");
  assert.deepEqual(f[0].ids, ["ball", "cup"]);
  assert.equal(f[0].amount, 0.3);
});

test("Vec: exempt against the body it starts in; its head inside another solid is an error; surfaces let heads in", () => {
  const r = evaluate(`blk = Box(Pt(0, 0), 2, 2, 0)
other = Box(Pt(0, -3), 2, 2, 0)
ground = Seg(Pt(-3, -4), Pt(3, -4), {kind: "surface"})
out = Vec(Pt(0, 0), Pt(0, 3), "N")
bad = Vec(Pt(3, -3), Pt(0.5, -3), "F")
ok = Vec(Pt(-2, -3), Pt(-1, -3), "T")
deep = Vec(Pt(2, -4.5), Pt(2, -3.9), "g")`);
  const f = llm(r);
  assert.equal(f.length, 1);
  assert.equal(f[0].code, "vec-head");
  assert.deepEqual(f[0].ids, ["bad", "other"]);
});

test("pass 2 Fix: a patch on a free Pt moves its dependents; Fix on a derived point or an unknown trait is an error", () => {
  const p1 = `A = Pt(0, 0)\nB = Pt(4, 0)\nM = Mid(A, B)\nb = Box(M, 1, 1, 0)`;
  const r = evaluate({ pass1: p1, pass2: `f1 = Fix(B, {x: 6})\nf2 = Fix(b, {w: 2})` });
  close(r.points.M, [3, 0]);
  assert.equal(r.shapes.find(s => s.id === "b").geom.w, 2);
  assert.equal(llm(r).length, 0);
  const e = llm(evaluate({ pass1: p1, pass2: `f1 = Fix(M, {x: 1})\nf2 = Fix(b, {spin: 1})\nb = Box(M, 2, 2, 0)` }));
  assert.deepEqual(e.map(x => x.code), ["fix-derived", "fix-trait", "redefine"]);
  assert.match(e[0].hint, /\(A, B\)/);
});

test("mover (off by default): ghost + finding; on: nudges the later free Pt within 3x tolerance and reports fyi auto-fixed", () => {
  const src = `floor = Seg(Pt(0, 0), Pt(10, 0), {kind: "surface"})\nC = Pt(5, 0.35)\nblk = Box(C, 1, 1, 0)`;
  const off = evaluate(src);
  assert.equal(llm(off)[0].code, "sunk");
  assert.equal(off.ghosts.length, 1);
  const on = evaluate(src, { mover: true });
  assert.equal(llm(on).length, 0);
  assert.equal(on.findings[0].code, "auto-fixed");
  assert.equal(on.findings[0].cls, "fyi");
  close(on.points.C, [5, 0.5]);
  const far = evaluate(src.replace("0.35", "0.1"), { mover: true });
  assert.equal(llm(far)[0].code, "sunk", "past 3x tolerance: no move");
});

test("deterministic + streaming: chunked pushes give the same result as one evaluate(), twice", () => {
  const s = SCENES.ramp.pass1 + "\n" + SCENES.broken.pass1.replace(/^A = .*\n|^B = .*\n/gm, "");
  const whole = evaluate(s);
  const sess = createSession();
  const events = [];
  for (let i = 0; i < s.length; i += 7) events.push(...sess.push(s.slice(i, i + 7)));
  events.push(...sess.end());
  assert.deepEqual(JSON.parse(JSON.stringify(sess.result())), JSON.parse(JSON.stringify(whole)));
  assert.deepEqual(JSON.parse(JSON.stringify(evaluate(s))), JSON.parse(JSON.stringify(whole)));
  assert.ok(events.filter(e => e.type === "eval" && e.status === "ok").length > 10, "statements evaluate as their lines complete");
});

test("docs: every read_doc example and every built-in scene (but broken) has zero llm findings; broken shows every class", () => {
  const ex = docExamples();
  assert.ok(ex.length >= 10);
  for (const t of ["ex-physics", "ex-calc", "ex-geometry", "ex-cs", "ex-chem", "points", "shapes", "kinds", "pass2", "colors"]) assert.ok(TOPIC_NAMES.includes(t), t);
  for (const { topic, src } of ex) assert.deepEqual(llm(evaluate(src)), [], `${topic}:\n${src}`);
  for (const [k, sc] of Object.entries(SCENES)) if (k !== "broken") assert.deepEqual(llm(evaluate({ pass1: sc.pass1, pass2: sc.pass2 })), [], k);
  const b = evaluate(SCENES.broken.pass1), b2 = evaluate({ pass1: SCENES.broken.pass1, pass2: SCENES.broken.pass2 });
  const codes = new Set([...b.findings, ...b2.findings, ...evaluate(SCENES.broken.pass1, { mover: true }).findings].map(f => f.code));
  for (const c of ["overlap", "sunk", "escape", "vec-head", "undefined", "unknown-comp", "cycle", "undefined-ref", "fix-derived", "fix-trait", "redefine", "label-moved", "auto-fixed"]) assert.ok(codes.has(c), c);
  assert.ok(!b2.findings.some(f => f.code === "overlap"), "fx3 = Fix(c2, {y: 1.5}) clears the crate overlap");
  assert.ok(CORE.split("\n").length <= 26, "the core prompt stays short");
});

test("text-first feedback: the scene summary names centres, sizes and touching neighbours; findings text splits llm / fyi", () => {
  const r = evaluate(SCENES.ramp.pass1);
  const sum = sceneSummary(r);
  assert.match(sum, /^blk Box solid: centre \([\d.]+, [\d.]+\) size 1\.6x1\.6 angle 30°; touches ramp/m);
  const t = formatFindings(evaluate(SCENES.broken.pass1).findings);
  assert.match(t, /^Fix these:/);
  assert.match(t, /FYI \(no action needed\):/);
  assert.deepEqual(r.free, { named: ["A", "B"], inline: 0 });
  assert.match(freePointsHint(evaluate("A = Pt(0, 0)\ns = Seg(A, Pt(1, 1))")), /^Hint \(not an error\): 2 free points with raw coordinates \(A \+ 1 inline Pt\)/);
});
