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
| v2 | 79.5 | 84 | +4.5 | 64→68 | 15.5→15.5 | one forward control + labeled Check: clutter 16/16/18/17 → 22/21/21/22 |
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
- The rise is in unity, and only where desktop got the bottom bar (v4, v5). The rest is the new v6.
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
- R1 already flagged it (r1-j2:58, r1-j4:55; fix r1-j4:131). §7 says the R2 Skip is "quiet: no fill, --muted". The shot shows a large bold "Skip ›" in that slot (shot j4-phone/028). The fix did not land.
- A small icon Skip was fine (j1:25, j2:25, j4:20; shot j4-phone/010).
- Asked fix: a disabled "Check" in that slot before a pick and after a wrong pick (j1:131, j3:138, j4:112, j4:114). Or Skip as a small link elsewhere (j2:129).
- With main's bar at the bottom, main's › sits in the bottom-right thumb spot. It is a small icon, which testers accepted. The action button must not share that spot or stack right on it.

**Wrong-pick flow**
- "Pick again. 1 more try." is clear (j1:9, j2:10, j3:60, j4:8). Keep it.
- The page "jumped" after a wrong Check where the hint sits in the page (j1:9/25/41/57/105, j3:9/26). No jump was reported for v5 or v6, where the hint docks at the bottom (j1:73, j1:89).
- v6: Ask Cluck sits right above Check in the thumb column, so a near-miss is easy (j1:90, j2:89, j3:94, j3:95; shot j4-phone/048).
- v5: "Skip for now" is as loud as Ask Cluck and sits where Next comes later (j2:74, j3:77, j4:60, j4:67). Asked fix: a quiet text link (j2:130, j3:139, j4:113). One tester liked the wording (j1:73).
- v5: the wrong footer hid the bar, so Questions and Notes vanished (j3:77).

**Unity (desktop keeps main's top bar)**
- R2 has a clean test. v1 and v2 had the same desktop: top bar, full-width sticky "Next question", "Right." hidden (shots j4-desk/003, j4-desk/006). v2's phone used the same full-width button: unity 14/18/13/17. v1's phone used a corner "Next": 9/11/9/9. So the same button shape and word on both screens is worth 4–8 points per tester.
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
- Main's bar has more buttons than the mock bar (list, shuffle, code box, redo, Prev, Next). Expect some clutter cost in R3.
