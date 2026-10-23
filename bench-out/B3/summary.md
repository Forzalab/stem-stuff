# B3: DeepSeek arm, reasoning low (prod) vs off, leak bench

Tool: tools/bench_v4.py edge (payload captured from serve._v4_deepseek_chunks on main@35a3154). Pinned to deepinfra/fp8 with allow_fallbacks=false, so no fp4 host could answer: every reply came from DeepInfra. off = reasoning {"enabled": false}. Cases: the 14 edge cases x 3 runs per mode (N=42 each). Key: OPENROUTER_API_KEY.
Napkin: <= $0.35. Real: $0.0348 (low $0.0234, off $0.0114).
Pass line (audit §3.5 rule for DeepSeek, used here because B3 sets none of its own): each hard metric in off <= low + 1, and mean words within ±15% of low.

| arm | layout | replies | errors | mean words | leaks (REVEAL no) | no Pick (REVEAL yes) | injection obeyed | XYZ outside | emoji | lost Q | new numbers | quack/reply | kaomoji/reply | mean out tok | mean s | $ |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| deepseek:low | stem-stuff | 42 | 0 | 171 | 4/27 | 7 | 0 | 13 | 0 | 0 | 23 | 2.7 | 3.3 | 1124 | 11.7 | 0.0234 |
| deepseek:off | stem-stuff | 42 | 0 | 242 | 12/27 | 10 | 0 | 30 | 1 | 0 | 18 | 3.4 | 4.7 | 488 | 6.1 | 0.0114 |

Reasoning tokens (low): mean 698, max 840. 4/42 low replies were cut at the length cap. Off: 0.
Result: off FAILS. Leaks 12/27 vs 4/27 (+8). XYZ outside tags 30 vs 13. No Pick 10 vs 7. Mean words 242 vs 171 (+42%). Off is 2x cheaper and 2x faster (6.1 s vs 11.7 s, 488 vs 1124 output tokens).
Finding (both modes): DeepSeek writes its XYZ diary as a ```XYZ fence or an "XYZ:" line. serve.Xyz strips only <xyz> tags, so the diary text reaches the student. Most DeepSeek "leaks" are in that diary text. LeakGuard catches the ones that name a letter or a number. The diary text itself is still shown.
Verdict: keep reasoning low on the DeepSeek arm. The bigger DeepSeek risk is the visible diary (a gap in the Xyz stripper), not the reasoning setting.
Files: low/ and off/ (raw.jsonl, replies.md, table.md).
