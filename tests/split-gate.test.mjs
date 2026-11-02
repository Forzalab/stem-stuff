// W152 gate (brain _files/w152/P0.md): the drill page is 3 ES modules (app.js -> cluck.js -> shell.js, tools/split-app.mjs). A name one
// part uses but never imports throws a ReferenceError only when that code path runs, so tests that never walk it stay green. This lints
// every part with no-undef (all paths, run or not), and pins the load order the split depends on.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Linter } from "eslint";
import globals from "globals";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PARTS = ["app.js", "cluck.js", "shell.js"].filter(f => existsSync(join(ROOT, f)));
// what the classic scripts before app.js put on window (index.html: vendor/, graph.js, popover.js, welcome.js, design/explain-box.js)
const LIBS = ["katex", "marked", "math", "Graph", "Pop", "Welcome", "ExplainBox"];
const config = [{
  languageOptions: { ecmaVersion: "latest", sourceType: "module", globals: { ...globals.browser, ...Object.fromEntries(LIBS.map(n => [n, "readonly"])) } },
  rules: { "no-undef": "error", "no-import-assign": "error", "no-redeclare": "error" },
}];
const lint = (code, name) => new Linter().verify(code, config, name).map(m => `${name}:${m.line}:${m.column} ${m.message}`);

test("the gate itself: a name no part declares or imports is an error", () => {
  assert.equal(lint("export const a = () => notDeclaredAnywhere();", "probe.js").length, 1);
  assert.equal(lint('import { x } from "./y.js"; x = 1;', "probe.js").length, 1, "assigning an import (a cross-part write without ln) is an error");
});

for (const f of PARTS) test(`${f}: no undeclared name, no write to an import`, () => {
  assert.deepEqual(lint(readFileSync(join(ROOT, f), "utf8"), f), []);
});

test("load order: index.html runs app.js, cluck.js, shell.js in a row; app.js imports neither later part", { skip: PARTS.length < 3 && "app.js not split" }, () => {
  const html = readFileSync(join(ROOT, "index.html"), "utf8");
  const tags = [...html.matchAll(/<script type="module" src="(app|cluck|shell)\.js"><\/script>/g)].map(m => m[1]);
  assert.deepEqual(tags, ["app", "cluck", "shell"]);
  const app = readFileSync(join(ROOT, "app.js"), "utf8");
  assert.doesNotMatch(app, /from\s+["']\.\/(cluck|shell)\.js["']|import\(["']\.\/(cluck|shell)\.js/, "app.js importing a later part makes it run LAST (ES cycle rule): TDZ errors at load");
  const sw = readFileSync(join(ROOT, "sw.js"), "utf8");
  for (const f of PARTS) assert.match(sw, new RegExp(`"${f.replace(".", "\\.")}"`), `${f} not precached in sw.js BASE`);
});
