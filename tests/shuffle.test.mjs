// shuffle.mjs: the seeded shuffle behind MC choices and the question order (design/NAV.md)
import test from "node:test";
import assert from "node:assert/strict";
import { shuffled } from "../shuffle.mjs";

const codes = Array.from({ length: 50 }, (_, i) => "CSCI26_Q" + i);

test("same seed, same order; a permutation of the input", () => {
  const a = shuffled(codes, "abc"), b = shuffled(codes, "abc");
  assert.deepEqual(a, b);
  assert.deepEqual([...a].sort(), [...codes].sort());
  assert.notDeepEqual(a, codes);
});
test("a new seed gives a new order", () => {
  assert.notDeepEqual(shuffled(codes, "abc"), shuffled(codes, "abd"));
});
test("locked choices keep their slot", () => {
  const ch = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d", lock: true }, { id: "e" }];
  for (const s of ["x", "y", "z", "seed:CSCI26_A2B"]) assert.equal(shuffled(ch, s)[3].id, "d");
});
test("MC order is unchanged from the old inline app.js shuffle (pinned)", () => {
  const ch = ["a", "b", "c", "d", "e"].map(id => ({ id }));
  assert.deepEqual(shuffled(ch, "stem:CSCI26_N2A").map(c => c.id).join(""), PIN);
});
const PIN = "bceda";   // computed with the pre-move app.js function
