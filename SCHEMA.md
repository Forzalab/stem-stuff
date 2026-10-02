# SCHEMA: problems.json (the one file)

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

Keep problems in any order: the page shuffles the list per browser (design/NAV.md), so file order is never shown. Codes must be unique (tests enforce it).

## Content rule (Tony, standing)
- MINIMAL. Textbook language. State the givens and the ask, nothing else.
- No table unless the data is a table (e.g. a limit table of x vs f(x)). Givens go in the sentence.
- No bold/emphasis, no chatty lead-ins, no restating what the figure shows.
- Units in the ask: "Find the stretch of the spring, in $\\text{m}$."

## Codes
- Format is `PREFIX_SUFFIX` (underscore: it joins words, so one double-tap on a phone selects the whole code; the page still accepts `-`, a space or no separator and normalizes to `_`). Prefixes: `CALC1` (calculus), `PHYS` (physics), `CSCI26` (discrete math).
- The suffix is 3 characters, A–Z and 0–9. Don't use O/0 or I/1.
- **A suffix must be unique across all subjects** (the tests enforce this).

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
| `tol` | `num`, `expr` | relative tolerance. Default 1e-6. Use `0.01` for physics numbers. | **no** |
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
- **Several answers to one question** ("write both, in that order") → one `multi` problem, one part per blank, in the worksheet's order. Never split it into separate problems. Put the shared givens in `body` and each blank's question in that part's `prompt` (a, b, c...); `how` stays for typing instructions. Each part picks its own type.
- A worksheet's strict **form** rule (".2", not "0.2") → a `text` part, with the form in `how`. `num` accepts every equal value.
- Keep the worksheet's wording. Put the needed rule lines (fuzzy NOT/AND/OR, what □ means) in the body of the problems that need them.

## Grading (server `POST /check`, or in the browser for an uploaded file)
- **Tries by choice count** (Tony, locked): a 2-choice `mc` gets **ONE** try (one wrong answer locks it); an `mc` with 3 or more shown choices gets **TWO**; `num`/`expr`/`text` get TWO; a `multi` gets TWO **per part**. There is no separate T/F type: TRUE/FALSE is a 2-choice `mc`. `serve.py` `max_tries()` and `app.js` `maxTries()` are the same rule (tests pin both). A repeat of the same wrong answer, or text that can't be read, does not count.
- `mc`: the answer is the choice id. `num`/`expr`: the typed value must equal `answer` within `tol` **or to 4 significant figures** (Tony: $15.59$ counts for $9\sqrt3$; `expr`: at every point in `points`); `dne` matches only `"dne"` / "does not exist".
- `text`: compared after lower-casing and removing all spaces, against `answer` and every `accept` entry. So `if(!a||b)` = `if (!a || b)`, `modus tollens` = `MODUS TOLLENS`.
- `multi`: **each part is graded alone.** `POST /check` takes `{ code, part: i, answer }` (`i` = 0 for a, 1 for b...) and the reply carries `part: i`. Each part has its own tries (the `num`/`expr`/`text` rule: TWO), its own repeat check and its own lockout, keyed by (browser, code, part): a part locks by itself when its tries run out and never locks the others. The old whole-set body `{ parts: [...] }` is not accepted (`invalid`). Every box has its own inline submit arrow, off while that box is empty; Enter in a box submits that box. A right part turns green and read-only; a wrong part shows the hint of the first of *its own* `wrong` entries it matched, else the problem `nudge`, else the default nudge. The problem is finished when every part is right or locked, and counts as correct only if every part is right.
- A wrong answer gets the hint of the first `wrong` entry it matches (`re` entries first, then `match`), else `nudge`, else a default nudge.
- Reply: `{ "verdict": "correct" | "wrong" | "invalid" | "locked", "triesLeft": 1, "gen": 7, "error"?: "sign", "hint"?: "QUACK. ..." }`. The answer is never sent.
- `GET /state/<CODE>` (same cookie): `{ "wrong": 1, "done": false, "gen": 7 }`. Tries live in `tries.json` and survive a restart; `gen` lets the page tell a hand reset from a lost file (design/DONE.md).
- Shuffle: the server seeds it from the browser's cookie + the code; an uploaded file seeds it from a random id kept in this browser. Letters A–E follow the shown order; the answer sent is always the choice id.

## Wrong answers and hints
Author in this order:
1. **Vet the choices first.** Write the correct answer. Build each MC distractor (and each known freeform wrong answer) from a named error type. No filler distractors: if you can't name the mistake, replace the choice (or use fewer choices).
2. **Then write one hint per wrong answer** in Cluck's voice: starts `QUACK.`, one pointed question or action that names the error, never the answer, about 25 words max.

`wrong` entry: `{ "choice": "a" }` (mc) or `{ "match": "4" }` (`num`/`expr`: a value, equal within `tol`; `text`: text, compared like the answer) or `{ "re": "^dne$" }` (case-insensitive regex on the typed text), plus `"error"` and `"hint"`.
MC: exactly one `wrong` entry per distractor (tests enforce it).

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
| `point`, `seg`, `arrow`, `arc`, `poly`, `text` | same as cartesian | |

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
  "properties": {"v": {"const": 1}, "problems": {"type": "array", "minItems": 1, "items": {"$ref": "#/$defs/problem"}}},
  "$defs": {
    "num": {"type": ["number", "string"], "minLength": 1, "description": "Number, or math.js constant expression like \"pi/3\""},
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
    "cmark": {"type": "object", "required": ["mark"], "description": "Cartesian mark", "properties": {"mark": {"enum": ["fn", "param", "shade", "tangent", "vline", "hline", "point", "seg", "arrow", "arc", "poly", "text"]}}, "allOf": [{"if": {"properties": {"mark": {"const": "fn"}}}, "then": {"$ref": "#/$defs/c_fn"}}, {"if": {"properties": {"mark": {"const": "param"}}}, "then": {"$ref": "#/$defs/c_param"}}, {"if": {"properties": {"mark": {"const": "shade"}}}, "then": {"$ref": "#/$defs/c_shade"}}, {"if": {"properties": {"mark": {"const": "tangent"}}}, "then": {"$ref": "#/$defs/c_tangent"}}, {"if": {"properties": {"mark": {"const": "vline"}}}, "then": {"$ref": "#/$defs/c_vline"}}, {"if": {"properties": {"mark": {"const": "hline"}}}, "then": {"$ref": "#/$defs/c_hline"}}, {"if": {"properties": {"mark": {"const": "point"}}}, "then": {"$ref": "#/$defs/c_point"}}, {"if": {"properties": {"mark": {"const": "seg"}}}, "then": {"$ref": "#/$defs/c_seg"}}, {"if": {"properties": {"mark": {"const": "arrow"}}}, "then": {"$ref": "#/$defs/c_arrow"}}, {"if": {"properties": {"mark": {"const": "arc"}}}, "then": {"$ref": "#/$defs/c_arc"}}, {"if": {"properties": {"mark": {"const": "poly"}}}, "then": {"$ref": "#/$defs/c_poly"}}, {"if": {"properties": {"mark": {"const": "text"}}}, "then": {"$ref": "#/$defs/c_text"}}]},
    "smark": {"type": "object", "required": ["mark"], "description": "Scene mark", "properties": {"mark": {"enum": ["body", "spring", "pulley", "rope", "surface", "incline", "force", "path", "pivot", "axes", "point", "seg", "arrow", "arc", "poly", "text"]}}, "allOf": [{"if": {"properties": {"mark": {"const": "body"}}}, "then": {"$ref": "#/$defs/s_body"}}, {"if": {"properties": {"mark": {"const": "spring"}}}, "then": {"$ref": "#/$defs/s_spring"}}, {"if": {"properties": {"mark": {"const": "pulley"}}}, "then": {"$ref": "#/$defs/s_pulley"}}, {"if": {"properties": {"mark": {"const": "rope"}}}, "then": {"$ref": "#/$defs/s_rope"}}, {"if": {"properties": {"mark": {"const": "surface"}}}, "then": {"$ref": "#/$defs/s_surface"}}, {"if": {"properties": {"mark": {"const": "incline"}}}, "then": {"$ref": "#/$defs/s_incline"}}, {"if": {"properties": {"mark": {"const": "force"}}}, "then": {"$ref": "#/$defs/s_force"}}, {"if": {"properties": {"mark": {"const": "path"}}}, "then": {"$ref": "#/$defs/s_path"}}, {"if": {"properties": {"mark": {"const": "pivot"}}}, "then": {"$ref": "#/$defs/s_pivot"}}, {"if": {"properties": {"mark": {"const": "axes"}}}, "then": {"$ref": "#/$defs/s_axes"}}, {"if": {"properties": {"mark": {"const": "point"}}}, "then": {"$ref": "#/$defs/s_point"}}, {"if": {"properties": {"mark": {"const": "seg"}}}, "then": {"$ref": "#/$defs/s_seg"}}, {"if": {"properties": {"mark": {"const": "arrow"}}}, "then": {"$ref": "#/$defs/s_arrow"}}, {"if": {"properties": {"mark": {"const": "arc"}}}, "then": {"$ref": "#/$defs/s_arc"}}, {"if": {"properties": {"mark": {"const": "poly"}}}, "then": {"$ref": "#/$defs/s_poly"}}, {"if": {"properties": {"mark": {"const": "text"}}}, "then": {"$ref": "#/$defs/s_text"}}]},
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
    "s_poly": {"type": "object", "required": ["mark", "pts"], "additionalProperties": false, "properties": {"mark": {"const": "poly"}, "color": {"$ref": "#/$defs/color"}, "dash": {"type": "boolean", "default": false}, "label": {"$ref": "#/$defs/label"}, "anchor": {"$ref": "#/$defs/anchor"}, "pts": {"type": "array", "minItems": 3, "items": {"$ref": "#/$defs/pt"}}, "fill": {"type": "boolean", "default": false}}},
    "s_text": {"type": "object", "required": ["mark", "at", "text"], "additionalProperties": false, "properties": {"mark": {"const": "text"}, "color": {"$ref": "#/$defs/color"}, "dash": {"type": "boolean", "default": false}, "label": {"$ref": "#/$defs/label"}, "anchor": {"$ref": "#/$defs/anchor"}, "at": {"$ref": "#/$defs/pt"}, "text": {"$ref": "#/$defs/label"}}},
    "error": {"enum": ["sign", "op-swap", "order-ops", "arithmetic", "algebra", "off-by-factor", "units", "deg-rad", "chain-rule", "product-rule", "quotient-rule", "power-rule", "limit-plug", "domain", "components", "misread", "incomplete", "other", "fallacy", "quantifier", "negation", "counting", "off-by-one", "format"]},
    "cluck": {"type": "string", "pattern": "^(QUACK|Quack)\\.", "maxLength": 300, "description": "Cluck voice: starts with QUACK., one question/action, never the answer"},
    "choice": {"type": "object", "required": ["id", "md"], "additionalProperties": false, "properties": {"id": {"type": "string", "pattern": "^[a-z]$"}, "md": {"$ref": "#/$defs/md"}, "lock": {"type": "boolean", "default": false, "description": "Pin to its authored slot (none of these / DNE)"}}},
    "wrong": {"type": "object", "required": ["error", "hint"], "additionalProperties": false, "properties": {"choice": {"type": "string", "pattern": "^[a-z]$"}, "match": {"type": "string", "minLength": 1}, "re": {"type": "string", "minLength": 1}, "error": {"$ref": "#/$defs/error"}, "hint": {"$ref": "#/$defs/cluck"}, "fix": {"$ref": "#/$defs/fixkey"}}, "oneOf": [{"required": ["choice"]}, {"required": ["match"]}, {"required": ["re"]}]},
    "fixkey": {"type": "object", "required": ["answer"], "additionalProperties": false, "description": "mc pick all + fix: the corrected value for this false choice (private). Type and var come from the problem fix.", "properties": {"answer": {"type": "string", "minLength": 1}, "accept": {"type": "array", "items": {"type": "string", "minLength": 1}}, "tol": {"type": "number", "exclusiveMinimum": 0, "maximum": 0.05}, "points": {"type": "array", "minItems": 3, "items": {"type": "number"}}, "wrong": {"type": "array", "items": {"$ref": "#/$defs/wrong"}}}},
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
          "pattern": "^(CALC1|CSCI26|PHYS)_[A-Z0-9]{3,6}$"
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
          "default": 1e-06,
          "description": "Relative tolerance. ~0.01 for physics."
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
          "properties": {"type": {"enum": ["num", "expr", "text"]}, "how": {"type": "string", "minLength": 3, "maxLength": 120}, "var": {"type": "string", "pattern": "^[a-z]$"}},
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
          "default": 1e-06,
          "description": "Relative tolerance. ~0.01 for physics."
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
      "pattern": "^(CALC1|CSCI26|PHYS)_[A-Z0-9]{3,6}$"
    },
    "subject": {
      "enum": [
        "CALC1",
        "CSCI26",
        "PHYS"
      ]
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
