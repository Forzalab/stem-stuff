# Physics mechanical: PHYS_8G7 pick a (forgot the square root)
code: PHYS_8G7
leak: The root fell off | root on
KEY: $r = 4R_E$, factor $= \sqrt{R_E/r} = \sqrt{1/4} = 0.500$. Pick a = 0.250 (no root).

## GOLD (envelope)
```json
{"kind":"mechanical",
 "lesson":{"contrast_noun":"the square root","exam_move":"escape speed goes as one over the root of r"},
 "l1":"Your setup is solid: right ratio, radius from the center. One piece fell off at the end. Retry with it on, or a hint?",
 "visual":{"chip":{"tex":"\\dfrac{v}{v_0}=\\sqrt{\\dfrac{R_E}{r}}","missing":"\\sqrt{\\dfrac{R_E}{r}}","line":"The ratio sits under a square root."}},
 "hints":["Escape speed has $r$ inside a square root.","Take the root of your ratio before you pick."],
 "l2":{"text":"Your ratio was right. Now take its root.","tex":"\\dfrac{v}{v_0}=\\sqrt{\\dfrac{R_E}{4R_E}}"},
 "l3":{"steps":[{"text":"Measure from the center of the Earth.","tex":"r = 3R_E + R_E = 4R_E"},
   {"text":"Escape speed has a square root.","tex":"v_{esc}=\\sqrt{\\dfrac{2GM}{r}}"},
   {"text":"Take the root of the ratio.","tex":"\\sqrt{\\dfrac{R_E}{4R_E}} = \\sqrt{0.250} = 0.500"}],
  "value":"$0.500$","close":"Twin or next? This one comes back around."},
 "affirm":{"text":"You kept the square root. That's the step people drop.","joke":"QUACK. Roots: small symbol, big deal."}}
```
No scene: the slip is algebra. No joke after the wrong pick.

## BAD (prod gen, Oct 7)
"When you climb higher above the Earth, gravity pulls on you more weakly, and escape speed drops with distance — but it drops gently, not in a straight line, because the speed depends on the *square root* of the distance."
Why: 43 words in one sentence (FK ≈ 16), em-dash, "not in a straight line" (not-X-but-Y), italics, then 3 steps and a pun cut off at 450 tokens. An orbit figure here would be decoration.
