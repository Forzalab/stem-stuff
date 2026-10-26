"""Slip coverage: of the logged wrong num tries, how many get a slip family hint, a SLIP_TIE collide (plain nudge + spot), or nothing
(the fallback ladder's share). Tests the "~95% authored" claim (design round 66, A3). A try an authored `wrong` entry catches is its own
line (/check runs those first). The log is the tries blob serve.py saves (tries.json, or the Upstash key stem:tries on Vercel): every
distinct wrong signature per browser per unit. Each try is graded the way /check grades it today: serve.unit_hit, then serve.slip_hit
(slips.py, SLIP_K, SLIP_TIE), against the banks on disk. Not counted: non-num tries (mc picks, expr, text) and codes no bank has.

Run: python3 tools/slip_coverage.py tries.json     (a saved blob; "-" = stdin)
     python3 tools/slip_coverage.py --kv           (reads stem:tries itself; needs KV_REST_API_URL + KV_REST_API_TOKEN in the env)
"""
import json
import os
import sys
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
import serve  # noqa: E402  (reads argv only when it is __main__; this never saves tries)


def _unit(p, part):
    if p is None:
        return None
    if p.get("type") == "multi":
        ps = p.get("parts", [])
        return ps[part] if part is not None and 0 <= part < len(ps) else None
    return p if part is None else None


def coverage(blob, problem=lambda c: serve.lookup(c, "sugar")):
    """{tries, authored, family, tie, none, families: {family: n}, skipped, unknown} over the blob's wrong signatures.
    problem: code -> full problem (with answers) or None."""
    r = {"tries": 0, "authored": 0, "family": 0, "tie": 0, "none": 0, "skipped": 0, "unknown": 0}
    fams = Counter()
    for key, st in (blob.get("tries") or {}).items():
        bits = key.split(" ")
        if len(bits) not in (2, 3) or not isinstance(st, dict):
            continue
        u = _unit(problem(bits[1]), int(bits[2]) if len(bits) == 3 else None)
        for sig in st.get("wrong", []):
            if u is None:
                r["unknown"] += 1
            elif u.get("type") != "num" or not isinstance(sig, (int, float)) or isinstance(sig, bool):
                r["skipped"] += 1
            else:
                sig = float(sig)
                r["tries"] += 1
                hit = serve.unit_hit(u, str(sig), sig)   # the typed text is not logged: a `re` entry sees the number only
                if hit:
                    r["authored"] += 1
                    continue
                hit = serve.slip_hit(u, sig) or {}
                if hit.get("collide"):
                    r["tie"] += 1
                elif hit.get("error"):
                    r["family"] += 1
                    fams[hit["error"]] += 1
                else:
                    r["none"] += 1
    r["families"] = dict(fams)
    return r


def lines(r):
    n = r["tries"]
    pct = lambda k: f"{k} {r[k]}  {round(100 * r[k] / n) if n else 0}%"
    out = [f"{n} wrong num tries ({r['skipped']} non-num skipped, {r['unknown']} on unknown codes)"]
    out += [pct(k) for k in ("authored", "family", "tie", "none")]
    out += [f"  {f} {c}" for f, c in sorted(r["families"].items(), key=lambda x: -x[1])]
    return out


def main(argv):
    if argv == ["--kv"]:
        if not all(serve.KV):
            print("--kv needs KV_REST_API_URL and KV_REST_API_TOKEN in the env", file=sys.stderr)
            return 2
        blob = json.loads(serve._kv("GET", serve.KV_KEY) or "{}")
    elif argv == ["-"]:
        blob = json.load(sys.stdin)
    elif len(argv) == 1:
        with open(argv[0], encoding="utf-8") as f:
            blob = json.load(f)
    else:
        print(__doc__.strip().split("\n\n")[-1], file=sys.stderr)
        return 2
    print("\n".join(lines(coverage(blob))))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
