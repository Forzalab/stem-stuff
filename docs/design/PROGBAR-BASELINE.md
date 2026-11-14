# PROGBAR baseline (P1)

Characterization of the current progress HUD, written before the v9d notch bar (brain `ui-polish/PORT-ARCH.md` §D2, `topbar-v9/SPEC.md`) replaces it. These specs pin what the code does today. A later PR (P2 to P6) that changes one of these on purpose edits the matching line here and in the spec. No product code was changed by P1.

Spec: `tests/progbar-baseline.pw.mjs` (own serve.py, throwaway bank `BANK_PB1`, `STEM_TODAY=2026-10-23`, sugar, Chromium). Run: `node tests/progbar-baseline.pw.mjs [port]`. It is also scheduled by `tests/run-all.sh` as `progbar-baseline`.

| Spec step | Pins (today) | Retired or ported by |
|---|---|---|
| HUD DOM | `div#rwHud.rw-hud.rw-skin` (role=group) sits right before `#qlist`; children in order `.rw-coin#rwCoin`, `.rw-lvl` (star `b`, `.rw-bar i`, `.rw-to`), `.rw-streak`, `.rw-counts`, `button.rw-tap[popovertarget=rwPop]`; zeros at rest (`0`, level `1`, `80 XP to level 2`, `exam 0 · easy 0`, `rw-z-xp rw-z-st`); `#rwPop[popover][role=dialog]` under body; spoken `aria-label` | P6 (HUD off under `html.ui-v7`) |
| record() | each graded wrong / right fires one `drill:answer` with detail keys exactly `code, right, ms` (no `c / part / grade / triesLeft` yet: IMPACT seam S1); the try is pushed to `S.tries`; a wrong with a try left pays a silent +1 XP, the try-2 right pays 6 (state XP 7), HUD number, streak, flame and `exam N` follow | P4 (feed) widens the detail; XP rules stay |
| finish() | a right: `#q.closed.solved`, options `disabled` + `aria-disabled`, `.send` hidden, Next cue (`.nx`) present, `state.finished`; a wrong with a try left: none of that; out of tries: `closed` without `solved` | P4 reads it, unchanged |
| settle() | a multi finishes only when every part is shut and pays once (`real` 1); all right: `solved`, `#fb` empty; a part out of tries: `#fb` = "1 of 2 right.", `closed`, not `solved` (the class follows the last try) | P4 reads it, unchanged |
| stage toasts | the start line "Ready when you are." once per bank at 0 done (anchor and clear from `Rewards.config`: `toastAt` fn, `toastClear` `#fb`); crossing a quarter toasts that landmark ("1 question done. Quack on!") and matches `Rewards.state().stage`; the toast fires from `render()` only while `#rwHud` is in the page (remove the node and no toast comes: IMPACT R2) | P2 pulls `stageToasts` out of the render() guard; P6 turns stage toasts off (INTEG 2) |

Not pinned here (already covered by `rewards.pw.mjs`, `toast-note.pw.mjs`, `blink-fx.pw.mjs`): HUD layout at widths, popover geometry, FX nodes, level-up overlay, onboarding tips, landmark toast geometry. Those specs are the ~7 retired in P6.

Open findings from the INTEG run that this baseline does not settle: B7 (bar ~85 px low on the desktop proof page), B11 (`Cannot read properties of null (reading 'hidden')` on some question changes, also with the flag off).
