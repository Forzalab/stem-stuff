# Custom question banks (BANK_XXX)

Status: **built** (branch ccr-6f1f20aa-as33c5). Open call for Tony: in upload mode the list button shows the file name
(`mine.json` → `mine`); say if you want icon-only there instead.

Tony (Tue 2026-09-29 ~15:00 PT): host N .json files in a folder. The student types `BANK_XXX` in the code box to open one.
Empty by default. Simple text, no extra buttons. Save each bank's progress per user. A returning user opens on the bank
they used last. Questions-list icon becomes a checklist; the list button's text becomes the bank code, nothing else.

## 1. Infra (server)

| thing | decision |
|---|---|
| Folder | `banks/` next to serve.py (`$STEM_BANKS` overrides). Ships empty (`banks/.gitkeep`). |
| File | `banks/BANK_XXX.json`. File name = bank code. Format = problems.json (`{ v: 1, problems: [...] }`, SCHEMA.md). A problems.json dropped in and renamed just works. |
| Code | `BANK_` + 3–6 of `A-Z0-9` (same shape as problem codes). Other file names: ignored + one stderr line. |
| Reload | Same as problems.json: mtime per file, re-read on the next request, last good copy kept on a broken file. |
| Problem codes | One global index: problems.json first, then banks (A→Z). Same code in two files = the same problem (same tries). Same code, different content → first one wins + stderr warning. |
| Answers | Never leave the server. Bank problems go through the same `/p/<CODE>.json` (public part) and `POST /check` (grading). |
| Blocked | `/banks/` never served (answers inside). Test pins it. |

### Endpoints

- `GET /b/BANK_XXX.json` → `{ code, problems: [public problem...], marks: { CODE: { x, done } }, at }`.
  `marks` = this browser's progress (from tries.json), `at` = the last question this browser opened in this bank.
  Also records "this browser's last bank = BANK_XXX". Unknown bank → 404.
- `GET /b/last.json` → the same payload for this browser's last bank. None (or the file is gone) → `null` (200, so a new visitor's console stays clean).
- `GET /p/<CODE>.json` (existing): when CODE is in this browser's last bank, records `at` for that bank.

### Progress per user

User = the `sid` cookie (server-set, HttpOnly, 1 year). Already how tries work.

- Tries/lockout: tries.json, per sid + code (unchanged). Bank progress = tries for the bank's codes. Nothing new to store.
- Pointer: tries.json gets `"last": { "<sid>": { "bank": "BANK_XXX", "at": { "BANK_XXX": "CALC1_T6B" } } }`. Written only when it changes.
- Why server, not the browser: Safari wipes script-written storage (localStorage, IndexedDB) after 7 days without a visit.
  The server cookie survives that, so progress and "open where I was" survive it too.

## 2. Client

| file | change |
|---|---|
| `app.js` | `normalize()` accepts `BANK`. Submit / `#BANK_XXX` in the URL → `openBank()`. Boot: reopen the last source. Upload → leaves the bank. `window.stemBank` for nav.js. |
| `nav.js` | List source = the open bank, else the uploaded file. Label = bank code (upload: file name without `.json`). Marks: this browser's local record, else the bank's server mark. |
| `index.html` | `i-list` → checklist icon (3 ticks + 3 lines, same 24px / 2px stroke as the rest). Label span gets an id. |

### Which source is live (one at a time)

`localStorage["stem-src"]` = `BANK_XXX` or `file`. Last explicit action wins: opening a bank sets it; uploading a file sets `file`.

Boot order:
1. `#BANK_XXX` in the URL → open that bank.
2. `stem-src` = a bank → open it.
3. `stem-src` = `file` → the restored upload (existing).
4. `stem-src` missing (new browser, or storage wiped) and no restored upload → ask the server (`/b/last.json`); 404 → blank page (today's empty state).
5. `#CALC1_XXX` in the URL → that problem opens; the bank still fills the list (row marked if it's in the bank).
   No problem hash → the bank opens at `at`, else its first question.

### Opening a bank

Type `bank a7q` / `BANK_A7Q` / just `a7q` (code box only, Oct 3) / paste it anywhere (existing paste redirect) → arrow → bank loads → question opens →
list button reads `BANK_A7Q`. Bad code → "Codes look like CALC1_T6B." (existing). Unknown bank → "No bank BANK_A7Q.".
Timeout / offline → existing message + retry button. No close/leave button: type another code to switch.

## 3. UX: phone vs desktop

Phone (dock at the bottom, one thumb):
```
[✓≡ BANK_A7Q]                     [‹] [›]     top bar, scrolls away
...problem (sticks at top), answer, scratchpad...
[⇧][ BANK_A7Q            → ]                  code bar, bottom strip
```
Desktop (≥700px, fine pointer):
```
[⇧][ CALC1_QB6                   → ]  [✓≡ BANK_A7Q] [‹] [›]
```
- Label width: `BANK_` + 6 chars at 1rem/700 ≈ 170px incl. icon. At 320px wide: 170 + 2×48 + gaps ≈ 282 < 288. Fits.
- Everything else (list card, marks, `[` `]`, focus, Escape) is unchanged (NAV.md, DONE.md).

## 4. What can go wrong → fix

| risk | fix |
|---|---|
| `/banks/` served statically → answers leak | `BLOCK_PREFIX` + a test that GETs it. |
| Broken JSON in a bank | Last good copy kept; never-good file = unknown bank (404) + stderr line. Schema test covers `banks/*.json`. |
| Same code in two files, different content | First wins, stderr warning, test fails. |
| Bank deleted while a browser points at it | `/b/last.json` → `null` → blank page; typing a new code works. |
| Problem removed from a bank | `at` missing from the bank → first question. |
| Cookie cleared / new device | Progress for that browser starts fresh (no login: YAGNI). Copy payload still carries the history to Tony. |
| Safari 7-day storage wipe | Server pointer + marks survive it (cookie). |
| Upload vs bank fight on reload | `stem-src` pointer: last explicit action wins. |
| Guessing bank codes | Codes are the gate, same as problems. Use 5–6 chars for real banks (36⁶ ≈ 2.2 B). |
| Splash ends before the bank's question renders | PR #23 (splash waits for the first load) covers it once merged; this change hooks the same first `load()`. |
| Two tabs, two banks | Last one opened wins the pointer. Harmless. |
| A bank file dropped on the server by hand, then the same name committed | deploy.sh's `git checkout` refuses to overwrite it. Pick one way per bank: commit it (PR), or keep it only on the server (or set `$STEM_BANKS` to a folder outside the checkout). |

## 5. Tests

- `tests/test_serve.py` `Banks`: payload, 404, `/banks/` blocked, last pointer + `at`, marks after a graded try, grading a bank problem, duplicate code warning.
- `tests/bank.pw.mjs` (own server, temp banks dir, temp tries.json): type code → label + rows; Next; reload → same bank + same question; wipe localStorage → server brings it back; unknown bank message; upload wins over bank; 390x844 + 1920x1080 shots.
- `tests/schema.test.mjs`: every `banks/*.json` passes the problems.json schema.
- Impeccable: static + live, 0 new findings.

Results: `bank.pw.mjs` 14/14 (390x844 touch, 1920x1080); Python 38/38; `npm test` 255/255; render, swap, polish, bar,
autosave, disabled, done, reload all pass. Impeccable 0 findings: static (index.html app.css nav.css), live at 1920x1080
and 390x844 with a bank open. Shots: `shots/bank-open-390.png`, `shots/bank-closed-390.png`, and the same at 1920.
Not tested: WebKit, Firefox (not installed here).
