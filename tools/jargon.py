"""tools/jargon.py: build the per-course jargon allowlist views/allow/<course>.json from HUMAN-written sources only
(views plan, Oct 20: AI-written text carries jargon, so it never counts).

Manifest views/allow/sources.json = [{"path": "<repo-relative>", "course": "<id>", "provenance": "human"|"ai"|"unknown"}].
Only provenance "human" is read; "ai" and "unknown" are listed in the output as ignored. Tony sets provenance per source.
Readers: .txt / .md (all text); .json bank ({"problems": [...]}: each problem's body text md + choice md only, no hints).
Term = a content word not in common English (copy_gate.is_common), or a 2-3-gram of adjacent content words that holds one.
A term is allowed when it occurs >= N times in total (default 3) AND in >= 2 distinct human sources (--min-sources).
Output: {"course", "min_count", "min_sources", "sources": [human paths], "ignored": [{path, provenance}],
         "terms": [{"term", "count", "sources"}]} sorted by term. No human source gives an empty, valid allowlist.
usage: python3 tools/jargon.py [--manifest views/allow/sources.json] [--out-dir views/allow] [--min-count 3]
                               [--min-sources 2] [--course ID] [--root DIR] [--check]"""
import argparse
import json
import os
import sys
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
import copy_gate  # noqa: E402

MANIFEST = os.path.join(ROOT, "views", "allow", "sources.json")
OUT_DIR = os.path.join(ROOT, "views", "allow")


def read_texts(path):
    """The text pieces of one source file."""
    ext = os.path.splitext(path)[1].lower()
    with open(path, encoding="utf-8") as f:
        if ext in (".txt", ".md"):
            return [f.read()]
        if ext == ".json":
            data = json.load(f)
            probs = data.get("problems", []) if isinstance(data, dict) else data
            out = []
            for p in probs:
                for b in p.get("body", []) or []:
                    if isinstance(b, dict) and isinstance(b.get("md"), str):
                        out.append(b["md"])
                for ch in p.get("choices", []) or []:
                    if isinstance(ch, dict) and isinstance(ch.get("md"), str):
                        out.append(ch["md"])
            return out
    raise ValueError("unsupported source type: " + path)


def terms_of(text, common):
    """Every jargon term occurrence (with repeats) in text."""
    out = []
    for run in copy_gate._runs_by_phrase(text):
        rare = [not copy_gate.is_common(w, common) for w in run]
        for n in (1, 2, 3):
            for s in range(0, len(run) - n + 1):
                if any(rare[s:s + n]):
                    out.append(" ".join(run[s:s + n]))
    return out


def build(entries, course, root=ROOT, min_count=3, min_sources=2, common=None):
    common = copy_gate.load_common() if common is None else common
    total, where = Counter(), {}
    human, ignored = [], []
    for e in entries:
        if e.get("course") != course:
            continue
        if e.get("provenance") != "human":
            ignored.append({"path": e["path"], "provenance": e.get("provenance", "unknown")})
            continue
        human.append(e["path"])
        for text in read_texts(os.path.join(root, e["path"])):
            for t in terms_of(text, common):
                total[t] += 1
                where.setdefault(t, set()).add(e["path"])
    terms = [{"term": t, "count": total[t], "sources": len(where[t])} for t in sorted(total)
             if total[t] >= min_count and len(where[t]) >= min_sources]
    return {"course": course, "min_count": min_count, "min_sources": min_sources, "sources": sorted(human),
            "ignored": ignored, "terms": terms}


def dump(obj):
    return json.dumps(obj, indent=1, ensure_ascii=False) + "\n"


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--manifest", default=MANIFEST)
    ap.add_argument("--out-dir", default=OUT_DIR)
    ap.add_argument("--min-count", type=int, default=3)
    ap.add_argument("--min-sources", type=int, default=2)
    ap.add_argument("--course")
    ap.add_argument("--root", default=ROOT, help="base of the manifest's relative paths (default: the repo)")
    ap.add_argument("--check", action="store_true", help="write nothing; exit 1 if an output is stale")
    a = ap.parse_args(argv)
    with open(a.manifest, encoding="utf-8") as f:
        entries = json.load(f)
    courses = [a.course] if a.course else sorted({e["course"] for e in entries})
    stale = 0
    for c in courses:
        out = dump(build(entries, c, a.root, a.min_count, a.min_sources))
        p = os.path.join(a.out_dir, c + ".json")
        old = open(p, encoding="utf-8").read() if os.path.exists(p) else None
        if old != out:
            stale += 1
            if not a.check:
                with open(p, "w", encoding="utf-8") as f:
                    f.write(out)
        print(("stale " if a.check and old != out else "") + p)
    return 1 if a.check and stale else 0


if __name__ == "__main__":
    sys.exit(main())
