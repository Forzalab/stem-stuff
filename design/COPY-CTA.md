# Copy: calls to action

Rules: verb + object (+ what you get or what it costs). 5 words or fewer where possible. Grade-3 words.
No metaphors (wish, lamp, granting, genie). No jargon (BANK_, diet/sugar, snacks, freeze, session, .json); explain XP once as "XP (points)".
One noun per thing: **question** (never "problem"), **notes** (never "scratchpad / pad"), **steps** (Cluck's text), **Check** (every submit arrow).
Icon-only buttons get a visible 1-word label (`label: **X**` below). This table doubles as the translation key list (Georgian test): one row = one key; `{n}` = interpolated value.
Status (alt, Oct 4 ~17:00 PT): **3a done** = every word swap in the "new" column (plus the T4 chip, list button "Questions" with the bank / file in its title). **3b open** = the visible `label: **X**` words under icons and q / a → Answer / Question: layout work, ordered by what the blind-locale baseline shows.
`=` = text unchanged. KEEP = Tony's own pick, untouched. Line numbers: working tree, Oct 4 (the lead is editing app.js; grep the old string if a line moved).

| file:line | where | old | new | why (≤8 words) |
|---|---|---|---|---|
| index.html:131 + app.js:1354 | aria (bar tab, chevron icon) | Show the code bar / Hide the code bar | Show code box / Hide code box · label: **Code** | "bar" is vague; icon needs word |
| index.html:133 | start-page title | Upload or type code to start. | Type a code to start. | one action; File button covers upload |
| index.html:135 | aria+title (upload icon) | Open a problem file | Open file · label: **File** | shorter; icon needs word |
| index.html:140 | placeholder + aria (code input) | Problem code | Type code here | verb first |
| index.html:143 | aria (suggestion list) | Matching codes | = (same) |  |
| index.html:144 | aria+title (paste icon) | Paste code | = · label: **Paste** | icon needs word |
| index.html:145 | aria (go arrow in code box) | Open problem | Open question · label: **Go** | one noun everywhere: question |
| index.html:147 | aria+title (retry icon, entry row) | Try again | = · label: **Try again** | icon needs word |
| index.html:153 | aria (nav) | Questions | = (same) |  |
| index.html:157 | aria+title (shuffle icon) | Shuffle questions | = · label: **Shuffle** | icon needs word |
| index.html:160 | aria+title (prev arrow) | Previous question | Go back one · label: **Back** | "previous" above grade 3 |
| index.html:163 | aria+title (next arrow) | Next question | = · label: **Next** | icon needs word |
| index.html:173 + app.js:1495 | aria (swap toggle doc/pen) | Show the scratchpad / Show the problem | Show notes / Show question · label: **Notes** / **Question** | plain nouns; icon needs word |
| index.html:181 | aria (desktop problem strip) | Show the problem | Show question | one noun: question |
| index.html:183 | label row over the question | Question | = (same) |  |
| index.html:193 + app.js:1458 | aria (grab handle) | Show the whole problem / Freeze the problem again | Show whole question / Make question small · label: **More** / **Less** | "freeze" is jargon; handle has no word |
| index.html:200 | label row over the pad | Scratchpad | Notes | grade-1 word; twin of "Question" |
| index.html:205 | aria+title (cut icon in pad) | Cut all: copy answer, scratchpad and history, then clear the scratchpad / title: Cut all | Copy for Tony, then clear notes · label: **Cut** | says who gets it |
| index.html:208 | aria+title (copy icon in pad) | Copy answer, scratchpad and history / title: Copy | Copy my work for Tony · label: **Copy** | says who gets it |
| index.html:213 + app.js:1628 | aria (q / a toggle) | Show the answer / Show the question (visible: q / a) | Show answer / Show question · label: **Answer** / **Question** (replaces q / a) | single letters unreadable |
| index.html:216 + app.js:1631 | aria+title (collapse icon) | Close the scratchpad page / Open the scratchpad | Close notes / Open notes · label: **Close** | plain noun; icon needs word |
| index.html:222 | aria (pad peek) | Go to the scratchpad | Go to notes | plain noun |
| index.html:222 + app.js:1567 | pad peek text, empty pad | Scratchpad | Notes | plain noun |
| index.html:225 | floating pad button (phones) | Scratchpad | Open notes | verb + object |
| index.html:9 | tab title | STEM drill | = (same) |  |
| app.js:1772 | onboarding toast 1 (on pad button) | Tap Scratchpad to open your pad. | Tap here to write notes. | points at button; no name needed |
| app.js:1693 | onboarding toast 2 (on q / a) | Switch question and answer view here. | Tap to switch question / answer. | verb first |
| app.js:1773 | onboarding toast 3 (on pad button) | Drag the button anywhere. | Drag to move this button. | says what you get |
| app.js:78 | toast, wrong answer, try left | One more try, so choose wisely. | KEEP (Tony) · alt: Wrong. 1 try left. | Tony's pick (design/TOAST.md) |
| app.js:89 | sr, verdict | Correct. | = (same) |  |
| app.js:89 | sr, verdict | Out of tries. | No tries left. | plain; matches lock line |
| app.js:90 | sr, verdict | Not quite. One more try. | Wrong. 1 try left. | plain, numeric |
| app.js:322 | entry msg, bad code | Codes look like CALC1_T6B. Banks: just P2X. | Not a code. Try CALC1_T6B. | drop "Banks" jargon |
| app.js:325 | sr, after DIET_/SUGAR_ prefix | Diet mode on. / Sugar mode on. | Original questions on. / Easy questions on. | diet/sugar is jargon (unsure) |
| app.js:335 | entry msg, no file picker | Can't open files here. | = (same) |  |
| app.js:372,413 | entry msg, load failed (bank + problem) | Couldn't load that. Check your connection. | Didn't load. Tap Try again. | names the button to tap |
| app.js:372,413 | entry msg, load timed out (bank + problem) | timeout | Too slow. Tap Try again. | raw word, no action |
| app.js:999 | #fb verdict line, check timed out | timeout | Too slow. Tap Try again. | raw word, no action |
| app.js:377 | entry msg | No bank {code}. | {code} not found. | drop "bank"; one key w/ next |
| app.js:408 | entry msg | {code} is diet-mode only. | Can't open {code} here. | diet-mode is jargon |
| app.js:413 | entry msg | No problem {code}. | {code} not found. | same key as bank miss |
| app.js:481 | aria (MC row arrow) | Submit {L} | Check {L} · label: **Check** | same word as Check button |
| app.js:482 | aria (fix box) | Correct value for {L} | Right answer for {L} | grade-3 words |
| app.js:482,483 | placeholder + line (fix box, default) | correct value | Type the right answer | verb first |
| app.js:484 | aria (choose-all check arrow) | Check | = · label: **Check** | icon needs word |
| app.js:492 | aria (multi group) | Answers | = (same) |  |
| app.js:475 | aria (MC group) | Choices | = (same) |  |
| app.js:496 | aria (multi part arrow) | Submit {l} | Check {l} · label: **Check** | same word as Check button |
| app.js:503 | placeholder (expr answer) | in terms of {v} | Use {v} in your answer | plain words |
| app.js:503 | placeholder (num answer) | e.g. 9/2, sqrt(3), dne | Like 9/2, sqrt(3), dne | "e.g." is jargon |
| app.js:505 | aria (answer box) | Answer / Answer: f({v}) | = (same) |  |
| app.js:507 | aria (answer arrow) | Submit answer | Check answer · label: **Check** | same word as Check button |
| app.js:520 | aria (formula card) | Formulas, in order | = (same) |  |
| app.js:521 | formula card heading / step joiner | Do it in this order / then | = (same) |  |
| app.js:528 | how line (choose-all, sugar) | Tick every true one. None true? Check with none ticked. | Tap all true ones, then Check. None? Just tap Check. | "tick" unclear on phone |
| app.js:658 | aria (choice X'd) | {L}: {text}, marked wrong | = (same) |  |
| app.js:800,997 | #fb / part hint line, unreadable answer | Can't read {typed}. It didn't count. | Can't read {typed}. Type it again. | ends with action |
| app.js:801,998 | #fb / part hint line, no grading | Saved. Grading isn't live yet; Copy sends it to Tony. | Saved. Tap Copy to send Tony. | names the button |
| app.js:802 | part hint line, check timed out | The server took too long. It didn't count. | Too slow. Tap Try again. | same key as timeout |
| app.js:802 | aria+title (retry icon in verdict; 2x) | Try again | = · label: **Try again** | icon needs word |
| app.js:834 | #fb, multi finished | {right} of {n} right. | = (same) |  |
| app.js:834,1001 | #fb lock line (also settle()) | Ask Tony about {code}. | No tries left. Ask Tony about {code}. | says why first |
| app.js:1105 | Cluck chip, not asked yet | Ask Cluck | Explain my mistake | Tony's handout |
| app.js:1105 | Cluck chip, failed | The lamp flickered. Ask again | Didn't load. Tap to try again | no metaphor |
| app.js:1105 | Cluck chip, done | Cluck has your wish | Show Cluck's steps / Hide Cluck's steps | verb+object; needs w.open branch |
| app.js:1105 | Cluck chip, typing | Cluck is granting your wish | Cluck is writing the steps… | no metaphor |
| app.js:1107 | Cluck voice button | Mute / Sound | Turn voice off / Turn voice on · alt (Tony): Voice off / Voice on | verb: action, not state |
| app.js:1098 | sr, Cluck text shown | Cluck's solution is open. | Cluck's steps are open. | one word: steps |
| app.js:1190 | original card header | Original: Practice Exam 2, Q{q} | pending T1 pick | redesign in T1 |
| app.js:1191 | original card subheading | Worked solution | Steps to solve it | one word: steps |
| app.js:1192 | original card button | Peek at the last line | Show last step (this one pays 2 XP) | Tony's handout |
| app.js:1193 | original card note + sr (2x) | Peeked: this one pays 2 XP. | You peeked, so only 2 XP. | says the cost plainly |
| app.js:1238 | sr, reward | Correct. Plus {xp} XP. Level {n}. {line} | = (same) |  |
| app.js:1236 | floating reward text | +{xp} XP | = (same) |  |
| app.js:1244 | burst title / plate | LEVEL UP / LEVEL {n} | = (same) |  |
| app.js:1245 | burst title, rare drop | BONUS LEVEL | BONUS! | no level is given |
| app.js:1258 | placeholder (pad) | Paste GPT answer here, but me be sad... | KEEP (Tony) · alt: Write your work here | Tony's joke |
| app.js:1293 | pad save status | saving / saved | = (same) |  |
| app.js:1324 | sr, copy / cut | Copied and cleared. / Copied. | = (same) |  |
| app.js:1324 | sr, copy failed | Copy failed. | Didn't copy. Try again. | ends with action |
| app.js:1638 | aria (sash, a11y only) | Problem size: {a}. Tap for {b} | Question size: {a}. Tap for {b} | one noun: question |
| app.js:1610 | aria values (sash) | problem strip / answer only / problem one third / half / two thirds | question folded / answer only / question one third / half / two thirds | one noun: question |
| app.js:447,1197 | aria fallback (figure w/o alt; 2x) | figure | picture | grade-3 word |
| app.js:236 + serve.py:48 | Cluck hint, default nudge | QUACK. Plug your answer back into the problem. Does it work? | QUACK. Put your answer back in. Does it work? | shorter; edit serve.py too |
| app.js:156 + serve.py:49 | Cluck hint, fix wrong | QUACK. Right call on which ones are false. One fix is off: redo that row's math. | QUACK. You found the false ones. One fix is wrong. Redo its math. | idiom "right call"; edit serve.py too |
| serve.py:50 | Cluck hint, choose-all miss (server) | QUACK. A true one is still unticked, or a false one is ticked. Check every row again. | QUACK. Some taps are wrong. Check each row again. | shorter; "tick" unclear |
| serve.py:930 | Cluck text, stream cut off (server) | (QUACK. The lamp flickered. Try again in a moment.) | (Cluck stopped early. Sorry!) | no metaphor; no retry exists (unsure) |
| nav.js:100 | list button text | BANK_P2X (bank code) / file name | Questions | BANK_ code is jargon |
| nav.js:101 | aria (list button) | {label} questions list / Questions list | Question list | drop code |
| nav.js:124 | aria suffix (list row) | Out of tries. | No tries left. | same key as verdict |
| nav.js:124 | aria suffix (list row) | One wrong try, one left. | 1 wrong, 1 try left. | numeric, shorter |
| nav.js:124 | aria suffix (list row) | Correct. | = (same) |  |
| nav.js:141 | sr, after shuffle | Shuffled. This is {i} of {n}. | = (same) |  |
| nav.js:171 | sr, prev / next | {i} of {n}. {title} | = (same) |  |
| brainrot.js:28 | aria (video region) | Brainrot corner | Video corner | "brainrot" is slang |
| brainrot.js:30 | aria (min icon) | Make it small | Make video small · label: **Small** | names the thing; icon needs word |
| brainrot.js:30 | aria (x icon) | Hide it for this session | Hide video for now · label: **Hide** | "session" is jargon |
| brainrot.js:32 | aria (tab to bring it back) | Show the brainrot corner | Show video · label: **Video** | slang; icon needs word |
| brainrot.js:11 | iframe titles | Subway Surfers gameplay, muted / Parkour gameplay, muted | = (same) |  |
| offline.js:127 | sw update bar | New version ready. Tap to update. | = (same) |  |
| offline.js:226 | aria+title (dialog x) | Close | = · label: **Close** | icon needs word |
| offline.js:229 | file / folder buttons (text is sr-only) | Open file / Open folder | = · make text visible | icon needs word |
| offline.js:263 | dialog title | Offline copy / Server offline | Open your file / Can't reach the site | says what to do / what broke |
| offline.js:265 | dialog text | Open problems.json (it has {code}) from your files. / Open problems.json from your files. | = (same) |  |
| offline.js:301 | dialog msg | No .json files there. | No problem files there. | ".json" is jargon |
| offline.js:302 | dialog msg | {name} is not a problems.json. / Those files are not a problems.json. | {name} is the wrong file. / Wrong files. | plain |
| offline.js:305 | dialog msg | Loaded {n}, but no {code} in them. | {code} is not in these files. | plain |
| offline.js:333 | entry msg (upload) | No .json file there. | No problem file there. | ".json" is jargon |
| offline.js:334 | entry msg (upload) | {name} is not a problems.json. | {name} is the wrong file. | plain |
| rewards/engine.js:114 | HUD coin (number only) | {xp} | label: **XP** · first time: "XP (points)" | icon needs word; explain XP once |
| rewards/engine.js:115,120 | HUD level star (number only) | {level} | label: **Level** | icon needs word |
| rewards/engine.js:143 | HUD under bar | {n} XP to level {n+1} | = (same) |  |
| rewards/engine.js:117,121 | HUD flame (number only) | {streak} | label: **Streak** | icon needs word |
| rewards/engine.js:151 | HUD counts | real {r} · snacks {s} | exam {r} · easy {s} | "snacks" is jargon |
| rewards/engine.js:152 | aria (HUD) | {xp} XP, level {l}, {t} XP to level {l+1}, streak {s}, {r} real solved, {sn} snacks | {xp} XP (points), level {l}, {t} XP to level {l+1}, {s} in a row, {r} exam and {sn} easy solved | explain XP; drop jargon |
| rewards/engine.js:79 | reward toast sub | {n} in a row | = (same) |  |
| rewards/engine.js:77 | reward line, rare drop | BONUS LEVEL! | BONUS! | no level is given |
| rewards/engine.js:12 | reward toast lines (20) + LEGEND (3) | QUACK! Brain +1. … / THE GOLDEN DUCK HAS NOTICED YOU. … | = (same) | flavor; nothing to tap |
| rewards/fx.js:141 | slot-machine labels | COIN DROP / RARE DROP / LEGENDARY | = (same) |  |
| rewards/fx.js:198 | burst title default | BONUS LEVEL | BONUS! | no level is given |

Skipped: question / bank content (body, choices, hints, saccharine titles, narration), dev console text, server error JSON, offline.js `validate()` reasons (never shown), graph.js (figure text comes from bank data), sw.js (no text; it only posts `stem-update`).

## Tests asserting old strings

| test file:line | old string |
|---|---|
| tests/render.pw.mjs:191 | Upload or type code to start. |
| tests/bank.pw.mjs:63 | No bank {code}. (`No bank BANK_NOPE.`) |
| tests/bank.pw.mjs:71 | {label} questions list (`BANK_AB12 questions list`) |
| tests/done.pw.mjs:119 | Out of tries. (list row aria, nav.js) |
| tests/done.pw.mjs:133 | One wrong try, one left. (list row aria, nav.js) |
| tests/done.pw.mjs:134 | Out of tries. (list row aria, nav.js) |
| tests/done.pw.mjs:136 | Out of tries. (list row aria, nav.js) |
| tests/easy.pw.mjs:145 | Cluck has your wish |
| tests/easy.pw.mjs:158 | Cluck has your wish |
| tests/easy.pw.mjs:180 | Ask Cluck |
| tests/flow.pw.mjs:131 | Scratchpad (pad button text) |
| tests/flow.pw.mjs:226 | Tap Scratchpad to open your pad. |
| tests/flow.pw.mjs:229 | Switch question and answer view here. |
| tests/reload.pw.mjs:86 | timeout (#fb) |
| tests/reload.pw.mjs:102 | timeout (#entryMsg) |
| tests/rewards.pw.mjs:87 | HUD aria `^{xp} XP, level 1` (breaks with "XP (points)") |
| tests/rewards.pw.mjs:147 | Original: Practice Exam 2, Q7 (pending T1) |
| tests/tries.test.mjs:129 | FIX_NUDGE literal "QUACK. Right call on which ones are false. …" |
| tests/render.pw.mjs:499 | `doesNotMatch /Not quite\|One more try/` (negative; stays green, retarget to "Wrong. 1 try left") |

Not affected: render.pw.mjs:137, flow.pw.mjs:240, choose-all.pw.mjs:105 (AGAIN, KEEP); render.pw.mjs:237 (Paste code, `=`); update.pw.mjs:58 (update bar, `=`); rewards.pw.mjs:114,117 (reward line, `Correct. Plus`, `=`); test_serve.py:54 (`startswith("QUACK")`, new nudges keep QUACK) and :112 (uses `serve.FIX_NUDGE` by name).
