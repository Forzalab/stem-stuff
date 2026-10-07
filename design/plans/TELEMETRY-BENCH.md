# Telemetry bench + dashboards (D22, D23)

Owner: T-bd. Script: `tools/bench-telemetry.mjs`. Event names, props and loaders live in `TELEMETRY.md` (T-ev).

## D22: what PostHog and Clarity cost a phone

### Method
- Build: `python3 tools/build_public.py <dir>` from this branch (T-ev's `telemetry.js` merged, WIP 05f80f5), built WITHOUT keys.
  Served by the script's own gzip static server (Vercel compresses; `python -m http.server` does not and would inflate the baseline).
- **Mode `wired` (the numbers below): the libs load the way T-ev loads them.** The bench stamps `<meta name="stem-t">`
  per config in memory (PostHog token and/or Clarity id, or empty); `telemetry.js` then loads PostHog `array.js` and the
  Clarity tag after the first screen is up, on `requestIdleCallback`. PostHog runs with the real project's remote config,
  so it pulls what prod would pull: `config.js`, `posthog-recorder.js`, `surveys.js`, `web-vitals-with-attribution.js`,
  `dead-clicks-autocapture.js`.
- Mode `snippet` (official snippets injected in `<head>`) exists for comparison; only a 1-run smoke of it was taken (below).
- Phone: Playwright Chromium (`/opt/pw-browsers/chromium-1194`), 393×852, DPR 3, touch, iOS Safari UA, service worker blocked,
  cache disabled, fresh context per run. CDP `Emulation.setCPUThrottlingRate {rate:4}`; CDP
  `Network.emulateNetworkConditions` = DevTools "Slow 4G" (562.5 ms RTT, 1.44 Mbps down, 675 kbps up, ×0.9 like Lighthouse).
  `--disable-blink-features=AutomationControlled` so PostHog does not flag the run as a bot (with `navigator.webdriver`
  it silently stops capturing, which would under-count its cost).
- Runs: 5 per config, interleaved (none, posthog, clarity, both, repeat) so machine drift hits every config.
- Metrics: **JS KB** = sum of CDP `encodedDataLength` for Script responses (bytes on the wire, all + third-party);
  **LCP** = `largest-contentful-paint` entry; **TBT** = Σ(long task − 50 ms) for long tasks after FCP, over a 20 s window
  from navigation (the libs load late, so a "to TTI" window would miss them); **INP** = max `event` timing duration of
  3 synthetic taps (Playwright `tap`) on the first visible interactive element, after the window.
- No fake traffic: every ingestion request (PostHog `/e/ /s/ /i/v0/e/ /batch /flags /decide`, Clarity `/collect` + `c.gif`)
  is aborted by `page.route`; a `page.on("request")` counter checks the browser saw nothing else. The libs, remote config
  and recorder still download. The project token is looked up in memory from `$POSTHOG_KEY` and never printed or written.
- Caveat: the container was shared with other agents' test runs (load avg ≈ 6 on 4 cores), so absolute TBT is high and
  noisy; read the deltas and the spread, not the absolutes. Chromium only: real iPhone Safari (JSC, no CPU throttle knob)
  needs real iOS (no BrowserStack creds here).

### Results (wired, 5 runs each, median (min–max))

| config | JS KB all | 3rd-party JS KB | LCP ms | INP ms (3 taps) | TBT ms (20 s window) |
|---|---|---|---|---|---|
| none | 433.2 (433.2–433.2) | 0 | 4176 (4012–4428) | 56 (40–64) | 550 (464–605) |
| posthog | 651.7 (651.7–651.9) | **218.5** (218.4–218.6) | 4340 (4004–4936) | **192** (120–200) | **1044** (788–1850) |
| clarity | 459.8 (459.8–459.8) | 26.5 (26.5–26.6) | 4432 (3912–5128) | 56 (48–88) | 690 (497–1003) |
| both | 678.4 (677.9–678.5) | 245.1 (244.7–245.3) | 4484 (4044–4760) | 160 (112–232) | 987 (743–1093) |

Deltas vs none (medians): **PostHog +218.5 KB, TBT +494 ms, INP +136 ms**, LCP +164 ms (inside the none spread).
**Clarity +26.5 KB, TBT +140 ms** (spread 497–1003 overlaps none), INP +0, LCP +256 ms (inside spread).
Both: +245.1 KB, TBT +437 ms, INP +104 ms: on top of PostHog, Clarity's marginal TBT/INP cost is lost in the noise.
LCP does not move beyond noise for any config: T-ev's "load after the first screen, on idle" works.
No-traffic check: 129 ingestion requests issued across the 20 runs, 129 aborted, 0 reached PostHog or Clarity.
Tap target (same in every run): `#upload` (the first visible button).

Snippet-in-`<head>` smoke (official snippets, 1 run each, indicative only): PostHog LCP +796 ms, TBT +576 ms;
Clarity LCP +88 ms, TBT +92 ms. Loading PostHog from `<head>` would cost ~0.8 s of LCP; keep T-ev's deferred loader.

### Where the PostHog bytes go (gzip/br on the wire, fetched with curl --compressed)
| file | KB | needed? |
|---|---|---|
| `static/array.js` (core: capture, autocapture, queue) | 102 | yes: every D21 event, the 4 dashboards |
| `posthog-recorder.js` (session replay) | 66 | overlaps Clarity replay |
| `surveys.js` | 33 | no: we run no surveys |
| `dead-clicks-autocapture.js` | 9 | overlaps our own `dead_tap` + Clarity dead clicks |
| `web-vitals-with-attribution.js` | 7 | nice-to-have (real-phone LCP/INP) |
| Clarity `tag` + `clarity.js` 0.8.70 | 26.5 total | replay + heatmaps + rage/dead clicks |

### The call

Rule (D22): drop a lib that adds >100 ms TBT or >50 KB **and** brings no unique data.

1. **PostHog: KEEP, but slim it.** It breaks both limits (+218 KB, +494 ms TBT, INP 56→192 ms, right under the
   200 ms "good" line on a 4x-throttled phone). It stays because its data is unique: every D21 event, the bail funnel and
   all 4 D23 dashboards exist only in PostHog, and its replays link to funnel steps. Cut what we do not use, in
   `telemetry.js` `posthog.init` (T-ev's file; ask below): `disable_surveys: true` (−33 KB, we run no surveys),
   `capture_dead_clicks: false` (−9 KB, our own `dead_tap` covers it). Keep the recorder (replay tied to the funnel)
   and web vitals (7 KB, real-phone LCP/INP). Expected ≈ −42 KB → ~176 KB. Still over 50 KB, accepted for unique data.
2. **Clarity: DROP.** Alone it adds +140 ms median TBT (over the 100 ms limit, though noisy), and it brings no unique
   data: replay, rage clicks and dead clicks are already covered by PostHog replay + our `rage_tap` / `dead_tap` events,
   and two replay engines means recording every DOM mutation twice on her phone. Cheap in bytes (26.5 KB), so if Tony
   wants Clarity's free, unlimited replays instead of PostHog's monthly replay quota, swap rather than stack: keep
   Clarity, set PostHog `disable_session_recording: true` (−66 KB recorder). One replay engine, never two.
3. **Follow-up bench** (one command once T-ev applies the init flags):
   `node tools/bench-telemetry.mjs <build> --mode wired --configs none,posthog` and check INP stays ≤ 200 ms.
   If it does not, the next lever is `autocapture: false` (our D21 events do not need it; it costs the heatmap).

Ask for T-ev (owns `telemetry.js`): add `disable_surveys: true, capture_dead_clicks: false` to `posthog.init`, and
remove `loadClarity()` (or keep it behind the swap above if Tony prefers Clarity replay).

## D23: PostHog dashboards (project 650708, built via API)

Dashboard: **[Telemetry D23: bail, spam, taps, read-vs-skip](https://us.posthog.com/project/650708/dashboard/2181319)**.
All 4 insights were created (HTTP 201) and their queries run clean (HTTP 200) against the project; they stay empty
until `telemetry.js` ships with keys and events flow (`viz_*` events are defined but not wired yet).

| # | insight | what it is |
|---|---|---|
| 1 | [Bail funnel](https://us.posthog.com/project/650708/insights/HIvh26NB) | Funnel, ordered, 30-min window: `q_open` → `pick` → `pick` where `right=false` → `cluck_open` → `viz_touch` → `next`. |
| 2 | [Guess-spam rate by hour](https://us.posthog.com/project/650708/insights/5vamFHnd) | Trends, hourly, last 7 d: formula `guess_spam / pick × 100`. |
| 3 | [Rage + dead taps by element](https://us.posthog.com/project/650708/insights/HKYWwqGQ) | Trends bar (total), last 30 d: `rage_tap` and `dead_tap` broken down by event prop `el` (top 25). |
| 4 | [Read vs skip](https://us.posthog.com/project/650708/insights/erOCPppE) | HogQL table per day: `cluck_dwell` joined to `cluck_stream` on session + `code`; READ = dwell ≥ 16 ms per streamed char (≈3× faster than 250 wpm, i.e. skimming at best); columns read %, median dwell ms, median chars, ms/char, avg scrolled %, `viz_skip / viz_view` %. |

Rebuild: the request bodies are plain PostHog `query` JSON (FunnelsQuery, TrendsQuery ×2, HogQLQuery) posted to
`/api/projects/650708/insights/` with `"dashboards": [2181319]`; if an event prop is renamed in `TELEMETRY.md`
(`right`, `el`, `ms`, `chars`, `scrolled_pct`, `code`), edit the insight in the UI or re-post.
