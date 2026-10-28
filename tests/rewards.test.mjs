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
beforeEach(() => { script = []; mem.clear(); R.gap(); fresh(); });

test("inert until use(): no state, answer() pays nothing", () => {
  const src2 = readFileSync(new URL("../rewards/engine.js", import.meta.url), "utf8");
  const g = { localStorage: globalThis.localStorage };
  new Function("window", src2)(g);
  assert.equal(g.Rewards.on(), false);
  assert.equal(g.Rewards.answer({ code: "X", correct: true, firstTry: true }).xp, 0);
  assert.equal(g.Rewards.state(), null);
});

const one = (code, x, scr) => { fresh(); script = scr; return ok(code, x); };   // a fresh bank: no pity carried over

test("XP: real 14-18, True/False row 8-10, snack 6, peeked 2; second try 6 (snack 3); a wrong try +1", () => {
  for (let i = 0; i < 40; i++) {
    const r = one("R", {}, [i / 40, 0.99]); assert.ok(r.xp >= 14 && r.xp <= 18, r.xp);
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

test("levels (flow C, Oct 21): L2 = 80, L3 = 208, then each level costs 10 more (346, 494)", () => {
  script = [0, 0.99]; ok("A");                                         // 14 XP, no drop
  assert.deepEqual([R.state().xp, R.state().level, R.state().next], [14, 1, 80]);
  for (const c of ["B", "C", "D", "E"]) { script = [0]; ok(c, { dwellMs: 0 }); }   // 70 XP (under 1 s: no roll, so no pity drop)
  assert.equal(R.state().level, 1);
  script = [0]; const r = ok("F", { dwellMs: 0 });
  assert.equal(r.levelUp, true); assert.equal(r.burst, "levelup"); assert.equal(R.state().level, 2); assert.equal(R.state().next, 208);
  fresh(); mem.set("stem-rw:T" + (n - 1), JSON.stringify({ xp: 346, cv: 2 })); R.use("T" + (n - 1));
  assert.deepEqual([R.state().level, R.state().floor, R.state().next], [4, 346, 494]);
});

test("level 2 needs at least 5 first-try corrects (no drops), even at the top XP 18", () => {
  for (let i = 0; i < 4; i++) { script = [0.999]; const r = ok("M" + i, { dwellMs: 0 }); assert.equal(r.xp, 18); assert.equal(r.levelUp, false); }
  assert.equal(R.state().level, 1, "4 first-try corrects reached level 2");
  script = [0.999]; assert.equal(ok("M4", { dwellMs: 0 }).levelUp, true);
});

test("a save from the old curve keeps its level (never goes down), and levels on from the new curve", () => {
  mem.set("stem-rw:OLD", JSON.stringify({ xp: 60, streak: 2 }));       // old curve: level 3 (20, 50, 90)
  R.use("OLD");
  assert.deepEqual([R.state().level, R.state().xp, R.state().next], [3, 60, 346]);
  script = [0, 0.99]; const r = ok("A");
  assert.equal(r.levelUp, false); assert.equal(R.state().level, 3);
  assert.equal(JSON.parse(mem.get("stem-rw:OLD")).keep, 3, "the kept level is saved");
  mem.set("stem-rw:OLD2", JSON.stringify({ xp: 10 })); R.use("OLD2");
  assert.equal(R.state().level, 1);
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
  fresh(); for (const c of ["F", "F2", "F3", "F4", "F5"]) { script = [0]; ok(c, { dwellMs: 0 }); }   // 70 XP
  for (let i = 0; i < 9; i++) no("G" + i);                              // 79 XP
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
  script = [0, 0.9]; const b = ok("B", { snack: true, firstTry: false }); assert.equal(b.drop, "rare"); assert.equal(b.burst, null); assert.equal(b.toast, true);
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

test("T19: a revealed answer (out of tries, sugar) pays 0 XP, rolls nothing, stays a miss", () => {
  const xp0 = R.state().xp;
  const w = no("REV", { reveal: true });
  assert.deepEqual([w.xp, w.tick, w.drop, w.toast, w.burst, w.line, w.paid], [0, false, null, false, null, null, false], "no XP pill, no tier");
  assert.equal(R.state().xp, xp0, "the XP total does not move");
  assert.equal([...mem.values()].map(v => JSON.parse(v)).find(x => x && x.missed && x.missed.REV).missed.REV, 1, "still a miss: it comes back around");
  script = [0.999]; assert.ok(ok("REV").xp > 0, "the redo that is right still pays once");
});

test("dead-easy (T28): 3 XP right, +1 wrong (even revealed), once per code; no drop, burst, streak or hist; own counter", () => {
  script = [0, 0.999]; const a = ok("D1", { dead: true });                // a roll that would win a drop: none happens
  assert.deepEqual([a.xp, a.drop, a.burst, a.toast, a.streakNote, a.paid], [3, null, null, false, null, true]);
  const w = no("D2", { dead: true, reveal: true });                       // one try, then the T19 reveal: still "+1 for trying"
  assert.deepEqual([w.xp, w.tick, w.drop, w.burst], [1, true, null, null]);
  assert.equal(ok("D1", { dead: true }).xp, 0);                           // paid once
  const s = JSON.parse(mem.get("stem-rw:T" + (n - 1)));
  assert.deepEqual([s.hist, s.streak, s.lastBurst, s.snacks, s.real, s.dead, s.dry, s.xp], [[], 0, 0, 0, 0, 1, 0, 4]);
});

test("dead-easy (T28): a run of them never cruises skipSnack and never eats the burst cap", () => {
  for (let i = 0; i < 11; i++) ok("DE" + i, { dead: true });
  assert.equal(R.skipSnack(), false);
  script = [0, 0, 0.9]; assert.equal(ok("A").burst, "bonus");              // a real win right after: the cap is untouched
});

/* T22: a bank's burst_gap_s replaces the flat 15 s burst cap */
const realNow = Date.now;
const burstAt = (code, t) => { Date.now = () => t; script = [0, 0]; return ok(code, { snack: true }).burst; };   // a snack (6 XP: three stay under level 2) whose roll always wins a common drop
test("burst_gap_s (T22): absent = 15 s, as today", () => {
  try {
    assert.equal(R.gap(), 15000);
    assert.equal(burstAt("A", 1e9), "win");
    assert.equal(burstAt("B", 1e9 + 14000), null);                          // inside 15 s: capped (a toast)
    assert.equal(burstAt("C", 1e9 + 15000), "win");
  } finally { Date.now = realNow; }
});
test("burst_gap_s (T22): 60 caps at 60 s", () => {
  try {
    assert.equal(R.gap(60), 60000);
    assert.equal(burstAt("A", 1e9), "win");
    assert.equal(burstAt("B", 1e9 + 59000), null);
    assert.equal(burstAt("C", 1e9 + 60000), "win");
  } finally { Date.now = realNow; R.gap(); }
});
test("burst_gap_s (T22): invalid values are ignored (15 s)", () => {
  for (const v of [undefined, null, "60", 0, 59, 601, -5, NaN, Infinity, true, [], {}]) assert.equal(R.gap(v), 15000, String(v));
  assert.equal(R.gap(600), 600000);
  R.gap();
});
test("burst_gap_s (T22): dead-easy never touches lastBurst, whatever the gap", () => {
  R.gap(120);
  ok("D1", { dead: true }); no("D2", { dead: true });
  assert.equal(JSON.parse(mem.get("stem-rw:T" + (n - 1))).lastBurst, 0);
  R.gap();
});

/* Tony #36: one praise rotation (reusable), the common line "Duck approves. Rare." rotates through it; LINES[7] swapped */
test("praise: four Cluck lines, picked by Math.random; a common drop on LINES[3] says one of them", () => {
  assert.deepEqual(R.PRAISE, ["Cluck nods approvingly!", "Cluck gives a happy quack!", "Cluck is very proud!", "Cluck thinks that deserves a quack!"]);
  R.PRAISE.forEach((l, i) => { script = [(i + 0.5) / 4]; assert.equal(R.praise(), l); });
  assert.equal(R.LINES[7], "You nailed that one!");
  assert.ok(!R.LINES.includes("Duck approves. Rare."));
  const at = i => (i + 0.5) / R.LINES.length;                                   // the common line's index roll
  assert.ok(R.LINES.slice(0, 2).includes(one("C0", {}, [0, 0, 0.5, at(0), at(1)]).line));   // the last line is now 0 or 1 (earlier tests rolled at random), so 3 takes no re-roll
  assert.equal(one("C3", {}, [0, 0, 0.5, at(3), 0.9]).line, "Cluck thinks that deserves a quack!");
});

/* Tony #36: the 3-in-a-row note is his line; 5 and every 10 stay "N cracked" */
test("streak notes: 3 = Tony's line, 5 and 10 = N cracked, others none", () => {
  const notes = [];
  for (let i = 1; i <= 10; i++) { script = [0.99, 0.99]; notes.push(ok("S" + i).streakNote ?? null); }
  assert.deepEqual(notes, [null, null, "Baby a tripleeee, QUACKKKK", null, "5 eggs cracked! Enough for two omelettes.", null, null, null, null, "10 eggs cracked! Enough for two omelettes."]);
});

/* B4 conquered (DESIGN-v3 §5; Tony #1, #10, #25.5): repaired + solo `a` twin + solo `b` twin where one exists */
const M = (type, tpl, x = {}) => R.mastery({ type, tpl, ...x });
test("conquered: miss -> repair_done -> twin_a ok (no b) = conquered.Q7, 1/20, a short line with no topic name", () => {
  const m = M("miss", "Q7");
  assert.equal(m.note, "Let's give Q7 another whirl!");          // Tony #36
  assert.equal(m.miss, "Close call, let's retry next turn!");     // Tony #36
  assert.equal(M("repair_done", "Q7").conquered, false);
  const r = M("twin_a", "Q7", { ok: true });
  assert.deepEqual([r.conquered, r.newly, r.count, r.goal], [true, true, 1, 20]);
  assert.equal(r.line, "Q7 and variants conquered");
  assert.equal(R.conquered().Q7, true);
  assert.deepEqual([R.state().won, R.state().goal], [1, 20]);
  assert.equal(M("twin_a", "Q7", { ok: true }).newly, false, "pays its line once");
  R.use("T" + (n - 1)); assert.equal(R.conquered().Q7, true, "saved with the bank");
});
test("conquered: with a `b` twin pending, not yet; b solo right = conquered", () => {
  M("miss", "Q3", { b: true }); M("repair_done", "Q3");
  const r = M("twin_a", "Q3", { ok: true });
  assert.deepEqual([r.conquered, r.count, r.line], [false, 0, null]);
  assert.equal(R.conquered().Q3, undefined);
  assert.equal(M("twin_b", "Q3", { ok: true }).conquered, true);
});
test("conquered: a solo twin wrong resets (a new ladder, then that twin again)", () => {
  M("miss", "Q2"); M("repair_done", "Q2");
  assert.equal(M("twin_a", "Q2", { ok: false }).conquered, false);
  assert.equal(M("twin_a", "Q2", { ok: true }).conquered, false, "no fresh ladder: not repaired");
  M("repair_done", "Q2");
  assert.equal(M("twin_a", "Q2", { ok: true }).conquered, true);
  M("miss", "Q5", { b: true }); M("repair_done", "Q5"); M("twin_a", "Q5", { ok: true });
  M("twin_b", "Q5", { ok: false });
  assert.equal(M("twin_b", "Q5", { ok: true }).conquered, false);
  M("repair_done", "Q5");
  assert.equal(M("twin_b", "Q5", { ok: true }).conquered, true, "the `a` win stands after a `b` miss (redo.mjs: ladder, then b again)");
  assert.equal(R.state().won, 2);
});
test("conquered: twins without a miss + ladder never count; the goal follows config; inert before use()", () => {
  assert.equal(M("twin_a", "Q9", { ok: true }).conquered, false);
  M("miss", "Q9"); assert.equal(M("twin_a", "Q9", { ok: true }).conquered, false);
  R.config({ goal: 12 }); assert.equal(R.state().goal, 12); R.config({ goal: 20 });
  const g = { localStorage: globalThis.localStorage };
  new Function("window", src)(g);
  assert.equal(g.Rewards.mastery({ type: "miss", tpl: "Q1" }).conquered, false);
});

/* the stage line replaces "N/20 conquered" (Tony #32), in quarters (Tony #38, landmarks 25 / 50 / 75): p = done / total; p < 1/2 early,
   1/2 <= p < 3/4 halfway, 3/4 <= p < 1 late */
test("stage line: start, early, halfway, late, done, with the quarter edges at a goal of 20", () => {
  const at = { 0: "Ready when you are.", 1: "1 question done. Quack on!", 5: "5 questions done. Quack on!", 9: "9 questions done. Quack on!",
    10: "Halfway there!", 14: "Halfway there!", 15: "Only 5 to go, you got this!", 19: "Only 1 to go, you got this!", 20: "🎉 All done!", 21: "🎉 All done!" };
  for (const d in at) assert.equal(R.stage(+d, 20), at[d], "done " + d);
  assert.equal(R.stage(1, 3), "1 question done. Quack on!", "1/3 is still early (quarters, not thirds)");
  assert.equal(R.stage(2, 4), "Halfway there!", "exactly 1/2 is halfway");
  assert.equal(R.stage(3, 4), "Only 1 to go, you got this!", "exactly 3/4 is late");
  assert.deepEqual([0, 4, 5, 9, 10, 14, 15, 19, 20].map(d => R.landmark(d, 20)), [0, 0, 1, 1, 2, 2, 3, 3, 4], "landmarks 25 / 50 / 75 / 100");
  M("miss", "Q1"); M("repair_done", "Q1"); M("twin_a", "Q1", { ok: true });
  assert.equal(R.state().stage, "1 question done. Quack on!", "state() carries the line for the bar's own done count");
});

/* families met (todo 103 MUST 1, PLAN §6.7): nav.js hands the count (shuffle.mjs familiesMet) in; only a bank with families shows it */
test("families: the count rides in state(); a bank with no families (of 0) or none handed in -> null", () => {
  assert.equal(R.state().families, null, "nothing handed in");
  R.families({ met: 7, of: 20 });
  assert.deepEqual(R.state().families, { met: 7, of: 20 });
  R.families({ met: 0, of: 0 });
  assert.equal(R.state().families, null, "a non-family bank");
  R.families({ met: 1, of: 3 }); R.families(null);
  assert.equal(R.state().families, null);
});
