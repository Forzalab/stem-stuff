"""todo 45 (Tony, Oct 23: "regex and strip it out"): no emoji in a Cluck reply, on every arm. serve._relay is the one place every /explain and
/chat reply passes through (Claude, DeepSeek, the old chain, the canned lines): emoji go there, kaomoji stay byte-identical."""
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("STEM_TRIES", os.path.join(tempfile.mkdtemp(prefix="stem-tries-"), "tries.json"))
import serve  # noqa: E402

FAMILY = "\U0001F468‍\U0001F469‍\U0001F467‍\U0001F466"       # man ZWJ woman ZWJ girl ZWJ boy
THUMB = "\U0001F44D\U0001F3FD"                                               # thumbs up, medium skin tone
FLAG = "\U0001F1EF\U0001F1F5"                                                # regional indicators J P
RUNNER = "\U0001F3C3‍♀️"                                      # runner ZWJ female sign VS16
KAOMOJI = ("( •̀ ω •́ )✧ (｡•̀ᴗ-)✧ ٩(◕‿◕)۶ ┐(￣ヘ￣)┌ ♡ ★ ☆ ♪ (ﾉ◕ヮ◕)ﾉ*:･ﾟ✧ (｀・ω・´) ʕ•ᴥ•ʔ (╯°□°)╯︵ ┻━┻ ♥ ☺ ✿ ❀"
           "\nquack (≧▽≦) the lamp says ♪~ ヽ(・∀・)ﾉ")


def relay(chunks):
    status, _, body = serve._relay({"code": "T"}, lambda: iter(chunks), "chat", {})
    return status, b"".join(body).decode("utf-8")


class EmojiStrip(unittest.TestCase):
    def test_reply_comes_out_clean(self):
        reply = f"\U0001F986 Quack! Nice try {THUMB} so close.\nDivide by the time {FAMILY} first. {FLAG}\nYou got this ❤️ {RUNNER}"
        self.assertEqual(relay([reply]), (200, "Quack! Nice try so close.\nDivide by the time first.\nYou got this"))

    def test_kaomoji_survive_byte_identical(self):
        self.assertEqual(serve.emoji_cut(KAOMOJI).encode(), KAOMOJI.encode())
        self.assertEqual(relay([KAOMOJI]), (200, KAOMOJI))
        self.assertEqual(relay([serve.CLUCK_NUDGE]), (200, serve.CLUCK_NUDGE))
        self.assertEqual(serve.emoji_cut("( •̀ ω •́ )✧ \U0001F986 ♡"), "( •̀ ω •́ )✧ ♡")   # an emoji between kaomoji goes, the kaomoji stay

    def test_stream_split_sequences(self):
        reply = f"Nice {THUMB} work {FAMILY} ok ٩(◕‿◕)۶ {FLAG}\nnext\U0001F986line {RUNNER}"
        want = "Nice work ok ٩(◕‿◕)۶\nnextline"
        for n in (1, 2, 3, 5):                                               # every split, down to one code point per chunk
            chunks = [reply[i:i + n] for i in range(0, len(reply), n)]
            self.assertEqual(relay(chunks), (200, want), n)
            self.assertTrue(all(p for p in serve.emoji_strip(iter(chunks))))
        self.assertEqual(relay(["Nice ", "\U0001F468‍", "\U0001F469‍\U0001F467", " work"]), (200, "Nice work"))
        self.assertEqual(relay(["Hi ", "\U0001F1EF", "\U0001F1F5"]), (200, "Hi"))

    def test_only_emoji_is_an_empty_reply(self):
        status, body = relay(["\U0001F986", " \U0001F44D"])
        self.assertEqual((status, body.encode()), (502, serve.STOPPED))


if __name__ == "__main__":
    unittest.main()
