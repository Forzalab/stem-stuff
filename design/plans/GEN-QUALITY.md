# GEN-QUALITY: the cluck-author skill, measured (agent K, Oct 7 2026)

What was run: `tools/gen-loop.mjs` (OpenRouter, temperature 0.3, thinking per model as serve.py `REASONING`; deepseek had thinking ON until gen #23, see below).
Graders: `author/skills/cluck-author/rubric.mjs` (machine rubric, rubric.md) + the scene gate (`tests/scene.test.mjs` schema, `check`, `lint`, plus a per-situation area invariant). A gen PASSES with 0 rubric FAIL, 0 scene FAIL and the right `kind`.
Models: flash `deepseek/deepseek-v4.1-flash`, `google/gemini-3.8-flash`; smart `anthropic/claude-sonnet-5.5`, `openai/gpt-6.1-sol` (the two newest frontier ids on OpenRouter's /models list, Oct 7).
Spend: **47 model calls** = 29 loop + 9 v5 regen with examples + 9 v5 regen without examples. That is 7 over the 40 cap: the no-examples control was added after the copying showed up (below); all 9 are flash calls of ~1 s.
Raw logs (scratch, not committed): `scratchpad/k/log.jsonl`, `regen.jsonl`, `regen-noex.jsonl`; cases from serve.py `explain_prompt` (`scratchpad/k/dump.py`).

## Verdict
- **Before (iteration 1, plain `scene-gen.md`): 0/8 pass. After (iteration 2, + skill): 8/8. Held-out (iteration 3, + skill, questions NOT in the examples): 6/9** (gpt-6.1-sol 2/2, deepseek flash 2/2 after thinking off, gemini flash 1/2, sonnet 1/2). Held-out plain baseline (iteration 0): 0/4.
- **≥1 flash AND ≥1 smart pass in the last round:** yes. Flash: deepseek-v4.1-flash (held_concept + held_mechanical), gemini-3.8-flash (held_mechanical). Smart: gpt-6.1-sol (both), claude-sonnet-5.5 (held_mechanical).
- **Iteration 2 is contaminated:** its two questions (KWV d, 8G7 a) are the skill's own gold examples; sonnet and deepseek copied the gold `l1` word for word. That is why iteration 3 uses held-out questions (PHYS_XX3 c: kept only the area above the axis; PHYS_6AA a: multiplied W by t) and why the rubric now greps every 7-word run of a gold line as a template leak on any other question.
- **The 9 FLUENCY-SAMPLES re-gens (cluck-genie-v5 + skill, deepseek flash = prod's first model): prod v4 = 0/9 pass (9–14 FAILs each); v5 + skill without examples = 6/9 pass; with examples = 9/9** (but the examples hold golds for these 9 situations, so that column partly measures copying). First reply shrank from 1.1–1.7 k chars to 250–370; first-line jokes 9 → 0; answer in turn 1 9 → 1 (prod: 8/9 caught by `value_before_L3`, cs_bfs's order by eye; v5: cs_bigo, see below); truncation 5 → 0; max sentence 24–39 → 14–21 words.
- **Fixed at the prompt level:** template leak (no worked example in v5 or scene-gen; leak grep), 450-token truncation (L1 is ≤ 370 chars; v5 asks `max_tokens` 300 for L1, 700 for L3), the answer in turn 1 (LEVEL gate; `value_before_L3` FAIL).

## What iterating changed (prompt/skill/rubric edits between rounds)
| After | Seen | Change |
|---|---|---|
| it1 | 8/8 miss the choice ending; 4/8 em-dash; 2/4 concept gens called it `mechanical` (no scene); ghosts sized as the extra piece only (area −40 ≠ label 80) | the skill itself (it2) |
| it2 | 8/8 pass, but verbatim copies of the gold on the same question | held-out questions for it3; 7-word gold-run leak grep; SKILL §4: "ghost = the WHOLE shape her number measures", "label = your + her number as CHOICES print it + unit", "below-axis pieces have negative y", "never reuse example sentences" |
| it3 | deepseek with thinking ON burned 6000 tokens of reasoning, no JSON (plain + skill); "Your 40.0 W" flagged as a unit outside math (rubric false positive); "Your 48.0" vs label "your 48.0" failed on case | `reasoning: {enabled:false}` for deepseek (= prod); rubric v1.1: quoted "your <n> <unit>" exempt (any case, bold ok), label match case-insensitive, stream line 1 = first line, big-O answers compared by body. All gens re-graded with v1.1 (`pass @gen` vs `pass (rubric v1.1)` columns) |

## Every gen (loop)
iter 0 = plain prompt on the held-out pair (baseline for it3). `tok in/out` = OpenRouter usage (out includes reasoning).

| # | iter | prompt | model | case | ms | tok in/out | pass @gen | pass (rubric v1.1) | FK L1 | max words | fails (rule ids) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 0 | plain | `anthropic/claude-sonnet-5.5` | held_concept | 8366 | 1964/1056 | FAIL | FAIL | 2.6 | 18 | ends_choice; unit_outside_math; label_match; step_line; step_line |
| 2 | 0 | plain | `deepseek/deepseek-v4.1-flash` | held_concept | 29676 | 1436/6000 | FAIL | FAIL | - | - | no JSON object (length) |
| 3 | 0 | plain | `anthropic/claude-sonnet-5.5` | held_mechanical | 5602 | 1912/573 | FAIL | FAIL | 4.3 | 18 | ends_choice; unit_outside_math |
| 4 | 0 | plain | `deepseek/deepseek-v4.1-flash` | held_mechanical | 4355 | 1393/1378 | FAIL | FAIL | 4.9 | 16 | em_dash; l1_long; ends_choice; unit_outside_math |
| 5 | 1 | plain | `anthropic/claude-sonnet-5.5` | phys_concept | 11256 | 1959/1223 | FAIL | FAIL | 2.3 | 21 | sentence_max; ends_choice; unit_outside_math; label_match; steps; area |
| 6 | 1 | plain | `deepseek/deepseek-v4.1-flash` | phys_concept | 12230 | 1431/2390 | FAIL | FAIL | 5 | 19 | banned; ends_choice; unit_outside_math; step_line; scene; kind |
| 7 | 1 | plain | `google/gemini-3.8-flash` | phys_concept | 6592 | 1396/702 | FAIL | FAIL | 4.4 | 16 | em_dash; ends_choice; label_match; step_line; step_line; step_line; area |
| 8 | 1 | plain | `openai/gpt-6.1-sol` | phys_concept | 12540 | 1373/637 | FAIL | FAIL | 6.7 | 18 | em_dash; ends_choice; scene; kind |
| 9 | 1 | plain | `anthropic/claude-sonnet-5.5` | phys_mechanical | 7314 | 1887/778 | FAIL | FAIL | 4.1 | 17 | ends_choice |
| 10 | 1 | plain | `deepseek/deepseek-v4.1-flash` | phys_mechanical | 9099 | 1350/2697 | FAIL | FAIL | 8.5 | 21 | fk_l1; fk; sentence_avg; sentence_max; em_dash; ends_choice; step_line; step_line; step_line |
| 11 | 1 | plain | `google/gemini-3.8-flash` | phys_mechanical | 4538 | 1322/482 | FAIL | FAIL | 5.3 | 17 | ends_choice; chip; step_line |
| 12 | 1 | plain | `openai/gpt-6.1-sol` | phys_mechanical | 8555 | 1284/474 | FAIL | FAIL | 4.2 | 16 | fk; em_dash; ends_choice; step_line |
| 13 | 2 | skill | `anthropic/claude-sonnet-5.5` | phys_concept | 4487 | 11065/806 | PASS | PASS | 1.6 | 15 | - |
| 14 | 2 | skill | `deepseek/deepseek-v4.1-flash` | phys_concept | 14292 | 7561/4195 | PASS | PASS | 1.6 | 15 | - |
| 15 | 2 | skill | `google/gemini-3.8-flash` | phys_concept | 5365 | 7733/585 | PASS | PASS | 1.5 | 16 | - |
| 16 | 2 | skill | `openai/gpt-6.1-sol` | phys_concept | 18997 | 7469/929 | PASS | PASS | 3 | 16 | - |
| 17 | 2 | skill | `anthropic/claude-sonnet-5.5` | phys_mechanical | 3790 | 10993/592 | PASS | PASS | 2.3 | 10 | - |
| 18 | 2 | skill | `deepseek/deepseek-v4.1-flash` | phys_mechanical | 29604 | 7480/5575 | PASS | PASS | 1.3 | 10 | - |
| 19 | 2 | skill | `google/gemini-3.8-flash` | phys_mechanical | 4172 | 7659/373 | PASS | PASS | 1.2 | 10 | - |
| 20 | 2 | skill | `openai/gpt-6.1-sol` | phys_mechanical | 9693 | 7380/490 | PASS | PASS | 1.5 | 13 | - |
| 21 | 3 | skill | `anthropic/claude-sonnet-5.5` | held_concept | 13204 | 11233/1816 | FAIL | FAIL | 2.1 | 17 | banned; step_line |
| 22 | 3 | skill | `deepseek/deepseek-v4.1-flash` | held_concept | 30529 | 7683/6000 | FAIL | FAIL | - | - | no JSON object (length) |
| 23 | 3 | skill | `deepseek/deepseek-v4.1-flash` | held_concept | 3673 | 7658/593 | FAIL | PASS | 1 | 10 | - |
| 24 | 3 | skill | `google/gemini-3.8-flash` | held_concept | 9291 | 7863/561 | FAIL | FAIL | 1.8 | 12 | label_match |
| 25 | 3 | skill | `openai/gpt-6.1-sol` | held_concept | 20761 | 7595/1187 | PASS | PASS | 4.3 | 16 | - |
| 26 | 3 | skill | `anthropic/claude-sonnet-5.5` | held_mechanical | 4392 | 11181/516 | FAIL | PASS | 2.3 | 12 | - |
| 27 | 3 | skill | `deepseek/deepseek-v4.1-flash` | held_mechanical | 50939 | 7640/3950 | PASS | PASS | 2.3 | 17 | - |
| 28 | 3 | skill | `google/gemini-3.8-flash` | held_mechanical | 3350 | 7824/331 | FAIL | PASS | 1.2 | 9 | - |
| 29 | 3 | skill | `openai/gpt-6.1-sol` | held_mechanical | 9220 | 7560/406 | PASS | PASS | 2.9 | 11 | - |

## The 9 FLUENCY-SAMPLES situations, side by side (rubric v1.1)
Prod = the Oct 7 live gens in FLUENCY-SAMPLES.md (CLUCK_GENIE v4). v5 = author/prompts/cluck-genie-v5.md + SKILL.md, LEVEL 1, deepseek-v4.1-flash, same explain_prompt user turn. Columns: chars / FK (all prose) / longest sentence / FAILs.

| situation | PROD v4 (Oct 7 live): chars / FK / max words / fails | v5 + skill, NO examples: ms / chars / FK / max words / fails | v5 + skill + examples: pass / fails |
|---|---|---|---|
| phys_mechanical | 1670 / 5.5 / 39 / **11 FAIL**: sentence_max; banned; banned; banned; banned; em_dash; italics; ends_choice; value_before_L3; truncated; too_long | 818 / 320 / 4.8 / 18 / **PASS** | PASS |
| calc_sign | 1606 / 4.5 / 28 / **14 FAIL**: sentence_max; banned; banned; banned; banned; banned; em_dash; l1_joke; ends_choice; value_before_L3; notation; quack_count; truncated; too_long | 1020 / 254 / 2.6 / 15 / **PASS** | PASS |
| cs_bigo | 1112 / 3.5 / 24 / **14 FAIL**: sentence_max; banned; banned; banned; banned; em_dash; not_x_but_y; l1_joke; ends_choice; value_before_L3; value_before_L3; quack_count; joke_in_lesson; too_long | 1644 / 261 / 3 / 17 / FAIL: value_before_L3: the right value $O(n \log n)$ shows before L3 | PASS |
| calc_area | 1486 / 6.6 / 34 / **13 FAIL**: sentence_max; banned; banned; banned; banned; em_dash; l1_joke; ends_choice; value_before_L3; value_before_L3; quack_count; truncated; too_long | 1037 / 362 / 7.2 / 19 / FAIL: fk_l1: FK 8.4 > 7; fk: FK 7.2 > 7 | PASS |
| cs_bfs | 1360 / 4.6 / 30 / **9 FAIL**: sentence_max; banned; banned; banned; em_dash; l1_joke; ends_choice; truncated; too_long | 1723 / 294 / 4.4 / 14 / **PASS** | PASS |
| calc_rates | 1522 / 3.8 / 36 / **11 FAIL**: sentence_max; banned; banned; banned; banned; em_dash; l1_quack; ends_choice; value_before_L3; truncated; too_long | 1636 / 272 / 3.2 / 16 / **PASS** | PASS |
| phys_concept | 1423 / 4.2 / 27 / **14 FAIL**: sentence_max; banned; banned; banned; banned; em_dash; l1_joke; ends_choice; value_before_L3; value_before_L3; joke_in_lesson; too_long; template_leak; template_leak | 1862 / 274 / 4.7 / 19 / **PASS** | PASS |
| phys_vector | 1461 / 7.6 / 39 / **12 FAIL**: fk; sentence_max; banned; banned; banned; banned; em_dash; l1_joke; ends_choice; value_before_L3; value_before_L3; too_long | 1032 / 271 / 3.7 / 21 / FAIL: sentence_max: 21 words > 20 | PASS |
| phys_symbolic | 1231 / 4.5 / 38 / **14 FAIL**: sentence_max; banned; banned; banned; banned; em_dash; not_x_but_y; l1_joke; ends_choice; value_before_L3; value_before_L3; quack_count; too_long; template_leak | 803 / 370 / 3.7 / 15 / **PASS** | PASS |

### phys_symbolic (v5 + skill, no examples, 803 ms)
```
You spotted that gravity pushes down on the child, and that part is right. This question trips people because the seat has to do two jobs at once.
Your **d** counted only the child's weight and dropped the circular-motion term.
The seat must hold the weight and also turn the child, so the relation is $$N - mg = mr\omega^2$$
Want a hint, or would you like to try again?
```
### phys_mechanical (v5 + skill, no examples, 818 ms)
```
You caught that the escape speed depends on the distance from Earth's center, which is the right instinct. This one trips people because the altitude gets added to the radius.
Your **0.250** used the distance ratio without taking its square root.
$$v_{sat}/v_{surf}=\sqrt{R_E/r}$$
Want a hint, or would you rather retry?
```
### calc_sign (v5 + skill, no examples, 1020 ms)
```
This one trips people because the sign test flips so easily. You found the right split points at $-1$ and $1$, which is the hard part.

Your **b** marks where the slope is positive, the uphill stretches.

$$f'(x) = 3(x-1)(x+1)$$

Want a hint, or a retry?
```
### phys_vector (v5 + skill, no examples, 1032 ms)
```
Adding the two parts is the most common slip here, and you nailed both pieces: the weight and the sideways push.
Your **355 N** added the two arrows as if they pointed the same way.
The seat force is the hypotenuse of a right triangle, not a sum.
Want a hint, or a retry?
```
### calc_area (v5 + skill, no examples, 1037 ms)
```
Area between curves trips people because the order of subtraction decides the sign. You found the intersections and set up the integral correctly.

Your **c** flipped the subtraction, so the parabola came off the line and the whole region counted as negative.

$$A = \int_0^3 \big[(4x - x^2) - x\big]\,dx$$

Want a hint on picking the top curve, or try it again?
```
### calc_rates (v5 + skill, no examples, 1636 ms)
```
You caught that the ladder length stays fixed, and that is the heart of this problem. Many people miss that part.
Your **2.67** flipped the ratio, so it used the wall distance over the floor distance.
$$\dot{y}=-\frac{x}{y}\dot{x}$$
Want a hint, or would you rather retry?
```
### cs_bigo (v5 + skill, no examples, 1644 ms)
```
Two loops do not always mean n times n, and plenty of people read it that way. You did spot that the inner loop runs n times, which is right.

Your **b** counted the outer loop as n steps, so it multiplied n by n.

$$n \cdot \log_2 n$$

Want a hint, or a retry?
```
### cs_bfs (v5 + skill, no examples, 1723 ms)
```
You checked the neighbors in order, which is the right habit. This one trips people because a queue and a stack look alike on paper.
Your **c** went deep down one branch before finishing A's other neighbor.
BFS holds a queue, so every neighbor of A gets its turn first.
Want a hint, or a retry?
```
### phys_concept (v5 + skill, no examples, 1862 ms)
```
Counting the rectangle first was the right start, and this graph trips a lot of people.
Your **80.0** counted the triangle as a full box, so it added a whole rectangle where only half belongs.
$$W = \left(16 + \tfrac12(4)(4)\right)(2.50\ \text{J})$$
Want a hint, or a retry?
```

## Human read of the no-examples v5 re-gens (what the rubric misses)
| situation | human 1–5 | note |
|---|---|---|
| phys_concept | 3 | warm and short, but the display line `W = (16 + ½(4)(4))(2.50 J)` is the whole computation minus one product: a near-answer at L1 (rubric gap, rubric.md). `\tfrac12` inside display is fine. |
| phys_mechanical | 4 | right praise, right contrast, root shown as a relation, choice at the end. Two sentences of praise before the point is one too many. |
| phys_symbolic | 4 | the missing term named plainly; chip line is the KEY's relation. Fable C1's "no direction ghost" held. |
| phys_vector | 3 | "as if they pointed the same way" edges toward belief-as-fact; "not a sum" is a not-X tail; one 21-word sentence. |
| calc_area | 3 | correct, but line 1 is a 2-clause textbook sentence (FK 8.4). |
| calc_rates | 4 | "flipped the ratio" in her picture's words; `\dot y` copied from the KEY (course sheet prefers $dy/dt$; KEY wins per SKILL §3). |
| calc_sign | 4 | "uphill stretches" = an image, not a lecture. Uses f′ correctly (prod wrote `\dot f(x)`). |
| cs_bfs | 4 | queue vs stack in one line; no `\text{}` math walls (prod had them). |
| cs_bigo | 2 | `$$n \cdot \log_2 n$$` IS the answer at L1 (rubric v1.1 now FAILs it). |
Prod v4 on the same 9: 2/5 across the board ("bot wearing a duck": POOF opener, 13-line lecture, pun sign-off). Gold A/B: 5.
Pattern to fix next: 9/9 open with a formula ("This one trips people because…", "You caught that…"). Rotate openers per bank, or give the skill 4 opener shapes and an n-gram check across a session.

## Server asks this implies (not done here; serve.py is not K's)
1. Swap `CLUCK_GENIE` for `author/prompts/cluck-genie-v5.md` (keeps the AUDIENCE_LINE so `system_for()` still works).
2. Add `LEVEL` to `explain_prompt` and `max_tokens = 300 if level < 3 else 700` in `explain_stream` (today 450, which truncated 6/9).
3. Thread `LESSON` (contrast noun + exam move from turn 1) into `/chat`.
4. Drop the NOTE when its field ≠ the bank subject (it says `discrete_math` on physics).
5. Pregen at bank time with a smart model (gpt-6.1-sol passed 4/4 with the skill); live = text + chip only (C5): the concept-scene pass rate on flash is 2/4 held-out.

## SHAME CHECK (for what v5 + the skill put on her screen)
1. Wrong pick, her voice: "Okay, my rectangle was right, I just counted the slope part as a whole box. Hint or retry? Retry."
2. Banned items: none in the 9 v5 re-gens by the machine list (prod had POOF, "just", "clearly", em-dashes, puns after wrong picks on 9/9). The red X / line-through are app.css (U's), not text.
3. Techniques: 1 wise feedback (line 1 praises the right part), 2 normalize ("this one trips people"), 4 interpret not grade ("your 80.0 counted the triangle as a full box"), 5 error = a step (no value, retry is real), 7 agency (ends on "hint or retry?"), 8 humor dose (0 jokes after a wrong pick; the joke lives in `affirm`), 11 validating empathy (names what the question does).
4. Reopen tomorrow? More likely: the first reply is 3–4 lines she can read on the bus, and it never tells her she "thought" something.
5. Seconds + taps to the aha: v5 first reply total 0.8–1.9 s (deepseek, no NOTE call in this harness; prod adds the NOTE call ≈1–2 s), 1 tap to open; the stream is ~270 chars so the typewriter (35 chars/s) costs ~8 s until C3's "no typewriter" lands.

## Reproduce
```sh
# cases: serve.py's own user turn for each situation (bank items from STEM_BANKS; the 5 synthetic calc/CS items = FLUENCY-SAMPLES' SYN dict)
STEM_BANKS=<banks dir> python3 -c 'import sys,json,serve; P=serve.problems(); C=[("held_concept","PHYS_XX3","c"),("held_mechanical","PHYS_6AA","a")]
json.dump([{"name":n,"code":c,"pick":a,"correct":P[c].get("correct"),"choices":[{"id":x["id"],"md":x["md"]} for x in serve.shown(P[c]) if not x.get("lock")],
 "key":serve.sugar(P[c])["key"],"slip":(serve.sugar(P[c]).get("slip") or {}).get(a),"prompt":serve.explain_prompt(P[c],a)} for n,c,a in C],open(sys.argv[1],"w"))' cases2.json
node tools/gen-loop.mjs loop --cases cases.json --iter 1 --out log.jsonl                 # plain scene-gen.md, 4 models x 2 cases
node tools/gen-loop.mjs loop --cases cases.json --iter 2 --skill --out log.jsonl         # + SKILL.md + examples
node tools/gen-loop.mjs loop --cases cases2.json --only held_concept,held_mechanical --iter 3 --skill --out log.jsonl
node tools/gen-loop.mjs regen --no-examples --cases cases.json --prod gens.json --out regen-noex.jsonl
node tools/gen-loop.mjs regrade --cases cases.json,cases2.json --log log.jsonl         # re-score with the current rubric, no model calls
```
