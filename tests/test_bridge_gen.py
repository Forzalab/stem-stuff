"""BRIDGE (temporary, todo 167): tools/build_and_ship/bridge_gen.py smoke tests on a fake map and fake vercel.json.
Run: python3 -m unittest tests.test_bridge_gen -v"""
import io
import json
import os
import re
import shutil
import sys
import tempfile
import unittest
import contextlib

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # tests/ (for paths)
import paths  # noqa: E402
sys.path.insert(0, paths.tool("build_and_ship"))
import bridge_gen  # noqa: E402

FAKE_MAP = {
    "active": True,
    "entries": [
        {"old": "old/a.js", "new": "client/old/a.js", "pr": "B", "ship": "yes", "bridge": True},
        {"old": "old/a.css", "new": "client/old/a.css", "pr": "B", "ship": "yes", "bridge": True},
        {"old": "old/off.css", "new": "client/old/off.css", "pr": "B", "ship": "yes", "bridge": False},
        {"old": "blind/", "new": "client/shell/blind/", "pr": "B", "ship": "yes", "bridge": True},
    ],
}
BASE = {"rewrites": [{"source": "/chat", "destination": "/api/index?path=/chat"}], "headers": []}


def tree(vercel, rename_map):
    """A fake repo root: vercel.json + shared/temporary_rename_map/rename-map.json."""
    root = tempfile.mkdtemp(prefix="bridge-gen-")
    os.makedirs(os.path.join(root, "shared", "temporary_rename_map"))
    with open(os.path.join(root, "shared", "temporary_rename_map", "rename-map.json"), "w", encoding="utf-8") as f:
        json.dump(rename_map, f)
    with open(os.path.join(root, "vercel.json"), "w", encoding="utf-8") as f:
        f.write(json.dumps(vercel, indent=2, ensure_ascii=False) + "\n")
    return root


def run(root, *args):
    with contextlib.redirect_stdout(io.StringIO()) as out:
        code = bridge_gen.main(list(args), root=root)
    return code, out.getvalue()


class Generate(unittest.TestCase):
    def test_inactive_map_generates_nothing(self):
        self.assertEqual(bridge_gen.generate({**FAKE_MAP, "active": False}), ([], []))

    def test_active_generates_stub_rewrites_and_307_redirects(self):
        rw, rd = bridge_gen.generate(FAKE_MAP)
        self.assertEqual(rw, [
            {"source": "/old/a.js", "destination": "/client/shell/stale_reload.js"},
            {"source": "/blind/:f(.*\\.m?js)", "destination": "/client/shell/stale_reload.js"},
        ])
        self.assertEqual(rd, [
            {"source": "/old/a.css", "destination": "/client/old/a.css", "permanent": False},
            {"source": "/blind/:f((?!.*\\.m?js$).*)", "destination": "/client/shell/blind/:f", "permanent": False},
        ])

    def test_dir_redirect_body_matches_css_not_js(self):
        _, rd = bridge_gen.generate(FAKE_MAP)
        body = rd[1]["source"][len("/blind/:f("):-1]
        self.assertIsNotNone(re.fullmatch(body, "a.css"))
        self.assertIsNone(re.fullmatch(body, "a.mjs"))


class Main(unittest.TestCase):
    def test_inactive_leaves_vercel_unchanged(self):
        root = tree(BASE, {**FAKE_MAP, "active": False})
        self.assertEqual(run(root, "--check")[0], 0)
        self.assertEqual(run(root)[0], 0)
        with open(os.path.join(root, "vercel.json"), encoding="utf-8") as f:
            self.assertEqual(json.load(f), BASE)

    def test_active_check_is_stale_then_write_then_clean(self):
        root = tree(BASE, FAKE_MAP)
        code, out = run(root, "--check")
        self.assertEqual(code, 1)
        self.assertIn("stale", out)
        self.assertEqual(run(root)[0], 0)
        self.assertEqual(run(root, "--check")[0], 0)
        with open(os.path.join(root, "vercel.json"), encoding="utf-8") as f:
            data = json.load(f)
        self.assertEqual(data["rewrites"][0], BASE["rewrites"][0])  # existing rewrite kept first
        self.assertEqual(len(data["rewrites"]), 3)                   # + two stub rewrites
        self.assertEqual(len(data["redirects"]), 2)
        self.assertEqual(data["headers"], [])                        # other keys untouched
        shutil.rmtree(root)

    def test_real_repo_check_is_clean(self):
        self.assertEqual(run(bridge_gen.ROOT, "--check")[0], 0)


if __name__ == "__main__":
    unittest.main()
