// layout-core.mjs smoke + sanity (brain AGENTS.md directive 23): each point op, the DAG errors (parallel Meet, cycle, undefined),
// the layout checks (solid pair, surface sunk vs resting, inside escape, Vec head), pass-2 Fix, the mover, determinism,
// and every read_doc example + built-in scene through evaluate(). Bundle 2: legend (asked + auto-moved), Dim placement + fallback,
// Layer stacking (show / hide / zoom / lit), Fix restyle inside a layer, Curve (closed, tapered, mirror, self-cross) + Union.
// Plan lines (Q41: // goal anchor layers budget -> result().plan + fyi plan-layers / plan-budget / plan-missing), layer cap 6 (Q42).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { evaluate, createSession, sceneSummary, ghostLine, formatFindings, freePointsHint, legendLines, stepLines, planLines } from "../layout-core.mjs";
import { docExamples, SCENES, TOPIC_NAMES, TOPICS, CORE, DOCS, DOC_INDEX, INLINE_EXAMPLES, readDoc } from "../layout-docs.mjs";
import { generate } from "../tools/gen_figure_docs.mjs";

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
  assert.deepEqual(r.findings.map(f => f.code), ["plan-missing"]);
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
  for (const c of ["overlap", "sunk", "escape", "vec-head", "undefined", "unknown-comp", "cycle", "undefined-ref", "fix-derived", "fix-trait", "redefine", "legend", "auto-fixed", "plan-missing"]) assert.ok(codes.has(c), c);
  assert.ok(!b2.findings.some(f => f.code === "overlap"), "fx3 = Fix(c2, {y: 1.5}) clears the crate overlap");
  assert.ok(CORE.replace(DOC_INDEX, "").replace(INLINE_EXAMPLES, "").split("\n").length <= 34, "the core prompt prose stays short");
  assert.equal(DOC_INDEX.split("\n").length, DOCS.length, "the doc index has one line per doc");
  for (const line of DOC_INDEX.split("\n")) assert.ok(line.length <= 140, `a doc index line is over 140 chars: ${line}`);
  assert.match(CORE, /Plan first \(the \/\/ lines\)/);
  assert.match(CORE, /max 6/);
  assert.match(TOPICS.layers, /```\n\/\/ goal: /);
  for (const [k, sc] of Object.entries(SCENES)) if (k !== "broken") assert.ok(evaluate(sc.pass1).plan, `${k} has plan lines`);
  assert.match(CORE, /MINIMALISTIC, FUNCTIONAL/);
  assert.ok(!/Svg|path d/.test(CORE + Object.values(TOPICS).join("")), "raw SVG stays out of the prompt");
  for (const t of ["curves", "legend", "dim", "layers"]) assert.ok(TOPIC_NAMES.includes(t), t);
});

test("figure-docs store: generate() equals the inlined region; ids unique; CORE lists every id; readDoc resolves", () => {
  const src = readFileSync(new URL("../figure-docs.txt", import.meta.url), "utf8");
  const layout = readFileSync(new URL("../layout-docs.mjs", import.meta.url), "utf8");
  const m = /\/\/ <gen figure-docs: do not edit, run node tools\/gen_figure_docs\.mjs>\n([\s\S]*?)\/\/ <\/gen figure-docs>/.exec(layout);
  assert.ok(m, "layout-docs.mjs has the gen markers");
  assert.equal(m[1], generate(src), "layout-docs.mjs is in sync with figure-docs.txt (run node tools/gen_figure_docs.mjs)");
  const ids = DOCS.map(d => d.id);
  assert.equal(new Set(ids).size, ids.length, "every doc id is unique");
  assert.equal(DOC_INDEX.split("\n").length, DOCS.length, "DOC_INDEX has one line per doc");
  for (const d of DOCS) assert.ok(CORE.includes(d.id), `CORE lists ${d.id}`);
  for (const d of DOCS) assert.equal(readDoc(d.id), TOPICS[d.id], `readDoc(${d.id}) is its TOPICS body`);
  assert.equal(readDoc("nope"), null);
});

test("figure-docs parser: rejects tag text in a body, a duplicate id and a missing use (with the line)", () => {
  assert.throws(() => generate('<topic id="a" title="A" use="use when x">\nbody </example>\n</topic>'), /figure-docs\.txt:2:.*tag text inside the body/);
  assert.throws(() => generate('<topic id="a" title="A" use="use when x">\none\n</topic>\n\n<topic id="a" title="B" use="use when y">\ntwo\n</topic>'), /figure-docs\.txt:5: duplicate id "a"/);
  assert.throws(() => generate('<topic id="a" title="A">\nbody\n</topic>'), /figure-docs\.txt:1: topic is missing the use attribute/);
});

test("inline examples: INLINE_EXAMPLES holds every inline body and resolvable more pointers; bad pointers throw", () => {
  const byId = new Map(DOCS.map(d => [d.id, d]));
  const inline = DOCS.filter(d => d.attrs.inline === "1");
  for (const d of inline) {
    assert.ok(INLINE_EXAMPLES.includes(`Worked example: ${d.attrs.title}`), `${d.id} is inline`);
    assert.ok(INLINE_EXAMPLES.includes(d.body), `${d.id} body is verbatim inline`);
    for (const ref of (d.attrs.more || "").trim().split(/\s+/).filter(Boolean)) {
      assert.ok(byId.has(ref), `${d.id} more -> ${ref} resolves`);
      assert.notEqual(ref, d.id, `${d.id} more does not point at itself`);
    }
  }
  const src = `<example id="a" topic="math" tags="t" title="Title A" use="use when a" inline="1" more="b c">
body A
</example>
<example id="b" topic="math" tags="t" title="Title B" use="use when b">
body B
</example>
<example id="c" topic="math" tags="t" title="Title C" use="use when c">
body C
</example>`;
  const region = generate(src);
  assert.match(region, /export const INLINE_EXAMPLES = "Worked example: Title A\\nbody A\\nMore like this: read_doc\(id\) for b \(Title B\), c \(Title C\)";/);
  assert.throws(() => generate(src.replace('more="b c"', 'more="nope"')), /more id "nope" does not name a doc/);
  assert.throws(() => generate(src.replace('more="b c"', 'more="a"')), /"a" more points to itself/);
  assert.throws(() => generate(src.replace('inline="1"', 'inline="yes"')), /inline must be "1"/);
  assert.throws(() => generate(`<topic id="a" title="A" use="use when a" more="b">\nx\n</topic>`), /attribute "more" is only for <example> blocks/);
  assert.ok(generate(`<example id="a" topic="math" tags="t" title="Title A" use="use when a">\nx\n</example>`).includes('export const INLINE_EXAMPLES = "";'), "no inline doc = empty string");
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

test("bare words in opts are strings, not refs ({kind: surface}); a pass-2 line repairs a pass-1 line that failed to parse", () => {
  const r = evaluate("A = Pt(0, 0)\nB = Pt(4, 0)\ng = Seg(A, B, {kind: surface, tone: muted})");
  assert.deepEqual(r.findings.filter(f => f.cls === "llm"), []);
  assert.equal(r.shapes[0].kind, "surface");
  const r2 = evaluate({ pass1: "A = Pt(0, 0)\nw1 = Seg(A, r1.c)\nB = Pt(4, 0)", pass2: "w1 = Seg(A, B)" });
  assert.deepEqual(r2.findings.filter(f => f.cls === "llm"), []);
  assert.equal(r2.status.w1, "ok");
});

test("legend: {legend} names go under the drawing; a label with no room by its anchor moves there too (fyi), never a leader line", () => {
  const r = evaluate(`G = Pt(0, 0)
floor = Seg(Off(G, -3, 0), Off(G, 3, 0), {kind: "surface"})
cell = Box(Off(G, 0, 0.25), 0.9, 0.9, 0, {kind: "overlay"})
studs = Box(Off(G, 0, 0.25), 0.5, 0.5, 0, {fill: true, label: "students on the piston"})
crate = Box(Off(G, 2, 0.5), 1, 1, 0, {legend: "elephant"})
t = Label(Off(G, 2, 0.5), "r = 0.20 m")`);
  assert.deepEqual(llm(r), []);
  const byText = Object.fromEntries(r.legend.map(e => [e.text, e]));
  assert.equal(byText.elephant.id, "crate");
  assert.equal(byText.elephant.auto, false);
  assert.equal(byText["students on the piston"].id, "studs", "too long for the small box and its sides: legend, beside a render of studs");
  assert.equal(byText["r = 0.20 m"].id, "crate", "a free Label inside a body moves to the legend with a render of the nearest shape");
  const moved = r.findings.filter(f => f.code === "legend");
  assert.equal(moved.length, 2);
  for (const f of moved) { assert.equal(f.cls, "fyi"); assert.match(f.hint, /^moved to legend: /); }
  assert.ok(r.labels.every(l => !("lead" in l)), "no leader lines");
  assert.ok(r.view.H > r.view.drawH, "the legend row adds height under the drawing");
  assert.match(legendLines(r), /crate: "elephant" \(asked with legend\)/);
  const roomy = evaluate(`b = Box(Pt(0, 0), 6, 2, 0, {fill: true, label: "m"})`);
  assert.equal(roomy.labels[0].id, "b");
  assert.equal(roomy.legend.length, 0, "a label that fits inside its shape stays there");
});

test("Dim: a dimension line beside AB with its text; the next one goes to the other side or further out; no room = legend; never a solid", () => {
  const r = evaluate(`A = Pt(0, 0)
B = Pt(4, 0)
C = Pt(4, 3)
tri = Poly([A, B, C], {fill: true, tone: "sky", shade: 3})
d1 = Dim(A, B, "4 cm")
d2 = Dim(A, B, "four cm")
d3 = Dim(A, B, "4.0 cm")
d4 = Dim(A, B, "40 mm")
d5 = Dim(A, B, "0.04 m")
over = Box(Pt(2, -0.4), 0.5, 0.5, 0)`);
  assert.deepEqual(llm(r), [], "a Dim is decor: a box over its line is no conflict");
  const dims = Object.fromEntries(r.dims.map(d => [d.id, d]));
  assert.equal(dims.d1.text, "4 cm");
  assert.ok(dims.d1.a[1] > 0 && dims.d1.ticks.length === 2, "a line with two end ticks");
  const placed = r.labels.filter(l => l.id.startsWith("d")).map(l => l.id);
  assert.ok(placed.includes("d1") && placed.length >= 2 && placed.length < 5, `some placed, the rest fall back: ${placed}`);
  const legend = r.legend.filter(e => e.id.startsWith("d"));
  assert.equal(placed.length + legend.length, 5, "each Dim's text is either placed or in the legend");
  for (const e of legend) assert.ok(r.findings.some(f => f.code === "legend" && f.ids[0] === e.id));
  const boxes = r.labels.filter(l => l.id.startsWith("d")).map(l => l.box);
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const [p, q] = [boxes[i], boxes[j]];
    assert.ok(Math.min(p[0] + p[2], q[0] + q[2]) <= Math.max(p[0], q[0]) || Math.min(p[1] + p[3], q[1] + q[3]) <= Math.max(p[1], q[1]), "placed dim texts never overlap");
  }
});

test("Layer: stacked steps (prefix + layers 1..k, minus hidden), forward refs, zoom camera, lit, and a Fix restyle that starts at its layer", () => {
  const src = `G = Pt(0, 0)
ground = Seg(Off(G, -4, 0), Off(G, 4, 0), {kind: "surface", tone: "muted"})
cube = Box(Off(G, 0, 2), 4, 4, 0)
s1 = Layer([f1], {title: "The cube"})
f1 = Fix(cube, {tone: "amber", fill: true})
s2 = Layer([horn, beast], {lit: [horn], zoom: [horn], title: "Add a horn"})
horn = Curve([Off(G, -0.6, 4), Off(G, -0.3, 5), Off(G, 0.6, 5.9)], {w: [0.9, 0.05], fill: true, tone: "violet"})
beast = Union([cube, horn], {legend: "horned cube"})
s3 = Layer([], {hide: [horn], title: "No horn"})`;
  const r = evaluate(src);
  assert.deepEqual(llm(r), []);
  assert.equal(r.steps.length, 4);
  assert.deepEqual(r.steps.map(s => s.show), [["ground", "cube"], ["ground", "cube"], ["ground", "cube", "horn"], ["ground", "cube"]]);
  const tone = k => r.steps[k].shapes.find(s => s.id === "cube").opts.tone;
  assert.equal(tone(0), undefined, "the prefix has no restyle");
  assert.equal(tone(1), "amber", "f1 restyles from step 1 on");
  assert.equal(tone(3), "amber");
  assert.deepEqual(r.steps[2].lit, ["horn"]);
  assert.deepEqual(r.steps[2].zoom, ["horn"]);
  assert.ok(r.steps[2].view.s > r.steps[1].view.s * 1.5, "the zoom step's camera is closer");
  const hv = r.steps[2].view, hs = r.steps[2].shapes.find(s => s.id === "horn").geom.pts;
  for (const p of hs) { const x = hv.ox + (p[0] - hv.x0) * hv.s, y = hv.drawH - hv.oy - (p[1] - hv.y0) * hv.s; assert.ok(x >= 0 && x <= hv.W && y >= 0 && y <= hv.drawH, "the zoomed shape is in frame"); }
  assert.equal(r.steps[0].view.s, r.steps[3].view.s, "steps without zoom share one camera");
  assert.ok(r.steps.every(s => s.view.H === r.steps[0].view.H), "one figure height for every step");
  assert.ok(r.steps[2].legend.some(e => e.text === "horned cube") && !r.steps[1].legend.some(e => e.text === "horned cube"), "a Union's legend joins at its step");
  assert.match(stepLines(r), /step 1 s1 "The cube": adds nothing; restyles with f1/);
  // shapes never shown together never conflict; a bad layer reference is named
  const sw = evaluate(`a = Box(Pt(0, 0), 2, 2, 0)\ns1 = Layer([b], {hide: [a]})\nb = Box(Pt(0.5, 0), 2, 2, 0)\ns2 = Layer([], {lit: [ghost], zoom: [c]})\ns3 = Layer([c])\nc = Box(Pt(5, 0), 1, 1, 0)`);
  const codes = llm(sw).map(f => f.code);
  assert.ok(!codes.includes("overlap"), "a hidden block and its replacement never coexist");
  assert.ok(codes.includes("undefined-ref") && codes.includes("layer-ref"), codes.join());
});

test("Curve: smooth through the points, flattened once for drawing AND collision; closed, tapered, mirror; self-crossing is an error", () => {
  const r = evaluate(`blob = Curve([Pt(0, 0), Pt(2, 0), Pt(2, 2), Pt(0, 2)], {closed: true})
box = Box(Pt(2.3, 1), 1, 1, 0)
horn = Curve([Pt(5, 0), Pt(5.5, 1), Pt(6.5, 1.6)], {w: [0.6, 0.05]})
lens = Curve([Pt(9, 2), Pt(9.4, 0), Pt(9, -2)], {closed: true, mirror: [Pt(9, 0), Pt(9, 1)]})
path = Curve([Pt(0, -1), Pt(3, -1.5), Pt(6, -1)])
cross = Seg(Pt(1, -2), Pt(1, -0.6))`);
  const f = llm(r);
  assert.deepEqual(f.map(x => [x.code, ...x.ids]), [["overlap", "box", "blob"]], "the box pokes into the smooth blob; the open path never conflicts with a line");
  const g = id => r.shapes.find(s => s.id === id).geom;
  assert.ok(g("blob").pts.length > 12 && g("blob").area, "flattened into many points");
  assert.ok(g("horn").pts.length > g("horn").line.length * 2 - 1, "a tapered stroke is an outline round its centreline");
  const lx = g("lens").pts.map(p => p[0]);
  assert.ok(Math.abs(Math.min(...lx) - 8.6) < 0.05 && Math.abs(Math.max(...lx) - 9.4) < 0.05, "mirror makes the other half");
  assert.ok(!g("path").pts && g("path").line.length > 3);
  const bad = llm(evaluate(`k = Curve([Pt(0, 3), Pt(2, 4), Pt(2, 3), Pt(0, 4)], {closed: true})\nl = Curve([Pt(5, 0), Pt(7, 1), Pt(6, 2), Pt(6, -1)])`));
  assert.deepEqual(bad.map(x => [x.code, x.ids[0]]), [["self-cross", "k"], ["self-cross", "l"]]);
  assert.equal(llm(evaluate(`k = Curve([Pt(0, 0), Pt(1, 1)], {w: 0.2, closed: true})`))[0].code, "bad-args");
});

test("Union: parts never conflict with each other, each part still collides with other objects; its opts fill in", () => {
  const r = evaluate(`body = Circle(Pt(0, 0), 1, {fill: true})
head = Circle(Pt(1.2, 0.5), 0.5, {fill: true, tone: "ink"})
eleph = Union([body, head], {tone: "violet", legend: "elephant"})
rock = Circle(Pt(1.9, 0.5), 0.4)`);
  assert.deepEqual(llm(r).map(f => f.ids), [["rock", "head"]]);
  assert.equal(r.shapes.find(s => s.id === "body").opts.tone, "violet", "the Union's tone fills in");
  assert.equal(r.shapes.find(s => s.id === "head").opts.tone, "ink", "a part's own tone wins");
  assert.deepEqual(r.legend.map(e => [e.id, e.text]), [["eleph", "elephant"]]);
  assert.match(sceneSummary(r), /head Circle solid \(part of eleph\)/);
});

test("pelican (Tony's acceptance scene): only Curve / Union / Circle / Poly / Box, zero llm findings, the body floats ON the lake", () => {
  const sc = SCENES.pelican.pass1;
  assert.ok(!/Svg|path/.test(sc));
  const r = evaluate(sc);
  assert.deepEqual(llm(r), []);
  assert.match(sceneSummary(r), /^body Curve solid \(part of bird\) \[step 1\]: .*touches .*lake/m);
  const sunk = evaluate(sc.replace("Off(G, 0.6, 0), Off(G, 2, 0.25)", "Off(G, 0.6, -0.4), Off(G, 2, 0.25)"));
  assert.ok(llm(sunk).some(f => f.code === "sunk" && f.ids[0] === "body"), "pushed under the water line: sunk");
  assert.deepEqual(r.steps[2].legend.map(e => e.text), ["pelican"]);
});

test("determinism with layers + curves: streamed in chunks or whole, twice, the same result", () => {
  const s = SCENES.slit.pass1;
  const whole = evaluate(s), sess = createSession();
  for (let i = 0; i < s.length; i += 11) sess.push(s.slice(i, i + 11));
  sess.end();
  assert.deepEqual(JSON.parse(JSON.stringify(sess.result())), JSON.parse(JSON.stringify(whole)));
  assert.deepEqual(JSON.parse(JSON.stringify(evaluate(s))), JSON.parse(JSON.stringify(whole)));
});

test("plan lines: the 4 // keys (any case) are captured, streamed or whole; plan-layers / plan-budget / plan-missing are fyi only", () => {
  const src = `// Goal: why the box stays put
// ANCHOR: a box on the floor
// layers: 1 weight and normal (W, N), 2: the push
// budget: 4 statements
// a plain comment is dropped
// colour: not a plan key
A = Pt(0, 0)
B = Pt(4, 0) // trailing comments drop
g = Seg(A, B, {kind: "surface"})
s1 = Layer([v], {title: "Push"})
v = Vec(Off(A, 1, 1), Off(A, 2, 1), "F")`;
  const r = evaluate(src);
  assert.deepEqual(r.plan, { goal: "why the box stays put", anchor: "a box on the floor", layers: ["weight and normal (W, N)", "the push"], budget: 4 });
  assert.deepEqual(llm(r), []);
  assert.deepEqual(r.findings.map(f => [f.code, f.cls, f.line]), [["plan-layers", "fyi", 3], ["plan-budget", "fyi", 4]]);
  const s = createSession();
  for (let i = 0; i < src.length; i += 7) s.push(src.slice(i, i + 7));
  s.end();
  assert.deepEqual(s.result().plan, r.plan);
  assert.match(planLines(r), /layers: 2 declared .*; 1 drawn/);
  assert.match(planLines(r), /budget: 4; 5 statements used/);
  const ok = evaluate("// goal: a dot\n// layers: none\n// budget: 2\nA = Pt(0, 0)");
  assert.deepEqual(ok.findings, []);
  assert.deepEqual(ok.plan.layers, []);
  const none = evaluate("A = Pt(0, 0)");
  assert.equal(none.plan, null);
  assert.deepEqual(none.findings.map(f => [f.code, f.cls]), [["plan-missing", "fyi"]]);
  assert.match(planLines(none), /^Plan: none/);
});

test("layer cap: six Layers are fine, a 7th Layer statement is an llm finding too-many-layers", () => {
  const prog = n => ["// layers: " + Array.from({ length: n }, (_, i) => `${i + 1} dot ${i + 1}`).join(", "), "A = Pt(0, 0)",
    ...Array.from({ length: n }, (_, i) => `s${i + 1} = Layer([d${i + 1}], {title: "Dot ${i + 1}"})\nd${i + 1} = Circle(Off(A, ${2 * i}, 0), 0.5)`)].join("\n");
  assert.deepEqual(llm(evaluate(prog(6))), []);
  const f = llm(evaluate(prog(7)));
  assert.deepEqual(f.map(x => [x.code, x.ids]), [["too-many-layers", ["s7"]]]);
});

test("shade: the tone-shade option is 1/2/3; the old layer: name is a bad-args hint; the renderer still outputs layer", () => {
  const ok = evaluate(`A = Pt(0, 0)
B = Pt(3, 0)
S = Seg(A, B, {shade: 2, label: "m"})`);
  assert.deepEqual(llm(ok), []);
  assert.equal(ok.shapes.find(s => s.id === "S").opts.shade, 2);
  assert.equal(ok.labels.find(l => l.id === "S").layer, 2, "the output field stays layer (the lab reads it)");
  const old = llm(evaluate(`A = Pt(0, 0)
B = Pt(3, 0)
S = Seg(A, B, {layer: 2})`));
  assert.deepEqual(old.map(x => x.code), ["bad-args"]);
  assert.match(old[0].hint, /layer: was renamed: use shade: 1, 2 or 3 \(Layer\(\.\.\.\) is the step stack\)/);
  const oldU = llm(evaluate(`A = Pt(0, 0)
B = Pt(3, 0)
S = Seg(A, B)
U = Union([S], {layer: 2})`));
  assert.deepEqual(oldU.map(x => x.code), ["bad-args"]);
  assert.match(oldU[0].hint, /use shade: 1, 2 or 3/);
  assert.equal(llm(evaluate(`A = Pt(0, 0)\nB = Pt(3, 0)\nS = Seg(A, B, {shade: 4})`))[0].code, "bad-args", "shade outside 1-3 still fails");
});

test("lenient lexer: − and – read as -, a bare (x, y) argument or list item is a point, quotes and grouping are untouched", () => {
  const r = evaluate(`A = Pt(\u22121, 0)
S = Seg(A, (2, 0))`);
  assert.deepEqual(llm(r), []);
  close(r.points.A, [-1, 0]);
  close(r.shapes.find(s => s.id === "S").geom.b, [2, 0]);
  const en = evaluate(`A = Pt(0, 0)\nS = Seg(A, (2 \u2013 0, 3))`);
  close(en.shapes.find(s => s.id === "S").geom.b, [2, 3]);
  const poly = evaluate(`P = Poly([(0, 0), (3, 0), (0, 3)])`);
  assert.equal(poly.shapes[0].geom.pts.length, 3, "a list item too");
  const lbl = evaluate(`L = Label(Pt(0, 0), "x \u2212 1")`);
  assert.equal(lbl.shapes.find(s => s.id === "L").geom.text, "x \u2212 1", "text inside quotes is never changed");
  const quoted = evaluate(`L = Label(Pt(0, 0), "(1, 2)")`);
  assert.equal(quoted.shapes.find(s => s.id === "L").geom.text, "(1, 2)", "a quoted tuple is text, not a point");
  const box = evaluate(`B = Box(Pt(0, 0), (1 + 1) * 2, 1)`);
  assert.equal(box.shapes.find(s => s.id === "B").geom.w, 4, "grouping is not a point");
  const off = evaluate(`O = Pt(0, 0)\nV = Off(O, (2), 1)`);
  close(off.points.V, [2, 1], "(2) stays a number");
});
