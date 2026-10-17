// Cluck's step badges (steps.mjs) and the phone sheet's drag maths (sheet.mjs)
import { test } from "node:test";
import assert from "node:assert/strict";
import { renumberSteps } from "../steps.mjs";
import { snapTo, radiusAt, dimAt, progress, clampPos } from "../sheet.mjs";

test("steps the model numbered '1.' each time still count 1, 2, 3", () => {
  const t = "1. The net force points toward the center — a = v^2/r\n$$F = ma$$\n1. Solve for the seat force — N - mg\n1. State the answer";
  assert.deepEqual(renumberSteps(t).split("\n").filter(l => /^\d\./.test(l)).map(l => l[0]), ["1", "2", "3"]);
  assert.ok(renumberSteps(t).includes("$$F = ma$$"), "other lines are untouched");
});
test("steps keep their title text and a ')' numbering; a '---' rule restarts the count", () => {
  assert.equal(renumberSteps("3) Find x — now\n3) Find y"), "1. Find x — now\n2. Find y");
  assert.equal(renumberSteps("1. A\n1. B\n---\n1. C"), "1. A\n2. B\n---\n1. C");
  assert.equal(renumberSteps("no steps here\n- a list\n2018. not a step"), "no steps here\n- a list\n2018. not a step");
});
test("progress, radius and dim run from the dock (0) to full screen (1)", () => {
  assert.equal(progress(240, 240), 0); assert.equal(progress(0, 240), 1); assert.equal(progress(120, 240), 0.5);
  assert.equal(progress(400, 240), 0, "sliding down past the dock changes nothing");
  assert.equal(radiusAt(240, 240, 30), 30); assert.equal(radiusAt(0, 240, 30), 0); assert.equal(radiusAt(120, 240, 30), 15);
  assert.equal(radiusAt(360, 240, 30), 30, "sliding down keeps the round corners");
  assert.equal(dimAt(240, 240, 800), 0.8); assert.equal(dimAt(0, 240, 800), 0.96); assert.equal(dimAt(120, 240, 800), 0.88);
  assert.equal(dimAt(800, 240, 800), 0, "gone: no dim"); assert.ok(dimAt(520, 240, 800) < 0.8 && dimAt(520, 240, 800) > 0, "fades as it slides down");
  assert.equal(clampPos(-5, 800), 0); assert.equal(clampPos(900, 800), 800);
});
test("release snaps: nearest point slow, one point on a fling, close after 64px down from the dock", () => {
  const P = 240, H = 800;
  assert.equal(snapTo(100, P, H), 0); assert.equal(snapTo(150, P, H), P); assert.equal(snapTo(250, P, H), P);
  assert.equal(snapTo(310, P, H), H, "64px+ below the dock closes");
  assert.equal(snapTo(200, P, H, -900), 0, "fling up from the dock goes full"); assert.equal(snapTo(300, P, H, -900), P);
  assert.equal(snapTo(30, P, H, 900), P, "fling down from full returns to the dock, not closed");
  assert.equal(snapTo(320, P, H, 0, true), P, "a drag that began on the full sheet never closes in one go");
  assert.equal(snapTo(320, P, H, 0, false), H);
  assert.equal(snapTo(P, P, H, 900), P); assert.equal(snapTo(P + 40, P, H, 900), H);
});
