"""oui.py, the gate's Python port of OpenUI Lang (P0.5), against the spec fixtures (tests/fixtures/openui/1.0) and the vendored JS
parser (vendor/openui-lang.mjs via tests/openui-canon.mjs, one node call per corpus):
- every level-1 program case matches expected.json by the README's rules (streamed and batch for chunks.json cases);
- differential: on every fixture program, on every prefix of it (what a stream shows mid-way) and on a few stem-profile programs,
  the canonical result is IDENTICAL to the JS parser's (root, errors with codes/statements/paths, unresolved, orphans, incomplete,
  state), and the merged text of each editing case is the same text.
Needs node (as tests/run-all.sh does)."""
import json
import math
import os
import re
import subprocess
import sys
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
import oui  # noqa: E402

FIX = os.path.join(ROOT, "tests", "fixtures", "openui", "1.0")
CANON_JS = os.path.join(ROOT, "tests", "openui-canon.mjs")
with open(os.path.join(FIX, "library.json"), encoding="utf-8") as f:
    SPEC = json.load(f)
CAT = oui.compile_schema(SPEC["schema"])
FUNCTIONS = {"Upper": lambda a: str(a.get("text") if a.get("text") is not None else "").upper()}   # library.json's one function
# Programs in the shape the stem profile writes (Query defaults, $state, @functions, Each, ternaries, a fence, prose around it)
STEM = [
    '$k = 2\nroot = Stack([Text("Given " + $k), t])\nt = Table([Col("n", @Each(rows.n, "x", x * $k))])\nrows = Query("graph.trace", {k: $k}, {n: [1, 2, 3]})',
    'Sure:\n```openui\nroot = Card("Walk", [Text(s), Tag("A", $ok ? "green" : "red")])\ns = @Round(@Avg([1, 2, 4]), 2) + " avg"\n$ok = 3 >= "3"\n```\nDone.',
    'root = Stack([Metric("Open", @Count(@Filter(q.rows, "status", "==", "open"))), Metric("Max", @Max(q.rows.n))])\nq = Query("t", {}, {rows: [{status: "open", n: 4}, {status: "x", n: 9}]})',
    'root = Stack([Text(@Upper("hi")), Text(@Sort(["b10", "b9", "a"], "") + ""), Text(m[0][1] + o.k + nope.x)])\nm = [[1, 2]]\no = {k: "v"}',
    'root = Stack([Text("a"), Chart(1), Input("i", "p", $v), Select("s", [SelectItem("1", "One")], $v)])\n$v = "1"',
    'root = Stack([b])\nb = Button("Go", Action([@Set($n, $n + 1), @Reset($m), @ToAssistant("more", {n: $n})]), "primary")\n$n = 0',
]


def same(a, b):
    """isDeepStrictEqual on JSON values: 1 == 1.0, never True == 1"""
    if isinstance(a, bool) or isinstance(b, bool):
        return type(a) is type(b) and a == b
    if oui.is_num(a) and oui.is_num(b):
        return a == b or (math.isnan(a) and math.isnan(b))
    if isinstance(a, list) and isinstance(b, list):
        return len(a) == len(b) and all(same(x, y) for x, y in zip(a, b))
    if isinstance(a, dict) and isinstance(b, dict):
        return a.keys() == b.keys() and all(same(a[k], b[k]) for k in a)
    return type(a) is type(b) and a == b


def claims(expected, actual):
    """each expected entry claims its own actual entry agreeing on the keys it lists (entries listing more keys first)"""
    pool = list(actual)
    for e in sorted(expected, key=lambda x: -len(x)):
        i = next((i for i, a in enumerate(pool) if all(same(v, a.get(k)) for k, v in e.items())), None)
        if i is None:
            return False
        pool.pop(i)
    return True


def as_set(xs):
    return sorted(set(xs))


COMPARE = {"root": same, "errors": lambda w, g: len(w) == len(g) and claims(w, g),
           "unresolved": lambda w, g: as_set(w) == as_set(g), "orphans": lambda w, g: as_set(w) == as_set(g),
           "incomplete": same, "state": same, "statements": same, "errorObjects": claims}
OPTIONAL = {"state", "statements", "errorObjects"}


def files_of(case):
    d = os.path.join(FIX, case)
    out = {}
    for name in os.listdir(d):
        with open(os.path.join(d, name), encoding="utf-8") as f:
            out[name] = f.read()
    return out


def cases():
    return sorted(f"{a}/{c}" for a in os.listdir(FIX) if os.path.isdir(os.path.join(FIX, a))
                  for c in os.listdir(os.path.join(FIX, a)) if os.path.isdir(os.path.join(FIX, a, c)))


def program_of(files):
    """(text, statements) as the conformance runner builds them; the merge is oui's own"""
    if "chunks.json" in files:
        return "".join(json.loads(files["chunks.json"])), None
    if "patch.oui" not in files:
        return files["input.oui"], None
    text = oui.merge_statements(files["input.oui"], files["patch.oui"])
    return text, [m.group(1) for m in (re.match(r"(\$?\w+)\s*=(?!=)", line) for line in text.split("\n")) if m]


def canon(result, statements=None):
    out = oui.canon(result, SPEC, FUNCTIONS)
    if statements is not None:
        out["statements"] = statements
    return out


def diffs(expected, actual):
    return [f"{k}: expected {json.dumps(expected.get(k))}, got {json.dumps(actual.get(k))}" for k, ok in COMPARE.items()
            if (k in expected or k not in OPTIONAL) and not ok(expected.get(k), actual.get(k))]


def node(*args, stdin=None):
    r = subprocess.run(["node", CANON_JS, *args], input=stdin, capture_output=True, text=True, timeout=120, cwd=ROOT)
    if r.returncode:
        raise AssertionError(r.stderr[-2000:])
    return json.loads(r.stdout)


PROGRAMS = [c for c in cases() if "validation.json" not in files_of(c)]


class Fixtures(unittest.TestCase):
    def test_cases_found(self):
        self.assertEqual(len(PROGRAMS), 58)                 # 59 cases, one is validation.json (rules, not a program)

    def test_expected(self):
        for case in PROGRAMS:
            with self.subTest(case=case):
                files = files_of(case)
                expected = json.loads(files["expected.json"])
                text, statements = program_of(files)
                self.assertEqual(diffs(expected, canon(oui.parse(text, CAT, SPEC["root"]), statements)), [], "batch")
                if "chunks.json" in files:
                    sp = oui.StreamParser(CAT, SPEC["root"])
                    chunks = json.loads(files["chunks.json"])
                    for i, ch in enumerate(chunks):
                        sp.push(ch, i == len(chunks) - 1)
                    self.assertEqual(diffs(expected, canon(sp.result(True))), [], "streamed")


class Differential(unittest.TestCase):
    """oui.py vs the vendored JS parser, value for value"""
    @classmethod
    def setUpClass(cls):
        cls.js = node()

    def check(self, texts, js):
        for text, want in zip(texts, js):
            got = canon(oui.parse(text, CAT, SPEC["root"]))
            for k in want:
                if k == "errorObjects":
                    ok = len(want[k]) == len(got[k]) and claims(want[k], got[k])
                else:
                    ok = same(want[k], got[k])
                self.assertTrue(ok, f"{k} differs on {text!r}\n  js: {json.dumps(want[k])}\n  py: {json.dumps(got[k])}")
            self.assertEqual(set(want), set(got) - {"statements"})

    def test_fixture_programs(self):
        self.assertEqual(sorted(self.js), PROGRAMS)
        for case in PROGRAMS:
            text, statements = program_of(files_of(case))
            with self.subTest(case=case):
                self.assertEqual(text, self.js[case]["text"], "merged text")
                want = {k: v for k, v in self.js[case].items() if k not in ("text", "statements")}
                self.check([text], [want])

    def test_every_prefix(self):
        """mid-stream: each prefix of each fixture program (and of the stem programs) is a partial program both must read alike"""
        texts = sorted({t[:i] for t in [self.js[c]["text"] for c in PROGRAMS] + STEM for i in range(1, len(t) + 1)})
        self.check(texts, node("--stdin", stdin=json.dumps(texts)))

    def test_stem_programs(self):
        js = node("--stdin", stdin=json.dumps(STEM))
        self.check(STEM, js)
        self.assertEqual(js[0]["root"]["props"]["children"][1]["props"]["columns"][0]["props"]["data"], [2, 4, 6])   # the corpus is not all errors


class Streaming(unittest.TestCase):
    def test_completed_statements_only(self):
        sp = oui.StreamParser(CAT, SPEC["root"])
        sp.push('root = Stack([t])\nt = Text("hel')
        self.assertEqual(sp.completed(), "root = Stack([t])\n")
        r = sp.push('lo")\nu = $a\n  ? 1\n')
        self.assertEqual(sp.completed(), 'root = Stack([t])\nt = Text("hello")\n')   # the ternary is still open
        self.assertTrue(r["meta"]["incomplete"] is False)
        r = sp.push("  : 2\nv = 3\n", True)
        self.assertEqual(sp.completed(), 'root = Stack([t])\nt = Text("hello")\nu = $a\n  ? 1\n  : 2\n')   # at the end the tail is whole too
        self.assertEqual(r["root"]["props"]["children"][0]["props"]["text"], "hello")
        self.assertEqual(r["meta"]["orphaned"], ["u", "v"])


class JsSemantics(unittest.TestCase):
    def test_numbers_print_like_js(self):
        for x, s in ((2.0, "2"), (1e21, "1e+21"), (1.5e-7, "1.5e-7"), (1e-6, "0.000001"), (0.1 + 0.2, "0.30000000000000004"),
                     (-0.0, "0"), (math.nan, "NaN"), (123456789012345680000.0, "123456789012345680000")):
            self.assertEqual(oui.num_str(x), s)

    def test_loose_equality(self):
        for a, b, eq in ((5, "5", True), ("", 0, True), (None, 0, False), (True, 1, True), ("1,2", [1, 2], True), (None, None, True),
                         (math.nan, math.nan, False), ("abc", 0, False)):
            self.assertEqual(oui.loose_eq(a, b), eq, (a, b))


if __name__ == "__main__":
    unittest.main()
