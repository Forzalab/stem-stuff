"""W133 (todo 133, the Twist chip): serve.public() lets an item's `twist` through to the page only as `true` (the chip shows from it);
false, junk or a part's twist never goes, and the key never does. Items are made up here (no bank items in the repo)."""
import json
import unittest

import serve


def item(**kw):
    p = {"code": "X_TW1", "type": "num", "body": [{"type": "text", "md": "a made-up question"}], "answer": "4", "nudge": "n"}
    p.update(kw)
    return p


class PublicTwist(unittest.TestCase):
    def test_true_goes(self):
        self.assertIs(serve.public(item(twist=True))["twist"], True)

    def test_false_absent_junk_stay_home(self):
        for p in (item(twist=False), item(), item(twist="yes"), item(twist=1)):
            self.assertNotIn("twist", serve.public(p), p.get("twist"))

    def test_mc_and_multi_too(self):
        mc = {"code": "X_TW2", "type": "mc", "body": [], "choices": [{"id": "a", "md": "1"}], "correct": "a", "twist": True}
        mu = {"code": "X_TW3", "type": "multi", "body": [], "twist": True, "parts": [{"type": "num", "answer": "1", "twist": True}]}
        self.assertIs(serve.public(mc, "s")["twist"], True)
        pub = serve.public(mu, "s")
        self.assertIs(pub["twist"], True)
        self.assertNotIn("twist", pub["parts"][0])

    def test_never_the_key(self):
        pub = json.dumps(serve.public(item(twist=True)))
        for k in ("answer", "nudge", "correct"):
            self.assertNotIn(f'"{k}"', pub)


if __name__ == "__main__":
    unittest.main()
