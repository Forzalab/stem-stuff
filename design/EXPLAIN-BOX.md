# Explanation box

Tony: "make the explanation box fixed but then extend in height. make it PLEASANT to type in, just a plain textbox, no bold italic formatting no such thing."

Files: `explain-box.css` (style), `explain-box.js` (growth fallback + history), `explain-box.html` (demo). Also wired into `specimen.html` under PHYS-F3N.

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
| element | `<textarea rows="4">` in a `<label>` | plain text only, labelled for screen readers |
| width | 100% of the problem column | fixed width, grows only in height |
| growth | `field-sizing: content`; JS fallback in `explain-box.js` | no scrollbar, no jumps |
| min height | 4 lines + padding | room to start without looking like a one-line answer box |
| max height | none | the page scrolls, not the box |
| resize | `none` | it grows by itself; no drag handle |
| font | Atkinson Hyperlegible 400, 1.125rem / 1.6 | same as the site. Sans, not monospace: this is prose, and monospace is wider and slower to read |
| padding | 0.75rem 0.9rem | text doesn't touch the border |
| colors | ink on field #111826 (15.1:1) | |
| border | 2px `--edge` #6b7f9e (3.64:1 on sheet); hover muted | the old `--line` (1.51) failed 3:1 |
| focus | border + 3px `--focus` #8fb0ff outline, 2px offset (8.3:1 on field) | matches the site's buttons |
| placeholder | `--hint` #7d8ea8, opacity 1 (5.33:1) | |
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
```

Snapshots are taken after 2 s without typing and on blur. A snapshot is skipped if the text hasn't changed, and the empty starting text is not recorded. Field names and timing follow `copy/COPY-PAYLOAD.md` ("Contract with the explain box"). That doc turns snapshots into `hist` diffs.

## Checked

- Chromium at 1920x1080 and 390x844: the box grows from 143px to 287px on mobile, with no internal scrollbar. The JS fallback, forced by disabling `field-sizing`, gives the same heights. Screenshots: `shots/explain-box-1920.png`, `shots/explain-box-390.png`.
- Impeccable: 0 static findings; served, 1 at 1920 (line length of the problem text, fixed) → 0.
