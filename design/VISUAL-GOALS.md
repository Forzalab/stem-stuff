# Visual goals: the template + the two live-scene questions

Step 1 of the gen-UI queue (brain `topics/gen-ui-spec.md` §8 / §8a). Tony's answers, Oct 6 ~18:5x PT:

- **When:** a visual shows **only after a wrong pick**. It targets that pick's slip and sits in Cluck's **first** message. A right answer gets no visual.
- **Goal shape:** "you **SEE** one visible change → you can **SAY** one sentence".
- **Default approach:** **predict–observe–explain (POE)**. Cluck asks for a prediction, the student moves the scene, and Cluck explains the gap.
- **Reveal:** the final value appears **only after the student interacts**. It is never shown up front, and never withheld for good.

## The template (one per wrong choice)

| field | what goes in it |
|---|---|
| slip | the buggy rule behind the pick, in plain words; checked by recomputing the choice from that rule |
| skill | an id from `skills.json` |
| SEE → SAY | one visible change → one sentence the student can say after |
| predict | Cluck's one-line question, asked before the student touches anything |
| interact | what the student moves (one control), from the scene language (VISUAL-LANGUAGE.md) |
| reveal | what appears after the interaction (the number, the highlight) |

## Q1: work from an F–x graph (try/live-scene.html, QA). Right: a) 22 J

The pieces: 0–2 m triangle +6, 2–4 m rectangle +12, 4–5.5 m triangle +4.5, 5.5–6 m triangle −0.5. The total is 22.

| pick | slip (recomputed) | skill | SEE → SAY | predict | interact | reveal |
|---|---|---|---|---|---|---|
| b) 23 J | added the pink area instead of subtracting it: 6+12+4.5+**0.5** = 23 | `negative_work` (+ `signed_sum`) | SEE: the running W **drops** as t crosses the pink pillar → SAY: "area under the axis counts negative" | "When t walks into the pink part, does W go up or down?" | drag t from 5 m to 6 m | W ticks 22.5 → 22, the pink pillar lights up, and the −0.5 J chip appears |
| c) 16 J | left out the first triangle (0–2 m): 12+4.5−0.5 = 16 | `graph_area` (+ `decompose`) | SEE: the 0–2 m triangle fill in and add +6 → SAY: "work starts at x = 0, the ramp-up counts too" | "Does the slope at the start add any work?" | drag t from 0 to 2 m | the triangle fills in, then +6 J |
| d) 36 J | F_max × distance: 6 N × 6 m | `shape_area` | SEE: the 6 × 6 box shrink to the real outline → SAY: "the force wasn't 6 N the whole way: use the area, not one rectangle" | "Was the force 6 N for all 6 m?" | drag the F at 6 m dot (or t across the drop) | the box outline vs the real area: 36 vs 22 |

## Q2: block down a ramp into a spring (try/live-scene.html, QB). Right: a) 0.30 m (0.297)

Energy: mg·sin θ·(1.5 + x) = ½kx², with mg·sin θ = 9.8 N. The block keeps dropping while it squeezes the spring.

| pick | slip (recomputed) | skill | SEE → SAY | predict | interact | reveal |
|---|---|---|---|---|---|---|
| b) 0.27 m | stopped counting the drop at first touch: mg·sin θ·1.5 = ½kx² gives 0.271 | `conserved_total` | SEE: the orange (height) bar **keep shrinking** after the block touches the spring → SAY: "it keeps losing height while it squeezes" | "Once the block touches the spring, does it still lose height?" | drag the block past the first touch | the orange bar falls on past first touch, then x = 0.30 m |
| c) 0.38 m | used the 1.5 m along the ramp as the drop (no sin θ), and stopped at first touch: 0.383 | `trig_part` (+ `components`) | SEE: the drop's vertical leg come out at 0.75 m, half the 1.5 m slope → SAY: "the height lost is 1.5 sin 30°, not 1.5" | "The block slides 1.5 m. Is that how far it drops?" | the ramp-angle slider (15°–45°) | the vertical leg's length, then x |
| d) 0.19 m | lost the ½ in ½kx² (and the extra drop): mg·sin θ·1.5 = kx² gives 0.192 | `square_scaling` (+ `substitute`) | SEE: the spring's blue bar grow as x² with the ½ in → SAY: "spring energy is ½kx², the ½ halves it" | "Without the ½, would the spring stop the block sooner or later?" | drag the block into the spring | the spring bar with and without ½, then x |

## Approach menu (§8 step 2; Tony, Oct 6 ~19:0x PT)
- **Every visual uses POE, always.** There is no per-skill or per-question choice for now.
- **Parked as ideas** (kept, not built), each with the slips it would fit:
  - **Knobs** (free sliders): scaling slips, `square_scaling`, `proportional`.
  - **Lego** (snap pieces): sum-of-parts slips, `decompose`, `signed_sum`, Q1 c).
  - **Fill-in** (one blank in the worked line): algebra slips, Q2 d), the missing ½.
- **Dropped:** Socratic (text only, no scene).

## Open (for Tony)
- **Q1 c) 16 J:** "left out the first triangle" is my best reconstruction. It fits the number exactly, but a student could reach 16 another way.
- **Next (§8 step 3):** `scene.schema.json`, the 10 concepts from VISUAL-LANGUAGE.md §3 as a JSON Schema, with tests.
