"""Slips from the formula: for each num item (or num part) with a `form`, flip the sign of each term of every sum
(and of the whole answer) and drop each term, one at a time. List every slip value that no `wrong` entry catches.

Run: python3 tools/slips.py [banks/BANK_X.json ...]     (default: problems.json + banks/*.json; report only)
     python3 tools/slips.py --strict ...                 (exit 1 on any uncovered slip)
"""
import json, sys
from pathlib import Path
from sympy import Add, parse_expr

ROOT = Path(__file__).resolve().parent.parent


def parse(src):
    return parse_expr(str(src).replace("^", "**"), evaluate=False)   # authored text only, never student input; unfolded so terms survive


def mutants(expr):
    """(label, expr) per slip: -whole, then per Add node each term flipped / dropped."""
    out = [("flip whole", -expr)]
    for node in {n for n in expr.atoms(Add)} | ({expr} if isinstance(expr, Add) else set()):
        for t in node.args:
            rest = [a for a in node.args if a is not t]
            for label, repl in ((f"flip {t}", Add(*rest, -t)), (f"drop {t}", Add(*rest))):
                out.append((label, expr.xreplace({node: repl})))
    return out


def close(a, b, tol):
    return abs(a - b) <= tol * max(1, abs(b)) or f"{a:.3g}" == f"{b:.3g}"


def units(p):
    if p.get("type") == "multi":
        for i, q in enumerate(p.get("parts", [])):
            yield f"{p['code']}#{i}", q
    else:
        yield p["code"], p


def check(path):
    bad, rows = 0, []
    for p in json.loads(Path(path).read_text())["problems"]:
        for code, u in units(p):
            if u.get("type") != "num" or not u.get("form"):
                continue
            tol = u.get("tol", 1e-6)
            ans = float(parse(u["answer"]).doit())
            got = float(parse(u["form"]).doit())
            if not close(got, ans, tol):
                rows.append(f"  {code}: form = {got:.4g} but answer = {ans:.4g}")
                bad += 1
                continue
            caught = [float(parse(w["match"]).doit()) for w in u.get("wrong", []) if "match" in w]
            skip = [float(parse(s).doit()) for s in u.get("ignore_slips", [])]
            seen = []
            for label, m in mutants(parse(u["form"])):
                try:
                    v = float(m.doit())
                except (TypeError, ValueError, ZeroDivisionError):
                    continue
                if v != v or abs(v) == float("inf") or any(close(v, s, tol) for s in seen):
                    continue
                seen.append(v)
                if close(v, ans, tol):
                    rows.append(f"  {code}: SAME {v:.4g}  ({label}) can't be told apart by number")
                elif not any(close(v, c, tol) for c in caught + skip):
                    rows.append(f"  {code}: MISSING {v:.4g}  ({label})")
                    bad += 1
    return bad, rows


def main(argv):
    strict = "--strict" in argv
    paths = [a for a in argv if not a.startswith("--")] or [ROOT / "problems.json", *sorted((ROOT / "banks").glob("*.json"))]
    total = 0
    for path in paths:
        bad, rows = check(path)
        total += bad
        if rows:
            print(path)
            print("\n".join(rows))
    print(f"{total} uncovered slip(s)")
    return 1 if strict and total else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
