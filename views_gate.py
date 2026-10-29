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
CHAT = {"View", "Geometry", "Graph", "Legend", "Table", "Head", "Text", "Callout", "Steps", "Step"}
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


def _source(stmts, root_kids):
    return "\n".join([f"root = View([{', '.join(root_kids)}])"] + [raw for sid, raw in stmts])


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
            why = why or errs.get(el.get("statementId")) or check_element(el, ctx)
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
        if prog is None:
            return ""
        self.shown += 1
        return "\n```openui\n" + prog + "\n```\n"
