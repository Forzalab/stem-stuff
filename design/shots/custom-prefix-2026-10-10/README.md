# custom-prefix (T15 + T14a), WIP

STATUS: WIP pushed at the 50 minute mark. Code, docs and unit tests are done and green; the full run-all is NOT green (2 pw specs) and the screenshots (gate 3) and impeccable (gate 2) were not produced. Details below.

## What changed
codes.mjs is the only place that knows code prefixes; app.js / suggest.mjs import it, offline.js reads window.stemCodes. A custom prefix (3-6 letters) loads from an upload only with a valid "bank": "BANK_XXX" flag whose name equals the prefix. Every upload outcome ends in a 3-4 word line in #entryMsg. A dead link to an unknown custom prefix says "BEAR_QAA needs BANK_BEAR".

## Gate results
1. run-all (full): RUN_RC=1, see tests.log. Failing: `polish` (phone widths: #padFab never clickable) and `render` (desktop: #entry visible after upload). Both pass on origin/main. unittest, npm (820 node tests), prefix.pw, next-dead and all other pw specs are green.
   Cause (one): the upload result line is written to #entryMsg after load(), and a non-empty #entryMsg summons the dock by design (app.css C8 `:has(#entryMsg:not(:empty))`, nav.css:45, and the phone bar opens via the MutationObserver at app.js "barOpen(true)"). So after a clean upload the code box now shows on desktop (render.pw.mjs:334 expects it hidden, C2) and the phone bar stays open (hides #padFab, polish.pw.mjs).
   Owner decision needed: (a) keep the message in the dock and update those two specs (they pin "no message after a clean upload"), or (b) show only warn/bad lines in #entryMsg and give the clean "Loaded N problems" a non-dock home (toast), or (c) let ok lines not summon the dock (then they are invisible on phones, where the bar rests as a strip).
2. tools/impeccable.sh: not run (out of time).
3. Before/after screenshots Chromium + WebKitGTK: not produced. Scratch banks are in /tmp/bear-scratch (BEAR_ renamed per D1 2.7, flagged, no-flag, broken); drivers /tmp/shotwork/{chromium-shots.mjs,webkit-shots.py}; WebKitGTK packages are installed.
4. Diff files: those of directive 2.3, plus tests/next-dead.pw.mjs (see deviations).

## Deviations
- Warn tone: the directive asked for `--mark` yellow. STYLE.md 2.1 says "there is no warning color, --mark is never a warning" and tests/style.test.mjs fails on it. So `.entry-msg.warn` / `.so-msg.warn` use plain `--ink` (green ok, ink warn, red bad; the words carry the state). One line each to change if the owner amends STYLE.md.
- tests/next-dead.pw.mjs (not in the 2.3 list): its "ODD" step expected "Can't open BEAR_001"; with the flag rule that upload now says "Bank flag missing". One regex and one title changed.
- app.js: typing in the code box now adds `entry-open` (input handler). Without it, clearing the upload line on the first keystroke hid the dock that only the line was holding open and the box lost focus.
- Built-in prefixes keep the optional separator everywhere (`physp2xa` still means PHYS_P2XA, as today). Directive 2.4 lists PHYSP2XA among "stay null"; I read "Built-ins ... keep today's optional separator" as the rule.
- `normalize(raw, known)` is strict by default (built-ins only); `codes.ANY` allows any custom prefix (Paste button, typed-after-upload); `normalizeLink` is the `#link` form.
