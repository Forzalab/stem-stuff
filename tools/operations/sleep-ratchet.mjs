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

// CI-ARCH B2: the summed literal ms of waitForTimeout(<number>) in a spec (a non-literal arg counts 0). Its own baseline,
// tests/sleep-ms-baseline.json, may not go up either: swapping one sleep for a longer one is still more sleep.
const SLEEP_MS = /waitForTimeout\(\s*([0-9][0-9_]*)\s*[,)]/g;
export function sumSleepMs(text) {
  let n = 0; for (const m of text.matchAll(SLEEP_MS)) n += +m[1].replace(/_/g, ""); return n;
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

function walkSpecs(dir, rel, out, count = countSleeps) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === "node_modules") continue;
    const abs = path.join(dir, ent.name);
    const r = `${rel}/${ent.name}`;
    if (ent.isDirectory()) walkSpecs(abs, r, out, count);
    else if (ent.name.endsWith(".pw.mjs")) out[r] = count(fs.readFileSync(abs, "utf8"));
  }
  return out;
}

// { "tests/x.pw.mjs": n } for every spec under <root>/tests, nonzero counts only, sorted by name.
export function countTree(root, count = countSleeps) {
  const all = walkSpecs(path.join(root, "tests"), "tests", {}, count);
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
  const msPath = path.join(root, "tests", "sleep-ms-baseline.json"), currentMs = countTree(root, sumSleepMs);
  if (argv.includes("--write")) {
    fs.writeFileSync(basePath, JSON.stringify(current, null, 2) + "\n");
    fs.writeFileSync(msPath, JSON.stringify(currentMs, null, 2) + "\n");
    console.log(`sleep ratchet: wrote ${basePath} (${total(current)} waitForTimeout( in ${Object.keys(current).length} specs)`);
    return 0;
  }
  if (!fs.existsSync(basePath)) {
    console.error(`sleep ratchet: no baseline at ${basePath}; generate it with --write from a known-good tree`);
    return 2;
  }
  const baseline = JSON.parse(fs.readFileSync(basePath, "utf8"));
  const ups = ratchet(baseline, current);
  const msUps = fs.existsSync(msPath) ? ratchet(JSON.parse(fs.readFileSync(msPath, "utf8")), currentMs) : [];
  for (const u of msUps) console.error(`sleep ratchet: ${u.file} sleeps ${u.now} ms in total (baseline ${u.was} ms); wait on the condition instead of a longer sleep`);
  if (ups.length === 0 && msUps.length === 0) {
    console.log(`sleep ratchet: ok (${total(current)} waitForTimeout( in ${Object.keys(current).length} specs, none above baseline; ${total(currentMs)} ms summed)`);
    return 0;
  }
  for (const u of ups) console.error(`sleep ratchet: ${u.file} has ${u.now} waitForTimeout( (baseline ${u.was}); wait on the condition instead of adding a sleep`);
  return 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  process.exitCode = main(process.argv.slice(2));
}
