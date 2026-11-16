#!/usr/bin/env node
/* C3 (CI-ARCH Sprint C3): the auto-jail bot. Pure decision + two CLIs. No deps, no clock of its own:
   `now` is passed in (the CLI uses Date.now()); the tests pass a fixed now.
     node tools/operations/ci-jail.mjs <history.json> [jail.json=tests/quarantine.json] [--write]
     node tools/operations/ci-jail.mjs collect <repo> [n=20]
   history.json = [{run_id, url, flaky: [spec, ...]}] newest first (completed main push runs of tests.yml).
   The jail rules (JAIL_DAYS, JAIL_MAX, JAIL_NO_RENEW_DAYS, JAIL_NEVER, isJailed, expiryOf, jailViolations) live in
   ci-gate.mjs; this module only decides which specs to add/remove and never re-defines a rule. */
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  JAIL_DAYS, JAIL_MAX, JAIL_NO_RENEW_DAYS, JAIL_NEVER, expiryOf, isJailed, jailViolations,
} from "./ci-gate.mjs";

const DAY = 864e5;
const WINDOW = 20;                                   // the flake window: the newest 20 main push runs
const isoDate = (t) => new Date(t).toISOString().slice(0, 10);
const plusDays = (date, n) => isoDate(Date.parse(`${date}T00:00:00Z`) + n * DAY);
const flakesOf = (r) => (Array.isArray(r && r.flaky) ? r.flaky : []);

/* Pure: history + jail + now -> the next jail. `units` is run-all.sh --list (optional; when omitted the unit-name rule is
   not checked). Rules (SPEC C3):
     ADD    count >= 3 in the newest 20, not live-jailed, not JAIL_NEVER, in units, no re-add inside JAIL_NO_RENEW_DAYS
     REMOVE a live entry with 0 flakes in the newest 20 when history has >= 20 runs; expired entries are dropped as cleanup
     CAP    never more than JAIL_MAX live entries; the overflow is reported as capHit + skipped */
export function decideJail({ history = [], jail = [], now = Date.now(), units } = {}) {
  const all = Array.isArray(history) ? history : [];
  const window = all.slice(0, WINDOW);
  const count = new Map(), newestRun = new Map();
  for (const r of window) {
    for (const spec of new Set(flakesOf(r))) {
      count.set(spec, (count.get(spec) || 0) + 1);
      if (!newestRun.has(spec)) newestRun.set(spec, r);       // window is newest first: first hit = newest run
    }
  }

  const prev = Array.isArray(jail) ? jail : [];
  const live = prev.filter((e) => e && isJailed(e, now));
  const liveSpecs = new Set(live.map((e) => e.spec));
  const oldEntry = (spec) => prev.find((e) => e && e.spec === spec);

  const removed = [], kept = [];
  for (const e of prev) {
    if (!e) continue;
    if (!isJailed(e, now)) { removed.push(e.spec); continue; }                  // expired: cleanup
    if ((count.get(e.spec) || 0) === 0 && all.length >= WINDOW) { removed.push(e.spec); continue; }
    kept.push(e);
  }

  const skipped = [], qualified = [];
  for (const [spec, n] of count) {
    if (n < 3) continue;
    if (liveSpecs.has(spec)) { skipped.push({ spec, why: "already jailed" }); continue; }
    if (JAIL_NEVER.test(spec)) { skipped.push({ spec, why: "may not be jailed (JAIL_NEVER)" }); continue; }
    if (units && !units.includes(spec)) { skipped.push({ spec, why: "not a unit name in run-all.sh --list" }); continue; }
    const old = oldEntry(spec);
    if (old && now - expiryOf(old) < JAIL_NO_RENEW_DAYS * DAY) {
      skipped.push({ spec, why: `expired ${old.expires}, less than ${JAIL_NO_RENEW_DAYS}d ago: no re-adding` });
      continue;
    }
    qualified.push({ spec, count: n });
  }
  // deterministic: worst flakes first, then name; the cap then cuts the same specs on every run
  qualified.sort((a, b) => b.count - a.count || a.spec.localeCompare(b.spec));

  const added = [], addedEntries = [], capSkipped = [];
  const next = kept.slice();
  for (const { spec, count: n } of qualified) {
    if (next.length >= JAIL_MAX) { capSkipped.push(spec); continue; }
    const addedOn = isoDate(now);
    const run = newestRun.get(spec) || {};
    addedEntries.push({
      spec,
      test: "*",
      owner: "ci-jail bot",
      reason: `${run.url || ""} (${n}/${WINDOW} flaky)`.trim(),
      added: addedOn,
      expires: plusDays(addedOn, JAIL_DAYS),
    });
    added.push(spec);
  }
  next.push(...addedEntries);
  for (const spec of capSkipped) skipped.push({ spec, why: `cap ${JAIL_MAX} hit` });

  // jailViolations' no-renewal guard treats ANY later expiry as a renewal, even when the old entry expired longer than
  // JAIL_NO_RENEW_DAYS ago. A re-add after that window is exactly that case, and the 21-day rule above already vetted
  // it, so the old expired entry is history and is not passed as `prev` for the specs we deliberately re-added.
  const reAdded = new Set(added.filter((spec) => oldEntry(spec)));
  const prevForCheck = prev.filter((e) => !(e && reAdded.has(e.spec)));
  const violations = jailViolations(next, { units, prev: prevForCheck, now });
  if (violations.length) throw new Error(`ci-jail: decideJail produced an invalid jail: ${violations.join("; ")}`);
  return { next, added, removed, capHit: capSkipped.length > 0, skipped };
}

/* collect: the last n completed push runs of tests.yml on main -> history.json (newest first). Each run's
   flaky-block-* artifact holds flaky.txt (one spec per line); a run with no artifact (or a download error) = flaky []. */
export function collectHistory(repo, n = WINDOW) {
  const size = Math.max(1, Number(n) || WINDOW);
  const api = spawnSync("gh", [
    "api",
    `repos/${repo}/actions/workflows/tests.yml/runs?branch=main&event=push&status=completed&per_page=${Math.min(100, size)}`,
  ], { encoding: "utf8" });
  if (api.status !== 0) throw new Error(`gh api failed: ${(api.stderr || api.stdout || "").trim()}`);
  const runs = (JSON.parse(api.stdout).workflow_runs || [])
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    .slice(0, size);
  const history = [];
  for (const r of runs) {
    const dir = mkdtempSync(join(tmpdir(), "ci-jail-"));
    const flaky = [];
    try {
      const dl = spawnSync("gh", ["run", "download", String(r.id), "--pattern", "flaky-block-*", "--dir", dir], { encoding: "utf8" });
      if (dl.status === 0) {
        for (const name of readdirSync(dir)) {
          if (!name.startsWith("flaky-block-")) continue;
          const f = join(dir, name, "flaky.txt");
          if (!existsSync(f)) continue;
          for (const line of readFileSync(f, "utf8").split("\n")) {
            const spec = line.trim();
            if (spec && !flaky.includes(spec)) flaky.push(spec);
          }
        }
      }
    } catch {
      // missing/unreadable artifacts = flaky [] (same as no artifact)
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    history.push({ run_id: r.id, url: r.html_url, flaky });
  }
  return history;
}

const USAGE = "usage: node tools/operations/ci-jail.mjs <history.json> [jail.json=tests/quarantine.json] [--write]\n"
  + "       node tools/operations/ci-jail.mjs collect <repo> [n=20]";

export function main(argv, now = Date.now()) {
  if (argv[0] === "collect") {
    const repo = argv[1];
    if (!repo) { console.error(USAGE); return 2; }
    try { console.log(JSON.stringify(collectHistory(repo, argv[2] == null ? WINDOW : Number(argv[2])), null, 2)); }
    catch (e) { console.error(`ci-jail: ${e.message}`); return 2; }
    return 0;
  }
  const write = argv.includes("--write");
  const args = argv.filter((a) => a !== "--write");
  const [historyPath, jailPath = "tests/quarantine.json"] = args;
  if (!historyPath) { console.error(USAGE); return 2; }
  let history, jail;
  try { history = JSON.parse(readFileSync(historyPath, "utf8")); }
  catch (e) { console.error(`ci-jail: cannot read ${historyPath}: ${e.message}`); return 2; }
  try { jail = existsSync(jailPath) ? JSON.parse(readFileSync(jailPath, "utf8")) : []; }
  catch (e) { console.error(`ci-jail: cannot read ${jailPath}: ${e.message}`); return 2; }
  let result;
  try { result = decideJail({ history, jail, now }); }
  catch (e) { console.error(`ci-jail: ${e.message}`); return 2; }
  if (write) {
    try { writeFileSync(jailPath, `${JSON.stringify(result.next, null, 2)}\n`); }
    catch (e) { console.error(`ci-jail: cannot write ${jailPath}: ${e.message}`); return 2; }
  }
  console.log(JSON.stringify(result, null, 2));
  return result.capHit ? 3 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(main(process.argv.slice(2)));
