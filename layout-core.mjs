// layout-core.mjs: the streamed, constraint-checked figure language (Cluck layout core, prototype; plan: brain
// projects/calc/_files/cluck-stepper-2026-11-08/layout-map/MAP.md, decisions Q17-Q32 + Fable review).
// One statement per line, OpenUI Lang shape `id = Comp(args)`. Points are computed by the renderer (Pt Mid Along Off Foot Rot
// Meet), shapes hang off points (Seg Box Poly Circle Vec Label Angle), `Figure([...])` is an optional root, `Fix(B, {patch})`
// is the pass-2 form. The program is a DAG evaluated in Kahn order as lines stream in; each newly evaluated shape is checked
// against the shapes already there (precedence = statement index: the later of a pair is blamed), every conflict of the new
// line is reported as a PAIR with amount + push vector (MTV) + a dashed ghost of where the later shape must go.
// Plain ESM, no DOM, imports only ./figcheck.js (SAT+MTV collide, contactGap, place). Deterministic: same program, same output.
// NOT a physics simulator (Tony, Nov 8): the engine never judges physics meaning (force directions, magnitudes, what acts on what);
// the LLM owns that. The DAG + collide checker only save the LLM the tokens it spends ARRANGING objects (auto-snap, like Canva):
// placement, contact, containment, overlap. One diagram per draw.
// World space: y up. Tolerance = 1% of the figure span (model units), so the verdict is the same on every screen.
import { box as fcBox, poly as fcPoly, circle as fcCircle, wseg, surface as fcSurface, collide, contactGap, centroid, ptSeg, place, autoHues } from "./figcheck.js";

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
export const SHAPE_SIGS = { Seg: "Seg(A, B, opts?)", Box: "Box(C, w, h, deg?, opts?)", Poly: "Poly([A, B, C, ...], opts?)", Circle: "Circle(O, r, opts?)", Vec: "Vec(A, B, label?, opts?)", Label: "Label(P, text, opts?)", Angle: "Angle(A, O, B, label?, opts?)" };
const SIGS = { ...Object.fromEntries(Object.entries(POINT_OPS).map(([k, v]) => [k, `${k}(${v.join(", ")})`])), ...SHAPE_SIGS, Figure: "Figure([ids...])", Fix: "Fix(target, {trait: value})" };
export const KINDS = ["solid", "surface", "inside", "overlay"];
export const TONES = ["sky", "amber", "orange", "violet", "pink", "cyan", "ink", "muted"];
const OPT_KEYS = ["kind", "in", "tone", "layer", "fill", "label"];
const AREA = new Set(["Box", "Poly", "Circle"]), DECOR = new Set(["Vec", "Label", "Angle"]);
const FIX_TRAITS = { Pt: ["x", "y"], Box: ["w", "h", "deg"], Circle: ["r"], Seg: [], Poly: [], Vec: ["label"], Label: ["text"], Angle: ["label"] };

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
    while (peek() && peek().t !== close) { items.push(expr(0)); if (peek() && peek().t === ",") i++; else break; }
    take(close);
    return items;
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
  const deps = refsOf(call);
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
/** split a growing text into complete statements: a newline at bracket depth 0 outside strings ends one; `//` comments and ``` fences drop */
function splitDone(buf) {
  const done = [];
  let depth = 0, q = null, start = 0, line = 0, startLine = 0;
  for (let i = 0; i < buf.length; i++) {
    const c = buf[i];
    if (q) { if (c === "\\") i++; else if (c === q) q = null; continue; }
    if (c === '"' || c === "'") q = c;
    else if (c === "/" && buf[i + 1] === "/") { const j = buf.indexOf("\n", i); if (j < 0) break; buf = buf.slice(0, i) + buf.slice(j); i--; continue; }
    else if ("([{".includes(c)) depth++;
    else if (")]}".includes(c)) depth = Math.max(0, depth - 1);
    else if (c === "\n") {
      line++;
      if (depth === 0) { const t = buf.slice(start, i).trim(); if (t && !t.startsWith("```")) done.push({ text: t, line: startLine + 1 }); start = i + 1; startLine = line; }
    }
  }
  return { done, rest: buf.slice(start), restLines: startLine };
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
    if (!cut) break;
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
  if (isSeg(col)) return false;
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

// ─── the session: incremental parse + DAG evaluation + checks ───
export function createSession(opts = {}) {
  const o = { mover: false, W: 360, ...opts };
  let stmts = [];            // [{id, comp, args, deps, line, pass, idx}] in precedence order
  const bufs = { 1: "", 2: "" }, lineBase = { 1: 0, 2: 0 };
  let S;                     // evaluation state (rebuilt on Fix / redefinition)
  let parseFindings = [];    // findings about the text itself (parse errors, redefinitions): kept across rebuilds
  let events = [];
  const emit = e => events.push(e);

  function fresh() { return { vals: new Map(), status: new Map(), findings: [], ghosts: [], order: [], blockedBy: new Map(), patches: new Map(), fixErr: new Map(), moved: new Map() }; }
  S = fresh();

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
    if (i < a.length) throw perr("bad-args", `${SIGS[c]}: unexpected extra argument ${i + 1}`);
    const patch = S.patches.get(st.id);
    if (patch) for (const [k, v] of Object.entries(patch)) { if (OPT_KEYS.includes(k)) n.opts = { ...n.opts, [k]: v }; else n[k] = v; }
    return n;
  }
  function checkOpts(op, comp) {
    for (const k of Object.keys(op)) if (!OPT_KEYS.includes(k)) throw perr("bad-args", `unknown option "${k}" (known: ${OPT_KEYS.join(", ")})`);
    if (op.kind != null && !KINDS.includes(op.kind)) throw perr("bad-args", `kind must be one of ${KINDS.join(", ")}`);
    if (op.kind === "inside" && !op.in) throw perr("bad-args", `kind "inside" needs in: <container id>`);
    if (op.tone != null && !TONES.includes(op.tone)) throw perr("bad-args", `tone must be one of ${TONES.join(", ")} (palette hues only)`);
    if (op.layer != null && ![1, 2, 3].includes(op.layer)) throw perr("bad-args", "layer must be 1, 2 or 3");
    if (DECOR.has(comp) && op.kind && op.kind !== "overlay") throw perr("bad-args", `${comp} is decor: no kind but overlay`);
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
    }
    if (op.kind === "inside") {
      const c = S.vals.get(op.in);
      if (!c || c.t !== "shape" || !AREA.has(c.comp)) throw perr("bad-args", `${st.id}: in: ${op.in} must name a Box, Poly or Circle defined before it is needed`);
    }
    return sh;
  }

  // ── checks: one pair (X later by index, Y earlier); returns a conflict {code, depth, mtv (moves X), hint} or null ──
  function headOf(v, tol) { const u = unit(sub(v.geom.b, v.geom.a)), hl = Math.min(4 * tol, 0.5 * len(sub(v.geom.b, v.geom.a))); return fcCircle(v.id + ":head", sub(v.geom.b, mul(u, hl / 2)), hl / 2); }
  function pair(X, Y, tol) {
    if (X.kind === "overlay" || Y.kind === "overlay") return null;
    if (X.comp === "Label" || X.comp === "Angle" || Y.comp === "Label" || Y.comp === "Angle") return null;
    if (X.comp === "Vec" || Y.comp === "Vec") {
      const [v, b, sign] = X.comp === "Vec" ? [X, Y, 1] : [Y, X, -1];
      if (b.comp === "Vec" || !AREA.has(b.comp) || b.kind === "surface") return null;
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
      if (Y.id === X.id) continue;
      const [L, E] = X.idx > Y.idx ? [X, Y] : [Y, X];
      const c = pair(L, E, tol);
      if (c) out.push({ ...c, X: L, Y: E, ids: [L.id, E.id] });
    }
    return out;
  }
  function translateShape(sh, d) {
    const t = p => add(p, d), g = sh.geom, out = { ...sh, geom: { ...g } };
    if (g.pts) out.geom.pts = g.pts.map(t);
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
        if (S.status.has(st.id) || st.comp === "Fix") continue;
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
    const pend = id => { const s = byId(id); return s && !S.status.has(id) && s.comp !== "Fix"; };
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
      if (S.status.has(st.id) || st.comp === "Fix") continue;
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
    if (!target || target.comp === "Fix") return perr("undefined-ref", `${st.id}: Fix target ${t.id} is not defined`);
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
    for (const f of fixes) {
      const r = validateFix(f);
      if (r instanceof Error) { S.status.set(f.id, "error"); S.fixErr.set(f.id, r); continue; }
      S.patches.set(r.target, { ...(S.patches.get(r.target) || {}), ...r.patch });
      S.status.set(f.id, "ok");
    }
    settle(); detectCycles();
    for (const f of fixes) if (S.fixErr.has(f.id)) { const e = S.fixErr.get(f.id); finding({ code: e.code, ids: [f.id, f.args[0]?.id].filter(Boolean), hint: e.message, line: f.line, pass: f.pass }); emit({ type: "eval", id: f.id, status: "error" }); }
  }

  function addText(text, line, pass) {
    let p;
    try { p = parseStatement(text); }
    catch (e) {
      const id = /^\s*([A-Za-z_]\w*)\s*=/.exec(text)?.[1] || `line${line}`;
      const f = { code: e.code || "parse", cls: "llm", ids: [id], amount: null, mtv: null, hint: `${e.message}: ${text.slice(0, 60)}`, line, pass };
      parseFindings.push(f); S.findings.push(f); emit({ type: "finding", f });
      return;
    }
    const st = { ...p, line, pass, text };
    const old = byId(st.id);
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
    if (st.comp === "Fix") { rebuild(); return; }
    settle(); detectCycles();
  }

  // ── public ──
  function push(chunk, pass = 1) {
    events = [];
    bufs[pass] += chunk;
    const { done, rest, restLines } = splitDone(bufs[pass]);
    for (const d of done) addText(d.text, lineBase[pass] + d.line, pass);
    lineBase[pass] += restLines; bufs[pass] = rest;
    return events;
  }
  function end(pass = 1) {
    const ev = push("\n", pass);
    return ev;
  }
  /** pending at the time of asking: undefined refs (root reported once, dependents listed) */
  function pendingFindings() {
    const out = [], missing = new Map();
    for (const st of stmts) {
      if (S.status.has(st.id) || st.comp === "Fix") continue;
      for (const d of st.deps) if (!byId(d)) { if (!missing.has(d)) missing.set(d, { st, blocked: [] }); }
    }
    const blockedBy = id => { const st = byId(id); if (!st) return id; for (const d of st.deps) { if (!byId(d)) return d; if (!S.status.has(d)) { const r = blockedBy(d); if (r) return r; } } return null; };
    for (const st of stmts) {
      if (S.status.has(st.id) || st.comp === "Fix") continue;
      const r = blockedBy(st.id);
      if (r && missing.has(r) && missing.get(r).st !== st) missing.get(r).blocked.push(st.id);
    }
    for (const [id, m] of missing) out.push({ code: "undefined-ref", cls: "llm", ids: [m.st.id, id], amount: null, mtv: null, hint: `${m.st.id} uses ${id}, which is never defined${m.blocked.length ? `; blocked by it: ${m.blocked.join(", ")}` : ""}`, line: m.st.line, pass: m.st.pass, blocked: m.blocked });
    return out;
  }
  function result(opt = {}) {
    const W = opt.W || o.W;
    const shapes = shapesEval().sort((a, b) => a.idx - b.idx);
    const points = Object.fromEntries([...S.vals].filter(([, v]) => v.t === "pt").map(([k, v]) => [k, rv(v.p)]));
    const lay = layoutView(shapes, S.ghosts, W);
    const findings = [...S.findings, ...pendingFindings(), ...lay.fyi].map((f, i) => [f, i]).sort(([a, i], [b, j]) => (a.pass - b.pass) || ((a.line ?? 1e9) - (b.line ?? 1e9)) || (i - j)).map(([f]) => f);
    const status = Object.fromEntries(stmts.map(s => [s.id, S.status.get(s.id) || "pending"]));
    return {
      points, findings, ghosts: S.ghosts, labels: lay.labels, view: lay.view, tol: r3(tolNow()), span: r3(span()), status,
      shapes: shapes.map(s => ({ id: s.id, comp: s.comp, kind: s.kind, opts: s.opts, geom: s.geom, idx: s.idx, line: s.line, pass: s.pass, moved: S.moved.has(s.id) ? rv(S.moved.get(s.id)) : undefined })),
      stmts: stmts.map(s => ({ id: s.id, comp: s.comp, line: s.line, pass: s.pass, deps: s.deps })),
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
  const colOf = s => s.comp === "Box" ? fcBox(s.id, s.geom.c, s.geom.w, s.geom.h, s.geom.deg) : s.comp === "Circle" ? fcCircle(s.id, s.geom.c, s.geom.r) : s.comp === "Poly" ? polyCol(s) : s.comp === "Seg" ? wseg(s.id, s.geom.a, s.geom.b, 0) : null;
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
    const touch = [], over = [];
    if (c) for (const t of shapes) {
      if (t.id === s.id) continue;
      const d = cols.get(t.id);
      if (!d || (isSeg(c) && isSeg(d))) continue;
      const r = hit(c, d);
      if (r && r.depth > tol) over.push(`${t.id} by ${r3(r.depth)}`);
      else if (r || gapOf(c, d) <= tol) touch.push(t.id);
    }
    lines.push(`${s.id} ${s.comp} ${s.kind}${s.opts.in ? ` in ${s.opts.in}` : ""}: ${desc}${touch.length ? `; touches ${touch.join(", ")}` : ""}${over.length ? `; OVERLAPS ${over.join(", ")}` : ""}`);
  }
  return lines.join("\n");
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
export function formatFindings(findings) {
  const one = f => `- [${f.cls}] ${f.code} ids=[${f.ids.join(", ")}] ${f.pass === 2 ? "pass2 " : ""}line ${f.line ?? "?"}${f.amount != null ? ` amount ${f.amount}` : ""}${f.mtv ? ` push ${fv(f.mtv)}` : ""}: ${f.hint}${f.blocked && f.blocked.length && !/blocked by it/.test(f.hint) ? ` (blocks: ${f.blocked.join(", ")})` : ""}`;
  const llm = findings.filter(f => f.cls === "llm"), fyi = findings.filter(f => f.cls !== "llm");
  return [llm.length ? "Fix these:" : "No spatial errors.", ...llm.map(one), ...(fyi.length ? ["FYI (no action needed):", ...fyi.map(one)] : [])].join("\n");
}

// ─── view + label layout (screen px, y down): fit the drawing into W wide, place labels with figcheck place() ───
const LH = 18, CH = 7.6;
export function layoutView(shapes, ghosts = [], W = 360) {
  const pts = [];
  for (const s of shapes) {
    const g = s.geom;
    if (g.pts) pts.push(...g.pts);
    if (g.c && g.r != null) pts.push(add(g.c, [-g.r, -g.r]), add(g.c, [g.r, g.r])); else if (g.c) pts.push(g.c);
    for (const k of ["a", "b", "p", "o"]) if (g[k]) pts.push(g[k]);
  }
  for (const gh of ghosts) for (const k of ["a", "b", "c"]) if (gh.geom[k]) pts.push(gh.geom[k]);
  for (const gh of ghosts) if (gh.geom.pts) pts.push(...gh.geom.pts);
  if (!pts.length) return { view: { W, H: 200, s: 1, x0: 0, y0: 0, ox: W / 2, oy: 100 }, labels: [], fyi: [] };
  const b = bboxOf(pts), pad = 34, bw = Math.max(b.x1 - b.x0, EPS), bh = Math.max(b.y1 - b.y0, EPS), maxH = 420;
  let s = Math.min((W - 2 * pad) / bw, (maxH - 2 * pad) / bh);
  if (!Number.isFinite(s) || s <= 0) s = 1;
  const H = Math.max(180, Math.round(bh * s + 2 * pad));
  const view = { W, H, s, x0: b.x0, y0: b.y0, ox: (W - bw * s) / 2, oy: (H - bh * s) / 2 };
  const X = p => [view.ox + (p[0] - view.x0) * s, H - view.oy - (p[1] - view.y0) * s];
  // obstacles: strokes + bodies
  const segs = [], bodies = [];
  for (const sh of shapes) {
    const g = sh.geom;
    if (sh.comp === "Seg" || sh.comp === "Vec") segs.push({ id: sh.id, pts: [X(g.a), X(g.b)] });
    if (g.pts) { const q = g.pts.map(X); q.forEach((p, i) => segs.push({ id: sh.id, pts: [p, q[(i + 1) % q.length]] })); const bb = bboxOf(q); bodies.push({ id: sh.id, box: [bb.x0, bb.y0, bb.x1 - bb.x0, bb.y1 - bb.y0] }); }
    if (sh.comp === "Circle") { const c = X(g.c), r = g.r * s; bodies.push({ id: sh.id, box: [c[0] - r, c[1] - r, 2 * r, 2 * r] }); }
  }
  // label requests in statement order; tones: own tone, else auto-hue (W163) for quantity marks (Vec, Label), ink for the rest
  const auto = autoHues(shapes.filter(sh => (sh.comp === "Vec" || sh.comp === "Label") && !sh.opts.tone).map(sh => sh.geom.label || sh.geom.text || sh.id));
  const toneOf = sh => sh.opts.tone || ((sh.comp === "Vec" || sh.comp === "Label") ? auto.get(sh.geom.label || sh.geom.text || sh.id) : "ink");
  const width = t => Math.max(10, [...String(t)].length * CH);
  const spots = [], reqs = [];
  const R = { x: 0, y: 0, w: W, h: H };
  const clean = box => !segs.some(sg => segHits(sg.pts, box)) && !spots.some(q => overlapBox([q.spot[0], q.spot[1], q.w + 6, LH], box));
  for (const sh of shapes) {
    const g = sh.geom, base = { id: sh.id, tone: toneOf(sh), layer: sh.opts.layer || 1 };
    if (sh.comp === "Label") {
      const p = X(g.p), w = width(g.text) + 6, box = [p[0] - w / 2, p[1] - LH / 2, w, LH];
      if (clean(box)) spots.push({ ...base, key: sh.id, text: g.text, w: width(g.text), spot: [box[0], box[1]], t: { pt: p } });
      else reqs.push({ ...base, key: sh.id, text: g.text, w: width(g.text), t: { pt: p } });
    } else if (sh.comp === "Vec" && g.label) {
      reqs.push({ ...base, key: sh.id, text: g.label, w: width(g.label), t: { pt: X(g.b) } });
    } else if (sh.comp === "Angle" && g.label) {
      const o = X(g.o), a = unit(sub(X(g.a), o)), bb = unit(sub(X(g.b), o)), m = unit(add(a, bb)), r = 40, w = width(g.label) + 6;
      const c = add(o, mul(m[0] || m[1] ? m : [1, 0], r));
      spots.push({ ...base, tone: sh.opts.tone || "ink", key: sh.id, text: g.label, w: width(g.label), spot: [c[0] - w / 2, c[1] - LH / 2], t: { pt: o } });
    } else if (sh.opts.label != null && sh.opts.label !== "") {
      const tone = sh.opts.tone || "ink";
      if (sh.opts.fill && g.pts) {
        const c = X(centroid({ kind: "poly", pts: g.pts })), w = width(sh.opts.label) + 6;
        spots.push({ ...base, tone, onFill: true, key: sh.id, text: String(sh.opts.label), w: width(sh.opts.label), spot: [c[0] - w / 2, c[1] - LH / 2], t: { pt: c } });
      } else if (sh.comp === "Seg") reqs.push({ ...base, tone, key: sh.id, text: String(sh.opts.label), w: width(sh.opts.label), t: { pt: X(mul(add(g.a, g.b), 0.5)) } });
      else { const bb = bodies.find(q => q.id === sh.id); reqs.push({ ...base, tone, key: sh.id, text: String(sh.opts.label), w: width(sh.opts.label), t: bb ? { box: bb.box } : { pt: X(g.c) } }); }
    }
  }
  const placed = place([...spots, ...reqs], segs, bodies, R, null, { LH, GAP: 6 });
  const fyi = [];
  for (const p of placed) {
    if (p.free || p.ring > 7 || !(p.box[0] >= -1 && p.box[1] >= -1 && p.box[0] + p.box[2] <= W + 1 && p.box[1] + p.box[3] <= H + 1))
      fyi.push({ code: "label-moved", cls: "fyi", ids: [p.id], amount: null, mtv: null, hint: `label "${p.text}" of ${p.id} could not sit by its anchor; the renderer moved it${p.lead ? " with a leader line" : ""} (no action needed)`, line: shapes.find(s => s.id === p.id)?.line ?? null, pass: shapes.find(s => s.id === p.id)?.pass ?? 1 });
  }
  return { view, labels: placed.map(p => ({ id: p.id, text: p.text, box: p.box.map(v => Math.round(v * 10) / 10), tone: p.tone, layer: p.layer, lead: p.lead, onFill: !!p.onFill })), fyi };
}
function overlapBox(p, q) { return Math.min(p[0] + p[2], q[0] + q[2]) > Math.max(p[0], q[0]) && Math.min(p[1] + p[3], q[1] + q[3]) > Math.max(p[1], q[1]); }
function segHits([a, b], [x, y, w, h]) {
  let t0 = 0, t1 = 1;
  const dx = b[0] - a[0], dy = b[1] - a[1];
  for (const [p, q] of [[-dx, a[0] - x], [dx, x + w - a[0]], [-dy, a[1] - y], [dy, y + h - a[1]]]) {
    if (p === 0) { if (q < 0) return false; continue; }
    const r = q / p;
    if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; }
  }
  return t1 - t0 > 1e-9;
}
/** model -> screen for a result's view */
export const toScreen = (view, p) => [view.ox + (p[0] - view.x0) * view.s, view.H - view.oy - (p[1] - view.y0) * view.s];
