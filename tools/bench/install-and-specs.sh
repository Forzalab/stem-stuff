#!/usr/bin/env bash
# Throwaway CI bench helper (branch bench-ci-9h740x, not for merge).
# usage: tools/bench/install-and-specs.sh <withdeps|nodeps|container> <rep>
# Times python deps, npm ci, browser install, then runs blur, mcclick, render the way tests/run-all.sh does.
set -uo pipefail
V="$1"; R="$2"
cd "$(dirname "$0")/../.."
ts() { date +%s.%N; }
mark() { echo "MARK $1 $(ts)"; }
mark start
T0=$(ts)

mark python_begin
if [ "$V" = container ]; then
  export DEBIAN_FRONTEND=noninteractive
  command -v python3 >/dev/null || echo "python3 missing in image"
  if ! python3 -m pip --version >/dev/null 2>&1; then apt-get update -qq && apt-get install -y -qq python3-pip; fi
  python3 -m pip install --break-system-packages sympy networkx
else
  pip install sympy networkx
fi
mark python_end

mark npmci_begin
(cd tests && npm ci && npm i --no-save "playwright@$(node -p "require('playwright-core/package.json').version")")
mark npmci_end

mark browser_begin
case "$V" in
  withdeps)  (cd tests && npx playwright install --with-deps chromium) ;;
  nodeps)    (cd tests && npx playwright install chromium) ;;
  container) echo "browsers come from the image: ${PLAYWRIGHT_BROWSERS_PATH:-unset}" ;;
esac
mark browser_end
T1=$(ts)
INSTALL_S=$(awk -v a="$T0" -v b="$T1" 'BEGIN{printf "%.1f", b-a}')

TMP=$(mktemp -d)
PORT=$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1])')
python3 serve.py "$PORT" >"$TMP/serve.log" 2>&1 & SRV=$!
trap 'kill $SRV 2>/dev/null' EXIT
for _ in $(seq 50); do (exec 3<>"/dev/tcp/127.0.0.1/$PORT") 2>/dev/null && break; sleep 0.2; done

OK=ok
for name in blur mcclick render; do
  mark "spec_${name}_begin"
  node "tests/$name.pw.mjs" "http://127.0.0.1:$PORT" "$TMP/shots" >"$TMP/$name.log" 2>&1
  rc=$?
  if [ $rc -ne 0 ] || grep -qE '^ *([0-9]+ )?FAIL' "$TMP/$name.log"; then
    OK=fail; echo "FAIL $name (rc=$rc)"; tail -30 "$TMP/$name.log"
  else
    echo "ok   $name"
  fi
  mark "spec_${name}_end"
done
echo "BENCH_A variant=$V rep=$R install_s=$INSTALL_S specs=$OK"
[ "$OK" = ok ]
