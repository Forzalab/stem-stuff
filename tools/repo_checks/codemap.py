#!/usr/bin/env python3
"""tools/repo_checks/codemap.py: the two CODEMAP checks in ONE repo file (Tony Nov 7 23:15). apply_codemap.py stays brain-only.
  codemap.py comments <old-file> <new-file> [py|js|css]   PASS only if the new file differs by added comment lines only
        (nothing removed or changed), header names = '== §name ==' anchors (each once), syntax same (py AST / node --check / css braces).
  codemap.py comments --lint <file>...                    header/anchor consistency only
  codemap.py map [CODEMAP.md]                             run from the repo root: every row path exists, every tracked code file
        (js mjs py css html sh) has a row or sits under a folder row (path ends with '/'), the big files have a CODEMAP HEADER.
Prints PASS or FAIL lines; exit 0 / 1."""
import ast, difflib, os, re, subprocess, sys, tempfile
BIG = "aiw.py oui.py graph.js nav.js".split()   # files that carry a header today; add a name when a split PR gives a file one


def comments(argv):
    if argv[0] == "--lint":
        rc = 0
        for fp in argv[1:]:
            t = open(fp, encoding="utf-8").read()
            h = re.search(r"CODEMAP HEADER.*?END CODEMAP HEADER", t, re.S)
            if not h:
                print("FAIL: %s no header" % fp); rc = 1; continue
            inh = re.findall(r"^\S*\s*  §(\S+)", h.group(0), re.M)
            ank = re.findall(r"^\s*(?://|#|/\*)\s*== §(\S+) ==", t, re.M)
            if sorted(inh) != sorted(ank) or len(set(ank)) != len(ank):
                print("FAIL: %s header/anchor mismatch %s" % (fp, sorted(set(inh) ^ set(ank)))); rc = 1
            else:
                print("PASS: " + fp)
        return rc
    old_p, new_p = argv[0], argv[1]
    kind = argv[2] if len(argv) > 2 else {"py": "py", "js": "js", "mjs": "js", "css": "css"}[new_p.rsplit(".", 1)[-1]]
    old = open(old_p, encoding="utf-8").read().split("\n")
    new = open(new_p, encoding="utf-8").read().split("\n")
    bad = []
    cm = re.compile(r"^\s*(//|#|/\*)")
    for op, a1, a2, b1, b2 in difflib.SequenceMatcher(None, old, new, autojunk=False).get_opcodes():
        if op in ("replace", "delete"):
            bad.append("changed or removed old lines %d-%d" % (a1 + 1, a2))
        if op in ("replace", "insert"):
            for j in range(b1, b2):
                if not cm.match(new[j]):
                    bad.append("added non-comment line %d: %s" % (j + 1, new[j][:60]))
    txt = "\n".join(new)
    hdr = re.search(r"CODEMAP HEADER.*?END CODEMAP HEADER", txt, re.S)
    if not hdr:
        bad.append("no header block")
    else:
        inh = re.findall(r"^\S*\s*  §(\S+)", hdr.group(0), re.M)
        ank = re.findall(r"^\s*(?://|#|/\*)\s*== §(\S+) ==", txt, re.M)
        if sorted(inh) != sorted(ank):
            bad.append("header names vs anchors differ: %s" % sorted(set(inh) ^ set(ank)))
        if len(set(ank)) != len(ank):
            bad.append("duplicate anchor")
    if kind == "py":
        if ast.dump(ast.parse("\n".join(old))) != ast.dump(ast.parse(txt)):
            bad.append("AST differs")
    elif kind == "js":
        d = tempfile.mkdtemp(); p = os.path.join(d, "x.mjs"); open(p, "w").write(txt)
        if subprocess.run(["node", "--check", p], capture_output=True).returncode:
            bad.append("node --check failed")
    else:
        f = lambda s: (s.count("{"), s.count("}"))
        if f("\n".join(old)) != f(txt):
            bad.append("brace count differs")
    print("\n".join("FAIL: " + b for b in bad) if bad else "PASS")
    return 1 if bad else 0


def map_check(argv):
    md = open(argv[0] if argv else "CODEMAP.md", encoding="utf-8").read()
    paths = re.findall(r"^\| `([^`]+)` \|", md, re.M)
    tracked = subprocess.run(["git", "ls-files"], capture_output=True, text=True).stdout.split("\n")
    bad = ["row path missing on disk: " + q for q in paths if not os.path.exists(q)]
    folders = [q for q in paths if q.endswith("/")]
    for t in tracked:
        if re.search(r"\.(js|mjs|py|css|html|sh)$", t) and t not in paths and not any(t.startswith(f) for f in folders):
            bad.append("code file not in CODEMAP: " + t)
    for t in BIG:
        for cand in [t] + [q for q in paths if q.endswith("/" + t)]:
            if os.path.exists(cand) and "CODEMAP HEADER" not in open(cand, encoding="utf-8").read():
                bad.append("no header: " + cand)
    print("\n".join("FAIL: " + b for b in bad) if bad else "PASS")
    return 1 if bad else 0


if __name__ == "__main__":
    cmd, rest = (sys.argv[1], sys.argv[2:]) if len(sys.argv) > 2 or (len(sys.argv) == 2 and sys.argv[1] == "map") else ("", [])
    sys.exit(comments(rest) if cmd == "comments" else map_check(rest) if cmd == "map" else print(__doc__) or 2)
