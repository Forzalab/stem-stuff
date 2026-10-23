"""Slips from the formula: for each num item (or num part) with a `form`, list every slip (the 10 families of slips.py at the repo root)
that no `wrong` entry catches (MISSING), and every slip equal to the answer (SAME).
Banks with v >= 20261022 also pass the gate (design/HANDOFF-slips-v2.md rule 7): every num has `form`; no SAME; no two families on one
value (CLASH). ignore_slips exempts a value. MISSING there is report only: the grader matches slips at runtime.

Run: python3 tools/slips.py [banks/BANK_X.json ...]     (default: problems.json + banks/*.json; report only)
     python3 tools/slips.py --strict ...                 (exit 1 on a gate failure; on an older bank, on any uncovered slip)
     python3 tools/slips.py --golden                     (rewrite the parity fixtures both test suites read, from slips.py:
                                                          tests/fixtures/slips-golden.json (its own forms) and slips-golden-banks.json
                                                          (CORNERS + every form already there + every live bank form). Run it when a
                                                          bank gains a form or a slip rule changes; review the diff; the JS must match.)
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
if str(ROOT / "tools") not in sys.path:
    sys.path.append(str(ROOT / "tools"))     # tools/tol.py when loaded by path (tests), after ROOT so `slips` is the root module
import slips  # noqa: E402  (the root module, not this file)
import tol as tolwarn  # noqa: E402  (tools/tol.py: tol warnings, never a gate failure)


def check(path):
    bank = json.loads(Path(path).read_text())
    v = bank.get("v", 1)
    if not (isinstance(v, int) and not isinstance(v, bool)):      # same fallback as serve.py _read: a bad v = 1, with a warning
        if "v" in bank:
            print(f"{path}: v must be an int (1 or yyyymmdd), got {v!r}; treated as 1", file=sys.stderr)
        v = 1
    new = v >= slips.CUTOFF
    bad, rows = 0, []
    for p in bank["problems"]:
        for code, u in slips.units(p):
            if u.get("type") != "num":
                continue
            if new:
                fails = slips.gate(u)
                rows += [f"  {code}: {r}" for r in fails]
                bad += len(fails)
                if fails:
                    continue
            elif not u.get("form"):
                continue
            else:
                wrong = slips.form_ok(u)
                if wrong:
                    rows.append(f"  {code}: {wrong}")
                    bad += 1
                    continue
                ans = slips.value(u["answer"])
                rows += [f"  {code}: SAME {v:.4g}  ({fam}) can't be told apart by number" for fam, v in slips.mutants(u["form"]) if slips.close(v, ans)]
            miss = slips.missing(u)
            rows += [f"  {code}: MISSING {v:.4g}  ({fam})" for fam, v in miss]
            bad += 0 if new else len(miss)
    return bad, rows + tolwarn.warnings(bank, Path(path).name)


FIX = ROOT / "tests" / "fixtures"
# parser corners (D4, _files/research-slip-parity-2026-10-23): flattening, Add order, unary minus on a bracket (S3), a-k(b+c) (S1),
# Float vs Integer literals (N1), functions, a tiny constant (relative EPS merge)
CORNERS = ("1/2/3", "8/2*(2+2)", "(1+2)+3", "1-2-3", "10-2-(3+4)", "-(3+4)", "-(3+4)*2", "-(-3)+1", "-2^2", "2^-2", "-2*(3+4)",
           "-2.0*(3+4)", "12.0*(3+4)", "12*(3+4)", "5.0e5-(2+3)", "1e3/(2+3)", "7-2*(2+3)", "5-(3+1)*2", "5-(3+1)/2", "5*(-1+2-3+8)/14",
           "atan(3/4)*180/pi", "-(6639.5/sin(43*pi/180))", "6.67e-11*(3+2)/4", "2*9.8*3", "sqrt(9+16)", "π*(2+3)")


def live_forms():
    """every `form` of the live banks (problems.json + banks/*.json), in file order, once each"""
    out = []
    for path in [ROOT / "problems.json", *sorted((ROOT / "banks").glob("*.json"))]:
        for p in json.loads(path.read_text(encoding="utf-8"))["problems"]:
            out += [u["form"] for _, u in slips.units(p) if isinstance(u.get("form"), str) and u["form"] not in out]
    return out


def _write(path, forms):
    rows = [json.dumps({"form": f, "mutants": [[fam, v] for fam, v in slips.mutants(f)]}, ensure_ascii=False) for f in forms]
    path.write_text("[\n  " + ",\n  ".join(rows) + "\n]\n", encoding="utf-8")


def golden():
    def had(name):
        p = FIX / name
        return [g["form"] for g in json.loads(p.read_text(encoding="utf-8"))] if p.exists() else []
    _write(FIX / "slips-golden.json", had("slips-golden.json"))
    forms = list(dict.fromkeys([*CORNERS, *had("slips-golden-banks.json"), *live_forms()]))
    _write(FIX / "slips-golden-banks.json", forms)
    print(f"wrote {FIX / 'slips-golden.json'} and {FIX / 'slips-golden-banks.json'} ({len(forms)} forms)")
    return 0


def main(argv):
    if "--golden" in argv:
        return golden()
    strict = "--strict" in argv
    paths = [a for a in argv if not a.startswith("--")] or [ROOT / "problems.json", *sorted((ROOT / "banks").glob("*.json"))]
    total = 0
    for path in paths:
        bad, rows = check(path)
        total += bad
        if rows:
            print(path)
            print("\n".join(rows))
    print(f"{total} gate failure(s) / uncovered slip(s)")
    return 1 if strict and total else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
