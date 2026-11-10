# Physics concept: PHYS_KWV pick d (forgot the ½ on the triangle)
code: PHYS_KWV
leak: your 80 J | half box | half its box | 16 squares
KEY: rectangle 16 squares + triangle 8 = 24 squares × 2.50 J = 60.0 J. Pick d = 80.0 (32 squares).

## GOLD (envelope)
```json
{"kind":"concept",
 "lesson":{"contrast_noun":"the half box","exam_move":"a triangle is half its box"},
 "l1":"Tricky one. This graph is built to make the slope look like a full box. Your rectangle is right, but your 80 J counts the triangle as a whole box. Hint or retry?",
 "visual":{"scene":{"v":1,
   "goal":{"pick":"d","slip":"counted the triangle as a full box","see":"the dashed box overshoots the slanted line","say":"a triangle is half its box","approach":"poe"},
   "view":{"x":[-0.5,8.8],"y":[-1,5]},
   "marks":[{"id":"ax","mark":"axes"},
    {"id":"T","mark":"poly","pts":[[0,0],[0,4],[4,4],[8,0]],"fill":true,"color":"c1","truth":true},
    {"id":"G","mark":"poly","ghost":true,"label":"your 80 J","dash":true,"color":"muted","pts":[[0,0],[0,4],[8,4],[8,0]]}]}},
 "hints":["The slanted part is a triangle. A triangle fills half its box.","Count the triangle as half of 4 by 4 squares."],
 "l2":{"text":"Box plus half a box. Each square is worth $2.50\\ \\text{J}$.","tex":"W = (4\\cdot4 + \\dfrac{1}{2}\\cdot4\\cdot4)\\ \\text{squares}"},
 "l3":{"steps":[{"text":"The flat part is a rectangle.","tex":"4\\times4 = 16\\ \\text{squares}"},
   {"text":"The slanted part is half its box.","tex":"\\dfrac{1}{2}(4)(4) = 8\\ \\text{squares}"},
   {"text":"Each square is one step times one newton.","tex":"(2.5\\ \\text{m})(1.0\\ \\text{N}) = 2.50\\ \\text{J}"},
   {"text":"Add the squares and scale.","tex":"W = 24(2.50) = 60.0\\ \\text{J}"}],
  "value":"$60.0\\ \\text{J}$","close":"Twin or next? This one comes back around."},
 "affirm":{"text":"You halved the triangle. That's the move on the exam.","joke":"QUACK. Triangles: the half-price boxes of physics."}}
```
Rubric: FK ≈ 3, 0 FAIL. The line quotes the ghost label; truth has no value label; the value appears only in `l3`.

## BAD (prod gen, Oct 7)
"POOF! You rubbed the lamp wrong, but a wish is a wish. (waddles to the board) Work is just the area under that force-versus-position graph… 1. The push before — only one cart moves …"
Why: a joke on line 1 of a wrong pick; 13 lines before the point; a template leak ("only one cart moves" on a graph with no carts); em-dash; "just"; the boxed answer in turn 1, so the retry is theatre; ends with a pun, not a choice.
