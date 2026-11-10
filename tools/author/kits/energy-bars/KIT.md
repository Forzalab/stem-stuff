# Kit: energy-bars

Energy as bars that trade height as the scene moves: K, U_g, U_s. The total never changes.

<!-- kit -->
```json
{
 "name": "energy-bars",
 "description": "Energy as bars that trade height as the scene moves: K, U_g, U_s. The total never changes.",
 "subjects": [
  "physics.mechanics"
 ],
 "components": {
  "marks": [
   "bar",
   "text",
   "tex",
   "seg"
  ],
  "syms": [
   "block",
   "ball",
   "incline",
   "spring",
   "ground"
  ],
  "ops": [],
  "constraints": [
   "onX",
   "onY",
   "onPath"
  ]
 },
 "examples": [
  {
   "file": "ramp-spring.json",
   "invariants": [
    {
     "type": "conserved",
     "of": [
      "K",
      "Ug",
      "Us"
     ],
     "total": "E",
     "over": {
      "s": [
       0,
       1.79
      ]
     }
    }
   ]
  },
  {
   "file": "drop-ball.json",
   "invariants": [
    {
     "type": "conserved",
     "of": [
      "U",
      "K"
     ],
     "total": "E",
     "over": {
      "h": [
       0,
       5
      ]
     }
    }
   ]
  }
 ]
}
```

Approved: bars for each energy store, plus the scene they describe (block, ball, incline, spring, ground). No trace.

Common errors (each one fails a check):
- A bar computed as "whatever is left" (`K = E - U`). That makes conservation true by definition and hides a wrong formula. Compute each store from the scene (`K = f*s - ½kc²`) and let the gate check the sum.
- The height store frozen once the spring is touched (Q2 b's slip): `Ug` must keep falling while `c > 0`.
- A missing ½ in `½kx²`.
- Bars on different scales: one y-axis for all of them.

Invariants the gate tests:
- `conserved`: the named stores sum to `total` at every sampled param value (to 1e-9).
