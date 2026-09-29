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

    def test_reply_never_has_the_answer(self):
        for code, p in BANK.items():
            for body in ({"answer": "0"}, {"choice": "a"}, {"answer": "1"}, {"choice": "c"}):
                r = json.dumps(serve.grade(p, "leak-" + code, body))
                for k in ("answer", "correct", "points"):
                    self.assertNotIn(f'"{k}"', r)

    def test_public_strips_keys(self):
        for p in BANK.values():
            pub = serve.public(p)
            self.assertFalse({"answer", "points", "tol", "correct", "wrong", "nudge"} & set(pub), p["code"])
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
