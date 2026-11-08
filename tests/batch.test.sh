#!/usr/bin/env bash
# smoke: threshold/cap in fire --dry-run, and blame 1/0/2 with a fake queue. No gh, no network.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
B="$ROOT/tools/batch.sh"
ok=0
fail() { echo "FAIL batch.test: $*" >&2; exit 1; }
has() { case "$1" in *"$2"*) ok=$((ok + 1)) ;; *) fail "$3 (want '$2'; got: $1)" ;; esac; }

out="$(BATCH_FAKE=1 BATCH_FAKE_COUNT=3 bash "$B" fire --dry-run)"
has "$out" "hold" "3 queued must not fire"

out="$(BATCH_FAKE=1 BATCH_FAKE_COUNT=4 bash "$B" fire --dry-run)"
has "$out" "would fire 4" "4 queued fires"
has "$out" "PR #101" "queue order starts at the first done item"

out="$(BATCH_FAKE=1 BATCH_FAKE_COUNT=6 bash "$B" fire --dry-run)"
has "$out" "would fire 5" "6 queued takes the hard cap"
n="$(grep -c '^  PR #' <<<"$out" || true)"
[ "$n" -eq 5 ] || fail "cap: took $n items, want 5"

out="$(BATCH_FAKE=1 bash "$B" blame 1 only-one)"
has "$out" "blame: PR #101" "one item feeding the spec is blamed"

out="$(BATCH_FAKE=1 bash "$B" blame 1 nobody)"
has "$out" "SPLIT" "no items feeding the spec splits"

out="$(BATCH_FAKE=1 bash "$B" blame 1 both)"
has "$out" "SPLIT" "two items feeding the spec splits"
has "$out" "half 1: 101 102" "the halves keep queue order"

echo "ok   batch.test.sh ($ok checks)"
