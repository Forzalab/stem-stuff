// figure-docs.txt -> the generated region of layout-docs.mjs (DOCS + DOC_INDEX).
// Source of truth: figure-docs.txt. Run `node tools/gen_figure_docs.mjs` after editing it;
// `--check` writes nothing and exits 1 (naming layout-docs.mjs) when the region is stale.
// No dependencies: node builtins only.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const OPEN = "// <gen figure-docs: do not edit, run node tools/gen_figure_docs.mjs>";
const CLOSE = "// </gen figure-docs>";
const TAGS = new Set(["topic", "example"]);

function fail(lineNo, msg) {
  throw new Error(`figure-docs.txt:${lineNo}: ${msg}`);
}

/** Parse figure-docs.txt into [{kind, id, attrs, body}] in file order. */
export function parseDocs(txt) {
  const lines = String(txt).split("\n");
  const docs = [];
  const seen = new Set();
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line) { i++; continue; }
    if (!line.startsWith("<")) fail(i + 1, `unexpected text outside a doc block: ${line}`);
    const open = /^<(topic|example)((?:\s+[A-Za-z][\w-]*="[^"]*")*)\s*>$/.exec(line);
    if (!open) {
      if (/^<\/(topic|example)\s*>$/.test(line)) fail(i + 1, "close tag with no open tag");
      fail(i + 1, `unknown tag: ${line}`);
    }
    const kind = open[1];
    const idLine = i + 1;
    const attrs = {};
    for (const m of line.matchAll(/([A-Za-z][\w-]*)="([^"]*)"/g)) {
      if (Object.prototype.hasOwnProperty.call(attrs, m[1])) fail(idLine, `duplicate attribute "${m[1]}"`);
      if (/[<>]/.test(m[2])) fail(idLine, `attribute "${m[1]}" has a < or > inside its value`);
      attrs[m[1]] = m[2];
    }
    for (const key of ["id", "title", "use"]) {
      if (!attrs[key]) fail(idLine, `${kind} is missing the ${key} attribute`);
    }
    if (seen.has(attrs.id)) fail(idLine, `duplicate id "${attrs.id}"`);
    seen.add(attrs.id);
    if (kind !== "example") {
      for (const key of ["inline", "more"]) {
        if (Object.prototype.hasOwnProperty.call(attrs, key)) fail(idLine, `attribute "${key}" is only for <example> blocks`);
      }
    }
    if (Object.prototype.hasOwnProperty.call(attrs, "inline") && attrs.inline !== "1") fail(idLine, 'inline must be "1"');
    if (Object.prototype.hasOwnProperty.call(attrs, "more")) {
      const refs = attrs.more.trim().split(/\s+/).filter(Boolean);
      if (!refs.length) fail(idLine, "more is empty");
      const dup = refs.find((ref, at) => refs.indexOf(ref) !== at);
      if (dup) fail(idLine, `more lists "${dup}" twice`);
    }
    const body = [];
    let closed = false;
    i++;
    for (; i < lines.length; i++) {
      const t = lines[i].trim();
      if (t === `</${kind}>`) { closed = true; break; }
      if (/<\/?(topic|example)\b/.test(lines[i])) fail(i + 1, `tag text inside the body of "${attrs.id}"`);
      body.push(lines[i]);
    }
    if (!closed) fail(idLine, `missing close tag </${kind}> for "${attrs.id}"`);
    i++;
    docs.push({ kind, id: attrs.id, attrs, body: body.join("\n") });
  }
  return docs;
}

/** The exact text that belongs between the two gen markers. */
export function generate(txt) {
  const docs = parseDocs(txt);
  const byId = new Map(docs.map(d => [d.id, d]));
  const refsOf = d => (d.attrs.more ? d.attrs.more.trim().split(/\s+/).filter(Boolean) : []);
  for (const d of docs) for (const ref of refsOf(d)) {
    if (ref === d.id) throw new Error(`figure-docs.txt: "${d.id}" more points to itself`);
    if (!byId.has(ref)) throw new Error(`figure-docs.txt: "${d.id}" more id "${ref}" does not name a doc`);
  }
  const rows = docs.map(d => "  " + JSON.stringify({ kind: d.kind, id: d.id, attrs: d.attrs, body: d.body }) + ",");
  const index = docs.map(d => `${d.id}: ${d.attrs.title}. ${d.attrs.use}`).join("\n");
  const inline = docs.filter(d => d.attrs.inline === "1").map(d => {
    const lines = [`Worked example: ${d.attrs.title}`, d.body];
    const refs = refsOf(d);
    if (refs.length) lines.push(`More like this: read_doc(id) for ${refs.map(r => `${r} (${byId.get(r).attrs.title})`).join(", ")}`);
    return lines.join("\n");
  }).join("\n");
  return `export const DOCS = [\n${rows.join("\n")}\n];\nexport const DOC_INDEX = ${JSON.stringify(index)};\nexport const INLINE_EXAMPLES = ${JSON.stringify(inline)};\n`;
}

function splitLayout(text) {
  const o = text.indexOf(OPEN + "\n");
  if (o < 0) throw new Error(`layout-docs.mjs: missing marker ${OPEN}`);
  const start = o + OPEN.length + 1;
  const c = text.indexOf(CLOSE, start);
  if (c < 0) throw new Error(`layout-docs.mjs: missing marker ${CLOSE}`);
  return { before: text.slice(0, start), region: text.slice(start, c), after: text.slice(c) };
}

function main() {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const txt = readFileSync(path.join(root, "figure-docs.txt"), "utf8");
  const layoutPath = path.join(root, "layout-docs.mjs");
  const region = generate(txt);
  const parts = splitLayout(readFileSync(layoutPath, "utf8"));
  if (process.argv.includes("--check")) {
    if (parts.region !== region) {
      console.error("stale: layout-docs.mjs does not match figure-docs.txt (run node tools/gen_figure_docs.mjs)");
      process.exit(1);
    }
    console.log("figure-docs: layout-docs.mjs is in sync");
    return;
  }
  if (parts.region === region) {
    console.log("figure-docs: layout-docs.mjs already in sync");
    return;
  }
  writeFileSync(layoutPath, parts.before + region + parts.after);
  console.log("figure-docs: wrote layout-docs.mjs");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
