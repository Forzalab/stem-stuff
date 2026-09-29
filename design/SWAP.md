# Swap: one pane above the keyboard

Tony picked "C. Swap" from the mockups: with the phone keyboard up there is one pane at a time, the problem or the scratchpad, and one icon button switches them. Same round: line numbers in the scratchpad, choices on one row, and the top bar steps away while you write.

Files: `index.html` (`#swap`, `#stage`, `#xbGutter`), `app.css` (sections "top bar steps away", "Swap"), `app.js` (section "Swap", `layoutDock`, `fitChoices`), `design/explain-box.js` (`lineNumbers`, `opts.cap`). Test: `tests/swap.pw.mjs`. Screenshots: `design/shots/swap-*.png`, `design/shots/mc-row-*.png`.

## When it is on

`html.swap` is set by `layoutDock()` when all of these hold: phone or touch layout (`dockMQ`), the visual viewport is under 80% of the tallest height seen for this width (the keyboard is up), and focus is in a text field inside `<main>`. Once on, it stays on while focus is anywhere in `<main>` (its buttons too) and for 0.5 s after focus is lost (the keyboard is still sliding away), until the viewport grows back. Focus in the entry box (the code) never turns it on: that box keeps riding on the keyboard.

With the keyboard down the page is exactly as before (a `display: contents` wrapper, `#stage`, adds no box). The code dock steps aside (`dock-away`), as it already did.

## The stage

`<main>` becomes `position: fixed` with `top: --kb-top` (visualViewport.offsetTop) and `height: --vv-h` (visualViewport.height), so on iOS, where fixed elements stay on the layout viewport, it still covers exactly the visible area. Inside: the toggle row, then `#stage`, a one-cell grid holding both panes. The pane that is not shown stays laid out and focusable but see-through and untouchable, so focus can move into it inside the tap (that is what keeps the keyboard up). The page behind keeps its height (`--swap-doc-h`) and scroll position, so closing the keyboard puts everything back where it was.

Insets: the top uses `env(safe-area-inset-top)`, the sides `--gut` (which includes the left and right insets). The bottom has no inset: the keyboard sits there.

## Panes

| | PROBLEM | SCRATCHPAD |
|---|---|---|
| Card (problem, how line, answer) | fills the stage. The question scrolls inside it, from its start. The how line and the answer box / choices are pinned at the card's bottom (feedback sits between). | a peek at the top: the question and the grey how line, from the start (`scrollTop` 0, never scrolled to the end). The answer box and choices are hidden (still in the DOM, visually hidden). |
| Peek size | | the whole question when it fits in 60% of the visible height, but never so tall that the scratchpad gets less than 3 lines. A longer question is clamped, with its own scroll and a bottom fade. |
| Scratchpad | see-through, out of the way | anchored to the bottom, just above the keyboard. It grows upward as lines are added, like a chat composer. When its top meets the peek (10px gap) it stops growing and the text scrolls inside it; the caret stays visible. Minimum 3 lines. |

Sizes come from `layoutSwap()`: `--peek-max = min(60% of --vv-h, stage - 3 lines - gap)`, then the scratchpad's cap is what the real peek leaves (`opts.cap` in `ExplainBox.mount`).

If the stage is too short for a peek (a phone on its side), the peek is dropped and the scratchpad gets everything.

## The switch

One 48px `.btn` at the top left, no text: a document icon, a swap-arrows icon, a pencil icon, in that order. The active side (document for PROBLEM, pencil for SCRATCHPAD) is `--c1` with a raised pill behind it; the pill slides and the arrows turn half a turn. `aria-label` says what a tap does ("Show the scratchpad" / "Show the problem").

- Tap swaps the panes and moves focus into the target's main field in the same tap: the scratchpad, or the first empty answer box, or the picked / current choice. The button cancels `pointerdown` and `mousedown`, so it never takes focus from the field.
- Focus picks the pane: focusing an answer box or a choice shows PROBLEM; focusing the scratchpad shows SCRATCHPAD (tap, Tab, a script). The hidden pane's fields are focusable on purpose.
- A problem with no text field (multiple choice) has nowhere to keep the keyboard: on iOS the keyboard closes when a choice takes focus, the viewport grows, and Swap ends by itself. Swap stays while the viewport stays small.

## Motion

The switch is a 220ms ease crossfade, the browser's View Transition on the page (`document.startViewTransition`); where that is missing, or with `prefers-reduced-motion`, it switches instantly. The keyboard opening and closing has no animation of ours: layout changes on the frame the viewport does, and the page's scroll position is restored on the way out. The toggle's pill and icons transition over 220ms (off with reduced motion).

## Top bar

On phones and touch layouts, while `#scratch` has focus, the top bar (the nav row: Questions list and the arrows) slides up and fades out in 200ms (`html.bar-off`). It keeps its space: nothing moves under the finger. It comes back on blur. With `prefers-reduced-motion` it hides and shows instantly. It applies with the keyboard down and up; with the keyboard up the stage covers it anyway, and the toggle lives in `<main>`, not in the bar. The phone's entry box is the bottom dock, not this bar. Not on desktop: there the bar holds the entry box (and the nav beside it), which a mouse must reach while the scratchpad still has focus, so it stays.

## Line numbers

A gutter over the scratchpad's left padding: `--hint`, 13px, tabular numbers, right-aligned, `aria-hidden`, no pointer events. One number per logical (newline-separated) line, on that line's first visual row. `ExplainBox.lineNumbers` lays each line out in a hidden mirror div (same font, width, padding and wrapping as the textarea) and gives the gutter one block of that height per line. It re-measures on input, cap changes, width changes and font load, and follows the textarea's scroll.

## Choices on one row

2 choices, or 3 whose text is short, become one row of pills with no A/B/C badges. `fitChoices()` decides by measuring: lay the row out, then give each pill in turn the selected look (56px of arrow room on its right) and check that nothing wraps, clips or overflows the row. If any pill fails, or there are more than 3, it is today's stacked list. It re-runs on width changes and font load. The arrow stays flush inside the selected pill; tap it again to deselect; arrows keys rove; A to E and 1 to 5 jump; the group is still a `radiogroup`. Wrong keeps the dashed red border and the strike; right keeps the green border and shows its check where the arrow was. Pills size to their text and share the spare width; each is at least 48px wide.

## Tested

`tests/swap.pw.mjs` at 375x667, 390x844 and 430x932 in Chromium with the keyboard simulated by shrinking the viewport to 55% after focusing. Not tested: real iOS Safari or Android (a headless browser has no keyboard, so `visualViewport.offsetTop` stays 0 and the iOS path is reasoned, not observed), and WebKit or Firefox (not installed here; Firefox has no View Transitions for this, so it switches instantly).
