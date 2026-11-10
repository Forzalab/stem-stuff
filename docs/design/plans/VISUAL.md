# VISUAL: ghost-visual mockups, round 1 (PHYS_KWV)

Agent V, Oct 7 2026. Page: `try/genui-visual.html` (+ `.css`, `.js`). Shots: `design/shots/genui/visual-*`. No prod code touched.
Question: Practice Exam 2 Q4 (F–x graph, rectangle + triangle, key c = 60 J). Ghost data = `tests/visual-cases/kwv-{a,b,d}-good.json`
(grid squares, 1 square = 2.5 J): **d** = full 8×4 box (80 J, forgot ½), **a** = rectangle only (40 J), **b** = triangle only (20 J), **e** = 24 J
(squares not rescaled) = mechanical → algebra chip, never a ghost (D32, kwv-e-bad).

## 1. How Tony tests it (iPhone)

Open `try/genui-visual.html?v=A` and play: pick d, Check. Then flip variants and switches at the bottom of the page (all links), write a
note, tap **Copy all** (`VIS;v=…;t=…;pick=…;lvl=…;try=…;last=…;tellme=…;slip=…;rm=…;picks=…;level=…;touched=…;pred=…;bet=…;w=…;flow=<events>;note=…`).

| Toggle | Does |
|---|---|
| `?v=A..E` | the five variants (§2) |
| `?pick=d\|a\|b\|c` | replays that first pick on load (c = right: affirm line + thumbnail in the feedback slot, Next live, no sheet) |
| `?t=short\|inter` | short = line → visual → actions; inter = adds the second line (praise the right part + the concept) and, at L2, the key step |
| `?lvl=1\|2\|3` | reveal spectrum: L1 ghost + true SHAPE, no value; L2 + one grab handle, value only once grabbed; L3 values on the shapes + steps + boxed answer |
| `?try=2` | 2nd wrong pick (d→a, a→d, b→d): both ghosts stay (max 2), level +1, the handle follows the newest pick |
| `?last=1` | last try: L3 + "Try a twin" / "Next" + "It'll come back around in a few questions, with fresh tries." |
| `?tellme=1` | tell-me pref on: every wrong pick opens at L3; "Try it yourself instead" flips it back |
| `?slip=mech` | pick e (24 J): KaTeX chip `W = 24 squares ×` [J in one square] with the missing piece in `--mark`; no scene, no ghost |
| `?sure=1` | ticks "I'm sure" before the replayed pick (bet demo) |
| `?rm=1` | reduced motion (also follows the OS setting) |

The page logs every telemetry event it would send (`viz_view` ≥50 % in view once per level, `viz_touch`, `viz_skip` via retry/tellme/next,
`tellme_on/off`, `bet_place`, `bet_result`, plus mock-only `viz_fullscreen`, `twin_start`) under "Events this page fired" and in `flow=`.
3 skips in a row (Retry / Just tell me / Next with the visual seen but never touched) set `localStorage["stem-tellme"]="1"` (counter
`stem-tellme-skips`); any handle grab resets the counter.

## 2. The variants

All five share: the question card, choices, the "I'm sure" tick, the fixed thumb bar `[Just tell me] [Check / Try again / Next]` (≥48 dp, always
visible, D18), the ghost style (muted, dashed `8 5`, fill ≤0.06, pill label "your 80 J" with a dashed border) beside the truth (c1 solid fill
0.22 + solid stroke, no value at L1/L2), tap figure → full screen (D26), and the Cluck copy below.

| v | Viz home (D34) | Predict input (D19) | Demo-first | Taps to aha (phone) | What it bets on |
|---|---|---|---|---|---|
| **A** | partial sheet ≤45 svh (fits content) over the LIVE question figure; page scroll on; figure auto-scrolled above the sheet | the pick IS the prediction | 1-stage warm-up card ("work = area; one square is 2.5 m × 1.0 N") + the unit square outlined on the figure, gone on the first pick | **0** (Check paints the ghost on her own figure) | RUNTIME's recommendation |
| **B** | today's full sheet, opens on Check; a COPY of the figure with the ghost inside; question hidden behind | the pick | same warm-up | 0 to see, but the question is gone (close X 44 px inside the gutter) | zero CSS risk |
| **C** | sticky figure: on Check the figure sticks to the top of the question card, Cluck's lines scroll under it (a divider, not a second card) | **chips** before the choices: "Gut call first: from B to C, the area is… [a full box] [half a box] [not sure]"; if she said "half a box" and picked 80, line 1 starts "Your gut said half a box." | none | 0 | interpret her own words back to her |
| **D** | chat card in the thread under the choices, with a figure copy | **drag**: before picking she drags a yellow dot to the shape she'd count from B to C (no numbers) | none | 0 to paint, but the page scrolls to the card and the question figure scrolls away | a light build |
| **E** | = A | the pick | **none** | 0 | isolates the warm-up axis (A vs E) |

**My bet: A or E** (decide the warm-up by A vs E). Both keep the ghost on the figure she already read, 0 extra taps, Next and "Just tell me"
under the thumb. C is the runner-up (same 0 taps, no sheet chrome) but its chips cost a tap before every question and sticky-in-card needs real iOS.

### Handle (L2, D44) — one hit target, 52 px, starts at HER number
- **d (80 J)**: the triangle's free top corner, starting at (8, 4) = her full box; drag down onto C and the box folds into the triangle;
  readout `60 + 5h` J, shown only after the first grab. Sits top-right, NOT bottom-centre (deviation, §4).
- **a (40 J)**: a sweep line at B (bottom-centre, on the x-axis), drag right to C: the area A→t fills, readout 40 → 60 J.
- **b (20 J)**: a sweep line at B, drag left to A: the area t→C fills, readout 20 → 60 J.
Keyboard: focus the figure, arrows nudge; Enter = full screen.

### Cluck copy (FABLE-1 C7: line 1 wise feedback/normalize, ≤2 lines, no math/joke/QUACK in line 1, value only at L3, ends on a choice)
| State | Line(s) |
|---|---|
| d L1 | "Tricky one. Your 80 J (dashed) counts the slope as a full box." (inter +) "Your rectangle is right. A triangle is half its box." → [Show me] |
| a L1 | "Tricky one. Your 40 J (dashed) stops at B." (inter +) "Your rectangle is right. The trip runs all the way to C." |
| b L1 | "This one trips lots of people. Your 20 J (dashed) starts at B." (inter +) "Your triangle is right. The trip starts back at A." |
| L2 (d) | + "Grab the corner and pull it down onto the line. Watch your box shrink." (inter + the box + half-a-box step, in squares) |
| 2nd wrong | "Your 40 J is the rectangle alone. The solid shape keeps going to C." / "Your 80 J adds a full box past B. The solid part past B is half of that." |
| L3 | "This one trips most people: the triangle is half its box. Here is the whole thing." + 2-line aligned math + boxed c) 60 J |
| right | "You split it into a box and half a box. That's the move on the exam." / own line: "QUACK. Triangles: the half-price boxes of physics." |
| mech (e) | "Your shape is right: box plus half a box. The last step stopped at squares." + chip |
Disclaimer once per sheet: "Cluck can slip. Check the key. Keep private stuff out of the chat." (C3 #7). No avatar/name/time row (C3 #2).
The choice at the end is the strip itself ([Show me] in the sheet, [Try again] + [Just tell me] in the thumb bar), not a question mark.

## 3. AUDIT-FRUSTRATED pains this surface fixes
- **#3 red X + line-through**: her pick gets a neutral dashed border + "your pick", no X, no red; only the KEY gets the green border, and only at L3 / right.
- **#1 "Ask Tony" lock**: the last try shows L3 + twin + "It'll come back around…" (D38), never a lock or a person.
- **#2 / #10 joke or QUACK first**: line 1 is wise feedback; QUACK + the joke live only in the right-answer affirm, on their own line.
- **#4 15 s to readable**: the ghost + line paint on Check (pregen, 0 LLM); nothing streams or types.
- **#6 sheet blocks Next, X at the edge**: A/C/D/E never lock the page; Next / Try again / Just tell me sit in the thumb bar above every sheet; B's X is 44 px inside the gutter.
- **#8 text walls**: ≤2 short lines before the visual; steps only at L3.

## 4. Deviations and asks (for Tony)
1. **Bet = FIRST pick only (Fable A1 #2), deviates from D53.** The tick hides after the first Check; a sure+wrong shows a small −1 segment
   next to the score (main score unchanged, D52 exception); retries carry no stake and say so: "The bet was on your first pick only. Retries
   are free." No double-or-nothing. Sure+right = random +3..+5 that rises in (≤8 px, reduced-motion = instant). Event names follow
   TELEMETRY.md (`bet_place`, `bet_result`), not RUNTIME's older `bet_tick/win/loss`.
2. **Handle for d is top-right, not bottom-centre.** D44 (handle on the triangle apex) and §1 "bottom-centre" collide on this graph: the
   corner that starts at her 80 J is at (8, 4). a/b handles are bottom-centre. Pick one rule for K.
3. **Figure height**: the ghost lives on graph.js's own cartesian figure, which is 240 px tall at 393 px wide (28 % of 852, `H = max(240,
   min(420, 0.72 W))`), not ≈45 %. Tap → full screen covers the gap. Ask for RUNTIME §3: a `minH`/`h:"45svh"` option on cartesian blocks.
4. **graph.js dashes every dashed poly as `guide` (2 4)**, so ghosts here are an overlay on `el._X` with `8 5` (DESIGN-LANGUAGE ghost). The
   real build is RUNTIME §3 #2 (role → style map); the overlay code in `genui-visual.js` (`overlay()`, `hook()`) is the drag pattern to move
   into `Graph.live`.
5. **Force colour = c1** (DESIGN-LANGUAGE: every force is c1). The bank draws this figure in c2; flag for the bank.
6. **Tries = 3** on this mock so `?try=2` lands on L2 with two ghosts (SCHEMA-V2 E5); prod gives 2 (the 2nd wrong = last try = L3).
7. **Warm-up content**: the demo shows "one square = 2.5 m × 1.0 N" but not the product (2.5 J), so it does not hand over slip e.

## 5. Test layers run
- Chromium (Playwright, iPhone 15 393×852 touch, iPad 820×1180, desktop 1280×800, fold + full page) for all five variants at pick=d, plus
  A states: fresh, L2 grabbed, L3 last, right+bet, mech chip, try=2, pick a, pick b, tell-me, rm; C and D fresh. 0 page errors, no
  horizontal scroll at any width (scrollWidth = innerWidth).
- Impeccable (`tools/impeccable.sh`, 390×844 / 1920×1080 / 2560×1440 / 3840×2160 + static): exit 0 on `?v=A..E&pick=d`, `?v=A&pick=d&rm=1`,
  `?v=A&pick=d&last=1`, `?v=A&pick=c&sure=1`. One documented disable: `pulsing-dot` from shared app.css `.cl-live` (never rendered here).
- WebKitGTK (`shot.py`) 390×844 for A–E + A at 820×1180 + A L3: layout matches Chromium (KaTeX, figure, pills, dashed ghost). shot.py's
  full-document capture drops `position:fixed` layers (the sheet and thumb bar are missing in `*-webkit.png`): a capture artifact; ios-sim
  (same engine, viewport capture) shows both.
- iOS-sim (`ios-sim.py --overlay`): A and E × safari-expanded / safari-compact / standalone (`*-ios-*.png`); in all three the whole figure
  stays above the partial sheet and the thumb bar sits above the Safari toolbar / home indicator. Drag PROVEN in the sim:
  `--drag '.hit,0,90'` on A L2 moved the apex (trusted pointer events, readout "66 J" appeared) → `visual-A-L2drag-ios-safari-expanded.png`.

## 6. Needs real iOS (no BrowserStack creds)
- `svh` partial sheet while the Safari toolbar collapses/expands mid-scroll (does the figure stay above the sheet?).
- `env(safe-area-inset-bottom)` under the thumb bar in standalone (sim injects 34; real value + home-indicator overlap).
- Touch drag on the 52 px handle with `touch-action:none` on the hit circle only, inside a page that still scrolls (sim does not enforce
  touch-action): does a drag near the sheet's grab bar scroll the page instead?
- `position: sticky` inside the question card (variant C) on iOS 17/18 with the toolbar collapsing.
- `<dialog>.showModal()` full screen + `100svh` on iOS 17 (focus, backdrop, scroll lock).
- SF Pro width of the "your 80 J" pill and the 2-line rule at 393 px; DPR 3 legibility of the `8 5` dash at 2 px; KaTeX baseline in the chip.
- `navigator.clipboard.writeText` for Copy all over http (falls back to select).

## 7. SHAME CHECK (per variant)
**A (partial sheet + live figure + warm-up)**
1. Her voice: "It didn't cross me out. It drew my 80 as a dashed box right on the graph, and the real shape is smaller."
2. Banned items: none (no X, no red wall, no "Wrong", no score drop on screen; the −1 bet segment is the D52 exception, first pick only).
3. Techniques: 1 wise feedback (line 1 "Tricky one"), 4 interpret (ghost labelled with HER number on her figure), 5 error = a step (Try again
   in the thumb, ghost stays), 6 private (no chat needed), 7 agency (one handle at her number, L2), 10 fast (0 LLM, paints on Check),
   11 validating (L1 inter "Your rectangle is right").
4. Reopen tomorrow? Yes, likely: the miss felt like being shown something; the right answer gets a named fix + one duck joke.
5. Aha: 1 tap (Check) + ~0.3 s on iPhone, 0 extra; mid Android same taps, ~0.6–1 s (estimate). Warm-up adds ~5 s once, before the pick.

**B (full sheet + figure copy + warm-up)**
1. "A big panel covered my question, but at least it showed my 80 next to the right shape."
2. None. 3. 1, 4, 5, 10, 11 (6 weaker: the sheet feels like being taken aside). 4. Maybe: the question vanishing is the old pain #6 in a nicer coat.
5. 1 tap + ~0.3 s; to retry she must close or tap Try again (the sheet closes).

**C (sticky figure + gut-call chips)**
1. "It remembered I said half a box, and showed me my 80 wasn't half."
2. None. 3. 1, 4 (her own chip words quoted back), 7 (chips = agency), 11, 5. 4. Probably: being quoted feels heard; but the chip before
   every question is a toll at midnight. 5. +1 optional tap before the pick; aha 1 tap after it.

**D (chat card + drag first)**
1. "I drew my guess, then the chat showed it again lower down."
2. None. 3. 4, 7 (drag before the pick), 5. 4. Less likely: the lesson scrolls away from the question; the pre-pick drag is fun once, a
   chore by Q5. 5. Aha 1 tap but needs a scroll back up to compare with the question; drag adds 2–4 s before the pick.

**E (A without the warm-up)**
1. Same as A. 2. None. 3. Same as A. 4. Yes: the fastest path to the question (first Q < 3 s). 5. 1 tap + ~0.3 s, no warm-up toll.
