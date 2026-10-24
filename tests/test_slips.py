"""slips.py (design/HANDOFF-slips-v2.md unit A): the 10 slip families on small known forms, match(), the rule-7 gate, the golden fixture
shared with the JS port, and the tools/slips.py CLI (report exits 0, --strict on a broken v20261022 bank exits 1)."""
import contextlib
import importlib.util
import io
import json
import math
import os
import sys
import tempfile
import time
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
import slips  # noqa: E402

FIX = os.path.join(ROOT, "tests", "fixtures")
GOLD = "1/((4/3)^2+(1/3)^2+(2/3)^2)"
spec = importlib.util.spec_from_file_location("slips_cli", os.path.join(ROOT, "tools", "slips.py"))
cli = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cli)


def fam(form, name):
    return dict(slips.raw(form))[name]


class Families(unittest.TestCase):
    def eq(self, got, want):
        self.assertEqual(len(got), len(want), got)
        for g, w in zip(got, want):
            self.assertAlmostEqual(g, w, delta=1e-12 * max(1, abs(w)))

    def test_sign(self):         # whole -2; flip 5, flip -(2+1), flip 2, flip 1
        self.eq(fam("5-(2+1)", "sign"), [-8, -2, 4, 6, 8])

    def test_drop(self):
        self.eq(fam("5-(2+1)", "drop"), [-3, 3, 4, 5])

    def test_reciprocal(self):   # 1/whole; 6/3 -> 3/6
        self.eq(fam("1+6/3", "reciprocal"), [1 / 3, 1.5])

    def test_power(self):        # drop the root / the square; whole^2; sqrt(whole)
        self.eq(fam("sqrt(9+16)", "power"), [math.sqrt(5), 25])
        self.eq(fam("(3+4)^2", "power"), [7, 2401])

    def test_factor(self):
        self.eq(fam("3+4", "factor"), [3.5, 14])

    def test_distribute(self):   # the minus reaches the first term only (Tony, Oct 23: -(b+c) -> -b+c; S2 of review-227)
        self.eq(fam("10-(1+2+4)", "distribute"), [15])
        self.eq(fam("-2*(3+4)", "distribute"), [2])
        self.eq(fam("10-(4+1)", "distribute"), [7])          # written order: 10-4+1, not 10+4-1
        self.assertNotEqual(slips.match("10-(1+2+4)", 13, 1e-6), "distribute")   # 10-1-2+4: no habit, no distribute hint

    def test_dream(self):
        self.eq(fam("sqrt(9+16)", "dream"), [7])
        self.eq(fam("(3+4)^2", "dream"), [25])

    def test_trig(self):         # cos for sin; the argument read as degrees; read as radians
        self.eq(fam("sin(30*pi/180)", "trig"), [math.sin(30), math.sin(math.pi ** 2 / 1080), math.sqrt(3) / 2])

    def test_units(self):
        self.eq(fam("5", "units"), [0.005, 0.05, 500, 5000])

    def test_g(self):
        self.eq(fam("2*9.8*3", "g"), [60])
        self.eq(fam("9.81*2", "g"), [20])
        self.eq(fam("10*2", "g"), [])


class Mutants(unittest.TestCase):
    def test_order_and_dedupe(self):
        m = slips.mutants("5-(2+1)")
        self.assertEqual([f for f, _ in m], sorted((f for f, _ in m), key=slips.FAMILIES.index))
        vals = [v for _, v in m]
        self.assertEqual(len(vals), len(set(vals)))
        self.assertNotIn(("drop", 4.0), m)                      # 4 is a sign flip first

    def test_bad_values_skipped(self):
        for form in ("sqrt(1-4)", "1/(2-2)"):
            for _, v in slips.mutants(form):
                self.assertTrue(math.isfinite(v))
        for form in ("x", "foo(2)", "2(3+4)", "lambda: 1", "1 < 2", "'a'"):   # D4: a name or syntax outside the form grammar raises
            with self.assertRaises((ValueError, SyntaxError), msg=form):
                slips.mutants(form)

    def test_distribute_wins_a_tie_with_sign(self):  # Tony, Oct 22: 10-(3+2) typed 9 is the minus that reached one term
        self.assertEqual(slips.FAMILIES[0], "distribute")
        self.assertEqual(slips.match("10-(3+2)", 9, 1e-6), "distribute")

    def test_golden_sign(self):
        self.assertEqual(slips.match(GOLD, 0.692, 1e-6), "sign")
        self.assertIsNone(slips.match(GOLD, 0.3, 1e-6))
        self.assertEqual(slips.match("sqrt(9+16)", 7, 1e-6), "dream")

    def test_fixture(self):
        with open(os.path.join(FIX, "slips-golden.json"), encoding="utf-8") as f:
            gold = json.load(f)
        self.assertEqual({f for g in gold for f, _ in g["mutants"]}, set(slips.FAMILIES))
        for g in gold:
            got = slips.mutants(g["form"])
            self.assertEqual([f for f, _ in got], [f for f, _ in g["mutants"]], g["form"])
            for (_, a), (_, b) in zip(got, g["mutants"]):
                self.assertLessEqual(abs(a - b), 1e-9 * max(1, abs(b)), g["form"])


def shape(e):
    return (e.func.__name__, tuple(shape(a) for a in e.args)) if e.args else repr(e)


def same_mutants(test, got, want, form):
    """the parity rule both suites use: same families in the same order, each value within 1e-9 relative (0 only equals 0)"""
    test.assertEqual([f for f, _ in got], [f for f, _ in want], form)
    for (f, a), (_, b) in zip(got, want):
        test.assertLessEqual(abs(a - b), 1e-9 * abs(b), (form, f, a, b))


class Parser(unittest.TestCase):
    """D4 (todo 17): parse() is stdlib ast + a walker, the same tree parse_expr(..., evaluate=False) gave, except a unary minus on a
    bracket stays Mul(-1, x) (S3). The shared fixture slips-golden-banks.json pins both ports on every live bank form + corners."""

    def test_flattens_like_parse_expr(self):
        from sympy import parse_expr
        for f in ("1/2/3", "8/2*(2+2)", "(1+2)+3", "1-2-3", "10-2-(3+4)", "7-2*(2+3)", "5-(3+1)/2", "2*9.8*sin(30*pi/180)/150",
                  "2^-2", "-2^2", "-3+4", "1e3/(2+3)", "2.0*(3+4)", "atan(3/4)*180/pi", "sqrt(9+16)", "5*(-1+2-3+8)/14", "2^3^2"):
            self.assertEqual(shape(slips.parse(f)), shape(parse_expr(f.replace("^", "**"), evaluate=False)), f)
        self.assertEqual(shape(slips.parse("1/2/3")), ("Mul", ("1", ("Pow", ("2", "-1")), ("Pow", ("3", "-1")))))
        self.assertEqual([str(a) for a in slips.parse("1-2-3").args], ["1", "-1*2", "-1*3"])          # written order

    def test_unary_minus_keeps_the_bracket(self):   # S3: -(3+4) was a bare -7, so sign/drop/distribute lost its terms
        self.assertEqual(shape(slips.parse("-(3+4)")), ("Mul", ("-1", ("Add", ("3", "4")))))
        self.assertEqual(fam("-(3+4)", "distribute"), (1.0,))
        self.assertEqual(fam("-(3+4)", "drop"), (-4.0, -3.0))
        self.assertEqual(fam("-(3+4)*2", "distribute"), (2.0,))
        self.assertEqual(shape(slips.parse("-3")), "-3")                                                # a number still folds
        self.assertEqual(shape(slips.parse("-(-3)")), "3")

    def test_distribute_a_minus_k_bracket(self):   # S1 (review-227): a-k(b+c) is Mul(-1, Mul(k, b+c)); read the chain's coefficient
        self.assertEqual(fam("7-2*(2+3)", "distribute"), (9.0,))          # 7 - 4 + 6
        self.assertEqual(fam("5-(3+1)*2", "distribute"), (1.0,))          # 5 - 6 + 2
        self.assertEqual(fam("5-(3+1)/2", "distribute"), (4.0,))          # 5 - 3/2 + 1/2
        self.assertEqual(slips.match("7-2*(2+3)", 9), "distribute")
        self.assertEqual(fam("5+2*(3+1)", "distribute"), ())               # no minus, no distribute

    def test_float_vs_integer_literal(self):       # N1: "2.0" is a Float (sympy auto_number); only an exact coefficient distributes
        from sympy import Float, Integer
        self.assertIsInstance(slips.parse("2.0"), Float)
        self.assertIsInstance(slips.parse("1e3"), Float)
        self.assertIsInstance(slips.parse("12"), Integer)
        self.assertEqual(fam("-2.0*(3+4)", "distribute"), ())
        self.assertEqual(fam("-2*(3+4)", "distribute"), (2.0,))

    def test_tiny_constant_slips_stay_apart(self):   # EPS * max(1, |v|) merged every value under 1e-9 into one
        f = "6.67e-11*(3+2)/4"                          # = 8.3375e-11
        self.assertEqual(len(fam(f, "sign")), 3)
        self.assertEqual(len(fam(f, "drop")), 2)
        self.assertEqual(len([v for _, v in slips.mutants(f) if abs(v) < 1e-9]), 10)   # 3 sign, 2 drop, 1 power, 2 factor, 2 units
        self.assertTrue(slips._same(0.0, 0.0) and not slips._same(1e-20, 0.0) and slips._same(1 + 1e-12, 1))

    def test_golden_banks_fixture(self):
        """every live bank form is in the shared fixture (else: python3 tools/slips.py --golden) and slips.py still gives its values"""
        with open(os.path.join(FIX, "slips-golden-banks.json"), encoding="utf-8") as f:
            gold = json.load(f)
        have = {g["form"] for g in gold}
        self.assertEqual([f for f in cli.live_forms() if f not in have], [], "new bank form: run python3 tools/slips.py --golden")
        self.assertTrue(set(cli.CORNERS) <= have)
        for g in gold:
            same_mutants(self, slips.mutants(g["form"]), g["mutants"], g["form"])


class Gate(unittest.TestCase):
    def test_rules(self):
        self.assertEqual(slips.gate({"type": "num", "answer": "5", "form": "sqrt(9+16)"}), [])
        self.assertTrue(slips.gate({"type": "num", "answer": "5"})[0].startswith("NOFORM"))
        self.assertTrue(slips.gate({"type": "num", "answer": "0", "form": "4-4"})[0].startswith("SAME"))
        clash = slips.gate({"type": "num", "answer": "2", "form": "7-(2+3)"})
        self.assertTrue(clash and all(r.startswith("CLASH") for r in clash), clash)
        self.assertEqual(slips.gate({"type": "num", "answer": "2", "form": "7-(2+3)", "ignore_slips": ["4", "6", "8"]}), [])
        self.assertTrue(slips.gate({"type": "num", "answer": "6", "form": "2+3"})[0].startswith("form ="))

    def test_answer_read_like_the_grader(self):   # PHYS_F3N: answer "sin(30 deg)" crashed form_ok (SyntaxError) in --strict
        u = {"type": "num", "answer": "9.8*(sin(30 deg) - 0.2*cos(30 deg))", "tol": 0.01, "form": "9.8*(sin(30*pi/180)-0.2*cos(30*pi/180))"}
        self.assertIsNone(slips.form_ok(u))
        self.assertAlmostEqual(slips.value("3pi"), 3 * math.pi)

    def test_sign_distribute_no_clash(self):
        """-(b+c) -> -b+c is a sign flip of c by definition: sign + distribute alone on one value is no CLASH."""
        form = "20-(3+4)"
        shared = set(fam(form, "sign")) & set(fam(form, "distribute"))
        self.assertEqual(shared, {21.0})                        # the two families do land on the same value
        self.assertEqual(slips.gate({"type": "num", "answer": "13", "form": form}), [])
        clash = slips.gate({"type": "num", "answer": "2", "form": "7-(2+3)"})   # a real clash (drop / power on 4) still fails
        self.assertEqual(clash, ["CLASH 4  (drop / power) one value, two hints"])

    def test_xzp_fixture(self):  # the golden PHYS_XZP bank: 9/17 is drop and power at 3 s.f., so it is ignored; --strict passes
        with open(os.path.join(FIX, "slips-xzp.json"), encoding="utf-8") as f:
            u = json.load(f)["problems"][0]
        self.assertEqual(u["form"], GOLD)
        self.assertTrue(slips.gate({**u, "ignore_slips": []})[0].startswith("CLASH 0.5294"))
        self.assertEqual(slips.gate(u), [])
        self.assertEqual(slips.match(u["form"], 0.692, u["tol"]), "sign")

    def run_cli(self, *args):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            rc = cli.main(list(args))
        return rc, out.getvalue()

    def test_cli(self):
        self.assertEqual(self.run_cli()[0], 0)
        self.assertEqual(self.run_cli("--strict", os.path.join(FIX, "slips-good.json"))[0], 0)
        rc, out = self.run_cli("--strict", os.path.join(FIX, "slips-bad.json"))
        self.assertEqual(rc, 1)
        for w in ("NOFORM", "SAME", "CLASH"):
            self.assertIn(w, out)
        self.assertEqual(self.run_cli(os.path.join(FIX, "slips-bad.json"))[0], 0)   # report only without --strict

    def test_slip_window_d2(self):
        """Tony D2 (Oct 23): a slip's own window, SLIP_WIN = 0.5% or equal at 3 s.f., never the item's grading tol (2% default)."""
        self.assertEqual(slips.SLIP_WIN, 0.005)
        self.assertEqual(slips.match("1/((4/3)^2+(1/3)^2+(2/3)^2)", 0.532), "drop")     # 9/17 = 0.5294: 0.49% off
        self.assertIsNone(slips.match("12/(100+200+300)", 0.0609))                   # 0.06 (sign) is 1.5% off: a 2% window would hint it

    def test_close_parity_cases(self):
        """close() rounds a tie away from zero, like slips.mjs (tests/slips.test.mjs runs the same cases)."""
        with open(os.path.join(FIX, "slips-close.json"), encoding="utf-8") as f:
            for a, b, tol, want in json.load(f):
                self.assertEqual(slips.close(a, b, tol), want, (a, b))
                self.assertEqual(slips.close(b, a, tol), want, (b, a))

    def test_slow_form_rejected_fast(self):
        t0 = time.time()
        rc, out = self.run_cli("--strict", os.path.join(FIX, "slips-slow.json"))
        self.assertEqual(rc, 1)
        self.assertIn("SLOW", out)
        row = slips.gate({"type": "num", "answer": "5", "form": "10**10**10"})
        self.assertTrue(row and row[0].startswith("SLOW"), row)
        self.assertTrue(slips.slow("10**10**10") and slips.slow("2**(10**9)") and not slips.slow("2**10+sqrt(9+16)"))
        self.assertLess(time.time() - t0, 2)


class BadVersion(unittest.TestCase):
    """tools/slips.py reads v like serve.py _read: an int (1 or yyyymmdd) is used; a string or float v warns on stderr and reads as 1
    (no TypeError). Only an int >= CUTOFF runs the rule-7 gate, so a num with no form fails only for an int v."""
    NUM = {"code": "CALC1_BV1", "type": "num", "answer": "2", "body": [{"type": "text", "md": "1 + 1"}]}

    def bank(self, v_text):
        d = tempfile.mkdtemp(prefix="stem-slipsv-")
        path = os.path.join(d, "BANK_BV.json")
        with open(path, "w", encoding="utf-8") as f:
            f.write('{"v": %s, "problems": [%s]}' % (v_text, json.dumps(self.NUM)))
        return path

    def check(self, path):
        err = io.StringIO()
        with contextlib.redirect_stderr(err):
            bad, _ = cli.check(path)
        return bad, err.getvalue()

    def test_string_and_float_v_warn_and_read_as_one(self):
        for v_text, shown in (('"20261022"', "'20261022'"), ("20261022.0", "20261022.0")):
            path = self.bank(v_text)
            bad, err = self.check(path)
            self.assertEqual(bad, 0)                       # read as 1: old-bank rules, no form = skipped
            self.assertIn(path, err)
            self.assertIn(shown, err)
            self.assertIn("treated as 1", err)

    def test_int_v_runs_the_gate(self):
        bad, err = self.check(self.bank("20261022"))
        self.assertEqual(bad, 1)                           # NOFORM on a v >= CUTOFF bank
        self.assertEqual(err, "")

    def test_cli_does_not_raise_on_a_string_v(self):
        out = io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(cli.main(["--strict", self.bank('"20261022"')]), 0)


class K2(unittest.TestCase):
    """k=2 (SLIP_K, Tony D1/D3): one inner slip + one whole-answer (outer) slip, family "inner+outer"; k=1 stays today's output."""

    def test_flag_defaults_to_one(self):
        self.assertEqual(slips.SLIP_K, int(os.environ.get("SLIP_K", "1")))
        self.assertEqual(slips.match("10-(3+2)", -7), slips.match("10-(3+2)", -7, k=slips.SLIP_K))

    def test_hand_cases_only_inner_plus_outer(self):
        cases = (("10-(3+2)", -7, "drop+sign"),        # 10-3 = 7, then the whole answer's sign
                 ("2*9.8*3", 120, "g+factor"),         # g = 10 gives 60, then doubled
                 ("sqrt(9+16)", 49, "dream+power"),    # sqrt(9)+sqrt(16) = 7, then squared
                 ("sqrt(9+16)", -7, "dream+sign"))
        for form, typed, want in cases:
            self.assertIsNone(slips.match(form, typed, k=1), form)
            self.assertEqual(slips.match(form, typed, k=2), want, form)
            self.assertIn((want, typed), slips.mutants(form, 2), form)

    def test_k1_prefix_and_no_double_outer(self):
        f = "10-(3+2)"
        self.assertEqual(slips.mutants(f, 2)[:len(slips.mutants(f))], slips.mutants(f))
        self.assertIsNone(slips.match("2*3", -12, k=2))      # -(2*6): two outer slips, and 2*3 has no inner site: not k=2
        self.assertIsNone(slips.match(f, 0.4, k=2))          # 2 * 1/5: two outer slips
        self.assertTrue(all(fam.split("+")[1] in slips.OUTER_FAMS for fam, _ in slips.mutants(f, 2) if "+" in fam))

    def test_skip_and_k1_first(self):
        self.assertEqual(slips.match("10-(3+2)", -7, k=2, skip=[-7]), None)
        self.assertEqual(slips.match("10-(3+2)", 9, k=2), "distribute")   # a k=1 slip wins over any pair

    def test_k2_golden_fixture(self):
        """slips-golden-k2.json (python3 tools/slips.py --golden): the k=2 entries per bank form; slips.mjs runs the same file"""
        with open(os.path.join(FIX, "slips-golden-k2.json"), encoding="utf-8") as f:
            gold = json.load(f)
        with open(os.path.join(FIX, "slips-golden-banks.json"), encoding="utf-8") as f:
            self.assertEqual([g["form"] for g in gold], [g["form"] for g in json.load(f)])
        for g in gold:
            n = len(slips.mutants(g["form"]))
            same_mutants(self, slips.mutants(g["form"], 2)[n:], g["pairs"], g["form"])
            if g["pairs"]:
                self.assertIsNotNone(slips.match(g["form"], g["pairs"][0][1], k=2), g["form"])


if __name__ == "__main__":
    unittest.main()
