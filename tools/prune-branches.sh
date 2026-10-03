#!/usr/bin/env bash
# Trunk style: delete branches that are done, after archiving each tip as a tag (archive/<branch>), so nothing is ever lost.
# usage: tools/prune-branches.sh [--dry-run] [max-age-days]      (default 7)
#   deleted: merged into origin/main, OR unmerged with no commit for max-age-days
#   kept:    main, any branch with an open PR, any branch with a commit in the last 24 h (a live session)
# Restore one: git push origin refs/tags/archive/<branch>:refs/heads/<branch>
# Runs in .github/workflows/prune.yml (the repo token can push tags and delete branches; Claude's sandbox cannot). Needs `gh`.
# design/TRUNK.md has the why.
set -euo pipefail
DRY=; [ "${1:-}" = --dry-run ] && { DRY=1; shift; }
MAX="${1:-7}"; NOW="$(date +%s)"
git fetch -q --prune origin
open="$(gh pr list --state open --limit 200 --json headRefName --jq '.[].headRefName')"
doomed=()
while IFS='|' read -r b t; do
  [ "$b" = main ] && continue
  if grep -qxF "$b" <<<"$open"; then echo "keep  $b (open PR)"; continue; fi
  age=$(( (NOW - t) / 86400 ))
  if [ $(( NOW - t )) -lt 86400 ]; then echo "keep  $b (commit < 24 h)"; continue; fi
  if git merge-base --is-ancestor "origin/$b" origin/main; then why=merged
  elif [ "$age" -ge "$MAX" ]; then why="unmerged, ${age}d old"
  else echo "keep  $b (unmerged, ${age}d)"; continue; fi
  echo "prune $b ($why)"; doomed+=("$b")
done < <(git for-each-ref refs/remotes/origin --format='%(refname:lstrip=3)|%(committerdate:unix)' | grep -v '^HEAD|')
[ "${#doomed[@]}" -gt 0 ] || { echo "nothing to prune"; exit 0; }
[ -z "$DRY" ] || { echo "dry run: ${#doomed[@]} would go"; exit 0; }
for ((i = 0; i < ${#doomed[@]}; i += 20)); do   # batches: archive tags first, then the deletes
  tags=(); dels=()
  for b in "${doomed[@]:i:20}"; do tags+=("refs/remotes/origin/$b:refs/tags/archive/$b"); dels+=(":refs/heads/$b"); done
  git push -q origin "${tags[@]}"
  git push -q origin "${dels[@]}"
done
echo "pruned ${#doomed[@]} (tips kept as archive/* tags)"
