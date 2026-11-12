#!/usr/bin/env python3
"""Static path checker for client files (.html .js .mjs .css): every static reference must exist on disk.

Checked: JS/MJS import/export-from/import("X") with a string literal, HTML src=/href=, CSS url() and @import.
Skipped: remote, data:, blob:, mailto:, #, javascript:, empty, template (${ {{), JS package specifiers (anything in
a JS file not starting with ./ ../ or /, e.g. "katex", "node:assert/strict"), server routes (/api/ /p/ /state/ /repair/ /b/),
and files whose extension has no patterns (noted on stderr).
tests/*.pw.mjs dynamic import("...") resolves from the repo root (it runs in the page), not from the spec's folder.
  client_paths.py [--root DIR] check [FILES...]
No FILES = every tracked client file outside archive/ docs/ tests/ tools/ server/ api/ node_modules/ public/ and vendor/.
Exit 0 and "0 dangling", or exit 1 and one "file:line: X -> resolved" line per dangling reference."""
import argparse
import fnmatch
import os
import re
import subprocess
import sys

EXCLUDED_TOP = {"archive", "docs", "tests", "tools", "server", "api", "node_modules", "public"}
SKIP_PREFIXES = ("http:", "https:", "//", "data:", "blob:", "mailto:", "#", "javascript:",
                 "/api/", "/p/", "/state/", "/repair/", "/b/")
JS = [r"""\b(?:from|import)\s*\(?\s*["']([^"'\n]+)["']"""]
JS_EXTS = (".js", ".mjs")
PW_SPECS = "tests/*.pw.mjs"
PATTERNS = {
    ".js": JS, ".mjs": JS,
    ".html": [r"""\b(?:src|href)\s*=\s*["']([^"'\n]+)["']"""],
    ".css": [r"url\(\s*[\"']?([^\"')\s]+)", r"""@import\s+["']([^"'\n]+)["']"""],
}
DEFAULT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def tracked(root):
    out = subprocess.run(["git", "ls-files"], cwd=root, capture_output=True, text=True, check=True).stdout
    keep = []
    for f in out.splitlines():
        parts = f.split("/")
        if os.path.splitext(f)[1] in PATTERNS and parts[0] not in EXCLUDED_TOP and "vendor" not in parts[:-1]:
            keep.append(f)
    return keep


def refs(path, ext):
    """Yield (line number, raw reference, dynamic) for each static reference in one file; dynamic = import("...")."""
    regexes = [re.compile(p) for p in PATTERNS[ext]]
    with open(path, encoding="utf-8", errors="replace") as f:
        for n, line in enumerate(f, 1):
            for rx in regexes:
                for m in rx.finditer(line):
                    dynamic = m.group(0).startswith("import") and "(" in m.group(0)
                    yield n, m.group(1), dynamic


def target(ref, ext):
    """The path part of a reference that names an on-disk file, or None when it is not one."""
    if not ref or ref.startswith(SKIP_PREFIXES) or "${" in ref or "{{" in ref:
        return None
    if ext in JS_EXTS and not ref.startswith(("./", "../", "/")):
        return None  # JS package specifier, e.g. "katex", "ajv/dist/2020.js", "node:assert/strict"
    path = re.split(r"[?#]", ref, maxsplit=1)[0]
    return path or None


def resolve(root, file_rel, path):
    """A leading / is the repo root; anything else is relative to the referring file's folder."""
    if path.startswith("/"):
        return os.path.normpath(os.path.join(root, path.lstrip("/")))
    return os.path.normpath(os.path.join(root, os.path.dirname(file_rel), path))


def check(root, files):
    dangling = []
    for f in files:
        ext = os.path.splitext(f)[1]
        if ext not in PATTERNS:
            print(f"skip: {f} (no path patterns for {ext or 'no extension'})", file=sys.stderr)
            continue
        pw_spec = ext in JS_EXTS and fnmatch.fnmatch(f, PW_SPECS)
        for n, ref, dynamic in refs(os.path.join(root, f), ext):
            path = target(ref, ext)
            if path is None:
                continue
            base = "" if (pw_spec and dynamic) else f  # page-run import() in a pw spec: resolve from the root
            full = resolve(root, base, path)
            if not os.path.exists(full):
                dangling.append(f"{f}:{n}: {ref} -> {os.path.relpath(full, root).replace(os.sep, '/')}")
    return dangling


def main(argv=None):
    ap = argparse.ArgumentParser(description="Find dangling static paths in client files.")
    ap.add_argument("--root", default=DEFAULT_ROOT, help="repo root (default: the repo this script sits in)")
    ap.add_argument("cmd", choices=["check"])
    ap.add_argument("files", nargs="*", help="files relative to --root (default: all tracked client files)")
    a = ap.parse_args(argv)
    files = a.files or tracked(a.root)
    dangling = check(a.root, files)
    print(f"{len(files)} files scanned", file=sys.stderr)
    if dangling:
        print("\n".join(dangling))
        return 1
    print("0 dangling")
    return 0


if __name__ == "__main__":
    sys.exit(main())
