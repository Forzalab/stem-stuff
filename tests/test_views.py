"""views/registry.json → tools/gen_views.py: the registry breaks no rule (refs, engine names, banned props, caps), every
generated file (library.json, prompt/*.md, checkers.json, the SCHEMA.md views block) matches a fresh run, library.json holds
exactly the shipping components (what views.js draws), and the prompts offer only what ships and only refs the stage allows.
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
P11 = ["View", "Head", "Text", "Legend", "Table", "Callout", "Steps", "Step", "Hints", "Predict", "Reveal", "Answer", "Doodle", "Graph"]


def outputs(reg=REG):
    with open(gv.SCHEMA_MD) as f:
        return gv.outputs(reg, f.read())


def offered(text):
    return set(re.findall(r"^- `(\w+)\(", text, re.M))


class Registry(unittest.TestCase):
    def test_no_broken_rules(self):
        self.assertEqual(gv.problems(REG), [])

    def test_breakage_is_caught(self):
        cases = [(lambda r: r["recipes"]["steps"]["components"].append("Nope"), "unknown component Nope"),
                 (lambda r: r["components"]["Graph"].update(checker="graph.nope"), "no engine tool"),
                 (lambda r: r["components"]["Plot"].pop("checker"), "L2 component needs a checker"),
                 (lambda r: r["engines"]["graph"]["tools"].append("symbolic.x"), "not under engine graph"),
                 (lambda r: r["recipes"]["steps"].update(stages=["later"]), "stages must be"),
                 (lambda r: r["components"]["Text"]["required"].append("tex"), "required tex is no prop"),
                 (lambda r: r["components"]["Steps"]["props"]["fig"].update({"$ref": "#/$defs/Nope"}), "is no component"),
                 (lambda r: r.update(base=[*r["base"], "Plot"]), "Plot is no shipping component")]
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

    def test_banned_props(self):
        for name in ("answer", "key", "color", "size", "icon", "style"):
            r = copy.deepcopy(REG)
            r["components"]["Predict"]["props"][name] = {"type": "string", "maxLength": 9}
            self.assertTrue(any(f"Predict.{name}: banned prop name" in line for line in gv.problems(r)), name)

    def test_caps(self):   # F2 / F7: every string has maxLength, every list maxItems, nested too
        r = copy.deepcopy(REG)
        del r["components"]["Head"]["props"]["title"]["maxLength"]
        del r["components"]["Hints"]["props"]["hints"]["maxItems"]
        del r["components"]["Table"]["props"]["rows"]["items"]["items"]["maxLength"]
        bad = gv.problems(r)
        for want in ("Head.title: string with no maxLength", "Hints.hints: list with no maxItems", "Table.rows[][]: string with no maxLength"):
            self.assertIn(want, bad)
        c = REG["components"]
        self.assertEqual(c["Steps"]["props"]["steps"]["maxItems"], 8)
        self.assertEqual(c["Chips"]["props"]["items"]["maxItems"], 8)
        self.assertEqual(c["Hints"]["props"]["hints"]["maxItems"], 3)
        self.assertEqual(c["Table"]["cluck"], {"rows": 8, "cols": 4})
        self.assertEqual(c["Compare"]["props"]["children"]["minItems"], c["Compare"]["props"]["children"]["maxItems"])

    def test_locks(self):
        c = REG["components"]
        self.assertNotIn("answer", c["Predict"]["props"])                       # F5: the pick goes to /predict
        self.assertEqual(list(c["Reveal"]["props"]), ["lock", "body"])          # F4: body = second program
        self.assertIn("Doodle", REG["base"])                                    # VISUAL-FIRST
        for r in REG["recipes"]:
            self.assertIn("Doodle", offered(gv.prompt(REG, r)))

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
        self.assertEqual(sorted(lib["components"]), sorted(P11))          # what views.js (P1.1) draws, nothing more
        self.assertEqual(sorted(lib["schema"]["$defs"]), sorted(P11))
        self.assertEqual(sorted(n for g in lib["componentGroups"] for n in g["components"]), sorted(P11))
        self.assertTrue(all(isinstance(g["notes"], list) for g in lib["componentGroups"]))
        steps = lib["components"]["Steps"]
        self.assertEqual(list(steps["props"]["properties"]), ["fig", "steps", "front", "head"])   # positional order
        self.assertEqual(steps["props"]["required"], ["steps"])
        self.assertEqual(steps["signature"], "Steps(fig?: Graph, steps: Step[], front?: string, head?: string[])")
        self.assertEqual(lib["schema"]["$defs"]["Steps"]["properties"], steps["props"]["properties"])
        view = lib["components"]["View"]["props"]["properties"]["children"]["items"]["anyOf"]
        self.assertEqual(view, [{"$ref": f"#/$defs/{n}"} for n in gv.shipped(REG)])
        self.assertEqual(lib["components"]["Doodle"]["props"]["properties"]["kind"], {"type": "string", "enum": REG["doodles"]})
        self.assertNotIn("x-any", json.dumps(lib))
        self.assertNotIn("x-enum", json.dumps(lib))

    def test_prompts_offer_only_what_ships(self):
        planned = {t for e in REG["engines"].values() if e["ships"] == "planned" for t in e["tools"]}
        for path, text in outputs().items():
            if not path.endswith(".md") or path == gv.SCHEMA_MD:
                continue
            for t in planned:
                self.assertNotIn(t, text, path)
            self.assertLessEqual(offered(text), set(P11), path)
        self.assertIn("`graph.trace`", gv.prompt(REG))
        self.assertIn("`Hints(hints: string≤200[]≤3)`", gv.prompt(REG, "hint-line"))

    def test_recipe_prompt_is_a_subset(self):
        text = gv.prompt(REG, "answer-table")
        self.assertEqual(offered(text), (set(REG["base"]) | set(REG["recipes"]["answer-table"]["components"])) & set(gv.shipped(REG)))
        self.assertNotIn("`Steps(", text)

    def test_pre_prompt_hides_key(self):
        self.assertRegex(gv.prompt(REG, "hint-line"), r"`key\.\*`.*Stages: none here, never use")   # stages pre, wrong
        self.assertRegex(gv.prompt(REG, "answer-table"), r"`key\.\*`.*Stages: post\.")

    def test_checkers(self):
        ch = gv.checkers(REG)
        self.assertEqual([g["id"] for g in ch["gate"]][:6], ["parse", "schema", "query", "checker", "leak", "stage"])
        by = {c["component"]: c for c in ch["components"]}
        self.assertEqual(by["Graph"], {"component": "Graph", "checker": "graph.trace", "ships": "P0.3"})
        self.assertEqual(by["Plot"]["ships"], "planned")
        self.assertNotIn("Text", by)
        self.assertEqual(ch["marks"], REG["marks"])
        self.assertEqual(ch["cluck_caps"], {"Table": {"rows": 8, "cols": 4}})

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
