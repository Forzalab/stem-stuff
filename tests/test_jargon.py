"""tools/jargon.py: provenance from the file extension (.json/.md = ai, anything else = human), a term is blacklisted
when it is frequent in AI sources (>= min_ai) and absent or rare in human ones (<= max_human), common English never
counts, bank JSON reads question + choice text only, and the shipped manifest builds current blacklists."""
import json
import os
import subprocess
import sys
import tempfile
import unittest
import unittest.mock

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import jargon  # noqa: E402


def write(d, name, text):
    with open(os.path.join(d, name), "w", encoding="utf-8") as f:
        f.write(text)
    return name


class Provenance(unittest.TestCase):
    def test_by_extension(self):
        for p in ["banks/B.json", "notes/x.md", "X.JSON", "a/b.MD"]:
            self.assertEqual(jargon.provenance(p), "ai", p)
        for p in ["exam.txt", "book.pdf", "slides.pptx", "lecture.key", "README"]:
            self.assertEqual(jargon.provenance(p), "human", p)

    def test_manifest_tag_ignored(self):
        with tempfile.TemporaryDirectory() as d:
            a = write(d, "a.md", "kinetic kinetic kinetic")
            out = jargon.build([{"path": a, "course": "c", "provenance": "human"}], "c", d)
            self.assertEqual(out["ai_sources"], [a])
            self.assertEqual([t["term"] for t in out["terms"]], ["kinetic"])

    def test_no_reader(self):
        with tempfile.TemporaryDirectory() as d:
            write(d, "slides.pptx", "x")
            with self.assertRaises(ValueError):
                jargon.build([{"path": "slides.pptx", "course": "c"}], "c", d)

    def test_pdf_without_pdftotext_is_a_clear_error(self):  # CI has no poppler: a ValueError, not a raw OSError
        with tempfile.TemporaryDirectory() as d:
            write(d, "book.pdf", "x")
            with unittest.mock.patch.object(jargon.subprocess, "run", side_effect=FileNotFoundError("pdftotext")):
                with self.assertRaisesRegex(ValueError, "pdftotext"):
                    jargon.read_texts(os.path.join(d, "book.pdf"))


class Build(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.d = self.tmp.name

    def tearDown(self):
        self.tmp.cleanup()

    def black(self, entries, **kw):
        return {t["term"]: t for t in jargon.build(entries, "phys", self.d, **kw)["terms"]}

    def test_ai_frequent_human_rare(self):
        ai1 = write(self.d, "bank.json", json.dumps({"problems": [
            {"body": [{"md": "Kinetic energy. Entropy rises. Entropy."}], "choices": [{"md": "entropy"}, {"md": "momentum"}]}]}))
        ai2 = write(self.d, "notes.md", "Kinetic energy, kinetic energy. Momentum momentum. The ball rolls the ball.")
        hum = write(self.d, "exam.txt", "Kinetic energy is here. More kinetic energy. Momentum once.")
        e = [{"path": p, "course": "phys"} for p in (ai1, ai2, hum)] + [{"path": ai2, "course": "other"}]
        t = self.black(e)
        self.assertEqual(t["entropy"], {"term": "entropy", "ai": 3, "human": 0})  # absent in human text
        self.assertEqual(t["momentum"], {"term": "momentum", "ai": 3, "human": 1})  # rare in human text
        self.assertNotIn("kinetic", t)          # 3 AI uses, but 2 human uses: students meet it
        self.assertNotIn("kinetic energy", t)
        self.assertNotIn("ball", t)             # common English is never jargon
        out = jargon.build(e, "phys", self.d)
        self.assertEqual(out["ai_sources"], sorted([ai1, ai2]))
        self.assertEqual(out["human_sources"], [hum])
        self.assertEqual([x["term"] for x in out["terms"]], sorted(x["term"] for x in out["terms"]))

    def test_thresholds(self):
        ai = write(self.d, "a.md", "entropy entropy")
        e = [{"path": ai, "course": "phys"}]
        self.assertNotIn("entropy", self.black(e))
        self.assertIn("entropy", self.black(e, min_ai=2))
        hum = write(self.d, "h.txt", "entropy")
        e.append({"path": hum, "course": "phys"})
        self.assertIn("entropy", self.black(e, min_ai=2))
        self.assertNotIn("entropy", self.black(e, min_ai=2, max_human=0))

    def test_human_only_is_empty(self):
        h = write(self.d, "h.txt", "entropy entropy entropy entropy")
        self.assertEqual(jargon.build([{"path": h, "course": "phys"}], "phys", self.d)["terms"], [])

    def test_bank_json_question_and_choices_only(self):
        bank = {"problems": [{"body": [{"type": "text", "md": "Which is centrality?"}],
                              "choices": [{"id": "a", "md": "attitude centrality"}],
                              "wrong": [{"choice": "a", "hint": "zygomorphic zygomorphic zygomorphic"}],
                              "title": "zygomorphic"}]}
        p = write(self.d, "bank.json", json.dumps(bank))
        self.assertEqual(jargon.read_texts(os.path.join(self.d, p)), ["Which is centrality?", "attitude centrality"])


    def test_list_md_joined(self):
        p = write(self.d, "bank.json", json.dumps({"problems": [{"body": [{"md": ["line one", "", "line two"]}]}]}))
        self.assertEqual(jargon.read_texts(os.path.join(self.d, p)), ["line one\n\nline two"])


class External(unittest.TestCase):
    def test_missing_external_skips_course_only(self):
        with tempfile.TemporaryDirectory() as d:
            write(d, "a.md", "entropy entropy entropy")
            man = write(d, "m.json", json.dumps([
                {"path": "a.md", "course": "here"},
                {"path": "a.md", "course": "away"},
                {"path": "/no/such/brain/x.txt", "course": "away", "external": True}]))
            self.assertEqual(jargon.missing_external(json.load(open(os.path.join(d, man))), "away", d),
                             ["/no/such/brain/x.txt"])
            out = os.path.join(d, "out")
            os.mkdir(out)
            argv = ["--manifest", os.path.join(d, man), "--out-dir", out, "--root", d]
            self.assertEqual(jargon.main(argv + ["--check"]), 1)       # "here" is stale: still checked
            self.assertEqual(jargon.main(argv), 0)
            self.assertEqual(sorted(os.listdir(out)), ["here-black.json"])  # "away" skipped, not written
            self.assertEqual(jargon.main(argv + ["--check"]), 0)


class Shipped(unittest.TestCase):
    def test_manifest_builds_and_is_current(self):
        with open(jargon.MANIFEST, encoding="utf-8") as f:
            entries = json.load(f)
        self.assertTrue(entries)
        for e in entries:  # in-repo sources must exist; external (brain) ones may be absent (CI) -> course skipped
            if not e.get("external"):
                self.assertTrue(os.path.exists(os.path.join(ROOT, e["path"])), e["path"])
        r = subprocess.run([sys.executable, os.path.join(ROOT, "tools", "jargon.py"), "--check"],
                           capture_output=True, text=True, timeout=120)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)


if __name__ == "__main__":
    unittest.main()
