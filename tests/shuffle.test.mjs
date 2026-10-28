// shuffle.mjs: the seeded shuffle behind MC choices and the question order (design/NAV.md)
import test from "node:test";
import assert from "node:assert/strict";
import { shuffled, family, qNew, qPick, qShow, qAnswer, qMigrate, qLoad, qSave, qKey, GAPS, NEAR, PULL } from "../shuffle.mjs";

const codes = Array.from({ length: 50 }, (_, i) => "CSCI26_Q" + i);

test("same seed, same order; a permutation of the input", () => {
  const a = shuffled(codes, "abc"), b = shuffled(codes, "abc");
  assert.deepEqual(a, b);
  assert.deepEqual([...a].sort(), [...codes].sort());
  assert.notDeepEqual(a, codes);
});
test("a new seed gives a new order", () => {
  assert.notDeepEqual(shuffled(codes, "abc"), shuffled(codes, "abd"));
});
test("locked choices keep their slot", () => {
  const ch = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d", lock: true }, { id: "e" }];
  for (const s of ["x", "y", "z", "seed:CSCI26_A2B"]) assert.equal(shuffled(ch, s)[3].id, "d");
});
test("MC order is unchanged from the old inline app.js shuffle (pinned)", () => {
  const ch = ["a", "b", "c", "d", "e"].map(id => ({ id }));
  assert.deepEqual(shuffled(ch, "stem:CSCI26_N2A").map(c => c.id).join(""), PIN);
});
const PIN = "bceda";   // computed with the pre-move app.js function

test("family = prefix + first suffix letter", () => {
  assert.equal(family("CSCI26_C2A"), "CSCI26_C");
  assert.equal(family("CALC1_T6B"), "CALC1_T");
});

/* ---------- the queue (design/plans/QUEUE.md) ---------- */
const bank = (n, topics = "ABCDEFGH") => Array.from({ length: n }, (_, i) => `PHYS_${topics[i % topics.length]}${i}`);
/* play k slots: answer(code, slot, st) -> true (right) | false (wrong) | null (skip) | [first, ...retries]. Returns the codes played. */
function play(st, pool, k, answer = () => true, topicOf = family) {
  const out = [];
  for (let i = 0; i < k; i++) {
    const p = qPick(st, pool, topicOf);
    qShow(st, p.code);
    out.push(p);
    const a = answer(p.code, st.pos, st, p);
    for (const r of [a].flat()) if (r != null) qAnswer(st, p.code, r);
  }
  return out;
}
const slotsOf = (picks, code) => picks.map((p, i) => p.code === code ? i + 1 : 0).filter(Boolean);
function noRepeatWithin(picks, near) {
  for (let i = 0; i < picks.length; i++) for (let j = i + 1; j <= i + near && j < picks.length; j++)
    assert.notEqual(picks[i].code, picks[j].code, `repeat within ${near} at slots ${i + 1} and ${j + 1}`);
}

test("queue: gaps 3, then 8, then 20 other questions, and 20 again after that", () => {
  const pool = bank(40), st = qNew("g");
  let target = null;
  const picks = play(st, pool, 80, (c, slot) => { if (slot === 1) target = c; return c !== target; });
  const s = slotsOf(picks, target);
  assert.deepEqual(s.slice(0, 5), [1, 5, 14, 35, 56]);           // 3, 8, 20, 20 others in between
  assert.ok(picks.filter(p => p.code === target).slice(1).every(p => p.redeem), "every comeback carries redeem");
  assert.equal(picks[0].redeem, false);
  assert.deepEqual(GAPS, [3, 8, 20]);
});
test("queue: wrong first pick, then retry right, still comes back after 3 (only the first pick counts)", () => {
  const pool = bank(30), st = qNew("r");
  let target = null;
  const picks = play(st, pool, 12, (c, slot) => { if (slot === 1) { target = c; return [false, true]; } return true; });
  assert.equal(slotsOf(picks, target)[1], 5);
  assert.equal(picks[4].redeem, true);
  assert.equal(st.seen[target].retryRight, 1, "the retry is logged");
  assert.equal(st.seen[target].right, 1, "the retry never counts as a right: only the comeback's first pick does");
  assert.equal(st.seen[target].miss, 1);
  // a right first pick then a stray second pick: nothing changes
  const s2 = qNew("r2"); qShow(s2, "PHYS_A0"); assert.equal(qAnswer(s2, "PHYS_A0", true), true); assert.equal(qAnswer(s2, "PHYS_A0", false), false);
  assert.equal(s2.seen.PHYS_A0.miss, 0); assert.equal(s2.seen.PHYS_A0.owe, false);
});
test("queue: two misses back to back never come back back to back (Tony Oct 19); each still waits at least 3", () => {
  const pool = bank(16), st = qNew("pair"), missed = [];
  const picks = play(st, pool, 14, (c, slot, s, p) => { if (slot <= 2) { missed.push(c); return false; } return true; });
  for (let i = 1; i < picks.length; i++) assert.ok(!(picks[i].redeem && picks[i - 1].redeem), `adjacent comebacks at slots ${i} and ${i + 1}`);
  const back = missed.map(c => slotsOf(picks, c)[1]);
  assert.ok(back.every(Boolean), "both come back");
  assert.ok(back[0] - 1 - 1 >= GAPS[0] && back[1] - 2 - 1 >= GAPS[0], `at least ${GAPS[0]} others: ${back}`);
  assert.ok(Math.abs(back[1] - back[0]) >= 2, `spread: ${back}`);
});
test("queue: only redos left -> they come in due order, back to back", () => {
  const pool = bank(16), st = qNew("onlyredo");
  /* every question shown: three misses at slots 1-3 (wait 14 < the cap 15, so a hold could apply; due 16, 17, 18), then 13 rights
     at slots 7-19 resting (capped at 15: due 23 and later), so at slot 20 nothing but the redos is ready */
  const owed = pool.slice(0, 3);
  pool.forEach((c, i) => { const o = i < 3; st.seen[c] = { n: 1, right: o ? 0 : 1, miss: o ? 1 : 0, last: o ? i + 1 : i + 4, wait: o ? 14 : 30, gapIdx: o ? 1 : 0, owe: o, first: o ? "wrong" : "right", redeem: false, retry: 0 }; });
  st.pos = 19;
  const picks = play(st, pool, 3, () => true);
  assert.deepEqual(picks.map(p => p.code), owed, "due order");
  assert.ok(picks.every(p => p.redeem));
});
test("queue: a 5-question bank caps each gap at n - 1 and never repeats within 3", () => {
  const pool = bank(5), st = qNew("five");
  let target = null;
  const picks = play(st, pool, 40, (c, slot) => { if (slot === 1) target = c; return c !== target; });
  noRepeatWithin(picks, 3);
  const s = slotsOf(picks, target), gaps = s.slice(1).map((x, i) => x - s[i] - 1);
  assert.ok(gaps.length >= 6, "the miss keeps coming back");
  assert.ok(gaps.every(g => g >= 3 && g <= 4), `gaps capped at n-1 = 4: ${gaps}`);
  for (const c of pool) assert.ok(picks.some(p => p.code === c), c + " never played");
});
test("queue: tiny banks (1, 2, 3 questions) always give a pick", () => {
  for (const n of [1, 2, 3]) {
    const pool = bank(n), st = qNew("t" + n), picks = play(st, pool, 12, () => false);
    assert.equal(picks.length, 12);
    noRepeatWithin(picks, Math.min(NEAR, n - 1));
  }
  assert.equal(qPick(qNew(), []), null);
});
test("queue: a single-topic bank plays every question once before any repeat (all right)", () => {
  const pool = bank(12, "A"), st = qNew("one");
  const picks = play(st, pool, 12, () => true);
  assert.deepEqual(picks.map(p => p.code).sort(), [...pool].sort());
});
test("queue: all-right streak = one full pass, no duplicates, then the oldest rights first", () => {
  const pool = bank(24), st = qNew("allright");
  const picks = play(st, pool, 30, () => true);
  assert.deepEqual(picks.slice(0, 24).map(p => p.code).sort(), [...pool].sort(), "no question lost or duplicated in a pass");
  assert.ok(picks.every(p => !p.redeem));
  noRepeatWithin(picks, 3);
});
test("queue: all-wrong streak = misses come back on their gaps, fresh questions still get through, no repeat within 3", () => {
  const pool = bank(24), st = qNew("allwrong");
  const picks = play(st, pool, 60, () => false);
  noRepeatWithin(picks, 3);
  assert.ok(new Set(picks.map(p => p.code)).size >= 8, "fresh questions keep coming");
  assert.equal(picks[4].code, picks[0].code, "the first miss is back after 3 others");
  assert.ok(picks.slice(4).some(p => p.redeem));
});
test("queue: every 4th slot pulls the least-seen topic", () => {
  // topic A: seen 3 times each, all right, long ago (ready, but low score); topic B: fresh (high score). Slots 1-3 go to B, slot 4 to A.
  const pool = [...bank(4, "A"), ...bank(8, "B")].map((c, i) => c.replace(/\d+$/, String(i)));
  const st = qNew("pull");
  for (const c of pool.filter(c => c.includes("_A"))) st.seen[c] = { n: 0, right: 6, miss: 0, last: null, wait: null, gapIdx: 0, owe: false, first: null, redeem: false, retry: 0 };
  for (const c of pool.filter(c => c.includes("_B"))) st.seen[c] = { n: 1, right: 0, miss: 0, last: -100, wait: 30, gapIdx: 0, owe: false, first: "right", redeem: false, retry: 0 };
  const picks = play(st, pool, 8, () => true);
  assert.deepEqual(picks.map(p => p.why).slice(0, 4), ["score", "score", "score", "topic"]);
  assert.ok(picks.slice(0, 3).every(p => p.code.includes("_B")), "the score alone picks B");
  assert.ok(picks[3].code.includes("_A"), "slot 4 pulls the least-seen topic A");
  assert.equal(picks[7].why, "topic");
  assert.equal(st.pos % PULL, 0);
});
test("queue: topic from the bank (topic/parent) beats the code fallback", () => {
  const pool = bank(8), topic = c => (+c.slice(6) < 4 ? "kinematics" : "energy"), st = qNew("tp");
  const picks = play(st, pool, 8, () => true, topic);
  const t = picks.map(p => topic(p.code));
  for (let k = 2; k <= 8; k += 2) assert.equal(t.slice(0, k).filter(x => x === "energy").length, k / 2, "the least-seen topic keeps them level: " + t);
});
test("queue: per-bank isolation (own key, own state)", () => {
  const mem = new Map(), store = { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  const a = qNew("a"), b = qNew("b");
  play(a, bank(10), 5, () => false);
  qSave("BANK_P2X", a, store); qSave("BANK_PSY6", b, store);
  assert.equal(qKey("BANK_P2X"), "stem-q-BANK_P2X");
  assert.equal(qLoad("BANK_PSY6", store).pos, 0);
  assert.equal(qLoad("BANK_P2X", store).pos, 5);
  assert.equal(qLoad("BANK_NOPE", store), null);
  mem.set("stem-q-BANK_X", "{broken"); assert.equal(qLoad("BANK_X", store), null);
});
test("queue: deterministic (same state, same picks) and the salt changes the tie order", () => {
  const pool = bank(30), ans = (c, slot) => slot % 3 !== 0;
  const x = play(qNew("same"), pool, 40, ans).map(p => p.code), y = play(qNew("same"), pool, 40, ans).map(p => p.code);
  assert.deepEqual(x, y);
  assert.notDeepEqual(play(qNew("other"), pool, 40, ans).map(p => p.code), x);
});
test("queue: resume = a JSON round trip mid-walk picks the same next questions", () => {
  const pool = bank(20), ans = (c, slot) => slot % 4 !== 1, st = qNew("res");
  play(st, pool, 9, ans);
  const copy = JSON.parse(JSON.stringify(st));
  assert.deepEqual(play(copy, pool, 15, ans).map(p => p.code), play(st, pool, 15, ans).map(p => p.code));
});
test("queue: migration keeps saved progress (rights rest, misses owe a Redeem after a warm-up)", () => {
  const pool = bank(12), st = qMigrate(qNew("mig"), pool, c => ({ PHYS_A0: { x: 0, done: "correct" }, PHYS_B1: { x: 1, done: "correct" }, PHYS_C2: { x: 2, done: "out" }, PHYS_D3: { x: 0, done: "open" } })[c] || null);
  assert.deepEqual(Object.keys(st.seen).sort(), ["PHYS_A0", "PHYS_B1", "PHYS_C2"]);
  const picks = play(st, pool, 12, () => true);
  assert.ok(!picks.slice(0, 3).some(p => ["PHYS_B1", "PHYS_C2"].includes(p.code)), "a warm-up first");
  assert.deepEqual([slotsOf(picks, "PHYS_B1")[0], slotsOf(picks, "PHYS_C2")[0]], [4, 8], "then the old misses, one per 4 slots, not back to back");
  assert.ok(picks[3].redeem && picks[7].redeem && picks[3].again, "as Redeems, graded fresh");
  assert.ok(!picks.some(p => p.code === "PHYS_A0"), "an old right rests far back");
});
test("queue: migration staggers many old misses (Fable fix 3)", () => {
  const pool = bank(40), st = qMigrate(qNew("stag"), pool, c => +c.slice(6) < 7 ? { x: 1, done: "out" } : null);
  const picks = play(st, pool, 30, () => true), back = picks.map((p, i) => p.redeem ? i + 1 : 0).filter(Boolean);
  assert.deepEqual(back, [4, 8, 12, 16, 20, 24, 28]);
});
test("queue: a 5-question bank answered all right: the 6th showing is a fresh round, never a closed card (Fable fix 1)", () => {
  const pool = bank(5), st = qNew("again"), picks = play(st, pool, 6, () => true);
  assert.ok(picks.slice(0, 5).every(p => !p.again), "the first pass is fresh");
  assert.equal(picks[5].again, true, "the 6th showing is a re-showing (nav.js grades it in a fresh round)");
  assert.equal(picks[5].redeem, false, "but owes nothing: no Redeem");
});
test("queue: a guess in under 2 s is logged, never weighted (Fable fix 4)", () => {
  const st = qNew("spam"); qShow(st, "PHYS_A0");
  assert.equal(qAnswer(st, "PHYS_A0", false, { spam: true }), false);
  const s = st.seen.PHYS_A0;
  assert.deepEqual([s.first, s.spam, s.miss, s.owe], ["spam", 1, 0, false]);
  assert.equal(qAnswer(st, "PHYS_A0", true), false, "a later pick in the same showing is a retry");
  assert.equal(s.right, 0);
});
test("queue: a fast RIGHT pick still counts, so a Redeem gets paid off (Fable #2 B0)", () => {
  const st = qNew("fastright"); qShow(st, "PHYS_A0");
  assert.equal(qAnswer(st, "PHYS_A0", false), true);                 // missed: owed
  assert.equal(st.seen.PHYS_A0.owe, true);
  st.seen.PHYS_A0.first = null; qShow(st, "PHYS_A0");                // it comes back (a Redeem showing)
  assert.equal(qAnswer(st, "PHYS_A0", true, { spam: true }), true);  // right in under 2 s
  const s = st.seen.PHYS_A0;
  assert.deepEqual([s.first, s.owe, s.right], ["right", false, 1]);
});
test("queue: a skipped showing (Next, no answer) comes back later, owing nothing", () => {
  const pool = bank(20), st = qNew("skip");
  let first = null;
  const picks = play(st, pool, 40, (c, slot) => { if (slot === 1) { first = c; return null; } return true; });
  const s = slotsOf(picks, first);
  assert.ok(s[1] >= 10, "at least 8 others in between, fresh questions first: " + s);
  assert.equal(picks[s[1] - 1].redeem, false);
});

test("glue: each snack right before its real, after any shuffle; a lost target leaves the snack in place", async () => {
  const { glue } = await import("../shuffle.mjs");
  const before = { PHYS_S1: "PHYS_R3", PHYS_S2: "PHYS_R3", PHYS_S3: "PHYS_R1", PHYS_S9: "PHYS_GONE" };
  const order = ["PHYS_R3", "PHYS_S3", "PHYS_R1", "PHYS_S9", "PHYS_S1", "PHYS_R2", "PHYS_S2"];
  assert.deepEqual(glue(order, c => before[c] || null), ["PHYS_S1", "PHYS_S2", "PHYS_R3", "PHYS_S3", "PHYS_R1", "PHYS_S9", "PHYS_R2"]);
  assert.deepEqual(glue(["PHYS_R1", "PHYS_R2"], () => null), ["PHYS_R1", "PHYS_R2"]);
  const big = shuffled([...Array(30).keys()].map(i => i % 3 ? "PHYS_R" + i : "PHYS_S" + i), "x");
  const g = glue(big, c => c.startsWith("PHYS_S") ? "PHYS_R" + (+c.slice(6) + 1) : null);
  for (const [i, c] of g.entries()) if (c.startsWith("PHYS_S")) assert.equal(g[i + 1], "PHYS_R" + (+c.slice(6) + 1));
});

test("dead-easy (T28) P2: a fresh queue opens with 1-2 of them, then nothing; a returner (a real first) gets none", async () => {
  const { deadOpen, qNew, qShow } = await import("../shuffle.mjs");
  const deads = ["PHYS_ZDA", "PHYS_ZDB", "PHYS_ZDC"], seen = new Set();
  for (const salt of ["a", "b", "c", "d", "e", "f", "g", "h"]) {
    const st = qNew(salt), run = [];
    for (let i = 0; i < 4; i++) { const d = deadOpen(st, deads); if (!d) break; run.push(d); qShow(st, d); st.hist.push({ c: d }); }
    assert.deepEqual(run, deads.slice(0, run.length), "in file order");
    assert.ok(run.length === 1 || run.length === 2, salt + ": " + run);
    seen.add(run.length);
  }
  assert.deepEqual([...seen].sort(), [1, 2], "both lengths occur across salts");
  const back = qNew("a"); qShow(back, "PHYS_R1"); back.hist.push({ c: "PHYS_R1" });
  assert.equal(deadOpen(back, deads), null);
  assert.equal(deadOpen(qNew("a"), []), null, "a bank with none opens as before");
});

test("dead-easy (T28) P1: before SOME snacks, same answer every time for one snack and salt; each dead-easy once", async () => {
  const { deadLead, qNew, qShow, DEAD_LEAD } = await import("../shuffle.mjs");
  const deads = ["PHYS_ZDA", "PHYS_ZDB"], st = qNew("s1");
  const hit = Array.from({ length: 200 }, (_, i) => deadLead(st, deads, "PHYS_S" + i) !== null);
  assert.deepEqual(hit, Array.from({ length: 200 }, (_, i) => deadLead(st, deads, "PHYS_S" + i) !== null), "deterministic");
  const k = hit.filter(Boolean).length;
  assert.ok(k > 200 * DEAD_LEAD / 100 - 40 && k < 200 * DEAD_LEAD / 100 + 40, "about " + DEAD_LEAD + "%, not every snack: " + k);
  const yes = "PHYS_S" + hit.indexOf(true);
  assert.equal(deadLead(st, deads, yes), "PHYS_ZDA");
  qShow(st, "PHYS_ZDA"); assert.equal(deadLead(st, deads, yes), "PHYS_ZDB");
  qShow(st, "PHYS_ZDB"); assert.equal(deadLead(st, deads, yes), null, "the pool is spent");
});

/* ramp (noob mode, DESIGN-v3 §2, Tony #25.6): the dead-easy opener, then tiers 1 -> 2 -> 3 behind a gate; a seen one comes back every REVIEW_EVERY */
const rampPool = ["PHYS_ZDA", ...[1, 2, 3].flatMap(t => Array.from({ length: 8 }, (_, i) => "PHYS_T" + t + String.fromCharCode(65 + i)))];
const tierOf = c => c.startsWith("PHYS_ZD") ? 0 : +c[6];
async function rampRun(salt, answers) {   // answers[i]: true / false = a graded first pick on slot i + 1, undefined = shown, not answered
  const { ramp, rampAnswer, qNew, qShow, qAnswer } = await import("../shuffle.mjs");
  const st = qNew(salt), run = [];
  for (let i = 0; i < answers.length; i++) {
    const p = ramp(st, rampPool, tierOf);
    qShow(st, p.code); st.hist.push({ c: p.code }); run.push(p);
    if (answers[i] !== undefined && qAnswer(st, p.code, answers[i])) rampAnswer(st, p.code, answers[i], tierOf);
  }
  return { st, run };
}
test("ramp: a fresh state opens on the dead-easy, then only tier-1 codes", async () => {
  const { run } = await rampRun("a", Array(8).fill(undefined));
  assert.equal(run[0].code, "PHYS_ZDA");
  for (const p of run.slice(1)) assert.equal(tierOf(p.code), 1, p.code);
});
test("ramp: 2 clean first picks -> the next is tier 2; 2 misses in a row -> back to tier 1 (floor 1, cap 3)", async () => {
  const up = await rampRun("a", [undefined, true, true, undefined]);
  assert.equal(up.st.ramp.tier, 2);
  assert.equal(tierOf(up.run[3].code), 1, "slot 4 is the first re-injection (a seen tier 1)");
  assert.equal(up.run[3].why, "review");
  const up5 = await rampRun("a", [undefined, true, true, undefined, undefined]);
  assert.equal(tierOf(up5.run[4].code), 2, "after 2 clean, the next new one is tier 2");
  const one = await rampRun("a", [undefined, true, undefined]);
  assert.equal(tierOf(one.run[2].code), 1, "one clean is not enough");
  const down = await rampRun("a", [undefined, true, true, false, false, undefined]);
  assert.equal(down.st.ramp.tier, 1, "2 misses in a row drop a tier");
  assert.equal(tierOf(down.run[5].code), 1);
  const floor = await rampRun("a", [undefined, false, false, undefined]);
  assert.equal(floor.st.ramp.tier, 1, "never below tier 1");
  const top = await rampRun("a", [undefined, true, true, true, true, true, true, true, true]);
  assert.equal(top.st.ramp.tier, 3, "never above tier 3");
});
test("ramp: 1st miss resets the clean count only; a 2nd miss IN A ROW drops a tier; a clean answer ends the run (PLAN §6.6)", async () => {
  const { rampAnswer } = await import("../shuffle.mjs");
  const st = { ramp: { tier: 2, clean: 1 } };   // an old saved queue: no miss key
  assert.equal(rampAnswer(st, "PHYS_T2A", false, tierOf), 2, "1st miss: tier stays");
  assert.equal(st.ramp.clean, 0, "1st miss: the clean count starts over");
  assert.equal(rampAnswer(st, "PHYS_T2B", false, tierOf), 1, "2nd miss in a row: down one");
  assert.equal(rampAnswer(st, "PHYS_T1A", false, tierOf), 1, "floor 1");
  const run = { ramp: { tier: 3, clean: 0 } };
  rampAnswer(run, "PHYS_T3A", false, tierOf); rampAnswer(run, "PHYS_T3B", true, tierOf);
  assert.equal(rampAnswer(run, "PHYS_T3C", false, tierOf), 3, "miss, clean, miss: the clean ended the run, no drop");
  assert.equal(rampAnswer(run, "PHYS_T3D", false, tierOf), 2, "then a 2nd in a row drops");
  assert.equal(rampAnswer(run, "PHYS_T2A", false, tierOf), 2, "the drop ends the run: a 3rd miss starts a new one");
  const dead = { ramp: { tier: 2, clean: 0, miss: 1 } };
  rampAnswer(dead, "PHYS_ZDA", false, tierOf);
  assert.deepEqual(dead.ramp, { tier: 2, clean: 0, miss: 1 }, "a dead-easy moves nothing");
  assert.equal(JSON.parse(JSON.stringify(run)).ramp.miss, 1, "the run rides in the saved queue");
});
test("ramp: from item 4, one seen code comes back every REVIEW_EVERY (slot 9 is a re-injection)", async () => {
  const { REVIEW_FROM, REVIEW_EVERY } = await import("../shuffle.mjs");
  assert.equal(REVIEW_FROM, 4); assert.equal(REVIEW_EVERY, 5);
  const { run } = await rampRun("a", Array(14).fill(true));
  const earlier = new Set(run.slice(0, 8).map(p => p.code));
  assert.ok(earlier.has(run[8].code), "slot 9 re-shows a seen code: " + run[8].code);
  assert.equal(run[8].why, "review");
  assert.notEqual(run[8].code, "PHYS_ZDA", "never the dead-easy opener");
  assert.notEqual(run[8].code, run[7].code, "never the one just shown");
  for (const [i, p] of run.entries()) if (![3, 8, 13].includes(i)) assert.notEqual(p.why, "review", "slot " + (i + 1));
});
test("ramp: skipAhead jumps a tier (cap 3)", async () => {
  const { ramp, skipAhead, qNew, qShow } = await import("../shuffle.mjs");
  const st = qNew("a"); qShow(st, ramp(st, rampPool, tierOf).code);
  skipAhead(st); assert.equal(tierOf(ramp(st, rampPool, tierOf).code), 2);
  skipAhead(st); assert.equal(tierOf(ramp(st, rampPool, tierOf).code), 3);
  skipAhead(st); assert.equal(st.ramp.tier, 3);
});
test("ramp: reload (same salt, JSON round trip) gives the same order", async () => {
  const { ramp } = await import("../shuffle.mjs");
  const ans = [undefined, true, false, true, true, undefined, true, true, false, true];
  const a = await rampRun("s9", ans), b = await rampRun("s9", ans);
  assert.deepEqual(a.run.map(p => p.code), b.run.map(p => p.code));
  const back = JSON.parse(JSON.stringify(a.st));
  assert.deepEqual(ramp(back, rampPool, tierOf), ramp(a.st, rampPool, tierOf));
  assert.notDeepEqual((await rampRun("other", ans)).run.map(p => p.code), a.run.map(p => p.code), "the salt changes the order");
});
test("ramp: no item at the current tier -> the nearest tier still serves; an empty pool -> null", async () => {
  const { ramp, qNew, qShow } = await import("../shuffle.mjs");
  const st = qNew("a"), pool = ["PHYS_T3A", "PHYS_T3B"], run = [];
  for (let i = 0; i < 5; i++) { const p = ramp(st, pool, tierOf); qShow(st, p.code); run.push(p.code); }
  assert.deepEqual([...run.slice(0, 2)].sort(), pool, "tier 3 only: still served, each once first");
  assert.equal(ramp(qNew("a"), [], tierOf), null);
});

/* ---------- the night-before mock (W103b; PLAN §6.9): 20 PE3 questions in exam order, one try each, then the misses ---------- */
const X = (code, title, more = {}) => ({ code, title, ...more });
/* today's BANK_P3X shape: no twin / parent_template / exam_q; the exam position is only in the title */
const titleBank = [
  X("PHYS_Q11", "Quiz 11 Q1: hoop pulley"),
  X("PHYS_T3", "X3 Q3 rectangle centre of gravity, practice"),
  X("PHYS_T1", "X3 Q1 rod on two strings, practice"),
  X("PHYS_W1", "X3 Q1 twin rod numbers"),
  X("PHYS_K1", "X3 Q1 twist rod tension"),
  X("PHYS_T2", "X3 Q2 rolling sphere, practice"),
  X("PHYS_C", "X3 Q10-11 floating concept check"),
  X("PHYS_T20", "X3 Q20 bulb ice to steam, practice"),
];
test("mockList, title fallback: the templates themselves, in exam order (X3 Qn), twins / twists / ranges / other items left out", async () => {
  const { mockList } = await import("../shuffle.mjs");
  assert.deepEqual(mockList(titleBank, "s"), ["PHYS_T1", "PHYS_T2", "PHYS_T3", "PHYS_T20"]);
});
/* the SCHEMA.md twin shape (twin a|b + parent_template), and exam_q preferred over the title */
const twinBank = [
  X("PHYS_T2", "rolling sphere", { exam_q: 2 }),
  X("PHYS_T1", "X3 Q9 says the title, exam_q wins", { exam_q: 1 }),
  X("PHYS_A1", "a", { twin: "a", parent_template: "PHYS_T1" }),
  X("PHYS_B1", "b", { twin: "b", parent_template: "PHYS_T1" }),
  X("PHYS_A2", "a", { twin: "a", parent_template: "PHYS_T2" }),
];
test("mockList, twin shape: exam_q orders; one twin of each template by hash(salt + n), stable for a salt; no twin -> the template", async () => {
  const { mockList } = await import("../shuffle.mjs");
  const a = mockList(twinBank, "s1");
  assert.equal(a.length, 2);
  assert.ok(["PHYS_A1", "PHYS_B1"].includes(a[0]), "Q1 plays a twin of its template");
  assert.equal(a[1], "PHYS_A2", "Q2 has one twin");
  assert.deepEqual(mockList(twinBank, "s1"), a, "a reload agrees");
  const picks = new Set(Array.from({ length: 40 }, (_, i) => mockList(twinBank, "s" + i)[0]));
  assert.deepEqual([...picks].sort(), ["PHYS_A1", "PHYS_B1"], "the salt picks a or b");
  assert.deepEqual(mockList([twinBank[0], twinBank[1]], "s1"), ["PHYS_T1", "PHYS_T2"], "no twins: the templates");
  assert.deepEqual(mockList([], "s"), []);
});
test("mockNext / mockAnswer: the list once in order, one graded first pick each, then the score and the misses in exam order, then done", async () => {
  const { mockNew, mockNext, mockAnswer, mockOn } = await import("../shuffle.mjs");
  const m = mockNew(["Q1", "Q2", "Q3", "Q4"]);
  const seen = [];
  for (const [c, ok] of [["Q1", true], ["Q2", false], ["Q3", null], ["Q4", true]]) {
    const n = mockNext(m);
    assert.deepEqual(n, { code: c, end: false });
    assert.equal(mockOn(m, c), true, "the mock phase: no hints on " + c);
    if (ok !== null) { assert.equal(mockAnswer(m, c, ok), true); assert.equal(mockAnswer(m, c, true), false, "only the first pick counts"); }
    seen.push(c);
  }
  assert.equal(mockAnswer(m, "ZZ", true), false, "not a mock question");
  const back = JSON.parse(JSON.stringify(m));                     // the saved queue round trip
  assert.deepEqual(mockNext(back), { code: "Q2", end: true, score: 2, of: 4 }, "the score line comes with the first miss");
  assert.equal(mockOn(back, "Q2"), false, "a miss comes back with the normal flow");
  assert.equal(mockAnswer(back, "Q2", true), false, "the replay is not scored");
  assert.deepEqual(mockNext(back), { code: "Q3", end: false }, "a skipped one is a miss");
  assert.equal(mockNext(back), null, "then the normal queue");
  assert.equal(back.done, true);
  const clean = mockNew(["Q1"]); mockNext(clean); mockAnswer(clean, "Q1", true);
  assert.deepEqual(mockNext(clean), { code: null, end: true, score: 1, of: 1 }, "no misses: the score, then the normal queue");
  assert.equal(mockNext(clean), null);
  assert.equal(mockOn(null, "Q1"), false);
});

/* ---------- families met (todo 103 MUST 1, PLAN §6.7; lifts Tony #32 "some students loop on one Q") ----------
   a family = one exam position (mockList's examQ); met after a clean (first pick right) twin; no twin in the bank yet -> a clean template */
const clean = (...cs) => Object.fromEntries(cs.map(c => [c, { n: 1, right: 1, miss: 0 }]));
const missed = (...cs) => Object.fromEntries(cs.map(c => [c, { n: 2, right: 0, miss: 2 }]));
test("familiesMet, today's title shape: a family with a title twin / twist needs a clean one of those; a twinless family, its template", async () => {
  const { familiesMet } = await import("../shuffle.mjs");
  assert.deepEqual(familiesMet(titleBank, {}), { met: 0, of: 4 }, "Q1 Q2 Q3 Q20; the range and the other quiz are no family");
  assert.deepEqual(familiesMet(titleBank, clean("PHYS_T2", "PHYS_T3", "PHYS_Q11", "PHYS_C")), { met: 2, of: 4 }, "twinless Q2 / Q3: the template");
  assert.deepEqual(familiesMet(titleBank, clean("PHYS_T1")), { met: 0, of: 4 }, "Q1 has a twin: its template alone is not enough");
  assert.deepEqual(familiesMet(titleBank, clean("PHYS_K1")), { met: 1, of: 4 }, "a clean twist meets Q1");
  assert.deepEqual(familiesMet(titleBank, { ...missed("PHYS_W1", "PHYS_T20"), ...clean("PHYS_T1") }), { met: 0, of: 4 }, "a missed twin / template meets nothing");
});
test("familiesMet, the SCHEMA twin shape: a twin's family is its template's exam_q; only a clean twin meets it; no families -> of 0", async () => {
  const { familiesMet } = await import("../shuffle.mjs");
  assert.deepEqual(familiesMet(twinBank, clean("PHYS_T1", "PHYS_T2")), { met: 0, of: 2 }, "both have twins: templates do not count");
  assert.deepEqual(familiesMet(twinBank, clean("PHYS_B1")), { met: 1, of: 2 }, "a clean b meets Q1");
  assert.deepEqual(familiesMet(twinBank, clean("PHYS_A1", "PHYS_B1", "PHYS_A2")), { met: 2, of: 2 }, "one per family, never more");
  assert.deepEqual(familiesMet([twinBank[0], twinBank[1]], clean("PHYS_T1")), { met: 1, of: 2 }, "no twins yet: the template");
  assert.deepEqual(familiesMet([X("CALC1_R01", "Practice Exam 2, Question 1"), X("CALC1_R02", "")], clean("CALC1_R01")), { met: 0, of: 0 }, "a non-family bank");
  assert.deepEqual(familiesMet([], {}), { met: 0, of: 0 });
});
