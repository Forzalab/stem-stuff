# Figure design language

Reference build: `design/specimen.html`. Every number in its script's top block (`SW`, `DASH`, `HATCH`, `OFF`, `PAD`, `FILL`) comes from this page. Contrast is WCAG 2.x against sheet `#1d2839`, the card the figure sits on. Style: clean technical textbook line drawing. The figure sits straight on the card with no frame, border or background of its own.

## 1. Color tokens

| token | hex | vs sheet | use |
|---|---|---|---|
| ink | #e7edf6 | 12.61 | outlines, surfaces, springs, ropes, default labels |
| muted | #a2b3cb | 6.96 | axes, hatch, angle arcs, guides, trajectories, ticks |
| c1 | #7ab8ff | 7.16 | **every force** (one blue), first series |
| c2 | #ffb86b | 8.71 | velocity, second series |
| c3 | #ff8fc8 | 7.08 | acceleration, third series (was #d59cff: it merged with c1 under red-green color blindness) |
| grid | = line #34445d | 1.51 | grid lines only (decorative) |
| mark | #ffd84a | 10.72 | highlight only, never a series next to c2 |
| ok / bad | #5fd394 / #ff7a7a | 7.94 / 5.88 | right / wrong answers |
| edge | #6b7f9e | 3.64 | input boundaries (explain box) |
| hint | #7d8ea8 | 5.33 on field | placeholder text |

Rules:
- **Forces are all c1.** The color says "force"; the label says which one. The site `--blue` #3a67d8 (2.91) fails 3:1 and stays a button fill. `--focus` #8fb0ff (6.94) was the other candidate; c1 wins because it is already the graph token and has more distance from pink.
- Kind is carried by color and head together, so it survives grayscale: force c1 + filled head, velocity c2 + open head, acceleration c3 + double head.
- Never c2 and mark in the same figure as two series.

## 2. Strokes (px, never scale with the figure)

| thing | width |
|---|---|
| grid | 1 |
| axis, construction (arcs, hatch, guides), rope | 1.5 |
| outline (bodies, surfaces, springs, incline) | 2 |
| curve, velocity, acceleration | 2.5 |
| force | 3 |
| dashed force (not acting on the body) | 2 |
| trajectory (dotted) | 3 |

`vector-effect: non-scaling-stroke`, round caps and joins everywhere.

## 3. Arrowheads

One geometry: length `L = max(8, 4w)`, width `0.75 L`, where `w` is the shaft width. On short arrows `L` shrinks to `len / 1.6`.
- filled wedge (force): shaft stops `0.6 L` short of the tip so the round cap does not poke through.
- open chevron (velocity): two strokes at shaft width.
- double wedge (acceleration): second wedge `0.75 L` behind the first.
- axes: filled wedge at axis width, muted.

## 4. Dashes

| dash | array | meaning |
|---|---|---|
| asymptote | 6 4 | asymptotes, reference lines on graphs |
| guide | 2 4 | construction: vertical reference, radius |
| ghost force | 8 5 | **a force that does NOT act on this body**: a component, the other half of a third-law pair, a force on a different body. |
| trajectory | 0 7 (dots) | path traced by a moving object |

A force that acts on the body is always solid. Enforced by `tests/schema.test.mjs` (a dashed force at a `body` mark's `at` fails).

## 5. Labels

- HTML layer over the SVG, KaTeX, 16px (ticks 14px muted, tabular numbers).
- Color: same as the mark for c1/c2/c3/ok/bad/mark; ink otherwise.
- Gap 6px from the anchor point (4.2px on diagonals). `anchor` is one of c + 8 compass points; forces default to the side the arrow points.
- Knockout: `rgb(29 40 57 / 0.85)` background, 3px side padding, 3px radius, so a label can cross a line and stay readable. No text stroke/halo.
- Layout pass measures labels and grows figure padding (min 16px) until nothing is clipped, max 3 passes.

## 6. Bodies (Tony picks one)

| | outline | fill |
|---|---|---|
| **A** | 2px ink | ink 10% over sheet = #313c4c (incline 5% = #273242) |
| **B** | 2px ink | none (sheet shows through, covers lines behind it) |

`fill: true` on a body overrides either: its color at 22% opacity (same as shaded regions). Dot bodies are solid ink, radius at least 6px. Disk and pulley get a 2.5px center dot; ring adds an inner circle 5px in.

## 7. Scene primitives

- **surface**: 2px line + hatch on `side` (right of from→to; a left-to-right floor with `right` hatches below). Hatch: 1.5px muted, 10px long, every 8px, 45° leaning back toward `from`, 4px inset.
- **incline**: triangle, body fill, hatch under the base, angle arc radius 30px muted at the acute vertex, label outside the arc.
- **pivot**: triangle from the pin to the nearest surface within 40px (flush base, half-width `max(8, 0.6 h)`); pin is a 3.5px open circle.
- **spring**: 2px zigzag, amplitude 5–10px, straight leads 6–16px.
- **pulley**: body fill, 2px rim, inner 1.5px muted ring 4px in, 3.5px axle; mount is a triangle to the mount point.
- **point**: 4.5px radius, filled or open (sheet fill + 2px ring).
- Layers bottom to top: surface, incline, seg/arc, path, rope/spring, pulley, body, pivot, point/axes, force/arrow, text.

## 8. Graphs

Grid 1px, axes 1.5px muted with filled heads, tick marks 6px, tick step from 1-2-5 at about 56px spacing. Shade at 22% of the curve's color. Bars: 20–48px wide, 8px gap, 24px between groups, zero line in ink.
