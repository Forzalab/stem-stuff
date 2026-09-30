#!/usr/bin/env bash
# One-shot install + deploy of stem-stuff.
# usage: ./deploy.sh [dir] [port] [branch]
# dir defaults to the folder deploy.sh itself lives in (it trusts the checkout it runs from); pass a dir to deploy elsewhere.
#   or:  bash <(curl -fsSL <raw deploy.sh url>) [dir] [port] [branch]
# Every run force-stops the old server (pid file, then anything still on the port) and starts a new one.
# STEM_PROBLEMS=/path/problems.json uses a bank outside the checkout (default: problems.json in the checkout).
# The whole script sits in { ... }: bash reads all of it before running, so updating the checkout (which rewrites
# this very file) cannot change the lines still to run.
{
set -euo pipefail

# the folder this script lives in (empty when piped / run via <(curl ...): then there is no checkout to trust)
SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd -P)" || SELF_DIR=""
[ -f "$SELF_DIR/serve.py" ] || SELF_DIR=""
DIR="${1:-${SELF_DIR:-$HOME/stem-stuff-site}}"
PORT="${2:-5567}"
BRANCH="${3:-main}"
REPO="${STEM_REPO:-git@github.com:Forzalab/stem-stuff.git}"
PROBLEMS="${STEM_PROBLEMS:-}"

die() { echo "error: $*" >&2; exit 1; }
# prompt on the terminal itself (stdout is captured by $(...); read -p writes to stderr): no tty -> default answer
ask() {
  local a=""
  if { : >/dev/tty; } 2>/dev/null; then printf '%s' "$1" >/dev/tty; read -r a </dev/tty || a=""; fi
  echo "$a"
}
# one key, no Enter (y / n / 1 / 2); Enter alone = the default
key() {
  local a=""
  if { : >/dev/tty; } 2>/dev/null; then printf '%s' "$1" >/dev/tty; read -r -s -n 1 a </dev/tty || a=""; printf '%s\n' "$a" >/dev/tty; fi
  echo "$a" | tr '[:upper:]' '[:lower:]'
}

for c in git python3; do command -v "$c" >/dev/null || die "$c not installed"; done
# the server grades with sympy
python3 -c "import sympy" 2>/dev/null || {
  echo "installing sympy (the server's math library)"
  python3 -m pip install --user -q sympy 2>/dev/null || python3 -m pip install --user -q --break-system-packages sympy \
    || die "sympy missing: python3 -m pip install --user sympy"
}

DIR="$(realpath -m "$DIR")"
# is DIR the checkout this script is running from? never re-clone or wipe it
IS_SELF=""; [ -n "$SELF_DIR" ] && [ "$DIR" = "$SELF_DIR" ] && IS_SELF=1
case "$DIR" in
  /|"$HOME"|/home|/root|/usr|/etc|/var|/opt|/tmp) die "refusing to use $DIR" ;;
esac

# pids listening on $PORT (whichever tool the box has)
port_pids() {
  if command -v lsof >/dev/null; then lsof -t -iTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true
  elif command -v ss >/dev/null; then ss -ltnpH "sport = :$PORT" 2>/dev/null | grep -o 'pid=[0-9]*' | cut -d= -f2 || true
  elif command -v fuser >/dev/null; then fuser "$PORT/tcp" 2>/dev/null || true
  fi
}
port_busy() { python3 -c "import socket,sys; s=socket.socket(); sys.exit(0 if s.connect_ex(('127.0.0.1', $PORT)) == 0 else 1)"; }

# Force-stop the old instance: our pid file, any serve.py on this port, anything else holding the port.
# TERM first, KILL after 3 s, then wait for the port to be free.
stop_old() {
  local pids alive
  pids="$( { [ -f "$DIR/.host.pid" ] && cat "$DIR/.host.pid"; pgrep -f "serve.py $PORT" 2>/dev/null; port_pids; } \
          | grep -E '^[0-9]+$' | grep -vx "$$" | sort -u | tr '\n' ' ' || true)"
  rm -f "$DIR/.host.pid"
  if [ -n "${pids// /}" ]; then
    echo "stopping old server: $pids"
    kill $pids 2>/dev/null || true
    for _ in $(seq 30); do
      alive=""; for p in $pids; do kill -0 "$p" 2>/dev/null && alive="$alive $p"; done
      [ -z "$alive" ] && break; sleep 0.1
    done
    [ -n "$alive" ] && { echo "force kill:$alive"; kill -9 $alive 2>/dev/null || true; }
  fi
  for _ in $(seq 50); do port_busy || return 0; sleep 0.1; done
  die "port $PORT is still in use by something this script can't stop (try: sudo lsof -iTCP:$PORT)"
}

if [ -d "$DIR/.git" ] && { [ -n "$IS_SELF" ] || git -C "$DIR" remote get-url origin 2>/dev/null | grep -q stem-stuff; }; then
  echo "existing install at $DIR ($BRANCH)"
  git -C "$DIR" fetch -q origin "$BRANCH"
  if [ "$(git -C "$DIR" rev-parse HEAD)" = "$(git -C "$DIR" rev-parse "origin/$BRANCH")" ]; then
    echo "already up to date"
  else
    echo "incoming:"
    git -C "$DIR" log --oneline "HEAD..origin/$BRANCH" | head -n 20
    if [ "$(key 'update the live site now? [Y/n]: ')" = "n" ]; then
      echo "kept current version"
    else
      OLD_SELF="$(git -C "$DIR" rev-parse HEAD:deploy.sh 2>/dev/null || true)"
      git -C "$DIR" checkout -q -B "$BRANCH" "origin/$BRANCH"
      echo "updated -> $(git -C "$DIR" log --oneline -1)"
      # this script just replaced itself: finish with the NEW version (once), so new deploy steps run today
      if [ -z "${STEM_REEXEC:-}" ] && [ "$OLD_SELF" != "$(git -C "$DIR" rev-parse HEAD:deploy.sh)" ]; then
        echo "deploy.sh changed -> restarting with the new version"
        exec env STEM_REEXEC=1 bash "$DIR/deploy.sh" "$DIR" "$PORT" "$BRANCH"
      fi
    fi
  fi
elif [ -n "$IS_SELF" ]; then
  # our own folder but not a git checkout (zip download, etc.): can't pull, never wipe; just (re)start it
  echo "existing install at $DIR (not a git checkout: not updating)"
elif [ -e "$DIR" ] && [ -n "$(ls -A "$DIR" 2>/dev/null)" ]; then
  echo "WARNING: $DIR is not empty:"
  ls -A "$DIR" | head -n 10
  echo
  echo "  1) Exit (default)"
  echo "  2) Wipe dir and install"
  [ "$(key 'choose [1/2]: ')" = "2" ] || { echo "exit, nothing touched"; exit 0; }
  echo "This DELETES everything in $DIR. Cannot be undone."
  [ "$(ask "type the folder name '$(basename "$DIR")' to confirm: ")" = "$(basename "$DIR")" ] \
    || { echo "no match, exit, nothing touched"; exit 0; }
  stop_old
  rm -rf -- "$DIR"
  git clone -q -b "$BRANCH" "$REPO" "$DIR"
else
  git clone -q -b "$BRANCH" "$REPO" "$DIR"
fi

cd "$DIR"
stop_old
nohup python3 serve.py "$PORT" ${PROBLEMS:+"$PROBLEMS"} > host.log 2>&1 &
echo $! > .host.pid
for _ in $(seq 30); do port_busy && break; sleep 0.1; done
if kill -0 "$(cat .host.pid)" 2>/dev/null && port_busy; then
  echo "up  http://$(hostname -f 2>/dev/null || hostname):$PORT  pid $(cat .host.pid)"
  echo "stop: kill \$(cat $DIR/.host.pid)"
else
  echo "failed:"; cat host.log; rm -f .host.pid; exit 1
fi
exit
}
