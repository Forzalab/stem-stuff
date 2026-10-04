# Rewards wiring: plan (phase 1, research only)

Build guide for wiring the sugar reward layer (`design/rewards/`: engine.js, fx.js, loop.js, hud.css, fx.css, icons/) into the
real app. Spec: brain `projects/calc/topics/sugar-rewards.md` (main owns the bank). Mock research: `design/REWARDS.md`.
Line numbers are as of commit 0bfcae8.

## 0. Urgent, whatever Tony answers (diet is not safe today)

- The brain's BANK_P2X.json already holds the **34 snacks** (134 problems, every snack has `sugar_only: true`, `saccharine.snack: true`).
  `tools/ship.sh` deploys banks straight from the brain.
- `serve.py` knows nothing about `sugar_only`: `hidden()` (serve.py:225) and `mode.mjs hidden()` (mode.mjs:29) never read it.
  So **the next ship puts 34 snacks into diet**, and puts them into sugar in file order (bank positions 11, 12, 14, 15, 35…), not before their `before` target.
- Fix first (step 1 below). Without it, diet is not the same as before.

## 1. Hook points (where the app knows each outcome)

Every graded try goes through `record(a, r)` (app.js:836). The callers, and what is known at each:

| path | caller | first try? | right / wrong / locked | DOM mark ready at `record()`? |
|---|---|---|---|---|
| single MC | `submitMC` app.js:681 (record :690) | no earlier `S.tries` entry with `v:"wrong"` | `r.verdict`; `r.triesLeft <= 0` = out | no: `.right` is added after `record()` |
| choose-all | `submitAll` app.js:705 | same | same (+`r.struck`) | no |
| number / expr / text | `submitFF` app.js:756 | same | same | no (`#ff.ok` after) |
| multi | `submitPart` app.js:807, `settle` :826 | per part (`x.part === i`) | per part; question done in `settle()` | no |
| split T/F row (`sub`) | the MC path, 1 try (`maxTries` app.js:154) | always | wrong = out at once | no |

- `record()` is also called for `invalid` / `pending` / `locked` (submitMC). Rewards count only `correct` and `wrong`.
  `locked` (the server says out of tries) = no reward, no streak change.
- Reload / reopen: `paint()` (app.js:895) and `syncServer()` repaint (app.js:951) never call `record()`. So restored state never pays out again. Good as is.
- Dwell: `S.start = Date.now()` at load (app.js:422), so dwell = `Date.now() - S.start` at the graded try. Spec: 3 s; the engine has 1 s hard-coded
  (engine.js:65). Make it configurable (`Rewards.config({ minDwell: 3000 })`).
- **One hook, deferred:** `record()` ends with `rewardTry(a, r, S)`, which queues the real work in `requestAnimationFrame` and drops it if `S !== mine`.
  By then `finish()` (app.js:979) and `feedback()` (app.js:985) have run, and the right choice / box has its final class. Not 4 hooks in 4 submit paths.
- Pop target: `#q .opt.right`, else `#ff.ok`, else the multi part box, else `#mcGo`.
- Multi: one `Rewards.answer()` per **question**, in `settle()`. First try = no part had a wrong. P2X sugar has no multi (all 101 are mc), so this is only for safety.
- Streak: the engine halves it on **every** wrong call (engine.js:58). Two wrongs on one question would quarter it. Change: halve once per question
  (`answer()` takes `code` and keeps `lastWrong = code`).
- Idempotent: the engine keeps `awarded: {code: 1}`. A second correct on a code (a gen reset by Tony, two tabs) pays 0.
- Multi-tab: the engine reads state at script load and writes the whole object. Re-`load()` inside `answer()` before changing anything, and re-render on the `storage` event.

### HUD mount (no clash with the code bar, nav, pad or keyboard)

The mock's HUD is two `position: fixed` bars (hud.css:2, z 50). In the app that would cover the bottom dock (app.css:132, z 20), `#padFab`
(app.css:617, z 40) and the sticky freeze strip (app.css:185, top = `--kb-top`). So: **one HUD element in the flow inside `<header class="top">`, never fixed.**

| layout | where | why it is safe |
|---|---|---|
| desktop (`.qnav-on:not(.dock-bottom)`) | grid row 1, **column 4** (the free `minmax(0,1fr)` cell, nav.css:29-41), right-aligned | the cell is empty today; nothing moves |
| phone (`.dock-bottom`) | its own 40px row under `.qnav` (same max-width and gutters, nav.css:22) | 375px has no room in the nav row (list + shuffle + prev + next + gutters ≈ 356px) |
| keyboard up (Swap), pad page (`html.mt`) | covered by the stage (app.css:494/574, z 14-15) | already how the nav row behaves |
| scratchpad focus (`bar-off`) | slides away with the bar (it is in `.top`) | SWAP.md "Top bar" |
| start page, diet, no saccharine layer | not created | `rewardOn()` false |

- Coin fly: target = the HUD coin. If it is scrolled off-screen (rect bottom < 0), skip the fly and show a "+N XP" float at the choice (an fx-layer node).
- The mock's reset button stays out of the app.
- Add the HUD to the brainrot avoid list (`live()` brainrot.js:65), so the PiP never sits on it.

## 2. Gating, diet, state

- `rewardOn()` = `modeOf() === "sugar" && !!S && (S.prob.wish || S.prob.snack)`. This is the same gate as `stemBrainrotWanted` (app.js:328).
  Fixture questions with no saccharine layer stay untouched, so most existing tests are not affected.
- Diet, byte for byte: `rewards/*.js` load as `defer` scripts but stay inert: no DOM, no listeners, no storage until app.js calls `Rewards.boot()`, and app.js only calls it in sugar.
  Server: `hidden(p, "diet")` returns True for `sugar_only`, so diet bank payloads are byte-identical to a bank file without the snacks (test it).
- Per-bank state: key `stem-rw:<bank code>` (`window.stemBank.code`), `stem-rw:file:<fileName>` for an upload (offline.js:30), `stem-rw:solo` for a lone code.
  It holds `{xp, streak, dry, lastBurst, real, snacks, hist, awarded, orig}`.
  A `stem-` key on a new device is fine: onboarding decides at the first load, before any reward is written (app.js:24-27).
- Reload / resume: DONE.md records (`offline.js doneGet`) already lock answered questions. The reward state is in localStorage per device (as the spec says).
  An overlay that was playing at reload is simply gone.
- Uploads (offline): `check()` → `gradeLocal` → `record()`, so the hook runs. `mode.mjs view()` deletes `saccharine` (LAYER, mode.mjs:35) and drops `snack` / `original`,
  so mirror the server's new public fields there. `mode.mjs hidden()` must also hide `sugar_only` in diet.
- `pending` verdict (static host, no server): nothing is known, so no reward.

## 3. Snacks in the real app

How they arrive today: `bank_payload` (serve.py:605) walks the bank in file order and expands splits in place. `view()` (serve.py:283)
strips `saccharine`, and `PUBLIC` (serve.py:47) has no `snack` or `original`. `lookup()` (serve.py:274) finds snack codes as plain problems, in both modes.

Server changes (needed under both options):
- `hidden()`: `sugar_only` and mode is diet → hidden. Then `/p`, `/check`, `/narrate`, `/explain` 404 or come back empty in diet, through the existing checks (serve.py:922, :943, :882).
  `/state` (serve.py:941) answers before the hidden check: make it 404 too.
- `view()` in sugar: `snack: true` and `original: {q, body, solution}` from `saccharine.original`. `before` only for option A. `PUBLIC += ("snack", "original", "before")`.
  The original's `solution` holds the original's answer on purpose (that is the feature); see Q4.
- Snacks also have `wish` (all 34 have a `key`), so the genie and brainrot work on them too.

The order is decided on the client anyway: nav.js `order()` = `mastery(shuffled(...))` (nav.js:131, shuffle.mjs:27), so the server's order never reaches the student as it is.

**OPEN CONFLICT (Tony decides):** Tony asked for variable runs (0–3 snacks per real, adaptive by the 85% rule, "phase 1: slot machine").
Main's spec says a fixed "snack, real, real" order with authored `before` twins (34 snacks: `S R R` ×33, then `S R`).

| | A. Fixed, authored (main) | B. Variable runs (Tony; engine `nextKind`/`rollRun`, engine.js:44-52) |
|---|---|---|
| how | server places each snack right before its `before` code; nav.js runs `glue()` after `mastery()`: remove the snacks, put each one back right before its target | snacks leave the nav list and become a pool; after a real closes, `rollRun()` picks n (0–3) by the last 10 first tries; Next serves n snacks from the pool (least seen q first), then the next real. Phase 1 shows n as a slot reel |
| supply | 34 snacks for 34 slots, always enough | about 1.15 snacks per real × 67 reals ≈ 77 draws > 34, so the pool runs dry about 60% into the bank, and the dial dies late |
| nav / list | list = 101 items, "k of N" stays honest, DONE marks work as they do now | list = 67 reals plus hidden snacks; Prev from a snack, the resume pointer `at` (serve.py `seen`) and the numbering all need new rules |
| adaptivity | none (everyone gets every snack) | yes (the 85% rule) |
| risk | cruising students get snacks they don't need (small XP, quick to pass) | more code in nav.js and app.js; snacks repeat or run out; harder to test |
| cost | ~40 lines (serve + nav glue) | ~150 lines plus a new nav mode |

Hybrid worth naming: A's order, plus a "skip snack" when the last 10 are > 90% (the 85% rule as a skip, not a supply). It uses no extra content.

## 4. ORIGINAL panel + fading (spec 1b)

| width | where | default |
|---|---|---|
| desktop / side (`html.side`, ≥ 720px, app.js:1460) | in `#work` (the pad column, index.html `section.work`). A two-state `.btn-tgl` in the pad label row switches **Original \| Scratchpad**. The pad stays alive (Copy payload, autosave per code) | Original shown at fade levels 1–2; Scratchpad at level 3 |
| phone (< 720px, `pad-off`) | a collapsible card at the top of `#freezeIn`, before `#problem`: "Original: Practice Exam 2, Q5" plus a chevron. It scrolls inside the freeze strip; the `#more` handle covers a long one. `#padFab` still opens the pad page | collapsed (no room); opening it at level 1 is free |
| Swap / keyboard up | n/a: every snack is mc, so no keyboard | |

- Render: `original.body` through the same block renderer as `render()` (app.js:433). Figures: `drawFigures()` only queries `#blocks .fig`, so widen it to `.orig .fig`.
  `original.solution` = md lines (`$..$`).
- Fading state per bank: `orig[q] = {seen, solved}`. Level 1 (first snack of q): the full solution. Level 2: the last line is hidden behind "tap to peek". Level 3 (`solved`: a first-try correct on a snack of q): collapsed.
- Peek = revealing anything the level hides (the last line at level 2; opening the panel at level 3). Then `peeked: true`, so the engine pays 2 XP and rolls nothing (engine.js:63-69).
  Opening it after the answer is free (as in loop.js).
- STYLE: the panel is question UI, so it gets the STYLE.md look (`--sheet` card, 10px radius), not the reward skin.

## 5. AI meeting points

What exists: on the first wrong answer, `feedback()` → `wishOnWrong()` (app.js:1004, :1026). It POSTs `/narrate` (free), and `/explain` auto (at most 5 questions an hour: `stem-wish` app.js:1012 plus the server's `AUTO_PER_HOUR` serve.py:779).
`#wish` sits under `#fb`. The voice (`voiceSay`, app.js:1092, volume 0.35, mute `stem-voice`) speaks only when the chip is open. `wishReset()` on load stops it all.

Rules: the reward layer never touches `#wish`, `#fb` or `#toast`; it never calls `/explain` and never speaks on a wrong answer.
A legend needs a first-try correct, so the genie cannot have run on the same question, and `wishReset()` killed any voice from the last one. So voice overlap is impossible by construction.

**On a correct answer (first try, sugar):**
1. t0, existing: right mark, `finish()`, `feedback()` → `say("Correct.")`, `saveDone` → `doneExit` at 900 ms (app.js:878).
2. rAF: `r = Rewards.answer({code, correct, firstTry, snack, peeked, dwellMs})`.
3. rAF: `FX.pop(target)` + `FX.sparks(target, snack ? "small" : "medium")`; coin fly (or the "+N XP" float).
4. +450 ms: `Rewards.render(r.xp)` (count-up).
5. +600 ms: `r.drop` → `FX.slots(tier)` (overlay, about 1.3 s, tap or Esc skips), then `r.burst` → `FX.burst`.
6. Then the drop banner (`r.toast`), or the streak note.
7. Screen reader: one `say("Correct. Plus 10 XP. <line>")` after `feedback()`'s say (say() replaces it). FX nodes are `aria-hidden`; the FX toast host loses `role=status`.
8. Legend: `voiceSay(line)` if the voice is on and `!speechSynthesis.speaking`. It goes through `speakable()` (speak.mjs) like everything else.

**On a wrong answer:** the existing flow only (struck choice, `toast(AGAIN)`, the Cluck hint, the genie auto-fire, the chip).
`Rewards.answer({correct:false})` halves the streak once; `render(0)` updates the flame and number with **no animation, no FX node, no sound, no sr text**.
On a second-try correct: counts and HUD only, no FX (honest: no "loss disguised as a win").

**Toasts: two systems, one at a time.** The app `#toast` (app.js:65) is anchored, plain, has no icon and no humour (STYLE.md §3, §5; style.test "one element").
It only says "One more try" (wrong) and the onboarding notes. `FX.toast` = the **drop banner**, part of the reward skin, shown only after a correct answer.
On show it calls `hideToast()` (app.js:61). It is `pointer-events: none`, so it never eats a tap on Next.
It sits top centre under the safe area (below `#updateBar` when that is up), not at the mock's `top:72px`. Document it in STYLE.md as a reward-layer exception, not as a second toast.

**z-order ladder (app today → plan):** stage 14-15 · dock 20 · rot / code-sug 30 · padFab 40 · #toast 50 · **drop banner 55** (was 160) · updateBar 60 · splash 100 · **fx overlays 140, fx-layer particles 150** (above the brainrot PiP, which is fine: overlays are short and tap-skippable, and the particle layer has `pointer-events: none`).

## 6. Assets

| asset | from | to | license | notes |
|---|---|---|---|---|
| canvas-confetti 1.9.3 `confetti.browser.min.js` | cdnjs (v2.html:118) | `vendor/confetti.min.js` + `vendor/confetti.LICENSE.txt` | ISC | no `useWorker` (fx.js:33 already uses `create(canvas, {resize})`) |
| engine / fx / loop logic | `design/rewards/` | `rewards/engine.js`, `rewards/fx.js` (loop.js is mock-only: the app's loop is `record()`) | ours | icon base path configurable (`icons/` is relative today, fx.js:12, engine.js:20) |
| HUD + FX css | hud.css, fx.css | `rewards/rewards.css` (scoped, §7) | ours | |
| Fluent Emoji SVG ×8 (88 KB) | `design/rewards/icons/` | `rewards/icons/` + `LICENSE-fluentui-emoji.txt` | MIT | the offline bundle: see below |
| Lilita One / Press Start 2P / Nunito | Google Fonts (v2.html:10) | vendor or drop (Q2) | OFL | the app has no CDN; sw.js caches only same-origin + KaTeX (sw.js:8) |

- `sw.js`: add every new file to `BASE` (sw.js:12) and bump `VERSION` stem-v3 → stem-v4 (sw.js:5). `route()` already treats `.svg/.js/.css/.woff2` as shell (sw.js:30).
- `index.html`: `<script src="vendor/confetti.min.js" defer>`, `rewards/engine.js`, `rewards/fx.js` (defer, after brainrot.js), `<link rel=stylesheet href="rewards/rewards.css">` after nav.css.
  The splash's font wait (index.html, `fonts()`) stays Atkinson only; reward fonts are `font-display: swap`.
- `tools/build_public.py` copies the whole tree except SKIP_DIRS (build_public.py:12), so `rewards/` and `vendor/` ship with no change.
- `tools/bundle.py` (the offline `stem-stuff.html`) inlines `<script src>` and font urls only (bundle.py:97-106, :46). Icons set by JS as `<img src="icons/…">` would be missing offline.
  Fix: generate `rewards/icons.js` = `window.RW_ICONS = {coin: "data:image/svg+xml;base64,…"}` (about 118 KB), so the same file serves the app, the SW and the bundle.
  Data-URI `<img>` keeps each SVG's gradient ids isolated (an inline `<svg>` reused 3× in the reels would collide).
- The `design/rewards/` mock stays as it is (it keeps its CDN confetti).

## 7. Design-system clash

- app.css tokens: dark blue-grey (`--paper #151d2b`, app.css:4-9), Atkinson only, 1px `--bw`, `--shadow-1/3/4` only, no gradients, no emoji (STYLE.md §2, §6).
  The variants: purple, gold bevels, gradients, pixel and display fonts, colour icons.
- Scope: `rewards/rewards.css` only. Its tokens live on `.rw-skin` (set on the HUD root and each fx host), **never on `:root`**.
  Every selector starts with `.rw-` or `.fx-` (or is `@keyframes rw-*/fx-*`). No element, `#q`, `.opt`, `#fb`, `#toast` or `.cluck` selector.
- The question UI keeps STYLE.md. The only reward touch on it is a transient WAAPI `transform` pop on the right choice (350 ms, fx.js:55), plus fx-layer nodes positioned over it. No class or style stays behind.
- style.test.mjs reads only `app.css, nav.css, explain-box.css` and `app.js, nav.js` (style.test.mjs:8-9), so rewards.css does not fail the colour, shadow or font rules. Add a scope test instead (§8).
- STYLE.md gets a short "Reward layer (sugar only)" section: the allowed exceptions (gradients, gold, pixel title, image icons in the drop banner) and the z-ladder above.
- `prefers-reduced-motion`: FX already goes still (fx.js `still()`); the burst is text only (spec).

## 8. Tests (phase 2)

New:

| test | asserts |
|---|---|
| `test_serve.py::test_sugar_only_snacks` | diet `bank_payload` JSON with snacks == without them (byte for byte); `/p`, `/check`, `/state`, `/explain` 404 and `/narrate` empty in diet; sugar puts each snack right before its `before` (a sub code or a code); a missing or hidden target leaves it at its file position; the public snack has `snack`, `original` and no `key/slip/narration/correct/wrong` |
| `tests/rewards.test.mjs` (node, seeded `Math.random`, fake localStorage) | XP real 9–12 / snack 3–5 / peek 2 / try 2 = 0; level floors; pity at 6; rarity bands; dwell < 3000 → no roll; streak halves once per code; `awarded` stops a second payout; keys per bank stay apart; level up beats the 60 s cap, an extra rare drops to a toast; a wrong never returns drop / burst / toast |
| `tests/rewards.pw.mjs` (own serve.py, throwaway bank: 1 real, 1 snack, 1 split) | first-try correct → HUD XP goes up, `.fx-*` nodes appear, `#toast` stays hidden; wrong → no `.fx-*` node for 1.5 s, `#wish` chip shows, streak halved; second-try correct → XP unchanged; reload → XP kept, a done question pays 0; `DIET_` → no `.rw-*`, no `.fx-layer`, no `stem-rw*` key, no snack in the list; the HUD clears `.qnav` buttons, `#padFab` and the dock strip at 375×667, 390×844 and 1280; the original panel shows fade levels 1/2/3 and a peek pays 2 XP; reduced motion → no animations |
| `offline.test.mjs` (extend) | `rewards/*.js`, `rewards/icons.js`, `vendor/confetti.min.js` route as shell and are in `BASE` |
| `style.test.mjs` (add) | rewards.css scope: selector prefixes only, no `:root` |
| `test_vercel.py` / `test_ship.py` (extend) | public/ contains the rewards files and the confetti license |
| SCHEMA.md | `saccharine.{hide, split, snack, before, original}` and top-level `sugar_only` (`saccharine` has `additionalProperties: false`, SCHEMA.md:382; `hide` and `split` are missing today too) |

Could break: `easy.pw.mjs` (sugar fixtures with a layer: the HUD row shifts layout, and the brainrot band moves), `nav-stable.pw.mjs` / `bar.pw.mjs` / `fab.pw.mjs` / `polish.pw.mjs`
(top-bar height on phones), `choose-all-spam.pw.mjs` / `mcclick.pw.mjs` (a tap-to-skip overlay eats clicks, but only on layer questions), `splash.pw.mjs` (if any reward font is preloaded),
`offline.test.mjs` (BASE / VERSION), `schema.test.mjs` (only if a bank with snacks lands in `banks/`), `style.test.mjs` §5 (if any keydown lands in app.js: keep Escape in fx.js).

## 9. Phase 2 build steps (each one small and committable)

1. **serve + mode: `sugar_only`** hidden in diet (serve.py `hidden`, `/state`; mode.mjs `hidden`), plus `test_sugar_only_snacks` (the diet half). Ship this before anything else.
2. **serve + mode: snack view.** `snack`/`original`(/`before`) in the sugar view and PUBLIC; mode.mjs view mirror; order by `before` in `bank_payload`; SCHEMA.md; tests.
3. **nav order** for the option Tony picks (A: `glue()` after `mastery()`; B: snack pool + the engine's run). Unit test in `shuffle.test.mjs`.
4. **assets:** `rewards/` dir, vendored confetti + license, icons + `icons.js` generator, sw.js BASE/VERSION, index.html tags; offline / vercel tests.
5. **engine for the app:** per-bank key, `awarded`, `minDwell`, streak once per code, icon base, re-load in `answer()`, `boot()` and inert in diet; `rewards.test.mjs`.
6. **app.js hook:** `rewardOn()`, `rewardTry()` from `record()` and `settle()`, HUD mount in `.top`, sequencing (§5), `say()`, the drop banner calls `hideToast()`, brainrot avoid list; `rewards.pw.mjs` (core cases).
7. **ORIGINAL panel + fading** (desktop toggle in `#work`, phone card in `#freezeIn`), peek → 2 XP; pw cases.
8. **skin:** the variant Tony picks, as `rewards.css` on the HUD and overlays only; fonts per Q2; STYLE.md "Reward layer" section; scope test; `npx impeccable detect rewards/`.
9. **polish:** the legend voice line, the reduced-motion pass, a full `tests/run-all.sh`, screenshots in `design/shots/rw-*.png`.

## 10. Open questions for Tony (each with a recommended default)

1. **Snack order: A (fixed `S R R`, main) or B (variable 0–3 runs plus a slot, yours)?** Default: **A now**, with the hybrid "skip snack when > 90%". B waits until there are about 2× more snacks (34 run dry at about 60% of the bank).
2. **Which variant (lobby / quizpop / arcade), and its fonts?** Default: vendor **Press Start 2P only** (the LEVEL UP title, about 15 KB, OFL); Lilita One / Nunito → Atkinson 700. No Google Fonts in the app.
3. **HUD on phones: in-flow row under the nav (it scrolls away), or fixed?** Default: **in flow** (fixed covers the code bar, `#padFab` or the sticky problem strip).
4. **The ORIGINAL panel shows a worked answer to an Exam 2 question that is also a graded sugar real** (e.g. Q2 ↔ PHYS_VVY, Q3 ↔ PHYS_UB9). Should that real still pay 10 XP after its original was shown? Default: **yes, full XP** (it is practice; the fading already pulls the crutch away).
5. **T/F split rows are 56 of the 67 sugar reals (1 try, a 50% guess).** Should they pay like 5-choice reals (10 XP, p = 0.25)? Default: **T/F row = 6–8 XP, p = 0.15**; 5-choice reals keep 9–12 / 0.25.
