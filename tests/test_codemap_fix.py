"""codemap.py fix: follows git renames and deletes, stubs new code files, and map fails on TODO rows."""
import os
import subprocess
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
CODEMAP_PY = os.path.join(HERE, "..", "tools", "repo_checks", "codemap.py")

BASE_MD = """# CODEMAP

| path | owns | open when you touch |
|---|---|---|
| `old.js` | the old file. | old work |
| `gone.py` | a file that gets deleted. | never |
| `dir/` | the dir folder. | dir work |
"""

AFTER_MD = """# CODEMAP

| path | owns | open when you touch |
|---|---|---|
| `new.js` | the old file. | old work |
| `dir/` | the dir folder. | dir work |
| `aaa.mjs` | TODO | TODO |
| `added.js` | TODO | TODO |
"""


def run(cwd, *args):
    return subprocess.run(args, cwd=cwd, capture_output=True, text=True)


class CodemapFixTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.repo = self.tmp.name
        git = lambda *a: run(self.repo, "git", *a)
        git("init", "-q")
        git("config", "user.email", "t@example.com")
        git("config", "user.name", "t")
        git("config", "commit.gpgsign", "false")
        self._write("CODEMAP.md", BASE_MD)
        self._write("old.js", "const a = 1;\n")
        self._write("gone.py", "print('gone')\n")
        self._write("dir/x.js", "export const x = 2;\n")
        git("add", "-A")
        git("commit", "-qm", "base")
        self.base = git("rev-parse", "HEAD").stdout.strip()
        # change: rename old.js, delete gone.py, add two code files (stubs sort by path)
        git("mv", "old.js", "new.js")
        git("rm", "-q", "gone.py")
        self._write("added.js", "console.log('added');\n")
        self._write("aaa.mjs", "export default 3;\n")
        git("add", "-A")
        git("commit", "-qm", "change")

    def tearDown(self):
        self.tmp.cleanup()

    def _write(self, rel, text):
        p = os.path.join(self.repo, rel)
        os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p, "w", encoding="utf-8") as f:
            f.write(text)

    def test_fix_renames_drops_and_stubs(self):
        r = run(self.repo, sys.executable, CODEMAP_PY, "fix", "--base", self.base)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertEqual(
            r.stdout.splitlines(),
            [
                "rename: old.js -> new.js",
                "drop: gone.py",
                "stub: aaa.mjs",
                "stub: added.js",
            ],
        )
        with open(os.path.join(self.repo, "CODEMAP.md"), encoding="utf-8") as f:
            self.assertEqual(f.read(), AFTER_MD)

    def test_map_fails_on_todo_rows(self):
        run(self.repo, sys.executable, CODEMAP_PY, "fix", "--base", self.base)
        r = run(self.repo, sys.executable, CODEMAP_PY, "map")
        self.assertEqual(r.returncode, 1, r.stdout + r.stderr)
        self.assertIn("FAIL: TODO row: aaa.mjs", r.stdout)
        self.assertIn("FAIL: TODO row: added.js", r.stdout)


if __name__ == "__main__":
    unittest.main()
