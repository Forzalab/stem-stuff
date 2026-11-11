"""BRIDGE (temporary, todo 167): serve.py bridge() smoke tests on a fake rename map. Run: python3 -m unittest tests.test_bridge -v"""
import json
import os
import sys
import tempfile
import unittest
import unittest.mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # tests/ (for paths)
import paths  # noqa: E402
sys.path.insert(0, paths.SERVER_DIR)
sys.argv = [sys.argv[0]]
os.environ.setdefault("STEM_TRIES", os.path.join(tempfile.mkdtemp(prefix="stem-tries-"), "tries.json"))
from http_server import serve  # noqa: E402

FAKE = {
    "active": True,
    "entries": [
        {"old": "old/a.js", "new": "client/old/a.js", "pr": "B", "ship": "yes", "bridge": True},
        {"old": "old/a.css", "new": "client/old/a.css", "pr": "B", "ship": "yes", "bridge": True},
        {"old": "old/off.js", "new": "client/old/off.js", "pr": "B", "ship": "yes", "bridge": False},
        {"old": "blind/", "new": "client/shell/blind/", "pr": "B", "ship": "yes", "bridge": True},
        {"old": "CODEMAP.md", "new": "docs/CODEMAP.md", "pr": "B", "ship": "yes", "bridge": True},  # on disk: never bridged
    ],
}


def lookup(path, doc):
    """bridge(path) with the map written to a temp file and the module cache reset."""
    with tempfile.TemporaryDirectory() as d:
        mp = os.path.join(d, "rename-map.json")
        with open(mp, "w", encoding="utf-8") as f:
            json.dump(doc, f)
        with unittest.mock.patch.object(serve, "RENAME_MAP", mp), unittest.mock.patch.object(serve, "_bridge_rules", None):
            return serve.bridge(path)


class Bridge(unittest.TestCase):
    def test_active_old_js_is_stub(self):
        self.assertEqual(lookup("/old/a.js", FAKE), ("stub", None))

    def test_active_old_css_redirects_307_target(self):
        self.assertEqual(lookup("/old/a.css", FAKE), ("redirect", "/client/old/a.css"))

    def test_inactive_map_is_none(self):
        self.assertIsNone(lookup("/old/a.css", {**FAKE, "active": False}))

    def test_bridge_false_entry_is_none(self):
        self.assertIsNone(lookup("/old/off.js", FAKE))

    def test_dir_entry_js_stub_and_css_redirect(self):
        self.assertEqual(lookup("/blind/x.mjs", FAKE), ("stub", None))
        self.assertEqual(lookup("/blind/a.css", FAKE), ("redirect", "/client/shell/blind/a.css"))

    def test_file_on_disk_is_never_bridged(self):
        self.assertIsNone(lookup("/CODEMAP.md", FAKE))


if __name__ == "__main__":
    unittest.main()
