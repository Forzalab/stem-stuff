#!/usr/bin/env bash
# VISUAL-PR GATE (Tony Nov 27): the `live-ok` job of .github/workflows/tests.yml, a need of `all` (ci-all-verdict.sh).
# Input (env): LABELS = the PR's label names, one per line or comma separated.
#   nonvisual                      -> pass
#   visual + live-ok-tony          -> pass (the orc adds live-ok-tony only after Tony typed `live shots #<PR> OK to clear`; hook-enforced in the brain)
#   visual without live-ok-tony    -> FAIL
#   neither visual nor nonvisual   -> FAIL (the orc must classify the PR)
#   visual AND nonvisual           -> FAIL (ambiguous)
set -uo pipefail
L=$(printf '%s\n' "${LABELS:-}" | tr ',' '\n' | sed 's/^ *//;s/ *$//')
has() { printf '%s\n' "$L" | grep -qx -- "$1"; }
if has visual && has nonvisual; then
  echo "::error::live-ok: PR has both labels visual and nonvisual; keep one"; exit 1
elif has visual; then
  if has live-ok-tony; then echo "live-ok: visual PR, label live-ok-tony present (Tony cleared the live shots)"; exit 0; fi
  echo "::error::live-ok: PR is labelled visual and has no live-ok-tony label. Send Tony screenshots of the PR's Vercel preview deploy; when he types 'live shots #<PR> OK to clear' the orc adds live-ok-tony."
  exit 1
elif has nonvisual; then
  echo "live-ok: nonvisual PR, nothing to clear"; exit 0
fi
echo "::error::live-ok: PR has neither label visual nor nonvisual. Classify it (client/** css/js/html/svg/fonts, server/data/problems.json or bank changes = visual suggestion) and add the label."
exit 1
