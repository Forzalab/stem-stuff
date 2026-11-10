# Visual tests: physics invariants on scene JSON (agent X, PR B)

Executable checks that a generated scene (SCHEMA.md `schema: scene`, v1) tells the physics truth, plus good and
planted-bad cases that prove each check bites. Code: `tests/scene.test.mjs` (`physics()`, `lint()`, `verdict()`), cases:
`tests/visual-cases/*.json`. Run: `cd tests && npm test` (or `node --test scene.test.mjs`).

## Case file format
`{ case, source, expect: "pass"|"fail", fails?: <rule>, slip_kind?: "concept"|"mechanical", why, invariants: [...], scene }`.
A good case must return no findings at all; a planted-bad must return at least one, and one of them must be its `fails` rule
(so a bad case that fails for the wrong reason is also a test failure). Each case's scene must also pass the scene schema and `check()`.

**Fields defined here that the schema does not have yet (for agent S, schema owner):**
- mark-level `ghost: true` (+ required `label`, `dash: true`, `color: "muted"|"grey"`) and `truth: true`. The scene schema's
  marks are open objects, so these validate today; S should add them to `$defs.mark` explicitly.
- `slip_kind: "concept"|"mechanical"` lives on the case wrapper because `goal` is `additionalProperties:false`.
  Proposed home: `goal.kind` (enum concept|mechanical), required whenever any mark has `ghost: true`.
- invariants live on the case wrapper (like kit `examples[].invariants`), not in the scene.

## Invariants (physics, per param grid of 6 points per param over `over`)
| rule | checks | params |
|---|---|---|
| `gravity_down` | the mg arrow is exactly vertical and points down | `mark` |
| `toward` | an arrow points at a center (centripetal a at Ferris top AND bottom; g in orbit) | `mark`, `center` |
| `spring_restoring` | F·x < 0 for x ≠ 0, and the arrow's x-direction opposes x | `F`, `x`, `mark?` |
| `nonincreasing` | mechanical E never rises along a slide (friction) | `of`, `along`, `along_range` |
| `incline` | along = W sinθ, into = W cosθ (catches a sin/cos swap that `pythag` misses) | `W`, `th` (rad), `par`, `perp` |
| `momentum` | Σ m·v (x and y) before = after, with the final masses (mass transfer) | `before`, `after`: `[m, vx, vy]` |
| `ferris` | N_top = mg − mv²/r, N_bottom = mg + mv²/r, N_side = √((mg)² + (mv²/r)²) | `m g v r top bottom side` |
| `power_law` | of · r^n constant (g ∝ 1/r²: n = 2; v_orbit ∝ 1/√r: n = 0.5), r = center distance | `of`, `r`, `n` |
| `orbit_radius` | drawn orbit circle r = planet r + altitude | `circle`, `planet`, `h` |
| `area` | signed ∫ y dx of a poly outline (pts left to right along the top) or ∫(f − g) of a shade × `scale` = a value, or = the number in the mark's own label (`equals: "label"`) | `mark`, `equals`, `scale` |
| `conserved`, `pythag`, `finite` | the existing kit invariants, reused | |

## Lint (every case, always on)
| rule | checks |
|---|---|
| `ghost_label` | a ghost has a non-empty label ("your 80 J") and is not also truth |
| `ghost_alone` | a ghost never appears without a truth mark: some truth is always on, or revealed at the same step as the ghost |
| `ghost_kind` | ghosts only when `slip_kind = "concept"` (never ghost a mechanical slip, D32) |
| `ghost_style` | ghost dashed + muted/grey; truth solid (§1 viz rules) |
| `label_recall` | every arrow / vector / force has a label (ported) |
| `in_view` | every anchored point, arrow end, poly vertex and circle box sits inside `view` at the init values (ported) |
| `anchored` | (invariant) a force arrow starts on the body it acts on (ported) |

## Ported benchmark criteria (search Oct 7, ≤10 min)
1. **Render validity / in-canvas** → `in_view`. SVGenius ([arXiv 2506.03139](https://arxiv.org/pdf/2506.03139)) and VGBench ([arXiv 2407.10972](https://arxiv.org/html/2407.10972v2)) score whether generated vector graphics render and stay on the canvas.
2. **Text fidelity / label recall** → `label_recall`, `ghost_label`. "Can AI Draw Science?" ([arXiv 2606.28406](https://arxiv.org/pdf/2606.28406)) scores OCR label recall; SciFig ([arXiv 2601.04390](https://arxiv.org/abs/2601.04390v1)) requires correct, legible labels.
3. **Convention adherence** → `ghost_style` (+ `gravity_down`). Same SciDraw-style protocol: disciplinary drawing conventions; ours = DESIGN-LANGUAGE ghost dashed/grey, truth solid/colored.
4. **Misplaced force vectors / conservation violations** → `anchored`, `momentum`, `conserved`. PhyDrawGen ([arXiv 2605.30512](https://arxiv.org/pdf/2605.30512)) names these as the systematic errors of generated physics diagrams.
5. **Questions derived from structured annotation (objects, forces, attributes)** → `area` with `equals: "label"`: the figure must mean what its own label says. VeriphyT2IBench, in "Towards Physics-Faithful Generation of Scientific Diagrams" ([arXiv 2608.13112](https://arxiv.org/pdf/2608.13112)).

## Cases (34: 13 good, 21 planted-bad)
| case | source | expect | why |
|---|---|---|---|
| `calc-area-bad` | Calc 1 ∫ area, planted | fail → `area` | The shade runs from 0 to b + 1: the figure shows a bigger area than the integral it illustrates. |
| `calc-area-good` | Calc 1 ∫₀² x² dx = 8/3 (rectangle reflex ghost) | pass | The shade under x² from 0 to b encloses b³/3 for every b; the ghost rectangle b·f(b) = 8 at b = 2 matches its label. |
| `ferris-8vq-bad` | PHYS_8VQ b, planted | fail → `ferris` | The truth seat force is mg + m w^2 R = 355 N: perpendicular parts added as numbers. |
| `ferris-8vq-good` | PHYS_8VQ b (355 N added vs 286 N) | pass | Seat force halfway = hypotenuse of mg = 274 N up and m w^2 R = 80.6 N inward = 286 N; top N = mg - mv^2/r, bottom N = mg + mv^2/r; every a_c points at the hub; ghost = the straight-added 355 N. |
| `ferris-bottom-accel-bad` | PHYS_8VQ / 8U2 bottom, planted | fail → `toward` | At the bottom seat the a_c arrow points down, away from the hub: the classic 'heavier at the bottom because a points down' picture. a_c points to the center at the top AND the bottom. |
| `friction-bad` | energy-bars, planted | fail → `nonincreasing` | Friction work added instead of subtracted: K + U grows as the block slides (energy from nowhere). |
| `friction-good` | energy-bars, rough ramp (Exam 2 W_fric family) | pass | K + U drops by μ m g cosθ · s as the block slides; K + U + E_th stays at the start total. |
| `incline-anchor-bad` | incline, planted | fail → `anchored` | mg starts at the foot of the ramp, not on the block (PhyDrawGen's 'misplaced force vector'). |
| `incline-good` | mechanics kit incline (PHYS_F3N family) | pass | mg straight down from the block; along-ramp mg sinθ, into-ramp mg cosθ, for θ = 10..60°, m = 1..5 kg. |
| `incline-gravity-bad` | incline, planted | fail → `gravity_down` | mg drawn perpendicular to the ramp (into the surface) instead of straight down: the most common generated-FBD error. |
| `incline-label-bad` | incline, planted | fail → `label_recall` | The into-ramp component has no label: an anonymous arrow (text-fidelity / label-recall criterion). |
| `incline-swap-bad` | incline, planted | fail → `incline` | sin and cos swapped. The old pythag invariant still PASSES (sin² + cos² is symmetric); only the new incline invariant catches it. |
| `kwv-a-good` | PHYS_KWV a (40.0: rectangle only) | pass | Ghost = the rectangle A–B only (16 squares x 2.5 J = 40 J), beside the solid truth (24 squares = 60 J). |
| `kwv-b-good` | PHYS_KWV b (20.0: triangle only) | pass | Ghost = the triangle B–C only (8 squares = 20 J). |
| `kwv-d-bad` | PHYS_KWV d, planted | fail → `area` | The ghost is labelled 'your 80 J' but drawn as the truth shape (24 squares = 60 J): the picture contradicts its own label, so the contrast teaches nothing. |
| `kwv-d-good` | PHYS_KWV d (80.0: forgot the 1/2) | pass | Ghost = the full 8x4 box (32 squares = 80 J): the triangle drawn without its 1/2. |
| `kwv-e-bad` | PHYS_KWV e (24.0: squares not rescaled), planted | fail → `ghost_kind` | e is a units/rescale slip (mechanical, D32): a ghost there would show the same shape as the truth; ghosts are for concept slips only. The area itself is self-consistent (24 squares at scale 1), so only ghost_kind catches it. |
| `orbit-altitude-bad` | orbit family, planted | fail → `orbit_radius` | The truth orbit circle is drawn at r = h = 3 R_E: the altitude-as-r slip in the figure itself. |
| `orbit-ghost-alone-bad` | orbit family, planted | fail → `ghost_alone` | The ghost circle is always on screen but the truth orbit waits for the answer: she sees only her own wrong circle (never drawn alone). |
| `orbit-good` | Exam 2 orbit family (G7H, H3A, QZR...): altitude-as-r | pass | Truth orbit r = R_E + h = 4 R_E; g ∝ 1/r^2 and v ∝ 1/sqrt(r) across h = 1..4 R_E; g points at Earth's center; ghost circle r = 3 R_E fits inside. |
| `orbit-gravity-bad` | orbit family, planted | fail → `power_law` | v_orbit computed as sqrt(g0 R_E^2)/r (v ∝ 1/r): the speed bar would shrink too fast as the orbit grows. |
| `pucks-6px-bad` | PHYS_6PX d, planted | fail → `momentum` | The truth arrows are solved with puck 2's y-velocity as +: v1 = 2.31, v2 = 4.0. Drawn below the line, the vector sum after (4, 0) is twice the 2 kg·m/s before. |
| `pucks-6px-good` | PHYS_6PX d (2.31: y-sign slip) | pass | Truth arrows from the x and y momentum equations with the final masses (v1 = 1.15, v2 = 2.00); the ghost v1 = 2.31 sits beside them, labelled. |
| `pucks-6px-view-bad` | PHYS_6PX, planted | fail → `in_view` | The view stops at y = -1 and v2's tip sits at y = -1.73: the arrow the question hinges on is clipped (render-validity criterion). |
| `rotation-bad` | Exam 3 rolling ball, planted | fail → `conserved` | v = sqrt(2 g h) (the sliding-block speed) while the spin bar still shows ½Iω²: the bars add up to more than mgH. |
| `rotation-good` | Exam 3 rolling ball (solid sphere, I = 2/5 mR²) | pass | v = sqrt(2 g h / (1 + I/mR²)), ω = v/R: K_trans + K_rot + U = mgH at every point down the ramp. |
| `shm-good` | Exam 4 mass on a spring | pass | x = A cos ωt with ω = sqrt(k/m); F = -kx always points back to x = 0; K + U_s = ½kA². |
| `shm-omega-bad` | Exam 4 SHM, planted | fail → `conserved` | ω = sqrt(m/k) (flipped): the motion is drawn 4x too slow and K + U_s no longer equals ½kA². |
| `shm-sign-bad` | Exam 4 SHM, planted | fail → `spring_restoring` | F = +kx: the arrow points along the stretch. The energy bars still balance (x² hides the sign), so only spring_restoring catches it. |
| `xx3-c-good` | PHYS_XX3 c (48: above-axis only) | pass | Ghost = the upper triangle only (24 squares = 48 J); truth = +24 - 6 = 18 squares = 36 J. |
| `xx3-c-unlabeled-bad` | PHYS_XX3 c, planted | fail → `ghost_label` | The ghost has no label: an unlabelled grey shape reads as part of the problem, not as 'your 48 J'. |
| `xx3-d-good` | PHYS_XX3 d (60: lower triangle flipped) | pass | Ghost = the dip mirrored above the axis (24 + 6 = 30 squares = 60 J). |
| `xx3-d-style-bad` | PHYS_XX3 d, planted | fail → `ghost_style` | The ghost is drawn solid and coloured (c3) like a truth mark: she cannot tell her answer from the right one. |
| `xx3-truth-bad` | PHYS_XX3, planted (sign slip baked into the TRUTH) | fail → `area` | The truth shape draws D at +3 instead of -3: it encloses 60 J while the key says 36 J. A sign slip in the figure itself, the worst kind. |

Notes: `incline-swap-bad` passes the old `pythag` invariant (sin² + cos² is symmetric); only `incline` catches it.
`shm-sign-bad` keeps balanced energy bars (x² hides the sign); only `spring_restoring` catches it. `kwv-e-bad` is self-consistent
area-wise; only `ghost_kind` catches it. Not drawable today (ghost-feasibility.md): 2π, √, ÷60, escape speed → fallback, no case.

## Findings per case (`verdict()`; good = [], bad = its findings)
```
V fail calc-area-bad.json           ["area: A encloses 1.12 ≠ 0.04 at {\"b\":0.5}"]
V pass calc-area-good.json          []
V fail ferris-8vq-bad.json          ["ferris: N_side = 294.56 ≠ √((mg)² + (mv²/r)²) = 275.14 at {\"w\":0.3}"]
V pass ferris-8vq-good.json         []
V fail ferris-bottom-accel-bad.json ["toward: aB does not point at the center (0,0) at {}"]
V fail friction-bad.json            ["nonincreasing: E rises to 30.46 at s = 0.07","conserved: K + U + Eth = 31.418445874850494 ≠ Etot = 30.4 at {\"s\":0.6,\"mu\":0.05}"]
V pass friction-good.json           []
V fail incline-anchor-bad.json      ["in_view: Wv reaches (0, -0.98) outside the view","anchored: Wv starts at (0,0), not on box (2.95,0.52) at {\"th\":10,\"m\":1}"]
V pass incline-good.json            []
V fail incline-gravity-bad.json     ["gravity_down: Wv points (0.09,-0.48) at {\"th\":10,\"m\":1}"]
V fail incline-label-bad.json       ["label_recall: arrow Pperp has no label"]
V fail incline-swap-bad.json        ["incline: par = 9.65 ≠ W sinθ = 1.7 at {\"th\":10,\"m\":1}"]
V pass kwv-a-good.json              []
V pass kwv-b-good.json              []
V fail kwv-d-bad.json               ["area: G encloses 60 ≠ 80 (its label \"your 80 J\") at {}"]
V pass kwv-d-good.json              []
V fail kwv-e-bad.json               ["ghost_kind: ghost on a mechanical slip (ghosts are for kind=concept only)"]
V fail orbit-altitude-bad.json      ["orbit_radius: circle r = 1 ≠ R_planet + h = 2 at {\"h\":1}"]
V fail orbit-ghost-alone-bad.json   ["ghost_alone: ghost gO is on screen before any truth mark"]
V pass orbit-good.json              []
V fail orbit-gravity-bad.json       ["power_law: vo·r^0.5 = 1.94 ≠ 2.21 at {\"h\":1.6}"]
V fail pucks-6px-bad.json           ["in_view: w2 reaches (4.9, -3.46) outside the view","momentum: before (1,0) ≠ after (2,0) at {\"v0\":1}"]
V pass pucks-6px-good.json          []
V fail pucks-6px-view-bad.json      ["in_view: w2 reaches (3.9, -1.73) outside the view"]
V fail rotation-bad.json            ["conserved: Kt + Kr + U = 15.875999999999998 ≠ E = 14.7 at {\"s\":0.6}"]
V pass rotation-good.json           []
V pass shm-good.json                []
V fail shm-omega-bad.json           ["conserved: K + Us = 2.804420789643763 ≠ E = 4 at {\"t\":1.2}"]
V fail shm-sign-bad.json            ["spring_restoring: F = 8 with x = 1 at {\"t\":0}"]
V pass xx3-c-good.json              []
V fail xx3-c-unlabeled-bad.json     ["ghost_label: ghost G has no label"]
V pass xx3-d-good.json              []
V fail xx3-d-style-bad.json         ["ghost_style: ghost G must be dashed + muted/grey"]
V fail xx3-truth-bad.json           ["area: T encloses 60 ≠ 36 at {}"]
```

## Test run (`node --test scene.test.mjs`, Oct 7; full `npm test`: 751 tests, 750 pass, 0 fail, 1 todo)
```
ok 1 - scene projectile: schema
ok 2 - scene projectile: names, binds and ids are sound
ok 3 - scene bfs: schema
ok 4 - scene bfs: names, binds and ids are sound
ok 5 - scene q1-b: schema
ok 6 - scene q1-b: names, binds and ids are sound
ok 7 - scene q1-b: W is 22 at t = 5 and 6, 22.5 at the top of the blue (the numbers VISUAL-GOALS.md promises)
ok 8 - scene: bad shapes fail the schema
ok 9 - scene: bad meaning is caught (valid shape, wrong references)
ok 10 - kits: there are 3, each with 2 examples
ok 11 - kit energy-bars: name matches its folder, one-line description, subjects from the closed list
ok 12 - kit energy-bars / ramp-spring.json: schema, sound, kit components only, invariants hold
ok 13 - kit energy-bars / drop-ball.json: schema, sound, kit components only, invariants hold
ok 14 - kit graph-search: name matches its folder, one-line description, subjects from the closed list
ok 15 - kit graph-search / bfs.json: schema, sound, kit components only, invariants hold
ok 16 - kit graph-search / dfs.json: schema, sound, kit components only, invariants hold
ok 17 - kit mechanics: name matches its folder, one-line description, subjects from the closed list
ok 18 - kit mechanics / incline-forces.json: schema, sound, kit components only, invariants hold
ok 19 - kit mechanics / projectile.json: schema, sound, kit components only, invariants hold
ok 20 - kits: the gate catches a component outside the kit and a broken invariant
ok 21 - bank profile: valid shapes pass, bad ones fail; its kits enum is exactly the kit folders
ok 22 - visual cases: ≥14, a good and a planted-bad for every rule
ok 23 - visual case calc-area-bad.json (fail: area)
ok 24 - visual case calc-area-good.json (pass)
ok 25 - visual case ferris-8vq-bad.json (fail: ferris)
ok 26 - visual case ferris-8vq-good.json (pass)
ok 27 - visual case ferris-bottom-accel-bad.json (fail: toward)
ok 28 - visual case friction-bad.json (fail: nonincreasing)
ok 29 - visual case friction-good.json (pass)
ok 30 - visual case incline-anchor-bad.json (fail: anchored)
ok 31 - visual case incline-good.json (pass)
ok 32 - visual case incline-gravity-bad.json (fail: gravity_down)
ok 33 - visual case incline-label-bad.json (fail: label_recall)
ok 34 - visual case incline-swap-bad.json (fail: incline)
ok 35 - visual case kwv-a-good.json (pass)
ok 36 - visual case kwv-b-good.json (pass)
ok 37 - visual case kwv-d-bad.json (fail: area)
ok 38 - visual case kwv-d-good.json (pass)
ok 39 - visual case kwv-e-bad.json (fail: ghost_kind)
ok 40 - visual case orbit-altitude-bad.json (fail: orbit_radius)
ok 41 - visual case orbit-ghost-alone-bad.json (fail: ghost_alone)
ok 42 - visual case orbit-good.json (pass)
ok 43 - visual case orbit-gravity-bad.json (fail: power_law)
ok 44 - visual case pucks-6px-bad.json (fail: momentum)
ok 45 - visual case pucks-6px-good.json (pass)
ok 46 - visual case pucks-6px-view-bad.json (fail: in_view)
ok 47 - visual case rotation-bad.json (fail: conserved)
ok 48 - visual case rotation-good.json (pass)
ok 49 - visual case shm-good.json (pass)
ok 50 - visual case shm-omega-bad.json (fail: conserved)
ok 51 - visual case shm-sign-bad.json (fail: spring_restoring)
ok 52 - visual case xx3-c-good.json (pass)
ok 53 - visual case xx3-c-unlabeled-bad.json (fail: ghost_label)
ok 54 - visual case xx3-d-good.json (pass)
ok 55 - visual case xx3-d-style-bad.json (fail: ghost_style)
ok 56 - visual case xx3-truth-bad.json (fail: area)
# tests 56
# pass 56
# fail 0
```
