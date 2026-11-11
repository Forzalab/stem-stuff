# server

The stem-stuff Python server. Run it with `python3 server/serve.py [port] [problems.json]` (deploy.sh does this on the host; api/index.py imports it on Vercel).
`serve.py` is the entry: routes, the bank, Cluck's streams. Helpers beside it: `expr.py`, `slips.py`, `oui.py`, `livefig.py`, `views_gate.py`, `copy_gate.py`, `mini.py`, `aiw.py`, `aiw_rewrite.py`, `acct.py`; `engine/` is the tool-call checker.
`data/` holds what the server reads (see data/README.md). `vendor/` holds the avoid-ai-writing patterns (see vendor/README.md).
