// flip.mjs: the Flip view's pure parts: which pipe tables become a Flip, the model, the html.
import { test } from "node:test";
import assert from "node:assert/strict";
import { tableShape, flipModel, flipHTML } from "../client/pure_logic_modules/flip.mjs";
import { pipeTable } from "../client/pure_logic_modules/steps.mjs";

const SHOT = ["| factor | what changed | effect on $P$ |", "", "|---|---|---|", "", "| **V** | down to $\\frac13$ | up |", "", "| **T** | down to $\\frac12$ | down |"];

test("tableShape: step | you did | the fix is a flip; any other strict table (the old Tug shot included) is a table", () => {
  assert.equal(tableShape(["step", "you did", "the fix"], [["arm", "L", "half of L"], ["KE", "x", "y"]]), "flip");
  assert.equal(tableShape(["unit", "symbol", "meaning"], [["a", "b", "c"], ["d", "e", "f"]]), "table");
  assert.equal(tableShape(["step", "you did", "the fix"], [1, 2, 3, 4, 5].map(i => ["s" + i, "x", "y"])), "table", "more than 4 cards: a table");
  assert.equal(tableShape(["a", "b", "c", "d"], [["x", "y", "z", "fix"], ["x", "y", "z", "you"]]), "table", "4 columns");
  const t = pipeTable(SHOT, 0);
  assert.equal(tableShape(t.head, t.rows), "table", "a cause -> up/down table stays a table now");
});
test("flipHTML: one tappable card per row, face A (you did, x) and face B (the fix, check)", () => {
  const h = flipHTML(flipModel([["arm of W", "L", "half of L"], ["KE", "x", "y"]]));
  assert.equal((h.match(/class="fl-card"/g) || []).length, 2);
  assert.match(h, /fl-a tn-orange"><span class="fl-gl" aria-hidden="true">✗<\/span><span class="fl-st">arm of W<\/span><span class="fl-tx">L</);
  assert.match(h, /fl-b tn-sky"><span class="fl-gl" aria-hidden="true">✓<\/span><span class="fl-st">arm of W<\/span><span class="fl-tx">half of L</);
  assert.match(h, /role="button" tabindex="0"/);
});
