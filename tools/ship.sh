#!/usr/bin/env bash
# One click to Vercel: demo (a private preview URL) or live (stem-stuff.vercel.app).
# usage: tools/ship.sh demo|live [banks-dir]
#   demo  = `vercel deploy`        → prints the preview URL (log in to Vercel to open it)
#   live  = `vercel deploy --prod` → the public site
# It deploys origin/main (never your working tree) plus the exam banks, which are not on GitHub: banks/*.json from this checkout,
# and from [banks-dir] if given. Token: $VERCEL_TOKEN if set (cloud), else your `vercel login`. Already-built demo → live without a
# rebuild: Vercel dashboard → Deployments → ⋯ → Promote. design/DEPLOY.md has the why.
set -euo pipefail
MODE="${1:-}"; BANKS="${2:-}"
case "$MODE" in
  demo) PROD=() ;;
  live) PROD=(--prod) ;;
  *) echo "usage: tools/ship.sh demo|live [banks-dir]" >&2; exit 2 ;;
esac
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
W="$(mktemp -d)"; LOG="$(mktemp)"   # the log stays outside the upload
cleanup() { git -C "$ROOT" worktree remove --force "$W" 2>/dev/null || rm -rf "$W"; rm -f "$LOG"; }
trap cleanup EXIT

git -C "$ROOT" fetch -q origin main
git -C "$ROOT" worktree add -q --detach "$W" origin/main
shopt -s nullglob
for f in "$ROOT"/banks/*.json ${BANKS:+"$BANKS"/*.json}; do cp "$f" "$W/banks/"; done
echo "deploying origin/main @ $(git -C "$W" rev-parse --short HEAD) as $MODE, banks: $(cd "$W/banks" && ls *.json | tr '\n' ' ')"

ARGS=(--yes --scope forzalabs-projects)
[ -n "${VERCEL_TOKEN:-}" ] && ARGS+=(--token "$VERCEL_TOKEN")
if [ -d "$ROOT/.vercel" ]; then cp -r "$ROOT/.vercel" "$W/"; else (cd "$W" && npx -y vercel@latest link --project stem-stuff "${ARGS[@]}" >/dev/null); fi

# The CLI prints the URL on stdout when the build is done. Behind a proxy its log stream can drop ("fetch failed") after the
# deployment exists; the build keeps going on Vercel, so take the URL from the log instead.
if URL="$(cd "$W" && NODE_USE_ENV_PROXY=1 npx -y vercel@latest deploy "${PROD[@]}" "${ARGS[@]}" 2>"$LOG")" && [[ "$URL" == https://* ]]; then
  echo "$MODE ready: $URL"
else
  URL="$(grep -oE 'https://[a-z0-9.-]+\.vercel\.app' "$LOG" | tail -1 || true)"
  [ -n "$URL" ] || { cat "$LOG" >&2; exit 1; }
  echo "$MODE building (log stream dropped, the build goes on): $URL"
fi
if [ "$MODE" = live ]; then echo "live site: https://stem-stuff.vercel.app"; fi
