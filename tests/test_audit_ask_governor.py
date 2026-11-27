"""Audit A7 (client-chosen identity, F7 of the desync report): every per-browser cap (hourly asks, follow-ups, free starter) is keyed on the
sid, and a client may send any 32-hex Cookie sid or none: each invented id is a fresh quota (4 ids x 40 asks = 160 paid calls for one client).
Signing the cookie would not close it (a client with no cookie is issued a new id anyway), so the cap that cannot be dodged is one over
every browser together: STEM_ASK_GLOBAL_PER_HOUR (default 0 = off: the number is the owner's call, see the report), counted in KV.

Run: python3 -m unittest tests.test_audit_ask_governor -v"""
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
from test_kv_frugal import KV_URL, FakeKV  # noqa: E402


class AskGovernor(unittest.TestCase):
    def setUp(self):
        self.kv = FakeKV()
        self.ps = [mock.patch.dict(os.environ, {"VERCEL_ENV": "", "STEM_ASK_GLOBAL_PER_HOUR": "50"}), mock.patch.object(serve, "KV", (KV_URL, "t")),
                   mock.patch.object(serve.urllib.request, "urlopen", self.kv.urlopen)]
        for p in self.ps:
            p.start()
        serve._asked.clear()

    def tearDown(self):
        for p in reversed(self.ps):
            p.stop()
        serve._asked.clear()
        if hasattr(serve, "_asked_all"):
            serve._asked_all.clear()

    def test_invented_ids_share_one_ceiling(self):
        got = [sum(serve.explain_allowed(f"{i:032x}", False, now=7200.0) for _ in range(40)) for i in range(4)]
        self.assertLessEqual(sum(got), 50, f"four invented ids = four quotas: {got}")
        self.assertEqual(got[0], 40, "a normal browser under the ceiling is untouched")

    def test_off_by_default(self):
        with mock.patch.dict(os.environ, {"STEM_ASK_GLOBAL_PER_HOUR": ""}):
            got = [sum(serve.explain_allowed(f"{i:032x}", False, now=7200.0) for _ in range(40)) for i in range(4)]
        self.assertEqual(sum(got), 160)

    def test_the_next_hour_starts_clean(self):
        for i in range(2):
            [serve.explain_allowed(f"{i:032x}", False, now=7200.0) for _ in range(40)]
        self.assertTrue(serve.explain_allowed("e" * 32, False, now=7200.0 + 3600))


if __name__ == "__main__":
    unittest.main()
