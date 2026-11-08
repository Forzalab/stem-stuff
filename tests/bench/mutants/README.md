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

## Verified runs (this tree)

- M1: `tries.test.mjs` 27 tests, 4 fail (9, 11, 12, 13).
- M2: `tries.test.mjs` 27 tests, 4 fail (4, 6, 12, 20).
- M3: `shuffle.test.mjs` 51 tests, 1 fail (6).
- M4: `fab.pw.mjs` real Chromium, 4 FAIL (both widths, `last control under the button`).
- M5: `cluck-history.pw.mjs` real Chromium, 2 FAIL (both widths, `miss's reply is collapsed`).

Re-run a mutant locally:

```
git apply tests/bench/mutants/<name>.patch
SPECS=<spec> tests/run-all.sh        # .pw specs (M4, M5)
cd tests && node --test <spec>.test.mjs   # unit specs (M1–M3)
git checkout -- <changed file>
```
