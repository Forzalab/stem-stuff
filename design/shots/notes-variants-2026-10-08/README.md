# Open notes: 5 variants (Oct 8, design exploration only)

Mock: `try/notes-variants.html` (switcher 1-5 and states; `?v=N&s=STATE&bare=1` for shots). Sugar phone, 393x852, a long question + figure + 5 choices.
In all five the content scrolls in its own area and the notes control sits in reserved room; an open menu pushes the content, never covers it.
Shots: `vN-STATE-{chromium,webkit}-393x852.png`. Chromium = Playwright (`shoot.mjs`), WebKit = WebKitGTK ios-sim.py `--profile safari-expanded --fresh`, states set with `--js` (`wk.py`; visible area 393x659 under Safari's bars).
Every shot runs an overlap check (control or open menu vs question text, figure, choices): 0 hits in all 22.

| # | variant | tradeoff |
|---|---|---|
| 1 | Drag to X (Tony) | Fast to dismiss and gives the room back (lane folds to a 28px grab bar), but the drag is undiscoverable and costs a 72px lane while shown; tap fallback = the button's tap opens the menu with "Hide the button". |
| 2 | Edge tab | Costs only 28px of width and sits in thumb reach, but a 24px tab is a small target and the column narrows (text reflows) while the rail is open. |
| 3 | Top bar slot | Zero new chrome and reuses the question list's push-down precedent, but the top bar is out of thumb reach and both tools are two taps. |
| 4 | Bottom bar | Both tools always one tap in thumb reach with labels, no menu, but it permanently costs a 64px row and adds two more buttons to the screen. |
| 5 | In the flow | Nothing floats at all (calmest), but on a long question the row scrolls away, so the tools are not always on screen (repeated under the last choice). |

**Pick: 4, Bottom bar.** It is the only one where both tools stay one tap, visible and in thumb reach with no gesture or menu, and it merges into the dock strip that already owns the bottom; keep Tony's drag-to-X (1) as the fallback if the extra row is too costly on short phones.
