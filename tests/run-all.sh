#!/usr/bin/env bash
# Every test, one command, one verdict. Exit 0 = all green, 1 = something failed (its log is printed).
# usage: tests/run-all.sh [--quick] [--fast] [--shard N/M | SHARD=N/M] [--list] [--plan B L] [--affected <file>... [--report]]   (or SPECS="a b c" tests/run-all.sh)
#   --quick      unittest + npm test + the batch tooling smoke (~10 s, the pre-push set)
#   --fast       the worker pre-push loop: node unit tests + the cheapest strict one-page units (ticket 07).
#                The units are FAST_UNITS below, cheapest first; the run prints a `fast total` and must stay <60 s on CI.
#                Run it before every push instead of waiting on the full CI.
#   SHARD=1/2    run one slice so the halves can run at the same time (locally, or as the CI matrix jobs). No SHARD = everything, as before.
#                Shard 1 = unittest + npm + part of the .pw specs, shard 2 = the rest; the split is a fixed greedy deal by the rough
#                per-spec seconds in weight() below (new specs count 5), so it is the same on every machine and the halves end together. Together they run exactly the unsharded set. Each run has its own TMP, port and server,
#                so two shards can run side by side. (--quick with shard 2 has nothing to run.)
#   --list       print what this run would run (one name per line) and run nothing
#   --plan B L   print the CI matrix (one JSON line) and run nothing: the specs dealt into B blocks x L lanes by the same deal
#                as SHARD; each block's lanes are joined by '|'. unittest + npm are not in it (CI runs them in their own job).
#   SPECS="..."  run exactly these .pw specs (names, space-separated; a part like ux-flows@desk too) and nothing else: one CI lane.
# Needs: python3 + sympy, node + tests/node_modules (cd tests && npm ci), Playwright's Chromium for the .pw scripts.
# The .pw scripts take a base URL, except bank / choose-all / done / katex-wrap / update / nav-stable / ios-back / easy / rewards / blind / redo-note / queue-walk / blink-fx / reveal / next-reset / idle-peek / livefig / figstream / caret / nudge / codeblock / seen / cluck-rise / incident / flight / cluck-more / dismiss / views-oui / part-feedback / noob / mock / proof / proof-kb / proof-timeout / stages /copy-math / why-chip / repair-gap / welcome-app / views-static / toast-note / twin-first / desk-layout / desk-notes-off / shotqa / expr / units / twist / fcard-clip / guard / strip-layers / strip-layers-mc / dot1 / cluck-permanent / cluck-v2 / ladder-ui / reveal-tray / reveal-duck / fcard-reveal / ladderwire / tray-matrix / cluck-lost / cluck-telemetry / lockhelp / calc-pick / welcome-first / net-retry / calc, which take a port and start their own server.
set -uo pipefail
cd "$(dirname "$0")/.."

quick=0; fast=0; list=0; plan=""; SHARD="${SHARD:-}"; SPECS="${SPECS:-}"
affected=0; report=0; affected_files=()
while [ $# -gt 0 ]; do
  case "$1" in
    --quick) quick=1 ;;
    --fast) fast=1 ;;
    --list) list=1 ;;
    --plan) plan="${2:-} ${3:-}"; shift 2 ;;
    --shard) shift; SHARD="${1:-}" ;;
    --shard=*) SHARD="${1#--shard=}" ;;
    --affected) affected=1 ;;
    --report) report=1 ;;
    -*) echo "unknown argument: $1" >&2; exit 2 ;;
    *) if [ "$affected" -eq 1 ]; then affected_files+=("$1"); else echo "unknown argument: $1" >&2; exit 2; fi ;;
  esac
  shift
done
[ "$report" -eq 1 ] && [ "$affected" -eq 0 ] && { echo "--report needs --affected <file>..." >&2; exit 2; }
sn=1; sm=1; lead=55   # lead: shard 1 also runs unittest + npm (CI median: unittest 50 s + npm 4 s)
if [ -n "$plan" ]; then
  read -r pb pl <<<"$plan"
  [[ "$pb" =~ ^[1-9][0-9]*$ && "$pl" =~ ^[1-9][0-9]*$ ]] || { echo "bad --plan '$plan' (want B L, e.g. 3 3)" >&2; exit 2; }
  sm=$((pb * pl)); lead=0
fi
plan_subset=0
[ -n "$plan" ] && [ -n "$SPECS" ] && plan_subset=1   # --plan SPECS subset; empty/unset = today's full plan (I6)
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
  [stages@phone]="WIDTHS=393"       # 160 PR-B: one width each (own front server + serve.py per part)
  [stages@desk]="WIDTHS=1280"
  [dot1@phone]="DOT_W=393"          # DOT-1 status dot: by width (each width opens its own pages)
  [dot1@desk]="DOT_W=700"   # BIG PLAN V1: 700, not 1280 (no dot on desktop sugar: the box is always open)
  [cluck-permanent@desk]="CP_W=1280,721"   # BIG PLAN V1: by width class
  [cluck-permanent@phone]="CP_W=393"
  [cluck-v2@desk]="CV_W=1280,721"   # BIG PLAN V2: by width class
  [cluck-v2@phone]="CV_W=393"
  [next-cue@1]="NC_MODE=sugar"      # by mode; the sugar-only restore check rides with sugar
  [next-cue@2]="NC_MODE=diet"
  [upload-replace@1]="UR_ONLY=^393:"   # by width (every step opens its own context); no spaces: the env is split on whitespace
  [upload-replace@2]="UR_ONLY=^1280:"
  [desk-layout@1]="SIZES=720x800,721x800,1024x768"     # by size (W129; each size opens its own contexts): the breakpoint, then laptops,
  [desk-layout@2]="SIZES=1280x720,1366x768,1440x900"   # then big screens + zoom; commas only (the env is split on whitespace)
  [desk-layout@3]="SIZES=1920x1080,2560x1440,1366x768@1.25,1366x768@1.5"
)
parts_of() { local p; for p in "${!PART_ENV[@]}"; do [ "${p%%@*}" = "$1" ] && echo "$p"; done | LC_ALL=C sort; }
units() {   # every schedulable name: a spec's parts if it has any, else the spec
  local f n p
  for f in tests/*.pw.mjs; do n="$(basename "$f" .pw.mjs)"; p="$(parts_of "$n")"; if [ -n "$p" ]; then echo "$p"; else echo "$n"; fi; done
}
plan_units() {   # --plan with SPECS deals exactly that subset; unset/empty = every unit (I6)
  if [ "$plan_subset" -eq 1 ]; then printf '%s\n' $SPECS; else units; fi
}

# --affected (ticket 06): print the units these changed files need; run nothing. auto+hand are a union;
# a file with no row is unmapped -> every unit of its pipe (more specs, never fewer).
if [ "$affected" -eq 1 ]; then
  if [ "${#affected_files[@]}" -eq 0 ]; then echo "usage: tests/run-all.sh --affected <file>... [--report]" >&2; exit 2; fi
  node tests/handmaps/gen-auto.mjs >/dev/null || { echo "gen-auto failed" >&2; exit 1; }
  mapfile -t layout_units < <(units)
  logic_units=(unittest npm)
  pipe_of() {   # extension first; an unknown kind under tests/ is never fewer than both pipes
    case "$1" in
      *.js|*.css|*.html) echo layout ;;
      *.py) echo logic ;;
      *.mjs) case "$1" in tools/*|tests/*) echo logic ;; *) echo layout ;; esac ;;
      tests/*) echo "layout logic" ;;
      *) echo layout ;;
    esac
  }
  all_of() {
    local p; p=" $(pipe_of "$1") "
    case "$p" in *" logic "*) printf '%s\n' "${logic_units[@]}" ;; esac
    case "$p" in *" layout "*) printf '%s\n' "${layout_units[@]}" ;; esac
  }
  norm() { local f="$1"; while [ "${f#./}" != "$f" ]; do f="${f#./}"; done; printf '%s' "${f#"$PWD"/}"; }
  declare -A auto_units=() hand_units=() file_units=()
  load_map() {   # load_map <tsv> <auto|hand>
    local file="$1" kind="$2" key names n u
    [ -f "$file" ] || return 0
    while IFS=$'\t' read -r key names; do
      [ -n "$key" ] || continue; key="${key#./}"; case "$key" in \#*) continue ;; esac
      for n in $names; do
        if [ "$n" = ALL ]; then
          if [ "$kind" = auto ]; then auto_units[$key]+=" $(all_of "$key" | paste -sd' ' -)"; else hand_units[$key]+=" $(all_of "$key" | paste -sd' ' -)"; fi
        elif [ "$kind" = auto ]; then auto_units[$key]+=" $n"; else hand_units[$key]+=" $n"; fi
      done
    done < "$file"
  }
  load_map tests/handmaps/auto.tsv auto
  load_map tests/handmaps/hand.tsv hand
  for key in "${!auto_units[@]}"; do file_units[$key]="${auto_units[$key]}"; done
  for key in "${!hand_units[@]}"; do file_units[$key]="${file_units[$key]:-} ${hand_units[$key]}"; done
  selected=(); counts=(); all_files=(); declare -A seen=()
  for raw in "${affected_files[@]}"; do
    key="$(norm "$raw")"; names="${file_units[$key]:-}"
    if [ -z "${names// /}" ]; then
      guess="$(printf '%s\n' ${auto_units[$key]:-} | sed '/^$/d' | LC_ALL=C sort -u | paste -sd' ' -)"
      echo "unmapped: $raw -> all $(pipe_of "$key") (best guess: ${guess:-none})"
      mapfile -t add < <(all_of "$key")
    else
      mapfile -t add < <(printf '%s\n' $names | sed '/^$/d' | LC_ALL=C sort -u)
    fi
    seen=(); for u in "${add[@]}"; do seen[$u]=1; done
    mapfile -t need < <(all_of "$key")   # ALL = every unit of this file's pipe (logic too)
    is_all=1; for u in "${need[@]}"; do [ -n "${seen[$u]:-}" ] || { is_all=0; break; }; done
    counts+=("${#add[@]}"); [ "$is_all" -eq 1 ] && all_files+=("$raw")
    for u in "${add[@]}"; do selected+=("$u"); done
  done
  if [ "$report" -eq 1 ]; then
    median="$(printf '%s\n' "${counts[@]}" | LC_ALL=C sort -n | awk '{a[NR]=$1} END { if (NR == 0) print 0; else if (NR % 2) printf "%d", a[(NR + 1) / 2]; else printf "%.1f", (a[NR / 2] + a[NR / 2 + 1]) / 2 }')"
    printf 'report: %d files, median %s units/file\n' "${#counts[@]}" "$median"
    printf 'all (%d): %s\n' "${#all_files[@]}" "${all_files[*]:-none}"
    exit 0
  fi
  printf '%s\n' "${selected[@]}" | sed '/^$/d' | LC_ALL=C sort -u
  exit 0
fi

# CI-measured seconds per .pw spec: median of 12 green CI runs, 2026-10-23 (timings-ci.json, brain projects/calc/_files/ci-plan-2026-10-23/); refresh with extract.py there on newer CI logs.
# ux-flows / next-cue / next-dead / rewards = the CI median minus what S3 removed (estimates until the next CI timings). overscroll and popover have no CI timing yet (25 = the median, a guess; popover 10 = its local run; part-feedback 5 = its local run, ~4 s). Unlisted (new) specs count 5, but the schedule check below fails until they get a line here.
# Sharding deals the specs, slowest first, to whichever shard is lightest so far, so the halves finish about together.
weight() {
  case "$1" in
    ux-flows) echo 205 ;; ux-flows@phone) echo 113 ;; ux-flows@desk) echo 92 ;;   # parts: 205 split ~55/45 (estimate, not measured; refresh from t_ms in the CI log)
    next-cue) echo 199 ;; next-cue@1) echo 105 ;; next-cue@2) echo 99 ;;   # whole = CI median of 3 A/A runs on main@1681169; parts = local
    upload-replace) echo 141 ;; upload-replace@1) echo 70 ;; upload-replace@2) echo 73 ;;   # seconds x (CI whole / local whole): estimates, not CI-measured
    next-dead) echo 56 ;; rewards) echo 60 ;; guard) echo 12 ;;
    swap) echo 69 ;; blink-fx) echo 59 ;; next-reset) echo 56 ;; queue-walk) echo 51 ;; redo-note|render) echo 46 ;; cluck-rise) echo 43 ;;
    flow) echo 36 ;; easy) echo 34 ;; dismiss|fab|prefix|update) echo 31 ;; autosave) echo 28 ;; done) echo 26 ;;
    choose-all|idle-peek|nav-stable|overscroll) echo 25 ;; ios-back) echo 14 ;; telemetry) echo 24 ;; incident) echo 23 ;; disabled) echo 21 ;; reload) echo 20 ;;
    bar) echo 15 ;; polish) echo 14 ;; choose-all-spam) echo 13 ;; bank|cluck-more) echo 12 ;; splash) echo 11 ;; livefig) echo 10 ;; figstream) echo 8 ;; figgap|caret) echo 8 ;; seen) echo 9 ;; cluck-telemetry) echo 9 ;;
    fcard-reveal) echo 8 ;; codeblock|flight|views) echo 7 ;; mode-reset|reveal) echo 6 ;; nudge|part-feedback|why-chip|repair-gap) echo 5 ;; blind|katex-wrap|measure-slots|net-retry|views-oui|views-static) echo 4 ;;
    popover) echo 10 ;; mcclick|privacy-reach) echo 3 ;; blur|font) echo 1 ;;
    retry-wait) echo 49 ;;   # local estimate: 49.0 s, STEM_TODAY=2026-10-23, shared server (not CI-measured)
    calc) echo 18 ;;   # Calc Coach smoke (calc-coach.js), own server + fixture bank, 390 only
    calc-pick) echo 8 ;;   # the calculator model picker smoke (calc-pick.js), own server, 390 only; local ~6 s
    welcome-first) echo 8 ;;   # the once-per-user welcome redirect (welcome-first.js), own server; local ~5 s
    cram-off) echo 8 ;;   # ticket 03: the one cram flag off hides every cram surface, own server + temp cram.json; local ~7 s
    lockhelp) echo 51 ;;   # local estimate: 50.2 s, STEM_TODAY=2026-10-23, own server (not CI-measured)
    geomarks) echo 12 ;;  # wgeo U1: + the ramp contact check on chromium/firefox/webkit at 1440 + 390; U3: + labels at 1440/390/360 (graph.js + Geometry); local run ~12.5 s (CI has chromium only: ~5 s)
    reveal-box) echo 12 ;;   # W114f: own server, 4 pages (390 + 1280, right + out), local run ~12 s
    cluck-permanent@desk) echo 30 ;; cluck-permanent@phone) echo 8 ;; cluck-v2@desk) echo 40 ;; cluck-v2@phone) echo 8 ;;   # BIG PLAN V1: Cluck always open on desktop sugar, own server (estimate until CI timing)
    dot1@phone) echo 35 ;; dot1@desk) echo 35 ;;   # DOT-1: the status dot, own server, 4 kinds x states at one width + fade; local ~30 s (estimate until CI timing)
    strip-layers-mc) echo 110 ;;   # B3 PR-B2: the drawer under mc / pick-all / multi, own server; mc x 360/390/1280, pick-all + multi 390 only; local ~110 s (estimate until CI timing)
    strip-layers) echo 170 ;;   # B3 PR-B1: the verdict drawer under a typed answer, own server, 4 kinds x 3 states x 360/390/1280 + motion + duck; local run ~165 s (estimate until CI timing)
    stages@phone|stages@desk) echo 25 ;;   # 160 PR-B tool call theater: 8 steps per width on a paused page clock, local run ~20 s (estimate until CI timing)
    proof-timeout) echo 6 ;;   # todo 109 item 1: fake clock, own server, local run ~5 s (estimate until CI timing)
    proof-ladder) echo 8 ;;   # generated proof ladder (client), own server, flag on
    proof-kb) echo 8 ;;   # proof item, phone keyboard up: the question tile hugs (Nov 8), own server, local ~6 s
    welcome) echo 5 ;;   # local run ~4 s
    ladder-ui) echo 30 ;;   # LADDER-UI (Nov 3): the welcome ladder at 393 / 1280 / 721 x sugar / diet, own server; local ~25 s (estimate until CI timing)
    window-surface) echo 15 ;;   # W152 window names after the split: 4 runs (2 sizes x sugar/diet), own serve.py; estimate until CI timing
    cluck-history) echo 20 ;;   # W2 Cluck history status lines + folds at 390 / 1280, own serve.py, stub OpenRouter; estimate until CI timing
    w3) echo 40 ;;   # W3 polish items 1-8 at 390 / 1280, own serve.py, page.clock for the 30 s ladder; estimate until CI timing
    reveal-tray) echo 45 ;;   # REVEAL-TRAY (Nov 3): reveal under the drawer, its duck, tags row, Cluck box, brainrot fold, toast; own server + stub; local ~40 s
    reveal-duck) echo 45 ;;
    expr) echo 12 ;;   # W137: 3 screen sizes + flag off, own servers; local run ~11 s
    tray-anchor) echo 15 ;;   # TRAY-ANCHOR (Nov 4): the tray slips from under the answer box (bottom-left) + equal answer-value margins; own server + stub, 390 only
    tray-matrix) echo 45 ;;   # wrong-try tray overlay matrix (own server, stub chat, 360/393/721/1280 x MC/freeform/multi-part)
    cluck-lost) echo 15 ;;   # a reply that dies mid-way: one clean "lost signal" line, own server, /explain mocked, 1280 + 393
    ladderwire) echo 25 ;;   # the repair ladder after a miss, own server, fixture bank, 393 + 1280
    welcome-app) echo 26 ;;   # todo 119 welcome Q1 in the app, own server, 7 screen sizes, local run ~26 s (estimate until CI timing)
    minicluck) echo 3 ;;   # local run ~3s
    axis-cross) echo 3 ;;   # todo 136: the x/y/z cross at 360/390/414 + 1440, chromium, no server; local run ~3 s
    noob) echo 15 ;;   # local run ~15s
    mock) echo 12 ;;   # W103b night-before mock, local run ~10 s
    twin-first) echo 9 ;;   # todo 121 twin held for its template's miss, own server, local run ~8 s
    repair) echo 5 ;;   # C2 local run ~4 s (estimate until CI timing)
    repair-twin) echo 3 ;;   # W117 keyless answer step takes the shown item's type, local run ~2 s (estimate until CI timing)
    login) echo 5 ;;   # local run ~7 s
    proof) echo 8 ;;   # W107 proof box, local run (estimate until CI timing)
    brainrot) echo 5 ;;   # W105 dead-video swap, local run ~4 s (estimate until CI timing)
    copy-math) echo 14 ;;   # W108 copy math as plain text, local run ~13 s (estimate until CI timing)
    fcard-clip) echo 20 ;;   # W115 formula card math not cut off, 4 sizes x chromium/firefox/webkit, own server, local run ~20 s (CI has chromium only)
    toast-note) echo 30 ;;   # W112 toast notes + desktop start line, local run ~30 s (estimate until CI timing)
    desk-layout) echo 236 ;; desk-layout@1) echo 70 ;; desk-layout@2) echo 72 ;; desk-layout@3) echo 94 ;;   # W129 desktop column + pixel-diff gate, own server; whole = local run, parts = local estimates
    desk-notes-off) echo 14 ;;   # W97 desktop notes box kept: diet shows, sugar hides (static html.sugar), phone keeps it, own server, local run ~14 s (estimate until CI timing)
    units) echo 12 ;;   # W132 answer units: value green + unit in ink, copy = value only, 3 screens, own server (estimate until CI timing)
    twist) echo 22 ;;   # W133 Twist chip + one-time toast + popover, 3 screens + blocked storage, own server; local run ~20 s (estimate until CI timing)
    layers) echo 2 ;;   # W157 local run: layers.test.mjs ~0.1 s + layers.pw.mjs ~1.6 s (rounded up)
    shotqa) echo 30 ;;   # W340 §0 the shot gate: 5 vet cards + every stepper step at 1440x900 + 390x844, own server, local run ~28 s (estimate until CI timing)
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
    axis-cross|bar|blink-fx|reveal-box|cluck-more|codeblock|disabled|dismiss|geomarks|layers|livefig|figstream|figgap|caret|popover|privacy-reach|render|strip-layers|strip-layers-mc|views|views-oui|views-static) echo "@layout @real-time" ;;
    ux-flows@phone|ux-flows@desk|next-cue@1|next-cue@2|dot1@phone|dot1@desk|cluck-permanent@phone|cluck-permanent@desk|cluck-v2@phone|cluck-v2@desk) echo "@layout @real-time" ;;
    stages@phone|stages@desk) echo "@logic @fast-time" ;;   # 160 PR-B: the page clock is paused and moved by hand (clock.runFor)
    autosave|bank|blind|choose-all|choose-all-spam|done|easy|flight|incident|mcclick|mode-reset|nav-stable|ios-back|net-retry|next-dead|prefix) echo "@logic @real-time" ;;
    part-feedback|reveal|rewards|splash|telemetry|update|upload-replace@1|upload-replace@2) echo "@logic @real-time" ;;
    guard) echo "@layout @real-time" ;;   # W104 sleeping guard, own server
    queue-walk|redo-note|next-reset) echo "@logic @real-time" ;;   # the real 2 s SPAM_MS gate, every run (Tony, round 2; overscroll is the 4th)
    cluck-rise|idle-peek|nudge|seen|retry-wait) echo "@logic @fast-time" ;;   # these install page.clock today
    welcome) echo "@layout @real-time" ;;
    calc) echo "@layout @real-time" ;;   # Calc Coach in the app (own serve.py, fixture bank)
    calc-pick) echo "@logic @real-time" ;;   # the calculator model picker smoke, own server
    welcome-first) echo "@logic @real-time" ;;   # the welcome redirect, own server
    cram-off) echo "@logic @real-time" ;;   # ticket 03: every cram surface off with one flag, own server + temp cram.json
    lockhelp) echo "@logic @real-time" ;;   # no page.clock: time is skewed via performance.now + sessionStorage __skew; real waits
    cluck-lost) echo "@layout @real-time" ;;   # the clean error line after a mid-reply failure
    tray-anchor) echo "@layout @real-time" ;;   # TRAY-ANCHOR: own serve.py + a stub OpenRouter, no real-time waits
    tray-matrix|ladderwire) echo "@layout @real-time" ;;   # repair ladder wired after a miss (own serve.py, fixture bank)
    welcome-app) echo "@layout @real-time" ;;   # todo 119: the welcome Q1 wired into the app (own serve.py, fixture bank)
    fcard-reveal) echo "@logic @real-time" ;;   # key formulas reveal with no ladder (own serve.py, fixture bank)
    cluck-history|cluck-telemetry|w3) echo "@logic @real-time" ;;   # the Cluck history lines + the W3 polish + the Cluck telemetry events (own serve.py, stub OpenRouter)
    minicluck) echo "@layout @real-time" ;;
    noob) echo "@logic @real-time" ;;
    why-chip) echo "@logic @real-time" ;;
    repair-gap) echo "@layout @real-time" ;;
    ladder-ui) echo "@layout @real-time" ;;   # LADDER-UI: own serve.py, fixture bank
    window-surface) echo "@logic @real-time" ;;   # W152: own serve.py, names only, no real-time waits
    reveal-tray) echo "@layout @real-time" ;;   # REVEAL-TRAY: own serve.py + a stub OpenRouter; waits out the real 2 s spam gate
    reveal-duck) echo "@layout @real-time" ;;
    mock) echo "@logic @real-time" ;;   # W103b; waits out the ~0.7 s wrong-answer peek for real
    twin-first) echo "@logic @real-time" ;;   # todo 121; waits out the real 2 s spam gate before its miss
    repair) echo "@layout @fast-time" ;;   # C2 repair ladder lab; installs page.clock for the 10 s study gate
    repair-twin) echo "@logic @real-time" ;;   # W117 mc template + num twin on one ladder; stub grader, no clock
    login) echo "@logic @real-time" ;;
    proof) echo "@logic @real-time" ;;   # W107 proof box + stub grader
    proof-timeout) echo "@logic @fast-time" ;;   # todo 109 item 1: fake page clock, own server
    proof-ladder) echo "@logic @real-time" ;;   # generated proof ladder: stub grader, STEM_PROOF_LADDER=1
    proof-kb) echo "@logic @real-time" ;;   # proof item keyboard-up layout, own server
    brainrot) echo "@logic @real-time" ;;   # W105 stub YouTube players report onError over postMessage
    copy-math) echo "@logic @real-time" ;;   # W108 real clipboard (granted), stub OpenRouter
    toast-note) echo "@layout @real-time" ;;   # W112 note placement + the cover rule across screen sizes
    desk-layout@1|desk-layout@2|desk-layout@3) echo "@layout @real-time" ;;   # W129 L1-L6: the desktop columns, the pixel-diff gate on every tap
    expr) echo "@logic @real-time" ;;   # W137 expression answers: own 2 serve.py (EXPR_MODE on / off) + a fake Claude, 390 / 1440 / 1366
    desk-notes-off) echo "@layout @real-time" ;;   # W97 desktop notes: diet kept, sugar hidden from first paint, phone kept
    units) echo "@layout @real-time" ;;   # W132 the answer line's unit: colour, weight, gap, same line; real clipboard
    twist) echo "@layout @real-time" ;;   # W133 the Twist chip, its popover, the one-time toast and its cover rule (#q, Next) at 390 / 1366 / 1440
    fcard-clip) echo "@layout @real-time" ;;   # W115 todo 115: KaTeX ink vs the .fm scroll box at 4 sizes
    shotqa) echo "@layout @real-time" ;;   # W340 §0 shot gate: figures drawn, findings, angle labels, shots for the orc
    *) echo "" ;;
  esac
}

# --fast (ticket 07, scope A): node unit tests + the cheapest strict one-page @layout units, cheapest first (serial wall s from 07-fast-pipe.measure-b.md).
FAST_UNITS=(layers minicluck popover axis-cross figgap cluck-permanent@phone privacy-reach geomarks livefig)

# the balanced deal: deal <shard-no> prints that shard's .pw spec names (names, no path/extension)
deal() {
  local load=() k best w n
  for ((k = 0; k < sm; k++)); do load[k]=0; done
  load[0]=$lead
  while read -r w n; do
    best=0; for ((k = 1; k < sm; k++)); do [ "${load[k]}" -lt "${load[best]}" ] && best=$k; done
    load[best]=$((load[best] + w))
    [ "$best" -eq $(($1 - 1)) ] && echo "$n"
  done < <(plan_units | while read -r n; do echo "$(weight "$n") $n"; done | LC_ALL=C sort -k1,1nr -k2,2)
}

# schedule check: every unit has its own weight() line (not the default 5), across all M shards each is dealt exactly once,
# and each spec file is covered exactly once: dealt whole (no parts) or as all of its parts (never both, never a part missing)
wsrc="$(declare -f weight)"; bad=0; dealt="$(for ((k = 1; k <= sm; k++)); do deal "$k"; done)"
for p in "${!PART_ENV[@]}"; do [ -f "tests/${p%%@*}.pw.mjs" ] || { echo "schedule check: part $p has no tests/${p%%@*}.pw.mjs" >&2; bad=1; }; done
while read -r n; do
  [[ "$wsrc" =~ [[:space:]]"$n"[[:space:]\|\)] ]] || { echo "schedule check: $n has no weight() entry (add its CI seconds)" >&2; bad=1; }
  c="$(grep -cxF "$n" <<<"$dealt")"
  [ "$c" -eq 1 ] || { echo "schedule check: $n is scheduled in $c of $sm shards (want exactly 1)" >&2; bad=1; }
done < <(plan_units)
if [ "$plan_subset" -eq 0 ]; then
  for f in tests/*.pw.mjs; do
    n="$(basename "$f" .pw.mjs)"; want="$(parts_of "$n")"; [ -n "$want" ] || want="$n"
    got="$(grep -xE "$(printf '%s' "$n" | sed 's/[.[\*^$]/\\&/g')(@.*)?" <<<"$dealt" | LC_ALL=C sort)"
    [ "$got" = "$want" ] || { echo "schedule check: $n is covered by [$(paste -sd' ' <<<"$got")], want exactly [$(paste -sd' ' <<<"$want")]" >&2; bad=1; }
  done
fi
[ "$bad" -eq 0 ] || exit 1

if [ -n "$plan" ]; then   # lane k of block b = deal no. (k-1)*B + b: the heaviest specs open different blocks
  pshards=$sm; pblocks=$pb
  if [ "$plan_subset" -eq 1 ]; then   # a subset smaller than the lanes: drop empty blocks/lanes, never plan ALL
    n="$(plan_units | wc -l)"; [ "$n" -lt "$pshards" ] && pshards=$n
    [ "$pshards" -lt "$pblocks" ] && pblocks=$pshards
  fi
  printf '{"include":['
  for ((b = 1; b <= pblocks; b++)); do
    lanes=""; k=0
    for ((s = b; s <= pshards; s += pblocks)); do
      l="$(deal "$s" | paste -sd' ')"
      [ -n "$l" ] || { echo "--plan $pb $pl: shard $s has no specs (an empty SPECS runs everything): fewer lanes" >&2; exit 1; }
      lanes+="$( [ "$k" -gt 0 ] && printf '|' )$l"; k=$((k + 1))
    done
    printf '%s{"block":%d,"of":%d,"lanes":"%s"}' "$( [ "$b" -gt 1 ] && printf ',' )" "$b" "$pblocks" "$lanes"
  done
  printf ']}\n'; exit 0
fi

# this run's share of the .pw specs: SPECS as given, all of them unsharded, else its part of the balanced deal
specs=()
if [ "$fast" -eq 1 ]; then
  read -ra specs <<<"${FAST_UNITS[*]}"
elif [ -n "$SPECS" ]; then
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
base=0; [ "$sn" -eq 1 ] && [ -z "$SPECS" ] && [ "$fast" -eq 0 ] && base=1   # unittest + npm ride with shard 1 (never with a SPECS lane)
if [ "$list" -eq 1 ]; then
  [ "$fast" -eq 1 ] && { printf '%s\n' npm "${specs[@]}"; exit 0; }
  [ "$base" -eq 1 ] && printf '%s\n' unittest npm
  [ "${#specs[@]}" -gt 0 ] && printf '%s\n' "${specs[@]}"
  exit 0
fi

# The slips v2 sunset (serve.today, SCHEMA.md) drops v:1 banks from 2026-11-05, and the fixture banks are v:1: pin the server clock to a
# pre-sunset day for everything this script starts (unittest, npm, the servers the .pw specs spawn, and so CI, which calls this script).
export STEM_TODAY=2026-10-23
TMP="$(mktemp -d)"; export STEM_TRIES="$TMP/tries.json"      # never the real tries.json
# W126: a killed run left serve.py behind: the trap killed only $SRV, and the node spec running (it spawns its own serve.py) was orphaned.
# On EXIT/TERM/INT/HUP, kill everything below this script, deepest first (so no parent is gone before its child is found).
SRV=""
killtree() { local c; for c in $(pgrep -P "$1" 2>/dev/null); do killtree "$c"; done; [ "$1" = "$$" ] || kill "$1" 2>/dev/null; return 0; }
trap 'trap - EXIT; killtree $$' EXIT
trap 'exit 143' TERM; trap 'exit 130' INT; trap 'exit 129' HUP
fails=0
free_port() { python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1])'; }

# a failed check line: "FAIL ...", "3 FAIL" (a count), or a ux-flows row "43 offline-sw  1280 FAIL t_ms=..." (CI showed no reason for that row before, tests/run-all.test.mjs)
FAIL_RE='^ *([0-9]+ )?FAIL|^[0-9]+ [^ ]+ +[0-9]+ FAIL'
# unit_fails <log>: each unittest "FAIL: <id>" / "ERROR: <id>" header + the last lines of its traceback (the assertion), then the
# "Ran N tests" / "FAILED (...)" summary. W138: #353's CI row showed only the log's head (aiw_rewrite / claude noise), never which test failed.
unit_fails() {
  awk '
    function flush(  i, s) {   # from the innermost "  File" frame: its code line, the exception, the start of a long diff (12 lines max)
      if (hdr == "") return; print hdr; s = 1; for (i = 1; i <= n; i++) if (tb[i] ~ /^  File /) s = i
      for (i = s; i <= n && i < s + 12; i++) print "  " tb[i]; hdr = ""; n = 0
    }
    /^(FAIL|ERROR): / { flush(); hdr = $0; skip = 1; next }
    hdr != "" && /^(=|-)+$/ && length($0) >= 70 { if (skip) { skip = 0; next } flush(); next }
    hdr != "" { skip = 0; if ($0 != "") tb[++n] = $0; next }
    /^Ran [0-9]+ tests? in / || /^FAILED \(/ { print }
    END { flush() }
  ' "$1"
}
run() {   # run <name> <cmd...>: green = exit 0 AND no "FAIL" line (older scripts print FAIL and still exit 0). The result line ends with the spec's seconds (CI bench: bench job reads them)
  local name="$1" t0="$EPOCHREALTIME" s; shift
  "$@" >"$TMP/$name.log" 2>&1 & wait $!   # background + wait: bash runs a TERM/INT trap at once during wait, not after a foreground child
  if [ $? -eq 0 ] && ! grep -qE "$FAIL_RE" "$TMP/$name.log"; then
    s="$(awk -v a="$t0" -v b="$EPOCHREALTIME" 'BEGIN { printf "%.1f", b - a }')"; echo "ok   $name $s s"
  else
    s="$(awk -v a="$t0" -v b="$EPOCHREALTIME" 'BEGIN { printf "%.1f", b - a }')"
    local qd today; today="$(date -u +%F)"; qd="$(tags "$name" | grep -oE '@quarantine:[^ ]+' | sed 's/.*://' | head -1)"
    if [ -n "$qd" ] && [[ "$today" < "$qd" || "$today" = "$qd" ]]; then   # in-window: run, don't block; past the date = red
      printf '\033[33mQUAR %s %s s\033[0m\n' "$name" "$s"
    else
      echo "FAIL $name $s s"
      local uf=""; [ "$name" = unittest ] && uf="$(unit_fails "$TMP/$name.log" | head -200)"
      if [ -n "$uf" ] && grep -qE '^(FAIL|ERROR): ' <<<"$uf"; then sed 's/^/     /' <<<"$uf"   # the failing tests, not the log's head
      else grep -E -A3 "$FAIL_RE|Error" "$TMP/$name.log" | head -30 | sed 's/^/     /'; fi
      fails=$((fails + 1))
    fi
  fi
}

fast_t0="$EPOCHREALTIME"
if [ "$fast" -eq 1 ]; then
  run npm bash -c 'cd tests && npm test'
elif [ "$base" -eq 1 ]; then
  run unittest python3 -m unittest discover -s tests -p 'test_*.py'
  run npm bash -c 'cd tests && npm test'
  run batch bash tests/batch.test.sh
  run codemap python3 tools/repo_checks/codemap.py map   # CM3: every CODEMAP row exists, every code file has a row, big files have a header
fi
if [ "${#specs[@]}" -gt 0 ]; then
  PORT="$(free_port)"
  python3 server/http_server/serve.py "$PORT" >"$TMP/serve.log" 2>&1 & SRV=$!
  for _ in $(seq 50); do (exec 3<>"/dev/tcp/127.0.0.1/$PORT") 2>/dev/null && break; sleep 0.2; done
  for name in "${specs[@]}"; do
    base_="${name%%@*}"; f="tests/$base_.pw.mjs"; penv=()   # a part runs its spec's file with the part's env
    [ "$base_" != "$name" ] && read -ra penv <<<"${PART_ENV[$name]}"
    case "$base_" in
      bank|calc|choose-all|done|katex-wrap|update|nav-stable|ios-back|easy|choose-all-spam|rewards|blind|redo-note|queue-walk|blink-fx|reveal|next-reset|idle-peek|livefig|figstream|figgap|caret|nudge|codeblock|seen|cluck-rise|incident|flight|cluck-more|dismiss|views-oui|part-feedback|noob|mock|proof|proof-timeout|proof-ladder|proof-kb|stages|copy-math|why-chip|repair-gap|welcome-app|views-static|toast-note|twin-first|desk-layout|desk-notes-off|shotqa|expr|units|twist|fcard-clip|reveal-box|guard|strip-layers|strip-layers-mc|dot1|cluck-permanent|cluck-v2|ladder-ui|reveal-tray|reveal-duck|fcard-reveal|ladderwire|tray-matrix|tray-anchor|cluck-lost|cluck-history|cluck-telemetry|lockhelp|calc-pick|welcome-first|net-retry|w3) run "$name" env ${penv[@]+"${penv[@]}"} node "$f" "$(free_port)" ;; # TO FUTURE CLAUDE: mrege conflcits happend twice, so check b4 pushing PR
      # bank|choose-all|done|katex-wrap|update|nav-stable|easy|choose-all-spam|rewards|blind|redo|blink-fx|reveal|next-reset|idle-peek|livefig|nudge|codeblock|seen|cluck-rise|cluck-more) run "$name" node "$f" "$(free_port)" ;;
      *) run "$name" env ${penv[@]+"${penv[@]}"} node "$f" "http://127.0.0.1:$PORT" "$TMP/shots" ;;
    esac
  done
fi
[ "$fast" -eq 1 ] && echo "fast total $(awk -v a="$fast_t0" -v b="$EPOCHREALTIME" 'BEGIN { printf "%.1f", b - a }') s"
sfx=""; [ "$sm" -gt 1 ] && sfx=" (shard $sn/$sm)"
# a spec that cannot launch an engine prints "NOT COVERED <engine>: …" and goes on (render, reload): list them, so a missing engine is never silent
nc="$(grep -H "^NOT COVERED" "$TMP"/*.log 2>/dev/null | sed "s|^$TMP/||; s|\.log:NOT COVERED|:|; s|: no browser.*||")"
[ -n "$nc" ] && { echo; echo "NOT COVERED ($(wc -l <<<"$nc") engine runs):"; sed "s/^/     /" <<<"$nc"; }
echo; [ "$fails" -eq 0 ] && echo "ALL GREEN$sfx" || echo "$fails FAILED$sfx (logs: $TMP)"
[ "$fails" -eq 0 ]
