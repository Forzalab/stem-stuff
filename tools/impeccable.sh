#!/bin/sh
# Impeccable pass for stem-stuff (Tony rule, 2026-10-06): static + live at phone, desktop, 4K / zoom-out.
# Usage: tools/impeccable.sh <base_url> <path_or_query>... [static files...]
#   e.g. tools/impeccable.sh http://localhost:8816 "try/tries.html?v=A" "try/tries.html?v=B&rm=1" -- try/ app.css
# Exit 2 if any findings. Raw output -> ${OUT:-impeccable-out}/.
set -u
BASE="$1"; shift
OUT="${OUT:-impeccable-out}"; mkdir -p "$OUT"
CH=$(ls -d /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)
if [ -n "$CH" ]; then printf '#!/bin/sh\nexec %s --no-sandbox "$@"\n' "$CH" > /tmp/chrome-ns.sh; chmod +x /tmp/chrome-ns.sh; export IMPECCABLE_BROWSER=/tmp/chrome-ns.sh; fi
# 390x844 phone · 1920x1080 desktop · 2560x1440 = 1920 at 75% zoom · 3840x2160 = 4K / 1920 at 50% zoom-out
VIEWPORTS="390x844 1920x1080 2560x1440 3840x2160"
rc=0; pages=""
while [ $# -gt 0 ] && [ "$1" != "--" ]; do pages="$pages $1"; shift; done
[ "${1:-}" = "--" ] && shift
for p in $pages; do for vp in $VIEWPORTS; do
  f="$OUT/$(echo "$p" | tr '/?&=' '____')@$vp.txt"
  npx -y impeccable detect --viewport "$vp" "$BASE/$p" > "$f" 2>&1 || rc=2
  echo "$vp $p: $(grep -c . "$f") lines"; done; done
if [ $# -gt 0 ]; then npx -y impeccable detect "$@" > "$OUT/static.txt" 2>&1 || rc=2; echo "static: $(grep -c . "$OUT/static.txt") lines"; fi
exit $rc
