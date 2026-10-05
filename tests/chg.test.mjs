// chg.mjs: what a snack changed from its original (TODO A, Oct 5). Marks the changed numbers, and the words of a short swap.
import { test } from "node:test";
import assert from "node:assert/strict";
import { changes, markNums } from "../chg.mjs";

const T = md => ({ type: "text", md });
const marks = s => [...s.matchAll(/\uE000([^\uE001]*)\uE001|\\htmlClass\{chg\}\{([^}]*)\}/g)].map(m => m[1] ?? m[2]);

test("a swapped number in math: marked on both sides, one chip pair with its unit", () => {
  const c = changes([T("A puck moves at $3.0\\ \\text{m/s}$ on ice.")], [T("A puck moves at $2.0\\ \\text{m/s}$ on ice.")]);
  assert.deepEqual(marks(c.snack[0]), ["3.0"]);
  assert.deepEqual(marks(c.orig[0]), ["2.0"]);
  assert.deepEqual(c.pairs, [{ from: "2.0", to: "3.0", unit: "m/s" }]);
  assert.ok(c.snack[0].includes("$3.0") === false && c.snack[0].includes("\\htmlClass{chg}{3.0}"), "math keeps its $..$, the mark sits inside");
});

test("prose numbers and a short word swap: marked in text; stop words and long rewrites are not", () => {
  const c = changes([T("The first puck loses half, in 4.0 seconds.")], [T("The second puck loses half, in 2.0 seconds.")]);
  assert.deepEqual(marks(c.snack[0]), ["first", "4.0"]);
  assert.deepEqual(c.pairs, [{ from: "2.0", to: "4.0", unit: "seconds" }]);
  const s = changes([T("Find the mass. The work is 60.0 J and it is done fast.")], [T("Find the mass.")]);
  assert.deepEqual(marks(s.snack[0]), ["60.0"], "an added sentence: only its numbers");
  assert.deepEqual(s.pairs, [], "nothing swapped");
});

test("a number swapped for another quantity (unit differs) is marked, not a chip pair", () => {
  const c = changes([T("The work is $60.0\\ \\text{J}$.")], [T("The work is $2.0\\ \\text{kg}$.")]);
  assert.deepEqual(marks(c.snack[0]), ["60.0"]);
  assert.deepEqual(c.pairs, []);
});

test("unchanged, figures, arrays, \\text{} and the original's steps", () => {
  const same = changes([T("Same $1.0$ kg.")], [T("Same $1.0$ kg.")]);
  assert.deepEqual([same.snack[0], same.pairs], ["Same $1.0$ kg.", []]);
  const g = { type: "graph", alt: "f" };
  const c = changes([g, T(["Mass $5\\ \\text{kg 2}$", "", "v = 3"])], [g, T(["Mass $4\\ \\text{kg 2}$", "", "v = 3"])]);
  assert.equal(c.snack[0], null, "a figure has no source");
  assert.deepEqual(marks(c.snack[1]), ["5"], "an md array is one source; a number inside \\text{} is never wrapped");
  assert.equal(markNums("$W = 4 \\cdot 2.0 = 8$ and 4", c.olds), "$W = \\htmlClass{chg}{4} \\cdot 2.0 = 8$ and \uE0004\uE001");
  assert.equal(markNums("$x = 1$", new Set()), "$x = 1$");
});
