// The SCHEMA.md "problems" schema on bank files, then the repair / welcome / twin gate (repairFaults): tools/build_and_ship/ship.sh's gate runs it on every bank it deploys.
// usage: node tools/bank_tools/schema-check.mjs [--repair] BANK_X.json ...   prints "BANK_X: <first errors>" per failing file; exit 1 if any fails.
// Titles: a bank with v >= 20261119 must have a human title on every problem (error); older banks warn only (SCHEMA.md Version table).
// --repair: the front-door bank's need (exactly one welcome item, repair on its templates); without it a bank with none of those fields passes.
// Needs tests/node_modules (cd tests && npm ci): ajv, through tests/schemas.mjs.
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { validator, repairFaults } from "../../tests/schemas.mjs";
import { isSlugTitle, titleCodes } from "../../client/pure_logic_modules/titles.mjs";

// SCHEMA.md Version table, row 20261119: every problem has a human `title` (2 to 6 words, never a slug). A bank with v >= TITLE_V that breaks it FAILS;
// an older bank (no v, 1, or a smaller date) only gets a warning on stderr, so a deploy of the existing banks never goes red for it.
const TITLE_V = 20261119;
const titleFaults = doc => doc.problems.flatMap(p => {
  if (typeof p.title !== "string" || !p.title.trim()) return [`${p.code}: title missing`];
  const n = p.title.replace(/\$[^$]*\$/g, "M").trim().split(/\s+/).length;
  const codes = titleCodes(p.title);
  if (codes.length && !isSlugTitle(p.title, p.code)) return [`${p.code}: title "${p.title}" holds an author code (${codes.join(", ")}): students do not know it`];
  return isSlugTitle(p.title, p.code) ? [`${p.code}: title "${p.title}" is a slug`] : n < 2 || n > 6 ? [`${p.code}: title "${p.title}" has ${n} words (2 to 6)`] : [];
});

const validate = validator("problems"), N = 3, args = process.argv.slice(2), need = args.includes("--repair");
let bad = 0;
for (const f of args.filter(a => a !== "--repair")) {
  let why;
  try {
    const doc = JSON.parse(readFileSync(f, "utf8"));
    const errs = validate(doc) ? repairFaults(doc, { need })   // the gate reads shapes the schema has vouched for
      : validate.errors.map(e => `${e.instancePath || "/"} ${e.message}${e.params?.additionalProperty ? ` (${e.params.additionalProperty})` : ""}`);
    if (!errs.length) {
      const tf = titleFaults(doc);
      if (doc.v >= TITLE_V) errs.push(...tf);
      else if (tf.length) console.error(`${basename(f, ".json")}: warn: ${tf.length} title(s) not human (v < ${TITLE_V}, not failing): ${tf.slice(0, 3).join("; ")}${tf.length > 3 ? " ..." : ""}`);
    }
    if (errs.length) why = errs.slice(0, N).join("; ") + (errs.length > N ? ` (+${errs.length - N} more)` : "");
    if (!why) {   // W132 lint: a num item / num part with no `unit` key warns (stderr), never fails; "" = unitless on purpose
      const bare = doc.problems.flatMap(p => p.type === "num" ? (p.unit == null ? [p.code] : [])
        : p.type === "multi" ? p.parts.flatMap((q, i) => q.type === "num" && q.unit == null ? [`${p.code}.${q.label || "ABCDEFGHIJ"[i]}`] : []) : []);
      if (bare.length) console.error(`${basename(f, ".json")}: warn: ${bare.length} num without a unit: ${bare.slice(0, 8).join(", ")}${bare.length > 8 ? ` (+${bare.length - 8} more)` : ""}`);
    }
  } catch (e) { why = e.message; }   // not JSON, unreadable
  if (why) { bad++; console.log(`${basename(f, ".json")}: ${why}`); }
}
process.exit(bad ? 1 : 0);
