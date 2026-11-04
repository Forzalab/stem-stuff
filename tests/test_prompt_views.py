"""The Claude arm's system text asks for a Tug / Flip and bans a markdown pipe table (TUG-VIEW.md, TABLE-RENDER.md Fix A): the views block rides in
the cached system block of every explain prompt (any item with a figure context), and the EDITOR pass carries the same ban."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import serve  # noqa: E402


class PromptViews(unittest.TestCase):
    def system_text(self):
        return serve.PROMPT_V4 + serve.V4_FIG_FIXED          # the cached system block of every item with a figure context (serve._v4_claude_system)

    def test_system_block_has_tug_flip_and_the_pipe_ban(self):
        t = self.system_text()
        self.assertIn("Tug(", t)
        self.assertIn("Flip(", t)
        self.assertIn("Never a markdown pipe table", t)

    def test_tug_is_the_first_pick_row_and_the_table_example_is_not_first(self):
        v = serve.V4_VIEWS
        self.assertLess(v.index("a Tug, one row per pull"), v.index("their value vs the right one: a Table"))
        self.assertLess(v.index("a Tug, one row per pull"), v.index("a stepper, one pass per step"), "Tug leads the pick list")

    def test_no_dollar_in_the_view_examples(self):
        ex = serve.V4_VIEWS.split("Examples:")[1].split("Numbers in a view")[0]
        self.assertNotIn("$", ex, "inside a view: plain symbols, no $")

    def test_editor_carries_the_ban(self):
        self.assertIn("Never a markdown pipe table", serve.EDITOR)


if __name__ == "__main__":
    unittest.main()
