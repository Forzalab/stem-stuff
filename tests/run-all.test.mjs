// run-all.sh FAIL_RE: the lines that mark a spec red, and the ones it prints as the reason in the CI log.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const src = readFileSync(new URL("./run-all.sh", import.meta.url), "utf8");
const re = src.match(/^FAIL_RE='([^']+)'$/m)?.[1];
const hit = line => spawnSync("grep", ["-qE", re], { input: line + "\n" }).status === 0;

test("FAIL_RE is defined", () => assert.ok(re, "no FAIL_RE='...' line in run-all.sh"));
test("a failed ux-flows row matches (both widths)", () => {
  assert.ok(hit("43 offline-sw             1280 FAIL t_ms=11485  page.waitForFunction: Timeout 10000ms exceeded."));
  assert.ok(hit("08 boot-splash            393 FAIL t_ms=900  flow timeout 60 s"));
});
test("other specs' FAIL lines still match", () => {
  for (const l of ["FAIL engine: PW_BROWSER=x is not a Playwright engine", "3 FAIL", "  FAIL step 2"]) assert.ok(hit(l), l);
});
test("ok / SKIP rows and the summary line do not match", () => {
  for (const l of ["43 offline-sw             1280 ok   t_ms=1200", "40 silent-reload-idle     1280 SKIP t_ms=56  needs a stamped deploy",
    "# done: widths 1280, 52 checks, 47 ok, 1 FAIL, 4 SKIP", "ok   ux-flows@desk 105.7 s"]) assert.ok(!hit(l), l);
});
