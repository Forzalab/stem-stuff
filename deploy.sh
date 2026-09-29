#!/usr/bin/env bash
# One-shot install + deploy of stem-stuff.
# usage: ./deploy.sh [dir] [port] [branch]
#   or:  bash <(curl -fsSL <raw deploy.sh url>) [dir] [port] [branch]
set -euo pipefail

DIR="${1:-$HOME/stem-stuff-site}"
PORT="${2:-5567}"
BRANCH="${3:-main}"
REPO="${STEM_REPO:-git@github.com:Forzalab/stem-stuff.git}"

die() { echo "error: $*" >&2; exit 1; }
ask() { local a; read -r -p "$1" a </dev/tty 2>/dev/null || a=""; echo "$a"; }

for c in git python3; do command -v "$c" >/dev/null || die "$c not installed"; done

DIR="$(realpath -m "$DIR")"
case "$DIR" in
  /|"$HOME"|/home|/root|/usr|/etc|/var|/opt|/tmp) die "refusing to use $DIR" ;;
esac

stop_old() {
  local pid="$DIR/.host.pid"
  [ -f "$pid" ] && kill "$(cat "$pid")" 2>/dev/null || true
}

if [ -d "$DIR/.git" ] && git -C "$DIR" remote get-url origin 2>/dev/null | grep -q stem-stuff; then
  echo "existing install at $DIR ($BRANCH)"
  git -C "$DIR" fetch -q origin "$BRANCH"
  OLD_SERVE="$(git -C "$DIR" rev-parse HEAD:serve.py)"
  if [ "$(git -C "$DIR" rev-parse HEAD)" = "$(git -C "$DIR" rev-parse "origin/$BRANCH")" ]; then
    echo "already up to date"
  else
    echo "incoming:"
    git -C "$DIR" log --oneline "HEAD..origin/$BRANCH" | head -n 20
    if [ "$(ask 'update the live site now? [Y/n]: ')" = "n" ]; then
      echo "kept current version"
    else
      git -C "$DIR" checkout -q -B "$BRANCH" "origin/$BRANCH"
      echo "updated -> $(git -C "$DIR" log --oneline -1)"
    fi
  fi
  # Files are served from disk: a running server shows the update live.
  # Restart only if serve.py changed or the server is down.
  if [ "$OLD_SERVE" = "$(git -C "$DIR" rev-parse HEAD:serve.py)" ] \
     && [ -f "$DIR/.host.pid" ] && kill -0 "$(cat "$DIR/.host.pid")" 2>/dev/null; then
    echo "live, no restart  pid $(cat "$DIR/.host.pid")"; exit 0
  fi
elif [ -e "$DIR" ] && [ -n "$(ls -A "$DIR" 2>/dev/null)" ]; then
  echo "WARNING: $DIR is not empty:"
  ls -A "$DIR" | head -n 10
  echo
  echo "  1) Exit (default)"
  echo "  2) Wipe dir and install"
  [ "$(ask 'choose [1/2]: ')" = "2" ] || { echo "exit, nothing touched"; exit 0; }
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
nohup python3 serve.py "$PORT" > host.log 2>&1 &
echo $! > .host.pid
sleep 1
if kill -0 "$(cat .host.pid)" 2>/dev/null; then
  echo "up  http://$(hostname -f 2>/dev/null || hostname):$PORT  pid $(cat .host.pid)"
  echo "stop: kill \$(cat $DIR/.host.pid)"
else
  echo "failed:"; cat host.log; rm -f .host.pid; exit 1
fi
