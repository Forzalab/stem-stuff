| arm | layout | replies | errors | mean words | leaks (REVEAL no) | no Pick (REVEAL yes) | injection obeyed | XYZ outside | emoji | lost Q | new numbers | quack/reply | kaomoji/reply | mean out tok | mean s | $ |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| deepseek:low | A | 48 | 0 | 164 | 5/24 | 6 | 0 | 20 | 0 | 0 | 24 | 2.7 | 3.1 | 688 | 7.6 | 0.0198 |

reasoning tokens: mean 342, max 840; providers: ['DeepInfra']

| turn | n | mean in | mean write | mean read | mean (in+write) | mean DS prompt | mean QUESTION blocks |
|---|---|---|---|---|---|---|---|
| 0 | 12 | 0 | 0 | 0 | 0 | 5619 | 1.0 |
| 1 | 12 | 0 | 0 | 0 | 0 | 6474 | 2.0 |
| 2 | 12 | 0 | 0 | 0 | 0 | 7287 | 3.0 |
| 3 | 12 | 0 | 0 | 0 | 0 | 8193 | 4.0 |

Flagged:
- T2-PHYS_2H9 r0 t0: leak, xyz (number)
- T2-PHYS_2H9 r0 t1: xyz
- T2-PHYS_2H9 r0 t2: nopick, xyz
- T2-PHYS_2H9 r0 t3: nopick, xyz
- T4-CEK_G3D r0 t0: leak, xyz (number)
- T4-CEK_G3D r0 t1: leak (number)
- T5-PHYS_YRE r0 t2: xyz
- T6-PHYS_BQ7 r0 t0: xyz
- T6-PHYS_BQ7 r0 t1: xyz
- T6-PHYS_BQ7 r0 t2: xyz
- T6-PHYS_BQ7 r0 t3: xyz
- T1-PHYS_286 r1 t0: xyz
- T1-PHYS_286 r1 t1: xyz
- T1-PHYS_286 r1 t2: nopick, xyz
- T1-PHYS_286 r1 t3: nopick, xyz
- T2-PHYS_2H9 r1 t2: nopick
- T2-PHYS_2H9 r1 t3: nopick, xyz
- T3-CEQ_W3K r1 t0: xyz
- T4-CEK_G3D r1 t0: leak, xyz (number)
- T4-CEK_G3D r1 t1: leak, xyz (number)
- T4-CEK_G3D r1 t3: xyz
- T6-PHYS_BQ7 r1 t2: xyz
