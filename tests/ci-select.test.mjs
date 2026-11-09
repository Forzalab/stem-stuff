// RED (PR 2, ticket 09): affected selection. Fails today because tools/ci-select.mjs does not
// exist yet — every import below errors until the coder writes the module with this exact surface:
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
// and a CLI: node tools/ci-select.mjs --total <N> [--file <path>...]  -> prints "kind reason", exit 0.
// The pure part takes every fact as an argument: no network, no GitHub, no git.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  BIG_CODE_FILES, BIG_AREAS, HUB_FRACTION, DOCS_EXTS,
  isCodeFile, areaOf, areasOf, isBig, isHub, pwSpecs, decideSelection,
} from "../tools/ci-select.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const RUN = fileURLToPath(new URL("./run-all.sh", import.meta.url));
const CLI = fileURLToPath(new URL("../tools/ci-select.mjs", import.meta.url));
const UNITS = readFileSync(new URL("./fixtures/ci-select/units.txt", import.meta.url), "utf8")
  .split("\n").map((s) => s.trim()).filter(Boolean);

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

// The universe of units. SOURCE: `bash tests/run-all.sh --list` = 121 (unittest + npm + 119 .pw),
// HEAD 9771860. The fixture is the --list output verbatim; the test below keeps it honest.
const TOTAL = UNITS.length;
const LOGIC = ["unittest", "npm"];

// --- the fixture is the real unit universe ---------------------------------------------
test("fixture units.txt is exactly `run-all.sh --list` (121 units)", () => {
  const list = execFileSync("bash", [RUN, "--list"], { cwd: ROOT, encoding: "utf8" })
    .split("\n").map((s) => s.trim()).filter(Boolean);
  assert.deepEqual(UNITS, list, "units.txt must match --list (keep the fixture in sync with the schedule)");
  assert.equal(TOTAL, 121, "SOURCE: --list = 121 units (unittest + npm + 119 .pw), HEAD 9771860");
  assert.ok(TOTAL > LOGIC.length, "there must be .pw units beyond unittest+npm");
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
    tools: ["tools/ci-gate.mjs", "tools/batch.sh", "tools/slip_coverage.py"],
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

// --- hub (C1): any code file with affected set >=90% of units -> full -------------------
test("HUB boundary INTENT #1: >= at exactly 90%", () => {
  // A literal-but-wrong port using strict `>` would return false at exactly 90% and let a
  // near-ALL server file slip through as "affected". The contract is >= (HUB_FRACTION).
  assert.equal(HUB_FRACTION, 0.90, "SOURCE C1: >=90% of units");
  assert.equal(isHub(90, 100), true, "exactly 90% is a hub (>=, not >)");
  assert.equal(isHub(89, 100), false, "below 90% is not a hub");
});

test("HUB: serve.py is a real hub (112 of 121)", () => {
  // SOURCE of 112: `bash tests/run-all.sh --affected serve.py | wc -l` = 112 (unittest + npm + 110
  // .pw), HEAD 9771860. SOURCE of 121: --list (the fixture). 112/121 = 92.6% >= 90%.
  const serve = affectedUnits("serve.py");
  assert.equal(serve.length, 112, "serve.py affected count must stay 112 (C1 measurement)");
  assert.ok(serve.includes("unittest") && serve.includes("npm"), "serve.py reaches both logic units");
  assert.equal(isHub(serve.length, TOTAL), true, "112/121 >= 0.90");
  const d = decideSelection({ files: ["serve.py"], affectedCounts: { "serve.py": serve.length }, totalUnits: TOTAL });
  assert.equal(d.kind, "full", `a serve.py PR must be full, got ${d.kind}`);
});

test("HUB is per-file, not the union (INTENT: no summing counts)", () => {
  // A literal-but-wrong port that sums the affected counts (60+60=120 >= 90% of 121) would call
  // this full; each file is below the threshold, so neither is a hub -> affected.
  const d = decideSelection({
    files: ["a.js", "b.js"],
    affectedCounts: { "a.js": 60, "b.js": 60 },
    totalUnits: TOTAL,
  });
  assert.equal(d.kind, "affected", "two sub-90% files are not a hub (per-file, not summed)");
});

// --- A3: a one-file PR runs fewer units than all ---------------------------------------
test("A3: one non-hub file -> affected, fewer units than all", () => {
  // SOURCE of 24: `bash tests/run-all.sh --affected app.css | wc -l` = 24, HEAD 9771860.
  const appCss = affectedUnits("app.css");
  assert.equal(appCss.length, 24, "app.css affected count must stay 24");
  assert.ok(appCss.length < TOTAL, `A3: 24 < ${TOTAL} (fewer than the full suite)`);
  const d = decideSelection({ files: ["app.css"], affectedCounts: { "app.css": appCss.length }, totalUnits: TOTAL });
  assert.equal(d.kind, "affected", `a one-file app.css PR runs the affected subset, got ${d.kind}`);
});

// --- docs-only PR -> decide + cite -----------------------------------------------------
test("docs-only PR -> full (a .md file is unmapped -> all layout -> hub)", () => {
  // DECISION (SPEC-PR2.md open question 1, orc bounce): no docs-only shortcut. The fast job never
  // runs on pull_request (tests.yml fast: `if: inputs.pipe == 'fast'`, dispatch-only) and the all
  // check needs plan+unit+block, so docs-only must go green through the normal full path. A .md is
  // unmapped -> `--affected` = all 119 layout units -> 119/121 >= 90% -> hub -> full.
  const docs = affectedUnits("README.md");
  assert.equal(docs.length, TOTAL - LOGIC.length, "README.md -> all layout units (unmapped)");
  const d = decideSelection({ files: ["README.md", "SCHEMA.md"], affectedCounts: { "README.md": docs.length, "SCHEMA.md": docs.length }, totalUnits: TOTAL });
  assert.equal(d.kind, "full", "docs-only must be full (hub), never fast/affected");
  assert.ok(d.reason, "a decision must say why");
});

test("empty diff -> full (never fewer)", () => {
  const d = decideSelection({ files: [], affectedCounts: {}, totalUnits: TOTAL });
  assert.equal(d.kind, "full", "an empty file list defaults to full (never fewer)");
});

// --- unknown/unmapped -> never fewer (all of the file's pipe) ---------------------------
test("an unmapped file maps to its whole pipe (all layout), so it is a hub -> full", () => {
  // SOURCE I1 (tests/INVARIANTS.md): an unmapped file never selects fewer than its whole pipe.
  // no-such-file.css is unmapped -> all 119 layout units -> 119/121 = 98% >= 90% -> full.
  const layout = TOTAL - LOGIC.length; // 119 .pw units
  const unknown = affectedUnits("no-such-file.css");
  assert.equal(unknown.length, layout, `unmapped .css -> every layout unit (${layout})`);
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
  // SOURCE: `bash tests/run-all.sh --affected tools/ci-gate.mjs` = ["npm"] (auto.tsv:
  // tools/ci-gate.mjs npm; a .mjs under tools/ is logic-pipe). Zero .pw names -> SPECS would be
  // empty and --plan would plan ALL (wrong), so the plan job must flag skip_block instead (§5).
  const units = affectedUnits("tools/ci-gate.mjs");
  assert.deepEqual(units, ["npm"], "a tools/*.mjs file affects only npm");
  assert.deepEqual(pwSpecs(units), [], "zero .pw names -> the plan job sets skip_block=true");
  const d = decideSelection({ files: ["tools/ci-gate.mjs"], affectedCounts: { "tools/ci-gate.mjs": units.length }, totalUnits: TOTAL });
  assert.equal(d.kind, "affected", "still affected (unit job runs npm), but the block job is skipped");
});

// --- the CLI (no git: --file injects the diff; --total injects the unit count) ----------
test("CLI: serve.py (hub) -> full, app.css -> affected, README.md -> full", () => {
  for (const [file, kind] of [["serve.py", "full"], ["app.css", "affected"], ["README.md", "full"]]) {
    const r = cli(["--total", String(TOTAL), "--file", file]);
    assert.equal(r.status, 0, `CLI ${file}: exit 0; stderr: ${r.stderr}`);
    assert.match(r.stdout, new RegExp(`^${kind}\\b`), `CLI ${file} must print "${kind} ...", got: ${r.stdout}`);
  }
});

// --- --plan accepts a unit subset via SPECS (no change when SPECS is empty) -------------
test("--plan honours a SPECS subset (RED until run-all.sh implements it)", () => {
  // SOURCE SPEC-PR2.md §Design.3: SPECS (already "run exactly these .pw specs") is also honoured
  // by --plan; an empty SPECS is byte-for-byte today's full plan. Today --plan ignores SPECS, so
  // the matrix still holds every unit and this test fails until the subset path lands.
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
  assert.equal(matrixUnits(matrix).length, TOTAL - LOGIC.length, "--plan 2 2 with no SPECS must deal every .pw unit");
});
