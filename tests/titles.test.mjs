// titles.mjs: isSlugTitle / cardTitle smoke. A slug or no title shows no big title; a human title (with $math$) stays.
// TITLE-EXAMQ: "Q1 · " (the real practice-exam question number) is a student-facing prefix: kept by cardTitle, and the
// rest of the title is judged on the old rules; schema-check strips it before the author-code and word checks, while the
// schema's 60-char cap stays on the whole title string, prefix included.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { isSlugTitle, cardTitle, titleCodes, examPrefix, EXAMQ_PREFIX } from "../client/pure_logic_modules/titles.mjs";

test("slugs and missing titles are slug-like", () => {
  for (const t of ["X3 Q4 twin rectangle Ix Iy Iz", "ch7_card_1", "", "  ", undefined, null, "Q4"]) assert.equal(isSlugTitle(t, "PHYS_ABC"), true, String(t));
  assert.equal(isSlugTitle("Phys abc", "PHYS_ABC"), true, "the code in words");
});
test("human titles stay", () => {
  for (const t of ["Rectangle: $I_x, I_y, I_z$", "Ferris wheel: halfway point", "Q11 Q1(a): net torque about the axle", "Two routes", "MST: which are true"]) assert.equal(isSlugTitle(t, "PHYS_ABC"), false, t);
});
test("cardTitle: the trimmed title or empty", () => {
  assert.equal(cardTitle("  Rectangle:  $I_x$ ", "A_B"), "Rectangle: $I_x$");
  assert.equal(cardTitle("X3 Q4 twin rectangle Ix Iy Iz", "A_B"), "");
});
test("no author code in a shown title", () => {
  assert.equal(cardTitle("Q11 Q1(a): net torque about the axle", "A_B"), "Net torque about the axle");
  assert.equal(cardTitle("HW11 #8: beads on a rod", "A_B"), "Beads on a rod");
  assert.equal(cardTitle("Net torque (Q4)", "A_B"), "");
  assert.deepEqual(titleCodes("Find $v_0$ for CO2 at t2 with H2O"), []);
  assert.deepEqual(titleCodes("X3 Q4 twin"), ["X3", "Q4"]);
});

// TITLE-EXAMQ: the one prefix shape: Q + 1..99 (no leading zero) + space + U+00B7 + space.
test("examPrefix: only Q1..Q99, space, middle dot, space", () => {
  assert.deepEqual(examPrefix("Q1 · First law"), { prefix: "Q1 · ", rest: "First law" });
  assert.deepEqual(examPrefix("Q99 · X"), { prefix: "Q99 · ", rest: "X" });
  for (const t of ["Q0 · x", "Q01 · x", "Q100 · x", "q1 · x", "Q1: x", "Q1 - x", "Q1 ·x", "Q1  · x", "Q1 ·", "PHYS_Q1 · x", "Q1\t· x"]) {
    assert.deepEqual(examPrefix(t), { prefix: "", rest: t }, t);
  }
  assert.equal(EXAMQ_PREFIX.test("Q1 · x"), true);
  assert.equal(EXAMQ_PREFIX.test("Q1 · "), true);
  assert.equal(EXAMQ_PREFIX.test(" Q1 · x"), false);
});
test("isSlugTitle: a prefixed title is judged on its rest only", () => {
  assert.equal(isSlugTitle("Q1 · First law: internal energy change", "PHYS_AAA"), false);
  assert.equal(isSlugTitle("Q1 · PHYS_W01", "PHYS_W01"), true);   // the rest is the item's code
  assert.equal(isSlugTitle("Q1 · Q4 twin", "PHYS_AAA"), true);   // the rest is an author slug
  assert.equal(isSlugTitle("Q1 · ", "PHYS_AAA"), true);   // the prefix alone is no title
});
test("cardTitle keeps the exam-question prefix", () => {
  assert.equal(cardTitle("Q1 · First law: internal energy change", "PHYS_AAA"), "Q1 · First law: internal energy change");
  assert.equal(cardTitle("Q1 · Q11 Q1(a): net torque about the axle", "PHYS_AAA"), "Q1 · Net torque about the axle");
  assert.equal(cardTitle("Q1 · PHYS_W01", "PHYS_W01"), "");
  assert.equal(cardTitle("Q1 · Q4 twin", "PHYS_AAA"), "");   // no bare "Q1 · ": the rest is a slug
  assert.equal(cardTitle("Q1 · ", "PHYS_AAA"), "");
  assert.equal(cardTitle("Q99 · Two routes", "PHYS_AAA"), "Q99 · Two routes");
});
test("only the exact prefix is the exam prefix (no-prefix titles are unchanged)", () => {
  for (const t of ["Q01 · x y", "q1 · x y", "Q1: x y"]) {   // today's CODE: label rule, not the exam prefix
    assert.deepEqual(examPrefix(t), { prefix: "", rest: t });
    assert.equal(isSlugTitle(t, "A_B"), false, t);
    assert.equal(cardTitle(t, "A_B"), "X y", t);
  }
  assert.equal(isSlugTitle("Q1 - x y", "A_B"), true);   // a bare Q1 is still a code slug, as today
  assert.equal(cardTitle("Q1 - x y", "A_B"), "");
  assert.equal(examPrefix("PHYS_Q1 · x y").prefix, "");
  assert.equal(cardTitle("PHYS_Q1 · x y", "A_B"), "PHYS_Q1 · x y");
});

// schema-check: the old rules now read the rest; the prefix is never an author code or a word.
const TOOL = fileURLToPath(new URL("../tools/bank_tools/schema-check.mjs", import.meta.url));
const check = doc => {
  const dir = mkdtempSync(join(tmpdir(), "titleq-"));
  const f = join(dir, "BANK_TITLEQ.json");
  writeFileSync(f, JSON.stringify(doc));
  return spawnSync(process.execPath, [TOOL, f], { encoding: "utf8" });
};
const tinyBank = title => {   // the smallest passing fixture bank, with v 20261119 so titles must pass
  const doc = JSON.parse(readFileSync(new URL("./fixtures/repair-twin.json", import.meta.url), "utf8"));
  doc.v = 20261119;
  doc.problems[0].title = title;
  return doc;
};
test("schema-check: a prefixed title passes (prefix is no author code, no word)", () => {
  const r = check(tinyBank("Q1 · First law: internal energy change"));
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(r.stdout.trim(), "", r.stdout);
});
test("schema-check: the word rule still bites the rest", () => {
  const r = check(tinyBank("Q1 · one two three four five six seven"));
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /has 7 words \(2 to 6\)/);
});
test("schema-check: a slug rest, a bare prefix and a rest code still fail", () => {
  const slug = check(tinyBank("Q1 · ch7_card_1"));
  assert.equal(slug.status, 1, slug.stdout + slug.stderr);
  assert.match(slug.stdout, /is a slug/);
  const bare = check(tinyBank("Q1 · "));
  assert.equal(bare.status, 1, bare.stdout + bare.stderr);
  assert.match(bare.stdout, /is a slug/);
  const code = check(tinyBank("Q1 · Net torque (Q4)"));
  assert.equal(code.status, 1, code.stdout + code.stderr);
  assert.match(code.stdout, /holds an author code \(\(Q4\)\)/);
});
test("schema-check: the 60-char cap is the whole title, prefix included", () => {
  // no prefix: 6 words, 61 chars -> the schema's maxLength 60 (the BANK_LONG path test_ship.py expects)
  const long = "a".repeat(10) + " " + "b".repeat(10) + " " + "c".repeat(10) + " " + "d".repeat(10) + " " + "e".repeat(10) + " " + "f".repeat(6);
  assert.equal(long.length, 61);
  const over = check(tinyBank(long));
  assert.equal(over.status, 1, over.stdout + over.stderr);
  assert.match(over.stdout, /\/problems\/0\/title must NOT have more than 60 characters/);
  // the prefix counts toward the same cap: "Q1 · " (5) + a 56-char rest = 61 whole, so it fails
  const rest56 = "a".repeat(10) + " " + "b".repeat(10) + " " + "c".repeat(10) + " " + "d".repeat(10) + " " + "e".repeat(10) + " f";
  assert.equal(("Q1 · " + rest56).length, 61);
  const overPrefix = check(tinyBank("Q1 · " + rest56));
  assert.equal(overPrefix.status, 1, overPrefix.stdout + overPrefix.stderr);
  assert.match(overPrefix.stdout, /\/problems\/0\/title must NOT have more than 60 characters/);
  // a prefixed title that is 60 chars whole passes (no separate cap on the rest)
  const rest55 = "a".repeat(10) + " " + "b".repeat(10) + " " + "c".repeat(10) + " " + "d".repeat(10) + " " + "e".repeat(11);
  assert.equal(("Q1 · " + rest55).length, 60);
  assert.equal(check(tinyBank("Q1 · " + rest55)).status, 0);
  // an old bank gets the same schema cap: a 61-char title still fails, as on origin/main
  const oldLong = tinyBank(long);
  oldLong.v = 1;
  const oldRun = check(oldLong);
  assert.equal(oldRun.status, 1, oldRun.stdout + oldRun.stderr);
  assert.match(oldRun.stdout, /\/problems\/0\/title must NOT have more than 60 characters/);
});
