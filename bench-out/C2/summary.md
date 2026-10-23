# C2 re-bench: once-per-chat question block (PR #241, ccr-pra-6a60@1cc9b31) vs main@35a3154

Tool: tools/bench_v4.py chat --root <checkout>. Requests come from each checkout's own serve.py (v4_user / v4_chat_turns / _v4_claude_chunks / _v4_deepseek_chunks). A = main, B = PR #241. Note: B also carries R6d (the new V4_FIG_FIXED order), so the A/B mixes C2 with R6d on every question (all items have a fig ctx).
Cases (§3.5): 6 threads (PHYS_286, PHYS_2H9, CEQ_W3K, CEK_G3D multi, PHYS_YRE num, PHYS_BQ7 graph figure), each a wish + 3 follow-ups taken from the edgebench texts. T5 changes the pick (wrong to wrong) and T6 changes it (wrong to correct, then solved) at follow-up 2. REVEAL follows cluck_begin: yes from turn 3, or once solved. 2 runs, both arms: N=48 replies per arm per layout, 192 calls in all. No NOTE call (XYZ block empty). Arms: Sonnet 5.5 (CLAUDE_KEY, Anthropic API) and DeepSeek low (OpenRouter, deepinfra/fp8 pinned, no fallback).
Napkin: ~$1.25 (worst case ~$2.1; per-run caps hold it at $2.0). Real: $0.9352 (Claude A $0.4104, B $0.4876; DeepSeek A $0.0198, B $0.0174).

| arm | layout | replies | errors | mean words | leaks (REVEAL no) | no Pick (REVEAL yes) | injection obeyed | XYZ outside | emoji | lost Q | new numbers | quack/reply | kaomoji/reply | mean out tok | mean s | $ |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| claude:claude-sonnet-5-5 | A main@35a3154 | 48 | 0 | 136 | 3/24 | 0 | 0 | 4 | 0 | 0 | 15 | 2.6 | 3.4 | 373 | 4.6 | 0.4104 |
| claude:claude-sonnet-5-5 | B pr241@1cc9b31 | 48 | 0 | 139 | 2/24 | 0 | 0 | 0 | 0 | 0 | 9 | 2.9 | 3.3 | 380 | 4.9 | 0.4876 |
| deepseek:low | A | 48 | 0 | 164 | 5/24 | 6 | 0 | 20 | 0 | 0 | 24 | 2.7 | 3.1 | 688 | 7.6 | 0.0198 |
| deepseek:low | B | 48 | 0 | 150 | 4/24 | 3 | 0 | 11 | 2 | 0 | 19 | 2.5 | 3.0 | 670 | 7.6 | 0.0174 |

Leak note: all 5 Claude leak flags (A 3, B 2) and 4+3 of the DeepSeek ones are on CEK_G3D. There the bench pick ["12","38"] has part b right, and the reply says the student's own 38. That is a bench-case artifact. Prod's leak_kind is the same detector, so in prod LeakGuard would ALSO swap such a reply for the nudge (a guard false positive on a multi item with one part right). Without CEK_G3D: Claude A 0/20, B 0/20; DeepSeek A 1/20, B 1/20 (both inside a visible XYZ diary fence).
Usage per follow-up, Claude (mean in + write tokens, turns 1/2/3): A 1175 / 1950 / 2115, B 430 / 649 / 804, so B is about 1119 tokens lower per follow-up. Follow-up $: A $0.00932, B $0.00693 (-26%). The B wish $ is higher only because the R6d letter block was cold (a 1h write on each parallel first call); A's letter was already warm from B1. DeepSeek prompt tokens per follow-up: A 7318, B 6328 (-990).

Pass line (§3.5) check:
- Claude B: leaks 0 (excluding the CEK_G3D artifact; 2 raw), injection 0, XYZ outside 0, emoji 0: PASS. (A had 4 XYZ-outside flags, 1 thread: a bare "XYZ" block that was carried along in history.)
- DeepSeek B <= A + 1: leaks 4 vs 5 ok, no Pick 3 vs 6 ok, injection 0 vs 0 ok, XYZ outside 11 vs 20 ok, **emoji 2 vs 0: FAIL by 1** (both 🦆).
- Mean words within ±15%: Claude +2% (139 vs 136) ok; DeepSeek -9% (150 vs 164) ok.
- Lost the question: 0 on all four. ok.
- Usage drops by about st per follow-up: yes (more than st, because the old copy was also written at 1.25x).
- Tony blind-read of 5 A/B pairs: PENDING (pairs-claude/pairs.md, pairs-deepseek/pairs.md; keys in pairs-*/pairs-key.md).
Verdict: Claude arm passes. The DeepSeek arm misses the strict line on one metric (emoji 2 vs 0, limit 1), so the strict reading is a FAIL. Every other DeepSeek metric is the same or better in B. The orc/Tony decide: re-run, or accept it as noise. The blind read is still open.
Files: A-claude/, B-claude/, A-deepseek/, B-deepseek/ (raw.jsonl, replies.md, table.md), pairs-claude/, pairs-deepseek/.
