"""P4.1 server gate for Cluck's ```openui fences (render plan v2; sprint-render-v2 P4.1, spec H): one figure per reply in OpenUI Lang 1.0,
profile "stem", next to livefig's ```fig. Gate = parse -> schema -> checker -> leak -> stage per statement (oui.py, views/registry.json);
a failing statement is dropped, its siblings stay; the root failing (or nothing left to draw) drops the whole fence, the text still streams.
Numbers a student reads (labels, text) must be givens and never the answer to 3 sig figs: livefig's Ctx / nums / _eq / _sig3, imported.
Fence: livefig.Fence with an ```openui branch, so the hold-until-closed streaming and the visual count (fig + openui, livefig.FIGS_MAX) are shared.
Kill switch CLUCK_VIEWS (default on): 0 / off / false strips every ```openui fence."""
import json
import math
import os
import re
import sys

import livefig
import oui

ROOT = os.path.dirname(os.path.abspath(__file__))
# What a chat figure may hold: drawings and their captions, and a stepper (todo 113: a step ladder or a loop trace the student clicks
# through, Back / Next only, no server call); never a Predict (it needs an item and the server's /predict)
CHAT = {"View", "Geometry", "Graph", "Legend", "Table", "Head", "Text", "Callout", "Steps", "Step", "Tug", "Flip"}
GEO_CAPS = {"pts": 12, "marks": 12, "labels": 6}
GEO_MARKS = {"seg": 2, "circle": 2, "right": 3, "dim": 2, "angle": 3, "arrow": 2, "label": 1}   # name -> point / number args before the text
GEO_TEXT = {"dim", "angle", "arrow", "label"}
PT_RE = re.compile(r"^\s*([A-Za-z][A-Za-z0-9']{0,3})\s+(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$")
MARK_RE = re.compile(r"^\s*([a-z]+)\s*\((.*)\)\s*$")
TONES = {"ink", "muted", "c1", "c2", "c3", "ok", "bad", "mark", "sky", "amber", "orange", "violet", "pink", "cyan"}     # the figure palette (app.css --fig-<hue>-1..3); views.js TONES
EMPH_RE = re.compile(r"^(layer|tone)\s*=\s*(\w+)$", re.I)
_c = {}


def on():
    """CLUCK_VIEWS: default on; 0 / off / false / no strips every ```openui fence"""
    return os.environ.get("CLUCK_VIEWS", "1").strip().lower() not in ("0", "off", "false", "no")


def registry():
    if "reg" not in _c:
        with open(os.path.join(ROOT, "views", "registry.json"), encoding="utf-8") as f:
            _c["reg"] = json.load(f)
        with open(os.path.join(ROOT, "views", "library.json"), encoding="utf-8") as f:
            _c["cat"] = oui.compile_schema(json.load(f)["schema"])
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


def graph_emph(props):
    """None when a Graph's layer ("A:2 B-C:3") and tone ("A:c2 B-C:bad") props hold only 1|2|3 / palette hues, else the reason (W157)"""
    for key, ok in (("layer", lambda v: v in ("1", "2", "3")), ("tone", lambda v: v.lower() in TONES)):
        for tok in re.split(r"[\s,]+", str(props.get(key) or "").strip()):
            if tok and (":" not in tok or not ok(tok.rsplit(":", 1)[1])):
                return f"graph-{key}"
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
        while len(args) > 1 and (t := EMPH_RE.match(args[-1])):      # trailing layer=N / tone=hue (W157): figure emphasis, either order
            if (t.group(1).lower() == "layer" and t.group(2) not in ("1", "2", "3")) or (t.group(1).lower() == "tone" and t.group(2).lower() not in TONES):
                return "geo-emph", []
            args.pop()
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


SIZE_RE = re.compile(r"\|\s*(up|down|same)\s+[1-9]\b", re.I)
TUG_ROW = re.compile(r"^\s*[^|]{1,10}\|[^|]{0,24}\|\s*(?:up|down|same)(?:\s+[1-9])?\s*(?:\|[^|]{1,60})?$", re.I)   # label | move | up|down|same [size] [| why]: tug.mjs parseRow


def tug_flip(el):
    """Tug / Flip rows (TUG-VIEW.md): a Tug row off the grammar -> tug:row, a Tug net -> stage:Tug.net (net is the end knot's answer: post only, and a Cluck
    reply is never post), a Flip row without exactly 3 cells -> flip:row. A bad statement is dropped; the caps (6 / 4 rows) are _caps'."""
    p = el.get("props") or {}
    if el.get("typeName") == "Tug":
        if p.get("net"):
            return "stage:Tug.net"
        if not all(isinstance(r, str) and TUG_ROW.match(r) for r in p.get("rows") or []):
            return "tug:row"
    if el.get("typeName") == "Flip" and not all(isinstance(r, list) and len(r) == 3 and all(isinstance(c, str) for c in r) for r in p.get("rows") or []):
        return "flip:row"
    return None


def check_element(el, ctx):
    """None when one statement's element may be drawn in a Cluck reply, else the reason (a short code, logged; never shown)"""
    reg = registry()
    name = el.get("typeName")
    comp = reg["components"].get(name)
    if comp is None or comp.get("ships") == "planned":
        return f"unknown:{name}"
    if name not in CHAT:
        return f"chat:{name}"
    for k in el.get("props") or {}:
        if k in reg["banned_props"] or k not in comp["props"]:
            return f"schema:{name}.{k}"
    for k, v in (el.get("props") or {}).items():
        why = _caps(v, comp["props"].get(k), f"{name}.{k}")
        if why:
            return why
    why = tug_flip(el)
    if why:
        return why
    key_ref = re.compile(reg["key_ref"])
    texts = _words(el, reg)
    if name == "Tug":                                 # the pull size ("up 3") is a bar length, not a number the student reads: not a leak, not "not-given"
        texts = [(k, SIZE_RE.sub(r"| \1", t)) if k == "rows" else (k, t) for k, t in texts]
    if name == "Graph":
        why = graph_emph(el["props"])
        if why:
            return why
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


def _source(stmts, root_kids):
    return "\n".join([f"root = View([{', '.join(root_kids)}])"] + [raw for sid, raw in stmts])


def bare_steps(el):
    """W340 (Tony, Oct 29 17:3x: a stepper needs a real picture per step): a Steps with neither a figure nor a table is dropped
    ("steps-nofig"); the reply re-asks once for the figure, in place, else shows its captions as plain numbered lines (steps_plain)"""
    p = (el.get("props") or {}) if el.get("typeName") == "Steps" else None
    return "steps-nofig" if p is not None and not p.get("fig") and not p.get("head") else None


def steps_plain(body):
    """the captions of a dropped figure-less Steps as plain numbered lines ("" when there is none): the stepper's words, no chrome"""
    try:
        res = oui.parse(body, catalog(), "View")
    except Exception:  # noqa: BLE001
        return ""
    for k in (res.get("root") or {}).get("props", {}).get("children") or []:
        if isinstance(k, dict) and bare_steps(k):
            caps = [str((s.get("props") or {}).get("cap") or "").strip() for s in k["props"].get("steps") or [] if isinstance(s, dict)]
            caps = [c for c in caps if c]
            if caps:
                return "\n" + "\n".join(f"**{i}.** {c}" for i, c in enumerate(caps, 1)) + "\n"   # bold "1.": a plain line, not the app's step widget (it would take in the lines after it)
    return ""


def trim_tug(el, raw):
    """a Tug with a bad row or a net is trimmed, not dropped (bench Nov 4: 3 of 44 replies lost their Tug to one bad row / a net): the bad rows go
    (the Tug stays when >= 2 good rows remain), the net line goes. Rewrites the element's props and raw[statementId]; returns the log codes.
    Caps and schema errors (a 7th row, a long string) are not trimmed: those drop the statement, as before. A leak is checked after the trim, on what is left."""
    p, sid = el.get("props") or {}, el.get("statementId")
    rows = p.get("rows")
    if not isinstance(rows, list) or not sid or sid not in raw:
        return []
    good = [r for r in rows if isinstance(r, str) and TUG_ROW.match(r)]
    codes = []
    if len(good) != len(rows):
        if len(good) < 2:
            return []                                   # too little left: tug_flip drops it (tug:row)
        codes.append(f"{sid}:trim:Tug.row")
    if p.get("net"):
        codes.append(f"{sid}:trim:Tug.net")
    if not codes:
        return []
    p["rows"] = good
    p.pop("net", None)
    q = lambda s: json.dumps(s, ensure_ascii=False)     # noqa: E731
    args = [q(good)] + ([q(p["of"])] if p.get("of") else ["null"] if p.get("alt") else []) + ([q(p["alt"])] if p.get("alt") else [])
    raw[sid] = f"{sid} = Tug({', '.join(args)})"
    return codes


def gate(body, ctx):
    """(program text, log codes) for one closed ```openui fence body; program None = the whole fence is dropped"""
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
    log, keep = [], []
    for k in kids:
        sid = k["statementId"]
        why = errs.get(sid)
        for el in _elements(k, []):
            if el.get("typeName") == "Tug" and not errs.get(el.get("statementId")):
                log += trim_tug(el, raw)
            why = why or errs.get(el.get("statementId")) or check_element(el, ctx)
        why = why or bare_steps(k)
        if why:
            log.append(f"{sid}:{why}")
        else:
            keep.append(sid)
    log += [f"{sid}:{code}" for sid, code in errs.items() if sid not in keep and not any(x.startswith(f"{sid}:") for x in log)]
    if not keep:
        return None, log + ["empty"]
    used = {el.get("statementId") for k in kids if k["statementId"] in keep for el in _elements(k, [])}
    prog = _source([(sid, raw[sid]) for sid in ids if sid in used and sid != "root"], keep)
    again = oui.parse(prog, cat, "View")                # what goes out parses clean (proof the drop left nothing dangling)
    if again["meta"]["errors"] or again["meta"]["unresolved"] or not again.get("root"):
        return None, log + ["reparse"]
    return prog, log or ["ok"]


class Fence(livefig.Fence):
    """livefig.Fence plus the ```openui branch: same hold-until-closed stream, one figure per reply across ```fig and ```openui"""

    def _block(self, lang, body):
        if lang != "openui":
            return super()._block(lang, body)
        if self.ctx is None or not on():
            return self.log.append("views-off") or ""
        if self.shown >= livefig.FIGS_MAX:
            return self.log.append("second") or ""
        prog, why = gate(body, self.ctx)
        self.log.append("oui:" + ",".join(why))
        if any(w.endswith(":steps-nofig") for w in why):   # a figure-less stepper: its captions wait as plain lines (livefig.Fence.plain)
            self.plain = steps_plain(body)
        if prog is None:
            return ""
        self.shown += 1
        return "\n```openui\n" + prog + "\n```\n"
