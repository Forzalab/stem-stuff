"""tools/bench_figs.py: the GPT-shape score, the figure gate pass-through, the kind match and the table (no network, no key);
plus the livefig changes it came with (step-number edge labels are free, spelled numbers are givens) and serve.network_data."""
import json
import os
import sys
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import bench_figs as b  # noqa: E402
import livefig  # noqa: E402
import serve  # noqa: E402

GPT = """QUUUACK (flaps)

You picked b. That is only the energy the cart starts with.

Start with the energy the cart already has.

$$K_0 = \\frac12 m v^2 = \\frac12 (2.0)(3.0)^2 = 9.0\\ \\text{J}$$
$$W = F d = 4.0 \\times 1.5 = 6.0\\ \\text{J}$$
$$\\boxed{K = K_0 + W = 15\\ \\text{J}}$$

Pick c."""
LONG = """POOF! You rubbed the lamp wrong, but a wish is a wish. The cart starts with energy. Then a force pushes it. So it gains more.

1. The start — energy at first
- the cart moves
$$K_0 = 9.0$$

---
So the answer is **c, 15 J**. What a quack-tastic ride."""
NET = {"type": "graph", "kind": "network", "alt": "Five places joined by roads, the walk home in order.", "nodes": ["home", "mill", "ford", "church", "Ives"],
       "edges": [{"from": "Ives", "to": "church", "w": 3, "color": "c1", "label": "1"}, {"from": "church", "to": "ford", "w": 1, "color": "c1", "label": "2"},
                 {"from": "ford", "to": "mill", "w": 2, "color": "c1", "label": "3"}, {"from": "mill", "to": "home", "w": 2, "color": "c1", "label": "4"},
                 {"from": "home", "to": "ford", "w": 5, "label": "5"}, {"from": "mill", "to": "church", "w": 4, "label": "6"},
                 {"from": "ford", "to": "Ives", "w": 6, "label": "7"}]}


class Shape(unittest.TestCase):
    def test_gpt_shot_scores_five(self):
        r = b.shape(GPT)
        self.assertEqual(r["score"], 5, r)
        self.assertEqual(r["dd_lines"], 3)
        self.assertTrue(r["boxed"] and r["pick_line"])
        self.assertLessEqual(r["prose_words"], 30)

    def test_long_v4_wish_scores_low(self):
        r = b.shape(LONG)
        self.assertLessEqual(r["score"], 2, r)
        self.assertEqual(r["long_paras"], 1)
        self.assertFalse(r["pick_line"])

    def test_figure_fence_is_not_prose(self):
        withfig = GPT.replace("Start with", "```fig\n" + json.dumps(NET) + "\n```\nStart with")
        self.assertEqual(b.shape(withfig)["prose_words"], b.shape(GPT)["prose_words"])

    def test_chat_needs_no_box_or_pick(self):
        self.assertEqual(b.shape("Power is work per second. QUACK.\n\n$$P = 52.0/4.0 = 13.0\\ \\text{W}$$", wish=False)["score"], 5)


class Figs(unittest.TestCase):
    def ctx(self):
        return livefig.context("T", "From home, five miles, the ford; two miles to the mill", "3 1 2 2 4 6", [5, 8])

    def test_step_labels_and_spelled_givens_pass_the_gate(self):
        shown, fi = b.fig_info("QUACK.\n```fig\n" + json.dumps(NET) + "\n```\nPick c.", self.ctx())
        self.assertTrue(fi["fig"], fi["log"])
        self.assertEqual((fi["kind"], fi["leaks"]), ("network", 0))
        self.assertIn("```fig", shown)

    def test_leak_is_counted_and_dropped(self):
        bad = dict(NET, edges=NET["edges"] + [{"from": "home", "to": "Ives", "w": 8}])
        shown, fi = b.fig_info("```fig\n" + json.dumps(bad) + "\n```", self.ctx())
        self.assertFalse(fi["fig"])
        self.assertEqual(fi["leaks"], 1)
        self.assertNotIn("```", shown)

    def test_kind_matches_subject(self):
        self.assertTrue(b.kind_ok({"subject": "cs"}, "network"))
        self.assertFalse(b.kind_ok({"subject": "phys"}, "network"))
        self.assertTrue(b.kind_ok({"subject": "phys"}, "scene"))


class Bench(unittest.TestCase):
    def test_keys_fill_the_public_bank_shape(self):
        p = b.keyed({"code": "CEQ_PRT", "type": "multi", "body": [], "parts": [{"label": "a"}, {"label": "b"}]})
        self.assertIn("\\boxed{5}", p["saccharine"]["key"])
        self.assertEqual([u["answer"] for u in p["parts"]], ["5", "8"])
        self.assertEqual(b.keyed({"code": "PHYS_H3A"})["correct"], "c")

    def test_table_has_one_row_per_arm(self):
        row = {"arch": "A", "variant": "new", "visual": True, "fig": True, "ttft": 1.0, "t_fig": 2.0, "total": 3.0, "hop": None, "kind_ok": True,
               "leaks": 0, "fmt_ok": True, "shape": 5, "shape_d": {"prose_words": 40}, "case": "X wish", "judge": 4, "usd": 0.01}
        t = b.table([row, dict(row, arch="C", hop=0.5)])
        self.assertEqual(len(t.split("\n")), 4)
        self.assertIn("| C | new | 1 |", t)

    def test_network_data(self):
        self.assertEqual(serve.network_data({"kind": "network", "nodes": ["A", {"id": "B"}], "edges": [{"from": "A", "to": "B", "w": 4}]}),
                         " Vertices: A B. Edges: A-B 4.")
        self.assertEqual(serve.network_data({"kind": "scene"}), "")


if __name__ == "__main__":
    unittest.main()
