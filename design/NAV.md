# Question nav: prev / next and the questions list

Tony: "prev next question, with NO TEXT question number table and brief text title of that question. [[icon] "Questions list"] for the button to it. be at top bar."

Files: `nav.js` (all behaviour), `nav.css` (all styles), `index.html` (3 icons, the `<nav>` + list markup, 2 tags), `app.js` (one line: an event after a problem loads). Test: `tests/render.pw.mjs` (step "nav"), `tests/nav.test.mjs` (titles).

## What it is

Three buttons in the top bar, all from the one `.btn` system (48px, 2px border, 24px icon):

| control | look | does |
|---|---|---|
| Questions list | list icon + the words "Questions list" (Tony asked for this label) | opens / closes the list under it |
| Previous | chevron left, no text | the question before this one |
| Next | chevron right, no text | the question after this one |

The list: one row per question, in file order. A row is a bare number (`1`, `2`, ...; no "Question" word) and a short title. The current question's row is marked. Clicking a row opens that question and closes the list.

The list opens **in the flow**, under the top bar: it pushes the problem down and covers nothing. A first build dropped it over the page (absolute, z-index 30, shadow). Impeccable's live scan flagged every line of problem text under it (`text-occlusion`), and its inline ignore would have switched that rule off for the whole page, figures included. In the flow is also simpler: no stacking against the freeze layer or the dock, and no height math against the dock.

Nothing else: no counter ("3 / 12"), no heading on the list, no close button. Refactoring UI, "Labels are a last resort" (p. 41) and "Don't design too much" (p. 13).

> **Update (design/BANK.md):** the list is now the open practice bank (`BANK_XXX`), else the uploaded file. The list
> button shows a checklist icon and the bank code (upload: the file name without `.json`), nothing else.

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
2. Fallback: the first text block's first paragraph, with TeX turned into plain text (`\text{kg}` to `kg`, `30^\circ` to `30°`, `\mu` to `μ`, `\dfrac{a}{b}` to `a/b`, `x^2` to `x²`) and markdown marks removed. It stops at a table or a display-math line. Over 60 characters: end at the last full sentence that fits, else cut at a word with "…".

   From today's bank: "Let f(x)=(x³-8)/(x-2). A calculator gives:", "Solve for x: x+2=11", "A 4.0 kg block slides down a 30° ramp with μk = 0.20.", "A 2.0 kg block rests on a frictionless 25° incline, held…".

Body text never holds the answer (SCHEMA.md rule), so the fallback can't leak it.

## Layout

The nav lives in `header.top`, after the entry dock in the DOM.

### 1920 and 1024 (fine pointer, wider than 700px): one row

```
File my-problems.json in use.
[⇧][ CALC1_QB6                              → ]  [≡ Questions list] [‹] [›]
```

The entry box and the nav share the row inside the 52rem column: the code box shrinks, and the nav keeps its natural width at the right. The file status line stays above, the entry message below. Implementation: while the nav is shown (`html.qnav-on`) and the dock is not at the bottom, `.top` is a 2-column grid and `.dock` is `display: contents`, so the status, the entry form and the message are grid items. Without a bank, nothing changes.

The list opens as a full-width row under the entry row (the grid's 4th row), a `--sheet` card like the problem's.

### 390x844 and touch (dock at the bottom): the top bar

```
[≡ Questions list]                       [‹] [›]      <- top bar, scrolls with the page
...problem, question, scratchpad...
[⇧][ CALC1_QB6                 → ]                   <- entry dock, fixed at the bottom
```

The nav takes the empty top bar. It doesn't join the bottom dock: at 390px, three more buttons would leave the code box too narrow for a code, and Tony asked for the top bar. The list opens as a full-width card under the bar. A long list scrolls inside the card (max `min(32rem, 60svh)`), so the page never becomes one long list.

### The freeze layer

The top bar and the list are in normal flow, above `#sentinel`. They scroll away, and then the problem layer sticks at the top, as before. Nothing about the freeze changes: `--freeze-max` is computed from the viewport, not from what is above the layer, and the sentinel moves down with the header. Loading a question already scrolls to the top (`render()`), so after Next the bar is on screen again.

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

Not Alt+Left/Right: that is the browser's Back/Forward on Windows and Linux. `[` and `]` are free on the page (MC keys are A–E and arrows), need no modifier, and AltGr layouts still produce `[` / `]`. Ctrl/Cmd combos are ignored. The buttons carry `aria-keyshortcuts`, and their tooltips say the key.

## Accessibility

- `<nav aria-label="Questions">` holds the three buttons. The list is a disclosure (APG "disclosure navigation"), not a modal dialog: the button has `aria-expanded` and `aria-controls`, and the panel (right after the `<nav>`, so the desktop grid can give it a full row) is an `<ol>` of links. No focus trap, and the rest of the page stays usable. A modal would make the list button inert, so the list would need a close button, which is more UI.
- It does **not** close on an outside click or on focus leaving it. The list is in the flow, so closing on pointerdown would move the page under the pointer, and the click could land on something else (an MC choice). It closes on the button, Escape, a pick, Prev or Next.
- Rows are links (`<a href="#CODE">`): they navigate. Their accessible name is "3. Block on a ramp with friction". Prev/Next set `location.hash` the same way, so the browser's Back and Forward walk through the questions the student visited.
- Opening the list moves focus to the current row (or the first), scrolled into view inside the card. Closing with Escape returns focus to the button.
- After Prev / Next, the live region (`#sr`) says "3 of 12. Block on a ramp with friction."
- Icon-only buttons have `aria-label` and `title`. Targets are 48px. Rows are at least 48px tall.

## Hooks into app.js and index.html

- `app.js`, `load()`: one line after `render()`:
  `dispatchEvent(new CustomEvent("drill:problem", { detail: { code } }));`
  nav.js listens and re-reads `stemOffline.codes()` each time (an upload always ends in a `load()`), so no other hook is needed. Navigation goes through `location.hash`, which app.js already follows (`hashchange` → `load`).
- `index.html`: three `<symbol>`s (`i-list`, `i-prev`, `i-next`), the `<nav id="qnav" hidden>` block and `<div id="qlist" hidden>` after `#dock` in `header.top`, `<link rel="stylesheet" href="nav.css">` after app.css, and `<script type="module" src="nav.js">` after app.js.
- `sw.js`: nav.js and nav.css in the shell list.

## Tested

- `tests/render.pw.mjs`, step "nav", Chromium at 390x844, 1024x1366 (touch) and 1920x1080: hidden for a server problem; upload a bank; placement (beside the entry box on desktop, top bar on touch); 48px buttons, no text on the arrows; list rows are 1..n with titles (one authored), current marked and focused; the list covers nothing; click row 3; Escape returns focus; Next, Prev; `]` and `[`; `[` typed in the scratchpad stays text; the last question disables Next; ArrowDown, Home, Enter from the list button; a server code after the upload leaves no row marked and both arrows off.
- `tests/nav.test.mjs`: titles for every problem in `problems.json` are plain and 60 characters or fewer; authored titles win; TeX to text.
- Impeccable, 0 findings: static (`index.html app.css nav.css`), and live at 1920x1080 and 390x844 for a server problem, and for an uploaded bank with the list closed and open.
- Screenshots: `shots/nav-closed-390.png`, `shots/nav-open-390.png`, `shots/nav-next-390.png`, and the same at 1920.
- **Not tested:** WebKit and Firefox (not installed here). Nothing here is browser-specific beyond `display: contents` on the desktop dock, which both support.
