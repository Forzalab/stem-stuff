# PSY Exam 3 handoff (2026-11-08)
Exam 3 = Nov 9 morning. Scope ch 7-9, study guide 33 bullets (brain socpsy/_files/socpsy-exam3/src/study-guide-ch7-9.txt).
Branch `ccr-9305c897-jipm86`, no PR (Tony's own use). Brain write was blocked this session: copy this into brain `projects/socpsy/` next time.

## Done
- `banks/BANK_PSY8.json` (3e44a1e): 247 items, diet only. 167 `text` flashcards (Ch7 43 / Ch8 57 / Ch9 63), then 80 MC, then 4 EC placeholders `PSY_8EC1..4` (answer "EC"). Schema check OK. All 33 guide bullets covered (keyword-matched table, some loose).
- Proof box rewrite (6d42054): no base/assume/prove rows. Graded against `reference`: correct / partial / wrong + one hint. Optional `proof.must` (1-4 ideas), item `len.sentences: [lo, hi]` (soft counter), item `grade: "lenient"`. Smoke OK; `strip-layers.pw` not run; `style.test` 2.7 not ok (unrelated TODO).

## Rules Tony set
- Slides = ground truth; textbook for nitty-gritty. Clash: slide wins.
- Prof writes conflicts in broad wording ("peaks at X, plateaus at Y"), no exact disputed numbers. Items hinge on pattern / rough size.
- EC graded very lenient (casual GE, points for engagement), 5-6 sentences, soft guard.
- Guide coverage first; then ~35-45% random slide/book keywords (exam 2 lesson: off-guide words like "neonatal").

## Next
1. MC-harder pass (near-miss same-chapter distractors, scenario stems) + broad wording for conflict numbers (Torrance 61/63, Milgram remote 65/66, Burger 82.5/82, psychiatrists 1/10 of 1%). If the bank has an uncommitted diff: `node tools/schema-check.mjs`, vet for two defensible choices, commit, push.
2. Convert EC1-4 to `proof`: reference = model answer, must = nice-to-haves, `grade: "lenient"`, `len: {sentences: [5, 6]}`. EC model answers lived in the session scratchpad (`card_refs.json`), lost if the container is gone: regenerate from WA3 (Cialdini 2017 six principles, Buss 2017 six conflicts) tied to ch 7-9.
3. Invariant flashcards (proof box, deduce by logic): ELM motivation x ability; informational (ambiguous, private belief) vs normative (clear, public only); lower social cost = less normative conformity; consistency (FITD) vs reciprocity (DITF); descriptive vs injunctive (energy :) study); obedience factors; exchange vs communal; investment model; attachment = anxiety x avoidance; evolution vs social role.
4. Ask Tony before converting all 167 flashcards to the proof box (167 grader calls).
5. Ask Tony for a 0-100 self-prediction before the exam; log the result after.
