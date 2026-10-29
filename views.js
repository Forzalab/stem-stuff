// views.js: the vanilla OpenUI Lang renderer (render plan v2 §5 option A, §6.5; modeled on OpenUI's vue-lang binding).
//   register(name, fn)          fn(props, ctx) -> Node; ctx = { doc, id, render(el), state(init), predict, patch, h, icon, rich }
//   render(program, mount, o)   whole program -> handle
//   stream(chunks, mount, o)    (async) iterable of text chunks -> Promise<handle>; paints once per completed statement
//   mountView(mount, o)         handle { push(chunk), end(), patch(program), errors, src, el }
// o = { predict(pick, {view, key}) -> Promise<{ok, tries_left, patch?}>, doodle: "duck", document, onError(e), t: {id: text} }
// Slots (views plan Oct 20, registry "slot"): a string prop that is exactly "$t.<id>" is filled from o.t; an id o.t lacks paints
// as an outlined empty box <span class="vw-tslot" data-slot="<id>"> (what measure_slots reads). Caps apply to the filled text.
// Rules built in (brain refine/REFINE.md): F3 no look props (look = views.css by cascade, page vs .ai-box); F4 Reveal's body is a
// SECOND program patch-merged in place (spec §7, mergeStatements); F5 Predict posts the pick, the page never holds the answer;
// F7 caps from views-lib.js drop a statement (`too-long`); F8 append-only paint into slots the root reserves when it arrives;
// one error boundary per statement (a failed statement drops or keeps its last good node, its siblings render, spec §8.2);
// VISUAL-FIRST (Tony 19:0x): nothing to show -> a Doodle, never a blank.
// The component list lives in views-lib.js (P0.2 generates it); the drawings below are the only look-free code that knows it.
import { createParser, mergeStatements } from "./vendor/openui-lang.mjs";
import { LIB, toSchema, MARKS, DOODLES } from "./views-lib.js";
import { place, resolveAngles, checkAngleLabels } from "./figcheck.js";

const SCHEMA = toSchema(LIB);
const REG = new Map();
/** Register (or replace) the drawing of one component. */
export function register(name, fn) {
  if (typeof fn !== "function") throw new TypeError(`register(${name}): fn must be a function`);
  REG.set(name, fn);
}
export const registered = () => [...REG.keys()];

// ─── DOM helpers (no innerHTML: every string the model typed becomes a text node) ───
const SVGNS = "http://www.w3.org/2000/svg";
const SVG_TAGS = new Set(["svg", "g", "circle", "line", "polygon", "path", "text", "rect", "ellipse", "title"]);
export function h(doc, tag, attrs, ...kids) {
  const el = SVG_TAGS.has(tag) ? doc.createElementNS(SVGNS, tag) : doc.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) if (v != null && v !== false) el.setAttribute(k, v === true ? "" : String(v));
  for (const k of kids.flat(Infinity)) if (k != null && k !== false) el.append(typeof k === "object" ? k : textNode(doc, String(k)));
  return el;
}
const SLOT = /^\$t\.([a-z][a-z0-9_]{0,31})$/;
const slotBox = (doc, id) => h(doc, "span", { class: "vw-tslot", "data-slot": id }, id);
function textNode(doc, s) { const m = SLOT.exec(s); return m ? slotBox(doc, m[1]) : doc.createTextNode(s); }
/** Fill "$t.<id>" strings from t, deep (inline elements too: Steps reads its steps' props without rendering them). */
function fill(v, t) {
  if (typeof v === "string") { const m = SLOT.exec(v); return m && t && Object.hasOwn(t, m[1]) ? String(t[m[1]]) : v; }
  if (Array.isArray(v)) return v.map(x => fill(x, t));
  if (v && v.type === "element") return { ...v, props: Object.fromEntries(Object.entries(v.props || {}).map(([k, x]) => [k, fill(x, t)])) };
  return v;
}
const dis = (el, on) => (on ? el.setAttribute("disabled", "") : el.removeAttribute("disabled"));
const cls = (el, name, on) => el.classList[on ? "add" : "remove"](name);

/** "**bold**" is the only emphasis (weight, never colour); everything else is plain text. */
function rich(doc, s) {
  return String(s ?? "").split(/\*\*(.+?)\*\*/).map((t, i) => (i % 2 ? h(doc, "b", null, t) : SLOT.test(t) ? textNode(doc, t) : t)).filter(t => t !== "");
}

// The site sprite's paths (index.html), inlined so a view draws without the sprite.
const ICONS = {
  ok: [["path", { d: "M4.5 12.5l5 5L19.5 7" }]],
  x: [["path", { d: "M6 6l12 12M18 6L6 18" }]],
  lock: [["rect", { x: 5, y: 10.5, width: 14, height: 10, rx: 2 }], ["path", { d: "M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" }]],
  prev: [["path", { d: "M14.5 5.5L8 12l6.5 6.5" }]],
  next: [["path", { d: "M9.5 5.5L16 12l-6.5 6.5" }]],
  go: [["path", { d: "M4.5 12h14M13 5.5l6.5 6.5-6.5 6.5" }]],
  bulb: [["path", { d: "M9.5 17.5h5M10.5 21h3M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.4 1.1 2.2v1.5h5V16c0-.8.4-1.6 1.1-2.2A6 6 0 0 0 12 3z" }]],
};
function icon(doc, name, sm) {
  return h(doc, "svg", { class: `vw-ico${sm ? " sm" : ""}`, viewBox: "0 0 24 24", "aria-hidden": "true", focusable: "false" },
    ICONS[name].map(([t, a]) => h(doc, t, a)));
}
const button = (doc, ico, label, extra = "") => h(doc, "button", { type: "button", class: `btn${extra}`, "aria-label": label }, icon(doc, ico));

// ─── statements ───
/** Split text into completed statements (a newline at bracket depth 0, outside a string) and the unfinished rest. */
export function splitStatements(buf) {
  const out = [];
  let depth = 0, q = null, esc = false, start = 0;
  for (let i = 0; i < buf.length; i++) {
    const c = buf[i];
    if (q) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === q) q = null; continue; }
    if (c === '"' || c === "'") q = c;
    else if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") depth = Math.max(0, depth - 1);
    else if (c === "\n" && depth === 0) {
      const s = buf.slice(start, i).trim();
      if (s) out.push(s);
      start = i + 1;
    }
  }
  return [out, buf.slice(start)];
}
const idOf = s => (/^(\$?[A-Za-z_]\w*)\s*=(?!=)/.exec(s) || [])[1];
/** The ids a root statement lists, in order: `root = View([a, b, c])` -> ["a", "b", "c"]. Root children are refs in our profile. */
function rootIds(text) {
  const i = text.indexOf("[");
  if (i < 0) return [];
  let depth = 0, cur = "", out = [];
  for (const c of text.slice(i + 1)) {
    if (c === "[" || c === "(" || c === "{") depth++;
    if (c === "]" && depth === 0) break;
    if (c === "]" || c === ")" || c === "}") depth--;
    if (c === "," && depth === 0) { out.push(cur.trim()); cur = ""; } else cur += c;
  }
  out.push(cur.trim());
  return out.filter(s => /^[A-Za-z_]\w*$/.test(s));
}

const CAP_CODES = new Set(["too-long", "bad-value"]);
/** F7: the caps of views-lib.js, checked before a statement draws (the gate checks them too; this is the client's copy). */
function capError(el) {
  const def = LIB.components[el.typeName];
  if (!def) return { code: "unknown-component", message: `${el.typeName} is not in the library` };
  const check = (v, s, path) => {
    if (v == null || !s) return null;
    if (v.type === "element") return capError(v);
    if (typeof v === "string") {
      if (s.maxLength && v.length > s.maxLength && !SLOT.test(v)) return { code: "too-long", message: `${path}: ${v.length} > ${s.maxLength} chars` };
      if (s.enum && !s.enum.includes(v)) return { code: "bad-value", message: `${path}: "${v}" not in ${s.enum.join("|")}` };
      if (s.pattern && !new RegExp(s.pattern).test(v)) return { code: "bad-value", message: `${path}: does not match ${s.pattern}` };
    }
    if (Array.isArray(v)) {
      if (s.maxItems && v.length > s.maxItems) return { code: "too-long", message: `${path}: ${v.length} > ${s.maxItems} items` };
      for (let i = 0; i < v.length; i++) { const e = check(v[i], s.items, `${path}/${i}`); if (e) return e; }
    }
    return null;
  };
  for (const [k, v] of Object.entries(el.props || {})) { const e = check(v, def.props[k], `${el.typeName}.${k}`); if (e) return e; }
  return null;
}

// ─── one mounted view ───
class Session {
  constructor(mount, o = {}) {
    this.o = o;
    this.doc = o.document || mount.ownerDocument || globalThis.document;
    this.mount = mount;
    this.stmts = new Map();      // id -> statement text, in arrival order
    this.buf = "";
    this.cache = new Map();      // statement id -> { json, node }: an unchanged statement keeps its DOM (and its state)
    this.state = new Map();      // statement id -> component state (Steps index, Predict tries)
    this.perrs = [];             // the parser's errors for the program as it stands (recomputed each paint)
    this.rerrs = new Map();      // statement id -> its render error (cleared when it renders again)
    this.seen = new Set();
    this.slots = new Map();      // root child id -> slot element (F8)
    this.done = false;
    this.el = h(this.doc, "div", { class: "vw" });
    mount.replaceChildren(this.el);
    mount.removeAttribute?.("data-vw-done");
  }
  get src() { return [...this.stmts.values()].join("\n"); }
  get errors() { return [...this.perrs, ...this.rerrs.values()]; }
  err(e) {
    if (e.source === "render") this.rerrs.set(e.statementId, e); else this.perrs.push(e);
    const k = `${e.code} ${e.statementId} ${e.message}`;
    if (!this.seen.has(k)) { this.seen.add(k); this.o.onError?.(e); }
  }
  push(chunk) {
    this.buf += chunk;
    const [done, rest] = splitStatements(this.buf);
    this.buf = rest;
    for (const s of done) this.add(s);
  }
  add(text) {
    if (/^```/.test(text)) return;                       // a fence line around the program
    const id = idOf(text);
    if (!id) { this.err({ code: "parse-error", message: `not a statement: ${text.slice(0, 40)}` }); return; }
    this.stmts.delete(id);                               // a redefinition replaces (and moves to the end, like a patch)
    this.stmts.set(id, text);
    this.paint();
  }
  end() {
    if (this.buf.trim()) { const rest = this.buf; this.buf = ""; this.push(rest + "\n"); }
    this.done = true;
    this.paint();
    this.mount.setAttribute?.("data-vw-done", "");
  }
  /** F4: a second program (the stage changed) merges in place; unchanged statements keep their DOM. */
  patch(text) {
    const merged = mergeStatements(this.src, String(text));
    this.stmts = new Map();
    for (const s of splitStatements(merged + "\n")[0]) { const id = idOf(s); if (id) this.stmts.set(id, s); }
    this.paint();
  }
  paint() {
    const res = createParser(SCHEMA, LIB.root).parse(this.src);
    this.perrs = [];
    for (const e of res.meta.errors) this.err({ source: "parser", ...e });
    const root = res.root, rootText = this.stmts.get("root");
    if (!root || root.typeName !== LIB.root || !rootText) return this.fallback();
    // F8: the slots, in the root's order, created when the root arrives (or a patch changes it); never re-ordered after
    const ids = rootIds(rootText);
    if (ids.join() !== [...this.slots.keys()].join()) {
      const next = new Map(ids.map(id => [id, this.slots.get(id) || h(this.doc, "div", { class: "vw-slot", "data-slot": id })]));
      this.slots = next;
      this.el.replaceChildren(...next.values());
    } else if (this.el.firstChild && !this.slots.has(this.el.firstChild.getAttribute?.("data-slot"))) {
      this.el.replaceChildren(...this.slots.values());   // leaving the fallback
    }
    const kids = new Map((root.props.children || []).filter(k => k && k.statementId).map(k => [k.statementId, k]));
    for (const [id, slot] of this.slots) {
      const el = kids.get(id);
      const node = el ? this.renderEl(el, "root") : this.cache.get(id)?.node ?? null;   // dropped now: keep the last good node
      if (node && slot.firstChild !== node) slot.replaceChildren(node);
      else if (!node && slot.firstChild) slot.replaceChildren();
      cls(slot, "on", !!node);
    }
    this.fallback();
  }
  /** VISUAL-FIRST: once the stream ended with nothing drawn, a Doodle instead of a blank. */
  fallback() {
    const drawn = [...this.slots.values()].some(s => s.firstChild);
    if (!this.done || drawn) return;
    const kind = DOODLES.includes(this.o.doodle) ? this.o.doodle : "duck";
    this.el.replaceChildren(h(this.doc, "div", { class: "vw-slot on vw-fallback" }, REG.get("Doodle")({ kind }, this.ctx("fallback"))));
  }
  /** One error boundary per statement. Inline elements (same statement as their owner) render inside their owner's boundary. */
  renderEl(el, owner) {
    const id = el.statementId && el.statementId !== owner ? el.statementId : null;
    const json = JSON.stringify(el);
    const hit = id && this.cache.get(id);
    if (hit && hit.json === json) return hit.node;
    try {
      const full = fill(el, this.o.t);
      const bad = capError(full);
      if (bad) throw Object.assign(new Error(bad.message), { code: bad.code });
      const fn = REG.get(el.typeName);
      if (!fn) throw Object.assign(new Error(`no drawing for ${el.typeName}`), { code: "unknown-component" });
      const node = fn(full.props || {}, this.ctx(id ?? owner));
      if (!node) throw new Error(`${el.typeName} drew nothing`);
      if (id) { node.setAttribute?.("data-st", id); this.cache.set(id, { json, node }); this.rerrs.delete(id); }
      return node;
    } catch (e) {
      this.err({ source: "render", code: e.code || "render-error", statementId: id ?? owner, component: el.typeName, message: e.message });
      if (CAP_CODES.has(e.code)) { if (id) this.cache.delete(id); return null; }   // over a cap: the statement drops (F7), no partial
      return hit ? hit.node : null;                       // a drawing failed: last good node, or dropped
    }
  }
  ctx(id) {
    const doc = this.doc;
    return {
      doc, id,
      render: el => (el && el.type === "element" ? this.renderEl(el, id) : null),
      state: init => { if (!this.state.has(id)) this.state.set(id, init()); return this.state.get(id); },
      predict: this.o.predict,
      patch: text => this.patch(text),
      h: (...a) => h(doc, ...a),
      icon: (n, sm) => icon(doc, n, sm),
      rich: s => rich(doc, s),
      t: this.o.t,
    };
  }
  handle() {
    const s = this;
    return {
      push: c => s.push(c), end: () => s.end(), patch: t => s.patch(t),
      get errors() { return s.errors; }, get src() { return s.src; }, el: s.el,
    };
  }
}

export function mountView(mount, o) { return new Session(mount, o).handle(); }
export function render(program, mount, o) {
  const v = mountView(mount, o);
  v.push(String(program ?? "") + "\n");
  v.end();
  return v;
}
export async function stream(chunks, mount, o) {
  const v = mountView(mount, o);
  for await (const c of chunks) v.push(String(c));
  v.end();
  return v;
}

// ─── figure marks (DESIGN-LANGUAGE strokes; the class carries the state, views.css the look) ───
const pairs = s => String(s || "").split(/[\s,]+/).filter(Boolean).map(t => { const i = t.lastIndexOf(":"); return [t.slice(0, i), t.slice(i + 1)]; });
function graphModel(p) {
  const pos = {}, edges = [], cols = [];
  for (const t of String(p.nodes || "").split(",")) { const [id, x, y] = t.trim().split(/\s+/); if (id && isFinite(x) && isFinite(y)) pos[id] = [+x, +y]; }
  for (const t of String(p.edges || "").split(",")) {
    const m = /^\s*(\w+)\s*([->])\s*(\w+)\s*$/.exec(t);
    if (m && pos[m[1]] && pos[m[3]]) edges.push({ a: m[1], b: m[3], dir: m[2] === ">", key: `${m[1]}-${m[3]}` });
  }
  for (const t of String(p.cols || "").split(",")) { const m = /^\s*(-?[\d.]+)\s+(.+?)\s*$/.exec(t); if (m) cols.push([+m[1], m[2]]); }
  if (!Object.keys(pos).length) throw new Error("graph has no nodes");
  return { pos, edges, cols, marks: Object.fromEntries(pairs(p.marks)) };
}
function drawGraph(doc, g, st = {}) {
  const nodes = { ...g.marks, ...(st.nodes || {}) }, emarks = st.edges || {}, tags = st.tags || {}, elab = st.labels || {};
  const colour = Object.values(nodes).some(m => /^k\d$/.test(m));
  const R = colour ? 14 : 22;
  const xs = Object.values(g.pos).map(p => p[0]), ys = Object.values(g.pos).map(p => p[1]);
  const W = Math.max(...xs) + Math.min(...xs), Hh = g.cols.length ? Math.max(...ys) + 70 : Math.max(...ys) + Math.min(...ys) + (Object.keys(tags).length ? 14 : 0);
  const kids = [];
  for (const e of g.edges) {
    const m = emarks[e.key] || "idle", [x1, y1] = g.pos[e.a], [x2, y2] = g.pos[e.b];
    const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
    const sx = x1 + ux * R, sy = y1 + uy * R, tx = x2 - ux * (R + 2), ty = y2 - uy * (R + 2), bx = tx - ux * 10, by = ty - uy * 10;
    kids.push(h(doc, "line", { class: `ed ${m}`, x1: sx, y1: sy, x2: e.dir ? bx : tx, y2: e.dir ? by : ty }));
    if (e.dir) kids.push(h(doc, "polygon", { class: `hd ${m}`, points: `${tx},${ty} ${bx - uy * 7},${by + ux * 7} ${bx + uy * 7},${by - ux * 7}` }));
    if (elab[e.key]) {
      const mx = (sx + tx) / 2, my = (sy + ty) / 2;
      kids.push(h(doc, "text", { class: `el ${m}`, x: mx - uy * 18, y: my + ux * 18 + (Math.abs(uy) < 0.2 ? 24 : 5) }, elab[e.key]));
    }
  }
  for (const [id, [x, y]] of Object.entries(g.pos)) {
    const m = nodes[id] || "idle", k = /^k(\d)$/.exec(m);
    kids.push(h(doc, "g", { class: `${k ? "cm" : "nd"} ${m}` }, h(doc, "circle", { cx: x, cy: y, r: R }),
      h(doc, "text", { x, y }, k ? k[1] : id), tags[id] != null && h(doc, "text", { class: "tg", x, y: y + R + 14 }, tags[id])));
  }
  for (const [x, t] of g.cols) kids.push(h(doc, "text", { class: "col", x, y: Hh - 8 }, t));
  return h(doc, "svg", { viewBox: `0 0 ${W} ${Hh}`, "aria-hidden": "true", focusable: "false" }, kids);
}
// Geometry: named points "A 0,0; B 3,0" (y up, 1:1 scale) and marks seg(A,B) circle(O,r) right(at,from,to) dim(from,to,label[,left|right])
// angle(at,from,to[,label]) arrow(from,to[,label]) label(at,text). Caps (registry): 12 points, 12 marks, 6 labels; over one: too-long.
const GEO_CAPS = { pts: 12, marks: 12, labels: 6 };
const GREEK = { alpha: "α", beta: "β", gamma: "γ", delta: "δ", theta: "θ", phi: "φ", pi: "π", mu: "μ", omega: "ω", lambda: "λ", Delta: "Δ", circ: "°", cdot: "·" };
const plainTex = s => String(s).replace(/\$/g, "").replace(/\\([A-Za-z]+)/g, (m, w) => GREEK[w] ?? w).replace(/[{}]/g, "").replace(/\^\s*°/g, "°").trim();
const tooLong = msg => Object.assign(new Error(msg), { code: "too-long" });
const badGeo = msg => Object.assign(new Error(msg), { code: "bad-value" });
/** Geometry props -> { pts: {name: [x, y]}, marks: [{k, ...}] }; throws (too-long / bad-value) on a cap or a bad mark. */
export function geoModel(p) {
  const pts = {};
  for (const t of String(p.pts || "").split(";")) {
    const m = /^\s*([A-Za-z][A-Za-z0-9']{0,3})\s+(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(t);
    if (m) pts[m[1]] = [+m[2], +m[3]]; else if (t.trim()) throw badGeo(`point "${t.trim().slice(0, 20)}"`);
  }
  if (!Object.keys(pts).length) throw badGeo("geometry has no points");
  if (Object.keys(pts).length > GEO_CAPS.pts) throw tooLong(`${Object.keys(pts).length} > ${GEO_CAPS.pts} points`);
  const marks = (p.marks || []).map(String);
  if (marks.length > GEO_CAPS.marks) throw tooLong(`${marks.length} > ${GEO_CAPS.marks} marks`);
  const P = n => { if (!pts[n]) throw badGeo(`no point ${n}`); return pts[n]; };
  const out = [];
  let labels = 0;
  for (const s of marks) {
    const m = /^\s*(seg|circle|right|dim|angle|arrow|label)\s*\((.*)\)\s*$/.exec(s);
    if (!m) throw badGeo(`mark "${s.slice(0, 20)}"`);
    const a = m[2].split(",").map(x => x.trim()), k = m[1], rest = i => a.slice(i).join(", ").trim();
    let o;
    if (k === "seg") o = { k, a: P(a[0]), b: P(a[1]) };
    else if (k === "circle") { if (!(+a[1] > 0)) throw badGeo("circle radius"); o = { k, c: P(a[0]), r: +a[1] }; }
    else if (k === "right") o = { k, names: a.slice(0, 3), at: P(a[0]), u: P(a[1]), v: P(a[2]) };
    else if (k === "angle") o = { k, names: a.slice(0, 3), at: P(a[0]), u: P(a[1]), v: P(a[2]), text: rest(3) };
    else if (k === "arrow") o = { k, a: P(a[0]), b: P(a[1]), text: rest(2) };
    else if (k === "label") o = { k, at: P(a[0]), text: rest(1) };
    else {
      const side = a.length > 3 && /^(left|right)$/i.test(a[a.length - 1]) ? a.pop().toLowerCase() : null;
      o = { k, a: P(a[0]), b: P(a[1]), text: rest(2), side };
    }
    if (o.text) labels++;
    out.push(o);
  }
  if (labels > GEO_CAPS.labels) throw tooLong(`${labels} > ${GEO_CAPS.labels} labels`);
  /* W340 §2 (I-ANG-1b-d, figcheck resolveAngles): each right / angle mark's vertex is checked against the drawing: the first point,
     or the middle one when the drawing says so (∠BAC: mc-a's θ was drawn at the square corner B); what fits nowhere is a finding */
  const ang = out.map((o, i) => [o, i]).filter(([o]) => o.k === "right" || o.k === "angle");
  const res = resolveAngles(pts, ang.map(([o]) => ({ k: o.k, names: o.names, text: plainTex(o.text || "") })));
  res.marks.forEach((r, j) => { const o = ang[j][0]; if (r.vertex) Object.assign(o, { vertex: r.vertex, at: pts[r.vertex], u: pts[r.rays[0]], v: pts[r.rays[1]] }); });
  return { pts, marks: out, findings: res.findings.map(f => ({ ...f, ids: [f.ids[0] && "m" + ang[+f.ids[0].slice(1)][1], ...f.ids.slice(1)] })) };
}
/* Labels (fable audit 2026-10-29 U3, I-LBL-1/2): every text (point names first, then the marks' labels) is a request to figcheck.js
   place() (= scene.js's packer) in viewBox units: its usual side first (point names away from the figure's centre, a dim / arrow
   label on its normal, an angle label on the bisector just outside the arc), then the other sides, outer rings with a leader line,
   then a free spot; scored by overlap with texts already placed and the strokes drawn. Text widths are estimated (GEO_EM per char:
   the figure is built before it is in the page). A text left on a stroke gets class knock (a halo in the card's colour). */
/* the font = views.css .gm-t (1.125rem = 18 user units, W113 vet); the estimate was still 14 there, so labels drew wider than placed and
   crossed strokes on firefox (geomarks, CI red at ec817d1). GEO_CLEAR (W340 mc-a, "farther out, balanced"): a label keeps this far from
   every stroke and dot when it can (~10 px at 390, ~12 px at 1440 at the usual scale); a dim / arrow label goes out on its normal. */
const GEO_FONT = 18, GEO_EM = 0.6 * GEO_FONT, GEO_LH = 22, GEO_ASC = 17, GEO_CLEAR = 14, GEO_PAD = 90;   // GEO_PAD: room around the drawing a label may use
const DIR8 = (dx, dy) => ["e", "se", "s", "sw", "w", "nw", "n", "ne"][Math.round(((Math.atan2(dy, dx) / Math.PI * 180) + 360) % 360 / 45) % 8];   // screen: y down
const DIRS8 = ["n", "e", "s", "w", "ne", "nw", "se", "sw"], DIRS8_RING = ["e", "se", "s", "sw", "w", "nw", "n", "ne"];
function drawGeometry(doc, g, t) {
  const all = Object.values(g.pts), ext = [...all];
  for (const m of g.marks) if (m.k === "circle") ext.push([m.c[0] - m.r, m.c[1] - m.r], [m.c[0] + m.r, m.c[1] + m.r]);
  const xs = ext.map(p => p[0]), ys = ext.map(p => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const span = Math.max(x1 - x0, y1 - y0) || 1, k = 240 / span, pad = 20;      // one scale for x and y (1:1); the viewBox grows to the labels (below)
  const W = (x1 - x0) * k + 2 * pad, H = (y1 - y0) * k + 2 * pad;
  const X = p => (p[0] - x0) * k + pad, Y = p => (y1 - p[1]) * k + pad;      // y up
  const segs = [], reqs = [], dots = [];
  const stroke = (id, ...pts) => { for (let i = 0; i + 1 < pts.length; i++) segs.push({ id, pts: [pts[i], pts[i + 1]] }); };
  /** a text to place: its string (a slot or plain), the point it names, its usual side (a screen vector) */
  const label = (id, s, at, dx, dy, cls = "gm-t", vertex = null, near = false) => {
    const m = SLOT.exec(s), slot = m && m[1], filled = slot && t && Object.hasOwn(t, slot) ? String(t[slot]) : null;
    const text = filled ?? (slot || plainTex(s)), d = DIR8(dx, dy);
    const i8 = DIRS8_RING.indexOf(d), dirs = near ? [0, 1, 7, 2, 6].map(j => DIRS8_RING[(i8 + j) % 8]) : [d, ...DIRS8.filter(x => x !== d)];
    let R;                                          // I-ANG-1a: an angle label's own region, a square on its vertex half-way to the next point
    if (vertex) {
      const vx = X(g.pts[vertex]), vy = Y(g.pts[vertex]);
      const half = Math.min(...Object.entries(g.pts).filter(([n]) => n !== vertex).map(([, p]) => Math.hypot(X(p) - vx, Y(p) - vy)), 1e4) / 2;
      R = { x: vx - half, y: vy - half, w: 2 * half, h: 2 * half };
    }
    const req = { key: reqs.length, id, w: Math.max(1, [...text].length) * GEO_EM, h: GEO_LH, t: { pt: at }, dirs, vertex, R,
      text, cls, slot: slot && filled == null ? slot : null };
    reqs.push(req);
    return req;
  };
  const cx = all.reduce((s, p) => s + X(p), 0) / all.length, cy = all.reduce((s, p) => s + Y(p), 0) / all.length;
  for (const [id, p] of Object.entries(g.pts)) { const x = X(p), y = Y(p); dots.push({ id: "pt:" + id, box: [x - 2.5, y - 2.5, 5, 5] }); label("pt:" + id, id, [x, y], x - cx, y - cy, "gm-t gm-name"); }
  const kids = [];
  g.marks.forEach((m, i) => {
    const id = "m" + i;
    if (m.k === "seg") { kids.push(h(doc, "line", { class: "gm gm-seg", x1: X(m.a), y1: Y(m.a), x2: X(m.b), y2: Y(m.b) })); stroke(id, [X(m.a), Y(m.a)], [X(m.b), Y(m.b)]); }
    else if (m.k === "circle") {
      kids.push(h(doc, "circle", { class: "gm gm-circle", cx: X(m.c), cy: Y(m.c), r: m.r * k }));
      stroke(id, ...Array.from({ length: 25 }, (_, j) => [X(m.c) + m.r * k * Math.cos(j * Math.PI / 12), Y(m.c) + m.r * k * Math.sin(j * Math.PI / 12)]));
    } else if (m.k === "arrow") {
      const ax = X(m.a), ay = Y(m.a), bx = X(m.b), by = Y(m.b), L = Math.hypot(bx - ax, by - ay) || 1, ux = (bx - ax) / L, uy = (by - ay) / L;
      const hx = bx - ux * 10, hy = by - uy * 10;
      kids.push(h(doc, "g", { class: "gm gm-arrow" }, h(doc, "line", { x1: ax, y1: ay, x2: hx, y2: hy }),
        h(doc, "polygon", { points: `${bx},${by} ${hx - uy * 6},${hy + ux * 6} ${hx + uy * 6},${hy - ux * 6}` })));
      stroke(id, [ax, ay], [bx, by]); stroke(id, [hx - uy * 6, hy + ux * 6], [bx, by], [hx + uy * 6, hy - ux * 6]);
      if (m.text) label(id, m.text, [(ax + bx) / 2, (ay + by) / 2], -uy, ux);
    } else if (m.k === "right" || m.k === "angle") {
      const ox = X(m.at), oy = Y(m.at), un = p => { const dx = X(p) - ox, dy = Y(p) - oy, L = Math.hypot(dx, dy) || 1; return [dx / L, dy / L]; };
      const [ax, ay] = un(m.u), [bx, by] = un(m.v);
      if (m.k === "right") {
        const s = 12;
        kids.push(h(doc, "path", { class: "gm gm-right", d: `M${ox + ax * s},${oy + ay * s} L${ox + (ax + bx) * s},${oy + (ay + by) * s} L${ox + bx * s},${oy + by * s}` }));
        stroke(id, [ox + ax * s, oy + ay * s], [ox + (ax + bx) * s, oy + (ay + by) * s], [ox + bx * s, oy + by * s]);
      } else {
        const cross = ax * by - ay * bx, a0 = Math.atan2(ay, ax), da = Math.atan2(cross, ax * bx + ay * by);
        const mx = ax + bx, my = ay + by, ML = Math.hypot(mx, my) || 1, ux = mx / ML, uy = my / ML;
        /* I-ANG-1a + W340 mc-a ("farther out, balanced"): the label sits ON the bisector, inside its angle, GEO_CLEAR off both rays
           (a circle of the label's half-diagonal: t = (clear + rho) / sin(half-angle)), and the arc is drawn just inside it, so θ reads
           in its corner, not on a stroke. No room on the bisector (a thin wedge, a near point): the usual sides of the arc tip. */
        const req = m.text ? label(id, m.text, [ox + ux * 24, oy + uy * 24], mx, my, "gm-t", m.vertex || null, true) : null;
        let r = 22;
        if (req) {
          const rho = Math.hypot(req.w + 6, req.h) / 2, sa = Math.sin(Math.abs(da) / 2), tt = sa > 0.05 ? (GEO_CLEAR + rho) / sa : Infinity;
          const reach = Math.min(Math.hypot(X(m.u) - ox, Y(m.u) - oy), Math.hypot(X(m.v) - ox, Y(m.v) - oy)) * 0.7;
          if (tt <= Math.min(reach, req.R ? req.R.w / 2 : Infinity)) {
            req.spot = [ox + ux * tt - (req.w + 6) / 2, oy + uy * tt - req.h / 2];
            r = Math.max(22, tt - rho - GEO_CLEAR);
          }
        }
        kids.push(h(doc, "path", { class: "gm gm-angle", d: `M${ox + ax * r},${oy + ay * r} A${r},${r} 0 0 ${cross > 0 ? 1 : 0} ${ox + bx * r},${oy + by * r}` }));
        stroke(id, ...Array.from({ length: 9 }, (_, j) => [ox + r * Math.cos(a0 + da * j / 8), oy + r * Math.sin(a0 + da * j / 8)]));
        if (req && !req.spot) req.t = { pt: [ox + ux * (r + 2), oy + uy * (r + 2)] };
      }
    } else if (m.k === "dim") {
      const ax = X(m.a), ay = Y(m.a), bx = X(m.b), by = Y(m.b), L = Math.hypot(bx - ax, by - ay) || 1;
      let nx = (by - ay) / L, ny = -(bx - ax) / L;
      const mx = (ax + bx) / 2, my = (ay + by) / 2;
      const outward = (mx + nx - cx) ** 2 + (my + ny - cy) ** 2 >= (mx - cx) ** 2 + (my - cy) ** 2;
      if (m.side ? m.side === "left" : !outward) { nx = -nx; ny = -ny; }     // default: the side away from the figure
      const o = 14, px = nx * o, py = ny * o;
      kids.push(h(doc, "g", { class: "gm gm-dim" }, h(doc, "line", { x1: ax + px, y1: ay + py, x2: bx + px, y2: by + py }),
        h(doc, "line", { x1: ax + px * 0.5, y1: ay + py * 0.5, x2: ax + px * 1.5, y2: ay + py * 1.5 }),
        h(doc, "line", { x1: bx + px * 0.5, y1: by + py * 0.5, x2: bx + px * 1.5, y2: by + py * 1.5 })));
      stroke(id, [ax + px, ay + py], [bx + px, by + py]); stroke(id, [ax + px * 0.5, ay + py * 0.5], [ax + px * 1.5, ay + py * 1.5]); stroke(id, [bx + px * 0.5, by + py * 0.5], [bx + px * 1.5, by + py * 1.5]);
      if (m.text) label(id, m.text, [mx + px, my + py], nx, ny);
    } else if (m.k === "label") {
      const x = X(m.at), y = Y(m.at);
      label(id, m.text, [x, y], x - cx, y - cy);
    }
  });
  const placed = place(reqs, segs, dots, { x: -GEO_PAD, y: -GEO_PAD, w: W + 2 * GEO_PAD, h: H + 2 * GEO_PAD }, null, { LH: GEO_LH, GAP: GEO_CLEAR + 3, clear: GEO_CLEAR });
  const vpts = Object.fromEntries(Object.entries(g.pts).map(([n, p]) => [n, [X(p), Y(p)]]));
  const angLabels = () => placed.filter(q => q.vertex).map(q => ({ id: q.id, vertex: q.vertex, box: q.box }));
  const findings = [...(g.findings || []), ...checkAngleLabels(angLabels(), vpts)];
  for (const q of placed) {
    if (q.lead) {                                   // the leader stops 5 units short of the box: a glyph may stand past its estimated box (firefox θ)
      const [[ax, ay], [bx, by]] = q.lead, L = Math.hypot(bx - ax, by - ay) || 1, cut = Math.min(5, L / 2);
      kids.push(h(doc, "line", { class: "gm-lead", x1: ax, y1: ay, x2: bx - (bx - ax) / L * cut, y2: by - (by - ay) / L * cut }));
    }
  }
  for (const [id, p] of Object.entries(g.pts)) kids.push(h(doc, "g", { class: "gm-pt", "data-pt": id }, h(doc, "circle", { cx: X(p), cy: Y(p), r: 2.5 })));
  for (const q of placed) {
    const x = +(q.box[0] + q.box[2] / 2).toFixed(2), y = +(q.box[1] + (q.box[3] - GEO_LH) / 2 + GEO_ASC).toFixed(2);
    kids.push(h(doc, "text", { class: q.cls + (q.knock ? " knock" : ""), x, y, "data-slot": q.slot, "data-at": q.vertex }, q.text));   // data-at: an angle label's vertex
  }
  // the viewBox = the drawing + every placed label (+ a margin): a label is placed where it reads best, the frame follows it, centred
  const bx = [...segs.flatMap(s => s.pts), ...dots.flatMap(d => [[d.box[0], d.box[1]], [d.box[0] + d.box[2], d.box[1] + d.box[3]]]),
    ...placed.flatMap(q => [[q.box[0], q.box[1]], [q.box[0] + q.box[2], q.box[1] + q.box[3]]])];
  const m = 6, vx0 = Math.min(...bx.map(p => p[0])) - m, vy0 = Math.min(...bx.map(p => p[1])) - m;
  const vw = Math.max(...bx.map(p => p[0])) + m - vx0, vh = Math.max(...bx.map(p => p[1])) + m - vy0;
  const svg = h(doc, "svg", { viewBox: `${vx0.toFixed(1)} ${vy0.toFixed(1)} ${vw.toFixed(1)} ${vh.toFixed(1)}`, "aria-hidden": "true", focusable: "false" }, kids);
  svg._findings = [...new Set(findings.map(f => f.id))].sort();
  return svg;
}
const SAMPLE_NODE = new Set(["cur", "done", "front", "rec", "idle"]);
function sample(doc, mark) {
  const k = /^k\d$/.test(mark);
  const inner = SAMPLE_NODE.has(mark) || k ? h(doc, "g", { class: `${k ? "cm" : "nd"} ${mark}` }, h(doc, "circle", { cx: 10, cy: 10, r: 7 }))
    : h(doc, "line", { class: `ed ${mark}`, x1: 1, y1: 10, x2: 19, y2: 10 });
  return h(doc, "svg", { class: "vw-mark", viewBox: "0 0 20 20", "aria-hidden": "true" }, inner);
}
function chips(doc, items, first) {
  return items.length ? items.map((v, i) => h(doc, "span", { class: `vw-chip ro${first && i === 0 ? " cur" : ""}` }, v))
    : [h(doc, "span", { class: "vw-chip none" }, "empty")];
}
function table(doc, head, rows, rowClass = () => null) {
  return h(doc, "table", { class: "vw-tb" },
    h(doc, "thead", null, h(doc, "tr", null, head.map(c => h(doc, "th", { scope: "col" }, c)))),
    h(doc, "tbody", null, rows.map(r => h(doc, "tr", { class: rowClass(r) }, r.map(c => h(doc, "td", null, c))))));
}

// ─── L0 ───
register("View", (p, c) => c.h("div", { class: "vw-col" }, (p.children || []).map(c.render)));
register("Head", (p, c) => c.h("div", { class: "vw-head" }, c.h("h3", { class: "vw-t" }, p.title), p.sub && c.h("p", { class: "vw-sub" }, p.sub)));
register("Text", (p, c) => c.h("p", { class: "vw-p" }, c.rich(p.text)));
register("Legend", (p, c) => c.h("div", { class: "vw-chips", role: "list", "aria-label": "legend" }, (p.items || []).map(t => {
  const [mark, ...label] = String(t).trim().split(/\s+/);
  if (!MARKS.includes(mark)) throw Object.assign(new Error(`legend mark "${mark}"`), { code: "bad-value" });
  return c.h("span", { class: "vw-chip", role: "listitem" }, sample(c.doc, mark), label.join(" "));
})));
register("Table", (p, c) => table(c.doc, p.head || [], p.rows || []));
register("Graph", (p, c) => c.h("div", { class: "vw-fig", role: "img", "aria-label": "figure" }, drawGraph(c.doc, graphModel(p))));
/* a finding (I-ANG-*) nothing fixed: the figure never draws (W340 §2; the U7 ladder): the statement fails, the chat shows its static image
   or alt text. Clean: data-fig-findings="" (codes only, shotqa / geomarks read it) */
register("Geometry", (p, c) => {
  const svg = drawGeometry(c.doc, geoModel(p), c.t);
  if (svg._findings.length) throw Object.assign(new Error(`figure findings: ${svg._findings.join(" ")}`), { code: "fig-finding", findings: svg._findings });
  return c.h("div", { class: "vw-fig vw-geo", role: "img", "aria-label": p.alt || "figure", "data-fig-findings": "" }, svg);
});

// ─── L1 ───
register("Callout", (p, c) => c.h("div", { class: "vw-callout" }, c.h("div", { class: "vw-tag" }, p.tag), c.h("p", null, c.rich(p.text))));
register("Answer", (p, c) => c.h("p", { class: "vw-p" }, c.h("span", { class: "vw-ans" }, p.value), p.text ? " " : null, p.text ? c.rich(p.text) : null));

/** Steps (F14): reserved slots; Back off at 1, Next off at n; caption aria-live; ←/→ only while the footer has focus. */
register("Steps", (p, c) => {
  const steps = (p.steps || []).map(s => s.props);
  if (!steps.length) return c.h("div", { class: "vw-steps wait" });      // its steps have not arrived yet: hold the slot
  const st = c.state(() => ({ i: 0 }));
  st.i = Math.min(st.i, steps.length - 1);
  /* W340 vf-stepper ("empty UI apart from the buttons"): the prompt's example writes Steps(null, ...) and a stepper of captions only drew a
     sentence and two buttons, no figure. With no figure and no table it now draws its own: the step ladder, one numbered node per
     step (done, current, still to come), so every step shows where it is in the chain. Nothing in it comes from the model but the count. */
  const ladder = !p.fig && !p.head && steps.length > 1;
  const g = p.fig ? graphModel(p.fig.props) : ladder ? { pos: Object.fromEntries(steps.map((_, i) => [String(i + 1), [36 + i * 84, 36]])), cols: [], marks: {},
    edges: steps.slice(1).map((_, i) => ({ a: String(i + 1), b: String(i + 2), dir: true, key: `${i + 1}-${i + 2}` })) } : null;
  const ladderSt = i => ({ nodes: Object.fromEntries(steps.map((_, j) => [String(j + 1), j < i ? "done" : j === i ? "cur" : "idle"])),
    edges: Object.fromEntries(steps.slice(1).map((_, j) => [`${j + 1}-${j + 2}`, j < i ? "tree" : "idle"])) });
  const fig = g && c.h("div", { class: `vw-fig${ladder ? " vw-ladder" : ""}`, role: "img", "aria-label": ladder ? "step ladder: which step of the chain this is" : "figure, one step at a time" });
  const front = c.h("div", { class: "vw-chips vw-front" });
  const cap = c.h("p", { class: "vw-cap", "aria-live": "polite" });
  const body = c.h("tbody");
  const tb = p.head && c.h("table", { class: "vw-tb" }, c.h("thead", null, c.h("tr", null, p.head.map(x => c.h("th", { scope: "col" }, x)))), body);
  const back = button(c.doc, "prev", "Back"), next = button(c.doc, "next", "Next"), n = c.h("span", { class: "vw-n" });
  const foot = c.h("div", { class: "vw-foot" }, back, next, n);
  const show = () => {
    const s = steps[st.i], nodes = Object.fromEntries(pairs(s.nodes));
    if (g) fig.replaceChildren(drawGraph(c.doc, g, ladder ? ladderSt(st.i) : { nodes, edges: Object.fromEntries(pairs(s.edges)), tags: Object.fromEntries(pairs(s.tags)),
      labels: Object.fromEntries((s.labels || []).map(t => { const i = t.indexOf(":"); return [t.slice(0, i), t.slice(i + 1)]; })) }));
    front.replaceChildren(...chips(c.doc, s.front || [], true));
    cap.replaceChildren(...c.rich(s.cap));
    if (tb) body.replaceChildren(...(s.rows || []).map(r => c.h("tr", { class: nodes[r[0]] === "cur" ? "cur" : !nodes[r[0]] || nodes[r[0]] === "idle" ? "dim" : null },
      r.map(x => c.h("td", null, x)))));
    n.textContent = `Step ${st.i + 1} of ${steps.length}`;
    dis(back, st.i === 0); dis(next, st.i === steps.length - 1);
  };
  const go = d => { const i = Math.max(0, Math.min(steps.length - 1, st.i + d)); if (i !== st.i) { st.i = i; show(); } };
  back.addEventListener("click", () => go(-1));
  next.addEventListener("click", () => go(1));
  foot.addEventListener("keydown", e => { if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); go(e.key === "ArrowLeft" ? -1 : 1); } });
  show();
  return c.h("div", { class: "vw-steps" }, fig, p.front && c.h("div", null, c.h("div", { class: "vw-lab" }, p.front), front), cap, tb, foot);
});

register("Hints", (p, c) => {
  const hs = p.hints || [], st = c.state(() => ({ i: 0 }));
  const text = c.h("p"), n = c.h("span", { class: "vw-n" });
  const more = c.h("button", { type: "button", class: "btn btn-label" }, c.icon("bulb"), "Next hint");
  const show = () => { text.replaceChildren(...c.rich(hs[st.i])); n.textContent = `${st.i + 1} of ${hs.length}`; dis(more, st.i >= hs.length - 1); };
  more.addEventListener("click", () => { if (st.i < hs.length - 1) { st.i++; show(); } });
  show();
  return c.h("div", { class: "vw-callout vw-hints" }, c.h("div", { class: "vw-tag" }, "Hint"), text, c.h("div", { class: "vw-row" }, more, n));
});

/** Predict (F5/F15): pills + pips + one filled Check. The pick goes to ctx.predict with the key ref
// (p.answer = "key.<id>", F5); the ref is never resolved or drawn, and no answer literal ever comes as a prop. */
register("Predict", (p, c) => {
  const tries = p.tries || 2, struck = new Set((p.struck || []).map(String));
  const st = c.state(() => ({ pick: null, used: struck.size, wrong: new Set(struck), right: null, busy: false, verdict: null }));
  const pills = (p.choices || []).map(v => c.h("button", { type: "button", class: "vw-pill", role: "radio", "aria-checked": "false", "data-v": v }, v));
  const pips = c.h("span", { class: "vw-pips", "aria-hidden": "true" });
  const used = c.h("span", { class: "vw-n" });
  const check = c.h("button", { type: "button", class: "btn btn-go vw-go", "aria-label": "Check" }, c.icon("go"));
  const verdict = c.h("div", { class: "vw-verdict", "aria-live": "polite" });
  const over = () => st.right != null || st.used >= tries;
  const show = () => {
    for (const b of pills) {
      const v = b.getAttribute("data-v"), w = st.wrong.has(v), r = st.right === v;
      cls(b, "wrong", w); cls(b, "right", r);
      b.setAttribute("aria-checked", String(st.pick === v));
      if (w) b.setAttribute("aria-disabled", "true");
      dis(b, over() || w);
    }
    pips.replaceChildren(...Array.from({ length: tries }, (_, i) => c.h("i", { class: i < st.used ? "used" : null })));
    used.textContent = `${st.used} of ${tries} used`;
    dis(check, !c.predict || st.busy || st.pick == null || over());
    cls(verdict, "ok", !!st.verdict?.ok); cls(verdict, "bad", !!st.verdict && !st.verdict.ok);
    verdict.replaceChildren(...(st.verdict ? [c.icon(st.verdict.ok ? "ok" : "x", true), st.verdict.text] : []));
  };
  pills.forEach(b => b.addEventListener("click", () => {
    const v = b.getAttribute("data-v");
    if (over() || st.wrong.has(v)) return;
    st.pick = v; show();
  }));
  check.addEventListener("click", async () => {
    if (!c.predict || st.pick == null || over() || st.busy) return;
    st.busy = true; show();
    const pick = st.pick;
    let r;
    try { r = await c.predict(pick, { view: c.id, key: p.answer }); }
    catch { st.busy = false; st.verdict = { ok: false, text: "Couldn't check. Try again." }; show(); return; }
    st.busy = false;
    st.used = r && r.tries_left != null ? tries - r.tries_left : st.used + 1;
    if (r && r.ok) { st.right = pick; st.verdict = { ok: true, text: "Right." }; }
    else { st.wrong.add(pick); st.pick = null; st.verdict = { ok: false, text: `Not ${pick}.` }; }
    show();
    if (r && r.patch) c.patch(r.patch);
  });
  show();
  return c.h("div", { class: "vw-callout vw-predict" },
    p.tag && c.h("div", { class: "vw-tag" }, p.tag), c.h("p", { class: "vw-q" }, p.q),
    c.h("div", { class: "vw-pills", role: "radiogroup", "aria-label": p.q }, pills),
    c.h("div", { class: "vw-row" }, pips, used, check), verdict);
});

/** Reveal (F4): a visible locked row until a patch brings the body; then the body, in place, with a fade. */
register("Reveal", (p, c) => {
  const body = (p.body || []).map(c.render).filter(Boolean);
  if (!body.length) return c.h("div", { class: "vw-reveal" }, c.h("div", { class: "vw-lock" }, c.icon("lock", true), c.h("span", null, p.lock)));
  return c.h("div", { class: "vw-reveal open" }, c.h("div", { class: "vw-body" }, body));
});

/** Doodle (VISUAL-FIRST): a small drawing in the site's style. Fills from --c1/--c2, outlines in --ink, so it reads in greyscale. */
const DRAW = {
  duck: d => [h(d, "path", { class: "b o", transform: "translate(18 6) scale(3.4)", d: "M9 4.5a4 4 0 0 1 4 4c0 1-.3 1.8-.8 2.5H17c1.5 0 2.7-.8 3.3-2 .8 1 1.2 2.3 1.2 3.7 0 4-3.4 6.8-8 6.8H9c-3.3 0-5.5-2.2-5.5-5 0-1.8 1-3.3 2.4-4.2A4 4 0 0 1 9 4.5z" }),
    h(d, "path", { class: "k", transform: "translate(18 6) scale(3.4)", d: "M12.8 7.8l3.4.9-3.4.9z" }),
    h(d, "circle", { class: "e", cx: 18 + 9.8 * 3.4, cy: 6 + 7.9 * 3.4, r: 3.4 }),
    h(d, "path", { class: "w", d: "M10 92q10-6 20 0t20 0 20 0 20 0 20 0 20 0" })],
  heart: d => [h(d, "path", { class: "b o", d: "M60 90C28 68 14 52 14 34a20 20 0 0 1 46-10 20 20 0 0 1 46 10c0 18-14 34-46 56z" }),
    h(d, "path", { class: "w", d: "M30 34a10 10 0 0 1 12-10" })],
  star: d => [h(d, "polygon", { class: "b o", points: "60,8 72,40 106,40 79,60 89,92 60,72 31,92 41,60 14,40 48,40" })],
  spark: d => [h(d, "circle", { class: "b o", cx: 60, cy: 50, r: 16 }),
    h(d, "path", { class: "w", d: "M60 10v14M60 76v14M20 50h14M86 50h14M32 22l10 10M78 68l10 10M88 22 78 32M42 68 32 78" })],
};
register("Doodle", (p, c) => {
  const kind = DOODLES.includes(p.kind) ? p.kind : "duck";
  return c.h("figure", { class: `vw-doodle ${kind}` },
    c.h("svg", { viewBox: "0 0 120 100", role: "img", "aria-label": `a ${kind} doodle` }, DRAW[kind](c.doc)),
    p.text && c.h("figcaption", { class: "vw-sub" }, p.text));
});
