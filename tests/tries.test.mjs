// app.js gradeLocal()/maxTries(): the in-browser twin of serve.py grade(). Pulled out of app.js and run here (no DOM needed).
// The table below is the same one as tests/test_serve.py test_max_tries_table.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { evaluate, compile } from "mathjs";

const src = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const cut = (a, b) => src.slice(src.indexOf(a), src.indexOf(b));
const code = `const MAX_TRIES = 2; const localState = new Map();
${cut("/* mirror of serve.py grade()", "/* ================= entry box")}
${cut("function shown(p) {", "/* One row of pills")}
return { maxTries, gradeLocal, shown };`;
const { maxTries, gradeLocal, shown } = new Function("math", code)({ compile, evaluate, number: Number });

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
