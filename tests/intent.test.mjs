// intent.js (Jev J1 + J2): the event-line log, the F / S2 / S5 / S7 rule counters, and "flag off = nothing happens".
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const SRC = readFileSync(new URL("../intent.js", import.meta.url), "utf8");

/* a fake browser: search = location.search, store = localStorage, tele = window.__stemTelemetry (or none) */
function load({ search = "", store = {}, tele } = {}) {
  const listeners = [], timers = [], calls = [];
  const win = {
    location: { search }, navigator: {}, URLSearchParams, performance: { now: () => 0 },
    localStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
    document: { hidden: false, addEventListener: t => listeners.push(t) },
    setInterval: f => timers.push(f),
    stemT: (n, p) => calls.push(n),
  };
  if (tele) win.__stemTelemetry = tele;
  win.window = win;
  vm.runInNewContext(SRC, win);
  return { win, store, listeners, timers, calls };
}
/* one session on a fake clock: s(x) moves the clock to x seconds */
function session(hist) {
  let t = 0;
  const j = load().win.__stemJev.create(() => t, hist);
  j.at = x => { t = x * 1000; return j; };
  const st = j.state; j.state = () => JSON.parse(JSON.stringify(st()));   // out of the vm realm, so deepEqual compares plain values
  return j;
}

test("flag off (default): stemT untouched, no listeners, no timer, no stemJev", () => {
  const { win, listeners, timers } = load();
  assert.equal(win.stemJev, undefined);
  assert.equal(listeners.length, 0);
  assert.equal(timers.length, 0);
  assert.ok(win.__stemJev.create);
});

test("?jev=1 turns it on and remembers it; ?jev=0 turns it off", () => {
  const on = load({ search: "?jev=1" });
  assert.equal(on.store["stem-jev"], "1");
  assert.equal(typeof on.win.stemJev, "function");
  assert.deepEqual(on.listeners.sort(), ["input", "keydown", "pointerdown", "visibilitychange", "wheel"]);
  on.win.stemT("q_open", { code: "A1" });
  assert.deepEqual(on.calls, ["q_open"], "the old stemT still runs");
  const off = load({ search: "?jev=0", store: { "stem-jev": "1" } });
  assert.equal(off.store["stem-jev"], undefined);
  assert.equal(off.win.stemJev, undefined);
});

test("stem-t-off / DNT keep it off even with the flag", () => {
  const tele = { optedOut: () => false, userOff: () => true };
  assert.equal(load({ store: { "stem-jev": "1" }, tele }).win.stemJev, undefined);
  assert.equal(load({ store: { "stem-jev": "1" }, tele: { optedOut: () => true, userOff: () => false } }).win.stemJev, undefined);
});

test("lines: +SS.s  kind  args, reset per item, capped at 40, no typed text", () => {
  const j = session();
  j.at(10).ev("q_open", { code: "P2X-14", type: "mc" });
  j.at(19.9).ev("pick", { choice: "B", verdict: "wrong", tries_left: 2 });
  assert.deepEqual(j.state().lines, ["+0.0  q_open  P2X-14 mc", "+9.9  pick  B wrong tries_left=2"]);
  for (let i = 0; i < 50; i++) j.at(30 + i * 6).input();
  assert.equal(j.state().lines.length, 40);
  j.at(500).ev("q_open", { code: "P2X-15", type: "mc" });
  assert.deepEqual(j.state().lines, ["+0.0  q_open  P2X-15 mc"]);
});

test("F: right, no wrong, < 80 s, no Cluck → run grows; a slow, wrong or helped item ends it", () => {
  const j = session();
  j.at(0).ev("q_open", { code: "A" }); j.at(20).ev("pick", { choice: "A", verdict: "correct" });
  j.at(30).ev("q_open", { code: "B" });
  assert.equal(j.state().flowRun, 1); assert.equal(j.state().last.state, "F");
  j.at(40).ev("pick", { choice: "C", verdict: "correct" });
  j.at(50).ev("q_open", { code: "C" });
  assert.equal(j.state().flowRun, 2); assert.equal(j.state().counts.F, 2);
  j.at(150).ev("pick", { choice: "D", verdict: "correct" });                     // 100 s: too slow
  j.at(160).ev("q_open", { code: "D" });
  assert.equal(j.state().flowRun, 0);
  j.at(165).ev("pick", { choice: "A", verdict: "wrong" }); j.at(200).ev("pick", { choice: "B", verdict: "correct" });
  j.at(210).ev("q_open", { code: "E" });
  assert.equal(j.state().flowRun, 0, "a wrong pick on the item");
  j.at(220).ev("cluck_open", { tab: "ask" }); j.at(230).ev("pick", { choice: "B", verdict: "correct" });
  j.at(240).ev("q_open", { code: "F" });
  assert.equal(j.state().flowRun, 0, "Cluck opened by hand");
  j.at(242).ev("cluck_open", { auto: true }); j.at(250).ev("pick", { choice: "B", verdict: "correct" });
  j.at(260).ev("q_open", { code: "G" });
  assert.equal(j.state().flowRun, 1, "the desktop auto-open is not help");
  j.at(270).ev("q_open", { code: "H" });
  assert.equal(j.state().flowRun, 0, "skipped with no pick");
});

test("F: the same item re-rendered is not a new item", () => {
  const j = session();
  j.at(0).ev("q_open", { code: "A" }); j.at(5).ev("pick", { choice: "A", verdict: "correct" });
  j.at(6).ev("q_open", { code: "A" });
  assert.equal(j.state().flowRun, 0);
  assert.equal(j.state().lines.length, 2);
});

test("S2: no input past 80 s (no history) → depth 1, then 2; input or a pick resets; hidden never counts", () => {
  const j = session();
  j.at(0).ev("q_open", { code: "A" });
  j.at(79).tick(); assert.equal(j.state().counts.S2, 0);
  j.at(81).tick(); assert.equal(j.state().last.why, "depth=1 p75=80s");
  j.at(90).tick(); assert.equal(j.state().counts.S2, 1, "once per depth");
  j.at(161).tick(); assert.equal(j.state().last.why, "depth=2 p75=80s");
  j.at(170).input();
  assert.ok(j.state().lines.includes("+170.0  pause  170s"));
  j.at(249).tick(); assert.equal(j.state().counts.S2, 2);
  j.at(251).tick(); assert.equal(j.state().counts.S2, 3);
  j.at(260).vis(true); j.at(900).tick(); assert.equal(j.state().counts.S2, 3, "hidden");
  j.at(901).vis(false); j.at(950).tick(); assert.equal(j.state().counts.S2, 3, "back = a fresh step");
  assert.equal(j.state().last.action, "hint_offer");
});

test("S2: p75 of this item's past steps once there are 4; picks feed the history (pick → pick, not input → pick)", () => {
  const { p75 } = load().win.__stemJev;
  assert.equal(p75([10, 20, 30]), 80);
  assert.equal(p75([10, 20, 30, 40]), 30);
  assert.equal(p75([40, 10, 30, 20, 50, 60, 70, 80]), 60);
  const hist = { A: [30, 10, 20, 20] };
  const j = session(hist);
  j.at(0).ev("q_open", { code: "A" });
  j.at(19).tick(); assert.equal(j.state().counts.S2, 0);
  j.at(21).tick(); assert.equal(j.state().last.why, "depth=1 p75=20s");
  j.at(29).input(); j.at(30).ev("pick", { choice: "B", verdict: "wrong" });
  assert.equal(hist.A.at(-1), 30);
  for (let i = 0; i < 30; i++) j.at(40 + i).ev("pick", { verdict: "wrong" });
  assert.equal(hist.A.length, 20, "capped");
});

test("S5: fast pick that repeats a choice, or 2 fast picks in a row; one fast pick alone is fine", () => {
  const j = session();
  j.at(0).ev("q_open", { code: "A" });
  j.at(3).ev("pick", { choice: "A", verdict: "wrong" });
  assert.equal(j.state().counts.S5, 0);
  j.at(9).ev("pick", { choice: "B", verdict: "wrong" });                          // 6 s after an error: fast x2
  assert.equal(j.state().last.why, "fast x2");
  j.at(30).ev("pick", { choice: "C", verdict: "wrong" });                         // slow: run resets
  j.at(35).ev("pick", { choice: "C", verdict: "wrong" });                         // fast + repeat
  assert.equal(j.state().last.why, "repeat C");
  assert.equal(j.state().counts.S5, 2);
  assert.equal(j.state().last.action, "slow_cue");
  j.at(60).ev("q_open", { code: "B" }); j.at(70).ev("pick", { choice: "A", verdict: "correct" });
  assert.equal(j.state().counts.S5, 2, "10 s after load, no error: not fast");
});

test("S7: Cluck opened by hand < 5 s after the item opened; auto and later opens don't count", () => {
  const j = session();
  j.at(0).ev("q_open", { code: "A" }); j.at(2).ev("cluck_open", { auto: true }); j.at(3).ev("cluck_open", { tab: "ask" });
  assert.equal(j.state().counts.S7, 1); assert.equal(j.state().last.action, "predict_first");
  j.at(10).ev("q_open", { code: "B" }); j.at(16).ev("cluck_open", { tab: "ask" });
  assert.equal(j.state().counts.S7, 1);
  assert.deepEqual(j.state().lines.slice(-1), ["+6.0  cluck  open ask"]);
});

test("pending verdicts and events before any q_open are ignored", () => {
  const j = session();
  j.at(1).ev("pick", { verdict: "correct" }); j.at(1).ev("cluck_open", {}); j.at(1).tick(); j.at(1).input();
  assert.deepEqual(j.state().counts, { F: 0, S2: 0, S5: 0, S7: 0 });
  j.at(2).ev("q_open", { code: "A" }); j.at(3).ev("pick", { verdict: "pending" });
  assert.equal(j.state().lines.length, 1);
});
