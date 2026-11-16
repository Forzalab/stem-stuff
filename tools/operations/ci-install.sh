#!/usr/bin/env bash
# CI-ARCH C2: one install for every CI job (tests.yml, box.yml, culprit.yml, stress.yml, ship.yml). Run from the repo root.
# One line per step: `ci-install: python skip|installed|venv`, `ci-install: node skip|installed`, `ci-install: browser skip|installed`.
#   tools/operations/ci-install.sh                      python + node + chromium (headless shell)
#   tools/operations/ci-install.sh --no-browser         no browser at all (unit/fast jobs)
#   tools/operations/ci-install.sh --with-deps          apt libs too (root only: hosted runners, never the box)
#   tools/operations/ci-install.sh --browser webkit     that engine instead of chromium (the webkit lane)
set -euo pipefail

browser=1
with_deps=0
browser_name=chromium
while [ "$#" -gt 0 ]; do
  case "$1" in
    --no-browser) browser=0 ;;
    --with-deps) with_deps=1 ;;
    --browser) browser_name="${2:?ci-install: --browser needs a value}"; shift ;;
    --browser=*) browser_name="${1#*=}" ;;
    -h|--help) sed -n '2,7p' "$0"; exit 0 ;;
    *) echo "ci-install: unknown argument: $1" >&2; exit 2 ;;
  esac
  shift
done
case "$browser_name" in chromium|firefox|webkit) ;; *) echo "ci-install: unknown browser: $browser_name" >&2; exit 2 ;; esac

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$root"

# ---- python: requirements.txt pins (comments allowed), skip when they already match -------------------------------
mapfile -t pins < <(sed 's/#.*//' requirements.txt | tr -d ' \t\r' | grep -v '^$')

python_pinned() {
  # the modules must import AND the installed versions must equal the requirements.txt pins
  python3 -c 'import sympy, networkx, jsonschema, tzdata' 2>/dev/null || return 1
  python3 - "${pins[@]}" <<'PY'
import sys
from importlib import metadata

bad = []
for spec in sys.argv[1:]:
    name, eq, want = spec.partition("==")
    if not eq:
        continue
    try:
        have = metadata.version(name)
    except metadata.PackageNotFoundError:
        bad.append(f"{name} missing")
        continue
    if have != want:
        bad.append(f"{name}={have} != {want}")
sys.exit(1 if bad else 0)
PY
}

if python_pinned; then
  echo "ci-install: python skip"
elif pip install -r requirements.txt; then
  echo "ci-install: python installed"
else
  # the self-hosted box has no root and an externally-managed python: a venv is the only install that sticks
  venv="${CI_VENV:-$HOME/.cache/stem-venv}"
  echo "ci-install: pip install failed (not root / externally-managed?): venv at $venv"
  python3 -m venv "$venv"
  "$venv/bin/python" -m pip install -r requirements.txt
  export PATH="$venv/bin:$PATH"
  if [ -n "${GITHUB_PATH:-}" ]; then echo "$venv/bin" >>"$GITHUB_PATH"; fi
  echo "ci-install: python venv"
fi

# ---- node: skip when tests/node_modules already matches tests/package-lock.json ----------------------------------
# Content-wise, not byte-wise: npm's node_modules/.package-lock.json never equals the lockfile byte for byte (it drops the
# root "" entry and platform-only optional deps such as fsevents), so compare the installed packages against the lock.
node_current() {
  [ -f tests/node_modules/.package-lock.json ] || return 1
  node -e '
const fs = require("fs");
const lock = JSON.parse(fs.readFileSync(process.argv[1], "utf8")).packages || {};
const hidden = JSON.parse(fs.readFileSync(process.argv[2], "utf8")).packages || {};
let ok = true;
for (const [k, v] of Object.entries(lock)) {
  if (k === "") continue;
  const h = hidden[k];
  if (!h) { if (!v.optional) ok = false; continue; }   // a platform-optional package need not be installed
  if (h.version !== v.version || !!h.dev !== !!v.dev) ok = false;
}
for (const k of Object.keys(hidden)) if (!lock[k]) ok = false;   // installed but not in the lockfile = stale
process.exit(ok ? 0 : 1);
' tests/package-lock.json tests/node_modules/.package-lock.json
}

if node_current; then
  echo "ci-install: node skip"
else
  (cd tests && npm ci)
  echo "ci-install: node installed"
fi

# ---- browser ------------------------------------------------------------------------------------------------------
if [ "$browser" -eq 0 ]; then
  echo "ci-install: browser skip"
else
  deps=()
  shell_only=()
  [ "$with_deps" -eq 1 ] && deps=(--with-deps)
  [ "$browser_name" = chromium ] && shell_only=(--only-shell)   # headless shell only: what the .pw specs launch
  (cd tests && npx playwright install "${deps[@]}" "${shell_only[@]}" "$browser_name")
  echo "ci-install: browser installed"
fi
