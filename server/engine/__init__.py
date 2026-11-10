"""Engine server core (render plan v2, Part B/D): deterministic tools with a JSON Schema in and out. Their output IS the truth a view
shows; the model never types a value an engine can compute. Server side only (V2 amended, Tony Oct 18): Query statements resolve
in the gate, no public engine endpoint. One API, three clients later: author MCP (P2.1), the gate (P4.1), tests.

    import engine
    engine.call("graph.trace", {"algo": "dijkstra", "graph": block, "start": "A"})   -> dict (checked against the tool's out schema)
    engine.spec()                                                                      -> [{name, description, input, output}]

A tool = engine.tool(name, description, input schema, output schema) on a function(args) -> dict. Bad input, an unreadable
expression, or no answer -> EngineError(code, message); nothing else escapes call(). networkx / sympy load on first use."""
import importlib

VERSION = "0.1.0"          # part of the view cache key (item, picks, lib version, engine version): bump when any tool's output changes
TOOLS = {}
MODULES = ("engine.graph", "engine.symbolic")


class EngineError(ValueError):
    """code: unknown-tool | bad-args | bad-graph | unreadable | no-result | bad-output"""
    def __init__(self, code, message):
        super().__init__(f"{code}: {message}")
        self.code = code


def tool(name, description, inp, out):
    def reg(fn):
        TOOLS[name] = {"fn": fn, "description": description, "input": inp, "output": out}
        return fn
    return reg


def _load():
    for m in MODULES:
        importlib.import_module(m)


def spec():
    """every tool's name, description and schemas, sorted by name (registry.list / the MCP tool list)"""
    _load()
    return [{"name": n, "description": t["description"], "input": t["input"], "output": t["output"]} for n, t in sorted(TOOLS.items())]


def call(name, args):
    _load()
    t = TOOLS.get(name)
    if not t:
        raise EngineError("unknown-tool", name)
    problems = check(args, t["input"])
    if problems:
        raise EngineError("bad-args", "; ".join(problems[:3]))
    try:
        res = t["fn"](args)
    except EngineError:
        raise
    except (ValueError, ArithmeticError, TypeError, KeyError, RecursionError) as e:   # an engine bug or a sympy refusal: never a crash
        raise EngineError("no-result", f"{type(e).__name__}: {e}") from e
    problems = check(res, t["output"])
    if problems:
        raise EngineError("bad-output", "; ".join(problems[:3]))
    return res


# ---------------- a small JSON Schema subset (the keywords our tool schemas use), no dependency ----------------
TYPES = {"object": dict, "array": list, "string": str, "boolean": bool, "null": type(None)}


def _is(v, t):
    if t == "integer":
        return isinstance(v, int) and not isinstance(v, bool)
    if t == "number":
        return isinstance(v, (int, float)) and not isinstance(v, bool)
    return isinstance(v, TYPES[t])


def check(v, s, path="$"):
    """list of problems ([] = valid): type (or list), enum, required, properties, additionalProperties, items, min/maxItems,
    maxLength, minimum, oneOf"""
    if "oneOf" in s:
        ok = [sub for sub in s["oneOf"] if not check(v, sub, path)]
        return [] if len(ok) == 1 else [f"{path}: matches {len(ok)} of oneOf"]
    t = s.get("type")
    if t and not any(_is(v, x) for x in (t if isinstance(t, list) else [t])):
        return [f"{path}: want {t}"]
    out = []
    if "enum" in s and v not in s["enum"]:
        out.append(f"{path}: not one of {s['enum']}")
    if isinstance(v, str) and len(v) > s.get("maxLength", len(v)):
        out.append(f"{path}: longer than {s['maxLength']}")
    if _is(v, "number") and v < s.get("minimum", v):
        out.append(f"{path}: below {s['minimum']}")
    if isinstance(v, dict):
        out += [f"{path}: missing {k}" for k in s.get("required", []) if k not in v]
        props = s.get("properties", {})
        extra = s.get("additionalProperties", True)
        for k, x in v.items():
            if k in props:
                out += check(x, props[k], f"{path}.{k}")
            elif extra is False:
                out.append(f"{path}: unknown key {k}")
            elif isinstance(extra, dict):
                out += check(x, extra, f"{path}.{k}")
    if isinstance(v, list):
        if not s.get("minItems", 0) <= len(v) <= s.get("maxItems", len(v)):
            out.append(f"{path}: {len(v)} items")
        if "items" in s:
            for i, x in enumerate(v):
                out += check(x, s["items"], f"{path}[{i}]")
    return out
