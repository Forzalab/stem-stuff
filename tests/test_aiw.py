"""aiw.py, the gate's Python port of the avoid-ai-writing detector (P4.1b), against the vendored JS
(vendor/avoid-ai-writing/patterns.js @013d1db via tests/aiw-canon.mjs, one node call for all cases):
- differential: the whole result (score, label, issues with type/text/index/severity/suggestion, stats, trinary
  classification, probabilities, confidence, highlight regions) is IDENTICAL to the JS one on
  (a) every input upstream's detector/patterns.test.js passes to analyzeText (recorded, tests/fixtures/aiw/corpus.json.gz;
      inputs over 20,000 chars only with AIW_FULL=1),
  (b) every authored string under banks/ and in problems.json (titles, md lines and blocks, hints, nudges, labels, alts),
      in general, technical and rendered-markdown modes, each problem's copy joined as one document, and each short
      string again inside a 10-word frame so the JS scores it,
  (c) view-sized snippets (80- and 200-char windows of bank text, UI copy, machine-sounding copy, Unicode and Markdown
      edge cases);
- lint_view_strings: false-positive rate on authored bank text, recall on machine-sounding copy, speed per string.
Needs node (as tests/run-all.sh does)."""
import glob
import gzip
import json
import os
import subprocess
import sys
import time
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
import aiw  # noqa: E402

CANON = os.path.join(ROOT, "tests", "aiw-canon.mjs")
CORPUS = os.path.join(ROOT, "tests", "fixtures", "aiw", "corpus.json.gz")
COPY_KEYS = {"md", "hint", "title", "nudge", "label", "prompt", "alt", "how", "miss"}
FRAME = "\n\nThe walk below lists every step in the order it ran."   # ten plain words, no finding of its own


def bank_items():
    """(strings, per-problem joined documents) of the authored copy in problems.json and banks/*.json"""
    strings = []
    docs = []
    for f in [os.path.join(ROOT, "problems.json")] + sorted(glob.glob(os.path.join(ROOT, "banks", "*.json"))):
        with open(f, encoding="utf-8") as fh:
            data = json.load(fh)
        for prob in data.get("problems", []):
            mine = []

            def walk(x, k=None):
                if isinstance(x, dict):
                    for a, b in x.items():
                        walk(b, a)
                elif isinstance(x, list):
                    if k == "md" and all(isinstance(y, str) for y in x):
                        mine.extend(y for y in x if y.strip())
                        if len(x) > 1:
                            mine.append("\n".join(x))
                        return
                    for b in x:
                        walk(b, k)
                elif isinstance(x, str) and k in COPY_KEYS and x.strip():
                    mine.append(x)

            walk(prob)
            strings.extend(mine)
            docs.append("\n\n".join(mine))
    return list(dict.fromkeys(strings)), docs


BANK, BANK_DOCS = bank_items()

UI_COPY = [   # human UI copy (design/STYLE.md and the app)
    "Correct.", "Not quite. One more try.", "Out of tries.", "Open a problem file", "Show the scratchpad", "Next question",
    "Upload or type code to start.", "Got it wrong first time? Keep your progress.", "Compare with Cluck's steps",
    "Paste GPT answer here, but me be sad...", "Exit redo", "Ask Cluck", "Saved", "3 / 12", "Stuck? Tap me.",
    "One more try, so choose wisely.", "QUACK. Which edge did the walk skip?", "Next hint", "Copy", "Questions",
    "The queue holds B and C. Which one leaves first?", "Step 3 of 8: visit D, then add its neighbours.",
    "Points always go up and never let you down.", "Third time's the charm.", "Solution locked until you answer.",
    "Drag the slider to change k.", "Not examined", "Recorded, not fetched", "Fetched", "Waiting",
]
MACHINE_COPY = [   # what a model writes when nobody stops it: each one should block
    "Let's explore how BFS visits each node.", "Great question! Let's dive in.", "I hope this helps!",
    "It's not just a walk, it's a way of thinking.", "Moreover, the queue grows with each step.",
    "Delve into the walk below.", "This robust approach handles every case.", "Feel free to reach out if you're stuck.",
    "You're absolutely right, the answer is 12.", "In order to find the limit, factor the numerator.",
    "Graph Walks And Their Many Uses", "The frontier grows — then shrinks.",
    "Here's my thought process: factor first.", "Additionally, the graph has a cycle.",
    "This step serves as the base case.", "A comprehensive look at the walk.", "That's a great question about limits.",
    "As an AI language model, I can explain this.", "Experts agree this is the fastest method.",
    "This is a crucial step that helps you navigate the graph.", "It is important to note that the limit exists.",
    "Imagine a world where every graph is a tree.", "This seamless walk covers every node.",
    "Let's break this down step by step.", "In conclusion, the answer is 12.",
]
EDGE = [
    "Delve into the 𝑥-axis 😀 and the intricate 🎉 tapestry of limits, a robust walk.",
    "The dеlvе step is a rоbust and sеamless pаradigm for every node in the graph.",   # Cyrillic lookalikes
    "Let​s explore the gra​ph and delve into the walk of every node here.",
    "word⁠joiner and delve⁠ into a robust walk across the whole graph today.",
    "Line one is plain text here.\r\nMoreover, the second line, a robust one, follows.\r\n\r\nThird paragraph here.",
    "Only CR lines here.\rMoreover a robust step.\rAnd more words to pass the gate.",
    "> Let's dive in! A quoted robust tapestry.\nMy own words follow and stay plain for ten words.",
    "He said \"let's delve into a robust tapestry\" and then we moved on to the next ten words.",
    "<!-- avoid-ai-writing:ignore-start -->\nDelve into a robust tapestry.\n<!-- avoid-ai-writing:ignore-end -->\nPlain words follow here for the gate to count ten.",
    "---\ntitle: Walk\n---\nThe walk is robust and the steps delve into the graph for ten words.",
    "```\n## Benefits And Strategic Considerations\n```\n## Benefits And Strategic Considerations\nText follows for ten words or so here.",
    "*nods* and *smiles* then the robust walk continues through the graph for many words.",
    "#bfs #dfs #graph #walk #queue #stack #tree are all tags we use for this ten word line.",
    "- Stable mining efficiency\n- Reliable pool connectivity\n- Optimized RandomX performance\n- Fast sync\n- Low fees\n- Clean logs",
    "It isn't raining, it's pouring. It isn't cold, it's freezing. That is the whole point of the forecast today.",
    "No fluff, no filler, no jargon. Just the walk, step by step, for every node in the graph.",
    "The `robust` flag and ```delve``` code spans hide words, but the tapestry outside still counts here.",
    "Use the code-base and data-set in real-time for the long-term, it works out-of-the-box, see path/to-file.md.",
    "The app features a dashboard. Three new features shipped. Which features matter most? It features support for loops.",
    "## [3.21.0] — 2026-07-30\n- **Term** — a definition here\nA prose dash — like this — counts for ten words.",
    "Ｆｕｌｌｗｉｄｔｈ ｔｅｘｔ ａｎｄ 中文字符 mixed with a robust English sentence for ten words.",
    "中文字符很多中文字符很多中文字符很多 robust",
]


def snippets():
    out = []
    for d in BANK_DOCS:
        for size, step in ((80, 61), (200, 157)):
            for i in range(0, max(1, len(d) - size + 1), step):
                out.append(d[i:i + size])
    return out


def run_js(cases):
    r = subprocess.run(["node", CANON], input=json.dumps(cases), capture_output=True, text=True, check=True)
    return json.loads(r.stdout)


def plain(x):
    return json.loads(json.dumps(x))


class Differential(unittest.TestCase):
    maxDiff = 4000

    def check(self, cases, name):
        want = run_js(cases)
        bad = []
        for (text, opt), w in zip(cases, want):
            got = plain(aiw.analyze_text(text, opt))
            if got != w:
                bad.append((text, opt, {k: (got.get(k), w.get(k)) for k in set(got) | set(w) if got.get(k) != w.get(k)}))
        print("aiw differential %-34s %5d cases, %d differ" % (name, len(cases), len(bad)), file=sys.stderr)
        self.assertEqual(bad[:3], [], "%d of %d %s cases differ from the JS" % (len(bad), len(cases), name))
        return len(cases)

    def test_upstream_fixture_inputs(self):
        with gzip.open(CORPUS, "rt", encoding="utf-8") as f:
            cases = json.load(f)
        self.assertGreater(len(cases), 1000)
        if not os.environ.get("AIW_FULL"):
            cases = [c for c in cases if len(c[0]) <= 20000]
        self.check(cases, "patterns.test.js inputs")

    def test_bank_strings(self):
        cases = []
        for s in BANK:
            for opt in ({}, {"contextMode": "technical"}, {"sourceMode": "rendered-markdown"}):
                cases.append([s, opt])
            if len(s.split()) < 10:
                cases.append([s + FRAME, {}])
        cases += [[d, {}] for d in BANK_DOCS] + [[d, {"sourceMode": "rendered-markdown"}] for d in BANK_DOCS]
        self.assertGreater(len(BANK), 900)
        self.check(cases, "bank strings + docs")

    def test_view_snippets(self):
        short = UI_COPY + MACHINE_COPY + EDGE
        cases = [[s, {}] for s in snippets()]
        cases += [[s, opt] for s in short for opt in ({}, {"contextMode": "technical"}, {"sourceMode": "rendered-markdown"})]
        cases += [[s + FRAME, {}] for s in short]
        cases += [[s, {"contextMode": m, "sourceMode": "nope"}] for s in EDGE[:2] for m in ("tecnical", "", None)]
        self.check(cases, "view snippets + edge cases")


def lint_table():
    """per-type block counts on authored bank strings (all false positives by construction)"""
    verdicts = aiw.lint_view_strings(BANK)
    by_type = {}
    for v in verdicts:
        for t in sorted({i["type"] for i in v["block"]}):
            by_type.setdefault(t, []).append(v["text"])
    return verdicts, by_type


class Lint(unittest.TestCase):
    def test_false_positive_rate_on_bank_text(self):
        verdicts, by_type = lint_table()
        blocked = [v for v in verdicts if not v["ok"]]
        judged = aiw.LINT_BLOCK | aiw.LINT_IGNORE
        raw = [s for s in BANK if any(i["type"] in judged for i in aiw.analyze_text(s, None, 1)["issues"])]
        print("aiw lint: %d bank strings, %d blocked (%.2f%%); with no allow list and every type judged: %d (%.2f%%)"
              % (len(verdicts), len(blocked), 100 * len(blocked) / len(verdicts), len(raw), 100 * len(raw) / len(BANK)),
              file=sys.stderr)
        for t, texts in sorted(by_type.items()):
            print("  %-22s %3d  e.g. %r" % (t, len(texts), texts[0][:90]), file=sys.stderr)
        self.assertLessEqual(len(blocked) / len(verdicts), 0.005)

    def test_human_ui_copy_passes(self):
        self.assertEqual([v["text"] for v in aiw.lint_view_strings(UI_COPY) if not v["ok"]], [])

    def test_machine_copy_blocks(self):
        missed = [v["text"] for v in aiw.lint_view_strings(MACHINE_COPY) if v["ok"]]
        self.assertEqual(missed, [])

    def test_stylometrics_never_block(self):
        long_flat = " ".join(["The node is visited and the edge is checked and the queue is updated."] * 40)
        v = aiw.lint_view_strings([long_flat])[0]
        self.assertTrue(v["ok"], v["block"])
        self.assertIn("uniformity", v["ignored"])

    def test_context(self):
        s = "This robust walk covers every node."
        self.assertFalse(aiw.lint_view_strings([s])[0]["ok"])
        self.assertTrue(aiw.lint_view_strings([s], {"contextMode": "technical"})[0]["ok"])
        self.assertTrue(aiw.lint_view_strings([s], {"allow": ["Robust"]})[0]["ok"])
        self.assertEqual(aiw.lint_view_strings(["", "  "]), [
            {"text": "", "ok": True, "block": [], "ignored": [], "other": []},
            {"text": "  ", "ok": True, "block": [], "ignored": [], "other": []}])

    def test_speed(self):
        strings = BANK + UI_COPY + MACHINE_COPY
        aiw.lint_view_strings(strings[:50])
        t = time.perf_counter()
        aiw.lint_view_strings(strings)
        us = (time.perf_counter() - t) / len(strings) * 1e6
        worst = 0
        for s in sorted(strings, key=len)[-20:]:
            t = time.perf_counter()
            aiw.lint_view_strings([s])
            worst = max(worst, (time.perf_counter() - t) * 1e6)
        print("aiw lint speed: %.0f us per string mean over %d strings, %.0f us worst of the 20 longest"
              % (us, len(strings), worst), file=sys.stderr)
        self.assertLess(us, 2000)


if __name__ == "__main__":
    unittest.main()
