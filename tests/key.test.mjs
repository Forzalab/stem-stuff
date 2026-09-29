// Server-only key files (draft; see SCHEMA-SPLIT.md). Enforces MC.md section 6 authoring rules.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";
import { evaluate } from "mathjs";

const root = new URL("../", import.meta.url);
const dir = new URL("schema/examples/", root);
const schema = JSON.parse(readFileSync(new URL("schema/key.schema.json", root)));
const validate = new Ajv2020({ allErrors: true, strict: true, strictRequired: false, strictTypes: false }).compile(schema);
const keys = readdirSync(dir).filter(f => f.endsWith(".key.json"));
const load = f => JSON.parse(readFileSync(new URL(f, dir)));
const num = s => Number(evaluate(s.replace(/ln\s*\(/g, "log(")));

test("key examples exist", () => assert.ok(keys.length >= 2));

for (const f of keys) {
  const k = load(f);
  const pubFile = f.replace(".key.json", ".public.json");
  const pub = readdirSync(dir).includes(pubFile) ? load(pubFile) : JSON.parse(readFileSync(new URL(`p/${k.code}.json`, root)));

  test(`${f}: schema`, () => assert.ok(validate(k), JSON.stringify(validate.errors, null, 1)));
  test(`${f}: code matches filename`, () => assert.equal(f, k.code + ".key.json"));

  if (pub.type === "mc") {
    test(`${f}: every distractor has exactly one error+hint`, () => {
      const ids = pub.choices.map(c => c.id);
      assert.equal(new Set(ids).size, ids.length, "duplicate choice ids");
      assert.ok(ids.length >= 5 && ids.length <= 8, "5-8 choices");
      assert.ok(ids.includes(k.correct), "correct id not in choices");
      const got = k.wrong.map(w => w.choice);
      assert.ok(got.every(Boolean), "mc keys use choice, not match/re");
      assert.deepEqual([...got].sort(), ids.filter(i => i !== k.correct).sort());
    });
  } else {
    test(`${f}: known wrong answers evaluate and are actually wrong`, () => {
      const tol = k.tol ?? 1e-6, ans = k.answer === "dne" ? NaN : num(k.answer);
      for (const w of k.wrong) {
        assert.ok(!w.choice, "freeform keys use match/re");
        if (w.re) { new RegExp(w.re, "i"); continue; }
        const v = num(w.match);
        assert.ok(Number.isFinite(v), w.match);
        assert.ok(!(Math.abs(v - ans) <= tol * Math.max(1, Math.abs(ans))), `${w.match} equals the answer`);
      }
    });
  }

  test(`${f}: hints never state the answer`, () => {
    const answer = pub.type === "mc" ? pub.choices.find(c => c.id === k.correct).md.replace(/\$/g, "") : k.answer;
    const re = new RegExp(`(^|[^0-9.])${answer.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^0-9.]|$)`);
    for (const h of [...k.wrong.map(w => w.hint), k.nudge ?? ""]) assert.ok(!re.test(h.replace(/\$/g, "")), h);
  });
}
