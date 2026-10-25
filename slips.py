"""Slips from the formula (SCHEMA.md `form`, design/HANDOFF-slips-v2.md): the 10 slip families a student makes on one plain-number
expression, as values. Shared by serve.py (runtime matching), tools/slips.py (report + --strict gate) and app.js's port (golden fixture
tests/fixtures/slips-golden.json). `form` is authored text only, never student input. Parsed unfolded so terms survive.

mutants(form, k=1) -> [(family, value)]   families in FAMILIES order, values ascending within a family, one entry per distinct value;
                                     k=2 appends the "inner+outer" pairs (one inner slip + one whole-answer slip, Tony D1/D3) after them
match(form, value, k=SLIP_K) -> family | None   within SLIP_WIN (never the item's grading tol); k=2 undoes the outer slip on the typed value
gate(u) -> [row]                      rule 7 (v >= CUTOFF): no form, SAME, two families on one value (ignore_slips exempts)
sites(form) / cands(form, typed, skip) / region(cands, form) -> str | None   W-SPOT: on a collision, WHERE the slip is (structural words,
                                     never a digit), FINISH for whole-answer slips; None when the place is the whole form (plain nudge)
pair_cands(form, typed, fam)          W-SPOT for a k=2 match: the inner slip's place + ROOT (region() -> "dual")"""
import ast
import math
import os
import threading
from decimal import Context, Decimal, ROUND_HALF_UP
from functools import lru_cache

from sympy import Abs, Add, Float, Integer, Mul, Pow, Rational, S, acos, asin, atan, cos, exp, log, pi, sin, sqrt, tan, parse_expr
from sympy.parsing.sympy_parser import implicit_multiplication, standard_transformations

# Adding a family, a variant, stacking or a wider close() raises false matches: ask Tony first (SCHEMA.md "Slip scaling risk")
FAMILIES = ("distribute", "sign", "drop", "reciprocal", "power", "factor", "dream", "trig", "units", "g")   # hint priority; distribute first (Tony, Oct 22): on a tie with sign it names the real habit
CUTOFF = 20261022     # banks with v >= CUTOFF pass gate()
PAIRED = {"sign", "distribute"}   # gate(): these two alone on one value are not a CLASH (distribute is a sign flip by definition)
EPS = 1e-9            # two mutant values within this, relative to the value, are one value (_same)
ZERO = 1e-9           # a zero key's window, absolute (tolerance 1b: calculator dust passes, 0.0003 fails). app.js / slips.mjs ZERO
SLIP_WIN = 0.005      # a typed value sits on a slip within 0.5% of it (or equal at 3 s.f.). Tony D2, Oct 23: its own window, never the
                      # grading tol (2% there raised k=2 false matches 6.4% -> 10.3%). slips.mjs SLIP_WIN
EXACT = 1e-4          # a definitive key's tol (tools/tol.py wiggle test). An integer key at EXACT gets no 3 s.f. pass (Tony, Oct 23: 1023 for 1024)
TOL_NUM = 0.02        # a num item's tol when it has none: WebAssign's default, 2% relative (serve.py tol_of, app.js tolOf)


_BIN = {ast.Add: Add, ast.Sub: Add, ast.Mult: Mul, ast.Div: Mul}
_FN = {"sin": sin, "cos": cos, "tan": tan, "asin": asin, "acos": acos, "atan": atan, "sqrt": sqrt, "exp": exp, "log": log, "ln": log,
       "abs": Abs}                                   # = slips.mjs FN + sqrt; any other name raises (never a free Symbol)


def parse(src):
    """`form` -> the unfolded sympy tree (D4: stdlib ast + this walker, no parse_expr). Same shape parse_expr(..., evaluate=False) gave:
    binary + - * / flattened across brackets (a - b = a + (-1)*b, a / b = a * b^-1; a - k*(..) stays Add(a, Mul(-1, Mul(k, ..)))), a literal
    with no '.' or 'e' is an Integer, else a Float (its text, like sympy's auto_number). One change (S3, review-227): a unary minus on a
    bracket is Mul(-1, x), never folded, so -(3+4) keeps its terms; -3 is still Integer(-3). slips.mjs toTree is the twin."""
    text = str(src).replace("^", "**").replace("π", "pi")
    tree = ast.parse(text.strip(), mode="eval")
    return _walk(tree.body, text.strip())[0]


def _walk(n, text):
    """(sympy node, the binary op class that made it or None): only a binary + / * result is flattened into its parent."""
    if isinstance(n, ast.BinOp) and type(n.op) in _BIN:
        cls = _BIN[type(n.op)]
        (a, ta), (b, tb) = _walk(n.left, text), _walk(n.right, text)
        if isinstance(n.op, ast.Sub):
            b, tb = Mul(S.NegativeOne, b, evaluate=False), None
        elif isinstance(n.op, ast.Div):
            b, tb = Pow(b, S.NegativeOne, evaluate=False), None
        args = [x for y, t in ((a, ta), (b, tb)) for x in (y.args if t is cls else (y,))]
        return cls(*args, evaluate=False), cls
    if isinstance(n, ast.BinOp) and isinstance(n.op, ast.Pow):
        return Pow(_walk(n.left, text)[0], _walk(n.right, text)[0], evaluate=False), None
    if isinstance(n, ast.UnaryOp) and isinstance(n.op, (ast.USub, ast.UAdd)):
        x, t = _walk(n.operand, text)
        if isinstance(n.op, ast.UAdd):
            return x, t
        return (-x if isinstance(x, (Integer, Float)) else Mul(S.NegativeOne, x, evaluate=False)), None
    if isinstance(n, ast.Constant) and type(n.value) in (int, float):
        raw = ast.get_source_segment(text, n)
        return (Integer(raw) if raw.isdigit() else Float(raw)), None
    if isinstance(n, ast.Name) and n.id == "pi":
        return pi, None
    if isinstance(n, ast.Call) and isinstance(n.func, ast.Name) and n.func.id in _FN and len(n.args) == 1 and not n.keywords:
        return _FN[n.func.id](_walk(n.args[0], text)[0], evaluate=False), None
    raise ValueError(f"slips: cannot read {ast.dump(n)[:60]}")


_GRADER = standard_transformations + (implicit_multiplication,)


def value(src):
    """float of an authored `answer` / `ignore_slips` value, read as the grader reads it (serve.py evaluate): implicit * and `deg`
    (sin(30 deg)). parse() is for `form` only (the JS port's syntax)."""
    e = parse_expr(str(src).replace("^", "**"), local_dict={"deg": pi / 180}, transformations=_GRADER)
    return float(e.doit())


_R3 = Context(prec=3, rounding=ROUND_HALF_UP)


def _r3(v):
    """v to 3 s.f., exact ties away from zero: the same rule as toExponential/toPrecision in slips.mjs. (f"{v:.3g}" rounds a tie to even:
    1.125 -> 1.12 here but 1.13 in the browser.) Decimal(float) is the exact binary value, so only a true tie differs."""
    return _R3.create_decimal(Decimal(v)) if v == v and abs(v) != float("inf") else v


def close(a, b, tol=SLIP_WIN):
    """relative to b (tolerance 1b); a zero b gets the absolute ZERO window. Or equal to 3 s.f. Slip matching uses the default."""
    return abs(a - b) <= (tol * abs(b) if b else ZERO) or _r3(a) == _r3(b)


SLOW_S = 1.0          # a form whose mutants take longer than this is rejected (gate) / gives no slip (serve)
BIG_EXP = 1e4         # a Pow exponent beyond this (10**10**10) is never a classroom form; sympy would grind on it


def slow(form, limit=SLOW_S):
    """True when `form` can't be mutated in `limit` s: an absurd exponent (checked first, nothing is computed), else mutants() run in a
    daemon thread and given `limit`. No SIGALRM (serve.py runs in threads). A timed-out thread can't be killed; the size pre-check is what
    keeps it from being left running for the usual 10**10**10. A result that finishes in time is cached by raw(), so the caller's own call is free."""
    try:
        for _, n, _ in _nodes(parse(form)):
            if isinstance(n, Pow) and abs(float(n.exp.evalf())) > BIG_EXP:
                return True
    except Exception:  # noqa: BLE001  unreadable: not slow, the caller's own handling reports it
        return False
    t = threading.Thread(target=lambda: _quiet(mutants, form), daemon=True)
    t.start()
    t.join(limit)
    return t.is_alive()


def _quiet(fn, *a):
    try:
        fn(*a)
    except Exception:  # noqa: BLE001
        pass


def _nodes(e, path=(), parent=None):
    """(path, node, parent) preorder; path = arg indexes from the root."""
    yield path, e, parent
    for i, a in enumerate(e.args):
        yield from _nodes(a, path + (i,), e)


def _put(e, path, new):
    if not path:
        return new
    args = list(e.args)
    args[path[0]] = _put(args[path[0]], path[1:], new)
    return e.func(*args, evaluate=False)


def _neg(t):
    return Mul(S.NegativeOne, t, evaluate=False)


def _flat_mul(m):
    """a Mul's factors with nested Muls opened, in written order"""
    return [f for a in m.args for f in (_flat_mul(a) if isinstance(a, Mul) else [a])]


def _exp(p, *vals):
    return isinstance(p, Pow) and p.exp.is_number and any(abs(float(p.exp) - v) < EPS for v in vals)


def _family(fam, e):
    """(mutant expression, outer, path) of one family; whole = the answer. outer: a whole-answer slip (OUTER: sign / reciprocal / power /
    factor / units wrapped round the answer); every other mutant is inner (a site in the tree, or g). path: the node the slip changed (arg
    indexes from the root; drop = the dropped term, g = the LCA of its 9.8s); ROOT for an outer slip (spot(): no place in the form)."""
    nodes = list(_nodes(e))
    if fam == "sign":
        yield _neg(e), True, ROOT
        for path, n, _ in nodes:
            if isinstance(n, Add):
                for i, t in enumerate(n.args):
                    yield _put(e, path + (i,), _neg(t)), False, path + (i,)
    elif fam == "drop":
        for path, n, _ in nodes:
            if isinstance(n, Add):
                for i in range(len(n.args)):
                    rest = n.args[:i] + n.args[i + 1:]
                    yield _put(e, path, rest[0] if len(rest) == 1 else Add(*rest, evaluate=False)), False, path + (i,)
    elif fam == "reciprocal":                                       # a/b -> b/a; a bare x^-1 -> x; 1/whole
        yield Pow(e, -1, evaluate=False), True, ROOT
        for path, n, up in nodes:
            if isinstance(n, Mul) and any(_exp(a, -1) for a in n.args):
                yield _put(e, path, Pow(n, -1, evaluate=False)), False, path
            elif _exp(n, -1) and not isinstance(up, Mul):
                yield _put(e, path, n.base), False, path
    elif fam == "power":                                            # drop a square / root per Pow node; whole^2, sqrt(whole)
        for path, n, _ in nodes:
            if _exp(n, 2, 0.5, -2, -0.5):
                yield _put(e, path, Pow(n.base, -1, evaluate=False) if float(n.exp) < 0 else n.base), False, path
        yield Pow(e, 2, evaluate=False), True, ROOT
        yield Pow(e, S.Half, evaluate=False), True, ROOT
    elif fam == "factor":
        yield Mul(2, e, evaluate=False), True, ROOT
        yield Mul(S.Half, e, evaluate=False), True, ROOT
    elif fam == "distribute":                                       # -(b+c) -> -b+c: the minus reaches the first term only (Tony, Oct 23)
        for path, n, up in nodes:                                   # a Mul chain read whole from its top: a-k(b+c) is Mul(-1, Mul(k, b+c)) (S1)
            if not isinstance(n, Mul) or isinstance(up, Mul):
                continue
            flat = _flat_mul(n)
            coef = [a for a in flat if isinstance(a, Rational)]     # exact numbers only: -2.0*(..) is a Float, no distribute (N1)
            k = next((i for i, a in enumerate(flat) if isinstance(a, Add)), None)
            c = Mul(*coef)                                          # the sign of the numeric coefficient
            if k is None or not c < 0:
                continue
            first = next(i for i, a in enumerate(flat) if isinstance(a, Rational))
            rest = [(-c if i == first else a) for i, a in enumerate(flat) if i != k and (i == first or not isinstance(a, Rational))]
            rest = [a for a in rest if not (isinstance(a, Rational) and a == 1)]
            t = flat[k].args                                        # written order (evaluate=False keeps it)
            s = Add(_neg(t[0]), *t[1:], evaluate=False)
            yield _put(e, path, Mul(*rest, s, evaluate=False) if rest else s), False, path
    elif fam == "dream":                                            # (a+b)^2 -> a^2+b^2; sqrt(a+b) -> sqrt(a)+sqrt(b)
        for path, n, _ in nodes:
            if _exp(n, 2, 0.5) and isinstance(n.base, Add):
                yield _put(e, path, Add(*(Pow(t, n.exp, evaluate=False) for t in n.base.args), evaluate=False)), False, path
    elif fam == "trig":                                             # sin <-> cos; the argument read as degrees vs radians
        for path, n, _ in nodes:
            if isinstance(n, (sin, cos, tan)):
                x = n.args[0]
                if isinstance(n, (sin, cos)):
                    yield _put(e, path, (cos if isinstance(n, sin) else sin)(x, evaluate=False)), False, path
                yield _put(e, path, n.func(Mul(x, pi, Pow(180, -1, evaluate=False), evaluate=False), evaluate=False)), False, path
                yield _put(e, path, n.func(Mul(x, 180, Pow(pi, -1, evaluate=False), evaluate=False), evaluate=False)), False, path
    elif fam == "units":
        for k in (2, -2, 3, -3):
            yield Mul(Pow(10, k, evaluate=False), e, evaluate=False), True, ROOT
    elif fam == "g":                                                # every 9.8 / 9.81 -> 10 (10 -> 9.8 is never sure: skipped)
        gs = [p for p, n, _ in nodes if isinstance(n, Float) and any(abs(float(n) - v) < EPS for v in (9.8, 9.81))]
        m = e
        for p in gs:
            m = _put(m, p, Integer(10))
        if gs:
            yield m, False, _lca(gs)


def _value(m):
    try:
        v = float(m.doit())
    except (TypeError, ValueError, ZeroDivisionError, OverflowError, AttributeError):
        return None
    return v if v == v and abs(v) != float("inf") else None


def _same(a, b):
    """one value: relative to b (a tiny-constant form's slips ~1e-11 stay apart; EPS * max(1, |b|) merged them all). Exact zero: only 0."""
    return abs(a - b) <= EPS * abs(b) if b else a == 0


@lru_cache(maxsize=512)
def _raw2(form):
    """(raw, inner, sites): raw as raw() gives it; inner = the same per family over inner mutants only (outer=False in _family); sites =
    raw with each value's paths (sites()), one pass."""
    e = parse(form)
    out, inn, sit = [], [], []
    for fam in FAMILIES:
        vals, ivals, paths = [], [], []
        for m, outer, path in _family(fam, e):
            v = _value(m)
            if v is None:
                continue
            j = next((j for j, w in enumerate(vals) if _same(v, w)), None)
            if j is None:
                vals.append(v)
                paths.append({path})
            else:
                paths[j].add(path)
            if not outer and not any(_same(v, w) for w in ivals):
                ivals.append(v)
        order = sorted(range(len(vals)), key=lambda j: vals[j])
        out.append((fam, tuple(vals[j] for j in order)))
        inn.append((fam, tuple(sorted(ivals))))
        sit.append((fam, tuple((vals[j], tuple(sorted(paths[j]))) for j in order)))
    return tuple(out), tuple(inn), tuple(sit)


def raw(form):
    """((family, (values ascending, distinct within the family)), ...) before families are merged: the clash gate needs it."""
    return _raw2(form)[0]


def inner(form):
    """raw() over inner slips only (no whole-answer wrapper): the k=2 bag. slips.mjs inner"""
    return _raw2(str(form))[1]


def sites(form):
    """raw() with paths: ((family, ((value, (path, ...)), ...)), ...), same families and values in the same order; each value's paths =
    every node a slip of that family changed to give it (ROOT = a whole-answer slip). spot() reads it; slips.mjs sites"""
    return _raw2(str(form))[2]


# k=2 (Tony D1/D3, Oct 23): one inner slip + one whole-answer (outer) slip, never two of either; k=3 is not runtime. SLIP_K=1 (default)
# = today exactly. A k=2 entry's family is "inner+outer" (e.g. "drop+sign"). OUTER: (family, forward on the inner value, undo on the typed
# value -> candidate inner values), in FAMILIES order, the order _family yields them. Float math on both sides (slips.mjs OUTER).
OUTER = (("sign", lambda v: -v, lambda y: [-y]),
         ("reciprocal", lambda v: 1 / v if v else None, lambda y: [1 / y] if y else []),
         ("power", lambda v: v * v, lambda y: [-math.sqrt(y), math.sqrt(y)] if y >= 0 else []),
         ("power", lambda v: math.sqrt(v) if v >= 0 else None, lambda y: [y * y] if y >= 0 else []),
         ("factor", lambda v: 2 * v, lambda y: [y / 2]),
         ("factor", lambda v: v / 2, lambda y: [2 * y]),
         ("units", lambda v: v * 100, lambda y: [y / 100]),
         ("units", lambda v: v / 100, lambda y: [y * 100]),
         ("units", lambda v: v * 1000, lambda y: [y / 1000]),
         ("units", lambda v: v / 1000, lambda y: [y * 1000]))
OUTER_FAMS = tuple(dict.fromkeys(f for f, _, _ in OUTER))
SLIP_K = int(os.environ.get("SLIP_K", "1"))
if SLIP_K not in (1, 2):
    raise ValueError(f"SLIP_K={SLIP_K}: only 1 or 2 (k=3 is not runtime, Tony D1)")


def _fin(v):
    return v is not None and v == v and abs(v) != float("inf")


@lru_cache(maxsize=512)
def pairs(form):
    """(("inner+outer", (values ascending, distinct within the pair)), ...): inner family in FAMILIES order, then outer in OUTER_FAMS
    order. Before merging (mutants(form, 2) merges them after the k=1 entries)."""
    out = []
    for fi, ivals in inner(form):
        for fo in OUTER_FAMS:
            vals = []
            for f, fwd, _ in OUTER:
                if f != fo:
                    continue
                for v in ivals:
                    w = fwd(v)
                    if _fin(w) and not any(_same(w, x) for x in vals):
                        vals.append(w)
            if vals:
                out.append((f"{fi}+{fo}", tuple(sorted(vals))))
    return tuple(out)


def mutants(form, k=1):
    """[(family, value)]: one entry per distinct value, the earliest family wins. k=2 appends the inner+outer entries after every k=1 one
    (fewer slips first). k=1 is the static default (gate, fixtures); match() reads SLIP_K."""
    out = []
    for fam, vals in raw(str(form)) + (pairs(str(form)) if k == 2 else ()):
        out += [(fam, v) for v in vals if not any(_same(v, w) for _, w in out)]
    return out


def match(form, value, win=SLIP_WIN, k=None, skip=()):
    """The first family whose slip is close() to the typed value, else None. skip: values never hinted (slips.mjs match). k (default
    SLIP_K) = 2: no k=1 hit -> each outer slip is undone on the typed value and the result looked up in that inner family's bag (D3), pairs
    in mutants(form, 2) order; a pair whose forward value is a k=1 slip or an earlier pair's is that entry's, not this one's."""
    k = SLIP_K if k is None else k
    free = lambda v: not any(close(v, x, win) for x in skip)
    one = mutants(form)
    hit = next((fam for fam, v in one if close(value, v, win) and free(v)), None)
    if hit or k != 2 or not _fin(value):
        return hit
    seen = [v for _, v in one]
    for fi, ivals in inner(str(form)):
        for fo in OUTER_FAMS:
            fresh = []
            for f, fwd, undo in OUTER:
                if f != fo:
                    continue
                us = undo(value)
                for v in ivals:
                    w = fwd(v)
                    if not _fin(w) or any(_same(w, x) for x in seen):
                        continue
                    fresh.append(w)
                    if free(w) and any(close(u, v, win) for u in us):
                        return f"{fi}+{fo}"
            seen += fresh
    return None


# ---- spot (W-SPOT): on a collision, WHERE the slip is, never WHAT it is, never a number (design/HANDOFF-slips-v2.md rule 3) ----------
ROOT = ()             # the root's path: a whole-answer (outer) slip has no place in the form; a slip at the root is whole too
# ALL the spot copy, one table (Tony vets it; slips.mjs SPOT_COPY is equal, pinned by tests/fixtures/slips-golden-spots.json).
# Structural words + written-order ordinals only: never a digit, never a literal of the form (the form may hold numbers the student never saw).
SPOT_COPY = {
    "region": "QUACK. Your pieces are fine but one. Redo {place}.",
    "finish": "QUACK. The pieces look right. Check your last step{what}.",
    "finish_what": ": {words}",
    "or": " or ",
    "dual": "QUACK. Redo {place}, then check your last step.",
    "word": {"sign": "your sign", "units": "your units", "factor": "a factor of two", "power": "a square or square root",
             "reciprocal": "flipping it upside down"},
    "term": "the {nth} term",
    "term_br": "the term in brackets",
    "factor": "the {nth} factor",
    "factor_br": "what is in the brackets",
    "top": "the top of the fraction",
    "bottom": "the bottom of the fraction",
    "squared": "what is being squared",
    "root": "what is under the square root",
    "base": "the base of the power",
    "exponent": "the power",
    "fn": "what is inside {fn}",
    "fn_name": {"sin": "the sine", "cos": "the cosine", "tan": "the tangent", "asin": "the inverse sine", "acos": "the inverse cosine",
                "atan": "the inverse tangent", "exp": "the exponential", "log": "the log", "ln": "the log", "abs": "the absolute value"},
    "in": "{place} in {ctx}",
    "in_short": {"what is in the brackets": "the brackets", "what is under the square root": "the square root",
                 "what is being squared": "the square"},
    "nth": ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"],
    "nth_many": "one",
}


def _lca(paths):
    paths = [tuple(p) for p in paths]
    pre = paths[0]
    for p in paths[1:]:
        n = 0
        while n < min(len(pre), len(p)) and pre[n] == p[n]:
            n += 1
        pre = pre[:n]
    return pre


def _at(e, path):
    for i in path:
        e = e.args[i]
    return e


def _lit(n):
    return not n.args                                  # a number or pi: a bare literal names nothing (it lifts to its parent)


def _has_br(n):
    """n is (or multiplies) a bracketed sum"""
    return isinstance(n, Add) or (isinstance(n, Mul) and any(_has_br(a) for a in n.args if isinstance(a, (Add, Mul))))


def _fn_key(n):
    return "abs" if isinstance(n, Abs) else type(n).__name__


def _nth(i, kind):
    c = SPOT_COPY
    return c[kind].format(nth=c["nth"][i] if i < len(c["nth"]) else c["nth_many"])


def _lift(e, path):
    """a bare literal -> its parent; the x of a subtraction's (-1)*x -> the whole subtracted term"""
    while path:
        n, up = _at(e, path), _at(e, path[:-1])
        if _lit(n) or (isinstance(up, Mul) and len(up.args) == 2 and path[-1] == 1 and up.args[0] == -1):
            path = path[:-1]
            continue
        break
    return path


def place(e, path, ctx=True):
    """(lifted path, structural name) of the node at `path` of the parsed form; (ROOT, None) when it lifts to the root. slips.mjs place"""
    c = SPOT_COPY
    path = _lift(e, tuple(path))
    if not path:
        return ROOT, None
    n, up, i = _at(e, path), _at(e, path[:-1]), path[-1]
    nth = False
    if isinstance(up, Add):
        br = [j for j, a in enumerate(up.args) if _has_br(a)]
        name, nth = (c["term_br"], False) if br == [i] else (_nth(i, "term"), True)
    elif isinstance(up, Mul):
        if _exp(n, -1):
            name = c["bottom"]
        elif isinstance(n, Add) and sum(isinstance(a, Add) for a in up.args) == 1:
            name = c["factor_br"]
        elif any(_exp(a, -1) for a in up.args):
            name = c["top"]
        else:
            name, nth = _nth(i, "factor"), True
    elif isinstance(up, Pow):
        if i == 1:
            name = c["exponent"]
        elif _exp(up, -1):
            name = c["bottom"]
        elif _exp(up, 2, -2):
            name = c["squared"]
        elif _exp(up, 0.5, -0.5):
            name = c["root"]
        else:
            name = c["base"]
    else:
        fname = c["fn_name"].get(_fn_key(up), c["fn_name"]["log"])
        name = c["fn"].format(fn=fname) if ctx else fname
    if nth and ctx and len(path) > 1:
        _, around = place(e, path[:-1], ctx=False)
        if around:
            name = c["in"].format(place=name, ctx=c["in_short"].get(around, around))
    return path, name


def spot(e, cands):
    """(kind, lifted region path, line): kind "region" | "dual" | "finish" | None. cands: [(family, paths)] of the colliding families at
    one typed value; e: the parsed form. inner = every non-root path; whole = a candidate with ROOT among its paths; R = LCA(inner).
    R != root: region (no whole) or dual; no inner: FINISH from the first two whole families' words; R = root with inner: None."""
    c = SPOT_COPY
    inner = [tuple(p) for _, ps in cands for p in ps if tuple(p) != ROOT]
    whole = [f for f, ps in cands if any(tuple(p) == ROOT for p in ps)]
    if not inner:
        if not whole:
            return None, ROOT, None
        words = list(dict.fromkeys(c["word"][f.split("+")[-1]] for f in whole if f.split("+")[-1] in c["word"]))[:2]
        what = c["finish_what"].format(words=c["or"].join(words)) if words else ""
        return "finish", ROOT, c["finish"].format(what=what)
    r, name = place(e, _lca(inner))
    if name is None:
        return None, ROOT, None                        # LCA = root with inner slips: the caller keeps the plain nudge
    return ("dual", r, c["dual"].format(place=name)) if whole else ("region", r, c["region"].format(place=name))


def region(cands, form):
    """the spot line for one collision (str), or None (the plain nudge). cands: [(family, paths)], form: the unit's `form`. slips.mjs region"""
    return spot(parse(str(form)), cands)[2]


def cands(form, typed, skip=(), win=SLIP_WIN):
    """[(family, paths)]: every family with a slip close() to `typed` (and not close to a skip value), FAMILIES order, with the paths of
    those slips (union, sorted). 2+ entries = a collision. slips.mjs cands"""
    out = []
    for fam, vs in sites(str(form)):
        ps = sorted({p for v, pp in vs if close(typed, v, win) and not any(close(v, x, win) for x in skip) for p in pp})
        if ps:
            out.append((fam, tuple(ps)))
    return out


def pair_cands(form, typed, fam, win=SLIP_WIN):
    """[(fam, paths)] for a k=2 match `fam` ("inner+outer", match()): the places of the inner slip whose value an undone outer slip lands
    on, plus ROOT (the outer slip is whole-answer), so region() gives "dual" (or None at the root). slips.mjs pairCands"""
    fi, fo = fam.split("+")
    us = [u for f, _, undo in OUTER if f == fo for u in undo(typed)]
    ps = {p for v, pp in dict(sites(str(form)))[fi] if any(close(u, v, win) for u in us) for p in pp}
    return [(fam, tuple(sorted(ps | {ROOT})))]


def units(p):
    if p.get("type") == "multi":
        for i, q in enumerate(p.get("parts", [])):
            yield f"{p['code']}#{i}", q
    else:
        yield p["code"], p


def _ignored(u):
    return [value(s) for s in u.get("ignore_slips", [])]


def form_ok(u):
    """None when form equals answer (within tol or to 3 s.f.), else a report row."""
    if slow(u["form"]):
        return f"SLOW form takes over {SLOW_S:g} s to compute (exponent too big?)"
    tol, ans, got = u.get("tol", 1e-6), value(u["answer"]), float(parse(u["form"]).doit())
    return None if close(got, ans, tol) else f"form = {got:.4g} but answer = {ans:.4g}"


def gate(u):
    """Rule 7 rows for one num unit of a bank with v >= CUTOFF: no form; a slip equal to the answer (SAME); two families on one value.
    ignore_slips exempts a value from SAME and the clash rule. sign + distribute alone on one value is no clash: -(b+c) -> -b+c is a sign
    flip of c by definition, so every a-(b+c) would need ignore_slips (the earlier family, distribute, gets the hint)."""
    if u.get("type") != "num":
        return []
    if not u.get("form"):
        return ["NOFORM num without form"]
    bad = form_ok(u)
    if bad:
        return [bad]
    ans, skip = value(u["answer"]), _ignored(u)
    free = lambda v: not any(close(v, s) for s in skip)
    rows = [f"SAME {v:.4g}  ({fam}) can't be told apart by number" for fam, v in mutants(u["form"]) if close(v, ans) and free(v)]
    fams = [(fam, v) for fam, vals in raw(u["form"]) for v in vals]
    seen = []
    for i, (fa, a) in enumerate(fams):
        for fb, b in fams[i + 1:]:
            if fa != fb and {fa, fb} != PAIRED and close(a, b) and free(a) and free(b) and not close(a, ans) and not any(close(a, s) for s in seen):
                rows.append(f"CLASH {a:.4g}  ({fa} / {fb}) one value, two hints")
                seen.append(a)
    return rows


def missing(u):
    """[(family, value)] not caught by a `wrong` entry or ignore_slips and not equal to the answer (the v1 report)."""
    ans = value(u["answer"])
    caught = [float(parse(w["match"]).doit()) for w in u.get("wrong", []) if "match" in w] + _ignored(u)
    return [(fam, v) for fam, v in mutants(u["form"]) if not close(v, ans) and not any(close(v, c) for c in caught)]
