# Test tiers plan: smoke / sanity / regression

Owner-approved Tue Oct 6 2026 ~13:40 PT. Build job for the main session (~14:00 PT). Merge only AFTER the 16:30 PT student ship of #85 + #86. When built, fold this into design/TESTING.md and delete this file.

## Why
CI = one job running 24 `.pw.mjs` scripts one after another, ~10.5 min per push; 21/24 hard-code `chromium.launch`. Agents re-run big chunks locally. Goal: tiers by change type, WebKit (Safari) first, then Chromium, Firefox in regression, enforced by tooling.

## The spec (goes into design/TESTING.md, replaces "How")
| tier | trigger | runs | browsers | budget |
|---|---|---|---|---|
| smoke | every push + every PR | `--quick` (unittest + npm) + `smoke.pw.mjs` | WebKit | ≤ 90 s |
| sanity | every PR | scripts mapped to changed files + Impeccable on changed pages (4 viewports) | WebKit, then Chromium | ≤ 4 min |
| regression | push to main, nightly, PR label `full`/`refactor` | every script | WebKit + Chromium + Firefox (Firefox non-blocking for 1 week, then blocking) | ≤ 5 min wall (sharded) |

By change type (PR label, CI checks the label exists): `fix` → smoke + sanity (PR must add/modify a test that fails on base, stated in PR body) · `feat` → smoke + sanity + Impeccable · `refactor` → smoke + full regression + Impeccable new findings = 0.

`smoke.pw.mjs` (new): boot app, load one bank, answer one question right + one wrong, open Cluck sheet, open question list; asserts zero console errors, zero `.katex-error`, no horizontal scroll at 390×844 and 1366×768.

## Build (files)
1. `tests/lib/browser.mjs` — `launch()` picks `process.env.BROWSER` (webkit|chromium|firefox, default chromium), same fallback paths as today. Codemod the 21 scripts: `chromium.launch(` → `launch(` (+ import). Scripts already using webkit/firefox (autosave, redo, reload, render) keep their explicit picks.
2. `tests/manifest.json` — every `.pw.mjs` → `{tier, areas:[globs]}` (e.g. `nav-stable` → `nav.js, nav.css`; `rewards` → `rewards.js, rewards/**`). `smoke` tier = smoke.pw only.
3. `tests/run.mjs` (Node, replaces the loop in run-all.sh; run-all.sh becomes a thin wrapper so old docs still work): flags `--tier smoke|sanity|regression`, `--browser`, `--changed <base>` (git diff → manifest areas → scripts), `--shard i/n`, `--jobs N` (parallel scripts; each already gets a free port / own server). Same green rule: exit 0 AND no FAIL line.
4. Enforcement:
   - `tests/check-manifest.mjs` (in `npm test`): fails if any `.pw.mjs` is missing from the manifest, or a manifest entry points at nothing; warns when a changed source file maps to no script.
   - CI `pr-rules` job: fails if the PR has none of `fix|feat|refactor|docs|try` labels; `refactor`/`full` forces regression.
   - Impeccable job: `tools/impeccable.sh` (rides #87) on pages changed in the PR, 4 viewports; baseline file `tests/impeccable-baseline.json`; fails if findings count goes UP (pre-existing don't block).
   - Agent rule in CLAUDE.md + brain RULES: run `node tests/run.mjs --tier sanity --changed origin/main --browser webkit` locally, never the full suite unless refactor.
5. `.github/workflows/tests.yml` → jobs: `smoke` (webkit) → `sanity` (matrix webkit, chromium; needs smoke) → `regression` (matrix 3 browsers × 4 shards, only on main/nightly/label; firefox `continue-on-error: true` for 1 week). Cache Playwright browsers keyed by version. Nightly cron 09:47 UTC-ish.
6. DigitalOcean (phase 2, Tony's ops, optional): one droplet (4 vCPU/8 GB ≈ $48/mo; destroy when idle) as a self-hosted GitHub runner with browsers preinstalled, label `do-fast`; regression jobs `runs-on: [self-hosted, do-fast]` with GitHub-hosted fallback. Safety: only for pushes to main + same-repo PRs, never forks. Steps go in design/TESTING.md; Tony creates droplet + pastes the runner token.

