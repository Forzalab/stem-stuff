"""Tolerance 1b (SCHEMA.md `tol`; brain topics/tolerance-1b-2026-10-23.md): the wiggle test + the tol warnings. Authoring / gate time
only: the grader never runs it, it reads the `tol` this writes.

Wiggle (num item or part with a `form` and no `tol`): recompute the key from `form` with g 9.8 <-> 9.81, pi 3.14 / 3.1416, and every
decimal number +-1 in its last digit. Integers and fractions are exact (the 5 in 5! is exactly 5), so they stay. Key unchanged every
time -> definitive: tol 1e-4 (0.01%) with tol_why, at question level. Not definitive, or no form -> no tol: the bank's tol, else 2%.
An author `tol` always wins and is left alone.

Warnings (never an error): a bank with num units that have no tol at any level (question, bank; the schema has no topic level), and
an off-by-one-prone unit (integer key, a form with integer inputs only, no tol: the wiggle test was not written).

Run: python3 tools/tol.py [banks/BANK_X.json ...]      (default: problems.json + banks/*.json; report + warnings)
     python3 tools/tol.py --write ...                   (store tol + tol_why on each definitive unit)
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
import slips  # noqa: E402

EXACT = slips.EXACT
WHY = "wiggle test: g, pi and every decimal datum +-1 in its last digit leave the key unchanged (integers and fractions are exact)"
NUM = re.compile(r"(?<![\w.^])(\d+\.?\d*|\.\d+)(?![\w.])")      # a number literal, not an exponent, not part of a name (log10)


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


def warnings(bank, path="bank"):
    """the tol warnings for one bank (lines, never an error)."""
    out, bare = [], []
    for p in bank["problems"]:
        for code, u in slips.units(p):
            if u.get("type") != "num" or "tol" in u:
                continue
            bare.append(code)
            f = u.get("form")
            try:
                whole = float(slips.value(u["answer"])).is_integer()
            except Exception:  # noqa: BLE001  an unreadable answer: tests/schema.test.mjs reports it
                whole = False
            if whole and isinstance(f, str) and not any("." in m.group(1) for m in NUM.finditer(f)):
                out.append(f"  WARN {code}: integer key, integer inputs, no tol: an off-by-one passes at 2%. Run tools/tol.py --write")
    if bare and "tol" not in bank:
        out.insert(0, f"  WARN {path}: {len(bare)} num unit(s) with no tol at any level: set tol for this bank or question (default 2% applies)")
    return out


def check(path, write=False):
    bank = json.loads(Path(path).read_text())
    rows, n = [], 0
    for p in bank["problems"]:
        for code, u in slips.units(p):
            if u.get("type") != "num":
                continue
            if "tol" in u:
                rows.append(f"  {code}: author tol {u['tol']}")
            elif isinstance(u.get("form"), str) and definitive(u["form"]):
                rows.append(f"  {code}: definitive -> tol {EXACT}")
                if write:
                    u["tol"], u["tol_why"], n = EXACT, WHY, n + 1
            else:
                rows.append(f"  {code}: default 2%")
    rows += warnings(bank, Path(path).name)
    if n:
        Path(path).write_text(json.dumps(bank, ensure_ascii=False, indent=2) + "\n")
    return rows


def main(argv):
    write = "--write" in argv
    paths = [a for a in argv if a != "--write"] or [str(ROOT / "problems.json"), *map(str, sorted((ROOT / "banks").glob("*.json")))]
    for path in paths:
        print(path)
        print("\n".join(check(path, write)))


if __name__ == "__main__":
    main(sys.argv[1:])
