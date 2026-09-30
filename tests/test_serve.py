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
