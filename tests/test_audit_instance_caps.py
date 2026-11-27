"""Audit A2 (race / dual write, per-instance state): the follow-up cap (CHAT_TURNS), the one free starter ask and the hourly Cluck cap
(explain_allowed) lived in module dicts (_chats, _starters, _asked): one fact (how many asks has this browser used) kept in this
process while the Cluck turn rows live in KV. On Vercel every cold start / second instance starts the dicts empty, so a student got a fresh
5 follow-ups, a fresh free starter and a fresh 40 asks an hour on each instance (the owner's LLM money, and each free starter was a counted
Cluck turn: three of them = REVEAL: yes before a try). The counters now live in KV (INCR / SET NX, one key per browser and item or hour),
every instance reads the same one; the dicts stay as the no-KV fallback.

Run: python3 -m unittest tests.test_audit_instance_caps -v"""
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

CODE, STARTER = "KVF_Q01", "Why do we add here?"


class Kv(FakeKV):
    """FakeKV + SET ... NX and DECR"""
    def run(self, cmd):
        op = str(cmd[0]).upper()
        if op == "SET" and "NX" in [str(x).upper() for x in cmd[3:]]:
            if cmd[1] in self.db:
                return None
            return super().run([c for c in cmd if str(c).upper() != "NX"])
        if op == "DECR":
            self.db[cmd[1]] = str(int(self.db.get(cmd[1], 0)) - 1)
            return int(self.db[cmd[1]])
        return super().run(cmd)


class InstanceCaps(unittest.TestCase):
    def setUp(self):
        self.kv = Kv()
        banks = tempfile.mkdtemp(prefix="stem-caps-")
        with open(os.path.join(banks, "BANK_KVC.json"), "w") as f:
            json.dump({"v": serve.CUTOFF, "problems": [dict(problem(1), starter=STARTER)]}, f)
        env = {"CLAUDE_API": "sk-ant-test", "OPENROUTER_API_KEY": "sk-or-test", "CLUCK_SUBJECT": "0", "CLUCK_ARM": "claude", "STEM_FRONT": "",
               "VERCEL_ENV": "", "STEM_TRIES_HASH": "1"}
        self.ps = [mock.patch.dict(os.environ, env), mock.patch.object(serve, "BANKS", banks), mock.patch.object(serve, "KV", (KV_URL, "t")),
                   mock.patch.object(serve.urllib.request, "urlopen", self.kv.urlopen)]
        for p in self.ps:
            p.start()
        self.cold()
        self.cookie = "sid=" + fake_sid("caps")

    def tearDown(self):
        for p in reversed(self.ps):
            p.stop()
        serve._gen["loaded"] = None
        self.cold()

    def cold(self):
        """another instance / a cold start: every module dict empty, KV as it is"""
        serve._asked.clear()
        serve._chats.clear()
        serve._starters.clear()

    def chat(self, text, n=1, **over):
        h = [{"role": "assistant", "content": "POOF!"}]
        for i in range(n):
            h += [{"role": "user", "content": text if i == n - 1 else f"q{i}"}] + ([{"role": "assistant", "content": "ok"}] if i < n - 1 else [])
        st, head, chunks = serve.chat(self.cookie, json.dumps({"code": CODE, "answer": "", "history": h, **over}).encode())
        b"".join(chunks)
        return st

    def test_the_follow_up_cap_survives_a_cold_start(self):
        self.assertEqual([self.chat(f"q{i}") for i in range(serve.CHAT_TURNS)], [200] * serve.CHAT_TURNS)
        self.cold()
        self.assertEqual(self.chat("one more"), 429, "a second instance gave this browser a fresh set of follow-ups")

    def test_the_free_starter_is_free_once_across_instances(self):
        self.assertEqual(self.chat(STARTER, starter=True), 200)
        self.cold()
        self.assertEqual(self.chat(STARTER, starter=True), 200)         # no longer free: it counts as an ordinary follow-up
        self.cold()
        got = [self.chat(f"q{i}") for i in range(serve.CHAT_TURNS)]
        self.assertEqual(got, [200] * (serve.CHAT_TURNS - 1) + [429], "the starter was free again on another instance")

    def test_the_hourly_cap_survives_a_cold_start(self):
        sid = fake_sid("hour")
        for i in range(serve.ANY_PER_HOUR):
            self.cold()
            self.assertTrue(serve.explain_allowed(sid, False, now=7200.0), i)
        self.cold()
        self.assertFalse(serve.explain_allowed(sid, False, now=7260.0), "the hourly cap restarted on another instance")
        self.cold()
        self.assertTrue(serve.explain_allowed(sid, False, now=7200.0 + 3600), "the next hour has its own count")

    def test_no_kv_keeps_the_in_process_count(self):
        with mock.patch.object(serve, "KV", (None, None)):
            self.assertEqual([self.chat(f"q{i}") for i in range(serve.CHAT_TURNS)], [200] * serve.CHAT_TURNS)
            self.assertEqual(self.chat("more"), 429)

    def test_a_refused_ask_gives_its_turn_back(self):
        with mock.patch.object(serve, "explain_allowed", return_value=False):
            self.assertEqual(self.chat("q"), 429)
        self.assertEqual([self.chat(f"q{i}") for i in range(serve.CHAT_TURNS)], [200] * serve.CHAT_TURNS)


if __name__ == "__main__":
    unittest.main()
