# B1: an upload replaces the old upload

Task 20261010-B1. Date: 2026-10-10.

## Problem

A new upload did not replace the old one in memory. It was added to it.

- After upload A and then upload B, the page held the questions of A and B.
- After upload A and then a changed A, a question that was removed from the file stayed in memory.
- IndexedDB kept only the last upload. After a reload, the page held only the last upload.
- The list and the Next button changed on their own after a reload.

## Change

File `offline.js`, function `ingest()`.

- `ingest()` first reads all the picked files. It keeps the valid problems in a local list.
- When `save` is true (a real upload) and the pick has at least one valid problem, `ingest()` clears `local` and `names` one time. Then it adds the problems of this pick.
- All the files of one pick add up to each other.
- A pick with no valid problem changes nothing.
- `restore()` (`save` is false) works as before. It fills an empty store.
- Memory is now the same set that `saveBank` writes to IndexedDB.
- `emit(first(got))`, the uploadMsg lines and the hosted-code override are not changed.
- The done keys and `banks/` are not changed.

File `design/RELOAD.md`: one line changed.

## Proof

| File | What it shows |
| --- | --- |
| `repro-before.log` | The B1 repro on the old code. Memory holds A and B. Next gives A codes. |
| `repro-after.log` | The same repro on the new code. Memory holds only the last upload. A code that was removed does not open. |
| `tests.log` | Full `tests/run-all.sh`. The last line is `RUN_RC=0`. |
| `chromium-393x852-A-then-B.png` | Chromium 393x852. The question list after upload A and then upload B. Only B shows. |
| `webkit-393x659-A-then-B.png` | WebKitGTK 393x659 (iOS Safari model). The same steps. Only B shows. |

New test: `tests/upload-replace.pw.mjs`. It runs at 393 and at 1280 width. It starts its own `serve.py` with temporary banks. It uploads with `setInputFiles`. Each row checks codes, IndexedDB, list rows and 20 Next presses, before and after a reload.

| Row | Check |
| --- | --- |
| A then B | No A code is left anywhere. |
| A then changed A | The removed code is gone at once and does not open by `#code`. The edited text is new. |
| Bad files after A | Not JSON, no problems, bad code, custom prefix with no flag, not .json: nothing changes. |
| Many files in one pick | The files add up to each other. The next pick replaces all of them. A pick of bad files changes nothing. |
| Dialog that waits for a code | A file without the code says so and the wait stays open. The right file answers. Memory is only that file. |
| Hosted code override | An upload with a hosted code still overrides it, before and after a reload. |
| Done marks | A done mark comes back when the same problem is uploaded again. |

The new test fails on the old `offline.js` (6 of 7 rows at each width). It passes on the new one.

## Note

The upload button takes one file. Several files in one pick are possible only with the dialog (`openPicker`). The test uses the dialog for that row.
