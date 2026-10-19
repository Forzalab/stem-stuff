#!/usr/bin/env bash
# Every test, one command, one verdict. Exit 0 = all green, 1 = something failed (its log is printed).
# usage: tests/run-all.sh [--quick] [--shard N/M | SHARD=N/M] [--list]
#   --quick      unittest + npm test only (~10 s, the pre-push set)
#   SHARD=1/2    run one slice so the halves can run at the same time (locally, or as the CI matrix jobs). No SHARD = everything, as before.
#                Shard 1 = unittest + npm + part of the .pw specs, shard 2 = the rest; the split is a fixed greedy deal by the rough
#                per-spec seconds in weight() below (new specs count 5), so it is the same on every machine and the halves end together. Together they run exactly the unsharded set. Each run has its own TMP, port and server,
#                so two shards can run side by side. (--quick with shard 2 has nothing to run.)
#   --list       print what this run would run (one name per line) and run nothing
# Needs: python3 + sympy, node + tests/node_modules (cd tests && npm ci), Playwright's Chromium for the .pw scripts.
# The .pw scripts take a base URL, except bank / choose-all / done / katex-wrap / update / nav-stable / easy / rewards / blind / redo / blink-fx / reveal / next-reset / idle-peek / livefig / nudge / seen / cluck-rise, which take a port and start their own server.
set -uo pipefail
cd "$(dirname "$0")/.."

quick=0; list=0; SHARD="${SHARD:-}"
while [ $# -gt 0 ]; do
  case "$1" in
    --quick) quick=1 ;;
    --list) list=1 ;;
    --shard) shift; SHARD="${1:-}" ;;
    --shard=*) SHARD="${1#--shard=}" ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
  shift
done
sn=1; sm=1
if [ -n "$SHARD" ]; then
  case "$SHARD" in
    [0-9]*/[0-9]*) sn="${SHARD%/*}"; sm="${SHARD#*/}" ;;
    *) echo "bad shard '$SHARD' (want N/M, e.g. 1/2)" >&2; exit 2 ;;
  esac
  if [ "$sm" -lt 1 ] || [ "$sn" -lt 1 ] || [ "$sn" -gt "$sm" ]; then echo "bad shard '$SHARD'" >&2; exit 2; fi
fi

# Rough seconds per .pw spec (measured Oct 12 on one machine; only the order of magnitude matters). Unlisted specs count as 5.
# Sharding deals the specs, slowest first, to whichever shard is lightest so far, so the halves finish about together.
weight() {
  case "$1" in
    ux-flows) echo 285 ;; next-cue) echo 262 ;; upload-replace) echo 153 ;; next-dead) echo 128 ;; swap) echo 85 ;;
    rewards) echo 78 ;; render) echo 77 ;; blink-fx) echo 60 ;; queue-walk) echo 52 ;; prefix) echo 49 ;; easy) echo 41 ;;
    flow) echo 40 ;; autosave) echo 35 ;; done|fab) echo 34 ;; update) echo 33 ;; disabled) echo 28 ;; bar|telemetry) echo 25 ;;
    nav-stable) echo 22 ;; reload|choose-all) echo 21 ;; polish) echo 19 ;; bank) echo 17 ;; choose-all-spam) echo 14 ;;
    splash) echo 13 ;; mode-reset) echo 10 ;; blind) echo 8 ;; mcclick|katex-wrap) echo 7 ;; *) echo 5 ;;
  esac
}

# this run's share of the .pw specs (names, no path/extension): all of them unsharded, else its part of the balanced deal
specs=()
if [ "$quick" -eq 0 ]; then
  if [ "$sm" -eq 1 ]; then
    for f in tests/*.pw.mjs; do specs+=("$(basename "$f" .pw.mjs)"); done
  else
    load=(); for ((k = 0; k < sm; k++)); do load[k]=0; done
    load[0]=20                                  # shard 1 also runs unittest + npm
    while read -r w n; do
      best=0; for ((k = 1; k < sm; k++)); do [ "${load[k]}" -lt "${load[best]}" ] && best=$k; done
      load[best]=$((load[best] + w))
      [ "$best" -eq $((sn - 1)) ] && specs+=("$n")
    done < <(for f in tests/*.pw.mjs; do n="$(basename "$f" .pw.mjs)"; echo "$(weight "$n") $n"; done | LC_ALL=C sort -k1,1nr -k2,2)
  fi
fi
base=0; [ "$sn" -eq 1 ] && base=1   # unittest + npm ride with shard 1
if [ "$list" -eq 1 ]; then
  [ "$base" -eq 1 ] && printf '%s\n' unittest npm
  [ "${#specs[@]}" -gt 0 ] && printf '%s\n' "${specs[@]}"
  exit 0
fi

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
      bank|choose-all|done|katex-wrap|update|nav-stable|easy|choose-all-spam|rewards|blind|redo|blink-fx|reveal|next-reset|idle-peek|livefig|nudge|seen|cluck-rise) run "$name" node "$f" "$(free_port)" ;;
      *) run "$name" node "$f" "http://127.0.0.1:$PORT" "$TMP/shots" ;;
    esac
  done
fi
sfx=""; [ "$sm" -gt 1 ] && sfx=" (shard $sn/$sm)"
echo; [ "$fails" -eq 0 ] && echo "ALL GREEN$sfx" || echo "$fails FAILED$sfx (logs: $TMP)"
[ "$fails" -eq 0 ]
