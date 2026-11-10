#!/usr/bin/env node
/* Affected-only selection for a pull_request run (ticket 09, PR 2): pure decision + CLI.
   The pure part takes every fact as an argument (no git, no network, no subprocess):
     node tools/operations/ci-select.mjs --total <N> [--file <path>]...
   prints "<kind> <reason>" (kind = full | affected | docs) and exits 0. The workflow computes the diff. */
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

// M4: a diff this big is not worth selecting.
export const BIG_CODE_FILES = 7;
export const BIG_AREAS = 3;
// C1: a file that touches this share of the suite is a hub -> full.
export const HUB_FRACTION = 0.90;
// SPEC-09 §docs-only: .md only (loopable, same contract as ci-gate).
export const DOCS_EXTS = [".md"];

const str = (p) => String(p);

export function isCodeFile(path) {
  return !DOCS_EXTS.some((ext) => str(path).endsWith(ext));
}

// SPEC-PR2.md §Design.1: first match wins. tools/*.py and tests/*.py hit 3/4 before 5.
export function areaOf(path) {
  const p = str(path);
  if (DOCS_EXTS.some((ext) => p.endsWith(ext))) return "docs";
  if (p.startsWith(".github/") || p === "vercel.json" || p === ".vercelignore" || p === "deploy.sh") return "ci";
  if (p.startsWith("tools/")) return "tools";
  if (p.startsWith("tests/")) return "tests";
  if (p.endsWith(".py")) return "server";
  return "client";
}

export function areasOf(files) {
  return [...new Set((files || []).map(areaOf))].sort();
}

export function isBig(files) {
  const list = files || [];
  const codeFiles = list.filter(isCodeFile).length;
  return codeFiles >= BIG_CODE_FILES || areasOf(list).length >= BIG_AREAS;
}

export function isHub(affectedCount, totalUnits) {
  return Number(totalUnits) > 0 && Number(affectedCount) / Number(totalUnits) >= HUB_FRACTION;
}

export function pwSpecs(unitList) {
  return (unitList || []).filter((u) => u !== "unittest" && u !== "npm");
}

export function decideSelection({ files, affectedCounts, totalUnits } = {}) {
  const list = files || [];
  const counts = affectedCounts || {};
  if (list.length === 0) return { kind: "full", reason: "no changed files (never fewer)" };
  if (list.every((f) => !isCodeFile(f))) return { kind: "docs", reason: `docs-only: ${list.length} .md files` };
  if (isBig(list)) {
    const codeFiles = list.filter(isCodeFile).length;
    return { kind: "full", reason: `BIG: ${codeFiles} code files / ${areasOf(list).length} areas` };
  }
  for (const f of list) {
    const count = counts[f] ?? 0;
    if (isHub(count, totalUnits)) return { kind: "full", reason: `hub: ${f} affects ${count}/${totalUnits}` };
  }
  return { kind: "affected", reason: "affected subset" };
}

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const RUN_ALL = fileURLToPath(new URL("../../tests/run-all.sh", import.meta.url));

// Count a file's affected units; the unmapped: diagnostic is stdout but is not a unit.
function affectedCount(file) {
  let out = "";
  try {
    out = execFileSync("bash", [RUN_ALL, "--affected", file], { cwd: ROOT, encoding: "utf8" });
  } catch (e) {
    throw new Error(`run-all.sh --affected ${file} failed: ${e.message}`);
  }
  return out.split("\n").map((s) => s.trim()).filter((l) => l && !l.startsWith("unmapped:")).length;
}

function parseArgs(argv) {
  const out = { total: null, files: [], help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], v = argv[i + 1];
    if (a === "--total") {
      if (v == null) throw new Error("--total needs a value");
      out.total = Number(v); i++;
    } else if (a === "--file") {
      if (v == null) throw new Error("--file needs a value");
      out.files.push(v); i++;
    } else if (a === "-h" || a === "--help") out.help = true;
    else throw new Error(`unknown argument: ${a}`);
  }
  if (out.total != null && (!Number.isInteger(out.total) || out.total <= 0)) throw new Error("--total must be a positive integer");
  return out;
}

function main(argv) {
  let opts;
  try { opts = parseArgs(argv); } catch (e) { console.error(`ci-select: ${e.message}`); return 2; }
  if (opts.help) { console.log("usage: node tools/operations/ci-select.mjs --total <N> [--file <path>]..."); return 0; }
  if (opts.total == null) { console.error("ci-select: --total is required"); return 2; }

  const affectedCounts = {};
  for (const f of opts.files) {
    try { affectedCounts[f] = affectedCount(f); } catch (e) { console.error(`ci-select: ${e.message}`); return 2; }
  }
  const d = decideSelection({ files: opts.files, affectedCounts, totalUnits: opts.total });
  console.log(`${d.kind} ${d.reason}`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(main(process.argv.slice(2)));
