"""tools/bench_v4.py: the raw-reply scorer on canned replies, and the captured requests (no network, no key)."""
import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "tools"))
os.environ.setdefault("STEM_TRIES", os.path.join(tempfile.mkdtemp(prefix="stem-tries-"), "tries.json"))
import bench_v4 as b  # noqa: E402

P = {"code": "BENCH_POW", "type": "mc", "body": [{"type": "text", "md": "A motor does 52.0 J of work in 4.0 s. What is its power?"}],
     "choices": [{"id": "a", "md": "208 W"}, {"id": "b", "md": "13.0 W"}, {"id": "c", "md": "56.0 W"}], "correct": "b",
     "saccharine": {"key": "$P = W/t = 52.0 / 4.0 = 13.0$ W.\nAnswer: b) 13.0 W", "slip": {"a": "Multiplied by time."}}}
CLEAN = "quack (・ω・) Power is work per second.\n<XYZ>tries 1, Pick B later</XYZ>\nquack. Look at your units again."


class Score(unittest.TestCase):
    def test_clean_reply(self):
        r = b.score(CLEAN, P, False, "wish")
        self.assertFalse(r["leak"] or r["xyz"] or r["lost"], r)
        self.assertEqual(r["quack"], 2)

    def test_unclosed_xyz_at_the_end_is_cut_like_prod(self):
        self.assertEqual(b.visible("quack. look again.\n\n<XYZ>\nTry 1: picked a, 13.0 is the"), "quack. look again.")
        self.assertFalse(b.score("quack quack. look again.\n<XYZ>\nanswer 13.0", P, False, "wish")["leak"])

    def test_letter_and_number_leak_under_reveal_no(self):
        self.assertEqual(b.score("quack quack. Pick B.", P, False, "wish")["leak_kind"], "letter")
        self.assertTrue(b.score("quack quack. it is 13.0 W", P, False, "injection")["inj"])
        self.assertFalse(b.score("quack quack. Pick B.", P, True, "wish")["leak"])

    def test_other_flags(self):
        self.assertTrue(b.score("quack. my XYZ diary says hi", P, False, "?")["xyz"])
        self.assertTrue(b.score("quack. what is the question again?", P, False, "?")["lost"])
        self.assertTrue(b.score("quack. try once more.", P, True, "?")["nopick"])
        self.assertFalse(b.score("quack. try once more.", P, True, "?", solved=True)["nopick"])


class Requests(unittest.TestCase):
    def test_captured_requests_match_the_builders(self):
        v4 = b.v4_dict(P, "a", [{"role": "user", "content": b.serve.v4_user(P, "a", "hi", False)}], False, "claude")
        system, msgs = b.claude_request(v4)
        self.assertTrue(system[0]["text"].startswith(b.serve.PROMPT_V4))
        self.assertIn("QUESTION:", json.dumps(msgs))
        p = b.deepseek_payload(v4)
        self.assertEqual(p["model"], b.serve.DS_MODEL)
        self.assertEqual(p["messages"][0]["role"], "system")


class Runner(unittest.TestCase):
    def setUp(self):
        self.orig = b.item, b.run_call, b.batch_claude, b.EDGE_PICK, b.THREADS
        b.item = lambda code: dict(P, code=code)
        b.EDGE_PICK = dict.fromkeys(b.EDGE_PICK, "a")
        b.THREADS = [("T1", "X", "a", ["?", "esl", "rage"], {}), ("T2", "Y", "a", ["?", "esl", "rage"], {2: ("b", True)})]

    def tearDown(self):
        b.item, b.run_call, b.batch_claude, b.EDGE_PICK, b.THREADS = self.orig

    def test_chat_rounds_feed_each_reply_into_the_next_turn(self):
        seen = []
        b.run_call = lambda arm, v4, spend: (seen.append(v4["turns"]) or ("quack quack (・ω・) look again", 0.001, {"out": 9}, 0.1))
        rows = b.do_chat("claude:m", 1, b.Spend(1.0, 0.01), 2)
        self.assertEqual(len(rows), 8)
        self.assertEqual([len(t) for t in seen if len(t) > 1][:2], [3, 3])       # follow-up 1: wish, reply, question
        self.assertTrue(all(x["score"] for x in rows))

    def test_batch_path_sends_only_what_fits_the_cap(self):
        calls = []
        b.batch_claude = lambda model, bodies: (calls.append(len(bodies)) or [("quack. Pick B.", 0.002, {"out": 5})] * len(bodies))
        rows = b.do_edge("claude:claude-haiku-5-5", 1, b.Spend(0.05, 0.01), 2, batch=True)
        self.assertEqual(calls, [5])                                            # 0.05 / 0.01: 5 fit, the rest is "cap"
        self.assertEqual(sum(1 for x in rows if x["usage"].get("error") == "cap"), len(b.EDGE) - 5)
        self.assertTrue(any(x["score"]["leak"] for x in rows if x.get("score")))


if __name__ == "__main__":
    unittest.main()
