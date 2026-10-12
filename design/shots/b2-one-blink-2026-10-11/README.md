# 20261010-B2 one blink: reward FX one group at a time (branch `claude/b2-one-blink`)

Before = origin/main 3e0a08b (a detached worktree). After = this branch. Local serve.py only, with a throwaway bank (no live or prod URL).
Sugar mode, 393x852, a right first try on a reward question (mc, rigged so there is no drop), unless the row says otherwise.

## Numbers (tests/blink.pw.mjs: samples every 20 ms, active-phase WAAPI + CSS animations + transitions, the confetti canvas, the HUD count-up)

| case | before: peak groups (fine) · moving · >1 group | after: peak · moving · >1 group | logs |
|---|---|---|---|
| right answer | **6** (9: answer, ring, sparks, confetti, "+XP" float, coins, coin shine, …) · 2.48 s · 660 ms | **1** · 1.46 s · 0 ms | `blink-before/blink-right.json`, `blink-after/blink-right.json` |
| right answer while the Cluck chip wiggles | **7** (11) · 2.04 s · 1940 ms | **1** · 1.56 s · 0 ms | `blink-*/blink-right-with-chip.json` |
| right answer + common drop (reels, WIN burst, banner) | **6** (13) · 6.30 s · 2100 ms | **1** (inside the overlays too: one part at a time) · 5.55 s · 0 ms | `blink-*/blink-drop.json` |
| reduced motion, right answer | 0 (nothing) | 1: one 200 ms opacity fade of "+N XP", no transform | `blink-*/blink-right-rm.json` |
| Cluck chip wiggle | `infinite`, every 6 s | 2 runs (3 s each, 1.2 s delay), then still; paused during a beat or a picked choice; rests when the question is solved | `blink-before.log`, `blink-after.log` |

"Moving" counts from the Check tap, so it includes the check request and the page's own lock-in fades. The ~1.7 s in the queue entry
is the >1-group time with the chip (1.94 s here) / the confetti tail.

After, from the animation clock (blink-after.log `starts`): answer → stars ≈ 300–450 ms (the stars wait for the answer and the
page's lock-in fades to settle, up to 400 ms) → ribbon +200 → coins (the button) +200 → HUD (bar, balance count, coin shine) →
the ribbon fades out. Every start in a beat is a WAAPI delay set up front, so a busy main thread cannot push two parts together.

## Fail-if

| Fail if | Result | Proof |
|---|---|---|
| peak concurrent groups > 1 after a sugar right answer | PASS (1) | `blink-after.log`, `blink-after/blink-right.json` |
| stars → ribbon → button not 200 ms apart, or out of order | PASS (200 ± 20 ms, order answer > stars > ribbon > coins > hud) | `blink-after.log` (`starts`) |
| a drop / burst / banner overlaps the beat or itself | PASS (peak 1, one overlay part at a time) | `blink-after/blink-drop.json` |
| the chip wiggles more than 2 times or loops | PASS (`animation-iteration-count: 2`, no animation left after) | `blink-after.log` step 3 |
| the chip moves while a reward plays | PASS (`right-with-chip` peak 1) | `blink-after/blink-right-with-chip.json` |
| reduced motion is more than one fade (or any transform) | PASS (one opacity fade, `transformed: []`) | `blink-after/blink-right-rm.json`, `strip-after-chromium-rm.png` |
| triggers, odds, XP or payout timing change | PASS: no change to engine.js / app.js; rewards.pw + try-tries.pw green (XP 14, +1, drops, bursts, toasts) | `tests.log` |
| any red test (FULL run-all) | PASS, see `RUN_RC` | `tests.log` |
| impeccable rc ≠ 0 | PASS (rc 0; live 390/1920/2560/3840 + static rewards.css, fx.js, index.html; 1 advisory on index.html, not counted) | `impeccable.log` |
| a shot missing (Chromium + WebKitGTK, before + after, 393x852) | PASS | `strip-{before,after}-{chromium,webkit}.png`, `-rm` strips |
| GREYSCALE gate: states by hue alone, or the prize not the most salient | PASS: the reward states differ by shape/position/text ("+14 XP" white-on-dark, coin discs, the balance number); no state colour changed; the "+N XP" and coins stay the brightest marks | `strip-*-grey.png` |
| diff outside rewards/fx.js, rewards/rewards.css, the test, this folder | PASS | `git diff --stat origin/main` |

## Shots

- `strip-before-chromium.png` / `strip-after-chromium.png` (+ `-grey`): 11 frames 0–2200 ms after the Check tap. One run per frame, each frozen
  on the animation clock at exactly T (a late timer rewinds every animation to T; canvas drawing stops). The beat starts when the
  check answers, so it can sit ~±100 ms differently between runs.
- `strip-*-chromium-rm.png` (+ `-grey`): reduced motion, 0–500 ms.
- `strip-before-webkit.png` / `strip-after-webkit.png` (+ `-grey`): WebKitGTK via ios-sim.py `--profile safari-expanded` (393x852, DPR 3,
  scaled 50 %), 200–1600 ms, same freeze. `strip-*-webkit-rm.png`: `--rm`, 300 ms.
- `*-chromium-frames.json`: per frame, how late the freeze timer ran (the frame is rewound to T regardless).

## What changed (choreography only)

- `rewards/fx.js`: one lane; a beat (what app.js asks for in one go) gets palette-order slots 200 ms apart as WAAPI delays; the HUD strip
  (bar, flame, level pulse, balance count-up, coin pop + shine) holds and catches up in its own 200 ms slot after the coins; the ribbon
  fades out last; drops / bursts / the banner wait for the lane and play their parts one at a time (no spinning rays, blinking bulbs or
  bobbing duck). Per-correct confetti = CSS sparks in the stars slot (the canvas-confetti library is rAF-driven and could not be held to
  one slot). html.fx-busy / fx-pick / fx-rest drive the chip.
- `rewards/rewards.css`: chip wiggle 2 runs then still, paused on fx-busy / fx-pick, none on fx-rest; HUD hold rules; HUD transitions
  200 ms; the overlay loops removed.
- `tests/blink.pw.mjs`: the sampler spec (run-all picks it up; it starts its own serve.py on a free port).

## Doubts

- "Next enters via g-next-in": g-next-in does not exist on main (it ships with T17b-1, not merged), and on main no Next lands on a right
  answer, so nothing here plays it. The "button" slot is the coins into the HUD strip. When T17b-1 lands, its Next should take the slot
  after the coins (or replace it) on this lane.
- The per-correct canvas confetti is gone (CSS sparks in its place, same colours). Tony's Oct 4 "confetti on every correct" may want a look.
- The balance number is held by an own-property `textContent` on `.rw-num` until the HUD slot (engine.js untouched); a bit clever.
- Reduced motion now shows the "+N XP" (one fade, ~1 s, then gone at once); main showed nothing.
