# Idle peek (T45)

Tony, Oct 15: "idling for more than 2-3min in a question/quiz (in a bank, not each question)? cluck slowly peeks up sunrise."
Picks and AMA answers: brain `projects/calc/_files/chat-redesign-2026-10-13/idle-peek/` (AMA.md 🔒 sections, RESEARCH.md, r2/). Style exception: STYLE.md §1.6.

## What it does
- **Where:** sugar only (AMA 3), inside a practice bank, a question open. Phone: the duck at the bottom centre, the sky across the screen. Desktop: the Question column's foot, the sky over that column only, fading out 48px past its edges (no hard cut).
- **When:** 3 min with no input (AMA 1). One more after 10 more idle min, max 2 per bank session (AMA 5). A new bank = a new session.
- **Also: the first wrong answer (Tony, Oct 17).** After a question's FIRST wrong answer (any part of a multi-part question) the same peek starts ~0.7 s after the feedback settles (`stemDuck.wrong`, called from app.js `record`). Once per question, never retried if busy at that moment, a 2 min cooldown since any peek, it does not use up the idle peeks. Every other rule here holds (sugar only, one duck and one glow, never while Cluck's sheet is open, reduced motion = opacity only); any input inside the 0.7 s cancels it. The 3 min idle trigger stays.
- **Input** (resets the timer, puts the duck away): `pointerdown`, `keydown`, `wheel`, `touchstart`, `input`, and a mouse move of 24px or more (AMA 8). Cluck's chat is on the page, so typing there counts. A question change by code does not reset it; a Next tap is a tap, so it does (AMA 13). Scroll and focus events are not counted: code can scroll and focus too (e.g. Cluck's sheet scrolls the page).
- **Not while:** Cluck's sheet is open (AMA 9), the question list, the phone code bar or the keyboard is up, a reward FX plays, or another rise owns the duck (AMA 10). The timer then starts a fresh wait. The tab hidden: the time does not count.
- **Look (V3 sky first, position A):** the sky warms for ~4 s, the duck peeks with its eyes (42px phone / 52px desktop, AMA 12), holds, comes up, then the line "Stuck? Tap me." (touch) / "Stuck? Click me." (a mouse). The sun core always sits under the duck. It stays still until any input (AMA 14). Reduced motion: no movement, the same phases as opacity (AMA 15).
- **Tap (AMA 4):** never a new AI call (T34) and never an auto hint (T32). Cluck already has something (his steps, the reference solution): the sheet opens on it. Else his own way in on the page gets the focus (the "Explain my mistake" chip, the hint card). Nothing there: the duck just goes.
- **Screen readers:** the duck is a button, "Cluck: want a hint?", in the tab order only while it shows. No announcement.

## Code
- `peek.js`: `window.stemDuck` (`rise({ line, label, onTap })`, `down()`, `up`): one duck, one sky, every rise replays the same sunrise. The P7 waiting duck (lane c) and the P8 ember (lane f) should rise through it, so there is never a second duck. Then the idle timer.
- `app.css` ".ck-rise": the timeline (7.2 s) and the reduced-motion keyframes. Colours: `--ai` mixed with transparent, the horizon ≤ 18%.
- `app.js`: `stemCluckOpen()` and `stemIdleTap()`.
- Test: `tests/idle-peek.pw.mjs` (fake clock; phone + desktop, motion + reduce).

## Open (not built)
- AMA 18 (no peek in a timed exam): there is no timed mode yet. Add the check when one ships.
- AMA 10 / P7: lane (c) is not live; when it lands, its waiting duck calls `stemDuck.rise` (the 🔒 SYNC: its rise replays the sunrise too).
