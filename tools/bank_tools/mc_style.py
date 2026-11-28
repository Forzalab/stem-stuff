#!/usr/bin/env python3
"""MCX-1: classify every top-level single-choice `mc` item of a bank as choice_style "math" or "text" and write the field (SCHEMA.md `choice_style`).

  python3 tools/bank_tools/mc_style.py [--write] BANK_X.json ... (problems.json too)

Rule: "math" when MORE THAN HALF of the item's choices hold KaTeX (a `$`), else "text" (code, words, numbers in words). A bank
without the field is read as "text" by the app, so "text" only has to be written once a human has decided; this script writes it
on every mc item so the choice is explicit and reviewable. An item that already has the field is left alone (a human override
wins) unless --force. Dry run by default: prints counts and the math codes. --write rewrites the file only if it round-trips
byte for byte through json.dumps(indent=2, ensure_ascii=False) + "\\n" (the repo's bank format), else it refuses that file."""
import json
import sys


def style_of(p):
    ch = p.get("choices") or []
    return "math" if ch and 2 * sum("$" in str(c.get("md", "")) for c in ch) > len(ch) else "text"


def dump(d):
    return json.dumps(d, indent=2, ensure_ascii=False) + "\n"


def main(argv):
    write, force = "--write" in argv, "--force" in argv
    paths = [a for a in argv if not a.startswith("--")]
    if not paths:
        print(__doc__)
        return 2
    rc = 0
    for path in paths:
        raw = open(path, encoding="utf-8").read()
        doc = json.loads(raw)
        probs = doc["problems"] if isinstance(doc, dict) and "problems" in doc else doc
        n = {"text": 0, "math": 0, "kept": 0}
        math = []
        for p in probs:
            if not isinstance(p, dict) or p.get("type") != "mc" or p.get("pick") == "all":   # pick-all keeps its own layout: no field
                continue
            if "choice_style" in p and not force:
                n["kept"] += 1
                continue
            s = style_of(p)
            n[s] += 1
            if s == "math":
                math.append(p["code"])
            # the field sits right after `type`, so it reads with the other mc fields
            items = [(k, v) for k, v in p.items() if k != "choice_style"]
            i = next((j for j, (k, _) in enumerate(items) if k == "type"), -1) + 1
            items.insert(i, ("choice_style", s))
            p.clear()
            p.update(items)
        print(f"{path}: text {n['text']}, math {n['math']}, already set {n['kept']}" + (f"; math: {' '.join(math)}" if math else ""))
        if write and (n["text"] or n["math"]):
            probe = json.loads(raw)
            if dump(probe) != raw:
                print(f"{path}: does not round-trip through json.dumps(indent=2); not written (edit by hand)", file=sys.stderr)
                rc = 1
                continue
            open(path, "w", encoding="utf-8").write(dump(doc))
    return rc


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
