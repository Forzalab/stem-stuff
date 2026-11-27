"""Audit A6 (preview vs production keys): the preview namespace (PREVIEW_PREFIX, 1-day life; Tony Nov 23) was built into the tries HASH
store only. With STEM_TRIES_HASH off (its default) a preview deploy read and wrote the PRODUCTION blob "stem:tries" (whole-blob GET/SET, no
expiry): an agent or bench run on a preview saw real students' tries and, by last-write-wins on the whole blob, could erase them.
The blob path now uses the same prefix and life.

Run: python3 -m unittest tests.test_audit_preview_blob -v"""
import json
import os
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # tests/ (for paths)
import paths
sys.path.insert(0, paths.SERVER_DIR)
sys.argv = [sys.argv[0]]  # serve.py reads argv at import
os.environ.setdefault("STEM_TRIES", os.path.join(tempfile.mkdtemp(prefix="stem-tries-"), "tries.json"))
from http_server import serve  # noqa: E402
from test_kv_frugal import KV_URL, FakeKV, fake_sid, problem  # noqa: E402

CODE = "KVF_Q01"


class PreviewBlob(unittest.TestCase):
    def setUp(self):
        self.kv = FakeKV()
        banks = tempfile.mkdtemp(prefix="stem-pb-")
        with open(os.path.join(banks, "BANK_KVP.json"), "w") as f:
            json.dump({"v": serve.CUTOFF, "problems": [problem(1)]}, f)
        self.sid = fake_sid("preview")
        self.ps = [mock.patch.dict(os.environ, {"STEM_FRONT": "", "STEM_TRIES_HASH": "", "VERCEL_ENV": "preview"}), mock.patch.object(serve, "BANKS", banks),
                   mock.patch.object(serve, "KV", (KV_URL, "t")), mock.patch.object(serve.urllib.request, "urlopen", self.kv.urlopen)]
        for p in self.ps:
            p.start()

    def tearDown(self):
        for p in reversed(self.ps):
            p.stop()
        serve._gen["loaded"] = None

    def check(self, answer):
        st, _, data = serve.dispatch("POST", "/check", "sid=" + self.sid, json.dumps({"code": CODE, "answer": answer}).encode())
        return json.loads(data)["verdict"]

    def test_a_preview_never_touches_the_production_blob(self):
        prod = json.dumps({"gen": 5, "tries": {f"{self.sid} {CODE}": {"wrong": [1.0, 3.0], "done": False, "gen": 5}}})
        self.kv.db[serve.KV_KEY] = prod                                  # the real student: locked out
        self.assertEqual(self.check("2"), "correct", "the preview read the production blob (locked) instead of its own")
        self.assertEqual(self.kv.db[serve.KV_KEY], prod, "a preview wrote the production blob")
        self.assertIn(serve.PREVIEW_PREFIX + serve.KV_KEY, self.kv.db)
        self.assertEqual(self.kv.expires.get(serve.PREVIEW_PREFIX + serve.KV_KEY), serve.PREVIEW_LIFETIME)

    def test_prod_keeps_the_plain_key_and_no_expiry(self):
        with mock.patch.dict(os.environ, {"VERCEL_ENV": "production"}):
            self.check("5")
        self.assertIn(serve.KV_KEY, self.kv.db)
        self.assertNotIn(serve.KV_KEY, self.kv.expires)


if __name__ == "__main__":
    unittest.main()
