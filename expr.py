"""Expression answers v1 (todo 137, brain _files/w137/GRILL.md): after one wrong try on a typed num answer (or num part), an EXPR_MODE bank's
box asks for the student's whole working as an expression. This module is pure (no network, no state): parse -> evaluate -> align the
student tree to the item's `form` tree -> L1 family + affirm / off spans -> diagnosis JSON v1.1 -> leak guard -> Cluck's 6-move text.
serve.py holds the glue (flag, grading, the L3 Sonnet call, cache, store).

Syntax = the `form` grammar (SCHEMA.md): numbers + - * / ^ ( ) pi sqrt sin cos tan asin acos atan exp log ln abs, plus `g` (the bank's g,
9.8 default). Names are case-blind (Sqrt, Pi). No implicit * ("2pi" is a syntax line, never a guess). ** = ^; × · = *; ÷ = /; π = pi; √ = sqrt."""
import math
import re

FUNCS = ("sqrt", "sin", "cos", "tan", "asin", "acos", "atan", "exp", "log", "ln", "abs")
G_DEFAULT = 9.8
PROMPT = "Type your whole working, e.g. 1200*9.8/(pi*1^2)"   # the box's copy once it wants an expression (BRIEF W137 step 2)
MAX_LEN = 300
REL = 1e-9                     # two literals / factors are the same quantity within this (relative)


class ExprError(ValueError):
    """a friendly syntax line (never a try): .msg is shown as is, .pos the character it points at"""
    def __init__(self, msg, pos=0):
        super().__init__(msg)
        self.msg, self.pos = msg, pos


class N:
    """one tree node: kind num | pi | g | neg | add | sub | mul | div | pow | fn; a, b = children; s, e = its span in the typed text"""
    __slots__ = ("kind", "val", "a", "b", "s", "e")

    def __init__(self, kind, s, e, val=None, a=None, b=None):
        self.kind, self.val, self.a, self.b, self.s, self.e = kind, val, a, b, s, e

    def kids(self):
        return [k for k in (self.a, self.b) if k is not None]


_TOK = re.compile(r"\s*(?:(\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)|([A-Za-z]+)|(\*\*|[-+*/^()]))")


def clean(text):
    """the typed text with the friendly stand-ins swapped for the grammar's own characters (same length where it can: spans stay true)"""
    t = str(text)[:MAX_LEN]
    return (t.replace("×", "*").replace("·", "*").replace("÷", "/").replace("π", "pi").replace("√", "sqrt").replace("−", "-"))


def tokens(text):
    out, i = [], 0
    while i < len(text):
        if text[i:].strip() == "":
            break
        m = _TOK.match(text, i)
        if not m or m.end() == i:
            j = i + len(text[i:]) - len(text[i:].lstrip())
            raise ExprError(f"I can't read the \"{text[j]}\". Use numbers, + - * / ^ ( ), pi, g and sqrt( ).", j)
        num, name, op = m.groups()
        start = m.start(m.lastindex)
        if num is not None:
            out.append(("num", num, start, m.end()))
        elif name is not None:
            low = name.lower()
            if low not in FUNCS and low not in ("pi", "g"):
                raise ExprError(f"I don't know \"{name}\". Use numbers, pi, g and sqrt( ) / sin( ) style functions.", start)
            out.append(("name", low, start, m.end()))
        else:
            out.append(("op", "^" if op == "**" else op, start, m.end()))
        i = m.end()
    return out


class _P:
    def __init__(self, text):
        self.text, self.t, self.i = text, tokens(text), 0

    def peek(self):
        return self.t[self.i] if self.i < len(self.t) else None

    def eat(self, kind=None, val=None):
        tk = self.peek()
        if tk is None or (kind and tk[0] != kind) or (val and tk[1] != val):
            return None
        self.i += 1
        return tk

    def need_end(self):
        tk = self.peek()
        if tk is not None:
            if tk[0] == "op" and tk[1] == ")":
                raise ExprError("There's an extra \")\".", tk[2])
            raise ExprError(f"Put * between the parts before \"{self.text[tk[2]:tk[3]]}\" (no hidden multiplying).", tk[2])

    def expr(self):
        n = self.term()
        while (tk := self.peek()) and tk[0] == "op" and tk[1] in "+-":
            self.i += 1
            r = self.term()
            n = N("add" if tk[1] == "+" else "sub", n.s, r.e, a=n, b=r)
        return n

    def term(self):
        n = self.unary()
        while (tk := self.peek()) and tk[0] == "op" and tk[1] in "*/":
            self.i += 1
            r = self.unary()
            n = N("mul" if tk[1] == "*" else "div", n.s, r.e, a=n, b=r)
        return n

    def unary(self):
        tk = self.peek()
        if tk and tk[0] == "op" and tk[1] in "+-":
            self.i += 1
            x = self.unary()
            return x if tk[1] == "+" else N("neg", tk[2], x.e, a=x)
        return self.power()

    def power(self):
        base = self.atom()
        tk = self.peek()
        if tk and tk[0] == "op" and tk[1] == "^":
            self.i += 1
            ex = self.unary()                      # right-assoc: 2^3^2 = 2^(3^2); 2^-1 reads
            return N("pow", base.s, ex.e, a=base, b=ex)
        return base

    def close(self, s):
        c = self.eat("op", ")")
        if c:
            return c
        tk = self.peek()
        if tk is not None and not (tk[0] == "op" and tk[1] in "+-*/^)"):
            raise ExprError(f"Put * between the parts before \"{self.text[tk[2]:tk[3]]}\" (no hidden multiplying).", tk[2])
        raise ExprError("A \"(\" is never closed.", s)

    def atom(self):
        tk = self.peek()
        if tk is None:
            raise ExprError("Your working stops early: something is missing at the end.", len(self.text))
        self.i += 1
        kind, v, s, e = tk
        if kind == "num":
            try:
                return N("num", s, e, val=v)
            except ValueError:
                raise ExprError(f"I can't read the number \"{v}\".", s)
        if kind == "name":
            if v in ("pi", "g"):
                return N(v, s, e)
            if not self.eat("op", "("):
                raise ExprError(f"Put brackets after {v}, like {v}(2).", e)
            inner = self.expr()
            close = self.close(s)
            return N("fn", s, close[3], val=v, a=inner)
        if v == "(":
            inner = self.expr()
            close = self.close(s)
            inner.s, inner.e = s, close[3]      # the bracket belongs to its group: spans include it
            return inner
        raise ExprError(f"Something is missing before \"{v}\".", s)


def parse(text):
    """typed text -> tree (N); ExprError with a friendly line on anything outside the grammar"""
    t = clean(text)
    if not t.strip():
        raise ExprError("Type your whole working first.", 0)
    p = _P(t)
    n = p.expr()
    p.need_end()
    return n


def is_bare_number(text):
    """one plain number (an optional sign, digits, a decimal point, an e-power, or the x10^ form): the box wants the whole working instead"""
    t = clean(text).strip().replace(" ", "")
    return bool(re.fullmatch(r"[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?((\*|x|X)10\^[-+]?\d+)?", t))


def value(n, g=G_DEFAULT):
    """float of a tree; ValueError / ZeroDivisionError / OverflowError on a value that can't be worked out"""
    k = n.kind
    if k == "num":
        return float(n.val)
    if k == "pi":
        return math.pi
    if k == "g":
        return float(g)
    if k == "neg":
        return -value(n.a, g)
    if k in ("add", "sub", "mul", "div", "pow"):
        a, b = value(n.a, g), value(n.b, g)
        if k == "add":
            return a + b
        if k == "sub":
            return a - b
        if k == "mul":
            return a * b
        if k == "div":
            return a / b
        r = a ** b
        if isinstance(r, complex):
            raise ValueError("complex")
        return float(r)
    x = value(n.a, g)
    f = {"sqrt": math.sqrt, "sin": math.sin, "cos": math.cos, "tan": math.tan, "asin": math.asin, "acos": math.acos, "atan": math.atan,
         "exp": math.exp, "log": math.log, "ln": math.log, "abs": abs}[n.val]
    return float(f(x))


def evaluate(text, g=G_DEFAULT):
    """(tree, value): ExprError for a syntax problem or a value that can't be worked out (both are never a try)"""
    n = parse(text)
    try:
        v = value(n, g)
    except (ValueError, ZeroDivisionError, OverflowError):
        raise ExprError("That working can't be worked out (a divide by zero, or a root or log of a negative).", 0)
    if v != v or abs(v) == float("inf"):
        raise ExprError("That working can't be worked out (it runs off to infinity).", 0)
    return n, v


_PREC = {"add": 1, "sub": 1, "mul": 2, "div": 2, "neg": 3, "pow": 4}


def _num_norm(s):
    v = float(s)
    return str(int(v)) if v == int(v) and abs(v) < 1e15 and "e" not in s.lower() else repr(v)


def norm(n, up=0):
    """the canonical string of a tree (lower-case names, numbers in one spelling, only the brackets the tree needs): the cache key's half"""
    k = n.kind
    if k == "num":
        return _num_norm(n.val)
    if k in ("pi", "g"):
        return k
    if k == "fn":
        return f"{n.val}({norm(n.a)})"
    p = _PREC[k]
    if k == "neg":
        s = "-" + norm(n.a, p)
    elif k == "pow":
        s = norm(n.a, p + 1) + "^" + norm(n.b, p)
    else:
        op = {"add": "+", "sub": "-", "mul": "*", "div": "/"}[k]
        s = norm(n.a, p) + op + norm(n.b, p + (k in ("sub", "div")))   # a-(b-c), a/(b*c) keep their brackets
    return f"({s})" if p < up else s


def literals(n, skip_exp=True):
    """the numbers the student typed in this subtree, in typed order (text as typed); an exponent's literal (the 2 in x^2) skipped"""
    if n.kind == "num":
        return [n.val]
    if n.kind == "pow" and skip_exp:
        return literals(n.a, skip_exp)
    return [x for k in n.kids() for x in literals(k, skip_exp)]


# ---------------- alignment: student tree vs form tree ----------------
def _factors(n, sign=1):
    """a product's factors as (node, power ±1): a*b/c -> [(a,1),(b,1),(c,-1)]; brackets are transparent"""
    if n.kind == "mul":
        return _factors(n.a, sign) + _factors(n.b, sign)
    if n.kind == "div":
        return _factors(n.a, sign) + _factors(n.b, -sign)
    return [(n, sign)]


def _terms(n, sign=1):
    if n.kind == "add":
        return _terms(n.a, sign) + _terms(n.b, sign)
    if n.kind == "sub":
        return _terms(n.a, sign) + _terms(n.b, -sign)
    return [(n, sign)]


def _same(a, b):
    return abs(a - b) <= REL * max(abs(a), abs(b)) if (a or b) else True


def _v(n, g):
    try:
        return value(n, g)
    except (ValueError, ZeroDivisionError, OverflowError):
        return float("nan")


def _split(n):
    """('mul', factors) | ('add', terms) | (None, [(n, 1)])"""
    if n.kind in ("mul", "div"):
        return "mul", _factors(n)
    if n.kind in ("add", "sub"):
        return "add", _terms(n)
    return None, [(n, 1)]


def align(stu, form, g=G_DEFAULT, gf=G_DEFAULT, text="", ftext=""):
    """[(student node | None, form node | None, status)] at the top level of the two trees, status same | changed | extra | missing |
    inverted (same value, other side of the fraction) | negated (same term, other sign). Pieces match by value (two different trees with equal numbers are
    one quantity: g typed as 9.8 or g, 2*pi as (2*pi)); the rest pair up as changed when one is left on each side."""
    ks, sp = _split(stu)
    kf, fp = _split(form)
    if ks != kf or ks is None:
        return [(stu, form, "same" if _same(_v(stu, g), _v(form, gf)) else "changed")]
    sv = [(n, p, _v(n, g)) for n, p in sp]
    fv = [(n, p, _v(n, gf)) for n, p in fp]
    used, out = set(), []
    for n, p, v in sv:
        j = next((j for j, (m, q, w) in enumerate(fv) if j not in used and q == p and _same(v, w)), None)
        if j is None:
            j = next((j for j, (m, q, w) in enumerate(fv) if j not in used and q != p and _same(v, w)), None)
            if j is not None:
                used.add(j)
                out.append((n, fv[j][0], "inverted" if ks == "mul" else "negated"))
                continue
            out.append((n, None, "extra"))
        else:
            used.add(j)
            out.append((n, fv[j][0], "same"))
    miss = [m for j, (m, q, w) in enumerate(fv) if j not in used]
    extra = [i for i, (n, f, st) in enumerate(out) if st == "extra"]
    if len(extra) == 1 and len(miss) == 1:
        i = extra[0]
        out[i] = (out[i][0], miss[0], "changed")
        miss = []
    return out + [(None, m, "missing") for m in miss]


def _span_text(text, nodes):
    """the typed text from the first node to the last (brackets balanced outward)"""
    s, e = min(n.s for n in nodes), max(n.e for n in nodes)
    while text[s:e].count("(") > text[s:e].count(")") and e < len(text):
        e += 1
    while text[s:e].count(")") > text[s:e].count("(") and s > 0:
        s -= 1
    return text[s:e].strip()


def _what(n):
    """a plain name for a student piece, never its value"""
    k = n.kind
    if k == "fn":
        return {"sqrt": "the square root", "sin": "the sine", "cos": "the cosine", "tan": "the tangent", "abs": "the absolute value",
                "exp": "the exponential", "log": "the log", "ln": "the log"}.get(n.val, f"the {n.val}")
    if k == "pow":
        return "the power"
    if k in ("add", "sub"):
        return "the sum in brackets"
    if k == "div":
        return "the fraction"
    if k == "mul":
        return "that product"
    if k == "g":
        return "the g"
    if k == "pi":
        return "the pi"
    if k == "num":
        return f"the {n.val}"
    return "that part"


def _contig(order, picked):
    """True when the picked student nodes sit next to each other in the typed order"""
    idx = sorted(order.index(n) for n in picked)
    return idx == list(range(idx[0], idx[0] + len(idx)))


def _is_pow10(v):
    if v <= 0:
        return False
    k = math.log10(v)
    return abs(k - round(k)) < 1e-9 and round(k) != 0


def family(pairs, g=G_DEFAULT, gf=G_DEFAULT):
    """L1's structural families (the slips families read off the tree, so a tie by value is no tie here): the first that fits, else None.
    pairs = align(); a value-only slips.match runs after this in serve.py."""
    bad = [(s, f, st) for s, f, st in pairs if st != "same"]
    if not bad:
        return None
    if all(st == "inverted" for _, _, st in bad):
        return "reciprocal"
    if all(st == "negated" for _, _, st in bad):
        return "sign"
    if len(bad) == 1:
        s, f, st = bad[0]
        if st == "changed":
            a, b = _v(s, g), _v(f, gf)
            if s.kind == "num" and abs(a - 10) < 1e-9 and any(abs(b - x) < 1e-9 for x in (9.8, 9.81)) or s.kind == "g" and False:
                return "g"
            if s.kind == "num" and any(abs(a - x) < 1e-9 for x in (9.8, 9.81, 10)) and any(abs(b - x) < 1e-9 for x in (9.8, 9.81, 10)):
                return "g"
            if _same(a, -b):
                return "sign"
            if b and (_same(a, b * b) or _same(a * a, b) or (s.kind == "pow" and f.kind != "pow" and _same(_v(s.a, g), b))):
                return "power"
            if b and (_same(a, 2 * b) or _same(2 * a, b)):
                return "factor"
            if b and a / b > 0 and _is_pow10(a / b):
                return "units"
            if s.kind == "fn" and f.kind == "fn" and {s.val, f.val} == {"sin", "cos"}:
                return "trig"
            if s.kind == "fn" and f.kind == "fn" and s.val == f.val and s.val in ("sin", "cos", "tan"):
                return "trig"
        if st == "missing":
            b = _v(f, gf)
            if any(_same(b, x) for x in (2, 0.5)):
                return "factor"
            if _is_pow10(b) or _is_pow10(1 / b if b else 0):
                return "units"
            return "drop"
        if st == "extra":
            a = _v(s, g)
            if any(_same(a, x) for x in (2, 0.5)):
                return "factor"
            if _is_pow10(a) or (a and _is_pow10(1 / a)):
                return "units"
    return None


def l1(stu_text, form, g=G_DEFAULT):
    """the deterministic read: {pairs, family, affirm, off, explain_each}. form is the item's authored `form` (g folded in as 9.8)."""
    t = clean(stu_text)
    stu = parse(t)
    ftext = str(form)
    fo = parse(ftext)
    pairs = align(stu, fo, g, G_DEFAULT, t, ftext)
    fam = family(pairs, g, G_DEFAULT)
    order = [n for n, _, _ in pairs if n is not None]
    same = [n for n, f, st in pairs if st == "same" and n is not None]
    off_nodes = [n for n, f, st in pairs if st in ("changed", "extra", "inverted", "negated") and n is not None]
    affirm = []
    if same and off_nodes and _contig(order, same):
        span = _span_text(t, same)
        lo = t.find(span)
        if not any(lo <= n.s < lo + len(span) for n in off_nodes):   # never an affirm that holds the off piece
            affirm = [{"span": span, "what": "that part"}]
    off = None
    if len(off_nodes) == 1:
        n = off_nodes[0]
        off = {"span": _span_text(t, [n]), "what": _what(n), "s": n.s, "e": n.e}
    each = []
    for n in off_nodes[:1]:
        for x in literals(n):
            if x not in each:
                each.append(x)
    return {"pairs": [{"student": _span_text(t, [s]) if s else None, "form": _span_text(ftext, [f]) if f else None, "status": st}
                      for s, f, st in pairs],
            "family": fam, "affirm": affirm, "off": off, "explain_each": each[:5], "norm": norm(stu)}


# ---------------- diagnosis JSON v1.1 ----------------
DIAG_SCHEMA = {
    "type": "object", "additionalProperties": False,
    "required": ["family", "concept", "confidence", "student_view"],
    "properties": {
        "family": {"type": ["string", "null"]},
        "concept": {"type": "string"},
        "confidence": {"type": "number"},
        "alignment": {"type": "array", "items": {"type": "object", "additionalProperties": False,
                                                 "required": ["student", "status", "quantity"],
                                                 "properties": {"student": {"type": "string"}, "status": {"type": "string", "enum": ["same", "changed", "extra", "missing"]},
                                                                "quantity": {"type": "string"}}}},
        "student_view": {
            "type": "object", "additionalProperties": False,
            "required": ["affirm", "off", "explain_each", "recall", "next", "guard"],
            "properties": {
                "affirm": {"type": "array", "items": {"type": "object", "additionalProperties": False, "required": ["span", "what"],
                                                      "properties": {"span": {"type": "string"}, "what": {"type": "string"}}}},
                "off": {"type": "object", "additionalProperties": False, "required": ["span", "what"],
                        "properties": {"span": {"type": "string"}, "what": {"type": "string"}}},
                "explain_each": {"type": "array", "items": {"type": "string"}},
                "recall": {"type": "object", "additionalProperties": False, "required": ["rule", "decider"],
                           "properties": {"rule": {"type": "string"}, "decider": {"type": "string"}}},
                "next": {"type": "string"},
                "guard": {"type": "string"},
            }},
    }}


def _ok_type(v, t):
    ts = t if isinstance(t, list) else [t]
    return any({"string": isinstance(v, str), "number": isinstance(v, (int, float)) and not isinstance(v, bool), "null": v is None,
                "array": isinstance(v, list), "object": isinstance(v, dict)}[x] for x in ts)


def valid(obj, schema=DIAG_SCHEMA):
    """True when obj fits the (small) JSON schema subset used here: type, required, properties, additionalProperties false, items, enum"""
    if "type" in schema and not _ok_type(obj, schema["type"]):
        return False
    if "enum" in schema and obj not in schema["enum"]:
        return False
    if isinstance(obj, dict) and "properties" in schema:
        if any(k not in obj for k in schema.get("required", [])):
            return False
        if schema.get("additionalProperties") is False and any(k not in schema["properties"] for k in obj):
            return False
        return all(valid(obj[k], s) for k, s in schema["properties"].items() if k in obj)
    if isinstance(obj, list) and "items" in schema:
        return all(valid(x, schema["items"]) for x in obj)
    return True


def diagnosis(item, part, expr_text, value_, l1r, source="L1", model=None, l3=None, verdict="wrong"):
    """the v1.1 record (GRILL.md): L1 fills alignment / family / affirm / off / explain_each; an L3 reply (validated) fills the rest"""
    sv = {"affirm": l1r["affirm"], "off": {k: l1r["off"][k] for k in ("span", "what")} if l1r.get("off") else None,
          "explain_each": l1r["explain_each"], "recall": None, "next": None, "guard": None}
    d = {"v": "1.1", "item": item, "part": part,
         "attempt": {"expr": expr_text, "norm": l1r["norm"], "value": value_, "parse_ok": True},
         "verdict": verdict, "source": source, "model": model, "confidence": 1.0 if source == "L1" and l1r.get("family") else 0.0,
         "alignment": l1r["pairs"], "family": l1r.get("family"), "concept": None, "step": None, "student_view": sv,
         "leak": {"answer_digits": False, "option_text": False, "numbers": []}, "learn": {"store": source == "L3", "anon": True}}
    if l3:
        v = l3["student_view"]
        d.update(family=l3.get("family") or d["family"], concept=l3.get("concept"), confidence=float(l3.get("confidence") or 0))
        sv.update(affirm=v.get("affirm") or sv["affirm"], off=v.get("off") or sv["off"], explain_each=v.get("explain_each") or sv["explain_each"],
                  recall=v.get("recall"), next=v.get("next"), guard=v.get("guard"))
    return d


NUM_RE = re.compile(r"(?<![A-Za-z_])\d+(?:\.\d+)?(?:[eE][-+]?\d+)?|(?<![A-Za-z_\d])\.\d+")


def shown_fields(d):
    """every student-facing string of a diagnosis (what the leak guard reads)"""
    sv = d.get("student_view") or {}
    out = [a.get("what", "") for a in sv.get("affirm") or []]
    if sv.get("off"):
        out.append(sv["off"].get("what", ""))
    if sv.get("recall"):
        out += [sv["recall"].get("rule", ""), sv["recall"].get("decider", ""), sv["recall"].get("where", "")]
    out += [sv.get("next") or "", sv.get("guard") or ""]
    return [x for x in out if x]


def leak(d, typed, banned, scan=None, form=""):
    """None when every shown field is clean, else why: a number the student didn't type (key / option digits never ride: any number not
    typed is refused, banned ones are named), the correct formula, or a prompt word (scan = serve.leak_scan, W92). The spans (affirm/off/
    explain_each) must be the student's own text."""
    mine = [float(x) for x in typed]
    sv = d.get("student_view") or {}
    spans = [a.get("span", "") for a in sv.get("affirm") or []] + ([sv["off"].get("span", "")] if sv.get("off") else [])
    flat = clean(d.get("attempt", {}).get("expr", "")).replace(" ", "").lower()
    for sp in spans:
        if sp and clean(sp).replace(" ", "").lower() not in flat:
            return "span"
    for x in sv.get("explain_each") or []:
        if not any(_same(float(x), m) for m in mine) if NUM_RE.fullmatch(str(x).strip()) else True:
            return "explain_each"
    fnorm = clean(form).replace(" ", "").lower()
    for t in shown_fields(d):
        for m in NUM_RE.findall(t):
            v = float(m)
            if any(_same(v, b) for b in banned):
                return "answer_digits"
            if not any(_same(v, x) for x in mine):
                return "number"
        if fnorm and len(fnorm) > 6 and fnorm in t.replace(" ", "").lower():
            return "formula"
        if scan and scan(t):
            return "prompt"
    return None


def _sentence(t):
    t = (t or "").strip()
    return t if not t or t[-1] in ".!?" else t + "."


def _cap(t):
    return t[:1].upper() + t[1:] if t else t


def _and(xs):
    xs = [f"the {x}" for x in xs]
    return xs[0] if len(xs) == 1 else ", ".join(xs[:-1]) + ", and " + xs[-1]


def render(d, family_line=None, where=None):
    """the 6 moves as Cluck's message (plain lines, Cluck voice), in order affirm -> off -> explain_each -> recall -> next -> guard; a slot
    with nothing is skipped. family_line: L1's family hint (the recall slot when L3 gave none). where: recall's place, from the server's
    own history (never the model's guess)."""
    sv = d["student_view"]
    lines = []
    for a in sv.get("affirm") or []:
        w = a.get("what") or "that part"
        lines.append(f"Your {w} is right: `{a['span']}`. Keep it." if w != "that part" else f"This part is right: `{a['span']}`. Keep it.")
    off = sv.get("off")
    if off:
        lines.append(f"{_cap(off.get('what') or 'one part')} is the part that's off: `{off['span']}`.")
    each = sv.get("explain_each") or []
    if each:
        lines.append(f"Write down what each number there means: {_and(each)}. One line each." if len(each) > 1
                     else f"Write down what the {each[0]} there means. One line.")
    rc = sv.get("recall")
    if rc and (rc.get("rule") or rc.get("decider")):
        place = f" from {where}" if where else ""
        lines.append(" ".join(x for x in (_sentence(f"Then go back to the {rc['rule']}{place}") if rc.get("rule") else "", _sentence(rc.get("decider"))) if x))
    elif family_line:
        lines.append(family_line)
    if sv.get("next"):
        lines.append(_sentence(sv["next"]))
    if sv.get("guard"):
        lines.append(_sentence(sv["guard"]))
    return "\n\n".join(lines)


NUDGE = "Something in your working is off. Look at each number and say what it stands for. Ask Cluck if you want a hand."


def cache_key(item, part, n):
    """(item, part, normalised expression): one diagnosis per distinct working, any student"""
    return f"{item}|{'' if part is None else part}|{n}"


L3_SYSTEM = """You help a physics student find the mistake in their own work. You get the question, the correct formula as an expression, and the student's expression. Fill the JSON schema. Rules: compare the two expressions piece by piece. Mark what is right by its exact text. Name the one part that is off by what it is, never by its value. Ask the student to say what each of their own numbers in that part means. If the needed rule appeared earlier (given in `seen`), point to where; otherwise name the idea in plain words. Give one next action and one short guardrail. Never write the answer, any number from the correct formula or the options, or the correct formula itself. Short, warm, plain sentences. If you are not sure, set confidence below 0.6 and keep the hint general."""
L3_FIELDS = """Field notes: student_view.affirm[].span and student_view.off.span are copied exactly from the student's expression. explain_each lists the student's own numbers inside the off span, as typed. recall.rule names the idea in words (no symbols, no numbers); recall.decider is the one fact from the question that decides it, in words. next and guard contain no numbers."""
