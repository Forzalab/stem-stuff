#!/usr/bin/env bash
# SHIP-ORDER (BUG-SHIP-ORDER, 2026-11-24): live went 88b4864 -> 8c9ec33 (an ancestor) because a late finisher deployed an older sha.
# This one helper answers "may this deploy go out?": exit 0 = deploy ok, exit 3 = target is a STRICT ancestor of live (refuse).
# usage: tools/operations/ship-order.sh <target_sha> <live_sha>
#        tools/operations/ship-order.sh --selftest
# Fail open (ok, print why): an empty/unknown live sha, or one outside this clone's history, never blocks a ship: a stale or empty
# version.json must not stop a deploy. Equal = ok (the caller's "already live" no-op handles it).
set -uo pipefail

# --selftest: a throwaway repo proves the answers (newer ok, equal ok, older refused, empty live ok, unknown live ok). No network.
if [ "${1:-}" = "--selftest" ]; then
  self="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")" || exit 1
  tmp="$(mktemp -d "${TMPDIR:-/tmp}/ship-order.XXXXXX")" || exit 1
  trap 'rm -rf "$tmp"' EXIT INT TERM
  git -C "$tmp" init -q || exit 1
  git -C "$tmp" config user.email ship-order@selftest
  git -C "$tmp" config user.name ship-order
  commit() {   # commit <word> -> sha
    printf '%s\n' "$1" >"$tmp/f"
    git -C "$tmp" add f && git -C "$tmp" commit -qm "$1" && git -C "$tmp" rev-parse HEAD
  }
  old="$(commit one)" && new="$(commit two)" || exit 1
  # a commit object outside HEAD's history: reachable by sha, not an ancestor of anything (the "live not in history" case)
  other="$(git -C "$tmp" commit-tree "$(git -C "$tmp" rev-parse 'HEAD^{tree}')" -m other)" || exit 1
  fails=0
  check() {   # check <name> <want exit> <args...>
    name="$1" want="$2"; shift 2
    ( cd "$tmp" && "$self" "$@" ) >/dev/null 2>&1
    got=$?
    if [ "$got" -eq "$want" ]; then echo "PASS $name"; else echo "FAIL $name: want exit $want, got $got"; fails=$((fails + 1)); fi
  }
  check "newer ok" 0 "$new" "$old"
  check "equal ok" 0 "$old" "$old"
  check "older refused" 3 "$old" "$new"
  check "empty live ok" 0 "$old" ""
  check "unknown live ok" 0 "$old" "not-a-sha"
  check "live outside history ok" 0 "$old" "$other"
  [ "$fails" -eq 0 ] || { echo "ship-order selftest: $fails failed"; exit 1; }
  echo "ship-order selftest: ok"
  exit 0
fi

target="${1:-}"
live="${2:-}"
ok() { echo "ship-order: $*"; exit 0; }

[ -n "$target" ] || ok "no target sha: ok (fail open)"
[ -n "$live" ] || ok "live sha is empty: ok (fail open, nothing to compare)"
git rev-parse --verify --quiet "${target}^{commit}" >/dev/null 2>&1 \
  || ok "target $target is not a commit in this clone: ok (fail open)"
git rev-parse --verify --quiet "${live}^{commit}" >/dev/null 2>&1 \
  || ok "live $live is not a commit in this clone: ok (fail open, unknown live)"
t="$(git rev-parse "${target}^{commit}")" && l="$(git rev-parse "${live}^{commit}")" || ok "git could not resolve the shas: ok (fail open)"
[ "$t" != "$l" ] || ok "live is already $t: ok (no-op path elsewhere)"
# merge-base --is-ancestor: 0 = t is an ancestor of l (strict here); 1 = not; anything else = git error, fail open below.
if git merge-base --is-ancestor "$t" "$l"; then
  echo "::notice::ship-order: refusing $target: it is older than live $live (live must never go backward)"
  exit 3
fi
ok "$target is not behind live $live: deploy ok"
