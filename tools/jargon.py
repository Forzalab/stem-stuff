"""tools/jargon.py: build the per-course jargon BLACKLIST views/allow/<course>-black.json (Tony, Oct 20: blacklist for
now; AI-written text carries jargon, human-written text shows which terms students really meet).

Manifest views/allow/sources.json = [{"path": "<repo-relative or absolute>", "course": "<id>", "external": true?}].
"external": true marks a source outside the repo (the brain): a course with any external source missing on disk is
skipped (its shipped list is kept, --check passes for it), so CI without the brain still checks in-repo courses. Provenance comes from the file
extension only, never a manual tag (provenance()): .json and .md = "ai"; every other type (.txt, .pdf, slides, ...) =
"human". A "provenance" key in the manifest is ignored.
Readers: .txt, .md, extensionless (all text); .pdf (pdftotext); .json bank ({"problems": [...]}: each problem's body text md + choice md only,
no hints; a list md is joined by lines). Any other type (pptx, ...) needs a text export next to it: put the .txt in the manifest (a .txt is human).
Term = a content word not in common English (copy_gate.is_common), or a 2-3-gram of adjacent content words that holds one.
TeX commands (backslash cdot, backslash text, ...) are markup, not words: they are removed before terms are cut.
A term is blacklisted only when ALL hold (defaults; Oct 21 tightening: raw hit counts let one long AI bank, or a topic
the human docs skipped, flood the list):
  (a) --min-ai-files 3  it occurs in >= 3 DISTINCT AI source files (not just >= 3 hits),
  (b) --max-human 0     it has <= 0 hits in the course's human sources,
  (c) it is not common English (copy_gate.is_common, per word as above),
  (d) none of its words is a bank-format/markup token of views/allow/format-stop.txt (SCHEMA.md keys + fixed UI words).
Output: {"course", "min_ai_files", "max_human", "ai_sources", "human_sources", "terms": [{"term", "ai", "ai_files",
"human"}]} (ai = total AI hits), sorted by term. No AI source gives an empty, valid blacklist.
copy_gate.load_black(course) reads it.
usage: python3 tools/jargon.py [--manifest views/allow/sources.json] [--out-dir views/allow] [--min-ai-files 3]
                               [--max-human 0] [--course ID] [--root DIR] [--check]"""
import argparse
import json
import os
import re
import subprocess
import sys
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
import copy_gate  # noqa: E402

MANIFEST = os.path.join(ROOT, "views", "allow", "sources.json")
OUT_DIR = os.path.join(ROOT, "views", "allow")
FORMAT_STOP = os.path.join(ROOT, "views", "allow", "format-stop.txt")
AI_EXT = (".json", ".md")
_TEX_CMD = re.compile(r"\\[A-Za-z]+")


def load_format_stop(path=FORMAT_STOP):
    """The bank-format/markup stop words of format-stop.txt (one lowercase word per line, # comments)."""
    with open(path, encoding="utf-8") as f:
        return {w for w in (ln.split("#", 1)[0].strip().lower() for ln in f) if w}


def provenance(path):
    """'ai' for .json / .md, 'human' for every other file type."""
    return "ai" if os.path.splitext(path)[1].lower() in AI_EXT else "human"


def read_texts(path):
    """The text pieces of one source file."""
    ext = os.path.splitext(path)[1].lower()
    if ext == ".pdf":
        try:
            r = subprocess.run(["pdftotext", "-q", path, "-"], capture_output=True, text=True)
        except FileNotFoundError:
            raise ValueError("no pdftotext (poppler-utils) to read %s: install it or add a .txt export" % path)
        if r.returncode:
            raise ValueError("pdftotext failed on %s" % path)
        return [r.stdout]
    if ext not in ("", ".txt", ".md", ".json"):
        raise ValueError("no reader for %s: add a .txt export of it to the manifest" % path)
    with open(path, encoding="utf-8") as f:
        if ext != ".json":
            return [f.read()]
        data = json.load(f)
    probs = data.get("problems", []) if isinstance(data, dict) else data
    out = []
    for p in probs:
        for b in (p.get("body", []) or []) + (p.get("choices", []) or []):
            md = b.get("md") if isinstance(b, dict) else None
            if isinstance(md, list):
                md = "\n".join(x for x in md if isinstance(x, str))
            if isinstance(md, str):
                out.append(md)
    return out


def terms_of(text, common):
    """Every jargon term occurrence (with repeats) in text."""
    out = []
    for run in copy_gate._runs_by_phrase(_TEX_CMD.sub(" ", text)):
        rare = [not copy_gate.is_common(w, common) for w in run]
        for n in (1, 2, 3):
            for s in range(0, len(run) - n + 1):
                if any(rare[s:s + n]):
                    out.append(" ".join(run[s:s + n]))
    return out


def missing_external(entries, course, root=ROOT):
    """External sources of course not on disk (a non-empty list means: skip this course)."""
    return [e["path"] for e in entries if e.get("course") == course and e.get("external")
            and not os.path.exists(os.path.join(root, e["path"]))]


def build(entries, course, root=ROOT, min_ai_files=3, max_human=0, common=None, stop=None):
    common = copy_gate.load_common() if common is None else common
    stop = load_format_stop() if stop is None else stop
    count = {"ai": Counter(), "human": Counter()}
    files = Counter()  # term -> distinct AI files holding it
    paths = {"ai": [], "human": []}
    for e in entries:
        if e.get("course") != course:
            continue
        prov = provenance(e["path"])
        paths[prov].append(e["path"])
        here = Counter()
        for text in read_texts(os.path.join(root, e["path"])):
            here.update(terms_of(text, common))
        count[prov].update(here)
        if prov == "ai":
            files.update(here.keys())
    ai, human = count["ai"], count["human"]
    terms = [{"term": t, "ai": ai[t], "ai_files": files[t], "human": human[t]} for t in sorted(ai)
             if files[t] >= min_ai_files and human[t] <= max_human and not stop.intersection(t.split())]
    return {"course": course, "min_ai_files": min_ai_files, "max_human": max_human, "ai_sources": sorted(paths["ai"]),
            "human_sources": sorted(paths["human"]), "terms": terms}


def dump(obj):
    return json.dumps(obj, indent=1, ensure_ascii=False) + "\n"


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--manifest", default=MANIFEST)
    ap.add_argument("--out-dir", default=OUT_DIR)
    ap.add_argument("--min-ai-files", type=int, default=3, help="distinct AI source files a term must occur in")
    ap.add_argument("--max-human", type=int, default=0, help="most hits a term may have in the human sources")
    ap.add_argument("--course")
    ap.add_argument("--root", default=ROOT, help="base of the manifest's relative paths (default: the repo)")
    ap.add_argument("--check", action="store_true", help="write nothing; exit 1 if an output is stale")
    a = ap.parse_args(argv)
    with open(a.manifest, encoding="utf-8") as f:
        entries = json.load(f)
    courses = [a.course] if a.course else sorted({e["course"] for e in entries})
    stale = 0
    for c in courses:
        p = os.path.join(a.out_dir, c + "-black.json")
        miss = missing_external(entries, c, a.root)
        if miss:
            print("skip %s: %d external source(s) not on disk" % (p, len(miss)))
            continue
        out = dump(build(entries, c, a.root, a.min_ai_files, a.max_human))
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
