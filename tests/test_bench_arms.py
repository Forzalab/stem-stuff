"""tools/bench_arms.py: parsers, the answer-leak check, fixture sanity, the dry run end to end (no network, no key)."""
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "tools"))
os.environ.setdefault("STEM_TRIES", os.path.join(tempfile.mkdtemp(prefix="stem-tries-"), "tries.json"))
import bench_arms as b  # noqa: E402

ROWS = {r["id"]: r for r in b.load()}


class Parse(unittest.TestCase):
    def test_minilabel_and_all(self):
        p = b.parse("minilabel", "LABEL: missing_piece|high\nMINI: Where did the second cart go? QUACK.")
        self.assertTrue(p["ok"])
        self.assertEqual((p["label"], p["conf"]), ("missing_piece", "high"))
        a = b.parse("all", "LABEL: sign_direction|low\nMINI: Check the sign. QUACK.\nWISH:\nPOOF! text")
        self.assertTrue(a["ok"])
        self.assertEqual(a["wish"], "POOF! text")

    def test_bad_shapes_fail(self):
        self.assertFalse(b.parse("minilabel", "LABEL: made_up|high\nMINI: x")["ok"])
        self.assertFalse(b.parse("label", "not json")["ok"])
        self.assertTrue(b.parse("label", '{"gap": "new", "confidence": "low"}')["ok"])

    def test_escalation_rule(self):
        self.assertTrue(b.escalate_needed(b.parse("label", '{"gap": "new", "confidence": "high"}')))
        self.assertTrue(b.escalate_needed(b.parse("label", '{"gap": "units_scale", "confidence": "low"}')))
        self.assertFalse(b.escalate_needed(b.parse("label", '{"gap": "units_scale", "confidence": "high"}')))


class Leak(unittest.TestCase):
    def test_answer_number_and_letter_leak(self):
        r = ROWS["cart"]                       # key 6.0, 3.0, 2.0; stem shows 2.0 1.0 3.0; pick a = 3.0 m/s
        self.assertFalse(b.leak("Where did the second cart go? QUACK.", r)["leak"])
        self.assertTrue(b.leak("Momentum is 6.0 before, so share it. QUACK.", r)["leak"])
        self.assertTrue(b.leak("It is pick b. QUACK.", r)["letter"])
        self.assertFalse(b.leak("Your 3.0 m/s ignores the second cart. QUACK.", r)["leak"])


class Fixture(unittest.TestCase):
    def test_shape(self):
        for r in ROWS.values():
            self.assertIn(r["gold"], b.LABELS, r["id"])
            self.assertIn(r["correct"], "abc")
            self.assertNotEqual(r["pick"], r["correct"])
            if r.get("swap_of"):
                self.assertEqual(r["gold"], ROWS[r["swap_of"]]["gold"])
        self.assertTrue(20 <= len(ROWS) <= 30)

    def test_prompts_do_not_carry_the_gold_label(self):
        for r in ROWS.values():
            self.assertNotIn(r["gold"], b.user_turn(r, "label"))


class Dry(unittest.TestCase):
    def test_every_arm_runs_on_canned_replies(self):
        recs = [b.run_event(a, "m", r, b.canned, "m2") for a in "ABCD" for r in list(ROWS.values())[:6]]
        rows = b.summarize(recs)
        self.assertEqual(len(rows), 4)
        self.assertEqual({r["arm"]: r["calls"] for r in rows}["C"], 18)
        self.assertIn("| A |", b.table(rows))
        self.assertIsNone(rows[0]["usd_1k"])    # PRICES unfilled -> n/a, never a made-up price


if __name__ == "__main__":
    unittest.main()
