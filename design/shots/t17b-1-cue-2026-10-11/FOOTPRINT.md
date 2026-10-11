# T17b-1 DEFAULT CUE: footprint (WIP, stopped by the coordinator)

Branch `claude/t17b-mocks-pr-121-o59udc`, reset to origin/main 2febaba (#121 included). The remote branch did not exist (`git fetch` said "couldn't find remote ref"), so it was made locally from origin/main.
State: **reading and design done. No product code written. No test written. No shots.** This file is the only change.

## DONE
- Spec read: queue entry 20261011-T17b-1 (+ SPLIT line, Q6/B2/Q7), r5/B/README §R2 final + §R3, cue3.html (full CSS/JS), R/review-2 Part 2 + Picks, research/why-next Q2/Q3, BRIEF, palette §2-4, §7b, §9, tonight index L2, A1 audit (`brain/projects/calc/_files/research-2026-10-10/A1-answer-types-audit.md`).
- Live code read: app.js 500-1600, 2130-2215; app.css 180-420, 490-515; nav.js; index.html sprite + nav.
- `cd tests && npm ci` done. Server test run on port 8900 (killed by PID).

## Scope 1-7: status = NOT BUILT. Plan (decided, ready to code)

1. **Next in the Check slot.** One helper in app.js, called from `finish()` (app.js:1095). Carrier = the slot of the last try: `S.tries.at(-1)`: mc → `.ch[data-id=t.c]`; multi → `partEls(t.part).box`; pick-all → `#q .chk`; else `#ff`. Insert `<button class="nx" data-act="next" aria-label="Next question"><span class="nf"><span>Next</span>▶</span></button>` after the hidden Check (`.send`/`#ansGo`/`#mcGo`), add class `cue` to the carrier. Click → `$("#qnext").click()` (nav.js go(1)). Render only when `!$("#qnav").hidden` (no list = no nav Next either). Focus → Next with `{ preventScroll: true }`. `keydown`: Enter with `e.repeat` → preventDefault. Live only: add `.g-next` (no animation on a restore: a `painting` flag set in `paint()` app.js:999 via try/finally).
   CSS (mirror cue3.html lines 117-138): `.nx` 96x48 (`calc(var(--btn)*2)`), absolute at the `.send` spot (`.ff .send` app.css:383, `.ch .send` :300), right-aligned so the 48px Check rect is inside it. Carrier padding: `.ff.cue { padding-right: calc(var(--btn)*3 + var(--bw-up)) }`, `.ff.cue .vk { right: calc(var(--btn)*2 + var(--bw-up)) }` (verdict icon moves left of Next); `.ch.cue .opt` padding-right `calc(var(--btn)*2 + 8px)` (wrong row: minus --bw-up).
2. **Fix A (sugar right row/box only):** `html.sugar` + right carrier: wash `color-mix(in srgb, var(--ok) 10%, var(--paper))`, 2px `--ok` rim (take 1px from padding, --bw-up), `.nx { padding: 2px }` `.nf { border-radius: 6px; box-shadow: 0 0 0 3px var(--field) }` (44 face). `html.sugar .ch :is(.send, .nx) { right: 6px }` (Check moves 4px too; diet stays 2px). Diet: no wash, no ring.
3. **Icon:** new sprite symbol `i-tri` in index.html (`M8 5.5v13l10.5-6.5z`, fill+stroke currentColor, round join), 20px, only inside `.nx`. `#qnext` keeps `i-next` (do not touch nav).
4. **Duck chip (sugar only):** reuse the wish flow. Factor the wish object literal in `wishOnWrong()` (app.js:1161) into one `newWish()`; on finish in sugar with `S.prob.wish` and no wish yet, create it unstarted. In `wishPaint()` (app.js:1286): when `S.finished`, render `.cue-chip` (`--sheet`, 1px `--edge`, 8px radius, 48 tall, `--ink` 700 `--t-sm`, `white-space: nowrap`), 48px `<img>` duck (`calm-nod` right / `out-shrug` out, 128 webp), label "Compare with Cluck's steps" (S.solved / right) or "Ask Cluck"; no `rw-wiggle`; same click handler (wishRetry → clOpen("explain")); place it right after `#q` (`$("#q").after(el)`), else after `#fb` as today. No XP: the handler never calls the rewards engine (do not touch rewards/). Duck files: copy `brain/.../r5/ducks/noborder/web/duck-{calm-nod,out-shrug}-128.webp` next to where the current icons live (check `rewards/icons/`; the chip duck today is the sprite `i-duck`, so `rewards/icons/` is the closest served asset folder; also add them to sw.js cache list if it lists icons).
   Calm nod: `.g-nod` on the calm-nod img (keyframes palette §9, 360ms, delay 320ms) gated by BRIEF rule 4 (first 3 rights of the PT day, then 1 in 3, never twice in a row, always on a first-try right after a miss); small localStorage record `{day, n, last, miss}` wrapped in try/catch. Not in rewards/engine.js (engine has no nod; checked).
5. **Motion token** in app.css: `--d-fast 120ms; --d-move 200ms`, `@keyframes g-next-in / g-next-fade / g-nod` exactly as palette §9; reduced motion → g-next-fade only, nod none. Also drop the live `.opt.pop` / last `.opt.jolt` on the closing pick (app.js:789, :791 `nudge`), else 2 groups overlap at 120-280ms (the mock drops them too). Sugar reward FX (rewardShow) overlap = B2, out of scope: test one-blink on non-reward questions (no wish/snack) + diet, and note B2.
6. **A1 bugs:** (a) dim carve-out: app.css:356 → `.q.closed:not(:has(.opt.right)) .opt, .q.closed .ff:not(.cue) { opacity: .5 }`, `.ff.shut:not(.cue)` (:403), `.q.closed .chk:not(.cue) { display: none }` (:319); out-of-tries carrier box: `:is(input,.lead)` color `--muted` instead of the dim. mc untried rows keep .5. (b) doneExit (app.js:982-992): do not blur when the active element is `.nx`; drop the `scrollTo({top:0})` (only ran with qnav-on, where Next now sits in the slot). (c) FAB over the 4th multi box: add `#q .nx` to fabPlace's `ctl` list (app.js:2160) and re-run `fabPlace({ avoid: true })` after the cue lands (not yet reproduced; repro: CSCI26_T2C at 393x852). (d) STYLE.md "Answer box" state table: right/out rows = verdict icon left of the slot, labelled Next ▶ in the slot.
7. Remove the "Out of tries for now…" line in `feedback()` (app.js:1113-1114) and in `settle()` (app.js:932, keep "k of n right."). `verdictWords` (sr) keeps the words. No reveal.

## Fail-if: all NOT RUN (nothing built)

## LEFT (next steps)
1. Build items 1-7 above (app.js, app.css, index.html sprite, STYLE.md, 2 duck files).
2. `tests/next-cue.pw.mjs` (pattern: tests/fab.pw.mjs — `page.route("**/p/CODE.json")` + route `**/check` for deterministic verdicts; takes BASE + shotDir, so run-all picks it up with no wiring change). Codes on main: num CALC1_T6B, text CSCI26_Q8C, mc CALC1_X2P / CSCI26_TF3, multi-4 CSCI26_T2C, pick-all CSCI26_A7K; expr only via a routed fixture. Check: Check rect ⊂ Next ±1, h 48, right Δ≤2, card-top Δ 0 (393x852, 393x659), ring present sugar right, ▶ only in `.nx`, `#qnext` uses `#i-next`, chip one line + sugar only + `Rewards` XP unchanged on tap, `document.getAnimations()` active ≤1 every 20ms for 1.2s, rm = g-next-fade only, mc untried opacity .5 after out, no `.opt.right` on out.
3. Existing tests that may pin the old cue: grep tests for "Out of tries for now", `.send` hidden after finish, doneExit scroll (ux-flows, done, flow, rewards, easy).
4. Shots + WebKit + README per brief; `bash tests/run-all.sh` with `/tmp/claude-0/venv-sympy/bin` first on PATH.

## Resume
- Server: `STEM_TRIES=<scratch>/tries.json OPENROUTER_API_KEY= PATH=/tmp/claude-0/venv-sympy/bin:$PATH python serve.py 8900 &` (ports 8900-8909; kill only your `$!`). Note: two other serve.py were running (PIDs 2215, 30032): not ours, leave them.
- WebKit: `timeout 200 xvfb-run -a -s "-screen 0 1280x2700x24" /usr/bin/python3.12 -I /home/claude/brain/_files/webkit-shot/ios-sim.py '<url>' out.png --profile safari-expanded --fresh --wait 3000` (install not checked yet).
- Worktree note: the isolation hook refuses `sed` with variables and multi-step compound shells; use plain absolute paths, one command per call.

## Decisions the spec did not settle (made here, not yet coded)
- Next only when the nav list is on (`#qnav` visible); otherwise there is no Next target.
- Pick-all mc (#mcGo) gets the same Next (spec says "every answer type").
- Chip sits right after `#q` (above Key formulas and the hint card) when the question is closed; the tangerine chip keeps its place while tries are left.
- Out-of-tries sugar wash (mock R1) NOT built: scope item 2 names only the right wash.

## Last test results seen
None run on this branch.
