#!/usr/bin/env bash
# One button for the ship workflow: runs ship.yml on GitHub (demo|live), waits, and says plainly what went wrong.
# usage: tools/press.sh [demo|live]     (default demo; works from any directory; needs `gh`, logged in)
# It only queues + watches the GitHub run; the deploy itself is tools/ship.sh on the runner. Exit 1 = something failed (one line says what + the fix).
# Secret values are never read or printed: `gh secret list` shows names only. design/DEPLOY.md ("Power button") has the why.
set -euo pipefail
MODE="${1:-demo}"; REPO="Forzalab/stem-stuff"
case "$MODE" in demo|live) ;; *) echo "usage: tools/press.sh [demo|live]" >&2; exit 2 ;; esac
die() { echo "$*" >&2; exit 1; }

command -v gh >/dev/null 2>&1 || die "gh is not installed. fix: pkg install gh"
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
gh workflow run ship.yml -R "$REPO" -f mode="$MODE" >/dev/null || die "could not queue ship.yml. fix: check the repo name, that ship.yml is on main, and your gh token's Actions write access"
ID=""; URL=""
for _ in 1 2 3 4 5 6 7 8 9 10; do
  sleep 3; read -r ID URL <<<"$(latest)" || true
  [ -n "$ID" ] && [ "$ID" != "$OLD" ] && break; ID=""
done
[ -n "$ID" ] || die "queued, but no new run appeared in 30 s. fix: open https://github.com/$REPO/actions"
echo "run: $URL"

if gh run watch "$ID" -R "$REPO" --exit-status; then
  echo "OK: $MODE shipped"; echo "$URL"
else
  gh run view "$ID" -R "$REPO" --log-failed 2>&1 | tail -n 30
  die "FAILED: see $URL"
fi
