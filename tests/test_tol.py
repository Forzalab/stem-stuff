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
        w = tol.wiggles("2.65*2*pi*9.8^2+log10(3)")
        self.assertIn("2.65*2*pi*9.81^2+log10(3)", w)                 # g
        self.assertIn("2.65*2*3.14*9.8^2+log10(3)", w)                 # pi
        self.assertIn("2.66*2*pi*9.8^2+log10(3)", w)                   # +1 in the last digit
        self.assertIn("2.65*2*pi*9.8^2+log10(2)", w)
        self.assertFalse(any(x.endswith("^3+log10(3)") or "log11" in x for x in w))   # exponents and names stay

    def test_definitive(self):
        self.assertTrue(tol.definitive("0"))                            # PHYS_8X3: 0 by symmetry
        self.assertFalse(tol.definitive("8.3446"))                      # a folded key
        self.assertFalse(tol.definitive("10+7-3"))                      # data in, so a datum moves it
        self.assertFalse(tol.definitive("2*1.2*0.0125*0.0125*(2.65*2*pi)"))   # PHYS_EX9
        self.assertTrue(tol.definitive("sin(0*pi)"))                    # 0 stays 0 under every wiggle of pi

    def test_write_keeps_author_tol(self):
        bank = {"problems": [{"code": "A", "type": "num", "answer": "0", "form": "0"},
                             {"code": "B", "type": "num", "answer": "1", "form": "1", "tol": 0.01},
                             {"code": "C", "type": "num", "answer": "14", "form": "10+7-3"}]}
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "b.json")
            with open(path, "w") as f:
                json.dump(bank, f)
            rows = tol.check(path, write=True)
            out = {p["code"]: p for p in json.load(open(path))["problems"]}
        self.assertEqual((out["A"]["tol"], out["A"]["tol_why"]), (tol.EXACT, tol.WHY))
        self.assertEqual((out["B"]["tol"], "tol_why" in out["B"]), (0.01, False))
        self.assertNotIn("tol", out["C"])
        self.assertEqual(rows, ["  A: definitive -> tol 0.0001", "  B: author tol 0.01", "  C: default 2%"])


if __name__ == "__main__":
    unittest.main()
