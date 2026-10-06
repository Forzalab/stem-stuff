<!-- design/VISUALS.md — research (one Explore agent, Oct 5 ~20:50 PT) for live + LLM-made visuals and the algebra-skill map.
     Canonical skill ids live in skills.json (SCHEMA.md "Skills"). The table in B1 uses draft ids; the mapping to skills.json:
     sign_as_direction→sign_direction · signed_area→negative_work (+ graph_area) · vector_components→components · vector_add→vector_add ·
     direct_proportion→proportional · inverse_proportion→inverse_proportional · square_scaling→square_scaling · ratio_reasoning→ratio_setup ·
     solve_for_variable→rearrange · substitute_late→substitute · composite_area→decompose (+ shape_area) · read_slope→slope ·
     area_as_product→graph_area · axis_units→read_graph · unit_conversion→units_convert · sci_notation→sci_notation ·
     dimensional_check→units_check · right_triangle_trig→trig_part · sqrt_and_powers→square_root.
     Not yet in skills.json (add when a tagged question needs them): choose_axes, inverse_square, symbol_meaning, reversal_error,
     symbolic_form, graph_to_motion, estimation_check, angle_geometry, circle_relations.
     Next step (brain topics/cluck-visual-plan.md): template registry + bank-time {template, params} tagging with a Python recompute check. -->

# Dynamic visuals and algebra skill map: design research

> Status: research notes, October 2026. Anything marked **[unverified]** comes from memory or my own inference and has not been checked against a source. Check those before citing them anywhere outside this doc.

---

## Part A: How "dynamic visuals" systems work, and what this site should do

### A1. How existing systems work

| System | How visuals are made | Sandboxing / validation | Notes |
|---|---|---|---|
| **Claude inline visualizations** (beta, launched Mar 12 2026) | The model writes **HTML/SVG** inline. Visuals are temporary: they change or disappear as the conversation moves on. Artifacts are the separate, persistent kind ([Anthropic blog](https://claude.com/blog/claude-builds-visuals), [The New Stack](https://thenewstack.io/anthropics-claude-interactive-visualizations/)) | Anthropic has **not published** how it renders or sandboxes these. A sandboxed iframe with a strict CSP is the likely setup **[unverified]** | Fully generated code. Flexible, but quality varies from one response to the next |
| **ChatGPT interactive math/science visuals** (Mar 2026) | **Pre-built modules** for about 70 fixed topics, including Hooke's law, kinetic energy, Coulomb's law, Ohm's law and Charles' law. The model explains, then shows the module with sliders ([OpenAI](https://openai.com/index/new-ways-to-learn-math-and-science-in-chatgpt), [TechCrunch](https://www.techcrunch.com/2026/03/10/chatgpt-can-now-create-interactive-visuals-to-help-you-understand-math-and-science-concepts)) | Code is hand-written, so the main risk is the model choosing the wrong module or wrong parameters. My guess is the model picks the module and fills parameters through a tool call **[unverified]** | Closest to option (a) below. Shows a large lab chose reliability over open-ended generation for learning content |
| **Gemini dynamic view / generative UI** | Gemini 3 Pro writes full **HTML/CSS/JS** using long system instructions (goals, planning, examples, tool manuals, "common error" tips), then **post-processors** fix known failures. It "can take a minute or more" and has "occasional inaccuracies" ([Google Research](https://research.google/blog/generative-ui-a-rich-custom-visual-interactive-user-experience-for-any-prompt/)) | Human raters preferred it to plain LLM text but ranked it below human-expert designs (PAGEN evaluation) | Option (c). Latency and accuracy rule it out for a live drill |
| **Vercel AI SDK generative UI** | The LLM **calls a tool** with typed arguments, and the app renders a **pre-built React component** for that tool. The model never writes UI code ([Vercel](https://vercel.com/blog/ai-sdk-3-generative-ui)). The RSC/`streamUI` API is paused; current guidance is tool-call parts rendered on the client | Validation is the tool's argument schema | This is the template-plus-parameters pattern, option (a) |
| **TheoremExplainAgent** (ACL 2025) | The agent plans a scene, writes Manim Python, renders a video, and retries on errors. o3-mini reached 93.8% success. Most videos still had "minor layout issues" ([arXiv 2502.19400](https://arxiv.org/abs/2502.19400)) | Validation is execution: a render error triggers a retry | Shows that you need a render check plus a layout check. Not interactive |
| **LivePhys** (2026) | Problem text plus diagram goes to an **intermediate structured representation** (entities, parameters, constraints), and a **deterministic physics engine** runs it. Beat general multimodal LLMs on executability and spatial accuracy, and lowered perceived cognitive load compared with a static textbook ([arXiv 2607.20990](https://arxiv.org/abs/2607.20990)) | Validation is the schema plus the engine | Strong evidence for option (b) |
| **SimuScene / InteractScience** (2025–26) | Raw code for physics scenes: **best model passed only 21.5%** ([arXiv 2602.10840](https://arxiv.org/abs/2602.10840)). InteractScience tested 30 models and found "ongoing weaknesses" when science and interactive front-end code have to work together ([arXiv 2510.09724](https://arxiv.org/abs/2510.09724)) | Unit tests plus snapshot checks plus a VLM judge | Evidence against raw code for physics correctness |

**Takeaway:** the systems that need correct physics (ChatGPT, LivePhys) avoid free-form code. Free-form code (Claude, Gemini) is used for general explanation, where small errors are acceptable.

### A2. Options for this site

The site already has the graph.js marks (scene, cartesian, bars), zero-retention models on OpenRouter, and Vercel Python.

| | (a) Template + JSON params | (b) Scene DSL rendered by graph.js | (c) Raw SVG/HTML/JS in a sandboxed iframe | (d) Hybrid: a → b → c behind a flag |
|---|---|---|---|---|
| **What the LLM writes** | `{template:"fx_work", params:{...}}`, checked by a strict JSON Schema (enum of template ids) | A list of marks (`scene`/`cartesian`/`bars`), bindings to sliders, and `chunks[]` labels | A whole document | Whichever tier works |
| **Latency** | Lowest. Short output; the flash models should answer in roughly 1–2 s **[unverified estimate]** | Medium. Several hundred tokens, about 2–5 s **[est.]** | High. Thousands of tokens, 10–60 s (Gemini reports a minute or more) | Pregenerated at bank time, so about 0 s live |
| **Cost per item** | Very low | Low | 5–20 times (a) **[est.]** | Paid once per bank item, then cached |
| **Failure modes** | No template fits; parameters plausible but wrong (sign, units); grading data out of sync with the figure | Overlapping layout; slider bindings that make no physical sense; a mark the renderer doesn't support | Wrong physics (21.5% pass rate), broken interaction, layout problems, slow loads | Complexity: three tiers to maintain |
| **Injection / XSS** | Nearly none. Values are data, labels go in as `textContent` | Low. Only if the renderer turns strings into DOM; use a fixed allowlist of mark types and escape all text | **High.** Needs `<iframe sandbox="allow-scripts">` without `allow-same-origin`, `srcdoc`, a CSP meta tag `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'`, no network, and `postMessage` for any results ([MDN iframe sandbox](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/iframe#sandbox), [MDN CSP](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)). Prompt injection from problem text can still produce misleading visuals | Same risk as (c), but only behind the flag |
| **How to validate** | Schema check, then **recompute the answer from the params in Python** and compare with the item's key; also check units and signs | Schema check, physics invariants (energy totals, signed area equals the claimed W), headless render with no overlapping boxes, all text inside the viewBox | Headless browser run, scripted slider drags, VLM-judge screenshot, human review | All of these, run offline at bank time |
| **Fit for shaky-algebra learners** | Best. Same visual vocabulary every time, which lowers extraneous load | Good, if the DSL enforces the house style | Poor. Every item looks different | Best |

### A3. Recommendation: (d), with (a) doing most of the work

1. **Freeze a template registry.** Give each existing mock (`fx_work`, `ramp_spring`) a JSON Schema, a Python `solve(params)`, and a list of `chunks[]` entries shaped `{shape, formula, sign}` for the "[shape] – [formula]" Lego labels. Also list slider `snaps` (Start/Touch/End) and the `t_mark`.
2. **Tag at bank time.** For each item, the flash model returns `{template, params}` with a constrained JSON response format. A Python validator recomputes the answer, and if it doesn't match the stored key the item is rejected and retried, at most twice. The cheapest model that passes is enough; use Claude only for retries that still fail.
3. **Add a headless render check.** Use Playwright (or similar) to load graph.js with the params and assert: no NaN, every element inside the viewBox, label bounding boxes don't overlap, each snap position renders. Save a PNG so humans can spot-check.
4. **Cache.** Store the validated spec in the item JSON. The live site only reads it, so there are no LLM calls while a student is answering.
5. **Add the DSL fallback (b).** Use it only when no template fits. Restrict it to the existing mark types and run the same validators. Promote DSL specs that keep recurring into new templates.
6. **Keep (c) as an authoring experiment only.** Put it behind a flag, use it for idea sketches, and never show it to students without review. Use the sandbox and CSP settings listed above.
7. **Respect the reveal rule.** The spec holds the numbers, but the renderer hides number labels until the student has answered. The live figure appears in both the question and the explanation.

### A4. Learning-science rules for the visuals

1. **Segmenting.** Build up one chunk at a time, for example one area piece per step (Mayer & Moreno 2003, "Nine ways to reduce cognitive load," [doi:10.1207/S15326985EP3801_6](https://doi.org/10.1207/S15326985EP3801_6)) **[DOI from memory]**.
2. **Signaling.** Highlight the chunk that matches the formula term the student is reading, using the same color in the figure and in the formula (same source).
3. **Coherence.** Remove decoration: no extra grid lines, gradients or mascots (same source).
4. **Spatial contiguity.** Put each label on its shape, not in a legend. This supports the "[shape] – [formula]" chips (same source).
5. **Expertise reversal.** Detailed guidance helps novices and can slow down experts, so fade the labels once the weak-skill tally is clean (Kalyuga et al. 2003, [doi:10.1207/S15326985EP3801_4](https://doi.org/10.1207/S15326985EP3801_4)) **[DOI from memory]**.
6. **Predict before you show.** Ask for a prediction before the student drags. In one study, demonstrations without a prediction step produced little learning (Crouch et al. 2004, AJP, [doi:10.1119/1.1707018](https://doi.org/10.1119/1.1707018)) **[DOI from memory]**. This fits "numbers after the answer."
7. **Implicit scaffolding.** Guide through what controls allow and what they block: limited sliders, snap points, and instant feedback, rather than written instructions ([Podolefsky, Moore & Perkins, PhET](https://arxiv.org/abs/1306.6544)).
8. **Few controls.** One or two draggable parameters per figure. Too many controls invite random fiddling **[PhET interview finding, summarized from memory; unverified]**.

---

## Part B: Algebra skills and the problem-to-visual map

### B1. Skill catalog (28 skills, 6 families)

Research sources used below:
- Torigoe & Gladding 2011 ([UIUC PER](https://per.physics.illinois.edu/research/papers-presentations/45134)): students handle numbers much better than symbols. The gap was up to 50% between numeric and symbolic versions of a question, and largest for the weakest students. Most errors came from misreading what symbols mean, not from manipulation mistakes.
- Sherin 2001, symbolic forms ([doi:10.1207/S1532690XCI1904_3](https://doi.org/10.1207/S1532690XCI1904_3)) **[DOI from memory]**.
- Redish, "math in physics" ([arXiv physics/0608268](https://arxiv.org/abs/physics/0608268)) **[id from memory]**.
- Arons, *Teaching Introductory Physics* (1997), on ratios **[book]**.
- Nguyen & Meltzer 2003 on vectors ([doi:10.1119/1.1571831](https://doi.org/10.1119/1.1571831)) **[DOI from memory]**.
- McDermott, Rosenquist & van Zee 1987 on graphs ([doi:10.1119/1.15104](https://doi.org/10.1119/1.15104)) **[DOI from memory]**.
- Cohen & Kanim 2005, reversal error ([doi:10.1119/1.2063048](https://doi.org/10.1119/1.2063048)) **[DOI from memory]**.

| Family | id | Plain idea | Common slip (source) | Visual move (no calculus) |
|---|---|---|---|---|
| **1. Signs and direction** | `sign_as_direction` | A minus sign means "points the other way" | Treats the minus as a mistake and drops it (Redish) | An arrow flips when the value crosses 0 |
| | `signed_area` | Area below the axis counts as negative | Adds up all area as positive | A backward-pointing force while the cart moves forward: the speed meter drops and energy coins leave |
| | `vector_components` | Split a slanted arrow into sideways and up/down parts | Uses sin where cos belongs; adds magnitudes (Nguyen & Meltzer) | Drag the angle and watch the two shadow arrows grow and shrink |
| | `vector_add` | Add arrows tip to tail | Adds lengths, 3+4=7 (Nguyen & Meltzer) | Snap the arrows tip to tail; the resultant appears |
| | `choose_axes` | Pick a "+" direction once and keep it | Switches the sign convention halfway through | A fixed "+ →" badge; anything pointing against it turns red |
| **2. Ratio and proportion** | `direct_proportion` | Double one, the other doubles | Adds instead of multiplies (Arons) | Linked bars: drag one and the other scales |
| | `inverse_proportion` | Double one, the other halves | Thinks "bigger in, bigger out" | A see-saw style bar pair |
| | `square_scaling` | Squared: double it and you get 4 times | Answers "2×" (Arons) | A square tile grid: a 2×2 block becomes 4 tiles |
| | `inverse_square` | Twice as far gives 1/4 | Answers "1/2" | The same light spread over a sphere patch 4 times bigger |
| | `ratio_reasoning` | Compare without full numbers, e.g. new/old | Recomputes everything from scratch, or gets lost | A "×?" chip between the before and after states |
| **3. Symbols and equations** | `symbol_meaning` | Every letter is a measurable quantity with units | Treats letters as labels, not amounts (Torigoe & Gladding) | Hover a symbol to highlight the matching part of the figure |
| | `solve_for_variable` | Isolate one letter with balanced moves | Moves terms across without inverting them | A balance-scale animation |
| | `reversal_error` | "6 students per professor" is S = 6P, not 6S = P | Writes the reversed equation (Cohen & Kanim) | Count the icons in a group picture |
| | `substitute_late` | Plug numbers in at the end | Plugs numbers in early and loses track | Keep the symbolic chip until the final step |
| | `symbolic_form` | Patterns like "parts make a whole" or "base + change" | Can't read the structure of an equation (Sherin) | Lego chunks: [rectangle] – F·d, [triangle] – ½kx² |
| **4. Graphs** | `read_slope` | Slope = how steep = rate | Confuses slope with height (McDermott et al.) | A drag-tangent ruler on straight segments only |
| | `area_as_product` | Area = height × width | Thinks area means "the y-value" | Fill the area with unit tiles |
| | `composite_area` | Split into rectangles and triangles | Double counts the overlap, or forgets the ½ | Color each chunk; the chips add up |
| | `axis_units` | Read the axis labels and units | Reads the wrong axis | Pulse the axis label when it's needed |
| | `graph_to_motion` | Graph shape ↔ what is actually happening | Treats the graph as a picture of the path (McDermott et al.) | A moving t-mark synced to the scene |
| **5. Quantities and units** | `unit_conversion` | cm→m, g→kg, °C→K | Forgets to convert, or multiplies the wrong way | Show the conversion factor as a fraction chip that cancels |
| | `sci_notation` | Powers of ten | Calculator entry errors | Show the orders-of-magnitude scale |
| | `estimation_check` | Does the answer make sense? | Accepts a 10⁶ m/s car | A "reasonable range" band on the meter |
| | `dimensional_check` | Units on both sides must match | Adds J to N | Unit chips must match before they snap together |
| **6. Geometry and trig** | `right_triangle_trig` | SOH-CAH-TOA on a picture | Uses the wrong side for the angle | The triangle side under the angle lights up |
| | `angle_geometry` | Incline angle = angle between weight and the normal direction | Uses 90°−θ | Rotate the incline and watch the matching angle arc |
| | `circle_relations` | Circumference, arc, period | Mixes up radius and diameter | Drag a dot around the circle |
| | `sqrt_and_powers` | Undo a square with a root | Takes the root of each term separately | Tiles: area ↔ side length |

The ids are domain-neutral, so calculus and stats can reuse them (`signed_area` becomes integrals; `ratio_reasoning` becomes effect sizes).

### B2. Problem types mapped to visuals

| Problem | Template | Draggable params | What the student watches change | Skills | "Aha" |
|---|---|---|---|---|---|
| F–x work | `fx_work` (built) | Breakpoints; t-mark | Signed area chunks, speed meter, coins | signed_area, composite_area, symbolic_form | Area below the axis takes energy away |
| Incline + spring | `ramp_spring` (built) | Height, k, snaps Start/Touch/End | Energy bars (U_g, K, U_s) | ratio_reasoning, square_scaling, choose_axes | The total stays the same, it just changes form |
| 2D collision | `momentum_arrows` (new) | Mass, angle, speed | Arrows added tip to tail before and after | vector_components, vector_add | Momentum adds as arrows, not as plain numbers |
| Banked curve | `fbd` (new) | Bank angle, speed | Components of the normal force; the net force points to the center | right_triangle_trig, angle_geometry | No "centripetal force" arrow: the net force does that job |
| Orbit / gravitation | `inverse_sq_field` | Distance r, mass | Force bar, orbit speed | inverse_square, sqrt_and_powers | Twice as far gives a quarter of the pull |
| Torque / beam | `beam` | Load position, pivot | Torque bars on each side, the beam tips | direct_proportion, sign_as_direction | A smaller weight farther out can balance a bigger one |
| Buoyancy | `tank` | Object density, volume | Displaced-water bar compared with weight | ratio_reasoning, unit_conversion | It floats when it displaces its own weight |
| PV cycle | `cartesian` + bars | Corner points | Enclosed signed area = net work; ΔU = 0 bar | signed_area, composite_area | Clockwise loop = net work out |
| Heating curve | `cartesian` + bars | Heat added | Flat plateaus while Q keeps going in | read_slope, graph_to_motion | Heat goes in but the temperature stays flat during melting |
| SHM x–t | `spring_xt` | Amplitude, k, m; t-mark | Synced block, x–t graph, energy bars | graph_to_motion, sqrt_and_powers, inverse_proportion | Fastest at x = 0; a bigger amplitude doesn't change the period |
| Doppler | `wavefronts` | Source speed | Wavefronts bunch up ahead of the source | ratio_reasoning, symbolic_form | The source doesn't change frequency; the spacing does |
| Calc: Riemann sum | `fx_work` reused | Number of strips | Rectangle chunks approach the area | composite_area, signed_area | An integral is the chunk adding taken to the limit |
| Graph theory: shortest path | `network` (DSL) | Edge weights | Path highlight changes | estimation_check | The greedy pick isn't always shortest |
| Psych/stats: z-score / normal | `cartesian` (bell) | Mean, SD, cutoff | Shaded tail area | area_as_product, ratio_reasoning | Same score, different SD, different rarity |

**When no visual is right:**
- Pure unit conversion or scientific-notation drills, where a meter chip is enough.
- Recall or definition items.
- Problems whose main difficulty is a symbolic rearrangement. Use the balance-scale step strip instead of a scene.
- Anything the figure would give away before the student answers, such as reading a value directly off it. For those, hide the figure until after the answer.

### B3. Mapping wrong picks to skills for the weak-skill tally

1. **Tag each distractor** at bank time with `{skill, slip}`. For example, a choice of +½kx² where the answer is −½kx² gets `signed_area`, and 2× where 4× is right gets `square_scaling`. The LLM proposes tags and Python confirms them by re-running `solve()` with that one bug injected (a "buggy-rule" check). Accept a tag only if the buggy solve reproduces the distractor exactly **[design proposal]**.
2. **Free-response numeric answers:** try a library of buggy rules (sign flip, missing ½, ×10ⁿ unit error, sin↔cos, reversed ratio, missing square) and tag whichever one matches within tolerance. If none matches, mark it `unclassified`.
3. **Tally:** keep a per-student count `{skill: [attempts, slips]}` with exponential decay (e.g. weight 0.8 per old event) so the tally tracks recent performance. Count a skill as weak once it has at least 2 decayed slips and a slip rate above 40% **[arbitrary thresholds; tune them]**.
4. **What a weak skill triggers:** turn the Lego chips and signaling back on (expertise reversal: the student needs that support for now), and pick the next item to target the skill. Fade the support after 3 clean attempts in a row.
5. **Credit:** for a correct answer, credit every skill the item tags. For a wrong pick, blame only the skill the distractor is tagged with. Don't penalize the others, so the tally points at the real cause rather than spreading noise.
