# Question nav: prev / next and the questions list

Tony: "prev next question, with NO TEXT question number table and brief text title of that question. [[icon] "Questions list"] for the button to it. be at top bar."

Files: `nav.js` (all behaviour), `nav.css` (all styles), `index.html` (3 icons, the `<nav>` markup, 2 tags), `app.js` (one line: an event after a problem loads). Test: `tests/render.pw.mjs` (step "nav"), `tests/nav.test.mjs` (titles).

## What it is

Three buttons in the top bar, all from the one `.btn` system (48px, 2px border, 24px icon):

| control | look | does |
|---|---|---|
| Questions list | list icon + the words "Questions list" (Tony asked for this label) | opens / closes the list under it |
| Previous | chevron left, no text | the question before this one |
| Next | chevron right, no text | the question after this one |

The list: one row per question, in file order. A row is a bare number (`1`, `2`, ...; no "Question" word) and a short title. The current question's row is marked. Clicking a row opens that question and closes the list.

Nothing else: no counter ("3 / 12"), no heading on the list, no close button. Refactoring UI, "Labels are a last resort" (p. 41) and "Don't design too much" (p. 13).

## Which questions: upload only (decision)

The nav exists **only when problems were uploaded** (a `problems.json` read by `offline.js`). The list is `stemOffline.codes()` in file order (a second upload appends its new codes after the first file's). With problems from the server, the nav is hidden, not disabled.

Why not "codes this browser already opened" in server mode:
- The code is the gate. Tony hands out codes, and the server never lists them. A history list would be a second, partial, per-device list that disagrees with what Tony assigned.
- Order would be visit order, so "next" would mean "the one I opened after this one last week". That is Back, and the browser already has it.
- Titles aren't served (`serve.py` sends `code, type, var, body`), so rows would be codes or text scraped from the body: more to build, for less.
- It needs new storage (localStorage) and a way to clear it. Extreme simplicity says no.

So: server mode looks exactly as it does today (the code bar), and the empty page stays blank.

When the bank is loaded but the current problem is not in it (a server code typed after an upload), the list shows with no row marked, and Prev / Next are disabled.

## Titles

1. `title` on the problem (optional, plain text, 60 characters or fewer, never the answer; SCHEMA.md).
2. Fallback: the first text block's first paragraph, with TeX turned into plain text (`\text{kg}` to `kg`, `30^\circ` to `30°`, `\mu` to `μ`, `\dfrac{a}{b}` to `a/b`) and markdown marks removed. It stops at a table. Cut at a word boundary to 60 characters, with "…".

Body text never holds the answer (SCHEMA.md rule), so the fallback can't leak it.

## Layout

The nav lives in `header.top`, after the entry dock in the DOM.

### 1920 and 1024 (fine pointer, wider than 700px): one row

```
File my-problems.json in use.
[⇧][ CALC1_QB6                              → ]  [≡ Questions list] [‹] [›]
```

The entry box and the nav share the row inside the 52rem column: the code box shrinks, and the nav keeps its natural width at the right. The file status line stays above, the entry message below. Implementation: while the nav is shown (`html.qnav-on`) and the dock is not at the bottom, `.top` is a 2-column grid and `.dock` is `display: contents`, so the status, the entry form and the message are grid items. Without a bank, nothing changes.

The list opens under the button row, right-aligned with the column, 26rem wide.

### 390x844 and touch (dock at the bottom): the top bar

```
[≡ Questions list]                       [‹] [›]      <- top bar, scrolls with the page
...problem, question, scratchpad...
[⇧][ CALC1_QB6                 → ]                   <- entry dock, fixed at the bottom
```

The nav takes the empty top bar. It doesn't join the bottom dock: at 390px, three more buttons would leave the code box too narrow for a code, and Tony asked for the top bar. The list opens as a full-width panel under the bar. Its height is capped so it ends above the bottom dock (`--dock-h`, already set by app.js).

### The freeze layer

The top bar is in normal flow, above `#sentinel`. It scrolls away, and then the problem layer sticks at the top, as before. Nothing about the freeze changes: `--freeze-max` is computed from the viewport, not from what is above the layer. Loading a question already scrolls to the top (`render()`), so after Next the bar is on screen again. The list panel is `position: absolute` in the header (z-index 30, above the freeze's 10 and the dock's 20), so it scrolls with the page rather than floating over the problem.

## States

| state | nav | list button | prev | next |
|---|---|---|---|---|
| no upload (server, or empty page) | hidden | - | - | - |
| upload, current is question 1 | shown | enabled | disabled | enabled |
| upload, middle | shown | enabled | enabled | enabled |
| upload, last | shown | enabled | enabled | disabled |
| upload, one question | shown | enabled | disabled | disabled |
| upload, current not in the file | shown | enabled, no row marked | disabled | disabled |
| list open | | `aria-expanded="true"`, raised | | |

Disabled buttons use the `.btn-go:disabled` rule: 45% opacity, no hover. If the focused button becomes disabled (Next on the last question), focus moves to the other arrow.

Current row: raised background, number in `c1` and bold, `aria-current="true"`. No side stripe (Impeccable bans it, and the background is enough).

Solved marks in the list: not built (out of scope). Grading state is private to app.js, and it would need a second hook.

## Keyboard

| key | where | does |
|---|---|---|
| `[` / `]` | anywhere except while typing (input, textarea, contenteditable), and not while the file picker dialog is open | previous / next |
| Enter / Space | list button | toggle the list |
| ArrowDown | list button | open the list |
| ArrowUp / ArrowDown, Home / End | in the list | move between rows |
| Enter | on a row | open that question |
| Escape | in the list | close it, focus back on the list button |
| Tab out of the list | | closes it |

Not Alt+Left/Right: that is the browser's Back/Forward on Windows and Linux. `[` and `]` are free on the page (MC keys are A–E and arrows), need no modifier, and AltGr layouts still produce `[` / `]`. Ctrl/Cmd combos are ignored. The buttons carry `aria-keyshortcuts`, and their tooltips say the key.

## Accessibility

- `<nav aria-label="Questions">`. The list is a disclosure (APG "disclosure navigation"), not a modal dialog: the button has `aria-expanded` and `aria-controls`, and the panel is an `<ol>` of links. No focus trap, and the rest of the page stays usable. A modal would make the list button inert, so the list would need a close button, which is more UI.
- Rows are links (`<a href="#CODE">`): they navigate. Their accessible name is "3. Block on a ramp with friction". Prev/Next set `location.hash` the same way, so the browser's Back and Forward walk through the questions the student visited.
- Opening the list moves focus to the current row (or the first), scrolled into view. Closing with Escape returns focus to the button. Clicking or tapping outside closes it.
- After Prev / Next, the live region (`#sr`) says "3 of 12. Block on a ramp with friction."
- Icon-only buttons have `aria-label` and `title`. Targets are 48px. Rows are at least 48px tall.

## Hooks into app.js and index.html

- `app.js`, `load()`: one line after `render()`:
  `dispatchEvent(new CustomEvent("drill:problem", { detail: { code } }));`
  nav.js listens and re-reads `stemOffline.codes()` each time (an upload always ends in a `load()`), so no other hook is needed. Navigation goes through `location.hash`, which app.js already follows (`hashchange` → `load`).
- `index.html`: three `<symbol>`s (`i-list`, `i-prev`, `i-next`), the `<nav id="qnav" hidden>` block after `#dock` in `header.top`, `<link rel="stylesheet" href="nav.css">` after app.css, and `<script type="module" src="nav.js">` after app.js.
- `sw.js`: nav.js and nav.css in the shell list.
