"""J6 seen lines: the real short-copy gate. aiw.py (p41b, PR #189) lint_view_strings has min_words=1; the vendored JS aiw
(tests/vendor/aiw) declines to score < 10 words, so tests/seen.test.mjs cannot be the gate for these ≤ 8-word lines.
aiw.py is not on every branch: absent -> the test skips with the reason (the orchestrator runs the p41b copy before a push).
Run: python3 -m unittest discover -s tests -p 'test_*.py'"""
import json
import os
import shutil
import subprocess
import sys
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
JS = "const w={};w.window=w;require('vm').runInNewContext(require('fs').readFileSync(process.argv[1],'utf8'),w);console.log(JSON.stringify(w.__stemSeenLines))"


def lines():
    out = subprocess.run(["node", "-e", JS, os.path.join(ROOT, "copy", "seen-lines.js")], check=True, capture_output=True, text=True).stdout
    d = json.loads(out)
    return [x for xs in list(d["fam"].values()) + [d["any"]] for x in xs]


def titles():
    d = json.load(open(os.path.join(ROOT, "problems.json"), encoding="utf-8"))
    return sorted({p["title"] for p in d if isinstance(p, dict) and isinstance(p.get("title"), str)}, key=len)[:6] + ["Limit from a table"]


class SeenLinesAiw(unittest.TestCase):
    @unittest.skipUnless(shutil.which("node"), "node not on PATH")
    def test_no_filled_line_is_blocked(self):
        if not os.path.exists(os.path.join(ROOT, "aiw.py")):
            self.skipTest("aiw.py is absent on this branch (it lands with PR #189 / p41b); run it by hand: git show origin/ccr-eaf1a3c3-xs301g-p41b:aiw.py")
        sys.path.insert(0, ROOT)
        try:
            from aiw import lint_view_strings
        finally:
            sys.path.remove(ROOT)
        filled = []
        for l in lines():
            filled += [l["text"].replace("{title}", t) for t in titles()] if "{title}" in l["text"] else [l["text"]]
        self.assertGreater(len(filled), 50)
        bad = [(r["text"], [i["type"] for i in r["block"]]) for r in lint_view_strings(filled) if r["block"]]
        self.assertEqual(bad, [], "aiw blocked these seen lines")


if __name__ == "__main__":
    unittest.main()
