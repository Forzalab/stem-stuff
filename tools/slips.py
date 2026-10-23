"""Slips from the formula: for each num item (or num part) with a `form`, list every slip (the 10 families of slips.py at the repo root)
that no `wrong` entry catches (MISSING), and every slip equal to the answer (SAME).
Banks with v >= 20261022 also pass the gate (design/HANDOFF-slips-v2.md rule 7): every num has `form`; no SAME; no two families on one
value (CLASH). ignore_slips exempts a value. MISSING there is report only: the grader matches slips at runtime.

Run: python3 tools/slips.py [banks/BANK_X.json ...]     (default: problems.json + banks/*.json; report only)
     python3 tools/slips.py --strict ...                 (exit 1 on a gate failure; on an older bank, on any uncovered slip)
     --log PATH: also append the tol warnings as JSONL (tools/tol.py's format). Only when given: CI and tests never write a log.
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
import slips  # noqa: E402  (the root module, not this file)
import tol as tolwarn  # noqa: E402  (tools/tol.py: tol warnings, never a gate failure)


def check(path, log=None):
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
    evs = tolwarn.events(bank, Path(path).name)
    if log is not None:
        log += evs
    return bad, rows + [tolwarn.line(e) for e in evs]


def main(argv):
    strict = "--strict" in argv
    logp = argv[argv.index("--log") + 1] if "--log" in argv and argv.index("--log") + 1 < len(argv) else None
    argv = [a for i, a in enumerate(argv) if not (logp is not None and i == argv.index("--log") + 1)]
    paths = [a for a in argv if not a.startswith("--")] or [ROOT / "problems.json", *sorted((ROOT / "banks").glob("*.json"))]
    total, evs = 0, []
    for path in paths:
        bad, rows = check(path, evs)
        total += bad
        if rows:
            print(path)
            print("\n".join(rows))
    print(f"{total} gate failure(s) / uncovered slip(s)")
    if logp is not None:
        tolwarn.append_log(logp, evs)
    return 1 if strict and total else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
