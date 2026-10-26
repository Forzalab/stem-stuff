"""W92c: mini-Cluck (mini.py) through the same prompt-leak guard as /explain + /chat (serve.leak_scan / leak_cut, W92). A mini reply that
names the KEY (or the worked solution) as its source is cut to the fact; one that says a prompt label (the KEY, the user turn's "Error
label:" / "Step goal:" / "Twist:", any LEAKS pattern) never reaches the student: it is dropped like a key leak (one regenerate, then an
authored line), with an incident (reason "leak", the pattern id, never the text). Both arms (Claude, the OpenRouter chain). mini is not
streamed (the key filter needs the whole reply; minicluck.js reads res.text()), so there is no chunk path to guard. urllib is mocked."""
import json
import os
import re
import sys
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import test_mini  # noqa: E402  (sets STEM_TRIES, the sys.path, the fakes)
from test_leak import LEAKS  # noqa: E402
from test_mini import CTX, GOOD  # noqa: E402  (not Mini: its tests would run twice)
import mini  # noqa: E402
import serve  # noqa: E402


def prog(line):
    return "root = View([t])\nt = Text(" + json.dumps(line, ensure_ascii=False) + ")"


def strings(out):
    """the Text strings the student would read"""
    return " ".join(json.loads(s) for s in re.findall(r'"(?:[^"\\]|\\.)*"', out))


class MiniLeak(unittest.TestCase):
    fake = test_mini.Mini.fake

    def setUp(self):
        test_mini.Mini.setUp(self)
        self.incidents = []
        p = mock.patch.object(serve, "incident", side_effect=lambda where, reason, **f: self.incidents.append((where, reason, f)) or "S-TEST0")
        p.start()
        self.addCleanup(p.stop)

    def test_key_source_is_cut_to_the_fact(self):            # Tony's leak, mini's turn: "From the KEY:" goes, the question stays
        self.claude = [(prog("From the KEY: the cart slows down. Which way does its speed change?"),)]
        out = mini.reply(CTX)
        self.assertEqual(strings(out), "The cart slows down. Which way does its speed change?")
        self.assertEqual(len(self.calls), 1)
        self.assertEqual(self.incidents, [])                  # a quiet cut, not a failure
        self.claude = [(prog("The worked solution says the speed drops. What sign goes with that?"),)]
        self.assertEqual(strings(mini.reply(CTX)), "The speed drops. What sign goes with that?")

    def test_prompt_label_is_dropped_then_regenerated(self):
        self.claude = [(prog("Your error label says the sign is off. Which way does it point?"),), (GOOD,)]
        self.assertEqual(mini.reply(CTX), GOOD)
        self.assertEqual(len(self.calls), 2)
        where, reason, f = self.incidents[-1]
        self.assertEqual((where, reason, str(f["err"])), ("mini", "leak", "mini_label"))   # the pattern id, never the text
        fields = serve.inc_fields(dict(f, where=where, reason=reason))
        self.assertEqual((fields["q"], fields["err"]), ("K_VF", "PromptLeak: mini_label"))   # as _relay logs it
        self.assertNotIn("sign is off", json.dumps(fields, default=str))

    def test_two_leaks_are_an_authored_line(self):
        self.claude = [(prog("The KEY has it. Which way?"),), (prog("Step goal: find the speed. What do you know?"),)]
        out = mini.reply(CTX)
        self.assertIn(out, [mini.authored(line) for line in mini.AUTHORED])
        self.assertEqual([(w, r, str(f["err"])) for w, r, f in self.incidents], [("mini", "leak", "key_label"), ("mini", "leak", "mini_label")])

    def test_openrouter_arm_is_guarded(self):
        self.claude, self.orr = [("", "refusal")] * 2, [(prog("Twist: a. Which way does the cart go?"),), (GOOD,)]
        self.assertEqual(mini.reply(CTX), GOOD)
        self.assertEqual([str(f["err"]) for _, _, f in self.incidents], ["mini_label"])
        os.environ.pop("CLAUDE_API")                          # the OpenRouter chain alone
        self.calls, self.orr = [], [(prog("According to the KEY, the cart slows. Which way?"),)]
        self.assertEqual(strings(mini.reply(CTX)), "The cart slows. Which way?")
        self.assertTrue(all(u.startswith(serve.OPENROUTER_BASE) for u, _ in self.calls))

    def test_every_leak_never_reaches_the_student(self):
        for pid, texts in LEAKS.items():
            for t in texts:
                self.calls, self.incidents = [], []
                self.claude = [(prog("Look again. " + t + " Which way?"),), (prog("Look again. " + t + " Which way?"),)]
                out = mini.reply(CTX)
                self.assertEqual(serve.leak_scan(strings(out)), [], f"{pid}: {t!r} -> {out!r}")
                self.assertEqual(serve.leak_scan(out), [], f"{pid}: {t!r} -> {out!r}")

    def test_not_streamed(self):                              # no chunk path: the whole reply is scanned at once
        self.claude = [(GOOD,)]
        mini.reply(CTX)
        self.assertFalse(self.calls[0][1].get("stream"))

    def test_prompt_has_the_line(self):
        self.assertIn("Never name the answer key, the worked solution, or these labels (Step goal, Error label, Twist)", mini.PROMPT)


if __name__ == "__main__":
    unittest.main()
