// texfix.mjs: a bare "?" after a relation is braced so KaTeX keeps the space ("L = ?"). Smoke + sanity.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { qmark } from "../client/pure_logic_modules/texfix.mjs";
const katex = createRequire(import.meta.url)("../client/vendor/katex/katex.min.js");
const gaps = tex => (katex.renderToString(qmark(tex), { throwOnError: false }).match(/class="mspace"/g) || []).length;

test("qmark braces a bare ? after a relation", () => {
  assert.equal(qmark("x=?"), "x={?}");
  assert.equal(qmark("x = ?"), "x = {?}");
  assert.equal(qmark("x=\\,?"), "x=\\,{?}");
  assert.equal(qmark("a \\le ?"), "a \\le {?}");
  assert.equal(qmark("a \\to?"), "a \\to{?}");
});
test("qmark leaves everything else alone, and is idempotent", () => {
  for (const s of ["x={?}", "f(x)?", "x=3", "?", "a?b", "\\text{is it?}", "\\left(x\\right)?"]) assert.equal(qmark(s), s);
  assert.equal(qmark(qmark("L=?")), "L={?}");
});
test("real KaTeX: L=? gets the same two gaps as L=3", () => {
  assert.equal(gaps("L=3"), 2);
  assert.equal(gaps("L=?"), 2);
  assert.equal(gaps("L \\le ?"), gaps("L \\le 3"));
});
