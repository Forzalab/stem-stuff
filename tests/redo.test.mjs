// redo.mjs: the redo state machine after a miss (DESIGN-v3 §3, §4, §5; Tony #25: recs 5 and 7).
import { test } from "node:test";
import assert from "node:assert/strict";
import { rNew, rEvent, rDue, B_GAP, BACKOFF } from "../redo.mjs";

const ev = (st, type, tpl = "Q7", more = {}) => rEvent(st, { type, tpl, ...more });

test("full path: miss -> repair -> twin a -> (wrong) alt -> twin a -> (wrong) solution -> later", () => {
  const st = rNew();
  assert.deepEqual(ev(st, "miss", "Q7", { b: false }), { do: "repair", open: "auto" });
  assert.deepEqual(ev(st, "ladder_done"), { do: "twin", which: "a" });
  assert.deepEqual(ev(st, "twin", "Q7", { ok: false }), { do: "alt", open: "auto" });
  assert.deepEqual(ev(st, "ladder_done"), { do: "twin", which: "a" });
  assert.deepEqual(ev(st, "twin", "Q7", { ok: false }), { do: "solution", later: true });
  assert.equal(st.t.Q7.phase, "later");
  assert.equal(st.t.Q7.conquered, false);
});

test("twin wrong twice never returns repair; a b twin miss gets one more ladder at most (never a third)", () => {
  const st = rNew();
  ev(st, "miss", "Q7", { b: true }); ev(st, "ladder_done");
  const acts = [ev(st, "twin", "Q7", { ok: false }), ev(st, "ladder_done"), ev(st, "twin", "Q7", { ok: false })];
  assert.ok(acts.every(a => a.do !== "repair"));
  assert.equal(acts[2].do, "solution");
  // a fresh template: a ok, then the b twin wrong -> a second ladder at most, then the solution
  ev(st, "miss", "Q8", { b: true }); ev(st, "ladder_done", "Q8"); ev(st, "twin", "Q8", { ok: true });
  for (let i = 0; i < B_GAP; i++) rEvent(st, { type: "shown" });
  assert.deepEqual(rDue(st), ["Q8"]);
  assert.equal(ev(st, "twin", "Q8", { ok: false }).do, "repair");
  ev(st, "ladder_done", "Q8");
  assert.equal(ev(st, "twin", "Q8", { ok: false }).do, "solution");
});

test("b twin queued at least B_GAP items later; conquered only after the solo b twin", () => {
  assert.ok(B_GAP >= 2);
  const st = rNew();
  ev(st, "miss", "Q7", { b: true }); ev(st, "ladder_done");
  assert.deepEqual(ev(st, "twin", "Q7", { ok: true }), { do: "queue", which: "b", gap: B_GAP });
  assert.equal(st.t.Q7.conquered, false);
  // rDue asks about the NEXT slot (like qPick): after B_GAP other items shown, the b twin may take the slot after them
  for (let i = 0; i < B_GAP; i++) { assert.deepEqual(rDue(st), [], "not before " + B_GAP + " other items"); rEvent(st, { type: "shown" }); }
  assert.deepEqual(rDue(st), ["Q7"]);
  assert.deepEqual(ev(st, "twin", "Q7", { ok: true }), { do: "conquered" });
  assert.equal(st.t.Q7.conquered, true);
  assert.deepEqual(rDue(st), []);
});

test("no b twin: repaired + solo a twin = conquered", () => {
  const st = rNew();
  ev(st, "miss", "Q7", { b: false }); ev(st, "ladder_done");
  assert.deepEqual(ev(st, "twin", "Q7", { ok: true }), { do: "conquered" });
  assert.equal(st.t.Q7.conquered, true);
});

/* the run is over solo-twin tries: the original miss must not reset it (every twin follows one, so the back-off could never
   trigger); a twin miss resets it, and that twin's alt ladder auto-opens again */
test("back-off: after BACKOFF solo-twin wins in a row the next ladder is an offer; a twin miss resets it", () => {
  assert.equal(BACKOFF, 2);
  const st = rNew();
  ev(st, "miss", "Q1", { b: false });
  ev(st, "ladder_done", "Q1"); ev(st, "twin", "Q1", { ok: true });
  assert.deepEqual(ev(st, "miss", "Q2", { b: false }), { do: "repair", open: "auto" });
  ev(st, "ladder_done", "Q2"); ev(st, "twin", "Q2", { ok: true });
  assert.equal(st.wins, 2);
  assert.deepEqual(ev(st, "miss", "Q3", { b: false }), { do: "repair", open: "offer" });
  assert.deepEqual(ev(st, "miss", "Q4", { b: false }), { do: "repair", open: "offer" });
  ev(st, "ladder_done", "Q3");
  assert.deepEqual(ev(st, "twin", "Q3", { ok: false }), { do: "alt", open: "auto" });
  assert.equal(st.wins, 0);
  assert.deepEqual(ev(st, "miss", "Q5", { b: false }), { do: "repair", open: "auto" });
});

test("pure: a JSON round trip of the state changes nothing; stray events are no-ops", () => {
  const st = rNew();
  ev(st, "miss", "Q7", { b: true }); ev(st, "ladder_done"); ev(st, "twin", "Q7", { ok: true });
  const copy = JSON.parse(JSON.stringify(st));
  assert.deepEqual(copy, st);
  assert.deepEqual(ev(copy, "twin", "Q9", { ok: true }), { do: "none" });
  assert.deepEqual(ev(copy, "ladder_done", "Q9"), { do: "none" });
});
