#!/usr/bin/env python3
"""tools/repo_checks/move_inventory.py: proves a file-move PR lost nothing (T1).
  move_inventory.py record OUT.json [--root DIR]   save 4 inventories: public build files, local URLs (html + sw.js BASE),
                                                   vercel includeFiles files, python import graph of non-test .py
  move_inventory.py check BEFORE.json [--root DIR] record now, map BEFORE through shared/temporary_rename_map/rename-map.json, diff
  move_inventory.py readmes DIR...                 every DIR needs a one-line README.md
Allowed gaps in check: map entries with ship == "no" (may leave the public build), new README.md / __init__.py files. Exit 0 PASS / 1 FAIL."""
import ast, glob, json, os, re, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_ROOT = os.path.dirname(os.path.dirname(HERE))
MAP = "shared/temporary_rename_map/rename-map.json"
PAGES = ["index.html", "calc.html", "privacy.html"]
SKIP = {".git", ".claude", "node_modules", "__pycache__", "public", ".venv", ".impeccable", ".vercel"}
URL_RES = [re.compile(r"""(?:src|href)\s*=\s*["']([^"']+)["']"""),
           re.compile(r"""\bimport\s*(?:[^'"();]*?\bfrom\s*)?["']([^"']+)["']"""),
           re.compile(r"""\bimport\(\s*["']([^"']+)["']\s*\)""")]


def local_url(u):
    """The repo-relative path of a local URL, else None (http(s)://, scheme:, //host, #frag, empty)."""
    u = u.strip()
    if not u or u.startswith(("#", "//")) or re.match(r"[A-Za-z][A-Za-z0-9+.-]*:", u):
        return None
    u = re.split(r"[?#]", u, maxsplit=1)[0]
    if u.startswith("./") and len(u) > 2:
        u = u[2:]
    if u.startswith("/"):
        u = u.lstrip("/")
    return u or None


def walk(root):
    for d, dirs, files in os.walk(root):
        dirs[:] = sorted(x for x in dirs if x not in SKIP)
        for f in sorted(files):
            yield os.path.relpath(os.path.join(d, f), root).replace(os.sep, "/")


def build_files(root):
    with tempfile.TemporaryDirectory() as tmp:
        out = os.path.join(tmp, "public")
        r = subprocess.run([sys.executable, os.path.join(root, "tools/build_and_ship/build_public.py"), out], cwd=root, capture_output=True, text=True)
        if r.returncode:
            raise SystemExit("build_public failed:\n" + r.stdout + r.stderr)
        return sorted(os.path.relpath(os.path.join(d, f), out).replace(os.sep, "/") for d, _, fs in os.walk(out) for f in fs)


def url_inventory(root):
    inv = {}
    for page in PAGES:
        p = os.path.join(root, page)
        if os.path.exists(p):
            t = open(p, encoding="utf-8").read()
            inv[page] = sorted({lu for rx in URL_RES for u in rx.findall(t) for lu in [local_url(u)] if lu})
    p = os.path.join(root, "sw.js")
    if os.path.exists(p):
        t = open(p, encoding="utf-8").read()
        m = re.search(r"const BASE = \[(.*?)\];", t, re.S)
        strs = re.findall(r'"([^"]*)"', re.sub(r"\.\.\.KATEX_FONTS\.map\(.*?\)", "", m.group(1)) if m else "")
        f = re.search(r"const KATEX_FONTS = \[(.*?)\];", t, re.S)
        if m and f and "...KATEX_FONTS" in m.group(1):   # the one spread BASE uses: fonts expanded to their files
            m2 = re.search(r'KATEX_FONTS\.map\(\w+ => "([^"]*)" \+ \w+ \+ "([^"]*)"\)', m.group(1))
            strs += [m2.group(1) + x + m2.group(2) for x in re.findall(r'"([^"]*)"', f.group(1))] if m2 else []
        inv["sw.js:BASE"] = sorted({lu for u in strs for lu in [local_url(u)] if lu})
    return inv


def braces(s):
    m = re.search(r"\{([^{}]*)\}", s)
    if not m:
        return [s]
    return [x for alt in m.group(1).split(",") for x in braces(s[:m.start()] + alt + s[m.end():])]


def include_files(root):
    out = set()
    p = os.path.join(root, "vercel.json")
    if not os.path.exists(p):
        return []
    for fn in json.load(open(p)).get("functions", {}).values():
        for pat in braces(fn.get("includeFiles", "")):
            for hit in glob.glob(os.path.join(root, pat), recursive=True):
                if os.path.isfile(hit):
                    out.add(os.path.relpath(hit, root).replace(os.sep, "/"))
                else:
                    out.update(os.path.relpath(os.path.join(d, f), root).replace(os.sep, "/") for d, _, fs in os.walk(hit) for f in fs)
    return sorted(out)


def is_test(rel):
    return rel.split("/")[0] == "tests" or os.path.basename(rel).startswith("test_")


def resolve(root, mod, base_dirs):
    for b in base_dirs:
        stem = os.path.join(b, *mod.split(".")) if mod else b
        for c in (stem + ".py", os.path.join(stem, "__init__.py")):
            if os.path.isfile(c) and os.path.abspath(c).startswith(os.path.abspath(root) + os.sep):
                return os.path.relpath(c, root).replace(os.sep, "/")
    return None


def import_graph(root):
    graph = {}
    for rel in walk(root):
        if not rel.endswith(".py") or is_test(rel):
            continue
        try:
            tree = ast.parse(open(os.path.join(root, rel), encoding="utf-8").read())
        except (SyntaxError, UnicodeDecodeError):
            graph[rel] = ["<unparsable>"]
            continue
        here = os.path.join(root, os.path.dirname(rel))
        found = set()
        for n in ast.walk(tree):
            if isinstance(n, ast.Import):
                mods = [(a.name, 0, []) for a in n.names]
            elif isinstance(n, ast.ImportFrom):
                mods = [(n.module or "", n.level, [a.name for a in n.names])]
            else:
                continue
            for mod, level, names in mods:
                bases = [os.path.normpath(os.path.join(here, *[".."] * (level - 1)))] if level else [root, here]
                hit = resolve(root, mod, bases) if mod else None
                if hit:
                    found.add(hit)
                for nm in names:   # "from pkg import submodule"
                    sub = resolve(root, (mod + "." if mod else "") + nm, bases)
                    if sub:
                        found.add(sub)
        graph[rel] = sorted(found - {rel})
    return graph


def record(root):
    return {"build_public": build_files(root), "local_urls": url_inventory(root),
            "include_files": include_files(root), "py_imports": import_graph(root)}


def load_map(root):
    p = os.path.join(root, MAP)
    return json.load(open(p)).get("entries", []) if os.path.exists(p) else []


def remap(path, entries):
    """(new path, matched entry has ship == "no")."""
    for e in entries:
        old, new = e["old"], e["new"]
        if old.endswith("/") and path.startswith(old):
            return new + path[len(old):], e.get("ship") == "no"
        if path == old:
            return new, e.get("ship") == "no"
    return path, False


def extra_ok(p):
    return os.path.basename(p) in ("README.md", "__init__.py")


def diff_sets(name, before, after, entries):
    """FAIL lines for paths lost from / invented in AFTER, after mapping BEFORE."""
    mapped, excused = {}, set()
    for p in before:
        n, no = remap(p, entries)
        mapped[n] = p
        if no:
            excused.add(n)
    a = set(after)
    out = ["%s: missing in AFTER: %s (was %s)" % (name, n, mapped[n]) for n in sorted(set(mapped) - a - excused)]
    out += ["%s: unexpected in AFTER: %s" % (name, n) for n in sorted(a - set(mapped)) if not extra_ok(n)]
    return out


def compare(before, after, entries):
    fails = diff_sets("build_public", before["build_public"], after["build_public"], entries)
    fails += diff_sets("include_files", before["include_files"], after["include_files"], entries)
    for page in sorted(set(before["local_urls"]) | set(after["local_urls"])):
        fails += diff_sets("urls[%s]" % page, before["local_urls"].get(page, []), after["local_urls"].get(page, []), entries)
    gb, ga = before["py_imports"], after["py_imports"]
    fails += diff_sets("py_files", gb, list(ga), entries)
    for f in sorted(gb):
        nf, _ = remap(f, entries)
        if nf not in ga:
            continue
        want = sorted({remap(i, entries)[0] for i in gb[f]})
        got = sorted(i for i in ga[nf] if i in want or not extra_ok(i))
        extra = [i for i in got if i not in want]
        miss = [i for i in want if i not in got]
        if miss or extra:
            fails.append("py_imports[%s]: missing %s extra %s" % (nf, miss, extra))
    return fails


def getroot(argv):
    if "--root" in argv:
        i = argv.index("--root")
        r = os.path.abspath(argv[i + 1])
        del argv[i:i + 2]
        return r
    return DEFAULT_ROOT


def readmes(dirs):
    rc = 0
    for d in dirs:
        p = os.path.join(d, "README.md")
        if not os.path.isfile(p):
            print("FAIL: %s has no README.md" % d); rc = 1; continue
        lines = [l for l in open(p, encoding="utf-8").read().splitlines() if l.strip()]
        if len(lines) != 1:
            print("FAIL: %s/README.md has %d non-empty lines (want 1)" % (d, len(lines))); rc = 1
        else:
            print("ok: %s" % d)
    print("PASS" if rc == 0 else "FAIL")
    return rc


def main(argv):
    if len(argv) < 2 or argv[1] not in ("record", "check", "readmes"):
        print(__doc__); return 2
    cmd, args = argv[1], argv[2:]
    if cmd == "readmes":
        return readmes(args)
    root = getroot(args)
    if len(args) != 1:
        print(__doc__); return 2
    if cmd == "record":
        rec = record(root)
        with open(args[0], "w") as f:
            json.dump(rec, f, indent=1, sort_keys=True)
        print("recorded: %d public files, %d url lists, %d include files, %d py files" % (
            len(rec["build_public"]), len(rec["local_urls"]), len(rec["include_files"]), len(rec["py_imports"])))
        return 0
    fails = compare(json.load(open(args[0])), record(root), load_map(root))
    for f in fails:
        print("FAIL: " + f)
    print("PASS" if not fails else "FAIL (%d)" % len(fails))
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
