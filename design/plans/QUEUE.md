# The question queue (PR D: D49, D50, D56–D64)

Next no longer walks a shuffled list. It asks a hidden queue what to play next, like a music app's "up next": nobody sees the
queue, there is no button for it (D57), and the student only ever presses Next. Code: `shuffle.mjs` (pure: `qPick`, `qShow`,
`qAnswer`, `qMigrate`, `qLoad`, `qSave`), wired in `nav.js`. Tests: `tests/shuffle.test.mjs` (the algorithm),
`tests/queue-walk.pw.mjs` (20 answers on a real bank in a browser, with a reload).

Removed with it: the Shuffle button `#qshuf` (D63; the queue already mixes topics) and "Redo my misses" (D50; the queue brings
misses back on its own, at the right time, one at a time).

## State

One queue per bank, never mixed across subjects (D64): localStorage `stem-q-<BANK>` (an upload: `stem-q-upload`).

```
{ v: 1, salt, pos, seen: { CODE: { n, right, miss, last, wait, gapIdx, owe, first, redeem, retry, retryRight } }, hist: [{ c, r, redeem }], at }
```

- `pos`: how many showings so far. The next slot is `pos + 1`.
- `seen[code]`: `n` showings, `right` / `miss` first picks, `last` = the slot it was last shown, `wait` = how many other questions
  must pass before it may come back, `gapIdx` = which miss gap is next, `owe` = its last first pick was wrong (a Redeem is owed),
  `first` = this showing's first pick (null until one lands), `redeem` = this showing came back owing a miss.
- `hist` + `at`: what was shown, for Prev and for Next after Prev (history first, then new picks). A reload lands on the same
  question (the server's resume pointer) and the same `at`; history steps are never new showings.
- `salt`: a random string made once per bank per browser. It only breaks ties, so the order cannot be guessed from the codes
  and two students don't see the same order, while the same state always gives the same pick (tests).

## The pick (`qPick`)

Topic = the question's `topic` or `parent` when the bank has one, else `family(code)` (prefix + first suffix letter,
`PHYS_U8BA` → `PHYS_U`). Today's banks have no topic field, so the fallback is what runs.

The pool is the bank's real questions (sugar snacks are not in it; see below). Let `n` = pool size and `t` = the next slot.

1. **Never the same code within 3.** A code shown in the last 3 slots can't be picked (tiny banks: the last `n − 1`).
2. **A due miss first.** A question that owes a miss and whose wait is over goes first (the one due earliest). A wrong first
   pick waits **3** others, the next wrong on its comeback **8**, then **20** (and 20 after that) (D58). A right first pick on
   the comeback pays the miss off and resets the gaps.
3. **Every 4th slot pulls the least-seen topic** (D59): the topic with the fewest showings per question gets this slot, even
   when another topic scores higher. A due miss still wins the slot (so the 3 / 8 / 20 gaps stay exact).
4. **Else the best score** among the questions whose wait is over:
   `score = topic deficit + fresh bonus + 0.5 × misses − 0.5 × rights`, where topic deficit = (most-seen topic's average
   showings) − (this topic's average showings), fresh bonus = 1 for a never-shown question. Least-seen topics rise; fresh
   questions come before repeats; weak questions float, strong ones sink.
5. **Else the soonest due** (nothing is ready: a small bank late in a session). Next never runs dry.

Waits: a right first pick rests **30** others (pushed far back); a showing with no pick at all (Next straight away) rests 8 and
owes nothing. **Tiny banks:** every wait and the no-repeat window are capped at `n − 1`, so a 5-question bank plays its miss again
after 4 others at most, and a 1-question bank repeats itself.

**Only the first pick of a showing counts** (Fable fix). `qAnswer` sets `first` once per showing. A retry-right after the
ghost is logged (`retry`, `retryRight`) and changes nothing: a wrong-then-right question still comes back after 3. Re-rank
after every answer (D62): the next pick is computed when Next is pressed, from the state as it is then.

## Redeem (D60, D61)

A question that comes back owing a miss is a **Redeem showing**: its history item carries `redeem: true`
(`window.stemQueue.item()`). It is graded fresh, in its own server namespace (`serve.py` grade `round`, the old Redo
mechanism) and its own done record (offline.js `r:`), so the old lockout and marks stay as they were and the question can be
answered again. Wrong: no penalty (no +1 farming), it comes back on the next gap. Right: today the existing "Comeback!" toast;
later a fixed +3 burst (never random: the bet is the only variable reward). **Prod ships only the flag.** The visible "Redeem +3"
chip waits for Tony's pick of `try/genui-redeem.html`.

## Snacks (sugar mode)

A snack rides right in front of its real the first time that real is played, unless the rewards say the student is cruising
(`stemSkipSnack`, as before). The real follows on the next Next. Snacks count as showings (they move `pos`), so a miss due
behind a snack + real pair comes back one slot late.

## Migration (old progress)

The first open of a bank under the queue (no `stem-q-<BANK>` yet) reads the marks already saved (this browser's records, else
the server's): a right first try rests far back; any miss (wrong tries, or out) owes a Redeem and comes back after a warm-up of 3
fresh questions. Nothing is wiped. The old `stem-order` seed is no longer read for the question order (MC choices still use
their own seed). The question list remains as a jump index in one fixed salted per-bank order (it never moves under you),
snacks above their real.

## Trace: 30 answers, seeded

A 16-question bank (4 topics × 4), salt `trace`, answers from a seeded generator (65% right on a first showing, 60% on a
Redeem; half of the wrong picks get a retry-right). Script: `node <scratch>/trace.mjs shuffle.mjs` (in the PR notes).
"why": `score`, `topic` (the 4th-slot pull), `miss` (a due miss), `soonest`.

| slot | code | topic | why | redeem | first pick | then |
|---:|---|---|---|:---:|---|---|
| 1 | F1 | forces | score |  | right | rests: earliest slot 17 |
| 2 | K2 | kinematics | score |  | right | rests: earliest slot 18 |
| 3 | E3 | energy | score |  | right | rests: earliest slot 19 |
| 4 | M1 | momentum | topic |  | wrong | due back at slot 8 (3 others); retry-right logged, no weight |
| 5 | F2 | forces | score |  | wrong | due back at slot 9 (3 others) |
| 6 | M3 | momentum | score |  | wrong | due back at slot 10 (3 others) |
| 7 | K1 | kinematics | score |  | wrong | due back at slot 11 (3 others) |
| 8 | M1 | momentum | miss | yes | wrong | due back at slot 17 (8 others); retry-right logged, no weight |
| 9 | F2 | forces | miss | yes | right | rests: earliest slot 25 |
| 10 | M3 | momentum | miss | yes | right | rests: earliest slot 26 |
| 11 | K1 | kinematics | miss | yes | wrong | due back at slot 20 (8 others); retry-right logged, no weight |
| 12 | E2 | energy | topic |  | right | rests: earliest slot 28 |
| 13 | E4 | energy | score |  | right | rests: earliest slot 29 |
| 14 | F4 | forces | score |  | right | rests: earliest slot 30 |
| 15 | K3 | kinematics | score |  | wrong | due back at slot 19 (3 others) |
| 16 | E1 | energy | topic |  | wrong | due back at slot 20 (3 others); retry-right logged, no weight |
| 17 | M1 | momentum | miss | yes | right | rests: earliest slot 33 |
| 18 | K4 | kinematics | score |  | wrong | due back at slot 22 (3 others); retry-right logged, no weight |
| 19 | K3 | kinematics | miss | yes | right | rests: earliest slot 35 |
| 20 | K1 | kinematics | miss | yes | wrong | due back at slot 36 (15 others, 20 capped at n-1); retry-right logged, no weight |
| 21 | E1 | energy | miss | yes | wrong | due back at slot 30 (8 others) |
| 22 | K4 | kinematics | miss | yes | right | rests: earliest slot 38 |
| 23 | F3 | forces | score |  | right | rests: earliest slot 39 |
| 24 | E3 | energy | topic |  | wrong | due back at slot 28 (3 others); retry-right logged, no weight |
| 25 | M4 | momentum | score |  | right | rests: earliest slot 41 |
| 26 | M2 | momentum | score |  | right | rests: earliest slot 42 |
| 27 | F2 | forces | score |  | right | rests: earliest slot 43 |
| 28 | E3 | energy | miss | yes | wrong | due back at slot 37 (8 others); retry-right logged, no weight |
| 29 | M3 | momentum | score |  | right | rests: earliest slot 45 |
| 30 | E1 | energy | miss | yes | wrong | due back at slot 46 (15 others, 20 capped at n-1); retry-right logged, no weight |

Promotions to read off it: M1 misses at 4, comes back at 8 (3 others), misses again, back at 17 (8 others), paid off.
K1: 7 → 11 → 20 (3, then 8), then the 20 gap, capped at 15 in a 16-question bank. E1 was due at 20 but K1 was due too; the
earlier-due one went first and E1 came at 21. Slots 4, 12, 16, 24 are topic pulls; slots 8 and 20 were due misses, which win
the pull slot. A retry-right never moved anything (M1 at 4, K1 at 11 both came back on the miss gap).

## Known limits

- First pick on a multi-part problem = its first graded part.
- A Redeem showing opened from the list (not from Next) still grades in its round; a list jump to anything else is a normal showing.
- Uploads share one queue (`stem-q-upload`) across files.
