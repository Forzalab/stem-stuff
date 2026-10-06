#!/usr/bin/env bash
# Which version runs where. The version is the PR number of the newest merged PR on main ("#83"); commits on main after it
# add "+k" ("#83+1"). The site shows it bottom right; tools/ship.sh stamps it into each deploy (version.json, read by
# tools/build_public.py: sw.js VERSION + the index.html meta). design/DEPLOY.md has the why.
# usage: tools/version.sh                 live (the site's /version.json) vs origin/main; exit 0 same, 1 live behind, 2 error
#        tools/version.sh --stamp DIR     write DIR/version.json for the checkout at DIR (ship.sh)
#        tools/version.sh --pr [REV]      print the version of REV (default HEAD)
# $STEM_URL overrides the site (default https://stem-stuff.vercel.app).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# pr_of REV [GITDIR]: "#N" or "#N+k" from the first-parent history (merge "Merge pull request #N", squash "Title (#N)"); "?" if none
pr_of() {
  git -C "${2:-$ROOT}" log --first-parent --format=%s "$1" 2>/dev/null | awk '
    { if (match($0, /^Merge pull request #[0-9]+/)) n = substr($0, 21, RLENGTH - 20)
      else if (match($0, /\(#[0-9]+\)$/)) n = substr($0, RSTART + 2, RLENGTH - 3)
      if (n != "") { print "#" n (NR > 1 ? "+" NR - 1 : ""); found = 1; exit } }
    END { if (!found) print "?" }'
}

case "${1:-}" in
  --pr) pr_of "${2:-HEAD}"; exit 0 ;;
  --stamp)
    d="${2:?usage: tools/version.sh --stamp DIR}"
    printf '{"pr":"%s","sha":"%s","built":"%s"}\n' "$(pr_of HEAD "$d")" "$(git -C "$d" rev-parse --short HEAD)" \
      "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >"$d/version.json"
    cat "$d/version.json"; exit 0 ;;
  "") ;;
  *) echo "usage: tools/version.sh [--stamp DIR | --pr [REV]]" >&2; exit 2 ;;
esac

URL="${STEM_URL:-https://stem-stuff.vercel.app}"
LIVE="$(curl -fsS --max-time 15 -H 'Cache-Control: no-cache' "$URL/version.json?t=$(date +%s)" 2>/dev/null || true)"
GIT_TERMINAL_PROMPT=0 git -C "$ROOT" fetch -q origin main </dev/null 2>/dev/null || echo "version: could not fetch origin/main, using the last fetched one" >&2
MAIN_PR="$(pr_of origin/main)"; MAIN_SHA="$(git -C "$ROOT" rev-parse --short origin/main)"
echo "main: $MAIN_PR $MAIN_SHA"
if [ -z "$LIVE" ]; then echo "live: no version.json at $URL (deployed before version stamps, or down)"; exit 2; fi
read -r LPR LSHA LBUILT < <(python3 -c 'import json,sys; v=json.load(sys.stdin); print(v.get("pr","?"), v.get("sha","?"), v.get("built","?"))' <<<"$LIVE")
WHEN="$(TZ=America/Los_Angeles date -d "$LBUILT" '+%a %b %-d %H:%M PT' 2>/dev/null || echo "$LBUILT")"
echo "live: $LPR $LSHA built $WHEN"
if git -C "$ROOT" merge-base --is-ancestor origin/main "$LSHA" 2>/dev/null; then echo "live = latest"; exit 0; fi
echo "live is behind main ($LPR -> $MAIN_PR): tools/ship.sh live"; exit 1
