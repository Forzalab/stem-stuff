"""Cluck's style card + few-shots (prompts/cluck-style.txt): PERMANENT, every bank, no expiry. The cram-day intel block keeps its own expiry."""
import datetime
import os
import re
import sys
import tempfile
import unittest
from unittest import mock

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
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
        self.assertTrue(serve.STYLE_V4.startswith("STYLE CARD"))
        for k in ("SUBJECT RULE", "NO AI TELLS", "BAD -> GOOD", "Reply 1", "Reply 2"):
            self.assertIn(k, serve.STYLE_V4)

    def test_good_bad_pairs_and_two_whole_replies(self):
        pairs = re.findall(r"^- Bad: .+ Good: .+$", serve.STYLE_V4, re.M)
        self.assertGreaterEqual(len(pairs), 3)
        self.assertEqual(len(re.findall(r"^Reply \d,", serve.STYLE_V4, re.M)), 2)

    def test_present_for_any_bank_after_the_cram_window_and_intel_absent(self):
        for code in ("PHYS_MC4", "CALC1_X", "PSY6_Q1"):
            v4 = dict(code=code, bank="Audience: x.", fig=None, turns=[], arm="claude")
            blocks = sys_text(v4, False)
            txt = "\n".join(b["text"] for b in blocks)
            self.assertIn("STYLE CARD", txt, code)
            self.assertNotIn("CRAM DAY GUIDE", txt, code)
            self.assertNotIn("cache_control", blocks[-1], "no extra cache breakpoint (4 is the limit)")
            self.assertEqual(sum("cache_control" in b for b in blocks), 2)

    def test_deepseek_head_has_the_card_too(self):
        src = open(os.path.join(ROOT, "serve.py"), encoding="utf-8").read()
        self.assertIn("(\"\\n\\n\" + STYLE_V4) if STYLE_V4 else \"\"", src)

    def test_letter_is_untouched_byte_for_byte(self):
        self.assertEqual(serve.PROMPT_V4, open(os.path.join(ROOT, "prompts", "cluck-v4.txt"), encoding="utf-8", newline="").read())

    def test_whole_replies_follow_their_own_rules(self):
        card = serve.STYLE_V4
        replies = re.split(r"^Reply \d,[^\n]*\n", card, flags=re.M)[1:]
        self.assertEqual(len(replies), 2)
        ctx = livefig.Ctx("PHYS_X", set(range(0, 11)), [])
        for r in replies:
            fences = re.findall(r"```openui\n(.*?)```", r, re.S)
            self.assertTrue(fences)
            for f in fences:
                prog, log = views_gate.gate(f.strip(), ctx)
                self.assertIsNotNone(prog, log)
            prose = re.sub(r"```.*?```|\$\$.*?\$\$|\$[^$]*\$|\*\*|\([^)]*\)", " ", r, flags=re.S)
            self.assertNotRegex(prose, r"[—–]|--", "no em dash")
            self.assertNotRegex(prose, r"\bnot\b[^.\n]{1,40}\bbut\b", "no not-X-but-Y")
            self.assertNotRegex(prose, r"\b(Let's|Great question)\b")
            self.assertNotIn("?", prose.split("Not quite.")[-1] if "Not quite." in prose else "", "a wrong-pick reply asks nothing")
            for s in re.split(r"(?<=[.!?])\s+|\n", prose):
                self.assertLessEqual(len(s.split()), 20, s)
            issues = aiw.analyze_text(prose, None, 5)["issues"]
            self.assertEqual([i["text"] for i in issues if i["severity"] == "high"], [], "avoid-ai-writing: no high-severity finding")

    def test_cram_diagram_prose_has_no_person_like_object_verbs(self):
        d = serve.cram_data()
        bad = re.compile(r"\b(wants? to|says no|holds ½|holds the|pay the spring|lets go|steals|loves|lies)\b", re.I)
        for g, text in d["diagrams"].items():
            self.assertIsNone(bad.search(text), (g, bad.search(text)))


if __name__ == "__main__":
    unittest.main()
