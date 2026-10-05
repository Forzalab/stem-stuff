# Formula card + brainrot corner: 5 variants each (easy mode, design/EASY.md Phase 3)

Mockups: `design/mockups/formula-card.html?v=N`, `design/mockups/brainrot.html?v=N` (N = 1..5). Shots: `design/shots/formula-card-N-{390,1920}.png`,
`design/shots/brainrot-N-{390,1920}.png`. Generic physics only (no exam text in the repo); players are placeholders until Tony sends 2 links.

## Formula card (the question's `part` rows, from formula-sheet.json)

| # | look | rule | risk |
|---|---|---|---|
| 1 | Recipe card: "Use these", rows aligned, sheet group on the right | one surface, one job (Refactoring UI: group, then label) | a third box on the page; long formulas push the group label to a second line on phones |
| 2 | Ingredient chips: one scrollable row, a tapped chip opens under it | smallest footprint on phones | a hidden formula is a missed formula; chips with fractions get tall |
| 3 | Side rail (desktop, sticky) / fold strip "Formulas (3)" (phone) | never in the reading column on desktop | the phone strip is one more tap; desktop under 1100px has no room for the rail |
| 4 | The real sheet group, needed rows lit, the rest dimmed | find it on paper in the exam (formula-sheet-first, Tony's group) | longest card (whole group, 2-9 rows); dimmed rows still cost reading |
| 5 | Steps: numbered in order of use, "then" between, one plain line each | least to figure out: the order is given | the most pre-chewed: says how to solve, not just what to use |

**Pick: 4** (desktop under the answer box, phone the same card). It matches "align with the sheet": the student learns where each row sits on
the paper they get in the exam. Runner-up 5 if the group wants it even more pre-chewed.

## Brainrot corner (Subway Surfers + one TikTok, easy only)

| # | look | risk |
|---|---|---|
| 1 | Picture-in-picture card, 16:9, tabs Subway / TikTok, – and ✕ | covers part of the lower page; needs the FAB's step-off rule |
| 2 | Split screen: two players under the question (phone) / a side column (desktop) | pushes the answers down on phones; always on |
| 3 | Phone-shaped TikTok docked on the edge, half peeking | one player only; the peek hides the right edge of long choices |
| 4 | Stacked duo pill on the left: Subway on top, TikTok under | tall; on 375x667 it reaches the choices |
| 5 | Mini pill "Brainrot ▸", opens 1 on tap | the least brainrot: one tap away |

**Pick: 1** (draggable, collapses to 5's pill with –, ✕ hides it for the session).

## Round 2

**Desktop sugar has no notes pad** (Tony, Oct 4: "desktop saccharine mode... NO SCRATCHPAD. diet keep it for me"): on a question with a layer the right column is the videos + the hint card only (app.js applyMT `html.no-pad`). Diet and plain questions keep the pad.  **Desktop / tablet (Oct 4, Tony picked "B: top of notes" from 2 mocks):** side by side, the brainrot duo docks as the first thing in the
notes column, both players side by side, sticky; no drag; – folds it into a "Show video" bar. Phones keep the floating corner below.

Tony picked formula card 5 ("Steps in order") and brainrot 4 ("Stacked duo"). Five refinements of each, built to STYLE.md: app.css
tokens only, no `--mark`, borders `--bw` or 1px dividers, weights 400 and 700, sentence case, no emoji, sprite icons, a reduced-motion
path for every animation.

Mockups: `design/mockups/formula-card-r2.html?v=N` (v4 also takes `&open=0|1`) and `design/mockups/brainrot-r2.html?v=N`
(`&state=collapsed`, `&state=expanded`, `&ctl=1` shows the controls as after a tap). Shots in `design/shots/`:
`formula-card-r2-N-{390,1920}.png`, `brainrot-r2-N-{390,1920}.png`, `brainrot-r2-N-collapsed-390.png`, `brainrot-r2-N-controls-390.png`.
The 390 shots are 390x844 at 2x.

### Formula card: steps in order

Same content in all five: the tip line on top, then the question, the answer box, and then the card. The card shows the 3 sheet rows in
order of use, with "then" between them and the sheet group under each one.

| # | look | school / rule | risk |
|---|---|---|---|
| 1 | One `--sheet` card. Fixed columns: number, formula, group. "Then" is its own row, with a 1px rule running to the edge. On desktop the group gets its own column. | Swiss / International grid: strict columns, flush left, rules for structure | A third surface on the page. On desktop the group column reads like a table. |
| 2 | No box and no lines, just the page. The formula is `--ink`; the number, group and "then" are `--muted`. The gaps do the grouping. | Refactoring UI hierarchy: use weight and colour instead of borders | It can drift away from the answer box. With no edge it reads as loose text. |
| 3 | Inside the question box, under the answer, after a 1px divider. Desktop shows the 3 steps on one line; the phone stacks them. | Gestalt common region: question, answer and the way there form one region | The box grows. Long formulas wrap the desktop line. |
| 4 | One folded row shows the chain (formula, then, formula...) with a chevron. Open, it shows the numbered steps with their groups. It starts folded on phones and open on desktop. | Progressive disclosure | Folded, the group line is hidden. It is one more tap on phones. |
| 5 | A `--sheet` card. Desktop runs the steps left to right, linked by "— then —". The phone stacks them on a 1px rail, with numbers in 8px `--raised` squares. | Material 3 stepper + Gestalt connectedness | The busiest look. Three long formulas will not fit one desktop row. |

**Pick: 3.** The steps live in the box the student is already looking at, and there is no new surface. On desktop it costs one line.
Runner-up: 1, if Tony wants the card separate from the question.

### Brainrot corner: stacked duo

Tony asked mid-round for a plain look, like iOS picture-in-picture YouTube: no frame, card, border, tab bar or labels. So all five
are the same 2 bare videos (Subway on top, parkour under). Each video has 10px corners and `--shadow-3`, with an 8px gap between them.
Collapse (–) and close (✕) are 44px see-through overlays on the video (72% `--field`). They show on hover, on keyboard focus, or for
3 s after a tap. The five differ only in placement, size and behaviour.

Shared behaviour:
- You can drag it from anywhere, because the players take no pointer. On release it snaps to the nearest edge (`--d-move` ease-out).
- It steps off live controls: the choices, Check, the box, the Scratchpad button and the bar. It tries the same edge, then the other
  edge, then collapses.
- It starts collapsed on screens under 700px tall. ✕ hides it for the session.
- Reduced motion: the players load paused and it starts collapsed. Snaps happen instantly.
- The players are built once and moved, so collapsing or dragging never restarts them.

| # | look | school / rule | risk |
|---|---|---|---|
| 1 | Bottom-left corner, 176px wide on phone and 320px on desktop. It snaps to the 4 corners. Collapsed, it slides into the edge and leaves a 44x96 tab with a chevron. | Apple HIG picture-in-picture (corner snap, stash) | Medium size. On the phone it takes the free space left of the Scratchpad button. |
| 2 | Small: 120px, on the right edge, stacked above the Scratchpad button. On desktop it is centred in the empty left gutter, as wide as the gutter allows (up to 360px). Collapsed, it is one 48px button. | Calm Technology, periphery | Tiny on phones. Stacked over the Scratchpad button, it makes the right edge busier. |
| 3 | The biggest: 192px on phone and 360px on desktop, bottom-left. The controls sit on the lower video's bottom edge, at the thumb. Collapsed, it is a 56px FAB with a play icon, mirroring the Scratchpad button. | Fitts's law, thumb zone | The most screen on phones. It takes the whole space left of the Scratchpad button. |
| 4 | Bottom-left, in 3 sizes: large; small while an answer control has focus; mini (80px) when collapsed, still playing. Tapping again with the controls showing swaps large and small. | iOS PiP sizes + Calm (it steps back while you answer) | It changes size by itself, and that motion is not caused by a tap. The mini keeps moving at the edge of view. |
| 5 | Phone: in the empty slot left of Check, its top on the Check row and its left edge on the column line. Desktop: the right gutter, its top level with the question box. Collapsed, it is a 48px button on the column line. | Swiss grid: it sits on the page's own lines | It leans on the Check row. A taller answer (a box, no Check) moves the slot. |

**Pick: 1.** It is the iOS picture-in-picture Tony described, with the corner snap and stash students already know from their phones.
It keeps clear of the Scratchpad button. Runner-up: 4, if Tony wants it to step back on its own while the student answers.

### Rules bent (Tony's call)

- STYLE.md §1.6 and §2.8 say no ambient motion, and loops are only for "busy". The corner is a looping video on purpose. The
  reduced-motion path does not play it.
- §1.7 says to show state, never hide it. The overlay controls hide until hover or a tap, iOS style. The video itself is the visible
  control, so §1.11 still holds.
- §2.7 does not list the corner's shadow. It needs a row (`--shadow-3`, `--shadow-4` while dragged), like the Scratchpad button.
- The see-through overlay is `color-mix(var(--field) 72%, transparent)`. It uses a token, but the alpha is a new value: a
  `--scrim` token if it ships.
- Two new sprite symbols for `index.html`, drawn to §4: `i-min` (a line) and `i-play` (an outline triangle).
- Only v3's collapsed FAB uses the FAB's 16px radius. The videos are 10px, per Tony.

Shots note: in this sandbox YouTube answers "Video unavailable" (the headless browser here is refused), so the shots show YouTube's
error card inside the real iframes. The pages embed the real players (`youtube-nocookie.com/embed/<id>?autoplay=1&mute=1&loop=1&...`);
check them in a normal browser.
