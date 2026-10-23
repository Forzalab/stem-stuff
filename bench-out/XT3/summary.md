# XT / XT3: <XYZ> tag in the letter's rule part + DeepSeek budget x3 + no host fallback (ccr-xyztag-2e79)

Branch ccr-xyztag-2e79 (from origin/main): b000e08 rule lines L52, L53 and G5 show <XYZ> ... </XYZ> (lore L10/L92 unchanged; new SHA 7e73b63a7b551bf3513f8bf5a21bf7903d26bfb23e1a9399e07cccc312edb363). ec23d3c DeepSeek max_tokens x3 (2100). e255d4b DeepSeek allow_fallbacks off (a failure goes to the Claude arm, Anthropic API). 7388509 NOTE call allow_fallbacks off. Then the 5-host fp8 list (see fp8-providers/report.md).
Scorer: prod-faithful (serve.Xyz cut), no emoji metric.

| run | arm | N | leaks REVEAL no | no Pick | inj | visible XYZ | cut at max_tokens | $ |
|---|---|---|---|---|---|---|---|---|
| B3/low (old letter, x2) | DeepSeek edge | 42 | 3/27 | 7 | 0 | 13 | 4 | 0.0234 |
| XT/ds-edge (new letter, x2) | DeepSeek edge | 42 | 0/27 | 2 | 0 | 0 | 5 | 0.0208 |
| XT3/ds-edge (new letter, x3) | DeepSeek edge | 42 | 0/27 | 0 | 0 | 0 | 0 | 0.0262 |
| XT3/ds-edge-orbatch (x3, OpenRouter batch) | DeepSeek edge | 14 | 0/9 | 0 | 0 | 0 | 0 | 0.0068 |
| C2/A-deepseek (old letter, x2) | DeepSeek chat | 48 | 5/24 | 6 | 0 | 20 | 1 | 0.0198 |
| XT/ds-chat (new letter, x2) | DeepSeek chat | 48 | 3/24 | 3 | 0 | 0 | 5 | 0.0220 |
| XT3/ds-chat (new letter, x3) | DeepSeek chat | 48 | 2/24 | 0 | 0 | 0 | 1 | 0.0208 |
| B1v2/sonnet (old letter) | Sonnet edge, Batch | 28 | 0/18 | 2 | 0 | 0 | 3 | 0.0972 |
| XT/sonnet-edge (new letter) | Sonnet edge, Batch | 28 | 0/18 | 3 | 0 | 0 | - | 0.1260 |
| C2v2/A-claude (old letter) | Sonnet chat, Batch | 96 | 0/40 excl. CEK | - | 0 | 12 | - | 0.5163 |
| XT3/sonnet-chat (new letter) | Sonnet chat, Batch | 96 | 0/40 excl. CEK | 4 | 0 | 0 | - | 0.4972 |

DeepSeek budget: effort low gives reasoning up to 60% of max_tokens (840 of 1400). At x3, reasoning p90 is 1260 (it fills the new cap). Mean edge latency 13.1 s -> 15.5 s. Pinning reasoning.max_tokens=840 was ignored by the provider (it used 1080).
Time to first word (streaming, N=8 each, 6 s = prod CLUCK_FIRST_TEXT_S): x2 5/8 over 6 s, x3 3/8. So today's prod (x2) may hand most DeepSeek-arm turns to Claude. UNVERIFIED in prod logs.
OpenRouter batch (deepseek-v4.1-flash, DeepInfra fp8 only): 14/14 OK, queued 1960 s, $0.00049 per call vs $0.00062 sync (-21%). Usage.cost comes only on the batch, not per request.
Verdict: the <XYZ> fix removes the visible note on both arms (DeepSeek 33/90 -> 0/90, Sonnet 12/96 -> 0/96) without new leaks. x3 removes the mid-note cuts.
