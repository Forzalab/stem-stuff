// C3 auto-jail bot: smoke/sanity for decideJail on one fixed 22-run history + a fixed `now`.
// The rules themselves live in ci-gate.mjs (jailViolations); decideJail asserts its own output passes them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { decideJail } from "../tools/operations/ci-jail.mjs";
import { JAIL_MAX, JAIL_DAYS } from "../tools/operations/ci-gate.mjs";

const NOW = Date.parse("2026-11-16T12:00:00Z");
const HISTORY = JSON.parse(readFileSync(fileURLToPath(new URL("./fixtures/ci-jail-history.json", import.meta.url)), "utf8"));
const entry = (spec, added = "2026-11-15", expires = "2026-11-22") =>
  ({ spec, test: "*", owner: "tony", reason: "#1", added, expires });
const decide = (jail = []) => decideJail({ history: HISTORY, jail, now: NOW });

test("3 flakes in the newest 20 runs -> added with the newest run's url and a 7 day expiry", () => {
  const r = decide();
  assert.deepEqual(r.added, ["flow"]);
  assert.equal(r.next.length, 1);
  assert.deepEqual(r.next[0], {
    spec: "flow",
    test: "*",
    owner: "ci-jail bot",
    reason: "https://github.com/Forzalab/stem-stuff/actions/runs/1022 (3/20 flaky)",
    added: "2026-11-16",
    expires: "2026-11-23",
  });
  assert.equal(Date.parse(r.next[0].expires) - Date.parse(r.next[0].added), JAIL_DAYS * 864e5);
});

test("2 flakes in the newest 20 runs -> not added", () => {
  const r = decide();
  assert.ok(!r.added.includes("easy"), "easy flaked twice, below the threshold");
  assert.ok(!r.next.some((e) => e.spec === "easy"));
});

test("a live entry with 0 flakes in the newest 20 runs (22 runs of history) -> removed", () => {
  const r = decide([entry("cram-off")]);
  assert.ok(r.removed.includes("cram-off"), "cram-off only flaked in runs 21-22, outside the window");
  assert.ok(!r.next.some((e) => e.spec === "cram-off"));
});

test("a JAIL_NEVER spec (unittest) is never added, however much it flakes", () => {
  const r = decide();
  assert.ok(!r.added.includes("unittest"));
  assert.ok(!r.next.some((e) => e.spec === "unittest"));
  assert.ok(r.skipped.some((s) => s.spec === "unittest"), "unittest is reported as skipped");
});

test("cap: 5 live entries + 1 qualifying spec -> capHit, nothing added beyond the cap", () => {
  const jail = ["bank", "calc", "login", "repair", "swap"].map((s) => entry(s));
  const r = decide(jail);
  assert.equal(JAIL_MAX, 5);
  assert.equal(r.capHit, true);
  assert.deepEqual(r.added, []);
  assert.equal(r.next.length, 5, "never more than the cap");
  assert.ok(r.skipped.some((s) => s.spec === "flow" && /cap/.test(s.why)));
});

test("an expired entry less than 21 days old blocks a re-add", () => {
  const r = decide([entry("flow", "2026-11-01", "2026-11-08")]);
  assert.ok(!r.added.includes("flow"), "expired 7 days ago: inside the no-re-add window");
  assert.ok(r.skipped.some((s) => s.spec === "flow" && /no re-adding/.test(s.why)));
});
