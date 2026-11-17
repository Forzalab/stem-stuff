# BANKCHECK: will a bank load, and does it follow SCHEMA.md?

`python3 tools/bank_tools/bankcheck.py <bank.json | dir>... [--today YYYY-MM-DD] [--load-only] [--codes]`

Run it before a ship or a shoot. Every failure is one text line on stdout, and the last line of a failing run is
`Agents: read docs/design/BANKCHECK.md#<CODE>`, with the first failing code in the table below. Exit 0 = no FAIL (warnings
allowed), exit 1 = any FAIL. Rules come from `server/http_server/serve.py` and the SCHEMA.md `problems` block; none are copied.

Output: `BANKCHECK OK <file> (<n> problems)` · `BANKCHECK WARN <file> <CODE>: <msg>` · `BANKCHECK FAIL <file> <CODE>: <msg>`.
Messages name a code, a JSON path and a schema keyword, never an answer.

Class LOAD = the server will not show the bank. Class SPEC = the bank breaks SCHEMA.md or the author rules. `--load-only`
skips SPEC (for throwaway fixtures). `--today` pins the date for the version check; the default is `serve.today()`
(Pacific time, honours `STEM_TODAY`).

## B-DEPS
Class: tool. Meaning: the Python `jsonschema` package cannot be imported, so the SCHEMA.md check cannot run.
Fix: `pip install jsonschema` (it is in requirements.txt). A missing library is a failure, never a silent skip.
Server line: none (a tool fault). Rank: first, because nothing SPEC can run without it; LOAD checks still run.

## B-NAME
Class: LOAD. Meaning: the file stem is not `BANK_` plus 3-6 of A-Z0-9, so the server never lists it.
Fix: rename the file to `BANK_XXX.json` (the stem is the bank code). Code: `serve.BANK_CODE`.
Server line: serve.py:296-300 (a name that does not match is skipped with one stderr line).
Rank: first of the LOAD codes, because the server skips the file before it reads a byte.

## B-JSON
Class: LOAD. Meaning: the file is not JSON, not an object, or has no `problems` list. Later checks cannot run, so the bank stops here.
Fix: make it valid JSON with `"problems": [...]` (SCHEMA.md).
Server line: serve.py:224-226 (any exception = "unreadable"; the last good copy or `[]`), serve.py:242-243.
Rank: second, because nothing after it can be read.

## B-VER
Class: LOAD. Meaning: the bank's `v` (no `v` or a non-int `v` = 1) is older than the newest Version-table row, and the sunset date
has passed: the server drops it (`GET /b/<code>.json` answers "dropped"). Before the sunset it is a WARN with the date.
Fix: update the bank to the newest Version-table row (SCHEMA.md "Version table") and set `v` to that row.
Server line: serve.py:232-236 (bad `v` = 1), serve.py:277-282 (`bank_notice`), serve.py:315-316 (the drop).
Rank: before the content checks, because a dropped bank is never read at all.

## B-EMPTY
Class: LOAD. Meaning: no problem survives the server's filter (each item must be an object with a string `code`), or the list is empty.
The skipped items are listed. A bank with some skipped items but some kept is a WARN.
Fix: give each item an object with a `code`, and at least one item.
Server line: serve.py:226 (the filter, no log line), serve.py:322 (a bank with no kept problems is not listed).
Rank: before B-HIDDEN, because an empty bank has nothing to hide.

## B-HIDDEN
Class: LOAD. Meaning: every problem is hidden in sugar mode, the default, so the student sees "QUACKK, code not found." on an
open bank. Hidden in diet mode only is a WARN.
Fix: keep at least one item that sugar mode shows (`saccharine.hide` off, not a "None of these" answer) or accept that it is diet-only.
Server line: serve.py:449-457 (`hidden`), serve.py:1043 (`bank_payload` skips them per request).
Rank: after the file-level checks, because it depends on the surviving items.

## B-SCHEMA
Class: SPEC. Meaning: the file breaks the SCHEMA.md `problems` block. The first 3 errors are printed with their JSON path
("+N more" after that). `required` and `additionalProperties` print the key name; other errors print the failed keyword.
Fix: the path tells you the field. Edit it to match SCHEMA.md; the schema is the only copy of the rules.
Server line: none. The server does not validate on load. SCHEMA.md `<!-- schema: problems -->` is read the way tests/schemas.mjs reads it.
Rank: after the LOAD codes, because a bank the server cannot load is the cheaper fix.

## B-ASK
Class: SPEC. Meaning: the bank declares `v` >= 20261118 (SCHEMA.md Version table) and a problem breaks the situation / question split:
no `ask` field (FAIL); a `body` text paragraph outside code fences that ends with `?` or starts with Compute / Calculate / Find /
Determine / What / Which / Using / How / Why / Tick / Prove / Show / Solve / Evaluate / Derive / Explain (the question is bunched into
the setup); an `ask` that has a code fence, several paragraphs or over 300 chars (setup bunched into the ask), or has neither a `?`
nor an imperative / question word at a sentence start (an ask that is only setup). Heuristics, on purpose simple: a false hit is
fixed by rewording. Older banks (v < 20261118) are not checked and keep the old render rule (below).
Fix: `body` = the givens, code and figures only; `ask` = the question in one or two sentences ("Using the Master Theorem, compute the
running time of this recursive algorithm.").
Render rule (client/answer/qcard/qcard.js `takeLead`, app.js): with `ask` the card shows it as the bold lead under the setup and never
cuts a sentence out of `body`; without `ask` (old banks) the last sentence of the last `body` paragraph is still promoted, as before.
Server line: none. The server passes `ask` through `public()` and does not check it. Rank: after B-SCHEMA (the field must be well formed first).


## B-TICK
From v 20261118 (same gate as B-ASK). FAIL when `ask` or a body text block (code fences skipped) has a sentence that starts with a tick instruction: tick / untick / tap a row / check all|each|every|the box / select|choose|pick|mark all|each|every. Why (Tony Nov 17): the grey `how` line under the question already says how to answer; a second meta sentence repeats it. The noun ("per-tick labels") passes: only a sentence start counts. Fix: delete the sentence; put a bank-specific rule in `how`.

## B-DUP
Class: SPEC (a warning across files). Meaning: one code appears twice in a file with different content (FAIL), or in two files
with different content (WARN; the first file in server order wins: problems.json, then banks A-Z).
Fix: give each problem a unique code, or delete the copy that is not wanted.
Server line: serve.py:320-325 (the warning and the first-wins rule), serve.py:391 (the in-file `dict.fromkeys`).
Rank: after the schema, because the schema error is what the author reads first.

## B-PREFIX
Class: warning only. Meaning: a code's prefix (`PSY6_` in `PSY6_A001`) is not the file stem minus `BANK_`, and the file has no valid
`"bank": "BANK_<prefix>"` flag. The server still loads the bank; a shared link opened on a new device names it wrong.
Fix: rename the codes to the stem's prefix, or add the `bank` flag (docs/design/BANK.md §1). Never fatal (see the Not in scope list).
Server line: app.js:707-710 (the client names the bank from the flag), docs/design/BANK.md §1.
Rank: last, because it is a warning and it cannot stop a load.

## Why this order
The order is the order the server gives up in: the name (serve.py:296), the JSON (serve.py:224), the version (serve.py:315), the
problems that survive the filter (serve.py:322), the mode filter (serve.py:1043). LOAD comes before SPEC because a LOAD fault hides
everything after it and is the cheaper fix. One run prints every code it can find; the pointer is the first code in this order over
all files, so one fix-and-rerun loop does not hide the next fault.

## Harness rule
Every harness that opens a bank (a repo test or an ad-hoc script) runs bankcheck on its fixture, uses `tests/lib/bankguard.mjs`, and
fails on the incident line described in "Client incident lines". No verdict comes from a screenshot. Usage:

```js
import { bankReady, watchBank } from "./lib/bankguard.mjs";
const srv = spawn("python3", [serve, String(PORT)], { env: { ...process.env, STEM_BANKS: BANKS, STEM_TODAY: PIN }, stdio: "ignore" });
await bankReady({ child: srv, port: PORT, bank: "BANK_AB12" });   // throws: stale port, not 200, dropped or 0 problems, with the pointer
const watch = watchBank(page);                                    // on each page you open
// ... steps ...
watch.assertClean();                                              // throws on any bank incident line or page error
```

`bankReady` is the only check that runs before a page exists, so the first failure is the server's own text, not a timeout.

## Client incident lines
`openBankIn` (client/answer/drill_core/app.js) writes these with the existing incident pipe (`incident {json}`, no new format):

| outcome | line | beacon | B-code |
|---|---|---|---|
| dropped (past sunset) | `incident {"where":"bank","reason":"dropped","status":200,"path":"/b/<code>.json"}` | yes | B-VER |
| 200, 0 problems | `incident {"where":"bank","reason":"empty",...}` | yes | B-EMPTY, B-HIDDEN |
| 404 (unknown code) | `incident {"where":"bank","reason":"not_found",...}` | no (a typo is not a failure, app.js:297) | B-NAME, B-JSON, B-EMPTY, B-HIDDEN |

They fire even at boot (`quiet`). The student's text does not change, and no E-code is shown for them.
A 200 with a `null` body (no last bank yet) is a normal answer and writes no line.

## Ad-hoc harness
An ad-hoc script that opens a bank follows the usage in "Harness rule". Run `python3 tools/bank_tools/bankcheck.py <file>` first.

## Not in scope (parked)
Auto-fix · making B-PREFIX fatal · structured figure-render errors (app.js figure `console.error`) · retrofit of the other .pw.mjs
harnesses · server `log()` lines as JSON.
