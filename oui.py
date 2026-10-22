"""OpenUI Lang 1.0 for the server gate (render plan v2, Part A; sprint box P0.5): stdlib only, no JS engine on the Python function.
A port of the vendored lang-core 1.0.1 (vendor/openui-lang.mjs, tools/openui/build.sh): lexer, statement split, auto-close,
expressions, schema-aware materialize + validation, the stream-end evaluator, patch merge and the streaming parser's
completed-statement scan. Same AST and result shapes as upstream (dicts with the same keys), so a gate log reads like theirs.
Proof it agrees: tests/test_oui.py runs every spec fixture (tests/fixtures/openui/1.0) here and diffs the canonical result with the
JS parser's on the same text (node tests/openui-canon.mjs), and with expected.json.
Not ported: the serializer (jsonToOpenUI), the prompt generator (build time, Node), Query/Mutation fetching (Query runs server side
in the engine, V2 amended), validation-rule checks of form inputs (validation.json; the browser's job).
JS semantics are kept where a value can differ: loose ==, toNumber, String(number), member access, sort. Sort's localeCompare is
approximated (accents and case as tie-breaks, like ICU root for Latin text; no other locale rules)."""
import json
import math
import re
import unicodedata
from decimal import Decimal
from functools import cmp_to_key

# ── JS value semantics ───────────────────────────────────────────────────────────────────────────────────────────────────────
JS_WS = "\t\n\v\f\r                  　﻿"
NUM_RE = re.compile(r"[+-]?(?:\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)")
# Slot convention (views/registry.json "slot"): a student-facing string may be exactly "$t.<id>". It is a plain string here, so
# validation takes it wherever a string is allowed (no change to the upstream port); the gate's cap and copy checks skip it
# (views.js fills it and caps the filled text). Keep in step with registry slot.id and views.js SLOT.
SLOT_RE = re.compile(r"\$t\.([a-z][a-z0-9_]{0,31})")


def slot_id(v):
    """The id of a "$t.<id>" slot string, else None."""
    m = SLOT_RE.fullmatch(v) if isinstance(v, str) else None
    return m.group(1) if m else None


def trim(s):
    return s.strip(JS_WS)


def is_num(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def js_number(s):
    """Number(string): "" -> 0, " 12 " -> 12, "0x1A" -> 26, "abc" -> NaN"""
    s = trim(s)
    if not s:
        return 0.0
    if NUM_RE.fullmatch(s):
        return float(s)
    if s in ("Infinity", "+Infinity", "-Infinity"):
        return -math.inf if s[0] == "-" else math.inf
    m = re.fullmatch(r"0([xXoObB])([0-9a-fA-F]+)", s)
    if m:
        try:
            return float(int(m.group(2), {"x": 16, "o": 8, "b": 2}[m.group(1).lower()]))
        except ValueError:
            return math.nan
    return math.nan


def to_number(v):
    """builtins.ts toNumber: numbers as they are, numeric strings parsed (else 0), booleans 1/0, anything else 0"""
    if isinstance(v, bool):
        return 1.0 if v else 0.0
    if is_num(v):
        return float(v)
    if isinstance(v, str):
        n = js_number(v)
        return 0.0 if n != n else n
    return 0.0


def num_str(x):
    """String(number), ECMAScript Number::toString: 2 -> "2", 1e21 -> "1e+21", 1.5e-7 -> "1.5e-7" """
    x = float(x)
    if x != x:
        return "NaN"
    if math.isinf(x):
        return "Infinity" if x > 0 else "-Infinity"
    if x == 0:
        return "0"
    if x < 0:
        return "-" + num_str(-x)
    _, digits, exp = Decimal(repr(x)).normalize().as_tuple()   # repr = the shortest round-trip digits, as in JS
    d, k = "".join(map(str, digits)), len(digits)
    n = k + exp                                             # value = 0.d * 10^n
    if k <= n <= 21:
        return d + "0" * (n - k)
    if 0 < n <= 21:
        return d[:n] + "." + d[n:]
    if -6 < n <= 0:
        return "0." + "0" * -n + d
    e = n - 1
    return (d if k == 1 else d[0] + "." + d[1:]) + "e" + ("+" if e >= 0 else "-") + str(abs(e))


def js_str(v):
    """String(v)"""
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    if is_num(v):
        return num_str(v)
    if isinstance(v, str):
        return v
    if isinstance(v, list):
        return ",".join("" if e is None else js_str(e) for e in v)
    return "[object Object]"


def truthy(v):
    if v is None:
        return False
    if isinstance(v, bool):
        return v
    if is_num(v):
        return not (v == 0 or v != v)
    if isinstance(v, str):
        return v != ""
    return True


def loose_eq(a, b):
    """a == b in JS (null == undefined only; numbers vs strings vs booleans coerce; objects by identity or as strings)"""
    if a is None or b is None:
        return a is None and b is None
    if isinstance(a, bool) and isinstance(b, bool):
        return a == b
    if isinstance(a, bool):
        return loose_eq(1.0 if a else 0.0, b)
    if isinstance(b, bool):
        return loose_eq(a, 1.0 if b else 0.0)
    if is_num(a) and is_num(b):
        return float(a) == float(b)
    if isinstance(a, str) and isinstance(b, str):
        return a == b
    if is_num(a) and isinstance(b, str):
        return float(a) == js_number(b)
    if isinstance(a, str) and is_num(b):
        return js_number(a) == float(b)
    a_obj, b_obj = isinstance(a, (list, dict)), isinstance(b, (list, dict))
    if a_obj and b_obj:
        return a is b
    if a_obj:
        return loose_eq(js_str(a), b)
    if b_obj:
        return loose_eq(a, js_str(b))
    return False


def strict_in(v, xs):
    """xs.includes(v): no bool/number mixing"""
    for x in xs:
        if is_num(v) and is_num(x):
            if float(v) == float(x):
                return True
        elif type(v) is type(x) and v == x:
            return True
    return False


def get_prop(obj, key):
    """obj[key] for a string key; None for undefined"""
    if isinstance(obj, dict):
        return obj.get(key)
    if isinstance(obj, (list, str)):
        if key == "length":
            return len(obj)
        if re.fullmatch(r"0|[1-9]\d*", key) and int(key) < len(obj):
            return obj[int(key)]
    return None


def js_type(v):
    """typeof, plus "array" (validation.ts jsType)"""
    if v is None:
        return "object"
    if isinstance(v, bool):
        return "boolean"
    if is_num(v):
        return "number"
    if isinstance(v, str):
        return "string"
    if isinstance(v, list):
        return "array"
    return "object"


def _typeof(v):
    t = js_type(v)
    return "object" if t == "array" else t


def _collate_key(s):
    """localeCompare stand-in: letters by base letter, then accents, then lower before upper; spaces/punctuation < digits < letters"""
    prim, sec, ter = [], [], []
    for c in s:
        base = unicodedata.normalize("NFD", c)
        b = "".join(x for x in base if not unicodedata.combining(x)) or c
        cls = 2 if b.isalpha() else 1 if b.isdigit() else 0
        prim.append((cls, b.casefold()))
        sec.append(len(base) - len(b))
        ter.append(0 if b == b.lower() else 1)
    return prim, sec, ter


def locale_compare(a, b):
    ka, kb = _collate_key(a), _collate_key(b)
    return (ka > kb) - (ka < kb)


def json_dumps(v):
    """JSON.stringify for messages (NaN -> null)"""
    return json.dumps(plain(v), ensure_ascii=False, separators=(",", ":"))


def plain(v):
    """What JSON.parse(JSON.stringify(v)) gives: NaN/Infinity -> null, ints for integral numbers"""
    if isinstance(v, bool) or v is None or isinstance(v, str):
        return v
    if is_num(v):
        if v != v or math.isinf(v):
            return None
        return int(v) if float(v).is_integer() and abs(v) < 2 ** 53 else float(v)
    if isinstance(v, list):
        return [plain(x) for x in v]
    if isinstance(v, dict):
        return {k: plain(x) for k, x in v.items()}
    return None


# ── Lexer (lexer.ts) ─────────────────────────────────────────────────────────────────────────────────────────────────────────
PUNCT = {"(": "(", ")": ")", "[": "[", "]": "]", "{": "{", "}": "}", ",": ",", ":": ":", ".": ".", "?": "?", "+": "+", "*": "*",
         "/": "/", "%": "%"}
TWO = {"=": ("==", "="), "!": ("!=", "!"), ">": (">=", ">"), "<": ("<=", "<")}
AFTER_VALUE = {"num", "str", "ident", "type", ")", "]", "true", "false", "null", "state", "@"}


def _word(c):
    return "a" <= c <= "z" or "A" <= c <= "Z" or "0" <= c <= "9" or c == "_"


def _alpha(c):
    return "a" <= c <= "z" or "A" <= c <= "Z" or c == "_"


def tokenize(src):
    """-> [(type, value)], ending with ("eof", None)"""
    toks, i, n = [], 0, len(src)
    while i < n:
        while i < n and src[i] in " \t\r":
            i += 1
        if i >= n:
            break
        c = src[i]
        if c == "\n":
            toks.append(("nl", None)); i += 1; continue
        if c in PUNCT:
            toks.append((PUNCT[c], None)); i += 1; continue
        if c in TWO:
            two = i + 1 < n and src[i + 1] == "="
            toks.append((TWO[c][0] if two else TWO[c][1], None)); i += 2 if two else 1; continue
        if c in "&|":
            two = i + 1 < n and src[i + 1] == c
            toks.append(("&&" if c == "&" else "||", None)); i += 2 if two else 1; continue
        if c == '"':
            start, i, closed = i, i + 1, False
            while i < n:
                if src[i] == "\\":
                    i += 2
                elif src[i] == '"':
                    i += 1; closed = True; break
                else:
                    i += 1
            raw = src[start:i]
            try:
                v = json.loads(raw if closed else raw + '"')
                if not isinstance(v, str):
                    raise ValueError
            except ValueError:
                v = re.sub(r'^"|"$', "", raw)
            toks.append(("str", v)); continue
        if c == "'":
            i += 1
            out = []
            while i < n:
                if src[i] == "\\":
                    i += 1
                    if i < n:
                        out.append({"'": "'", "\\": "\\", "n": "\n", "t": "\t"}.get(src[i], src[i])); i += 1
                elif src[i] == "'":
                    i += 1; break
                else:
                    out.append(src[i]); i += 1
            toks.append(("str", "".join(out))); continue
        if c == "-":
            prev = toks[-1][0] if toks else None
            if prev in AFTER_VALUE or not (i + 1 < n and "0" <= src[i + 1] <= "9"):
                toks.append(("-", None)); i += 1; continue
        if "0" <= c <= "9" or c == "-":
            start = i
            if src[i] == "-":
                i += 1
            while i < n and "0" <= src[i] <= "9":
                i += 1
            if i < n and src[i] == "." and i + 1 < n and "0" <= src[i + 1] <= "9":
                i += 1
                while i < n and "0" <= src[i] <= "9":
                    i += 1
            if i < n and src[i] in "eE":
                i += 1
                if i < n and src[i] in "+-":
                    i += 1
                while i < n and "0" <= src[i] <= "9":
                    i += 1
            toks.append(("num", js_number(src[start:i]))); continue
        if c in "$@" and i + 1 < n and _alpha(src[i + 1]):
            start = i
            i += 1
            while i < n and _word(src[i]):
                i += 1
            toks.append(("state", src[start:i]) if c == "$" else ("@", src[start + 1:i])); continue
        if _alpha(c):
            start = i
            while i < n and _word(src[i]):
                i += 1
            w = src[start:i]
            if w in ("true", "false", "null"):
                toks.append((w, None))
            else:
                toks.append(("type" if "A" <= c <= "Z" else "ident", w))
            continue
        i += 1                                              # any other character (#, emoji)
    toks.append(("eof", None))
    return toks


# ── Statements (statements.ts) ───────────────────────────────────────────────────────────────────────────────────────────────
CLOSE = {"(": ")", "[": "]", "{": "}"}


def auto_close(text):
    """close an unclosed string and brackets (streaming) -> (text, was_incomplete)"""
    stack, in_str, esc = [], None, False
    for c in text:
        if esc:
            esc = False; continue
        if c == "\\" and in_str:
            esc = True; continue
        if in_str:
            if c == in_str:
                in_str = None
            continue
        if c in "\"'":
            in_str = c; continue
        if c in CLOSE:
            stack.append(c)
        elif stack and c == CLOSE[stack[-1]]:
            stack.pop()
    if not in_str and not stack:
        return text, False
    out = text
    if in_str:
        out += ("\\" if esc else "") + in_str
    return out + "".join(CLOSE[s] for s in reversed(stack)), True


def split(toks):
    """`name = expr` statements, one per depth-0 newline (a line starting with ? or a ternary's : continues) -> [(id, id_type, tokens)]"""
    stmts, pos, n = [], 0, len(toks)
    while pos < n:
        while pos < n and toks[pos][0] == "nl":
            pos += 1
        if pos >= n or toks[pos][0] == "eof":
            break
        t, v = toks[pos]
        if t not in ("ident", "type", "state") or pos + 1 >= n or toks[pos + 1][0] != "=":
            pos += 1 if t in ("ident", "type", "state") else 0
            while pos < n and toks[pos][0] not in ("nl", "eof"):
                pos += 1
            continue
        pos += 2
        expr, depth, tern = [], 0, 0
        while pos < n and toks[pos][0] != "eof":
            tt = toks[pos][0]
            if tt == "nl" and depth <= 0 and tern <= 0:
                peek = pos + 1
                while peek < n and toks[peek][0] == "nl":
                    peek += 1
                nxt = toks[peek][0] if peek < n else "eof"
                if nxt == "?" or (nxt == ":" and tern > 0):
                    pos += 1; continue
                break
            if tt == "nl":
                pos += 1; continue
            if tt in "([{":
                depth += 1
            elif tt in ")]}" and depth > 0:
                depth -= 1
            elif tt == "?" and depth == 0:
                tern += 1
            elif tt == ":" and depth == 0 and tern > 0:
                tern -= 1
            expr.append(toks[pos]); pos += 1
        if expr:
            stmts.append((v, t, expr))
    return stmts


# ── Expressions (expressions.ts, Pratt) ──────────────────────────────────────────────────────────────────────────────────────
PREC = {"?": 1, "||": 2, "&&": 3, "==": 4, "!=": 4, ">": 5, "<": 5, ">=": 5, "<=": 5, "+": 6, "-": 6, "*": 7, "/": 7, "%": 7,
        ".": 9, "[": 9}
BINOPS = {"+", "-", "*", "/", "%", "==", "!=", ">", "<", ">=", "<=", "&&", "||"}


def parse_expression(toks):
    pos = [0]
    eof = ("eof", None)

    def cur(k=0):
        j = pos[0] + k
        return toks[j] if j < len(toks) else eof

    def adv():
        t = cur(); pos[0] += 1; return t

    def eat(kind):
        if cur()[0] == kind:
            pos[0] += 1

    def expr(min_prec=0):
        left = prefix()
        while PREC.get(cur()[0], 0) > min_prec:
            left = infix(left)
        return left

    def key_of(t):
        if t[0] in ("ident", "type", "str"):
            return t[1]
        if t[0] == "num":
            return num_str(t[1])
        if t[0] == "state":
            return t[1][1:]
        return "?"

    def prefix():
        t, v = cur()
        if t == "str":
            adv(); return {"k": "Str", "v": v}
        if t == "num":
            adv(); return {"k": "Num", "v": v}
        if t in ("true", "false"):
            adv(); return {"k": "Bool", "v": t == "true"}
        if t == "null":
            adv(); return {"k": "Null"}
        if t == "[":
            adv()
            els = []
            while cur()[0] not in ("]", "eof"):
                els.append(expr(0))
                if cur()[0] == ",":
                    adv()
            eat("]")
            return {"k": "Arr", "els": els}
        if t == "{":
            adv()
            entries = []
            while cur()[0] not in ("}", "eof"):
                key = key_of(adv())
                eat(":")
                entries.append([key, expr(0)])
                if cur()[0] == ",":
                    adv()
            eat("}")
            return {"k": "Obj", "entries": entries}
        if t == "state":
            adv()
            if cur()[0] == "=":
                adv(); return {"k": "Assign", "target": v, "value": expr(0)}
            return {"k": "StateRef", "n": v}
        if t == "type":
            if cur(1)[0] == "(" and (not is_builtin(v) or v == "Action"):
                return comp()
            adv(); return {"k": "Ref", "n": v}
        if t == "@":
            if cur(1)[0] == "(":
                call = comp()
                if not is_builtin(call["name"]):
                    call["fn"] = True
                return call
            adv(); return {"k": "Ref", "n": v}
        if t == "ident":
            adv(); return {"k": "Ref", "n": v}
        if t in ("!", "-"):
            adv(); return {"k": "UnaryOp", "op": t, "operand": expr(8)}
        if t == "(":
            adv()
            inner = expr(0)
            eat(")")
            return inner
        adv()
        return {"k": "Null"}

    def infix(left):
        t = cur()[0]
        if t in BINOPS:
            adv(); return {"k": "BinOp", "op": t, "left": left, "right": expr(PREC[t])}
        if t == "?":
            adv()
            then = expr(0)
            eat(":")
            return {"k": "Ternary", "cond": left, "then": then, "else": expr(0)}
        if t == ".":
            adv()
            return {"k": "Member", "obj": left, "field": key_of(adv())}
        if t == "[":
            adv()
            index = expr(0)
            eat("]")
            return {"k": "Index", "obj": left, "index": index}
        return left

    def comp():
        name = adv()[1]
        eat("(")
        args = []
        while cur()[0] not in (")", "eof"):
            args.append(expr(0))
            if cur()[0] == ",":
                adv()
        eat(")")
        return {"k": "Comp", "name": name, "args": args}

    return expr(0)


AST_KINDS = {"Comp", "Ref", "StateRef", "RuntimeRef", "BinOp", "UnaryOp", "Ternary", "Member", "Index", "Assign", "Str", "Num",
             "Bool", "Null", "Arr", "Obj", "Ph"}
RUNTIME_KINDS = {"StateRef", "RuntimeRef", "BinOp", "UnaryOp", "Ternary", "Member", "Index", "Assign"}


def is_ast(v):
    return isinstance(v, dict) and v.get("k") in AST_KINDS


def is_element(v):
    return (isinstance(v, dict) and v.get("type") == "element" and isinstance(v.get("typeName"), str)
            and isinstance(v.get("props"), dict) and isinstance(v.get("partial"), bool))


def walk(node, visit):
    visit(node)
    k = node["k"]
    kids = {"Comp": lambda: node["args"] + list((node.get("mappedProps") or {}).values()), "Arr": lambda: node["els"],
            "Obj": lambda: [e[1] for e in node["entries"]], "BinOp": lambda: [node["left"], node["right"]],
            "UnaryOp": lambda: [node["operand"]], "Ternary": lambda: [node["cond"], node["then"], node["else"]],
            "Member": lambda: [node["obj"]], "Index": lambda: [node["obj"], node["index"]], "Assign": lambda: [node["value"]]}.get(k)
    for c in (kids() if kids else []):
        walk(c, visit)


def to_literal_ast(v):
    if v is None:
        return {"k": "Null"}
    if isinstance(v, str):
        return {"k": "Str", "v": v}
    if isinstance(v, bool):
        return {"k": "Bool", "v": v}
    if is_num(v):
        return {"k": "Num", "v": v}
    if isinstance(v, list):
        return {"k": "Arr", "els": [to_literal_ast(x) for x in v]}
    if isinstance(v, dict):
        return {"k": "Obj", "entries": [[k, to_literal_ast(x)] for k, x in v.items()]}
    return {"k": "Null"}


NOLIT = object()


def literal_value(node):
    """the plain value of a literal AST, NOLIT for a ref or call"""
    k = node["k"]
    if k in ("Str", "Num", "Bool"):
        return node["v"]
    if k == "Null":
        return None
    if k == "Arr":
        out = [literal_value(e) for e in node["els"]]
        return NOLIT if any(x is NOLIT for x in out) else out
    if k == "Obj":
        out = {key: literal_value(e) for key, e in node["entries"]}
        return NOLIT if any(x is NOLIT for x in out.values()) else out
    return NOLIT


# ── Built-ins (builtins.ts) ──────────────────────────────────────────────────────────────────────────────────────────────────
def _field(obj, path):
    if not path or obj is None:
        return None
    for p in path.split("."):
        if obj is None:
            return None
        obj = get_prop(obj, p)
    return obj


def _sort(a):
    arr, field, direction = a.get("array"), a.get("field"), a.get("direction")
    if not isinstance(arr, list):
        return arr
    f = "" if field is None else js_str(field)
    desc = ("asc" if direction is None else js_str(direction)) == "desc"

    def numeric(v):
        return is_num(v) or (isinstance(v, str) and v != "" and js_number(v) == js_number(v))

    def cmp(x, y):
        av, bv = (_field(x, f), _field(y, f)) if f else (x, y)
        if numeric(av) and numeric(bv):
            d = to_number(av) - to_number(bv)
            c = (d > 0) - (d < 0)
        else:
            c = locale_compare("" if av is None else js_str(av), "" if bv is None else js_str(bv))
        return -c if desc else c
    return sorted(arr, key=cmp_to_key(cmp))


def _filter(a):
    arr, f, o, value = a.get("array"), a.get("field"), a.get("operator"), a.get("value")
    if not isinstance(arr, list):
        return []
    f = "" if f is None else js_str(f)
    o = "==" if o is None else js_str(o)

    def keep(item):
        v = _field(item, f) if f else item
        if o == "==":
            return loose_eq(v, value)
        if o == "!=":
            return not loose_eq(v, value)
        if o in (">", "<", ">=", "<="):
            x, y = to_number(v), to_number(value)
            return {">": x > y, "<": x < y, ">=": x >= y, "<=": x <= y}[o]
        if o == "contains":
            return ("" if value is None else js_str(value)) in ("" if v is None else js_str(v))
        return False
    return [x for x in arr if keep(x)]


def _sum(xs):
    return sum((to_number(x) for x in xs), 0.0)


def _round(a):
    num = to_number(a.get("number"))
    d = to_number(a["decimals"]) if a.get("decimals") is not None else 0.0
    try:
        factor = 10.0 ** d
        x = num * factor
        return (math.floor(x + 0.5) if math.isfinite(x) else x) / factor if factor else math.nan
    except (OverflowError, ZeroDivisionError):
        return math.nan


def _int_op(fn):
    def run(a):
        x = to_number(a.get("number"))
        return float(fn(x)) if math.isfinite(x) else x
    return run


def _arr(a, key="array"):
    v = a.get(key)
    return v if isinstance(v, list) else None


BUILTINS = {
    "Count": (["array"], lambda a: len(_arr(a)) if _arr(a) is not None else 0),
    "First": (["array"], lambda a: _arr(a)[0] if _arr(a) else None),
    "Last": (["array"], lambda a: _arr(a)[-1] if _arr(a) else None),
    "Sum": (["numbers"], lambda a: _sum(_arr(a, "numbers")) if _arr(a, "numbers") is not None else 0),
    "Avg": (["numbers"], lambda a: _sum(_arr(a, "numbers")) / len(_arr(a, "numbers")) if _arr(a, "numbers") else 0),
    "Min": (["numbers"], lambda a: min(to_number(x) for x in _arr(a, "numbers")) if _arr(a, "numbers") else 0),
    "Max": (["numbers"], lambda a: max(to_number(x) for x in _arr(a, "numbers")) if _arr(a, "numbers") else 0),
    "Sort": (["array", "field", "direction"], _sort),
    "Filter": (["array", "field", "operator", "value"], _filter),
    "Round": (["number", "decimals"], _round),
    "Abs": (["number"], lambda a: abs(to_number(a.get("number")))),
    "Floor": (["number"], _int_op(math.floor)),
    "Ceil": (["number"], _int_op(math.ceil)),
    "Each": (["array", "varName", "template"], None),       # lazy: the evaluator runs it on raw args
}
STEPS = {"Run": ["ref"], "ToAssistant": ["message", "context"], "OpenUrl": ["url"], "Set": ["variable", "value"], "Reset": ["variable"]}
LAZY = {"Each", "Run", "Set", "Reset", "Action"}
ACTION_STEPS = {"Run": "run", "ToAssistant": "continue_conversation", "OpenUrl": "open_url", "Set": "set", "Reset": "reset"}
ACTION_DEFS = ("ActionExpression", "OpenUrl", "ToAssistant")
RESERVED = ("Query", "Mutation")


def _pdefs(names):
    return [{"name": n, "required": False, "default": NOLIT, "schema": None} for n in names]


BUILTIN_CALLS = {**{n: {"kind": "function", "params": _pdefs(p), "builtin": True, "lazy": n in LAZY} for n, (p, _) in BUILTINS.items()},
                 **{n: {"kind": "action", "params": _pdefs(p), "builtin": True, "lazy": n in LAZY} for n, p in STEPS.items()},
                 "Action": {"kind": "action", "params": [{"name": "steps", "required": True, "default": NOLIT, "schema": None}],
                            "builtin": True, "lazy": True}}


def is_builtin(name):
    return name in BUILTIN_CALLS


def is_step(name, actions=None):
    d = BUILTIN_CALLS.get(name)
    return (d is not None and d["kind"] == "action") or bool(actions and name in actions)


# ── Library schema (parser.ts compileSchema) ─────────────────────────────────────────────────────────────────────────────────
def schema_default(prop):
    """a JSON Schema fragment's `default`, NOLIT when it has none"""
    return prop.get("default", NOLIT) if isinstance(prop, dict) else NOLIT


def _inline_refs(node, defs):
    if not isinstance(node, (dict, list)):
        return node
    if isinstance(node, dict) and isinstance(node.get("$ref"), str):
        return _inline_refs(defs[node["$ref"]], defs) if node["$ref"] in defs else node
    items = node.items() if isinstance(node, dict) else enumerate(node)
    copy = dict(node) if isinstance(node, dict) else list(node)
    changed = False
    for key, value in items:
        copy[key] = _inline_refs(value, defs)
        changed = changed or copy[key] is not value
    return copy if changed else node


def _params(d, defs):
    props, req = d.get("properties") or {}, d.get("required") or []
    return [{"name": k, "required": k in req, "default": schema_default(p), "schema": _inline_refs(p, defs) if defs else p}
            for k, p in props.items()]


class Catalog(dict):
    """component name -> [param defs] (positional order = key order), plus .calls: built-ins + library functions and actions"""
    calls = BUILTIN_CALLS


def compile_schema(schema):
    cat = Catalog()
    comps = set(schema["properties"]) if isinstance(schema.get("properties"), dict) else None
    sdefs = schema.get("$defs") or {}
    defs = {}
    for name in [*ACTION_DEFS, *(schema.get("actions") or {})]:
        if name in sdefs and not (comps and name in comps):
            defs["#/$defs/" + name] = sdefs[name]
    for name, d in sdefs.items():
        if (name not in comps) if comps is not None else ("#/$defs/" + name in defs):
            continue
        cat[name] = _params(d, defs)
    cat.calls = dict(BUILTIN_CALLS)
    for name, fn in (schema.get("functions") or {}).items():
        cat.calls[name] = {"kind": "function", "params": _params(fn["params"], defs), "builtin": False, "lazy": False}
    for name, act in (schema.get("actions") or {}).items():
        cat.calls[name] = {"kind": "action", "params": _params(act["params"], defs), "builtin": False, "lazy": False}
    return cat


# ── Validation (validation.ts) ───────────────────────────────────────────────────────────────────────────────────────────────
INVALID = object()
OMIT = object()                                             # JS undefined where it means "drop this key"


class Ctx:
    """MaterializeCtx"""
    def __init__(self, syms=None, cat=None, partial=False, current=None, unreached=None):
        self.syms, self.cat, self.partial, self.current, self.unreached = syms or {}, cat, partial, current, unreached
        self.errors, self.unres, self.visited = [], [], set()

    def calls(self):
        return self.cat.calls if self.cat is not None else BUILTIN_CALLS


def _ref_name(s):
    return s["$ref"].split("/")[-1] if isinstance(s.get("$ref"), str) else None


def _composite(s):
    return any(k in s for k in ("$ref", "anyOf", "oneOf", "allOf"))


def _leaf(s):
    if isinstance(s.get("enum"), list):
        return None, s["enum"]
    if "const" in s:
        return None, [s["const"]]
    return {"string": "string", "number": "number", "integer": "number", "boolean": "boolean"}.get(s.get("type")), None


def _type_of_schema(p):
    if not isinstance(p, dict):
        return None
    ref = _ref_name(p)
    if ref:
        return ref
    typ, enum = _leaf(p)
    if enum is not None:
        return "|".join(json_dumps(v) for v in enum)
    return typ or (p.get("type") if isinstance(p.get("type"), str) else None)


def params_signature(component, params):
    parts = []
    for p in params:
        t = _type_of_schema(p["schema"])
        m = p["name"] + "*" if p["required"] else p["name"]
        parts.append(f"{m}: {t}" if t else m)
    return f"{component}({', '.join(parts)})"


def _message(component, path, code, x):
    if code == "type-mismatch":
        return f'field "{path}" expects {x["expected"]} but got {x["actual"]}'
    if code in ("missing-required", "null-required"):
        sig = f' — signature: {x["signature"]}' if x.get("signature") else ""
        return (f'missing required field "{path}"' if code == "missing-required" else f'required field "{path}" cannot be null') + sig
    if code == "unknown-component":
        av = x.get("available")
        return f'Unknown component "{component}" — not found in catalog or builtins' + (f'. Available components: {", ".join(av)}' if av else "")
    if code == "inline-reserved":
        return f"{component}() must be declared as a top-level statement, not used inline as a value"
    if code == "excess-args":
        return f'{component} takes {x["declared"]} arg(s), got {x["got"]} ({x["got"] - x["declared"]} excess dropped)'
    if code == "unknown-function":
        return f'Unknown function "@{component}": not a built-in or action step. The call evaluates to null'
    if x.get("reason") == "not-component":
        return "root does not evaluate to a component"
    if x.get("reason") == "fallback":
        return f"No root statement. Rendering the first statement that calls the root component {component}"
    return f"No root statement, and no statement calls the root component {component}" if component else "No root statement"


def issue(ctx, component, path, code, **x):
    e = {"code": code, "component": component, "path": path, "message": _message(component, path, code, x), "statementId": ctx.current}
    if code == "no-root" and x.get("reason") == "fallback":
        e["severity"] = "warning"
    ctx.errors.append(e)


def resolve_invalid(required, default):
    if default is not NOLIT:
        return default
    return INVALID if required else OMIT


def validate_value(value, schema, component, path, ctx):
    """validateSchemaValue: the value itself, a cleaned copy, or INVALID (after reporting)"""
    if not isinstance(schema, dict) or value is None or is_ast(value):
        return value
    s = schema
    if is_element(value):
        if _composite(s):
            return value
        if isinstance(s.get("type"), str) or isinstance(s.get("enum"), list) or "const" in s:
            issue(ctx, component, path, "type-mismatch", expected=s["type"] if isinstance(s.get("type"), str) else "a literal value",
                  actual=f'component "{value["typeName"]}"')
            return INVALID
        return value
    if _composite(s):
        names = [_ref_name(o) if isinstance(o, dict) else None for o in (s.get("anyOf") or s.get("oneOf") or [s])]
        if not (names and all(n is not None and ctx.cat is not None and n in ctx.cat for n in names)):
            return value
        actual = "array" if isinstance(value, list) else "plain object" if isinstance(value, dict) else _typeof(value)
        issue(ctx, component, path, "type-mismatch", expected=" | ".join(n or "" for n in names), actual=actual)
        return INVALID
    t = s.get("type")
    if t == "object":
        return _validate_object(value, s, component, path, ctx)
    if t == "array":
        if not isinstance(value, list):
            issue(ctx, component, path, "type-mismatch", expected="array", actual=js_type(value))
            return INVALID
        items = s.get("items")
        if not isinstance(items, dict):
            return value
        out = None
        for i, v in enumerate(value):
            nxt = validate_value(v, items, component, f"{path}/{i}", ctx)
            if nxt is not v and out is None:
                out = value[:i]
            if out is not None and nxt is not INVALID:
                out.append(nxt)
        return value if out is None else out
    typ, enum = _leaf(s)
    if typ is None and enum is None:
        return value
    if enum is not None and ctx.partial:
        return value
    if enum is not None:
        if _typeof(value) not in ("string", "number", "boolean") or strict_in(value, enum):
            return value
        issue(ctx, component, path, "type-mismatch", expected="one of [" + ", ".join(json_dumps(v) for v in enum) + "]",
              actual=json_dumps(value))
        return INVALID
    if typ != _typeof(value):
        issue(ctx, component, path, "type-mismatch", expected=typ, actual=js_type(value))
        return INVALID
    return value


def _validate_object(value, s, component, path, ctx):
    if not isinstance(value, dict):
        issue(ctx, component, path, "type-mismatch", expected="object", actual=js_type(value))
        return INVALID
    obj, out = value, None
    props = s["properties"] if isinstance(s.get("properties"), dict) else {}
    required = s["required"] if isinstance(s.get("required"), list) else []
    invalid = False
    if not ctx.partial:
        for key in required:
            present = key in obj
            if not present or obj[key] is None:
                fb = schema_default(props.get(key))
                if fb is not NOLIT:
                    out = out if out is not None else dict(obj)
                    out[key] = fb
                    continue
                issue(ctx, component, f"{path}/{key}", "null-required" if present else "missing-required")
                invalid = True
    for key, sub in props.items():
        if key not in obj:
            continue
        nxt = validate_value(obj[key], sub, component, f"{path}/{key}", ctx)
        if nxt is INVALID:
            nxt = resolve_invalid(key in required, schema_default(sub))
            if nxt is INVALID:
                invalid = True
                continue
        if nxt is obj[key]:
            continue
        out = out if out is not None else dict(obj)
        if nxt is OMIT:
            out.pop(key, None)
        else:
            out[key] = nxt
    return INVALID if invalid else (obj if out is None else out)


# ── Materialize (materialize.ts) ─────────────────────────────────────────────────────────────────────────────────────────────
def dynamic(v):
    """containsDynamicValue"""
    if not isinstance(v, (dict, list)):
        return False
    if is_ast(v):
        return True
    if isinstance(v, list):
        return any(dynamic(x) for x in v)
    if is_element(v):
        return any(dynamic(x) for x in v["props"].values())
    if isinstance(v.get("steps"), list):
        return True
    return any(dynamic(x) for x in v.values())


def _resolve_ref(name, ctx, mode):
    if name in ctx.visited or name not in ctx.syms:
        ctx.unres.append(name)
        return {"k": "Ph", "n": name} if mode == "expr" else None
    target = ctx.syms[name]
    if ctx.unreached is not None:
        ctx.unreached.discard(name)
    if target["k"] == "Comp" and target["name"] in RESERVED:
        return {"k": "RuntimeRef", "n": name, "refType": "mutation" if target["name"] == "Mutation" else "query"}
    ctx.visited.add(name)
    prev, ctx.current = ctx.current, name
    try:
        out = materialize_value(target, ctx) if mode == "value" else materialize_expr(target, ctx)
        if mode == "value" and is_element(out):
            out["statementId"] = name
        return out
    finally:
        ctx.current = prev
        ctx.visited.discard(name)


def _runtime_call(name, ctx):
    return name in ctx.calls() or name in RESERVED


def name_args(args, params):
    return {p["name"]: a for p, a in zip(params, args)}


def map_call_args(name, args, d, ctx):
    """a library call's literal args checked like props -> named args, or None (the call is invalid)"""
    params = d["params"]
    if len(args) > len(params):
        issue(ctx, name, "", "excess-args", declared=len(params), got=len(args))
    mapped = name_args(args, params)
    invalid, before = False, len(ctx.errors)
    for p in params:
        arg = mapped.get(p["name"])
        lit = literal_value(arg) if arg is not None else None
        if lit is NOLIT:
            continue
        if lit is None:
            if not p["required"] or p["default"] is not NOLIT:
                continue
            issue(ctx, name, "/" + p["name"], "null-required" if arg is not None else "missing-required",
                  signature=params_signature(name, params))
            invalid = True
            continue
        nxt = validate_value(lit, p["schema"], name, "/" + p["name"], ctx)
        if nxt is INVALID:
            nxt = resolve_invalid(p["required"], p["default"])
        if nxt is INVALID:
            invalid = True
        elif nxt is OMIT:
            mapped.pop(p["name"], None)
        elif nxt is not lit:
            mapped[p["name"]] = to_literal_ast(nxt)
    if d["kind"] == "action" and len(ctx.errors) > before:
        invalid = True
    return None if invalid else mapped


def _materialize_call(node, ctx, arg_fn):
    args = [arg_fn(a) for a in node["args"]]
    d = ctx.calls().get(node["name"])
    if not d or d["lazy"]:
        return {**node, "args": args}
    mapped = name_args(args, d["params"]) if d["builtin"] else map_call_args(node["name"], args, d, ctx)
    if mapped is not None:
        return {**node, "args": args, "mappedProps": mapped}
    return {"k": "Comp", "name": "Action", "args": [{"k": "Arr", "els": []}]} if d["kind"] == "action" else {"k": "Null"}


def name_raw_call_args(args, ctx, statement_id):
    """Query("s", {n: @Count(rows)}): name nested calls' args in place"""
    prev, ctx.current = ctx.current, statement_id
    seen = set()

    def visit(node):
        if node["k"] != "Comp" or id(node) in seen:
            return
        seen.add(id(node))
        d = ctx.calls().get(node["name"])
        if not d or d["lazy"]:
            return
        checked = None if d["builtin"] else map_call_args(node["name"], node["args"], d, ctx)
        node["mappedProps"] = checked if checked is not None else name_args(node["args"], d["params"])
    for a in args:
        walk(a, visit)
    ctx.current = prev


def _lazy_builtin(node, ctx, scoped):
    d = ctx.calls().get(node["name"])
    if not d or d["kind"] != "function" or not d["lazy"] or len(node["args"]) < 3:
        return None
    va = node["args"][1]
    var = va["n"] if va["k"] == "Ref" else va["v"] if va["k"] == "Str" else None
    if not var:
        return None
    inner = scoped | {var}
    return {**node, "args": [a if i == 1 else _mexpr(a, ctx, inner) for i, a in enumerate(node["args"])]}


def _mexpr(node, ctx, scoped):
    k = node["k"]
    if k == "Ref":
        return node if node["n"] in scoped else _resolve_ref(node["n"], ctx, "expr")
    if k == "Comp":
        name = node["name"]
        if node.get("fn") and not _runtime_call(name, ctx):
            issue(ctx, name, "", "unknown-function")
            return {"k": "Null"}
        lazy = _lazy_builtin(node, ctx, scoped)
        if lazy:
            return lazy
        if _runtime_call(name, ctx):
            return _materialize_call(node, ctx, lambda a: _mexpr(a, ctx, scoped))
        args = [_mexpr(a, ctx, scoped) for a in node["args"]]
        params = ctx.cat.get(name) if ctx.cat is not None else None
        if params is not None:
            return {**node, "args": args, "mappedProps": name_args(args, params)}
        issue(ctx, name, "", "unknown-component", available=list(ctx.cat) if ctx.cat is not None else None)
        return {**node, "args": args}
    sub = lambda n: _mexpr(n, ctx, scoped)  # noqa: E731
    if k == "Arr":
        return {**node, "els": [sub(e) for e in node["els"]]}
    if k == "Obj":
        return {**node, "entries": [[key, sub(v)] for key, v in node["entries"]]}
    if k == "BinOp":
        return {**node, "left": sub(node["left"]), "right": sub(node["right"])}
    if k == "UnaryOp":
        return {**node, "operand": sub(node["operand"])}
    if k == "Ternary":
        return {**node, "cond": sub(node["cond"]), "then": sub(node["then"]), "else": sub(node["else"])}
    if k == "Member":
        return {**node, "obj": sub(node["obj"])}
    if k == "Index":
        return {**node, "obj": sub(node["obj"]), "index": sub(node["index"])}
    if k == "Assign":
        return {**node, "value": sub(node["value"])}
    return node


def materialize_expr(node, ctx):
    return _mexpr(node, ctx, frozenset())


def materialize_value(node, ctx):
    """refs resolved, components to element nodes with named + validated props, literals to plain values, runtime exprs kept as AST"""
    k = node["k"]
    if k == "Ref":
        return _resolve_ref(node["n"], ctx, "value")
    if k in ("Str", "Num", "Bool"):
        return node["v"]
    if k in ("Null", "Ph"):
        return None
    if k == "Arr":
        items = []
        for e in node["els"]:
            if e["k"] == "Ph":
                continue
            v = materialize_value(e, ctx)
            if v is None and e["k"] in ("Comp", "Ref"):
                continue
            items.append(v)
        return items
    if k == "Obj":
        return {key: materialize_value(v, ctx) for key, v in node["entries"]}
    if k == "Comp":
        name, args = node["name"], node["args"]
        if node.get("fn") and not _runtime_call(name, ctx):
            issue(ctx, name, "", "unknown-function")
            return None
        if name in RESERVED:
            issue(ctx, name, "", "inline-reserved")
            return None
        if _runtime_call(name, ctx):
            return _lazy_builtin(node, ctx, frozenset()) or _materialize_call(node, ctx, lambda a: materialize_expr(a, ctx))
        params = ctx.cat.get(name) if ctx.cat is not None else None
        if params is None:
            issue(ctx, name, "", "unknown-component", available=list(ctx.cat) if ctx.cat is not None else None)
            return None
        props, drop = {}, False
        for p, a in zip(params, args):
            v = materialize_value(a, ctx)
            props[p["name"]] = v
            if p["schema"] is None:
                continue
            nxt = validate_value(v, p["schema"], name, "/" + p["name"], ctx)
            if nxt is INVALID:
                nxt = resolve_invalid(p["required"], p["default"])
                if nxt is INVALID:
                    drop = True
                elif nxt is OMIT:
                    props.pop(p["name"], None)
            if nxt is not INVALID and nxt is not OMIT:
                props[p["name"]] = nxt
        if len(args) > len(params):
            issue(ctx, name, "", "excess-args", declared=len(params), got=len(args))
        missing = [p for p in params if p["required"] and props.get(p["name"]) is None]
        still = []
        for p in missing:
            if p["default"] is not NOLIT:
                props[p["name"]] = p["default"]
            else:
                still.append(p)
        if still:
            for p in still:
                issue(ctx, name, "/" + p["name"], "null-required" if p["name"] in props else "missing-required",
                      signature=params_signature(name, params))
            return None
        if drop:
            return None
        return {"type": "element", "typeName": name, "props": props, "partial": ctx.partial,
                "hasDynamicProps": any(dynamic(v) for v in props.values())}
    if k in RUNTIME_KINDS:
        return materialize_expr(node, ctx)
    return node


# ── Parser (parser.ts) ───────────────────────────────────────────────────────────────────────────────────────────────────────
def _classify(sid, id_type, expr):
    if expr["k"] == "Comp" and expr["name"] == "Query":
        deps = _state_refs(expr["args"][1]) if len(expr["args"]) > 1 else []
        return {"kind": "query", "id": sid, "args": expr["args"], "expr": expr, "deps": deps or None}
    if expr["k"] == "Comp" and expr["name"] == "Mutation":
        return {"kind": "mutation", "id": sid, "args": expr["args"], "expr": expr}
    if id_type == "state":
        return {"kind": "state", "id": sid, "init": expr}
    return {"kind": "value", "id": sid, "expr": expr}


def _state_refs(node):
    if not is_ast(node):
        return []
    refs = {}
    walk(node, lambda c: refs.setdefault(c["n"], None) if c["k"] == "StateRef" else None)
    return list(refs)


def _extract(stmts, ctx, partial_ref=None):
    state, queries, mutations = {}, [], []
    for s in stmts:
        if s["kind"] == "state":
            state[s["id"]] = materialize_value(s["init"], ctx)
        elif s["kind"] == "query":
            name_raw_call_args(s["args"], ctx, s["id"])
            a = s["args"] + [None] * 4
            queries.append({"statementId": s["id"], "toolAST": a[0], "argsAST": a[1], "defaultsAST": a[2], "refreshAST": a[3],
                            "deps": s["deps"], "complete": True})
        elif s["kind"] == "mutation":
            name_raw_call_args(s["args"], ctx, s["id"])
            a = s["args"] + [None] * 2
            mutations.append({"statementId": s["id"], "toolAST": a[0], "argsAST": a[1]})
    for s in stmts:
        nodes = [s["init"]] if s["kind"] == "state" else [s["expr"]] if s["kind"] == "value" else s["args"]
        for node in nodes:
            for dep in _state_refs(node):
                if partial_ref and dep == partial_ref[0] and id(s) in partial_ref[1]:
                    continue
                state.setdefault(dep, None)
    return state, queries, mutations


def _is_component_call(node):
    return (node is not None and node["k"] == "Comp" and not node.get("fn") and not is_builtin(node["name"])
            and node["name"] not in RESERVED)


def _build(stmt_map, count, cat, root_name, incomplete, partial_ref=None):
    entry = None
    if "root" in stmt_map:
        entry = ("root", False)
    else:
        for s in stmt_map.values():
            if s["kind"] == "value" and _is_component_call(s["expr"]) and s["expr"]["name"] == root_name:
                entry = (s["id"], True)
                break
    syms = {sid: (s["init"] if s["kind"] == "state" else s["expr"]) for sid, s in stmt_map.items()}
    unreached = {sid for sid, s in stmt_map.items() if (not entry or sid != entry[0]) and s["kind"] == "value"}
    order = [sid for sid in stmt_map if sid in unreached]
    ctx = Ctx(syms, cat, incomplete, entry[0] if entry else None, unreached)
    root, root_expr = None, None
    if entry:
        m = materialize_value(syms[entry[0]], ctx)
        if is_element(m):
            root = m
            root["statementId"] = entry[0]
        elif is_ast(m):
            found = []
            walk(m, lambda c: found.append(1) if _is_component_call(c) else None)
            root_expr = m if found else None
    state, queries, mutations = _extract(list(stmt_map.values()), ctx, partial_ref)
    ctx.current = entry[0] if entry else None
    comp = root_name or ""
    if not entry:
        issue(ctx, comp, "", "no-root", reason="missing")
    elif not root and not root_expr and not _resolves_to_component(syms.get(entry[0]), syms):
        issue(ctx, comp, "", "no-root", reason="not-component")
    elif entry[1]:
        issue(ctx, comp, "", "no-root", reason="fallback" if root else "missing")
    out = {"root": root, "meta": {"incomplete": incomplete, "unresolved": ctx.unres,
                                  "orphaned": [sid for sid in order if sid in unreached] if entry else [],
                                  "statementCount": count, "errors": ctx.errors},
           "stateDeclarations": state, "queryStatements": queries, "mutationStatements": mutations}
    if root_expr:
        out["rootExpression"] = root_expr
    return out


def _resolves_to_component(node, syms):
    seen = set()
    while node is not None and node["k"] == "Ref" and node["n"] not in seen:
        seen.add(node["n"])
        node = syms.get(node["n"])
    return _is_component_call(node)


def _empty(incomplete=True):
    return {"root": None, "meta": {"incomplete": incomplete, "unresolved": [], "orphaned": [], "statementCount": 0, "errors": []},
            "stateDeclarations": {}, "queryStatements": [], "mutationStatements": []}


def _skip_string(s, start):
    if start >= len(s) or s[start] != '"':
        return start
    i = start + 1
    while i < len(s):
        if s[i] == "\\":
            i += 2
        elif s[i] == '"':
            return i + 1
        else:
            i += 1
    return i


def _find_fence(s, i):
    while i < len(s):
        j = _skip_string(s, i)
        if j > i:
            i = j
            continue
        if s.startswith("```", i):
            return i
        i += 1
    return -1


def strip_fences(text):
    """the code of every ``` fence, joined (an unclosed last fence runs to the end); no fence: the text as is"""
    blocks, i = [], 0
    while i < len(text):
        start = _find_fence(text, i)
        if start == -1:
            break
        j = text.find("\n", start + 3)
        if j == -1:
            blocks.append(re.sub(r"^[^\n]*\n?", "", text[start + 3:], count=1))
            break
        end = _find_fence(text, j + 1)
        if end != -1:
            blocks.append(text[j + 1:end])
            i = end + 3
        else:
            blocks.append(text[j + 1:])
            break
    if blocks:
        return "\n".join(blocks)
    if text.startswith("```"):
        j = text.find("\n", 3)
        body = text[j + 1:] if j != -1 else text[3:]
        t = body.rfind("```")
        return body[:t] if t != -1 else body
    return text


def strip_comments(text):
    """// and # line comments outside strings (a string may run across lines)"""
    in_str, lines = None, []
    for line in text.split("\n"):
        i, cut = 0, None
        while i < len(line):
            c = line[i]
            if in_str:
                if c == "\\" and i + 1 < len(line):
                    i += 2
                    continue
                if c == in_str:
                    in_str = None
            elif c in "\"'":
                in_str = c
            elif (c == "/" and line[i + 1:i + 2] == "/") or c == "#":
                cut = line[:i].rstrip(JS_WS)
                break
            i += 1
        lines.append(line if cut is None else cut)
    return "\n".join(lines)


def preprocess(text):
    return trim(strip_comments(strip_fences(trim(text))))


def parse(text, cat, root_name=None):
    """one whole program (maybe partial) -> ParseResult (root element tree, meta, state defaults, query/mutation statements)"""
    if not isinstance(cat, Catalog):
        cat = compile_schema(cat)
    t = preprocess(text)
    if not t:
        return _empty()
    closed, incomplete = auto_close(t)
    stmts = split(tokenize(closed))
    if not stmts:
        return _empty(incomplete)
    stmt_map = {}
    for sid, typ, toks in stmts:
        stmt_map[sid] = _classify(sid, typ, parse_expression(toks))
    return _build(stmt_map, len(stmt_map), cat, root_name, incomplete)


class StreamParser:
    """createStreamingParser: push(chunk) -> ParseResult. Statements end at depth-0 newlines; a completed one never changes.
    completed() is the text of the completed statements so far: what the gate may forward (a pending tail cannot be leak-checked)."""
    def __init__(self, schema, root_name=None):
        self.cat = schema if isinstance(schema, Catalog) else compile_schema(schema)
        self.root_name, self.buf, self.cleaned, self.end, self.done, self.count = root_name, "", "", 0, {}, 0

    def _add(self, text):
        for sid, typ, toks in split(tokenize(trim(text))):
            self.done[sid] = _classify(sid, typ, parse_expression(toks))
            self.count += 1

    def _refresh(self):
        nxt = preprocess(self.buf)
        if not nxt.startswith(self.cleaned[:self.end]):
            self.end, self.done, self.count = 0, {}, 0
        self.cleaned = nxt

    def _scan(self):
        depth = tern = 0
        in_str, esc, start, s = None, False, self.end, self.cleaned
        i = self.end
        while i < len(s):
            c = s[i]
            if esc:
                esc = False
            elif c == "\\" and in_str:
                esc = True
            elif in_str:
                if c == in_str:
                    in_str = None
            elif c in "\"'":
                in_str = c
            elif c in "([{":
                depth += 1
            elif c in ")]}":
                depth = max(0, depth - 1)
            elif c == "?" and depth == 0:
                tern += 1
            elif c == ":" and depth == 0 and tern > 0:
                tern -= 1
            elif c == "\n" and depth <= 0 and tern <= 0:
                peek = i + 1
                while peek < len(s) and s[peek] in " \t\r\n":
                    peek += 1
                if not (peek < len(s) and (s[peek] == "?" or (s[peek] == ":" and tern > 0))):
                    if trim(s[start:i]):
                        self._add(s[start:i])
                    start = self.end = i + 1
            i += 1
        return start

    def result(self, complete=False):
        self._refresh()
        pending = trim(self.cleaned[self._scan():])
        if not pending:
            return _build(self.done, self.count, self.cat, self.root_name, False) if self.count else _empty()
        closed, incomplete = auto_close(pending)
        stmts = split(tokenize(closed))
        if not stmts:
            return _build(self.done, self.count, self.cat, self.root_name, incomplete) if self.count else _empty(incomplete)
        all_map, pend = dict(self.done), set()
        for sid, typ, toks in stmts:
            if sid in self.done and incomplete:
                continue
            st = _classify(sid, typ, parse_expression(toks))
            all_map[sid] = st
            pend.add(id(st))
        m = None if complete else re.search(r"\$\w+\Z", self.buf, re.ASCII)
        tail = m.group(0) if m else None
        if tail and not (pending.endswith(tail) and not re.search(re.escape(tail) + r"(?!\w)", pending[:-len(tail)], re.ASCII)):
            tail = None
        return _build(all_map, self.count + len(stmts), self.cat, self.root_name, incomplete, (tail, pend) if tail else None)

    def push(self, chunk, complete=False):
        self.buf += chunk
        return self.result(complete)

    def completed(self):
        self._refresh()
        self._scan()
        return self.cleaned[:self.end]


# ── Merge (merge.ts) ─────────────────────────────────────────────────────────────────────────────────────────────────────────
def _split_source(text):
    out, depth, in_str, esc, start = [], 0, None, False, 0
    for i, c in enumerate(text):
        if esc:
            esc = False
        elif c == "\\" and in_str:
            esc = True
        elif in_str:
            if c == in_str:
                in_str = None
        elif c in "\"'":
            in_str = c
        elif c in "([{":
            depth += 1
        elif c in ")]}":
            depth = max(0, depth - 1)
        elif c == "\n" and depth <= 0:
            if trim(text[start:i]):
                out.append(trim(text[start:i]))
            start = i + 1
    if trim(text[start:]):
        out.append(trim(text[start:]))
    return out


def _statements(text):
    out = []
    for raw in _split_source(trim(text)) if trim(text) else []:
        s = split(tokenize(raw))
        if s:
            out.append((s[0][0], parse_expression(s[0][2]), raw))
    return out


def merge_statements(existing, patch, root_id="root"):
    """patch statements replace same-name ones, `name = null` deletes; then what root no longer reaches is dropped ($state stays)"""
    old, new = _statements(existing), _statements(strip_fences(patch))
    if not old:
        return "\n".join(raw for _, _, raw in new)
    if not new:
        return existing
    merged, asts, order = {}, {}, []
    for sid, ast, raw in old:
        merged[sid], asts[sid] = raw, ast
        order.append(sid)
    for sid, ast, raw in new:
        if ast["k"] == "Null":
            merged.pop(sid, None); asts.pop(sid, None)
            if sid in order:
                order.remove(sid)
            continue
        if sid not in merged:
            order.append(sid)
        merged[sid], asts[sid] = raw, ast
    if root_id in asts:
        reach, queue = {root_id}, [root_id]
        while queue:
            refs = {}
            walk(asts[queue.pop()], lambda c: refs.setdefault(c["n"], None) if c["k"] in ("Ref", "RuntimeRef") else None)
            for r in refs:
                if r not in reach and r in asts:
                    reach.add(r)
                    queue.append(r)
        order = [sid for sid in order if sid in reach or sid.startswith("$")]
    return "\n".join(merged[sid] for sid in order if sid in merged)


# ── Evaluator (runtime/evaluator.ts, evaluate-prop.ts, evaluate-tree.ts) ─────────────────────────────────────────────────────
class Step(dict):
    """a custom action step made by a real call (data shaped like one is dropped: ownSteps)"""


class Env:
    """EvaluationContext: state values, ref resolution, library functions {name: (params schema, returns schema, fn)}, custom actions"""
    def __init__(self, state=None, resolve=None, functions=None, actions=None, report=None, scope=None):
        self.state, self.resolve = state or {}, resolve or (lambda name: None)
        self.functions, self.actions, self.report, self.scope = functions or {}, actions or {}, report, scope or {}

    def get_state(self, name):
        return self.state.get(name)

    def with_(self, **kw):
        e = Env(self.state, self.resolve, self.functions, self.actions, self.report, self.scope)
        for k, v in kw.items():
            setattr(e, k, v)
        return e


def is_plan(v):
    return isinstance(v, dict) and isinstance(v.get("steps"), list)


def own_steps(plan):
    keep = [s for s in plan["steps"] if not (isinstance(s, dict) and s.get("type") == "custom_action") or isinstance(s, Step)]
    return plan if len(keep) == len(plan["steps"]) else {**plan, "steps": keep}


def _flatten(values):
    steps = []
    for v in values:
        if is_plan(v):
            steps += v["steps"]
        elif isinstance(v, dict) and "type" in v:
            steps.append(v)
    return own_steps({"steps": steps})


def _eval_args(node, env, params=None):
    if params is None:
        params = BUILTIN_CALLS[node["name"]]["params"] if node["name"] in BUILTIN_CALLS else []
    named = node["mappedProps"] if node.get("mappedProps") is not None else name_args(node["args"], params)
    return {k: evaluate(v, env) for k, v in named.items()}


def _call_args(node, env, params):
    names = list((params.get("properties") or {}).keys())
    args = _eval_args(node, env, _pdefs(names))
    req = params.get("required") or []
    return {k: v for k, v in args.items() if not (v is None and k not in req)}


def _misses_required(args, params):
    return any(args.get(k) is None and schema_default((params.get("properties") or {}).get(k)) is NOLIT for k in params.get("required") or [])


def _check(value, schema, name, path, env, strict=False):
    ctx = Ctx()
    out = validate_value(value, schema, name, path, ctx)
    for e in ctx.errors:
        if env.report:
            env.report(f"@{name}: {e['message']}")
    return INVALID if strict and ctx.errors else out


def _call_function(name, d, node, env):
    raw = _call_args(node, env, d["params"])
    if _misses_required(raw, d["params"]):
        return None
    args = _check(raw, d["params"], name, "", env)
    if args is INVALID:
        return None
    try:
        result = d["fn"](args)
    except Exception as e:  # noqa: BLE001  (a library function's throw is a null, reported)
        if env.report:
            env.report(f"@{name} threw: {e}")
        return None
    if not d.get("returns"):
        return result
    checked = _check(result, d["returns"], name, "/returns", env)
    return None if checked is INVALID else checked


def _lazy_step(name, args):
    if name == "Run":
        a = args[0] if args else None
        return {"type": "run", "statementId": a["n"], "refType": a["refType"]} if a and a["k"] == "RuntimeRef" else None
    if name == "Set":
        return {"type": "set", "target": args[0]["n"], "valueAST": args[1]} if len(args) >= 2 and args[0]["k"] == "StateRef" else None
    if name == "Reset":
        targets = [a["n"] for a in args if a["k"] == "StateRef"]
        return {"type": "reset", "targets": targets} if targets else None
    return None


def _action_call(node, env):
    name, args = node["name"], node["args"]
    if name == "Action":
        lst = evaluate(args[0], env) if args else []
        return _flatten(lst if isinstance(lst, list) else [])
    if name == "ToAssistant":
        a = _eval_args(node, env)
        step = {"type": "continue_conversation", "message": "" if a.get("message") is None else js_str(a["message"])}
        if a.get("context") is not None:
            step["context"] = a["context"]
    elif name == "OpenUrl":
        a = _eval_args(node, env)
        step = {"type": "open_url", "url": "" if a.get("url") is None else js_str(a["url"])}
    else:
        step = _lazy_step(name, args)
    return {"steps": [step] if step else []}


def _substitute(node, var, value):
    k = node["k"]
    sub = lambda n: _substitute(n, var, value)  # noqa: E731
    if k == "Ref":
        return to_literal_ast(value) if node["n"] == var else node
    if k == "Member":
        o = sub(node["obj"])
        if o["k"] == "Obj":
            for key, v in o["entries"]:
                if key == node["field"]:
                    return v
        return {**node, "obj": o}
    if k == "Index":
        return {**node, "obj": sub(node["obj"]), "index": sub(node["index"])}
    if k == "BinOp":
        return {**node, "left": sub(node["left"]), "right": sub(node["right"])}
    if k == "UnaryOp":
        return {**node, "operand": sub(node["operand"])}
    if k == "Ternary":
        return {**node, "cond": sub(node["cond"]), "then": sub(node["then"]), "else": sub(node["else"])}
    if k == "Arr":
        return {**node, "els": [sub(e) for e in node["els"]]}
    if k == "Obj":
        return {**node, "entries": [[key, sub(v)] for key, v in node["entries"]]}
    if k == "Comp":
        out = {**node, "args": [sub(a) for a in node["args"]]}
        if node.get("mappedProps") is not None:
            out["mappedProps"] = {key: sub(v) for key, v in node["mappedProps"].items()}
        return out
    if k == "Assign":
        return {**node, "value": sub(node["value"])}
    return node


def _each(args, env, lib):
    if len(args) < 3:
        return []
    arr = evaluate(args[0], env)
    if not isinstance(arr, list):
        return []
    a1 = args[1]
    var = a1["n"] if a1["k"] == "Ref" else a1.get("v") if a1["k"] == "Str" else None
    if not var:
        return []
    out = []
    for item in arr:
        child = env.with_(resolve=lambda name, item=item: item if name == var else env.resolve(name))
        r = evaluate(_substitute(args[2], var, item), child, lib)
        out.append(_eval_element(r, child, lib) if lib is not None and is_element(r) else r)
    return out


def evaluate(node, env, lib=None):
    """an AST node -> its runtime value. lib = {component: set of bindable prop names} (schema context), or None"""
    k = node["k"]
    if k in ("Str", "Num", "Bool"):
        return node["v"]
    if k in ("Null", "Ph"):
        return None
    if k == "StateRef":
        v = env.scope.get(node["n"])
        return v if v is not None else env.get_state(node["n"])
    if k in ("Ref", "RuntimeRef"):
        return env.resolve(node["n"])
    if k == "Arr":
        return [evaluate(e, env) for e in node["els"]]
    if k == "Obj":
        return {key: evaluate(v, env) for key, v in node["entries"]}
    if k == "Comp":
        name = node["name"]
        if name in BUILTINS:
            fn = BUILTINS[name][1]
            return _each(node["args"], env, lib) if fn is None else fn(_eval_args(node, env))
        if is_step(name):
            return _action_call(node, env)
        if name in env.functions:
            return _call_function(name, env.functions[name], node, env)
        if name in env.actions:
            d = env.actions[name]
            args = _call_args(node, env, d["params"])
            if _misses_required(args, d["params"]):
                return {"steps": []}
            params = _check(args, d["params"], name, "", env, strict=True)
            if params is INVALID:
                return {"steps": []}
            return {"steps": [Step(type="custom_action", name=name, params=params)]}
        if node.get("mappedProps") is not None:
            bind = (lib or {}).get(name, ())
            props = {}
            for key, val in node["mappedProps"].items():
                if val["k"] == "StateRef" and key in bind:
                    props[key] = {"__reactive": "assign", "target": val["n"], "expr": {"k": "StateRef", "n": "$value"}}
                elif val["k"] == "StateRef":
                    props[key] = env.get_state(val["n"]) if lib is not None else val
                else:
                    props[key] = evaluate(val, env, lib)
            if lib is not None:
                for key, val in props.items():
                    if is_element(val):
                        props[key] = _eval_element(val, env, lib)
                    elif isinstance(val, list):
                        props[key] = [_eval_element(x, env, lib) if is_element(x) else x for x in val]
            return {"type": "element", "typeName": name, "props": props, "partial": False, "hasDynamicProps": True}
        return None                                         # an unmapped Comp (an inline Query): upstream warns, null
    if k == "BinOp":
        op = node["op"]
        if op in ("&&", "||"):
            left = evaluate(node["left"], env)
            return (evaluate(node["right"], env) if truthy(left) else left) if op == "&&" else (left if truthy(left) else evaluate(node["right"], env))
        left, right = evaluate(node["left"], env), evaluate(node["right"], env)
        if op == "+":
            if isinstance(left, str) or isinstance(right, str):
                return ("" if left is None else js_str(left)) + ("" if right is None else js_str(right))
            return to_number(left) + to_number(right)
        if op in ("-", "*"):
            x, y = to_number(left), to_number(right)
            return x - y if op == "-" else x * y
        if op == "/":
            y = to_number(right)
            return 0 if y == 0 else to_number(left) / y
        if op == "%":
            x, y = to_number(left), to_number(right)
            if y == 0:
                return 0
            return math.nan if math.isinf(x) or x != x or y != y else (x if math.isinf(y) else math.fmod(x, y))
        if op == "==":
            return loose_eq(left, right)
        if op == "!=":
            return not loose_eq(left, right)
        x, y = to_number(left), to_number(right)
        return {">": x > y, "<": x < y, ">=": x >= y, "<=": x <= y}.get(op)
    if k == "UnaryOp":
        v = evaluate(node["operand"], env)
        return (not truthy(v)) if node["op"] == "!" else -to_number(v) if node["op"] == "-" else None
    if k == "Ternary":
        return evaluate(node["then"] if truthy(evaluate(node["cond"], env)) else node["else"], env)
    if k == "Member":
        obj = evaluate(node["obj"], env)
        if obj is None:
            return None
        if isinstance(obj, list):
            return len(obj) if node["field"] == "length" else [get_prop(x, node["field"]) for x in obj]
        return get_prop(obj, node["field"])
    if k == "Index":
        obj, idx = evaluate(node["obj"], env), evaluate(node["index"], env)
        if obj is None or idx is None:
            return None
        if isinstance(obj, list):
            i = to_number(idx)
            return obj[int(i)] if i == i and not math.isinf(i) and i == int(i) and 0 <= i < len(obj) else None
        return get_prop(obj, js_str(idx))
    if k == "Assign":
        return {"__reactive": "assign", "target": node["target"], "expr": node["value"]}
    return None


def is_assign(v):
    return isinstance(v, dict) and v.get("__reactive") == "assign"


def _eval_prop(value, env, lib, reactive, rec_el):
    """evaluatePropCore"""
    out = _eval_prop_value(value, env, lib, reactive, rec_el)
    return own_steps(out) if is_plan(out) else out


def _eval_prop_value(value, env, lib, reactive, rec_el):
    if not isinstance(value, (dict, list)):
        return value
    if is_ast(value):
        if value["k"] == "StateRef" and reactive:
            return {"__reactive": "assign", "target": value["n"], "expr": {"k": "StateRef", "n": "$value"}}
        r = evaluate(value, env, lib)
        if is_element(r):
            return rec_el(r)
        if isinstance(r, list):
            return [rec_el(x) if is_element(x) else x for x in r]
        if is_assign(r) and not reactive:
            return env.get_state(r["target"])
        return r
    if isinstance(value, list):
        return [_eval_prop(v, env, lib, reactive, rec_el) for v in value]
    if is_element(value):
        return rec_el(value)
    if is_plan(value):
        return value
    if any(isinstance(v, (dict, list)) for v in value.values()):
        return {k: _eval_prop(v, env, lib, reactive, rec_el) for k, v in value.items()}
    return value


def _eval_element(el, env, lib):
    """evaluateElementInline"""
    if el.get("hasDynamicProps") is False:
        return el
    bind = lib.get(el["typeName"], ())
    rec = lambda e: _eval_element(e, env, lib)  # noqa: E731
    return {**el, "props": {k: _eval_prop(v, env, lib, k in bind, rec) for k, v in el["props"].items()}}


def evaluate_element_props(el, env, lib, errors=None):
    """evaluateElementProps: every prop resolved; a prop that fails keeps its raw value and adds a runtime-error"""
    if el.get("hasDynamicProps") is False:
        return el
    bind = lib.get(el["typeName"], ())
    key = [""]

    def report(msg):
        if errors is not None:
            errors.append({"source": "runtime", "code": "runtime-error", "component": el["typeName"], "statementId": el.get("statementId"),
                           "message": f'Evaluating prop "{key[0]}" on {el["typeName"]} failed: {msg}', "hint": f'Check the expression used for prop "{key[0]}"'})
    penv = env.with_(report=report) if env.functions or env.actions else env
    rec = lambda e: evaluate_element_props(e, penv, lib, errors)  # noqa: E731
    out = {}
    for k, v in el["props"].items():
        key[0] = k
        try:
            out[k] = _eval_prop(v, penv, lib, k in bind, rec)
        except Exception as e:  # noqa: BLE001  (one bad prop never takes the tree down)
            out[k] = v
            report(str(e))
    return {**el, "props": out}


def evaluate_root(result, env, lib, errors=None):
    if result["root"]:
        return evaluate_element_props(result["root"], env, lib, errors)
    if not result.get("rootExpression"):
        return None
    v = evaluate(result["rootExpression"], env, lib)
    if is_element(v):
        return evaluate_element_props(v, env, lib, errors)
    if errors is not None:
        errors.append({"source": "runtime", "code": "no-root", "statementId": "root", "message": "root does not evaluate to a component"})
    return None


# ── Canonical form (spec/language.md Appendix B; tests/fixtures/openui/1.0/README.md) ────────────────────────────────────────
def bindable(spec):
    """{component: {prop}} for props whose signature prints $binding< (a LibrarySpec has no other marker)"""
    return {name: set(re.findall(r"(\w+)\??: \$binding<", c["signature"])) for name, c in spec["components"].items()}


def env_for(result, schema, functions=None):
    """the stream-end context: state at its defaults, a query reads its defaults, a mutation is idle"""
    fns = {name: {**f, "fn": (functions or {}).get(name)} for name, f in (schema.get("functions") or {}).items()}   # no code: a throw, null
    env = Env(dict(result["stateDeclarations"]), functions=fns, actions=schema.get("actions") or {})

    def resolve(name):
        for q in result["queryStatements"]:
            if q["statementId"] == name:
                return evaluate(q["defaultsAST"], env) if q["defaultsAST"] else None
        if any(m["statementId"] == name for m in result["mutationStatements"]):
            return {"status": "idle", "data": None, "error": None}
        return None
    env.resolve = resolve
    return env


def summarize(v, ev, action_params):
    if v is None or not isinstance(v, (dict, list)):
        return v
    if isinstance(v, list):
        return [summarize(x, ev, action_params) for x in v]
    if v.get("type") == "element":
        props = {k: summarize(pv, ev, action_params) for k, pv in v["props"].items()}
        return {"type": v["typeName"], "props": {k: x for k, x in props.items() if x is not None}}
    if isinstance(v.get("steps"), list):
        return {"actions": [_summarize_step(s, ev, action_params) for s in v["steps"]]}
    if v.get("__reactive") == "assign":
        return {"$binding": v["target"]}
    return {k: summarize(x, ev, action_params) for k, x in v.items()}


def _summarize_step(s, ev, action_params):
    t = s.get("type")
    if t == "continue_conversation":
        return {"action": "ToAssistant", "args": [s["message"]] if s.get("context") is None else [s["message"], s["context"]]}
    if t == "open_url":
        return {"action": "OpenUrl", "args": [s["url"]]}
    if t == "set":
        return {"action": "Set", "args": [s["target"], ev(s["valueAST"])]}
    if t == "reset":
        return {"action": "Reset", "args": s["targets"]}
    if t == "run":
        return {"action": "Run", "args": [s["statementId"]]}
    params = s.get("params") or {}
    return {"action": s.get("name"), "args": [summarize(params.get(k), ev, action_params) for k in action_params.get(s.get("name"), list(params))]}


def canon(result, spec, functions=None):
    """the canonical result at stream end: root, errors {code, statementId}, errorObjects, unresolved, orphans, incomplete, state"""
    schema = spec["schema"]
    env = env_for(result, schema, functions)
    runtime = []
    tree = evaluate_root(result, env, bindable(spec), runtime)
    aparams = {name: list((a["params"].get("properties") or {}).keys()) for name, a in (schema.get("actions") or {}).items()}
    objs = [{"source": "parser", "code": e["code"], "statementId": e.get("statementId"), "component": e.get("component"),
             "path": e.get("path") or None} for e in result["meta"]["errors"]]
    objs += [{"source": "runtime", "code": e["code"], "statementId": e.get("statementId"), "component": e.get("component"), "path": None}
             for e in runtime]
    return plain({"root": summarize(tree, lambda ast: evaluate(ast, env), aparams),
                  "errors": [{k: e[k] for k in ("code", "statementId") if e[k] is not None} for e in objs],
                  "errorObjects": [{k: v for k, v in e.items() if v is not None} for e in objs],
                  "unresolved": result["meta"]["unresolved"], "orphans": result["meta"]["orphaned"],
                  "incomplete": result["meta"]["incomplete"], "state": result["stateDeclarations"]})
