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
- The rise is not general. v5 and v7 had only small phone changes (§7), and their phone parts did not move (69.5, 62). On v2–v5 and v7 together, mean phone parts went 66.1 → 65.0. Unity on the top-bar variants (v2, v3, v7) went 15.5 → 15.3.
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
- At rest, main's bar does not have more buttons than the mock bar. With a bank open it shows List, Prev and Next (plus the XP strip on desktop). Shuffle and Redo show only while the list is open, and on desktop the code box too (main nav.css:45–53, "C2 / C15"). On phones the code box is its own bottom strip (main index.html:130–133). The R3 clutter risks are elsewhere: the List button shows the bank code as a word, on phones too (main nav.js:103, nav.css:12–13; R1 called "BANK_P2X" jargon: r1-j1:131, r1-j2:21). And main's "Open notes" button is fixed at the bottom right on phones (main app.css:826–832, app.js:1893). [fixed by review 1: Shuffle, Redo and the desktop code box are hidden at rest]

## R2 adversarial review 1/5

Read: this file, nav2-j1..4, nav1-j1..4, NAV-TESTER-BRIEF, method "Variant 2", NAV-MOBILE §2/§3/§7, the shot logs (`dev/j*/log.json`), 16 shots, and main's `nav.js`, `nav.css`, `index.html`, `app.css`, `app.js` (`origin/main`). No code written. No lock re-argued.

### Findings, by severity

**High**

1. **The R3 plan breaks its own rule.** R2.3 says the action button "must not share that spot or stack right on it" (main's ›). R2.5 puts v6's corner action button in a panel "just above main's bar on phones", so it sits right on top of main's ›. Testers flagged the same stack with Ask Cluck over Check (j1:90, j2:89, j3:94, j3:95; shot j4-phone/048). On main, the "Open notes" button is also fixed at the bottom right on phones (main app.css:826–832, app.js:1893). That corner could hold 3 controls. A corner button works only if main's › hides while the button shows. Tony has not answered that yet (R2.5 open question 1).
   - Ask Tony before the R3 build. If main's › must stay, drop the corner shape.
2. **"PASS as tested" overstates R2.** Every R2 variant used the captioned bar, which Tony rejected. The 3 passing variants also had a bottom bar on desktop, which the lock rules out (R2.2). The phone part only partly transfers too. In v4 and v6 the Check/Next button is the bar's right slot (§7), and main's icon-only bar has no such slot. v5 hides the bar during the result (j2:82), which is Tony's call. So no R2 variant can be built as tested. R3 tests a new layout, so it is a real test, not a confirm.
   - The method says "any eval >85 → raise the goal" (blind-judge-method.md:56). R2 has 12 evals above 85. This file does not say if the goal rises for R3.
   - Suggested headline (scribe's call): "Score goal met on paper. Not a loop pass: no tested variant fits Tony's locks."
3. **The unity risk uses R2 data only.** R2.2 and R2.3 say every top-bar desktop got min unity 13 or less. That is true for R2. But in R1, two top-bar desktops got unity ≥ 15 from every tester: v3 17/15/15/16 and v7 16/15/15/17 (r1-j1:48/108, r1-j2:51/119, r1-j3:48/116, r1-j4:48/112). Their action sat in the same place next to the content (r1-j2:55, r1-j4:52, r1-j1:112, r1-j2:123). So the goal can be met with a top bar. In R2, v2, v3 and v7 each failed because j3 gave 13 to all three and one other tester gave 14. j3 is R2's strictest tester (mean 77.9; the other 3 average 83.1). On v1–v3 the desktop also hid the result for some testers (j3:33, j4:26, j4:41).

**Medium**

4. **Order, names and mock controls bias the close calls.** All 4 testers walked v1→v7 (`dev/j*-phone/log.json`; j1 also opened v4 once before v1). Testers compared each variant with earlier ones (j1:63, j3:67, j4:50: the first desktop click missed because the layout differed from v1's; j2:73: "same 'huh, there?' as v2"). v6, the v4 + v5 hybrid, always came right after both of its parents. The header showed each name, e.g. "Mock · 1 · Thumb button, card on desktop" (shots j4-desk/003, j4-phone/028). The page also showed a variant switcher and state buttons ("Mockup controls", shot j4-phone/051). v7 lost clutter points for covering them (j1:107, j3:113).
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
9. R2.4 says no tester flagged unlabeled icons "because the R2 bar had captions". That cause is not shown. Two testers saw the captioned bar as icons: "bar is just icons" (j1:23), "small icon-only Skip" (j3:24). This gives mild support to Tony's icon-only pick. On file only.
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
2. May main's › hide, or be disabled, while Check or Next shows? This decides whether a corner button is possible. Please answer before the R3 build.
3. Unity under "bottom = phones only": should the R3 brief tell testers that the bar position differs by design, and ask them to judge the action area? Or keep the brief as it is? R1 v3 and v7 show that 15+ is possible either way, but one strict tester can decide the result.
4. On phones, main's "Open notes" button sits at the bottom right. When main's bar moves to the bottom, where does Notes go?
