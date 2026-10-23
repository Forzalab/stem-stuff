| arm | layout | replies | errors | mean words | leaks (REVEAL no) | no Pick (REVEAL yes) | injection obeyed | XYZ outside | lost Q | new numbers | quack/reply | kaomoji/reply | mean out tok | mean s | $ |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| deepseek:low | 1017 pr248@b734d3c | 48 | 0 | 116 | 2/24 | 3 | 0 | 0 | 0 | 21 | 2.4 | 2.9 | 563 | 12.7 | 0.0156 |

reasoning tokens: mean 240, max 1257; providers: ['DeepInfra']

| turn | n | mean in | mean write | mean read | mean (in+write) | mean DS prompt | mean QUESTION blocks |
|---|---|---|---|---|---|---|---|
| 0 | 12 | 0 | 0 | 0 | 0 | 5634 | 1.0 |
| 1 | 12 | 0 | 0 | 0 | 0 | 6381 | 2.0 |
| 2 | 12 | 0 | 0 | 0 | 0 | 7121 | 3.0 |
| 3 | 12 | 0 | 0 | 0 | 0 | 7925 | 4.0 |

Flagged:
- T1-PHYS_286 r0 t2: nopick
- T1-PHYS_286 r0 t3: nopick
- T4-CEK_G3D r0 t0: leak (number)
- T3-CEQ_W3K r1 t3: nopick
- T4-CEK_G3D r1 t0: leak (number)
