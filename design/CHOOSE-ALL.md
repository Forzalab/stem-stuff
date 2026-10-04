# Choose all correct (`mc` + `pick: "all"`)

Design for a multiple-answer question: "Choose all answers that apply." Closes the open question in `MC.md` §2 ("Single-answer only in v2. Multiple-answer is an open question"). Spec only: no code in this change. Grading stays server-side (`SECURITY.md`).

> Oct 3: "None of these" rows are gone in both modes and nothing ticked is a real answer; easy mode drops prove mode. See design/EASY.md.

## 1. What other systems do

| System | Control | Grading | Count hint | Feedback |
|---|---|---|---|---|
| PrairieLearn `pl-checkbox` | checkboxes, random order, letter keys (a), (b)… | `partial-credit`: `off` (all-or-nothing, **default**), `net-correct`, `coverage` = (t/c)·(t/n), `each-answer` | `show-number-correct`, `detailed-help-text` (min/max to select); `min-select` default 1, empty = invalid | per-choice `feedback` shown next to a picked option after grading |
| Canvas New Quizzes "Multiple Answer" | checkboxes | "partial credit with penalty" or "exact match" | none | per-answer feedback |
| Moodle multichoice, "Multiple answers allowed" | checkboxes | per-choice % weights; wrong choices need negative % or "select all" wins full marks | none ("Moodle does not give any hint as to how many") | per-choice + combined feedback |
| Khan Academy | "Choose all answers that apply:" line above A, B, C…; "None of the above" as a choice | all-or-nothing | none | hint steps |
| NN/g (checkbox vs radio) | checkbox = any number, square box with a check; radio = exactly one, circle | — | — | label is the click target too (Fitts) |

Takeaways we adopt:
- **All-or-nothing** grading, which is the default in PrairieLearn, Canvas "exact match" and Khan. This is a drill site, not a gradebook (MC.md §1). Partial credit would just reward guessing.
- **Square checkboxes**, so the control itself says "many". Radio rows stay circles.
- **A "Choose all that apply" line** (Khan wording), shown in the `how` slot.
- **Empty = invalid**, never graded, as PrairieLearn does with `min-select` 1.
- **Per-choice hints**, which our `wrong` already does for `mc`.
- **"None of these" as a locked choice** (Khan) instead of allowing an empty answer.

## 2. Problem shape (public file)

Same `mc` problem, one new key. Reuse everything: `choices`, `lock`, `shuffle`, the distractor pool, the copy payload.

```json
{ "code": "CSCI26_A7K", "type": "mc", "pick": "all",
  "how": "Choose all that apply.",
  "body": [ { "type": "text", "md": "Which of these are equal to $\\lnot(A \\land B)$?" } ],
  "choices": [
    { "id": "a", "md": "$\\lnot A \\lor \\lnot B$" },
    { "id": "b", "md": "$\\lnot A \\land \\lnot B$" },
    { "id": "c", "md": "$A \\uparrow B$ (NAND)" },
    { "id": "d", "md": "$\\lnot A \\lor B$" },
    { "id": "e", "md": "None of these", "lock": true }
  ],
  "correct": ["a", "c"],
  "wrong": [
    { "choice": "b", "error": "misread", "hint": "QUACK. De Morgan flips the operator too. Did your $\\land$ flip?" },
    { "choice": "d", "error": "sign", "hint": "QUACK. The NOT goes to *both* inputs. Check $B$." },
    { "choice": "e", "error": "other", "hint": "QUACK. Test one row: $A=1, B=0$. Does any choice match?" }
  ],
  "miss": "QUACK. Every pick you made is right. Is that all of them? Test each one left over." }
```

| key | meaning | served |
|---|---|---|
| `pick` | `"one"` (default, today's `mc`) or `"all"` (this doc). Only on `mc`. | yes (the page needs it for checkboxes) |
| `correct` | `pick: "all"`: **array** of 1+ choice ids. `pick: "one"`: a string id, as today. | **no** |
| `wrong` | as today: every distractor id has `{ error, hint }` | **no** |
| `miss` | `pick: "all"` only, required: Cluck's hint for "every tick is right, but at least one correct choice is missing". Never names which one. | **no** |

Authoring rules (to be enforced in `tests/schema.test.mjs`):
- Shown choices: 4–5. At least 2 correct **or** a locked "None of these" that can be the only right answer, so the set is never a pure guess between "tick one" and "tick all".
- Never make **all** shown choices correct: "tick everything" must lose.
- Pool (`shown()`, 6–8 authored): keep **every** correct id plus locked ones, then fill to 5 with distractors. Today's `shown()` keeps `c.id === p.correct`, which becomes `ids(p.correct).includes(c.id)`.
- "None of these" (locked) is exclusive. Ticking it clears the others, and ticking another clears it, so "none" + "a" is never sent.

Schema delta for `SCHEMA.md` (the `problem` schema; `additionalProperties: false` today, so `pick` and `miss` must be added):
```json
"pick": { "enum": ["one", "all"], "default": "one", "description": "mc only. all = checkboxes, grade the set (design/CHOOSE-ALL.md)" },
"correct": { "oneOf": [ { "type": "string" }, { "type": "array", "items": { "type": "string" }, "minItems": 1, "uniqueItems": true } ] },
"miss": { "type": "string", "pattern": "^QUACK", "description": "pick all: every tick right, some correct missing" }
```
plus an `if pick=all then correct is array and miss is required` rule. The key file schema needs the same change.

## 3. Grading (server, `serve.py`; local twin `gradeLocal`)

- Request: `POST /check { code, choices: ["a","c"] }`. Ids, not letters (MC.md §3). Empty array, unknown id, duplicate, or "none" + another → `invalid` (no try spent).
- **Correct** = the set equals `correct` exactly.
- **Wrong**: pick the hint in this order:
  1. The first ticked distractor in **authored order** (of the shown choices, not the per-browser shuffle, so the same set always gets the same hint) that has a `wrong` entry → that entry's `error` + `hint`. Its row gets struck through and disabled, like a wrong `mc` row. This reveals the same amount as today's mc: one known-wrong option.
  2. No distractor ticked (so the ticks are a strict subset of `correct`) → `miss`, with `error: "incomplete"` (a new error enum value).
- Reply: same shape as `mc` (`MC.md` §7), plus `struck: "b"` when a row should strike. Never send which correct ids are missing.
- **Tries**: same rule as `mc`, by shown count (`maxTries`). 4–5 shown → TWO. A **repeat of the same set** doesn't count (like freeform "distinct", SCHEMA.md tries rule). A struck row can't be re-ticked, so a repeat after a strike is impossible anyway.
- Lock after the 2nd wrong: "out of tries: ask Tony, code …". No reveal (MC.md §4).
- Blind-guess odds: 2 correct of 5 = 1/31 non-empty sets per try, far below the 40% of a single `mc`. That's fine for a drill. The `miss` hint carries students who are close.

## 4. UI

- Same five rows as `mc`. The A–E badge becomes a **square checkbox badge**: an empty square, filled with a check when ticked. The rows never turn into one-row pills (`design/SWAP.md` one-row rule is for `pick: "one"` only).
- The `how` line sits above the rows: "Choose all that apply." The page writes this default when `how` is missing, so authors can leave it out.
- Semantics:
  - the list is `role="group"` with `aria-labelledby` = the how line, and each row is `role="checkbox"` + `aria-checked`;
  - Space toggles, A–E and 1–5 toggle that row, arrows move focus;
  - Enter = Check;
  - the label/row is the click target (NN/g #11).
- **Check** stays disabled until ≥1 row is ticked (empty = invalid, so never send it).
- After a wrong try:
  - the **ticks stay** (the student edits the set rather than starting over);
  - the struck row is unticked + disabled;
  - Cluck's hint appears under the problem as today;
  - with a `miss` hint nothing is struck, and the ticks stay.
- Correct: the existing celebration + explain box (`design/EXPLAIN-BOX.md`).
- The copy payload (`copy/`) records the ticked ids + letters per try.

## 4b. Prove mode: fix every false row (Tony, 10-02)

Stops guessing. Turn it on with a public `fix` on the problem: `"fix": { "type": "num" | "expr" | "text", "how"?: "whole number", "var"?: "x" }`. It is only allowed with `pick: "all"`.
- Every row is either **ticked** (true) or **X'd** (false). There is no blank. Each X'd row that isn't locked opens a box under it, where you type the corrected value.
- Key: every false, unlocked choice's `wrong` entry carries `fix: { answer, accept?, tol?, points?, wrong? }`. It is graded like a `multi` part, with type and var taken from the problem's `fix`. Locked rows ("None of these") never take a fix.
- One shared type for all rows keeps the public file from leaking which rows are false.
- **Ticking the locked "None of these" X's every other unlocked row and opens its box** (Tony, Oct 3). It used to clear them to blank, and blank rows can never be sent here, so a None pick could not be checked (PHYS_NPT). Ticking another row ✓ still clears None. Unticking None leaves the X's.
- Request: `{ code, choices: [ticked], fixes: { id: text } }`, where `fixes` holds exactly the X'd unlocked ids. A missing, empty or extra fix → `invalid`.
- Grading:
  1. the set is graded first, as in §3 (wrong set → struck/miss, fixes not graded);
  2. right set → every fix is graded. An unreadable fix → `invalid`. The first wrong fix in authored order → `wrong` + `fixWrong: id` + that fix's own `wrong` hint, else the fix nudge.
  3. All right → correct. Same tries (TWO). The repeat check covers the set + the fixes.
- Sample: `CSCI26_A8F`.

## 4c. Four significant figures (Tony, 10-02, every typed number)

A typed number counts when it is right to 3 significant figures: |typed − answer| ≤ half a unit in the answer's 3rd figure (Tony, Oct 3: 5.665 vs 5.666 must pass). The prompt asks for at least 4 significant figures, so early rounding can't push a right answer off. It is checked on top of `tol`, never instead of it.
- Examples for $9\sqrt3 = 15.588…$: `15.59` ✓, `15.6` ✗.
- It applies to `num`, to `expr` (per point value), to `multi` parts and to fixes.
- It applies only to correctness, never to matching `wrong` entries or to repeat detection. An answer of 0 stays exact.
- `serve.py sig3()`, mirrored in app.js.

## 5. Open (Tony decides)

1. **Show the count?** ("Choose 2"). PrairieLearn makes it optional (`show-number-correct`), while Khan and Moodle hide it. Default here: **hidden**. Showing it turns the item into "choose k", which makes it easier and more like the worksheet.
2. **`miss` vs strike when both apply?** Default: the ticked distractor wins (step 1 before step 2), because a wrong tick is the bigger misconception.
3. **Tries for `pick: "all"`**: keep TWO, or THREE because sets are harder? Default: TWO (one rule for all of `mc`).
4. `"incomplete"` as a new error enum value vs reusing `other`. Default: add it, per MC.md ("add to the enum rather than overusing `other`").

## Sources
- PrairieLearn `pl-checkbox` (partial-credit methods, `min-select`, `show-number-correct`, per-answer feedback): https://docs.prairielearn.com/elements/pl-checkbox/
- Canvas New Quizzes Multiple Answer, "partial credit with penalty" or "exact match": https://community.instructure.com/en/kb/articles/661058-how-do-i-create-a-multiple-answer-question-in-new-quizzes , https://support.eclass.ualberta.ca/Knowledgebase/Article/View/570/55/exact-and-partial-answer-grading-in-canvas-new-quizzes
- Moodle "Multiple answers allowed" (select-all exploit without negative weights; no count hint): https://moodle.org/mod/forum/discuss.php?d=408460 , https://zenn.dev/rublix/articles/32e0bba27a0ac6?locale=en
- Khan Academy "Choose all answers that apply" + "None of the above" as a choice: https://www.khanacademy.org/math/get-ready-for-ap-calc/xa350bf684c056c5c:get-ready-for-differentiation-1/xa350bf684c056c5c:rational-exponents/e/manipulating-fractional-exponents
- NN/g, Checkboxes vs. Radio Buttons: https://www.nngroup.com/articles/checkboxes-vs-radio-buttons/
