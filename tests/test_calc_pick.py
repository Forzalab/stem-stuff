"""acct.get_calc / put_calc (calc-pick.js, Tony Nov 6): the calculator model per sid. Run: python3 -m pytest tests/test_calc_pick.py -q"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # tests/ (for paths)
import paths
sys.path.insert(0, paths.SERVER_DIR)
from accounts import acct  # noqa: E402

SID = "0123456789abcdef0123456789abcdef"
SID2 = "fedcba9876543210fedcba9876543210"


class Calc(unittest.TestCase):
    def setUp(self):
        acct._mem.clear()
        acct._exp.clear()

    def test_per_sid_follows_login_and_keep(self):
        acct.put_calc(SID, "ti-36x-pro")
        self.assertEqual(acct.get_calc(SID), "ti-36x-pro")
        self.assertIsNone(acct.get_calc(SID2), "never leaks across sids")
        self.assertIn("calc:" + SID, acct._exp, "a TTL until kept")
        tok = acct.mint(SID)
        self.assertEqual(acct.get_calc(acct.login(tok)), "ti-36x-pro", "login hands back the sid, and its model")
        acct.keep(tok)
        self.assertNotIn("calc:" + SID, acct._exp, "kept: no TTL")
        acct.put_calc(SID, "fx-991ex")
        self.assertNotIn("calc:" + SID, acct._exp)

    def test_bad_input(self):
        for sid, m in ((SID, "<b>"), (SID, ""), (SID, None), ("nope", "ti-36x-pro")):
            with self.assertRaises(ValueError):
                acct.put_calc(sid, m)


if __name__ == "__main__":
    unittest.main()
