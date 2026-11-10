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

## Fail-if → verdict (re-run on the MERGED head, main cef5647 merged, Oct 12)

| Fail-if line | verdict | evidence |
|---|---|---|
| any answer type where Next does not cover the Check rect, or the card moves >0px (393x852 + 393x659, Chromium + WebKit smoke) | **PASS** | Chromium `next-cue.log` (merged head, 7 types x right/out x sugar/diet x 852/659: Check ⊂ Next ±1, h 48, right Δ ≤2, card Δ 0, scrollY Δ 0, focus on Next); WebKitGTK `webkit-after.log` 16/16 on the merged head (num, text, mc, multi x right/out x sugar/diet, 393x659 safari-expanded; scratch bank via `STEM_BANKS`, outside the repo) |
| blue Next face touches the green rim (no ring) on a sugar right row | **PASS** | `next-cue.log` sugar right: ring 3px, face 44, wash rgb(17,36,43); `webkit-after.log` sugar right `ring True` (4/4), diet/out `ring False`; `after-sugar-mc-right-852.png` |
| ▶ on any non-filled button, or the nav Next loses its chevron | **PASS** | `next-cue.log` + `webkit-after.log`: every `#i-tri` inside `.nx` (tri = 1), `#qnext use` = `#i-next` in all cases |
| chip label wraps/truncates at 393px, shows in DIET, or pays XP | **PASS** | `next-cue.log` chip steps (one line, 48 tall, inside the gutter; XP + rewards storage unchanged on tap; diet: no chip/duck/nod); `after-sugar-chip-mc-right-852.png`, `after-sugar-chip-mc-out-852.png` ("Ask Cluck"), `chip-sugar-vs-diet.png` |
| two animation groups at once after Check (20ms sampling), or any motion under reduced motion besides the fade | **PASS** on non-reward questions + diet; reward drop = **B2** | `next-cue.log`: peak ≤1 moving group (g-next-in only) in every non-reward case; reduced motion sugar+diet num/mc/multi: only `g-next-fade`. The full run's first pass caught, on the sugar reward question PHYS_WNM, a random reward drop (rewards/fx.js `.fx-ov fx-slots-ov`, opacity 0→1 180ms, no transform) = live reward FX = B2, out of scope (fx.js untouchable). The test now keeps `.fx-ov` animations apart and asserts they are opacity-only under reduced motion |
| an untried mc row is not dimmed after out of tries; any reveal | **PASS** | mc out: untried rows opacity 0.5, no `.opt.right`; no out-of-tries line; `done.pw` / `choose-all.pw` / `ux-flows` #14 assert no reveal; `after-diet-mc-out-852.png` |
| tests/run-all.sh not RUN_RC=0; the diff touches rewards mechanism, banks/, or serve.py grading | **PASS** | `tests.log`: full `tests/run-all.sh` (not --quick) on the final head, 36/36 ok, ALL GREEN, **RUN_RC=0**. Earlier pass on the merge (under parallel WebKit load) went red on choose-all-spam + try-tries (both green alone, timing) and next-cue (red twice: the random reward drop under reduced motion, see above, fixed in the test) and hit the 1500s timeout (RUN_RC=124) before ux-flows. `git diff origin/main --stat`: app.css, app.js, index.html, design/STYLE.md, 2 duck webp, 7 tests, this folder; no banks/, serve.py, rewards/engine.js or fx.js |

impeccable (`tools/impeccable.sh http://127.0.0.1:8931 index.html -- app.css index.html`, local serve.py): **rc 0**; live 390x844 / 1920x1080 / 2560x1440 / 3840x2160: 0 findings; static: 0 anti-patterns, 1 advisory same as main (repeating-stripes in index.html). `impeccable.log`.

## Greyscale gate (STYLE §7 item 16)

Twins: every `after-*.png`, `before-after-*.png`, `chip-sugar-vs-diet.png`, `webkit-before-after-659.png` has a `*-grey.png` (PIL `ImageOps.grayscale`, same pixels: the 393x852 / 393x659 viewports @2x). Added colour + grey for the states the first set missed: `after-sugar-chip-mc-out-852` ("Ask Cluck"), `after-sugar-chip-num-out-852`, `after-sugar-mc-out-659`, `after-sugar-multi-out-659`.
States read without hue: right = filled check badge / check in the box + brighter rim (grey 169 vs idle rim 125); out of tries = lock icon (num) or dashed struck rows with an x badge (mc); untried rows after out = .5 dim (grey 126 text vs 236 live); Next = the one light filled plate with a dark "Next ▶" label; chip right vs out = different text + duck pose (nod vs shrug).
Contrast measured on the grey PNG pixels (WCAG formula on the grey value): Next label 8.44:1, Next face vs ring / row 8.44:1 / 7.43:1 (out row 7.92:1); right rim vs page 8.10:1, idle rim 4.62:1; check badge vs row 7.01:1; chip label ("Compare with Cluck's steps" and "Ask Cluck") 13.47:1, chip border 4.62:1; live row text 13.47:1; stem text 14.58:1. **PASS**.
Note (not changed by this PR, same numbers in colour): the inactive rows after out of tries keep main's styles: dimmed untried row text 4.33:1 (colour 4.32), struck wrong row text 2.80:1 (colour 2.81). They are disabled controls (WCAG 1.4.3 exempts inactive components) and Scope 6 says keep the .5 dim; flagged for Tony, not a hue-only issue.


## Audit of the 6 edited existing tests (merged head, vs origin/main cef5647)

- `choose-all.pw.mjs`: "comes back around" presence → absence of the whole out-of-tries line (Scope 7 / Q13 removes it). Strengthened in the audit: also no right row revealed, and the labelled Next must take the Check row whenever the list is on.
- `disabled.pw.mjs`: `waitFb` also accepts `#q.closed` (a wait, not an assert): the last wrong try no longer prints a `#fb .verdict` line; every dead-control assert is unchanged.
- `done.pw.mjs`: 4 x "comes back around" presence → absence of `Out of tries|comes back around` (Q13); the lock icon, read-only, no-reveal asserts all kept. Strengthened: a reopened out-of-tries MC must show Next when the list is on. That assert caught a real bug (first page load of a closed upload question: `#qnav` came on after `paint()`, so no Next) → fixed in app.js (`load`: still Next after `drill:problem`).
- `easy.pw.mjs`: merged with #126's wait-for-question-open fix (auto-merge, both kept); the T17b-1 line waits for the duck chip "Ask Cluck" with `aria-expanded=true` instead of the old "Hide Cluck's steps" chip text (Scope 4 renames the chip); same strength (sheet open, no focus taken, text shows).
- `rewards.pw.mjs`: "right pick pulses" → "closing right pick does NOT pulse" (Scope 5: only Next moves after Check); the wrong-pick shake and the reduced-motion "nothing moves" asserts kept. Spec, not weakening: the old positive is now a must-not.
- (own spec) `next-cue.pw.mjs` reduced-motion step: reward-drop overlay animations (`.fx-ov`, rewards/fx.js, random, B2) are kept apart and must be opacity-only; every other animation must still be `g-next-fade` only.
- `ux-flows.pw.mjs` #14: the wait on the out-of-tries sentence → closed + no live row + asserts no out-of-tries line and no `.opt.right` reveal (stricter than before).

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
