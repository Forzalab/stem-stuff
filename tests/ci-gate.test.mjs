// RED (PR 1, ticket 09): the ship-gate decision + the green-run facts. Fails today because
// tools/operations/ci-gate.mjs does not exist yet — every import below errors until the coder writes the
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
import { DOCS_EXTS, isDocsOnly, classify, runKind, pickGreen, decideShip } from "../tools/ci-gate.mjs";

const CLI = fileURLToPath(new URL("../tools/ci-gate.mjs", import.meta.url));
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
    "views/allow/common-en.txt",     // views/allow/common-en.txt:1 — answer allow-list, runtime
    "views/allow/format-stop.txt",   // answer allow-list
    "vendor/fonts/OFL.txt",          // vendor/fonts/OFL.txt:1 — ships with the fonts
    "serve.py",                      // server
    "app.js",                        // client
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
  const c = classify(["README.md", "app.js"]);
  assert.deepEqual(c.docs, ["README.md"], "README.md:1 is the only doc");
  assert.deepEqual(c.code, ["app.js"], "app.js is code");
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
  const r = decideShip({ candidate: "abc1234", green: { sha: "abc1234", kind: "full" }, changedFiles: ["app.js", "serve.py"] });
  assert.equal(r.ok, true, "M1: exact sha already has a full green run");
});

test("decideShip: docs-only since the last full green run ships", () => {
  const r = decideShip({ candidate: "def5678", green: { sha: "abc1234", kind: "full" }, changedFiles: ["README.md", "SCHEMA.md"] });
  assert.equal(r.ok, true, "M1: later diff is docs-only");
});

test("decideShip: one code file since the last full green run refuses", () => {
  const r = decideShip({ candidate: "def5678", green: { sha: "abc1234", kind: "full" }, changedFiles: ["app.js"] });
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
  const r = cli(["--candidate", "aaaaaaa1", "--runs", fix("green"), "--file", "app.js"]);
  assert.equal(r.status, 0, `exit 0 = ship; stderr: ${r.stderr}`);
  assert.match(r.stdout, /ok/i, `stdout must say ship ok; got: ${r.stdout}`);
});

test("CLI: refuses a red sha (fixture red.json, all runs failed)", () => {
  const r = cli(["--candidate", "fail33333", "--runs", fix("red"), "--file", "app.js"]);
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
  const r = cli(["--candidate", "green7777", "--runs", fix("code-diff"), "--file", "app.js"]);
  assert.equal(r.status, 1, "green6666 is full green but app.js changed since (M1)");
});

test("CLI: a docs-only diff since the last green sha ships", () => {
  const r = cli(["--candidate", "green7777", "--runs", fix("code-diff"), "--file", "README.md"]);
  assert.equal(r.status, 0, "docs-only later diff is shippable (M1)");
});
