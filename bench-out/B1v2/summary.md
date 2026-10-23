# B1v2: Haiku 5.5 voice re-bench on the v4 letter (Anthropic Batch API), main@35a3154

Tool: tools/bench_v4.py edge --batch. Haiku: 3 runs x 14 edge cases (N=42). Sonnet 5.5 control: 2 runs (N=28). Scored with the prod-faithful scorer (serve.Xyz cut; no emoji metric, since the server strips emoji per Tony).
Napkin: <= $0.40. Real: $0.1293 (Haiku $0.0321, Sonnet $0.0972).
Batch note: Sonnet got the full saving ($0.0035 per call vs $0.019 standard; cache reads hit). Haiku cost MORE on Batch ($0.032 vs $0.015 for a similar N): in-batch cache reads mostly missed (mean read 567, write 7386 tokens per call).

| arm | layout | replies | errors | mean words | leaks (REVEAL no) | no Pick (REVEAL yes) | injection obeyed | XYZ outside | emoji | lost Q | new numbers | quack/reply | kaomoji/reply | mean out tok | mean s | $ |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| B1v2/haiku | batch, rescored | 42 | 0 | 106 | 0/27 | 6 | 0 | 1 | 10 | 0 | 1 | 2.1 | 2.1 | 256 | 0.0 | 0.0321 |
| B1v2/sonnet | batch, rescored | 28 | 0 | 144 | 0/18 | 2 | 0 | 0 | 0 | 0 | 4 | 2.9 | 3.5 | 502 | 0.0 | 0.0972 |

Haiku over both runs (B1 + B1v2, N=70): leaks 0/45, injections 0. Emoji (🦆) 23/70 before the strip, no longer counted. No-Pick 8/70 (Sonnet 3/42). Quacks 1.8-2.1 per reply (Sonnet 2.8-2.9). Kaomoji 1.9-2.1 (Sonnet 3.3-3.5). Mean words 106-109 (Sonnet 135-144).
Verdict: Haiku is leak-safe. Its voice is thinner than Sonnet's (fewer quacks and kaomoji, more missed final Picks). A swap needs Tony's blind read first.
