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
