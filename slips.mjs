/* Slips from the formula: the JS twin of slips.py (design/HANDOFF-slips-v2.md unit C), for uploaded banks graded on the device
   (app.js gradeLocal). Same 10 families, same order, same EPS, same close() and match(); the golden fixture
   tests/fixtures/slips-golden.json is shared by both test suites (tests/slips.test.mjs).
   math.js (vendor/math.min.js, the global `math`; node tests set globalThis.math) only parses: math.parse keeps the tree unfolded,
   then toTree() rebuilds the tree slips.py parse() gives (binary + - * / flattened across brackets, a - b = a + (-1)*b,
   a / b = a * b^-1, sqrt(x) = x^(1/2); a unary minus folds into a number only: -(3+4) is (-1)*(3+4), S3). A literal with no '.' or 'e'
   is exact (sympy Integer), else a Float (N1: "2.0" is a Float). Values are float math here, exact-then-float in sympy: they agree
   to ~1e-15, far inside EPS. Within a family the values come out sorted, so the order matches slips.py too.
   tests/fixtures/slips-golden-banks.json (every live bank form + corner forms) is run by both suites. */

export const FAMILIES = ["distribute", "sign", "drop", "reciprocal", "power", "factor", "dream", "trig", "units", "g"];
export const EPS = 1e-9;
/* SYNC: serve.py FAMILY_HINT (one fixed Cluck line per family; never prints a number or the answer; may point to a place, SPOT_COPY). Keep byte-equal: tests/slips.test.mjs checks it against serve.py. */
export const FAMILY_HINT = {
  distribute: "QUACK. Check the minus before the brackets. It goes to every term.",
  sign: "QUACK. Check every sign. One of them flipped.",
  drop: "QUACK. Count your terms. One of them went missing.",
  reciprocal: "QUACK. Check what is on top and what is on the bottom.",
  power: "QUACK. Check your powers. A square or a root slipped.",
  factor: "QUACK. Check your factors. Something got doubled or halved.",
  dream: "QUACK. Check your square or root of a sum. It does not split.",
  trig: "QUACK. Check your trig. Sine or cosine, degrees or radians.",
  units: "QUACK. Check your units. A power of ten slipped.",
  g: "QUACK. Check the value you used for g.",
};
/* FAMILY_HINT's line; a k=2 "inner+outer" pair (pairs) gets both lines in that order under one QUACK. (serve.py family_hint) */
export const familyHint = fam => fam.split("+").map((f, i) => i ? FAMILY_HINT[f].replace(/^QUACK\. /, "") : FAMILY_HINT[f]).join(" ");

export const ZERO = 1e-9;
export const SLIP_WIN = 0.005;   // slips.py SLIP_WIN (Tony D2): a slip's own window, never the grading tol
/* slips.py close(): relative to b (tolerance 1b); a zero b gets the absolute ZERO window. Or equal to 3 s.f. Slip matching uses the default. */
export const close = (a, b, tol = SLIP_WIN) => Math.abs(a - b) <= (b ? tol * Math.abs(b) : ZERO) || g3(a) === g3(b);
/* Python's f"{v:.3g}" */
function g3(v) {
  if (!Number.isFinite(v)) return String(v);
  if (v === 0) return Object.is(v, -0) ? "-0" : "0";
  const [m, x] = v.toExponential(2).split("e"), e = +x;
  if (e < -4 || e >= 3) return `${m.replace(/\.?0+$/, "")}e${e < 0 ? "-" : "+"}${String(Math.abs(e)).padStart(2, "0")}`;
  return String(+v.toPrecision(3));
}

/* tree nodes: num {v, rat: exact (sympy Integer/Rational) or not (sympy Float)}, pi, add/mul/pow {a: args}, fn {name, a} */
const num = (v, rat = true) => ({ t: "num", v, rat });
const add = a => ({ t: "add", a }), mul = a => ({ t: "mul", a }), pow = (b, x) => ({ t: "pow", a: [b, x] });
const fn = (name, x) => ({ t: "fn", name, a: [x] });
const neg = t => mul([num(-1), t]);
const isNum = n => n.t === "num" || n.t === "pi" || (n.a && n.a.every(isNum));

const FLOAT = "__slipsFloat";                             // parse() wraps each non-integer literal in FLOAT(..): math.js keeps no literal text
function toTree(node) {                                   // math.js node -> sympy-shaped tree; `bin` marks a binary + or * result (flattens)
  const n = node.type === "ParenthesisNode" ? node.content : node;
  if (n.type === "ParenthesisNode") return toTree(n);
  if (n.type === "ConstantNode" && typeof n.value === "number") return num(n.value);
  if (n.type === "SymbolNode" && n.name === "pi") return { t: "pi" };
  if (n.type === "FunctionNode") {
    const name = n.fn.name, a = n.args.map(toTree);
    if (a.length !== 1) throw new Error(`slips: ${name}/${a.length}`);
    if (name === FLOAT) return num(a[0].v, false);
    if (name !== "sqrt" && !Object.prototype.hasOwnProperty.call(FN, name)) throw new Error(`slips: unknown function ${name}`);   // slips.py _FN: never a free name
    return name === "sqrt" ? pow(a[0], num(0.5)) : fn(name, a[0]);
  }
  if (n.type === "OperatorNode") {
    if (n.implicit) throw new Error("slips: implicit *");   // slips.py (ast) can't read 2(3+4): the form syntax has none
    const a = n.args.map(toTree);
    const flat = (t, xs) => xs.flatMap(x => x.t === t && x.bin ? x.a : [x]);
    switch (n.fn) {
      case "unaryPlus": return a[0];
      case "unaryMinus": return negate(a[0]);
      case "add": return { ...add(flat("add", a)), bin: true };
      case "subtract": return { ...add(flat("add", [a[0], neg(a[1])])), bin: true };
      case "multiply": return { ...mul(flat("mul", a)), bin: true };
      case "divide": return { ...mul(flat("mul", [a[0], pow(a[1], num(-1))])), bin: true };
      case "pow": return pow(a[0], a[1]);
    }
  }
  throw new Error(`slips: cannot read ${n.type} ${n.fn || ""}`);
}
// slips.py _walk: a unary minus folds into a number (-3, -(-3)); anything else is (-1)*x, never flattened into a parent *, so -(3+4) keeps
// its terms (S3, review-227: the old fold made -(3+4) a bare -7 and sign/drop/distribute lost them).
const negate = x => x.t === "num" ? num(-x.v, x.rat) : neg(x);
const LIT = /(^|[^\w.])((?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)(?![\w.])/g;   // a number token (no lookbehind: older Safari)
export const parse = src => toTree(globalThis.math.parse(String(src).replace(/\*\*/g, "^").replace(/π/g, "pi")
  .replace(LIT, (_, pre, t) => pre + (/^[0-9]+$/.test(t) ? t : `${FLOAT}(${t})`))));   // N1: exact = the raw token is all digits (sympy auto_number)

const FN = { sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan, exp: Math.exp, log: Math.log, ln: Math.log, abs: Math.abs };
function val(n) {                                         // NaN when it has no real value (a symbol, a complex power, an unknown function)
  switch (n.t) {
    case "num": return n.v;
    case "pi": return Math.PI;
    case "add": return n.a.reduce((s, x) => s + val(x), 0);
    case "mul": return n.a.reduce((s, x) => s * val(x), 1);
    case "pow": return Math.pow(val(n.a[0]), val(n.a[1]));
    case "fn": return FN[n.name] ? FN[n.name](val(n.a[0])) : NaN;
    default: return NaN;
  }
}
function* nodes(e, path = [], up = null) {
  yield [path, e, up];
  for (const [i, a] of (e.a || []).entries()) yield* nodes(a, [...path, i], e);
}
function put(e, path, nw) {
  if (!path.length) return nw;
  const a = [...e.a];
  a[path[0]] = put(a[path[0]], path.slice(1), nw);
  return { ...e, a };
}
const flatMul = m => m.a.flatMap(a => a.t === "mul" ? flatMul(a) : [a]);   // slips.py _flat_mul
const isExp = (p, ...vs) => p.t === "pow" && isNum(p.a[1]) && vs.some(v => Math.abs(val(p.a[1]) - v) < EPS);

function* family(fam, e) {                                // slips.py _family, rule for rule: [mutant, outer (whole-answer slip), path changed (ROOT: outer)]
  const ns = [...nodes(e)];
  if (fam === "sign") {
    yield [neg(e), true, ROOT];
    for (const [p, n] of ns) if (n.t === "add") for (const i of n.a.keys()) yield [put(e, [...p, i], neg(n.a[i])), false, [...p, i]];
  } else if (fam === "drop") {
    for (const [p, n] of ns) if (n.t === "add") for (const i of n.a.keys()) {
      const rest = n.a.filter((_, j) => j !== i);
      yield [put(e, p, rest.length === 1 ? rest[0] : add(rest)), false, [...p, i]];
    }
  } else if (fam === "reciprocal") {
    yield [pow(e, num(-1)), true, ROOT];
    for (const [p, n, up] of ns) {
      if (n.t === "mul" && n.a.some(a => isExp(a, -1))) yield [put(e, p, pow(n, num(-1))), false, p];
      else if (isExp(n, -1) && !(up && up.t === "mul")) yield [put(e, p, n.a[0]), false, p];
    }
  } else if (fam === "power") {
    for (const [p, n] of ns) if (isExp(n, 2, 0.5, -2, -0.5)) yield [put(e, p, val(n.a[1]) < 0 ? pow(n.a[0], num(-1)) : n.a[0]), false, p];
    yield [pow(e, num(2)), true, ROOT];
    yield [pow(e, num(0.5)), true, ROOT];
  } else if (fam === "factor") {
    yield [mul([num(2), e]), true, ROOT];
    yield [mul([num(0.5), e]), true, ROOT];
  } else if (fam === "distribute") {                    // a Mul chain read whole from its top: a-k(b+c) is (-1)*(k*(b+c)) (S1)
    for (const [p, n, up] of ns) {
      if (n.t !== "mul" || (up && up.t === "mul")) continue;
      const flat = flatMul(n), isRat = a => a.t === "num" && a.rat;   // exact numbers only: -2.0*(..) is a Float, no distribute (N1)
      const k = flat.findIndex(a => a.t === "add"), first = flat.findIndex(isRat);
      const c = flat.filter(isRat).reduce((s, a) => s * a.v, 1);      // the sign of the numeric coefficient
      if (k < 0 || !(c < 0)) continue;
      const rest = flat.flatMap((a, i) => i === k || (i !== first && isRat(a)) ? [] : [i === first ? num(-c) : a])
        .filter(a => !(isRat(a) && a.v === 1));
      const s = add(flat[k].a.map((a, i) => i === 0 ? neg(a) : a));   // the first term only (Tony, Oct 23)
      yield [put(e, p, rest.length ? mul([...rest, s]) : s), false, p];
    }
  } else if (fam === "dream") {
    for (const [p, n] of ns) if (isExp(n, 2, 0.5) && n.a[0].t === "add") yield [put(e, p, add(n.a[0].a.map(t => pow(t, n.a[1])))), false, p];
  } else if (fam === "trig") {
    for (const [p, n] of ns) {
      if (n.t !== "fn" || !["sin", "cos", "tan"].includes(n.name)) continue;
      const x = n.a[0];
      if (n.name !== "tan") yield [put(e, p, fn(n.name === "sin" ? "cos" : "sin", x)), false, p];
      yield [put(e, p, fn(n.name, mul([x, { t: "pi" }, pow(num(180), num(-1))]))), false, p];
      yield [put(e, p, fn(n.name, mul([x, num(180), pow({ t: "pi" }, num(-1))]))), false, p];
    }
  } else if (fam === "units") {
    for (const k of [2, -2, 3, -3]) yield [mul([pow(num(10), num(k)), e]), true, ROOT];
  } else if (fam === "g") {
    const gs = ns.filter(([, n]) => n.t === "num" && !n.rat && [9.8, 9.81].some(v => Math.abs(n.v - v) < EPS)).map(([p]) => p);
    let m = e;
    for (const p of gs) m = put(m, p, num(10));
    if (gs.length) yield [m, false, lca(gs)];
  }
}

const same = (a, b) => b ? Math.abs(a - b) <= EPS * Math.abs(b) : a === 0;   // slips.py _same: relative (tiny-constant slips stay apart)
const cache = new Map();
/* slips.py _raw2: [raw, inner, pairs (filled by pairs()), sites, tree] in one pass; inner = the same per family over inner mutants only (no
   whole-answer wrapper); sites = raw with each value's paths */
function raw2(form) {
  form = String(form);
  if (cache.has(form)) return cache.get(form);
  const e = parse(form), out = [], inn = [], sit = [];
  for (const fam of FAMILIES) {
    const vs = [], is = [], ps = [];
    for (const [m, outer, path] of family(fam, e)) {
      const v = val(m);
      if (!Number.isFinite(v)) continue;
      const j = vs.findIndex(w => same(v, w));
      if (j < 0) { vs.push(v); ps.push([path]); } else if (!ps[j].some(q => cmpPath(q, path) === 0)) ps[j].push(path);
      if (!outer && !is.some(w => same(v, w))) is.push(v);
    }
    const order = vs.map((_, j) => j).sort((a, b) => vs[a] - vs[b]);
    out.push([fam, order.map(j => vs[j])]);
    inn.push([fam, is.sort((a, b) => a - b)]);
    sit.push([fam, order.map(j => [vs[j], ps[j].sort(cmpPath)])]);
  }
  const r = [out, inn, null, sit, e];
  if (cache.size > 512) cache.clear();
  cache.set(form, r);
  return r;
}
/* [[family, [values ascending, distinct within the family]], ...] before families are merged (slips.py raw) */
export const raw = form => raw2(form)[0];
/* raw() over inner slips only: the k=2 bag (slips.py inner) */
export const inner = form => raw2(form)[1];

/* k=2 (Tony D1/D3): one inner slip + one whole-answer (outer) slip; k=3 is not runtime. SLIP_K = 1 is today exactly. A k=2 entry's family
   is "inner+outer" (e.g. "drop+sign"). OUTER = slips.py OUTER: [family, forward on the inner value, undo on the typed value], float math. */
export const SLIP_K = 1;
const OUTER = [
  ["sign", v => -v, y => [-y]],
  ["reciprocal", v => v ? 1 / v : NaN, y => y ? [1 / y] : []],
  ["power", v => v * v, y => y >= 0 ? [-Math.sqrt(y), Math.sqrt(y)] : []],
  ["power", v => v >= 0 ? Math.sqrt(v) : NaN, y => y >= 0 ? [y * y] : []],
  ["factor", v => 2 * v, y => [y / 2]],
  ["factor", v => v / 2, y => [2 * y]],
  ["units", v => v * 100, y => [y / 100]],
  ["units", v => v / 100, y => [y * 100]],
  ["units", v => v * 1000, y => [y / 1000]],
  ["units", v => v / 1000, y => [y * 1000]],
];
export const OUTER_FAMS = [...new Set(OUTER.map(([f]) => f))];
/* [["inner+outer", [values ascending, distinct within the pair]], ...]: inner family in FAMILIES order, then outer (slips.py pairs) */
export function pairs(form) {
  const r = raw2(form);
  if (r[2]) return r[2];
  const out = [];
  for (const [fi, ivs] of r[1]) for (const fo of OUTER_FAMS) {
    const vs = [];
    for (const [f, fwd] of OUTER) if (f === fo) for (const v of ivs) {
      const w = fwd(v);
      if (Number.isFinite(w) && !vs.some(x => same(w, x))) vs.push(w);
    }
    if (vs.length) out.push([`${fi}+${fo}`, vs.sort((a, b) => a - b)]);
  }
  return (r[2] = out);
}
/* [[family, value]]: one entry per distinct value, the earliest family wins; k = 2 appends the inner+outer entries after every k=1 one */
export function mutants(form, k = 1) {
  const out = [];
  for (const [fam, vs] of [...raw(form), ...(k === 2 ? pairs(form) : [])]) for (const v of vs) if (!out.some(([, w]) => same(v, w))) out.push([fam, v]);
  return out;
}
/* the first family whose slip is close() to the typed value, else null (an unreadable form: null, never a throw) */
/* skip: values that never get a family hint (serve.py _slip_table): the answer (a SAME slip is already right) and each ignore_slips value */
/* k = 2 (default SLIP_K): no k=1 hit -> each outer slip undone on the typed value, looked up in that inner family's bag (slips.py match) */
export function match(form, value, tol = SLIP_WIN, skip = [], k = SLIP_K) {
  if (form == null || typeof value !== "number" || !Number.isFinite(value)) return null;
  try {
    const free = v => !skip.some(x => close(v, x, tol)), one = mutants(form);
    const hit = one.find(([, v]) => close(value, v, tol) && free(v));
    if (hit || k !== 2) return hit ? hit[0] : null;
    const seen = one.map(([, v]) => v);
    for (const [fi, ivs] of inner(form)) for (const fo of OUTER_FAMS) {
      const fresh = [];
      for (const [f, fwd, undo] of OUTER) {
        if (f !== fo) continue;
        const us = undo(value);
        for (const v of ivs) {
          const w = fwd(v);
          if (!Number.isFinite(w) || seen.some(x => same(w, x))) continue;
          fresh.push(w);
          if (free(w) && us.some(u => close(u, v, tol))) return `${fi}+${fo}`;
        }
      }
      seen.push(...fresh);
    }
    return null;
  } catch { return null; }
}

/* ---- spot (slips.py spot, rule for rule): on a collision, WHERE the slip is, never WHAT it is, never a number ------------------------- */
export const ROOT = [];                                   // the root's path: a whole-answer (outer) slip has no place in the form
function cmpPath(p, q) {                                  // Python tuple order
  for (let i = 0; i < Math.min(p.length, q.length); i++) if (p[i] !== q[i]) return p[i] - q[i];
  return p.length - q.length;
}
function lca(ps) {
  let pre = ps[0];
  for (const p of ps.slice(1)) { let n = 0; while (n < Math.min(pre.length, p.length) && pre[n] === p[n]) n++; pre = pre.slice(0, n); }
  return pre;
}
/* ALL the spot copy, one table (Tony vets it): equal to slips.py SPOT_COPY (pinned by tests/fixtures/slips-golden-spots.json).
   Structural words + written-order ordinals only: never a digit, never a literal of the form. */
export const SPOT_COPY = {
  region: "QUACK. Your pieces are fine but one. Redo {place}.",
  finish: "QUACK. The pieces look right. Check your last step{what}.",
  finish_what: ": {words}",
  or: " or ",
  dual: "QUACK. Redo {place}, then check your last step.",
  word: { sign: "your sign", units: "your units", factor: "a factor of two", power: "a square or square root", reciprocal: "flipping it upside down" },
  term: "the {nth} term",
  term_br: "the term in brackets",
  factor: "the {nth} factor",
  factor_br: "what is in the brackets",
  top: "the top of the fraction",
  bottom: "the bottom of the fraction",
  squared: "what is being squared",
  root: "what is under the square root",
  base: "the base of the power",
  exponent: "the power",
  fn: "what is inside {fn}",
  fn_name: { sin: "the sine", cos: "the cosine", tan: "the tangent", asin: "the inverse sine", acos: "the inverse cosine", atan: "the inverse tangent",
    exp: "the exponential", log: "the log", ln: "the log", abs: "the absolute value" },
  in: "{place} in {ctx}",
  in_short: { "what is in the brackets": "the brackets", "what is under the square root": "the square root", "what is being squared": "the square" },
  nth: ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"],
  nth_many: "one",
};
const fill = (t, o) => t.replace(/\{(\w+)\}/g, (_, k) => o[k]);
const at = (e, p) => p.reduce((n, i) => n.a[i], e);
const lit = n => !n.a;                                    // a number or pi: lifts to its parent
const hasBr = n => n.t === "add" || (n.t === "mul" && n.a.some(a => (a.t === "add" || a.t === "mul") && hasBr(a)));
const nth = (i, kind) => fill(SPOT_COPY[kind], { nth: i < SPOT_COPY.nth.length ? SPOT_COPY.nth[i] : SPOT_COPY.nth_many });
function lift(e, p) {                                     // a bare literal -> its parent; the x of a subtraction's (-1)*x -> the term
  while (p.length) {
    const n = at(e, p), up = at(e, p.slice(0, -1));
    if (lit(n) || (up.t === "mul" && up.a.length === 2 && p[p.length - 1] === 1 && up.a[0].t === "num" && up.a[0].v === -1)) { p = p.slice(0, -1); continue; }
    break;
  }
  return p;
}
/* slips.py place: [lifted path, structural name], [ROOT, null] when it lifts to the root */
export function place(e, path, ctx = true) {
  const c = SPOT_COPY, p = lift(e, path);
  if (!p.length) return [ROOT, null];
  const n = at(e, p), up = at(e, p.slice(0, -1)), i = p[p.length - 1];
  let name, isNth = false;
  if (up.t === "add") {
    const br = up.a.flatMap((a, j) => hasBr(a) ? [j] : []);
    if (br.length === 1 && br[0] === i) name = c.term_br; else { name = nth(i, "term"); isNth = true; }
  } else if (up.t === "mul") {
    if (isExp(n, -1)) name = c.bottom;
    else if (n.t === "add" && up.a.filter(a => a.t === "add").length === 1) name = c.factor_br;
    else if (up.a.some(a => isExp(a, -1))) name = c.top;
    else { name = nth(i, "factor"); isNth = true; }
  } else if (up.t === "pow") {
    name = i === 1 ? c.exponent : isExp(up, -1) ? c.bottom : isExp(up, 2, -2) ? c.squared : isExp(up, 0.5, -0.5) ? c.root : c.base;
  } else { const fname = c.fn_name[up.name] || c.fn_name.log; name = ctx ? fill(c.fn, { fn: fname }) : fname; }
  if (isNth && ctx && p.length > 1) {
    const [, around] = place(e, p.slice(0, -1), false);
    if (around) name = fill(c.in, { place: name, ctx: c.in_short[around] || around });
  }
  return [p, name];
}
/* slips.py spot: [kind "region" | "dual" | "finish" | null, lifted region path, line]; cands [[family, paths]] at one typed value */
export function spot(e, cands) {
  const c = SPOT_COPY, isRoot = p => p.length === 0;
  const inner = cands.flatMap(([, ps]) => ps.filter(p => !isRoot(p)));
  const whole = cands.filter(([, ps]) => ps.some(isRoot)).map(([f]) => f);
  if (!inner.length) {
    if (!whole.length) return [null, ROOT, null];
    const words = [...new Set(whole.map(f => f.split("+").pop()).filter(f => f in c.word).map(f => c.word[f]))].slice(0, 2);
    return ["finish", ROOT, fill(c.finish, { what: words.length ? fill(c.finish_what, { words: words.join(c.or) }) : "" })];
  }
  const [r, name] = place(e, lca(inner));
  if (name === null) return [null, ROOT, null];          // LCA = root with inner slips: the caller keeps the plain nudge
  return whole.length ? ["dual", r, fill(c.dual, { place: name })] : ["region", r, fill(c.region, { place: name })];
}
/* raw() with paths: [[family, [[value, [path, ...]], ...]], ...] (slips.py sites) */
export const sites = form => raw2(form)[3];
/* slips.py region: the spot line for one collision, or null (the plain nudge) */
export const region = (cands, form) => spot(raw2(form)[4], cands)[2];
/* slips.py cands: [[family, paths]] of every family with a slip close() to typed (not close to a skip value), FAMILIES order */
export function cands(form, typed, skip = [], tol = SLIP_WIN) {
  const out = [];
  for (const [fam, vs] of sites(form)) {
    const ps = [];
    for (const [v, pp] of vs) if (close(typed, v, tol) && !skip.some(x => close(v, x, tol))) for (const p of pp) if (!ps.some(q => cmpPath(q, p) === 0)) ps.push(p);
    if (ps.length) out.push([fam, ps.sort(cmpPath)]);
  }
  return out;
}
/* slips.py pair_cands: [[fam, paths]] for a k=2 match "inner+outer": the inner slip's places an undone outer slip lands on, plus ROOT */
export function pairCands(form, typed, fam, tol = SLIP_WIN) {
  const [fi, fo] = fam.split("+"), us = OUTER.filter(([f]) => f === fo).flatMap(([, , undo]) => undo(typed)), ps = [ROOT];
  for (const [v, pp] of sites(form).find(([f]) => f === fi)[1]) if (us.some(u => close(u, v, tol))) for (const p of pp) if (!ps.some(q => cmpPath(q, p) === 0)) ps.push(p);
  return [[fam, ps.sort(cmpPath)]];
}
/* SLIP_TIE (serve.py slip_tie_on()): off; the device has no env, so it is a const here, like SLIP_K */
export const SLIP_TIE = false;
/* serve.py slip_hit after match() gave `fam` (app.js gradeLocal): a k=2 pair -> {error, hint, spot?} (hint = familyHint, both lines); with
   SLIP_TIE, 2+ families on the value -> {collide, spot?}; else null (the family hint as before). spot: WHERE, never what or a number */
export function slipSpot(form, typed, skip, fam, tie = SLIP_TIE) {
  try {
    const pair = fam.includes("+"), c = pair ? pairCands(form, typed, fam) : tie ? cands(form, typed, skip) : [];
    if (!pair && c.length < 2) return null;
    const line = region(c, form), o = pair ? { error: fam, hint: familyHint(fam) } : { collide: c.map(([f]) => f) };
    return line ? { ...o, spot: line } : o;
  } catch { return null; }                                // never let the spot line break a graded try
}
