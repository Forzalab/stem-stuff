# UI audit B: the question screen across question kinds (2026-10-08)

Read-only. No app code changed. Local `python3 serve.py 8841` (throwaway `STEM_TRIES`), Chromium via Playwright, sugar mode (default), onboarding skipped.
Method: `B-measure.mjs` (same folder) opens each kind from the real bank (`/p/<code>.json`, real `/check` grading), drives it through
idle / ready (typed or picked, not sent) / wrong (1st try) / right (1st try) / out (two wrong), and records `getBoundingClientRect` + `getComputedStyle`
at 393x852 (touch, dsf 2) and 1280x800 (mouse, dsf 1). Every number below comes from that run. Shots: `design/shots/ui-audit-b-2026-10-08/<kind>-<state>-<393|1280>.png`.

Kinds and codes: mc5 `CALC1_X2P` (5 choices), mc3 `CSCI26_TFM`, mc2 `CSCI26_TF3` (2 choices, one try), all = choose-all `CSCI26_A7K`,
num `CALC1_T6B`, numhow `CSCI26_Z6N` (num with a `how` line), text `CSCI26_Q8C`, multi `CSCI26_M5V`; figures: fig-scene `PHYS_F3N`, fig-cart `CALC1_A9R`,
fig-mc5 `CSCI26_C2A` and fig-mc2 `CSCI26_F5A` (circuit), fig-multi `CSCI26_T2C`; snack = `PHYS_F3N` stubbed with `page.route('**/p/PHYS_F3N.json')` (`snack:true`,
`original.body`, mass 4.0 -> 2.0 kg; the repo bank has no snack, so this is a stub; the answer is unchanged so the server still grades it).

Not covered (other auditors): wish chip, snack card ("Similar solution steps"), rewards HUD and slot animation (all visible in `snack-*` and some `*-right` shots, ignore them), Key formulas, brainrot, notes pad, toasts.
Not measured: Prev/Next (`#qnext`, index.html:161) exist only with a question list; with a single code they are hidden (0x0 in the data), so "next" has no position to compare here.
Shots of `*-ready-*` have the pointer parked on the picked row (see finding 2). Idle and wrong/right of one kind come from separate browser contexts, so a shuffled choice order can differ between them (e.g. fig-mc2).

Token reminders (app.css:2-20): `--t-md` 18px / 19px at >=700px with a mouse (:884), `--t-sm` 16 / 17, `--t-xs` 14 / 15, `--btn` 48 / 50 (:20, :885), `--fld` = `--btn`+4 (52 / 54). Gutter 16 / 20.

## 1. Table: kind x property (phone 393 | desktop 1280) -> rule -> shot

### Shared frame (all kinds)
| property | value 393 | value 1280 | rule | shot |
|---|---|---|---|---|
| question card padding L/R, radius, bg | 16px, 10px, `--qbox` | 20px, 10px, `--qbox` | app.css:226 `.p`; phone override :666 | `num-idle-393.png`, `num-idle-1280.png` |
| card title (`.ptitle`) | 16px / 700 / ink | 17 / 700 / ink | :352 | same |
| problem text (`.md`) | 18px, line-height 27.9 | 19px, 29.45 | body font :40 (`--t-md`, `--lh` 1.55) | same |
| card bottom -> first control | 12px | 12px | :251 `.q{margin-top:--s3}` | same |
| `how` line | 16px muted, 8px above the control, x = 16 | 17px muted, x = 20 | :351 | `numhow-idle-393.png`, `all-idle-393.png` |
| answer typeface | choices: sans 18; freeform: Atkinson Mono 18 | sans 19; mono 19 | :336-339 `.ff input` | `mc5-idle-393.png`, `num-idle-393.png` |
| control surface | choice row `--sheet`, freeform box `--field`; both 1px `--edge`, radius 8 | same | :254-258, :329-332 | same |
| submit size | 48x48 `btn-go` (c1) | 50x50 | :175 `.btn`, :186 | `num-idle-*`, `all-idle-*` |
| verdict words | none on the page for right/wrong; only "Out of tries..." (18/19px, muted, 400) | same | app.js:1075 `feedback()`, css:407 | `num-out-393.png` |

### Per kind
| kind | control height | control width | submit: label (aria), where, state before input | picked / typed (ready) | wrong (1st try) | right | out of tries |
|---|---|---|---|---|---|---|---|
| mc5 | row 52 min (:254); 54 with KaTeX (:261+ default `.katex` 1.21em), 62 with a fraction; gap 8 (:252); badge 36px circle, letter 18 | full card width 361 / 604 | "Check B" (app.js:532); 48px arrow inside the picked row, right 2px (:290); hidden until a row is picked | picked row `--raised`, badge c1; others fade to .35 (:273); arrow appears | picked row 2px dashed `--bad`, text struck, badge x (:277-279); one pip pair 10px, right-aligned under the list (:311-314); Cluck hint box full width below (107.7px high phone, 82.9 desktop) | row border `--ok`, badge green check, other rows stay opacity 1 (:280, :346) | all rows opacity .5, wrong ones dashed; lock line, then hint (`mc5-out-393.png`) |
| mc3 | pills, h 52 / 54, text nowrap, no letter badge (:320-327) | 3 pills share the row, 84-146px (phone) | same arrow as mc5; pill gets `padding-right: --btn+8` when picked (:326) so the row reflows | widths 84.6 / 131.6 / 128.8 (ready) vs 99.3 / 146.3 / 99.4 (after wrong) | wrong pill dashed bad; pips + hint below | green border, check at right | rows .5 |
| mc2 | pills, h 52 / 54 | 2 pills, 151-202px | same; ONE try so no pips | arrow in picked pill | wrong pill dashed + struck, the other pill dims to .5 (closed, :346), lock line + hint | picked pill green, other stays 1 | n/a (one try) |
| all (choose-all) | row 52 / 54, square 24px checkbox badge + 16px muted letter (:293-298) | full width | "Check" (app.js:535), 48px arrow in its own row under the list, right edge flush (inset 0), enabled even with nothing ticked (app.js:734), opacity 1 | tick fills badge; no dimming of others | struck row dashed bad, ticks stay; pips left of Check (in `.chk`); hint in the Check row on desktop (506px wide) but below on phone (361x79.8, app.js:1075 `inRow`, `pad-off`) | every ticked-right row green | rows .5 |
| num (no how) | box 52 / 54 | full 361 / 604 | "Check answer" (app.js:558); 48px arrow inside the box, 2px from right and top (:373); VISIBLE but disabled at opacity .45 until typed (:189) | blue focus border (:334), mono text, math preview line under it | box 2px dashed bad, arrow replaced by red x (:389-390), pips right-aligned under the box (:314), hint below | box green border + green mono text + check, whole box opacity .5 (:346) | box .5 with lock icon, lock line, hint |
| numhow | as num, plus how line above (8px) | same | same; placeholder still "Like 9/2, sqrt(3), dne" (app.js:554) | same | same | same | same |
| text | as num | same | same arrow; placeholder empty (app.js:554 only sets one for num/expr) | no preview line (not mathy) | same as num | same as num | same |
| multi | one box per part, 52 / 54; whole question + boxes fused in one card (`.boxed`, :397-398) so card -> first row gap is 4px, radius 10 10 0 0 | phone 281 (under "a)" text); desktop 256 = fixed 16rem (:383) | "Check a)" (app.js:547); arrow inside each box, HIDDEN until text (not dimmed like num) | each box focuses blue | box dashed bad + red x; pips (32x10) land in the narrow "a)" column LEFT of the box (finding 1); hint inside the part, 281 / 520 wide | box green, opacity .5 | box .5 + lock; "n of m right." + lock line in `#fb` |
| fig-scene (num) | as num | figure = card inner width 329 / 564, margin 8 (:242) | as num | | | | |
| fig-cart (num) | as num | 329 / 564 | as num | | | | |
| fig-mc5 / fig-mc2 / fig-multi | as mc5 / mc2 / multi | 329 / 564 | as the kind | | | | |
| snack (num) | as num | as num | as num; + "Changed: 4.0 -> 2.0 kg" chip 14 / 15px muted, 12px below the title (:356) | | | | |

Shots per cell: `<kind>-ready-<vp>.png`, `<kind>-wrong-<vp>.png`, `<kind>-right-<vp>.png`, `<kind>-out-<vp>.png` (mc2 and fig-mc2 have no `out`: one try).
Figure heights come from `graph.js`: scene `min(320, 0.9*W)` fit, drawn at most 560 wide (:333); cartesian `clamp(240, 0.72*W, 420)` (:354); circuit content-driven. Measured: scene 218 phone / 320 desktop, cartesian 240 / 406, circuit 128-184 (`fig-scene-idle-*`, `fig-cart-idle-*`, `fig-mc5-idle-*`, `fig-mc2-idle-*`). Figure labels are fixed 16px, ticks 14px (css:246-248) while question text is 18 / 19, so labels do not follow `--t-md`.

## 2. Differences that look unintended, ranked

1. **Multi: the try pips land in the wrong place.** After a wrong part the pips (32x10 at x=36, y=185 phone; x=40 desktop) sit in the "a)" marker column, left of the box, instead of right-aligned under it like every other kind (num pips: 361x10 under the box, `.ff + .pips` :314). Cause: `pips(r, box, "afterend")` (app.js:893, :981) drops the span into the `.part` grid (:362-368), which has no area for it, so auto-placement uses the first free cell. Shots: `multi-wrong-393.png`, `multi-wrong-1280.png`, `fig-multi-wrong-393.png` (compare `num-wrong-393.png`).
2. **A picked row loses its blue border while the pointer is on it.** `.opt:hover:not(:disabled)` (css:260, specificity 0,3,0) beats `.opt[aria-checked="true"]` (:269, 0,2,0). Measured on the same row: pointer on = `rgb(162,179,203)` (`--muted`), pointer away = `rgb(122,184,255)` (`--c1`). On touch the tap leaves :hover stuck, so a phone shows the grey one after tapping. Shots: `mc5-ready-1280.png`, `mc5-ready-393.png`, `all-ready-393.png` (grey) vs `mc3-ready-393.png` (blue, pointer elsewhere).
3. **"Right" is dimmed for typed answers but not for choices.** Right freeform and multi boxes get opacity .5 (`.q.closed .ff`, css:346, comment says Tony Oct 2), a right MC / choose-all row stays at 1 (same rule, `:not(:has(.opt.right))`). The correct answer looks weaker on num/text/multi than on mc. Shots: `num-right-393.png`, `multi-right-393.png` vs `mc5-right-393.png`, `all-right-393.png`.
4. **Three different "not ready to send" treatments for the same arrow.** single pick and multi: hidden until a pick / text (app.js:532, :547); freeform: visible, disabled, opacity .45 (css:189, app.js:809); choose-all: visible and enabled with nothing ticked, opacity 1 (app.js:734). Shots: `mc5-idle-393.png`, `multi-idle-393.png`, `num-idle-393.png`, `all-idle-393.png`.
5. **Multi's text is 4px off the card text on phones.** `.boxed .q` pads 1.25rem = 20px (css:398) while the card pads 16px under 34rem (:666). `how` / "a)" start at x=36, title and problem text at x=32 (desktop both 40). Shots: `multi-idle-393.png` (vs `multi-idle-1280.png`). Also the card -> first row gap is 4px here vs 12px elsewhere (fused box, :397).
6. **Wrong-answer hint and pips sit in different places per kind and viewport.** mc / freeform: pips right under the control, hint below; choose-all: pips left of Check, hint beside Check on desktop (506px) but under it on phone (app.js:1075 `inRow`, css:305-308); multi: hint in the part column (281 / 520px wide). Shots: `all-wrong-1280.png` vs `all-wrong-393.png`, `num-wrong-393.png`, `multi-wrong-393.png`.
7. **Submit button position/inset differs.** Single pick: inside the row, 2px from the right (css:290); freeform / multi: inside the box 2px right and top (:373); choose-all: separate row, 0px from the right edge (:305), so its right edge is 2px further out than the others (329..377 vs 327..375 phone). Shots: `all-idle-393.png`, `num-idle-393.png`.
8. **Inline pills (mc2, mc3) resize when one is picked** (`padding-right: --btn+8` on the picked pill, css:326): mc3 phone widths 84.6 / 131.6 / 128.8 before the send vs 99.3 / 146.3 / 99.4 after. The row jumps under the finger. Shots: `mc3-ready-393.png`, `mc3-wrong-393.png`.
9. **Placeholder contradicts the `how` line.** num always gets "Like 9/2, sqrt(3), dne" (app.js:554) even when `how` says "A decimal, like .5" (`CSCI26_Z6N`); text gets none; multi parts none. Shot: `numhow-idle-393.png`, `text-idle-393.png`.
10. **Row height varies with content, not with the rule.** 52 (plain) / 54 (any KaTeX, default 1.21em) / 61.7 (fraction) on phone; choose-all rows 52 because its math is short. Same kind, rows of unequal height (`mc5-idle-393.png`: 54 / 54 / 54 / 61.7 / 54).
11. **Figure labels are fixed 16px (ticks 14px)** (css:246-248), not `--t-sm`/`--t-md`, so on desktop (19px text) the labels are smaller than the question. Shots: `fig-cart-idle-1280.png`, `fig-scene-idle-1280.png`.
12. **Multi box is a fixed 16rem on desktop** (css:383) while every other freeform box is full width: 256 vs 604. Probably deliberate (mockup multi-prompts); listed for completeness. `multi-idle-1280.png`, `num-idle-1280.png`.

Checked and consistent: card -> control gap 12 (not multi), `how` -> control 8, row gap 8, answer font sizes 18 / 19 in every kind, control heights 52 / 54 for choice rows and boxes, wrong border 2px dashed `--bad` everywhere, right border `--ok` everywhere, no horizontal overflow at either width (scrollWidth = viewport in all 164 states).

Candidate rule from B's view: one "closed + right" look (full-strength green) and one pips / not-ready-arrow placement for every kind, so only the control's shape differs.
