# Style: the one design source of truth

Owner: Tony. Applies to every page and mockup in this repo: `index.html`, `app.css`, `nav.css`, `design/explain-box.css`, `design/mockups/*`.
Figures and graphs (strokes, arrowheads, dashes, labels, bodies): see [DESIGN-LANGUAGE.md](DESIGN-LANGUAGE.md). This file does not repeat it.
Reference build of the tokens: `app.css` `:root`. If this file and `app.css` disagree, fix one of them in the same commit.

Write new rules here, short and imperative. Record the why in one clause. Put long histories in the feature's own `design/*.md`.
When a ruling changes, edit the rule here and add one line to the feature doc. Never keep two versions.

---

## 1. Principles

**Style: Calm Textbook.** A quiet page that teaches. Typography is the interface; the student always sees one clear next step; small jokes live in the content, never in the chrome.
**Precedents:** Calm Technology (Weiser and Brown; Amber Case), Rams' "less but better", the GOV.UK autism design poster, W3C COGA, Tufte's data-ink, iA Writer, Apple HIG and Material 3 canonical layouts, tiling window managers, Atkinson Hyperlegible (Braille Institute). Impeccable is a hard gate (§7).

1. **One system.** Every control comes from the same tokens and the same `.btn` / field rules. Why: the student learns the page once.
2. **Calm (baby-friendly).** Dark, quiet surfaces; color only for state; no shouting, no scolding. Why: a drill is stressful already.
3. **Icons first, words when asked.** A known icon in a state color replaces a label. Words only where no icon is clear or Tony names an exception: the Scratchpad button, the bank-code list button. Why: less to read, and a familiar icon with a word is still familiar.
4. **One primary action.** Only one filled control is visible per field or step: the submit arrow (`.btn-go`). Everything else is outlined. Why: the eye goes to the next step.
5. **Nothing jumps.** Reserve space for what can appear (the arrow slot, the verdict icon, the copy band). Overlays are `fixed`; in-flow panels push content only after a tap. A floating thing never rests on a live control. Why: nothing moves under a finger.
6. **Motion answers a tap.** Animate only what the person caused (open, swap, confirm). No ambient motion except a "busy" signal. Direct manipulation is not animation: a pane or a button may follow the finger. Why: motion that explains, never decorates.
7. **Show state, never hide it.** Right, wrong, tries left and locked are always visible on the thing they are about. Why: the student never has to guess.
8. **Improve by removing.** Before you add a control, try to remove one. Why: less, but better.
9. **Calm at the edge of attention.** Help waits at the edge and comes forward only when needed; when something fails, it fails quietly (no modal, no alarm). Why: the problem holds the attention, not the chrome.
10. **Honest.** No streaks, no guilt, no fake urgency, no trends. Why: the student trusts the page under exam stress.
11. **One tap away is not hidden.** A feature behind an always-visible control is not hidden; a feature with no visible control is unshipped. Why: the phone pad sits behind the Scratchpad button, which is always on screen.

---

## 2. Tokens

All values live in `app.css :root`. Use the token, never the raw value. Desktop (`min-width: 700.02px` and `pointer: fine`) raises the type scale, `--btn` and `--ico` through the tokens only.

### 2.1 Color

| token | hex | role |
|---|---|---|
| `--paper` | #151d2b | page background, the dock, the freeze strip, toast |
| `--qbox` | #192232 | the question box, everywhere (card, pad-page tile, keyboard-up card, desktop strip): halfway between `--paper` and `--sheet` (Tony, Oct 3) |
| `--sheet` | #1d2839 | surfaces: list card, Cluck, outline buttons, the q \| a switch |
| `--field` | #111826 | inside text fields; ink on filled buttons |
| `--raised` | #243149 | hover, selected, current row, open state, the Scratchpad button |
| `--ink` | #e7edf6 | body text, icons in buttons |
| `--muted` | #a2b3cb | secondary text, hover border, locked state |
| `--hint` | #7d8ea8 | placeholder, autosave status, "gone" list rows (lowest text) |
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
| `--mark` | look here | Cluck's duck; figure highlight | a warning, a toast, a second series next to `--c2`, a full-surface fill |
| `--muted` | locked / waiting | lock icon (in the answer box when out of tries), checking | (see table above) |

There is no warning color. `--mark` is the only yellow, and it is never a warning. Do not add yellow, amber or orange.

Contrast floor: text 4.5:1 on its real background (check `--raised` too), control boundaries and icons 3:1.

### 2.2 Type

- Families: **Atkinson Hyperlegible** (UI and prose) and **Atkinson Hyperlegible Mono** (`--mono`: typed text where columns line up: answers, scratchpad, gutter). The code box uses the proportional face (Tony). KaTeX for math. No third family. The q | a switch letters are KaTeX_Math italic at 1.5rem (a math face, not a UI family; Tony's pick, MULTITASK.md Round 3b).
- Scale (phones; desktop raises all three):

| token | px | for |
|---|---|---|
| `--t-md` | 18 | problem text, choices, typed answers, toast (weight 400) |
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
| 16px | the Scratchpad button (M3 FAB) |
| 10px | surfaces that hold content: problem card, list card, Cluck, toast, pane tiles |
| 8px | controls: `.btn`, fields (`.ff`, code box, scratchpad), choices, list rows |
| 6px | something inside a control (the q | a switch's active pill, Paste / Go inside the code box, a suggestion row) |
| pill / 50% | the start page's field and the round buttons inside it (nested: outer radius minus the 4px gap) |
| 4px / 3px | inline code / figure label knockout |
| 50% | choice badges only |

### 2.6 Borders

- Controls and fields: 2px `--edge`. Hover: `--muted`. Focus: `--focus`. Selected: `--c1`. Right: `--ok` solid. Wrong: `--bad` **dashed** (dash = not accepted, so it survives grayscale).
- Surfaces have no border. A background change separates them.
- Dividers: 1px `--line` (part rows, table rows, the stuck strip's bottom). The toast's edge is the one 1.5px `--line` border.
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

Nothing in the flow gets a shadow: no cards, no buttons, no list. No glows. The start field and the Scratchpad button are the two named exceptions among controls.

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

- Anatomy: 48×48 (`--btn`), 2px `--edge` border, 8px radius, `--sheet` fill, one 24px sprite icon in `--ink`. `aria-label` and `title` when there is no word.
- States: hover `--raised` + `--muted` border; active 1px down; focus 3px `--focus` outline at 2px offset; disabled 45% opacity, no hover, no press.
- Variants: `.btn-go` (primary: `--c1` fill, `--field` icon, `--c1-hi` hover) is the only filled button. `.btn-label` adds one short word after the icon, same height. `.btn-tgl` is the two-state switch (today: q | a).
- Do: one `.btn-go` visible per field. Put the arrow flush inside its field.
- Don't: text-only buttons, a "→" after a word, a second filled color, round or pill buttons (named exceptions: the start field's buttons, the q | a switch, the Scratchpad button).

### Code box (`.code-box`) and suggestions

- Anatomy: in the bar, the same height (`--btn`), surface (`--sheet`), 2px `--edge` border and 8px radius as the buttons beside it, so tops and bottoms line up. Text: the bar's label text (`--t-sm` bold, Atkinson Hyperlegible, uppercase because codes are). Paste (empty box) or the Go arrow (typed) sits flush inside the border: `--btn` minus 4px, 6px radius. Paste is an icon button (transparent, `--muted` icon, `--raised` + `--ink` on hover); Go is the one filled control.
- Focus: one ring. The border turns `--focus` and a 1px inset makes it 3px. No outline around it.
- Suggestions (`suggest.mjs`): while typing, the codes this browser knows (opened here before, newest first; the live bank and its list; an uploaded file) that contain the typed text. **Banks first, then questions**, order kept inside each group. A `--sheet` card, 10px, `--shadow-3`, floating under the bar (above it when the bar is the phone dock). Rows `--btn` tall: `i-list` for a bank, `i-doc` for a question, the code in `--t-sm` bold; hover / marked row `--raised`. Combobox keys: ArrowDown / ArrowUp, Enter, Escape. The browser's own form history is off (no `name`).

### Start page (`html.start`: no problem open)

- Like a search home page: one line of title, "Upload or type code to start." (`--t-lg` bold `--ink`, centred), over one wide field (up to 40rem), both centred on the page. On phones the area is the part above the keyboard (`--kb-top` / `--kb-bottom`), so the field never hides under it.
- The field: a pill, `--sheet`, 2px `--edge`, `--shadow-1`; hover `--muted` border + `--shadow-3`; focus `--focus` border (3px, as the code box) + `--shadow-3`. Upload (left) and Paste / Go (right) are round 48px buttons inside it, transparent until hovered; Go stays the one filled control.
- Once a problem opens, the bar goes back to its place. Nothing animates in on load; hover and focus transitions only, off with reduced motion.

### Math in text

- Inline math keeps the punctuation that touches it: `$x$.`, `($v$)` render as one unit (`.mx`, nowrap), so a "." or "(" is never alone on a line (Tony, Oct 3).
- In a choice row a formula is one unit (`.opt .txt .katex` nowrap): "d =" never sits alone above its fraction. Too wide for the row → `fitMath` (app.js) shrinks it, down to 85%; still too wide → that formula scrolls sideways on its own (`.kx-scroll`). Re-fit on every resize and when a KaTeX font finishes loading.
- `tests/katex-wrap.pw.mjs` checks 320 / 390 / 768 / 1440: no orphan punctuation, no broken formula, no overflow, no word split. `KW_BANKS=<dir>` surveys real banks.

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
- Do: tap again to deselect; keys A to E, 1 to 5, arrows (existing keys; see Keyboard in §5).
- Don't: submit on the first tap; color the whole row red or green.

### Toast (`#toast`)

- Two jobs, one look: the wrong-answer note ("One more try, so choose wisely.") and the new-device onboarding notes (under 10 words each, once per device).
- Anatomy: page `--paper`, 1.5px `--line` border (Tony: "slight thicker"), `--shadow-1`, 10px radius, `--t-md` weight 400 in `--ink`, centred, one line where it fits (up to the column minus 2 × `--s4`), and a 14px caret that points at the thing it is about. No icon, no emoji, no yellow, no bold. `role="status"`, `aria-live="polite"`.
- Placement: `fixed`, next to its anchor, so nothing moves. Under the box: caret up. Above the anchor (the Scratchpad button): caret on the bottom edge. MC row: it lies on the struck choice's text (dead text) with the caret pointing at the X badge. Never cover a live control.
- Timing: in `--d-move`, stays 2.5 s, closes on tap or Esc. History: [TOAST.md](TOAST.md).
- Don't: use it for "Saved", "Correct" or anything already shown on the control; stack two toasts (a wrong-answer note wins over onboarding); a tinted or yellow slab.

### Cluck hint (`.cluck`)

- Anatomy: `--sheet` panel, 10px radius, `--s3`/`--s4` padding, the duck (`i-duck`, 28px, `--mark`) at the top left, then the hint text. No title, no border, no side stripe.
- When: after a wrong answer, and again when a question with used tries is reopened.
- Voice: the only place for "QUACK." (see Copy voice).

### List and nav (`.qnav`, `.qlist`)

- Nav: list button (`.btn-label`: checklist icon + bank code), shuffle, then Prev / Next pushed to the right edge. Arrows are icon-only.
- List: in the flow under the bar (it covers nothing), a `--sheet` card, 10px radius, rows of at least `--btn`, number in `--muted` bold tabular, title in `--ink`. Current row: `--raised` + `--c1` number. Done marks (`i-ok`, `i-x`, 20px) at the right edge. Out-of-tries or right: title struck through and dimmed, still a link.
- Don't: counters ("3 / 12"), headings on the list, side stripes on the current row.

### Scratchpad (`.xb`)

- Anatomy: label row (`i-pen` + "Scratchpad" + autosave status in `--t-xs` `--hint`), then a `--field` textarea, 2px `--edge`, 8px radius, `--mono` 16px / 1.6, no line numbers. Cut and Copy are `.btn`s inside the bottom-right corner; the text never runs under them.
- States: focus = `--focus` border only (one ring, Tony). Copy done = `--ok` icon and border.
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

---

## 4. Iconography

- **Sprite only.** Every icon is a `<symbol>` in the `index.html` sprite, used with `<svg class="ico"><use href="#i-..."/></svg>`. No icon fonts, no inline one-off paths, no Unicode glyphs (✓ ✗ → ⚠) as icons.
- Drawing: 24×24 viewBox, 2px stroke, round caps and joins, no fill, `currentColor`. Exceptions: `i-duck` (filled character).
- Sizes: `--ico` (24px, grows on desktop) inside buttons and the arrow slot; 20px (`1.25rem`) next to text (verdict, label, list marks); the duck at 28px. No other sizes.
- Color is the state token of what it shows: `--ink` in buttons, `--ok` check, `--bad` X, `--muted` lock and wait, `--mark` duck, `--field` on the filled arrow.
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
- **Humour lives in content and easter eggs** (Cluck, a bank's own lines, the scratchpad placeholder "Paste GPT answer here, but me be sad...", lowercase where it is a wink). Never in chrome: buttons, toasts, errors, labels. The wrong-answer toast's "choose wisely" is the only edge it has.

### Keyboard

- No keyboard shortcuts. Keys only do what a focused control already means: the code box and list comboboxes, MC choice keys inside the focused group, Enter to submit a box, Esc to close. Nothing global (`[` / `]` prev / next removed Oct 2 ~23:59 PT). Why: Tony, "NO KEYBOARD SHORTCUT", "kill key shortcut".
- The sash takes arrows, Home and End only while focused, for assistive tech; it is never shown or documented.

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
| 1 | `design/explain-box.css` `.xb textarea:focus` | Sets an outline that `app.css` then removes. | Drop the outline in explain-box.css. |
| 2 | `app.css` `.opt` | Choice boundary is `--line` (1.51:1, fails 3:1); hover goes to `--edge`. | Idle `--edge`, hover `--muted`, like `.ff`. |
| 3 | `design/explain-box.css` textarea | Radius 6px; every other field is 8px. | 8px. |
| 4 | `app.css` `.cluck` | 8px radius; surfaces are 10px. | 10px. |
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
