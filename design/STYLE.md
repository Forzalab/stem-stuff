# Style: the one design source of truth

Owner: Tony. Applies to every page and mockup in this repo: `index.html`, `app.css`, `nav.css`, `design/explain-box.css`, `design/mockups/*`.
Figures and graphs (strokes, arrowheads, dashes, labels, bodies): see [DESIGN-LANGUAGE.md](DESIGN-LANGUAGE.md). This file does not repeat it.
Reference build of the tokens: `app.css` `:root`. If this file and `app.css` disagree, fix one of them in the same commit.

Write new rules here, short and imperative. Record the why in one clause. Put long histories in the feature's own `design/*.md`.
When a ruling changes, edit the rule here and add one line to the feature doc. Never keep two versions.

---

## 1. Principles

**Style: Calm Textbook.** A quiet page that teaches. Typography is the interface; the student always sees one clear next step; small jokes live in the content, never in the chrome.
**Precedents:** Calm Technology (Weiser and Brown; Amber Case), Rams' "less but better", the GOV.UK autism design poster, W3C COGA, Tufte's data-ink, iA Writer, Apple HIG and Material 3 canonical layouts, tiling window managers, Atkinson Hyperlegible (Braille Institute). Impeccable and greyscale legibility are hard gates (§7).

1. **One system.** Every control comes from the same tokens and the same `.btn` / field rules. Why: the student learns the page once.
2. **Calm (baby-friendly).** Dark, quiet surfaces; color only for state; no shouting, no scolding. Why: a drill is stressful already.
3. **Icons first, words when asked.** A known icon in a state color replaces a label. Words only where no icon is clear or Tony names an exception: the Scratchpad button, the bank-code list button. Why: less to read, and a familiar icon with a word is still familiar.
4. **One primary action.** Only one filled control is visible per field or step: the submit arrow (`.btn-go`). Everything else is outlined. Why: the eye goes to the next step.
5. **Nothing jumps.** Reserve space for what can appear (the arrow slot, the verdict icon, the copy band). Overlays are `fixed`; in-flow panels push content only after a tap. A floating thing never rests on a live control. Why: nothing moves under a finger.
6. **Motion answers a tap.** Animate only what the person caused (open, swap, confirm). No ambient motion except a "busy" signal. Direct manipulation is not animation: a pane or a button may follow the finger. Why: motion that explains, never decorates.
   Scoped exception: **Cluck's idle peek** (T45, [IDLE-PEEK.md](IDLE-PEEK.md); Tony, Oct 15): after 3 min with no input in a sugar bank, or ~0.7 s after a question's first wrong answer (Tony, Oct 17; once per question, 2 min cooldown), the duck rises at a sunrise. It is caused by no input (ambient) or by that first wrong answer, the duck moves 64-72px (over §2.8's 14px; the sky stays ≤ 14px), the sky is a glow on the page (outside §2.7 "Fades and glows"), and its line "Stuck? Tap me." / "Stuck? Click me." is Cluck's voice outside the hint (§5). One shot, never a loop; one duck and one glow per screen (it never runs while Cluck's sheet is open); reduced motion = opacity only. Nothing else uses this exception.
7. **Show state, never hide it.** Right, wrong, tries left and locked are always visible on the thing they are about. Why: the student never has to guess.
8. **Improve by removing.** Before you add a control, try to remove one. Why: less, but better.
9. **Calm at the edge of attention.** Help waits at the edge and comes forward only when needed; when something fails, it fails quietly (no modal, no alarm). Why: the problem holds the attention, not the chrome.
10. **Honest.** No streaks, no guilt, no fake urgency, no trends. Why: the student trusts the page under exam stress.
11. **One tap away is not hidden.** A feature behind an always-visible control is not hidden; a feature with no visible control is unshipped. Why: the phone pad sits behind the Scratchpad button, which is always on screen.

---

## 2. Tokens

All values live in `app.css :root`. Use the token, never the raw value. Desktop (`min-width: 700.02px` and `pointer: fine`) raises the type scale, `--btn` and `--ico` through the tokens only.

### 2.1 Color

Source: unified v5 (brain `chat-redesign-2026-10-13/unified-v5/TOKENS.md` = round 5 PALETTE-v3.1 + THINLIGHT on the unified-v4 ladder; Tony's round 7 PICKER 1, 2, 4, 8). Hard cap per frame: page + 2 surfaces + 1 line colour (Tony: "count how many blues"), plus the help surface when a hint or Cluck is open.

| token | hex | role |
|---|---|---|
| `--page` | #050c16 | page, bars, the dock, wells (older names on it: `--paper`, `--field`) |
| `--card` | #101c2c | the one card fill: question box, every choice, list card (`--qbox`, `--sheet`) |
| `--float` | #1b2b40 | raised: hover, selected list row, glass controls, the neutral Next (`--raised`) |
| `--line` | #394a61 | the one line colour: dividers, control edges, the 0.5px row hairline (`--edge`) |
| `--ink` | #e8edf5 | body text, icons in buttons |
| `--muted` | #a7b7cd | secondary text, placeholders, locked state (`--hint`) |
| `--action` / `--focus` | #92c0ff | the commit colour: Go, Check, the selected choice (1px ring + filled badge, `--action-ink` letter), focus ring, caret (`--c1`) |
| `--c2`, `--c3` | #ffb86b, #ff8fc8 | figure series only. Not for UI state |

**The warm family** (one hue band, 55–70°; lightness is the role, PALETTE-v3 §1): `--help` #ff9a3e is Cluck, hints, the bulb and send; `--reward` #ffcd94 is the HUD (XP bar, numerals, star), the +XP float, the toast and the bursts only, never in a help surface, a CTA or a chip; `--help-on` #ffdcc0 Cluck's name and card titles; `--help-deep` #b05a00 burst fields, rims, outlines (never under text); `--help-line`, `--help-fill`, `--help-sheet`, `--help-rule`, `--help-muted`, `--help-ink` (ink on any warm solid); `--glow` #ff8204 at alpha only. Bursts use three slots of this ramp (rarer = lighter): 0 purples, 0 magentas, 0 whites. The reward rasters land on the ramp through `--goldify` (the gold star) and `--duckgold` (the natural-colour duck), measured at OKLCH hue 62–70.

**Status colors.** Each one means one thing. Use them on icons, borders and short words; never as a large fill.

| token | means | use it for | never |
|---|---|---|---|
| `--correct` #4ee6af | right | check glyph, a right row's 1px ring, a right box's edge, the green Next face (`--correct-ink` label, `--correct-press` pressed), right answer text, Copy done | decoration, "success" toasts for routine saves, a fill under a row |
| `--wrong` #eb596e | wrong | X glyph, a wrong row's 1px ring, the strike on a wrong choice, used try pips, list X marks, the entry error line. `--wrong-rim` #d14a5f: only the typed box's 2px dashed edge | hover, delete buttons, emphasis, a fill under a row |
| `--muted` | locked / waiting | lock icon (in the answer box when out of tries), checking | (see table above) |

There is no warning color. The warm family is never a warning and never a figure series on the page; the one exception is a live figure inside Cluck (below). `--mark` is retired: Cluck's duck glyph and a snack's changed-number underline use `--help`.

Source for `--action`, `--correct`, `--wrong`: chat-redesign round 5 PALETTE-v3.1 + THINLIGHT (brain), Tony's round 7 PICKER 1–2. `--online` #5fd394 is Cluck's status dot only.

Contrast floor: text 4.5:1 on its real background (check `--raised` too), control boundaries and icons 3:1.

### 2.2 Type

Source: chat-redesign round 5 TYPE-DECISION v3.1 (brain), Tony's round 7 PICKER 5–7.
- Families: one text stack, `--font`. **Atkinson Hyperlegible** everywhere by default; WebKit alone (`@supports (font: -apple-system-body)`) puts **SF** (`-apple-system`) first, so iPhones get the system voice and every other browser gets the same vendored face. KaTeX for math. Two named exceptions: `--mono` (`ui-monospace`, Atkinson Hyperlegible Mono) only in the scratchpad and pre-formatted tables (`.wtext .tbl`); Press Start 2P only on the burst title (`.fx-title`). Typed answers, verdict values and markdown `code` are the text face with `tabular-nums`. The q | a switch letters are the UI face, `--t-lg` 600, upright (PICKER 7).
- `.katex` sets its own size, `--kx`: math at the text face's x-height (Atkinson 1.15em, measured; SF 1.2em, provisional until measured on a device). No other KaTeX multiplier. No `font-size-adjust` (every `font:` shorthand resets it).
- Scale (phones; desktop steps all five tokens per breakpoint, never a sixth size):

| token | px | line height | for |
|---|---|---|---|
| `--t-xs` | 13 | `--lh-xs` 1.38 | status, figure ticks, tags ("TUTOR"), counters. Only `--ink` / `--muted` / the Cluck peach, never an accent |
| `--t-sm` | 15 | `--lh-ui` 1.33 | buttons, chips, labels, how line, figure labels |
| `--t-md` | 17 | `--lh` 1.41 | problem text, choices, typed answers, Cluck's text |
| `--t-lg` | 20 | `--lh-title` 1.25 | titles, HUD numerals, q | a letters. Cluck's name stays 21px (H3a, PICKER 5) |
| `--t-xl` | 28 (desktop 36) | `--lh-title` | the start page's title only |

  Single-line inputs keep `line-height: 1`. A field is never under 16px (iOS zooms on focus): the code box uses `max(1rem, var(--t-sm))`.
- Weights: 400 and 600 (`--w-em`) only. Atkinson has no 600, so it renders its 700 (CSS font matching); `font-synthesis: none` stops any faux weight or oblique. 600 = a name, a state, a title, emphasis. In tutor markdown `**b**` and `*i*` both render 600 in the running ink: emphasis is weight, never colour, never italic.
- Italic: none outside `$..$`.
- Tracking: 0 on sentence case; `0.05em` only on uppercase strings (the code box, the TUTOR tag).
- Prose is at most 65ch wide.
- Sentence case everywhere. No all-caps labels, no letter-spaced eyebrows. Problem codes are uppercase because they are codes.

### 2.3 Spacing

Scale: `--s1` 4, `--s2` 8, `--s3` 12, `--s4` 16, `--s5` 24, `--s6` 32, `--s7` 48 px. Side gutter `--gut` (20px, 16px under 34rem, plus safe areas).

- Gap between controls in a row: `--s2`.
- Inside a layer: `--s3`. Between layers (card to scratchpad, row to row of parts): `--s4`.
- Do not use values outside the scale. The arrow-slot math (`--btn + 8px`, `--fld`) is the one exception.

### 2.4 Sizes

`--btn` 48px (every button; desktop 50 to 56), `--fld` = `--btn` + 4 (answer fields that hold a button flush; the code box is `--btn` tall, like the bar buttons beside it), `--ico` 24px (icon in a button), `--col` 52rem (column). Tap targets are at least 44px, normally 48.

### 2.5 Radius

Radius follows size. Nested corners are the outer radius minus the gap.

| radius | for |
|---|---|
| 16px | the Scratchpad button (M3 FAB) |
| 10px | surfaces that hold content: problem card, list card, Cluck (desktop side column; the phone dock is 30px, running to 0 at full: CHATBOX PICK r2), toast, pane tiles |
| 12px | the Cluck box (`.cluck`, in the hint area and the sugar skin; Tony, Oct 17: rounder) |
| 8px | controls: `.btn`, fields (`.ff`, code box, scratchpad), choices, list rows |
| 6px | something inside a control (the q | a switch's active pill, Paste / Go inside the code box, a suggestion row) |
| pill / 50% | the start page's field and the round buttons inside it (nested: outer radius minus the 4px gap) |
| 4px / 3px | inline code / figure label knockout |
| 50% | choice badges only |

### 2.6 Borders

One weight, one focus rule, one ring (Tony, Oct 3: "too thicc overall and disparate"; picked per state from variants A / B / C, then "one rule"; "if conflicting, choose the more unified one"). Tokens in `app.css :root`.

| what | border |
|---|---|
| Fields (`.ff`, `.code-box`, start `.entry`, `.xb textarea`), badges, `.md th`, the toast | `--bw` (1px), `--edge` (toast `--line`). Hover `--muted`. Right `--correct`. Pending `--c1` dashed |
| Choices `.opt` | `--bw-hair` (0.5px) `--line` at rest; every state 1px (`--bw`): selected `--action`, right `--correct`, wrong `--wrong` (solid; the strike and the x carry it in grey) |
| Buttons `.btn` | fill-first: `--bw` **transparent**, the fill carries it; hover = `--raised` fill only. `.btn-go` keeps its `--c1` edge |
| Field focus (every field, the pad too) | border `--focus` + `inset 0 0 0 1px var(--focus)` = one 2px blue edge. **No outline** |
| Keyboard focus (buttons, FAB, sash, anything `:focus-visible`) | `--ring` (2px) `--focus` outline at 2px offset (-3px inside a field) |
| Wrong typed box (`.ff.bad`) | `--bw-alarm` (2px) `--wrong-rim` **dashed**: the only heavy line (dash = not accepted, so it survives grayscale) |
| Cluck's ask rim (`.ask`) | 1.5px, shown only while Cluck types: the one listed exception |

- Never a border and an outline on the same focus. Never 3px. Guarded by `tests/style.test.mjs` §2.6.
- A wrong border adds `--bw-up` (1px). The box takes it back from its padding and the arrow / verdict offsets, so the text and the ✕ never move (render.pw: "the x is where the arrow was", "nothing moved").
- Surfaces have no border. A background change separates them.
- Dividers: 1px `--line` (part rows, table rows, the stuck strip's bottom).
- No colored side stripes on anything.

### 2.7 Elevation

A shadow means "this floats over content". Allowed only on:

| layer | shadow |
|---|---|
| freeze strip, while stuck | `--shadow-3` |
| phone dock (fixed, bottom) | the upward version of `--shadow-3` |
| toast | `--shadow-1` (with the 1px `--line` hairline: Impeccable flags a hairline with a wide shadow) |
| the Scratchpad button (floats over the page) | `--shadow-3`; `--shadow-4` while dragged |
| code suggestions (floats over the page) | `--shadow-3` |
| start page field | `--shadow-1` at rest, `--shadow-3` on hover / focus (Tony: "popping, like Google"; the only thing on that page) |

Nothing in the flow gets a shadow: no cards, no buttons, no list. No glows outside "Fades and glows" below. The start field and the Scratchpad button are the two named exceptions among controls.

#### Fades and glows

Tony, Oct 13: "allow fade (not overt, but for UI smoothness) + subtle glows like on the cluck box to be in our design language". Both are for smoothness, never decoration: if you can see a band or a halo as a shape of its own, it is too much.

- **Fades** smooth an edge where content meets something that does not scroll with it. Allowed: scroll edges under a pinned bar (the phone top bar, the phone bottom dock: `app.css` "scroll edges"), and overflow / peek fades on a box that scrolls inside (the freeze strip's `.clipped` mask, the Swap peek's bottom fade, a hint steps peek). The fade goes from the bar's own background token (exactly; never a near colour) to transparent, on the edge that faces the content: `--s3` to `--s5` (12-24px) for a scroll edge, up to 2.5rem for an overflow mask. It sits outside the bar's box with `pointer-events: none` (nothing moves, every tap passes through) and is invisible at rest: it lies on empty page, or shows only once the page has scrolled (a class, `html.scrolled`; never a scroll-driven or looping animation: `rewards/fx.js` waits for the page's animations to end). Never a gradient band as a divider or a background, never a gradient fill on a button or text.
- **Glows** only on a floating AI surface (Cluck's sheet: `--ai-glow` from the top, brighter while Cluck types). Soft and warm, in that surface's own accent, blending into its background: a radial gradient fading to transparent by 70% of its size, or a blur of 24-64px with no spread. Peak alpha 0.3 at the source (`--ai-glow`), about 0.2 at rest (it rests at 60%). One glow per screen. No hard-edged, neon or coloured-ring glow, and none on flow content, cards, buttons or focus states (focus is the one `--focus` ring).

#### Question box height (phones)

Rule: on a phone, the top of the first answer choice peeks above the fold when a question loads. Prefer a shorter card over a scroller, in this order:

1. **Figures** are capped at 28svh (`graph.js`): a taller one is redrawn narrower and centred (never below 60% of the width), so labels keep their size and place. Spacing uses the usual tokens.
2. Phones show the whole problem in the page (a locked rule, tests/bar and fab): no cap, no inner scroller on the card text.
3. Tablet and desktop are unchanged. Not on the Cluck chat, hint panel, or choices.

### 2.8 Motion

| token (proposed) | value | for |
|---|---|---|
| `--d-fast` | 120ms | hover, border and color changes |
| `--d-move` | 200ms | show / hide, slide, swap crossfade, toast in and out, splash out |
| `--d-dim` | 300ms | the lock-in dimming of the rest of the page |

- Easing: `ease-out` (enter and feedback). No bounce, no elastic, no spring overshoot.
- Move at most 14px. Animate `opacity` and `transform` only; never animate layout (height, top, width).
- Loops: only for "busy" (autosave sweep, splash). Stop them the moment the work ends.
- Direct manipulation (the sash, dragging the Scratchpad button) follows the finger with no transition; the release snap is `--d-move` ease-out. Why: the hand moves it, so it is not layout animation.
- Reduced motion: `app.css` turns off every transition. Every `@keyframes` and every View Transition needs its own `prefers-reduced-motion` rule: no movement; a fade of `--d-move` or less, or an instant change. Snaps are instant.

---

## 3. Components

### Button (`.btn`)

- Anatomy: 48×48 (`--btn`), no visible border (`--bw` transparent, §2.6), 8px radius, `--sheet` fill, one 24px sprite icon in `--ink`. `aria-label` and `title` when there is no word.
- States: hover `--raised` fill; active 1px down; keyboard focus `--ring` (2px) `--focus` outline at 2px offset; disabled 45% opacity, no hover, no press.
- Variants: `.btn-go` (primary: `--c1` fill, `--field` icon, `--c1-hi` hover) is the only filled button. `.btn-label` adds one short word after the icon, same height. `.btn-tgl` is the two-state switch (today: q | a).
- Do: one `.btn-go` visible per field. Put the arrow flush inside its field.
- Don't: text-only buttons, a "→" after a word (the labelled **Next ▶** in the Check slot is the one named exception: a filled button with the `i-tri` sprite icon, never a typed arrow), a second filled color, round or pill buttons (named exceptions: the start field's buttons, the q | a switch, the Scratchpad button).

### Code box (`.code-box`) and suggestions

- Anatomy: in the bar, the same height (`--btn`), surface (`--sheet`) and 8px radius as the buttons beside it, with a `--bw` `--edge` border (a field), so tops and bottoms line up. Text: the bar's label text (`--t-sm` bold, Atkinson Hyperlegible, uppercase because codes are). Paste (empty box) or the Go arrow (typed) sits flush inside the border: `--btn` minus 4px, 6px radius. Paste is an icon button (transparent, `--muted` icon, `--raised` + `--ink` on hover); Go is the one filled control.
- Focus: the field rule (§2.6): border `--focus` + 1px inset = 2px. No outline around it.
- Suggestions (`suggest.mjs`): while typing, the codes this browser knows (opened here before, newest first; the live bank and its list; an uploaded file) that contain the typed text. **Banks first, then questions**, order kept inside each group. A `--sheet` card, 10px, `--shadow-3`, floating under the bar (above it when the bar is the phone dock). Rows `--btn` tall: `i-list` for a bank, `i-doc` for a question, the code in `--t-sm` bold; hover / marked row `--raised`. Combobox keys: ArrowDown / ArrowUp, Enter, Escape. The browser's own form history is off (no `name`).
- Suggestions and the keyboard (phones; Tony, Oct 17): the list is a popup bounded by the **visual** viewport, never by `vh` (on Android Chrome `vh` stays the large viewport while the keyboard is up, so a `50vh` cap ran past the top and over the field). `app.js sugFit` sets `--sug-max` = the room between the bar's top edge (or the sticky top bar) and the field, at most about half the visible height so the question stays in sight, re-run on `visualViewport` resize / scroll; CSS caps with `min(22rem, 50dvh, var(--sug-max))`. The list scrolls inside itself (`overscroll-behavior: contain`, `scroll-padding`), so no row is cut off unreachable, and it never overlaps the field. Nothing is moved or scrolled on focus, so nothing is left shifted when the keyboard closes. Desktop and tablet keep the CSS cap.

### Start page (`html.start`: no problem open)

- Like a search home page: one line of title, "Upload or type code to start." (`--t-lg` bold `--ink`, centred), over one wide field (up to 40rem), both centred on the page. On phones the area is the part above the keyboard (`--kb-top` / `--kb-bottom`), so the field never hides under it.
- The field: a pill, `--sheet`, `--bw` `--edge`, `--shadow-1`; hover `--muted` border + `--shadow-3`; focus the field rule (2px `--focus`) + `--shadow-3`. Upload (left) and Paste / Go (right) are round 48px buttons inside it, transparent until hovered; Go stays the one filled control.
- Once a problem opens, the bar goes back to its place. Nothing animates in on load; hover and focus transitions only, off with reduced motion.

### Math in text

- Inline math keeps the punctuation that touches it: `$x$.`, `($v$)` render as one unit (`.mx`, nowrap), so a "." or "(" is never alone on a line (Tony, Oct 3).
- In a choice row a formula is one unit (`.opt .txt .katex` nowrap): "d =" never sits alone above its fraction. Too wide for the row → `fitMath` (app.js) shrinks it, down to 85%; still too wide → that formula scrolls sideways on its own (`.kx-scroll`). Re-fit on every resize and when a KaTeX font finishes loading.
- `tests/katex-wrap.pw.mjs` checks 320 / 390 / 768 / 1440: no orphan punctuation, no broken formula, no overflow, no word split. `KW_BANKS=<dir>` surveys real banks.

### Answer box (`.ff`)

- Anatomy: 52px tall (`--fld`), `--field` fill, `--bw` border, 8px radius, optional muted lead text, `--mono` 18px input, and a 48px **arrow slot** on the right that is always reserved.
- States:

| state | border | arrow slot | text |
|---|---|---|---|
| idle, empty | `--edge` | empty (arrow hidden) | `--hint` placeholder |
| typed | `--edge` | `.btn-go` arrow | `--ink` |
| focus | `--focus`, 2px (field rule) | arrow if typed | `--ink` |
| wrong, try left | `--wrong-rim` 2px dashed, no fill | `i-x` in `--wrong` | `--ink`, editable |
| correct | `--correct` 1px, no fill (both modes) | verdict `i-ok` in `--correct` LEFT of the slot; the slot holds the labelled **Next ▶** on a `--correct` face (96x48 hit, 92x44 face, right-aligned on Check; sugar: 3px `--field` ring round it) | `--correct`, read-only |
| locked (out of tries) | `--edge`, not dimmed (it carries Next) | verdict `i-lock` in `--muted` LEFT of the slot; the slot holds the labelled **Next ▶** on a neutral `--raised` face, 0.5px `--line` (a fail is never praised) | `--muted`, read-only, no words under it (no out-of-tries line) |
| closed, not the last try (multi parts) | `--edge` / `--correct`, 50% opacity | its verdict icon | read-only, not-allowed cursor |

- Do: show the verdict icon in the arrow slot, so the result sits where the eye already is. Keep the box the same size in every state.
- Next (T17b-1, app.js `cueNext`): once a question closes, the last try's Check slot (box, mc row, multi part, pick-all Check row) gets a labelled Next. The Check rect lies inside it (right edges flush), so nothing moves; focus goes to it; a held Enter (`e.repeat`) never presses it. It lands once with `g-next-in` (200ms, 120ms delay; reduced motion `g-next-fade`). The filled ▶ (`i-tri`) is only on this filled Next; the nav bar Next and every ghost / text button keep the thin chevron `i-next`. Sugar adds the duck chip under the answer ("Compare with Cluck's steps" / "Ask Cluck", no XP); diet has no chip, duck or wash.
- Don't: put the verdict in a new line that pushes content; show a glow (glows are for Cluck's sheet only: §2.7 "Fades and glows"); use both a colored border and a focus outline (one ring).

### Multiple-choice choice (`.opt`)

- Anatomy: full-width row, min 52px, `--sheet` fill, a 0.5px `--line` hairline (`--bw-hair`), 8px radius, a round letter badge (1px `--line` ring, `--muted` letter), the text, and the arrow room on the right. 2 choices (or 3 short ones) become one row of pills without badges (`fitChoices()`).
- States (V1 thin light: a state is a 1px ring + a 20px glyph in one solid colour, on the unchanged row; never a fill; the letter badge never changes with right / wrong): idle hairline, hover `--muted`, selected 1px `--action` ring + filled `--action` badge + the arrow inside; others fade to 35% and the page dims (lock-in); wrong 1px `--wrong` ring + `i-x` at the row's right end + `--muted` text struck in `--wrong`; right 1px `--correct` ring + `i-ok` at the right end (8px left of Next on the row that carries it); a right row the student missed: dashed `--correct`; pending `--c1` dashed. Closed rows never dim. Pick-all: the square badge is the glyph slot (1px ring + glyph in the state colour). Pills: no badge, the label takes the state colour. Try pips: 8px, used = filled `--wrong`, left = hollow `--line`.
- Do: tap again to deselect; keys A to E, 1 to 5, arrows (existing keys; see Keyboard in §5).
- Don't: submit on the first tap; color the whole row red or green.

### Toast (`#toast`)

- Two jobs, one look: the wrong-answer note ("One more try, so choose wisely.") and the new-device onboarding notes (under 10 words each, once per device).
- Sugar reward onboarding (T37, Tony, Oct 15; `rwTip()` in app.js, keys `stem-ob-rw-<beat>` = times shown): the HUD explains itself with this same toast, caret on the piece. First right answer, on the coin: "Points always go up and never let you down." A closed miss, on the count: "Got it wrong first time? Keep your progress.", then "Third time's the charm.", then "Triple kill?" Third right in a row, on the level star: "Yay, 3 ducks in a row! See your progress here." (it replaces that one "3 cracked" note). Sugar only; never stacks; a piece not on screen waits.
- Anatomy: page `--paper`, `--bw` `--line` border (was 1.5px; unified Oct 3), `--shadow-1`, 10px radius, `--t-md` weight 400 in `--ink`, centred, one line where it fits (up to the column minus 2 × `--s4`), and a 14px caret that points at the thing it is about. No icon, no emoji, no yellow, no bold. `role="status"`, `aria-live="polite"`.
- Placement: `fixed`, next to its anchor, so nothing moves. Under the box: caret up. Above the anchor (the Scratchpad button): caret on the bottom edge. MC row: it lies on the struck choice's text (dead text) with the caret pointing at the X badge. Never cover a live control.
- Timing: in `--d-move`, stays 2 s, closes on tap or Esc. History: [TOAST.md](TOAST.md).
- Don't: use it for "Saved", "Correct" or anything already shown on the control; stack two toasts (a wrong-answer note wins over onboarding); a tinted or yellow slab.

### Cluck hint (`.cluck`)

- Anatomy: `--sheet` panel, 10px radius, `--s3`/`--s4` padding, the duck (`i-duck`, 28px, `--help`) at the top left, then the hint text. No title, no border, no side stripe.
- When: after a wrong answer, and again when a question with used tries is reopened.
- Voice: the only place for "QUACK." (see Copy voice).

### List and nav (`.qnav`, `.qlist`)

- Nav: list button (`.btn-label`: checklist icon + bank code), shuffle, then Prev / Next pushed to the right edge. Arrows are icon-only.
- List: in the flow under the bar (it covers nothing), a `--sheet` card, 10px radius, rows of at least `--btn`, number in `--muted` bold tabular, title in `--ink`. Current row: `--raised` + `--c1` number. Done marks (`i-ok`, `i-x`, 20px) at the right edge. Out-of-tries or right: title struck through and dimmed, still a link.
- Don't: counters ("3 / 12"), headings on the list, side stripes on the current row.
- Redo misses (`#qredo`, Oct 6): `.btn-label` with `i-redo` (a loop around an X), shown with the list like Shuffle; icon only on phones. In a round (`html.redo-on`) it reads "Exit redo" with the `--raised` "on" fill, the list button says "Redo" / "Redo done", and progress is the list's own ticks (no counter). Look A of `try/redo-variants.html`; B to E are Tony's alternatives, all inside this file's rules.

### Scratchpad (`.xb`)

- Anatomy: label row (`i-pen` + "Scratchpad" + autosave status in `--t-xs` `--hint`), then a `--field` textarea, `--bw` `--edge`, 8px radius, `--mono` 16px / 1.6, no line numbers. Cut and Copy are `.btn`s inside the bottom-right corner; the text never runs under them.
- States: focus = the field rule, 2px `--focus` edge, no outline (one ring, Tony). Copy done = `--correct` icon and border.
- Don't: a resize handle, a second scroll inside the page scroll when it can grow instead.

### Multitask (`#stage`, the pad page, side by side)

- Phone (under 720px): the pad is hidden. The Scratchpad button opens the pad page: the question on top in its `--qbox` box, a thin 3×32px bar (44px touch area), the pad below. No header row: the pad's tool row, inside its box, holds q | a (left) and collapse, Cut, Copy (right), in thumb reach.
- The top area hugs what it shows: at most ⅓ of a screen under 700px tall, 45% above. Dragging the bar sets a size until the page closes.
- The tile has a q | a switch: **q** shows the problem only (text and figure); **a** shows the answer control only, for every type. Opening goes to q with a big pad.
- Desktop and landscape tablet (720px and up): side by side, problem and answer left, pad right. Never the pad under the problem. Why: Tony, "pad down = bad". No Scratchpad button there.
- Side by side, both columns start with a label row (`i-doc` + "Question", `i-pen` + "Scratchpad"), so the question box and the pad box start level; the top bar spans the same width as the two columns (its ends sit on the content's edges). Why: Tony, Oct 3, "looks unbalanced".
- One surface per pane. Panes are siblings on `--paper`: a `--s2` gap, `--s4` where a handle sits. Never a card inside a card.
- The active side is shown by its switch (`.btn-tgl`: active letter in `--c1` on a `--raised` pill), not by a colored frame or a shadow.
- A switch is a `--d-move` crossfade (View Transition); with reduced motion it is instant. Hidden panes stay laid out and focusable; switching never resets scroll or caret.
- The pad always has at least 3 lines.
- [MULTITASK.md](MULTITASK.md) owns the details.

### Scratchpad button (`#padFab`, phone only)

- Anatomy: M3 extended FAB. `i-pen` + "Scratchpad", 56px tall, 16px radius, `--raised`, `--shadow-3`, `--ink`, `--t-sm` bold. No badge or dot (Tony, round 3b: it read as noise). `aria-expanded`.
- Behavior: tap opens the pad page. You can drag it; on release it snaps to the left or right edge, never under the dock or the home indicator, and never rests over an answer control. Hidden while an answer field has focus. Its place is remembered per device.
- Why: one tap to the pad, and the pad never covers the problem.

### Figure frame (`.fig`)

- The figure sits straight on the card: no frame, border, background or shadow of its own. Full column width; prose next to it stays 65ch.
- Everything else (strokes, colors, labels): [DESIGN-LANGUAGE.md](DESIGN-LANGUAGE.md).
- **Live figure in Cluck's message (`.wtext .wfig`, Claude path only; SCHEMA.md "Live figures").** The same `.fig` drawn by `Graph.render`, inline in the reply where Cluck put it, `--s3` above and below, no frame. At most one per reply; never in the peek. While its fence streams nothing shows (no raw JSON, no placeholder); it appears whole once closed, so the typing skips over it. A render error shows the alt sentence in `--muted` (`fig-off`). Reduced motion: drawn at once like the text. `role=img` + the alt as its label.
- **Cluck figures are warm (Tony, Oct 17: blue on the brown sheet clashed).** Colour has one owner: graph.js reads `--c1`/`--c2`/`--c3`/`--c1-hi`/`--body` from the cascade, and app.css remaps them on `.ai-box .fig, .cluck .fig` only: `--c1` = `--help`, `--c2` and `--c1-hi` = `--help-on`, `--c3` = 55% `--help` / 45% `--help-on`, `--body` = `--help-sheet`; ink, muted, grid and knockout already follow `.ai-box`. Fills are the series at graph.js's 22% alpha. Question-card figures keep the page tokens. Contrast on `--help-sheet` #17130f: `--help` 8.75, `--help-on` 14.3, c3 10.9, `--ai-text` 14.9, `--help-muted` 6.9 (labels need 4.5, strokes 3). `--ok`/`--bad` stay green/red (they carry meaning). Never hardcode a hex in graph.js; a new series colour is a new token here.

### Cluck's surfaces (`.ai-*`, sugar only)

**Phone sheet drags (r9, Tony's CHATBOX PICK r2: "draggable uptop, more round, round->full animation when u dragup"; ported from brain `chat-redesign-2026-10-13/unified-v4` frame.js, app.js `clDrag`, pure maths in `sheet.mjs`).** A 32x4 grab handle sits at the sheet's top edge (a real button, 128x44 hit area; the header sits 22px lower to clear it; tap or Enter/Space toggles dock / full) and the header drags too. Snap points: the docked top (`clTop`) and full screen; a drag that began on the full sheet comes back to the dock (never gone in one swipe); from the dock, 64px down (or a fling) still closes, the X stays. Melt spec (chatbox-v3): 30px top corners at the dock, running to 0 with the drag progress and back; an orange halo above the top edge (28%, gone at full); the ember top light at 100%; the ask field a floating pill (12px in, 14px corners, `--ai-pill`) that relaxes to the full bar with the progress (`--pp`); a hard dim (`--scrim`, 80% at the dock to 96% at full, fading as it slides away, never a blur). The body scrolls on its own: a drag that starts in it moves the sheet only to grow it (not full yet) or when it is already scrolled to the top. Spring 380/34; reduced motion = an instant snap. Desktop (`html.side`) has no handle. Step badges count 1, 2, 3 in order whatever digits the model typed (`steps.mjs`).

**Current (unified v5, Oct 17; newest wins over the history below):** the `.ai-skin` aliases that duplicated the warm family folded into `:root` (PALETTE-v3 §3): `--ai`, `--ai-soft`, `--ai-send`, `--ai-edge` → `--help`; `--ai-ink`, `--ai-send-ink` → `--help-ink`; `--ai-on-ct` → `--help-on`; `--ai-sheet` → `--help-sheet`; `--ai-muted` → `--help-muted`; `--ai-rule` → `--help-rule`; `--ai-strong` → `--ai-text` (no white inside a help surface). `.ai-skin` keeps only the sheet's own pair and wells: `--ai-ct`, `--ai-pill`, `--ai-text`, `--ai-tint`, `--ai-field`, the glow (`--glow` at .26) and the soft-UI shadows. The tables below are history.

Tony, Oct 4: "is it possible to let AI + explanation box... orange/warm/otherwise a NEW accent color? devise design language based on our style guidelines" (picked: warm tangerine). Everything Cluck says or shows: the explanation, the follow-up chat, the hint card's open solution. "AI = warm" across the app: the same family as the hint card and the Explain chip.

**Hybrid H (Tony, Oct 5: "dark almost neutral bkg WITH orange"; compare: design/mockups/cluck-colors.html).** The sheet is a neutral near-black (`--ai-sheet` #10131a, text 16.1:1, muted 8.0:1), not a warm brown: KaTeX and the step callouts read best on a calm surface, and it sits next to the site's navy without a third hue. Orange is the one accent: active tab, step circles, send, "N left", the 1px seam, the student's bubble (solid `--ai` with `--ai-ink`, never white on orange: 2.9:1). Ref 1's ember light only glows at the sheet's top (`--ai-glow`), brighter while Cluck types. Cluck's replies sit in a 1px outlined card (16px radius); his first explanation stays unboxed.

**RM3 (Tony, Oct 5 ~03:35, supersedes the box look above; mock: design/mockups/cluck-box.html ?v=RM3).** Title row (duck + "Cluck's steps", X), text tabs under it with one 2px `--ai` underline (no slab). Sheet `--ai-sheet` #17130f, wells `--ai-tint` one tone up, no borders. The container pair `--ai-ct` / `--ai-on-ct` (#4a2a10 / #ffdcc0) for step numbers, the boxed answer, the student's bubble and the LIVE chip (on "Cluck explains" while Cluck types or answers; no pulse with reduced motion). The ask field is a tonal pill (`--ai-pill`), round send `--ai-send` / `--ai-send-ink`; the turning rim shows only while Cluck types. One speaker, one format: replies sit on the sheet like the first answer, no card. Text capped at 58ch.

- Tokens on `.ai-skin`, never `:root` (scoped like `--rw-*`):
  | token | value | use |
  |---|---|---|
  | `--ai` | #ff9a3c | the one accent: the speaker name, the send button fill, the turns-left count, focus of the input |
  | `--ai-ink` | #2b1000 | text on `--ai` (8.4:1) |
  | `--ai-sheet` | #2a1d14 | Cluck's box: its own warm dark surface (a designed colour, not a tint over navy, which reads muddy) |
  | `--ai-field` | #1e140d | fields inside the box |
  | `--ai-text` / `--ai-muted` | #fff1e3 / #d9bfa8 | text inside the box (14.8:1 / 9.3:1) |
  | `--ai-rule` | #4a3526 | dividers inside the box |
  | `--ai-tint` | `--ai` 14% over `--ai-sheet` | the math callout and the step circles (text 11.3:1) |
  | `--ai-line` | `--ai` 45% over `--ai-sheet` | the box's and the callout's 1px edge (`--bw`) |
  Contrast: `--ai` on `--sheet` 7.0:1, on `--ai-sheet` 7.7:1.
- **Cluck's box is its own service on the site** (Tony, Oct 4: "cluck box should be also orange (think ... like a diff service on the same website). the button explanation + next should stay blue of our site"). `.ai-box` remaps the base tokens inside it (`--sheet`, `--field`, `--ink`, `--muted`, `--hint`, `--line`, `--edge`) to the `--ai-*` set, so buttons, fields and text follow without new rules. The student's bubble stays `--raised` (navy: the student is the site's side).
- The site's own actions stay site blue everywhere, in or out of the box: "Explanation" (outline `--c1`) and "Next question" (`.btn-go`). Only Cluck's own controls are tangerine (send button, tabs, turns left).
- One accent per surface. No glow beyond the sheet's own ember (`--ai-glow`, §2.7 "Fades and glows"), no gradient fill, no side stripe (§6.2); the casino look stays on the hint card's header and the Explain chip only.
- Math: inline `$..$` stays in the sentence; a step's equations go in a **callout**: centred display math, one equation per line, `--ai-tint` fill, 1px `--ai-line` edge, 10px radius, `--s3`/`--s4` padding. Problem scenes in it stay pure ink (DESIGN-LANGUAGE.md §3).
- Text: one renderer for Cluck's explanation AND the similar-steps card, so the two look like one family (Tony, Oct 4: "make the LOOK between AI box and the similar explanation section look unified").
- Steps (Gemini steps widget, Tony, Oct 4: "for EACH STEP, format it similar to gemini's app design ... add a bit more text to increase legibility and top down approachability"; ref: brain `projects/calc/_files/ref-ui/gemini-steps-ref.jpg`): an intro sentence with the key words in bold, then numbered steps. Each step: a 28px circle (1px `--ai` edge, `--ai-tint` fill, `--ai` digit), a 2px dotted `--ai-line` connector down to the next circle, a bold title (`--t-md`), an italic mono subtitle (`--t-xs`, `--muted`), 1-3 short bullets, then that step's equations in one callout. After the last step, a 1px `--line` rule and the answer sentence ("So the answer is **B, 2.0 m/s**." plus, after a wrong pick, one line on why that pick was tempting). Short follow-up replies skip the steps: 1-3 plain lines, a callout only when they show math.
- Chat: Cluck's messages left with the duck (`--mark`) and the name in `--ai`; as bubbles they are `.ai-box` with a 1px `--ai-line` edge; the student's right on `--raised`; the input is a `.ff`-style field with a solid `--ai` send button (`--ai-ink` icon) and "N left" in `--ai` beside it. 5 student turns per question, then the field is replaced by a site-blue "Next question" button (`.btn-go`).
- The hint card's open solution: the header keeps its full radius, `--s3` gap, then the solution through the same steps renderer, in its own `.ai-box` panel with a 1px `--ai-line` edge. Never glued under the header.

### Reward layer (sugar only: `.rw-*`, `.fx-*`)

- The one place the app looks like a game (Tony, Oct 4: "quiz pop but dark mode"). Code: `rewards/rewards.css`, `rewards/engine.js`, `rewards/fx.js`; plan: [REWARDS-WIRING.md](REWARDS-WIRING.md).
- Scope: the HUD row (`#rwHud`, in the top bar's flow, never fixed) and the FX layers (particles, slot reels, bursts, the drop banner). Its tokens are `--rw-*` on `.rw-skin`, never `:root`; it never styles the question, choices, feedback, Cluck or `#toast`. `tests/style.test.mjs` checks the scope.
- Exceptions to this file, inside that scope only: violet and sun fills with solid bevels, colour icons (Fluent Emoji images, MIT), the Press Start 2P title on LEVEL UP / BONUS (OFL, vendored), radii 12/20/28/pill, its own shadow scale.
- The drop banner is not a second toast: it shows only after a correct answer, hides `#toast` first, takes no taps (`pointer-events: none`) and is `aria-hidden` (app.js says the words once through `#sr`).
- A wrong answer never gets an FX node, a sound or reward words. Reduced motion: no particles, no reels spinning, text-only bursts.
- One blink (Oct 12): the reward FX play as one queue (`rewards/fx.js` seq): answer pulse, then sparks + coins, then the HUD, then slots, burst, banner; one group moves at a time, nothing loops (`tests/blink-fx.pw.mjs`). Reduced motion: one fade per reward.
- z ladder: stage 15, dock 20, brainrot 30, Scratchpad button 40, `#toast` 50, drop banner 55, update bar 60, splash 100, FX overlays 140, FX particles 150.

---

## 4. Iconography

- **Sprite only.** Every icon is a `<symbol>` in the `index.html` sprite, used with `<svg class="ico"><use href="#i-..."/></svg>`. No icon fonts, no inline one-off paths, no Unicode glyphs (✓ ✗ → ⚠) as icons.
- Drawing: 24×24 viewBox, 2px stroke, round caps and joins, no fill, `currentColor`. Exceptions: `i-duck` (filled character).
- Sizes: `--ico` (24px, grows on desktop) inside buttons and the arrow slot; 20px (`1.25rem`) next to text (verdict, label, list marks); the duck at 28px. No other sizes.
- Color is the state token of what it shows: `--ink` in buttons, `--correct` check, `--wrong` X, `--muted` lock and wait, `--mark` duck, `--field` on the filled arrow.
- Icon-only buttons have `aria-label`; icons next to words are `aria-hidden`.
- **Emoji policy.** No color emoji in the UI: they render differently on every OS, ignore the tokens, and read as AI slop. Keep the personality as drawn characters:
  - Cluck = `i-duck` in `--mark`. He is the only character.
  - New characters follow the same rule: one symbol, one token color, one place.

---

## 5. Copy voice

- Plain, short, active, sentence case. One job per string. Verdicts are icons in the answer box, not words (AUDIT.md); the screen-reader text ends with a period: "Correct." "Not quite. One more try." "Out of tries."
- Name things as the student sees them: "Scratchpad", "Copy", "Questions". Not system words.
- A button's label states its action ("Open a problem file", "Show the scratchpad"). The same action keeps the same word everywhere.
- Errors say what happened and what to do. No apology, no blame.
- No exclamation marks, no "Oops", no "Great job!". Calm, not cheerful.
- **Cluck's voice** ("QUACK." then one short question or nudge) appears only inside the Cluck hint. Never in buttons, toasts or errors.
- **Humour lives in content and easter eggs** (Cluck, a bank's own lines, the scratchpad placeholder "Paste GPT answer here, but me be sad...", lowercase where it is a wink). Never in chrome: buttons, toasts, errors, labels. The wrong-answer toast's "choose wisely" is the only edge it has. Scoped exception (Tony, Oct 15, mock protocol rule 8: humour only with his approval, sparse): the sugar reward onboarding toasts in §3, word for word, including their one exclamation mark. Sugar only; nothing else gets humour from this line.

### Keyboard

- No keyboard shortcuts. Keys only do what a focused control already means: the code box and list comboboxes, MC choice keys inside the focused group, Enter to submit a box, Esc to close. Nothing global (`[` / `]` prev / next removed Oct 2 ~23:59 PT). Why: Tony, "NO KEYBOARD SHORTCUT", "kill key shortcut".
- The sash takes arrows, Home and End only while focused, for assistive tech; it is never shown or documented.

---

## 6. Anti-patterns (do not ship)

From Anthropic's frontend-design skill, Claude Design, Impeccable, and Refactoring UI, adapted here:

1. A second filled color, gradient buttons, gradient text, gradient bands as decoration, or glows outside §2.7 "Fades and glows".
2. Colored side stripes (left-border accents) on cards, rows or toasts.
3. Cards inside cards; the same card + soft grey shadow on everything.
4. Shadows on things in the flow.
5. ALL-CAPS or letter-spaced labels and eyebrows above content; `01 / 02` numbering on things that are not a sequence.
6. Labels that repeat what an icon or the content already says; counters nobody needs.
7. Color emoji or Unicode glyphs as icons; icons from outside the sprite.
8. Entrance animations on load, hover lifts on rows, bounce or elastic easing, pulsing dots.
9. Anything that changes layout under the finger: a verdict line that pushes the scratchpad, a list that opens over text, a button that appears without reserved room.
10. Gray text on a colored fill; text under 4.5:1; control borders in `--line`.
11. Placeholder-only meaning (a field whose purpose is only in its placeholder) for anything except the answer syntax hint.
12. Raw hex, px font sizes or off-scale spacing in component CSS.
13. A tinted or yellow slab, an icon or an emoji in a toast.
14. A floating control that parks over a live control.
15. The pad under the problem on wide screens.
16. Humour in chrome; streaks, guilt or fake urgency anywhere.
17. A new keyboard shortcut.

---

## 7. Checklist before any UI commit

1. Only tokens: no new hex, font size, spacing, radius or duration in component CSS.
2. One filled control per field or step.
3. Every new icon is a sprite symbol, 2px stroke, `currentColor`, a listed size.
4. Status colors match the table in 2.1; nothing red or green that is not right or wrong.
5. Nothing moves when it appears: space is reserved, or it is `fixed`.
6. Every state is drawn: idle, hover, focus, disabled, wrong, right, locked.
7. One focus ring, 3:1 or more, visible on every control.
8. Text 4.5:1 on its real background, including `--raised`.
9. Targets 44px or more; works at 375×667 and 1920×1080; no horizontal scroll.
10. Every animation and transition has a reduced-motion path.
11. Copy is short, sentence case, no emoji; QUACK only in Cluck.
12. Impeccable scan: 0 findings (static and live, 390 and 1920).
13. `npm test` passes, including `tests/style.test.mjs` (this file as code: colours, shadows, radii, fonts, `--mark`, emoji, toast, key handlers; §9 items are its `todo` tests).
14. Floating things (toast, Scratchpad button) clear every live control at 375×667, 390×844 and in landscape.
15. No new keyboard shortcut; no humour in chrome.
16. Greyscale legibility (Tony, Oct 11): every changed screen and state must read in greyscale, alongside Impeccable. Shoot it with `filter: grayscale(1)` (or desaturate the PNG) at 393×852 and 1920×1080. Each state (idle, selected, right, wrong, locked, out of tries, sugar vs diet) must be distinguishable by lightness, shape, icon or text, never by hue alone; text keeps 4.5:1 and controls/icons 3:1 in greyscale too; in any reward or celebration art the one thing that matters (e.g. the prize coin) is still the most salient element. Fail = no go: redo, iterate, or ask Tony. Put the greyscale shots next to the colour ones in `design/shots/<slug>-<date>/`.

---

## 8. Sources

- Anthropic skills, frontend-design: https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md (local copy `/mnt/skills/public/frontend-design/SKILL.md`): one or two families, a clear scale, no all-caps labels, structure encodes information, motion answers an action, "spend your boldness in one place", plain active copy, errors without apology, the AI-default list (SaaS-card kit, one radius on everything, "→" on buttons, eyebrows).
- Anthropic skills, brand-guidelines and canvas-design (local `/mnt/skills/examples/brand-guidelines/SKILL.md`, `/mnt/skills/examples/canvas-design/SKILL.md`): a small fixed palette with named roles; minimal text, meaning carried by form and color. Brand colors themselves are not used here (the terracotta accent is on frontend-design's AI-default list).
- Claude Design system prompt (community archive): https://github.com/asgeirtj/system_prompts_leaks/blob/main/Anthropic/claude-design/claude-design.md: max 1 to 2 fonts, 0 to 2 accents, hit targets 44px or more, no emoji unless part of the brand, no rounded containers with a left-border accent, "every element earns its place", whitespace and minimalism.
- Impeccable: https://github.com/pbakaus/impeccable, https://impeccable.style, craft floor `https://raw.githubusercontent.com/pbakaus/impeccable/main/.claude/skills/impeccable/reference/craft-floor.md`: calm by default, one action per screen, never hide critical information; bans side-tab borders, card-in-card, gradient text, glows, bounce easing, pulsing dots, emoji or Unicode as icons; text 4.5:1; one authored motion moment.
- Refactoring UI (Wathan and Schoger), as already applied in [AUDIT.md](AUDIT.md), [FREEZE.md](FREEZE.md), [NAV.md](NAV.md): labels are a last resort, limit choices, fewer borders, one primary action, a spacing system, two-part shadows for elevation.
- Style precedents (§1): Calm Technology https://calmtech.institute/calm-tech-principles · Rams https://vitsoe.com/us/about/good-design · GOV.UK autism poster https://accessibility.blog.gov.uk/2016/09/02/dos-and-donts-on-designing-for-accessibility/ · W3C COGA https://www.w3.org/TR/coga-usable/ · iA Writer https://ia.net/topics/writer-vs-word · M3 canonical layouts https://developer.android.com/develop/ui/compose/layouts/adaptive/canonical-layouts · Atkinson Hyperlegible https://en.wikipedia.org/wiki/Atkinson_Hyperlegible.
- This repo: [DESIGN-LANGUAGE.md](DESIGN-LANGUAGE.md), [SWAP.md](SWAP.md), [DONE.md](DONE.md), [TOAST.md](TOAST.md), `app.css`, `nav.css`, `design/explain-box.css`, `index.html`, `design/specimen.html`.

---

## 9. Open inconsistencies

Re-find by selector (line numbers drift). Remove a row in the commit that fixes it.

| # | where | what | fix |
|---|---|---|---|
| 3 | `design/explain-box.css` textarea | Radius 6px; every other field is 8px. | 8px. |
| 5 | `app.css` `.q.closed`, `.ff.shut`; `nav.css` `.qnav .btn:disabled` | Disabled is 0.45 for buttons, 0.5 for closed answers; nav.css copies the button rule. | One `.btn:disabled` rule (0.45); closed answers 0.45; delete the nav.css copy. |
| 6 | `app.css`, `nav.css` transitions | Durations .12 .15 .2 .22 .25 .3 s, two easings. | Add `--d-fast` 120ms, `--d-move` 200ms, `--d-dim` 300ms, `ease-out`. |
| 7 | `app.css` `.dock-bottom .dock` | Raw upward shadow. | Token `--shadow-up`. |
| 9 | `app.css` `.ico` | 1.5rem, does not grow with `--ico` on desktop. | `width/height: var(--ico)`. |
| 10 | `app.css`, `nav.css` icons next to text | 1.1rem, 1.25rem, 20px, 1.75rem. | `--ico-sm: 1.25rem`; the duck stays 1.75rem. |
| 11 | `app.css` `.p`, `.boxed .q` | Side padding 1.25rem, off the scale. | `--s4` or `--s5`. |
| 12 | `design/explain-box.css` | Off-scale margins and padding (0.35, 0.75, 0.9, 0.95rem). | Scale tokens; delete the label rule app.css overrides. |
| 13 | `nav.css` `.dock-bottom .qnav/.qlist`; `app.css` stage and start page | `52rem` written out instead of `var(--col)`. | `var(--col)`. |
| 14 | `nav.css` gone rows | `--hint` is 4.46:1 on `--sheet`, 3.92:1 on `--raised`. | Raise `--hint` to `#899ab3`, or `--muted` for the struck title. |
| 15 | `design/DESIGN-LANGUAGE.md`, `design/specimen.html` | A site `--blue` #3a67d8 the app does not have. | Remove; specimen buttons use `.btn` / `--c1`. |
| 16 | `app.css` desktop tokens vs `app.js` `sideMQ` | Desktop type scale switches at `700.02px` + `pointer: fine`; side by side at 720px. | One breakpoint constant. |
