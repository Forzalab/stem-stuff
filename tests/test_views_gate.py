"""views_gate.py (P4.1, spec H): Cluck's ```openui fence: parse -> schema -> checker -> leak -> stage, a bad statement dropped, a bad root
drops the fence, one figure per reply across ```fig and ```openui, CLUCK_VIEWS=0 strips."""
import os
import re
import sys
import unittest
from unittest import mock

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # tests/ (for paths)
import paths
sys.path.insert(0, paths.SERVER_DIR)
from cluck_reply_checks import livefig  # noqa: E402
from cluck_reply_checks import views_gate  # noqa: E402

CTX = livefig.context("T1", "A ladder leans on a wall: legs 3 m and 4 m. How long is the ladder?", "", [5.0])
GEO = ('fig = Geometry("A 0,0; B 3,0; C 3,4", ["seg(A,B)", "seg(B,C)", "seg(C,A)", "right(B,A,C)", "dim(A,B,3 m)", "dim(B,C,4 m)", '
       '"dim(A,C,$c = ?$)", "angle(A,B,C,$\\\\theta$)"], "A right triangle, legs 3 and 4.")')
GOOD = "root = View([fig, cap])\n" + GEO + '\ncap = Text("The legs are 3 m and 4 m.")'


def run(chunks, ctx=CTX):
    f = views_gate.Fence(ctx)
    out = "".join(f.feed(c) for c in chunks) + f.end()
    return out, f.log


class Gate(unittest.TestCase):
    def test_good_geometry_passes(self):
        prog, log = views_gate.gate(GOOD, CTX)
        self.assertEqual(log, ["ok"])
        self.assertEqual(prog, GOOD)

    def test_answer_in_a_label_drops_that_statement_only(self):
        prog, log = views_gate.gate(GOOD.replace("$c = ?$", "5 m"), CTX)
        self.assertEqual(log, ["fig:leak:Geometry.label=5"])
        self.assertEqual(prog, 'root = View([cap])\ncap = Text("The legs are 3 m and 4 m.")')

    def test_answer_to_three_sig_figs_and_not_given_numbers(self):
        self.assertIn("leak:", views_gate.gate(GOOD.replace("$c = ?$", "5.001"), CTX)[1][0])
        self.assertIn("not-given:", views_gate.gate(GOOD.replace("3 m)", "37 m)"), CTX)[1][0])
        self.assertIn("leak:Text.text=5", views_gate.gate(GOOD.replace("are 3 m", "are 5 m"), CTX)[1][0])

    def test_over_caps(self):
        seventeen = "[" + ", ".join(['"seg(A,B)"'] * 17) + "]"
        seven = "[" + ", ".join(f'"label(A,L{i})"' for i in range(7)) + "]"
        pts = "; ".join(f"P{i} {i},0" for i in range(17))
        for src, why in [(f'root = View([g])\ng = Geometry("A 0,0; B 3,0", {seventeen})', "too-long:Geometry.marks"),
                         (f'root = View([g])\ng = Geometry("A 0,0; B 3,0", {seven})', "labels"),
                         (f'root = View([g])\ng = Geometry("{pts}", ["seg(P0,P1)"])', "too-long:pts"),
                         ('root = View([g])\ng = Geometry("A 0,0; B 3,0", ["seg(A,Z)"])', "geo-point"),
                         ('root = View([g])\ng = Geometry("A 0,0; B 3,0", ["blob(A,B)"])', "geo-mark")]:
            prog, log = views_gate.gate(src, CTX)
            self.assertIsNone(prog, src)
            self.assertEqual(log, [f"g:{why}", "empty"], src)

    def test_unknown_component_and_chat_only_subset(self):
        prog, log = views_gate.gate("root = View([fig, x])\n" + GEO + '\nx = Bogus("hi")', CTX)
        self.assertEqual(prog, "root = View([fig])\n" + GEO)
        self.assertEqual(log, ["x:unknown-component"])
        prog, log = views_gate.gate("root = View([fig, h])\n" + GEO + '\nh = Hints(["Try the legs"])', CTX)
        self.assertEqual(log, ["h:chat:Hints"])
        self.assertEqual(prog, "root = View([fig])\n" + GEO)

    def test_bad_root_drops_the_fence(self):
        for src in [GEO, 'root = Text("hi")', 'root = View([Text("inline")])', "root = View([fig, $n])\n$n = 0\n" + GEO, "garbage ((("]:
            self.assertIsNone(views_gate.gate(src, CTX)[0], src)

    def test_key_ref_never_in_a_cluck_reply(self):
        self.assertEqual(views_gate.gate("root = View([fig, c])\n" + GEO + '\nc = Text("key.v1")', CTX)[1], ["c:stage:Text.text"])


class Shapes(unittest.TestCase):
    """stepper iteration 2 (smoke): poly / rect pass the gate; Step title / hide / say pass, a say holding the answer drops its step"""
    def test_prompt_shape_examples_pass_the_gate(self):
        import json
        reg = json.load(open(os.path.join(ROOT, "shared", "openui", "registry.json"), encoding="utf-8"))
        ctx = livefig.context("T2", "A shape.", "", [99.0])
        gp = reg["geo_prompt"]
        for x in gp["examples"]:
            prog, log = views_gate.gate('root = View([s])\ns = Steps(g, [a])\n' + x["src"] + '\na = Step("We look at it.")', ctx)
            self.assertIsNotNone(prog, (x["idea"], log))
            self.assertIn("Geometry(", prog, (x["idea"], log))
        prog, log = views_gate.gate(gp["program"], ctx)
        self.assertIn("Geometry(", prog or "", log)
        self.assertIn("Move the pointer", prog or "", log)

    def test_poly_rect_and_step_args(self):
        ctx = livefig.context("T3", "9 V across 2 ohm and 4 ohm in a row.", "", [1.5])
        body = "\n".join(['root = View([s])', 's = Steps(g, [a])',
            'g = Geometry("A 0,0; B 0,3; C 6,3; E 1,2.6; F 2.6,3.4", ["poly(A,B,C,fill,tone=sky)", "rect(E,F,$R_1$ = 2 Ω,fill)", "label(A,I = ?)"])',
            'a = Step("We add.", null, null, null, null, null, null, "R = R_1 + R_2", "R_1", "Add the resistances", "C", ["I=I = ?"])'])
        prog, log = views_gate.gate(body, ctx)
        self.assertIsNotNone(prog, log)
        self.assertIn("Add the resistances", prog)
        prog, log = views_gate.gate(body.replace('"I=I = ?"', '"I=I = 1.5 A"'), ctx)
        self.assertTrue(prog is None or "1.5" not in prog, log)
        self.assertEqual(views_gate.geometry({"pts": "A 0,0; B 1,1", "marks": ["poly(A,B,fill)"]})[0], "geo-mark")


class TugFlip(unittest.TestCase):
    """TUG-VIEW.md: Tug rows are `label | move | up|down|same [size] [| why]`, <= 6; net is post-only; Flip rows are exactly 3 cells, <= 4"""
    def one(self, stmt):
        return views_gate.gate("root = View([t])\n" + stmt, CTX)

    def test_good_tug_and_flip_pass(self):
        t = 't = Tug(["V | down to 1/3 | up 3 | Smaller box.", "T | down to 1/2 | down 2"], "P", "two pulls")'
        self.assertEqual(self.one(t), ("root = View([t])\n" + t, ["ok"]))
        f = 't = Flip([["arm of W", "L", "half of L"], ["KE", "x", "y"]])'
        self.assertEqual(self.one(f), ("root = View([t])\n" + f, ["ok"]))

    BATTERY = ["Q₁ | warm the ice | up 1", "Q₂ | melt the ice | up 2", "Q₃ | warm the water | up 3", "Q₄ | boil it | up 9", "Q₅ | warm the steam | up 1"]

    def test_five_row_all_up_battery_passes(self):
        t = "t = Tug(" + str(self.BATTERY).replace("'", '"') + ', "Q", "the energy battery")'
        self.assertEqual(self.one(t), ("root = View([t])\n" + t, ["ok"]))

    def test_conservation_example_rows_pass_the_grammar_and_a_value_size_does_not(self):
        from http_server import serve
        ex = serve.V4_VIEWS.split("Examples:\n")[1]
        rows = re.search(r'"PE \| [^\]]*', ex).group(0).split('", "')
        self.assertEqual(len(rows), 2)
        for r in rows:
            self.assertTrue(views_gate.TUG_ROW.match(r.strip('"')), r)
        self.assertFalse(views_gate.TUG_ROW.match("Q₁ | melt the ice | up 334"))
        self.assertEqual(self.one('t = Tug(["Q₁ | warm | up 334", "Q₂ | melt | up 2"])')[1][0], "t:tug:row")

    def test_seven_rows_drop_the_whole_statement(self):
        rows = ", ".join(['"V | m | up"'] * 7)
        prog, log = self.one(f"t = Tug([{rows}])")
        self.assertIsNone(prog)
        self.assertTrue(log[0].startswith("t:too-long"), log)

    def test_bad_rows_and_net(self):
        self.assertEqual(self.one('t = Tug(["V | m | sideways"])')[1][0], "t:tug:row")
        self.assertEqual(self.one('t = Tug(["a very long label | m | up"])')[1][0], "t:tug:row")
        self.assertEqual(self.one('t = Flip([["a", "b"]])')[1][0], "t:flip:row")

    def test_a_bad_row_is_trimmed_the_tug_stays_with_two_good_rows(self):
        # bench Nov 4 (SGU, T6Y): one row off the grammar used to drop the whole Tug
        t = 't = Tug(["V | box squeezed | up 3", "T | gas cooled | down 2", "a label far too long | x | up"], "P", "two pulls")'
        prog, log = self.one(t)
        self.assertEqual(log, ["t:trim:Tug.row"])
        self.assertEqual(prog, 'root = View([t])\nt = Tug(["V | box squeezed | up 3", "T | gas cooled | down 2"], "P", "two pulls")')
        self.assertEqual(self.one('t = Tug(["V | a | up 3", "T | b | sideways"])')[1][0], "t:tug:row", "one good row left: dropped as before")

    def test_a_size_in_its_own_cell_is_folded_in(self):
        # bench Nov 4 (SGU): `V | box doubles | same | 1 | why` (5 cells) killed the Tug; the size cell is folded into the direction, the why kept
        t = 't = Tug(["V | box doubles | same | 1 | No pull on speed.", "T | gas cooled | down 4 | Colder, so slower."], "KE", "alt")'
        prog, log = self.one(t)
        self.assertEqual(log, ["t:trim:Tug.size"])
        self.assertEqual(prog, 'root = View([t])\nt = Tug(["V | box doubles | same 1 | No pull on speed.", "T | gas cooled | down 4 | Colder, so slower."], "KE", "alt")')
        self.assertEqual(self.one('t = Tug(["V", "T"])')[1][0], "t:tug:row", "bare labels: dropped")

    def test_a_net_is_trimmed_never_drawn(self):
        # bench Nov 4 (USR): the model wrote the end-knot answer; a Cluck reply is never post, so only the net line goes
        prog, log = self.one('t = Tug(["V | m | up", "T | n | down"], "P", "alt", "up 3/2")')
        self.assertEqual(log, ["t:trim:Tug.net"])
        self.assertEqual(prog, 'root = View([t])\nt = Tug(["V | m | up", "T | n | down"], "P", "alt")')
        prog, log = self.one('t = Tug(["V | m | up"], null, "alt", "up 3/2")')
        self.assertEqual((prog, log), ('root = View([t])\nt = Tug(["V | m | up"], null, "alt")', ["t:trim:Tug.net"]))

    def test_a_leak_in_a_kept_row_still_drops_after_the_trim(self):
        prog, log = self.one('t = Tug(["c | = 5 m | up", "T | n | down", "a label far too long | x | up"])')
        self.assertIsNone(prog)
        self.assertIn("leak:", " ".join(log))

    def test_a_pull_size_equal_to_a_key_value_is_not_a_leak(self):
        # CTX's answer is 5.0: "up 5" is a bar length (bench Nov 4: PHYS_SGU's Tug died on "up 3", a choice's value), "= 5 m" in the move still is a leak
        t = 't = Tug(["V | box squeezed | up 5", "T | gas cooled | down 2"])'
        self.assertEqual(self.one(t)[1], ["ok"])
        self.assertIn("leak:", self.one('t = Tug(["V | = 5 m | up 5"])')[1][0])

    def test_a_key_literal_in_a_row_is_a_leak(self):
        self.assertIn("leak:", self.one('t = Tug(["c | 5 m | up"])')[1][0])
        self.assertIn("leak:", self.one('t = Flip([["c", "x", "5 m"]])')[1][0])


class HeatNumbers(unittest.TestCase):
    """a heating-curve stepper (spec "heat"): the sheet's constants are givens in a caption / label; the leak check still comes first"""
    PROG = ('root = View([s])\ns = Steps(g, [s1, s2], null, ["chunk", "what you do"])\ng = Graph("A 40 120, B 120 80, C 220 80", "A-B, B-C")\n'
            's1 = Step("Q\u2081 = mc\u0394T. You warm the ice to 0\u00b0C.", "A:done B:cur", "A-B:tree", "A:%s B:0\u00b0C", null, null, [["Q\u2081", "warm"]])\n'
            's2 = Step("Q\u2082 = mL. You melt it. No temp change.", "A:done B:done C:cur", "A-B:seen B-C:tree", "B:0\u00b0C", null, null, [["Q\u2081", "warm"], ["Q\u2082", "melt"]])')

    def ctx(self, spec, answers=(999.0,)):
        return livefig.context("H1", "Ice at -10 C warms to steam. How long?", "", list(answers), subject="physics.mechanics", spec=spec)

    def test_zero_and_hundred_are_givens_under_heat_only(self):
        prog = self.PROG % "10\u00b0C"
        cap100 = prog.replace("to 0\u00b0C", "to 100\u00b0C")
        self.assertEqual(views_gate.gate(cap100, self.ctx("heat")), (cap100, ["ok"]))
        out, log = views_gate.gate(cap100, self.ctx(None))
        self.assertIsNone(out)
        self.assertIn("s:not-given:Step.cap=100", log)

    def test_the_leak_check_comes_first_even_for_a_constant(self):
        cap = (self.PROG % "10\u00b0C").replace("to 0\u00b0C", "to 100\u00b0C")
        out, log = views_gate.gate(cap, self.ctx("heat", answers=(100.0,)))
        self.assertIsNone(out)
        self.assertIn("s:leak:Step.cap=100", log)

    def test_a_tag_with_the_key_is_a_leak_under_heat(self):
        out, log = views_gate.gate(self.PROG % "375\u00b0C", self.ctx("heat", answers=(375.0,)))
        self.assertIsNone(out)
        self.assertIn("s:leak:Step.tags=375", log)
        out, log = views_gate.gate(self.PROG % "375\u00b0C", self.ctx("heat", answers=(999.0,)))
        self.assertIn("s:not-given:Step.tags=375", log, "an invented temperature is not a given")


class Stream(unittest.TestCase):
    def test_fence_streams_held_until_closed(self):
        body = GOOD
        out, log = run(["Here is the picture:\n``", "`openui\n" + body[:25], body[25:] + "\n```\nThen add the squares."])
        self.assertEqual(out, "Here is the picture:\n\n```openui\n" + GOOD + "\n```\n\nThen add the squares.")
        self.assertEqual(log, ["oui:ok"])

    def test_two_visuals_per_reply_across_fig_and_openui(self):
        # todo 113 (Tony Oct 28: Opus "may mix 2"): a ```fig and a view both go out; a third visual is dropped
        fig = "```fig\n" + livefig.EXAMPLE["bars"] + "\n```"
        out, log = run([fig + "\nand\n```openui\n" + GOOD + "\n```\nend"])
        self.assertIn("```fig", out)
        self.assertIn("```openui", out)
        self.assertEqual(log, ["ok", "oui:ok"])
        out, log = run(["```openui\n" + GOOD + "\n```\n" + fig + "\n" + fig])
        self.assertEqual((out.count("```openui"), out.count("```fig")), (1, 1))
        self.assertEqual(log, ["oui:ok", "ok", "second"])

    def test_a_stepper_may_ride_in_a_chat_view(self):
        # todo 113: a step ladder / loop trace the student clicks through (Back / Next only, no server call); a Predict still may not
        steps = ('root = View([s])\ns = Steps(null, [s1, s2], null, ["i", "s"])\n'
                 's1 = Step("First test: i = 1, s = 0.", null, null, null, null, null, [["1", "0"]])\n'
                 's2 = Step("Add 1. Now i = 2.", null, null, null, null, null, [["2", "1"]])')
        prog, log = views_gate.gate(steps, CTX)
        self.assertEqual(log, ["ok"])
        self.assertEqual(prog, steps)
        self.assertIn("chat:Predict", views_gate.gate('root = View([p])\np = Predict(null, "Which?", ["3", "4"], null, null, key.v1)', CTX)[1][0])

    def test_a_stepper_without_a_figure_is_dropped_its_captions_stay_as_plain_lines(self):
        # W340 (Tony, Oct 29 17:3x: "wtf are those 3 bubbles"): a stepper needs a real figure (or a table) per step; captions only =
        # dropped (steps-nofig). With no re-ask (this Fence has no slot) its captions go out in its place as plain numbered lines.
        bare = ('root = View([s])\ns = Steps(null, [s1, s2])\ns1 = Step("Push in: the work along the ramp.")\n'
                's2 = Step("Friction takes its share.")')
        prog, log = views_gate.gate(bare, CTX)
        self.assertIsNone(prog)
        self.assertEqual(log, ["s:steps-nofig", "empty"])
        self.assertEqual(views_gate.steps_plain(bare), "\n**1.** Push in: the work along the ramp.\n**2.** Friction takes its share.\n")
        out, log = run(["Click through:\n```openui\n" + bare + "\n```\nTry once more."])
        self.assertEqual(out, "Click through:\n\n**1.** Push in: the work along the ramp.\n**2.** Friction takes its share.\n\nTry once more.")
        graph = bare.replace("Steps(null, [s1, s2])", 'Steps(g, [s1, s2])\ng = Graph("W 40 40, F 140 40", "W>F")')
        self.assertEqual(views_gate.gate(graph, CTX)[1], ["ok"], "a stepper with its figure passes")

    def test_bad_fence_dropped_text_streams(self):
        out, log = run(["Look:\n```openui\nroot = Text(\"x\")\n```\nThe text goes on."])
        self.assertEqual(out, "Look:\n\nThe text goes on.")
        self.assertEqual(log, ["oui:root"])

    def test_kill_switch_strips(self):
        with mock.patch.dict(os.environ, {"CLUCK_VIEWS": "0"}):
            self.assertFalse(views_gate.on())
            out, log = run(["A\n```openui\n" + GOOD + "\n```\nB"])
        self.assertEqual(out, "A\n\nB")
        self.assertEqual(log, ["views-off"])
        with mock.patch.dict(os.environ, {}, clear=False):
            os.environ.pop("CLUCK_VIEWS", None)
            self.assertTrue(views_gate.on())

    def test_no_ctx_strips(self):
        out, log = run(["A\n```openui\n" + GOOD + "\n```\nB"], ctx=None)
        self.assertEqual(out, "A\n\nB")

    def test_history_strip(self):
        self.assertEqual(livefig.strip("Look:\n```openui\n" + GOOD + "\n```\nThen."), "Look:\nThen.")

    def test_serve_uses_the_gate(self):
        from http_server import serve
        self.assertIs(serve.views_gate.Fence, views_gate.Fence)
        with open(os.path.join(ROOT, "server", "http_server", "serve.py")) as f:
            self.assertNotIn("livefig.Fence(", f.read())


if __name__ == "__main__":
    unittest.main()
