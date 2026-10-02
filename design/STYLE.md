# Style: the one design source of truth

Owner: Tony. Applies to every page and mockup in this repo: `index.html`, `app.css`, `nav.css`, `design/explain-box.css`, `design/mockups/*`.
Figures and graphs (strokes, arrowheads, dashes, labels, bodies): see [DESIGN-LANGUAGE.md](DESIGN-LANGUAGE.md). This file does not repeat it.
Reference build of the tokens: `app.css` `:root`. If this file and `app.css` disagree, fix one of them in the same commit.

Write new rules here, short and imperative. Record the why in one clause. Put long histories in the feature's own `design/*.md`.

---

## 1. Principles

1. **One system.** Every control comes from the same tokens and the same `.btn` / field rules. Why: the student learns the page once.
2. **Calm (baby-friendly).** Dark, quiet surfaces; color only for state; no shouting, no scolding. Why: a drill is stressful already.
3. **Icons over words.** A known icon in a state color replaces a label. Words only where no icon is clear. Why: less to read, faster to scan.
4. **One primary action.** Only one filled control is visible per field or step: the submit arrow (`.btn-go`). Everything else is outlined. Why: the eye goes to the next step.
5. **Nothing jumps.** Reserve space for what can appear (the arrow slot, the verdict icon, the copy band). Overlays are `fixed`; in-flow panels push content only after a tap. Why: nothing moves under a finger.
6. **Motion answers a tap.** Animate only what the person caused (open, swap, confirm). No ambient motion except a "busy" signal. Why: motion that explains, never decorates.
7. **Show state, never hide it.** Right, wrong, tries left and locked are always visible on the thing they are about. Why: the student never has to guess.

---

## 2. Tokens

All values live in `app.css :root`. Use the token, never the raw value. Desktop (`min-width: 700.02px` and `pointer: fine`) raises the type scale, `--btn` and `--ico` through the tokens only.

### 2.1 Color

| token | hex | role |
|---|---|---|
| `--paper` | #151d2b | page background, the dock, the freeze strip |
| `--sheet` | #1d2839 | surfaces: problem card, list card, Cluck, toast, outline buttons |
| `--field` | #111826 | inside text fields; ink on filled buttons |
| `--raised` | #243149 | hover, selected, current row, open state |
| `--ink` | #e7edf6 | body text, icons in buttons |
| `--muted` | #a2b3cb | secondary text, hover border, locked state |
| `--hint` | #7d8ea8 | placeholder, autosave status, line numbers, "gone" list rows (lowest text) |
| `--line` | #34445d | dividers and grid only. Never a control boundary (1.5:1) |
| `--edge` | #6b7f9e | the boundary of every control and field (3.64:1 on sheet) |
| `--focus` | #8fb0ff | focus ring, focused field border, caret |
| `--c1` / `--c1-hi` | #7ab8ff / #a3cdff | the primary action fill and its hover; selected choice; current item; forces in figures |
| `--c2`, `--c3` | #ffb86b, #ff8fc8 | figure series only (and Cluck's beak). Not for UI state |

**Status colors.** Each one means one thing. Use them on icons, borders and short words; never as a large fill.

| token | means | use it for | never |
|---|---|---|---|
| `--ok` | right | check icon, right choice border and badge, right answer text, Copy done | decoration, "success" toasts for routine saves |
| `--bad` | wrong | X icon, dashed border on a wrong answer, strike on a wrong choice, list X marks, the entry error line | hover, delete buttons, emphasis |
| `--mark` | careful / look here | warning: one try left (toast ring, the drawn devil); Cluck's duck; figure highlight | a second series next to `--c2`; a full-surface fill |
| `--muted` | locked / waiting | lock icon (in the answer box when out of tries), checking | (see table above) |

There is no separate warning token: `--mark` is the warning color. Do not add yellow, amber or orange variants.

Contrast floor: text 4.5:1 on its real background (check `--raised` too), control boundaries and icons 3:1.

### 2.2 Type

- Families: **Atkinson Hyperlegible** (UI and prose) and **Atkinson Hyperlegible Mono** (`--mono`: typed text where columns line up: answers, scratchpad, gutter). The code box uses the proportional face (Tony). KaTeX for math. No third family.
- Scale (phones; desktop raises all three):

| token | px | for |
|---|---|---|
| `--t-md` | 18 | problem text, choices, typed answers, toast |
| `--t-sm` | 16 | labels, how line, scratchpad, list button, error line |
| `--t-xs` | 14 | status only (autosave) |
| `--t-lg` | 28 (desktop 36) | the start page's title only |

  Figure labels are fixed at 16 / 14 px (DESIGN-LANGUAGE.md). Line height `--lh` 1.55 for prose, 1.4 for controls, 1 for single-line inputs.
- Weights: 400 and 700 only. Bold means "a name or a state": verdict words, labels, list numbers, the code. Never bold a word inside a sentence for emphasis.
- Fields are at least 16px (iOS zoom). Prose is at most 65ch wide.
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
| 10px | surfaces that hold content: problem card, list card, Cluck, toast, swap card |
| 8px | controls: `.btn`, fields (`.ff`, code box, scratchpad), choices, list rows |
| 6px | something inside a control (the swap toggle's pill, Paste / Go inside the code box, a suggestion row) |
| pill / 50% | the start page's field and the round buttons inside it (nested: outer radius minus the 4px gap) |
| 4px / 3px | inline code / figure label knockout |
| 50% | choice badges only |

### 2.6 Borders

- Controls and fields: 2px `--edge`. Hover: `--muted`. Focus: `--focus`. Selected: `--c1`. Right: `--ok` solid. Wrong: `--bad` **dashed** (dash = not accepted, so it survives grayscale).
- Surfaces have no border. A background change separates them.
- Dividers: 1px `--line` (part rows, table rows, the stuck strip's bottom).
- No colored side stripes on anything.

### 2.7 Elevation

A shadow means "this floats over content". Allowed only on:

| layer | shadow |
|---|---|
| freeze strip, while stuck | `--shadow-3` |
| phone dock (fixed, bottom) | the upward version of `--shadow-3` |
| toast | `--shadow-3` |
| code suggestions (floats over the page) | `--shadow-3` |
| start page field | `--shadow-1` at rest, `--shadow-3` on hover / focus (Tony: "popping, like Google"; the only thing on that page) |

Nothing in the flow gets a shadow: no cards, no buttons, no list. No glows.

### 2.8 Motion

| token (proposed) | value | for |
|---|---|---|
| `--d-fast` | 120ms | hover, border and color changes |
| `--d-move` | 200ms | show / hide, slide, swap crossfade, toast in and out, splash out |
| `--d-dim` | 300ms | the lock-in dimming of the rest of the page |

- Easing: `ease-out` (enter and feedback). No bounce, no elastic, no spring overshoot.
- Move at most 14px. Animate `opacity` and `transform` only; never animate layout (height, top, width).
- Loops: only for "busy" (autosave sweep, splash). Stop them the moment the work ends.
- Reduced motion: `app.css` turns off every transition. Every `@keyframes` and every View Transition needs its own `prefers-reduced-motion` rule: no movement; a fade of `--d-move` or less, or an instant change.

---

## 3. Components

### Button (`.btn`)

- Anatomy: 48×48 (`--btn`), 2px `--edge` border, 8px radius, `--sheet` fill, one 24px sprite icon in `--ink`. `aria-label` and `title` when there is no word.
- States: hover `--raised` + `--muted` border; active 1px down; focus 3px `--focus` outline at 2px offset; disabled 45% opacity, no hover, no press.
- Variants: `.btn-go` (primary: `--c1` fill, `--field` icon, `--c1-hi` hover) is the only filled button. `.btn-label` adds one short word after the icon, same height. `.btn-tgl` is the two-icon switch.
- Do: one `.btn-go` visible per field. Put the arrow flush inside its field.
- Don't: text-only buttons, a "→" after a word, a second filled color, round or pill buttons.

### Code box (`.code-box`) and suggestions

- Anatomy: in the bar, the same height (`--btn`), surface (`--sheet`), 2px `--edge` border and 8px radius as the buttons beside it, so tops and bottoms line up. Text: the bar's label text (`--t-sm` bold, Atkinson Hyperlegible, uppercase because codes are). Paste (empty box) or the Go arrow (typed) sits flush inside the border: `--btn` minus 4px, 6px radius. Paste is an icon button (transparent, `--muted` icon, `--raised` + `--ink` on hover); Go is the one filled control.
- Focus: one ring. The border turns `--focus` and a 1px inset makes it 3px. No outline around it.
- Suggestions (`suggest.mjs`): while typing, the codes this browser knows (opened here before, newest first; the live bank and its list; an uploaded file) that contain the typed text. **Banks first, then questions**, order kept inside each group. A `--sheet` card, 10px, `--shadow-3`, floating under the bar (above it when the bar is the phone dock). Rows `--btn` tall: `i-list` for a bank, `i-doc` for a question, the code in `--t-sm` bold; hover / marked row `--raised`. Combobox keys: ArrowDown / ArrowUp, Enter, Escape. The browser's own form history is off (no `name`).

### Start page (`html.start`: no problem open)

- Like a search home page: one line of title, "Upload or type code to start." (`--t-lg` bold `--ink`, centred), over one wide field (up to 40rem), both centred on the page. On phones the area is the part above the keyboard (`--kb-top` / `--kb-bottom`), so the field never hides under it.
- The field: a pill, `--sheet`, 2px `--edge`, `--shadow-1`; hover `--muted` border + `--shadow-3`; focus `--focus` border (3px, as the code box) + `--shadow-3`. Upload (left) and Paste / Go (right) are round 48px buttons inside it, transparent until hovered; Go stays the one filled control.
- Once a problem opens, the bar goes back to its place. Nothing animates in on load; hover and focus transitions only, off with reduced motion.

### Answer box (`.ff`)

- Anatomy: 52px tall (`--fld`), `--field` fill, 2px border, 8px radius, optional muted lead text, `--mono` 18px input, and a 48px **arrow slot** on the right that is always reserved.
- States:

| state | border | arrow slot | text |
|---|---|---|---|
| idle, empty | `--edge` | empty (arrow hidden) | `--hint` placeholder |
| typed | `--edge` | `.btn-go` arrow | `--ink` |
| focus | `--focus` | arrow if typed | `--ink` |
| wrong, try left | `--bad` dashed | `i-x` in `--bad` | `--ink`, editable |
| correct | `--ok` | `i-ok` in `--ok` | `--ok`, read-only |
| locked (out of tries) | `--edge`, 50% opacity | `i-lock` in `--muted` | read-only, not-allowed cursor |

- Do: show the verdict icon in the arrow slot, so the result sits where the eye already is. Keep the box the same size in every state.
- Don't: put the verdict in a new line that pushes content; show a glow; use both a colored border and a focus outline (one ring).

### Multiple-choice choice (`.opt`)

- Anatomy: full-width row, min 52px, `--sheet` fill, 2px border, 8px radius, a 2rem round letter badge, the text, and the arrow room on the right. 2 choices (or 3 short ones) become one row of pills without badges (`fitChoices()`).
- States: idle (boundary, see Inconsistencies), hover `--edge`/`--muted`, selected `--c1` border + `--raised` + filled `--c1` badge + the arrow inside; others fade to 35% and the page dims (lock-in); wrong `--bad` dashed + struck text; right `--ok` border + filled `--ok` badge or check; pending `--c1` dashed.
- Do: tap again to deselect; keys A to E, 1 to 5, arrows.
- Don't: submit on the first tap; color the whole row red or green.

### Toast / nudge (`#toast`)

- One job: tell the student about a state change that has no other place, today only "one try left".
- Anatomy: `--sheet` surface, 10px radius, 2px `--mark` ring, `--shadow-3`, `--t-md` bold text, the drawn devil icon at the end. `role="status"`, `aria-live="polite"`.
- Placement: anchored **under the answer box it is about** (MC: under the struck choice), right edges aligned, `position: fixed` so nothing moves. If that would cover a live control, flip above the box. The variant is being picked in [TOAST.md](TOAST.md); that file owns the details.
- Timing: in `--d-move`, stays 2.5 s, closes on tap or Esc.
- Don't: use it for "Saved", "Correct" or anything already shown on the control; stack two toasts; use a solid yellow slab.

### Cluck hint (`.cluck`)

- Anatomy: `--sheet` panel, 10px radius, `--s3`/`--s4` padding, the duck (`i-duck`, 28px, `--mark`) at the top left, then the hint text. No title, no border, no side stripe.
- When: after a wrong answer, and again when a question with used tries is reopened.
- Voice: the only place for "QUACK." (see Copy voice).

### List and nav (`.qnav`, `.qlist`)

- Nav: list button (`.btn-label`: checklist icon + bank code), shuffle, then Prev / Next pushed to the right edge. Arrows are icon-only.
- List: in the flow under the bar (it covers nothing), a `--sheet` card, 10px radius, rows of at least `--btn`, number in `--muted` bold tabular, title in `--ink`. Current row: `--raised` + `--c1` number. Done marks (`i-ok`, `i-x`, 20px) at the right edge. Out-of-tries or right: title struck through and dimmed, still a link.
- Don't: counters ("3 / 12"), headings on the list, side stripes on the current row.

### Scratchpad (`.xb`)

- Anatomy: label row (`i-pen` + "Scratchpad" + autosave status in `--t-xs` `--hint`), then a `--field` textarea, 2px `--edge`, 8px radius, `--mono` 16px / 1.6, line numbers in `--hint`. Cut and Copy are `.btn`s inside the bottom-right corner; the text never runs under them.
- States: focus = `--focus` border only (one ring, Tony). Copy done = `--ok` icon and border.
- Don't: a resize handle, a second scroll inside the page scroll when it can grow instead.

### Panes and split (`#stage`, multitask)

- One surface per pane. Panes are siblings on `--paper`, separated by a `--s2` gap (or a 1px `--line` divider when they touch). Never a card inside a card.
- The active pane is shown by its switch (`.btn-tgl`: active icon in `--c1` on a `--raised` pill), not by a colored frame or a shadow.
- A pane switch is a `--d-move` crossfade (View Transition); with reduced motion it is instant.
- A pane that is hidden stays laid out and focusable; switching never resets its scroll or caret.
- Minimum content per pane: the problem pane always shows the answer control; the scratchpad pane always has at least 3 lines.
- [MULTITASK.md](MULTITASK.md) owns the layout; it uses these rules.

### Figure frame (`.fig`)

- The figure sits straight on the card: no frame, border, background or shadow of its own. Full column width; prose next to it stays 65ch.
- Everything else (strokes, colors, labels): [DESIGN-LANGUAGE.md](DESIGN-LANGUAGE.md).

---

## 4. Iconography

- **Sprite only.** Every icon is a `<symbol>` in the `index.html` sprite, used with `<svg class="ico"><use href="#i-..."/></svg>`. No icon fonts, no inline one-off paths, no Unicode glyphs (✓ ✗ → ⚠) as icons.
- Drawing: 24×24 viewBox, 2px stroke, round caps and joins, no fill, `currentColor`. Exceptions: `i-duck` (filled character).
- Sizes: `--ico` (24px, grows on desktop) inside buttons and the arrow slot; 20px (`1.25rem`) next to text (verdict, label, list marks); the duck at 28px. No other sizes.
- Color is the state token of what it shows: `--ink` in buttons, `--ok` check, `--bad` X, `--muted` lock and wait, `--mark` duck and devil, `--field` on the filled arrow.
- Icon-only buttons have `aria-label`; icons next to words are `aria-hidden`.
- **Emoji policy.** No color emoji in the UI: they render differently on every OS, ignore the tokens, and read as AI slop. Keep the personality as drawn characters:
  - Cluck = `i-duck` in `--mark`.
  - The 😈 = a drawn `i-imp` symbol (horned face, 2px stroke, `currentColor`) shown in `--mark` at 20px after the toast text, `aria-hidden`. The words carry the meaning. Use it only for the one-try-left nudge.
  - New characters follow the same rule: one symbol, one token color, one place.

---

## 5. Copy voice

- Plain, short, active, sentence case. One job per string. Verdicts are icons in the answer box, not words (AUDIT.md); the screen-reader text ends with a period: "Correct." "Not quite. One more try." "Out of tries."
- Name things as the student sees them: "Scratchpad", "Copy", "Questions". Not system words.
- A button's label states its action ("Open a problem file", "Show the scratchpad"). The same action keeps the same word everywhere.
- Errors say what happened and what to do. No apology, no blame.
- No exclamation marks, no "Oops", no "Great job!". Calm, not cheerful.
- **Cluck's voice** ("QUACK." then one short question or nudge) appears only inside the Cluck hint. Never in buttons, toasts or errors.
- The devil's tone ("choose wisely") appears only in the one-try-left nudge.

---

## 6. Anti-patterns (do not ship)

From Anthropic's frontend-design skill, Claude Design, Impeccable, and Refactoring UI, adapted here:

1. A second filled color, gradient buttons, gradient text, or glows.
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

---

## 8. Sources

- Anthropic skills, frontend-design: https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md (local copy `/mnt/skills/public/frontend-design/SKILL.md`): one or two families, a clear scale, no all-caps labels, structure encodes information, motion answers an action, "spend your boldness in one place", plain active copy, errors without apology, the AI-default list (SaaS-card kit, one radius on everything, "→" on buttons, eyebrows).
- Anthropic skills, brand-guidelines and canvas-design (local `/mnt/skills/examples/brand-guidelines/SKILL.md`, `/mnt/skills/examples/canvas-design/SKILL.md`): a small fixed palette with named roles; minimal text, meaning carried by form and color. Brand colors themselves are not used here (the terracotta accent is on frontend-design's AI-default list).
- Claude Design system prompt (community archive): https://github.com/asgeirtj/system_prompts_leaks/blob/main/Anthropic/claude-design/claude-design.md: max 1 to 2 fonts, 0 to 2 accents, hit targets 44px or more, no emoji unless part of the brand, no rounded containers with a left-border accent, "every element earns its place", whitespace and minimalism.
- Impeccable: https://github.com/pbakaus/impeccable, https://impeccable.style, craft floor `https://raw.githubusercontent.com/pbakaus/impeccable/main/.claude/skills/impeccable/reference/craft-floor.md`: calm by default, one action per screen, never hide critical information; bans side-tab borders, card-in-card, gradient text, glows, bounce easing, pulsing dots, emoji or Unicode as icons; text 4.5:1; one authored motion moment.
- Refactoring UI (Wathan and Schoger), as already applied in [AUDIT.md](AUDIT.md), [FREEZE.md](FREEZE.md), [NAV.md](NAV.md): labels are a last resort, limit choices, fewer borders, one primary action, a spacing system, two-part shadows for elevation.
- This repo: [DESIGN-LANGUAGE.md](DESIGN-LANGUAGE.md), [SWAP.md](SWAP.md), [DONE.md](DONE.md), [TOAST.md](TOAST.md), `app.css`, `nav.css`, `design/explain-box.css`, `index.html`, `design/specimen.html`.

---

## 9. Inconsistencies found

Line numbers are from the working tree on 2026-10-01 (other agents are editing `app.css`, `index.html` and `app.js`; re-find by selector). Nothing below is fixed yet.

| # | where | what | fix |
|---|---|---|---|
| 1 | `app.css:48`, `app.css:213` | (Code box: fixed Oct 2, one ring.) Code box and answer box show a `--focus` border **and** a 3px outline: two rings. The scratchpad (`app.css:313`) has one ring, by Tony's rule. | Fields: `--focus` border only, no outline. Buttons keep the outline. |
| 2 | `design/explain-box.css:30` | Scratchpad focus sets the outline that `app.css:313` then removes. | Drop the outline in explain-box.css. |
| 3 | `app.css:172`, `app.css:175` | MC choice boundary is `--line` (1.51:1, fails 3:1); hover goes to `--edge`. Buttons and fields use `--edge` / `--muted`. | Choice idle `--edge`, hover `--muted`, like `.ff`. Keep `--line` only for dividers. |
| 4 | `design/explain-box.css:22` | Scratchpad radius 6px; every other field is 8px. | 8px. |
| 5 | `app.css:284`, `app.css:431` | Cluck panel and toast use 8px; they are surfaces (problem card, list are 10px). | 10px (toast: in the TOAST.md variant). |
| 6 | `app.css:105`, `nav.css:9`, `app.css:225`, `app.css:266` | Disabled is 0.45 opacity for buttons, 0.5 for closed answers. `nav.css:9-11` copies the `.btn-go:disabled` rule. | One `.btn:disabled` rule in app.css (0.45, no hover, no press); closed answers 0.45. Delete the nav.css copy. |
| 7 | `app.css:76, 96, 118, 139, 173, 187, 328, 331, 342, 345, 424, 433`; `nav.css:52` | Six durations (.12 .15 .2 .22 .25 .3 s) and two easings (`ease`, `ease-out`). | Add `--d-fast` 120ms, `--d-move` 200ms, `--d-dim` 300ms and use `ease-out`: .15 → fast; .22 and .25 → move; .3 → dim. |
| 8 | `design/TOAST.md` vs `app.css:433` | Toast in-time 320ms in the doc, 200ms in the CSS. | `--d-move` (200ms) in both. |
| 9 | `app.css:64` | Dock shadow is a raw value. | Token `--shadow-up` (the upward `--shadow-3`). |
| 10 | `app.css:18`, `app.css:20` | `--shadow-1` and `--shadow-4` are defined and used nowhere (the subject menu is gone). FREEZE.md still describes `--shadow-4`. | Delete both tokens; update FREEZE.md. |
| 11 | `app.css:37` vs `--ico` | Bare `.ico` is 1.5rem, so it does not grow with `--ico` on desktop. | `.ico { width: var(--ico); height: var(--ico); }`. |
| 12 | `app.css:180, 281, 285, 294`; `nav.css:63`; `app.css:76` | Icon sizes 1.1rem, 1.25rem, 20px, 1.75rem: four values in two units. | Add `--ico-sm: 1.25rem` for icons next to text (verdict, label, list marks, bar tab, badge); duck at 1.75rem is the one character size. |
| 13 | `app.css:142`, `app.css:271` | Card side padding 1.25rem (20px) is off the spacing scale. | `--s4` (phones already use it, `app.css:322`) or `--s5`. |
| 14 | `design/explain-box.css:2, 3, 4, 17` | Off-scale values: margins 0.35rem / 0.75rem, hint 0.95rem, padding 0.9rem; label 1rem in `--ink` (app.css overrides it to `--t-sm` `--muted`). | `--s2` / `--s3` margins, `--t-sm` hint, `--s3` / `--s4` padding; delete the label rule that app.css overrides. |
| 15 | `nav.css:22`, `nav.css:23`, `app.css:353` | Column width written as `52rem` instead of `var(--col)`. | `var(--col)`. |
| 16 | `nav.css:66-67` | "Gone" rows use `--hint`: 4.46:1 on `--sheet` and 3.92:1 on `--raised` (current row). Below 4.5:1. | Raise `--hint` to `#899ab3` (4.56 on raised, 5.19 on sheet), or use `--muted` for the struck title. |
| 17 | `app.js:22` | The toast uses a color emoji (😈). | Draw `i-imp` in the sprite; render it in `--mark` after the text (Iconography). |
| 18 | `app.js:33-34` + `app.js:423, 463, 514` | A wrong answer says "Not quite. One more try." in the verdict **and** "One more try, so choose wisely." in the toast: the same fact twice. | Done (Oct 1): the verdict words are gone; the icon in the arrow slot and the toast stay (AUDIT.md "Kept on purpose"). |
| 19 | `design/DESIGN-LANGUAGE.md:90`, `design/specimen.html:22-23, 58` | Refer to a site `--blue` #3a67d8 and `#fff` on it. The app has no `--blue`; the primary fill is `--c1` with `--field` ink. | Remove `--blue` from both; specimen buttons use `.btn` / `--c1`. |
| 20 | `index.html:123` | Paste was a filled `.btn-go` in the code box (Tony: a light-blue slab, unlike every other button). | Fixed Oct 2: Paste is an outlined-family icon button; only the Go arrow is filled, and the two stay mutually exclusive. |
