# stem-stuff

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
- Tests: `cd tests && npm install && npm test`, and `python3 -m unittest discover -s tests -p 'test_*.py'`.
- Deploy: `./deploy.sh [dir] [port] [branch]` (defaults `~/stem-stuff-site`, 5567, main). Fresh → clone + serve. Existing install → shows incoming commits, asks "update the live site now? [Y/n]". Every run force-stops the old server (pid file, then anything still on the port) and starts a new one. Non-empty other dir → Exit (default) / wipe + install (type folder name to confirm).
- Deploy on Vercel (HTTPS, so `sw.js` runs and the site works offline after one visit):
  1. One time: `npm i -g vercel`, `vercel login`, `vercel link` in the repo. In the Vercel project: Storage → add Upstash Redis (sets `KV_REST_API_URL` / `KV_REST_API_TOKEN`; tries live there, key `stem:tries`). Domains → add `csci4x.com`, set the DNS records it shows. Leave Git auto-deploy off.
  2. Every deploy, from a checkout that has `banks/` and `problems.json`: `vercel deploy` (preview) → check → `vercel deploy --prod`.
  - `vercel.json` builds `public/` with `tools/build_public.py` (the client only) and sends `/p/`, `/state/`, `/b/`, `/check` to `api/index.py`, which bundles `serve.py`, `problems.json` and `banks/`. Answers never reach static files.
  - Retire the old server: `STEM_REDIRECT=https://stem-stuff.vercel.app ./deploy.sh` (same dir/port). It then sends every request there (302; POST /check 307), keeping the path and the `#CODE`. Run `./deploy.sh` without it to bring the old site back.
  - A bank or `problems.json` change is a redeploy (no hot reload). Reset a browser's tries: edit the `stem:tries` key in the Upstash console. The first check after idle is ~1–2 s slower (sympy loads).
