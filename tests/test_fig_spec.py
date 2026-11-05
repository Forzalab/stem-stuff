"""Topic injection (Tony 19:37 PST Nov 3): the item's topic picks ONE figure spec for the per-question tail (fig_spec / v4_fig_howto)."""
import json
import os
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("STEM_TRIES", os.path.join(tempfile.mkdtemp(prefix="stem-tries-"), "tries.json"))
import serve  # noqa: E402


def item(code, title, md):
    return {"code": code, "title": title, "type": "mc", "body": [{"type": "text", "md": md}], "correct": "a", "wrong": [],
            "choices": [{"id": "a", "md": "1"}, {"id": "b", "md": "2"}], "saccharine": {"key": "k"}}


ITEMS = [item("PHYS_TA1", "diver rises with a light belt", "A diver and a lead belt float up in sea water. Find the acceleration."),
         item("PHYS_TA2", "gas pressure factor", "The gas is squeezed to half its volume. By what factor does the pressure change?"),
         item("PHYS_TA3", "rectangle torque about the left edge", "Find the torque that speeds the rotation about the left edge by 30 rpm each second."),
         item("PHYS_TA4", "thermal expansion of a rail", "A rail warms by 20 C. Find its new length."),
         item("PHYS_TA5", "rod b is longer", "Rod b is three times as long as rod a. Find the junction temperature."),
         item("PHYS_TA6", "ice cube floats while it melts", "An ice cube floats in water and melts. Find the buoyant force."),
         item("PHYS_YNJ", "twin bulb ice to steam", "A filament radiates into a piece of ice at a low temperature. How long (in s) until it is steam? Use the specific heats and the latent heats given."),
         item("PHYS_CQZ", "twist twin bulb stops at warm water", "A filament radiates into a piece of ice. How long (in s) until it is liquid water? Use the specific heats and the latent heats given.")]


class FigSpec(unittest.TestCase):
    def setUp(self):
        self.d = tempfile.mkdtemp()
        for name, items in (("BANK_P3X", ITEMS), ("BANK_ZZZ", [item("PHYS_TB1", "diver in a pool", "A diver floats. Find the buoyant force.")])):
            with open(os.path.join(self.d, name + ".json"), "w") as f:
                json.dump({"v": 1, "problems": items}, f)
        self.ps = [mock.patch.object(serve, "BANKS", self.d), mock.patch.dict(os.environ, {"CLUCK_FIG_SPEC": "p3x"})]
        for p in self.ps:
            p.start()

    def tearDown(self):
        for p in self.ps:
            p.stop()

    def test_topic_picks_the_spec(self):
        got = {c: serve.fig_spec(c) for c in ("PHYS_TA1", "PHYS_TA2", "PHYS_TA3", "PHYS_TA4", "PHYS_TA5")}
        self.assertEqual(got, {"PHYS_TA1": "forces", "PHYS_TA2": "factor", "PHYS_TA3": "rotation", "PHYS_TA4": None, "PHYS_TA5": None})

    def test_heat_items_pick_the_heating_curve(self):
        self.assertEqual([serve.fig_spec(c) for c in ("PHYS_YNJ", "PHYS_CQZ")], ["heat", "heat"])
        self.assertIsNone(serve.fig_spec("PHYS_TA4"), "thermal expansion is not a heating curve")
        self.assertEqual(serve.fig_spec("PHYS_TA6"), "forces", "a floating melting cube is a forces item: the earlier rule wins")

    def test_heat_tail_and_ctx(self):
        ctx = serve.fig_ctx(serve.problems()["PHYS_YNJ"], "b")
        self.assertEqual(ctx.spec, "heat")
        self.assertIn(serve.FIG_SPECS["heat"], serve.v4_fig_howto(ctx))
        self.assertEqual(serve.fig_ctx(serve.problems()["PHYS_TA1"], "b").spec, "forces", "only a heat item gets the heat rules")

    def heat_parts(self):
        """(ctx, program, parsed Steps props) of the worked example, on a question that gives the ice's start (-10 C)"""
        import oui
        import views_gate
        ctx = serve.livefig.context("PHYS_YNJ", "A filament radiates into ice at -10 C. How long (in s) until it is steam at 120 C?", "", [999.0],
                                    subject="physics.mechanics", spec=serve.fig_spec("PHYS_YNJ"))
        prog = serve.HEAT_EXAMPLE
        res = oui.parse(prog, views_gate.catalog(), "View")
        steps = next(e for e in views_gate._elements(res["root"], []) if e["typeName"] == "Steps")["props"]
        return ctx, prog, steps

    def test_heat_example_is_a_stepper_that_passes_the_gate(self):
        import views_gate
        ctx, prog, steps = self.heat_parts()
        self.assertEqual(views_gate.gate(prog, ctx), (prog, ["ok"]))
        self.assertEqual(steps["fig"]["typeName"], "Graph", "a stepper needs its figure (steps-nofig)")
        n_edges = len([e for e in steps["fig"]["props"]["edges"].split(",") if e.strip()])
        self.assertEqual(len(steps["steps"]), n_edges, "one step per piece of the curve")
        self.assertLessEqual(len(steps["steps"]), 8)
        self.assertIn("```openui", serve.FIG_SPECS["heat"])
        self.assertNotIn("```fig", serve.FIG_SPECS["heat"], "the static fig curve is gone")

    def test_heat_captions_speak_in_the_house_voice(self):
        _, _, steps = self.heat_parts()
        caps = [s["props"]["cap"] for s in steps["steps"]]
        for c in caps:                                   # cluck-v4.txt SUBJECTS: "you" first, no [inanimate object] + [verb]
            self.assertRegex(c, r"^Q[\u2081-\u2085] = (mc\u0394T|mL)\. You (warm|melt|boil) .+\.$|^Q[\u2081-\u2085] = (mc\u0394T|mL)\. You \w+ it\. No temp change\.$")
            self.assertNotRegex(c, r"(?i)\b(heat|temp|ice|water|energy) (goes|stays|wants|needs)\b")
            self.assertLessEqual(len(c), 140)
        self.assertEqual([c.split(".")[0] for c in caps], ["Q\u2081 = mc\u0394T", "Q\u2082 = mL", "Q\u2083 = mc\u0394T", "Q\u2084 = mL", "Q\u2085 = mc\u0394T"])
        self.assertIn("You take heat out", serve.FIG_SPECS["heat"], "cooling = the same walk reversed")
        self.assertNotRegex(serve.FIG_SPECS["heat"].replace("Never \"the heat goes\"", "").replace("never \"temp stays flat\"", ""),
                            r"(?i)\b(heat|temp|ice|water|energy) (goes|stays|wants|needs)\b")
        self.assertNotRegex(serve.HEAT_EXAMPLE, r"\b(334|2265|4186|2090)\b", "no bank number in the example")

    def test_heat_last_step_has_the_total_row_and_rows_grow(self):
        _, _, steps = self.heat_parts()
        rows = [s["props"]["rows"] for s in steps["steps"]]
        for k, r in enumerate(rows[:-1], 1):
            self.assertEqual(len(r), k)
            self.assertNotIn("total", [c.lower() for row in r for c in row])
        self.assertEqual(rows[-1][-1], ["total", "Q\u2081+Q\u2082+Q\u2083+Q\u2084+Q\u2085"])
        self.assertEqual(rows[-1][:-2], rows[-2], "each step keeps every earlier row")
        self.assertEqual(steps["head"], ["chunk", "what you do"])
        self.assertNotRegex(str(rows), r"\d", "rows are symbolic, never the student's numbers")

    def test_heat_chunk_equal_to_the_key_is_dropped_as_a_leak(self):
        import views_gate
        _, prog, _ = self.heat_parts()
        ctx = serve.livefig.context("PHYS_YNJ", "A filament radiates into ice at -10 C. How long until it is steam at 120 C?", "", [375.0],
                                    subject="physics.mechanics", spec="heat")
        bad = prog.replace('["Q\u2082 = mL", "melt it"]', '["Q\u2082 = 375", "melt it"]')
        self.assertNotEqual(bad, prog)
        out, log = views_gate.gate(bad, ctx)
        self.assertIsNone(out)
        self.assertTrue(any("leak:Step.rows=375" in x for x in log), log)

    def test_only_that_spec_goes_in_the_tail(self):
        ctx = serve.fig_ctx(serve.problems()["PHYS_TA1"], "b")
        tail = serve.v4_fig_howto(ctx)
        self.assertIn(serve.FIG_SPECS["forces"], tail)
        for other in ("factor", "rotation", "graph"):
            self.assertNotIn(serve.FIG_SPECS[other], tail)
        self.assertIn("on a right answer too", tail)

    def test_no_topic_no_spec(self):
        tail = serve.v4_fig_howto(serve.fig_ctx(serve.problems()["PHYS_TA4"], "b"))
        self.assertFalse(any(s in tail for s in serve.FIG_SPECS.values()))

    def test_flag(self):
        self.assertIsNone(serve.fig_spec("PHYS_TB1"))                       # default p3x: another bank gets none
        with mock.patch.dict(os.environ, {"CLUCK_FIG_SPEC": "1"}):
            self.assertEqual(serve.fig_spec("PHYS_TB1"), "forces")
        with mock.patch.dict(os.environ, {"CLUCK_FIG_SPEC": "0"}):
            self.assertIsNone(serve.fig_spec("PHYS_TA1"))

    def test_deterministic(self):
        self.assertEqual([serve.fig_spec("PHYS_TA2") for _ in range(5)], ["factor"] * 5)


if __name__ == "__main__":
    unittest.main()
