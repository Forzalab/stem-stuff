"""tools/repo_checks/client_paths.py smoke: one dangling JS import and one dangling CSS url are reported (exit 1); the good,
remote, and bare-module refs stay quiet.
Run: python3 -m unittest tests.test_client_paths -v"""
import os
import subprocess
import sys
import tempfile
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRIPT = os.path.join(ROOT, "tools", "repo_checks", "client_paths.py")
FILES = {
    "lib/good.js": "export const a = 1;\n",
    "app.js": 'import { a } from "./lib/good.js";\nimport "./lib/missing.js";\nimport "katex";\nimport("https://cdn.example.com/x.js");\n',
    "index.html": '<script src="./app.js"></script>\n<script src="app.js"></script>\n<a href="https://example.com">x</a>\n',
    "style.css": "body { background: url(img/nope.png); }\n",
}


class ClientPaths(unittest.TestCase):
    def test_reports_only_the_two_dangling_refs(self):
        root = tempfile.mkdtemp(prefix="client-paths-")
        for rel, text in FILES.items():
            os.makedirs(os.path.dirname(os.path.join(root, rel)), exist_ok=True)
            with open(os.path.join(root, rel), "w") as f:
                f.write(text)
        r = subprocess.run([sys.executable, SCRIPT, "--root", root, "check", *FILES],
                           capture_output=True, text=True)
        self.assertEqual(r.returncode, 1, r.stderr)
        self.assertEqual(r.stdout.splitlines(), [
            "app.js:2: ./lib/missing.js -> lib/missing.js",
            "style.css:1: img/nope.png -> img/nope.png",
        ])

    def _run(self, files, *args):
        root = tempfile.mkdtemp(prefix="client-paths-")
        for rel, text in files.items():
            os.makedirs(os.path.dirname(os.path.join(root, rel)), exist_ok=True)
            with open(os.path.join(root, rel), "w") as f:
                f.write(text)
        return subprocess.run([sys.executable, SCRIPT, "--root", root, "check", *args],
                              capture_output=True, text=True)

    def test_unknown_extension_is_skipped_with_a_note(self):
        r = self._run({"tool.py": "import os\n"}, "tool.py")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(r.stdout.strip(), "0 dangling")
        self.assertIn("skip: tool.py (no path patterns for .py)", r.stderr)

    def test_bare_package_specifiers_are_ignored(self):
        r = self._run({"app.mjs": 'import { x } from "ajv/dist/2020.js";\nimport "node:assert/strict";\n'
                                  'import y from "@scope/pkg/sub.js";\n'}, "app.mjs")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(r.stdout.strip(), "0 dangling")

    def test_pw_spec_dynamic_import_resolves_from_repo_root(self):
        r = self._run({
            "client/pure_logic_modules/mode.mjs": "export const m = 1;\n",
            "tests/helper.mjs": "export const h = 1;\n",
            "tests/mode-reset.pw.mjs": 'import "./helper.mjs";\n'
                                       'await page.evaluate(async () => {\n'
                                       '  const m = await import("./client/pure_logic_modules/mode.mjs");\n});\n',
        }, "tests/mode-reset.pw.mjs")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(r.stdout.strip(), "0 dangling")


if __name__ == "__main__":
    unittest.main()
