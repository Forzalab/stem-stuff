"""texPlain (nav.js, todo 108) against the grader: every plain bank expression (no relation, no text, one line) that the copy turns
into ASCII must parse in serve.py to_python + sympy, exactly as /check reads a typed answer. Node converts (tests/texplain.test.mjs
holds the table and the no-throw sweep); this side checks the grammar. Prints converted / parsed / skipped counts."""
import json
import os
import re
import subprocess
import sys
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
import serve  # noqa: E402
from sympy.parsing.sympy_parser import parse_expr, auto_number  # noqa: E402

JS = r"""
import { texPlain } from %s;
import { readFileSync, readdirSync } from "node:fs";
const out = [], root = %s;
const walk = (o, k) => {                                   // the same cut as tests/texplain.test.mjs bankTex (and app.js md)
  if (typeof o === "string") {
    if (k === "tex") { out.push(o); return; }
    for (const m of o.replace(/\\\$/g, "").matchAll(/\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g)) out.push(m[1] ?? m[2]);
  } else if (Array.isArray(o)) { if (o.every(x => typeof x === "string")) walk(o.join("\n"), k); else o.forEach(x => walk(x, k)); }
  else if (o && typeof o === "object") for (const [kk, v] of Object.entries(o)) walk(v, kk);
};
for (const f of [...readdirSync(root + "/banks").filter(f => f.endsWith(".json")).map(f => root + "/banks/" + f), root + "/problems.json"])
  walk(JSON.parse(readFileSync(f, "utf8")));
process.stdout.write(JSON.stringify(out.map(t => [t, texPlain(t)])));
"""
# not an expression the answer box takes: a relation, words, a row break, logic / sets, a list, a vector or a prefix (lim, int, d/dx)
SKIP = [("relation", re.compile(r"=|<|>|\\(le|ge|ne|neq|leq|geq|approx|equiv|sim|to|in|notin|subset|subseteq|Rightarrow|iff|implies)\b")),
        ("text", re.compile(r"\\(text|mathrm|operatorname|mathbb)")),
        ("rows", re.compile(r"\\\\|\\begin")),
        ("logic/sets", re.compile(r"\\(neg|lnot|wedge|land|vee|lor|oplus|cap|cup|setminus|Box|Diamond|therefore|forall|exists|emptyset)\b")),
        ("list", re.compile(r",|;|\\(ldots|cdots|dots)")),
        ("vector/accent", re.compile(r"\\(vec|hat|bar|overline|dot|ddot)\b")),
        ("prefix", re.compile(r"\\(lim|int|sum|prod|frac\{d\})")),
        ("mod/binom", re.compile(r"\\(pmod|bmod|binom)")),
        ("other", re.compile(r"[!%']|\\Delta")),
        ("operator fragment", re.compile(r"^\s*\\(times|cdot|div)|^\s*[-+*/^=]\s*$")),   # "$\times 2$" in a sentence: half an expression
        ("digit string", re.compile(r"^0\d"))]                                            # "$01$": a bit string, not a number


def grammar(plain):
    """the /check path: to_python, then sympy's parse (every name not the grader's own is a variable)"""
    names = set(re.findall(r"[a-z_][a-z0-9_]*", plain.lower())) - set(serve.NAMES)
    text = serve.to_python(plain, tuple(sorted(names)) or ("x",))
    loc = dict(serve.NAMES, **{n: serve.S.Symbol(n) for n in names})
    parse_expr(text, local_dict=loc, global_dict=serve.GLOBALS, transformations=(auto_number,), evaluate=False)


class TexPlainGrammar(unittest.TestCase):
    def test_bank_expressions_parse_in_to_python(self):
        url = lambda p: json.dumps("file://" + os.path.join(ROOT, p))  # noqa: E731
        out = subprocess.run(["node", "--input-type=module", "-e", JS % (url("nav.js"), json.dumps(ROOT))],
                             check=True, capture_output=True, text=True, cwd=os.path.join(ROOT, "tests")).stdout
        pairs = json.loads(out)
        skipped, parsed, sides_ok, bad = {}, 0, 0, []
        for tex, plain in pairs:
            why = next((n for n, r in SKIP if r.search(tex)), None)
            if why is None and not plain.strip():
                why = "empty"
            if why:
                skipped[why] = skipped.get(why, 0) + 1
                continue
            try:
                grammar(plain)
                parsed += 1
            except Exception as e:  # noqa: BLE001  (any failure is a finding, named below)
                bad.append(f"{tex!r} -> {plain!r}: {type(e).__name__} {e}")
        for tex, plain in pairs:                                 # an equation: each side of its one " = " is an expression too
            sides = plain.split(" = ")
            if len(sides) == 2 and not any(r.search(tex) for n, r in SKIP if n not in ("relation", "list")) and not re.search(r"[<>!,;\n]|->", plain):
                try:
                    for x in sides:
                        grammar(x)
                    sides_ok += 1
                except Exception as e:  # noqa: BLE001
                    bad.append(f"{tex!r} -> {plain!r} (a side): {type(e).__name__} {e}")
        print(f"\ntexPlain bank sweep: converted {len(pairs)}, parsed by to_python {parsed} (+ {sides_ok} equations, both sides), skipped {sum(skipped.values())} {skipped}", file=sys.stderr)
        self.assertGreater(parsed, 20)
        self.assertEqual(bad, [], "\n".join(bad))


if __name__ == "__main__":
    unittest.main()
