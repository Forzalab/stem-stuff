// pipeTable (steps.mjs): a strict GFM pipe table in Cluck's reply (Tony's PHYS_SGU shot, Nov 3 16:16) renders as a table, not raw "| a | b |" lines.
import { test } from "node:test";
import assert from "node:assert/strict";
import { pipeTable } from "../steps.mjs";

const SHOT = ["Here is the push and the pull side by side:", "", "| factor | what changed | effect on $P$ |", "", "|---|---|---|", "",
  "| **V** | down to $\\frac13$ | up |", "", "| **T** | down to $\\frac12$ | down |", "", "Put both into one ratio:"];

test("the shot's table: head 3, rows 2, next = the line after the last row (blank lines between rows skipped)", () => {
  const t = pipeTable(SHOT, 2);
  assert.ok(t, "a table");
  assert.deepEqual(t.head, ["factor", "what changed", "effect on $P$"]);
  assert.deepEqual(t.rows, [["**V**", "down to $\\frac13$", "up"], ["**T**", "down to $\\frac12$", "down"]]);
  assert.equal(t.next, 9);                              // the blank after the last row; the loop resumes there
  assert.equal(SHOT[t.next + 1], "Put both into one ratio:");
});
test("a tight table (no blank lines) works too", () => {
  assert.deepEqual(pipeTable(["| a | b |", "|:--|--:|", "| 1 | 2 |"], 0), { head: ["a", "b"], rows: [["1", "2"]], next: 3 });
});
test("anything not strict returns null", () => {
  assert.equal(pipeTable(SHOT, 0), null, "a prose line");
  assert.equal(pipeTable(SHOT, 4), null, "the separator row alone");
  assert.equal(pipeTable(["| a | b |", "| 1 | 2 |"], 0), null, "no separator row");
  assert.equal(pipeTable(["| a | b |", "|---|---|"], 0), null, "no body row");
  assert.equal(pipeTable(["| a | b |", "|---|---|---|", "| 1 | 2 |"], 0), null, "separator column count differs");
  assert.equal(pipeTable(["| a | b |", "|---|---|", "| 1 |"], 0), null, "a body row with 2 cells expected, 1 given");
  assert.equal(pipeTable(["| a | b |", "|---|---|", "| 1 | 2 |", "| 3 |"], 0), null, "any row off the column count: not a table");
});
