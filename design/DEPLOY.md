# Deploy: Vercel (decisions)

Decided Oct 3, 2026 (PR #34). How to deploy: README, "Deploy on Vercel".

## Why
- Offline needs the service worker. `offline.js` registers `sw.js` only in a secure context (HTTPS or localhost). `http://csci4x.com:5567` is not one.
- Two roads were weighed: DigitalOcean (same `serve.py` behind Caddy for HTTPS) or Vercel. Tony picked Vercel: no server to run, HTTPS and a CDN for free.

## Shape
- One API in `serve.dispatch()`. `serve.py` (local / `deploy.sh`) and `api/index.py` (Vercel, WSGI) both call it.
- Static files: `tools/build_public.py` copies the client only into `public/`. Answers (`problems.json`, `banks/`), tries and server code reach the function bundle only (`vercel.json` `includeFiles`). `tests/test_vercel.py` checks it.
- Tries: Upstash Redis key `stem:tries` (one JSON blob, read every request) when `KV_REST_API_URL` + `KV_REST_API_TOKEN` are set. Otherwise `tries.json` as before. A failed KV read never saves over the blob.
- `core.py` split dropped: tests assign `serve.TRIES` / `serve.BANKS`, so the logic stays in `serve.py`.

## Rules
- Banks stay off GitHub. Deploy with the CLI from a checkout that has `banks/`. Git auto-deploy stays off (a Git deploy would ship without the exam banks).
- `vercel deploy` (preview) first: answer files 404, `/check` grades, offline reload works. `--prod` only on Tony's word.
- Domain: free `*.vercel.app` first. `csci4x.com` later. Pointing the root at Vercel ends the `:5567` site (a subdomain keeps both). Pick the final domain before phones cache it: the service worker cache is per origin.
- Tokens for Claude: scope = the team that owns the project (`forzalab's projects`), short expiry, in the cloud environment as `VERCEL_TOKEN`, never in chat or files. A token without team access can read the user but gets "forbidden" on projects (Oct 3).
- Old server `csci4x.com:5567`: `STEM_REDIRECT=https://stem-stuff.vercel.app ./deploy.sh` turns it into a redirect (302, POST 307, never 301: a 301 sticks in browsers and could not be undone).
- Vercel project: framework preset must be "Other" (null). The "python" preset sends every path to the function, so `/` returned `{"error": "not found"}` (Oct 3). Git auto-deploy disabled in `vercel.json` (`"git": {"deploymentEnabled": false}`): it would ship without the exam banks. The dashboard/API `createDeployments: disabled` did NOT stop it (Oct 3: every merge to main went to production, and live lost BANK_P2X).

## Banks from the brain repo (tools/ship.sh)
- Exam banks are written in Tony's private brain repo (GitLab `Forzalab-bravo/brain`), under `projects/*/_files/*-bank/BANK_*.json`. `tools/ship.sh demo|live` copies them into the deploy worktree's `banks/`, so a deploy no longer needs them hand-copied.
- Per file name, first hit wins: `[banks-dir]` arg > brain > `banks/*.json` in the checkout. (Was checkout > brain in #45; flipped Oct 3: Tony's phone deploy shipped a stale local BANK_P2X over the newer brain one. A bank only the checkout has, e.g. BANK_PSY6, still ships.) Same name at several brain paths → the one whose last commit is newest (`git log -1 --format=%ct`). One line says where each came from: `banks: BANK_P2X(brain) BANK_PSY6(repo)`.
- Brain source: a local clone if one exists (`$BRAIN_DIR`, `~/brain`, `/home/claude/brain`; `pull --ff-only`, a failed pull only warns). Otherwise **the bank hatch**, `tools/brain_banks.py`: GitLab's HTTP API lists `projects/` (paged tree, names only) and downloads only the `*-bank/BANK_*.json` winners (`repository/files/…/raw`). A duplicate name asks `repository/commits` for each copy's last commit. About 100 KB, no git.
- Why no clone (Oct 3, Tony): his phone (Termux) has no brain clone and the brain is heavy; "open a hatch for the banks". #45's shallow git clone was replaced by the hatch.
- Token: `BRAIN_TOKEN` in the repo-root `.env` (gitignored; `.env.example`), GitLab token with `read_api`. It goes in one `PRIVATE-TOKEN` header only to `BRAIN_API`'s host, is never re-sent across a redirect (`add_unredirected_header`), never in argv (env only), never printed, also not under `bash -x` (`tests/test_ship.py` checks both).
- Hatch errors stop the deploy (exit 1): bad token ("rejected, needs read_api"), network, or a file that is not a JSON object with a `problems` list. A partial or broken bank set never ships.
- Later, only if Tony wants a tighter token: a tiny `stem-banks` repo that brain CI mirrors `*-bank/` into, so the phone token cannot read the rest of the brain (not built: YAGNI).
- `--no-brain` / `SHIP_NO_BRAIN=1` skips the brain. `--print-banks` prints the chosen file per bank and stops (no worktree, no Vercel).
- Banks still never go to GitHub: ship.sh only copies them into the temp worktree that is uploaded to Vercel.

## Accepted costs
- Bank or `problems.json` change = redeploy (no hot reload).
- sympy cold start: the first check after idle is ~1–2 s slower.
- Tries reset by hand: edit `stem:tries` in the Upstash console.
- Last write wins on the tries blob (fine for one user).
