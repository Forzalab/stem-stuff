// nav.js titles (design/NAV.md): problem.title, else plain text from the first text block, 60 chars at most.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { titleOf, texText, clip, head } from "../nav.js";

const bank = JSON.parse(readFileSync(new URL("../problems.json", import.meta.url), "utf8"));

test("every problem in problems.json gets a short plain title: no TeX, no markdown", () => {
  for (const p of bank.problems) {
    const t = titleOf({ ...p, title: undefined });
    assert.ok(t.length > 0 && t.length <= 60, `${p.code}: ${t}`);
    assert.ok(!/[\\$*`{}]/.test(t), `${p.code} not plain: ${t}`);   // "|" is fine: |A| is plain text
  }
});
test("fallback reads like the problem", () => {
  const by = c => titleOf({ ...bank.problems.find(p => p.code === c), title: undefined });
  assert.equal(by("CALC1_T6B"), "Let f(x)=(x³-8)/(x-2). A calculator gives:");
  assert.equal(by("CALC1_X2P"), "Solve for x: x+2=11");
  assert.equal(by("PHYS_F3N"), "A 4.0 kg block slides down a 30° ramp with μk = 0.20.");   // ends at a full sentence
});
test("authored title wins, trimmed and clipped", () => {
  assert.equal(titleOf({ title: "  Spring on an incline ", body: [{ type: "text", md: "x" }] }), "Spring on an incline");
  const long = titleOf({ title: "word ".repeat(30), body: [] });
  assert.ok(long.length <= 60 && long.endsWith("…"), long);
});
test("TeX to text", () => {
  assert.equal(texText("\\dfrac{1}{2}mv^2"), "1/2mv²");
  assert.equal(texText("\\sqrt{x+1}\\,\\text{m}"), "√(x+1) m");
  assert.equal(texText("x^{-1} \\le \\pi"), "x⁻¹ ≤ π");
  assert.equal(clip("a".repeat(70)).length, 60);
});
test("no body text: empty title (the list shows the code)", () => {
  assert.equal(titleOf({ body: [{ type: "graph", alt: "a plot" }] }), "");
});
test("title prefix for the list header (clutter C14)", () => {
  assert.equal(head("Force graph 2: work"), "Force graph 2");
  assert.equal(head("Pucks, reverse trade: v1"), "Pucks, reverse trade");
  assert.equal(head("Skier tow power"), "");
  assert.equal(head("ratio 3:1 here"), "");   // a colon needs the space
});
