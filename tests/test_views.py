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
P11 = ["View", "Head", "Text", "Legend", "Table", "Callout", "Steps", "Step", "Hints", "Predict", "Reveal", "Answer", "Doodle", "Graph", "Geometry"]


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
        for name in ("color", "size", "icon", "style"):
            r = copy.deepcopy(REG)
            r["components"]["Predict"]["props"][name] = {"type": "string", "maxLength": 9}
            self.assertTrue(any(f"Predict.{name}: banned prop name" in line for line in gv.problems(r)), name)

    def test_answer_and_key_are_key_refs_only(self):   # F5: answer=key.<id>, never a literal
        r = copy.deepcopy(REG)
        del r["components"]["Predict"]["props"]["answer"]["pattern"]
        r["components"]["Answer"]["props"]["key"] = {"type": "string", "maxLength": 9}
        bad = gv.problems(r)
        self.assertTrue(any(line.startswith("Predict.answer: must be a required key reference") for line in bad))
        self.assertTrue(any(line.startswith("Answer.key: banned prop name") for line in bad))
        r = copy.deepcopy(REG)
        r["components"]["Callout"]["props"]["answer"] = dict(REG["components"]["Predict"]["props"]["answer"])   # pattern alone is not enough
        r["components"]["Predict"]["required"].remove("answer")
        bad = gv.problems(r)
        self.assertTrue(any(line.startswith("Callout.answer: banned prop name") for line in bad))
        self.assertTrue(any(line.startswith("Predict.answer: must be a required key reference") for line in bad))
        pat = re.compile(REG["key_ref"])
        for ok in ("key.v1", "key.chi_P", "key.a.b-2"):
            self.assertTrue(pat.match(ok), ok)
        for bad in ("3", "key.", "key v1", "given.m", "key.v1 "):
            self.assertFalse(pat.match(bad), bad)

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
        self.assertEqual(list(c["Predict"]["props"]), ["tag", "q", "choices", "struck", "tries", "answer"])   # P1.1 @df716ac
        self.assertEqual(c["Predict"]["required"], ["q", "choices", "answer"])
        self.assertEqual(c["Predict"]["props"]["answer"]["pattern"], REG["key_ref"])            # F5: a key ref, posted with the pick
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
            self.assertLessEqual(offered(text), set(P11) | (set(SCENE) if path.endswith("scene-steps.md") else set()), path)
        self.assertIn("`graph.trace`", gv.prompt(REG))
        self.assertIn("`Hints(hints: string≤200[]≤3)`", gv.prompt(REG, "hint-line"))

    def test_recipe_prompt_is_a_subset(self):
        text = gv.prompt(REG, "answer-table")
        self.assertEqual(offered(text), (set(REG["base"]) | set(REG["recipes"]["answer-table"]["components"])) & set(gv.shipped(REG)))
        self.assertNotIn("`Steps(", text)

    def test_pre_prompt_hides_key(self):
        self.assertRegex(gv.prompt(REG, "hint-line"), r"`key\.\*`.*Stages: none here, never use")   # stages pre, wrong
        self.assertRegex(gv.prompt(REG, "answer-table"), r"`key\.\*`.*Stages: post\.")
        pr = gv.prompt(REG, "predict-reveal")
        self.assertRegex(pr, r"`key\.\*`.*Stages: post; as the Predict\.answer reference in any stage")
        self.assertIn("answer: key.<id>)`", pr)

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


def _texty(s):
    """A prop schema that holds strings (a string, or a list of them at any depth)."""
    return s.get("type") == "string" or (s.get("type") == "array" and _texty(s.get("items", {})))


class Slots(unittest.TestCase):
    """The slot convention (views plan Oct 20): "$t.<id>" strings; every student-facing prop has a role and a wordClass."""
    SLOT = REG["slot"]

    def test_every_text_prop_has_role_and_word_class(self):
        data = set(self.SLOT["not_words"])
        for name, c in REG["components"].items():
            words = c.get("words", {})
            for p in words:
                self.assertIn(p, c["props"], f"{name}.words.{p}: no such prop")
                self.assertNotIn(f"{name}.{p}", data, f"{name}.{p}: both words and not_words")
            for p, s in c["props"].items():
                if not _texty(s) or f"{name}.{p}" in data:
                    continue
                self.assertIn(p, words, f"{name}.{p}: a string prop needs words (role + wordClass) or a slot.not_words entry")
                self.assertIn(words[p].get("role"), self.SLOT["roles"], f"{name}.{p}")
                self.assertIn(words[p].get("wordClass"), self.SLOT["wordClasses"], f"{name}.{p}")
        for d in data:
            comp, p = d.split(".")
            self.assertIn(p, REG["components"][comp]["props"], d)

    def test_roles_and_word_classes(self):
        self.assertEqual(self.SLOT["roles"], ["button", "label", "heading", "body", "chip"])
        self.assertEqual(self.SLOT["wordClasses"], ["verb_phrase", "noun_phrase", "adj", "sentence"])
        self.assertEqual(REG["components"]["Head"]["words"]["title"], {"role": "heading", "wordClass": "noun_phrase"})

    def test_id_regex(self):
        sys.path.insert(0, ROOT)
        import aiw
        import oui
        rx = re.compile(self.SLOT["id"])
        self.assertEqual(self.SLOT["id"], "^[a-z][a-z0-9_]{0,31}$")
        for ok in ("a", "title", "c_two", "q1", "a" * 32):
            self.assertTrue(rx.fullmatch(ok), ok)
            self.assertEqual(oui.slot_id("$t." + ok), ok)
            self.assertTrue(aiw.SLOT_RE.fullmatch("$t." + ok), ok)
        for bad in ("", "Title", "1a", "_a", "a-b", "a.b", "a" * 33, "a b"):
            self.assertFalse(rx.fullmatch(bad), bad)
            self.assertIsNone(oui.slot_id("$t." + bad), bad)
            self.assertFalse(aiw.SLOT_RE.fullmatch("$t." + bad), bad)
        self.assertIsNone(oui.slot_id("see $t.title"))
        self.assertIsNone(oui.slot_id(3))
        with open(os.path.join(ROOT, "views.js")) as f:
            js = re.search(r"const SLOT = /\^(.+)\$/;", f.read()).group(1)
        self.assertEqual(js.replace("\\$", "$").replace("\\.", "."), "$t.(" + self.SLOT["id"][1:-1] + ")")

    def test_gate_takes_a_slot_where_a_string_is_allowed(self):
        sys.path.insert(0, ROOT)
        import aiw
        import oui
        with open(os.path.join(ROOT, "views", "library.json")) as f:
            cat = oui.compile_schema(json.load(f)["schema"])
        r = oui.parse('root = View([hd, s])\nhd = Head("$t.title", "$t.sub")\ns = Hints(["$t.h1", "$t.a_long_hint_slot_id"])', cat, "View")
        self.assertEqual(r["meta"]["errors"], [])
        self.assertEqual(r["root"]["typeName"], "View")
        out = aiw.lint_view_strings(["$t.title", "$t.a_very_long_slot_id_here"])
        self.assertTrue(all(o["ok"] and not o["block"] for o in out))


SCENE = ["Scene", "Shape", "Link", "Axes", "MathRows", "Code", "Trace", "Cells", "Bars", "Q", "Ask"]
CONTRACT = os.path.join(ROOT, "views", "scene-contract.md")


def contract_sigs():
    """{name: signature} from §1 of views/scene-contract.md (the V-A/V-B contract), Art / Role aliases expanded"""
    with open(CONTRACT) as f:
        doc = f.read()
    sec = doc[doc.index("## 1. Components"):doc.index("### 1a.")]
    alias = {a: re.search(rf"`{a}` = (`[^\n]*?`)(?: \(|\.\n)", sec).group(1) for a in ("Art", "Role")}
    alias = {a: v.replace("`", "") for a, v in alias.items()}
    out = {}
    for block in re.findall(r"```\n([\s\S]*?)```", sec):
        for line in block.splitlines():
            m = re.match(r"^(\w+)\((.*?)\)(?:\s{2,}\(.*\))?$", line.strip())
            if m:
                text = f"{m.group(1)}({m.group(2)})"
                for a, v in alias.items():
                    text = text.replace(f": {a},", f": {v},").replace(f": {a})", f": {v})")
                out[m.group(1)] = text
    return out


class SceneFamily(unittest.TestCase):
    """viz MVP (todo 120): the scene family is staged (ships V1): in the registry, the scene-steps prompt, checkers and the gate's
    catalog (library.json "staged"), but not in library.json's drawn components until views.js draws it (V-B)."""

    def test_family_is_staged(self):
        self.assertIn("V1", REG["staged"])
        for n in SCENE:
            self.assertEqual(REG["components"][n]["ships"], "V1", n)
        self.assertEqual(sorted(gv.staged(REG)), sorted(SCENE))
        self.assertFalse(set(SCENE) & set(gv.shipped(REG)))

    def test_staged_in_base_is_caught(self):
        r = copy.deepcopy(REG)
        r["base"].append("Scene")
        self.assertTrue(any("Scene is no shipping component" in line for line in gv.problems(r)))
        r = copy.deepcopy(REG)
        r["components"]["Scene"]["ships"] = "V9"
        self.assertTrue(any("Scene: unknown ships V9" in line for line in gv.problems(r)))

    def test_shipped_library_is_unchanged_but_step_gains_ops(self):
        lib = gv.library(REG)
        self.assertEqual(sorted(lib["components"]), sorted(P11))
        self.assertEqual(lib["components"]["Steps"]["signature"], "Steps(fig?: Graph, steps: Step[], front?: string, head?: string[])")
        step = lib["components"]["Step"]["props"]["properties"]
        self.assertEqual(list(step), ["cap", "nodes", "edges", "tags", "labels", "front", "rows", "ops"])   # ask waits for Ask to ship
        self.assertEqual(step["ops"], {"type": "array", "items": {"type": "string", "maxLength": 40}, "maxItems": 4})

    def test_library_lists_the_staged_family(self):
        st = gv.library(REG)["staged"]
        self.assertEqual(sorted(st["components"]), sorted(SCENE))
        self.assertEqual(sorted(st["schema"]["$defs"]), sorted(P11 + SCENE))
        defs = st["schema"]["$defs"]
        self.assertEqual(defs["Steps"]["properties"]["fig"], {"anyOf": [{"$ref": "#/$defs/Graph"}, {"$ref": "#/$defs/Scene"}]})
        self.assertEqual(list(defs["Step"]["properties"])[-2:], ["ops", "ask"])
        self.assertEqual(defs["Step"]["properties"]["ask"], {"$ref": "#/$defs/Ask"})
        objs = defs["Scene"]["properties"]["objs"]["items"]["anyOf"]
        self.assertEqual([o["$ref"].split("/")[-1] for o in objs], ["Shape", "Link", "Axes", "MathRows", "Code", "Trace", "Cells", "Bars"])

    def test_signatures_match_the_contract(self):   # contract cross-check (v22 lesson): registry == views/scene-contract.md §1
        want = contract_sigs()
        for n in SCENE:
            self.assertEqual(gv.sig(REG, n, caps=True, pool=gv.pool(REG)), want[n], n)
        self.assertEqual(gv.sig(REG, "Steps", caps=True, pool=gv.pool(REG)), want["Steps"])
        self.assertTrue(gv.sig(REG, "Step", caps=True, pool=gv.pool(REG)).endswith(", ops?: string≤40[]≤4, ask?: Ask)"))

    def test_scene_steps_prompt(self):
        text = gv.prompt(REG, "scene-steps")
        self.assertEqual(offered(text), set(REG["base"]) | set(REG["recipes"]["scene-steps"]["components"]))
        for n in SCENE + ["Steps", "Step"]:
            self.assertIn(f"`{gv.sig(REG, n, caps=True, pool=gv.pool(REG))}`", text, n)
        for head in ("## Scene rules", "## Notes: mechanics", "## Notes: calc", "## Notes: cs_trace", "## Example"):
            self.assertIn(head, text)
        for must in ("add ", "set ", "glow ", "hide ", "camera ", "param ", "attach ", "pivot ", "stack ", "scale ", "Never write a pixel",
                     "one change", "ask"):
            self.assertIn(must, text, must)
        self.assertLessEqual(len(text.splitlines()), 200)
        self.assertIn("p1 = Step(", text)

    def test_other_prompts_never_offer_the_staged_family(self):
        for path, text in outputs().items():
            if path.endswith(".md") and path != gv.SCHEMA_MD and not path.endswith("scene-steps.md"):
                self.assertFalse(offered(text) & set(SCENE), path)

    def test_checkers_carry_the_scene_rows(self):
        ch = gv.checkers(REG)
        ids = [g["id"] for g in ch["gate"]]
        for want in ("scene-schema", "scene-refs", "scene-rels", "scene-expr", "scene-trace", "scene-ops", "scene-steps", "scene-leak",
                     "scene-voice", "scene-repair"):
            self.assertIn(want, ids)
        self.assertEqual(ch["staged"], {n: "V1" for n in SCENE})


if __name__ == "__main__":
    unittest.main()
