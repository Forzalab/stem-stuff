#!/usr/bin/env node
import { execFileSync } from "node:child_process";

const git = (...a) => execFileSync("git", a, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const die = (msg) => { console.error(`side-artifacts: ${msg}`); process.exit(2); };

let base = "origin/main";
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--base") base = argv[++i] ?? die("--base needs a sha");
  else if (a === "-h" || a === "--help") {
    console.log([
      "usage: tests/rails/side-artifacts.mjs [--base <sha>]",
      "  default base: origin/main",
      "  rule: every new client .js/.mjs must be in sw.js BASE; index.html too unless some file imports it",
      "  smoke (real miss): --base bd79fc0^   (bd79fc0 adds login.js; mycluck.mjs is missing from sw.js)",
    ].join("\n"));
    process.exit(0);
  }
  else die(`unknown argument: ${a}`);
}

process.chdir(git("rev-parse", "--show-toplevel").trim());
const head = git("rev-parse", "HEAD").trim();
try { git("rev-parse", "--verify", `${base}^{commit}`); } catch { die(`bad base '${base}'`); }

const norm = (p) => p.replace(/^\.\/+/, "").replace(/^\/+/, "").split(/[?#]/)[0];
const isClient = (p) => /\.m?js$/.test(p) && !/^(tests|tools|\.github|api|node_modules)\//.test(p);
const show = (p) => git("show", `${head}:${p}`);
const exists = (p) => { try { execFileSync("git", ["cat-file", "-e", `${head}:${p}`], { stdio: "ignore" }); return true; } catch { return false; } };

function swBase() {
  const text = show("sw.js");
  const m = text.match(/const\s+BASE\s*=\s*\[([\s\S]*?)\];/);
  if (!m) die("sw.js: BASE array not found");
  const set = new Set();
  for (const raw of m[1].split(",")) { const q = raw.trim().match(/^"([^"]+)"$/); if (q) set.add(norm(q[1])); }
  return set;
}

function indexLists() {
  const set = new Set();
  const text = show("index.html");
  for (const m of text.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi)) set.add(norm(m[1]));
  for (const m of text.matchAll(/<link\b[^>]*>/gi)) {
    if (!/\brel\s*=\s*["'][^"']*\bmodulepreload\b[^"']*["']/i.test(m[0])) continue;
    const h = m[0].match(/\bhref\s*=\s*["']([^"']+)["']/i);
    if (h) set.add(norm(h[1]));
  }
  return set;
}

const range = `${base}...${head}`;
const candidates = new Set();
for (const line of git("diff", "--name-status", "--diff-filter=A", range).split("\n")) {
  if (!line) continue;
  const p = line.split("\t").pop();
  if (isClient(p)) candidates.add(norm(p));
}

const STR = /["'`]([^"'`]+)["'`]/g;
function importsOf(cur, body) {
  const specs = [];
  for (const m of body.matchAll(/\bimport\s*\(([^)]*)\)/g)) for (const s of m[1].matchAll(STR)) specs.push(s[1]);
  for (const m of body.matchAll(/\bimport\s+(?:[^"'();]*?\bfrom\s+)?["']([^"']+)["']/g)) specs.push(m[1]);
  for (const m of body.matchAll(/\bexport\s+[^"';]*?\bfrom\s+["']([^"']+)["']/g)) specs.push(m[1]);
  const dir = cur.includes("/") ? cur.slice(0, cur.lastIndexOf("/") + 1) : "";
  return specs.filter((s) => !/^[a-z][a-z0-9+.-]*:/i.test(s) && !s.startsWith("//") && /\.m?js$/.test(s))
    .map((s) => (s.startsWith("/") ? norm(s) : norm(dir + s))).filter(exists);
}
let cur = null;
for (const line of git("diff", "--unified=0", range).split("\n")) {
  if (line.startsWith("+++ ")) { cur = line.startsWith("+++ b/") ? line.slice(6) : null; continue; }
  if (!line.startsWith("+") || !cur || !isClient(cur)) continue;
  for (const p of importsOf(cur, line.slice(1))) candidates.add(p);
}

// imported anywhere at HEAD (module graph): such files need no <script src>
const imported = new Set();
for (const f of git("ls-files", "-z").split("\0")) if (isClient(f)) for (const p of importsOf(f, show(f))) imported.add(p);

const sw = swBase();
const html = indexLists();
const missing = [];
for (const p of [...candidates].sort()) {
  const importOnly = imported.has(p);
  const why = [!sw.has(p) && "sw.js BASE", !importOnly && !html.has(p) && "index.html"].filter(Boolean).join(" + ");
  if (why) missing.push({ p, why });
}

if (!missing.length) { console.log(`side-artifacts: ok (${candidates.size} new client file(s), base ${base})`); process.exit(0); }
console.error(`side-artifacts: FAIL, ${missing.length} new client file(s) missing (base ${base}):`);
for (const m of missing) console.error(`  ${m.p}  missing from ${m.why}`);
process.exit(1);
