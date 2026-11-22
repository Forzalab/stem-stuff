#!/bin/sh
# Repo copy of the CODEMAP-first guard, for sessions that do not run in the brain env.
# Pipes the hook JSON on stdin to the brain script when it exists; else allows. Logic lives only in the brain.
G=/home/claude/brain/scripts/w147-guard.sh
if [ -f "$G" ]; then exec bash "$G"; fi
exit 0
