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
         item("PHYS_TA5", "rod b is longer", "Rod b is three times as long as rod a. Find the junction temperature.")]


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
