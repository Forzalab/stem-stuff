#!/usr/bin/env bash
# Scrum run guard: read the 5h unified utilization header, print GO / SLOW / STOP.
# Run after each sprint goal. Needs a subscription OAuth token (Termux / local box):
#   CLAUDE_OAUTH_TOKEN=sk-ant-oat... tools/ratelimit-guard.sh
# Exit: 0 GO, 10 SLOW, 20 STOP, 2 no reading.
# Test without the network: GUARD_HEADERS=<file with raw headers> tools/ratelimit-guard.sh
set -euo pipefail

SLOW_AT=${GUARD_SLOW_AT:-0.70}
STOP_AT=${GUARD_STOP_AT:-0.85}

if [[ -n "${GUARD_HEADERS:-}" ]]; then
  headers=$(cat "$GUARD_HEADERS")
else
  : "${CLAUDE_OAUTH_TOKEN:?set CLAUDE_OAUTH_TOKEN (subscription OAuth token)}"
  # 1-token Haiku ping; costs ~nothing, returns the unified rate-limit headers.
  headers=$(curl -sS -D - -o /dev/null --max-time 20 https://api.anthropic.com/v1/messages \
    -H "authorization: Bearer $CLAUDE_OAUTH_TOKEN" \
    -H 'anthropic-beta: oauth-2025-04-20' \
    -H 'anthropic-version: 2023-06-01' \
    -H 'content-type: application/json' \
    -d '{"model":"claude-haiku-5-5","max_tokens":1,"messages":[{"role":"user","content":"."}]}')
fi

hdr() { printf '%s\n' "$headers" | tr -d '\r' | awk -F': ' -v k="$1" 'tolower($1)==k {print $2; exit}'; }

util=$(hdr anthropic-ratelimit-unified-5h-utilization)
reset=$(hdr anthropic-ratelimit-unified-5h-reset)

if [[ -z "$util" ]]; then
  echo "NO-READING: $(printf '%s\n' "$headers" | head -1 | tr -d '\r')" >&2
  exit 2
fi

reset_txt=""
[[ "$reset" =~ ^[0-9]+$ ]] && reset_txt=" reset=$(date -u -d "@$reset" +%Y-%m-%dT%H:%M:%SZ)"

verdict=GO code=0
awk -v u="$util" -v s="$SLOW_AT" 'BEGIN{exit !(u>=s)}' && verdict=SLOW code=10
awk -v u="$util" -v s="$STOP_AT" 'BEGIN{exit !(u>=s)}' && verdict=STOP code=20

echo "$verdict util=$util$reset_txt"
exit $code
