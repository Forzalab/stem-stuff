"""Bank-time NOTE (prompt audit B2, design/CLUCK-NOTE.md "Cache"): write saccharine.note[pick] for every wrong mc pick that has a
written slip, with the KEY and the SLIP in view. The wish reads it (serve.cached_note): no live NOTE call, no 1.5 s wait, no second
provider on a Claude-arm wish. A pick with no slip, a pick-all and a chat message still call live.

Each NOTE is serve.note() run once, at bank time, on the same prompt the live call reads (explain_prompt for that pick, no scratchpad):
the strict schema, ZDR, the same models. `on_topic` is left out (cached_note sets it). A note already there and whole is kept.
Split rows: a row with its own choices gets row.note[id], a True/False row gets row.note (serve.sub_problem reads both).

Run: python3 tools/bank_notes.py BANK.json ...            (report: picks with a slip, with a note, the ones missing)
     OPENROUTER_API_KEY=... python3 tools/bank_notes.py --write BANK.json ...   (one paid call per missing pick; writes the bank)
"""
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
import serve  # noqa: E402

NEED = set(serve.NOTE_SCHEMA["required"]) - {"on_topic"}


def whole(n):
    """a NOTE the wish can use: every schema field but on_topic, gap/field/confidence inside their enums"""
    pr = serve.NOTE_SCHEMA["properties"]
    return isinstance(n, dict) and not NEED - set(n) and all(n[k] in pr[k]["enum"] for k in ("gap", "field", "confidence"))


def picks(bank):
    """(code, problem as the wish sees it, wrong id with a slip, get(), put(note)) for every such pick in the bank. Pick-one mc only:
    a pick-all answer is a set, and cached_note serves a single pick."""
    out = []
    for p in bank.get("problems", []):
        sg = serve.sugar(p)
        if p.get("type") == "mc" and isinstance(p.get("correct"), str) and sg.get("key") and isinstance(sg.get("slip"), dict):
            layer = p["saccharine"] if isinstance(p.get("saccharine"), dict) else p          # flat legacy layer: note sits on the problem
            for cid in (c["id"] for c in serve.shown(p) if not c.get("lock")):
                if cid not in serve.rights(p) and sg["slip"].get(cid):
                    out.append((p["code"], p, cid, lambda layer=layer, cid=cid: (layer.get("note") or {}).get(cid),
                                lambda n, layer=layer, cid=cid: layer.setdefault("note", {}).__setitem__(cid, n)))
        for row in sg.get("split") or []:
            if not isinstance(row, dict) or not serve.CODE_RE.match(str(row.get("sub", ""))) or not sg.get("key"):
                continue
            q = serve.sub_problem(p, row)
            tf = not isinstance(row.get("choices"), list)
            for cid, slip in (q["saccharine"].get("slip") or {}).items():
                if slip and cid not in serve.rights(q):
                    get = (lambda row=row: row.get("note")) if tf else (lambda row=row, cid=cid: (row.get("note") or {}).get(cid))
                    put = (lambda n, row=row: row.__setitem__("note", n)) if tf else \
                          (lambda n, row=row, cid=cid: row.setdefault("note", {}).__setitem__(cid, n))
                    out.append((row["sub"], q, cid, get, put))
    return out


def fill(bank, key):
    """one NOTE call per pick missing a whole note; returns (written, failed) as code:id lists. A failed call writes nothing."""
    done, bad = [], []
    for code, p, cid, get, put in picks(bank):
        if whole(get()):
            continue
        n = serve.note(dict(p, saccharine=dict(serve.sugar(p), note={})), cid, None, key)   # never the cached path: the live read
        n = {k: v for k, v in n.items() if k != "on_topic"} if isinstance(n, dict) else None
        if whole(n):
            put(n)
            done.append(f"{code}:{cid}")
        else:
            bad.append(f"{code}:{cid}")
    return done, bad


def main(argv):
    write = "--write" in argv
    paths = [a for a in argv if a != "--write"]
    key = os.environ.get("OPENROUTER_API_KEY", "")
    if not paths or (write and not key):
        print(__doc__ if not paths else "--write needs OPENROUTER_API_KEY", file=sys.stderr)
        return 2
    rc = 0
    for path in paths:
        bank = json.loads(Path(path).read_text())
        if write:
            done, bad = fill(bank, key)
            if done:
                Path(path).write_text(json.dumps(bank, indent=1, ensure_ascii=False) + "\n")
            print(f"{path}: wrote {len(done)}" + (f", failed {len(bad)}: {' '.join(bad)}" if bad else ""))
            rc |= bool(bad)
        ps = picks(bank)
        miss = [f"{c}:{i}" for c, _, i, get, _ in ps if not whole(get())]
        print(f"{path}: {len(ps)} picks with a slip, {len(ps) - len(miss)} with a note" + (f"; MISSING {' '.join(miss)}" if miss else ""))
    return rc


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
