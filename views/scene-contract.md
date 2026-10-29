# Scene contract (viz MVP, todo 120)

The one written contract for the scene family: `views_gate.py` (Python, V-A) checks it, `views.js` + `graph.js` (JS, V-B) draw it,
`serve.py` (V-C) sets the stage. Source plan: brain `projects/calc/_files/vizbench/shape-schema-plan.md` §1-11 + Tony notes.
Render standard = OpenUI Lang (CLAUDE.md): the scene ships as components in `views/registry.json`, never as a parallel JSON format.
When this file and the plan disagree, this file wins. When the code and this file disagree, the code is the bug.

Words: MUST / NEVER are rules the gate or the renderer enforces. "Error `x`" = the gate's error code (logged, sent in the repair round).

---

## 1. Components (OpenUI Lang signatures)

Positional args, in this order (`?` = optional, `null` skips an optional arg). `string≤N` = at most N characters, `[]≤N` = at most N items.

```
Scene(objs: (Shape | Link | Axes | MathRows | Code | Trace | Cells | Bars)[]≤12, qs?: Q[]≤10, rels?: string≤80[]≤12, alt?: string≤160)
Shape(id: string≤16, kind: "rect" | "circle" | "triangle" | "polygon" | "line" | "point", geom: string≤80, at?: string≤40, label?: string≤40, art?: Art, role?: Role)
Link(id: string≤16, kind: "arrow" | "vector" | "spring" | "string" | "dimension" | "angle", from: string≤40, to: string≤40, label?: string≤40, q?: string≤16, geom?: string≤40)
Axes(id: string≤16, x: string≤40, y: string≤40, items: string≤80[]≤8)
MathRows(id: string≤16, rows: string≤60[]≤4)
Code(id: string≤16, lang: "python" | "js", lines: string≤60[]≤12)
Trace(id: string≤16, code: string≤16, vars: string≤60, ticks?: string≤80[]≤24)
Cells(id: string≤16, kind: "array" | "stack" | "grid", items: string≤24[]≤12, ptrs?: string≤60)
Bars(id: string≤16, items: string≤40[]≤6, total?: string≤40, conserve?: boolean)
Q(id: string≤16, role: "given" | "derived" | "answer" | "unknown", value?: number, unit?: string≤12, expr?: string≤80, sym?: string≤16)
Ask(q: string≤100, choices: string≤24[]≤4)        (2..4 choices)
```
`Art` = `"ball" | "block" | "cart" | "pulley" | "battery" | "resistor" | "bulb" | "capacitor" | "magnet" | "lens" | "mirror" | "piston" | "thermometer" | "flame" | "snowflake"`.
`Role` = `"body" | "guide" | "ground" | "region" | "yours" | "right"` (default `body`; §8).

Existing components, extended additively (old programs stay valid, positional order of old args unchanged):
```
Steps(fig?: Graph | Scene, steps: Step[]≤8, front?: string≤32, head?: string≤24[]≤5)
Step(cap: string≤140, nodes?, edges?, tags?, labels?, front?, rows?, ops?: string≤40[]≤4, ask?: Ask)
```
A scene stepper is `Steps(<Scene>, [<Step>...])`. In a scene Step the Graph-only args (`nodes edges tags labels front rows`) MUST be
`null` (error `scene-step-graph-arg`), so a scene Step reads `Step("caption", null, null, null, null, null, null, [ops], ask?)`.

Where things may appear (error `scene-outside`): Shape, Link, Axes, MathRows, Code, Trace, Cells, Bars only inside `Scene.objs`;
Q only inside `Scene.qs`; Ask only as `Step.ask`; Scene only as `Steps.fig`. A Steps with a Scene fig may sit in a Cluck reply
(the chat gate allows it); a Steps with a Graph fig keeps its old rules.

### 1a. Geometry: world units, y up, the model never writes a pixel
Every object lives in world units (metres, segments, whatever the problem uses), 1:1 aspect, y up, angles in degrees counter-clockwise.
The renderer fits the visible objects into the figure box (camera, §6), places labels and picks every stroke, colour and font.

`geom` is space-separated `key=value` pairs; a value has no spaces. Allowed keys per kind (anything else: error `geom-key`; a missing
required key: error `geom-missing`):

| kind | required | optional | `at` means |
|---|---|---|---|
| rect | `w h` | `radius segments rotate` | bottom-left corner (before rotation) |
| circle | `r` | `rotate` | centre |
| triangle | `base height` | `apex rotate` (apex 0..1 = apex x as a fraction of the base from its left end, default 0.5) | bottom-left corner |
| polygon | `pts` (3..8 points, `x,y;x,y;...`, relative to `at`) | `rotate` | origin of `pts` (default `0,0`) |
| line | `from to` (point or anchor) | none | not allowed (`at` must be null) |
| point | none (geom is `""`) | none | the point |

Value types: `w h r base height apex radius rotate` = expression (§3); `segments` = integer 1..20 (equal ticks along the long side);
`from to` = point or anchor; `pts` = points joined by `;`. `at` = point or anchor. A Shape without `at` (and no relation placing it) sits at `0,0`.

Link args: `from` and `to` are points or anchors; a vector's or arrow's `to` may be relative, `+dx,dy` (from the solved `from`).
Link `geom` keys: arrow `head=end|both|none` (default end); spring `coils=` integer 3..12 (default 6); dimension `offset=` expression
(perpendicular distance, positive = left of from→to, default 0.5); angle `at=` anchor or point (the vertex, required) and `r=` expression
(arc radius, default 0.6), with `from` / `to` = a point on each ray; vector, string: none.
Link `q`: a Q id. On a `vector` its value sets the drawn length through a `scale` relation (§4); on a `dimension` or `angle` with no
label the label is `{q}`.

Points: `point := expr "," expr` (the comma at paren depth 0 splits; exprs as §3). Relative: `"+" expr "," expr`.

### 1b. Anchors
`anchor := id | id "." name | id "." edge "@" t | id "@" t`, `t` a number literal 0..1. A bare `id` = its `center`. Anchors are live:
re-solved every step, so a string tied to `rod.top@0.2` follows the rod when it rotates.

| kind | names | edges (for `@t`, direction) |
|---|---|---|
| rect | `center left right top bottom corner0..corner3` (0 bottom-left, then counter-clockwise) | `top bottom` (left→right), `left right` (bottom→top) |
| circle | `center left right top bottom` | `rim` (t in turns from +x, counter-clockwise) |
| triangle | `center` (centroid) `top` (apex) `bottom` (base midpoint) `corner0` base-left `corner1` base-right `corner2` apex | `base` (c0→c1) `left` (c0→c2) `right` (c1→c2) `hyp` (the longer of left/right; tie = right) |
| polygon | `center` (vertex mean) `corner0..corner7` | `edge0..edge7` (corner k → k+1, wrapping) |
| line | `start end center` | `id@t` (start→end) |
| point | `center` | none |
| Link | `start end center` (vector/arrow also `tail` = start, `head` = end) | `id@t` (start→end) |

`id@t` (no edge name) is allowed on a line or a Link only. Axes items, MathRows, Code, Trace, Cells, Bars have no anchors: nothing may
point into another frame (error `anchor`).

### 1c. Axes items
`x` and `y`: `"<min>,<max>[ <label>]"`, min/max = a number or a Q id, label = the rest (may hold spaces, KaTeX `$..$`).
Each item: `<id> <kind> <args>` (args space-separated; an arg expression has no spaces):

| item | args | settable (§6 `set`) |
|---|---|---|
| `curve` | `<expr in x>` (the rest of the string, spaces allowed) | none |
| `line` | `x,y;x,y;...` (2..8 points, numbers or Q ids) | none |
| `area` | `<curveId> <from> <to>` | none |
| `riemann` | `<curveId> <from> <to> <n> <left\|right\|mid\|trap>` | `n` |
| `tangent` | `<curveId> <x0>` | `x` |
| `pointon` | `<curveId> <x>` | `x` |
| `marker` | `x\|y <value> [<label>]` (a dashed guide at x = value or y = value; label = the rest) | `at` |

The renderer labels a curve or line with its id. Item ids share the scene's id space (§5).

### 1d. Text-like objects
- `MathRows.rows`: one step per line. A row is `lhs = rhs`; the renderer aligns rows on their first ` = `. A row that starts with `= `
  continues the previous rhs. `{qid}` tokens and `$..$` TeX allowed. Slot: the bottom callout.
- `Code.lines`: source lines, line 1 first. Highlight follows a bound Trace (§1e) or `set <code> hl <n>`.
- `Cells.items`: array/stack = one cell per item (stack: item 0 at the bottom); grid = one row per item, cells split on spaces (≤6 rows).
  `ptrs` = `"name:index name:index"` (0-based; in a grid `name:row.col`).
- `Bars.items`: `"<label>: <expr>"`; `total` = an expression; `conserve: true` = the bars share one outline of height `total`, and the
  gate checks that the items sum to `total` (±0.5%) in every step (error `conserve`).

### 1e. Trace (the engine runs the code; the model never simulates)
`Trace(id, code, vars, ticks?)`: `code` = the id of a Code object in the same scene; `vars` = space-separated variable names to show.
`ticks` is SERVER-FILLED: the gate runs the Code (Python subset: assignments, `+= -= *=`, arithmetic, comparisons, `for .. in range(..)`,
`for .. in <list>`, `while` (≤200 iterations), `if/elif/else`, `print`, `len`, list literals and indexing) and rewrites the statement with
`ticks`. The model MUST leave `ticks` out (a model-written ticks arg is replaced). Tick format: `L<line> <var>=<value> <var>=<value>`
(`L0` = before the first line runs; a var not yet bound shows `-`). One tick per executed line, at most 24 (more: error `trace-long`).
`lang: "js"`, or Python outside the subset: error `trace-lang` / `trace-unsupported`. The bound Code's highlighted line = the tick's line.
Settable: `set <trace> tick <k>` (k = 0-based tick index).

---

## 2. Quantities (Q) and the stage

| role | value | expr | shown in pre / wrong | shown in post |
|---|---|---|---|---|
| `given` | required (a number from the problem, or a structural count) | none | value | value |
| `derived` | none | required | value (a middle value) | value |
| `answer` | NEVER (error `answer-literal`) | required | `sym`, else `?` | value |
| `unknown` | none | none | `sym`, else `?` | `sym`, else `?` |

- `unit` is display text the label writes itself (`"{armT1} segments"`); a `{qid}` token renders the value only, at 3 significant
  figures with trailing zeros trimmed (`160`, `0.25`, `3.33`).
- `{qid}` tokens may sit in captions, labels, rows, Ask text, Bars labels, marker labels, axis labels. Unknown id: error `token`.
- The stage is `pre | wrong | post`. The SERVER sets it (render option `stage`, default `wrong` = fail closed). The model never sets
  or sees it (no prop names it). `hidden` = pre or wrong.
- Reveal rule (locked, Tony): after a WRONG answer never the final answer's numbers; middle values allowed; after a solve all allowed.

---

## 3. Expression grammar (ONE EBNF; the Python port in views_gate.py and the JS port in graph.js MUST match it)

```ebnf
expr    = sum ;
sum     = product , { ( "+" | "-" ) , product } ;
product = unary , { ( "*" | "/" ) , unary } ;
unary   = ( "-" | "+" ) , unary | power ;
power   = atom , [ "^" , unary ] ;                 (* right-associative: 2^3^2 = 2^9; -2^2 = -(2^2) = -4; 2^-1 = 0.5 *)
atom    = number | call | ref | name | "(" , expr , ")" ;
call    = func , "(" , expr , { "," , expr } , ")" ;
func    = "sqrt" | "sin" | "cos" | "tan" | "abs" | "min" | "max" | "rad" ;
ref     = id , "." , prop ;
prop    = "w" | "h" | "r" | "base" | "height" | "apex" | "radius" | "segments" | "rotate" | "x" | "y" | "len" ;
name    = id | "pi" | "x" ;
id      = letter , { letter | digit | "_" } ;      (* ≤16 chars *)
number  = digit , { digit } , [ "." , digit , { digit } ] | "." , digit , { digit } ;
letter  = "A".."Z" | "a".."z" ;
digit   = "0".."9" ;
```
- Whitespace between tokens is ignored, except where the context is space-delimited (`geom`, Axes args, ops): there an expr has no spaces.
- No exponent notation (`1e3` is an error), no implicit multiplication (`2x` is an error), no `**`.
- `sin cos tan` take radians; `rad(d)` = d·π/180 (so `sin(rad(30))` = 0.5); `min` / `max` take 2+ args, the others exactly 1.
- `name` resolves to: a Q id (its value; an `answer` evaluates too, for geometry, but its number is never printed in a hidden stage),
  `pi`, or `x` (only inside an Axes `curve`, error `expr-name` elsewhere). `ref` = a solved prop of a Shape or Link (`x`,`y` = its
  `at` point, `len` = a Link's length).
- Limits: ≤80 characters, ≤8 nested parens/calls. Errors: `expr-parse` (syntax), `expr-name` (unknown name or func, wrong arg count),
  `expr-value` (division by zero, sqrt of a negative, non-finite, or |value| > 10000).

Conformance vectors (both ports run these; `error` = the code that must be raised; Q values `L=10 T1=100 a=2`):
```json
[["1+2*3", 7], ["(1+2)*3", 9], ["2^3^2", 512], ["-2^2", -4], ["2^-1", 0.5], ["-(3)", -3], ["+4", 4],
 ["L-2", 8], ["T1*(L-2)/(L/2)", 160], ["sqrt(16)", 4], ["abs(-3)", 3], ["min(4, 2, 9)", 2], ["max(1,a)", 2],
 ["sin(rad(30))", 0.5], ["cos(0)", 1], ["pi", 3.141592653589793], [".5*4", 2], ["10/4", 2.5],
 ["1e3", "expr-parse"], ["2x", "expr-parse"], ["2**3", "expr-parse"], ["(1+2", "expr-parse"], ["", "expr-parse"],
 ["1/0", "expr-value"], ["sqrt(-1)", "expr-value"], ["10001", "expr-value"], ["nope+1", "expr-name"], ["foo(1)", "expr-name"],
 ["sqrt(1,2)", "expr-name"], ["min(1)", "expr-name"], ["x+1", "expr-name"]]
```
(`x+1` is an error here because the vectors run outside a curve.)

---

## 4. Relations (`Scene.rels`, strings, directed, acyclic)

| relation | form | writes (target) | reads (sources) |
|---|---|---|---|
| attach | `attach <id>[.<anchorName>] <anchor>` | for a Link with `.start`/`.end`: that endpoint; else the object's position so that its own anchor (default `center`) sits on the target | the target anchor's object |
| on | `on <id> <id>.<edge> <t>` | `<id>` position (its `bottom` anchor on the edge point) and rotation (to the edge's direction) | the surface object |
| pivot | `pivot <id> <anchor>` | `<id>`'s rotation centre (every later `rotate`) | the anchor's object (may be `<id>` itself) |
| align | `align <id> <id> [<id>...] <top\|bottom\|left\|right\|centerx\|centery>` | every id after the first | the first id |
| distribute | `distribute <id> <id> [<id>...] <x\|y> [<gap expr>]` | every id after the first (even spacing, gap default = the first one's size) | the first id |
| stack | `stack <id> <id> [<id>...] <x\|y>` | every id after the first (end to end, no gap) | the first id |
| set | `set <id>.<prop> <expr>` (prop as §3 `prop`, not `x y len`) | that prop | every Q and ref in the expr |
| scale | `scale <id> <id> [<id>...]` (vectors with `q`) | the drawn lengths: one shared length per unit of q | their Q values |

- Unknown relation word or wrong arity: error `rel-parse`. Unknown id or anchor: error `ref`.
- Directed + acyclic: a graph from source objects to target objects; a cycle is error `rel-cycle` (no constraint solver in the MVP).
- One writer per target prop: two relations writing the same object position, or `set` and an op both writing one prop, is error `rel-conflict`.
- Solve order = topological; relations re-solve after the ops of every step (Back = replay, §6).

---

## 5. Ids

- `id := letter (letter | digit | "_"){0,15}`, case-sensitive (error `id`).
- One id space per Scene: object ids, Axes item ids and Q ids are all unique together (error `id-dup`).
- Reserved (error `id-reserved`): `pi x y sqrt sin cos tan abs min max rad all fit`.
- Every id an op, relation, anchor, token, `q`, `code` arg or Axes item points at MUST exist in the same Scene (error `ref`).
- Every object is added by some step (error `unused`); Q need no add.

---

## 6. Ops (`Step.ops`, ≤4 strings of ≤40 chars) and the step model

```ebnf
op     = add | set | glow | hide | camera | param ;
add    = "add" , ids ;
glow   = "glow" , ids ;                  (* this step only: the focus role, §8 *)
hide   = "hide" , ids ;
camera = "camera" , ( "all" | "fit" , ids ) ;
param  = "param" , qid , number ;        (* a given Q gets a new value; replays like set *)
set    = "set" , id , setprop , value ;  (* value = the rest of the op string *)
ids    = id , { " " , id } ;
```
Settable `setprop` and its value:

| target | setprop | value |
|---|---|---|
| Shape | `rotate w h r base height apex radius` | expression |
| Shape | `segments` | integer 1..20 |
| Shape | `at` | point or anchor |
| Link | `from to` | point, anchor (or relative for `to`) |
| Axes item | `n` (riemann), `x` (tangent, pointon), `at` (marker) | expression |
| Code | `hl` | integer line, 1-based |
| Trace | `tick` | integer, 0-based |
| Cells | `hl` | integer index; `ptr.<name>` integer index |

Anything else: error `op-parse` (bad word / shape) or `op-prop` (prop not settable on that kind).

State: before step 1 nothing is drawn. State(k) = solve(objects, relations, ops of steps 1..k), so Back is an exact replay. `add`, `set`,
`hide`, `param`, `camera` persist; `glow` lasts one step. A `set`/`glow`/`hide` on an id not visible in that step: error `op-state`.
`camera` default = fit all visible objects; `camera fit a b` frames those until the next camera op.
Motion: each Next tweens transform/opacity only, 200 ms ease-out (reduced motion: instant). Back replays to k-1 and tweens back.

Step rules (gate; each a test in tests/test_views_gate.py):
1. **count**: a scene Steps has 3..6 steps (error `step-count`).
2. **one-change**: in steps 2..n the ids touched by `add`, `set`, `hide` and `param` together number at most 1 (error `one-change`).
   `glow`, `camera`, `ask` are free. Step 1 (the setup) may add any number of ids.
3. **show**: the last step `add`s, `set`s or `param`s something drawn as geometry (Shape, Link, Axes or its item, Cells, Bars, Trace),
   not only MathRows or Code (error `show`).
4. **pull**: at least one step before the last has an `ask`; the last step has no `ask`; the step right after an `ask` has an
   `add`, `set` or `param` (it reveals what was asked) (error `pull`).
5. **density**: per step at most 12 visible marks (objects + Axes items) and 6 visible labels (error `density`).
6. **caption**: ≤15 words and ≤140 characters (error `caption-long`); voice lints, §7.

---

## 7. Leaks, captions, repair (the gate)

Order: parse → schema + caps → ids/refs → relations acyclic + exprs parse/eval → Trace run → ops + step rules → leak → captions.

Leak (hidden stages only; post skips it). The answer set A = the item's hidden values (livefig ctx answers) ∪ every `answer` Q's value.
Unit variants of a value v: v·10^k (k = -6..6), v·60, v/60, v·3600, v/3600. A number n *hits* A when it is within 0.5% of a variant of
some a ∈ A, or equal to it at 3 significant figures.
- `leak-q`: a `given` value or an evaluated `derived` value hits A (re-role it as `answer`, or drop it).
- `leak`: a number written in any string (caption, label, row, Ask q/choices, Bars label, axis label/range, marker value, code line,
  op value, geom value) hits A.
- `not-given` (strings only: captions, labels, rows, Ask, axis labels): a number that is not a given (livefig ctx givens), not an
  integer 0..12, and not the value of a non-leaking `derived` Q at 3 significant figures.
- Trace ticks: values that hit A are written as `?` by the gate in hidden stages (not an error).
- The renderer adds the geometry rule: in a hidden stage an axis drops numeric ticks within ±15% of a hidden value.

Caption lints (brain vizbench/voice.md; error `voice:<rule>`):
- `you`: at least half the captions of a stepper talk to the student: contain you/your, or end in `?`, or start with a command verb
  (count, look, find, tilt, set, watch, slide, double, draw, add, compare, pick, try, check, move, put, take, use, mark, follow, trace,
  read, solve, write, see, start, now, turn, level, push, pull, drop, split, sum, test, imagine, guess).
- `dash`: no em or en dash. `exclaim`: no `!`. `hype`: none of let's, let us, dive, crucial, key insight, notice how, amazing, simply.
- `not-but`: no "not X, but Y". `qa`: no question answered in the same caption (`? Yes`, `? No`, `? It`, `? Because`, `? The`).
- `persona`: an object or idea never acts like a person: no `<the|this|that|it> <noun>? <wants|tries|likes|hates|knows|decides|fights|loves|steals|needs|hopes|refuses>`.
  Physics motion on the object itself is fine ("the ball rolls").

Repair: the gate returns at most 10 errors as `step <k>: <code>: <detail>` or `<id>: <code>: <detail>`. The server sends them back
once ("return the whole program with these fixed"). A second failure drops the Steps statement: the reply goes out text only, the
error class is logged. The visual never blocks the reply.

---

## 8. Dark colour roles (§11a; specs never carry a colour, the renderer writes `var(--token)` only)

Inside Cluck (`.ai-box .fig`): `--c1` = `--help` #ff9a3e, `--c2` = `--help-on` #ffdcc0, `--c3` = 55% help / 45% help-on,
`--body` = `--help-sheet` #17130f, ink = `--ai-text`, muted = `--help-muted`, knockout `--knock`.

| role | token | drawn as |
|---|---|---|
| body (Shape default) | `--ink` stroke, `--body` fill | 2px outline, no fill |
| guide | `--muted`, dashed 2 4 | 1.5px |
| ground | `--muted` | 1.5px line + hatch |
| region | `--c1` at 22% | fill, no outline |
| yours (the student's wrong mark) | `--wrong` | ring or X + short word, never a fill |
| right (post stage only; error `role-stage` before) | `--correct` | check, ring, short word |
| given / unknown label | `--ink` | KaTeX, `--knock` chip behind when crossing a line |
| hidden value | `--muted` on a `--knock` chip | `sym` or `?` |
| focus (`glow`, one per step) | `--c1` | stroke +1, fill 22%, label in `--c1`; no halo, no shadow |
| vector (a force) | `--c1` | 3px, filled head (graph.js `arrow()`) |
| series 2 / 3 | `--c2` / `--c3` | second / third curve or bar |
| code | `--syn-*` on a `--page` well, `--mono` | highlight = `--float` band |
| grid | `--grid` | 1px |
| caption | `--ai-text`, `--t-md` | `.vw-cap`, two lines reserved |

Slots: Shapes, Links → main; Axes → main, or side when the scene has Shapes; Bars, Cells → side; MathRows → bottom callout;
Code (+ its Trace) → main, or side when the scene has Shapes. Nothing is ever drawn over the scene.

---

## 9. Worked example (rod torque, stage `wrong`; passes every rule above)

```
root = View([st])
st = Steps(sc, [p1, p2, p3, p4, p5, p6])
sc = Scene([ceil, rod, s1t, s2t, Wv, pv, dT, dW, eq], [T1, L, armT1, armW, W], ["pivot rod rod.right"], "A rod hung from two strings, with its weight at the middle.")
ceil = Shape("ceil", "line", "from=0,6 to=10,6", null, null, null, "ground")
rod = Shape("rod", "rect", "w=L h=0.4 segments=10", "0,3")
s1t = Link("s1t", "string", "ceil@0.2", "rod.top@0.2", "{T1} N")
s2t = Link("s2t", "string", "ceil@1", "rod.top@1", "T2")
Wv = Link("Wv", "vector", "rod.bottom@0.5", "+0,-1.5", "W")
pv = Shape("pv", "point", "", "rod.right", "pivot")
dT = Link("dT", "dimension", "rod.top@0.2", "rod.top@1", "{armT1} segments", null, "offset=1")
dW = Link("dW", "dimension", "rod.bottom@0.5", "rod.bottom@1", "{armW} segments", null, "offset=-1")
eq = MathRows("eq", ["{T1} × {armT1} = W × {armW}"])
T1 = Q("T1", "given", 100, "N")
L = Q("L", "given", 10, "seg")
armT1 = Q("armT1", "derived", null, "seg", "L-2")
armW = Q("armW", "derived", null, "seg", "L/2")
W = Q("W", "answer", null, "N", "T1*armT1/armW", "W")
p1 = Step("You took torques about the right end. Where does T1 pull?", null, null, null, null, null, null, ["add ceil rod s1t s2t Wv pv", "glow pv s1t"])
p2 = Step("Count the segments from T1 to your pivot.", null, null, null, null, null, null, ["add dT", "glow dT"])
p3 = Step("Now count from the weight to the pivot.", null, null, null, null, null, null, ["add dW", "glow dW"], Ask("Which pull has the longer arm?", ["T1", "W"]))
p4 = Step("Watch the rod tilt toward the longer arm.", null, null, null, null, null, null, ["set rod rotate -6", "glow dT"])
p5 = Step("Write both turns as one equation.", null, null, null, null, null, null, ["add eq", "glow eq"])
p6 = Step("Level the rod and solve that line for W yourself.", null, null, null, null, null, null, ["set rod rotate 0", "glow eq Wv"])
```
In `wrong`, `{armT1}` shows 8 and `{armW}` shows 5 (middle values), `W` shows its sym `W`; in `post` the renderer may show W = 160.

Snippets for the other families:
```
ax = Axes("ax", "0,4 x", "0,10 f(x)", ["f curve x^2/2+1", "R riemann f 0 4 n left", "m marker y 6 your guess"])
cd = Code("cd", "python", ["total = 0", "for i in range(1, 6):", "    total += i", "print(total)"])
tr = Trace("tr", "cd", "i total")
en = Bars("en", ["PE: U0-K", "KE: K"], "U0", true)
ar = Cells("ar", "array", ["1", "2", "3", "4", "5"], "i:0")
ask = Ask("Is your sum too big or too small?", ["too big", "too small"])
```
