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
#   SPECS="..."  run exactly these .pw specs (names, space-separated; a part like ux-flows@desk too) and nothing else: one CI lane.
# Needs: python3 + sympy, node + tests/node_modules (cd tests && npm ci), Playwright's Chromium for the .pw scripts.
# The .pw scripts take a base URL, except bank / choose-all / done / katex-wrap / update / nav-stable / easy / rewards / blind / redo-note / queue-walk / blink-fx / reveal / next-reset / idle-peek / livefig / nudge / codeblock / seen / cluck-rise / incident / flight / cluck-more / dismiss / views-oui / part-feedback, which take a port and start their own server.
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

# Virtual specs: a name spec@part is its own schedulable unit (own weight() line, own lane slot); it runs tests/<spec>.pw.mjs with
# the env below. This table is the one place parts are declared. A spec with parts is never scheduled whole; the schedule check
# proves each spec file is scheduled exactly once, whole or as all of its parts. SPECS= takes part names too.
declare -A PART_ENV=(
  [ux-flows@phone]="WIDTHS=393"     # chunk key = width first (CEO plan PR 1); split a width further with FLOWS= only if it alone becomes the heaviest lane
  [ux-flows@desk]="WIDTHS=1280"
  [next-cue@1]="NC_MODE=sugar"      # by mode; the sugar-only restore check rides with sugar
  [next-cue@2]="NC_MODE=diet"
  [upload-replace@1]="UR_ONLY=^393:"   # by width (every step opens its own context); no spaces: the env is split on whitespace
  [upload-replace@2]="UR_ONLY=^1280:"
)
parts_of() { local p; for p in "${!PART_ENV[@]}"; do [ "${p%%@*}" = "$1" ] && echo "$p"; done | LC_ALL=C sort; }
units() {   # every schedulable name: a spec's parts if it has any, else the spec
  local f n p
  for f in tests/*.pw.mjs; do n="$(basename "$f" .pw.mjs)"; p="$(parts_of "$n")"; if [ -n "$p" ]; then echo "$p"; else echo "$n"; fi; done
}

# CI-measured seconds per .pw spec: median of 12 green CI runs, 2026-10-23 (timings-ci.json, brain projects/calc/_files/ci-plan-2026-10-23/); refresh with extract.py there on newer CI logs.
# ux-flows / next-cue / next-dead / rewards = the CI median minus what S3 removed (estimates until the next CI timings). overscroll and popover have no CI timing yet (25 = the median, a guess; popover 10 = its local run; part-feedback 5 = its local run, ~4 s). Unlisted (new) specs count 5, but the schedule check below fails until they get a line here.
# Sharding deals the specs, slowest first, to whichever shard is lightest so far, so the halves finish about together.
weight() {
  case "$1" in
    ux-flows) echo 205 ;; ux-flows@phone) echo 113 ;; ux-flows@desk) echo 92 ;;   # parts: 205 split ~55/45 (estimate, not measured; refresh from t_ms in the CI log)
    next-cue) echo 199 ;; next-cue@1) echo 105 ;; next-cue@2) echo 99 ;;   # whole = CI median of 3 A/A runs on main@1681169; parts = local
    upload-replace) echo 141 ;; upload-replace@1) echo 70 ;; upload-replace@2) echo 73 ;;   # seconds x (CI whole / local whole): estimates, not CI-measured
    next-dead) echo 56 ;; rewards) echo 60 ;;
    swap) echo 69 ;; blink-fx) echo 59 ;; next-reset) echo 56 ;; queue-walk) echo 51 ;; redo-note|render) echo 46 ;; cluck-rise) echo 43 ;;
    flow) echo 36 ;; easy) echo 34 ;; dismiss|fab|prefix|update) echo 31 ;; autosave) echo 28 ;; done) echo 26 ;;
    choose-all|idle-peek|nav-stable|overscroll) echo 25 ;; telemetry) echo 24 ;; incident) echo 23 ;; disabled) echo 21 ;; reload) echo 20 ;;
    bar) echo 15 ;; polish) echo 14 ;; choose-all-spam) echo 13 ;; bank|cluck-more) echo 12 ;; splash) echo 11 ;; livefig) echo 10 ;; seen) echo 9 ;;
    codeblock|flight|views) echo 7 ;; mode-reset|reveal) echo 6 ;; nudge|part-feedback) echo 5 ;; blind|katex-wrap|measure-slots|views-oui) echo 4 ;;
    popover) echo 10 ;; mcclick|privacy-reach) echo 3 ;; blur|font|geomarks) echo 1 ;;
    repair) echo 5 ;;   # C2 local run ~4 s (estimate until CI timing)
    login) echo 5 ;;   # local run ~7 s
    *) echo 5 ;;
  esac
}

# Tags per schedulable unit (CI plan PR 3, CEO-arch-2026-10-25 bullet 8): one engine tag and one time tag, optional @quarantine.
#   engine: @engine = hits a measured engine divergence (engines-report.md S1-S10: scroll height, focus scroll, fonts, resize, keyboard),
#           @layout = UI / visual geometry, @logic = state and wiring.   time: @fast-time = installs page.clock, else @real-time.
#   @quarantine:<#issue or URL>:<YYYY-MM-DD> = runs but does not block; at most 14 days out, red past the date.
# Checked by tests/lint-tags.mjs (in npm test): every unit (a spec, or each of its PART_ENV parts) has a line, closed vocab, no lies.
# Nothing reads these yet: the fast-time fixture (PR 3) and engine rotation (PR 7) will.
tags() {
  case "$1" in
    blur|fab|flow|font|katex-wrap|measure-slots|overscroll|polish|reload|swap) echo "@engine @real-time" ;;
    bar|blink-fx|cluck-more|codeblock|disabled|dismiss|geomarks|livefig|popover|privacy-reach|render|views|views-oui) echo "@layout @real-time" ;;
    ux-flows@phone|ux-flows@desk|next-cue@1|next-cue@2) echo "@layout @real-time" ;;
    autosave|bank|blind|choose-all|choose-all-spam|done|easy|flight|incident|mcclick|mode-reset|nav-stable|next-dead|prefix) echo "@logic @real-time" ;;
    part-feedback|reveal|rewards|splash|telemetry|update|upload-replace@1|upload-replace@2) echo "@logic @real-time" ;;
    queue-walk|redo-note|next-reset) echo "@logic @real-time" ;;   # the real 2 s SPAM_MS gate, every run (Tony, round 2; overscroll is the 4th)
    cluck-rise|idle-peek|nudge|seen) echo "@logic @fast-time" ;;   # these install page.clock today
    repair) echo "@layout @fast-time" ;;   # C2 repair ladder lab; installs page.clock for the 10 s study gate
    login) echo "@logic @real-time" ;;
    *) echo "" ;;
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
  done < <(units | while read -r n; do echo "$(weight "$n") $n"; done | LC_ALL=C sort -k1,1nr -k2,2)
}

# schedule check: every unit has its own weight() line (not the default 5), across all M shards each is dealt exactly once,
# and each spec file is covered exactly once: dealt whole (no parts) or as all of its parts (never both, never a part missing)
wsrc="$(declare -f weight)"; bad=0; dealt="$(for ((k = 1; k <= sm; k++)); do deal "$k"; done)"
for p in "${!PART_ENV[@]}"; do [ -f "tests/${p%%@*}.pw.mjs" ] || { echo "schedule check: part $p has no tests/${p%%@*}.pw.mjs" >&2; bad=1; }; done
while read -r n; do
  [[ "$wsrc" =~ [[:space:]]"$n"[[:space:]\|\)] ]] || { echo "schedule check: $n has no weight() entry (add its CI seconds)" >&2; bad=1; }
  c="$(grep -cxF "$n" <<<"$dealt")"
  [ "$c" -eq 1 ] || { echo "schedule check: $n is scheduled in $c of $sm shards (want exactly 1)" >&2; bad=1; }
done < <(units)
for f in tests/*.pw.mjs; do
  n="$(basename "$f" .pw.mjs)"; want="$(parts_of "$n")"; [ -n "$want" ] || want="$n"
  got="$(grep -xE "$(printf '%s' "$n" | sed 's/[.[\*^$]/\\&/g')(@.*)?" <<<"$dealt" | LC_ALL=C sort)"
  [ "$got" = "$want" ] || { echo "schedule check: $n is covered by [$(paste -sd' ' <<<"$got")], want exactly [$(paste -sd' ' <<<"$want")]" >&2; bad=1; }
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
  for n in "${specs[@]}"; do
    case "$n" in
      *@*) [ -n "${PART_ENV[$n]+x}" ] || { echo "SPECS: no part '$n' (known: ${!PART_ENV[*]})" >&2; exit 2; } ;;
      *) [ -f "tests/$n.pw.mjs" ] || { echo "SPECS: no tests/$n.pw.mjs" >&2; exit 2; } ;;
    esac
  done
elif [ "$quick" -eq 0 ]; then
  if [ "$sm" -eq 1 ]; then
    mapfile -t specs < <(units)
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

# a failed check line: "FAIL ...", "3 FAIL" (a count), or a ux-flows row "43 offline-sw  1280 FAIL t_ms=..." (CI showed no reason for that row before, tests/run-all.test.mjs)
FAIL_RE='^ *([0-9]+ )?FAIL|^[0-9]+ [^ ]+ +[0-9]+ FAIL'
run() {   # run <name> <cmd...>: green = exit 0 AND no "FAIL" line (older scripts print FAIL and still exit 0). The result line ends with the spec's seconds (CI bench: bench job reads them)
  local name="$1" t0="$EPOCHREALTIME" s; shift
  if "$@" >"$TMP/$name.log" 2>&1 && ! grep -qE "$FAIL_RE" "$TMP/$name.log"; then
    s="$(awk -v a="$t0" -v b="$EPOCHREALTIME" 'BEGIN { printf "%.1f", b - a }')"; echo "ok   $name $s s"
  else
    s="$(awk -v a="$t0" -v b="$EPOCHREALTIME" 'BEGIN { printf "%.1f", b - a }')"; echo "FAIL $name $s s"; grep -E -A3 "$FAIL_RE|Error" "$TMP/$name.log" | head -30 | sed 's/^/     /'
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
    base_="${name%%@*}"; f="tests/$base_.pw.mjs"; penv=()   # a part runs its spec's file with the part's env
    [ "$base_" != "$name" ] && read -ra penv <<<"${PART_ENV[$name]}"
    case "$base_" in
      bank|choose-all|done|katex-wrap|update|nav-stable|easy|choose-all-spam|rewards|blind|redo-note|queue-walk|blink-fx|reveal|next-reset|idle-peek|livefig|nudge|codeblock|seen|cluck-rise|incident|flight|cluck-more|dismiss|views-oui|part-feedback) run "$name" env ${penv[@]+"${penv[@]}"} node "$f" "$(free_port)" ;; # TO FUTURE CLAUDE: mrege conflcits happend twice, so check b4 pushing PR
      # bank|choose-all|done|katex-wrap|update|nav-stable|easy|choose-all-spam|rewards|blind|redo|blink-fx|reveal|next-reset|idle-peek|livefig|nudge|codeblock|seen|cluck-rise|cluck-more) run "$name" node "$f" "$(free_port)" ;;
      *) run "$name" env ${penv[@]+"${penv[@]}"} node "$f" "http://127.0.0.1:$PORT" "$TMP/shots" ;;
    esac
  done
fi
sfx=""; [ "$sm" -gt 1 ] && sfx=" (shard $sn/$sm)"
# a spec that cannot launch an engine prints "NOT COVERED <engine>: …" and goes on (render, reload): list them, so a missing engine is never silent
nc="$(grep -H "^NOT COVERED" "$TMP"/*.log 2>/dev/null | sed "s|^$TMP/||; s|\.log:NOT COVERED|:|; s|: no browser.*||")"
[ -n "$nc" ] && { echo; echo "NOT COVERED ($(wc -l <<<"$nc") engine runs):"; sed "s/^/     /" <<<"$nc"; }
echo; [ "$fails" -eq 0 ] && echo "ALL GREEN$sfx" || echo "$fails FAILED$sfx (logs: $TMP)"
[ "$fails" -eq 0 ]
