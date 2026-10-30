// figcheck.js (todo 124, audit AUDIT-2026-10-29 §2/§3 U2): the one invariant core every renderer (graph.js, scene.js), the
// Playwright checker and the gate share. Pure model-space geometry: shapes, SAT / circle x polygon / Liang-Barsky / point-segment,
// contact gap and penetration depth, the I-* checks (one planted-bad + its good per check), the label packer ported from
// scene.js place() (golden: every place() call of the 5 vizbench cases on ccr-viz-b df549d7, tests/fixtures/figcheck-place.json),
// "never mutates the caller's model", and the 2 ms budget (12 marks + 6 labels).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as F from "../figcheck.js";

const close = (a, b, eps, msg = "") => assert.ok(Math.abs(a - b) <= eps, `${msg} ${a} vs ${b} (±${eps})`);
const ids = fs => fs.map(f => f.id);
const deg = Math.PI / 180;
function deepFreeze(o) { if (o && typeof o === "object" && !Object.isFrozen(o)) { Object.freeze(o); for (const k of Object.keys(o)) deepFreeze(o[k]); } return o; }

// a 30° ramp like livefig.py's EXAMPLE: incline at [-2,0], base 4; hyp from [-2,0] up to [2, 4 tan30]
const RAMP = { id: "ramp", at: [-2, 0], base: 4, angle: 30 };
const out30 = [-Math.sin(30 * deg), Math.cos(30 * deg)];
/** a 0.8 x 0.5 box at 30°, its centre `off` along the ramp's outward normal from the hyp point at x = 0 (off = h/2 rests) */
const onRamp = off => { const s = [0, 2 * Math.tan(30 * deg)]; return [s[0] + out30[0] * off, s[1] + out30[1] * off]; };

// ─── shapes and primitives ───
test("shapes: incline = graph.js inclinePts (flip too), box = graph.js body pts, the hyp's outward normal points away from the base corner", () => {
  const inc = F.incline(RAMP);
  close(inc.pts[2][1], 4 * Math.tan(30 * deg), 1e-12);
  assert.deepEqual(inc.surface.a, [-2, 0]);
  close(inc.surface.out[0], out30[0], 1e-12); close(inc.surface.out[1], out30[1], 1e-12);
  const fl = F.incline({ ...RAMP, flip: true });
  assert.deepEqual(fl.pts[1], [-6, 0]);
  assert.ok(fl.surface.out[0] > 0 && fl.surface.out[1] > 0, "flipped ramp faces up-right");
  const b = F.box("b", [1, 2], 2, 1, 90);
  close(b.pts[0][0], 1.5, 1e-12); close(b.pts[0][1], 1, 1e-12);       // graph.js: at + rot([-w/2,-h/2], angle)
  assert.equal(F.wseg("w", [0, 0], [4, 0], 0.2).pts.length, 4);
});

test("SAT polygon x polygon: overlap depth + normal, touching = no hit, collinear (shared) edges = no hit, degenerate edge ok", () => {
  const A = F.box("A", [0, 0], 1, 1), B = F.box("B", [0.7, 0], 1, 1);
  const r = F.collide(A, B);
  assert.ok(r.hit); close(r.depth, 0.3, 1e-12); close(Math.abs(r.normal[0]), 1, 1e-12);
  assert.equal(F.collide(A, F.box("T", [1, 0], 1, 1)).hit, false, "edge to edge");
  assert.equal(F.collide(A, F.box("C", [1, 1], 1, 1)).hit, false, "corner to corner");
  assert.equal(F.collide(A, F.box("S", [1, 0.5], 1, 1)).hit, false, "collinear edges, slid");
  const tri = F.poly("tri", [[0.5, -0.5], [1.5, -0.5], [1.5, -0.5], [0.5, 0.5]]);  // repeated vertex: a zero-length edge
  assert.equal(F.collide(A, tri).hit, false, "triangle sharing A's right edge");
  assert.ok(F.collide(A, F.poly("t2", [[0.4, -0.5], [1.5, -0.5], [0.4, 0.5]])).hit);
  assert.ok(F.collide(A, F.box("R", [0, 0], 0.2, 3, 45)).hit, "rotated");
});

test("circle x polygon (closest point), circle x circle: depth, touching = no hit", () => {
  const A = F.box("A", [0, 0], 2, 2);
  const c = F.collide(F.circle("c", [1.3, 0], 0.5), A);
  assert.ok(c.hit); close(c.depth, 0.2, 1e-12);
  assert.equal(F.collide(F.circle("t", [1.5, 0], 0.5), A).hit, false, "tangent to a face");
  assert.equal(F.collide(F.circle("k", [1 + Math.SQRT1_2, 1 + Math.SQRT1_2], 1), A).hit, false, "tangent at a corner");
  assert.ok(F.collide(F.circle("in", [0.1, 0], 0.2), A).hit, "inside");
  const cc = F.collide(F.circle("p", [0, 0], 1), F.circle("q", [1.5, 0], 1));
  assert.ok(cc.hit); close(cc.depth, 0.5, 1e-12);
  assert.equal(F.collide(F.circle("p", [0, 0], 1), F.circle("q", [2, 0], 1)).hit, false);
});

test("Liang-Barsky seg x box = scene.js segHitsBox: crossing, corner graze = no hit, outside parallel = no hit, inside = hit", () => {
  const box = [0, 0, 10, 10];
  assert.equal(F.segHitsBox([-5, 5], [15, 5], box), true);
  assert.equal(F.segHitsBox([-5, 5], [5, -5], box), false, "touches the corner only");
  assert.equal(F.segHitsBox([-5, -1], [15, -1], box), false);
  assert.equal(F.segHitsBox([2, 2], [3, 3], box), true);
  assert.equal(F.segHitsBox([12, 0], [12, 10], box), false);
});

test("point-segment distance, penetration depth along a normal, contact gap", () => {
  const d = F.ptSeg([1, 1], [0, 0], [2, 0]);
  close(d.d, 1, 1e-12); close(d.t, 0.5, 1e-12);
  close(F.ptSeg([-3, 4], [0, 0], [2, 0]).d, 5, 1e-12);
  close(F.ptSeg([1, 1], [0, 0], [0, 0]).d, Math.SQRT2, 1e-12, "zero-length segment");
  close(F.depthAlong(F.box("A", [0, 0], 1, 1), F.box("B", [0, 0.8], 1, 1), [0, 1]), 0.2, 1e-12);
  const s = F.incline(RAMP).surface;
  close(F.contactGap(F.box("b", onRamp(0.25), 0.8, 0.5, 30), s), 0, 1e-12, "resting");
  close(F.contactGap(F.box("b", onRamp(0.01), 0.8, 0.5, 30), s), -0.24, 1e-12, "sunk 0.24");
  close(F.contactGap(F.circle("c", onRamp(0.4), 0.3), s), 0.1, 1e-12, "disk floats 0.1");
});

// ─── checks: one planted-bad + its good each ───
test("I-INC-1 contact: a box 0.24 into a 30° ramp is sunk by 0.24 (snap along the normal), a resting box is fine, a floater floats", () => {
  const inc = F.incline(RAMP), h = 0.5;
  const bad = F.checkContact([{ id: "blk", shape: F.box("blk", onRamp(h / 2 - 0.24), 0.8, h, 30), size: h }], [inc.surface]);
  assert.deepEqual(ids(bad), ["I-INC-1"]);
  assert.deepEqual(bad[0].ids, ["blk", "ramp"]);
  close(bad[0].amount, 0.24, 1e-9); assert.equal(bad[0].kind, "sunk"); assert.equal(bad[0].unit, "u");
  close(bad[0].fix.snap[0], out30[0] * 0.24, 1e-9); close(bad[0].fix.snap[1], out30[1] * 0.24, 1e-9);
  assert.deepEqual(F.checkContact([{ id: "blk", shape: F.box("blk", onRamp(h / 2), 0.8, h, 30), size: h }], [inc.surface]), []);
  assert.deepEqual(F.checkContact([{ id: "blk", shape: F.box("blk", onRamp(h / 2 + 0.009), 0.8, h, 30), size: h }], [inc.surface]), [], "inside 0.02 h");
  const fl = F.checkContact([{ id: "blk", shape: F.box("blk", onRamp(h / 2 + 0.081), 0.8, h, 30), size: h }], [inc.surface]);
  assert.equal(fl[0].kind, "float"); close(fl[0].amount, 0.081, 1e-9);
  // livefig.py's EXAMPLE (audit §0): box at [0,1.2] sinks 0.243 vertically = 0.243 cos30 along the normal
  const ex = F.checkContact([{ id: "ex", shape: F.box("ex", [0, 1.2], 0.8, 0.5, 30), size: 0.5 }], [inc.surface]);
  close(ex[0].amount, (1.2 - (2 * Math.tan(30 * deg) + 0.25 / Math.cos(30 * deg))) * -Math.cos(30 * deg), 1e-9);
  // far from every surface (> 0.6 h): not resting, nothing to say; a disk on the ground: r offset
  assert.deepEqual(F.checkContact([{ id: "fly", shape: F.box("fly", onRamp(2), 0.8, h, 30), size: h }], [inc.surface]), []);
  const ground = F.surface("g", [-5, 0], [5, 0]);
  assert.deepEqual(F.checkContact([{ id: "d", shape: F.circle("d", [0, 0.3], 0.3), size: 0.6 }], [ground]), []);
  close(F.checkContact([{ id: "d", shape: F.circle("d", [0, 0.2], 0.3), size: 0.6 }], [ground])[0].amount, 0.1, 1e-12);
  // the nearest engaged surface wins (a box on the ground next to the ramp's foot is judged against the ground)
  assert.deepEqual(F.checkContact([{ id: "gb", shape: F.box("gb", [-3, 0.25], 0.8, 0.5), size: 0.5 }], [inc.surface, ground]), []);
});

test("I-INC-2 tilt: a box at 0° resting on a 30° ramp is 30° off (turn +30° about its centre); flat at 30°, 120° or within 1° is fine", () => {
  const inc = F.incline(RAMP), h = 0.5;
  /** a w x h box at angle a whose lowest corner / edge just touches the hyp above x = 0 (gap 0: I-INC-1 is happy) */
  const rest = a => { const b0 = F.box("blk", [0, 2], 0.8, h, a), g = F.contactGap(b0, inc.surface); return F.box("blk", [-out30[0] * g, 2 - out30[1] * g], 0.8, h, a); };
  const body = a => [{ id: "blk", shape: rest(a), size: h }];
  assert.deepEqual(F.checkContact(body(0), [inc.surface]), [], "the planted box touches: only its angle is wrong");
  const bad = F.checkTilt(body(0), [inc.surface]);
  assert.deepEqual(ids(bad), ["I-INC-2"]); assert.deepEqual(bad[0].ids, ["blk", "ramp"]);
  close(bad[0].amount, 30, 1e-9); assert.equal(bad[0].unit, "deg"); close(bad[0].fix.rotate, 30, 1e-9);
  close(bad[0].fix.about[0], F.centroid(rest(0))[0], 1e-12);
  close(F.checkTilt(body(28), [inc.surface])[0].fix.rotate, 2, 1e-9);
  close(F.checkTilt(body(45), [inc.surface])[0].fix.rotate, -15, 1e-9, "the nearest flat face: turn back 15°, not on 75°");
  for (const a of [30, 29.2, 30.9, 120, -60, 210]) assert.deepEqual(F.checkTilt(body(a), [inc.surface]), [], `flat at ${a}°`);
  assert.deepEqual(F.checkTilt([{ id: "d", shape: F.circle("d", onRamp(0.3), 0.3), size: 0.6 }], [inc.surface]), [], "a disk has no angle");
  assert.deepEqual(F.checkTilt([{ id: "fly", shape: F.box("fly", onRamp(2), 0.8, h, 0), size: h }], [inc.surface]), [], "not resting: no tilt to judge");
  // screen space (y down): the same box, the same turn (angles stay counter-clockwise with y up)
  const s = 100, X = p => [200 + p[0] * s, 200 - p[1] * s], ramp = F.surface("ramp", X([-2, 0]), X([2, 4 * Math.tan(30 * deg)]));
  const scr = F.checkTilt([{ id: "b", shape: F.poly("b", rest(0).pts.map(X)), size: 50 }], [ramp], { space: "screen" });
  close(scr[0].amount, 30, 1e-9); close(scr[0].fix.rotate, 30, 1e-9);
  // checkAll runs it
  assert.deepEqual(ids(F.checkAll({ bodies: body(0), surfaces: [inc.surface] })), ["I-INC-2"]);
});

test("I-INC-1 in screen space (y down): the same sink in px, the snap vector in screen coordinates", () => {
  const s = 100, X = p => [200 + p[0] * s, 200 - p[1] * s];
  const ramp = F.surface("ramp", X([-2, 0]), X([2, 4 * Math.tan(30 * deg)]));
  const c = onRamp(0.25 - 0.24), pts = F.box("b", c, 0.8, 0.5, 30).pts.map(X);
  const f = F.checkContact([{ id: "b", shape: F.poly("b", pts), size: 50 }], [ramp], { space: "screen" });
  assert.equal(f[0].unit, "px"); close(f[0].amount, 24, 1e-6); assert.equal(f[0].kind, "sunk");
  assert.ok(f[0].fix.snap[1] < 0, "snap moves up the screen");
});

test("I-BODY-1 interpenetration: two overlapping boxes found with depth and a snap; touching neighbours and allowed pairs are fine", () => {
  const A = F.box("A", [0, 0], 1, 1), B = F.box("B", [0.7, 0], 1, 1);
  const f = F.checkOverlap([A, B]);
  assert.deepEqual(ids(f), ["I-BODY-1"]); assert.deepEqual(f[0].ids, ["A", "B"]); close(f[0].amount, 0.3, 1e-12);
  close(Math.hypot(...f[0].fix.snap), 0.3, 1e-12); assert.equal(f[0].fix.move, "B");
  assert.ok(f[0].fix.snap[0] > 0, "B is pushed away from A");
  assert.deepEqual(F.checkOverlap([A, F.box("B", [1, 0], 1, 1)]), []);
  assert.deepEqual(F.checkOverlap([A, B], { allow: [["B", "A"]] }), []);
  assert.deepEqual(F.checkOverlap([F.box("a", [0, 0], 100, 100), F.box("b", [99.5, 0], 100, 100)], { space: "screen" }), [], "0.5 px inside the 1 px stroke tol");
  assert.equal(F.checkOverlap([F.circle("ball", [0, 0.4], 0.5), F.surface("g", [-2, 0], [2, 0])]).length, 1, "ball through a width-0 surface");
});

test("I-FORCE-1 anchor: a force tail 0.5 off its box is found with a re-anchor point; centre / face / rim tails are fine", () => {
  const blk = { id: "blk", shape: F.box("blk", [0, 0], 1, 1), size: 1 };
  const f = F.checkAnchor([{ id: "F", at: [1, 0], body: "blk" }], [blk]);
  assert.deepEqual(ids(f), ["I-FORCE-1"]); assert.deepEqual(f[0].ids, ["F", "blk"]); close(f[0].amount, 0.5, 1e-12);
  assert.deepEqual(f[0].fix.reanchor, [0.5, 0]);
  for (const at of [[0, 0], [0.5, 0.1], [0, -0.5], [0.2, 0]]) assert.deepEqual(F.checkAnchor([{ id: "F", at, body: "blk" }], [blk]), [], String(at));
  const ball = { id: "ball", shape: F.circle("ball", [0, 0], 1), size: 2 };
  assert.deepEqual(F.checkAnchor([{ id: "T", at: [0, 1], body: "ball" }], [ball]), [], "on the rim");
  close(F.checkAnchor([{ id: "T", at: [0, 2], body: "ball" }], [ball])[0].amount, 1, 1e-12);
  assert.deepEqual(F.checkAnchor([{ id: "T", at: [9, 9], body: "nobody" }], [ball]), [], "no such body: nothing to anchor to");
});

test("I-FORCE-2/3 directions by role: weight at 260° is 10° off, normal 100° on a 30° ramp 20° off, friction either way along, tension along the rope", () => {
  const ramp = F.incline(RAMP).surface;
  const w = F.checkDirection([{ id: "W", role: "weight", at: [0, 0], angle: 260 }]);
  assert.deepEqual(ids(w), ["I-FORCE-2"]); close(w[0].amount, 10, 1e-9); assert.equal(w[0].unit, "deg"); close(w[0].fix.angle, 270, 1e-9); close(w[0].fix.rotate, 10, 1e-9);
  assert.deepEqual(F.checkDirection([{ id: "W", role: "weight", at: [0, 0], angle: -90.3 }]), [], "inside 0.5°");
  const n = F.checkDirection([{ id: "N", role: "normal", at: [0, 0], angle: 100 }], { surface: ramp });
  assert.deepEqual(ids(n), ["I-FORCE-3"]); close(n[0].amount, 20, 1e-9); close(n[0].fix.angle, 120, 1e-9);
  assert.deepEqual(F.checkDirection([{ id: "N", role: "normal", at: [0, 0], tip: [-0.5, Math.sqrt(3) / 2] }], { surface: ramp }), [], "tip form");
  assert.deepEqual(F.checkDirection([{ id: "f", role: "friction", at: [0, 0], angle: 30 }, { id: "g", role: "friction", at: [0, 0], angle: 210 }], { surface: ramp }), []);
  close(F.checkDirection([{ id: "f", role: "friction", at: [0, 0], angle: 200 }], { surface: ramp })[0].fix.angle, 210, 1e-9);
  const t = F.checkDirection([{ id: "T", role: "tension", at: [0, 0], angle: 80, rope: [0, 3] }]);
  close(t[0].amount, 10, 1e-9); assert.deepEqual(F.checkDirection([{ id: "T", role: "tension", at: [0, 0], angle: 90, rope: [0, 3] }]), []);
  assert.deepEqual(F.checkDirection([{ id: "P", role: "applied", at: [0, 0], angle: 17 }, { id: "N", role: "normal", at: [0, 0], angle: 3 }]), [], "unknown role / no surface: no claim");
  // screen space: a weight drawn straight down the screen is fine, one tilted 10° is not
  assert.deepEqual(F.checkDirection([{ id: "W", role: "weight", at: [10, 10], tip: [10, 60] }], { space: "screen" }), []);
  close(F.checkDirection([{ id: "W", role: "weight", at: [0, 0], tip: [50 * Math.cos(260 * deg), -50 * Math.sin(260 * deg)] }], { space: "screen" })[0].amount, 10, 1e-9);
  assert.deepEqual(["$mg$", "W", "$F_g$", "$F_N$", "N", "$f_k$", "f", "T", "$\\vec v$", "F"].map(F.roleOf),
    ["weight", "weight", "weight", "normal", "normal", "friction", "friction", "tension", null, null]);
});

test("I-LBL-1/2 labels: two labels at one tip overlap; packed by place() they do not; a label over the edge is out of the box", () => {
  const R = { x: 0, y: 0, w: 360, h: 240 };
  const bad = F.checkLabels([{ id: "a", box: [100, 100, 30, 19] }, { id: "b", box: [110, 105, 30, 19] }], R);
  assert.deepEqual(ids(bad), ["I-LBL-1"]); assert.deepEqual(bad[0].ids, ["a", "b"]);
  close(bad[0].amount, 14, 1e-12); assert.equal(bad[0].unit, "px"); assert.deepEqual(bad[0].fix, { move: "b", by: [0, 14] });
  const reqs = ["F_1", "F_2"].map(id => ({ key: id, id, w: 24, t: { pt: [180, 120] } }));
  const placed = F.place(reqs, [], [], R);
  assert.deepEqual(F.checkLabels(placed.map(p => ({ id: p.id, box: p.box })), R), []);
  const out = F.checkLabels([{ id: "e", box: [350, 10, 30, 19] }], R);
  assert.deepEqual(ids(out), ["I-LBL-2"]); close(out[0].amount, 20, 1e-12); assert.deepEqual(out[0].fix, { move: "e", by: [-20, 0] });
  assert.deepEqual(F.checkLabels([{ id: "a", box: [0, 0, 30, 19] }, { id: "b", box: [30, 0, 30, 19] }], R), [], "touching boxes");
});

test("I-STEP-2/3 frame pairs: a 7 px camera drift, a 7 px untouched-object drift, a flipped label spot; touched objects and camera ops are fine", () => {
  const R = { x: 0, y: 0, w: 360, h: 240 };
  const scr = (cam, p) => [R.x + R.w / 2 + (p[0] - cam.cx) * cam.s, R.y + R.h / 2 - (p[1] - cam.cy) * cam.s];
  const world = { rod: [[-2, 0], [2, 0], [2, 0.2], [-2, 0.2]], pv: [[2, 0.1]], W: [[0, 0], [0, -1]] };
  const frameOf = (cam, w = world, labels = []) => ({ cam, R, objs: Object.fromEntries(Object.entries(w).map(([k, v]) => [k, v.map(p => scr(cam, p))])), labels });
  const c0 = { cx: 0, cy: 0, s: 60 }, c7 = { cx: 7 / 60, cy: 0, s: 60 };
  const cam = F.checkSteps(frameOf(c0), frameOf(c7), { touched: ["W"] });
  assert.deepEqual(ids(cam), ["I-STEP-2"]); assert.deepEqual(cam[0].ids, ["camera"]); close(cam[0].amount, 7, 1e-9); assert.deepEqual(cam[0].fix.lock, c0);
  assert.deepEqual(F.checkSteps(frameOf(c0), frameOf(c7), { cameraOp: true }), [], "the step moves the camera on purpose");
  assert.deepEqual(F.checkSteps(frameOf(c0), frameOf(c0)), []);
  const moved = { ...world, pv: [[2 + 7 / 60, 0.1]] };
  const obj = F.checkSteps(frameOf(c0), frameOf(c0, moved));
  assert.deepEqual(ids(obj), ["I-STEP-2"]); assert.deepEqual(obj[0].ids, ["pv"]); close(obj[0].amount, 7, 1e-9);
  assert.deepEqual(F.checkSteps(frameOf(c0), frameOf(c0, moved), { touched: ["pv"] }), []);
  // no camera given: screen points compared as they are
  const bare = f => ({ objs: f.objs, labels: f.labels });
  assert.deepEqual(ids(F.checkSteps(bare(frameOf(c0)), bare(frameOf(c7)))), ["I-STEP-2", "I-STEP-2", "I-STEP-2"]);
  // a grown scene (bbox +8%) may refit the camera
  const big = { ...world, ext: [[0, 3]] };
  assert.deepEqual(F.checkSteps(frameOf(c0), frameOf({ cx: 0, cy: 1, s: 40 }, big), { touched: ["ext"] }), []);
  // I-STEP-3: the pivot label flips sides between steps
  const L = (dir, box) => [{ key: "pv", id: "pv", dir, ring: 6, box }];
  const flip = F.checkSteps(frameOf(c0, world, L("ne", [250, 90, 40, 19])), frameOf(c0, world, L("nw", [190, 90, 40, 19])));
  assert.deepEqual(ids(flip), ["I-STEP-3"]); close(flip[0].amount, 60, 1e-9); assert.deepEqual(flip[0].fix, { carry: { key: "pv", dir: "ne", ring: 6 } });
  assert.deepEqual(F.checkSteps(frameOf(c0, world, L("ne", [250, 90, 40, 19])), frameOf(c0, world, L("ne", [250, 90, 40, 19]))), []);
  assert.deepEqual(F.checkSteps(frameOf(c0, world, L("ne", [250, 90, 40, 19])), frameOf(c0, world, L("nw", [190, 90, 40, 19])), { touched: ["pv"] }), []);
});

test("I-BAL-1 fill share: the rod at 1440 (drawing x 205-540) is too small and off-centre; a centred 60% figure is fine; 70% on a phone", () => {
  const f = F.checkBalance({ x: 205, y: 0, w: 335, h: 200 }, { x: 0, y: 0, w: 1440, h: 400 });
  assert.deepEqual(ids(f), ["I-BAL-1", "I-BAL-1"]);
  assert.equal(f[0].kind, "share"); close(f[0].amount, 0.55 - 335 / 1440, 1e-12); close(f[0].fix.scale, 0.55 * 1440 / 335, 1e-12);
  assert.equal(f[1].kind, "centre"); close(f[1].amount, 720 - 372.5, 1e-12); assert.deepEqual(f[1].fix.shift, [347.5, 0]);
  assert.deepEqual(F.checkBalance({ x: 288, y: 0, w: 864, h: 100 }, { x: 0, y: 0, w: 1440, h: 400 }), []);
  assert.equal(F.checkBalance({ x: 39, y: 0, w: 234, h: 100 }, { x: 0, y: 0, w: 390, h: 400 })[0].kind, "share", "60% < 70% at 390");
});

test("checkAll: one model, every check; findings are plain data the caller can log", () => {
  const inc = F.incline(RAMP);
  const model = {
    bodies: [{ id: "blk", shape: F.box("blk", onRamp(0.01), 0.8, 0.5, 30), size: 0.5 }],
    solids: [inc.shape], surfaces: [inc.surface],
    forces: [{ id: "W", role: "weight", at: onRamp(0.01), angle: 260, body: "blk" }, { id: "N", role: "normal", at: [3, 3], angle: 120, body: "blk", surface: "ramp" }],
  };
  const got = F.checkAll(model);
  assert.deepEqual(ids(got).sort(), ["I-BODY-1", "I-FORCE-1", "I-FORCE-2", "I-INC-1"]);
  assert.deepEqual(JSON.parse(JSON.stringify(got)), got);
});

test("never mutates the caller's model (deep-frozen inputs through every check and the packer)", () => {
  const inc = F.incline(RAMP);
  const model = deepFreeze({
    bodies: [{ id: "blk", shape: F.box("blk", onRamp(0.01), 0.8, 0.5, 30), size: 0.5 }], solids: [inc.shape], surfaces: [inc.surface],
    forces: [{ id: "W", role: "weight", at: [0, 1], angle: 260, body: "blk" }],
    labels: [{ id: "a", box: [100, 100, 30, 19] }, { id: "b", box: [110, 105, 30, 19] }], R: { x: 0, y: 0, w: 360, h: 240 },
  });
  assert.ok(F.checkAll(model).length >= 4);
  const reqs = deepFreeze([{ key: "a", id: "a", w: 20, t: { pt: [10, 10] } }, { key: "b", id: "b", w: 20, t: { box: [50, 50, 20, 20] }, dirs: ["e", "w"] }]);
  F.place(reqs, deepFreeze([{ id: "s", pts: [[0, 0], [300, 200]] }]), deepFreeze([{ id: "x", box: [40, 40, 5, 5] }]), deepFreeze({ x: 0, y: 0, w: 360, h: 240 }), new Map([["b", { dir: "w", ring: 6 }]]));
});

// ─── the label packer: scene.js place(), same numbers ───
test("place(): golden = every place() call scene.js frame() made for the 5 vizbench cases (all steps, wrong/post, tween frames)", () => {
  const G = JSON.parse(readFileSync(new URL("./fixtures/figcheck-place.json", import.meta.url), "utf8"));
  assert.ok(G.calls.length >= 70);
  const names = new Set(G.calls.map(c => c.case));
  assert.deepEqual([...names].sort(), ["cg", "junction", "loop", "rod", "roll"]);
  assert.ok(G.calls.some(c => c.out.some(o => o.lead)) && G.calls.some(c => c.tween) && G.calls.some(c => c.out.some(o => o.knock)), "rings 2/3, leaders, fixed choices and knocks are covered");
  let n = 0;
  for (const c of G.calls) {
    const { reqs, segs, bodies, R, fixed } = c.in;
    const got = F.place(reqs, segs, bodies, R, fixed ? new Map(fixed) : undefined);
    assert.deepEqual(got.map(p => ({ key: p.key, box: p.box, dir: p.dir, ring: p.ring, knock: p.knock, lead: p.lead })), c.out, `${c.case} ${c.stage} step ${c.step + 1}${c.tween ? " (tween)" : ""}`);
    n += got.length;
  }
  assert.ok(n >= 300, `${n} labels`);
});

test("place(): the free-spot grid (ring 99) when all three rings collide, a fixed spot, a leader line beyond 8 px", () => {
  const R = { x: 0, y: 0, w: 360, h: 240 };
  // nine labels on one point: the first ring holds 8, the ninth goes out a ring with a leader line
  const reqs = Array.from({ length: 9 }, (_, i) => ({ key: "k" + i, id: "k" + i, w: 20, t: { pt: [180, 120] } }));
  const got = F.place(reqs, [], [], R);
  for (let i = 0; i < got.length; i++) for (let j = i + 1; j < got.length; j++) assert.equal(F.overlap(got[i].box, got[j].box), 0, `${i} ${j}`);
  assert.ok(got.some(p => p.ring > 6 && p.lead), "an outer ring with a leader");
  const spot = F.place([{ key: "s", id: "s", w: 10, t: { pt: [0, 0] }, spot: [5, 6] }], [], [], R);
  assert.deepEqual(spot[0].box, [5, 6, 16, 19]); assert.equal(spot[0].dir, null);
  // a measured height (graph.js: a KaTeX span) replaces LH for that label only
  const tall = F.place([{ key: "t", id: "t", w: 10, h: 30, t: { pt: [100, 100] } }, { key: "u", id: "u", w: 10, t: { pt: [200, 100] } }], [], [], R);
  assert.deepEqual(tall.map(p => p.box[3]), [30, 19]); assert.deepEqual(tall[0].box, [92, 64, 16, 30], "n of the point (centred: 100 - 16 / 2), 6 px up");
  // every candidate of all three rings already taken (spot labels on exactly those boxes): the grid finds a free box
  const T = { pt: [200, 150] }, taken = ["n", "e", "s", "w", "ne", "nw", "se", "sw"].flatMap(d => [6, 24, 46].map(r => ({ key: d + r, id: d + r, w: 40, t: T, spot: F.candBox(T, d, 46, 19, r).slice(0, 2) })));
  const free = F.place([...taken, { key: "z", id: "z", w: 40, t: T }], [], [], { x: 0, y: 0, w: 400, h: 300 });
  const z = free.at(-1);
  assert.equal(z.ring, 99); assert.equal(z.dir, null);
  for (const p of free.slice(0, -1)) assert.equal(F.overlap(p.box, z.box), 0, p.key);
});

// ─── budget ───
test("budget: 12 marks + 6 labels, every check + the packer, ≤ 2 ms in Node (CI bound 10 ms on the median)", () => {
  const inc = F.incline(RAMP), ground = F.surface("g", [-8, 0], [8, 0]);
  const bodies = Array.from({ length: 6 }, (_, i) => ({ id: "b" + i, shape: i % 2 ? F.circle("b" + i, [i * 1.3 - 4, 0.3 + (i % 3) * 0.01], 0.3) : F.box("b" + i, [i * 1.3 - 4, 0.25], 0.8, 0.5), size: 0.5 }));
  const forces = bodies.flatMap((b, i) => [{ id: "W" + i, role: "weight", at: b.shape.c || F.centroid(b.shape), angle: 268 + i, body: b.id }]);
  const labels = Array.from({ length: 6 }, (_, i) => ({ key: "L" + i, id: "W" + i, w: 24 + i, t: { pt: [40 + i * 50, 120] } }));
  const R = { x: 0, y: 0, w: 360, h: 240 };
  const segs = bodies.map((b, i) => ({ id: "W" + i, pts: [[40 + i * 50, 100], [40 + i * 50, 160]] }));
  const model = { bodies, solids: [inc.shape], surfaces: [inc.surface, ground], forces };   // 12 marks: 6 bodies + 6 forces (+ ramp, ground)
  const run = () => { const placed = F.place(labels, segs, [], R); return F.checkAll({ ...model, labels: placed.map(p => ({ id: p.id, box: p.box })), R }); };
  for (let i = 0; i < 50; i++) run();
  const ts = [];
  for (let i = 0; i < 200; i++) { const t0 = performance.now(); run(); ts.push(performance.now() - t0); }
  ts.sort((a, b) => a - b);
  const med = ts[100], p95 = ts[190];
  console.log(`figcheck bench: 12 marks + 6 labels: median ${med.toFixed(3)} ms, p95 ${p95.toFixed(3)} ms`);
  assert.ok(med < 10, `median ${med} ms`);
});

// ─── angles (W340 §2, I-ANG-1a-d): Geometry's right / angle marks against the points they name ───
const TRI = { A: [0, 0], B: [4, 0], C: [4, 3] };                      // mc-a's slope: the right angle is at B, θ belongs at A
const CROWD = { A: [0, 0], B: [4, 0], C: [0, 3] };                    // geomarks' crowded triangle: the right angle is at A
const mk = (k, n, text = "") => ({ k, names: n.split(""), text });
test("angles: angleAt / angleNumber read the drawing and the label", () => {
  close(F.angleAt(TRI.B, TRI.A, TRI.C), 90, 1e-9); close(F.angleAt(TRI.A, TRI.B, TRI.C), 36.87, 0.01);
  assert.equal(F.angleNumber("90°"), 90); assert.equal(F.angleNumber("30 °"), 30); assert.equal(F.angleNumber("36.9°"), 36.9);
  assert.equal(F.angleNumber("θ"), null); assert.equal(F.angleNumber("d + x"), null); assert.equal(F.angleNumber("30"), null, "a bare number is not an angle");
});
test("I-ANG-1a-d vertex: a right box goes where the drawing is square; a symbolic angle never shares it (mc-a: θ at A, not B)", () => {
  const r = F.resolveAngles(TRI, [mk("right", "BAC"), mk("angle", "BAC", "θ")]);
  assert.deepEqual(r.findings, []);
  assert.deepEqual(r.marks.map(m => m.vertex), ["B", "A"], "right(B,A,C) at B (first = vertex); angle(B,A,C,θ) at A (the middle: B is square)");
  assert.deepEqual(r.marks[1].rays, ["B", "C"]);
});
test("I-ANG-1c/1d: a numeric label goes to the vertex whose drawn angle it is (0.5°); none fits = a finding", () => {
  let r = F.resolveAngles(CROWD, [mk("right", "ABC"), mk("angle", "BAC", "90°"), mk("angle", "ABC", "θ")]);
  assert.deepEqual(r.findings, [], "the crowded triangle as #343 wrote it: 90° moves to A, θ to B");
  assert.deepEqual(r.marks.map(m => m.vertex), ["A", "A", "B"]);
  r = F.resolveAngles(CROWD, [mk("right", "ABC"), mk("angle", "CBA", "90°")]);    // planted bad: 90° at B (or C), the square corner is A
  assert.deepEqual(ids(r.findings), ["I-ANG-1c"]);
  r = F.resolveAngles(CROWD, [mk("angle", "ABC", "40°")]);                          // 36.87° at B, 90° at A: 40° is neither
  assert.deepEqual(ids(r.findings), ["I-ANG-1d"]); close(r.findings[0].amount, 3.13, 0.01);
  r = F.resolveAngles(CROWD, [mk("angle", "BAC", "36.9°")]);                        // first = B: 36.87°, the label fits as written
  assert.deepEqual(r.findings, []); assert.equal(r.marks[0].vertex, "B");
  r = F.resolveAngles(TRI, [mk("right", "CAB")]);                                   // a right box where nothing is square (C, A)
  assert.deepEqual(ids(r.findings), ["I-ANG-1c"]);
});
test("I-ANG-1b: a vertex with a right-angle box never carries a non-90° angle", () => {
  const RECT = { A: [0, 0], B: [4, 0], C: [4, 3], D: [0, 3] };
  const r = F.resolveAngles(RECT, [mk("right", "ABD"), mk("right", "BAC"), mk("angle", "ABC", "θ")]);
  assert.deepEqual(ids(r.findings), ["I-ANG-1b"]);
  assert.deepEqual(ids(F.resolveAngles(RECT, [mk("right", "ABD"), mk("angle", "ABD", "90°")]).findings), [], "90° on its own box is fine");
});
test("I-ANG-1a: an angle label sits at its own arc's vertex (its centre is nearer that vertex than any other point)", () => {
  const P = { A: [0, 0], B: [100, 0] };
  assert.deepEqual(F.checkAngleLabels([{ id: "m1", vertex: "A", box: [10, -20, 16, 18] }], P), []);
  const f = F.checkAngleLabels([{ id: "m1", vertex: "A", box: [80, -20, 16, 18] }], P);
  assert.deepEqual(ids(f), ["I-ANG-1a"]); assert.deepEqual(f[0].ids, ["m1", "B"]);
});
test("place(): opts.clear keeps a label that clear from every stroke when there is room; 0 = the golden behaviour", () => {
  const segs = [{ id: "s", pts: [[0, 50], [200, 50]] }], R = { x: 0, y: 0, w: 200, h: 120 };
  const q = () => [{ key: 0, id: "t", w: 20, t: { pt: [100, 50] }, dirs: ["n"] }];
  const gap = b => Math.min(Math.abs(b[1] + b[3] - 50), Math.abs(b[1] - 50));
  assert.ok(gap(F.place(q(), segs, [], R, null, { LH: 18 })[0].box) < 10);
  assert.ok(gap(F.place(q(), segs, [], R, null, { LH: 18, clear: 10 })[0].box) >= 10);
});
