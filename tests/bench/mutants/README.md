# Seeded faults (mutant set)

Each `*.patch` is one hunk, one seeded fault, applied by `.github/workflows/tests.yml`
(`workflow_dispatch` input `mutant=<name>`, both the `unit` and `block` jobs). Full CI must go
red; the specs + assertions below are the accuracy baseline the selected-spec run (tickets 06/09)
must match.

Re-derive the hunks on the current tree before use: line numbers move with layout work (T2).

| Mutant | Fault | File:line | Caught by (spec:assertion line) |
|---|---|---|---|
| `M1-grading-subset` | choose-all drops the set-size check: a subset of the right ticks grades correct | `app.js:363` | `tests/tries.test.mjs:98` (empty set → `incomplete`), `:106`, `:118` (subset → `wrong`), `:126` |
| `M2-attempt-repeat-costs` | a repeated wrong answer is pushed again, so it costs a try | `app.js:398` | `tests/tries.test.mjs:41` (triesLeft 1→0), `:62` (correct→locked), `:116`, `:179` |
| `M3-queue-gap-clamp` | third miss gap clamped to 8 instead of 20 | `shuffle.mjs:129` | `tests/shuffle.test.mjs:57` (`deepEqual [1, 5, 14, 35, 56]`) |
| `M4-layout-fab-room` | drop `+ 56px` page-end room: last control sits under the Scratchpad button | `app.css:1365` | `tests/fab.pw.mjs:57` (`last control under the button`), also `:65` (`covers Check`) |
| `M5-cluck-turn-fold` | inverted verdict test: wrong turns stop folding, right turns fold | `app.js:2954` | `tests/cluck-history.pw.mjs:85` (label), `:86` (`miss's reply is collapsed`), `:88` (`miss line is the toggle`) |
| `M6-jev-roll-flip` | the nudge roll compare flipped (`>=` → `<`): Jev speaks when it should stay silent | `intent.js:420` | `tests/jev-scripted.test.mjs:80` (S2 speaks at die 0), `:106` (die under p), `:140` (round(n·p) fires), `tests/nudge.test.mjs:79` (S2 nudge at 91 s), `tests/seen.test.mjs:237` (S6 nudge on the item) |
| `M7-jev-gap-cap` | the GAP_S back-off dropped from `block()`: a nudge no longer holds the next one | `intent.js:410` | `tests/nudge.test.mjs:85` (30 s since the last: still 1), `:204` (the 90 s gap holds), `tests/seen.test.mjs:232` (a seen line 20 s after the last) |
| `M8-jev-s6-off-by-one` | S6 off by one (`<` → `<=`): needs 2 wrong picks, so the first miss leaves S6 off | `intent.js:342` | `tests/nudge.test.mjs:128` (1 wrong pick puts S6 on), `tests/jev-scripted.test.mjs:163` (one wrong pick puts S6 on), `tests/seen.test.mjs:237` (S6 nudge on the 1st wrong) |

## Verified runs (this tree)

- M1: `tries.test.mjs` 27 tests, 4 fail (9, 11, 12, 13).
- M2: `tries.test.mjs` 27 tests, 4 fail (4, 6, 12, 20).
- M3: `shuffle.test.mjs` 51 tests, 1 fail (6).
- M4: `fab.pw.mjs` real Chromium, 4 FAIL (both widths, `last control under the button`).
- M5: `cluck-history.pw.mjs` real Chromium, 2 FAIL (both widths, `miss's reply is collapsed`).
- M6: `jev-scripted.test.mjs` 6 tests, 5 fail (1, 2, 4, 5, 6); `nudge.test.mjs` 17 tests, 5 fail (1, 2, 3, 6, 10); `seen.test.mjs` 28 tests, 1 fail (14).
- M7: `nudge.test.mjs` 17 tests, 2 fail (2, 10); `seen.test.mjs` 28 tests, 1 fail (14).
- M8: `nudge.test.mjs` 17 tests, 2 fail (3, 4); `jev-scripted.test.mjs` 6 tests, 3 fail (1, 2, 5); `seen.test.mjs` 28 tests, 1 fail (14).

Re-run a mutant locally:

```
git apply tests/bench/mutants/<name>.patch
SPECS=<spec> tests/run-all.sh        # .pw specs (M4, M5)
cd tests && node --test <spec>.test.mjs   # unit specs (M1–M3)
git checkout -- <changed file>
```
