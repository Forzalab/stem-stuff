#!/usr/bin/env node
// Build tests/handmaps/auto.tsv: <full repo path>\t<unit> <unit> ...
// Edges: (a) a test file names/imports a file, (b) the client import graph
// (units flow from importers to what they import), (c) a root html shell's
// <script src>/<link href> gives that file the shell's units. A file reached
// ONLY through a shell gets no row (gate G4: it is unmapped -> all its pipe).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const OUT = path.join(HERE, "auto.tsv");
const SKIP_DIRS = new Set([".git", "node_modules", ".vercel", ".claude", "public", "scratch"]);
const HTML_SHELLS = ["index.html", "calc.html", "privacy.html"];
const REF_RE = /[A-Za-z0-9_][A-Za-z0-9_./@-]*\.(?:mjs|cjs|js|css|html|py|json)/g;

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name.startsWith(".") || SKIP_DIRS.has(ent.name)) continue;
    const abs = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(abs, out);
    else out.push(path.relative(ROOT, abs).split(path.sep).join("/"));
  }
  return out;
}

const files = new Set(walk(ROOT));
const isTest = (p) =>
  p.startsWith("tests/") && (/\.pw\.mjs$/.test(p) || /\.test\.mjs$/.test(p) || /(^|\/)test_[^/]*\.py$/.test(p));

// PART_ENV (gate G7): parse run-all.sh, the one place parts are declared.
const runAll = fs.readFileSync(path.join(ROOT, "tests/run-all.sh"), "utf8");
const block = runAll.match(/declare -A PART_ENV=\(([\s\S]*?)^\)/m);
const parts = new Map();
for (const m of (block ? block[1] : "").matchAll(/^\s*\[([^\]@]+@[^\]]+)\]=/gm)) {
  const name = m[1];
  const base = name.split("@")[0];
  if (!parts.has(base)) parts.set(base, []);
  parts.get(base).push(name);
}

function testUnits(p) {
  const name = path.posix.basename(p);
  if (name.endsWith(".pw.mjs")) {
    const spec = name.slice(0, -".pw.mjs".length);
    return parts.get(spec) || [spec];
  }
  if (name.endsWith(".test.mjs")) return ["npm"];
  if (/^test_.*\.py$/.test(name)) return ["unittest"];
  return [];
}

// A bare basename that exists in several places goes to the shallowest one(s):
// the root app.css/app.js/index.html win over test fixtures and labs.
const byBase = new Map();
for (const f of files) {
  const base = path.posix.basename(f);
  if (!byBase.has(base)) byBase.set(base, []);
  byBase.get(base).push(f);
}
for (const [base, list] of byBase) {
  if (list.length < 2) continue;
  const depth = Math.min(...list.map((f) => f.split("/").length));
  byBase.set(base, list.filter((f) => f.split("/").length === depth));
}

function resolveRef(token, from) {
  const clean = token.split(/[?#]/)[0];
  if (files.has(clean)) return [clean];
  if (clean.startsWith(".") || clean.startsWith("/")) {
    const rel = path.posix.normalize(
      path.posix.join(path.posix.dirname(from), clean.replace(/^\/+/, "")),
    );
    if (files.has(rel)) return [rel];
  }
  return byBase.get(path.posix.basename(clean)) || [];
}

const units = new Map();
function add(file, names) {
  if (!names.length) return;
  if (!units.has(file)) units.set(file, new Set());
  const set = units.get(file);
  for (const n of names) set.add(n);
}

// (a) tests name/import files.
for (const f of files) {
  if (!isTest(f)) continue;
  const names = testUnits(f);
  add(f, names);
  const text = fs.readFileSync(path.join(ROOT, f), "utf8");
  for (const m of text.matchAll(REF_RE)) {
    for (const target of resolveRef(m[0], f)) add(target, names);
  }
}

// (b) import graph: a helper gets the union of its importers' units.
const graph = new Map();
function edge(from, to) {
  if (!graph.has(from)) graph.set(from, new Set());
  graph.get(from).add(to);
}
function resolveImport(from, spec) {
  const clean = spec.split(/[?#]/)[0];
  if (!/^[./]/.test(clean)) return null;
  const rel = path.posix.normalize(
    path.posix.join(path.posix.dirname(from), clean.replace(/^\/+/, "")),
  );
  return files.has(rel) ? rel : null;
}
const IMPORT_RES = [
  /\b(?:import|export)\b[\s\S]{0,400}?\bfrom\s*["']([^"']+)["']/g,
  /\bimport\s*["']([^"']+)["']/g,
  /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
];
// (b2) Python: a repo-root module imported by a .py file inherits its importer's units.
// `import a, b as c` and `from a.b import x, y as z` (comma lists) both count.
const PY_FROM_RE = /^\s*from\s+([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)\s+import\s+([^\n#]+)/gm;
const PY_IMPORT_RE = /^\s*import\s+([^\n#]+)/gm;
const pyNames = (list) =>
  list.split(",").map((s) => s.trim().replace(/^\(|\)$/g, "").replace(/\s+as\s+\w+$/, ""))
    .filter((s) => /^[A-Za-z_]\w*$/.test(s));
function pyEdge(from, mod) {
  for (const rel of [`${mod.replace(/\./g, "/")}.py`, `${mod.replace(/\./g, "/")}/__init__.py`]) {
    const to = files.has(rel) ? rel : path.posix.normalize(path.posix.join(path.posix.dirname(from), rel));
    if (files.has(to)) edge(from, to);
  }
}
for (const f of files) {
  if (/\.py$/.test(f)) {
    if (f.startsWith("vendor/") || f.startsWith("tests/node_modules/")) continue;
    const text = fs.readFileSync(path.join(ROOT, f), "utf8");
    for (const m of text.matchAll(PY_FROM_RE)) [m[1], ...pyNames(m[2])].forEach((mod) => pyEdge(f, mod));
    for (const m of text.matchAll(PY_IMPORT_RE)) pyNames(m[1]).forEach((mod) => pyEdge(f, mod));
    continue;
  }
  if (!/\.(?:mjs|cjs|js)$/.test(f) || f.startsWith("vendor/")) continue;
  const text = fs.readFileSync(path.join(ROOT, f), "utf8");
  for (const re of IMPORT_RES) {
    for (const m of text.matchAll(re)) {
      const to = resolveImport(f, m[1]);
      if (to) edge(f, to);
    }
  }
}

function propagate() {
  const queue = [];
  const queued = new Set();
  for (const [f, set] of units) if (set.size) { queue.push(f); queued.add(f); }
  for (let i = 0; i < queue.length; i++) {
    const from = queue[i];
    queued.delete(from);
    const set = units.get(from);
    for (const to of graph.get(from) || []) {
      if (!units.has(to)) units.set(to, new Set());
      const target = units.get(to);
      let changed = false;
      for (const u of set) if (!target.has(u)) { target.add(u); changed = true; }
      if (changed && !queued.has(to)) { queue.push(to); queued.add(to); }
    }
  }
}
propagate();

// (c) html shell -> the files it loads, only for files that already have units.
for (const shell of HTML_SHELLS) {
  if (!files.has(shell) || !units.has(shell) || !units.get(shell).size) continue;
  const text = fs.readFileSync(path.join(ROOT, shell), "utf8");
  const re = /<(?:script[^>]*\bsrc|link[^>]*\bhref)\s*=\s*["']([^"']+)["']/gi;
  for (const m of text.matchAll(re)) {
    const src = m[1].split(/[?#]/)[0];
    if (!src || /^(?:[a-z]+:|\/\/)/i.test(src)) continue;
    const rel = path.posix.normalize(path.posix.join(path.posix.dirname(shell), src.replace(/^\/+/, "")));
    if (!files.has(rel) || !units.has(rel) || !units.get(rel).size) continue;
    for (const u of units.get(shell)) units.get(rel).add(u);
  }
}
propagate();

const rows = [];
for (const [file, set] of units) {
  if (!set.size) continue;
  rows.push([file, [...set].sort()]);
}
rows.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
fs.writeFileSync(OUT, rows.map(([f, u]) => `${f}\t${u.join(" ")}`).join("\n") + (rows.length ? "\n" : ""));
console.log(`auto map: ${rows.length} files -> ${OUT}`);
