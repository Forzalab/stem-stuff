// Live figures (livefig.py): the server's own JSON Schema reader must agree with Ajv on SCHEMA.md's graph block.
// Every fixture livefig.py accepts is a valid SCHEMA graph block; every one it rejects as "schema" fails Ajv too.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";
import { schema, root } from "./schemas.mjs";

const FIX = JSON.parse(readFileSync(new URL("tests/fixtures/livefig.json", root), "utf8"));
const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false, strictTypes: false });
ajv.addSchema(schema("problems"), "problems");
const graph = ajv.getSchema("problems#/$defs/graph");

test("live figure fixtures: the valid ones are SCHEMA graph blocks", () => {
  for (const g of [...FIX.valid, FIX.network.valid]) assert.ok(graph(g), `${g.kind}: ${ajv.errorsText(graph.errors)}`);
});

test("live figure fixtures: the schema rejects fail Ajv too", () => {
  for (const c of FIX.invalid.filter(c => c.why === "schema")) assert.equal(graph(c.fig), false, c.name);
});
