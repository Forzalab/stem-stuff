"""The subject pass (Tony Nov 3 19:18/19:26): mask non-prose as ordered slugs, rewrite the prose, validate, unmask; /explain streams the reply
first and then sends one "\\x1e{"replace": ...}" line only when the validator passes. Stubs only: no network."""
import json
import os
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("STEM_TRIES", os.path.join(tempfile.mkdtemp(prefix="stem-tries-"), "tries.json"))
import serve  # noqa: E402

REPLY = ("Not quite. QUACK (っ˘ω˘ς)\n\nThe idea that fixes it is buoyancy.\n\nForces on the diver:\n```fig\n{\"type\":\"graph\",\"kind\":\"scene\"}\n```\n"
         "$$F_b=\\rho_w g V$$\nThe formula tells you the push is $9.8$ N per litre.\n")


def fixed(masked):
    return (masked.replace("The idea that fixes it is buoyancy.", "You use buoyancy to fix it.")
            .replace("The formula tells you the push is", "You read the push as"))


class Mask(unittest.TestCase):
    def test_round_trip_keeps_every_non_prose_span(self):
        m, spans = serve.subject_mask(REPLY)
        self.assertEqual(serve.subject_unmask(m, spans), REPLY)
        self.assertTrue(any(s.startswith("```fig") for s in spans) and "$$F_b=\\rho_w g V$$" in spans and "$9.8$" in spans)
        self.assertNotIn("```", m)

    def test_good_rewrite_is_kept(self):
        out = serve.subject_pass(REPLY, "k", call=fixed)
        self.assertIn("You use buoyancy to fix it.", out)
        self.assertNotIn("The idea that fixes it", out)
        self.assertIn('```fig\n{"type":"graph","kind":"scene"}\n```', out)

    def test_dropped_slug_falls_back(self):
        self.assertEqual(serve.subject_pass(REPLY, "k", call=lambda m: fixed(m).replace("⟦3⟧", "")), REPLY)

    def test_moved_slug_falls_back(self):
        self.assertEqual(serve.subject_pass(REPLY, "k", call=lambda m: fixed(m).replace("⟦1⟧", "").replace("⟦4⟧", "⟦4⟧⟦1⟧")), REPLY)

    def test_changed_number_falls_back(self):
        self.assertEqual(serve.subject_pass("You got 12 here, the idea fixes it.\n", "k", call=lambda m: m.replace("12", "13")),
                         "You got 12 here, the idea fixes it.\n")

    def test_length_and_lines_guarded(self):
        self.assertEqual(serve.subject_pass(REPLY, "k", call=lambda m: fixed(m) + " and a lot more words " * 20), REPLY)
        self.assertEqual(serve.subject_pass(REPLY, "k", call=lambda m: fixed(m).replace("\n\n", "\n")), REPLY)

    def test_error_falls_back(self):
        def boom(m):
            raise TimeoutError("6 s")
        self.assertEqual(serve.subject_pass(REPLY, "k", call=boom), REPLY)


class ReplaceEvent(unittest.TestCase):
    def run_stream(self, call, swap=True):
        with mock.patch.object(serve, "v4_stream", lambda v4, key, out=None: iter([REPLY[:30], REPLY[30:]])), \
                mock.patch.object(serve, "_subject_call", lambda m, k: call(m)), mock.patch.dict(os.environ, {"CLUCK_SUBJECT": "1"}):
            return list(serve._cluck_stream([], "k", 100, v4={"arm": "claude"}, swap=swap))

    def test_stream_first_then_one_replace_line(self):
        out = self.run_stream(fixed)
        self.assertEqual("".join(out[:2]), REPLY)                                  # the original streams as it comes
        self.assertTrue(out[2].startswith(serve.RS) and out[2].endswith("\n"))
        rep = json.loads(out[2][1:])["replace"]
        self.assertIn("You use buoyancy to fix it.", rep)
        self.assertEqual(len(out), 3)

    def test_dropped_slug_sends_no_replace(self):
        self.assertEqual("".join(self.run_stream(lambda m: fixed(m).replace("⟦2⟧", ""))), REPLY)

    def test_chat_never_gets_a_replace(self):
        self.assertEqual("".join(self.run_stream(fixed, swap=False)), REPLY)


if __name__ == "__main__":
    unittest.main()
