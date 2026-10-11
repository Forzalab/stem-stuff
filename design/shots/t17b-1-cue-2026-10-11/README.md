# 20261011-T17b-1 DEFAULT CUE: build + evidence

Branch `claude/t17b-mocks-pr-121-o59udc` (PR #123), on top of the footprint commit ffd6b19. Spec: queue 20261011-T17b-1 (Scope 1-7 + Fail-if), r5/B cue3.html R3 REC set, tonight index §L2.
Local `serve.py` only (sympy venv `/tmp/claude-0/t17b1-venv`). Nothing touched in banks/, serve.py or rewards/ mechanics (rewards/engine.js, fx.js, icons.js unchanged).

## What was built (Scope 1-7)

| # | item | where |
|---|---|---|
| 1 | Labelled **Next** (96x48) lands in the Check slot of the last try for every answer type: num, text, expr (the `#ff` box), multi (the last part's box), mc (the row's own arrow slot), mc pills (2-choice row), pick all (the Check row). Check rect inside Next, right edges flush, nothing scrolls. Focus → Next (`preventScroll`); a held Enter (`e.repeat`) never presses it. Restores (reload) show it still, no motion, no focus steal. Click = the nav bar's Next (`#qnext`, nav.js `go(1)`) | app.js `cueNext`, `cueCarrier`, `finish`; app.css "T17b-1 DEFAULT CUE" block |
| 2 | Fix A (sugar right row/box only): 10% `--ok` wash (#11242b), 2px `--ok` rim, 3px `--field` ring round a 44px face; sugar mc slot 4px in (Check moves too). Diet: no wash, no ring | app.css `html.sugar ... .cue` rules |
| 3 | Filled ▶ `i-tri` only inside the filled Next; `#qnext` keeps the chevron `i-next` | index.html sprite |
| 4 | Duck chip (sugar + questions with Cluck's key): right = "Compare with Cluck's steps" (calm-nod 48px), out = "Ask Cluck" (out-shrug 48px), `--sheet` chip, 48 tall, one line, right under the answer. Opens Cluck like the old chip; the handler never touches rewards (no XP). Calm nod `g-nod` gated by BRIEF rule 4 (first 3 rights of the PT day, then 1 in 3, never twice in a row, always on a first-try right after a miss; `localStorage stem-nod`), starts at 320ms = after Next has landed. Diet: none | app.js `cueChip`, `nodGate`, `wishPaint`; `rewards/icons/duck-{calm-nod,out-shrug}-128.webp` (copied from r5/ducks/noborder/web) |
| 5 | Motion token `--d-fast 120ms / --d-move 200ms`, `g-next-in` (200ms, 120ms delay, 1 iteration), reduced motion = `g-next-fade` only, nod none. The closing pick's `.opt.pop` / last `.opt.jolt` and the lock-in dim / colour tweens on close are dropped so only one thing moves after Check | app.css, app.js `submitMC` / `submitAll` |
| 6 | A1: (a) dim carve-out: the box carrying Next is not dimmed (out of tries its text goes `--muted`); untried mc rows keep the .5 dim (app.css `.q.closed:not(:has(.opt.right)) .opt` untouched); (b) doneExit: no blur off Next, no scroll to top; (c) Open notes: `#q .nx` + the chip are in fabPlace's avoid list, re-placed after the cue lands; (d) STYLE.md answer-box table + Next note | app.js, app.css, design/STYLE.md |
| 7 | No out-of-tries line (feedback + multi settle; settle keeps "k of n right."; the screen reader still hears "Out of tries."), no reveal | app.js |

Extra (needed for "card moves 0px", found by the WebKit smoke): on the closing try the try pips and the math preview hide but keep their room (`.pips.spent`, `.preview.spent`), so a scrolled region never clamps and the card stays put.

## Decisions taken (the 5 open ones, REC each time)

1. **Next only when the question list is on** (`#qnav` visible = a bank or an upload); no list = no Next target, so no Next (a bare direct link keeps today's look).
2. **Pick-all gets the same Next** in its Check row (spec says every answer type).
3. **Chip right after `#q`** (above Key formulas and the hint card) once the question is closed; while tries are left the tangerine chip keeps its old place.
4. **No sugar out-of-tries wash** (mock R1): scope item 2 names only the right wash; out of tries = struck rows/box + Next.
5. **mc pills (2-choice)**: the selected pill reserves Next's 96px room from the start (so its Check rect is where Next lands), the right pill's check badge hides under Next's slot (green rim says it). Plus: the ring is a `--field` plate (`.nx::before`), not a box-shadow/outline, because STYLE §2.6/§2.7 tests reserve those; duck files live in `rewards/icons/` (served, not in the generated icons.js).

## Fail-if → verdict

| Fail-if line | verdict | evidence |
|---|---|---|
| any answer type where Next does not cover the Check rect, or the card moves >0px (393x852 + 393x659, Chromium + WebKit smoke) | **PASS** | Chromium: `next-cue.log` (7 types x right/out x sugar/diet x 852/659 = 56 cases: Check ⊂ Next ±1, h 48, right Δ ≤2, card Δ 0, scrollY Δ 0, focus on Next); WebKit: `webkit-after.log` 16/16 (num, text, mc, multi x right/out x sugar/diet, 393x659 safari-expanded), `webkit-before.log` 0/16 (main: no Next); boards `before-after-*.png`, `webkit-before-after-659.png` |
| blue Next face touches the green rim (no ring) on a sugar right row | **PASS** | `next-cue.log` sugar right: ring 3px rgb(10,19,34), face 44, wash rgb(17,36,43), rim 2px --ok; WebKit sugar right ring 3px (`webkit-after.log`); `after-sugar-mc-right-852.png`, `after-sugar-num-right-852.png` |
| ▶ on any non-filled button, or the nav Next loses its chevron | **PASS** | every `use[href="#i-tri"]` is inside `.nx`, `#qnext use` = `#i-next` (all 56 + 16 cases) |
| chip label wraps/truncates at 393px, shows in DIET, or pays XP | **PASS** | `next-cue.log` chip steps (num/mc/multi x right/out x 852/659): one line, inside the 16px gutter, 48 tall, right label + duck; tap: `Rewards.state().xp` and the rewards localStorage unchanged, Cluck opens; diet: no chip / duck / nod / #wish. `chip-sugar-vs-diet.png`, `after-sugar-chip-mc-right-852.png` |
| two animation groups at once after Check (20ms sampling), or any motion under reduced motion besides the fade | **PASS** (non-reward questions + diet) | `next-cue.log`: on-screen moving elements sampled every 20ms from the verdict for 700ms, peak ≤1 in all 56 cases (g-next-in only); reduced motion sugar+diet num/mc/multi: only `g-next-fade`. Nod: delay ≥320ms, 1 iteration, after Next. Reward questions (wish/snack) still run the live reward FX = known **B2**, out of scope |
| an untried mc row is not dimmed after out of tries; any reveal | **PASS** | mc out: untried rows opacity 0.5, no `.opt.right` (all mc-out cases); no out-of-tries line in #fb anywhere; ux-flows #14, done.pw updated to assert the same |
| tests/run-all.sh not RUN_RC=0; the diff touches rewards mechanism, banks/, or serve.py grading | see `tests.log` | `tests.log` (full run, `npm ci` done); `git diff --stat`: app.js, app.css, index.html, design/STYLE.md, 2 duck webp in rewards/icons (assets only), tests (new next-cue.pw.mjs; 6 tests that pinned the removed line / the dropped pulse updated) |

impeccable static (app.css + index.html): 0 anti-patterns, the same 1 advisory as main (repeating-stripes in index.html).

## Known / not done

- B2 (live sugar reward FX = many groups at once on reward questions) untouched, as scoped.
- Open notes at 393x659 multi still takes the live fabPlace fallback over the last part's prompt text (not over a box or Next); the 46-state "Open notes over the stem at 659" product issue from r5/B R3 stays open.
- WebKitGTK smoke used a scratch bank on a scratch copy of the site (`webkit-smoke.py`, port 8905), since page.route fixtures do not exist there. WebKitGTK keeps cookies across `--fresh`, so each run sets its mode through the app's own `SUGAR_` / `DIET_` entry.
- sw.js not changed: the two webp ducks are fetched from the network (the shell regex has no webp); offline the chip shows without its duck.

## FOOTPRINT (handover to main, Sun Oct 11 07:4x PT)
- Build agent died mid-README (API session limit). Released to main per batch7 brief; alt does not touch #123 again.
- Done: Scope 1–7 code (11 files), `tests/next-cue.pw.mjs` (56 Chromium cases pass), WebKit smoke 16/16 (`webkit-after.log`), boards above.
- Left: (1) FULL `tests/run-all.sh` NOT run on this commit → `tests.log` missing; 6 existing .pw tests were edited (choose-all, disabled, done, easy, rewards, ux-flows) — verify each edit only follows the new spec, no weakened assert. (2) Retitle PR #123 (drop WIP) + body. (3) CI `all` on this head. (4) Owner eye on `before-after-*.png` + `chip-sugar-vs-diet.png`.
- Last test runs seen: `next-cue.log` "all next-cue checks passed"; `webkit-after.log` "16/16 WebKit cases pass". Nothing else.
- Note (20261011-M1): `.pad-fab` (Open notes) must stay the 10px squircle; check the shots.
