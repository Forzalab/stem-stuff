#!/usr/bin/env bash
# AC0.2: the verdict of the `all` check (the one required check). Run by the `all` job of .github/workflows/tests.yml,
# which runs on every pipe (`if: always()`), so it can never be skipped (GitHub reads a skipped job as success).
# Green only when decide and plan succeeded (decide may be skipped: it only runs on pull_request, TODO 20), unit and block
# succeeded, and a job was skipped only for a documented reason:
#   unit  skipped  -> only on a docs-only diff (plan.docs_only = true)
#   block skipped  -> only on a docs-only diff, or a zero-.pw affected PR (plan.skip_block = true)
#   both skipped   -> also when plan.stamped = true: a main push whose tree already has a FULL green stamp from a same-repo PR run (SHIP_MODE pr-green, P4)
# The fast pipe (dispatch pipe=fast, or a PR push while its full run is in flight) never gives a full verdict: exit 1.
# Inputs (env): INPUT_PIPE, PIPE, DECIDE, PLAN, UNIT, BLOCK = the job results and pipe values; DOCS_ONLY, SKIP_BLOCK = plan outputs.
set -uo pipefail

if [ "${INPUT_PIPE:-}" = fast ] || [ "${PIPE:-}" = fast ]; then
  echo "::error::fast pipe only: no full run for this head"
  exit 1
fi

bad=0
fail() { echo "::error::$1"; bad=1; }

case "${DECIDE:-}" in
  success) ;;
  skipped) ;;   # TODO 20: decide only runs on pull_request; on push/schedule/dispatch it is skipped, never fast
  *) fail "decide: ${DECIDE:-missing}" ;;
esac
[ "${PLAN:-}" = success ] || fail "plan: ${PLAN:-missing}"

case "${UNIT:-}" in
  success) ;;
  skipped) [ "${DOCS_ONLY:-}" = true ] || [ "${STAMPED:-}" = true ] || fail "unit skipped without a docs-only diff or a green stamp" ;;
  *) fail "unit: ${UNIT:-missing}" ;;
esac

case "${BLOCK:-}" in
  success) ;;
  skipped) [ "${DOCS_ONLY:-}" = true ] || [ "${SKIP_BLOCK:-}" = true ] || [ "${STAMPED:-}" = true ] || fail "block skipped without a docs-only diff or a zero-.pw selection" ;;
  *) fail "block: ${BLOCK:-missing}" ;;
esac

if [ "$bad" -eq 0 ]; then echo "all: green (decide, plan, unit, block all accounted for)"; fi
exit "$bad"
