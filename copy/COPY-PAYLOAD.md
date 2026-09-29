# Copy button payload (v1)

Tony: "when copying the explanation, ALSO copy tried answer AND git history of the explanation box, like a json thing. progress matter for debugging."

The Copy button puts one JSON object on the clipboard. It replaces v1's plain "code / answer / explanation" text.

- Schema: `schema/copy-payload.schema.json` (`"v": 1`)
- Reference code: `copy/payload.mjs` (`build`, `replay`, `stringify`, `diff`), no dependencies
- Example: `copy/example.json` (regenerate: `node copy/gen-example.mjs > copy/example.json`)
- Tests: `tests/copy.test.mjs`

## Example

```json
{
  "v": 1, "code": "CALC1-T6B", "subject": "CALC1",
  "start": "2026-09-29T20:00:00.000Z", "copied": "2026-09-29T20:06:40.000Z",
  "final": {"a":"12","v":"correct"},
  "tries": [
    {"t":95,"a":"4","v":"wrong"},
    {"t":140,"a":"12","v":"correct"}
  ],
  "hints": [
    {"t":100,"n":1,"kind":"concept"}
  ],
  "explain": "plugging in 2 gives 0/0 so factor x^3-8 = (x-2)(x^2+2x+4), cancel, plug in: 4+4+4 = 12",
  "hist": { "n": 6, "kept": 6, "edits": [
      {"t":20,"at":0,"del":0,"ins":"plug in"},
      {"t":50,"at":7,"del":0,"ins":" 2 gives 0/0"},
      ...
    ] }
}
```

Read it as: opened at 20:00, started writing at 0:20, typed 4 at 1:35 (wrong), took hint 1 at 1:40, typed 12 at 2:20 (correct).

## Fields

| key | meaning |
|---|---|
| `v` | payload version. Bump on any breaking change. |
| `code`, `subject` | problem code and its prefix |
| `start` | when the problem was opened (ISO UTC). **Every `t` is seconds after `start`**, 0.1 s precision. Short numbers, easy to read. |
| `copied` | when Copy was pressed |
| `final` | the last try `{a, l?, v}`, or `null` |
| `tries[]` | every `/check`, in order: `a` typed text (MC: choice text), `c` MC choice id, `l` letter shown, `v` verdict `correct / wrong / invalid / locked / egg` |
| `hints[]` | `{t, n, kind}`: hint number and kind (`MC.md` §6). Not the hint text (server-only). |
| `explain` | explanation box text at copy time, full, never cut |
| `hist` | explanation edit history as diffs (below) |

No cookie, IP or fingerprint goes in the payload (`SECURITY.md` §6).

## Edit history: `hist`

Source: the explain box's `getHistory()` → `[{t, text}]` snapshots (`t` = epoch ms), recorded by `design/explain-box.js`.

Compact form: each snapshot becomes one splice against the previous one:
`{t, at, del, ins}` = at char `at`, delete `del` chars, insert `ins`. The first edit is `at:0, del:0, ins:<first text>`. It's git-diff-like but one hunk, so a person can still read it ("added ' so factor' at 80 s").

- Consecutive identical snapshots are dropped. `n` = distinct snapshots.
- Size cap: at most 120 edits. If there are more, the middle is thinned evenly (first and last kept) and `kept` says how many survived. If the JSON is still over ~40 000 chars, it halves again. The **last** snapshot always survives, so replay always ends at `explain`.
- `replay(payload)` rebuilds the kept snapshots. The tests assert that replay ends exactly at `explain`.

Formatting: `stringify()` prints one try/hint/edit per line so the paste is readable in chat and still parses as JSON.

## Contract with the explain box (other agent)

- `getHistory()` returns snapshots oldest first, `{t: epoch ms, text: string}`. Snapshot on pause (~2 s idle) or blur, not every keystroke.
- The page keeps `start`, `tries`, `hints` in memory for the current problem (they come back from `/check` and `/hint`), and calls `build({code, start, tries, hints, explain, history})`, then `stringify()`, then `navigator.clipboard.writeText`.
