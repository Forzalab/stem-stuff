// app.js gradeLocal()/maxTries(): the in-browser twin of serve.py grade(). Pulled out of app.js and run here (no DOM needed).
// The table below is the same one as tests/test_serve.py test_max_tries_table.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as mathjs from "mathjs";
import { match as slipMatch, FAMILY_HINT } from "../slips.mjs";
const { evaluate, compile } = mathjs;
globalThis.math = mathjs;                                 // slips.mjs parses with the global math.js, as in the browser

const src = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const cut = (a, b) => src.slice(src.indexOf(a), src.indexOf(b));
const code = `const MAX_TRIES = 2; const localState = new Map(); let MODE = "sugar"; const modeOf = () => MODE;
${cut("/* mirror of serve.py grade()", "/* ================= entry box")}
${cut("function shown(p) {", "/* One row of pills")}
return { maxTries, gradeLocal, shown, tolOf, setMode: m => { MODE = m; } };`;
const { maxTries, gradeLocal, shown, tolOf, setMode } = new Function("math", "slipMatch", "FAMILY_HINT", code)({ compile, evaluate, number: Number }, slipMatch, FAMILY_HINT);

const mk = (type, n, extra = {}) => ({ type, code: `T_${type}${n}`, choices: Array.from({ length: n }, (_, i) => ({ id: "abcdefgh"[i], md: "x" })), correct: "a",
  wrong: Array.from({ length: n - 1 }, (_, i) => ({ choice: "abcdefgh"[i + 1], error: "misread", hint: "QUACK. Look again." })), ...extra });

test("maxTries: 2-choice mc = 1, everything else = 2 (same table as serve.py)", () => {
  const table = [[mk("mc", 2), 1], [mk("mc", 3), 2], [mk("mc", 5), 2], [mk("mc", 8), 2], [{ type: "num" }, 2], [{ type: "text" }, 2], [{ type: "expr" }, 2], [{ type: "multi" }, 2]];
  for (const [p, n] of table) assert.equal(maxTries(p), n, `${p.type} ${(p.choices || []).length}`);
});
test("2-choice mc locks after 1 wrong", () => {
  const p = mk("mc", 2, { code: "T_two" });
  const r = gradeLocal(p, { choice: "b" });
  assert.deepEqual([r.verdict, r.triesLeft], ["wrong", 0]);
  assert.equal(gradeLocal(p, { choice: "a" }).verdict, "locked");
});
test("3-choice mc locks after 2 wrong", () => {
  const p = mk("mc", 3, { code: "T_three" });
  assert.deepEqual([gradeLocal(p, { choice: "b" }).verdict, gradeLocal(p, { choice: "b" }).triesLeft], ["wrong", 1]);
  const r = gradeLocal(p, { choice: "c" });
  assert.deepEqual([r.verdict, r.triesLeft], ["wrong", 0]);
  assert.equal(gradeLocal(p, { choice: "a" }).verdict, "locked");
});
test("typed answers keep two tries; a right choice still grades right", () => {
  const n = { type: "num", code: "T_num", answer: "12", wrong: [] };
  assert.equal(gradeLocal(n, { answer: "1" }).triesLeft, 1);
  assert.equal(gradeLocal(n, { answer: "2" }).triesLeft, 0);
  assert.equal(gradeLocal(mk("mc", 2, { code: "T_ok" }), { choice: "a" }).verdict, "correct");
});

// multi: each part is graded alone (SCHEMA.md "Grading"); same cases as tests/test_serve.py test_multi_*
const multi = code => ({ type: "multi", code, nudge: "QUACK. Draw it.", parts: [
  { type: "num", answer: "14", wrong: [{ match: "17", error: "counting", hint: "QUACK. Twice." }] },
  { type: "num", answer: "11", wrong: [{ match: "14", error: "misread", hint: "QUACK. Exactly one." }] }] });
test("multi: a part is graded alone; a right part stays done", () => {
  const p = multi("T_m1");
  let r = gradeLocal(p, { part: 0, answer: "17" });
  assert.deepEqual([r.verdict, r.triesLeft, r.error, r.part, r.hint], ["wrong", 1, "counting", 0, "QUACK. Twice."]);
  assert.equal(gradeLocal(p, { part: 0, answer: "17.0" }).repeat, true);
  assert.equal(gradeLocal(p, { part: 1, answer: "11" }).verdict, "correct");
  assert.equal(gradeLocal(p, { part: 1, answer: "11" }).verdict, "locked");
  const a = gradeLocal(p, { part: 0, answer: "14" });
  assert.deepEqual([a.verdict, a.part], ["correct", 0]);
});
test("multi: one part locks by itself, the others keep their tries", () => {
  const p = multi("T_m2");
  assert.equal(gradeLocal(p, { part: 1, answer: "14" }).hint, "QUACK. Exactly one.");        // b's own entry
  const r = gradeLocal(p, { part: 1, answer: "10" });
  assert.deepEqual([r.verdict, r.triesLeft, r.part, r.hint, r.error], ["wrong", 0, 1, "QUACK. Draw it.", undefined]);   // nudge, not a's entry
  assert.equal(gradeLocal(p, { part: 1, answer: "11" }).verdict, "locked");
  const a = gradeLocal(p, { part: 0, answer: "14" });
  assert.deepEqual([a.verdict, a.triesLeft], ["correct", 2]);
});
test("multi: the whole-set body, a missing or bad part, and unreadable text are invalid (no try spent)", () => {
  const p = multi("T_m3");
  for (const b of [{ parts: ["14", "11"] }, { answer: "14" }, { part: 2, answer: "1" }, { part: -1, answer: "1" }, { part: "0", answer: "14" }, { part: 0.5, answer: "14" }])
    assert.equal(gradeLocal(p, b).verdict, "invalid", JSON.stringify(b));
  assert.equal(gradeLocal(p, { part: 0, answer: "x+" }).verdict, "invalid");
  assert.equal(gradeLocal(p, { part: 0, answer: "1" }).triesLeft, 1);
});

// mc pick all (design/CHOOSE-ALL.md §3): same cases as tests/test_serve.py pick-all tests
const pickAll = (code, extra = {}) => ({ type: "mc", pick: "all", code, correct: ["a", "c"], miss: "QUACK. Missing one.",
  choices: [{ id: "a", md: "A" }, { id: "b", md: "B" }, { id: "c", md: "C" }, { id: "d", md: "D" }, { id: "e", md: "None", lock: true }],
  wrong: ["b", "d", "e"].map(c => ({ choice: c, error: "misread", hint: `QUACK. ${c}` })), ...extra });
test("pick all: the set must match; any order", () => {
  assert.equal(maxTries(pickAll("T_a0")), 2);
  assert.equal(gradeLocal(pickAll("T_a1"), { choices: ["c", "a"] }).verdict, "correct");
});
test("pick all: unknown, duplicate, not an array, locked + another are invalid (no try spent); empty = none true, a real try", () => {
  const p = pickAll("T_a2");
  assert.equal(gradeLocal(pickAll("T_a2e"), { choices: [] }).error, "incomplete");   // design/EASY.md: nothing ticked is an answer
  for (const b of [{ choices: ["z"] }, { choices: ["a", "a"] }, { choices: "a" }, { choice: "a" }, { choices: ["e", "a"] }])
    assert.deepEqual(gradeLocal(p, b), { verdict: "invalid", triesLeft: 2 }, JSON.stringify(b));
  assert.equal(gradeLocal(p, { choices: ["e"] }).struck, "e");                 // "none" alone is a real (wrong) answer
});
test("pick all: the first ticked distractor in shown (authored) order strikes; none ticked = miss; a repeat is free", () => {
  const p = pickAll("T_a3");
  let r = gradeLocal(p, { choices: ["d", "a", "b"] });
  assert.deepEqual([r.verdict, r.triesLeft, r.error, r.hint, r.struck], ["wrong", 1, "misread", "QUACK. b", "b"]);
  r = gradeLocal(p, { choices: ["b", "d", "a"] });
  assert.deepEqual([r.repeat, r.triesLeft], [true, 1]);
  r = gradeLocal(p, { choices: ["a"] });
  assert.deepEqual([r.verdict, r.triesLeft, r.error, r.hint, r.struck], ["wrong", 0, "incomplete", "QUACK. Missing one.", undefined]);
  assert.equal(gradeLocal(p, { choices: ["a", "c"] }).verdict, "locked");
});
test("pick all: a false tick with no hint gets the some-taps-wrong line, nothing struck; all ticks right gets miss", () => {
  const p = pickAll("T_a3w", { wrong: [{ choice: "e", error: "misread", hint: "QUACK. e" }] });
  let r = gradeLocal(p, { choices: ["a", "b"] });
  assert.deepEqual([r.verdict, r.error, r.hint, r.struck], ["wrong", "incomplete", "QUACK. Some taps are wrong. Check each row again.", undefined]);
  r = gradeLocal(p, { choices: ["c"] });
  assert.deepEqual([r.verdict, r.error, r.hint, r.struck], ["wrong", "incomplete", "QUACK. Missing one.", undefined]);
});
test("pick all: shown() keeps every correct id and the locked ones from a pool of 8", () => {
  const p = pickAll("T_a4", { correct: ["g", "h"], choices: "abcdefgh".split("").map(id => ({ id, md: id, ...(id === "c" ? { lock: true } : {}) })) });
  assert.deepEqual(shown(p).map(c => c.id), ["a", "b", "c", "g", "h"]);
});

// typed numbers right to 3 significant figures (serve.py sig3; Tony, Oct 3): correctness only
test("num: 3 significant figures count as right", () => {
  for (const [t, v] of [["15.59", "correct"], ["15.588", "correct"], ["15.6", "correct"], ["15.55", "correct"], ["15.5", "correct"], ["15.2", "wrong"], ["15.95", "wrong"]])   // no tol: 2% (tolerance 1b)
    assert.equal(gradeLocal({ type: "num", code: `T_s4_${t}`, answer: "9*sqrt(3)" }, { answer: t }).verdict, v, t);
});

test("tolOf: question > bank > default, same cases as serve.py tol_of (tests/fixtures/tol-of.json)", () => {
  for (const [u, want] of JSON.parse(readFileSync(new URL("fixtures/tol-of.json", import.meta.url), "utf8"))) assert.equal(tolOf(u), want, JSON.stringify(u));
  assert.equal(gradeLocal({ type: "num", code: "T_bt_a", answer: "0.5", bank_tol: 0.01 }, { answer: "0.494" }).verdict, "wrong");   // 2% would pass it
  assert.equal(gradeLocal({ type: "num", code: "T_bt_b", answer: "0.5", bank_tol: 0.01 }, { answer: "0.496" }).verdict, "correct");
});

test("tolerance 1b: relative to the key, a zero key is absolute 1e-9 (PHYS_EX9: 0 was right for 0.00624)", () => {
  for (const [t, v] of [["0", "wrong"], ["0.006", "wrong"], ["0.0063", "correct"], ["0.00618", "correct"]])
    assert.equal(gradeLocal({ type: "num", code: `T_tol_${t}`, answer: "0.00624", tol: 0.01 }, { answer: t }).verdict, v, t);
  for (const [t, v] of [["0", "correct"], ["1e-10", "correct"], ["0.0003", "wrong"]])
    assert.equal(gradeLocal({ type: "num", code: `T_tz_${t}`, answer: "0.0", tol: 0.01 }, { answer: t }).verdict, v, t);
});

// pick all, prove mode (fix): every unlocked row not ticked carries a typed fix; a right set grades the fixes like parts
const prove = code => pickAll(code, { fix: { type: "num" }, wrong: [
  { choice: "b", error: "misread", hint: "QUACK. b", fix: { answer: "6", wrong: [{ match: "7", error: "arithmetic", hint: "QUACK. fix b" }] } },
  { choice: "d", error: "misread", hint: "QUACK. d", fix: { answer: "9*sqrt(3)" } },
  { choice: "e", error: "other", hint: "QUACK. e" }] });
test("prove: fixes must cover exactly the un-ticked unlocked rows (else invalid, no try)", () => {
  const p = prove("T_p1");
  for (const f of [undefined, {}, { b: "6" }, { b: "6", d: "" }, { b: "6", d: "1", e: "1" }, { b: "6", d: 1 }, ["6", "1"]])
    assert.deepEqual(gradeLocal(p, { choices: ["a", "c"], ...(f !== undefined ? { fixes: f } : {}) }), { verdict: "invalid", triesLeft: 2 }, JSON.stringify(f));
  assert.equal(gradeLocal(p, { choices: ["a", "c"], fixes: { b: "2+", d: "1" } }).verdict, "invalid", "unreadable fix on a right set");
});
test("prove: wrong set strikes first; a wrong fix names its row; repeat is free; 3 sig figs count", () => {
  const p = prove("T_p2");
  let r = gradeLocal(p, { choices: ["a", "b", "c"], fixes: { d: "2+" } });     // set wrong: the fixes are not graded
  assert.deepEqual([r.verdict, r.struck, r.triesLeft], ["wrong", "b", 1]);
  r = gradeLocal(p, { choices: ["a", "c"], fixes: { b: "7", d: "15.59" } });
  assert.deepEqual([r.verdict, r.fixWrong, r.error, r.hint, r.triesLeft], ["wrong", "b", "arithmetic", "QUACK. fix b", 0]);
  const q = prove("T_p3");
  r = gradeLocal(q, { choices: ["a", "c"], fixes: { b: "6", d: "15" } });
  assert.deepEqual([r.verdict, r.fixWrong, r.error, r.hint], ["wrong", "d", undefined, "QUACK. You found the false ones. One fix is wrong. Redo its math."]);
  assert.equal(gradeLocal(q, { choices: ["c", "a"], fixes: { d: "15.0", b: "6" } }).repeat, true);   // same values: a repeat
  assert.equal(gradeLocal(q, { choices: ["a", "c"], fixes: { b: "6.000", d: "15.588" } }).verdict, "correct");
});

test("T19: gradeLocal sends `correct` only once shut, and only in sugar (twin of serve.py answer_of)", () => {
  const p = mk("mc", 3, { code: "T_rev3" });
  assert.ok(!("correct" in gradeLocal(p, { choice: "b" })), "a try left: nothing");
  const r = gradeLocal(p, { choice: "c" });
  assert.deepEqual([r.verdict, r.triesLeft, r.correct], ["wrong", 0, "a"]);
  assert.equal(gradeLocal(p, { choice: "a" }).correct, "a", "locked later: still told");
  const n = { type: "num", code: "T_revn", answer: "2*1.01", wrong: [] };
  assert.ok(!("correct" in gradeLocal(n, { answer: "5" })));
  assert.equal(gradeLocal(n, { answer: "6" }).correct, "2.02");
  const big = { type: "num", code: "T_revb", answer: "1.07*10^14" };
  gradeLocal(big, { answer: "1" });
  assert.equal(gradeLocal(big, { answer: "2" }).correct, "1.07 × 10^14", "serve.py format(.4g) twin");
  setMode("diet");
  try {
    const d = mk("mc", 3, { code: "T_revd" });
    gradeLocal(d, { choice: "b" });
    const dr = gradeLocal(d, { choice: "c" });
    assert.ok(!("correct" in dr) && !("correct" in gradeLocal(d, { choice: "a" })), "diet never");
  } finally { setMode("sugar"); }
});

// slips v2 (design/HANDOFF-slips-v2.md unit C): uploaded banks match a slip of `form` after the author's wrong entries, before the nudge
const xzp = (extra = {}) => ({ type: "num", code: "PHYS_XZP", answer: "3/7", form: "1/((4/3)^2+(1/3)^2+(2/3)^2)", nudge: "QUACK. Nudge.", ...extra });
test("slips: PHYS_XZP typed 0.692 -> sign, with the family hint, in diet and sugar", () => {
  try {
    for (const m of ["diet", "sugar"]) {
      setMode(m);
      const r = gradeLocal(xzp({ code: `PHYS_XZP_${m}` }), { answer: "0.692" });
      assert.deepEqual([r.verdict, r.error, r.hint, r.triesLeft], ["wrong", "sign", FAMILY_HINT.sign, 1], m);
    }
  } finally { setMode("sugar"); }
});
test("slips: the author's wrong entry wins over a slip", () => {
  const r = gradeLocal(xzp({ code: "PHYS_XZP_w", wrong: [{ match: "0.692", error: "double", hint: "QUACK. Author." }] }), { answer: "0.692" });
  assert.deepEqual([r.error, r.hint], ["double", "QUACK. Author."]);
});
test("slips: no slip near the value -> the nudge; a unit without form grades as before", () => {
  const r = gradeLocal(xzp({ code: "PHYS_XZP_n" }), { answer: "123" });
  assert.deepEqual([r.verdict, r.error, r.hint], ["wrong", undefined, "QUACK. Nudge."]);
  const { form, ...bare } = xzp({ code: "PHYS_XZP_b" });
  const b = gradeLocal(bare, { answer: "0.692" });
  assert.deepEqual([b.verdict, b.error, b.hint], ["wrong", undefined, "QUACK. Nudge."]);
  assert.equal(gradeLocal(xzp({ code: "PHYS_XZP_c" }), { answer: "0.4286" }).verdict, "correct");
});
test("slips: an ignore_slips value gets the nudge, never a family hint (parity with serve.py _slip_table)", () => {
  const r = gradeLocal(xzp({ code: "PHYS_XZP_i", ignore_slips: ["9/17"] }), { answer: "0.5294" });
  assert.equal(r.verdict, "wrong");
  assert.equal(r.error, undefined);
  assert.equal(r.hint, "QUACK. Nudge.");
  assert.equal(gradeLocal(xzp({ code: "PHYS_XZP_j" }), { answer: "0.5294" }).error, "drop");
});
test("slips: a multi part with form gets its slip", () => {
  const p = { type: "multi", code: "T_slipm", parts: [{ type: "num", answer: "3", form: "10-(1+2+4)" }] };
  const r = gradeLocal(p, { part: 0, answer: "17" });
  assert.deepEqual([r.error, r.hint, r.part], ["sign", FAMILY_HINT.sign, 0]);
});
