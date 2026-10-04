// rewards/engine.js: XP, levels, drop roll, pity, streak, per-bank state, the fading original (design/REWARDS-WIRING.md).
// The engine is a plain script; it runs here on globalThis with a fake localStorage and a scripted Math.random.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../rewards/engine.js", import.meta.url), "utf8");
const mem = new Map();
globalThis.localStorage = { getItem: k => mem.has(k) ? mem.get(k) : null, setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k) };
new Function(src)();
const R = globalThis.Rewards;
const realRandom = Math.random;
let script = [];                                   // the next Math.random() values; empty = real random
Math.random = () => script.length ? script.shift() : realRandom();
const ok = (code, x = {}) => R.answer({ code, correct: true, firstTry: true, dwellMs: 5000, ...x });
const no = (code, x = {}) => R.answer({ code, correct: false, firstTry: true, dwellMs: 5000, ...x });
let n = 0;
const fresh = () => R.use("T" + n++);
beforeEach(() => { script = []; mem.clear(); fresh(); });

test("inert until use(): no state, answer() pays nothing", () => {
  const src2 = readFileSync(new URL("../rewards/engine.js", import.meta.url), "utf8");
  const g = { localStorage: globalThis.localStorage };
  new Function("window", src2)(g);
  assert.equal(g.Rewards.on(), false);
  assert.equal(g.Rewards.answer({ code: "X", correct: true, firstTry: true }).xp, 0);
  assert.equal(g.Rewards.state(), null);
});

const one = (code, x, scr) => { fresh(); script = scr; return ok(code, x); };   // a fresh bank: no pity carried over

test("XP: real 12-16, True/False row 8-10, snack 6, peeked 2; second try 6 (snack 3); a wrong try +1", () => {
  for (let i = 0; i < 40; i++) {
    const r = one("R", {}, [i / 40, 0.99]); assert.ok(r.xp >= 12 && r.xp <= 16, r.xp);
    const t = one("T", { tf: true }, [i / 40, 0.99]); assert.ok(t.xp >= 8 && t.xp <= 10, t.xp);
  }
  assert.equal(one("S", { snack: true }, [0.99]).xp, 6);
  assert.equal(one("P", { peeked: true }, [0.99]).xp, 2);
  fresh();
  assert.equal(no("W").xp, 1);
  script = [0.99]; assert.equal(R.answer({ code: "W", correct: true, firstTry: false, dwellMs: 5000 }).xp, 6);
  assert.equal(no("V", { snack: true }).xp, 1);
  script = [0.99]; assert.equal(R.answer({ code: "V", correct: true, firstTry: false, snack: true, dwellMs: 5000 }).xp, 3);
  assert.deepEqual([R.state().real, R.state().snacks], [1, 1]);
});

test("levels: 20, 50 XP (each level costs 10 more)", () => {
  script = [0, 0.99]; ok("A");                                         // 12 XP, no drop
  assert.deepEqual([R.state().xp, R.state().level, R.state().next], [12, 1, 20]);
  script = [0, 0.99]; const r = ok("B");
  assert.equal(r.levelUp, true); assert.equal(r.burst, "levelup"); assert.equal(R.state().level, 2); assert.equal(R.state().next, 50);
});

test("drop roll on every correct: p by kind, any try, the 1 s dwell, pity after 2 dry, rarity bands", () => {
  assert.ok(one("R1", {}, [0, 0.59]).drop); assert.equal(one("R2", {}, [0, 0.61]).drop, null);              // p(real) = 0.6
  assert.ok(one("S1", { snack: true }, [0.44]).drop); assert.equal(one("S2", { snack: true }, [0.46]).drop, null);   // 0.45
  assert.ok(one("T1", { tf: true }, [0, 0.49]).drop); assert.equal(one("T2", { tf: true }, [0, 0.51]).drop, null);   // 0.5
  assert.equal(one("D1", { dwellMs: 999 }, [0, 0]).drop, null);                                            // under 1 s never rolls
  fresh(); no("X"); script = [0.59];
  assert.ok(R.answer({ code: "X", correct: true, firstTry: false, dwellMs: 5000 }).drop, "a second-try correct rolls too");
  fresh();
  for (let i = 0; i < 2; i++) { script = [0.999]; assert.equal(ok("P" + i, { snack: true }).drop, null); }
  script = [0.5]; assert.equal(ok("P2", { snack: true }).drop, "common");                                  // pity: no roll needed
  assert.equal(one("C", {}, [0, 0, 0.69]).drop, "common");
  assert.equal(one("C", {}, [0, 0, 0.70]).drop, "rare");
  assert.equal(one("C", {}, [0, 0, 0.94]).drop, "rare");
  const l = one("C", {}, [0, 0, 0.95, 0]); assert.equal(l.drop, "legend"); assert.ok(l.xp >= 62); assert.ok(R.LEGEND.includes(l.line));
});

test("a wrong try: +1 for trying, no roll, no toast, no burst; the streak waits", () => {
  for (const c of ["A", "B", "C", "D"]) { script = [0]; ok(c, { dwellMs: 0 }); }
  assert.equal(R.state().streak, 4);
  const w = no("E");
  assert.deepEqual([w.xp, w.tick, w.drop, w.toast, w.burst, w.line], [1, true, null, false, null, null]);
  assert.equal(R.state().streak, 4);
  R.answer({ code: "E", correct: false, firstTry: false });
  assert.equal(R.state().streak, 4, "a second wrong try on E does not touch it");
  fresh(); script = [0]; ok("F", { dwellMs: 0 });                       // 12 XP
  for (let i = 0; i < 7; i++) no("G" + i);                              // 19 XP
  const q = no("H");
  assert.deepEqual([q.levelUp, q.burst], [true, null], "a level reached by a +1 stays quiet");
});

test("a code pays once; state is per bank", () => {
  script = [0, 0.999]; assert.ok(ok("A").xp > 0);
  assert.equal(ok("A").xp, 0);
  const xp = R.state().xp;
  R.use("OTHER"); assert.equal(R.state().xp, 0);
  script = [0, 0.999]; assert.ok(ok("A").xp > 0);                       // another bank: its own A
  R.use("T" + (n - 1)); assert.equal(R.state().xp, xp);
});

test("burst cap 15 s: a second drop inside it becomes a toast; a common drop bursts as WIN", () => {
  script = [0, 0, 0.9]; const a = ok("A"); assert.equal(a.burst, "bonus"); assert.equal(a.toast, false);
  script = [0, 0.9]; const b = ok("B", { snack: true }); assert.equal(b.drop, "rare"); assert.equal(b.burst, null); assert.equal(b.toast, true);
  const c = one("C", {}, [0, 0, 0.5]); assert.equal(c.drop, "common"); assert.equal(c.burst, "win"); assert.equal(c.toast, false);
});

test("skipSnack: only after 10 first tries above 90% right", () => {
  for (let i = 0; i < 9; i++) { script = [0, 0.999]; ok("A" + i); }
  assert.equal(R.skipSnack(), false);
  script = [0, 0.999]; ok("A9");
  assert.equal(R.skipSnack(), true);
  no("B"); assert.equal(R.skipSnack(), false);                          // 9 of 10 = 90%, not above
});

test("the fading original: full, then the last line hidden, folded after a first-try correct", () => {
  assert.equal(R.origLevel(5, "S1"), 1);
  R.origSeen(5, "S1");
  assert.equal(R.origLevel(5, "S1"), 1, "the same snack again keeps its level");
  assert.equal(R.origLevel(5, "S2"), 2);
  R.origSeen(5, "S2"); R.origSolved(5);
  assert.equal(R.origLevel(5, "S2"), 3);
  assert.equal(R.origLevel(6, "S9"), 1);
});
