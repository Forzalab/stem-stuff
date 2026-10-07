# NAV-MOBILE: the bar goes to the bottom on phones, and a Next shows up after a right answer (agent NM, Oct 7 2026)

Tony: "mockup to {move the top bar downwards for mobile, show a next button after answer is correct}. design, spec, propose 7 mockup pass Impeccable."

Mock: `try/nav-mobile.html?v=1..7` (+ `&state=q|picked|wrong|right|out`, `&q=1..3`, `&cluck=1`, `&kb=1`, `&rm=1`). Files: `try/nav-mobile.{html,css,js}`.
The mock is built for the PR #92 queue world: no Shuffle and no Redo. Next plays the hidden queue and never runs out. Prev walks back through history.
Built from real parts: the `app.css` tokens, `.btn` / `.btn-go` / `.btn-label`, the `.choices .ch .opt .badge .txt` markup with the in-row `.send` arrow, the `.qlist` rules from `nav.css`, and agent U's wrong-pick look (`.opt.mine`: dashed `--edge` edge plus "your pick", no red, no strike) and partial Cluck sheet.
Shots: `design/shots/genui/navm-*`.

## 1. The problem

**What the judges hit.** Eight blind judges ran R0 on a 393×852 phone and R1 at 1280×800 (brain `phys2a-exam2-bank/proposals/qrewrite/ROUND0.md`, `ROUND1.md`, `judges/r0-j*.md`, `judges/r1-j*.md`):

- **No Next near the answers.** All 4 R0 judges said this, unprompted. j1: "No 'Next' after answering/after 'No tries left'". j2: "after answering there's never a Next button at the bottom". j4: "green tick, answer was right, confetti. Now what? No Next button on screen". R0 walk: 10–11 taps plus 5 scrolls for 3 questions.
- **The only way forward is a small ">" at the top right (352,40), and it scrolls away.** Judges scrolled down looking for Next, then back up. On desktop (R1 j1) "scroll -800 did NOTHING". The judge then had to "aim at a button that was ~80% off-screen" at (1235,8).
- **The bottom-left ">" tab is not Next.** It is the brainrot video tab, `.rtab` "Show video" (AUDIT-FRUSTRATED §S-notes). 3 of 4 judges tapped it hoping for Next. It opened "Video unavailable" panels that covered choices D/E for the rest of the session.
- **Submit takes 2 taps** (pick the row, then an unlabeled arrow), and "is this Check or Next?" (j2).
- **Things float over the choices and feedback:** the "Open notes" pill, and a full-screen LEVEL UP with no exit.
- **The page jumps to the top after a right answer,** so "the result is off-screen" (j3).

**Why prod looks like this.** I read the code: `index.html`, `nav.css`, and `app.js` `layoutDock` / `doneExit`.

- `.dock-bottom` is the **code-box dock**, not the question nav. On phones, `nav.css` says "the nav is the top bar". `#qnav` stays in `header.top` in normal flow (NAV.md: "they scroll away"). `.dock-bottom .dock` is the fixed bottom entry bar. With a problem open it rests as a strip (`bar-mini`, `#barTab`), and the lock-in rule hides it while a choice is picked (`html:has(... [aria-checked]) #dock { visibility: hidden }`).
- **Net effect: the thumb zone holds the code box, and the way forward is at the top.**
- `doneExit()` makes up for this. 900 ms after a right answer it blurs the field and runs `scrollTo({top: 0})`, so the top bar's › comes back into view. The judges felt this as "screen jumps back to top" with the verdict off-screen. Out of tries never scrolls, which leaves her stranded at the bottom.

## 2. The spec (all variants)

**One Next.** One component: `.btn.btn-go.btn-label`, the word "Next" (or "Next question" at full width) and the `i-next` chevron after it.
- It is the only filled control on screen while it shows (STYLE §1.4).
- Same tokens, label and look on phone and desktop. Only its place changes.
- It enters with an 8px rise and fade over 200 ms ease-out. Reduced motion gets a 200 ms fade only; `?rm=1` makes it instant.
- *Deviation for Tony:* STYLE §3 bans "a → after a word". The chevron is not an arrow: it matches the bar's ›, so she links the two. If you'd rather, the icon can go first.

**The bar on phones / touch** (`max-width: 700px` or `pointer: coarse`, the same test as `app.js` `dockMQ`):
- Fixed at the bottom: `padding-bottom: env(safe-area-inset-bottom)`, `--paper`, a 1px `--line` top edge.
- Contents: `[≡ list] [✎ notes] ··· [‹] [›]`.
- The floating "Open notes" pill dies. Notes becomes a 48px button in the bar, so **nothing floats over a choice**.
- The bank code ("BANK_P2X", which judges called meaningless) hides on phones. The list is icon-only there, with aria-label "All questions".
- Nothing interactive sits in the top corners. The page gets bottom room equal to `--nb-h` (the measured bar height) and `scroll-padding-bottom` of the same size, so nothing scrolls under the bar.

**Desktop** (fine pointer, wider than 700px) keeps its top bar, made **sticky** (it never scrolls away: R1 j1). Same four controls, and the bank code shows. Per-variant placement is in §3.

| state | what shows | Next |
|---|---|---|
| **question** | bar: list, notes, ‹ (off on the first), › as a quiet icon (aria "Skip this one") | none |
| **picked** | prod lock-in: the other rows fade, the row's `.send` arrow shows (v4: the bar's button becomes a filled **Check**) | none |
| **wrong, tries left** | her row: `.opt.mine` (dashed, "your pick", disabled). Under the choices, a Cluck card with the wise-feedback line (no joke, no QUACK), then grey pips + "Pick again. 1 more try." and [Ask Cluck]. The page scrolls the card just above the bar (`block: nearest`, never to the top). The bar's › gets the word **Skip**, still quiet | **no Next.** Retry first; Skip is the quiet way out |
| **right** | the row turns `--ok` with a check badge and one 2× pop (prod `opt-pop`, still under reduced motion). "✓ Right." + one strategy line; a joke only on its own line after it (Q2). The page scrolls the line into view (nearest) | **Next appears in the variant's place** |
| **out of tries** | "Out of tries for now. This one comes back around." + "The right one is C, 9.0 J." (the right row in `--ok`). No "Ask Tony", no red | **Next appears**, same place as for right |
| **Cluck open** | partial sheet, `min(45svh, 420px)`, `.ai-skin`, docked **above the bar** (`bottom: --nb-h`): the bar and its Next stay visible and tappable. The X is 44×44 inside the sheet, not a screen corner. "Pick again" closes it and centres the choices. Desktop: a 26rem card bottom-right | v3 only: the card is under the sheet, so the sheet carries its own Next |
| **keyboard up** (answer boxes) | the bar steps aside (opacity, like prod `dock-away`). The field's own arrow is the Check. On a right answer the keyboard steps away (prod `doneExit` timing, 900 ms, minus the scroll-to-top) and the bar comes back with Next | after the keyboard goes |
| **list open** | phone: a `.qlist` card above the bar (55svh max). Desktop: a dropdown under the sticky bar | unchanged |

**Next does:** open the queue's pick. A done question shown again is a fresh showing. Scroll to top is instant, because a new page is not a jump. Prev reopens history with its marks.

**What wrong never shows:** a filled Next, red, strike-through, an X, a score drop, or a joke.

## 3. Seven variants

Shots per variant: `navm-v{n}-question-393.png`, `-right-393.png`, `-wrong-393.png`, `-question-393-full.png`, `-question-1280.png`, `-right-1280.png`, `-right-ios-safari-expanded.png`.
Extra: `navm-v{1,3,4,5}-cluck-{wrong,right}-393.png`, `navm-v5-wrong-q2-393.png`, `navm-v1-kb-393.png`, `navm-v1-kb-right-393.png`, `navm-v1-out-393.png`, `navm-v{1,4}-{q,right}-390-webkit.png`, `navm-v4-question-ios-safari-expanded.png`, `navm-v4-right-rm-ios-standalone.png`.

| v | phone | desktop | why | risk |
|---|---|---|---|---|
| **1 Dock swap** | bar at the bottom; on right / out, its › grows into a filled **Next** in the same slot (bottom-right, the thumb) | sticky top bar; the same › becomes the same Next | smallest change from prod (same 4 buttons, moved); one spot for "forward", always | the change is small (icon → word), so a tired eye can still miss it; no Check label |
| **2 Next shelf** | the bar never changes; a full-width 56px **Next question** rises onto a shelf above it | full-width Next under the answer card | biggest target on screen, right where the thumb rests; the bar stays a calm map | two fixed layers take ~130px of a 659px Safari view; can read like an ad banner |
| **3 Next in the card** | Next, full width, right under the answer + its "why you're right" line; the bar's › stays quiet | the same, right-aligned under the answer | eyes and thumb are already on the row she tapped | two ways forward (quiet › + filled Next); the card hides under the Cluck sheet (handled: the sheet gets a Next) |
| **4 One thumb button** | no row arrow; one bottom-right button whose word says what it does: **Skip** (quiet) → **Check** (filled, after a pick) → **Next** (filled, after right / out) | the same button under the choices, right edge | fixes the unlabeled arrow AND the missing Next; pick, check and go never move the thumb | biggest change; on a long stem, Check is far from the row; a word changing under the thumb invites a double tap (Next ignores taps for 400 ms after it appears) |
| **5 Result footer** | after a check, the bar turns into a `--sheet` footer: the verdict line + full-width **Next question**. Wrong: the wise-feedback line, pips, quiet **Skip for now** | the same as an in-flow strip under the card | Duolingo's proven footer: verdict and action in one place, at the thumb | the footer is ~200px tall and covers the page (we scroll the choices above it); Prev and the list hide until the next question |
| **6 Segmented bar** | one segmented control `[≡][✎][‹][Skip ›]`; the wide right segment becomes a filled **Next** | the same segmented bar, sticky at the top | one object with an obvious forward end; "forward" is always the same half | looks like tabs; a worded Skip sits in the forward slot from the start (could tempt skipping the retry); no progress count on purpose (STYLE §1.10) |
| **7 Floating Next, peek bar** | the bar hides on scroll down and returns on scroll up; Next is a 56px floating button above the bar / home indicator once she is right, whatever the scroll | no hiding: sticky top bar; the floating Next sits bottom-right of the column | most room for a long stem; Next depends on the answer, not on a gesture | the judges' exact bug ("scroll up didn't bring it back") becomes a feature for Back / list / Skip: a hidden control (STYLE §1.11); a float near content |

**Favourite: v4 (One thumb button), with v1 as the ship-tonight fallback.**
- It is the only variant that answers all three judge complaints with one control: the unlabeled arrow, no Next, and hunting for the way forward.
- Her thumb lands on one bottom-right spot for every step. The word on it ("Check", "Next") says what happens before she taps.
- On a wrong pick that spot falls back to a quiet "Skip", so retry stays the obvious move.
- v1 is the same bar without the Check change, and it is the cheapest prod diff.

## 4. Prod notes (no prod file edited)

1. `nav.css`: under `.dock-bottom.qnav-on:not(.start)`, move `#qnav` into a fixed bottom bar: `bottom: 0; padding-bottom: env(safe-area-inset-bottom)`. Desktop `.top` becomes `position: sticky; top: 0`.
2. The code box, `#barTab` strip and `#padFab` need a new home on phones:
   - The code box opens from the list sheet (C8 already does this).
   - Notes becomes a bar button.
   - The `.rtab` video tab leaves the bottom-left corner.
3. `app.js`:
   - `doneExit()` drops the `scrollTo({top: 0})`.
   - Add a `drill:done {code, how: "right" | "out"}` event so nav.js can promote Next.
   - The wrong / right render scrolls `#fb` to `block: "nearest"` with `scroll-padding-bottom: var(--dock-h)`.
4. Remove "No tries left. Ask Tony about…" (PR #92 already does this). Grey pips, not `--bad`.
5. Tests: one walk per state in `tests/render.pw.mjs` (Next visible and inside the viewport after right / out, absent after wrong). Plus a check that nothing sits over `.opt` (`elementFromPoint` on every row's centre with the bar, the sheet and the list open).

## 5. Testing layers run

- **Chromium (Playwright, chromium-1194)** at 393×852 (touch, isMobile) and 1280×800, for every variant.
  - The real flow on Q1, the long question: wrong pick → right pick → the Next box is measured inside the viewport (**14/14 IN VIEW**) → tap Next → Question 2 opens.
  - Extra states: Cluck open (wrong / right) for v1/3/4/5, keyboard up → right → keyboard away + Next (v1), out of tries, v5 wrong on Q2.
  - 0 page errors.
- **WebKitGTK** 390×844: v1 and v4, question + right.
- **ios-sim** (`ios-sim.py`): safari-expanded `--overlay` for all 7 variants (right state) plus v4 question; standalone `--overlay --rm` for v4.
- **Impeccable** (`tools/impeccable.sh` from PR B):
  - The live pass covers `?v=1..7` + `?v=4&rm=1` × 390×844 / 1920×1080 / 2560×1440 / 3840×2160 = 32 runs, **0 findings**, and the static scan of `try/nav-mobile.css` + `.js` is **0**. That run exits 0.
  - A static scan of the `.html` file follows its link into prod `app.css` and reports `.cl-live .dots` pulsing-dot. That is prod, already waived in `.impeccable/config.json`, and not on this page.
- **No BrowserStack credentials.** Needs real iOS:
  1. `env(safe-area-inset-bottom)` under the fixed bar with the home indicator, and while Safari's toolbar collapses and expands (does the bar ride the toolbar or jump?).
  2. iOS 26 Liquid Glass floating toolbar over a bottom bar (content under the bars).
  3. Real keyboard: the fixed bar on the layout viewport while the visual viewport shrinks (prod `--kb-bottom` path). Check the bar never floats mid-screen over the keyboard.
  4. v7 scroll direction with momentum / rubber-band (false hides at the bottom bounce).
  5. Thumb reach on a 6.7" phone for the bottom-right button vs a full-width one (v2 / v5).
  6. A double tap on v4's Check → Next with real touch (the 400 ms guard).

## 6. SHAME CHECK (per variant)

Shared by all seven:
- **(2) Banned items:** none. No red (pips are grey; the wrong row is dashed `--edge` + "your pick"), no lone X, no score, no "Wrong!", no "Just / Simply / Easy", no timers, no comparisons.
- **(3) Techniques:** 1 (wise feedback first line: "Tricky one. … You can get it."), 2 (normalize: "This one trips most people"), 5 (retry first: no Next on wrong), 7 (few words, the next step is a thing to grab), 8 (QUACK joke only after a right answer, on its own line), 9 (out of tries: "This one comes back around." + the queue), 10 (≤3 lines before anything else).
- **(5) Taps to the aha:** the aha here is "how do I go on". Below is the iPhone count after the right check, Chromium lens. Mid Android: same taps, one ~16 ms frame slower; not measured on a device.

| v | (1) a wrong pick, in her voice | (4) would she reopen it tomorrow? | (5) iPhone |
|---|---|---|---|
| 1 | "It said pick again, and the arrow at the bottom just said Skip, so I tried again." | yes, the way on is always in the same corner | 1 tap, 0 s search (Next is where › was) |
| 2 | "Nothing big appeared until I got it, then a huge Next showed up." | yes, though the banner can feel loud | 1 tap, 0 s |
| 3 | "The duck talked right under my answer; the Next only came when I was right." | yes, and it reads like the page answering her | 1 tap; Next is under her eyes, but a short scroll may follow the check |
| 4 | "The button said Skip, then Check when I picked again; I never looked for anything." | yes, the most "it waits for me" feel | 1 tap, thumb never moves (pick → Check → Next) |
| 5 | "The bottom told me why, kindly, with a small Skip; I picked again." | yes, the closure moment is clear (Duolingo habit) | 1 tap; the footer covers the page bottom |
| 6 | "Skip was sitting there in the forward spot the whole time, a little tempting." | probably, since the bar is clear, but the Skip temptation is a retention risk for learning | 1 tap |
| 7 | "I scrolled to read and the bar was gone; I had to scroll up to find Skip." | maybe: Next is fine, but the hidden bar echoes the judges' worst moment | 1 tap after right; 1 scroll to find Skip / Back |
