/* chg.mjs: what a snack changed from its original (TODO A, Tony Oct 5: "highlight the changed constant").
   A token diff (LCS) of the snack's text blocks against the original's. Marked: every changed number, and the words of a short swap
   ("first" -> "second", <= 3 tokens a side). In plain text a mark is .. (app.js md() turns it into <mark class="chg">);
   inside $..$ it is \htmlClass{chg}{..} (numbers only, never inside \text{}). Pure, no DOM. */

const TOK = /\d+(?:\.\d+)?|\\[A-Za-z]+|[A-Za-z]+|\S/g;
const isNum = t => /^\d/.test(t), isWord = t => /^[A-Za-z]/.test(t);
const SHORT = 3, CHIP = 4;
const STOP = new Set("a an the is are was be of to in at on by for from with and or it its this that per times".split(" "));   // never marked, never a unit
const src = b => Array.isArray(b.md) ? b.md.join("\n") : String(b.md);   // md() joins an array the same way

/* the $$..$$ / $..$ content spans, cut the way md() cuts them (an escaped \$ is text) */
function spans(s) {
  const out = [], re = /\\\$|\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g;
  for (let m; (m = re.exec(s));) if (m[0] !== "\\$") { const a = m.index + (m[1] != null ? 2 : 1); out.push([a, a + (m[1] ?? m[2]).length]); }
  return out;
}
export function tokens(s, blk = 0) {
  const sp = spans(s), out = [];
  for (let m; (m = TOK.exec(s));) {
    const at = m.index, inM = sp.find(([a, e]) => at >= a && at < e);
    out.push({ t: m[0], at, end: at + m[0].length, blk, math: !!inM, txt: !!inM && /\\text\{[^}]*$/.test(s.slice(inM[0], at)) });
  }
  return out;
}
/* the matched index pairs of a longest common subsequence */
function lcs(a, b) {
  const n = a.length, m = b.length, L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out = [];
  for (let i = 0, j = 0; i < n && j < m;) {
    if (a[i] === b[j]) { out.push([i, j]); i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) i++; else j++;
  }
  return out;
}
const markable = (k, short) => isNum(k.t) ? !k.txt : short && !k.math && isWord(k.t) && !STOP.has(k.t.toLowerCase());
/* "$3.0\ \text{m/s}$" -> "m/s", "$4.0$ seconds" -> "seconds", "30^\circ" -> "°" */
function unitAfter(s, end) {
  const r = s.slice(end);
  if (/^\s*\^\s*\{?\\circ/.test(r)) return "°";
  const m = r.match(/^\s*(?:\\[ ,;!]\s*)*(?:\\(?:text|mathrm)\{([^}]*)\}|\$?\s*([A-Za-z][A-Za-z/]*))/);
  const u = m ? (m[1] ?? m[2]).trim() : "";
  return STOP.has(u.toLowerCase()) ? "" : u;
}
function wrap(s, ks) {
  for (const k of [...ks].sort((x, y) => y.at - x.at))
    s = s.slice(0, k.at) + (k.math ? `\\htmlClass{chg}{${k.t}}` : `${k.t}`) + s.slice(k.end);
  return s;
}
const marked = (blocks, toks, hit) => blocks.map((b, i) => b.type === "text" ? wrap(src(b), toks.filter(k => k.blk === i && hit.has(k))) : null);

/* snack body vs original body -> { snack, orig: marked sources per block (null = not text), olds: the original's changed numbers
   (to mark in its worked steps), pairs: [{ from, to, unit }] for the "Changed:" chip (a one-number-for-one-number swap) } */
export function changes(snack, orig) {
  const flat = blocks => blocks.flatMap((b, i) => b.type === "text" ? [...tokens(src(b), i), { t: " ", blk: i }] : []);
  const A = flat(orig), B = flat(snack), srcOf = blocks => blocks.map(b => b.type === "text" ? src(b) : ""), srcA = srcOf(orig), srcB = srcOf(snack);
  const hitA = new Set(), hitB = new Set(), olds = new Set(), pairs = [];
  const gap = (a, b) => {
    const short = a.length > 0 && b.length > 0 && a.length <= SHORT && b.length <= SHORT;
    for (const k of a) if (markable(k, short)) { hitA.add(k); if (isNum(k.t)) olds.add(k.t); }
    for (const k of b) if (markable(k, short)) hitB.add(k);
    const na = a.filter(k => isNum(k.t)), nb = b.filter(k => isNum(k.t));
    if (na.length !== 1 || nb.length !== 1 || pairs.length >= CHIP) return;
    const ua = unitAfter(srcA[na[0].blk], na[0].end), ub = unitAfter(srcB[nb[0].blk], nb[0].end);
    if (ua === ub) pairs.push({ from: na[0].t, to: nb[0].t, unit: ub });   // same unit: the same quantity, swapped
  };
  let i = 0, j = 0;
  for (const [x, y] of [...lcs(A.map(k => k.t), B.map(k => k.t)), [A.length, B.length]]) { gap(A.slice(i, x), B.slice(j, y)); i = x + 1; j = y + 1; }
  return { snack: marked(snack, B, hitB), orig: marked(orig, A, hitA), olds, pairs };
}
/* a worked step of the original: its changed numbers marked the same way */
export const markNums = (s, olds) => olds.size ? wrap(s, tokens(s).filter(k => isNum(k.t) && !k.txt && olds.has(k.t))) : s;
