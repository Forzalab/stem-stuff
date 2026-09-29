import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";
import katex from "katex";
import { compile } from "mathjs";

const root = new URL("../", import.meta.url);
const schema = JSON.parse(readFileSync(new URL("schema/problem.schema.json", root)));
const validate = new Ajv2020({ allErrors: true, strict: true, strictRequired: false, strictTypes: false }).compile(schema);
const files = readdirSync(new URL("p/", root)).filter(f => f.endsWith(".json"));
const load = f => JSON.parse(readFileSync(new URL("p/" + f, root)));

// Walk every value; yields [key, value, parent].
function* walk(v, k = "", parent = null) {
  yield [k, v, parent];
  if (v && typeof v === "object") for (const [kk, vv] of Object.entries(v)) yield* walk(vv, kk, v);
}
const md = b => Array.isArray(b.md) ? b.md.join("\n") : b.md;
const MATH = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g;
const EXPR = new Set(["y", "f", "g", "of", "x", "fn"]);
const norm = s => s.replace(/ln\s*\(/g, "log(");

test("problem files exist", () => assert.ok(files.length > 0));

for (const f of files) {
  const p = load(f);
  test(`${f}: schema`, () => assert.ok(validate(p), JSON.stringify(validate.errors, null, 1)));
  test(`${f}: filename matches code`, () => assert.equal(f, p.code + ".json"));

  test(`${f}: answer evaluates`, () => {
    if (p.answer === "dne") return;
    const c = compile(norm(p.answer));
    const scope = p.type === "expr" ? { [p.var ?? "x"]: p.points[0] } : {};
    assert.ok(Number.isFinite(Number(c.evaluate(scope))), p.answer);
  });

  test(`${f}: TeX renders`, () => {
    const srcs = [];
    for (const [k, v, par] of walk(p.body)) {
      if (k === "md" && par?.type === "text") srcs.push(md(par));
      if (["label", "text", "unit"].includes(k) && typeof v === "string" && par?.type !== "text") srcs.push(v);
    }
    for (const s of srcs) for (const m of s.matchAll(MATH))
      katex.renderToString(m[1] ?? m[2], { throwOnError: true, displayMode: !!m[1] });
  });

  // A force drawn from a body's point acts on that body: it must be solid.
  // Dashed forces are only ones NOT acting on the body (drawn elsewhere).
  test(`${f}: forces acting on a body are solid`, () => {
    for (const b of p.body.filter(b => b.type === "graph")) {
      const bodies = (b.marks ?? []).filter(m => m.mark === "body" && Array.isArray(m.at));
      for (const m of b.marks ?? []) {
        if (m.mark !== "force" || !m.dash) continue;
        const on = bodies.some(o => Math.hypot(o.at[0] - m.at[0], o.at[1] - m.at[1]) < 1e-6);
        assert.ok(!on, `force ${m.label ?? ""} at [${m.at}] acts on a body but is dashed`);
      }
    }
  });

  test(`${f}: graph math compiles, <= 6 labels`, () => {
    for (const b of p.body.filter(b => b.type === "graph")) {
      let labels = 0;
      for (const [k, v, par] of walk(b)) {
        if (k === "label" || (k === "text" && par?.mark === "text")) labels++;
        if (typeof v === "string" && par?.mark && EXPR.has(k) && !(k === "x" && par.mark === "vline")) compile(norm(v));
      }
      assert.ok(labels <= 6, `${labels} labels`);
    }
  });
}

test("code suffixes unique across subjects", () => {
  const seen = new Map();
  for (const f of files) {
    const s = f.replace(/^[A-Z0-9]+_|\.json$/g, "");
    assert.ok(!seen.has(s), `${f} clashes with ${seen.get(s)}`);
    seen.set(s, f);
  }
});
