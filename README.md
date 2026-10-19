# stem-stuff

> **Render standard = the OpenUI Lang plan.** Runbook: brain `projects/calc/_files/sprint-render-v2/SPRINT.md` (plan: `projects/calc/topics/openui-render-arch-plan-2026-10-18.md`). No new view/widget format.

A code-gated STEM drill site (CALC1 / PHYS / CSCI26). It's a static page plus a small Python server, `serve.py`.

- **Problems: one file, `problems.json`.** Every problem, answer, wrong answer and hint. Format: `SCHEMA.md` (the only schema).
  - Server: `serve.py` reads it, sends the browser only the public part of the problem whose code was typed (`GET /p/<CODE>.json`) and grades on `POST /check`. Edit or replace the file: live on the next request.
  - Upload: the page's upload button (or the picker when the server is down) takes one `problems.json` and loads every problem in it.
- **Practice banks: `banks/BANK_XXX.json`** (same format). Type `BANK_XXX` in the code box: its questions become the list, and the server keeps each browser's progress and place (design/BANK.md). Ships empty.
- **Open a certain bank (how-to):**
  1. Name the file `BANK_` + 3–6 capital letters or digits, e.g. `BANK_CE3.json`. Any other name is skipped (the server prints one line saying so). `ce3-traps.json` → rename to `BANK_CE3.json`.
  2. Put it in `banks/` next to `serve.py` on the server (with deploy.sh: `~/stem-stuff-site/banks/`). No restart: it's live on the next request.
  3. A person opens it either way:
     - types `BANK_CE3` in the code box (`bank ce3` works too), or
     - opens the link `http://<host>:<port>/#BANK_CE3` (e.g. `http://csci4x.com:5567/#BANK_CE3`).
  4. The list button then reads `BANK_CE3`. The server remembers each browser's progress and last question (cookie), so next visit reopens the same bank where they left off.
  - Answers stay on the server: `/banks/` is never served. Uploading a file instead (⬆ button) switches that browser to the file until they open a bank again.
- Server needs Python 3 + sympy (`deploy.sh` installs sympy if missing).
- Tests: `tests/run-all.sh` runs everything (unittest, `npm test`, every `tests/*.pw.mjs` with its server) and exits 1 on any failure; `SHARD=1/2` / `SHARD=2/2` (or `--shard N/2`) runs one half so the two can run at the same time (CI does), `--list` prints what a run would run; `--quick` = unittest + npm test (~10 s; as a pre-push hook: `printf '#!/bin/sh\ntests/run-all.sh --quick\n' > .git/hooks/pre-push && chmod +x .git/hooks/pre-push`). GitHub Actions runs the full set as two parallel shards (plus a required `all` check that needs both) on every PR (`.github/workflows/tests.yml`). First time: `cd tests && npm ci`.
- Deploy: `./deploy.sh [dir] [port] [branch]` (defaults `~/stem-stuff-site`, 5567, main). Fresh → clone + serve. Existing install → shows incoming commits, asks "update the live site now? [Y/n]". Every run force-stops the old server (pid file, then anything still on the port) and starts a new one. Non-empty other dir → Exit (default) / wipe + install (type folder name to confirm).
- Deploy on Vercel (HTTPS, so `sw.js` runs and the site works offline after one visit):
  1. One time: `npm i -g vercel`, `vercel login`, `vercel link` in the repo. In the Vercel project: Storage → add Upstash Redis (sets `KV_REST_API_URL` / `KV_REST_API_TOKEN`; tries live there, key `stem:tries`). Domains → add `csci4x.com`, set the DNS records it shows. Leave Git auto-deploy off.
  2. Every deploy, one command from a checkout that has `banks/`: `tools/ship.sh demo` (prints a private preview URL) → check → `tools/ship.sh live`. It deploys origin/main plus your banks, never your working tree. Banks come from the brain first (newest commit wins; a stale copy in your checkout never beats it): a local brain clone, else the bank hatch (GitLab API, bank files only, `BRAIN_TOKEN` with read_api in `.env`; `.env.example`). `--print-banks` shows which, `--no-brain` skips; design/DEPLOY.md. A demo you liked → Vercel dashboard → Deployments → ⋯ → Promote (no rebuild).
  - `vercel.json` builds `public/` with `tools/build_public.py` (the client only) and sends `/p/`, `/state/`, `/b/`, `/check` to `api/index.py`, which bundles `serve.py`, `problems.json` and `banks/`. Answers never reach static files.
  - Retire the old server: `STEM_REDIRECT=https://stem-stuff.vercel.app ./deploy.sh` (same dir/port). It then sends every request there (302; POST /check 307), keeping the path and the `#CODE`. Run `./deploy.sh` without it to bring the old site back.
  - A bank or `problems.json` change is a redeploy (no hot reload). Reset a browser's tries: edit the `stem:tries` key in the Upstash console. The first check after idle is ~1–2 s slower (sympy loads).

## Anthropic spend

An hourly GitHub Actions job (`.github/workflows/spend.yml` → `tools/anthropic_spend.py`) reads the Anthropic Admin API cost report and writes one KV key, `stem:anthropic:spend` = `{"cents_month", "cents_since", "since", "at", "ok": true}` (USD cents; month = current UTC calendar month). A failed run writes `stem:anthropic:spend_err` = `{"ok": false, "err", "at"}` instead and leaves the last good value alone (the err key is deleted on the next good run). The app estimates the balance as `PREPAID_CENTS − cents_since`.

**The Admin API key must NEVER go into Vercel** (or `.env`, or any file in the repo). It can read and manage the whole organization; it lives only in GitHub Actions secrets. The app only ever reads the KV key.

One-time setup (Tony):
1. Claude Console → Settings → Admin keys → create an Admin API key (`sk-ant-admin01-…`; org admins only).
2. GitHub → this repo → Settings → Secrets and variables → Actions:
   - Secrets: `ANTHROPIC_ADMIN_KEY` (step 1), `KV_REST_API_URL` and `KV_REST_API_TOKEN` (same values as the Vercel project's Upstash env vars).
   - Variable (or secret): `SPEND_SINCE` = the date the prepaid credit was bought, `YYYY-MM-DD` (unset = 1st of this month).
3. Vercel project → Settings → Environment Variables: `PREPAID_CENTS` = credit bought on `SPEND_SINCE`, in cents (e.g. `5000` for $50). Not the Admin key.
4. Actions → anthropic-spend → Run workflow once to check it goes green. Local check without writing KV: `ANTHROPIC_ADMIN_KEY=… tools/anthropic_spend.py --dry-run`.
