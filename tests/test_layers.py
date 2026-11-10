"""Emphasis layers (W157): the live-figure gate keeps the `layer` prop on ```fig marks (SCHEMA.md whitelist), and the OpenUI gate
accepts layer= / tone= on Geometry marks and Graph layer / tone props, rejecting a value outside 1|2|3 / the figure palette."""
import copy
import json
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # tests/ (for paths)
import paths
sys.path.insert(0, paths.SERVER_DIR)
import livefig  # noqa: E402
import views_gate  # noqa: E402

with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures", "livefig.json"), encoding="utf-8") as f:
    FIX = json.load(f)
P = FIX["problem"]


def ctx():      # as tests/test_livefig.py ctx(): the ramp-and-spring question, answer k = 375
    return livefig.context(P["code"], P["body"][0]["md"], P["saccharine"]["key"], [375.0], subject="physics.mechanics")


class LiveFigLayer(unittest.TestCase):
    def fig(self):
        return copy.deepcopy(FIX["valid"][0])

    def test_layer_passes_the_gate_and_survives(self):
        g = self.fig()
        self.assertIsNotNone(g)
        self.assertIsNone(livefig.check(copy.deepcopy(g), ctx()), "fixture figure is valid")
        g["marks"][-1]["layer"] = 3
        self.assertIsNone(livefig.check(g, ctx()))
        self.assertEqual(livefig.fixed(g)["marks"][-1].get("layer"), 3)

    def test_layer_out_of_range_is_dropped(self):
        g = self.fig()
        g["marks"][-1]["layer"] = 4
        self.assertEqual(livefig.check(g, ctx()), "schema")


class OpenUiGate(unittest.TestCase):
    def geo(self, *marks):
        return views_gate.geometry({"pts": "A 0,0; B 3,0; C 3,4", "marks": list(marks)})[0]

    def test_geometry_emphasis(self):
        self.assertIsNone(self.geo("seg(A,B)", "arrow(A,C,$F$,tone=c1,layer=2)", "seg(B,C,layer=3,tone=muted)"))
        self.assertEqual(self.geo("seg(A,B,layer=4)"), "geo-emph")
        self.assertEqual(self.geo("seg(A,B,tone=hotpink)"), "geo-emph")

    def test_graph_emphasis(self):
        self.assertIsNone(views_gate.graph_emph({"layer": "A:2 A-B:3", "tone": "A:c2"}))
        self.assertEqual(views_gate.graph_emph({"layer": "A:9"}), "graph-layer")
        self.assertEqual(views_gate.graph_emph({"tone": "A:#fff"}), "graph-tone")


if __name__ == "__main__":
    unittest.main()
