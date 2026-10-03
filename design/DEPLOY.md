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
- Vercel project: framework preset must be "Other" (null). The "python" preset sends every path to the function, so `/` returned `{"error": "not found"}` (Oct 3). Git auto-deploy disabled (it would ship without the exam banks).

## Accepted costs
- Bank or `problems.json` change = redeploy (no hot reload).
- sympy cold start: the first check after idle is ~1–2 s slower.
- Tries reset by hand: edit `stem:tries` in the Upstash console.
- Last write wins on the tries blob (fine for one user).
