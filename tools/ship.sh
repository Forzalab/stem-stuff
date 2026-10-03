#!/usr/bin/env bash
# One click to Vercel: demo (a private preview URL) or live (stem-stuff.vercel.app).
# usage: tools/ship.sh demo|live [banks-dir]     (then it smoke-tests the deployment; exit 1 = red)
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

# Smoke (5 checks, ~20 s): wait for the build, then ask the deployment itself. `vercel curl` gets past the preview login wall.
# A red line here = do not trust this deployment (and for live: Vercel dashboard → Deployments → an older one → Promote = undo).
V() { (cd "$W" && NODE_USE_ENV_PROXY=1 npx -y vercel@latest --scope forzalabs-projects "$@"); }   # flags before "$@": `vercel curl` hands everything after -- to curl; token via $VERCEL_TOKEN
if ! V inspect "$URL" --wait --timeout 5m >/dev/null 2>&1; then echo "smoke: build not ready after 5 min, check $URL by hand" >&2; exit 1; fi
bad=0
check() {   # check <what> <want> <path> [curl args...]: <want> = a status code, or text the body must contain
  local what="$1" want="$2" p="$3"; shift 3
  local got; got="$(V curl "$p" --deployment "$URL" -- -sS -w '\n%{http_code}' "$@" 2>/dev/null | grep -v '^>' || true)"
  if [[ "$want" =~ ^[0-9]{3}$ ]] && [ "$(tail -n 1 <<<"$got")" = "$want" ] || { ! [[ "$want" =~ ^[0-9]{3}$ ]] && grep -q "$want" <<<"$got"; }; then
    echo "  ok   $what"; else echo "  FAIL $what (wanted $want)"; bad=1; fi
}
echo "smoke:"
check "page loads"                 200 /
check "a problem loads"            200 /p/PHYS_F3N.json
check "answers stay hidden"        404 /problems.json
check "banks stay hidden"          404 /banks/BANK_P2X.json
check "grading works"              '"correct"' /check -X POST -H 'Content-Type: application/json' -d '{"code":"PHYS_F3N","answer":"3.2"}'
if [ "$bad" -ne 0 ]; then echo "SMOKE RED: $URL" >&2; exit 1; fi
echo "smoke green"
if [ "$MODE" = live ]; then echo "live site: https://stem-stuff.vercel.app"; fi
