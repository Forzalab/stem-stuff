// scene.js: the Scene renderer of the viz MVP (todo 120). The ONE spec is views/scene-contract.md; views_gate.py checks the same
// contract in Python (its expr_eval is the port this file matches, conformance vectors in tests/scene-render.test.mjs).
//   exprEval / exprNames   the §3 expression grammar (one EBNF, same errors: expr-parse / expr-name / expr-value)
//   sceneModel(scene, steps) -> model      stateAt(model, k) -> the replay of steps 1..k+1 (Back = replay, §6)
//   solve(model, state[, mix]) -> solved   relations (attach on pivot align distribute stack set scale), live anchors (§1b)
//   frame(model, k, stage, {doc})          one step drawn: the svg (world units fit 1:1 into VIEW, y up), the label boxes the
//                                          placer chose (8 candidates, overlap score, leader lines, --knock chips), panels
//   SceneView(doc, model, stage)           the live figure a scene stepper shows: go(k, from) draws step k, tweening from step
//                                          `from` (200 ms ease-out on positions, turns, camera, opacity; reduced motion: instant)
// The model never writes a pixel: every stroke, colour (classes -> views.css var(--token)), font and label spot is decided here.
// Deterministic: no measuring, no randomness (label widths from a fixed advance table), so the same program draws the same svg.
// Arrowheads come from graph.js (Graph.arrowParts, DESIGN-LANGUAGE §3), which the page loads before views.js runs.

export const VIEW = { W: 360, H: 240 };
const SVGNS = "http://www.w3.org/2000/svg";
const FS = 15, FS_TICK = 13, ADV = 0.56, LH = 19, GAP = 6, PAD = 30, TWEEN = 200;

export class SceneError extends Error {
  constructor(code, detail = "") { super(`${code}: ${detail}`); this.code = code; this.detail = detail; }
}

// ─── §3 expression grammar ───
const FUNCS = { sqrt: 1, sin: 1, cos: 1, tan: 1, abs: 1, rad: 1, min: 2, max: 2 };   // min / max: 2 or more
const PROPS = new Set(["w", "h", "r", "base", "height", "apex", "radius", "segments", "rotate", "x", "y", "len"]);
const EXPR_MAX = 80, EXPR_DEPTH = 8, VAL_MAX = 1e4;
const TOK = /\s*(?:(\d+(?:\.\d+)?|\.\d+)|([A-Za-z][A-Za-z0-9_]*)|(\S))/y;
function tokens(text) {
  const out = [];
  TOK.lastIndex = 0;
  while (TOK.lastIndex < text.length) {
    const m = TOK.exec(text);
    if (!m || m[0] === "" ) break;                                        // trailing whitespace
    if (m[1] != null) out.push(["num", parseFloat(m[1])]);
    else if (m[2] != null) out.push(["name", m[2]]);
    else if (m[3] != null && "+-*/^(),.".includes(m[3])) out.push(["op", m[3]]);
    else if (m[3] != null) throw new SceneError("expr-parse", `${text}: bad character ${m[3]}`);
    else break;
  }
  return out;
}
class Parser {
  constructor(text, allowX) { this.text = text; this.t = tokens(text); this.i = 0; this.depth = 0; this.allowX = allowX; }
  peek() { return this.t[this.i] || [null, null]; }
  is(op) { const [k, v] = this.peek(); return k === "op" && v === op; }
  fail(why) { throw new SceneError("expr-parse", `${this.text}: ${why}`); }
  expect(op) { if (!this.is(op)) this.fail(`want ${op}`); this.i++; }
  enter() { if (++this.depth > EXPR_DEPTH) this.fail(`over ${EXPR_DEPTH} deep`); }
  run() { const e = this.sum(); if (this.i !== this.t.length) this.fail(`unexpected ${this.t[this.i][1]}`); return e; }
  sum() { let a = this.product(); while (this.is("+") || this.is("-")) { const op = this.t[this.i++][1]; a = ["bin", op, a, this.product()]; } return a; }
  product() { let a = this.unary(); while (this.is("*") || this.is("/")) { const op = this.t[this.i++][1]; a = ["bin", op, a, this.unary()]; } return a; }
  unary() {
    if (this.is("+") || this.is("-")) {
      const op = this.t[this.i++][1];
      this.enter(); const v = this.unary(); this.depth--;
      return op === "-" ? ["neg", v] : v;
    }
    return this.power();
  }
  power() { const a = this.atom(); if (this.is("^")) { this.i++; return ["bin", "^", a, this.unary()]; } return a; }
  atom() {
    const [kind, v] = this.peek();
    if (kind === "num") { this.i++; return ["num", v]; }
    if (kind === "op" && v === "(") { this.i++; this.enter(); const e = this.sum(); this.expect(")"); this.depth--; return e; }
    if (kind !== "name") this.fail("want a number, a name or (");
    this.i++;
    if (this.is("(")) {
      if (!Object.hasOwn(FUNCS, v)) throw new SceneError("expr-name", `${this.text}: no function ${v}`);
      this.i++; this.enter();
      const args = [this.sum()];
      while (this.is(",")) { this.i++; args.push(this.sum()); }
      this.expect(")"); this.depth--;
      if (FUNCS[v] === 1 ? args.length !== 1 : args.length < 2) throw new SceneError("expr-name", `${this.text}: ${v} takes ${FUNCS[v] === 1 ? "one arg" : "2 or more args"}`);
      return ["call", v, args];
    }
    if (this.is(".")) {
      this.i++;
      const [k2, p] = this.peek();
      if (k2 !== "name") this.fail("want a prop after .");
      this.i++;
      if (!PROPS.has(p)) throw new SceneError("expr-name", `${this.text}: no prop ${p}`);
      return ["ref", v, p];
    }
    if (Object.hasOwn(FUNCS, v) || (v === "x" && !this.allowX)) throw new SceneError("expr-name", `${this.text}: ${v} here`);
    return ["name", v];
  }
}
const ASTS = new Map();
export function exprParse(text, allowX = false) {
  text = String(text);
  const key = (allowX ? "x:" : ":") + text;
  if (!ASTS.has(key)) {
    if (!text.trim() || text.length > EXPR_MAX) throw new SceneError("expr-parse", `${text.slice(0, 20)}: empty or over ${EXPR_MAX} characters`);
    ASTS.set(key, new Parser(text, allowX).run());
  }
  return ASTS.get(key);
}
function walk(n, names, refs) {
  if (n[0] === "name" && n[1] !== "pi" && n[1] !== "x") names.add(n[1]);
  else if (n[0] === "ref") refs.add(`${n[1]}.${n[2]}`);
  else if (n[0] === "bin") { walk(n[2], names, refs); walk(n[3], names, refs); }
  else if (n[0] === "neg") walk(n[1], names, refs);
  else if (n[0] === "call") n[2].forEach(a => walk(a, names, refs));
}
/** {names: Set of Q ids, refs: Set of "id.prop"} one expression reads (pi and x left out) */
export function exprNames(text, allowX = false) {
  const names = new Set(), refs = new Set();
  walk(exprParse(text, allowX), names, refs);
  return { names, refs };
}
const fin = (v, text) => {
  if (v == null) return null;
  if (!Number.isFinite(v)) throw new SceneError("expr-value", `${text}: not a finite number`);
  return v;
};
function ev(n, look, x, text) {
  const k = n[0];
  if (k === "num") return fin(n[1], text);
  if (k === "name") {
    if (n[1] === "pi") return Math.PI;
    if (n[1] === "x") return fin(x, text);
    const v = look(n[1]);
    if (v === undefined) throw new SceneError("expr-name", `${text}: no quantity ${n[1]}`);
    return fin(v, text);
  }
  if (k === "ref") {
    const v = look(`${n[1]}.${n[2]}`);
    if (v === undefined) throw new SceneError("expr-name", `${text}: no ${n[1]}.${n[2]}`);
    return fin(v, text);
  }
  if (k === "neg") { const v = ev(n[1], look, x, text); return v == null ? null : -v; }
  if (k === "call") {
    const a = n[2].map(e => ev(e, look, x, text));
    if (a.some(v => v == null)) return null;
    const f = n[1];
    if (f === "sqrt" && a[0] < 0) throw new SceneError("expr-value", `${text}: sqrt out of its domain`);
    const v = { sqrt: () => Math.sqrt(a[0]), sin: () => Math.sin(a[0]), cos: () => Math.cos(a[0]), tan: () => Math.tan(a[0]),
      abs: () => Math.abs(a[0]), rad: () => a[0] * Math.PI / 180, min: () => Math.min(...a), max: () => Math.max(...a) }[f]();
    return fin(v, text);
  }
  const a = ev(n[2], look, x, text), b = ev(n[3], look, x, text);
  if (a == null || b == null) return null;
  let v;
  if (n[1] === "^") { if (a < 0 && b !== Math.trunc(b)) throw new SceneError("expr-value", `${text}: ^ out of range`); v = a ** b; }
  else if (n[1] === "/") { if (b === 0) throw new SceneError("expr-value", `${text}: / out of range`); v = a / b; }
  else v = n[1] === "+" ? a + b : n[1] === "-" ? a - b : a * b;
  if (!Number.isFinite(v)) throw new SceneError("expr-value", `${text}: ${n[1]} out of range`);
  return v;
}
/** the value of one expression. env: {name|"id.prop": number | null} or a function key -> number | null | undefined (undefined =
 *  no such name). null = not known (propagates). Every step finite; the final value within ±10000 (middle steps may pass it). */
export function exprEval(text, env, { allowX = false, x = null } = {}) {
  const look = typeof env === "function" ? env : k => (Object.hasOwn(env || {}, k) ? env[k] : undefined);
  const v = ev(exprParse(text, allowX), look, x, String(text));
  if (v != null && Math.abs(v) > VAL_MAX) throw new SceneError("expr-value", `${text}: ${v} is over ${VAL_MAX}`);
  return v;
}

/** a {qid} value as the student reads it: 3 significant figures, trailing zeros trimmed, a real minus sign */
export function fmt3(v) {
  if (v == null || !Number.isFinite(v)) return "?";
  if (v === 0) return "0";
  const s = String(Number(Math.abs(v).toPrecision(3)));
  return (v < 0 ? "−" : "") + (/e/.test(s) ? String(Math.round(Math.abs(Number(Math.abs(v).toPrecision(3))))) : s);
}

// ─── model ───
const ANCHOR = /^([A-Za-z][A-Za-z0-9_]*)(?:\.([A-Za-z][A-Za-z0-9]*))?(?:@(\d*\.?\d+))?$/;
function splitTop(text, sep) {
  const out = []; let depth = 0, cur = "";
  for (const c of String(text)) {
    depth += (c === "(") - (c === ")");
    if (c === sep && depth === 0) { out.push(cur); cur = ""; } else cur += c;
  }
  return [...out, cur];
}
function geomPairs(geom) {
  const out = {};
  for (const pair of String(geom || "").split(/\s+/).filter(Boolean)) {
    const m = /^([a-z]+)=(\S+)$/.exec(pair);
    if (m && !(m[1] in out)) out[m[1]] = m[2];
  }
  return out;
}
const OBJ = new Set(["Shape", "Link", "Axes", "MathRows", "Code", "Trace", "Cells", "Bars"]);
/** Scene props + its Steps' step props (parsed OpenUI elements) -> the model every step is solved from */
export function sceneModel(sc, steps = []) {
  const objs = new Map(), qs = new Map(), items = new Map();
  for (const el of sc.objs || []) {
    if (!el || !OBJ.has(el.typeName) || !el.props?.id) continue;
    const p = el.props;
    objs.set(p.id, { id: p.id, type: el.typeName, kind: p.kind, p, g: geomPairs(p.geom) });
    if (el.typeName === "Axes") for (const it of p.items || []) {
      const [iid, kind, ...rest] = String(it).split(/\s+/);
      if (iid && kind) items.set(iid, { id: iid, ax: p.id, kind, rest: String(it).split(/\s+/).length > 2 ? String(it).replace(/^\s*\S+\s+\S+\s*/, "") : "" });
    }
  }
  for (const el of sc.qs || []) if (el && el.typeName === "Q" && el.props?.id) qs.set(el.props.id, el.props);
  const rels = (sc.rels || []).map(r => String(r).trim().split(/\s+/)).filter(t => t.length > 1).map(t => ({ word: t[0], args: t.slice(1) }));
  return {
    objs, qs, items, rels, alt: sc.alt || "",
    steps: steps.map(s => ({ cap: s?.cap || "", ops: (s?.ops || []).map(o => String(o).trim().split(/\s+/)).filter(t => t[0]),
      ask: s?.ask && s.ask.props ? { q: s.ask.props.q || "", choices: s.ask.props.choices || [] } : null })),
  };
}

/** the state after steps 1..k+1 (k 0-based): a pure replay, so Back is exact (§6) */
export function stateAt(model, k) {
  const st = { k, visible: [], sets: new Map(), params: new Map(), camera: null, glow: new Set() };
  for (let j = 0; j <= Math.min(k, model.steps.length - 1); j++) {
    for (const [w, ...a] of model.steps[j].ops) {
      if (w === "add") for (const i of a) { if (!st.visible.includes(i)) st.visible.push(i); }
      else if (w === "hide") st.visible = st.visible.filter(i => !a.includes(i));
      else if (w === "glow") { if (j === k) a.forEach(i => st.glow.add(i)); }
      else if (w === "camera") st.camera = a[0] === "fit" ? a.slice(1) : null;
      else if (w === "param" && a.length === 2 && Number.isFinite(+a[1])) st.params.set(a[0], +a[1]);
      else if (w === "set" && a.length >= 3) st.sets.set(`${a[0]} ${a[1]}`, a.slice(2).join(" "));
    }
  }
  return st;
}

// ─── geometry helpers (world units, y up, degrees counter-clockwise) ───
const D2R = Math.PI / 180;
const add = (p, q) => [p[0] + q[0], p[1] + q[1]], sub = (p, q) => [p[0] - q[0], p[1] - q[1]], mul = (p, k) => [p[0] * k, p[1] * k];
const lerpP = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
const rot = (p, deg) => { const c = Math.cos(deg * D2R), s = Math.sin(deg * D2R); return [p[0] * c - p[1] * s, p[0] * s + p[1] * c]; };
const rotAbout = (p, c, deg) => add(c, rot(sub(p, c), deg));
const len = p => Math.hypot(p[0], p[1]);
const unit = p => { const l = len(p) || 1; return [p[0] / l, p[1] / l]; };
const lerp = (a, b, t) => a + (b - a) * t;
const bboxOf = pts => {
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
};

/** a Shape's local frame (relative to its at, unrotated): corners, named anchors, edges */
function shapeLocal(kind, pr) {
  if (kind === "rect") {
    const { w, h } = pr, c = [[0, 0], [w, 0], [w, h], [0, h]];
    return { outline: c, names: { center: [w / 2, h / 2], left: [0, h / 2], right: [w, h / 2], top: [w / 2, h], bottom: [w / 2, 0], corner0: c[0], corner1: c[1], corner2: c[2], corner3: c[3] },
      edges: { top: [c[3], c[2]], bottom: [c[0], c[1]], left: [c[0], c[3]], right: [c[1], c[2]] } };
  }
  if (kind === "circle") {
    const r = pr.r, n = 24;
    return { outline: Array.from({ length: n }, (_, i) => [r * Math.cos(2 * Math.PI * i / n), r * Math.sin(2 * Math.PI * i / n)]), circle: r,
      names: { center: [0, 0], left: [-r, 0], right: [r, 0], top: [0, r], bottom: [0, -r] }, edges: { rim: "rim" } };
  }
  if (kind === "triangle") {
    const b = pr.base, h = pr.height, c = [[0, 0], [b, 0], [(pr.apex ?? 0.5) * b, h]];
    const left = [c[0], c[2]], right = [c[1], c[2]];
    return { outline: c, names: { center: [(c[0][0] + c[1][0] + c[2][0]) / 3, h / 3], top: c[2], bottom: [b / 2, 0], corner0: c[0], corner1: c[1], corner2: c[2] },
      edges: { base: [c[0], c[1]], left, right, hyp: len(sub(left[1], left[0])) > len(sub(right[1], right[0])) ? left : right } };
  }
  if (kind === "polygon") {
    const pts = pr.pts || [[0, 0]], names = { center: [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length] }, edges = {};
    pts.forEach((p, i) => { names[`corner${i}`] = p; edges[`edge${i}`] = [p, pts[(i + 1) % pts.length]]; });
    return { outline: pts, names, edges };
  }
  return { outline: [[0, 0]], names: { center: [0, 0] }, edges: {} };                // point
}

// ─── solve ───
const DEFAULTS = { rotate: 0, radius: 0, apex: 0.5 };
const NUMPROPS = ["w", "h", "r", "base", "height", "apex", "radius", "segments", "rotate"];
/** solve one state: Q values, every object's props, positions and turns, relations in dependency order. mix = { A: an earlier
 *  solved state, t } blends the inputs (given Q values, set props, numeric at / from / to) for a tween frame. */
export function solve(model, st, mix = null) {
  const S = { model, st, q: new Map(), props: new Map(), atIn: new Map(), endsIn: new Map(), geo: new Map(), errors: [] };
  const relSet = new Map(), writes = new Map();                    // "id prop" -> expr; id -> [rel, ...] that place it
  for (const r of model.rels) {
    const [a0] = r.args;
    if (r.word === "set") { const [i, p] = a0.split("."); relSet.set(`${i} ${p}`, r.args[1]); }
    else if (r.word === "attach" || r.word === "on" || r.word === "pivot") (writes.get(a0.split(".")[0]) || writes.set(a0.split(".")[0], []).get(a0.split(".")[0])).push(r);
    else if (["align", "distribute", "stack"].includes(r.word)) {
      const k = r.args.findIndex(a => ["top", "bottom", "left", "right", "centerx", "centery", "x", "y"].includes(a));
      const ids = r.args.slice(0, k);
      ids.slice(1).forEach((i, j) => (writes.get(i) || writes.set(i, []).get(i)).push({ ...r, ids, idx: j + 1, mode: r.args[k], gap: r.args[k + 1] }));
    } else if (r.word === "scale") { /* after the solve */ }
  }
  const busy = new Set();
  const look = key => {                                             // the expression env: Q ids and "id.prop"
    if (model.qs.has(key)) return qv(key);
    const [i, p] = key.split(".");
    if (!p || !model.objs.has(i)) return undefined;
    if (p === "x" || p === "y") { const g = S.geo.get(i); if (g?.at) return g.at[p === "y" ? 1 : 0]; const a = S.atIn.get(i) ?? numPoint(i); return a ? a[p === "y" ? 1 : 0] : null; }
    if (p === "len") { const g = S.geo.get(i); return g?.from && g?.to ? len(sub(g.to, g.from)) : null; }
    return prop(i, p);
  };
  const evalOr = (text, dflt) => { try { const v = exprEval(text, look); return v == null ? dflt : v; } catch (e) { S.errors.push(e); return dflt; } };
  function qv(id) {
    if (S.q.has(id)) return S.q.get(id);
    if (busy.has(id)) return null;
    busy.add(id);
    const p = model.qs.get(id);
    let v = null;
    if (p.role === "given") {
      v = st.params.has(id) ? st.params.get(id) : (typeof p.value === "number" ? p.value : null);
      if (mix && v != null && mix.A.q.get(id) != null) v = lerp(mix.A.q.get(id), v, mix.t);
    } else if ((p.role === "derived" || p.role === "answer") && p.expr != null) {
      try { v = exprEval(p.expr, look); } catch (e) { S.errors.push(e); v = null; }
    }
    busy.delete(id);
    S.q.set(id, v);
    return v;
  }
  function prop(id, p) {
    const pr = S.props.get(id) || S.props.set(id, {}).get(id);
    if (Object.hasOwn(pr, p)) return pr[p];
    const key = `${id}|${p}`;
    if (busy.has(key)) return null;
    busy.add(key);
    const o = model.objs.get(id);
    let v;
    if (relSet.has(`${id} ${p}`)) v = evalOr(relSet.get(`${id} ${p}`), DEFAULTS[p] ?? null);
    else {
      const raw = st.sets.get(`${id} ${p}`) ?? o.g[p];
      v = raw == null ? DEFAULTS[p] ?? null : p === "segments" ? (parseInt(raw, 10) || null) : evalOr(raw, DEFAULTS[p] ?? null);
      if (mix && v != null && p !== "segments") { const a = mix.A.props.get(id)?.[p]; if (a != null) v = lerp(a, v, mix.t); }
    }
    busy.delete(key);
    pr[p] = v;
    return v;
  }
  const isPoint = t => { t = String(t).trim(); return t.includes(",") || !/^[A-Za-z]/.test(t); };
  const point = t => { const [a, b] = splitTop(String(t).trim().replace(/^\+/, ""), ","); return [evalOr(a, 0), evalOr(b ?? "0", 0)]; };
  function numPoint(id) {                                           // a Shape's at when it is a point (no solve needed)
    const o = model.objs.get(id), at = st.sets.get(`${id} at`) ?? o.p.at;
    return at != null && isPoint(at) ? point(at) : at == null ? [0, 0] : null;
  }
  const place = t => (isPoint(t) ? point(t) : S.anchor(t) || [0, 0]);

  /** a live anchor, world units (§1b); null when its object is not solved (yet) */
  S.anchor = text => {
    const m = ANCHOR.exec(String(text).trim());
    if (!m) return null;
    const g = S.geo.get(m[1]);
    if (!g) return null;
    const name = m[2], t = m[3] != null ? +m[3] : null;
    if (g.type === "Link" || g.kind === "line") {
      const a = g.from, b = g.to;
      if (t != null && !name) return lerpP(a, b, t);
      return { start: a, tail: a, end: b, head: b, center: lerpP(a, b, 0.5) }[name || "center"] || lerpP(a, b, 0.5);
    }
    if (t != null && name) {
      const e = g.L.edges[name];
      if (e === "rim") { const r = g.L.circle, th = 2 * Math.PI * t; return g.W([r * Math.cos(th), r * Math.sin(th)]); }
      return e ? g.W(lerpP(e[0], e[1], t)) : g.W(g.L.names.center);
    }
    return g.W(g.L.names[name || "center"] || g.L.names.center);
  };
  /** an edge's world direction, flipped so its left normal points out of its object (what `on` stands a body on) */
  S.edgeDir = (id, name, t) => {
    const g = S.geo.get(id);
    if (!g) return [1, 0];
    let d, mid;
    if (g.type === "Link" || g.kind === "line") { d = sub(g.to, g.from); return d[0] < 0 ? mul(d, -1) : d; }
    const e = g.L.edges[name];
    if (e === "rim") { const th = 2 * Math.PI * t + g.rot * D2R; d = [-Math.sin(th), Math.cos(th)]; mid = S.anchor(`${id}.rim@${t}`); }
    else if (e) { const a = g.W(e[0]), b = g.W(e[1]); d = sub(b, a); mid = lerpP(a, b, 0.5); }
    else return [1, 0];
    const c = g.W(g.L.names.center), n = [-d[1], d[0]];
    return (n[0] * (mid[0] - c[0]) + n[1] * (mid[1] - c[1])) < 0 ? mul(d, -1) : d;
  };

  // dependency order: an object after every object its anchors and relations read
  const ids = [...model.objs.keys()];
  const refOf = t => { if (t == null || isPoint(t)) return null; const m = ANCHOR.exec(String(t).trim()); return m ? m[1] : null; };
  const deps = id => {
    const o = model.objs.get(id), out = new Set();
    for (const t of [o.p.at, o.p.from, o.p.to, o.g.from, o.g.to, o.g.at, st.sets.get(`${id} at`), st.sets.get(`${id} from`), st.sets.get(`${id} to`)]) { const r = refOf(t); if (r) out.add(r); }
    for (const r of writes.get(id) || []) {
      if (r.word === "attach") { const t = refOf(r.args[1]); if (t) out.add(t); }
      else if (r.word === "on") out.add(r.args[1].split(".")[0]);
      else if (r.word === "pivot") { const t = refOf(r.args[1]); if (t) out.add(t); }
      else if (r.word === "stack") out.add(r.ids[r.idx - 1]);
      else out.add(r.ids[0]);
    }
    for (const [k, e] of relSet) if (k.startsWith(id + " ")) { try { for (const ref of exprNames(e).refs) out.add(ref.split(".")[0]); } catch { /* */ } }
    out.delete(id);
    return [...out].filter(i => model.objs.has(i));
  };
  const order = [], mark = new Map();
  const visit = id => { if (mark.get(id)) return; mark.set(id, 1); deps(id).forEach(visit); order.push(id); };
  ids.forEach(visit);
  S.order = order;
  for (const id of model.qs.keys()) qv(id);

  for (const id of order) {
    const o = model.objs.get(id);
    if (o.type === "Shape") solveShape(o);
    else if (o.type === "Link") solveLink(o);
    else S.geo.set(id, { id, type: o.type });
  }
  for (const r of model.rels) if (r.word === "scale") scale(r.args);
  S.dump = () => dumpOf(S);
  return S;

  function solveShape(o) {
    const id = o.id, kind = o.kind;
    if (kind === "line") {
      let from = place(o.g.from ?? "0,0"), to = place(o.g.to ?? "1,0");
      const g = { id, type: "Shape", kind, from, to, rot: 0, at: from, props: {} };
      S.geo.set(id, g);
      return;
    }
    const pr = {};
    for (const p of NUMPROPS) pr[p] = prop(id, p);
    if (kind === "polygon") pr.pts = String(o.g.pts || "0,0").split(";").map(point);
    if (kind === "rect") { pr.w = pr.w || 1; pr.h = pr.h || 1; }
    if (kind === "circle") pr.r = pr.r || 0.5;
    if (kind === "triangle") { pr.base = pr.base || 1; pr.height = pr.height || 1; }
    const L = shapeLocal(kind, pr);
    const atText = st.sets.get(`${id} at`) ?? o.p.at;
    let at = atText == null ? [0, 0] : place(atText);
    if (mix && atText != null && isPoint(atText)) { const a = mix.A.atIn.get(id); if (a) at = lerpP(a, at, mix.t); }
    if (atText == null || isPoint(atText)) S.atIn.set(id, at);
    const g = { id, type: "Shape", kind, props: pr, L, at, rot: pr.rotate || 0, pivSelf: L.names.center, pivWorld: null };
    g.piv = () => (g.pivWorld || add(g.at, g.pivSelf));
    g.W = pl => rotAbout(add(g.at, pl), g.piv(), g.rot);
    g.pts = () => L.outline.map(g.W);
    S.geo.set(id, g);
    for (const r of writes.get(id) || []) {
      if (r.word === "pivot") {
        const m = ANCHOR.exec(r.args[1] || "");
        if (m && m[1] === id) { const nm = m[2], t = m[3] != null ? +m[3] : null; const e = nm && t != null ? L.edges[nm] : null;
          g.pivSelf = e && e !== "rim" ? lerpP(e[0], e[1], t) : L.names[nm || "center"] || L.names.center; }
        else g.pivWorld = place(r.args[1]);
      } else if (r.word === "attach") {
        const [, nm] = r.args[0].split("."), T = place(r.args[1]);
        g.at = add(g.at, sub(T, g.W(L.names[nm || "center"] || L.names.center)));
      } else if (r.word === "on") {
        const [sid, edge] = r.args[1].split("."), t = +r.args[2];
        const P = S.anchor(`${sid}.${edge}@${t}`) || [0, 0], d = S.edgeDir(sid, edge, t);
        g.rot = Math.atan2(d[1], d[0]) / D2R;
        g.pivWorld = null; g.pivSelf = L.names.center;
        g.at = add(g.at, sub(P, g.W(L.names.bottom || L.names.center)));
      } else if (["align", "distribute", "stack"].includes(r.word)) {
        const first = bbox(r.ids[0]), me = bboxOfGeo(g);
        if (!first) continue;
        let dx = 0, dy = 0;
        if (r.word === "align") {
          const m = r.mode;
          if (m === "bottom") dy = first.y0 - me.y0; else if (m === "top") dy = first.y1 - me.y1;
          else if (m === "left") dx = first.x0 - me.x0; else if (m === "right") dx = first.x1 - me.x1;
          else if (m === "centerx") dx = (first.x0 + first.x1 - me.x0 - me.x1) / 2; else if (m === "centery") dy = (first.y0 + first.y1 - me.y0 - me.y1) / 2;
        } else if (r.word === "stack") {
          const prev = bbox(r.ids[r.idx - 1]);
          if (prev) { if (r.mode === "x") dx = prev.x1 - me.x0; else dy = prev.y1 - me.y0; }
        } else {
          const size = r.mode === "x" ? first.x1 - first.x0 : first.y1 - first.y0, gap = r.gap != null ? evalOr(r.gap, size) : size;
          if (r.mode === "x") dx = first.x0 + r.idx * (size + gap) - me.x0; else dy = first.y0 + r.idx * (size + gap) - me.y0;
        }
        g.at = add(g.at, [dx, dy]);
      }
    }
  }
  function bboxOfGeo(g) { return g.kind === "line" || g.type === "Link" ? bboxOf([g.from, g.to]) : g.L.circle ? (() => { const c = g.W([0, 0]), r = g.L.circle; return { x0: c[0] - r, x1: c[0] + r, y0: c[1] - r, y1: c[1] + r }; })() : bboxOf(g.pts()); }
  function bbox(id) { const g = S.geo.get(id); return g && (g.type === "Shape" || g.type === "Link") ? bboxOfGeo(g) : null; }
  function solveLink(o) {
    const id = o.id;
    const fromT = st.sets.get(`${id} from`) ?? o.p.from ?? "0,0", toT = st.sets.get(`${id} to`) ?? o.p.to ?? "+1,0";
    let from = place(fromT);
    let to = String(toT).trim().startsWith("+") ? add(from, point(toT)) : place(toT);
    for (const r of writes.get(id) || []) if (r.word === "attach") {
      const nm = r.args[0].split(".")[1], T = place(r.args[1]);
      if (nm === "start" || nm === "tail") from = T; else if (nm === "end" || nm === "head") to = T;
      else { const d = sub(T, lerpP(from, to, 0.5)); from = add(from, d); to = add(to, d); }
    }
    if (mix) { const a = mix.A.endsIn.get(id); if (a && isPoint(fromT) && isPoint(toT)) { from = lerpP(a[0], from, mix.t); to = lerpP(a[1], to, mix.t); } }
    if (isPoint(fromT) && isPoint(toT)) S.endsIn.set(id, [from, to]);
    const g = { id, type: "Link", kind: o.kind, from, to, rot: 0 };
    if (o.kind === "dimension") g.offset = evalOr(o.g.offset ?? "0.5", 0.5);
    if (o.kind === "angle") { g.vertex = place(o.g.at ?? "0,0"); g.r = evalOr(o.g.r ?? "0.6", 0.6); }
    S.geo.set(id, g);
  }
  function scale(vids) {
    const vs = vids.map(i => S.geo.get(i)).filter(g => g && g.type === "Link");
    const qs = vs.map(g => Math.abs(qv(model.objs.get(g.id).p.q) ?? 0));
    const lens = vs.map(g => len(sub(g.to, g.from)));
    const qmax = Math.max(...qs, 0), lmax = Math.max(...lens, 0);
    if (!(qmax > 0) || !(lmax > 0)) return;
    const k = lmax / qmax;
    vs.forEach((g, i) => { g.to = add(g.from, mul(unit(sub(g.to, g.from)), k * qs[i])); });
  }
}
// a plain dump of a solved state (tests: purity, replay)
function dumpOf(S) {
  const r = n => Math.round(n * 1e9) / 1e9, P = p => p && [r(p[0]), r(p[1])];
  return { q: [...S.q], geo: [...S.geo.values()].map(g => ({ id: g.id, at: P(g.at), rot: g.rot, from: P(g.from), to: P(g.to), pts: g.pts ? g.pts().map(P) : null })) };
}

// ─── text: {qid} tokens by stage (§2), a little TeX, a fixed advance table (deterministic label boxes) ───
const HIDDEN = st => st !== "post";
/** "{T1} N" -> [{s, hid}]: a given / derived token is its value at 3 sig figs; an answer before a solve, and an unknown, its sym or ? */
export function tokenize(text, model, S, stage) {
  const out = [];
  String(text ?? "").split(/(\{[A-Za-z][A-Za-z0-9_]*\})/).forEach((t, i) => {
    if (!(i % 2)) { if (t) out.push({ s: t, hid: false }); return; }
    const id = t.slice(1, -1), q = model.qs.get(id);
    if (!q) { out.push({ s: t, hid: false }); return; }
    const v = S.q.get(id);
    if (q.role === "unknown" || (q.role === "answer" && HIDDEN(stage)) || v == null) out.push({ s: q.sym || "?", hid: true });
    else out.push({ s: fmt3(v), hid: false });
  });
  return out;
}
const GREEK = { alpha: "α", beta: "β", gamma: "γ", delta: "δ", theta: "θ", phi: "φ", pi: "π", mu: "μ", omega: "ω", lambda: "λ", Delta: "Δ", sigma: "σ",
  tau: "τ", rho: "ρ", times: "×", cdot: "·", circ: "°", to: "→", le: "≤", ge: "≥", ne: "≠", approx: "≈", vec: "", text: "", mathrm: "" };
const SUP = { 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹", "-": "⁻" };
/** a short TeX-ish string -> [{s, sub}] (subscripts kept apart so they draw smaller; ^digits become superscripts) */
function texParts(s) {
  s = String(s).replace(/\$/g, "").replace(/\\([A-Za-z]+)/g, (m, w) => GREEK[w] ?? w)
    .replace(/\^\{?(-?\d+)\}?/g, (m, d) => [...d].map(c => SUP[c] || c).join(""));
  const out = [];
  let i = 0, cur = "";
  while (i < s.length) {
    if (s[i] === "_" && i + 1 < s.length) {
      if (cur) { out.push({ s: cur, sub: false }); cur = ""; }
      let j = i + 1, t;
      if (s[j] === "{") { const k = s.indexOf("}", j); t = s.slice(j + 1, k < 0 ? s.length : k); i = k < 0 ? s.length : k + 1; }
      else { const m = /^[A-Za-z0-9]+/.exec(s.slice(j)); t = m ? m[0] : s[j]; i = j + t.length; }
      out.push({ s: t, sub: true });
    } else { cur += s[i] === "{" || s[i] === "}" ? "" : s[i]; i++; }
  }
  if (cur) out.push({ s: cur, sub: false });
  return out;
}
const NARROW = new Set([..."il.,:;'|!()[]1 jtfr"]), WIDE = new Set([..."mwMW@%"]);
const adv = c => (NARROW.has(c) ? 0.32 : WIDE.has(c) ? 0.86 : /[A-Z]/.test(c) ? 0.66 : /[0-9]/.test(c) ? 0.56 : ADV);
const textW = (parts, fs = FS) => parts.reduce((w, p) => w + [...p.s].reduce((a, c) => a + adv(c), 0) * fs * (p.sub ? 0.72 : 1), 0);
/** a label's runs: [{s, sub, hid}] and its box size in px */
function runs(text, model, S, stage) {
  const out = [];
  for (const t of tokenize(text, model, S, stage)) for (const p of texParts(t.s)) {
    const last = out[out.length - 1];
    if (last && last.sub === p.sub && last.hid === t.hid) last.s += p.s; else out.push({ ...p, hid: t.hid });
  }
  return out;
}
const plain = rs => rs.map(r => r.s).join("");

// ─── DOM (no innerHTML: every string the model typed becomes a text node) ───
function el(doc, tag, attrs, ...kids) {
  const svg = !["div", "span", "p", "ol", "li", "code", "b"].includes(tag);
  const n = svg ? doc.createElementNS(SVGNS, tag) : doc.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) if (v != null && v !== false) n.setAttribute(k, String(v));
  for (const k of kids.flat(Infinity)) if (k != null && k !== false) n.append(typeof k === "object" ? k : doc.createTextNode(String(k)));
  return n;
}
const r2 = v => Math.round(v * 100) / 100;
const PTS = ps => ps.map(p => `${r2(p[0])},${r2(p[1])}`).join(" ");
function arrowParts(a, b, w, head) {
  const G = globalThis.Graph;
  if (!G || !G.arrowParts) throw new Error("graph.js is not loaded (Graph.arrowParts)");
  return G.arrowParts(a, b, w, head);
}
/** an arrow as DOM: graph.js's geometry, one class for shaft and head (views.css gives the token colour) */
function arrowEl(doc, a, b, w, cls, head = "fill", both = false) {
  const kids = [];
  const g = arrowParts(a, b, w, head);
  let shaft = g.shaft;
  if (both) { const g2 = arrowParts(b, a, w, head); shaft = [g2.shaft[1], g.shaft[1]]; kids.push(...g2.wedges.map(q => el(doc, "polygon", { class: "hd", points: PTS(q) }))); }
  kids.unshift(el(doc, "line", { x1: r2(shaft[0][0]), y1: r2(shaft[0][1]), x2: r2(shaft[1][0]), y2: r2(shaft[1][1]) }));
  kids.push(...g.wedges.map(q => el(doc, "polygon", { class: "hd", points: PTS(q) })));
  if (g.open) kids.push(el(doc, "polyline", { points: PTS(g.open) }));
  return el(doc, "g", { class: cls }, kids);
}

// ─── layout: regions (§8 slots) and the camera (§6) ───
const GEO = new Set(["Shape", "Link"]);
function regions(model) {
  const by = t => [...model.objs.values()].filter(o => o.type === t).map(o => o.id);
  const geo = [...model.objs.values()].filter(o => GEO.has(o.type)).map(o => o.id), axes = by("Axes"), panels = [...by("Bars"), ...by("Cells")];
  const main = geo.length ? "geo" : axes.length ? "axes" : panels.length ? "panels" : null;
  const side = main === "geo" ? [...axes, ...panels] : main === "axes" ? [...axes.slice(1), ...panels] : [];
  const sideW = side.length ? (side.some(i => model.objs.get(i).type === "Axes") ? 150 : 120) : 0;
  const R = { x: 0, y: 0, w: VIEW.W - sideW, h: VIEW.H }, out = { main, R, slots: new Map() };
  side.forEach((id, i) => out.slots.set(id, { x: VIEW.W - sideW, y: i * VIEW.H / side.length, w: sideW, h: VIEW.H / side.length }));
  if (main === "axes") out.slots.set(axes[0], R);
  if (main === "panels") panels.forEach((id, i) => out.slots.set(id, { x: i * VIEW.W / panels.length, y: 0, w: VIEW.W / panels.length, h: VIEW.H }));
  return out;
}
function worldPts(g) {
  if (!g) return [];
  if (g.type === "Link") {
    const out = [g.from, g.to];
    if (g.kind === "dimension") { const n = unit([-(g.to[1] - g.from[1]), g.to[0] - g.from[0]]); out.push(add(g.from, mul(n, g.offset)), add(g.to, mul(n, g.offset))); }
    if (g.kind === "angle") out.push(g.vertex);
    return out;
  }
  if (g.kind === "line") return [g.from, g.to];
  if (g.L.circle) { const c = g.W([0, 0]), r = g.L.circle; return [[c[0] - r, c[1] - r], [c[0] + r, c[1] + r]]; }
  return g.pts();
}
function camera(model, S, st, R) {
  const geoIds = [...model.objs.values()].filter(o => GEO.has(o.type)).map(o => o.id);
  let ids = st.camera ? st.camera.filter(i => S.geo.has(i)) : st.visible.filter(i => geoIds.includes(i));
  if (!ids.length) ids = geoIds;
  const pts = ids.flatMap(i => worldPts(S.geo.get(i))).filter(p => Number.isFinite(p[0]) && Number.isFinite(p[1]));
  if (!pts.length) return { cx: 0, cy: 0, s: 40 };
  const b = bboxOf(pts), bw = b.x1 - b.x0, bh = b.y1 - b.y0;
  const s = Math.min(bw > 1e-9 ? (R.w - 2 * PAD) / bw : Infinity, bh > 1e-9 ? (R.h - 2 * PAD) / bh : Infinity, 400);
  return { cx: (b.x0 + b.x1) / 2, cy: (b.y0 + b.y1) / 2, s: Number.isFinite(s) ? s : 40 };
}

// ─── the label placer: 8 candidates around the anchor, scored by overlap; a second and third ring with a leader line ───
const DIRS = { e: [1, 0], ne: [1, 1], n: [0, 1], nw: [-1, 1], w: [-1, 0], sw: [-1, -1], s: [0, -1], se: [1, -1] };   // screen: y down, so n = up
const ORDER = ["n", "e", "s", "w", "ne", "nw", "se", "sw"];
/** the box (x, y, w, h) of a label of size w x h on side `dir` of a target (a point, or a box) at distance d */
function candBox(t, dir, w, h, d) {
  const [dx, dy] = DIRS[dir], b = t.box || [t.pt[0], t.pt[1], 0, 0];
  const ax = dx > 0 ? b[0] + b[2] : dx < 0 ? b[0] : b[0] + b[2] / 2, ay = dy > 0 ? b[1] : dy < 0 ? b[1] + b[3] : b[1] + b[3] / 2;
  const dd = dx && dy ? d * 0.7 : d;
  const x = dx > 0 ? ax + dd : dx < 0 ? ax - dd - w : ax - w / 2, y = dy > 0 ? ay - dd - h : dy < 0 ? ay + dd : ay - h / 2;
  return [x, y, w, h];
}
const area = b => b[2] * b[3];
const overlap = (p, q) => Math.max(0, Math.min(p[0] + p[2], q[0] + q[2]) - Math.max(p[0], q[0])) * Math.max(0, Math.min(p[1] + p[3], q[1] + q[3]) - Math.max(p[1], q[1]));
function segHitsBox(a, b, box) {
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
const inBox = (b, R) => b[0] >= R.x - 1e-9 && b[1] >= R.y - 1e-9 && b[0] + b[2] <= R.x + R.w + 1e-9 && b[1] + b[3] <= R.y + R.h + 1e-9;
function place(reqs, segs, bodies, R, fixed) {
  const placed = [];
  for (const q of reqs) {
    const w = q.w + 6, h = LH;
    let best = null;
    const tryOne = (dir, ring, pen) => {
      const box = candBox(q.t, dir, w, h, ring);
      let sc = pen;
      if (!inBox(box, q.R || R)) sc += 1e5;
      for (const p of placed) if (overlap(box, p.box) > 0) sc += 1e4 + overlap(box, p.box);
      for (const s of segs) if (segHitsBox(s.pts[0], s.pts[1], box)) sc += s.id === q.id ? 12 : 30;
      for (const b of bodies) if (b.id !== q.id && overlap(box, b.box) > 0) sc += 20 * overlap(box, b.box) / area(box);
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
function leaderOf(t, box) {
  const p = t.pt || [t.box[0] + t.box[2] / 2, t.box[1] + t.box[3] / 2];
  const q = [Math.max(box[0], Math.min(p[0], box[0] + box[2])), Math.max(box[1], Math.min(p[1], box[1] + box[3]))];
  return Math.hypot(q[0] - p[0], q[1] - p[1]) > 8 ? [p, q] : null;
}

// ─── one frame ───
const roleOf = o => o.p.role || "body";
/** one step drawn. opts: { doc, mix: {A: frame-state of the step tweened from, t}, fixed: label choices to keep (tween frames) } */
export function frame(model, k, stage = "wrong", opts = {}) {
  const doc = opts.doc, st = stateAt(model, k), mix = opts.mix;
  const S = solve(model, st, mix ? { A: mix.A.S, t: mix.t } : null);
  const reg = regions(model), R = reg.R;
  let cam = camera(model, S, st, R);
  if (mix) { const a = mix.A.cam; cam = { cx: lerp(a.cx, cam.cx, mix.t), cy: lerp(a.cy, cam.cy, mix.t), s: lerp(a.s, cam.s, mix.t) }; }
  const X = p => [R.x + R.w / 2 + (p[0] - cam.cx) * cam.s, R.y + R.h / 2 - (p[1] - cam.cy) * cam.s];
  const vis = new Set(st.visible), glow = st.glow;
  const opa = id => (!mix ? (vis.has(id) ? 1 : 0) : vis.has(id) ? (mix.A.vis.has(id) ? 1 : mix.t) : (mix.A.vis.has(id) ? 1 - mix.t : 0));
  const out = { S, st, cam, vis, labels: [], segs: [], math: [], ticks: {}, bars: {}, code: null, svg: null, reg };
  const reqs = [], bodies = [], layers = [[], [], [], [], [], [], []];
  const seg = (id, a, b) => out.segs.push({ id, pts: [a, b] });
  const raw = text => tokenize(text, model, S, stage).map(t => t.s).join("");
  const label = (id, text, t, extra = {}) => {
    if (!text) return;
    const rs = runs(text, model, S, stage);
    reqs.push({ key: extra.key || id, id, text: raw(text), rs, hid: rs.some(r => r.hid), w: textW(rs), t, focus: glow.has(id), ...extra });
  };
  const ids = model.objs.size ? [...model.objs.keys()] : [];
  const drawOrder = [...ids.filter(i => glow.has(i)), ...ids.filter(i => !glow.has(i))];
  // main: shapes and links
  if (reg.main === "geo") for (const id of ids) {
    const o = model.objs.get(id), g = S.geo.get(id), op = opa(id);
    if (!GEO.has(o.type) || !g || op <= 0) continue;
    const role = roleOf(o);
    if (role === "right" && HIDDEN(stage)) continue;                         // --correct only after a solve (§8)
    const focus = glow.has(id) ? " focus" : "";
    const gAttrs = { "data-id": id, "data-rot": String(r2(g.rot || 0)), style: op < 1 ? `opacity:${r2(op)}` : null };
    if (o.type === "Shape") drawShape(o, g, role, focus, gAttrs);
    else drawLink(o, g, focus, gAttrs);
  }
  function drawShape(o, g, role, focus, gAttrs) {
    const id = o.id, cls = `sc-o sc-${role}${focus}`;
    if (o.kind === "point") {
      const p = X(g.at);
      const mark = role === "yours" ? el(doc, "path", { d: `M${r2(p[0] - 5)},${r2(p[1] - 5)}L${r2(p[0] + 5)},${r2(p[1] + 5)}M${r2(p[0] + 5)},${r2(p[1] - 5)}L${r2(p[0] - 5)},${r2(p[1] + 5)}` })
        : role === "right" ? el(doc, "circle", { cx: r2(p[0]), cy: r2(p[1]), r: 7 }) : el(doc, "circle", { cx: r2(p[0]), cy: r2(p[1]), r: 4.5 });
      layers[5].push(el(doc, "g", { ...gAttrs, class: `${cls} sc-pt` }, mark));
      bodies.push({ id, box: [p[0] - 5, p[1] - 5, 10, 10] });
      label(id, o.p.label, { pt: p }, { dirs: ["ne", "nw", "se", "sw", "n", "e", "s", "w"] });
      return;
    }
    if (o.kind === "line") {
      const a = X(g.from), b = X(g.to);
      const kids = [el(doc, "line", { x1: r2(a[0]), y1: r2(a[1]), x2: r2(b[0]), y2: r2(b[1]) })];
      if (role === "ground") kids.push(hatch(a, b));
      layers[role === "guide" ? 1 : 0].push(el(doc, "g", { ...gAttrs, class: `${cls} sc-line` }, kids));
      seg(id, a, b);
      label(id, o.p.label, { pt: lerpP(a, b, 0.5) });
      return;
    }
    const pts = g.pts().map(X), kids = [];
    if (g.L.circle) { const c = X(g.W([0, 0])); kids.push(el(doc, "circle", { cx: r2(c[0]), cy: r2(c[1]), r: r2(g.L.circle * cam.s) })); }
    else if (o.kind === "rect" && g.props.radius > 0) kids.push(el(doc, "path", { d: rounded(pts, g.props.radius * cam.s) }));
    else kids.push(el(doc, "polygon", { points: PTS(pts) }));
    if (o.kind === "rect" && g.props.segments > 1) {
      const n = g.props.segments, { w, h } = g.props, long = w >= h;
      for (let i = 1; i < n; i++) {
        const a = X(g.W(long ? [w * i / n, 0] : [0, h * i / n])), b = X(g.W(long ? [w * i / n, h] : [w, h * i / n]));
        kids.push(el(doc, "line", { class: "sc-seg", x1: r2(a[0]), y1: r2(a[1]), x2: r2(b[0]), y2: r2(b[1]) }));
      }
    }
    if (o.p.art) kids.push(...art(o.p.art, g));
    layers[role === "region" ? 0 : role === "guide" ? 1 : 2].push(el(doc, "g", { ...gAttrs, class: `${cls} sc-${o.kind}` }, kids));
    for (let i = 0; i < pts.length; i++) seg(id, pts[i], pts[(i + 1) % pts.length]);
    const b = bboxOf(pts);
    bodies.push({ id, box: [b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0] });
    label(id, o.p.label, { box: [b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0] });
  }
  function rounded(pts, r) {
    const n = pts.length;
    let d = "";
    for (let i = 0; i < n; i++) {
      const p = pts[i], a = pts[(i + n - 1) % n], b = pts[(i + 1) % n];
      const rr = Math.min(r, len(sub(a, p)) / 2, len(sub(b, p)) / 2), pa = add(p, mul(unit(sub(a, p)), rr)), pb = add(p, mul(unit(sub(b, p)), rr));
      d += `${i ? "L" : "M"}${r2(pa[0])},${r2(pa[1])}Q${r2(p[0])},${r2(p[1])} ${r2(pb[0])},${r2(pb[1])}`;
    }
    return d + "Z";
  }
  function hatch(a, b) {
    // the hatch sits on the side away from the rest of the scene (a floor hatches below, a ceiling above)
    const all = [...S.geo.values()].filter(g => g.type && GEO.has(g.type)).flatMap(worldPts).map(X);
    const c = all.length ? [all.reduce((s, p) => s + p[0], 0) / all.length, all.reduce((s, p) => s + p[1], 0) / all.length] : [0, 0];
    const u = unit(sub(b, a)), L = len(sub(b, a));
    let n = [-u[1], u[0]];
    if ((c[0] - a[0]) * n[0] + (c[1] - a[1]) * n[1] > 0) n = mul(n, -1);
    const hv = unit(add(n, mul(u, -1))), lines = [];
    for (let t = 4 + 7; t <= L - 4 + 0.01; t += 8) {
      const p = add(a, mul(u, t)), q = add(p, mul(hv, 10));
      lines.push(`M${r2(p[0])},${r2(p[1])}L${r2(q[0])},${r2(q[1])}`);
    }
    return el(doc, "path", { class: "sc-hatch", d: lines.join("") });
  }
  function art(kind, g) {
    const lo = g.L.circle ? [-g.L.circle, -g.L.circle] : [0, 0];
    const hi = g.L.circle ? [g.L.circle, g.L.circle] : o2(g);
    const P = (x, y) => X(g.W([lo[0] + (hi[0] - lo[0]) * x, lo[1] + (hi[1] - lo[1]) * y]));
    const path = segs => el(doc, "path", { class: "sc-art", d: segs.map(s => s.map((p, i) => `${i ? "L" : "M"}${r2(P(...p)[0])},${r2(P(...p)[1])}`).join("")).join("") });
    const ring = (x, y, r) => { const c = P(x, y), rr = r * Math.min(hi[0] - lo[0], hi[1] - lo[1]) * cam.s; return el(doc, "circle", { class: "sc-art", cx: r2(c[0]), cy: r2(c[1]), r: r2(rr) }); };
    const A = {
      ball: () => [path([[[0.5, 0.15], [0.5, 0.85]]])],
      cart: () => [ring(0.22, 0, 0.14), ring(0.78, 0, 0.14)],
      pulley: () => [ring(0.5, 0.5, 0.3), ring(0.5, 0.5, 0.06)],
      battery: () => [path([[[0.42, 0.2], [0.42, 0.8]], [[0.58, 0.35], [0.58, 0.65]]])],
      resistor: () => [path([[[0.1, 0.5], [0.2, 0.75], [0.35, 0.25], [0.5, 0.75], [0.65, 0.25], [0.8, 0.75], [0.9, 0.5]]])],
      bulb: () => [path([[[0.35, 0.3], [0.45, 0.6], [0.55, 0.3], [0.65, 0.6]]])],
      capacitor: () => [path([[[0.44, 0.15], [0.44, 0.85]], [[0.56, 0.15], [0.56, 0.85]]])],
      magnet: () => [path([[[0.5, 0], [0.5, 1]]])],
      lens: () => [path([[[0.5, 0.05], [0.62, 0.5], [0.5, 0.95]], [[0.5, 0.05], [0.38, 0.5], [0.5, 0.95]]])],
      mirror: () => [path([[[0.8, 0.1], [0.95, 0.25]], [[0.8, 0.4], [0.95, 0.55]], [[0.8, 0.7], [0.95, 0.85]]])],
      piston: () => [path([[[0.5, 1], [0.5, 1.6]]])],
      thermometer: () => [ring(0.5, 0.15, 0.12), path([[[0.5, 0.27], [0.5, 0.85]]])],
      flame: () => [path([[[0.5, 0.9], [0.7, 0.45], [0.6, 0.15], [0.5, 0.3], [0.4, 0.15], [0.3, 0.45], [0.5, 0.9]]])],
      snowflake: () => [path([[[0.5, 0.1], [0.5, 0.9]], [[0.15, 0.3], [0.85, 0.7]], [[0.15, 0.7], [0.85, 0.3]]])],
      block: () => [],
    };
    return (A[kind] || (() => []))();
  }
  function o2(g) { return g.kind === "rect" ? [g.props.w, g.props.h] : g.kind === "triangle" ? [g.props.base, g.props.height] : (() => { const b = bboxOf(g.L.outline); return [b.x1, b.y1]; })(); }
  function drawLink(o, g, focus, gAttrs) {
    const id = o.id, a = X(g.from), b = X(g.to), mid = lerpP(a, b, 0.5), cls = `sc-o${focus}`;
    const lab = o.p.label || ((o.kind === "dimension" || o.kind === "angle") && o.p.q ? `{${o.p.q}}` : null);
    const u = unit(sub(b, a)), nrm = [u[1], -u[0]];                       // screen normal on the left of a -> b (y down)
    const toward = (v) => { const [x, y] = v, ang = Math.atan2(-y, x) / D2R; return ["e", "ne", "n", "nw", "w", "sw", "s", "se"][Math.floor(((ang + 360 + 22.5) % 360) / 45)]; };
    const fan = d0 => { const i = ORDER2.indexOf(d0); return [0, 1, -1, 2, -2, 3, -3, 4].map(k => ORDER2[(i + k + 8) % 8]); };
    if (o.kind === "vector" || o.kind === "arrow") {
      const vec = o.kind === "vector", head = (o.g.head || "end");
      const node = head === "none" ? el(doc, "g", { class: "sc-arrow" }, el(doc, "line", { x1: r2(a[0]), y1: r2(a[1]), x2: r2(b[0]), y2: r2(b[1]) }))
        : arrowEl(doc, a, b, vec ? 3 : 2, vec ? "sc-vec" : "sc-arrow", "fill", head === "both");
      layers[6].push(el(doc, "g", { ...gAttrs, class: `${cls} sc-${o.kind}` }, node));
      seg(id, a, b);
      label(id, lab, { pt: b }, { dirs: fan(toward(u)) });
      return;
    }
    if (o.kind === "string") {
      layers[3].push(el(doc, "g", { ...gAttrs, class: `${cls} sc-string` }, el(doc, "line", { x1: r2(a[0]), y1: r2(a[1]), x2: r2(b[0]), y2: r2(b[1]) })));
      seg(id, a, b);
      label(id, lab, { pt: mid }, { dirs: fan(toward(nrm)) });
      return;
    }
    if (o.kind === "spring") {
      const L = len(sub(b, a)), coils = Math.max(3, Math.min(12, parseInt(o.g.coils, 10) || 6)), A = 6, lead = Math.min(14, Math.max(4, 0.12 * L)), pts = [a, add(a, mul(u, lead))];
      for (let i = 0; i < 2 * coils; i++) { const t = lead + (L - 2 * lead) * (i + 0.5) / (2 * coils), sg = i % 2 ? -1 : 1; pts.push(add(add(a, mul(u, t)), mul(nrm, sg * A))); }
      pts.push(sub(b, mul(u, lead)), b);
      layers[3].push(el(doc, "g", { ...gAttrs, class: `${cls} sc-spring` }, el(doc, "polyline", { points: PTS(pts) })));
      seg(id, add(a, mul(nrm, A)), add(b, mul(nrm, A))); seg(id, add(a, mul(nrm, -A)), add(b, mul(nrm, -A)));
      label(id, lab, { pt: add(mid, mul(nrm, A)) }, { dirs: fan(toward(nrm)) });
      return;
    }
    if (o.kind === "dimension") {
      const wn = unit([-(g.to[1] - g.from[1]), g.to[0] - g.from[0]]);
      const A2 = X(add(g.from, mul(wn, g.offset))), B2 = X(add(g.to, mul(wn, g.offset)));
      const sn = unit(sub(A2, a)), over = mul(sn, 4), gapv = mul(sn, Math.min(3, len(sub(A2, a)) / 3));
      const kids = [el(doc, "line", { class: "ext", x1: r2(a[0] + gapv[0]), y1: r2(a[1] + gapv[1]), x2: r2(A2[0] + over[0]), y2: r2(A2[1] + over[1]) }),
        el(doc, "line", { class: "ext", x1: r2(b[0] + gapv[0]), y1: r2(b[1] + gapv[1]), x2: r2(B2[0] + over[0]), y2: r2(B2[1] + over[1]) })];
      const m2 = lerpP(A2, B2, 0.5);
      kids.push(arrowEl(doc, m2, A2, 1.5, "sc-dimline"), arrowEl(doc, m2, B2, 1.5, "sc-dimline"));
      layers[4].push(el(doc, "g", { ...gAttrs, class: `${cls} sc-dim` }, kids));
      seg(id, A2, B2);
      label(id, lab, { pt: m2 }, { dirs: fan(toward(len(sn) ? sn : nrm)) });
      return;
    }
    if (o.kind === "angle") {
      const V = X(g.vertex), r = Math.max(14, g.r * cam.s), da = unit(sub(a, V)), db = unit(sub(b, V));
      let a0 = Math.atan2(-da[1], da[0]), a1 = Math.atan2(-db[1], db[0]), d = ((a1 - a0) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
      if (d > Math.PI) { [a0, a1] = [a1, a0]; d = 2 * Math.PI - d; }
      const P0 = [V[0] + r * Math.cos(a0), V[1] - r * Math.sin(a0)], P1 = [V[0] + r * Math.cos(a0 + d), V[1] - r * Math.sin(a0 + d)];
      layers[4].push(el(doc, "g", { ...gAttrs, class: `${cls} sc-angle` }, el(doc, "path", { d: `M${r2(P0[0])},${r2(P0[1])}A${r2(r)},${r2(r)} 0 0 0 ${r2(P1[0])},${r2(P1[1])}` })));
      const mida = a0 + d / 2, bis = [Math.cos(mida), -Math.sin(mida)];
      seg(id, P0, P1);
      label(id, lab, { pt: add(V, mul(bis, r)) }, { dirs: fan(toward(bis)) });
    }
  }
  // side and main panels: axes, bars, cells
  for (const [id, box] of reg.slots) {
    const o = model.objs.get(id), op = opa(id);
    if (op <= 0) { if (o.type === "Axes") out.ticks[id] = { x: [], y: [] }; continue; }
    const gAttrs = { "data-id": id, style: op < 1 ? `opacity:${r2(op)}` : null };
    if (o.type === "Axes") drawAxes(o, box, gAttrs);
    else if (o.type === "Bars") drawBars(o, box, gAttrs);
    else if (o.type === "Cells") drawCells(o, box, gAttrs);
  }
  function hiddenVals() {
    if (!HIDDEN(stage)) return [];
    return [...model.qs.entries()].filter(([, q]) => q.role === "answer").map(([i]) => S.q.get(i)).filter(v => v != null);
  }
  function drawAxes(o, B, gAttrs) {
    const id = o.id, rng = t => { const m = /^\s*([^,\s]+)\s*,\s*(\S+)(?:\s+(.*))?$/.exec(String(t || "")); if (!m) return { lo: 0, hi: 1, lab: "" };
      let lo = 0, hi = 1; try { lo = exprEval(m[1], k2 => (model.qs.has(k2) ? S.q.get(k2) : undefined)) ?? 0; hi = exprEval(m[2], k2 => (model.qs.has(k2) ? S.q.get(k2) : undefined)) ?? 1; } catch { /* */ }
      return { lo, hi: hi > lo ? hi : lo + 1, lab: m[3] || "" }; };
    const xr = rng(o.p.x), yr = rng(o.p.y);
    const P = { x: B.x + 34, y: B.y + 16, w: B.w - 34 - 12, h: B.h - 16 - 24 };
    const XA = (x, y) => [P.x + (x - xr.lo) / (xr.hi - xr.lo) * P.w, P.y + P.h - (y - yr.lo) / (yr.hi - yr.lo) * P.h];
    const hid = hiddenVals(), keep = v => !hid.some(a => Math.abs(v - a) <= 0.15 * Math.abs(a) + 1e-12);
    const tk = (lo, hi, px) => { const raw0 = (hi - lo) / Math.max(2, Math.floor(px)), p10 = 10 ** Math.floor(Math.log10(raw0)), step = [1, 2, 5, 10].map(f => f * p10).find(v => v >= raw0 - 1e-12);
      const out = []; for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(10)); return out; };
    const xt = tk(xr.lo, xr.hi, P.w / 48).filter(keep), yt = tk(yr.lo, yr.hi, P.h / 30).filter(keep);   // ~48 px between x ticks, ~30 between y ticks
    out.ticks[id] = { x: xt, y: yt };
    const kids = [];
    for (const v of xt) { const [x] = XA(v, yr.lo); kids.push(el(doc, "line", { class: "sc-grid", x1: r2(x), y1: r2(P.y), x2: r2(x), y2: r2(P.y + P.h) }), Math.abs(v - xr.lo) < 1e-9 && yt.length ? null : el(doc, "text", { class: "sc-tick", x: r2(x), y: r2(P.y + P.h + 15), "text-anchor": "middle" }, fmt3(v))); }
    for (const v of yt) { const [, y] = XA(xr.lo, v); kids.push(el(doc, "line", { class: "sc-grid", x1: r2(P.x), y1: r2(y), x2: r2(P.x + P.w), y2: r2(y) }), el(doc, "text", { class: "sc-tick", x: r2(P.x - 5), y: r2(y + 4.5), "text-anchor": "end" }, fmt3(v))); }
    kids.push(arrowEl(doc, [P.x, P.y + P.h], [P.x + P.w + 8, P.y + P.h], 1.5, "sc-axis"), arrowEl(doc, [P.x, P.y + P.h], [P.x, P.y - 8], 1.5, "sc-axis"));
    const f = new Map(), ev2 = (t, x) => { try { return exprEval(t, k2 => (model.qs.has(k2) ? S.q.get(k2) : undefined), { allowX: x != null, x }); } catch { return null; } };
    const items = [...model.items.values()].filter(it => it.ax === id);
    for (const it of items) if (it.kind === "curve") f.set(it.id, x => ev2(it.rest, x));
    for (const it of items) if (it.kind === "line") { const pts = it.rest.split(";").map(s => splitTop(s, ",").map(t => ev2(t.trim()))); f.set(it.id, x => { for (let i = 1; i < pts.length; i++) if (x <= pts[i][0] + 1e-12) { const [a, b] = [pts[i - 1], pts[i]]; return a[1] + (b[1] - a[1]) * (x - a[0]) / ((b[0] - a[0]) || 1); } return pts[pts.length - 1][1]; }); }
    const clipY = y => Math.max(yr.lo, Math.min(yr.hi, y));
    let series = 0;
    for (const it of items) {
      const focus = glow.has(it.id) ? " focus" : "", a = it.rest.split(/\s+/);
      if (it.kind === "curve" || it.kind === "line") {
        const runsP = [[]];
        if (it.kind === "line") runsP[0] = it.rest.split(";").map(s => splitTop(s, ",").map(t => ev2(t.trim()))).filter(p => p[0] != null && p[1] != null).map(p => XA(p[0], clipY(p[1])));
        else for (let i = 0; i <= 96; i++) { const x = xr.lo + (xr.hi - xr.lo) * i / 96, y = f.get(it.id)(x); if (y == null || y < yr.lo - 1e-9 || y > yr.hi + 1e-9) { if (runsP.at(-1).length) runsP.push([]); continue; } runsP.at(-1).push(XA(x, y)); }
        const sc = ["", " s2", " s3"][Math.min(2, series++)];
        kids.push(el(doc, "g", { class: `sc-curve${sc}${focus}`, "data-item": it.id }, runsP.filter(r => r.length > 1).map(r => el(doc, "polyline", { points: PTS(r) }))));
        for (const r of runsP) for (let i = 1; i < r.length; i++) seg(it.id, r[i - 1], r[i]);
        const flat = runsP.flat(), at = flat.length ? flat[Math.min(flat.length - 1, Math.floor(0.85 * (flat.length - 1)))] : null;
        if (at) reqs.push({ key: it.id, id: it.id, text: it.id, rs: [{ s: it.id, sub: false, hid: false }], hid: false, w: textW([{ s: it.id }]), t: { pt: at }, focus: !!focus, R: P, dirs: ["ne", "e", "n", "nw", "se", "w", "sw", "s"] });
        continue;
      }
      const fn = f.get(a[0]) || (() => null);
      const num = (t, prop) => { const sv = st.sets.get(`${it.id} ${prop}`); return ev2(sv ?? t); };
      if (it.kind === "area" || it.kind === "riemann") {
        const x0 = num(a[1]), x1 = num(a[2]), base = clipY(0);
        if (x0 == null || x1 == null) continue;
        if (it.kind === "area") {
          const pts = [XA(x0, base)];
          for (let i = 0; i <= 48; i++) { const x = x0 + (x1 - x0) * i / 48; pts.push(XA(x, clipY(fn(x) ?? base))); }
          pts.push(XA(x1, base));
          kids.push(el(doc, "polygon", { class: `sc-area${focus}`, "data-item": it.id, points: PTS(pts) }));
        } else {
          const n = Math.max(1, Math.min(200, Math.round(num(a[3], "n") ?? 1))), rule = a[4], dx = (x1 - x0) / n, g2 = [];
          for (let i = 0; i < n; i++) {
            const l = x0 + i * dx, r = l + dx;
            if (rule === "trap") g2.push(el(doc, "polygon", { points: PTS([XA(l, base), XA(l, clipY(fn(l) ?? base)), XA(r, clipY(fn(r) ?? base)), XA(r, base)]) }));
            else { const xs = rule === "right" ? r : rule === "mid" ? (l + r) / 2 : l, h = clipY(fn(xs) ?? base); g2.push(el(doc, "polygon", { points: PTS([XA(l, base), XA(l, h), XA(r, h), XA(r, base)]) })); }
          }
          kids.push(el(doc, "g", { class: `sc-riem${focus}`, "data-item": it.id }, g2));
        }
      } else if (it.kind === "tangent" || it.kind === "pointon") {
        const x0 = num(a[1], "x"), y0 = x0 == null ? null : fn(x0);
        if (y0 == null) continue;
        if (it.kind === "tangent") {
          const hh = 1e-4 * (xr.hi - xr.lo), sl = ((fn(x0 + hh) ?? y0) - (fn(x0 - hh) ?? y0)) / (2 * hh), dx = 0.2 * (xr.hi - xr.lo);
          kids.push(el(doc, "line", { class: `sc-tan${focus}`, "data-item": it.id, ...(([p, q]) => ({ x1: r2(p[0]), y1: r2(p[1]), x2: r2(q[0]), y2: r2(q[1]) }))([XA(x0 - dx, clipY(y0 - sl * dx)), XA(x0 + dx, clipY(y0 + sl * dx))]) }));
        }
        const p = XA(x0, clipY(y0));
        kids.push(el(doc, "circle", { class: `sc-pton${focus}`, "data-item": it.id, cx: r2(p[0]), cy: r2(p[1]), r: 4 }));
      } else if (it.kind === "marker") {
        const v = num(a[1], "at"), text = a.slice(2).join(" ");
        if (v == null) continue;
        const [p, q] = a[0] === "x" ? [XA(v, yr.lo), XA(v, yr.hi)] : [XA(xr.lo, v), XA(xr.hi, v)];
        kids.push(el(doc, "line", { class: `sc-marker${focus}`, "data-item": it.id, x1: r2(p[0]), y1: r2(p[1]), x2: r2(q[0]), y2: r2(q[1]) }));
        seg(it.id, p, q);
        if (text) { const rs = runs(text, model, S, stage); reqs.push({ key: it.id, id: it.id, text: raw(text), rs, hid: rs.some(r => r.hid), w: textW(rs), t: { pt: a[0] === "x" ? q : p }, focus: !!focus, R: P, dirs: a[0] === "x" ? ["se", "e", "sw"] : ["ne", "se", "n", "s"] }); }
      }
    }
    for (const [lab, pt, dirs] of [[xr.lab, [P.x + P.w, P.y + P.h], ["nw", "n"]], [yr.lab, [P.x, P.y], ["e", "se"]]]) if (lab) {
      const rs = runs(lab, model, S, stage);
      reqs.push({ key: `${id}.${dirs[0]}`, id, text: raw(lab), rs, hid: rs.some(r => r.hid), w: textW(rs), t: { pt }, focus: false, R: B, dirs });
    }
    layers[0].push(el(doc, "g", { ...gAttrs, class: `sc-o sc-axes${glow.has(id) ? " focus" : ""}` }, kids));
  }
  function drawBars(o, B, gAttrs) {
    const id = o.id, items = (o.p.items || []).map(s => /^\s*([^:]+?)\s*:\s*(.+)$/.exec(String(s))).filter(Boolean);
    const val = t => { try { return exprEval(t, k2 => (model.qs.has(k2) ? S.q.get(k2) : undefined)) ?? 0; } catch { return 0; } };
    const vs = items.map(m => Math.max(0, val(m[2]))), tot = o.p.total != null ? Math.max(0, val(o.p.total)) : vs.reduce((a, b) => a + b, 0);
    const kids = [], data = { outline: null, segs: [] }, focus = glow.has(id) ? " focus" : "";
    if (o.p.conserve) {
      const H = B.h - 40, top = B.y + 20, x = B.x + 8, w = 26, k = H / Math.max(tot, vs.reduce((a, b) => a + b, 0), 1e-9);
      let y = top + H;
      vs.forEach((v, i) => { const h = v * k; y -= h; data.segs.push({ h }); if (h > 0.01) kids.push(el(doc, "rect", { class: `sc-bar s${i % 4}`, x: r2(x), y: r2(y), width: w, height: r2(h) })); });
      data.outline = { h: tot * k };
      kids.push(el(doc, "rect", { class: `sc-cons${focus}`, x: r2(x), y: r2(top + H - tot * k), width: w, height: r2(tot * k) }));
      items.forEach((m, i) => {
        const yy = top + i * 24, rs = runs(m[1], model, S, stage), TEXT = m[1];
        kids.push(el(doc, "rect", { class: `sc-bar s${i % 4}`, x: r2(x + w + 8), y: r2(yy + 4.5), width: 10, height: 10 }));
        reqs.push({ key: `${id}.${i}`, id, text: raw(TEXT), rs, hid: rs.some(r => r.hid), w: textW(rs), t: { pt: [x + w + 20, yy] }, spot: [x + w + 20, yy], focus: !!focus, R: B });
      });
    } else {
      const max = Math.max(...vs, tot, 1e-9), w = B.w - 24;
      items.forEach((m, i) => {
        const yy = B.y + 12 + i * 34, rs = runs(m[1], model, S, stage), TEXT = m[1], h = vs[i] / max * w;
        data.segs.push({ h });
        kids.push(el(doc, "rect", { class: `sc-bar s${i % 4}`, x: r2(B.x + 12), y: r2(yy + 20), width: r2(Math.max(h, 1)), height: 10 }));
        reqs.push({ key: `${id}.${i}`, id, text: raw(TEXT), rs, hid: rs.some(r => r.hid), w: textW(rs), t: { pt: [B.x + 9, yy] }, spot: [B.x + 9, yy], focus: !!focus, R: B });
      });
    }
    out.bars[id] = data;
    layers[1].push(el(doc, "g", { ...gAttrs, class: `sc-o sc-bars${focus}` }, kids));
  }
  function drawCells(o, B, gAttrs) {
    const id = o.id, kind = o.kind, items = (o.p.items || []).map(String), focus = glow.has(id) ? " focus" : "";
    const hl = st.sets.has(`${id} hl`) ? st.sets.get(`${id} hl`) : null;
    const ptrs = new Map(String(o.p.ptrs || "").split(/\s+/).filter(Boolean).map(t => t.split(":")));
    for (const [kk, v] of st.sets) { const m = new RegExp(`^${id} ptr\\.(\\w+)$`).exec(kk); if (m) ptrs.set(m[1], v); }
    const rows = kind === "grid" ? items.map(r => r.split(/\s+/)) : kind === "stack" ? items.map(x => [x]).reverse() : [items];
    const nr = rows.length, nc = Math.max(...rows.map(r => r.length), 1), cs = Math.min(34, (B.w - 16) / nc, (B.h - 50) / nr);
    const x0 = B.x + (B.w - nc * cs) / 2, y0 = B.y + (B.h - nr * cs) / 2 + 8, kids = [];
    rows.forEach((r, ri) => r.forEach((t, ci) => {
      const idx = kind === "grid" ? `${ri}.${ci}` : kind === "stack" ? String(items.length - 1 - ri) : String(ci);
      const x = x0 + ci * cs, y = y0 + ri * cs, on = hl === idx;
      kids.push(el(doc, "rect", { class: `sc-cell${on ? " hl" : ""}`, x: r2(x), y: r2(y), width: r2(cs), height: r2(cs) }),
        el(doc, "text", { class: "sc-ctext", x: r2(x + cs / 2), y: r2(y + cs / 2 + 5), "text-anchor": "middle" }, t));
      if (kind === "array") kids.push(el(doc, "text", { class: "sc-tick", x: r2(x + cs / 2), y: r2(y + cs + 14), "text-anchor": "middle" }, String(ci)));
    }));
    for (const [name, at] of ptrs) {
      const [ri, ci] = kind === "grid" ? at.split(".").map(Number) : kind === "stack" ? [items.length - 1 - Number(at), 0] : [0, Number(at)];
      if (!(ri >= 0 && ri < nr && ci >= 0 && ci < nc)) continue;
      const x = x0 + ci * cs + cs / 2, y = y0 + ri * cs;
      kids.push(arrowEl(doc, [x, y - 16], [x, y - 2], 1.5, "sc-ptr"));
      reqs.push({ key: `${id}.${name}`, id, text: name, rs: [{ s: name, sub: false, hid: false }], hid: false, w: textW([{ s: name }]), t: { pt: [x, y - 18] }, focus: !!focus, R: B, dirs: ["n", "ne", "nw"] });
    }
    layers[1].push(el(doc, "g", { ...gAttrs, class: `sc-o sc-cells${focus}` }, kids));
  }
  // labels: focus first, then object order (deterministic)
  const rank = id => (glow.has(id) ? 0 : 1) * 1000 + Math.max(0, drawOrder.indexOf(id));
  reqs.sort((p, q) => rank(p.id) - rank(q.id));
  const placed = place(reqs, out.segs, bodies, R, opts.fixed);
  out.labels = placed.map(p => ({ key: p.key, id: p.id, text: p.text, hidden: p.hid, box: p.box.map(r2), knock: p.knock, lead: p.lead, dir: p.dir, ring: p.ring }));
  out.choices = new Map(placed.map(p => [p.key, { dir: p.dir, ring: p.ring }]));
  for (const p of placed) {
    const op = model.objs.has(p.id) ? opa(p.id) : opa(model.items.get(p.id)?.ax);
    const kids = [];
    if (p.lead) kids.push(el(doc, "line", { class: "sc-lead", x1: r2(p.lead[0][0]), y1: r2(p.lead[0][1]), x2: r2(p.lead[1][0]), y2: r2(p.lead[1][1]) }));
    if (p.knock) kids.push(el(doc, "rect", { class: "sc-knock", x: r2(p.box[0]), y: r2(p.box[1]), width: r2(p.box[2]), height: r2(p.box[3]), rx: 3 }));
    let x = p.box[0] + 3;
    const spans = p.rs.map(r => { const t = el(doc, "tspan", { class: [r.hid ? "hid" : "", r.sub ? "sub" : ""].join(" ").trim() || null, x: r2(x), y: r2(p.box[1] + 14 + (r.sub ? 3 : 0)) }, r.s); x += textW([r]); return t; });
    kids.push(el(doc, "text", null, spans));
    layers[6].push(el(doc, "g", { class: `sc-lab${p.hid ? " hid" : ""}${p.focus ? " focus" : ""}`, "data-for": p.key, style: op < 1 ? `opacity:${r2(op)}` : null }, kids));
  }
  // panels outside the svg: math rows (bottom callout) and code + trace
  for (const o of model.objs.values()) {
    if (o.type === "MathRows" && vis.has(o.id)) for (const row of o.p.rows || []) {
      const s = String(row), cont = /^=\s/.test(s), i = s.indexOf(" = ");
      out.math.push(cont ? ["", "=", plain(runs(s.slice(2), model, S, stage))] : i < 0 ? [plain(runs(s, model, S, stage)), "", ""] : [plain(runs(s.slice(0, i), model, S, stage)), "=", plain(runs(s.slice(i + 3), model, S, stage))]);
    }
  }
  if (doc && reg.main) {
    out.svg = el(doc, "svg", { viewBox: `0 0 ${VIEW.W} ${VIEW.H}`, "aria-hidden": "true", focusable: "false", "data-step": String(k + 1) }, layers.flat());
  }
  return out;
}
const ORDER2 = ["e", "ne", "n", "nw", "w", "sw", "s", "se"];

// ─── the live view a scene stepper shows ───
const QUIET = () => { try { return !globalThis.requestAnimationFrame || !!globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches; } catch { return true; } };
export class SceneView {
  constructor(doc, model, stage = "wrong") {
    this.doc = doc; this.model = model; this.stage = ["pre", "wrong", "post"].includes(stage) ? stage : "wrong";
    const reg = regions(model), objs = [...model.objs.values()];
    this.fig = reg.main ? el(doc, "div", { class: "vw-fig vw-sc", role: "img", "aria-label": model.alt || "figure, one step at a time" }) : null;
    this.svg = null;
    const code = objs.find(o => o.type === "Code");
    this.code = code ? el(doc, "div", { class: "vw-code", role: this.fig ? null : "img", "aria-label": this.fig ? null : model.alt || "code, one step at a time" }) : null;
    this.vars = code ? el(doc, "div", { class: "vw-vars" }) : null;
    this.math = objs.some(o => o.type === "MathRows") ? el(doc, "div", { class: "vw-math off" }) : null;
    this.nodes = [this.fig, this.code && el(doc, "div", { class: "vw-codebox" }, this.code, this.vars), this.math].filter(Boolean);
    this.anim = 0;
  }
  /** draw step k (0-based); from = the step shown before (tweens from it), null = just draw */
  go(k, from = null) {
    const doc = this.doc, m = this.model;
    const end = frame(m, k, this.stage, { doc });
    this.panels(end);
    const id = ++this.anim;
    if (!this.fig) return end;
    const put = f => { if (!this.svg) { this.svg = f.svg; this.fig.replaceChildren(f.svg); } else { this.svg.replaceChildren(...[...f.svg.childNodes]); this.svg.setAttribute("data-step", f.svg.getAttribute("data-step")); } };
    if (from == null || from === k || QUIET()) { put(end); return end; }
    const A = frame(m, from, this.stage, { doc });
    const t0 = globalThis.performance?.now?.() ?? Date.now();
    const tick = now => {
      if (id !== this.anim) return;
      const t = Math.min(1, ((now ?? Date.now()) - t0) / TWEEN), e = 1 - (1 - t) ** 3;
      if (t >= 1) { put(end); return; }
      put(frame(m, k, this.stage, { doc, mix: { A, t: e }, fixed: end.choices }));
      globalThis.requestAnimationFrame(tick);
    };
    put(frame(m, k, this.stage, { doc, mix: { A, t: 0 }, fixed: end.choices }));
    globalThis.requestAnimationFrame(tick);
    return end;
  }
  panels(f) {
    const doc = this.doc, m = this.model;
    if (this.math) {
      const rows = f.math;
      const glowing = [...m.objs.values()].some(o => o.type === "MathRows" && f.st.glow.has(o.id));
      const shown = rows.length > 0;
      const all = [...m.objs.values()].filter(o => o.type === "MathRows").flatMap(o => o.p.rows || []);
      const show = shown ? rows : all.map(() => ["", "", ""]);
      this.math.replaceChildren(...show.map(r => el(doc, "div", { class: "vw-mrow" }, el(doc, "span", { class: "l" }, r[0]), el(doc, "span", { class: "e" }, r[1]), el(doc, "span", { class: "r" }, r[2]))));
      this.math.classList[shown ? "remove" : "add"]("off");
      this.math.classList[glowing ? "add" : "remove"]("focus");
    }
    if (this.code) {
      const code = [...m.objs.values()].find(o => o.type === "Code"), tr = [...m.objs.values()].find(o => o.type === "Trace" && o.p.code === code.id);
      let hl = f.st.sets.has(`${code.id} hl`) ? parseInt(f.st.sets.get(`${code.id} hl`), 10) : 0, vars = [];
      const on = f.vis.has(code.id);
      if (tr && f.vis.has(tr.id)) {
        const ticks = tr.p.ticks || [], i = parseInt(f.st.sets.get(`${tr.id} tick`) ?? "0", 10), t = String(ticks[Math.min(Math.max(0, i), ticks.length - 1)] ?? "");
        const lm = /^L(\d+)/.exec(t);
        if (lm) hl = +lm[1];
        const got = new Map([...t.matchAll(/(\w+)=(\S+)/g)].map(x => [x[1], x[2]]));
        vars = String(tr.p.vars || "").split(/\s+/).filter(Boolean).map(v => [v, got.get(v) ?? "-"]);
      }
      const glowing = f.st.glow.has(code.id) || (tr && f.st.glow.has(tr.id));
      this.code.replaceChildren(el(doc, "ol", null, (code.p.lines || []).map((line, i) => el(doc, "li", { class: i + 1 === hl ? "hl" : null }, el(doc, "span", { class: "ln" }, String(i + 1)), el(doc, "code", null, String(line))))));
      this.code.classList[on ? "remove" : "add"]("off");
      this.code.classList[glowing ? "add" : "remove"]("focus");
      this.vars.replaceChildren(...vars.map(([v, x]) => el(doc, "span", { class: `vw-chip ro${x === "?" ? " hid" : ""}` }, `${v} = ${x}`)));
    }
  }
}
