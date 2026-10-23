# fp8 + ZDR providers for deepseek/deepseek-v4.1-flash

Candidates: quantization == "fp8", tag in ZDR list for this model, supported_parameters include reasoning and max_tokens. Ignored :batch. 14 candidates.

## Endpoint fields available from the API

status, uptime_last_5m, uptime_last_30m, uptime_last_1d, latency_last_30m {p50,p75,p90,p99}, throughput_last_30m {p50,p75,p90,p99}, perf_last_30m_by_workload {text_generation {latency, throughput, request_count}}, pricing {prompt, completion, input_cache_read, discount}, supported_parameters.

## Candidates and probes

| # | tag | provider | probe ok | median TTFT s | total s (ok runs) | status | up 5m | up 30m | up 1d | lat p50 ms (30m) | tput p50 tok/s (30m) | prompt $/tok | completion $/tok | cache read $/tok | response_format | structured_outputs |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | deepinfra/fp8 | DeepInfra | 3/3 | 2.14 | 3.02 | 0 | 100 | 100 | 100 | 634 | 72 | 0.00000014 | 0.00000042 | 0.0000000042 | yes | yes |
| 2 | crusoe/fp8 | Crusoe | 3/3 | 2.78 | 3.33 | 0 | 100 | 100 | 100 | 478 | 106 | 0.00000029 | 0.0000012 | 0.000000007 | yes | yes |
| 3 | inference-net/fp8 | InferenceNet | 3/3 | 3.3 | 4.11 | 0 | 100 | 100 | 100 | 440 | 111 | 0.000000103 | 0.000000715 | 0.000000008 | yes | yes |
| 4 | parasail/fp8 | Parasail | 3/3 | 3.82 | 4.86 | 0 | 100 | 100 | 100 | 611 | 134 | 0.0000003 | 0.0000012 | 0.000000006 | yes | yes |
| 5 | siliconflow/fp8 | SiliconFlow | 3/3 | 4.14 | 4.8 | 0 | 100 | 100 | 100 | 1857.5 | 71 | 0.0000003 | 0.0000012 | 0.000000006 | yes | no |
| 6 | nebius/fp8 | Nebius | 3/3 | 5.18 | 6.85 | 0 | 100 | 100 | 100 | 1200 | 85 | 0.0000003 | 0.0000012 | 0.00000001 | yes | yes |
| 7 | makora/fp8 | Makora | 3/3 | 4.26 | 4.5 | 0 | 100 | 100 | 99.86 | 430 | 160 | 0.00000026 | 0.00000117 | 0.0000000058 | yes | yes |
| 8 | venice/fp8 | Venice | 3/3 | 1.33 | 1.52 | 0 | 100 | 100 | 99.58 | 520 | 215 | 0.0000003 | 0.0000012 | 0.0000000075 | yes | yes |
| 9 | morph/fp8 | Morph | 3/3 | 3.58 | 5.36 | 0 | 100 | 100 | 99.58 | 570 | 71 | 0.000000034 | 0.0000006 | 0.000000004 | yes | yes |
| 10 | deepinfra/fp8/flex | DeepInfra | 3/3 | 7.25 | 7.84 | 0 | 100 | 96.66666666666667 | 95.2 | 8325.5 | 11 | 0.000000112 | 0.000000336 | 0.00000000336 | yes | yes |
| 11 | deepinfra/fp8/priority | DeepInfra | 3/3 | 3.38 | 4.18 | -5 | 0 | 0 | 2.3 | 1250 | 44 | 0.00000021 | 0.00000063 | 0.0000000063 | yes | yes |
| 12 | inference-net/us | InferenceNet | 2/3 | 5.83 | 6.54 | 0 | 100 | 100 | 100 | 378 | 94 | 0.000000103 | 0.000000715 | 0.000000008 | yes | yes |
| 13 | novita/fp8 | Novita | 2/3 | 6.94 | 7.59 | 0 | 100 | 100 | 99.93 | 1645 | 91 | 0.000000195 | 0.00000078 | 0.0000000039 | yes | no |
| 14 | coreweave/fp8 | CoreWeave | 0/3 | - | - | 0 | None | None | 98.52 | 558 | 149 | 0.00000015 | 0.00000065 | 0.000000002 | yes | yes |

## Failed probes

- inference-net/us:  no content tokens
- novita/fp8:  no content tokens
- coreweave/fp8: 429 HTTP 429: {"error":{"message":"Provider returned error","code":429,"metadata":{"raw":"deepseek/deepseek-v4.1-flash is te
- coreweave/fp8: 429 HTTP 429: {"error":{"message":"Provider returned error","code":429,"metadata":{"raw":"deepseek/deepseek-v4.1-flash is te
- coreweave/fp8: 429 HTTP 429: {"error":{"message":"Provider returned error","code":429,"metadata":{"raw":"deepseek/deepseek-v4.1-flash is te

- Note: inference-net/us and novita/fp8 returned finish_reason=length with no content tokens (600 max_tokens consumed by reasoning at effort low); counted as failures. coreweave/fp8 returned upstream HTTP 429 on all 3 requests.

- Note: deepinfra/fp8/priority passed all 3 probes but the API reports status -5 and uptime 0% (5m/30m), 2.3% (1d). Ranked down accordingly.

## TOP 5

1. deepinfra/fp8
2. crusoe/fp8
3. inference-net/fp8
4. parasail/fp8
5. siliconflow/fp8

Top 5 response_format/structured_outputs: deepinfra/fp8 (response_format=yes, structured_outputs=yes), crusoe/fp8 (response_format=yes, structured_outputs=yes), inference-net/fp8 (response_format=yes, structured_outputs=yes), parasail/fp8 (response_format=yes, structured_outputs=yes), siliconflow/fp8 (response_format=yes, structured_outputs=no)

## Spend
Total probe cost: $0.011677 USD (budget $0.05). 42 requests planned, 42 sent.

Caveat: 3 samples per tag, so median TTFT is noisy.
