#!/usr/bin/env node
/* SHIP_MODE policy (ci-loosen-review.md P4 + P5, TODO 12-16): the pure decisions + a thin CLI for the workflows.
   Repo variable SHIP_MODE = strict | pr-green. strict (default, anything else) = today's ship gate, unchanged.
   pr-green = a tree that already has a verified green stamp from a tests.yml PR/push run ships without waiting for the
   main push run; the post-deploy full run + rollback (P5) make that safe. P4 never ships without P5: both are keyed on this one switch.
   Pure part: no git, no network, no clock (`now` is passed). CLI part (bottom): gh / git / vercel API reads for the workflows.
     node tools/operations/ci-ship.mjs stamp-write --kind full|affected [--flaky-dir flaky] [--jail tests/quarantine.json]
     node tools/operations/ci-ship.mjs stamp-find <tree> <entries.json>
     node tools/operations/ci-ship.mjs postdeploy --failed <a,b> --flaky <c> [--lkg sha] [--jail ..] [--infra]
     node tools/operations/ci-ship.mjs rollback-plan --lkg <sha> --deploys <deploys.json>
     node tools/operations/ci-ship.mjs shas-between <from> <to>          (the culprit matrix) */
import { existsSync, readFileSync, readdirSync, writeFileSync, appendFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { runKind, jailedSpecs } from "./ci-gate.mjs";

export const STAMP_WORKFLOW = ".github/workflows/tests.yml";
export const STAMP_EVENTS = ["pull_request", "push"];   // AC5.1: nothing else may mint a stamp (dispatch = bench/fast, schedule = backstop)
export const STAMP_KINDS = ["full", "affected"];
export const shipModeOf = (v) => (String(v ?? "").trim() === "pr-green" ? "pr-green" : "strict");

// ---- P4: green stamp keyed by git tree hash ------------------------------------------------------------------------
export const stampName = (tree, kind) => `green-${tree}-${kind}`;
export function parseStampName(name) {
  const m = /^green-([0-9a-f]{40,64})-(full|affected)$/.exec(String(name));
  return m ? { tree: m[1], kind: m[2] } : null;
}

// What `all` uploads. null = no stamp (AC3.11: a tree whose run had an UNJAILED flaky spec gets none; docs-only/unknown kinds get none).
export function makeStamp({ tree, kind, flaky = [], jail = [], now, run = {} } = {}) {
  if (!/^[0-9a-f]{40,64}$/.test(String(tree)) || !STAMP_KINDS.includes(kind)) return null;
  const live = jailedSpecs(jail, now);
  if (flaky.some((s) => !live.has(s))) return null;
  return { tree, kind, flaky: [...new Set(flaky)], created_at: new Date(now).toISOString(), run_id: run.id ?? null, sha: run.sha ?? null };
}

const runPath = (p) => String(p ?? "").split("@")[0];
const runTime = (r) => { const t = Date.parse((r && r.created_at) || ""); return Number.isNaN(t) ? 0 : t; };

// One stamp entry = { name, stamp (the artifact's json), run (the producing tests.yml run, from the runs API) }.
export function verifyStamp(entry, { repo, tree, jail = [] } = {}) {
  const { name, stamp, run } = entry || {};
  const n = parseStampName(name);
  if (!n) return { ok: false, reason: `bad stamp name ${name}` };
  if (n.tree !== tree) return { ok: false, reason: `stamp is for tree ${n.tree.slice(0, 8)}, not ${String(tree).slice(0, 8)}` };
  if (!stamp || stamp.tree !== tree || stamp.kind !== n.kind) return { ok: false, reason: "stamp body does not match its name" };
  if (!run) return { ok: false, reason: "stamp has no producing run" };
  if (runPath(run.path) !== STAMP_WORKFLOW) return { ok: false, reason: `run workflow ${run.path} is not ${STAMP_WORKFLOW}` };
  if (!STAMP_EVENTS.includes(run.event)) return { ok: false, reason: `run event ${run.event} may not mint a stamp` };
  if (!run.head_repository || run.head_repository.full_name !== repo) return { ok: false, reason: `run head repository ${run.head_repository && run.head_repository.full_name} is not ${repo} (fork)` };
  if (run.conclusion !== "success") return { ok: false, reason: `run conclusion ${run.conclusion}, not success` };
  const live = jailedSpecs(jail, runTime(run));   // judged at the run's own time, like the yellow rule
  const bad = (stamp.flaky || []).filter((s) => !live.has(s));
  if (bad.length) return { ok: false, reason: `unjailed flaky spec(s) in the stamped run: ${bad.join(", ")}` };
  return { ok: true, kind: n.kind, source: run.event, reason: `${n.kind} green stamp from ${run.event} run ${run.id}` };
}

// The best verified stamp for `tree`: full beats affected. ok false = fall to the strict rule.
export function decideStamp({ tree, entries = [], repo, jail = [] } = {}) {
  const good = [], why = [];
  for (const e of entries) { const v = verifyStamp(e, { repo, tree, jail }); (v.ok ? good : why).push(v); }
  const pick = good.find((v) => v.kind === "full") || good[0];
  if (!pick) return { ok: false, reason: why.length ? `no valid stamp: ${why.map((w) => w.reason).join("; ")}` : "no green stamp for this tree" };
  return { ok: true, kind: pick.kind, source: pick.source, needs_postdeploy: pick.kind !== "full", reason: pick.reason };
}

// ---- P5: strict mode (AC5.6) -----------------------------------------------------------------------------------------
// A run is confirmed red when it failed AND it was not an infra failure that retry.yml is about to rerun: attempt >= 2, or the
// workflow saw a `FAIL <spec>` line in its failed jobs' logs (run.test_failure = true, set by ship.yml / the postdeploy job).
export function confirmedRed(run) {
  const r = run || {};
  if (r.conclusion !== "failure" && r.conclusion !== "timed_out") return false;
  return Number(r.run_attempt ?? 1) >= 2 || r.test_failure === true;
}
// State = the last completed FULL run on main (push/schedule). Cancelled/skipped/in-flight runs say nothing.
export function mainState(runs) {
  const last = (runs || [])
    .filter((r) => r && r.head_branch === "main" && runKind(r) === "full" && ["success", "failure", "timed_out"].includes(r.conclusion))
    .sort((a, b) => runTime(b) - runTime(a))[0];
  return last && confirmedRed(last) ? { red: true, sha: last.head_sha } : { red: false, sha: last ? last.head_sha : null };
}

// The whole gate. `strict` = ci-gate's decideShip result (unchanged). strict mode returns it as is.
export function decidePolicy({ mode, strict, tree, entries = [], repo, jail = [], runs = [] } = {}) {
  if (shipModeOf(mode) !== "pr-green" || (strict && strict.ok)) return { ...strict, needs_postdeploy: false, via: "strict" };
  const st = decideStamp({ tree, entries, repo, jail });
  if (!st.ok) return { ok: false, reason: `${strict ? strict.reason : "no strict decision"}; ${st.reason}`, via: "strict" };
  const m = mainState(runs);
  // main is red: only a tree that has its own FULL green from a main run (push) may ship; a PR-green stamp may not
  if (m.red && !(st.kind === "full" && st.source === "push"))
    return { ok: false, reason: `main is red at ${String(m.sha).slice(0, 8)}: PR-green stamps are refused until a full green exists (${st.reason})`, via: "strict" };
  return { ok: true, reason: st.reason, needs_postdeploy: st.needs_postdeploy, via: "stamp" };
}

// ---- P5: post-deploy verdict, LKG, rollback (AC5.2, 5.3) --------------------------------------------------------------
// failed = specs with a FAIL line in the full run's logs; flaky = specs that failed once and passed on retry (flaky.txt).
// A flaky spec prints FAIL too when unjailed, so hard failures = failed minus flaky.
export function decidePostdeploy({ failed = [], flaky = [], jail = [], now, lkg = null, infra = false } = {}) {
  if (infra) return { rollback: null, mode: "pr-green", quiet: true, tickets: [], reason: "infra failure: retry.yml reruns it, no verdict" };
  const live = jailedSpecs(jail, now);
  const hard = failed.filter((s) => !flaky.includes(s));
  const tickets = flaky.filter((s) => !live.has(s));
  if (hard.length) return { rollback: lkg, mode: "strict", quiet: false, hard, tickets, reason: `${hard.join(", ")} failed twice${lkg ? `: roll back to ${lkg}` : ": no last-known-good to roll back to"}` };
  if (tickets.length) return { rollback: null, mode: "strict", quiet: false, tickets, reason: `${tickets.join(", ")} flaky and not jailed: ticket filed, gate strict until fixed or jailed` };
  return { rollback: null, mode: "pr-green", quiet: true, tickets: [], reason: flaky.length ? "flaky specs are jailed: quiet" : "green" };
}

export const shaEq = (a, b) => !!a && !!b && Math.min(a.length, b.length) >= 7 && (a.startsWith(b) || b.startsWith(a));
// LKG = the newest SHA that was live AND has a full green. live = shas newest first; fulls = shas with a full green (stamp or main run).
export function pickLkg({ live = [], fulls = [] } = {}) {
  return live.find((s) => fulls.some((f) => shaEq(s, f))) || null;
}

// Hobby: `vercel rollback` reaches the immediately previous production deploy only. deploys = READY production deploys, newest first,
// each { id, url, sha } (sha from the deploy's meta.shipSha, set by ship.sh; unknown = null).
export function planRollback({ lkg, deploys = [] } = {}) {
  if (!lkg) return { action: "none", reason: "no last-known-good" };
  const [cur, prev] = deploys;
  if (cur && shaEq(cur.sha, lkg)) return { action: "noop", reason: "prod already runs the last-known-good" };
  if (prev && shaEq(prev.sha, lkg)) return { action: "rollback", target: prev.url, id: prev.id, reason: "lkg is the previous production deploy: vercel rollback" };
  return { action: "redeploy", sha: lkg, reason: "lkg is not the previous production deploy (Hobby): redeploy the sha" };
}

// AC5.8: prod / gate state under events in any causal order. ship = a ship run for sha (gate decides at RUN time); red = the post-deploy
// run confirmed red; rollback = the dispatched rollback runs (bypasses the gate); green = a full green lands.
export function applyEvent(s, e) {
  const st = { ...s };
  if (e.type === "ship") {
    if (st.red && !e.ownFull) return st;   // gate strict: PR-green refused while main is red
    st.prod = e.sha; return st;
  }
  if (e.type === "red") { st.red = true; return st; }
  if (e.type === "rollback") { if (st.red) st.prod = st.lkg; return st; }   // only ever dispatched after a red
  if (e.type === "green") { st.red = false; st.lkg = e.sha ?? st.lkg; return st; }
  return st;
}

// ---- culprit (AC5.11) -----------------------------------------------------------------------------------------------
export const prOfSubject = (subject) => {
  const s = String(subject);
  const m = /^Merge pull request #(\d+)/.exec(s) || /\(#(\d+)\)\s*$/.exec(s);
  return m ? Number(m[1]) : null;
};
// legs = [{sha, subject, failed: bool}] oldest first. The culprit is the OLDEST failing sha (later ones inherit it).
export function pickCulprit(legs = []) {
  const first = legs.find((l) => l.failed);
  if (!first) return { ok: false, reason: "no leg failed: flaky, or the cause is not in this range" };
  const pr = prOfSubject(first.subject);
  return { ok: true, sha: first.sha, pr, reason: `first failing merge ${first.sha.slice(0, 8)}${pr ? ` = PR #${pr}` : ""}: ${first.subject}` };
}

// ---- CLI ---------------------------------------------------------------------------------------------------------------
const sh = (cmd, args, opt = {}) => execFileSync(cmd, args, { encoding: "utf8", maxBuffer: 64 << 20, ...opt });
const readJson = (p, d) => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return d; } };
const out = (k, v) => { if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${v}\n`); };
const flag = (argv, name, d = "") => { const i = argv.indexOf(name); return i >= 0 && argv[i + 1] != null ? argv[i + 1] : d; };
const list = (s) => String(s || "").split(/[,\s]+/).filter(Boolean);
const flakyIn = (dir) => {
  if (!dir || !existsSync(dir)) return [];
  const names = [];
  for (const d of readdirSync(dir, { recursive: true })) if (String(d).endsWith("flaky.txt")) names.push(...readFileSync(`${dir}/${d}`, "utf8").split("\n").map((l) => l.trim()).filter(Boolean));
  return [...new Set(names)];
};

export function main(argv, now = Date.now()) {
  const [cmd] = argv;
  const jail = readJson(flag(argv, "--jail", "tests/quarantine.json"), []);
  if (cmd === "stamp-write") {
    const tree = sh("git", ["rev-parse", "HEAD^{tree}"]).trim();
    const stamp = makeStamp({ tree, kind: flag(argv, "--kind"), flaky: flakyIn(flag(argv, "--flaky-dir")), jail, now, run: { id: process.env.GITHUB_RUN_ID, sha: process.env.GITHUB_SHA } });
    if (!stamp) { console.log("no stamp: unjailed flaky spec, or no stampable kind"); out("stamp", "false"); return 0; }
    writeFileSync("stamp.json", JSON.stringify(stamp));
    out("stamp", "true"); out("name", stampName(tree, stamp.kind));
    console.log(`stamp ${stampName(tree, stamp.kind)}`);
    return 0;
  }
  if (cmd === "stamp-find") {   // gh api: artifacts named green-<tree>-*, their producing runs, their json bodies
    const [, tree, outFile] = argv, repo = process.env.GITHUB_REPOSITORY, entries = [];
    for (const kind of STAMP_KINDS) {
      let arts = [];
      try { arts = JSON.parse(sh("gh", ["api", `repos/${repo}/actions/artifacts?name=${stampName(tree, kind)}&per_page=10`])).artifacts || []; } catch (e) { console.error(`stamp-find: ${e.message}`); }
      for (const a of arts.filter((x) => !x.expired)) {
        try {
          const run = JSON.parse(sh("gh", ["api", `repos/${repo}/actions/runs/${a.workflow_run.id}`]));
          const zip = execFileSync("gh", ["api", `repos/${repo}/actions/artifacts/${a.id}/zip`], { maxBuffer: 1 << 24 });
          const zf = `${tmpdir()}/stamp-${a.id}.zip`;   // unzip needs a seekable file
          writeFileSync(zf, zip);
          const body = JSON.parse(sh("unzip", ["-p", zf, "stamp.json"]));
          entries.push({ name: a.name, stamp: body, run: { id: run.id, path: run.path, event: run.event, conclusion: run.conclusion, created_at: run.created_at, head_repository: { full_name: run.head_repository && run.head_repository.full_name } } });
        } catch (e) { console.error(`stamp-find: skipped ${a.name}: ${e.message}`); }
      }
    }
    writeFileSync(outFile, JSON.stringify(entries));
    console.log(`stamp-find: ${entries.length} stamp(s) for tree ${tree.slice(0, 8)}`);
    return 0;
  }
  if (cmd === "postdeploy") {
    const d = decidePostdeploy({ failed: list(flag(argv, "--failed")), flaky: list(flag(argv, "--flaky")), jail, now, lkg: flag(argv, "--lkg") || null, infra: argv.includes("--infra") });
    console.error(d.reason);
    out("rollback", d.rollback || ""); out("tickets", d.tickets.join(",")); out("hard", (d.hard || []).join(","));
    console.log(JSON.stringify(d));
    return 0;
  }
  if (cmd === "rollback-plan") {
    const p = planRollback({ lkg: flag(argv, "--lkg"), deploys: readJson(flag(argv, "--deploys"), []) });
    console.error(p.reason);
    out("action", p.action); out("sha", p.sha || ""); out("deploy_url", p.target || "");
    console.log(JSON.stringify(p));
    return p.action === "none" ? 1 : 0;
  }
  if (cmd === "shas-between") {   // first-parent merges oldest first, as JSON [{sha, subject}] (matrix input), capped
    const [, from, to] = argv;
    const rows = sh("git", ["log", "--first-parent", "--reverse", "--format=%H%x09%s", `${from}..${to}`]).split("\n").filter(Boolean)
      .map((l) => { const [sha, ...s] = l.split("\t"); return { sha, subject: s.join("\t") }; }).slice(0, 15);
    out("count", rows.length); out("legs", JSON.stringify(rows)); out("matrix", JSON.stringify({ include: rows.map((r) => ({ sha: r.sha })) }));
    console.log(JSON.stringify(rows));
    return 0;
  }
  if (cmd === "culprit") {   // culprit <results.json: [{sha, subject, failed}]>
    const r = pickCulprit(readJson(argv[1], []));
    console.log(r.reason);
    return r.ok ? 0 : 1;
  }
  console.error("usage: ci-ship.mjs stamp-write|stamp-find|postdeploy|rollback-plan|shas-between|culprit ...");
  return 2;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(main(process.argv.slice(2)));
