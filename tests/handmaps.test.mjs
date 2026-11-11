import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PATHS } from "./paths.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RUN = path.join(ROOT, "tests/run-all.sh");

function affected(...files) {
  return execFileSync("bash", [RUN, "--affected", ...files], { cwd: ROOT, encoding: "utf8" });
}

test("paths.mjs and paths.py export the same layout", () => {
  const py = [
    "import json, sys",
    `sys.path.insert(0, ${JSON.stringify(path.join(ROOT, "tests"))})`,
    "import paths",
    "print(json.dumps(paths.PATHS, sort_keys=True))",
  ].join("\n");
  const mirror = JSON.parse(execFileSync("python3", ["-c", py], { encoding: "utf8" }));
  assert.deepEqual(mirror, JSON.parse(JSON.stringify(PATHS)));
});

test("a known file maps to known units", () => {
  const out = affected("app.css");
  assert.match(out, /^ux-flows@phone$/m);
  assert.match(out, /^telemetry$/m);
  assert.match(out, /^desk-layout@1$/m);
});

test("serve.py reaches both pipes", () => {
  const out = affected("server/http_server/serve.py");
  assert.match(out, /^unittest$/m);
  assert.match(out, /^npm$/m);
  assert.match(out, /^ux-flows@phone$/m);
});

test("an unknown layout path falls back to every layout unit", () => {
  const out = affected("no-such-file.css");
  assert.match(out, /^unmapped: no-such-file\.css -> all layout /m);
  assert.match(out, /^ux-flows@phone$/m);
  assert.match(out, /^stages@desk$/m);
});

test("an unknown logic path falls back to the logic runners", () => {
  const out = affected("no-such-file.py");
  assert.match(out, /^unmapped: no-such-file\.py -> all logic /m);
  assert.match(out, /^unittest$/m);
  assert.match(out, /^npm$/m);
  assert.doesNotMatch(out, /^ux-flows@phone$/m);
});

test("a root module imported by serve.py inherits serve.py's units", () => {
  const serve = new Set(affected("server/http_server/serve.py").trim().split("\n"));
  const expr = new Set(affected("server/answer_grading/expr.py").trim().split("\n"));
  assert.ok(serve.size > 10, "serve.py should reach many units");
  for (const u of serve) assert.ok(expr.has(u), `expr.py is missing ${u}`);
});

test("a .js file under tests/ is layout, not logic", () => {
  // join() so this test file does not itself name the fixture in gen-auto's edge (a)
  const out = affected(["tests", "e2e", "fixture", "app.js"].join("/"));
  assert.match(out, /^unmapped: tests\/e2e\/fixture\/app\.js -> all layout /m);
  assert.match(out, /^ux-flows@phone$/m);
  assert.match(out, /^stages@desk$/m);
  assert.doesNotMatch(out, /^unittest$/m);
  assert.doesNotMatch(out, /^npm$/m);
});

test("--report lists a file mapped to ALL logic", () => {
  const out = execFileSync("bash", [RUN, "--affected", "--report", "aiw.py", "no-such-file.py"], {
    cwd: ROOT, encoding: "utf8",
  });
  assert.match(out, /^all \(2\): aiw\.py no-such-file\.py$/m);
});

test("--report prints a median and the ALL files", () => {
  const out = execFileSync("bash", [RUN, "--affected", "--report", "app.css", "index.html"], {
    cwd: ROOT, encoding: "utf8",
  });
  assert.match(out, /^report: 2 files, median [0-9.]+ units\/file$/m);
  assert.match(out, /^all \(\d+\): .*index\.html/m);
});
