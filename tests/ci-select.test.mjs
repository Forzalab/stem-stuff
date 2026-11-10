// PR 2 (ticket 09): affected selection — pure decision + CLI contract. The module tools/operations/ci-select.mjs
// exports this exact surface (and a CLI):
//   export const BIG_CODE_FILES = 7        // M4: >=7 code files -> full
//   export const BIG_AREAS = 3             // M4: >=3 areas -> full
//   export const HUB_FRACTION = 0.90       // C1: affected >=90% of units -> full
//   export const DOCS_EXTS = [".md"]       // SPEC-09 §docs-only
//   export function isCodeFile(path)
//   export function areaOf(path)           // "client"|"server"|"tools"|"tests"|"ci"|"docs"
//   export function areasOf(files)         // sorted distinct
//   export function isBig(files)           // boolean
//   export function isHub(affectedCount, totalUnits)   // boolean
//   export function pwSpecs(unitList)      // unitList minus "unittest" and "npm"
//   export function decideSelection({ files, affectedCounts, totalUnits }) // {kind, reason} ("full"|"affected")
// and a CLI: node tools/operations/ci-select.mjs --total <N> [--file <path>...]  -> prints "kind reason", exit 0.
// The pure part takes every fact as an argument: no network, no GitHub, no git.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  BIG_CODE_FILES, BIG_AREAS, HUB_FRACTION, DOCS_EXTS,
  isCodeFile, areaOf, areasOf, isBig, isHub, pwSpecs, decideSelection,
} from "../tools/operations/ci-select.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const RUN = fileURLToPath(new URL("./run-all.sh", import.meta.url));
const CLI = fileURLToPath(new URL("../tools/operations/ci-select.mjs", import.meta.url));

// The universe of units is derived at test time, never frozen: a hardcoded count drifts the moment
// anyone adds a spec (PR #469 failed exactly this way). SOURCE: `tests/run-all.sh --list`.
const ALL_UNITS = execFileSync("bash", [RUN, "--list"], { cwd: ROOT, encoding: "utf8" })
  .split("\n").map((s) => s.trim()).filter(Boolean);
const TOTAL = ALL_UNITS.length;
// The two logic units always ride in the `unit` job. SOURCE: run-all.sh:87 `logic_units=(unittest npm)`.
const LOGIC = ["unittest", "npm"];
const LAYOUT = ALL_UNITS.filter((u) => !LOGIC.includes(u));   // the .pw units

// --affected <file>... returns unit names; an unmapped file also prints one "unmapped:" diagnostic
// line on STDOUT (run-all.sh:125) which is NOT a unit. The CLI counts units the same way.
function affectedUnits(...files) {
  return execFileSync("bash", [RUN, "--affected", ...files], { cwd: ROOT, encoding: "utf8" })
    .split("\n").map((s) => s.trim()).filter((l) => l && !l.startsWith("unmapped:"));
}
function cli(args) {
  return spawnSync(process.execPath, [CLI, ...args], { cwd: ROOT, encoding: "utf8" });
}
// a --plan matrix block's `lanes` is "lane1specs|lane2specs", each lane space-separated names.
function matrixUnits(matrix) {
  return matrix.include.flatMap((b) =>
    b.lanes.split("|").flatMap((lane) => lane.trim().split(/\s+/).filter(Boolean)));
}

test("the unit universe derives from `run-all.sh --list`", () => {
  assert.ok(TOTAL > LOGIC.length, "there must be .pw units beyond unittest+npm");
  assert.equal(LAYOUT.length, TOTAL - LOGIC.length, "LAYOUT = every unit minus the two logic units");
  assert.ok(ALL_UNITS.includes("unittest") && ALL_UNITS.includes("npm"), "the logic units are listed");
});

// --- docs-only = .md only (SPEC-09 §docs-only) ------------------------------------------
test("DOCS_EXTS is {'.md'} and isCodeFile is its complement", () => {
  assert.ok(Array.isArray(DOCS_EXTS) && DOCS_EXTS.includes(".md"), "DOCS_EXTS must contain '.md'");
  for (const ext of DOCS_EXTS) {
    assert.equal(isCodeFile(`README${ext}`), false, `README${ext} is docs, not code`);
  }
  for (const f of ["serve.py", "app.js", "requirements.txt", ".github/workflows/tests.yml"]) {
    assert.equal(isCodeFile(f), true, `${f} is CODE (everything not .md)`);
  }
});

// --- areas: every bucket maps exactly once (SPEC-09 open question 1) --------------------
test("areaOf maps each of the 6 areas (loop over all members)", () => {
  const expect = {
    docs: ["README.md", "SCHEMA.md", "CLAUDE.md"],
    ci: [".github/workflows/tests.yml", "vercel.json", ".vercelignore", "deploy.sh"],
    tools: ["tools/operations/ci-gate.mjs", "tools/operations/batch.sh", "tools/bank_tools/slip_coverage.py"],
    tests: ["tests/ci-select.test.mjs", "tests/test_ci_image.py"],
    server: ["serve.py", "engine/__init__.py", "api/index.py"],
    client: ["app.js", "app.css", "index.html", "views/views.js", "vendor/marked.min.js", "requirements.txt"],
  };
  const seen = new Set();
  for (const [area, files] of Object.entries(expect)) {
    for (const f of files) {
      assert.equal(areaOf(f), area, `${f} -> ${area}`);
      seen.add(f);
    }
  }
  assert.deepEqual(areasOf(Object.values(expect).flat()), ["ci", "client", "docs", "server", "tests", "tools"],
    "areasOf returns the 6 sorted distinct areas (the full set, exactly once)");
});

// --- BIG (M4): >=7 code files OR >=3 areas ----------------------------------------------
test("BIG: 7 code files -> full (>=7 is inclusive)", () => {
  const seven = ["a.js", "b.js", "c.js", "d.js", "e.js", "f.js", "g.js"];
  assert.equal(BIG_CODE_FILES, 7, "SOURCE M4: >=7 code files");
  assert.equal(isBig(seven), true, "exactly 7 code files is BIG");
  assert.equal(decideSelection({ files: seven, affectedCounts: {}, totalUnits: TOTAL }).kind, "full",
    "decideSelection must be full for a BIG diff");
});

test("BIG: >=3 areas -> full", () => {
  const cross = ["README.md", "serve.py", "app.js"]; // docs + server + client
  assert.equal(BIG_AREAS, 3, "SOURCE M4: >=3 areas");
  assert.equal(isBig(cross), true, "3 distinct areas (docs, server, client) is BIG");
  assert.equal(decideSelection({ files: cross, affectedCounts: {}, totalUnits: TOTAL }).kind, "full");
});

test("BIG INTENT #2: docs files are NOT code files", () => {
  // A literal-but-wrong port that counts every changed file (not just code files) toward the
  // ">=7" leg would return true for 7 .md files; the rule is >=7 CODE files, and .md is not code.
  const sevenDocs = ["1.md", "2.md", "3.md", "4.md", "5.md", "6.md", "7.md"];
  assert.equal(isBig(sevenDocs), false, "7 .md files = 0 code files and 1 area (docs) -> not BIG");
});

test("BIG INTENT #3: areas must be DISTINCT, not occurrences", () => {
  // A literal-but-wrong port that counts per-file area occurrences (4 >= 3) would return true;
  // four files in one bucket is ONE area, so neither leg fires.
  const fourClient = ["a.js", "b.js", "c.css", "d.html"];
  assert.equal(areasOf(fourClient).length, 1, "all four are client -> 1 distinct area");
  assert.equal(isBig(fourClient), false, "4 files, 1 area, 4 < 7 code files -> not BIG");
});

// --- hub (C1): any changed file with affected set >=90% of units -> full -----------------
test("HUB boundary INTENT #1: >= at exactly 90%", () => {
  // A literal-but-wrong port using strict `>` would return false at exactly 90% and let a
  // near-ALL server file slip through as "affected". The contract is >= (HUB_FRACTION).
  assert.equal(HUB_FRACTION, 0.90, "SOURCE C1: >=90% of units");
  assert.equal(isHub(90, 100), true, "exactly 90% is a hub (>=, not >)");
  assert.equal(isHub(89, 100), false, "below 90% is not a hub");
});

test("HUB: serve.py is a real hub (affected >= 90% of all units)", () => {
  // SOURCE C1: `--affected serve.py` reaches nearly the whole suite. Assert the RELATION, not the
  // number — serve.py's exact count drifts as specs are added, but it must stay >= 90% (a hub).
  const serve = affectedUnits("serve.py");
  assert.ok(serve.length >= HUB_FRACTION * TOTAL,
    `serve.py affects ${serve.length}/${TOTAL}, want >= 90%`);
  assert.ok(serve.includes("unittest") && serve.includes("npm"), "serve.py reaches both logic units");
  assert.equal(isHub(serve.length, TOTAL), true, "isHub must agree the count is a hub");
  const d = decideSelection({ files: ["serve.py"], affectedCounts: { "serve.py": serve.length }, totalUnits: TOTAL });
  assert.equal(d.kind, "full", `a serve.py PR must be full, got ${d.kind}`);
});

test("HUB is per-file, not the union (INTENT: no summing counts)", () => {
  // A literal-but-wrong port that sums the affected counts (60+60 would clear 90% of the total)
  // would call this full; each file is below the threshold, so neither is a hub -> affected.
  const d = decideSelection({
    files: ["a.js", "b.js"],
    affectedCounts: { "a.js": 60, "b.js": 60 },
    totalUnits: TOTAL,
  });
  assert.equal(d.kind, "affected", "two sub-90% files are not a hub (per-file, not summed)");
});

// --- A3: a one-file PR runs fewer units than all ---------------------------------------
test("A3: one non-hub file -> affected, fewer units than all", () => {
  // SOURCE A3: `--affected app.css` selects a strict subset of the suite. Assert the relation.
  const appCss = affectedUnits("app.css");
  assert.ok(appCss.length > 0, "app.css affects at least one unit");
  assert.ok(appCss.length < TOTAL, `A3: app.css affects ${appCss.length} < ${TOTAL} (fewer than all)`);
  const d = decideSelection({ files: ["app.css"], affectedCounts: { "app.css": appCss.length }, totalUnits: TOTAL });
  assert.equal(d.kind, "affected", `a one-file app.css PR runs the affected subset, got ${d.kind}`);
});

// --- docs-only PR -> decide + cite -----------------------------------------------------
test("docs-only PR -> docs (superseded: was full via unmapped -> hub; fix B skips unit+block)", () => {
  // DECISION (SPEC-PR2.md open question 1): no docs-only shortcut. The fast job never runs on
  // pull_request (tests.yml fast: `if: inputs.pipe == 'fast'`, dispatch-only) and the all check
  // needs plan+unit+block, so docs-only must go green through the normal full path. A .md is
  // unmapped -> `--affected` = all layout units -> >= 90% -> hub -> full.
  const docs = affectedUnits("README.md");
  assert.deepEqual(new Set(docs), new Set(LAYOUT), "README.md (unmapped) -> exactly all layout units");
  const d = decideSelection({ files: ["README.md", "SCHEMA.md"], affectedCounts: { "README.md": docs.length, "SCHEMA.md": docs.length }, totalUnits: TOTAL });
  assert.equal(d.kind, "docs", "docs-only must be docs (unit+block skipped)");
  assert.ok(d.reason, "a decision must say why");
});

test("empty diff -> full (never fewer)", () => {
  const d = decideSelection({ files: [], affectedCounts: {}, totalUnits: TOTAL });
  assert.equal(d.kind, "full", "an empty file list defaults to full (never fewer)");
});

// --- unknown/unmapped -> never fewer (all of the file's pipe) ---------------------------
test("an unmapped file maps to its whole pipe (all layout), so it is a hub -> full", () => {
  // SOURCE I1 (tests/INVARIANTS.md): an unmapped file never selects fewer than its whole pipe.
  const unknown = affectedUnits("no-such-file.css");
  assert.deepEqual(new Set(unknown), new Set(LAYOUT), "unmapped .css -> exactly the layout units (never fewer)");
  const d = decideSelection({ files: ["no-such-file.css"], affectedCounts: { "no-such-file.css": unknown.length }, totalUnits: TOTAL });
  assert.equal(d.kind, "full", "an unmapped layout file must be full, never fewer");
});

// --- zero-.pw affected set -> skip the block job ---------------------------------------
test("pwSpecs drops unittest/npm and keeps the .pw names", () => {
  assert.deepEqual(pwSpecs(["unittest", "npm", "layers", "popover"]), ["layers", "popover"],
    "pwSpecs = the .pw names (unitList minus the two logic units)");
  assert.deepEqual(pwSpecs(["unittest", "npm"]), [], "logic-only -> zero .pw names");
  assert.deepEqual(pwSpecs(["npm"]), [], "a tools/*.mjs file affects only npm -> zero .pw names");
});

test("zero-.pw: a logic-only PR is affected with no block work (skip_block)", () => {
  // SOURCE SPEC-PR2.md §5: a logic-pipe file (tools/*.mjs) affects only logic units, so the plan
  // job must flag skip_block. Assert the intent — its units are all logic units — not today's
  // exact list (a .mjs under tools/ is logic-pipe; run-all.sh:92 `*.mjs` tools/*|tests/* -> logic).
  const units = affectedUnits("tools/operations/ci-gate.mjs");
  assert.ok(units.length >= 1, "a tools/*.mjs file affects at least one logic unit");
  assert.ok(units.every((u) => LOGIC.includes(u)), `all its units are logic units, got: ${units.join(",")}`);
  assert.deepEqual(pwSpecs(units), [], "zero .pw names -> the plan job sets skip_block=true");
  const d = decideSelection({ files: ["tools/operations/ci-gate.mjs"], affectedCounts: { "tools/operations/ci-gate.mjs": units.length }, totalUnits: TOTAL });
  assert.equal(d.kind, "affected", "still affected (unit job runs the logic units), but the block job is skipped");
});

// --- the CLI (no git: --file injects the diff; --total injects the unit count) ----------
test("CLI: serve.py (hub) -> full, app.css -> affected, README.md -> docs", () => {
  for (const [file, kind] of [["serve.py", "full"], ["app.css", "affected"], ["README.md", "docs"]]) {
    const r = cli(["--total", String(TOTAL), "--file", file]);
    assert.equal(r.status, 0, `CLI ${file}: exit 0; stderr: ${r.stderr}`);
    assert.match(r.stdout, new RegExp(`^${kind}\\b`), `CLI ${file} must print "${kind} ...", got: ${r.stdout}`);
  }
});

// --- --plan accepts a unit subset via SPECS (no change when SPECS is empty) -------------
test("--plan honours a SPECS subset", () => {
  // SOURCE SPEC-PR2.md §Design.3: SPECS (already "run exactly these .pw specs") is also honoured
  // by --plan; an empty SPECS is byte-for-byte today's full plan.
  const out = execFileSync("bash", ["-c", `SPECS="layers popover axis-cross" ${RUN} --plan 1 3`],
    { cwd: ROOT, encoding: "utf8" });
  const matrix = JSON.parse(out);
  assert.deepEqual(new Set(matrixUnits(matrix)), new Set(["layers", "popover", "axis-cross"]),
    "the matrix must contain exactly the SPECS subset");
});

test("--plan with no SPECS still plans every unit (I6: old behaviour unchanged)", () => {
  // SOURCE I6 (tests/INVARIANTS.md): old --plan B L keeps its behaviour. Empty SPECS -> all units.
  const out = execFileSync("bash", [RUN, "--plan", "2", "2"], { cwd: ROOT, encoding: "utf8" });
  const matrix = JSON.parse(out);
  assert.equal(matrixUnits(matrix).length, LAYOUT.length, "--plan 2 2 with no SPECS must deal every .pw unit");
});

test("docs-only diff -> docs; .md + code -> not docs", () => {
  assert.equal(decideSelection({ files: ["CLAUDE.md", "a/b.md"], affectedCounts: { "CLAUDE.md": 120 }, totalUnits: 122 }).kind, "docs");
  assert.notEqual(decideSelection({ files: ["CLAUDE.md", "x.js"], affectedCounts: {}, totalUnits: 122 }).kind, "docs");
  assert.equal(decideSelection({ files: [], affectedCounts: {}, totalUnits: 122 }).kind, "full");
});
