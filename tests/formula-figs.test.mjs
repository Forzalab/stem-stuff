// Formula sheet pictures (formula-figs.js, design/FORMULA-FIGS.md; Tony, Oct 26): every key is a real sheet row id, every figure is a
// SCHEMA.md graph block (Ajv on #/$defs/graph) with an alt, its math compiles, at most 6 labels, and a force on a body is never dashed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import Ajv2020 from "ajv/dist/2020.js";
import { compile } from "mathjs";
import { schema, root } from "./schemas.mjs";

const read = f => readFileSync(new URL(f, root), "utf8");
const w = {}; w.window = w;
vm.runInNewContext(read("formula-figs.js"), w);
const FIGS = JSON.parse(JSON.stringify(w.FormulaFigs || {}));   // the vm's objects have another realm's prototype
const css = read("app.css");
const sheet = JSON.parse(read("tests/fixtures/formula-sheet-ids.json"));
const ids = new Set(sheet.groups.flatMap(g => g.ids));
const exam3 = new Set(sheet.groups.filter(g => g.exam.includes(3)).flatMap(g => g.ids));
const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false, strictTypes: false });
ajv.addSchema(schema("problems"), "problems");
const graph = ajv.getSchema("problems#/$defs/graph");
function* walk(v, k = "", parent = null) {
  yield [k, v, parent];
  if (v && typeof v === "object") for (const [kk, vv] of Object.entries(v)) yield* walk(vv, kk, v);
}

test("formula-figs.js sets window.FormulaFigs: ten or more pictures, most of them for Exam 3 rows", () => {
  const keys = Object.keys(FIGS);
  assert.ok(keys.length >= 10, `${keys.length} figures`);
  assert.ok(keys.filter(k => exam3.has(k)).length >= 8, "Exam 3 rows first");
});

test("every key is a row id on the formula sheet (fixture: brain sheet v3 ids)", () => {
  assert.equal(ids.size, 163);
  for (const k of Object.keys(FIGS)) assert.ok(ids.has(k), `${k} is not a sheet id`);
});

test("every figure is a SCHEMA.md graph block with an alt sentence", () => {
  for (const [k, g] of Object.entries(FIGS)) {
    assert.ok(graph(g), `${k}: ${ajv.errorsText(graph.errors)}`);
    assert.equal(g.type, "graph", k);
    assert.ok(typeof g.alt === "string" && g.alt.length >= 20 && /\.$/.test(g.alt), `${k}: alt is one sentence`);
  }
});

test("labels <= 6, math compiles, a force on a body is solid, colours follow the kinds (forces c1)", () => {
  for (const [k, g] of Object.entries(FIGS)) {
    let labels = 0;
    for (const [kk, v, par] of walk(g)) {
      if (kk === "color") assert.ok(new RegExp(`--${v}:`).test(css), `${k}: --${v} is not defined in app.css (the stroke would vanish)`);
      if (kk === "label" || (kk === "text" && par?.mark === "text")) labels++;
      if (typeof v === "string" && Array.isArray(par)) compile(v);                       // a point's coordinate may be a math.js string ("pi/3")
      if (typeof v === "number") assert.ok(Number.isFinite(v), `${k}: ${kk}`);
    }
    assert.ok(labels <= 6, `${k}: ${labels} labels`);
    const bodies = g.marks.filter(m => m.mark === "body").map(m => JSON.stringify(m.at));
    for (const m of g.marks.filter(m => m.mark === "force")) {
      assert.ok(!(m.dash && bodies.includes(JSON.stringify(m.at))), `${k}: a dashed force on a body`);
      const kin = /^\$\\vec\s*\{?\s*[va](?![a-zA-Z])/.test(m.label || "");
      assert.ok(kin ? ["c2", "c3"].includes(m.color) : !m.color || m.color === "c1", `${k}: ${m.label} colour`);
    }
  }
});
