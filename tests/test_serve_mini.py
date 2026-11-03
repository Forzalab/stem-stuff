"""S2a: POST /mini (todo 66 slice 1). serve.mini_route builds the ctx from ITS OWN bank item and calls mini.reply(ctx); the client sends
{code, step, text?} only. Not a try. 10 per student (sid) per hour. A reply that says the key never leaves. In-process (serve.dispatch)
with mini.reply stubbed: no network, no key."""
import copy
import hashlib
import json
import os
import sys
import tempfile
import unittest
from unittest import mock

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
sys.argv = [sys.argv[0]]
os.environ.setdefault("STEM_TRIES", os.path.join(tempfile.mkdtemp(prefix="stem-tries-"), "tries.json"))   # never the repo's tries.json
os.environ.setdefault("STEM_TODAY", "2026-10-23")   # pre-sunset: the v:1 fixture bank loads
import mini  # noqa: E402
import serve  # noqa: E402

FIX = {p["code"]: p for p in json.load(open(os.path.join(ROOT, "tests", "fixtures", "repair-p2x.json")))["problems"]}
SOLUTION = "Work: divide 8 by 6 to get the ratio, so the answer is 1.333 (private worked solution)."
GOOD = 'root = View([t])\nt = Text("Which given number connects to what this step asks for?")'
CODE = "PHYS_RPA"


def sid(name):
    return hashlib.md5(name.encode()).hexdigest()


def tries_state():
    return (json.dumps({repr(k): v for k, v in serve._tries.items()}, sort_keys=True, default=str),
            os.path.exists(serve.TRIES) and open(serve.TRIES).read())


class MiniRoute(unittest.TestCase):
    def setUp(self):
        bank = copy.deepcopy(FIX)
        bank[CODE]["saccharine"] = {"key": SOLUTION}
        for p in (mock.patch.object(serve, "problems", lambda: bank), mock.patch.object(serve, "KV", (None, None))):
            p.start()
            self.addCleanup(p.stop)
        self.me = "m-" + self.id()

    def post(self, body, who=None, raw=None):
        data = raw if raw is not None else json.dumps(body).encode()
        st, _, out = serve.dispatch("POST", "/mini", f"sid={sid(who or self.me)}", data)
        return st, json.loads(out)

    def stub(self, ret=GOOD):
        m = mock.patch.object(mini, "reply", return_value=ret)
        got = m.start()
        self.addCleanup(m.stop)
        return got

    def test_returns_the_stubbed_program(self):
        self.stub()
        self.assertEqual(self.post({"code": CODE, "step": "1"}), (200, {"program": GOOD}))

    def test_ctx_comes_from_the_bank_not_the_request(self):
        stub = self.stub()
        self.post({"code": CODE, "step": "1", "text": "I divided"})
        ctx = stub.call_args[0][0]
        self.assertEqual(ctx["solution"], SOLUTION)
        self.assertAlmostEqual(ctx["key"], 4 / 3, places=3)
        self.assertEqual(ctx["code"], CODE)
        self.assertIsNotNone(ctx.get("tol"))
        self.assertTrue(ctx["stem"])

    def test_client_key_and_solution_are_ignored(self):
        stub = self.stub()
        self.post({"code": CODE, "step": "1", "key": 999, "solution": "FORGED", "tol": 5, "stem": "FORGED"})
        ctx = stub.call_args[0][0]
        self.assertAlmostEqual(ctx["key"], 4 / 3, places=3)
        self.assertEqual(ctx["solution"], SOLUTION)
        self.assertNotIn("FORGED", json.dumps(ctx))
        self.assertNotEqual(ctx["tol"], 5)

    def test_bad_requests(self):
        stub = self.stub()
        self.assertEqual(self.post({"code": CODE, "step": "1", "text": "x" * 1100})[0], 400)           # over 1 KB
        self.assertEqual(self.post({"code": CODE, "step": "1", "image": "data:image/png;base64,AAAA"})[0], 400)   # image bytes
        self.assertEqual(self.post(None, raw=b"not json")[0], 400)
        self.assertEqual(self.post({"code": "NOPE_ZZZ", "step": "1"})[0], 404)                          # unknown code
        with mock.patch.object(serve, "hidden", lambda p, mode: True):
            self.assertEqual(self.post({"code": CODE, "step": "1"})[0], 404)                            # hidden code
        stub.assert_not_called()

    def test_rate_limit_is_ten_per_student_per_hour(self):
        self.stub()
        self.assertEqual(serve.MINI_PER_HOUR, 10)
        for i in range(10):
            self.assertEqual(self.post({"code": CODE, "step": "1"})[0], 200, i)
        self.assertEqual(self.post({"code": CODE, "step": "1"})[0], 429)                                 # the 11th
        self.assertEqual(self.post({"code": CODE, "step": "1"}, who="someone-else-" + self.me)[0], 200)   # per student

    def test_a_reply_that_says_the_key_never_leaves(self):
        self.stub('root = View([t])\nt = Text("The answer is 1.333, so use that.")')
        st, out = self.post({"code": CODE, "step": "1"})
        self.assertEqual(st, 200)
        self.assertIn(out["program"], [mini.authored(x) for x in mini.AUTHORED])
        self.assertNotIn("1.333", out["program"])

    def test_not_a_try(self):
        self.stub()
        before = tries_state()
        self.post({"code": CODE, "step": "1", "text": "hmm"})
        self.assertEqual(before, tries_state())


if __name__ == "__main__":
    unittest.main()
