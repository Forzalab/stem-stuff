/* links.mjs (LINK-FEATURES v2 S1, brain plan-2026-11-03/LINK-FEATURES.md): one quantity, one hue, in its words, its symbol and its
   figure mark. As solution lines arrive, the newest line's quantities are lit (.ln-on, layer 1); the line before settles to layer 2, older
   lines to layer 3 (the figure palette's .tn-<hue> + .ly2 / .ly3, app.css "Links"). Zero taps: the student reads top to bottom and the
   hues follow. Flag ?links=1 (or localStorage stem-links = "1"), DEFAULT OFF: with it off nothing here is called with effect and every
   caller keeps its old path, so the DOM is byte-identical (tests/link.pw.mjs).
   Markup is authored data, never model output (the key, the ladder): [words]{#id} = a word link; \htmlClass{ln-id}{...} inside $..$ =
   the symbol (KaTeX trust, the same rule as app.js renderMath); a figure mark with data-ln="id" joins. [[ID]] / [[ID|label]] = a law
   (formula-sheet row): S1 parses it and prints its label only (the chip is S2).
   sync() reads no layout and touches classes only: O(nodes in the root), once per revealed line, never per streamed token. */
export const HUES = ["sky", "amber", "orange", "violet", "pink", "cyan"];   // W163 auto-hues: palette only, never green / red
const TOKEN = /\[([^\][\n]+)\]\{#([a-z][a-z0-9_]*)\}|\[\[([A-Z][A-Z0-9_]*)(?:\|([^\]\n]+))?\]\]/g;
const SYM = /\\htmlClass\{ln-([a-z][a-z0-9_]*)\}/g;
const LNCLASS = /^ln-(?!on$|h-)([a-z][a-z0-9_]*)$/;

/* text -> segments: {t:"text"|"math", s} | {t:"ln", s, id} | {t:"law", s, id}. Math ($..$) is never tokenized. */
export function parse(s) {
  const out = [], push = (t, x, id) => { if (x !== "" || t !== "text") out.push(id ? { t, s: x, id } : { t, s: x }); };
  String(s).split("$").forEach((part, i) => {
    if (i % 2) { push("math", part); return; }
    let at = 0;
    for (const m of part.matchAll(TOKEN)) {
      push("text", part.slice(at, m.index));
      if (m[2]) push("ln", m[1], m[2]); else push("law", m[4] || m[3], m[3]);
      at = m.index + m[0].length;
    }
    push("text", part.slice(at));
  });
  return out;
}

/* the link ids a line names, words and symbols, first appearance order */
export function ids(s) {
  const seen = [];
  for (const g of parse(s)) {
    const found = g.t === "ln" ? [g.id] : g.t === "math" ? [...g.s.matchAll(SYM)].map(m => m[1]) : [];
    for (const id of found) if (!seen.includes(id)) seen.push(id);
  }
  return seen;
}

/* id -> hue, in order of first appearance; the same ids always get the same hues */
export function autoHues(list) {
  const out = {};
  let n = 0;
  for (const id of list) if (!(id in out)) out[id] = HUES[n++ % HUES.length];
  return out;
}

/* lines = [[ids of line 1], [ids of line 2], ...] in reveal order -> {id: "on" | "ly2" | "ly3"}; the newest mention of an id wins */
export function plan(lines) {
  const out = {}, last = lines.length - 1;
  lines.forEach((line, i) => { for (const id of line) out[id] = i === last ? "on" : i === last - 1 ? "ly2" : "ly3"; });
  return out;
}

/* the flag: read once. ?links=1 / ?links=0 win over localStorage stem-links; no window (node) = off */
let ON = null;
export function on() {
  if (ON !== null) return ON;
  ON = false;
  try {
    const q = new URLSearchParams(globalThis.location ? globalThis.location.search : "").get("links");
    ON = q === "1" ? true : q === "0" ? false : globalThis.localStorage ? globalThis.localStorage.getItem("stem-links") === "1" : false;
  } catch { ON = false; }
  return ON;
}

const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
/* \htmlClass{ln-id}{X} -> X (braces matched): the MathML / copy text must read as plain math (bug class hidden-a11y-text-in-selection) */
export function strip(src) {
  let out = "", i = 0;
  const open = /\\htmlClass\{ln-[a-z][a-z0-9_]*\}\{/g;
  for (let m; (m = open.exec(src));) {
    out += src.slice(i, m.index);
    let d = 1, j = open.lastIndex;
    for (; j < src.length && d; j++) d += src[j] === "{" ? 1 : src[j] === "}" ? -1 : 0;
    out += strip(src.slice(open.lastIndex, j - 1));
    i = open.lastIndex = j;
  }
  return out + src.slice(i);
}
const HTML_HALF = '<span class="katex-html"';
function tex(src) {
  const k = globalThis.katex;
  if (!k) return esc(strip(src));
  const opt = { throwOnError: false, trust: c => c.command === "\\htmlClass" };   // \htmlClass only, as app.js renderMath
  const lit = k.renderToString(src, opt), plain = k.renderToString(strip(src), opt);
  const a = plain.split(HTML_HALF), b = lit.split(HTML_HALF);
  return a.length === 2 && b.length === 2 ? a[0] + HTML_HALF + b[1] : lit;   // the MathML half from the plain source, the drawn half lit
}
/* a line with link markup -> HTML: words as <span class="ln" data-ln>, math through KaTeX (its \htmlClass{ln-id} kept), laws as their label */
export function html(s) {
  return parse(s).map(g => g.t === "math" ? tex(g.s) : g.t === "ln" ? `<span class="ln" data-ln="${esc(g.id)}">${esc(g.s)}</span>` : esc(g.s)).join("");
}
/* the same line as plain text (no spans, no \htmlClass): for places with no hue room, e.g. ladder chips on --sheet, where the layer-3
   steps of some hues fall under 4.5:1 (tests/layers.test.mjs "links") */
export function plain(s) {
  return parse(s).map(g => g.t === "math" ? "$" + strip(g.s) + "$" : g.s).join("");
}
/* does this text carry link markup (callers keep their old path when it does not) */
const TOKEN1 = new RegExp(TOKEN.source), SYM1 = new RegExp(SYM.source);
export const has = s => typeof s === "string" && (TOKEN1.test(s) || SYM1.test(s));

function idOf(el) {
  if (el.dataset && el.dataset.ln) return el.dataset.ln;
  for (const c of el.classList) { const m = LNCLASS.exec(c); if (m) return m[1]; }
  return null;
}
const NODES = "[data-ln], [class*='ln-']";
/* root: the solution; lineSel: one element per revealed line, in order (a later line = a newer one); figs: extra roots whose [data-ln]
   marks join (the item's figure). Classes only: .ln, .tn-<hue>, .ln-on | .ly2 | .ly3 */
export function sync(root, lineSel, figs = []) {
  if (!root) return;
  const lines = [...root.querySelectorAll(lineSel)].map(li => {
    const got = [];
    for (const el of li.querySelectorAll(NODES)) { const id = idOf(el); if (id && !got.includes(id)) got.push(id); }
    return got;
  });
  const order = [], st = plan(lines);
  for (const l of lines) for (const id of l) if (!order.includes(id)) order.push(id);
  const hue = autoHues(order);
  const all = [...root.querySelectorAll(NODES), ...figs.flatMap(f => f ? [...f.querySelectorAll("[data-ln]")] : [])];
  for (const el of all) {
    const id = idOf(el);
    if (!id || !hue[id]) continue;
    el.classList.add("ln");
    for (const h of HUES) el.classList.toggle("tn-" + h, h === hue[id]);
    el.classList.toggle("ln-on", st[id] === "on");
    el.classList.toggle("ly2", st[id] === "ly2");
    el.classList.toggle("ly3", st[id] === "ly3");
  }
}

if (typeof window !== "undefined") window.Links = { on, parse, ids, autoHues, plan, html, plain, has, sync, strip, HUES };
