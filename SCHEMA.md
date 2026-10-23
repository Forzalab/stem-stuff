# SCHEMA: problems.json (the one file)

> **Render standard = the OpenUI Lang plan.** Runbook: brain `projects/calc/_files/sprint-render-v2/SPRINT.md` (plan: `projects/calc/topics/openui-render-arch-plan-2026-10-18.md`). No new view/widget format.

Everything lives in **one file: `problems.json`**. It holds every problem, answer, wrong answer and hint.
This document is the only schema. The JSON Schemas below are machine-read by the tests (`tests/schemas.mjs` pulls the fenced block after each `<!-- schema: ... -->` marker), so edit them here and nowhere else.

How the file is used:
- **Server** (`serve.py`): reads `problems.json` next to it (or the path given as its 2nd argument). Edit or replace the file and the next request sees it (no restart). The browser never gets the file: `GET /p/<CODE>.json` returns only the public part (`code`, `type`, `var`, `body`, `choices`), and `POST /check` grades on the server.
- **Upload** (the page's upload button, or the picker when the server is down): pick a `problems.json` and every problem in it is loaded at once. Grading then runs in the browser from that file.

Validate before every commit:

```
cd tests && npm install && npm test
```

## File shape

```json
{
  "v": 1,
  "problems": [
    { "code": "CALC1_T6B", "type": "num", "body": [ ... ], "answer": "12", "wrong": [ ... ], "nudge": "QUACK. ..." },
    { "code": "CALC1_X2P", "type": "mc",  "body": [ ... ], "choices": [ ... ], "correct": "b", "wrong": [ ... ] }
  ]
}
```

A bank file may add a `"bank"` flag (optional): the bank's id, `BANK_` + 3–6 of `A-Z0-9`, e.g. `"bank": "BANK_BEAR"`. A file that uses only the built-in code prefixes never needs it. A file that contains any custom-prefix code must carry a valid flag whose name matches that prefix (see Codes). A hosted bank's id is its file name (`banks/BANK_XXX.json`); an uploaded bank's id is this field, and the upload's file name is never read.

A bank file may add a `"profile"` (optional): `subject` (physics.mechanics | physics.em | discrete | cs), `audience` (one sentence:
who the students are; it replaces the default Fresno physics line in Cluck's prompts), `skill_domains` (["algebra"]), `kits` (visual
kits that fit: author/kits/). No profile = today's behavior.

A bank file may add a `"burst_gap_s"` (optional, top level next to `profile`): a number, 60 to 600, the minimum seconds between two full-screen reward bursts in that bank (sugar mode; a level up always bursts). Absent = 15 s, today's behavior. Anything else (a string, a number outside 60-600) is ignored as if absent. Dead-easy items (`saccharine.dead`) never burst and never touch the gap. serve.py sends it in `GET /b/<code>.json` only when set; app.js passes it to `Rewards.gap()`.

Keep problems in any order: the page shuffles the list per browser (design/NAV.md), so file order is never shown. Codes must be unique (tests enforce it).

## Version table
`v` is the file's schema version: `1` (the oldest) or a date as an 8-digit integer, `yyyymmdd` (e.g. `20261022`). Bigger = newer; no `v` counts as `1`.
Each dated version is one row: what it requires, the check that proves it, and the sunset for banks older than it. Before the sunset an
older bank still loads, with a banner on its question list: "BANK_X must be updated by 2026-11-05". From the sunset (Pacific date) it does
not load, and opening it shows that same line instead (serve.py `bank_notice`, `today`; app.js; codes.mjs `bankNotice`). `STEM_TODAY=yyyy-mm-dd` pins that clock; tests/run-all.sh pins 2026-10-23 so the v:1 test banks survive the sunset. problems.json is
not a bank and is never dropped. To move a bank up, follow design/BANK-MIGRATION.md. Never change a row; fix a mistake with a new row.

| `v` | Requires | Check | Sunset for older banks |
|---|---|---|---|
| `20261022` | `form` on every `num` item and every `num` part (and the slip gate, design/HANDOFF-slips-v2.md rule 7) | `python3 tools/slips.py --strict` | `2026-11-05` |

## Content rule (Tony, standing)
- MINIMAL. Textbook language. State the givens and the ask, nothing else.
- No table unless the data is a table (e.g. a limit table of x vs f(x)). Givens go in the sentence.
- No bold/emphasis, no chatty lead-ins, no restating what the figure shows.
- Units in the ask: "Find the stretch of the spring, in $\\text{m}$."

## Codes
- Format is `PREFIX_SUFFIX` (underscore: it joins words, so one double-tap on a phone selects the whole code; the page still accepts `-` or a space and normalizes to `_`). Built-in prefixes: `CALC1` (calculus), `PHYS` (physics), `CSCI26` (discrete math), `PSY` (psychology). They work in every file, flagged or not.
- **Custom prefixes:** 3–6 of `A-Z0-9`, starting with a letter, never a built-in and never a reserved word (`BANK`, `DIET`, `SUGAR`, `ADMIN`, `UNADMIN`: the code box eats the last four, `BANK` is the bank id). A custom prefix **equals the bank flag minus `BANK_`**: `BEAR_QAA` belongs to `"bank": "BANK_BEAR"`. A code alone therefore names its bank, so a shared link on a device without it says `BEAR_QAA needs BANK_BEAR`. A file with custom-prefix codes and no valid flag (or a flag that names another prefix) loads without those codes and says why; its built-in-prefix codes still load. One custom prefix per bank (built-ins may be mixed in).
- The suffix is 3 characters, A–Z and 0–9 (the page accepts 3–6). Don't use O/0 or I/1 (an authoring rule, the page does not refuse them).
- **A suffix must be unique across the four built-in prefixes** (the tests enforce this), and unique within a custom prefix.
- The lengths and word lists live in one place, `codes.mjs`; the patterns below are generated from it and a test keeps them equal.

## One problem
| key | for | meaning | served to the browser |
|---|---|---|---|
| `code` | all | `CALC1_K4M` | yes |
| `title` | all, optional | brief plain-text title for the question list (≤ 60 chars, never the answer) | yes |
| `type` | all | `num` one value · `expr` a function of `var` · `text` a word/phrase/code typed exactly · `mc` pick one choice · `multi` 2–4 answer boxes, each graded on its own | yes |
| `body` | all | array of blocks, stacked top to bottom in any order and repeatable | yes |
| `how` | `text`, `multi` (required); others optional | **how to type the answer**, shown right above the answer box: "Type TRUE or FALSE.", "Two decimals, in the order asked.", "Type the condition, like `if (x && y)`." | yes |
| `var` | `expr` | defaults to `x`. For physics, use `t`. | yes |
| `choices` | `mc` | 2–8 `{ "id": "a", "md": "$9$", "lock"?: true }`. Up to 5 are shown (A–E). `lock` pins a choice to its slot ("none of these", DNE). | yes |
| `shuffle` | `mc` | default `true`: choices are shuffled once per browser (same order on every reload; locked ones stay put). `false`: authored order (rarely wanted: leave it out; a converted problem never sets it just to keep its order). | yes |
| `parts` | `multi` | the boxes, in order: `{ "label"?: "A", "prompt"?: "...", "type": "num" \| "expr" \| "text", "answer", "accept"?, "tol"?, "points"?, "var"?, "wrong"? }`. Labels default to A, B, C, D. `prompt` is the sub-question for that box (next row). | label + prompt + type only |
| `parts[].prompt` | `multi`, optional | the sub-question for that box: `md` string or array of lines, same format as a `text` block (markdown, `$..$` KaTeX). The page shows it as **a)**, **b)**, **c)**, **d)** with its own box beside it (phone: box under it), each box with its own submit arrow. Put the shared givens in `body` and each question in its part's `prompt`. A part without a `prompt` is just its "a)" and its box. Keep `how` for typing instructions, not questions. | yes |
| `answer` | `num`, `expr`, `text` | `num`/`expr`: math.js string, or exactly `"dne"`. `text`: the exact answer text. | **no** |
| `accept` | `text` | other spellings that also count (`["T", "true"]`) | **no** |
| `points` | `expr` | at least 3 sample values of `var`, inside the domain | **no** |
| `tol` | `num`, `expr` | relative tolerance: right when \|typed − answer\| ≤ tol × \|answer\|. Default: `0.02` for `num` (WebAssign's default), `1e-6` for `expr` and a hard-mode fix box. A zero answer is absolute: \|typed\| ≤ 1e-9. Set it when the question needs another window, with `tol_why` (below). `wrong` matches, repeats and slips use `tol` or `1e-6`. | **no** |
| `tol_why` | with `tol` | one line: why this window fits the question and the topic quizzed ("counting: an off-by-one is the error"). `python3 tools/tol.py --write` writes `tol: 1e-4` with its own line on a definitive key (the wiggle test: g 9.8/9.81, π 3.14/3.1416, each datum ±1 in its last digit leave the key unchanged). Why a rule at all: the old window `tol*max(1,|answer|)` was absolute below 1, so 0 was right for 0.00624. | **no** |
| `correct` | `mc` | id of the right choice | **no** |
| `wrong` | all but `multi` (required for `mc`; `multi` puts them in each part) | known wrong answers, each with an error type and Cluck's hint (below) | **no** |
| `nudge` | all but `mc` | Cluck's hint for a wrong answer that matches nothing in `wrong` | **no** |

**Never put the answer in `body`, a graph's `alt`, `title`, `how`, a part's `prompt`, a choice's text beyond the choice itself, or a hint.**

## Converting a worksheet (rules)
- **One number** → `num`. **A formula** → `expr`.
- **A fixed set of options** → `mc` with exactly those options, no filler:
  - TRUE / FALSE → **2 choices**. T / F / MAYBE → **3 choices**. MODUS PONENS / MODUS TOLLENS / NEITHER → 3. Four named options → 4. Five or more → 5–8.
  - Only 2 choices means only ONE try (see Grading), so keep a third choice only if it names a real error.
  - Every non-correct choice still needs its `wrong` entry (error + hint).
- **A typed answer that can be made binary** (like the gate-chain XOR question: "which if statement...", "greater than .5?") **becomes a 2-choice `mc`**, not a `num`/`text`. Word the question so the two choices are the two live answers, and give the wrong one an error type + hint.
- **A free word, phrase, symbol or code line** (□¬P, `if (!a || b)`) → `text`, with `how` saying exactly what to type and in what form (symbols: say how to type them on a keyboard, e.g. "Type `[]` for □, `<>` for ◇, `~` for ¬", and list those spellings in `accept`).
- **Several answers to one question** ("write both, in that order") → one `multi` problem, one part per blank, in the worksheet's order. Never split it into separate problems. Put the shared givens in `body` and each blank's question in that part's `prompt` (a, b, c...); `how` stays for typing instructions. Each part picks its own type. A part that is a choice (`mc`, `pick: "all"` too) is loaded as its own `mc` question in the multi's place: code + `A`, `B`, `C`... (so the multi's code suffix must be 5 characters or fewer), the shared `body` then the part's `prompt` (codes.mjs / serve.py `unfold`). An uploaded `multi` part with no typed `answer` is skipped ("Loaded N, skipped M").
- Prove mode `fix.how` is the fix box's **placeholder**: 20 characters at most, abbreviations fine ("≥4 sigfigs, no unit", "in x, * ^, no unit", "up / same / down"). It must fit the box on a 375px phone.
- A worksheet's strict **form** rule (".2", not "0.2") → a `text` part, with the form in `how`. `num` accepts every equal value.
- Keep the worksheet's wording. Put the needed rule lines (fuzzy NOT/AND/OR, what □ means) in the body of the problems that need them.

## Grading (server `POST /check`, or in the browser for an uploaded file)
- **Tries by choice count** (Tony, locked): a 2-choice `mc` gets **ONE** try (one wrong answer locks it); an `mc` with 3 or more shown choices gets **TWO**; `num`/`expr`/`text` get TWO; a `multi` gets TWO **per part**. There is no separate T/F type: TRUE/FALSE is a 2-choice `mc`. `serve.py` `max_tries()` and `app.js` `maxTries()` are the same rule (tests pin both). A repeat of the same wrong answer, or text that can't be read, does not count.
- `mc`: the answer is the choice id. `num`/`expr`: the typed value must equal `answer` within `tol` **or to 3 significant figures** (Tony, Oct 3; the prompt asks for at least 4. $15.59$ counts for $9\sqrt3$; `expr`: at every point in `points`); `dne` matches only `"dne"` / "does not exist".
- `text`: compared after lower-casing and removing all spaces, against `answer` and every `accept` entry. So `if(!a||b)` = `if (!a || b)`, `modus tollens` = `MODUS TOLLENS`.
- `multi`: **each part is graded alone.** `POST /check` takes `{ code, part: i, answer }` (`i` = 0 for a, 1 for b...) and the reply carries `part: i`. Each part has its own tries (the `num`/`expr`/`text` rule: TWO), its own repeat check and its own lockout, keyed by (browser, code, part): a part locks by itself when its tries run out and never locks the others. The old whole-set body `{ parts: [...] }` is not accepted (`invalid`). Every box has its own inline submit arrow, off while that box is empty; Enter in a box submits that box. A right part turns green and read-only; a wrong part shows the hint of the first of *its own* `wrong` entries it matched, else the problem `nudge`, else the default nudge. The problem is finished when every part is right or locked, and counts as correct only if every part is right.
- A wrong answer gets the hint of the first `wrong` entry it matches (`re` entries first, then `match`), else `nudge`, else a default nudge.
- Reply: `{ "verdict": "correct" | "wrong" | "invalid" | "locked", "triesLeft": 1, "gen": 7, "error"?: "sign", "hint"?: "QUACK. ...", "families"?: ["op-swap", "sign"] }`. `families` is on a `correct` reply only: the item's distractor error families, sorted, no choice map (J6 trap_beaten; on device, never sent on to analytics). The answer is never sent, with ONE exception (T19, Tony Oct 12): in SUGAR mode only, the reply that shuts a question out of tries (and any later `locked` reply, and `/state` for it) carries `correct` (mc: the right id, pick all: the ids, num: the value to 4 figures, text/expr: the authored answer; a multi: that part's). Never before lockout, never in diet (serve.py `answer_of`, `dispatch`; app.js `gradeLocal` for an upload). The page shows it as the green right row / an "Answer" line, and a revealed question pays 0 XP and stays a miss. Also sugar only: a pick-all `wrong` reply whose ticks are all right carries `kept` (the ticked ids, sorted; never an unticked one, never alongside a false tick), so the page can keep those rows (design/CHOOSE-ALL.md §4).
- `GET /state/<CODE>` (same cookie): `{ "wrong": 1, "done": false, "gen": 7 }`. Tries live in `tries.json` and survive a restart; `gen` lets the page tell a hand reset from a lost file (design/DONE.md).
- Shuffle: the server seeds it from the browser's cookie + the code; an uploaded file seeds it from a random id kept in this browser. Letters A–E follow the shown order; the answer sent is always the choice id.

## Wrong answers and hints
Author in this order:
1. **Vet the choices first.** Write the correct answer. Build each MC distractor (and each known freeform wrong answer) from a named error type. No filler distractors: if you can't name the mistake, replace the choice (or use fewer choices).
2. **Then write one hint per wrong answer** in Cluck's voice: starts `QUACK.`, one pointed question or action that names the error, never the answer, about 25 words max.

`wrong` entry: `{ "choice": "a" }` (mc) or `{ "match": "4" }` (`num`/`expr`: a value, equal within `tol`; `text`: text, compared like the answer) or `{ "re": "^dne$" }` (case-insensitive regex on the typed text), plus `"error"` and `"hint"`.
MC: exactly one `wrong` entry per distractor (tests enforce it).

**Slips from the formula** (`num`, optional `form`): write the answer as one plain-number expression in `form` (`"form": "1/((4/3)^2+(1/3)^2+(2/3)^2)"`; tests check it equals `answer`). The grader sees only the typed number. After the `wrong` entries miss and before `nudge`, a typed value that sits on a slip of `form` (within `tol` or to 3 s.f.) gets that family's fixed hint (`FAMILY_HINT`; names the family only), in both modes and on the device for an upload. The slips are the 10 families of `slips.py` (`slips.FAMILIES`, in hint priority: `distribute` first, where −(b+c) → −b+c, the minus on the first term only), one change at a time. `python3 tools/slips.py banks/BANK_X.json` lists every slip value with no `wrong` entry (`MISSING`). Give a value a hand-written `wrong` entry when it needs a better hint (it wins), or list it in `ignore_slips` to stop its family hint. A slip that lands on the answer itself can't be told apart by number: the checker prints it as `SAME`. `--strict` exits 1 on a gate failure. For a bank with `v` ≥ `20261022` the gate is: a `num` item or part with no `form`, a slip equal to the answer (`SAME`), two families on one value (`CLASH`), or a `form` that does not equal `answer`; `MISSING` (a slip with no `wrong` entry) is only reported there, since the grader matches slips at runtime. An older bank is checked only where it has `form`, and there it fails on `form` ≠ `answer`, a `SAME`, or any `MISSING` slip.

**Slip scaling risk (Tony, Oct 23: ask Tony first).** The grader sees one number. Every extra slip candidate is another way for a random wrong answer to match by luck and get a wrong hint. Stop and ask Tony before any change that adds candidates:
- a new family in `slips.FAMILIES`;
- more positions or variants inside a family (more `units` powers, more `factor` values, every-term `distribute`);
- stacking (k ≥ 2, slips on slips);
- a wider `close()` window.

Bench (brain `projects/calc/_files/research-slips-bench-2026-10-23.md`, 31 forms, median / p90):

| k | candidates per form | false match | stack named right |
|---|---|---|---|
| 1 | ~15 | 0.4% / 0.9% | 100% |
| 2 | ~180 | 2.1% / 3.8% | 78% |
| 3 | ~1900 | 7.8% / 13.3% | 37% |

Candidates grow about linearly with families at k = 1 and about with their square at k = 2. A 3 s.f. answer has 900 values per decade, so candidates near that count saturate. Short forms are worst: `12/(100+200+300)` reaches 27% at k = 2. `close()` used `tol*max(1,|b|)`, an absolute window when `|answer| < 1` (14.8% false match at k = 1 for 0.4286); it is relative now (tolerance 1b). Storing the trees more compactly (shared subtrees, e-graphs) saves time, but the number of distinct values, and with it the false match rate, stays the same. With the proposal, bring the bench delta (false match %, ms per form). Design notes: `projects/calc/_files/research-slips-diagnosis-2026-10-23.md`.

Hint check (tests): a hint fails only if it contains the answer **and** the problem's body doesn't already show that text (answers of 1 character are skipped: too common).

Error types: `sign`, `op-swap`, `order-ops`, `arithmetic`, `algebra`, `off-by-factor`, `units`, `deg-rad`, `chain-rule`, `product-rule`, `quotient-rule`, `power-rule`, `limit-plug`, `domain`, `components`, `misread`, `fallacy`, `quantifier`, `negation`, `counting`, `off-by-one`, `format`, `other`. Add to the enum (in the schema below) rather than overusing `other`.

## Blocks
- Text: `{ "type": "text", "md": "..." }` or `"md": ["line", "", "line"]`.
  - Full GFM markdown: **bold**, lists, tables with `:---:` alignment.
  - `$..$` is inline math and `$$..$$` is display math.
  - Raw HTML is escaped. Images are ignored.
  - Prefer the array form for tables. Put a blank line (`""`) before a table.
- Graph: `{ "type": "graph", "kind": "cartesian" | "scene" | "bars" | "circuit" | "network", "alt": "...", ... }`.
  - `alt` is one sentence describing the figure. Screen readers read it and the Copy button copies it.

## JSON escaping (most common bug)
- Double every backslash: `"\\frac{1}{2}"`, `"\\vec F"`, `"30^\\circ"`.
- A TeX line break `\\` becomes `"\\\\"`.
- A literal dollar sign is `"\\$"`.
  - **Money eats text.** Any two bare `$` in one string pair up as inline math, money included: `"Paid $1 liars ... $20 liars"` renders the words between them as math, and both `$` vanish.
  - Fix: write every money `$` as `\\$` in the JSON: `"Paid \\$1 liars ... \\$20 liars"`.
  - Check before committing: `grep -nE '[^\\]\$[0-9][0-9.,]* +[A-Za-z]' problems.json banks/*.json` (a `$`, a number, a space, a word). Every match is a bare money sign; math like `$13$` is skipped.
  - Known, left as is: `banks/BANK_PSY6.json` (the Festinger & Carlsmith choices).
- Derivatives use dot notation: `\\dot{y}` (project rule).

## math.js (answers and graph expressions)
- Write `^` for powers and `*` for multiplication. Implicit multiplication like `4x` works, but explicit is safer.
- `ln` and `log` both mean natural log.
- Names that work: `e`, `pi`, `sqrt()`, `abs()`, `sin(30 deg)`.
- Numbers in graphs may be strings: `"pi/3"`.
- Check a physics answer by writing it as a formula, for example `"2.0*9.8*sin(25 deg)/150"`, with `tol: 0.01`.
- The server grades with **sympy** (`deploy.sh` installs it). It reads the same syntax, but only these tokens get through: numbers, `+ - * / ^`, parentheses, implicit multiplication (`2x`, `3pi`), `pi`, `e`, `deg`, `sqrt abs exp ln log log10 sin cos tan asin acos atan sec csc cot sinh cosh tanh`. Stick to these in `answer`, `match` and `points`.

## Colors, labels, anchors
- `color` is a token name only: `c1` (blue, main), `c2` (orange), `c3` (violet), `ink`, `muted`, `ok`, `bad`, `mark`. Never hex.
- `label` is plain text with optional `$..$`. Keep it to **6 labels or fewer per graph**.
- `anchor` says which side of the point the label sits on: `n ne e se s sw w nw c`.
- `dash: true` draws a dashed line. Use it for asymptotes, guides and "ghost" forces. A force acting on the body is always solid; dashed forces are only ones NOT acting on it (a force whose `at` is a `body` mark's `at` must not be dashed; tests enforce this).

## kind: cartesian (calc plots, and x-t, v-t, a-t graphs)
The axes are in world units, with y up.

```json
{ "type": "graph", "kind": "cartesian", "alt": "...",
  "x": { "min": -1, "max": 5, "label": "$x$" }, "y": { "min": -1, "max": 5, "label": "$y$" },
  "grid": true, "axes": true, "equal": false, "marks": [ ... ] }
```

Axis options:
- `step` sets the tick spacing. `0` means no ticks, and leaving it out means automatic.
- `ticks: [{ "at": "pi", "label": "$\\pi$" }]` gives custom tick labels.

Set `equal: true` for geometry, angles and arcs. For a pure vector diagram, set `axes: false, grid: false, equal: true`.

| mark | keys |
|---|---|
| `fn` | `y` (expression in x), `domain?` [a,b], `labelAt?` x |
| `param` | `x`, `y` (expressions in t), `t` [a,b]. A curve x = g(y) is `param` with `x:"g(t)", y:"t"`. |
| `shade` | `f`, `g` (default `"0"`), `from`, `to`, `var` x or y. It shades between f and g. |
| `tangent` | `of` (expression), `at` x, `len?`, `point?` |
| `vline` / `hline` | `x` / `y`. Add `dash` for an asymptote. |
| `point` | `at` [x,y]. Add `open: true` for a hole. |
| `seg`, `arrow` | `from`, `to`. `arrow` also takes `both?`. |
| `arc` | `at`, `r`, `from`, `to` (degrees CCW from +x), `arrow?` |
| `poly` | `pts` (at least 3), `fill?` |
| `text` | `at`, `text` |
| `right` | `at` (the corner), `from`, `to` (a point on each ray), `size?` | a right-angle square at the corner |
| `dim` | `from`, `to`, `label`, `side?` l/r (default l, seen walking from→to) | a dimension line set off the segment, end ticks, the label at its middle |
| `angle` | `at` (the vertex), `from`, `to` (a point on each ray), `label`, `r?` | an arc for the smaller angle between the rays, the label on the bisector |
| `circle` | `c` [x,y], `r`, `fill?` | a circle (the same as `arc` 0 to 360) |

The four geometry marks (`right`, `dim`, `angle`, `circle`) also work in a scene. Their labels count toward a live figure's 6-label cap, and a number in a `dim` or `angle` label must be a given, never the answer. Use `equal: true` in cartesian so the right angle looks square.

## kind: scene (every physics diagram)
Scenes use world units (meters are fine), y up and a 1:1 scale. The picture auto-fits, so there is no frame to set.

Angles are degrees counterclockwise from +x. A `force` can have a tilted `frame`: with `"frame": 30`, angle 0 means up a 30° slope, 90 means the outward normal and 180 means down the slope.

| mark | keys | draws |
|---|---|---|
| `body` | `at` (center), `shape` box/dot/disk/ring/rod, `w`,`h` (box, rod), `r` (dot, disk, ring), `angle`, `fill` | blocks, masses, pucks, wheels, rods |
| `spring` | `from`, `to`, `coils`, `width` | a zigzag coil. The same coils stretch or squeeze with the length. |
| `pulley` | `at`, `r`, `mount?` [x,y] | a wheel and axle. `mount` draws a bracket to the ceiling or wall. |
| `rope` | `pts` (at least 2) | strings and ropes (a polyline) |
| `surface` | `from`, `to`, `side` right/left | a hatched ground, wall or ceiling. `side` is the hatch side seen walking from→to. |
| `incline` | `at` (the vertex with the angle), `base`, `angle`, `flip?` | a ramp triangle and its angle arc. The label is the angle. |
| `force` | `at`, `angle`, `len`, `frame?` | a force arrow starting at `at` |
| `path` | `pts`, or `fn` + `domain`, or `x`,`y`,`t`; `arrow?` | trajectories, loops and motion paths |
| `pivot` | `at`, `size?` | a hinge triangle (rods, torque, pendulums) |
| `axes` | `at`, `angle`, `len?`, `x?`, `y?` | a small tilted coordinate cross |
| `point`, `seg`, `arrow`, `arc`, `poly`, `text`, `right`, `dim`, `angle`, `circle` | same as cartesian | |

Placing a box on a slope: the slope unit vector is u = (cos θ, sin θ) and the normal is n = (−sin θ, cos θ). A box that is d along the slope, with height h, has its center at d·u + (h/2)·n. Set the box's `angle: θ`. Put the forces' `at` at that center.

Recipes (sketches, not full files):
- **Pendulum.** `surface` ceiling, `pivot` at the top, `rope` from the pivot to the bob, `body` dot, `arc` for θ with `dash`, then forces T and mg.
- **Atwood machine.** `surface` ceiling, `pulley` with `mount`, two `rope`s hanging down from the rim, two `body` boxes.
- **Circular motion.** `arc` from 0 to 360 with `dash` for the path, `body` dot on it, `force` for velocity (tangent) and for acceleration (toward the center).
- **Projectile.** `surface` ground, then `path` with `x: "v0*cos(40 deg)*t"`, `y: "v0*sin(40 deg)*t - 4.9t^2"` (write numbers in place of v0), then velocity `force`s at a few points.
- **Spring and mass.** `surface` wall with `side`, `spring` from the wall to the block face, `body` box, `surface` floor.
- **Torque.** `body` rod, `pivot` at one end, `force` at the other end, `arc` for the angle.
- **Collision.** Two scenes stacked (before, then after) with a text block between them.

## kind: bars (energy bar charts, LOL diagrams)
```json
{ "type": "graph", "kind": "bars", "alt": "...", "unit": "J", "min": -2, "max": 10,
  "groups": [ { "label": "initial", "bars": [ { "label": "$K$", "value": 0 }, { "label": "$U_g$", "value": 8, "color": "c2" } ] },
              { "label": "final",   "bars": [ { "label": "$K$", "value": 8, "color": "c1" }, { "label": "$U_g$", "value": 0 } ] } ] }
```
Values can be negative.

## kind: circuit (logic gates)
```json
{ "type": "graph", "kind": "circuit", "alt": "...",
  "inputs": ["a", "b", { "name": "c", "value": 1 }],
  "gates": [ { "id": "g1", "op": "and", "in": ["a", "b"] },
             { "id": "g2", "op": "not", "in": ["c"] },
             { "id": "g3", "op": "xor", "in": ["g1", "g2"], "label": "G3" } ],
  "outputs": [ { "from": "g3", "label": "$Q$" } ] }
```
The page lays it out: inputs on the left in the order written, each gate one column right of its latest input, outputs on the right. Wires are drawn square, with a dot where one wire branches.

| op | inputs | draws | C++ |
|---|---|---|---|
| `and` / `nand` | 2–4 | flat back, round front (nand: + bubble) | `a && b` / `!(a && b)` |
| `or` / `nor` | 2–4 | curved back, pointed front (nor: + bubble) | `a \|\| b` / `!(a \|\| b)` |
| `xor` / `xnor` | 2–4 | OR with a second back curve (xnor: + bubble) | `a ^ b` / `!(a ^ b)` |
| `not` / `buf` | exactly 1 | triangle (not: + bubble) | `!a` / `a` |

- Kerney writes `^` for XOR (C++ bitwise XOR, fine on `bool`). Say so in the body when a problem needs it; `^` binds tighter than `&&` and `||`.
- Names (`inputs`, gate `id`) are letters, digits and `_`, starting with a letter. A one-letter name is drawn as math ($a$); `x1` as $x_1$.
- `label` on a gate is a small name above it (G1, G2...). An output's `label` is drawn at its end in blue; it defaults to its gate's label, else the id.
- An input can carry `value: 0 | 1`, shown as a small orange "= 1" after its name. **Outputs never carry a value** (that would be the answer).
- Escape hatches, only when the automatic layout reads badly: `col` (integer ≥ 1) pushes a gate to a later column; `row` (≥ 0, 1 row = 1.4 gate heights, 0 = the first input's row) pins its height.
- Up to 8 gates look clean on a phone. Each label counts toward the 6-label limit (input names do not).
- Tests check the wiring: unique names, every `in`/`from` is a known name, no loop, every gate reaches an output.

## kind: network (graph theory: vertices and edges, trees)
```json
{ "type": "graph", "kind": "network", "alt": "...",
  "directed": false, "layout": "circle",
  "nodes": ["a", "b", { "id": "c", "color": "c2" }, "d"],
  "edges": [ { "from": "a", "to": "b" }, { "from": "a", "to": "b" },
             { "from": "b", "to": "c", "w": 4 },
             { "from": "c", "to": "c" },
             { "from": "c", "to": "d", "dash": true } ] }
```
One shape covers every graph Rosen ch. 10–11 needs. Same shape as Graphviz / NetworkX / vis-network: a `directed` flag, a node list, an edge list of `from`/`to`.

| want | write |
|---|---|
| simple graph | each pair at most once, no `from == to` |
| multigraph | the same pair twice or more (drawn as bows) |
| pseudograph | add a loop: `from == to` |
| directed graph | `"directed": true` (every edge gets an arrowhead, `from` → `to`) |
| weighted graph | `w` on each edge (a number, drawn mid-edge) |
| K_n, C_n | `layout: "circle"` (the default): nodes in the order written, first at the top, clockwise |
| tree, rooted tree | `layout: "tree"`, `root`. Children go left to right in edge order. |
| bipartite, grid, Q_3, anything else | `layout: "free"`, `at: [x, y]` on every node (y up, auto-fit, 1:1) |
| two graphs (isomorphism) | two network blocks |

- `nodes`: 1–12. A string is the id; an object adds `label` (drawn in place of the id), `color`, `at`. Ids follow the circuit name rule; `v1` is drawn as $v_1$.
- `edges`: up to 30. `w` (weight) or `label` (wins over `w`), `color`, `dash`.
- Node ids and `w` do not count toward the 6-label limit. `label` does.
- **Never color or dash the answer** (the asked path, coloring, spanning tree, matching). Color only what the problem gives.
- Tests check: unique ids, every `from`/`to` is a node, `free` ⇒ every node has `at`, `tree` ⇒ the edges form a tree hanging off `root`.

## Live figures (Cluck, Claude path only)
Cluck's reply may carry ONE figure made live by the model, as data: a fenced block, a line ```` ```fig ````, one line of JSON, a line ```` ``` ````. The JSON is a graph block of this file, nothing else (no SVG, HTML or JS, ever). `livefig.py` checks it on the server before a byte of it reaches the page; any failure drops the block silently and the text still streams.
- **When:** every `/explain` and `/chat` reply on the Claude path (Tony, Oct 17: live figures are Cluck's mainstay where a picture helps). An authored figure stays on the question; the live one sits in Cluck's message. The OpenRouter path never gets the instructions and strips any fence. `CLUCK_LIVE_FIGS=0` turns it off (the same strip).
- **Schema:** valid against `#/$defs/graph` in the problems schema below (`livefig.py` reads this file at runtime; it is in the Vercel bundle; missing = no figure passes).
- **Whitelist:** kinds `cartesian`, `scene`, `bars`, `network` (no `circuit`). Cartesian marks `fn shade vline hline point seg arrow arc poly text`; scene marks `body spring pulley rope surface incline force pivot point seg arrow arc text` (no `param`, `tangent`, `path`). `fn`/`shade` expressions: digits, letters, `+ - * / ^ ( ) . ,` only.
- **Caps:** JSON ≤ 3000 chars, ≤ 12 marks, ≤ 6 labels (every `label`, `text`, axis label, tick, bar and group label), ≤ 12 points per poly/rope, ≤ 8 nodes, ≤ 16 edges, ≤ 3 groups of ≤ 4 bars, alt ≤ 200 chars; every number finite, |v| ≤ 10000. A force at a body's center is never dashed.
- **Numbers (same rule as the text: only from the KEY):** a number in a `label`, `text`, `alt`, `unit`, bar `value`, edge `w` or an expression must appear in the question text, its shown choices, its sheet formulas or the KEY (0–10 always pass). Positions and sizes are free layout.
- **No leak:** none of those numbers may equal, to 3 significant figures, the hidden unknown (`answer`, the right choice(s), a `\boxed{}` in the KEY) unless the question text itself shows it. Label the unknown with its symbol: `$v_f = ?$`.
- **Stream:** the server holds a fence until it closes and sends the checked block whole (re-serialized, one line); only the first good one per reply. The page (`app.js` `wishHTML` / `wishFigs`) shows nothing for an open fence and draws a closed one with `Graph.render`, alt text on error.
- Tests: `tests/test_livefig.py`, `tests/livefig.test.mjs` (Ajv agrees), `tests/livefig.pw.mjs`; fixtures `tests/fixtures/livefig.json`.

## Views (render v2: OpenUI Lang, profile "stem")
Not live yet (P0 skeleton). A view is OpenUI Lang source built from the library below; engines compute every checkable value, the server gate decides what may show. Tests: `tests/test_views.py`, `tests/views.test.mjs` (Ajv compiles the schema).

**Slots (`$t.<id>`, views plan Oct 20).** Any student-facing string may be the whole literal `"$t.<id>"` (id `^[a-z][a-z0-9_]{0,31}$`); the words come later in a `t` map, `{id: text}`, passed to the renderer (`render(src, mount, {t})`). views.js fills each slot from `t`; an id `t` lacks paints as an outlined empty box `<span class="vw-tslot" data-slot="<id>">`, which a later Playwright step measures. Caps apply to the filled text, not the ref; oui.py takes a slot wherever a string is allowed and `aiw.lint_view_strings` passes it (its fill is linted). `views/registry.json` `slot` holds the convention; each component's `words` gives every student-facing prop a UI `role` (button, label, heading, body, chip; shadcn naming) and a `wordClass` (verb_phrase, noun_phrase, adj, sentence); `slot.not_words` lists the string props that carry data, not words.

**Measure (`tools/measure_slots.mjs`, step 3).** `node tools/measure_slots.mjs <view.oui> --out <dir> [--width 390] [--base <url>]` paints the view on the lab page (`try/views-demo.html`, its demo views swapped for one mount; no `--base` starts `serve.py` itself) with no `t` map, so every slot is a `.vw-tslot[data-slot]` box labelled by its id, and writes `slots.png` plus `slots.json` `{width, rows}`, one row per slot `{id, component, prop, role, wordClass, box:{x,y,w,h}, lines, maxChars}`. component + prop come from the parsed program (the element whose prop holds the literal `$t.<id>`; inline elements and list items keep their owner's prop), role + wordClass from the registry `words`. `box` is the content box of the element the filled text sits in (the slot's nearest non-inline parent); when that element is content-sized (a pill or chip that grows with its label) its width is the width the layout lets it grow to, probed with a long label, so maxChars never depends on the slot id's length. `lines`: body = ceil(prop maxLength / chars per line), heading = 2 when that parent wraps, button / label / chip = 1. `maxChars` = floor(box width / average char width) × lines, capped by the prop's maxLength; the char width is canvas `measureText` of an English sentence in the parent's computed font. A slot with no registry role exits 1. Test: `tests/measure-slots.pw.mjs` (360 / 390 / 1280, incl. the A–D regression: a choice button sized for "a)" gets a budget far under a phrase).
<!-- views:begin (generated by tools/gen_views.py from views/registry.json; do not edit) -->
Library 0.2.0, profile `stem`. Source: `views/registry.json`; regenerate with `python3 tools/gen_views.py`. Outputs: `views/library.json` (shipping components only), `views/prompt/*.md`, `views/checkers.json`, this block. Args show caps: `string≤N` characters, `[]≤N` items. No look props (F3); look = CSS by cascade.

Marks (the only state words): `cur`, `done`, `front`, `rec`, `idle`, `tree`, `seen`, `skip`, `k1`, `k2`, `k3`. Banned prop names: `color`, `colour`, `size`, `icon`, `style`, `class`, `className`, `bg`, `background`, `width`, `height`, `font`, `theme`, `variant`. `answer` or `key` may name a prop only as `Predict.answer`, a required key reference (`^key\.[A-Za-z0-9_.-]+$`), never a literal.

| Ref | Allowed stages | What |
|---|---|---|
| `given.*` | pre, wrong, post | item givens (given.m, given.v0) |
| `fig.*` | pre, wrong, post | item figures (fig0, fig1) |
| `wrong.*` | wrong, post | the picked distractor: wrong.error tag, wrong.text |
| `key.*` | post | hidden answer values (key.v1); the gate drops any key ref, or literal equal to a key value, outside post |

| Component | Layer | Kind | Ships | Args | Checker |
|---|---|---|---|---|---|
| View | L0 | layout | P1.1 | `View(children: Component[]≤6)` |  |
| Head | L0 | layout | P1.1 | `Head(title: string≤60, sub?: string≤140)` |  |
| Text | L0 | layout | P1.1 | `Text(text: string≤400)` |  |
| Legend | L0 | layout | P1.1 | `Legend(items: string≤32[]≤8)` |  |
| Table | L0 | layout | P1.1 | `Table(head: string≤24[]≤5, rows: string≤40[]≤5[]≤12)` |  |
| Math | L0 | domain | planned | `Math(tex: string≤200)` | symbolic.simplify |
| Chips | L0 | layout | planned | `Chips(items: string≤32[]≤8)` |  |
| Callout | L1 | layout | P1.1 | `Callout(tag: string≤24, text: string≤400)` |  |
| Steps | L1 | interaction | P1.1 | `Steps(fig?: Graph, steps: Step[]≤8, front?: string≤32, head?: string≤24[]≤5)` |  |
| Step | L1 | layout | P1.1 | `Step(cap: string≤140, nodes?: string≤200, edges?: string≤300, tags?: string≤200, labels?: string≤40[]≤12, front?: string≤8[]≤8, rows?: string≤40[]≤5[]≤12)` |  |
| Hints | L1 | interaction | P1.1 | `Hints(hints: string≤200[]≤3)` |  |
| Predict | L1 | interaction | P1.1 | `Predict(tag?: string≤24, q: string≤140, choices: string≤24[]≤5, struck?: string≤24[]≤4, tries?: number, answer: key.<id>)` |  |
| Reveal | L1 | interaction | P1.1 | `Reveal(lock: string≤80, body?: Component[]≤4)` |  |
| Answer | L1 | layout | P1.1 | `Answer(value: string≤40, text?: string≤140)` |  |
| Doodle | L1 | layout | P1.1 | `Doodle(kind: "duck" | "heart" | "star" | "spark", text?: string≤80)` |  |
| Compare | L1 | layout | planned | `Compare(children: Component[]≤2)` |  |
| Slider | L1 | interaction | planned | `Slider(value: any, min: number, max: number, step?: number, label?: string≤40)` |  |
| Choice | L1 | interaction | planned | `Choice(q: string≤140, options: string≤60[]≤3)` |  |
| Assume | L1 | interaction | planned | `Assume(text: string≤80, alts?: string≤60[]≤3)` |  |
| MatchQuiz | L1 | interaction | planned | `MatchQuiz(pairs: string≤80[]≤2[]≤6)` | text.term_cards |
| ITable | L1 | domain | planned | `ITable(kind: "kmap" | "truth" | "matrix" | "dp", spec: any)` | logic.truth_table |
| Graph | L2 | domain | P1.1 | `Graph(nodes: string≤600, edges: string≤600, cols?: string≤200, marks?: string≤400)` | graph.trace |
| Geometry | L1 | layout | P1.1 | `Geometry(pts: string≤240, marks: string≤80[]≤12, alt?: string≤160)` |  |
| FlowNet | L2 | domain | planned | `FlowNet(flow: any)` | graph.maxflow |
| Plot | L2 | domain | planned | `Plot(data: any)` | numeric.sample |
| Riemann | L2 | domain | planned | `Riemann(data: any)` | numeric.riemann |
| FBD | L2 | domain | planned | `FBD(data: any)` | vectors.resolve |
| Timeline | L2 | domain | planned | `Timeline(data: any)` | sequence.timeline |

| Recipe | Stages | Length | Components |
|---|---|---|---|
| hint-line | pre, wrong | S | Hints |
| misconception | wrong | S | Callout, Chips |
| predict-reveal | pre, wrong, post | S | Predict, Reveal, Callout |
| steps | wrong, post | M | Steps, Step, Graph, Legend, Table |
| twin-compare | pre, wrong, post | M | Compare, Steps, Step, Graph, Legend |
| slider-explore | pre, post | M | Slider, Plot, Riemann |
| concept-match | pre, wrong, post | M | Callout, MatchQuiz, Table |
| answer-table | post | S | Answer, Table, Chips |

| Engine | Ships | Tools |
|---|---|---|
| graph | P0.3 | graph.trace, graph.maxflow, graph.coloring, graph.mst |
| symbolic | P0.3 | symbolic.simplify, symbolic.integrate, symbolic.derivative, symbolic.solve, symbolic.series_test |
| numeric | planned | numeric.sample, numeric.riemann, numeric.partial_sums |
| units | planned | units.convert, units.dimension_check, units.sig_figs |
| vectors | planned | vectors.resolve, vectors.triangle |
| logic | planned | logic.kmap_groups, logic.truth_table, logic.dp_table |
| stats | planned | stats.distribution, stats.sample_stats |
| sequence | planned | sequence.order, sequence.timeline |
| text | planned | text.term_cards, text.distinction |

<!-- schema: views -->
```json
{
  "description": "An item's views[]: authored OpenUI Lang views, one per stage (render v2 P3.1 wires it into problems).",
  "type": "array",
  "items": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "stage",
      "recipe",
      "src"
    ],
    "properties": {
      "stage": {
        "type": "string",
        "pattern": "^(pre|post|wrong:[A-Za-z0-9_-]+)$"
      },
      "recipe": {
        "enum": [
          "hint-line",
          "misconception",
          "predict-reveal",
          "steps",
          "twin-compare",
          "slider-explore",
          "concept-match",
          "answer-table"
        ]
      },
      "src": {
        "type": "string",
        "minLength": 1
      },
      "lib": {
        "type": "string",
        "description": "library version the view was checked against"
      }
    }
  }
}
```
<!-- views:end -->

**Copy gate (`copy-words`, `copy_gate.py`).** Runs on a view's student-facing strings (`{slot_id: text}`). Every issue names its slot. `fk`: the Flesch-Kincaid grade of the whole view text, joined with one sentence per slot after TeX and numbers-with-units are stripped, must be 2–4. Under 20 words the score is noise, so the check is skipped. `jargon`: no word or 2–3-gram from `views/allow/<course>-black.json`. `overflow`: no slot is longer than its character budget. `aiw`: no blocking `aiw.lint_view_strings` finding. The blacklist comes from `python3 tools/jargon.py`, which reads the sources in `views/allow/sources.json`. Provenance is set by file extension: `.json` and `.md` count as AI, every other type counts as human. A term is blacklisted when it is not common English (`views/allow/common-en.txt`, top 5000, wordfreq data, CC-BY-SA-4.0), appears 3 or more times in AI sources, and appears at most once in human sources. Tests: `tests/test_copy_gate.py`, `tests/test_jargon.py`.

## Checklist before commit
1. `cd tests && npm test` passes. It checks the schema, unique codes and suffixes, that answers and `match` values evaluate, that TeX renders, that graph math compiles, the label count, MC distractor coverage, and that no hint states the answer.
2. Open `/#<CODE>` locally. The figure reads correctly, no labels overlap, and the width is fine on a phone.
3. The answer is nowhere in the body, `alt` or a hint.

## Examples (all in `problems.json`)
- `CALC1_T6B`: markdown table + limit, with known wrong answers and a nudge
- `CALC1_A9R`: text + cartesian shaded region + text
- `CALC1_X2P`: multiple choice, one hint per distractor
- `PHYS_F3N`: text + incline FBD scene + text
- `PHYS_S2K`: text + incline and spring scene
- `CSCI26_L3G`: text + logic circuit, multiple choice of C++ `if` statements
- `CSCI26_G3H`: text + network (pseudograph: parallel edges, a loop), two-part degree count
- `CSCI26_G2T`: text + network, `layout: "tree"`, leaves and height

## JSON Schema: problems.json

<!-- schema: problems -->
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "problems.json: the whole problem bank in one file",
  "type": "object",
  "required": ["v", "problems"],
  "additionalProperties": false,
  "properties": {"v": {"anyOf": [{"const": 1}, {"type": "integer", "minimum": 20000101, "maximum": 99991231}], "description": "1 (oldest) or yyyymmdd: the Version table row this file meets"}, "problems": {"type": "array", "minItems": 1, "items": {"$ref": "#/$defs/problem"}},
    "bank": {"type": "string", "pattern": "^BANK_[A-Z0-9]{3,6}$", "description": "optional bank flag, the bank's id: required exactly when the file uses a custom code prefix, which must equal this minus BANK_ (codes.mjs)"},
    "burst_gap_s": {"type": "number", "minimum": 60, "maximum": 600, "description": "optional, per bank file (T22): minimum seconds between two reward bursts; absent = 15"},
    "profile": {"type": "object", "additionalProperties": false, "description": "optional, per bank file (gen-UI step 5): who it is for and which visual kits fit; serve.py puts audience into Cluck's prompts",
      "properties": {"subject": {"enum": ["physics.mechanics", "physics.em", "discrete", "cs"]},
        "audience": {"type": "string", "minLength": 10, "maxLength": 300},
        "skill_domains": {"type": "array", "uniqueItems": true, "items": {"enum": ["algebra"]}},
        "kits": {"type": "array", "uniqueItems": true, "items": {"enum": ["mechanics", "energy-bars", "graph-search"]}}}}},
  "$defs": {
    "num": {"type": ["number", "string"], "minLength": 1, "description": "Number, or math.js constant expression like \"pi/3\""},
    "skills": {"type": "array", "minItems": 1, "maxItems": 6, "uniqueItems": true, "items": {"type": "string", "pattern": "^[a-z][a-z0-9_]{2,31}$"}, "description": "server only: the algebra skills this question needs, ids from skills.json (SCHEMA.md 'Skills'); a split row's list replaces its parent's"},
    "pt": {"type": "array", "prefixItems": [{"$ref": "#/$defs/num"}, {"$ref": "#/$defs/num"}], "items": false, "minItems": 2},
    "range": {"$ref": "#/$defs/pt"},
    "expr": {"type": "string", "minLength": 1, "description": "math.js expression in x (fn/shade/tangent) or t (param)"},
    "label": {"type": "string", "minLength": 1, "maxLength": 80, "description": "Plain text with optional $..$ KaTeX"},
    "color": {"enum": ["c1", "c2", "c3", "ink", "muted", "ok", "bad", "mark"], "description": "Token name; never hex"},
    "anchor": {"enum": ["c", "n", "ne", "e", "se", "s", "sw", "w", "nw"], "description": "Which side of the point the label sits on"},
    "md": {"oneOf": [{"type": "string", "minLength": 1}, {"type": "array", "minItems": 1, "items": {"type": "string"}, "description": "Lines, joined with \\n"}]},
    "text": {"type": "object", "required": ["type", "md"], "additionalProperties": false, "properties": {"type": {"const": "text"}, "md": {"$ref": "#/$defs/md"}}},
    "graph": {"type": "object", "required": ["kind"], "description": "Graph block", "properties": {"kind": {"enum": ["cartesian", "scene", "bars", "circuit", "network"]}}, "allOf": [{"if": {"properties": {"kind": {"const": "cartesian"}}}, "then": {"$ref": "#/$defs/kind_cartesian"}}, {"if": {"properties": {"kind": {"const": "scene"}}}, "then": {"$ref": "#/$defs/kind_scene"}}, {"if": {"properties": {"kind": {"const": "bars"}}}, "then": {"$ref": "#/$defs/kind_bars"}}, {"if": {"properties": {"kind": {"const": "circuit"}}}, "then": {"$ref": "#/$defs/kind_circuit"}}, {"if": {"properties": {"kind": {"const": "network"}}}, "then": {"$ref": "#/$defs/kind_network"}}]},
    "block": {"type": "object", "required": ["type"], "properties": {"type": {"enum": ["text", "graph"]}}, "allOf": [{"if": {"properties": {"type": {"const": "text"}}}, "then": {"$ref": "#/$defs/text"}}, {"if": {"properties": {"type": {"const": "graph"}}}, "then": {"$ref": "#/$defs/graph"}}]},
    "cmark": {"type": "object", "required": ["mark"], "description": "Cartesian mark", "properties": {"mark": {"enum": ["fn", "param", "shade", "tangent", "vline", "hline", "point", "seg", "arrow", "arc", "poly", "text", "right", "dim", "angle", "circle"]}}, "allOf": [{"if": {"properties": {"mark": {"const": "fn"}}}, "then": {"$ref": "#/$defs/c_fn"}}, {"if": {"properties": {"mark": {"const": "param"}}}, "then": {"$ref": "#/$defs/c_param"}}, {"if": {"properties": {"mark": {"const": "shade"}}}, "then": {"$ref": "#/$defs/c_shade"}}, {"if": {"properties": {"mark": {"const": "tangent"}}}, "then": {"$ref": "#/$defs/c_tangent"}}, {"if": {"properties": {"mark": {"const": "vline"}}}, "then": {"$ref": "#/$defs/c_vline"}}, {"if": {"properties": {"mark": {"const": "hline"}}}, "then": {"$ref": "#/$defs/c_hline"}}, {"if": {"properties": {"mark": {"const": "point"}}}, "then": {"$ref": "#/$defs/c_point"}}, {"if": {"properties": {"mark": {"const": "seg"}}}, "then": {"$ref": "#/$defs/c_seg"}}, {"if": {"properties": {"mark": {"const": "arrow"}}}, "then": {"$ref": "#/$defs/c_arrow"}}, {"if": {"properties": {"mark": {"const": "arc"}}}, "then": {"$ref": "#/$defs/c_arc"}}, {"if": {"properties": {"mark": {"const": "poly"}}}, "then": {"$ref": "#/$defs/c_poly"}}, {"if": {"properties": {"mark": {"const": "text"}}}, "then": {"$ref": "#/$defs/c_text"}}, {"if": {"properties": {"mark": {"const": "right"}}}, "then": {"$ref": "#/$defs/c_right"}}, {"if": {"properties": {"mark": {"const": "dim"}}}, "then": {"$ref": "#/$defs/c_dim"}}, {"if": {"properties": {"mark": {"const": "angle"}}}, "then": {"$ref": "#/$defs/c_angle"}}, {"if": {"properties": {"mark": {"const": "circle"}}}, "then": {"$ref": "#/$defs/c_circle"}}]},
    "smark": {"type": "object", "required": ["mark"], "description": "Scene mark", "properties": {"mark": {"enum": ["body", "spring", "pulley", "rope", "surface", "incline", "force", "path", "pivot", "axes", "point", "seg", "arrow", "arc", "poly", "text", "right", "dim", "angle", "circle"]}}, "allOf": [{"if": {"properties": {"mark": {"const": "body"}}}, "then": {"$ref": "#/$defs/s_body"}}, {"if": {"properties": {"mark": {"const": "spring"}}}, "then": {"$ref": "#/$defs/s_spring"}}, {"if": {"properties": {"mark": {"const": "pulley"}}}, "then": {"$ref": "#/$defs/s_pulley"}}, {"if": {"properties": {"mark": {"const": "rope"}}}, "then": {"$ref": "#/$defs/s_rope"}}, {"if": {"properties": {"mark": {"const": "surface"}}}, "then": {"$ref": "#/$defs/s_surface"}}, {"if": {"properties": {"mark": {"const": "incline"}}}, "then": {"$ref": "#/$defs/s_incline"}}, {"if": {"properties": {"mark": {"const": "force"}}}, "then": {"$ref": "#/$defs/s_force"}}, {"if": {"properties": {"mark": {"const": "path"}}}, "then": {"$ref": "#/$defs/s_path"}}, {"if": {"properties": {"mark": {"const": "pivot"}}}, "then": {"$ref": "#/$defs/s_pivot"}}, {"if": {"properties": {"mark": {"const": "axes"}}}, "then": {"$ref": "#/$defs/s_axes"}}, {"if": {"properties": {"mark": {"const": "point"}}}, "then": {"$ref": "#/$defs/s_point"}}, {"if": {"properties": {"mark": {"const": "seg"}}}, "then": {"$ref": "#/$defs/s_seg"}}, {"if": {"properties": {"mark": {"const": "arrow"}}}, "then": {"$ref": "#/$defs/s_arrow"}}, {"if": {"properties": {"mark": {"const": "arc"}}}, "then": {"$ref": "#/$defs/s_arc"}}, {"if": {"properties": {"mark": {"const": "poly"}}}, "then": {"$ref": "#/$defs/s_poly"}}, {"if": {"properties": {"mark": {"const": "text"}}}, "then": {"$ref": "#/$defs/s_text"}}, {"if": {"properties": {"mark": {"const": "right"}}}, "then": {"$ref": "#/$defs/s_right"}}, {"if": {"properties": {"mark": {"const": "dim"}}}, "then": {"$ref": "#/$defs/s_dim"}}, {"if": {"properties": {"mark": {"const": "angle"}}}, "then": {"$ref": "#/$defs/s_angle"}}, {"if": {"properties": {"mark": {"const": "circle"}}}, "then": {"$ref": "#/$defs/s_circle"}}]},
    "kind_cartesian": {"type": "object", "required": ["type", "kind", "alt", "x", "y", "marks"], "additionalProperties": false, "properties": {"type": {"const": "graph"}, "kind": {"const": "cartesian"}, "alt": {"type": "string", "minLength": 10, "description": "One sentence describing the figure. Must NOT give away the answer. Screen readers + copy bundle."}, "x": {"type": "object", "required": ["min", "max"], "additionalProperties": false, "properties": {"min": {"$ref": "#/$defs/num"}, "max": {"$ref": "#/$defs/num"}, "step": {"type": "number", "minimum": 0, "description": "Tick spacing. 0 = no ticks. Omit = auto."}, "label": {"$ref": "#/$defs/label"}, "ticks": {"type": "array", "items": {"type": "object", "required": ["at", "label"], "additionalProperties": false, "properties": {"at": {"$ref": "#/$defs/num"}, "label": {"$ref": "#/$defs/label"}}}}}}, "y": {"type": "object", "required": ["min", "max"], "additionalProperties": false, "properties": {"min": {"$ref": "#/$defs/num"}, "max": {"$ref": "#/$defs/num"}, "step": {"type": "number", "minimum": 0, "description": "Tick spacing. 0 = no ticks. Omit = auto."}, "label": {"$ref": "#/$defs/label"}, "ticks": {"type": "array", "items": {"type": "object", "required": ["at", "label"], "additionalProperties": false, "properties": {"at": {"$ref": "#/$defs/num"}, "label": {"$ref": "#/$defs/label"}}}}}}, "axes": {"type": "boolean", "default": true}, "grid": {"type": "boolean", "default": true}, "equal": {"type": "boolean", "default": false, "description": "1:1 scale. Needed for true angles/arcs."}, "marks": {"type": "array", "minItems": 1, "items": {"$ref": "#/$defs/cmark"}}}},
    "kind_scene": {"type": "object", "required": ["type", "kind", "alt", "marks"], "additionalProperties": false, "properties": {"type": {"const": "graph"}, "kind": {"const": "scene"}, "alt": {"type": "string", "minLength": 10, "description": "One sentence describing the figure. Must NOT give away the answer. Screen readers + copy bundle."}, "marks": {"type": "array", "minItems": 1, "items": {"$ref": "#/$defs/smark"}}}},
    "kind_bars": {"type": "object", "required": ["type", "kind", "alt", "groups"], "additionalProperties": false, "properties": {"type": {"const": "graph"}, "kind": {"const": "bars"}, "alt": {"type": "string", "minLength": 10, "description": "One sentence describing the figure. Must NOT give away the answer. Screen readers + copy bundle."}, "min": {"type": "number"}, "max": {"type": "number"}, "unit": {"$ref": "#/$defs/label"}, "groups": {"type": "array", "minItems": 1, "items": {"type": "object", "required": ["label", "bars"], "additionalProperties": false, "properties": {"label": {"$ref": "#/$defs/label"}, "bars": {"type": "array", "minItems": 1, "items": {"type": "object", "required": ["label", "value"], "additionalProperties": false, "properties": {"label": {"$ref": "#/$defs/label"}, "value": {"type": "number"}, "color": {"$ref": "#/$defs/color"}}}}}}}}},
    "sym": {"type": "string", "pattern": "^[A-Za-z][A-Za-z0-9_]*$", "maxLength": 12, "description": "Circuit input name, gate id, or network node id"},
    "kind_circuit": {"type": "object", "required": ["type", "kind", "alt", "inputs", "gates", "outputs"], "additionalProperties": false, "properties": {"type": {"const": "graph"}, "kind": {"const": "circuit"}, "alt": {"type": "string", "minLength": 10, "description": "One sentence describing the figure. Must NOT give away the answer. Screen readers + copy bundle."}, "inputs": {"type": "array", "minItems": 1, "maxItems": 8, "items": {"oneOf": [{"$ref": "#/$defs/sym"}, {"type": "object", "required": ["name"], "additionalProperties": false, "properties": {"name": {"$ref": "#/$defs/sym"}, "value": {"enum": [0, 1], "description": "Shown as a small c2 tag \"= 1\" beside the name"}}}]}, "description": "Drawn top to bottom in this order"}, "gates": {"type": "array", "minItems": 1, "maxItems": 16, "items": {"type": "object", "required": ["id", "op", "in"], "additionalProperties": false, "properties": {"id": {"$ref": "#/$defs/sym"}, "op": {"enum": ["and", "or", "not", "xor", "nand", "nor", "xnor", "buf"]}, "in": {"type": "array", "items": {"$ref": "#/$defs/sym"}, "description": "Input names or gate ids"}, "label": {"$ref": "#/$defs/label"}, "col": {"type": "integer", "minimum": 1, "description": "Escape hatch: force a later column"}, "row": {"type": "number", "minimum": 0, "description": "Escape hatch: pin the row (1 row = 1.4 gate heights)"}}, "if": {"properties": {"op": {"enum": ["not", "buf"]}}}, "then": {"properties": {"in": {"minItems": 1, "maxItems": 1}}}, "else": {"properties": {"in": {"minItems": 2, "maxItems": 4}}}}}, "outputs": {"type": "array", "minItems": 1, "maxItems": 4, "items": {"type": "object", "required": ["from"], "additionalProperties": false, "properties": {"from": {"$ref": "#/$defs/sym"}, "label": {"$ref": "#/$defs/label"}}}}}},
    "kind_network": {"type": "object", "required": ["type", "kind", "alt", "nodes", "edges"], "additionalProperties": false, "properties": {"type": {"const": "graph"}, "kind": {"const": "network"}, "alt": {"type": "string", "minLength": 10, "description": "One sentence describing the figure. Must NOT give away the answer. Screen readers + copy bundle."}, "directed": {"type": "boolean", "default": false, "description": "Arrowhead on every edge, from -> to"}, "layout": {"enum": ["circle", "tree", "free"], "default": "circle", "description": "circle: nodes on a circle in the order written, first at the top, clockwise. tree: layered down from root. free: every node's at"}, "root": {"$ref": "#/$defs/sym", "description": "Top node of a tree layout"}, "nodes": {"type": "array", "minItems": 1, "maxItems": 12, "items": {"oneOf": [{"$ref": "#/$defs/sym"}, {"type": "object", "required": ["id"], "additionalProperties": false, "properties": {"id": {"$ref": "#/$defs/sym"}, "label": {"$ref": "#/$defs/label", "description": "Drawn in the node in place of the id"}, "color": {"$ref": "#/$defs/color"}, "at": {"$ref": "#/$defs/pt", "description": "World position, y up (layout free)"}}}]}}, "edges": {"type": "array", "maxItems": 30, "items": {"type": "object", "required": ["from", "to"], "additionalProperties": false, "properties": {"from": {"$ref": "#/$defs/sym"}, "to": {"$ref": "#/$defs/sym"}, "w": {"type": "number", "description": "Edge weight, drawn mid-edge; not counted as a label"}, "label": {"$ref": "#/$defs/label", "description": "Drawn mid-edge in place of w"}, "color": {"$ref": "#/$defs/color"}, "dash": {"type": "boolean"}}}}}, "if": {"properties": {"layout": {"const": "tree"}}, "required": ["layout"]}, "then": {"required": ["root"]}},
    "c_fn": {"type": "object", "required": ["mark", "y"], "additionalProperties": false, "properties": {"mark": {"const": "fn"}, "color": {"$ref": "#/$defs/color"}, "dash": {"type": "boolean", "default": false}, "label": {"$ref": "#/$defs/label"}, "anchor": {"$ref": "#/$defs/anchor"}, "y": {"$ref": "#/$defs/expr"}, "domain": {"$ref": "#/$defs/range"}, "labelAt": {"$ref": "#/$defs/num"}}},
    "c_param": {"type": "object", "required": ["mark", "x", "y", "t"], "additionalProperties": false, "properties": {"mark": {"const": "param"}, "color": {"$ref": "#/$defs/color"}, "dash": {"type": "boolean", "default": false}, "label": {"$ref": "#/$defs/label"}, "anchor": {"$ref": "#/$defs/anchor"}, "x": {"$ref": "#/$defs/expr"}, "y": {"$ref": "#/$defs/expr"}, "t": {"$ref": "#/$defs/range"}, "labelAt": {"$ref": "#/$defs/num"}}},
    "c_shade": {"type": "object", "required": ["mark", "f", "from", "to"], "additionalProperties": false, "properties": {"mark": {"const": "shade"}, "color": {"$ref": "#/$defs/color"}, "dash": {"type": "boolean", "default": false}, "label": {"$ref": "#/$defs/label"}, "anchor": {"$ref": "#/$defs/anchor"}, "f": {"$ref": "#/$defs/expr"}, "g": {"$ref": "#/$defs/expr", "default": "0"}, "from": {"$ref": "#/$defs/num"}, "to": {"$ref": "#/$defs/num"}, "var": {"enum": ["x", "y"], "default": "x", "description": "y: f and g are x = f(y), shade between them for y in [from, to]"}}},
    "c_tangent": {"type": "object", "required": ["mark", "of", "at"], "additionalProperties": false, "properties": {"mark": {"const": "tangent"}, "color": {"$ref": "#/$defs/color"}, "dash": {"type": "boolean", "default": false}, "label": {"$ref": "#/$defs/label"}, "anchor": {"$ref": "#/$defs/anchor"}, "of": {"$ref": "#/$defs/expr"}, "at": {"$ref": "#/$defs/num"}, "len": {"type": "number", "exclusiveMinimum": 0}, "point": {"type": "boolean", "default": true}}},
    "c_vline": {"type": "object", "required": ["mark", "x"], "additionalProperties": false, "properties": {"mark": {"const": "vline"}, "color": {"$ref": "#/$defs/color"}, "dash": {"type": "boolean", "default": false}, "label": {"$ref": "#/$defs/label"}, "anchor": {"$ref": "#/$defs/anchor"}, "x": {"$ref": "#/$defs/num"}}},
    "c_hline": {"type": "object", "required": ["mark", "y"], "additionalProperties": false, "properties": {"mark": {"const": "hline"}, "color": {"$ref": "#/$defs/color"}, "dash": {"type": "boolean", "default": false}, "label": {"$ref": "#/$defs/label"}, "anchor": {"$ref": "#/$defs/anchor"}, "y": {"$ref": "#/$defs/num"}}},
    "c_point": {"type": "object", "required": ["mark", "at"], "additionalProperties": false, "properties": {"mark": {"const": "point"}, "color": {"$ref": "#/$defs/color"}, "dash": {"type": "boolean", "default": false}, "label": {"$ref": "#/$defs/label"}, "anchor": {"$ref": "#/$defs/anchor"}, "at": {"$ref": "#/$defs/pt"}, "open": {"type": "boolean", "default": false}}},
    "c_seg": {"type": "object", "required": ["mark", "from", "to"], "additionalProperties": false, "properties": {"mark": {"const": "seg"}, "color": {"$ref": "#/$defs/color"}, "dash": {"type": "boolean", "default": false}, "label": {"$ref": "#/$defs/label"}, "anchor": {"$ref": "#/$defs/anchor"}, "from": {"$ref": "#/$defs/pt"}, "to": {"$ref": "#/$defs/pt"}}},
    "c_arrow": {"type": "object", "required": ["mark", "from", "to"], "additionalProperties": false, "properties": {"mark": {"const": "arrow"}, "color": {"$ref": "#/$defs/color"}, "dash": {"type": "boolean", "default": false}, "label": {"$ref": "#/$defs/label"}, "anchor": {"$ref": "#/$defs/anchor"}, "from": {"$ref": "#/$defs/pt"}, "to": {"$ref": "#/$defs/pt"}, "both": {"type": "boolean", "default": false}}},
    "c_arc": {"type": "object", "required": ["mark", "at", "r", "from", "to"], "additionalProperties": false, "properties": {"mark": {"const": "arc"}, "color": {"$ref": "#/$defs/color"}, "dash": {"type": "boolean", "default": false}, "label": {"$ref": "#/$defs/label"}, "anchor": {"$ref": "#/$defs/anchor"}, "at": {"$ref": "#/$defs/pt"}, "r": {"type": "number", "exclusiveMinimum": 0}, "from": {"type": "number", "description": "Degrees, counterclockwise from +x"}, "to": {"type": "number", "description": "Degrees, counterclockwise from +x"}, "arrow": {"type": "boolean", "default": false, "description": "Arrowhead at the 'to' end (rotation sense)"}}},
    "c_right": {"type": "object", "required": ["mark", "at", "from", "to"], "additionalProperties": false, "description": "Right-angle mark: a small square at the corner at, between the rays to from and to", "properties": {"mark": {"const": "right"}, "color": {"$ref": "#/$defs/color"}, "dash": {"type": "boolean", "default": false}, "label": {"$ref": "#/$defs/label"}, "anchor": {"$ref": "#/$defs/anchor"}, "at": {"$ref": "#/$defs/pt"}, "from": {"$ref": "#/$defs/pt"}, "to": {"$ref": "#/$defs/pt"}, "size": {"type": "number", "exclusiveMinimum": 0, "description": "Side of the square in world units (default: 12 px)"}}},
    "c_dim": {"type": "object", "required": ["mark", "from", "to", "label"], "additionalProperties": false, "description": "Dimension line: offset from the segment from-to, end ticks, the label at its middle", "properties": {"mark": {"const": "dim"}, "color": {"$ref": "#/$defs/color"}, "dash": {"type": "boolean", "default": false}, "label": {"$ref": "#/$defs/label"}, "anchor": {"$ref": "#/$defs/anchor"}, "from": {"$ref": "#/$defs/pt"}, "to": {"$ref": "#/$defs/pt"}, "side": {"enum": ["l", "r"], "default": "l", "description": "Offset side seen walking from to to"}}},
    "c_angle": {"type": "object", "required": ["mark", "at", "from", "to", "label"], "additionalProperties": false, "description": "Angle mark: an arc at the vertex at between the rays to from and to (the smaller angle), the label on the bisector", "properties": {"mark": {"const": "angle"}, "color": {"$ref": "#/$defs/color"}, "dash": {"type": "boolean", "default": false}, "label": {"$ref": "#/$defs/label"}, "anchor": {"$ref": "#/$defs/anchor"}, "at": {"$ref": "#/$defs/pt"}, "from": {"$ref": "#/$defs/pt"}, "to": {"$ref": "#/$defs/pt"}, "r": {"type": "number", "exclusiveMinimum": 0, "description": "Arc radius in world units (default: 22 px)"}}},
    "c_circle": {"type": "object", "required": ["mark", "c", "r"], "additionalProperties": false, "description": "Circle shorthand: the same as arc 0 to 360", "properties": {"mark": {"const": "circle"}, "color": {"$ref": "#/$defs/color"}, "dash": {"type": "boolean", "default": false}, "label": {"$ref": "#/$defs/label"}, "anchor": {"$ref": "#/$defs/anchor"}, "c": {"$ref": "#/$defs/pt"}, "r": {"type": "number", "exclusiveMinimum": 0}, "fill": {"type": "boolean", "default": false}}},
    "c_poly": {"type": "object", "required": ["mark", "pts"], "additionalProperties": false, "properties": {"mark": {"const": "poly"}, "color": {"$ref": "#/$defs/color"}, "dash": {"type": "boolean", "default": false}, "label": {"$ref": "#/$defs/label"}, "anchor": {"$ref": "#/$defs/anchor"}, "pts": {"type": "array", "minItems": 3, "items": {"$ref": "#/$defs/pt"}}, "fill": {"type": "boolean", "default": false}}},
    "c_text": {"type": "object", "required": ["mark", "at", "text"], "additionalProperties": false, "properties": {"mark": {"const": "text"}, "color": {"$ref": "#/$defs/color"}, "dash": {"type": "boolean", "default": false}, "label": {"$ref": "#/$defs/label"}, "anchor": {"$ref": "#/$defs/anchor"}, "at": {"$ref": "#/$defs/pt"}, "text": {"$ref": "#/$defs/label"}}},
    "s_body": {"type": "object", "required": ["mark", "at", "shape"], "additionalProperties": false, "properties": {"mark": {"const": "body"}, "color": {"$ref": "#/$defs/color"}, "dash": {"type": "boolean", "default": false}, "label": {"$ref": "#/$defs/label"}, "anchor": {"$ref": "#/$defs/anchor"}, "at": {"$ref": "#/$defs/pt"}, "shape": {"enum": ["box", "dot", "disk", "ring", "rod"]}, "w": {"type": "number", "exclusiveMinimum": 0}, "h": {"type": "number", "exclusiveMinimum": 0}, "r": {"type": "number", "exclusiveMinimum": 0}, "angle": {"type": "number", "description": "Degrees, counterclockwise from +x", "default": 0}, "fill": {"type": "boolean", "default": true}}},
    "s_spring": {"type": "object", "required": ["mark", "from", "to"], "additionalProperties": false, "properties": {"mark": {"const": "spring"}, "color": {"$ref": "#/$defs/color"}, "dash": {"type": "boolean", "default": false}, "label": {"$ref": "#/$defs/label"}, "anchor": {"$ref": "#/$defs/anchor"}, "from": {"$ref": "#/$defs/pt"}, "to": {"$ref": "#/$defs/pt"}, "coils": {"type": "integer", "minimum": 3, "maximum": 30, "default": 8}, "width": {"type": "number", "exclusiveMinimum": 0, "default": 0.3}}},
    "s_pulley": {"type": "object", "required": ["mark", "at", "r"], "additionalProperties": false, "properties": {"mark": {"const": "pulley"}, "color": {"$ref": "#/$defs/color"}, "dash": {"type": "boolean", "default": false}, "label": {"$ref": "#/$defs/label"}, "anchor": {"$ref": "#/$defs/anchor"}, "at": {"$ref": "#/$defs/pt"}, "r": {"type": "number", "exclusiveMinimum": 0}, "mount": {"$ref": "#/$defs/pt", "description": "Draws a bracket from the axle to this point (ceiling/wall). Omit for a movable pulley."}}},
    "s_rope": {"type": "object", "required": ["mark", "pts"], "additionalProperties": false, "properties": {"mark": {"const": "rope"}, "color": {"$ref": "#/$defs/color"}, "dash": {"type": "boolean", "default": false}, "label": {"$ref": "#/$defs/label"}, "anchor": {"$ref": "#/$defs/anchor"}, "pts": {"type": "array", "minItems": 2, "items": {"$ref": "#/$defs/pt"}}}},
    "s_surface": {"type": "object", "required": ["mark", "from", "to"], "additionalProperties": false, "properties": {"mark": {"const": "surface"}, "color": {"$ref": "#/$defs/color"}, "dash": {"type": "boolean", "default": false}, "label": {"$ref": "#/$defs/label"}, "anchor": {"$ref": "#/$defs/anchor"}, "from": {"$ref": "#/$defs/pt"}, "to": {"$ref": "#/$defs/pt"}, "side": {"enum": ["right", "left"], "default": "right", "description": "Hatch side, looking from 'from' to 'to'. Floor drawn left→right: right = hatch below."}}},
    "s_incline": {"type": "object", "required": ["mark", "at", "base", "angle"], "additionalProperties": false, "properties": {"mark": {"const": "incline"}, "color": {"$ref": "#/$defs/color"}, "dash": {"type": "boolean", "default": false}, "label": {"$ref": "#/$defs/label"}, "anchor": {"$ref": "#/$defs/anchor"}, "at": {"$ref": "#/$defs/pt", "description": "Vertex holding the angle"}, "base": {"type": "number", "exclusiveMinimum": 0}, "angle": {"type": "number", "exclusiveMinimum": 0, "exclusiveMaximum": 90}, "flip": {"type": "boolean", "default": false, "description": "Rise to the left instead of the right"}}},
    "s_force": {"type": "object", "required": ["mark", "at", "angle", "len"], "additionalProperties": false, "properties": {"mark": {"const": "force"}, "color": {"$ref": "#/$defs/color"}, "dash": {"type": "boolean", "default": false}, "label": {"$ref": "#/$defs/label"}, "anchor": {"$ref": "#/$defs/anchor"}, "at": {"$ref": "#/$defs/pt"}, "angle": {"type": "number", "description": "Degrees, counterclockwise from +x"}, "len": {"type": "number", "exclusiveMinimum": 0}, "frame": {"type": "number", "default": 0, "description": "Basis rotation in degrees; angle is measured in this tilted frame (e.g. 30 = incline axes)"}}},
    "s_path": {"type": "object", "required": ["mark"], "additionalProperties": false, "properties": {"mark": {"const": "path"}, "color": {"$ref": "#/$defs/color"}, "dash": {"type": "boolean", "default": false}, "label": {"$ref": "#/$defs/label"}, "anchor": {"$ref": "#/$defs/anchor"}, "pts": {"type": "array", "minItems": 2, "items": {"$ref": "#/$defs/pt"}}, "x": {"$ref": "#/$defs/expr"}, "y": {"$ref": "#/$defs/expr"}, "t": {"$ref": "#/$defs/range"}, "domain": {"$ref": "#/$defs/range"}, "fn": {"$ref": "#/$defs/expr"}, "labelAt": {"$ref": "#/$defs/num"}, "arrow": {"type": "boolean", "default": false, "description": "Arrowhead at the end"}}, "oneOf": [{"required": ["pts"]}, {"required": ["fn", "domain"]}, {"required": ["x", "y", "t"]}]},
    "s_pivot": {"type": "object", "required": ["mark", "at"], "additionalProperties": false, "properties": {"mark": {"const": "pivot"}, "color": {"$ref": "#/$defs/color"}, "dash": {"type": "boolean", "default": false}, "label": {"$ref": "#/$defs/label"}, "anchor": {"$ref": "#/$defs/anchor"}, "at": {"$ref": "#/$defs/pt"}, "size": {"type": "number", "exclusiveMinimum": 0}}},
    "s_axes": {"type": "object", "required": ["mark", "at"], "additionalProperties": false, "properties": {"mark": {"const": "axes"}, "at": {"$ref": "#/$defs/pt"}, "angle": {"type": "number", "description": "Degrees, counterclockwise from +x", "default": 0}, "len": {"type": "number", "exclusiveMinimum": 0}, "x": {"$ref": "#/$defs/label"}, "y": {"$ref": "#/$defs/label"}}},
    "s_point": {"type": "object", "required": ["mark", "at"], "additionalProperties": false, "properties": {"mark": {"const": "point"}, "color": {"$ref": "#/$defs/color"}, "dash": {"type": "boolean", "default": false}, "label": {"$ref": "#/$defs/label"}, "anchor": {"$ref": "#/$defs/anchor"}, "at": {"$ref": "#/$defs/pt"}, "open": {"type": "boolean", "default": false}}},
    "s_seg": {"type": "object", "required": ["mark", "from", "to"], "additionalProperties": false, "properties": {"mark": {"const": "seg"}, "color": {"$ref": "#/$defs/color"}, "dash": {"type": "boolean", "default": false}, "label": {"$ref": "#/$defs/label"}, "anchor": {"$ref": "#/$defs/anchor"}, "from": {"$ref": "#/$defs/pt"}, "to": {"$ref": "#/$defs/pt"}}},
    "s_arrow": {"type": "object", "required": ["mark", "from", "to"], "additionalProperties": false, "properties": {"mark": {"const": "arrow"}, "color": {"$ref": "#/$defs/color"}, "dash": {"type": "boolean", "default": false}, "label": {"$ref": "#/$defs/label"}, "anchor": {"$ref": "#/$defs/anchor"}, "from": {"$ref": "#/$defs/pt"}, "to": {"$ref": "#/$defs/pt"}, "both": {"type": "boolean", "default": false}}},
    "s_arc": {"type": "object", "required": ["mark", "at", "r", "from", "to"], "additionalProperties": false, "properties": {"mark": {"const": "arc"}, "color": {"$ref": "#/$defs/color"}, "dash": {"type": "boolean", "default": false}, "label": {"$ref": "#/$defs/label"}, "anchor": {"$ref": "#/$defs/anchor"}, "at": {"$ref": "#/$defs/pt"}, "r": {"type": "number", "exclusiveMinimum": 0}, "from": {"type": "number", "description": "Degrees, counterclockwise from +x"}, "to": {"type": "number", "description": "Degrees, counterclockwise from +x"}, "arrow": {"type": "boolean", "default": false, "description": "Arrowhead at the 'to' end (rotation sense)"}}},
    "s_right": {"type": "object", "required": ["mark", "at", "from", "to"], "additionalProperties": false, "description": "Right-angle mark: a small square at the corner at, between the rays to from and to", "properties": {"mark": {"const": "right"}, "color": {"$ref": "#/$defs/color"}, "dash": {"type": "boolean", "default": false}, "label": {"$ref": "#/$defs/label"}, "anchor": {"$ref": "#/$defs/anchor"}, "at": {"$ref": "#/$defs/pt"}, "from": {"$ref": "#/$defs/pt"}, "to": {"$ref": "#/$defs/pt"}, "size": {"type": "number", "exclusiveMinimum": 0, "description": "Side of the square in world units (default: 12 px)"}}},
    "s_dim": {"type": "object", "required": ["mark", "from", "to", "label"], "additionalProperties": false, "description": "Dimension line: offset from the segment from-to, end ticks, the label at its middle", "properties": {"mark": {"const": "dim"}, "color": {"$ref": "#/$defs/color"}, "dash": {"type": "boolean", "default": false}, "label": {"$ref": "#/$defs/label"}, "anchor": {"$ref": "#/$defs/anchor"}, "from": {"$ref": "#/$defs/pt"}, "to": {"$ref": "#/$defs/pt"}, "side": {"enum": ["l", "r"], "default": "l", "description": "Offset side seen walking from to to"}}},
    "s_angle": {"type": "object", "required": ["mark", "at", "from", "to", "label"], "additionalProperties": false, "description": "Angle mark: an arc at the vertex at between the rays to from and to (the smaller angle), the label on the bisector", "properties": {"mark": {"const": "angle"}, "color": {"$ref": "#/$defs/color"}, "dash": {"type": "boolean", "default": false}, "label": {"$ref": "#/$defs/label"}, "anchor": {"$ref": "#/$defs/anchor"}, "at": {"$ref": "#/$defs/pt"}, "from": {"$ref": "#/$defs/pt"}, "to": {"$ref": "#/$defs/pt"}, "r": {"type": "number", "exclusiveMinimum": 0, "description": "Arc radius in world units (default: 22 px)"}}},
    "s_circle": {"type": "object", "required": ["mark", "c", "r"], "additionalProperties": false, "description": "Circle shorthand: the same as arc 0 to 360", "properties": {"mark": {"const": "circle"}, "color": {"$ref": "#/$defs/color"}, "dash": {"type": "boolean", "default": false}, "label": {"$ref": "#/$defs/label"}, "anchor": {"$ref": "#/$defs/anchor"}, "c": {"$ref": "#/$defs/pt"}, "r": {"type": "number", "exclusiveMinimum": 0}, "fill": {"type": "boolean", "default": false}}},
    "s_poly": {"type": "object", "required": ["mark", "pts"], "additionalProperties": false, "properties": {"mark": {"const": "poly"}, "color": {"$ref": "#/$defs/color"}, "dash": {"type": "boolean", "default": false}, "label": {"$ref": "#/$defs/label"}, "anchor": {"$ref": "#/$defs/anchor"}, "pts": {"type": "array", "minItems": 3, "items": {"$ref": "#/$defs/pt"}}, "fill": {"type": "boolean", "default": false}}},
    "s_text": {"type": "object", "required": ["mark", "at", "text"], "additionalProperties": false, "properties": {"mark": {"const": "text"}, "color": {"$ref": "#/$defs/color"}, "dash": {"type": "boolean", "default": false}, "label": {"$ref": "#/$defs/label"}, "anchor": {"$ref": "#/$defs/anchor"}, "at": {"$ref": "#/$defs/pt"}, "text": {"$ref": "#/$defs/label"}}},
    "error": {"enum": ["sign", "op-swap", "order-ops", "arithmetic", "algebra", "off-by-factor", "units", "deg-rad", "chain-rule", "product-rule", "quotient-rule", "power-rule", "limit-plug", "domain", "components", "misread", "incomplete", "other", "fallacy", "quantifier", "negation", "counting", "off-by-one", "format"]},
    "cluck": {"type": "string", "pattern": "^(QUACK|Quack)\\.", "maxLength": 300, "description": "Cluck voice: starts with QUACK., one question/action, never the answer"},
    "choice": {"type": "object", "required": ["id", "md"], "additionalProperties": false, "properties": {"id": {"type": "string", "pattern": "^[a-z]$"}, "md": {"$ref": "#/$defs/md"}, "lock": {"type": "boolean", "default": false, "description": "Pin to its authored slot (none of these / DNE)"}}},
    "wrong": {"type": "object", "required": ["error", "hint"], "additionalProperties": false, "properties": {"choice": {"type": "string", "pattern": "^[a-z]$"}, "match": {"type": "string", "minLength": 1}, "re": {"type": "string", "minLength": 1}, "error": {"$ref": "#/$defs/error"}, "hint": {"$ref": "#/$defs/cluck"}, "fix": {"$ref": "#/$defs/fixkey"}}, "oneOf": [{"required": ["choice"]}, {"required": ["match"]}, {"required": ["re"]}]},
    "fixkey": {"type": "object", "required": ["answer"], "additionalProperties": false, "description": "mc pick all + fix: the corrected value for this false choice (private). Type and var come from the problem fix.", "properties": {"answer": {"type": "string", "minLength": 1}, "accept": {"type": "array", "items": {"type": "string", "minLength": 1}}, "tol": {"type": "number", "exclusiveMinimum": 0, "maximum": 0.05}, "tol_why": {"type": "string", "minLength": 1}, "points": {"type": "array", "minItems": 3, "items": {"type": "number"}}, "wrong": {"type": "array", "items": {"$ref": "#/$defs/wrong"}}}},
    "problem": {
      "type": "object",
      "required": [
        "code",
        "type",
        "body"
      ],
      "additionalProperties": false,
      "properties": {
        "code": {
          "type": "string",
          "pattern": "^(?!(?:BANK|DIET|SUGAR|ADMIN|UNADMIN)_)[A-Z][A-Z0-9]{2,5}_[A-Z0-9]{3,6}$"
        },
        "title": {
          "type": "string",
          "minLength": 1,
          "maxLength": 60,
          "description": "Brief plain-text title for the question list. Never the answer."
        },
        "type": {
          "enum": [
            "num",
            "expr",
            "text",
            "mc",
            "multi"
          ]
        },
        "var": {
          "type": "string",
          "pattern": "^[a-z]$",
          "default": "x",
          "description": "expr only: the variable in answer"
        },
        "body": {
          "type": "array",
          "minItems": 1,
          "items": {
            "$ref": "#/$defs/block"
          }
        },
        "how": {
          "type": "string",
          "minLength": 3,
          "maxLength": 120,
          "description": "text/multi: how to type the answer, shown right above the answer box. Plain text + $..$ + `code`."
        },
        "saccharine": {
          "type": "object",
          "additionalProperties": false,
          "description": "SUGAR mode layer (design/EASY.md schema v2). The problem's own fields are the DIET question, untouched. Server only except title, tip and the formula rows from part. A problem without it is diet-only (BANK_PSY6).",
          "properties": {
            "title": {"type": "string", "minLength": 3, "maxLength": 120, "description": "\"Practice Exam 2, Question X: [condition changed]\" (or \"Practice Exam 2, Question X\" when unchanged)"},
            "tip": {"type": "string", "minLength": 3, "maxLength": 160, "description": "one 'what to do' line on top: plain statements, never a question; plain text + $..$"},
            "part": {"type": "array", "items": {"type": "string", "pattern": "^[A-Z][A-Z0-9_]{1,15}$"}, "description": "formula-sheet.json row ids, in order of use: the formula card"},
            "ladder": {"type": "object", "additionalProperties": false, "minProperties": 1,
              "description": "the formula card's thinking ladder (Tony, Oct 21): `part` rows are the big pieces; `mid` pieces pop inside their row, one per Jev hit, then `arrows` chain the rows, one per later hit. Reveal order = mid in order, then arrows in order. Needs `part`; every id must be in `part` (tests/schema.test.mjs ladderFaults)",
              "properties": {
                "mid": {"type": "array", "minItems": 1, "maxItems": 6, "description": "middle pieces, in the order they pop",
                  "items": {"type": "object", "required": ["of", "tex"], "additionalProperties": false, "properties": {
                    "of": {"type": "string", "pattern": "^[A-Z][A-Z0-9_]{1,15}$", "description": "the `part` row this piece pops inside"},
                    "tex": {"type": "string", "minLength": 1, "maxLength": 120, "description": "one relation in LaTeX, no $ (like formula-sheet.json tex): a step, never the final number, never the answer's letter"},
                    "use": {"type": "string", "minLength": 1, "maxLength": 160, "description": "optional \"Use it for\": where this kind of relation applies, named with concrete cases; shows under the piece when it pops"},
                    "why": {"type": "string", "minLength": 1, "maxLength": 160, "description": "optional \"Why this\": why this step, compact math written out; shows under the piece when it pops"}}}},
                "arrows": {"type": "array", "minItems": 1, "maxItems": 7, "description": "chain arrows between neighbouring `part` rows, in the order they pop",
                  "items": {"type": "object", "required": ["from", "to"], "additionalProperties": false, "properties": {
                    "from": {"type": "string", "pattern": "^[A-Z][A-Z0-9_]{1,15}$"},
                    "to": {"type": "string", "pattern": "^[A-Z][A-Z0-9_]{1,15}$", "description": "the next `part` row after `from`"}}}}}},
            "key": {"type": "string", "minLength": 3, "description": "server only: the full presolved solution, plain text + LaTeX; Cluck paraphrases it"},
            "slip": {"type": "object", "additionalProperties": {"type": "string", "minLength": 3}, "description": "server only: choice id -> the slip that gives it"},
            "skills": {"$ref": "#/$defs/skills"},
            "note": {"type": "object", "additionalProperties": {"type": "object"}, "description": "server only: choice id -> the hidden NOTE for that wrong pick, written with the key (design/CLUCK-NOTE.md \"Cache\"); a single wrong pick with one skips the live NOTE call"},
            "narration": {"type": "string", "minLength": 3, "maxLength": 700, "description": "the voiceover after a wrong answer: plain spoken words, no $ or LaTeX, numbers and units spelled as said, <= 90 words"},
            "hide": {"type": "boolean", "description": "true: left out of sugar (sugar v2 prune)"},
            "split": {"type": "array", "minItems": 1, "description": "sugar: a choose-all becomes one True/False question per row, in its place (serve.py sub_problem)",
              "items": {"type": "object", "required": ["sub", "stem", "answer"], "additionalProperties": false, "properties": {
                "sub": {"type": "string", "pattern": "^(?!(?:BANK|DIET|SUGAR|ADMIN|UNADMIN)_)[A-Z][A-Z0-9]{2,5}_[A-Z0-9]{3,7}$"}, "stem": {"type": "string", "minLength": 3},
                "choices": {"type": "array", "minItems": 2, "maxItems": 8, "items": {"$ref": "#/$defs/choice"}, "description": "a row with its own choices: an mc (answer = a choice id); none = True/False"},
                "answer": {"type": ["string", "boolean"], "description": "\"true\" / \"false\" (True/False row) or the right choice id"},
                "slip": {"oneOf": [{"type": "string", "minLength": 3}, {"type": "object", "additionalProperties": {"type": "string", "minLength": 3}}], "description": "the wrong pick's slip (True/False), or choice id -> slip"},
                "note": {"type": "object", "additionalProperties": {"type": "object"}, "description": "choice id -> the NOTE for that wrong pick (as saccharine.note)"},
                "skills": {"$ref": "#/$defs/skills"},
                "tip": {"type": "string", "minLength": 3, "maxLength": 200},
                "narration": {"type": "string", "minLength": 3, "maxLength": 700}}}},
            "snack": {"type": "boolean", "description": "a very easy twin of a Practice Exam question (design/REWARDS-WIRING.md); goes with top-level sugar_only"},
            "dead": {"type": "boolean", "description": "a dead-easy warm-up (T28): Bloom 1 fact pick or one-step plug-in, 3 obvious choices (L0); goes with top-level sugar_only"},
            "before": {"type": "string", "pattern": "^(?!(?:BANK|DIET|SUGAR|ADMIN|UNADMIN)_)[A-Z][A-Z0-9]{2,5}_[A-Z0-9]{3,7}$", "description": "snack: the code (or split sub code) it is served right before"},
            "original": {"type": "object", "required": ["body"], "additionalProperties": false, "description": "snack: the original question and its worked solution, shown beside it (sugar side panel)",
              "properties": {"q": {"type": "integer", "minimum": 1}, "body": {"type": "array", "minItems": 1, "items": {"$ref": "#/$defs/block"}},
                "solution": {"type": "array", "items": {"type": "string", "minLength": 1}, "description": "worked lines, plain text + $..$, the original's numbers"}}}
          }
        },
        "sugar_only": {"type": "boolean", "description": "true: a sugar-only item (a snack). Diet never sees it: bank list, p/, /check, /state, /narrate, /explain"},
        "tip": {
          "type": "string",
          "minLength": 3,
          "maxLength": 160,
          "description": "LEGACY flat form of saccharine.tip (read until the banks move to the block)."
        },
        "part": {
          "type": "array",
          "items": {"type": "string", "pattern": "^[A-Z][A-Z0-9_]{1,15}$"},
          "description": "LEGACY flat form of saccharine.part."
        },
        "key": {
          "type": "string",
          "minLength": 3,
          "description": "LEGACY flat form of saccharine.key (server only)."
        },
        "slip": {
          "type": "object",
          "additionalProperties": {"type": "string", "minLength": 3},
          "description": "LEGACY flat form of saccharine.slip (server only)."
        },
        "choices": {
          "type": "array",
          "minItems": 2,
          "maxItems": 8,
          "items": {
            "$ref": "#/$defs/choice"
          }
        },
        "shuffle": {
          "type": "boolean",
          "default": true,
          "description": "mc: shuffle choices per browser (locked ones keep their slot). false = authored order."
        },
        "parts": {
          "type": "array",
          "minItems": 2,
          "maxItems": 4,
          "items": {
            "$ref": "#/$defs/part"
          },
          "description": "multi: the answer boxes, in order"
        },
        "form": {
          "type": "string",
          "minLength": 1,
          "description": "num (server only): the answer as one expression of plain numbers, e.g. 1/((4/3)^2+(1/3)^2+(2/3)^2). Must equal answer. The 10 slip families of slips.py are derived from it (runtime hints + tools/slips.py)"
        },
        "ignore_slips": {
          "type": "array",
          "items": {"type": "string", "minLength": 1},
          "description": "num (server only): slip values that get no family hint and need no wrong entry (exempt from SAME and CLASH)"
        },
        "answer": {
          "type": "string",
          "minLength": 1,
          "description": "math.js syntax (ln ok, e^(-6), pi, sqrt(), sin(30 deg)) or exactly \"dne\""
        },
        "accept": {
          "type": "array",
          "items": {
            "type": "string",
            "minLength": 1
          },
          "description": "text: other spellings that also count as correct"
        },
        "points": {
          "type": "array",
          "minItems": 3,
          "items": {
            "type": "number"
          },
          "description": "expr only: sample values of var"
        },
        "tol": {
          "type": "number",
          "exclusiveMinimum": 0,
          "maximum": 0.05,
          "description": "Relative tolerance. Default 0.02 for num, 1e-06 for expr. Zero key: absolute 1e-9."
        },
        "tol_why": {
          "type": "string",
          "minLength": 1,
          "description": "One line: why this tol fits the question and topic (author), or the wiggle test's line (tools/tol.py)."
        },
        "pick": {
          "enum": [
            "one",
            "all"
          ],
          "default": "one",
          "description": "mc only. all = checkboxes, the ticked set is graded all or nothing (design/CHOOSE-ALL.md)"
        },
        "correct": {
          "oneOf": [
            {
              "type": "string",
              "pattern": "^[a-z]$"
            },
            {
              "type": "array",
              "minItems": 1,
              "uniqueItems": true,
              "items": {
                "type": "string",
                "pattern": "^[a-z]$"
              }
            }
          ],
          "description": "mc: id of the right choice (pick all: every right id)"
        },
        "fix": {
          "type": "object",
          "required": ["type"],
          "additionalProperties": false,
          "properties": {"type": {"enum": ["num", "expr", "text"]}, "how": {"type": "string", "minLength": 3, "maxLength": 20, "description": "the fix box placeholder: 20 characters at most so it fits a 375px phone"}, "var": {"type": "string", "pattern": "^[a-z]$"}},
          "description": "mc pick all, prove mode (public): every X'd row needs a typed fix of this type; each false choice's wrong entry holds its fix answer"
        },
        "miss": {
          "$ref": "#/$defs/cluck",
          "description": "mc pick all: hint when every tick is right but a right choice is missing. Never names it."
        },
        "wrong": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/wrong"
          },
          "description": "Known wrong answers -> error type + Cluck hint"
        },
        "nudge": {
          "$ref": "#/$defs/cluck",
          "description": "freeform: hint for a wrong answer that matches nothing"
        }
      },
      "allOf": [
        {
          "if": {
            "properties": {
              "type": {
                "const": "mc"
              }
            }
          },
          "then": {
            "required": [
              "choices",
              "correct",
              "wrong"
            ],
            "properties": {
              "answer": false,
              "points": false,
              "tol": false,
              "var": false,
              "nudge": false,
              "parts": false,
              "accept": false
            }
          }
        },
        {
          "if": {"properties": {"pick": {"const": "all"}}, "required": ["pick"]},
          "then": {"required": ["miss"], "properties": {"type": {"const": "mc"}, "correct": {"type": "array"}}},
          "else": {"properties": {"miss": false, "fix": false, "correct": {"type": "string"}}}
        },
        {
          "if": {"properties": {"type": {"const": "mc"}}, "not": {"properties": {"pick": {"const": "all"}}, "required": ["pick"]}},
          "then": {"properties": {"how": false}}
        },
        {
          "if": {"not": {"properties": {"type": {"const": "mc"}}}},
          "then": {"properties": {"pick": false}}
        },
        {
          "if": {
            "properties": {
              "type": {
                "const": "num"
              }
            }
          },
          "then": {
            "required": [
              "answer"
            ],
            "properties": {
              "choices": false,
              "correct": false,
              "points": false,
              "var": false,
              "parts": false,
              "shuffle": false,
              "accept": false
            }
          }
        },
        {
          "if": {
            "properties": {
              "type": {
                "const": "expr"
              }
            }
          },
          "then": {
            "required": [
              "answer",
              "points"
            ],
            "properties": {
              "choices": false,
              "correct": false,
              "parts": false,
              "shuffle": false,
              "accept": false
            }
          }
        },
        {
          "if": {
            "properties": {
              "type": {
                "const": "text"
              }
            }
          },
          "then": {
            "required": [
              "answer",
              "how"
            ],
            "properties": {
              "choices": false,
              "correct": false,
              "points": false,
              "tol": false,
              "var": false,
              "parts": false,
              "shuffle": false
            }
          }
        },
        {
          "if": {
            "properties": {
              "type": {
                "const": "multi"
              }
            }
          },
          "then": {
            "required": [
              "parts",
              "how"
            ],
            "properties": {
              "choices": false,
              "correct": false,
              "answer": false,
              "points": false,
              "tol": false,
              "var": false,
              "accept": false,
              "shuffle": false,
              "wrong": false
            }
          }
        }
      ]
    },
    "part": {
      "type": "object",
      "required": [
        "type",
        "answer"
      ],
      "additionalProperties": false,
      "properties": {
          "form": {
            "type": "string",
            "minLength": 1,
            "description": "num (server only): the answer as one expression of plain numbers, e.g. 1/((4/3)^2+(1/3)^2+(2/3)^2). Must equal answer. The 10 slip families of slips.py are derived from it (runtime hints + tools/slips.py)"
          },
          "ignore_slips": {
            "type": "array",
            "items": {"type": "string", "minLength": 1},
            "description": "num (server only): slip values that get no family hint and need no wrong entry (exempt from SAME and CLASH)"
          },
        "label": {
          "type": "string",
          "minLength": 1,
          "maxLength": 12,
          "description": "Shown in the box; default A, B, C, D"
        },
        "prompt": {
          "$ref": "#/$defs/md",
          "description": "The sub-question for this box, shown next to it as \"a)\", \"b)\"... Markdown + $..$ KaTeX, same as a text block. Not for typing instructions: those go in the problem's how."
        },
        "type": {
          "enum": [
            "num",
            "expr",
            "text"
          ]
        },
        "answer": {
          "type": "string",
          "minLength": 1
        },
        "accept": {
          "type": "array",
          "items": {
            "type": "string",
            "minLength": 1
          },
          "description": "text: other spellings that also count as correct"
        },
        "points": {
          "type": "array",
          "minItems": 3,
          "items": {
            "type": "number"
          },
          "description": "expr only: sample values of var"
        },
        "tol": {
          "type": "number",
          "exclusiveMinimum": 0,
          "maximum": 0.05,
          "description": "Relative tolerance. Default 0.02 for num, 1e-06 for expr. Zero key: absolute 1e-9."
        },
        "tol_why": {
          "type": "string",
          "minLength": 1,
          "description": "One line: why this tol fits the question and topic (author), or the wiggle test's line (tools/tol.py)."
        },
        "var": {
          "type": "string",
          "pattern": "^[a-z]$",
          "default": "x",
          "description": "expr only: the variable in answer"
        },
        "wrong": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/wrong"
          }
        }
      },
      "allOf": [
        {
          "if": {
            "properties": {
              "type": {
                "const": "expr"
              }
            }
          },
          "then": {
            "required": [
              "points"
            ]
          }
        }
      ]
    }
  }
}
```

## Skills (skills.json): the algebra a question needs

Many students in these gen-ed courses are shaky on algebra (Tony, Oct 5). Each question can list the algebra skills it needs in `saccharine.skills` (1 to 6 ids, most important first). The ids come from `skills.json`, the one catalog. A catalog entry has an `id`, a `family`, the `idea` in plain words (no calculus), the usual `slip`, and the `visual` move that teaches it. Cluck's prompt gets the ideas, so he explains the skill along with the physics. The live figures (brain `topics/cluck-visual-plan.md`) target the same ids.

Rules:
- List only skills a student must use on THIS question, not every skill in the chapter.
- A missing skill goes into `skills.json` first. Tests fail on an unknown id.
- `skills` is server only (inside `saccharine`), like `key` and `slip`.

<!-- schema: skills -->
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "skills.json: the algebra skill catalog",
  "type": "object",
  "required": ["v", "families", "skills"],
  "additionalProperties": false,
  "properties": {
    "v": {"const": 1},
    "about": {"type": "string"},
    "families": {"type": "object", "minProperties": 1, "additionalProperties": {"type": "string", "minLength": 3}, "propertyNames": {"pattern": "^[a-z][a-z0-9_]{1,15}$"}},
    "skills": {"type": "array", "minItems": 1, "items": {"type": "object", "required": ["id", "family", "idea", "slip", "visual"], "additionalProperties": false, "properties": {
      "id": {"type": "string", "pattern": "^[a-z][a-z0-9_]{2,31}$"},
      "family": {"type": "string"},
      "idea": {"type": "string", "minLength": 10, "maxLength": 240, "description": "plain words, no calculus"},
      "slip": {"type": "string", "minLength": 10, "maxLength": 200, "description": "the usual mistake"},
      "visual": {"type": "string", "minLength": 10, "maxLength": 200, "description": "the visual move that teaches it"}}}}
  }
}
```

## JSON Schema: scene (the visual language)
One visual, data only: params, derive (math.js over params and `t`), marks / symbols, handles, knobs, timeline, trace, reveal.
The 10 concepts are in `design/VISUAL-LANGUAGE.md` §3. Each wrong pick's goal (SEE → SAY, the predict-observe-explain prompt) is in
`design/VISUAL-GOALS.md`. The enums are closed. `reveal.after: "interact"` = after the student moves the scene (Tony, Oct 6: the value only after interaction).
`tests/scene.test.mjs` also checks what a schema can't: every expression compiles in math.js and names only params, derives, `t` and math.js functions;
handles, knobs, keyframes and the drive bind real params; reveal and trace name real mark ids.

<!-- schema: scene -->
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "stem-stuff scene (v1): the data-only visual language of design/VISUAL-LANGUAGE.md §3. Goals: design/VISUAL-GOALS.md",
  "type": "object",
  "required": [
    "v",
    "marks"
  ],
  "additionalProperties": false,
  "properties": {
    "v": {
      "const": 1
    },
    "goal": {
      "type": "object",
      "description": "why this visual exists (VISUAL-GOALS.md): a wrong pick's slip, SEE -> SAY, the POE prediction",
      "required": [
        "see",
        "say"
      ],
      "additionalProperties": false,
      "properties": {
        "pick": {
          "type": "string",
          "pattern": "^[a-z]$"
        },
        "slip": {
          "type": "string",
          "minLength": 1
        },
        "skill": {
          "type": "string",
          "pattern": "^[a-z_]+$"
        },
        "see": {
          "type": "string",
          "minLength": 1
        },
        "say": {
          "type": "string",
          "minLength": 1
        },
        "predict": {
          "type": "string",
          "minLength": 1
        },
        "approach": {
          "const": "poe"
        }
      }
    },
    "view": {
      "type": "object",
      "required": [
        "x",
        "y"
      ],
      "additionalProperties": false,
      "properties": {
        "x": {
          "$ref": "#/$defs/range"
        },
        "y": {
          "$ref": "#/$defs/range"
        }
      }
    },
    "params": {
      "type": "object",
      "propertyNames": {
        "$ref": "#/$defs/name"
      },
      "additionalProperties": {
        "type": "object",
        "required": [
          "min",
          "max",
          "init"
        ],
        "additionalProperties": false,
        "properties": {
          "min": {
            "type": "number"
          },
          "max": {
            "type": "number"
          },
          "step": {
            "type": "number",
            "exclusiveMinimum": 0
          },
          "init": {
            "type": "number"
          },
          "unit": {
            "type": "string",
            "maxLength": 12
          }
        }
      }
    },
    "derive": {
      "type": "object",
      "propertyNames": {
        "$ref": "#/$defs/name"
      },
      "additionalProperties": {
        "type": "string",
        "minLength": 1
      }
    },
    "marks": {
      "type": "array",
      "minItems": 1,
      "items": {
        "$ref": "#/$defs/mark"
      }
    },
    "handles": {
      "type": "array",
      "items": {
        "type": "object",
        "required": [
          "bind",
          "on",
          "constraint"
        ],
        "additionalProperties": false,
        "properties": {
          "bind": {
            "$ref": "#/$defs/name"
          },
          "on": {
            "type": "string",
            "pattern": "^[A-Za-z_][A-Za-z0-9_]*(\\.[a-z]+)?$"
          },
          "constraint": {
            "type": "string",
            "pattern": "^(free|onX|onY|onPath:[A-Za-z_][A-Za-z0-9_]*|radial:\\[-?[0-9.]+,-?[0-9.]+\\])$"
          },
          "snap": {
            "type": "number",
            "exclusiveMinimum": 0
          }
        }
      }
    },
    "knobs": {
      "type": "array",
      "items": {
        "type": "object",
        "required": [
          "bind",
          "kind"
        ],
        "additionalProperties": false,
        "properties": {
          "bind": {
            "$ref": "#/$defs/name"
          },
          "kind": {
            "enum": [
              "slider",
              "stepper",
              "toggle",
              "select"
            ]
          },
          "label": {
            "type": "string"
          },
          "options": {
            "type": "array",
            "items": {
              "type": "number"
            },
            "minItems": 2
          }
        }
      }
    },
    "timeline": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "keys": {
          "type": "array",
          "items": {
            "type": "object",
            "required": [
              "at",
              "set"
            ],
            "additionalProperties": false,
            "properties": {
              "at": {
                "type": "number",
                "minimum": 0
              },
              "set": {
                "type": "object",
                "propertyNames": {
                  "$ref": "#/$defs/name"
                },
                "additionalProperties": {
                  "type": "number"
                }
              },
              "ease": {
                "$ref": "#/$defs/ease"
              }
            }
          }
        },
        "drive": {
          "type": "object",
          "required": [
            "param",
            "from",
            "to",
            "dur"
          ],
          "additionalProperties": false,
          "properties": {
            "param": {
              "$ref": "#/$defs/name"
            },
            "from": {
              "$ref": "#/$defs/val"
            },
            "to": {
              "$ref": "#/$defs/val"
            },
            "dur": {
              "type": "number",
              "exclusiveMinimum": 0,
              "maximum": 20000
            },
            "ease": {
              "$ref": "#/$defs/ease"
            }
          }
        },
        "stepMs": {
          "type": "number",
          "minimum": 100,
          "maximum": 5000
        },
        "ease": {
          "$ref": "#/$defs/ease"
        },
        "controls": {
          "type": "array",
          "items": {
            "enum": [
              "prev",
              "play",
              "next",
              "reset"
            ]
          },
          "uniqueItems": true
        }
      }
    },
    "trace": {
      "type": "array",
      "maxItems": 200,
      "items": {
        "type": "object",
        "required": [
          "op",
          "args"
        ],
        "additionalProperties": false,
        "properties": {
          "op": {
            "enum": [
              "visit",
              "mark",
              "unmark",
              "swap",
              "set",
              "push",
              "pop",
              "highlightEdge",
              "enqueue",
              "dequeue",
              "gateOut"
            ]
          },
          "args": {
            "type": "array",
            "minItems": 1,
            "items": {
              "type": [
                "string",
                "number",
                "boolean"
              ]
            }
          },
          "note": {
            "type": "string"
          }
        }
      }
    },
    "reveal": {
      "type": "array",
      "items": {
        "type": "object",
        "required": [
          "after",
          "show"
        ],
        "additionalProperties": false,
        "properties": {
          "after": {
            "type": "string",
            "pattern": "^(answer|interact|step:[0-9]+|param:.+)$"
          },
          "show": {
            "type": "array",
            "minItems": 1,
            "items": {
              "type": "string"
            }
          }
        }
      }
    }
  },
  "$defs": {
    "name": {
      "type": "string",
      "pattern": "^[A-Za-z_][A-Za-z0-9_]*$"
    },
    "range": {
      "type": "array",
      "prefixItems": [
        {
          "type": "number"
        },
        {
          "type": "number"
        }
      ],
      "items": false,
      "minItems": 2
    },
    "ease": {
      "enum": [
        "linear",
        "inOut",
        "out",
        "step"
      ]
    },
    "val": {
      "oneOf": [
        {
          "type": "number"
        },
        {
          "type": "string",
          "pattern": "^="
        }
      ]
    },
    "mark": {
      "type": "object",
      "required": [
        "id"
      ],
      "properties": {
        "id": {
          "$ref": "#/$defs/name"
        },
        "mark": {
          "enum": [
            "fn",
            "param",
            "shade",
            "tangent",
            "vline",
            "hline",
            "point",
            "seg",
            "line",
            "arrow",
            "arc",
            "poly",
            "path",
            "rect",
            "circle",
            "text",
            "tex",
            "node",
            "edge",
            "bar",
            "body",
            "spring",
            "pulley",
            "rope",
            "surface",
            "incline",
            "force",
            "pivot",
            "axes"
          ]
        },
        "sym": {
          "enum": [
            "block",
            "cart",
            "ball",
            "spring",
            "pulley",
            "incline",
            "ground",
            "vector",
            "gate:AND",
            "gate:OR",
            "gate:NOT",
            "gate:XOR",
            "state",
            "arrayCell",
            "stackFrame"
          ]
        }
      },
      "oneOf": [
        {
          "required": [
            "mark"
          ],
          "not": {
            "required": [
              "sym"
            ]
          }
        },
        {
          "required": [
            "sym"
          ],
          "not": {
            "required": [
              "mark"
            ]
          }
        }
      ]
    }
  }
}
```

## JSON Schema: Copy button payload
What the Copy button puts on the clipboard (details: `copy/COPY-PAYLOAD.md`).

<!-- schema: copy -->
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "stem-stuff Copy button payload (v1). See copy/COPY-PAYLOAD.md",
  "type": "object",
  "required": [
    "v",
    "code",
    "subject",
    "start",
    "copied",
    "final",
    "tries",
    "hints",
    "explain",
    "hist"
  ],
  "additionalProperties": false,
  "properties": {
    "v": {
      "const": 1,
      "description": "payload schema version"
    },
    "code": {
      "type": "string",
      "pattern": "^(?!(?:BANK|DIET|SUGAR|ADMIN|UNADMIN)_)[A-Z][A-Z0-9]{2,5}_[A-Z0-9]{3,6}$"
    },
    "subject": {
      "type": "string",
      "pattern": "^(?!(?:BANK|DIET|SUGAR|ADMIN|UNADMIN)$)[A-Z][A-Z0-9]{2,5}$"
    },
    "start": {
      "$ref": "#/$defs/iso",
      "description": "when the problem was opened; every t is seconds after this"
    },
    "copied": {
      "$ref": "#/$defs/iso"
    },
    "final": {
      "description": "last try, or null if none",
      "oneOf": [
        {
          "type": "null"
        },
        {
          "type": "object",
          "required": [
            "a",
            "v"
          ],
          "additionalProperties": false,
          "properties": {
            "a": {
              "type": "string"
            },
            "l": {
              "$ref": "#/$defs/letter"
            },
            "part": {
              "type": "integer",
              "minimum": 0,
              "maximum": 3,
              "description": "multi: which part (0 = a) this try was for"
            },
            "v": {
              "$ref": "#/$defs/verdict"
            }
          }
        }
      ]
    },
    "tries": {
      "type": "array",
      "maxItems": 200,
      "items": {
        "type": "object",
        "required": [
          "t",
          "a",
          "v"
        ],
        "additionalProperties": false,
        "properties": {
          "t": {
            "$ref": "#/$defs/t"
          },
          "a": {
            "type": "string",
            "maxLength": 500,
            "description": "what was typed; MC: the choice text"
          },
          "c": {
            "type": "string",
            "pattern": "^[a-z]$",
            "description": "MC choice id"
          },
          "l": {
            "$ref": "#/$defs/letter"
          },
          "part": {
            "type": "integer",
            "minimum": 0,
            "maximum": 3,
            "description": "multi: which part (0 = a) this try was for"
          },
          "v": {
            "$ref": "#/$defs/verdict"
          }
        }
      }
    },
    "hints": {
      "type": "array",
      "maxItems": 10,
      "items": {
        "type": "object",
        "required": [
          "t",
          "n",
          "kind"
        ],
        "additionalProperties": false,
        "properties": {
          "t": {
            "$ref": "#/$defs/t"
          },
          "part": {
            "type": "integer",
            "minimum": 0,
            "maximum": 3,
            "description": "multi: which part (0 = a) the hint was for; n then counts that part's wrong tries"
          },
          "n": {
            "type": "integer",
            "minimum": 1
          },
          "kind": {
            "type": "string",
            "pattern": "^[a-z]+(-[a-z]+)*$",
            "description": "error type from MC.md section 6, or nudge"
          }
        }
      }
    },
    "explain": {
      "type": "string"
    },
    "hist": {
      "type": "object",
      "required": [
        "n",
        "kept",
        "edits"
      ],
      "additionalProperties": false,
      "properties": {
        "n": {
          "type": "integer",
          "minimum": 0,
          "description": "distinct snapshots recorded"
        },
        "kept": {
          "type": "integer",
          "minimum": 0,
          "description": "snapshots kept after thinning"
        },
        "edits": {
          "type": "array",
          "maxItems": 120,
          "items": {
            "type": "object",
            "required": [
              "t",
              "at",
              "del",
              "ins"
            ],
            "additionalProperties": false,
            "properties": {
              "t": {
                "$ref": "#/$defs/t"
              },
              "at": {
                "type": "integer",
                "minimum": 0
              },
              "del": {
                "type": "integer",
                "minimum": 0
              },
              "ins": {
                "type": "string"
              }
            }
          }
        }
      }
    }
  },
  "$defs": {
    "iso": {
      "type": "string",
      "pattern": "^\\d{4}-\\d\\d-\\d\\dT\\d\\d:\\d\\d:\\d\\d(\\.\\d+)?Z$"
    },
    "t": {
      "type": "number",
      "minimum": 0
    },
    "letter": {
      "enum": [
        "A",
        "B",
        "C",
        "D",
        "E"
      ]
    },
    "verdict": {
      "enum": [
        "correct",
        "wrong",
        "invalid",
        "locked",
        "egg",
        "pending"
      ],
      "description": "pending: recorded before server grading exists (no POST /check yet)"
    }
  }
}
```

## Formula ladder and the "?" docs (sugar; Tony, Oct 21)

`saccharine.ladder` turns the Key formulas card into a ladder: `{ "mid": [{ "of": "KE", "tex": "v_2 = v_1\\frac{r_1}{r_2}" }], "arrows": [{ "from": "TORQUE", "to": "L_IW" }] }`.
- Big pieces = the `part` rows; the card starts with only these. 
- A `mid` piece may carry `use` and `why` (Tony, Oct 23), each 1–160 chars: `use` ("Use it for") names where this kind of relation applies, in general, not this question ("Spin of things going around a center. Orbits, a ball on a string, people spinning on a rope."); `why` ("Why this") says why this step ("Two people spin. mvr for one + mvr for the other."). They show as two quiet labeled lines ("Use it for", "Why this") right under their piece, hidden until the piece pops. Only the newest piece keeps them open: when the next step pops, the older piece folds them behind an inline "why?" button that opens them in place (no hover tooltip). Authoring rules (brain feedback-specs-2026-10-21, "Tooltip authoring rules"): about grade-2 reading, 1–2 very short sentences; an abstract word gets concrete cases; compact math is written out (2mvr → mvr + mvr); every symbol named in words; never a final number, never a letter.
- `mid` pieces pop inside their `of` row, one per reveal, in order; then each `arrows` entry shows, one per reveal. When all are out the ladder is done.
- Rules, checked by `ladderFaults` in `tests/schema.test.mjs`: needs `part`; `of`, `from` and `to` are `part` ids; an arrow joins two NEIGHBOURS of `part` (`from` is the row right before `to`), no repeats; `tex` renders in KaTeX. Aim for `mid` about 70% of the steps (Tony: "reveals up to like 70%, then arrows").
- serve.py sends `ladder` to the browser in sugar only (`ladder()` drops entries `part` cannot show). app.js `window.stemLadder.step()` reveals the next piece (Jev, lane 4, calls it); without a caller nothing reveals.
- An arrow listed in `arrows` starts hidden; a chain link the ladder does not list stays drawn as today. A card without a `ladder` is unchanged.

Each formula row on the card has a small "?" that opens a popover (popover.js, variant `doc`, design/POPOVER.md; tap only, built on open, removed on close, one at a time) from the sheet's `doc`; it shows the row's formula again, then `purpose` as its title, then the rest: `{ "purpose": "one plain line: what the formula is for", "sym": [{ "s": "v_x", "m": "<= 8 words", "u": "m/s" }], "when": "<= 15 words", "ex": "one line, numbers that check" }` (formula-sheet.json v3; serve.py `sheet()` passes `doc` through). A row without a `doc` has no "?". No AI. `purpose` (optional, Oct 23) is the title, above the symbols; it names its symbols in words. `purpose` follows the same tooltip authoring rules. `use`, `why` and `purpose`, when present, are non-empty strings (ladderFaults, docFaults).
