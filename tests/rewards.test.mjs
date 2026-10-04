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

test("XP: real 9-12, True/False row 6-8, snack 3-5, peeked 2, second try 0", () => {
  for (let i = 0; i < 40; i++) {
    script = [0.5, 0.99]; const r = ok("R" + i); assert.ok(r.xp >= 9 && r.xp <= 12, r.xp);
    script = [0.5, 0.99]; const t = ok("T" + i, { tf: true }); assert.ok(t.xp >= 6 && t.xp <= 8, t.xp);
    script = [0.5, 0.99]; const s = ok("S" + i, { snack: true }); assert.ok(s.xp >= 3 && s.xp <= 5, s.xp);
    fresh();
  }
  assert.equal(ok("P", { peeked: true }).xp, 2);
  no("W"); assert.equal(R.answer({ code: "W", correct: true, firstTry: false }).xp, 0);
  assert.deepEqual([R.state().real, R.state().snacks], [2, 0]);
});

test("levels: 30, 70, 120, 180 XP", () => {
  script = [0, 0.99, 0, 0.99, 0, 0.99];               // 9 XP each, no drop
  for (const c of ["A", "B", "C"]) ok(c);
  assert.deepEqual([R.state().xp, R.state().level, R.state().next], [27, 1, 30]);
  script = [0, 0.99]; const r = ok("D");
  assert.equal(r.levelUp, true); assert.equal(r.burst, "levelup"); assert.equal(R.state().level, 2); assert.equal(R.state().next, 70);
});

test("drop roll: p by kind, the 3 s dwell, pity after 6 dry, rarity bands", () => {
  script = [0, 0.24]; assert.ok(ok("R1").drop);                         // p(real) = 0.25 + 0.05 streak: 0.24 drops
  fresh(); script = [0, 0.16]; assert.equal(ok("S1", { snack: true }).drop, null);   // p(snack) = 0.10 + 0.05 = 0.15
  fresh(); script = [0, 0.19]; assert.ok(ok("T1", { tf: true }).drop);  // p(T/F) = 0.15 + 0.05
  fresh(); script = [0, 0]; assert.equal(ok("D1", { dwellMs: 2999 }).drop, null);    // under 3 s never rolls
  fresh();
  for (let i = 0; i < 6; i++) { script = [0, 0.999]; assert.equal(ok("P" + i, { snack: true }).drop, null); }
  script = [0, 0.5]; assert.equal(ok("P6", { snack: true }).drop, "common");          // pity: no roll needed
  fresh(); script = [0, 0, 0.79]; assert.equal(ok("C").drop, "common");
  fresh(); script = [0, 0, 0.80]; assert.equal(ok("C").drop, "rare");
  fresh(); script = [0, 0, 0.97, 0]; const l = ok("C"); assert.equal(l.drop, "legend"); assert.ok(l.xp >= 59); assert.ok(R.LEGEND.includes(l.line));
});

test("a wrong answer: no roll, no XP, no toast, no burst; the streak halves once per question", () => {
  for (const c of ["A", "B", "C", "D"]) { script = [0, 0.999]; ok(c); }
  assert.equal(R.state().streak, 4);
  const w = no("E");
  assert.deepEqual([w.xp, w.drop, w.toast, w.burst, w.line], [0, null, false, null, null]);
  assert.equal(R.state().streak, 2);
  R.answer({ code: "E", correct: false, firstTry: false });
  assert.equal(R.state().streak, 2, "the second wrong try on E does not halve again");
});

test("a code pays once; state is per bank", () => {
  script = [0, 0.999]; assert.ok(ok("A").xp > 0);
  assert.equal(ok("A").xp, 0);
  const xp = R.state().xp;
  R.use("OTHER"); assert.equal(R.state().xp, 0);
  script = [0, 0.999]; assert.ok(ok("A").xp > 0);                       // another bank: its own A
  R.use("T" + (n - 1)); assert.equal(R.state().xp, xp);
});

test("burst cap: a second rare drop inside 60 s becomes a toast; a level up always bursts", () => {
  script = [0, 0, 0.9]; const a = ok("A"); assert.equal(a.burst, "bonus"); assert.equal(a.toast, false);
  script = [0, 0, 0.9]; const b = ok("B"); assert.equal(b.burst, null); assert.equal(b.toast, true);
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
