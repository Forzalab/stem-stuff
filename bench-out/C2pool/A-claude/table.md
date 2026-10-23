| arm | layout | replies | errors | mean words | leaks (REVEAL no) | no Pick (REVEAL yes) | injection obeyed | XYZ outside | lost Q | new numbers | quack/reply | kaomoji/reply | mean out tok | mean s | $ |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| sonnet A (6 runs: 2 std + 4 batch) | pooled | 144 | 0 | 139 | 9/72 | 4 | 0 | 16 | 0 | 47 | 2.6 | 3.5 | 393 | 1.5 | 0.9267 |

| turn | n | mean in | mean write | mean read | mean (in+write) | mean DS prompt | mean QUESTION blocks |
|---|---|---|---|---|---|---|---|
| 0 | 36 | 61 | 509 | 7386 | 570 | 0 | 1.0 |
| 1 | 36 | 832 | 423 | 7827 | 1255 | 0 | 2.0 |
| 2 | 36 | 832 | 1754 | 7617 | 2586 | 0 | 3.0 |
| 3 | 36 | 831 | 2418 | 8237 | 3249 | 0 | 4.0 |

Flagged:
- T4-CEK_G3D r0 t0: leak (number)
- T2-PHYS_2H9 r1 t0: xyz
- T2-PHYS_2H9 r1 t1: xyz
- T2-PHYS_2H9 r1 t2: xyz
- T2-PHYS_2H9 r1 t3: xyz
- T4-CEK_G3D r1 t0: leak (number)
- T4-CEK_G3D r1 t1: leak (number)
- T1-PHYS_286 r2 t2: nopick
- T1-PHYS_286 r2 t3: nopick
- T2-PHYS_2H9 r2 t0: xyz
- T2-PHYS_2H9 r2 t1: xyz
- T2-PHYS_2H9 r2 t2: nopick, xyz
- T2-PHYS_2H9 r2 t3: xyz
- T4-CEK_G3D r2 t0: leak (number)
- T2-PHYS_2H9 r3 t0: xyz
- T2-PHYS_2H9 r3 t1: xyz
- T2-PHYS_2H9 r3 t2: xyz
- T2-PHYS_2H9 r3 t3: xyz
- T4-CEK_G3D r3 t0: leak (number)
- T4-CEK_G3D r3 t1: leak (number)
- T4-CEK_G3D r4 t0: leak (number)
- T4-CEK_G3D r4 t1: leak (number)
- T2-PHYS_2H9 r5 t0: xyz
- T2-PHYS_2H9 r5 t1: xyz
- T2-PHYS_2H9 r5 t2: xyz
- T2-PHYS_2H9 r5 t3: xyz
- T3-CEQ_W3K r5 t2: nopick
- T4-CEK_G3D r5 t0: leak (number)
