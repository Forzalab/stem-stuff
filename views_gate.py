"""P4.1 server gate for Cluck's ```openui fences (render plan v2; sprint-render-v2 P4.1, spec H): one figure per reply in OpenUI Lang 1.0,
profile "stem", next to livefig's ```fig. Gate = parse -> schema -> checker -> leak -> stage per statement (oui.py, views/registry.json);
a failing statement is dropped, its siblings stay; the root failing (or nothing left to draw) drops the whole fence, the text still streams.
Numbers a student reads (labels, text) must be givens and never the answer to 3 sig figs: livefig's Ctx / nums / _eq / _sig3, imported.
Fence: livefig.Fence with an ```openui branch, so the hold-until-closed streaming and the one-figure count (fig + openui) are shared.
Kill switch CLUCK_VIEWS (default on): 0 / off / false strips every ```openui fence.
Scene steppers (viz MVP, todo 120; contract views/scene-contract.md): a Steps whose fig is a Scene is checked as one unit by scene_check
(schema, ids + refs, relations acyclic, the expression grammar, Trace run by the server, ops, step rules, leaks by the server-set stage,
caption voice); repair() gives a failing scene one repair round, then the reply goes out text only."""
import json
import math
import os
import re
import sys

import livefig
import oui

ROOT = os.path.dirname(os.path.abspath(__file__))
# What a chat figure may hold: drawings and their captions; never a stepper or a Predict (those need an item and the server's /predict)
CHAT = {"View", "Geometry", "Graph", "Legend", "Table", "Head", "Text", "Callout"}
GEO_CAPS = {"pts": 12, "marks": 12, "labels": 6}
GEO_MARKS = {"seg": 2, "circle": 2, "right": 3, "dim": 2, "angle": 3, "arrow": 2, "label": 1}   # name -> point / number args before the text
GEO_TEXT = {"dim", "angle", "arrow", "label"}
PT_RE = re.compile(r"^\s*([A-Za-z][A-Za-z0-9']{0,3})\s+(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$")
MARK_RE = re.compile(r"^\s*([a-z]+)\s*\((.*)\)\s*$")
_c = {}


def on():
    """CLUCK_VIEWS: default on; 0 / off / false / no strips every ```openui fence"""
    return os.environ.get("CLUCK_VIEWS", "1").strip().lower() not in ("0", "off", "false", "no")


def registry():
    if "reg" not in _c:
        with open(os.path.join(ROOT, "views", "registry.json"), encoding="utf-8") as f:
            _c["reg"] = json.load(f)
        with open(os.path.join(ROOT, "views", "library.json"), encoding="utf-8") as f:
            lib = json.load(f)
        _c["cat"] = oui.compile_schema((lib.get("staged") or lib)["schema"])   # staged: the scene family parses (contract locked)
    return _c["reg"]


def catalog():
    registry()
    return _c["cat"]


def _elements(node, out):
    """every element in the tree, with the statement it came from"""
    if isinstance(node, dict) and node.get("type") == "element":
        out.append(node)
        for v in (node.get("props") or {}).values():
            _elements(v, out)
    elif isinstance(node, list):
        for x in node:
            _elements(x, out)
    return out


def _caps(v, s, path):
    """registry caps (maxLength on the filled text; a whole "$t.<id>" slot is capped by views.js), maxItems, enum"""
    if v is None or not isinstance(s, dict):
        return None
    if isinstance(v, str):
        if s.get("maxLength") and len(v) > s["maxLength"] and not oui.slot_id(v):
            return f"too-long:{path}"
    if isinstance(v, list):
        if s.get("maxItems") and len(v) > s["maxItems"]:
            return f"too-long:{path}"
        for i, x in enumerate(v):
            if not (isinstance(x, dict) and x.get("type") == "element"):
                why = _caps(x, s.get("items"), f"{path}/{i}")
                if why:
                    return why
    return None


def geometry(props):
    """(None, label texts) when a Geometry's pts / marks parse within the caps, else (reason, [])"""
    pts = {}
    for t in str(props.get("pts", "")).split(";"):
        m = PT_RE.match(t)
        if m:
            x, y = float(m.group(2)), float(m.group(3))
            if not (math.isfinite(x) and math.isfinite(y) and abs(x) <= livefig.GEOM_MAX and abs(y) <= livefig.GEOM_MAX):
                return "number", []
            pts[m.group(1)] = (x, y)
        elif t.strip():
            return "geo-point", []
    if not pts:
        return "geo-point", []
    if len(pts) > GEO_CAPS["pts"]:
        return "too-long:pts", []
    marks = props.get("marks") or []
    if len(marks) > GEO_CAPS["marks"]:
        return "too-long:marks", []
    texts = []
    for s in marks:
        m = MARK_RE.match(str(s))
        if not m or m.group(1) not in GEO_MARKS:
            return "geo-mark", []
        k, args = m.group(1), [a.strip() for a in m.group(2).split(",")]
        n = GEO_MARKS[k]
        if len(args) < n:
            return "geo-mark", []
        names = args[:1] if k == "circle" else args[:n]
        if any(a not in pts for a in names):
            return "geo-point", []
        if k == "circle":
            try:
                r = float(args[1])
            except ValueError:
                return "geo-mark", []
            if not (0 < r <= livefig.GEOM_MAX):
                return "number", []
        if k in GEO_TEXT:
            rest = args[n:]
            if k == "dim" and len(rest) > 1 and rest[-1].lower() in ("left", "right"):
                rest = rest[:-1]
            text = ", ".join(rest).strip()
            if k == "label" and not text:
                return "geo-mark", []
            if text:
                texts.append(text)
        elif len(args) > n:
            return "geo-mark", []
    if len(texts) > GEO_CAPS["labels"]:
        return "labels", []
    return None, texts


def _leak(text, ctx, where):
    """livefig's rule for a number a student reads: from the givens, never the answer (3 sig figs)"""
    if oui.slot_id(text):
        return None
    for x in livefig.nums(text):
        if not math.isfinite(x) or abs(x) > livefig.GEOM_MAX:
            return "number"
        if any(livefig._sig3(abs(x), a) for a in ctx.answers):
            return f"leak:{where}={x:g}"
        if not any(livefig._eq(abs(x), g) for g in ctx.givens):
            return f"not-given:{where}={x:g}"
    return None


def _words(el, reg):
    """(prop, text) for every student-facing string of one element (not_words props carry data, never words)"""
    data = set(reg["slot"]["not_words"])
    out = []
    for k, v in (el.get("props") or {}).items():
        if f"{el['typeName']}.{k}" in data:
            continue
        for x in (v if isinstance(v, list) else [v]):
            for y in (x if isinstance(x, list) else [x]):
                if isinstance(y, str):
                    out.append((k, y))
    return out


def check_element(el, ctx):
    """None when one statement's element may be drawn in a Cluck reply, else the reason (a short code, logged; never shown)"""
    reg = registry()
    name = el.get("typeName")
    comp = reg["components"].get(name)
    if comp is None or comp.get("ships") == "planned":
        return f"unknown:{name}"
    if name in SCENE_ALL:
        return f"scene-outside:{name}"                   # scene parts only inside a scene stepper (checked whole by scene_check)
    if name not in CHAT:
        return f"chat:{name}"
    for k in el.get("props") or {}:
        if k in reg["banned_props"] or k not in comp["props"]:
            return f"schema:{name}.{k}"
    for k, v in (el.get("props") or {}).items():
        why = _caps(v, comp["props"].get(k), f"{name}.{k}")
        if why:
            return why
    key_ref = re.compile(reg["key_ref"])
    texts = _words(el, reg)
    if name == "Geometry":
        why, labels = geometry(el["props"])
        if why:
            return why
        texts += [("label", t) for t in labels]
    for k, t in texts:
        if key_ref.match(t.strip()):
            return f"stage:{name}.{k}"                  # a key ref is post-only; a Cluck reply is never post
        why = _leak(t, ctx, f"{name}.{k}")
        if why:
            return why
    return None


# ---------------- scene (viz MVP, todo 120): views/scene-contract.md is the contract; graph.js ports the same grammar ----------------
SCENE_OBJS = ("Shape", "Link", "Axes", "MathRows", "Code", "Trace", "Cells", "Bars")
SCENE_ALL = {*SCENE_OBJS, "Scene", "Q", "Ask"}
STAGES = ("pre", "wrong", "post")
ID_RE = re.compile(r"[A-Za-z][A-Za-z0-9_]{0,15}")
RESERVED = {"pi", "x", "y", "sqrt", "sin", "cos", "tan", "abs", "min", "max", "rad", "all", "fit"}
FUNCS = {"sqrt": 1, "sin": 1, "cos": 1, "tan": 1, "abs": 1, "rad": 1, "min": 2, "max": 2}   # min / max: 2 or more
PROPS = {"w", "h", "r", "base", "height", "apex", "radius", "segments", "rotate", "x", "y", "len"}
EXPR_MAX, EXPR_DEPTH, VAL_MAX = 80, 8, 1e4
STEPS_MIN, STEPS_MAX, MARKS_MAX, LABELS_MAX, CAP_WORDS, TICKS_MAX, WHILE_MAX, REPAIR_MAX = 3, 6, 12, 6, 15, 24, 200, 10
GEOM = {"rect": ({"w", "h"}, {"radius", "segments", "rotate"}), "circle": ({"r"}, {"rotate"}), "triangle": ({"base", "height"}, {"apex", "rotate"}),
        "polygon": ({"pts"}, {"rotate"}), "line": ({"from", "to"}, set()), "point": (set(), set())}
LINK_GEOM = {"arrow": (set(), {"head"}), "vector": (set(), set()), "spring": (set(), {"coils"}), "string": (set(), set()),
             "dimension": (set(), {"offset"}), "angle": ({"at"}, {"r"})}
POS = {"w", "h", "r", "base", "height"}                       # must evaluate > 0
NAMES = {"rect": {"center", "left", "right", "top", "bottom", "corner0", "corner1", "corner2", "corner3"},
         "circle": {"center", "left", "right", "top", "bottom"}, "triangle": {"center", "top", "bottom", "corner0", "corner1", "corner2"},
         "polygon": {"center", *(f"corner{i}" for i in range(8))}, "line": {"start", "end", "center"}, "point": {"center"},
         "Link": {"start", "end", "center"}}
EDGES = {"rect": {"top", "bottom", "left", "right"}, "circle": {"rim"}, "triangle": {"base", "left", "right", "hyp"},
         "polygon": {f"edge{i}" for i in range(8)}}
REF_PROPS = {"rect": {"w", "h", "radius", "segments", "rotate", "x", "y"}, "circle": {"r", "rotate", "x", "y"},
             "triangle": {"base", "height", "apex", "rotate", "x", "y"}, "polygon": {"rotate", "x", "y"}, "line": set(), "point": {"x", "y"},
             "Link": {"len"}}
DEFAULTS = {"rotate": 0.0, "radius": 0.0, "apex": 0.5}
SET_PROPS = {"Shape": {"rotate", "w", "h", "r", "base", "height", "apex", "radius", "segments", "at"}, "Link": {"from", "to"},
             "riemann": {"n"}, "tangent": {"x"}, "pointon": {"x"}, "marker": {"at"}, "Code": {"hl"}, "Trace": {"tick"}, "Cells": {"hl"}}
GEOMETRY = {"Shape", "Link", "Axes", "item", "Cells", "Bars", "Trace"}
ANCHOR_RE = re.compile(r"^([A-Za-z][A-Za-z0-9_]*)(?:\.([A-Za-z][A-Za-z0-9]*))?(?:@(\d*\.?\d+))?$")
NUM_LIT = re.compile(r"^-?(?:\d+(?:\.\d+)?|\.\d+)$")
TOKEN_RE = re.compile(r"\{([^{}]*)\}")
IDNUM_RE = re.compile(r"\b[A-Za-z_]+\d\w*")                  # ids with digits (T1, s1t, corner0) are names, not numbers
VERBS = set("count look find tilt set watch slide double draw add compare pick try check move put take use mark follow trace read solve "
            "write see start now turn level push pull drop split sum test imagine guess".split())
VOICE = [("dash", re.compile(r"[—–]")), ("exclaim", re.compile(r"!")),
         ("hype", re.compile(r"\b(?:let['’]s|let us|dive|crucial|key insight|notice how|amazing|simply)\b", re.I)),
         ("not-but", re.compile(r"\bnot\b[^.?!]*,\s*but\b", re.I)), ("qa", re.compile(r"\?\s*(?:yes|no|it|because|the)\b", re.I)),
         ("persona", re.compile(r"\b(?:the|this|that|it)\s+(?:\w+\s+)?(?:wants|tries|likes|hates|knows|decides|fights|loves|steals|needs|hopes|refuses)\b", re.I))]


class SceneError(Exception):
    """one broken scene rule: code = the contract's error code, detail = what (ids, values)"""
    def __init__(self, code, detail=""):
        super().__init__(f"{code}: {detail}")
        self.code, self.detail = code, detail


# ---- the expression grammar (contract §3; one EBNF, this port and graph.js's must agree on the conformance vectors) ----
_TOK = re.compile(r"\s*(?:(\d+(?:\.\d+)?|\.\d+)|([A-Za-z][A-Za-z0-9_]*)|(\S))")
_ast = {}


def _tokens(text):
    out, i = [], 0
    while i < len(text):
        m = _TOK.match(text, i)
        if not m:
            break                                              # trailing whitespace
        i = m.end()
        if m.group(1):
            out.append(("num", float(m.group(1))))
        elif m.group(2):
            out.append(("name", m.group(2)))
        elif m.group(3) in ("+", "-", "*", "/", "^", "(", ")", ",", "."):
            out.append(("op", m.group(3)))
        else:
            raise SceneError("expr-parse", f"{text!r}: bad character {m.group(3)!r}")
    return out


class _Parser:
    def __init__(self, text, allow_x):
        self.text, self.t, self.i, self.depth, self.allow_x = text, _tokens(text), 0, 0, allow_x

    def peek(self):
        return self.t[self.i] if self.i < len(self.t) else (None, None)

    def fail(self, why):
        raise SceneError("expr-parse", f"{self.text!r}: {why}")

    def expect(self, op):
        if self.peek() != ("op", op):
            self.fail(f"want {op!r}")
        self.i += 1

    def enter(self):
        self.depth += 1
        if self.depth > EXPR_DEPTH:
            self.fail(f"over {EXPR_DEPTH} deep")

    def run(self):
        e = self.sum()
        if self.i != len(self.t):
            self.fail(f"unexpected {self.t[self.i][1]!r}")
        return e

    def sum(self):
        a = self.product()
        while self.peek() in (("op", "+"), ("op", "-")):
            op = self.t[self.i][1]
            self.i += 1
            a = ("bin", op, a, self.product())
        return a

    def product(self):
        a = self.unary()
        while self.peek() in (("op", "*"), ("op", "/")):
            op = self.t[self.i][1]
            self.i += 1
            a = ("bin", op, a, self.unary())
        return a

    def unary(self):
        if self.peek() in (("op", "+"), ("op", "-")):
            op = self.t[self.i][1]
            self.i += 1
            self.enter()
            v = self.unary()
            self.depth -= 1
            return ("neg", v) if op == "-" else v
        return self.power()

    def power(self):
        a = self.atom()
        if self.peek() == ("op", "^"):
            self.i += 1
            return ("bin", "^", a, self.unary())
        return a

    def atom(self):
        kind, v = self.peek()
        if kind == "num":
            self.i += 1
            return ("num", v)
        if (kind, v) == ("op", "("):
            self.i += 1
            self.enter()
            e = self.sum()
            self.expect(")")
            self.depth -= 1
            return e
        if kind != "name":
            self.fail("want a number, a name or (")
        self.i += 1
        if self.peek() == ("op", "("):
            if v not in FUNCS:
                raise SceneError("expr-name", f"{self.text!r}: no function {v}")
            self.i += 1
            self.enter()
            args = [self.sum()]
            while self.peek() == ("op", ","):
                self.i += 1
                args.append(self.sum())
            self.expect(")")
            self.depth -= 1
            if len(args) != FUNCS[v] if FUNCS[v] == 1 else len(args) < 2:
                raise SceneError("expr-name", f"{self.text!r}: {v} takes {'one arg' if FUNCS[v] == 1 else '2 or more args'}")
            return ("call", v, args)
        if self.peek() == ("op", "."):
            self.i += 1
            k2, p = self.peek()
            if k2 != "name":
                self.fail("want a prop after .")
            self.i += 1
            if p not in PROPS:
                raise SceneError("expr-name", f"{self.text!r}: no prop {p}")
            return ("ref", v, p)
        if v in FUNCS or (v == "x" and not self.allow_x):
            raise SceneError("expr-name", f"{self.text!r}: {v} here")
        return ("name", v)


def expr_parse(text, allow_x=False):
    """the AST of one expression (contract §3), or SceneError expr-parse / expr-name"""
    text = str(text)
    key = (text, allow_x)
    if key not in _ast:
        if not text.strip() or len(text) > EXPR_MAX:
            raise SceneError("expr-parse", f"{text[:20]!r}: empty or over {EXPR_MAX} characters")
        _ast[key] = _Parser(text, allow_x).run()
    return _ast[key]


def _walk_ast(n, names, refs):
    if n[0] == "name" and n[1] not in ("pi", "x"):
        names.add(n[1])
    elif n[0] == "ref":
        refs.add((n[1], n[2]))
    elif n[0] in ("bin", "neg", "call"):
        for c in (n[2:] if n[0] == "bin" else [n[1]] if n[0] == "neg" else n[2]):
            _walk_ast(c, names, refs)


def expr_names(text, allow_x=False):
    """({names}, {(id, prop)}) one expression reads (pi and x left out)"""
    names, refs = set(), set()
    _walk_ast(expr_parse(text, allow_x), names, refs)
    return names, refs


def _num(v, text):
    if v is None:
        return None
    if isinstance(v, complex) or not math.isfinite(v):
        raise SceneError("expr-value", f"{text!r}: not a finite number")
    return float(v)


def _ev(n, env, x, text):
    k = n[0]
    if k == "num":
        return _num(n[1], text)
    if k == "name":
        if n[1] == "pi":
            return math.pi
        if n[1] == "x":
            return _num(x, text)
        if n[1] not in env:
            raise SceneError("expr-name", f"{text!r}: no quantity {n[1]}")
        return _num(env[n[1]], text)
    if k == "ref":
        key = f"{n[1]}.{n[2]}"
        if key not in env:
            raise SceneError("expr-name", f"{text!r}: no {key}")
        return _num(env[key], text)
    if k == "neg":
        v = _ev(n[1], env, x, text)
        return None if v is None else -v
    if k == "call":
        args = [_ev(a, env, x, text) for a in n[2]]
        if any(a is None for a in args):
            return None
        f = n[1]
        try:
            v = {"sqrt": lambda: math.sqrt(args[0]), "sin": lambda: math.sin(args[0]), "cos": lambda: math.cos(args[0]),
                 "tan": lambda: math.tan(args[0]), "abs": lambda: abs(args[0]), "rad": lambda: args[0] * math.pi / 180,
                 "min": lambda: min(args), "max": lambda: max(args)}[f]()
        except (ValueError, OverflowError):
            raise SceneError("expr-value", f"{text!r}: {f} out of its domain") from None
        return _num(v, text)
    a, b = _ev(n[2], env, x, text), _ev(n[3], env, x, text)
    if a is None or b is None:
        return None
    try:
        if n[1] == "^":
            if a < 0 and b != int(b):
                raise ValueError
            v = a ** b
        else:
            v = {"+": lambda: a + b, "-": lambda: a - b, "*": lambda: a * b, "/": lambda: a / b}[n[1]]()
    except (ValueError, ZeroDivisionError, OverflowError):
        raise SceneError("expr-value", f"{text!r}: {n[1]} out of range") from None
    return _num(v, text)


def expr_eval(text, env, allow_x=False, x=None):
    """the value of one expression: env maps Q ids and "id.prop" to numbers (None = not known here, propagates). Every step must be
    finite; the final value must be within ±10000 (middle steps may pass it: 397 * 90 on the way to 76.2)"""
    v = _ev(expr_parse(text, allow_x), env, x, str(text))
    if v is not None and abs(v) > VAL_MAX:
        raise SceneError("expr-value", f"{text!r}: {v:g} is over {VAL_MAX:g}")
    return v


# ---- Trace: the server runs the Code (a small Python subset); the model never simulates ----
def _tval(v):
    if isinstance(v, bool) or v is None or isinstance(v, str):
        return v
    if isinstance(v, (int, float)):
        if not math.isfinite(v) or abs(v) > 1e9:
            raise SceneError("trace-unsupported", "a value out of range")
        return v
    if isinstance(v, (list, range)):
        if len(v) > 100:
            raise SceneError("trace-unsupported", "a list over 100 items")
        return list(v) if isinstance(v, list) else v
    raise SceneError("trace-unsupported", f"a {type(v).__name__} value")


def _tfmt(v):
    if isinstance(v, bool) or v is None:
        return str(v)
    if isinstance(v, int):
        return str(v)
    if isinstance(v, float):
        return f"{v:.3g}"
    if isinstance(v, str):
        return repr(v)
    return ("[" + ", ".join(_tfmt(x) for x in v) + "]")[:20]


class _Brk(Exception):
    pass


class _Cont(Exception):
    pass


def trace_ticks(lines, vars_):
    """the ticks of one Trace: "L<line> v=<value> ..." per executed line (L0 = before the first), at most 24; SceneError
    trace-unsupported (outside the subset, or the code fails) / trace-long"""
    import ast
    names = str(vars_).split()
    if not names or not all(ID_RE.fullmatch(n) for n in names):
        raise SceneError("trace-unsupported", f"vars {vars_!r}")
    try:
        tree = ast.parse("\n".join(lines))
    except SyntaxError:
        raise SceneError("trace-unsupported", "the code does not parse") from None
    env, ticks = {}, []

    def tick(line):
        if len(ticks) >= TICKS_MAX:
            raise SceneError("trace-long", f"over {TICKS_MAX} ticks")
        ticks.append((f"L{line} " + " ".join(f"{n}={_tfmt(env[n]) if n in env else '-'}" for n in names))[:80])

    bins = {ast.Add: lambda a, b: a + b, ast.Sub: lambda a, b: a - b, ast.Mult: lambda a, b: a * b, ast.Div: lambda a, b: a / b,
            ast.FloorDiv: lambda a, b: a // b, ast.Mod: lambda a, b: a % b, ast.Pow: lambda a, b: a ** b if abs(b) <= 64 else 1 / 0}
    cmps = {ast.Lt: lambda a, b: a < b, ast.LtE: lambda a, b: a <= b, ast.Gt: lambda a, b: a > b, ast.GtE: lambda a, b: a >= b,
            ast.Eq: lambda a, b: a == b, ast.NotEq: lambda a, b: a != b, ast.In: lambda a, b: a in b, ast.NotIn: lambda a, b: a not in b}
    calls = {"range": lambda *a: range(*a) if len(range(*a)) <= 1000 else 1 / 0, "len": len, "min": min, "max": max, "abs": abs,
             "int": int, "sum": sum, "print": lambda *a: None}

    def ev(n):
        if isinstance(n, ast.Constant) and isinstance(n.value, (int, float, str, bool)):
            return n.value
        if isinstance(n, ast.Name):
            if n.id not in env:
                raise SceneError("trace-unsupported", f"{n.id} is not set")
            return env[n.id]
        if isinstance(n, ast.BinOp) and type(n.op) in bins:
            return _tval(bins[type(n.op)](ev(n.left), ev(n.right)))
        if isinstance(n, ast.UnaryOp) and isinstance(n.op, (ast.USub, ast.UAdd, ast.Not)):
            v = ev(n.operand)
            return -v if isinstance(n.op, ast.USub) else (not v) if isinstance(n.op, ast.Not) else v
        if isinstance(n, ast.BoolOp):
            vals = [ev(v) for v in n.values]
            return all(vals) if isinstance(n.op, ast.And) else any(vals)
        if isinstance(n, ast.Compare) and all(type(o) in cmps for o in n.ops):
            left = ev(n.left)
            for o, c in zip(n.ops, n.comparators):
                right = ev(c)
                if not cmps[type(o)](left, right):
                    return False
                left = right
            return True
        if isinstance(n, ast.Call) and isinstance(n.func, ast.Name) and n.func.id in calls and not n.keywords:
            return _tval(calls[n.func.id](*[ev(a) for a in n.args]))
        if isinstance(n, ast.List):
            return _tval([ev(e) for e in n.elts])
        if isinstance(n, ast.Subscript) and not isinstance(n.slice, ast.Slice):
            return ev(n.value)[ev(n.slice)]
        raise SceneError("trace-unsupported", type(n).__name__)

    def store(t, v):
        if isinstance(t, ast.Name):
            env[t.id] = _tval(v)
        elif isinstance(t, ast.Subscript) and isinstance(t.value, ast.Name) and not isinstance(t.slice, ast.Slice):
            ev(t.value)[ev(t.slice)] = _tval(v)
        else:
            raise SceneError("trace-unsupported", "assignment target")

    def run(body):
        for s in body:
            if isinstance(s, ast.Assign) and len(s.targets) == 1:
                store(s.targets[0], ev(s.value))
                tick(s.lineno)
            elif isinstance(s, ast.AugAssign) and type(s.op) in bins:
                cur = ev(s.target if isinstance(s.target, ast.Name) else s.target)
                store(s.target, _tval(bins[type(s.op)](cur, ev(s.value))))
                tick(s.lineno)
            elif isinstance(s, ast.Expr) and isinstance(s.value, ast.Call) and getattr(s.value.func, "id", "") == "print":
                ev(s.value)
                tick(s.lineno)
            elif isinstance(s, ast.For) and isinstance(s.target, ast.Name) and not s.orelse:
                for item in list(ev(s.iter)):
                    env[s.target.id] = _tval(item)
                    tick(s.lineno)
                    try:
                        run(s.body)
                    except _Brk:
                        break
                    except _Cont:
                        continue
            elif isinstance(s, ast.While) and not s.orelse:
                n = 0
                while ev(s.test):
                    n += 1
                    if n > WHILE_MAX:
                        raise SceneError("trace-long", f"while over {WHILE_MAX} times")
                    tick(s.lineno)
                    try:
                        run(s.body)
                    except _Brk:
                        break
                    except _Cont:
                        continue
            elif isinstance(s, ast.If):
                tick(s.lineno)
                run(s.body if ev(s.test) else s.orelse)
            elif isinstance(s, ast.Pass):
                pass
            elif isinstance(s, ast.Break):
                raise _Brk
            elif isinstance(s, ast.Continue):
                raise _Cont
            else:
                raise SceneError("trace-unsupported", type(s).__name__)

    tick(0)
    try:
        run(tree.body)
    except SceneError:
        raise
    except (_Brk, _Cont):
        raise SceneError("trace-unsupported", "break outside a loop") from None
    except Exception as e:  # noqa: BLE001  (model code that fails is a dropped Trace, never a crash)
        raise SceneError("trace-unsupported", type(e).__name__) from None
    return ticks


# ---- leaks ----
def _variants(a):
    return [a * 10 ** k for k in range(-6, 7) if k] + [a * 60, a / 60, a * 3600, a / 3600]


def _close(n, v):
    return v != 0 and (livefig._sig3(n, v) or abs(n - v) <= 0.005 * abs(v))


def _hits(n, answers, givens):
    """n is the answer (3 sig figs or 0.5%), or a unit variant of it that is no given"""
    n = abs(n)
    if any(_close(n, a) for a in answers):
        return True
    if any(livefig._eq(n, g) for g in givens):
        return False
    return any(_close(n, v) for a in answers for v in _variants(a))


def _numbers(text):
    """the numbers a student would read in a string: {qid} tokens, $t slots and digit-bearing ids left out"""
    if oui.slot_id(text):
        return []
    return livefig.nums(IDNUM_RE.sub(" ", TOKEN_RE.sub(" ", str(text))))


# ---- the scene checker ----
def _split_top(text, sep):
    out, depth, cur = [], 0, ""
    for c in text:
        depth += (c == "(") - (c == ")")
        if c == sep and depth == 0:
            out.append(cur)
            cur = ""
        else:
            cur += c
    return out + [cur]


class _Scene:
    """one scene stepper under check: errors as (where, code, detail), the server-filled Trace ticks"""

    def __init__(self, steps_el, ctx, stage):
        self.ctx, self.stage = ctx, stage if stage in STAGES else "wrong"
        self.hidden = self.stage != "post"
        self.errs, self.ticks = [], {}
        self.el = steps_el
        self.sc = steps_el["props"]["fig"]["props"]
        self.objs, self.qs, self.items = {}, {}, {}           # id -> (typeName, props); Q id -> props; item id -> (axes, kind, args)
        self.writers, self.edges, self.rel_sets = {}, set(), {}
        self.words, self.data = [], []                      # (where, text): student strings (leak + not-given); data strings (leak)
        self.exprs = []                                     # (where, text, allow_x)
        self.givens = set(ctx.givens) | set(range(0, 13)) if ctx else set(range(0, 13))

    def err(self, where, code, detail=""):
        e = (str(where), code, str(detail) or code)
        if e not in self.errs:
            self.errs.append(e)

    def guard(self, where, fn, *a, **k):
        try:
            return fn(*a, **k)
        except SceneError as e:
            self.err(where, e.code, e.detail)
            return None

    # -- ids and schema --
    def collect(self):
        ids = []
        for prop, ok in (("objs", SCENE_OBJS), ("qs", ("Q",))):
            for el in self.sc.get(prop) or []:
                name = el.get("typeName") if isinstance(el, dict) else None
                if name not in ok:
                    self.err(name or "scene", "scene-outside", f"{name or 'a value'} in Scene.{prop}")
                    continue
                ids.append((el["props"].get("id"), name, el["props"]))
        seen = set()
        for i, name, p in ids:
            if not isinstance(i, str) or not ID_RE.fullmatch(i):
                self.err(i, "id", f"{i!r} is no id")
                continue
            if i in RESERVED:
                self.err(i, "id-reserved", f"{i} is reserved")
                continue
            if i in seen:
                self.err(i, "id-dup", f"{i} twice")
                continue
            seen.add(i)
            if name == "Q":
                self.qs[i] = p
            else:
                self.objs[i] = (name, p)
        for i, (name, p) in list(self.objs.items()):
            if name == "Axes":
                for item in p.get("items") or []:
                    parts = str(item).split(None, 2)
                    if len(parts) < 2:
                        self.err(i, "axes-item", f"{item!r}")
                        continue
                    if not ID_RE.fullmatch(parts[0]) or parts[0] in RESERVED:
                        self.err(i, "id", f"item id {parts[0]!r}")
                    elif parts[0] in seen:
                        self.err(parts[0], "id-dup", f"{parts[0]} twice")
                    else:
                        seen.add(parts[0])
                        self.items[parts[0]] = (i, parts[1], parts[2] if len(parts) > 2 else "")

    def kind(self, i):
        """'Shape:rect' style kind of an id, the item kind, 'Q', or None"""
        if i in self.objs:
            name, p = self.objs[i]
            return f"{name}:{p.get('kind')}" if name in ("Shape", "Link") else name
        if i in self.items:
            return "item:" + self.items[i][1]
        return "Q" if i in self.qs else None

    def tokens(self, where, text):
        for t in TOKEN_RE.findall(str(text or "")):
            if t not in self.qs:
                self.err(where, "token", f"{{{t}}} is no Q")

    def word(self, where, text):
        if isinstance(text, str) and text:
            self.words.append((where, text))
            self.tokens(where, text)

    def expr(self, where, text, allow_x=False):
        self.data.append((where, str(text)))
        if self.guard(where, expr_parse, text, allow_x) is not None:
            self.exprs.append((where, str(text), allow_x))
            names, refs = expr_names(text, allow_x)
            return names, refs
        return None

    # -- points and anchors --
    def anchor(self, where, text, owner=None):
        """check one anchor; adds the dependency edge owner <- anchor's object"""
        m = ANCHOR_RE.match(text)
        if not m:
            return self.err(where, "anchor", f"{text!r}")
        i, name, t = m.group(1), m.group(2), m.group(3)
        if i not in self.objs and i not in self.qs and i not in self.items:
            return self.err(where, "ref", f"{i} in {text!r}")
        k = self.kind(i) or ""
        if not (k.startswith("Shape:") or k.startswith("Link:")):
            return self.err(where, "anchor", f"{i} has no anchors")
        sk = "Link" if k.startswith("Link:") else k.split(":")[1]
        if t is not None and not 0 <= float(t) <= 1:
            return self.err(where, "anchor", f"{text!r}: t out of 0..1")
        if name is None and t is not None and sk not in ("line", "Link"):
            return self.err(where, "anchor", f"{text!r}: id@t is for a line or a Link")
        if name is not None:
            names = NAMES[sk] | ({"tail", "head"} if k in ("Link:vector", "Link:arrow") else set())
            if sk == "polygon":
                pts = self.pts_count(i)
                names = {n for n in names if not n.startswith("corner") or int(n[6:]) < pts}
                edges = {e for e in EDGES[sk] if int(e[4:]) < pts}
            else:
                edges = EDGES.get(sk, set())
            if (t is None and name not in names) or (t is not None and name not in edges):
                return self.err(where, "anchor", f"{text!r}: {sk} has no {name}{'@' if t else ''}")
        if owner and owner != i:
            self.edges.add((i, owner))
        return i

    def pts_count(self, i):
        g = self.geom_pairs(self.objs[i][1].get("geom") or "")
        return len(str(g.get("pts", "")).split(";")) if g else 0

    def point(self, where, text, rel=False):
        t = str(text).strip()
        if rel:
            if not t.startswith("+"):
                return self.err(where, "point", f"{text!r}: want +dx,dy")
            t = t[1:]
        parts = _split_top(t, ",")
        if len(parts) != 2 or not all(p.strip() for p in parts):
            return self.err(where, "point", f"{text!r}")
        for p in parts:
            self.expr(where, p.strip())
        return True

    def place(self, where, text, owner, rel_ok=False):
        """a point, an anchor, or (rel_ok) a relative +dx,dy"""
        t = str(text).strip()
        if rel_ok and t.startswith("+"):
            return self.point(where, t, rel=True)
        if "," in t or not t[:1].isalpha():
            return self.point(where, t)
        return self.anchor(where, t, owner)

    @staticmethod
    def geom_pairs(geom):
        out = {}
        for pair in str(geom).split():
            m = re.fullmatch(r"([a-z]+)=(\S+)", pair)
            if not m or m.group(1) in out:
                return None
            out[m.group(1)] = m.group(2)
        return out

    def geom(self, i, kind, geom, table, extra_req=()):
        g = self.geom_pairs(geom)
        if g is None:
            return self.err(i, "geom-key", f"{geom!r}: want key=value pairs, each key once")
        req, opt = table
        for k in g:
            if k not in req | opt:
                self.err(i, "geom-key", f"{kind} has no {k}")
        for k in req:
            if k not in g:
                self.err(i, "geom-missing", f"{kind} needs {k}")
        self.data.append((i, str(geom)))
        return g

    # -- objects --
    def check_objects(self):
        for i, (name, p) in self.objs.items():
            getattr(self, "obj_" + name)(i, p)
        for i, p in self.qs.items():
            self.obj_Q(i, p)

    def obj_Shape(self, i, p):
        kind = p.get("kind")
        if kind not in GEOM:
            return self.err(i, "schema", f"no Shape kind {kind}")
        g = self.geom(i, kind, p.get("geom") or "", GEOM[kind]) or {}
        for k, v in g.items():
            if k in ("from", "to"):
                self.place(i, v, i)
            elif k == "pts":
                pts = v.split(";")
                if not 3 <= len(pts) <= 8:
                    self.err(i, "geom-value", f"pts: {len(pts)} points (3..8)")
                for pt in pts:
                    self.point(i, pt)
            elif k == "segments":
                if not re.fullmatch(r"\d+", v) or not 1 <= int(v) <= 20:
                    self.err(i, "geom-value", f"segments={v} (1..20)")
            elif k in GEOM[kind][0] | GEOM[kind][1]:
                self.expr(i, v)
        if p.get("at") is not None:
            if kind == "line":
                self.err(i, "geom-key", "a line takes from= to=, not at")
            else:
                self.place(i, p["at"], i)
        if p.get("role") == "right" and self.hidden:
            self.err(i, "role-stage", "right is for the post stage only")
        self.word(i, p.get("label"))

    def obj_Link(self, i, p):
        kind = p.get("kind")
        if kind not in LINK_GEOM:
            return self.err(i, "schema", f"no Link kind {kind}")
        g = self.geom(i, kind, p.get("geom") or "", LINK_GEOM[kind]) or {}
        self.place(i, p.get("from") or "", i)
        self.place(i, p.get("to") or "", i, rel_ok=kind in ("vector", "arrow"))
        if "head" in g and g["head"] not in ("end", "both", "none"):
            self.err(i, "geom-value", f"head={g['head']}")
        if "coils" in g and (not re.fullmatch(r"\d+", g["coils"]) or not 3 <= int(g["coils"]) <= 12):
            self.err(i, "geom-value", f"coils={g['coils']} (3..12)")
        for k in ("offset", "r"):
            if k in g:
                self.expr(i, g[k])
        if "at" in g:
            self.place(i, g["at"], i)
        if p.get("q") is not None and p["q"] not in self.qs:
            self.err(i, "ref", f"q {p['q']} is no Q")
        self.word(i, p.get("label"))

    def axis(self, i, text):
        m = re.fullmatch(r"\s*([^,\s]+)\s*,\s*(\S+)(?:\s+(.*))?", str(text))
        if not m:
            return self.err(i, "axes-range", f"{text!r}: want min,max label")
        lo, hi = (self.guard(i, expr_eval, v, self.env0()) if self.expr(i, v) else None for v in (m.group(1), m.group(2)))
        if lo is not None and hi is not None and lo >= hi:
            self.err(i, "axes-range", f"{text!r}: min >= max")
        if m.group(3):
            self.word(i, m.group(3))

    def obj_Axes(self, i, p):
        self.axis(i, p.get("x"))
        self.axis(i, p.get("y"))
        curves = {k for k, (ax, kind, _) in self.items.items() if ax == i and kind in ("curve", "line")}
        for k, (ax, kind, rest) in self.items.items():
            if ax != i:
                continue
            args = rest.split()
            need = {"area": 3, "riemann": 5, "tangent": 2, "pointon": 2}
            if kind == "curve":
                self.expr(k, rest, allow_x=True)
            elif kind == "line":
                pts = rest.split(";") if rest else []
                if not 2 <= len(pts) <= 8:
                    self.err(k, "axes-item", f"line: {len(pts)} points (2..8)")
                for pt in pts:
                    self.point(k, pt)
            elif kind in need:
                if len(args) != need[kind]:
                    self.err(k, "axes-item", f"{kind} takes {need[kind]} args")
                    continue
                if args[0] not in curves:
                    self.err(k, "ref", f"{args[0]} is no curve on {i}")
                if kind == "riemann" and args[4] not in ("left", "right", "mid", "trap"):
                    self.err(k, "axes-item", f"rule {args[4]}")
                for a in args[1:4 if kind == "riemann" else None]:
                    self.expr(k, a)
            elif kind == "marker":
                if len(args) < 2 or args[0] not in ("x", "y"):
                    self.err(k, "axes-item", "marker x|y value [label]")
                    continue
                self.expr(k, args[1])
                if len(args) > 2:
                    self.word(k, " ".join(args[2:]))
            else:
                self.err(k, "axes-item", f"no item kind {kind}")

    def obj_MathRows(self, i, p):
        for r in p.get("rows") or []:
            self.word(i, r)

    def obj_Code(self, i, p):
        for line in p.get("lines") or []:
            self.data.append((i, line))

    def obj_Trace(self, i, p):
        code = p.get("code")
        if code not in self.objs or self.objs[code][0] != "Code":
            return self.err(i, "ref", f"code {code} is no Code")
        c = self.objs[code][1]
        if c.get("lang") != "python":
            return self.err(i, "trace-lang", f"{c.get('lang')}: the engine runs python only")
        ticks = self.guard(i, trace_ticks, c.get("lines") or [], p.get("vars") or "")
        if ticks is not None:
            self.ticks[i] = ticks

    def obj_Cells(self, i, p):
        items = p.get("items") or []
        grid = [str(r).split() for r in items] if p.get("kind") == "grid" else None
        if grid is not None and len(grid) > 6:
            self.err(i, "cells-grid", f"{len(grid)} rows (at most 6)")
        for it in items:
            self.data.append((i, it))
        for tok in str(p.get("ptrs") or "").split():
            self.cell_index(i, p, tok)

    def cell_index(self, i, p, tok, name=None):
        """check "name:index" (or with name given, a bare index)"""
        m = re.fullmatch(r"([A-Za-z][A-Za-z0-9_]*):(\d+)(?:\.(\d+))?", tok) if name is None else re.fullmatch(r"()(\d+)(?:\.(\d+))?", tok)
        items = p.get("items") or []
        if not m:
            return self.err(i, "cells-ptr", f"{tok!r}: want name:index")
        r, c = int(m.group(2)), m.group(3)
        if p.get("kind") == "grid":
            rows = [str(x).split() for x in items]
            ok = c is not None and r < len(rows) and int(c) < len(rows[r])
        else:
            ok = c is None and r < len(items)
        if not ok:
            self.err(i, "cells-ptr", f"{tok!r}: no such cell")

    def obj_Bars(self, i, p):
        for it in p.get("items") or []:
            m = re.fullmatch(r"\s*([^:]+?)\s*:\s*(.+)", str(it))
            if not m:
                self.err(i, "bars-item", f"{it!r}: want label: expr")
                continue
            self.word(i, m.group(1))
            self.expr(i, m.group(2))
        if p.get("total") is not None:
            self.expr(i, p["total"])

    def obj_Q(self, i, p):
        role, has_v, has_e = p.get("role"), p.get("value") is not None, p.get("expr") is not None
        if role == "answer" and has_v:
            self.err(i, "answer-literal", "an answer Q never carries a value (give it an expr)")
        elif {"given": has_v and not has_e, "derived": has_e and not has_v, "answer": has_e, "unknown": not has_v and not has_e}.get(role) is False:
            self.err(i, "q-role", f"{role}: given = value, derived / answer = expr, unknown = neither")
        if has_e:
            self.expr(i, p["expr"])
        if has_v:
            self.data.append((i, oui.num_str(p["value"]) if hasattr(oui, "num_str") else str(p["value"])))

    # -- relations --
    def write(self, where, i, prop):
        if (i, prop) in self.writers:
            return self.err(where, "rel-conflict", f"{i}.{prop} written by {self.writers[(i, prop)]} and {where}")
        self.writers[(i, prop)] = where

    def obj_id(self, where, i):
        if i not in self.objs:
            self.err(where, "ref", f"{i} is no object")
            return False
        if self.objs[i][0] not in ("Shape", "Link"):
            self.err(where, "rel-parse", f"{i} is no Shape or Link")
            return False
        return True

    def check_rels(self):
        for n, rel in enumerate(self.sc.get("rels") or [], 1):
            where = f"rel {n}"
            t = str(rel).split()
            word, args = (t[0], t[1:]) if t else ("", [])
            bad = lambda why="": self.err(where, "rel-parse", f"{rel!r} {why}".strip())  # noqa: E731
            if word == "attach" and len(args) == 2:
                i, _, a = args[0].partition(".")
                if not self.obj_id(where, i):
                    continue
                if a:
                    self.anchor(where, args[0])
                self.anchor(where, args[1], i)
                prop = {"start": "from", "end": "to"}.get(a) if self.objs[i][0] == "Link" else None
                self.write(where, i, prop or "pos")
                self.data.append((where, rel))
            elif word == "on" and len(args) == 3:
                if not self.obj_id(where, args[0]) or "." not in args[1] or not NUM_LIT.match(args[2]):
                    bad("want on <id> <id>.<edge> <t>")
                    continue
                self.anchor(where, f"{args[1]}@{args[2]}", args[0])
                self.write(where, args[0], "pos")
                self.write(where, args[0], "rotate")
            elif word == "pivot" and len(args) == 2:
                if self.obj_id(where, args[0]):
                    self.anchor(where, args[1], args[0])
                    self.write(where, args[0], "pivot")
            elif word in ("align", "distribute", "stack") and args:
                axes = {"align": ("top", "bottom", "left", "right", "centerx", "centery")}.get(word, ("x", "y"))
                k = next((j for j, a in enumerate(args) if a in axes), None)
                if k is None or k < 2 or (word != "distribute" and k != len(args) - 1) or len(args) > k + 2:
                    bad(f"want {word} <id> <id> ... <{'|'.join(axes)}>")
                    continue
                ids = args[:k]
                if not all(self.obj_id(where, i) for i in ids):
                    continue
                if word == "distribute" and len(args) == k + 2:
                    self.expr(where, args[k + 1])
                for i in ids[1:]:
                    self.edges.add((ids[0], i))
                    self.write(where, i, "pos")
            elif word == "set" and len(args) == 2:
                i, _, prop = args[0].partition(".")
                if prop not in PROPS - {"x", "y", "len"}:
                    bad(f"no settable prop {prop!r}")
                    continue
                if not self.obj_id(where, i):
                    continue
                got = self.expr(where, args[1])
                if got:
                    for ri, _ in got[1]:
                        if ri in self.objs and ri != i:
                            self.edges.add((ri, i))
                self.rel_sets[(i, prop)] = args[1]
                self.write(where, i, prop)
            elif word == "scale" and len(args) >= 2:
                for i in args:
                    if self.obj_id(where, i) and (self.objs[i][1].get("kind") != "vector" or not self.objs[i][1].get("q")):
                        bad(f"{i} is no vector with a q")
                    else:
                        self.write(where, i, "len")
            else:
                bad()
        self.cycles()

    def cycles(self):
        graph = {}
        for a, b in self.edges:
            if a != b:
                graph.setdefault(a, set()).add(b)
        state = {}

        def dfs(u, path):
            state[u] = 1
            for v in sorted(graph.get(u, ())):
                if state.get(v) == 1:
                    raise SceneError("rel-cycle", " -> ".join(path[path.index(v):] + [v]) if v in path else v)
                if not state.get(v):
                    dfs(v, path + [v])
            state[u] = 2

        for u in sorted(graph):
            if not state.get(u):
                try:
                    dfs(u, [u])
                except SceneError as e:
                    self.err("rels", e.code, e.detail)
                    return

    # -- values --
    def env0(self):
        return _Env(self, {}, {})

    def check_exprs(self):
        env = self.env0()
        for where, text, allow_x in self.exprs:
            names, refs = expr_names(text, allow_x)
            missing = [n for n in sorted(names) if n not in env] + [f"{i}.{p}" for i, p in sorted(refs) if f"{i}.{p}" not in env]
            if missing:
                self.err(where, "expr-name", f"{text!r}: no {', '.join(missing)}")
            elif not allow_x:
                self.guard(where, expr_eval, text, env)
        for i, (name, p) in self.objs.items():
            if name == "Shape":
                g = self.geom_pairs(p.get("geom") or "") or {}
                for k in POS & set(g):
                    v = self.guard(i, expr_eval, g[k], env) if self.parses(g[k]) else None
                    if v is not None and v <= 0:
                        self.err(i, "geom-value", f"{k} must be > 0")
                if "apex" in g and self.parses(g["apex"]):
                    v = self.guard(i, expr_eval, g["apex"], env)
                    if v is not None and not 0 <= v <= 1:
                        self.err(i, "geom-value", "apex in 0..1")
        for i in self.qs:
            self.guard(i, env.__getitem__, i)

    @staticmethod
    def parses(text):
        try:
            expr_parse(text)
            return True
        except SceneError:
            return False

    # -- steps and ops --
    def check_steps(self):
        steps = [s for s in self.el["props"].get("steps") or [] if isinstance(s, dict)]
        n = len(steps)
        if not STEPS_MIN <= n <= STEPS_MAX:
            self.err("steps", "step-count", f"{n} steps ({STEPS_MIN}..{STEPS_MAX})")
        visible, added, params, sets = set(), set(), {}, {}
        asks, change, shown, reveals, envs = [], [], [], [], []
        for k, st in enumerate(steps, 1):
            where, p = f"step {k}", st["props"]
            if any(p.get(a) is not None for a in ("nodes", "edges", "tags", "labels", "front", "rows")):
                self.err(where, "scene-step-graph-arg", "a scene Step leaves nodes edges tags labels front rows null")
            cap = p.get("cap") or ""
            self.word(where, cap)
            if len(cap.split()) > CAP_WORDS:
                self.err(where, "caption-long", f"{len(cap.split())} words (at most {CAP_WORDS})")
            ask = p.get("ask")
            if ask is not None:
                if not isinstance(ask, dict) or ask.get("typeName") != "Ask" or not 2 <= len(ask["props"].get("choices") or []) <= 4:
                    self.err(where, "ask", "an Ask with 2..4 choices")
                else:
                    self.word(where, ask["props"].get("q"))
                    for c in ask["props"].get("choices") or []:
                        self.word(where, c)
                asks.append(k)
            touched, geo, glow = set(), False, set()
            for op in p.get("ops") or []:
                t = str(op).split()
                word = t[0] if t else ""
                if word == "param" or (word == "set" and len(t) > 3 and t[2] not in ("segments", "hl", "tick") and not t[2].startswith("ptr.")):
                    self.data.append((where, " ".join(t[2:])))      # magnitudes; ids and indices (tick 10) are no quantity
                if word in ("add", "glow", "hide") and len(t) > 1:
                    for i in t[1:]:
                        kd = self.kind(i)
                        if kd is None:
                            self.err(where, "ref", f"{word} {i}: no such id")
                        elif word == "add":
                            if kd == "Q" or kd.startswith("item:"):
                                self.err(where, "op-prop", f"add {i}: add objects only")
                            elif i in visible:
                                self.err(where, "op-state", f"add {i}: already drawn")
                            else:
                                visible.add(i)
                                added.add(i)
                                touched.add(i)
                                geo = geo or kd.split(":")[0] in GEOMETRY
                        elif word == "glow":
                            if not self.shown(i, visible):
                                self.err(where, "op-state", f"glow {i}: not drawn now")
                            glow.add(i)
                        else:
                            if i not in visible:
                                self.err(where, "op-state", f"hide {i}: not drawn now")
                            visible.discard(i)
                            touched.add(i)
                elif word == "camera" and t[1:2] == ["all"] and len(t) == 2:
                    pass
                elif word == "camera" and t[1:2] == ["fit"] and len(t) > 2:
                    for i in t[2:]:
                        if not self.shown(i, visible):
                            self.err(where, "op-state", f"camera fit {i}: not drawn now")
                elif word == "param" and len(t) == 3:
                    if not NUM_LIT.match(t[2]):
                        self.err(where, "op-parse", f"{op!r}: param <qid> <number>")
                    elif t[1] not in self.qs or self.qs[t[1]].get("role") != "given":
                        self.err(where, "op-prop", f"{op!r}: param names a given Q")
                    else:
                        params[t[1]] = float(t[2])
                        touched.add(t[1])
                        geo = True
                elif word == "set" and len(t) >= 4:
                    i, prop, value = t[1], t[2], " ".join(t[3:])
                    if self.set_op(where, i, prop, value, visible):
                        sets[(i, prop)] = value
                        touched.add(i)
                        geo = geo or (self.kind(i) or "").split(":")[0] in GEOMETRY
                else:
                    self.err(where, "op-parse", f"{op!r}")
            change.append(touched)
            shown.append(geo)
            reveals.append(any(str(op).split()[:1] in (["add"], ["set"], ["param"]) for op in p.get("ops") or []))
            envs.append(_Env(self, dict(params), dict(sets)))
            self.density(where, visible)
        for i in self.objs:
            if i not in added:
                self.err(i, "unused", f"{i} is never added")
        for k in range(2, n + 1):
            if len(change[k - 1]) > 1:
                self.err(f"step {k}", "one-change", "changes " + " ".join(sorted(change[k - 1])) + " (one per step after the first)")
        if n and not shown[-1]:
            self.err(f"step {n}", "show", "the last step adds or moves geometry, not only math or code")
        if not any(k < n for k in asks):
            self.err("steps", "pull", "ask once before the last step")
        for k in asks:
            if k == n:
                self.err(f"step {k}", "pull", "no ask on the last step")
            elif not reveals[k]:
                self.err(f"step {k + 1}", "pull", "the step after an ask adds, sets or params what was asked")
        return envs

    def shown(self, i, visible):
        return i in visible or (i in self.items and self.items[i][0] in visible)

    def set_op(self, where, i, prop, value, visible):
        kd = self.kind(i)
        if kd is None:
            return self.err(where, "ref", f"set {i}: no such id")
        base = kd.split(":")[0] if not kd.startswith("item:") else kd.split(":")[1]
        allowed = SET_PROPS.get(base, set())
        is_ptr = base == "Cells" and prop.startswith("ptr.") and ID_RE.fullmatch(prop[4:])
        if prop not in allowed and not is_ptr:
            return self.err(where, "op-prop", f"set {i} {prop}: not settable on {kd}")
        if not self.shown(i, visible):
            return self.err(where, "op-state", f"set {i}: not drawn now")
        key = "pos" if prop == "at" else prop
        if (i, key) in self.writers:
            return self.err(where, "rel-conflict", f"set {i} {prop}: {self.writers[(i, key)]} writes it")
        if prop in ("at", "from", "to"):
            return self.place(where, value, None, rel_ok=prop == "to")
        if prop in ("segments", "hl", "tick") or is_ptr:
            if not re.fullmatch(r"\d+(?:\.\d+)?" if is_ptr else r"\d+", value):
                return self.err(where, "op-parse", f"set {i} {prop} {value}: an integer")
            p = self.objs.get(i, (None, {}))[1]
            if prop == "tick" and i in self.ticks and int(value) >= len(self.ticks[i]):
                return self.err(where, "op-prop", f"tick {value}: the trace has {len(self.ticks[i])}")
            if base == "Cells" or (base == "Code" and int(value) > len(p.get("lines") or [])):
                before = len(self.errs)
                if base == "Code":
                    self.err(where, "op-prop", f"hl {value}: no such line")
                elif is_ptr or p.get("kind") != "grid":
                    self.cell_index(i, p, value, name=prop)
                return len(self.errs) == before
            return True
        return self.expr(where, value) is not None

    def density(self, where, visible):
        marks = labels = 0
        for i in visible:
            name, p = self.objs[i]
            marks += 1
            if name in ("Shape", "Link") and (p.get("label") or (name == "Link" and p.get("kind") in ("dimension", "angle") and p.get("q"))):
                labels += 1
            if name == "Axes":
                for k, (ax, kind, rest) in self.items.items():
                    if ax == i:
                        marks += 1
                        labels += kind == "marker" and len(rest.split()) > 2
        if marks > MARKS_MAX or labels > LABELS_MAX:
            self.err(where, "density", f"{marks} marks / {labels} labels (at most {MARKS_MAX} / {LABELS_MAX})")

    # -- values per step, conserve, leaks, voice --
    def check_values(self, envs):
        # livefig adds the mantissa of each hidden value (23.3 -> 2.33); here it is one of the unit variants, which a given may share
        got = set(self.ctx.answers if self.ctx else ())
        answers = {a for a in got if not (1 <= a < 10 and any(b != a and not 1 <= b < 10 and livefig._eq(a, b / 10 ** math.floor(math.log10(b)))
                                                              for b in got))}
        given_qs = [p.get("value") for p in self.qs.values() if p.get("role") == "given" and p.get("value") is not None]
        derived = set()
        for k, env in enumerate([self.env0(), *envs]):
            for i, p in self.qs.items():
                v = self.guard(i, env.__getitem__, i)
                if v is None:
                    continue
                if p.get("role") == "answer" and v != 0 and not any(livefig._eq(abs(v), abs(g)) for g in given_qs):   # a value the problem shows
                    answers.add(abs(v))
                elif p.get("role") == "derived":
                    derived.add(v)
            for i, (name, p) in self.objs.items():
                if name == "Bars" and p.get("conserve") and p.get("total") is not None:
                    vals = [self.guard(i, expr_eval, m.group(2), env) if self.parses(m.group(2)) else None
                            for m in (re.fullmatch(r"\s*([^:]+?)\s*:\s*(.+)", str(x)) for x in p.get("items") or []) if m]
                    tot = self.guard(i, expr_eval, p["total"], env) if self.parses(p["total"]) else None
                    if tot is not None and None not in vals and abs(sum(vals) - tot) > 0.005 * max(abs(tot), 1e-9):
                        self.err(i, "conserve", f"step {k}: items sum to {sum(vals):g}, total {tot:g}")
        return answers, derived

    def check_leaks(self, answers, derived):
        if not self.hidden:
            return
        allowed = set(self.givens)
        for i, p in self.qs.items():
            if p.get("role") in ("given", "derived"):
                for env in self.value_envs:
                    v = self.guard(i, env.__getitem__, i)
                    if v is not None and _hits(v, answers, self.givens):
                        self.err(i, "leak-q", f"{i} = {v:g} is the answer (re-role it as answer)")
                        break
        ok_derived = [d for d in derived if not _hits(d, answers, self.givens)]
        for where, text in self.data + self.words:
            for x in _numbers(text):
                if _hits(x, answers, self.givens):
                    self.err(where, "leak", f"{x:g} is the answer before a solve")
        for where, text in self.words:
            for x in _numbers(text):
                if not _hits(x, answers, self.givens) and not any(livefig._eq(x, g) for g in allowed) and not any(livefig._sig3(x, d) for d in ok_derived):
                    self.err(where, "not-given", f"{x:g} is no given")
        for tid, ticks in self.ticks.items():
            self.ticks[tid] = [re.sub(r"(\w+)=(-?\d+(?:\.\d+)?)", lambda m: f"{m.group(1)}=?" if _hits(float(m.group(2)), answers, self.givens)
                                      else m.group(0), t) for t in ticks]

    def check_voice(self):
        caps = [s["props"].get("cap") or "" for s in self.el["props"].get("steps") or [] if isinstance(s, dict)]
        you = 0
        for k, cap in enumerate(caps, 1):
            for rule, rx in VOICE:
                if rx.search(cap):
                    self.err(f"step {k}", "voice:" + rule, f"{cap!r}")
            first = (re.findall(r"[A-Za-z']+", cap) or [""])[0].lower()
            you += bool(re.search(r"\byou(?:r|rs|rself)?\b", cap, re.I) or cap.rstrip().endswith("?") or first in VERBS)
        if caps and you * 2 < len(caps):
            self.err("steps", "voice:you", f"{you} of {len(caps)} captions talk to the student")

    def caps(self):
        reg = registry()
        for el in _elements(self.el, []):
            comp = reg["components"].get(el.get("typeName"), {})
            for k, v in (el.get("props") or {}).items():
                why = _caps(v, comp.get("props", {}).get(k), f"{el.get('typeName')}.{k}")
                if why:
                    self.err(el["props"].get("id") or el.get("typeName"), "too-long", why)

    def run(self):
        self.caps()
        self.collect()
        self.check_objects()
        self.check_rels()
        self.check_exprs()
        envs = self.check_steps()
        self.value_envs = [self.env0(), *envs]
        answers, derived = self.check_values(envs)
        self.check_leaks(answers, derived)
        self.check_voice()
        return self


class _Env:
    """the values one step sees: Q values (params override givens) and solvable object props (set ops and set relations override geom);
    None = not known without the layout solve (anchors), which propagates"""

    def __init__(self, sc, params, sets):
        self.sc, self.params, self.sets, self.memo, self.busy = sc, params, sets, {}, set()

    def __contains__(self, key):
        if key in self.sc.qs:
            return True
        i, _, prop = key.partition(".")
        k = self.sc.kind(i) or ""
        sk = "Link" if k.startswith("Link:") else k.split(":")[1] if k.startswith("Shape:") else None
        return bool(prop) and sk is not None and prop in REF_PROPS[sk]

    def __getitem__(self, key):
        if key in self.memo:
            return self.memo[key]
        if key in self.busy:
            raise SceneError("rel-cycle", f"{key} depends on itself")
        self.busy.add(key)
        try:
            v = self.value(key)
        finally:
            self.busy.discard(key)
        self.memo[key] = v
        return v

    def value(self, key):
        sc = self.sc
        if key in sc.qs:
            p = sc.qs[key]
            if p.get("role") == "given":
                return self.params.get(key, p.get("value"))
            return expr_eval(p["expr"], self) if p.get("expr") is not None and p.get("role") in ("derived", "answer") else None
        i, _, prop = key.partition(".")
        name, p = sc.objs[i]
        if (i, prop) in sc.rel_sets:
            return expr_eval(sc.rel_sets[(i, prop)], self)
        if prop in ("x", "y"):
            at = self.sets.get((i, "at"), p.get("at"))
            parts = _split_top(str(at), ",") if at is not None else []
            return expr_eval(parts[prop == "y"].strip(), self) if len(parts) == 2 else (0.0 if at is None else None)
        if prop == "len":
            f, t = p.get("from") or "", self.sets.get((i, "to"), p.get("to") or "")
            fp, tp = _split_top(str(f), ","), _split_top(str(t).lstrip("+"), ",")
            if len(fp) != 2 or len(tp) != 2:
                return None
            if str(t).startswith("+"):
                return math.hypot(expr_eval(tp[0], self) or 0, expr_eval(tp[1], self) or 0)
            a, b = [expr_eval(x, self) for x in fp], [expr_eval(x, self) for x in tp]
            return None if None in a + b else math.hypot(b[0] - a[0], b[1] - a[1])
        if (i, prop) in self.sets:
            return expr_eval(self.sets[(i, prop)], self)
        g = _Scene.geom_pairs(p.get("geom") or "") or {}
        if prop in g:
            return float(g[prop]) if prop == "segments" and g[prop].isdigit() else expr_eval(g[prop], self)
        return DEFAULTS.get(prop)


def scene_check(steps_el, ctx, stage="wrong"):
    """(errors, ticks) for one Steps whose fig is a Scene: errors = ["<where>: <code>: <detail>", ...] (empty = good), ticks = the
    server-filled Trace ticks {trace id: [tick, ...]} (answer values masked before a solve)"""
    s = _Scene(steps_el, ctx, stage)
    try:
        s.run()
    except Exception as e:  # noqa: BLE001  (model text that trips the checker is a dropped scene, never a 500)
        print("views_gate: scene check crash:", type(e).__name__, file=sys.stderr)
        s.err("scene", "schema", f"unreadable scene ({type(e).__name__})")
    return [f"{w}: {c}: {d}" for w, c, d in s.errs], s.ticks


def _scene_steps(el):
    fig = (el.get("props") or {}).get("fig") if isinstance(el, dict) else None
    return el.get("typeName") == "Steps" and isinstance(fig, dict) and fig.get("typeName") == "Scene"


def scene_errors(body, ctx, stage="wrong"):
    """every error of every scene stepper in one fence body (what the repair round sends back), [] when none fails"""
    try:
        res = oui.parse(body, catalog(), "View")
    except Exception as e:  # noqa: BLE001
        return [f"root: parse: {type(e).__name__}"]
    errs = {}
    for e in res["meta"]["errors"]:
        errs.setdefault(e.get("statementId"), f"{e.get('code') or 'schema'} {e.get('path', '')}".strip())
    out = []
    kids = ((res.get("root") or {}).get("props") or {}).get("children") or []
    for k in kids:
        if isinstance(k, dict) and _scene_steps(k):
            for el in _elements(k, []):
                sid = el.get("statementId")
                if sid in errs:
                    out.append(f"{sid}: schema: {errs[sid]}")
            out += scene_check(k, ctx, stage)[0]
    return out


def _call_spans(src, name):
    """(start, end) of every `name(...)` call in src outside string literals"""
    out, i, n, quote = [], 0, len(src), None
    while i < n:
        c = src[i]
        if quote:
            i += 2 if c == "\\" else 1
            quote = None if c == quote else quote
            continue
        if c in "\"'":
            quote = c
        elif src.startswith(name + "(", i) and (i == 0 or not (src[i - 1].isalnum() or src[i - 1] == "_")):
            j, depth, q = i + len(name), 0, None
            while j < n:
                d = src[j]
                if q:
                    j += 2 if d == "\\" else 1
                    q = None if d == q else q
                    continue
                if d in "\"'":
                    q = d
                elif d == "(":
                    depth += 1
                elif d == ")":
                    depth -= 1
                    if depth == 0:
                        break
                j += 1
            out.append((i, j + 1))
            i = j + 1
            continue
        i += 1
    return out


def _fill_ticks(raw, traces):
    """raw statement text with every Trace(...) of `traces` ({id: (code, vars, ticks)}) rewritten with the server's ticks"""
    for a, b in reversed(_call_spans(raw, "Trace")):
        m = re.match(r'Trace\(\s*"([^"]*)"', raw[a:b])
        if m and m.group(1) in traces:
            code, vars_, ticks = traces[m.group(1)]
            call = f"Trace({json.dumps(m.group(1))}, {json.dumps(code)}, {json.dumps(vars_)}, {json.dumps(ticks, ensure_ascii=False)})"
            raw = raw[:a] + call + raw[b:]
    return raw


def repair(body, ctx, fix, stage="wrong"):
    """gate one fence; a failing scene gets ONE repair round: fix(body, errors≤10) -> a new body (the server's model call). Still
    failing (or no new body): the first gate's result stands, i.e. the scene stepper is dropped and the reply goes out text only."""
    prog, log = gate(body, ctx, stage)
    errs = scene_errors(body, ctx, stage)
    if not errs:
        return prog, log
    new = fix(body, errs[:REPAIR_MAX])
    if isinstance(new, str) and new.strip() and not scene_errors(new, ctx, stage):
        p2, l2 = gate(new, ctx, stage)
        if p2 is not None:
            return p2, l2 + ["repaired"]
    return prog, log + ["scene-text-only"]


def _source(stmts, root_kids):
    return "\n".join([f"root = View([{', '.join(root_kids)}])"] + [raw for sid, raw in stmts])


def gate(body, ctx, stage="wrong"):
    """(program text, log codes) for one closed ```openui fence body; program None = the whole fence is dropped. stage = pre | wrong |
    post, set by the server (never the model): before a solve a scene shows no answer number"""
    if ctx is None:
        return None, ["off"]
    if len(body) > livefig.FENCE_MAX:
        return None, ["size"]
    try:
        cat = catalog()
        stmts = oui._statements(oui.strip_comments(body))
    except Exception as e:  # noqa: BLE001  (a parser crash on model text is a dropped fence, never a 500)
        print("views_gate: parse crash:", type(e).__name__, file=sys.stderr)
        return None, ["parse"]
    ids = [sid for sid, _, _ in stmts]
    if "root" not in ids or len(set(ids)) != len(ids):
        return None, ["root"]
    raw = {sid: r for sid, _, r in stmts}
    try:
        res = oui.parse(body, cat, "View")
    except Exception as e:  # noqa: BLE001
        print("views_gate: parse crash:", type(e).__name__, file=sys.stderr)
        return None, ["parse"]
    root = res.get("root")
    if not root or root.get("typeName") != "View" or res.get("stateDeclarations") or res.get("queryStatements") or res.get("mutationStatements"):
        return None, ["root"]                           # profile stem: no $state, Query, Mutation in a chat figure
    errs = {}
    for e in res["meta"]["errors"]:
        errs.setdefault(e.get("statementId"), e.get("code") or "schema")
    if "root" in errs:
        return None, ["root"]
    kids = root["props"].get("children") or []
    if any(not isinstance(k, dict) or k.get("statementId") in (None, "root") for k in kids):
        return None, ["root"]                           # the root lists statement refs only (one boundary each)
    log, keep, traces = [], [], {}
    for k in kids:
        sid = k["statementId"]
        why = errs.get(sid)
        if _scene_steps(k):
            for el in _elements(k, []):
                why = why or errs.get(el.get("statementId"))
            if not why:
                problems, ticks = scene_check(k, ctx, stage)
                why = "scene:" + problems[0].split(": ")[1] if problems else None
                traces.update({el["props"]["id"]: (el["props"].get("code"), el["props"].get("vars"), ticks[el["props"]["id"]])
                               for el in _elements(k, []) if el.get("typeName") == "Trace" and el["props"].get("id") in ticks})
        for el in [] if _scene_steps(k) else _elements(k, []):
            why = why or errs.get(el.get("statementId")) or check_element(el, ctx)
        if why:
            log.append(f"{sid}:{why}")
        else:
            keep.append(sid)
    log += [f"{sid}:{code}" for sid, code in errs.items() if sid not in keep and not any(x.startswith(f"{sid}:") for x in log)]
    if not keep:
        return None, log + ["empty"]
    used = {el.get("statementId") for k in kids if k["statementId"] in keep for el in _elements(k, [])}
    prog = _source([(sid, _fill_ticks(raw[sid], traces) if traces else raw[sid]) for sid in ids if sid in used and sid != "root"], keep)
    again = oui.parse(prog, cat, "View")                # what goes out parses clean (proof the drop left nothing dangling)
    if again["meta"]["errors"] or again["meta"]["unresolved"] or not again.get("root"):
        return None, log + ["reparse"]
    return prog, log or ["ok"]


class Fence(livefig.Fence):
    """livefig.Fence plus the ```openui branch: same hold-until-closed stream, one figure per reply across ```fig and ```openui.
    stage = the server's reveal stage for a scene (default wrong = fail closed)"""

    def __init__(self, ctx, stage="wrong"):
        super().__init__(ctx)
        self.stage = stage

    def _block(self, lang, body):
        if lang != "openui":
            return super()._block(lang, body)
        if self.ctx is None or not on():
            return self.log.append("views-off") or ""
        if self.shown:
            return self.log.append("second") or ""
        prog, why = gate(body, self.ctx, self.stage)
        self.log.append("oui:" + ",".join(why))
        if prog is None:
            return ""
        self.shown += 1
        return "\n```openui\n" + prog + "\n```\n"
