# CODEMAP

Open this file first. Find the row for what you touch, then open only that file.
Big files start with a CODEMAP HEADER (purpose, sections, related files). Find a section with: grep -n "== §<name> ==" <file>
Line numbers are never kept. Moved or added a file? Run `python3 tools/repo_checks/codemap.py fix`, then fill its rows in the same PR (rules: brain `_files/skills/codemap/SKILL.md`; CI checks this).

| path | owns | open when you touch |
|---|---|---|
| `index.html` | The drill page: loads ~40 scripts and styles, plus ES modules. | adding or removing a script or css tag; page markup |
| `calc.html` | The Calc Coach page. | Calc Coach page markup |
| `privacy.html` | The privacy page. | privacy text |
| `sw.js` | Service worker: precache list BASE, cache rules, VERSION stamp. | a new root file must work offline; cache bugs |
| `client/answer/drill_core/app.js` | The drill: code entry, grading on device, Cluck box, scratchpad, Copy. | answer flow, Cluck UI, boot order |
| `client/cluck/cluck.js` | The Cluck genie, split out of app.js (152a; cut at the genie banner): wish render, Cluck box, replies. Reaches app.js through `bridge`. | Cluck box, reply render, wish figures |
| `client/shell/shell.js` | The shell, split out of app.js (152a; cut at the sugar-rewards banner): rewards, copy math, freeze, Swap, Multitask, resume. Reaches app.js through `bridge`. | rewards, Swap, Multitask, dock layout |
| `client/answer/drill_core/app.css` | Styles of the drill page and tokens. | colours, sizes, layout of the drill page |
| `client/answer/navigation/nav.js` | Prev / Next, question list, TeX to plain text. Has a CODEMAP header. | question order, list, titles |
| `client/answer/navigation/nav.css` | Styles of the nav and list. | nav look |
| `client/cluck/figures/graph.js` | SVG renderer of graph blocks (cartesian, scene, circuit, network). Has a CODEMAP header. | a figure looks wrong |
| `client/cluck/figures/figcheck.js` | Figure invariants: checks a drawn figure and picks auto hues. | figure rules, auto colours |
| `client/cluck/figure_language/layout-core.mjs` | The streamed, constraint-checked figure language (Cluck layout core, prototype). | layout engine, figure placement rules |
| `client/cluck/figure_language/layout-docs.mjs` | The figure language's LLM docs (progressive disclosure) + the built-in scenes of the Figure Lab mockup. | figure language docs or lab scenes |
| `client/cluck/figures/formula-figs.js` | Small pictures for formula-sheet rows. | formula sheet figures |
| `client/cluck/openui_views/views.js` | OpenUI Lang renderer in the browser. | a Cluck reply view renders wrong |
| `client/cluck/openui_views/views-lib.js` | Component list of the stem view library (from views/library.json). | add a view component |
| `client/cluck/openui_views/views.css` | Styles of the views. | view look |
| `client/answer/answer_strip/strip.js` | Answer strip: typed, multiple choice, pick-all, multi-part. | the answer strip |
| `client/answer/answer_strip/strip.css` | Styles of the answer strip. | strip look |
| `client/shell/repair/repair.js` | Repair ladder UI after a miss. | repair steps |
| `client/shell/repair/repair.css` | Styles of the repair ladder. | repair look |
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
| `client/shell/toast/toast.js` | The one toast component (window.stemToast). | toasts and notes |
| `client/shell/toast/toast.css` | Styles of the toast. | toast look |
| `client/shell/popover.js` | The one rich-context popup. | popovers |
| `client/cluck/jev_nudges/peek.js` | Cluck's duck + sky and the idle peek. | duck, idle peek |
| `client/cluck/brainrot.js` | Brainrot corner (sugar mode only). | brainrot corner |
| `client/calc/coach/calc-coach.js` | Calc Coach panel. | Calc Coach |
| `client/calc/coach/calc-coach.css` | Styles of Calc Coach. | Calc Coach look |
| `client/calc/model_picker/calc-pick.js` | Calculator model picker. | calculator picker |
| `client/calc/model_picker/calc-pick.css` | Styles of the picker. | picker look |
| `client/cluck/pops.js` | When Cluck may crack a humor pop (pure). | humor pop rules |
| `client/shell/offline.js` | Offline layer: registers sw.js, uploaded problems.json bank. | offline, upload |
| `client/shell/telemetry/telemetry.js` | PostHog + Clarity loader and window.stemT. | analytics events |
| `client/shell/telemetry/flight.js` | Flight recorder: captures stages and API status at an error. | error reports |
| `client/shell/fx.js` | Blur gate and device tier (runs in head). | performance classes |
| `client/pure_logic_modules/chg.mjs` | Token diff of a snack against its original. | highlight changed numbers |
| `client/pure_logic_modules/codes.mjs` | The one place that knows problem-code prefixes. | code rules |
| `client/pure_logic_modules/incident.mjs` | Incident codes the student can read out. | incident codes |
| `client/pure_logic_modules/mode.mjs` | Sugar or diet mode per browser. | mode switch |
| `client/pure_logic_modules/mycluck.mjs` | My Cluck login image (pixels + QR). | login image |
| `client/pure_logic_modules/quack.mjs` | Random QUACK prefixes for hint feedback. | hint prefix |
| `client/pure_logic_modules/redo.mjs` | What happens after a miss on an item with a ladder. | redo rules |
| `client/pure_logic_modules/sheet.mjs` | Pure maths of Cluck's phone sheet. | sheet drag |
| `client/pure_logic_modules/shuffle.mjs` | Seeded shuffle, queue pick, mock list. | question order |
| `client/pure_logic_modules/slips.mjs` | JS twin of slips.py: slip matching on device. | slip hints on device |
| `client/pure_logic_modules/speak.mjs` | Cluck text as words for voiceover. | voiceover |
| `client/pure_logic_modules/steps.mjs` | Renumber step badges, pipe tables. | step badges |
| `client/pure_logic_modules/suggest.mjs` | Code box suggestion list. | code box |
| `client/pure_logic_modules/tug.mjs` | The Tug view (push-pull rope). | Tug view |
| `server/http_server/serve.py` | The server: routes, grading, tries, LLM calls. | any server behaviour |
| `api/index.py` | Vercel entry; imports http_server/serve.py. | Vercel routing |
| `server/accounts/acct.py` | My Cluck accounts: token over the sid cookie. | accounts |
| `server/cluck_reply_checks/aiw.py` | Python port of the avoid-ai-writing detector. Has a CODEMAP header. | view string lint |
| `server/cluck_reply_checks/aiw_rewrite.py` | LLM rewrite of lint-flagged view strings. | view string rewrite |
| `server/cluck_reply_checks/copy_gate.py` | Gate checks for student-facing words (grade level, jargon). | view copy rules |
| `server/answer_grading/expr.py` | Expression answers: ask for the student's work after a miss. | expression answers |
| `server/cluck_reply_checks/livefig.py` | Live figures: one fig fence per reply as data. | figures in replies |
| `server/mini_cluck/mini.py` | Mini-Cluck server side (Socratic helper). | mini-Cluck prompts |
| `server/cluck_reply_checks/oui.py` | OpenUI Lang 1.0 parser and validator in Python. Has a CODEMAP header. | reply view parsing |
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
| `tools/build_and_ship/` | Build + ship the site (build_public.py, bundle.py, ship.sh, openui/). | build, deploy |
| `tools/build_and_ship/bridge_gen.py` | Writes vercel.json bridge rules (stub rewrites + 307 redirects) from the rename map; BRIDGE, todo 167. | old URLs, vercel.json |
| `client/shell/stale_reload.js` | BRIDGE stub (todo 167): a stale page's old .js URL reloads once after a service-worker update. | old URLs, stale pages |
| `tools/operations/` | Workflow + incident scripts (CI train batch.sh/ci-*.mjs, spend, prune). | CI, ops |
| `tools/bank_tools/` | Bank checks + edits (slips.py, schema-check.mjs, tol.py, fig_png.mjs). | banks, problems |
| `tools/client_generators/` | Write app files (gen_views.py, rw_icons.py, split-app.mjs). | generate, views |
| `tools/benchmarks/` | Bench + replay scripts, jev-model.mjs. | bench, perf |
| `tools/audits/` | UI screenshots + measures (button_audit, dogfood, splash_shots). | audit, UI |
| `tools/author/` | Problem authoring loop (gen-loop.mjs). | authoring |
| `tools/repo_checks/` | Repo checks (move_inventory, codemap, mutants). | checks, refactor |
| `tools/repo_checks/client_paths.py` | Static path checker: dangling import/src/href/url in client files. | dangling path, checks |
| `tests/` | All tests; run with tests/run-all.sh (--quick for the fast tier). | test or fixture |
| `client/rewards/` | Coin and star fx scripts and icons. | rewards fx |
| `client/resources/texts/` | Cluck line pools (JS data) and payload spec. | Cluck wording |
| `shared/openui/` | OpenUI view registry, library.json, prompts. | view components |
| `client/vendor/` | KaTeX, fonts, libs. Do not edit. | never, unless updating a lib |
| `server/data/banks/` | Practice banks with answers (server only). | a bank |
| `server/data/prompts/` | Runtime LLM system prompts. | Cluck prompt text |
| `client/shell/blind/` | Blind-locale test data. | blind test |
| `client/calc/` | Calc Coach json and svg. | Calc Coach data |
| `docs/` | Notes, plans and MC.md (multiple choice A–E and hints). `docs/design/` holds the design notes and plans. | a design note, a plan, MC |
| `docs/MC.md` | Multiple choice (A–E) and hints. | MC answers, hints |
| `archive/` | Old mockups, shots and prototype pages (`archive/design/`, `archive/try/`). Not shipped; kept for reference. | an old mockup or prototype |
| `client/labs/views_demo/` | The views demo only (views-demo*). Old prototype pages moved to `archive/try/`. | views demo |
| `.github/workflows/` | CI: tests.yml, ship.yml, prune.yml, spend.yml. | CI |
| `client/answer/explain_box/explain-box.css` | Styles of the explain box. | explain box look |
| `client/answer/explain_box/explain-box.js` | Explain box: auto-growing textarea + edit-history snapshots (docs/design/EXPLAIN-BOX.md). | the explain box |
| `client/labs/` | Design labs: standalone `*-lab.html` pages (login, mini, popover, repair, welcome). | a lab page |
