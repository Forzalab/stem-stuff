# Multiple choice (A–E) and hints

Design for the `mc` problem type and for hints on every type. Grading and hints are server-side (see `SECURITY.md`). File format: `SCHEMA.md` (one `problems.json`).

## 1. What other systems do

| System | Choice order | Tries | Partial credit | Hints / feedback |
|---|---|---|---|---|
| Canvas New Quizzes | Shuffle per question; single choices can be **locked** in place ("None of the above") | Set per quiz (attempts, keep highest/latest) | MC can give different points per choice; Multiple Answer: "partial credit with penalty" or "exact match" | Per-answer feedback |
| Moodle (multichoice + "Interactive with multiple tries") | "Shuffle the choices?" per question; numbering `A. B. C.` selectable | **tries = hints + 1**: each wrong try shows the next hint; when hints run out, no more tries | Penalty per wrong try (e.g. 0.333 of the mark) | Per-choice feedback + ordered hint list |
| WeBWorK | Per-student random seed (values and order differ per student) | Max attempts per problem; can re-randomize (new seed) after N attempts | Per-part | Hint shown after N attempts |
| PrairieLearn `pl-multiple-choice` | `order="random"` default; `number-answers` draws a subset from a larger pool of wrong answers | Per variant; new variant after tries | Points decrease per attempt on exams | Per-choice `feedback` |
| Gradescope online assignments | Fixed | Resubmit until deadline | Rubric | No per-try verdict unless released |

Takeaways we adopt: Moodle's "hints are tied to tries" model and Canvas/PrairieLearn per-choice feedback (our hints are keyed to the specific wrong answer), Canvas's lockable positions, PrairieLearn's distractor pool, WeBWorK's per-student seed. We do not need grades or penalties: this is a drill site, not a gradebook.

## 2. Problem shape (public file)

```json
{ "code": "CALC1_M3Q", "type": "mc",
  "body": [ ...blocks... ],
  "choices": [
    { "id": "a", "md": "$12$" },
    { "id": "b", "md": "$4$" },
    { "id": "c", "md": "$0$" },
    { "id": "d", "md": "$\\infty$" },
    { "id": "e", "md": "The limit does not exist", "lock": true }
  ] }
```

- Exactly 5 shown (A–E). Authors may write 5–8 choices; the server picks the correct one + 4 distractors (PrairieLearn-style pool).
- `id` is a stable lowercase id. **The correct id (`correct`) stays on the server**: `GET /p/<CODE>.json` never includes it.
- `lock: true` pins that choice to its authored slot (for "none of these" / "DNE").
- Single-answer only in v2. Multiple-answer is an open question (Canvas-style "exact match" would be the default).

## 3. Shuffle

- Order = seeded shuffle, seed = HMAC(server secret, code + user id). Same user always sees the same order (reload-safe, and the copy payload letters stay meaningful); different users differ, so "it's C" can't be passed around.
- The client sends the **choice id**, not the letter. Letters are display only. The copy payload records both.
- No re-shuffle after a wrong try: re-shuffling punishes reading, and elimination already handles the guessing risk.

## 4. UI

- Five full-width rows, `A`–`E` badge + rendered markdown/TeX, radio semantics (`role="radiogroup"`, arrow keys move, Space selects, `A`–`E` keys jump).
- One **Check** button. Nothing is graded on click of a row. There is **no Hint button**: hints come only from wrong attempts.
- A wrong pick is struck through and disabled, and Cluck's hint for that pick appears under the problem (duck badge, labeled with the error type, e.g. `sign`).
- Correct: existing v1 celebration. Out of attempts: card says "out of tries: ask Tony, code CALC1_M3Q". The answer is **not** revealed (Tony explains it).

## 5. Attempt rules (Tony: "2 times only" = 2 attempts)

| | MC | Freeform (`num`, `expr`) |
|---|---|---|
| Attempts | 2 | 2 **distinct** answers |
| Hint | each wrong attempt returns the hint for **that** wrong answer | same; unmatched wrong answer gets a generic nudge |
| After 2nd wrong | hint shown, then locked | same |

- No separate hint cap: at most one hint per wrong attempt, so at most 2 per problem.
- With 5 options, 2 attempts is already a 40% blind-guess win; that's the ceiling.
- Freeform "distinct": answers equal within `tol` (or same `expr` samples) count once. Parse errors ("can't read `2x+`") don't count.
- Locked: server returns `locked`, UI shows "ask Tony". Tony resets by deleting the incident line (`SECURITY.md` §5).

## 6. Hints are keyed to the wrong answer

Tony: "hint is spec by answer choices." A hint diagnoses the specific mistake behind the answer the student gave.

Example problem: solve $x+2=11$ (answer $9$).

| wrong answer | error type | why someone gets it |
|---|---|---|
| $13$ | `sign` | added 2 instead of subtracting |
| $11/2$ | `op-swap` | treated $+2$ as $\times 2$ and divided |
| $-9$ | `sign` | flipped the sign of the result |
| anything else | (none) | generic nudge |

- **MC:** every distractor maps to one error type + one hint.
- **Freeform:** the problem has a `wrong` list of known wrong answers (a value compared within `tol`, or a regex on the typed text) → error type + hint. A wrong answer that matches nothing gets the problem's `nudge` (or the server's default nudge).

### Error types (enum)
`sign`, `op-swap`, `order-ops`, `arithmetic`, `algebra`, `off-by-factor`, `units`, `deg-rad`, `chain-rule`, `product-rule`, `quotient-rule`, `power-rule`, `limit-plug`, `domain`, `components` (vector/trig decomposition), `misread`, `other`. Add to the enum rather than overusing `other`.

### Voice: Cluck
Hints are said by **Cluck**, a terse, quacking duck professor. Rules:
- Opens with "QUACK." (or "Quack.").
- One pointed question or one action. Names the diagnosed error. Never gives the answer or the next number.
- Socratic: make them look at their own step.
- Max ~25 words, TeX allowed.

Examples:
- $x+2=11$, answered $13$ (`sign`): "QUACK. You *added* 2 to both sides. What undoes $+2$?"
- $x+2=11$, answered $11/2$ (`op-swap`): "QUACK. Dividing by 2 undoes $\times 2$. Is there a $\times$ anywhere in $x+2$?"
- $\frac{d}{dx}\sin(3x)$, answered $\cos(3x)$ (`chain-rule`): "QUACK. The inside is $3x$, not $x$. What's its derivative, and where did it go?"
- Block on 30° incline, answered with $mg\cos 30^\circ$ for the along-slope force (`components`): "QUACK. Which component points *down the slope*: the one next to the angle or opposite it?"
- Generic nudge: "QUACK. Plug your answer back into the problem. Does it work?"

### Authoring order (required)
1. **Vet the choices first.** Write the correct answer, then each distractor *from* a named error type. A distractor with no believable error behind it gets replaced, not kept as filler.
2. **Then write Cluck's hint** for each distractor / known freeform wrong answer.
3. Tests enforce it: every MC distractor id has `{error, hint}` in the key, and every hint starts with "QUACK" (`tests/key.test.mjs`).

## 7. Server replies (shape)

`POST /check {code, answer | choice}` →
`{ "verdict": "correct" | "wrong" | "invalid" | "locked" | "egg", "triesLeft": 1, "error": "sign", "hint": "QUACK. ..." }`
(`error`/`hint` only on `wrong`; `error` is absent for a generic nudge.) There is no `/hint` endpoint.

## Sources
- Canvas New Quizzes (shuffle, lock, partial credit): https://celt.iastate.edu/learning-teaching-technology/new-quizzes-canvas , https://community.canvaslms.com/docs/DOC-15039
- Moodle multiple tries, hints = tries − 1, penalty: https://ecampus.nmit.ac.nz/moodle/mod/page/view.php?id=1259855 , https://docs.moodle.org/en/Multiple_Choice_question_type
- WeBWorK hints after N attempts, re-randomize: https://webwork.maa.org/wiki/Problem_Re-Randomize , https://webwork.maa.org/moodle/mod/forum/discuss.php?d=8420
- PrairieLearn `pl-multiple-choice` (`number-answers`, `order`, feedback): https://docs.prairielearn.com/elements/pl-multiple-choice/
- Gradescope online assignments: https://guides.gradescope.com (Online Assignments; not re-checked this session)
