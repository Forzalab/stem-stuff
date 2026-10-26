# Formula sheet pictures

Tony, Oct 26: "formula sheet should show visuals too, where relevant, for example vectors. list some more, that will help grasp a hard to digest formula, then implement and test them."

**What ships.** `formula-figs.js` sets `window.FormulaFigs = { <sheet row id>: <graph block> }`. Each value is a plain SCHEMA.md `kind: "scene"` graph block with an `alt`. There is no new format (CLAUDE.md render rule). In the "?" doc popover (`app.js` `docHTML` / `drawDocFig`, design/POPOVER.md variant `doc`), the picture sits right under the formula, drawn by `graph.js`. It has `role="img"` and its `alt` as the label, and stays at most 168px tall: a taller scene is redrawn narrower and centred. A row with no entry looks the same as before. Colours follow DESIGN-LANGUAGE.md: forces c1, velocity c2, guides dashed muted. Only tokens that `app.css` defines are used (`--mark` is not one).

**Where the picture sits.** It goes under the formula header, before the purpose line. Moving it under the purpose, or behind its own chip (POPOVER.md idea 2, variant `media`), is a one-line change in `docHTML`.

**Tests.** `tests/formula-figs.test.mjs` checks four things. Every key must be an id on the sheet (`tests/fixtures/formula-sheet-ids.json`, the 163 ids of brain sheet v3). Every figure must pass Ajv on `#/$defs/graph`, with an alt sentence. Each figure has 6 labels or fewer, finite numbers, no dashed force on a body, force colour c1 and velocity c2/c3, and only colour tokens that are defined. In `tests/easy.pw.mjs`, the "?" docs step checks that KE_ROT has no figure and that I_SUM draws one under the formula: an svg, role img, the alt, KaTeX labels, inside the popover.

## Ranked list (all 163 rows read; Exam 3 groups first)

`id · what the picture shows · why it helps`. **Shipped** = in formula-figs.js now.

### Exam 3 (groups whose `exam` has 3)
1. **TORQUE** (shipped) · rod on a pivot, push F at the end at θ to the rod, the dashed line of action and the lever arm r sinθ meeting it at a right angle · makes "sinθ" visible: only the perpendicular reach turns.
2. **WORK** (shipped) · box sliding by d, F slanted at θ, its dashed F cosθ along the floor · cosθ is "the part of F along the motion".
3. **I_SUM** (shipped) · three point masses round an axis, each with its own r · Σ m r²: every piece counts, the far ones most.
4. **VT** (shipped) · a wheel at ω, the rim point's v_t perpendicular to r, a half-way point at half the speed · v ⊥ r, and v grows with r at the same ω.
5. **ARC** (shipped) · circle slice: two radii r, the angle θ, the arc s · s = rθ is a length along the curve (θ in radians).
6. **HOOKE** (shipped) · wall, spring, block pulled Δx right of x = 0, F_s pointing back left · the minus sign: force against the stretch.
7. **P_DEPTH** (shipped) · open tank, P0 on the surface, a point h down at pressure P · pressure grows with depth, not with the tank's shape.
8. **BUOY** (shipped) · a stone fully under water, B up and mg down (mg > B: it sinks) · B is there even for a sinking thing; V displaced = V object.
9. **BUOY_FLOAT** (shipped) · floating block, its below-waterline part shaded as the fluid displaced · the density ratio is the share under water.
10. **CG_X** (shipped) · a bar with a heavy m1 and a light m2 balancing at x_cg (2·1 + 1·4)/3 = 2 · the weighted average sits near the heavy mass.
11. TAU_IALPHA · a disk with τ and α arcs in the same sense · torque turns α the same way.
12. L_IW / L_CONS · a skater with arms out (big I, small ω) and arms in (small I, big ω) · Iω stays constant.
13. KE_ROT · a rolling wheel: translation + spin arrows · two kinds of KE.
14. PASCAL · hydraulic lift: small piston F1 on A1, big piston F2 on A2 · same pressure, bigger area, bigger force.
15. PRESSURE · a nail tip vs a snowshoe (same F, different A) · P = F/A.
16. SHEAR · block fixed at the bottom, F along the top, sideways Δx over height h · Δx/h is the shape change, not a stretch.
17. YOUNG · rod L0 stretched by ΔL under F on area A · strain = ΔL/L0.
18. BULK · cube squeezed on all sides by ΔP, shrinking by ΔV · the minus sign.
19. EXP_L / EXP_A · rod and plate with a hole, before and after heating · the hole grows too.
20. CG_Y / CG_Z · as CG_X, vertical / depth.
21. WE_THM / E_CONS · energy bars (graph `bars`): KE + PE before and after, W_nc as the gap · the energy bookkeeping.
22. PE_G · height Δy between two levels · only the height change counts, not the path.
23. N2 / N2_XY · FBD on an incline with tilted axes · split forces along x and y.
24. N3 · two blocks pushing on each other, equal and opposite arrows · on different bodies.
25. FK / FS · block on a floor: push, friction against it, n and mg · friction opposes the sliding.
26. HOOKE's partner PE_S · spring compressed by x, the energy as the area under F-x (cartesian) · where the ½ comes from.
27. CONDUCTION · a wall of thickness L, T_h on one side, T_c on the other, area A · heat flows down the temperature step.
28. RADIATION · a hot body and its surroundings T0 · net loss, T⁴ − T0⁴.
29. POWER · F at θ to v · the same cosθ as work.

### Exams 1, 2, 4
30. **V0X / V0Y** (shipped, one figure) · v0 at θ0 split into v0 cosθ0 and v0 sinθ0 with a right angle · the vector-component triangle (Tony's "vectors").
31. V_MAG / V_DIR, F_MAG / F_DIR · the same triangle from the parts back to the size and the angle.
32. POS_VEC / VEL_VEC / ACC_VEC · r as r_x î + r_y ĵ on axes · unit vectors.
33. VK_V / VK_DR · tip-to-tail v0 + a t · vector addition.
34. REL_V · v_A, v_B and v_AB = v_A − v_B tip-to-tail (boat on a river) · vector subtraction.
35. PROJ_* / H_MAX / RANGE / T_FLIGHT · parabola with v0 at θ0, h at the top, R along the ground, v at a few points · v_x constant, v_y flips.
36. AC / FR · a circle with v tangent and a_c to the center · a points in, v along.
37. A_TOT · a_t along the path, a_c in, the total as the hypotenuse · they are perpendicular.
38. F_GRAV · two masses r apart, equal and opposite pulls · 1/r², pair forces.
39. W_AREA / IMPULSE · a shaded area under F-x / F-t (cartesian) · work and impulse as areas.
40. P_CONS_X/Y · a 2D collision before/after with components · conserve each axis apart.
41. SHM_X_T / SHM_V_T / SHM_A_T · x, v, a against t, a quarter period apart (cartesian) · phase.
42. SHM_A_X / SHM_V_X · a spring mass at x, a toward 0, v largest at 0 · the minus sign, energy swap.
43. PEND_PERIOD · pendulum of length L, angle, mg and T · L, not m, sets the period.
44. WAVE_V / WAVE_STRING · a sine wave with λ marked · v = fλ.
45. CONSTRUCTIVE / DESTRUCTIVE · two sources, paths r1 and r2 to a point · path difference in λ.
46. DOPPLER_SIGN · source and observer arrows "toward" · the sign rule.
47. W_GAS / PROC_* / CYCLE_SIGN / ADIABATIC · PV diagram: shaded area, a loop with its direction, isotherm vs adiabat · the work sign by direction.
48. INTENSITY · a source with a sphere of radius r · 4πr².

## Physics notes per shipped figure
- TORQUE: F at 60° on a 3-unit rod, the foot of the perpendicular from the pivot to F's line is (3,0) − 1.5·(cos60°, sin60°) = (2.25, −1.30), length 3 sin60° = 2.60. θ is drawn from the rod's extension to F, the angle the sheet means. Counter-clockwise torque.
- WORK: F 2.4 at 35° from the box's center, F cos35° = 1.97 along d; the dashed drop from F's tip meets it at the component's end.
- VT: the rim point at 40°, v_t at 130° (the CCW tangent, matching ω's CCW arc), right angle marked. The half-radius point's arrow is half as long.
- HOOKE: x = 0 is the relaxed spring's end. The block's face is Δx to the right, and F_s points left. That is the sign in F = −kΔx.
- CG_X: masses 2 and 1 (shown by dot size) at x = 1 and 4, so x_cg = 2, where the pivot is drawn.
- BUOY: drawn as a sinking stone (mg longer than B). The formula holds for any fully submerged object.
- BUOY_FLOAT: 60% under water. For a box, the share of the volume equals the share of the height, so the V labels are honest for this shape only.
