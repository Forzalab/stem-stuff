# custom-prefix (T15 + T14a)

## What changed
codes.mjs is the only place that knows code prefixes; app.js / suggest.mjs import it, offline.js reads window.stemCodes. A custom prefix (3-6 letters) loads from an upload only with a valid "bank": "BANK_XXX" flag whose name equals the prefix. A dead link to an unknown custom prefix says "BEAR_QAA needs BANK_BEAR".

Upload line (T14a, owner decision Q11 = b): a CLEAN successful upload shows nothing extra (the opened question and the bank label are the proof; `uploadMsg()` returns `text: ""` and app.js writes nothing). Only warn / bad outcomes write one line (4 words or fewer) in #entryMsg. No "Loaded N problems" line exists anywhere user-visible.

## Copy table (what #entryMsg says after an upload)
| # | outcome | line | tone |
|---|---|---|---|
| 1 | all kept, nothing skipped | (nothing) | |
| 2 | kept, some invalid shape | `Loaded 25, skipped 3` | warn |
| 3 | custom codes skipped, no flag (others loaded / nothing loaded) | `Bank flag missing` | warn / bad |
| 4 | flag present but not BANK_xxx | `Bank flag invalid` | warn / bad |
| 5 | custom prefix differs from flag | `Prefix must match flag` | warn / bad |
| 6 | custom prefix reserved | `Prefix is reserved` | warn / bad |
| 7 | JSON.parse fails | `Broken JSON file` | bad |
| 8 | file over 8 MB | `File too big` | bad |
| 9 | valid JSON, no problems array | `Not a bank file` | bad |
| 10 | problems empty or none valid | `No problems found` | bad |
| 11 | picked file is not .json | `Not a JSON file` | bad |
| 12 | dead link, custom prefix unknown on device | `BEAR_QAA needs BANK_BEAR` | bad |
| 13 | code not found (built-in, or known custom prefix) | `CALC1_ZZZ not found.` | bad (unchanged) |

Tones: warn = --ink (STYLE.md 2.1: no warning colour), bad = --bad. No upload uses the green ok tone any more.

## Gate results
1. `tests/run-all.sh` (full): RUN_RC=0, ALL GREEN (tests.log). On the previous WIP head `polish` and `render` were red because the clean "Loaded N problems" line summoned the dock; with Q11 = b there is no line on a clean upload and both pass. No spec was red under load, no re-run was needed.
2. `tools/impeccable.sh http://127.0.0.1:<port> index.html -- index.html app.css`: rc 0 (live 390x844 / 1920x1080 / 2560x1440 / 3840x2160: no findings; static scan: 0 anti-patterns, 1 advisory on index.html repeating-gradient, pre-existing and not counted).
3. Shots below.
4. Diff vs origin/main (6c27121) is limited to the directive 2.3 list plus tests/next-dead.pw.mjs.

## Shots (before = origin/main 6c27121, after = this branch; scratch BEAR banks with BEAR_ codes)
Chromium at 393x852 (DPR 2, mobile) and WebKitGTK (ios-sim.py, profile safari-expanded = iPhone 15 Safari, viewport 393x659 at DPR 3).
| n | what it shows | before | after |
|---|---|---|---|
| 01 | flagged BEAR bank uploaded | `Can't open BEAR_QAA.` (red) | BEAR_QAA opens, no message |
| 02 | reload at #BEAR_QAA after that upload (restore) | | question open, no message |
| 03 | BEAR bank WITHOUT flag | `Can't open BEAR_QAA.` | `Bank flag missing` (red) |
| 04 | broken JSON | `broken.json is the wrong file.` | `Broken JSON file` (red) |
| 05 | dead link #BEAR_QAA on a fresh device | `Can't open BEAR_QAA.` | `BEAR_QAA needs BANK_BEAR` (red) |
| 06 | #BANK_PSY6 | opens | opens (unchanged) |
| 07 | Chromium only, 393x659: partial upload (PSY_ABC + two unflagged BEAR_) | | PSY_ABC opens, the dock opens with `Bank flag missing` under the code box, whole and readable |

Files: `{before,after}-{chromium,webkit}-NN-*.png` (07 only for chromium, after and before). tests/prefix.pw.mjs step "a warn line after a partial upload" also asserts the line is inside the viewport, unclipped, at 393x659 and 1280.

## Deviations
- Warn tone: the directive asked for `--mark` yellow. STYLE.md 2.1 says "there is no warning color, --mark is never a warning" and tests/style.test.mjs fails on it. So `.entry-msg.warn` / `.so-msg.warn` use plain `--ink` (the words carry the state). One line each to change if the owner amends STYLE.md.
- tests/next-dead.pw.mjs (not in the 2.3 list): its "ODD" step expected "Can't open BEAR_001"; with the flag rule that upload now says "Bank flag missing". One regex and one title changed.
- app.js: typing in the code box adds `entry-open` (input handler). Without it, clearing the upload line on the first keystroke hid the dock that only the line was holding open and the box lost focus.
- Built-in prefixes keep the optional separator everywhere (`physp2xa` still means PHYS_P2XA, as today). Directive 2.4 lists PHYSP2XA among "stay null"; I read "Built-ins ... keep today's optional separator" as the rule.
- `normalize(raw, known)` is strict by default (built-ins only); `codes.ANY` allows any custom prefix (Paste button, typed-after-upload); `normalizeLink` is the `#link` form.
- Q11 = b: copy table row 1 ("Loaded N problems") removed. tests/codes.test.mjs (row 1 is now an empty text) and tests/prefix.pw.mjs (clean uploads assert an empty line; new partial-upload visibility step) were updated for it; both are on the allowed file list. design/COPY-CTA.md still lists the old offline-dialog strings; it is outside the allowed diff and was not touched.
- A warn line after a PARTIAL upload may open the dock (C8 `:has(#entryMsg:not(:empty))`, and the phone bar via the MutationObserver). That is intended: the user must see why something was skipped. Clean uploads write no line, so polish / render / the other specs are unaffected (all green).
- WebKit shots are 393x659 (the Safari expanded frame), not 393x852.
- Not touched: the repeated-upload append behaviour (separate item).
