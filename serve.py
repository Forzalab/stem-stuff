"""stem-stuff server. usage: python3 serve.py [port] [problems.json]

- Serves the site from this folder.
- Reads the whole problem bank from ONE file (default: problems.json next to this script; SCHEMA.md).
  Edit or replace the file: the next request re-reads it (mtime check), no restart.
- GET /p/<CODE>.json   -> the public part of one problem (no answers, no hints).
- Math: sympy (pip install sympy), behind a token allowlist.
- POST /check          -> grades {code, answer | choice | parts}; tries per problem per browser (cookie): 1 for a 2-choice mc, else 2.
- GET /state/<CODE>    -> this browser's tries on one problem: {wrong, done, gen} (design/DONE.md). No answer, no hints.
- Tries are kept in tries.json (next to this script, or $STEM_TRIES), so a restart keeps them. Tony may hand-edit it:
  deleting an entry resets that problem for that browser (the page sees a newer gen and drops its cached state).
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

import sympy
from sympy.parsing.sympy_parser import auto_number, parse_expr

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "tools"))
try:
    import bundle  # tools/bundle.py: builds stem-stuff.html (offline download)
except Exception:  # noqa: BLE001
    bundle = None

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 5567
ROOT = os.path.dirname(os.path.abspath(__file__))
BANK = os.path.abspath(sys.argv[2]) if len(sys.argv) > 2 else os.path.join(ROOT, "problems.json")
MAX_TRIES = 2  # tries for everything except a 2-choice mc (max_tries)
PUBLIC = ("code", "title", "type", "var", "body", "how")
DEFAULT_NUDGE = "QUACK. Plug your answer back into the problem. Does it work?"

# Server-only or private paths: never served.
BLOCK_PREFIX = ("/k/", "/log/", "/.git", "/tests/", "/tools/")
TRIES = os.environ.get("STEM_TRIES") or os.path.join(ROOT, "tries.json")
BLOCK = {"/serve.py", "/deploy.sh", "/host.log", "/.host.pid", "/problems.json", "/tries.json", "/" + os.path.basename(BANK)}
BUNDLE = os.path.join(ROOT, "stem-stuff.html")
BUNDLE_DIRS = ("", "design", "vendor", "vendor/katex")
CODE_PATH = re.compile(r"^/p/([A-Z][A-Z0-9]*_[A-Z0-9]{2,})\.json$")
STATE_PATH = re.compile(r"^/state/([A-Z][A-Z0-9]*_[A-Z0-9]{2,})$")
_bundle_lock = threading.Lock()


# ---------------- the bank: one file, re-read when it changes ----------------
_bank = {"mtime": None, "by_code": {}}
_bank_lock = threading.Lock()


def problems():
    """code -> full problem (with answers). Re-reads the file when its mtime changes; keeps the last good copy on errors."""
    with _bank_lock:
        try:
            mtime = os.path.getmtime(BANK)
        except OSError:
            return _bank["by_code"]
        if mtime != _bank["mtime"]:
            try:
                with open(BANK, encoding="utf-8") as f:
                    data = json.load(f)
                _bank["by_code"] = {p["code"]: p for p in data["problems"]}
                print(f"loaded {len(_bank['by_code'])} problems from {BANK}", file=sys.stderr)
            except Exception as e:  # noqa: BLE001
                print(f"problems file unreadable, keeping the last good copy: {e}", file=sys.stderr)
            _bank["mtime"] = mtime
        return _bank["by_code"]


def shown(p):
    """mc: the choices on screen (up to 5): the right one, locked ones, then the rest, in authored order."""
    ch = p["choices"]
    if len(ch) <= 5:
        return list(ch)
    keep = [c for c in ch if c["id"] == p["correct"] or c.get("lock")]
    keep += [c for c in ch if c not in keep][: max(0, 5 - len(keep))]
    return [c for c in ch if c in keep]


def max_tries(p):
    """Tries by choice count (Tony, locked): a 2-choice mc gets ONE try; 3+ choices, and every typed type, get TWO.
    app.js maxTries() is the same rule; tests/test_serve.py and tests/tries.test.mjs pin both to one table."""
    return 1 if p.get("type") == "mc" and len(shown(p)) == 2 else MAX_TRIES


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
        out["parts"] = [{k: q[k] for k in ("label", "type", "var") if k in q} for q in p["parts"]]
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
    v = evaluate(text, var)
    if math.isnan(v):
        raise ValueError("nan")
    return v


def same(a, b, tol):
    if isinstance(a, str) or isinstance(b, str):
        return a == b
    if isinstance(a, tuple):
        return len(a) == len(b) and all(same(x, y, tol) for x, y in zip(a, b))
    if math.isinf(a) or math.isinf(b):
        return a == b
    return abs(a - b) <= tol * max(1.0, abs(b))


def unit_correct(u, sig):
    tol = u.get("tol", 1e-6)
    if u["type"] == "text":
        return sig in {squash(t) for t in [u["answer"], *u.get("accept", [])]}
    return same(sig, "dne" if u["answer"] == "dne" else signature(u, u["answer"]), tol)


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


# (sid, code) -> {"wrong": [signatures], "done": bool, "gen": int}. Saved to TRIES on every change (design/DONE.md).
# gen: a counter; every new entry takes the next one. The page caches it; a /state gen above the cached one means
# "this entry was deleted by hand (Tony reset it)", so the page drops its cached state instead of staying locked.
_tries = {}
_gen = {"n": 0, "loaded": None}
_tries_lock = threading.Lock()


def _tup(x):
    return tuple(_tup(y) for y in x) if isinstance(x, list) else x


def _load_tries():
    """Read TRIES once per path (tests point TRIES elsewhere). A missing or broken file = no tries yet."""
    if _gen["loaded"] == TRIES:
        return
    _tries.clear()
    _gen["n"], _gen["loaded"] = 0, TRIES
    try:
        with open(TRIES, encoding="utf-8") as f:
            data = json.load(f)
        _gen["n"] = int(data.get("gen", 0))
        for k, v in data.get("tries", {}).items():
            sid, _, code = k.partition(" ")
            _tries[(sid, code)] = {"wrong": [_tup(w) for w in v.get("wrong", [])], "done": bool(v.get("done")),
                                   "gen": int(v.get("gen", 0))}
    except (OSError, ValueError, AttributeError, TypeError):
        pass


def _save_tries():
    data = {"gen": _gen["n"], "tries": {f"{sid} {code}": st for (sid, code), st in _tries.items()}}
    tmp = TRIES + ".tmp"
    try:
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=1)
        os.replace(tmp, TRIES)
    except OSError as e:
        print("tries.json not saved:", e, file=sys.stderr)


def _entry(sid, code):
    st = _tries.get((sid, code))
    if st is None:
        _gen["n"] += 1
        st = _tries[(sid, code)] = {"wrong": [], "done": False, "gen": _gen["n"]}
    return st


def state(p, sid):
    """{wrong, done, gen} for one browser and problem. No entry: nothing tried yet, gen = the one it would get."""
    with _tries_lock:
        _load_tries()
        st = _tries.get((sid, p["code"]))
        if st is None:
            return {"wrong": 0, "done": False, "gen": _gen["n"] + 1}
        return {"wrong": len(st["wrong"]), "done": st["done"], "gen": st["gen"]}


def grade(p, sid, body):
    """body: {choice} (mc) | {answer} (num/expr/text) | {parts: [...]} (multi).
    Reply {verdict, triesLeft, gen, error?, hint?, repeat?}. The answer is never in the reply."""
    with _tries_lock:
        _load_tries()
        out = _grade(p, _entry(sid, p["code"]), body)
        out["gen"] = _tries[(sid, p["code"])]["gen"]
        if out["verdict"] in ("correct", "wrong"):
            _save_tries()
        return out


def _grade(p, st, body):
    """One try on entry st (caller holds _tries_lock)."""
    def left():
        return max_tries(p) - len(st["wrong"])

    if st["done"] or left() <= 0:
        return {"verdict": "locked", "triesLeft": 0}
    hit = None
    if p["type"] == "mc":
        sig = body.get("choice")
        if sig not in {c["id"] for c in shown(p)}:
            return {"verdict": "invalid", "triesLeft": left()}
        correct = sig == p["correct"]
        if not correct:
            hit = next((w for w in p.get("wrong", []) if w.get("choice") == sig), None)
    else:
        units = p["parts"] if p["type"] == "multi" else [p]
        texts = body.get("parts") if p["type"] == "multi" else [body.get("answer", "")]
        if not isinstance(texts, list) or len(texts) != len(units):
            return {"verdict": "invalid", "triesLeft": left()}
        texts = [str(t)[:200] for t in texts]
        try:
            sigs = [signature(u, t) for u, t in zip(units, texts)]
            oks = [unit_correct(u, g) for u, g in zip(units, sigs)]
        except UNREADABLE:
            return {"verdict": "invalid", "triesLeft": left()}
        correct = all(oks)
        if not correct:
            hit = next((h for u, t, g, ok in zip(units, texts, sigs, oks) if not ok for h in [unit_hit(u, t, g)] if h), None)
        sig = tuple(sigs)
    if correct:
        st["done"] = True
        return {"verdict": "correct", "triesLeft": left()}
    repeat = any(same(sig, x, max(u.get("tol", 1e-6) for u in p.get("parts", [p]))) for x in st["wrong"])
    if not repeat:
        st["wrong"].append(sig)
    out = {"verdict": "wrong", "triesLeft": left(), "hint": hit["hint"] if hit else p.get("nudge", DEFAULT_NUDGE)}
    if hit:
        out["error"] = hit["error"]
    if repeat:
        out["repeat"] = True
    return out


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


class Handler(http.server.SimpleHTTPRequestHandler):
    _cookie = None

    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def send_json(self, status, obj, head=False):
        data = json.dumps(obj).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        if not head:
            self.wfile.write(data)

    def route(self, head=False):
        path = self.path.split("?")[0]
        if path in BLOCK or path.startswith(BLOCK_PREFIX):
            self.send_error(404)
            return
        m = STATE_PATH.match(path)
        if m:
            p = problems().get(m.group(1))
            if p is None:
                self.send_error(404)
            else:
                self.send_json(200, state(p, self.sid()), head)
            return
        m = CODE_PATH.match(path)
        if m:
            p = problems().get(m.group(1))
            if p is None:
                self.send_error(404)
            else:
                self.send_json(200, public(p, self.sid()), head)
            return
        if path == "/stem-stuff.html":
            ensure_bundle()
        (super().do_HEAD if head else super().do_GET)()

    def do_GET(self):
        self.route()

    def do_HEAD(self):
        self.route(head=True)

    def do_POST(self):
        if self.path.split("?")[0] != "/check":
            self.send_error(404)
            return
        try:
            n = int(self.headers.get("Content-Length") or 0)
            body = json.loads(self.rfile.read(n)) if 0 < n <= 4096 else None
        except (ValueError, UnicodeDecodeError):
            body = None
        if not isinstance(body, dict):
            self.send_json(400, {"verdict": "invalid"})
            return
        p = problems().get(str(body.get("code", "")))
        if p is None:
            self.send_json(404, {"verdict": "invalid"})
            return
        self.send_json(200, grade(p, self.sid(), body))

    def sid(self):
        """This browser's id (cookie). A new one is set on the response if missing or malformed."""
        jar = http.cookies.SimpleCookie()
        try:
            jar.load(self.headers.get("Cookie", ""))
        except http.cookies.CookieError:
            pass
        if "sid" in jar and re.fullmatch(r"[0-9a-f]{32}", jar["sid"].value):
            return jar["sid"].value
        sid = secrets.token_hex(16)
        self._cookie = f"sid={sid}; Path=/; Max-Age=31536000; SameSite=Lax; HttpOnly"
        return sid

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        if self._cookie:
            self.send_header("Set-Cookie", self._cookie)
            self._cookie = None
        super().end_headers()


if __name__ == "__main__":
    problems()
    socketserver.ThreadingTCPServer.allow_reuse_address = True
    with socketserver.ThreadingTCPServer(("0.0.0.0", PORT), Handler) as s:
        print(f"http://0.0.0.0:{PORT}  bank: {BANK}")
        s.serve_forever()
