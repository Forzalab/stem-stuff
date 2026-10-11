// Code box suggestions (suggest.mjs): banks first, questions last, order kept inside each group.
import { test } from "node:test";
import assert from "node:assert/strict";
import { suggest, remember, normalize, normalizeLink, entry } from "../suggest.mjs";
import { ANY } from "../codes.mjs";

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
test("entry: a bare suffix opens a bank; full codes as before; paste (normalize) stays strict", () => {
  for (const s of ["p2x", "P2X", " #p2x ", "bank p2x", "BANK_P2X"]) assert.deepEqual(entry(s), { prefix: "BANK", code: "BANK_P2X" }, s);
  assert.deepEqual(entry("calc1 t6b"), { prefix: "CALC1", code: "CALC1_T6B" });
  for (const s of ["", "ab", "toolong7", "p2 x!", "p2-x"]) assert.equal(entry(s), null, s);
  assert.equal(normalize("p2x"), null);
});

test("custom prefixes: the code box takes a separator form, never a bare run", () => {
  for (const s of ["bear qaa", "bear-qaa", "BEAR_QAA", "#bear_qaa", " Bear  Qaa "]) assert.deepEqual(entry(s), { prefix: "BEAR", code: "BEAR_QAA" }, s);
  for (const s of ["bearqaa", "toolong7", "p2-x", "admin_abc", "diet_abc", "sugar qaa"]) assert.equal(entry(s), null, s);
  assert.equal(entry("p2x").code, "BANK_P2X");
  assert.deepEqual(entry("max_val"), { prefix: "MAX", code: "MAX_VAL" }, "accepted in the box, a 404 later, by design");
  assert.equal(entry("physp2xa").code, "PHYS_P2XA", "built-ins keep the optional separator");
});
test("normalize: a custom prefix only where the caller allows it", () => {
  assert.equal(normalize("max_val"), null);
  assert.equal(normalize("hello world"), null);
  assert.equal(normalize("BEAR_QAA"), null, "no known prefixes given");
  assert.equal(normalize("BEAR_QAA", new Set(["BEAR"])).code, "BEAR_QAA");
  assert.equal(normalize("bear qaa", ["BEAR"]).code, "BEAR_QAA");
  assert.equal(normalize("max_val", new Set(["BEAR"])), null);
  assert.equal(normalize("admin_abc", ANY), null);
  assert.equal(normalize("diet_abc", new Set(["DIET"])), null);
  assert.equal(normalize("max_val", ANY).code, "MAX_VAL", "the Paste button");
  assert.equal(normalize("calc1 t6b").code, "CALC1_T6B");
  assert.equal(normalize("bank-p2x").code, "BANK_P2X");
});
test("links: a custom prefix needs _", () => {
  assert.equal(normalizeLink("#bear_qaa").code, "BEAR_QAA");
  assert.equal(normalizeLink("bear_qaa").code, "BEAR_QAA");
  for (const s of ["#bear qaa", "#bear-qaa", "#bearqaa", "#admin_abc", "#diet_abc"]) assert.equal(normalizeLink(s), null, s);
  assert.equal(normalizeLink("#calc1-t6b").code, "CALC1_T6B", "built-ins as before");
  assert.equal(normalizeLink("#BANK_P2X").prefix, "BANK");
});
