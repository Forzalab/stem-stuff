import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validator } from "./schemas.mjs";
import { build, replay, stringify, diff, MAX_EDITS, MAX_CHARS } from "../copy/payload.mjs";

const root = new URL("../", import.meta.url);
const validate = validator("copy");
const ok = p => assert.ok(validate(p), JSON.stringify(validate.errors, null, 1));
const example = JSON.parse(readFileSync(new URL("copy/example.json", root)));

test("copy example: schema", () => ok(example));
test("copy example: history replays to final explanation", () =>
  assert.equal(replay(example).at(-1).text, example.explain));

test("copy: diff/replay round-trips", () => {
  const texts = ["", "abc", "abXc", "Xc", "Xc ok", "totally new", "totally new"];
  const hist = texts.map((text, k) => ({ t: 1000 * k, text }));
  const p = build({ code: "PHYS_F3N", start: 0, explain: "totally new", history: hist }, 9000);
  ok(p);
  assert.deepEqual(replay(p).map(s => s.text), ["", "abc", "abXc", "Xc", "Xc ok", "totally new"]);
  assert.deepEqual(diff("abc", "abXc"), { at: 2, del: 0, ins: "X" });
});

test("copy: long history is thinned and capped, last snapshot kept", () => {
  let s = "", hist = [];
  for (let k = 0; k < 2000; k++) { s += `word${k} `; hist.push({ t: k * 500, text: s }); }
  const p = build({ code: "CALC1_A9R", start: 0, explain: s,
    tries: [{ t: 1000, a: "C text", c: "b", l: "C", v: "wrong" }], hints: [], history: hist }, 2e6);
  ok(p);
  assert.ok(p.hist.edits.length <= MAX_EDITS);
  assert.ok(JSON.stringify(p).length <= MAX_CHARS + s.length); // explain itself is not truncated
  assert.equal(replay(p).at(-1).text, s);
  assert.equal(p.hist.n, 2000);
  assert.deepEqual(JSON.parse(stringify(p)), p);
});

test("copy: 'pending' verdict (tries made before server grading exists) is valid", () => {
  const p = build({ code: "PHYS_F3N", start: 0, explain: "", history: [],
    tries: [{ t: 4000, a: "3.2", v: "pending" }] }, 9000);
  ok(p);
  assert.deepEqual(p.final, { a: "3.2", v: "pending" });
  const bad = structuredClone(p); bad.tries[0].v = "maybe";
  assert.equal(validate(bad), false);
});

test("copy: a multi try carries its part (final, tries, hints); part is 0..3", () => {
  const p = build({ code: "CSCI26_M5V", start: 0, explain: "", history: [],
    tries: [{ t: 2000, a: "17", part: 0, v: "wrong" }, { t: 5000, a: "11", part: 1, v: "correct" }],
    hints: [{ t: 2000, part: 0, n: 1, kind: "counting" }] }, 9000);
  ok(p);
  assert.deepEqual(p.tries.map(x => x.part), [0, 1]);
  assert.deepEqual(p.final, { a: "11", part: 1, v: "correct" });
  assert.equal(p.hints[0].part, 0);
  assert.deepEqual(JSON.parse(stringify(p)), p);
  for (const bad of [4, -1, "0", 0.5]) { const q = structuredClone(p); q.tries[0].part = bad; assert.equal(validate(q), false, String(bad)); }
});
