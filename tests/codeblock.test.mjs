// The codeblock (T43): app.js md() renders a fenced block as one .cb figure. The page's own md() + vendored marked, run in node
// (the browser rows: codeblock.pw.mjs).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const app = readFileSync(join(ROOT, "app.js"), "utf8");
const marked = createRequire(import.meta.url)(join(ROOT, "vendor/marked.min.js"));
const a = app.indexOf("function renderMath("), b = app.indexOf("/* ================= grading");
assert.ok(a > 0 && b > a, "md() not found in app.js");
const esc = s => String(s).replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]);
const icon = id => `<svg><use href="#${id}"/></svg>`;
const { md } = new Function("esc", "icon", "marked", "katex", app.slice(a, b) + "\nreturn { md };")(esc, icon, marked, undefined);

const SRC = "What does it print for $s$?\n\n```cpp\n#include <iostream>\nint main() {\n  int s = 0;  // $x$ stays text\n  std::cout << \"a//b\";\n\n}\n```";
const lines = h => [...h.matchAll(/<span class="l" style="--ind:(\d+)">(.*?)<\/span>(?=<span class="l"|<\/code>)/g)].map(m => [+m[1], m[2]]);

test("a fenced cpp block is one codeblock: language tag, Copy, one span per real line with its indent", () => {
  const h = md(SRC);
  assert.equal((h.match(/<figure class="cb"/g) || []).length, 1);
  assert.match(h, /aria-label="C\+\+ code"/);
  assert.match(h, /<span class="cb-lang">C\+\+<\/span>/);
  assert.match(h, /<span class="cb-slot" aria-hidden="true"><\/span><button type="button" class="btn cb-copy" aria-label="Copy code"/);
  const ls = lines(h);
  assert.equal(ls.length, 6, "6 real lines, the blank one too");
  assert.deepEqual(ls.map(l => l[0]), [0, 0, 2, 2, 0, 0]);
  assert.equal(ls[4][1], "", "a blank line stays a line");
});

test("KaTeX is never run inside a codeblock, still outside it", () => {
  const h = md(SRC);
  assert.match(h, /What does it print for <span class="mx"><code>s<\/code>\?<\/span>/, "the stem's $s$ is math (katex absent: the <code> fallback)");
  assert.match(h, /\/\/ \$x\$ stays text/);
  assert.doesNotMatch(h, /KXMATH|KXCODE/);
});

const S = (k, t) => `<span class="t-${k}">${t}</span>`;
test("highlight cpp: preprocessor, types, keywords, numbers, calls; a // inside a string is not a comment; code is escaped", () => {
  const ls = lines(md(SRC));
  assert.equal(ls[0][1], S("pre", "#include &lt;iostream&gt;"));
  assert.equal(ls[1][1], `${S("type", "int")} ${S("fn", "main")}() {`);
  assert.equal(ls[2][1], `  ${S("type", "int")} s = ${S("num", "0")};  ${S("com", "// $x$ stays text")}`);
  assert.equal(ls[3][1], `  std::cout &lt;&lt; ${S("str", "&quot;a//b&quot;")};`);
});

test("highlight: strings and comments win over the keywords inside them", () => {
  const ls = lines(md("```cpp\nreturn \"if for while\";  // else return\nchar c = 'x'; /* int */ int n = 0x1F;\n```"));
  assert.equal(ls[0][1], `${S("kw", "return")} ${S("str", "&quot;if for while&quot;")};  ${S("com", "// else return")}`);
  assert.equal(ls[1][1], `${S("type", "char")} c = ${S("str", "'x'")}; ${S("com", "/* int */")} ${S("type", "int")} n = ${S("num", "0x1F")};`);
  assert.equal((md("```js\nlet s = \"x // y\";\n```").match(/t-com/g) || []).length, 0, "// in a string");
});

test("highlight: a /* */ comment over several lines stays a comment, and the code after it is code again", () => {
  const ls = lines(md("```java\n/* for\n   while */ return 1;\n```"));
  assert.equal(ls[0][1], S("com", "/* for"));
  assert.equal(ls[1][1], `${S("com", "   while */")} ${S("kw", "return")} ${S("num", "1")};`);
});

test("highlight python: a # comment mid-line, keywords, builtins as types, calls; no preprocessor", () => {
  const ls = lines(md("```python\ndef sq(x):  # if x is for\n    return \"def\" + str(x)\n#!/usr/bin/env\n```"));
  assert.equal(ls[0][1], `${S("kw", "def")} ${S("fn", "sq")}(x):  ${S("com", "# if x is for")}`);
  assert.equal(ls[1][1], `    ${S("kw", "return")} ${S("str", "&quot;def&quot;")} + ${S("type", "str")}(x)`);
  assert.equal(ls[2][1], S("com", "#!/usr/bin/env"));
});

test("an unknown language stays plain text", () => {
  assert.doesNotMatch(md("```rust\nfn main() { let x = 1; }\n```"), /class="t-/);
});

test("a choice (inline md) with a fence gets the codeblock without Copy (the row is a button); without one it stays inline", () => {
  const h = md("```js\nlet x = 1;\n```", true, true);
  assert.match(h, /<figure class="cb" aria-label="JavaScript code">/);
  assert.doesNotMatch(h, /cb-copy/);
  assert.equal(md("just $x$ text", true), "just <code>x</code> text");
});

test("no language: the tag is empty, the label says Code; an unknown language shows as written", () => {
  assert.match(md("```\nx\n```"), /aria-label="Code"><div class="cb-hd"><span class="cb-lang"><\/span>/);
  assert.match(md("```rust\nfn main() {}\n```"), /<span class="cb-lang">rust<\/span>/);
});
