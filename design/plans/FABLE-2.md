# FABLE critique #2 — B-set (student psychology), before PR B opens (Oct 7, advisor; read-only)

Read: FABLE-1.md (mine), genui-major-plan §1/§8, genui-swarm-plan D1–D71, cc-student-psych / viz-ux / humor-climate research; the PR B working tree @836cfcb (try/genui-visual.{html,js,css} A–E + every toggle, try/genui-ui.{html,js,css} v1–3 × states, try/genui-redeem.{html,js,css} v1–3, VISUAL.md, UI-UNIFY.md, GEN-QUALITY.md, SCHEMA-V2/RUNTIME/AUDIT-FRUSTRATED, cluck-author SKILL.md + rubric.md, cluck-genie-v5.md); 31 screenshots (visual-A fresh/wrong/L2/L3last/right/try2/mech/tellme + ios-sim, B, C fresh+wrong, D fresh+wrong, E ios; ui-1 wrong/out/right + ios, ui-2 wrong + ios, ui-3 wrong + ios; redeem 1–3 right/wrong; smoke-2/4, ios-safari-expanded-2-wrong); `git diff origin/main origin/<branch>` for #90 -prod, #91 -telemetry, #92 -queue (app.js, nav.js, shuffle.mjs, index.html, mode.mjs, offline.js, privacy.html, telemetry.js, tests). Verified by grep which tests pin which strings/styles (so every "tonight" diff below is honest about test risk).

## Which of my #1 fixes landed
| #1 item | Landed? | Where |
|---|---|---|
| A0-A1 cookie writes in try/catch, never at import | yes | mode.mjs `read`/`write`, `reset()` |
| A0-A2 "Updating…" on the tapped bar | yes | offline.js:145 |
| A0-C1 privacy copy (no Clarity) | yes | privacy.html |
| A0-C2 "Don't record me" opt-out | yes | privacy.html + telemetry.js `userOff` |
| A0-C3 `persistence: "localStorage"` | yes | telemetry.js:198 |
| A6 PII blanking in replay | yes, and further (masks all text, blanks PII) | telemetry.js:204; privacy.html says so |
| A0-D1 any re-showing of a finished Q = fresh round | yes | nav.js `upNext` `again && code !== cur` |
| A0-D2 migration stagger | yes | shuffle.mjs `qMigrate` `NEAR + PULL * k++` |
| A0-D3 "Ask Tony" → "Out of tries for now. This one comes back around." | yes (both sites) | app.js:898, :1079 |
| A0-D4 title-derived topic | yes | nav.js `group()` / `topicOf` |
| A4 spam guard (<2 s) | yes, with one hole (B0 #1) | nav.js `SPAM_MS`, shuffle.mjs `qAnswer` |
| A1#2 bet first-pick only, retry free | yes in V and U | genui-visual.js `check()`, genui-ui.js `commit()` |
| A1#12 QUACK never line 1 | yes in mocks + v5; NOT in serve.py nudges | serve.py:49–51 still QUACK-first |
| C3 disclaimer replaces "verify b4 use lol" | mocks only; prod keeps it (easy.pw.mjs:303 pins it) | — |
| C7 rules → skill | yes | SKILL.md §1 |

---------------------------------------------------------------------
## B0 — #92's shipped student-facing copy/behaviour vs §1

VERDICT: **SHIP.** Two one-line fixes worth riding along; nothing violates §1.

1. **A fast RIGHT answer on a Redeem keeps the Redeem owed.** shuffle.mjs `qAnswer`: `if (spam) { s.first = "spam"; …; return false; }` runs before `s.owe = false`. She sees the half-box question come back, remembers it, taps c + Check inside 2 s → `comeback()` fires "Comeback! Missed it before. Got it now." (rewards use `stemRedo.has`), yet the queue still owes the miss and shows it AGAIN 8 slots later, still as a Redeem. Her: "I got it. Why is it back?" (pain #9 with a new face; §1 #5 the loop never closes). You cannot guess right by spamming on 5 numeric choices, so a fast right is never spam. FIX (shuffle.mjs `qAnswer`, 1 token): `if (spam && !right) {`. The existing test (`spam: true` with `right: false`) still passes; add one line: `qAnswer(st, c, true, {spam:true})` → `owe === false`.
2. **Screen-reader strings still say the banned words.** app.js:97 `verdictWords`: "No tries left." and "Wrong. 1 try left." (`say()` only; render.pw.mjs:503 asserts the words are NOT on screen, nothing pins them in `#sr`). FIX (copy-only, 2 strings): `"Out of tries for now. This one comes back around."` and `"Not yet. 1 try left."`. (The list-row labels "No tries left." in nav.js `marks()` ARE pinned by done.pw.mjs:119/134/136 — leave those tonight.)
3. **Lock line** "Out of tries for now. This one comes back around." — true (the queue does it), forgiving, no human-as-failure. Ship. It still sits under the red dashed X'd row (app.css:277–279, prod, not #92's) and after the multi-part "✕ 1 of 3 right." line; that is the next PR's job (B6).
4. **Comeback toast** "Comeback!" / "Missed it before. Got it now." — fires only on a right first pick of an owed Redeem (`redeem !== false`), never for a plain re-showing (D1 fix). Names the past miss as fact, not pity (§1 #2), lands in an affirm moment (humor rule e). Ship. One nit for later: it fires on top of the XP burst; two toasts stacked on one win is the only place the page gets loud.
5. **Queue feel.** First open of a bank = the file's first question (author's order), then the queue; a miss returns after 3 fresh ones (never two Redeems adjacent after migration); Next never disables; a finished bank goes round again as fresh rounds that pay nothing. §1 check: no "didn't I just do this" inside 3 slots; the return is announced by the lock line. Two feels to price: (a) tonight the return is SILENT (chip waits for Tony's pick): the Redeem looks like a plain question; fine for Exam 2, because the lock line already promised it; (b) after one full pass on a 19-Q bank every Next is an unpaid re-ask with no sign that the set is done. Not a §1 violation, but an extinction burst ("it's broken / repeating") — see B3 fix 3 ("That's the set.") for PR B, not tonight.
6. **Guess-spam feel**: a wrong pick inside 2 s owes nothing and comes back in 8 (a skip). Good: no Redeem flood from tapping. Keep.
7. Prod-only, unchanged by #92 but on tonight's path: `.opt.wrong` red dashed + X + line-through, POOF first line, 15 s stream, "Tap here to write notes." tooltip over the key formulas (smoke-2-wrong.png shows all four). Known, owned by U/K/prompt; not blocking #92.

---------------------------------------------------------------------
## B1 — Walk-through: variant A, then the worst variant of each page

Her: 26, first-gen, 23:50, bus home, Phys 2A midterm Thursday, "not a physics person", iPhone, Safari.

### genui-visual ?v=A (partial sheet + live figure + warm-up)
| t | What she sees | What she feels | Verdict |
|---|---|---|---|
| 0 s | "Warm-up, 5 s. Work is the area under the force line. One grid square is 2.5 m wide and 1.0 N tall. [Got it]" + a yellow "1 square" box on the figure | "5 s" reads as a stopwatch before she has read a word (banned: shaming timers, by shape not intent). The card also hands her the method before the pick, so the pick stops being a prediction on this exact skill (Crouch: predict first). Lower threat for Q1, a toll by Q3. | Keep the card for the FIRST question of a new topic only (the D59 least-seen-topic slot); never label it with seconds: "Quick note" |
| 3 s | Stem, figure, "Find the net work (in N·m)"; choices a, b above the fold, c–e below; thumb bar [Just tell me] [Check (disabled)] | The only live big button on the screen is the skip. At midnight that is a sign saying "exit here". Not judged; tempted. | Before a choice is selected, render "Just tell me" as a text link (still visible, D18 kept), full button once a choice is selected |
| 8 s | "I'm sure · bet on this first pick: right +3 to +5, wrong −1" | "bet"? "I'm never sure." She leaves it. If she ticks and misses, a red "−1" chip appears beside ★ 12 — the only red on the screen, next to her score, at the exact moment of the confident error (B2). | B2 |
| 9 s | Check → the sheet rises, the page scrolls so the figure sits above it; dashed "your 80 J" box around the solid true shape; line "Tricky one. Your 80 J (dashed) counts the slope as a full box." [Show me]; then "Cluck can slip. Check the key. Keep private stuff out of the chat."; thumb [Just tell me] [Try again] | The aha lands with zero taps, ~0.3 s: the dashed box is visibly bigger. No X, no red, score unchanged. Her pick row is now hidden under the sheet (she cannot see which letter she picked). Then the sheet tells her the thing that just corrected her "can slip", and warns her about a chat that is not on this sheet. | Disclaimer: under the fold, only when the ask field is present (C3 #7). "(dashed)" is UI jargon inside the sentence; the label is already on the figure |
| 15 s | [Show me] → L2: handle at her corner; "Your rectangle is right. A triangle is half its box." "Grab the corner and pull it down onto the line. Watch your box shrink." + underbraced math | Praise of the right part (§1 #11) lands here, not at L1 in `t=short`. The drag is a bonus; she will not drag on a bus (Tse). Two imperatives in a row ("Grab… Watch…") is the first "you should" smell. | Put "Your rectangle is right." in L1 for `short` too (it is the wise-feedback half); keep the drag line |
| 25 s | [Try again] → picks c → "You halved the triangle this time. That's the move on the exam." + "QUACK. Triangles: the half-price boxes of physics." + thumbnail; Next live | The win has words and names her fix. "this time" points back at the miss. The joke is on its own line, content pun, fine for a 26-year-old — once. It is wired to EVERY right answer (both V and U), so by Q4 it is a tic. | Drop "this time"; joke slot filled 1 in 4 by code hash |
| 2nd miss (try=2) | Two dashed boxes, two pills "your 40 J" and "your 80 J" side by side at the top of HER figure | Two of her wrong numbers pinned with "your" = a ledger inside the picture. The second "your" is the second verdict. | When the 2nd ghost lands, the 1st fades to 35 % and loses its pill; the line names only the new one |
| last try (last=1) | L3: "This one trips most people: the triangle is half its box. Here is the whole thing." `(4·4 + ½·4·4) squares = 24 × 2.5 J = 60 J`, Answer c) 60 J, "It'll come back around in a few questions, with fresh tries." [Try a twin] [Next] | Forgiving, closes with a promise and a choice. But "× 2.5 J" appears from nowhere: in E (no warm-up) nothing on the page ever says a square is 2.5 J. "This makes no sense" → she pastes the question into ChatGPT. There is NO ask field on A's sheet (prod has one) — her one in-app way to ask "why 2.5" is gone. | V's `TEX_L3` → U's four steps (U's step 3 is "One square (2.5 m)(1.0 N) = 2.5 J"); add the ask field under the fold (U has it) |
| tell-me on | "You turned on tell-me mode. Try it yourself instead" | It turned itself on after 3 skips; "You turned on" blames her for a setting she never chose. | "Tell-me mode is on." (B5) |

Judged: nowhere by colour or icon (good); mildly by copy ("this time", "You turned on", the second "your"). Bored: the warm-up card and "Tricky one." as the opener on d AND a (and "trips lots/most people" ×3 across levels): by Q4 the formula reads as "everything is tricky, everyone fails" — the Rattan low-expectations comfort by repetition. ChatGPT: at L3 in E (unexplained 2.5 J, no ask field) and whenever the sheet covers her pick row and she wants to re-read what she chose.

### Worst of genui-visual: **B** (full sheet), with **D** a close second
- B: on Check the whole screen becomes the sheet; the question, her pick row and the choices are gone; the close X sits in the TOP-RIGHT corner (viz rule 8 and pain #6); [Try again] closes the sheet, so the lesson vanishes while she re-picks; the bottom 40 % of the sheet is empty on an iPhone. Her: "It took me into a side room and I can't see what I picked." Not judged; isolated. FIX: B is the control, not a candidate; drop from round 2.
- D: before she has read the question a yellow polygon and a dot are already drawn over the figure with "Before you pick: drag the yellow dot to the shape you would count from B to C." A second prediction on top of the pick (rule 1 says the pick IS the prediction), a chore by Q3; the chat card then lands below the choices with a COPY of the figure, so the aha needs a scroll (not zero-touch). Bored by the toll, tempted by the scroll.
- C: "Gut call first: from B to C, the area is… [a full box] [half a box] [not sure]" leaks the lesson ("half a box") before the pick and offers a shrug chip the apathetic 60 % will tap. But C's LAYOUT (figure sticks, Cluck's panel is a divider inside the card, no sheet chrome, no X) is the cleanest of the five. FIX: if the partial sheet fails real iOS (svh + toolbar), C's layout with A/E's pick-is-prediction is the fallback.

### Worst of genui-ui: **v2** (ante)
- "Bet 2 coins on your first pick? [Put 2 down]" sits under the choices before she has read them; one tap on a choice COMMITS (no Check) — a scroll-tap on iOS submits an answer she did not mean; after a loss the HUD shows 10 where it showed 12 (she paid first, but the number on screen is still lower than when she started = a drop by another route) and "Those 2 stay on the table." is casino English; the ghost copy is below the sheet's fold on Safari expanded (U measured: top third of the figure only), so the aha is behind a scroll. For a Pell student on a capped plan "coins on the table" is not playful.
- v1: HUD "11 −1" after sure+wrong: the main count went 12 → 11 (U's SHAME CHECK says "never animates down"; it does not animate, it is simply lower). Otherwise v1 is the best layout: figure scrolled above the sheet, ghost on HER figure, [Try again][Just tell me] inside the sheet, peek bar "Cluck: read it again" instead of a close, steps folded.
- v3: nothing covers the question (honest), but the ghost is on the figure ABOVE the choices, so while she reads Cluck's card the ghost is ~600 px off-screen: the aha costs a scroll. On ios-sim the fixed strip covers the "Ask about a step" row.

### Worst of genui-redeem: **v3** (coin beside Check)
- "+3 waiting" sits next to the button she has not tapped yet: a reward dangled before the attempt = pressure ("don't blow it"); on a miss the words "Still yours. Comes back later." replace the primary action's neighbour. v2's idle line "Back from earlier. Get it now for +3." is an imperative plus a bribe before she reads the stem. v1's chip "↻ Redeem +3" in the label row is a tag, not a lure; v1's wrong state "Comes back later" is the calmest copy of the nine — but its icon is a circle with an x inside (`i-redo`), which reads as "✕ failed" at a glance on a muted chip. FIX: v1 with `i-retry` (plain arrow) in the later state.

---------------------------------------------------------------------
## B2 — The "I'm sure" bet as built

As built: V = tick, first pick only, sure+wrong → red "−1" chip beside ★ (main score unchanged), sure+right → random +3..+5; U v1 = +2/−1 (main count drops); U v2 = ante 2 coins, +4 back or "stay on the table"; U v3 = +2 if right, nothing if not. Retry is free everywhere (A1#2 held).

Does it trigger the core wound on a confident error? **Yes, by design.** The confident error is both the best learning moment (Metcalfe hypercorrection) and the deepest shame moment ("I was SURE and still wrong" = the proof she fears). All three stake variants mark THAT moment with the only red on the screen (V) or a lower number (U v1/v2). The research case for confidence bets (Inquizitive) is points that count toward a grade; here coins are cosmetic, so the deduction's only job is to make the tick honest, and it buys that honesty with the one emotion §1 says we cannot afford.

Is it a gambling loop? With first-pick-only and no double-or-nothing: **no chase, so no loop** — D53 is correctly dead. But V's random +3..+5 on a self-declared "sure" is a variable-ratio reward attached to a self-report: the tick is the slot pull. And the EV is positive in every variant (+2/−1, +3..5/−1), so always-ticking is the rational strategy; by Q3 the tick stops meaning confidence, `sure` telemetry becomes noise, and every wrong pick (~40 %) becomes a −1 event. The bet then IS "a score that drops on screen", 4 times in 10.

Safest variant: **U v3's mechanic in v1's layout** — "I'm sure: +2 if right", fixed, nothing on a miss. It keeps the metacognitive signal (sure+wrong is logged, the D40 purpose) and lets Cluck use the hypercorrection moment warmly: when `sure && wrong`, line 1 gets one extra sentence, "You were sure, so this one is worth a hard look." Rename everywhere: never "bet", "coins", "table", "put down"; it is a confidence tick. If Tony insists on a stake: cap −1, muted not red, never the main count, and NOT during Exam 2 week (first contact with the new UI must not be a loss event). VERDICT: **ship the tick, do not ship the stake.** FIX: genui-visual.js `check()` drop the `#seg` block; `right()` `g = 2` fixed; `.sure-why` → "+2 if you're right"; genui-ui.js `commit()` remove `S.coins -= 1` (v1) and the v2 branch; VISUAL.md/UI-UNIFY.md §4 note "D52 deduction not built: Fable B2".

---------------------------------------------------------------------
## B3 — Redeem chip + fixed +3 burst + hidden queue

Slot-machine ingredients: variable-ratio reward, a lure before the pull, near-miss framing, loss chasing, no stopping point, fast cycles. Against the build:
- Fixed +3, never random (D60) ✓. No loss, "never lost" (D61) ✓. No near-miss copy ✓ ("Not this time. Nothing lost…").
- Return gap 3/8/20 is a VARIABLE INTERVAL (the engine of both slot machines and Anki). What makes it Anki and not a slot: the return is announced ("comes back around"), fixed in value, and framed as closing a lesson. The copy does this ("This one came back. You've seen the half-box idea before." — technique 2 + 5). Healthy as long as the chip is a TAG, not a LURE.
- Lure: v3 "+3 waiting" beside Check and v2 "Get it now for +3" put the reward before the attempt. That is the line. **v3 crosses it; v2 leans on it in words; v1 does not.**
- No stopping point ✗: Next never disables, the queue never runs dry, a finished bank replays right answers as unpaid fresh rounds. Infinite scroll without the payout = extinction burst; she quits feeling the app broke, not that she finished. FIX (nav.js `go()`/`upNext`, one toast via `say()` + the existing toast fx): on the first pick after every real question has had a first pick → "That's the set. Round two is spaced review." Pair with the D46 micro-session (not built): after 5 real questions, one quiet line "Good place to stop. Comebacks are saved." The forgiving loop (§1 #9) needs a door, not just no guilt.
- Stacking: the migration stagger (one per 4 slots) prevents the Redeem treadmill ✓; a Redeem streak counter would cross the line — do not add one.
VERDICT: **healthy reinforcement; pick v1; the line is crossed by v3's pre-answer coin and by any random amount.**

---------------------------------------------------------------------
## B4 — Cluck's voice to a 26-year-old working adult (lines named)

Patronizing or cringe when: (1) praise is trivial or automatic, (2) a formula repeats, (3) the duck talks about her instead of the physics, (4) money/gambling words, (5) a setting is blamed on her, (6) the app undercuts itself right after correcting her.

Mockups (V + U + redeem):
- "Tricky one." opens d AND a; "This one trips lots of people / most people" appears at L1 (b), L3 and out. Across a 10-Q session she will hear "tricky / trips most people" ~8 times → "everyone fails this" = Rattan comfort by repetition (humor rule g). FIX: normalize at most once per question, rotate 4 openers per bank, and only normalize when the slip is actually common (KWV d yes; a mechanical units slip no).
- "Your 80 J (dashed) counts the slope as a full box." — "(dashed)" is interface vocabulary inside the lesson sentence. → "Your 80 J counts the slope as a full box. That's the dashed one."
- "You halved the triangle this time." → drop "this time" (points at the miss during the win).
- "QUACK. Triangles: the half-price boxes of physics." on every right answer → 1 in 4 (rule d). The pun itself is fine for 26.
- "Warm-up, 5 s." → reads as a timer. "Quick note".
- "You turned on tell-me mode." → "Tell-me mode is on." (she did not).
- "Cluck can slip. Check the key." directly under the correcting line, on every sheet, even without a chat → under the fold, once, only with the ask field. "Check the key" assumes a key she does not have → "When in doubt, trust the steps."
- UI v2: "Bet 2 coins", "Put 2 down", "Those 2 stay on the table", "Your 2 came back with 2 more." → casino register; cut with the stake (B2).
- Redeem v2 idle "Back from earlier. Get it now for +3." → imperative + bribe. v1/v3 "Redeem +3" tag is fine. "Got it this time. Splitting the shape was the move." good; "Not this time. Nothing lost: it comes back later, still worth +3." good.
- Redeem v1 "Comes back later" with the circled-x glyph: the icon says "failed" while the words say "later". Swap the glyph.
- Prod nudges (serve.py:49–51), shown on tick-all wrong picks: "QUACK. Put your answer back in. Does it work?" / "QUACK. You found the false ones. One fix is wrong. Redo its math." / "QUACK. Some taps are wrong. Check each row again." — QUACK as the first word of a wrong-pick message (A1#12, §1 #8 dose). Copy-only fix: move QUACK to the end or drop it; no test pins these strings.
- Prod quack-only replies (serve.py:1115–1122, "Quack quack quack. (shrugs both wings)…"): if these ever answer a sincere off-topic ask, a 26-year-old reads it as being stonewalled by a mascot. Verify the trigger is narrow (only when she types nothing but quacks); otherwise one plain line first, then the quack.

cluck-genie-v5 + the 9 re-gens (GEN-QUALITY.md):
- Opener formula 9/9: "This one trips people because…" (5) or "You caught/spotted that…" (4). Praise-first on every reply is the ChatGPT "Great question!" smell in a duck suit; a working adult notices being buttered up by turn 3. FIX in the skill §1 #4: praise the right part only when there IS a specific right part; else open with the fact. Add an opener-shape rotation (4 shapes) and K's own proposed n-gram check.
- Trivial praise = patronizing: phys_symbolic "You spotted that gravity pushes down on the child, and that part is right." (everyone spots gravity); calc_rates "You caught that the ladder length stays fixed… Many people miss that part." (double pat).
- Chatbot tic: "Want a hint, or would you like to try again?" / "Want a hint, or a retry?" 9/9. Rotate: "Hint or retry?", "Another go?", "Want the next step?" — and in the UI the strip IS the choice, so the question is redundant there (V's page already drops it).
- Belief-as-fact: phys_vector "as if they pointed the same way" (K flagged). Rubric gap stays; add "as if" to the warn list.
- L3 sign-off in the prompt: "Twin or next? This one comes back around." — "twin" is our jargon. "Another like it, or next?"
- v5 itself: good. "Audience: community college students in Fresno taking physics as a general requirement" is not shown to her; fine. The hint rewrite "That's the no-friction answer. Friction takes a share." is the right register.
- What is NOT cringe: "QUACK" as texture after the lesson (D68), one content pun after a win, "That's the move on the exam", "Nothing lost", "comes back around". The duck is fine; the duck's tics are the risk.

---------------------------------------------------------------------
## B5 — Reveal spectrum + "Just tell me" + tell-me pref

Rescue: yes. L1 = zero-touch picture; L2 behind one tap; L3 behind one more; the lock offers twin/next and the promise; nothing is a dead end. Worked examples first is GOOD for a novice two days before an exam (expertise reversal), so "tell me everything" is not helplessness per se — the helplessness is in the COUNTER and the PERSISTENCE as built (genui-visual.js):
1. **The counter punishes the design goal.** `skip()` fires on Retry, Next and Just-tell-me whenever the handle was not touched (`!S.touched`). The intended behaviour — aha with ZERO touches (viz rule 2), then retry or Next — is counted as a skip. Three successful zero-touch ahas in a row → `stem-tellme=1` forever (localStorage) → every later wrong pick opens at L3 with the boxed answer → the retry is theatre again, the exact prod failure we are fixing. FIX: a skip = "Just tell me" tapped at L1/L2 before any retry, only. Retry and Next are never skips.
2. **"Just tell me" before any pick counts as a skip** (`tellme()`: `if (!S.picks.length) skip("tellme")`). Reading three worked examples cold on exam eve is a legitimate study mode, not a skip of a visual. Count it separately (`tellme_cold`), never toward the pref.
3. **The pref never expires and has one small exit** ("Try it yourself instead", shown only before a pick or as a muted note in the sheet; a handle grab resets the counter but does not turn PREF off). FIX: sessionStorage, not localStorage (tomorrow starts fresh = §1 #9); and three automatic flip-back signals: (a) two right FIRST picks in a row while in tell-me → off, with one line and a choice: "Two in a row. Try before the answer next time? [Sure] [Keep tell-me]"; (b) a retry-right or a handle grab → off; (c) a Redeem return always opens at L1 regardless of PREF (SCHEMA-V2 §5 says so; the mock's `S.lvl = PREF ? 3 : …` puts PREF first — order it after `redeem`).
4. **The skip button outranks the attempt before a pick** (B1 t=3 s): the only enabled big button on a fresh question is "Just tell me". A text link before a choice is selected, a button after. D18's "always visible" survives.
5. Copy: "You turned on tell-me mode." → "Tell-me mode is on." (B4).
What flips her back, in one line: a win she did not need the answer for. Make the app notice it (3a), say it once, and hand her the choice.

---------------------------------------------------------------------
## B6 — The single change that most raises "reopen tomorrow", and what is tonight-safe

The single change: **her pick never turns red.** In prod (smoke-2-wrong.png, ios-safari-expanded-2-wrong.png) every wrong pick (~40 % of picks) paints a red dashed border, a red ✕ badge and a red line-through, and the list keeps a ✕✕ ledger. It is the last thing on screen at the end of most questions and the peak-end of her session (F's #4: "7 of 10 rows in her list are red ✕✕"). U's `.opt.mine` (dashed `--edge`, dashed badge, "your pick") is the replacement and passed Impeccable.
- It is NOT tonight-safe as copy-only: tests/swap.pw.mjs:251–252 asserts the computed border colour `rgb(255, 122, 122)` and `line-through` on `.opt.wrong`; tests/done.pw.mjs:130 asserts `line-through` on gone list rows. Shipping it needs app.css:277–279 (+298–301 for tick-all) + app.js:736/760/999 (`icon("i-x")` → the letter badge) + those two test lines. That is the first PR after Exam 2, or PR B if Tony wants it Thursday night.

Tonight-safe, copy-only, zero test risk (verified: nothing pins these strings), rides on #92 (app.js) and #90/#91 (serve.py):
```diff
--- a/app.js   (#92 -queue)
-const verdictWords = r => r.verdict === "correct" ? "Correct." : r.verdict === "locked" || (r.verdict === "wrong" && r.triesLeft <= 0) ? "No tries left."
-  : r.verdict === "wrong" ? "Wrong. 1 try left." : "";
+const verdictWords = r => r.verdict === "correct" ? "Correct." : r.verdict === "locked" || (r.verdict === "wrong" && r.triesLeft <= 0) ? "Out of tries for now. This one comes back around."
+  : r.verdict === "wrong" ? "Not yet. 1 try left." : "";
--- a/serve.py   (#90 or #91; strings only)
-DEFAULT_NUDGE = "QUACK. Put your answer back in. Does it work?"
-FIX_NUDGE = "QUACK. You found the false ones. One fix is wrong. Redo its math."
-NONE_MISS = "QUACK. Some taps are wrong. Check each row again."
+DEFAULT_NUDGE = "Put your answer back in. Does it work? QUACK."
+FIX_NUDGE = "You found the false ones. One fix is off. Redo its math. QUACK."
+NONE_MISS = "Some taps are off. Check each row again. QUACK."
--- a/shuffle.mjs   (#92; 1 token, not copy but the B0 #1 bug)
-  if (spam) { s.first = "spam"; s.spam = (s.spam || 0) + 1; return false; }
+  if (spam && !right) { s.first = "spam"; s.spam = (s.spam || 0) + 1; return false; }
```
(render.pw.mjs:503 asserts "Wrong. 1 try left" is absent from `#ph1` — still true. tests/test_serve.py does not pin the nudges. shuffle.test.mjs:176–182 passes `spam:true, right:false` — unchanged.)

Honest note: none of the tonight-safe lines moves the reopen needle by itself; the lock line (already landed) is tonight's real win. The red pick, the first-line voice (v5) and the 0.3 s ghost are the three that move it, and all three are PR B / after Exam 2.

---------------------------------------------------------------------
## Tony's picks
- **(a) visual A vs E vs C:** **E.** The warm-up (A) is a toll that also pre-tells the skill; keep the card for the first question of a new topic only. C's chips leak the lesson; C's in-card layout is the fallback if the partial sheet fails real iOS. B and D out.
- **(b) UI 1/2/3:** **v1's layout** (sheet + figure scrolled above it + peek bar) **with v3's tick mechanic** (+2 if right, nothing on a miss) — i.e. v1 minus the −1. v2 (ante, one-tap commit, ghost below the fold) out.
- **(c) redeem 1/2/3:** **v1**, with the "Comes back later" glyph changed from the circled-x to the plain retry arrow. v3 dangles the reward before the attempt; v2's "Get it now" is a bribe.
- **(d) ship the bet:** **No stake.** Ship the confidence tick (fixed +2, never a loss, never red, never "bet/coins"), and feed `sure && wrong` to Cluck's line 1 ("You were sure, so this one is worth a hard look."). No random amount.
- **(e) CLUCK_GENIE → v5:** **after Exam 2.** The prompt is a clear win (0/9 → 6/9) but v5 assumes LEVEL and L2/L3 surfaces prod does not have (no "Just tell me", no hint button; "Hint or retry?" invites a tap that does not exist), it needs `explain_prompt`/`max_tokens` edits (not copy-only), and the first contact with a changed Cluck should not be the exam-eve peak. Friday night, with the LEVEL line (3 when `triesLeft == 0`, else 1).

---------------------------------------------------------------------
## Top fixes, ranked (severity: 3 = reopen-tomorrow at stake)
| # | Sev | Fix | File |
|---|---|---|---|
| 1 | 3 | Skip counter: only "Just tell me" at L1/L2 counts; Retry/Next never; pref in sessionStorage; auto-off after 2 right first picks (with a choice); Redeem return → L1 before PREF | try/genui-visual.js `skip()`, `tellme()`, `check()` `S.lvl` line; RUNTIME §6; TELEMETRY `tellme_on.via` |
| 2 | 3 | Her pick never red: `.opt.mine` replaces `.opt.wrong` styling + the ✕ badge; update swap.pw.mjs:252, done.pw.mjs:130 | app.css:277–279/298–301, app.js:736/760/999, 2 test lines (post-Exam-2 PR) |
| 3 | 3 | No stake on the bet: drop `#seg`/−1 and the random +3..+5; fixed +2; rename; `sure&&wrong` → one warm Cluck line | genui-visual.js `check()/right()`, genui-ui.js `commit()`, VISUAL.md §4, UI-UNIFY §1 |
| 4 | 2 | L3 explains the 2.5 J square (use U's 4 steps) + the ask field under the fold in A/E | genui-visual.js `TEX_L3`, `cluckHTML()` |
| 5 | 2 | Opener/normalize rotation + "Your rectangle is right." in L1 for `short`; joke 1 in 4; drop "this time" | genui-visual.js `LINE`, `right()`; genui-ui.js `L1`, `affirm()`; SKILL.md §1 #3–4, §6 |
| 6 | 2 | Disclaimer under the fold, once, only with the ask field; "(dashed)" out of the sentence; "Tell-me mode is on."; "Quick note" not "5 s" | genui-visual.js `cluckHTML()`, html `#demo`, `#tmPref`; genui-ui.js `cluckHTML()` |
| 7 | 2 | "That's the set. Round two is spaced review." on the first wrap; a stop line after 5 real questions (D46) | nav.js `upNext()`/`go()` (PR after Exam 2) |
| 8 | 2 | Before a choice is selected, "Just tell me" is a text link; "Just tell me" cold = `tellme_cold`, not a skip | genui-visual.js `#thumb`, `tellme()` |
| 9 | 2 | 2nd ghost: the 1st fades (35 %, no pill) | genui-visual.js `overlay()` |
| 10 | 1 | Redeem v1 later-state glyph `i-retry`; cut v2's "Get it now" | genui-redeem.js `chip()`, `line()` |
| 11 | 1 | B0 #1 spam && !right; SR strings; serve.py nudges QUACK-last (the B6 diff) | shuffle.mjs, app.js:97, serve.py:49–51 (tonight) |
| 12 | 1 | v5/skill: trivial-praise rule, "as if" warn, "Another like it, or next?", 4 opener shapes | SKILL.md §1/§2/§6, rubric.md |

---------------------------------------------------------------------
## SHAME CHECK (for what this critique asks to ship: #90/#91/#92 + the B6 diff)
1. Wrong pick, her voice tonight: "Still crossed out in red, but it says it comes back around, and when I got the comeback it told me so."
2. Banned items still on tonight's path: the lone red ✕ + line-through on her pick and the ✕✕ list ledger (prod CSS, fix #2, post-Exam-2); POOF first line (prompt, pick e); the SR "Wrong." (gone with the B6 diff). In the mockups: the red "−1" segment (V) and the dropping count (U v1/v2) — gone with pick (d).
3. Techniques: 5 error = a step (Redeem with fresh tries, D1 fix: every return is answerable); 9 forgiving (never lost, no adjacent Redeems, "comes back around"); 2 normalize-as-fact (Comeback toast names the miss plainly); 6 private (opt-out + PII blanking, no human named as the remedy on the question path); 8 dose (nudges QUACK-last).
4. Reopen tomorrow? Tonight's PRs make the END of a question forgiving (lock line, comeback). The START of the next wrong pick is still red; that is fix #2. The mockups, with fixes 1/3/4/5, are the version she reopens: the miss is drawn, not marked; the win has words; nothing she did not choose costs her anything.
5. Seconds + taps to the aha: prod tonight unchanged (≈17 s + 3 taps, F); mockup A/E: 1 tap + ~0.3 s on iPhone (V measured), ~0.6 s mid-Android (estimate), 0 extra touches — as long as fix #1 stops counting that as a skip.
