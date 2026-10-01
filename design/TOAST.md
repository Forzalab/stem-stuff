# "One try left" toast: 7 variants

Mockup: `design/mockups/toast.html` (buttons 1 to 7 play each one; `?v=N` shows N held still, `&y=200` scrolls first). Shots: `design/shots/toast-N-390.png` and `toast-N-1920.png`. The 390 shots are scrolled 200px, the way the page sits while you write.

Shared by all 7: text "One more try, so choose wisely. 😈" (no-break space before the emoji, so it never sits alone on a line). 18px+ bold (`--t-md`). `role="status" aria-live="polite"`. `position: fixed`, so nothing on the page moves. It hides itself after 2.5 s. Tap anywhere on it (52px+ tall) or press Esc to close it. In: 320 ms, 14px slide plus fade. With reduced motion it only fades (CSS animations, because app.css turns every transition off). Top and bottom toasts check for a live answer control (an open box or choice) underneath and move to the other edge if they find one. Bottom ones sit above the code-bar strip, the safe area and `--kb-bottom` (the iOS keyboard).

| # | look | position | Refactoring UI rule | risk |
|---|---|---|---|---|
| 1 | `--raised` pill with a 2px `--mark` ring, shadow-4 | top centre, slides down | Creating depth: one raised layer, colour only on the edge | A tall frozen strip puts it over the problem text (text only, never a box) |
| 2 | Same pill as 1 | bottom centre, above the dock strip, slides up | Same as 1. It sits where the thumb is. | On a short page it lands on the choices and has to flip to the top, so you can't predict where it shows |
| 3 | Solid `--mark` fill, `--field` ink | top centre | Max contrast for the one thing that matters | Loudest of the 7: a big yellow slab after every miss feels like a scolding, not "baby-friendly" |
| 4 | `--sheet` card, 36px yellow warning triangle, text beside it | top centre | Use icons to carry meaning, not words | Wraps to 2 lines on phones and is the tallest top toast (covers the most). The triangle reads as "error", and the 😈 joke is lost. |
| 5 | Ring callout with a caret pointing at the ✗ | fixed under the wrong box, right edges aligned | Proximity: the message sits next to what it is about | Covers whatever comes after the box (the next card's text here, a part hint in the app). Must follow the box on scroll. With MC there's no single box. |
| 6 | `--sheet` bar, 5px `--mark` left rule | top edge; full-bleed on phones, column width on desktop | Accent border instead of a big fill | Looks like a system alert / app banner more than a friendly nudge. Covers the top of the frozen strip. |
| 7 | Rounded chip with a tries meter (yellow dot = try left, ring = used) | bottom centre | Show state, not words (the dots) | Wraps to 2 lines at 390. The dots repeat what the text says. Same flip issue as 2. |

**Pick: 1.** It stays on one line at 390, keeps away from both the thumb and the keyboard, and the yellow ring says "careful" without shouting like 3. If Tony wants the eye to stay put, 5 is the runner-up, but it needs a rule for MC (anchor it to the struck choice).
