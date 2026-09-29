import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";
import { build, replay, stringify, diff, MAX_EDITS, MAX_CHARS } from "../copy/payload.mjs";

const root = new URL("../", import.meta.url);
const schema = JSON.parse(readFileSync(new URL("schema/copy-payload.schema.json", root)));
const validate = new Ajv2020({ allErrors: true, strict: true, strictRequired: false, strictTypes: false }).compile(schema);
const ok = p => assert.ok(validate(p), JSON.stringify(validate.errors, null, 1));
const example = JSON.parse(readFileSync(new URL("copy/example.json", root)));

test("copy example: schema", () => ok(example));
test("copy example: history replays to final explanation", () =>
  assert.equal(replay(example).at(-1).text, example.explain));

test("copy: diff/replay round-trips", () => {
  const texts = ["", "abc", "abXc", "Xc", "Xc ok", "totally new", "totally new"];
  const hist = texts.map((text, k) => ({ t: 1000 * k, text }));
  const p = build({ code: "PHYS-F3N", start: 0, explain: "totally new", history: hist }, 9000);
  ok(p);
  assert.deepEqual(replay(p).map(s => s.text), ["", "abc", "abXc", "Xc", "Xc ok", "totally new"]);
  assert.deepEqual(diff("abc", "abXc"), { at: 2, del: 0, ins: "X" });
});

test("copy: long history is thinned and capped, last snapshot kept", () => {
  let s = "", hist = [];
  for (let k = 0; k < 2000; k++) { s += `word${k} `; hist.push({ t: k * 500, text: s }); }
  const p = build({ code: "CALC1-A9R", start: 0, explain: s,
    tries: [{ t: 1000, a: "C text", c: "b", l: "C", v: "wrong" }], hints: [], history: hist }, 2e6);
  ok(p);
  assert.ok(p.hist.edits.length <= MAX_EDITS);
  assert.ok(JSON.stringify(p).length <= MAX_CHARS + s.length); // explain itself is not truncated
  assert.equal(replay(p).at(-1).text, s);
  assert.equal(p.hist.n, 2000);
  assert.deepEqual(JSON.parse(stringify(p)), p);
});
