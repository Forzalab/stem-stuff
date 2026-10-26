"""tools/brainrot_list.py: a playlist feed -> [id, title, short], and the CATS block in brainrot.js rewritten between its markers.
No network. Run: python3 -m unittest discover -s tests -p 'test_*.py'"""
import io
import json
import os
import re
import sys
import unittest
import urllib.error
from unittest import mock

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

    WANT = ["Parkour", "Brainrot", "Subway Surfers", "Hydraulic Press", "Soap Cutting", "Kinetic Sand", "Pressure Washing", "Marble Run"]

    def run_main(self, feeds):
        """main() with urlopen mocked per playlist id (feeds: pid -> bytes or an exception) and brainrot.js mocked; -> (written JS, stderr)"""
        def urlopen(url, timeout=None):
            got = feeds.get(url.rsplit("=", 1)[1], FEED.encode())
            if isinstance(got, Exception):
                raise got
            r = mock.MagicMock()
            r.__enter__.return_value.read.return_value = got
            return r
        mopen = mock.mock_open(read_data="x\n  /* list:start (t) */\n  const CATS = [];\n  // list:end\n")
        err = io.StringIO()
        with mock.patch.object(brainrot_list.urllib.request, "urlopen", urlopen), mock.patch("builtins.open", mopen), mock.patch("sys.stderr", err):
            brainrot_list.main()
        return "".join(c.args[0] for c in mopen().write.call_args_list), err.getvalue()

    def names(self, js):
        return [m.group(1) for m in re.finditer(r'^    \["([^"]+)", \[\[', js, re.M)]

    def test_the_8_categories_and_their_fallbacks(self):
        """todo 78 (Tony, Oct 26): 5 more playlists, each with a hand-curated FALLBACK list (used when its feed fails or is empty)."""
        self.assertEqual([n for n, _ in brainrot_list.PLAYLISTS], self.WANT)
        self.assertEqual(list(brainrot_list.FALLBACK), self.WANT[3:])
        for name, rows in brainrot_list.FALLBACK.items():
            self.assertEqual(len(rows), 12, name)
            self.assertEqual(len({r[0] for r in rows}), len(rows), f"{name}: duplicate id")
            for r in rows:
                self.assertTrue(isinstance(r, list) and len(r) == 3, r)
                self.assertTrue(isinstance(r[0], str) and len(r[0]) == 11, r)
                self.assertTrue(isinstance(r[1], str) and r[1], r)
                self.assertIn(r[2], (0, 1), r)
        with open(os.path.join(ROOT, "brainrot.js"), encoding="utf-8") as f:
            self.assertEqual(self.names(f.read()), self.WANT)
        out, _ = self.run_main({})
        self.assertEqual(self.names(out), self.WANT)

    def test_a_failing_or_empty_curated_feed_uses_its_fallback(self):
        pid = dict(brainrot_list.PLAYLISTS)
        empty = b'<feed xmlns="http://www.w3.org/2005/Atom"></feed>'
        out, err = self.run_main({pid["Soap Cutting"]: urllib.error.HTTPError("u", 404, "Not Found", {}, None),
                                  pid["Kinetic Sand"]: empty, pid["Marble Run"]: TimeoutError("timed out")})
        self.assertEqual(self.names(out), self.WANT)
        for name in ("Soap Cutting", "Kinetic Sand", "Marble Run"):
            self.assertIn(f'[{json.dumps(name)}, {json.dumps(brainrot_list.FALLBACK[name], ensure_ascii=False)}]', out)
            self.assertIn(f"{name}: feed failed, using fallback", err)
        self.assertIn('["Hydraulic Press", [["aaaaaaaaaaa"', out)
        self.assertNotIn("Hydraulic Press: feed failed", err)

    def test_an_empty_original_playlist_still_aborts(self):
        with self.assertRaises(SystemExit):
            self.run_main({dict(brainrot_list.PLAYLISTS)["Parkour"]: b'<feed xmlns="http://www.w3.org/2005/Atom"></feed>'})

    def test_no_markers(self):
        with self.assertRaises(SystemExit):
            brainrot_list.rewrite("const CATS = [];", [])


if __name__ == "__main__":
    unittest.main()
