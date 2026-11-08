#!/usr/bin/env bash
set -euo pipefail

[ $# -ge 2 ] || { echo "usage: $0 <allowed-files-list> <max-changed-lines> [base]" >&2; exit 2; }
list="$1"; cap="$2"; base="${3:-origin/main}"

[[ "$cap" =~ ^[0-9]+$ ]] || { echo "diff-gate: max-changed-lines must be an integer (got '$cap')" >&2; exit 2; }
git rev-parse --verify "$base^{commit}" >/dev/null 2>&1 || { echo "diff-gate: bad base '$base'" >&2; exit 2; }

trim() { local s="$1"; s="${s#"${s%%[![:space:]]*}"}"; s="${s%"${s##*[![:space:]]}"}"; printf '%s' "$s"; }

allowed=()
if [ -n "$list" ] && [ -f "$list" ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    line="$(trim "${line%%#*}")"
    [ -n "$line" ] && allowed+=("$line")
  done <"$list"
elif [ -n "$list" ]; then
  read -ra allowed <<<"${list//,/ }"
fi

rows=()
while IFS= read -r line; do [ -n "$line" ] && rows+=("$line"); done < <(git diff --numstat "${base}...HEAD")
[ "${#rows[@]}" -gt 0 ] || { echo "diff-gate: ok (0 files, 0 lines)"; exit 0; }

total=0; nfiles=0; bad=()
for row in "${rows[@]}"; do
  read -r add del file <<<"$row"
  [[ "$add" =~ ^[0-9]+$ ]] || add=0
  [[ "$del" =~ ^[0-9]+$ ]] || del=0
  total=$((total + add + del)); nfiles=$((nfiles + 1))
  ok=0
  for pat in ${allowed[@]+"${allowed[@]}"}; do
    case "$file" in $pat) ok=1; break ;; esac
  done
  [ "$ok" -eq 1 ] || bad+=("$file")
done

status=0
if [ "${#bad[@]}" -gt 0 ]; then
  echo "diff-gate: files outside the allowed list:" >&2
  printf '  %s\n' "${bad[@]}" >&2
  status=1
fi
if [ "$total" -gt "$cap" ]; then
  echo "diff-gate: ${total} changed lines > cap ${cap}" >&2
  status=1
fi

if [ "$status" -eq 0 ]; then
  echo "diff-gate: ok (${nfiles} files, ${total} lines)"
else
  echo "diff-gate: FAIL (${nfiles} files, ${total} lines; cap ${cap})" >&2
fi
exit "$status"
