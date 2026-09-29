# Proposal: split answers and hints into server-only key files

Status: **proposal**. Nothing here is applied yet; `schema/problem.schema.json` and `p/*.json` are unchanged and tests still pass. Apply it in the same commit that adds `POST /check` to `serve.py`.

## Why
`p/<CODE>.json` is fetched by the browser, so today `answer`, `tol`, `points` are readable in DevTools. With grading on the server, the browser needs only what it renders.

## Layout

```
p/CALC1-T6B.json   public: code, type, var, body, choices   (served)
k/CALC1-T6B.json   server: answer, tol, points, correct, hints, traps   (never served)
```

Same filename in both. The code suffix stays the one lookup key.

## Public file (`schema/problem.schema.json` after the change)

- Remove `answer`, `points`, `tol` (and their `if/then`).
- Keep `code`, `type`, `var` (the input box shows "f(t) = "), `body`.
- `type` gains `"mc"`; when `type == "mc"`, require `choices`: 5–8 items `{ id: "^[a-z]$", md, lock? }`, unique ids (`MC.md` §2).
- Add nothing that hints at the answer (no `hintCount`; the server tells the UI how many hints are left).

## Key file (`schema/key.schema.json`, new)

```json
{
  "$schema": "../schema/key.schema.json",
  "code": "CALC1-T6B",
  "answer": "12",
  "tol": 1e-6,
  "hints": [
    { "kind": "concept", "md": "Plugging in gives $0/0$: factor the top." },
    { "kind": "formula", "md": "$a^3-b^3=(a-b)(a^2+ab+b^2)$" }
  ],
  "traps": [ { "a": "4", "md": "Check the factoring: $x^3-8 \\neq (x-2)(x^2+4)$." } ]
}
```

| key | when | meaning |
|---|---|---|
| `code` | always | must equal the filename and the public file's code |
| `answer` | `num`, `expr` | math.js string or `"dne"` (moved from public) |
| `points`, `tol` | as today | moved from public |
| `correct` | `mc` | the correct choice id |
| `feedback` | `mc` | `{ "<id>": "md" }` misconception text per distractor |
| `hints` | optional, ordered | `{kind, md}` or `{kind:"eliminate"}` / `{kind:"scaffold", code}` / `{kind:"figure", marks:[..]}` (`MC.md` §6) |
| `traps` | freeform, optional | known wrong answers with feedback (from v1 `key.md`) |

## Tests to add then
- Every `p/X.json` has a `k/X.json` and vice versa; codes match.
- Key validates against `key.schema.json`; `answer` evaluates (moved test); `mc` `correct` is one of the public `choices` ids.
- **Leak test:** no public file contains the key's `answer` string, any `traps[].a`, or any hint `md` (catches copy-paste leaks into `body`/`alt`).
- `serve.py` smoke test: `GET /k/CALC1-T6B.json` → 404.

## Migration
1. Script moves `answer/points/tol` from each `p/*.json` into a new `k/*.json`.
2. Swap schemas + tests in the same commit.
3. Update `AUTHORING.md` ("answers go in `k/`") and the examples list.
