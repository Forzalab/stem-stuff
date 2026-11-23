// FIG-CLEAR smoke (qcard.js figPush, Tony Nov 23): the figure's ink comes within 12 px of the Ask Cluck button -> the push that keeps 12 px clear; else 0.
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
const SRC = readFileSync(new URL("../client/answer/qcard/qcard.js", import.meta.url), "utf8");
const win = { document: { readyState: "complete", documentElement: { classList: { contains: () => false } }, getElementById: () => null } };
win.window = win;
vm.runInNewContext(SRC, win);
const push = win.stemFigClear.push;
const btn = { l: 314, t: 26, r: 358, b: 70 };          // the 44px button at the card's top right (390 phone)
test("ramp-like: the apex ink sits under the button's 12px halo -> pushed just enough", () => {
  assert.equal(push({ l: 20, t: 62, r: 340, b: 260 }, btn, 12), 20);   // 70 + 12 - 62
  assert.equal(push({ l: 20, t: 74, r: 340, b: 260 }, btn, 12), 8);
});
test("piston-like: ink clear of the halo (left of it, or 12px+ below) -> no push", () => {
  assert.equal(push({ l: 20, t: 30, r: 290, b: 200 }, btn, 12), 0);   // right edge 24px left of the button
  assert.equal(push({ l: 20, t: 82, r: 340, b: 260 }, btn, 12), 0);   // exactly 12 px under it
  assert.equal(push(null, btn, 12), 0);
});
