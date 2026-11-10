# ENGAGE: make Cluck's figures interactive (spec B, D, F)

Status: plan only. Nothing here is coded. Tony, Oct 5: "make the cluck thing more engaging", then "expand to calculus AND discrete".
Source: brain `projects/calc/_files/cluck-engage-oct5/PLAN.md` (ideas, TODO B) and `_drift/2026-10-05T1130-alt-todo-expand-calc-discrete.md` (TODO F).
The main thread builds A (changed-number highlight, `chg.mjs`, PR #74) and C (one phone entry). This file specs B, D and F.

Rules for every item:
- One schema for all subjects. No field has a physics-only name.
- Hand-written JSON blocks only. No AI-drawn widgets. Works offline.
- Never give away the answer before `S.finished` (app.js). Tests pin this.
- Reduced motion: no autoplay. Every animation has a manual control.

## 1. Shared schema

Five new fields. Each field is optional. A block without them renders as today.

| field | lives on | shape | read by |
|---|---|---|---|
| `params` | graph block, any `kind` | `[{ var, label, unit?, min, max, step, value }]` | graph.js `prep(block, scope)` (new arg) |
| `readouts` | graph block, any `kind` | `[{ label, expr, unit?, fmt?, reveal? }]` | new graph.js `readouts(block, scope)` |
| `steps` | graph block, `network` / `circuit` / `cartesian` / `scene` | `[{ label, md?, set }]` | new graph.js `applyStep(block, i)`, then `prep` |
| `phases` | new block type `{ "type": "phases" }` | `{ phases: [{ label, blocks, vals? }], invariant? }` | app.js block renderer, calls `Graph.render` per phase |
| `concept` | problem (top level) | `["momentum", "work-energy"]`, slugs `^[a-z][a-z0-9-]{1,23}$` | app.js on answer, rewards/engine.js `answer(o)` |

### Field rules
- `params[].var`: a math.js name (`k`, `h`, `n`). It must not clash with a mark's own variable (`x`, `t`). `value` is the start value. It must lie in `[min, max]` on the `step` grid.
- `readouts[].expr`: math.js, may use any `params` var. `fmt`: decimals (default 2). `reveal: true` means the readout carries the answer.
- **Guard:** a readout with `reveal: true` is not in the DOM until `S.finished`. Its row shows "?" with sr-only text "shown after you answer".
- `steps[].set`: a partial patch of the same block. Match by id: `nodes` by `id`, `edges` by `from`+`to`, circuit `inputs` by `name`, `params` by `var`, cartesian/scene `marks` by a new optional `id`. Step 0 is the block as written.
- Changed-state highlight: between step i-1 and step i, every patched item gets the `--mark` ring (same token as A's `<mark class="chg">`). This is A's idea applied to figures.
- `phases[].blocks`: text and graph blocks only. No nested phases. 2 to 4 phases.
- `phases[].vals`: the math.js scope for that phase (`{ "v1": 2.5, "m": 1.2 }`).
- `invariant`: `{ label, expr, unit?, fmt? }`. The app evaluates `expr` in each phase's scope and prints one line: "p before = 6.00 = p after". It shows "≠" in `--bad` if the values differ by more than 1e-6 relative. Subject-neutral: momentum, energy, area under u-sub, edge count.
- `concept`: 1 to 3 slugs per problem. Slug list lives in SCHEMA.md (one table). Free text is a schema error.

### Where each field goes in SCHEMA.md
- `params`, `readouts`, `steps`: one new `## Interactive graph fields` section after `## kind: network`. In the JSON Schema, add one `$defs/interactive` object and `$ref` it from each `kind_*` def (they have `additionalProperties: false`, so each needs the three keys).
- `phases`: the `## Blocks` list gets a third bullet. JSON Schema: `block.type` enum becomes `["text", "graph", "phases"]`, plus `$defs/phases`.
- `concept`: one row in the `## One problem` table ("served to the browser: yes"), one property in the problem schema. Mirror all of it in `tests/schemas.mjs`.
- `alt` rule stays: `alt` describes step 0 and the start value of each param. It never gives the answer.

### graph.js changes (small)
- `evalNum(v)` and `fnOf(expr, name)` take a `scope`. `fnOf` evaluates with `{ ...scope, [name]: x }`.
- `prep(block, scope)`: numify with the scope. `network` and `circuit` skip numify today; they only get `steps`.
- `render(el, block, scope)`: today it caches `el._g = prep(block)`. New rule: cache by a scope key (`JSON.stringify(scope)`). A new scope re-preps.
- Circuit: `inputs[].value` already draws "= 1". New: a pure `evalCircuit(g)` computes every gate's 0/1. A lit wire uses `--c2`, an off wire uses `--line`.

## 2. B: param slider

### UI rules
- One row per param under the figure: label, native `<input type="range">`, value + unit in `--t-sm`. Grid: label left, value right, range full width under them on phone.
- Native range only. Keyboard: arrows = `step`, PageUp/PageDown = 10 steps, Home/End = min/max (browser default).
- Touch target 48px tall. Thumb 24px. Track 4px, `--line`; filled part `--c1` (Cluck sheet: `--ai`).
- `aria-valuetext` = "200 newtons per metre". The label is a real `<label for>`.
- Redraw on `input` with `requestAnimationFrame` (one render per frame, drop extra events).
- The figure keeps a fixed height (`aspect-ratio` set from the first render). No layout jump while dragging.
- Readouts sit under the sliders: "v = 1.23 m/s". `aria-live="polite"`, updated on `change` (not on every `input`), so a screen reader is not flooded.
- A "Reset" text button returns every param to `value`. It shows only after a change.

### Where it shows
1. Cluck's sheet, "See reference solution": the reference steps are templates with `{k}`; dragging k updates the numbers in the steps.
2. The question's own figure, after `S.finished` only.
3. The snack card: the slider runs from the original's value to the snack's value (ties to A's `saccharine.changed`).
- Never before a submit on the question figure. Snack and reference slider rows may show any time; `reveal` readouts still wait for `S.finished`.

### Tests to add
- `tests/graph.test.mjs` (new, node): `prep` with a scope substitutes `k`; cache key changes re-prep; `evalCircuit` truth table for each `op`.
- `tests/schema.test.mjs`: a bad `params` (value off grid, min > max, clash with `x`) fails; a good one passes.
- `tests/slider.pw.mjs` (new): drag and keyboard change the readout; figure height is the same before and after; `reveal` readout absent before finish and present after; 390px no horizontal scroll.
- `tests/blind.pw.mjs` + `tests/polish.pw.mjs`: add one slider problem.

## 3. D items, in build order

| # | item | cost | test |
|---|---|---|---|
| D1 | **Cluck → step highlight.** Cluck's text says "step 2"; the matching `.orig-sol li` gets `data-step` and the `--mark` ring; the fold opens on tap. | S: app.js only, regex on Cluck's text + one CSS rule. | pw: Cluck text with "step 2" rings li #2; no ring when no step is named. |
| D2 | **Predict-then-reveal.** Before the first slider drag or step: "Guess: if k doubles, v goes ×?" 2 to 4 chips. Tap one, then the figure moves. No grade, +1 XP once. Schema: `predict: { md, choices, correct }` on the graph block. | S: one prompt row, engine `answer`-free XP call. | pw: slider disabled until a chip is tapped; XP +1 once; "Skip" works. |
| D3 | **Skill wallet.** engine.js `fresh()` gets `skill: {}`; `answer(o)` takes `o.concept` and adds `{ ok, n }` per slug. The progress popover lists "Momentum 4/5" and "weakest: springs → 3 snacks". | M: engine + popover + `concept` tags on existing banks (tools/ script). | rewards.test.mjs: tallies add, survive reload, old saves load (no `skill` key). |
| D4 | **Phases block.** Side by side on desktop, stacked on phone. The invariant line under them. A param slider (B) re-evaluates every phase. | M: new block renderer, reuses `Graph.render`. | pw: two figures, invariant "=" line; a bad invariant shows "≠"; phone stacks. |
| D5 | **Scene animation scrubber.** `params` with `"var": "t"` and `"anim": true` gets a play button + the range as scrubber. Play runs t from min to max in `max - min` seconds. Reduced motion: no play button, scrubber only. | L: rAF loop, pause on blur and hidden tab, per-kind tuning. | pw: play advances t; reduced-motion hides play; tab hidden stops the loop. |

Step-through (`steps`) UI, used by D and F: "Back" and "Next" buttons (48px), a "Step 2 of 6" label, the step's `md` under the figure in `aria-live`. Keys: Left/Right when the figure has focus.

## 4. F: subject roadmap (Tony, Oct 5 order)

### 4a. Discrete math FIRST (CSCI26)

| topic | widget | params / steps |
|---|---|---|
| BFS / DFS | `network` + `steps` | each step colors the frontier (`c1`), visited (`c2`), the new edge (`--mark` ring). Queue/stack shown in `md`. |
| Dijkstra | `network` + `steps` | edge weights `w`; each step: settled node, relaxed edges ringed, distance table in `md`. |
| Trees (traversal, spanning tree) | `network` `layout: tree` + `steps` | pre/in/post order: one node per step. Prim/Kruskal: one edge per step. |
| Induction | text + `steps` | base → hypothesis → step; each step highlights its line. Slider `n` (1..12): table of the first n terms vs the closed form, readout "sum = closed form" (`reveal` if it is the answer). |
| Recurrences | `cartesian` + `params` | `n` slider: points of a(n) recursive vs closed form. |
| Probability | `cartesian` grid (sample space) or `network` tree | sliders `n`, `p`; favorable cells filled; readout P(event) with `reveal`. D2 predict first ("more or less than ½?"). |
| Counting | text table + `params` | `n`, `k` sliders: one Pascal row, C(n,k) ringed. |
| Logic circuits | `circuit` + tap inputs | tap an input to flip 0/1; `evalCircuit` lights gates. `value` exists; 19 figures in problems.json today. Truth table row lights with it. Predict: "which row makes it false?" |

Build note: circuit taps first (no schema change beyond `steps`; the data is there), then `network` steps, then sliders.

### 4b. Physics I (Phys 2A), every topic

| topic | widget | params |
|---|---|---|
| Kinematics 1D | `cartesian` x-t / v-t + D5 scrubber | `v0`, `a`, `t` |
| Projectile | `scene` path + D5 | `v0`, `theta`, `g`; readouts range, max height (`reveal`) |
| Newton / forces | `scene` free-body | `m`, `F`, `theta`; readout a = F_net/m |
| Friction / incline | `scene` incline | `theta`, `mu_s`, `mu_k`, `m`; readout "slides / holds" |
| Circular motion | `scene` + D5 | `r`, `v`, `m`; readout F_c, a_c |
| Work-energy | `bars` (LOL) + `phases` | `m`, `h`, `v`, `k`, `x`; invariant E_total |
| Power | `cartesian` E-t | `F`, `v`; readout P = F·v |
| Momentum / collisions | `phases` before/after | `m1`, `m2`, `v1`, `v2`, elastic vs inelastic toggle (step); invariant p |
| Rotation / torque | `scene` lever / disk | `F`, `r`, `theta`, `I`; readouts τ, α |
| Angular momentum | `phases` (arms in/out) | `I1`, `omega1`, `I2`; invariant L |
| SHM (spring, pendulum) | `cartesian` x-t + D5 | `k`, `m`, `A` (spring); `L`, `g` (pendulum); readouts T, ω |
| Gravitation / orbits | `scene` + D5 | `M`, `r`; readouts v_orbit, T |
| Fluids (if in the course) | `scene` tank | `rho`, `h`, `A1`, `A2`; readouts P, v2 (Bernoulli) |

Phase 1 (fits the PLAN list): Hooke/spring energy, kinetic energy, work F·d·cosθ, momentum + inelastic collision, projectile range.

Physics II, short roadmap: Coulomb (`q1`, `q2`, `r` slider, force arrows), E fields (field arrows on a grid, test charge drag), potential (`cartesian` V(r)), circuits/Ohm/RC (V, R, C sliders, RC charge curve + D5), magnetism (`v`, `B`, `q`: force arrow, circle radius), induction (moving bar `v`, flux readout), optics (lens: object distance `d_o`, `f`; ray `scene`, image readout).

### 4c. Calculus LAST (Calc I + II)

| topic | widget | params / steps |
|---|---|---|
| Limits | `cartesian` + `params` | `x` approach slider; readout f(x); hole drawn |
| Derivative | `cartesian` secant → tangent | `h` slider (1 → 0.01); readout slope (`reveal`) |
| Related rates | `scene` (ladder, cone) + D5 | `t`; readouts of both rates |
| Optimization | `cartesian` + `params` | the design variable (`x`); readout the objective; D2 predict "where is the max?" |
| Riemann sums | `cartesian` shade rectangles | `n` (1..50), left/right/mid as steps; readout sum vs exact |
| FTC | `cartesian` shade | bounds `a`, `b`; readout area (`reveal`) |
| u-sub, parts | `phases` | x-world ↔ u-world (u-sub); u, dv → uv − ∫v du (parts); invariant "area = 12" |
| Volumes (shells vs washers) | `cartesian` + D5 sweep | `t` sweeps the slice; step toggles shell vs washer (Tony's pain point) |
| Arc length | `cartesian` polyline | `n` segments; readout length vs exact |
| Series / Taylor | `cartesian` | `a` (center), `n` (degree); readout error at a point |
| Convergence tests | text + `steps` | one test per step (divergence → comparison → ratio); the deciding line highlighted |

## 5. Build order and rough cost

S = under half a day, M = about a day, L = 2+ days.

| order | item | cost | needs |
|---|---|---|---|
| 1 | Schema: `params`, `readouts`, `steps`, `phases`, `concept` in SCHEMA.md + schemas.mjs | S | none |
| 2 | graph.js scope (`evalNum`, `fnOf`, `prep`, `render` cache key) + graph.test.mjs | S | 1 |
| 3 | D1 Cluck → step highlight | S | none |
| 4 | B slider UI + guard + slider.pw | M | 2 |
| 5 | Physics Phase 1 params (5 topics) | M | 4 |
| 6 | D2 predict-then-reveal | S | 4 |
| 7 | Step-through UI + `applyStep` + changed-state ring | M | 2 |
| 8 | F-discrete: circuit taps (`evalCircuit`) | S | 7 |
| 9 | F-discrete: BFS/DFS/Dijkstra/trees on `network` | M | 7 |
| 10 | F-discrete: induction, recurrences, probability, counting | M | 4, 7 |
| 11 | D3 skill wallet + `concept` tags on banks | M | 1 |
| 12 | D4 phases block | M | 2 |
| 13 | Physics I rest (forces → fluids) | L | 4, 12 |
| 14 | D5 scrubber | L | 4 |
| 15 | Physics II roadmap topics | L | 13, 14 |
| 16 | Calc I + II topics | L | 4, 7, 12, 14 |

Note: Tony's order puts discrete first in F. Exam 2 (Phys 2A) is Oct 9, so row 5 (physics Phase 1) stays before discrete. See question 1.

## Open questions for Tony
1. Exam 2 is Oct 9. Physics Phase 1 sliders before discrete (as above), or discrete strictly first?
2. Is fluids in your Phys 2A course?
3. Skill wallet: may the popover say "weakest: springs", or is a "weakest" label too much pressure? (Option: show only counts.)
