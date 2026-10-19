"""Engine server tools (engine/): golden outputs per tool + independent checks (networkx / sympy re-derive the same truth).
Golden file: tests/fixtures/engine_golden.json. A tool's output changed on purpose → bump engine.VERSION, then
ENGINE_GOLDEN=write python3 -m unittest tests.test_engine   (rewrites the file; review its diff)."""
import json
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import engine  # noqa: E402
from engine import graph as eg  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
GOLDEN = os.path.join(HERE, "fixtures", "engine_golden.json")
with open(os.path.join(HERE, "fixtures", "engine_ceg.json"), encoding="utf-8") as f:
    CEG = json.load(f)                 # BANK_CEG CEG_L2K: the slide graph, 9 vertices, 13 weighted edges


def net(edges, directed=False, nodes=None):
    ids = nodes or sorted({x for e in edges for x in e[:2]})
    return {"nodes": ids, "directed": directed, "edges": [{"from": e[0], "to": e[1], **({"w": e[2]} if len(e) > 2 else {})} for e in edges]}


C5 = net([("A", "B"), ("B", "C"), ("C", "D"), ("D", "E"), ("E", "A")])
K33 = net([(a, b) for a in "ABC" for b in "XYZ"])
PETERSEN = net([("A", "B"), ("B", "C"), ("C", "D"), ("D", "E"), ("E", "A"), ("A", "F"), ("B", "G"), ("C", "H"), ("D", "I"), ("E", "J"),
                ("F", "H"), ("H", "J"), ("J", "G"), ("G", "I"), ("I", "F")])
DIR = net([("S", "A", 4), ("S", "B", 2), ("B", "A", 1), ("A", "T", 3), ("B", "T", 6), ("T", "S", 1)], directed=True, nodes=["S", "A", "B", "T"])
PARALLEL = net([("A", "B", 5), ("A", "B", 2), ("B", "C", 1), ("C", "C", 9), ("A", "C", 4)])      # a pseudograph: parallel edges + a loop
SPLIT = net([("A", "B", 1), ("C", "D", 2)])                                                     # two components
FLOW = net([("s", "a", 10), ("s", "b", 5), ("a", "b", 15), ("a", "t", 5), ("b", "t", 10)], directed=True, nodes=["s", "a", "b", "t"])

CASES = {
    "trace dijkstra CEG": ("graph.trace", {"algo": "dijkstra", "graph": CEG, "start": "A"}),
    "trace dijkstra directed": ("graph.trace", {"algo": "dijkstra", "graph": DIR, "start": "S"}),
    "trace dijkstra parallel": ("graph.trace", {"algo": "dijkstra", "graph": PARALLEL, "start": "A"}),
    "trace prim CEG": ("graph.trace", {"algo": "prim", "graph": CEG, "start": "A"}),
    "trace prim split": ("graph.trace", {"algo": "prim", "graph": SPLIT, "start": "A"}),
    "trace bfs petersen": ("graph.trace", {"algo": "bfs", "graph": PETERSEN, "start": "A"}),
    "trace dfs CEG": ("graph.trace", {"algo": "dfs", "graph": CEG, "start": "A"}),
    "mst CEG": ("graph.mst", {"graph": CEG}),
    "mst parallel": ("graph.mst", {"graph": PARALLEL}),
    "mst split": ("graph.mst", {"graph": SPLIT}),
    "maxflow textbook": ("graph.maxflow", {"graph": FLOW, "source": "s", "sink": "t"}),
    "maxflow CEG undirected": ("graph.maxflow", {"graph": CEG, "source": "A", "sink": "H"}),
    "coloring petersen": ("graph.coloring", {"graph": PETERSEN}),
    "coloring C5": ("graph.coloring", {"graph": C5}),
    "coloring K33": ("graph.coloring", {"graph": K33}),
    "simplify rational": ("symbolic.simplify", {"expr": "(x^2-1)/(x-1)"}),
    "simplify trig": ("symbolic.simplify", {"expr": "sin(t)^2 + cos(t)^2 + 2t", "vars": ["t"]}),
    "derivative product": ("symbolic.derivative", {"expr": "x^3 sin(x)"}),
    "derivative second": ("symbolic.derivative", {"expr": "e^(2t)", "var": "t", "order": 2}),
    "integrate parts": ("symbolic.integrate", {"expr": "x e^x"}),
    "integrate u-sub": ("symbolic.integrate", {"expr": "2x cos(x^2)"}),
    "integrate definite": ("symbolic.integrate", {"expr": "1/(x^2+1)", "lower": "0", "upper": "1"}),
    "solve system": ("symbolic.solve", {"equations": ["x + y = 3", "x - y = 1"], "vars": ["x", "y"]}),
    "solve quadratic": ("symbolic.solve", {"equations": ["x^2 = 4"], "vars": ["x"]}),
    "series p2": ("symbolic.series_test", {"term": "1/n^2"}),
    "series harmonic": ("symbolic.series_test", {"term": "1/n"}),
    "series geometric": ("symbolic.series_test", {"term": "(1/2)^k", "var": "k", "start": 0}),
}


def run_all():
    return {name: engine.call(t, a) for name, (t, a) in CASES.items()}


class Golden(unittest.TestCase):
    def test_golden(self):
        got = run_all()
        if os.environ.get("ENGINE_GOLDEN") == "write":
            with open(GOLDEN, "w", encoding="utf-8") as f:
                json.dump({"version": engine.VERSION, "cases": got}, f, indent=1, sort_keys=True)
                f.write("\n")
        with open(GOLDEN, encoding="utf-8") as f:
            gold = json.load(f)
        self.assertEqual(gold["version"], engine.VERSION, "engine.VERSION changed: regenerate the golden file (see the docstring)")
        self.assertEqual(sorted(gold["cases"]), sorted(CASES), "a case was added or removed: regenerate the golden file")
        for name in CASES:
            with self.subTest(name):
                self.assertEqual(got[name], gold["cases"][name], "output changed: bump engine.VERSION and regenerate")

    def test_two_cases_per_tool(self):
        """plan v2 Part B: a new tool = tool + checker + 2 golden tests"""
        for t in engine.spec():
            self.assertGreaterEqual(sum(1 for tt, _ in CASES.values() if tt == t["name"]), 2, t["name"])


class GraphTruth(unittest.TestCase):
    """the same answers, re-derived by networkx"""

    def walk_ok(self, block, w):
        g = eg.Net(block)
        keys = {k for *_, k in g.edges}
        for st in w["stages"]:
            self.assertLessEqual(set(st["nodes"]) | set(st["tags"]), set(g.ids))
            self.assertLessEqual(set(st["edges"]), keys)
            self.assertEqual(sum(s == "cur" for s in st["nodes"].values()), 1)
        self.assertEqual([r[0] for r in w["order"]], [r[0] for r in w["stages"][-1]["rows"]])

    def test_dijkstra_distances(self):
        import networkx as nx
        for block, s in ((CEG, "A"), (DIR, "S"), (PARALLEL, "A")):
            w = engine.call("graph.trace", {"algo": "dijkstra", "graph": block, "start": s})
            self.walk_ok(block, w)
            want = nx.single_source_dijkstra_path_length(eg.Net(block).nx(), s)
            self.assertEqual({v: float(d) for v, d in w["order"]}, {v: float(d) for v, d in want.items()})
            self.assertEqual([float(d) for _, d in w["order"]], sorted(float(d) for _, d in w["order"]))   # locked in distance order

    def test_ceg_matches_plan(self):
        """brain openui-graph-plan §4.1: A 0, B 8, C 15, I 18, D 22, H 23, F/G 28, E 30; stage 3 = C locked, C-D skipped"""
        w = engine.call("graph.trace", {"algo": "dijkstra", "graph": CEG, "start": "A"})
        self.assertEqual(w["order"], [["A", "0"], ["B", "8"], ["C", "15"], ["I", "18"], ["D", "22"], ["H", "23"], ["F", "28"], ["G", "28"], ["E", "30"]])
        self.assertEqual(w["ties"], [["F", "G"]])
        st = w["stages"][2]
        self.assertEqual((st["nodes"]["C"], st["edges"]["C-D"], st["edges"]["B-D"], st["tags"]["D"]), ("cur", "skip", "seen", "22"))

    def test_prim_and_mst_agree(self):
        import networkx as nx
        for block in (CEG, PARALLEL, SPLIT):
            w = engine.call("graph.trace", {"algo": "prim", "graph": block, "start": "A"})
            self.walk_ok(block, w)
            m = engine.call("graph.mst", {"graph": block})
            g = eg.Net(block).nx()
            comp = nx.node_connected_component(g, "A")
            self.assertEqual(sum(float(k) for _, k in w["order"]), nx.minimum_spanning_tree(g.subgraph(comp)).size(weight="weight"))
            self.assertEqual(m["total"], nx.minimum_spanning_tree(g).size(weight="weight"))
            self.assertEqual(len(m["edges"]), len(g) - nx.number_connected_components(g))
        self.assertFalse(engine.call("graph.mst", {"graph": CEG})["unique"])        # an equal-weight swap exists: two MSTs
        self.assertTrue(engine.call("graph.mst", {"graph": PARALLEL})["unique"])

    def test_bfs_depths(self):
        import networkx as nx
        w = engine.call("graph.trace", {"algo": "bfs", "graph": PETERSEN, "start": "A"})
        self.walk_ok(PETERSEN, w)
        self.assertEqual({v: int(d) for v, d in w["order"]}, nx.single_source_shortest_path_length(eg.Net(PETERSEN).nx(), "A"))

    def test_dfs_tree(self):
        w = engine.call("graph.trace", {"algo": "dfs", "graph": CEG, "start": "A"})
        self.walk_ok(CEG, w)
        tree = [k for k, s in w["stages"][-1]["edges"].items() if s == "tree"]
        self.assertEqual(len(tree), len(CEG["nodes"]) - 1)

    def test_maxflow(self):
        import networkx as nx
        for block, s, t in ((FLOW, "s", "t"), (CEG, "A", "H")):
            r = engine.call("graph.maxflow", {"graph": block, "source": s, "sink": t})
            g = eg.Net(block)
            cap = {k: w for *_, w, k in g.edges}
            for k, f in r["flow"].items():
                self.assertLessEqual(abs(f), cap[k])
            bal = dict.fromkeys(g.ids, 0)      # conservation away from s and t
            for u, v, _, k in g.edges:
                bal[u] -= r["flow"][k]
                bal[v] += r["flow"][k]
            self.assertEqual({v: b for v, b in bal.items() if v not in (s, t)}, dict.fromkeys(set(g.ids) - {s, t}, 0))
            self.assertEqual(bal[t], r["value"])
            self.assertEqual(r["value"], sum(cap[k] for k in r["cut_edges"]))       # max flow = min cut
        self.assertEqual(engine.call("graph.maxflow", {"graph": FLOW, "source": "s", "sink": "t"})["value"], 15)

    def test_coloring(self):
        for block, k in ((PETERSEN, 3), (C5, 3), (K33, 2), (CEG, 3)):
            r = engine.call("graph.coloring", {"graph": block})
            self.assertEqual(r["chromatic"], k)
            for e in block["edges"]:
                self.assertNotEqual(r["colors"][e["from"]], r["colors"][e["to"]])

    def test_bad_graphs(self):
        for t, a, code in (("graph.trace", {"algo": "dijkstra", "graph": net([("A", "B", -1)]), "start": "A"}, "bad-graph"),
                           ("graph.trace", {"algo": "dijkstra", "graph": net([("A", "B")]), "start": "Q"}, "bad-args"),
                           ("graph.trace", {"algo": "prim", "graph": DIR, "start": "S"}, "bad-args"),
                           ("graph.mst", {"graph": {"nodes": ["A"], "edges": [{"from": "A", "to": "Z"}]}}, "bad-graph"),
                           ("graph.coloring", {"graph": PARALLEL}, "bad-graph"),
                           ("graph.trace", {"algo": "bfs", "graph": CEG}, "bad-args"),
                           ("graph.nope", {}, "unknown-tool")):
            with self.subTest(t=t, code=code), self.assertRaises(engine.EngineError) as cm:
                engine.call(t, a)
            self.assertEqual(cm.exception.code, code)


class SymbolicTruth(unittest.TestCase):
    def test_integrals_differentiate_back(self):
        import sympy
        for e in ("x e^x", "2x cos(x^2)", "1/(x^2+1)", "ln(x)"):
            r = engine.call("symbolic.integrate", {"expr": e})
            back = engine.call("symbolic.derivative", {"expr": r["result"]["text"]})["text"]
            self.assertEqual(engine.call("symbolic.simplify", {"expr": f"({back}) - ({e})"})["text"], "0", e)
            self.assertTrue(r["steps"], e)
        self.assertIn("Substitution", [s["rule"] for s in engine.call("symbolic.integrate", {"expr": "2x cos(x^2)"})["steps"]])
        self.assertEqual(sympy.sympify("pi/4"), sympy.sympify(engine.call("symbolic.integrate", {"expr": "1/(1+x^2)", "lower": "0", "upper": "1"})["result"]["text"]))

    def test_solutions_satisfy(self):
        r = engine.call("symbolic.solve", {"equations": ["x^2 - 5x + 6 = 0"], "vars": ["x"]})
        self.assertEqual(sorted(s["x"]["text"] for s in r["solutions"]), ["2", "3"])
        self.assertEqual(engine.call("symbolic.solve", {"equations": ["x^2 = -1"], "vars": ["x"]})["solutions"], [])   # real only

    def test_series(self):
        for term, v in (("1/n^2", "converges"), ("1/n", "diverges"), ("n/(n+1)", "diverges"), ("(-1)^n/n", "converges")):
            self.assertEqual(engine.call("symbolic.series_test", {"term": term})["verdict"], v, term)

    def test_refuses_code_and_bombs(self):
        """text reaches sympy's eval only through serve.to_python's allowlist"""
        for e in ("__import__('os')", "x.__class__", "exec(1)", "9^9^9^9", "x" * 201, "lambda: 1", "", "x = 1"):
            with self.subTest(e=e), self.assertRaises(engine.EngineError) as cm:
                engine.call("symbolic.simplify", {"expr": e})
            self.assertIn(cm.exception.code, ("unreadable", "bad-args"))
        with self.assertRaises(engine.EngineError):
            engine.call("symbolic.simplify", {"expr": "sin + 1", "vars": ["sin"]})      # a function name is never a variable


class Api(unittest.TestCase):
    def test_spec(self):
        names = [t["name"] for t in engine.spec()]
        self.assertEqual(names, sorted(names))
        self.assertLessEqual({"graph.trace", "graph.mst", "graph.maxflow", "graph.coloring", "symbolic.simplify", "symbolic.derivative",
                              "symbolic.integrate", "symbolic.solve", "symbolic.series_test"}, set(names))
        for t in engine.spec():
            self.assertEqual(t["input"]["type"], "object", t["name"])
            self.assertTrue(t["description"], t["name"])
            json.dumps(t)                                       # schemas are plain JSON (MCP tool list)

    def test_check(self):
        s = {"type": "object", "required": ["a"], "additionalProperties": False,
             "properties": {"a": {"type": "integer", "minimum": 1}, "b": {"type": "array", "maxItems": 1, "items": {"enum": ["x"]}}}}
        self.assertEqual(engine.check({"a": 2, "b": ["x"]}, s), [])
        for bad in ({}, {"a": 0}, {"a": True}, {"a": 1, "c": 1}, {"a": 1, "b": ["x", "x"]}, {"a": 1, "b": ["y"]}, []):
            self.assertTrue(engine.check(bad, s), bad)


if __name__ == "__main__":
    unittest.main()
