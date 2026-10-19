"""views/registry.json → tools/gen_views.py: the registry has no broken refs, every generated file (library.json, prompt/*.md,
checkers.json, the SCHEMA.md views block) matches a fresh run, and the prompts offer only what ships and only refs the stage allows.
Run: python3 -m unittest discover -s tests -p 'test_*.py'"""
import copy
import json
import os
import re
import sys
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import gen_views as gv  # noqa: E402

REG = gv.load()


def outputs(reg=REG):
    with open(gv.SCHEMA_MD) as f:
        return gv.outputs(reg, f.read())


class Registry(unittest.TestCase):
    def test_no_broken_refs(self):
        self.assertEqual(gv.problems(REG), [])

    def test_breakage_is_caught(self):
        cases = [(lambda r: r["recipes"]["steps"]["components"].append("Nope"), "unknown component Nope"),
                 (lambda r: r["components"]["Walk"].update(checker="graph.nope"), "no engine tool"),
                 (lambda r: r["components"]["Plot"].pop("checker"), "L2 component needs a checker"),
                 (lambda r: r["engines"]["graph"]["tools"].append("symbolic.x"), "not under engine graph"),
                 (lambda r: r["recipes"]["steps"].update(stages=["later"]), "stages must be"),
                 (lambda r: r["components"]["Text"]["props"].append({"name": "text", "type": "string"}), "duplicate prop")]
        for breakit, want in cases:
            r = copy.deepcopy(REG)
            breakit(r)
            self.assertTrue(any(want in line for line in gv.problems(r)), want)

    def test_key_only_in_post(self):
        self.assertEqual(REG["refs"]["key"]["stages"], ["post"])


class Generated(unittest.TestCase):
    def test_outputs_up_to_date(self):
        for path, text in outputs().items():
            with open(path) as f:
                self.assertEqual(f.read(), text, f"{os.path.relpath(path, ROOT)} is stale: run python3 tools/gen_views.py")

    def test_no_orphan_prompts(self):
        want = {r + ".md" for r in REG["recipes"]} | {"all.md"}
        self.assertEqual(set(os.listdir(os.path.join(ROOT, "views", "prompt"))), want)

    def test_library_spec(self):
        lib = gv.library(REG)
        self.assertEqual(set(lib["components"]), set(REG["components"]))
        self.assertEqual(sorted(n for g in lib["componentGroups"] for n in g["components"]), sorted(REG["components"]))
        walk = lib["components"]["Walk"]["props"]
        self.assertEqual(walk["required"], ["trace"])
        self.assertEqual(walk["properties"]["trace"], {"x-stem": "query"})
        self.assertEqual(lib["components"]["Steps"]["props"]["properties"]["mode"], {"type": "string", "enum": ["reveal", "tabs"]})

    def test_prompts_offer_only_what_ships(self):
        planned = {t for e in REG["engines"].values() if e["ships"] == "planned" for t in e["tools"]}
        for path, text in outputs().items():
            if not path.endswith(".md") or path == gv.SCHEMA_MD:
                continue
            for t in planned:
                self.assertNotIn(t, text, path)
            self.assertNotIn("`Plot(", text, path)       # checker numeric.sample is planned
        self.assertIn("`graph.trace`", gv.prompt(REG))
        self.assertIn("`Walk(trace)`", gv.prompt(REG, "twin-compare"))

    def test_recipe_prompt_is_a_subset(self):
        text = gv.prompt(REG, "answer-table")
        offered = set(re.findall(r"^- `(\w+)\(", text, re.M))
        self.assertEqual(offered, (set(REG["base"]) | set(REG["recipes"]["answer-table"]["components"])) & gv.usable(REG))
        self.assertNotIn("`Steps(", text)

    def test_pre_prompt_hides_key(self):
        text = gv.prompt(REG, "hint-line")   # stages pre, wrong
        self.assertRegex(text, r"`key\.\*`.*Stages: none here, never use")
        self.assertRegex(gv.prompt(REG, "answer-table"), r"`key\.\*`.*Stages: post\.")

    def test_checkers(self):
        ch = gv.checkers(REG)
        self.assertEqual([g["id"] for g in ch["gate"]], ["parse", "schema", "query", "checker", "leak", "stage"])
        by = {c["component"]: c for c in ch["components"]}
        self.assertEqual(by["Walk"], {"component": "Walk", "checker": "graph.trace", "ships": "P0.3"})
        self.assertEqual(by["Plot"]["ships"], "planned")
        self.assertNotIn("Text", by)

    def test_schema_block(self):
        with open(gv.SCHEMA_MD) as f:
            doc = f.read()
        self.assertEqual(doc.count(gv.BEGIN), 1)
        self.assertEqual(doc.count(gv.END), 1)
        m = re.search(r"<!-- schema: views -->\s*```json\n([\s\S]*?)\n```", doc)
        s = json.loads(m.group(1))
        self.assertEqual(s["items"]["properties"]["recipe"]["enum"], list(REG["recipes"]))
        pat = re.compile(s["items"]["properties"]["stage"]["pattern"])
        for ok in ("pre", "post", "wrong:misread"):
            self.assertTrue(pat.match(ok), ok)
        for bad in ("wrong", "wrong:", "later", "pre "):
            self.assertFalse(pat.match(bad), bad)

    def test_check_flag(self):
        self.assertEqual(gv.main(["--check"]), 0)


if __name__ == "__main__":
    unittest.main()
