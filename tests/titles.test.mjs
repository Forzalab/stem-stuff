// titles.mjs: isSlugTitle / cardTitle smoke. A slug or no title shows no big title; a human title (with $math$) stays.
import { test } from "node:test";
import assert from "node:assert/strict";
import { isSlugTitle, cardTitle } from "../client/pure_logic_modules/titles.mjs";

test("slugs and missing titles are slug-like", () => {
  for (const t of ["X3 Q4 twin rectangle Ix Iy Iz", "ch7_card_1", "", "  ", undefined, null, "Q4"]) assert.equal(isSlugTitle(t, "PHYS_ABC"), true, String(t));
  assert.equal(isSlugTitle("Phys abc", "PHYS_ABC"), true, "the code in words");
});
test("human titles stay", () => {
  for (const t of ["Rectangle: $I_x, I_y, I_z$", "Ferris wheel: halfway point", "Q11 Q1(a): net torque about the axle", "Two routes", "MST: which are true"]) assert.equal(isSlugTitle(t, "PHYS_ABC"), false, t);
});
test("cardTitle: the trimmed title or empty", () => {
  assert.equal(cardTitle("  Rectangle:  $I_x$ ", "A_B"), "Rectangle: $I_x$");
  assert.equal(cardTitle("X3 Q4 twin rectangle Ix Iy Iz", "A_B"), "");
});
