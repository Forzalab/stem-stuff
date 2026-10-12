# FOOTPRINT: reward icons traced + duck coin, 2026-10-11 / 2026-10-12

Branch `claude/reward-icons-traced` (from origin/main 2febaba). Not pushed.

## State
- Commit 1 (70e5674): five traced icons in their original part colours, icons.js regenerated, NOTICE-traced.txt, rw_icons.py header.
  Full `tests/run-all.sh` on that tree: **ALL GREEN, RUN_RC=0** (`tests.log`; this is the last run I saw).
- Commit 2 (this WIP): the same traces **recoloured onto the gift blue/gold family** (owner direction), icons.js regenerated,
  new icons-compare sheets, new after-* live shots, scripts in `src/`. **Not verified:** I did not look at the new after-* PNGs
  or the regenerated compare sheets, and I did not re-run the tests on this tree. The README still describes the pre-recolour
  version (hues section missing, sizes unchanged since the hex strings are the same length).

## Mapping
| icon | source part | status |
|---|---|---|
| coin_color.svg | 06-gold-coin-icon | traced, gold ramp |
| gem_stone_color.svg | 04-sym-diamond (06-blue-gem-icon traced to blotches) | traced, blue ramp |
| star_color.svg | 01-gold-star | traced, gold ramp |
| glowing_star_color.svg | 01-gold-star + vector glow + 5 rays | traced, gold ramp |
| cherries_color.svg | 04-sym-cherry | traced, natural red/green (no family recolour) |
| duck / fire / trophy | none | left as Fluent (MIT licence kept) |
`02-coin` and `06-money-reward-coin-2` are kind money: not used.

## vtracer settings (src/trace.py, src/build.sh)
Crop to alpha bbox, 4% pad, square, 96x96 Lanczos, pre-blur 0.5 to 0.7, PIL median-cut to k colours, hard alpha;
vtracer 0.6.15 color/stacked/spline, color_precision 6, layer_difference 24, length_threshold 4, splice 45, path_precision 1.
coin k7 speckle8 blur.7; gem k8 speckle10 blur.6 corner40; star k8 speckle8 blur.6; cherries k8 speckle6 blur.5.
Output rewritten to viewBox 0 0 32 32. Sizes: coin 6,643 B, gem 8,687 B, star 5,494 B, glowing 6,136 B, cherries 5,115 B.

## Compass hues (src/pal.py, sampled from parts 01-closed-gift-box, 02-open-lid-yellow-bow, 02-striped-box-base, 03-confetti; dark to highlight)
- blue: #1A4196 #2C4EA3 #3763C9 #247AD5 #B2D0FD
- gold: #B48329 #E8A31B #F0BD37 #FAE350 #FEF585
- Cross-check from ref JPGs (src/palref.py): 02-ref blue p50 #3C6BC7, p90 #A7CBFD; gold p50 #FAE038, p90 #FFF763. 01-ref blue p50 #0D65CD.
Recolour (src/recolor.py): each fill's luminance, normalised over the icon's fills, picks a point on the ramp.

## Licence
Traced from owner-supplied reference art (via image-model isolation); licence of the source art UNKNOWN. Do not ship to production until cleared.

## Resume
1. `bash src/build.sh` needs the parts at `$SCRATCH/r5/FX/parts` (it uses `../r5/FX/parts` relative to the script dir: copy src/ into the scratch `ri/` dir or edit P).
2. Copy final/*_color.svg to rewards/icons/, run `python3 tools/rw_icons.py`.
3. Look at icons-compare.png, icons-compare-1x.png and every after-*.png (live.mjs needs serve.py on 8891 with STEM_BANKS holding BANK_RVW from the r5/R/mkbank.py script).
4. Add the hue table to README.md, update the NOTICE ("recoloured to the gift palette"), re-run `PATH=/tmp/claude-0/venv-sympy/bin:$PATH bash tests/run-all.sh` and save tests.log.
5. Squash or reword the WIP commit.

## 2026-10-12: T24 task 2, the duck coin is the HUD + reward coin (resume from here)
Worktree: scratchpad wt124 (from /home/user/stem-stuff, branch claude/reward-icons-traced). Ports used: 8871 (own serve.py), 8872/8873 (tests).

### Done
- `rewards/icons/coin_color.svg` = T24 `duck-coin.svg` (full; > 32 px: the common slot tier at 60 px).
- `rewards/icons/coin24_color.svg` (new) = T24 `duck-coin-24.svg` (<= 32 px: HUD 28 px in engine.js, coinFly 22 px and the shower 18 to 34 px
  in fx.js, the `try/tries.html` HUD). Only edit: width/height 160 -> 32. Colours: the duck coin's own lemon gold (coordinator: keep it, one family).
- `rewards/icons/NOTICE-traced.txt`: coin + coin24 = our own art; gem / star / glowing star / cherries still UNKNOWN -> Tony decides before merge.
- `tools/rw_icons.py` header + `rewards/icons.js` regenerated (`--check` 0). fx.js header licence line fixed.
- Board `board-hud-coin-old-vs-new.png` (live HUD with Fluent / traced / duck coin, 24 + 48 px on dark, light, reel white, greyscale, reel + fly).
- Live after-shots re-taken (00, 00b, 01-hud, 02-toast, 03-coinfly, 05-slots-common) on a throwaway sugar bank BANK_RVW (scripts in `src/duck-coin/`).
  `01-hud` reports the HUD img = `coin24` at 28 px; all 6 coinFly images = `coin24`.

### Checks (Chromium 1x, Rec.601 luma; `src/duck-coin/checks.json`)
- Readable 24/48 px, dark + light: face-feature dL (eyes/beak vs face) duck24@24 93.1, duck@48 84.4 (traced 44.0 / 52.9, Fluent 22.1 / 26.7). PASS.
- Greyscale, mean luma over the disc: @48 duck 192.5 > traced 191.2 > Fluent 185.9 PASS; @24 duck24 190.1 vs traced 191.6 (-1.5, below) / Fluent 185.3.
  So among coins the full duck coin is brightest; the 24 px cut is 1.5 below the old trace (eye/beak strokes are heavier). Star 202.8 is brighter but not a disc.
- Contrast vs the background (best of disc mean / darker outer edge): HUD well #0d0903 11.38, dark #0a1322 10.66 PASS.
  White reel tile (#fff, common tier 60 px) 2.47 FAIL < 3:1 (traced 3.31, Fluent 1.85). Light sky #aedffe 1.72 (no app surface uses it).
  The face inside (eyes #141014) is far above 3:1 on any background; it is the rim that is close to white.
- Animation: 0 `infinite` added (git diff grep). No new animation.

### Left
- White reel tile contrast 2.47: not changed (Tony's T24 pick says "no coin outline"). Possible fix if wanted: a 1 px drop-shadow in the coin's own
  edge colour #A85E10 on the reel cell only (about 5:1 vs white). Tony to decide.
- Licence of the 4 traced icons (gem, star, glowing star, cherries) still UNKNOWN. PR stays "do not merge".

### Last test run seen (2026-10-12, sympy venv on PATH)
- `tests/run-all.sh --quick`: ALL GREEN (unittest, npm).
- `tests/rewards.pw.mjs 8872`: all ok (13 steps). `tests/nav-stable.pw.mjs`: all ok. `tests/ux-flows.pw.mjs`: 108 checks, 102 ok, 0 FAIL, 6 SKIP.
  `tests/try-tries.pw.mjs`: all ok.

## 2026-10-12: T25 Redeem v3 (Tony's pick) on try/genui-redeem.* (second commit on this branch)
Evidence: `design/shots/redeem-v3-2026-10-12/` (board-redeem-v3.png, strip-redeem-v3.png, v3-*.png stills, redeem-v3-fly.webm, results.json, src/).

### Done
- Files: `try/genui-redeem.js` + `try/genui-redeem.css` only. v1/v2 unchanged (checked: same text, bump, burst and count as before; 0 page errors).
- v3: no narration. "+3 waiting" / "+3 is yours" / "Still yours. Comes back later." and every visible `.rd-say` in #fb are gone; #fb keeps aria-live
  with one visually hidden line ("+3 coins" on arrival / "Comes back later" on wrong; always present, so the layout never shifts).
- The coin beside Check is the duck coin (`rewards/icons/coin24_color.svg`, same art as the HUD coin, which is also the duck coin in v3) + "+3".
- Wrong: the coin stays, dimmed (opacity .45), no text. Right: `fly()`, a port of the T24 flyDuck (brain r5/FX/d2v2/d2v2.html) and fx.js coinFly:
  one WAAPI group `rd-fly`: the coin + 3 light discs (gift glow #e4f0ff, white core) on one quadratic arc, 320 ms cubic-bezier(.45,0,.75,1),
  scale 32 -> 20 px (transform-origin 0 0, last keyframe = the HUD coin's rect); then the arrival tick, 220 ms: the coin fades into the HUD coin,
  which pops once (1.28), and the count goes 12 -> 15 on the same curve. The instant `.hud.bump` and the `.rd-burst` are gone in v3.
- Reduced motion (media or ?rm=1): no flight, one 200 ms fade of the waiting coin, then the count updates.
- NAMES v3 lead: one plain line.

### Checks (393x852, Chromium; results.json)
- Landing offset (getBoundingClientRect, flier vs HUD .coin): dx 0, dy 0, dw 0, dh 0 px.
- Count: "12" in every sample before arrival; arrival seen at 380 ms, first tick at 400 ms; final 15; count at arrival 12.
- One-blink: 46 samples at 20 ms, peak 1 group (`rd-fly`). No infinite animations (sampled + diff grep: the only match is a comment).
- Reduced motion: 0 fliers (media) / 0 (?rm=1), peak 1 group (the fade), count 15.
- Visible narration lines: idle 0, right 0, wrong 0.

### Left / not done
- `_drift/...alt-claim` note lives in the brain repo: not touched (this agent must not edit brain).
- The `.why` paragraph in genui-redeem.html still speaks of a "+3 burst" for all three (the HTML was out of scope).

### Last test run seen (after the T25 change)
- `tests/run-all.sh --quick`: ALL GREEN. No .pw test touches try/genui-redeem.
