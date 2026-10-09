# T17a: Next cue mock (Oct 9)

Tony: "next button should glow or otherwise animate, OR a dialog that lets me NEXT onto a question right away."
Mock: `try/next-cue-variants.html` (`?v=1..3&s=open|before|after&r=ok|out[&peak=1][&cluck=1][&bare=1]`). It uses the real app.css, nav.css and icon sprite, laid out like the live phone (BANK_PSY6 bar, card, 4 rows, "Open notes" bottom right). No prod file changed.

"Before" = how the live app looks today after a correct pick: there is no cue, and Next is a plain grey arrow in the top corner. That shot is the same for all three variants.

| Variant | Pro | Con |
|---|---|---|
| V1 Glow: Next rings out once (1.1 s) after the pick's pop, then keeps a static --c1 ring | Adds nothing to the page. The one ring is the T2 blink. Under reduced motion you get the static ring only | It is still a 48px target in the top corner, the far reach on an iPhone. One pulse is easy to miss if you're looking at the rows |
| V2 Pill: a filled "Next" pill on the result row, right under the last choice | It sits right where your eye and thumb already are, after the row you just tapped. No motion at all, so it's T2-safe and identical under reduced motion. Doesn't take room from the view | Adds one row under the choices. It sits LEFT because "Open notes" owns the bottom right, and on Safari's 659pt view they're at the same height (the right-side pill was under that button by 11px) |
| V3 Sheet: docked bottom sheet "Correct" + one big "Next question" button, dismissible (X, Escape, swipe down) | The biggest, most obvious target, in the thumb zone | Takes ~150pt from the view: on Safari (659pt) row D is cut at the sheet's edge. It hides "Open notes" while it's up. It's one more thing to dismiss on every question, and its slide-up is a second blink after the pop |

**Pick: V2 (the pill).** It answers "how do I move on" in the place the student is already looking and tapping. It adds no motion, so it can never fight the right pick's pop or Cluck's stream (T2), and it looks the same with reduced motion. It doesn't cover or cut anything, even on the 659pt Safari view. V1's static ring could ride along as a quiet second hint on the bar's Next if wanted (no pulse).

## Checks (`checks.log`, from `shot-next-cue.mjs`)
- One-blink: Playwright plays the real flow (tap a row) and samples the distinct animated elements every 20 ms for 4.5 s. The max is **1** in every variant: the right pick's pop (or the wrong pick's jolt) runs first, then the cue (glow / sheet rise). A streaming Cluck (`&cluck=1`) holds the cue until the stream ends. Under reduced motion the max is 0.
- Covers: in every "after" state the cue doesn't overlap the question card or any visible choice row, and it's in view without scrolling. V2's pill is clear of "Open notes" in WebKit's 659pt view: the pill spans x 16–109 and the button starts at x 218.

## Shots (Chromium 393x852 @2x; WebKitGTK ios-sim safari-expanded, visible 393x659 @3x)
- V1: `v1-before-*`, `v1-after-*` (settled ring), `v1-peak-*` (the glow's brightest frame), `v1-after-rm-*` (reduced motion: static ring), `v1-out-after-chromium`
- V2: `v2-before-*`, `v2-after-*`, `v2-out-after-*`, `v2-after-rm-chromium`
- V3: `v3-before-*`, `v3-after-*`, `v3-out-after-*`, `v3-after-rm-chromium`

`*` = both `-chromium-393x852.png` and `-webkit-393x852.png`.

Rerun: `python3 serve.py <port>`, then `node shot-next-cue.mjs http://localhost:<port> .` (Chromium). WebKit: `ios-sim.py '<base>/try/next-cue-variants.html?bare=1&v=N&s=after' out.png --profile safari-expanded --fresh --wait 3000 [--rm]`.
