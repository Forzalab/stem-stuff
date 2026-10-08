# Telemetry (PR C, D20–D24, D69)

PostHog (events + session replay) and Microsoft Clarity (heatmaps + replay). One file: `telemetry.js`. One entry point:
`window.stemT(name, props)`; app.js calls it as `window.stemT?.(...)`, one line per hook. It never throws and never blocks.

## Key flow
1. Vercel Production env holds `POSTHOG_TOKEN` (phc_, public by design), `CLARITY_ID` (stamped only with `CLARITY=1`), optional `POSTHOG_HOST`
   (default `https://us.i.posthog.com`). Vercel runs `python3 tools/build_public.py` with that env.
2. `build_public.stamp_telemetry()` writes them into `public/index.html`:
   `<meta name="stem-t" content="phc_…" data-host="…" data-clarity="…">`. Values are pattern-checked; nothing is committed.
3. No env (local `serve.py`, preview deploys, the offline download) → the meta stays `content=""` → `telemetry.js` returns at
   once: `stemT` stays a no-op, zero requests, no console output.

**Decision (D22 bench, T-bd):** Clarity is OFF (>100 ms TBT, no unique data: PostHog replay + rage_tap/dead_tap cover it). Kept behind a build flag: Vercel env `CLARITY=1` stamps `CLARITY_ID` again. PostHog runs with `disable_surveys: true, capture_dead_clicks: false` (−42 KB).

## Gates (silent: nothing is ever shown or said)
- `navigator.doNotTrack === "1"` (or `window.doNotTrack`, `msDoNotTrack`) or `navigator.globalPrivacyControl` → load NOTHING,
  queue nothing. PostHog also gets `respect_dnt: true`.
- `localStorage["stem-t-off"] === "1"` → the same: nothing loads. Set by privacy.html "Don't record me" (a second tap undoes
  it). This is the real opt-out: DNT/GPC never fire on iOS Safari.
- Recorded unmasked (D20/D24) EXCEPT e-mail and phone-number shapes: PostHog `mask_all_text:false`,
  `mask_all_element_attributes:false`; session replay `maskAllInputs:true` + `maskTextSelector:"*"` route every input and text
  node through `maskInputFn` / `maskTextFn` = `blankPII()`, which stars out only these two shapes and returns the rest
  unchanged (rrweb calls the mask functions on "masked" nodes only, hence "mask all, blank little"). Covers #scratch, Cluck's
  ask field and the thread that echoes it. `persistence: "localStorage"` (no PostHog cookie riding every /check).
- PII regexes (JS; reuse server-side in serve.py, Python `re` takes them as-is):
  - e-mail: `[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}`
  - phone: `(?:\+?\d{1,3}[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}(?!\d)`
  - kept intact (tested): `9.81 m/s`, `1234567 N`, `2.0e8 m`, `80 J`. Blanked: `559-555-1234`, `(559) 555 1234`, `5595551234`.
- posthog-js drops events from automation (`navigator.webdriver`, Headless UA). Real users are unaffected; a live test must
  spoof both (see `tests/telemetry.pw.mjs` header).

## Timing
`telemetry.js` (≈4 KB, same origin, `defer`, before app.js so `stemT` exists) only sets up listeners + a queue. The libraries
load after `window.stemFirst` (the first question painted) + `load` + `requestIdleCallback` (timeout 3 s; Safari without rIC:
1.2 s timer); a 15 s fallback if the app never signals. Events before that wait in a queue (≤200) and replay with their
original timestamps. A bail before the libraries load goes out as ONE raw `sendBeacon` to `<host>/batch/` (text/plain JSON).
Same anonymous id both ways: `localStorage["stem-tid"]` → PostHog `bootstrap.distinctID`.

sw.js: cross-origin hosts that are not the KaTeX CDN route to "pass" (never cached, never intercepted), so PostHog/Clarity
requests go straight to the network; offline they just fail quietly. `telemetry.js` itself is same-origin `.js` → shell cache,
like every other script. `privacy.html` is "pass" (needs the network). No sw.js change needed.

## Events — wired

| event | props | where |
|---|---|---|
| `app_load` | ms_to_first_q, nav_type, restored_progress (had `stem-src`/`stem-codes` before boot), s (`?s=` share channel), display_mode (standalone/browser), prefers_color_scheme, has_code | telemetry.js, when `stemFirst` resolves |
| `q_open` | code, bank, type | app.js `load()` after `render()` |
| `pick` | code, choice, part, right, verdict, tries_left, ms_since_open (since q_open), sure (null until the bet, D52) | app.js `record()` (MC, pick-all, typed, parts) |
| `guess_spam` | code, why (`fast` = pick <2 s after open, `burst` = 3rd pick in 10 s), ms_since_open, picks_10s | telemetry.js, on a graded pick |
| `cluck_open` | tab, auto, code | app.js `clOpen()` |
| `cluck_stream` | code, chars, failed, auto, first_token_ms | app.js `wishStart()` end; `_ask` / `_tok` marks (not sent) time the first chunk |
| `cluck_dwell` | ms, scrolled_pct, code | app.js `clClose()`; also on bail while open. Scroll measured on `#cluck .cl-bd` |
| `tab_away` | during (stream/question/start), stage, code | telemetry.js, `visibilitychange` → hidden / `pagehide` |
| `rage_tap` | el, stage, code | telemetry.js: ≥3 taps in 700 ms within 30 px |
| `dead_tap` | el, code | telemetry.js: tap on `.fig .katex .md .pcode .ptitle .chg-chip` not inside a control |
| `bail` | stage (start/open/wrong/right/cluck/next), via (hidden/pagehide), ms_on_page, code | telemetry.js, `transport: sendBeacon` + `send_instantly`; raw beacon if not loaded |
| `next` | code | telemetry.js, click on `#qnext` (capture; nav.js untouched) |

Plus PostHog autocapture, `$pageview`, `$pageleave`, session replay; Clarity replay + heatmaps.

## Events — defined, NOT wired (no prod surface yet; V / U / Q wire them)

| event | props | owner |
|---|---|---|
| `viz_view` | code, scene_id, variant, ms_visible | V |
| `viz_touch` | code, scene_id, handle, ms_since_view, value | V |
| `viz_skip` | code, scene_id, via (tellme/next/scroll), ms_visible, skips_in_row | V |
| `tellme_on` | on (bool), via (auto_3_skips/link); pref key `localStorage["stem-tellme"]` = "1"/"0" (D18) | V |
| `bet_place` | code, stake (1/2), sure | U |
| `bet_result` | code, stake, right, delta | U |
| `redeem_show` / `redeem_win` / `redeem_miss` | code, bank, gap_idx, bonus (fixed +3) | Q |

## Footer
`index.html`: `<a id="privacy" href="privacy.html">privacy</a>` left of the dev tag (#ver), same quiet style. Under Cluck's
text: "verify b4 use lol, and pls no private shit in it xoxo" (Tony, Oct 7) (CSS `::after`, so no text check moves). The link is a 44 px target and is
hidden on phones while a question is open (the bottom belongs to the bar, the notes button and Swap; swap.pw audits it); it
shows on the start page and on desktop. `privacy.html`: what is recorded, why, contact (3 lines) + "Don't record me".

## Tests
`tests/telemetry.test.mjs` (pure helpers: gates, config parsing, guess-spam, rage), `tests/telemetry.pw.mjs` (DNT, GPC,
no key → zero requests to posthog/clarity hosts; a faked key → libraries only after the first question, events + props, bail
via sendBeacon; footer link).

## Bench + dashboards (D22/D23)
Agent T-bd: `tools/bench-telemetry.mjs`, results and insight URLs go below this line.
