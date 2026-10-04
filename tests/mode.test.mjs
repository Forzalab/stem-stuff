// mode.mjs: the upload mirror of serve.py hidden() / view() (design/EASY.md, design/REWARDS-WIRING.md).
import { test } from "node:test";
import assert from "node:assert/strict";
import { hidden } from "../mode.mjs";

const snack = { code: "PHYS_SK1", type: "mc", sugar_only: true, choices: [{ id: "a", md: "1" }, { id: "b", md: "2" }], correct: "a",
  saccharine: { snack: true, before: "PHYS_R1" } };
const real = { code: "PHYS_R1", type: "mc", choices: [{ id: "a", md: "1" }, { id: "b", md: "2" }], correct: "a" };

test("diet leaves out sugar_only items (the snacks); sugar keeps them", () => {
  assert.equal(hidden(snack, "diet"), true);
  assert.equal(hidden(snack, "sugar"), false);
  assert.equal(hidden(real, "diet"), false);
  assert.equal(hidden(real, "sugar"), false);
});

test("sugar view: a snack carries snack, before and its original (serve.py view); diet never sees them", async () => {
  const { view } = await import("../mode.mjs");
  const s = { ...snack, saccharine: { ...snack.saccharine, key: "k", original: { q: 2, body: [{ type: "text", md: "Orig" }], solution: ["Answer: 1"] } } };
  const v = view(s, "sugar");
  assert.equal(v.snack, true); assert.equal(v.before, "PHYS_R1"); assert.deepEqual(v.original.solution, ["Answer: 1"]);
  assert.equal("saccharine" in v, false);
  const d = view(s, "diet");
  assert.equal("snack" in d || "original" in d || "before" in d, false);
  assert.equal("snack" in view(real, "sugar"), false);
});
