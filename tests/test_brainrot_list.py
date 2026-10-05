"""tools/brainrot_list.py: a playlist feed -> [id, title, short], and the CATS block in brainrot.js rewritten between its markers.
No network. Run: python3 -m unittest discover -s tests -p 'test_*.py'"""
import os
import sys
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import brainrot_list  # noqa: E402

FEED = """<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns="http://www.w3.org/2005/Atom">
 <title>Brainrot</title>
 <entry><yt:videoId>aaaaaaaaaaa</yt:videoId><title>Down in "Ohio" 🤣</title><link rel="alternate" href="https://www.youtube.com/watch?v=aaaaaaaaaaa"/></entry>
 <entry><yt:videoId>bbbbbbbbbbb</yt:videoId><title> skibidi toilet </title><link rel="alternate" href="https://www.youtube.com/shorts/bbbbbbbbbbb"/></entry>
</feed>"""


class BrainrotList(unittest.TestCase):
    def test_parse(self):
        self.assertEqual(brainrot_list.parse(FEED.encode()), [["aaaaaaaaaaa", 'Down in "Ohio" 🤣', 0], ["bbbbbbbbbbb", "skibidi toilet", 1]])

    def test_rewrite_is_idempotent_and_keeps_the_rest(self):
        src = "a();\n  /* list:start (x) */\n  const CATS = [];\n  // list:end\nb();\n"
        cats = [("Brainrot", brainrot_list.parse(FEED.encode()))]
        once = brainrot_list.rewrite(src, cats)
        self.assertEqual(brainrot_list.rewrite(once, cats), once)
        self.assertTrue(once.startswith("a();\n  /* list:start (x) */\n  const CATS = [\n") and once.endswith("  ];\n  // list:end\nb();\n"))
        self.assertIn('["Brainrot", [["aaaaaaaaaaa", "Down in \\"Ohio\\" 🤣", 0], ["bbbbbbbbbbb", "skibidi toilet", 1]]]', once)

    def test_the_shipped_list(self):
        with open(os.path.join(ROOT, "brainrot.js"), encoding="utf-8") as f:
            src = f.read()
        self.assertEqual(src.count("/* list:start"), 1)
        self.assertEqual(src.count("// list:end"), 1)
        for name, _ in brainrot_list.PLAYLISTS:
            self.assertIn(f'["{name}", [["', src)

    def test_no_markers(self):
        with self.assertRaises(SystemExit):
            brainrot_list.rewrite("const CATS = [];", [])


if __name__ == "__main__":
    unittest.main()
