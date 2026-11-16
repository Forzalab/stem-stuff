#!/usr/bin/env node
/* The ship gate (ticket 09, PR 1): pure decision + CLI. .github/workflows/ship.yml runs the CLI right before
   tools/build_and_ship/ship.sh and fails the job on a non-zero exit, so no SHA deploys without a FULL green tests.yml run on
   that exact SHA (or a later docs-only diff from the last full-green run).
     node tools/operations/ci-gate.mjs --candidate <sha> --runs <runs.json> [--file <path>]...
   The pure path (isDocsOnly/classify/runKind/pickGreen/decideShip) takes its facts as arguments: no git, no network.
   Only the CLI adds the two real-world reads (runs.json from `gh api`, and `git diff --name-only` when --file is absent). */
import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { attemptColor } from "./ci-retry.mjs";

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

// How a GitHub Actions run maps to full/fast/bench/affected/unknown TODAY (SOURCE: tests.yml).
// Only 'full' can clear a SHA; a pull_request run is 'affected' (PR 2 selection) and can never ship.
export function runKind(run) {
  const r = run || {};
  if (r.event === "push") return "full";                                // main push: the full suite (backstop)
  if (r.event === "schedule") return "full";                            // nightly: the full suite on main (R3)
  if (r.event === "pull_request") return "affected";                    // PR 2: affected selection, never a ship run
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

// Flaky jail (Tony, Nov 15): tests/quarantine.json = [{spec, test ("*" or title), owner, reason, added (ISO date), expires (added+7d)}].
// An entry past `expires` is ignored (that spec gates again). A stopgap: race/async flakes get fixed, not jailed.
export const JAIL_DAYS = 7;
// `expires: D` is a DATE: live through D 23:59:59Z, dead at D+1 00:00Z (so the expiry instant is D + 1 day).
export const expiryOf = (e) => {
  const t = Date.parse((e && e.expires) || "");
  if (!Number.isNaN(t)) return t + 864e5;
  const a = Date.parse((e && e.added) || "");
  return Number.isNaN(a) ? 0 : a + (JAIL_DAYS + 1) * 864e5;   // no expires: added + 7d; unparseable = already expired
};
export const JAIL_MAX = 5, JAIL_NO_RENEW_DAYS = 21, JAIL_NEVER = /^(unittest|npm|batch|codemap)$/;
export const isJailed = (e, now) => expiryOf(e) > now;
export const expiredJail = (jail, now) => (jail || []).filter((e) => !isJailed(e, now));
export const jailedSpecs = (jail, now) => new Set((jail || []).filter((e) => isJailed(e, now)).map((e) => e.spec));
// The log only names the failed SPEC (run-all.sh "FAIL <spec>"), so a jail entry matches by spec whatever its `test` field.

// The jail's rules, pure. The unit test feeds it tests/quarantine.json, `git show origin/main:tests/quarantine.json`
// (prev) and `tests/run-all.sh --list` (units). Returns the violations (empty = ok).
//   spec = a unit name as run-all.sh prints it (`flow`, `desk-layout@3`; no .mjs), never unittest|npm|batch|codemap
//   reason = an issue ref (#123 or a URL); expires - added <= 7d; at most 5 entries
//   no renewal: an entry's expires may not move later than on main; a spec whose entry expired < 21 days before `now`
//   may not be added again.
export function jailViolations(jail, { units, prev = [], now } = {}) {
  if (!Array.isArray(jail)) return ["jail is not an array"];
  const errs = [], seen = new Set();
  if (jail.length > JAIL_MAX) errs.push(`${jail.length} entries, cap is ${JAIL_MAX}`);
  for (const e of jail) {
    const id = e && e.spec;
    for (const k of ["spec", "test", "owner", "reason", "added", "expires"]) if (!e || !e[k]) errs.push(`entry ${id} lacks ${k}`);
    if (!e) continue;
    if (seen.has(id)) errs.push(`${id}: listed twice`);
    seen.add(id);
    if (JAIL_NEVER.test(String(id))) errs.push(`${id}: may not be jailed (one unit hides many specs)`);
    else if (units && !units.includes(id)) errs.push(`${id}: not a unit name in run-all.sh --list (write flow, not flow.pw.mjs)`);
    if (e.reason && !/#\d+|https?:\/\//.test(e.reason)) errs.push(`${id}: reason must be an issue ref (#123 or a URL)`);
    const a = Date.parse(e.added), x = Date.parse(e.expires);
    if (Number.isNaN(a) || Number.isNaN(x)) errs.push(`${id}: added/expires are not dates`);
    else if (x - a > JAIL_DAYS * 864e5) errs.push(`${id}: expires more than ${JAIL_DAYS}d after added`);
    const old = (prev || []).find((p) => p.spec === id);
    if (!old) continue;
    if (x > Date.parse(old.expires)) errs.push(`${id}: expires moved later than on main (no renewal)`);
    else if (now != null && expiryOf(old) <= now && now - expiryOf(old) < JAIL_NO_RENEW_DAYS * 864e5 && old.expires !== e.expires) errs.push(`${id}: entry expired ${old.expires}, less than ${JAIL_NO_RENEW_DAYS}d ago: no re-adding`);
  }
  return errs;
}

// The attempt-1 FAIL lines run-all.sh prints in a job log, e.g. `2026-11-14T10:22:31.1234567Z lane 2: FAIL flow 39.6 s`.
// Same regex as the `sed -nE` in .github/workflows/ship.yml (keep them equal).
export const FAIL_LINE = /^[0-9TZ:.-]* *(?:lane [0-9]+: *)?FAIL ([^ ]+) +[0-9.]+ s$/;
export function parseFailedSpecs(log) {
  const out = [];
  for (const l of String(log).split("\n")) { const m = FAIL_LINE.exec(l.replace(/\r$/, "")); if (m && !out.includes(m[1])) out.push(m[1]); }
  return out;
}

// Yellow rule (Tony, Nov 15): a success on attempt >= 2 may clear the gate only if run.failed_specs (the specs that failed
// on attempt 1) is non-empty and every one is in the unexpired jail. Unknown/empty list = refused (fail closed).
export function yellowVerdict(run, jail, now = runAt(run)) {   // now = the run's created_at, never wall clock
  const f = run && run.failed_specs;
  if (!Array.isArray(f) || !f.length) return { ok: false, reason: "yellow run (passed only on a rerun): attempt-1 failed specs unknown, refused" };
  const live = jailedSpecs(jail, now), bad = [];
  for (const spec of f) {
    if (live.has(spec)) continue;
    const old = (jail || []).find((e) => e.spec === spec);
    bad.push(old ? `${spec} (jail entry expired ${old.expires || "?"})` : `${spec} (not in flaky jail)`);
  }
  return bad.length ? { ok: false, reason: `yellow run refused: ${bad.join(", ")}` } : { ok: true, reason: "yellow ok: all attempt-1 failures are jailed" };
}
export const yellowCleared = (run, jail, now) => yellowVerdict(run, jail, now).ok;

// The newest successful FULL run on main. A newer FAILED run never masks an older green (STALE-STATE, M3);
// other branches and fast/bench/unknown kinds never qualify. A yellow (success only on a rerun, attempt
// >= 2) is never a green anchor: the ship gate refuses yellow (R4, SPEC-PR3.md §6). null = nothing to ship from.
export function pickGreen(runs, candidate, { jail = [], now } = {}) {   // now omitted = each run is judged at its own created_at
  const green = (runs || [])
    .filter((r) => r && r.conclusion === "success" && r.head_branch === "main" && runKind(r) === "full"
      && (attemptColor(r) === "green" || (attemptColor(r) === "yellow" && yellowCleared(r, jail, now ?? runAt(r)))))
    .sort((a, b) => runAt(b) - runAt(a) || (a.head_sha === candidate ? -1 : b.head_sha === candidate ? 1 : 0))[0];
  return green ? { sha: green.head_sha, kind: "full", created_at: green.created_at } : null;
}

// M1/M2/M3: the exact green SHA ships whatever its diff; otherwise the diff since that SHA must be docs-only/empty.
export function decideShip({ candidate, green, changedFiles, yellowWhy } = {}) {
  if (!green) return { ok: false, reason: yellowWhy || "no successful full tests.yml run on main" };
  if (green.kind !== "full") return { ok: false, reason: `last green run is kind ${green.kind}, not a full run` };
  if (green.sha === candidate) return { ok: true, reason: `full green run on ${candidate}` };
  const { docs, code } = classify(changedFiles || []);
  if (code.length) {
    const shown = code.slice(0, 3).join(", ") + (code.length > 3 ? ` (+${code.length - 3} more)` : "");
    return { ok: false, reason: `${code.length} code file(s) changed since full green ${green.sha}: ${shown}` };
  }
  return { ok: true, reason: docs.length ? `docs-only diff since full green ${green.sha}` : `empty diff since full green ${green.sha}` };
}

function parseArgs(argv) {
  const out = { candidate: "", runs: "", files: [], failedSpecs: null, jail: "tests/quarantine.json", help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], v = argv[i + 1];
    if ((a === "--candidate" || a === "--runs" || a === "--file" || a === "--jail" || a === "--failed-specs") && v == null) throw new Error(`${a} needs a value`);
    if (a === "--candidate") { out.candidate = v; i++; }
    else if (a === "--runs") { out.runs = v; i++; }
    else if (a === "--failed-specs") { out.failedSpecs = v.split(",").map((x) => x.trim()).filter(Boolean); i++; }
    else if (a === "--jail") { out.jail = v; i++; }
    else if (a === "--file") { out.files.push(v); i++; }
    else if (a === "-h" || a === "--help") out.help = true;
    else throw new Error(`unknown argument: ${a}`);
  }
  return out;
}

function main(argv) {
  let opts;
  try { opts = parseArgs(argv); } catch (e) { console.error(`ci-gate: ${e.message}`); return 2; }
  if (opts.help) { console.log("usage: node tools/operations/ci-gate.mjs --candidate <sha> --runs <runs.json> [--file <path>]... [--jail <quarantine.json>] [--failed-specs a.mjs,b.mjs]"); return 0; }
  if (!opts.candidate || !opts.runs) { console.error("ci-gate: --candidate and --runs are required"); return 2; }

  let runs;
  const runsPath = opts.runs;
  try { runs = JSON.parse(readFileSync(runsPath, "utf8")); } catch (e) { console.error(`ci-gate: cannot read ${runsPath}: ${e.message}`); return 2; }
  let jail = [];
  if (existsSync(opts.jail)) {
    try { jail = JSON.parse(readFileSync(opts.jail, "utf8")); } catch (e) { console.error(`ci-gate: cannot read ${opts.jail}: ${e.message}`); return 2; }
  }
  const now = Date.now();
  for (const e of expiredJail(jail, now)) console.error(`EXPIRED JAIL ENTRY (gating again, fix it or remove it): ${e.spec} [${e.test || "*"}] owner=${e.owner} added=${e.added} expires=${e.expires}`);
  // --failed-specs = the specs that failed on attempt 1 of the candidate's yellow run (ship.yml reads them from the attempt-1 logs)
  if (opts.failedSpecs) for (const r of runs) if (r && r.head_sha === opts.candidate && r.failed_specs == null) r.failed_specs = opts.failedSpecs;
  const green = pickGreen(runs, opts.candidate, { jail });   // no wall clock: each run is judged at its created_at
  const y = green ? null : runs.find((r) => r && r.head_sha === opts.candidate && r.head_branch === "main" && runKind(r) === "full" && r.conclusion === "success" && attemptColor(r) === "yellow");
  const yellowWhy = y ? yellowVerdict(y, jail).reason : "";

  let changedFiles = opts.files;
  if (!changedFiles.length && green && green.sha !== opts.candidate) {   // the exact green sha needs no diff
    try { changedFiles = execFileSync("git", ["diff", "--name-only", green.sha, opts.candidate], { encoding: "utf8" }).split("\n").map((s) => s.trim()).filter(Boolean); }
    catch (e) { console.error(`ci-gate: git diff ${green.sha}..${opts.candidate} failed: ${e.message}`); return 2; }
  }

  const d = decideShip({ candidate: opts.candidate, green, changedFiles, yellowWhy });
  if (d.ok) { console.log(`ok: ${d.reason}`); return 0; }
  console.error(`refused: ${d.reason}`);
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(main(process.argv.slice(2)));
