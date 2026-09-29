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
