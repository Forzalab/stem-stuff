# CODEMAP

> ⚠️ READ THIS FIRST. Do not explore/grep/cat the code yourself before reading this map and the target file's header. Blind exploring burns your tokens. (Hook-enforced: brain w147-guard E6.)

Open this file first. Find the row for what you touch, then open only that file.
Big files start with a CODEMAP HEADER (purpose, sections, related files). Find a section with: grep -n "== §<name> ==" <file>
Line numbers are never kept. Moved or added a file? Run `python3 tools/repo_checks/codemap.py fix`, then fill its rows in the same PR (rules: brain `_files/skills/codemap/SKILL.md`; CI checks this).

| path | owns | open when you touch |
|---|---|---|
| `index.html` | The drill page: loads ~40 scripts and styles, plus ES modules. The launch splash (#splash) is a generated skeleton between the `SK:` markers: regenerate with tools/build_and_ship/splash_skeleton.mjs, never hand-edit. | adding or removing a script or css tag; page markup |
| `calc.html` | The Calc Coach page. | Calc Coach page markup |
| `privacy.html` | The privacy page. | privacy text |
| `sw.js` | Service worker: precache list BASE, cache rules, VERSION stamp. | a new root file must work offline; cache bugs |
| `client/answer/drill_core/app.js` | The drill, part 1 of 3: markdown + TeX (md, renderMath), on-device grading (check, same), code bar + suggestions (syncCode, sugShow), banks (openBank), render/load, repair ladder (repairAfterMiss), MC / freeform / multi answers (renderQuestion, submitFF, submitPart), the ui-v7 bare multi letter and unit span (IB-1), each multi part key (partKey; IB-5 + KEY-ALL: on every open part, dimmed + inert while its box is empty, full with text, hidden when the part shuts; flag off: hidden until text), the one inline 24-grid arrow IB1_GO in every Check and Next (nextBtn; SHIPPED KEY: one key per family whose one `<path>` morphs arrow / spin / cross / tick under verdict-v7.css §key via keyVerdict / keyReset / keyBusy; no data-kv tint), the MC Check in the `.chk` row under the choices (#mcGo, never in a tile; flag off keeps the tile `.send`), the grey `how` hint repeated under each typed box (phow; the top `.how` is the flag-off copy), wait timer. feedback / partFeedback keep a typed Check visible on a ui-v7 miss (it takes the verdict stage, then waits dim; IB-4). Has a CODEMAP header; see its section below. | answer flow, grading verdict, code entry, MC / typed / multi answer, boot order |
| `client/cluck/cluck.js` | The Cluck genie, part 2 of 3 (split from app.js): wish stream + cache (wishFromCache, wishEl; the cache key `v2|code|round|tries|pick|build` and the server's `X-Cluck-Reveal` mark: only a reply marked 0 is cached, F3; smoke `tests/reply-cache-state.smoke.mjs`), live figures in a reply (wishFigs, viewImage, the FIG-DRAW-IN call: `wish.fresh` + drawIn), the peek (peekText), the sheet (clOpen, clDrag, phone), dismiss/back (clBack), ask field (clAsk, clSend). Reaches app.js through `bridge`. Has a CODEMAP header. | Cluck box, reply render, wish figures, the sheet, the ask field |
| `client/shell/shell.js` | The shell, part 3 of 3 (split from app.js): sugar rewards (rewardTry, rewardGo), snack original (origRender), scratchpad + autosave (padPut, copyPad), copy math (selPlain), freeze layer + dock (layoutFreeze, layoutDock), Swap (setSwap), Multitask (applyMT, layoutMT), resume, boot. Reaches app.js through `bridge`. Has a CODEMAP header. | rewards, copy math, Swap, Multitask, dock layout, startup order |
| `client/answer/drill_core/app.css` | Styles of the drill page: :root tokens (the Major Third 1.25 type scale `--fs--2..--fs-5` with its line heights `--lh--2..--lh-5`, plus unitless `--lh` / `--lh-xs`; under ui-v7 the `--t-*` point at them; the ONE shared answer letter `--ans-letter-*` = step 0 16/24, 600, uppercase, `--ink-qnum`, read by MC, pick-all and the typed multi letter), entry bar (.dock .code-box), one button system (.btn .btn-go), freeze layer (.freeze), question + choices (.q .opt), Cluck surfaces (.ai-box .cl), scratchpad (.work .xb), multitask (.sash .pstrip), toast (#toast), lock-help. The ui-v7 miss-hint card covers #fb, .chk and multi `.mparts .phint` (IB-4). Has a CODEMAP header. | colours, sizes, layout of the drill page; a button or toast look |
| `client/answer/navigation/nav.js` | Prev / Next and the question list: ?bank= link (deepBank), titles (titleOf, plain), TeX to plain text (texText, texPlain), queue per bank (use, hop, upNext), list marks, go(), night mock (startMock), iOS back (syncBack). Has a CODEMAP header. | question order, list, titles, TeX to plain text, mock night |
| `client/answer/navigation/nav.css` | Styles of the nav and list. | nav look |
| `client/answer/progbar/progbar.js` | The v9d top bar DOM behind `html.ui-v7` (P5): re-parents the nav buttons into list / notch / nav tiles, draws the 7 notches from `stem-pb:<bank>`. Inert with the flag off. <= 480px: PHONE-FILL DOM half (`fillLayout`, `fitAll` font 15 -> 10px). | top bar tiles, notch render |
| `client/answer/progbar/progbar.css` | Styles of the v9d bar, all under `html.ui-v7` (geometry from topbar-v9 fit06/MEASURE.md); §ick14-well = the phone code bar as ONE well (upload inside, list hung off its edge, D1 fill) + bank tile centring (ICK D2). | bar look, tile sizes, the code well |
| `client/cluck/figures/graph.js` | SVG renderer of graph blocks, `Graph.render(el, block)`: JSON prep (prep), marks (surface, incline, poly), scene pre-pass (surfacesOf), label layout (mount, drawMarks), cartesian (cartesian, bars), circuit (circuitLayout), network (networkLayout). Writes `data-tier` (FIG-DRAW-IN construction tier: 0 frame, 1 shape, 2 detail) on its polylines/arcs/points — never the semantic `ly1/ly2/ly3` layer. Has a CODEMAP header. | a figure looks wrong: a mark, axis, circuit, network or label placement |
| `client/cluck/figures/drawin.js` | FIG-DRAW-IN: the pen-trace draw-in of a FRESH Cluck reply figure. `drawIn(root, { fresh }) -> { total, cancel }` animates every not-yet-drawn figure svg (tiers 0 frame/axes -> 1 shapes -> 2 details -> 3 labels; longest stroke first then nearest start; 260 ms·sqrt(len/diag) clamp 120-400; 90 ms tier gap; fills 150 ms after their outline; labels 40 ms apart); pure `orderTier` + `timelineOf`; one figure animates once (`data-drawn`); reduced motion, a hidden page, a Steps anchor and the static `<img>` fallback never animate; >60 marks = one 150 ms fade. | a reply figure draws in wrong or must not animate; the tier table |
| `client/cluck/figures/figcheck.js` | Figure invariants: checks a drawn figure and picks auto hues. | figure rules, auto colours |
| `client/cluck/figure_language/layout-core.mjs` | The streamed, constraint-checked figure language (prototype): parseStatement, createSession (DAG of points + shapes, evaluate), overlap findings as pairs + push vectors (pair, check), Layer/Union, ghosts, sceneSummary for the LLM, layoutView (labels). Plain ESM, no DOM. Has a CODEMAP header. | layout engine, figure placement rules, a parse or overlap finding, label placement |
| `client/cluck/figure_language/layout-docs.mjs` | The figure language's LLM docs (progressive disclosure) + the built-in scenes of the Figure Lab mockup. | figure language docs or lab scenes |
| `client/cluck/figures/formula-figs.js` | Small pictures for formula-sheet rows. | formula sheet figures |
| `client/cluck/openui_views/views.js` | OpenUI Lang renderer in the browser: register / render / stream / mountView, class Session (per-statement paint + error boundary), figure drawing (drawGraph, drawGeometry; their classes are FIG-DRAW-IN's tiers, figures/drawin.js), components View Head Text Table (Tug and Flip -> Table fallbacks) Graph Geometry Callout Answer Steps Hints Predict Reveal Doodle. Has a CODEMAP header. | a Cluck reply view renders wrong; add or change a view component |
| `client/cluck/openui_views/views-lib.js` | Component list of the stem view library (from views/library.json). | add a view component |
| `client/cluck/openui_views/views.css` | Styles of the views. | view look |
| `client/answer/answer_strip/strip.js` | Answer strip: typed, multiple choice, pick-all, multi-part. Also IB-2's key-press nudge on the two typed fields (`[data-ib2]` add 90% / delete 60%, back in ~320ms; the CSS is in strip.css); IB-3's THINKING ring (edge() perimeter-spaced rotate keyframes, `ib3Start` / `ib3Run` / `ib3Sync`; transform-only WAAPI under the static mask; input readOnly while `html.grading`); IB-4's VERDICT ring (`ib4Sweep` / `ib4Sync`: the aurora's last angle frozen, three fixed conic arcs under the static 3.5px mask, two rotate-only closes in 440ms; `ib4Judge` reads the field classes; the icon waits on the finished promise). | the answer strip, a typed field's key-press edge nudge, the thinking ring, the verdict ring |
| `client/answer/answer_strip/strip.css` | Styles of the answer strip. The IB blocks at the file foot (html.ui-v7): IB-1 = the STATIC look of both typed-answer fields (60px squircle with NO resting edge since the shipped-key review, --ans-field ground, 25px Atkinson value (--fs-2), the single box fills the column (no 400 cap, Tony Nov 25), multi row 36 / prompt fit-content(40%) / field 1fr; the typed multi letter `.mparts .mk` is the ONE shared answer letter `--ans-letter-*` (16/24, 600, uppercase, --ink-qnum) on the 22px hang column); IB-2 = focus + typing motion (scale(1.014) in place, shadow straight underneath, the 2px --action ring (--ib-ring 75%), .18s; key-press ring strength via `[data-ib2]`; reduced motion = colours only; judged/rbox/proof never lift); IB-3 = THINKING (3.5px action-family aurora ring -- action-fill -> action -> action-on + 7px-blur glow on a static mask, sinking box scale(.986), blurred value; reduced motion = a static .6 --action ring, no sink/blur); IB-4 = VERDICT (the frozen aurora arc + two rotating conic arcs under the same static 3.5px mask, 440ms transform-only close, ring stays, the icon fades .25s after the close; reduced motion = a static closed ring); IB-5 = the multi row's reserved 60px key column OUTSIDE the field (desktop 36/prompt/field 1fr/60), so the key never widens or shifts the box (the key look is verdict-v7.css §ib5-key); IB-7 = the miss hint card's SNUG gap under the typed box (the single miss folds the empty #preview room; multi: the card sits 8 under the grey hint); SINK = the resting box is an inset dark well (--ans-field, --ib-well dark inner shadow, no resting edge since Nov 26), focus lifts + draws the 2px --action ring but keeps the well; HINT-UNDER = `.phow`, the grey `how` line 8px under each box (single + every multi part; the prompt is above its box at EVERY width, the old desktop side-by-side row is gone); multi part gap 16 (was 24, scale 4/8/12/16/24/32). | strip look, typed-answer field look, multi key slot, focus lift / key-press nudge, the thinking ring, the verdict ring, the miss hint gap |
| `client/answer/answer_strip/bento_feat.js`, `bento_cost.js` | bento4 pure halves (no DOM): content class + shape prefs; ordered exact-cover top-K search + seeded pick. Smoke: `tools/audits/bento_feat_smoke.mjs`, `bento4_smoke.mjs`. | tile shape / ambition tuning (W block in bento_cost.js) |
| `client/answer/answer_strip/bento.js` | MC + pick-all options behind `html.ui-v7`: now FLOW (flowLayout / flowCols: choices flow down, column count c (1-3) by measured text width, rows split evenly (3+2, 2+2+1) so no hole, natural heights, 16px; Q#737). MCX-1: the question-level `choice_style` (read from `.choices[data-cs]`, app.js renderQuestion) picks the look: `text` (default) = ONE full-width column, no search; `math` = flowCols. The mosaic + phone-fill code below it is kept but unused. Old description: probes each option at every column span, exact-cover search in option order (no holes), writes grid spans on `.ch`. Inert with the flag off. | MC / pick-all tile layout |
| `client/answer/answer_strip/bento_feat.js` | bento4 pure: classify each option (TOKEN/SHORT/WIDE/TALL/LONG) from probe measures -> shape prefs + hero weight. No DOM. | bento content class |
| `client/answer/answer_strip/bento_cost.js` | bento4 pure: ordered exact-cover top-K search + variety cost (W weights) + seeded pick; node cap + time guard; stacked fallback. No DOM. | bento layout search |
| `client/answer/answer_strip/bento_fill.js` | PHONE-FILL pure (no DOM), <= 480px: tile weight from text length, linear-partition rows (in order), 60-column spans, row-count choice, row-height stretch. Smoke: `tests/mc-bento.pw.mjs` (phone-fill steps). | phone MC / pick-all justified rows |
| `client/answer/answer_strip/bento.css` | MC / pick-all option look under `html.ui-v7`: state by fill (no borders), mosaic geometry (--bc columns, unit 96); `.fill` = phone justified rows (60 columns, section C). §swiss-ratio / §swiss-key (section E): the FLOW tile on the Swiss grid (24px letter column + value left-aligned; the letter is the shared `--ans-letter-*` 16/24 600 uppercase `--ink-qnum`, the value type step 1 = 20/28, 64px tile); the MC key is NOT in the tile: it lives in the `.chk` row under the choices (verdict-v7.css §key, Tony Nov 26). Section (F) MCX-1 (Tony Nov 27) replaces (E)'s single tile by two looks keyed on `.choices[data-cs]` (bank field `choice_style`, SCHEMA.md): TEXT (default) = a normal full-width stack, words LEFT-aligned, the muted letter INLINE at the shared 16px (first-line text-indent 24, no 52px key reserve, no `text-wrap: pretty`); MATH = the bento, content CENTRED, the MINI 16px letter top-left. Pick-all keeps section D. Smoke: `tests/mc-tile-type.smoke.mjs`. | MC option colours, tile look |
| `client/answer/answer_strip/verdict-v7.css` | Verdict under `html.ui-v7`: no visible tray, the verdict slot is the Cluck button, row + Next one pill, the verdict line visually hidden; §key = SHIPPED KEY, the ONE Check / Next key of every answer family (typed #ansGo, multi .send, MC #mcGo in the `.chk` row, pick-all #mcGo, proof #ansGo and the .nx that replaces each): --chip face, --ink glyph (app.js IB1_GO), 60px beside / under its answer (typed, multi, MC, pick-all) or 44px inside it (proof, inset 8), radius calc(18px * --r-k) + superellipse, states (empty .35, idle, hover 82% + white, focus-visible ring, press scale .96, BUSY spin, VERDICT cross / tick then .35 when wrong); the one `<path>` morphs arrow -> spin -> cross / tick -> arrow through CSS `d` (app.js keyVerdict: freeze + 180deg ease, 120ms morph, 600ms hold, 200ms exit; Safari cross-fades), no old §verdict-morph 1150ms flood / .vm-ico; §ick4-wrap = the v7 proof field as `.pwrap > #ans[contenteditable]`, text flows around the keys (float + shape-outside; app.js proofField / ceField); IB-4b at the foot = a typed box keeps its resting ground on a verdict. §ick12-key (main) = both Checks (#mcGo, #ansGo) as one squircle key, bottom-right (ICK C4a); §ib1-key (main) = the single typed box's #ansGo outside to its right (60x60); §ib5-key (main) = each multi part's .send in that same outside slot (60x60, 12px gap). | verdict slot, joined row + Next, the Check key, key stages |
| `client/cluck/cluck_btn/cluckbtn.js` | The one Ask Cluck button at the top right of every question card, behind `html.ui-v7`: states (off / ready, aria-disabled + note; no "first" state: before a try a press opens Cluck on the starter chip), sheen, `html.cluck-ready`; FLIP morph card <-> phone proof box (mount). Reads cluck.js through `window.stemCluckAsk`. | the Ask Cluck button, its toast, its sheen triggers |
| `client/cluck/cluck_btn/cluckbtn.css` | Styles of the Ask Cluck button (base chip for non-qc7 cards; the card look is qcard.css §ick5-tr): chip look, disabled option A, left-to-right fill sweep, sheen. | button look, motion |
| `client/cluck/ask_glass/ask-glass.js` | The R3 glass Ask bar of Cluck's sheet behind `html.ui-v7` (classic script, `window.stemAskGlass`): liquidglass lens engine (MIT, gentpan @ d5db099) + the aria-hidden synced copy of the reply (scroll-synced, MutationObserver) + the locked strip and its unlock sequence + the thinking light (120 lens maps by clock) + the iMessage send morph (FLIP). Firefox (engine gecko) gets none of the lens: no copy, no maps, plain frost (ag-frost). Has a CODEMAP header. | the Ask bar glass look or motion, the locked strip, the thinking light, the send morph |
| `client/cluck/ask_glass/ask-glass.css` | Styles of the glass Ask bar under `html.ui-v7`: floating footer (56px, radius 20, 560px cap), layers (.g-copy .g-tint .g-rim .g-haze .g-lock .g-sweep .g-think), send button D, locked strip, thinking ring (rotating square under a static mask), fallbacks (.ag-solid, .ag-frost), the starter chip's Free tag. | bar colours, sizes, fallbacks, thinking look |
| `client/answer/qcard/qcard.js` | The question card hero behind `html.ui-v7` (QCARD-SWISS v2): moves the last sentence into a big title bottom-left, ghost numeral (ECHO B), moves the Twist chip into the meta row, ASK-PIN (no fold, no inner scroll: the bold ask strip pins at the top of a long card, tap = back to the full question), anchor() = ANCHOR-BOTTOM for the block card (spare height under the floor -> the text block's top margin). shortText() sets .qshort (<= 4 body lines). §ghost-glass: glassDefs() (one static SVG filter #qg-glass) + scrims() (one blurred pill per text line, .qscrim). §frost: one .qfrost sheet over the WHOLE card (inset 0) + the static lens map (#qg-lens, lens()), the one look (no variants). Inert with the flag off. | question card layout, title / setup split, the ask pin, the bottom anchor, the glass under the numeral, the frost lens |
| `client/answer/qcard/qcard.css` | Looks of the hero card under `html.ui-v7`: one Swiss grid (--qpad), scrim, ghost numeral, tight text (1.35; 1.25 short), the sticky ask strip (no fold, no Q-HALF cap), and §ick5-tr: Ask Cluck as a tangerine squircle FLOATED at the card's top right, text wraps around it (--ick5-size 44px = the one size knob, hollow duck #i-duck-line, ready = raised with --shadow-2 (Tony Nov 27; locked + pressed flat), kicker removed, duck dance); SWISS-RATIO (Tony Nov 26): title one step above the answers (25/32 phone, 31/40 desk), ask = body step 16/24 bold. §ICK4-SHORT-LH: 1.35 body leading, 1.25 for short text (qcard.js shortText); §ghost-glass: the ghost numeral as glass (rim filter, sheen, text scrim, softer mask, reduced-transparency solid); §frost: ONE glass sheet over the whole card (inset 0, inherit radius: static displacement lens + 3px frost, reduced-transparency / Save-Data (html.fx-dim-a11y, NOT perf fx-dim) fallback = plain filter blur on .qghostbox). GAP-BAND v2 (Tony Nov 25): a deliberate --s5 = 24px gap under the card on every width (single + multi) with a faint cast shadow; a multi's answer panel is its own rounded surface (strip.css). Smoke: `tests/ghost-glass.smoke.mjs` (390 + 1280, text-on-numeral contrast >= 4.5, one filtered layer). CLUCK-RAISE (Nov 27): the squircle rests on --shadow-2, flat when locked or pressed; smoke `tests/cluck-raise.smoke.mjs`. | question card look, ghost numeral, the Ask Cluck squircle, the frost sheet |
| `client/answer/keyf_glass/keyf-glass.js` | The smoked-lens glass on the Key formulas card behind `html.ui-v7` (classic script, `window.stemGlass.mount(card, { seed })` -> `{ refresh, destroy }`): scene + lens filter + tint + grain + rim in a `.kg` layer, drift + water bob. app.js formulaCard() mounts it. | the Key formulas card glass look or motion |
| `client/answer/keyf_glass/keyf-glass.css` | Styles of the glass layers (`.kg`, `.fcard.kg-on`), fallbacks for reduced transparency / contrast. | glass look |
| `client/shell/repair/repair.js` | Repair + welcome ladder UI (mount, variants, typed verdict chips). | repair steps, welcome ladder |
| `client/shell/repair/repair.css` | Styles of the repair ladder. | repair look |
| `client/shell/repair/ladder-v7.css` | Ladder card, chips, hint, input, under `html.ui-v7`: state by fill, no edges; LADDER-TYPE = the type + colour pass (title Schibsted 20 in --action-on, rest Atkinson 16, tabular numbers); LADDER-UNIFY = one look for both ladders (answered values are verdict chips, no row-end tick); LADDER-FIELD / LADDER-KEY = the typed-answer 60px sink well, inside unit and 60px arrow key; LADDER-SHORT = short-viewport room for the docked calc toast. | ladder card colours, fonts, chips, hint duck, field, value verdicts |
| `client/cluck/jev_nudges/intent.js` | Event-line log and rule counters (Jev); decides help modal. | Jev rules, help timing |
| `client/cluck/jev_nudges/lockhelp.js` | "Let me help you with that!" modal. | lock help |
| `client/shell/stages/stages.js` | Cluck's live step list while he works. | wait UI |
| `client/shell/stages/stages.css` | Styles of the step list. | step list look |
| `client/cluck/mini_cluck/minicluck.js` | Tiny Cluck on a sub-step. | mini-Cluck UI |
| `client/cluck/mini_cluck/minicluck.css` | Styles of the tiny Cluck. | mini-Cluck look |
| `client/shell/welcome/welcome.js` | Q1 welcome item. | welcome question |
| `client/shell/welcome/welcome.css` | Styles of the welcome item. | welcome look |
| `client/shell/welcome/welcome-first.js` | Sends new visitors to the welcome page once (cram window). | first-visit redirect |
| `client/shell/login/login.js` | "My Cluck" save and login dialog. | accounts UI |
| `client/shell/login/login.css` | Styles of the login dialog. | login look |
| `client/shell/toast/toast.js` | The one toast component (window.stemToast): stage toasts, notes. | toasts, notes |
| `client/shell/toast/toast.css` | Styles of the toast. | toast look |
| `client/shell/popover.js` | The one rich-context popup. | popovers |
| `client/cluck/brainrot.js` | Brainrot corner (sugar mode only); none under 900px wide, no handle (ICK5-NOROT). | brainrot corner |
| `client/calc/coach/calc-coach.js` | Calc Coach panel. | Calc Coach |
| `client/calc/coach/calc-coach.css` | Styles of Calc Coach. | Calc Coach look |
| `client/calc/model_picker/calc-pick.js` | Calculator model picker. | calculator picker |
| `client/calc/model_picker/calc-pick.css` | Styles of the picker. | picker look |
| `client/cluck/pops.js` | When Cluck may crack a humor pop (pure). | humor pop rules |
| `client/shell/offline.js` | Offline layer: registers sw.js, uploaded problems.json bank. | offline, upload |
| `client/shell/telemetry/telemetry.js` | PostHog + Clarity loader and window.stemT. | analytics events |
| `client/shell/telemetry/flight.js` | Flight recorder: captures stages and API status at an error. | error reports |
| `client/shell/fx.js` | Blur gate and device tier (runs in head): html.fx-dim (any reason; deviceMemory <= 1 = MEM_DIM_MAX) + html.fx-dim-a11y (only reduced transparency / Save-Data; the qcard frost keys off this one). The slow-probe result is session-only, no localStorage latch. | performance classes |
| `client/pure_logic_modules/chg.mjs` | Token diff of a snack against its original. | highlight changed numbers |
| `client/pure_logic_modules/codes.mjs` | The one place that knows problem-code prefixes. | code rules |
| `client/pure_logic_modules/incident.mjs` | Incident codes the student can read out. | incident codes |
| `client/pure_logic_modules/mode.mjs` | Sugar or diet mode per browser. | mode switch |
| `client/pure_logic_modules/mycluck.mjs` | My Cluck login image (pixels + QR). | login image |
| `client/pure_logic_modules/progbar.mjs` | Notch progress bar state: sets of 7, answered order, partial, streak run, carry (not wired yet). | progress bar rules |
| `client/pure_logic_modules/quack.mjs` | Random QUACK prefixes for hint feedback. | hint prefix |
| `client/pure_logic_modules/texfix.mjs` | TeX fix before KaTeX: qmark braces a bare `?` after a relation so `L = ?` keeps its space. Used by app.js renderMath, views.js texNode, graph.js (via FigCheck.qmark, set by app.js). Smoke: `tests/texfix.test.mjs`. | a `?` or other TeX spacing quirk in rendered math |
| `client/pure_logic_modules/titles.mjs` | isSlugTitle / cardTitle: is a problem title human or a slug (ES module, also read by schema-check.mjs). | a slug shown as a title; the title rule |
| `client/pure_logic_modules/redo.mjs` | What happens after a miss on an item with a ladder. | redo rules |
| `client/pure_logic_modules/sheet.mjs` | Pure maths of Cluck's phone sheet. | sheet drag |
| `client/pure_logic_modules/shuffle.mjs` | Seeded shuffle, queue pick, mock list. | question order |
| `client/pure_logic_modules/slips.mjs` | JS twin of slips.py: slip matching on device. | slip hints on device |
| `client/pure_logic_modules/speak.mjs` | Cluck text as words for voiceover. | voiceover |
| `client/pure_logic_modules/steps.mjs` | Renumber step badges, pipe tables. | step badges |
| `client/pure_logic_modules/suggest.mjs` | Code box suggestion list. | code box |
| `server/http_server/serve.py` | The whole server (dispatch() shared with api/index.py): routes (/check /b /p /state /diagnose /narrate /mini /health), grading + tries (grade, same, slip_hit), modes (sugar/diet), Cluck genie / chat / NOTE streams, proof grading, incidents. Has a CODEMAP header with 15 anchors; see its section below. | any server behaviour: a route, a verdict, a Cluck prompt, an incident code |
| `api/index.py` | Vercel entry; imports http_server/serve.py. | Vercel routing |
| `server/accounts/acct.py` | My Cluck accounts: token over the sid cookie. | accounts |
| `server/cluck_reply_checks/aiw.py` | Python port of the avoid-ai-writing detector: unicode tables, JS-regex-to-Python engine (jsre), pattern tables, masks (code / markdown), `lint_view_strings` for the gate. Mostly regex tables; must match vendored patterns.js. Has a CODEMAP header. | view string lint verdict; a regex or pattern-table bug |
| `server/cluck_reply_checks/aiw_rewrite.py` | LLM rewrite of lint-flagged view strings. | view string rewrite |
| `server/cluck_reply_checks/copy_gate.py` | Gate checks for student-facing words (grade level, jargon). | view copy rules |
| `server/answer_grading/expr.py` | Expression answers: ask for the student's work after a miss. | expression answers |
| `server/cluck_reply_checks/livefig.py` | Live figures: one fig fence per reply as data. | figures in replies |
| `server/mini_cluck/mini.py` | Mini-Cluck server side (Socratic helper). | mini-Cluck prompts |
| `server/cluck_reply_checks/oui.py` | OpenUI Lang 1.0 parser and validator in Python (port of lang-core): lexer, statement split, Pratt expressions, builtins, schema, validate, materialize, parse + StreamParser, merge, evaluator, canon. Has a CODEMAP header. | reply view parsing, validation, streaming parse, canonical form |
| `server/answer_grading/slips.py` | Slip families for a wrong plain-number answer. | slip hints on server |
| `server/cluck_reply_checks/views_gate.py` | Server gate for Cluck's openui fences. | view fence gate |
| `server/` | Python server and its data: moved from the repo root (serve, accounts, grading helpers, OpenUI parser). Covers all of server/. | server code, server layout |
| `server/data/` | Server-only data: problems.json, skills.json, banks/, prompts/. See server/data/README.md. | questions, banks, prompts |
| `server/vendor/` | Vendored server-side libs (avoid-ai-writing). Do not edit. See server/vendor/README.md. | never, unless updating a lib |
| `deploy.sh` | One-shot install and deploy by hand. | by-hand deploy |
| `vercel.json` | Vercel routes, function files (includeFiles), build command. | Vercel config |
| `server/data/problems.json` | Question set (answers inside: never public). | questions |
| `server/data/skills.json` | Skill list. | skills |
| `SCHEMA.md` | Format of problems, banks, graph blocks, ladders. | any data format |
| `api/` | Vercel function entry. | Vercel entry |
| `server/math_engine/` | Python math tools (graph, symbolic) used by serve.py. | symbolic math |
| `.claude/hooks/codemap-first.sh` | Repo CODEMAP-first gate: pipes the PreToolUse hook JSON to brain `scripts/w147-guard.sh` (E6) when present, else allows. Registered in `.claude/settings.json`. Logic lives only in the brain. | the CODEMAP-first hook, Claude Code hook setup |
| `tools/build_and_ship/` | Build + ship the site (build_public.py, bundle.py, ship.sh, openui/). | build, deploy |
| `tools/build_and_ship/splash_skeleton.mjs` | SKELETON-SPLASH generator: measures the real v7 page per bucket (phone 390, tablet 768, desk 1280, desk+brainrot) with the vendored auto-skeleton core and rewrites the launch splash in index.html between the SK markers (static blocks + CSS); also writes splash_skeleton.layouts.json. Run when the card / bar / tile CSS changes. | the launch splash look, its buckets, its colours |
| `client/vendor/auto-skeleton.js` | auto-skeleton core 0.1.1 @419cfad (MIT), build-time only: measure() + renderSkeleton() used by splash_skeleton.mjs; not loaded by the page. Do not edit. | never, unless re-vendoring |
| `tools/build_and_ship/bridge_gen.py` | Writes vercel.json bridge rules (stub rewrites + 307 redirects) from the rename map; BRIDGE, todo 167. | old URLs, vercel.json |
| `client/shell/stale_reload.js` | BRIDGE stub (todo 167): a stale page's old .js URL reloads once after a service-worker update. | old URLs, stale pages |
| `tools/operations/` | Workflow + incident scripts (CI train batch.sh/ci-*.mjs, spend, prune). | CI, ops |
| `tools/operations/ci-live-ok.sh` | VISUAL-PR GATE verdict of the `live-ok` job (a need of `all`, ci-all-verdict.sh): labels nonvisual = pass, visual needs live-ok-tony, neither = fail. Smoke: `tests/test_ci_all_job.py` (LiveOk). | the visual-PR gate, PR labels in CI |
| `tools/bank_tools/` | Bank checks + edits (slips.py, schema-check.mjs, tol.py, fig_png.mjs, mc_style.py = MCX-1: classify each mc item's `choice_style` math / text and write it). | banks, problems |
| `tools/client_generators/` | Write app files (gen_views.py, rw_icons.py, split-app.mjs). | generate, views |
| `tools/benchmarks/` | Bench + replay scripts, jev-model.mjs. | bench, perf |
| `tools/audits/` | UI screenshots + measures (button_audit, dogfood, splash_shots, bento3_gallery). | audit, UI |
| `tools/author/` | Problem authoring loop (gen-loop.mjs). | authoring |
| `tools/repo_checks/` | Repo checks (move_inventory, codemap, mutants). | checks, refactor |
| `tools/repo_checks/client_paths.py` | Static path checker: dangling import/src/href/url in client files. | dangling path, checks |
| `tests/` | All tests; run with tests/run-all.sh (--quick for the fast tier). | test or fixture |
| `tests/smokes.pw.mjs` | CI lane that runs every `tests/*.smoke.mjs` in turn (each boots its own server). A new feature smoke joins CI just by its name. | adding a feature smoke |
| `tests/inputbox-static.smoke.mjs` | Soft lift smoke: IB-1..IB-5 static look, focus lift, thinking ring, verdict ring, multi key, the typed letter (shared 16/24 600 uppercase --ink-qnum on its 22px hang column), 390 + 1280, flag off; IB-7 = the miss hint card's gap under the grey hint (mock 12 +-4, single + multi); GAP-BAND step = card meets the answer panel (no band), grey hint under each box, parts 16 apart. | the typed-answer look or motion |
| `client/rewards/` | Coin and star fx scripts and icons. | rewards fx |
| `client/resources/texts/` | Cluck line pools (JS data) and payload spec. | Cluck wording |
| `shared/openui/` | OpenUI view registry, library.json, prompts. | view components |
| `client/vendor/` | KaTeX, fonts, libs. Do not edit. | never, unless updating a lib |
| `server/data/banks/` | Practice banks with answers (server only). | a bank |
| `server/data/prompts/` | Runtime LLM system prompts. | Cluck prompt text |
| `client/shell/blind/` | Blind-locale test data. | blind test |
| `client/calc/` | Calc Coach json and svg. | Calc Coach data |
| `docs/` | Notes, plans and MC.md (multiple choice A–G and hints). `docs/design/` holds the design notes and plans. | a design note, a plan, MC |
| `docs/MC.md` | Multiple choice (A–G) and hints. | MC answers, hints |
| `archive/` | Old mockups, shots and prototype pages (`archive/design/`, `archive/try/`). Not shipped; kept for reference. | an old mockup or prototype |
| `client/labs/views_demo/` | The views demo only (views-demo*). Old prototype pages moved to `archive/try/`. | views demo |
| `.github/workflows/` | CI: tests.yml, box.yml (self-hosted flake hunt after a tests run: never gating), stress.yml (dispatch: one spec x n under CPU load), ship.yml (+ SHIP_MODE: auto-ship.yml, culprit.yml), prune.yml, spend.yml. | CI |
| `.github/workflows/box.yml` | The tandem box (titodori-1) flake hunt: after a tests run on main, never gating, never in `all.needs`. | CI, flaky hunt |
| `client/answer/explain_box/explain-box.css` | Styles of the explain box. | explain box look |
| `client/answer/explain_box/explain-box.js` | Explain box: auto-growing textarea + edit-history snapshots (docs/design/EXPLAIN-BOX.md). | the explain box |
| `client/labs/` | Design labs: standalone `*-lab.html` pages (login, mini, popover, repair, welcome). | a lab page |

## Section-level depth (big files)

Anchors are `== §name ==` lines in the file; find one with `grep -n '== §name ==' <file>` and open only that slice (line numbers are never kept). Each line: what the part holds, then when to open it.

### server/http_server/serve.py
- §bank: problems.json + banks/*.json loader, bank versions, public/hidden split (problems, banks, ladder, sheet, formulas, max_tries) — open when a question or bank does not load or a version/ladder is wrong
- §modes: sugar vs diet mode and the sugar split of choose-all into True/False rows (mode_of, sugar, hidden, sub_problem, lookup, view, public) — open when a question shows in the wrong mode or a split row is wrong
- §math: sympy behind a token allowlist (to_python, evaluate) — open when a symbolic answer fails to evaluate
- §grading: number / unit / sig-fig grading, slip hints, tries store, repair_check (same, tol_of, unit_correct, slip_hit, state, mark, grade) — open when a verdict, tries count or slip hint is wrong
- §tries-store: KV-FRUGAL slice 3 per-browser tries HASH behind `STEM_TRIES_HASH` (default off), 120-day / preview 1-day TTLs, preview key prefix, the per-request `TriesStore` (tries_hash_on, TriesStore) — open when the flag, a key, a TTL or KV traffic is wrong
- §expr-answers: W137 expression answers and L3 diagnose (expr_mode, expr_hit, expr_l3, diagnose, expr_explain_store) — open when an expression answer or /diagnose misbehaves
- §incidents: S-XXXXX incident codes + one JSON log line (incident, log_incident, health_state, OutOfCredit) — open when adding or reading an incident code
- §trace: per-request flight-recorder trace (set_trace, trace_id, log) — open when a trace line is missing
- §genie: Cluck genie after a wrong answer, OpenRouter stream (explain_prompt, explain_stream, graph_json, wish_pick) — open when the genie reply or its prompt is wrong
- §claude-pipe: Claude API path, spend and cooldown (claude_params, claude_system, claude_ok, claude_spent, ReplyCut) — open when the Claude stream, cost cap or fallback acts up
- §prompt-v4: v4 prompt (Tony's letter as system), leak guards, figure re-ask, the pre-try nudge (v4_user, v4_dynamic, leak_scan, prompt_guard, fig_spec, PRE_TRY_LINES, PRE_TRY_RULE, pre_try_lines) — open when a reply leaks the answer or a figure spec is wrong
- §cram-day: TEMPORARY Exam 3 guidance, subject gate, v4_stream, _cluck_stream, emoji_cut — open when cram-day guidance or the stream wrapper is wrong
- §stage-events: the wait-step lines (stage_line, _staged_relay, explain) — open when the step list shows wrong stages
- §note-chat: NOTE call under the box and follow-up chat (note, note_block, CLUCK_CHAT, CHAT_TURNS) — open when the note or a chat turn is wrong
- §proof: proof items W107 (proof_grade, proof_judge, proof_ladder_ok, proof_hint, chat_history, chat) — open when a proof answer is graded or hinted wrong
- §routes: check_stream, _json, dispatch / _dispatch (/check /diagnose /narrate /mini /calc /health /b /p /state), Handler, `__main__` — open when adding or debugging a route, status code or startup

### client/answer/drill_core/app.js
- §markdown-tex: markdown + TeX render (renderMath, tok, hl, codeblock, md) — open when question text or math renders wrong
- §grading: the one on-device grading place (frReq, net, check, staged, same, sig3, unitOk, exactInt, answerOf) — open when a verdict or sig-fig rule is wrong
- §entry-box: code bar + upload + suggestions (isProof, oneBox, syncCode, putCode, knownCodes, sugShow, sugPick) — open when code entry or suggestions break
- §banks: practice banks (bankChanged, leaveBank, openBank, openBankIn) — open when switching banks
- §problem-state: load and render one problem (setBusy, getProblem, load, render, proofHome) — open when a problem loads or draws wrong
- §twist-chip: Twist chip + its one-time toast (twistChip, twistPop, twistToast, snackChg, drawFigures) — open when the Twist chip acts up
- §welcome-q1: the welcome Q1 (welcomeDue, welcomeLadder, welcomeQ) — open when the first-visit question is wrong
- §repair-ladder: repair ladder after a miss (repairAfterMiss, genLadder, repairSkip, repairPick, rpUnmount) — open when ladder steps misbehave
- §mc-arrow: MC render + the one arrow (renderQuestion, keyMovedHint, ladderStep, ladClock, midNotes, docHTML, drawDocFig, keyfFit, keyfLayout, keyfRows) — open when MC options, mid-notes, keyframes or the Key formulas card fit and balanced rows draw wrong
- §second-try: the 10-second wait (startWait, cancelWait, waitPaint, waitSave) — open when the second-try timer breaks
- §freeform: typed answer, same arrow (wireFF, xPreview, submitFF, proofCE, proofField, ceField) — open when a typed or proof answer box misbehaves
- §multi: multi-part answers (wireParts, submitPart, partFeedback, settle, record, doneStore, saveDone, doneExit) — open when a multi-part item grades or saves wrong

### client/cluck/cluck.js
- §genie: wish stream, cache, element (wishLog, ckKey, ckPut, wishFromCache, wishEl, wishReset, wishNew) — open when the Cluck reply stream or cache is wrong
- §live-figs: live figures and views in a reply (leadOut, slotsResolve, viewImage, figDrop, wishFigs, wishHTML, wishBody, wishCut) — open when a figure in a reply is missing or wrong
- §peek: start of the steps (peekText, ctaHTML, wishPaint) — open when the peek or CTA is wrong
- §sheet: Cluck's sheet, one home for what Cluck shows (clEl, clDrag, clPlace, clOpen, clPerm, cluckToast) — open when the sheet drags, opens or places wrong
- §dismiss: dismiss / back of Cluck's column on desktop (hkShow, clBack, clBackSync, clAvail, clEnter, clTab) — open when Cluck's column will not close or come back
- §ask-field: the ask field + the starter chip + the v7 glass bar's lock (clIdleSync, clAskFocus, clAsk, clLockSync, askFit, clTry, clStatus, clHist, clSend) — open when a follow-up question is sent or shown wrong

### client/shell/shell.js
- §rewards: sugar rewards (RW, rewardOn, rwSync, rewardTry, rewardMulti, rwMastery, rewardGo) — open when coins or stars misfire
- §snack-original: the original beside a snack (origRender, hintNudge, origOpen, origPlace, rewardShow, rwBanner, comeback) — open when the original panel or banner is wrong
- §scratchpad-copy: scratchpad box mount (mountBox) — open when the scratchpad box does not mount
- §scratchpad-autosave: pad store, autosave, Copy (padGet, padPut, autosave, reentry, copyText, copyPad) — open when pad text is lost or Copy output is wrong
- §copy-math: copy math as plain text (selPlain, touchesMath, mathCopyBtn) — open when copied math is wrong
- §freeze: the freeze layer + dock (dockRoom, barOpen, swipeTab, layoutDock, layoutFreeze, showQuestion) — open when the freeze or dock layout breaks
- §swap: Swap panes (setSwap, applyPane, setPane, layoutSwap, swapFade) — open when Swap misbehaves
- §multitask: Multitask (mtKind, mtRatio, applyMT, layoutMT, padRule, padFoot) — open when split layout misbehaves
- §resume: resume — open when a reload does not restore state
- §boot: startup order (pageState) — open when something runs in the wrong order at load

### client/answer/drill_core/app.css
- §entry-box: entry bar and dock (.top .dock .entry .code-box) — open when the code bar looks wrong
- §one-button: the one button system (.btn .btn-go .waiting) — open when any button looks wrong
- §main-column: main column — open when page width or spacing is wrong
- §freeze: freeze layer (#sentinel .freeze .freeze-in .more) — open when the sticky top looks wrong
- §question: question and choices (.q .choices .ch .opt .badge .txt) — open when the card or an option looks wrong
- §default-cue: default cue labelled Next (.nx .nf .ch.cue) — open when the Next cue looks wrong
- §cluck-surfaces: Cluck's surfaces (.ai-skin .ai-box .cl .cl-bar) — open when Cluck's box or sheet looks wrong
- §scratchpad-copy: scratchpad + copy (.work .xb .xb-label .xb-save .xb-field) — open when the scratchpad looks wrong
- §multitask: multitask (.sash .pstrip .mt-mode .pad-fab) — open when split layout looks wrong
- §note: the toast (#toast and its states) — open when the note looks wrong
- §lock-help: lock-help modal (.lockhelp .lh-col .lh-say .lh-btns) — open when the help modal looks wrong

### client/answer/navigation/nav.js
- §bank-link: ?bank= link parsing (deepBank) — open when a bank link opens the wrong bank
- §titles: problem title as plain text (titleOf, plain, clip) — open when a title shows wrong
- §tex-plain: TeX to grader-exact plain text (texLex, texParse, texText, texPlain) — open when copied or titled math is wrong
- §nav-state: bank / mock / night state (init, bank, mark, pool, seqNext, front) — open when progress or the pool is wrong
- §queue: one queue per bank (use, hop, upNext, fams) — open when question order is wrong
- §list-marks: done marks in the list (marks, rows, showList, fit) — open when the list marks are wrong
- §go: Prev/Next press (go) — open when a button press goes to the wrong item
- §mock: night-before mock (startMock, endNightMock) — open when mock night misbehaves
- §ios-back: iOS Back (backTarget, syncBack, reconcile) — open when Back leaves the page

### client/cluck/figures/graph.js
- §json-prep: JSON to drawable, expressions (numify, fnOf, prepMark, norm) — open when a graph block loads wrong
- §marks: marks shared by scene and cartesian (the S table: surface, incline, poly, seg, arc, circle, dim, rope; LAYER) — open when one mark looks wrong
- §scene-model: scene pre-pass (surfacesOf, inclines, forces) — open when a physics scene is placed wrong
- §layout: draw, measure labels, place, grow padding (mount, drawMarks, axisMinOf) — open when a label overlaps or is clipped
- §axis-cross: where axes cross (crossesOf, crossPlan) — open when an axis crosses at the wrong spot
- §figcheck: figcheck on the final model (figModel, figFindings) — open when an invariant check flags or misses
- §degrade: degrade + telemetry (degrade, figReport, niceStep, ticks) — open when a figure falls back or ticks are wrong
- §cartesian: cartesian plots (cartesian, bars) — open when a plot or bar chart is wrong
- §circuit: kind circuit (circuitLayout, place, gateBody, pinStop, circuit) — open when a circuit draws wrong
- §network: kind network (networkLayout, network) — open when a network draws wrong
- §entry: prep + render + export (prep, render) — open when the Graph.render entry misbehaves

### client/cluck/figure_language/layout-core.mjs
- §language: vocabulary (POINT_OPS, SHAPE_SIGS, LAYER_SIG, KINDS, TONES) — open when adding a shape or op
- §parser: tokenizer + statement parser (tokenize, parseTokens, parseStatement, splitDone, planValue) — open when a statement will not parse
- §geometry: polygon + point helpers (triangulate, segPoly, geomPts, sidePoint, measureOf) — open when contact or containment maths is wrong
- §curve: Curve through named points (crBeziers, flattenCurve, taper) — open when a Curve is wrong
- §session: createSession state, val, pointOp, named, compute, curveGeom — open when a shape lands in the wrong place
- §layers: Layer / Union specs (layerSpec, unionSpec, meta, stepOf) — open when step layers or unions misbehave
- §conflicts: pair + containment checks, hints, mover (pair, containment, conflictsOf, tryMover, check) — open when an overlap finding or push vector is wrong
- §settle: DAG settle (combine, block, settle, detectCycles, validateFix, rebuild, applyFixes) — open when Fix or cycles misbehave
- §stream: incremental input (snapshot, addText, push, end) — open when streaming input mis-parses
- §findings: plan / pending / meta / leak findings (planOut, pendingFindings, metaFindings, applyShush, leakFindings) — open when a finding message is wrong
- §result: result() output object — open when the output shape changes
- §ghosts: dashed ghosts as data (paramsOf, ghostOf, ghostLine) — open when a ghost is wrong
- §scene-summary: one line per shape for the LLM (sceneSummary, planLines, legendLines, stepLines, formatFindings) — open when the LLM-facing text is wrong
- §view-layout: screen view + label layout (layoutView, fitView, zoomView, toScreen, remap) — open when a label placement or zoom is wrong

### client/cluck/openui_views/views.js
- §dom-helpers: register, h, fill, rich, icon, button (no innerHTML) — open when adding a DOM helper or slot fill
- §statements: statement splitting (splitStatements, rootIds, capError) — open when streaming splits wrong or caps fire
- §session: class Session, mountView, render, stream (paint per statement, error boundary, Reveal patch merge) — open when streaming or patching a view breaks
- §figure-marks: graph + geometry drawing (graphModel, drawGraph, geoModel, drawGeometry, sample, chips, table) — open when a figure in a view draws wrong
- §l0: View, Head, Text, Legend, Table (Tug and Flip -> Table fallbacks), Graph, Geometry — open when one of these components is wrong
- §l1: Callout, Answer — open when those components are wrong
- §steps: Steps helpers (litMarks, sayMap, texHue, texNode) + Steps — open when the stepper or its lit parts are wrong
- §hints: Hints — open when hints reveal wrong
- §predict-reveal: Predict (posts the pick) + Reveal (patch-merged body) — open when predict or reveal misbehaves
- §doodle: Doodle — open when the doodle draws wrong

### server/cluck_reply_checks/aiw.py
- §unicode-tables: unicode ranges as node sees them (_ranges, _complement, _bmp_class) — open when a char class differs from JS
- §regex-engine: JS regex to Python (_Tr, RX, jsre) — open when a regex translates wrong
- §js-helpers: JS number / string / UTF-16 helpers (js_trim, js_round, js_tofixed, cps, cp_len) — open when a count differs from JS
- §detector: detector start, same order as the JS — open to find where detection begins
- §normalize: tier 1 pre-pass (normalize_text, counts_as_bypass) — open when lookalike chars are mis-normalized
- §technical-exempt: technical exempt words (features_is_noun) — open when a technical word is flagged
- §pattern-tables: issue weights and pattern tables — open when changing a pattern; do not reorder
- §neg-parallelism: negative parallelism issues (negative_parallelism_issues) — open when "not X but Y" flags wrong
- §mask-code: fence / inline code / front matter masks (fence_ranges, inline_code_ranges, mask_code) — open when code is linted
- §mask-markdown: rendered markdown mask (mask_rendered_markdown, mask_ignore_regions, mask_quoted_spans) — open when markdown or quotes are linted
- §helpers: tokenize, count_words, get_sentences, match_patterns, build_v2_defaults — open when a count or sentence split is off
- §gate-lint: lint_view_strings, _main — open when the gate's lint verdict is wrong

### server/cluck_reply_checks/oui.py
- §js-semantics: JS value rules (slot_id, js_number, to_number, js_str, truthy, loose_eq) — open when a value coerces differently from JS
- §lexer: tokenizer (tokenize) — open when a token is wrong
- §statements: statement split (auto_close, split) — open when a statement boundary is wrong
- §expressions: Pratt expression parser (parse_expression, prefix, infix) — open when an expression parses wrong
- §builtins: built-in functions (_filter, _sort, _sum, _round, _int_op) — open when a builtin returns the wrong value
- §schema: library schema compile (Catalog, compile_schema, schema_default) — open when the component schema loads wrong
- §validation: value validation (Ctx, params_signature, _leaf, _composite) — open when a valid view is rejected
- §materialize: AST to result (_materialize_call, name_args, map_call_args) — open when call args map wrong
- §parser: parse + StreamParser (_classify, _extract, _build, _find_fence) — open when parsing or streaming breaks
- §merge: patch merge (merge_statements) — open when a Reveal patch merges wrong
- §evaluator: runtime evaluator (Step, Env, get_state, _eval_args) — open when state or plans evaluate wrong
- §canon: canonical form (bindable, env_for, resolve, summarize, canon) — open when the canonical text differs
