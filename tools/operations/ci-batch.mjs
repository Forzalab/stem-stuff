#!/usr/bin/env node
/* The "main once per batch" landing plan (ticket 09, PR 3 / R2): pure, no git, no network.
   SOURCE: tools/operations/batch.sh cmd_land (batch.sh:200-239) lands a batch by merging the SEALED batch/N tip
   into main ONCE, then resolving the individual PRs. N items => exactly 1 main update => exactly 1
   tests.yml `push: [main]` run per batch. Never land each PR's untested head sha. */

export function landPlan(items, sealedSha) {
  const list = Array.isArray(items) ? items.filter(Boolean) : [];
  const sha = typeof sealedSha === "string" ? sealedSha.trim() : "";
  if (!list.length) {
    return { ok: false, pushes: 0, sha: "", prs: 0, reason: "empty manifest: nothing to land" };
  }
  if (!sha) {
    return { ok: false, pushes: 0, sha: "", prs: list.length, reason: "missing sealed sha: there is no tested batch tip to land" };
  }
  return {
    ok: true,
    pushes: 1,
    sha,
    prs: list.length,
    reason: `land the sealed batch tip ${sha} as one main update, then resolve ${list.length} PR(s)`,
  };
}
