// Code box suggestions (suggest.mjs): banks first, questions last, order kept inside each group.
import { test } from "node:test";
import assert from "node:assert/strict";
import { suggest, remember } from "../suggest.mjs";

test("typing P2X lists the bank before the questions", () => {
  const codes = ["PHYS_P2XA", "CALC1_P2X", "BANK_P2X", "PHYS_P2XB", "BANK_P2XQ", "CALC1_T6B"];
  assert.deepEqual(suggest("P2X", codes), ["BANK_P2X", "BANK_P2XQ", "PHYS_P2XA", "CALC1_P2X", "PHYS_P2XB"]);
});
test("order inside each group is the order given (recent first)", () => {
  assert.deepEqual(suggest("x", ["CALC1_X2P", "BANK_XB1", "PHYS_X1", "BANK_XA1"]), ["BANK_XB1", "BANK_XA1", "CALC1_X2P", "PHYS_X1"]);
});
test("case, spaces, # and separators do not matter; no match, empty, duplicates, the exact code", () => {
  assert.deepEqual(suggest("bank p2", ["BANK_P2X", "PHYS_P2X"]), ["BANK_P2X"]);
  assert.deepEqual(suggest("#bank-p2x", ["BANK_P2X", "BANK_P2XQ"]), ["BANK_P2XQ"]);
  assert.deepEqual(suggest("zzz", ["BANK_P2X"]), []);
  assert.deepEqual(suggest("", ["BANK_P2X"]), []);
  assert.deepEqual(suggest("p2", ["PHYS_P2X", "PHYS_P2X", "BANK_P2X"]), ["BANK_P2X", "PHYS_P2X"]);
});
test("limit", () => {
  const codes = Array.from({ length: 20 }, (_, i) => `PHYS_A${i}`);
  assert.equal(suggest("A", codes).length, 8);
  assert.equal(suggest("A", codes, 3).length, 3);
});
test("remember: newest first, no duplicates, capped", () => {
  assert.deepEqual(remember(["A", "B", "C"], "B"), ["B", "A", "C"]);
  assert.deepEqual(remember(null, "A"), ["A"]);
  assert.equal(remember(Array.from({ length: 50 }, (_, i) => "C" + i), "X", 40).length, 40);
});
