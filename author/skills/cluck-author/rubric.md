# cluck-author rubric

Run: `node author/skills/cluck-author/rubric.mjs <file.json>` (`{gen, ctx}` or a list). Exit 1 on any FAIL. Ship only with 0 FAIL.
`gen` = the envelope (pregen / scene-gen) or `{text, level}` (a live `/explain` stream). `ctx` = `{code, key, choices, pick, correct, verdict, question}`.
Scenes are graded separately by the scene gate (`tests/scene.test.mjs`: schema, `check`, `lint` ghost rules, visual-case invariants); `tools/gen-loop.mjs` runs both.

## Machine checks (rule id → FAIL when)
| Rule id | FAIL when | Source |
|---|---|---|
| `fk_l1`, `fk` | Flesch-Kincaid grade > **7** on line 1 / on all prose (math removed, bare labels skipped) | FABLE-1 C2 target |
| `sentence_avg`, `sentence_max` | average > 14 words, any sentence > 20 | C2, C7 rule 6 |
| `banned` | any banned word/phrase (SKILL §2), incl. "just" (not "Just tell me"), POOF, "a wish is a wish", "you thought", "easy" | §1 banned, humor (g), C2 tells |
| `em_dash`, `not_x_but_y`, `hypophora`, `italics`, `heading` | the shape appears (em-dash or `--`; "not … but", "isn't just", "doesn't X; it Y"; "Why …? Because"; `*x*`; `#`) | C2 tells, FORMAT 3/4 |
| `l1_long`, `l1_math`, `l1_quack`, `l1_joke`, `l1_sentences` | line 1 > 200 chars, has `$$`, QUACK, a pun/slang/(action), or > 4 sentences | §1 #8, C7 rule 1 |
| `ends_choice` | a wrong-pick reply (L1/L2) does not end on a question with "or" | humor (i), C7 rule 10 |
| `value_before_L3` | the right choice's value (number, formula, or big-O body) or `\boxed` appears before L3; a truth mark carries the value label | C7 rule 2, C6 |
| `number_invented` | a number outside KEY ∪ CHOICES ∪ question ∪ {0,1,2}; sums/differences/ratios of those = warn `number_derived` | C4 check 1 |
| `unit_outside_math` | `<digit> J|N|m/s|ft/s|kg|rad/s|W|kWh|m` outside `$…$` (a quoted ghost label "your 80 J" is exempt) | C4 check 2, FORMAT 6 |
| `notation` | `\dot f(x)` for d/dx, `w` for ω; `\tfrac` inline = warn | C4 check 3 |
| `kind`, `lesson`, `chip`, `ghost_kind` | kind not concept/mechanical; no contrast noun/exam move; mechanical without a chip; `chip.missing` not inside `chip.tex`; a ghost on a mechanical slip | D32, C1 |
| `label_match` | a ghost label is not quoted (case-insensitive) in l1/l2 | C4 check 4, C7 rule 4 |
| `colour_words` | a colour word in the line names no mark token in the scene (c1 blue, c2 orange, c3 pink, muted grey, mark yellow) | C4 check 4 |
| `steps`, `step_line`, `l3_value`, `hints` | > 4 L3 steps; a step line > 12 words or without its equation; no `l3.value`; no hints | C2, C7 rule 8 |
| `quack_wrong`, `quack_count`, `joke_in_lesson`, `praise_trait` | QUACK in a wrong-pick block (envelope) or > 1 (stream); a pun inside the lesson; "smart/genius/natural" in the affirm | humor (c)(e)(g), D68 |
| `truncated`, `too_long` | a stream ends mid-sentence; an L1 stream > 700 chars | C5 (450-token cut) |
| `template_leak` | a prompt string ("only one cart moves", "The push before"), an example's `leak:` phrase, or any 7-word run of a gold `l1`, on a question other than the example's | C5 leak |

## Human score (1 per gen, logged in GEN-QUALITY.md)
"Sounds like a warm human tutor, not a bot": 1 = bot wearing a duck, 3 = correct but formulaic, 5 = the gold A/B lines.

## SHAME CHECK items (per reply, in writing)
1. What does the wrong pick FEEL like, in her voice? 2. Banned item present? (the machine list above + red/X/"Wrong!"). 3. Technique numbers used (1 wise feedback, 2 normalize, 4 interpret not grade, 5 retry, 7 agency/choice, 8 humor dose, 11 validating empathy). 4. Would she reopen tomorrow? 5. Seconds + taps to the aha.

## Known gaps of the checker (human review covers these)
- It cannot tell a near-answer from the answer: an L1 chip that writes the whole computation minus the last product (KWV `W = (16 + ½(4)(4))(2.50 J)`) passes.
- Formula repetition across replies ("This one trips people because…" on 9/9) is not measured; rotate openers by hand or add a per-bank n-gram check.
- FK on 1–3 short lines is noisy; sentence length is the stronger signal.
- "Belief as fact" is only caught for "you thought"; "as if they pointed the same way" passes.
