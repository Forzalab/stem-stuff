# 20261010-B2 · live sugar one-blink (blink-fx, 2026-10-12)

Bug: in sugar, a right answer on a reward question ran several animation groups at once, and the Cluck chip (`.rw-chip.rw-wiggle`) wiggled in an `infinite` loop. Rule: one blink. At most ONE animated group on screen at a time (STYLE.md §1.6, §2.8, no ambient loops).

Measured by `tests/blink-fx.pw.mjs` (Chromium, 393x852, 20 ms samples from the Check tap). A group is the top-level thing a running animation moves: the answer (`#q`, `#fb`), the FX layer (`.fx-layer` incl. canvas confetti), the HUD (`#rwHud`), each slots / burst overlay, the drop banner, the Cluck chip (`#wish`), Next (`#qnext`), plus the HUD number's count-up (engine.js `countUp`, rAF text, counted as `hud` while it ticks). "Moving" means the animation is in its active phase (a delay or a fill does not count). Logs: `before.log` (main cef5647, `--measure`), `after.log`.

| | before (main) | after |
|---|---|---|
| wrong, then right + drop (slots + WIN burst), chip up: peak groups | **4** (3.5 s with >1 moving) | **1** (0 ms) |
| first-try right + LEVEL UP burst: peak groups | **3** (1.9 s with >1 moving) | **1** (0 ms) |
| level up, then a right answer on the next question ~1 s later | peak **3**, level-up burst shows | peak **1**, level-up burst shows |
| infinite animations on reward UI | chip `rw-wiggle`, slots `fx-blink`, burst rays `fx-spin` | none |
| Cluck chip wiggle over 15 s | 3 runs, still running (infinite) | 2 runs, stopped |
| reduced motion, right + drop + burst | 4 fades (slots in/out, burst in/out) | 1 fade (slots in), the rest instant |
| right + drop: last motion | ~4.2 s (overlapping) | ~5.4 s (one after another; slots open at ~2.5 s) |

The task named 7-8 groups. That counts effects rather than elements: answer pulse, ring, sparks, confetti, +XP float, coins, pill shine/pops, bar fill, level pulse and chip. Counted by top-level element, peak 4 is the same overlap.

After, in order: answer pulse (app.css `.opt.pop`, ~0.6 s; settle cap 800 ms) → FX layer (sparks, confetti time-boxed to 0.9 s, "+N XP", coins) → HUD (coin-pill shine, bar fill, level pulse, the number's 600 ms count-up) → slots → burst (stars 0/80/160 ms, title ribbon 200 ms, plate 400 ms, sparks 600 ms) → drop banner. Next (`#qnext`) has no animation on main. It is static the whole time, so it never adds a group.

## Files changed
- `rewards/fx.js`: one queue (`seq`). Every `window.FX.*` call joins it, and a step starts when the one before has finished. Calls for the same group share one step. A new answer, or a new question (`hashchange`), drops only the last answer's queued answer / FX-layer / HUD steps and finishes its FX layer. Its slots, burst and banner stay queued and play first: the engine already spent the burst cap on them (engine.js `answer()`), so a level-up is never lost. Overlays are never clicked away. When a HUD step was dropped, the HUD catches up at the end without motion. The HUD bar and level pulse wait for their own step (`.fx-hold`, bar pinned). The chip wiggle is settled when a reward starts, and by any tap outside the chip (one passive `pointerdown` listener). It waits while the queue runs (`.fx-busy`). The ring around the answer is dropped (it was a second group), and so are the pill pops and the pill spray on coin landing (the HUD step's shine replaces them; 2 lines in `coinFly`, otherwise untouched for #124). The answer pop only runs if app.css's pulse is not already running. Reduced motion gets one fade per reward and instant out. Burst stagger as above.
- `rewards/rewards.css`: the chip wiggle is `.5s … 1.2s 2` (two runs back to back, then still; was 6 s `infinite`). The slots bulbs blink 4 times (not infinite), the burst rays are still (no `fx-spin` loop) and the legend duck bobs twice (was infinite). Adds the `.fx-busy` / `.fx-hold` pause rules.
- `app.js`: ONE line (was `setTimeout(() => RW().render(…), 450)`): `fx.hud ? fx.hud(() => RW().render(…)) : setTimeout(…, 450)`, so the count-up plays inside the HUD step. `fx.js` exposes `FX.hud(fn)`.
- `tests/blink-fx.pw.mjs` (new; port arg, own serve.py + stub OpenRouter), `tests/run-all.sh` (blink-fx added to the port list).
- `design/STYLE.md`: one line under Reward layer.
- Not touched: `rewards/engine.js` (triggers, odds, XP, payouts, payout timings), `app.css`, banks/, serve.py. app.js: only the one line above.

## Shots
- Chromium: `<before|after>-chromium-<393|1920>-<check|burst>-<ms>.png` at 0/200/400/600/1000 ms after Check and after the burst opens, plus `-slots-0600` (COIN DROP). Each frame is a fresh page frozen at the mark: every animation is paused, and rAF and timers are stopped by a timer on the page clock, so there is no capture skew.
- WebKitGTK: `<before|after>-webkit-<check|burst>-<ms>.png` plus `-slots-0600`. These use ios-sim.py (safari-expanded, overlay, 393x852 @1x), frozen the same way, with a MutationObserver arming the burst and slots marks.
- Every frame has a `-grey.png` twin (PIL `ImageOps.grayscale`).
- Greyscale verdict at 393: **pass**. The WIN title and stars are the most salient element in grey. COIN DROP's coin reels are white on dark, and the answer's check reads by icon and lightness.
- Greyscale verdict at 1920: **warn, pre-existing**. The burst title is capped at 56 px, so in grey the full-screen rays compete with it. The title still has the strongest contrast at the centre. This branch did not change the burst art.
- Known gap: the WebKitGTK `burst` rows still show the page without the overlay. The freeze arms at the right moment, but the offscreen WebKitGTK view does not paint the burst overlay. The slots and check rows show correctly, and all Chromium rows are valid.

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
- PR #123 rewrites the `wishPaint` chip line and adds a Next landing at 320 ms and a duck chip. This branch touches one app.js line (rewardShow's HUD render, not wishPaint), but #123's Next/nod motion is not in this queue, so re-run blink-fx.pw after merging both. PR #124 edits `coinFly`/`shower`: here only 2 lines inside `coinFly` change.
- A chip re-render (stream ends, sheet toggles) restarts its 2-run wiggle on the new element.
- A new answer while the last reward still plays: the old slots / burst / banner play first, then the new answer's FX. While an old overlay is up, the new answer's app.css pulse runs under it (a full-screen overlay hides it).
- rewards.pw "#rwCoin.rw-shine within 3 s": the shine now lands at ~1.7-2.0 s. It was red once in a parallel run (load) and green alone.
- The whole sequence is longer (one at a time): ~2.5 s to the slots instead of 0.6 s.

## Post-merge: #123 + #124 + #127 on main (2026-10-12)
Branch `ccr-634a09af-yb5zfu-blink-nod`, off main 834c8c2 (#127 merged on top of #123 T17b-1 default Next cue + duck chip, and #124 duck coin).

- **Cause:** #123's calm nod. `wishPaint()` put `.g-nod` on the duck chip's `img.dk` straight away (app.css: 360 ms, 320 ms delay so it starts after Next lands). That timer ran outside the one-blink queue, so its active phase landed on the answer step's pulse (`FX.pop`, the queue's first step). Before the fix, blink-fx on plain main: peak **2** ("answer + chip") in all 3 motion cases, for 300 / 380 / 360 ms. Reduced motion passed (`.g-nod` is `animation: none` there). Next's `g-next-in` (in `#q`, so the answer group) never overlapped: the answer step's settle already waits for it. #124 only swaps coin images (fx.js `coinFly` / `shower` src, engine.js icon), with no timing change: not a cause.
- **Fix:** the nod is its own queued step, `FX.nod(get)` (rewards/fx.js:99). It is placed right after this tap's answer step and before the FX layer. It waits one frame so the same tap's pop is queued first (rewardGo's rAF is registered before cueChip's microtask). If no answer step is queued (a paid-out code), it runs at once. The step first settles everything outside the chip / FX / HUD (that is, Next's g-next-in), then adds `.g-nod` and seeks past its 320 ms delay, because the queue already did that waiting. app.css is unchanged, so the computed delay stays 320 ms for next-cue.pw. A new question drops a queued nod (`SKIP.chip`), and `get()` returns null when the question or wish changed. app.js:1370-1373: with `window.FX`, the img renders without `g-nod` and calls `FX.nod`. Without FX, it keeps the old class. Diet has no chip, so diet is untouched. engine.js is untouched.
- **Numbers** (blink-fx.pw, Chromium 393x852, appended to `after.log` as `after-merge-nod`): peak **1 / 1 / 1** (0 ms with >1 group), reduced motion 1. Order: answer 20 ms → chip nod ~420-470 ms → FX layer ~780-850 ms → HUD → slots / burst / banner. The FX layer starts ~40-60 ms later than with the overlap.
- next-cue.pw (393x852 + 393x659): rc 0, all checks passed. Full run-all (`tests.log`): ALL GREEN, RUN_RC=0.
