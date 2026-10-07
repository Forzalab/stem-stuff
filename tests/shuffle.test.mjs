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
  assert.ok(picks.slice(3, 5).every(p => p.redeem), "then the old misses, as Redeems");
  assert.ok(!picks.some(p => p.code === "PHYS_A0"), "an old right rests far back");
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
