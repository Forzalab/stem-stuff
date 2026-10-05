// speak.mjs: Cluck's text read aloud (design/EASY.md Phase 4). LaTeX and units come out as words.
import { test } from "node:test";
import assert from "node:assert/strict";
import { speakable } from "../speak.mjs";

test("math reads as words", () => {
  assert.equal(speakable("Use: $v_f = \\sqrt{v_i^2 + 2W/m}$"), "Use: v f equals root of (v i squared plus 2W over m)");
  assert.equal(speakable("$K = \\tfrac12 mv^2$"), "K equals 1 over 2 mv squared");
  assert.equal(speakable("$W = 48 - 12 = 36$ J"), "W equals 48 minus 12 equals 36 joules");
  assert.equal(speakable("$-12$ J"), "minus 12 joules");
});
test("lines become sentences; units spelled", () => {
  assert.equal(speakable("POOF!\nAnswer: b) 20.9 m/s"), "POOF! Answer: b) 20.9 meters per second");
  assert.equal(speakable("one\ntwo"), "one. two");
  assert.equal(speakable(""), "");
  assert.equal(speakable("So the speed is **20.9 m/s**.\n$$v = 20.9$$"), "So the speed is 20.9 meters per second. v equals 20.9");
  assert.equal(speakable("Before:\n- Cart: $2(3) = 6$"), "Before: Cart: 2 3 equals 6");
});
