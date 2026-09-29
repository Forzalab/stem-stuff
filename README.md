# stem-stuff

A code-gated STEM drill site (CALC1 / PHYS / CSCI26). It's a static page plus a small Python server, `serve.py`.

- **Problems: one file, `problems.json`.** Every problem, answer, wrong answer and hint. Format: `SCHEMA.md` (the only schema).
  - Server: `serve.py` reads it, sends the browser only the public part of the problem whose code was typed (`GET /p/<CODE>.json`) and grades on `POST /check`. Edit or replace the file: live on the next request.
  - Upload: the page's upload button (or the picker when the server is down) takes one `problems.json` and loads every problem in it.
- Server needs Python 3 + sympy (`deploy.sh` installs sympy if missing).
- Tests: `cd tests && npm install && npm test`, and `python3 -m unittest discover -s tests -p 'test_*.py'`.
- Deploy: `./deploy.sh [dir] [port] [branch]` (defaults `~/stem-stuff-site`, 5567, main). Fresh → clone + serve. Existing install → shows incoming commits, asks "update the live site now? [Y/n]". Every run force-stops the old server (pid file, then anything still on the port) and starts a new one. Non-empty other dir → Exit (default) / wipe + install (type folder name to confirm).
