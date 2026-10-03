# Testing: how it runs, why, and the paths already walked

Decided Oct 3, 2026 (PR #44). Goal (Tony): stop paying an LLM to run suites and grep "FAIL"; machines check, Claude writes new
tests and root-causes red ones.

## How
- `tests/run-all.sh` = the one verdict. unittest → `npm test` → `serve.py` on a free port → every `tests/*.pw.mjs`
  (bank / choose-all / done take a port and start their own server; the rest take the base URL). Exit 0 = `ALL GREEN`.
  `--quick` = unittest + npm (~10 s, the pre-push set).
- A suite is green only if it exits 0 **and** prints no `FAIL` line: older `.pw` scripts printed FAIL and still exited 0.
  New `.pw` scripts must end with `process.exit(failures ? 1 : 0)` (or throw on a bare `assert`).
- `.github/workflows/tests.yml` runs the full set on every PR and every push to main.
- `tools/ship.sh` smoke-tests each deploy (5 checks through `vercel curl`) and exits 1 on red.

## Rules
- Run `tests/run-all.sh` instead of hand-running suites. Read its FAIL lines; open the log it names only if they are not enough.
- A red test is never re-run until green. One re-run is allowed only to confirm a suspected environment cause; a second red is
  real. Never skip, disable or loosen a test to get green.
- A test that encodes a behaviour Tony changed on purpose is updated, with old → new in the PR (e.g. flow.pw's Scratchpad
  button "off the answer controls after a scroll" → "where it reappears", Oct 3).

## Assumptions (check these first when something odd happens)
- Local tests use Chromium from `/opt/pw-browsers` and `require("/opt/node22/lib/node_modules/playwright")` as fallback;
  `tests/package.json` pins only `playwright-core`. CI installs `playwright` at the same version (`npm i --no-save`) plus
  Chromium with `--with-deps` (Ubuntu fonts differ from the container's).
- `STEM_TRIES` points at a temp file in every run: tests never touch the real `tries.json`.
- Server-mode problems paint the cached record first (`load()` → `paint(rec)`), then `syncServer()` reconciles with `/state`
  asynchronously. A test that reopens a problem an earlier step locked can see the old state for a moment.

## Paths already walked (do not repeat)
- **Dead gap at the bottom of a phone problem page** (Oct 3): three reservations stacked: `main` padding-bottom (dock 44 + 24), `html.fab-on main::after`
  (88, room for the Scratchpad button) and `.freeze` padding (12) = 168 above the page end, i.e. 124px between the last control and the bar. Rule kept:
  ONE reservation, `html.fab-on main { padding-bottom: dock-h + 56px + s4 }` (no `::after`), gap now 84px. `fab.pw` asserts gap <= 90 and no overlap.
- **Bounce at the end of scroll** (Oct 3): researched and mocked (design/BOUNCE.md), Tony: "doesn't work, KISS" → bottom
  padding in the pad page's boxes instead.
- **CI-only reds on the first GitHub run (Oct 3, PR #44 @67bbea8)**: `disabled.pw` "390 mc: correct" (`reading 'click'` of
  undefined: fewer enabled options than expected) and `render.pw` phone "Cut and Copy not both inside the textarea box".
  Both pass locally every time. Tried: CPU throttling ×8 via CDP on both → still green, so plain slowness is NOT the cause.
  The next run (same code rebased, @d5424d1) was all green → intermittent, not fonts. Made robust instead of re-running:
  `disabled.pw` pickMC waits until option i is enabled (the reconcile race); `render.pw` padPage waits for every animation to
  finish before measuring (the crossfade). If either goes red again, the cause is elsewhere: look at fonts next.
- **Exit codes through a pipe** (Oct 3): `cmd | tail -1 && git push` pushed a red test (`tail` exits 0). Judge a command by its
  own exit code: `set -o pipefail`, or `${PIPESTATUS[0]}`, never by the last command of a pipe.
- **Brain banks by shallow git clone** (#45): replaced by the GitLab-API bank hatch (`tools/brain_banks.py`): Tony's phone has no
  brain clone and the brain is heavy. The hatch is tested against a local fake GitLab API in `tests/test_ship.py` (`Stub`).
- Polling Vercel build state from Claude: banned (Tony). `ship.sh` may wait (`vercel inspect --wait`) because it is a script.
- `vercel curl`: everything after `--` goes to curl, so global flags (`--scope`) must come before the subcommand and the token
  comes from `$VERCEL_TOKEN`, never `--token`.
