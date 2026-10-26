// The SCHEMA.md "problems" schema on bank files, then the repair / welcome / twin gate (repairFaults): tools/ship.sh's gate runs it on every bank it deploys.
// usage: node tools/schema-check.mjs [--repair] BANK_X.json ...   prints "BANK_X: <first errors>" per failing file; exit 1 if any fails.
// --repair: the front-door bank's need (exactly one welcome item, repair on its templates); without it a bank with none of those fields passes.
// Needs tests/node_modules (cd tests && npm ci): ajv, through tests/schemas.mjs.
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { validator, repairFaults } from "../tests/schemas.mjs";

const validate = validator("problems"), N = 3, args = process.argv.slice(2), need = args.includes("--repair");
let bad = 0;
for (const f of args.filter(a => a !== "--repair")) {
  let why;
  try {
    const doc = JSON.parse(readFileSync(f, "utf8"));
    const errs = validate(doc) ? repairFaults(doc, { need })   // the gate reads shapes the schema has vouched for
      : validate.errors.map(e => `${e.instancePath || "/"} ${e.message}${e.params?.additionalProperty ? ` (${e.params.additionalProperty})` : ""}`);
    if (errs.length) why = errs.slice(0, N).join("; ") + (errs.length > N ? ` (+${errs.length - N} more)` : "");
  } catch (e) { why = e.message; }   // not JSON, unreadable
  if (why) { bad++; console.log(`${basename(f, ".json")}: ${why}`); }
}
process.exit(bad ? 1 : 0);
