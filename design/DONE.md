# Done questions: state across reloads, read-only reopen, list marks

Tony (brain, Sep 29 ~01:00-01:05 PT):
- clearly disabled answer UI after the 2-try lock and after a correct answer;
- question list: crossed out + greyed (NOT disabled), tick for correct, one X per wrong try;
- "for the XXs, cross them out too, bcs technically u cannot answer that anymore": crossed out = can't be answered any more. One X with a try left stays un-crossed.

Status: **built** (Tony approved variant A, tries.json, and re-showing the old hint). 2-choice = 1 try came from main (#10).

## As built (differences from the plan below)

- Record: `{ v: 2, units: [{ x, done, hint, gen, sigs? }], x, done, tries, hints }`. One unit per problem, **one per part for a
  multi** (main #17 grades each part alone). Top level feeds the list: `x` = all wrong tries, `done` = `correct` when every
  unit is right, `out` when every unit is closed and one isn't. `sigs` (upload only) are the wrong answers' signatures so
  grading resumes after a reload (repeats still don't count).
- `hint` is the Cluck hint for the student's own last wrong answer; reopening a question (or part) with tries used shows it again.
- `/state/<CODE>` returns `{wrong, done, gen}`, or `{parts: [...]}` for a multi. `/check` replies carry `gen`.
- tries.json: `{ "gen": N, "tries": { "<sid> <CODE>": {...}, "<sid> <CODE> <part>": {...} } }`, written atomically after
  every graded try; `$STEM_TRIES` overrides the path (tests). Blocked from serving, git-ignored; deploy.sh's checkout keeps it.
- Code: `offline.js` (store `done`, DB v2, `doneGet/donePut/doneDrop`, `drill:state`), `app.js` (`saveDone`, `paint`,
  `syncServer`, `seedLocal`), `nav.js`/`nav.css` (marks), `serve.py` (`state`, `_load_tries/_save_tries`, gen).
- Tests: `tests/done.pw.mjs` (starts and restarts its own server), `tests/test_serve.py` (`Persist`, `/state`).
  render/swap tests clear cookies per page (a new sid = fresh server tries, now that tries outlive a page).


## 1. What a question's state is

One record per **bank + code**:

```
{ key, wrong: n, done: "open" | "correct" | "out", tries: [...], hints: [...], ts }
```

- `wrong`: wrong tries so far (0..MAX). `done` is derived but stored so the list never re-grades.
- `tries` / `hints`: what app.js already keeps in `S` for Copy (so Copy works on a reopened question too).
- **Never stored: the answer, the right choice, the hint text.** Nothing on the page can reveal it after a reload, because the page never had it (server mode) or never writes it (upload mode).

`out` = `wrong >= triesFor(q)`, where `triesFor` is `MAX_TRIES` (2) except a 2-choice MC, which gets 1 (a second try on true/false is a free answer). This is the "single X on a 1-try 2-choice question = crossed out" row. The 1-try rule applies to grading too (server.py `grade` and app.js `gradeLocal`), not just the list; it needs Tony's OK because it changes grading.

**Bank** key:
- upload mode: `u:` + SHA-256 of that problem's JSON as uploaded. Same file uploaded again keeps its state; an edited problem (new answer, new choices) starts fresh, because old X's would be about a different question. Two files that share a code but differ don't collide.
- server mode: `s:` + origin + code.

Storage: the IndexedDB database from RELOAD.md (`stem-stuff`), a second store `done` (DB version 1 -> 2, `onupgradeneeded` creates it). Written after every graded try (`correct` / `wrong`; never `invalid`, `timeout`, `pending`). Read once on start, kept in a Map. If IDB is blocked (private mode), everything works as today for that page's lifetime.

## 2. Reopening a done question (read-only)

`load()` looks up the record before `render()`:

| state | what renders |
|---|---|
| open, 0 wrong | as today |
| open, 1 wrong (try left) | as today, the wrong MC choice struck (dashed, X badge), "Not quite. One more try." Hint not re-shown (the page doesn't keep hint text; keeping it is a small add if Tony wants it). |
| correct | MC: the student's choice green with the tick; typed: their answer in the green read-only box. "Correct". No arrow. |
| out | MC: their wrong choices struck, **no choice marked right**; the rest dimmed (muted text, `--line` border, `disabled`). Typed: their last answer read-only, no green. "Out of tries." + lock line "Ask Tony about CODE." No arrow. |

Everything is `disabled` / `readOnly`, so no tap, key or Enter can submit. The scratchpad and Copy stay live (Tony wants the explanation text regardless).

Mockups: `mockups/done-open-correct-{390,1920}.png`, `mockups/done-open-out-{390,1920}.png`.

## 3. Server mode: page and server agreeing after a reload

Today `serve.py` keeps `_tries[(sid, code)]` in memory: a restart forgets everything, and the page forgets everything on reload. Two copies now, so:

1. **Server is the source of truth for tries when it answers. The page's IDB copy is a display cache.**
2. New endpoint `GET /state/<CODE>` (cookie-scoped like `/check`): `{ wrong: n, done: bool }`. No answer, no hint, no signatures. On open, the page renders from the cache at once (no flash), then asks the server and re-renders if it differs.
3. **Make the server survive restarts**: write `_tries` to `tries.json` next to problems.json (atomic write via temp file + rename, on every change; tiny). Without this, every deploy (deploy.sh restarts the server, Tony's rule) hands every student fresh tries. This is the one change that makes rule 1 honest.
4. **Mismatch rules** (cache vs server, only if they still differ):
   - server further (more wrong, or done): server wins, cache is overwritten. (Another tab or device on the same cookie.)
   - cache further: **the page never un-locks**. It shows the cached state and replays nothing. Happens only when the server lost its store (tries.json deleted, new server). Once tries.json exists this is rare; when it happens, the page stays read-only and Tony can clear it by hand (below).
   - server unreachable / timeout (RELOAD.md 8 s): show the cache; nothing to reconcile.
5. Tony deletes an entry in tries.json by hand -> the server says fresh while the cache says done, which rule 4 would keep locked. So the page needs to tell "Tony reset it" from "server lost its store". Simplest way: tries.json keeps a per-(sid, code) `gen` counter; `/state` returns it; a larger `gen` than the cached one means "Tony reset it", cache is dropped. Deleting the entry makes the next one start at a higher global `gen`. (Mirrors the security rule "Tony deletes an entry by hand -> the check resets".)
6. Cookie cleared: the server sees a new sid (fresh); IDB is normally cleared with it. If only the cookie went, rule 4 (cache further) keeps it locked on that browser.

Upload mode has no server: IDB is the only copy, and the student can wipe it. Same as today's in-memory grading (the answer key is in the uploaded file anyway).

## 4. Question-list marks

Rules (Tony's):

| row | marks | crossed + greyed |
|---|---|---|
| fresh | none | no |
| 1 wrong, try left | X | **no** |
| 2 wrong (out) | X X | yes |
| correct | tick (after any X's) | yes |
| 2-choice MC, 1 wrong (out, 1 try) | X | yes |

- Crossed = title `line-through` (2px) + number and title in `--hint`. The row stays a link: tappable, focusable, no `aria-disabled`. Opening it shows the read-only question (section 2).
- Marks are the existing `i-x` (in `--bad`) and `i-ok` (in `--ok`) symbols, 20px, no text. Screen readers get an sr-only phrase after the title: "One wrong try, one left." / "Out of tries." / "Correct."
- The current row keeps its raised background and `c1` number, crossed or not.
- nav.js reads the Map from section 1; app.js dispatches `drill:state` after each graded try so the list updates without a reload.
- Server mode has no list (NAV.md), so marks exist only for uploads. The read-only reopen works in both modes.

### The one real choice: where the marks go

- **A, right edge** (`mockups/done-list-a-*.png`): marks at the row end. Titles stay aligned with the numbers; marks form their own column at the right. At 1920 the marks sit far from the title (52rem column).
- **B, before the title** (`mockups/done-list-b-*.png`): a fixed 42px column between number and title. Marks are next to the number (easy to scan down), but every title shifts right, even on fresh rows, and long titles wrap sooner at 390.

Recommendation: **A**. Fresh lists look exactly like today, and the marks read as a result column.

## Files this will touch (after approval)

`offline.js` (IDB store `done`, key hashing), `app.js` (load from record, write after grading, read-only render, `drill:state`, 1-try 2-choice), `nav.js` / `nav.css` (marks, `.gone`), `app.css` (dimmed disabled choices), `serve.py` (`/state`, tries.json, gen, 1-try 2-choice), SCHEMA.md (note on 2-choice tries), tests (reload -> reopen read-only; list marks; server restart keeps tries; gen reset).

Mockup files: `mockups/done-list-a.html`, `done-list-b.html`, `done-open-correct.html`, `done-open-out.html`, `done.css` (proposed CSS; the `mock-*` rules are scaffolding). Impeccable: 0 findings static and live at 390x844 and 1920x1080 for all four.
