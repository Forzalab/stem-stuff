// lint-tags.mjs: green on the real repo (every .pw unit tagged, no lies), red on each kind of bad table (CI plan PR 3, mutant M10).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { lint, lintRepo, parseRunAll } from "./lint-tags.mjs";

const TODAY = "2026-10-25";
const runAll = rows => `declare -A PART_ENV=(
  [ux-flows@phone]="WIDTHS=393"
  [ux-flows@desk]="WIDTHS=1280"
)
weight() {
  case "$1" in
    *) echo 5 ;;
  esac
}
tags() {
  case "$1" in
${rows}
    *) echo "" ;;
  esac
}
`;
const GOOD = `    ux-flows@phone|ux-flows@desk) echo "@layout @real-time" ;;   # a comment
    redo-note) echo "@logic @real-time" ;; idle-peek) echo "@logic @fast-time" ;;
    font) echo "@engine @real-time" ;;`;
const SPECS = {
  "ux-flows": "await page.goto(base);",
  "redo-note": "// real clock: three dwells\nawait page.waitForTimeout(2100);",
  "idle-peek": "await page.clock.install({ time: t0 });",
  font: "await page.goto(base);",
};
const run = (rows = GOOD, specs = SPECS, today = TODAY) => lint({ runAll: runAll(rows), specs, today });
const red = (errs, re) => assert.ok(errs.some(e => re.test(e)), `want a problem matching ${re}, got:\n${errs.join("\n") || "(green)"}`);

test("the real repo: every unit tagged, the lint is green and fast (< 5 s, no browser)", () => {
  const t0 = Date.now(), errs = lintRepo();
  assert.deepEqual(errs, [], errs.join("\n"));
  assert.ok(Date.now() - t0 < 5000);
});
test("the real table covers the parts, not the whole spec", () => {
  const { parts, tags } = parseRunAll(readFileSync(new URL("./run-all.sh", import.meta.url), "utf8"));
  assert.ok(parts.includes("ux-flows@phone") && tags.has("ux-flows@phone") && !tags.has("ux-flows"));
});
test("the good fixture is green", () => assert.deepEqual(run(), []));

test("no tags() table at all = red", () => red(lint({ runAll: "weight() {\n}\n", specs: SPECS, today: TODAY }), /no tags\(\) table/));
test("untagged spec = red, naming it", () => red(run(GOOD, { ...SPECS, "new-spec": "x" }), /^new-spec: no tags\(\) line/));
test("untagged part = red", () => red(run(GOOD.replace("ux-flows@phone|", "")), /^ux-flows@phone: no tags\(\) line/));
test("tags line for a spec that does not exist = red", () => red(run(GOOD + `\n    gone) echo "@logic @real-time" ;;`), /^gone: tags\(\) line for a spec that does not exist/));
test("whole-spec line for a spec with parts = red", () => red(run(GOOD + `\n    ux-flows) echo "@logic @real-time" ;;`), /^ux-flows: has parts/));
test("two lines for one spec = red", () => red(run(GOOD + `\n    font) echo "@logic @real-time" ;;`), /^font: more than one tags\(\) line/));
test("unknown tag = red", () => red(run(GOOD.replace(`font) echo "@engine`, `font) echo "@engine @slow`)), /^font: unknown tag @slow/));
test("no engine tag = red", () => red(run(GOOD.replace(`font) echo "@engine `, `font) echo "`)), /^font: wants exactly one engine tag/));
test("two engine tags = red", () => red(run(GOOD.replace(`font) echo "@engine`, `font) echo "@engine @layout`)), /^font: wants exactly one engine tag/));
test("double time tag = red", () => red(run(GOOD.replace(`font) echo "@engine @real-time`, `font) echo "@engine @real-time @fast-time`)), /^font: wants exactly one time tag/));
test("M10: redo-note tagged @fast-time = red (real 2 s gate), even if it installed the clock", () => {
  const rows = GOOD.replace(`redo-note) echo "@logic @real-time"`, `redo-note) echo "@logic @fast-time"`);
  red(run(rows), /^redo-note: is a real 2 s gate spec/);
  red(run(rows, { ...SPECS, "redo-note": "await page.clock.install({ time: 0 });" }), /^redo-note: is a real 2 s gate spec/);
});
test("@fast-time without clock.install = red", () => red(run(GOOD.replace(`font) echo "@engine @real-time`, `font) echo "@engine @fast-time`)), /^font: tagged @fast-time but tests\/font\.pw\.mjs never installs page\.clock/));
test("quarantine: in date with an issue = green; URL issue = green", () => {
  assert.deepEqual(run(GOOD.replace(`font) echo "@engine @real-time`, `font) echo "@engine @real-time @quarantine:#123:2026-11-01`)), []);
  assert.deepEqual(run(GOOD.replace(`font) echo "@engine @real-time`, `font) echo "@engine @real-time @quarantine:https://github.com/Forzalab/stem-stuff/issues/9:2026-11-08`)), []);
});
test("quarantine: expired = red", () => red(run(GOOD.replace(`font) echo "@engine @real-time`, `font) echo "@engine @real-time @quarantine:#123:2026-10-24`)), /^font: .*expired/));
test("quarantine: more than 14 days out = red", () => red(run(GOOD.replace(`font) echo "@engine @real-time`, `font) echo "@engine @real-time @quarantine:#123:2026-11-09`)), /^font: .*more than 14 days/));
test("quarantine: no issue = red", () => {
  red(run(GOOD.replace(`font) echo "@engine @real-time`, `font) echo "@engine @real-time @quarantine:2026-11-01`)), /^font: bad @quarantine/);
  red(run(GOOD.replace(`font) echo "@engine @real-time`, `font) echo "@engine @real-time @quarantine:soon:2026-11-01`)), /^font: .*has no issue/);
});
test("SPAM_MS knob used by a spec not on KNOB_ALLOW = red", () => {
  red(run(GOOD, { ...SPECS, font: 'await page.goto(base + "?spam=0");' }), /^font: uses the SPAM_MS test knob/);
  red(run(GOOD, { ...SPECS, font: "await page.evaluate(() => { window.__test = { spam: 0 }; });" }), /^font: uses the SPAM_MS test knob/);
  assert.deepEqual(run(GOOD, { ...SPECS, font: "/* a pick under 2 s (nav.js SPAM_MS) */" }), [], "a comment naming SPAM_MS is not the knob");
});
