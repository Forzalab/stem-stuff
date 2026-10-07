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

TABLE

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

CALL

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
