#!/usr/bin/env node
/* The retry-once + attempt-colour logic (ticket 09, PR 4 / R4): pure, no git, no network.
   SOURCE of the colours: tools/operations/batch.sh:184-186 (green = success on attempt 1; yellow = success on a
   later attempt; red = anything else). SOURCE of the retry rule: SPEC-PR3.md §4 (retry failure /
   timed_out exactly once: attempt 1 only, never cancelled).
   tools/operations/ci-gate.mjs imports attemptColor so the ship gate refuses a yellow (a rerun pass). */

import { parseFailedSpecs } from "./ci-gate.mjs";   // same FAIL-line regex as ship.yml (an import cycle is fine: only called at run time)

// The runs list API calls the attempt `run_attempt` (ship.yml:71); `gh run list --json attempt`
// (tools/operations/batch.sh:177) calls it `attempt`. Both mean the same thing; a missing field is attempt 1.
export function attemptOf(run) {
  const r = run || {};
  const raw = r.run_attempt ?? r.attempt ?? 1;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

// success on attempt 1 = green; success on a later attempt = yellow; everything else = red.
export function attemptColor(run) {
  const r = run || {};
  if (r.conclusion !== "success") return "red";
  return attemptOf(r) === 1 ? "green" : "yellow";
}

// A failed run retries exactly once: failure / timed_out on attempt 1 only. Never cancelled.
// W4: test failures are retried in-job (run-all.sh run()), so this reruns INFRA failures only: when the failed jobs' log
// (failedLog) holds a `FAIL <spec>` line it was a test failure -> false. No FAIL line (runner died, npm ci, browser install) -> true.
// failedLog omitted = unknown, old behaviour.
export function shouldRetry(run, failedLog) {
  const r = run || {};
  if (r.conclusion !== "failure" && r.conclusion !== "timed_out") return false;
  if (failedLog != null && parseFailedSpecs(failedLog).length) return false;
  return attemptOf(r) === 1;
}
