# Extraction: calc1 UI + problem schema

Sources: `brain/projects/calc/_files/calc1/index.html` (CSS), `calc1/NOTES.md`, `schema/problem.schema.json`, `AUTHORING.md`, `p/*.json`.
Contrast ratios are WCAG 2.x against sheet `#1d2839` (the card the figure sits on).

## Color (as found)
| token | hex | role in calc1 | vs sheet |
|---|---|---|---|
| paper | #151d2b | page bg, sticky header | — |
| sheet | #1d2839 | problem card bg | — |
| field | #111826 | input bg | — |
| line | #34445d | 2px card/input/header borders | 1.51 |
| ink | #e7edf6 | text | 12.61 |
| muted | #a2b3cb | code chip, tally, preview | 6.96 |
| blue | #3a67d8 / hover #2c55bd | button fill only (white text) | 2.91 |
| focus | #8fb0ff | 3px focus ring | — |
| mark | #ffd84a / mark-ink #1b2536 | solved chip | 10.72 |
| ok | #5fd394 | correct, solved border | 7.94 |
| bad | #ff7a7a | error text | 5.88 |
| (off-token) | #7d8ea8 | input placeholder | — |
| (off-token) | #3b3514 | flash keyframe | — |

Proposed graph tokens: c1 #7ab8ff (7.16), c2 #ffb86b (8.71), c3 #d59cff (7.09), grid #2a374d (1.24).

## Type
- One family: Atkinson Hyperlegible 400/700 (Google Fonts), fallback "Segoe UI", system-ui, sans-serif.
- Sizes in use: 0.95rem (code chip, msg), 1rem (tally), 1.05rem (q, mobile), 1.125rem/1.5 (body), 1.2rem (q), 1.25rem (tally numbers), 1.5rem/1.2 (h1).
- Math: KaTeX 0.16.9, display mode, inherits 1.2rem from `.q`.
- Halo precedent: mascot word uses `stroke: #1b2536; stroke-width: 6px; paint-order: stroke`.

## Spacing, radius, strokes
- Spacing (rem): 0.25, 0.5, 0.75, 1, 1.25 on a 4px grid; off-scale 0.1, 0.45, 0.7, 0.9, 1.1.
- Radius: 4 (chip), 6 (input, button), 10 (card).
- Line weights: 2px every border, 3px focus ring, 3-4px mascot outlines, 6px halo.
- Figure box: card max 52rem minus 2x1.25rem padding minus 2x2px border = **788px** desktop; at 390px viewport = **314px**. Every px value in the spec must read at 314px.

## Schema facts that drive styling
- Every mark has `color` (c1 c2 c3 ink muted ok bad mark), `dash` (boolean), `label` (<=80 chars, KaTeX), `anchor` (c + 8 compass). No width, opacity or font keys: all of it must come from the language.
- Only `fill` booleans: body, poly. Shade always fills.
- Cartesian marks: fn param shade tangent vline hline point seg arrow arc poly text. Scene: body spring pulley rope surface incline force path pivot axes + the shared six. Bars: groups of {label, value, color}, negative values allowed.
- Scene is 1:1 world units, auto-fit: world-to-px scale varies per figure, so strokes, arrowheads, hatch spacing, coil amplitude caps and label offsets must be px, not world units.

## Findings (inconsistencies)
1. **c1 and c3 collapse under red-green CVD**: CIELAB ΔE 5 (deutan), 7 (protan), Machado 2009 full severity. F3N draws three forces in c1/c2/c3, so mg (c1) and f_k (c3) are indistinguishable for ~5% of men. Candidate c3 #ff8fc8 (pink): worst pair ΔE 17 across normal/deutan/protan/tritan, 7.08 vs sheet.
2. **c2 vs mark** ΔE 30 in normal vision, 21 deutan, 16 tritan: never use both as series in one figure; mark is highlight only.
3. **Force color is by order, not meaning**: F3N and S2K both give mg=c1, N=c2, the third force=c3. Nothing fixes force vs velocity vs acceleration colors.
4. **dash on a real force**: S2K draws the spring force `F_s` dashed, but AUTHORING says dash = asymptote/guide/ghost. Either the example or the rule is wrong.
5. `blue` (2.91) is a button fill, not a stroke color; graphs must not reuse it (fails 3:1 for graphics).
6. `grid` #2a374d is darker than `line` #34445d; fine for grid (1.24, decorative), but axes need something stronger than both.

## Gaps (decisions not in any source)
Stroke scale, arrowhead, dash arrays, fill opacities, hatch, label size/halo/placement, scene primitive geometry, >3 series, bar chart layout, light mode (calc1 is dark-only, `color-scheme: dark`).
