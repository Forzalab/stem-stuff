# UI consistency audit: one report (2026-10-08)

## Summary

- Three read-only audits merged: A = how a student reaches Cluck (56 states), B = the question screen across 14 question kinds, C = start screen, top bar, rewards HUD, question list, notes, toasts.
- Sizes: phone 393x852 (touch, DPR 2) and desktop 1280x800. Chromium only (Playwright). No WebKit run.
- Base: `origin/main` 6f7bec5 (the brief also names a6cc486; all three part reports state 6f7bec5 and their line numbers come from it).
- Limits: the repo ships no snack and no keyed question, so A and C used fixture banks and B stubbed one snack. YouTube was blocked, so `#rot` shows blank cards. `/explain` and `/chat` were stubbed; no real model ran.
- Not covered: keyboard-up notes pad, drop banner in full, level-3 folded card, follow-up chat turns.

## THE rule

**One Cluck entry per question: a single chip (duck icon, label "Cluck's steps") under the hint row is the only control that opens the Cluck sheet, the sheet is always titled "Cluck's steps", and it works the same on phone and desktop. The "Similar solution steps" card stops being a door: its steps become a fold inside the sheet.**

How a dev builds it:

- **Where.** Chip sits under the hint row. It shows while the sheet is closed. It hides while the sheet is open (the X closes). No state ever shows two Cluck buttons. No "Show / Hide" label swap.
- **Label.** One label in every state: "Cluck's steps". The state shows as a small dot inside the chip (writing = pulsing dot, `aria-busy`), never as new words.
- **Sheet title.** "Cluck's steps" always (matches STYLE.md "Cluck's surfaces", RM3). Today it flips to "Similar solution steps" on a snack (app.js:1341).
- **Sheet content order.** Cluck's text first, then a fold "Similar solution steps, N steps" (closed). With no Cluck text (snack before answering, 429, Cluck off) the fold is open. The FREE sticker moves onto that fold header.

| State | Chip | Sheet when opened |
|---|---|---|
| Keyed, not snack, before answering | none | n/a |
| Snack, before answering | shown | fold open, no ask field |
| Wrong answer, `/explain` pending | shown, writing dot | Cluck caret, fold closed, ask field |
| Success | shown | Cluck text, fold closed, ask field |
| Failed (500 / network) | shown, same label | "Didn't load." + inline Try again (as today, app.js:1231-1235) |
| Local cap (5 auto-starts an hour) | shown, same label; no auto-start | first tap starts `/explain`, then as Success |
| Server 429 | shown, same label | "Cluck is out of wishes for this hour. Try again later." (app.js:1233); chip tap never calls `/explain` again; ask field hidden, not disabled; fold open |
| 404 / 503 (Cluck off) | none on a non-snack; on a snack the chip stays | steps only, fold open |

Phone vs desktop: same chip, same label, same place. One difference stays: desktop auto-opens the sheet on a wrong answer (app.js:1136), phone does not. With one chip the `#rot` column no longer parks to an edge tab depending on button count (brainrot.js:166).

This keeps Tony's two earlier calls (Oct 5): desktop hides the chip while the sheet shows Cluck (app.js:1266, "variant a"), and phone snack has one way in (app.js:1267, "TODO C"). The rule just applies both everywhere.

### Not picked (for later)

- B: one "closed + right" look (full-strength green) and one pips / not-ready-arrow placement for every question kind; only the control's shape differs.
- C: anything on screen on every question (top bar, HUD, toasts, notes button) takes radius, font sizes, weights and surfaces from `:root` tokens; a skin recolours its own box only, and STYLE.md lists each exception with the value that ships.
- C: use one name, "Scratchpad" (STYLE.md) or "Notes" (UI), everywhere. Pick the word, then fix the other side.

## Ranked fix list

Rank = student impact x how often it is seen. Rows 1-5 are the THE-rule work. Size: S = a few lines, M = one component, L = touches several files and tests. Shots are relative to `design/notes/`.

| # | Finding | file:line | Shot | Size | Owner |
|---|---|---|---|---|---|
| 1 | Replace the card + chip + desktop auto-open with the single chip door (3 doors today; phone snack shows card only, phone non-snack chip only, desktop both) | app.js:1266-1268, 1488, 1509, 1531-1535 | [phone-snack-wrong-done-closed](../shots/ui-audit-a-2026-10-08/phone-snack-wrong-done-closed.png), [phone-nonsnack-wrong-done-closed](../shots/ui-audit-a-2026-10-08/phone-nonsnack-wrong-done-closed.png), [desktop-snack-wrong-done-closed](../shots/ui-audit-a-2026-10-08/desktop-snack-wrong-done-closed.png) | L | AI entry |
| 2 | One sheet title ("Cluck's steps") and one fold default; today the title follows `has.steps` not the opener, and the fold is open from the card, closed from desktop auto-open | app.js:1316, 1341 | [phone-snack-wrong-done-open](../shots/ui-audit-a-2026-10-08/phone-snack-wrong-done-open.png), [phone-nonsnack-wrong-done-open](../shots/ui-audit-a-2026-10-08/phone-nonsnack-wrong-done-open.png), [desktop-snack-wrong-done-open](../shots/ui-audit-a-2026-10-08/desktop-snack-wrong-done-open.png) | M | AI entry |
| 3 | Server 429: chip must not re-fire `/explain` (call count 1 to 2); ask field shows "5 left" but is disabled; open-chip next to open sheet on desktop cap | app.js:1164, 1233, 1266-1268, 1381-1384 | [phone-snack-cap-429-open](../shots/ui-audit-a-2026-10-08/phone-snack-cap-429-open.png), [desktop-snack-cap-local-open](../shots/ui-audit-a-2026-10-08/desktop-snack-cap-local-open.png) | M | AI entry |
| 4 | Failure / off states: 500 gets new chip words, 503 and 404 hide every Cluck control silently; make all three follow the state table | app.js:1231-1235, 1261-1264, 1331 | [phone-snack-fail500-closed](../shots/ui-audit-a-2026-10-08/phone-snack-fail500-closed.png), [phone-snack-fail503-closed](../shots/ui-audit-a-2026-10-08/phone-snack-fail503-closed.png) | S | AI entry |
| 5 | "Explain" names three things (desktop `#rot` header, sheet aria-label, chip); the header sits over videos, not an explanation. Rename the header and aria to "Cluck's steps" / drop the header | brainrot.js:79, app.js:1289, 1268 | [desktop-nonsnack-wrong-done-closed](../shots/ui-audit-a-2026-10-08/desktop-nonsnack-wrong-done-closed.png) | S | AI entry |
| 6 | Picked choice loses its blue border while hovered (hover rule beats checked rule); on touch the hover sticks after a tap | app.css:260, 269 | [mc5-ready-393](../shots/ui-audit-b-2026-10-08/mc5-ready-393.png), [mc3-ready-393](../shots/ui-audit-b-2026-10-08/mc3-ready-393.png) | S | quiz |
| 7 | Notes has three names: "Notes" / "Open notes" / "Close notes" in UI, "Scratchpad" in STYLE; the Copy tooltip says "Copy my work for Tony" | index.html:202, 207, 215, 221, 224; app.js:2113 | [phone-11-notes-pad-empty](../shots/ui-audit-c-2026-10-08/phone-11-notes-pad-empty.png), [phone-14-toast-onboard-fab](../shots/ui-audit-c-2026-10-08/phone-14-toast-onboard-fab.png) | S | chrome |
| 8 | Phone notes button: radius 10 (spec 16); hover goes darker (`--sheet`) while every button goes lighter | app.css:821, 829 | [phone-05-bank-q1-hud-zero](../shots/ui-audit-c-2026-10-08/phone-05-bank-q1-hud-zero.png), [phone-10-notes-entry-closed](../shots/ui-audit-c-2026-10-08/phone-10-notes-entry-closed.png) | S | chrome |
| 9 | Multi: try pips land in the "a)" column left of the box, not right-aligned under it | app.js:893, 981; app.css:314, 362-368 | [multi-wrong-393](../shots/ui-audit-b-2026-10-08/multi-wrong-393.png), [num-wrong-393](../shots/ui-audit-b-2026-10-08/num-wrong-393.png) | S | quiz |
| 10 | Start screen jumps 16.4px (phone) / 17.2px (desktop) when the error line appears; field is radius 10 not a pill | app.css:109, 118, 123, 134 | [phone-03-start-typed-suggest](../shots/ui-audit-c-2026-10-08/phone-03-start-typed-suggest.png), [phone-04-start-error-unknown-code](../shots/ui-audit-c-2026-10-08/phone-04-start-error-unknown-code.png) | M | chrome |
| 11 | A right answer is dimmed (opacity .5) on num / text / multi but full strength on choice rows | app.css:346 | [num-right-393](../shots/ui-audit-b-2026-10-08/num-right-393.png), [mc5-right-393](../shots/ui-audit-b-2026-10-08/mc5-right-393.png) | S | quiz |
| 12 | Three "not ready to send" looks for the same arrow: hidden (pick, multi), disabled .45 (num), enabled with nothing ticked (choose-all) | app.js:532, 547, 734, 809; app.css:189 | [mc5-idle-393](../shots/ui-audit-b-2026-10-08/mc5-idle-393.png), [num-idle-393](../shots/ui-audit-b-2026-10-08/num-idle-393.png), [all-idle-393](../shots/ui-audit-b-2026-10-08/all-idle-393.png) | M | quiz |
| 13 | Rewards HUD ships a second palette, radii 14 / 10, raw px fonts and image sizes, and a streak chip, wider than the STYLE exception. Needs Tony's call: change the HUD or change STYLE.md to match | rewards.css:29-33, 43-53, 67-71, 81-92 | [phone-07-hud-after-correct](../shots/ui-audit-c-2026-10-08/phone-07-hud-after-correct.png), [phone-08-hud-popover](../shots/ui-audit-c-2026-10-08/phone-08-hud-popover.png) | L | chrome |
| 14 | Wrong-answer hint and pips move per kind and size (choose-all hint beside Check on desktop, under it on phone) | app.js:1075; app.css:305-308, 314 | [all-wrong-393](../shots/ui-audit-b-2026-10-08/all-wrong-393.png), [all-wrong-1280](../shots/ui-audit-b-2026-10-08/all-wrong-1280.png) | M | quiz |
| 15 | Mc2 / mc3 pills resize when one is picked (extra right padding), so the row jumps under the finger | app.css:326 | [mc3-ready-393](../shots/ui-audit-b-2026-10-08/mc3-ready-393.png), [mc3-wrong-393](../shots/ui-audit-b-2026-10-08/mc3-wrong-393.png) | S | quiz |
| 16 | Update bar vs onboarding toast: different surface, border, weight and role for the same shape; the second onboarding toast covers the live notes box | app.css:906-912, 925-931; app.js:2113 | [phone-14-toast-onboard-fab](../shots/ui-audit-c-2026-10-08/phone-14-toast-onboard-fab.png), [phone-15-toast-onboard-switch](../shots/ui-audit-c-2026-10-08/phone-15-toast-onboard-switch.png), [phone-16-updatebar-injected](../shots/ui-audit-c-2026-10-08/phone-16-updatebar-injected.png) | M | chrome |
| 17 | Multi text sits 4px off the card text on phone (20px pad vs 16px) and card to first row gap is 4px not 12px | app.css:397-398, 666 | [multi-idle-393](../shots/ui-audit-b-2026-10-08/multi-idle-393.png) | S | quiz |
| 18 | Submit arrow inset differs: choose-all sits 0px from the edge, others 2px | app.css:290, 305, 373 | [all-idle-393](../shots/ui-audit-b-2026-10-08/all-idle-393.png), [num-idle-393](../shots/ui-audit-b-2026-10-08/num-idle-393.png) | S | quiz |
| 19 | Number placeholder "Like 9/2, sqrt(3), dne" contradicts a `how` line such as "A decimal, like .5"; text and multi get none | app.js:554 | [numhow-idle-393](../shots/ui-audit-b-2026-10-08/numhow-idle-393.png), [text-idle-393](../shots/ui-audit-b-2026-10-08/text-idle-393.png) | S | quiz |
| 20 | Question list floats over the question with a .55 scrim; STYLE says "in the flow, covers nothing". Update STYLE or the list; two X marks read as a counter | nav.css:21, 42, 86-103, 71-74 | [phone-09-qlist-open-marks](../shots/ui-audit-c-2026-10-08/phone-09-qlist-open-marks.png), [phone-18-qlist-long](../shots/ui-audit-c-2026-10-08/phone-18-qlist-long.png) | S | chrome |
| 21 | Choice rows differ in height by content: 52 plain, 54 with KaTeX, 61.7 with a fraction | app.css:254-261 | [mc5-idle-393](../shots/ui-audit-b-2026-10-08/mc5-idle-393.png) | S | quiz |
| 22 | Figure labels fixed at 16px (ticks 14px), smaller than 19px question text on desktop | app.css:246-248 | [fig-cart-idle-1280](../shots/ui-audit-b-2026-10-08/fig-cart-idle-1280.png), [fig-scene-idle-1280](../shots/ui-audit-b-2026-10-08/fig-scene-idle-1280.png) | S | quiz |
| 23 | Notes box off the 4/8 scale: textarea radius 6, padding 12 / 14.4, tool-row inset 6px, status offset `6px + 88px` | explain-box.css:5-30; app.css:658, 765, 801 | [phone-11-notes-pad-empty](../shots/ui-audit-c-2026-10-08/phone-11-notes-pad-empty.png), [phone-12-notes-pad-typed](../shots/ui-audit-c-2026-10-08/phone-12-notes-pad-typed.png) | S | chrome |
| 24 | HUD zero state: bar track is 1.05:1 on the page, a star next to a black slot; first reward shrinks the bar 311 to 137px | rewards.css:55-59, 74 | [phone-05-bank-q1-hud-zero](../shots/ui-audit-c-2026-10-08/phone-05-bank-q1-hud-zero.png), [phone-07-hud-after-correct](../shots/ui-audit-c-2026-10-08/phone-07-hud-after-correct.png) | S | chrome |
| 25 | Hint row wears the Cluck duck but is static text, and a question with no key shows the duck hint and no door | app.js:1091, 1096-1103 | [phone-nonsnack-wrong-done-closed](../shots/ui-audit-a-2026-10-08/phone-nonsnack-wrong-done-closed.png), [phone-plain-wrong-done-closed](../shots/ui-audit-a-2026-10-08/phone-plain-wrong-done-closed.png) | S | AI entry |
| 26 | Small drift: `#privacy` has its own inline `<style>` with raw px; HUD strip margins raw px; `.qnav .btn:disabled` duplicates the button rule | index.html:229-238; rewards.css:30, 38, 43, 55, 67; nav.css:9 | [phone-01-start-idle](../shots/ui-audit-c-2026-10-08/phone-01-start-idle.png), [phone-05-bank-q1-hud-zero](../shots/ui-audit-c-2026-10-08/phone-05-bank-q1-hud-zero.png) | S | chrome |
| 27 | Multi box is a fixed 16rem on desktop (256px) while other boxes are full width; probably deliberate, confirm | app.css:383 | [multi-idle-1280](../shots/ui-audit-b-2026-10-08/multi-idle-1280.png), [num-idle-1280](../shots/ui-audit-b-2026-10-08/num-idle-1280.png) | S | quiz |

Merged: A findings 1-6 became rows 1-5; the Copy tooltip is part of row 7; B's pips/hint placement (row 14) and A's hint-row note (row 25) stay separate.

**Dropped (claim had no file:line + shot in the part report):** A 8, "Key formulas gate is `formulas`, `#rot` gate is `wish`" (code only, A says no shot; the rest of A 8 says it never changes, so there is nothing to fix). C 7, STYLE colour table and `--hint` contrast on `--raised` are stale (STYLE.md and app.css:4-5 cited, no shot). C 10, `#swap` shipped in markup and hidden by CSS (index.html:175, app.css:759; it renders nothing, so no shot). Three claims dropped. If Tony wants the STYLE.md colour table fixed, it needs a shot of a `--raised` hover row first.

## Links

- [A-ai-entry.md](ui-consistency-2026-10-08/A-ai-entry.md): Cluck entry points, 56 states. Shots in `design/shots/ui-audit-a-2026-10-08/`.
- [B-quiz-screen.md](ui-consistency-2026-10-08/B-quiz-screen.md): question screen across 14 kinds. Shots in `design/shots/ui-audit-b-2026-10-08/`.
- [C-other.md](ui-consistency-2026-10-08/C-other.md): start, top bar, HUD, list, notes, toasts. Shots in `design/shots/ui-audit-c-2026-10-08/`.
- [STYLE.md](../STYLE.md): the intended rules.
