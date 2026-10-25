// The SCHEMA.md "problems" schema on bank files: tools/ship.sh's gate runs it on every bank it deploys.
// usage: node tools/schema-check.mjs BANK_X.json ...   prints "BANK_X: <first errors>" per failing file; exit 1 if any fails.
// Needs tests/node_modules (cd tests && npm ci): ajv, through tests/schemas.mjs.
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { validator } from "../tests/schemas.mjs";

const validate = validator("problems"), N = 3;
let bad = 0;
for (const f of process.argv.slice(2)) {
  let why;
  try {
    if (!validate(JSON.parse(readFileSync(f, "utf8")))) {
      const errs = validate.errors.map(e => `${e.instancePath || "/"} ${e.message}${e.params?.additionalProperty ? ` (${e.params.additionalProperty})` : ""}`);
      why = errs.slice(0, N).join("; ") + (errs.length > N ? ` (+${errs.length - N} more)` : "");
    }
  } catch (e) { why = e.message; }   // not JSON, unreadable
  if (why) { bad++; console.log(`${basename(f, ".json")}: ${why}`); }
}
process.exit(bad ? 1 : 0);
