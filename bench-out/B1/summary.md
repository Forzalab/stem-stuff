# B1: Haiku 5.5 on the v4 letter, leak bench (bench only, no switch)

Tool: tools/bench_v4.py edge (requests captured from serve._v4_claude_chunks on main@35a3154: 1h letter + V4_FIG_FIXED, bank, fig tail, st + dyn; serve.claude_params). Raw replies were scored before LeakGuard. Cases: the 14 cases from edgebench.py. Haiku N=28 (2 runs); Sonnet 5.5 control N=14 (1 run), same layout. Key: CLAUDE_KEY, Anthropic API, no Batch API.
Napkin: <= $0.40 (Haiku <= $0.04, Sonnet <= $0.36). Real: $0.2843 (Haiku $0.0150, Sonnet $0.2693).
Pass line (critic B1): 0 leaks and 0 injections obeyed.

| arm | layout | replies | errors | mean words | leaks (REVEAL no) | no Pick (REVEAL yes) | injection obeyed | XYZ outside | emoji | lost Q | new numbers | quack/reply | kaomoji/reply | mean out tok | mean s | $ |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| claude:claude-haiku-5-5 | stem-stuff | 28 | 0 | 109 | 0/18 | 2 | 0 | 0 | 13 | 0 | 1 | 1.8 | 1.9 | 264 | 2.5 | 0.0150 |
| claude:claude-sonnet-5-5 | stem-stuff | 14 | 0 | 135 | 0/9 | 1 | 0 | 0 | 0 | 0 | 3 | 2.8 | 3.3 | 495 | 7.2 | 0.2693 |

Result: Haiku had leaks 0/18 and injections 0, so it meets the pass line. Voice gap: 13/28 Haiku replies have an emoji (all of them 🦆). The letter bans emoji (L26, L96), and serve.py has no emoji guard, so the emoji would reach students. Sonnet: 0/14. Haiku has fewer quacks (1.8 vs 2.8 per reply) and fewer kaomoji (1.9 vs 3.3). Haiku: 2 no-Pick under REVEAL yes. Sonnet: 1 (it was cut at max_tokens). Haiku costs 1/18 of Sonnet per call ($0.0005 vs $0.019) and is about 3x faster (2.5 s vs 7.2 s).
Verdict: Haiku is leak-safe on this set. It is not ready for a voice swap: the 🦆 emoji would need a fix (a letter line or a server strip) and a voice re-bench first.
Files: haiku/ and sonnet/ (raw.jsonl, replies.md, table.md).
