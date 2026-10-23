"""Tolerance 1b (SCHEMA.md `tol`; brain topics/tolerance-1b-2026-10-23.md): the wiggle test, the nested-wiggle auto tol and the tol
warnings. Authoring / gate time only: the grader never runs it, it reads the `tol` this writes.

Levels, child over parent (WebAssign-style): question `tol` > topic `tol` (bank `topics[<problem topic>]`) > bank `tol` > 2%.

Wiggle (num item or part with a `form` and no `tol`): recompute the key from `form` with g 9.8 <-> 9.81, pi 3.14 / 3.1416, and every
decimal number +-1 in its last digit. Integers and fractions are exact (the 5 in 5! is exactly 5), so they stay. Key unchanged every
time -> definitive: tol 1e-4 (0.01%) with tol_why, at question level.

Nested wiggle (brain _files/plan-nested-wiggle-2026-10-23.md, Q1-Q7 defaults in tolerance-1b Amendment 2): a form that is not
definitive and has no author tol at any level (Q4) gets tol_src "auto": every student rounding profile is enumerated on the concrete
values (lane A: each rounding site kept or rounded to 3 s.f., one world per constant: g 9.8/9.81, pi calc/3.14/3.1416, the final typed
at 3 or 4 s.f.). E = the worst miss that sig3 does not already pass. tol = min(cap, max(0.5%, 1.25 E)), cap = min(2%, half the gap to
the nearest one-change slip), so no slip value is graded right. Lane B (first order) names the top site and flags CANCEL / NONLINEAR.
Data +-1 in the last digit is in the definitive test only, never in E (Q2). A non-terminating fraction reused (4/3 -> 1.33) is a site
(Q1). 2 s.f. students are reported, never passed (Q3). g = 10 stays a slip (Q6).

Warnings (never an error), each printed and appended as one JSONL line {ts, bank, item, kind, tol, E, E2, top_site, note} to --log:
NO_TOL (num units with no tol at any level), OFF_BY_ONE (integer key, integer-only inputs, no tol), CAP (1.25 E above the cap: an
ill-conditioned form, Q5 warn not block), CANCEL, NONLINEAR, FALLBACK (a node bag over 4096 values: lane B worst case), SF2 (a 2 s.f.
student misses the tol: report only).

Run: python3 tools/tol.py [banks/BANK_X.json ...]      (default: problems.json + banks/*.json; report + warnings)
     python3 tools/tol.py --write ...                   (store tol + tol_why (+ tol_src auto) on each definitive / auto unit)
     --log PATH   the JSONL warning log (default $BRAIN/projects/calc/_files/tol-warnings.jsonl when that dir exists, else
                  ./tol-warnings.jsonl; BRAIN defaults to /home/claude/brain).  --no-log: print only.
"""
import itertools
import json
import math
import os
import re
import sys
from datetime import datetime, timezone
from decimal import Context, Decimal, ROUND_HALF_UP
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
import slips  # noqa: E402

from sympy import Add, Float, Function, Mul, NumberSymbol, Pow, Rational, S, acos, asin, atan, cos, pi, sin, tan  # noqa: E402

EXACT = slips.EXACT
WHY = "wiggle test: g, pi and every decimal datum +-1 in its last digit leave the key unchanged (integers and fractions are exact)"
NUM = re.compile(r"(?<![\w.^])(\d+\.?\d*|\.\d+)(?![\w.])")      # a number literal, not an exponent, not part of a name (log10)

# nested wiggle (plan section 4)
FLOOR = slips.SLIP_WIN   # 0.5%: the largest half unit at 3 s.f.
CAP = slips.TOL_NUM      # 2%
SCALE = 1.25             # S: the plan's starting value (step 3 calibrates it)
NODE_CAP = 4096          # values per node bag; over it -> lane B (FALLBACK)
G_WORLD = (9.8, 9.81)
PI_WORLD = (math.pi, 3.14, 3.1416)
TRIG = (sin, cos, tan)
INV = (asin, acos, atan)
KINDS = ("NO_TOL", "OFF_BY_ONE", "CAP", "CANCEL", "NONLINEAR", "FALLBACK", "SF2")


def bump(lit, d):
    """lit +-1 in its last digit, as text: 2.65 -> 2.66, 150 -> 149."""
    dec = len(lit.split(".")[1]) if "." in lit else 0
    return f"{float(lit) + d * 10 ** -dec:.{dec}f}"


def wiggles(form):
    """every variant of form: one change each."""
    out = [form.replace("9.81", "9.8")] if "9.81" in form else []
    out += [re.sub(r"(?<![\d.])9\.8(?![\d])", "9.81", form)] if re.search(r"(?<![\d.])9\.8(?![\d])", form) else []
    out += [re.sub(r"\bpi\b", p, form) for p in ("3.14", "3.1416") if re.search(r"\bpi\b", form)]
    for m in NUM.finditer(form):
        if "." in m.group(1):
            out += [form[:m.start()] + bump(m.group(1), d) + form[m.end():] for d in (1, -1)]
    return out


def definitive(form):
    k = slips.value(form)
    for w in wiggles(form):
        try:
            v = slips.value(w)
        except (ZeroDivisionError, ValueError, TypeError):
            return False
        if not abs(v - k) <= (1e-9 * abs(k) if k else slips.ZERO):
            return False
    return True


# ---------------- nested wiggle: lane A (bags) + lane B (first order) ----------------
class _Cap(Exception):
    pass


def rnd(v, p):
    """v to p s.f., ties away from zero (slips._r3's rule)."""
    if v == 0 or not math.isfinite(v):
        return v
    return float(Context(prec=p, rounding=ROUND_HALF_UP).create_decimal(Decimal(v)))


def sig3(a, b):
    """serve.py sig3: right to 3 s.f. (the grader passes it whatever the tol)."""
    if b == 0 or not (math.isfinite(a) and math.isfinite(b)):
        return False
    return abs(a - b) <= 0.5 * 10 ** (math.floor(math.log10(abs(b))) - 2) * (1 + 1e-9)


def _is_g(n):
    return isinstance(n, Float) and any(abs(float(n) - g) < 1e-12 for g in G_WORLD)


def _exact(n, memo):
    """the exact rational value of a subtree with no constant (g, pi) and no function, else None. Decimal data count as exact (Q2)."""
    k = id(n)
    if k in memo:
        return memo[k]
    q = None
    if isinstance(n, Rational):
        q = n
    elif isinstance(n, Float):
        q = None if _is_g(n) else Rational(str(n))
    elif isinstance(n, (Add, Mul)):
        kids = [_exact(a, memo) for a in n.args]
        if all(c is not None for c in kids):
            q = Add(*kids) if isinstance(n, Add) else Mul(*kids)
    elif isinstance(n, Pow) and n.exp.is_Integer and abs(int(n.exp)) <= 64:
        b = _exact(n.base, memo)
        if b is not None and not (b == 0 and n.exp < 0):
            q = b ** n.exp
    memo[k] = q
    return q


def _terminating(q):
    d = int(q.q)
    for f in (2, 5):
        while d % f == 0:
            d //= f
    return d == 1


def _chain(n):
    return isinstance(n, Mul) or (isinstance(n, Pow) and n.exp.is_Integer)


def _degmode(n, parent, memo):
    """x*pi/180 inside a trig function, x exact: degree mode, no rounding (the 24% artifact on cos(60*pi/180))."""
    if not (isinstance(parent, TRIG) and isinstance(n, Mul) and pi in n.args):
        return False
    rest = [a for a in n.args if a is not pi]
    has180 = any((isinstance(a, Pow) and a.base == 180 and a.exp == -1) or a == Rational(1, 180) for a in rest)
    return has180 and all(_exact(a, memo) is not None for a in rest)


def _site(n, parent, memo):
    """does a student round the value at this node? (plan section 2)"""
    if parent is None or isinstance(n, (Rational, Float, NumberSymbol)):
        return False
    if isinstance(n, Function) or (isinstance(n, Pow) and not n.exp.is_Integer):
        return True
    q = _exact(n, memo)
    top = isinstance(n, Add) or (_chain(n) and not _chain(parent))
    if q is not None:
        return top and not _terminating(q)                          # Q1: 4/3 reused is a site, 0.25 is not
    if isinstance(n, Mul) and len(n.args) == 2 and S.NegativeOne in n.args:
        return False                                                # negation
    return top


_F = {sin: math.sin, cos: math.cos, tan: math.tan, asin: math.asin, acos: math.acos, atan: math.atan}


def _apply(n, vals):
    if isinstance(n, Add):
        return sum(vals)
    if isinstance(n, Mul):
        return math.prod(vals)
    if isinstance(n, Pow):
        return vals[0] ** vals[1]
    f = _F.get(n.func)
    if f:
        return f(*vals)
    return float(n.func(*map(Float, vals)).evalf())


def _key(v):
    return float(f"{v:.12g}") if math.isfinite(v) else v


class _Walk:
    """one evaluation of a form's tree in one constant world. bag mode (p s.f. at every site) or point mode (lane B: perturb a site)."""

    def __init__(self, e, g, pv, p=None, perturb=None):
        self.e, self.g, self.pv, self.p, self.perturb = e, g, pv, p, perturb or {}
        self.memo, self.sites, self.big = {}, [], 0.0

    def run(self):
        return self.ev(self.e, None, (), False)

    def ev(self, n, parent, path, in_trig):
        if isinstance(n, Rational):
            bag = [float(n)]
        elif isinstance(n, Float):
            bag = [self.g if _is_g(n) else float(n)]
        elif n is pi:
            bag = [self.pv]
        elif isinstance(n, NumberSymbol):
            bag = [float(n)]
        elif _degmode(n, parent, self.memo):
            return [float(n.evalf())]                               # degree mode: exact, never a site
        else:
            trig = in_trig or isinstance(n, TRIG)
            kids = [self.ev(a, n, path + (i,), trig) for i, a in enumerate(n.args)]
            if math.prod(map(len, kids)) > NODE_CAP:
                raise _Cap()
            bag = []
            for vals in itertools.product(*kids):
                try:
                    v = _apply(n, list(vals))
                except (ValueError, ZeroDivisionError, OverflowError, TypeError):
                    continue
                if isinstance(v, complex) or not math.isfinite(v):
                    continue
                bag.append(v)
        for v in bag:
            self.big = max(self.big, abs(v))
        if _site(n, parent, self.memo):
            deg = isinstance(n, INV) and in_trig                    # an inverse-trig angle reused in trig: 0.1 degree
            r = (lambda v: math.radians(round(math.degrees(v), 1))) if deg else (lambda v: rnd(v, self.p or 3))
            if self.p is None:                                      # point mode (lane B)
                self.sites.append((path, n, bag[0], (r(bag[0]) - bag[0]) / abs(bag[0]) if bag[0] else 0.0))
                bag = [bag[0] * self.perturb.get(path, 1.0)]
            else:
                bag = bag + [r(v) for v in bag]
        out = {}
        for v in bag:
            out.setdefault(_key(v), v)
        if len(out) > NODE_CAP:
            raise _Cap()
        return list(out.values())


def _worlds(e):
    memo, has_g, has_pi = {}, False, False

    def walk(n, parent):
        nonlocal has_g, has_pi
        if _degmode(n, parent, memo):
            return
        has_g |= _is_g(n)
        has_pi |= n is pi
        for a in n.args:
            walk(a, n)
    walk(e, None)
    return [(g, p) for g in (G_WORLD if has_g else (None,)) for p in (PI_WORLD if has_pi else (math.pi,))]


def _label(n):
    s = str(n).replace("**", "^")
    return s if len(s) <= 40 else s[:37] + "..."


def nested(form, key):
    """the nested-wiggle tol of a form: {tol, E, E2, cap, gap1, top_site, flags, sites}. None for a zero key (absolute 1e-9 anyway)."""
    if key == 0:
        return None
    e = slips.parse(form)
    worlds = _worlds(e)
    flags, E, E2, raw = [], 0.0, 0.0, 0.0
    try:
        for g, pv in worlds:
            for v in _Walk(e, g, pv, p=3).run():
                raw = max(raw, abs(v - key) / abs(key))
                for f in (3, 4):
                    y = rnd(v, f)
                    E = max(E, 0.0 if sig3(y, key) else abs(y - key) / abs(key))
            for v in _Walk(e, g, pv, p=2).run():
                E2 = max(E2, abs(rnd(v, 2) - key) / abs(key))
    except _Cap:
        flags.append("FALLBACK")
        E2 = None
    # lane B: one forward pass per site and world, d ln v / d delta_j
    EB, top, kappa, big, nsites = 0.0, (None, 0.0), 0.0, 0.0, 0
    for g, pv in worlds:
        w = _Walk(e, g, pv)
        v0 = w.run()[0]
        big, nsites = max(big, w.big), max(nsites, len(w.sites))
        off = (v0 - key) / abs(key)                                 # the constant world itself, signed
        if abs(off) > top[1]:
            top = (" ".join(([f"g={g}"] if g is not None else []) + ([f"pi={pv}"] if pv != math.pi else [])) or "constants", abs(off))
        k, up, down = 0.0, 0.0, 0.0
        for path, n, x, d in w.sites:
            h = 1e-6
            vj = _Walk(e, g, pv, perturb={path: 1 + h}).run()[0]
            s_j = (vj - v0) / (v0 * h) if v0 else 0.0
            t = s_j * d                                             # this site rounded: first-order change, signed
            k += abs(s_j)
            up, down = up + max(t, 0.0), down + min(t, 0.0)
            if abs(t) > top[1]:
                top = (_label(n), abs(t))
        kappa = max(kappa, k)
        EB = max(EB, abs(off + up), abs(off + down))               # the worst subset of sites, to first order (lane A's profiles)
    if "FALLBACK" in flags:
        E = EB
    elif raw > 0 and abs(raw - EB) / raw > 0.5:
        flags.append("NONLINEAR")
    if kappa > 100 or abs(key) < 1e-12 * big:
        flags.append("CANCEL")
    gaps = [abs(c - key) / abs(key) for _, c in slips.mutants(form) if not slips._same(c, key)]
    gap1 = min(gaps) if gaps else math.inf
    cap = min(CAP, 0.5 * gap1)
    want = max(FLOOR, SCALE * E)
    if SCALE * E > cap:
        flags.append("CAP")
    t = float(f"{min(cap, want):.3g}")
    if t > cap:
        t = math.floor(cap * 1e6) / 1e6
    t = max(t, EXACT)
    if E2 is not None and E2 > t:
        flags.append("SF2")
    return {"tol": t, "E": E, "E2": E2, "EB": EB, "cap": cap, "gap1": gap1, "top_site": top[0], "kappa": kappa,
            "flags": flags, "sites": nsites, "worlds": len(worlds)}


def why(r):
    s = (f"nested wiggle: 3 s.f. rounding at {r['sites']} site(s), {r['worlds']} g/pi world(s) moves the typed key up to {r['E']:.2%} "
         f"past 3 s.f.; tol = min(cap {r['cap']:.2%}, max(0.5%, {SCALE} E))")
    if r["top_site"]:
        s += f"; top site {r['top_site']}"
    return s + ("; lane B fallback (bag over 4096)" if "FALLBACK" in r["flags"] else "")


# ---------------- levels + warnings ----------------
def _ok(t):
    return isinstance(t, (int, float)) and not isinstance(t, bool) and 0 < t <= 0.05


def topic_tol(bank, p):
    """the problem's topic tol: bank `topics[p.topic].tol`, else None."""
    t = (bank.get("topics") or {}).get(p.get("topic")) if isinstance(bank.get("topics"), dict) and isinstance(p.get("topic"), str) else None
    return t["tol"] if isinstance(t, dict) and _ok(t.get("tol")) else None


def _ev(bank, item, kind, note, tol=None, r=None):
    return {"bank": bank, "item": item, "kind": kind, "tol": tol, "E": r and r["E"], "E2": r and r["E2"],
            "top_site": r and r["top_site"], "note": note}


def events(bank, path="bank"):
    """the NO_TOL / OFF_BY_ONE warnings for one bank, as log events (dicts with kind + note)."""
    out, bare = [], []
    for p in bank["problems"]:
        for code, u in slips.units(p):
            if u.get("type") != "num" or "tol" in u:
                continue
            if topic_tol(bank, p) is None:
                bare.append(code)
            f = u.get("form")
            try:
                whole = float(slips.value(u["answer"])).is_integer()
            except Exception:  # noqa: BLE001  an unreadable answer: tests/schema.test.mjs reports it
                whole = False
            if whole and isinstance(f, str) and not any("." in m.group(1) for m in NUM.finditer(f)):
                out.append(_ev(path, code, "OFF_BY_ONE", "integer key, integer inputs, no tol: an off-by-one passes at 2%. Run tools/tol.py --write"))
    if bare and not _ok(bank.get("tol")):
        out.insert(0, _ev(path, None, "NO_TOL", f"{len(bare)} num unit(s) with no tol at any level: set tol for this bank, topic or question "
                                                "(default 2% applies)"))
    return out


def line(ev):
    return f"  WARN {ev['item'] or ev['bank']}: {ev['note']}"


def warnings(bank, path="bank"):
    """the tol warnings for one bank (lines, never an error)."""
    return [line(e) for e in events(bank, path)]


_NOTE = {"CAP": "1.25 E is above the cap (2% or half the gap to the nearest slip): an ill-conditioned form, the cap is used",
         "CANCEL": "cancellation: the key is small against its terms (kappa > 100), the tol is not trustworthy",
         "NONLINEAR": "lane A and lane B differ by more than half: rounding acts nonlinearly here",
         "FALLBACK": "a node bag passed 4096 values: lane B worst case used for E",
         "SF2": "a 2 s.f. student misses this tol (report only, Q3)"}


def check(path, write=False, log=None):
    """report rows for one bank file; with write, store the definitive / auto tols. log: a list that gets every warning event."""
    bank = json.loads(Path(path).read_text())
    name = Path(path).name
    rows, evs, n = [], [], 0
    for p in bank["problems"]:
        for code, u in slips.units(p):
            if u.get("type") != "num":
                continue
            auto = u.get("tol_src") == "auto"
            parent = topic_tol(bank, p), (bank.get("tol") if _ok(bank.get("tol")) else None)
            if "tol" in u and not auto:
                rows.append(f"  {code}: author tol {u['tol']}")
            elif isinstance(u.get("form"), str) and definitive(u["form"]):
                rows.append(f"  {code}: definitive -> tol {EXACT}")
                if write:
                    u.pop("tol_src", None)
                    u["tol"], u["tol_why"], n = EXACT, WHY, n + 1
            elif parent[0] is not None or parent[1] is not None:      # Q4: an author tol at any level beats tol_src auto
                rows.append(f"  {code}: " + (f"topic tol {parent[0]}" if parent[0] is not None else f"bank tol {parent[1]}"))
                if write and auto:
                    for k in ("tol", "tol_why", "tol_src"):
                        u.pop(k, None)
                    n += 1
            elif isinstance(u.get("form"), str) and (r := nested(u["form"], slips.value(u["answer"]))):
                e2 = "n/a" if r["E2"] is None else f"{r['E2']:.2%}"
                rows.append(f"  {code}: auto tol {r['tol']} (E {r['E']:.2%}, E2 {e2}, cap {r['cap']:.2%}, top {r['top_site']})")
                for k in r["flags"]:
                    ev = _ev(name, code, k, _NOTE[k], r["tol"], r)
                    evs.append(ev)
                    rows.append(line(ev))
                if write and (u.get("tol"), u.get("tol_why")) != (r["tol"], why(r)):
                    u["tol"], u["tol_why"], u["tol_src"], n = r["tol"], why(r), "auto", n + 1
            else:
                rows.append(f"  {code}: default 2%")
    if n:
        Path(path).write_text(json.dumps(bank, ensure_ascii=False, indent=2) + "\n")
    tail = events(bank, name)
    rows += [line(e) for e in tail]
    if log is not None:
        log += evs + tail
    return rows


def default_log():
    d = Path(os.environ.get("BRAIN", "/home/claude/brain")) / "projects" / "calc" / "_files"
    return d / "tol-warnings.jsonl" if d.is_dir() else Path("tol-warnings.jsonl")


def append_log(path, evs):
    """one JSONL line per warning: {ts, bank, item, kind, tol, E, E2, top_site, note}."""
    if not evs:
        return
    ts = datetime.now(timezone.utc).isoformat(timespec="seconds")
    with open(path, "a", encoding="utf-8") as f:
        for e in evs:
            f.write(json.dumps({"ts": ts, **{k: e[k] for k in ("bank", "item", "kind", "tol", "E", "E2", "top_site", "note")}},
                               ensure_ascii=False) + "\n")


def log_arg(argv):
    """(log path or None, the other args): --log PATH, --no-log, else default_log()."""
    rest, out, i = [], default_log(), 0
    while i < len(argv):
        if argv[i] == "--log" and i + 1 < len(argv):
            out, i = Path(argv[i + 1]), i + 2
            continue
        if argv[i] == "--no-log":
            out = None
        else:
            rest.append(argv[i])
        i += 1
    return out, rest


def main(argv):
    logp, argv = log_arg(argv)
    write = "--write" in argv
    paths = [a for a in argv if a != "--write"] or [str(ROOT / "problems.json"), *map(str, sorted((ROOT / "banks").glob("*.json")))]
    evs = []
    for path in paths:
        print(path)
        print("\n".join(check(path, write, evs)))
    if logp is not None and evs:
        append_log(logp, evs)
        print(f"{len(evs)} warning(s) logged to {logp}")


if __name__ == "__main__":
    main(sys.argv[1:])
