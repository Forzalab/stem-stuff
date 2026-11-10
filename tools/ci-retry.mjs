#!/usr/bin/env node
/* The retry-once + attempt-colour logic (ticket 09, PR 4 / R4): pure, no git, no network.
   SOURCE of the colours: tools/batch.sh:184-186 (green = success on attempt 1; yellow = success on a
   later attempt; red = anything else). SOURCE of the retry rule: SPEC-PR3.md §4 (retry failure /
   timed_out exactly once: attempt 1 only, never cancelled).
   tools/ci-gate.mjs imports attemptColor so the ship gate refuses a yellow (a rerun pass). */

// The runs list API calls the attempt `run_attempt` (ship.yml:71); `gh run list --json attempt`
// (tools/batch.sh:177) calls it `attempt`. Both mean the same thing; a missing field is attempt 1.
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
export function shouldRetry(run) {
  const r = run || {};
  if (r.conclusion !== "failure" && r.conclusion !== "timed_out") return false;
  return attemptOf(r) === 1;
}
