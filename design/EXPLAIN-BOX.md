# Explanation box

Tony: "make the explanation box fixed but then extend in height. make it PLEASANT to type in, just a plain textbox, no bold italic formatting no such thing."

Files: `explain-box.css` (style), `explain-box.js` (growth fallback + history), `explain-box.html` (demo). Also wired into `specimen.html` under PHYS_F3N.

## What the research says

1. **Plain `<textarea>`, not contenteditable.** A textarea only holds plain text, so pasting from Word or a web page can't bring in bold, links or images. It also gets native undo, spellcheck, IME and screen-reader support for free. (MDN, `<textarea>`: https://developer.mozilla.org/en-US/docs/Web/HTML/Element/textarea)
2. **Auto-grow with CSS `field-sizing: content`.** The box sizes to its content; `min-height` sets the starting size. Supported in Chromium 123+ and Safari 26; Firefox did not ship it at the time of writing, so a fallback is needed. (MDN: https://developer.mozilla.org/en-US/docs/Web/CSS/field-sizing, Chrome for Developers: https://developer.chrome.com/docs/css-ui/css-field-sizing)
3. **Fallback:** on `input`, set `height: auto`, then `height = scrollHeight + borders`. Also refit when the width changes. Feature-detect with `CSS.supports("field-sizing", "content")` so the two methods never fight. (CSS-Tricks, "The cleanest trick for autogrowing textareas": https://css-tricks.com/the-cleanest-trick-for-autogrowing-textareas/)
4. **Tab moves focus.** Grabbing Tab to insert a tab character traps keyboard users (WCAG 2.1.2, No Keyboard Trap: https://www.w3.org/WAI/WCAG21/Understanding/no-keyboard-trap). Explanations are prose, so Tab keeps its normal job.
5. **Focus and borders at 3:1.** The input edge and the focus indicator are UI parts, so each needs 3:1 against what is next to it (WCAG 1.4.11: https://www.w3.org/WAI/WCAG21/Understanding/non-text-contrast). Placeholder text is text, so it needs 4.5:1 and `opacity: 1` (Firefox dims placeholders by default).
6. **Measure and leading.** Body text reads best at 1.5 or more line-height (WCAG 1.4.12) and roughly 45–80 characters per line.

## Chosen settings

| setting | value | why |
|---|---|---|
| element | `<textarea rows="4">` in a `<label>`; visible label **Scratchpad** (pencil icon + word) | plain text only, labelled for screen readers |
| width | 100% of the column, capped at `calc(68ch + 1.8rem + 4px)` (68 characters per line in the box's own font) | Tony: limit the line length and wrap. Fixed width, grows only in height |
| growth | `field-sizing: content`; JS fallback in `explain-box.js` | no scrollbar, no jumps |
| min height | 4 lines + padding | room to start without looking like a one-line answer box |
| max height | none | the page scrolls, not the box |
| resize | `none` | it grows by itself; no drag handle |
| font | Atkinson Hyperlegible 400, 1.125rem / 1.6 | same as the site. Sans, not monospace: this is prose, and monospace is wider and slower to read |
| padding | 0.75rem 0.9rem | text doesn't touch the border |
| colors | ink on field #111826 (15.1:1) | |
| border | 2px `--edge` #6b7f9e (3.64:1 on sheet); hover muted | the old `--line` (1.51) failed 3:1 |
| focus | border + 3px `--focus` #8fb0ff outline, 2px offset (8.3:1 on field) | matches the site's buttons |
| placeholder | "Paste GPT answer here, but me be sad..." (Tony's wording); `--hint` #7d8ea8, opacity 1 (5.33:1) | |
| caret | `--focus` | easy to find |
| spellcheck | on; `autocapitalize="sentences"`, `autocomplete="off"` | |
| wrapping | `pre-wrap`, `overflow-wrap: anywhere` | a long pasted string can't widen the box |
| Tab | not intercepted | no keyboard trap |

## JS API (`explain-box.js`)

```js
const box = ExplainBox.mount(textarea, { idleMs: 2000, onHistory(entry, all) {} });
box.el            // the <textarea>
box.getHistory()  // [{t, text}], t = epoch ms, oldest first (a copy)
box.onHistory(fn) // the onchange-history hook; returns an unsubscribe function
box.snapshot()    // snapshot now (call before building the copy payload)
box.destroy()
ExplainBox.reserveCorner(textarea, button, { gap: 4, hysteresis: 8, freePadding: "1.75rem" })  // -> { update(), destroy(), free }
```

Snapshots are taken after 2 s without typing and on blur. A snapshot is skipped if the text hasn't changed, and the empty starting text is not recorded. Field names and timing follow `copy/COPY-PAYLOAD.md` ("Contract with the explain box"). That doc turns snapshots into `hist` diffs.

## Checked

- Chromium at 1920x1080 and 390x844: the box grows from 143px to 287px on mobile, with no internal scrollbar. The JS fallback, forced by disabling `field-sizing`, gives the same heights. Screenshots: `shots/explain-box-1920.png`, `shots/explain-box-390.png`.
- Impeccable: 0 static findings; served, 1 at 1920 (line length of the problem text, fixed) → 0.

## Drill page (index.html)

The page labels the box **Scratchpad**. The line-length cap lives in `app.css` (`.xb textarea { max-width }`), so the demo pages here stay full width. The textarea is re-created for each problem so its edit history starts empty.

## Copy button inside the box (`ExplainBox.reserveCorner`)

Tony: Copy sits inside the Scratchpad's bottom-right corner, and text wraps as if the button physically blocks that corner.

- Markup: `.xb-field` (`position: relative`, same width as the textarea) holds the `<textarea id="scratch">` and `#copy` (the standard 48px `.btn`, `right: 6px; bottom: 6px`, inside the 2px border).
- A textarea can't use float or `shape-outside`. But it auto-grows and never scrolls, so only the lines at the bottom can reach the button.
- `ExplainBox.reserveCorner(textarea, button)` lays the text out in a hidden mirror div with the same font, width, padding, border and wrapping (`pre-wrap`, `overflow-wrap: anywhere`), plus a zero-width end marker so a trailing newline counts as a line. When the box is empty it measures the placeholder instead. Range rects give each visual line's box.
  - If any line comes within 4px (horizontally) of the button, the textarea keeps the **reserved** bottom band: `padding-bottom: 56px` = button 48 + inset 6 + gap 4 − border 2. That puts the last line above the button.
  - Otherwise it gets `.xb-free`: `padding-bottom: 28px`. That is chosen so line (28.8px) + padding ≥ button + inset (54px). In the free layout, only the **last** line shares the button's height band.
- **No JS:** the reserved band is the CSS default, so text never runs under the button.
- **Hysteresis:** once reserved, the band is freed only when the lines clear the button by a further 8px. `padding` has no transition.
- **When it recomputes:** synchronously on `input` (no frame shows text under the button), on width changes (ResizeObserver) and on `document.fonts.ready`. In the JS-growth path it fires `xb-refit` so `mount()` refits the height.
- **Test:** `tests/render.pw.mjs`, step "copy button inside the scratchpad", at 390/1024/1920. It checks that no line box ever intersects the button while typing 40 words. It checks that a long last line turns the band on and a short last line (`\nok`) turns it off. It checks the padding toggles no more than twice per line change. Screenshots: `shots/app-copy-reserved-390.png`, `shots/app-copy-free-390.png`.

## Update (Sep 29): height cap + Cut
- The box grows only until its bottom reaches the bottom of the visible viewport (visualViewport, minus the phone code dock); then it scrolls inside (`overflow-y: auto`). Minimum 4 rows. Code: `limit()` in explain-box.js, called from app.js `layoutFreeze`.
- Cut (scissors, left of Copy): copies the same payload as Copy, then empties the box; the clear is kept in the edit history. A failed copy clears nothing.
