// AC11.1: ci-stats pure metrics over a runs list (no network). The CLI path with --file is covered by the smoke run in the PR.
import { test } from "node:test";
import assert from "node:assert/strict";
import { percentile, summarize, format } from "../tools/operations/ci-stats.mjs";

const T0 = Date.parse("2026-11-10T00:00:00Z");
const at = (min) => new Date(T0 + min * 60_000).toISOString();

test("percentile: nearest-rank, empty = null", () => {
  assert.equal(percentile([], 90), null);
  assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 90), 9);
  assert.equal(percentile([5], 50), 5);
});

test("summarize: main group wait p90 and run duration come from main push runs only", () => {
  const runs = [
    // main push: queued 0, started 2 min later, finished 12 min after start
    { event: "push", head_branch: "main", status: "completed", conclusion: "success", run_attempt: 1,
      created_at: at(0), run_started_at: at(2), updated_at: at(14) },
    { event: "push", head_branch: "main", status: "completed", conclusion: "failure", run_attempt: 2,
      created_at: at(100), run_started_at: at(110), updated_at: at(120) },
    // a PR run must not count as a main wait
    { event: "pull_request", head_branch: "feat", status: "completed", conclusion: "success", run_attempt: 1,
      created_at: at(0), run_started_at: at(30), updated_at: at(31) },
  ];
  const s = summarize(runs);
  assert.equal(s.runs, 3);
  assert.equal(s.main_pushes, 2);
  assert.equal(s.main_group_wait_p90_min, 10, "waits are 2 and 10 min; p90 of two = the larger");
  assert.equal(s.main_run_median_min, 10, "durations are 12 and 10; nearest-rank median of two = the lower");
  assert.equal(s.red_percent, 33.3, "1 failure of 3 completed runs");
  assert.equal(s.rerun_percent, 33.3, "1 of 3 runs is attempt 2 (proxy)");
});

test("summarize: no main runs -> null metrics, not zero", () => {
  const s = summarize([]);
  assert.equal(s.main_group_wait_p90_min, null);
  assert.equal(s.red_percent, null);
});

test("format: names what the runs JSON cannot carry instead of printing a fake number", () => {
  const out = format(summarize([]), 7);
  assert.match(out, /main group wait p90: n\/a/);
  assert.match(out, /jail size \(needs flaky\.txt\)/);
});
