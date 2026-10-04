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
