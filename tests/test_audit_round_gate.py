"""Audit A3 (flip point, client-trusted namespace): POST /check {round: N} grades in the namespace sid:rN ("Redo my misses"). N is any
number the body carries and the server never asked whether the browser had shut the item first, so a student with tries left, or locked
out, bumped N and got fresh tries every time: unlimited guesses on any item, the right answer found with no lockout (the base record,
which /state, the marks and Cluck read, never moved).
The server now opens a round only on a unit this browser already shut (solved, or out of tries); otherwise the round number is ignored
and the try counts against the real record.

Run: python3 -m unittest tests.test_audit_round_gate -v"""
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

CODE = "KVF_Q01"                                  # a num item, answer 2, two tries


class RoundGate(unittest.TestCase):
    HASH = "1"

    def setUp(self):
        self.kv = FakeKV()
        banks = tempfile.mkdtemp(prefix="stem-round-")
        with open(os.path.join(banks, "BANK_KVR.json"), "w") as f:
            json.dump({"v": serve.CUTOFF, "problems": [problem(1)]}, f)
        env = {"STEM_FRONT": "", "VERCEL_ENV": "", "STEM_TRIES_HASH": self.HASH}
        self.ps = [mock.patch.dict(os.environ, env), mock.patch.object(serve, "BANKS", banks), mock.patch.object(serve, "KV", (KV_URL, "t")),
                   mock.patch.object(serve.urllib.request, "urlopen", self.kv.urlopen)]
        for p in self.ps:
            p.start()
        self.cookie = "sid=" + fake_sid("round" + self.HASH)

    def tearDown(self):
        for p in reversed(self.ps):
            p.stop()
        serve._gen["loaded"] = None

    def check(self, answer, **more):
        st, _, data = serve.dispatch("POST", "/check", self.cookie, json.dumps({"code": CODE, "answer": answer, **more}).encode())
        self.assertEqual(st, 200)
        return json.loads(data)["verdict"]

    def state(self):
        st, _, data = serve.dispatch("GET", "/state/" + CODE, self.cookie)
        return json.loads(data)

    def test_bumping_the_round_is_no_fresh_tries(self):
        got = [self.check("5", round=1), self.check("6", round=1), self.check("7", round=2), self.check("2", round=3)]
        self.assertEqual(got, ["wrong", "wrong", "wrong", "locked"], "a client-chosen round number gave fresh tries on an open item")
        self.assertEqual(self.state()["wrong"], 2, "the real record counted the tries")

    def test_a_new_round_number_does_not_skip_the_open_rounds_tries(self):
        self.assertEqual([self.check("5"), self.check("6")], ["wrong", "wrong"])      # base shut
        self.assertEqual(self.check("7", round=1), "wrong")                           # redo round 1: one try left
        self.assertEqual(self.check("2", round=2), "locked", "round 2 skipped round 1's second try")
        self.assertEqual(self.check("8", round=1), "wrong")                           # round 1 goes on, now shut
        self.assertEqual(self.check("2", round=2), "correct")                         # a second redo opens once the first is shut

    def test_a_round_on_a_locked_item_is_the_redo(self):
        self.assertEqual([self.check("5"), self.check("6")], ["wrong", "wrong"])      # out of tries: shut
        self.assertEqual(self.check("2"), "locked")
        self.assertEqual(self.check("2", round=1), "correct")                         # "Redo my misses": its own tries
        self.assertEqual(self.state()["wrong"], 2)                                    # the first round's record is untouched

    def test_a_round_on_a_solved_item_still_opens(self):
        self.assertEqual(self.check("2"), "correct")
        self.assertEqual(self.check("5", round=1), "wrong")


class RoundGateBlob(RoundGate):
    """the same, flag off (the tries blob)"""
    HASH = ""


if __name__ == "__main__":
    unittest.main()
