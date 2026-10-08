# UI consistency audit, part C: everything else (2026-10-08)

Scope: notes page (the pad), question list (qlist), rewards row / HUD, toasts, start screen. Not covered here: A (Cluck entry points) and B (question screen by kind).
Base: origin/main 6f7bec5, worktree `/home/user/wt-audit-c`, read-only (no code changed). Local `serve.py` only, Chromium via Playwright, external requests (YouTube embeds) aborted.
Viewports: **393x852** (touch, DPR 2) and **1280x800** (fine pointer, DPR 1). Values below are `getBoundingClientRect` / `getComputedStyle` readings from those runs.
Test data: a throwaway bank `BANK_RW12` (5 mc questions, 2 of them snacks, so the HUD mounts; same fixture shape as `tests/rewards.pw.mjs`) and a copy of `banks/BANK_PSY6.json` (38 rows, no HUD). The repo has no problem with a `wish` or `snack`, so the HUD never shows on repo data alone.
Shots: `design/shots/ui-audit-c-2026-10-08/` (names `phone-NN-*` / `desk-NN-*`; NN is the number in the "shot" column). The brainrot video tiles are hidden in the shots (blocked iframes render white); they are not part of C.
Rules read: `design/STYLE.md` (referred to as "STYLE §x"). Line numbers are for `app.css` unless a file is named.

Not captured (say so rather than guess): the keyboard-up pad peek (`html.swap-problem`, app.css:748-755; cannot raise a real keyboard in headless), the Swap button (`#swap` is `display:none !important`, app.css:759), the code-suggestion dropdown (a fresh browser has no history, so `#codeSug` stays empty in shot 03), the desktop "code chip" state, the drop banner itself (`FX.toast` only fires on a drop or level-up; the in-flight XP fx is in phone/desk-06).

---

## 1. Inventory

Format: element, 393 value | 1280 value (only when different), file:line, shot.

### Start screen (`html.start`)

| element | values | file:line | shot |
|---|---|---|---|
| title "Type a code to start." | 28/700 `--ink`, 361x35 | 36/700, 640x45 | app.css:103-106 | 01 |
| entry field | 361x60, radius **10**, 1px `--edge`, `--sheet`, `--shadow-1` | 640x62, same | app.css:107-112 | 01 |
| field focus | border `--focus` + inset 1px, `--shadow-3` | same | app.css:114 | 02 |
| upload / paste (inside field) | 48x48, radius **6**, transparent, `--muted` icon 24 | 50x50, icon 25 | app.css:118 | 01 |
| go arrow | 48x48, radius 6, `--c1` fill, `--field` icon | 50x50 | app.css:121 | 03 |
| code text | 18/700 uppercase; placeholder "e.g. CALC1_E01" 400, not uppercase | 19 | app.css:67-69, 116-117 | 01, 03 |
| error line | 16/400 `--bad`, centred, 361x24.8 | same | app.css:134; copy app.js | 04 |
| privacy link, `dev` tag | 14/400 `--hint`, underlined, 44px target | 15 | index.html:229-238; app.css:934 | 01 |

### Top bar with a bank open

| element | values | file:line | shot |
|---|---|---|---|
| list button `#qlistBtn` | 152.7x48, radius 8, `--sheet`, 16/700, icon 24 | 159x50, 17/700, icon 25 | nav.css:4-7; app.css:175 | 05 |
| Prev / Next | 48x48, radius 8, `--sheet`, icon 24; disabled 0.45 | 50x50 | app.css:175-181; nav.css:9 | 05 |
| gap in bar | 8 (`--s2`) | same | nav.css:8 | 05 |

### Rewards row / HUD (`#rwHud`)

| element | values | file:line | shot |
|---|---|---|---|
| strip | 361x48, radius **14**, no fill, gap 12 raw; own row under the nav on phones (margin 12 raw) | 957x50, in the nav row | rewards.css:29-33, 36-38 | 05 / desk-05 |
| coin chip | 86x36, radius **10**, fill #0d0903, 1px #8a6400; number 22/700 #ffe14d; coin image 28 | 86x38 | rewards.css:43-53 | 07 |
| star + bar | star image 40, level digit 16/700 #4a2300; bar 6px, track #0d0903, fill #ffe14d | bar 594-755 wide | rewards.css:55-59 | 05, 07 |
| "N XP to level N+1" | 18/700 #e9d6a4; hidden under a 470px strip | shown, 125x20 | rewards.css:64, 75 | desk-07 |
| streak chip | 64x36, radius 10, fill #2a1606, 1px #6b3510, text #ffc48a 22/700; flame image 26 | 64x38 | rewards.css:67-71 | 07 |
| "your progress" popover | 320x247, radius **14**, fill #1b1407, 2px #e0b432, body 17/400, heading 22/700, raw shadow | same | rewards.css:81-92 | 08 |

### Question list (`#qlist`)

| element | values | file:line | shot |
|---|---|---|---|
| panel | 361x314 (phone, floating under the bar), radius 10, `--sheet`, pad 8, `--shadow-3`; dim scrim `rgb(0 0 0 / .55)` over the page, z 46 | 1240x118, 3 columns | nav.css:21, 42, 50-53, 86-103 | 09, 18 |
| row | min 48 (`--btn`), radius 8, pad 12, gap 12, 18/400 `--ink` (wraps to 2 lines on phone, one line + ellipsis on desktop) | 50 high, 19/400 | nav.css:56-62 | 09 / desk-09 |
| number | 18/700 `--muted`, tabular; current row `--c1` on `--raised` | 19/700 | nav.css:65-68 | 09 |
| done marks | 20x20, `i-ok` `--ok` / `i-x` `--bad`, gap 2 (two X for two misses) | same | nav.css:71-74 | 09 |
| gone row | title `--hint` + 2px strike, number `--hint` | same | nav.css:75-78 | 09 |

### Notes page (the pad)

| element | values | file:line | shot |
|---|---|---|---|
| phone button `#padFab` | 159x56, radius **10**, `--raised`, `--shadow-3`, 16/700, label "Open notes"; hover goes to `--sheet` | not shown | app.css:819-829; index.html:224 | 05, 10 |
| label row (desktop) | 17/700 `--muted`, icon 20, text "Notes" (and "Question" beside it) | app.css:636-637; index.html:202 | desk-11 |
| textarea | radius **6**, 1px `--edge`, `--field`, mono 16 (desk 17), pad 12 / 14.4 / 64 (30 when free) | explain-box.css:5-30; app.css:653-657 | 11, 12 |
| focus | border `--focus` + inset 1px | explain-box.css; app.css:656 | desk-12 |
| tool row (phone) | q\|a 86x48 radius 8; collapse, Copy 48x48 radius 8 `--sheet`; inset **6** from the box edge | app.css:658, 764-768 | 11, 12 |
| autosave status | 14/400 `--hint`; while saving `--ink` + sweep mask | desk 15 | app.css:639-647; app.js:1607-1622 | 19 |
| placeholder | "Paste GPT answer here, but me be sad..." body font | app.js:1582; app.css:661 | 11 |

### Toasts and notices

| element | values | file:line | shot |
|---|---|---|---|
| `#toast` (onboarding, 3 notes) | 220-288 x 54, radius 10, fill `--paper`, 1px `--line`, `--shadow-1`, 18/400 `--ink`, pad 12/16, 14px caret; appears only on phones (needs the notes button) | desk shows none | app.css:906-923; app.js:36-90, 2034, 2113-2114 | 14, 15 |
| `#updateBar` ("New version ready") | 323x54, radius 10, fill `--raised`, 1px `--muted`, **18/700**, a button | 339x55, 19/700 | app.css:925-931; offline.js:141 | 16 |
| drop banner `.fx-toast` | radius 20, fill #ffe14d, **4px white border**, rotated -2deg, 19/700, sticker shadow | n/a | rewards.css:178-190 | 06 (fx in flight only) |
| entry error `.entry-msg` | 16/400 `--bad` plain text | | app.css:134 | 04 |

### Empty and zero states

| state | what shows | file:line | shot |
|---|---|---|---|
| start, nothing typed | placeholder only, paste button | app.css:73, 117 | 01 |
| unknown code | red line under the field | app.css:134 | 04 |
| no bank open | no list, no HUD, no nav (hidden) | app.css:97; index.html:156 | 17 |
| HUD, nothing earned | star + bar only; coin and streak chips hidden | rewards.css:74 | 05 |
| notes, empty | placeholder joke; Copy hidden | app.js:1582; index.html:207 | 11 |
| list | no empty state exists (the nav is hidden when there is no list) | index.html:156 | 17 |

---

## 2. Inconsistencies, most visible first

"Visible" = how soon a student sees it in normal use. "Sanctioned" = STYLE.md has a named exception for it, but the exception does not match what ships.

1. **The HUD wears a second palette and a counter on every bank screen (sanctioned in part, but wider than the exception).**
   Gold #ffe14d, amber #ffc48a, brown #2a1606 / #1b1407 fills, colour 3D images (coin 28, star 40, flame 26) sit in the top bar, the one strip visible on every question (shots 05, 07, desk-07). STYLE §3 "Reward layer" allows "violet and sun fills ... radii 12/20/28/pill"; what ships has no violet, and radii **14** (rewards.css:31, 82) and **10** (rewards.css:43, 67) that are neither the exception's list (the `--rw-r-s` 12 token exists, rewards.css:19, and is not used here) nor the surface rule (10 is fine, 14 is not). Fonts are raw px (22 / 18 / 16 / 17; rewards.css:53, 64, 82). The streak counter (rewards.css:67-71; engine.js:9 "The streak never halves") sits against STYLE §1 rule 10 and §6 item 16 ("no streaks"), and that exception list does not mention streaks. Image sizes 28/26/40 break STYLE §4 "No other sizes" (the exception covers the images, not their size).
2. **One thing, three names: "Scratchpad" (STYLE) vs "Notes" (UI).**
   The label row reads "Notes" (index.html:202), the phone button "Open notes" (index.html:224), the toast "Tap here to write notes." (app.js:2113), aria "Close notes" / "Go to notes" (index.html:215, 221). STYLE §1 rule 3, §3 "Scratchpad" and "Scratchpad button", §5 "Name things as the student sees them: 'Scratchpad'" all say Scratchpad. The Copy button's tooltip is "Copy my work for Tony" (index.html:207), a person's name in a student-facing hover, against §5 "Humour ... never in chrome" and "Copy". Shots 05, 11, 14, desk-11.
3. **The phone notes button does not match its spec, and its hover runs backwards.**
   Radius 10 (app.css:821), spec 16 (STYLE §2.5, §3 "Scratchpad button": "16px radius"). Rest `--raised`, hover `--sheet` (app.css:829) = darker on hover, while every `.btn` goes lighter (`--raised`, app.css:183). Shots 05, 10, 14.
4. **Start screen: not a pill, and it jumps when an error appears.**
   STYLE §3 "Start page" and §2.5: a pill field with round 48px buttons; shipped: radius 10 field (app.css:109) with radius 6 buttons (app.css:118). The title in STYLE is "Upload or type code to start."; shipped "Type a code to start." (index.html:135). The error line is added under the field and the block re-centres: title and field move up **16.4px** on the phone (field y 425.5 to 409.1, shots 03 vs 04) and **17.2px** on desktop (379.5 to 362.3), against STYLE §1 rule 5 "Nothing jumps" and §6 item 9. `.entry-msg` is the only dynamic line on that screen (app.css:134, 123).
5. **The question list is described as "in the flow, covers nothing"; it floats and dims the page.**
   STYLE §3 "List and nav": "in the flow under the bar (it covers nothing)". Shipped: absolutely positioned over the question (nav.css:21, 42), `--shadow-3`, plus a full-page `rgb(0 0 0 / .55)` scrim and a lifted top bar (nav.css:86-103). §2.7's shadow table does not list the list, and the scrim is documented nowhere. Shots 09, 18, desk-09. Smaller: two red X marks for two misses (shot 09 row 1) read as a counter (§3 "counters").
6. **Notifications have four looks, and the toast spec describes one that no longer exists.**
   `#toast`: `--paper`, 1px `--line`, 400 (app.css:906-912). `#updateBar`: `--raised`, 1px `--muted`, 700, tappable (app.css:925-931), a different surface, border, weight and role for the same shape and z-neighbourhood, and not in STYLE at all (shots 14 vs 16). The drop banner: yellow sticker, white 4px border, tilted (rewards.css:182-186; documented exception). The entry error is bare red text. STYLE §3 Toast: "Two jobs, one look: the wrong-answer note ... and the onboarding notes". The wrong-answer toast is gone (app.css:310 "they replace the 'One more try' toast"; app.js:1056), so the live toast has one job, and §5's "choose wisely" line points at nothing. Also: the second onboarding toast lies over the live notes textarea (shot 15, toast y 724-778 over the box that spans y 126-844), against STYLE §3 Toast "Never cover a live control".
7. **STYLE's colour table is not the app's.**
   STYLE §2.1 lists `--paper` #151d2b, `--qbox` #192232, `--sheet` #1d2839, `--field` #111826, `--raised` #243149. `app.css:4-5` ships #08111f, #0f1d30, #16243a, #0a1322, #20304a (comment: "Oct 5: darker"). STYLE line 5 says to fix one in the same commit. `--hint` contrast numbers in STYLE §9 #14 are stale too: now 4.68:1 on `--sheet` (passes) and **3.98:1 on `--raised`** (fails; reachable on a hovered or current gone row, nav.css:67, 75).
8. **Notes box details off the shared rules.**
   Textarea radius 6 (explain-box.css:22; already STYLE §9 #3), padding 12 / 14.4 (0.9rem, §9 #12). Tool-row insets 6px (app.css:658, 765) and a status offset built from `6px + 88px` (app.css:801) are off the 4/8 scale (§2.3). Label colour: `--muted` in app.css:636 vs `--ink` in explain-box.css:3, resolved by cascade order only.
9. **HUD zero state and the first reward.**
   The bar track is #0d0903 on #08111f = 1.05:1 (shot 05): a star next to a black slot with no words on phones. First reward: coin and streak chips appear and the bar shrinks from 311 to 137 px wide (shots 05 to 07) in the strip the eye is on. Nothing moves vertically, so this is the mildest "nothing jumps" case.
10. **Smaller drift.**
    `#privacy` carries its own `<style>` block in the body with raw `2.6em`, `44px` offsets (index.html:229-238) while every other component lives in app.css. The HUD strip's margin and gaps are raw 12 / 10 / 14 / 8 / 6 px (rewards.css:30, 38, 43, 55, 67) next to a `--s*` scale. `.qnav .btn:disabled` duplicates the button rule (nav.css:9; STYLE §9 #5). `#swap` is shipped in the markup (index.html:175) and killed by CSS (app.css:759).

---

## 3. Candidate rule from C's view

Anything on screen on every question (top bar, HUD, toasts, the notes button) takes its radius, font sizes, weights and surfaces from `:root` tokens; a skin may recolour its own box only, and STYLE.md must list each exception with the value that ships.
