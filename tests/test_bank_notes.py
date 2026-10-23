"""tools/bank_notes.py: the bank-time NOTE per wrong mc pick with a slip (prompt audit B2, design/CLUCK-NOTE.md "Cache")."""
import io
import json
import os
import sys
import tempfile
import unittest
from unittest import mock

# serve fixes serve.TRIES at import (bank_notes imports serve): a temp file, never the repo's tries.json; v:1 fixture banks pre-sunset
os.environ.setdefault("STEM_TRIES", os.path.join(tempfile.mkdtemp(prefix="stem-tries-"), "tries.json"))
os.environ.setdefault("STEM_TODAY", "2026-10-23")
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "tools"))
import bank_notes  # noqa: E402
import serve  # noqa: E402

NOTE = {"on_topic": True, "field": "mechanics", "concept": "momentum", "asked": "a", "need": "both carts move after", "assumed": "divided by one mass",
        "real": "the total mass moves", "reproduces": True, "gap": "missing_piece", "evidence": "pick a", "confidence": "high"}
CH = [{"id": i, "md": m} for i, m in (("a", "6"), ("b", "3"), ("c", "2"))]


def bank():
    return {"v": 1, "problems": [
        {"code": "PHYS_BN1", "type": "mc", "body": [{"type": "text", "md": "Two carts stick."}], "choices": CH, "correct": "b",
         "saccharine": {"key": "p = (m1+m2) v, v = 3", "slip": {"a": "Divided by the first cart's mass only."}}},    # c: no slip, stays live
        {"code": "PHYS_BN2", "type": "mc", "body": [{"type": "text", "md": "Rows."}], "choices": CH, "correct": ["a", "b"],
         "saccharine": {"key": "Tick: a, b", "slip": {"c": "x"},
                        "split": [{"sub": "PHYS_BN2A", "stem": "Momentum is kept.", "answer": "true", "slip": "Thought the bump loses it."},
                                  {"sub": "PHYS_BN2B", "stem": "v after?", "choices": CH, "answer": "b", "slip": {"c": "Took 6 / 3."}}]}}]}


def fake_or(calls):
    def post(payload, key, timeout):
        calls.append(payload)
        return io.BytesIO(json.dumps({"choices": [{"message": {"content": json.dumps(NOTE)}}]}).encode())
    return post


class BankNotes(unittest.TestCase):
    def test_picks_are_the_wrong_ones_with_a_slip(self):
        got = [(c, i) for c, _, i, _, _ in bank_notes.picks(bank())]
        self.assertEqual(got, [("PHYS_BN1", "a"), ("PHYS_BN2A", "f"), ("PHYS_BN2B", "c")])   # not c (no slip), not the pick-all parent

    def test_write_then_the_wish_skips_the_live_call(self):
        b, calls = bank(), []
        with mock.patch.object(serve, "_or_post", fake_or(calls)):
            done, bad = bank_notes.fill(b, "k")
        self.assertEqual((done, bad), (["PHYS_BN1:a", "PHYS_BN2A:f", "PHYS_BN2B:c"], []))
        self.assertEqual(len(calls), 3)
        self.assertIn("SLIP: Divided by the first cart's mass only.", calls[0]["messages"][1]["content"])   # the live prompt, slip in view
        self.assertEqual(calls[0]["response_format"]["json_schema"]["schema"], serve.NOTE_SCHEMA)
        p, row_tf, row_mc = b["problems"][0], *b["problems"][1]["saccharine"]["split"]
        self.assertNotIn("on_topic", p["saccharine"]["note"]["a"])                       # cached_note sets it
        self.assertEqual(set(p["saccharine"]["note"]), {"a"})
        self.assertEqual(row_tf["note"]["gap"], "missing_piece")                         # a True/False row: row.note
        self.assertEqual(set(row_mc["note"]), {"c"})                                     # a row with choices: row.note[id]
        calls.clear()
        with mock.patch.object(serve, "_or_post", fake_or(calls)):
            self.assertEqual(serve.note(p, "a", None, "k")["concept"], "momentum")       # the wish: cached, 0 calls
            self.assertEqual(serve.note(serve.sub_problem(b["problems"][1], row_tf), "f", None, "k")["on_topic"], True)
            self.assertEqual(bank_notes.fill(b, "k"), ([], []))                          # a whole note is kept: no call again
            serve.note(p, "c", None, "k")                                               # no slip: still the live read
        self.assertEqual(len(calls), 1)

    def test_a_bad_answer_writes_nothing(self):
        b = bank()
        for out in (None, {"on_topic": False}, dict(NOTE, gap="made_up")):
            with mock.patch.object(serve, "note", lambda *a, **k: out):
                self.assertEqual(bank_notes.fill(b, "k")[0], [])
        self.assertNotIn("note", b["problems"][0]["saccharine"])

    def test_cli_report_and_write(self):
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "BANK_BN.json")
            with open(path, "w") as f:
                json.dump(bank(), f)
            with mock.patch("sys.stdout", new=io.StringIO()) as o:
                self.assertEqual(bank_notes.main([path]), 0)
            self.assertIn("3 picks with a slip, 0 with a note; MISSING PHYS_BN1:a PHYS_BN2A:f PHYS_BN2B:c", o.getvalue())
            with mock.patch.dict(os.environ, {"OPENROUTER_API_KEY": ""}), mock.patch("sys.stderr", new=io.StringIO()):
                self.assertEqual(bank_notes.main(["--write", path]), 2)                 # no key: no call, no write
            with mock.patch.dict(os.environ, {"OPENROUTER_API_KEY": "k"}), mock.patch.object(serve, "_or_post", fake_or([])), \
                    mock.patch("sys.stdout", new=io.StringIO()) as o:
                self.assertEqual(bank_notes.main(["--write", path]), 0)
            self.assertIn("3 picks with a slip, 3 with a note", o.getvalue())
            with open(path) as f:
                self.assertTrue(bank_notes.whole(json.load(f)["problems"][0]["saccharine"]["note"]["a"]))


if __name__ == "__main__":
    unittest.main()
