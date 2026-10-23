"""Slips from the formula (SCHEMA.md `form`, design/HANDOFF-slips-v2.md): the 10 slip families a student makes on one plain-number
expression, as values. Shared by serve.py (runtime matching), tools/slips.py (report + --strict gate) and app.js's port (golden fixture
tests/fixtures/slips-golden.json). `form` is authored text only, never student input. Parsed unfolded so terms survive.

mutants(form) -> [(family, value)]   families in FAMILIES order, values ascending within a family, one entry per distinct value
match(form, value) -> family | None       within SLIP_WIN (never the item's grading tol)
gate(u) -> [row]                      rule 7 (v >= CUTOFF): no form, SAME, two families on one value (ignore_slips exempts)"""
import ast
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
    """Mutant expressions of one family; whole = the answer."""
    nodes = list(_nodes(e))
    if fam == "sign":
        yield _neg(e)
        for path, n, _ in nodes:
            if isinstance(n, Add):
                for i, t in enumerate(n.args):
                    yield _put(e, path + (i,), _neg(t))
    elif fam == "drop":
        for path, n, _ in nodes:
            if isinstance(n, Add):
                for i in range(len(n.args)):
                    rest = n.args[:i] + n.args[i + 1:]
                    yield _put(e, path, rest[0] if len(rest) == 1 else Add(*rest, evaluate=False))
    elif fam == "reciprocal":                                       # a/b -> b/a; a bare x^-1 -> x; 1/whole
        yield Pow(e, -1, evaluate=False)
        for path, n, up in nodes:
            if isinstance(n, Mul) and any(_exp(a, -1) for a in n.args):
                yield _put(e, path, Pow(n, -1, evaluate=False))
            elif _exp(n, -1) and not isinstance(up, Mul):
                yield _put(e, path, n.base)
    elif fam == "power":                                            # drop a square / root per Pow node; whole^2, sqrt(whole)
        for path, n, _ in nodes:
            if _exp(n, 2, 0.5, -2, -0.5):
                yield _put(e, path, Pow(n.base, -1, evaluate=False) if float(n.exp) < 0 else n.base)
        yield Pow(e, 2, evaluate=False)
        yield Pow(e, S.Half, evaluate=False)
    elif fam == "factor":
        yield Mul(2, e, evaluate=False)
        yield Mul(S.Half, e, evaluate=False)
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
            yield _put(e, path, Mul(*rest, s, evaluate=False) if rest else s)
    elif fam == "dream":                                            # (a+b)^2 -> a^2+b^2; sqrt(a+b) -> sqrt(a)+sqrt(b)
        for path, n, _ in nodes:
            if _exp(n, 2, 0.5) and isinstance(n.base, Add):
                yield _put(e, path, Add(*(Pow(t, n.exp, evaluate=False) for t in n.base.args), evaluate=False))
    elif fam == "trig":                                             # sin <-> cos; the argument read as degrees vs radians
        for path, n, _ in nodes:
            if isinstance(n, (sin, cos, tan)):
                x = n.args[0]
                if isinstance(n, (sin, cos)):
                    yield _put(e, path, (cos if isinstance(n, sin) else sin)(x, evaluate=False))
                yield _put(e, path, n.func(Mul(x, pi, Pow(180, -1, evaluate=False), evaluate=False), evaluate=False))
                yield _put(e, path, n.func(Mul(x, 180, Pow(pi, -1, evaluate=False), evaluate=False), evaluate=False))
    elif fam == "units":
        for k in (2, -2, 3, -3):
            yield Mul(Pow(10, k, evaluate=False), e, evaluate=False)
    elif fam == "g":                                                # every 9.8 / 9.81 -> 10 (10 -> 9.8 is never sure: skipped)
        gs = [p for p, n, _ in nodes if isinstance(n, Float) and any(abs(float(n) - v) < EPS for v in (9.8, 9.81))]
        m = e
        for p in gs:
            m = _put(m, p, Integer(10))
        if gs:
            yield m


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
def raw(form):
    """((family, (values ascending, distinct within the family)), ...) before families are merged: the clash gate needs it."""
    e = parse(form)
    out = []
    for fam in FAMILIES:
        vals = []
        for m in _family(fam, e):
            v = _value(m)
            if v is not None and not any(_same(v, w) for w in vals):
                vals.append(v)
        out.append((fam, tuple(sorted(vals))))
    return tuple(out)


def mutants(form):
    """[(family, value)]: one entry per distinct value, the earliest family wins."""
    out = []
    for fam, vals in raw(str(form)):
        out += [(fam, v) for v in vals if not any(_same(v, w) for _, w in out)]
    return out


def match(form, value, win=SLIP_WIN):
    """The first family whose slip is close() to the typed value, else None."""
    return next((fam for fam, v in mutants(form) if close(value, v, win)), None)


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
