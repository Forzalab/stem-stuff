"""tools/repo_checks/move_inventory.py smoke: in a tiny fake repo, a rename with no map entry fails `check`, with the entry it passes."""
import json
import os
import subprocess
import sys
import tempfile
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOOL = os.path.join(ROOT, "tools", "repo_checks", "move_inventory.py")
BUILD = '''import os, shutil, sys
r = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.makedirs(sys.argv[1])
for f in ("index.html", "lib/util.js"):
    os.makedirs(os.path.dirname(os.path.join(sys.argv[1], f)), exist_ok=True)
    shutil.copy(os.path.join(r, f), os.path.join(sys.argv[1], f))
'''
FILES = {
    "tools/build_and_ship/build_public.py": BUILD,
    "index.html": '<script src="lib/util.js"></script><a href="#x">x</a><a href="https://e.com/a.js">e</a>',
    "lib/util.js": "export const a = 1;\n",
    "sw.js": 'const BASE = ["./", "index.html", "lib/util.js"];\n',
    "vercel.json": json.dumps({"functions": {"api/index.py": {"includeFiles": "{svc.py,data/**}"}}}),
    "svc.py": "import helper\n",
    "helper.py": "X = 1\n",
    "data/d.json": "{}",
}


def run(*args):
    return subprocess.run([sys.executable, TOOL, *args], capture_output=True, text=True)


def write(repo, rel, text):
    os.makedirs(os.path.dirname(os.path.join(repo, rel)), exist_ok=True)
    with open(os.path.join(repo, rel), "w") as f:
        f.write(text)


class MoveInventorySmoke(unittest.TestCase):
    def test_unmapped_rename_fails_mapped_passes(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = os.path.join(tmp, "repo")
            for rel, text in FILES.items():
                write(repo, rel, text)
            before = os.path.join(tmp, "before.json")
            self.assertEqual(run("record", before, "--root", repo).returncode, 0)
            self.assertEqual(run("check", before, "--root", repo).returncode, 0)
            os.rename(os.path.join(repo, "helper.py"), os.path.join(repo, "svc_helper.py"))
            write(repo, "svc.py", "import svc_helper\n")
            bad = run("check", before, "--root", repo)
            self.assertEqual(bad.returncode, 1, bad.stdout)
            self.assertIn("helper.py", bad.stdout)
            entry = {"old": "helper.py", "new": "svc_helper.py", "pr": "T1", "ship": "yes", "bridge": ""}
            write(repo, "shared/temporary_rename_map/rename-map.json", json.dumps({"active": True, "entries": [entry]}))
            good = run("check", before, "--root", repo)
            self.assertEqual(good.returncode, 0, good.stdout)


if __name__ == "__main__":
    unittest.main()
