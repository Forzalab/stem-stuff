"""symbolic.* engine tools (sympy). Input text is math.js-ish (2x, x^2, sin(x), pi, e) and goes through serve.py's token allowlist
(to_python) before sympy's eval-based parser sees it: the same gate as grading, one copy. Symbols are real. Every expression comes
back as {text (math.js-ish, ^ for powers), latex}."""
import dataclasses
import re

from engine import EngineError, tool

EXPR = {"type": "string", "maxLength": 200}
VAR = {"type": "string", "maxLength": 6}
OUT = {"type": "object", "required": ["text", "latex"], "additionalProperties": False,
       "properties": {"text": {"type": "string"}, "latex": {"type": "string"}}}
VAR_RE = re.compile(r"^[a-z][a-z0-9_]{0,5}$")
MAX_STEPS = 20
RULE_NAMES = {"U": "Substitution", "Dont_know": "Unknown"}


def _sym():
    import serve
    return serve


def parse(src, names):
    """allowlisted text -> sympy expression in the given variable names; EngineError("unreadable") on anything else"""
    serve = _sym()
    S = serve.S
    names = tuple(n.lower() for n in names)
    for n in names:
        if not VAR_RE.match(n) or n in serve.NAMES:
            raise EngineError("bad-args", f"bad variable {n}")
    if len(src) > 200:
        raise EngineError("unreadable", "too long")
    try:
        text = serve.to_python(src, names)
        if not text:
            raise ValueError("empty")
        loc = dict(serve.NAMES, **{n: S.Symbol(n, real=True) for n in names})
        expr = serve.parse_expr(text, local_dict=loc, global_dict=serve.GLOBALS, transformations=(serve.auto_number,), evaluate=False)
        if not isinstance(expr, S.Basic):
            raise ValueError("not an expression")
        for p in expr.atoms(S.Pow):          # 9^9^9^9: refuse before sympy builds it (same guard as serve.evaluate)
            if p.exp.is_number and abs(complex(p.exp.evalf(15))) > 1000:
                raise ValueError("exponent too big")
        return expr.doit(), {n: loc[n] for n in names}
    except serve.UNREADABLE as e:
        raise EngineError("unreadable", f"{src!r}: {e}") from e


def out(e):
    import sympy
    return {"text": sympy.sstr(e).replace("**", "^"), "latex": sympy.latex(e)}


def _done(e):
    import sympy
    if e.has(sympy.Integral, sympy.Derivative, sympy.Sum, sympy.Limit) or e.has(sympy.nan):
        raise EngineError("no-result", "sympy left it unevaluated")
    return e


@tool("symbolic.simplify", "Simplify an expression.",
      {"type": "object", "required": ["expr"], "additionalProperties": False,
       "properties": {"expr": EXPR, "vars": {"type": "array", "maxItems": 4, "items": VAR}}}, OUT)
def simplify(args):
    import sympy
    e, _ = parse(args["expr"], args.get("vars", ["x"]))
    return out(sympy.simplify(e))


@tool("symbolic.derivative", "d^order/dvar^order of expr, simplified.",
      {"type": "object", "required": ["expr"], "additionalProperties": False,
       "properties": {"expr": EXPR, "var": VAR, "order": {"type": "integer", "minimum": 1}}}, OUT)
def derivative(args):
    import sympy
    v = args.get("var", "x")
    e, s = parse(args["expr"], [v])
    return out(_done(sympy.simplify(sympy.diff(e, s[v.lower()], min(args.get("order", 1), 10)))))


def steps(rule, acc):
    """sympy's manualintegrate rule tree, pre-order, as [{rule, integrand (latex)}]; at most MAX_STEPS"""
    import sympy
    from sympy.integrals.manualintegrate import AlternativeRule, Rule
    if isinstance(rule, AlternativeRule):        # several routes: show the first one only, never two interleaved
        return steps(rule.alternatives[0], acc)
    if len(acc) >= MAX_STEPS:
        return acc
    name = type(rule).__name__.removesuffix("Rule")
    acc.append({"rule": RULE_NAMES.get(name, name), "integrand": sympy.latex(rule.integrand)})
    for f in dataclasses.fields(rule):
        x = getattr(rule, f.name)
        for r in x if isinstance(x, (list, tuple)) else [x]:
            if isinstance(r, Rule):
                steps(r, acc)
    return acc


@tool("symbolic.integrate", "Antiderivative (no +C) or definite integral from lower to upper, with sympy's manual-integration steps "
      "(rule names: Parts, Substitution, Power, ConstantTimes, ...; empty when sympy finds no textbook route).",
      {"type": "object", "required": ["expr"], "additionalProperties": False,
       "properties": {"expr": EXPR, "var": VAR, "lower": EXPR, "upper": EXPR}},
      {"type": "object", "required": ["result", "steps"], "properties": {"result": OUT, "steps": {"type": "array", "maxItems": MAX_STEPS,
       "items": {"type": "object", "required": ["rule", "integrand"], "properties": {"rule": {"type": "string"}, "integrand": {"type": "string"}}}}}})
def integrate(args):
    import sympy
    from sympy.integrals.manualintegrate import integral_steps
    v = args.get("var", "x")
    e, s = parse(args["expr"], [v])
    x = s[v.lower()]
    if ("lower" in args) != ("upper" in args):
        raise EngineError("bad-args", "lower and upper go together")
    if "lower" in args:
        a, b = (parse(args[k], [])[0] for k in ("lower", "upper"))
        r = sympy.integrate(e, (x, a, b))
    else:
        r = sympy.integrate(e, x)
    try:
        st = steps(integral_steps(e, x), [])
    except (ValueError, NotImplementedError, TypeError):
        st = []
    if any(t["rule"] == "Unknown" for t in st):
        st = []
    return {"result": out(_done(sympy.simplify(r))), "steps": st}


@tool("symbolic.solve", "Solve equations ('lhs = rhs', or an expression = 0) for vars; real solutions, each a {var: value} map.",
      {"type": "object", "required": ["equations", "vars"], "additionalProperties": False,
       "properties": {"equations": {"type": "array", "minItems": 1, "maxItems": 4, "items": EXPR},
                      "vars": {"type": "array", "minItems": 1, "maxItems": 4, "items": VAR}}},
      {"type": "object", "required": ["solutions"], "properties": {"solutions": {"type": "array", "items": {"type": "object", "additionalProperties": OUT}}}})
def solve(args):
    import sympy
    eqs, syms = [], {}
    for q in args["equations"]:
        sides = q.split("=")
        if len(sides) > 2:
            raise EngineError("unreadable", f"{q!r}: more than one =")
        parts = [parse(p, args["vars"]) for p in sides]
        syms = parts[0][1]
        eqs.append(parts[0][0] - (parts[1][0] if len(parts) == 2 else 0))
    sols = sympy.solve(eqs, list(syms.values()), dict=True)
    return {"solutions": [{str(k): out(v) for k, v in sorted(sol.items(), key=lambda kv: str(kv[0]))} for sol in sols]}


@tool("symbolic.series_test", "Does sum(term, var = start .. oo) converge? verdict converges | diverges | unknown, plus lim term.",
      {"type": "object", "required": ["term"], "additionalProperties": False,
       "properties": {"term": EXPR, "var": VAR, "start": {"type": "integer", "minimum": 0}}},
      {"type": "object", "required": ["verdict", "term_limit"], "properties": {
          "verdict": {"enum": ["converges", "diverges", "unknown"]}, "term_limit": {"oneOf": [OUT, {"type": "null"}]}}})
def series_test(args):
    import sympy
    v = args.get("var", "n")
    e, s = parse(args["term"], [v])
    n = sympy.Symbol(v.lower(), integer=True, positive=True)
    e = e.subs(s[v.lower()], n)
    try:
        conv = sympy.Sum(e, (n, args.get("start", 1), sympy.oo)).is_convergent()
    except (NotImplementedError, ValueError):
        conv = None
    try:
        lim = sympy.limit(e, n, sympy.oo)
        lim = None if lim.has(sympy.Limit) or lim is sympy.nan else out(lim)
    except (NotImplementedError, ValueError):
        lim = None
    verdict = "converges" if conv is sympy.true else "diverges" if conv is sympy.false else "unknown"
    return {"verdict": verdict, "term_limit": lim}
