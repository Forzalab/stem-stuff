// progbar.mjs: notch bar state (topbar-v9 SPEC §2-§3): sets of 7, answered order, partial k/n, streak run 3+, carry.
import { test } from "node:test";
import assert from "node:assert/strict";
import { pbNew, pbSubmit, pbNext, pbView, pbLoad, pbKey, SET_SIZE } from "../client/pure_logic_modules/progbar.mjs";

const states = st => pbView(st).map(x => x.state + (x.streak ? "*" : ""));
const sub = (st, f, q, more = {}) => pbSubmit(st, { q, f, ...more });

test("fills in answered order, one notch per submit; first empty is 'next'", () => {
  const st = pbNew();
  assert.equal(SET_SIZE, 7);
  assert.deepEqual(states(st), ["next", "empty", "empty", "empty", "empty", "empty", "empty"]);
  sub(st, 1, "Q9"); sub(st, 0, "Q2");
  assert.deepEqual(states(st), ["right", "wrong", "next", "empty", "empty", "empty", "empty"]);
});

test("partial: fraction kept, and it breaks the streak", () => {
  const st = pbNew();
  sub(st, 1, "a"); sub(st, 1, "b"); sub(st, 1, "c");
  assert.deepEqual(states(st).slice(0, 3), ["right*", "right*", "right*"]);
  sub(st, 2 / 3, "d");
  assert.equal(pbView(st)[3].state, "partial");
  assert.equal(pbView(st)[3].f, 2 / 3);
  assert.deepEqual(states(st).slice(0, 4), ["right", "right", "right", "partial"]);
});

test("streak starts at the 3rd full right and lights the whole run", () => {
  const st = pbNew();
  sub(st, 1, "a"); sub(st, 1, "b");
  assert.deepEqual(states(st).slice(0, 2), ["right", "right"]);
  assert.equal(sub(st, 1, "c").streak, true);
  assert.deepEqual(states(st).slice(0, 3), ["right*", "right*", "right*"]);
  sub(st, 1, "d");
  assert.deepEqual(states(st).slice(0, 4), ["right*", "right*", "right*", "right*"]);
});

test("only the live run is lit: a wrong drops past streak to plain right; a new run starts over", () => {
  const st = pbNew();
  for (const q of "abc") sub(st, 1, q);
  sub(st, 0, "d");
  assert.deepEqual(states(st).slice(0, 4), ["right", "right", "right", "wrong"]);
  sub(st, 1, "e"); sub(st, 1, "f");
  assert.deepEqual(states(st).slice(0, 6), ["right", "right", "right", "wrong", "right", "right"]);
  sub(st, 1, "g");
  assert.deepEqual(states(st).slice(0, 7), ["right", "right", "right", "wrong", "right*", "right*", "right*"]);
});

test("set ends on the 7th notch; further submits ignored until pbNext; run carries into the next set", () => {
  const st = pbNew();
  let r;
  for (let i = 0; i < 7; i++) r = sub(st, 1, "q" + i);
  assert.equal(r.done, true);
  assert.equal(sub(st, 1, "x").index, -1);
  assert.equal(st.notches.length, 7);
  assert.deepEqual(states(st), Array(7).fill("right*"));
  pbNext(st);
  assert.equal(st.sets, 1);
  assert.deepEqual(states(st), ["next", ...Array(6).fill("empty")]);
  sub(st, 1, "y");
  assert.deepEqual(states(st)[0], "right*"); // carried: run is 8, first notch of the new set is already lit
  sub(st, 0, "z");
  assert.deepEqual(states(st).slice(0, 2), ["right", "wrong"]);
});

test("fewer than 7 left: set ends early (left = 0)", () => {
  const st = pbNew();
  assert.equal(sub(st, 1, "a").done, false);
  assert.equal(pbSubmit(st, { q: "b", f: 0 }, 0).done, true);
});

test("retry wrong -> right: notch flips to right, no streak credit, run untouched", () => {
  const st = pbNew();
  sub(st, 0, "a"); sub(st, 1, "b"); sub(st, 1, "c");
  sub(st, 1, "a", { retry: true });
  assert.equal(st.notches.length, 3);
  assert.deepEqual(states(st).slice(0, 3), ["right", "right", "right"]);
  assert.equal(st.run, 2);
  sub(st, 1, "d");
  assert.deepEqual(states(st).slice(0, 4), ["right", "right*", "right*", "right*"]);
});

test("retry of a question whose set is gone appends a plain right and does not break a live run", () => {
  const st = pbNew();
  sub(st, 1, "a"); sub(st, 1, "b");
  sub(st, 1, "old", { retry: true });
  sub(st, 1, "c");
  assert.deepEqual(states(st).slice(0, 4), ["right*", "right*", "right", "right*"]);
});

test("JSON round trip, tolerant load, key", () => {
  const st = pbNew();
  sub(st, 1, "a"); sub(st, 0.5, "b");
  assert.deepEqual(pbLoad(JSON.stringify(st)), st);
  assert.deepEqual(pbLoad("not json"), pbNew());
  assert.deepEqual(pbLoad(null), pbNew());
  assert.equal(pbKey("calc1"), "stem-pb:calc1");
});
