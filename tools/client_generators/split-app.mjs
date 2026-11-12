#!/usr/bin/env node
/* W152: the one-file app.js -> 3 ES modules, by script (brain _files/w152/P0.md). Never hand-edit the moved code: re-run this.
     app.js   = everything before CLUCK_MARK  (markdown/TeX, grading, entry box, banks, problem state, answer flow, reveal)
     cluck.js = CLUCK_MARK .. SHELL_MARK      (Cluck the genie, his sheet, dismiss)
     shell.js = SHELL_MARK .. end             (rewards, original beside a snack, scratchpad + Copy, copy math, freeze, Swap, Multitask, resume, boot)
   Load order = the old text order: index.html runs app.js, cluck.js, shell.js as 3 module scripts in a row (app.js imports neither).
   A name read by a LATER part = a plain import (live binding). A name read by an EARLIER part, or assigned outside its own part,
   goes through `bridge` (app.js): accessors its own part defines at its top; every outside use becomes bridge.<name>.
   The bridge name must be declared NOWHERE in the input (no local of that name can shadow it: W152 CI, a local `ln` in xDiag).
   usage: node tools/client_generators/split-app.mjs [monolith.js] [outdir]       (defaults: app.js, .) -- at merge time:
          git show origin/main:app.js > /tmp/app-main.js && node tools/client_generators/split-app.mjs /tmp/app-main.js .
   Also adds cluck.js + shell.js to index.html (right after app.js) and sw.js BASE, once. Gates after a split: tests/split-gate.test.mjs (no-undef) + tests/window-surface.pw.mjs (window names). */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const req = createRequire(path.join(ROOT, "tests", "package.json"));
const acorn = req("acorn"), escope = req("eslint-scope");   // both come with eslint (tests/package.json; cd tests && npm ci)

const CLUCK_MARK = "/* ---------- Cluck the genie (";
const SHELL_MARK = "/* ---------- sugar rewards (";
const SPLIT_MARK = "/* split-app.mjs";   // the output's banner: an input that has it is already split
const PARTS = ["app", "cluck", "shell"];
/* where each part lives (repo-relative, the client/ + shared/ layout). The monolith's relative imports are written from app.js's folder; a part imports from its own folder. */
const PART_FILE = ["client/answer/drill_core/app.js", "client/cluck/cluck.js", "client/shell/shell.js"];
const relTo = (p, target) => { const r = path.posix.relative(path.posix.dirname(PART_FILE[p]), target); return r.startsWith(".") ? r : "./" + r; };
const fromPart = (p, from) => from.startsWith(".") ? relTo(p, path.posix.join(path.posix.dirname(PART_FILE[0]), from)) : from;
/* top-level declarations that move to the END of app.js though they sit in a later part: the hash routing, which reads app.js names
   only, and which tests/next-dead.test.mjs reads in app.js (a test is never edited for the split) */
const MOVE_TO_APP = ["hashCode", "fromHash"];

const [inPath = path.join(ROOT, PART_FILE[0]), outDir = ROOT] = process.argv.slice(2);
const src = fs.readFileSync(inPath, "utf8");
if (src.includes(SPLIT_MARK)) throw new Error(`${inPath} is already split: feed the one-file app.js (git show origin/main:app.js)`);
const at = mark => { const i = src.indexOf("\n" + mark) + 1; if (i <= 0 || src.indexOf("\n" + mark, i) >= 0) throw new Error(`marker not found exactly once: ${mark}`); return i; };
const cut = [0, at(CLUCK_MARK), at(SHELL_MARK), src.length];
let moved = [];   // [start, end) source ranges (whole lines) that belong to app.js
const partOf = off => moved.some(([s, e]) => off >= s && off < e) ? 0 : off < cut[1] ? 0 : off < cut[2] ? 1 : 2;

const ast = acorn.parse(src, { ecmaVersion: "latest", sourceType: "module", ranges: true, locations: true });
const sm = escope.analyze(ast, { ecmaVersion: 2022, sourceType: "module" });
const mod = sm.scopes.find(s => s.type === "module");
// no top-level statement may straddle a cut
for (const st of ast.body) for (const c of [cut[1], cut[2]]) if (st.start < c && st.end > c) throw new Error(`a statement crosses a cut at offset ${c}`);

for (const name of MOVE_TO_APP) {
  const st = ast.body.find(x => x.type === "VariableDeclaration" && x.declarations.length === 1 && x.declarations[0].id.name === name);
  if (!st) throw new Error(`MOVE_TO_APP: no top-level declaration of ${name}`);
  if (st.start < cut[1]) continue;   // already in app.js
  const s0 = src.lastIndexOf("\n", st.start - 1) + 1, e0 = src.indexOf("\n", st.end) + 1;
  if (src.slice(s0, st.start).trim()) throw new Error(`MOVE_TO_APP: ${name} does not start its line`);
  moved.push([s0, e0]);
}
moved.sort((a, b) => a[0] - b[0]);
const parent = new Map();
(function walk(n, p) { if (!n || typeof n.type !== "string") return; parent.set(n, p); for (const k in n) { const v = n[k]; if (k === "parent") continue; if (Array.isArray(v)) v.forEach(c => walk(c, n)); else if (v && typeof v.type === "string") walk(v, n); } })(ast, null);

/* every top-level binding: its part, kind, and (imports) where it comes from */
const B = new Map();
for (const v of mod.variables) {
  const d = v.defs[0];
  const b = { name: v.name, part: partOf(d.name.start), v, imp: null, written: new Set(), usedIn: new Set() };
  if (d.type === "ImportBinding") { const spec = d.node, decl = d.parent; b.imp = { from: decl.source.value, kind: spec.type, imported: spec.imported && (spec.imported.name ?? spec.imported.value) }; }
  B.set(v.name, b);
}
for (const b of B.values()) for (const r of b.v.references) {
  const p = partOf(r.identifier.start); b.usedIn.add(p);
  if (r.isWrite() && !r.init && p !== b.part) b.written.add(p);
}
/* routing: imports of the original file stay in app.js; a part that uses one imports it from its source module itself */
const viaLn = new Set(), exportsOf = [new Set(), new Set(), new Set()], importsOf = [new Map(), new Map(), new Map()], extImports = [[], [], []];
for (const b of B.values()) {
  if (b.imp) { for (const p of b.usedIn) if (p !== 0) extImports[p].push(b); continue; }
  const outside = [...b.usedIn].filter(p => p !== b.part);
  if (!outside.length) continue;
  if (b.written.size || outside.some(p => p < b.part)) viaLn.add(b.name);
  else for (const p of outside) { exportsOf[b.part].add(b.name); if (!importsOf[p].has(b.part)) importsOf[p].set(b.part, new Set()); importsOf[p].get(b.part).add(b.name); }
}
const BRIDGE = "bridge";
if (sm.scopes.some(sc => sc.variables.some(v => v.name === BRIDGE)) || sm.scopes.some(sc => sc.through.some(r => r.identifier.name === BRIDGE)))
  throw new Error(`the input already uses the name \`${BRIDGE}\`: a rewritten ${BRIDGE}.<name> could hit it. Pick another BRIDGE name`);

/* rewrite: every use of a bridged name outside its own part -> bridge.<name> (a shorthand { x } -> { x: bridge.x }) */
const edits = [];
for (const n of viaLn) {
  const b = B.get(n);
  for (const r of b.v.references) {
    const id = r.identifier;
    if (partOf(id.start) === b.part) continue;
    const pa = parent.get(id);
    if (pa && pa.type === "Property" && pa.shorthand && pa.value === id) edits.push([id.start, id.end, `${n}: ${BRIDGE}.${n}`]);
    else edits.push([id.start, id.end, `${BRIDGE}.${n}`]);
  }
}
/* app.js keeps only the import names it still uses (the moved parts import theirs straight from the source module) */
for (const d of ast.body.filter(s => s.type === "ImportDeclaration")) {
  const keep = d.specifiers.filter(sp => B.get(sp.local.name).usedIn.has(0));
  if (keep.length === d.specifiers.length) continue;
  const ns = keep.find(sp => sp.type === "ImportNamespaceSpecifier");
  const named = keep.filter(sp => sp.type === "ImportSpecifier").map(sp => sp.imported.name === sp.local.name ? sp.local.name : `${sp.imported.name} as ${sp.local.name}`);
  const txt = !keep.length ? `/* ${d.source.value}: used by cluck.js / shell.js only (split-app.mjs) */`
    : ns ? `import * as ${ns.local.name} from "${d.source.value}";` : `import { ${named.join(", ")} } from "${d.source.value}";`;
  edits.push([d.start, d.end, txt]);
}
edits.sort((a, b) => b[0] - a[0]);
let body = src;
for (const [s, e, t] of edits) body = body.slice(0, s) + t + body.slice(e);
const shift = off => off + edits.filter(([s, e, t]) => s < off).reduce((a, [s, e, t]) => a + t.length - (e - s), 0);
const piece = (a, b) => { let out = "", at = a; for (const [s, e] of moved) if (s >= a && e <= b) { out += body.slice(shift(at), shift(s)); at = e; } return out + body.slice(shift(at), shift(b)); };
const chunk = [0, 1, 2].map(i => piece(cut[i], cut[i + 1]));
if (moved.length) chunk[0] += "/* the hash routing (moved here from the boot section by split-app.mjs MOVE_TO_APP) */\n" + moved.map(([s, e]) => body.slice(shift(s), shift(e))).join("");

const file = ["app.js", "cluck.js", "shell.js"];
const list = s => [...s].sort().join(", ");
const lnBlock = p => {
  const names = [...viaLn].filter(n => B.get(n).part === p).sort();
  if (!names.length) return "";
  const prop = n => { const b = B.get(n); const kind = b.v.defs[0].type === "Variable" ? b.v.defs[0].parent.kind : "fn";
    return `  ${n}: { get: () => ${n}${b.written.size ? `, set: v => { ${n} = v; }` : ""}, enumerable: true },${kind === "let" ? "   // let" : ""}`; };
  return `Object.defineProperties(${BRIDGE}, {   // read (or set) from another part as ${BRIDGE}.<name> (split-app.mjs)\n${names.map(prop).join("\n")}\n});\n`;
};
const banner = p => `${SPLIT_MARK} (W152): part ${p + 1} of 3 of the drill page; index.html runs app.js, cluck.js, shell.js in that order. A name from an earlier part: import it. A name from a later part, or a write to another part's let: ${BRIDGE}.<name>, defined by its own part at its top; never declare a local named ${BRIDGE}. tests/split-gate.test.mjs lints it. */\n`;
const out = [0, 1, 2].map(p => {
  let head = banner(p);
  if (p > 0) {
    const ext = new Map();
    for (const b of extImports[p]) { const f = fromPart(p, b.imp.from); if (!ext.has(f)) ext.set(f, []); ext.get(f).push(b); }
    for (const [from, bs] of [...ext].sort()) {
      const ns = bs.filter(b => b.imp.kind === "ImportNamespaceSpecifier"), named = bs.filter(b => b.imp.kind !== "ImportNamespaceSpecifier");
      for (const b of ns) head += `import * as ${b.name} from "${from}";\n`;
      if (named.length) head += `import { ${named.map(b => b.imp.kind === "ImportDefaultSpecifier" ? `default as ${b.name}` : b.imp.imported === b.name ? b.name : `${b.imp.imported} as ${b.name}`).sort().join(", ")} } from "${from}";\n`;
    }
    const fromApp = new Set(importsOf[p].get(0) || []); fromApp.add(BRIDGE);
    head += `import { ${list(fromApp)} } from "${relTo(p, PART_FILE[0])}";\n`;
    for (const [q, ns] of importsOf[p]) if (q !== 0) head += `import { ${list(ns)} } from "${relTo(p, PART_FILE[q])}";\n`;
    head += lnBlock(p);
    return head + chunk[p] + (exportsOf[p].size ? `\nexport { ${list(exportsOf[p])} };\n` : "");
  }
  // app.js: its imports stay first (a module's imports hoist anyway), then the bridge
  const lastImport = ast.body.filter(s => s.type === "ImportDeclaration").pop();
  const split = lastImport ? shift(lastImport.end) : 0;
  const nl = chunk[0].indexOf("\n", split) + 1;
  const exp = new Set(exportsOf[0]); exp.add(BRIDGE);
  return chunk[0].slice(0, nl) + banner(0) + `export const ${BRIDGE} = {};   // the bridge to cluck.js + shell.js (split-app.mjs)\n` + lnBlock(0) + chunk[0].slice(nl) + `\nexport { ${list(exportsOf[0])} };\n`;
});
for (const p of PARTS.keys()) fs.writeFileSync(path.join(outDir, PART_FILE[p]), out[p]);

/* index.html: the 2 new module scripts right after app.js; sw.js: both precached. Once each. */
const patch = (f, test, from, to) => { const fp = path.join(outDir, f); const s = fs.readFileSync(fp, "utf8"); if (test.test(s)) return; if (!s.includes(from)) throw new Error(`${f}: anchor not found: ${from}`); fs.writeFileSync(fp, s.replace(from, to)); };
patch("index.html", /src="client\/cluck\/cluck\.js"/, `<script type="module" src="${PART_FILE[0]}"></script>`, `<script type="module" src="${PART_FILE[0]}"></script>\n<script type="module" src="${PART_FILE[1]}"></script><script type="module" src="${PART_FILE[2]}"></script><!-- W152: app.js split in 3 (tools/client_generators/split-app.mjs); module scripts run in this order, so the old top-to-bottom order holds -->`);
patch("sw.js", /"client\/cluck\/cluck\.js"/, `"${PART_FILE[0]}", `, `"${PART_FILE[0]}", "${PART_FILE[1]}", "${PART_FILE[2]}", `);

const lines = out.map(s => s.split("\n").length);
console.log(`split: app.js ${lines[0]} · cluck.js ${lines[1]} · shell.js ${lines[2]} lines; bridge ${viaLn.size} names; exports app ${exportsOf[0].size} · cluck ${exportsOf[1].size}`);
console.log(`bridge: ${[...viaLn].sort().map(n => `${n}(${file[B.get(n).part]}${B.get(n).written.size ? ",set" : ""})`).join(" ")}`);
