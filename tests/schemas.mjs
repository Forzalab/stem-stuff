// The one schema lives in SCHEMA.md: the fenced ```json block after each <!-- schema: NAME --> marker.
import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";

export const root = new URL("../", import.meta.url);
const doc = readFileSync(new URL("SCHEMA.md", root), "utf8");

export function schema(name) {
  const m = doc.match(new RegExp(`<!-- schema: ${name} -->\\s*\`\`\`json\\n([\\s\\S]*?)\\n\`\`\``));
  if (!m) throw new Error(`no <!-- schema: ${name} --> block in SCHEMA.md`);
  return JSON.parse(m[1]);
}

export const validator = name => new Ajv2020({ allErrors: true, strict: true, strictRequired: false, strictTypes: false }).compile(schema(name));
export const bank = () => JSON.parse(readFileSync(new URL("problems.json", root), "utf8"));

/* repair / welcome / twin links (SCHEMA.md "Repair ladder, noob tier, welcome, twins"): what the schema cannot say, as a list of faults
   ([] = sound). need = the front-door bank (schema-check --repair): exactly one welcome item and at least one repair. */
function ladderFaults(where, steps) {
  const out = [], ids = new Set();
  if (!Array.isArray(steps) || steps.length < 3 || steps.length > 5) return [`${where}: needs 3-5 steps`];
  if (steps.at(-1).id !== "answer") out.push(`${where}: last step id is ${steps.at(-1).id}, not answer`);
  if (!steps.some(s => s.why)) out.push(`${where}: no step has a why`);
  for (const s of steps) {
    const at = `${where} ${s.id}`, opts = (s.opts ?? []).map(o => o?.id ?? o);
    if (ids.has(s.id)) out.push(`${at}: repeated id`);
    ids.add(s.id);
    if (/\d/.test(s.label)) out.push(`${at}: digit in label`);
    if (s.fam !== undefined && !s.why) out.push(`${at}: fam step needs a why`);
    if (s.why && !(s.why.ok < (s.why.opts ?? []).length)) out.push(`${at}: why.ok is not a chip`);
    if (s.id === "answer" && s.ok === undefined) continue;   // graded by the item's own key (and choices)
    if (s.ok === undefined) out.push(`${at}: needs ok`);
    else if ((s.kind === "pick" || s.kind === "fill") && !opts.includes(s.ok)) out.push(`${at}: ok ${s.ok} is not an opt`);
    else if (s.kind === "sheet" && !(s.pool ?? []).includes(s.ok)) out.push(`${at}: ok ${s.ok} is not in pool`);
    if (s.kind === "fill" && (s.tex ?? "").split("▢").length !== 2) out.push(`${at}: fill tex needs exactly one ▢`);
  }
  return out;
}
export function repairFaults(doc, { need = false } = {}) {
  const ps = doc.problems ?? [], by = new Map(ps.map(p => [p.code, p])), out = [], kids = new Set();
  const welcome = ps.filter(p => p.welcome);
  if (welcome.length > 1) out.push(`welcome on ${welcome.length} items (${welcome.map(p => p.code).join(", ")}), at most one`);
  if (need && welcome.length !== 1) out.push(`needs exactly one welcome item, has ${welcome.length}`);
  if (need && !ps.some(p => p.repair)) out.push("needs repair on its templates, has none");
  for (const p of ps) {
    if (p.repair) out.push(...ladderFaults(`${p.code} repair`, p.repair.steps));
    if (p.repair?.alt) out.push(...ladderFaults(`${p.code} repair.alt`, p.repair.alt.steps));
    if (p.welcome && !p.repair) out.push(`${p.code}: welcome item needs repair`);
    if (p.parent_template !== undefined && !p.twin) out.push(`${p.code}: parent_template only on a twin`);
    if (!p.twin) continue;
    const t = by.get(p.parent_template);
    if (p.parent_template === undefined) out.push(`${p.code}: ${p.twin} twin needs parent_template`);
    else if (!t) out.push(`${p.code}: parent_template ${p.parent_template} is not in the bank`);
    else if (t.twin) out.push(`${p.code}: parent_template ${t.code} is itself a twin`);
    else if (!t.repair) out.push(`${p.code}: parent_template ${t.code} has no repair`);
    const k = `${p.parent_template} ${p.twin}`;
    if (kids.has(k)) out.push(`${p.code}: a second ${p.twin} twin of ${p.parent_template}`);
    kids.add(k);
  }
  return out;
}
