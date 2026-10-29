"""views_gate.py scene checker (viz MVP, todo 120; contract views/scene-contract.md): a Steps whose fig is a Scene is checked as one
unit: schema per primitive, ids + refs, relations (directed, acyclic), the one expression grammar, Trace run by the server, ops,
the step rules (count, one-change, show, pull, density, caption), leaks by stage (server-set; strings AND evaluated values, unit
variants), caption voice lints, one repair round then text only. One red test per primitive / relation / rule."""
import json
import os
import re
import sys
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
import livefig  # noqa: E402
import views_gate  # noqa: E402

with open(os.path.join(ROOT, "views", "scene-contract.md"), encoding="utf-8") as _f:
    DOC = _f.read()
ROD = re.search(r"```\n([\s\S]*?)```", DOC[DOC.index("## 9. Worked example"):]).group(1).strip()
VECTORS = json.loads(re.search(r"Conformance vectors[^\n]*\n```json\n([\s\S]*?)```", DOC).group(1))
QUESTION = ("A uniform rod 10 segments long hangs level from two strings. T1 = 100 N pulls 2 segments from the left end, "
            "T2 at the right end. Find the weight W.")
CTX = livefig.context("ROD", QUESTION, "", [160.0], more="80")
NULLS = ", null" * 6


def step(cap, ops, ask=None):
    return f"Step({json.dumps(cap)}{NULLS}, {json.dumps(ops)}" + (f", {ask}" if ask else "") + ")"


def _adds(ids):
    ops, cur = [], "add"
    for i in ids:
        if len(cur) + 1 + len(i) > 40:
            ops.append(cur)
            cur = "add"
        cur += " " + i
    return ops + [cur]


def build(objs, qs=(), rels=(), steps=None, extra=()):
    """a scene program: objs = call texts (id first), qs = Q call texts (Q n = 3 is always added), default steps = setup adds every
    object, step 2 glows + asks, step 3 params n (so show and pull hold)"""
    ids = [re.match(r'\w+\("([^"]+)"', o).group(1) for o in objs]
    qs = [*qs, 'Q("n", "given", 3)']
    if steps is None:
        steps = [step("You drew this. Where do you start?", _adds(ids)),
                 step("Look at it once more.", [f"glow {ids[0]}"], 'Ask("Which one?", ["this", "that"])'),
                 step("Now change the count and watch.", ["param n 4"])]
    lines = ["root = View([st])", f"st = Steps(sc, [{', '.join(f'p{i}' for i in range(len(steps)))}])",
             f"sc = Scene([{', '.join(f'o{i}' for i in range(len(objs)))}], [{', '.join(f'q{i}' for i in range(len(qs)))}], {json.dumps(list(rels))})"]
    lines += [f"o{i} = {o}" for i, o in enumerate(objs)] + [f"q{i} = {q}" for i, q in enumerate(qs)]
    lines += [f"p{i} = {s}" for i, s in enumerate(steps)] + list(extra)
    return "\n".join(lines)


def codes(src, stage="wrong", ctx=CTX):
    return {e.split(": ")[1] for e in views_gate.scene_errors(src, ctx, stage)}


RECT = 'Shape("a", "rect", "w=2 h=1", "0,0")'
RECT_B = 'Shape("b", "rect", "w=2 h=1", "4,0")'


class Expr(unittest.TestCase):
    def test_conformance_vectors(self):   # the contract's vectors: the JS port (V-B) runs the same list
        env = {"L": 10, "T1": 100, "a": 2}
        for text, want in VECTORS:
            if isinstance(want, str):
                with self.assertRaises(views_gate.SceneError, msg=text) as e:
                    views_gate.expr_eval(text, env)
                self.assertEqual(e.exception.code, want, text)
            else:
                self.assertAlmostEqual(views_gate.expr_eval(text, env), want, places=9, msg=text)

    def test_x_only_inside_a_curve_and_names(self):
        self.assertEqual(views_gate.expr_eval("x^2/2+1", {}, allow_x=True, x=2), 3)
        self.assertEqual(views_gate.expr_names("T1*rod.w + sqrt(L) - pi"), ({"T1", "L"}, {("rod", "w")}))
        with self.assertRaises(views_gate.SceneError):
            views_gate.expr_eval("1" + "+1" * 40, {})          # over 80 characters
        with self.assertRaises(views_gate.SceneError):
            views_gate.expr_eval("(" * 9 + "1" + ")" * 9, {})   # over 8 deep


class Primitives(unittest.TestCase):
    def test_rod_example_passes_and_goes_out_unchanged(self):
        self.assertEqual(views_gate.scene_errors(ROD, CTX, "wrong"), [])
        prog, log = views_gate.gate(ROD, CTX, "wrong")
        self.assertEqual(log, ["ok"])
        self.assertEqual(prog, ROD)

    def test_registry_example_is_the_contract_example(self):
        reg = views_gate.registry()
        self.assertEqual("\n".join(reg["recipes"]["scene-steps"]["example"]), ROD)

    def test_shape_kinds(self):
        good = [("rect", "w=2 h=1 radius=0.1 segments=4 rotate=10", "0,0"), ("circle", "r=1", "0,0"), ("triangle", "base=4 height=3 apex=0", "0,0"),
                ("polygon", "pts=0,0;4,0;4,3", None), ("line", "from=0,0 to=4,0", None), ("point", "", "1,1")]
        for kind, geom, at in good:
            src = build([f'Shape("a", "{kind}", "{geom}", {json.dumps(at)})'])
            self.assertEqual(codes(src), set(), kind)
        bad = [("rect", "w=2", "0,0", "geom-missing"), ("circle", "r=1 q=2", "0,0", "geom-key"), ("triangle", "base=4", "0,0", "geom-missing"),
               ("polygon", "pts=0,0;1,1", None, "geom-value"), ("line", "from=0,0 to=4,0", "0,0", "geom-key"), ("point", "r=1", "1,1", "geom-key"),
               ("rect", "w=2 h=1 segments=30", "0,0", "geom-value"), ("triangle", "base=4 height=3 apex=2", "0,0", "geom-value"),
               ("rect", "w=2 h=1", "0;0", "point")]
        for kind, geom, at, want in bad:
            self.assertIn(want, codes(build([f'Shape("a", "{kind}", "{geom}", {json.dumps(at)})'])), (kind, geom))

    def test_shape_role_right_is_post_only(self):
        src = build(['Shape("a", "point", "", "1,1", null, null, "right")'])
        self.assertIn("role-stage", codes(src, "wrong"))
        self.assertEqual(codes(src, "post"), set())

    def test_link_kinds(self):
        good = [('Link("l", "arrow", "a.right", "b.left", null, null, "head=both")'), ('Link("l", "vector", "a.top", "+0,1.5", "F")'),
                ('Link("l", "spring", "a.right", "b.left", null, null, "coils=8")'), ('Link("l", "string", "a.top@0.5", "4,5")'),
                ('Link("l", "dimension", "a.corner0", "a.corner1", "w", null, "offset=-0.5")'),
                ('Link("l", "angle", "a.corner1", "a.corner3", "θ", null, "at=a.corner0 r=0.5")')]
        for link in good:
            self.assertEqual(codes(build([RECT, RECT_B, link])), set(), link)
        bad = [('Link("l", "spring", "a.right", "b.left", null, null, "coils=1")', "geom-value"),
               ('Link("l", "angle", "a.corner1", "a.corner3")', "geom-missing"),
               ('Link("l", "arrow", "a.right", "b.left", null, null, "head=sideways")', "geom-value"),
               ('Link("l", "vector", "a.top", "+0")', "point"), ('Link("l", "string", "a.right", "b.left", null, null, "coils=3")', "geom-key"),
               ('Link("l", "vector", "a.top", "+0,1", null, "nope")', "ref")]
        for link, want in bad:
            self.assertIn(want, codes(build([RECT, RECT_B, link])), link)

    def test_anchors(self):
        for to in ("a.top@0.2", "a.corner3", "t.hyp@0.5", "g@0.25", "a", "t.corner2"):
            src = build([RECT, 'Shape("t", "triangle", "base=4 height=3 apex=0", "5,0")', 'Shape("g", "line", "from=0,5 to=8,5")',
                         f'Link("l", "string", "g@0.5", "{to}")'])
            self.assertEqual(codes(src), set(), to)
        for to, want in (("a.top@1.5", "anchor"), ("a.hyp", "anchor"), ("a@0.2", "anchor"), ("nope.left", "ref"), ("a.corner4", "anchor")):
            src = build([RECT, f'Link("l", "string", "0,5", "{to}")'])
            self.assertIn(want, codes(src), to)

    def test_axes_items(self):
        items = ["f curve x^2/2+1", "p line 0,1;2,3;4,9", "A area f 0 4", "R riemann f 0 4 n left", "t tangent f 1", "d pointon f 2",
                 "m marker y 6 your guess", "k marker x 3"]
        self.assertEqual(codes(build([f'Axes("ax", "0,4 x", "0,10 f(x)", {json.dumps(items)})'])), set())
        for item, want in (("z blob 1", "axes-item"), ("A area g 0 4", "ref"), ("R riemann f 0 4 n sideways", "axes-item"),
                           ("g curve y+1", "expr-name"), ("m marker z 3", "axes-item"), ("t tangent f", "axes-item")):
            src = build([f'Axes("ax", "0,4 x", "0,10", {json.dumps(["f curve x+1", item])})'])
            self.assertIn(want, codes(src), item)
        self.assertIn("axes-range", codes(build(['Axes("ax", "4,0 x", "0,10", ["f curve x"])'])))

    def test_mathrows_tokens(self):
        self.assertEqual(codes(build([RECT, 'MathRows("eq", ["{n} = 3", "= 1 + 2"])'])), set())
        self.assertIn("token", codes(build([RECT, 'MathRows("eq", ["{nope} = 3"])'])))

    LOOP = 'Code("cd", "python", ["total = 0", "for i in range(1, 6):", "    total += i", "print(total)"])'

    def test_trace_is_run_by_the_server(self):
        src = build([self.LOOP, 'Trace("tr", "cd", "i total")'])
        ctx = livefig.context("LOOP", "What does this loop print? for i in range(1, 6): total += i", "", [15.0])
        self.assertEqual(views_gate.trace_ticks(["total = 0", "for i in range(1, 6):", "    total += i", "print(total)"], "i total")[:4],
                         ["L0 i=- total=-", "L1 i=- total=0", "L2 i=1 total=0", "L3 i=1 total=1"])
        prog, log = views_gate.gate(src, ctx, "post")
        self.assertEqual(log, ["ok"])
        ticks = json.loads(re.search(r'Trace\("tr", "cd", "i total", (\[.*\])\)', prog).group(1))
        self.assertEqual(len(ticks), 13)
        self.assertEqual(ticks[-1], "L4 i=5 total=15")
        prog, log = views_gate.gate(src, ctx, "wrong")                      # before a solve the final value is a hidden answer
        ticks = json.loads(re.search(r'Trace\("tr", "cd", "i total", (\[.*\])\)', prog).group(1))
        self.assertEqual(ticks[-1], "L4 i=5 total=?")
        self.assertIn("L3 i=4 total=10", ticks)                            # middle values stay

    def test_model_written_ticks_are_replaced(self):
        src = build([self.LOOP, 'Trace("tr", "cd", "i total", ["L9 i=99 total=99"])'])
        prog, _ = views_gate.gate(src, CTX, "post")
        self.assertNotIn("i=99", prog)
        self.assertIn('"L0 i=- total=-"', prog)

    def test_trace_errors(self):
        for code, want in (('Code("cd", "js", ["let t = 0"])', "trace-lang"), ('Code("cd", "python", ["import os"])', "trace-unsupported"),
                           ('Code("cd", "python", ["i = 0", "while i < 100:", "    i += 1"])', "trace-long"),
                           ('Code("cd", "python", ["print(y)"])', "trace-unsupported")):
            self.assertIn(want, codes(build([code, 'Trace("tr", "cd", "i")'])), code)
        self.assertIn("ref", codes(build([self.LOOP, 'Trace("tr", "zz", "i")'])))

    def test_cells(self):
        self.assertEqual(codes(build(['Cells("ar", "array", ["1", "2", "3"], "i:0 j:2")'])), set())
        self.assertEqual(codes(build(['Cells("gr", "grid", ["1 2", "3 4"], "p:1.0")'])), set())
        for ptrs in ("i:x", "i:5", "i"):
            self.assertIn("cells-ptr", codes(build([f'Cells("ar", "array", ["1", "2", "3"], "{ptrs}")'])), ptrs)
        steps = [step("You have this list. Where does i start?", ["add ar"]), step("Look at the first cell.", ["glow ar"], 'Ask("Which cell?", ["1", "2"])'),
                 step("Move i one cell along.", ["set ar ptr.i 1"])]
        self.assertEqual(codes(build(['Cells("ar", "array", ["1", "2", "3"], "i:0")'], steps=steps)), set())
        steps[2] = step("Move i one cell along.", ["set ar ptr.i 7"])
        self.assertIn("cells-ptr", codes(build(['Cells("ar", "array", ["1", "2", "3"], "i:0")'], steps=steps)))

    def test_bars_conserve(self):
        qs = ['Q("U0", "given", 10)', 'Q("K", "given", 4)']
        self.assertEqual(codes(build(['Bars("en", ["PE: U0-K", "KE: K"], "U0", true)'], qs)), set())
        self.assertIn("conserve", codes(build(['Bars("en", ["PE: U0", "KE: K"], "U0", true)'], qs)))
        self.assertIn("bars-item", codes(build(['Bars("en", ["PE U0"], "U0")'], qs)))

    def test_q_roles(self):
        for q, want in (('Q("W", "answer", 160, "N", "T1*8/5")', "answer-literal"), ('Q("g", "given")', "q-role"),
                        ('Q("d", "derived", null, null, null)', "q-role"), ('Q("u", "unknown", null, null, "1+1")', "q-role"),
                        ('Q("d", "derived", 3, null, "1+2")', "q-role"), ('Q("W", "answer")', "q-role")):
            self.assertIn(want, codes(build([RECT], ['Q("T1", "given", 100)', q])), q)

    def test_scene_parts_only_inside_a_scene(self):
        prog, log = views_gate.gate('root = View([s, t])\ns = Shape("a", "point", "", "1,1")\nt = Text("You see it.")', CTX)
        self.assertEqual(log, ["s:scene-outside:Shape"])
        self.assertIn("scene-outside", codes(build([RECT, 'Q("z", "given", 2)'])))
        prog, log = views_gate.gate('root = View([g])\ng = Steps(null, [Step("hi")])', CTX)
        self.assertEqual(log, ["g:chat:Steps", "empty"])      # a Graph stepper keeps its old chat rule

    def test_scene_step_leaves_graph_args_null(self):
        src = build([RECT]).replace('Step("You drew this. Where do you start?", null', 'Step("You drew this. Where do you start?", "a:cur"')
        self.assertIn("scene-step-graph-arg", codes(src))


class Relations(unittest.TestCase):
    TRI = 'Shape("ramp", "triangle", "base=6 height=3 apex=0", "0,0")'
    BALL = 'Shape("ball", "circle", "r=0.5")'
    SPRING = 'Link("sp", "spring", "0,0", "1,0")'

    def test_each_relation(self):
        cases = [([RECT, self.BALL, self.SPRING], ["attach sp.end ball.left", "attach ball a.top"]),
                 ([self.TRI, self.BALL], ["on ball ramp.hyp 0.3"]), ([RECT], ["pivot a a.right"]),
                 ([RECT, RECT_B], ["align a b bottom"]), ([RECT, RECT_B, 'Shape("c", "rect", "w=1 h=1")'], ["distribute a b c x 0.5"]),
                 ([RECT, RECT_B], ["stack a b x"]), ([RECT, RECT_B], ["set b.w 2*a.w"]),
                 ([RECT, 'Link("F1", "vector", "a.top", "+0,1", null, "T1")', 'Link("F2", "vector", "a.bottom", "+0,-1", null, "T2")'], ["scale F1 F2"])]
        for objs, rels in cases:
            self.assertEqual(codes(build(objs, ['Q("T1", "given", 3)', 'Q("T2", "given", 4)'], rels)), set(), rels)

    def test_rel_parse(self):
        for rel in ("glue a b", "attach a", "align a bottom", "stack a b z", "on a b.top", "set a.color 3", "scale a"):
            self.assertIn("rel-parse", codes(build([RECT, RECT_B], rels=[rel])), rel)

    def test_rel_refs(self):
        self.assertIn("ref", codes(build([RECT], rels=["pivot nope a.left"])))

    def test_acyclic(self):
        self.assertIn("rel-cycle", codes(build([RECT, RECT_B], rels=["attach a b.left", "attach b a.right"])))
        self.assertIn("rel-cycle", codes(build([RECT, RECT_B], rels=["set a.w b.w", "set b.w a.w"])))
        self.assertIn("rel-cycle", codes(build(['Shape("a", "point", "", "b")', 'Shape("b", "point", "", "a")'])))

    def test_one_writer_per_prop(self):
        self.assertIn("rel-conflict", codes(build([RECT, RECT_B], rels=["attach a b.left", "align b a bottom"])))
        steps = [step("You drew two boxes. Which is wider?", ["add a b"]), step("Look at the left one.", ["glow a"], 'Ask("Which one?", ["a", "b"])'),
                 step("Now stretch the right one.", ["set b w 3"])]
        self.assertIn("rel-conflict", codes(build([RECT, RECT_B], rels=["set b.w 2*a.w"], steps=steps)))


class Ids(unittest.TestCase):
    def test_id_rules(self):
        self.assertIn("id", codes(build(['Shape("1a", "point", "", "1,1")'])))
        self.assertIn("id", codes(build(['Shape("a_very_long_name_x", "point", "", "1,1")'])))
        self.assertIn("id-dup", codes(build([RECT], ['Q("a", "given", 2)'])))
        self.assertIn("id-dup", codes(build([RECT, 'Axes("ax", "0,4", "0,4", ["a curve x"])'])))
        self.assertIn("id-reserved", codes(build(['Shape("pi", "point", "", "1,1")'])))

    def test_every_object_is_added(self):
        steps = [step("You drew a box. Where is it?", ["add a"]), step("Look at it.", ["glow a"], 'Ask("Which one?", ["a", "b"])'),
                 step("Now change the count.", ["param n 4"])]
        self.assertIn("unused", codes(build([RECT, RECT_B], steps=steps)))


class Ops(unittest.TestCase):
    def steps(self, *later):
        return [step("You drew two boxes. Which is wider?", ["add a b"]), step("Look at the left one.", ["glow a"], 'Ask("Which one?", ["a", "b"])'),
                *[step("Now watch the change.", ops) for ops in later]]

    def test_each_op(self):
        for later in ([["set a rotate -6"]], [["set a rotate 2"], ["hide b"], ["set a rotate 4"]], [["param n 5", "camera fit a"]], [["set a at 1,1", "camera all"]],
                      [["set b w 2*a.w"]]):
            self.assertEqual(codes(build([RECT, RECT_B], steps=self.steps(*later))), set(), later)   # a hide is no reveal and no show
        self.assertEqual(codes(build([RECT, RECT_B, 'Shape("c", "point", "", "3,3")'], steps=self.steps(["add c", "glow c a"]))), set())

    def test_op_parse_and_prop(self):
        for ops, want in ((["zoom a"], "op-parse"), (["camera a"], "op-parse"), (["param n x"], "op-parse"), (["set a"], "op-parse"),
                          (["set a color 3"], "op-prop"), (["set a tick 2"], "op-prop"), (["param W 5"], "op-prop"), (["set a at 1;1"], "point")):
            src = build([RECT, RECT_B], ['Q("W", "answer", null, null, "n*2")'], steps=self.steps(ops))
            self.assertIn(want, codes(src), ops)

    def test_op_state(self):
        self.assertIn("op-state", codes(build([RECT, RECT_B, 'Shape("c", "point", "", "3,3")'], steps=self.steps(["glow c"], ["add c"]))))
        self.assertIn("op-state", codes(build([RECT, RECT_B], steps=self.steps(["hide b"], ["set b rotate 3"]))))
        self.assertIn("op-state", codes(build([RECT, RECT_B], steps=self.steps(["add a"]))))


class Rules(unittest.TestCase):
    def base(self, n):
        out = [step("You drew two boxes. Which is wider?", ["add a b"]), step("Look at the left one.", ["glow a"], 'Ask("Which one?", ["a", "b"])')]
        return out + [step("Now turn the box a bit more.", [f"set a rotate {k}"]) for k in range(1, n - 1)]

    def test_step_count(self):
        self.assertIn("step-count", codes(build([RECT, RECT_B], steps=self.base(2))))
        self.assertIn("step-count", codes(build([RECT, RECT_B], steps=self.base(7))))
        self.assertEqual(codes(build([RECT, RECT_B], steps=self.base(6))), set())

    def test_one_change(self):
        steps = [step("You drew a box. Where is it?", ["add a"]), step("Look at it.", ["glow a"], 'Ask("Which one?", ["a", "b"])'),
                 step("Now add the second box and turn the first.", ["add b", "set a rotate 4"])]
        self.assertIn("one-change", codes(build([RECT, RECT_B], steps=steps)))

    def test_show(self):
        steps = [step("You drew a box. Where is it?", ["add a"]), step("Look at it.", ["glow a"], 'Ask("Which one?", ["a", "b"])'),
                 step("Now turn the box.", ["set a rotate 4"]), step("Write the rule down.", ["add eq"])]
        self.assertIn("show", codes(build([RECT, 'MathRows("eq", ["{n} = 3"])'], steps=steps)))

    def test_pull(self):
        no_ask = [step("You drew two boxes. Which is wider?", ["add a b"]), step("Look at the left one.", ["glow a"]),
                  step("Now turn the box.", ["set a rotate 4"])]
        self.assertIn("pull", codes(build([RECT, RECT_B], steps=no_ask)))
        last_ask = no_ask[:2] + [step("Now turn the box.", ["set a rotate 4"], 'Ask("Which one?", ["a", "b"])')]
        self.assertIn("pull", codes(build([RECT, RECT_B], steps=last_ask)))
        silent = [no_ask[0], step("Look at the left one.", ["glow a"], 'Ask("Which one?", ["a", "b"])'), step("Look again.", ["glow b"]),
                  step("Now turn the box.", ["set a rotate 4"])]
        self.assertIn("pull", codes(build([RECT, RECT_B], steps=silent)))

    def test_density(self):
        objs = [f'Shape("s{i}", "point", "", "{i},0", "p{i}")' for i in range(7)]
        self.assertIn("density", codes(build(objs)))                                       # 7 labels
        objs = [f'Shape("s{i}", "point", "", "{i},0")' for i in range(5)] + [f'Axes("ax", "0,4", "0,4", {json.dumps([f"m{i} marker x {i % 4}" for i in range(8)])})']
        self.assertIn("density", codes(build(objs)))                                       # 13 marks

    def test_caption_long(self):
        steps = self.base(3)
        steps[2] = step("Now turn the box a bit more and then look at the other box again very slowly.", ["set a rotate 4"])
        self.assertIn("caption-long", codes(build([RECT, RECT_B], steps=steps)))

    def test_voice(self):
        for cap, want in (("Turn it — slowly.", "voice:dash"), ("Turn it now!", "voice:exclaim"), ("Let's turn the box.", "voice:hype"),
                          ("Turn it, the crucial part.", "voice:hype"), ("Turn it, not left, but right.", "voice:not-but"),
                          ("Does it turn? Yes, it turns.", "voice:qa"), ("Watch as the box wants to turn.", "voice:persona")):
            steps = self.base(3)
            steps[2] = step(cap, ["set a rotate 4"])
            self.assertIn(want, codes(build([RECT, RECT_B], steps=steps)), cap)
        third = [step("The boxes sit there.", ["add a b"]), step("The left box is small.", ["glow a"], 'Ask("Which one?", ["a", "b"])'),
                 step("The box turns.", ["set a rotate 4"])]
        self.assertIn("voice:you", codes(build([RECT, RECT_B], steps=third)))


class Leak(unittest.TestCase):
    def cap(self, text, stage="wrong", qs=()):
        steps = [step("You drew two boxes. Which is wider?", ["add a b"]), step("Look at the left one.", ["glow a"], 'Ask("Which one?", ["a", "b"])'),
                 step(text, ["set a rotate 4"])]
        return codes(build([RECT, RECT_B], qs, steps=steps), stage)

    def test_answer_in_a_string(self):
        self.assertIn("leak", self.cap("You get W = 160 N here."))
        self.assertIn("leak", self.cap("You get W = 160.2 N here."))           # 3 significant figures
        for variant in ("16", "1.6", "0.16", "16000"):                          # unit variants
            self.assertIn("leak", self.cap(f"You get W = {variant} here."), variant)

    def test_not_given(self):
        self.assertIn("not-given", self.cap("You count 37 boxes here."))
        self.assertEqual(self.cap("You count 8 segments and 100 N."), set())   # 0..12 and givens

    def test_derived_hitting_the_answer(self):
        self.assertIn("leak-q", self.cap("Look at {x2}.", qs=['Q("T1", "given", 100)', 'Q("x2", "derived", null, null, "T1*8/5")']))
        self.assertIn("leak-q", self.cap("Look at {x2}.", qs=['Q("T1", "given", 100)', 'Q("x2", "derived", null, null, "T1*8/50")']))

    def test_reveal_rule(self):   # locked: after a wrong answer never the final answer's numbers; middle values allowed; after a solve all
        qs = ['Q("T1", "given", 100)', 'Q("arm", "derived", null, null, "10-2")', 'Q("W", "answer", null, "N", "T1*8/5", "W")']
        self.assertEqual(self.cap("You count {arm} segments. Find {W}.", qs=qs), set())
        self.assertEqual(self.cap("You count {arm} segments; that is 8.", qs=qs), set())
        self.assertIn("leak", self.cap("You get 160 N.", qs=qs, stage="wrong"))
        self.assertIn("leak", self.cap("You get 160 N.", qs=qs, stage="pre"))
        self.assertEqual(self.cap("You get 160 N.", qs=qs, stage="post"), set())
        self.assertEqual(self.cap("Look at {x2}.", qs=['Q("T1", "given", 100)', 'Q("x2", "derived", null, null, "T1*8/5")'], stage="post"), set())

    def test_numbers_outside_captions(self):
        steps = [step("You drew two boxes. Which is wider?", ["add a b"]), step("Look at the left one.", ["glow a"], 'Ask("Which one?", ["a", "b"])'),
                 step("Now turn the box.", ["set a rotate 16"])]
        self.assertIn("leak", codes(build([RECT, RECT_B], steps=steps)))                          # op value
        self.assertIn("leak", codes(build(['Shape("a", "rect", "w=160 h=1", "0,0")'])))          # geom value
        self.assertIn("leak", codes(build(['Axes("ax", "0,160 x", "0,4", ["f curve x"])'])))     # axis range
        self.assertIn("leak", codes(build([RECT], steps=[step("You drew a box. Where is it?", ["add a"]),
                                                        step("Look at it.", ["glow a"], 'Ask("Is it 160?", ["yes", "no"])'),
                                                        step("Now turn it.", ["set a rotate 4"])])))


N6 = NULLS
BENCH = {   # the vizbench cases (brain vizbench/cases.json): problem, hidden answers, the wrong pick, the scene
    "roll": ("A solid sphere (I = 2/5 MR²) starts from rest against a spring (constant k) compressed a distance x. Released, it rolls without "
             "slipping up an incline of angle θ. Find the distance d it has traveled along the ramp when its speed is v.", [], "M v²", f"""root = View([st])
st = Steps(sc, [p1, p2, p3, p4])
sc = Scene([ramp, ball, sp, en, vv], [Us, f, Usp, Ug, K, Kt, Kr], ["on ball ramp.hyp 0.2", "attach sp.end ball.left"], "A ball on a ramp, pushed by a spring.")
ramp = Shape("ramp", "triangle", "base=8 height=3 apex=1", "0,0")
ball = Shape("ball", "circle", "r=0.4", null, null, "ball")
sp = Link("sp", "spring", "ramp.corner0", "1,0.4", "k")
en = Bars("en", ["spring: Usp", "move: Kt", "spin: Kr", "height: Ug"], "Us", true)
vv = Link("vv", "vector", "ball.center", "+1,0.4", "v")
Us = Q("Us", "given", 10)
f = Q("f", "given", 0)
Usp = Q("Usp", "derived", null, null, "Us*(1-f)")
Ug = Q("Ug", "derived", null, null, "Us*f/2")
K = Q("K", "derived", null, null, "Us-Usp-Ug")
Kt = Q("Kt", "derived", null, null, "K*5/7")
Kr = Q("Kr", "derived", null, null, "K*2/7")
p1 = Step("You counted only the moving energy. Look at the spring."{N6}, ["add ramp ball sp en", "glow sp"])
p2 = Step("When the ball leaves the spring, is it spinning?"{N6}, ["glow ball"], Ask("Is it spinning?", ["yes", "no"]))
p3 = Step("Release it and watch the spring bar drain."{N6}, ["param f 1", "glow en"])
p4 = Step("Draw its speed v. The spin bar is the part you left out."{N6}, ["add vv", "glow en"])"""),
    "junction": ("A copper rod A (k=397) and an aluminum rod B (k=238 W/(m·°C)) of equal cross-section are joined end to end; rod B is twice as "
                 "long as rod A. The free end of copper is held at 90.0 °C and the free end of aluminum at 30.0 °C. Find the steady-state "
                 "junction temperature (in °C).", [76.16, 76.2, 76], "The student typed 60 °C.", f"""root = View([st])
st = Steps(sc, [p1, p2, p3, p4])
sc = Scene([cu, al, dA, ax], [kcu, kal, Th, Tc, Tj], ["stack cu al x", "set al.w 2*cu.w"], "Two rods joined end to end, hot on the left.")
cu = Shape("cu", "rect", "w=1 h=0.5", "0,0", "copper")
al = Shape("al", "rect", "w=1 h=0.5", null, "aluminum")
dA = Link("dA", "dimension", "al.corner0", "al.corner1", "twice as long", null, "offset=-0.4")
ax = Axes("ax", "0,3 x", "30,90 T", ["T line 0,Th;1,Tj;3,Tc", "g marker y 60 your 60"])
kcu = Q("kcu", "given", 397)
kal = Q("kal", "given", 238)
Th = Q("Th", "given", 90)
Tc = Q("Tc", "given", 30)
Tj = Q("Tj", "answer", null, "°C", "(kcu*Th+kal/2*Tc)/(kcu+kal/2)", "T_j")
p1 = Step("You took the plain average. Look at the two rods."{N6}, ["add cu al", "glow cu al"])
p2 = Step("Which rod lets heat through more easily?"{N6}, ["glow cu"], Ask("Which rod?", ["copper", "aluminum"]))
p3 = Step("Count the aluminum length: it is twice the copper."{N6}, ["add dA", "glow dA"])
p4 = Step("Now see the drop: most of it is in the aluminum."{N6}, ["add ax", "glow T"])"""),
    "cg": ("Four point masses sit at the corners of a rectangle 2a wide (along x) and 2b tall (along y), a=5.0 m, b=10 m: m1=1.0 kg top-left, "
           "m2=2.0 kg top-right, m3=3.0 kg bottom-left, m4=4.0 kg bottom-right. Origin at the centre, x right, y up. Find the centre of "
           "gravity (x_cg, y_cg) in m.", [1.0, -4.0], "The student picked (1.0, 4.0).", f"""root = View([st])
st = Steps(sc, [p1, p2, p3, p4])
sc = Scene([box, w1, w2, w3, w4, cg, gx], [a, b, m1, m2, m3, m4, M, xcg, ycg], null, "A rectangle with a mass at each corner.")
box = Shape("box", "rect", "w=2*a h=2*b", "-a,-b")
w1 = Shape("w1", "point", "", "box.corner3", "{{m1}} kg")
w2 = Shape("w2", "point", "", "box.corner2", "{{m2}} kg")
w3 = Shape("w3", "point", "", "box.corner0", "{{m3}} kg")
w4 = Shape("w4", "point", "", "box.corner1", "{{m4}} kg")
cg = Shape("cg", "point", "", "xcg,ycg", "CG")
gx = Shape("gx", "line", "from=0,-b to=0,b", null, null, null, "guide")
a = Q("a", "given", 5)
b = Q("b", "given", 10)
m1 = Q("m1", "given", 1)
m2 = Q("m2", "given", 2)
m3 = Q("m3", "given", 3)
m4 = Q("m4", "given", 4)
M = Q("M", "derived", null, "kg", "m1+m2+m3+m4")
xcg = Q("xcg", "answer", null, "m", "(-m1*a+m2*a-m3*a+m4*a)/M", "x_cg")
ycg = Q("ycg", "answer", null, "m", "(m1*b+m2*b-m3*b-m4*b)/M", "y_cg")
p1 = Step("You picked a CG above the centre. Look where the heavy masses sit."{N6}, ["add box w1 w2 w3 w4", "glow w3 w4"])
p2 = Step("Which row is heavier, top or bottom?"{N6}, ["glow w3 w4"], Ask("Which row?", ["top", "bottom"]))
p3 = Step("Watch the CG land toward the heavy bottom row."{N6}, ["add cg", "glow cg"])
p4 = Step("Now check x the same way: compare the two columns."{N6}, ["add gx", "glow w2 w4"])"""),
    "loop": ("What does this Python print?\nn = 5\ns = 0\nfor i in range(1, n):\n    s += i\nprint(s)", [10], "The student typed 15.",
             f"""root = View([st])
st = Steps(sc, [p1, p2, p3, p4])
sc = Scene([cd, tr], null, null, "The loop, one line at a time.")
cd = Code("cd", "python", ["n = 5", "s = 0", "for i in range(1, n):", "    s += i", "print(s)"])
tr = Trace("tr", "cd", "i s")
p1 = Step("You typed 15. Run the loop with me, one line at a time."{N6}, ["add cd tr"])
p2 = Step("Which values does range(1, n) give i?"{N6}, ["set tr tick 2"], Ask("Which values?", ["1 to 4", "1 to 5"]))
p3 = Step("Watch i stop at 4: range never reaches n."{N6}, ["set tr tick 9"])
p4 = Step("Add the last i and read s yourself."{N6}, ["set tr tick 10"])"""),
}


class BenchCases(unittest.TestCase):
    """the five vizbench cases (rod, roll, junction, cg, loop) are expressible in the contract and pass the gate before a solve"""

    def test_rod(self):
        ctx = livefig.context("rod", QUESTION, "", [160.0], more="The student typed 80 N.")
        self.assertEqual(views_gate.gate(ROD, ctx, "wrong"), (ROD, ["ok"]))

    def test_the_other_four(self):
        for case, (question, answers, wrong, src) in BENCH.items():
            ctx = livefig.context(case, question, "", answers, more=wrong)
            self.assertEqual(views_gate.scene_errors(src, ctx, "wrong"), [], case)
            for stage in ("wrong", "post"):
                prog, log = views_gate.gate(src, ctx, stage)
                self.assertEqual(log, ["ok"], (case, stage))

    def test_loop_hides_the_printed_value_until_the_solve(self):
        question, answers, wrong, src = BENCH["loop"]
        ctx = livefig.context("loop", question, "", answers, more=wrong)
        ticks = lambda prog: json.loads(re.search(r'Trace\("tr", "cd", "i s", (\[.*\])\)', prog).group(1))  # noqa: E731
        self.assertEqual(ticks(views_gate.gate(src, ctx, "wrong")[0])[10], "L4 i=4 s=?")
        self.assertEqual(ticks(views_gate.gate(src, ctx, "post")[0])[10], "L4 i=4 s=10")


class Repair(unittest.TestCase):
    BAD = ROD.replace('"add dT", "glow dT"', '"add dT dW", "glow dT"')

    def test_good_needs_no_repair(self):
        calls = []
        prog, log = views_gate.repair(ROD, CTX, lambda body, errs: calls.append(errs) or body)
        self.assertEqual((prog, log, calls), (ROD, ["ok"], []))

    def test_one_round_fixes_it(self):
        calls = []
        prog, log = views_gate.repair(self.BAD, CTX, lambda body, errs: calls.append(errs) or ROD)
        self.assertEqual(len(calls), 1)
        self.assertTrue(any("one-change" in e for e in calls[0]))
        self.assertEqual(prog, ROD)
        self.assertEqual(log[-1], "repaired")

    def test_second_failure_is_text_only(self):
        calls = []
        prog, log = views_gate.repair(self.BAD, CTX, lambda body, errs: calls.append(errs) or body)
        self.assertEqual(len(calls), 1)
        self.assertIsNone(prog)
        self.assertEqual(log[-1], "scene-text-only")

    def test_error_list_is_capped(self):
        objs = [f'Shape("{i}x", "point", "", "1,1")' for i in range(12)]
        seen = []
        views_gate.repair(build(objs), CTX, lambda body, errs: seen.append(errs) or body)
        self.assertEqual(len(seen[0]), 10)
        self.assertTrue(all(re.match(r"^[^:]+: [a-z:-]+: ", e) for e in seen[0]), seen[0])

    def test_fence_takes_the_scene(self):
        f = views_gate.Fence(CTX)
        out = f.feed("Look:\n```openui\n" + ROD + "\n```\nThen solve.") + f.end()
        self.assertIn("```openui\n" + ROD + "\n```", out)
        self.assertEqual(f.log, ["oui:ok"])


if __name__ == "__main__":
    unittest.main()
