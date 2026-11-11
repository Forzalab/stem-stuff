// tug.mjs: the Tug's pure parts (brain plan-2026-11-03/TUG-VIEW.md §4): row grammar, which pipe tables become a Tug, the model, the html.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRow, dirOf, tableShape, tugFromTable, tugModel, tugHTML } from "../client/pure_logic_modules/tug.mjs";
import { pipeTable } from "../client/pure_logic_modules/steps.mjs";

const SHOT = ["| factor | what changed | effect on $P$ |", "", "|---|---|---|", "", "| **V** | down to $\\frac13$ | up |", "", "| **T** | down to $\\frac12$ | down |"];

test("parseRow: label | move | dir [size]", () => {
  assert.deepEqual(parseRow("V | down to $\\frac13$ | up 3"), { label: "V", move: "down to $\\frac13$", dir: "up", size: 3, why: "" });
  assert.deepEqual(parseRow("T | down to $\\frac12$ | down"), { label: "T", move: "down to $\\frac12$", dir: "down", size: 1, why: "" });
  assert.equal(parseRow("x | y | sideways"), null);
  assert.equal(parseRow("a | b"), null);
  assert.equal(parseRow("a very long label | b | up"), null, "label over 10");
});
test("dirOf: direction words and arrows; anything else is null", () => {
  for (const [c, d] of [["up", "up"], ["**Up**", "up"], ["↑", "up"], ["higher", "up"], ["down", "down"], ["▼", "down"], ["lower", "down"], ["same", "same"]]) assert.equal(dirOf(c)?.dir, d, c);
  assert.equal(dirOf("up 3").size, 3);
  for (const c of ["the fix", "upset", "", "sideways", "downtown"]) assert.equal(dirOf(c), null, c);
});
test("tableShape: the SGU shot is a tug; step | you did | the fix is a table", () => {
  const t = pipeTable(SHOT, 0);
  assert.equal(tableShape(t.head, t.rows), "tug");
  assert.equal(tableShape(["step", "you did", "the fix"], [["arm", "L", "half of L"], ["KE", "x", "y"]]), "flip");
  assert.equal(tableShape(["unit", "symbol", "meaning"], [["a", "b", "c"], ["d", "e", "f"]]), "table");
  assert.equal(tableShape(["step", "you did", "the fix"], [1, 2, 3, 4, 5].map(i => ["s" + i, "x", "y"])), "table", "more than 4 cards: a table");
  assert.equal(tableShape(["a", "b"], [["x", "up"]]), "table", "one row is not a tug");
  assert.equal(tableShape(["a", "b", "c", "d"], [["x", "y", "z", "up"], ["x", "y", "z", "down"]]), "table", "4 columns");
  assert.equal(tableShape(["a", "b"], [["x", "up"], ["y", "maybe"]]), "table", "one row without a direction");
});
test("tugFromTable: rows, `of` from 'effect on $P$', bars from size only", () => {
  const t = pipeTable(SHOT, 0), m = tugFromTable(t.head, t.rows);
  assert.equal(m.of, "$P$");
  assert.deepEqual(m.rows.map(r => [r.label, r.move, r.dir, r.size, r.w]), [["**V**", "down to $\\frac13$", "up", 1, 100], ["**T**", "down to $\\frac12$", "down", 1, 100]]);
  assert.equal(m.net, "", "a pipe table never carries a net");
  assert.deepEqual(tugModel([{ label: "a", move: "", dir: "up", size: 3 }, { label: "b", move: "", dir: "down", size: 2 }]).rows.map(r => r.w), [100, 67]);
});
test("tugHTML: a sky ▲ bar, an orange ▼ bar, the end knot is '?', labels go through the caller's line()", () => {
  const t = pipeTable(SHOT, 0), h = tugHTML(tugFromTable(t.head, t.rows), s => "<i>" + s + "</i>");
  assert.equal((h.match(/tg-row tg-pull/g) || []).length, 2);
  assert.match(h, /tg-bar tg-up tn-sky"[^>]*>▲/);
  assert.match(h, /tg-bar tg-down tn-orange"[^>]*>▼/);
  assert.match(h, /tg-net">\?</);
  assert.match(h, /<i>\*\*V\*\*<\/i>/);
  assert.match(h, /<li>V: down to \\frac13, pulls up<\/li>/);
  assert.ok(!/<script/.test(tugHTML(tugModel([{ label: "<script>", move: "", dir: "up", size: 1 }]))), "escaped by default");
});
test("flipHTML: one tappable card per row, face A (you did, x) and face B (the fix, check)", async () => {
  const { flipModel, flipHTML } = await import("../client/pure_logic_modules/tug.mjs");
  const h = flipHTML(flipModel([["arm of W", "L", "half of L"], ["KE", "x", "y"]]));
  assert.equal((h.match(/class="fl-card"/g) || []).length, 2);
  assert.match(h, /fl-a tn-orange"><span class="fl-gl" aria-hidden="true">✗<\/span><span class="fl-st">arm of W<\/span><span class="fl-tx">L</);
  assert.match(h, /fl-b tn-sky"><span class="fl-gl" aria-hidden="true">✓<\/span><span class="fl-st">arm of W<\/span><span class="fl-tx">half of L</);
  assert.match(h, /role="button" tabindex="0"/);
});
test("parseRow: an optional 4th cell is the why (<= 60); more than 4 cells or a long why is null", () => {
  assert.equal(parseRow("V | down to 1/3 | up 3 | Smaller box, more hits per wall.").why, "Smaller box, more hits per wall.");
  assert.equal(parseRow("V | m | up | " + "w".repeat(61)), null);
  assert.equal(parseRow("V | m | up | a | b"), null);
});
test("dirOf: 'more' / 'less' are a direction only when the column header says so", () => {
  assert.equal(dirOf("more room than before"), null);
  assert.equal(dirOf("less"), null);
  assert.equal(dirOf("more", true).dir, "up");
  assert.equal(dirOf("less", true).dir, "down");
  assert.equal(tableShape(["a", "b"], [["x", "more"], ["y", "less"]]), "table", "plain header: a table");
  assert.equal(tableShape(["a", "effect"], [["x", "more"], ["y", "less"]]), "tug", "the header names an effect");
});
