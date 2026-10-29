// Vendored OpenUI Lang (vendor/openui-lang.mjs, tools/openui/build.sh): every spec conformance case at level 1 (program +
// validation; the level-2 interactions.json replays need a renderer, P1), the zod-free prompt equals the official build's,
// the streaming parser keeps completed statements, and the bundle stays self-contained, silent and MIT-noticed.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { caseIds, runCase, spec } from "./openui-canon.mjs";
import { createStreamingParser, generateSystemPrompt } from "../vendor/openui-lang.mjs";

const repo = new URL("../", import.meta.url);
const text = p => readFileSync(new URL(p, repo), "utf8");

test("conformance fixtures: there are cases in every area", () => {
  const areas = new Set(caseIds().map(id => id.split("/")[0]));
  assert.deepEqual([...areas].sort(), ["actions", "editing", "entry", "errors", "evaluation", "grammar", "state", "streaming"]);
  assert.equal(caseIds().length, 59);   // spec/fixtures/1.0 at the pinned tag; a re-vendor that changes it updates this
});

for (const id of caseIds()) test(`conformance ${id}`, () => {
  const diffs = runCase(id);
  assert.deepEqual(diffs, [], `${id}\n  ${diffs.join("\n  ")}`);
});

test("prompt generator: the zod-free build prints the official npm build's prompt", () => {
  const got = generateSystemPrompt({ library: spec, promptOptions: { toolCalls: true, bindings: true } });
  assert.equal(got, text("tests/fixtures/openui/prompt.txt"));
  assert.match(got, /@Filter\(array: any\[\], field: string, operator: "==" \| "!=" /);   // a built-in signature read from the shim
});

test("streaming parser: a completed statement never changes as more text arrives", () => {
  const p = createStreamingParser(spec.schema, spec.root);
  p.push('root = Stack([t])\nt = Text("hel');
  const first = p.getResult();
  assert.equal(first.meta.incomplete, true);
  p.push('lo")\n', true);
  const done = p.getResult(true);
  assert.equal(done.meta.incomplete, false);
  assert.equal(done.root.typeName, "Stack");
  assert.equal(done.root.props.children[0].props.text ?? done.root.props.children[0].props.content, "hello");
});

test("bundle: one self-contained module, no telemetry, MIT notice first", () => {
  const src = text("vendor/openui-lang.mjs");
  const [head] = src.split("\n");
  assert.match(head, /^\/\*! OpenUI Lang core 1\.0\.2 .*MIT License, Copyright \(c\) 2011-2024 Thesys Inc\./);
  for (const bad of ['from"', "import(", "require(", "posthog", "fetch(", "sendBeacon", "XMLHttpRequest", "process.env"])
    assert.ok(!src.includes(bad), bad);
  assert.match(text("vendor/openui-lang.LICENSE.txt"), /^The MIT License \(MIT\)\n\nCopyright \(c\) 2011-2024 Thesys Inc\./);
  assert.match(text("tools/openui/build.sh"), /^VERSION=1\.0\.2 /m);
});
