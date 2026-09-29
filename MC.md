# Multiple choice (A–E) and hints

Design for the `mc` problem type and for hints on every type. Grading and hints are server-side (see `SECURITY.md`, `SCHEMA-SPLIT.md`).

## 1. What other systems do

| System | Choice order | Tries | Partial credit | Hints / feedback |
|---|---|---|---|---|
| Canvas New Quizzes | Shuffle per question; single choices can be **locked** in place ("None of the above") | Set per quiz (attempts, keep highest/latest) | MC can give different points per choice; Multiple Answer: "partial credit with penalty" or "exact match" | Per-answer feedback |
| Moodle (multichoice + "Interactive with multiple tries") | "Shuffle the choices?" per question; numbering `A. B. C.` selectable | **tries = hints + 1**: each wrong try shows the next hint; when hints run out, no more tries | Penalty per wrong try (e.g. 0.333 of the mark) | Per-choice feedback + ordered hint list |
| WeBWorK | Per-student random seed (values and order differ per student) | Max attempts per problem; can re-randomize (new seed) after N attempts | Per-part | Hint shown after N attempts |
| PrairieLearn `pl-multiple-choice` | `order="random"` default; `number-answers` draws a subset from a larger pool of wrong answers | Per variant; new variant after tries | Points decrease per attempt on exams | Per-choice `feedback` |
| Gradescope online assignments | Fixed | Resubmit until deadline | Rubric | No per-try verdict unless released |

Takeaways we adopt: Moodle's "hints are tied to tries" model, Canvas's lockable positions, PrairieLearn's distractor pool, WeBWorK's per-student seed. We do not need grades or penalties: this is a drill site, not a gradebook.

## 2. Problem shape (public file)

```json
{ "code": "CALC1-M3Q", "type": "mc",
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
- `id` is a stable lowercase id. **The correct id lives only in the server key** (`k/<CODE>.json`), never in the public file.
- `lock: true` pins that choice to its authored slot (for "none of these" / "DNE").
- Single-answer only in v2. Multiple-answer is an open question (Canvas-style "exact match" would be the default).

## 3. Shuffle

- Order = seeded shuffle, seed = HMAC(server secret, code + user id). Same user always sees the same order (reload-safe, and the copy payload letters stay meaningful); different users differ, so "it's C" can't be passed around.
- The client sends the **choice id**, not the letter. Letters are display only. The copy payload records both.
- No re-shuffle after a wrong try: re-shuffling punishes reading, and elimination already handles the guessing risk.

## 4. UI

- Five full-width rows, `A`–`E` badge + rendered markdown/TeX, radio semantics (`role="radiogroup"`, arrow keys move, Space selects, `A`–`E` keys jump).
- One **Check** button. Nothing is graded on click of a row.
- A wrong pick is struck through and disabled (can't pick it twice; the attempt count is for distinct picks).
- Hint button beside Check shows `Hint (2 left)`. Hints appear in a stacked list under the problem, oldest first, each labeled with its kind.
- Correct: existing v1 celebration. Out of tries: card says "out of tries: ask Tony, code CALC1-M3Q". The answer is **not** revealed (Tony explains it).

## 5. Attempt and hint rules (recommended default)

Tony: "MANY hint types, 2 times only." Ambiguous. Recommended reading, Moodle-style:

| | MC | Freeform (`num`, `expr`) |
|---|---|---|
| Hints | 2 per problem | 2 per problem |
| Checks | 2 wrong picks, then locked | 2 wrong **distinct** answers, then locked (see below) |
| Auto hint | a wrong try unlocks (does not force) the next hint | same |

- Why 2 tries on MC: with 5 options, 2 tries is already a 40% blind-guess win. 3 tries would be 60%, which is guessing, not math.
- Freeform "distinct": answers that are equivalent (same value within tol, or same `expr` samples) count once. Parse errors ("can't read `2x+`") do **not** count; they're free.
- Locked means: server returns `locked`, UI shows "ask Tony". Tony resets by deleting the entry (SECURITY.md §5).
- **Open question for Tony:** is "2 times" 2 hints, 2 tries, or both? The table above does both. Alternative: 2 hints and 3 tries (Moodle's tries = hints + 1).

## 6. Hint catalog

Each hint in the key has a `kind`. The author lists them in order; the server hands out the next one. Kinds, from lightest to heaviest:

| kind | what it gives | example |
|---|---|---|
| `nudge` | A question back, no math | "What happens to the fraction at $x=2$ if you just plug in?" |
| `concept` | Names the idea | "This is a $0/0$ form: factor." |
| `formula` | A formula to use | "$a^3-b^3=(a-b)(a^2+ab+b^2)$" |
| `step` | The first line of work | "$\\dfrac{x^3-8}{x-2}=x^2+2x+4$ for $x\\neq2$" |
| `check` | A way to check yourself | "Your answer should agree with the table." |
| `units` | Units / dimension sanity (PHYS) | "An acceleration has units m/s²; does yours?" |
| `range` | Magnitude only | "The answer is between 10 and 15." |
| `sign` | Direction/sign only | "It's negative: the block slows down." |
| `eliminate` | MC only: strike 2 wrong choices | server picks 2 distractors, never the locked one |
| `scaffold` | Code of an easier warm-up problem | "Try CALC1-A3F first." (v1 scaffold map) |
| `figure` | Highlights marks in the graph | `{ "kind":"figure", "marks":[2,4] }` (index in the graph's `marks`) |
| `misconception` | Feedback tied to the last wrong answer | per-distractor text in MC; per-trap value in freeform (`"trap":"4", "md":"You canceled $x-2$ wrong"`) |

`misconception` is special: it is shown **with the wrong verdict** and does not use a hint slot, because it is feedback on what they typed, not new information. Every MC distractor should have one. Freeform traps come from v1's `key.md` "traps".

## 7. Server replies (shape)

`POST /check {code, answer | choice}` → `{ "verdict": "correct" | "wrong" | "invalid" | "locked" | "egg", "triesLeft": 1, "feedback": "...", "hintsLeft": 2 }`

`POST /hint {code}` → `{ "n": 1, "kind": "concept", "md": "...", "hintsLeft": 1 }` or `{ "verdict": "locked" }`.

## Sources
- Canvas New Quizzes (shuffle, lock, partial credit): https://celt.iastate.edu/learning-teaching-technology/new-quizzes-canvas , https://community.canvaslms.com/docs/DOC-15039
- Moodle multiple tries, hints = tries − 1, penalty: https://ecampus.nmit.ac.nz/moodle/mod/page/view.php?id=1259855 , https://docs.moodle.org/en/Multiple_Choice_question_type
- WeBWorK hints after N attempts, re-randomize: https://webwork.maa.org/wiki/Problem_Re-Randomize , https://webwork.maa.org/moodle/mod/forum/discuss.php?d=8420
- PrairieLearn `pl-multiple-choice` (`number-answers`, `order`, feedback): https://docs.prairielearn.com/elements/pl-multiple-choice/
- Gradescope online assignments: https://guides.gradescope.com (Online Assignments; not re-checked this session)
