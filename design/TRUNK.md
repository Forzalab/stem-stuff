# Trunk-style development

Decided Oct 3, 2026 (Tony: "prune all stale branches … trunk style dev. how?"). There were 43 branches besides main, 35 of them
already merged.

## The rules
- `main` is the trunk and is always deployable. `tests/run-all.sh` is green on it.
- Every change = one short-lived branch → PR → CI `tests / all` green → merge the same day → the branch is deleted.
- One change per branch. Never add commits to a branch whose PR is merged; check the PR state first (#35 lost its redirect
  code that way). Never reuse a merged branch: start again from `origin/main`.
- Branch names: `fix/…`, `feat/…`, `docs/…` (Claude sessions keep their assigned `ccr-…` names).
- Merge or rebase `origin/main` into the branch right before opening the PR, so CI tests what will land.

## The machinery
- **`tools/prune-branches.sh`** in `.github/workflows/prune.yml` (Mondays, or Actions → prune-branches → Run workflow; `dry_run`
  lists only). It deletes branches merged into main, and unmerged ones with no commit for `max_age_days` (default 7). It keeps
  main, branches with an open PR, and branches with a commit in the last 24 h (a live session). Every deleted tip is first pushed
  as tag `archive/<branch>`. Restore: `git push origin refs/tags/archive/<b>:refs/heads/<b>`.
- Why a workflow: a Claude cloud session can push only its own branch (HTTP 403 on tags and on deleting other branches, Oct 3),
  so the cleanup runs with the repo's own token.
- **Tony's two one-time GitHub clicks:**
  1. Settings → General → Pull Requests → ✅ **Automatically delete head branches**. Merged branches then vanish on their own;
     the weekly prune only catches the rest.
  2. Settings → Rules → Rulesets (or Branches) → `main` → **Require status checks to pass: `all`** (the tests workflow). That
     blocks red merges (#45 went in red, then needed a revert).
- The nightly brain dream also reports stale branches (brain `_files/DREAM.md`, step 4), report only.

## First prune (Oct 3)
Run the workflow once by hand with `max_age_days = 1` to clear the backlog. The old unmerged branches it archives, in case one
is wanted back:
- `ccr-57839188-84wp4i`: deploy.sh default install dir = the script's folder (Sep 30);
- `claude/psy-ch6-bank`: an MC lock-in commit (Oct 2);
- `revert-28-claude/psy-ch6-bank`: a revert branch;
- `alt/reload`: already in main by content.
