"""Cluck's style card + few-shots (prompts/cluck-style.txt): PERMANENT, every bank, no expiry. The cram-day intel block keeps its own expiry."""
import datetime
import os
import re
import sys
import tempfile
import unittest
from unittest import mock

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # tests/ (for paths)
import paths
sys.path.insert(0, paths.SERVER_DIR)
os.environ.setdefault("STEM_TODAY", "2026-11-04")
os.environ.setdefault("STEM_TRIES", os.path.join(tempfile.mkdtemp(prefix="stem-tries-"), "tries.json"))
import aiw  # noqa: E402
import livefig  # noqa: E402
import serve  # noqa: E402
import views_gate  # noqa: E402

AFTER = datetime.datetime(2026, 11, 20, 12, 0, tzinfo=serve.PT)


def sys_text(v4, window_open=False):
    with mock.patch.object(serve, "cram_on", return_value=window_open):
        return serve._v4_claude_system(v4)


class StyleCard(unittest.TestCase):
    def test_file_loaded(self):
        """the card = Tony's v7 Cluck prompt (Nov 8), verbatim; the old "show me stage N" flow is gone (one reply = one stepper)"""
        v7 = open(os.path.join(ROOT, "prompts", "cluck-style.txt"), encoding="utf-8", newline="").read()
        self.assertEqual(serve.STYLE_V4, v7.strip())
        self.assertTrue(serve.STYLE_V4.startswith("You are Cluck"))
        for k in ("GOAL", "MODE", "Pictures", "Steps", "Truth", "Tutor note"):
            self.assertIn(k, serve.STYLE_V4)
        self.assertNotIn("show me stage", serve.STYLE_V4)

    def test_present_for_any_bank_after_the_cram_window_and_intel_absent(self):
        for code in ("PHYS_MC4", "CALC1_X", "PSY6_Q1"):
            v4 = dict(code=code, bank="Audience: x.", fig=None, turns=[], arm="claude")
            blocks = sys_text(v4, False)
            txt = "\n".join(b["text"] for b in blocks)
            self.assertIn("One reply holds all the steps", txt, code)
            self.assertNotIn("CRAM DAY GUIDE", txt, code)
            self.assertNotIn("cache_control", blocks[-1], "no extra cache breakpoint (4 is the limit)")
            self.assertEqual(sum("cache_control" in b for b in blocks), 2)

    def test_deepseek_head_has_the_card_too(self):
        src = open(os.path.join(ROOT, "serve.py"), encoding="utf-8").read()
        self.assertIn("(\"\\n\\n\" + STYLE_V4) if STYLE_V4 else \"\"", src)

    def test_letter_is_untouched_byte_for_byte(self):
        self.assertEqual(serve.PROMPT_V4, open(os.path.join(ROOT, "prompts", "cluck-v4.txt"), encoding="utf-8", newline="").read())

    def test_anchor_stepper_passes_the_gate_and_tex_never_holds_the_answer(self):
        """stepper (Nov 8): a Steps with a Geometry anchor + per-step tex / lit passes the gate; an answer in a step formula drops that step"""
        ctx = livefig.Ctx("PHYS_X", set(range(0, 11)), [42.0])
        body = "\n".join(['root = View([s])', 's = Steps(g, [a, b])',
            'g = Geometry("A 0,0; B 4,0; C 4,2", ["seg(A,B)", "seg(B,C)", "arrow(A,C,$F$)"], "A ramp.")',
            'a = Step("We start with the ramp.", null, null, null, null, null, null, "s", "A-B")',
            'b = Step("So we multiply.", null, null, null, null, null, null, "W = F\\,s", "F")'])
        prog, log = views_gate.gate(body, ctx)
        self.assertIsNotNone(prog, log)
        prog, log = views_gate.gate(body.replace("W = F\\,s", "W = 42"), ctx)
        self.assertTrue(prog is None or "42" not in prog, log)

    def test_cram_diagram_prose_has_no_person_like_object_verbs(self):
        d = serve.cram_data()
        bad = re.compile(r"\b(wants? to|says no|holds ½|holds the|pay the spring|lets go|steals|loves|lies)\b", re.I)
        for g, text in d["diagrams"].items():
            self.assertIsNone(bad.search(text), (g, bad.search(text)))


if __name__ == "__main__":
    unittest.main()
