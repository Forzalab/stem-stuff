#!/usr/bin/env bash
# One click to Vercel: demo (a private preview URL) or live (stem-stuff.vercel.app).
# usage: tools/ship.sh [--no-brain] [--print-banks] demo|live [banks-dir]     (then it smoke-tests the deployment; exit 1 = red)
#   demo  = `vercel deploy`        → prints the preview URL (log in to Vercel to open it)
#   live  = `vercel deploy --prod` → the public site
# It deploys origin/main (never your working tree) plus the exam banks, which are not on GitHub. Banks, per file name, first hit
# wins: [banks-dir] > the brain repo (projects/*/_files/*-bank/BANK_*.json; if one name sits at several brain paths, the one
# with the newest commit) > banks/*.json in this checkout (only banks the brain does not have, e.g. BANK_PSY6). One line says where each bank came from: `banks: BANK_X(brain) ...`.
# Brain: a local clone if there is one ($BRAIN_DIR, ~/brain, /home/claude/brain; pulled, best effort). Else the bank hatch,
# tools/brain_banks.py: GitLab's API lists and fetches only the BANK_*.json files with $BRAIN_TOKEN (read_api; see .env.example).
# No clone: the brain is heavy and the phone has none. A hatch error (bad token, network, a file that is not a bank) stops the
# deploy: a partial bank set never ships. The token is never printed.
#   --no-brain (or SHIP_NO_BRAIN=1) skips the brain. --print-banks prints "NAME<tab>SOURCE<tab>PATH" per bank and stops
#   (no worktree, no Vercel; demo|live optional).
# A repo-root .env (gitignored; see .env.example) is loaded first. Vercel token: $VERCEL_TOKEN if set (cloud), else your
# `vercel login`. Already-built demo → live without a rebuild: Vercel dashboard → Deployments → ⋯ → Promote.
# design/DEPLOY.md has the why.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
XT=; case $- in *x*) XT=1 ;; esac
xoff() { { set +x; } 2>/dev/null; }          # around anything that expands $BRAIN_TOKEN
xon() { if [ -n "$XT" ]; then set -x; fi; }
if [ -f "$ROOT/.env" ]; then xoff; set -a; . "$ROOT/.env"; set +a; xon; fi

usage() { echo "usage: tools/ship.sh [--no-brain] [--print-banks] demo|live [banks-dir]" >&2; exit 2; }
MODE=; BANKS=; PRINT=; NOBRAIN="${SHIP_NO_BRAIN:-}"; [ "$NOBRAIN" = 0 ] && NOBRAIN=
for a in "$@"; do
  case "$a" in
    --no-brain) NOBRAIN=1 ;;
    --print-banks) PRINT=1 ;;
    -*) usage ;;
    demo|live) if [ -z "$MODE" ] && [ -z "$BANKS" ]; then MODE="$a"; else BANKS="$a"; fi ;;
    *) [ -z "$BANKS" ] || usage; BANKS="$a" ;;
  esac
done
case "$MODE" in
  demo) PROD=() ;;
  live) PROD=(--prod) ;;
  *) [ -n "$PRINT" ] || usage; PROD=() ;;
esac
if [ -n "$BANKS" ] && [ ! -d "$BANKS" ]; then echo "no such banks-dir: $BANKS" >&2; exit 2; fi

W=; LOG=; BTMP=; CAND=
cleanup() {
  if [ -n "$W" ]; then git -C "$ROOT" worktree remove --force "$W" 2>/dev/null || rm -rf "$W"; fi
  rm -rf ${LOG:+"$LOG"} ${BTMP:+"$BTMP"} ${CAND:+"$CAND"}
}
trap cleanup EXIT
warn() { echo "ship: $*" >&2; }

# --- brain: find or fetch a clone; sets BRAIN (empty if none). Not run in $(...): BTMP must reach the trap. ---
BRAIN=
brain_dir() {
  # SHIP_BRAIN_SEARCH (colon-separated) replaces the two defaults; tests set it empty
  local d IFS=: list="${BRAIN_DIR:-}:${SHIP_BRAIN_SEARCH-$HOME/brain:/home/claude/brain}"
  set -f
  for d in $list; do
    [ -n "$d" ] && [ -e "$d/.git" ] || continue
    set +f
    if git -C "$d" rev-parse -q --verify '@{u}' >/dev/null 2>&1; then
      GIT_TERMINAL_PROMPT=0 git -C "$d" pull -q --ff-only </dev/null >/dev/null 2>&1 || warn "brain: pull failed in $d, using it as is"
    fi
    BRAIN="$d"; return 0
  done
  set +f
}

# --- candidates: "name<tab>rank<tab>time<tab>source<tab>path"; lowest rank, then newest time, wins per name ---
CAND="$(mktemp)"
add() { printf '%s\t%s\t%s\t%s\t%s\n' "$(basename "$4")" "$1" "$2" "$3" "$4" >>"$CAND"; }
shopt -s nullglob
if [ -n "$BANKS" ]; then for f in "$BANKS"/*.json; do add 0 0 arg "$f"; done; fi
for f in "$ROOT"/banks/*.json; do add 2 0 repo "$f"; done   # rank 2: a stale local copy never beats the brain (Tony, Oct 3)
if [ -z "$NOBRAIN" ]; then
  brain_dir
  if [ -n "$BRAIN" ]; then
    for f in "$BRAIN"/projects/*/_files/*-bank/BANK_*.json; do
      t="$(git -C "$BRAIN" log -1 --format=%ct -- "${f#"$BRAIN"/}" 2>/dev/null || true)"
      add 1 "${t:-0}" brain "$f"
    done
  elif [ -n "${BRAIN_TOKEN:+x}" ]; then
    BTMP="$(mktemp -d)"; rc=0
    HATCH="$(python3 "$ROOT/tools/brain_banks.py" "$BTMP")" || rc=$?
    [ "$rc" -eq 0 ] || { warn "bank hatch failed, nothing deployed (see the line above)"; exit 1; }
    while IFS="$(printf '\t')" read -r t f; do [ -n "$f" ] && add 1 "$t" brain "$f"; done <<<"$HATCH"
  else
    warn "brain: no clone (BRAIN_DIR, ~/brain, /home/claude/brain) and no BRAIN_TOKEN, skipped"
  fi
fi
CHOSEN="$(LC_ALL=C sort -t "$(printf '\t')" -k1,1 -k2,2n -k3,3nr -k5,5 "$CAND" | awk -F '\t' '!seen[$1]++ { print $1 "\t" $4 "\t" $5 }')"
SUMMARY="banks:$(printf '%s\n' "$CHOSEN" | awk -F '\t' 'NF { sub(/\.json$/, "", $1); printf " %s(%s)", $1, $2 }')"

if [ -n "$PRINT" ]; then
  [ -z "$CHOSEN" ] || printf '%s\n' "$CHOSEN"
  echo "$SUMMARY"
  exit 0
fi

W="$(mktemp -d)"; LOG="$(mktemp)"   # the log stays outside the upload
git -C "$ROOT" fetch -q origin main
git -C "$ROOT" worktree add -q --detach "$W" origin/main
printf '%s\n' "$CHOSEN" | while IFS="$(printf '\t')" read -r name src path; do
  [ -n "$name" ] && cp "$path" "$W/banks/$name"
done
echo "deploying origin/main @ $(git -C "$W" rev-parse --short HEAD) as $MODE"
echo "$SUMMARY"

ARGS=(--yes --scope forzalabs-projects)
[ -n "${VERCEL_TOKEN:-}" ] && ARGS+=(--token "$VERCEL_TOKEN")
if [ -d "$ROOT/.vercel" ]; then cp -r "$ROOT/.vercel" "$W/"; else (cd "$W" && npx -y vercel@latest link --project stem-stuff "${ARGS[@]}" >/dev/null); fi

# The CLI prints the URL on stdout when the build is done. Behind a proxy its log stream can drop ("fetch failed") after the
# deployment exists; the build keeps going on Vercel, so take the URL from the log instead.
if URL="$(cd "$W" && NODE_USE_ENV_PROXY=1 npx -y vercel@latest deploy ${PROD[@]+"${PROD[@]}"} "${ARGS[@]}" 2>"$LOG")" && [[ "$URL" == https://* ]]; then
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
