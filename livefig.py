"""Live figures (Claude path only): Cluck may add ONE figure per reply as DATA, a ```fig {json}``` fence holding a SCHEMA.md graph block.
Tony, Oct 17 (replaces invariant 1's "live only for the gaps" on the Claude path): live figures are Cluck's mainstay, in most replies
where a picture helps; still data only, gated here in ms (check()), and any failure drops the block, the text answer still streams.
An authored bank figure stays on the question; the live one sits in Cluck's message.
The model never sends SVG/HTML/JS: the browser draws the checked JSON with Graph.render, the same path as a bank figure.
Off on the OpenRouter path and with CLUCK_LIVE_FIGS=0: no fig instructions, and Fence(None) strips every fence."""
import json
import math
import os
import re
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))

# What a live figure may use: a strict subset of SCHEMA.md's kinds and marks (no circuit: its outputs are the answer; no param /
# tangent / path: t-expressions are harder to check). Caps keep it small enough for a phone and for a ms gate.
# the geometry marks (H bridge, Oct 22): right-angle square, dimension line, angle arc + label, circle shorthand; both kinds
GEOM = ("right", "dim", "angle", "circle")
KINDS = {"cartesian": {"fn", "shade", "vline", "hline", "point", "seg", "arrow", "arc", "poly", "text", *GEOM},
         "scene": {"body", "spring", "pulley", "rope", "surface", "incline", "force", "pivot", "point", "seg", "arrow", "arc", "text", *GEOM},
         "bars": set(), "network": set()}
MAX_JSON, MAX_MARKS, MAX_LABELS, MAX_NODES, MAX_EDGES, MAX_GROUPS, MAX_BARS, MAX_PTS, MAX_ALT = 3000, 12, 6, 12, 30, 3, 4, 12, 200
# A live network is the key subgraph only (the odd cycle, the path, the cut), never the question's whole graph again: Opus redrew the
# 10-duck CEQ graph with one edge lit, Oct 18 ("drawing for the sake of drawing"). More nodes: "big"; every vertex of the bank figure: "copy".
MAX_LIVE_NODES = 6
FIGS_MAX = 2                       # visuals per reply, ```fig and ```openui together (todo 113 spec, Tony Oct 28: "may mix 2"); a third is dropped
GEOM_MAX = 1e4                     # any number in the figure: finite, |v| <= this
# Fields whose numbers are DATA (shown, or drawn from as a value): they must come from the givens and never be the answer.
# Every other number is free layout geometry (positions, sizes, axis ranges), only capped.
DATA_KEYS = {"label", "text", "alt", "unit", "value", "w", "y", "f", "g", "of"}
EXPR_KEYS = {"y", "f", "g", "of"}     # math.js strings (cartesian fn / shade)
NUM_RE = re.compile(r"\d+(?:\.\d+)?(?:[eE][-+]?\d+)?")
FENCE_MAX = 4000                   # a fence longer than this is dropped unread
# Which kinds a figure may be, from the bank's profile.subject (its first dotted part). Tony, Oct 17: "the figure MUST MATCH whatever
# topic it is" (a network graph showed up on a physics ramp). Unknown or missing subject: the physics-ish set, never a network.
SUBJECT_KINDS = {"physics": ("scene", "cartesian", "bars"), "cs": ("network",), "discrete": ("network",),
                 "math": ("cartesian",), "calc": ("cartesian",)}
DEFAULT_KINDS = ("scene", "cartesian", "bars")


def on():
    """CLUCK_LIVE_FIGS: default on (Claude path only); 0 / off / false kills it"""
    return os.environ.get("CLUCK_LIVE_FIGS", "1").strip().lower() not in ("0", "off", "false", "no")


# ---------------- the SCHEMA.md graph schema, read at runtime (the one schema; tests/schemas.mjs reads the same block) ----------------
_schema = {}


def schema():
    """the problems schema from SCHEMA.md, or None when the file is missing (then no live figure passes: fail closed)"""
    if "s" not in _schema:
        try:
            with open(os.path.join(ROOT, "SCHEMA.md"), encoding="utf-8") as f:
                m = re.search(r"<!-- schema: problems -->\s*```json\n([\s\S]*?)\n```", f.read())
            _schema["s"] = json.loads(m.group(1)) if m else None
        except (OSError, ValueError) as e:
            print("livefig: no SCHEMA.md:", e, file=sys.stderr)
            _schema["s"] = None
    return _schema["s"]


def _type_ok(v, t):
    if isinstance(t, list):
        return any(_type_ok(v, x) for x in t)
    if t == "integer":
        return isinstance(v, int) and not isinstance(v, bool)
    if t == "number":
        return isinstance(v, (int, float)) and not isinstance(v, bool)
    return isinstance(v, {"string": str, "boolean": bool, "object": dict, "array": list, "null": type(None)}[t])


def valid(v, s, root):
    """True when v satisfies JSON Schema s (the 2020-12 subset SCHEMA.md uses; an unknown keyword fails closed)"""
    if s is True or s == {}:
        return True
    if s is False:
        return False
    for k, a in s.items():
        if k in ("description", "default", "$comment", "title", "examples"):
            continue
        if k == "$ref":
            ok = valid(v, root["$defs"][a.rsplit("/", 1)[-1]], root)
        elif k == "type":
            ok = _type_ok(v, a)
        elif k == "enum":
            ok = any(v == x and type(v) is type(x) or (isinstance(v, (int, float)) and not isinstance(v, bool) and v == x) for x in a)
        elif k == "const":
            ok = v == a and isinstance(v, bool) == isinstance(a, bool)
        elif k == "required":
            ok = not isinstance(v, dict) or all(x in v for x in a)
        elif k == "properties":
            ok = not isinstance(v, dict) or all(valid(v[p], ps, root) for p, ps in a.items() if p in v)
        elif k == "additionalProperties":
            ok = not isinstance(v, dict) or all(valid(v[p], a, root) for p in v if p not in s.get("properties", {}))
        elif k == "allOf":
            ok = all(valid(v, x, root) for x in a)
        elif k == "anyOf":
            ok = any(valid(v, x, root) for x in a)
        elif k == "oneOf":
            ok = sum(valid(v, x, root) for x in a) == 1
        elif k == "if":
            ok = valid(v, s.get("then", True), root) if valid(v, a, root) else valid(v, s.get("else", True), root)
        elif k in ("then", "else"):
            continue
        elif k == "prefixItems":
            ok = not isinstance(v, list) or all(valid(x, ps, root) for x, ps in zip(v, a))
        elif k == "items":
            ok = not isinstance(v, list) or all(valid(x, a, root) for x in v[len(s.get("prefixItems", [])):])
        elif k in ("minItems", "maxItems"):
            ok = not isinstance(v, list) or (len(v) >= a if k == "minItems" else len(v) <= a)
        elif k == "uniqueItems":
            ok = not isinstance(v, list) or not a or len({json.dumps(x, sort_keys=True) for x in v}) == len(v)
        elif k in ("minLength", "maxLength"):
            ok = not isinstance(v, str) or (len(v) >= a if k == "minLength" else len(v) <= a)
        elif k == "pattern":
            ok = not isinstance(v, str) or re.search(a, v) is not None
        elif k in ("minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum"):
            ok = not _type_ok(v, "number") or {"minimum": v >= a, "maximum": v <= a, "exclusiveMinimum": v > a, "exclusiveMaximum": v < a}[k]
        else:
            return False
        if not ok:
            return False
    return True


# ---------------- the numbers a figure may show ----------------
def nums(text):
    """every unsigned number written in the text (9.8, 10^{3} -> 10 and 3)"""
    return [float(x) for x in NUM_RE.findall(str(text))]


def _eq(a, b):
    return abs(a - b) <= 1e-9 * max(1.0, abs(b))


def _sig3(a, b):
    return b != 0 and abs(a - b) <= 0.5 * 10 ** (math.floor(math.log10(abs(b))) - 2) * (1 + 1e-9) or a == b == 0


def kinds_for(subject):
    """the kinds a figure may be for this subject (fail closed: anything unknown gets DEFAULT_KINDS)"""
    return SUBJECT_KINDS.get(subject.split(".")[0].lower(), DEFAULT_KINDS) if isinstance(subject, str) else DEFAULT_KINDS


def vertices(body):
    """the question's vertex labels: the node ids and labels of its bank network figure, else its lone capital letters (A, B, ...)"""
    out = set()
    for b in body:
        if isinstance(b, dict) and b.get("kind") == "network":
            for x in b.get("nodes", []):
                out |= {x} if isinstance(x, str) else {x.get("id"), x.get("label")} - {None}
    text = " ".join(str(b.get("md", "")) for b in body if isinstance(b, dict))
    return {v.strip("$ ") for v in out} if out else set(re.findall(r"(?<![A-Za-z\\])[A-Z](?![A-Za-z])", text))


class Ctx:
    """one reply's figure context: the numbers it may show (givens) and the ones it must not (the hidden unknown), the kinds this
    subject allows and the question's vertex labels (a network may only name those); drawn = the question has its own network figure
    (already on screen: a live copy of it is dropped)"""
    def __init__(self, code, givens, answers, kinds=DEFAULT_KINDS, verts=(), drawn=False):
        self.code, self.givens, self.answers, self.kinds, self.verts, self.drawn = code, givens, answers, kinds, set(verts), drawn


def context(code, question, key, answer_values, more="", subject=None, verts=(), drawn=False):
    """givens = numbers in the question text, `more` (shown choices, sheet formulas) and the KEY's work, plus 0-10; answers = the hidden
    unknown's value(s) (and a \\boxed{} in the KEY) that the question text itself does not already show"""
    q = nums(question) + [float(WORD_NUMS[w]) for w in re.findall(r"[a-z]+", str(question).lower()) if w in WORD_NUMS]   # "five miles" is given
    boxed = [n for b in re.findall(r"\\boxed\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}", str(key)) for n in nums(b)]
    ans = [abs(a) for a in [*answer_values, *boxed] if math.isfinite(a) and a != 0 and not any(_eq(abs(a), g) for g in q)]
    # the unknown in another unit / power of ten: 23.3 -> 2.33; never one the question shows (W113: CPA's answer 10 became 1, so every
    # loop-trace table that wrote the code's own "i = 1" was dropped as a leak)
    ans += [s for s in (a / 10 ** math.floor(math.log10(a)) for a in ans if not 1 <= a < 10) if not any(_eq(s, g) for g in q)]
    givens = set(q) | set(nums(more)) | set(nums(key)) | set(range(0, 11))
    return Ctx(code, givens, sorted(set(ans)), kinds_for(subject), verts, drawn)


# ---------------- the gate ----------------
def _walk(v, key, out):
    """(key, value) for every leaf (strings and numbers), the key being the nearest property name"""
    if isinstance(v, dict):
        for k, x in v.items():
            _walk(x, k, out)
    elif isinstance(v, list):
        for x in v:
            _walk(x, key, out)
    else:
        out.append((key, v))
    return out


STEP_RE = re.compile(r"^\d{1,2}$")
WORD_NUMS = {w: i for i, w in enumerate("zero one two three four five six seven eight nine ten eleven twelve".split())}


def _labels(g):
    n = 0
    for m in g.get("marks", []):
        n += ("label" in m) + ("text" in m)
    for ax in ("x", "y"):
        a = g.get(ax) or {}
        n += ("label" in a) + len(a.get("ticks") or [])
    for gr in g.get("groups", []):
        n += 1 + len(gr.get("bars") or [])
    n += sum(1 for x in g.get("nodes", []) if isinstance(x, dict) and "label" in x)
    n += sum(1 for e in g.get("edges", []) if "label" in e and not STEP_RE.match(str(e["label"])))   # "1", "2": the step order, free
    return n


# ---------------- the scene model pre-pass: graph.js fix() in Python, same numbers (fable audit 2026-10-29 U1) ----------------
# A box/disk within 0.6 h of a ramp / surface / solid seg rests on it (bottom edge on the line, a box at its angle); points on a body ride
# along; a force tail just off a body is re-anchored to its centre; weight points down, normal and friction sit on the surface axes.
# Codes are findings, not drops: the figure goes out fixed. Conformance: tests/fixtures/livefig.json "contact" want = graph.js output.
FIX = {"snap": 0.6, "tol": 0.02, "near": 0.25, "turn": 1, "down": 0.5}
WEIGHT, NORMAL, FRICTION = {"mg", "W", "w", "F_g", "F_G", "F_grav"}, {"N", "n", "F_N", "F_n"}, {"f", "f_k", "f_s", "F_f", "F_fr"}
_DEG = math.pi / 180


def _sym(label):
    if not isinstance(label, str):
        return ""
    s = label.replace("$", "").split("=")[0]
    s = re.sub(r"\\(vec|mathbf|boldsymbol|overrightarrow|mathrm|text)(?![a-zA-Z])", "", s)
    return re.sub(r"[{}\s]", "", re.sub(r"\\[,;: !]", "", s))


def _pt(p):
    return isinstance(p, list) and len(p) >= 2 and all(isinstance(x, (int, float)) and not isinstance(x, bool) and math.isfinite(x) for x in p[:2])


def _rot(p, a):
    return [p[0] * math.cos(a) - p[1] * math.sin(a), p[0] * math.sin(a) + p[1] * math.cos(a)]


def _ang(v):
    return math.atan2(v[1], v[0]) / _DEG


def _turn(a, b, n=360):
    d = (a - b) % n
    return min(d, n - d)


def _num(v):
    return v if isinstance(v, (int, float)) and not isinstance(v, bool) else 0


def incline_pts(m):
    """graph.js inclinePts: [foot, base end, top]"""
    sx = -1 if m.get("flip") else 1
    b = [m["at"][0] + sx * m["base"], m["at"][1]]
    return [m["at"], b, [b[0], b[1] + m["base"] * math.tan(m["angle"] * _DEG)]]


def _solid(m):
    if m.get("mark") != "body" or not _pt(m.get("at")):
        return None
    w, h, r = _num(m.get("w")), _num(m.get("h")), _num(m.get("r"))
    if m.get("shape") == "box":
        return {"box": True, "hw": w / 2, "hh": h / 2, "H": h, "size": max(w, h)} if w > 0 and h > 0 else None
    if m.get("shape") in ("dot", "rod") or not r > 0:
        return None
    return {"box": False, "hw": r, "hh": r, "H": 2 * r, "size": 2 * r}


def _surfaces(marks):
    out = []
    for m in marks:
        k = m.get("mark")
        try:
            if k == "incline":
                v = incline_pts(m)
                a, b, up = v[0], v[2], -1 if m.get("flip") else 1
            elif k == "surface":
                a, b, up = m.get("from"), m.get("to"), -1 if m.get("side") == "left" else 1
            elif k == "seg" and not m.get("dash"):
                a, b, up = m.get("from"), m.get("to"), 0
            else:
                continue
        except (KeyError, TypeError, IndexError):
            continue
        if not _pt(a) or not _pt(b):
            continue
        L = math.hypot(b[0] - a[0], b[1] - a[1])
        if L > 0:
            out.append({"a": a, "b": b, "u": [(b[0] - a[0]) / L, (b[1] - a[1]) / L], "L": L, "up": up})
    return out


def _local(p, q):
    return _rot([p[0] - q["c"][0], p[1] - q["c"][1]], -q["ang"] * _DEG)


def _outside(l, k):
    if k["box"]:
        return math.hypot(max(abs(l[0]) - k["hw"], 0), max(abs(l[1]) - k["hh"], 0))
    return max(math.hypot(l[0], l[1]) - k["hw"], 0)


def fix(marks):
    """(fixed copy of a scene's marks, sorted finding codes): contact / anchor / direction. Mirrors graph.js fix()."""
    codes, out = set(), [dict(m) if isinstance(m, dict) else m for m in marks]
    out_d = [m for m in out if isinstance(m, dict)]
    surf, bodies = _surfaces(out_d), []
    paths = [p for m in out_d if m.get("mark") == "path" for p in (m.get("pts") or []) if _pt(p)]
    for m in out_d:
        k = _solid(m)
        if not k:
            continue
        q = {"m": m, "k": k, "c": m["at"], "ang": _num(m.get("angle")) or 0}
        q["c1"], q["ang1"], q["rest"] = q["c"], q["ang"], None
        bodies.append(q)
        if any(math.hypot(p[0] - q["c"][0], p[1] - q["c"][1]) <= FIX["near"] * k["size"] for p in paths):
            continue
        best = None
        for s in surf:
            rx, ry = q["c"][0] - s["a"][0], q["c"][1] - s["a"][1]
            t, dl = rx * s["u"][0] + ry * s["u"][1], s["u"][0] * ry - s["u"][1] * rx
            if t < 0 or t > s["L"]:
                continue
            side = s["up"] or (1 if dl >= 0 else -1)
            gap = side * dl - k["hh"]
            if abs(gap) > FIX["snap"] * k["H"]:
                continue
            if not s["up"] and any(_outside(_local(p, q), k) <= FIX["tol"] * k["size"] for p in (s["a"], s["b"])):
                continue
            if best is None or abs(gap) < abs(best[3]):
                best = (s, side, t, gap)
        if best is None:
            continue
        s, side, t, gap = best
        n = [-side * s["u"][1], side * s["u"][0]]
        q["c1"] = [s["a"][0] + t * s["u"][0] + k["hh"] * n[0], s["a"][1] + t * s["u"][1] + k["hh"] * n[1]]
        tilt = _ang(s["u"])
        tilt = tilt - 180 if tilt > 90 else tilt + 180 if tilt <= -90 else tilt
        if k["box"]:
            q["ang1"] = tilt
        q["rest"] = {"n": n, "u": s["u"]}
        if abs(gap) > FIX["tol"] * k["H"] or (k["box"] and _turn(q["ang"], q["ang1"], 180) > FIX["turn"]):
            codes.add("contact")
        m["at"] = q["c1"]
        if k["box"]:
            m["angle"] = q["ang1"]

    def owner(p):
        best = None
        if not _pt(p):
            return None
        for q in bodies:
            l = _local(p, q)
            d = _outside(l, q["k"])
            if d <= FIX["near"] * q["k"]["size"] and (best is None or d < best[2]):
                best = (q, l, d)
        return best

    def ride(o):
        r = _rot(o[1], o[0]["ang1"] * _DEG)
        return [o[0]["c1"][0] + r[0], o[0]["c1"][1] + r[1]]

    def on(o):
        return o is not None and o[2] <= FIX["tol"] * o[0]["k"]["size"]

    for m in out_d:
        k = m.get("mark")
        if k == "force":
            o = owner(m.get("at"))
            if o:
                if on(o):
                    m["at"] = ride(o)
                else:
                    m["at"] = o[0]["c1"]
                    codes.add("anchor")
            s, frame = _sym(m.get("label")), _num(m.get("frame"))
            d = (_num(m.get("angle")) or 0) + (frame or 0)
            rest = o[0]["rest"] if o else None
            want, tol = None, FIX["turn"]
            if s in WEIGHT:
                want, tol = 270, FIX["down"]
            elif rest and s in NORMAL:
                want = _ang(rest["n"])
            elif rest and s in FRICTION:
                a = _ang(rest["u"])
                want = a if _turn(d, a) <= _turn(d, a + 180) else a + 180
            if want is not None and _turn(d, want) > tol:
                m["angle"] = (want - (frame or 0)) % 360
                codes.add("direction")
        elif k == "arrow":
            o = owner(m.get("from"))
            if on(o):
                p = ride(o)
                dx, dy = p[0] - m["from"][0], p[1] - m["from"][1]
                m["from"] = p
                if isinstance(m.get("to"), list):
                    m["to"] = [m["to"][0] + dx, m["to"][1] + dy]
        elif k == "spring":
            for e in ("from", "to"):
                o = owner(m.get(e))
                if on(o):
                    m[e] = ride(o)
        elif k == "rope" and isinstance(m.get("pts"), list) and m["pts"]:
            m["pts"] = list(m["pts"])
            for i in {0, len(m["pts"]) - 1}:
                o = owner(m["pts"][i])
                if on(o):
                    m["pts"][i] = ride(o)
    return out, sorted(codes)


def check(g, ctx, warn=None):
    """None when the figure may be shown, else the reason it is dropped (a short code, logged; never shown).
    warn: a list that gets the scene pre-pass findings (contact / anchor / direction): the figure is not dropped for those, it is
    shown fixed (fixed(g)); the later rules (dash-force, no-force) read the fixed marks."""
    s = schema()
    if s is None:
        return "no-schema"
    if not isinstance(g, dict) or g.get("type") != "graph" or g.get("kind") not in KINDS:
        return "kind"
    if g["kind"] not in ctx.kinds:
        return "subject"                     # a network on a physics question, a scene on a graph-theory one
    if len(json.dumps(g)) > MAX_JSON:
        return "size"
    if not valid(g, s["$defs"]["graph"], s):
        return "schema"
    kind, marks = g["kind"], g.get("marks", [])
    if len(marks) > MAX_MARKS or any(m.get("mark") not in KINDS[kind] for m in marks):
        return "mark"
    if any(len(m.get("pts") or []) > MAX_PTS for m in marks) or len(g.get("nodes", [])) > MAX_NODES or len(g.get("edges", [])) > MAX_EDGES:
        return "size"
    if len(g.get("groups", [])) > MAX_GROUPS or any(len(gr["bars"]) > MAX_BARS for gr in g.get("groups", [])) or len(g["alt"]) > MAX_ALT:
        return "size"
    if _labels(g) > MAX_LABELS:
        return "labels"
    if kind == "scene":
        marks, found = fix(marks)
        if warn is not None:
            warn.extend(found)
    bodies =[tuple(m["at"]) for m in marks if m.get("mark") == "body"]
    if any(m.get("mark") == "force" and m.get("dash") and tuple(m["at"]) in bodies for m in marks):
        return "dash-force"                  # SCHEMA.md: a force acting on the body is solid
    if kind == "network":
        ids = {x if isinstance(x, str) else x["id"] for x in g["nodes"]}
        if len(ids) != len(g["nodes"]) or any(e["from"] not in ids or e["to"] not in ids for e in g["edges"]) \
                or (g.get("layout") == "free" and not all(isinstance(x, dict) and "at" in x for x in g["nodes"])) \
                or (g.get("layout") == "tree" and g.get("root") not in ids):
            return "network"
        if any((x if isinstance(x, str) else x.get("label", x["id"])).strip("$ ") not in ctx.verts for x in g["nodes"]):
            return "vertex"                  # nodes are the question's own vertices (A, B, ...), never invented ones
        if ctx.drawn and ctx.verts <= vertices([g]) and (ctx.drawn is True or len(g["edges"]) >= ctx.drawn):
            return "copy"                    # the question's whole graph again: the student already sees it. drawn = its edge count:
            # a live graph on every vertex with FEWER edges is a subgraph (W113: the MST of CEQ_P7K, 5 of its edges, was dropped as a copy)
        if len(g["nodes"]) > MAX_LIVE_NODES:
            return "big"                     # the key subgraph only
    for k, v in _walk(g, None, []):
        if isinstance(v, bool):
            continue
        vals = [float(v)] if isinstance(v, (int, float)) else nums(v)
        if not all(math.isfinite(x) and abs(x) <= GEOM_MAX for x in vals):
            return "number"
        if k in EXPR_KEYS and isinstance(v, str) and not re.fullmatch(r"[0-9a-z+\-*/^().,\s]*", v):
            return "expr"
        if k not in DATA_KEYS or (k == "w" and kind != "network"):
            continue
        for x in vals:
            if any(_sig3(abs(x), a) for a in ctx.answers):
                return f"leak:{k}={x:g}"         # the field and the number only: never the model's text
            if not any(_eq(abs(x), n) for n in ctx.givens):
                return f"not-given:{k}={x:g}"
    if kind == "scene" and not any(m.get("mark") == "force" and tuple(m["at"]) in bodies for m in marks):
        return "no-force"                    # a physics scene is the forces on a body: at least one
    return None


def fixed(g):
    """the figure as it is drawn: a scene with fix() applied (any other kind, or a figure check() has not passed, as it came)"""
    if isinstance(g, dict) and g.get("kind") == "scene" and isinstance(g.get("marks"), list):
        return {**g, "marks": fix(g["marks"])[0]}
    return g


FENCE = re.compile(r"```[ \t]*([A-Za-z]*)[ \t]*\n?([\s\S]*?)\n?[ \t]*```")
# Opus sometimes fences its figure as :::fig ... ::: (1 of 6 physics replies, Oct 18; the JSON reached the student): a line-start :::
# is read as ``` (COLONS), and a line ending in ":" or "::" (or a bare newline) is held a chunk in case it opens one (HOLD).
COLONS = re.compile(r"(?<=\n)[ \t]*:::")
HOLD = re.compile(r"\n[ \t]*:{0,2}\Z")


def parse(body):
    try:
        return json.loads(body.strip())
    except ValueError:
        return None


class Fence:
    """the stream filter: text passes as it comes; a ``` fence is held until it closes, then the ONE first good figure goes out as
    "\\n```fig\\n<canonical json>\\n```\\n" in a single chunk and anything else in a fence is dropped. ctx None = strip every fence
    (the OpenRouter path, the kill switch). Never yields raw model JSON."""
    def __init__(self, ctx, slot=None):
        self.ctx, self.buf, self.shown, self.log, self.prev = ctx, "", 0, [], "\n"   # prev: the last model char consumed (line start?)
        # slot: a marker emitted ONCE in place of the first fence dropped while nothing is shown (slot_why = its reason), so a caller can
        # put a re-asked figure exactly there (W340 vf-physics-b: it went to the end, "Forces on the block:" sat over a gap)
        self.slot, self.slot_why = slot, None

    def _block(self, lang, body):
        if self.ctx is None:
            return self.log.append("off") or ""
        if self.shown >= FIGS_MAX:
            return self.log.append("second") or ""
        g = parse(body) if lang in ("fig", "json", "") else None
        warn = []
        why = "json" if g is None else check(g, self.ctx, warn)
        self.log.append(why or ("ok:" + "+".join(warn) if warn else "ok"))     # ok:contact+anchor = shown, fixed by the pre-pass
        # (no finding: sent as written; graph.js still snaps it exactly, the residual is under every tolerance)
        if why:
            return ""
        self.shown += 1
        return "\n```fig\n" + json.dumps(fixed(g) if warn else g, ensure_ascii=False, separators=(",", ":")) + "\n```\n"

    def feed(self, chunk):
        self.buf += chunk
        out = []
        while True:
            self.buf = COLONS.sub("```", self.prev + self.buf)[1:]    # :::fig / :::json / bare ::: at a line start: a fence too
            i = self.buf.find("```")
            if i < 0:
                h = HOLD.search(self.prev + self.buf)
                cut = min(len(self.buf.rstrip("`")), max(h.start() - 1, 0) if h else len(self.buf))   # 1-2 backticks or "\n::" may open one
                out.append(self.buf[:cut])
                self.prev, self.buf = (self.buf[:cut] or self.prev)[-1], self.buf[cut:]
                break
            out.append(self.buf[:i])
            self.prev, self.buf = (self.buf[:i] or self.prev)[-1], self.buf[i:]
            m = FENCE.match(self.buf)
            if not m:
                if len(self.buf) > FENCE_MAX:            # never closes in reach: drop it and what it held
                    self.log.append("size")
                    self.buf = ""
                break
            blk = self._block(m.group(1).lower(), m.group(2))
            if not blk and self.slot and not self.shown and self.log and self.log[-1].split(":")[0] not in ("ok", "off", "second", "views-off"):
                blk, self.slot, self.slot_why = self.slot, None, self.log[-1].split(":")[0]
            out.append(blk)
            self.prev, self.buf = "`", self.buf[m.end():]
        return "".join(out)

    def end(self):
        """the stream is over: an unclosed fence is dropped, a lone backtick tail goes out"""
        tail = "" if "```" in self.buf else self.buf
        if "```" in self.buf:
            self.log.append("unclosed")
        self.buf = ""
        return tail

    def report(self, what):
        if self.log:
            print(f"fig {self.ctx.code if self.ctx else '-'} {what}: " + ",".join(self.log), file=sys.stderr)   # reason codes only


STRIP = re.compile(r"\n?(```|:::)[\s\S]*?(?:\1|$)\n?")


def strip(text):
    """a history turn without its fig fence, ``` or ::: (the chat sends the box text back)"""
    return STRIP.sub("\n", text).strip()



def weave(system):
    """the base prompt with the figure written into it (Haiku skipped a figure the add-on alone asked for, Oct 17 live test):
    FORMAT's "no code" gets its one exception, and the genie's Order gains the figure right after the "what the pick assumed" line"""
    system = system.replace("no code,", "no code (except the one ```fig block),", 1)
    lines, out = system.split("\n"), []
    for l in lines:
        out.append(l)
        if l.startswith("- One sentence on what the student's pick assumed"):
            out.append("- The figure: one ```fig block (FIGURE below), the picture the steps prove: the forces on the body, energy bars, a graph.")
    return "\n".join(out)


EXAMPLE = {   # one tiny valid figure per kind, shown in the prompt for the kinds this question allows (scene: the box RESTS on the ramp:
    # surface 1.155 at x = 0, + (h/2)/cos 30 = 1.443; it was at 1.2, 0.243 sunk, and taught Opus to sink: fable audit 2026-10-29)
    "scene": '{"type":"graph","kind":"scene","alt":"Forces on the block on the ramp.","marks":[{"mark":"incline","at":[-2,0],"base":4,"angle":30},{"mark":"body","at":[0,1.443],"shape":"box","w":0.8,"h":0.5,"angle":30},{"mark":"force","at":[0,1.443],"angle":270,"len":1.4,"label":"$mg$"},{"mark":"force","at":[0,1.443],"angle":120,"len":1.2,"label":"$F_N$"}]}',
    "cartesian": '{"type":"graph","kind":"cartesian","alt":"The line y = 2x + 1.","x":{"min":0,"max":4,"label":"$x$"},"y":{"min":0,"max":10,"label":"$y$"},"marks":[{"mark":"fn","y":"2*x+1"}]}',
    "bars": '{"type":"graph","kind":"bars","alt":"Energy before and after.","unit":"J","groups":[{"label":"before","bars":[{"label":"$K$","value":8}]},{"label":"after","bars":[{"label":"$U$","value":8}]}]}',
    "network": '{"type":"graph","kind":"network","alt":"Only the odd cycle A, B, C, not the whole graph.","nodes":["A","B","C"],"edges":[{"from":"A","to":"B"},{"from":"B","to":"C"},{"from":"C","to":"A"}]}',
}



def rule(ctx):
    """RULE for this question: the kinds it allows, one tiny example each, and (network) the vertex labels it may use"""
    return RULE + rule_tail(ctx)


def rule_tail(ctx):
    """the part of rule(ctx) that changes per question (RULE itself is fixed, so a caller may cache it apart)"""
    ks = [k for k in ("scene", "cartesian", "bars", "network") if k in ctx.kinds]
    out = "\nTHIS question allows ONLY these kinds: " + ", ".join(ks) + ". Any other kind is dropped. One tiny valid example each:"
    out += "".join(f"\n- {k}: {EXAMPLE[k]}" for k in ks)
    if "scene" in ks:
        out += "\nA scene is the forces on a body: at least one force arrow drawn at the body's own point."
    if "network" in ks:
        out += "\nNetwork nodes are the question's own vertex labels" + (" (" + ", ".join(sorted(ctx.verts)) + ")" if ctx.verts else "") + ", never new names."
        if len(ctx.verts) > MAX_LIVE_NODES:
            out += f" Pick the few vertices that matter (an odd cycle, a path), at most {MAX_LIVE_NODES}."
    return out


RULE = """
FIGURE (the one exception to "no code" in Format: this fence is allowed): draw ONE figure (never two) in every reply unless the reply is pure arithmetic with nothing to picture. Read the intent and match the kind to the subject:
- graphs and trees (MST, Kruskal, Prim, shortest path, Dijkstra, coloring, BFS/DFS): "network"; draw only the part that proves the idea: the odd cycle, the path, the cut, the edge that changes things. At most 6 nodes. The question's own graph is already on screen; never redraw it. Weighted edges get "w"; the edges chosen get "color":"c1" and "label" "1", "2", ... in the order chosen; a coloring colors the nodes.
- forces, free-body, incline, spring, pulley: "scene" with the body and every force arrow.
- motion over time, F-x, PV, work as an area: "cartesian", the area shaded.
- energy before/after, an energy split: "bars".
- orbits: "scene": a disk for the planet, a dot for the satellite, an arc for the orbit, the force arrow toward the center, radii as seg.
Physics never uses "network"; a graph-theory question always does. In a wish (the numbered steps) it goes right after the sentence on what the pick assumed; in a chat reply, after the first paragraph. Write it as data: a line ```fig, then the figure as ONE line of JSON, then a line ```. Nothing else inside the fence, and never mention the fence or JSON. The line right before the fence names what is drawn ("Forces on the block:", "The graph on A to D:").
The JSON is a graph block: {"type":"graph","kind":K,"alt":"one sentence, never the answer",...}. K and its keys:
- "cartesian": "x":{"min":a,"max":b,"label":"$x$"},"y":{...},"marks":[...]; marks: fn {"mark":"fn","y":"2*x+1"}, shade {"f","g","from","to"}, vline {"x"}, hline {"y"}, point {"at":[x,y]}, seg/arrow {"from":[x,y],"to":[x,y]}, arc {"at","r","from","to"}, poly {"pts"}, text {"at","text"}; geometry: right {"at":corner,"from","to"} (right-angle square), dim {"from","to","label","side":"l|r"} (a length), angle {"at":vertex,"from","to","label"} (arc + label), circle {"c":[x,y],"r"}. Set "equal":true for geometry.
- "scene" (physics, y up, auto-fit): "marks": body {"at","shape":"box|dot|disk","w","h","r"}, force {"at","angle","len"} (degrees from +x), surface {"from","to","side":"left|right"}, incline {"at","base","angle"}, spring {"from","to"}, rope {"pts"}, pulley {"at","r"}, pivot {"at"}, point, seg, arrow, arc, text, right, dim, angle, circle.
- "bars": "unit":"J","groups":[{"label":"before","bars":[{"label":"$K$","value":8}]}] (at most 3 groups of 4 bars).
- "network": "nodes":["a","b"],"edges":[{"from":"a","to":"b","w":4,"color":"c1","label":"1"}] (at most 6 nodes: the key subgraph).
Any mark may add "label" ("$F_N$"), "color" (c1 c2 c3 ink muted), "dash": true. At most 6 labels, 12 marks.
The figure shows the SETUP: the objects, the forces or the given values, and the steps' inputs. Numbers in labels, text, values and expressions: copy them exactly as the QUESTION or the KEY writes them, never round or compute a new one; when unsure, use a symbol ("$mg$", "$d$") instead. Never the answer or the unknown's value, not even in another unit: label the unknown with its symbol and "?" ("$k = ?$")."""

# RULE for the v4 letter (prompt audit R3/R4, Tony Oct 22): the letter decides WHEN to draw ("Draw readily"; words only needs a reason) and has
# its own layout, so the old path's "every reply", "no code" exception and wish placement go; caps the tail or the gate already state go too.
RULE_V4 = (RULE
           .replace('FIGURE (the one exception to "no code" in Format: this fence is allowed): draw ONE figure (never two) in every reply unless the reply is pure arithmetic with nothing to picture.',
                    'FIGURE: a ```fig block is one figure; a reply holds at most two visuals (VISUALS below).')
           .replace(' At most 6 nodes.', '', 1)
           .replace('\nPhysics never uses "network"; a graph-theory question always does.', '')
           .replace(' In a wish (the numbered steps) it goes right after the sentence on what the pick assumed; in a chat reply, after the first paragraph.',
                    ' Put it right after the line it pictures.'))

