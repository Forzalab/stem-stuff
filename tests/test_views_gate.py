"""views_gate.py (P4.1, spec H): Cluck's ```openui fence: parse -> schema -> checker -> leak -> stage, a bad statement dropped, a bad root
drops the fence, one figure per reply across ```fig and ```openui, CLUCK_VIEWS=0 strips."""
import os
import sys
import unittest
from unittest import mock

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
import livefig  # noqa: E402
import views_gate  # noqa: E402

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
        thirteen = "[" + ", ".join(['"seg(A,B)"'] * 13) + "]"
        seven = "[" + ", ".join(f'"label(A,L{i})"' for i in range(7)) + "]"
        pts = "; ".join(f"P{i} {i},0" for i in range(13))
        for src, why in [(f'root = View([g])\ng = Geometry("A 0,0; B 3,0", {thirteen})', "too-long:Geometry.marks"),
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
        import serve
        self.assertIs(serve.views_gate.Fence, views_gate.Fence)
        with open(os.path.join(ROOT, "serve.py")) as f:
            self.assertNotIn("livefig.Fence(", f.read())


if __name__ == "__main__":
    unittest.main()
