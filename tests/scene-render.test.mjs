// scene.js + views.js Scene (viz MVP, todo 120; contract views/scene-contract.md): the JS port of the expression grammar (the
// contract's conformance vectors), the relation solver, anchors, ops replay (Back = replay), stage reveal of {qid} tokens, the
// deterministic label placer, the axes tick rule, Bars conserve, Trace, and the five vizbench cases drawn through views.js.
// DOM = tests/views-dom.mjs; graph.js loads first (scene.js draws arrowheads with its arrowParts()).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import "../graph.js";
import { exprEval, exprNames, fmt3, sceneModel, stateAt, solve, frame, SceneError, VIEW } from "../scene.js";
import { render } from "../views.js";
import { createParser } from "../vendor/openui-lang.mjs";
import { LIB, toSchema } from "../views-lib.js";
import { mount, html, byClass, one, all, makeDocument } from "./views-dom.mjs";
import { cases, NAMES } from "./scene-cases.mjs";

const DOC = readFileSync(new URL("../views/scene-contract.md", import.meta.url), "utf8");
const VECTORS = JSON.parse(/Conformance vectors[^\n]*\n```json\n([\s\S]*?)```/.exec(DOC)[1]);
const ROD = /```\n([\s\S]*?)```/.exec(DOC.slice(DOC.indexOf("## 9. Worked example")))[1];
const close = (a, b, eps = 1e-9, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg || ""} ${a} vs ${b}`);
const near = (p, q, eps = 1e-6, msg) => { close(p[0], q[0], eps, msg); close(p[1], q[1], eps, msg); };

/** program text -> { model, steps } through the real parser (the Steps statement's fig is the Scene) */
function parse(src) {
  const r = createParser(toSchema(LIB), LIB.root).parse(src);
  assert.deepEqual(r.meta.errors, []);
  const st = r.root.props.children.find(c => c.typeName === "Steps");
  return sceneModel(st.props.fig.props, st.props.steps.map(s => s.props));
}
const N6 = ", null".repeat(6);
/** a small scene program: objs / qs / rels as call texts, steps as [cap, ops, ask?] */
function prog(objs, qs = [], rels = [], steps) {
  const ids = objs.map(o => /"([^"]+)"/.exec(o)[1]);
  steps ||= [["You see it. Where?", [`add ${ids.join(" ")}`]], ["Look again.", [`glow ${ids[0]}`], 'Ask("Which?", ["a", "b"])'], ["Now this.", [`glow ${ids[0]}`]]];
  const lines = ["root = View([st])", `st = Steps(sc, [${steps.map((_, i) => "p" + i).join(", ")}])`,
    `sc = Scene([${objs.map((_, i) => "o" + i).join(", ")}], [${qs.map((_, i) => "q" + i).join(", ")}], ${JSON.stringify(rels)}, "alt")`];
  objs.forEach((o, i) => lines.push(`o${i} = ${o}`));
  qs.forEach((q, i) => lines.push(`q${i} = ${q}`));
  steps.forEach(([cap, ops, ask], i) => lines.push(`p${i} = Step(${JSON.stringify(cap)}${N6}, ${JSON.stringify(ops)}${ask ? ", " + ask : ""})`));
  return lines.join("\n");
}
const solved = (src, k = 0) => { const m = parse(src); return solve(m, stateAt(m, k)); };

// ─── §3 expression grammar ───
test("expr: the contract's conformance vectors (same list as views_gate.expr_eval)", () => {
  const env = { L: 10, T1: 100, a: 2 };
  for (const [text, want] of VECTORS) {
    if (typeof want === "string") {
      assert.throws(() => exprEval(text, env), e => e instanceof SceneError && e.code === want, text);
    } else close(exprEval(text, env), want, 1e-9, text);
  }
});

test("expr: x only inside a curve, names and refs, caps (80 chars, 8 deep), unknown values propagate", () => {
  assert.equal(exprEval("x^2/2+1", {}, { allowX: true, x: 2 }), 3);
  const n = exprNames("T1*rod.w + sqrt(L) - pi");
  assert.deepEqual([[...n.names].sort(), [...n.refs]], [["L", "T1"], ["rod.w"]]);
  assert.throws(() => exprEval("1" + "+1".repeat(40), {}), e => e.code === "expr-parse");
  assert.throws(() => exprEval("(((((((((1)))))))))", {}), e => e.code === "expr-parse");
  assert.equal(exprEval("((((((((1))))))))", {}), 1);
  assert.equal(exprEval("a+1", { a: null }), null);
  assert.equal(exprEval("397*90/516", {}).toFixed(3), "69.244");
});

test("fmt3: {qid} values at 3 significant figures, trailing zeros trimmed", () => {
  assert.deepEqual([160, 0.25, 10 / 3, 76.16, 8, 1234, 0, -2.5].map(fmt3), ["160", "0.25", "3.33", "76.2", "8", "1230", "0", "−2.5"]);
});

// ─── §1b anchors and §4 relations ───
test("anchors: rect, circle, triangle (hyp = the longer side), polygon, line, point, Link", () => {
  const S = solved(prog(['Shape("r", "rect", "w=4 h=2", "1,1")', 'Shape("c", "circle", "r=1", "10,0")',
    'Shape("t", "triangle", "base=8 height=3 apex=1", "0,-5")', 'Shape("p", "polygon", "pts=0,0;2,0;2,2;0,2", "20,0")',
    'Shape("l", "line", "from=0,6 to=10,6")', 'Shape("o", "point", "", "r.right")', 'Link("k", "string", "l@0.2", "r.top@0.25")']));
  const A = t => S.anchor(t);
  near(A("r"), [3, 2]); near(A("r.corner2"), [5, 3]); near(A("r.top@0.25"), [2, 3]); near(A("r.left@0.5"), [1, 2]);
  near(A("c.top"), [10, 1]); near(A("c.rim@0.25"), [10, 1]); near(A("c.left"), [9, 0]);
  near(A("t.top"), [8, -2]); near(A("t.hyp@0.5"), [4, -3.5]); near(A("t.center"), [16 / 3, -4]);
  near(A("p.center"), [21, 1]); near(A("p.edge1@0.5"), [22, 1]);
  near(A("l@0.2"), [2, 6]); near(A("o"), [5, 2]);
  near(A("k.start"), [2, 6]); near(A("k.end"), [2, 3]); near(A("k@0.5"), [2, 4.5]);
});

test("relations: pivot + set rotate turns about the pivot, and a string tied to the rod follows it (anchors are live)", () => {
  const src = prog(['Shape("rod", "rect", "w=10 h=0.4", "0,3")', 'Link("s", "string", "2,6", "rod.top@0.2")'], [], ["pivot rod rod.right"],
    [["You see it. Where?", ["add rod s"]], ["Look.", ["glow rod"], 'Ask("Which?", ["a", "b"])'], ["Now tilt.", ["set rod rotate -6"]]]);
  const m = parse(src);
  const S0 = solve(m, stateAt(m, 0)), S2 = solve(m, stateAt(m, 2));
  near(S2.anchor("rod.right"), S0.anchor("rod.right"), 1e-9, "the pivot stays put");
  const r = Math.hypot(8, 0.2), a = Math.atan2(0.2, -8) - 6 * Math.PI / 180;
  near(S2.anchor("s.end"), [10 + r * Math.cos(a), 3.2 + r * Math.sin(a)], 1e-9, "the string end rides the rod");
  assert.equal(S2.geo.get("rod").rot, -6);
});

test("relations: on puts the bottom on the surface, turned to it, outward; attach moves a Link end or a body", () => {
  const S = solved(prog(['Shape("ramp", "triangle", "base=8 height=3 apex=1", "0,0")', 'Shape("ball", "circle", "r=0.4")',
    'Link("sp", "spring", "ramp.corner0", "1,0.4")', 'Shape("box", "rect", "w=1 h=1", "5,5")'], [],
    ["on ball ramp.hyp 0.2", "attach sp.end ball.left", "attach box.corner0 ramp.top"]));
  const th = Math.atan2(3, 8) * 180 / Math.PI;
  close(S.geo.get("ball").rot, th, 1e-9, "turned to the slope");
  near(S.anchor("ball.bottom"), [1.6, 0.6], 1e-9, "its bottom on the hyp at 0.2");
  const c = S.anchor("ball"), n = [-3 / Math.hypot(8, 3), 8 / Math.hypot(8, 3)];
  near(c, [1.6 + 0.4 * n[0], 0.6 + 0.4 * n[1]], 1e-9, "on the outer side");
  near(S.anchor("sp.end"), S.anchor("ball.left"));
  near(S.anchor("box.corner0"), [8, 3]);
});

test("relations: align, distribute (gap default = the first one's size), stack end to end, set from an expression", () => {
  const S = solved(prog(['Shape("a", "rect", "w=1 h=2", "0,0")', 'Shape("b", "rect", "w=1 h=1", "3,5")', 'Shape("c", "rect", "w=2 h=1", "0,0")',
    'Shape("d", "rect", "w=1 h=1", "0,9")', 'Shape("e", "rect", "w=1 h=1", "0,9")', 'Shape("f", "rect", "w=1 h=1", "0,0")'], [],
    ["align a b bottom", "stack a c x", "set c.w 2*a.w+1", "distribute d e f x"]));
  near(S.anchor("b.corner0"), [3, 0], 1e-9, "align bottom");
  near(S.anchor("c.corner0"), [1, 0], 1e-9, "stack x");
  close(S.geo.get("c").props.w, 3);
  near(S.anchor("e.corner0"), [2, 9], 1e-9, "distribute: pitch = size + gap(size)");
  near(S.anchor("f.corner0"), [4, 0], 1e-9, "distribute keeps the other axis");
});

test("relations: scale gives vectors one length per unit of q, along their own direction", () => {
  const S = solved(prog(['Link("F1", "vector", "0,0", "+0,-2", "F", "a")', 'Link("F2", "vector", "1,0", "+3,0", "G", "b")'],
    ['Q("a", "given", 10)', 'Q("b", "given", 5)'], ["scale F1 F2"]));
  const len = id => { const g = S.geo.get(id); return Math.hypot(g.to[0] - g.from[0], g.to[1] - g.from[1]); };
  close(len("F1") / len("F2"), 2, 1e-9);
  near(S.geo.get("F2").to, [1 + len("F2"), 0]);
  assert.ok(S.geo.get("F1").to[1] < 0, "direction kept");
});

// ─── §6 ops and replay ───
test("ops: state(k) is a replay of steps 1..k; glow lasts one step; set/hide/param/camera persist", () => {
  const m = parse(prog(['Shape("a", "rect", "w=2 h=1", "0,0")', 'Shape("b", "point", "", "5,0")'], ['Q("n", "given", 3)'], [],
    [["You see a. Where?", ["add a", "glow a"]], ["Add b now.", ["add b"], 'Ask("Which?", ["a", "b"])'], ["Turn a.", ["set a rotate 30", "camera fit a"]],
     ["Hide b.", ["hide b"]], ["Change n.", ["param n 4", "glow a"]]]));
  assert.deepEqual([...stateAt(m, 0).glow], ["a"]);
  assert.deepEqual([...stateAt(m, 1).glow], []);
  assert.deepEqual(stateAt(m, 1).visible, ["a", "b"]);
  assert.deepEqual(stateAt(m, 3).visible, ["a"]);
  assert.equal(stateAt(m, 4).sets.get("a rotate"), "30");
  assert.deepEqual(stateAt(m, 4).camera, ["a"]);
  assert.equal(solve(m, stateAt(m, 4)).q.get("n"), 4);
  assert.equal(solve(m, stateAt(m, 3)).q.get("n"), 3);
  assert.deepEqual(JSON.stringify(solve(m, stateAt(m, 2)).dump()), JSON.stringify(solve(m, stateAt(m, 2)).dump()), "pure");
});

// ─── §2 stage: {qid} tokens ───
test("stage: an answer shows its sym (or ?) before a solve and its value after; derived and given show values", () => {
  const m = parse(ROD);
  const text = (stage, k) => frame(m, k, stage, { doc: makeDocument() }).labels.map(l => l.text);
  const wrong = text("wrong", 5), post = text("post", 5);
  assert.ok(wrong.includes("100 N") && wrong.includes("8 segments") && wrong.includes("5 segments"), wrong.join("|"));
  const f = frame(m, 5, "wrong", { doc: makeDocument() });
  assert.ok(!JSON.stringify(f.math).includes("160"), "the answer never in a hidden stage");
  assert.match(f.math.map(r => r.join(" ")).join(), /W × 5/);
  assert.match(frame(m, 5, "post", { doc: makeDocument() }).math.map(r => r.join(" ")).join(), /W × 5/);
  assert.ok(post.includes("100 N"));
  const m2 = parse(prog(['Shape("a", "point", "", "0,0", "{W} and {u}")'], ['Q("W", "answer", null, "N", "2*3", "W_j")', 'Q("u", "unknown")']));
  assert.deepEqual(frame(m2, 0, "pre", { doc: makeDocument() }).labels.map(l => [l.text, l.hidden]), [["W_j and ?", true]]);
  assert.deepEqual(frame(m2, 0, "post", { doc: makeDocument() }).labels.map(l => [l.text, l.hidden]), [["6 and ?", true]]);
});

test("axes: in a hidden stage the ticks within 15% of a hidden value drop; after a solve they come back", () => {
  const m = parse(prog(['Axes("ax", "0,4 x", "0,100 T", ["f curve 20*x"])'], ['Q("A", "answer", null, null, "80")']));
  const ticks = st => frame(m, 0, st, { doc: makeDocument() }).ticks.ax.y;
  assert.ok(!ticks("wrong").some(v => Math.abs(v - 80) <= 12), ticks("wrong").join());
  assert.ok(ticks("post").includes(80), ticks("post").join());
});

test("bars: conserve stacks the items in one outline of height total; a param drains one", () => {
  const m = parse(prog(['Bars("en", ["spring: Us*(1-f)", "move: Us*f"], "Us", true)'], ['Q("Us", "given", 10)', 'Q("f", "given", 0)'], [],
    [["You see it. Where?", ["add en"]], ["Look.", ["glow en"], 'Ask("Which?", ["a", "b"])'], ["Drain it.", ["param f 1"]]]));
  for (const k of [0, 2]) {
    const b = frame(m, k, "wrong", { doc: makeDocument() }).bars.en;
    close(b.segs.reduce((s, x) => s + x.h, 0), b.outline.h, 1e-6, `step ${k}`);
  }
  assert.ok(frame(m, 0, "wrong", { doc: makeDocument() }).bars.en.segs[0].h > 0);
  close(frame(m, 2, "wrong", { doc: makeDocument() }).bars.en.segs[0].h, 0, 1e-9);
});

// ─── label placer ───
test("placer: deterministic, every label inside the figure, no two labels overlap (all five cases, every step, both stages)", () => {
  const all5 = cases();
  for (const name of NAMES) for (const stage of ["wrong", "post"]) {
    const m = parse(all5[name][stage]);
    for (let k = 0; k < m.steps.length; k++) {
      const a = frame(m, k, stage, { doc: makeDocument() }), b = frame(m, k, stage, { doc: makeDocument() });
      assert.equal(html(a.svg || makeDocument().createElement("i")), html(b.svg || makeDocument().createElement("i")), `${name} ${k} deterministic`);
      const boxes = a.labels.map(l => l.box);
      for (const [x, y, w, h] of boxes) assert.ok(x >= 0 && y >= 0 && x + w <= VIEW.W + 0.01 && y + h <= VIEW.H + 0.01, `${name} ${stage} ${k}: ${[x, y, w, h]}`);
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
        const [p, q] = [boxes[i], boxes[j]];
        const ov = Math.max(0, Math.min(p[0] + p[2], q[0] + q[2]) - Math.max(p[0], q[0])) * Math.max(0, Math.min(p[1] + p[3], q[1] + q[3]) - Math.max(p[1], q[1]));
        assert.equal(ov, 0, `${name} ${stage} step ${k + 1}: "${a.labels[i].text}" over "${a.labels[j].text}"`);
      }
    }
  }
});

test("placer: a label never sits on a drawn line of its own scene when a free spot exists (the rod's 8 segments, the strings)", () => {
  const m = parse(ROD);
  const f = frame(m, 5, "wrong", { doc: makeDocument() });
  const hit = (b, [a, c]) => {   // segment a-c crosses box b
    const [x, y, w, h] = b, ins = p => p[0] > x && p[0] < x + w && p[1] > y && p[1] < y + h;
    for (let i = 0; i <= 20; i++) { const p = [a[0] + (c[0] - a[0]) * i / 20, a[1] + (c[1] - a[1]) * i / 20]; if (ins(p)) return true; }
    return false;
  };
  for (const l of f.labels) {
    const crossing = f.segs.filter(s => s.id !== l.id && hit(l.box, s.pts));
    assert.ok(!crossing.length || l.knock, `"${l.text}" crosses ${crossing.map(s => s.id)} with no knockout`);
  }
});

// ─── views.js: the Scene stepper ───
test("views: a scene stepper draws step 1 of n, Next/Back replay, the caption follows, the ask pills only on its step", () => {
  const m = mount();
  const v = render(ROD, m);
  assert.deepEqual(v.errors, []);
  assert.equal(one(m, "vw-n").textContent, "Step 1 of 6");
  const svg = all(m, n => n.tagName === "SVG")[0];
  assert.equal(svg.getAttribute("viewBox"), `0 0 ${VIEW.W} ${VIEW.H}`);
  const [back, next] = byClass(one(m, "vw-foot"), "btn");
  const snap = () => html(one(m, "vw-sc"));
  const s1 = snap();
  next.click(); next.click();
  assert.equal(one(m, "vw-n").textContent, "Step 3 of 6");
  assert.match(one(m, "vw-cap").textContent, /Now count from the weight/);
  assert.equal(byClass(one(m, "vw-ask"), "vw-pill").length, 2);
  assert.ok(!one(m, "vw-ask").classList.contains("off"));
  next.click();
  assert.ok(one(m, "vw-ask").classList.contains("off"), "no ask on step 4");
  back.click(); back.click(); back.click();
  assert.equal(snap(), s1, "Back = an exact replay of step 1");
  assert.ok(back.hasAttribute("disabled"));
});

test("views: the rod tilts on step 4 (a set op), the math rows hold their slot from step 1 and show on step 5", () => {
  const m = mount();
  render(ROD, m);
  const [, next] = byClass(one(m, "vw-foot"), "btn");
  const rodT = () => all(m, n => n.getAttribute("data-id") === "rod")[0].getAttribute("data-rot");
  assert.equal(rodT(), "0");
  assert.ok(one(m, "vw-math").classList.contains("off"), "reserved, not shown");
  next.click(); next.click(); next.click();
  assert.equal(rodT(), "-6");
  next.click();
  assert.ok(!one(m, "vw-math").classList.contains("off"));
  assert.ok(one(m, "vw-math").classList.contains("focus"), "glow eq");
  assert.match(one(m, "vw-math").textContent, /100 × 8\s*=\s*W × 5/);
});

test("views: all five gated cases draw in both stages with no error; the hidden answer is nowhere in a wrong-stage DOM", () => {
  const all5 = cases();
  for (const name of NAMES) {
    for (const stage of ["wrong", "post"]) {
      assert.deepEqual(all5[name].log[stage], ["ok"], `${name} ${stage} passes the gate`);
      const m = mount();
      const v = render(all5[name][stage], m, { stage });
      assert.deepEqual(v.errors, [], `${name} ${stage}`);
      const [, next] = byClass(one(m, "vw-foot"), "btn");
      const seen = [];
      for (;;) { seen.push(html(m)); if (next.hasAttribute("disabled")) break; next.click(); }
      if (stage === "wrong" && name === "loop") assert.ok(seen.every(s => !/s = 10\b|s=10\b/.test(s)), "the printed sum stays hidden");
      if (stage === "wrong" && name === "rod") assert.ok(seen.every(s => !/\b160\b/.test(s)));
    }
  }
});

test("views: loop: the code line follows the trace tick, the vars show the tick's values", () => {
  const m = mount();
  render(cases().loop.wrong, m, { stage: "wrong" });
  const [, next] = byClass(one(m, "vw-foot"), "btn");
  next.click();                                                     // set tr tick 2: "L2 i=- s=0" (the line just run)
  const hl = () => one(m, "vw-code").childNodes[0].childNodes.findIndex(li => li.classList.contains("hl")) + 1;
  assert.equal(hl(), 2);
  assert.match(one(m, "vw-vars").textContent, /i = -.*s = 0/);
  next.click(); next.click();                                       // tick 10: L4 i=4 s=?
  assert.equal(hl(), 4);
  assert.match(one(m, "vw-vars").textContent, /i = 4/);
  assert.match(one(m, "vw-vars").textContent, /s = \?/);
});

test("views: Scene alone (not in a Steps) draws its last state as a still figure", () => {
  const src = 'root = View([sc])\nsc = Scene([a], null, null, "a dot")\na = Shape("a", "point", "", "0,0", "A")';
  const m = mount();
  const v = render(src, m);
  assert.deepEqual(v.errors, []);
  assert.equal(one(m, "vw-sc").getAttribute("aria-label"), "a dot");
});
