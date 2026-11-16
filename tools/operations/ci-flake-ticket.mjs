#!/usr/bin/env node
/* The flake ticket (Tony, Nov 15): an unjailed FLAKY spec on a PR run passes yellow and is filed, not blocked.
   One GitHub issue titled "flake tickets" (label `flake`); one checklist line per flake:
     - [ ] <spec> — <run url> — <date>
   A spec that already has an UNCHECKED line is not added again. Pure part = appendTickets; the CLI is the gh glue (issues: write
   in the one job that runs it, tests.yml `flake-ticket`).
     node tools/operations/ci-flake-ticket.mjs <spec,spec> <run url> [date]      (env GH_TOKEN, GITHUB_REPOSITORY) */
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export const TICKET_TITLE = "flake tickets", TICKET_LABEL = "flake";
const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export const ticketLine = (spec, url, date) => `- [ ] ${spec} — ${url} — ${date}`;
export const hasOpenLine = (body, spec) => new RegExp(`^- \\[ \\] ${esc(spec)} — `, "m").test(String(body || ""));

// -> { body, added: [specs written], skipped: [specs already open] }
export function appendTickets(body, specs, url, date) {
  let b = String(body || "").replace(/\s+$/, ""), added = [], skipped = [];
  for (const spec of [...new Set(specs)].filter(Boolean)) {
    if (hasOpenLine(b, spec)) { skipped.push(spec); continue; }
    b += `${b ? "\n" : ""}${ticketLine(spec, url, date)}`;
    added.push(spec);
  }
  return { body: b + "\n", added, skipped };
}

const gh = (args, input) => execFileSync("gh", args, { encoding: "utf8", input });

export function main(argv, today = new Date().toISOString().slice(0, 10)) {
  const [specsArg, url, date = today] = argv;
  const specs = String(specsArg || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!specs.length || !url) { console.error("usage: ci-flake-ticket.mjs <spec,spec> <run url> [date]"); return 2; }
  const repo = process.env.GITHUB_REPOSITORY;
  try { gh(["label", "create", TICKET_LABEL, "--description", "flaky spec ticket", "--color", "fbca04", "-R", repo]); } catch { /* exists */ }
  const found = JSON.parse(gh(["issue", "list", "-R", repo, "--label", TICKET_LABEL, "--state", "open", "--search", `"${TICKET_TITLE}" in:title`, "--json", "number,title,body"]))
    .find((i) => i.title === TICKET_TITLE);
  const r = appendTickets(found ? found.body : "", specs, url, date);
  if (!r.added.length) { console.log(`flake tickets: nothing new (${r.skipped.join(", ")} already open)`); return 0; }
  if (found) gh(["issue", "edit", String(found.number), "-R", repo, "--body-file", "-"], r.body);
  else gh(["issue", "create", "-R", repo, "--title", TICKET_TITLE, "--label", TICKET_LABEL, "--body-file", "-"], r.body);
  console.log(`flake tickets: filed ${r.added.join(", ")}`);
  return 0;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(main(process.argv.slice(2)));
