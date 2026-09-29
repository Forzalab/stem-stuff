"""stem-stuff server. usage: python3 serve.py [port] [problems.json]

- Serves the site from this folder.
- Reads the whole problem bank from ONE file (default: problems.json next to this script; SCHEMA.md).
  Edit or replace the file: the next request re-reads it (mtime check), no restart.
- GET /p/<CODE>.json   -> the public part of one problem (no answers, no hints).
- POST /check          -> grades {code, answer | choice | parts}; 2 attempts per problem per browser (cookie).
- The bank file itself, keys, logs and server files are never served.
"""
import ast
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

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "tools"))
try:
    import bundle  # tools/bundle.py: builds stem-stuff.html (offline download)
except Exception:  # noqa: BLE001
    bundle = None

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 5567
ROOT = os.path.dirname(os.path.abspath(__file__))
BANK = os.path.abspath(sys.argv[2]) if len(sys.argv) > 2 else os.path.join(ROOT, "problems.json")
MAX_TRIES = 2
PUBLIC = ("code", "title", "type", "var", "body", "how")
DEFAULT_NUDGE = "QUACK. Plug your answer back into the problem. Does it work?"

# Server-only or private paths: never served.
BLOCK_PREFIX = ("/k/", "/log/", "/.git", "/tests/", "/tools/")
BLOCK = {"/serve.py", "/deploy.sh", "/host.log", "/.host.pid", "/problems.json", "/" + os.path.basename(BANK)}
BUNDLE = os.path.join(ROOT, "stem-stuff.html")
BUNDLE_DIRS = ("", "design", "vendor", "vendor/katex")
CODE_PATH = re.compile(r"^/p/([A-Z][A-Z0-9]*_[A-Z0-9]{2,})\.json$")
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


# ---------------- math: a small safe evaluator for math.js-style answers ----------------
FUNCS = {
    "sqrt": math.sqrt, "abs": abs, "exp": math.exp, "ln": math.log, "log": math.log, "log10": math.log10,
    "sin": math.sin, "cos": math.cos, "tan": math.tan, "asin": math.asin, "acos": math.acos, "atan": math.atan,
    "sec": lambda x: 1 / math.cos(x), "csc": lambda x: 1 / math.sin(x), "cot": lambda x: 1 / math.tan(x),
    "sinh": math.sinh, "cosh": math.cosh, "tanh": math.tanh,
}
CONSTS = {"pi": math.pi, "e": math.e, "deg": math.pi / 180, "inf": math.inf, "infinity": math.inf}
TOKEN = re.compile(r"\s*(?:(\d+\.?\d*(?:e[+-]?\d+)?|\.\d+(?:e[+-]?\d+)?)|([a-z_][a-z0-9_]*)|(\*\*|[-+*/^(),]))")
OPS = {ast.Add: lambda a, b: a + b, ast.Sub: lambda a, b: a - b, ast.Mult: lambda a, b: a * b,
       ast.Div: lambda a, b: a / b, ast.Pow: lambda a, b: a ** b}


def to_python(src, var):
    """math.js-ish text -> Python expression text. Adds implicit '*' (2x, 3pi, )(, x(1+x)); '^' -> '**'."""
    s = src.strip().lower().replace("π", "pi").replace("∞", "inf").replace("·", "*").replace("×", "*")
    toks, i = [], 0
    while i < len(s):
        m = TOKEN.match(s, i)
        if not m or m.end() == i:
            if s[i:].strip() == "":
                break
            raise ValueError("bad character")
        num, name, op = m.groups()
        if name and name not in FUNCS and name not in CONSTS and name != var:
            raise ValueError("unknown name " + name)
        kind = "num" if num else "name" if name else op
        text = num or name or ("**" if op == "^" else op)
        if toks:
            pk, pt = toks[-1]
            ends_value = pk == "num" or pk == ")" or (pk == "name" and pt not in FUNCS)
            starts_value = kind in ("num", "name", "(")
            if ends_value and starts_value:
                toks.append(("*", "*"))
        toks.append((kind, text))
        i = m.end()
    return " ".join(t for _, t in toks)


def _eval(node, env):
    if isinstance(node, ast.Expression):
        return _eval(node.body, env)
    if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)) and not isinstance(node.value, bool):
        return float(node.value)
    if isinstance(node, ast.Name):
        if node.id in env:
            return env[node.id]
        raise ValueError("name")
    if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.UAdd, ast.USub)):
        v = _eval(node.operand, env)
        return -v if isinstance(node.op, ast.USub) else v
    if isinstance(node, ast.BinOp) and type(node.op) in OPS:
        a, b = _eval(node.left, env), _eval(node.right, env)
        r = OPS[type(node.op)](a, b)
        if isinstance(r, complex):
            raise ValueError("complex")
        return r
    if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id in FUNCS and not node.keywords:
        args = [_eval(a, env) for a in node.args]
        if node.func.id == "log" and len(args) == 2:  # math.js log(x, base)
            return math.log(args[0], args[1])
        if len(args) != 1:
            raise ValueError("arity")
        return float(FUNCS[node.func.id](args[0]))
    raise ValueError("not allowed")


def evaluate(src, var="x", at=None):
    """Value of a math.js-style expression (at var = at). Raises ValueError/ArithmeticError if unreadable."""
    if len(src) > 200:
        raise ValueError("too long")
    tree = ast.parse(to_python(src, var), mode="eval")
    env = dict(CONSTS)
    if at is not None:
        env[var] = float(at)
    return _eval(tree, env)


# ---------------- grading ----------------
DNE = re.compile(r"^\s*(dne|does not exist)\s*$", re.I)
UNREADABLE = (ValueError, ArithmeticError, SyntaxError, TypeError, RecursionError, MemoryError)


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


_tries = {}  # (sid, code) -> {"wrong": [signatures], "done": bool}. In memory: a restart resets tries.
_tries_lock = threading.Lock()


def grade(p, sid, body):
    """body: {choice} (mc) | {answer} (num/expr/text) | {parts: [...]} (multi).
    Reply {verdict, triesLeft, error?, hint?, repeat?}. The answer is never in the reply."""
    with _tries_lock:
        st = _tries.setdefault((sid, p["code"]), {"wrong": [], "done": False})

        def left():
            return MAX_TRIES - len(st["wrong"])

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
