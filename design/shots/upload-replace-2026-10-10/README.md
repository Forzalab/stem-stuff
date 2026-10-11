# B1: an upload replaces the old upload

Task 20261010-B1. Date: 2026-10-10. Branch ccr-0726030c-ifug2i-upload-replaces (origin/main 2febaba merged in).

## What changed

- `offline.js` `ingest()`: parse all picked files first and keep the valid problems. When `save` is true and the pick has at least one valid problem, clear `local` and `names` once (no `await` in the swap), then add this pick's problems. Memory = what `saveBank` stores.
- Same function: a `restore()` (`save` false) that lost the race to a fresh upload adds nothing, so it can not bring the old files back.
- Not changed: `emit(first(got))`, hosted-code override (`local.has` first), done keys, `banks/`.
- `design/RELOAD.md`: one line (memory and IndexedDB both hold only the last upload).
- `tests/upload-replace.pw.mjs`: new, 7 rows at 393 and at 1280 width (own server, temp banks). 12 of 14 fail on the old code, 14 of 14 pass now.

## Fail-if line to evidence

| Fail-if | Evidence |
| --- | --- |
| After A then B, codes / list rows / 20 Next presses hold an A code | `after.log` S1: Next only ZB1-3; test row "A then B" ok. `before.log` shows the bug (6 codes, ZA served). |
| After A then A' a removed code is in codes, list, Next, or opens by `#code` | `after.log` S2: ZA1, ZA3, ZA4 only; test row "A then A'" ok (also checks `has()` and `#CALC1_ZA2`). |
| List/codes/Next differ before vs after a reload | `after.log` S3a/S3b; test compares the full snapshot before vs after a reload in every row; shots 2 vs 3 and 4 vs 5 are identical. |
| A bad file wipes the previous upload | test row "a file with no valid problem wipes nothing" (5 kinds of bad file) and the all-bad dialog pick: ok. |
| An upload reusing a hosted code stops overriding | `after.log` S4 (PSY_DAA overridden before and after a reload, PSY_DAB still hosted); test hosted row ok. |
| Any test in run-all.sh red | `tests.log`: ALL GREEN, RUN_RC=0, no re-runs needed. |
| Diff touches files outside the named ones | `git diff origin/main --stat`: offline.js, design/RELOAD.md, tests/upload-replace.pw.mjs, this folder. |

## Files here

- `before.log`: repro and the new test run against origin/main code (the bug).
- `after.log`: the same on the branch.
- `tests.log`: full `tests/run-all.sh`, ends `RUN_RC=0`.
- `393x852-1..5-*.png`: Chromium 393x852, question list: after A; after A then B (before and after a reload); after A then edited A (before and after a reload).

The upload button takes one file. Several files in one pick go through the dialog (`openPicker`), which the test uses.
