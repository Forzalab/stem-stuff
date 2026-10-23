/* Slips from the formula: the JS twin of slips.py (design/HANDOFF-slips-v2.md unit C), for uploaded banks graded on the device
   (app.js gradeLocal). Same 10 families, same order, same EPS, same close() and match(); the golden fixture
   tests/fixtures/slips-golden.json is shared by both test suites (tests/slips.test.mjs).
   math.js (vendor/math.min.js, the global `math`; node tests set globalThis.math) only parses: math.parse keeps the tree unfolded,
   then toTree() rebuilds the tree sympy's parse_expr(..., evaluate=False) gives (binary + - * / flattened, a - b = a + (-1)*b,
   a / b = a * b^-1, sqrt(x) = x^(1/2), unary minus applied at once). Values are float math here, exact-then-float in sympy:
   they agree to ~1e-15, far inside EPS. Within a family the values come out sorted, so the order matches slips.py too. */

export const FAMILIES = ["distribute", "sign", "drop", "reciprocal", "power", "factor", "dream", "trig", "units", "g"];
export const EPS = 1e-9;
/* SYNC: serve.py FAMILY_HINT (one fixed Cluck line per family; never names the term or the answer). Keep byte-equal: tests/slips.test.mjs checks it against serve.py. */
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

/* tree nodes: num {v, rat: integer or exact fraction (sympy Rational), float: sympy Float}, pi, sym, add/mul/pow {a: args}, fn {name, a} */
const num = (v, rat = true) => ({ t: "num", v, rat });
const add = a => ({ t: "add", a }), mul = a => ({ t: "mul", a }), pow = (b, x) => ({ t: "pow", a: [b, x] });
const fn = (name, x) => ({ t: "fn", name, a: [x] });
const neg = t => mul([num(-1), t]);
const isNum = n => n.t === "num" || n.t === "pi" || (n.a && n.a.every(isNum));

function toTree(node) {                                   // math.js node -> sympy-shaped tree; `bin` marks a binary + or * result (flattens)
  const n = node.type === "ParenthesisNode" ? node.content : node;
  if (n.type === "ParenthesisNode") return toTree(n);
  if (n.type === "ConstantNode") return num(+n.value, Number.isInteger(+n.value));
  if (n.type === "SymbolNode") return n.name === "pi" ? { t: "pi" } : { t: "sym", name: n.name };
  if (n.type === "FunctionNode") {
    const name = n.fn.name, a = n.args.map(toTree);
    if (a.length !== 1) throw new Error(`slips: ${name}/${a.length}`);
    return name === "sqrt" ? pow(a[0], num(0.5)) : fn(name, a[0]);
  }
  if (n.type === "OperatorNode") {
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
function negate(x) {                                      // sympy evaluates a unary minus at once: -3 is Integer(-3), -(a+b) is -a-b
  if (x.t === "num") return num(-x.v, x.rat);
  if ((x.t === "add" || x.t === "mul") && x.a.every(a => a.t === "num")) return num(-val(x), x.a.every(a => a.rat));   // -(3+4) is -7
  if (x.t === "add") return add(x.a.map(negate));
  if (x.t === "mul" && x.a[0].t === "num" && x.a[0].v === -1) return x.a.length === 2 ? x.a[1] : mul(x.a.slice(1));
  if (x.t === "mul" && x.bin) return mul([num(-1), ...x.a]);
  return neg(x);
}
export const parse = src => toTree(globalThis.math.parse(String(src).replace(/\*\*/g, "^").replace(/π/g, "pi")));

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
const isExp = (p, ...vs) => p.t === "pow" && isNum(p.a[1]) && vs.some(v => Math.abs(val(p.a[1]) - v) < EPS);

function* family(fam, e) {                                // slips.py _family, rule for rule
  const ns = [...nodes(e)];
  if (fam === "sign") {
    yield neg(e);
    for (const [p, n] of ns) if (n.t === "add") for (const i of n.a.keys()) yield put(e, [...p, i], neg(n.a[i]));
  } else if (fam === "drop") {
    for (const [p, n] of ns) if (n.t === "add") for (const i of n.a.keys()) {
      const rest = n.a.filter((_, j) => j !== i);
      yield put(e, p, rest.length === 1 ? rest[0] : add(rest));
    }
  } else if (fam === "reciprocal") {
    yield pow(e, num(-1));
    for (const [p, n, up] of ns) {
      if (n.t === "mul" && n.a.some(a => isExp(a, -1))) yield put(e, p, pow(n, num(-1)));
      else if (isExp(n, -1) && !(up && up.t === "mul")) yield put(e, p, n.a[0]);
    }
  } else if (fam === "power") {
    for (const [p, n] of ns) if (isExp(n, 2, 0.5, -2, -0.5)) yield put(e, p, val(n.a[1]) < 0 ? pow(n.a[0], num(-1)) : n.a[0]);
    yield pow(e, num(2));
    yield pow(e, num(0.5));
  } else if (fam === "factor") {
    yield mul([num(2), e]);
    yield mul([num(0.5), e]);
  } else if (fam === "distribute") {
    for (const [p, n] of ns) {
      if (n.t !== "mul") continue;
      const negs = n.a.flatMap((a, i) => a.t === "num" && a.rat && a.v < 0 ? [i] : []);
      const k = n.a.findIndex(a => a.t === "add");
      if (!negs.length || k < 0) continue;
      const c = negs[0];
      const rest = n.a.flatMap((a, i) => i === k || (i === c && a.v === -1) ? [] : [i === c ? num(-a.v, a.rat) : a]);
      const s = add(n.a[k].a.map((a, i) => i === 0 ? neg(a) : a));   // the first term only (Tony, Oct 23)
      yield put(e, p, rest.length ? mul([...rest, s]) : s);
    }
  } else if (fam === "dream") {
    for (const [p, n] of ns) if (isExp(n, 2, 0.5) && n.a[0].t === "add") yield put(e, p, add(n.a[0].a.map(t => pow(t, n.a[1]))));
  } else if (fam === "trig") {
    for (const [p, n] of ns) {
      if (n.t !== "fn" || !["sin", "cos", "tan"].includes(n.name)) continue;
      const x = n.a[0];
      if (n.name !== "tan") yield put(e, p, fn(n.name === "sin" ? "cos" : "sin", x));
      yield put(e, p, fn(n.name, mul([x, { t: "pi" }, pow(num(180), num(-1))])));
      yield put(e, p, fn(n.name, mul([x, num(180), pow({ t: "pi" }, num(-1))])));
    }
  } else if (fam === "units") {
    for (const k of [2, -2, 3, -3]) yield mul([pow(num(10), num(k)), e]);
  } else if (fam === "g") {
    const gs = ns.filter(([, n]) => n.t === "num" && !n.rat && [9.8, 9.81].some(v => Math.abs(n.v - v) < EPS)).map(([p]) => p);
    let m = e;
    for (const p of gs) m = put(m, p, num(10));
    if (gs.length) yield m;
  }
}

const same = (a, b) => Math.abs(a - b) <= EPS * Math.max(1, Math.abs(b));
const cache = new Map();
/* [[family, [values ascending, distinct within the family]], ...] before families are merged (slips.py raw) */
export function raw(form) {
  form = String(form);
  if (cache.has(form)) return cache.get(form);
  const e = parse(form), out = FAMILIES.map(fam => {
    const vs = [];
    for (const m of family(fam, e)) {
      const v = val(m);
      if (Number.isFinite(v) && !vs.some(w => same(v, w))) vs.push(v);
    }
    return [fam, vs.sort((a, b) => a - b)];
  });
  if (cache.size > 512) cache.clear();
  cache.set(form, out);
  return out;
}
/* [[family, value]]: one entry per distinct value, the earliest family wins */
export function mutants(form) {
  const out = [];
  for (const [fam, vs] of raw(form)) for (const v of vs) if (!out.some(([, w]) => same(v, w))) out.push([fam, v]);
  return out;
}
/* the first family whose slip is close() to the typed value, else null (an unreadable form: null, never a throw) */
/* skip: values that never get a family hint (serve.py _slip_table): the answer (a SAME slip is already right) and each ignore_slips value */
export function match(form, value, tol = SLIP_WIN, skip = []) {
  if (form == null || typeof value !== "number" || !Number.isFinite(value)) return null;
  try { return (mutants(form).find(([, v]) => close(value, v, tol) && !skip.some(x => close(v, x, tol))) || [null])[0]; } catch { return null; }
}
