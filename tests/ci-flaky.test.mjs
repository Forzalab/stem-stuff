// W4 in-job spec retry (ci-loosen-review.md AC4.1-4.5). run() is run-all.sh's own, fed fake specs; the decisions are pure.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { decideAll, flakyVerdict } from "../tools/operations/ci-flaky.mjs";
import { shouldRetry } from "../tools/operations/ci-retry.mjs";

const root = new URL("..", import.meta.url).pathname;
const src = readFileSync(join(root, "tests/run-all.sh"), "utf8");
const region = src.slice(src.indexOf("FAIL_RE='"), src.indexOf("\n}\n", src.indexOf("\nrun() {")) + 3);
const NOW = Date.parse("2026-11-15T12:00:00Z");
const entry = (spec) => ({ spec, test: "*", owner: "t", reason: "#1", added: "2026-11-14", expires: "2026-11-20" });

// fake spec: fails its first `failN` runs (counter file), then passes. calls = [[name, failN], ...] run in one lane process.
function lane(calls, jailed = []) {
  const dir = mkdtempSync(join(tmpdir(), "flaky-"));
  const jail = join(dir, "jail.json"); writeFileSync(jail, JSON.stringify(jailed.map(entry)));
  const body = calls.map(([n, k]) => `run ${n} bash -c 'c=${dir}/${n}.n; i=$(cat $c 2>/dev/null || echo 0); echo $((i+1)) >$c; [ $i -ge ${k} ] || { echo "FAIL inner"; exit 1; }'`).join("\n");
  const r = spawnSync("bash", ["-c", `set -uo pipefail; export EPOCHREALTIME; TMP="$(mktemp -d)"; fails=0\n${region}\n${body}\nexit $fails`],
    { cwd: root, encoding: "utf8", env: { ...process.env, FLAKY_FILE: join(dir, "flaky.txt"), FLAKY_JAIL: jail } });
  const f = join(dir, "flaky.txt");
  return { out: r.stdout, status: r.status, flaky: existsSync(f) ? readFileSync(f, "utf8") : "" };
}

test("AC4.1 fails once then passes: FLAKY line, exit 0, flaky.txt holds the name (jailed)", () => {
  const r = lane([["alpha", 1]], ["alpha"]);
  assert.match(r.out, /^FLAKY alpha$/m); assert.equal(r.status, 0, r.out); assert.equal(r.flaky, "alpha\n");
});
test("AC4.1b flaky but not jailed: lane fails", () => {
  const r = lane([["alpha", 1]]);
  assert.match(r.out, /^FLAKY alpha$/m); assert.match(r.out, /^FAIL alpha [0-9.]+ s$/m); assert.equal(r.status, 1);
});
test("AC4.2 fails twice: FAIL, exit 1, not flaky", () => {
  const r = lane([["alpha", 2]], ["alpha"]);
  assert.match(r.out, /^FAIL alpha [0-9.]+ s$/m); assert.doesNotMatch(r.out, /FLAKY/); assert.equal(r.status, 1); assert.equal(r.flaky, "");
});
test("AC4.3 cap 2 retries per lane: the third failing spec is not retried", () => {
  const r = lane([["a", 1], ["b", 1], ["c", 1]], ["a", "b", "c"]);
  assert.match(r.out, /^FLAKY a$/m); assert.match(r.out, /^FLAKY b$/m);
  assert.match(r.out, /^FAIL c [0-9.]+ s$/m); assert.doesNotMatch(r.out, /FLAKY c/); assert.equal(r.status, 1);
});
test("flakyVerdict: an expired jail entry does not save a flaky spec", () => {
  assert.equal(flakyVerdict("x", [entry("x")], NOW).ok, true);
  assert.equal(flakyVerdict("x", [entry("x")], Date.parse("2026-11-21T00:00:00Z")).ok, false);
});

test("AC4.4 all decision: empty ok; jailed ok + warning; unjailed names X; missing file fails closed", () => {
  const jail = [entry("X")];
  assert.equal(decideAll({ blocks: [{ block: 1, flaky: [] }], jail, now: NOW }).ok, true);
  const j = decideAll({ blocks: [{ block: 1, flaky: ["X"] }], jail, now: NOW });
  assert.equal(j.ok, true); assert.match(j.warnings[0], /X/);
  const u = decideAll({ blocks: [{ block: 2, flaky: ["Y"] }], jail, now: NOW });
  assert.equal(u.ok, false); assert.match(u.reason, /Y/);
  const m = decideAll({ blocks: [{ block: 3, flaky: null }], jail, now: NOW });
  assert.equal(m.ok, false); assert.match(m.reason, /block 3/);
});

test("AC4.5 shouldRetry: false when the failed log holds FAIL <spec>, true for infra failures", () => {
  const run = { conclusion: "failure", run_attempt: 1 };
  assert.equal(shouldRetry(run, "2026-11-14T10:22:31.1234567Z lane 2: FAIL flow 39.6 s\n"), false);
  assert.equal(shouldRetry(run, "npm ERR! network\nError: Process completed with exit code 1.\n"), true);
  assert.equal(shouldRetry(run, ""), true);
  assert.equal(shouldRetry({ conclusion: "failure", run_attempt: 2 }, ""), false);
});
test("AC4.5 retry.yml still reruns failed jobs", () => {
  assert.match(readFileSync(join(root, ".github/workflows/retry.yml"), "utf8"), /rerun-failed-jobs/);
});
