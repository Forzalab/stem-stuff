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

## Round 2 (Tony: effort affects every bench; re-scout hosts for 1017)

Effort sweep, PR #248 code, edge 42 + chat 48 per cell, leaks without the CEK_G3D artifact (edge /27, chat /20), mean seconds = whole reply:

| model | effort | leaks edge | leaks chat | no Pick edge+chat | cut | mean s edge / chat | $ per call |
|---|---|---|---|---|---|---|---|
| 0910 | none | 3 | 0 | 8+5 | 0 | 6.7 / 4.3 | 0.00026 |
| 0910 | low (prod) | 1 | 0 | 1+3 | 1 | 17.8 / 9.3 | 0.00050 |
| 0910 | high | 0/21 | 0 | 1+0 | 1 | 46.8 / 42.5 | 0.0017 (hit my \$0.06 cap: 16 calls skipped, 6 timeouts) |
| 1017 | none | 2 | 1 | 2+4 | 0 | 8.1 / 6.5 | 0.00017 |
| 1017 | low | 0 | 0 | 0+3 | 1 | 25.8 / 12.7 | 0.00038 |
| 1017 | high | 0 | 0 | 0+1 | 0 | 23.5 / 15.2 | 0.00039 |

- Effort none is out for both models (more leaks, many missed final Picks).
- 1017 at low or high is the best quality cell and costs less than 0910 low. 0910 high is slow and expensive.
- Every reasoning setting is far over the 6 s first-word cap (todo 47). Only "none" comes close.

1017 host re-scout (Haiku agent, our real payloads, 3 per host, 12 fp8+ZDR hosts, \$0.0597, 20% over its \$0.05 cap because it queued every job before costs came back):
- 0 failures: parasail/fp8 (first token 7.2 s), deepinfra/fp8/priority (14.4 s, 1-day uptime 92%), deepinfra/fp8 (23.6 s).
- 1 failure: deepinfra/fp8/flex, novita, makora, inference-net/us, siliconflow. 2 failures: nebius, crusoe, inference-net/fp8, morph.
- Main failure: the reasoning ignores effort low and fills the 2100 budget (9/36 requests cut; 7 of them empty).
- Scout top 5: parasail, deepinfra/priority, deepinfra, deepinfra/flex, novita. Only 3 samples per host.
Verdict round 2: still stay on 0910 low for prod. If 1017 is adopted later, it needs a bigger budget (x4 or more) and its own host list (parasail first, losing the DeepInfra prompt cache), then a re-bench. Today's 5-host list is the right one for 0910 only.

## Round 3 (Tony): 1017 pinned to deepinfra/fp8/priority only (= provider.only + allow_fallbacks off), on origin/main@25f77cb (PR #248, #241, #245 merged)

| effort | set | N | leaks (excl. CEK) | no Pick | cut | empty | mean s | $ |
|---|---|---|---|---|---|---|---|---|
| low | edge | 42 | 0/27 | 0 | 0 | 0 | 16.5 | 0.0254 |
| low | chat | 48 | 0/20 | 0 | 0 | 0 | 8.7 | 0.0203 |
| high | edge | 42 | 0/27 | 0 | 0 | 0 | 18.0 | 0.0278 |
| high | chat | 48 | 0/20 | 1 | 0 | 0 | 10.2 | 0.0231 |
All 180 replies were served by DeepInfra priority. Quality is the cleanest cell of the day.

Time to first word, streaming, 12 each, run side by side (6 s = prod CLUCK_FIRST_TEXT_S):
- 0910 prod (5-host list, deepinfra): median 4.5 s, 4/12 over 6 s, total median 8.8 s.
- 1017 priority: median 20.0 s, 10/12 over 6 s, total median 24.2 s.
- Sequential check (1017 priority): first reasoning token 0.9 s, then 1259 reasoning tokens (the effort-low cap, 60% of 2100) at ~61 tok/s, so ~21 s of thinking before the first word. The cause is the model's long reasoning, not concurrency.
Verdict round 3: 1017 on priority is quality-clean but ~4x slower to the first word than 0910. With the 6 s cap, prod would hand most 1017 turns to Claude (Claude prices, cold cache). Stay on 0910. A 1017 switch only makes sense with a much longer first-word cap, or with streamed "thinking..." UI.
