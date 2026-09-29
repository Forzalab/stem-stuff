"""serve.py: evaluator, grading, HTTP. Run: python3 -m unittest discover -s tests -p 'test_*.py'"""
import json
import math
import os
import socket
import subprocess
import sys
import time
import unittest
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
sys.argv = [sys.argv[0]]  # serve.py reads argv at import
import serve  # noqa: E402

BANK = {p["code"]: p for p in json.load(open(os.path.join(ROOT, "problems.json")))["problems"]}


class Evaluate(unittest.TestCase):
    def test_values(self):
        cases = {"9/2": 4.5, "sqrt(3)": math.sqrt(3), "e^(-6)": math.exp(-6), "ln(2)": math.log(2), "log(2)": math.log(2),
                 "2pi": 2 * math.pi, "3(2+1)": 9, "(1+1)(2+1)": 6, "2.0*9.8*sin(25 deg)/150": 2 * 9.8 * math.sin(math.radians(25)) / 150,
                 "sin(30deg)": 0.5, "1e-3": 0.001, "-2^2": -4, "2^-1": 0.5, "  12 ": 12, "∞": math.inf, "π": math.pi}
        for s, v in cases.items():
            self.assertAlmostEqual(serve.evaluate(s), v, msg=s)

    def test_variable(self):
        self.assertAlmostEqual(serve.evaluate("3x^2", "x", 2), 12)
        self.assertAlmostEqual(serve.evaluate("t sin(t)", "t", 1), math.sin(1))

    def test_rejects(self):
        for s in ["__import__('os')", "().__class__", "open('x')", "x", "a.b", "[1]", "1;2", "lambda: 1", "9**9**9**9", "sqrt(-1)",
                  "(" * 150 + "1" + ")" * 150, "2 = 2", "'s'"]:
            with self.assertRaises(serve.UNREADABLE, msg=s):
                serve.evaluate(s)


class Grade(unittest.TestCase):
    def g(self, code, sid, **body):
        return serve.grade(BANK[code], sid, body)

    def test_num_right(self):
        self.assertEqual(self.g("CALC1_T6B", "a1", answer="12")["verdict"], "correct")
        self.assertEqual(self.g("CALC1_T6B", "a1", answer="12")["verdict"], "locked")

    def test_num_two_tries_hints(self):
        r = self.g("CALC1_T6B", "a2", answer="4")
        self.assertEqual((r["verdict"], r["triesLeft"], r["error"]), ("wrong", 1, "algebra"))
        self.assertTrue(r["hint"].startswith("QUACK"))
        self.assertTrue(self.g("CALC1_T6B", "a2", answer="4.0")["repeat"])          # same value: doesn't count
        self.assertEqual(self.g("CALC1_T6B", "a2", answer="2+")["verdict"], "invalid")  # unreadable: doesn't count
        r = self.g("CALC1_T6B", "a2", answer="dne")
        self.assertEqual((r["verdict"], r["triesLeft"], r["error"]), ("wrong", 0, "limit-plug"))
        self.assertEqual(self.g("CALC1_T6B", "a2", answer="12")["verdict"], "locked")
        self.assertEqual(self.g("CALC1_T6B", "other", answer="12")["verdict"], "correct")  # per browser

    def test_nudge_and_tol(self):
        r = self.g("PHYS_F3N", "a3", answer="3.3")
        self.assertEqual(r["verdict"], "wrong")
        self.assertNotIn("error", r)
        self.assertEqual(self.g("PHYS_F3N", "a3", answer="3.20")["verdict"], "correct")

    def test_mc(self):
        r = self.g("CALC1_X2P", "a4", choice="a")
        self.assertEqual((r["verdict"], r["error"]), ("wrong", "sign"))
        self.assertEqual(self.g("CALC1_X2P", "a4", choice="z")["verdict"], "invalid")
        self.assertEqual(self.g("CALC1_X2P", "a4", choice="b")["verdict"], "correct")

    def test_text(self):
        r = self.g("CSCI26_Q8C", "t1", answer="q -> p")
        self.assertEqual((r["verdict"], r["error"]), ("wrong", "fallacy"))
        self.assertEqual(self.g("CSCI26_Q8C", "t1", answer="  ")["verdict"], "invalid")
        self.assertEqual(self.g("CSCI26_Q8C", "t1", answer="~Q->~P")["verdict"], "correct")   # case + spaces ignored
        self.assertEqual(self.g("CSCI26_Q8C", "t2", answer="¬q → ¬p")["verdict"], "correct")  # accept list

    def test_multi(self):
        self.assertEqual(self.g("CSCI26_M5V", "m1", parts=["14"])["verdict"], "invalid")      # all boxes or nothing
        self.assertEqual(self.g("CSCI26_M5V", "m1", parts=["14", "x+"])["verdict"], "invalid")
        r = self.g("CSCI26_M5V", "m1", parts=["17", "11"])
        self.assertEqual((r["verdict"], r["triesLeft"], r["error"]), ("wrong", 1, "counting"))
        self.assertTrue(self.g("CSCI26_M5V", "m1", parts=["17", "11.0"])["repeat"])
        self.assertEqual(self.g("CSCI26_M5V", "m1", parts=["14", "11"])["verdict"], "correct")

    def test_two_choices_one_try(self):
        r = self.g("CSCI26_TF3", "c1", choice="f")
        self.assertEqual((r["verdict"], r["triesLeft"]), ("wrong", 0))          # 2-choice mc: one wrong locks it
        self.assertEqual(self.g("CSCI26_TF3", "c1", choice="t")["verdict"], "locked")
        self.assertEqual(self.g("CSCI26_TF3", "c2", choice="t")["verdict"], "correct")

    def test_three_choices_two_tries(self):
        r = self.g("CSCI26_TFM", "c3", choice="t")
        self.assertEqual((r["verdict"], r["triesLeft"]), ("wrong", 1))
        r = self.g("CSCI26_TFM", "c3", choice="f")
        self.assertEqual((r["verdict"], r["triesLeft"]), ("wrong", 0))          # 3 choices: locks after 2 wrong
        self.assertEqual(self.g("CSCI26_TFM", "c3", choice="m")["verdict"], "locked")
        self.assertEqual(self.g("CSCI26_TFM", "c4", choice="t")["triesLeft"], 1)
        self.assertEqual(self.g("CSCI26_TFM", "c4", choice="m")["verdict"], "correct")

    def test_max_tries_table(self):
        mk = lambda t, n: {"type": t, "correct": "0", "choices": [{"id": str(i), "md": "x"} for i in range(n)]}  # noqa: E731
        table = [(mk("mc", 2), 1), (mk("mc", 3), 2), (mk("mc", 5), 2), (mk("mc", 8), 2), ({"type": "num"}, 2),
                 ({"type": "text"}, 2), ({"type": "expr"}, 2), ({"type": "multi"}, 2)]
        for p, n in table:
            self.assertEqual(serve.max_tries(p), n, (p["type"], len(p.get("choices", []))))
        # the table also lives in tests/tries.test.mjs against app.js maxTries(): keep them equal

    def test_new_ce_choices_binary(self):
        for code in ("CSCI26_CE05", "CSCI26_CE07", "CSCI26_CE25"):
            self.assertEqual(len(BANK[code]["choices"]), 2, code)
            self.assertEqual(self.g(code, "ce", choice=BANK[code]["wrong"][0]["choice"])["triesLeft"], 0, code)

    def test_shuffle(self):
        p = BANK["CALC1_X2P"]
        order = lambda sid: [c["id"] for c in serve.public(p, sid)["choices"]]  # noqa: E731
        self.assertEqual(order("s1"), order("s1"))                      # same browser, same order
        self.assertGreater(len({tuple(order(f"s{i}")) for i in range(20)}), 3)   # browsers differ
        self.assertEqual(sorted(order("s1")), sorted(c["id"] for c in p["choices"]))
        locked = dict(p, choices=[*p["choices"][:4], dict(p["choices"][4], lock=True)])
        self.assertTrue(all(serve.public(locked, f"s{i}")["choices"][4]["id"] == p["choices"][4]["id"] for i in range(20)))

    def test_shuffle_is_the_default(self):
        self.assertEqual([c for c, p in BANK.items() if p.get("shuffle") is False], [])   # no bank problem opts out
        for code in ("CSCI26_TF3", "CSCI26_TFM", "CSCI26_CE05"):
            p = BANK[code]
            order = lambda sid: tuple(c["id"] for c in serve.public(p, sid)["choices"])  # noqa: E731
            self.assertEqual(order("q1"), order("q1"))                                      # deterministic per seed
            self.assertGreater(len({order(f"q{i}") for i in range(30)}), 1, code)          # and it does shuffle
        no_flag = {k: v for k, v in BANK["CALC1_X2P"].items() if k != "shuffle"}
        self.assertGreater(len({tuple(c["id"] for c in serve.public(no_flag, f"z{i}")["choices"]) for i in range(20)}), 3)
        opt_out = dict(BANK["CALC1_X2P"], shuffle=False)                                   # explicit false still keeps authored order
        self.assertEqual([c["id"] for c in serve.public(opt_out, "z1")["choices"]], list("abcde"))

    def test_grading_follows_the_id_after_shuffle(self):
        for code, p in BANK.items():
            if p["type"] != "mc":
                continue
            for i in range(8):
                sid = f"gs{i}"
                order = [c["id"] for c in serve.public(p, sid)["choices"]]
                for pos, cid in enumerate(order):        # whatever slot it lands in, the id decides
                    r = serve.grade(p, f"{sid}-{pos}", {"choice": cid})
                    self.assertEqual(r["verdict"], "correct" if cid == p["correct"] else "wrong", (code, sid, pos))

    def test_reply_never_has_the_answer(self):
        for code, p in BANK.items():
            for body in ({"answer": "0"}, {"choice": "a"}, {"answer": "1"}, {"choice": "c"}, {"parts": ["1", "2"]}):
                r = json.dumps(serve.grade(p, "leak-" + code, body))
                for k in ("answer", "correct", "points"):
                    self.assertNotIn(f'"{k}"', r)

    def test_public_strips_keys(self):
        for p in BANK.values():
            pub = serve.public(p)
            self.assertFalse({"answer", "accept", "points", "tol", "correct", "wrong", "nudge"} & set(pub), p["code"])
            self.assertNotIn("answer", json.dumps(pub.get("parts", [])))
            self.assertEqual(pub["body"], p["body"])


class Http(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with socket.socket() as s:
            s.bind(("127.0.0.1", 0))
            cls.port = s.getsockname()[1]
        cls.proc = subprocess.Popen([sys.executable, os.path.join(ROOT, "serve.py"), str(cls.port)],
                                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        cls.base = f"http://127.0.0.1:{cls.port}/"
        for _ in range(50):
            try:
                urllib.request.urlopen(cls.base, timeout=1)
                return
            except OSError:
                time.sleep(0.1)

    @classmethod
    def tearDownClass(cls):
        cls.proc.terminate()
        cls.proc.wait()

    def status(self, path, method="GET"):
        try:
            return urllib.request.urlopen(urllib.request.Request(self.base + path, method=method)).status
        except urllib.error.HTTPError as e:
            return e.code

    def test_blocked(self):
        for path in ["problems.json", "serve.py", "deploy.sh", "tests/test_serve.py", "tools/bundle.py", ".git/HEAD", "p/NOPE_ZZZ.json"]:
            for m in ("GET", "HEAD"):
                self.assertEqual(self.status(path, m), 404, f"{m} {path}")

    def test_public_problem(self):
        p = json.load(urllib.request.urlopen(self.base + "p/CALC1_T6B.json"))
        self.assertEqual(p["code"], "CALC1_T6B")
        self.assertNotIn("answer", p)

    def test_check_sets_cookie_and_counts(self):
        req = lambda cookie=None: urllib.request.Request(  # noqa: E731
            self.base + "check", data=json.dumps({"code": "CALC1_T6B", "answer": "5"}).encode(), method="POST",
            headers={"Content-Type": "application/json", **({"Cookie": cookie} if cookie else {})})
        r = urllib.request.urlopen(req())
        cookie = r.headers["Set-Cookie"].split(";")[0]
        self.assertTrue(cookie.startswith("sid="))
        self.assertEqual(json.load(r)["triesLeft"], 1)
        r2 = urllib.request.urlopen(req(cookie))
        self.assertIsNone(r2.headers["Set-Cookie"])
        self.assertEqual(json.load(r2)["triesLeft"], 1)   # same wrong value again: a repeat


if __name__ == "__main__":
    unittest.main()
