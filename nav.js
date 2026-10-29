/* nav.js: Prev / Next and the questions list (design/NAV.md).
   The list: the open practice bank (window.stemBank, design/BANK.md), else an uploaded problems.json
   (window.stemOffline.codes()). Neither: no list (codes are the gate), so the nav stays hidden.
   Next plays a hidden queue (shuffle.mjs qPick, design/plans/QUEUE.md): fresh topics first, a miss back after 3 / 8 / 20 others,
   one queue per bank in localStorage stem-q-<bank>. Prev / Next first walk the questions already shown (history). No queue UI (D57).
   The list button says the bank code. Hooks: app.js fires "drill:problem" { code } after every load and "drill:answer"
   { code, right } after every graded pick. Navigation goes through location.hash, which app.js follows.
   The front door (DESIGN-v3 §1, Tony #2-#4): the front bank is the one "/" opens (serve.py's "last" for a new browser); serve.py FRONT
   is the one source, its payload says "front": the bar title (window.stemBank.front). Its bar says only that title, and Next plays the
   noob ramp (shuffle.mjs ramp) until "Shuffle" (the queue above). */
import { glue, family, qNew, qPick, qShow, qAnswer, qMigrate, qLoad, qSave, deadOpen, deadLead, ramp, rampAnswer, skipAhead, mockList, familiesMet, mockNew, mockNext, mockAnswer, mockOn } from "./shuffle.mjs";
import { isBankId, bareBank } from "./codes.mjs";
/* ?bank=P2X or ?bank=BANK_P2X (the instructor's link) -> that bank code, else null */
export function deepBank(search) {
  const s = String(new URLSearchParams(search).get("bank") || "").trim().toUpperCase();
  return isBankId(s) ? s : (bareBank(s) || {}).code || null;
}
const MAX = 60;
const SPAM_MS = 2000;                                               // a pick faster than this is a guess (Fable fix 4)
const esc = s => String(s).replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]);

/* ---------- titles: problem.title, else the first paragraph of the first text block as plain text ---------- */
const SYM = { mu: "μ", pi: "π", theta: "θ", alpha: "α", beta: "β", gamma: "γ", delta: "δ", Delta: "Δ", omega: "ω", lambda: "λ",
  sigma: "σ", rho: "ρ", phi: "φ", tau: "τ", epsilon: "ε", varepsilon: "ε", cdot: "·", times: "×", div: "÷", le: "≤", leq: "≤",
  ge: "≥", geq: "≥", ne: "≠", neq: "≠", infty: "∞", to: "→", approx: "≈", pm: "±", circ: "°", degree: "°", ldots: "…", dots: "…",
  cap: "∩", cup: "∪", setminus: "∖", subseteq: "⊆", subset: "⊂", in: "∈", notin: "∉", emptyset: "∅", forall: "∀", exists: "∃",
  neg: "¬", lnot: "¬", land: "∧", wedge: "∧", lor: "∨", vee: "∨", oplus: "⊕", rightarrow: "→", Rightarrow: "⇒", leftrightarrow: "↔",
  therefore: "∴", Box: "□", Diamond: "◇", square: "□", lozenge: "◇", vert: "|", mid: "|" };
const SUP = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "-": "⁻" };
const wrap = x => /^[\w.]+$/.test(x) ? x : `(${x})`;
export function texText(src) {
  let s = String(src);
  s = s.replace(/\^\s*\{?\\circ\}?/g, "°");
  for (let i = 0; i < 4; i++) {                                    // innermost first, so nesting unwinds
    s = s.replace(/\\(?:text|mathrm|mathbf|mathit|textbf|operatorname)\s*\{([^{}]*)\}/g, "$1")
         .replace(/\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, (_, a, b) => `${wrap(a)}/${wrap(b)}`)
         .replace(/\\sqrt\s*\{([^{}]*)\}/g, (_, a) => `√${wrap(a)}`);
  }
  s = s.replace(/\^\s*\{(-?\d+)\}|\^(\d)/g, (_, a, b) => [...(a ?? b)].map(c => SUP[c]).join(""))
       .replace(/\\(left|right)\b/g, "")
       .replace(/\\[,;: ]|~/g, " ").replace(/\\!/g, "")
       .replace(/\\([{}])/g, "$1")
       .replace(/\\([A-Za-z]+)/g, (_, n) => SYM[n] ?? n)
       .replace(/[{}]/g, "").replace(/_/g, "");
  return s.replace(/\s+/g, " ").trim();
}
/* ---------- TeX to grader-exact plain text (copy, Tony's answers for todo 108) ----------
   What a student would type into the answer box (serve.py to_python): (1/2)*m*v^2, sqrt(x^2 + 16), 2*pi*r, e^(-x/2), 3.2e-3.
   Spaces around = + binary - and relations; none around * / ^. Implicit products get "*", names (sin, sqrt, pi) never split.
   Past the grader's grammar: ASCII best effort (v_0, vec(F), mu, <=, !=, 30 deg, dx/dt, lim(x->inf) f, int(0, 3) f dx).
   aligned / cases rows: one per line. Units in \text stay text (3.2 m/s). texText above stays the display (Unicode) form. */
const PN = { alpha: "alpha", beta: "beta", gamma: "gamma", delta: "delta", epsilon: "epsilon", varepsilon: "epsilon", zeta: "zeta", eta: "eta",
  theta: "theta", vartheta: "theta", iota: "iota", kappa: "kappa", lambda: "lambda", mu: "mu", nu: "nu", xi: "xi", pi: "pi", varpi: "pi", rho: "rho",
  varrho: "rho", sigma: "sigma", varsigma: "sigma", tau: "tau", upsilon: "upsilon", phi: "phi", varphi: "phi", chi: "chi", psi: "psi", omega: "omega",
  Gamma: "Gamma", Theta: "Theta", Lambda: "Lambda", Xi: "Xi", Pi: "Pi", Sigma: "Sigma", Phi: "Phi", Psi: "Psi", Omega: "Omega",
  infty: "inf", hbar: "hbar", ell: "l", partial: "d", emptyset: "{}", varnothing: "{}" };
const PO = { le: "<=", leq: "<=", ge: ">=", geq: ">=", ne: "!=", neq: "!=", approx: "~=", sim: "~", simeq: "~=", equiv: "==", cong: "~=", propto: "~",
  pm: "+-", mp: "-+", to: "->", rightarrow: "->", longrightarrow: "->", Rightarrow: "=>", implies: "=>", Leftarrow: "<=", leftarrow: "<-", gets: "<-",
  leftrightarrow: "<->", Leftrightarrow: "<=>", iff: "<=>", mapsto: "->", in: "in", notin: "not in", subset: "subset", subseteq: "subseteq", supset: "supset",
  supseteq: "supseteq", cap: "cap", cup: "cup", setminus: "\\", wedge: "and", land: "and", vee: "or", lor: "or", oplus: "xor", mid: "|", vert: "|",
  parallel: "||", perp: "perp", ll: "<<", gg: ">>", lt: "<", gt: ">", bmod: "mod", ast: "*" };
const PW = { neg: "not", lnot: "not", forall: "for all", exists: "exists", therefore: "therefore", because: "because", Box: "[]", square: "[]",
  Diamond: "<>", lozenge: "<>", Delta: "Delta", nabla: "nabla" };   // prefix words: a space after (Delta x is one quantity, never Delta*x)
const PF = { sin: 1, cos: 1, tan: 1, sec: 1, csc: 1, cot: 1, sinh: 1, cosh: 1, tanh: 1, arcsin: "asin", arccos: "acos", arctan: "atan", ln: 1, log: 1, exp: 1,
  lg: "log10", det: 1, gcd: 1, max: 1, min: 1, sgn: 1, arg: 1, Pr: 1 };
const PL = { lim: 1, sum: 1, prod: 1, int: 1, iint: 1, oint: 1, limsup: 1, liminf: 1, sup: 1, inf: 1 };      // limits prefixes: name(range) body
const PA = { vec: "vec", overrightarrow: "vec", hat: "hat", widehat: "hat", bar: "bar", overline: "bar", tilde: "tilde", widetilde: "tilde", underline: "" };
const PTXT = new Set(["text", "textrm", "textit", "textbf", "textsf", "texttt", "mbox", "hbox", "textnormal", "textup"]);
const PSKIP = new Set(["left", "right", "big", "Big", "bigg", "Bigg", "bigl", "bigr", "Bigl", "Bigr", "biggl", "biggr", "displaystyle", "textstyle",
  "scriptstyle", "limits", "nolimits", "quad", "qquad", "middle", "mathstrut", "strut", "nonumber", "notag", "boldsymbol", "bm", "mathbf", "mathit",
  "mathsf", "mathcal", "mathfrak", "mathscr", "mathbb", "mathtt", "rm", "bf", "it", "cal", "htmlClass", "color", "textcolor"]);
const BARE = ["arcsin", "arccos", "arctan", "sinh", "cosh", "tanh", "sqrt", "sin", "cos", "tan", "sec", "csc", "cot", "exp", "log", "ln", "lim", "pi"];
const ATOM = /^[\w.]+$/;
const atomic = (s, lead) => { let d = 0; for (let i = 0; i < s.length; i++) { const c = s[i]; if (c === "(") d++; else if (c === ")") d--; else if (!d && /[ +\-*/=<>,]/.test(c) && !(lead && i === 0 && c === "-")) return false; } return true; };
const oneParen = s => { if (s[0] !== "(") return false; let d = 0; for (let i = 0; i < s.length; i++) { d += s[i] === "(" ? 1 : s[i] === ")" ? -1 : 0; if (!d) return i === s.length - 1; } return false; };
const wrapP = (s, lead) => (atomic(s, lead) || oneParen(s)) && s !== "" ? s : `(${s})`;
const isDiff = (n, d) => /^d(\^\d)?[A-Za-z]?$/.test(n) && /^d[A-Za-z](\^\d)?$/.test(d);   // d/dx, dy/dx, d^2y/dx^2

function texLex(src) {
  const t = [], s = String(src);
  for (let i = 0; i < s.length;) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === "\\") {
      const m = /^\\([A-Za-z]+)\*?|^\\(.)/s.exec(s.slice(i));
      if (!m) { i++; continue; }
      i += m[0].length;
      const n = m[1];
      if (n && (PTXT.has(n) || n === "operatorname" || (n === "mathrm" && /^\s*\{[^{}]{2,}\}/.test(s.slice(i))))) {   // raw text: read its braces
        let j = s.indexOf("{", i), d = 0, k = j;
        if (j < 0 || s.slice(i, j).trim()) continue;
        for (; k < s.length; k++) { if (s[k] === "{") d++; else if (s[k] === "}" && !--d) break; }
        const raw = s.slice(j + 1, k).replace(/\\[,;: ]|~/g, " ").replace(/\\([%$&#_{}])/g, "$1").replace(/\\[A-Za-z]+\s*/g, "");
        t.push(n === "operatorname" ? { fn: raw.trim() } : { txt: raw }); i = k + 1; continue;
      }
      if (n === "begin" || n === "end") {
        const e = /^\s*\{([A-Za-z*]+)\}/.exec(s.slice(i)); if (!e) continue;
        i += e[0].length;
        if (n === "begin" && /^array/.test(e[1])) { const a = /^\s*\{[^{}]*\}/.exec(s.slice(i)); if (a) i += a[0].length; }
        t.push({ [n]: e[1].replace("*", "") }); continue;
      }
      t.push(n ? { c: n } : { c: m[2] === "\\" ? "\\\\" : m[2] }); continue;
    }
    const num = /^(?:\d+(?:\{,\}\d+)*(?:\.\d+)?|\.\d+)/.exec(s.slice(i));
    if (num) { t.push({ num: num[0].replace(/\{,\}/g, "") }); i += num[0].length; continue; }
    if (/[A-Za-z]/.test(c)) {
      const w = BARE.find(b => s.startsWith(b, i) && !/[A-Za-z]/.test(s[i + b.length] || ""));   // a bare "sin x": the name, never s*i*n
      if (w) { t.push(w === "pi" ? { c: "pi" } : { c: w === "sqrt" ? "sqrt" : w }); i += w.length; continue; }
      t.push({ v: c }); i++; continue;
    }
    t.push({ ch: c }); i++;
  }
  return t;
}

/* items: { k: "v" value | "f" fraction-like value (wrapped in a product) | "o" operator | "x" text (joined by a space) | "p" prefix (a space after) |
   "fn" function | "(" | ")" | "nl", t } */
function texParse(toks) {
  let i = 0, ints = 0;
  const env = [];
  const peek = () => toks[i];
  const arg = () => {                                           // one argument: a {group} or a single token
    const k = toks[i];
    if (!k) return [];
    if (k.ch === "{") { i++; return seq("}"); }
    if (k.ch === "}") return [];
    if (k.num && k.num.length > 1 && /^\d\d/.test(k.num)) { const d = k.num[0]; k.num = k.num.slice(1); return [{ k: "v", t: d }]; }   // \frac12, x^23: one digit
    return seq(null, 1);
  };
  const raw = () => {                                           // a subscript's plain letters (v_{max} is v_max, not v_m*a*x)
    const k = toks[i];
    if (k && k.ch === "{") {
      let j = i + 1, out = "";
      for (; toks[j] && (toks[j].v || toks[j].num); j++) out += toks[j].v || toks[j].num;
      if (out && toks[j] && toks[j].ch === "}") { i = j + 1; return out; }
    } else if (k && (k.v || k.num)) { i++; return (k.v || k.num); }
    return null;
  };
  const sub = () => { const r = raw(); if (r != null) return r; const s = render(arg(), true); return ATOM.test(s) ? s : `(${s})`; };
  function post(it) {                                           // ^ _ ' ! after an item
    for (;;) {
      const k = peek(); if (!k) return it;
      if (k.ch === "_") { i++; if (it.k === "p") it.lo = render(arg(), true).replace(/ /g, ""); else if (it.k === "fn") it.base = sub(); else it.t += "_" + sub(); continue; }
      if (k.ch === "^") {
        i++;
        const n = peek();
        if (n && (n.c === "circ" || n.c === "degree")) { i++; return [it, { k: "v", t: "deg", sp: 1 }]; }
        if (n && n.ch === "{" && toks[i + 1] && toks[i + 1].c === "circ" && toks[i + 2] && toks[i + 2].ch === "}") { i += 3; return [it, { k: "v", t: "deg", sp: 1 }]; }
        if (n && n.c === "prime") { i++; it.t += "'"; continue; }
        const e = render(arg(), true);
        if (it.k === "p") { it.hi = e.replace(/ /g, ""); continue; }
        if (it.k === "fn") { it.pow = e; continue; }
        it.t = (it.k === "f" ? `(${it.t})` : it.t) + "^" + (ATOM.test(e) ? e : `(${e})`); it.k = it.k === "f" ? "v" : it.k; continue;
      }
      if (k.ch === "'" || k.ch === "!") { i++; it.t += k.ch; continue; }
      return it;
    }
  }
  function one() {
    const k = toks[i++];
    if (k.num) return { k: "v", t: k.num };
    if (k.v) {
      if (ints && k.v === "d" && toks[i] && toks[i].v) { ints--; return { k: "x", t: "d" + toks[i++].v }; }
      return { k: "v", t: k.v };
    }
    if (k.txt != null) { const t = k.txt.replace(/\s+/g, " ").trim(); return t ? { k: "x", t } : null; }
    if (k.fn != null) return { k: "fn", t: k.fn };
    if (k.begin) {
      env.push(k.begin);
      return /matrix/.test(k.begin) ? { k: "(", t: "[" } : /cases|array/.test(k.begin) ? { k: "nl" } : null;
    }
    if (k.end) { env.pop(); return /matrix/.test(k.end) ? { k: ")", t: "]" } : /cases|array/.test(k.end) ? { k: "nl" } : null; }
    if (k.ch != null) {
      const c = k.ch, e = env[env.length - 1] || "";
      if (c === "{") {                                         // {x}^{2} (math.js toTex): the group takes the ^ / _ that follows
        const g = seq("}"), n = toks[i];
        if (g.length === 1) return g[0];
        return !g.length ? null : n && (n.ch === "^" || n.ch === "_") ? { k: "v", t: wrapP(render(g, true)) } : g;
      }
      if (c === "(" || c === "[") return { k: "(", t: c };
      if (c === ")" || c === "]") return { k: ")", t: c };
      if (c === "|") return { k: "|" };
      if (c === "&") return /cases|array/.test(e) ? { k: "o", t: ",", c: 1 } : /matrix/.test(e) ? { k: "o", t: ",", c: 1 } : null;
      if (c === "," || c === ";") return { k: "o", t: c, c: 1 };
      if (c === "*" || c === "/") return { k: "o", t: c };
      if (c === "~") return null;
      if ("=+-<>:".includes(c)) return { k: "o", t: c, s: 1 };
      if (c === ".") return { k: "v", t: ".", tail: 1 };
      return { k: "x", t: c };
    }
    const n = k.c;
    if (n === "\\\\") return /matrix/.test(env[env.length - 1] || "") ? { k: "o", t: ";", c: 1 } : { k: "nl" };
    if (n === "," || n === ";" || n === ":" || n === "!" || n === " " || n === ">") return null;
    if (n === "{" || n === "}") return { k: "x", t: n };
    if (n === "%" || n === "$" || n === "#" || n === "&" || n === "_") return { k: "v", t: n, tail: n === "%" };
    if (n === "|") return { k: "x", t: "||" };
    if (n === "lvert" || n === "lVert") return { k: "|", open: 1 };
    if (n === "rvert" || n === "rVert") return { k: "|", close: 1 };
    if (n === "langle") return { k: "(", t: "<" };
    if (n === "rangle") return { k: ")", t: ">" };
    if (n === "lbrace") return { k: "x", t: "{" };
    if (n === "rbrace") return { k: "x", t: "}" };
    if (n === "left" || n === "right") { if (toks[i] && toks[i].ch === ".") i++; return null; }
    if (PSKIP.has(n)) { if ((n === "color" || n === "textcolor" || n === "htmlClass") && toks[i] && toks[i].ch === "{") arg(); return null; }
    if (n === "frac" || n === "dfrac" || n === "tfrac" || n === "cfrac") {
      const a = render(arg(), true), b = render(arg(), true);
      if (isDiff(a.replace(/\*/g, ""), b.replace(/\*/g, ""))) { const s = `${a.replace(/\*/g, "")}/${b.replace(/\*/g, "")}`; return /^d(\^\d)?\//.test(s) ? { k: "p", t: s } : { k: "f", t: s }; }
      return { k: "f", t: `${wrapP(a, 1)}/${wrapP(b)}` };
    }
    if (n === "sqrt") {
      let root = null;
      if (toks[i] && toks[i].ch === "[") { i++; root = render(seq("]"), true); }
      const a = render(arg(), true);
      return root ? { k: "v", t: `${wrapP(a)}^(1/${root})` } : { k: "v", t: `sqrt(${a})` };
    }
    if (n === "binom" || n === "dbinom" || n === "tbinom") { const a = render(arg(), true), b = render(arg(), true); return { k: "v", t: `C(${a}, ${b})` }; }
    if (n === "pmod") return { k: "x", t: `(mod ${render(arg(), true)})` };
    if (n === "dot" || n === "ddot") { const a = render(arg(), true); return { k: "f", t: n === "dot" ? `d${a}/dt` : `d^2${a}/dt^2` }; }
    if (n in PA) { const a = render(arg(), true); return PA[n] ? { k: "v", t: `${PA[n]}(${a})` } : { k: "v", t: a }; }
    if (n === "times" || n === "cdot" || n === "ast") return { k: "o", t: "*" };
    if (n === "div") return { k: "o", t: "/" };
    if (n === "circ" || n === "degree") return { k: "v", t: "deg", sp: 1 };
    if (n === "prime") return { k: "v", t: "'", tail: 1 };
    if (n === "ldots" || n === "cdots" || n === "dots" || n === "dotsc" || n === "dotsb" || n === "vdots" || n === "ddots") return { k: "x", t: "..." };
    if (n in PW) return { k: "x", t: PW[n], pre: 1 };
    if (n in PO) return { k: "o", t: PO[n], s: 1 };
    if (n in PL) { if (/int/.test(n)) ints++; return { k: "p", t: n }; }
    if (n in PF) return { k: "fn", t: PF[n] === 1 ? n : PF[n] };
    if (n in PN) return PN[n] ? { k: "v", t: PN[n] } : null;
    return { k: "v", t: n };                                     // an unknown command: its name
  }
  function seq(stop, single) {
    const out = [];
    while (i < toks.length) {
      const k = toks[i];
      if (stop && k.ch === stop) { i++; break; }
      if (!stop && k.ch === "}") { if (single) break; i++; continue; }   // a stray "}" at the top
      let it = one();
      if (it == null) { if (single && out.length) break; continue; }
      if (Array.isArray(it)) { out.push(...it); if (single) break; continue; }
      if (!single) it = post(it);                                 // x_0^3: a one-token argument takes no ^ _ of its own
      if (Array.isArray(it)) out.push(...it); else out.push(it);
      if (single) break;
    }
    return out;
  }
  return seq(null);
}

const ends = it => it && (it.k === "v" || it.k === "f" || it.k === ")" || (it.k === "x" && !it.pre));
const starts = it => it && (it.k === "v" || it.k === "f" || it.k === "(" || it.k === "fn" || it.k === "p" || it.k === "x");
function texApply(items) {
  /* | pairs: an opening bar where a value can start, else it closes the last open one */
  let open = 0;
  items = items.map((it, j) => {
    if (it.k !== "|") return it;
    const prev = items[j - 1];
    const o = it.open || (!it.close && (!open || !ends(prev)));
    if (o) { open++; return { k: "(", t: "abs(", abs: 1 }; }
    open = Math.max(0, open - 1); return { k: ")", t: ")" };
  });
  const match = j => { let d = 0; for (let m = j; m < items.length; m++) { if (items[m].k === "(") d++; else if (items[m].k === ")" && !--d) return m; } return items.length - 1; };
  /* functions, right to left: sin x -> sin(x), sin^2 x -> sin(x)^2, log_2 x -> log(x)/log(2), ln|x| -> ln(abs(x)) */
  for (let j = items.length - 1; j >= 0; j--) {
    const f = items[j]; if (f.k !== "fn") continue;
    let e = j + 1, a;
    if (items[e] && items[e].k === "(") { const m = match(e); a = render(items.slice(e, m + 1), true); if (!items[e].abs && /^[([]/.test(a) && a.endsWith(")")) a = a.slice(1, -1); e = m + 1; }
    else { while (items[e] && (items[e].k === "v" || items[e].k === "f") && (e === j + 1 || !items[e].call)) e++; a = render(items.slice(j + 1, e), true); }
    let name = f.t, t;
    if (f.pow === "-1" && /^(sin|cos|tan)$/.test(name)) { name = "a" + name; f.pow = null; }
    if (!a) t = name;
    else if (f.base && f.base !== "10" && name === "log") t = `log(${a})/log(${f.base})`;
    else t = `${f.base === "10" && name === "log" ? "log10" : name}(${a})`;
    if (f.pow) t += "^" + (ATOM.test(f.pow) ? f.pow : `(${f.pow})`);
    items.splice(j, e - j, { k: f.base && f.base !== "10" && name === "log" ? "f" : "v", t, call: 1 });
  }
  /* prefixes: lim_{x->inf} -> lim(x->inf), int_0^3 -> int(0, 3), sum_{i=1}^n -> sum(i = 1, n) */
  return items.map(it => it.k === "p" && (it.lo != null || it.hi != null) ? { ...it, t: `${it.t}(${[it.lo, it.hi].filter(x => x != null).join(", ")})` } : it);
}

function render(items, inner) {
  items = texApply(items);
  const out = [];                                               // { s, it }
  let prev = null;
  const put = (s, it) => out.push({ s, it });
  for (const it of items) {
    if (it.k === "nl") { put("\n"); prev = null; continue; }
    if (it.k === "o") {
      const bin = ends(prev) || (prev && prev.k === "x");
      if (it.c) put(it.t + " ");
      else if (it.s && (it.t === "-" || it.t === "+") && !bin) put(prev && prev.k === "o" && prev.s ? " " + it.t : it.t);   // unary: -x
      else if (it.s) put(prev ? ` ${it.t} ` : `${it.t} `);
      else put(it.t);
      prev = it; continue;
    }
    if (it.tail) { put(it.t, it); prev = { k: "v" }; continue; }   // . % ' after anything, no gap
    if (prev && ends(prev) && starts(it)) {
      if (it.sp || prev.k === "x" || it.k === "x" || it.k === "p") put(" ");
      else if (it.k === "(" && /^[fghFGP]'*$/.test(prev.t || "")) { /* f(x): a function's call */ }
      else put("*", { star: 1 });
    } else if (prev && (prev.k === "p" || prev.pre) && it.k !== ")") put(" ");
    else if (prev && prev.k === "o" && prev.s && it.k === "x") { /* "= text": the operator's own space */ }
    put(it.t ?? "", it);
    prev = it;
  }
  /* a fraction next to * or / is wrapped: (1/2)*m*v^2 */
  const near = j => [out[j - 1], out[j + 1]].some(n => n && /^[*/]$/.test(n.s));
  let s = out.map((x, j) => x.it && x.it.k === "f" && near(j) ? `(${x.s})` : x.s).join("");
  s = s.replace(/[ \t]+/g, " ").replace(/ +([,;)\]])/g, "$1").replace(/([([]) +/g, "$1").replace(/ *\n */g, "\n");
  return inner ? s.replace(/\n/g, " ").trim() : s.split("\n").map(l => l.trim()).filter(Boolean).join("\n");
}

export function texPlain(tex) {
  const s = String(tex ?? "").replace(/(\d+(?:\.\d+)?)\s*\\(?:times|cdot)\s*10\s*\^\s*(?:\{\s*([-+]?\d+)\s*\}|(\d))/g, (_, m, a, b) => `${m}\\sci{e${(a ?? b).replace("+", "")}}`);
  const toks = texLex(s);
  /* \sci{e-3}: the joined scientific number, one value, so 3.2e-3 never reads as 3.2*e - 3 */
  for (let j = 0; j < toks.length; j++) {
    if (toks[j].c !== "sci") continue;
    let k = j + 2, e = "";
    for (; toks[k] && toks[k].ch !== "}"; k++) e += toks[k].v || toks[k].num || toks[k].ch || "";
    toks.splice(j - 1, k - j + 2, { num: toks[j - 1].num + e });
    j--;
  }
  return render(texParse(toks));
}
/* markdown marks out, TeX to plain text; "\$" is a literal dollar (same cut as app.js md()) */
export function plain(md) {
  const math = [];
  let s = String(md).replace(/\\\$/g, () => { math.push("$"); return `\u0001${math.length - 1}\u0002`; });
  s = s.replace(/\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g, (_, a, b) => { math.push(texText(a ?? b)); return `\u0001${math.length - 1}\u0002`; });
  s = s.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")                   // links, images
       .replace(/`([^`]*)`/g, "$1")
       .replace(/(\*\*|__|\*|_|~~)(?=\S)([\s\S]*?\S)\1/g, "$2")     // emphasis
       .replace(/^\s*(#{1,6}|>|[-*+]|\d+\.)\s+/gm, "")
       .replace(/<[^>]*>/g, "");
  return s.replace(/\u0001(\d+)\u0002/g, (_, i) => math[+i]).replace(/\s+/g, " ").trim();
}
export function clip(s, n = MAX) {
  if (s.length <= n) return s;
  const cut = s.slice(0, n - 1), sp = cut.lastIndexOf(" ");
  return (sp > n / 2 ? cut.slice(0, sp) : cut).replace(/[\s,.;:(—-]+$/, "") + "…";
}
export function titleOf(p) {
  if (!p) return "";
  if (typeof p.title === "string" && p.title.trim()) return clip(p.title.trim().replace(/\s+/g, " "));
  const b = (p.body || []).find(x => x && x.type === "text" && x.md);
  if (!b) return "";
  const para = [];
  for (const line of (Array.isArray(b.md) ? b.md.join("\n") : String(b.md)).split("\n")) {
    if (/^\s*\|/.test(line) || /^\s*\$\$\s*$/.test(line)) break;     // a table or a display block ends the title
    if (!line.trim()) { if (para.length) break; continue; }
    para.push(line.trim());
  }
  return sentences(plain(para.join(" ")));
}
/* too long: end at the last full sentence that fits, else cut at a word */
function sentences(s, n = MAX) {
  if (s.length <= n) return s;
  let end = -1;
  for (const m of s.matchAll(/[.?!](?=\s)/g)) { if (m.index >= n) break; end = m.index; }
  return end >= n / 3 ? s.slice(0, end + 1) : clip(s, n);
}

/* ---------- the nav ---------- */
/* a ?bank= link makes its bank this browser's live list (app.js stem-src, read on DOMContentLoaded, after this module ran); the query
   goes, so a later switch to another bank sticks on reload (the last bank is remembered: stem-src) */
if (typeof location !== "undefined" && deepBank(location.search)) {
  try { localStorage.setItem("stem-src", deepBank(location.search)); } catch { /* blocked: the default opens */ }
  const u = new URLSearchParams(location.search); u.delete("bank");
  history.replaceState(history.state, "", location.pathname + (String(u) ? "?" + u : "") + location.hash);
}
/* ?mock=1 (the night-before link, W103b): the front bank starts its mock once it is open (update); the query goes, so a reload resumes it */
let wantMock = false;
if (typeof location !== "undefined" && new URLSearchParams(location.search).get("mock") === "1") {
  wantMock = true;
  const u = new URLSearchParams(location.search); u.delete("mock");
  history.replaceState(history.state, "", location.pathname + (String(u) ? "?" + u : "") + location.hash);
}
if (typeof document !== "undefined" && document.getElementById("qnav")) init();

function init() {
  const $ = s => document.querySelector(s);
  const root = document.documentElement;
  const nav = $("#qnav"), btn = $("#qlistBtn"), name = $("#qlistName"), panel = $("#qlist"), list = panel.querySelector("ol"), prev = $("#qprev"), next = $("#qnext");
  const modes = $("#qmodes"), mix = $("#qmix"), skip = $("#qskip"), mockBtn = $("#qmock");
  const bank = () => window.stemBank && window.stemBank.code ? window.stemBank : null;
  const off = () => bank() || window.stemOffline;                    // the live list: get(c), codes()
  const rd = () => window.stemRedo || null;                          // a Redeem showing's own grading namespace (app.js)
  let codes = [], cur = null;
  function mark(c) {                                                 // this browser's record first, else the bank's server mark
    const s = window.stemOffline, rec = s && s.doneGet ? s.doneGet(c) : null, b = bank();
    const m = rec || (b ? b.mark(c) : null);
    return b && rd() && rd().has(c) ? { ...m, again: true } : m;     // a re-showing: its old marks stay, faded, behind the history glyph (retry tag)
  }
  /* sugar snacks ride right before their real (design/REWARDS-WIRING.md); a bank problem carries .before, an upload saccharine.before */
  const beforeOf = c => { const p = off() && off().get(c); return !p ? null : p.before || (p.saccharine && p.saccharine.snack && p.saccharine.before) || null; };
  const snack = c => { const p = off() && off().get(c); return !!p && !!(p.snack || (p.saccharine && p.saccharine.snack)); };
  const dead = c => { const p = off() && off().get(c); return !!p && !!(p.dead || (p.saccharine && p.saccharine.dead)); };   // T28 dead-easy: a sugar warm-up, placed by shuffle.mjs deadOpen / deadLead
  const all = () => { const o = off(); return (o && o.codes ? o.codes() : []).filter(c => !(window.stemHidden && window.stemHidden(c))); };
  const pool = () => all().filter(c => !snack(c) && !dead(c));                 // the queue plays the reals; a snack rides in front of its real
  /* topic: the bank's topic / parent, else the sugar title's "Question N" (its variants A, B, C group: no near-repeats), else the code */
  const group = p => { const m = /^(.*?\bQuestion\s+\d+)\b/i.exec(String(p.title || (p.saccharine && p.saccharine.title) || "")); return m ? m[1] : null; };
  const topicOf = c => { const p = off() && off().get(c); return (p && (p.topic || p.parent || group(p))) || family(c); };
  /* noob mode (the front bank, until "Shuffle"): tier 0 = a dead-easy, else the author's noob.tier 1-3, untagged = 3 */
  const front = () => !!bank() && !!bank().front;
  const noob = () => front() && !Q().mix;
  const tierOf = c => { if (dead(c)) return 0; const p = off() && off().get(c), t = p && p.noob && p.noob.tier; return [1, 2, 3].includes(t) ? t : 3; };
  /* a returner (stem-noob-<bank>, set at the first answer; read once per page, so this visit's own opener plays out) skips the opener */
  const back = new Map();
  const returner = () => {
    const id = bank().code;
    if (!back.has(id)) { let v = false; try { v = !!localStorage.getItem("stem-noob-" + id); } catch { /* blocked */ } back.set(id, v); }
    return back.get(id);
  };
  const opener = deads => front() && returner() ? [] : deads;

  /* ---------- the queue: one per bank (D64), saved after every change; the first open migrates the saved marks ---------- */
  let q = null, qFor = "", pending = null;
  function Q() {
    const id = bank() ? bank().code : "upload";
    if (q && qFor === id) return q;
    qFor = id; pending = null;
    q = qLoad(id);
    if (!q) { q = qMigrate(qNew(Math.random().toString(36).slice(2)), pool(), mark); qSave(id, q); }
    return q;
  }
  const save = () => { if (q) qSave(qFor, q); };
  /* a Redeem showing (D60/D61 data flag): the item carries redeem; app.js grades it fresh in round r, so the old lockout stays */
  function use(e) {
    const R = rd(); if (!R) return;
    if (e.r) R.set(e.c, e.r, e.redeem); else R.clear();
  }
  function shown(code, fresh = false) {                              // a load: history, else a new showing (a pick, a list row, a typed code)
    const st = Q(), h = st.hist[st.at];
    if (!fresh && h && h.c === code) return;                         // a reload, Prev / Next through history: the same showing
    const e = pending && pending.c === code ? pending : { c: code, r: rd() && rd().has(code) ? rd().get().n : 0, redeem: false };
    pending = null;
    qShow(st, code);
    if (st.then === code) st.then = null;
    st.hist = st.hist.slice(0, st.at + 1).concat([{ c: e.c, r: e.r, redeem: !!e.redeem }]).slice(-80);
    st.at = st.hist.length - 1;
    save();
  }
  /* the next item: forward through history first, then a real waiting behind its snack, then the queue's pick */
  /* the nearest history item in direction d that is still in the list (an older upload's codes are skipped), or -1 */
  function hop(st, d) {
    const live = new Set(all());
    for (let i = st.at + d; i >= 0 && i < st.hist.length; i += d) if (live.has(st.hist[i].c)) return i;
    return -1;
  }
  function upNext() {
    const st = Q();
    const fw = hop(st, 1);
    if (fw >= 0) return { e: st.hist[fw], step: fw };
    if (st.mock && !st.mock.done) {                                    // the night-before mock (W103b): its list, then its misses (before the dead-easy opener)
      const m = mockNext(st.mock); save();
      if (m && m.end) note(`Night-before mock: ${m.score} / ${m.of}`);   // COPY-PENDING (W103b) the score line
      if (m && m.code) {
        const k = mark(m.code), back = st.mock.miss !== null, again = back || !!(st.seen[m.code] && st.seen[m.code].n) || !!(k && (k.x || k.done === "correct" || k.done === "out"));
        return { e: { c: m.code, r: again ? Math.floor(Date.now() / 1000) : 0, redeem: !!(st.seen[m.code] && st.seen[m.code].owe) } };   // a closed card plays a fresh round
      }
    }
    const deads = all().filter(dead), od = deadOpen(st, opener(deads));   // T28 P2: a fresh bank opens with 1-2 dead-easy
    if (od) return { e: { c: od, r: 0, redeem: false } };
    const live = new Set(pool());
    let code = null, redeem = false;
    if (st.then && live.has(st.then) && st.then !== cur) { code = st.then; redeem = !!(st.seen[code] && st.seen[code].owe); }
    else {
      const p = noob() ? ramp(st, [...live], tierOf) : qPick(st, [...live], topicOf);
      if (!p) return null;
      code = p.code; redeem = p.redeem;
    }
    const sn = all().find(c => snack(c) && beforeOf(c) === code && !st.seen[c]);   // a snack goes once, before its real's first showing
    if (sn && !(st.seen[code] && st.seen[code].n) && !(window.stemSkipSnack && window.stemSkipSnack())) {
      st.then = code;                                                 // T28 P1: at random a dead-easy first (not twice in a row: cur is then the dead-easy), the snack next
      return { e: { c: (!dead(cur) && deadLead(st, deads, sn)) || sn, r: 0, redeem: false } };
    }
    const again = !!(st.seen[code] && st.seen[code].n);           // any re-showing is a fresh round: never a closed card (rewards never pay twice)
    return { e: { c: code, r: again && code !== cur ? Math.floor(Date.now() / 1000) : 0, redeem } };
  }
  /* the first question of a bank or an upload (app.js openBank, offline.js first()): the queue's pick, but a fresh queue (nothing
     shown or saved yet) starts where the author starts, the first real question of the file */
  window.stemOrder = list => {
    const live = list.filter(c => !snack(c) && !dead(c) && !(window.stemHidden && window.stemHidden(c)));
    const st = Q(), fresh = st.pos === 0 && !Object.keys(st.seen).length;
    const od = deadOpen(st, opener(list.filter(c => dead(c) && !(window.stemHidden && window.stemHidden(c)))));   // T28 P2: a fresh queue starts on a dead-easy
    const p = od ? { code: od } : !live.length ? null : noob() ? ramp(st, live, tierOf) : fresh ? { code: live[0] } : qPick(st, live, topicOf);
    return p ? [p.code, ...list.filter(c => c !== p.code)] : list;
  };
  /* the list (a jump index, not the queue): file order, Q1, Q2, ... as the bank JSON lists them (a second upload joins after the
     first; Tony, Oct 20); snacks right above their real. Next still plays the hidden queue. */
  function rows0(cs) {
    return glue(cs, beforeOf);
  }

  /* families met (todo 103 MUST 1, shuffle.mjs familiesMet): the HUD popover's count; a bank without families hands in of 0 = no row */
  const fams = () => { const o = off(), R = window.Rewards; if (R && R.families) R.families(o ? familiesMet(pool().map(c => ({ code: c, ...o.get(c) })), Q().seen) : null); };
  function update(code) {
    cur = code;
    fams();
    const o = off(), cs = all();
    codes = cs.length ? rows0(cs) : [];
    const on = codes.length > 0;
    const file = !bank() && on && o.fileName ? o.fileName(cur) || o.fileName(codes[0]) || "" : "";
    name.textContent = bank() ? (front() ? bank().front : bank().code) : "Questions";   // which bank you are in, at a glance (Tony, Oct 5; design/COPY-CTA.md); the front bank: its title only (Tony #4)
    modes.hidden = !front();                                         // Shuffle / Skip this question / Explore other banks: the front bank's list only
    if (front()) { $("#qmixTx").textContent = Q().mix ? "Start with easy ones" : "Shuffle"; $("#qmixIco").hidden = !!Q().mix; skip.hidden = !!Q().mix; }   // the label in its span, so the shuffle icon stays (shown with "Shuffle" only)
    mockBtn.hidden = !!(Q().mock && Q().mock.miss === null && !Q().mock.done);   // the mock is running: no restart
    btn.setAttribute("aria-label", "Question list");
    btn.title = bank() ? bank().code : file;                                // which bank or file: on hover, for Tony
    nav.hidden = !on;
    root.classList.toggle("qnav-on", on);
    if (!on) { close(false); return; }
    const st = Q(), focused = document.activeElement;
    const here = codes.includes(cur);                                // a server code typed after an upload: arrows off
    prev.disabled = !here || hop(st, -1) < 0;
    next.disabled = (!here && !bank()) || !pool().length;            // Next always works: the queue never runs dry, even from a code that is not in the bank (a direct link); after an upload a server code still turns the arrows off
    if (focused === prev || focused === next) {                      // never leave focus on a disabled arrow
      if (focused.disabled) (focused === prev ? next : prev).disabled ? btn.focus() : (focused === prev ? next : prev).focus();
    }
    /* one row = its number + one label, the whole title (owner, Oct 6) */
    list.innerHTML = codes.map((c, k) => {
      const t = titleOf(o.get(c)) || c, m = marks(mark(c));
      return `<li><a href="#${esc(c)}" title="${esc(t)}" aria-label="${k + 1}. ${esc(t)}.${m.say}"${m.gone ? ' class="gone"' : ""}${c === cur ? ' aria-current="true"' : ""}>` +
        `<span class="qn" aria-hidden="true">${k + 1}</span><span class="qt" aria-hidden="true">${esc(t)}</span>${m.html}</a></li>`;
    }).join("");
  }

  /* done marks (design/DONE.md, variant A): one X per wrong try, a tick for correct, at the row's right edge.
     Crossed out + greyed only when it can't be answered any more (correct, or out of tries); still a link. */
  const ico = (id, cls) => `<svg class="ico ${cls}" aria-hidden="true"><use href="#${id}"/></svg>`;
  function marks(rec) {
    if (rec && rec.again) return { html: `<span class="mk mk-again" aria-hidden="true">${ico("i-back", "mk-back")}${ico("i-x", "mk-x").repeat(rec.x || 0)}</span>`, gone: false, say: " Welcome back!" };
    if (!rec || (!rec.x && rec.done === "open")) return { html: "", gone: false, say: "" };
    const html = `<span class="mk" aria-hidden="true">${ico("i-x", "mk-x").repeat(rec.x || 0)}${rec.done === "correct" ? ico("i-ok", "mk-ok") : ""}</span>`;
    const say = rec.done === "correct" ? " Correct." : rec.done === "out" ? " No tries left." : " 1 wrong, 1 try left.";
    return { html, gone: rec.done !== "open", say };
  }

  const rows = () => [...list.querySelectorAll("a")];
  function open() {
    if (!panel.hidden) return;
    panel.hidden = false;
    btn.setAttribute("aria-expanded", "true");
    showList(true);
    const a = list.querySelector("[aria-current]") || rows()[0];
    if (!a) return;
    panel.scrollTop = Math.max(0, a.offsetTop - (panel.clientHeight - a.offsetHeight) / 2);
    a.focus({ preventScroll: true });
  }
  function close(back) {
    if (panel.hidden) return;
    panel.hidden = true;
    btn.setAttribute("aria-expanded", "false");
    showList(false);
    if (back) btn.focus();
  }
  /* the code box comes with the list (Tony, Oct 5 clutter pass C2 / C15): html.ql-open shows it (nav.css, app.css);
     app.js puts the phone's code bar up while it is open (drill:qlist) */
  function showList(on) {
    document.documentElement.classList.toggle("ql-open", on); dispatchEvent(new CustomEvent("drill:qlist", { detail: { open: on } }));
    if (on) fit();
  }
  /* phones (bar on top, code bar at the bottom): the list starts right under the nav row, over the XP strip, and runs down to the
     code bar's top edge (its pull-tab right under the list, no dead band), inside what the VISUAL viewport shows: the keyboard can
     come up for the code box and the list stays, shorter, scrolling inside itself. Desktop keeps nav.css (a dropdown under the bar). */
  const vv = window.visualViewport, dock = $(".dock");
  function fit() {
    if (panel.hidden) return;
    if (!root.classList.contains("dock-bottom") || root.classList.contains("start")) { panel.style.top = panel.style.maxHeight = ""; return; }
    const gap = 8, bar = panel.offsetParent ? panel.offsetParent.getBoundingClientRect().top : 0;
    const top = Math.max(nav.getBoundingClientRect().bottom, vv ? vv.offsetTop : 0) + gap;
    let bottom = vv ? vv.offsetTop + vv.height : innerHeight;
    if (dock && dock.getClientRects().length) bottom = Math.min(bottom, dock.getBoundingClientRect().top);
    bottom -= 44;                                                     // the privacy link's 44px under the list, off the code bar (its pull-tab is part of .dock)
    panel.style.top = Math.round(top - bar) + "px";
    panel.style.maxHeight = Math.max(96, Math.floor(bottom - top)) + "px";
    root.style.setProperty("--ql-bottom", Math.round(panel.getBoundingClientRect().bottom) + "px");   // the privacy link sits under the list (index.html, G3)
  }
  const refit = () => requestAnimationFrame(fit);                   // after app.js has moved the code bar onto the keyboard (layoutDock, --kb-bottom)
  if (vv) for (const ev of ["resize", "scroll"]) vv.addEventListener(ev, refit);
  addEventListener("resize", refit);
  function say(t) { const sr = $("#sr"); if (!sr) return; sr.textContent = ""; setTimeout(() => { sr.textContent = t; }, 30); }
  /* a press that cannot move says why (app.js drill:note: a toast under Next); never a silent return (T16) */
  const note = text => { dispatchEvent(new CustomEvent("drill:note", { detail: { text } })); say(text); };
  function go(d) {
    const st = Q();
    let e = null;
    if (d < 0) { const b = hop(st, -1); if (b < 0) { note("Say hi to your first question, again."); return; } st.at = b; e = st.hist[b]; save(); }
    else {
      const n = upNext(); if (!n) { note("No more questions, no more eggs."); return; }
      e = n.e;
      if (n.step != null) { st.at = n.step; save(); } else pending = e;
    }
    close(false);
    use(e);
    if (e.c === cur) {                                               // already on screen: a one-question list, the same code, a new showing
      if (d > 0 && pending) shown(e.c, true);
      update(cur); note("This is the only question here.");
      return;
    }
    if (location.hash === "#" + e.c) dispatchEvent(new HashChangeEvent("hashchange"));   // the hash is already there (that load failed or never ran): no event would come, so ask again
    else location.hash = e.c;                                        // app.js: hashchange -> load(c)
    say(titleOf(off().get(e.c)) || e.c);
  }

  btn.addEventListener("click", () => { if (panel.hidden) open(); else close(false); });
  document.getElementById("entry")?.addEventListener("submit", () => close(false));   // a code typed in the list's box: you picked, the list goes
  btn.addEventListener("keydown", e => { if (e.key === "ArrowDown") { e.preventDefault(); open(); } });
  prev.addEventListener("click", () => go(-1));
  mix.addEventListener("click", () => { const st = Q(); st.mix = !st.mix; save(); update(cur); });   // the student switches the order (Tony #3)
  skip.addEventListener("click", () => { skipAhead(Q()); save(); go(1); });                           // strong starters: a tier up, and on
  $("#qbanks").addEventListener("click", () => $("#code").focus());   // the code box comes with the list: type a bank code there
  next.addEventListener("click", () => go(1));
  /* the night-before mock (W103b): the front bank's exam-order list (shuffle.mjs mockList), from its first question */
  let reload = null;                                                 // one same-code reload asked of app.js (stemMock.again)
  function startMock() {
    const st = Q(), o = off();
    st.mock = mockNew(mockList(pool().map(c => ({ code: c, ...o.get(c) })), st.salt));
    st.hist = st.hist.slice(0, st.at + 1); save();                   // Next plays the mock, not the history ahead
    if (st.mock.list[0] && st.mock.list[0] === cur) {                // already on X3 Q1: a fresh showing of it in place (go(1) would say "only question")
      const n = upNext(); use(n.e); pending = n.e; shown(cur, true);
      reload = cur; dispatchEvent(new HashChangeEvent("hashchange")); return;   // app.js fromHash reloads it (stemMock.again) in its fresh round
    }
    go(1);
  }
  mockBtn.addEventListener("click", startMock);
  list.addEventListener("click", e => { if (e.target.closest("a")) close(true); });   // the link itself navigates (#CODE)
  panel.addEventListener("keydown", e => {
    const r = rows(), i = r.indexOf(document.activeElement);
    const to = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: r.length - 1 }[e.key];
    if (e.key === "Escape") { e.preventDefault(); close(true); }
    else if (to !== undefined && r.length) { e.preventDefault(); r[Math.max(0, Math.min(r.length - 1, to))].focus(); }
  });
  /* an outside tap closes it: the list floats over the page (Tony, Oct 6), so closing moves nothing under the pointer.
     Taps on its own bar row (the button, the code box) keep it open. Also: the button, Escape, a pick, Prev/Next. */
  document.addEventListener("pointerdown", e => {
    if (panel.hidden || e.target.closest("#qlist, #qlistBtn, #entry, .code-sug, #privacy")) return;   // #privacy: phones show it with the list (index.html, G3)
    close(false);
  });
  /* re-rank after every answer (D62): only the FIRST graded pick of a showing moves the queue; a retry is logged (shuffle.mjs) */
  addEventListener("drill:answer", e => {
    const d = e.detail || {};
    if (!d.code || d.code !== cur || !off()) return;
    const st = Q(), first = qAnswer(st, d.code, !!d.right, { spam: typeof d.ms === "number" && d.ms < SPAM_MS });   // a guess in under 2 s: logged, no weight
    mockAnswer(st.mock, d.code, !!d.right);
    if (first && noob()) rampAnswer(st, d.code, !!d.right, tierOf);   // the ramp's gate counts first picks only
    if (first) fams();
    if (front()) try { localStorage.setItem("stem-noob-" + bank().code, "1"); } catch { /* blocked */ }
    save();
  });
  addEventListener("drill:problem", e => { const c = e.detail && e.detail.code; if (c && all().includes(c)) shown(c); update(c);
    if (wantMock && front()) { wantMock = false; setTimeout(startMock); } });   // ?mock=1: once the first question has opened, so app.js's first load never overwrites the mock's hash
  addEventListener("drill:marks", () => { if (!nav.hidden) update(cur); });   // offline.js: a mark changed (the list ticks)
  addEventListener("drill:bank", () => update(cur));                         // a bank opened or left (app.js)
  const s = window.__drill && window.__drill.state;                   // a problem loaded before this module ran
  if (s) { if (all().includes(s.code)) shown(s.code); update(s.code); }
  window.stemMock = { on: () => !!cur && mockOn(Q().mock, cur), state: () => Q().mock || null, again: c => { const y = reload === c; reload = null; return y; } };   // app.js / peek.js / repair.js: the mock phase holds the hints
  window.stemQueue = { item: () => { const st = Q(); return st.hist[st.at] || null; }, state: () => Q(), mode: () => noob() ? "noob" : "mix" };   // tests + the Redeem chip later
}
