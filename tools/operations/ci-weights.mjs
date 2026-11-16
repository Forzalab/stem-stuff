#!/usr/bin/env node
/* Per-spec CI weights (W6 shard balance): pure parse + median, CLI reads saved job logs offline.
     node tools/operations/ci-weights.mjs --from-runs 12 [--logs <dir>] > tests/weights.json
   <dir> (default ci-logs/) holds one run-all.sh job log per file (log-*.txt, as the Actions API returns them).
   --from-runs N = the N newest log files (name order, last = newest); omit = all. A job log has lines
     "lane 2: spec-a spec-b ..."  and per spec  "ok   spec-a 12.3 s"  /  "FAIL spec-b 4.0 s"  (PASS accepted too);
   the Actions "<timestamp>Z " prefix and "##[group]" are ignored. Output: {"spec": median seconds (integer >= 1)}, keys sorted.
   tests/run-all.sh reads that file; a unit it lacks keeps its weight() table value. */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const LINE = /^(?:\S+Z )?(?:ok|PASS|FAIL) +(\S+) +([0-9]+(?:\.[0-9]+)?) s\s*$/;

/** One job log -> [[spec, seconds], ...] in log order. Pure. */
export function parseLog(text) {
  const out = [];
  for (const raw of String(text).split(/\r?\n/)) {
    const m = LINE.exec(raw);
    if (m) out.push([m[1], Number(m[2])]);
  }
  return out;
}

export function median(xs) {
  const a = [...xs].sort((x, y) => x - y);
  if (!a.length) return 0;
  const h = a.length >> 1;
  return a.length % 2 ? a[h] : (a[h - 1] + a[h]) / 2;
}

/** logs: array of log texts -> {spec: median seconds, integer >= 1}, keys sorted. Pure. */
export function weightsFromLogs(logs) {
  const samples = new Map();
  for (const t of logs) for (const [s, sec] of parseLog(t)) (samples.get(s) ?? samples.set(s, []).get(s)).push(sec);
  const out = {};
  for (const s of [...samples.keys()].sort()) out[s] = Math.max(1, Math.round(median(samples.get(s))));
  return out;
}

/** Newest N names from a name-sorted listing (N <= 0 / not a number = all). Pure. */
export function pickRuns(names, n) {
  const a = [...names].sort();
  return Number.isInteger(n) && n > 0 ? a.slice(-n) : a;
}

function main(argv) {
  let n = 0, dir = "ci-logs";
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--from-runs") n = Number(argv[++i]);
    else if (argv[i] === "--logs") dir = argv[++i];
    else { console.error("usage: ci-weights.mjs --from-runs N [--logs <dir>]"); return 2; }
  }
  const names = readdirSync(dir).filter((f) => /^log-.*\.txt$/.test(f));
  const picked = pickRuns(names, n);
  if (!picked.length) { console.error(`no log-*.txt in ${dir}`); return 1; }
  process.stdout.write(JSON.stringify(weightsFromLogs(picked.map((f) => readFileSync(join(dir, f), "utf8"))), null, 1) + "\n");
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(main(process.argv.slice(2)));
