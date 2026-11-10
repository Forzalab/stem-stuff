#!/usr/bin/env node
/* The fast-pipe decision for a PR push while a full run for that PR is in flight (ticket 09,
   PR 5 / M5): pure, no git, no network. The workflow computes `inFlight` (a queued/in_progress
   full tests.yml run for the same ref) and passes it in.
   Only (pull_request, inFlight=true) degrades to the fast pipe. A main push, a schedule run or a
   dispatch NEVER does: those are the full backstop the ship gate depends on (SPEC-PR3.md §6). */

export function decidePipe({ event, inFlight } = {}) {
  if (event === "pull_request" && inFlight === true) {
    return { pipe: "fast", reason: "a full run for this PR is in flight; run the fast pipe only" };
  }
  if (event === "pull_request") {
    return { pipe: "full", reason: "no full run in flight for this PR; run the full suite" };
  }
  return { pipe: "full", reason: `${event || "unknown"} always runs full; never degrade main/schedule/dispatch to fast` };
}
