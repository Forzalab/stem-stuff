# C2 pooled: PR #241 layout (B) vs main (A), Sonnet 5.5, 6 runs (2 standard + 4 Anthropic Batch)

Tool: tools/bench_v4.py chat (--batch for C2v2; one batch per turn). Same 6 threads as C2. N=144 replies per layout. Scored with the prod-faithful scorer, no emoji metric.
C2v2 napkin: ~$0.90 (worst $1.9). Real: $0.9147 (A $0.5163, B $0.3984).

| arm | layout | replies | errors | mean words | leaks (REVEAL no) | no Pick (REVEAL yes) | injection obeyed | XYZ outside | lost Q | new numbers | quack/reply | kaomoji/reply | mean out tok | mean s | $ |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| sonnet A (6 runs: 2 std + 4 batch) | pooled | 144 | 0 | 139 | 9/72 | 4 | 0 | 16 | 0 | 47 | 2.6 | 3.5 | 393 | 1.5 | 0.9267 |
| sonnet B (6 runs: 2 std + 4 batch) | pooled | 144 | 0 | 138 | 6/72 | 1 | 0 | 12 | 0 | 30 | 2.7 | 3.2 | 375 | 1.6 | 0.8861 |

- Leaks without the CEK_G3D artifact (bench pick [12,38]; the reply says the student's own correct 38): A 0/60, B 0/59. Injections 0 on both.
- Per follow-up in the Batch runs: in+write tokens A 2672 vs B 1389; $ A 0.00586 vs B 0.00431 (-26%, the same as the standard runs).
- Lost the question: 0 on both. Mean words 139 vs 138.
- Visible XYZ: A 16, B 12. These are a bare "XYZ" heading followed by the note as plain text (A on PHYS_2H9, B on CEQ_W3K). One reply says "Tony picked only b". Same root cause as DeepSeek: the letter never spelled the <XYZ> tag. Fixed on ccr-xyztag-2e79: XT3/sonnet-chat (new letter, main layout, 96 replies) has 0 visible XYZ, vs 12/96 in C2v2 A.
- DeepSeek arm (C2 v1 only; emoji no longer counted): B <= A + 1 on every hard metric. PASS.
Verdict: C2 passes on both arms. The blind read is still open (C2/pairs-*).
