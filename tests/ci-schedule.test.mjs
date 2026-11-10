// RED (ticket 09, PR 3 / STEP A): the nightly schedule + "batch/nightly is full, never affected"
// rules for the ship gate. Fails today because tools/operations/ci-gate.mjs runKind maps `schedule` to "unknown"
// (it must become "full"), and because the ship gate must treat a schedule run as a full run.
// No network, no GitHub: runKind/pickGreen are pure.
import { test } from "node:test";
import assert from "node:assert/strict";
import { runKind, pickGreen } from "../tools/ci-gate.mjs";

// --- runKind: schedule is a FULL run on main -----------------------------------------
// SOURCE R3 (SPEC-PR3.md §4): tests.yml gains `on: schedule`, and a schedule run is the full suite.
test("runKind: a schedule run is full (a nightly run is a full run on main)", () => {
  assert.equal(runKind({ event: "schedule" }), "full",
    "SOURCE tests.yml:3-7 gains `on: schedule`; the plan job treats a non-pull_request event as full (tests.yml:32,46-47). "
    + "A green nightly must be able to anchor a ship (SPEC-PR3.md §6).");
});

// --- A2: only pull_request is affected; push + schedule are full (loop over all events) ---
test("runKind: A2 scoping — push and schedule are full, pull_request is affected (loop over all)", () => {
  // SOURCE A2 (SPEC-PR3.md §4): the batch landing push and the nightly run are FULL; only a
  // pull_request run is affected-selected. Loop over ALL the relevant event kinds:
  const expect = [
    ["push", "full"],          // SOURCE ci-gate.mjs:36 main push is the full-suite backstop
    ["schedule", "full"],      // SOURCE this PR (R3): nightly is full
    ["pull_request", "affected"], // SOURCE ci-gate.mjs:37 PR2 affected selection, never a ship run
  ];
  for (const [event, kind] of expect) {
    assert.equal(runKind({ event }), kind, `event ${event} must map to ${kind}`);
  }
});

test("runKind: a dispatch with an explicit pipe is still fast/bench, never full", () => {
  // Guard: adding schedule must not disturb the existing dispatch classification (ci-gate.mjs:38-43).
  assert.equal(runKind({ event: "workflow_dispatch", inputs: { pipe: "fast" } }), "fast");
  assert.equal(runKind({ event: "workflow_dispatch", inputs: { mutant: "m" } }), "bench");
});

// --- pickGreen: a schedule run is a valid full-green anchor ---------------------------
test("pickGreen: a green schedule run on main is a full green anchor", () => {
  const runs = [
    { head_branch: "main", head_sha: "night1", conclusion: "success", event: "schedule", status: "completed", run_attempt: 1, created_at: "2026-11-09T09:30:00Z" },
  ];
  assert.deepEqual(pickGreen(runs, "night1"), { sha: "night1", kind: "full", created_at: "2026-11-09T09:30:00Z" },
    "a first-attempt green schedule run is a full green anchor (runKind(schedule) === full)");
});

// STALE-STATE: a nightly green on an OLDER sha must never clear a NEWER green (must-keep, §6).
test("pickGreen: a newer green never lets an older (nightly) green clear it (STALE-STATE)", () => {
  const runs = [
    { head_branch: "main", head_sha: "older", conclusion: "success", event: "schedule", status: "completed", run_attempt: 1, created_at: "2026-11-08T09:30:00Z" },
    { head_branch: "main", head_sha: "newer", conclusion: "success", event: "push", status: "completed", run_attempt: 1, created_at: "2026-11-09T10:00:00Z" },
  ];
  // candidate is the OLDER sha: the newer push green must still win (the older nightly must not clear it)
  assert.equal(pickGreen(runs, "older").sha, "newer",
    "the newest full green wins; an older nightly green must never clear a newer full green (SPEC-PR3.md §6 must-keep)");
  assert.equal(pickGreen(runs, "newer").sha, "newer");
});

// STALE-STATE: a newer FAILED schedule run must not hide an older green.
test("pickGreen: a newer failed schedule run does not mask the older green (STALE-STATE)", () => {
  const runs = [
    { head_branch: "main", head_sha: "oldgreen", conclusion: "success", event: "push", status: "completed", run_attempt: 1, created_at: "2026-11-08T00:00:00Z" },
    { head_branch: "main", head_sha: "nightfail", conclusion: "failure", event: "schedule", status: "completed", run_attempt: 1, created_at: "2026-11-09T09:30:00Z" },
  ];
  assert.equal(pickGreen(runs, "nightfail").sha, "oldgreen",
    "a newer failed nightly must not hide the older green (pickGreen sorts by created_at but only over success+attempt-1 runs, ci-gate.mjs:57-58)");
});
