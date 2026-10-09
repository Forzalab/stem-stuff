// "Next doesn't work" (T16): a user press of Prev / Next never ends in a silent return. Source guards (the browser rows are next-dead.pw.mjs).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const nav = readFileSync(join(ROOT, "nav.js"), "utf8"), app = readFileSync(join(ROOT, "app.js"), "utf8");
const body = (src, head) => { const i = src.indexOf(head); assert.ok(i >= 0, head + " not found"); const j = src.indexOf("\n  }\n", i); return src.slice(i, j); };

test("nav.js go(): every bare return is preceded by a note()", () => {
  const go = body(nav, "  function go(d) {");
  const parts = go.split(/\breturn;/);
  assert.ok(parts.length > 1, "go() has no early returns left to check?");
  for (const p of parts.slice(0, -1)) assert.match(p.slice(-90), /note\(/, "a return in go() with no note() before it: " + p.slice(-90));
});

test("nav.js go(): a hash already on the target is asked again, not assigned again", () => {
  const go = body(nav, "  function go(d) {");
  assert.match(go, /location\.hash === "#" \+ e\.c\) dispatchEvent\(new HashChangeEvent\("hashchange"\)\)/);
});

test("nav.js: in a bank, Next is not dimmed by a current code that is not in the bank (a direct link); an upload still dims it (render.pw.mjs)", () => {
  assert.match(nav, /next\.disabled = \(!here && !bank\(\)\) \|\| !pool\(\)\.length;/);
});

test("app.js: a code the page can't open is said, not dropped (load, fromHash)", () => {
  assert.match(app, /async function load\(code\) \{\n  if \(!CODE_RE\.test\(code\)\) \{ note\(`Can't open \$\{code\}\.`\); return; \}/);
  assert.match(app, /if \(!n\) \{ if \(location\.hash\.length > 1\) note\(`Can't open /);
});

test("app.js: CODE_RE is untouched here (T15 owns the pattern)", () => {
  assert.match(app, /^const CODE_RE = \/\^\(CALC1\|CSCI26\|PHYS\|PSY\)_\[A-Z0-9\]\{3,6\}\$\/;$/m);
});
