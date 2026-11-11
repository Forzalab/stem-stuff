# server

The stem-stuff Python server. Run it with `python3 server/http_server/serve.py [port] [problems.json]` (deploy.sh does this on the host; api/index.py imports it on Vercel).

Packages (each has a README.md):
- `http_server/`: `serve.py`, the entry: routes, the bank, Cluck's streams.
- `accounts/`: `acct.py`, My Cluck accounts.
- `answer_grading/`: `expr.py` (expression answers), `slips.py` (slip families).
- `cluck_reply_checks/`: the gate for Cluck's OpenUI Lang fences (`oui.py`, `views_gate.py`, `copy_gate.py`, `aiw.py`, `aiw_rewrite.py`, `livefig.py`).
- `mini_cluck/`: `mini.py`, the D1 mini-Cluck.
- `math_engine/`: deterministic math tools (graph, symbolic).

`data/` holds what the server reads (see data/README.md). `vendor/` holds the avoid-ai-writing patterns (see vendor/README.md).
