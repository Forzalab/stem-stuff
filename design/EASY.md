# Easy mode (default) and hard mode (ADMIN_)

Why (Tony, Oct 3, group study): the group wants the least resistive path to the answer: no "None of these", no fix boxes, a
formula card, a "what to do" line, and a streamed AI solution after a wrong answer. Today's main stays one prefix away for Tony.

## The flag
- Cookie `stem-mode=hard` (Path=/, a year). Absent = easy. The server reads it on every request (`serve.py mode_of`), the page
  reads it in `mode.mjs` (`modeOf`).
- Code box only: `ADMIN_<code>` sets hard, `UNADMIN_<code>` clears it, then `<code>` opens as usual (`modePrefix`). The prefixed
  form is never saved to `stem-codes` or suggested. `#code` maxlength 24.
- A flip reopens what is open (the bank in memory is the old mode's view).

## Both modes
- "None of these" (a `lock` choice) is gone. An mc that had it becomes tick-every-true-one (`pick: "all"`): "Tick every true one.
  None true? Check with none ticked." `correct` = the key minus the lock; None as the key = the empty set.
- Nothing ticked is a real answer on every choose-all (a try; the `miss` hint, or `NONE_MISS` for a converted mc).
- Tries: the authored list's count (`tries` in the view), so dropping None never turns 3 choices into a 1-try question.
- Number boxes accept 1.07e14, 1.07E14, 1.07x10^14, 1.07 X 10^14, 1.07*10^14, 1.07×10^14, 1.07·10^14, 1.07 10^14, 10^14,
  +1.07e+14, 107 000 (`numtext` / `numText`).

## Easy only
- A question whose answer is None is hidden (bank payload, `p/CODE.json` 404, uploads left out of the list).
- No prove mode: `fix` is dropped, rows are tick / blank only.
- `tip`: one "what to do" line on top of a twisted question. Plain statements, never a question; plain text + `$..$`.
- Coming: formula card from `part` (Phase 3), Cluck genie AI from `key` + `slip` (Phase 4).

## Hard only (Tony's own)
- Prove-mode fix boxes stay. They grade to significant figures: the key rounded to n figures, give or take 1 in the last
  (`sigfig`). n = `fix.sf`, else "N sig figs" in `fix.how`, else 4.
- No tip, no card, no AI.

## Content contract (main writes it in the brain; banks never go to GitHub)
- `formula-sheet.json` next to the bank: `{ v: 1, groups: [{ name, rows: [{ id, tex }] }] }`, id `^[A-Z][A-Z0-9_]{1,15}$`.
- Per question: `part` (sheet ids), `key` (presolved, server only), `slip` ({choice: one line}, server only), `tip`.
  SCHEMA.md has all four.

Code: `serve.py` (`mode_of`, `locks`, `hidden`, `view`, `numtext`, `sigfig`, `figures`), `mode.mjs`, `app.js` (code box, upload
view, empty Check, tip), `nav.js` (uploads hidden in easy). Tests: `tests/test_serve.py` (`test_modes`, `test_number_forms`,
`test_fix_sig_figs`), `tests/tries.test.mjs`, `tests/easy.pw.mjs`.
