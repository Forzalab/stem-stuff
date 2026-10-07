# UI-UNIFY: the wrong-pick moment + the Redeem bonus (agent U, Oct 7 2026)

Pages (try/, no prod code): `try/genui-ui.html?v=1..3` (+ `&state=pick|wrong|right|right1|out`, `&rm=1`) and
`try/genui-redeem.html?v=1..3` (+ `&state=idle|right|wrong`, `&rm=1`). Files: `try/genui-{ui,redeem}.{html,css,js}`, `try/genui-kit.js`.
Shots: `design/shots/genui/ui-*`, `redeem-*`. Question used: PHYS_KWV (BANK_P2X), pick d = 80 J (forgot the ½), ghost from
`tests/visual-cases/kwv-d-good.json` drawn by the real `graph.js` (cartesian figure + `poly` ghost, dash patched to `8 5` in the page).

## 0. Audit pains on this surface: fixed in main already?

Checked `origin/main` @90da31b (PRs #83–#89) and the PR B/C/D branches. Not fixed in main: "No tries left. Ask Tony about" (app.js:906, :1086),
`.opt.wrong` red dashed + `line-through` (app.css:277–279), the "Cluck is writing…" chip that waits for the whole stream, the full-screen
phone sheet (app.css `html:not(.side) .cl`), "Tap here to write notes." (app.js:2078), POOF opener (serve.py:874). Fable A0-D3 proposes the
"Ask Tony" line fix on the queue branch; it has not landed. So every pain below is still live in prod; the pages show the fix.

| Pain (AUDIT-FRUSTRATED top 10) | On this surface? | Fixed here how |
|---|---|---|
| #1 "No tries left. Ask Tony" lock, loop never closed | yes | `state=out`: "Out of tries for now. This one comes back around." + L3 steps open + [Next] [Try a twin]; the right row is shown in `--ok` |
| #2 joke as Cluck's first line | yes | L1 = wise feedback / normalize, no joke, no QUACK, no value; the one joke sits on its own line in the affirm |
| #3 red X + line-through on her pick | yes | `.opt.mine`: 1px dashed `--edge`, dashed badge, quiet "your pick"; no red, no strike, no X anywhere |
| #4 15 s "writing…" + 35 cps typewriter | yes | first sentence renders at once (≤140 ms per sentence, whole sentences, no typewriter); the visual slot is reserved so nothing reflows |
| #5 stem contradictions / "Use g" | no (bank text) | — |
| #6 sheet blocks Next; X at the screen edge | yes | partial sheet 45 svh (v1/v2), page scroll stays on, `.app` gets bottom room so Next scrolls above it; X is 44×44 inside the gutter, mid-screen (not a top corner); Close = peek bar, not gone |
| #7 notes tooltip / FAB cover option E | no (not mocked) | nothing floats over a choice in any variant |
| #8 text walls | partly | Cluck: ≤2 sentences before the visual; steps folded (≤4, one plain line + one display equation) |
| #9 near-repeats | no (queue) | Redeem page names the return ("This one came back.") so a repeat reads as intended |
| #10 QUACK-first hints, "verify b4 use lol", "Explain my mistake" | yes | QUACK only in the affirm's joke line; disclaimer once: "Cluck can slip. Check the key. Keep private stuff out of the chat."; no "mistake" label anywhere |
| hon. silent first-try win (S32) | yes | `state=right1`: affirm line praises the strategy ("You split it into a box and a triangle…") + thumbnail |

## 1. Variants: genui-ui

All three: same card, same choices, same L1 text, same steps, same affirm. They differ on where Cluck lives, where the ghost lands, and
how "I'm sure" works. The bet rides on the FIRST pick only (Fable A1). **Deviation from D53 for Tony:** D53's double-or-nothing on the retry is
not built; the retry is always free ("The retry is free." replaces the odds line after a miss).

| | v1 Partial sheet + bet | v2 Ante: coins on the table | v3 Inline Cluck + thumb strip |
|---|---|---|---|
| Pick | select, then Check (prod's two-step) | one tap commits (no Check) | select, then Check |
| "I'm sure" | tick under the choices: "+2 if right · −1 if not" (the D52 small segment: "−1" muted beside the count, never red) | "Put 2 down" before the first pick: count drops 12→10 by HER tap; right = 4 back; wrong = "Those 2 stay on the table. The retry is free." Score never drops on the verdict | tick: "+2 if right", nothing on a miss |
| Ghost | on the question's own figure (RUNTIME A), figure scrolled to the top so it sits above the sheet | a copy of the figure (16rem) in the sheet's visual slot (RUNTIME B in a partial sheet) | on the question's own figure |
| Cluck | partial sheet `min(45svh, 420px)`, grab bar (expand), X → peek bar "Cluck: read it again" | same sheet | in-flow card under the choices; no X |
| Visual slot | chip `triangle = ½ b h` with ½ in `--mark` | figure copy, reserved 12rem | chip |
| Try again / Just tell me | in the sheet, right under the line+chip (lower half of the screen) | same | fixed strip at the bottom (thumb zone) |
| Desktop ≥720 | sheet docks bottom-right 26rem, column moves left | same | in flow |

Interaction path (all): pick d → L1 + ghost (0 extra taps) → Try again → pick c → affirm: thumbnail (60 J solid c2 + her dashed box) +
"You halved the triangle. That's the move on the exam." + joke line "QUACK. Triangles: the half-price boxes of physics." → Next turns filled.
"Just tell me" opens the steps with the boxed 60.0 J (L3) and keeps Try again, so the loop can still close on her own tap (§1 #5).

### Refactoring-UI checklist (per variant)

| Rule | v1 | v2 | v3 |
|---|---|---|---|
| Hierarchy by weight/colour before size | Cluck name `--ai` bold, line regular `--ai-text`, chip in tint; "your pick" in `--muted` | same + table text muted, pile in `--rw-sun` | same |
| One spacing scale | `--s1..--s7` only | ✓ | ✓ |
| De-emphasize to emphasize | other rows go `--muted` text (no 45% opacity), her row keeps ink | ✓ | ✓ |
| Fewer borders | sheet, card, chip: no borders; only controls have edges | table = fill, no border | ✓ |
| 44 px targets | all buttons ≥44 (tick, Check, strip, X 44×44, grab 24 px tall ✗ → the full-width bar is the target, see "needs real iOS") | ✓ | ✓ |
| Labels above controls | "Your notes" above the box; "Show the steps" is the control's own label | ✓ | ✓ |
| ≤2 type sizes per card | card: `--t-md` prose + `--t-sm` labels; Cluck: `--t-md` line + `--t-sm` labels | ✓ | ✓ |
| One primary action | Check, then Try again, then Next: one `--c1` fill at a time | ✓ | ✓ (strip's Try again) |
| Nothing interactive in top corners | ✓ (try-page bar is mockup chrome) | ✓ | ✓ |

### SHAME CHECK — v1
1. Her voice: "It drew my 80 as a dashed box on the same graph, and said my rectangle was right."
2. Banned: none. (The "−1" is the D52 small bet segment, muted, beside the count; the main count never animates down.)
3. Techniques: 1 (L1 "Tricky one…"), 4 (ghost "your 80 J" on her figure), 5 (Try again first), 7 (no extra tap to the aha), 8 (joke only in the affirm), 11 ("built to look like a full box" + "your rectangle is right").
4. Reopen tomorrow: yes; the miss felt like being shown something, and the right answer got a moment.
5. iPhone: 2 taps (pick + Check), ~0.3 s to ghost + first line (no LLM); mid Android same taps, est. ~0.6 s.

### SHAME CHECK — v2
1. Her voice: "I bet 2 and lost them, but they just sat there, and the retry didn't cost anything."
2. Banned: none; the loss is visible as coins left on the table, not a number dropping.
3. Techniques: 4 (figure copy with her box), 5 (free retry), 7 (one-tap pick), 9 (stake only on what she chose to risk), 11.
4. Reopen: likely if she likes the game; risk: the ante moment before reading may feel like pressure (Tony: test).
5. iPhone: 1 tap (one-tap commit) + ~0.3 s; ghost is in the sheet, so she looks down, not up.

### SHAME CHECK — v3
1. Her voice: "Cluck answered right under my answer and the buttons were under my thumb."
2. Banned: none.
3. Techniques: 1, 4, 5 (Try again fixed in the thumb zone), 6 (no sheet, nothing takes over), 8, 11.
4. Reopen: yes; nothing covers the question at all.
5. iPhone: 2 taps + ~0.3 s; the ghost is on the figure ABOVE the choices, so on a short phone it can be off-screen while she reads Cluck (weaker than v1's scroll-to-figure).

## 2. Variants: genui-redeem

Fixed +3, never random (D60). Wrong = no penalty: "No coins lost. It comes back later." / "Still yours." A Redeem is never lost (D61, §1 #9).
Burst = one "+3" in `--rw-sun`, opacity + ≤14 px rise, once; HUD coin pops twice (scale 1.12); `?rm=1` and reduced motion = the final still.

| | v1 Chip in the label row | v2 Line above the stem | v3 Coin beside Check |
|---|---|---|---|
| Idle | "↻ Redeem +3" pill beside "Question" | "Back from earlier. Get it now for +3." | coin + "+3 waiting" right of Check |
| Right | chip → "✓ Redeemed +3" (`--ok` icon), "+3" rises beside it, count +3 | line → "Redeemed. +3 coins."; "+3" lands on the row she tapped | coin pops, "+3 is yours", "+3" rises over it |
| Wrong | chip → "Comes back later" (muted) | "No coins lost. It comes back later." | "Still yours. Comes back later." |
| Cluck line | "This one came back. You've seen the half-box idea before." (C6.7) in all | | |
| Checklist | weight/colour only, pill is not a button, no border | one muted bold line, no box | sits with the one primary action |

### SHAME CHECK — redeem (v1 / v2 / v3)
1. Her voice: "It came back, I got it, +3. And when I missed it, it just said it'll come back."
2. Banned: none (no score drop, no red, no timer, no random amount).
3. Techniques: 5 (the loop closes on a later showing), 9 (forgiving: never lost), 8 (warmth in the affirm only), 2 (v1/v2 name the return as normal).
4. Reopen: yes; a fixed reward she can predict is a reason to come back tomorrow.
5. iPhone: 2 taps to the +3 (pick + Check); burst ≤0.6 s.

## 3. Asks / proposals for prod (no prod file edited)

- `.cl.part` (RUNTIME §2), as built in `try/genui-ui.css` `.sheet`: `position:fixed; inset:auto 0 0 0; height:min(45svh,420px); border-radius:16px 16px 0 0;
  padding-bottom:calc(var(--s4) + env(safe-area-inset-bottom)); overflow-y:auto; overscroll-behavior:contain` + page scroll ON + `.app`
  bottom room = sheet height (Next reachable) + `.peek` state (a 48 px bar) instead of closing; ≥720 px: docked 26rem card bottom-right.
- `.opt.wrong` → `.opt.mine` (dashed `--edge`, "your pick"); `.opt[aria-checked]` / `.opt.right` on `--sheet` (Impeccable flags `--ink` on `--raised`).
- Disabled = `--muted` text, not opacity (Impeccable low-contrast on opacity stacks).
- graph.js: ghost dash `8 5` for `poly` (today `DASH.guide`), `data-role` on marks (RUNTIME §3 #2/#7).
- Copy for G/K: lock line, L1 lines, affirm lines, disclaimer above.

## 4. Testing layers run

Chromium (Playwright) 393×852 / 820×1180 / 1280×800 fold + full; WebKitGTK 390×844; ios-sim safari-expanded, safari-compact, standalone
(--overlay) for v1–v3 wrong state of genui-ui. Impeccable on every `?v=` of both pages + one `?rm=1` each. No BrowserStack creds.

## 5. Needs real iOS

1. `45svh` sheet while the Safari toolbar collapses/expands (does the sheet top jump?).
2. `env(safe-area-inset-bottom)` under the sheet and the v3 thumb strip (home indicator).
3. Fixed bottom sheet + page scroll together: rubber-band scroll behind the sheet, `overscroll-behavior: contain` on iOS 17/18.
4. The grab bar as a touch target (24 px tall visual inside a full-width button; real thumb hit-rate).
5. `scrollIntoView({block:"start"})` on the figure in v1 under the toolbar (does the figure land above the sheet?).
6. KaTeX `\dfrac{1}{2}` baseline inside the chip; SF width of "your 80 J" on the 393 px figure; DPR 3 dash `8 5`.
7. One-tap commit in v2 vs accidental taps while scrolling (real touch, no double-tap zoom).
8. Keyboard over the Cluck ask field inside a partial sheet (visualViewport shrink).
