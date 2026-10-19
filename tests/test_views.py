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
                 (lambda r: r["components"]["Text"]["props"].append({"name": "text", "type": "string"}), "duplicate prop"),
                 (lambda r: r["components"]["Text"]["props"][0].update(server=True), "server-held prop must be a ref")]
        for breakit, want in cases:
            r = copy.deepcopy(REG)
            breakit(r)
            self.assertTrue(any(want in line for line in gv.problems(r)), want)

    def test_engine_names_match_engine_package(self):
        served = gv.engine_tools()
        if served is None:
            self.skipTest("engine/ not importable")
        self.assertEqual(gv.problems(REG, served), [])
        bad = gv.problems(REG, served - {"graph.mst"} | {"graph.new"})
        self.assertIn("tool graph.mst: ships in the registry but engine/ has no such tool", bad)
        self.assertIn("tool graph.new: engine/ serves it but the registry does not list it", bad)

    def test_no_look_props(self):
        r = copy.deepcopy(REG)
        r["components"]["Card"]["props"].append({"name": "color", "type": "string"})
        self.assertIn("Card.color: look prop (F3: the look is CSS by cascade)", gv.problems(r))

    def test_locks(self):
        c = REG["components"]
        self.assertEqual([p["name"] for p in c["Reveal"]["props"]], ["label"])              # F4: body = second program
        self.assertTrue(next(p for p in c["Predict"]["props"] if p["name"] == "answer")["server"])   # F5
        self.assertIn("Doodle", REG["base"])                                                 # VISUAL-FIRST
        for r in REG["recipes"]:
            self.assertIn("`Doodle(kind)`", gv.prompt(REG, r))

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
        self.assertEqual(lib["root"], "View")
        self.assertEqual(set(lib["components"]), set(REG["components"]))
        self.assertEqual(set(lib["schema"]["$defs"]), set(REG["components"]))
        self.assertEqual(sorted(n for g in lib["componentGroups"] for n in g["components"]), sorted(REG["components"]))
        self.assertTrue(all(isinstance(g["notes"], list) for g in lib["componentGroups"]))
        walk = lib["schema"]["$defs"]["Walk"]
        self.assertEqual(walk["required"], ["trace"])
        self.assertEqual(walk["properties"]["trace"], {})
        self.assertEqual(lib["schema"]["$defs"]["Steps"]["properties"]["mode"], {"type": "string", "enum": ["reveal", "tabs"]})
        self.assertEqual(lib["components"]["Steps"]["signature"], 'Steps(steps: any[], mode?: "reveal" | "tabs")')
        self.assertEqual(lib["components"]["Predict"]["signature"], "Predict(question: string, answer: any, tol?: number)")

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
        self.assertRegex(gv.prompt(REG, "predict-reveal"), r"`key\.\*`.*Stages: post; as Predict\.answer in any stage \(the server keeps it\)")
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
