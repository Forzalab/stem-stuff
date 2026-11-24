// The SCHEMA.md "problems" schema on bank files, then the repair / welcome / twin gate (repairFaults): tools/build_and_ship/ship.sh's gate runs it on every bank it deploys.
// usage: node tools/bank_tools/schema-check.mjs [--repair] BANK_X.json ...   prints "BANK_X: <first errors>" per failing file; exit 1 if any fails.
// Titles: a bank with v >= 20261119 must have a human title on every problem (error); older banks warn only (SCHEMA.md Version table).
// Starters: a bank with v >= 20261123 must have a `starter` chip on every problem, no answer leak (error); older banks warn only.
// --repair: the front-door bank's need (exactly one welcome item, repair on its templates); without it a bank with none of those fields passes.
// Needs tests/node_modules (cd tests && npm ci): ajv, through tests/schemas.mjs.
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { validator, repairFaults } from "../../tests/schemas.mjs";
import { isSlugTitle, titleCodes, examPrefix } from "../../client/pure_logic_modules/titles.mjs";

// SCHEMA.md Version table, row 20261119: every problem has a human `title` (2 to 6 words, never a slug). A bank with v >= TITLE_V that breaks it FAILS;
// an older bank (no v, 1, or a smaller date) only gets a warning on stderr, so a deploy of the existing banks never goes red for it.
// TITLE-EXAMQ: the student-facing "Q1 · " practice-exam prefix is not an author code and not a word: the rules read the rest (<= 60 chars);
// the whole string (prefix + rest) may be <= 68 chars. A title without the prefix is judged exactly as before.
const TITLE_V = 20261119;
const titleFaults = doc => doc.problems.flatMap(p => {
  if (typeof p.title !== "string" || !p.title.trim()) return [`${p.code}: title missing`];
  const { rest } = examPrefix(p.title);
  const n = rest.replace(/\$[^$]*\$/g, "M").trim().split(/\s+/).length;
  const codes = titleCodes(rest);
  if (codes.length && !isSlugTitle(p.title, p.code)) return [`${p.code}: title "${p.title}" holds an author code (${codes.join(", ")}): students do not know it`];
  if (isSlugTitle(p.title, p.code)) return [`${p.code}: title "${p.title}" is a slug`];
  if (n < 2 || n > 6) return [`${p.code}: title "${p.title}" has ${n} words (2 to 6)`];
  if (p.title.length > 68) return [`${p.code}: title "${p.title}" is ${p.title.length} chars (max 68)`];
  return [];
});
// The old schema's maxLength 60 on `title` itself, now on the rest (with no prefix the rest IS the title): every bank, as before.
const titleLenFaults = doc => doc.problems.flatMap(p => {
  const { rest } = examPrefix(p.title);
  return typeof p.title === "string" && rest.length > 60 ? [`${p.code}: title "${rest}" is ${rest.length} chars without the prefix (max 60)`] : [];
});

// SCHEMA.md Version table, row 20261123: every problem has a `starter` chip (3 to 9 words, <= 60 chars, a question in the student's voice) that never leaks the answer.
// A bank with v >= STARTER_V that breaks it FAILS; an older bank only warns on stderr. (A formula that solves the item cannot be checked by machine: review it.)
const STARTER_V = 20261123;
const nums = t => (String(t).replace(/\\[a-z]+/gi, " ").match(/\d+(?:\.\d+)?/g) || []).map(Number);   // every number in a text, TeX commands dropped
const plainOf = t => String(t).replace(/[$\\{}\s]+/g, " ").trim().toLowerCase();
const starterFaults = doc => doc.problems.flatMap(p => {
  const s = p.starter, at = `${p.code}: starter`;
  if (typeof s !== "string" || !s.trim()) return [`${at} missing`];
  const n = s.replace(/\$[^$]*\$/g, "M").trim().split(/\s+/).length;
  if (n < 3 || n > 9) return [`${at} "${s}" has ${n} words (3 to 9)`];
  if (s.length > 60) return [`${at} "${s}" is ${s.length} chars (max 60)`];
  if (/\(\s*[a-g]\s*\)/i.test(s) || /\b(?:choice|option|answer|pick)\s+\(?[a-g]\b/i.test(s)) return [`${at} "${s}" names a choice letter`];
  const keys = [].concat(p.correct ?? []), keyed = (p.choices || []).filter(c => keys.includes(c.id)).map(c => c.md);
  const ans = [...keyed, ...(typeof p.answer === "string" ? [p.answer] : []), ...(p.parts || []).flatMap(q => typeof q.answer === "string" ? [q.answer] : [])];
  const have = new Set(nums(s));
  for (const a of ans) {
    if (nums(a).some(x => have.has(x))) return [`${at} "${s}" holds a number of the answer (${a})`];
    const t = plainOf(a);
    if (t.length >= 3 && !/^[\d\s.,+\-=]+$/.test(t) && plainOf(s).includes(t)) return [`${at} "${s}" holds the answer text (${a})`];
  }
  return [];
});

const validate = validator("problems"), N = 3, args = process.argv.slice(2), need = args.includes("--repair");
let bad = 0;
for (const f of args.filter(a => a !== "--repair")) {
  let why;
  try {
    const doc = JSON.parse(readFileSync(f, "utf8"));
    const errs = validate(doc) ? repairFaults(doc, { need })   // the gate reads shapes the schema has vouched for
      : validate.errors.map(e => `${e.instancePath || "/"} ${e.message}${e.params?.additionalProperty ? ` (${e.params.additionalProperty})` : ""}`);
    if (!errs.length) errs.push(...titleLenFaults(doc));   // a 60-char title cap fails every bank, as the old schema maxLength did
    if (!errs.length) {
      const tf = titleFaults(doc);
      if (doc.v >= TITLE_V) errs.push(...tf);
      else if (tf.length) console.error(`${basename(f, ".json")}: warn: ${tf.length} title(s) not human (v < ${TITLE_V}, not failing): ${tf.slice(0, 3).join("; ")}${tf.length > 3 ? " ..." : ""}`);
    }
    if (!errs.length) {
      const sf = starterFaults(doc);
      if (doc.v >= STARTER_V) errs.push(...sf);
      else if (sf.length) console.error(`${basename(f, ".json")}: warn: ${sf.length} starter(s) missing or bad (v < ${STARTER_V}, not failing): ${sf.slice(0, 3).join("; ")}${sf.length > 3 ? " ..." : ""}`);
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
