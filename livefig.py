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
KINDS = {"cartesian": {"fn", "shade", "vline", "hline", "point", "seg", "arrow", "arc", "poly", "text"},
         "scene": {"body", "spring", "pulley", "rope", "surface", "incline", "force", "pivot", "point", "seg", "arrow", "arc", "text"},
         "bars": set(), "network": set()}
MAX_JSON, MAX_MARKS, MAX_LABELS, MAX_NODES, MAX_EDGES, MAX_GROUPS, MAX_BARS, MAX_PTS, MAX_ALT = 3000, 12, 6, 8, 16, 3, 4, 12, 200
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
    subject allows and the question's vertex labels (a network may only name those)"""
    def __init__(self, code, givens, answers, kinds=DEFAULT_KINDS, verts=()):
        self.code, self.givens, self.answers, self.kinds, self.verts = code, givens, answers, kinds, set(verts)


def context(code, question, key, answer_values, more="", subject=None, verts=()):
    """givens = numbers in the question text, `more` (shown choices, sheet formulas) and the KEY's work, plus 0-10; answers = the hidden
    unknown's value(s) (and a \\boxed{} in the KEY) that the question text itself does not already show"""
    q = nums(question)
    boxed = [n for b in re.findall(r"\\boxed\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}", str(key)) for n in nums(b)]
    ans = [abs(a) for a in [*answer_values, *boxed] if math.isfinite(a) and a != 0 and not any(_eq(abs(a), g) for g in q)]
    ans += [a / 10 ** math.floor(math.log10(a)) for a in ans if not 1 <= a < 10]   # the unknown in another unit / power of ten: 23.3 -> 2.33
    givens = set(q) | set(nums(more)) | set(nums(key)) | set(range(0, 11))
    return Ctx(code, givens, sorted(set(ans)), kinds_for(subject), verts)


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
    n += sum(1 for e in g.get("edges", []) if "label" in e)
    return n


def check(g, ctx):
    """None when the figure may be shown, else the reason it is dropped (a short code, logged; never shown)"""
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
    bodies = [tuple(m["at"]) for m in marks if m.get("mark") == "body"]
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


FENCE = re.compile(r"```[ \t]*([A-Za-z]*)[ \t]*\n?([\s\S]*?)\n?[ \t]*```")


def parse(body):
    try:
        return json.loads(body.strip())
    except ValueError:
        return None


class Fence:
    """the stream filter: text passes as it comes; a ``` fence is held until it closes, then the ONE first good figure goes out as
    "\\n```fig\\n<canonical json>\\n```\\n" in a single chunk and anything else in a fence is dropped. ctx None = strip every fence
    (the OpenRouter path, the kill switch). Never yields raw model JSON."""
    def __init__(self, ctx):
        self.ctx, self.buf, self.shown, self.log = ctx, "", 0, []

    def _block(self, lang, body):
        if self.ctx is None:
            return self.log.append("off") or ""
        if self.shown:
            return self.log.append("second") or ""
        g = parse(body) if lang in ("fig", "json", "") else None
        why = "json" if g is None else check(g, self.ctx)
        self.log.append(why or "ok")
        if why:
            return ""
        self.shown += 1
        return "\n```fig\n" + json.dumps(g, ensure_ascii=False, separators=(",", ":")) + "\n```\n"

    def feed(self, chunk):
        self.buf += chunk
        out = []
        while True:
            i = self.buf.find("```")
            if i < 0:
                cut = len(self.buf.rstrip("`"))   # a tail of 1-2 backticks may open a fence
                out.append(self.buf[:cut])
                self.buf = self.buf[cut:]
                break
            out.append(self.buf[:i])
            self.buf = self.buf[i:]
            m = FENCE.match(self.buf)
            if not m:
                if len(self.buf) > FENCE_MAX:            # never closes in reach: drop it and what it held
                    self.log.append("size")
                    self.buf = ""
                break
            out.append(self._block(m.group(1).lower(), m.group(2)))
            self.buf = self.buf[m.end():]
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


STRIP = re.compile(r"\n?```[\s\S]*?(?:```|$)\n?")


def strip(text):
    """a history turn without its fig fence (the chat sends the box text back)"""
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


EXAMPLE = {   # one tiny valid figure per kind, shown in the prompt for the kinds this question allows
    "scene": '{"type":"graph","kind":"scene","alt":"Forces on the block on the ramp.","marks":[{"mark":"incline","at":[-2,0],"base":4,"angle":30},{"mark":"body","at":[0,1.2],"shape":"box","w":0.8,"h":0.5,"angle":30},{"mark":"force","at":[0,1.2],"angle":270,"len":1.4,"label":"$mg$"},{"mark":"force","at":[0,1.2],"angle":120,"len":1.2,"label":"$F_N$"}]}',
    "cartesian": '{"type":"graph","kind":"cartesian","alt":"The line y = 2x + 1.","x":{"min":0,"max":4,"label":"$x$"},"y":{"min":0,"max":10,"label":"$y$"},"marks":[{"mark":"fn","y":"2*x+1"}]}',
    "bars": '{"type":"graph","kind":"bars","alt":"Energy before and after.","unit":"J","groups":[{"label":"before","bars":[{"label":"$K$","value":8}]},{"label":"after","bars":[{"label":"$U$","value":8}]}]}',
    "network": '{"type":"graph","kind":"network","alt":"The graph on A, B, C.","nodes":["A","B","C"],"edges":[{"from":"A","to":"B"},{"from":"B","to":"C"}]}',
}


def rule(ctx):
    """RULE for this question: the kinds it allows, one tiny example each, and (network) the vertex labels it may use"""
    ks = [k for k in ("scene", "cartesian", "bars", "network") if k in ctx.kinds]
    out = RULE + "\nTHIS question allows ONLY these kinds: " + ", ".join(ks) + ". Any other kind is dropped. One tiny valid example each:"
    out += "".join(f"\n- {k}: {EXAMPLE[k]}" for k in ks)
    if "scene" in ks:
        out += "\nA scene is the forces on a body: at least one force arrow drawn at the body's own point."
    if "network" in ks:
        out += "\nNetwork nodes are the question's own vertex labels" + (" (" + ", ".join(sorted(ctx.verts)) + ")" if ctx.verts else "") + ", never new names."
    return out


RULE = """
FIGURE (the one exception to "no code" in Format: this fence is allowed): most replies carry ONE figure (never two) whenever a picture helps: a free-body diagram, a graph, energy bars, a network, an orbit. In a wish (the numbered steps) it goes right after the sentence on what the pick assumed; in a chat reply, after the first paragraph. Write it as data: a line ```fig, then the figure as ONE line of JSON, then a line ```. Nothing else inside the fence, and never mention the fence or JSON. The line right before the fence names what is drawn ("Forces on the block:", "The graph on A to D:").
The JSON is a graph block: {"type":"graph","kind":K,"alt":"one sentence, never the answer",...}. K and its keys:
- "cartesian": "x":{"min":a,"max":b,"label":"$x$"},"y":{...},"marks":[...]; marks: fn {"mark":"fn","y":"2*x+1"}, shade {"f","g","from","to"}, vline {"x"}, hline {"y"}, point {"at":[x,y]}, seg/arrow {"from":[x,y],"to":[x,y]}, arc {"at","r","from","to"}, poly {"pts"}, text {"at","text"}.
- "scene" (physics, y up, auto-fit): "marks": body {"at","shape":"box|dot|disk","w","h","r"}, force {"at","angle","len"} (degrees from +x), surface {"from","to","side":"left|right"}, incline {"at","base","angle"}, spring {"from","to"}, rope {"pts"}, pulley {"at","r"}, pivot {"at"}, point, seg, arrow, arc, text.
- "bars": "unit":"J","groups":[{"label":"before","bars":[{"label":"$K$","value":8}]}] (at most 3 groups of 4 bars).
- "network": "nodes":["a","b"],"edges":[{"from":"a","to":"b"}].
Any mark may add "label" ("$F_N$"), "color" (c1 c2 c3 ink muted), "dash": true. At most 6 labels, 12 marks.
The figure shows the SETUP: the objects, the forces or the given values, and the steps' inputs. Numbers in labels, text, values and expressions: copy them exactly as the QUESTION or the KEY writes them, never round or compute a new one; when unsure, use a symbol ("$mg$", "$d$") instead. Never the answer or the unknown's value, not even in another unit: label the unknown with its symbol and "?" ("$k = ?$")."""
