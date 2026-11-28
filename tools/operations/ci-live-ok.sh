#!/usr/bin/env bash
# VISUAL-PR GATE (Tony Nov 27): the `live-ok` job of .github/workflows/tests.yml, a need of `all` (ci-all-verdict.sh).
# Input (env): LABELS = the PR's label names, one per line or comma separated.
#   nonvisual                      -> pass
#   visual + live-ok-tony          -> pass (the orc adds live-ok-tony only after Tony typed his approval phrase; hook-enforced in the brain)
#   visual without live-ok-tony    -> FAIL
#   neither visual nor nonvisual   -> FAIL (the orc must classify the PR)
#   visual AND nonvisual           -> FAIL (ambiguous)
#   dependabot (Tony Nov 27): PR author dependabot[bot] passes: exempt, non-visual. Author only; a dependabot/* branch name is not enough.
# Input (env): FILES = the PR's real diff, one path per line (the workflow reads it from the GitHub API).
#   A diff matching client/** css/js/mjs/html/svg/fonts, server/data/problems.json or server/data/banks/ is visual.
#   A `nonvisual` label on such a diff FAILS, always: relabel it visual and use Tony's typed-approval flow.
#   There is no owner override: the automation that labels PRs authenticates as the repo owner, so an
#   owner-sender check would be forgeable.
# Also input (env): AUTHOR = github.event.pull_request.user.login.
# The workflow runs the BASE ref's copy of this script (git show <base sha>:tools/operations/ci-live-ok.sh), so a PR
# cannot edit its own gate; .github/CODEOWNERS covers workflow and tools/operations/ci-* changes.
set -uo pipefail
if [ "${AUTHOR:-}" = "dependabot[bot]" ]; then
  echo "live-ok: dependabot PR, exempt"; exit 0
fi
L=$(printf '%s\n' "${LABELS:-}" | tr ',' '\n' | sed 's/^ *//;s/ *$//')
has() { printf '%s\n' "$L" | grep -qx -- "$1"; }
VISUAL_RE='^client/.*\.(css|js|mjs|html|svg|woff2?|ttf|otf)$|^server/data/problems\.json$|^server/data/banks/'
visual_diff=0
while IFS= read -r f; do
  [ -n "$f" ] || continue
  [[ "$f" =~ $VISUAL_RE ]] && { visual_diff=1; break; }
done <<<"${FILES:-}"
if has visual && has nonvisual; then
  echo "::error::live-ok: PR has both labels visual and nonvisual; keep one"; exit 1
elif has visual; then
  if has live-ok-tony; then echo "live-ok: visual PR, label live-ok-tony present (Tony cleared the live shots)"; exit 0; fi
  echo "::error::live-ok: PR is labelled visual and has no live-ok-tony label. Pre-merge evidence = screenshots from ship.yml mode=demo ref=<PR branch> (post the run URL and the head SHA); Tony's OK is bound to that SHA; prod is re-checked after merge. When Tony types his approval phrase the orc adds live-ok-tony."
  exit 1
elif has nonvisual; then
  if [ "$visual_diff" = 1 ]; then
    echo "::error::live-ok: this PR's diff touches visual paths (client/** css/js/html/svg/fonts, server/data/problems.json or banks) but it is labelled nonvisual. Relabel it visual; Tony's typed approval + live-ok-tony is the only path. There is no owner override."
    exit 1
  fi
  echo "live-ok: nonvisual PR, nothing to clear"; exit 0
fi
echo "::error::live-ok: PR has neither label visual nor nonvisual. Classify it (client/** css/js/html/svg/fonts, server/data/problems.json or bank changes = visual suggestion) and add the label."
exit 1
