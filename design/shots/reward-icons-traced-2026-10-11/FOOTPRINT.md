# FOOTPRINT: reward icons traced (WIP, NOT verified), 2026-10-11

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
