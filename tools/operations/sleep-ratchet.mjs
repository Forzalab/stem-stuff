#!/usr/bin/env node
/* AC2.5 sleep ratchet: the count of `waitForTimeout(` in each tests/**\/*.pw.mjs may not go UP.
   The committed baseline tests/sleep-baseline.json holds the count per file (nonzero files only; a missing file = 0).
   usage: node tools/operations/sleep-ratchet.mjs            check: exit 1 if any file's count is above its baseline
          node tools/operations/sleep-ratchet.mjs --write    regenerate the baseline from the tree (only after removing sleeps)
          --root <dir>  check/write under another tree (the unit test uses a temp copy) */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SLEEP = /waitForTimeout\(/g;

export function countSleeps(text) {
  return (text.match(SLEEP) || []).length;
}

// current, baseline: { "tests/x.pw.mjs": n }. Returns [{ file, was, now }] for every file whose count went up.
export function ratchet(baseline, current) {
  const ups = [];
  for (const [file, now] of Object.entries(current)) {
    const was = baseline[file] ?? 0;
    if (now > was) ups.push({ file, was, now });
  }
  return ups.sort((a, b) => a.file.localeCompare(b.file));
}

function walkSpecs(dir, rel, out) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === "node_modules") continue;
    const abs = path.join(dir, ent.name);
    const r = `${rel}/${ent.name}`;
    if (ent.isDirectory()) walkSpecs(abs, r, out);
    else if (ent.name.endsWith(".pw.mjs")) out[r] = countSleeps(fs.readFileSync(abs, "utf8"));
  }
  return out;
}

// { "tests/x.pw.mjs": n } for every spec under <root>/tests, nonzero counts only, sorted by name.
export function countTree(root) {
  const all = walkSpecs(path.join(root, "tests"), "tests", {});
  const out = {};
  for (const f of Object.keys(all).sort()) if (all[f] > 0) out[f] = all[f];
  return out;
}

const total = (m) => Object.values(m).reduce((a, b) => a + b, 0);

function main(argv) {
  const rootArg = argv.indexOf("--root");
  const here = path.dirname(fileURLToPath(import.meta.url));
  const root = rootArg >= 0 ? path.resolve(argv[rootArg + 1]) : path.resolve(here, "../..");
  const basePath = path.join(root, "tests", "sleep-baseline.json");
  const current = countTree(root);
  if (argv.includes("--write")) {
    fs.writeFileSync(basePath, JSON.stringify(current, null, 2) + "\n");
    console.log(`sleep ratchet: wrote ${basePath} (${total(current)} waitForTimeout( in ${Object.keys(current).length} specs)`);
    return 0;
  }
  if (!fs.existsSync(basePath)) {
    console.error(`sleep ratchet: no baseline at ${basePath}; generate it with --write from a known-good tree`);
    return 2;
  }
  const baseline = JSON.parse(fs.readFileSync(basePath, "utf8"));
  const ups = ratchet(baseline, current);
  if (ups.length === 0) {
    console.log(`sleep ratchet: ok (${total(current)} waitForTimeout( in ${Object.keys(current).length} specs, none above baseline)`);
    return 0;
  }
  for (const u of ups) console.error(`sleep ratchet: ${u.file} has ${u.now} waitForTimeout( (baseline ${u.was}); wait on the condition instead of adding a sleep`);
  return 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  process.exitCode = main(process.argv.slice(2));
}
