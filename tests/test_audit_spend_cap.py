"""Audit A5 (fail-open, money): claude_spent() fell back to this process's own counter when the Upstash read failed. That counter is 0 on a
cold instance and only holds what this instance spent, so one failed GET reopened the whole CLAUDE_BUDGET_USD cap: an over-budget cycle
read as $0 and Claude calls went on. The fallback is now the last total this process read (never less than its own counter).
(A cold instance whose very first read fails still has no total to fall back on: UNPROVEN-open, listed in the report.)

Run: python3 -m unittest tests.test_audit_spend_cap -v"""
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


class SpendCap(unittest.TestCase):
    def setUp(self):
        env = {"CLAUDE_API": "sk-ant-test", "CLAUDE_BUDGET_USD": "100", "CLAUDE_RESERVE_USD": "5"}
        self.ps = [mock.patch.dict(os.environ, env), mock.patch.object(serve, "KV", ("https://kv.test", "t")), mock.patch.dict(serve._claude_spent, clear=True)]
        for p in self.ps:
            p.start()
        serve._last_err.clear()
        if hasattr(serve, "_spent_seen"):
            serve._spent_seen.clear()

    def tearDown(self):
        for p in reversed(self.ps):
            p.stop()

    def test_a_failed_read_does_not_reopen_an_exhausted_cap(self):
        with mock.patch.object(serve, "_kv", return_value="99.5"):
            self.assertFalse(serve.claude_ok(), "the cap is not reached at $99.5 of $95")
        with mock.patch.object(serve, "_kv", side_effect=OSError("down")):
            self.assertFalse(serve.claude_ok(), "one failed Upstash read read the spend as $0 and reopened the cap")

    def test_a_working_read_still_follows_the_store(self):
        with mock.patch.object(serve, "_kv", return_value="10"):
            self.assertTrue(serve.claude_ok())
        with mock.patch.object(serve, "_kv", return_value="99.5"):
            self.assertFalse(serve.claude_ok())
        with mock.patch.object(serve, "_kv", return_value="10"):         # a new cycle / a reset total
            self.assertTrue(serve.claude_ok())


if __name__ == "__main__":
    unittest.main()
