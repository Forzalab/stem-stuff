// shuffle.mjs: the seeded shuffle behind MC choices and the question order (design/NAV.md)
import test from "node:test";
import assert from "node:assert/strict";
import { shuffled, mastery, family } from "../shuffle.mjs";

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

/* mastery(order, recOf, cur): answered first, then cur, then the open rest by family wrong tries (design/NAV.md "Mastery order") */
const recs = o => c => o[c] || null;
test("family = prefix + first suffix letter", () => {
  assert.equal(family("CSCI26_C2A"), "CSCI26_C");
  assert.equal(family("CALC1_T6B"), "CALC1_T");
});
test("mastery: the answered prefix keeps its seeded order", () => {
  const order = ["CSCI26_A1", "CSCI26_B1", "CSCI26_C1", "CSCI26_D1"];
  const r = recs({ CSCI26_C1: { x: 0, done: "correct" }, CSCI26_A1: { x: 2, done: "out" } });
  assert.deepEqual(mastery(order, r, null).slice(0, 2), ["CSCI26_A1", "CSCI26_C1"]);
});
test("mastery: a missed family comes first among the open ones", () => {
  const order = ["CSCI26_A1", "CSCI26_B1", "CSCI26_C1", "CSCI26_C2", "CSCI26_B2"];
  const r = recs({ CSCI26_C1: { x: 2, done: "out" }, CSCI26_B2: { x: 1, done: "correct" } });
  assert.deepEqual(mastery(order, r, null), ["CSCI26_C1", "CSCI26_B2", "CSCI26_C2", "CSCI26_B1", "CSCI26_A1"]);
});
test("mastery: ties keep the seeded order", () => {
  const order = ["CSCI26_D1", "CSCI26_A1", "CSCI26_C1", "CSCI26_B1"];
  assert.deepEqual(mastery(order, () => null, null), order);
  const r = recs({ CSCI26_D1: { x: 1, done: "open" }, CSCI26_B1: { x: 1, done: "open" } });
  assert.deepEqual(mastery(order, r, null), ["CSCI26_D1", "CSCI26_B1", "CSCI26_A1", "CSCI26_C1"]);
});
test("mastery: one wrong outranks zero", () => {
  const order = ["CSCI26_A1", "CSCI26_B1", "CSCI26_B2"];
  const r = recs({ CSCI26_B2: { x: 1, done: "open" } });
  assert.deepEqual(mastery(order, r, null), ["CSCI26_B1", "CSCI26_B2", "CSCI26_A1"]);
});
test("mastery: cur stays right after the answered ones", () => {
  const order = ["CSCI26_A1", "CSCI26_B1", "CSCI26_C1", "CSCI26_D1"];
  const r = recs({ CSCI26_D1: { x: 0, done: "correct" }, CSCI26_B1: { x: 1, done: "open" } });
  assert.deepEqual(mastery(order, r, "CSCI26_C1"), ["CSCI26_D1", "CSCI26_C1", "CSCI26_B1", "CSCI26_A1"]);
  // an answered cur stays in the answered prefix
  assert.deepEqual(mastery(order, r, "CSCI26_D1"), ["CSCI26_D1", "CSCI26_B1", "CSCI26_A1", "CSCI26_C1"]);
});

test("glue: each snack right before its real, after any shuffle; a lost target leaves the snack in place", async () => {
  const { glue } = await import("../shuffle.mjs");
  const before = { PHYS_S1: "PHYS_R3", PHYS_S2: "PHYS_R3", PHYS_S3: "PHYS_R1", PHYS_S9: "PHYS_GONE" };
  const order = ["PHYS_R3", "PHYS_S3", "PHYS_R1", "PHYS_S9", "PHYS_S1", "PHYS_R2", "PHYS_S2"];
  assert.deepEqual(glue(order, c => before[c] || null), ["PHYS_S1", "PHYS_S2", "PHYS_R3", "PHYS_S3", "PHYS_R1", "PHYS_S9", "PHYS_R2"]);
  assert.deepEqual(glue(["PHYS_R1", "PHYS_R2"], () => null), ["PHYS_R1", "PHYS_R2"]);
  const big = shuffled([...Array(30).keys()].map(i => i % 3 ? "PHYS_R" + i : "PHYS_S" + i), "x");
  const g = glue(big, c => c.startsWith("PHYS_S") ? "PHYS_R" + (+c.slice(6) + 1) : null);
  for (const [i, c] of g.entries()) if (c.startsWith("PHYS_S")) assert.equal(g[i + 1], "PHYS_R" + (+c.slice(6) + 1));
});
