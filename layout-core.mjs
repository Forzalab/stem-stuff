// layout-core.mjs: the streamed, constraint-checked figure language (Cluck layout core, prototype; plan: brain
// projects/calc/_files/cluck-stepper-2026-11-08/layout-map/MAP.md, decisions Q17-Q32 + Fable review).
// One statement per line, OpenUI Lang shape `id = Comp(args)`. Points are computed by the renderer (Pt Mid Along Off Foot Rot
// Meet), shapes hang off points (Seg Box Poly Circle Curve Vec Label Angle Dim), `Union([ids])` groups parts into one object,
// `sN = Layer([ids], {hide, zoom, lit, title})` stacks steps on the prefix, `Figure([...])` is an optional root, `Fix(B, {patch})`
// is the pass-2 form (and a step's restyle when a Layer lists it). Labels go inside / beside their anchor or to the legend row. The program is a DAG evaluated in Kahn order as lines stream in; each newly evaluated shape is checked
// against the shapes already there (precedence = statement index: the later of a pair is blamed), every conflict of the new
// line is reported as a PAIR with amount + push vector (MTV) + a dashed ghost of where the later shape must go.
// Plain ESM, no DOM, imports only ./figcheck.js (SAT+MTV collide, contactGap, autoHues). Deterministic: same program, same output.
// NOT a physics simulator (Tony, Nov 8): the engine never judges physics meaning (force directions, magnitudes, what acts on what);
// the LLM owns that. The DAG + collide checker only save the LLM the tokens it spends ARRANGING objects (auto-snap, like Canva):
// placement, contact, containment, overlap. One diagram per draw.
// Plan lines (Q41): `// goal: | anchor: | layers: | budget:` lines are kept as result().plan and checked against what is drawn (fyi);
// a 7th Layer is an llm finding (Q42, MAX_LAYERS = 6).
// World space: y up. Tolerance = 1% of the figure span (model units), so the verdict is the same on every screen.
import { box as fcBox, poly as fcPoly, circle as fcCircle, wseg, surface as fcSurface, collide, contactGap, centroid, ptSeg, autoHues } from "./figcheck.js";

const EPS = 1e-9, DEG = Math.PI / 180;
const sub = (p, q) => [p[0] - q[0], p[1] - q[1]], add = (p, q) => [p[0] + q[0], p[1] + q[1]], mul = (p, k) => [p[0] * k, p[1] * k];
const dot = (p, q) => p[0] * q[0] + p[1] * q[1], cross = (p, q) => p[0] * q[1] - p[1] * q[0];
const len = p => Math.hypot(p[0], p[1]);
const unit = p => { const l = len(p); return l > EPS ? [p[0] / l, p[1] / l] : [0, 0]; };
const rot = (p, a) => [p[0] * Math.cos(a) - p[1] * Math.sin(a), p[0] * Math.sin(a) + p[1] * Math.cos(a)];
const r3 = v => (Math.abs(v) < 5e-4 ? 0 : Math.round(v * 1000) / 1000);
const rv = p => (p ? [r3(p[0]), r3(p[1])] : null);
const fmt = v => (v >= 0 ? "+" : "") + r3(v);
const fv = p => `(${fmt(p[0])}, ${fmt(p[1])})`;
const fp = p => `(${r3(p[0])}, ${r3(p[1])})`;
const finite = p => Array.isArray(p) && p.length === 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]);

// ─── the language ───
export const POINT_OPS = { Pt: ["x", "y"], Mid: ["A", "B"], Along: ["A", "B", "t"], Off: ["P", "dx", "dy"], Foot: ["P", "A", "B"], Rot: ["O", "P", "deg"], Meet: ["A", "B", "C", "D"] };
export const SHAPE_SIGS = { Seg: "Seg(A, B, opts?)", Box: "Box(C, w, h, deg?, opts?)", Poly: "Poly([A, B, C, ...], opts?)", Circle: "Circle(O, r, opts?)", Vec: "Vec(A, B, label?, opts?)", Label: "Label(P, text, opts?)", Angle: "Angle(A, O, B, label?, opts?)", Dim: "Dim(A, B, text, opts?)", Curve: "Curve([A, B, C, ...], opts?)" };
export const MAX_LAYERS = 6;                         // Tony Q42: 2-4 recommended, 6 max; a 7th Layer is an llm finding
export const LAYER_SIG = 'Layer([ids...], {hide: [ids], zoom: [ids], lit: [ids], title: "..."})';
const SIGS = { ...Object.fromEntries(Object.entries(POINT_OPS).map(([k, v]) => [k, `${k}(${v.join(", ")})`])), ...SHAPE_SIGS, Figure: "Figure([ids...])", Fix: "Fix(target, {trait: value})", Layer: LAYER_SIG, Union: "Union([ids...], opts?)", Shush: 'Shush(fid, "reason")' };
const META = new Set(["Fix", "Layer", "Union", "Shush"]);   // statements outside the DAG (they name other statements): validated at rebuild, never values
export const KINDS = ["solid", "surface", "inside", "overlay"];
export const TONES = ["sky", "amber", "orange", "violet", "pink", "cyan", "ink", "muted"];
const OPT_KEYS = ["kind", "in", "tone", "shade", "fill", "label", "legend", "closed", "mirror", "w"], CURVE_KEYS = ["closed", "mirror", "w"];
const AREA = new Set(["Box", "Poly", "Circle"]), DECOR = new Set(["Vec", "Label", "Angle", "Dim"]);
const FIX_TRAITS = { Pt: ["x", "y"], Box: ["w", "h", "deg"], Circle: ["r"], Seg: [], Poly: [], Vec: ["label"], Label: ["text"], Angle: ["label"], Dim: ["text"], Curve: [], Union: [] };
const isArea = sh => AREA.has(sh.comp) || (sh.comp === "Curve" && sh.geom.area);   // a closed or wide Curve is an area; an open thin one is a line

// ─── tokenizer + parser (the OpenUI Lang statement subset: numbers, strings, refs, calls, [arrays], {objects}, + - * /) ───
function perr(code, message) { const e = new Error(message); e.code = code; return e; }
function tokenize(s) {
  const out = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '"' || c === "'") {
      let j = i + 1, v = "";
      while (j < s.length && s[j] !== c) { if (s[j] === "\\" && j + 1 < s.length) { j++; v += s[j] === "n" ? "\n" : s[j]; } else v += s[j]; j++; }
      if (j >= s.length) throw perr("parse", "unclosed string");
      out.push({ t: "str", v }); i = j + 1; continue;
    }
    if (c === "\u2212" || c === "\u2013") { out.push({ t: "-" }); i++; continue; }   // E5: a pasted minus / en dash reads as "-" (strings already returned above)
    const m = /^(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?/.exec(s.slice(i, i + 40));
    if (m) { out.push({ t: "num", v: parseFloat(m[0]) }); i += m[0].length; continue; }
    const id = /^[A-Za-z_Ͱ-Ͽ][\wͰ-Ͽ]*/.exec(s.slice(i, i + 80));
    if (id) { out.push({ t: "id", v: id[0] }); i += id[0].length; continue; }
    if ("()[]{},:=+-*/".includes(c)) { out.push({ t: c }); i++; continue; }
    throw perr("parse", `unexpected "${c}"`);
  }
  return out;
}
const PREC = { "+": 1, "-": 1, "*": 2, "/": 2 };
function parseTokens(toks) {
  let i = 0;
  const peek = () => toks[i], take = t => { const k = toks[i]; if (!k || (t && k.t !== t)) throw perr("parse", `expected "${t}"${k ? ` near "${k.v ?? k.t}"` : " at end of line"}`); i++; return k; };
  function list(close) {
    const items = [];
    while (peek() && peek().t !== close) { items.push(item()); if (peek() && peek().t === ",") i++; else break; }
    take(close);
    return items;
  }
  // E5: a bare "(x, y)" of two numeric expressions where an ARGUMENT or LIST ITEM starts is Pt(x, y);
  // "(1 + 2) * 3" and "(2)" fall back to plain grouping (no comma, or the paren is not the whole item)
  function item() {
    if (peek() && peek().t === "(") {
      const save = i;
      try {
        i++;
        const a = expr(0);
        if (peek() && peek().t === ",") {
          i++;
          const b = expr(0), next = toks[i + 1];
          if (a.t === "num" && b.t === "num" && peek() && peek().t === ")" && (!next || [",", ")", "]"].includes(next.t))) {
            i++;
            return { t: "call", name: "Pt", args: [a, b] };
          }
        }
      } catch { /* not a point: parse it again as grouping */ }
      i = save;
    }
    return expr(0);
  }
  function primary() {
    const k = take();
    if (k.t === "num" || k.t === "str") return { t: k.t, v: k.v };
    if (k.t === "-") { const e = primary(); if (e.t !== "num") throw perr("parse", "minus needs a number"); return { t: "num", v: -e.v }; }
    if (k.t === "(") { const e = expr(0); take(")"); return e; }
    if (k.t === "[") return { t: "arr", items: list("]") };
    if (k.t === "{") {
      const entries = [];
      while (peek() && peek().t !== "}") {
        const key = take();
        if (key.t !== "id" && key.t !== "str") throw perr("parse", "object key must be a name");
        take(":"); entries.push([key.v, expr(0)]);
        if (peek() && peek().t === ",") i++; else break;
      }
      take("}");
      return { t: "obj", entries };
    }
    if (k.t === "id") {
      if (k.v === "true" || k.v === "false") return { t: "bool", v: k.v === "true" };
      if (k.v === "null") return { t: "null" };
      if (peek() && peek().t === "(") { i++; return { t: "call", name: k.v, args: list(")") }; }
      return { t: "ref", id: k.v };
    }
    throw perr("parse", `unexpected "${k.t}"`);
  }
  function expr(min) {
    let left = primary();
    while (peek() && PREC[peek().t] && PREC[peek().t] > min) {
      const op = take().t, right = expr(PREC[op]);
      if (left.t !== "num" || right.t !== "num") throw perr("parse", "arithmetic works on numbers only");
      left = { t: "num", v: op === "+" ? left.v + right.v : op === "-" ? left.v - right.v : op === "*" ? left.v * right.v : left.v / right.v };
    }
    return left;
  }
  const idTok = take("id"); take("=");
  const call = expr(0);
  if (i < toks.length) throw perr("parse", `extra text after the statement near "${toks[i].v ?? toks[i].t}"`);
  return { id: idTok.v, call };
}
function refsOf(node, out = new Set()) {
  if (!node) return out;
  if (node.t === "ref") out.add(node.id);
  else if (node.t === "call") node.args.forEach(a => refsOf(a, out));
  else if (node.t === "arr") node.items.forEach(a => refsOf(a, out));
  else if (node.t === "obj") node.entries.forEach(([k, v]) => { if (k === "in" || v.t !== "ref") refsOf(v, out); });   // a bare word in opts ({kind: surface}) is a string, not a ref; only `in:` names a statement
  return out;
}
/** one statement's text -> { id, comp, args, deps } or throws {code, message} */
export function parseStatement(text) {
  const { id, call } = parseTokens(tokenize(text));
  if (call.t !== "call") throw perr("parse", `${id}: the right side must be a component call like Pt(0, 0)`);
  if (!(call.name in SIGS)) throw perr("unknown-comp", `${id}: unknown component ${call.name} (known: ${Object.keys(SIGS).join(" ")})`);
  const deps = call.name === "Layer" || call.name === "Union" || call.name === "Shush" ? new Set() : refsOf(call);   // Layer / Union / Shush name statements / findings (forward refs fine); not DAG nodes
  checkInline(call);
  let inlinePts = 0;
  const countPt = n => { if (n.t === "call") { if (n.name === "Pt") inlinePts++; n.args.forEach(countPt); } else if (n.t === "arr") n.items.forEach(countPt); else if (n.t === "obj") n.entries.forEach(([, v]) => countPt(v)); };
  call.args.forEach(countPt);
  return { id, comp: call.name, args: call.args, deps: [...deps], inlinePts };
}
function checkInline(call) {
  for (const a of call.args) walk(a);
  function walk(n) {
    if (n.t === "call") { if (!(n.name in POINT_OPS)) throw perr("bad-args", `only point ops may be written inline (found ${n.name})`); n.args.forEach(walk); }
    else if (n.t === "arr") n.items.forEach(walk);
    else if (n.t === "obj") n.entries.forEach(([, v]) => walk(v));
  }
}
/** split a growing text into complete statements: a newline at bracket depth 0 outside strings ends one; ``` fences drop, `//` comments
 * drop too, except the PLAN lines (Tony Q41: a whole-line `// goal: | anchor: | layers: | budget:` before or between statements) */
export const PLAN_KEYS = ["goal", "anchor", "layers", "budget"];
const PLAN_RE = /^\/\/\s*(goal|anchor|layers|budget)\s*:\s*(.*?)\s*$/i;
function splitDone(buf) {
  const done = [], plans = [];
  let depth = 0, q = null, start = 0, line = 0, startLine = 0;
  for (let i = 0; i < buf.length; i++) {
    const c = buf[i];
    if (q) { if (c === "\\") i++; else if (c === q) q = null; continue; }
    if (c === '"' || c === "'") q = c;
    else if (c === "/" && buf[i + 1] === "/") {
      const j = buf.indexOf("\n", i);
      if (j < 0) break;
      const m = depth === 0 && !buf.slice(start, i).trim() && PLAN_RE.exec(buf.slice(i, j));
      if (m) plans.push({ key: m[1].toLowerCase(), text: m[2], line: line + 1 });
      buf = buf.slice(0, i) + buf.slice(j); i--; continue;
    }
    else if ("([{".includes(c)) depth++;
    else if (")]}".includes(c)) depth = Math.max(0, depth - 1);
    else if (c === "\n") {
      line++;
      if (depth === 0) { const t = buf.slice(start, i).trim(); if (t && !t.startsWith("```")) done.push({ text: t, line: startLine + 1 }); start = i + 1; startLine = line; }
    }
  }
  return { done, plans, rest: buf.slice(start), restLines: startLine };
}
/** one plan line's value: layers "1 forces, 2 friction" -> ["forces", "friction"]; "3" -> 3 blanks; "none" / "0" -> []; budget -> a number */
function planValue(key, text) {
  if (key === "budget") { const n = /\d+/.exec(text); return n ? +n[0] : null; }
  if (key !== "layers") return text;
  if (/^(none|0|-|no layers?)?$/i.test(text)) return [];
  if (/^\d+$/.test(text)) return Array(Math.min(+text, 99)).fill("");
  const num = [...text.matchAll(/(?:^|[,;]\s*)\d+(?:\s*[.:)=-]\s*|\s+)(.*?)(?=\s*[,;]\s*\d+(?:\s*[.:)=-]\s*|\s+)|$)/g)].map(m => m[1].trim());
  return num.length ? num : text.split(/\s*[,;]\s*/).filter(Boolean);
}

// ─── geometry helpers on top of figcheck ───
const isSeg = s => s.kind === "wseg" || (s.kind === "poly" && s.pts.length === 2);
const segPoly2 = s => ({ kind: "poly", id: s.id, pts: s.pts });
const signedArea = pts => pts.reduce((a, p, i) => a + cross(p, pts[(i + 1) % pts.length]), 0) / 2;
function isConvex(pts) {
  let sg = 0;
  for (let i = 0; i < pts.length; i++) {
    const c = cross(sub(pts[(i + 1) % pts.length], pts[i]), sub(pts[(i + 2) % pts.length], pts[(i + 1) % pts.length]));
    if (Math.abs(c) <= EPS) continue;
    if (sg && Math.sign(c) !== sg) return false;
    sg = Math.sign(c);
  }
  return true;
}
function pointInPoly(p, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function boundaryDist(p, pts) {
  let best = null;
  for (let i = 0; i < pts.length; i++) { const r = ptSeg(p, pts[i], pts[(i + 1) % pts.length]); if (!best || r.d < best.d) best = r; }
  return best;
}
/** ear clipping: a non-convex polygon as convex triangles (collide() is SAT on convex shapes) */
function triangulate(pts) {
  const P = signedArea(pts) < 0 ? [...pts].reverse() : [...pts], tris = [];
  const idx = P.map((_, i) => i);
  let guard = 0;
  while (idx.length > 3 && guard++ < 500) {
    let cut = false;
    for (let k = 0; k < idx.length; k++) {
      const a = P[idx[(k + idx.length - 1) % idx.length]], b = P[idx[k]], c = P[idx[(k + 1) % idx.length]];
      if (cross(sub(b, a), sub(c, b)) <= EPS) continue;
      if (idx.some(j => { const q = P[j]; return q !== a && q !== b && q !== c && pointInPoly(q, [a, b, c]); })) continue;
      tris.push([a, b, c]); idx.splice(k, 1); cut = true; break;
    }
    if (!cut) {                                // only flat corners left (a flattened curve): drop the flattest one and go on
      let k0 = -1, best = Infinity;
      for (let k = 0; k < idx.length; k++) { const a = P[idx[(k + idx.length - 1) % idx.length]], b = P[idx[k]], c = P[idx[(k + 1) % idx.length]], v = Math.abs(cross(sub(b, a), sub(c, b))) / Math.max(EPS, len(sub(b, a)) * len(sub(c, b))); if (v < best) { best = v; k0 = k; } }
      if (best > 1e-6) break;
      idx.splice(k0, 1);
    }
  }
  if (idx.length === 3) tris.push(idx.map(i => P[i]));
  return tris;
}
/** a thin segment against a convex polygon: SAT on the polygon's normals, and on the segment's normal the short way out sideways */
function segPoly(seg, P) {
  const [a, b] = seg.pts, axes = [unit([-(b[1] - a[1]), b[0] - a[0]])];
  for (let i = 0; i < P.pts.length; i++) { const e = sub(P.pts[(i + 1) % P.pts.length], P.pts[i]); if (len(e) > EPS) axes.push(unit([-e[1], e[0]])); }
  let best = null;
  for (const n of axes) {
    const s0 = Math.min(dot(a, n), dot(b, n)), s1 = Math.max(dot(a, n), dot(b, n));
    let p0 = Infinity, p1 = -Infinity; for (const p of P.pts) { p0 = Math.min(p0, dot(p, n)); p1 = Math.max(p1, dot(p, n)); }
    let r;
    if (s1 - s0 <= EPS) {                      // the segment is edge-on to this axis: inside strictly, or apart; out the short way
      if (s0 <= p0 + EPS || s0 >= p1 - EPS) return null;
      r = s0 - p0 <= p1 - s0 ? { depth: s0 - p0, normal: n } : { depth: p1 - s0, normal: mul(n, -1) };
    } else {
      const o = Math.min(s1, p1) - Math.max(s0, p0);
      if (o <= EPS) return null;
      r = { depth: o, normal: dot(sub(centroid(P), mul(add(a, b), 0.5)), n) < 0 ? mul(n, -1) : n };
    }
    if (!best || r.depth < best.depth) best = r;
  }
  return best;
}
const pieces = s => s.pieces || [s];
/** penetration of two collision shapes: { depth, normal } where moving B by normal * depth separates them; null = apart / touching */
function hit(A, B) {
  if (isSeg(A) && isSeg(B)) return null;
  let best = null;
  for (const a of pieces(A)) for (const b of pieces(B)) {
    if (isSeg(a) && isSeg(b)) continue;          // lines never conflict with lines (an open Curve is a chain of them)
    let r = null;
    if (isSeg(a) && b.kind === "poly") r = segPoly(a, b);
    else if (a.kind === "poly" && !isSeg(a) && isSeg(b)) { const q = segPoly(b, a); r = q && { depth: q.depth, normal: mul(q.normal, -1) }; }
    else { const c = collide(isSeg(a) ? segPoly2(a) : a, isSeg(b) ? segPoly2(b) : b); r = c.hit ? c : null; }
    if (r && r.depth > EPS && (!best || r.depth > best.depth)) best = { depth: r.depth, normal: r.normal };
  }
  return best;
}
function shapePts(col) { return col.kind === "circle" ? Array.from({ length: 16 }, (_, i) => add(col.c, rot([col.r, 0], i * 22.5 * DEG))) : col.pts; }
function inShape(p, col, tol = 0) {
  if (col.kind === "circle") return len(sub(p, col.c)) <= col.r + tol;
  if (isSeg(col) || col.open) return false;
  return pointInPoly(p, col.pts) || boundaryDist(p, col.pts).d <= tol;
}
function bboxOf(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
  return { x0, y0, x1, y1 };
}
function outOf(a, b, body) {   // figcheck outOf for a bare segment (world space): up, or the body's side of a wall
  const n = unit([-(b[1] - a[1]), b[0] - a[0]]);
  if (Math.abs(n[1]) > EPS) return n[1] > 0 ? n : mul(n, -1);
  return dot(sub(centroid(body), a), n) < 0 ? mul(n, -1) : n;
}

// ─── Curve: a smooth curve through named points (centripetal Catmull-Rom, alpha 0.5, as cubic Beziers), flattened ONCE at a
// fixed tolerance; the same polyline is drawn and collided (research/llm-freeform-shapes.md, shortlist 1-2) ───
export const CURVE_TOL = 0.01;                   // world units (figures are 4-10 units wide: well under a pixel at 390px)
function crBeziers(P, closed) {
  const n = P.length, out = [];
  const at = i => (closed ? P[((i % n) + n) % n] : i < 0 ? sub(mul(P[0], 2), P[1]) : i >= n ? sub(mul(P[n - 1], 2), P[n - 2]) : P[i]);
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    const d1 = Math.sqrt(len(sub(p1, p0))), d2 = Math.sqrt(len(sub(p2, p1))), d3 = Math.sqrt(len(sub(p3, p2)));
    if (d2 <= EPS) continue;
    const b1 = d1 <= EPS ? p1 : mul(add(add(mul(p2, d1 * d1), mul(p0, -d2 * d2)), mul(p1, 2 * d1 * d1 + 3 * d1 * d2 + d2 * d2)), 1 / (3 * d1 * (d1 + d2)));
    const b2 = d3 <= EPS ? p2 : mul(add(add(mul(p1, d3 * d3), mul(p3, -d2 * d2)), mul(p2, 2 * d3 * d3 + 3 * d3 * d2 + d2 * d2)), 1 / (3 * d3 * (d3 + d2)));
    out.push([p1, b1, b2, p2]);
  }
  return out;
}
function flatCubic([p0, p1, p2, p3], out, depth = 0) {
  if (depth >= 10 || Math.max(ptSeg(p1, p0, p3).d, ptSeg(p2, p0, p3).d) <= CURVE_TOL) { out.push(p3); return; }
  const m = (a, b) => mul(add(a, b), 0.5), a1 = m(p0, p1), b1 = m(p1, p2), c1 = m(p2, p3), a2 = m(a1, b1), b2 = m(b1, c1), mid = m(a2, b2);
  flatCubic([p0, a1, a2, mid], out, depth + 1); flatCubic([mid, b2, c1, p3], out, depth + 1);
}
function flattenCurve(P, closed) {
  const bz = crBeziers(P, closed), out = bz.length ? [bz[0][0]] : [];
  for (const b of bz) flatCubic(b, out);
  if (closed && out.length > 1 && len(sub(out[0], out[out.length - 1])) <= EPS) out.pop();
  return out;
}
function reflectPt(p, A, B) { const d = unit(sub(B, A)), q = add(A, mul(d, dot(sub(p, A), d))); return sub(mul(q, 2), p); }
function dedupe(P, closed) {
  const out = [];
  for (const p of P) if (!out.length || len(sub(p, out[out.length - 1])) > 1e-9) out.push(p);
  if (closed && out.length > 1 && len(sub(out[0], out[out.length - 1])) <= 1e-9) out.pop();
  return out;
}
/** a tapered stroke along a flattened centreline: offset by w(t)/2 both sides, round caps; one closed outline */
function taper(line, w0, w1) {
  const n = line.length, acc = [0];
  for (let i = 1; i < n; i++) acc.push(acc[i - 1] + len(sub(line[i], line[i - 1])));
  const L = acc[n - 1] || 1, left = [], right = [], tan = [], nor = [];
  for (let i = 0; i < n; i++) {
    const t = unit(sub(line[Math.min(i + 1, n - 1)], line[Math.max(i - 1, 0)])), nn = [-t[1], t[0]], h = (w0 + (w1 - w0) * acc[i] / L) / 2;
    tan.push(t); nor.push(nn); left.push(add(line[i], mul(nn, h))); right.push(sub(line[i], mul(nn, h)));
  }
  const cap = (c, nn, t, r) => (r <= 1e-6 ? [] : Array.from({ length: 7 }, (_, k) => { const a = (k + 1) * Math.PI / 8; return add(c, add(mul(nn, r * Math.cos(a)), mul(t, r * Math.sin(a)))); }));
  return dedupe([...left, ...cap(line[n - 1], nor[n - 1], tan[n - 1], w1 / 2), ...right.reverse(), ...cap(line[0], mul(nor[0], -1), mul(tan[0], -1), w0 / 2)], true);
}
function selfCross(pts, closed) {
  const n = pts.length, m = closed ? n : n - 1;
  for (let i = 0; i < m; i++) for (let j = i + 2; j < m; j++) {
    if (closed && i === 0 && j === m - 1) continue;
    if (segInter(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n])) return true;   // crossing or touching (a loop through a shared vertex too)
  }
  return false;
}

// ─── the session: incremental parse + DAG evaluation + checks ───
export function createSession(opts = {}) {
  const o = { mover: false, W: 360, ...opts };
  let stmts = [];            // [{id, comp, args, deps, line, pass, idx}] in precedence order
  const bufs = { 1: "", 2: "" }, lineBase = { 1: 0, 2: 0 };
  let S;                     // evaluation state (rebuilt on Fix / redefinition)
  let parseFindings = [];    // findings about the text itself (parse errors, redefinitions): kept across rebuilds
  let events = [];
  let quiet = false;         // a step snapshot re-evaluates silently (no checks, no events)
  const emit = e => { if (!quiet) events.push(e); };
  let metaCache = null;      // layer + union membership, recomputed when the statement list changes
  const plan = {};           // the plan lines of pass 1 (Q41): {goal, anchor, layers, budget, lines: {key: line}}
  let ended1 = false;        // pass 1 has finished streaming (plan-layers / plan-missing wait for it)

  function fresh() { return { vals: new Map(), status: new Map(), findings: [], ghosts: [], order: [], blockedBy: new Map(), patches: new Map(), fixErr: new Map(), moved: new Map() }; }
  S = fresh();

  // ── finding ids: stable per session (e1/w1), keyed by code + sorted ids + line ──
  const fids = new Map(), fidN = { e: 0, w: 0 };
  function assignFid(f) {
    f.sev = f.cls === "fyi" ? "warning" : "error";
    if (f.fid) return f;
    const key = `${f.code}|${[...(f.ids || [])].sort().join(",")}|${f.line ?? ""}`;
    let fid = fids.get(key);
    if (!fid) { const k = f.sev === "error" ? "e" : "w"; fid = k + (++fidN[k]); fids.set(key, fid); }
    f.fid = fid;
    return f;
  }

  const byId = id => stmts.find(s => s.id === id);
  const shapesEval = () => S.order.map(id => S.vals.get(id)).filter(v => v && v.t === "shape");
  function span() {
    const pts = [];
    for (const v of S.vals.values()) if (v.t === "pt") pts.push(v.p); else if (v.t === "shape") pts.push(...v.bpts);
    if (!pts.length) return 1;
    const b = bboxOf(pts);
    return Math.max(b.x1 - b.x0, b.y1 - b.y0, EPS);
  }
  const tolNow = () => 0.01 * span();
  function finding(f) {
    const st = byId(f.ids[0]);
    const out = { code: f.code, cls: f.cls || "llm", ids: f.ids, amount: f.amount != null ? r3(f.amount) : null, mtv: f.mtv ? rv(f.mtv) : null, hint: f.hint, line: f.line ?? st?.line ?? null, pass: f.pass ?? st?.pass ?? 1 };
    if (f.blocked) out.blocked = f.blocked;
    if (out.cls === "fyi") out.hint = `${out.hint} (no action needed)`;
    assignFid(out);
    S.findings.push(out); emit({ type: "finding", f: out });
    return out;
  }

  // ── evaluating one statement ──
  function val(n) {
    switch (n.t) {
      case "num": case "str": case "bool": return n.v;
      case "null": return null;
      case "arr": return n.items.map(val);
      case "obj": return Object.fromEntries(n.entries.map(([k, v]) => [k, v.t === "ref" ? v.id : val(v)]));
      case "ref": return S.vals.get(n.id);
      case "call": return { t: "pt", p: pointOp(n.name, n.args.map(val), n.name), free: false, inline: true };
    }
  }
  function asPt(v, what) {
    if (v && v.t === "pt") return v.p;
    if (Array.isArray(v) && v.length === 2 && v.every(Number.isFinite)) return v;
    throw perr("bad-args", `${what} must be a point`);
  }
  const asNum = (v, what) => { if (typeof v !== "number" || !Number.isFinite(v)) throw perr("bad-args", `${what} must be a number`); return v; };
  function pointOp(comp, a, id) {
    const names = POINT_OPS[comp];
    if (a.length !== names.length) throw perr("bad-args", `${SIGS[comp]} takes ${names.length} arguments, got ${a.length}`);
    let p;
    switch (comp) {
      case "Pt": p = [asNum(a[0], "x"), asNum(a[1], "y")]; break;
      case "Mid": p = mul(add(asPt(a[0], "A"), asPt(a[1], "B")), 0.5); break;
      case "Along": { const A = asPt(a[0], "A"), B = asPt(a[1], "B"); p = add(A, mul(sub(B, A), asNum(a[2], "t"))); break; }
      case "Off": p = add(asPt(a[0], "P"), [asNum(a[1], "dx"), asNum(a[2], "dy")]); break;
      case "Foot": {
        const P = asPt(a[0], "P"), A = asPt(a[1], "A"), B = asPt(a[2], "B"), d = sub(B, A), L2 = dot(d, d);
        if (L2 <= EPS) throw perr("undefined", `${id}: Foot onto a line whose two points coincide`);
        p = add(A, mul(d, dot(sub(P, A), d) / L2)); break;
      }
      case "Rot": { const O = asPt(a[0], "O"), P = asPt(a[1], "P"); p = add(O, rot(sub(P, O), asNum(a[2], "deg") * DEG)); break; }
      case "Meet": {
        const A = asPt(a[0], "A"), B = asPt(a[1], "B"), C = asPt(a[2], "C"), D = asPt(a[3], "D"), r = sub(B, A), s = sub(D, C), den = cross(r, s);
        if (Math.abs(den) <= 1e-9 * Math.max(1, len(r) * len(s))) throw perr("undefined", `${id}: Meet of parallel lines (AB and CD never cross): pick lines that cross`);
        p = add(A, mul(r, cross(sub(C, A), s) / den)); break;
      }
    }
    if (!finite(p)) throw perr("undefined", `${id}: ${comp} gives no finite point`);
    return p;
  }
  function named(st, a) {
    const c = st.comp, n = {};
    let i = 0;
    const optsAt = () => { const v = a[i]; if (v && typeof v === "object" && !Array.isArray(v) && !v.t) { i++; return v; } return {}; };
    if (c === "Seg") { n.A = a[i++]; n.B = a[i++]; n.opts = optsAt(); }
    else if (c === "Box") { n.C = a[i++]; n.w = a[i++]; n.h = a[i++]; n.deg = typeof a[i] === "number" ? a[i++] : 0; n.opts = optsAt(); }
    else if (c === "Poly") { n.pts = a[i++]; n.opts = optsAt(); }
    else if (c === "Circle") { n.O = a[i++]; n.r = a[i++]; n.opts = optsAt(); }
    else if (c === "Vec") { n.A = a[i++]; n.B = a[i++]; n.label = typeof a[i] === "string" || typeof a[i] === "number" ? String(a[i++]) : ""; n.opts = optsAt(); }
    else if (c === "Label") { n.P = a[i++]; n.text = a[i] != null ? String(a[i++]) : ""; n.opts = optsAt(); }
    else if (c === "Angle") { n.A = a[i++]; n.O = a[i++]; n.B = a[i++]; n.label = typeof a[i] === "string" || typeof a[i] === "number" ? String(a[i++]) : ""; n.opts = optsAt(); }
    else if (c === "Dim") { n.A = a[i++]; n.B = a[i++]; n.text = typeof a[i] === "string" || typeof a[i] === "number" ? String(a[i++]) : ""; n.opts = optsAt(); }
    else if (c === "Curve") { n.pts = a[i++]; n.opts = optsAt(); }
    if (i < a.length) throw perr("bad-args", `${SIGS[c]}: unexpected extra argument ${i + 1}`);
    const patch = S.patches.get(st.id);
    if (patch) for (const [k, v] of Object.entries(patch)) { if (OPT_KEYS.includes(k) && !FIX_TRAITS[c].includes(k)) n.opts = { ...n.opts, [k]: v }; else n[k] = v; }   // Box w is a trait, Curve w an option
    const u = meta().unionOf.get(st.id);       // a Union's kind / tone / shade / fill fill in what the member leaves out
    if (u) { const uo = { ...u.opts, ...(S.patches.get(u.id) || {}) }; for (const k of ["kind", "tone", "shade", "fill"]) if (uo[k] != null && n.opts[k] == null && !(k === "kind" && DECOR.has(c))) n.opts = { ...n.opts, [k]: uo[k] }; }
    return n;
  }
  function checkOpts(op, comp) {
    if ("layer" in op) throw perr("bad-args", "layer: was renamed: use shade: 1, 2 or 3 (Layer(...) is the step stack)");
    for (const k of Object.keys(op)) if (!OPT_KEYS.includes(k)) throw perr("bad-args", `unknown option "${k}" (known: ${OPT_KEYS.join(", ")})`);
    if (op.kind != null && !KINDS.includes(op.kind)) throw perr("bad-args", `kind must be one of ${KINDS.join(", ")}`);
    if (op.kind === "inside" && !op.in) throw perr("bad-args", `kind "inside" needs in: <container id>`);
    if (op.tone != null && !TONES.includes(op.tone)) throw perr("bad-args", `tone must be one of ${TONES.join(", ")} (palette hues only)`);
    if (op.shade != null && ![1, 2, 3].includes(op.shade)) throw perr("bad-args", "shade must be 1, 2 or 3");
    if (DECOR.has(comp) && op.kind && op.kind !== "overlay") throw perr("bad-args", `${comp} is decor: no kind but overlay`);
    if (comp !== "Curve") { const k = CURVE_KEYS.find(x => x in op); if (k) throw perr("bad-args", `${k} is a Curve option`); }
    if (op.legend != null && (typeof op.legend !== "string" || !op.legend.trim())) throw perr("bad-args", `legend is the object's name, a string: {legend: "elephant"}`);
  }
  function compute(st) {
    if (st.comp in POINT_OPS) {
      const a = st.args.map(val);
      const patch = S.patches.get(st.id);
      if (patch && st.comp === "Pt") { if ("x" in patch) a[0] = patch.x; if ("y" in patch) a[1] = patch.y; }
      return { t: "pt", id: st.id, p: pointOp(st.comp, a, st.id), free: st.comp === "Pt" };
    }
    if (st.comp === "Figure") return { t: "root", id: st.id };
    const n = named(st, st.args.map(val)), op = n.opts || {};
    checkOpts(op, st.comp);
    const kind = op.kind || (DECOR.has(st.comp) ? "decor" : "solid");
    const sh = { t: "shape", id: st.id, comp: st.comp, kind, opts: op, idx: st.idx, line: st.line, pass: st.pass };
    switch (st.comp) {
      case "Seg": { const A = asPt(n.A, "A"), B = asPt(n.B, "B"); if (len(sub(B, A)) <= EPS) throw perr("undefined", `${st.id}: Seg of zero length`); sh.geom = { a: A, b: B }; sh.col = wseg(st.id, A, B, 0); sh.bpts = [A, B]; break; }
      case "Box": {
        const C = asPt(n.C, "C"), w = asNum(n.w, "w"), h = asNum(n.h, "h"), deg = asNum(n.deg, "deg");
        if (w <= 0 || h <= 0) throw perr("bad-args", `${st.id}: Box needs w > 0 and h > 0`);
        sh.col = fcBox(st.id, C, w, h, deg); sh.geom = { c: C, w, h, deg, pts: sh.col.pts }; sh.bpts = sh.col.pts; break;
      }
      case "Poly": {
        if (!Array.isArray(n.pts) || n.pts.length < 3) throw perr("bad-args", `${st.id}: Poly needs a list of 3 or more points`);
        const pts = n.pts.map((p, i) => asPt(p, `point ${i + 1}`));
        if (Math.abs(signedArea(pts)) <= EPS) throw perr("undefined", `${st.id}: Poly has no area (points on one line)`);
        sh.col = fcPoly(st.id, pts);
        if (!isConvex(pts)) sh.col.pieces = triangulate(pts).map((t, i) => fcPoly(`${st.id}#${i}`, t));
        sh.geom = { pts }; sh.bpts = pts; break;
      }
      case "Circle": { const O = asPt(n.O, "O"), r = asNum(n.r, "r"); if (r <= 0) throw perr("bad-args", `${st.id}: Circle needs r > 0`); sh.col = fcCircle(st.id, O, r); sh.geom = { c: O, r }; sh.bpts = [add(O, [-r, -r]), add(O, [r, r])]; break; }
      case "Vec": { const A = asPt(n.A, "A"), B = asPt(n.B, "B"); if (len(sub(B, A)) <= EPS) throw perr("undefined", `${st.id}: Vec of zero length`); sh.geom = { a: A, b: B, label: n.label }; sh.bpts = [A, B]; break; }
      case "Label": sh.geom = { p: asPt(n.P, "P"), text: n.text }; sh.bpts = [sh.geom.p]; break;
      case "Angle": sh.geom = { a: asPt(n.A, "A"), o: asPt(n.O, "O"), b: asPt(n.B, "B"), label: n.label }; sh.bpts = [sh.geom.o]; break;
      case "Dim": { const A = asPt(n.A, "A"), B = asPt(n.B, "B"); if (len(sub(B, A)) <= EPS) throw perr("undefined", `${st.id}: Dim of zero length`); sh.geom = { a: A, b: B, text: n.text }; sh.bpts = [A, B]; break; }
      case "Curve": curveGeom(sh, n, op); break;
    }
    if (op.kind === "inside") {
      const c = S.vals.get(op.in);
      if (!c || c.t !== "shape" || !isArea(c)) throw perr("bad-args", `${st.id}: in: ${op.in} must name a Box, Poly, Circle or closed Curve defined before it is needed`);
    }
    return sh;
  }

  function curveGeom(sh, n, op) {
    const id = sh.id;
    if (!Array.isArray(n.pts) || n.pts.length < 2) throw perr("bad-args", `${id}: Curve needs a list of 2 or more points`);
    let P = n.pts.map((p, i) => asPt(p, `point ${i + 1}`));
    const closed = op.closed === true;
    if (op.mirror != null) {                     // half an outline + its mirror image across line PQ, joined at the axis
      if (!Array.isArray(op.mirror) || op.mirror.length !== 2) throw perr("bad-args", `${id}: mirror is a line of two points: {mirror: [P, Q]}`);
      const A = asPt(op.mirror[0], "mirror P"), B = asPt(op.mirror[1], "mirror Q");
      if (len(sub(B, A)) <= EPS) throw perr("undefined", `${id}: mirror line of zero length`);
      P = P.concat(P.map(p => reflectPt(p, A, B)).reverse());
    }
    P = dedupe(P, closed);
    if (P.length < (closed ? 3 : 2)) throw perr("bad-args", `${id}: ${closed ? "a closed Curve needs 3 or more distinct points" : "Curve needs 2 or more distinct points"}`);
    let w = op.w;
    if (w != null) {
      if (typeof w === "number") w = [w, w];
      if (!Array.isArray(w) || w.length !== 2 || !w.every(v => typeof v === "number" && Number.isFinite(v) && v >= 0) || Math.max(...w) <= 0) throw perr("bad-args", `${id}: w is a width (w: 0.3) or a taper [start, end] (w: [0.3, 0.05])`);
      if (closed) throw perr("bad-args", `${id}: w makes a stroke along an open curve; drop closed or w`);
    }
    const line = flattenCurve(P, closed), outline = closed ? line : w ? taper(line, w[0], w[1]) : null;
    if (outline) {
      if (outline.length >= 4 && selfCross(outline, true)) throw perr("self-cross", `${id}: the curve's outline crosses itself; move a point so it does not loop${w ? ", or make it thinner at the bend" : ""}`);
      if (outline.length < 3 || Math.abs(signedArea(outline)) <= EPS) throw perr("undefined", `${id}: the Curve has no area`);
      sh.col = fcPoly(id, outline);
      if (!isConvex(outline)) sh.col.pieces = triangulate(outline).map((t, i) => fcPoly(`${id}#${i}`, t));
      sh.geom = { pts: outline, line, ctrl: P, area: true, closed, w: w || null }; sh.bpts = outline;
    } else {
      if (selfCross(line, false)) throw perr("self-cross", `${id}: the curve crosses itself; move a point so it does not loop`);
      sh.col = { kind: "poly", id, pts: line, open: true, pieces: line.slice(1).map((p, i) => ({ kind: "poly", id: `${id}#${i}`, pts: [line[i], p] })) };
      sh.geom = { line, ctrl: P, area: false }; sh.bpts = line;
    }
  }

  // ── Layer + Union membership (parsed from the statements' own text: they name ids, they are not values) ──
  const idList = a => (a && a.t === "arr" && a.items.every(x => x.t === "ref" || x.t === "str") ? a.items.map(x => x.t === "ref" ? x.id : x.v) : a && (a.t === "ref" || a.t === "str") ? [a.id ?? a.v] : null);
  const litVal = v => (v.t === "ref" ? v.id : v.t === "num" || v.t === "str" || v.t === "bool" ? v.v : v.t === "null" ? null : undefined);
  function layerSpec(st) {
    const [first, opt] = st.args, out = { id: st.id, st, ids: idList(first) || [], hide: [], zoom: [], lit: [], title: "", err: null };
    const bad = `${st.id}: write ${LAYER_SIG}`;
    if (!idList(first) || st.args.length > 2 || (opt && opt.t !== "obj")) out.err = bad;
    else if (opt) for (const [k, v] of opt.entries) {
      if (k === "title") out.title = String(litVal(v) ?? "");
      else if (["hide", "zoom", "lit"].includes(k)) { const l = idList(v); if (!l) out.err = `${st.id}: ${k} is a list of ids: {${k}: [a, b]}`; else out[k] = l; }
      else out.err = `${st.id}: unknown Layer option "${k}" (known: hide, zoom, lit, title)`;
    }
    return out;
  }
  function unionSpec(st) {
    const [first, opt] = st.args, out = { id: st.id, st, members: idList(first) || [], opts: {}, err: null };
    if (!idList(first) || st.args.length > 2 || (opt && opt.t !== "obj")) out.err = `${st.id}: write Union([ids...], {kind, tone, shade, fill, label, legend})`;
    else if (opt) for (const [k, v] of opt.entries) {
      if (k === "layer") { out.err = `${st.id}: layer: was renamed: use shade: 1, 2 or 3 (Layer(...) is the step stack)`; continue; }
      if (!["kind", "tone", "shade", "fill", "label", "legend"].includes(k)) { out.err = `${st.id}: unknown Union option "${k}" (known: kind, tone, shade, fill, label, legend)`; continue; }
      out.opts[k] = litVal(v);
    }
    if (!out.err) try { checkOpts(out.opts, "Union"); } catch (e) { out.err = `${st.id}: ${e.message}`; }
    return out;
  }
  function meta() {
    if (metaCache) return metaCache;
    const unions = stmts.filter(s => s.comp === "Union").map(unionSpec), unionOf = new Map(), dupes = [];
    for (const u of unions) if (!u.err) for (const m of u.members) { if (unionOf.has(m)) dupes.push({ id: m, of: [unionOf.get(m).id, u.id] }); else unionOf.set(m, u); }
    const membersOf = id => { const u = unions.find(x => x.id === id && !x.err); return u ? u.members : null; };
    const expand = ids => ids.flatMap(id => membersOf(id) ? [id, ...membersOf(id)] : [id]);
    const layers = stmts.filter(s => s.comp === "Layer").map((st, i) => ({ ...layerSpec(st), k: i + 1 }));
    const L = new Map(), H = new Map(), ldupes = [];
    for (const d of layers) if (!d.err) for (const id of d.ids) { if (L.has(id)) { if (L.get(id) !== d.k && d.ids.includes(id)) ldupes.push({ id, ks: [L.get(id), d.k] }); } else L.set(id, d.k); }
    for (const s of stmts) {                     // unlisted: the nearest Layer above it in the same pass, else the prefix (0)
      if (L.has(s.id) || s.comp === "Layer") continue;
      let k = 0;
      for (const d of layers) if (d.st.idx < s.idx && d.st.pass === s.pass) k = d.k;
      L.set(s.id, k);
    }
    for (const d of layers) if (!d.err) for (const id of expand(d.hide)) if (!H.has(id) || H.get(id) > d.k) H.set(id, d.k);
    for (const d of layers) { d.zoomX = expand(d.zoom); d.litX = expand(d.lit); }
    metaCache = { unions, unionOf, dupes, layers, L, H, ldupes, expand };
    return metaCache;
  }
  const stepOf = id => meta().L.get(id) ?? 0, hiddenAt = id => meta().H.get(id) ?? Infinity;
  const coexist = (X, Y) => Math.max(stepOf(X.id), stepOf(Y.id)) < Math.min(hiddenAt(X.id), hiddenAt(Y.id));

  // ── checks: one pair (X later by index, Y earlier); returns a conflict {code, depth, mtv (moves X), hint} or null ──
  function headOf(v, tol) { const u = unit(sub(v.geom.b, v.geom.a)), hl = Math.min(4 * tol, 0.5 * len(sub(v.geom.b, v.geom.a))); return fcCircle(v.id + ":head", sub(v.geom.b, mul(u, hl / 2)), hl / 2); }
  function pair(X, Y, tol) {
    if (X.kind === "overlay" || Y.kind === "overlay") return null;
    if (["Label", "Angle", "Dim"].includes(X.comp) || ["Label", "Angle", "Dim"].includes(Y.comp)) return null;
    if (X.comp === "Vec" || Y.comp === "Vec") {
      const [v, b, sign] = X.comp === "Vec" ? [X, Y, 1] : [Y, X, -1];
      if (b.comp === "Vec" || !isArea(b) || b.kind === "surface") return null;
      if (inShape(v.geom.a, b.col, tol)) return null;                         // the body it starts in
      const r = hit(b.col, headOf(v, tol));
      if (!r || r.depth <= tol) return null;
      return { code: "vec-head", depth: r.depth, mtv: mul(r.normal, sign * r.depth), hint: sign > 0 ? `the head of ${v.id} ends inside ${b.id}: end it on ${b.id}'s edge (shorten or move its tip)` : `${b.id} covers the head of ${v.id}: move ${b.id} off the tip` };
    }
    if (X.kind === "inside" && X.opts.in === Y.id) return null;
    if (Y.kind === "inside" && Y.opts.in === X.id) return null;
    if (X.kind === "surface" && Y.kind === "surface") return null;
    if (X.kind === "surface" || Y.kind === "surface") {
      const [s, b, sign] = X.kind === "surface" ? [X, Y, -1] : [Y, X, 1];
      if (s.comp === "Seg") {
        if (isSeg(b.col)) return null;
        if (!hit(segPoly2(s.col), b.col)) return null;
        const gap = contactGap(b.col, fcSurface(s.id, s.geom.a, s.geom.b, outOf(s.geom.a, s.geom.b, b.col)), "world");
        if (-gap <= tol) return null;
        const out = outOf(s.geom.a, s.geom.b, b.col);
        return { code: "sunk", depth: -gap, mtv: mul(out, sign * -gap), body: b.id, surf: s.id };
      }
      const r = hit(s.col, b.col);
      if (!r || r.depth <= tol) return null;
      return { code: "sunk", depth: r.depth, mtv: mul(r.normal, sign * r.depth), body: b.id, surf: s.id };
    }
    const r = hit(Y.col, X.col);
    if (!r || r.depth <= tol) return null;
    return { code: "overlap", depth: r.depth, mtv: mul(r.normal, r.depth) };
  }
  function containment(X) {
    if (X.kind !== "inside") return null;
    const C = S.vals.get(X.opts.in), tol = tolNow();
    let worst = null;
    for (const p of shapePts(X.col || { kind: "poly", pts: X.bpts })) {
      let d, q;
      if (C.col.kind === "circle") { d = len(sub(p, C.col.c)) - C.col.r; q = add(C.col.c, mul(unit(sub(p, C.col.c)), C.col.r)); if (d <= 0) continue; }
      else { if (pointInPoly(p, C.col.pts)) continue; const b = boundaryDist(p, C.col.pts); d = b.d; q = b.q; }
      if (!worst || d > worst.d) worst = { d, mtv: sub(q, p) };
    }
    if (!worst || worst.d <= tol) return null;
    return { code: "escape", depth: worst.d, mtv: worst.mtv };
  }
  function hintFor(c, X, Y) {
    if (c.hint) return c.hint;
    if (c.code === "overlap") return `${X.id} overlaps ${Y.id}: move ${X.id} by ${fv(c.mtv)}, or give one of them {kind: "overlay"} if they may overlap`;
    if (c.code === "sunk") return `${c.body} sinks into surface ${c.surf}: ${X.id === c.body ? `lift ${X.id}` : `move ${X.id}`} by ${fv(c.mtv)} so it rests on it`;
    if (c.code === "escape") return `${X.id} pokes out of its container ${Y.id}: move it by ${fv(c.mtv)} or make it smaller`;
    return "";
  }
  function freeRootsOfShape(st) {
    // the shape's own point args, when every one is a direct ref to a free Pt (the mover moves only those)
    const pts = [];
    const args = st.comp === "Poly" ? (st.args[0]?.items || []) : st.args.slice(0, st.comp === "Seg" ? 2 : 1);
    for (const a of args) { if (a.t !== "ref") return null; const s = byId(a.id); if (!s || s.comp !== "Pt") return null; pts.push(a.id); }
    return pts;
  }
  function conflictsOf(X) {
    const tol = tolNow(), out = [];
    const cont = containment(X);
    if (cont) out.push({ ...cont, X, Y: S.vals.get(X.opts.in), ids: [X.id, X.opts.in] });
    for (const Y of shapesEval()) {
      if (Y.id === X.id || !coexist(X, Y)) continue;                         // never together in one step: no conflict
      const ux = meta().unionOf.get(X.id);
      if (ux && ux === meta().unionOf.get(Y.id)) continue;                     // parts of one Union never conflict with each other
      const [L, E] = X.idx > Y.idx ? [X, Y] : [Y, X];
      const c = pair(L, E, tol);
      if (c) out.push({ ...c, X: L, Y: E, ids: [L.id, E.id] });
    }
    return out;
  }
  function translateShape(sh, d) {
    const t = p => add(p, d), g = sh.geom, out = { ...sh, geom: { ...g } };
    if (g.pts) out.geom.pts = g.pts.map(t);
    if (g.line) out.geom.line = g.line.map(t);
    if (g.c) out.geom.c = t(g.c);
    if (g.a) out.geom.a = t(g.a);
    if (g.b) out.geom.b = t(g.b);
    if (g.p) out.geom.p = t(g.p);
    if (g.o) out.geom.o = t(g.o);
    return out;
  }
  function tryMover(st, X, conf) {
    const tol = tolNow();
    if (!o.mover || !conf.length || !["Seg", "Box", "Poly", "Circle"].includes(X.comp)) return false;
    if (conf.some(c => c.X !== X || c.code === "escape" || c.depth > 3 * tol)) return false;
    const roots = freeRootsOfShape(st);
    if (!roots || !roots.length) return false;
    for (const r of roots) for (const s of stmts) if (s.id !== st.id && s.deps.includes(r) && S.status.get(s.id) === "ok") return false;   // shared: moving it would move another shape
    const save = roots.map(r => [r, S.vals.get(r)]);
    let total = [0, 0], cur = X, left = conf;
    for (let k = 0; k < 6 && left.length; k++) {
      const deep = left.reduce((m, c) => (c.depth > m.depth ? c : m));
      const d = mul(unit(deep.mtv), deep.depth + 1e-6 * span());
      total = add(total, d);
      for (const r of roots) S.vals.set(r, { ...S.vals.get(r), p: add(S.vals.get(r).p, d) });
      cur = compute(st); S.vals.set(st.id, cur);
      left = conflictsOf(cur).filter(c => c.X === cur);
      if (left.some(c => c.depth > 3 * tol)) break;
    }
    if (left.length) { for (const [r, v] of save) S.vals.set(r, v); S.vals.set(st.id, X); return false; }
    S.moved.set(st.id, total);
    for (const c of conf) finding({ code: "auto-fixed", cls: "fyi", ids: c.ids, amount: c.depth, mtv: total, hint: `${c.code}: the mover nudged ${roots.join(", ")} by ${fv(total)} (within 3x tolerance)` });
    return true;
  }
  function check(st, X) {
    if (quiet) return;
    const conf = conflictsOf(X);
    if (tryMover(st, X, conf)) return;
    let deepest = null;
    for (const c of conf) {
      finding({ code: c.code, ids: c.ids, amount: c.depth, mtv: c.mtv, hint: hintFor(c, c.X, c.Y), line: c.X.line, pass: c.X.pass });
      if (!deepest || c.depth > deepest.depth || (deepest.X !== c.X && c.X === X)) deepest = c;
    }
    // one ghost per blamed shape: where it would need to go (the sum of its push vectors, deepest first, at most one per axis)
    const by = new Map();
    for (const c of conf) { const g = by.get(c.X.id) || { X: c.X, of: [], d: [0, 0] }; g.of.push(c.ids[1]); g.d = combine(g.d, c.mtv); by.set(c.X.id, g); }
    for (const g of by.values()) {
      if (!g.X.geom) continue;
      const prev = S.ghosts.findIndex(q => q.id === g.X.id);
      const ghost = ghostOf(translateShape(g.X, g.d), g.of, g.d);
      if (prev >= 0) S.ghosts[prev] = ghost; else S.ghosts.push(ghost);
      emit({ type: "ghost", ghost });
    }
  }
  function combine(d, m) {   // sum push vectors, but never double-count along the same direction
    const u = unit(m), along = dot(d, u);
    return along >= len(m) ? d : add(d, mul(u, len(m) - Math.max(0, along)));
  }

  // ── Kahn: evaluate everything whose deps are ready, lowest index first ──
  function rootCause(id) { return S.blockedBy.get(id) || id; }
  function block(st, by) {
    S.status.set(st.id, "blocked"); S.blockedBy.set(st.id, by);
    const root = S.findings.find(f => f.ids[0] === by && f.cls === "llm" && f.blocked);
    if (root && !root.blocked.includes(st.id)) root.blocked.push(st.id);
    emit({ type: "eval", id: st.id, status: "blocked", by });
  }
  function fail(st, e) {
    S.status.set(st.id, "error");
    finding({ code: e.code || "bad-args", ids: [st.id], hint: e.message, line: st.line, pass: st.pass, blocked: [] });
    emit({ type: "eval", id: st.id, status: "error" });
  }
  function settle() {
    let progress = true;
    while (progress) {
      progress = false;
      for (const st of stmts) {
        if (S.status.has(st.id) || META.has(st.comp)) continue;
        const bad = st.deps.find(d => ["error", "blocked"].includes(S.status.get(d)));
        if (bad) { block(st, rootCause(bad)); progress = true; continue; }
        if (!st.deps.every(d => S.status.get(d) === "ok")) continue;
        try {
          const v = compute(st);
          S.vals.set(st.id, v); S.status.set(st.id, "ok"); S.order.push(st.id);
          emit({ type: "eval", id: st.id, status: "ok" });
          if (v.t === "shape") check(st, v);
        } catch (e) { fail(st, e); }
        progress = true;
        break;                       // restart from the lowest index: precedence = statement index
      }
    }
  }
  function cycleFrom(start) {
    const pend = id => { const s = byId(id); return s && !S.status.has(id) && !META.has(s.comp); };
    const path = [], seen = new Set();
    function dfs(id) {
      if (path.includes(id)) return path.slice(path.indexOf(id)).concat(id);
      if (seen.has(id) || !pend(id)) return null;
      seen.add(id); path.push(id);
      for (const d of byId(id).deps) { const c = dfs(d); if (c) return c; }
      path.pop();
      return null;
    }
    return dfs(start);
  }
  function detectCycles() {
    for (const st of stmts) {
      if (S.status.has(st.id) || META.has(st.comp)) continue;
      const cyc = cycleFrom(st.id);
      if (!cyc) continue;
      const first = cyc.slice(0, -1).map(byId).sort((a, b) => a.idx - b.idx)[0];
      for (const id of cyc.slice(0, -1)) { S.status.set(id, "error"); emit({ type: "eval", id, status: "error" }); }
      finding({ code: "cycle", ids: cyc.slice(0, -1), hint: `dependency cycle ${cyc.join(" -> ")}: define one of them from a Pt or another point`, line: first.line, pass: first.pass, blocked: [] });
      for (const id of cyc.slice(1, -1)) S.blockedBy.set(id, cyc[0]);
      settle();
    }
  }

  // ── Fix (pass 2) ──
  function validateFix(st) {
    const [t, patch] = st.args;
    if (!t || t.t !== "ref" || !patch || patch.t !== "obj" || st.args.length !== 2) return perr("bad-args", `${st.id}: write Fix(target, {trait: value})`);
    const target = byId(t.id);
    if (!target || target.comp === "Fix" || target.comp === "Layer") return perr("undefined-ref", `${st.id}: Fix target ${t.id} is not defined`);
    if (target.comp in POINT_OPS && target.comp !== "Pt") {
      const roots = freeRoots(target.id);
      return perr("fix-derived", `${t.id} is derived (${target.comp}); a Fix may not move it. Fix its free source point${roots.length > 1 ? "s" : ""} instead (${roots.join(", ") || "none"}), or its shape params`);
    }
    if (target.comp === "Figure") return perr("bad-args", `${st.id}: Figure has no traits to fix`);
    const ok = [...FIX_TRAITS[target.comp], ...(target.comp === "Pt" ? [] : OPT_KEYS)];
    const obj = Object.fromEntries(patch.entries.map(([k, v]) => [k, v.t === "ref" ? v.id : val(v)]));
    const badKey = Object.keys(obj).find(k => !ok.includes(k));
    if (badKey) return perr("fix-trait", `${st.id}: ${target.comp} ${t.id} has no trait "${badKey}" a Fix may change (allowed: ${ok.join(", ")})`);
    if (!Object.keys(obj).length) return perr("fix-trait", `${st.id}: empty patch`);
    return { target: t.id, patch: obj };
  }
  function freeRoots(id, out = new Set(), seen = new Set()) {
    if (seen.has(id)) return [...out];
    seen.add(id);
    const s = byId(id);
    if (!s) return [...out];
    if (s.comp === "Pt") out.add(id); else for (const d of s.deps) freeRoots(d, out, seen);
    return [...out];
  }

  // ── rebuild: re-evaluate the whole program (after a Fix, a redefinition) ──
  function rebuild() {
    S = fresh();
    emit({ type: "reset" });
    for (const pf of parseFindings) { S.findings.push(pf); emit({ type: "finding", f: pf }); }
    const fixes = stmts.filter(s => s.comp === "Fix");
    applyFixes(fixes);
    const M = meta(), metaErr = [...M.layers, ...M.unions].filter(d => d.err);
    for (const d of [...M.layers, ...M.unions]) S.status.set(d.id, d.err ? "error" : "ok");
    settle(); detectCycles();
    for (const f of fixes) if (S.fixErr.has(f.id)) { const e = S.fixErr.get(f.id); finding({ code: e.code, ids: [f.id, f.args[0]?.id].filter(Boolean), hint: e.message, line: f.line, pass: f.pass }); emit({ type: "eval", id: f.id, status: "error" }); }
    for (const d of metaErr) { finding({ code: "bad-args", ids: [d.id], hint: d.err, line: d.st.line, pass: d.st.pass }); emit({ type: "eval", id: d.id, status: "error" }); }
  }
  function applyFixes(fixes) {
    for (const f of fixes) {
      const r = validateFix(f);
      if (r instanceof Error) { S.status.set(f.id, "error"); S.fixErr.set(f.id, r); continue; }
      S.patches.set(r.target, { ...(S.patches.get(r.target) || {}), ...r.patch });
      S.status.set(f.id, "ok");
    }
  }
  /** the shapes as they stand at step k: only the Fix patches of the prefix and layers 1..k apply (silent: no checks, no events) */
  function snapshot(k) {
    const keep = S, keepEv = events;
    S = fresh(); quiet = true;
    try {
      applyFixes(stmts.filter(s => s.comp === "Fix" && stepOf(s.id) <= k));
      for (const d of [...meta().layers, ...meta().unions]) S.status.set(d.id, d.err ? "error" : "ok");
      settle(); detectCycles();
      return shapesEval();
    } finally { S = keep; events = keepEv; quiet = false; }
  }

  function addText(text, line, pass) {
    let p;
    try { p = parseStatement(text); }
    catch (e) {
      const id = /^\s*([A-Za-z_]\w*)\s*=/.exec(text)?.[1] || `line${line}`;
      const f = { code: e.code || "parse", cls: "llm", ids: [id], amount: null, mtv: null, hint: `${e.message}: ${text.slice(0, 60)}`, line, pass };
      assignFid(f);
      parseFindings.push(f); S.findings.push(f); emit({ type: "finding", f });
      return;
    }
    const st = { ...p, line, pass, text };
    const old = byId(st.id);
    metaCache = null;
    emit({ type: "stmt", id: st.id, comp: st.comp, line, pass });
    if (old) {
      if (pass === 2 && st.comp !== "Fix") {
        parseFindings.push(finding({ code: "redefine", ids: [st.id], hint: `${st.id} is already defined; pass 2 may not redefine or delete: use ${st.id}fix = Fix(${st.id}, {trait: value}), or rewrite pass 1`, line, pass }));
        return;
      }
      stmts = stmts.filter(s => s !== old);
      st.idx = stmts.length; stmts.push(st);
      stmts.forEach((s, i) => (s.idx = i));
      rebuild();
      parseFindings.push(finding({ code: "redefined", cls: "fyi", ids: [st.id], hint: `${st.id} was defined twice; the last definition wins`, line, pass }));
      return;
    }
    st.idx = stmts.length; stmts.push(st);
    // a line that failed to parse defined nothing: a later statement with that id repairs it (pass 2 included); drop the stale parse finding
    const stale = parseFindings.filter(f => ["parse", "unknown-comp", "bad-args"].includes(f.code) && f.ids[0] === st.id);
    if (stale.length) { parseFindings = parseFindings.filter(f => !stale.includes(f)); rebuild(); return; }
    if (META.has(st.comp)) { rebuild(); return; }            // a Fix patches, a Layer / Union regroups: re-check everything
    settle(); detectCycles();
  }

  // ── public ──
  function push(chunk, pass = 1) {
    events = [];
    bufs[pass] += chunk;
    const { done, plans, rest, restLines } = splitDone(bufs[pass]);
    if (pass === 1) for (const p of plans) { plan[p.key] = planValue(p.key, p.text); (plan.lines ||= {})[p.key] = lineBase[pass] + p.line; emit({ type: "plan", key: p.key, line: lineBase[pass] + p.line }); }
    for (const d of done) addText(d.text, lineBase[pass] + d.line, pass);
    lineBase[pass] += restLines; bufs[pass] = rest;
    return events;
  }
  function end(pass = 1) {
    const ev = push("\n", pass);
    if (pass === 1) ended1 = true;
    return ev;
  }
  /** the plan as data ({goal, anchor, layers, budget}, null when no plan line came) + its fyi checks against what was drawn */
  function planOut() {
    if (!plan.lines) return null;
    return { goal: plan.goal ?? null, anchor: plan.anchor ?? null, layers: plan.layers ?? null, budget: plan.budget ?? null };
  }
  function planFindings() {
    const out = [], n1 = stmts.filter(s => s.pass === 1).length, nL = meta().layers.length, p = planOut();
    const F = (code, line, hint) => out.push({ code, cls: "fyi", ids: [], amount: null, mtv: null, hint: `${hint} (no action needed)`, line, pass: 1 });
    if (!p) { if (ended1 && n1) F("plan-missing", null, "no plan lines: start a figure with // goal, // anchor, // layers, // budget"); return out; }
    if (ended1 && p.layers && p.layers.length !== nL) F("plan-layers", plan.lines.layers, `the plan declares ${p.layers.length} layer${p.layers.length === 1 ? "" : "s"}, the program draws ${nL} Layer statement${nL === 1 ? "" : "s"}`);
    if (p.budget != null && n1 > p.budget) F("plan-budget", plan.lines.budget, `${n1} statements, over the plan's budget of ${p.budget}`);
    return out;
  }
  /** pending at the time of asking: undefined refs (root reported once, dependents listed) */
  function pendingFindings() {
    const out = [], missing = new Map();
    for (const st of stmts) {
      if (S.status.has(st.id) || META.has(st.comp)) continue;
      for (const d of st.deps) if (!byId(d)) { if (!missing.has(d)) missing.set(d, { st, blocked: [] }); }
    }
    const blockedBy = id => { const st = byId(id); if (!st) return id; for (const d of st.deps) { if (!byId(d)) return d; if (!S.status.has(d)) { const r = blockedBy(d); if (r) return r; } } return null; };
    for (const st of stmts) {
      if (S.status.has(st.id) || META.has(st.comp)) continue;
      const r = blockedBy(st.id);
      if (r && missing.has(r) && missing.get(r).st !== st) missing.get(r).blocked.push(st.id);
    }
    for (const [id, m] of missing) out.push({ code: "undefined-ref", cls: "llm", ids: [m.st.id, id], amount: null, mtv: null, hint: `${m.st.id} uses ${id}, which is never defined${m.blocked.length ? `; blocked by it: ${m.blocked.join(", ")}` : ""}`, line: m.st.line, pass: m.st.pass, blocked: m.blocked });
    return out;
  }
  /** Layer / Union references: undefined ids, non-shape members, hide / zoom / lit of a shape the step does not show */
  function metaFindings() {
    const M = meta(), out = [], isShape = id => { const v = S.vals.get(id); return v && v.t === "shape"; };
    const F = (code, cls, d, ids, hint) => out.push({ code, cls, ids, amount: null, mtv: null, hint: cls === "fyi" ? `${hint} (no action needed)` : hint, line: d.st.line, pass: d.st.pass });
    const verb = { ids: "lists", members: "lists", hide: "hides", zoom: "zooms on", lit: "lights" };
    for (const d of [...M.layers, ...M.unions]) {
      if (d.err) continue;
      const lists = d.members ? [["members", d.members]] : [["ids", d.ids], ["hide", d.hide], ["zoom", d.zoom], ["lit", d.lit]];
      for (const [k, l] of lists) for (const id of l) if (!byId(id)) F("undefined-ref", "llm", d, [d.id, id], `${d.id} ${verb[k]} ${id}, which is never defined`);
    }
    for (const u of M.unions) if (!u.err) for (const m of u.members) { const st = byId(m); if (st && (st.comp in POINT_OPS || META.has(st.comp) || st.comp === "Figure")) F("bad-args", "llm", u, [u.id, m], `${u.id}: ${m} is not a shape; a Union groups shapes`); }
    for (const d of M.layers) if (!d.err) for (const k of ["hide", "zoom", "lit"]) for (const id of d[k]) {
      if (!byId(id)) continue;
      const parts = M.expand([id]).filter(isShape);
      if (!parts.length) continue;
      const shown = parts.some(m => k === "hide" ? stepOf(m) < d.k : stepOf(m) <= d.k && hiddenAt(m) > d.k);
      if (!shown) F("layer-ref", "llm", d, [d.id, id], `${d.id} ${verb[k]} ${id}, which is not shown ${k === "hide" ? "before" : "in"} step ${d.k} (it joins in step ${stepOf(parts[0])}${hiddenAt(parts[0]) < Infinity ? `, hidden from step ${hiddenAt(parts[0])}` : ""})`);
    }
    for (const d of M.layers) if (d.k > MAX_LAYERS) F("too-many-layers", "llm", d, [d.id], `${d.id} is layer ${d.k}; at most ${MAX_LAYERS} layers: merge steps (one layer = one reasoning step), keep algebra in the text`);
    for (const x of M.ldupes) F("layer-dup", "fyi", M.layers[x.ks[1] - 1], [x.id], `${x.id} is listed in steps ${x.ks.join(" and ")}; it joins in step ${x.ks[0]}`);
    for (const x of M.dupes) F("union-dup", "fyi", M.unions.find(u => u.id === x.of[1]), [x.id, ...x.of], `${x.id} is in two Unions (${x.of.join(", ")}); it belongs to ${x.of[0]}`);
    return out;
  }
  // ── Shush: the drawer accepts one warning, with a reason; errors are never shushable ──
  function shushSpec(st) {
    const [t, r] = st.args, out = { id: st.id, st, fid: null, reason: null, err: null };
    if (st.args.length !== 2 || !t || t.t !== "ref") { out.err = `${st.id}: write ${SIGS.Shush}`; return out; }
    out.fid = t.id;
    if (!r || r.t !== "str") { out.err = `${st.id}: the reason must be a string of at least 15 characters after trimming`; return out; }
    out.reason = r.v;
    if (out.reason.trim().length < 15) { out.err = `${st.id}: the reason must be at least 15 characters after trimming (a warning can be forgiven, never an error)`; return out; }
    return out;
  }
  /** apply the Shush statements to the final findings: a warning moves to `shushed`, an error stays + a shush-error finding */
  function applyShush(base) {
    const all = base.slice(), byFid = new Map(), shushed = [], gone = new Set();
    const index = () => { for (const f of all) { assignFid(f); if (!byFid.has(f.fid)) byFid.set(f.fid, f); } };
    index();
    for (const st of stmts.filter(s => s.comp === "Shush")) {
      const spec = shushSpec(st);
      let err = null;
      if (spec.err) err = { code: "bad-args", hint: spec.err };
      else {
        const target = byFid.get(spec.fid);
        if (!target) err = { code: "undefined-ref", hint: `${st.id}: Shush target ${spec.fid} is not a finding in this session` };
        else if (target.sev === "error") err = { code: "shush-error", hint: `errors cannot be shushed: fix ${spec.fid}` };
        else if (gone.has(spec.fid)) { S.status.set(st.id, "ok"); continue; }   // a second Shush of one warning: the first reason wins
        else { gone.add(spec.fid); shushed.push({ fid: spec.fid, reason: spec.reason.trim(), finding: target }); S.status.set(st.id, "ok"); continue; }
      }
      const f = { code: err.code, cls: "llm", ids: [st.id], amount: null, mtv: null, hint: err.hint, line: st.line, pass: st.pass };
      assignFid(f); all.push(f); byFid.set(f.fid, f);
      S.status.set(st.id, "error");
    }
    const findings = all.filter(f => !gone.has(f.fid));
    findings.sort((a, b) => (a.pass - b.pass) || ((a.line ?? 1e9) - (b.line ?? 1e9)));
    return { findings, shushed };
  }
  // ─── T2 / Slice 0.5 item 2: the answer-leak check (ported from views_gate._leak + livefig.nums/_eq/_sig3) ───
  function leakFindings() {
    if (o.givens === undefined && o.answers === undefined) return [];   // no givens / answers: nothing changes
    const givens = Array.isArray(o.givens) ? o.givens : [], answers = Array.isArray(o.answers) ? o.answers : [];
    const eq = (a, b) => Math.abs(a - b) <= 1e-9 * Math.max(1.0, Math.abs(b));   // livefig._eq
    const sig3 = (a, b) => (b !== 0 && Math.abs(a - b) <= 0.5 * Math.pow(10, Math.floor(Math.log10(Math.abs(b))) - 2) * (1 + 1e-9)) || (a === b && b === 0);   // livefig._sig3
    const SLOT = /^\$t\.[a-z][a-z0-9_]{0,31}$/;               // oui.slot_id: a "$t.id" slot is not words
    const NUM = /\d+(?:\.\d+)?(?:[eE][-+]?\d+)?/g;            // livefig.NUM_RE
    const out = [];
    const test = (text, st) => {
      if (text == null || text === "" || SLOT.test(text)) return;
      const bare = String(text).replace(/_{[^}]*}|_\w/g, "");   // a subscript names a quantity (R_1, v_{0}), never a number
      for (const m of bare.matchAll(NUM)) {
        const x = Number(m[0]);
        if (!Number.isFinite(x) || Math.abs(x) > 1e4) continue;  // livefig.GEOM_MAX: this check fires only leak / not-given
        const base = { ids: [st.id], amount: null, mtv: null, line: st.line, pass: st.pass };
        if (answers.some(a => sig3(Math.abs(x), a))) out.push({ ...base, code: "leak", cls: "llm", hint: `"${text}" shows ${x}, the answer: write a symbol instead` });
        else if (!givens.some(g => eq(Math.abs(x), g))) out.push({ ...base, code: "not-given", cls: "fyi", hint: `"${text}" shows ${x}, which is not a given` });
      }
    };
    for (const sh of shapesEval()) {                          // Label text, Vec / Angle label, Dim text, label: / legend:
      const g = sh.geom;
      if (sh.comp === "Label") test(g.text, sh);
      else if (sh.comp === "Vec" || sh.comp === "Angle") test(g.label, sh);
      else if (sh.comp === "Dim") test(g.text, sh);
      else if (sh.opts.label != null && sh.opts.label !== "") test(sh.opts.label, sh);
      if (sh.opts.legend) test(sh.opts.legend, sh);
    }
    const M = meta();
    for (const u of M.unions) if (!u.err) {                   // a Union's label / legend (with its Fix patches)
      const uo = { ...u.opts, ...(S.patches.get(u.id) || {}) };
      if (uo.label != null && uo.label !== "") test(uo.label, u.st);
      if (uo.legend) test(uo.legend, u.st);
    }
    for (const d of M.layers) if (!d.err && d.title) test(d.title, d.st);   // Layer title (the engine's "Step k" default is not author text)
    return out;
  }
  function result(opt = {}) {
    const W = opt.W || o.W, M = meta();
    const shapes = shapesEval().sort((a, b) => a.idx - b.idx);
    const points = Object.fromEntries([...S.vals].filter(([, v]) => v.t === "pt").map(([k, v]) => [k, rv(v.p)]));
    const unions = M.unions.filter(u => !u.err).map(u => ({ id: u.id, members: u.members.filter(m => S.vals.get(m)?.t === "shape"), opts: { ...u.opts, ...(S.patches.get(u.id) || {}) } }));
    const pub = s => ({ id: s.id, comp: s.comp, kind: s.kind, opts: s.opts, geom: s.geom, idx: s.idx, line: s.line, pass: s.pass, moved: S.moved.has(s.id) ? rv(S.moved.get(s.id)) : undefined });
    let lay, steps = null;
    if (!M.layers.length) lay = layoutView(shapes, S.ghosts, W, { unions });
    else {
      // stacked steps: step 0 = the prefix, step k = prefix + layers 1..k minus what layers <= k hide; one camera unless a step zooms
      const n = M.layers.length, maxFix = Math.max(0, ...stmts.filter(s => s.comp === "Fix").map(s => stepOf(s.id)));
      const cam = layoutView(shapes, S.ghosts, W, { unions, camOnly: true }).view;
      steps = [];
      for (let k = 0; k <= n; k++) {
        const all = k < maxFix ? snapshot(k).sort((a, b) => a.idx - b.idx) : shapes;
        const vis = all.filter(s => stepOf(s.id) <= k && k < hiddenAt(s.id)), d = k ? M.layers[k - 1] : null;
        const zoom = d ? d.zoomX.filter(id => vis.some(s => s.id === id)) : [];
        const later = shapes.filter(s => stepOf(s.id) > k && hiddenAt(s.id) > stepOf(s.id));
        const l = layoutView(vis, S.ghosts, W, { later, unions: unions.filter(u => stepOf(u.id) <= k), view: zoom.length ? zoomView(vis.filter(s => zoom.includes(s.id)), cam) : cam });
        steps.push({ k, id: d ? d.id : null, title: d ? d.title || `Step ${k}` : "Blueprint", show: vis.map(s => s.id), lit: d && d.litX.length ? d.litX : null, zoom: zoom.length ? zoom : null, view: l.view, labels: l.labels, dims: l.dims, legend: l.legend, fyi: l.fyi, shapes: vis.map(pub) });
      }
      const legH = Math.max(...steps.map(s => s.view.H - s.view.drawH));   // one figure height for every step (no jump on Next)
      for (const st of steps) st.view.H = st.view.drawH + legH;
      const seen = new Set(), fyi = [];
      for (const st of steps) for (const f of st.fyi) { const key = f.ids.join() + "|" + f.hint; if (!seen.has(key)) { seen.add(key); fyi.push(f); } }
      lay = { ...steps[n], fyi };
    }
    const base = [...S.findings, ...pendingFindings(), ...metaFindings(), ...lay.fyi, ...planFindings(), ...leakFindings()].map((f, i) => [f, i]).sort(([a, i], [b, j]) => (a.pass - b.pass) || ((a.line ?? 1e9) - (b.line ?? 1e9)) || (i - j)).map(([f]) => f);
    for (const f of base) assignFid(f);
    const { findings, shushed } = stmts.some(s => s.comp === "Shush") ? applyShush(base) : { findings: base, shushed: [] };
    const status = Object.fromEntries(stmts.map(s => [s.id, S.status.get(s.id) || "pending"]));
    return {
      plan: planOut(), points, findings, unresolved: findings, shushed, ghosts: S.ghosts, labels: lay.labels, dims: lay.dims, legend: lay.legend, view: lay.view, tol: r3(tolNow()), span: r3(span()), status,
      shapes: shapes.map(pub), unions, steps,
      stmts: stmts.map(s => ({ id: s.id, comp: s.comp, line: s.line, pass: s.pass, deps: s.deps, step: M.layers.length ? stepOf(s.id) : undefined })),
      // raw-coordinate points: a HINT for the LLM (derive points instead), never an error
      free: { named: stmts.filter(s => s.comp === "Pt").map(s => s.id), inline: stmts.reduce((n, s) => n + (s.inlinePts || 0), 0) },
    };
  }
  return { push, end, result, get options() { return o; } };
}

/** one call: the whole program (a string = pass 1, or {pass1, pass2}) -> {points, shapes, findings, ghosts, labels, view, ...} */
export function evaluate(src, opts = {}) {
  const s = createSession(opts);
  const p1 = typeof src === "string" ? src : src.pass1 || "", p2 = typeof src === "string" ? "" : src.pass2 || "";
  s.push(p1, 1); s.end(1);
  if (p2) { s.push(p2, 2); s.end(2); }
  return s.result();
}

// ─── ghosts as data (text-first feedback: the LLM reads where a shape must go) ───
function paramsOf(sh) {
  const g = sh.geom;
  if (sh.comp === "Box") return { centre: rv(g.c), w: r3(g.w), h: r3(g.h), deg: r3(g.deg) };
  if (sh.comp === "Circle") return { centre: rv(g.c), r: r3(g.r) };
  if (sh.comp === "Poly") return { centre: rv(centroid({ kind: "poly", pts: g.pts })), pts: g.pts.map(rv) };
  if (g.pts) return { centre: rv(centroid({ kind: "poly", pts: g.pts })) };
  if (g.line) return { centre: rv(centroid({ kind: "poly", pts: g.line })) };
  if (g.a && g.b) return { from: rv(g.a), to: rv(g.b) };
  return {};
}
function ghostOf(moved, of, d) {
  return { id: moved.id, of, comp: moved.comp, mtv: rv(d), target: paramsOf(moved), geom: moved.geom };
}
/** a ghost as one text line: `blk: move by (+0, +0.03) -> centre (1.2, 0.83)` */
export function ghostLine(g) {
  const t = g.target, where = t.centre ? `centre ${fp(t.centre)}` : t.from ? `from ${fp(t.from)} to ${fp(t.to)}` : "";
  return `${g.id}: move by ${fv(g.mtv)} -> ${where}${t.w != null ? ` (w ${t.w}, h ${t.h}, deg ${t.deg})` : t.r != null ? ` (r ${t.r})` : ""}; clears ${g.of.join(", ")}`;
}

// ─── the scene summary: one line per shape (id, kind, centre, size, angle, touching / overlapping neighbours) ───
export function sceneSummary(res) {
  const shapes = res.shapes, tol = res.tol, lines = [];
  const colOf = s => s.comp === "Box" ? fcBox(s.id, s.geom.c, s.geom.w, s.geom.h, s.geom.deg) : s.comp === "Circle" ? fcCircle(s.id, s.geom.c, s.geom.r) : s.comp === "Poly" || (s.comp === "Curve" && s.geom.area) ? polyCol(s) : s.comp === "Curve" ? { kind: "poly", id: s.id, pts: s.geom.line, open: true, pieces: s.geom.line.slice(1).map((p, i) => ({ kind: "poly", id: s.id, pts: [s.geom.line[i], p] })) } : s.comp === "Seg" ? wseg(s.id, s.geom.a, s.geom.b, 0) : null;
  const unionOf = new Map(); for (const u of res.unions || []) for (const m of u.members) unionOf.set(m, u.id);
  const stepOf = new Map((res.stmts || []).map(x => [x.id, x.step]));
  const together = (a, b) => !res.steps || res.steps.some(st => st.show.includes(a) && st.show.includes(b));   // shapes of different steps never meet
  const cols = new Map(shapes.map(s => [s.id, colOf(s)]));
  for (const s of shapes) {
    const g = s.geom, c = cols.get(s.id);
    let desc;
    if (s.comp === "Box") desc = `centre ${fp(g.c)} size ${r3(g.w)}x${r3(g.h)} angle ${r3(g.deg)}°`;
    else if (s.comp === "Circle") desc = `centre ${fp(g.c)} r ${r3(g.r)}`;
    else if (s.comp === "Poly") { const b = bboxOf(g.pts); desc = `centre ${fp(centroid({ kind: "poly", pts: g.pts }))} bbox ${r3(b.x1 - b.x0)}x${r3(b.y1 - b.y0)} pts ${g.pts.length}`; }
    else if (s.comp === "Seg" || s.comp === "Vec") desc = `${fp(g.a)} -> ${fp(g.b)} length ${r3(len(sub(g.b, g.a)))} angle ${r3(Math.atan2(g.b[1] - g.a[1], g.b[0] - g.a[0]) / DEG)}°${g.label ? ` "${g.label}"` : ""}`;
    else if (s.comp === "Label") desc = `at ${fp(g.p)} "${g.text}"`;
    else if (s.comp === "Angle") desc = `at ${fp(g.o)} "${g.label}" ${r3(angleBetween(g.a, g.o, g.b))}°`;
    else if (s.comp === "Dim") desc = `${fp(g.a)} <-> ${fp(g.b)} length ${r3(len(sub(g.b, g.a)))} "${g.text}"`;
    else if (s.comp === "Curve") { const P = g.pts || g.line, b = bboxOf(P); desc = `${g.closed ? "closed" : g.w ? "stroke" : "open"} through ${g.ctrl.length} points, centre ${fp(centroid({ kind: "poly", pts: P }))} bbox ${r3(b.x1 - b.x0)}x${r3(b.y1 - b.y0)}`; }
    const touch = [], over = [];
    if (c) for (const t of shapes) {
      if (t.id === s.id) continue;
      const d = cols.get(t.id);
      if (!d || (isSeg(c) && isSeg(d)) || (unionOf.has(s.id) && unionOf.get(s.id) === unionOf.get(t.id)) || !together(s.id, t.id)) continue;
      const r = hit(c, d);
      if (r && r.depth > tol) over.push(`${t.id} by ${r3(r.depth)}`);
      else if (r || gapOf(c, d) <= tol) touch.push(t.id);
    }
    lines.push(`${s.id} ${s.comp} ${s.kind}${s.opts.in ? ` in ${s.opts.in}` : ""}${unionOf.has(s.id) ? ` (part of ${unionOf.get(s.id)})` : ""}${stepOf.get(s.id) != null ? ` [step ${stepOf.get(s.id)}]` : ""}: ${desc}${touch.length ? `; touches ${touch.join(", ")}` : ""}${over.length ? `; OVERLAPS ${over.join(", ")}` : ""}`);
  }
  return lines.join("\n");
}
/** the legend as text for the LLM: what the renderer put under the drawing (asked with legend, or moved for lack of room) */
/** the plan as text for a review: the // lines read back, with the drawn layer + statement counts */
export function planLines(res) {
  const p = res.plan;
  if (!p) return "Plan: none (a figure starts with // goal, // anchor, // layers, // budget).";
  const nL = res.steps ? res.steps.length - 1 : 0, n1 = (res.stmts || []).filter(s => s.pass === 1).length;
  return ["Plan (the // lines):", `- goal: ${p.goal ?? "(none)"}`, `- anchor: ${p.anchor ?? "(none)"}`,
    `- layers: ${p.layers ? `${p.layers.length} declared${p.layers.some(Boolean) ? ` (${p.layers.map((x, i) => `${i + 1} ${x}`).join(", ")})` : ""}` : "(none)"}; ${nL} drawn`,
    `- budget: ${p.budget ?? "(none)"}; ${n1} statements used`].join("\n");
}
export function legendLines(res) {
  if (!res.legend || !res.legend.length) return "Legend: (empty)";
  return ["Legend (under the drawing, each beside a small render of its object):", ...res.legend.map(e => `- ${e.id}: "${e.text}"${e.auto ? ` (moved: the label of ${e.of} had no room by its anchor)` : " (asked with legend)"}`)].join("\n");
}
/** the steps as text: what each Layer adds, hides, zooms on and lights */
export function stepLines(res) {
  if (!res.steps) return "";
  return ["Steps (stacked layers; step 0 = the prefix):", ...res.steps.map((st, i) => { const prev = i ? new Set(res.steps[i - 1].show) : new Set(); const add = st.show.filter(id => !prev.has(id)), gone = [...prev].filter(id => !st.show.includes(id)); return `- step ${st.k}${st.id ? ` ${st.id}` : ""} "${st.title}": ${i ? `adds ${add.join(", ") || "nothing"}` : `shows ${st.show.join(", ")}`}${(res.stmts || []).some(x => x.comp === "Fix" && x.step === st.k && i) ? `; restyles with ${res.stmts.filter(x => x.comp === "Fix" && x.step === st.k).map(x => x.id).join(", ")}` : ""}${gone.length ? `; hides ${gone.join(", ")}` : ""}${st.zoom ? `; zoom ${st.zoom.join(", ")}` : ""}${st.lit ? `; lit ${st.lit.join(", ")}` : ""}`; })].join("\n");
}
function polyCol(s) { const c = fcPoly(s.id, s.geom.pts); if (!isConvex(s.geom.pts)) c.pieces = triangulate(s.geom.pts).map((t, i) => fcPoly(`${s.id}#${i}`, t)); return c; }
function angleBetween(a, o, b) { const u = sub(a, o), v = sub(b, o); return Math.abs(Math.atan2(cross(u, v), dot(u, v))) / DEG; }
function gapOf(A, B) {   // the smallest vertex-to-shape distance either way (touching test for the summary)
  let best = Infinity;
  const dist = (p, S) => S.kind === "circle" ? Math.abs(len(sub(p, S.c)) - S.r) : boundaryDist(p, S.pts.length === 2 ? [S.pts[0], S.pts[1]] : S.pts).d;
  for (const p of shapePts(A)) best = Math.min(best, dist(p, B));
  for (const p of shapePts(B)) best = Math.min(best, dist(p, A));
  return best;
}

/** the findings as text for the LLM: llm-class first (act on these), then fyi (no action needed) */
/** the free-point hint (SolidWorks/FreeCAD-style DOF count): how many raw-coordinate points the program has; a nudge, not an error */
export function freePointsHint(res) {
  const n = res.free.named.length + res.free.inline;
  return `Hint (not an error): ${n} free point${n === 1 ? "" : "s"} with raw coordinates${res.free.named.length ? ` (${res.free.named.join(", ")}${res.free.inline ? ` + ${res.free.inline} inline Pt` : ""})` : res.free.inline ? ` (${res.free.inline} inline Pt)` : ""}. Fewer is better: derive points from others (Mid, Along, Off, Foot, Rot, Meet) so they move together.`;
}
export function formatFindings(findings, shushed = []) {
  const one = f => `${f.fid ? `${f.fid} ` : "- "}[${f.cls}] ${f.code} ids=[${f.ids.join(", ")}] ${f.pass === 2 ? "pass2 " : ""}line ${f.line ?? "?"}${f.amount != null ? ` amount ${f.amount}` : ""}${f.mtv ? ` push ${fv(f.mtv)}` : ""}: ${f.hint}${f.blocked && f.blocked.length && !/blocked by it/.test(f.hint) ? ` (blocks: ${f.blocked.join(", ")})` : ""}`;
  const llm = findings.filter(f => f.cls === "llm"), fyi = findings.filter(f => f.cls !== "llm");
  return [llm.length ? "Fix these:" : "No spatial errors.", ...llm.map(one), ...(fyi.length ? ["FYI (no action needed):", ...fyi.map(one)] : []), ...(shushed.length ? ["Shushed:", ...shushed.map(s => `- ${s.fid}: ${s.reason}`)] : [])].join("\n");
}

// ─── view + label layout (screen px, y down). Every label sits INSIDE its anchor or RIGHT NEXT to it without crossing a stroke, a
// filled body or another label; else it goes to the LEGEND row under the drawing, beside a small render of its anchor (no leader
// lines). Dim(A, B, text) places a dimension line beside AB on the outside, then the other side, then further out. Statement order wins. ───
const LH = 18, CH = 7.6, TILE = 28, LROW = 34;
const textW = t => Math.max(10, [...String(t)].length * CH);
const ARC_R = [[24, 38], [24, 48], [36, 56], [52, 72], [68, 88], [84, 104], [100, 122], [118, 142]];   // Angle: [arc radius, label distance] in px
const DIRS8 = [[0, -1], [1, 0], [0, 1], [-1, 0], [1, -1], [-1, -1], [1, 1], [-1, 1]];   // screen: n e s w ne nw se sw
function circlePts(c, r, n = 28) { return Array.from({ length: n }, (_, i) => add(c, rot([r, 0], (i * 2 * Math.PI) / n))); }
function worldPts(shapes, ghosts = []) {
  const pts = [];
  for (const s of shapes) {
    const g = s.geom;
    if (g.pts) pts.push(...g.pts);
    if (g.line) pts.push(...g.line);
    if (g.c && g.r != null) pts.push(add(g.c, [-g.r, -g.r]), add(g.c, [g.r, g.r])); else if (g.c) pts.push(g.c);
    for (const k of ["a", "b", "p", "o"]) if (g[k]) pts.push(g[k]);
  }
  for (const gh of ghosts) { for (const k of ["a", "b", "c"]) if (gh.geom[k]) pts.push(gh.geom[k]); if (gh.geom.pts) pts.push(...gh.geom.pts); if (gh.geom.line) pts.push(...gh.geom.line); }
  return pts;
}
function fitView(b, W, pad) {
  const bw = Math.max(b.x1 - b.x0, EPS), bh = Math.max(b.y1 - b.y0, EPS), maxH = 420;
  let s = Math.min((W - 2 * pad) / bw, (maxH - 2 * pad) / bh);
  if (!Number.isFinite(s) || s <= 0) s = 1;
  const H = Math.max(180, Math.round(bh * s + 2 * pad));
  return { W, H, drawH: H, s, x0: b.x0, y0: b.y0, ox: (W - bw * s) / 2, oy: (H - bh * s) / 2 };
}
/** a step's camera on the zoom shapes: same canvas as the base camera, at most 2.5x closer */
function zoomView(shapes, cam) {
  const b = bboxOf(worldPts(shapes)), m = 0.2 * Math.max(b.x1 - b.x0, b.y1 - b.y0, EPS), pad = 30;
  const bw = b.x1 - b.x0 + 2 * m, bh = b.y1 - b.y0 + 2 * m;
  const s = Math.min((cam.W - 2 * pad) / bw, (cam.drawH - 2 * pad) / bh, 2.5 * cam.s), cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
  return { W: cam.W, H: cam.drawH, drawH: cam.drawH, s, x0: cx - cam.W / 2 / s, y0: cy - cam.drawH / 2 / s, ox: 0, oy: 0 };
}
function rectPoly(c, w, h, deg = 0) { const a = deg * DEG, u = [Math.cos(a), Math.sin(a)], v = [-u[1], u[0]]; return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => add(c, add(mul(u, (i * w) / 2), mul(v, (j * h) / 2)))); }
function segInter(a, b, c, d) {
  const o1 = cross(sub(b, a), sub(c, a)), o2 = cross(sub(b, a), sub(d, a)), o3 = cross(sub(d, c), sub(a, c)), o4 = cross(sub(d, c), sub(b, c));
  if (o1 === 0 && o2 === 0) return Math.max(Math.min(a[0], b[0]), Math.min(c[0], d[0])) <= Math.min(Math.max(a[0], b[0]), Math.max(c[0], d[0])) && Math.max(Math.min(a[1], b[1]), Math.min(c[1], d[1])) <= Math.min(Math.max(a[1], b[1]), Math.max(c[1], d[1]));
  return o1 * o2 <= 0 && o3 * o4 <= 0;
}
function segHitsPoly(a, b, P) {
  for (let i = 0; i < P.length; i++) if (segInter(a, b, P[i], P[(i + 1) % P.length])) return true;
  return pointInPoly(a, P) || pointInPoly(b, P);
}
function polysOverlap(P, Q) {
  for (let i = 0; i < P.length; i++) for (let j = 0; j < Q.length; j++) if (segInter(P[i], P[(i + 1) % P.length], Q[j], Q[(j + 1) % Q.length])) return true;
  return pointInPoly(P[0], Q) || pointInPoly(Q[0], P);
}
export function layoutView(shapes, ghosts = [], W = 360, opt = {}) {
  const unions = opt.unions || [];
  let view = opt.view;
  if (!view) {
    const pts = worldPts(shapes, ghosts);
    if (!pts.length) return { view: { W, H: 200, drawH: 200, s: 1, x0: 0, y0: 0, ox: W / 2, oy: 100 }, labels: [], dims: [], legend: [], fyi: [] };
    view = fitView(bboxOf(pts), W, shapes.some(s => s.comp === "Dim") ? 46 : 34);
  }
  view = { ...view };
  if (opt.camOnly) return { view };
  const Hd = view.drawH, X = p => toScreen(view, p);
  const unionOf = new Map(); for (const u of unions) for (const m of u.members) if (!unionOf.has(m)) unionOf.set(m, u);
  // obstacles: every stroke (outlines, lines, arrows, arcs, placed dim lines) and every filled body
  const strokes = [], areas = [];
  const addPoly = (id, q, filled) => { q.forEach((p, i) => strokes.push({ id, a: p, b: q[(i + 1) % q.length] })); areas.push({ id, poly: q, filled }); };
  // obstacles: this step's shapes AND the shapes later steps add (labels then stay put when the next layer arrives)
  for (const sh of [...shapes, ...(opt.later || []).filter(x => !shapes.some(s => s.id === x.id) && !["Label", "Dim"].includes(x.comp))]) {
    const g = sh.geom;
    if (sh.comp === "Seg" || sh.comp === "Vec") strokes.push({ id: sh.id, a: X(g.a), b: X(g.b) });
    else if (sh.comp === "Curve" && !g.area) { const q = g.line.map(X); for (let i = 1; i < q.length; i++) strokes.push({ id: sh.id, a: q[i - 1], b: q[i] }); }
    else if (sh.comp === "Circle") addPoly(sh.id, circlePts(g.c, g.r).map(X), !!sh.opts.fill);
    else if (g.pts) addPoly(sh.id, g.pts.map(X), !!sh.opts.fill);
    else if (sh.comp === "Angle") { const q = arcPts(X(g.o), X(g.a), X(g.b), 24); for (let i = 1; i < q.length; i++) strokes.push({ id: sh.id, a: q[i - 1], b: q[i] }); }
  }
  const auto = autoHues(shapes.filter(sh => (sh.comp === "Vec" || sh.comp === "Label") && !sh.opts.tone).map(sh => sh.geom.label || sh.geom.text || sh.id));
  const toneOf = sh => sh.opts.tone || ((sh.comp === "Vec" || sh.comp === "Label") ? auto.get(sh.geom.label || sh.geom.text || sh.id) : "ink");
  const placed = [], labels = [], dims = [], legend = [], fyi = [];
  const inR = poly => poly.every(p => p[0] >= 2 && p[1] >= 2 && p[0] <= W - 2 && p[1] <= Hd - 2);
  function free(poly, self, under = null, air = 3) {
    if (!inR(poly)) return false;
    const u = mul(unit(sub(poly[1], poly[0])), air), v = mul(unit(sub(poly[3], poly[0])), air);   // a few px of air round the text, on its own axes
    const halo = [sub(sub(poly[0], u), v), sub(add(poly[1], u), v), add(add(poly[2], u), v), add(sub(poly[3], u), v)];
    if (strokes.some(s => !(under && under.has(s.id)) && segHitsPoly(s.a, s.b, halo))) return false;
    if (areas.some(A => A.filled && !self.has(A.id) && polysOverlap(poly, A.poly))) return false;
    return !placed.some(q => polysOverlap(poly, q));
  }
  function around(bb, w, h, gaps) {
    const out = [];
    for (const g of gaps) for (const [dx, dy] of DIRS8) {
      const gg = dx && dy ? g * 0.7 : g;
      out.push([dx > 0 ? bb.x1 + gg + w / 2 : dx < 0 ? bb.x0 - gg - w / 2 : (bb.x0 + bb.x1) / 2, dy > 0 ? bb.y1 + gg + h / 2 : dy < 0 ? bb.y0 - gg - h / 2 : (bb.y0 + bb.y1) / 2]);
    }
    return out;
  }
  const ptBox = p => ({ x0: p[0], y0: p[1], x1: p[0], y1: p[1] });
  const selfOf = id => { const u = unionOf.get(id); return new Set(u ? [id, u.id, ...u.members] : [id]); };
  const take = (base, text, c, w, h, angle = 0, onFill = false) => {
    const poly = rectPoly(c, w, h, angle), b = bboxOf(poly);
    labels.push({ ...base, text, x: Math.round(c[0] * 10) / 10, y: Math.round(c[1] * 10) / 10, w, h, angle: Math.round(angle * 10) / 10, box: [b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0].map(v => Math.round(v * 10) / 10), onFill });
    placed.push(rectPoly(c, w + 4, h + 4, angle));
  };
  const lineOf = sh => sh.comp === "Curve" ? sh.geom.line : null;
  function nearestShape(p) {                     // the anchor a free Label belongs to: the closest drawn shape (its Union if it has one)
    let best = null;
    for (const sh of shapes) {
      if (["Label", "Dim", "Angle"].includes(sh.comp)) continue;
      const own = strokes.filter(s => s.id === sh.id), ar = areas.find(A => A.id === sh.id);
      let d = ar && pointInPoly(p, ar.poly) ? 0 : Infinity;
      for (const s of own) d = Math.min(d, ptSeg(p, s.a, s.b).d);
      if (d < (best ? best.d : Infinity)) best = { d, id: sh.id };
    }
    return best ? (unionOf.get(best.id)?.id || best.id) : null;
  }
  function toLegend(of, anchor, text, tone, layer, auto, why) {
    if (legend.some(e => e.id === anchor && e.text === text)) return;
    legend.push({ id: anchor, of, text: String(text), tone, layer, auto });
    if (auto) { const sh = shapes.find(s => s.id === of); fyi.push({ code: "legend", cls: "fyi", ids: [of], amount: null, mtv: null, hint: `moved to legend: "${text}" of ${of} ${why}; it is shown under the drawing beside a small render of ${anchor} (no action needed)`, line: sh?.line ?? null, pass: sh?.pass ?? 1 }); }
  }
  const cen = (() => { const all = strokes.flatMap(s => [s.a, s.b]); if (!all.length) return [W / 2, Hd / 2]; const b = bboxOf(all); return [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2]; })();
  function placeDim(sh) {
    const g = sh.geom, a = X(g.a), b = X(g.b), L = len(sub(b, a)), u = unit(sub(b, a)), nrm = [-u[1], u[0]], mid = mul(add(a, b), 0.5);
    let s0 = Math.sign(dot(sub(mid, cen), nrm)); if (!s0) s0 = nrm[1] < 0 ? 1 : -1;
    let ang = Math.atan2(u[1], u[0]) / DEG; if (ang > 90) ang -= 180; if (ang <= -90) ang += 180;
    const tw = textW(g.text) + 6, th = LH - 2, onLine = tw + 12 <= L - 4;
    // the shapes its end points sit in or on (the lens it measures from, the axis through A) may be crossed, like a Vec's own body
    const self = new Set([sh.id]);
    for (const A of areas) if (pointInPoly(a, A.poly) || pointInPoly(b, A.poly)) self.add(A.id);
    for (const s of strokes) if (ptSeg(a, s.a, s.b).d < 2 || ptSeg(b, s.a, s.b).d < 2) self.add(s.id);
    let first = null;                            // fallback: the first spot where the LINE fits (its text goes to the legend), else no line
    const slide = onLine ? [0] : [0, 1, -1].map(k => k * Math.max(0, (tw - L) / 2 + 2));   // text beside a short line may slide to either end
    for (const side of [s0, -s0]) for (const off of [12, 24, 38]) {
      const n = mul(nrm, side), p = add(a, mul(n, off)), q = add(b, mul(n, off)), m = mul(add(p, q), 0.5);
      const lineOk = inR([p, q]) && !strokes.some(s => !self.has(s.id) && segInter(p, q, s.a, s.b)) && !areas.some(A => A.filled && !self.has(A.id) && segHitsPoly(p, q, A.poly)) && !placed.some(P => segHitsPoly(p, q, P));
      for (const sl of slide) {
        const tc = add(onLine ? m : add(m, mul(n, th / 2 + 4)), mul(u, sl)), rect = rectPoly(tc, tw, th, ang);
        const c = { n, p, q, tc, rect, ok: false };
        if (lineOk && !first) first = c;
        if (lineOk && free(rect, self)) { c.ok = true; return { ...c, tw, th, ang, onLine }; }
      }
    }
    return first ? { ...first, tw, th, ang, onLine } : { n: mul(nrm, s0), none: true, tw, th, ang, onLine };
  }
  const reqs = [...shapes.map(sh => ({ sh })), ...unions.filter(u => u.members.some(m => shapes.some(s => s.id === m))).map(u => ({ u }))];
  for (const { sh, u } of reqs) {
    if (u) {                                      // a Union: one object; its label beside the whole group, its legend draws all parts
      const parts = shapes.filter(s => u.members.includes(s.id)), tone = u.opts.tone || "ink", layer = u.opts.shade || 1, base = { id: u.id, tone, layer };
      if (u.opts.legend) toLegend(u.id, u.id, u.opts.legend, tone, layer, false);
      if (u.opts.label != null && u.opts.label !== "") {
        const text = String(u.opts.label), w = textW(text) + 6, bb = bboxOf(worldPts(parts).map(X)), self = selfOf(u.members[0]);
        const c = around(bb, w, LH, [5, 12]).find(c => free(rectPoly(c, w, LH), self));
        if (c) take(base, text, c, w, LH); else toLegend(u.id, u.id, text, tone, layer, true, "has no room next to the group without overlapping");
      }
      continue;
    }
    const g = sh.geom, tone = toneOf(sh), layer = sh.opts.shade || 1, base = { id: sh.id, tone, layer }, self = selfOf(sh.id);
    if (sh.opts.legend) toLegend(sh.id, sh.id, sh.opts.legend, sh.opts.tone || unionOf.get(sh.id)?.opts.tone || "ink", layer, false);
    const tryList = (cands, text, w, h = LH) => { const c = cands.find(c => free(rectPoly(c, w, h), self)); if (c) take(base, text, c, w, h); return !!c; };
    if (sh.comp === "Dim") {
      const d = placeDim(sh), dtone = sh.opts.tone || "ink";
      if (d.none) { toLegend(sh.id, sh.id, g.text, dtone, layer, true, "has no room beside AB on either side"); continue; }
      const ext = [[add(X(g.a), mul(d.n, 3)), add(d.p, mul(d.n, 4))], [add(X(g.b), mul(d.n, 3)), add(d.q, mul(d.n, 4))]];
      const ticks = [d.p, d.q].map(p => [add(p, mul(d.n, 5)), add(p, mul(d.n, -5))]);
      const gap = d.ok && d.onLine ? [len(sub(d.tc, d.p)) - d.tw / 2 - 2, len(sub(d.tc, d.p)) + d.tw / 2 + 2] : null;
      dims.push({ id: sh.id, a: d.p, b: d.q, ext, ticks, gap, text: d.ok ? g.text : "", tone: dtone, layer });
      strokes.push({ id: sh.id, a: d.p, b: d.q }, ...ext.map(([a, b]) => ({ id: sh.id, a, b })));
      if (d.ok) take({ ...base, tone: dtone, dim: true }, g.text, d.tc, d.tw, d.th, d.ang);
      else toLegend(sh.id, sh.id, g.text, dtone, layer, true, "has no room beside AB on either side");
      continue;
    }
    let text = null, cands = [], anchor = sh.id, inside = null;
    if (sh.comp === "Label" && g.text !== "") {
      const p = X(g.p), w = textW(g.text) + 6;
      text = g.text; cands = [p, ...around(ptBox(p), w, LH, [4, 10])]; anchor = nearestShape(p) || sh.id;
    } else if (sh.comp === "Vec" && g.label) {
      const w = textW(g.label) + 6, a = X(g.a), b = X(g.b);
      text = g.label; cands = [...around(ptBox(b), w, LH, [3, 9]), ...around(ptBox(mul(add(a, b), 0.5)), w, LH, [4])];
    } else if (sh.comp === "Angle" && g.label) {
      const o = X(g.o), m0 = unit(add(unit(sub(X(g.a), o)), unit(sub(X(g.b), o)))), m = m0[0] || m0[1] ? m0 : [1, 0];
      text = g.label; cands = ARC_R.map(([, r]) => add(o, mul(m, r)));
    } else if (sh.opts.label != null && sh.opts.label !== "") {
      text = String(sh.opts.label);
      const w = textW(text) + 6, ln = sh.comp === "Seg" ? [X(g.a), X(g.b)] : lineOf(sh) && !g.area ? g.line.map(X) : null;
      if (ln) { const mp = ln.length === 2 ? mul(add(ln[0], ln[1]), 0.5) : ln[Math.floor(ln.length / 2)]; cands = around(ptBox(mp), w, LH, [4, 10]); }
      else {
        const ar = areas.find(A => A.id === sh.id);
        if (ar) {
          const bb = bboxOf(ar.poly), cc = sh.comp === "Circle" ? X(g.c) : X(centroid({ kind: "poly", pts: g.pts }));
          // inside a FILLED shape, the overlay lines drawn before it (graph edges to node centres) run underneath: they do not block
          const under = sh.opts.fill ? new Set(shapes.filter(t => t.idx < sh.idx && t.kind === "overlay" && t.id !== sh.id).map(t => t.id)) : null;
          const grid = [cc, ...[0.5, 0.35, 0.65, 0.2, 0.8].flatMap(fy => [0.5, 0.35, 0.65].map(fx => [bb.x0 + fx * (bb.x1 - bb.x0), bb.y0 + fy * (bb.y1 - bb.y0)]))];
          inside = grid.find(c => rectPoly(c, w, LH).every(q => pointInPoly(q, ar.poly)) && free(rectPoly(c, w, LH), self, under, 1));
          cands = around(bb, w, LH, [5, 12]);
        }
      }
    }
    if (text == null) continue;
    const w = textW(text) + 6;
    if (inside) { take({ ...base, tone: sh.opts.tone || "ink" }, text, inside, w, LH, 0, !!sh.opts.fill); continue; }
    if (sh.comp === "Angle") {                   // the arc grows with its label: the label sits just outside the arc
      const k = cands.findIndex(c => free(rectPoly(c, w, LH), self));
      if (k >= 0) { take({ ...base, arc: ARC_R[k][0] }, text, cands[k], w, LH); continue; }
    }
    if (!tryList(cands, text, w)) toLegend(sh.id, anchor, text, sh.comp === "Label" || sh.comp === "Vec" ? tone : sh.opts.tone || "ink", layer, true, `has no room ${sh.comp === "Label" ? "at its point" : "inside or right next to its anchor"} without overlapping`);
  }
  // the legend row(s) under the drawing
  let x = 12, y = Hd + 8, rows = 0;
  for (const e of legend) {
    const ew = TILE + 6 + textW(e.text);
    if (!rows) rows = 1; else if (x + ew > W - 12) { x = 12; y += LROW; rows++; }
    e.tile = [x, y, TILE, TILE]; e.tx = x + TILE + 6; e.ty = y + TILE / 2; x += ew + 16;
  }
  view.H = Hd + (rows ? rows * LROW + 10 : 0);
  return { view, labels, dims, legend, fyi };
}
function arcPts(o, a, b, R) {
  const ua = unit(sub(a, o)), ub = unit(sub(b, o)), t0 = Math.atan2(ua[1], ua[0]);
  let d = Math.atan2(ub[1], ub[0]) - t0; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
  return Array.from({ length: 7 }, (_, i) => add(o, mul([Math.cos(t0 + (d * i) / 6), Math.sin(t0 + (d * i) / 6)], R)));
}
/** model -> screen for a result's view */
export const toScreen = (view, p) => [view.ox + (p[0] - view.x0) * view.s, (view.drawH ?? view.H) - view.oy - (p[1] - view.y0) * view.s];
/** screen px of one view -> the same world point in another view (a camera tween moves labels and dims with the drawing) */
export function remap(from, to, p) { const w = [from.x0 + (p[0] - from.ox) / from.s, from.y0 + ((from.drawH ?? from.H) - from.oy - p[1]) / from.s]; return toScreen(to, w); }
