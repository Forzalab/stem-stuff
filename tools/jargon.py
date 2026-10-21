"""tools/jargon.py: build the per-course jargon BLACKLIST views/allow/<course>-black.json (Tony, Oct 20: blacklist for
now; AI-written text carries jargon, human-written text shows which terms students really meet).

Manifest views/allow/sources.json = [{"path": "<repo-relative>", "course": "<id>"}]. Provenance comes from the file
extension only, never a manual tag (provenance()): .json and .md = "ai"; every other type (.txt, .pdf, slides, ...) =
"human". A "provenance" key in the manifest is ignored.
Readers: .txt (all text); .md (all text); .json bank ({"problems": [...]}: each problem's body text md + choice md only,
no hints). Any other type (pdf, pptx, ...) needs a text export next to it: put the .txt in the manifest (a .txt is human).
Term = a content word not in common English (copy_gate.is_common), or a 2-3-gram of adjacent content words that holds one.
Thresholds (defaults):
  --min-ai 3      a term is used >= 3 times in total across the course's AI sources (frequent in AI text), AND
  --max-human 1   it is used <= 1 time in total across the course's human sources (absent or rare in human text).
Output: {"course", "min_ai", "max_human", "ai_sources", "human_sources", "terms": [{"term", "ai", "human"}]}, sorted by
term. No AI source gives an empty, valid blacklist. copy_gate.load_black(course) reads it.
usage: python3 tools/jargon.py [--manifest views/allow/sources.json] [--out-dir views/allow] [--min-ai 3]
                               [--max-human 1] [--course ID] [--root DIR] [--check]"""
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
AI_EXT = (".json", ".md")


def provenance(path):
    """'ai' for .json / .md, 'human' for every other file type."""
    return "ai" if os.path.splitext(path)[1].lower() in AI_EXT else "human"


def read_texts(path):
    """The text pieces of one source file."""
    ext = os.path.splitext(path)[1].lower()
    if ext not in (".txt", ".md", ".json"):
        raise ValueError("no reader for %s: add a .txt export of it to the manifest" % path)
    with open(path, encoding="utf-8") as f:
        if ext != ".json":
            return [f.read()]
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


def build(entries, course, root=ROOT, min_ai=3, max_human=1, common=None):
    common = copy_gate.load_common() if common is None else common
    count = {"ai": Counter(), "human": Counter()}
    paths = {"ai": [], "human": []}
    for e in entries:
        if e.get("course") != course:
            continue
        prov = provenance(e["path"])
        paths[prov].append(e["path"])
        for text in read_texts(os.path.join(root, e["path"])):
            count[prov].update(terms_of(text, common))
    ai, human = count["ai"], count["human"]
    terms = [{"term": t, "ai": ai[t], "human": human[t]} for t in sorted(ai)
             if ai[t] >= min_ai and human[t] <= max_human]
    return {"course": course, "min_ai": min_ai, "max_human": max_human, "ai_sources": sorted(paths["ai"]),
            "human_sources": sorted(paths["human"]), "terms": terms}


def dump(obj):
    return json.dumps(obj, indent=1, ensure_ascii=False) + "\n"


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--manifest", default=MANIFEST)
    ap.add_argument("--out-dir", default=OUT_DIR)
    ap.add_argument("--min-ai", type=int, default=3)
    ap.add_argument("--max-human", type=int, default=1)
    ap.add_argument("--course")
    ap.add_argument("--root", default=ROOT, help="base of the manifest's relative paths (default: the repo)")
    ap.add_argument("--check", action="store_true", help="write nothing; exit 1 if an output is stale")
    a = ap.parse_args(argv)
    with open(a.manifest, encoding="utf-8") as f:
        entries = json.load(f)
    courses = [a.course] if a.course else sorted({e["course"] for e in entries})
    stale = 0
    for c in courses:
        out = dump(build(entries, c, a.root, a.min_ai, a.max_human))
        p = os.path.join(a.out_dir, c + "-black.json")
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
