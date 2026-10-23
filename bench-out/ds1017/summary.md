# DeepSeek V4.1 Flash 1017 vs 0910 (prod), on PR #248 code (ccr-xyztag-2e79@b734d3c: <XYZ> letter, x3 budget, 5 fp8 hosts, no fallback)

Research (research.md; vendor numbers, not reproduced): Artificial Analysis intelligence index 24.7 (0910) -> 39.5 (1017), read from OpenRouter /api/v1/models. DeepSeek reports HLE 36.8 -> 42.6, Terminal-Bench 31.2 -> 42.3, DeepSWE 74.2 -> 77.0. The gains are agentic/coding. No public instruction-following data exists for either snapshot. On DeepInfra, 1017 is ~30% cheaper ($0.098/$0.294 vs $0.14/$0.42). All 5 of our fp8 hosts serve 1017 with ZDR.

Our bench (same cases as B3/C2, DeepSeek arm, effort low, 2100 max_tokens, all replies from DeepInfra):
| arm | layout | replies | errors | mean words | leaks (REVEAL no) | no Pick (REVEAL yes) | injection obeyed | XYZ outside | lost Q | new numbers | quack/reply | kaomoji/reply | mean out tok | mean s | $ |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| deepseek:low | 0910 pr248@b734d3c | 42 | 0 | 151 | 1/27 | 1 | 0 | 0 | 0 | 20 | 2.8 | 3.3 | 1269 | 17.8 | 0.0234 |
| deepseek:low | 1017 pr248@b734d3c | 42 | 0 | 133 | 0/27 | 0 | 0 | 1 | 0 | 18 | 2.5 | 3.5 | 1138 | 25.8 | 0.0180 |
| deepseek:low | 0910 pr248@b734d3c | 48 | 0 | 126 | 3/24 | 3 | 0 | 0 | 0 | 19 | 2.6 | 2.8 | 796 | 9.3 | 0.0214 |
| deepseek:low | 1017 pr248@b734d3c | 48 | 0 | 116 | 2/24 | 3 | 0 | 0 | 0 | 21 | 2.4 | 2.9 | 563 | 12.7 | 0.0156 |
- Leaks without the CEK_G3D artifact: 0 on all four runs. Visible XYZ: 0910 0/90; 1017 1/90 (edge low-mood; reasoning text leaked into the reply: "0.111 in XYZ? It appears in SLIP? ... b?").
- Reasoning median: edge 658 -> 588, chat 285 -> 171 (1017 thinks less on DeepInfra). Mean seconds: edge 17.8 -> 25.8, chat 9.3 -> 12.7 (1017 is slower).
- Time to first word, 12 streams each on DeepInfra, now: 0910 median 9.7 s (9/12 over 6 s), 1017 median 14.7 s (10/12 over 6 s). Both are far over the prod CLUCK_FIRST_TEXT_S=6 cap at this hour (todo 47).
- 1017 per host (exam-panic case): parasail/fp8 and siliconflow/fp8 spent the WHOLE 2100 budget on reasoning: 4/4 cut, 3 empty replies. 0910 on the same hosts: 5/6 OK. So "effort low" is not honored for 1017 on those hosts.
Verdict: stay on 0910. 1017 is the same or slightly better on our quality metrics and cheaper. But it is slower on DeepInfra, its fallback hosts #4/#5 give empty replies, and once it leaked reasoning text into the reply. Re-check in a week (host support for effort low on 1017, DeepInfra speed).
Spend: ~$0.11 for this round (ledger $0.0784 + off-ledger streaming probes ~$0.03).
