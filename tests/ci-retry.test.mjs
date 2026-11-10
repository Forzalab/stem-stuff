// RED (ticket 09, PR 4 / STEP B): the retry-once + attempt-colour logic, plus the ship-gate yellow
// rule. Fails today because tools/ci-retry.mjs does not exist yet — every import below errors until
// the coder writes the module with this exact surface:
//   export function attemptOf(run)      // run_attempt ?? attempt ?? 1  (normalized to a number)
//   export function attemptColor(run)   // "green" | "yellow" | "red"
//   export function shouldRetry(run)    // boolean (failure|timed_out on attempt 1 only)
// and tools/ci-gate.mjs pickGreen must exclude any run whose attemptColor !== "green".
// No network, no GitHub: every function is pure.
import { test } from "node:test";
import assert from "node:assert/strict";
import { attemptOf, attemptColor, shouldRetry } from "../tools/ci-retry.mjs";
import { pickGreen } from "../tools/ci-gate.mjs";

// --- attemptOf: read the attempt number, never assume 1 -----------------------------
// SOURCE of the two field names: the runs list API calls it `run_attempt` (ship.yml:71 reads it),
// while `gh run list --json attempt` (tools/batch.sh:177) calls it `attempt`. Both mean the same
// thing. attemptOf normalizes both; missing = first attempt.
test("attemptOf reads run_attempt or attempt, defaults to 1", () => {
  assert.equal(attemptOf({ run_attempt: 2 }), 2, "run_attempt (runs API) is the attempt");
  assert.equal(attemptOf({ attempt: 2 }), 2, "attempt (gh run list) is the attempt");
  assert.equal(attemptOf({}), 1, "missing attempt is a first attempt, never assumed otherwise");
  assert.equal(attemptOf({ run_attempt: 1, attempt: 9 }), 1,
    "INTENT: run_attempt wins over attempt (a literal-but-wrong `r.attempt ?? r.run_attempt` order would return 9 here)");
});

// --- attemptColor: green / yellow / red matches tools/batch.sh:184-186 -----------------
test("attemptColor: success on attempt 1 is green, success on attempt>=2 is yellow", () => {
  // SOURCE tools/batch.sh:184 `elif [ "$co" = success ] && [ "$at" -eq 1 ]; then state=green`
  assert.equal(attemptColor({ conclusion: "success", run_attempt: 1 }), "green");
  // SOURCE tools/batch.sh:185 `elif [ "$co" = success ]; then state=yellow` (attempt >= 2)
  assert.equal(attemptColor({ conclusion: "success", run_attempt: 2 }), "yellow");
  assert.equal(attemptColor({ conclusion: "success", attempt: 2 }), "yellow",
    "INTENT: the `attempt` field (batch.sh) and `run_attempt` (runs API) must both read yellow; a "
    + "literal-but-wrong port that only reads one field name would call this green");
});

test("attemptColor: anything not success is red (loop over all non-success conclusions)", () => {
  // SOURCE tools/batch.sh:186 `else state=red`. Loop over ALL non-success conclusions:
  for (const c of ["failure", "timed_out", "cancelled", "action_required", "neutral", "skipped", null, undefined]) {
    assert.equal(attemptColor({ conclusion: c, run_attempt: 1 }), "red",
      `conclusion ${String(c)} must be red, not green/yellow`);
  }
});

// --- shouldRetry: a failed run retries exactly once ----------------------------------
test("shouldRetry: failure or timed_out on attempt 1 retries; attempt >=2 never retries", () => {
  // SOURCE R4 (SPEC-PR3.md §4): retry ONCE. Loop over the two retryable conclusions:
  for (const c of ["failure", "timed_out"]) {
    assert.equal(shouldRetry({ conclusion: c, run_attempt: 1 }), true, `${c} on attempt 1 retries`);
    assert.equal(shouldRetry({ conclusion: c, run_attempt: 2 }), false, `${c} on attempt 2 does NOT retry again`);
    assert.equal(shouldRetry({ conclusion: c, attempt: 1 }), true,
      `INTENT: the batch.sh ` + "`attempt`" + ` field must also read (a literal-but-wrong port that only reads run_attempt returns false)`);
  }
});

test("shouldRetry: success and cancelled never retry (loop over the excluded set)", () => {
  // SOURCE: cancelled is deliberate (M5 never cancels, so a cancelled run is a manual decision);
  // success has nothing to retry. Loop over ALL excluded conclusions:
  for (const c of ["success", "cancelled", "action_required", "neutral", "skipped", null, undefined]) {
    assert.equal(shouldRetry({ conclusion: c, run_attempt: 1 }), false,
      `conclusion ${String(c)} must NOT retry`);
  }
});

// --- the ship gate refuses a yellow (attempt >= 2 is read, not assumed) -----------------
// STALE-STATE: a newer success that only happened on a rerun must not hide an older first-attempt
// green. pickGreen must READ run_attempt (not assume every success is attempt 1).
test("pickGreen: a yellow (success on attempt 2) is never the green anchor (STALE-STATE)", () => {
  const runs = [
    { head_branch: "main", head_sha: "oldgreen", conclusion: "success", event: "push", status: "completed", run_attempt: 1, created_at: "2026-11-07T00:00:00Z" },
    { head_branch: "main", head_sha: "yellow1", conclusion: "success", event: "push", status: "completed", run_attempt: 2, created_at: "2026-11-09T00:00:00Z" },
  ];
  const g = pickGreen(runs, "yellow1");
  assert.equal(g.sha, "oldgreen",
    "the attempt-2 success is yellow and must not win over the older attempt-1 green (ship refuses yellow, SPEC-PR3.md §6)");
  assert.equal(g.kind, "full");
});

test("pickGreen: a yellow run alone is not enough to ship (no green anchor)", () => {
  // INTENT: a literal-but-wrong pickGreen that only checks `conclusion === "success"` (ignores
  // run_attempt) would return this yellow as the anchor; the contract is attempt 1 only.
  const runs = [
    { head_branch: "main", head_sha: "yellow2", conclusion: "success", event: "push", status: "completed", run_attempt: 2, created_at: "2026-11-09T00:00:00Z" },
  ];
  assert.equal(pickGreen(runs, "yellow2"), null,
    "a run that only passed on a rerun must not anchor a ship");
});

test("pickGreen: a first-attempt success is still green (run_attempt 1 is not excluded)", () => {
  const runs = [
    { head_branch: "main", head_sha: "green1", conclusion: "success", event: "push", status: "completed", run_attempt: 1, created_at: "2026-11-09T00:00:00Z" },
  ];
  assert.deepEqual(pickGreen(runs, "green1"), { sha: "green1", kind: "full", created_at: "2026-11-09T00:00:00Z" },
    "attempt 1 stays a green anchor");
});
