// W6 shard balance: ci-weights.mjs pure parts + CLI on 3 fixture logs (offline) + the committed tests/weights.json vs run-all.sh --plan.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { parseLog, median, weightsFromLogs, pickRuns } from "../tools/operations/ci-weights.mjs";

const dir = new URL("./fixtures/ci-weights/", import.meta.url).pathname;
const logs = readdirSync(dir).sort().map((f) => readFileSync(dir + f, "utf8"));

// parse: ok / PASS / FAIL with and without the Actions timestamp; QUAR, group and summary lines ignored
assert.deepEqual(parseLog(logs[0]), [["a", 10], ["b", 4]]);
assert.deepEqual(parseLog(logs[1]), [["a", 30], ["b", 6], ["c@x", 2.4]]);
assert.deepEqual(parseLog(logs[2]), [["a", 20], ["b", 5]]);
assert.deepEqual(parseLog(""), []);

assert.equal(median([3, 1, 2]), 2);
assert.equal(median([1, 2, 3, 4]), 2.5);
assert.equal(median([]), 0);

// AC6.1: 3 fixture logs -> per-spec medians, integer >= 1, sorted keys
const w = weightsFromLogs(logs);
assert.deepEqual(w, { a: 20, b: 5, "c@x": 2 });
assert.deepEqual(Object.keys(w), ["a", "b", "c@x"]);
assert.equal(weightsFromLogs(["ok   t 0.2 s\n"]).t, 1);

assert.deepEqual(pickRuns(["log-3", "log-1", "log-2"], 2), ["log-2", "log-3"]);
assert.deepEqual(pickRuns(["log-2", "log-1"], 0), ["log-1", "log-2"]);

// CLI offline: --from-runs 2 = the two newest files (log-2, log-3)
const cli = new URL("../tools/operations/ci-weights.mjs", import.meta.url).pathname;
const out = JSON.parse(execFileSync("node", [cli, "--from-runs", "2", "--logs", dir], { encoding: "utf8" }));
assert.deepEqual(out, { a: 25, b: 6, "c@x": 2 });

// run-all.sh --plan reads tests/weights.json: AC6.4 each unit dealt exactly once; AC6.2 ratio from the plan's own sums
const root = new URL("../", import.meta.url).pathname;
const wj = JSON.parse(readFileSync(root + "tests/weights.json", "utf8"));
assert.ok(Object.keys(wj).length > 100);
const plan = JSON.parse(execFileSync("tests/run-all.sh", ["--plan", "4", "3"], { cwd: root, encoding: "utf8" }));
const units = plan.include.flatMap((b) => b.lanes.split("|").flatMap((l) => l.split(" ")));
const listed = execFileSync("tests/run-all.sh", ["--list"], { cwd: root, encoding: "utf8" }).split("\n").filter((n) => n && n !== "unittest" && n !== "npm").sort();
assert.deepEqual([...units].sort(), listed, "every unit dealt exactly once");
const sums = plan.include.flatMap((b) => b.lanes.split("|").map((l) => l.split(" ").reduce((s, n) => s + (wj[n] ?? 5), 0)));
assert.ok(Math.max(...sums) / Math.min(...sums) <= 1.15, `lane ratio ${Math.max(...sums) / Math.min(...sums)}`);
console.log("ci-weights.test.mjs ok");
