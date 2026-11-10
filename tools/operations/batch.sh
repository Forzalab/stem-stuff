#!/usr/bin/env bash
# Batch queue for the refactor train. Labels are the truth; tools/queue.json is a cache.
# blame = changed-file name heuristic + tests/handmaps/*.tsv (format TBD by ticket 06) until handmaps land
# land moves main ONCE per batch: one merge of the sealed batch/N tip (R2), then the PRs are closed;
# a failed single merge leaves main untouched (rerun is safe).
# red batch + SPLIT: relabel by hand (no un-batch command yet).
# usage: tools/operations/batch.sh labels | sync | fire [--force] [--dry-run] | status <n> | land <n> | blame <n> <spec...>
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
QUEUE="$ROOT/tools/queue.json"
FAKE="${BATCH_FAKE:-}"
WT=""
TMPQ=""
die() { echo "batch: $*" >&2; exit 2; }
need() { command -v "$1" >/dev/null 2>&1 || die "needs $1"; }
cleanup() {
  [ -n "$WT" ] && git -C "$ROOT" worktree remove --force "$WT" >/dev/null 2>&1 || true
  [ -n "$TMPQ" ] && rm -f "$TMPQ" || true
}
trap cleanup EXIT
warn_fail() { echo "WARN batch: $*" >&2; exit 1; }
gh_remove_label() { gh pr edit "$1" --remove-label "$2" >/dev/null || warn_fail "could not remove label $2 from PR #$1"; }
gh_add_label() { gh pr edit "$1" --add-label "$2" >/dev/null || warn_fail "could not add label $2 to PR #$1"; }
gh_comment() { gh pr comment "$1" --body "$2" >/dev/null || warn_fail "could not comment on PR #$1"; }

fake_queue() {
  local n="${BATCH_FAKE_COUNT:-3}" i ts age="${BATCH_FAKE_AGE:-0}"
  local now; now="$(date +%s)"
  printf '['
  for ((i = 1; i <= n; i++)); do
    ts=$((now - age - (n - i + 1) * 60))
    printf '%s{"pr":%d,"sha":"fake%04d","done_at":"%s"}' \
      "$([ "$i" -gt 1 ] && echo ,)" "$((100 + i))" "$i" "$(date -u -d "@$ts" +%Y-%m-%dT%H:%M:%SZ)"
  done
  printf ']\n'
}
load_queue() {
  if [ -n "$FAKE" ]; then fake_queue; return; fi
  if [ -f "$QUEUE" ]; then cat "$QUEUE"; else printf '[]\n'; fi
}
ensure_labels() {
  gh label create building --force --color FBCA04 --description "Orc is building this PR" >/dev/null
  gh label create done --force --color 0E8A16 --description "Done; queued for a batch" >/dev/null
  gh label create batched --force --color 1D76DB --description "Fired into a batch; wait for land" >/dev/null
}

cmd_labels() {
  if [ -n "$FAKE" ]; then echo "batch: labels ready (fake)"; return; fi
  need gh; ensure_labels; echo "batch: labels ready"
}

cmd_sync() {
  if [ -n "$FAKE" ]; then
    local tmp; tmp="$(mktemp)"
    fake_queue >"$tmp"
    echo "batch: wrote $tmp (fake)"
    rm -f "$tmp"
    return
  fi
  need gh; need jq
  local pr sha at out='[]'
  while IFS=$'\t' read -r pr sha; do
    [ -n "$pr" ] || continue
    at="$(gh api "repos/{owner}/{repo}/issues/$pr/timeline" --paginate \
      --jq '[.[] | select(.event == "labeled" and .label.name == "done") | .created_at] | last // empty')"
    [ -n "$at" ] || at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    out="$(jq --arg pr "$pr" --arg sha "$sha" --arg at "$at" \
      '. + [{pr: ($pr | tonumber), sha: $sha, done_at: $at}]' <<<"$out")"
  done < <(gh pr list --state open --label done --limit 200 --json number,headRefOid,labels \
    --jq '.[] | select([.labels[].name] | index("batched") | not) | [.number, .headRefOid] | @tsv')
  printf '%s\n' "$(jq 'sort_by(.done_at, .pr)' <<<"$out")" >"$QUEUE"
  echo "batch: $(jq length "$QUEUE") done PR(s) in $QUEUE"
}

next_n() {
  local refs x max=0
  refs="$( {
    git ls-remote --heads origin 'refs/heads/batch/*' 2>/dev/null | awk '{print $2}'
    git for-each-ref --format='%(refname)' refs/heads/batch refs/remotes/origin/batch 2>/dev/null
  } | sed 's#.*batch/##' || true)"
  while read -r x; do
    case "$x" in ''|*[!0-9]*) continue ;; esac
    [ "$x" -gt "$max" ] && max="$x"
  done <<<"$refs"
  echo $((max + 1))
}
drop_item() {
  local pr="$1" n="$2" why="$3"
  if [ -z "$FAKE" ]; then
    gh_remove_label "$pr" done
    gh_remove_label "$pr" batched
    gh_add_label "$pr" building
    gh_comment "$pr" "Batch $n: $why; back to building."
  fi
  echo "batch $n: dropped PR #$pr ($why)"
}

cmd_fire() {
  local force=0 dry=0 a q count oldest age now fire=0 take parsed
  for a in "$@"; do
    case "$a" in --force) force=1 ;; --dry-run) dry=1 ;; *) die "fire: unknown $a" ;; esac
  done
  if [ -z "$FAKE" ]; then
    if [ "$dry" -eq 1 ]; then TMPQ="$(mktemp)"; QUEUE="$TMPQ"; fi
    cmd_sync >/dev/null
  fi
  q="$(load_queue)"
  q="$(jq 'sort_by(.done_at, .pr)' <<<"$q")"
  now="$(date +%s)"; count="$(jq 'length' <<<"$q")"; age=0
  if [ "$count" -gt 0 ]; then
    oldest="$(jq -r 'map(.done_at) | min' <<<"$q")"
    if parsed="$(date -u -d "$oldest" +%s 2>/dev/null)" && [[ "$parsed" =~ ^-?[0-9]+$ ]]; then
      age=$((now - parsed)); [ "$age" -lt 0 ] && age=0
    else
      age=0
      echo "WARN batch: bad done_at '$oldest'; not firing on age" >&2
    fi
    [ "$age" -ge 18000 ] && fire=1
  fi
  [ "$count" -ge 4 ] && fire=1
  [ "$force" -eq 1 ] && [ "$count" -gt 0 ] && fire=1
  if [ "$fire" -eq 0 ]; then
    echo "batch: hold ($count queued, oldest $((age / 3600)) h; fire at 4 or 5 h)"; return 0
  fi
  take=$((count < 5 ? count : 5))
  if [ "$dry" -eq 1 ]; then
    echo "batch: would fire $take item(s) (queued $count, cap 5)"
    jq -r --argjson t "$take" '.[:$t][] | "  PR #\(.pr)  \(.sha)"' <<<"$q"
    return 0
  fi
  [ -n "$FAKE" ] && die "fire: BATCH_FAKE only supports --dry-run"
  need gh; need git; need jq; ensure_labels
  local n manifest='[]' pr sha
  n="$(next_n)"
  git fetch -q origin main
  WT="$(mktemp -d)"; rmdir "$WT"
  git worktree add -q -b "batch/$n" "$WT" origin/main
  while IFS=$'\t' read -r pr sha; do
    if ! git -C "$WT" fetch -q origin "$sha" 2>/dev/null; then
      git -C "$WT" fetch -q origin "pull/$pr/head" 2>/dev/null || true
    fi
    if ! git -C "$WT" cat-file -e "$sha^{commit}" 2>/dev/null; then
      drop_item "$pr" "$n" "could not fetch $sha"; continue
    fi
    if ! git -C "$WT" merge --no-ff -q -m "batch $n: item for PR #$pr" "$sha"; then
      git -C "$WT" merge --abort >/dev/null 2>&1 || true
      drop_item "$pr" "$n" "merge conflict with batch $n"; continue
    fi
    manifest="$(jq --argjson pr "$pr" --arg sha "$sha" '. + [{item: (length + 1), pr: $pr, sha: $sha}]' <<<"$manifest")"
  done < <(jq -r --argjson t "$take" '.[:$t][] | [.pr, .sha] | @tsv' <<<"$q")
  if [ "$(jq length <<<"$manifest")" -eq 0 ]; then
    echo "batch $n: nothing merged; not firing"; return 1
  fi
  mkdir -p "$WT/batch"
  printf '%s\n' "$manifest" >"$WT/batch/manifest.json"
  git -C "$WT" add batch/manifest.json
  git -C "$WT" commit -q -m "batch $n: manifest ($(jq length <<<"$manifest") item(s))"
  git -C "$WT" push -q origin "batch/$n"
  git -C "$ROOT" worktree remove --force "$WT"; WT=""
  gh workflow run tests.yml --ref "batch/$n" -f "manifest=$n"
  local failed=''
  while IFS=$'\t' read -r pr sha; do
    gh pr edit "$pr" --add-label batched >/dev/null 2>&1 || failed+=" #$pr"
  done < <(jq -r '.[] | [.pr, .sha] | @tsv' <<<"$manifest")
  if [ -n "$failed" ]; then
    echo "WARN batch: dispatched batch/$n but could not label PR(s):$failed" >&2
    exit 1
  fi
  echo "batch $n: fired $(jq length <<<"$manifest") item(s)"
}

state_row() {
  local n="$1" sealed runs r state st co at id
  sealed="$(git ls-remote origin "refs/heads/batch/$n" | awk '{print $1}')"
  [ -n "$sealed" ] || die "no branch batch/$n"
  runs="$(gh run list --workflow tests.yml --branch "batch/$n" --limit 30 \
    --json databaseId,headSha,status,conclusion,attempt,event)"
  r="$(jq -c --arg sha "$sealed" \
    '[.[] | select(.headSha == $sha and .event == "workflow_dispatch")] | sort_by(.databaseId) | last // empty' <<<"$runs")"
  if [ -z "$r" ]; then printf 'pending\t%s\t\t\t\n' "$sealed"; return; fi
  st="$(jq -r .status <<<"$r")"; co="$(jq -r .conclusion <<<"$r")"
  at="$(jq -r .attempt <<<"$r")"; id="$(jq -r .databaseId <<<"$r")"
  if [ "$st" != completed ]; then state=pending
  elif [ "$co" = success ] && [ "$at" -eq 1 ]; then state=green
  elif [ "$co" = success ]; then state=yellow
  else state=red; fi
  printf '%s\t%s\t%s\t%s\t%s\n' "$state" "$sealed" "$id" "$at" "$co"
}

cmd_status() {
  local n="${1:-}"; [ -n "$n" ] || die "status: need n"
  if [ -n "$FAKE" ]; then echo "batch $n: green (fake)"; return; fi
  need gh; need git
  local state sealed id at co
  IFS=$'\t' read -r state sealed id at co < <(state_row "$n")
  echo "batch $n: $state (sha ${sealed}${id:+, run $id, attempt $at, $co})"
  [ "$state" = green ]
}

cmd_land() {
  local n="${1:-}"; [ -n "$n" ] || die "land: need n"
  if [ -n "$FAKE" ]; then echo "batch $n: land needs a real repo"; return 2; fi
  need gh; need git
  local state sealed id at co got manifest pr sha i base mer
  IFS=$'\t' read -r state sealed id at co < <(state_row "$n")
  if [ "$state" != green ]; then
    echo "batch $n: refusing to land (state $state; need a full green run on the sealed sha)" >&2
    return 1
  fi
  git fetch -q origin "refs/heads/batch/$n:refs/remotes/origin/batch/$n"
  got="$(git rev-parse "origin/batch/$n")"
  if [ "$got" != "$sealed" ]; then
    echo "batch $n: refusing to land (origin/batch/$n is $got, sealed is $sealed)" >&2
    return 1
  fi
  manifest="$(git show "$sealed:batch/manifest.json")"
  local -a prs=()
  while IFS=$'\t' read -r pr sha; do prs+=("$pr"); done \
    < <(jq -r '.[] | [.pr, .sha] | @tsv' <<<"$manifest")
  for i in "${!prs[@]}"; do
    IFS=$'\t' read -r base mer < <(gh pr view "${prs[$i]}" --json baseRefName,mergeable \
      --jq '[.baseRefName, .mergeable] | @tsv')
    if [ "$base" != main ]; then
      echo "batch $n: refusing to land (PR #${prs[$i]} targets $base, not main)" >&2
      return 1
    fi
    if [ "$mer" != MERGEABLE ]; then
      echo "batch $n: refusing to land (PR #${prs[$i]} is not mergeable: $mer)" >&2
      return 1
    fi
  done
  # R2 (ticket 09, PR 3): land the WHOLE batch as ONE main update of the sealed tip, never N `gh pr merge` pushes.
  # landPlan is the tested pure decision; the merge API call below is the single push it describes.
  local plan ok target
  plan="$(printf '%s' "$manifest" | node --input-type=module -e '
    import { landPlan } from "./tools/ci-batch.mjs";
    let s = ""; for await (const c of process.stdin) s += c;
    const d = landPlan(JSON.parse(s || "[]"), process.argv[1]);
    process.stdout.write(JSON.stringify(d));
  ' "$sealed")"
  ok="$(jq -r .ok <<<"$plan")"; target="$(jq -r .sha <<<"$plan")"
  if [ "$ok" != true ] || [ "$target" != "$sealed" ]; then
    echo "batch $n: refusing to land (landPlan: $(jq -r .reason <<<"$plan"))" >&2
    return 1
  fi
  gh api --method POST "repos/{owner}/{repo}/merges" \
    -f base=main -f head="batch/$n" \
    -f commit_message="batch $n: land sealed tip $sealed ($(jq -r .prs <<<"$plan") PR(s))" >/dev/null
  for i in "${!prs[@]}"; do
    pr="${prs[$i]}"
    gh pr close "$pr" --comment "Batch $n landed as ONE main update ($sealed); closing." >/dev/null
    gh_remove_label "$pr" done
    gh_remove_label "$pr" batched
    echo "landed PR #$pr (batch $n, sealed $sealed)"
  done
}

declare -A HM
load_handmap() {
  local f a b c p
  for f in "$ROOT"/tests/handmaps/*.tsv; do
    [ -e "$f" ] || continue
    while IFS=$'\t' read -r a b c; do
      case "$a" in ''|\#*) continue ;; esac
      if [[ "$a" == */* ]]; then
        for p in ${b//,/ }; do HM["$a|$p"]=1; done
      else
        for p in ${b//,/ } $c; do HM["$p|$a"]=1; done
      fi
    done <"$f"
  done
}
file_feeds() {
  local file="$1" spec="$2" base bn
  base="${spec%%@*}"
  case "$file" in
    "tests/$base.pw.mjs"|"tests/$base.test.mjs"|"tests/test_${base//-/_}.py") return 0 ;;
  esac
  bn="$(basename "$file")"
  grep -qF -- "$bn" "$ROOT/tests/$base.pw.mjs" 2>/dev/null && return 0
  return 1
}
manifest_rows() {
  local m="$1" i pr sha files
  if [ -n "$FAKE" ]; then
    jq -r '.[] | [.item, .pr, (.files | join(","))] | @tsv' <<<"$m"
  else
    while IFS=$'\t' read -r i pr sha; do
      files="$(gh pr diff "$pr" --name-only | paste -sd, -)"
      printf '%s\t%s\t%s\n' "$i" "$pr" "$files"
    done < <(jq -r '.[] | [.item, .pr, .sha] | @tsv' <<<"$m")
  fi
}

cmd_blame() {
  local n="${1:-}" manifest item pr files f s hit sealed got
  [ -n "$n" ] || die "blame: need a batch number"
  shift || true
  [ "$#" -gt 0 ] || die "blame: need a spec"
  local -a specs=("$@") cand=() all=() ff=()
  if [ -n "$FAKE" ]; then
    manifest='[{"item":1,"pr":101,"sha":"aaaa","files":["one.js","both.js"]},{"item":2,"pr":102,"sha":"bbbb","files":["both.js"]},{"item":3,"pr":103,"sha":"cccc","files":["three.js"]}]'
    HM["one.js|only-one"]=1; HM["both.js|both"]=1; HM["three.js|three"]=1
  else
    need gh; need git
    git fetch -q origin "refs/heads/batch/$n:refs/remotes/origin/batch/$n"
    sealed="$(git ls-remote origin "refs/heads/batch/$n" | awk '{print $1}')"
    [ -n "$sealed" ] || die "blame: no branch batch/$n"
    got="$(git rev-parse "origin/batch/$n")"
    [ "$sealed" = "$got" ] || die "blame: origin/batch/$n is $got, sealed is $sealed"
    manifest="$(git show "origin/batch/$n:batch/manifest.json")"
    load_handmap
  fi
  while IFS=$'\t' read -r item pr files; do
    hit=0
    IFS=',' read -ra ff <<<"$files"
    for f in "${ff[@]}"; do
      for s in "${specs[@]}"; do
        if [ -n "${HM[$f|$s]:-}" ] || file_feeds "$f" "$s"; then hit=1; break 2; fi
      done
    done
    [ "$hit" -eq 1 ] && cand+=("$pr")
  done < <(manifest_rows "$manifest")
  if [ "${#cand[@]}" -eq 1 ]; then
    echo "blame: PR #${cand[0]} <- $*"
    if [ -z "$FAKE" ]; then
      gh_remove_label "${cand[0]}" done
      gh_remove_label "${cand[0]}" batched
      gh_add_label "${cand[0]}" building
      gh_comment "${cand[0]}" "Batch $n: blamed for $*; back to building."
    fi
    return 0
  fi
  echo "SPLIT"
  mapfile -t all < <(jq -r '.[].pr' <<<"$manifest")
  local mid=$(((${#all[@]} + 1) / 2))
  echo "half 1: ${all[*]:0:mid}"
  echo "half 2: ${all[*]:mid}"
}

cmd="${1:-}"; [ -n "$cmd" ] || die "need a subcommand"; shift || true
case "$cmd" in
  labels) cmd_labels ;;
  sync) cmd_sync ;;
  fire) cmd_fire "$@" ;;
  status) cmd_status "$@" ;;
  land) cmd_land "$@" ;;
  blame) cmd_blame "$@" ;;
  *) die "unknown subcommand: $cmd" ;;
esac
