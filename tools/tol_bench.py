"""Tolerance 1b replay bench: every num key x nearby inputs, graded by the old rule (tol*max(1,|b|), default 1e-6, or 3 s.f.) and by
serve.unit_correct (relative, zero key absolute 1e-9, default 2%). Prints each verdict that flips.

Run: python3 tools/tol_bench.py [banks/BANK_X.json ...]     (default: problems.json + banks/*.json)
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
import serve  # noqa: E402
import slips  # noqa: E402

REL = (1e-4, 1e-3, 5e-3, 0.01, 0.015, 0.019, 0.021, 0.03, 0.05, 0.1, 0.5)


def old(u, a, b):
    tol = u.get("tol", 1e-6)
    return abs(a - b) <= tol * max(1.0, abs(b)) or serve.sig3(a, b)


def inputs(b):
    xs = {0.0, b + 0.01, b - 0.01, b + 1, b - 1, *(b * (1 + s * r) for r in REL for s in (1, -1))}
    xs |= {float(f"{b:.{n}g}") for n in (1, 2, 3)}
    return sorted(xs)


def bench(path):
    bank = json.loads(Path(path).read_text())
    rows, n = [], 0
    for p in bank["problems"]:
        for code, u in slips.units(p):
            if u.get("type") != "num" or u.get("answer") == "dne":
                continue
            b = serve.signature(u, u["answer"])
            for a in inputs(b):
                n += 1
                was, now = old(u, a, b), serve.unit_correct(u, a)
                if was != now:
                    rows.append(f"  {code}: key {b:.6g} tol {u.get('tol', '-')} typed {a:.6g}: {'right' if was else 'wrong'} -> {'right' if now else 'wrong'}")
    return n, rows


def main(argv):
    for path in argv or [str(ROOT / "problems.json"), *map(str, sorted((ROOT / "banks").glob("*.json")))]:
        n, rows = bench(path)
        print(f"{path}: {n} inputs, {len(rows)} flips")
        print("\n".join(rows))


if __name__ == "__main__":
    main(sys.argv[1:])
