# CODEMAP

Open this file first. Find the row for what you touch, then open only that file.
Big files start with a CODEMAP HEADER (purpose, sections, related files). Find a section with: grep -n "== §<name> ==" <file>
Line numbers are never kept. Moved or added a file? Update its row in the same PR (CI/lint checks this).

| path | owns | open when you touch |
|---|---|---|
| `index.html` | The drill page: loads ~40 scripts and styles, plus ES modules. | adding or removing a script or css tag; page markup |
| `calc.html` | The Calc Coach page. | Calc Coach page markup |
| `privacy.html` | The privacy page. | privacy text |
| `sw.js` | Service worker: precache list BASE, cache rules, VERSION stamp. | a new root file must work offline; cache bugs |
| `app.js` | The drill: code entry, grading on device, Cluck box, scratchpad, Copy. | answer flow, Cluck UI, boot order |
| `cluck.js` | The Cluck genie, split out of app.js (152a; cut at the genie banner): wish render, Cluck box, replies. Reaches app.js through `bridge`. | Cluck box, reply render, wish figures |
| `shell.js` | The shell, split out of app.js (152a; cut at the sugar-rewards banner): rewards, copy math, freeze, Swap, Multitask, resume. Reaches app.js through `bridge`. | rewards, Swap, Multitask, dock layout |
| `app.css` | Styles of the drill page and tokens. | colours, sizes, layout of the drill page |
| `nav.js` | Prev / Next, question list, TeX to plain text. Has a CODEMAP header. | question order, list, titles |
| `nav.css` | Styles of the nav and list. | nav look |
| `graph.js` | SVG renderer of graph blocks (cartesian, scene, circuit, network). Has a CODEMAP header. | a figure looks wrong |
| `figcheck.js` | Figure invariants: checks a drawn figure and picks auto hues. | figure rules, auto colours |
| `layout-core.mjs` | The streamed, constraint-checked figure language (Cluck layout core, prototype). | layout engine, figure placement rules |
| `layout-docs.mjs` | The figure language's LLM docs (progressive disclosure) + the built-in scenes of the Figure Lab mockup. | figure language docs or lab scenes |
| `formula-figs.js` | Small pictures for formula-sheet rows. | formula sheet figures |
| `views.js` | OpenUI Lang renderer in the browser. | a Cluck reply view renders wrong |
| `views-lib.js` | Component list of the stem view library (from views/library.json). | add a view component |
| `views.css` | Styles of the views. | view look |
| `strip.js` | Answer strip: typed, multiple choice, pick-all, multi-part. | the answer strip |
| `strip.css` | Styles of the answer strip. | strip look |
| `repair.js` | Repair ladder UI after a miss. | repair steps |
| `repair.css` | Styles of the repair ladder. | repair look |
| `intent.js` | Event-line log and rule counters (Jev); decides help modal. | Jev rules, help timing |
| `lockhelp.js` | "Let me help you with that!" modal. | lock help |
| `stages.js` | Cluck's live step list while he works. | wait UI |
| `stages.css` | Styles of the step list. | step list look |
| `minicluck.js` | Tiny Cluck on a sub-step. | mini-Cluck UI |
| `minicluck.css` | Styles of the tiny Cluck. | mini-Cluck look |
| `welcome.js` | Q1 welcome item. | welcome question |
| `welcome.css` | Styles of the welcome item. | welcome look |
| `welcome-first.js` | Sends new visitors to the welcome page once (cram window). | first-visit redirect |
| `login.js` | "My Cluck" save and login dialog. | accounts UI |
| `login.css` | Styles of the login dialog. | login look |
| `toast.js` | The one toast component (window.stemToast). | toasts and notes |
| `toast.css` | Styles of the toast. | toast look |
| `popover.js` | The one rich-context popup. | popovers |
| `peek.js` | Cluck's duck + sky and the idle peek. | duck, idle peek |
| `brainrot.js` | Brainrot corner (sugar mode only). | brainrot corner |
| `calc-coach.js` | Calc Coach panel. | Calc Coach |
| `calc-coach.css` | Styles of Calc Coach. | Calc Coach look |
| `calc-pick.js` | Calculator model picker. | calculator picker |
| `calc-pick.css` | Styles of the picker. | picker look |
| `pops.js` | When Cluck may crack a humor pop (pure). | humor pop rules |
| `offline.js` | Offline layer: registers sw.js, uploaded problems.json bank. | offline, upload |
| `telemetry.js` | PostHog + Clarity loader and window.stemT. | analytics events |
| `flight.js` | Flight recorder: captures stages and API status at an error. | error reports |
| `fx.js` | Blur gate and device tier (runs in head). | performance classes |
| `chg.mjs` | Token diff of a snack against its original. | highlight changed numbers |
| `codes.mjs` | The one place that knows problem-code prefixes. | code rules |
| `incident.mjs` | Incident codes the student can read out. | incident codes |
| `mode.mjs` | Sugar or diet mode per browser. | mode switch |
| `mycluck.mjs` | My Cluck login image (pixels + QR). | login image |
| `quack.mjs` | Random QUACK prefixes for hint feedback. | hint prefix |
| `redo.mjs` | What happens after a miss on an item with a ladder. | redo rules |
| `sheet.mjs` | Pure maths of Cluck's phone sheet. | sheet drag |
| `shuffle.mjs` | Seeded shuffle, queue pick, mock list. | question order |
| `slips.mjs` | JS twin of slips.py: slip matching on device. | slip hints on device |
| `speak.mjs` | Cluck text as words for voiceover. | voiceover |
| `steps.mjs` | Renumber step badges, pipe tables. | step badges |
| `suggest.mjs` | Code box suggestion list. | code box |
| `tug.mjs` | The Tug view (push-pull rope). | Tug view |
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
| `rewards/` | Coin and star fx scripts and icons. | rewards fx |
| `copy/` | Cluck line pools (JS data) and payload spec. | Cluck wording |
| `views/` | OpenUI view registry, library.json, prompts. | view components |
| `vendor/` | KaTeX, fonts, libs. Do not edit. | never, unless updating a lib |
| `server/data/banks/` | Practice banks with answers (server only). | a bank |
| `server/data/prompts/` | Runtime LLM system prompts. | Cluck prompt text |
| `blind/` | Blind-locale test data. | blind test |
| `calc/` | Calc Coach json and svg. | Calc Coach data |
| `design/` | Live explain-box.* and the `*-lab.html` pages. Notes and plans are in `docs/design/`, mockups and shots in `archive/design/`. | explain box, a lab page |
| `docs/` | Notes, plans and MC.md (multiple choice A–E and hints). `docs/design/` holds the design notes and plans. | a design note, a plan, MC |
| `docs/MC.md` | Multiple choice (A–E) and hints. | MC answers, hints |
| `archive/` | Old mockups, shots and prototype pages (`archive/design/`, `archive/try/`). Not shipped; kept for reference. | an old mockup or prototype |
| `try/` | The views demo only (views-demo*). Old prototype pages moved to `archive/try/`. | views demo |
| `.github/workflows/` | CI: tests.yml, ship.yml, prune.yml, spend.yml. | CI |
