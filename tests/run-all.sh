#!/usr/bin/env bash
# Every test, one command, one verdict. Exit 0 = all green, 1 = something failed (its log is printed).
# usage: tests/run-all.sh [--quick]     --quick = unittest + npm test only (~10 s, the pre-push set)
# Needs: python3 + sympy, node + tests/node_modules (cd tests && npm ci), Playwright's Chromium for the .pw scripts.
# The .pw scripts take a base URL, except bank / choose-all / done / katex-wrap / update / nav-stable / easy / rewards / blind / redo, which take a port and start their own server.
set -uo pipefail
cd "$(dirname "$0")/.."
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

run unittest python3 -m unittest discover -s tests -p 'test_*.py'
run npm bash -c 'cd tests && npm test'
if [ "${1:-}" != "--quick" ]; then
  PORT="$(free_port)"
  python3 serve.py "$PORT" >"$TMP/serve.log" 2>&1 & SRV=$!
  for _ in $(seq 50); do (exec 3<>"/dev/tcp/127.0.0.1/$PORT") 2>/dev/null && break; sleep 0.2; done
  for f in tests/*.pw.mjs; do
    name="$(basename "$f" .pw.mjs)"
    case "$name" in
      bank|choose-all|done|katex-wrap|update|nav-stable|easy|choose-all-spam|rewards|blind|redo) run "$name" node "$f" "$(free_port)" ;;
      *) run "$name" node "$f" "http://127.0.0.1:$PORT" "$TMP/shots" ;;
    esac
  done
fi
echo; [ "$fails" -eq 0 ] && echo "ALL GREEN" || echo "$fails FAILED (logs: $TMP)"
[ "$fails" -eq 0 ]
