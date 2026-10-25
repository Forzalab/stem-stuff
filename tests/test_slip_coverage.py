"""tools/slip_coverage.py: the share of logged wrong tries (the tries blob: tries.json or Upstash stem:tries) that get a slip family, a
SLIP_TIE collide, or nothing (the fallback ladder's share). Run: python3 -m pytest tests/test_slip_coverage.py -q"""
import contextlib
import importlib.util
import io
import json
import os
import sys
import tempfile
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
sys.argv = [sys.argv[0]]  # serve.py reads argv at import
os.environ.setdefault("STEM_TRIES", os.path.join(tempfile.mkdtemp(prefix="stem-tries-"), "tries.json"))   # never the repo tries.json
spec = importlib.util.spec_from_file_location("slip_coverage", os.path.join(ROOT, "tools", "slip_coverage.py"))
cov = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cov)

# 12/(100+200+300) = 0.02 (tests/test_serve.py TIE): 0.06 sign, 50 reciprocal, 0.01 factor, 0.03 sign AND drop (SLIP_TIE), 7.77 no slip
FORM = "12/(100+200+300)"
BANK = {"PHYS_TIE": {"code": "PHYS_TIE", "type": "num", "answer": FORM, "form": FORM},
        "PHYS_TIM": {"code": "PHYS_TIM", "type": "multi", "parts": [{"type": "num", "answer": FORM, "form": FORM}]},
        "PHYS_MC": {"code": "PHYS_MC", "type": "mc", "correct": "a", "choices": [{"id": "a"}, {"id": "b"}]}}
LOG = {"gen": 5, "tries": {"s1 PHYS_TIE": {"wrong": [0.06, 50.0], "done": True, "gen": 1},
                           "s2 PHYS_TIE": {"wrong": [0.01, 7.77], "done": False, "gen": 2},
                           "s3 PHYS_TIM 0": {"wrong": [0.03], "done": False, "gen": 3},
                           "s4 PHYS_MC": {"wrong": ["b"], "done": False, "gen": 4},      # an mc pick: no slip to match, not counted
                           "s5 GONE_X": {"wrong": [1.0], "done": False, "gen": 5}}}      # a code no bank has any more: not counted


class Coverage(unittest.TestCase):
    def test_five_rows(self):
        r = cov.coverage(LOG, BANK.get)
        self.assertEqual((r["tries"], r["family"], r["tie"], r["none"]), (5, 3, 1, 1))
        self.assertEqual(r["families"], {"sign": 1, "reciprocal": 1, "factor": 1})
        self.assertEqual((r["skipped"], r["unknown"]), (1, 1))
        out = cov.lines(r)
        for want in ("family 3  60%", "tie 1  20%", "none 1  20%"):
            self.assertTrue(any(want in ln for ln in out), (want, out))

    def test_authored_wrong_entry_first(self):     # /check order: an authored `wrong` entry wins over the slip matcher
        bank = dict(BANK, PHYS_TIE=dict(BANK["PHYS_TIE"], wrong=[{"match": "0.06", "error": "sign", "hint": "h"}]))
        r = cov.coverage(LOG, bank.get)
        self.assertEqual((r["authored"], r["family"]), (1, 2))

    def test_cli_reads_a_file(self):
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
            json.dump({"tries": {}}, f)
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            self.assertEqual(cov.main([f.name]), 0)
        os.unlink(f.name)
        self.assertIn("0 wrong num tries", out.getvalue())


if __name__ == "__main__":
    unittest.main()
