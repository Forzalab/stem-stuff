# Proposal: split answers and hints into server-only key files

Status: **proposal**. Nothing here is applied yet; `schema/problem.schema.json` and `p/*.json` are unchanged and tests still pass. Apply it in the same commit that adds `POST /check` to `serve.py`.

## Why
`p/<CODE>.json` is fetched by the browser, so today `answer`, `tol`, `points` are readable in DevTools. With grading on the server, the browser needs only what it renders.

## Layout

```
p/CALC1_T6B.json   public: code, type, var, body, choices   (served)
k/CALC1_T6B.json   server: answer, tol, points, correct, hints, traps   (never served)
```

Same filename in both. The code suffix stays the one lookup key.

## Public file (`schema/problem.schema.json` after the change)

- Remove `answer`, `points`, `tol` (and their `if/then`).
- Keep `code`, `type`, `var` (the input box shows "f(t) = "), `body`.
- `type` gains `"mc"`; when `type == "mc"`, require `choices`: 5–8 items `{ id: "^[a-z]$", md, lock? }`, unique ids (`MC.md` §2).
- Add nothing that hints at the answer (no `hintCount`; the server tells the UI how many hints are left).

## Key file (`schema/key.schema.json`, drafted and tested now)

Worked examples (validated by `tests/key.test.mjs`): `schema/examples/CALC1_X2P.key.json` (MC, with its draft public file `CALC1_X2P.public.json`) and `schema/examples/CALC1_T6B.key.json` (freeform, pairs with `p/CALC1_T6B.json`).

```json
{
  "$schema": "../schema/key.schema.json",
  "code": "CALC1_T6B",
  "answer": "12",
  "wrong": [
    { "match": "4", "error": "algebra", "hint": "QUACK. Multiply your factors back out. Do you get $x^3-8$?" },
    { "re": "^\\s*(dne|undefined|0/0)\\s*$", "error": "limit-plug", "hint": "QUACK. $0/0$ says 'simplify first', not 'no limit'. What factor do top and bottom share?" }
  ],
  "nudge": "QUACK. Does your number agree with the calculator table?"
}
```

| key | when | meaning |
|---|---|---|
| `code` | always | must equal the filename and the public file's code |
| `answer` | `num`, `expr` | math.js string or `"dne"` (moved from public) |
| `points`, `tol` | as today | moved from public |
| `correct` | `mc` | the correct choice id (`answer` and `correct` are mutually exclusive) |
| `wrong[]` | always | known wrong answers → `{error, hint}`. MC: `choice` id, **one per distractor, required**. Freeform: `match` (math.js value, equal within `tol`) or `re` (case-insensitive regex on the typed text). |
| `wrong[].error` | | error type enum (`MC.md` §6) |
| `wrong[].hint` | | Cluck's hint: must start `QUACK.`, never the answer |
| `nudge` | freeform, optional | Cluck's hint for an unmatched wrong answer; server default if absent |

Server matching for freeform: `re` entries first, then `match` entries (numeric; for `expr`, compare at `points`), first hit wins, else `nudge`.

## Tests
Already in `tests/key.test.mjs` (on the examples): key schema, code = filename, MC: every non-correct choice id has exactly one `wrong` entry, freeform: each `match` evaluates and is not the answer, `re` compiles, no hint contains the answer.

To add when applied:
- Every `p/X.json` has a `k/X.json` and vice versa; codes match.
- Point `tests/key.test.mjs` at `k/` instead of `schema/examples/`; move the "answer evaluates" test there.
- **Leak test:** no public file contains the key's `answer` string, any `traps[].a`, or any hint `md` (catches copy-paste leaks into `body`/`alt`).
- `serve.py` smoke test: `GET /k/CALC1_T6B.json` → 404.

## Migration
1. Script moves `answer/points/tol` from each `p/*.json` into a new `k/*.json`.
2. Swap schemas + tests in the same commit.
3. Update `AUTHORING.md` ("answers go in `k/`") and the examples list.
