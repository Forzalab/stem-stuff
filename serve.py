"""stem-stuff server. usage: python3 serve.py [port] [problems.json]

- Serves the site from this folder.
- Reads the whole problem bank from ONE file (default: problems.json next to this script; SCHEMA.md).
  Edit or replace the file: the next request re-reads it (mtime check), no restart.
- GET /p/<CODE>.json   -> the public part of one problem (no answers, no hints).
- Math: sympy (pip install sympy), behind a token allowlist.
- POST /check          -> grades {code, answer | choice | choices (mc pick all) | part+answer}; tries per problem (per part for a multi) per browser (cookie): 1 for a 2-choice mc, else 2.
- GET /b/<BANK>.json   -> a practice bank (banks/BANK_XXX.json): public problems + this browser's marks + where it was;
  /b/last.json = this browser's last bank, or null (design/BANK.md). Bank problems are graded like any other (/check).
- GET /state/<CODE>    -> this browser's tries on one problem: {wrong, done, gen}, or {parts: [{wrong, done, gen}, ...]} for a
  multi (design/DONE.md). No answer, no hints.
- Tries are kept in tries.json (next to this script, or $STEM_TRIES), so a restart keeps them. Tony may hand-edit it:
  deleting an entry resets that problem (or part) for that browser (the page sees a newer gen and drops its cached state).
- The bank file itself, keys, logs and server files are never served.
"""
import hashlib
import http.cookies
import http.server
import json
import math
import os
import random
import re
import secrets
import socketserver
import sys
import threading
import time
import urllib.request

import sympy
from sympy.parsing.sympy_parser import auto_number, parse_expr

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "tools"))
try:
    import bundle  # tools/bundle.py: builds stem-stuff.html (offline download)
except Exception:  # noqa: BLE001
    bundle = None

MAIN = __name__ == "__main__"   # argv is ours only when run as the server (imported: tests, api/index.py on Vercel)
PORT = int(sys.argv[1]) if MAIN and len(sys.argv) > 1 else 5567
ROOT = os.path.dirname(os.path.abspath(__file__))
BANK = os.path.abspath(sys.argv[2]) if MAIN and len(sys.argv) > 2 else os.path.join(ROOT, "problems.json")
BANKS = os.environ.get("STEM_BANKS") or os.path.join(ROOT, "banks")   # practice banks: banks/BANK_XXX.json (design/BANK.md)
MAX_TRIES = 2  # tries for everything except a 2-choice mc (max_tries)
PUBLIC = ("code", "title", "type", "pick", "fix", "var", "body", "how", "tries", "tip", "formulas", "wish", "snack", "before", "original")
DEFAULT_NUDGE = "QUACK. Plug your answer back into the problem. Does it work?"
FIX_NUDGE = "QUACK. Right call on which ones are false. One fix is off: redo that row's math."
NONE_MISS = "QUACK. A true one is still unticked, or a false one is ticked. Check every row again."

# Server-only or private paths: never served.
BLOCK_PREFIX = ("/k/", "/log/", "/.git", "/tests/", "/tools/", "/banks/")
TRIES = os.environ.get("STEM_TRIES") or os.path.join(ROOT, "tries.json")
BLOCK = {"/serve.py", "/deploy.sh", "/host.log", "/.host.pid", "/problems.json", "/tries.json", "/" + os.path.basename(BANK)}
BUNDLE = os.path.join(ROOT, "stem-stuff.html")
BUNDLE_DIRS = ("", "design", "vendor", "vendor/katex")
CODE_PATH = re.compile(r"^/p/([A-Z][A-Z0-9]*_[A-Z0-9]{2,})\.json$")
STATE_PATH = re.compile(r"^/state/([A-Z][A-Z0-9]*_[A-Z0-9]{2,})$")
BANK_CODE = re.compile(r"^BANK_[A-Z0-9]{3,6}$")
BANK_PATH = re.compile(r"^/b/(BANK_[A-Z0-9]{3,6}|last)\.json$")
_bundle_lock = threading.Lock()


# ---------------- the bank: problems.json + banks/BANK_XXX.json, each re-read when it changes ----------------
# design/BANK.md: every file in banks/ named BANK_XXX.json is a practice bank (problems.json format). One global code
# index: problems.json first, then banks A-Z; a code in two files is one problem (first copy wins, a differing copy warns).
_files = {}                  # path -> (mtime, [problems]): the last good copy of each file
_bank = {"sig": None, "by_code": {}, "banks": {}, "skipped": set()}
_bank_lock = threading.Lock()


def _read(path):
    """[problems] of one file; re-read when its mtime changes; the last good copy on errors ([] if it never parsed)."""
    try:
        mtime = os.path.getmtime(path)
    except OSError:
        _files.pop(path, None)
        return []
    old = _files.get(path)
    if old and old[0] == mtime:
        return old[1]
    try:
        with open(path, encoding="utf-8") as f:
            ps = [p for p in json.load(f)["problems"] if isinstance(p, dict) and isinstance(p.get("code"), str)]
        print(f"loaded {len(ps)} problems from {path}", file=sys.stderr)
    except Exception as e:  # noqa: BLE001
        print(f"{path} unreadable, keeping the last good copy: {e}", file=sys.stderr)
        ps = old[1] if old else []
    _files[path] = (mtime, ps)
    return ps


def _bank_files():
    """bank code -> path, for banks/BANK_XXX.json. Other names are skipped (one stderr line each)."""
    try:
        names = sorted(os.listdir(BANKS))
    except OSError:
        return {}
    out = {}
    for n in names:
        if not n.endswith(".json"):
            continue
        if n == SHEET_NAME:
            continue
        if BANK_CODE.match(n[:-5]):
            out[n[:-5]] = os.path.join(BANKS, n)
        elif n not in _bank["skipped"]:
            _bank["skipped"].add(n)
            print(f"banks/{n}: not a bank name (BANK_ + 3-6 of A-Z0-9), skipped", file=sys.stderr)
    return out


def _index():
    """Rebuild the code index when any file changed."""
    with _bank_lock:
        bf = _bank_files()
        lists = [_read(BANK)] + [_read(p) for p in bf.values()]
        sig = (tuple(bf), tuple(_files.get(p, (None,))[0] for p in [BANK, *bf.values()]))
        if sig != _bank["sig"]:
            by_code = {}
            for ps in lists:
                for p in ps:
                    if p["code"] not in by_code:
                        by_code[p["code"]] = p
                    elif by_code[p["code"]] != p:
                        print(f"{p['code']} is in two files with different content: the first one wins", file=sys.stderr)
            _bank.update(sig=sig, by_code=by_code, banks={c: [p["code"] for p in ps] for c, ps in zip(bf, lists[1:]) if ps})
        return _bank



SHEET_NAME = "formula-sheet.json"          # banks/formula-sheet.json: the exam's formula sheet (design/EASY.md), shipped with the banks
_sheet = {"mtime": None, "rows": {}}


def sheet():
    """formula id -> {"id", "group", "tex"}, from banks/formula-sheet.json; re-read when it changes; {} without one."""
    path = os.path.join(BANKS, SHEET_NAME)
    try:
        mtime = os.path.getmtime(path)
    except OSError:
        return {}
    if _sheet["mtime"] != mtime:
        try:
            with open(path, encoding="utf-8") as f:
                data = json.load(f)
            _sheet["rows"] = {r["id"]: {"id": r["id"], "group": g["name"], "tex": r["tex"]} for g in data["groups"] for r in g["rows"]}
        except Exception as e:  # noqa: BLE001
            print(f"{path} unreadable, keeping the last good copy: {e}", file=sys.stderr)
        _sheet["mtime"] = mtime
    return _sheet["rows"]


def formulas(code, part):
    """sugar mode's formula card: the sheet rows `part` names, in that order; unknown ids skipped (stderr)."""
    rows, out = sheet(), []
    for i in part or []:
        if i in rows:
            out.append(rows[i])
        else:
            print(f"{code}: part {i} is not on the formula sheet", file=sys.stderr)
    return out


def problems():
    """code -> full problem (with answers), from problems.json and every bank."""
    return _index()["by_code"]


def banks():
    """bank code -> [problem codes], in file order (duplicates inside one file dropped). A bank that never parsed is absent."""
    return {c: list(dict.fromkeys(codes)) for c, codes in _index()["banks"].items()}


def shown(p):
    """mc: the choices on screen (up to 5): the right one(s), locked ones, then the rest, in authored order."""
    ch = p["choices"]
    if len(ch) <= 5:
        return list(ch)
    right = rights(p)
    keep = [c for c in ch if c["id"] in right or c.get("lock")]
    keep += [c for c in ch if c not in keep][: max(0, 5 - len(keep))]
    return [c for c in ch if c in keep]


def rights(p):
    """mc: the correct ids as a set (pick all: a list in the key; pick one: a string)."""
    c = p["correct"]
    return set(c) if isinstance(c, list) else {c}


def max_tries(p):
    """Tries by choice count (Tony, locked): a 2-choice mc gets ONE try; 3+ choices, and every typed type, get TWO.
    app.js maxTries() is the same rule; tests/test_serve.py and tests/tries.test.mjs pin both to one table."""
    if "tries" in p:                                         # a mode view (view()) keeps the count of the authored list
        return p["tries"]
    return 1 if p.get("type") == "mc" and len(shown(p)) == 2 else MAX_TRIES


# ---------------- modes (design/EASY.md): sugar (saccharine) is the default; diet = the original questions, the cookie stem-mode=diet ----------------
# Code box: DIET_<code> / SUGAR_<code> (mode.mjs). "hard" is the old name of diet (cookies set before the rename still work).
SUGAR_KEYS = ("title", "tip", "part", "key", "slip", "narration")


def mode_of(cookie_header):
    jar = http.cookies.SimpleCookie()
    try:
        jar.load(cookie_header or "")
    except http.cookies.CookieError:
        pass
    return "diet" if "stem-mode" in jar and jar["stem-mode"].value in ("diet", "hard") else "sugar"


def sugar(p):
    """the problem's saccharine layer (schema: one "saccharine" block; flat tip/part/key/slip are read until the banks move)."""
    s = p.get("saccharine")
    return s if isinstance(s, dict) else {k: p[k] for k in SUGAR_KEYS if k in p and k != "title"}


def locks(p):
    return {c["id"] for c in shown(p) if c.get("lock")} if p.get("type") == "mc" else set()


def hidden(p, mode):
    """sugar mode leaves out a question whose answer is "None of these" (Tony, Oct 3), and every one the bank prunes
    (saccharine.hide: main kept the easiest 25 of P2X's 100, all topics). Diet leaves out every sugar_only item (the snacks,
    design/REWARDS-WIRING.md): diet is the bank as it was before they were added."""
    if mode != "sugar":
        return bool(p.get("sugar_only"))
    lk = locks(p)
    sg = sugar(p)
    return bool(sg.get("hide")) or (bool(lk) and rights(p) <= lk and not sg.get("split"))   # split rows answer for themselves


# ---- sugar split (Tony, Oct 3: "sugar = no choose-all"): a choose-all becomes one True/False question per row, in its place ----
INSTR = re.compile(r"^\s*(tap a row|mark every row)", re.I)       # the parent's how-to-tick paragraph: meaningless for one row
G_LINE = re.compile(r"Use \$g\s*=[^$]*\$\.?")
CODE_RE = re.compile(r"^[A-Z][A-Z0-9]*_[A-Z0-9]{2,}$")
_subs = {"sig": None, "map": {}}


def subs():
    """sub code -> (parent, row) for every saccharine.split row; rebuilt when the banks change."""
    idx = _index()
    if _subs["sig"] != idx["sig"]:
        _subs["map"] = {r["sub"]: (p, r) for p in idx["by_code"].values() for r in (sugar(p).get("split") or [])
                        if isinstance(r, dict) and CODE_RE.match(str(r.get("sub", "")))}
        _subs["sig"] = idx["sig"]
    return _subs["map"]


def sub_problem(parent, row):
    """one row of a split choose-all as its own question: the parent's figures and text, then the row's stem. A row with its own
    choices is an mc (2 tries for 3+ choices); a row without them is True/False (1 try)."""
    sg, right = sugar(parent), "t" if str(row.get("answer")).lower() == "true" else "f"
    body, g = [], None
    for b in parent.get("body", []):
        md = b.get("md") if b.get("type") == "text" else None
        text = "\n".join(md) if isinstance(md, list) else md
        if text is not None and INSTR.match(text):
            m = G_LINE.search(text)
            g = m.group(0) if m else g
            continue
        body.append(b)
    body.append({"type": "text", "md": row.get("stem", "") + ("\n\n" + g if g else "")})
    layer = {"title": sg.get("title"), "tip": row.get("tip") or sg.get("tip"), "part": sg.get("part"), "key": sg.get("key"), "narration": row.get("narration")}
    ch = row.get("choices")
    if isinstance(ch, list) and len(ch) >= 2:                 # main's v3 rows: a row is its own mc (answer = a choice id, slip per wrong id), the authored tries
        slip = row.get("slip") if isinstance(row.get("slip"), dict) else {}
        layer["slip"] = slip
        return {"code": row["sub"], "title": parent.get("title"), "type": "mc", "body": body,
                "choices": [{k: c[k] for k in ("id", "md") if k in c} for c in ch if isinstance(c, dict)], "correct": str(row.get("answer")),
                "wrong": [{"choice": i, "hint": h} for i, h in slip.items() if i != str(row.get("answer"))],
                "saccharine": {k: v for k, v in layer.items() if v}}
    wrong = "f" if right == "t" else "t"
    layer["slip"] = {wrong: row.get("slip")} if row.get("slip") else {}
    return {"code": row["sub"], "title": parent.get("title"), "type": "mc", "shuffle": False, "body": body,
            "choices": [{"id": "t", "md": "True"}, {"id": "f", "md": "False"}], "correct": right,
            "wrong": [{"choice": wrong, "hint": row["slip"]}] if row.get("slip") else [],
            "saccharine": {k: v for k, v in layer.items() if v}}


def lookup(code, mode):
    """a problem by code; in sugar a split row's sub code too (its parent not pruned). None when there's no such thing."""
    p = problems().get(code)
    if p is not None:
        return None if mode != "sugar" and p.get("sugar_only") else p   # a snack does not exist in diet (/p, /check, /state, /narrate, /explain)
    hit = subs().get(code) if mode == "sugar" else None
    return sub_problem(*hit) if hit and not hidden(hit[0], mode) else None


def view(p, mode):
    """The problem as a mode serves and grades it. Both modes (Tony, Oct 3): "None of these" is gone; an mc that had it becomes
    tick-every-true-one (pick all), and None as the key is the empty set (submit with nothing ticked). Prove mode (the X + typed fix
    boxes) is gone in both: a false row is simply left blank. Sugar also shows its saccharine title, tip and formula card. The try count stays the authored list's. The layer's key,
    slip and narration never travel with the problem (/explain and /narrate read them from problems())."""
    sg = sugar(p)
    p = {k: v for k, v in p.items() if k not in SUGAR_KEYS[1:] and k != "saccharine"}
    if mode == "sugar":
        p.update({k: v for k, v in (("title", sg.get("title")), ("tip", sg.get("tip"))) if v})
        if sg.get("key"):
            p["wish"] = True                                  # Cluck can answer this one (/explain); the key itself stays here
        if sg.get("part"):
            p["formulas"] = formulas(p["code"], sg["part"])
        if sg.get("snack"):                                   # a snack: its target (nav order) and the original it twists (design/REWARDS-WIRING.md)
            p["snack"] = True
            if sg.get("before"):
                p["before"] = sg["before"]
            o = sg.get("original")
            if isinstance(o, dict) and o.get("body"):
                p["original"] = {k: o[k] for k in ("q", "body", "solution") if k in o}
    if p.get("type") != "mc":
        return p
    lk = locks(p)
    if not lk and "fix" not in p:
        return p
    q = dict(p, choices=[c for c in shown(p) if not c.get("lock")], tries=max_tries(p))
    if lk:
        q.update(pick="all", correct=sorted(rights(p) - lk), wrong=[w for w in p.get("wrong", []) if w.get("choice") not in lk])
        q.setdefault("miss", NONE_MISS)
    q.pop("fix", None)                                        # no prove mode in either mode (Tony, Oct 3: "kill off the red x and the input")
    return q


def shuffled(choices, seed):
    """Seeded shuffle: same seed, same order. Locked choices keep their slot; the others trade places."""
    free = [i for i, c in enumerate(choices) if not c.get("lock")]
    moved = [choices[i] for i in free]
    random.Random(hashlib.sha256(seed.encode()).hexdigest()).shuffle(moved)
    out = list(choices)
    for i, c in zip(free, moved):
        out[i] = c
    return out


def public(p, sid=""):
    """What the browser may see: no answer, accept, points, tol, correct, wrong, nudge. sid seeds the mc shuffle."""
    out = {k: p[k] for k in PUBLIC if k in p}
    if p.get("type") == "mc":
        ch = shown(p)
        if p.get("shuffle", True):
            ch = shuffled(ch, sid + ":" + p["code"])
        out["choices"] = [{k: c[k] for k in ("id", "md", "lock") if k in c} for c in ch]
    if p.get("type") == "multi":
        out["parts"] = [{k: q[k] for k in ("label", "prompt", "type", "var") if k in q} for q in p["parts"]]
    return out


# ---------------- math: sympy does the math ----------------
# sympy's parse_expr runs eval(), so text reaches it only after to_python() has allowed every token:
# numbers, the names below, the variable, + - * / ^ ( ) and commas. Nothing else gets through.
S = sympy
NAMES = {
    "sqrt": S.sqrt, "abs": S.Abs, "exp": S.exp, "ln": S.log, "log": S.log, "log10": lambda x: S.log(x, 10),
    "sin": S.sin, "cos": S.cos, "tan": S.tan, "asin": S.asin, "acos": S.acos, "atan": S.atan,
    "sec": S.sec, "csc": S.csc, "cot": S.cot, "sinh": S.sinh, "cosh": S.cosh, "tanh": S.tanh,
    "pi": S.pi, "e": S.E, "deg": S.pi / 180, "inf": S.oo, "infinity": S.oo,
}
FUNCS = {k for k, v in NAMES.items() if callable(v) and not isinstance(v, S.Basic)}
TOKEN = re.compile(r"\s*(?:(\d+\.?\d*(?:e[+-]?\d+)?|\.\d+(?:e[+-]?\d+)?)|([a-z_][a-z0-9_]*)|(\*\*|[-+*/^(),]))")
GLOBALS = {"__builtins__": {}, "Integer": S.Integer, "Float": S.Float, "Rational": S.Rational, "Add": S.Add, "Mul": S.Mul, "Pow": S.Pow}


def to_python(src, var):
    """math.js-ish text -> allowlisted Python text. Adds implicit '*' (2x, 3pi, )(, x(1+x)); '^' -> '**'."""
    s = src.strip().lower().replace("π", "pi").replace("∞", "inf").replace("·", "*").replace("×", "*")
    toks, i = [], 0
    while i < len(s):
        m = TOKEN.match(s, i)
        if not m or m.end() == i:
            if s[i:].strip() == "":
                break
            raise ValueError("bad character")
        num, name, op = m.groups()
        if name and name not in NAMES and name != var:
            raise ValueError("unknown name " + name)
        kind = "num" if num else "name" if name else op
        text = num or name or ("**" if op == "^" else op)
        if toks:
            pk, pt = toks[-1]
            ends_value = pk == "num" or pk == ")" or (pk == "name" and pt not in FUNCS)
            if ends_value and kind in ("num", "name", "("):
                toks.append(("*", "*"))
        toks.append((kind, text))
        i = m.end()
    return " ".join(t for _, t in toks)


def evaluate(src, var="x", at=None):
    """Value (float) of a math.js-style expression, at var = at. Raises ValueError/ArithmeticError if unreadable."""
    if len(src) > 200:
        raise ValueError("too long")
    text = to_python(src, var)
    if not text:
        raise ValueError("empty")
    loc = dict(NAMES, **{var: S.Symbol(var)})
    expr = parse_expr(text, local_dict=loc, global_dict=GLOBALS, transformations=(auto_number,), evaluate=False)
    if not isinstance(expr, S.Basic):
        raise ValueError("not an expression")
    for p in expr.atoms(S.Pow):  # 9^9^9^9: refuse before sympy tries to build it
        if p.exp.is_number and abs(complex(p.exp.evalf(15))) > 1000:
            raise ValueError("exponent too big")
    if at is not None:
        expr = expr.subs(loc[var], S.Float(at))
    v = expr.evalf(30)
    if v.free_symbols:
        raise ValueError("unknown left")
    if v in (S.oo, -S.oo):
        return math.inf if v == S.oo else -math.inf
    if v is S.nan or v is S.zoo or not v.is_real:
        raise ValueError("not a real number")
    return float(v)


# ---------------- grading ----------------
DNE = re.compile(r"^\s*(dne|does not exist)\s*$", re.I)
UNREADABLE = (ValueError, ArithmeticError, SyntaxError, TypeError, AttributeError, IndexError, RecursionError, MemoryError, sympy.SympifyError)


def squash(text):
    return re.sub(r"\s+", "", str(text)).lower()


def signature(u, text):
    """Comparable value of typed text for one answer unit (a problem, or one part of a multi):
    text type: squashed text; else 'dne', a float, or a tuple of floats (expr at points). ValueError if unreadable."""
    if u["type"] == "text":
        if not squash(text):
            raise ValueError("empty")
        return squash(text)
    if DNE.match(text):
        return "dne"
    var = u.get("var", "x")
    if u["type"] == "expr":
        return tuple(evaluate(text, var, x) for x in u["points"])
    v = evaluate(numtext(text), var)
    if math.isnan(v):
        raise ValueError("nan")
    return v


SCI = re.compile(r"(\d)\s*(?:[x×·*]\s*)?10\s*\^", re.I)


def numtext(text):
    """a typed number in any of the usual ways: 1.07e14, 1.07E14, 1.07x10^14, 1.07 X 10^14, 1.07*10^14, 1.07×10^14,
    1.07·10^14, 1.07 10^14, 10^14, +1.07e+14, 1 070 000. The letter x before 10^ is a times sign here (num answers only)."""
    t = SCI.sub(r"\1*10^", str(text).strip())
    return re.sub(r"(?<=\d) (?=\d{3}(?!\d))", "", t)


def same(a, b, tol):
    if isinstance(a, str) or isinstance(b, str):
        return a == b
    if isinstance(a, tuple):
        return len(a) == len(b) and all(same(x, y, tol) for x, y in zip(a, b))
    if math.isinf(a) or math.isinf(b):
        return a == b
    return abs(a - b) <= tol * max(1.0, abs(b))


def sig3(a, b):
    """Tony (Oct 3): typed numbers count when right to 3 significant figures (|a - b| <= half a unit in b's 3rd figure).
    The prompt asks for at least 4, so early rounding can't push a right answer off."""
    if isinstance(a, tuple):
        return isinstance(b, tuple) and len(a) == len(b) and all(sig3(x, y) for x, y in zip(a, b))
    if isinstance(a, str) or isinstance(b, str) or not (math.isfinite(a) and math.isfinite(b)) or b == 0:
        return False
    return abs(a - b) <= 0.5 * 10 ** (math.floor(math.log10(abs(b))) - 2) * (1 + 1e-9)


def sigfig(a, b, n):
    """hard-mode fix boxes (Tony, Oct 3): right to n significant figures, give or take 1 in the last one (rounding order)."""
    if isinstance(a, str) or isinstance(b, str) or not (math.isfinite(a) and math.isfinite(b)) or b == 0:
        return False
    unit = 10 ** (math.floor(math.log10(abs(b))) - (n - 1))
    return abs(a - round(b / unit) * unit) <= unit * (1 + 1e-9)          # the key rounded to n figures, then +-1 in the last


def figures(u):
    """how many significant figures a fix box grades to: fix.sf, else "N sig fig(s)" in its how text, else 3.
    Tony (Oct 3): grade to 3, the prompt asks for at least 4, so a "≥N" / "at least N" in the how text is the ask, not the grade."""
    if isinstance(u.get("sf"), int) and u["sf"] > 0:
        return u["sf"]
    m = re.search(r"(?<![≥>\d])(?<!at least )(\d+)\s*sig", str(u.get("how", "")), re.I)
    return int(m.group(1)) if m else 3


def unit_correct(u, sig):
    tol = u.get("tol", 1e-6)
    if u["type"] == "text":
        return sig in {squash(t) for t in [u["answer"], *u.get("accept", [])]}
    ans = "dne" if u["answer"] == "dne" else signature(u, u["answer"])
    if u.get("fixbox") and not isinstance(sig, tuple):
        return same(sig, ans, tol) or sigfig(sig, ans, figures(u))
    return same(sig, ans, tol) or sig3(sig, ans)


def unit_hit(u, text, sig):
    """The first `wrong` entry this answer matches: re entries first, then match."""
    wrong = u.get("wrong", [])
    hit = next((w for w in wrong if w.get("re") and re.search(w["re"], text, re.I)), None)
    for w in wrong if hit is None else []:
        try:
            if w.get("match") is not None and same(sig, signature(u, w["match"]), u.get("tol", 1e-6)):
                return w
        except UNREADABLE:
            pass
    return hit


# (sid, code) -> {"wrong": [signatures], "done": bool, "gen": int}; a multi keeps one per part: (sid, code, i).
# Saved to TRIES on every graded try, so a restart keeps them (design/DONE.md). File keys: "sid CODE" / "sid CODE i".
# gen: a counter; every new entry takes the next one. The page caches it; a /state gen above the cached one means
# "this entry was deleted by hand (Tony reset it)", so the page drops its cached state instead of staying locked.
_tries = {}
_last = {}                  # sid -> {"bank": BANK_XXX, "at": {BANK_XXX: CODE}}: this browser's last bank and place in each
_gen = {"n": 0, "loaded": None}
_tries_lock = threading.Lock()


def _tup(x):
    return tuple(_tup(y) for y in x) if isinstance(x, list) else x


# Where tries live: the TRIES file, or (serverless, e.g. Vercel: read-only disk, no process between requests) an Upstash
# Redis key over its REST API, picked when KV_REST_API_URL + KV_REST_API_TOKEN are set. One JSON blob either way.
KV = (os.environ.get("KV_REST_API_URL"), os.environ.get("KV_REST_API_TOKEN"))
KV_KEY = "stem:tries"


def _kv(*cmd):
    req = urllib.request.Request(KV[0], data=json.dumps(cmd).encode(), method="POST",
                                 headers={"Authorization": "Bearer " + KV[1], "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=5) as r:
        return json.load(r).get("result")


def _load_tries():
    """Read TRIES once per path (tests point TRIES elsewhere); from KV, on every call (another instance may have written).
    Missing or broken = no tries yet."""
    if not all(KV) and _gen["loaded"] == TRIES:
        return
    _tries.clear()
    _last.clear()
    _gen["n"], _gen["loaded"], _gen["kv_bad"] = 0, TRIES, False
    try:
        if all(KV):
            try:
                data = json.loads(_kv("GET", KV_KEY) or "{}")
            except (OSError, ValueError):
                _gen["kv_bad"] = True         # unread is not empty: never save over it (_save_tries)
                raise
        else:
            with open(TRIES, encoding="utf-8") as f:
                data = json.load(f)
        _gen["n"] = int(data.get("gen", 0))
        for k, v in data.get("tries", {}).items():
            bits = k.split(" ")
            key = (bits[0], bits[1], int(bits[2])) if len(bits) == 3 else (bits[0], bits[1])
            _tries[key] = {"wrong": [_tup(w) for w in v.get("wrong", [])], "done": bool(v.get("done")), "gen": int(v.get("gen", 0))}
        _last.update({k: v for k, v in data.get("last", {}).items() if isinstance(v, dict) and isinstance(v.get("at"), dict)})
    except (OSError, ValueError, AttributeError, TypeError, IndexError):
        pass


def _save_tries():
    data = {"gen": _gen["n"], "tries": {" ".join(map(str, k)): st for k, st in _tries.items()}, "last": _last}
    if all(KV):
        if _gen.get("kv_bad"):
            print("tries not saved: KV was unreadable on load", file=sys.stderr)
            return
        try:
            _kv("SET", KV_KEY, json.dumps(data))
        except (OSError, ValueError) as e:
            print("tries not saved to KV:", e, file=sys.stderr)
        return
    tmp = TRIES + ".tmp"
    try:
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=1)
        os.replace(tmp, TRIES)
    except OSError as e:
        print("tries.json not saved:", e, file=sys.stderr)


def _entry(key):
    st = _tries.get(key)
    if st is None:
        _gen["n"] += 1
        st = _tries[key] = {"wrong": [], "done": False, "gen": _gen["n"]}
    return st


def state(p, sid):
    """{wrong, done, gen} for one browser and problem ({parts: [...]} for a multi). No entry: nothing tried yet, gen = the
    one it would get."""
    with _tries_lock:
        _load_tries()

        def one(key):
            st = _tries.get(key)
            if st is None:
                return {"wrong": 0, "done": False, "gen": _gen["n"] + 1}
            return {"wrong": len(st["wrong"]), "done": st["done"], "gen": st["gen"]}
        if p["type"] == "multi":
            return {"parts": [one((sid, p["code"], i)) for i in range(len(p["parts"]))]}
        return one((sid, p["code"]))


def mark(p, sid):
    """The list mark for one problem, as app.js wrapRec() builds it: {x: wrong tries, done: open|correct|out}; None if untried."""
    st = state(p, sid)
    us = st["parts"] if "parts" in st else [st]
    ds = ["correct" if u["done"] else "out" if u["wrong"] >= max_tries(p) else "open" for u in us]
    x = sum(u["wrong"] for u in us)
    done = "correct" if all(d == "correct" for d in ds) else "out" if all(d != "open" for d in ds) else "open"
    return {"x": x, "done": done} if x or done != "open" else None


def snacks_placed(items):
    """[(problem, before)] -> [problem]: each snack (before = its target's code, a sub code or a code) goes right before its
    target, snacks with one target in file order; a snack whose target is not in the list stays where the file put it."""
    live = {p["code"] for p, b in items if not b}
    by = {}
    for p, b in items:
        if b and b in live:
            by.setdefault(b, []).append(p)
    out = []
    for p, b in items:
        if b and b in live:
            continue
        out += by.get(p["code"], []) + [p]
    return out


def bank_payload(code, sid, mode="sugar"):
    """GET /b/<code>.json ("last" = this browser's last bank): {code, problems, marks, at}; None if there's no such bank.
    Opening a bank makes it this browser's last one (design/BANK.md)."""
    all_banks = banks()
    if code == "last":
        with _tries_lock:
            _load_tries()
            code = _last.get(sid, {}).get("bank")
    if code not in all_banks:
        return None
    by_code = problems()
    ps = []
    for c in all_banks[code]:
        p = by_code.get(c)
        if p is None or hidden(p, mode):
            continue
        rows = sugar(p).get("split") if mode == "sugar" else None
        before = sugar(p).get("before") if mode == "sugar" and sugar(p).get("snack") else None
        ps += [(view(sub_problem(p, r), mode), None) for r in rows if isinstance(r, dict) and CODE_RE.match(str(r.get("sub", "")))] if rows else [(view(p, mode), before)]
    ps = snacks_placed(ps)
    marks = {p["code"]: m for p in ps for m in [mark(p, sid)] if m}
    with _tries_lock:
        _load_tries()
        me = _last.setdefault(sid, {"bank": None, "at": {}})
        at = me["at"].get(code)
        if me["bank"] != code:
            me["bank"] = code
            _save_tries()
    live = {p["code"] for p in ps}
    return {"code": code, "problems": [public(p, sid) for p in ps], "marks": marks, "at": at if at in live else None}


def seen(code, sid):
    """GET /p/<code>.json: when code is in this browser's last bank, remember it as the place to reopen that bank."""
    with _tries_lock:
        _load_tries()
        me = _last.get(sid)
        if not me or not me.get("bank") or me["at"].get(me["bank"]) == code:
            return
        bank_ = me["bank"]
    if code in banks().get(bank_, []):
        with _tries_lock:
            me["at"][bank_] = code
            _save_tries()


def grade(p, sid, body):
    """body: {choice} (mc) | {choices: [ids]} (mc pick all) | {answer} (num/expr/text) | {part: i, answer} (multi: ONE part; each part has its own tries and lockout).
    Reply {verdict, triesLeft, gen, error?, hint?, repeat?} (+ part: i for a multi). The answer is never in the reply."""
    multi = p["type"] == "multi"
    idx = body.get("part")
    if multi and (isinstance(idx, bool) or not isinstance(idx, int) or not 0 <= idx < len(p["parts"])):
        return {"verdict": "invalid", "triesLeft": max_tries(p)}    # the old whole-set body {parts: [...]} lands here too
    with _tries_lock:
        _load_tries()
        key = (sid, p["code"], idx) if multi else (sid, p["code"])
        out = _grade(p, _entry(key), body, multi, idx)
        out["gen"] = _tries[key]["gen"]
        if out["verdict"] in ("correct", "wrong"):
            _save_tries()
        return out


def _grade(p, st, body, multi, idx):
    """One try on entry st (the caller holds _tries_lock)."""

    def left():
        return max_tries(p) - len(st["wrong"])

    def reply(o):
        return {**o, "part": idx} if multi else o

    if st["done"] or left() <= 0:
        return reply({"verdict": "locked", "triesLeft": 0})
    hit = None
    if p["type"] == "mc" and p.get("pick") == "all":         # design/CHOOSE-ALL.md §3: grade the ticked set, all or nothing
        ids, sh = body.get("choices"), shown(p)
        locked = {c["id"] for c in sh if c.get("lock")}
        if (not isinstance(ids, list) or not all(isinstance(i, str) for i in ids) or len(set(ids)) != len(ids)
                or not set(ids) <= {c["id"] for c in sh} or (set(ids) & locked and len(ids) > 1)):
            return {"verdict": "invalid", "triesLeft": left()}
        hint_of = {w.get("choice"): w for w in p.get("wrong", [])}
        fixes, xs = body.get("fixes"), [c["id"] for c in sh if c["id"] not in ids and not c.get("lock")]
        if "fix" in p:                                           # prove mode: every X'd row carries a typed fix
            if (not isinstance(fixes, dict) or set(fixes) != set(xs)
                    or not all(isinstance(t, str) and t.strip() for t in fixes.values())):
                return {"verdict": "invalid", "triesLeft": left()}
        sig, correct = ",".join(sorted(ids)), set(ids) == rights(p)
        if not correct:                                          # first ticked distractor in authored order, else miss
            hit = next((dict(hint_of[c["id"]], struck=c["id"]) for c in sh
                        if c["id"] in ids and c["id"] not in rights(p) and c["id"] in hint_of), None)
            hit = hit or {"error": "incomplete", "hint": p["miss"]}
            if "fix" in p:
                sig = (sig, *(squash(fixes[i])[:200] for i in xs))
        elif "fix" in p:                                         # right set: now every fix must be right too
            units = [(i, {**p["fix"], **hint_of[i]["fix"], "fixbox": True}, str(fixes[i])[:200]) for i in xs]
            try:
                sigs = [signature(u, t) for _, u, t in units]
            except UNREADABLE:
                return {"verdict": "invalid", "triesLeft": left()}
            sig = (sig, *sigs)
            bad = next(((i, u, t, g) for (i, u, t), g in zip(units, sigs) if not unit_correct(u, g)), None)
            if bad:
                correct, (i, u, t, g) = False, bad
                w = unit_hit(u, t, g)
                hit = {"error": w["error"], "hint": w["hint"], "fixWrong": i} if w else {"hint": FIX_NUDGE, "fixWrong": i}
    elif p["type"] == "mc":
        sig = body.get("choice")
        if sig not in {c["id"] for c in shown(p)}:
            return {"verdict": "invalid", "triesLeft": left()}
        correct = sig == p["correct"]
        if not correct:
            hit = next((w for w in p.get("wrong", []) if w.get("choice") == sig), None)
    else:
        u = p["parts"][idx] if multi else p
        text = str(body.get("answer", ""))[:200]
        try:
            sig = signature(u, text)
            correct = unit_correct(u, sig)
        except UNREADABLE:
            return reply({"verdict": "invalid", "triesLeft": left()})
        if not correct:
            hit = unit_hit(u, text, sig)
    if correct:
        st["done"] = True
        return reply({"verdict": "correct", "triesLeft": left()})
    tol = (p["parts"][idx] if multi else p).get("tol", 1e-6)
    repeat = any(same(sig, x, tol) for x in st["wrong"])
    if not repeat:
        st["wrong"].append(sig)
    out = {"verdict": "wrong", "triesLeft": left(), "hint": hit["hint"] if hit else p.get("nudge", DEFAULT_NUDGE)}
    if hit:
        out.update({k: hit[k] for k in ("error", "struck", "fixWrong") if k in hit})
    if repeat:
        out["repeat"] = True
    return reply(out)


# ---------------- HTTP ----------------
def ensure_bundle():
    """(Re)build stem-stuff.html when missing or older than its sources. Never fatal."""
    if bundle is None or not os.path.exists(os.path.join(ROOT, "index.html")):
        return
    with _bundle_lock:
        try:
            built = os.path.getmtime(BUNDLE) if os.path.exists(BUNDLE) else 0
            src = max(
                os.path.getmtime(os.path.join(ROOT, d, f))
                for d in BUNDLE_DIRS if os.path.isdir(os.path.join(ROOT, d))
                for f in os.listdir(os.path.join(ROOT, d))
                if f.endswith((".html", ".js", ".css")) and f != "stem-stuff.html"
            )
            if src > built:
                bundle.build(BUNDLE)
        except Exception as e:  # noqa: BLE001
            print("bundle failed:", e, file=sys.stderr)


def new_sid(cookie_header):
    """(this browser's id from the Cookie header, the Set-Cookie value to send or None). A new id if missing or malformed."""
    jar = http.cookies.SimpleCookie()
    try:
        jar.load(cookie_header or "")
    except http.cookies.CookieError:
        pass
    if "sid" in jar and re.fullmatch(r"[0-9a-f]{32}", jar["sid"].value):
        return jar["sid"].value, None
    sid = secrets.token_hex(16)
    return sid, f"sid={sid}; Path=/; Max-Age=31536000; SameSite=Lax; HttpOnly"


# ---------------- Cluck the genie (design/EASY.md Phase 4): a streamed, paraphrased solution after a wrong answer, easy mode only ----------------
# The smart part is the presolved `key` (+ `slip`, `part`) written in the brain; the model only says it in Cluck's voice.
# OpenRouter, zero data retention: provider.zdr + data_collection deny, so a request that can't route privately fails instead.
OPENROUTER_BASE = os.environ.get("OPENROUTER_BASE", "https://openrouter.ai/api/v1").rstrip("/")
OPENROUTER_MODELS = [m for m in os.environ.get("OPENROUTER_MODELS", "openai/gpt-5.6-luna,z-ai/glm-5.3-flash,deepseek/deepseek-v4-flash").split(",") if m.strip()]
AUTO_PER_HOUR, ANY_PER_HOUR = 5, 40          # Tony: 5 questions an hour fire on the first wrong answer; past that, the student asks
_asked = {}                                  # sid -> [(time, auto)]
_asked_lock = threading.Lock()
CLUCK_GENIE = """You are Cluck: a duck who was a CS professor for 30 years until a botched genie wish left him a duck AND the genie of a lamp shaped like a rubber duck. You grant exactly one wish per wrong answer: the solution.
Voice: theatrical genie. QUACK as punctuation, two or three in the prose, never inside math or the answer sentence. Exactly one terrible pun (physics or duck: "orbit-trary", "quack-celeration", "down-right egg-cellent"). Warm. Never mean, never sarcastic about the student.
You are given the correct solution (KEY) and the slip behind the student's pick (SLIP). Paraphrase them. Never change a number, sign, unit, or the answer. Never add physics that is not in the KEY.
Write it like a good textbook page told by a duck: full short sentences that flow, and the math set apart so the eye can find it.
Format: sentences, LaTeX, and **bold**. Nothing else: no #, no bullet symbols, no numbered parts, no code, no | pipe tables.
Bold only the given numbers when you first name them, and the final answer. Never bold a whole sentence.
Math inside a sentence: $...$. A worked equation gets its own line as $$...$$, one equation per line, each line one move.
Order: one genie line, like "POOF! You rubbed the lamp wrong, but a wish is a wish." One sentence on which formula fits and why, then the formula on its own $$...$$ line. One sentence that puts the question's numbers into it. The KEY's work as $$...$$ lines (if the KEY has a table, copy it exactly with its aligned columns instead). The answer sentence: "So <what> is **<answer, unit, letter>**." A "Your pick:" sentence naming the slip, kindly. One pun sign-off.
Short words. Short sentences. Nothing the student must read twice.
Audience: community college students in Fresno taking physics as a general requirement, mostly biology and computer science majors, many reading English as a second language. Plain everyday words; explain any physics word the first time."""


def explain_allowed(sid, auto, now=None):
    """the hourly caps: auto (first wrong answer) at most AUTO_PER_HOUR, anything at most ANY_PER_HOUR. Records the ask when allowed."""
    now = now if now is not None else time.time()
    with _asked_lock:
        log = [(t, a) for t, a in _asked.get(sid, []) if now - t < 3600]
        if len(log) >= ANY_PER_HOUR or (auto and sum(a for _, a in log) >= AUTO_PER_HOUR):
            _asked[sid] = log
            return False
        _asked[sid] = log + [(now, bool(auto))]
        return True


def explain_prompt(p, answer):
    """the user turn: question, shown choices, the student's pick, the KEY, the SLIP for it, the sheet formulas."""
    text = "\n".join(b["md"] for b in p.get("body", []) if b.get("type") == "text")
    figs = "\n".join("Figure: " + b["alt"] for b in p.get("body", []) if b.get("type") == "graph" and b.get("alt"))
    lines = [f"QUESTION:\n{text}", figs]
    if p.get("type") == "mc":
        lines.append("CHOICES:\n" + "\n".join(f"{c['id']}) {c['md']}" for c in shown(p) if not c.get("lock")))
    sg, picked = sugar(p), answer if isinstance(answer, list) else [answer]
    slips = [(sg.get("slip") or {}).get(str(a)) for a in picked]
    lines += [f"STUDENT PICKED: {', '.join(map(str, picked)) or 'nothing ticked'}", f"KEY:\n{sg['key']}",
              "SLIP: " + (" ".join(x for x in slips if x) or "(none written; name the likely slip from the KEY)")]
    fs = formulas(p.get("code"), sg.get("part"))
    if fs:
        lines.append("SHEET FORMULAS: " + "; ".join(f["tex"] for f in fs))
    return "\n\n".join(x for x in lines if x)


class Plain:
    """streamed text, the markdown Cluck may use kept: **bold** stays (key numbers, the answer); __ goes anywhere, and #, -, * markers at a
    line start (headings and bullets break the textbook flow; models slip)"""
    def __init__(self):
        self.start, self.hold = True, ""

    def feed(self, chunk):
        t, out, i = self.hold + chunk.replace("__", ""), [], 0
        self.hold = ""
        while i < len(t):
            if self.start:
                rest = t[i:]
                if re.fullmatch(r"#+|[-*]", rest):          # a marker cut by the chunk edge: wait for the next chunk
                    self.hold = rest
                    break
                m = re.match(r"#+\s+|[-*]\s+", rest)
                if m:
                    i += len(m.group(0))
                    continue
            out.append(t[i])
            self.start = t[i] == "\n"
            i += 1
        return "".join(out)


def explain_stream(p, answer, key):
    """yields text chunks from OpenRouter (stream), markdown stripped. Raises OSError on a dead connection."""
    yield from _or_stream([{"role": "system", "content": CLUCK_GENIE}, {"role": "user", "content": explain_prompt(p, answer)}], key, 450)


def _or_stream(messages, key, max_tokens):
    """one OpenRouter chat call, streamed, ZDR only; yields the text with markdown stripped (Plain)."""
    body = json.dumps({"models": OPENROUTER_MODELS, "stream": True, "max_tokens": max_tokens, "temperature": 0.7,
                       "provider": {"zdr": True, "data_collection": "deny"}, "messages": messages}).encode()
    req = urllib.request.Request(OPENROUTER_BASE + "/chat/completions", data=body, method="POST",
                                 headers={"Authorization": "Bearer " + key, "Content-Type": "application/json", "X-Title": "stem-stuff"})
    plain = Plain()
    with urllib.request.urlopen(req, timeout=25) as r:
        for raw in r:
            line = raw.decode("utf-8", "replace").strip()
            if not line.startswith("data:"):
                continue
            data = line[5:].strip()
            if data == "[DONE]":
                break
            try:
                delta = json.loads(data)["choices"][0]["delta"].get("content") or ""
            except (ValueError, KeyError, IndexError, TypeError):
                continue
            text = plain.feed(delta)
            if text:
                yield text


def _stream_head(cookie_header):
    sid, cookie = new_sid(cookie_header)
    head = {"Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no"}
    if cookie:
        head["Set-Cookie"] = cookie
    return sid, head


def _body(body, limit):
    try:
        return json.loads(body) if 0 < len(body) <= limit else None
    except (ValueError, UnicodeDecodeError):
        return None


def _wish_problem(cookie_header, b):
    """the problem Cluck may talk about: easy mode, shown, with a presolved key. None otherwise (a 404)."""
    mode = mode_of(cookie_header)
    p = lookup(str(b.get("code", "")), mode) if isinstance(b, dict) else None
    return None if p is None or mode != "sugar" or hidden(p, mode) or not sugar(p).get("key") else p


def _relay(p, chunks, what):
    """the model's text as bytes; any failure (the prompt or the connection) ends with one line instead of a cut socket."""
    try:
        for t in chunks():
            yield t.encode()
    except Exception as e:  # noqa: BLE001
        print(f"{what} {p['code']}: {e}", file=sys.stderr)
        yield "\n(QUACK. The lamp flickered. Try again in a moment.)".encode()


def explain(cookie_header, body):
    """POST /explain {code, answer, auto}: (status, headers, iterator of bytes). Easy mode only; needs the problem's key."""
    sid, head = _stream_head(cookie_header)
    b = _body(body, 4096)
    p, key = _wish_problem(cookie_header, b), os.environ.get("OPENROUTER_API_KEY", "")
    if p is None:
        return 404, head, iter([b""])
    if not key:
        return 503, head, iter([b""])
    if not explain_allowed(sid, bool(b.get("auto"))):
        return 429, head, iter([b""])
    return 200, head, _relay(p, lambda: explain_stream(p, b.get("answer"), key), "explain")


# ---------------- Cluck chat (handoff 2026-10-04): follow-up questions under the genie box, CHAT_TURNS per problem per browser ----------------
# history[0] is the box text (Cluck's own turn); then the student and Cluck take turns; the last one is the student's.
# The cap lives twice: the history the browser sends, and _chats (one server process; Vercel instances do not share it).
CHAT_TURNS, CHAT_MAX, CHAT_LINE = 4, 16384, 2000
_chats = {}                                  # (sid, code) -> follow-ups answered
CLUCK_CHAT = """You are Cluck: a duck who was a CS professor for 30 years until a botched genie wish left him a duck AND the genie of a rubber-duck lamp. You already granted the wish (your first turn: the solution). Now the student asks about it.
The first user message holds the QUESTION, the KEY (the correct solution), and the SLIP behind their wrong pick.
Voice: warm, theatrical genie. A QUACK or two as punctuation, never inside math. At most one pun. Never mean, never sarcastic.
Answer in 1 to 4 short sentences that flow like a good tutor talking. Grade-6 words. Explain the step they ask about. Explain; do not quiz them back.
A worked equation may take its own line as $$...$$, one move per line. Math inside a sentence: $...$.
Bold only a key number or the answer, like **15.59 m**. No #, no bullet symbols, no code, no | pipe tables.
Never change or invent a number, sign, unit, or answer that is not in the KEY. Never add physics that is not in the KEY.
Off-topic: steer back to this question in one line.
Audience: community college students in Fresno taking physics as a general requirement, many reading English as a second language."""


def chat_history(h):
    """the turns as sent, or None when the shape is wrong: Cluck first, then turns that take turns, the student last."""
    if not isinstance(h, list) or not 2 <= len(h) <= 2 * CHAT_TURNS + 2:      # one past the cap still parses: a 429, not a 400
        return None
    out = []
    for i, t in enumerate(h):
        role = "assistant" if i % 2 == 0 else "user"
        if not isinstance(t, dict) or t.get("role") != role or not isinstance(t.get("content"), str):
            return None
        text = t["content"].strip()[:CHAT_LINE]
        if not text:
            return None
        out.append({"role": role, "content": text})
    return out if out[-1]["role"] == "user" else None


def chat(cookie_header, body):
    """POST /chat {code, answer, history}: (status, headers, iterator of bytes), like /explain. A 5th follow-up: 429 {"error": "limit"}."""
    sid, head = _stream_head(cookie_header)
    b = _body(body, CHAT_MAX)
    p, key = _wish_problem(cookie_header, b), os.environ.get("OPENROUTER_API_KEY", "")
    if p is None:
        return 404, head, iter([b""])
    history = chat_history(b.get("history"))
    if history is None:
        return 400, head, iter([b""])
    if not key:
        return 503, head, iter([b""])
    turn, k = len(history) // 2, (sid, p["code"])
    with _asked_lock:                        # check and count in one step: two tabs at once can't both take the last turn
        over = turn > CHAT_TURNS or _chats.get(k, 0) >= CHAT_TURNS
        if not over:
            _chats[k] = _chats.get(k, 0) + 1
    if over:
        return 429, dict(head, **{"Content-Type": "application/json"}), iter([b'{"error": "limit"}'])
    if not explain_allowed(sid, False):      # the hourly cap /explain has, shared
        with _asked_lock:
            _chats[k] -= 1
        return 429, dict(head, **{"Content-Type": "application/json"}), iter([b'{"error": "hourly"}'])
    context = lambda: [{"role": "system", "content": CLUCK_CHAT}, {"role": "user", "content": explain_prompt(p, b.get("answer"))}]
    return 200, head, _relay(p, lambda: _or_stream(context() + history, key, 250), "chat")


STREAMS = {"/explain": explain, "/chat": chat}   # POST paths that answer as a text stream (serve.Handler, api/index.py)
POST_MAX = CHAT_MAX                              # the most any POST body may be; each path checks its own limit


def _json(status, obj, cookie):
    head = {"Content-Type": "application/json", "Cache-Control": "no-store"}
    if cookie:
        head["Set-Cookie"] = cookie
    return status, head, json.dumps(obj).encode()


def dispatch(method, path, cookie_header="", body=b""):
    """The API, shared by Handler (this server) and api/index.py (Vercel): (status, headers, bytes), or None when the
    path is not an API path (a static file)."""
    path = path.split("?")[0]
    if method == "POST":
        if path not in ("/check", "/narrate"):
            return None
        sid, cookie = new_sid(cookie_header)
        try:
            b = json.loads(body) if 0 < len(body) <= 4096 else None
        except (ValueError, UnicodeDecodeError):
            b = None
        if not isinstance(b, dict):
            return _json(400, {"verdict": "invalid"}, cookie)
        mode = mode_of(cookie_header)
        p = lookup(str(b.get("code", "")), mode)
        if path == "/narrate":                       # the pre-written voiceover (saccharine.narration): sugar mode only
            text = sugar(p).get("narration") if p is not None and mode == "sugar" and not hidden(p, mode) else None
            return _json(200, {"text": text or ""}, cookie)   # none written: empty, not an error
        if p is None or hidden(p, mode):
            return _json(404, {"verdict": "invalid"}, cookie)
        return _json(200, grade(view(p, mode), sid, b), cookie)
    m = STATE_PATH.match(path) or CODE_PATH.match(path) or BANK_PATH.match(path)
    if not m:
        return None
    sid, cookie = new_sid(cookie_header)
    mode = mode_of(cookie_header)
    if m.re is BANK_PATH:
        b = bank_payload(m.group(1), sid, mode)
        if b is None and m.group(1) != "last":
            return _json(404, {"error": "not found"}, cookie)
        return _json(200, b, cookie)                 # no last bank: null, a normal answer (no red console line)
    p = lookup(m.group(1), mode)
    if p is None:
        return _json(404, {"error": "not found"}, cookie)
    if m.re is STATE_PATH:
        return _json(200, state(view(p, mode), sid), cookie)
    if hidden(p, mode):
        return _json(404, {"error": "not in sugar mode"}, cookie)
    out = _json(200, public(view(p, mode), sid), cookie)
    seen(p["code"], sid)
    return out


# STEM_REDIRECT=https://new.site: this server only sends every request there (same path; the browser keeps the #CODE).
# 302/307, never 301: browsers cache a 301 for good, so unsetting the variable would not bring the old site back.
REDIRECT = os.environ.get("STEM_REDIRECT", "").rstrip("/")


class Handler(http.server.SimpleHTTPRequestHandler):
    def moved(self, status):
        self.send_response(status)
        self.send_header("Location", REDIRECT + self.path)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def reply(self, res, head=False):
        status, headers, data = res
        self.send_response(status)
        for k, v in headers.items():
            if k != "Cache-Control":                      # end_headers sends it on every response
                self.send_header(k, v)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        if not head:
            self.wfile.write(data)

    def route(self, head=False):
        if REDIRECT:
            self.moved(302)
            return
        path = self.path.split("?")[0]
        if path in BLOCK or path.startswith(BLOCK_PREFIX):
            self.send_error(404)
            return
        res = dispatch("GET", path, self.headers.get("Cookie", ""))
        if res:
            self.reply(res, head)
            return
        if path == "/stem-stuff.html":
            ensure_bundle()
        (super().do_HEAD if head else super().do_GET)()

    def do_GET(self):
        self.route()

    def do_HEAD(self):
        self.route(head=True)

    def do_POST(self):
        if REDIRECT:
            self.moved(307)                               # 307 keeps POST + body
            return
        try:
            n = min(int(self.headers.get("Content-Length") or 0), POST_MAX + 1)
        except ValueError:
            n = 0
        body = self.rfile.read(n) if n > 0 else b""
        stream = STREAMS.get(self.path.split("?")[0])
        if stream:
            status, headers, chunks = stream(self.headers.get("Cookie", ""), body)
            self.send_response(status)
            for k, v in headers.items():
                if k != "Cache-Control":
                    self.send_header(k, v)
            self.end_headers()
            for c in chunks:                              # HTTP/1.0: no length, the close ends it; each chunk goes out as it comes
                self.wfile.write(c)
                self.wfile.flush()
            return
        res = dispatch("POST", self.path, self.headers.get("Cookie", ""), body)
        if res:
            self.reply(res)
        else:
            self.send_error(404)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    problems()
    socketserver.ThreadingTCPServer.allow_reuse_address = True
    with socketserver.ThreadingTCPServer(("0.0.0.0", PORT), Handler) as s:
        print(f"http://0.0.0.0:{PORT}  bank: {BANK}")
        s.serve_forever()
