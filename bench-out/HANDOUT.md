# W-BENCH handout (session_01JGwrsVZosD9REG3G4wKSvc → next session), 2026-10-23 10:5x PT

Branch: `ccr-bench-0d99` (bench-only, never a PR). Read this file, then each `bench-out/*/summary.md`.
Spend so far: ~$3.52 of the $5 cap Tony gave this bench session (ledger `bench-out/ledger.jsonl` = $3.3958 + ~$0.13 of off-ledger probes).
Keys used: CLAUDE_KEY (Anthropic API + Message Batches), OPENROUTER_API_KEY (DeepSeek; OpenRouter batch API once). Never print them.

## Shipped to prod (merged)
- PR #241: C2, the question block once per chat (bench: follow-up $ -26%, leaks 0).
- PR #248 (was ccr-xyztag-2e79): letter rule lines spell `<XYZ> ... </XYZ>` (lore unchanged, SHA 7e73b63a, brain synced); DeepSeek max_tokens x3 (2100); DeepSeek and NOTE `allow_fallbacks: False`; DeepSeek host list = deepinfra/fp8, crusoe/fp8, inference-net/fp8, parasail/fp8, siliconflow/fp8 (a failure goes to the Claude arm, Anthropic API).
- PR #245: emoji strip (so the bench has no emoji metric).

## Decisions from the benches
| question | answer | where |
|---|---|---|
| Haiku 5.5 instead of Sonnet? | leak-safe (0/45), thinner voice; stay Sonnet until Tony's blind read | B1, B1v2 |
| DeepSeek reasoning off? | no: leaks 12 vs 4; effort none is out on both models | B3, ds1017 r2 |
| C2 layout | PASS both arms | C2, C2pool |
| `<XYZ>` letter fix | visible note DeepSeek 33/90 → 0/90, Sonnet 12/96 → 0/96 | XT, XT3 |
| DeepSeek 1017 vs 0910 | stay 0910: 1017 is cleaner and cheaper but thinks ~1260 tokens at ~60 tok/s, so first word ~20 s vs 4.5 s; on some hosts it fills the whole budget (empty replies) | ds1017 r1-r3 |
| Uptime of a host | does not matter much: a failure falls back to Claude (Tony) | - |

## Open (not mine to fix; on the brain todo list)
- todo 47: the 6 s first-word cap (CLUCK_FIRST_TEXT_S) may hand many DeepSeek turns to Claude. 0910 median first word was 9.7 s mid-morning and 4.5 s at ~10:40 PT, so it depends on the time of day. Needs prod logs (`answered=claude fallback=True`).
- todo 46: LeakGuard false positive on a multi item when the student already got one part right (leak_facts does not skip it).
- todo 48: the NOTE once tagged a physics item `field=discrete_math`.
- todo 49: the model once called the student "Tony" in its note.
- Tony's blind read of the A/B pairs: `bench-out/C2/pairs-claude/pairs.md`, `pairs-deepseek/pairs.md` (keys in `pairs-key.md`).
- 1017 again later: only with a longer first-word cap or a "thinking..." UI; it would need a bigger budget and its own hosts (parasail first).

## The tool: tools/bench_v4.py (on this branch only)
Requests are captured from serve's own builders (`_v4_claude_chunks`, `_v4_deepseek_chunks`), so bench = prod. Replies are scored raw, before LeakGuard, with serve.Xyz's cut.
```
export STEM_BANKS=<a dir with the brain banks: projects/*/_files/*-bank/BANK_*.json + formula-sheet.json> STEM_TRIES=<scratch>/tries.json
python3 tools/bench_v4.py edge|chat --arm claude:claude-sonnet-5-5 | deepseek:low|off|none|medium|high \
    [--root <checkout whose serve.py builds the requests>] [--ds-model deepseek/deepseek-v4.1-flash-1017] [--ds-hosts a/fp8,b/fp8] \
    [--batch] --runs N --out DIR --cap USD --est USD_PER_CALL --ledger bench-out/ledger.jsonl
python3 tools/bench_v4.py rescore DIR/raw.jsonl --out DIR/rescore     # re-score saved replies, $0
python3 tools/bench_v4.py pairs A/raw.jsonl B/raw.jsonl --out DIR      # blind A/B pairs
```
Tests: `python3 -m unittest tests.test_bench_v4` (no key).

## Gotchas learned the hard way
- Write a napkin (calls x tokens x price) before every run; per-run `--cap` stops calls, but parallel probes outside the tool can overshoot (a scout went 20% over).
- Anthropic Batch: Sonnet got the full 50% off; Haiku cost MORE (in-batch cache reads missed). A chat bench needs one batch per turn (~6 min each).
- OpenRouter `:batch` slugs do not work on chat/completions; use `POST /api/v1/batches` (provider.only, no order). Cost comes only on the batch total. Queue was 33 min for 14 requests.
- DeepSeek effort low gives reasoning up to 60% of max_tokens. `reasoning.max_tokens` was ignored by the provider.
- CEK_G3D with pick [12, 38] trips the leak detector because 38 is a correct part: count leaks "without CEK_G3D".
- First-word time needs a streaming probe; the non-stream bench seconds hide it.
