// quack.mjs: randomized "QUACK" prefixes with warm kaomoji for hint feedback
import { test } from "node:test";
import assert from "node:assert/strict";
import { quack, withQuack } from "../quack.mjs";

test("quack returns a string starting with /^qu+a+c+k/i", () => {
  const result = quack("seed1");
  assert.match(result, /^qu+a+c+k/i);
});

test("quack contains one emote from the curated list", () => {
  const result = quack("seed2");
  // Should have QUACK word (which may contain spaces) and then emote
  const lastSpaceIdx = result.lastIndexOf(" ");
  assert.ok(lastSpaceIdx > 0, "Should have a space separating QUACK word and emote");
  const quackPart = result.substring(0, lastSpaceIdx);
  const emotePart = result.substring(lastSpaceIdx + 1);
  assert.match(quackPart, /^qu+a+c+k/i);
  // Emote is non-empty
  assert.ok(emotePart.length > 0);
});

test("quack is deterministic from seed", () => {
  const seed = "CALC1_ABC:0";
  const result1 = quack(seed);
  const result2 = quack(seed);
  assert.equal(result1, result2);
});

test("quack varies across different seeds", () => {
  const results = new Set();
  for (let i = 0; i < 50; i++) {
    results.add(quack("seed" + i));
  }
  assert.ok(results.size >= 8, `Should have at least 8 distinct prefixes over 50 seeds, got ${results.size}`);
});

test("quack never equals prev", () => {
  const result1 = quack("seed1");
  const result2 = quack("seed1", result1);
  assert.notEqual(result2, result1);
});

test("withQuack strips 'QUACK. ' prefix and keeps rest", () => {
  const text = "QUACK. This is the rest of the hint.";
  const result = withQuack(text, "seed", "");
  assert.match(result, /^qu+a+c+k/i);
  assert.ok(result.includes("This is the rest of the hint"), "Should keep the rest of text");
});

test("withQuack strips 'Quack! ' prefix (case-insensitive)", () => {
  const text = "Quack! Another hint here.";
  const result = withQuack(text, "seed", "");
  assert.match(result, /^qu+a+c+k/i);
  assert.ok(result.includes("Another hint here"), "Should keep the rest of text");
});

test("withQuack handles empty text", () => {
  const result = withQuack("", "seed", "");
  assert.equal(result, "");
});

test("withQuack prepends new prefix if no QUACK found", () => {
  const text = "Just a regular hint";
  const result = withQuack(text, "seed", "");
  assert.match(result, /^qu+a+c+k/i);
  assert.ok(result.includes("Just a regular hint"), "Should include original text");
});

test("withQuack never returns prev", () => {
  const text = "QUACK. Test hint";
  const prev = quack("seed1");
  const result = withQuack(text, "seed1", prev);
  assert.notEqual(result.split(" ")[0] + " " + result.split(" ")[1], prev);
});

test("withQuack strips multiple variations of QUACK prefix", () => {
  const testCases = [
    "QUACK. hint text",
    "Quack. hint text",
    "quack. hint text",
    "QUACK! hint text",
    "quack! hint text",
    "QUACK~ hint text",
  ];
  for (const text of testCases) {
    const result = withQuack(text, "seed", "");
    assert.ok(result.includes("hint text"), `Failed for: ${text}, got: ${result}`);
  }
});
