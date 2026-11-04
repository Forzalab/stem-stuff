"""Nov 3 prod #407: a 3rd-turn Cluck reply (REVEAL yes, tries left) said "W = 210 N" and "Pick e.". An open item never gets a pick or the answer."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import serve  # noqa: E402
from test_cluck_v4 import P1  # noqa: E402

FACTS = serve.leak_facts(P1)      # right = b, 13.0 W


def deliver(parts, closed=False):
    return "".join(serve.v4_visible(iter(parts), True, FACTS, "T_GATE", closed=closed))


class OpenItemGate(unittest.TestCase):
    def test_pick_lines_dropped_even_with_reveal_yes(self):
        for bad in ("Pick e.", "Pick B", "so pick c!", "the answer is (b)", "Go with **a**.", "P = 13.0 W"):
            out = deliver(["Quack, look at the work.\n", bad + "\n", "Check your units.\n"])
            self.assertEqual(out, "Quack, look at the work.\nCheck your units.\n", bad)

    def test_streamed_in_small_chunks(self):
        reply = "Work over time.\nW = 13.0 W so Pick e.\nGo on.\n"
        self.assertEqual(deliver(list(reply)), "Work over time.\nGo on.\n")

    def test_last_line_without_newline(self):
        self.assertEqual(deliver(["Ok.\n", "Pick e."]), "Ok.\n")

    def test_clean_reply_unchanged(self):
        reply = "Power is work over time.\n$$P = W / t$$\nYou have 52.0 J and 4.0 s, so divide. Pick a different method if stuck, or a unit check helps.\n"
        self.assertEqual(deliver([reply]), reply)

    def test_closed_item_unchanged(self):
        reply = "The answer is **b**, 13.0 W. Pick b.\n"
        self.assertEqual(deliver([reply], closed=True), reply)


if __name__ == "__main__":
    unittest.main()
