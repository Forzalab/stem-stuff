// RED (PR 1, ticket 09): the ship-gate decision + the green-run facts. Fails today because
// module with this exact surface:
//   export const DOCS_EXTS                          // loopable docs-only extension set
//   export function isDocsOnly(path)
//   export function classify(files)                 // -> { docs, code }
//   export function runKind(run)                    // -> 'full' | 'fast' | 'bench' | 'unknown'
//   export function pickGreen(runs, candidate)      // -> { sha, kind:'full', created_at } | null
//   export function decideShip({candidate, green, changedFiles})  // -> { ok, reason }
// and a CLI: node tools/operations/ci-gate.mjs --candidate <sha> --runs <runs.json> [--file <path>]...
//   prints the decision, exits 0 (ship) / 1 (refuse).
// No network, no GitHub, no git: pickGreen/runKind/decideShip are pure; the CLI is driven here
// through --file injection (no git diff).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { DOCS_EXTS, isDocsOnly, classify, runKind, pickGreen, decideShip } from "../tools/operations/ci-gate.mjs";

const CLI = fileURLToPath(new URL("../tools/operations/ci-gate.mjs", import.meta.url));
const fix = (name) => fileURLToPath(new URL(`./fixtures/ci-gate/${name}.json`, import.meta.url));
function cli(args) {
  return spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8" });
}

// --- docs-only = .md only -----------------------------------------------------------
// SOURCE of ".md": tools/operations/ci-gate.mjs DOCS_EXTS (SPEC.md §docs-only). Everything else is code:
// requirements.txt:1 (sympy = a dependency manifest), views/allow/common-en.txt:1 (answer
// allow-list), vendor/fonts/OFL.txt:1 (license shipped with the code it licenses).
test("DOCS_EXTS is the set {'.md'} and nothing less", () => {
  assert.ok(Array.isArray(DOCS_EXTS), "DOCS_EXTS must be an array");
  assert.ok(DOCS_EXTS.length >= 1, "DOCS_EXTS must not be empty (an empty set would make every diff docs-only)");
  assert.ok(DOCS_EXTS.includes(".md"), "'.md' must be a member (README.md, SCHEMA.md, design/*.md are the only docs)");
});

test("classify: every DOCS_EXTS member is docs-only", () => {
  // INTENT (loops over ALL members): a literal-but-wrong port that hard-codes the check as
  // `path.endsWith('.md')` instead of iterating DOCS_EXTS would still pass for '.md' but break
  // the moment a second member is added; the loop is the contract.
  for (const ext of DOCS_EXTS) {
    const p = `README${ext}`;
    assert.equal(isDocsOnly(p), true, `${p} must be docs-only (DOCS_EXTS member)`);
    const c = classify([p]);
    assert.deepEqual(c.docs, [p], `classify([${p}]).docs`);
    assert.deepEqual(c.code, [], `classify([${p}]).code must be empty`);
  }
});

test("classify: code files are NOT docs-only (INTENT: '.txt' is not docs)", () => {
  // INTENT: a literal-but-wrong port that reads "docs = .md or .txt" (the tempting over-literal
  // reading of 'docs-only') would wrongly ship these without a full run. They are CODE:
  const code = [
    "requirements.txt",              // requirements.txt:1 sympy/networkx/tzdata — installs change
    "shared/openui/allow/common-en.txt",     // views/allow/common-en.txt:1 — answer allow-list, runtime
    "shared/openui/allow/format-stop.txt",   // answer allow-list
    "client/vendor/fonts/OFL.txt",          // vendor/fonts/OFL.txt:1 — ships with the fonts
    "server/http_server/serve.py",                      // server
    "client/answer/drill_core/app.js",                        // client
    ".github/workflows/ship.yml",    // CI
  ];
  for (const f of code) {
    assert.equal(isDocsOnly(f), false, `${f} must be code, not docs`);
    const c = classify([f]);
    assert.deepEqual(c.docs, [], `classify([${f}]).docs must be empty`);
    assert.deepEqual(c.code, [f], `classify([${f}]).code`);
  }
});

test("classify: a mixed diff splits docs from code", () => {
  const c = classify(["README.md", "client/answer/drill_core/app.js"]);
  assert.deepEqual(c.docs, ["README.md"], "README.md:1 is the only doc");
  assert.deepEqual(c.code, ["client/answer/drill_core/app.js"], "app.js is code");
});

// --- runKind: how a run maps to full/fast/bench/unknown TODAY ------------------------
// SOURCE of each rule: tests.yml (HEAD b0e01c5).
test("runKind: push runs are full, pull_request runs affected selection", () => {
  assert.equal(runKind({ event: "push" }), "full",
    "push to main is the full-suite backstop — SOURCE tests.yml:5-6 (push: [main])");
  assert.equal(runKind({ event: "pull_request" }), "affected",
    "PR 2 selects affected units on pull_request (SPEC-PR2.md §4)");
});

test("runKind: workflow_dispatch pipe=fast is fast, pipe=full or absent is full", () => {
  assert.equal(runKind({ event: "workflow_dispatch", inputs: { pipe: "fast" } }), "fast",
    "SOURCE tests.yml:15-19 pipe input + tests.yml:96 fast job `if: inputs.pipe == 'fast'`");
  assert.equal(runKind({ event: "workflow_dispatch", inputs: { pipe: "full" } }), "full",
    "SOURCE tests.yml:18-19 pipe default = full");
  assert.equal(runKind({ event: "workflow_dispatch", inputs: {} }), "full",
    "SOURCE tests.yml:18-19 no pipe = the default = full");
});

test("runKind: a dispatch with a mutant input is bench, never a ship run", () => {
  assert.equal(runKind({ event: "workflow_dispatch", inputs: { mutant: "seed-1" } }), "bench",
    "SOURCE tests.yml:9-11 mutant seeds a fault (CI bench); a bench green is not a real green");
});

test("runKind: any unknown event or unknown pipe is NOT full", () => {
  // INTENT: a literal-but-wrong port that defaults unknown runs to 'full' (so "if it isn't fast,
  // it must be full") would wrongly ship a future `schedule` or selected run. Unknown => unknown.
  for (const r of [
    { event: "workflow_dispatch", inputs: { pipe: "bogus" } },
    { event: "workflow_dispatch", inputs: { pipe: "affected" } },   // PR 2's future selected marker
    {},
  ]) {
    assert.equal(runKind(r), "unknown", `${JSON.stringify(r)} must map to unknown (not full)`);
  }
});

// --- pickGreen: the newest successful FULL run on main -------------------------------
test("pickGreen: the newest successful full run on main wins", () => {
  const runs = [
    { head_branch: "main", head_sha: "old1", conclusion: "success", event: "push", status: "completed", created_at: "2026-11-06T12:00:00Z" },
    { head_branch: "main", head_sha: "new2", conclusion: "success", event: "push", status: "completed", created_at: "2026-11-08T12:00:00Z" },
  ];
  assert.deepEqual(pickGreen(runs, "new2"), { sha: "new2", kind: "full", created_at: "2026-11-08T12:00:00Z" },
    "newest created_at on main, success, full");
});

test("pickGreen: a newer FAILED full run does not mask the older green (STALE-STATE)", () => {
  // SOURCE M3: the diff base is the last GREEN full run, not the last run.
  const runs = [
    { head_branch: "main", head_sha: "oldgreen", conclusion: "success", event: "push", status: "completed", created_at: "2026-11-07T00:00:00Z" },
    { head_branch: "main", head_sha: "newfail", conclusion: "failure", event: "push", status: "completed", created_at: "2026-11-08T00:00:00Z" },
  ];
  assert.equal(pickGreen(runs, "newfail").sha, "oldgreen", "the newer run FAILED, so the older green is the base");
});

test("pickGreen: never a run from another branch, never a non-full kind", () => {
  // INTENT: a literal-but-wrong port that ignores head_branch (or kind) would let a feature-branch
  // or a fast/bench/selected run slip in as the "full green" anchor. Loop over ALL excluded kinds.
  const excluded = [
    { head_branch: "feature/x", head_sha: "fx1", conclusion: "success", event: "push", status: "completed", created_at: "2026-11-09T00:00:00Z" },   // other branch
    { head_branch: "main", head_sha: "fast1", conclusion: "success", event: "workflow_dispatch", status: "completed", created_at: "2026-11-09T01:00:00Z", inputs: { pipe: "fast" } },
    { head_branch: "main", head_sha: "bench1", conclusion: "success", event: "workflow_dispatch", status: "completed", created_at: "2026-11-09T02:00:00Z", inputs: { mutant: "m" } },
  ];
  for (const bad of excluded) {
    const runs = [
      { head_branch: "main", head_sha: "good1", conclusion: "success", event: "push", status: "completed", created_at: "2026-11-07T00:00:00Z" },
      bad,
    ];
    assert.equal(pickGreen(runs, "candidate").sha, "good1",
      `excluded run ${bad.head_branch}/${bad.head_sha} must not win over a main full green`);
  }
});

test("pickGreen: no successful full main run -> null", () => {
  const runs = [
    { head_branch: "main", head_sha: "f1", conclusion: "failure", event: "push", status: "completed", created_at: "2026-11-08T00:00:00Z" },
    { head_branch: "main", head_sha: "s1", conclusion: "success", event: "workflow_dispatch", status: "completed", created_at: "2026-11-08T01:00:00Z", inputs: { pipe: "fast" } },
  ];
  assert.equal(pickGreen(runs, "f1"), null, "only a failed run and a fast run: nothing is a full green");
});

// --- the ship decision --------------------------------------------------------------
// SOURCE of the rules: SPEC.md M1/M2/M3.
test("decideShip: no full green run anywhere refuses", () => {
  const r = decideShip({ candidate: "abc1234", green: null, changedFiles: ["README.md"] });
  assert.equal(r.ok, false, "M2: with no green fact there is nothing to ship");
  assert.ok(r.reason, "a refusal must say why");
});

test("decideShip: a selected/fast green run is never enough to ship", () => {
  // INTENT: a literal-but-wrong port that checks only `green` truthiness (ignores `green.kind`)
  // would pass the previous test and the exact-sha test, but fails here — only kind==='full'
  // may ship (M2: never ship a SHA that only ran selected specs or the fast pipe).
  for (const kind of ["selected", "fast", "affected"]) {
    const r = decideShip({ candidate: "abc1234", green: { sha: "abc1234", kind }, changedFiles: [] });
    assert.equal(r.ok, false, `kind=${kind} must refuse (M2)`);
  }
});

test("decideShip: the exact sha with a full green run ships, even with a non-empty diff", () => {
  // INTENT: a literal-but-wrong port that forgets the exact-sha shortcut (always requires an
  // empty diff) would refuse this; M1 says the exact sha's own full green run is enough.
  const r = decideShip({ candidate: "abc1234", green: { sha: "abc1234", kind: "full" }, changedFiles: ["client/answer/drill_core/app.js", "server/http_server/serve.py"] });
  assert.equal(r.ok, true, "M1: exact sha already has a full green run");
});

test("decideShip: docs-only since the last full green run ships", () => {
  const r = decideShip({ candidate: "def5678", green: { sha: "abc1234", kind: "full" }, changedFiles: ["README.md", "SCHEMA.md"] });
  assert.equal(r.ok, true, "M1: later diff is docs-only");
});

test("decideShip: one code file since the last full green run refuses", () => {
  const r = decideShip({ candidate: "def5678", green: { sha: "abc1234", kind: "full" }, changedFiles: ["client/answer/drill_core/app.js"] });
  assert.equal(r.ok, false, "M1: non-docs change needs a full run on this exact sha");
  assert.ok(r.reason, "a refusal must say why");
});

test("decideShip: an empty diff (nothing changed since the green sha) ships", () => {
  const r = decideShip({ candidate: "def5678", green: { sha: "abc1234", kind: "full" }, changedFiles: [] });
  assert.equal(r.ok, true, "M3: zero code files → docs-only (empty) → ship");
});

// --- the CLI (no network: --file injects the diff, --runs reads a fixture) -----------
// SOURCE of exit codes: SPEC.md §CLI.
test("CLI: ships the exact green sha (fixture green.json)", () => {
  const r = cli(["--candidate", "aaaaaaa1", "--runs", fix("green"), "--file", "client/answer/drill_core/app.js"]);
  assert.equal(r.status, 0, `exit 0 = ship; stderr: ${r.stderr}`);
  assert.match(r.stdout, /ok/i, `stdout must say ship ok; got: ${r.stdout}`);
});

test("CLI: refuses a red sha (fixture red.json, all runs failed)", () => {
  const r = cli(["--candidate", "fail33333", "--runs", fix("red"), "--file", "client/answer/drill_core/app.js"]);
  assert.equal(r.status, 1, `exit 1 = refuse; stdout: ${r.stdout}`);
  assert.match(r.stderr, /refus/i, `stderr must say refuse; got: ${r.stderr}`);
});

test("CLI: refuses a fast-only sha (fixture fast-only.json)", () => {
  const r = cli(["--candidate", "fast44444", "--runs", fix("fast-only"), "--file", "README.md"]);
  assert.equal(r.status, 1, "a fast pipe run is not a full green (M2)");
});

test("CLI: refuses a bench-mutant-only sha (fixture bench.json)", () => {
  const r = cli(["--candidate", "bench5555", "--runs", fix("bench"), "--file", "README.md"]);
  assert.equal(r.status, 1, "a bench (mutant) run is never a ship run (runKind -> bench)");
});

test("CLI: refuses a code diff since the last green sha (fixture code-diff.json)", () => {
  const r = cli(["--candidate", "green7777", "--runs", fix("code-diff"), "--file", "client/answer/drill_core/app.js"]);
  assert.equal(r.status, 1, "green6666 is full green but app.js changed since (M1)");
});

test("CLI: a docs-only diff since the last green sha ships", () => {
  const r = cli(["--candidate", "green7777", "--runs", fix("code-diff"), "--file", "README.md"]);
  assert.equal(r.status, 0, "docs-only later diff is shippable (M1)");
});

// --- flaky jail + yellow rule (Nov 15), AC3.1-3.14 -----------------------------------
// Unit names are the ones run-all.sh prints (`flow`, `desk-layout@3`), never `flow.pw.mjs`.
import { readFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";
import { yellowCleared, yellowVerdict, expiredJail, expiryOf, jailViolations, parseFailedSpecs, JAIL_MAX } from "../tools/operations/ci-gate.mjs";
const NOW = Date.parse("2026-11-16T00:00:00Z");
const J = (spec, added = "2026-11-15", expires = "2026-11-22") => ({ spec, test: "*", owner: "tony", reason: "#601", added, expires });
const run = (attempt, failed, created_at = "2026-11-16T00:00:00Z") => ({ conclusion: "success", event: "push", head_branch: "main", head_sha: "y1", run_attempt: attempt, created_at, failed_specs: failed });
const yellow = (failed, created_at) => run(2, failed, created_at);
const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const UNITS = spawnSync("bash", [here("./run-all.sh"), "--list"], { encoding: "utf8" }).stdout.split("\n").filter(Boolean);

test("AC3.1 run-all.sh --list gives real unit names", () => {
  assert.ok(UNITS.includes("flow") && UNITS.includes("unittest") && UNITS.includes("npm"), UNITS.slice(0, 5).join(","));
});

test("AC3.1 tests/quarantine.json: fields, real unit, not unittest/npm, issue ref, <= 7d, <= 5 entries", () => {
  const jail = JSON.parse(readFileSync(here("./quarantine.json"), "utf8"));
  assert.deepEqual(jailViolations(jail, { units: UNITS }), []);
});

test("AC3.1 jailViolations refuses each bad shape", () => {
  const bad = (jail, re) => assert.match(jailViolations(jail, { units: UNITS }).join("\n"), re);
  bad([J("flow.pw.mjs")], /not a unit name/);
  bad([J("nope")], /not a unit name/);
  for (const u of ["unittest", "npm", "batch", "codemap"]) bad([J(u)], /may not be jailed/);
  bad([{ ...J("flow"), reason: "flaky, see later" }], /issue ref/);
  assert.deepEqual(jailViolations([{ ...J("flow"), reason: "https://github.com/Forzalab/stem-stuff/issues/9" }], { units: UNITS }), []);
  bad([J("flow", "2026-11-15", "2026-11-23")], /more than 7d/);
  bad([{ ...J("flow"), owner: "" }], /lacks owner/);
  const six = UNITS.filter((u) => !/^(unittest|npm|batch|codemap)$/.test(u)).slice(0, JAIL_MAX + 1).map((u) => J(u));
  assert.equal(six.length, 6);
  bad(six, /cap is 5/);
  assert.deepEqual(jailViolations(six.slice(0, 5), { units: UNITS }), []);
});

test("AC3.2 attempt 1 green anchors with no jail", () => {
  assert.equal(pickGreen([run(1)], "y1")?.sha, "y1");
});

test("AC3.3 attempt 2 green, failed=[flow], flow jailed and live -> ok", () => {
  assert.equal(yellowCleared(yellow(["flow"]), [J("flow")], NOW), true);
  assert.equal(pickGreen([yellow(["flow"])], "y1", { jail: [J("flow")], now: NOW })?.sha, "y1");
});

test("AC3.4 flow not jailed -> refused, names flow", () => {
  const v = yellowVerdict(yellow(["flow"]), [], NOW);
  assert.equal(v.ok, false);
  assert.match(v.reason, /flow/);
  assert.equal(pickGreen([yellow(["flow"])], "y1", { jail: [], now: NOW }), null);
  assert.equal(pickGreen([yellow(["flow"])], "y1"), null, "no jail option = yellow refused as before");
});

test("AC3.5 flow jailed but expired -> refused, says expired", () => {
  const v = yellowVerdict(yellow(["flow"]), [J("flow", "2026-11-01", "2026-11-08")], NOW);
  assert.equal(v.ok, false);
  assert.match(v.reason, /expired/);
  assert.match(v.reason, /flow/);
});

test("AC3.6 failed=[flow,desk-layout@3], only flow jailed -> refused naming desk-layout@3 only", () => {
  const v = yellowVerdict(yellow(["flow", "desk-layout@3"]), [J("flow")], NOW);
  assert.equal(v.ok, false);
  assert.match(v.reason, /desk-layout@3/);
  assert.doesNotMatch(v.reason, /flow/);
});

test("AC3.7 yellow with failed specs unknown or empty -> refused (fail closed)", () => {
  for (const f of [undefined, null, []]) assert.equal(yellowVerdict(yellow(f), [J("flow")], NOW).ok, false);
});

test("expiredJail lists only expired entries; missing expires = added + 7d", () => {
  const e = expiredJail([J("a"), J("b", "2026-11-01", "2026-11-08"), { spec: "c", added: "2026-11-15" }, { spec: "d", added: "2026-11-01" }], NOW);
  assert.deepEqual(e.map((x) => x.spec), ["b", "d"]);
});

test("AC3.9 CLI usage mentions --failed-specs; CLI refuses a yellow whose failed spec is not jailed", () => {
  assert.match(cli(["--help"]).stdout, /--failed-specs/);
  const dir = mkdtempSync(join(tmpdir(), "gate-"));
  const runs = join(dir, "runs.json"), jail = join(dir, "q.json");
  writeFileSync(runs, JSON.stringify([yellow(undefined, "2026-11-16T00:00:00Z")]));
  writeFileSync(jail, "[]");
  const r = cli(["--candidate", "y1", "--runs", runs, "--jail", jail, "--failed-specs", "flow"]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /flow/);
  writeFileSync(jail, JSON.stringify([J("flow")]));
  assert.equal(cli(["--candidate", "y1", "--runs", runs, "--jail", jail, "--failed-specs", "flow"]).status, 0);
});

test("AC3.10 no renewal: expires may not move later; an expired spec may not be re-added within 21 days", () => {
  const prev = [J("flow", "2026-11-01", "2026-11-08")];
  const v = (jail, now) => jailViolations(jail, { units: UNITS, prev, now });
  assert.deepEqual(v([J("flow", "2026-11-01", "2026-11-08")], NOW), [], "an unchanged entry is not a renewal");
  assert.deepEqual(v([], NOW), []);
  assert.match(v([J("flow", "2026-11-05", "2026-11-12")], NOW).join(), /moved later/);
  assert.match(v([J("flow", "2026-11-16", "2026-11-23")], NOW).join(), /moved later/);
  // expired 2026-11-08, now 2026-11-16 (8 days ago): re-added even with an earlier expiry is still a re-add
  assert.match(v([J("flow", "2026-11-01", "2026-11-07")], NOW).join(), /no re-adding/);
  // 21+ days after expiry an earlier-dated entry is no longer blocked
  assert.deepEqual(v([J("flow", "2026-11-01", "2026-11-07")], Date.parse("2026-12-10T00:00:00Z")), []);
});

test("AC3.12 expiryOf boundary: live through D 23:59:59Z, dead at D+1 00:00Z", () => {
  const e = J("flow", "2026-11-15", "2026-11-22");
  assert.equal(expiryOf(e), Date.parse("2026-11-23T00:00:00Z"));
  assert.equal(yellowCleared(yellow(["flow"]), [e], Date.parse("2026-11-22T23:59:59Z")), true);
  assert.equal(yellowCleared(yellow(["flow"]), [e], Date.parse("2026-11-23T00:00:00Z")), false);
});

test("AC3.12 now = run.created_at, not wall clock: a run keeps its colour while it waits for a ship", () => {
  const e = J("flow", "2026-11-15", "2026-11-22");
  assert.equal(pickGreen([yellow(["flow"], "2026-11-20T12:00:00Z")], "y1", { jail: [e] })?.sha, "y1");
  assert.equal(pickGreen([yellow(["flow"], "2026-11-23T00:00:00Z")], "y1", { jail: [e] }), null);
  const dir = mkdtempSync(join(tmpdir(), "gate-"));
  const runs = join(dir, "runs.json"), jail = join(dir, "q.json");
  writeFileSync(runs, JSON.stringify([yellow(["flow"], "2026-11-20T12:00:00Z")]));
  writeFileSync(jail, JSON.stringify([e]));
  assert.equal(cli(["--candidate", "y1", "--runs", runs, "--jail", jail]).status, 0);
});

test("AC3.13 one jail: no @quarantine tag path left in run-all.sh or lint-tags.mjs", () => {
  for (const f of ["./run-all.sh", "./lint-tags.mjs"]) assert.doesNotMatch(readFileSync(here(f), "utf8"), /@quarantine|QUAR /, f);
});

// AC3.14: the shape of a real CI job log: ISO timestamp prefix, `lane N:` prefix, result line `FAIL <unit> <s> s`.
const LOG = [
  "2026-11-14T10:22:07.4811122Z lane 2: ok   anim 12.3 s",
  "2026-11-14T10:22:31.1234567Z lane 2: FAIL flow 39.6 s",
  "2026-11-14T10:22:31.1240001Z      Error: locator.click: Timeout 30000ms exceeded",
  "2026-11-14T10:22:40.0000000Z lane 2: ok   easy 3.1 s",
  "2026-11-14T10:22:41.0000000Z lane 1: FAIL desk-layout@3 20.5 s",
  "2026-11-14T10:22:41.5000000Z lane 1: FAIL flow 40.2 s",
  "2026-11-14T10:22:42.0000000Z FAIL easy 2.0 s",
  "2026-11-14T10:22:43.0000000Z some FAIL line that is not a result",
].join("\n");
test("AC3.14 parseFailedSpecs: exactly the failed unit names from a timestamped lane log", () => {
  assert.deepEqual(parseFailedSpecs(LOG), ["flow", "desk-layout@3", "easy"]);
  assert.deepEqual(parseFailedSpecs("2026-11-14T10:22:31Z lane 2: ok   flow 39.6 s\n"), []);
  assert.deepEqual(parseFailedSpecs(LOG.replace(/\n/g, "\r\n")), ["flow", "desk-layout@3", "easy"]);
  assert.ok(readFileSync(here("../.github/workflows/ship.yml"), "utf8").includes("(lane [0-9]+: *)?FAIL ([^ ]+) +[0-9.]+ s$"), "ship.yml sed must match FAIL_LINE");
});

// --- CI-LOOSEN 21 (AC9.1-9.5): the box flake-hunt job is never a required job ----------------
// SOURCE of every box fact below: .github/workflows/box.yml `flake-hunt:` (CI-ARCH PR 3 moved it out of tests.yml);
// `/all:` (the one required check) stays in tests.yml.
// Text-only parse, like tests/test_ci_all_job.py: no YAML dep, and a job block ends at the next job-level key/comment.
const TESTS = fileURLToPath(new URL("../.github/workflows/tests.yml", import.meta.url));
const BOX = fileURLToPath(new URL("../.github/workflows/box.yml", import.meta.url));
function jobBlock(name, file = TESTS) {
  const lines = readFileSync(file, "utf8").split("\n");
  const start = lines.findIndex((l) => l === `  ${name}:`);
  assert.notEqual(start, -1, `${basename(file)} must carry a top-level \`  ${name}:\` job`);
  const body = [];
  for (const l of lines.slice(start + 1)) {
    if (/^ {2}\S/.test(l)) break;   // the next job, or a job-level comment
    body.push(l);
  }
  return body.join("\n");
}

test("AC9.1 flake-hunt: self-hosted box, continue-on-error, <= 20 min, hunt step present", () => {
  const j = jobBlock("flake-hunt", BOX);
  assert.match(j, /^ {4}runs-on: \[self-hosted, titodori\]/m, "runs-on [self-hosted, titodori]");
  assert.match(j, /^ {4}continue-on-error: true$/m, "the box job may fail without failing the run");
  const t = /^ {4}timeout-minutes: (\d+)$/m.exec(j);
  assert.ok(t, "timeout-minutes must be set");
  assert.ok(Number(t[1]) <= 20, `timeout-minutes ${t[1]} must be <= 20`);
  assert.match(j, /SPECS="\$spec"/, "the hunt runs each spec through tests/run-all.sh with SPECS=");
  assert.match(j, /pass \$pass\/5/, "a per-spec `pass k/5` line is the result");
  assert.doesNotMatch(j, /^ {4}needs:/m, "the box job waits on nothing (it runs after the tests workflow, with no needs)");
});

test("AC9.4 flake-hunt: the fork guard is written in the job `if` itself, and the events are dispatch + a tests run on main", () => {
  const j = jobBlock("flake-hunt", BOX);
  const cond = /^ {4}if: (.*)$/m.exec(j)[1];
  assert.match(cond, /^github\.event_name == 'workflow_dispatch' \|\| \(/, "a manual hunt is ORed (a dispatch has no workflow_run payload)");
  assert.match(cond, /github\.event\.workflow_run\.event == 'push' && github\.event\.workflow_run\.head_branch == 'main'/, "a tests run for a push to main only");
  // AC9.4: not only implied by the event list — the guard itself is in this `if`
  assert.match(cond, /github\.event\.workflow_run\.head_repository\.full_name == github\.repository/,
    "fork guard in the job `if` itself: fork code must never reach the self-hosted box");
});

test("AC9.2/9.5 flake-hunt is NOT a required job: never in all.needs, no green stamp, no flaky-block artifact", () => {
  const all = jobBlock("all");
  const needs = /^ {4}needs:\s*\[(.*)\]$/m.exec(all)[1].split(",").map((s) => s.trim()).sort();
  assert.deepEqual(needs, ["block", "decide", "plan", "unit"], "the required check needs exactly the four gating jobs");
  assert.doesNotMatch(all, /flake-hunt/, "the `all` verdict must not read the box job (a cancelled box can never refuse a ship)");
  const j = jobBlock("flake-hunt", BOX);
  assert.match(j, /^ {10}name: flake-hunt\b/m, "the artifact is named flake-hunt");
  assert.doesNotMatch(j, /^ {10}name: flaky-block-/m, "never a flaky-block-* artifact: ci-flaky.mjs reads only that pattern");
  // CI-ARCH PR 3: the job lives in box.yml only, never back in the required check's workflow
  assert.doesNotMatch(readFileSync(TESTS, "utf8"), /^ {2}flake-hunt:/m, "tests.yml must not carry the box job");
  // ci-gate.mjs has no job allow-list, so the only "required jobs" list is all.needs: prove the gate never names it
  assert.doesNotMatch(readFileSync(here("../tools/operations/ci-gate.mjs"), "utf8"), /flake-hunt/, "the ship gate never sees the box job");
});

// --- CI-ARCH PR 3: the box is its own workflow, never a tests run --------------------------------
test("CI-ARCH PR 3 box.yml: name box, tests workflow_run + dispatch (no schedule), own group, read-only", () => {
  const y = readFileSync(BOX, "utf8");
  assert.match(y, /^name: box$/m, "workflow name is box");
  assert.match(y, /^ {2}workflow_run:\n {4}workflows: \[tests\]\n {4}types: \[completed\]$/m, "after a tests run completes");
  assert.match(y, /^ {2}workflow_dispatch:/m, "a manual hunt, no inputs");
  assert.doesNotMatch(y, /^ {2}schedule:/m, "the nightly schedule stays in tests.yml; box.yml has none");
  assert.match(y, /^concurrency: \{ group: box, cancel-in-progress: false \}$/m, "own group, never the tests group");
  assert.match(y, /^permissions: \{ contents: read \}$/m, "read-only: the hunt never writes");
  assert.match(y, /^ {10}ref: \$\{\{ github\.event\.workflow_run\.head_sha \|\| github\.sha \}\}$/m, "checkout the tested commit, not the branch head");
});

test("CI-ARCH PR 3 tests.yml concurrency: push groups per sha, PR rule unchanged (5169fb9 trap)", () => {
  const y = readFileSync(TESTS, "utf8");
  assert.match(y, /^ {2}group: tests-\$\{\{ github\.event_name == 'push' && github\.sha \|\| github\.ref \}\}$/m,
    "push runs get a per-sha group (main runs in parallel); PR runs keep github.ref");
  assert.match(y, /^ {2}cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}$/m, "PR cancellation is unchanged");
  assert.match(y, /^ {2}queue: \$\{\{ github\.event_name == 'pull_request' && 'single' \|\| 'max' \}\}$/m, "the PR queue branch is unchanged");
});
