# stem-stuff

A code-gated STEM drill site (CALC1 / PHYS / CSCI26). It's a static page, served by `serve.py`.

- Problems: `p/<CODE>.json`, one file per code, fetched only when that code is entered.
- Schema: `schema/problem.schema.json`. Guide: `AUTHORING.md`.
- Tests: `cd tests && npm install && npm test`.
- Deploy: `./deploy.sh [dir] [port] [branch]` (defaults `~/stem-stuff-site`, 5567, main). Clones, then serves. Non-empty dir → prompt: Exit (default) / wipe + install (type folder name to confirm).
