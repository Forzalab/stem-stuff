#!/usr/bin/env bash
# Every test, one command, one verdict. Exit 0 = all green, 1 = something failed (its log is printed).
# usage: tests/run-all.sh [--quick] [--shard N/M | SHARD=N/M] [--list] [--plan B L]   (or SPECS="a b c" tests/run-all.sh)
#   --quick      unittest + npm test only (~10 s, the pre-push set)
#   SHARD=1/2    run one slice so the halves can run at the same time (locally, or as the CI matrix jobs). No SHARD = everything, as before.
#                Shard 1 = unittest + npm + part of the .pw specs, shard 2 = the rest; the split is a fixed greedy deal by the rough
#                per-spec seconds in weight() below (new specs count 5), so it is the same on every machine and the halves end together. Together they run exactly the unsharded set. Each run has its own TMP, port and server,
#                so two shards can run side by side. (--quick with shard 2 has nothing to run.)
#   --list       print what this run would run (one name per line) and run nothing
#   --plan B L   print the CI matrix (one JSON line) and run nothing: the specs dealt into B blocks x L lanes by the same deal
#                as SHARD; each block's lanes are joined by '|'. unittest + npm are not in it (CI runs them in their own job).
#   SPECS="..."  run exactly these .pw specs (names, space-separated) and nothing else: one CI lane.
# Needs: python3 + sympy, node + tests/node_modules (cd tests && npm ci), Playwright's Chromium for the .pw scripts.
# The .pw scripts take a base URL, except bank / choose-all / done / katex-wrap / update / nav-stable / easy / rewards / blind / redo-note / queue-walk / blink-fx / reveal / next-reset / idle-peek / livefig / nudge / codeblock / seen / cluck-rise / incident / flight / cluck-more / dismiss / views-oui, which take a port and start their own server.
set -uo pipefail
cd "$(dirname "$0")/.."

quick=0; list=0; plan=""; SHARD="${SHARD:-}"; SPECS="${SPECS:-}"
while [ $# -gt 0 ]; do
  case "$1" in
    --quick) quick=1 ;;
    --list) list=1 ;;
    --plan) plan="${2:-} ${3:-}"; shift 2 ;;
    --shard) shift; SHARD="${1:-}" ;;
    --shard=*) SHARD="${1#--shard=}" ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
  shift
done
sn=1; sm=1; lead=55   # lead: shard 1 also runs unittest + npm (CI median: unittest 50 s + npm 4 s)
if [ -n "$plan" ]; then
  read -r pb pl <<<"$plan"
  [[ "$pb" =~ ^[1-9][0-9]*$ && "$pl" =~ ^[1-9][0-9]*$ ]] || { echo "bad --plan '$plan' (want B L, e.g. 3 3)" >&2; exit 2; }
  sm=$((pb * pl)); lead=0
fi
if [ -n "$SHARD" ]; then
  case "$SHARD" in
    [0-9]*/[0-9]*) sn="${SHARD%/*}"; sm="${SHARD#*/}" ;;
    *) echo "bad shard '$SHARD' (want N/M, e.g. 1/2)" >&2; exit 2 ;;
  esac
  if [ "$sm" -lt 1 ] || [ "$sn" -lt 1 ] || [ "$sn" -gt "$sm" ]; then echo "bad shard '$SHARD'" >&2; exit 2; fi
fi

# CI-measured seconds per .pw spec: median of 12 green CI runs, 2026-10-23 (timings-ci.json, brain projects/calc/_files/ci-plan-2026-10-23/); refresh with extract.py there on newer CI logs.
# ux-flows / next-cue / next-dead / rewards = the CI median minus what S3 removed (estimates until the next CI timings). overscroll and popover have no CI timing yet (25 = the median, a guess; popover 10 = its local run). Unlisted (new) specs count 5, but the schedule check below fails until they get a line here.
# Sharding deals the specs, slowest first, to whichever shard is lightest so far, so the halves finish about together.
weight() {
  case "$1" in
    ux-flows) echo 205 ;; next-cue) echo 184 ;; upload-replace) echo 138 ;; next-dead) echo 56 ;; rewards) echo 60 ;;
    swap) echo 69 ;; blink-fx) echo 59 ;; next-reset) echo 56 ;; queue-walk) echo 51 ;; redo-note|render) echo 46 ;; cluck-rise) echo 43 ;;
    flow) echo 36 ;; easy) echo 34 ;; dismiss|fab|prefix|update) echo 31 ;; autosave) echo 28 ;; done) echo 26 ;;
    choose-all|idle-peek|nav-stable|overscroll) echo 25 ;; telemetry) echo 24 ;; incident) echo 23 ;; disabled) echo 21 ;; reload) echo 20 ;;
    bar) echo 15 ;; polish) echo 14 ;; choose-all-spam) echo 13 ;; bank|cluck-more) echo 12 ;; splash) echo 11 ;; livefig) echo 10 ;; seen) echo 9 ;;
    codeblock|flight|views) echo 7 ;; mode-reset|reveal) echo 6 ;; nudge) echo 5 ;; blind|katex-wrap|measure-slots|views-oui) echo 4 ;;
    popover) echo 10 ;; mcclick|privacy-reach) echo 3 ;; blur|font|geomarks) echo 1 ;;
    *) echo 5 ;;
  esac
}

# the balanced deal: deal <shard-no> prints that shard's .pw spec names (names, no path/extension)
deal() {
  local load=() k best w n
  for ((k = 0; k < sm; k++)); do load[k]=0; done
  load[0]=$lead
  while read -r w n; do
    best=0; for ((k = 1; k < sm; k++)); do [ "${load[k]}" -lt "${load[best]}" ] && best=$k; done
    load[best]=$((load[best] + w))
    [ "$best" -eq $(($1 - 1)) ] && echo "$n"
  done < <(for f in tests/*.pw.mjs; do n="$(basename "$f" .pw.mjs)"; echo "$(weight "$n") $n"; done | LC_ALL=C sort -k1,1nr -k2,2)
}

# schedule check: every spec has its own weight() line (not the default 5), and across all M shards each is dealt exactly once
wsrc="$(declare -f weight)"; bad=0; dealt="$(for ((k = 1; k <= sm; k++)); do deal "$k"; done)"
for f in tests/*.pw.mjs; do
  n="$(basename "$f" .pw.mjs)"
  [[ "$wsrc" =~ [[:space:]]"$n"[[:space:]\|\)] ]] || { echo "schedule check: $n has no weight() entry (add its CI seconds)" >&2; bad=1; }
  c="$(grep -cxF "$n" <<<"$dealt")"
  [ "$c" -eq 1 ] || { echo "schedule check: $n is scheduled in $c of $sm shards (want exactly 1)" >&2; bad=1; }
done
[ "$bad" -eq 0 ] || exit 1

if [ -n "$plan" ]; then   # lane k of block b = deal no. (k-1)*B + b: the heaviest specs open different blocks
  printf '{"include":['
  for ((b = 1; b <= pb; b++)); do
    lanes=""
    for ((k = 1; k <= pl; k++)); do
      l="$(deal $(((k - 1) * pb + b)) | paste -sd' ')"
      [ -n "$l" ] || { echo "--plan $pb $pl: lane $k of block $b is empty (an empty SPECS runs everything): fewer lanes" >&2; exit 1; }
      lanes+="$( [ "$k" -gt 1 ] && printf '|' )$l"
    done
    printf '%s{"block":%d,"of":%d,"lanes":"%s"}' "$( [ "$b" -gt 1 ] && printf ',' )" "$b" "$pb" "$lanes"
  done
  printf ']}\n'; exit 0
fi

# this run's share of the .pw specs: SPECS as given, all of them unsharded, else its part of the balanced deal
specs=()
if [ -n "$SPECS" ]; then
  read -ra specs <<<"$SPECS"
  for n in "${specs[@]}"; do [ -f "tests/$n.pw.mjs" ] || { echo "SPECS: no tests/$n.pw.mjs" >&2; exit 2; }; done
elif [ "$quick" -eq 0 ]; then
  if [ "$sm" -eq 1 ]; then
    for f in tests/*.pw.mjs; do specs+=("$(basename "$f" .pw.mjs)"); done
  else
    mapfile -t specs < <(deal "$sn")
  fi
fi
base=0; [ "$sn" -eq 1 ] && [ -z "$SPECS" ] && base=1   # unittest + npm ride with shard 1 (never with a SPECS lane)
if [ "$list" -eq 1 ]; then
  [ "$base" -eq 1 ] && printf '%s\n' unittest npm
  [ "${#specs[@]}" -gt 0 ] && printf '%s\n' "${specs[@]}"
  exit 0
fi

# The slips v2 sunset (serve.today, SCHEMA.md) drops v:1 banks from 2026-11-05, and the fixture banks are v:1: pin the server clock to a
# pre-sunset day for everything this script starts (unittest, npm, the servers the .pw specs spawn, and so CI, which calls this script).
export STEM_TODAY=2026-10-23
TMP="$(mktemp -d)"; export STEM_TRIES="$TMP/tries.json"      # never the real tries.json
SRV=""; trap '[ -n "$SRV" ] && kill "$SRV" 2>/dev/null' EXIT
fails=0
free_port() { python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1])'; }

run() {   # run <name> <cmd...>: green = exit 0 AND no "FAIL" line (older scripts print FAIL and still exit 0)
  local name="$1"; shift
  if "$@" >"$TMP/$name.log" 2>&1 && ! grep -qE '^ *([0-9]+ )?FAIL' "$TMP/$name.log"; then
    echo "ok   $name"
  else
    echo "FAIL $name"; grep -E -A3 '^ *([0-9]+ )?FAIL|Error' "$TMP/$name.log" | head -30 | sed 's/^/     /'
    fails=$((fails + 1))
  fi
}

if [ "$base" -eq 1 ]; then
  run unittest python3 -m unittest discover -s tests -p 'test_*.py'
  run npm bash -c 'cd tests && npm test'
fi
if [ "${#specs[@]}" -gt 0 ]; then
  PORT="$(free_port)"
  python3 serve.py "$PORT" >"$TMP/serve.log" 2>&1 & SRV=$!
  for _ in $(seq 50); do (exec 3<>"/dev/tcp/127.0.0.1/$PORT") 2>/dev/null && break; sleep 0.2; done
  for name in "${specs[@]}"; do
    f="tests/$name.pw.mjs"
    case "$name" in
      bank|choose-all|done|katex-wrap|update|nav-stable|easy|choose-all-spam|rewards|blind|redo-note|queue-walk|blink-fx|reveal|next-reset|idle-peek|livefig|nudge|codeblock|seen|cluck-rise|incident|flight|cluck-more|dismiss|views-oui) run "$name" node "$f" "$(free_port)" ;; # TO FUTURE CLAUDE: mrege conflcits happend twice, so check b4 pushing PR
      # bank|choose-all|done|katex-wrap|update|nav-stable|easy|choose-all-spam|rewards|blind|redo|blink-fx|reveal|next-reset|idle-peek|livefig|nudge|codeblock|seen|cluck-rise|cluck-more) run "$name" node "$f" "$(free_port)" ;;
      *) run "$name" node "$f" "http://127.0.0.1:$PORT" "$TMP/shots" ;;
    esac
  done
fi
sfx=""; [ "$sm" -gt 1 ] && sfx=" (shard $sn/$sm)"
# a spec that cannot launch an engine prints "NOT COVERED <engine>: …" and goes on (render, reload): list them, so a missing engine is never silent
nc="$(grep -H "^NOT COVERED" "$TMP"/*.log 2>/dev/null | sed "s|^$TMP/||; s|\.log:NOT COVERED|:|; s|: no browser.*||")"
[ -n "$nc" ] && { echo; echo "NOT COVERED ($(wc -l <<<"$nc") engine runs):"; sed "s/^/     /" <<<"$nc"; }
echo; [ "$fails" -eq 0 ] && echo "ALL GREEN$sfx" || echo "$fails FAILED$sfx (logs: $TMP)"
[ "$fails" -eq 0 ]
