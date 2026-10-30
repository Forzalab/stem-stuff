// figcheck.js: the one figure-invariant core (todo 124; plan: brain fable-audit AUDIT-2026-10-29 §2 runtime layer, §3 I-* table).
// Every renderer (graph.js, scene.js), the Playwright checker and the gate call it with their OWN model: plain ESM, no DOM, no deps,
// loads in Node and the browser (also on globalThis.FigCheck for classic scripts that load after it).
//   shapes      poly box circle wseg surface incline       convex polygons, circles, width-segments; label rects are [x, y, w, h]
//   primitives  collide (SAT poly x poly, circle x poly by closest point, circle x circle)  segHitsBox (Liang-Barsky = scene.js)
//               ptSeg  depthAlong (penetration along a normal)  contactGap (signed gap of a body to a surface along its outward normal)
//   checks      checkContact I-INC-1  checkTilt I-INC-2  checkOverlap I-BODY-1  checkAnchor I-FORCE-1  checkDirection I-FORCE-2/3  checkLabels I-LBL-1/2
//               checkSteps I-STEP-2/3  checkBalance I-BAL-1  checkAll (one model, every check)
//   packer      place(): scene.js place() ported as is (8 dirs x 3 rings, overlap score, free grid, leader lines), same numbers
// A finding is plain data: { id: "I-…", ids: [the objects], amount, unit, kind?, fix? }. `fix` is a suggestion only (snap vector,
// re-anchor point, rotation, move, carry, lock, scale/shift): figcheck never mutates the caller's model.
// Space: "world" (y up, the default) or "screen" (y down, px). It decides the unit ("u" / "px"), which way is up for a surface with no
// `out`, and how a direction is read (angles are always counter-clockwise from +x with y up, as graph.js's force.angle).

const EPS = 1e-9, DEG = Math.PI / 180;
const sub = (p, q) => [p[0] - q[0], p[1] - q[1]], add = (p, q) => [p[0] + q[0], p[1] + q[1]], mul = (p, k) => [p[0] * k, p[1] * k];
const dot = (p, q) => p[0] * q[0] + p[1] * q[1], cross = (p, q) => p[0] * q[1] - p[1] * q[0];
const len = p => Math.hypot(p[0], p[1]);
const unit = p => { const l = len(p); return l > EPS ? [p[0] / l, p[1] / l] : [0, 0]; };
const rot = (p, a) => [p[0] * Math.cos(a) - p[1] * Math.sin(a), p[0] * Math.sin(a) + p[1] * Math.cos(a)];   // = graph.js rot
const unitOf = space => (space === "screen" ? "px" : "u");
const norm360 = a => ((a % 360) + 360) % 360;
const angDiff = (to, from) => { const d = norm360(to - from); return d > 180 ? d - 360 : d; };   // signed, (-180, 180]
const angleOf = (v, space) => norm360(Math.atan2(space === "screen" ? -v[1] : v[1], v[0]) / DEG);
/** findings leave as plain JSON-safe data (no -0) */
const clean = v => Array.isArray(v) ? v.map(clean) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clean(x)])) : v === 0 ? 0 : v;

// ─── shapes ───
export const poly = (id, pts) => ({ id, kind: "poly", pts });
export const circle = (id, c, r) => ({ id, kind: "circle", c, r });
/** graph.js body pts: at + rot([±w/2, ±h/2], angle°) */
export function box(id, at, w, h, angle = 0) {
  return poly(id, [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(p => add(at, rot(p, angle * DEG))));
}
/** a segment drawn w wide (a rope, a rod, a wall): its rectangle; w = 0 is the bare segment */
export function wseg(id, a, b, w = 0) {
  const n = mul(unit([-(b[1] - a[1]), b[0] - a[0]]), w / 2);
  return { id, kind: "wseg", a, b, w, pts: w > 0 ? [add(a, n), add(b, n), sub(b, n), sub(a, n)] : [a, b] };
}
/** a surface bodies rest on: a bare segment, `out` = the unit normal on the free side (default: up in its space) */
export const surface = (id, a, b, out) => ({ ...wseg(id, a, b, 0), ...(out ? { out } : {}) });
/** graph.js incline {at, base, angle, flip}: the triangle (inclinePts) and its hypotenuse as a surface facing away from the base corner */
export function incline(m) {
  const sx = m.flip ? -1 : 1, B = add(m.at, [sx * m.base, 0]), C = add(B, [0, m.base * Math.tan(m.angle * DEG)]);
  const pts = [m.at, B, C], d = unit(sub(C, m.at));
  let out = [-d[1], d[0]];
  if (dot(sub(B, m.at), out) > 0) out = mul(out, -1);
  return { id: m.id, pts, shape: poly(m.id, pts), surface: surface(m.id, m.at, C, out) };
}
const ptsOf = s => s.kind === "circle" ? [s.c] : s.pts;
export const centroid = s => s.kind === "circle" ? s.c : mul(ptsOf(s).reduce(add, [0, 0]), 1 / ptsOf(s).length);

// ─── primitives ───
/** closest point of segment ab to p: { d, t (0..1 along ab), q } */
export function ptSeg(p, a, b) {
  const ab = sub(b, a), L2 = dot(ab, ab), t = L2 > 0 ? Math.max(0, Math.min(1, dot(sub(p, a), ab) / L2)) : 0, q = add(a, mul(ab, t));
  return { d: len(sub(p, q)), t, q };
}
const project = (pts, n) => { let lo = Infinity, hi = -Infinity; for (const p of pts) { const v = dot(p, n); if (v < lo) lo = v; if (v > hi) hi = v; } return [lo, hi]; };
const projectShape = (s, n) => s.kind === "circle" ? [dot(s.c, n) - s.r, dot(s.c, n) + s.r] : project(s.pts, n);
/** penetration depth of two convex shapes along the unit normal n (overlap of their projections; ≤ 0 = apart or touching) */
export function depthAlong(A, B, n) {
  const a = projectShape(A, n), b = projectShape(B, n);
  return Math.min(a[1], b[1]) - Math.max(a[0], b[0]);
}
function edges(pts) {
  const out = [];
  for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; if (len(sub(b, a)) > EPS) out.push([a, b]); }
  return out;
}
function inConvex(p, pts) {
  if (pts.length < 3) return false;
  let sg = 0;
  for (const [a, b] of edges(pts)) { const c = cross(sub(b, a), sub(p, a)); if (Math.abs(c) <= EPS) continue; if (sg && Math.sign(c) !== sg) return false; sg = Math.sign(c); }
  return true;
}
function closestOn(p, pts) {
  let best = null;
  for (const [a, b] of pts.length === 2 ? [[pts[0], pts[1]]] : edges(pts)) { const r = ptSeg(p, a, b); if (!best || r.d < best.d) best = r; }
  return best || { d: len(sub(p, pts[0])), q: pts[0], t: 0 };
}
function satPoly(A, B) {
  let best = null;
  for (const [a, b] of [...edges(A.pts), ...edges(B.pts)]) {
    const n = unit([-(b[1] - a[1]), b[0] - a[0]]), o = depthAlong(A, B, n);
    if (o <= EPS) return { hit: false, depth: 0, normal: null };
    if (!best || o < best.o - EPS) best = { o, n };
  }
  if (!best) return { hit: false, depth: 0, normal: null };
  const n = dot(sub(centroid(B), centroid(A)), best.n) < 0 ? mul(best.n, -1) : best.n;
  return { hit: true, depth: best.o, normal: n };
}
function circlePoly(C, P) {
  const q = closestOn(C.c, P.pts), inside = inConvex(C.c, P.pts);
  const depth = inside ? C.r + q.d : C.r - q.d;
  if (depth <= EPS) return { hit: false, depth: 0, normal: null };
  let n = inside ? unit(sub(C.c, q.q)) : unit(sub(q.q, C.c));
  if (!n[0] && !n[1]) n = unit(sub(centroid(P), C.c));
  return { hit: true, depth, normal: n, closest: q.q };
}
/** two shapes: { hit, depth, normal } where moving B by normal * depth separates them; touching (depth ≤ 1e-9) is no hit */
export function collide(A, B) {
  if (A.kind === "circle" && B.kind === "circle") {
    const d = sub(B.c, A.c), depth = A.r + B.r - len(d);
    return depth > EPS ? { hit: true, depth, normal: len(d) > EPS ? unit(d) : [1, 0] } : { hit: false, depth: 0, normal: null };
  }
  if (A.kind === "circle") return circlePoly(A, B);
  if (B.kind === "circle") { const r = circlePoly(B, A); return r.hit ? { ...r, normal: mul(r.normal, -1) } : r; }
  return satPoly(A, B);
}
/** Liang-Barsky: does segment ab cross the box [x, y, w, h] (by more than a point)? = scene.js segHitsBox */
export function segHitsBox(a, b, box) {
  const [x, y, w, h] = box;
  let t0 = 0, t1 = 1;
  const dx = b[0] - a[0], dy = b[1] - a[1];
  for (const [p, q] of [[-dx, a[0] - x], [dx, x + w - a[0]], [-dy, a[1] - y], [dy, y + h - a[1]]]) {
    if (p === 0) { if (q < 0) return false; continue; }
    const r = q / p;
    if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; }
  }
  return t1 - t0 > 1e-9;
}
function outOf(surf, space, shape) {
  if (surf.out) return surf.out;
  const n = unit([-(surf.b[1] - surf.a[1]), surf.b[0] - surf.a[0]]);
  if (Math.abs(n[1]) > EPS) return (space === "screen" ? n[1] < 0 : n[1] > 0) ? n : mul(n, -1);
  return shape && dot(sub(centroid(shape), surf.a), n) < 0 ? mul(n, -1) : n;   // a wall: the body's side
}
/** signed gap of a body to a surface along its outward normal: 0 = resting, < 0 = sunk, > 0 = floating */
export function contactGap(shape, surf, space = "world") {
  const out = outOf(surf, space, shape);
  if (shape.kind === "circle") return dot(sub(shape.c, surf.a), out) - shape.r;
  let lo = Infinity;
  for (const p of shape.pts) lo = Math.min(lo, dot(sub(p, surf.a), out));
  return lo;
}

// ─── checks ───
const sizeOf = b => b.size ?? (b.shape.kind === "circle" ? 2 * b.shape.r : Math.min(...[0, 1].map(k => { const v = ptsOf(b.shape).map(p => p[k]); return Math.max(...v) - Math.min(...v); })));
/** the surface a body rests on: over it, gap in [-size, 0.6·size]; the nearest such surface. null = resting on none */
function restOn(b, surfaces, space) {
  const h = sizeOf(b);
  let best = null;
  for (const s of surfaces) {
    const d = sub(s.b, s.a), L = len(d), u = unit(d);
    const [lo, hi] = projectShape(b.shape, u), a0 = dot(s.a, u);
    if (hi - a0 <= EPS || lo - a0 >= L - EPS) continue;                       // not over this surface
    const gap = contactGap(b.shape, s, space);
    if (gap < -h || gap > 0.6 * h) continue;                                 // not resting on it
    if (!best || Math.abs(gap) < Math.abs(best.gap)) best = { s, gap, n: outOf(s, space, b.shape) };
  }
  return best;
}
/** I-INC-1: a body within 0.6·size of a surface (and over it) rests on it: |gap| ≤ tol (0.02·size). The nearest such surface judges. */
export function checkContact(bodies, surfaces, opts = {}) {
  const space = opts.space || "world", out = [];
  for (const b of bodies) {
    const tol = opts.tol ?? 0.02 * sizeOf(b), best = restOn(b, surfaces, space);
    if (best && Math.abs(best.gap) > tol) out.push({ id: "I-INC-1", ids: [b.id, best.s.id], amount: Math.abs(best.gap), unit: unitOf(space), kind: best.gap < 0 ? "sunk" : "float", fix: { snap: mul(best.n, -best.gap) } });
  }
  return clean(out);
}
/** I-INC-2: a polygon body resting on a surface (the I-INC-1 window) lies flat on it: one of its edges is parallel to the surface
 *  within tol (1°). fix.rotate = the signed turn (degrees, counter-clockwise with y up, as every angle here) about fix.about (centroid).
 *  Circles have no angle to judge. */
export function checkTilt(bodies, surfaces, opts = {}) {
  const space = opts.space || "world", tol = opts.tilt ?? 1, out = [];
  for (const b of bodies) {
    if (b.shape.kind === "circle") continue;
    const best = restOn(b, surfaces, space);
    if (!best) continue;
    const t = angleOf(sub(best.s.b, best.s.a), space);
    let d = null;
    for (const [p, q] of edges(b.shape.pts)) {
      let e = angDiff(t, angleOf(sub(q, p), space));                          // turn the edge onto the surface, mod 180
      if (e > 90) e -= 180; else if (e <= -90) e += 180;
      if (d === null || Math.abs(e) < Math.abs(d)) d = e;
    }
    if (d !== null && Math.abs(d) > tol) out.push({ id: "I-INC-2", ids: [b.id, best.s.id], amount: Math.abs(d), unit: "deg", fix: { rotate: d, about: centroid(b.shape) } });
  }
  return clean(out);
}
/** I-BODY-1: no two solids interpenetrate beyond tol (1 px on screen). opts.allow = id pairs that may; opts.static = ids never paired together */
export function checkOverlap(shapes, opts = {}) {
  const space = opts.space || "world", tol = opts.tol ?? (space === "screen" ? 1 : EPS), out = [];
  const allow = new Set((opts.allow || []).flatMap(([a, b]) => [`${a}\0${b}`, `${b}\0${a}`])), st = new Set(opts.static || []);
  for (let i = 0; i < shapes.length; i++) for (let j = i + 1; j < shapes.length; j++) {
    const A = shapes[i], B = shapes[j];
    if (allow.has(`${A.id}\0${B.id}`) || (st.has(A.id) && st.has(B.id))) continue;
    const r = collide(A, B);
    if (r.hit && r.depth > tol) out.push({ id: "I-BODY-1", ids: [A.id, B.id], amount: r.depth, unit: unitOf(space), fix: { move: B.id, snap: mul(r.normal, r.depth) } });
  }
  return clean(out);
}
/** I-FORCE-1: a force's tail sits on its body (centre, face or rim) within tol (0.25·size) */
export function checkAnchor(forces, bodies, opts = {}) {
  const space = opts.space || "world", by = new Map(bodies.map(b => [b.id, b])), out = [];
  for (const f of forces) {
    const b = by.get(f.body);
    if (!b) continue;
    const c = centroid(b.shape), dc = len(sub(f.at, c));
    let rim;
    if (b.shape.kind === "circle") { const u = unit(sub(f.at, c)); rim = { d: Math.abs(dc - b.shape.r), q: add(c, mul(u[0] || u[1] ? u : [1, 0], b.shape.r)) }; }
    else rim = closestOn(f.at, b.shape.pts);
    const amount = Math.min(dc, rim.d), tol = opts.tol ?? 0.25 * sizeOf(b);
    if (amount > tol) out.push({ id: "I-FORCE-1", ids: [f.id, b.id], amount, unit: unitOf(space), fix: { reanchor: dc <= rim.d ? c : rim.q } });
  }
  return clean(out);
}
/** a force label's role, when the label says it unambiguously */
export function roleOf(label) {
  const s = String(label ?? "").replace(/\$/g, "").replace(/[{}\s]/g, "");
  if (/^(mg|W|w|F_g|F_G|F_w|F_W)$/.test(s)) return "weight";
  if (/^(N|n|F_N|F_n)$/.test(s)) return "normal";
  if (/^(f|f_k|f_s|F_f|F_k|F_s)$/.test(s)) return "friction";
  if (/^T(_\w+|\d*)$/.test(s)) return "tension";
  return null;
}
/** I-FORCE-2 weight straight down (0.5°); I-FORCE-3 normal ⟂ its surface, friction ∥, tension along its rope (1°).
 *  force: { id, at, angle° (+ frame°) | tip, role? | label?, surface?: id | surface, rope?: the rope's far end }; opts.surface / surfaces */
export function checkDirection(forces, opts = {}) {
  const space = opts.space || "world", out = [], surfs = new Map((opts.surfaces || []).map(s => [s.id, s]));
  for (const f of forces) {
    const role = f.role ?? roleOf(f.label);
    const a = f.angle != null ? norm360(f.angle + (f.frame || 0)) : angleOf(sub(f.tip, f.at), space);
    const s = typeof f.surface === "object" ? f.surface : surfs.get(f.surface) || opts.surface;
    let target = null, tol = 1, id = "I-FORCE-3";
    if (role === "weight") { target = 270; tol = 0.5; id = "I-FORCE-2"; }
    else if (role === "normal" && s) target = angleOf(outOf(s, space), space);
    else if (role === "friction" && s) { const t = angleOf(sub(s.b, s.a), space); target = Math.abs(angDiff(t, a)) <= 90 ? t : norm360(t + 180); }
    else if (role === "tension" && f.rope) target = angleOf(sub(f.rope, f.at), space);
    if (target == null) continue;
    const d = angDiff(target, a);
    if (Math.abs(d) > tol) out.push({ id, ids: [f.id], amount: Math.abs(d), unit: "deg", kind: role, fix: { angle: norm360(target), rotate: d } });
  }
  return clean(out);
}
/** I-LBL-1 no two labels overlap (fix: push the later one the short way); I-LBL-2 every label inside R (fix: the shift back in) */
export function checkLabels(labels, R, opts = {}) {
  const tol = opts.tol ?? 0, out = [];
  for (let i = 0; i < labels.length; i++) for (let j = i + 1; j < labels.length; j++) {
    const p = labels[i].box, q = labels[j].box;
    const ow = Math.min(p[0] + p[2], q[0] + q[2]) - Math.max(p[0], q[0]), oh = Math.min(p[1] + p[3], q[1] + q[3]) - Math.max(p[1], q[1]);
    if (ow <= tol || oh <= tol) continue;
    const sx = q[0] + q[2] / 2 >= p[0] + p[2] / 2 ? 1 : -1, sy = q[1] + q[3] / 2 >= p[1] + p[3] / 2 ? 1 : -1;
    out.push({ id: "I-LBL-1", ids: [labels[i].id, labels[j].id], amount: Math.min(ow, oh), unit: "px", fix: { move: labels[j].id, by: oh <= ow ? [0, sy * oh] : [sx * ow, 0] } });
  }
  if (R) for (const l of labels) {
    const [x, y, w, h] = l.box;
    const dx = x < R.x ? R.x - x : x + w > R.x + R.w ? R.x + R.w - x - w : 0, dy = y < R.y ? R.y - y : y + h > R.y + R.h ? R.y + R.h - y - h : 0;
    if (Math.max(Math.abs(dx), Math.abs(dy)) > tol) out.push({ id: "I-LBL-2", ids: [l.id], amount: Math.max(Math.abs(dx), Math.abs(dy)), unit: "px", fix: { move: l.id, by: [dx, dy] } });
  }
  return clean(out);
}
const toWorld = (f, p) => [(p[0] - (f.R.x + f.R.w / 2)) / f.cam.s + f.cam.cx, -(p[1] - (f.R.y + f.R.h / 2)) / f.cam.s + f.cam.cy];
const toScreen = (f, p) => [f.R.x + f.R.w / 2 + (p[0] - f.cam.cx) * f.cam.s, f.R.y + f.R.h / 2 - (p[1] - f.cam.cy) * f.cam.s];
function bboxOf(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
  return { x0, y0, x1, y1 };
}
/** I-STEP-2: between two frames the camera holds (unless opts.cameraOp or the drawing grew > 8%) and untouched objects move ≤ tol px;
 *  I-STEP-3: untouched labels keep their spot (dir + ring, or their box when placed by spot).
 *  frame: { objs: {id: screen pts}, labels?: [{key, id, box, dir?, ring?}], cam?: {cx, cy, s}, R? } (cam + R: screen = scene.js X()) */
export function checkSteps(A, B, opts = {}) {
  const tol = opts.tol ?? 1, touched = new Set(opts.touched || []), out = [];
  const withCam = A.cam && B.cam && A.R && B.R;
  const keep = Object.keys(A.objs || {}).filter(id => B.objs && B.objs[id] && !touched.has(id) && A.objs[id].length === B.objs[id].length);
  if (withCam) {
    const wa = Object.values(A.objs).flat().map(p => toWorld(A, p)), wb = Object.values(B.objs).flat().map(p => toWorld(B, p));
    const ba = bboxOf(wa), bb = bboxOf(wb);
    const grew = bb.x1 - bb.x0 > 1.08 * (ba.x1 - ba.x0) + EPS || bb.y1 - bb.y0 > 1.08 * (ba.y1 - ba.y0) + EPS;
    if (!opts.cameraOp && !grew && wa.length) {
      const drift = Math.max(...[[ba.x0, ba.y0], [ba.x1, ba.y0], [ba.x0, ba.y1], [ba.x1, ba.y1]].map(p => len(sub(toScreen(B, p), toScreen(A, p)))));
      if (drift > tol) out.push({ id: "I-STEP-2", ids: ["camera"], amount: drift, unit: "px", kind: "camera", fix: { lock: A.cam } });
    }
  }
  for (const id of keep) {
    let d = 0, by = [0, 0];
    A.objs[id].forEach((p, i) => {
      const q = B.objs[id][i], v = withCam ? mul(sub(toWorld(A, p), toWorld(B, q)), B.cam.s) : sub(p, q);
      if (len(v) > d) { d = len(v); by = withCam ? [v[0], -v[1]] : v; }
    });
    if (d > tol) out.push({ id: "I-STEP-2", ids: [id], amount: d, unit: "px", kind: "object", fix: { move: id, by } });
  }
  const before = new Map((A.labels || []).map(l => [l.key, l]));
  for (const l of B.labels || []) {
    const p = before.get(l.key);
    if (!p || touched.has(l.id)) continue;
    const moved = len(sub(l.box, p.box)), byDir = p.dir != null || l.dir != null;
    if (byDir ? p.dir !== l.dir || p.ring !== l.ring : moved > 0.5)
      out.push({ id: "I-STEP-3", ids: [l.id], amount: moved, unit: "px", fix: { carry: byDir ? { key: l.key, dir: p.dir, ring: p.ring } : { key: l.key, box: p.box } } });
  }
  return clean(out);
}
/** I-BAL-1: the drawing's bbox fills ≥ min of the container's width (0.55, or 0.70 at ≤ 480 px) and is centred (± 5% of the width) */
export function checkBalance(bbox, container, opts = {}) {
  const min = opts.min ?? (container.w <= 480 ? 0.7 : 0.55), share = bbox.w / container.w, out = [];
  if (share < min) out.push({ id: "I-BAL-1", ids: ["figure"], amount: min - share, unit: "share", kind: "share", fix: { scale: min / share } });
  const off = container.x + container.w / 2 - (bbox.x + bbox.w / 2);
  if (Math.abs(off) > (opts.centreTol ?? 0.05 * container.w)) out.push({ id: "I-BAL-1", ids: ["figure"], amount: Math.abs(off), unit: "px", kind: "centre", fix: { shift: [off, 0] } });
  return clean(out);
}
/** every model-space check over one model: { space?, bodies: [{id, shape, size?}], solids?: [shape], surfaces?, forces?, labels?, R? } */
export function checkAll(m, opts = {}) {
  const space = m.space || opts.space || "world", o = { ...opts, space }, bodies = m.bodies || [], solids = m.solids || [], surfaces = m.surfaces || [];
  return [
    ...checkContact(bodies, surfaces, o),
    ...checkTilt(bodies, surfaces, o),
    ...checkOverlap([...bodies.map(b => b.shape), ...solids], { ...o, static: solids.map(s => s.id) }),
    ...checkAnchor(m.forces || [], bodies, o),
    ...checkDirection(m.forces || [], { ...o, surfaces }),
    ...(m.labels ? checkLabels(m.labels, m.R, o) : []),
  ];
}

// ─── angles (W340 §2, I-ANG-1a-d): Geometry's right(…) / angle(…) marks against the points they name. A mark names 3 points; the
// vertex is the first (views.js's grammar) or, when the drawing contradicts that and fits the middle one (∠BAC, the textbook way the
// model also writes), the middle. I-ANG-1c: a right box or a "90°" label needs a square corner there (0.5°); I-ANG-1d: a numeric
// label = the drawn angle (0.5°); I-ANG-1b: a vertex with a right box never carries a non-90° angle; I-ANG-1a: the label sits at its
// own vertex (checkAngleLabels, after placement). Angles are the unsigned angle between the two rays, 0..180.
export const angleAt = (at, u, v) => { const a = sub(u, at), b = sub(v, at); return Math.abs(Math.atan2(cross(a, b), dot(a, b))) / DEG; };
/** the degrees a label states ("30°", "90 °", "36.9°"), else null (θ, a length, a bare number) */
export const angleNumber = text => { const m = /^\s*(\d+(?:\.\d+)?)\s*°\s*$/.exec(String(text ?? "")); return m ? +m[1] : null; };
/** pts {name: [x, y]}, marks [{k: "right"|"angle", names: [n0, n1, n2], text?}] -> { marks: [{...m, vertex, rays: [a, b]}], findings } */
export function resolveAngles(pts, marks, tol = 0.5) {
  const findings = [], P = n => pts[n];
  const opt = (m, i) => { const [n0, n1, n2] = m.names, v = i ? n1 : n0, rays = i ? [n0, n2] : [n1, n2];
    return P(v) && P(rays[0]) && P(rays[1]) ? { vertex: v, rays, deg: angleAt(P(v), P(rays[0]), P(rays[1])) } : null; };
  const out = marks.map(m => ({ ...m }));
  const square = new Set();
  out.forEach((m, i) => {                                            // the right boxes first: the angles read where they sit
    if (m.k !== "right") return;
    const c = [opt(m, 0), opt(m, 1)], pick = c.find(o => o && Math.abs(o.deg - 90) <= tol);
    Object.assign(m, pick || c[0] || {});
    if (!pick) findings.push({ id: "I-ANG-1c", ids: ["m" + i, m.vertex], amount: c[0] ? Math.abs(c[0].deg - 90) : 0, unit: "deg", kind: "right" });
    else square.add(m.vertex);
  });
  out.forEach((m, i) => {
    if (m.k !== "angle") return;
    const c = [opt(m, 0), opt(m, 1)], want = angleNumber(m.text);
    let pick;
    if (want != null) {
      pick = c.find(o => o && Math.abs(o.deg - want) <= tol);
      if (!pick) findings.push({ id: want === 90 ? "I-ANG-1c" : "I-ANG-1d", ids: ["m" + i, c[0]?.vertex], amount: Math.min(...c.filter(Boolean).map(o => Math.abs(o.deg - want)), 180), unit: "deg" });
    } else pick = c[0] && square.has(c[0].vertex) && c[1] && !square.has(c[1].vertex) ? c[1] : c[0];
    Object.assign(m, pick || c[0] || {});
    if (pick && square.has(m.vertex) && !(want === 90 || (want == null && Math.abs(m.deg - 90) <= tol)))
      findings.push({ id: "I-ANG-1b", ids: ["m" + i, m.vertex], amount: Math.abs(m.deg - 90), unit: "deg" });
  });
  return { marks: out, findings: clean(findings) };
}
/** I-ANG-1a: labels [{id, vertex (a point name), box [x, y, w, h]}] in the same space as pts: the box centre is nearest its own vertex */
export function checkAngleLabels(labels, pts) {
  const out = [];
  for (const l of labels) {
    const c = [l.box[0] + l.box[2] / 2, l.box[1] + l.box[3] / 2], own = pts[l.vertex];
    if (!own) continue;
    const d0 = len(sub(c, own));
    let near = null;
    for (const [n, p] of Object.entries(pts)) if (n !== l.vertex && len(sub(c, p)) < d0 - EPS && (!near || len(sub(c, p)) < near.d)) near = { n, d: len(sub(c, p)) };
    if (near) out.push({ id: "I-ANG-1a", ids: [l.id, near.n], amount: d0 - near.d, unit: "px", fix: { move: l.id, to: own } });
  }
  return clean(out);
}

// ─── the label packer: scene.js place() as is (8 candidates around the anchor scored by overlap, a 2nd and 3rd ring with a leader,
// then a free-spot grid). reqs: [{key, id, w (text width), t: {pt} | {box}, R?, dirs?, spot?, hid?}] in screen px (y down);
// segs: [{id, pts: [a, b]}] drawn lines; bodies: [{id, box}]; fixed: Map key -> {dir, ring} (a tween keeps its choices).
// opts: { LH: 19 (label box height), GAP: 6 (first ring) } = scene.js's numbers. A req may carry its own measured height h (graph.js
// labels: KaTeX spans) in place of LH; without it the numbers are scene.js's.
const DIRS = { e: [1, 0], ne: [1, 1], n: [0, 1], nw: [-1, 1], w: [-1, 0], sw: [-1, -1], s: [0, -1], se: [1, -1] };   // screen: y down, n = up
const ORDER = ["n", "e", "s", "w", "ne", "nw", "se", "sw"];
/** the box (x, y, w, h) of a label of size w x h on side `dir` of a target (a point, or a box) at distance d */
export function candBox(t, dir, w, h, d) {
  const [dx, dy] = DIRS[dir], b = t.box || [t.pt[0], t.pt[1], 0, 0];
  const ax = dx > 0 ? b[0] + b[2] : dx < 0 ? b[0] : b[0] + b[2] / 2, ay = dy > 0 ? b[1] : dy < 0 ? b[1] + b[3] : b[1] + b[3] / 2;
  const dd = dx && dy ? d * 0.7 : d;
  const x = dx > 0 ? ax + dd : dx < 0 ? ax - dd - w : ax - w / 2, y = dy > 0 ? ay - dd - h : dy < 0 ? ay + dd : ay - h / 2;
  return [x, y, w, h];
}
const area = b => b[2] * b[3];
export const overlap = (p, q) => Math.max(0, Math.min(p[0] + p[2], q[0] + q[2]) - Math.max(p[0], q[0])) * Math.max(0, Math.min(p[1] + p[3], q[1] + q[3]) - Math.max(p[1], q[1]));
export const inBox = (b, R) => b[0] >= R.x - 1e-9 && b[1] >= R.y - 1e-9 && b[0] + b[2] <= R.x + R.w + 1e-9 && b[1] + b[3] <= R.y + R.h + 1e-9;
export function place(reqs, segs, bodies, R, fixed, opts = {}) {
  const LH = opts.LH ?? 19, GAP = opts.GAP ?? 6, C = opts.clear ?? 0;   // clear (W340 mc-a): a box this far from a stroke or a dot scores as on it
  const grow = b => (C ? [b[0] - C, b[1] - C, b[2] + 2 * C, b[3] + 2 * C] : b);
  const placed = [];
  for (const q of reqs) {
    const w = q.w + 6, h = q.h ?? LH;
    let best = null;
    const tryOne = (dir, ring, pen) => {
      const box = candBox(q.t, dir, w, h, ring);
      let sc = pen;
      if (!inBox(box, q.R || R)) sc += 1e5;
      for (const p of placed) if (overlap(box, p.box) > 0) sc += 1e4 + overlap(box, p.box);
      const near = grow(box);
      for (const s of segs) if (segHitsBox(s.pts[0], s.pts[1], near)) sc += s.id === q.id ? 12 : 30;
      for (const b of bodies) if (b.id !== q.id && overlap(near, b.box) > 0) sc += 20 * overlap(near, b.box) / area(near);
      if (!best || sc < best.sc) best = { box, sc, dir, ring };
    };
    const f = fixed && fixed.get(q.key);
    if (q.spot) best = { box: [q.spot[0], q.spot[1], w, h], sc: 0, dir: null, ring: GAP };
    else if (f) tryOne(f.dir, f.ring, 0);
    else {
      const dirs = q.dirs || ORDER;
      dirs.forEach((d, i) => tryOne(d, GAP, i * 0.5));
      if (best.sc >= 12) dirs.forEach((d, i) => tryOne(d, GAP + 18, 14 + i * 0.5));
      if (best.sc >= 1e4) dirs.forEach((d, i) => tryOne(d, GAP + 40, 40 + i * 0.5));
      if (best.sc >= 1e4) for (let yy = (q.R || R).y + 2; yy + h <= (q.R || R).y + (q.R || R).h; yy += 10) for (let xx = (q.R || R).x + 2; xx + w <= (q.R || R).x + (q.R || R).w; xx += 12) {
        const box = [xx, yy, w, h];
        if (placed.some(p => overlap(box, p.box) > 0)) continue;
        const sc = 2e3 + Math.hypot(xx + w / 2 - (q.t.pt ? q.t.pt[0] : q.t.box[0]), yy + h / 2 - (q.t.pt ? q.t.pt[1] : q.t.box[1]));
        if (sc < best.sc) best = { box, sc, dir: null, ring: 99, free: true };
      }
    }
    const knock = q.hid || segs.some(s => segHitsBox(s.pts[0], s.pts[1], best.box));
    const lead = best.ring > GAP + 1 ? leaderOf(q.t, best.box) : null;
    placed.push({ ...q, box: best.box, dir: best.dir, ring: best.ring, knock, lead });
  }
  return placed;
}
/** the leader line from the target to the nearest point of a label box placed off the first ring (none under 8 px) */
export function leaderOf(t, box) {
  const p = t.pt || [t.box[0] + t.box[2] / 2, t.box[1] + t.box[3] / 2];
  const q = [Math.max(box[0], Math.min(p[0], box[0] + box[2])), Math.max(box[1], Math.min(p[1], box[1] + box[3]))];
  return Math.hypot(q[0] - p[0], q[1] - p[1]) > 8 ? [p, q] : null;
}

const FigCheck = { angleAt, angleNumber, resolveAngles, checkAngleLabels, poly, box, circle, wseg, surface, incline, centroid, ptSeg, depthAlong, collide, segHitsBox, contactGap,
  checkContact, checkTilt, checkOverlap, checkAnchor, roleOf, checkDirection, checkLabels, checkSteps, checkBalance, checkAll, candBox, overlap, inBox, place, leaderOf };
if (typeof globalThis !== "undefined") globalThis.FigCheck = FigCheck;
export default FigCheck;
