// F1 pops (pops.js + copy/pops.js; brain design-round-66 DESIGN-v3 §6, Tony #25.3 + #8): 1 pop per 5 clean correct answers, never
// right after a miss, never in repair / mini-Cluck / welcome, tag match or no pop; the copy is physics-tagged, v2 §D lines 7 + 12 cut.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const read = f => readFileSync(new URL(f, import.meta.url), "utf8");
const w = {}; w.window = w;
vm.runInNewContext(read("../copy/pops.js"), w);
vm.runInNewContext(read("../pops.js"), w);
const LINES = JSON.parse(JSON.stringify(w.__stemPopLines));
const P = w.stemPops;

const ok = (p, tags = ["momentum"], x = {}) => p.answer({ correct: true, tags, ...x });
const miss = p => p.answer({ correct: false });

test("10 correct in a row → exactly 2 pops, on the 5th and the 10th", () => {
  const p = P.create({ lines: LINES });
  const got = Array.from({ length: 10 }, () => ok(p));
  assert.deepEqual(got.map(x => x != null), [0, 0, 0, 0, 1, 0, 0, 0, 0, 1].map(Boolean));
  assert.ok(LINES.some(l => l.text === got[4]), "a pop is a line from copy/pops.js");
});

test("never right after a miss (#8): the correct after a wrong try gets no pop, the next clean one does", () => {
  const p = P.create({ lines: LINES });
  for (let i = 0; i < 4; i++) assert.equal(ok(p), null);
  assert.equal(miss(p), null);
  assert.equal(ok(p), null, "the correct right after a miss");
  assert.notEqual(ok(p), null, "the next clean correct is the 5th that counts");
});

test("never in repair / mini / welcome contexts, and those answers do not count toward the 5", () => {
  const p = P.create({ lines: LINES });
  for (let i = 0; i < 4; i++) ok(p);
  for (const ctx of ["repair", "mini", "welcome"]) for (let i = 0; i < 6; i++) assert.equal(ok(p, ["momentum"], { ctx }), null, ctx);
  assert.notEqual(ok(p), null);
});

test("tag mismatch → no pop (the slot is spent); a match picks a line with that tag, rotating", () => {
  const p = P.create({ lines: LINES });
  for (let i = 0; i < 4; i++) ok(p, ["nope"]);
  assert.equal(ok(p, ["nope"]), null);
  for (let i = 0; i < 4; i++) assert.equal(ok(p, ["energy"]), null, "the mismatch spent the slot: count starts again");
  const a = ok(p, ["energy"]);
  for (let i = 0; i < 4; i++) ok(p, ["energy"]);
  const b = ok(p, ["energy"]);
  const energy = LINES.filter(l => l.tag === "energy").map(l => l.text);
  assert.ok(energy.includes(a) && energy.includes(b) && a !== b, [a, b].join(" | "));
  assert.equal(ok(P.create({ lines: LINES, every: 1 }), []), null, "no tags at all → none");
});

test("copy: v2 §D lines 7 ('sigma behaviour') and 12 ('touch grass') are cut; every line physics-tagged; ≤ 1 in 10 slang-only", () => {
  const all = LINES.map(l => l.text).join("\n");
  assert.doesNotMatch(all, /sigma|touch grass/i);
  assert.ok(LINES.length >= 10, LINES.length);
  for (const l of LINES) {
    assert.match(l.tag, /^[a-z]+$/, "a physics tag, no '*' generic fallback: " + l.text);
    assert.equal(typeof l.text, "string");
  }
  assert.ok(LINES.filter(l => l.slang).length * 10 <= LINES.length, "slang-only lines ≤ 1 in 10");
  assert.equal(new Set(LINES.map(l => l.text)).size, LINES.length, "no duplicate lines");
});
