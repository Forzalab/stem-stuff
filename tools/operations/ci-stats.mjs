#!/usr/bin/env node
/* AC11.1 weekly CI metrics for the tests.yml workflow runs. Pure functions over the runs list; the CLI reads it
   from `gh api` (default) or a file.
   usage: node tools/operations/ci-stats.mjs [--days 7] [--file runs.json]
          --file: a saved `gh api repos/<repo>/actions/workflows/tests.yml/runs` body (or its workflow_runs array).
   Metrics this input can carry (run timestamps, attempts, conclusions). Not carried by runs JSON, so printed as
   "n/a" with the source they need: merge -> live p90 (ship.yml + PR merge times), first-attempt flake rate and jail size
   (flaky.txt + per-attempt job logs), lane max/min ratio (run-all.sh --plan), ship refusals (ship.yml logs). */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const MIN = 60_000;

export function percentile(xs, p) {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.max(0, Math.ceil((p / 100) * s.length) - 1)];
}

const round1 = (x) => (x === null ? null : Math.round(x * 10) / 10);
const share = (n, d) => (d === 0 ? null : Math.round((1000 * n) / d) / 10); // percent, one decimal

// runs: workflow_runs objects from the GitHub API. Only the tests.yml full-suite pushes to main count as "main".
export function summarize(runs) {
  const mainPush = runs.filter((r) => r.event === "push" && r.head_branch === "main" && r.run_started_at && r.created_at);
  const waitMin = mainPush.map((r) => (Date.parse(r.run_started_at) - Date.parse(r.created_at)) / MIN);
  const durMin = mainPush
    .filter((r) => r.status === "completed" && r.updated_at)
    .map((r) => (Date.parse(r.updated_at) - Date.parse(r.run_started_at)) / MIN);
  const completed = runs.filter((r) => r.status === "completed");
  const rerun = runs.filter((r) => (r.run_attempt ?? 1) > 1);
  return {
    runs: runs.length,
    main_pushes: mainPush.length,
    main_group_wait_p90_min: round1(percentile(waitMin, 90)),
    main_run_median_min: round1(percentile(durMin, 50)),
    main_run_p90_min: round1(percentile(durMin, 90)),
    red_percent: share(completed.filter((r) => r.conclusion === "failure").length, completed.length),
    rerun_percent: share(rerun.length, runs.length), // proxy only: a rerun is not yet a first-attempt flake
  };
}

export const NOT_IN_RUNS_JSON = [
  "merge -> live p90 (needs ship.yml runs and PR merge times)",
  "first-attempt flake rate (needs per-attempt job conclusions)",
  "jail size (needs flaky.txt)",
  "lane max/min ratio (needs run-all.sh --plan output)",
  "ship refusals (needs ship.yml logs)",
];

export function format(s, days) {
  const v = (x, unit = "") => (x === null || x === undefined ? "n/a (no data)" : `${x}${unit}`);
  return [
    `CI weekly, last ${days} day(s): ${s.runs} tests.yml runs, ${s.main_pushes} main pushes`,
    `main group wait p90: ${v(s.main_group_wait_p90_min, " min")}   (target: n/a here; live p90 <= 10 min after W5)`,
    `main run median / p90: ${v(s.main_run_median_min, " min")} / ${v(s.main_run_p90_min, " min")}`,
    `red runs: ${v(s.red_percent, "%")}   reruns (run_attempt > 1, proxy): ${v(s.rerun_percent, "%")}   (flake target <= 3%)`,
    `not computed from runs JSON:`,
    ...NOT_IN_RUNS_JSON.map((x) => `  - ${x}`),
  ].join("\n");
}

function fetchRuns(days) {
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const repo = process.env.GITHUB_REPOSITORY || "Forzalab/stem-stuff";
  const body = execFileSync("gh", [
    "api", `repos/${repo}/actions/workflows/tests.yml/runs?per_page=100&created=%3E%3D${since}`,
  ], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return JSON.parse(body).workflow_runs ?? [];
}

function main(argv) {
  const arg = (name, dflt) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : dflt;
  };
  const days = Number(arg("--days", "7"));
  if (!Number.isFinite(days) || days <= 0) {
    console.error("ci-stats: --days wants a positive number");
    return 2;
  }
  const file = arg("--file", null);
  const raw = file ? JSON.parse(fs.readFileSync(file, "utf8")) : { workflow_runs: fetchRuns(days) };
  const runs = Array.isArray(raw) ? raw : raw.workflow_runs ?? [];
  if (!file && runs.length >= 100) {
    console.error("ci-stats: 100 runs is one API page; the window may be truncated (use --days 3 or a saved --file)");
  }
  const cutoff = Date.now() - days * 86_400_000;
  const inWindow = file ? runs.filter((r) => Date.parse(r.created_at) >= cutoff) : runs;
  console.log(format(summarize(inWindow), days));
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  process.exitCode = main(process.argv.slice(2));
}
