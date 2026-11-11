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


if __name__ == "__main__":
    unittest.main()
