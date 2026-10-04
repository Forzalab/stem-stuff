# Sugar mode (saccharine, the default) and diet mode (DIET_, the original questions)

Why (Tony, Oct 3, group study): the group wants the least resistive path to the answer: no "None of these", no fix boxes, a
formula card, a "what to do" line, and a streamed AI solution after a wrong answer. Today's main stays one prefix away for Tony.

## The flag
- Names (Tony, Oct 3): diet = the original questions (was "hard"), sugar = saccharine (was "easy").
- Cookie `stem-mode=diet` (Path=/, a year; an old `hard` value still counts). Absent = sugar. The server reads it on every request (`serve.py mode_of`), the page
  reads it in `mode.mjs` (`modeOf`).
- Code box only: `DIET_<code>` sets diet, `SUGAR_<code>` clears it (old `ADMIN_` / `UNADMIN_` still work), then `<code>` opens as usual (`modePrefix`). The prefixed
  form is never saved to `stem-codes` or suggested. `#code` maxlength 24.
- A flip reopens what is open (the bank in memory is the old mode's view).

## Both modes
- "None of these" (a `lock` choice) is gone. An mc that had it becomes tick-every-true-one (`pick: "all"`): "Tick every true one.
  None true? Check with none ticked." `correct` = the key minus the lock; None as the key = the empty set.
- Nothing ticked is a real answer on every choose-all (a try; the `miss` hint, or `NONE_MISS` for a converted mc).
- Tries: the authored list's count (`tries` in the view), so dropping None never turns 3 choices into a 1-try question.
- Number boxes accept 1.07e14, 1.07E14, 1.07x10^14, 1.07 X 10^14, 1.07*10^14, 1.07×10^14, 1.07·10^14, 1.07 10^14, 10^14,
  +1.07e+14, 107 000 (`numtext` / `numText`).

## Sugar only (BANK_P2X; BANK_PSY6 is internal and has no saccharine layer)
- Sugar v2 (Tony via main, Oct 3: "sugar = no choose-all, no typed; prune 75%"): `saccharine.hide` leaves a question out of sugar
  (P2X keeps 25 of 100). `saccharine.split` turns a choose-all into one True/False question per row, in its place
  (`sub` codes like PHYS_U8BA; 1 try; the row's slip, tip and narration; the parent's key and formulas; the parent's how-to-tick
  paragraph is dropped, its "Use g = ..." line kept). Real P2X: 67 sugar items (11 single answer + 56 rows), 100 in diet.
  Sub codes 404 in diet. (serve.py `subs`, `sub_problem`, `lookup`.)
- Snacks (`sugar_only: true`, `saccharine.snack`, design/REWARDS-WIRING.md): sugar only. Diet leaves them out everywhere (bank list, `p/`, `/check`,
  `/state`, `/narrate`, `/explain`: `lookup` returns nothing), so a diet bank payload is byte-identical to the bank without them. Sugar puts each
  snack right before its `saccharine.before` code (a sub code or a code; `snacks_placed`); no such code in the list = where the file put it.
- A question whose answer is None is hidden (bank payload, `p/CODE.json` 404, uploads left out of the list).
- No prove mode: `fix` is dropped, rows are tick / blank only.
- `tip`: one "what to do" line on top of a twisted question. Plain statements, never a question; plain text + `$..$`.
- Formula card from `part` (Phase 3; the server sends `formulas: [{id, group, tex}]` from `banks/formula-sheet.json`, which ship.sh copies with the banks).
- Cluck the genie (Phase 4): `POST /explain {code, answer, auto}` streams a paraphrase of the presolved `key` + `slip` in Cluck's genie voice
  (serve.py `CLUCK_GENIE`) from OpenRouter with zero data retention (`provider: {zdr: true, data_collection: "deny"}`), models from
  `OPENROUTER_MODELS` (fallback list), key `OPENROUTER_API_KEY` (Vercel env). Plain text only: the `Plain` filter drops markdown.
  The first wrong answer of a question fires it in the background (at most 5 questions an hour: localStorage `stem-wish` + the
  server's per-browser count); past that, "Ask Cluck" (40 an hour in all). A question without a key, or no API key: the block stays hidden.
  One text source (Tony, Oct 4): the box shows the item's pre-written `narration` (`POST /narrate`) when it has one: instant, free, no
  API key, no `/explain` call. No narration → the `/explain` stream above. Shown ChatGPT style: ~900 ms of a lone blinking caret, then typed at
  ~35 chars/s word by word (`$..$` whole), caret at the end; a tap on the box skips; reduced motion = the wait, then the whole text.
  Once the typing ends, the box text (and only it) is read aloud at volume 0.2 (`speechSynthesis`, `speak.mjs`; Tony: "smaller voice"),
  muted per browser (`stem-voice=off`), stopped on a new question.
- Brainrot corner (`brainrot.js`, design/FORMULA-CARD.md round 2): two muted looping players. Drag it anywhere; it snaps to the nearest
  corner and a drop is the user's choice (kept per device, `stem-rot` + `stem-rot-pick`, never stepped off; Tony, Oct 3: "i cannot drag
  the thing down"). Before the first drag it steps off answer controls. At rest it is anchored by CSS left/right + top/bottom (a bottom corner rides
  Firefox Android's sliding toolbar). Warmed off screen only on the start page or a question with a layer.

## Diet only (Tony's own)
- Prove mode (X + typed fix boxes) is gone in BOTH modes (Tony, Oct 3: "kill off the red x and the input mode, for diet too"). The sig-fig grading below stays for any typed answer that asks for it:
  (`sigfig`). n = `fix.sf`, else "N sig figs" in `fix.how`, else 4.
- No tip, no card, no AI.

## Content contract (main writes it in the brain; banks never go to GitHub)
- `formula-sheet.json` next to the bank: `{ v: 1, groups: [{ name, rows: [{ id, tex }] }] }`, id `^[A-Z][A-Z0-9_]{1,15}$`.
- Schema v2 (Tony, Oct 3): the problem's own fields are the DIET question, untouched; everything sugar sits in ONE block:
  `"saccharine": { title, tip, part, key, slip, narration }` (SCHEMA.md). `title` = "Practice Exam 2, Question X: [condition changed]";
  `narration` = the pre-written Cluck box text, also read aloud (`POST /narrate`, sugar only). Flat `tip/part/key/slip` are still read until the banks move.
- Audience (Tony): community college GenEd physics in Fresno, mostly biology and CS majors: plain words, ESL friendly (also in CLUCK_GENIE).

Code: `serve.py` (`mode_of`, `locks`, `hidden`, `view`, `numtext`, `sigfig`, `figures`), `mode.mjs`, `app.js` (code box, upload
view, empty Check, tip), `nav.js` (uploads hidden in easy). Tests: `tests/test_serve.py` (`test_modes`, `test_number_forms`,
`test_fix_sig_figs`), `tests/tries.test.mjs`, `tests/easy.pw.mjs`.
