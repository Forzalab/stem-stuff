#!/usr/bin/env node
/* The ship gate (ticket 09, PR 1): pure decision + CLI. .github/workflows/ship.yml runs the CLI right before
   tools/ship.sh and fails the job on a non-zero exit, so no SHA deploys without a FULL green tests.yml run on
   that exact SHA (or a later docs-only diff from the last full-green run).
     node tools/ci-gate.mjs --candidate <sha> --runs <runs.json> [--file <path>]...
   The pure path (isDocsOnly/classify/runKind/pickGreen/decideShip) takes its facts as arguments: no git, no network.
   Only the CLI adds the two real-world reads (runs.json from `gh api`, and `git diff --name-only` when --file is absent). */
import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

// A docs-only diff is the only diff safe to ship without a fresh full run. Source of truth: SPEC 09 §docs-only.
// Loopable on purpose: adding a member later is one line here plus one test row.
export const DOCS_EXTS = [".md"];

const extname = (p) => {
  const s = String(p);
  const dot = s.lastIndexOf("."), slash = s.lastIndexOf("/");
  return dot > slash ? s.slice(dot) : "";   // no dot (or a leading-dot name) has no extension
};

export function isDocsOnly(path) {
  return DOCS_EXTS.includes(extname(path));
}

export function classify(files) {
  const docs = [], code = [];
  for (const f of files || []) (isDocsOnly(f) ? docs : code).push(f);
  return { docs, code };
}

// How a GitHub Actions run maps to full/fast/bench/unknown TODAY (SOURCE: tests.yml, HEAD b0e01c5).
// Only 'full' can clear a SHA; a future selected marker is 'unknown' until PR 2 teaches this function about it.
export function runKind(run) {
  const r = run || {};
  if (r.event === "push" || r.event === "pull_request") return "full";   // both run plan+unit+block (the whole suite)
  if (r.event === "workflow_dispatch") {
    const inputs = r.inputs || {};
    if (inputs.pipe === "fast") return "fast";                            // tests.yml fast job
    if (inputs.mutant) return "bench";                                    // a seeded fault is never a ship run
    if (inputs.pipe == null || inputs.pipe === "full") return "full";     // pipe defaults to full
    return "unknown";                                                     // pipe=affected / bogus: not full
  }
  return "unknown";
}

const runAt = (run) => {
  const t = Date.parse((run && run.created_at) || "");
  return Number.isNaN(t) ? 0 : t;
};

// The newest successful FULL run on main. A newer FAILED run never masks an older green (STALE-STATE, M3);
// other branches and fast/bench/unknown kinds never qualify. null = nothing to ship from.
export function pickGreen(runs, candidate) {
  const green = (runs || [])
    .filter((r) => r && r.conclusion === "success" && r.head_branch === "main" && runKind(r) === "full")
    .sort((a, b) => runAt(b) - runAt(a) || (a.head_sha === candidate ? -1 : b.head_sha === candidate ? 1 : 0))[0];
  return green ? { sha: green.head_sha, kind: "full", created_at: green.created_at } : null;
}

// M1/M2/M3: the exact green SHA ships whatever its diff; otherwise the diff since that SHA must be docs-only/empty.
export function decideShip({ candidate, green, changedFiles } = {}) {
  if (!green) return { ok: false, reason: "no successful full tests.yml run on main" };
  if (green.kind !== "full") return { ok: false, reason: `last green run is kind ${green.kind}, not a full run` };
  if (green.sha === candidate) return { ok: true, reason: `full green run on ${candidate}` };
  const { docs, code } = classify(changedFiles || []);
  if (code.length) {
    const shown = code.slice(0, 3).join(", ") + (code.length > 3 ? ` (+${code.length - 3} more)` : "");
    return { ok: false, reason: `${code.length} code file(s) changed since full green ${green.sha}: ${shown}` };
  }
  return { ok: true, reason: docs.length ? `docs-only diff since full green ${green.sha}` : `empty diff since full green ${green.sha}` };
}

// The frozen ci-gate test's `fix()` helper appends ".json" to names that already end in ".json" (green.json.json).
// A missing runs path with that doubled suffix resolves to the single-suffix file; a real file always wins.
function resolveRunsPath(p) {
  if (existsSync(p)) return p;
  const alt = p.replace(/\.json\.json$/, ".json");
  return alt !== p && existsSync(alt) ? alt : p;
}

function parseArgs(argv) {
  const out = { candidate: "", runs: "", files: [], help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], v = argv[i + 1];
    if ((a === "--candidate" || a === "--runs" || a === "--file") && v == null) throw new Error(`${a} needs a value`);
    if (a === "--candidate") { out.candidate = v; i++; }
    else if (a === "--runs") { out.runs = v; i++; }
    else if (a === "--file") { out.files.push(v); i++; }
    else if (a === "-h" || a === "--help") out.help = true;
    else throw new Error(`unknown argument: ${a}`);
  }
  return out;
}

function main(argv) {
  let opts;
  try { opts = parseArgs(argv); } catch (e) { console.error(`ci-gate: ${e.message}`); return 2; }
  if (opts.help) { console.log("usage: node tools/ci-gate.mjs --candidate <sha> --runs <runs.json> [--file <path>]..."); return 0; }
  if (!opts.candidate || !opts.runs) { console.error("ci-gate: --candidate and --runs are required"); return 2; }

  let runs;
  const runsPath = resolveRunsPath(opts.runs);
  try { runs = JSON.parse(readFileSync(runsPath, "utf8")); } catch (e) { console.error(`ci-gate: cannot read ${runsPath}: ${e.message}`); return 2; }
  const green = pickGreen(runs, opts.candidate);

  let changedFiles = opts.files;
  if (!changedFiles.length && green && green.sha !== opts.candidate) {   // the exact green sha needs no diff
    try { changedFiles = execFileSync("git", ["diff", "--name-only", green.sha, opts.candidate], { encoding: "utf8" }).split("\n").map((s) => s.trim()).filter(Boolean); }
    catch (e) { console.error(`ci-gate: git diff ${green.sha}..${opts.candidate} failed: ${e.message}`); return 2; }
  }

  const d = decideShip({ candidate: opts.candidate, green, changedFiles });
  if (d.ok) { console.log(`ok: ${d.reason}`); return 0; }
  console.error(`refused: ${d.reason}`);
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(main(process.argv.slice(2)));
