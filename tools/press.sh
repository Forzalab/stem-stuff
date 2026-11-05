#!/usr/bin/env bash
# One button for the ship workflow: runs ship.yml on GitHub (demo|live) and returns in ~2 s; the run goes on without you.
# usage: tools/press.sh [--wait] [--pin BANK_X@sha]... [demo|live]     (default demo; works from any directory; needs `gh`, logged in)
# Pins (also $SHIP_PINS="BANK_P3X@cd581738[,BANK_Y@sha]"): ship that bank at that brain commit (ship.yml input `pins`; none given =
# the repo variable SHIP_PINS, else all banks at main). tools/ship.sh calls this on Termux (`ship.sh live` = queue the run).
# Default: queue and exit (ship.yml checks the secrets itself; a failed run = GitHub's failed-workflow notification).
# --wait: the old way: also check the secrets, find the run, watch it (~2 min), and on red print the log tail.
# It only queues (+ watches); the deploy itself is tools/ship.sh on the runner. Exit 1 = something failed (one line says what + the fix).
# Secret values are never read or printed: `gh secret list` shows names only. design/DEPLOY.md ("Power button") has the why.
set -euo pipefail
usage() { echo "usage: tools/press.sh [--wait] [--pin BANK_X@sha]... [demo|live]" >&2; exit 2; }
WAIT=; MODE=; PINS="${SHIP_PINS:-}"; REPO="Forzalab/stem-stuff"
while [ $# -gt 0 ]; do
  case "$1" in
    --wait) WAIT=1 ;;
    --pin) [ $# -ge 2 ] || usage; shift; PINS="${PINS:+$PINS,}$1" ;;
    demo|live) [ -z "$MODE" ] || usage; MODE="$1" ;;
    *) usage ;;
  esac
  shift
done
MODE="${MODE:-demo}"
die() { echo "$*" >&2; exit 1; }
# pins: BANK_X@<hex sha 7-40>, comma-separated, one per bank (the runner checks again; this stops a typo before it is queued)
PINARGS=()
if [ -n "${PINS//[, ]/}" ]; then
  PINS="${PINS//[ ]/}"; PINS="${PINS#,}"; PINS="${PINS%,}"
  IFS=, read -ra _p <<<"$PINS"
  for x in "${_p[@]}"; do
    [[ "$x" =~ ^BANK_[A-Z0-9]{3,6}(\.json)?@[0-9a-f]{7,40}$ ]] || { echo "bad pin '$x' (want BANK_X@<hex sha>)" >&2; exit 2; }
  done
  [ -z "$(printf '%s\n' "${_p[@]}" | sed 's/\.json@/@/; s/@.*//' | sort | uniq -d)" ] || { echo "a bank is pinned twice: $PINS" >&2; exit 2; }
  PINARGS=(-f pins="$PINS")
fi

command -v gh >/dev/null 2>&1 || die "gh is not installed. fix: pkg install gh"

if [ -z "$WAIT" ]; then
  gh workflow run ship.yml -R "$REPO" -f mode="$MODE" ${PINARGS[@]+"${PINARGS[@]}"} >/dev/null \
    || die "could not queue ship.yml. fix: gh auth login; check that ship.yml is on main and your gh token has Actions write access"
  echo "queued $MODE${PINARGS[0]:+ (pins $PINS)}. it runs on GitHub (~2 min); a failure notifies you. watch: https://github.com/$REPO/actions/workflows/ship.yml"
  exit 0
fi

gh auth status >/dev/null 2>&1 || die "gh is not logged in. fix: run: gh auth login"

if NAMES="$(gh secret list -R "$REPO" 2>/dev/null | cut -f1)"; then
  MISSING=""
  for s in VERCEL_TOKEN BRAIN_TOKEN; do grep -qx "$s" <<<"$NAMES" || MISSING="$MISSING $s"; done
  [ -z "$MISSING" ] || die "missing repo secret(s):$MISSING. fix: GitHub → repo Settings → Secrets and variables → Actions → Repository secrets"
else
  echo "note: could not list secrets (no permission?); continuing without that check"
fi

latest() { gh run list -R "$REPO" -w ship.yml -L 1 --json databaseId,url --jq '.[0] | "\(.databaseId) \(.url)"' 2>/dev/null || true; }
OLD="$(latest | cut -d' ' -f1)"
gh workflow run ship.yml -R "$REPO" -f mode="$MODE" ${PINARGS[@]+"${PINARGS[@]}"} >/dev/null || die "could not queue ship.yml. fix: check the repo name, that ship.yml is on main, and your gh token's Actions write access"
ID=""; URL=""
for _ in 1 2 3 4 5 6 7 8 9 10; do
  sleep 3; read -r ID URL <<<"$(latest)" || true
  [ -n "$ID" ] && [ "$ID" != "$OLD" ] && break; ID=""
done
[ -n "$ID" ] || die "queued, but no new run appeared in 30 s. fix: open https://github.com/$REPO/actions"
echo "run: $URL"

if gh run watch "$ID" -R "$REPO" --exit-status; then
  LOG="$(gh run view "$ID" -R "$REPO" --log 2>/dev/null || true)"
  VU="$(grep -oE 'https://[a-z0-9.-]+\.vercel\.app' <<<"$LOG" | tail -1 || true)"
  if [ "$MODE" = live ] && grep -q 'https://stem-stuff\.vercel\.app' <<<"$LOG"; then VU="https://stem-stuff.vercel.app"; fi
  if [ -z "$VU" ]; then echo "OK: $MODE shipped"
  elif [ "$MODE" = demo ]; then echo "OK: $MODE shipped: $VU (private preview: log in to Vercel to open)"
  else echo "OK: $MODE shipped: $VU"; fi
  echo "$URL"
else
  gh run view "$ID" -R "$REPO" --log-failed 2>&1 | tail -n 30
  die "FAILED: see $URL"
fi
