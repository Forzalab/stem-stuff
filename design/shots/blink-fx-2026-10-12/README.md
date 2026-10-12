# 20261010-B2 · live sugar one-blink (blink-fx, 2026-10-12)

Bug: in sugar, a right answer on a reward question ran several animation groups at once, and the Cluck chip (`.rw-chip.rw-wiggle`) wiggled in an `infinite` loop. Rule: one blink. At most ONE animated group on screen at a time (STYLE.md §1.6, §2.8, no ambient loops).

Measured by `tests/blink-fx.pw.mjs` (Chromium, 393x852, 20 ms samples from the Check tap). A group is the top-level thing a running animation moves: the answer (`#q`, `#fb`), the FX layer (`.fx-layer` incl. canvas confetti), the HUD (`#rwHud`), each slots / burst overlay, the drop banner, the Cluck chip (`#wish`), Next (`#qnext`). "Moving" means the animation is in its active phase (a delay or a fill does not count). Logs: `before.log` (main cef5647, `--measure`), `after.log`.

| | before (main) | after |
|---|---|---|
| wrong, then right + drop (slots + WIN burst), chip up: peak groups | **4** (3.5 s with >1 moving) | **1** (0 ms) |
| first-try right + LEVEL UP burst: peak groups | **4** (1.9 s with >1 moving) | **1** (0 ms) |
| infinite animations on reward UI | chip `rw-wiggle`, slots `fx-blink`, burst rays `fx-spin` | none |
| Cluck chip wiggle over 15 s | 3 runs, still running (infinite) | 2 runs, stopped |
| reduced motion, right + drop + burst | 4 fades (slots in/out, burst in/out) | 1 fade (slots in), the rest instant |
| right + drop: last motion | ~4.2 s (overlapping) | ~5.6 s (one after another) |

The task named 7-8 groups. That counts effects rather than elements: answer pulse, ring, sparks, confetti, +XP float, coins, pill shine/pops, bar fill, level pulse and chip. Counted by top-level element, peak 4 is the same overlap.

After, in order: answer pulse (app.css `.opt.pop`, ~0.6 s) → FX layer (sparks, confetti time-boxed to 1.1 s, "+N XP", coins) → HUD (coin-pill shine, bar fill, level pulse) → slots → burst (stars 0/80/160 ms, title ribbon 200 ms, plate 400 ms, sparks 600 ms) → drop banner. Next (`#qnext`) has no animation on main. It is static the whole time, so it never adds a group.

## Files changed
- `rewards/fx.js`: one queue (`seq`). Every `window.FX.*` call joins it, and a step starts when the one before has finished. Calls for the same group share one step. A new answer drops what the last one still had queued and skips what is still showing. The HUD bar and level pulse wait for their own step (`.fx-hold`, bar pinned). The chip wiggle is settled when a reward starts, and by any tap outside the chip (one passive `pointerdown` listener). It waits while the queue runs (`.fx-busy`). The ring around the answer is dropped (it was a second group), and so are the pill pops and the pill spray on coin landing (the HUD step's shine replaces them; 2 lines in `coinFly`, otherwise untouched for #124). The answer pop only runs if app.css's pulse is not already running. Reduced motion gets one fade per reward and instant out. Burst stagger as above.
- `rewards/rewards.css`: the chip wiggle is `.5s … 1.2s 2` (two runs back to back, then still; was 6 s `infinite`). The slots bulbs blink 4 times (not infinite), the burst rays are still (no `fx-spin` loop) and the legend duck bobs twice (was infinite). Adds the `.fx-busy` / `.fx-hold` pause rules.
- `tests/blink-fx.pw.mjs` (new; port arg, own serve.py + stub OpenRouter), `tests/run-all.sh` (blink-fx added to the port list).
- `design/STYLE.md`: one line under Reward layer.
- Not touched: `rewards/engine.js` (triggers, odds, XP, payouts, payout timings), `app.js`, `app.css`, banks/, serve.py.

## Shots
`<before|after>-<chromium|webkit>-<check|burst>-<ms>.png`: 393x852 frames at 0/200/400/600/1000 ms after Check and after the burst opens, each with a `-grey.png` twin (PIL `ImageOps.grayscale`). The Chromium frames are live. The WebKitGTK frames (ios-sim.py, safari-expanded, overlay, @1x) freeze every animation, rAF and timer at the mark.
- Greyscale verdict: **pass**. In the WIN burst the title (dark outline, light fill) and the three stars stay the most salient element in grey. In the slots the COIN DROP card is white on dark. The answer's check badge reads by its icon and lightness.
- Known gap: the WebKitGTK `burst` rows do not show the overlay (the offscreen view's timers drift, so the freeze lands outside the 1.2 s burst). The WebKitGTK `check` rows and all Chromium rows are valid. The after WebKitGTK check row shows the queue holding the FX until the answer settles.

## Gates
- `tests.log`: full `tests/run-all.sh` (not --quick). See RUN_RC at its end.
- `impeccable.log`: `tools/impeccable.sh` live on `index.html#CALC1_B01` at 4 viewports, plus a static scan of rewards/rewards.css and rewards/fx.js. rc 0, 0 findings. The index static scan was not run (pre-existing rc 2, excepted).

## Fail-if
- peak > 1 group anywhere after Check (blink-fx.pw, 20 ms sampling)
- any infinite animation left on the reward UI (chip, HUD, FX layer, slots, burst, banner)
- under reduced motion, any motion besides one fade
- any mechanism diff in `rewards/engine.js` (triggers, odds, XP, payouts, timings)
- run-all not RUN_RC=0

## Open risks
- PR #123 rewrites the `wishPaint` chip line and adds a Next landing at 320 ms and a duck chip. This branch does not touch app.js, but #123's Next/nod motion is not in this queue, so re-run blink-fx.pw after merging both. PR #124 edits `coinFly`/`shower`: here only 2 lines inside `coinFly` change.
- The HUD number count-up (engine.js `countUp`, 450-1050 ms after Check, rAF text) is not a WAAPI animation. It runs during the answer → FX-layer steps and is not counted (engine.js locked).
- A chip re-render (stream ends, sheet toggles) restarts its 2-run wiggle on the new element.
- A new answer while the last reward still plays skips the old slots/burst. A pending level-up burst of the previous question is dropped (the HUD star still shows the level).
- The whole sequence is longer (one at a time): ~2.5 s to the slots instead of 0.6 s.
