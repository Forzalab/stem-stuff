"""tools/tol.py: the wiggle test (tolerance 1b, SCHEMA.md tol_why)."""
import contextlib
import importlib.util
import io
import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "tools"))
import tol  # noqa: E402


class Wiggle(unittest.TestCase):
    def test_wiggles(self):
        w = tol.wiggles("2.65*2*pi*9.8^2+log10(3.0)")
        self.assertIn("2.65*2*pi*9.81^2+log10(3.0)", w)               # g
        self.assertIn("2.65*2*3.14*9.8^2+log10(3.0)", w)               # pi
        self.assertIn("2.66*2*pi*9.8^2+log10(3.0)", w)                 # a decimal datum +1 in its last digit
        self.assertIn("2.65*2*pi*9.8^2+log10(2.9)", w)
        self.assertFalse(any("*3*pi" in x or "*1*pi" in x for x in w))   # integers are exact (Tony, Oct 23)
        self.assertFalse(any("^3" in x for x in w))                     # exponents stay

    def test_definitive(self):
        self.assertTrue(tol.definitive("0"))                            # PHYS_8X3: 0 by symmetry
        self.assertFalse(tol.definitive("8.3446"))                      # a folded key
        self.assertTrue(tol.definitive("10+7-3"))                       # counting: integers are exact
        self.assertTrue(tol.definitive("5*4*3*2*1/2"))
        self.assertFalse(tol.definitive("2*1.2*0.0125*0.0125*(2.65*2*pi)"))   # PHYS_EX9
        self.assertFalse(tol.definitive("pi/3"))                        # pi 3.14 moves it
        self.assertTrue(tol.definitive("sin(0*pi)"))

    def test_warnings(self):
        bank = {"problems": [{"code": "A", "type": "num", "answer": "14", "form": "10+7-3"},
                             {"code": "B", "type": "num", "answer": "2.5", "form": "5.0/2"},
                             {"code": "C", "type": "num", "answer": "3", "tol": 1e-4}]}
        w = tol.warnings(bank, "b.json")
        self.assertEqual(len(w), 2)
        self.assertIn("b.json: 2 num unit(s) with no tol at any level", w[0])
        self.assertIn("A: integer key, integer inputs, no tol", w[1])
        self.assertEqual(tol.warnings({**bank, "tol": 0.01}, "b.json"), [w[1]])   # a bank tol silences the bank line, not the off-by-one one

    def test_write_keeps_author_tol(self):
        bank = {"problems": [{"code": "A", "type": "num", "answer": "0", "form": "0"},
                             {"code": "B", "type": "num", "answer": "1", "form": "1", "tol": 0.01},
                             {"code": "C", "type": "num", "answer": "2.5", "form": "5.0/2"}]}
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "b.json")
            with open(path, "w") as f:
                json.dump(bank, f)
            rows = tol.check(path, write=True)
            out = {p["code"]: p for p in json.load(open(path))["problems"]}
        self.assertEqual((out["A"]["tol"], out["A"]["tol_why"]), (tol.EXACT, tol.WHY))
        self.assertEqual((out["B"]["tol"], "tol_why" in out["B"]), (0.01, False))
        self.assertEqual((out["C"]["tol"], out["C"]["tol_src"]), (0.005, "auto"))      # todo 32 (b): 5.0/2 is not definitive -> nested-wiggle floor 0.5% (was 2%)
        self.assertEqual(rows[:2], ["  A: definitive -> tol 0.0001", "  B: author tol 0.01"])
        self.assertTrue(rows[2].startswith("  C: auto tol 0.005 (E 0.00%"), rows[2])
        self.assertEqual(rows[3:], [])                                  # every unit now has a tol: no NO_TOL line


class Levels(unittest.TestCase):                                        # todo 32 (a): question > topic > bank > 2%
    def test_topic_tol_silences_no_tol(self):
        bank = {"topics": {"kin": {"tol": 0.01, "tol_why": "kinematics"}},
                "problems": [{"code": "A", "type": "num", "answer": "2.5", "form": "5.0/2", "topic": "kin"},
                             {"code": "B", "type": "num", "answer": "2.5", "form": "5.0/2"}]}
        w = tol.warnings(bank, "b.json")
        self.assertEqual(w, ["  WARN b.json: 1 num unit(s) with no tol at any level: set tol for this bank, topic or question (default 2% applies)"])
        bank["problems"][1]["topic"] = "kin"
        self.assertEqual(tol.warnings(bank, "b.json"), [])
        self.assertEqual(tol.topic_tol(bank, bank["problems"][0]), 0.01)
        self.assertIsNone(tol.topic_tol({"topics": {"kin": {"tol": 0.5}}}, {"topic": "kin"}))   # out of range: ignored

    def test_author_level_beats_auto(self):                             # Q4: an author tol at any level beats tol_src auto
        bank = {"tol": 0.01, "topics": {"kin": {"tol": 0.008, "tol_why": "x"}},
                "problems": [{"code": "A", "type": "num", "answer": "2.5", "form": "5.0/2", "topic": "kin",
                              "tol": 0.005, "tol_why": "old auto", "tol_src": "auto"},
                             {"code": "B", "type": "num", "answer": "2.5", "form": "5.0/2"},
                             {"code": "P3Q", "type": "num", "answer": "9.8*(sin(30 deg) - 0.2*cos(30 deg))",
                              "form": "9.8*(sin(30*pi/180)-0.2*cos(30*pi/180))", "tol": 0.01}]}
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "b.json")
            with open(path, "w") as f:
                json.dump(bank, f)
            rows = tol.check(path, write=True, log=[])
            out = {p["code"]: p for p in json.load(open(path))["problems"]}
        self.assertEqual(rows[:3], ["  A: topic tol 0.008", "  B: bank tol 0.01", "  P3Q: author tol 0.01"])
        self.assertNotIn("tol", out["A"])                               # the stale auto tol is removed: the topic's author tol wins
        self.assertNotIn("tol", out["B"])
        self.assertEqual((out["P3Q"]["tol"], "tol_src" in out["P3Q"]), (0.01, False))   # Tony: the author 0.01 stays


class Nested(unittest.TestCase):                                        # todo 32 (b): nested-wiggle auto tol
    def test_fraction_site_q1(self):
        r = tol.nested("1/((4/3)^2+(1/3)^2+(2/3)^2)", 9 / 21)
        self.assertGreater(r["E"], 0.003)                               # 4/3 -> 1.33 (Q1) moves the key past 3 s.f.
        self.assertEqual(r["sites"], 4)
        self.assertIn("SF2", r["flags"])                                # a 2 s.f. student is reported (Q3), never passed
        self.assertEqual(r["tol"], 0.005)
        self.assertEqual(tol.nested("12/(100+200+300)", 0.02)["E"], 0.0)  # terminating exact values: no site

    def test_degree_mode_and_cap(self):
        r = tol.nested("2*9.81*cos(60*pi/180)/(1/2)", 19.62)
        self.assertEqual(r["E"], 0.0)                                   # x*pi/180 in trig is exact (the 24% artifact)
        self.assertEqual(r["worlds"], 2)                                # g 9.8 / 9.81, no pi world inside degree mode
        self.assertLess(r["cap"], 0.01)                                 # g=10 is a slip 1.9% away (Q6): cap = half the gap
        f = "(1.234+5.678)^0.5*sqrt(9.81)-7.9"
        r = tol.nested(f, tol.slips.value(f))
        self.assertEqual(r["tol"], 0.02)
        self.assertIn("CAP", r["flags"])                                # ill-conditioned: warn, never block (Q5)
        self.assertIsNone(tol.nested("0", 0.0))                         # zero key: absolute 1e-9 anyway

    def test_slip_never_inside(self):
        for f in ("2.0*9.8*sin(25*pi/180)/150", "sqrt(2.0*9.8*1.5)", "atan(0.5)*2", "1-0.75", "2*9.81*cos(60*pi/180)/(1/2)"):
            k = tol.slips.value(f)
            t = tol.nested(f, k)["tol"]
            self.assertTrue(tol.EXACT <= t <= 0.02, f)
            self.assertFalse(any(abs(c - k) <= t * abs(k) for _, c in tol.slips.mutants(f) if not tol.slips._same(c, k)), f)


class Log(unittest.TestCase):                                           # todo 32 (c): every warning -> stdout + one JSONL line
    def test_log_jsonl(self):
        bank = {"problems": [{"code": "A", "type": "num", "answer": "14", "form": "10+7-3"},
                             {"code": "B", "type": "num", "answer": "2.0/((4/3)^2+(1/3)^2+(2/3)^2)", "form": "2.0/((4/3)^2+(1/3)^2+(2/3)^2)"}]}
        with tempfile.TemporaryDirectory() as d:
            path, logp = os.path.join(d, "b.json"), os.path.join(d, "w.jsonl")
            with open(path, "w") as f:
                json.dump(bank, f)
            buf = io.StringIO()
            with contextlib.redirect_stdout(buf):
                tol.main(["--log", logp, path])
                tol.main(["--log", logp, path])                         # appends
            lines = [json.loads(x) for x in open(logp)]
        self.assertEqual([x["kind"] for x in lines], ["SF2", "NO_TOL", "OFF_BY_ONE"] * 2)
        for x in lines:
            self.assertEqual(set(x), {"ts", "bank", "item", "kind", "tol", "E", "E2", "top_site", "note"})
            self.assertEqual(x["bank"], "b.json")
        sf2 = lines[0]
        self.assertEqual((sf2["item"], sf2["tol"]), ("B", 0.005))
        self.assertGreater(sf2["E2"], sf2["tol"])
        self.assertIn("WARN B: a 2 s.f. student misses", buf.getvalue())
        self.assertIn("WARN A: integer key", buf.getvalue())

    def test_default_path(self):
        old = os.environ.get("BRAIN")
        try:
            with tempfile.TemporaryDirectory() as d:
                os.environ["BRAIN"] = d
                self.assertEqual(str(tol.default_log()), "tol-warnings.jsonl")       # no brain dir: ./tol-warnings.jsonl
                os.makedirs(os.path.join(d, "projects", "calc", "_files"))
                self.assertEqual(str(tol.default_log()), os.path.join(d, "projects", "calc", "_files", "tol-warnings.jsonl"))
        finally:
            if old is None:
                os.environ.pop("BRAIN", None)
            else:
                os.environ["BRAIN"] = old
        self.assertEqual(tol.log_arg(["--no-log", "x.json"]), (None, ["x.json"]))

    def test_slips_cli_log_opt_in(self):
        here = os.path.dirname(os.path.abspath(__file__))
        spec = importlib.util.spec_from_file_location("tools_slips", os.path.join(here, "..", "tools", "slips.py"))
        ts = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(ts)
        bank = {"problems": [{"code": "A", "type": "num", "answer": "14", "form": "10+7-3"}]}
        with tempfile.TemporaryDirectory() as d:
            path, logp = os.path.join(d, "b.json"), os.path.join(d, "w.jsonl")
            with open(path, "w") as f:
                json.dump(bank, f)
            with contextlib.redirect_stdout(io.StringIO()):
                ts.main([path])
                self.assertFalse(os.path.exists(logp))                  # no --log: the gate never writes
                ts.main(["--log", logp, path])
            self.assertEqual([json.loads(x)["kind"] for x in open(logp)], ["NO_TOL", "OFF_BY_ONE"])


if __name__ == "__main__":
    unittest.main()
