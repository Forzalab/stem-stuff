"""tools/bench_claude.py: the FORMAT checker on canned replies, and the 8 bench cases build (no network, no key)."""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "tools"))
import bench_claude as b  # noqa: E402

KEY = "$P = W/t = 52.0 / 4.0 = 13.0\\ \\text{W}$.\nAnswer: b) 13.0 W"
GOOD = """NOTE: assumed=multiply | real=per means divide | gap=rate
POOF! Power is work **per second**, so time goes underneath. QUACK.

$$P = \\frac{52.0\\ \\text{J}}{4.0\\ \\text{s}} = 13.0\\ \\text{W}$$

(taps the board) Multiplying gives $\\text{J}\\cdot\\text{s}$, not a watt. QUACK."""


class Checker(unittest.TestCase):
    def test_good_reply_passes(self):
        r = b.check(GOOD, KEY, 120)
        self.assertTrue(r["ok"], r)
        self.assertTrue(r["note_line"])
        self.assertFalse(r["note_leak"])

    def test_each_rule_trips(self):
        for bad, field in (("\\(P\\) QUACK", "paren_latex"), ("$$\nP = 1\n$$ QUACK", "split_dd"), ("# Power\nQUACK", "headers"),
                           ("* one\nQUACK", "star_bullets"), ("*flaps* QUACK", "star_actions"), ("Great question! QUACK", "hedges"),
                           ("It is 99 W. QUACK", "new_numbers"), ("hi\nNOTE: x QUACK", "note_leak"), ("$x QUACK", "odd_dollar")):
            r = b.check(bad, KEY, 120)
            self.assertTrue(r[field], (bad, field))
            self.assertFalse(r["ok"], bad)
        self.assertFalse(b.check("Power is per second.", KEY, 120)["ok"])      # no QUACK
        self.assertTrue(b.check("QUACK " + "word " * 50, KEY, 10)["over_budget"])

    def test_bold_and_step_numbers_are_fine(self):
        self.assertTrue(b.check("1. Divide — per second\n- **52.0** J over **4.0** s\nQUACK", KEY, 120)["ok"])

    def test_choice_numbers_allowed(self):
        self.assertTrue(b.check("You picked 208 W. QUACK", KEY, 120, "power? 208 W 13.0 W")["ok"])

    def test_eight_cases(self):
        cs = b.cases()
        self.assertEqual(len(cs), 8)
        self.assertEqual(sum(n.endswith("chat") for n, *_ in cs), 4)
        self.assertTrue(all(m[0]["role"] == "system" and m[-1]["role"] == "user" for _, m, *_ in cs))


if __name__ == "__main__":
    unittest.main()
