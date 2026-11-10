# Short gold/bad pairs for the other domains
leak: PHYS_8VQ=your 355 N | PHYS_8VQ=lays them end to end | SYN_RATES=came out upside down | SYN_BFS=your order is a real search

## Physics symbolic: PHYS_8U2 pick d ($mg$; dropped the turn term)
GOLD l1: "This one trips most people at the bottom of the wheel. Your $mg$ is right, and the seat does one more job. Hint or retry?"
GOLD visual: chip `{"tex":"N - mg = mr\\omega^2","missing":"mr\\omega^2","line":"The seat also turns the child toward the hub."}`. Optional truth-only still: seat at the bottom, hub above, one solid arrow up. NO ghost.
BAD: a dashed arrow "your sign" pointing away from the hub. A missing term is not a belief about direction; she would say "I never thought that."

## Physics vector: PHYS_8VQ pick b (added the parts: 355 N)
GOLD l1: "This one is built to bait adding. Your two parts are right, but your 355 N lays them end to end. Hint or retry?"
GOLD visual: mechanics arrows `up` (c1, "$274\ \text{N}$"), `side` (c1, "$80.6\ \text{N}$"), solid sum `truth:true` with no value; dashed seg `ghost:true` "your 355 N" of length 3.55 (1 unit = 100 N).
BAD: "It's corner-to-corner, not end-to-end, not like two scoops of feed." Two not-X-but-Y in one line, a farm pun inside the lesson.

## Calc area between curves: SYN_AREA pick c ($-\tfrac{9}{2}$; subtracted in the wrong order)
GOLD l1: "Your setup and limits are right. The minus sign says the curves swapped places. Want a hint or a retry?"
GOLD visual: scene with `fn` $y=4x-x^2$ (label "top") and `fn` $y=x$ (label "bottom"), `shade` between them on $[0,3]$, truth, no ghost. Chip `\int_0^3 (\text{top}-\text{bottom})\,dx` with missing `\text{top}-\text{bottom}`.
BAD: "Area can't be negative, so that's not a real area." A not-X line and no picture of which curve is on top.

## Calc related rates: SYN_RATES pick c (2.67: ratio flipped)
GOLD l1: "Good start: you used the right triangle and differentiated in time. The ratio came out upside down. Hint or retry?"
GOLD visual: chip `{"tex":"\\dfrac{dy}{dt}=-\\dfrac{x}{y}\\dfrac{dx}{dt}","missing":"\\dfrac{x}{y}","line":"Check which side goes on top."}`.
BAD: "Think of $x$ and $y$ as a snapshot we differentiate around … $2$ ft/s." Jargon, and the unit sits outside the math.

## Calc sign: SYN_SIGN pick b (picked where $f'>0$)
GOLD l1: "Your derivative is right, and so are the cut points. Your pick is where $f'$ is positive. Hint or retry?"
GOLD visual: `fn` $f'(x)=3x^2-3$; truth `shade` under the axis on $(-1,1)$; ghost hatch "your (−∞,−1)∪(1,∞)" on the outer parts.
BAD: `\dot f(x)` for a derivative in x. Wrong notation for the course; the sheet writes $f'(x)$.

## CS BFS: SYN_BFS pick c (A, B, D, F, C, E = DFS)
GOLD l1: "Your order is a real search, and it's depth-first. BFS finishes A's neighbors before going deeper. Hint or retry?"
GOLD visual: `graph-search` trace, queue state per step. Optional ghost path "your order", dashed.
BAD: "BFS doesn't dive; it spreads, like a line at the coffee shop, not a stack of plates." Two not-X shapes, a simile chain.

## CS big-O: SYN_BIGO pick b ($O(n^2)$)
GOLD l1: "Two nested loops usually mean $n^2$, so this one is a good trap. Look at how $i$ grows. Hint or retry?"
GOLD visual: none. Hint: "i goes 1, 2, 4, 8. How many doublings reach n?"
BAD: "The outer loop doesn't walk; it doubles … log-a-rithmic." Not-X-but-Y and a pun on a wrong pick.
