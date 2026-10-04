"""Sugar rewards assets (design/REWARDS-WIRING.md §6): vendored, licensed, no CDN, icons.js up to date."""
import os
import subprocess
import sys
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class RewardsAssets(unittest.TestCase):
    def test_licenses_next_to_the_files(self):
        for f, words in (("vendor/confetti.browser.js", None), ("vendor/confetti.LICENSE.txt", "ISC License"),
                         ("vendor/fonts/press-start-2p-latin-400-normal.woff2", None), ("vendor/fonts/OFL-press-start-2p.txt", "SIL Open Font License"),
                         ("rewards/icons/LICENSE-fluentui-emoji.txt", "MIT License")):
            p = os.path.join(ROOT, f)
            self.assertTrue(os.path.isfile(p), f)
            if words:
                self.assertIn(words, open(p, encoding="utf-8").read(), f)

    def test_icons_js_is_fresh(self):
        r = subprocess.run([sys.executable, os.path.join(ROOT, "tools", "rw_icons.py"), "--check"])
        self.assertEqual(r.returncode, 0, "run python3 tools/rw_icons.py")


if __name__ == "__main__":
    unittest.main()
