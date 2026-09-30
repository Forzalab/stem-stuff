"""CE3 mock-50 (CSCI26): re-derives every key of the 50 mock-exam trap items from scratch and checks problems.json.

Run: python3 tools/ce3_mock50.py

Nothing here is copied from the builder: circuits are evaluated straight from each graph block, C++ choices are
parsed with C++ precedence (! > ^ > && > ||; `->` is flagged as not C++), counts come from math.comb/perm/factorial,
growth ratios use Fraction, and every "roughly" list must have exactly one defensible choice.
"""
import itertools, json, math, re, sys
from fractions import Fraction as F
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BANK = json.loads((ROOT / "problems.json").read_text())
BY = {p["code"]: p for p in BANK["problems"]}

C2IF = ["C2A", "C3B", "C4D", "C5E", "C6F", "C7H"]
TT = ["T2C", "T3D", "T4E"]
SIMP = ["Y2A", "Y3B", "Y4C"]
FLIP = ["F5A", "F6B", "F7C"]
SAME = ["E2Q", "E3R", "E4S"]
GATES = C2IF + TT + SIMP + FLIP + SAME
GROWTH = ["N2A", "N3B", "N4C", "N5D", "N6E", "N7F", "N8G", "N9H", "U2J", "U3K", "U4L", "U5M"]
ESTIMATE = ["N3B", "N4C", "N6E", "N7F", "N8G"]
COUNT = ["J2A", "J3B", "J4C", "J5D", "J6E", "J7F", "J8G", "J9H", "H2J", "H3K",
         "H4L", "H5M", "H6N", "H7P", "H8Q", "P4R", "P5S", "P6T", "P7U", "P8V"]
ALL = GATES + GROWTH + COUNT
fails = []


def check(cond, msg):
    if not cond:
        fails.append(msg)
    return cond


def P(s):
    return BY["CSCI26_" + s]


# ---------------------------------------------------------------- circuits
ARITY = {"not": (1, 1), "buf": (1, 1), "and": (2, 4), "or": (2, 4), "xor": (2, 4),
         "nand": (2, 4), "nor": (2, 4), "xnor": (2, 4)}


def graphs(p):
    return [b for b in p["body"] if b["type"] == "graph"]


def inames(g):
    return [i if isinstance(i, str) else i["name"] for i in g["inputs"]]


def ivalues(g):
    return {i["name"]: i["value"] for i in g["inputs"] if isinstance(i, dict) and "value" in i}


def validate_circuit(code, g, values_ok):
    check(g.get("kind") == "circuit", f"{code}: kind")
    alt = g.get("alt", "")
    check(len(alt) >= 10 and alt.count(".") <= 1, f"{code}: alt should be one sentence")
    check(len(g["gates"]) <= 6, f"{code}: more than 6 gates")
    seen = set(inames(g))
    for gt in g["gates"]:
        lo, hi = ARITY.get(gt["op"], (9, 0))
        check(lo <= len(gt["in"]) <= hi, f"{code}: {gt['id']} {gt['op']} arity {len(gt['in'])}")
        check(all(x in seen for x in gt["in"]), f"{code}: {gt['id']} reads an unknown wire")
        seen.add(gt["id"])
    check(all(o["from"] in seen for o in g["outputs"]), f"{code}: output from unknown wire")
    if not values_ok:
        check(not ivalues(g), f"{code}: input values given but the question doesn't use them")


def run(g, env):
    w = dict(env)
    for gt in g["gates"]:
        x = [w[i] for i in gt["in"]]
        op = gt["op"]
        v = {"not": lambda: not x[0], "buf": lambda: x[0], "and": lambda: all(x), "or": lambda: any(x),
             "xor": lambda: sum(x) % 2 == 1, "nand": lambda: not all(x), "nor": lambda: not any(x),
             "xnor": lambda: sum(x) % 2 == 0}[op]()
        w[gt["id"]] = bool(v)
    return w[g["outputs"][0]["from"]]


def ctree(g):
    """Literal expression tree of the drawn circuit (nand = not(and), same-op chains flattened)."""
    defs = {gt["id"]: gt for gt in g["gates"]}

    def node(wire):
        if wire not in defs:
            return ("var", wire)
        gt = defs[wire]
        kids = [node(i) for i in gt["in"]]
        op = gt["op"]
        if op == "buf":
            return kids[0]
        if op == "not":
            return ("not", kids[0])
        base = {"nand": "and", "nor": "or", "xnor": "xor"}.get(op, op)
        t = flat(base, kids)
        return ("not", t) if op in ("nand", "nor", "xnor") else t
    return node(g["outputs"][0]["from"])


def flat(op, kids):
    out = []
    for k in kids:
        out.extend(k[1] if k[0] == op else [k])
    return (op, tuple(out))


# ---------------------------------------------------------------- C++ condition parser
TOK = re.compile(r"\s*(->|&&|\|\||[!^()]|[A-Za-z_]\w*)")


def parse_if(src):
    """`if (cond)` -> (tree, is_valid_cpp). Precedence: -> (flagged) < || < && < ^ < !."""
    s = src.strip().strip("`").strip()
    m = re.fullmatch(r"if\s*\((.*)\)", s)
    assert m, src
    toks, pos = [], 0
    body = m.group(1)
    while pos < len(body):
        t = TOK.match(body, pos)
        assert t and t.group(1), f"cannot read {src!r} at {body[pos:]!r}"
        toks.append(t.group(1))
        pos = t.end()
    i = [0]
    valid = [True]

    def peek():
        return toks[i[0]] if i[0] < len(toks) else None

    def eat(x=None):
        t = toks[i[0]]
        assert x is None or t == x, (src, t, x)
        i[0] += 1
        return t

    def impl():
        l = orr()
        while peek() == "->":
            eat()
            valid[0] = False
            l = ("imp", (l, orr()))
        return l

    def chain(sub, sym, name):
        def f():
            kids = [sub()]
            while peek() == sym:
                eat()
                kids.append(sub())
            return kids[0] if len(kids) == 1 else flat(name, kids)
        return f

    def unary():
        t = peek()
        if t == "!":
            eat()
            return ("not", unary())
        if t == "(":
            eat()
            e = impl()
            eat(")")
            return e
        eat()
        if t in ("true", "false"):
            return ("const", t == "true")
        return ("var", t)

    xor = chain(unary, "^", "xor")
    andd = chain(xor, "&&", "and")
    orr = chain(andd, "||", "or")
    tree = impl()
    assert i[0] == len(toks), f"trailing tokens in {src!r}"
    return tree, valid[0]


def ev(t, env):
    k = t[0]
    if k == "var":
        return bool(env[t[1]])
    if k == "const":
        return t[1]
    if k == "not":
        return not ev(t[1], env)
    vals = [ev(c, env) for c in t[1]]
    return {"and": all, "or": any, "xor": lambda v: sum(v) % 2 == 1,
            "imp": lambda v: (not v[0]) or v[1]}[k](vals)


def vars_of(t):
    if t[0] == "var":
        return {t[1]}
    if t[0] == "const":
        return set()
    if t[0] == "not":
        return vars_of(t[1])
    return set().union(*(vars_of(c) for c in t[1]))


def envs(names):
    names = sorted(names)
    for bits in itertools.product([False, True], repeat=len(names)):
        yield dict(zip(names, bits))


def same_fn(f, g, names):
    return all(f(e) == g(e) for e in envs(names))


# ---------------------------------------------------------------- number words
SCALE = {"thousand": 10**3, "million": 10**6, "billion": 10**9, "trillion": 10**12}


def words_value(s):
    s = s.replace("roughly", "").strip()
    unit = F(1)
    for u, mult in (("hours", 1), ("hour", 1), ("days", 24), ("day", 24)):
        if s.endswith(" " + u):
            s, unit = s[: -len(u) - 1].strip(), F(mult)
            break
    toks = s.split()
    v = F(1) if toks[0] == "a" else F(toks[0])
    for t in toks[1:]:
        v *= SCALE[t]
    return v * unit


def tex_value(md):
    """'$\\dfrac{13^4}{16}$ hours' -> Fraction in hours."""
    m = re.fullmatch(r"\$(.+)\$\s+hours?", md)
    e = re.sub(r"\\dfrac\{([^}]*)\}\{([^}]*)\}", r"(\1)/(\2)", m.group(1)).replace("^", "**")
    e = re.sub(r"\d+", lambda d: f"F({d.group()})", e)
    return eval(e, {"F": F})


def one_sig_fig(v):
    v = F(v)
    while v >= 10:
        v /= 10
    while v < 1:
        v *= 10
    return v.denominator == 1


def shown_value(md):
    """The number as printed on the choice (units and framing dropped), for the 1-significant-figure rule."""
    if md == "the same":
        return F(1)
    s = re.sub(r"^Plan [AB], |roughly | times more$| (hours?|days?)$", "", md)
    return words_value(s)


def estimate_ok(code, true, vals, correct, shown):
    dist = {k: abs(math.log(float(v) / float(true))) for k, v in vals.items()}
    best = min(dist, key=dist.get)
    check(best == correct, f"{code}: nearest choice is {best}, key is {correct}")
    check(sum(1 for k in dist if dist[k] == dist[best]) == 1, f"{code}: tie for nearest")
    r = float(vals[correct] / true)
    check(abs(r - 1) <= 0.15, f"{code}: key is {r:.3f} x the true value (> 15% off)")
    for k, v in vals.items():
        if k != correct:
            rr = float(v / true)
            check(rr > 1.25 or rr < 1 / 1.25, f"{code}: distractor {k} within 1.25x of the true value ({rr:.3f})")
            check(abs(rr - 1) > 0.15, f"{code}: distractor {k} also within 15%")
    for k, md in shown.items():
        check(one_sig_fig(shown_value(md)), f"{code}: choice {k} ({md}) not rounded to 1 significant figure")


def mc_map(p):
    return {c["id"]: c["md"] for c in p["choices"]}


# ================================================================ GATES
for s in C2IF:
    p = P(s)
    g = graphs(p)[0]
    validate_circuit(s, g, False)
    lit = ctree(g)
    names = inames(g)
    fn = lambda e, g=g: run(g, e)
    literal_ids = []
    for cid, md in mc_map(p).items():
        tree, valid = parse_if(md)
        eq = same_fn(fn, lambda e, t=tree: ev(t, e), names)
        if valid and tree == lit:
            literal_ids.append(cid)
            check(eq, f"{s}: literal choice {cid} not equal to circuit (parser bug?)")
        elif valid:
            check(not eq, f"{s}: choice {cid} is valid C++ and equal to the circuit: a second right answer")
        else:
            check("->" in md, f"{s}: choice {cid} invalid for a reason other than ->")
    check(literal_ids == [p["correct"]], f"{s}: literal transcription is {literal_ids}, key {p['correct']}")
    check(len(p["choices"]) == 5, f"{s}: want 5 choices")

for s in TT:
    p = P(s)
    g = graphs(p)[0]
    validate_circuit(s, g, False)
    for part in p["parts"]:
        env = {k: v == "T" for k, v in re.findall(r"\$([A-Z])\$ = ([TF])", part["prompt"])}
        check(set(env) == set(inames(g)), f"{s}: row {part['prompt']} doesn't set every input")
        key = "T" if run(g, env) else "F"
        check(part["answer"] == key, f"{s}: row {part['prompt']} key {part['answer']}, circuit says {key}")
        check([w["match"] for w in part["wrong"]] == ["F" if key == "T" else "T"], f"{s}: wrong entry")

for s in SIMP:
    p = P(s)
    given = re.search(r"`([^`]+)`", p["body"][0]["md"]).group(1)
    gt, gv = parse_if(given)
    at, av = parse_if(p["answer"])
    names = vars_of(gt)
    check(gv and av, f"{s}: not C++")
    check(same_fn(lambda e: ev(gt, e), lambda e: ev(at, e), names), f"{s}: answer not equal to the given if")
    check(at[0] == "var", f"{s}: answer is not a single variable")
    # no single variable other than the key is equal, and no constant is
    for v in names | {"true", "false"}:
        t = ("const", v == "true") if v in ("true", "false") else ("var", v)
        if t != at:
            check(not same_fn(lambda e: ev(gt, e), lambda e, t=t: ev(t, e), names), f"{s}: {v} also works")
    for w in p["wrong"]:
        wt, _ = parse_if(w["match"])
        check(not same_fn(lambda e: ev(gt, e), lambda e, t=wt: ev(t, e), names), f"{s}: wrong {w['match']} is equal")

for s in FLIP:
    p = P(s)
    g = graphs(p)[0]
    validate_circuit(s, g, True)
    text = " ".join(b["md"] for b in p["body"] if b["type"] == "text")
    m = re.search(r"If \$([A-Z])\$ flips from (\d) to (\d)", text)
    x, a, b = m.group(1), int(m.group(2)), int(m.group(3))
    env = {k: bool(v) for k, v in ivalues(g).items()}
    check(set(env) == set(inames(g)), f"{s}: every input needs a value")
    check(env[x] == bool(a), f"{s}: drawn value of {x} disagrees with the question")
    before = run(g, env)
    after = run(g, {**env, x: bool(b)})
    check(p["correct"] == ("y" if before != after else "n"), f"{s}: key {p['correct']}")

for s in SAME:
    p = P(s)
    g1, g2 = graphs(p)
    validate_circuit(s, g1, False)
    validate_circuit(s, g2, False)
    names = set(inames(g1)) | set(inames(g2))
    eq = same_fn(lambda e: run(g1, e), lambda e: run(g2, e), names)
    check(p["correct"] == ("y" if eq else "n"), f"{s}: key {p['correct']}")
    check({o["label"] for o in g1["outputs"]} != {o["label"] for o in g2["outputs"]}, f"{s}: both outputs share a label")

# ================================================================ GROWTH
# (1) 4 dials of 26 in 1 hour; 8 dials of 13 -> hours
p = P("N2A")
true = F(13**8, 26**4)
check(true == F(13**4, 16), "N2A: algebra")
vals = {k: (tex_value(v) if "$" in v else words_value(v)) for k, v in mc_map(p).items()}
check([k for k, v in vals.items() if v == true] == [p["correct"]], "N2A: key")

# (2) 5 dials A-Z ~ 1 day; x10 settings, 26x faster -> hours
p = P("N3B")
true = F(1) * 10 / 26 * 24
estimate_ok("N3B", true, {k: words_value(v) for k, v in mc_map(p).items()}, p["correct"], mc_map(p))

# (3') Plan A = 5 dials 0-9, Plan B = 3 dials of 30. value = A/B
p = P("N4C")
A, B = 10**5, 30**3
true = F(A, B)


def plan_value(md):
    if md == "the same":
        return F(1)
    m = re.fullmatch(r"Plan ([AB]), roughly (\d+) times more", md)
    k = F(int(m.group(2)))
    return k if m.group(1) == "A" else 1 / k


estimate_ok("N4C", true, {k: plan_value(v) for k, v in mc_map(p).items()}, p["correct"], mc_map(p))

# (4) fewest keys 1-9 giving >= 1000 codes
p = P("N5D")
n = next(n for n in itertools.count(1) if 9**n >= 500 * 2)
check(mc_map(p)[p["correct"]] == str(n), f"N5D: key should be {n}")

for s, true in (("N6E", 26**4), ("N7F", 26**2), ("N8G", (26 + 10) ** 3)):
    p = P(s)
    estimate_ok(s, F(true), {k: words_value(v) for k, v in mc_map(p).items()}, p["correct"], mc_map(p))

for s, true in (("N9H", 10**6 + 10**6), ("U2J", 1000 * 1000 * 1000), ("U3K", 10**6 + 10**5), ("U5M", 10**12 // 10**6 * 24)):   # U5M: words_value reads days as hours
    p = P(s)
    vals = {k: words_value(v) for k, v in mc_map(p).items()}
    check([k for k, v in vals.items() if v == true] == [p["correct"]], f"{s}: key")

p = P("U4L")
sw, dial = 2**4, 16
want = "they have the same number" if sw == dial else ("the switches" if sw > dial else "the dial")
check(mc_map(p)[p["correct"]] == want, "U4L: key")

# ================================================================ COUNTING
C, Pm, fact = math.comb, math.perm, math.factorial


def arrangements(word):
    n = fact(len(word))
    for ch in set(word):
        n //= fact(word.count(ch))
    return n


# code -> (key, {named slips that must be the wrong matches})
NUM = {
    "J2A": (C(10, 3), {Pm(10, 3), 10**3, 10 * 3}),
    "J3B": (arrangements("TRAIN"), {5**5, 5 * 5, fact(4)}),
    "J4C": (arrangements("NOODLE"), {fact(6), fact(6) // 4, fact(5)}),
    "J5D": (arrangements("LOBBY"), {fact(5), fact(5) // 4, fact(4)}),
    "J6E": (arrangements("COFFEE"), {fact(6), fact(6) // 2, fact(6) // 8}),
    "J7F": (9 * 26**3 * 10**3, {10 * 26**3 * 10**3, 9 * Pm(26, 3) * 10**3, 9 * 26**3}),
    "J8G": (4 * 6 * 3, {4 + 6 + 3, 4 * 6, 6 * 3}),
    "J9H": (C(8, 2), {Pm(8, 2), 8**2, 8 * 2}),
    "H4L": (10**4 - 9**4, {4 * 10**3, 9**4, 4 * 9**3}),
    "H5M": (fact(6), {6 * 6, 6**6, fact(5)}),
    "H6N": (fact(4) * 2, {fact(4), fact(5), fact(5) * 2}),
    "H7P": (C(9, 3), {C(10, 4), C(10, 3), Pm(9, 3)}),
    "P4R": (2**10, {10, 2**10 - 1, 10 * 10}),
    "P5S": (C(10, 2), {10 * 9, 10 * 10, 10}),
    "P6T": (Pm(9, 4), {C(9, 4), 9**4, 9 * 4}),
    "P7U": (5**5, {fact(5), 5 * 5, 5 + 5}),
    "P8V": (2**6, {6 * 2, 6 * 6, fact(6)}),
}
MULTI = {
    "H2J": [(Pm(12, 2), {C(12, 2), 12**2}), (C(12, 2), {Pm(12, 2), 12**2})],
    "H3K": [(10**4, {Pm(10, 4), 10 * 4}), (Pm(10, 4), {10**4, C(10, 4)})],
    "H8Q": [(Pm(8, 3), {C(8, 3), 8**3}), (C(8, 3), {Pm(8, 3), 8 * 3})],
}
for s, (key, slips) in NUM.items():
    p = P(s)
    check(p["type"] == "num" and int(p["answer"]) == key, f"{s}: key {p.get('answer')} != {key}")
    got = {int(w["match"]) for w in p["wrong"]}
    check(got == slips, f"{s}: wrong matches {sorted(got)} != slips {sorted(slips)}")
    check(key not in slips, f"{s}: a slip equals the key")
for s, parts in MULTI.items():
    p = P(s)
    for part, (key, slips) in zip(p["parts"], parts, strict=True):
        check(int(part["answer"]) == key, f"{s}: part key {part['answer']} != {key}")
        check({int(w["match"]) for w in part["wrong"]} == slips, f"{s}: part slips")

# ================================================================ house rules
SUF = re.compile(r"^CSCI26_[A-HJ-NP-Z2-9]{3}$")
suffixes = [q["code"].split("_", 1)[1] for q in BANK["problems"]]
check(len(suffixes) == len(set(suffixes)), "suffix clash in problems.json")
check(len(ALL) == 50 and len(set(ALL)) == 50, "want 50 distinct codes")


def strings(o):
    if isinstance(o, str):
        yield o
    elif isinstance(o, list):
        for x in o:
            yield from strings(x)
    elif isinstance(o, dict):
        for x in o.values():
            yield from strings(x)


def hints(p):
    ws = list(p.get("wrong", [])) + [w for part in p.get("parts", []) for w in part.get("wrong", [])]
    return [w["hint"] for w in ws] + ([p["nudge"]] if "nudge" in p else [])


for s in ALL:
    p = P(s)
    code = p["code"]
    check(SUF.match(code) and not code.endswith("L3G"), f"{code}: bad code")
    check(0 < len(p.get("title", "")) <= 60, f"{code}: title")
    shown = list(strings(p["body"])) + [p["title"], p.get("how", "")] + [c["md"] for c in p.get("choices", [])] \
        + [q.get("prompt", "") for q in p.get("parts", [])] + hints(p)
    blob = " ".join(shown)
    check(not re.search(r"\b(about|approximately)\b", blob, re.I), f"{code}: use 'roughly', not about/approximately")
    if s != "N2A":   # N2A's choices must be expressions; everywhere else numbers are said in words
        check(not re.search(r"\d\s*\^|\^\s*\d|10\*\*|\be\d", blob), f"{code}: power notation in a number")
    if s in ESTIMATE:
        check("roughly" in " ".join(strings(p["body"])).lower(), f"{code}: estimate ask must say roughly")
        check(all(c["md"].startswith("roughly") or s == "N4C" for c in p["choices"]), f"{code}: choices say roughly")
    for h in hints(p):
        check(h.startswith("QUACK.") and len(h.split()) <= 25, f"{code}: hint form/length: {h}")
    if p["type"] == "mc":
        ids = [c["id"] for c in p["choices"]]
        check(len(ids) in (2, 3, 5), f"{code}: {len(ids)} choices (server shows at most 5)")
        check(sorted(w["choice"] for w in p["wrong"]) == sorted(i for i in ids if i != p["correct"]), f"{code}: wrong coverage")
        key = mc_map(p)[p["correct"]].strip("`$").lower()
        if len(key) > 3:
            for t in hints(p) + [p["title"]]:
                check(key not in t.lower(), f"{code}: key text shows in {t!r}")
    else:
        units = p["parts"] if p["type"] == "multi" else [p]
        check("nudge" in p, f"{code}: nudge")
        for u in units:
            ws = u.get("wrong", [])
            check(1 <= len(ws) <= 3 if p["type"] == "multi" else 2 <= len(ws) <= 3, f"{code}: wrong count")
            ans = u["answer"]
            if len(ans) >= 2:
                pat = re.compile(r"(?<![\w.])" + re.escape(ans.replace(" ", "")) + r"(?![\w.])", re.I)
                for t in hints(p) + [p["title"], p.get("how", "")] + [q.get("prompt", "") for q in p.get("parts", [])] \
                        + list(strings(p["body"])):
                    check(not pat.search(t.replace(" ", "")), f"{code}: answer {ans} shows in {t!r}")
    for g in graphs(p):
        check(p["title"] and all(w not in g["alt"].lower() for w in (" is true", " is false", "equivalent")), f"{code}: alt")

print(f"gates {len(GATES)}, growth {len(GROWTH)}, counting {len(COUNT)}: {len(ALL)} problems checked")
if fails:
    print("FAIL")
    for f_ in fails:
        print("  -", f_)
    sys.exit(1)
print("all keys re-derived and match problems.json; every roughly-list has exactly one defensible choice")
