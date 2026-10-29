// The five vizbench scene cases (rod roll junction cg loop) as the gate sends them: the contract's worked example (rod) and V-A's
// BENCH programs (tests/test_views_scene.py), each run through views_gate.gate() for its own problem, per stage. One source: the
// Python fixtures; nothing copied here. cases() -> { rod: { wrong: program, post: program, question, answers }, ... }
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PY = `import json, sys
sys.path.insert(0, ".")
import livefig, views_gate
from tests import test_views_scene as t
srcs = {"rod": (t.QUESTION, [160.0], "The student typed 80 N.", t.ROD), **t.BENCH}
out = {}
for k, (q, a, w, s) in srcs.items():
    ctx = livefig.context(k, q, "", a, more=w)
    got = {st: views_gate.gate(s, ctx, st) for st in ("pre", "wrong", "post")}
    out[k] = {"question": q, "answers": a, "source": s, **{st: g[0] for st, g in got.items()}, "log": {st: g[1] for st, g in got.items()}}
print(json.dumps(out))
`;
let memo = null;
export function cases() {
  if (!memo) memo = JSON.parse(execFileSync("python3", ["-c", PY], { cwd: ROOT, encoding: "utf8" }));
  return memo;
}
export const NAMES = ["rod", "roll", "junction", "cg", "loop"];
