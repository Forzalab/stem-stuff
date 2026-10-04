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
import tempfile  # noqa: E402
TMP = tempfile.mkdtemp(prefix="stem-tries-")
os.environ["STEM_TRIES"] = os.path.join(TMP, "tries.json")   # never write the real tries.json (the Http server inherits it)
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

    def test_pick_all(self):                                                    # design/CHOOSE-ALL.md §3
        for bad in ({"choices": "a"}, {"choices": ["a", "a"]}, {"choices": ["z"]}, {"choices": ["a", "e"]},
                    {"choice": "a"}, {"choices": [1]}):
            self.assertEqual(self.g("CSCI26_A7K", "k1", **bad)["verdict"], "invalid", bad)   # not a try
        self.assertEqual(self.g("CSCI26_A7K", "k0", choices=[])["error"], "incomplete")   # nothing ticked = "none true": a real try
        r = self.g("CSCI26_A7K", "k1", choices=["a"])                          # right but incomplete: miss, nothing struck
        self.assertEqual((r["verdict"], r["triesLeft"], r["error"]), ("wrong", 1, "incomplete"))
        self.assertNotIn("struck", r)
        self.assertTrue(self.g("CSCI26_A7K", "k1", choices=["a"])["repeat"])   # same set again: no try spent
        r = self.g("CSCI26_A7K", "k1", choices=["d", "a", "b"])                 # first ticked distractor in shown order
        self.assertEqual((r["verdict"], r["triesLeft"], r["struck"], r["error"]), ("wrong", 0, "b", "misread"))
        self.assertEqual(self.g("CSCI26_A7K", "k1", choices=["a", "c"])["verdict"], "locked")
        self.assertEqual(self.g("CSCI26_A7K", "k2", choices=["c", "a"])["verdict"], "correct")   # order does not matter
        self.assertEqual(self.g("CSCI26_A7K", "k3", choices=["e"])["struck"], "e")
        pub = serve.public(BANK["CSCI26_A7K"], "k1")
        self.assertEqual(pub["pick"], "all")
        self.assertFalse({"correct", "wrong", "miss"} & set(pub))

    def test_four_sig_figs(self):                                               # Tony: right to 4 significant figures counts
        u = {"type": "num", "answer": "9*sqrt(3)"}
        for text, ok in (("15.59", True), ("15.588", True), ("15.6", False), ("15.58", False), ("dne", False)):
            self.assertEqual(serve.unit_correct(u, serve.signature(u, text)), ok, text)
        e = {"type": "expr", "answer": "x/3", "points": [1, 2, 3]}
        self.assertTrue(serve.unit_correct(e, serve.signature(e, "0.33334x")))   # per point value, not per coefficient
        self.assertFalse(serve.unit_correct(e, serve.signature(e, "0.333x")))
        self.assertTrue(serve.unit_correct({"type": "num", "answer": "0"}, 0.0))       # zero: exact (tol) only

    def test_pick_all_fix(self):                                                # prove mode: X'd rows carry a graded fix
        for bad in ({"choices": ["a", "c"]}, {"choices": ["a", "c"], "fixes": {"b": "10"}},
                    {"choices": ["a", "c"], "fixes": {"b": "10", "d": " "}}, {"choices": ["a", "c"], "fixes": {"b": "10", "d": "16", "a": "1"}},
                    {"choices": ["a", "c"], "fixes": {"b": "10", "d": "2+"}}):
            self.assertEqual(self.g("CSCI26_A8F", "f1", **bad)["verdict"], "invalid", bad)   # not a try
        r = self.g("CSCI26_A8F", "f1", choices=["a", "c"], fixes={"b": "20", "d": "16"})     # right set, b's fix is a known wrong
        self.assertEqual((r["verdict"], r["triesLeft"], r["fixWrong"], r["error"]), ("wrong", 1, "b", "counting"))
        self.assertTrue(self.g("CSCI26_A8F", "f1", choices=["c", "a"], fixes={"b": "20.0", "d": "16"})["repeat"])
        r = self.g("CSCI26_A8F", "f1", choices=["a", "c"], fixes={"b": "10", "d": "12"})     # d's fix: no known wrong, fix nudge
        self.assertEqual((r["verdict"], r["triesLeft"], r["fixWrong"], r["hint"]), ("wrong", 0, "d", serve.FIX_NUDGE))
        self.assertNotIn("error", r)
        r = self.g("CSCI26_A8F", "f2", choices=["a"], fixes={"b": "10", "c": "5", "d": "16"})  # set wrong: set hint, fixes not graded
        self.assertEqual((r["verdict"], r["error"]), ("wrong", "incomplete"))
        self.assertNotIn("fixWrong", r)
        self.assertEqual(self.g("CSCI26_A8F", "f2", choices=["a", "c"], fixes={"b": "10", "d": "2^4"})["verdict"], "correct")
        self.assertEqual(serve.public(BANK["CSCI26_A8F"])["fix"], {"type": "num", "how": "whole number"})

    def test_modes(self):                                                       # design/EASY.md
        a7k, a8f = BANK["CSCI26_A7K"], BANK["CSCI26_A8F"]
        none_key = dict(a7k, code="CSCI26_N0N", correct=["e"], wrong=[w for w in a7k.get("wrong", []) if w.get("choice") != "e"])
        self.assertEqual([serve.mode_of(c) for c in ("", "sid=x; stem-mode=diet", "stem-mode=hard", "stem-mode=sugar")], ["sugar", "diet", "diet", "sugar"])
        for mode in ("sugar", "diet"):                                           # None of these is gone in both
            v = serve.view(a7k, mode)
            self.assertNotIn("e", [c["id"] for c in v["choices"]], mode)
            self.assertEqual((v["pick"], v["tries"]), ("all", serve.max_tries(a7k)))
            self.assertNotIn("lock", str(serve.public(v, "m1")["choices"]))
        self.assertTrue(serve.hidden(none_key, "sugar"))                         # None as the key: hidden in easy
        self.assertFalse(serve.hidden(none_key, "diet") or serve.hidden(a7k, "sugar"))
        hv = serve.view(none_key, "diet")                                       # hard: the empty set is the answer
        self.assertEqual(hv["correct"], [])
        self.assertEqual(serve.grade(hv, "m2", {"choices": []})["verdict"], "correct")
        self.assertEqual(serve.grade(hv, "m3", {"choices": ["a"]})["verdict"], "wrong")
        ev = serve.view(a8f, "sugar")                                            # easy: no prove mode, no fix boxes
        self.assertNotIn("fix", serve.public(ev))
        self.assertEqual(serve.grade(ev, "m4", {"choices": ["a", "c"]})["verdict"], "correct")
        self.assertNotIn("fix", serve.public(serve.view(a8f, "diet")))        # no prove mode in diet either (Tony, Oct 3)
        self.assertEqual(serve.view(BANK["CALC1_X2P"], "sugar"), BANK["CALC1_X2P"])  # a plain mc is untouched

    def test_number_forms(self):                                                # hard fix boxes: how people type 1.07 x 10^14
        u = {"type": "num", "answer": "1.07e14"}
        for t in ("1.07e14", "1.07E14", "1.07x10^14", "1.07 X 10^14", "1.07*10^14", "1.07×10^14", "1.07·10^14", "1.07 10^14",
                  "+1.07e+14", "107000000000000", "107 000 000 000 000"):
            self.assertAlmostEqual(serve.signature(u, t), 1.07e14, delta=1e3, msg=t)
        self.assertAlmostEqual(serve.signature(u, "10^4"), 1e4)

    def test_fix_sig_figs(self):                                                # 1 unit of slack in the last asked-for figure
        u = {"type": "num", "answer": "15.588", "how": "4 sig figs", "fixbox": True}
        for t, ok in (("15.59", True), ("15.58", True), ("15.60", True), ("15.61", False), ("15.57", False), ("1.559 x 10^1", True)):
            self.assertEqual(serve.unit_correct(u, serve.signature(u, t)), ok, t)
        u3 = dict(u, how="3 sig figs")
        for t, ok in (("15.6", True), ("15.5", True), ("15.7", True), ("15.4", False)):
            self.assertEqual(serve.unit_correct(u3, serve.signature(u3, t)), ok, t)
        self.assertEqual(serve.figures({"sf": 2, "how": "4 sig figs"}), 2)
        self.assertEqual(serve.figures({"how": "whole number"}), 4)

    def test_text(self):
        r = self.g("CSCI26_Q8C", "t1", answer="q -> p")
        self.assertEqual((r["verdict"], r["error"]), ("wrong", "fallacy"))
        self.assertEqual(self.g("CSCI26_Q8C", "t1", answer="  ")["verdict"], "invalid")
        self.assertEqual(self.g("CSCI26_Q8C", "t1", answer="~Q->~P")["verdict"], "correct")   # case + spaces ignored
        self.assertEqual(self.g("CSCI26_Q8C", "t2", answer="¬q → ¬p")["verdict"], "correct")  # accept list

    def test_multi_is_graded_per_part(self):
        r = self.g("CSCI26_M5V", "m1", part=0, answer="17")
        self.assertEqual((r["verdict"], r["triesLeft"], r["error"], r["part"]), ("wrong", 1, "counting", 0))
        self.assertTrue(self.g("CSCI26_M5V", "m1", part=0, answer="17.0")["repeat"])          # same value again: a repeat, no try spent
        self.assertEqual(self.g("CSCI26_M5V", "m1", part=1, answer="11")["verdict"], "correct")   # b is right on its own
        r = self.g("CSCI26_M5V", "m1", part=0, answer="14")
        self.assertEqual((r["verdict"], r["part"]), ("correct", 0))
        self.assertEqual(self.g("CSCI26_M5V", "m1", part=1, answer="11")["verdict"], "locked")     # a part that is done stays done
        for bad in ({"parts": ["14", "11"]}, {"answer": "14"}, {"part": 2, "answer": "1"}, {"part": -1, "answer": "1"},
                    {"part": "0", "answer": "14"}, {"part": True, "answer": "14"}, {"part": 0.0, "answer": "14"}):
            self.assertEqual(self.g("CSCI26_M5V", "m9", **bad)["verdict"], "invalid", bad)   # the old whole-set body is refused
        self.assertEqual(self.g("CSCI26_M5V", "m9", part=0, answer="x+")["verdict"], "invalid")   # unreadable: not a try
        self.assertEqual(self.g("CSCI26_M5V", "m9", part=0, answer="")["verdict"], "invalid")
        self.assertEqual(self.g("CSCI26_M5V", "m9", part=0, answer="14")["verdict"], "correct")

    def test_multi_lockout_is_per_part(self):
        self.assertEqual(self.g("CSCI26_M5V", "m2", part=1, answer="14")["triesLeft"], 1)          # b: known wrong answer, hint of b's entry
        r = self.g("CSCI26_M5V", "m2", part=1, answer="10")
        self.assertEqual((r["verdict"], r["triesLeft"], r["part"]), ("wrong", 0, 1))
        self.assertIn("hint", r)
        self.assertNotIn("error", r)                                                                # no wrong entry matched: the problem nudge
        self.assertEqual(self.g("CSCI26_M5V", "m2", part=1, answer="11")["verdict"], "locked")     # b is locked, even for the right answer
        r = self.g("CSCI26_M5V", "m2", part=0, answer="14")                                        # a is untouched
        self.assertEqual((r["verdict"], r["triesLeft"]), ("correct", 2))
        self.assertEqual(self.g("CSCI26_M5V", "m3", part=0, answer="1")["triesLeft"], 1)          # another browser starts fresh
        self.assertEqual(self.g("CSCI26_M5V", "m3", part=1, answer="1")["triesLeft"], 1)          # and part a's tries are not part b's

    def test_multi_hint_is_the_parts_own(self):
        self.assertEqual(self.g("CSCI26_M5V", "m4", part=0, answer="14.5")["hint"], BANK["CSCI26_M5V"]["nudge"])
        self.assertIn("overlap twice", self.g("CSCI26_M5V", "m4", part=0, answer="17")["hint"])
        self.assertIn("Exactly one", self.g("CSCI26_M5V", "m4", part=1, answer="14")["hint"])
        self.assertIn("Exactly one", self.g("CSCI26_M5V", "m5", part=1, answer="14")["hint"])
        self.assertNotIn("overlap twice", self.g("CSCI26_M5V", "m5", part=1, answer="17")["hint"])   # a's entry does not apply to b

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
                    if p.get("pick") == "all":            # pick all: the right set, sent in shuffled order
                        fx = {w["choice"]: w["fix"]["answer"] for w in p["wrong"] if "fix" in w and w["choice"] in order}
                        r = serve.grade(p, f"{sid}-{pos}", {"choices": [c for c in order if c in p["correct"]], **({"fixes": fx} if "fix" in p else {})})
                        self.assertEqual(r["verdict"], "correct", (code, sid))
                        break
                    r = serve.grade(p, f"{sid}-{pos}", {"choice": cid})
                    self.assertEqual(r["verdict"], "correct" if cid == p["correct"] else "wrong", (code, sid, pos))

    def test_reply_never_has_the_answer(self):
        for code, p in BANK.items():
            for body in ({"answer": "0"}, {"choice": "a"}, {"answer": "1"}, {"choice": "c"}, {"parts": ["1", "2"]}):
                r = serve.grade(p, "leak-" + code, body)       # keys, not text: the verdict value "correct" is fine
                for k in ("answer", "correct", "points"):
                    self.assertNotIn(k, r)
                self.assertNotIn(json.dumps(p.get("answer", "\u0000")), json.dumps(r))

    def test_public_strips_keys(self):
        for p in BANK.values():
            pub = serve.public(p)
            self.assertFalse({"answer", "accept", "points", "tol", "correct", "wrong", "nudge"} & set(pub), p["code"])
            self.assertNotIn("answer", json.dumps(pub.get("parts", [])))

    def test_part_prompt_is_public(self):
        multi = [p for p in BANK.values() if p["type"] == "multi" and any("prompt" in u for u in p["parts"])]
        self.assertTrue(multi, "no multi problem carries a part prompt")
        for p in multi:
            pub = serve.public(p)
            self.assertEqual([u.get("prompt") for u in pub["parts"]], [u.get("prompt") for u in p["parts"]])
            for u in pub["parts"]:
                self.assertFalse({"answer", "accept", "points", "tol", "wrong"} & set(u), p["code"])
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
        for path in ["problems.json", "serve.py", "deploy.sh", "tests/test_serve.py", "tools/bundle.py", ".git/HEAD", "p/NOPE_ZZZ.json",
                     "banks/.gitkeep", "b/BANK_NOPE.json"]:
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

    def get(self, path, cookie):
        return json.load(urllib.request.urlopen(urllib.request.Request(self.base + path, headers={"Cookie": cookie})))

    def test_no_last_bank_is_null(self):
        self.assertIsNone(self.get("b/last.json", "sid=" + "cd" * 16))

    def test_state_endpoint(self):
        cookie = "sid=" + "ab" * 16
        s0 = self.get("state/CALC1_T6B", cookie)
        self.assertEqual((s0["wrong"], s0["done"]), (0, False))
        r = urllib.request.urlopen(urllib.request.Request(
            self.base + "check", data=json.dumps({"code": "CALC1_T6B", "answer": "5"}).encode(), method="POST",
            headers={"Content-Type": "application/json", "Cookie": cookie}))
        g = json.load(r)["gen"]
        s1 = self.get("state/CALC1_T6B", cookie)
        self.assertEqual((s1["wrong"], s1["done"], s1["gen"]), (1, False, g))
        self.assertEqual(set(s1), {"wrong", "done", "gen"})
        self.assertEqual(self.status("state/NOPE_ZZZ"), 404)
        self.assertEqual(self.status("tries.json"), 404)


class Persist(unittest.TestCase):
    """tries.json: a restart keeps tries; deleting an entry by hand resets it with a newer gen (design/DONE.md)."""
    def setUp(self):
        self.old = serve.TRIES
        serve.TRIES = os.path.join(tempfile.mkdtemp(prefix="stem-p-"), "tries.json")

    def tearDown(self):
        serve.TRIES = self.old

    def restart(self):
        serve._gen["loaded"] = None     # what a new process does: read the file again

    def test_restart_keeps_tries(self):
        p = BANK["CALC1_T6B"]
        self.assertEqual(serve.grade(p, "r1", {"answer": "5"})["verdict"], "wrong")
        self.restart()
        self.assertEqual(serve.state(p, "r1")["wrong"], 1)
        self.assertEqual(serve.grade(p, "r1", {"answer": "5"}).get("repeat"), True)   # the old signature survived
        self.assertEqual(serve.grade(p, "r1", {"answer": "6"})["verdict"], "wrong")
        self.restart()
        self.assertEqual(serve.grade(p, "r1", {"answer": "9"})["verdict"], "locked")

    def test_multi_part_round_trip(self):
        p = next(q for q in BANK.values() if q["type"] == "multi")        # per-part entries: "sid CODE i"
        body = {"part": 1, "answer": "12345"}
        self.assertEqual(serve.grade(p, "r2", body)["verdict"], "wrong")
        self.restart()
        self.assertTrue(serve.grade(p, "r2", body).get("repeat"))
        st = serve.state(p, "r2")["parts"]
        self.assertEqual([x["wrong"] for x in st], [0, 1] + [0] * (len(p["parts"]) - 2))

    def test_hand_delete_resets_with_newer_gen(self):
        p = BANK["CALC1_T6B"]
        g = serve.grade(p, "r3", {"answer": "5"})["gen"]
        serve.grade(p, "r3", {"answer": "6"})
        with open(serve.TRIES) as f:
            data = json.load(f)
        del data["tries"]["r3 CALC1_T6B"]
        with open(serve.TRIES, "w") as f:
            json.dump(data, f)
        self.restart()
        s = serve.state(p, "r3")
        self.assertEqual(s["wrong"], 0)
        self.assertGreater(s["gen"], g)

    def test_lost_file_gen_is_low(self):
        p = BANK["CALC1_T6B"]
        for i in range(3):
            serve.grade(p, f"o{i}", {"answer": "5"})
        g = serve.grade(p, "r4", {"answer": "5"})["gen"]
        os.remove(serve.TRIES)
        self.restart()
        self.assertLessEqual(serve.state(p, "r4")["gen"], g)     # page keeps its lock: not a reset


if __name__ == "__main__":
    unittest.main()


class Banks(unittest.TestCase):
    """Practice banks (design/BANK.md): banks/BANK_XXX.json, payload, marks, the last-bank pointer, blocked from serving."""
    def setUp(self):
        self.old = serve.BANKS, serve.TRIES
        serve.BANKS = tempfile.mkdtemp(prefix="stem-b-")
        serve.TRIES = os.path.join(tempfile.mkdtemp(prefix="stem-bt-"), "tries.json")
        codes = ["CALC1_T6B", "CALC1_A9R", "CALC1_X2P"]
        self.write("BANK_AB12", {"v": 1, "problems": [BANK[c] for c in codes] + [
            {"code": "CALC1_ZB1", "type": "num", "answer": "2", "body": [{"type": "text", "md": "1 + 1"}]}]})
        with open(os.path.join(serve.BANKS, "notabank.json"), "w") as f:
            f.write("{")

    def tearDown(self):
        serve.BANKS, serve.TRIES = self.old

    def write(self, name, data):
        with open(os.path.join(serve.BANKS, name + ".json"), "w") as f:
            json.dump(data, f)

    def test_formula_card_and_keys_stay_server_side(self):                    # design/EASY.md
        self.write("formula-sheet", {"v": 1, "groups": [{"name": "Work and Energy", "rows": [{"id": "WE_THM", "tex": "W = \\Delta K"}]}]})
        p = dict(BANK["CALC1_X2P"], code="CALC1_FK1", part=["WE_THM", "NOPE"], key="Use: $W = \\Delta K$", slip={"a": "sign"}, tip="Add the areas.")
        self.write("BANK_FK12", {"v": 1, "problems": [p]})
        self.assertNotIn("formula-sheet", serve.banks())                       # the sheet is not a bank
        easy = serve.public(serve.view(serve.problems()["CALC1_FK1"], "sugar"), "f1")
        self.assertEqual(easy["formulas"], [{"id": "WE_THM", "group": "Work and Energy", "tex": "W = \\Delta K"}])   # unknown id skipped
        self.assertEqual(easy["tip"], "Add the areas.")
        hard = serve.public(serve.view(serve.problems()["CALC1_FK1"], "diet"), "f1")
        self.assertFalse({"formulas", "tip"} & set(hard))
        for out in (easy, hard, *serve.bank_payload("BANK_FK12", "f2", "sugar")["problems"]):
            self.assertFalse({"key", "slip", "part", "correct", "wrong"} & set(out), out.keys())

    def test_saccharine_block_and_narration(self):                             # schema v2: one block, diet untouched
        self.write("formula-sheet", {"v": 1, "groups": [{"name": "Work and Energy", "rows": [{"id": "WE_THM", "tex": "W = \\Delta K"}]}]})
        p = dict(BANK["CALC1_X2P"], code="CALC1_SB1", title="Original", saccharine={"title": "Practice Exam 2, Question 7: mass doubled",
                 "tip": "Add the areas.", "part": ["WE_THM"], "key": "Answer: b) 3", "slip": {"a": "sign"}, "narration": "POOF. Three."})
        self.write("BANK_SB12", {"v": 1, "problems": [p]})
        raw = serve.problems()["CALC1_SB1"]
        sw, dt = serve.public(serve.view(raw, "sugar"), "n1"), serve.public(serve.view(raw, "diet"), "n1")
        self.assertEqual((sw["title"], sw["tip"], [f["id"] for f in sw["formulas"]]), ("Practice Exam 2, Question 7: mass doubled", "Add the areas.", ["WE_THM"]))
        self.assertEqual(dt["title"], "Original")
        self.assertFalse({"tip", "formulas", "saccharine"} & set(dt))
        for out in (sw, dt):
            self.assertNotIn("saccharine", json.dumps(out)); self.assertNotIn("Three", json.dumps(out))
        self.assertEqual(serve.explain_prompt(raw, "a").count("Answer: b) 3"), 1)
        st, _, data = serve.dispatch("POST", "/narrate", "", json.dumps({"code": "CALC1_SB1"}).encode())
        self.assertEqual((st, json.loads(data)["text"]), (200, "POOF. Three."))
        self.assertEqual(json.loads(serve.dispatch("POST", "/narrate", "stem-mode=diet", json.dumps({"code": "CALC1_SB1"}).encode())[2])["text"], "")
        self.assertTrue(sw["wish"]); self.assertNotIn("wish", dt)

    def test_payload(self):
        b = serve.bank_payload("BANK_AB12", "s1")
        self.assertEqual([p["code"] for p in b["problems"]], ["CALC1_T6B", "CALC1_A9R", "CALC1_X2P", "CALC1_ZB1"])
        self.assertEqual((b["code"], b["marks"], b["at"]), ("BANK_AB12", {}, None))
        for p in b["problems"]:
            self.assertFalse({"answer", "accept", "correct", "wrong", "nudge"} & set(p), p["code"])
        self.assertIsNone(serve.bank_payload("BANK_NOPE", "s1"))
        self.assertNotIn("NOTABANK", serve.banks())

    def test_bank_problem_grades(self):
        self.assertEqual(serve.grade(serve.problems()["CALC1_ZB1"], "s2", {"answer": "2"})["verdict"], "correct")

    def test_marks(self):
        serve.grade(serve.problems()["CALC1_T6B"], "s3", {"answer": "4"})
        serve.grade(serve.problems()["CALC1_ZB1"], "s3", {"answer": "2"})
        m = serve.bank_payload("BANK_AB12", "s3")["marks"]
        self.assertEqual(m, {"CALC1_T6B": {"x": 1, "done": "open"}, "CALC1_ZB1": {"x": 0, "done": "correct"}})

    def test_last_and_at(self):
        self.assertIsNone(serve.bank_payload("last", "s4"))
        serve.bank_payload("BANK_AB12", "s4")
        serve.seen("CALC1_X2P", "s4")
        serve.seen("PHYS_F3N", "s4")                     # not in the bank: the place stays
        serve._gen["loaded"] = None                      # a restart: read tries.json again
        b = serve.bank_payload("last", "s4")
        self.assertEqual((b["code"], b["at"]), ("BANK_AB12", "CALC1_X2P"))
        self.assertIsNone(serve.bank_payload("last", "other"))

    def test_bank_gone(self):
        serve.bank_payload("BANK_AB12", "s5")
        os.remove(os.path.join(serve.BANKS, "BANK_AB12.json"))
        self.assertIsNone(serve.bank_payload("last", "s5"))
        self.assertNotIn("CALC1_ZB1", serve.problems())

    def test_broken_file_keeps_last_good(self):
        self.assertIn("CALC1_ZB1", serve.problems())
        path = os.path.join(serve.BANKS, "BANK_AB12.json")
        with open(path, "w") as f:
            f.write("{ broken")
        os.utime(path, (1, 1))
        self.assertIn("CALC1_ZB1", serve.problems())
        self.assertEqual(len(serve.banks()["BANK_AB12"]), 4)

    def test_duplicate_code_first_wins(self):
        other = dict(BANK["CALC1_T6B"], answer="999")
        self.write("BANK_CD34", {"v": 1, "problems": [other]})
        self.assertEqual(serve.problems()["CALC1_T6B"]["answer"], BANK["CALC1_T6B"]["answer"])   # problems.json first
        self.assertEqual(serve.banks()["BANK_CD34"], ["CALC1_T6B"])

    def test_banks_dir_blocked(self):
        self.assertIn("/banks/", serve.BLOCK_PREFIX)
        self.assertIsNone(serve.BANK_PATH.match("/b/../banks/BANK_AB12.json"))
        self.assertIsNone(serve.BANK_PATH.match("/b/bank_ab12.json"))


class Explain(unittest.TestCase):
    """Cluck the genie (design/EASY.md Phase 4): /explain relays a stubbed OpenRouter stream; ZDR, caps, easy only, no markdown."""
    def setUp(self):
        import http.server
        import threading
        seen = self.seen = []

        class Stub(http.server.BaseHTTPRequestHandler):
            def do_POST(self):
                seen.append((self.headers.get("Authorization"), json.loads(self.rfile.read(int(self.headers["Content-Length"])))))
                self.send_response(200)
                self.send_header("Content-Type", "text/event-stream")
                self.end_headers()
                for piece in ["POOF! **Use:** $v$\n", "- step one\n", "Your pick: sign."]:
                    self.wfile.write(f"data: {json.dumps({'choices': [{'delta': {'content': piece}}]})}\n\n".encode())
                self.wfile.write(b"data: [DONE]\n\n")

            def log_message(self, *a):
                pass
        self.srv = http.server.HTTPServer(("127.0.0.1", 0), Stub)
        threading.Thread(target=self.srv.serve_forever, daemon=True).start()
        self.old = serve.BANKS, serve.OPENROUTER_BASE, os.environ.get("OPENROUTER_API_KEY")
        serve.BANKS = tempfile.mkdtemp(prefix="stem-x-")
        serve.OPENROUTER_BASE = f"http://127.0.0.1:{self.srv.server_address[1]}"
        os.environ["OPENROUTER_API_KEY"] = "sk-test"
        p = dict(BANK["CALC1_X2P"], code="CALC1_XP1", key="Use: $W = \\Delta K$\nAnswer: b) 3", slip={"a": "Dropped the sign."})
        with open(os.path.join(serve.BANKS, "BANK_XP12.json"), "w") as f:
            json.dump({"v": 1, "problems": [p]}, f)
        serve._asked.clear()

    def tearDown(self):
        self.srv.shutdown()
        serve.BANKS, serve.OPENROUTER_BASE, key = self.old
        if key is None:
            os.environ.pop("OPENROUTER_API_KEY", None)
        else:
            os.environ["OPENROUTER_API_KEY"] = key

    def ask(self, cookie="sid=" + "a" * 32, **body):
        status, head, chunks = serve.explain(cookie, json.dumps({"code": "CALC1_XP1", "answer": "a", **body}).encode())
        return status, b"".join(chunks).decode()

    def test_streams_plain_text_with_zdr_and_the_key(self):
        status, text = self.ask()
        self.assertEqual(status, 200)
        self.assertEqual(text, "POOF! Use: $v$\nstep one\nYour pick: sign.")          # no ** and no bullet
        auth, req = self.seen[0]
        self.assertEqual(auth, "Bearer sk-test")
        self.assertEqual(req["provider"], {"zdr": True, "data_collection": "deny"})
        self.assertEqual(req["models"], serve.OPENROUTER_MODELS)
        self.assertTrue(req["stream"])
        user = req["messages"][1]["content"]
        self.assertIn("Answer: b) 3", user)
        self.assertIn("Dropped the sign.", user)

    def test_easy_only_key_needed_and_caps(self):
        self.assertEqual(self.ask(cookie="stem-mode=hard")[0], 404)                   # hard mode: no genie
        os.environ.pop("OPENROUTER_API_KEY")
        self.assertEqual(self.ask()[0], 503)
        os.environ["OPENROUTER_API_KEY"] = "sk-test"
        sid = "sid=" + "b" * 32
        for _ in range(serve.AUTO_PER_HOUR):
            self.assertEqual(self.ask(cookie=sid, auto=True)[0], 200)
        self.assertEqual(self.ask(cookie=sid, auto=True)[0], 429)                     # 6th auto in an hour: the student asks
        self.assertEqual(self.ask(cookie=sid)[0], 200)                                # asking still works
        for i in range(serve.ANY_PER_HOUR):
            serve.explain_allowed("y", False, now=1000)
        self.assertFalse(serve.explain_allowed("y", False, now=1000))
        self.assertTrue(serve.explain_allowed("y", False, now=1000 + 3601))           # an hour later
