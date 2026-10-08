# NAV MOBILE (D75) — NOTES.md

Pipeline: brain directive 13 (`_files/NOTES-PIPELINE.md`). One stage or ONE loop round per session. Append only.

## 0. Goals (Tony)
- One nav pattern for the quiz page that works on phone AND desktop.
- She always sees ONE clear next step (Check, then Next). Nothing important below the fold.
- Phone and desktop feel like the same app (same buttons, words, places).
- Bench goal (raised after R1): **best variant median ≥ 85 AND unity ≥ 15/20 from every tester.**
- Cap: R2 + 2 more rounds (R3, R4). Then report to Tony, whatever the score.

## 0.1 Converted from handoff (`_drift/2026-10-07T1005-main-handoff-genui-swarm-stop.md`, brain)
- Code: branch `ccr-81108955-ufvhze-navmock` @42c3c19 (no PR yet). Page `try/nav-mobile.html?v=1..7`.
- Design doc: `design/plans/NAV-MOBILE.md` on that branch. §7 = round 2 changes, checks, SHAME CHECK.
- R1 medians: v4 85 · v3 83.5 · v5 81.5 · v2 79.5 · v7 78.5 · v1 74.5 · v6 74. Reports: brain `_files/blind-judge/nav-r1/`.
- R2 slots renumbered: v1 = v4 phone + v3 desktop hybrid. v6 = v4 + v5 hybrid (result panel above the thumb button).
- Designer favourite v4 (One thumb button, same bar on desktop). Runner-up v6.
- R2 testers were killed before scoring in the old session → R2 reruns from scratch here.
- Method: brain `topics/blind-judge-method.md` "Variant 2". Brief: brain `_files/blind-judge/NAV-TESTER-BRIEF.md`.
  Score 0-100 = clarity 30 + clutter 25 + frustration 25 + unity 20. Fresh testers every round.
- Harness: worktree of `-navmock`, `python3 -m http.server 8880`, brain `_files/blind-judge/drive.mjs`: phone 8921–8924, desktop 8931–8934.
- Pass → open PR for `-navmock` (Tony merges). Fail → designer revises from TOP FIXES, next session runs the next round.

## Stage map
| # | stage | status |
|---|---|---|
| 1–5 | research → direction → review → plan → plan review | ✔ done before this file existed (NAV-MOBILE.md §1–6) |
| 6 | implement | ✔ v1..v7 mockups on `-navmock` (R2 build @42c3c19) |
| loop | blind bench rounds | R1 ✔ · **R2 = this session** · R3, R4 max |
| 7 | review | after the loop passes |

## Tony picks (Oct 7 ~10:20 PT) — LOCKED, reviewers do not re-argue
- **Bar = main's current bar** (`nav.js` / `nav.css` qnav: question list, shuffle, code box, redo, Prev/Next; icon-only on phones, `aria-label`s) **moved to the bottom.**
- **REJECTED:** R2's "every bar button has a word" bar (icon over caption: Questions · Notes · Back · Skip). Tony: "i do not like the one with the text … i like the main-branch current one more".
- Counterpoint kept on file, not acted on: R1 testers flagged unlabeled bar icons as friction (nav1-j1: "? card icon and pencil icon have no labels").
- Effect on R2: bar-caption praise or complaints in R2 reports do not count toward the next design. Check / Next placement findings still count.
- **Bottom = phones only** (Tony, Oct 7 ~10:2x PT: "phone only"). Desktop keeps main's bar where it is now (top row).

## R2 results (Oct 7, scribe)

Sources: brain `_files/blind-judge/nav-r2/nav2-j1..4.md` (R2), `nav-r1/nav1-j1..4.md` (R1), `-navmock` `design/plans/NAV-MOBILE.md` §7 (designer claims).
Cites: `j2:57` = nav2-j2.md line 57. `r1-j4:131` = nav1-j4.md line 131. `shot j4-phone/028` = `j4-phone/028-grid.png` under the R2 session scratchpad `/tmp/claude-0/-home-user-stem-stuff/f87cc4b2-f964-53e6-b51c-364b3649797e/scratchpad/dev/` (temporary, not in brain).

### R2.1 Scores (total /100, unity /20)

| v | name | j1 | j2 | j3 | j4 | median | unity j1/j2/j3/j4 | min unity | goal |
|---|---|---|---|---|---|---|---|---|---|
| v1 | Thumb button, card on desktop | 72 | 77 | 76 | 76 | 76 | 9/11/9/9 | 9 | no |
| v2 | Next shelf | 82 | 86 | 72 | 87 | 84 | 14/18/13/17 | 13 | no |
| v3 | Check and Next in the card | 76 | 83 | 70 | 77† | 76.5 | 14/18/13/17 | 13 | no |
| v4 | One thumb button | 85 | 89 | 86 | 86† | 86 | 19/19/19/19 | 19 | **yes** |
| v5 | Result footer | 88 | 90 | 83 | 89 | **88.5** | 19/19/18/19 | 18 | **yes** |
| v6 | Thumb button + result panel | 87 | 92 | 87 | 90 | **88.5** | 20/20/19/19 | 19 | **yes** |
| v7 | Floating Next | 76 | 78 | 71 | 80 | 77 | 15/14/13/17 | 13 | no |

† Parser miss. `med.py` skipped these 2 cells. Filled by hand from j4:42 (77 = 23/20/17/17) and j4:51 (86 = 25/20/22/19).
- Cause: j4 wrote bare sub-scores. The helper deletes "/ 20" and "/ 25" as if they were maximums, finds 4 numbers, and skips the line. Helper output was v3 76.0 (true 76.5) and v4 86.0 from 3 testers (true 86 from 4).
- The same bug skips 3 R1 cells (r1-j1 v1 75, r1-j1 v6 76, r1-j4 v3 85). The R1 medians in §0.1 are correct (checked by hand).
- Checked by hand: every other cell matches its SCORE line, and every R2 total equals the sum of its 4 sub-scores.
- Helper fix (not applied; the scribe edits NOTES only): accept a parse only when the 4 sub-scores add up to the total.
- Rankings: v6 is #1 for j2, j3, j4 and #2 for j1 (j1:120, j2:117, j3:126, j4:100). v6 beat v4 with every tester.

### R2.2 Verdict vs the goal

**PASS as tested. 3 variants meet the goal: v5 (88.5, min unity 18), v6 (88.5, min unity 19), v4 (86, min unity 19).** v2 misses (median 84; unity 14 from j1, 13 from j3). v1, v3, v7 miss on both parts.
- Tony's lock applies: no PR for `-navmock` now. The bar swap comes first, then a confirm round (R3).
- **The unity part of this pass does not transfer.** v4, v5 and v6 also put the bar at the bottom on desktop (v4 j1:63 j2:64 j3:67 j4:50 · v5 j1:79 j3:84, shot j4-desk/014 · v6 j1:95 j2:94 j3:101 j4:78). Under the lock, desktop keeps main's top bar.
- Every R2 variant with a top bar on desktop got min unity 13 or less (v1 9, v2 13, v3 13, v7 13). So R3 can fail on unity even if its medians stay at 85+.

R1 → R2 medians. "Phone parts" = clarity + clutter + frustration (max 80).

| v | R1 | R2 | change | phone parts R1→R2 | unity R1→R2 | reason |
|---|---|---|---|---|---|---|
| v1 | 74.5 | 76 | +1.5 | – | – | new design in this slot (R1 "Dock swap"). Do not compare. |
| v2 | 79.5 | 84 | +4.5 | 64→68 | 15.5→15.5 | clutter 16/16/18/17 → 22/21/21/22. Testers credit "Skip hides once I pick" (j2:35, j4:29) and the tiny, tidy bar (j1:34, j3:36: captioned bar, discounted). [fixed by review 1: no clutter line credits the labeled Check] |
| v3 | 83.5 | 76.5 | −7 | 67.5→61 | 15.5→15.5 | the new sticky Check moves and covers answers |
| v4 | 85 | 86 | +1 | 73→67 | 11.5→19 | phone fell (Skip slot); unity rose (desktop bottom bar) |
| v5 | 81.5 | 88.5 | +7 | 69.5→69.5 | 12→19 | all from unity (desktop bottom bar + same footer) |
| v6 | 74 | 88.5 | +14.5 | – | – | new design in this slot (R1 "Segmented bar"). Do not compare. |
| v7 | 78.5 | 77 | −1.5 | 62→62 | 15.5→14.5 | flat |

Leniency check. Testers are new each round, so R1 j2 and R2 j2 are different people.

| tester | R1 mean of 7 | R2 mean of 7 |
|---|---|---|
| j1 | 79.3 | 80.9 |
| j2 | 69.3 | 85.0 |
| j3 | 79.9 | 77.9 |
| j4 | 81.3 | 83.6 |
| all | 77.4 | 81.8 |

- R1 had one harsh tester (j2, about 11 below the rest). R2 has none. R2 j2 is the most lenient (about 4 above the rest). This lifts R2 a little.
- The rise is not general. v5 and v7 kept their R1 phone layout. §7 lists only fixes for them (a labeled Check, one forward control; v7's bar no longer hides), and their phone parts still did not move (69.5, 62). [fixed by review 2: the old line said "only small phone changes"; these were fixes for R1's top phone complaints, so v5 and v7 are not clean leniency controls] On v2–v5 and v7 together, mean phone parts went 66.1 → 65.0. Unity on the top-bar variants (v2, v3, v7) went 15.5 → 15.3.
- Most of the rise is in unity where desktop got the bottom bar (v4, v5), plus the new v6. v2 also rose (+4.5), from phone clutter (phone parts 64 → 68). [fixed by review 1: the old line said "only" and left out v2's rise]
- Without R2 j2, the v4 / v5 / v6 medians are 86 / 88 / 87. The pass does not depend on the most lenient tester.
- On v4, R2 was stricter than R1: clarity 29/28/28/27 → 24/26/24/25, all for the Skip slot.

### R2.3 Findings that transfer (under Tony's locks)

**Check / Next placement**
- One fixed spot for Check and Next wins. v4 and v6: "my thumb never moves" (j1:67, j2:68, j3:71, j4:82). v6 has the best frustration scores (23/24/23/24).
- The result line right above the button is the best moment (j1:75, j2:76, j3:79, j3:96, j4:62, j4:76). v4 loses here: its feedback sits in the page, away from the button (j3:70; fix j3:138).
- A button that moves loses most. v3's button sat at y = 466 / 605 / 687 / 747 (j1:51, j2:53, j3:48, j4:45). It also covered answers or Ask Cluck (j1:40, j2:43, j3:44, j4:35).
- v7's floating pill covers content (j1:107, j2:106, j3:113, j4:90).
- The in-row Check splits testers. Two like it: "right under my finger" (j1:24, j4:21). Two do not: "huh, there?", "tucked in" (j2:26, j3:25). It moves with the re-picked row (j2:28, j3:27, j4:23). All 4 ask for Check and Next in one place (j1:132, j2:127, j3:136, j4:110).

**One forward control**
- R2's rule worked. The bar's Skip hid while a pick waited and while Next showed (NAV-MOBILE §7). No tester reported two forward controls at once ("Skip hides once I pick": j2:35, j4:29).
- Main's bar has its own › (Prev / Next, `nav.js`). The same rule must cover it. If not, R1's "second next" comes back (r1-j3:50, r1-j4:36).

**"Skip in the thumb spot"**
- All 4 testers flagged Skip in the Check/Next slot of v1, v4 and v6 (j1:7/55/87, j2:8/57/87, j3:7/58/92, j4:6/49/72). It is worst right after a wrong pick: "tempts me to bail" (j4:8), "a tired me could tap it" (j2:10).
- R1 already flagged it (r1-j2:58, r1-j4:55; fix r1-j4:131). §7 says the R2 Skip is "quiet: no fill, --muted". At load that is true: no fill, and the same grey as the bar captions (shot j4-phone/028, pixel check). But it is a bold word, bigger than the captions, alone in the slot. After a tap in the slot (a wrong Check, or Next), it shows in a filled dark pill with near-white text (shots j4-phone/030, j4-phone/051, j2-phone/003). This is likely hover or focus left under the thumb; iOS keeps hover after a tap too. All 4 testers flagged it at load, where it was quiet. So a quieter style is not enough: the slot must not say Skip. [fixed by review 1: the quiet style did land at load; it failed only after a tap in the slot]
- A small icon Skip was fine (j1:25, j2:25, j4:20; shot j4-phone/010).
- Asked fix: a disabled "Check" in that slot before a pick and after a wrong pick (j1:131, j3:138, j4:112, j4:114). Or Skip as a small link elsewhere (j2:129).
- With main's bar at the bottom, main's › sits in the bottom-right thumb spot. R2 testers accepted a small Skip icon, but that icon had a "Skip" caption (j1:25, j2:25, j4:20; shot j4-phone/010). Main's › has no caption. R1 asked of a bare ›: "does > skip?" (r1-j4:7). [fixed by review 1: the accepted icon had a caption] The action button must not share that spot or stack right on it.

**Wrong-pick flow**
- "Pick again. 1 more try." is clear (j1:9, j2:10, j3:60, j4:8). Keep it.
- The page "jumped" after a wrong Check where the hint sits in the page (j1:9/25/41/57/105, j3:9/26). No jump was reported for v5 or v6, where the hint docks at the bottom (j1:73, j1:89).
- v6: Ask Cluck sits right above Check in the thumb column, so a near-miss is easy (j1:90, j2:89, j3:94, j3:95; shot j4-phone/048).
- v5: "Skip for now" is as loud as Ask Cluck and sits where Next comes later (j2:74, j3:77, j4:60, j4:67). Asked fix: a quiet text link (j1:132, j3:139, j4:113). j2 asks instead to keep the Next spot free: Check there, or nothing (j2:130). [fixed by review 1: j2:130 asks a different fix; the quiet-link ask is j1:132] One tester liked the wording (j1:73).
- v5: the wrong footer hid the bar, so Questions and Notes vanished (j3:77).

**Unity (desktop keeps main's top bar)**
- R2 has a near-clean test. After Check, v1 and v2 had the same desktop: top bar, full-width sticky "Next question", "Right." hidden (shots j4-desk/003, j4-desk/006). Their desktop Check differed: v1 a full-width sticky bar (shot j4-desk/002, j1:15), v2 in the row (shot j4-desk/005, j1:31). v2's phone matched its desktop for both Check and Next: unity 14/18/13/17. v1's phone matched for neither (a corner button, and "Next", not "Next question"): 9/11/9/9. So the same place, shape and word for both controls is worth 4–8 points per tester. v1's header name ("card on desktop", shot j4-desk/003) also told testers to expect a different desktop. [fixed by review 1: the two desktops were not the same at the Check step]
- Hidden feedback on desktop also costs unity (j1:15, j2:17, j3:16, j4:12, j4:31).
- The nav flip: j1 and j3 docked it by name (j1:36/52/116, j3:38/55/123). j2 and j4 mostly did not (j2:37 gave 18; j4:31 blamed the hidden feedback).
- So with a top bar on desktop, the best R2 result is min unity 13. To get 15 from every tester, the action area must match exactly: same button, same word, same place next to the content, feedback always in view.

**Minor (content, not nav):** 3 of 4 call the "QUACK" line extra reading (j1:13, j2:15, j3:14). j4 wants it kept (j4:113).

### R2.4 Findings that do not transfer (discounted)
- Praise for a light, calm, tidy bar (j1:18, j1:23, j1:34, j1:66, j3:36). Discounted: that was the captioned bar, which Tony rejected.
- No R2 tester complained about unlabeled bar icons, because the R2 bar had captions (shot j4-phone/010). With main's icon-only bar, R1's "no labels" friction can come back (r1-j1:131, r1-j3:50, r1-j4:7). On file; not re-argued.
- The look of the "Skip ›" pill in v1/v4/v6 ("dark pill", j2:8). Discounted. The slot problem still counts (R2.3).
- The desktop bottom bar in v4, v5, v6 and its unity of 18–20 (R2.2). Discounted: desktop keeps main's top bar.
- v5 hides the bar during the result; j2 liked that for clutter (j2:82). Hiding main's bar is a bar change. Tony call; not assumed.

### R2.5 Designer's next move for R3 (proposal only, no code)

Do v4 and v6 still make sense on main's bar?
- **v4: no, as built.** Its idea is the Skip → Check → Next morph in the bar's right slot. On main's bar, that slot is the icon-only ›. Words there break "icon-only". On desktop, the slot is in the top row, far from the answers. R1's "Dock swap" did that and got unity 10–13 (r1-j2:21). Also, v6 beat v4 with all 4 testers. Drop v4; its one-spot idea lives on in v6.
- **v6: yes, if the button leaves the bar.** Put one action button in the result panel: just above main's bar on phones, at the bottom of the content column on desktop.

Carry 3. Rebuild all on main's bar (bottom on phones, top row on desktop):
1. **v6:** result panel + corner action button. R2 #1 for 3 of 4 testers.
2. **v5:** result footer + full-width action button. Top 3 for all 4 testers. The same as v6 except the button shape, so R3 tests corner vs full width (NAV-MOBILE §5, iOS item 5).
3. **v2 (optional):** full-width shelf, result line in the page. Best R2 score with a top-bar desktop (84).
- Drop v1, v3, v4, v7.

Top fixes for every carried variant:
1. One action spot for Check and Next. Same place, shape and word on phone and desktop. Check leaves the answer row.
2. That spot never says Skip. Before a pick and after a wrong pick, it shows a disabled "Check". The only Skip is main's small ›.
3. The result line sits right above the action button. On desktop, nothing sticky covers it.
4. One forward control. Main's › hides (or does nothing) while a pick waits for Check and while Next shows. Keep a clear gap between the action button and main's ›.
5. Ask Cluck and "Skip for now" go to the left or become quiet links. Never in the thumb column. Never in the Next spot.

Open, for Tony or the coordinator:
- May main's › hide while Check or Next shows (fix 4)? If not, main's › and the new Next must do the same thing.
- R3 testers will see the bar move (bottom on phone, top on desktop) by design. Either the R3 brief says so and unity is judged on the action area, or we accept a unity cost of about 1–6 points per tester (v2 vs v4/v6 in R2).
- At rest, main's bar does not have more buttons than the mock bar. With a bank open it shows List, Prev and Next (plus the XP strip on desktop). Shuffle and Redo show only while the list is open, and on desktop the code box too (main nav.css:45–53, "C2 / C15"). On phones with a bank open, the code box is hidden at rest, with no strip (main app.css:146–147, "C8"). It rises at the bottom only while the list is open (app.js:1665–1666) or on a load error. [fixed by review 2: the strip shows only when no bank is open, and then main's nav is hidden (app.css:153–165, nav.js:112)] The R3 clutter risks are elsewhere: the List button shows the bank code as a word, on phones too (main nav.js:103, nav.css:12–13; R1 called "BANK_P2X" jargon: r1-j1:131, r1-j2:21). And main's "Open notes" button floats at the bottom right on phones by default (main app.css:826–833, app.js:2091). She can drag it to either side (app.js:2064–2066). [fixed by review 2: it is draggable; app.js:1893 does not place it] [fixed by review 1: Shuffle, Redo and the desktop code box are hidden at rest]

## R2 adversarial review 1/5

Read: this file, nav2-j1..4, nav1-j1..4, NAV-TESTER-BRIEF, method "Variant 2", NAV-MOBILE §2/§3/§7, the shot logs (`dev/j*/log.json`), 16 shots, and main's `nav.js`, `nav.css`, `index.html`, `app.css`, `app.js` (`origin/main`). No code written. No lock re-argued.

### Findings, by severity

**High**

1. **The R3 plan breaks its own rule.** R2.3 says the action button "must not share that spot or stack right on it" (main's ›). R2.5 puts v6's corner action button in a panel "just above main's bar on phones", so it sits right on top of main's ›. Testers flagged the same stack with Ask Cluck over Check (j1:90, j2:89, j3:94, j3:95; shot j4-phone/048). On main, the "Open notes" button is also fixed at the bottom right on phones (main app.css:826–832, app.js:1893). That corner could hold 3 controls. A corner button works only if main's › hides while the button shows. Tony has not answered that yet (R2.5 open question 1).
   - Ask Tony before the R3 build. If main's › must stay, drop the corner shape. [fixed by review 2: the full-width shape fails the same way. In R1, a full-width Next right above a live › drew "two Nexts stacked" from all 4 testers (r1-j1:29, r1-j2:28, r1-j3:25, r1-j4:27). So Tony's answer gates both shapes.]
2. **"PASS as tested" overstates R2.** Every R2 variant used the captioned bar, which Tony rejected. The 3 passing variants also had a bottom bar on desktop, which the lock rules out (R2.2). The phone part only partly transfers too. In v4 and v6 the Check/Next button is the bar's right slot (§7), and main's icon-only bar has no such slot. v5 hides the bar during the result (j2:82), which is Tony's call. So no R2 variant can be built as tested. R3 tests a new layout. It is the confirm round Tony asked for (R2.2), but it is a real test that can fail. [fixed by review 2: "not a confirm" went against Tony's lock wording]
   - The method says "any eval >85 → raise the goal" (blind-judge-method.md:56). R2 has 12 evals above 85. This file does not say if the goal rises for R3.
   - Suggested headline (scribe's call): "Score goal met on paper. Not a loop pass: no variant that met the goal fits Tony's locks." [fixed by review 2: v2, v3 and v7 fit the locks, apart from the captions. They failed the goal.]
3. **The unity risk uses R2 data only.** R2.2 and R2.3 say every top-bar desktop got min unity 13 or less. That is true for R2. But in R1, two top-bar desktops got unity ≥ 15 from every tester: v3 17/15/15/16 and v7 16/15/15/17 (r1-j1:48/108, r1-j2:51/119, r1-j3:48/116, r1-j4:48/112). Their action sat in the same place next to the content (r1-j2:55, r1-j4:52, r1-j1:112, r1-j2:123). So the unity part can be met with a top bar. [fixed by review 2: R1 v3 and v7 met only the unity part; their medians were 83.5 and 78.5. No variant with a top-bar desktop has met both parts, in R1 or R2.] In R2, v2, v3 and v7 each failed because j3 gave 13 to all three and one other tester gave 14. j3 is R2's strictest tester (mean 77.9; the other 3 average 83.1). On v1–v3 the desktop also hid the result for some testers (j3:33, j4:26, j4:41).

**Medium**

4. **Order, names and mock controls bias the close calls.** All 4 testers walked v1→v7 (`dev/j*-phone/log.json`; j1 also opened v4 once before v1). Testers compared each variant with earlier ones (j1:63, j3:67, j4:50: the first desktop click missed because the layout differed from v1's; j2:73: "same 'huh, there?' as v2"). v6, the v4 + v5 hybrid, always came after both of its parents (right after v5, two after v4). [fixed by review 2: it was not right after v4] The header showed each name, e.g. "Mock · 1 · Thumb button, card on desktop" (shots j4-desk/003, j4-phone/028). The page also showed a variant switcher and state buttons ("Mockup controls", shot j4-phone/051). v7 lost clutter points for covering them (j1:107, j3:113).
   - Effect: these calls are not safe: v6 vs v4 (1–4 points per tester), the v5 = v6 tie, and v1's unity. The 4-of-4 findings still stand (Skip slot, moving button, result line above the button).
   - Cheap R3 fixes: counterbalance the order (j1 and j3 see A then B; j2 and j4 see B then A). Hide the header and the Mockup controls in the test URL. Use neutral letters.
5. **4 same-family testers and a min rule.** Unity must be ≥ 15 from every tester, so one tester decides. Scores for one variant spread up to 15 points (v2: 72 at j3:34, 87 at j4:27). The testers and the designer are the same model family. They agree in words, not only in scores ("thumb never moves": j1:67, j2:68, j3:71). Count a 4-of-4 result as fewer than 4 independent votes.
   - Cheap R3 fixes: on the finalist, add one human walk (Tony, 10 min, his phone) or one tester from another model. Add the wrong pick to the desktop look. The brief asks only "answer one question right, take one shot" (NAV-TESTER-BRIEF:13), but unity decides pass or fail. If a deciding cell is within 2 points of the bar, add 2 fresh testers for that variant.
6. **"Carry 3" is not the simplest R3.** The R3 top fixes say: Check leaves the row, the result line sits right above one action button, and both screens match. With these fixes, v5 and v6 become one design that differs only in button shape. v2 with fixes 1 and 3 is v5. As written, v2 keeps "result line in the page", which breaks top fix 3 ("for every carried variant").
   - Smallest R3 that answers the open question (unity with a top-bar desktop): A = a result panel with one full-width action button (Check, then Next). On phones it sits above main's bar. On desktop it is pinned to the window bottom, and main's bar stays in the top row. Add B = the corner button only if Tony lets main's › hide. Use 4 testers and counterbalance. R4 stays free for one fix round.
   - For desktop, write "pinned". "At the bottom of the content column" (R2.5) can be read as in the page flow. In R1, v4's in-flow desktop Check fell below the fold and got unity 11/5/12/13 (r1-j2:72, r1-j4:68). The pinned panel in R2 v5/v6 kept the result in view (shots j4-desk/016, j4-desk/019).
7. **Dropping v4 is right, but only for the structural reason.** v4's button is the bar's right slot (§7), and main's bar keeps an icon-only › there. "v6 beat v4 with all 4 testers" is weak evidence. The margins are 2/3/1/4 (j1:96 vs j1:64, j2:95 vs j2:65, j3:102 vs j3:68, j4:79 vs j4:51). v6 always came after v4. And 4 of 4 gives p ≈ 0.06 (one-sided sign test) even before any order effect.

**Low**

8. 7 fixes made in place (table below). None of them changes a score, a median or the verdict.
9. R2.4 says no tester flagged unlabeled icons "because the R2 bar had captions". That cause is not shown. Two testers called the captioned bar icons: "bar is just icons" (j1:23), "small icon-only Skip" (j3:24). But both named the buttons by their caption words (j1:23: "Questions, Notes, Back, Skip"), so they read the captions. This is not evidence for icon-only. [fixed by review 2: the old line said it gave "mild support to Tony's icon-only pick"] On file only.
10. Main's List button shows the bank code as a word (main nav.js:103, tests/bank.pw.mjs:76). R1 testers called "BANK_P2X" jargon (r1-j1:131, r1-j2:16, r1-j2:21, r1-j3:13). It is part of main's bar. Expect R3 testers to flag it.
11. When a button changes state under the thumb, it keeps its hover or focus look after the tap. Example: Skip shows in a filled pill after a wrong Check and after Next (shots j4-phone/030, j4-phone/051; fill (22,36,58) vs bar (8,17,31)). In R3, a disabled Check in the thumb spot must not look active after Next.
12. `med.py` strips "/30" as well as "/20" and "/25" (R2.1). This has no effect on R2.

### What review 1 changed (in place, each marked)

| where | was | now |
|---|---|---|
| R2.2 R1→R2 table, v2 reason | "one forward control + labeled Check" | the testers' own clutter reasons (j2:35, j4:29; j1:34, j3:36) |
| R2.2 leniency, "The rise is…" | "only" v4 and v5, plus the new v6 | adds v2's +4.5 from phone clutter |
| R2.3 Skip slot | "The fix did not land" | quiet at load (shot 028, pixels); filled pill after a tap (shots 030, 051, j2-phone/003) |
| R2.3 main's › | "a small icon, which testers accepted" | the accepted icon had a "Skip" caption; main's › has none (r1-j4:7) |
| R2.3 v5 "Skip for now" | quiet-link fix cited j2:130 | cites j1:132; j2:130 asks for a different fix |
| R2.3 unity "clean test" | "v1 and v2 had the same desktop" | same only after Check; the desktop Check differs (shots j4-desk/002, j4-desk/005) |
| R2.5 open, main's bar | "more buttons than the mock bar" | at rest: List, Prev, Next. Real risks: the bank-code word and "Open notes" at the bottom right |

### Checked and found sound
- All 28 R2 cells match their SCORE lines. Every total equals its 4 sub-scores. All 7 medians and min-unity values are right.
- The 2 helper misses (j4:42, j4:51) and their cause. The 3 R1 misses. The R1 medians in §0.1 (all 28 R1 cells summed by hand).
- R1→R2 table: every median, phone-part median and unity median. Leniency: all 10 means, "about 11 below", "about 4 above", 66.1 → 65.0, 15.5 → 15.3, and 86/88/87 without j2.
- Verdict arithmetic: v4, v5 and v6 meet both parts as tested. v2 misses on both counts (84; unity 14 and 13). v1, v3 and v7 miss on both parts.
- Rankings (j1:120, j2:117, j3:126, j4:100).
- Quotes: I checked over 40 R2 cites and all 8 R1 cites against the report lines. All match except j2:130 (fixed). There are only small paraphrases: "my thumb never moves" (j1:67 says "the thumb"; j4:82 says "never moved my thumb once"), and j3:26 says "scrolled", not "jumped".
- Shots: j4-desk/014 (v5 desktop bar at the bottom), j4-desk/003 and /006 (v1 = v2 after Check), j4-phone/010 (captioned bar), j4-phone/048 (Ask Cluck right above the slot), j4-phone/014 (Skip hidden while Next shows), j4-desk/019 (v6 desktop panel). All of them support the text.

### Open questions for Tony
1. Does "any eval >85 → raise the goal" fire again (R2 has 12 evals above 85)? Review 1 suggests no. Keep the R2 goal for R3, because R3 tests a new layout.
2. May main's › hide, or be disabled, while Check or Next shows? This decides whether a corner button is possible. [fixed by review 2: it decides the full-width shape too (R1 v2: r1-j1:29, r1-j2:28, r1-j3:25, r1-j4:27)] Please answer before the R3 build.
3. Unity under "bottom = phones only": should the R3 brief tell testers that the bar position differs by design, and ask them to judge the action area? Or keep the brief as it is? R1 v3 and v7 show that 15+ is possible with the brief as it is, but one strict tester can decide the result. [fixed by review 2: R1 tested only the brief as it is, so it says nothing about a changed brief]
4. On phones, main's "Open notes" button sits at the bottom right. When main's bar moves to the bottom, where does Notes go?

## R2 adversarial review 2/5

Read: this file; nav2-j1..4; nav1-j1..4; NAV-TESTER-BRIEF; the method (blind-judge-method.md:55–57); NAV-MOBILE §1, §2, §3, §7; the shot logs; 16 shots, plus a pixel scan of the thumb slot in every v1, v4 and v6 phone shot; `med.py`; `drive.mjs`; the mock's `try/nav-mobile.css` (`-navmock` @42c3c19); main's `nav.js`, `nav.css`, `index.html`, `app.css`, `app.js`, `tests/bank.pw.mjs`, `design/NAV.md`; PR #92 (state and diff only). Main's bar files are the same on the newest main (a9d4919) as on 90da31b, which review 1 read, so all line cites hold. No code written. No lock re-argued.

### Findings, by severity

**High**

1. **No variant that fits Tony's locks has met the goal yet, in R1 or R2.**
   - R2: v2, v3 and v7 have the action outside the bar and a top bar on desktop. They fit the locks, apart from the captions. All 3 failed. The best is v2: median 84, min unity 13 (R2.1).
   - R1: every desktop had a top bar. No variant met both parts. v4 had median 85 but min unity 5 (r1-j2:68). v3 had min unity 15 but median 83.5 (r1-j1:48, r1-j2:51, r1-j3:48, r1-j4:48).
   - 10 of R2's 12 evals above 85 are on v4, v5 and v6. The lock rules out their desktop bottom bar. Only 2 are on a variant that fits (v2: j2:33, j4:27).
   - R1 is the closest test of the locked bar. On phones its bar was icon-only, at the bottom (r1-j1:4, r1-j3:4). On desktop it was a top bar with the bank code (r1-j1:17, r1-j3:13). It differs from main in 3 ways: Notes was a bar button, phones hid the bank code, and the desktop bar was sticky (NAV-MOBILE §2). Use R1 as well as R2 to predict R3.
   - Fixed in place: review 1 #3 ("the goal can be met with a top bar") and review 1's headline ("no tested variant fits").
2. **The "raise the goal" rule, read literally, now turns every pass into one more round.**
   - The method says: "Pass = median ≥75; any eval >85 → raise the goal" (blind-judge-method.md:56). R1 used it once. The goal went to "median ≥85 AND unity ≥15/20 from every tester" (:57).
   - R2 has 12 evals above 85 (j1 2, j2 4, j3 2, j4 4). So, read literally, the rule fires again.
   - But its trigger (85) now equals the pass bar (85). A pass needs a median of 85 or more. Unless the top 3 scores are all exactly 85, that needs a score above 85. So every pass fires the rule again, until the cap (R4). The method gives no second goal level.
   - Proposal for Tony: keep the R2 goal for R3, unchanged, and retire the raise rule for this bench. Tony already calls R3 a confirm round (R2.2), and a confirm round re-tests the same goal. Also, 10 of the 12 evals above 85 come from layouts the lock rules out, and no layout that fits the locks has met the goal yet (finding 1).
   - Other option: keep the rule, but set its trigger above the goal (example: raise only if the R3 winner's median is 90 or more).
3. **Tony's answer on main's › gates both R3 shapes, not only the corner.**
   - Review 1 said: if main's › must stay, drop the corner shape. That leaves the full-width shape as safe. R1 says it is not. A full-width Next right above a live › drew "two Nexts stacked" from all 4 R1 testers (r1-j1:29, r1-j2:28, r1-j3:25, r1-j4:27). Fixed in place (review 1 #1 and its open question 2).
   - "Main's › and the new Next must do the same thing" (R2.5, open 1) does not fix this. Testers flagged the pair itself: "which one?" (r1-j3:25).
   - On main today, › is live when a next question exists (nav.js:116–117). A pick, a Check, a right or a wrong answer does not change it. The lock-in rule hides the code box, not the nav (app.css:275).
   - R2.5 top fix 4 says › "hides (or does nothing)". A button that looks live but does nothing is a dead tap. Hide it, or use main's disabled look (nav.css:9).

**Medium**

4. **Main's bar on phones, checked against the code.**

| item | what main does |
|---|---|
| place | top bar in the header, in the page flow. It scrolls away, on desktop too (app.css:53; nav.css:19–20; design/NAV.md:91) |
| at rest, a bank open | List (icon + the bank code as a word), ‹ "Go back one", › "Next question". ‹ › sit at the right edge (index.html:157–172; nav.js:103, 110; nav.css:16–17) |
| list open | Shuffle and Redo show; Redo is icon-only on phones (nav.css:50, 53–55). The code bar rises at the bottom (app.js:1665–1666) |
| › | live when a next question exists (nav.js:116–117). It opens the next code in the list order (nav.js:195–206) |
| after a right answer | the page scrolls to the top after 900 ms, so the top bar's › comes into view (app.js:955–963) |
| code box | a fixed bottom bar (app.css:139–143). With a bank open it is hidden at rest, with no strip (app.css:146–147, "C8"). The strip shows only with no bank, and then the nav is hidden (app.css:153–165; nav.js:112) |
| "Open notes" | under 720 px, with a question open: fixed, 56 px tall, z-index 40, bottom right by default (app.css:826–833; app.js:2091). She can drag it; it snaps to a side and keeps its height (app.js:2064–2066). Its lowest place comes from the code box height, which is 0 with a bank open (app.js:1634–1640, 2081–2085) |

   - Fixed in place: R2.5 said "On phones the code box is its own bottom strip". Not with a bank open.
   - "Tony picks" says main's bar is "icon-only on phones". Not quite. On phones the List button shows the bank code as a word. Main's own phone test checks this at 390 px (tests/bank.pw.mjs:54, 76). In a Redo round, Redo shows "Exit redo" (nav.css:54–55). Lock text not edited. See question 3.
   - Main's desktop bar is not sticky (app.css:53). The R2 mock made it sticky (NAV-MOBILE §2). The R3 build must say which.
5. **Main's bar at the bottom on phones: what collides.**
   - "Open notes": yes, always. By default it sits at the bottom right, over ‹ › and over any panel button above them. Its lowest place ignores the nav (app.js:2083).
   - Code box: not at rest (hidden with a bank open). Yes while the list is open, and on a load error. It rises at the bottom, fixed at bottom 0 (app.css:139–143), where the bar will be. Also, the list card drops down from the top bar today (nav.css:21).
   - Two main rules expect a top bar. With focus in the scratchpad, the nav slides up out of view (app.css:680–684). After a right answer, the page scrolls to the top for the top bar's › (app.js:961–962).
   - The R3 walk does not open the list. So R3 testers will meet only the "Open notes" collision. The others matter for the build.
6. **All 4 R2 testers asked to move the desktop bar to the bottom.** There are 8 asks, for v1, v2 and v7 (j1:128, j1:129, j1:134, j2:126, j2:132, j3:135, j3:141, j4:109). The lock rules this out (not re-argued). R2.3 says j2 and j4 "mostly did not" lower unity for the flip. Their scores did not, but their fixes ask for it. Expect R3 testers to ask again.
   - R2 testers used v4 as the model: "become v4" (j1:128, j4:109), "use the v4/v6 desktop layout" (j3:135). So R3 must not show a bottom-bar desktop, not even an R2 variant as a control.
7. **The filled Skip is the mock's own hover style.** Review 1 said "likely hover or focus". It is hover. `.nx.quiet:hover` (`-navmock` try/nav-mobile.css:47) sets the fill to `--sheet` #16243a = (22,36,58) and the text to `--ink` (231,237,246). These are the measured pixels (shots j4-phone/030, j4-phone/051, j2-phone/003). Phone taps are touch taps (drive.mjs:29), and the hover look stays after the tap. Main's `.btn:hover` has no guard either (app.css:183), so main's › will also keep a hover look after a tap. In R3, put hover looks under `@media (hover: hover)`.

**Low**

8. Review 1 #9 overreached. j1:23 and j3:24 name the buttons by their caption words, so they read the captions. That is not evidence for icon-only. Fixed in place.
9. Review 1 called R3 "not a confirm". Tony's lock calls it the confirm round (R2.2). Fixed in place.
10. R2.2 leniency: v5 and v7 are not clean controls. §7 lists real phone fixes for both. Their phone parts still stayed flat (69.5, 62), so R1's top phone complaints were fixed with no phone gain. The 66.1 → 65.0 point holds. Fixed in place.
11. PR #92 was open, not merged, at review time (it has merged since). It removes Shuffle and Redo from main's bar and makes › play the hidden queue. The mock assumed that world (NAV-MOBILE.md:6). The bar at rest is the same either way (List, ‹, ›). The R3 build must say which main it uses.
12. Review 1 #4: v6 came right after v5, and 2 after v4, not "right after both". Review 1 open question 3: R1 tested only the brief as it is. Both fixed in place.

### Review 1's 3 High findings: verdict
- #1 (3 controls in one corner): sound. Too narrow: › gates the full-width shape too (finding 3).
- #2 ("PASS as tested" overstates R2): sound. Two wording errors fixed: "not a confirm", "no tested variant fits".
- #3 (R1 shows unity ≥ 15 with a top bar): sound for unity. "The goal can be met" overreached (finding 1).

### What review 2 changed (in place, each marked)

| where | was | now |
|---|---|---|
| R2.2 leniency | "v5 and v7 had only small phone changes" | they kept their R1 layout; §7 lists real phone fixes; phone parts still flat |
| R2.5 open, main's bar | "the code box is its own bottom strip"; "Open notes" "fixed at the bottom right" (app.js:1893) | bank open: no strip, the code bar rises with the list. "Open notes": bottom right by default, draggable |
| review 1 #1 and open question 2 | › decides the corner shape | › decides both shapes (R1 v2) |
| review 1 #2 | "not a confirm"; "no tested variant fits Tony's locks" | Tony's confirm round, still a real test; "no variant that met the goal fits" |
| review 1 #3 | "the goal can be met with a top bar" | only the unity part |
| review 1 #4 | "right after both of its parents" | right after v5, 2 after v4 |
| review 1 #9 | "mild support to Tony's icon-only pick" | they read the captions; not evidence |
| review 1 open question 3 | "15+ is possible either way" | with the brief as it is |

Reverted: none. Review 1's 7 in-place fixes hold. I corrected one part of its fix 7 (the phone code box).

### Checked and found sound
- All 28 R2 cells and all 28 R1 cells: totals, medians, min unity, and sub-score sums (my own parser). The R1 → R2 table, the leniency means, 66.1 → 65.0, 15.5 → 15.3 (the mean of all 12 unity scores is 15.25), and 86 / 88 / 87 without j2.
- The `med.py` misses and their cause. It also strips "/30" (med.py:11), as review 1 said.
- Review 1's 7 in-place fixes and its shot cites: j4-phone/010, /014, /028, /030, /048, /050, /051; j2-phone/001, /003; j4-desk/002, /003, /005, /006, /014, /016, /019. Pixels: at load, Skip has the caption grey (162,179,203) on the bar colour (8,17,31); after a tap in the slot, the fill is (22,36,58).
- Review 1's numbers: 12 evals above 85; margins 2/3/1/4; p = 0.0625; j3 mean 77.9 vs 83.1; a 15-point spread on v2. Its R1 cites.

### Smallest R3 (proposal for Tony and the coordinator)
- One variant, A: a result panel with one full-width action button. It shows a disabled Check, then Check, then Next. The result line sits in the panel, right above the button. Phones: the panel is pinned just above main's bar. Desktop: the panel is pinned at the window bottom, as wide as the column, and main's bar stays in the top row. Main's › hides, or shows disabled, while Check waits and while Next shows (question 2). Ask Cluck goes to the left. "Open notes" moves away from the bar's right end (question 4).
- Add B (the corner button) only if Tony wants the shape tested. It costs one more variant, and it gives a fallback if A fails. But the bottom-right corner already holds ‹ › and "Open notes".
- Nothing else is new. No Skip in the action spot. No v1, v3, v4 or v7. No R2 variant as a control (finding 6).
- Bench: 4 fresh testers. Hide the header names and the Mockup controls. Add one wrong pick to the desktop look. With 2 variants, counterbalance the order. R4 stays free for one fix round.

### Open questions for Tony
1. Goal for R3: keep "median ≥ 85 AND unity ≥ 15/20 from every tester", and retire the raise rule for this bench? Proposed (finding 2).
2. Main's ›: may it hide, or show disabled, while Check waits and while Next shows? If not, neither R3 shape works above the bar (finding 3).
3. "Icon-only on phones": hide the bank-code word on the List button on phones (R1's mock did), or keep main as it is?
4. Notes on phones: where does "Open notes" go when the bar is at the bottom? (review 1, question 4)
5. Brief: keep NAV-TESTER-BRIEF as it is for R3? Proposed. R1 shows that unity ≥ 15 is possible with a top-bar desktop and the brief as it is. A changed brief breaks the comparison with R1 and R2. (review 1, question 3)

## R2 adversarial review 3/5 (parallel; lens: student + method)

Read: NOTES.md (as of review 1), nav2-j1..4, nav1-j1..4, NAV-TESTER-BRIEF, BRIEF-HEADER §1 (psych primer), method "Variant 2", NAV-MOBILE §2/§3/§6/§7, `drive.mjs`, the 8 shot logs (`dev/j*/log.json`), about 20 shots plus pixel diffs, the designer's ios-sim shot of v6 wrong, and main's `nav.js`, `nav.css`, `index.html`, `app.css` (`origin/main` @a9d4919). No code written. No lock re-argued. Cites as in NOTES (`j2:57`, `r1-j4:131`, `shot j4-phone/028`).

### Findings, by severity

**High**

1. **After a wrong pick, the R3 plan leaves a live, filled, unlabeled skip in her thumb spot.**
   - R2.5 fix 4 hides main's › only "while a pick waits for Check and while Next shows". In the retry (after a wrong pick, before the re-pick) neither is true. So › stays live. Main disables it only at the end of the list (main nav.js:117).
   - Main's › rests as a filled tile. `.btn` is "fill-first" with `--sheet` #16243a (main app.css:4, :175–181). That is the exact fill of R2's "dark pill" Skip after a tap: (22,36,58) (shot j4-phone/003; j2:59 "Skip pill comes back"). Testers called that pill a bail risk right after a miss: "tempts me to bail" (j4:8), "a panicking me could hit it" (j1:9), "a tired me could tap it" (j2:10).
   - Main's › has no word. R1 testers read a bare › as "Skip or next? Unclear." (r1-j2:7), "is it skip or submit?" (r1-j1:8), "looks just like a Next button, so I'm scared it'll skip" (r1-j2:13).
   - Corner shape (R2.5 #1, v6): the whole action button sits right above ›. Testers aimed the corner button at x = 315–316 (j1:8, j2:9, j3:8, j4:7). Main's › would sit at about x = 329–377 (48 px `.btn`, main app.css:20). A low tap skips the question with no closure. Primer technique 5: "the win is closing the loop."
   - Review 1's remedy (#1: "› hides while the button shows") goes too far. Fix 2 shows a disabled Check at load and in the retry, so › would never show. She would have no skip on a phone. R1: "if I'm stuck, I'm stuck until I pick" (r1-j1:102), "keep 'Skip' reachable during a retry" (r1-j1:130); it cost frustration (r1-j1:111). Primer: technique 7 (agency), rule (i) (offer choices).
   - **Best R3 shape after a wrong pick: full width (review 1's A).** With full width, only the button's right end sits above ›. Testers tapped full-width buttons at the centre, x = 196 (j1:27, j1:75, j2:29, j3:28, j4:24). A small skip in the bar corner, away from the action, was "small and out of the way (good)" right after a miss (j1:25).
   - Her retry screen in A: wise-feedback line first; "Pick again. 1 more try."; Ask Cluck as a visible button on the left; a full-width disabled "Check"; no "Skip for now" button; main's › live and quiet at the bar's far right. Tony decides if › may hide in the retry (open Q1).

   Testers' own Skip tap estimate right after the wrong pick (step-3 line). Role-play guesses; direction only.

   | where the skip sat | v | j1 | j2 | j3 | j4 | lines |
   |---|---|---|---|---|---|---|
   | word in the action slot | v1 / v4 / v6 | 15 / 15 / 15 | 10 / 5 / 10 | 5 / 5 / 5 | 10 / – / 10 | j1:9/57/89, j2:10/59/89, j3:9/60/94, j4:8/74 |
   | small captioned icon, bar corner | v2 / v3 / v7 | 10 / 10 / 10 | 5 / – / – | – / – / – | 5 / 5 / 5 | j1:25/41/105, j2:27/42/104, j3:26/43/111, j4:22/36/88 |
   | "Skip for now" button | v5 | 15 | 15 | 10 | 10 | j1:73, j2:74, j3:77, j4:60 |

   "–" = Skip not in the top 3. j4 v4 has no step line at all (one collapsed line, j4:49). Medians: action slot 10%, corner icon 5%, "Skip for now" 12.5% (the highest).

2. **Tester strictness, not the design, decides the unity gate.**
   - All 4 testers saw a pixel-identical v2 desktop after Check (`dev/j1-desk/007` = `j2/j3/j4-desk/006`, pixel diff). They gave unity 14 / 18 / 13 / 17.
   - On that shot the result line is hidden under the sticky "Next question" (shot j4-desk/006). Only j3 (j3:33) and j4 (j4:26) saw it. j1 and j2 did not (j1:31, j2:32).
   - The bar flip alone cost 6 points with j1 (j1:36, j1:52), 2 with j2 (j2:37, j2:54), 0 with j4 (j4:31, j4:46 name only the feedback). R1 shows the same spread (r1-j1:52: 17, "only the width differs"; r1-j3:52: 15, "the dock flips").
   - Under Tony's lock every R3 variant has the flip. With the current brief, R3's unity pass depends on whether the panel draws a j1-type or a j4-type tester.
   - More testers make it worse. Under "every tester ≥ 15", each added tester is one more way to fail. Rough normal model from R2 (top-bar unity, per-cell SD 1.95): a design with a true mean unity of 16.5 passes 52% of the time with 4 testers, 37% with 6, 27% with 8. Illustration only.
   - So review 1's tie-break (#5: "add 2 fresh testers for that variant") is one-way. Extra testers can turn a near-pass into a fail. They can never repair a fail.
   - Fix: fixed unity bands in the brief, "the bar's place is by design: do not score it", and "is the result line in view on both?" as a named check (text below). Back-test on R2: v2 → 10–14 for all 4 (hidden result, a real defect); v1 → 5–9 (actual 9/11/9/9); v4/v5/v6 → 19–20 (actual 18–20). The spread then comes from what is on screen, and the scribe can check each band against the shot.

3. **Her worst moment, the wrong pick, was the least-tested part.**
   - One wrong pick per variant, always A on Q1. The 3 questions repeat in every variant, so testers knew the answers after v1 (j1:3, j2:4; `dev/j*-phone/log.json`).
   - "Out of tries" was never reached: 0 of 8 R1/R2 reports contain it. That is the two-miss moment, where "a wrong answer reads as PROOF" (primer §1) bites hardest.
   - No tester made a wrong pick on desktop (desk logs: one pick + one Check per variant). The R3 desktop panel in the wrong state is unjudged.
   - Testers chained taps. A tap costs 1.5 s of settle (drive.mjs:29). A 1.6–1.7 s gap means the next tap went out before the screen was seen. In v4, j2, j3 and j4 tapped past the wrong-pick screen this way (log.json, shot 030 → 031). j4 logged v4's whole phone walk as one line (j4:49).
   - The phone was 393×852 with no browser chrome (drive.mjs:13). Prod mobile is 100% iOS Safari (BRIEF-HEADER:41): 659 px tall with the toolbar out, 745 collapsed (webkit-shot README:19, PROVEN). The designer's Safari shot of the v6 wrong state already scrolls the question stem off (`navm2-v6-wrong-ios-safari-expanded.png`); the testers' view kept it (shot j4-phone/048). That shot also shows Safari's own ‹ › just under the app bar. With main's bare ‹ ›, she will see two pairs of chevrons at the bottom. The harness cannot show this.

**Medium**

4. **The scores do not see the retry.** By the testers' own per-step friction, the wrong-pick steps (3 + 4) were rougher in v6 than in v4: 2 / 2 / 2 / 1 vs 1 / 1 / 1 / – (j1:89–90, j2:89–90, j3:94–95, j4:74–75 vs j1:57–58, j2:59–60, j3:60–61). v5: 1 / 2 / 3 / 1 (j3:77 friction 2). Still v6 got the best frustration scores (23/24/23/24) and v5/v6 won. The wins came from the right-answer moment and the desktop. For her, the retry matters most. Fix: in R3 the scribe reports the wrong-step friction per variant next to the medians (from the logs; no new tester work).

5. **Identical phone, different phone scores.** The v1 and v4 phones are pixel-identical except the header name and the switcher highlight (pixel diff, all 4 testers; the wrong and re-pick screens are identical). Clarity + clutter + frustration: j1 63 vs 66, j2 66 vs 70, j3 67 vs 67, j4 67 vs 67. j1 and j2 even wrote "same as v1" (j1:55, j2:57), and their logged friction is the same (2 and 2). So the "phone parts" of R2.2 carry up to 4 points of desktop halo or order. The brief never says the 3 parts are phone-only. Fix: say it (below).

6. **The header names leak into the testers' words.** The header shows each name on phone and desktop ("Mock · 2 · Next shelf", shot j4-desk/006; "Mock · 6 · Thumb button + result panel", shot j4-desk/018). All 4 testers reused the designer's word "shelf" in their own lines (j1:134, j2:29, j3:33, j4:24). Outside the headings, "thumb" appears only in the v1, v4 and v6 sections, the 3 names with "Thumb"; never in v2, v3, v5 or v7. So "my thumb never moves" may be partly primed. The Mockup controls also show the word "Wrong" on a button ("Jump to: Start · Picked · Wrong · Right · Out of tries", shot j4-phone/006; the primer bans "Wrong!"). Test page only. Hiding the header and the controls fixes both.

7. **R2.5 fix 5 demotes the hint together with the skip.** "Ask Cluck and 'Skip for now' go to the left or become quiet links." For her they are opposites. Ask Cluck keeps her on the question (technique 6, private first step; rule (i): "hint or retry?"). Skip leaves the loop open. Testers asked to move Ask Cluck, not to fade it (j1:133, j2:131, j3:140). R1 docked points when it vanished (r1-j1:72, r1-j1:81). Keep it a visible secondary button on the left.

8. **R2.5 option 3 (v2, "result line in the page") brings the jump back right after a miss.** The page "jumped" after a wrong Check wherever the hint sat in the page (j1:9, j1:25, j1:57, j3:9, j3:26). Not where it docked (v5, v6: j1:73, j1:89). STYLE: "nothing jumps" (BRIEF-HEADER:42). Agrees with review 1 #6: drop option 3 or dock its result (= A).

**Low**

9. j2:8's "dark pill" at load is not on the load screen: slot pixels = bar background (8,17,31) (shot j2-phone/001). j3:7 also uses hindsight ("where Check/Next will show up later"). Testers wrote log lines after the walk. So "All 4 testers flagged it at load, where it was quiet" (R2.3) is 3 of 4 (j1:7, j3:7, j4:6). The conclusion stands.
10. R1 was split on a worded Skip, not only against it: "no guessing what '>' means" (r1-j1:55), "Dock now says 'Skip', good." (r1-j2:9). R1 liked the word because it fixed the bare ›. R3 brings the bare › back (icon-only lock, on file). So R1's ambiguity lines (r1-j1:8, r1-j2:7, r1-j2:13) predict R3 better than R2's slot complaints. This may also explain R2.2's "On v4, R2 was stricter than R1": in R1, v4 came after 3 variants with a bare › (r1-j1:8, r1-j1:25, r1-j1:40), so the word was a relief there.
11. The designer's SHAME CHECK for v6 says, after a miss, "the button just said Skip again; nothing yelled" (NAV-MOBILE §7, SHAME CHECK row 6). The shots show a filled Skip pill in that spot after the tap in v1/v4 (shot j4-phone/003), and 3 testers named the bail risk (j1:9, j2:10, j4:8). For R3: answer SHAME CHECK question (1) from the R3 wrong-state screenshot, not from the spec.
12. The raw TOP FIXES ask to "drop the 'QUACK' line" (j2:129). That is content (D68, technique 8) and is not in R2.5. The R3 designer works from R2.5, not from the raw fixes.

### Banned-item check (primer §1)
- No NOTES claim or proposal contains a banned item: no red, no lone X, no score drop, no "Wrong!", "Easy", "Obviously", "Just", "Simply", no sarcasm, no pity "!", no timer, no comparison.
- The R2 wrong-pick screens have none either: dashed "your pick", wise feedback first ("Tricky one … You can get it.", j3:9), no joke (shots j4-phone/003, /012, /039, /048).
- Two proposals weaken primer techniques without a ban: fix 5 (finding 7) and "› hides while the button shows" (finding 1).
- Test page only: "Wrong" in the Mockup controls (finding 6).

### Proposed changes to NAV-TESTER-BRIEF.md for R3 (proposal; nobody edits it now)

| line | now | R3 | why |
|---|---|---|---|
| 2 WHO | "…tired, anxious; you won't explore or read help…" | add: "A wrong answer feels like proof you are not a physics person. You won't ask a person for help." | primer §1 core wound. Testers judge the retry as friction only; 3 still raised the bail risk on their own (j1:9, j2:10, j4:8) |
| 9 TASK | "for EACH variant v = 1..7 (URL = BASE?v=N)" | "for each variant IN THIS ORDER: ORDER (URL = BASE?v=ID&blind=1)". j1, j3: A then B. j2, j4: B then A. | all 4 walked v1→v7 (log.json). `blind=1` = the mock hides the header name and the Mockup controls (designer adds it; small). Opaque IDs in the URL |
| 10 A) | "taking at least one WRONG pick on purpose first" | "Q1: pick WRONG once, then right. Q2: pick WRONG twice (you run out of tries), then go on." | "out of tries" never reached (0/8 reports) |
| after 11 | — | "One tap per command. Look at each screen before the next tap. After your first wrong pick, add one line: 'To leave this question I would tap ___. I think › does ___.'" | chained taps (finding 3); bare-› ambiguity (r1-j2:7, r1-j4:7) |
| 13 B) | "answer one question right, take one shot" | "pick WRONG once, then right. Take a shot after each step." | no desktop wrong pick in R2 (desk log.json) |
| 14 C) | "…phone↔desktop unity (20). Show the 4 sub-scores and one line of why each." | add: "Clarity, clutter and frustration score the PHONE walk." + the unity bands below | findings 2, 5 |
| 20 | "the 7 totals" | "the totals" | fewer variants |

Unity bands (paste under C):
> UNITY /20. Judge the action area. The bar is at the bottom on the phone and at the top on desktop on purpose: do not score where the bar is. Check on both screens: (1) the action button has the same word and shape; (2) it sits in the same place next to the answers; (3) the result line is in view without scrolling. 19–20 = all 3 match. 15–18 = one small miss in (1) or (2). 10–14 = two misses, or (3) fails on one screen. 5–9 = the action lives somewhere else on one screen and (3) fails. 0–4 = you could not find the action on one screen. Name each miss.

Harness, not the brief: `drive.mjs:13` phone viewport 393×852 → 393×659 (Safari, toolbar out). A layout that works at 659 also works at 745.

How many testers:
- R3 with 2 variants: 4 testers. That gives a full A-then-B / B-then-A balance.
- 3 variants: 6 testers (all 6 orders). Restate the unity gate first (finding 2).
- Do not add same-model testers to break a near-tie under "every tester". For one more check, use review 1's human walk (Tony, his iPhone, Safari), with one wrong pick and one "out of tries". It is the only check of the real height, sticky hover after a tap, and Safari's ‹ › under the bar.
- Optional cross-round anchor: every tester also scores one frozen reference, the R2 v6 build (@42c3c19), always last. Its score shows each tester's offset vs R2 (88.5), and makes R3/R4 numbers comparable with R2. Cost: about 1 minute per tester.

### Proposed in-place fixes to earlier sections (old → new)

1. R2.2 verdict, after "…even if its medians stay at 85+.": add → "The pass covers the phone walk with one retry only. No tester reached 'out of tries' (0 of 8 R1/R2 reports), and no tester made a wrong pick on desktop (`dev/j*-desk/log.json`)."
2. R2.3 Skip: "All 4 testers flagged it at load, where it was quiet." → "3 of 4 flagged it at load, where it was quiet (j1:7, j3:7, j4:6). j2:8 says 'dark pill', but the load shot has no pill (j2-phone/001: slot = bar background (8,17,31))."
3. R2.3: "A small icon Skip was fine (j1:25, j2:25, j4:20; shot j4-phone/010)." → "A small icon Skip was fine (j1:25, j2:25, j4:20; shot j4-phone/010). j1:25 is right after a wrong pick: 'small and out of the way (good)'."
4. R2.3 main's ›: "Main's › has no caption." → "Main's › has no caption, and it rests filled: main's `.btn` uses `--sheet` #16243a (main app.css:4, :175–181), the same fill as the 'dark pill' Skip after a tap (22,36,58; shot j4-phone/003)."
5. R2.5 carry list: "1. **v6:** result panel + corner action button. R2 #1 for 3 of 4 testers." and "2. **v5:** …" → "1. **Full width (v5 shape + v6 fixes = review 1's A).** Safest after a wrong pick: only its right end sits above main's › (review 3 #1). 2. **Corner (v6 shape):** only if Tony lets › hide AND a quiet skip link sits on the left in the retry."
6. R2.5 fix 4: "Main's › hides (or does nothing) while a pick waits for Check and while Next shows." → "Main's › hides while a pick waits for Check and while Next shows. Not 'does nothing': a filled tile that ignores a tap is a dead button. At load and in the retry, › stays as her quiet way out (r1-j1:102, r1-j1:130), so the action button must not sit above it."
7. R2.5 fix 5: "Ask Cluck and "Skip for now" go to the left or become quiet links. Never in the thumb column. Never in the Next spot." → "Ask Cluck: a visible secondary button on the left, never in the thumb column (j1:133, j2:131, j3:140; R1 docked points when it vanished: r1-j1:72, r1-j1:81). 'Skip for now': drop it (main's › is the one skip) or make it a quiet text link on the left. Never in the Next spot (j2:74, j2:130)."
8. R2.5 open, unity: "…or we accept a unity cost of about 1–6 points per tester (v2 vs v4/v6 in R2)." → add: "On one identical v2 desktop shot the bar flip cost 6 (j1:36), 2 (j2:37) and 0 (j4:31) points. Under 'every tester ≥ 15' that spread decides the gate. Review 3 proposes the brief option with fixed bands."

### Where review 1 is wrong (my lens)
- #1 remedy "› hides while the button shows": with fix 2 the button always shows, so she gets no skip at all (finding 1). Use the narrower rule in fix 6 above.
- #5 tie-break "add 2 fresh testers for that variant": one-way under "every tester" (finding 2).
- #5 human walk and #4 counterbalance / hide names: right. Add the wrong pick and "out of tries" to the walk, and run it in Safari. More evidence for #4: "shelf" in all 4 reports, "Wrong" in the controls (finding 6).

### Checked and found sound
- The 28 R2 cells and 7 medians (med.py plus j4:42 and j4:51 by hand).
- Every cite above against its line, including all R1 cites in R2.3 (r1-j2:58, r1-j4:7, r1-j4:55, r1-j4:131) and R1 v4 clarity 29/28/28/27 (r1-j1:63, r1-j2:68, r1-j3:65, r1-j4:64).
- v1 = v4 phone: pixel diffs only in the header (y 19–31) and the switcher (y 560–668).
- Scribe: "Skip hides once I pick" (j2:35, j4:29); jump vs dock (j1:73, j1:89); Ask Cluck right above the slot (shot j4-phone/048); "Pick again. 1 more try." is clear (j1:9, j2:10, j3:60, j4:8).
- Review 1: order v1→v7 (log.json); the 4-of-4 sign test p ≈ 0.06; pill fill (22,36,58) vs bar (8,17,31); R1 top-bar v3/v7 unity ≥ 15 from every tester.

### Open questions for Tony
1. In the retry (after a wrong pick), what is her quiet way out? (a) main's › stays live: then the action button is full width, not in the corner above ›. (b) › hides: then the panel needs a small "Skip this one" link on the left, or she is stuck (r1-j1:102).
2. May the R3 brief tell testers that the bar's place differs by design and is not scored (the unity bands above)? Without it, the flip price (0–6 per tester) decides the gate.
3. If R3 uses more than 4 testers, does "unity ≥ 15 from every tester" still apply, or "from all but one"?
4. May the R3 phone use Safari's real height (393×659)? Scores then differ from R1/R2 conditions, but R3 tests a new layout anyway (review 1 #2).

## R2 adversarial review 4/5 (parallel; lens: phone build reality)

Read: NOTES.md as it is now (through review 1), the review brief, main's `nav.js`, `nav.css`, `index.html`, `app.css`, `app.js`, `brainrot.js`, `offline.js` and `rewards/rewards.css` (working tree = `origin/main` for these files), and the `-navmock` worktree's `try/nav-mobile.{html,css,js}` and `design/plans/NAV-MOBILE.md`. I also read the harness (`drive.mjs`, `ios-sim.py`), the R2 reports (grep) and shot j4-phone/048 (pixel scan). I wrote no code and did not re-argue a lock.
Cites: `app.js:1630` = main file and line. `nm.js` / `nm.html` / `nm.css` = `-navmock` `try/nav-mobile.*`. `NM §5:111` = `-navmock` `design/plans/NAV-MOBILE.md` line 111. NOTES line numbers are as I read the file.

### Findings, by severity

**High**

1. **Main's bottom-space code knows only `#dock`. On phones, "Open notes" will sit on ‹ and ›.**
   - With a bank open on a phone, `#dock` is hidden at rest (C8, app.css:147). `dockRoom()` then returns 0 (app.js:1635).
   - "Open notes" is 56 px tall, z 40, at the right edge, placed `dockRoom() + 16 px` above the bottom (app.js:2081–2085, 2104; app.css:826–827). It shows on every phone question while no answer field has focus (app.js:1931, 2071–2072).
   - So, by default, it covers the right end of a bottom bar: ‹ and ›. At z 40 it paints over the bar (the code bar is z 20).
   - Every reader in the table below has the same blind spot. Each one will put its item under, or on, a new bottom bar.
   - The R2 mock had none of this. It had no "Open notes" (Notes was a bar button: NM §2:38). It loads main's CSS but none of main's JS (nm.html:14–16, 112).
   - This makes review 1 #1 ("that corner could hold 3 controls") and review 1 Q4 worse: the stack in the corner is the default state, not a risk.

   | reader | what it reads | where |
   |---|---|---|
   | page bottom padding | `--dock-h` | app.css:152, 824–825 |
   | `--dock-h` itself | `dockRoom(true)` | app.js:1693 |
   | question strip height | `dockRoom()` | app.js:1708 |
   | notes box height cap | `dockRoom()` | app.js:1969 |
   | notes box bottom inset | `dockRoom` | app.js:1556 |
   | "Open notes" floor and drop | `dockRoom()`, `#dock` rect | app.js:2083, 2126 |
   | toast: flip above when no room | `dockRoom()` | app.js:62–65 |
   | video corner / tab (sugar) | `#dock` rect | brainrot.js:115 |
   | version badge | `--dock-h` | app.css:944 |
   | re-layout on bar resize | ResizeObserver on `#dock` only | app.js:1696, 2138 |

2. **R2's phone evidence does not cover the R3 phone layout.**
   - Viewport: Chromium 393×852 with an iPhone UA (drive.mjs:13–14). No Safari bars. No safe-area inset. Playwright's own iPhone 15 viewport is 393×659, Safari with its bars (ios-sim.py:12–13). So R2 testers had 193 px (29 %) more height than a real iPhone 15 in Safari.
   - Mock: multiple choice only (nm.js:2). A keyboard stand-in that no report mentions (grep of nav2-j1..4: no "keyboard"). No code box (nm.html:34–47). No "Open notes". A partial Cluck sheet above the bar (NM §2:51); main's phone sheet is full screen (app.css:522).
   - Structure: v6's button lived in the bar's own slot (nm.js:86). Its result panel showed only after a check (nm.js:143). Main's bar has no slot (review 1 #2). So the R3 button needs its own strip, shown at all times, because fix 2 puts a disabled Check there before a pick. That is two fixed layers at rest: the v2 shape. The designer's risk line for v2: "Two layers at the bottom take ~140 px of a 659 px Safari view" (nm.js:69).
   - Estimate on main's tokens (48 px buttons, app.css:20): bar 64 px (8 + 48 + 8), or 90 px with the 34 px home-indicator inset as its bottom padding; strip 64–80 px. At rest: about 130–170 px, 19–26 % of 659 px. After a wrong pick with a 3-line hint (shot j4-phone/048), add the panel (about 145 px): about 275–315 px, 41–48 % of 659 px.
   - R2 v6 at that same moment: 210 px of 852 (25 %). The panel's top edge is at y = 642 (pixel scan of shot j4-phone/048).
   - So "my thumb never moves" (R2.3) may hold, but "nothing important below the fold" (Goal §0) is not tested on a real phone.
   - Contradicts R2.5 "v6: yes, if the button leaves the bar" (NOTES:144) and review 1 #6 (NOTES:187). Neither says that the strip is there at all times.

3. **Typed and multi-part answers: "Check leaves the answer row" is not defined for them, and the keyboard hides or lifts every bottom layer.**
   - In `problems.json`, 44 of 90 questions need the keyboard (num 29, text 4, multi 11). R2 tested none of them.
   - On main, a typed answer's Check is the arrow inside its box (`#ansGo`, app.js:562) and the keyboard's Send key (`enterkeyhint="send"`, app.js:582). A multi-part question has one arrow per part, and each part shows its own verdict in that slot (app.css:356–358, 371–377). One bottom Check cannot keep per-part verdicts without a grading change.
   - Keyboard up on iOS: fixed elements stay on the layout viewport (main's own note, app.js:1622–1624). On Android Chrome the layout viewport shrinks (`interactive-widget=resizes-content`, index.html:5–6). Then a `bottom: 0` bar rides on the keyboard, over the field.
   - Main solves this only for `#dock`, with `dock-away` (app.js:1682). The Swap stage pins the answer just above the keyboard (app.css:729–734). The notes page puts its tool row at the bottom (app.css:771–789). A bottom bar, strip or panel that does not step away covers both.
   - Contradicts R2.5 fix 1 (NOTES:153) as written: "Check leaves the answer row" for every type.

4. **Fix 4 assumes that main's › can be held off. nav.js cannot do that as it is.**
   - nav.js sets `next.disabled` from the list position only (nav.js:116–117). It runs again after every graded check: `saveDone` → offline.js `drill:marks` → `update()` (app.js:940–950, offline.js:98, nav.js:230). A `disabled` set from outside is undone by the next check.
   - `hidden` on › gives `display: none` (app.css:46). Then ‹, which has `margin-left: auto` (nav.css:17), slides to the right edge, into the thumb spot. A thumb that meant "skip" goes back.
   - "Does nothing" leaves a 45 %-opacity › (nav.css:9) in the thumb spot that ignores taps.
   - Main has no Next in the page today. › is the only forward control; Check is in the row (app.js:536, 539, 562). So R3 makes the second forward control. Its Next must run nav.js's own `go(1)`: snack skip (nav.js:199) and redo rounds (nav.js:146–149). `go` is private; nav.js exports only `window.stemOrder` (nav.js:150). `next.click()` does nothing while › is disabled.
   - On the last question nav.js disables › (nav.js:117). NOTES do not say what the action button shows there.
   - Contradicts R2.5 fix 4 (NOTES:156): "hides (or does nothing)".

**Medium**

5. **Main code that assumes the phone bar is at the top.**
   - `doneExit` scrolls phones to the top 900 ms after a right answer, so "the question row (Next) comes back into view" (app.js:952–962). With the bar at the bottom, this scrolls the result away while she reads it. The designer flagged it (NM §4:88). NOTES do not.
   - `bar-off` slides the nav up by its own height while the notes box has focus, and keeps its space (app.css:676–684; app.js:1683, 1853–1857). At the bottom it must slide down.
   - Phones up to 34rem wide give `main` 4 px top padding, because the nav row sits above it (app.css:674). Without that row, the question box starts 4 px from the top of the page.

6. **List open on a phone: four things want the same space.**
   - Opening the list brings up the code bar (C8: app.css:146–147; app.js:1665–1666). The code bar is fixed at `bottom: var(--kb-bottom, 0px)` (app.css:139–143). That is the same spot as a bottom bar.
   - The code suggestions open upward (app.css:86), up to 50vh (app.css:83). The list must open upward too. Today it hangs under the top bar (nav.css:21).
   - The list's height cap is `min(32rem, 60svh)` (nav.css:63). It does not subtract the bar, the code bar and its 44 px tab (app.css:156–165). On a short or landscape phone the top of the list goes off the screen.
   - While she types a code, the code bar rides on the keyboard (app.js:1685–1687). The bar and the list do not.
   - The R2 mock had no code box, so no tester saw this state.
   - Contradicts R2.5 open bullet 3 (NOTES:162): with a bank, the code box is not "its own bottom strip" at rest; it comes up with the list, in the bar's spot.

7. **Stacking traps for the panel and the strip.**
   - `#fb` is inside `.freeze` (index.html:188–200), and `.freeze` is a z 10 stacking context (app.css:199, 821). A fixed panel built inside `#fb` paints at z 10: under the code bar (20) and "Open notes" (40).
   - While a pick waits, `#fb` gets `filter: brightness(.55)` (app.css:274). A filter makes `#fb` the containing block of its fixed children. The panel would then jump into the page and go dim, at the re-pick after a wrong try.
   - The open list lifts `.top` to z 47, over the dim at z 46 (nav.css:93, 105). A bar outside `.top` falls under the dim. A strip lifted with it stays live: one tap closes the list and also fires Check or Next (nav.js:222–225).
   - Cluck's phone sheet is full screen at z 45, with its ask field at the bottom (app.css:522, 580–605). The notes page `main` is z 15, with its tool row at the bottom (app.css:771–789).
   - Sugar mode: the stashed video tab is 44×96 px at the bottom-left edge, 16 px up (brainrot.js:64, 115, 156–159). It shows a › chevron (`i-next`, brainrot.js:158) next to the List button. Its avoid list has no bar (brainrot.js:118).

8. **"Phone" is not defined.** Tony said "phone only" (NOTES:37). Main's phone test is `(max-width: 700px), (pointer: coarse)` (app.js:1630). That includes iPads and touch laptops. The R2 mock used the same test (nm.js:98). A width-only test puts a landscape iPhone (852 px wide) on the top bar, so the bar jumps when she turns the phone.

9. **The double-tap guard is not in the R3 fixes.** Check turns into Next in one spot. The R2 mock blocked a second tap for 400 ms (nm.js:107, 201–204, 250). Real touch was not tested (NM §5:111). Also review 1 #11 (hover stays after a tap): main's `.btn:hover` is not limited to `(hover: hover)` (app.css:183).

10. **Fix 5 collides with a Tony pick.** On main, "Ask Cluck" is the "Explain my mistake" chip: 52 px tall, a casino pill that wiggles every 6 s ("should shake like an ad button", rewards.css:94–118). It sits right after `#fb` (app.js:1117). If the result moves into the bottom panel, the chip moves into the thumb column (the R2 near-miss: j1:90, j2:89, j3:94), or it stays in the page, away from its hint. "A quiet link" (NOTES:157) changes Tony's chip.

11. **Real-iOS checks never ran, and R3 has no step for them.** The designer listed 6 (NM §5:105–111): the inset while Safari's bar collapses and expands, the iOS 26 floating glass toolbar over a bottom bar, the real keyboard, thumb reach, a real double tap. Main has field notes on the same problems: the URL bar slide (app.js:2102–2103), Firefox Android vs Chrome (app.js:2124–2125). I could not confirm on a device whether the first tap on a bottom bar after a scroll only brings Safari's bar back; test it. Review 1 #5's Tony walk is the only real-phone step, and it is optional.

**Low**

12. Accessibility. › is named "Next question" (index.html:170), but R3 calls it the only Skip (fix 2). The List button shows the bank code but is named "Question list" (nav.js:103, 110), so voice-control users cannot say what they see (WCAG 2.5.3). ArrowDown opens the list (nav.js:210); an upward list suggests ArrowUp. Put the strip in the DOM right after `#fb`, so a screen reader hears the result, then the action.
13. The code suggestions cap at 50vh (app.css:83). On iOS that is the large viewport. Above a bar plus the code bar, the suggestions can run off the top.
14. Main has no web manifest (repo grep). Home-screen mode is not a target today. If it becomes one, the bar needs the 34 px inset, and there is no browser Back.
15. Redo round: the phone bar shows "Exit redo" in words at rest (nav.css:51–55), and the list button says "Redo" (nav.js:103). This is the widest bar state. Check it at 375 px wide, with the strip above it.

### Who gets the bottom 80 px (phones)

| item | z | shows when | source |
|---|---|---|---|
| main's bar (moved) | not set | a bank is open | lock |
| action strip (Check / Next) | not set | every question (disabled Check before a pick) | R2.5 fixes 1–2 |
| result panel | not set | after a check | R2.5 fix 3 |
| code bar | 20 | list open (C8), no bank, a load error | app.css:139–147; app.js:1666 |
| code-bar tab, 44 px | 20 | no bank, question open | app.css:155–165 |
| "Open notes" | 40 | every phone question, no answer field focused | app.css:826–833; app.js:2069–2105 |
| toast | 50 | wrong typed try; onboarding tip on "Open notes" | app.js:48–79, 2078 |
| Cluck sheet + ask field | 45 | Cluck open (full screen) | app.css:522, 580–605 |
| notes page tool row | 15 | notes page open | app.css:771–789 |
| video tab (sugar) | 30 | screens under 700 px tall | brainrot.js:4–8, 64, 156–159 |
| version badge | 1 | always; takes no taps | app.css:941–944 |

Main has no sticky Check or Next today, and the rewards HUD stays at the top. Proposal: the bar owns the bottom edge, with the inset. The strip sits on the bar. The panel opens above the strip. "Open notes", the toast and the video tab sit above the whole stack. While the list is open, the code bar takes the strip's place. Cluck's sheet and the notes page cover all of it. While the keyboard is up, the bar, strip and panel step away.

### Proposed in-place fixes (quote old → new)

1. R2.4, add a last bullet. New: "- R2 phone walks ran in Chromium at 393×852 (drive.mjs:13–14): no Safari bars, no safe-area inset. The mock had multiple choice only, no real keyboard, no code box, no 'Open notes' and a partial Cluck sheet, and it loaded none of main's JS (nav-mobile.html:14–16, 112). Fold, reach and 'nothing covers' findings are optimistic for real phones."
2. R2.3 One forward control (NOTES:109). Old: "Main's bar has its own › (Prev / Next, `nav.js`). The same rule must cover it." → New: "Main's bar has its own › (Prev / Next, `nav.js`). Main has no Next in the page today (Check is in the row: app.js:536, 539, 562), so the new button makes the second forward control. The same rule must cover ›."
3. R2.5 (NOTES:144). Old: "**v6: yes, if the button leaves the bar.** Put one action button in the result panel: just above main's bar on phones, at the bottom of the content column on desktop." → New: "**v6: yes, if the button leaves the bar.** On phones the button needs its own strip above main's bar, shown at all times (it holds the disabled Check before a pick). The result panel opens above the strip after a check. That is two fixed layers at rest, the v2 shape (~140 px of a 659 px Safari view: nav-mobile.js:69). Desktop: at the bottom of the content column."
4. R2.5 fix 1 (NOTES:153). Old: "Check leaves the answer row." → New: "For multiple choice, Check leaves the answer row. Typed answers keep the arrow in the box and the keyboard's Send key (app.js:562, 582). Multi-part keeps one arrow per part (app.css:356–358). Next is the same button for every type."
5. R2.5 fix 4 (NOTES:156). Old: "4. One forward control. Main's › hides (or does nothing) while a pick waits for Check and while Next shows. Keep a clear gap between the action button and main's ›." → New: "4. One forward control. Main's › gets `visibility: hidden` (its slot stays) while a pick waits for Check and while Next shows. Not `disabled`: nav.js sets it again after every check (nav.js:116–117, 230). Not `hidden`: ‹ would slide into the › spot (nav.css:17). Both button shapes (corner and full width) sit over ›, so keep a gap of 16 px or more."
6. R2.5 open bullet 3 (NOTES:162). Old: "On phones the code box is its own bottom strip (main index.html:130–133)." → New: "On phones the code box is its own bottom strip (main index.html:130–133). With a bank it is hidden at rest and comes up with the list (app.css:146–147, app.js:1665–1666), fixed at `bottom: 0` (app.css:139–143): the same spot as a bottom bar."
7. Review 1 #1 (NOTES:173). Old: "If main's › must stay, drop the corner shape." → New: "If main's › must stay, drop the corner shape, and put the full-width shape 16 px or more above the bar: its right end also sits over ›. On main, 'Open notes' already defaults onto that corner (app.js:2081–2104; review 4 #1)."
8. Review 1 #6 (NOTES:187). Old: "On phones it sits above main's bar." → New: "On phones it is a strip above main's bar, shown at all times (the disabled Check); the result opens above it. Cap the result at about 3 lines."
9. Review 1 #5 (NOTES:185). Old: "add one human walk (Tony, 10 min, his phone) or one tester from another model." → New: "add one human walk (Tony, 10 min, his phone; required before scoring, checklist in review 4 must-hold 13), and if wanted one tester from another model."

### Must-hold constraints for the R3 build

1. Build R3 in the real page (`index.html` with `app.js`, behind a URL flag), not in a CSS-only mock. If R3 stays a mock, add "Open notes" with main's placement code, the C8 code bar with the list, one typed and one multi-part question, and the full-screen Cluck sheet. Else findings 1, 3, 6 and 7 cannot show.
2. One "bottom space" value = bar + strip + panel + code bar + inset. Every `dockRoom()` / `--dock-h` reader uses it (table in finding 1). Add `scroll-padding-bottom` of the same size.
3. "Open notes", the toast and the video tab stay above the whole stack. Add the bar and the strip to their avoid lists (app.js:2095; brainrot.js:118). Never on ›, never on the action button.
4. Keyboard up for any field in `main`, Swap, the notes page: the bar, strip and panel step away with `dock-away` (app.js:1682). While she types a code, the code bar rides the keyboard and the bar stays down.
5. › off = a class with `visibility: hidden`, slot kept. The new Next calls nav.js's own `go(1)` (export it; do not copy it). Define the last question and the redo round.
6. `doneExit` does not scroll to the top when the bar is at the bottom (app.js:961–962). `bar-off` slides down (app.css:680–684). Phones get real top padding when the nav row leaves the top (app.css:674).
7. The panel and the strip are top-level elements, not inside `#fb` or `.freeze` (app.css:199, 274). No `filter` or `transform` on any parent of a fixed bar. The bar stays inside `.top`, or gets z 47 only while the list is open (nav.css:105).
8. Z order: page and question 10 < bar, strip, panel < "Open notes" 40 < Cluck 45 < dim 46 < lifted bar 47 (list open only) < toast 50. The strip stays under the dim.
9. List open: the list sits above the bar and the code bar. Its cap = visible height − bottom stack − top inset, not only `60svh`. Use `svh` or visualViewport for heights, never `vh`.
10. Bar padding-bottom `max(8px, env(safe-area-inset-bottom))`, like the dock (app.css:141).
11. A 400 ms guard on the Check → Next button. Hover looks only under `@media (hover: hover)`. Every keyframe slide gets a reduced-motion rule (app.css:906 stops transitions only).
12. One media query defines "phone", shared by `nav.css` and `app.js`.
13. Tests: phone walk at 393×659 (Playwright iPhone 15), plus one typed question, one multi-part question and one list-open step. Tony's 10-minute walk on his iPhone before scoring: the inset with Safari's bar up and down; the first tap on the bar after a scroll; a typed answer with the keyboard; the list with the code box; where "Open notes" sits; Cluck open; turn the phone.

### What I checked and found sound

- Main's bar buttons are 48×48 px with 8 px gaps (app.css:20, 175–181; nav.css:8). That meets 44 pt (Apple) and 48 dp (Material).
- Every bar button has an aria-label (index.html:157–172; nav.js:106, 110). Disabled bar buttons show no hover (nav.css:9–11).
- Reduced motion: transitions are off globally (app.css:906). The dim, the splash and view transitions have their own rules (nav.css:112; index.html:31–34; app.js:1981, 1987).
- Heights: `body` uses `100dvh` after `100vh` (app.css:39). The list and the question layer use `svh` (nav.css:63; app.css:207). `viewport-fit=cover` is set (index.html:6). The dock already pads the inset (app.css:141, 161).
- Nothing sets `filter` or `transform` on `.top` today (grep), so a fixed bar inside `.top` is safe now.
- The rewards HUD and the drop banner stay at the top on phones (app.js:1405; rewards.css:38, 178–181). No reward item competes for the bottom.
- Scribe cites nav.css:45–53, nav.js:103, app.css:826–832 and index.html:130–133 say what NOTES says. The one gap is C8 (finding 6).
- Review 1 #1, "that corner could hold 3 controls": the code confirms it, as the default (finding 1).
- R2.3, "main's › sits in the bottom-right thumb spot": right (nav.css:17).

### Open questions for Tony

1. "Phone only": by width (700 px or less), or by main's dock test (700 px or less, or touch, so iPads too)? Which bar does a phone turned sideways get?
2. "Open notes" stays (main's bar has no Notes). May its default spot move above the action strip, or to the left side?
3. List open on a phone: where does the code box go? Above the bottom bar, inside the list, or hidden until she asks?
4. Typed and multi-part answers: keep the arrows in the boxes (the bottom Check is for multiple choice only)? Or one bottom Check for every type (a grading change for multi-part)?
5. The "Explain my mistake" chip: keep it shaking under the result, or make it quiet (R2.5 fix 5)?
6. May › have the spoken name "Skip question" before she answers? Nothing on screen changes.
7. R3 in the real page behind a flag, or in the mock? The mock cannot show findings 1, 3, 6 and 7.
8. Will you do a 10-minute walk on your own iPhone before R3 is scored?

## R2 adversarial review 5/5 (parallel; lens: devil's advocate / scope)

Read: NOTES.md as of 65dc1a3 (scribe and review 1), nav2-j1..4, nav1-j1..4, NAV-TESTER-BRIEF, method "Variant 2", NAV-MOBILE §2–§7 on `-navmock`, shots j1-desk/007 and j1-desk/010, the shot counts in `dev/j*/`, main's `nav.js`, `nav.css`, `index.html`, `app.css` (`origin/main`), the PR #92 diff, the open PRs (REST), and brain: handoff 1005, `projects/calc/NOW.md`, `genui-major-plan.md`, `analytics-2026-10-07.md`. I wrote no code. I did not re-argue a lock. I did not edit NOTES.md (parallel run). This file only.
Cites: as in "R2 results". `NM:<n>` = line n of `design/plans/NAV-MOBILE.md` on `-navmock`. `brain <path>:<n>` = a brain file line.

Bottom line: can the loop stop now? The comparative part can: stop it at R2. Tony's lock keeps one confirm round. Do nothing more until after Exam 2. Then do one prod build of Tony's bar swap, and run his confirm round on that build. Keep R4 in reserve.

### Findings, by severity

**High**

1. **All nav work must wait until after Exam 2 (Fri Oct 9).** No R3, no build, and no new nav questions to Tony before Sat Oct 10. The reason is the project's own rules, not "exam vs site" (brain says: "Do not re-raise exam-vs-site", `_drift/2026-10-05T1652-main-handoff-wipe-wave4.md:33`).
   - Tony's rule for this work: "everything before Thu Oct 8 night must not need his attention" (brain `projects/calc/topics/genui-major-plan.md:240`).
   - Deploy freeze: "FREEZE risky deploys through Thu Oct 8 night (Wed/Thu nights = expected peak)" (brain `projects/calc/topics/analytics-2026-10-07.md:28`). The users are about 12–25 real classmates. Every measured phone visit is iOS Safari (same file, TL;DR 3 and 5).
   - Nobody checked a fixed bottom bar on a real iPhone. NM:105–111 lists 6 open iOS items ("No BrowserStack credentials").
   - The last session already put these items on the "UI post-exam list" (handoff 1005: "no Next near answers, … scroll jump").
   - R3 is blocked anyway. It needs Tony's › answer (finding 4). Also, PR D #92 changes 208 lines of `nav.js` and removes Shuffle and Redo from the bar (`git diff --stat origin/main...origin/ccr-81108955-ufvhze-queue`). "D tonight vs Saturday (AN suggests defer)" is still open (handoff 1005). If we build on today's bar now, we must build it again after #92.
   - Tony already owes 11 picks (handoff 1005) and has 7 open PRs (#90–#93, #96–#98).
   - Agents can wait too. Nothing in this loop is urgent.

2. **The planned end point ships nothing to students.** `-navmock` changes no prod file. It holds `try/nav-mobile.{html,css,js}`, `NAV-MOBILE.md` and 136 PNGs (21.1 MB) (`git diff --stat origin/main...origin/ccr-81108955-ufvhze-navmock`). The stage map has no prod build step (NOTES:28–30). The prod notes in NM §4 are not built ("no prod file edited").
   - Path as planned: R3 mock, R4 mock, a `-navmock` PR (21 MB of shots into the public repo), then a prod build that nobody has planned, then its review. That is 4–6 more sessions.
   - The mock cannot show main's real parts. Example: main's "Open notes" button is fixed at the bottom right on phones (`app.css:826–827`: `position: fixed; … bottom: 0; height: 56px`, z-index 40). That is where main's › lands when the bar moves down. The mock removed that button (NM:38). The mock also leaves out main's XP strip (main `nav.css:45`, "List · XP · Prev / Next"; the mock bar in shot j1-desk/007 has none) and the code box strip (NM:83 gives it "a new home" on paper only). It only simulates the keyboard (NM:108).
   - Proposal: make Tony's "bar swap" the prod build, on a preview. Run his confirm round on that build. This obeys the lock ("the bar swap must happen first, then a confirm round"). It removes at least one mock round and one later build cycle.

3. **Under the lock, the goal is decided by which testers we get.** Both parts of the goal are at the edge.
   - Testers take points off for the bar position, by name: j1:36, j1:52, j1:116, j2:37, j2:54, j3:38, j3:55, j3:123. The brief asks them to ("where things are relative to the content", NAV-TESTER-BRIEF:13). Tony has fixed the bar position.
   - Six top-bar desktops whose action looked like the phone's averaged unity 14.75–15.75 (R1 v2 15, v3 15.75, v7 15.75; R2 v2 15.5, v3 15.5, v7 14.75). The bar is 15 from every tester. R1 v3 and v7 passed it, with 4 of their 8 cells at exactly 15 (r1-j2:51, r1-j3:48, r1-j2:119, r1-j3:116). All 4 R2 top-bar desktops failed it (min 9–13).
   - What-if: give v6 the desktop unity of v2 (14/18/13/17 in place of 20/20/19/19). The totals become 81/90/81/88: median 84.5, min unity 13. R2's best design then misses both parts.
   - The method also raises the goal after any eval above 85 (method:56). R2 has 12 such evals. A target that moves after each good round cannot stop the loop. The cap (NOTES:10) is the real stop rule.
   - Proposal (Tony decides, open question 2): unity = the same words, icons, order, and the same action spot next to the answers and the result line. The screen position of the bar is out of scope. Pass on median unity ≥ 15, not on every tester. Put the parts that code can check (same labels, result line in view and right above the button, one forward control) in a Playwright test, not in a vote.

4. **Every R3 shape needs Tony's › answer, not only the corner one.** Review 1 keeps the full-width shape if › must stay (NOTES:173, NOTES:187). But a full-width Next above main's bar with a visible › is R1 v2: "two forwards stacked", 4 of 4 (r1-j1:29, r1-j2:28, r1-j3:25, r1-j4:27; R1 v2 clutter 16/16/18/17). r1-j1:29 says the › "does the same thing", and still takes points off. So the scribe's fallback ("main's › and the new Next must do the same thing", NOTES:160) does not fix it. Main's › already has the name "Next question" (`index.html:170`, `aria-label="Next question"`).
   - If › must stay, each shape breaks one 4/4 finding: two forward controls (A, B), or Check and Next in two places (› as the Next).
   - A bench round cannot settle this. It is a one-line pick for Tony. Until he picks, nobody can design R3.

**Medium**

5. **R3 + R4 cost a lot and can change little.** Tokens are not measured here.

| | R3 + R4 as in R2.5 | Proposal (finding 2) |
|---|---|---|
| sessions | designer + bench, two times; then an unplanned prod build + review (4–6) | prod build + confirm round (2); +1 fix only if it fails |
| agents per bench | 4 testers + scribe + 5 reviewers | the same or fewer, one time |
| screenshots | 342 in R2 (63–64 phone + 22–23 desktop per tester, `dev/j*/`), each read into a growing context | about 2/7 of that (2 builds, not 7 variants) |
| Tony | 4+ kickstarts and reads; many questions (finding 8) | ≤ 3 questions; one 10-minute walk on his own iPhone |
| what it can change | corner vs full width; unity under the lock; nothing on the bar (locked) | the same answers, on the real page |

   - Corner vs full width is already a tie: v5 88.5 = v6 88.5, and phone parts 69.5 = 69.5 (medians of clarity + clutter + frustration). Four new testers from the same model family will probably tie again. "Carry 3" (NOTES:146) also keeps v2, which breaks top fix 3 (review 1 #6).
   - Pick, do not test: full width is the bigger target, works for either thumb (NM:110, item 5, never checked on a real phone), and has the same shape on desktop. Use the corner only if Tony asks for it.

6. **The scores are relative, the goal is absolute, and there is no control.** The same v4 phone flow got phone parts 73 in R1 and 67 in R2 (NOTES:77). Its clarity fell from 29/28/28/27 to 24/26/24/25 "for the Skip slot" (NOTES:96). But R1 testers saw the same Skip slot (r1-j2:58, r1-j3:55, r1-j4:55), and R2 made it quieter (NM:156). The field changed most: in R1 the other variants had a bare row arrow and a second ›; in R2 all had a labeled Check. Testers compare variants aloud (j2:73, j4:49, j3:67, j4:50). The bench never scored main's own nav. So "85" does not tell us "better than today".
   - Proposal: if a confirm round runs, add main as the control (served locally, never the live site). Pass = beats main on the median, and no 4/4 blocker. Tony can keep 85 as well.

7. **Review 1 #5's "add 2 fresh testers" works against its own aim.** Under "≥ 15 from every tester", each added tester can only lower the min. That fix works only with a median rule.

8. **The open questions are now a cost.** The scribe asks 2 (NOTES:160–161). Review 1 asks 4 (NOTES:221–224). Reviewers 2–5 can ask up to 3 each. That is up to 18 nav questions, on top of 11 owed picks and 7 open PRs. The › question is asked two times (NOTES:160, NOTES:222). The unity-brief question is asked two times (NOTES:161, NOTES:223).
   - Proposal: the coordinator merges all nav questions into ≤ 3 and sends them after Fri.

**Low**

9. **Steelman: v4 on main's bar** (dropped at NOTES:143 and in review 1 #7). On main's bar, v4 becomes R1's v1 "Dock swap": the › itself turns into the filled Next after a right answer or out of tries. It adds no new parts. It has one forward control by design. The thumb never moves (the 4/4 finding: j1:67, j2:68, j3:71, j4:82). NM:74 and NM:78 called it "the ship-tonight fallback" and "the cheapest prod diff".
   - Cost under the locks: no "Check" or "Next" word on phones. R1 phone clarity was 24/19/22/24 for v1 vs 29/28/28/27 for v4 (v1 also had the bare row arrow). On desktop the › is in the top row, "about 700 px away" from the result (r1-j2:16). R1 v1 unity was 12/10/13/10. It fails the unity goal for sure.
   - Use it only if Tony wants the smallest diff more than the score. Note: "icon-only" is the NOTES wording (NOTES:33). Tony's words are "i do not like the one with the text" (NOTES:34). Main's phone bar already shows the bank code as a word (`nav.js:103`; no phone rule hides `#qlistName`, `nav.css:13`). If one word on one action button at the bar's end is allowed, that is Tony's call. Not re-argued.
   - Cost of the other locks, on file only. Desktop bottom bar (the "phone only" lock): R2 unity 18–20 with it (v4, v5, v6), and min ≤ 13 for every top-bar desktop (NOTES:48–54). Captioned bar on desktop: no R2 data, because every R2 bar had captions. Main's desktop buttons show hover titles (`title="Next question"`, `index.html:170`), so the loss on desktop is probably smaller than on phones.

10. **Two R2.5 details add parts for little gain, and one detail is missing.**
    - Top fix 4 says "(or does nothing)" (NOTES:156). A button that looks live but does nothing is a trap under the thumb. Hide it, or show it disabled (main already dims disabled buttons, `nav.css:9`).
    - Top fix 2 keeps a disabled "Check" on screen at all times (NOTES:154). With a full-width button, the phone then has two fixed layers at the bottom, "~130px of a 659px Safari view" (NM:67, v2's risk). Testers also accept "nothing until a pick" (j1:131, j2:130). That needs no disabled look, so review 1 #11's hover/focus problem goes away.
    - Missing: the new Next must call main's own Next (`nav.js:212`, `go(1)`). On #92, Next walks history after Prev, then the queue (#92 `design/NAV.md:46`). Two code paths for Next would give different results.

### Smallest next step

Now: add one line to NOTES: "Paused until Sat Oct 10: deploy freeze and Tony's attention rule; R3 is blocked on the › answer; build after #92." Do nothing else. After Exam 2, when #92 is merged or dropped, send Tony ≤ 3 merged questions, with the › question first. Then one session builds Tony's bar swap in prod code, on a preview: main's bar fixed at the bottom on phones; one result panel above it with one full-width button (Check, then Next question); the same panel pinned to the bottom of the content column on desktop, under main's top bar; R2.5 top fixes 1–5 as Playwright checks. Then run the locked confirm round on that build: this build vs main as the control (both served locally), with a brief that says the bar position is by design. Pass = it beats main on the median and has no 4/4 blocker. Add Tony's 10-minute walk on his own iPhone (real Safari: safe area, toolbar, keyboard). Then ship, or fix one time. R4 stays unused unless the confirm round fails.

### Proposed in-place fixes (old → new)

| where | old | new |
|---|---|---|
| Stage map, new row after row 7 | (none) | "– \| prod build \| not planned. `-navmock` holds no prod file (try/ mock, NAV-MOBILE.md, 136 PNGs = 21.1 MB). A `-navmock` PR changes nothing that students see." |
| §0 goals, bullet 3 | "Phone and desktop feel like the same app (same buttons, words, places)." | "Phone and desktop feel like the same app (same buttons, words, places). Tony's lock (Oct 7) sets the bar's place: bottom on phones, top on desktop." |
| R2.2, NOTES:68 | "So R3 can fail on unity even if its medians stay at 85+." | "So R3 can fail on unity even if its medians stay at 85+. Its median is also at risk: v6 with v2's desktop unity gives median 84.5, min 13." |
| R2.3 unity, NOTES:129 | "To get 15 from every tester, the action area must match exactly: same button, same word, same place next to the content, feedback always in view." | "…feedback always in view. This is necessary but maybe not sufficient: testers take points off for the bar position by name (j1:36, j1:52, j3:38, j3:55, j2:54). Top-bar desktops averaged unity 14.75–15.75 over both rounds, right at the bar." |
| R2.5 top fix 4, NOTES:156 | "Main's › hides (or does nothing) while a pick waits for Check and while Next shows." | "Main's › hides while a pick waits for Check and while Next shows (if Tony allows; open question 1). Never a button that looks live and does nothing. The new Next calls main's own Next (`nav.js` `go(1)`)." |
| R2.5 open, NOTES:160 | "If not, main's › and the new Next must do the same thing." | "This decides every shape, full width too. With › visible, a Next above the bar is R1 v2's 'two forwards stacked' (r1-j1:29, r1-j2:28, r1-j3:25, r1-j4:27), even when both do the same thing. If › must stay, the one-forward option is: › is the Next, and only Check is new." |
| R2.5, NOTES:146 | "Carry 3. Rebuild all on main's bar (bottom on phones, top row on desktop):" | "Carry 1: the result panel with one full-width button (review 1's A). R2 did not split corner from full width (v5 = v6 = 88.5; phone parts 69.5 = 69.5). Corner only if Tony asks." |
| Review 1 #1, NOTES:173 | "If main's › must stay, drop the corner shape." | "If main's › must stay, the full-width shape fails too (R1 v2, 4/4 'two forwards stacked'). Ask Tony before any R3 build." |
| Review 1 #3, NOTES:177 | "So the goal can be met with a top bar." | "So the goal can be met with a top bar, but only at the edge: 4 of those 8 cells are exactly 15, and all 4 R2 top-bar desktops failed (min 9–13)." |
| Review 1 #5, NOTES:185 | "If a deciding cell is within 2 points of the bar, add 2 fresh testers for that variant." | "If a deciding cell is within 2 points of the bar, add 2 fresh testers only under a median rule. Under 'every tester', each added tester can only lower the min." |

### Open questions for Tony (max 3; send after Fri)

The › question is already on file two times (NOTES:160 = NOTES:222). Ask it first, one time.
1. Do we pause all nav work (R3, the build, the questions) until after Exam 2, and build only after PR D #92 is merged or dropped?
2. Unity under your bar lock: do testers score only the action area (words, icons, order, the action spot next to the answers), not where the bar sits? And does a variant pass on the median, not on "every tester"? (This merges NOTES:161 and NOTES:223.)
3. End point: do we run the confirm round on the real page (a prod build on a preview, with main as the control), not on more mock rounds? Then we do not need a `-navmock` PR (the mock + 21 MB of shots).

## NEXT — master handoff (Oct 7 11:26 PT, session ccr-2141bf71)
Status: R2 run + scribe + 5 adversarial reviews DONE. Agent work stopped by Tony. Nothing built. Nothing merged.
One-line verdict: R2 "passed" only in forms Tony's locks rule out (captioned bar, desktop bottom bar). Under the locks, nothing has passed yet. R3 is a real test, not a confirm.

### Tony picks owed (merged from reviews 2–5; answer in the kickstart's PICKS slot)
| # | pick | options | reviewers lean |
|---|---|---|---|
| P1 | Pause nav until after Exam 2 (Sat Oct 10), build only after PR D #92 merges or is dropped? | yes / no | yes (r5; #92 rewrites nav.js) |
| P2 | Main's › while Check waits, Next shows, and during the retry after a wrong pick | (a) stays live → one full-width action button, never a corner button above › · (b) hides or shows disabled → panel needs a small "Skip this one" link on the left | ask first; decides every R3 shape (r2, r3, r5) |
| P3 | Unity under the bar lock | score only the action area (words, icons, order, action spot next to the answers), bar position not scored; pass on median (or "all but one ≥ 15"); retire the ">85 raises the goal" rule for this bench | yes (r2, r3, r5) |
| P4 | Where R3 runs | real page behind a flag on a Vercel preview, main as control (no `-navmock` PR) · or more mock rounds | real page (r4, r5) |
| P5 | "Open notes" on phones when the bar is at the bottom | move above the action strip · move to the left · other | must answer before build (r4 finding 1) |
| P6 | "Phone only" means | width ≤ 700 px · main's dock test (≤ 700 px or touch, so iPads too) · and sideways phones? | — |
Minor (default if silent): typed/multi-part answers keep in-box arrows · "Explain my mistake" chip goes quiet · › gets spoken name "Skip question" · R3 phone = Safari real height 393×659 · counterbalanced order + hidden variant names · Tony does a 10-min walk on his iPhone before R3 is scored.

### Next stage (directive 13)
Re-entry at **stage 4 PLAN**: implementation + validation plan for "main's bar at the bottom on phones" as a real-page build behind a flag, plus the R3 confirm round and its brief changes. Input = Tony's picks + review 4's 13 must-holds (§ review 4) + R2.5 top fixes. One session. No build in that session.
If P1 = yes: nothing before Sat Oct 10.

### Loose ends
- Screenshots cited in R2 sections live in the old session's scratchpad (`…/scratchpad/dev/`, 46 MB) and are GONE after this session. Reports with quoted lines are in brain `_files/blind-judge/nav-r2/`.
- `-navmock` stays as is (mock + 21 MB shots). No PR.
- Tooling: `med.py` drops "/ 20" score lines; hand-check every cell next time (or fix the parser in a code stage).

### Tony's own progress audit (fill in; the next session reads this first)
- Date / time:
- Energy / state (exam week):
- What I checked myself since Oct 7:
- What I disagree with in the reviews:
- PICKS P1–P6:
- Anything else:
