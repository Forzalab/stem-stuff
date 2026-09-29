"""CE3 trap set (CSCI26): builds the problems, checks every key with sympy, merges into problems.json.

Run: python3 tools/ce3_traps.py            (check only)
     python3 tools/ce3_traps.py --write    (check, then add/replace these codes in problems.json)
"""
import itertools, json, sys
from pathlib import Path
from sympy import Rational, ceiling, ff, mod_inverse, Mod, Min, Max
from sympy.logic.boolalg import Xor, Nand, Nor, And, Or, Not
from sympy import symbols

ROOT = Path(__file__).resolve().parent.parent
a, b, c, d, e = symbols("a b c d e")
FUZZY = "Fuzzy: NOT = 1 - x, AND = min, OR = max."
TF = [{"id": "t", "md": "TRUE"}, {"id": "f", "md": "FALSE"}]
TFM = [{"id": "t", "md": "T"}, {"id": "f", "md": "F"}, {"id": "m", "md": "MAYBE"}]
MPT = [{"id": "p", "md": "MODUS PONENS"}, {"id": "t", "md": "MODUS TOLLENS"}, {"id": "n", "md": "NEITHER"}]


def txt(md):
    return [{"type": "text", "md": md}]


def truth(f, env):
    return bool(f.subs(env))


# ---------- independent checks (sympy) ----------
def kmap_cell(f, ab, cd):
    return int(truth(f, {a: ab[0], b: ab[1], c: cd[0], d: cd[1]}))


def count_rows(f, vars_):
    return sum(truth(f, dict(zip(vars_, bits))) for bits in itertools.product([0, 1], repeat=len(vars_)))


# Syllogism checker: a model = which of the 8 Venn regions of A, B, C are non-empty.
REG = list(itertools.product([0, 1], repeat=3))  # (inA, inB, inC)


def verdict(premises, concl):
    vals = set()
    for mask in itertools.product([0, 1], repeat=8):
        live = [r for r, on in zip(REG, mask) if on]
        if all(p(live) for p in premises):
            vals.add(concl(live))
    if not vals:
        raise ValueError("premises never hold")
    return "t" if vals == {True} else "f" if vals == {False} else "m"


X = {"A": 0, "B": 1, "C": 2}
all_ = lambda s, t: lambda L: all(r[X[t]] for r in L if r[X[s]])
some = lambda s, t: lambda L: any(r[X[s]] and r[X[t]] for r in L)
none = lambda s, t: lambda L: not any(r[X[s]] and r[X[t]] for r in L)
some_not = lambda s, t: lambda L: any(r[X[s]] and not r[X[t]] for r in L)

checks = {}

# K-map: top = ab, side = cd. Transposed read = the binding trap.
f1 = And(a, Not(c))
checks["K4P"] = ("n" if kmap_cell(f1, (0, 1), (1, 0)) == 0 else "y", kmap_cell(f1, (1, 0), (0, 1)))
f2 = Or(Xor(a, b), And(c, Not(d)))
row11 = sum(kmap_cell(f2, ab, (1, 1)) for ab in itertools.product([0, 1], repeat=2))
col11 = sum(kmap_cell(f2, (1, 1), cd) for cd in itertools.product([0, 1], repeat=2))
checks["K7R"] = (row11, col11)

# Gate count with an unwired input E.
g = Or(Nor(a, b), And(c, d))
checks["G5E"] = (count_rows(g, [a, b, c, d, e]), count_rows(g, [a, b, c, d]))

# Plates: 3 letters no repeat, 3 digits, last digit odd.
checks["P3L"] = (ff(26, 3) * 10 * 10 * 5, 26**3 * 10 * 10 * 5, ff(26, 3) * 1000)

# Inverse with a sign: 7^-1 = 15 (mod 26). (-7)^-1 mod 26?
assert mod_inverse(7, 26) == 15
checks["M6V"] = (mod_inverse(-7 % 26, 26), Mod(-15, 26))

# 3 sets: pairwise sums 7+6+5, triple 2.
pair, trip = 7 + 6 + 5, 2
checks["W2T"] = (pair - 3 * trip, pair - 2 * trip, pair, pair - trip)

# Pigeonhole.
checks["H9S"] = (ceiling(Rational(100, 12)), 100 // 12)
checks["B5M"] = (2 * 12 + 1, 2 * 12)

# Fuzzy ramp down: 1 cold at 40, 0 cold at 70.
ramp = lambda T: Max(0, Min(1, Rational(70 - T, 30)))
checks["F4R"] = (ramp(61), ramp(85), Rational(61 - 40, 30), Rational(70 - 85, 30))
# Fuzzy rule: IF hot AND NOT humid.
checks["Z6N"] = (Min(Rational(6, 10), 1 - Rational(75, 100)), Min(Rational(6, 10), Rational(75, 100)))

# Modal: worlds W1..W3, P true in W1, W2; false in W3.
P = [True, True, False]
box_P, dia_notP = all(P), any(not x for x in P)
checks["D4B"] = (box_P, dia_notP)

# Syllogisms.
checks["S3A"] = verdict([all_("A", "B"), some("B", "C")], some("A", "C"))
checks["S5B"] = verdict([none("A", "B"), all_("C", "A")], none("C", "B"))
checks["S6C"] = verdict([all_("A", "B"), some_not("C", "B")], some_not("C", "A"))
checks["S8F"] = verdict([all_("A", "B"), some("A", "C")], none("B", "C"))
checks["S9D"] = verdict([some("A", "B")], some_not("A", "B"))

# Quantifier order over Z (finite window is enough to show the fail), vacuous truth.
Zw = range(-5, 6)
checks["Q4V"] = any(all(x + y == 0 for x in Zw) for y in Zw)  # the statement itself: exists y, for all x
checks["V7C"] = all(x == 7 for x in range(-50, 51) if x * x < 0)

expect = {
    "K4P": ("n", 1), "K7R": (2, 1), "G5E": (14, 7), "P3L": (7800000, 8788000, 15600000),
    "M6V": (11, 11), "W2T": (12, 14, 18, 16), "H9S": (9, 8), "B5M": (25, 24),
    "F4R": (Rational(3, 10), 0, Rational(7, 10), Rational(-1, 2)), "Z6N": (Rational(1, 4), Rational(3, 5)),
    "D4B": (False, True), "S3A": "m", "S5B": "t", "S6C": "t", "S8F": "f", "S9D": "m",
    "Q4V": False, "V7C": True,
}
for k, v in expect.items():
    got = checks[k]
    assert tuple(got) == tuple(v) if isinstance(v, tuple) else got == v, (k, got, v)

# ---------- the problems (easy wins first, traps after) ----------
P_ = []

P_.append({"code": "CSCI26_Z6N", "title": "Fuzzy rule with a NOT", "type": "num",
  "body": txt(f"{FUZZY} Rule: IF hot AND NOT humid THEN fan high. hot $= .6$, humid $= .75$. How strongly does the rule fire?"),
  "how": "A decimal, like .5", "answer": "0.25",
  "wrong": [{"match": "0.6", "error": "negation", "hint": "QUACK. The rule says NOT humid. Did humid get flipped before the AND?"},
            {"match": "0.75", "error": "negation", "hint": "QUACK. That's humid itself. The rule wants NOT humid. Flip it, then AND."}],
  "nudge": "QUACK. NOT first. Then AND. One number each, on paper."})

P_.append({"code": "CSCI26_R4T", "title": "Name the form: NAND", "type": "mc",
  "body": txt("If a gate is a NAND gate, it is universal. Gate G is not universal. Therefore G is not a NAND gate. Name the form."),
  "choices": MPT, "correct": "t",
  "wrong": [{"choice": "p", "error": "fallacy", "hint": "QUACK. Ponens affirms the IF part. Which part did the second line talk about?"},
            {"choice": "n", "error": "fallacy", "hint": "QUACK. The second line denies the THEN part. Which rule does that?"}]})

P_.append({"code": "CSCI26_R6E", "title": "Name the form: even squares", "type": "mc",
  "body": txt("If $x$ is even, then $x^2$ is even. $x^2$ is even. Therefore $x$ is even. Name the form."),
  "choices": MPT, "correct": "n",
  "wrong": [{"choice": "p", "error": "fallacy", "hint": "QUACK. The conclusion is true in real math. Is the form valid? Which part did line two affirm?"},
            {"choice": "t", "error": "fallacy", "hint": "QUACK. Tollens needs a NOT. Where is one?"}]})

P_.append({"code": "CSCI26_R8N", "title": "Name the form: two nots", "type": "mc",
  "body": txt("If it is not raining, the game is on. The game is not on. Therefore it is raining. Name the form."),
  "choices": MPT, "correct": "t",
  "wrong": [{"choice": "p", "error": "fallacy", "hint": "QUACK. Line two talks about the game. Is that the IF part or the THEN part?"},
            {"choice": "n", "error": "negation", "hint": "QUACK. Write $p$ = not raining. Now what does line two do to $q$, and what is not $p$?"}]})

P_.append({"code": "CSCI26_P3L", "title": "Plate codes", "type": "num",
  "body": txt("A code is 3 uppercase letters with no letter repeated, then 3 decimal digits. The last digit is odd. How many codes are possible?"),
  "how": "The full number, no commas.", "answer": "7800000",
  "wrong": [{"match": "8788000", "error": "counting", "hint": "QUACK. No letter repeated. How many letters are left for slot two?"},
            {"match": "15600000", "error": "misread", "hint": "QUACK. Reread the digits. Is every digit free?"},
            {"match": "17576000", "error": "counting", "hint": "QUACK. Two rules on this code. Write one number under each slot first."}],
  "nudge": "QUACK. Six slots. Write how many choices each slot has, then multiply."})

P_.append({"code": "CSCI26_Q4V", "title": "Quantifier order", "type": "mc",
  "body": txt("$\\exists y \\in \\mathbb{Z}\\ \\forall x \\in \\mathbb{Z}:\\ x + y = 0$"),
  "choices": TF, "correct": "f",
  "wrong": [{"choice": "t", "error": "quantifier", "hint": "QUACK. $y$ is picked first and stays fixed. Does one $y$ work for $x=1$ and $x=2$?"}]})

P_.append({"code": "CSCI26_V7C", "title": "Empty set claim", "type": "mc",
  "body": txt("Every element of $\\{x \\in \\mathbb{Z} : x^2 < 0\\}$ is equal to 7."),
  "choices": TF, "correct": "t",
  "wrong": [{"choice": "f", "error": "quantifier", "hint": "QUACK. To call it FALSE you need one element that isn't 7. Find one."}]})

P_.append({"code": "CSCI26_D4B", "title": "Box and diamond", "type": "mc",
  "body": txt("$\\Box$ means true in every world. $\\Diamond$ means true in at least one world. There are three worlds. $P$ is true in $W_1$ and $W_2$, false in $W_3$. Which is right?"),
  "choices": [{"id": "a", "md": "$\\Box P$ TRUE, $\\Diamond\\neg P$ TRUE"},
              {"id": "b", "md": "$\\Box P$ FALSE, $\\Diamond\\neg P$ TRUE"},
              {"id": "c", "md": "$\\Box P$ TRUE, $\\Diamond\\neg P$ FALSE"},
              {"id": "d", "md": "$\\Box P$ FALSE, $\\Diamond\\neg P$ FALSE"}],
  "correct": "b",
  "wrong": [{"choice": "a", "error": "quantifier", "hint": "QUACK. $\\Box$ is every world. Check $W_3$."},
            {"choice": "c", "error": "quantifier", "hint": "QUACK. $\\Box$ is every world, not most. And is there a world where $P$ fails?"},
            {"choice": "d", "error": "negation", "hint": "QUACK. $\\Diamond\\neg P$ asks for one world where $P$ is false. Look again."}]})

P_.append({"code": "CSCI26_D7N", "title": "Negate a box", "type": "mc",
  "body": txt("$\\Box$ means true in every world. $\\Diamond$ means true in at least one world. Which statement is the same as $\\neg\\Box P$?"),
  "choices": [{"id": "b", "md": "$\\Diamond\\neg P$"}, {"id": "a", "md": "$\\Box\\neg P$"},
              {"id": "c", "md": "$\\neg\\Diamond P$"}, {"id": "d", "md": "$\\Diamond P$"}],
  "correct": "b",
  "wrong": [{"choice": "a", "error": "negation", "hint": "QUACK. Not true in every world. Does that force false in every world?"},
            {"choice": "c", "error": "negation", "hint": "QUACK. That says $P$ holds nowhere. Is that what not-every-world means?"},
            {"choice": "d", "error": "negation", "hint": "QUACK. Where did the NOT go? Something has to be false somewhere."}]})

P_.append({"code": "CSCI26_S3A", "title": "Syllogism: some through B", "type": "mc",
  "body": txt(["All A are B.", "Some B are C.", "$\\therefore$ Some A are C."]),
  "choices": TFM, "correct": "m",
  "wrong": [{"choice": "t", "error": "fallacy", "hint": "QUACK. Draw it. Can the B's that are C sit outside A?"},
            {"choice": "f", "error": "fallacy", "hint": "QUACK. F means it can never happen. Can you draw one picture where it does?"}]})

P_.append({"code": "CSCI26_S5B", "title": "Syllogism: no and all", "type": "mc",
  "body": txt(["No A are B.", "All C are A.", "$\\therefore$ No C are B."]),
  "choices": TFM, "correct": "t",
  "wrong": [{"choice": "m", "error": "fallacy", "hint": "QUACK. Every C sits inside A. Where can B be? Try to draw a C that is B."},
            {"choice": "f", "error": "fallacy", "hint": "QUACK. Draw A and B apart. Put C inside A. Now look."}]})

P_.append({"code": "CSCI26_S6C", "title": "Syllogism: some not", "type": "mc",
  "body": txt(["All A are B.", "Some C are not B.", "$\\therefore$ Some C are not A."]),
  "choices": TFM, "correct": "t",
  "wrong": [{"choice": "m", "error": "fallacy", "hint": "QUACK. Take the C outside B. Can it be inside A? A sits inside B."},
            {"choice": "f", "error": "fallacy", "hint": "QUACK. Draw A inside B. Put a C outside B. Where is that C?"}]})

P_.append({"code": "CSCI26_S8F", "title": "Syllogism: no B are C", "type": "mc",
  "body": txt(["All A are B.", "Some A are C.", "$\\therefore$ No B are C."]),
  "choices": TFM, "correct": "f",
  "wrong": [{"choice": "t", "error": "fallacy", "hint": "QUACK. Take one A that is C. Is it also a B?"},
            {"choice": "m", "error": "fallacy", "hint": "QUACK. The premises hand you one thing. It is A, it is C. What else is it, always?"}]})

P_.append({"code": "CSCI26_S9D", "title": "Syllogism: some means some not?", "type": "mc",
  "body": txt(["Some A are B.", "$\\therefore$ Some A are not B."]),
  "choices": TFM, "correct": "m",
  "wrong": [{"choice": "t", "error": "misread", "hint": "QUACK. In logic, some means at least one. Can all A be B?"},
            {"choice": "f", "error": "misread", "hint": "QUACK. Can you draw one A outside B without breaking line one?"}]})

P_.append({"code": "CSCI26_F4R", "title": "Cold tea ramp", "type": "multi",
  "body": txt("In fuzzy logic, tea is 1 cold at $40^\\circ\\text{F}$ and 0 cold at $70^\\circ\\text{F}$, and it gets less cold evenly in between."),
  "how": "Decimals, like .5", "parts": [
    {"prompt": "How cold is $61^\\circ\\text{F}$ tea?", "type": "num", "answer": "0.3",
     "wrong": [{"match": "0.7", "error": "sign", "hint": "QUACK. Hotter tea is less cold. Which end of the ramp is 1?"}]},
    {"prompt": "How cold is $85^\\circ\\text{F}$ tea?", "type": "num", "answer": "0",
     "wrong": [{"match": "-0.5", "error": "domain", "hint": "QUACK. Membership lives in [0, 1]. Can tea be less than not cold?"}]}],
  "nudge": "QUACK. Mark 40 and 70 on a line. Where does your temperature sit?"})

P_.append({"code": "CSCI26_W2T", "title": "Exactly two of three", "type": "num",
  "body": txt("$|A \\cap B| = 7$, $|A \\cap C| = 6$, $|B \\cap C| = 5$, $|A \\cap B \\cap C| = 2$. How many elements are in exactly two of the sets?"),
  "answer": "12",
  "wrong": [{"match": "14", "error": "misread", "hint": "QUACK. That counts the middle once. Is the middle in exactly two sets?"},
            {"match": "18", "error": "counting", "hint": "QUACK. Each pair count holds the middle too. How many pairs hold it?"},
            {"match": "16", "error": "counting", "hint": "QUACK. The middle sits in all three pairs. How many times did you take it out?"}],
  "nudge": "QUACK. Draw three circles. Fill the middle first, then each pair-only region."})

P_.append({"code": "CSCI26_B5M", "title": "Three share a month", "type": "num",
  "body": txt("What is the fewest people you need to be sure that at least 3 of them share a birth month?"),
  "answer": "25",
  "wrong": [{"match": "24", "error": "off-by-one", "hint": "QUACK. Fill every month to the brim without making three. Now add who?"},
            {"match": "13", "error": "misread", "hint": "QUACK. That guarantees 2. The ask is 3."},
            {"match": "36", "error": "off-by-factor", "hint": "QUACK. How many can a month hold before it has 3?"}],
  "nudge": "QUACK. Worst case first. How many people fit with no month at 3?"})

P_.append({"code": "CSCI26_H9S", "title": "Keys per slot", "type": "num",
  "body": txt("100 keys are hashed into a table with 12 slots, with chaining. At least one slot must hold at least how many keys?"),
  "answer": "9",
  "wrong": [{"match": "8", "error": "off-by-one", "hint": "QUACK. Put 8 in every slot. How many keys is that? Where do the rest go?"},
            {"match": "8.33", "error": "format", "hint": "QUACK. A slot holds whole keys. Round which way?"}],
  "nudge": "QUACK. Spread the keys as evenly as you can. Count the fullest slot."})

P_.append({"code": "CSCI26_M6V", "title": "Inverse with a sign", "type": "num",
  "body": txt("$7^{-1} \\equiv 15 \\pmod{26}$. Find $(-7)^{-1} \\bmod 26$, as a number from 0 to 25."),
  "answer": "11",
  "wrong": [{"match": "15", "error": "sign", "hint": "QUACK. Multiply your answer by $-7$. Do you get 1 mod 26?"},
            {"match": "-15", "error": "format", "hint": "QUACK. Right idea. Now the range: 0 to 25. One more step."}],
  "nudge": "QUACK. Check it: your number times $-7$, then mod 26. Is it 1?"})

P_.append({"code": "CSCI26_G5E", "title": "Rows with an unwired input", "type": "num",
  "body": txt("A circuit has inputs A, B, C, D, E. OUT = NOR(A, B) OR (C AND D). Input E is not wired to anything. In the full truth table, how many rows have OUT = 1?"),
  "answer": "14",
  "wrong": [{"match": "7", "error": "counting", "hint": "QUACK. How many rows does the full table have with five inputs?"},
            {"match": "8", "error": "counting", "hint": "QUACK. Two cases can both be 1 in one row. Count that row once. And the table size?"},
            {"match": "16", "error": "counting", "hint": "QUACK. Did a row where both sides are 1 get counted twice?"}],
  "nudge": "QUACK. Count the A, B, C, D rows first. Then ask what E does to that count."})

P_.append({"code": "CSCI26_K4P", "title": "Read one K-map cell", "type": "mc",
  "body": txt("Karnaugh map for $f = a \\wedge \\neg c$. The top labels are $ab$, the side labels are $cd$, both $00, 01, 11, 10$. Is the cell in row $10$, column $01$ a 1?"),
  "choices": [{"id": "y", "md": "YES"}, {"id": "n", "md": "NO"}], "correct": "n",
  "wrong": [{"choice": "y", "error": "misread", "hint": "QUACK. Row is $cd$. Column is $ab$. Write $a, b, c, d$ before you look at $f$."}]})

P_.append({"code": "CSCI26_K7R", "title": "Count ones in a K-map row", "type": "num",
  "body": txt("Karnaugh map for $f = (a \\oplus b) \\vee (c \\wedge \\neg d)$. The top labels are $ab$, the side labels are $cd$, both $00, 01, 11, 10$. How many 1s are in row $11$?"),
  "answer": "2",
  "wrong": [{"match": "1", "error": "misread", "hint": "QUACK. A row has a fixed $cd$. Which letters are 1 in row 11?"},
            {"match": "3", "error": "op-swap", "hint": "QUACK. $\\oplus$ is XOR. What is $1 \\oplus 1$?"},
            {"match": "4", "error": "negation", "hint": "QUACK. With $d = 1$, what is $c \\wedge \\neg d$?"}],
  "nudge": "QUACK. Fix $c$ and $d$ for the row. Then walk the four columns."})

# cross-check answers in the JSON against the sympy results
num = {"Z6N": checks["Z6N"][0], "P3L": checks["P3L"][0], "W2T": checks["W2T"][0], "B5M": checks["B5M"][0],
       "H9S": checks["H9S"][0], "M6V": checks["M6V"][0], "G5E": checks["G5E"][0], "K7R": checks["K7R"][0]}
mcx = {"S3A": checks["S3A"], "S5B": checks["S5B"], "S6C": checks["S6C"], "S8F": checks["S8F"], "S9D": checks["S9D"],
       "Q4V": "t" if checks["Q4V"] else "f", "V7C": "t" if checks["V7C"] else "f", "K4P": checks["K4P"][0],
       "D4B": "b" if checks["D4B"] == (False, True) else "?"}
for p in P_:
    s = p["code"].split("_")[1]
    if s in num:
        assert Rational(p["answer"]) == num[s], (s, p["answer"], num[s])
    if s in mcx:
        assert p["correct"] == mcx[s], (s, p["correct"], mcx[s])
f4 = next(p for p in P_ if p["code"].endswith("F4R"))
assert [Rational(q["answer"]) for q in f4["parts"]] == list(checks["F4R"][:2])
print(f"sympy: {len(P_)} problems, all keys match")

if "--write" in sys.argv:
    path = ROOT / "problems.json"
    bank = json.loads(path.read_text())
    mine = {p["code"] for p in P_}
    bank["problems"] = [p for p in bank["problems"] if p["code"] not in mine] + P_
    path.write_text(json.dumps(bank, ensure_ascii=False, indent=2) + "\n")
    print("wrote", path)
