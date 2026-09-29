# Reload / idle: dead buttons (Tony's Firefox bug)

Report: after Firefox relaunches (session restore) or a tab sits idle, the page's buttons do nothing.
No repro on Tony's machine yet, so every cause below was tested here (headless Chromium; no Firefox in /opt/pw-browsers).

## Hypotheses and what the tests showed

| # | Hypothesis | Test | Result |
|---|---|---|---|
| H1 | **A fetch that never settles.** `submitFF` sets `busy = true` and clears it in `finally`. `fetch("check")` had no timeout. A request that hangs (a keep-alive socket the OS or server dropped while idle, Firefox reusing it after relaunch, a captive network, a bfcache freeze mid-request) keeps `busy` true forever, so the submit arrow and Enter silently do nothing. | Playwright route that never answers the first `/check`, then type a new answer and press the arrow again. | **Confirmed.** 1 request total, the second press did nothing, `#fb` stayed empty. `load()` has the same shape: a stalled `p/<CODE>.json` leaves the page blank with no message. |
| H2 | **Uploaded bank lost on reload.** offline.js keeps the uploaded problems.json in memory only. Session restore reloads the page with `#CODE` of an uploaded problem; the server does not have it. | Upload a one-problem file, `page.reload()`. | **Confirmed.** After reload: `No problem CALC1_ZZ9.`, no "File x in use.", problem hidden, question nav hidden. The upload button still works, but everything else Tony was using is gone: reads as "dead". |
| H3 | **bfcache restore with stale state.** Firefox keeps pages in bfcache far more than Chromium. On `pageshow` with `persisted`, JS resumes where it froze: an in-flight request that the network layer dropped may never settle (H1 again), and the layout (`--vv-h`, dock/keyboard classes, Swap) is from the old viewport. | `pageshow` with `persisted: true` dispatched by hand after putting the page in the H1 state. | Before the fix nothing listens for `pageshow`, so state stays stuck. Fix covered by test (b). |
| H4 | **Service worker.** sw.js serves the shell cache-first and problems network-first. A stale shell could mix old and new JS. | Read sw.js: registered only on https or localhost; Tony's site is plain http on :5567, so no SW runs there. | **Ruled out** for the live site. Its problem fetch now has the same 8 s timeout so it can't hang later on https. |
| H5 | **Layout state** (dock-away, swap, bar-off stuck after the keyboard vanished while the tab was hidden) covers or hides controls. | Reasoned from `layoutDock()`: it only reruns on resize/focus/scroll; a hidden tab gets none. | Possible, cheap to rule out: layout reruns on `pageshow` and `visibilitychange`. |

**Best guess for Tony's case:** H2 (restore reloads the page, uploaded bank gone) plus H1 (first request after relaunch/idle goes out on a dead connection and never settles, leaving `busy` stuck). Both confirmed here; which one Tony hit is unconfirmed without Firefox.

## Design

1. **Bank in IndexedDB** (offline.js). Every successful upload writes `{ name, text }` of each parsed file to IDB `stem-stuff` / store `bank`, key `files` (last upload replaces the list). On start, and on `pageshow` persisted when the in-memory store is empty, the files are read back through the same `ingest()`. `stemOffline.ready` is a promise that settles once restore is done (or failed: private mode, blocked storage); app.js waits for it before opening `#CODE`, so a restored bank answers the fetch and `File x in use.` comes back.
2. **8 s timeout on every fetch.** app.js `net(url, init)` wraps `fetch` with an `AbortController` (8 s) and records each in-flight request. offline.js `loadProblem` and sw.js's problem route use the same timeout. On a timeout:
   - grading: `check()` returns `{ verdict: "timeout" }`; feedback shows one line and a retry `.btn` (icon only, `aria-label="Try again"`). The answer is not recorded; the selection and typed text stay; retry resubmits.
   - loading: the entry message says it timed out and a retry `.btn` appears in the entry row; it reruns `load(code)`.
   A plain network error keeps today's behaviour (`pending` for grading, the offline picker for problems).
3. **Resume** (`pageshow` persisted, `visibilitychange` to visible): abort requests older than 8 s (background timers are throttled, so the timeout may not have fired), clear `busy`, re-enable the controls that should be live (arrow enabled when every box is filled and the problem isn't finished; the selected choice's arrow shown), drop Swap / dock-away / bar-off unless a field still has focus, and rerun `layoutDock` / `layoutFreeze` / `fitChoices`. On `pageshow` persisted also restore the bank if it is missing.

Tests: `tests/reload.pw.mjs` (needs a server, like render.pw.mjs): (a) upload, close the context, reopen with the same storage state + IndexedDB → bank restored, status line back, submit works; (b) stall a request, dispatch `pageshow` persisted → submit works; (c) route that never answers → timeout at 8 s → retry works.

## Results (Chromium; Firefox is not installed in /opt/pw-browsers, so reload.pw.mjs prints "skip firefox")

- `tests/reload.pw.mjs`: (a) bank restored after closing and reopening a persistent profile, "File mine.json in use." back, nav back, submit grades, Next works; (b) stalled request + `pageshow` persisted: submit sends again and grades; (c) stalled `/check` shows the retry line at ~8 s, the typed answer is kept, no try counted, retry grades; (c2) stalled problem load: message + retry in the entry row, retry opens it.
- `render.pw.mjs` now clears the IndexedDB bank on every page load (its steps assume a fresh page has no upload) and ignores hidden children of `#entry`. All pass; `swap.pw.mjs` all pass; `npm test` 80/80.
- `npm run e2e` test 2 ("server down -> file picker") times out at 30 s; it does the same on the base commit, so it is older than this change.
- Impeccable: 0 findings static (index.html, app.css, nav.css) and live at 390x844 and 1920x1080.
