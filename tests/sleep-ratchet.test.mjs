// AC2.5: the waitForTimeout( ratchet. Pure counting/comparison, plus the CLI on a temp copy of the tree:
// a fixture that adds one sleep to a baselined spec exits 1; the same tree with the baseline kept exits 0.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { countSleeps, ratchet } from "../tools/operations/sleep-ratchet.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(HERE, "..", "tools", "operations", "sleep-ratchet.mjs");

test("countSleeps counts every waitForTimeout( call", () => {
  assert.equal(countSleeps("await p.waitForTimeout(100);\nawait q.waitForTimeout(5)"), 2);
  assert.equal(countSleeps("await waitForFunction(() => true)"), 0);
});

test("ratchet: only a count above its baseline (missing = 0) is a violation", () => {
  const base = { "tests/a.pw.mjs": 2 };
  assert.deepEqual(ratchet(base, { "tests/a.pw.mjs": 2 }), [], "same count is fine");
  assert.deepEqual(ratchet(base, { "tests/a.pw.mjs": 1 }), [], "a sweep that drops sleeps is fine");
  assert.deepEqual(ratchet(base, { "tests/a.pw.mjs": 3 }), [{ file: "tests/a.pw.mjs", was: 2, now: 3 }]);
  assert.deepEqual(ratchet(base, { "tests/new.pw.mjs": 1 }), [{ file: "tests/new.pw.mjs", was: 0, now: 1 }],
    "a new spec with a sleep is not free");
});

test("CLI: adding one sleep to a baselined spec exits 1; the unchanged tree exits 0", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sleep-ratchet-"));
  try {
    fs.mkdirSync(path.join(root, "tests"));
    fs.writeFileSync(path.join(root, "tests", "x.pw.mjs"), "await a.waitForTimeout(1);\n");
    const run = () => spawnSync(process.execPath, [SCRIPT, "--root", root], { encoding: "utf8" });
    assert.equal(spawnSync(process.execPath, [SCRIPT, "--root", root, "--write"], { encoding: "utf8" }).status, 0);
    assert.equal(run().status, 0, "baseline = tree: ok");
    fs.appendFileSync(path.join(root, "tests", "x.pw.mjs"), "await b.waitForTimeout(2);\n");
    const bad = run();
    assert.equal(bad.status, 1, "one added sleep must fail the ratchet");
    assert.match(bad.stderr, /tests\/x\.pw\.mjs has 2 waitForTimeout\( \(baseline 1\)/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("CLI: the committed baseline matches the committed tree (no drift from main)", () => {
  const r = spawnSync(process.execPath, [SCRIPT], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
});
