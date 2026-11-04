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
  assert.equal(pipeTable(["| a | b |", "|---|---|", "| 1 | 2 |", "| 3 |", "| 4 | 5 |"], 0), null, "a row off the column count in the middle: not a table");
  assert.deepEqual(pipeTable(["| a | b |", "|---|---|", "| 1 | 2 |", "| 3 |"], 0), { head: ["a", "b"], rows: [["1", "2"]], next: 3 }, "a short LAST line is a row still arriving: the table so far, the line left for pipeHold");
});
test("pipeHold: a table still arriving is held (no raw bars), a finished table and prose are not", async () => {
  const { pipeHold } = await import("../steps.mjs");
  const H = "| factor | what changed | effect on $P$ |", S = "|---|---|---|";
  assert.equal(pipeHold([H], 0), 1, "a lone header");
  assert.equal(pipeHold(["intro", "", H, ""], 2), 3, "a header then blanks (the blank line itself is an ordinary gap)");
  assert.equal(pipeHold([H, "", S], 0), 3, "header + separator, no body row yet");
  assert.equal(pipeHold([H, S, "| **V** | down to $\\frac13$"], 0), 3, "header + separator + a cut first row");
  assert.equal(pipeHold([H, S, "| **V** | down | up |", "| **T** | do"], 3), 4, "a cut second row");
  assert.equal(pipeHold([H, S, "| **V** | down | up |", "| **T** |"], 3), 4, "a second row cut right after a bar");
  assert.equal(pipeHold([H, S, "| a | b | c |"], 0), null, "a finished table is drawn, not held");
  assert.equal(pipeHold([H, "|--"], 0), 2, "the separator still being typed");
  assert.equal(pipeHold([H, S, "|"], 0), 3, "a first row that is only its opening bar");
  assert.equal(pipeHold(["|x| = 3"], 0), null, "absolute value is prose");
  assert.equal(pipeHold(["| a | b |", "plain text after"], 0), null, "a pipe line followed by prose is not held");
});
