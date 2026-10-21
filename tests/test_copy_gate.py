"""copy_gate.py: FK grade on the whole view (grade-3 passes, grade-9+ fails, under 20 words skipped), TeX and
numbers-with-units stripped, jargon blacklist hit/miss (words and 2-3-grams), overflow per slot budget, aiw lint hits surface,
every issue names its slot."""
import json
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import copy_gate as cg  # noqa: E402

GRADE3 = {  # FK ~2.9
    "title": "When you push a heavy box across the floor, it slows down and then it stops.",
    "body": "The floor rubs against the bottom of the box.",
    "hint": "This rubbing pulls back on the box while you push it forward.",
}
GRADE9 = {
    "body": "Conservation of mechanical energy implies that gravitational potential energy is systematically "
            "transformed into translational kinetic energy, assuming negligible dissipative interactions.",
}


class FK(unittest.TestCase):
    def test_grade3_passes(self):
        g = cg.fk_grade(cg.join_view(GRADE3))
        self.assertTrue(2 <= g <= 4, g)
        self.assertEqual(cg.check_view(GRADE3, set()), [])

    def test_grade9_fails(self):
        self.assertGreater(cg.fk_grade(cg.join_view(GRADE9)), 9)
        fk = [i for i in cg.check_view(GRADE9, set()) if i["check"] == "fk"]
        self.assertEqual(len(fk), 1)
        self.assertEqual(fk[0]["slot"], "*")
        self.assertEqual(fk[0]["slots"], ["body"])

    def test_too_low_fails(self):
        s = {"a": "I see a cat. The cat is big. It is red. I like it. It can run. I run too. We go home."}
        self.assertLess(cg.fk_grade(cg.join_view(s)), 2)
        self.assertEqual([i["check"] for i in cg.check_view(s, set())], ["fk"])

    def test_under_20_words_skipped(self):
        s = {"btn": "Systematically recalculate", "label": "Instantaneous acceleration"}
        self.assertTrue(cg.fk_skipped(s))
        self.assertGreater(cg.fk_grade(cg.join_view(s)), 4)  # would fail if scored
        self.assertEqual(cg.check_view(s, set()), [])

    def test_whole_view_joined_not_per_string(self):
        # each slot alone is short; joined it is one document with one sentence per slot
        self.assertEqual(cg.join_view({"a": "Push it", "b": "Why?"}), "Push it. Why?")

    def test_tex_and_units_stripped(self):
        self.assertEqual(cg.fk_stats("$\\frac{1}{2}mv^2$ at 12 m/s for 3 s, \\(x^2\\) and \\[y\\]")["words"], 3)
        self.assertEqual(cg.fk_grade("$\\int_0^1 f$ 9.8 m/s^2"), None)
        self.assertEqual(cg.jargon_terms("Speed $v = \\Delta x / \\Delta t$ is 5 km", {"delta", "km"}), [])

    def test_syllables_deterministic(self):
        got = {w: cg.syllables(w) for w in ["the", "table", "cake", "jumped", "boxes", "energy", "tree", "a"]}
        self.assertEqual(got, {"the": 1, "table": 2, "cake": 1, "jumped": 1, "boxes": 2, "energy": 3, "tree": 1, "a": 1})


class Jargon(unittest.TestCase):
    def test_blacklist_word(self):
        s = {"label": "The kinetic part"}
        self.assertEqual(cg.check_view(s, {"kinetic"}), [{"check": "jargon", "slot": "label", "term": "kinetic"}])
        self.assertEqual(cg.check_view(s, {"entropy"}), [], "a word not on the blacklist passes")

    def test_blacklist_ngram(self):
        black = {"attitude centrality"}
        self.assertEqual([i["term"] for i in cg.check_view({"chip": "Attitude centrality"}, black)],
                         ["attitude centrality"])
        self.assertEqual(cg.check_view({"chip": "centrality of an attitude"}, black), [])
        self.assertEqual(cg.check_view({"chip": "attitude, centrality"}, black), [], "punctuation breaks an n-gram")

    def test_one_issue_per_term_per_slot(self):
        issues = cg.check_view({"a": "kinetic kinetic", "b": "kinetic"}, {"kinetic"})
        self.assertEqual([(i["slot"], i["term"]) for i in issues], [("a", "kinetic"), ("b", "kinetic")])

    def test_common_words_and_inflections(self):
        common = cg.load_common()
        for w in ["dogs", "running", "jumped", "boxes", "the"]:
            self.assertTrue(cg.is_common(w, common), w)
        self.assertFalse(cg.is_common("kinetic", common))

    def test_load_black_missing_is_empty(self):
        self.assertEqual(cg.load_black("no-such-course"), set())

    def test_load_black_shipped(self):
        black = cg.load_black("phys2a")
        with open(os.path.join(cg.ALLOW_DIR, "phys2a-black.json"), encoding="utf-8") as f:
            self.assertEqual(black, {t["term"] for t in json.load(f)["terms"]})
        self.assertIn("orbit radius", black)  # in >= 3 AI phys2a banks, 0 hits in the human sources


class Overflow(unittest.TestCase):
    def test_overflow(self):
        s = {"btn": "Try again", "label": "Pick the box that moves"}
        self.assertEqual(cg.check_view(s, set(), {"btn": 5, "label": 40}),
                         [{"check": "overflow", "slot": "btn", "len": 9, "budget": 5}])
        self.assertEqual(cg.check_view(s, set(), {"btn": 9}), [])


class Aiw(unittest.TestCase):
    def test_aiw_hit_surfaces(self):
        s = {"ok": "Pick one", "bad": "Let's delve into this"}
        hits = [i for i in cg.check_view(s, set()) if i["check"] == "aiw"]
        self.assertTrue(hits)
        self.assertTrue(all(i["slot"] == "bad" for i in hits))


class Shipped(unittest.TestCase):
    def test_common_list(self):
        path = cg.COMMON_PATH
        with open(path, encoding="utf-8") as f:
            head = f.readline()
        self.assertIn("license:", head)
        words = cg.load_common()
        self.assertEqual(len(words), 5000)
        self.assertTrue({"the", "ball", "push"} <= words)


if __name__ == "__main__":
    unittest.main()
