"""acct.py: My Cluck account store (DESIGN-v3 §7, Tony #25.1). Run: python3 -m pytest tests/test_acct.py -q"""
import hashlib
import json
import os
import sys
import unittest
import unittest.mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import acct  # noqa: E402

SID = "0123456789abcdef0123456789abcdef"
SID2 = "fedcba9876543210fedcba9876543210"


class Store(unittest.TestCase):
    """the in-process store (no KV env): the same calls as Upstash, so every test also runs the KV path in KvPath"""

    def setUp(self):
        acct._mem.clear()

    def dump(self):
        return json.dumps(acct._mem)

    def test_two_mints_differ_and_are_long(self):
        a, b = acct.mint(SID), acct.mint(SID)
        self.assertNotEqual(a, b)
        self.assertGreaterEqual(len(a), 22)
        self.assertRegex(a, r"^[A-Za-z0-9_-]+$")   # base64url: safe in ?k= unescaped

    def test_login_returns_the_minted_sid(self):
        self.assertEqual(acct.login(acct.mint(SID)), SID)
        self.assertEqual(acct.login(acct.mint(SID2, "Ana")), SID2)

    def test_unknown_or_junk_token_is_none(self):
        acct.mint(SID)
        for t in ("Zx9_-" * 5, "", None, 7, "x" * 5000, "has space and more than twenty-two", "a" * 22):
            self.assertIsNone(acct.login(t), t)

    def test_raw_token_never_stored_only_its_hash(self):
        tok = acct.mint(SID, "Ana")
        self.assertNotIn(tok, self.dump())
        self.assertIn("acct:" + hashlib.sha256(tok.encode()).hexdigest(), acct._mem)
        self.assertTrue(all(k.startswith("acct:") for k in acct._mem))   # outside stem:tries

    def test_display_name_optional_and_capped(self):
        acct.mint(SID)
        tok = acct.mint(SID2, "  " + "N" * 200 + "  ")
        rec = json.loads(acct._mem["acct:" + hashlib.sha256(tok.encode()).hexdigest()])
        self.assertEqual(rec["name"], "N" * acct.NAME_MAX)

    def test_bad_sid_refused(self):
        for s in ("", "abc", SID.upper(), None):
            with self.assertRaises(ValueError):
                acct.mint(s)

    def test_rewards_put_get(self):
        self.assertIsNone(acct.get_rewards(SID))        # no account yet
        self.assertFalse(acct.put_rewards(SID, {"xp": 3}))   # no account: nothing stored for a bare sid
        self.assertEqual(self.dump(), "{}")
        acct.mint(SID)
        self.assertEqual(acct.get_rewards(SID), {})
        self.assertTrue(acct.put_rewards(SID, {"xp": 40, "streak": 2}))
        self.assertEqual(acct.get_rewards(SID), {"xp": 40, "streak": 2})
        self.assertIsNone(acct.get_rewards(SID2))

    def test_rewards_follow_a_second_mint(self):
        acct.mint(SID)
        acct.put_rewards(SID, {"xp": 9})
        old = acct.mint(SID)
        new = acct.mint(SID)
        self.assertEqual(acct.get_rewards(acct.login(new)), {"xp": 9})
        self.assertEqual(acct.login(old), SID)          # an older saved Cluck still opens the same progress

    def test_rewards_cap(self):
        acct.mint(SID)
        pad = acct.REWARDS_MAX - len(json.dumps({"p": ""}, separators=(",", ":")))
        at_cap = {"p": "x" * pad}
        self.assertEqual(len(json.dumps(at_cap, separators=(",", ":"))), acct.REWARDS_MAX)
        self.assertTrue(acct.put_rewards(SID, at_cap))
        with self.assertRaises(ValueError):
            acct.put_rewards(SID, {"p": "x" * (pad + 1)})
        self.assertEqual(acct.get_rewards(SID), at_cap)     # the refused put changed nothing
        for bad in ([1, 2], "xp", None, {"x": float("nan")}):
            with self.assertRaises(ValueError):
                acct.put_rewards(SID, bad)


class KvPath(Store):
    """the same tests through _kv (Upstash REST), faked by a dict that speaks GET/SET"""

    def setUp(self):
        super().setUp()
        self.cmds = []

        def fake(*cmd):
            self.cmds.append(cmd)
            if cmd[0] == "GET":
                return acct._mem.get(cmd[1])
            if cmd[0] == "SET":
                acct._mem[cmd[1]] = cmd[2]
                return "OK"
            raise AssertionError(cmd)
        for p in (unittest.mock.patch.object(acct, "KV", ("https://kv.example", "t")), unittest.mock.patch.object(acct, "_kv", fake)):
            p.start()
            self.addCleanup(p.stop)

    def test_kv_used_and_token_never_sent(self):
        tok = acct.mint(SID)
        acct.login(tok)
        self.assertTrue(self.cmds)
        self.assertNotIn(tok, json.dumps(self.cmds))


if __name__ == "__main__":
    unittest.main()
