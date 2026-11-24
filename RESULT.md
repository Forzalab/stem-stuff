# RESULT: BUG-SHIP-ORDER (live must never go backward)

Live went 88b4864 (#731) -> 8c9ec33 (#729, an ancestor) on 2026-11-24 01:35Z.
Two paths could do that; both are closed.

## What changed

- `tools/operations/ship-order.sh` (new, one helper, `--selftest`)
  `<target_sha> <live_sha>`: exit 0 = deploy ok; exit 3 = target is a STRICT ancestor of live (prints `::notice::`).
  Empty/unknown/out-of-history live (and an unresolvable target) = fail open (exit 0) and print why. Uses `git merge-base --is-ancestor`.
  Equal = ok (the caller's "already live" no-op path handles it).
- `.github/workflows/ship.yml` `ship` job
  New step `live order (never go backward)` right before `tools/build_and_ship/ship.sh`, for every live run (auto or manual), after
  the gate. Reads live `version.json` with the same curl as the "auto-ship already live" step, calls the helper with `origin/main`
  (`steps.sha.outputs.sha`). Exit 3 -> `order.refuse=true` -> `ship.sh` skipped, job green with the helper's notice. Demo mode never
  runs the step. The job's `skip` output is `gate.skip || order.refuse`, so `lkg-after-ship` cannot move the lkg tag for a deploy that
  never happened.
- `.github/workflows/ship.yml` `rollback` job
  New optional input `bad` (the red run's head sha). After `deploys.json` is fetched, if `bad` is set the helper is called with
  `bad` vs the newest READY production deploy sha (`deploys[0].sha`, the same `cur` that `planRollback` treats as prod). Strict
  descendant -> `::notice::`, `action=none`, step exits 0 (green; every rollback/redeploy/smoke step is gated on `action`). Manual
  rollback without `bad` (and the smoke-rollback dispatch) = unchanged. `smoke-rollback` still dispatches without `bad`.
- `.github/workflows/tests.yml` `postdeploy`
  The rollback dispatch now also passes `-f bad="${{ github.event.workflow_run.head_sha || github.sha }}"` (one line + one why
  comment). `postdeploy` only runs on `push`, so this resolves to `github.sha`, the red run's head.

No change to `tools/operations/ci-ship.mjs`: the guard runs before `rollback-plan`, and `planRollback` is documented pure (no git),
so the ancestry call stays in the one shell helper instead of adding git to that file.

No new regression tests (repo rule); `--selftest` is the only test, as the brief says.

## Proof command

```
$ bash tools/operations/ship-order.sh --selftest
PASS newer ok
PASS equal ok
PASS older refused
PASS empty live ok
PASS unknown live ok
PASS live outside history ok
ship-order selftest: ok
exit 0
```

Manual on the real repo: `HEAD~1 HEAD` -> `::notice:: ship-order: refusing ...` exit 3; `HEAD HEAD~1` -> exit 0; `HEAD ""` -> exit 0.
Rollback-guard cases (bad=ancestor of live -> SKIP; bad=live -> PROCEED; no bad -> PROCEED; live sha null -> PROCEED).

## Other checks run

- `python3 tools/repo_checks/codemap.py map` -> PASS (the new file sits under the `tools/operations/` folder row).
- `node --test tests/ci-ship.test.mjs` -> 15 pass, 0 fail (it reads ship.yml/tests.yml).
- `python3 -m unittest tests.test_ship.Workflow tests.test_ship_remote.Workflow` -> 2 tests OK.
- `python3 -c "yaml.safe_load(...)"` on ship.yml + tests.yml -> parses; `bash -n` on the new script and on the three changed `run:`
  blocks -> ok.

## Unsure / judgment calls

1. Rollback "live sha" source: `deploys[0].sha` (newest READY production deploy, `meta.shipSha`) from the `deploys.json` the plan
   already fetches, not a second `version.json` curl. It is the same deployment `planRollback` calls `cur`.
2. The ship-job order check is skipped when the gate skipped or "auto-ship: already live" (nothing would be deployed anyway).
3. Setting the job `skip` output on refusal was not in the brief; without it `lkg-after-ship` would tag the un-deployed target as lkg.
4. `version.json` carries a SHORT sha (`version.sh --stamp` uses `rev-parse --short`); the helper resolves it with git, and an
   ambiguous/unknown short sha fails open by design.
5. `smoke-rollback` (prod smoke red) has no `bad` and keeps its old, unrestricted rollback: it is not the red-test path.
