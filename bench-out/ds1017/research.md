# DeepSeek V4.1 Flash: 0910 vs 1017 (research as of 2026-10-23)
Legend: [V]=vendor-reported (DeepSeek), [OR]=OpenRouter API, [AA]=Artificial Analysis via OR /api/v1/models field. No API calls made.

| metric | 0910 (deepseek/deepseek-v4.1-flash) | 1017 (-1017) | source |
|---|---|---|---|
| Instruction following (IFEval/IFBench/etc.) | no public data found | no public data found | HF card, DeepSeek news, AA search: none listed |
| Intro physics/math (GPQA, AIME, MMLU-Pro) | no public data found | no public data found | HF card has none |
| HLE no tools [V] | 36.8 (text-only 39.1) | 42.6 (text-only 44.0) | https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash-1017 (2026-10-17) |
| Terminal-Bench 4.0 [V] | 31.2 | 42.3 | same |
| DeepSWE v1.1 [V] | 74.2 | 77.0 | same |
| ProgramBench / NL2Repo [V] | 20.3 / 65.4 | 29.1 / 68.2 | same |
| Automation-Bench / Apex v1.1 [V] | 54.8 / 64.6 | 60.5 / 72.1 | same |
| BabyVision / Chartography / ZeroBench (w/tools) [V] | 89.6 / 78.9 / 49.0 | 92.5 / 83.0 / 51.0 | same |
| AA Intelligence Index [AA] | 24.7 | 39.5 | https://openrouter.ai/api/v1/models (fetched 2026-10-23); AA page lists V4.1 Flash (Max) = 39, 176 t/s: https://artificialanalysis.ai/models/creators/deepseek. Index versions may differ: treat gap with caution (UNVERIFIED comparability) |
| OR Design Arena [OR] | none | e.g. website elo 1309 rank 12 | same OR JSON (design/UI, not relevant to tutoring) |
| Reasoning-token length / verbosity | no public data found | no numbers; qualitative "shorter outputs" [V] | https://api-docs.deepseek.com/news/news261017 |
| Latency / speed | no public data found | no numbers; "faster task completion" [V]. AA 176 t/s is for "V4.1 Flash (Max)", snapshot unclear | same; AA link above |
| Price /M tok in/out (OR listing) | $0.30 / $1.20, cache read $0.006 (flat) | $0.15 / $0.60 base, cache $0.003; weekday peak windows $0.30 / $1.20 | OR JSON above (2026-10-23) |
| Price (DeepSeek, deepseek-flash) [V] | n/a | off-peak $0.15/$0.60, peak $0.30/$1.20; peak 01-04 and 06-10 UTC weekdays | https://api-docs.deepseek.com/news/news261017 via https://braindetox.kr/en/posts/deepseek_v4_1_flash_1017_update_2026.html (secondary) |
| Context length | 1,048,576 | 1,048,576 | OR JSON |
| Max completion tokens (OR) | 943,718 | 393,216 top-provider (943,718 on some endpoints; DeepSeek docs say 384K) | OR JSON + endpoints API |
| supported_parameters | no max_completion_tokens | adds max_completion_tokens; otherwise identical (reasoning, reasoning_effort, response_format, structured_outputs, tools, seed, logprobs...) | OR JSON |
| Reasoning efforts | max/high/low/none, default high | same | OR JSON |

## What changed in 1017 (release notes)
- Called a "minor update"; weights MIT; served under `deepseek-flash` name, old names retired, same call method (https://api-docs.deepseek.com/updates, https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash-1017).
- Vendor: "stronger benchmark performance, faster task completion, shorter outputs"; "Pareto improvement in performance and cost" (news261017). No numbers for output length or speed.
- RL with self-feedback aimed at end-to-end project dev; tuned for DeepSeek Harness, Tencent CodeBuddy/WorkBuddy (agentic/coding focus, not chat/instruction following).
- Gains concentrated in agentic/coding/vision benchmarks (above); search & fetch API opened, $0.75/1k calls, free until 2026-10-31 16:00 UTC.
- Recommended sampling temperature 1.0, top_p 1.0 (secondary source).

## Gaps
All benchmark numbers are DeepSeek's own, not independently reproduced. No IFEval/IFBench, GPQA, AIME, LiveBench, Aider, LMArena, hallucination or long-context data found for either snapshot. Searched OR, DeepSeek docs, HF, AA search.

## Take
Instruction-following: UNKNOWN (no public data). Vendor gains are agentic/coding/HLE and AA index rose 24.7 -> 39.5 (UNVERIFIED comparability), so slight lean to better in general reasoning, but "shorter outputs" could change private-note/format behavior: must test on our own prompts.
