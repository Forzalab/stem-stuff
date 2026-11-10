// RED (ticket 09, PR 5 / STEP C): the fast-pipe decision for a PR push while a full run for that
// PR is in-flight (M5). Fails today because tools/operations/ci-pipe.mjs does not exist yet — every import
// errors until the coder writes the module with this exact surface:
//   export function decidePipe({ event, inFlight })  // -> { pipe: "fast" | "full", reason }
// No network, no GitHub: decidePipe is pure; the workflow computes `inFlight` (a queued/in_progress
// full run for the same ref) and passes it in.
import { test } from "node:test";
import assert from "node:assert/strict";
import { decidePipe } from "../tools/operations/ci-pipe.mjs";

// --- M5: a PR push while a full run for that PR is in-flight -> fast only -----------------
test("decidePipe: pull_request + in-flight full run -> fast pipe only", () => {
  const d = decidePipe({ event: "pull_request", inFlight: true });
  assert.equal(d.pipe, "fast",
    "SOURCE M5 (SPEC-PR3.md §4): the new push runs fast only, never cancels/queues the in-flight full run");
  assert.ok(d.reason, "a decision must say why");
});

test("decidePipe: pull_request with no in-flight run -> full (loop over the non-in-flight case)", () => {
  const d = decidePipe({ event: "pull_request", inFlight: false });
  assert.equal(d.pipe, "full", "no in-flight run to defer to, so the PR runs the full suite");
});

test("decidePipe: push/schedule/dispatch never degrade to fast, even with a run in-flight (loop over all)", () => {
  // INTENT: a literal-but-wrong port that keys only on `inFlight` (ignores the event) would turn a
  // main push or a nightly run into a fast-only run, silently removing the full backstop the ship
  // gate depends on (SPEC-PR3.md §6). Main and schedule MUST stay full.
  for (const event of ["push", "schedule", "workflow_dispatch"]) {
    const d = decidePipe({ event, inFlight: true });
    assert.equal(d.pipe, "full",
      `event ${event} with in-flight must stay full (only pull_request degrades to fast)`);
  }
});

test("decidePipe: a pull_request fast decision is the ONLY path to fast", () => {
  // The full set of (event, inFlight) pairs: exactly one maps to fast.
  const cases = [
    { event: "pull_request", inFlight: true, want: "fast" },
    { event: "pull_request", inFlight: false, want: "full" },
    { event: "push", inFlight: true, want: "full" },
    { event: "push", inFlight: false, want: "full" },
    { event: "schedule", inFlight: true, want: "full" },
    { event: "workflow_dispatch", inFlight: true, want: "full" },
  ];
  for (const c of cases) {
    assert.equal(decidePipe({ event: c.event, inFlight: c.inFlight }).pipe, c.want,
      `decidePipe({event:${c.event}, inFlight:${c.inFlight}}).pipe must be ${c.want}`);
  }
});
