"""tools/tol.py: the wiggle test (tolerance 1b, SCHEMA.md tol_why)."""
import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "tools"))
import tol  # noqa: E402


class Wiggle(unittest.TestCase):
    def test_wiggles(self):
        w = tol.wiggles("2.65*2*pi*9.8^2+log10(3.0)")
        self.assertIn("2.65*2*pi*9.81^2+log10(3.0)", w)               # g
        self.assertIn("2.65*2*3.14*9.8^2+log10(3.0)", w)               # pi
        self.assertIn("2.66*2*pi*9.8^2+log10(3.0)", w)                 # a decimal datum +1 in its last digit
        self.assertIn("2.65*2*pi*9.8^2+log10(2.9)", w)
        self.assertFalse(any("*3*pi" in x or "*1*pi" in x for x in w))   # integers are exact (Tony, Oct 23)
        self.assertFalse(any("^3" in x for x in w))                     # exponents stay

    def test_definitive(self):
        self.assertTrue(tol.definitive("0"))                            # PHYS_8X3: 0 by symmetry
        self.assertFalse(tol.definitive("8.3446"))                      # a folded key
        self.assertTrue(tol.definitive("10+7-3"))                       # counting: integers are exact
        self.assertTrue(tol.definitive("5*4*3*2*1/2"))
        self.assertFalse(tol.definitive("2*1.2*0.0125*0.0125*(2.65*2*pi)"))   # PHYS_EX9
        self.assertFalse(tol.definitive("pi/3"))                        # pi 3.14 moves it
        self.assertTrue(tol.definitive("sin(0*pi)"))

    def test_warnings(self):
        bank = {"problems": [{"code": "A", "type": "num", "answer": "14", "form": "10+7-3"},
                             {"code": "B", "type": "num", "answer": "2.5", "form": "5.0/2"},
                             {"code": "C", "type": "num", "answer": "3", "tol": 1e-4}]}
        w = tol.warnings(bank, "b.json")
        self.assertEqual(len(w), 2)
        self.assertIn("b.json: 2 num unit(s) with no tol at any level", w[0])
        self.assertIn("A: integer key, integer inputs, no tol", w[1])
        self.assertEqual(tol.warnings({**bank, "tol": 0.01}, "b.json"), [w[1]])   # a bank tol silences the bank line, not the off-by-one one

    def test_write_keeps_author_tol(self):
        bank = {"problems": [{"code": "A", "type": "num", "answer": "0", "form": "0"},
                             {"code": "B", "type": "num", "answer": "1", "form": "1", "tol": 0.01},
                             {"code": "C", "type": "num", "answer": "2.5", "form": "5.0/2"}]}
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "b.json")
            with open(path, "w") as f:
                json.dump(bank, f)
            rows = tol.check(path, write=True)
            out = {p["code"]: p for p in json.load(open(path))["problems"]}
        self.assertEqual((out["A"]["tol"], out["A"]["tol_why"]), (tol.EXACT, tol.WHY))
        self.assertEqual((out["B"]["tol"], "tol_why" in out["B"]), (0.01, False))
        self.assertNotIn("tol", out["C"])
        self.assertEqual(rows[:3], ["  A: definitive -> tol 0.0001", "  B: author tol 0.01", "  C: default 2%"])
        self.assertIn("1 num unit(s) with no tol", rows[3])


if __name__ == "__main__":
    unittest.main()
