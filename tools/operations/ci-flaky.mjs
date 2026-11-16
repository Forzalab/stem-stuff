#!/usr/bin/env node
/* W4 in-job spec retry: the pure decisions + a tiny CLI for run-all.sh and the `all` job.
   A spec that fails and passes on its in-lane retry is FLAKY; the lane passes only if the spec is in the unexpired jail
   (tests/quarantine.json, same rules as ci-gate: jailedSpecs). Never a clock of its own: `now` is passed in.
     node tools/operations/ci-flaky.mjs jailed <spec> [jail.json]          exit 0 = jailed (lane may pass), 1 = not
     node tools/operations/ci-flaky.mjs all <jail.json> <dir> <nBlocks> [--pr]   reads <dir>/flaky-block-<i>/flaky.txt, exit 0 = ok */
import { existsSync, readFileSync, appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { jailedSpecs } from "./ci-gate.mjs";

// A spec that failed once and passed on retry: ok only when jailed.
export function flakyVerdict(spec, jail, now) {
  return jailedSpecs(jail, now).has(spec)
    ? { ok: true, reason: `${spec} flaky, jailed` }
    : { ok: false, reason: `${spec} flaky and not in the unexpired jail (tests/quarantine.json)` };
}

// The `all` job: blocks = [{block, flaky: string[] | null}] for every block that ran (null = its flaky file is missing = fail closed).
// pr = SHIP_MODE pr-green on a pull_request run (Tony, Nov 15): an UNJAILED flaky spec does not fail `all` (yellow); it becomes a ticket.
export function decideAll({ blocks = [], jail = [], now, pr = false } = {}) {
  const live = jailedSpecs(jail, now), warnings = [], bad = [], tickets = [];
  for (const b of blocks) {
    if (!Array.isArray(b.flaky)) { bad.push(`block ${b.block}: flaky.txt missing (cannot tell what flaked)`); continue; }
    for (const s of b.flaky) {
      if (live.has(s)) warnings.push(`${s} flaky (jailed)`);
      else if (pr) { warnings.push(`${s} flaky, not jailed: passes yellow, ticket filed`); tickets.push(s); }
      else { bad.push(`${s} flaky and not jailed (block ${b.block})`); tickets.push(s); }
    }
  }
  return { ok: bad.length === 0, warnings, reason: bad.join("; "), tickets: [...new Set(tickets)] };
}

const names = (txt) => String(txt).split("\n").map((l) => l.trim()).filter(Boolean);
const readJail = (p) => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return []; } };

export function main(argv, now = Date.now()) {
  const [cmd, a, b, c] = argv;
  if (cmd === "jailed") {
    const v = flakyVerdict(a, readJail(b || process.env.FLAKY_JAIL || "tests/quarantine.json"), now);
    console.error(v.reason);
    return v.ok ? 0 : 1;
  }
  if (cmd === "all") {
    const blocks = [];
    for (let i = 1; i <= Number(c); i++) {
      const f = `${b}/flaky-block-${i}/flaky.txt`;
      blocks.push({ block: i, flaky: existsSync(f) ? names(readFileSync(f, "utf8")) : null });
    }
    const v = decideAll({ blocks, jail: readJail(a), now, pr: process.argv.includes("--pr") });
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `tickets=${v.tickets.join(",")}\n`);
    for (const w of v.warnings) console.log(`::warning::${w}`);
    if (!v.ok) console.log(`::error::${v.reason}`);
    return v.ok ? 0 : 1;
  }
  console.error("usage: ci-flaky.mjs jailed <spec> [jail] | all <jail> <dir> <nBlocks>");
  return 2;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(main(process.argv.slice(2)));
