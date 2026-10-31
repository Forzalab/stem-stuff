"""W137 expression answers v1 (todo 137, brain _files/w137): expr.py (parser, evaluator, AST aligner + families, diagnosis JSON v1.1,
leak guard, render) and serve.py's glue (EXPR_MODE flag on BANK_P3X / BANK_P3Q, the box after a miss, POST /diagnose with L3 mocked)."""
import json
import os
import sys
import tempfile
import unittest
import unittest.mock

sys.argv = [sys.argv[0]]
os.environ.setdefault("STEM_TODAY", "2026-10-23")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import expr  # noqa: E402
import serve  # noqa: E402

GOLD = "Sqrt(10^2+12.5^2+2.5^2)*40*(2*Pi)/60"                         # Tony's golden example (shape only; never solved here)
GOLD_FORM = "(1*5.0^2+2*5.0^2+3*5.0^2+4*5.0^2)*(40*2*pi/60)"            # I (point masses, axis y) times alpha (rev/min per s -> rad/s^2)


class Parser(unittest.TestCase):
    def test_accepts_the_form_grammar_plus_g(self):
        for t in ["1200*9.8/(pi*1^2)", "1200*g/(pi*1^2)", GOLD, "-3^2", "2^-1", "sqrt(2)*sin(30*pi/180)", "asin(0.5)+acos(0.5)+atan(1)",
                  "exp(1)*ln(2)*log(3)*abs(-4)", "1.5e3/2", ".5*2", "3 × 4 ÷ 2", "2·π", "√(4)", "2**3", "1200*9.8/(PI*1^2)"]:
            expr.parse(t)

    def test_refuses_with_a_friendly_line(self):
        for t, word in [("2pi", "Put *"), ("3+", "stops early"), ("(3", "never closed"), ("x+2", "don't know"), ("3)", "extra"),
                        ("sqrt 4", "brackets"), ("", "Type"), ("3 $ 4", "can't read"), ("m*9.8", "don't know"), ("2(3)", "Put *")]:
            with self.assertRaises(expr.ExprError) as c:
                expr.parse(t)
            self.assertIn(word, c.exception.msg, t)
            self.assertNotRegex(c.exception.msg, r"Traceback|Error")

    def test_bare_number(self):
        for t in ["3.82", "-4", "1.2e3", "6.78e1", "1.07x10^14", "5*10^3", " 12 "]:
            self.assertTrue(expr.is_bare_number(t), t)
        for t in ["3*4", "1200*9.8", "sqrt(2)", "pi", "g"]:
            self.assertFalse(expr.is_bare_number(t), t)


class Evaluator(unittest.TestCase):
    def test_values(self):
        self.assertAlmostEqual(expr.evaluate("1200*9.8/(pi*1^2)")[1], 1200 * 9.8 / 3.141592653589793)
        self.assertAlmostEqual(expr.evaluate("1200*g")[1], 1200 * 9.8)
        self.assertAlmostEqual(expr.evaluate("1200*g", g=9.81)[1], 1200 * 9.81)
        self.assertAlmostEqual(expr.evaluate("2^3^2")[1], 512)
        self.assertAlmostEqual(expr.evaluate("-3^2")[1], -9)
        self.assertAlmostEqual(expr.evaluate("8/2/2")[1], 2)

    def test_cant_work_out_is_a_syntax_line(self):
        for t in ["1/0", "sqrt(-1)", "ln(0)", "10^999"]:
            with self.assertRaises(expr.ExprError):
                expr.evaluate(t)

    def test_norm_is_the_cache_key(self):
        a, b = expr.parse("Sqrt(10^2)*(2*Pi)/60"), expr.parse("sqrt(10^2)*2*pi/60")
        self.assertEqual(expr.norm(a), expr.norm(b))
        self.assertEqual(expr.norm(expr.parse("8/(2/2)")), "8/(2/2)")
        self.assertEqual(expr.norm(expr.parse("(8-2)-2")), "8-2-2")
        self.assertEqual(expr.cache_key("PHYS_X", None, "a*b"), "PHYS_X||a*b")
        self.assertEqual(expr.cache_key("PHYS_X", 1, "a*b"), "PHYS_X|1|a*b")


class Aligner(unittest.TestCase):
    def test_golden_shape_alpha_affirmed_sqrt_off(self):
        r = expr.l1(GOLD, GOLD_FORM)
        self.assertEqual(r["affirm"], [{"span": "40*(2*Pi)/60", "what": "that part"}])
        self.assertEqual(r["off"]["span"], "Sqrt(10^2+12.5^2+2.5^2)")
        self.assertEqual(r["off"]["what"], "the square root")
        self.assertEqual(r["explain_each"], ["10", "12.5", "2.5"])        # the student's own numbers; the exponent 2s are not "numbers"
        self.assertIsNone(r["family"])                                      # no known family: L3's job

    def test_affirm_never_holds_the_off_piece(self):
        r = expr.l1("1200*9.8/(pi*2^2)", "1200*9.8/(pi*1^2)")
        self.assertEqual(r["off"]["span"], "2^2")
        self.assertEqual(r["affirm"], [])

    def test_families_as_transforms(self):
        for stu, form, fam in [("5+3*2", "5-3*2", "sign"), ("-(3*4)", "3*4", "sign"), ("2*3/4", "2*4/3", "reciprocal"),
                               ("1200*10/(pi*1^2)", "1200*9.8/(pi*1^2)", "g"), ("(3*4)^2", "3*4", "power"), ("3*sqrt(4+5)", "3*(4+5)", "power"),
                               ("3*4*2", "3*4", "factor"), ("3*4/2", "3*4", "factor"), ("3*4/1000", "3*4", "units"), ("3*4", "3*4/1000", "units"),
                               ("3+4", "3+4+5", "drop"), ("2*cos(0.5)", "2*sin(0.5)", "trig")]:
            self.assertEqual(expr.l1(stu, form)["family"], fam, (stu, form))

    def test_g_typed_as_g_is_no_slip(self):
        r = expr.l1("1200*g/(pi*1^2)", "1200*9.8/(pi*1^2)")
        self.assertTrue(all(p["status"] == "same" for p in r["pairs"]))
        self.assertIsNone(r["family"])

    def test_tie_by_value_is_no_tie_by_tree(self):                         # E3 YZF: 80 = 800/g only when g is 10: the tree says which
        self.assertEqual(expr.l1("800/10", "800/9.8")["family"], "g")


def l3_reply(**kw):
    v = {"affirm": [{"span": "40*(2*Pi)/60", "what": "α part"}], "off": {"span": "Sqrt(10^2+12.5^2+2.5^2)", "what": "the square root"},
         "explain_each": ["10", "12.5", "2.5"], "recall": {"rule": "moment of inertia rule for point masses", "decider": "The axis is y."},
         "next": "Write I_y as a sum with four terms, one term per mass.", "guard": "Keep the square root out of it."}
    v.update(kw.pop("view", {}))
    return dict({"family": None, "concept": "perpendicular distance to the axis", "confidence": 0.9, "student_view": v}, **kw)


class DiagnosisJson(unittest.TestCase):
    def test_schema(self):
        self.assertTrue(expr.valid(l3_reply()))
        bad = l3_reply()
        del bad["student_view"]["guard"]
        self.assertFalse(expr.valid(bad))
        self.assertFalse(expr.valid(dict(l3_reply(), extra=1)))
        self.assertFalse(expr.valid(l3_reply(confidence="high")))
        self.assertFalse(expr.valid(l3_reply(view={"affirm": [{"span": 3, "what": "x"}]})))

    def test_six_moves_in_order(self):
        r = expr.l1(GOLD, GOLD_FORM)
        d = expr.diagnosis("PHYS_X", None, GOLD, 67.87, r, source="L3", model="claude-sonnet-5-5", l3=l3_reply())
        self.assertEqual(d["v"], "1.1")
        msg = expr.render(d, where="the last problem")
        parts = msg.split("\n\n")
        self.assertEqual(len(parts), 6)
        self.assertIn("α part is right: `40*(2*Pi)/60`. Keep it.", parts[0])
        self.assertIn("square root is the part that's off", parts[1])
        self.assertIn("the 10, the 12.5, and the 2.5", parts[2])
        self.assertIn("from the last problem", parts[3])
        self.assertIn("The axis is y.", parts[3])
        self.assertTrue(parts[4].startswith("Write I_y"))
        self.assertEqual(parts[5], "Keep the square root out of it.")

    def test_l1_only_uses_the_same_slots(self):
        r = expr.l1("1200*10/(pi*1^2)", "1200*9.8/(pi*1^2)")
        d = expr.diagnosis("PHYS_X", None, "1200*10/(pi*1^2)", 1.0, r)
        msg = expr.render(d, family_line="QUACK. Fun fact.")
        self.assertTrue(msg.startswith("This part is right: `1200*`") or msg.startswith("The 10 is"), msg)   # affirm first when it can
        self.assertTrue(msg.endswith("QUACK. Fun fact."))
        self.assertIn("The 10 is the part that's off", msg)


class LeakGuard(unittest.TestCase):
    def setUp(self):
        self.r = expr.l1(GOLD, GOLD_FORM)
        self.typed = expr.literals(expr.parse(GOLD), skip_exp=False)

    def d(self, **kw):
        return expr.diagnosis("PHYS_X", None, GOLD, 67.87, self.r, source="L3", l3=l3_reply(**kw))

    def test_clean(self):
        self.assertIsNone(expr.leak(self.d(), self.typed, [1.047], serve.leak_scan, GOLD_FORM))

    def test_answer_digits(self):
        self.assertEqual(expr.leak(self.d(view={"next": "You should get 1.047 kJ."}), self.typed, [1.047], None, GOLD_FORM), "answer_digits")

    def test_a_number_the_student_did_not_type(self):
        self.assertEqual(expr.leak(self.d(view={"guard": "Use 5 m, not 12.5."}), self.typed, [], None, GOLD_FORM), "number")

    def test_students_own_numbers_pass(self):
        self.assertIsNone(expr.leak(self.d(view={"guard": "The 12.5 is not a distance to the axis."}), self.typed, [], None, GOLD_FORM))

    def test_formula_and_prompt(self):
        self.assertEqual(expr.leak(self.d(view={"next": "Type " + GOLD_FORM}), self.typed, [], None, GOLD_FORM), "number")
        self.assertEqual(expr.leak(self.d(view={"next": "Type the thing"}), self.typed, [], lambda t: [1], GOLD_FORM), "prompt")

    def test_span_must_be_the_students(self):
        self.assertEqual(expr.leak(self.d(view={"off": {"span": "sqrt(5^2)", "what": "x"}}), self.typed, [], None, GOLD_FORM), "span")
        self.assertEqual(expr.leak(self.d(view={"explain_each": ["5"]}), self.typed, [], None, GOLD_FORM), "explain_each")


def item(code, form, answer, **kw):
    return dict({"code": code, "type": "num", "title": "rectangle torque", "form": form, "answer": answer, "tol": 0.01,
                 "body": [{"type": "text", "md": "Four masses on a rectangle turn about the y axis."}]}, **kw)


class Glue(unittest.TestCase):
    """the box after a miss, through serve.grade / serve.dispatch, on a BANK_P3X fixture"""
    def setUp(self):
        tmp = tempfile.mkdtemp()
        self.ps = [unittest.mock.patch.object(serve, "BANKS", os.path.join(tmp, "banks")), unittest.mock.patch.object(serve, "TRIES", os.path.join(tmp, "t.json")),
                   unittest.mock.patch.object(serve, "KV", (None, None))]
        os.makedirs(os.path.join(tmp, "banks"))
        for m in self.ps:
            m.start()
        ans = 250 * 40 * 2 * 3.141592653589793 / 60
        probs = [item("PHYS_GX1", GOLD_FORM, str(ans)), item("PHYS_GX2", "1200*9.8/(pi*1^2)", str(1200 * 9.8 / 3.141592653589793)),
                 {"code": "PHYS_GX3", "type": "multi", "title": "parts", "body": [{"type": "text", "md": "x"}],
                  "parts": [dict(item("", "3*4", "12"), label="a"), dict(item("", "5*6", "30"), label="b")]}]
        with open(os.path.join(tmp, "banks", "BANK_P3X.json"), "w") as f:
            json.dump({"v": 20261022, "problems": probs}, f)
        with open(os.path.join(tmp, "banks", "BANK_OTHR.json"), "w") as f:
            json.dump({"v": 20261022, "problems": [item("PHYS_OT1", "3*4", "12")]}, f)
        serve._gen.update(n=0, loaded=None)
        serve._tries.clear()
        serve._asked.clear()
        serve._expr_cache.clear()

    def tearDown(self):
        for m in self.ps:
            m.stop()

    def g(self, code, sid, **body):
        p = serve.lookup(code, "diet")
        return serve.grade(serve.view(p, "diet"), sid, body)

    def test_flag_off_is_todays_box(self):
        with unittest.mock.patch.dict(os.environ, {"EXPR_MODE": ""}):
            r1 = self.g("PHYS_GX2", "s0", answer="1")
            r2 = self.g("PHYS_GX2", "s0", answer="2")
        self.assertEqual(set(r1), {"verdict", "triesLeft", "hint", "gen"})
        self.assertEqual((r2["verdict"], r2["triesLeft"]), ("wrong", 0))
        self.assertNotIn("diag", r2)
        with unittest.mock.patch.dict(os.environ, {"EXPR_MODE": ""}):
            self.assertEqual(self.g("PHYS_GX2", "s0b", answer="3*")["verdict"], "invalid")

    def test_other_banks_stay_off(self):
        with unittest.mock.patch.dict(os.environ, {"EXPR_MODE": "1"}):
            r1 = self.g("PHYS_OT1", "s1", answer="1")
            r2 = self.g("PHYS_OT1", "s1", answer="2")
        self.assertNotIn("exprMode", r1)
        self.assertEqual(r2["verdict"], "wrong")

    def test_after_a_miss_the_box_wants_the_working(self):
        with unittest.mock.patch.dict(os.environ, {"EXPR_MODE": "1"}):
            r1 = self.g("PHYS_GX2", "s2", answer="1")
            self.assertEqual((r1["verdict"], r1["exprMode"]), ("wrong", True))
            r = self.g("PHYS_GX2", "s2", answer="3.74e3")                     # a bare number: the prompt, not a grade
            self.assertEqual((r["verdict"], r["triesLeft"], r["prompt"]), ("expr_needed", 1, expr.PROMPT))
            r = self.g("PHYS_GX2", "s2", answer="1200*9.8/(pi1^2)")           # a syntax slip: a friendly line, not a try
            self.assertEqual((r["verdict"], r["triesLeft"]), ("unparsed", 1))
            self.assertIn("Put *", r["syntax"])
            r = self.g("PHYS_GX2", "s2", answer="1200*10/(pi*1^2)")           # wrong working: L1 names the family
            self.assertEqual((r["verdict"], r["triesLeft"], r["error"]), ("wrong", 0, "g"))
            self.assertEqual(r["diag"]["source"], "L1")
            self.assertFalse(r["diag"]["pending"])
            self.assertEqual(r["diag"]["off"], {"span": "10"})
            self.assertNotIn("9.8", json.dumps(r["diag"]))                  # never the form's numbers

    def test_right_working_is_right(self):
        with unittest.mock.patch.dict(os.environ, {"EXPR_MODE": "1"}):
            self.g("PHYS_GX2", "s3", answer="1")
            r = self.g("PHYS_GX2", "s3", answer="1200*g/(pi*1^2)")
        self.assertEqual(r["verdict"], "correct")

    def test_multi_part_boxes(self):
        with unittest.mock.patch.dict(os.environ, {"EXPR_MODE": "1"}):
            r = self.g("PHYS_GX3", "s4", part=1, answer="1")
            self.assertTrue(r["exprMode"])
            self.assertEqual(self.g("PHYS_GX3", "s4", part=1, answer="31")["verdict"], "expr_needed")
            self.assertEqual(self.g("PHYS_GX3", "s4", part=0, answer="11")["verdict"], "wrong")    # part a's first try: a number, as today
            self.assertEqual(self.g("PHYS_GX3", "s4", part=1, answer="5*6")["verdict"], "correct")

    def test_golden_shape_asks_l3(self):
        with unittest.mock.patch.dict(os.environ, {"EXPR_MODE": "1"}):
            self.g("PHYS_GX1", "s5", answer="67.8")
            r = self.g("PHYS_GX1", "s5", answer=GOLD)
        self.assertTrue(r["diag"]["pending"])
        self.assertEqual(r["diag"]["off"], {"span": "Sqrt(10^2+12.5^2+2.5^2)"})
        self.assertTrue(r["diag"]["msg"].startswith("This part is right: `40*(2*Pi)/60`"))

    def d(self, sid, text, code="PHYS_GX1"):
        p = serve.lookup(code, "diet")
        return serve.diagnose(serve.view(p, "diet"), sid, {"code": code, "expr": text})

    def test_diagnose_only_a_graded_try(self):
        with unittest.mock.patch.dict(os.environ, {"EXPR_MODE": "1"}), unittest.mock.patch.object(serve, "expr_l3") as l3:
            self.assertEqual(self.d("s6", GOLD)[0], 403)
            l3.assert_not_called()

    def test_diagnose_l3_six_moves_cached_stored_anon(self):
        stored = []
        with unittest.mock.patch.dict(os.environ, {"EXPR_MODE": "1"}), unittest.mock.patch.object(serve, "expr_l3", return_value=l3_reply()) as l3, \
                unittest.mock.patch.object(serve, "_expr_store", side_effect=stored.append):
            self.g("PHYS_GX1", "s7", answer="67.8")
            self.g("PHYS_GX1", "s7", answer=GOLD)
            st, out = self.d("s7", GOLD)
            self.assertEqual((st, out["source"]), (200, "L3"))
            self.assertEqual(len(out["msg"].split("\n\n")), 6)
            self.assertEqual(out["off"], {"span": "Sqrt(10^2+12.5^2+2.5^2)"})
            user = json.loads(l3.call_args[0][0])
            self.assertEqual(user["student_expression"], GOLD)
            self.assertEqual(user["correct_formula"], GOLD_FORM)
            self.assertEqual(self.d("s7", "sqrt(10^2+12.5^2+2.5^2)*40*2*pi/60")[1].get("cached"), True)   # same working, another spelling
            self.assertEqual(l3.call_count, 1)
        row = stored[0]
        self.assertEqual(set(row), {"ts_day", "item", "part", "expr_norm", "diagnosis"})
        self.assertNotIn("s7", json.dumps(row))

    def test_diagnose_nudges_on_low_confidence_leak_and_budget(self):
        for reply, why in [(l3_reply(confidence=0.4), "conf"), (l3_reply(view={"next": "Use 5 m."}), "leak"), (None, "down"), ({"x": 1}, "schema")]:
            serve._expr_cache.clear()
            sid = "s8" + why
            with unittest.mock.patch.dict(os.environ, {"EXPR_MODE": "1"}), unittest.mock.patch.object(serve, "expr_l3", return_value=reply), \
                    unittest.mock.patch.object(serve, "_expr_store"):
                self.g("PHYS_GX1", sid, answer="67.8")
                self.g("PHYS_GX1", sid, answer=GOLD)
                self.assertEqual(self.d(sid, GOLD)[1]["msg"], expr.NUDGE, why)
        serve._expr_cache.clear()
        with unittest.mock.patch.dict(os.environ, {"EXPR_MODE": "1"}), unittest.mock.patch.object(serve, "expr_l3") as l3, \
                unittest.mock.patch.object(serve, "explain_allowed", return_value=False):
            self.g("PHYS_GX1", "s9", answer="67.8")
            self.g("PHYS_GX1", "s9", answer=GOLD)
            out = self.d("s9", GOLD)[1]
            self.assertEqual((out["msg"], out["budget"]), (expr.NUDGE, "hourly"))
            l3.assert_not_called()

    def test_explain_pairs_only(self):
        stored = []
        with unittest.mock.patch.dict(os.environ, {"EXPR_MODE": "1"}), unittest.mock.patch.object(serve, "_expr_store", side_effect=stored.append):
            p = serve.lookup("PHYS_GX1", "diet")
            self.assertEqual(serve.expr_explain_store(p, {"pairs": {"10": "the side, mail me a@b.co"}})[0], 200)
            self.assertEqual(serve.expr_explain_store(p, {"pairs": {"ten": "x"}})[0], 400)
        self.assertEqual(stored[0]["explain"], {"10": "the side, mail me"})

    def test_routes(self):
        with open(os.path.join(serve.ROOT, "vercel.json")) as f:
            rw = json.load(f)["rewrites"]
        self.assertIn({"source": "/diagnose", "destination": "/api/index?path=/diagnose"}, rw)


class Privacy(unittest.TestCase):
    def test_tonys_sentence(self):
        with open(os.path.join(serve.ROOT, "privacy.html"), encoding="utf-8") as f:
            self.assertIn("After a wrong answer, you may type your whole working as an expression. Cluck's helper (Claude) sees it, to find the step "
                          "that went off. If it finds a new kind of mistake, we keep that expression and the helper's note, with nothing that says "
                          "who typed it, to teach the site.", " ".join(f.read().split()))


if __name__ == "__main__":
    unittest.main()
