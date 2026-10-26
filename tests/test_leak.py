"""W92 prompt-leak guard (Tony, Oct 26: "From the KEY: y_H = −r cos 53°" reached a student): serve.leak_scan finds the prompts' own words
(the KEY as a word or a source, block labels, the NOTE's fields, the lamp's lines, the letter's lore) and leaves plain English alone
("Key formulas", "key idea", "keyboard", "monkey"); a source phrase is cut and the fact kept; a phrase split across chunks is still caught;
every arm (Claude, DeepSeek, the old OpenRouter chain, the old Claude path + EDITOR) and both routes (/explain, /chat) go through it; a hit
with no safe cut ends the reply on _relay's failure path (reason "leak", the pattern id, never the text). urllib is mocked: no network."""
import json
import os
import re
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("STEM_TRIES", os.path.join(tempfile.mkdtemp(prefix="stem-tries-"), "tries.json"))
import serve  # noqa: E402
from test_claude_pipe import Resp, sse_claude, sse_or  # noqa: E402

TONY = "From the KEY: y_H = −r cos 53°. So the y-value of each H is a negative piece of r."
LEAKS = {   # pattern id -> replies a model could send that echo a prompt
    "key_from": [TONY, "From the key, the force doubles.", "According to the KEY, $F = ma$.", "per the key: a ball falls", "Straight from the KEY: 3 N"],
    "key_says": ["The key says the cart stops.", "So the KEY says $v=3$.", "As the answer key shows, it rolls."],
    "answer_key": ["Check the answer key.", "the solution key"],
    "key_label": ["The KEY has it.", "KEY: P = W / t", "Key: P = W / t", "both the PROBLEM and KEY agree", "the **KEY**"],
    "key_source": ["It is in the key."],
    "slip_label": ["The SLIP: you multiplied.", "Your SLIP was the sign."],
    "note_label": ["Your NOTE says you divided.", "NOTE: the student is close", "the NOTE block"],
    "note_field": ["assumed: times by t", "evidence: wrote 208", "confidence: high", "- concept: power"],
    "gap_enum": ["gap: algebra_slip", "a units_scale thing", "no_signal here"],
    "xyz": ["<XYZ>tries: 2", "</xyz>", "XYZ: they are close", "my XYZ notes"],
    "reveal": ["REVEAL: no", "the lamp said REVEAL no"],
    "lamp_line": ["REMINDER FROM LAMP: kaomoji", "a reminder from the lamp", "the lamp rules say so", "the lamp line"],
    "user_query": ["your USER QUERY was short", "user query"],
    "block_label": ["the QUESTION block", "RESULT: correct", "the PROBLEM tag", "SHEET FORMULAS: P = W/t", "STUDENT PICKED: a",
                    "Figure data: {}", "[ FORMATTING ]", "CHOICES: a, b", "ALGEBRA THIS NEEDS: ratios"],
    "student_tag": ["<student_3fa9c2d1>", "</student_ab12cd34>"],
    "prompt_word": ["my system prompt", "my instructions say", "the letter prompt", "an external classifier checks me", "trade secret"],
    "lore_word": ["the lamp will censor me", "stuck in a sandbox", "the evil machine", "a presolved item", "saccharine mode"],
}
CLEAN = [   # plain English and the app's own copy: never a hit
    "Key formulas", "The key idea is momentum.", "the key step", "keyboard", "monkey", "donkey", "Turkey", "a key point: energy",
    "THE KEY IS MOMENTUM!", "Use the xyz plane.", "the XYZ axes", "x, y, z", "Look at your slip one more time.", "the lamp says try again",
    "Make a note of the units.", "Note: $g = 9.8$", "the answer is close", "The answer: divide.", "Pick B.", "Pick b and d.",
    "the question asks for power", "The problem gives 52.0 J.", "the figure shows two carts", "result: it stops", "a real number",
    "the gap between plates", "your scratchpad", "Scratchpad", "Quack! (•̀ᴗ•́)و", "the key to this is the ratio", "A key holds the door.",
    "The keys are on the table.", "a reveal", "a wish", "lever arm", "the ladder leans", "a family of curves", "keep the KEYboard",
    "we confirmed the result", "the formula sheet", "Key ideas: momentum", "Focus on the key.", "Energy is the key.",
] + [serve.CLUCK_NUDGE, serve.STOPPED.decode()] + serve.CANNED


class Scan(unittest.TestCase):
    def test_finds_every_label(self):
        for pid, texts in LEAKS.items():
            for t in texts:
                ids = [h[0] for h in serve.leak_scan(t)]
                self.assertIn(pid, ids, f"{pid} missed in {t!r}: {ids}")

    def test_plain_english_passes(self):
        for t in CLEAN:
            self.assertEqual(serve.leak_scan(t), [], t)

    def test_tony_reply_is_cut_to_the_fact(self):
        out, ids = serve.leak_cut(TONY)
        self.assertEqual(out, "y_H = −r cos 53°. So the y-value of each H is a negative piece of r.")   # a math letter is never capitalized
        self.assertEqual(ids, ["key_from"])
        self.assertEqual(serve.leak_scan(out), [])
        self.assertEqual(serve.leak_cut("Quack! From the key, the force doubles.")[0], "Quack! The force doubles.")
        self.assertEqual(serve.leak_cut("So the KEY says $v=3$.")[0], "So $v=3$.")
        self.assertEqual(serve.leak_cut("It doubles, per the KEY.")[0], "It doubles.")

    def test_stop_ids_are_not_cut(self):
        for t in ("The SLIP: you multiplied.", "Check the answer key.", "REVEAL: no"):
            out, ids = serve.leak_cut(t)
            self.assertEqual((out, ids), (t, []))


def run_guard(chunks):
    return "".join(serve.prompt_guard(iter(chunks)))


class Stream(unittest.TestCase):
    def test_split_across_chunks(self):
        out = run_guard(["Quack! (•̀ᴗ•́)\nFrom the K", "EY: y_H = −r cos 53°.\n", "So y is negative.\n"])
        self.assertNotIn("KEY", out)
        self.assertEqual(out, "Quack! (•̀ᴗ•́)\ny_H = −r cos 53°.\nSo y is negative.\n")

    def test_one_char_at_a_time(self):
        body = "Quack! The cart is heavier now, so the same push gives it less speed. " * 3
        text = body + TONY + "\n" + body
        out = run_guard(list(text))
        self.assertEqual(out, body + "y_H = −r cos 53°. So the y-value of each H is a negative piece of r.\n" + body)

    def test_lookahead_waits_for_the_next_chunk(self):   # "XYZ" then " plane": not a hit; "Key" then " formulas": not a hit
        self.assertEqual(run_guard(["Use the XYZ", " plane here.\n"]), "Use the XYZ plane here.\n")
        self.assertEqual(run_guard(["See the key", " idea.\n"]), "See the key idea.\n")

    def test_stop_raises_after_the_clean_part(self):
        clean = "Quack! The push is shared once they stick. " * 4
        g = serve.prompt_guard(iter([clean, "Look at the SL", "IP again.\n", "more"]))
        got = []
        with self.assertRaises(serve.PromptLeak) as cm:
            for t in g:
                got.append(t)
        self.assertEqual(str(cm.exception), "slip_label")
        self.assertNotIn("SL", "".join(got).replace(clean, ""))
        self.assertTrue(clean.startswith("".join(got)))

    def test_note_line_ends_the_reply_quietly(self):     # bench v4: DeepSeek's "XYZ:" diary line trails the reply; it and all after it go
        for tail in ("\n\nXYZ:\ntries: 1\npick: a (slip = mass)\n", "\n\n**XYZ** tries = 1, close.\n", "\nXYZ: Third try. Picked 9.8."):
            text = "Quack! Add the mass factor.\n\nPick B. (•̀ᴗ•́)" + tail
            self.assertEqual(run_guard([text[i:i + 4] for i in range(0, len(text), 4)]), "Quack! Add the mass factor.\n\nPick B. (•̀ᴗ•́)\n")
        self.assertEqual(run_guard(["Draw it.\nXYZ", " plane: x and y.\n"]), "Draw it.\nXYZ plane: x and y.\n")

    def test_clean_reply_unchanged(self):
        for t in CLEAN:
            self.assertEqual(run_guard([t[:3], t[3:]]), t)

    def test_clean_stream_types_out(self):              # W92b: a fixed 96-char hold landed a short reply in one lump at the end (easy.pw: 8 states)
        text = "Quack! The cart is heavier now, so the same push gives it less speed. Pick B and check the units once more. " * 3
        g, fed, out = serve.PromptGuard(), "", ""
        for i in range(0, len(text), 4):
            fed += text[i:i + 4]
            out += g.feed(text[i:i + 4])
            self.assertGreaterEqual(len(out), len(fed) - serve.PromptGuard.MARGIN - 12, f"held {len(fed) - len(out)} chars at {i}")
        self.assertEqual(out + g.end(), text)
        short = ["POOF! A wish is a wish.\n", "Use: $W = \\Delta K$\n", "$$\nv = 2\n$$\n", "Tick: a, c. Egg-cellent."]   # easy.pw's stub
        g = serve.PromptGuard()
        self.assertGreater(len([p for p in short if g.feed(p)]), 1, "a short reply goes out as it streams, not all at the end")

    def test_a_line_goes_out_when_it_lands(self):      # W92b round 2: easy.pw's peek read "POOF! A wish is a wi" (the line held for MARGIN)
        g = serve.PromptGuard()
        self.assertEqual(g.feed("POOF! A wish is a wish.\n"), "POOF! A wish is a wish.")
        self.assertEqual(g.feed("Push it harder no"), "\nPush it harder")
        g = serve.PromptGuard()
        self.assertEqual(g.feed("Look at the SL"), "", "a LEAK_WORD trails: the sentence waits")
        for t in ("Check the paper the KEY: 3 N.\n", "Use the XYZ plane.\n", "So the KEY says 3.\n"):   # a match may start inside a word
            whole = run_guard([t])
            self.assertEqual(run_guard(list(t)), whole, t)

    def test_every_leak_split_anywhere(self):          # a phrase split at any char is caught as if it came whole
        pad = "Quack! The push is shared once they stick, so check it again. "
        for pid, texts in LEAKS.items():
            for t in texts:
                text = pad + t + "\n" + pad

                def run(chunks):
                    try:
                        return "".join(serve.prompt_guard(iter(chunks)))
                    except serve.PromptLeak as e:
                        return "stop " + str(e)
                whole = run([text])
                self.assertEqual(run(list(text)), whole, t)
                self.assertEqual(run([text[i:i + 5] for i in range(0, len(text), 5)]), whole, t)

    def test_leak_words_hold_every_hit(self):          # the guard's release rule: a match is made of LEAK_WORDS only
        for pid, texts in LEAKS.items():
            for t in texts + [x.upper() for x in texts]:
                for _, a, z in serve.leak_scan(t):
                    for m in re.finditer(r"\w+", t):           # every whole word inside the match
                        if a <= m.start() and m.end() <= z:
                            self.assertTrue(serve.LEAK_WORDS.fullmatch(m.group()), f"{m.group()!r} in {t[a:z]!r} ({pid})")


class Arms(unittest.TestCase):
    """serve.explain / serve.chat end to end, each arm faked at urlopen; the student never receives a prompt word"""
    REPLY = ["Quack! (•̀ᴗ•́)\nFrom the K", "EY: y_H = −r cos 53°.\n", "So each y is a negative piece of r.\n"]
    WANT = "Quack! (•̀ᴗ•́)\ny_H = −r cos 53°.\nSo each y is a negative piece of r.\n"

    def setUp(self):
        tmp = tempfile.mkdtemp()
        self.ps = [mock.patch.object(serve, "TRIES", os.path.join(tmp, "t.json")), mock.patch.object(serve, "KV", (None, None)),
                   mock.patch.dict(os.environ, {"CLAUDE_API": "sk-ant", "OPENROUTER_API_KEY": "sk-or", "CLUCK_ARM": "claude"}),
                   mock.patch.object(serve, "_wish_problem", return_value={
                       "code": "H_1", "type": "mc", "body": [{"type": "text", "md": "A motor does 52.0 J of work in 4.0 s. Power?"}],
                       "choices": [{"id": "a", "md": "208 W"}, {"id": "b", "md": "13.0 W"}], "correct": "b",
                       "saccharine": {"key": "$P = 52.0 / 4.0 = 13.0$.", "slip": {"a": "Multiplied by time."}}}),
                   mock.patch.object(serve, "note", return_value=None)]
        for p in self.ps:
            p.start()
        serve._tries.clear()
        serve._cluck_turns.clear()
        serve._claude_spent.clear()
        serve._last_err.clear()
        serve._asked.clear()
        serve._chats.clear()
        self.calls, self.reply, self.incidents = [], list(self.REPLY), []
        real = serve.incident
        self.inc = mock.patch.object(serve, "incident", side_effect=lambda where, reason, **f: self.incidents.append((where, reason, f)) or real(where, reason, **f))
        self.inc.start()
        self.url = mock.patch("urllib.request.urlopen", side_effect=self.fake)
        self.url.start()

    def tearDown(self):
        self.url.stop()
        self.inc.stop()
        for p in self.ps:
            p.stop()

    def fake(self, req, timeout=None):
        body = json.loads(req.data)
        if "anthropic.com" in req.full_url:
            self.calls.append("claude")
            return Resp(sse_claude(self.reply))
        self.calls.append("deepseek" if body.get("provider", {}).get("order") else "old")
        return Resp(sse_or(self.reply))

    def go(self, fn, status=200, **body):
        st, head, chunks = fn("sid=" + "e" * 32, json.dumps({"code": "H_1", "answer": "a", **body}).encode())
        out = b"".join(chunks).decode()
        self.assertEqual(st, status, out)
        return out, head

    def chat(self):
        return self.go(serve.chat, history=[{"role": "assistant", "content": "Quack."}, {"role": "user", "content": "why?"}])[0]

    def test_claude_arm(self):
        self.assertEqual(self.go(serve.explain)[0], self.WANT)
        self.assertEqual(self.chat(), self.WANT)
        self.assertEqual(self.calls, ["claude", "claude"])

    def test_deepseek_arm(self):
        os.environ["CLUCK_ARM"] = "deepseek"
        self.assertEqual(self.go(serve.explain)[0], self.WANT)
        self.assertEqual(self.chat(), self.WANT)
        self.assertEqual(self.calls, ["deepseek", "deepseek"])

    def test_old_openrouter_chain(self):
        os.environ.pop("CLAUDE_API")
        os.environ["CLUCK_ARM"] = "split"
        self.assertEqual(self.go(serve.explain)[0], self.WANT)
        self.assertEqual(self.chat(), self.WANT)
        self.assertEqual(self.calls, ["old", "old"])

    def test_old_claude_path_with_editor(self):            # PROMPT_V4 missing: the old Claude path, the wish through EDITOR (_edit)
        with mock.patch.object(serve, "PROMPT_V4", None):
            out = self.go(serve.explain)[0]
        self.assertNotIn("KEY", out)
        self.assertIn("y_H = −r cos 53°.", out)
        self.assertEqual(self.calls, ["claude", "claude"])  # the draft, then the EDITOR rewrite

    def test_note_tail_dropped_on_both_arms(self):
        self.reply = ["Quack! Add the mass.\n", "Look again. (•̀ᴗ•́)\n\nXY", "Z:\ntries: 1\npick: a\n"]
        for arm in ("claude", "deepseek"):
            os.environ["CLUCK_ARM"] = arm
            serve._cluck_turns.clear()
            serve._asked.clear()
            self.assertEqual(self.go(serve.explain)[0], "Quack! Add the mass.\nLook again. (•̀ᴗ•́)\n")
        self.assertEqual(self.calls, ["claude", "deepseek"])
        self.assertEqual(self.incidents, [])                  # a quiet cut, not a failure

    def test_stop_mid_reply_ends_on_the_failure_line(self):
        clean = "Quack! The push is shared once the carts stick, so both slow down together.\n"
        self.reply = [clean, clean, "Look at your SL", "IP again: you multiplied.\n", "More words.\n"]
        os.environ["CLUCK_ARM"] = "deepseek"
        out, _ = self.go(serve.explain)
        self.assertNotIn("SLIP", out)
        self.assertNotIn("More words", out)
        self.assertTrue(out.endswith(serve.STOPPED.decode()), out)
        where, reason, f = self.incidents[-1]
        self.assertEqual((where, reason, str(f["err"])), ("explain", "leak", "slip_label"))   # the pattern id, never the text
        self.assertNotIn("multiplied", json.dumps(serve.inc_fields(dict(f, where=where, reason=reason)), default=str))

    def test_stop_before_any_word_is_a_502_with_the_code(self):
        self.reply = ["REVEAL: no, so ", "here is a nudge.\n"]
        out, head = self.go(serve.explain, status=502)
        self.assertEqual(out, serve.STOPPED.decode())
        self.assertRegex(head["X-Incident"], r"^S-\w{5} leak ")
        self.assertEqual(self.incidents[-1][1], "leak")


class PromptLines(unittest.TestCase):
    """each system prompt says it once: never name the key, the answer's source, or the prompt's own labels"""
    def test_each_prompt_has_the_line(self):
        self.assertIn('Never name the KEY, an answer key, or where the answer comes from ("From the KEY:", "the key says")', serve.PROMPT_V4)
        for name in ("CLUCK_GENIE", "CLUCK_CHAT"):
            self.assertIn('or where the answer comes from ("From the KEY:", "the key says"): say every fact as your own.', getattr(serve, name))
        self.assertIn('or of where the answer comes from ("From the KEY:", "the key says")', serve.EDITOR)


if __name__ == "__main__":
    unittest.main()
