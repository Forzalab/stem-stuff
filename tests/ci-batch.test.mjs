// RED (ticket 09, PR 3 / STEP A): the "main once per batch" landing plan (R2). Fails today because
// tools/ci-batch.mjs does not exist yet — every import errors until the coder writes the module with
// this exact surface:
//   export function landPlan(items, sealedSha)  // -> { ok, pushes, sha, prs, reason }
// No network, no GitHub: landPlan is pure; tools/batch.sh cmd_land (batch.sh:200-239) calls it to
// land the whole batch as ONE push of the sealed tip, instead of N `gh pr merge` calls.
import { test } from "node:test";
import assert from "node:assert/strict";
import { landPlan } from "../tools/ci-batch.mjs";

// --- R2: N PRs land as ONE push of the sealed sha, never N pushes of each head sha ----------
test("landPlan: a 3-PR batch lands as one push of the sealed sha", () => {
  const items = [{ pr: 101, sha: "aaaa" }, { pr: 102, sha: "bbbb" }, { pr: 103, sha: "cccc" }];
  const d = landPlan(items, "SEALED");
  assert.equal(d.ok, true);
  assert.equal(d.prs, 3, "the manifest has 3 PRs");
  assert.equal(d.pushes, 1,
    "INTENT: a literal-but-wrong port that lands each PR head (N pushes) would return pushes === 3; R2 requires exactly 1 main update per batch");
  assert.equal(d.sha, "SEALED",
    "INTENT: main moves to the SEALED batch tip (the SHA that already passed a full run), never to the first PR's head sha");
});

test("landPlan: the sealed sha is required (never land each PR's untested head)", () => {
  const items = [{ pr: 101, sha: "aaaa" }];
  const d = landPlan(items, "");
  assert.equal(d.ok, false, "missing sealed sha refuses (there is no tested tip to land)");
  assert.equal(d.pushes, 0);
});

test("landPlan: an empty manifest refuses", () => {
  const d = landPlan([], "SEALED");
  assert.equal(d.ok, false, "nothing to land");
  assert.equal(d.pushes, 0);
});
