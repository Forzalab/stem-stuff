# Authoring problems (for future Claude)

One problem = one file: `p/<CODE>.json`. The site fetches a file only when someone types its code, so nothing lists the codes.
The schema lives in `schema/problem.schema.json`. Validate against it before every commit:

```
cd tests && npm install && npm test
```

## Codes
- Format is `PREFIX-SUFFIX`. Prefixes: `CALC1` (calculus), `PHYS` (physics), `CSCI26` (discrete math).
- The suffix is 3 characters, A–Z and 0–9. Don't use O/0 or I/1.
- **A suffix must be unique across all subjects** (the tests enforce this).
- The filename must equal the code: `p/PHYS-F3N.json`.
- The first key is `"$schema": "../schema/problem.schema.json"`.

## Top level
| key | required | meaning |
|---|---|---|
| `code` | yes | `CALC1-K4M` |
| `type` | yes | `num`: the answer is one value. `expr`: the answer is a function of `var`. |
| `answer` | yes | math.js string, or exactly `"dne"` |
| `points` | `expr` only | at least 3 sample values of `var`. Keep them inside the domain. |
| `var` | `expr` only | defaults to `x`. For physics, use `t`. |
| `tol` | no | relative tolerance. The default is 1e-6. Use `0.01` for physics numbers. |
| `body` | yes | array of blocks, stacked top to bottom in any order and repeatable |

**Never put the answer in `body` or in a graph's `alt`.**

## Blocks
- Text: `{ "type": "text", "md": "..." }` or `"md": ["line", "", "line"]`.
  - Full GFM markdown: **bold**, lists, tables with `:---:` alignment.
  - `$..$` is inline math and `$$..$$` is display math.
  - Raw HTML is escaped. Images are ignored.
  - Prefer the array form for tables. Put a blank line (`""`) before a table.
- Graph: `{ "type": "graph", "kind": "cartesian" | "scene" | "bars", "alt": "...", ... }`.
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

## Colors, labels, anchors
- `color` is a token name only: `c1` (blue, main), `c2` (orange), `c3` (violet), `ink`, `muted`, `ok`, `bad`, `mark`. Never hex.
- `label` is plain text with optional `$..$`. Keep it to **6 labels or fewer per graph**.
- `anchor` says which side of the point the label sits on: `n ne e se s sw w nw c`.
- `dash: true` draws a dashed line. Use it for asymptotes, guides and "ghost" forces.

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

## Checklist before commit
1. `cd tests && npm test` passes. It checks the schema, the filename, that the answer evaluates, that the TeX renders, that the graph math compiles, the label count, and that suffixes are unique.
2. Open `/#<CODE>` locally. The figure reads correctly, no labels overlap, and the width is fine on a phone.
3. The answer is nowhere in the body or `alt`.

## Examples
- `p/CALC1-T6B.json`: markdown table + limit
- `p/CALC1-A9R.json`: text + cartesian shaded region + text
- `p/PHYS-F3N.json`: text + incline FBD scene + text
- `p/PHYS-S2K.json`: text + incline and spring scene + table
