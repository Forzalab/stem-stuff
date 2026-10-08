# PostHog re-bench, 2026-10-07 (G3-pre)

The D22 "+494 ms TBT" bench measured the snippet config (`person_profiles:"identified_only"`, recording unmasked), and with a
dummy token PostHog never started the recorder. Neither run measured what telemetry.js ships. tools/bench-telemetry.mjs now
reads the `p.init({...})` options and `blankPII` straight out of the build's telemetry.js (snippet mode too). It stubs the
PostHog backend locally: posthog-js 1.438.2 from a local `npm pack` copy, and a remote config with session recording and
autocapture **on**. No request reaches *.posthog.com, and the token is the dummy `phc_bench`.

Setup: local `tools/build_public.py` build (no keys), the bench's own gzip server on 127.0.0.1, `--mode wired --configs none,posthog --runs 7`,
Chromium 4x CPU throttle, Slow 4G (562.5 ms RTT, 1.44 Mbps), iPhone 393x852 DPR 3 touch, fresh context per run, 12 s window + 3 taps.
(3rd-party KB is uncompressed: the stub serves posthog-js without gzip, while the CDN would gzip it. This affects transfer size only.)

## Run 1: the config on main (autocapture on, recording on, maskTextSelector "*"): bench-1-shipped.log
| config | TBT ms | INP ms | LCP ms |
|---|---|---|---|
| none | 541 | 56 | 4052 |
| posthog | 743 | 128 | 4008 |
| delta | **+202** | +72 | -44 |
Recorder started in 7/7 posthog runs.

**Decision rule** (posthog INP > 200 ms OR TBT delta > 200 ms): INP 128 ms passes, but the TBT delta of +202 ms is over 200 ms.
→ telemetry.js now ships `autocapture: false, disable_session_recording: true`. Pageview, pageleave and every stemT event stay on. The
session_recording mask options stay in place, so turning recording back on keeps the PII blanking. DNT/GPC/stem-t-off opt-out is unchanged.

## Run 2: autocapture off and recording off: bench-2-autocapture-recording-off.log
| config | TBT ms | INP ms | LCP ms |
|---|---|---|---|
| none | 534 | 40 | 4172 |
| posthog | 668 | 40 | 4240 |
| delta | **+134** | 0 | +68 |
Recorder started in 0/7 runs, and 3rd-party JS dropped from 532 KB to 324 KB (uncompressed). The log header still prints
"recording+autocapture on": that is the stubbed remote config. The client options now turn both off.

Medians of 7 runs. The none-config TBT moves about 100 ms between runs (444-665), so the +202 sits right at the threshold. The rule was applied as written.

## Tests (after the change)
```
node tests/telemetry.pw.mjs http://127.0.0.1:8813
ok   Do Not Track on + a key stamped: zero requests to PostHog / Clarity, stemT a no-op, nothing said
ok   Global Privacy Control on + a key stamped: zero requests to PostHog / Clarity, stemT a no-op, nothing said
ok   privacy.html "Don't record me" (stem-t-off) on + a key stamped: zero requests to PostHog / Clarity, stemT a no-op, nothing said
ok   no key (local / preview): zero requests, no console errors, the app works
ok   a key: libraries load only after the first question shows; app_load, q_open, pick, guess_spam, next, bail arrive
ok   footer: a real 'privacy' link to privacy.html; the page has 3 plain lines
all ok
node --test telemetry.test.mjs:  # tests 9  # pass 9  # fail 0
cd tests && npm test:            # tests 790  # pass 789  # fail 0  (1 = pre-existing TODO, STYLE.md §9 #7)
```
