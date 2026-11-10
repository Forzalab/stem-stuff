"""bundle.py one-instance-per-module gate (152a PR0; brain w152 critique hole 9).

The offline bundle (tools/build_and_ship/bundle.py -> stem-stuff.html) inlines every <script type="module" src>.
Today a module can be emitted twice: once as an inline <script type="module"> body (tools/build_and_ship/bundle.py:103
`'<script type="module">%s</script>' % script_text(module_text(src))`) and again, when a later module
imports it, base64'd into that later module's import (tools/build_and_ship/bundle.py:74
`uri = "data:text/javascript;base64," + base64.b64encode(module_text(dep, ...))`). After 152a splits app.js
into app.js + cluck.js + shell.js, cluck.js and shell.js both `import` app.js, so app.js would be emitted as an
inline entry AND as a data: URL import: two module instances (2x listeners / bridges), the offline page breaks.
PR0 fixes bundle.py to emit each module exactly once (one data: URL string = one module instance, reused by every
importer). This test asserts the invariant: a module's body is emitted exactly once (inline bodies + distinct
data: URL payloads), decoded.

Run: python3 -m unittest tests.test_bundle   (also covered by `python3 -m unittest discover -s tests -p 'test_*.py'`).
"""
import base64
import os
import re
import sys
import tempfile
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # tests/ (for paths)
import paths
sys.path.insert(0, paths.SERVER_DIR)
sys.path.insert(0, paths.tool("build_and_ship"))
import bundle  # noqa: E402

APP_MARK = "APP_BODY_ONCE_7f3a"     # unique line we write into the synthetic app.js (below)
CLUCK_MARK = "CLUCK_BODY_ONCE_9c2e"  # unique line we write into the synthetic cluck.js (below)


def emissions(html, mark):
    """How many times a module's marker is emitted: literal hits in inline <script type=module> bodies
    (the entry copies, tools/build_and_ship/bundle.py:103) plus hits in DISTINCT data: URL payloads (the import copies,
    tools/build_and_ship/bundle.py:74). Two references to the same data: URL are one instance, so payloads are a set."""
    inline = sum(m.group(1).count(mark) for m in re.finditer(r'<script type="module">([\s\S]*?)</script>', html))
    payloads = set()
    for m in re.finditer(r'data:text/javascript;base64,([A-Za-z0-9+/=]+)', html):
        payloads.add(base64.b64decode(m.group(1)).decode())
    return inline + sum(p.count(mark) for p in payloads)


class BundleOneInstance(unittest.TestCase):
    def setUp(self):
        bundle._cache.clear()  # get() caches bytes by URL (tools/build_and_ship/bundle.py:18); clear so each test is fresh

    def _build(self):
        """Build a synthetic bundle in a temp dir: app.js is an entry module that cluck.js also imports."""
        tmp = tempfile.mkdtemp(prefix="stem-bundle-")
        with open(os.path.join(tmp, "index.html"), "w", encoding="utf-8") as f:
            f.write('<!DOCTYPE html><html><head><title>x</title></head><body>\n'
                    '<script type="module" src="app.js"></script>\n'
                    '<script type="module" src="cluck.js"></script>\n'
                    '</body></html>\n')
        with open(os.path.join(tmp, "app.js"), "w", encoding="utf-8") as f:
            f.write(f"export const bridge = {{}};   // {APP_MARK}\n")
        with open(os.path.join(tmp, "cluck.js"), "w", encoding="utf-8") as f:
            f.write(f'import {{ bridge }} from "./app.js";   // {CLUCK_MARK}\n')
        orig = bundle.ROOT
        bundle.ROOT = tmp
        try:
            out = bundle.build(os.path.join(tmp, "b.html"))
        finally:
            bundle.ROOT = orig
        return out

    def test_intent_bundle_is_self_contained(self):
        # INTENT: the whole point of module_text is one file that opens from file:// (tools/build_and_ship/bundle.py:63
        # "file:// can't load module files"): after build no <script ... src= may remain.
        out = self._build()
        html = open(out, encoding="utf-8").read()
        self.assertIsNone(re.search(r'<script[^>]+src=', html), "a src= script survived inlining")

    def test_each_module_body_appears_exactly_once(self):
        # INVARIANT (152a critique hole 9): one instance per module. app.js is both an entry (inlined body,
        # tools/build_and_ship/bundle.py:103) and an import target of cluck.js (data: URL, tools/build_and_ship/bundle.py:74), so today it is
        # emitted twice (RED); after the fix each of app.js and cluck.js is emitted once (GREEN).
        out = self._build()
        html = open(out, encoding="utf-8").read()
        self.assertEqual(emissions(html, APP_MARK), 1, "app.js emitted more than once (entry + import copies)")
        self.assertEqual(emissions(html, CLUCK_MARK), 1, "cluck.js emitted more than once")


if __name__ == "__main__":
    unittest.main()
