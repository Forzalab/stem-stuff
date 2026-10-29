"""Live figures (livefig.py + serve._cluck_stream / fig_ctx): one checked SCHEMA graph block per Claude reply, data only.
urllib is mocked: no network."""
import io
import json
import os
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
# serve fixes serve.TRIES at import: point it at a temp file, never the repo's tries.json
os.environ.setdefault("STEM_TRIES", os.path.join(tempfile.mkdtemp(prefix="stem-tries-"), "tries.json"))
import livefig  # noqa: E402
import serve  # noqa: E402

FIXTURE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures", "livefig.json")
with open(FIXTURE, encoding="utf-8") as f:
    FIX = json.load(f)
P = FIX["problem"]                    # a ramp-and-spring question shaped like BANK_P2X PHYS_MQC; the answer is k = 375
MSGS = [{"role": "system", "content": "BASE"}, {"role": "user", "content": "Q"}]


def ctx():
    return livefig.context(P["code"], P["body"][0]["md"], P["saccharine"]["key"], [375.0], subject="physics.mechanics")


def net_ctx(subject=None):
    n = FIX["network"]
    return livefig.context("CEQ", n["body"][0]["md"], "", [3.0], subject=subject or n["subject"], verts=livefig.vertices(n["body"]))


def fence(g):
    return "```fig\n" + json.dumps(g) + "\n```"


def colons(g):
    return ":::fig\n" + json.dumps(g) + "\n:::"         # Opus, Oct 18: the figure fenced with ::: instead of ```


DUCKS = ["Cluck", "Ann", "Bo", "Cy", "Dot", "Ed", "Flo", "Gus", "Hal", "Ivy"]    # the CEQ_PND coloring question: 10 ducks, its own figure
DUCK_EDGES = [("Ann", "Dot"), ("Ann", "Ed"), ("Ann", "Ivy"), ("Bo", "Cy"), ("Bo", "Dot"), ("Bo", "Hal"), ("Cluck", "Flo"), ("Cluck", "Hal"),
              ("Cluck", "Ivy"), ("Cy", "Gus"), ("Cy", "Ivy"), ("Dot", "Flo"), ("Ed", "Gus"), ("Ed", "Hal"), ("Flo", "Gus")]


def duck_net(nodes, alt="Some ducks."):
    return {"type": "graph", "kind": "network", "alt": alt, "nodes": nodes,
            "edges": [{"from": a, "to": b} for a, b in DUCK_EDGES if a in nodes and b in nodes]}


def serve_ctx_drawn(p):
    """what serve.fig_ctx tells the gate about the question's own graph (drawn)"""
    return serve.fig_ctx(p, "3").drawn


def duck_ctx():
    body = [{"type": "text", "md": "Every duck gets one snack flavor; feuding ducks differ."}, duck_net(DUCKS, "Ten ducks and their feuds.")]
    return livefig.context("CEQ_PND", body[0]["md"], "", [3.0], subject="cs", verts=livefig.vertices(body), drawn=True)


def sse_claude(pieces):
    ev = [{"type": "message_start", "message": {"usage": {"input_tokens": 10, "output_tokens": 1}}}]
    ev += [{"type": "content_block_delta", "index": 0, "delta": {"type": "text_delta", "text": p}} for p in pieces]
    ev += [{"type": "message_delta", "usage": {"output_tokens": 5}}, {"type": "message_stop"}]
    return b"".join(f"data: {json.dumps(e)}\n\n".encode() for e in ev)


def sse_or(pieces):
    return b"".join(f"data: {json.dumps({'choices': [{'delta': {'content': p}}]})}\n\n".encode() for p in pieces) + b"data: [DONE]\n\n"


class Resp(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *a):
        self.close()


class Gate(unittest.TestCase):
    def test_every_valid_fixture_passes(self):
        for g in FIX["valid"]:
            self.assertIsNone(livefig.check(g, ctx()), g["kind"])

    def test_every_bad_fixture_is_dropped_with_its_reason(self):
        for case in FIX["invalid"]:
            self.assertEqual((livefig.check(case["fig"], ctx()) or "").split(":")[0], case["why"], case["name"])

    def test_the_validator_reads_schema_md(self):
        s = livefig.schema()
        self.assertIn("kind_scene", s["$defs"])
        bad = dict(FIX["valid"][0], color="#ff0000")
        self.assertEqual(livefig.check(bad, ctx()), "schema")         # additionalProperties: false, from SCHEMA.md

    def test_missing_schema_fails_closed(self):
        with mock.patch.dict(livefig._schema, {"s": None}):
            self.assertEqual(livefig.check(FIX["valid"][0], ctx()), "no-schema")

    def test_the_unknown_in_another_unit_is_a_leak(self):
        c = livefig.context("X", "Run the sun for 2.0 us.", "bill = $2.33 \\times 10^{13}$ dollars = $\\boxed{23.3}$ trillion", [23.3])
        bars = {"type": "graph", "kind": "bars", "alt": "Where the bill comes from.", "groups": [{"label": "bill", "bars": [{"label": "$", "value": 2.33}]}]}
        self.assertEqual(livefig.check(bars, c), "leak:value=2.33")     # live Haiku, Oct 17: the answer's mantissa as a bar

    def test_the_figure_matches_the_subject(self):
        net = next(c["fig"] for c in FIX["invalid"] if c["why"] == "subject")
        self.assertEqual(livefig.check(net, ctx()), "subject")                       # physics + network: dropped
        self.assertIsNone(livefig.check(FIX["valid"][0], ctx()))                     # physics + FBD: kept
        self.assertEqual(livefig.check(FIX["valid"][0], net_ctx("cs")), "subject")   # graph theory + scene: dropped
        self.assertIsNone(livefig.check(FIX["network"]["valid"], net_ctx()))
        self.assertEqual(livefig.check(FIX["network"]["wrong_labels"], net_ctx()), "vertex")   # not the question's A-D: dropped
        self.assertEqual(livefig.check(FIX["network"]["valid"], livefig.context("X", "", "", [])), "subject")   # no subject: no network

    def test_vertices_from_the_bank_figure_or_the_text(self):
        self.assertEqual(livefig.vertices(FIX["network"]["body"]), {"A", "B", "C", "D"})
        self.assertEqual(livefig.vertices([{"type": "graph", "kind": "network", "nodes": ["a", {"id": "b", "label": "$q$"}]}]), {"a", "b", "q"})

    def test_rule_names_the_allowed_kinds_with_an_example_each(self):
        r = livefig.rule(ctx())
        self.assertIn("ONLY these kinds: scene, cartesian, bars.", r)
        self.assertNotIn('"kind":"network","alt"', r)
        r = livefig.rule(net_ctx())
        self.assertIn("ONLY these kinds: network.", r)
        self.assertIn("(A, B, C, D)", r)
        for k, ex in livefig.EXAMPLE.items():    # every example passes its own gate
            c = net_ctx() if k == "network" else livefig.context("X", "", "", [])
            c.verts = {"A", "B", "C"} if k == "network" else c.verts
            self.assertIsNone(livefig.check(json.loads(ex), c), k)

    def test_network_is_the_key_subgraph_only(self):
        c = duck_ctx()
        self.assertEqual(livefig.check(duck_net(DUCKS), c), "copy")                    # the whole 10-duck graph again: dropped
        self.assertEqual(livefig.check(duck_net(DUCKS[:7]), c), "big")                 # 7 nodes: more than the key part
        cycle = duck_net(["Ann", "Ed", "Gus", "Flo", "Dot"], "An odd cycle of five ducks.")   # Ann-Ed-Gus-Flo-Dot-Ann
        self.assertEqual(len(cycle["edges"]), 5)
        self.assertIsNone(livefig.check(cycle, c))                                      # the question's own labels, 5 nodes: kept
        self.assertIsNone(livefig.check(FIX["network"]["valid"], net_ctx()))            # no bank figure (verts from the text): all of them is fine

    def test_spanning_subgraph_is_not_a_copy(self):
        # W113: CEQ_P7K's MST (every vertex, 5 of the question's edges) was dropped as "copy"; drawn now carries the question graph's
        # edge count: every vertex with FEWER edges is a subgraph and goes out; the whole graph again is still a copy
        n = FIX["network"]
        body = n["body"] + [dict(n["valid"], alt="The bank's own cycle.")]
        c = livefig.context("CEQ", n["body"][0]["md"], "", [3.0], subject="discrete", verts=livefig.vertices(body), drawn=4)
        self.assertEqual(livefig.check(n["valid"], c), "copy")                          # all 4 edges: the same graph again
        tree = dict(n["valid"], alt="A spanning tree: three of the four edges.", edges=n["valid"]["edges"][:3])
        self.assertIsNone(livefig.check(tree, c))
        self.assertEqual(livefig.check(tree, livefig.context("CEQ", n["body"][0]["md"], "", [3.0], subject="discrete", verts=livefig.vertices(body), drawn=True)),
                         "copy", "drawn=True (no edge count) keeps the old rule")
        sp = {"code": "CEQ_T1", "type": "num", "body": body, "answer": "3", "saccharine": {"key": "3"}}
        self.assertEqual(serve_ctx_drawn(sp), 4, "serve passes the question graph's edge count")
        self.assertIsNone(livefig.check(FIX["valid"][0], ctx()))                        # physics untouched

    def test_rule_asks_for_the_key_subgraph(self):
        self.assertIn("never redraw it", livefig.rule(duck_ctx()))
        self.assertIn("Pick the few vertices that matter (an odd cycle, a path)", livefig.rule(duck_ctx()))
        self.assertNotIn("Pick the few", livefig.rule(net_ctx()))                        # 4 vertices: nothing to pick

    def test_given_answer_numbers(self):
        c = ctx()
        self.assertIn(375.0, c.answers)
        self.assertIn(2.5, c.givens)


class Geom(unittest.TestCase):
    """the geometry marks (right, dim, angle, circle): whitelisted in cartesian AND scene, checked like any mark"""
    def test_each_geometry_mark_passes_in_both_kinds(self):
        for g in FIX["geom"]["valid"]:
            self.assertEqual({m["mark"] for m in g["marks"]} >= set(livefig.GEOM), True, g["kind"])
            self.assertIsNone(livefig.check(g, ctx()), g["kind"])
        for k in ("cartesian", "scene"):
            self.assertTrue(set(livefig.GEOM) <= livefig.KINDS[k], k)

    def test_bad_geometry_marks_fail_with_their_reason(self):
        for case in FIX["geom"]["invalid"]:
            why = livefig.check(case["fig"], ctx())
            self.assertEqual(why.split(":")[0] if why else why, case["why"], case["name"])

    def test_geometry_labels_count_toward_the_cap(self):
        g = FIX["geom"]["valid"][0]
        self.assertEqual(livefig._labels(g), 2)                          # the angle and the dim label
        seven = next(c["fig"] for c in FIX["geom"]["invalid"] if c["why"] == "labels")
        self.assertEqual(livefig._labels(seven), 7)

    def test_dim_label_leak_names_the_field(self):
        leak = next(c["fig"] for c in FIX["geom"]["invalid"] if c["why"] == "leak")
        self.assertEqual(livefig.check(leak, ctx()), "leak:label=375")

    def test_rule_lists_the_geometry_marks(self):
        for m in ('right {"at"', 'dim {"from"', 'angle {"at"', 'circle {"c"'):
            self.assertIn(m, livefig.RULE)


class Stream(unittest.TestCase):
    def run_fence(self, pieces, c):
        g = livefig.Fence(c)
        out = "".join(g.feed(p) for p in pieces) + g.end()
        return out, g.log

    def test_fence_held_until_closed_and_sent_in_one_piece(self):
        text = "Gut idea.\n" + fence(FIX["valid"][0]) + "\nThen the math."
        pieces = [text[i:i + 7] for i in range(0, len(text), 7)]         # chunk edges everywhere, inside the backticks too
        g, seen = livefig.Fence(ctx()), []
        for p in pieces:
            seen.append(g.feed(p))
        seen.append(g.end())
        for s in seen:
            self.assertTrue("```fig" not in s or s.count("```") == 2, s)  # a fig only ever goes out whole
            self.assertNotIn('{"type"', s.replace(s[s.find("```fig"):s.rfind("```") + 3], "") if "```fig" in s else s)
        out = "".join(seen)
        self.assertIn("Gut idea.", out)
        self.assertIn("Then the math.", out)
        self.assertEqual(json.loads(out.split("```fig\n")[1].split("\n```")[0]), FIX["valid"][0])

    def test_invalid_dropped_text_kept(self):
        out, log = self.run_fence(["A.\n", fence(FIX["invalid"][0]["fig"]), "\nB."], ctx())
        self.assertNotIn("```", out)
        self.assertIn("A.", out)
        self.assertIn("B.", out)
        self.assertEqual([x.split(":")[0] for x in log], [FIX["invalid"][0]["why"]])

    def test_leak_dropped(self):
        leak = next(c for c in FIX["invalid"] if c["why"] == "leak")
        out, log = self.run_fence([fence(leak["fig"])], ctx())
        self.assertNotIn("375", out)
        self.assertEqual(log, ["leak:text=375"])

    def test_two_figures_at_most(self):
        # todo 113 (Tony Oct 28: "may mix 2"): two visuals per reply; a third is dropped
        out, log = self.run_fence([fence(FIX["valid"][0]), "x", fence(FIX["valid"][1]), "y", fence(FIX["valid"][0])], ctx())
        self.assertEqual(out.count("```fig"), 2)
        self.assertEqual(log, ["ok", "ok", "second"])
        self.assertEqual(livefig.FIGS_MAX, 2)

    def test_answer_rescaled_to_a_given_is_not_hidden(self):
        # W113: CPA's answer 10 was also hidden as 1.0 (the power-of-ten form), so a loop-trace table that wrote the code's own
        # "i = 1" was dropped as a leak; a rescaled value the question shows is not the answer. 10 itself stays hidden.
        c = livefig.context("CPA", "for (int i = 1; i < n; i++) { s += i; } What does sumTo(5) return?", "", [10.0])
        self.assertIn(10.0, c.answers)
        self.assertNotIn(1.0, c.answers)
        c = livefig.context("X", "A rod hangs from two strings.", "", [23.3])
        self.assertIn(2.33, [round(a, 2) for a in c.answers], "a rescale the question does not show stays hidden")

    def test_unclosed_fence_never_shows(self):
        out, log = self.run_fence(["Hi.\n```fig\n{\"type\": \"graph\", \"kind\""], ctx())
        self.assertEqual(out.strip(), "Hi.")
        self.assertEqual(log, ["unclosed"])

    def test_off_strips(self):
        out, log = self.run_fence(["A ", fence(FIX["valid"][0]), " B"], None)
        self.assertNotIn("```", out)
        self.assertEqual(log, ["off"])

    def test_colon_fence_is_a_fence(self):
        text = "Forces:\n" + colons(FIX["valid"][0]) + "\nThen the math."
        for n in (1, 2, 3, 7, len(text)):                              # chunk edges inside the ::: too
            out, log = self.run_fence([text[i:i + n] for i in range(0, len(text), n)], ctx())
            self.assertEqual(log, ["ok"], n)
            self.assertNotIn(":::", out)
            self.assertEqual(out.count("```fig\n"), 1)
            self.assertEqual(json.loads(out.split("```fig\n")[1].split("\n```")[0]), FIX["valid"][0])
            self.assertIn("Forces:", out)
            self.assertIn("Then the math.", out)

    def test_bad_colon_fence_dropped_no_raw_json(self):
        for body in (colons(FIX["invalid"][0]["fig"]), ":::json\n{\"type\": \"graph\"\n:::", ":::\n" + json.dumps(FIX["valid"][0])):
            out, log = self.run_fence(["A.\n", body[:5], body[5:], "\nB."], ctx())
            self.assertNotIn('"type"', out)
            self.assertNotIn(":::", out)
            self.assertIn("A.", out)
            self.assertTrue(log and log[0] != "ok", log)

    def test_colons_mid_line_pass(self):
        out, log = self.run_fence(["ratio a:", ":", "::b\n", "\n:", ": x"], ctx())
        self.assertEqual(out, "ratio a::::b\n\n:: x")
        self.assertEqual(log, [])

    def test_lone_backticks_pass(self):
        out, _ = self.run_fence(["a `b", "` c", "``"], ctx())
        self.assertEqual(out, "a `b` c``")


class Pipe(unittest.TestCase):
    def setUp(self):
        self.reply = ["POOF.\n", "Gut.\n", fence(FIX["valid"][0]), "\nDone."]
        self.sent = []
        self.env = mock.patch.dict(os.environ, {"CLAUDE_API": "test-key"})
        self.env.start()
        os.environ.pop("CLUCK_LIVE_FIGS", None)
        for p in (mock.patch.object(serve, "KV", (None, None)), mock.patch("urllib.request.urlopen", side_effect=self.fake)):
            p.start()
            self.addCleanup(p.stop)
        serve._claude_spent.clear()
        serve._last_err.clear()                 # a billing error in an earlier test would start the Claude cooldown

    def tearDown(self):
        self.env.stop()

    def fake(self, req, timeout=None):
        body = json.loads(req.data)
        self.sent.append((req.full_url, body))
        if "anthropic" in req.full_url:
            return Resp(sse_claude(self.reply))
        return Resp(sse_or(self.reply))

    def test_claude_path_gets_the_rule_and_shows_the_figure(self):
        out = "".join(serve._cluck_stream(MSGS, "k", 450, ctx()))
        self.assertIn("FIGURE (", json.dumps(self.sent[0][1]["system"]))
        self.assertEqual(self.sent[0][1]["max_tokens"], serve.claude_params(serve.CLAUDE_MODEL, 450 + serve.FIG_TOKENS)["max_tokens"])   # the model's own room (same fix as #164)
        self.assertEqual(out.count("```fig\n"), 1)

    def test_kill_switch(self):
        os.environ["CLUCK_LIVE_FIGS"] = "0"
        out = "".join(serve._cluck_stream(MSGS, "k", 450, ctx()))
        self.assertNotIn("FIGURE", json.dumps(self.sent[0][1]["system"]))
        self.assertNotIn("```", out)
        self.assertIsNone(serve.fig_ctx(P, "a"))

    def test_openrouter_path_has_no_rule_and_strips(self):
        os.environ.pop("CLAUDE_API")
        out = "".join(serve._cluck_stream(MSGS, "k", 450, ctx()))
        self.assertTrue(all("anthropic" not in u for u, _ in self.sent))
        self.assertTrue(all("FIGURE" not in json.dumps(b) for _, b in self.sent))
        self.assertNotIn("```", out)
        self.assertIn("Done.", out)

    def test_fig_ctx_from_a_problem(self):
        c = serve.fig_ctx(P, "b")
        self.assertIn(375.0, c.answers)                               # the correct choice's value: the hidden unknown
        self.assertIn(0.35, c.givens)

    def test_chat_history_drops_the_figure(self):
        self.assertEqual(livefig.strip("A.\n" + fence(FIX["valid"][0]) + "\nB."), "A.\nB.")
        self.assertEqual(livefig.strip("A.\n" + colons(FIX["valid"][0]) + "\nB."), "A.\nB.")


class Bundle(unittest.TestCase):
    def test_vercel_function_carries_the_gate(self):
        with open(os.path.join(serve.ROOT, "vercel.json"), encoding="utf-8") as f:
            inc = json.load(f)["functions"]["api/index.py"]["includeFiles"]
        self.assertIn("livefig.py", inc)
        self.assertIn("SCHEMA.md", inc)


if __name__ == "__main__":
    unittest.main()
