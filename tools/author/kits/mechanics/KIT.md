# Kit: mechanics

Bodies, ramps, springs and force vectors; projectiles. Forces as arrows, components as two arrows.

<!-- kit -->
```json
{
 "name": "mechanics",
 "description": "Bodies, ramps, springs and force vectors; projectiles. Forces as arrows, components as two arrows.",
 "subjects": [
  "physics.mechanics"
 ],
 "components": {
  "marks": [
   "point",
   "seg",
   "arrow",
   "text",
   "tex",
   "fn",
   "path",
   "axes"
  ],
  "syms": [
   "block",
   "cart",
   "ball",
   "incline",
   "spring",
   "pulley",
   "ground",
   "vector"
  ],
  "ops": [],
  "constraints": [
   "free",
   "onX",
   "onY",
   "onPath",
   "radial"
  ]
 },
 "examples": [
  {
   "file": "incline-forces.json",
   "invariants": [
    {
     "type": "pythag",
     "legs": [
      "par",
      "perp"
     ],
     "hyp": "W",
     "over": {
      "th": [
       10,
       60
      ],
      "m": [
       1,
       5
      ]
     }
    }
   ]
  },
  {
   "file": "projectile.json",
   "invariants": [
    {
     "type": "finite",
     "over": {
      "th": [
       10,
       80
      ],
      "v0": [
       5,
       20
      ],
      "t": [
       0,
       3
      ]
     }
    }
   ]
  }
 ]
}
```

Approved: the symbols block, cart, ball, incline, spring, pulley, ground, vector; plain marks for labels, paths and axes. No trace.

Common errors (each one fails a check):
- An arrow drawn the full length of mg along the ramp: the along-ramp arrow must be the `par` derive, `W*sin(r)`.
- Degrees passed to sin/cos: convert once in a derive (`r = th*pi/180`), then use `r` everywhere.
- A vector with a magic length: scale every force by the same factor (here 1/20), so their lengths compare.
- A projectile trace that goes below the ground: clamp `y` with `max(0, …)` or stop the drive at the landing time.

Invariants the gate tests:
- `pythag`: the components' squares sum to the whole (`par² + perp² = W²`) at every sampled param value.
- `finite`: every derive is a finite number across the sweep.
