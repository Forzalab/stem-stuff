# FABLE critique #1 — after wave 1 (Oct 7, advisor; read-only)

Read: genui-major-plan.md (§1, §3, §8), genui-swarm-plan.md (D1–D71), the 5 research topics, PR A/C/D diffs vs origin/main, PR B plans (FLUENCY-SAMPLES, AUDIT-FRUSTRATED, SCHEMA-V2, RUNTIME, VISUAL-TESTS, QUEUE, TELEMETRY, TELEMETRY-BENCH), serve.py 840–985, app.js 150–160 / 895–1095 / 1104–1245 / 1248–1384 / 2184–2200, app.css 500–590, offline.js 100–175, sw.js, nav.js (queue branch), shuffle.mjs (queue branch), the tests on each branch, F's shots audit-06/09/10/40 and C's footer shot. Verified by running: `python3` SimpleCookie parse of a PostHog + Clarity + sid + stem-mode cookie header through `serve.mode_of` → `diet`, sid intact.

Line numbers below are the branch's file (D's nav.js/shuffle.mjs line numbers refer to the diff as it lands).

---------------------------------------------------------------------
## A0 — DEPLOY RISK TONIGHT (iPhone Safari first)

### PR A `-prod` (D6 cookie flag, D7 update bar) — VERDICT: SHIP. Two free guards, one fact for Tony.
1. **mode.mjs:17 `reset()` runs at module import and writes `document.cookie`.** If the cookie setter throws (an opaque-origin sandboxed iframe, some in-app webviews with storage disabled), the exception is thrown at app.js import time → blank page, splash never clears. Cost of the guard: zero. FIX: wrap the two `doc.cookie =` writes in `try { … } catch { return false; }` (mode.mjs:18–21) and `setMode` likewise.
2. **offline.js:145 the tapped bar is `disabled` for up to 15 s with the same text** ("New version ready. Tap to update.") → she taps again, nothing, rage-tap. FIX: `b.textContent = "Updating…"` on the same line as `b.disabled = true`. If the install never finishes in 15 s, the reload lands on the old shell; `controllerchange` then auto-reloads once more (busy resets on load) → converges in 2 loads. Acceptable.
3. **Fact, not a bug: Safari ITP caps every `document.cookie` write to 7 days.** `FLAG` (mode.mjs:11, Max-Age 1y) is a year on Chromium and 7 days on iPhone; the old `stem-mode=diet` was also JS-set, so both expire together and sugar (the default) wins either way. tests/mode-reset.pw.mjs:758 "Max-Age a year" is a Chromium truth only. If DIET_ must stick on iPhone later: set the flag from serve.py with `Set-Cookie` on the `DIET_` bank request (HTTP cookies are not capped).
4. sw.js:118 `if (changed && STAMPED) return r;` is right: the fresh index.html is served, never stored under the old worker, no bar; the new sw.js (updateViaCache none) does the swap. tests/update.pw.mjs:97–121 proves one tap, no second bar, under a 4 s slow install — Chromium only; iOS SW lifecycle is on Tony's checklist (rightly).
5. Rollback leaves `stem-mode-v=2` behind: harmless to old main (it ignores the flag).

### PR C `-telemetry` — VERDICT: SHIP after two one-line edits; three facts to price.
1. **privacy.html:143 promises "PostHog and Microsoft Clarity" — Clarity is OFF by default (build_public.py:645, D22).** The only user-facing promise is wrong on day one. FIX: "a screen replay of the visit (PostHog)". Also drop "Microsoft Clarity" from TELEMETRY.md line 1 or mark it "off unless CLARITY=1".
2. **The DNT/GPC gate is dead on the primary platform.** Safari removed DNT in 2019 and has no GPC; prod mobile = 100 % iOS Safari (analytics). So "DNT → record nothing" records 100 % of real students; the opt-out exists only for Firefox/Brave desktops. Not a bug; price it. FIX (keeps "record all" as the default, 2 lines): a plain "Don't record me" link on privacy.html that sets `localStorage["stem-t"]="off"`; telemetry.js:205 `if (optedOut(N, W) || off()) return;` with `off = () => { try { return localStorage.getItem("stem-t") === "off"; } catch { return false; } }`.
3. **telemetry.js:343 `persistence: "localStorage+cookie"`** puts a ~1 KB PostHog cookie on EVERY same-origin request (`/check`, `/p/*.json`, `/b/*`) — bus data, and serve.py parses that header twice per request (serve.py:214, :816). I verified SimpleCookie handles the PostHog + Clarity cookie shapes (mode_of → diet, sid kept). Still: FIX `persistence: "localStorage"` (one word): no cookie on the wire, no parse surface, same distinct id (we bootstrap it from `stem-tid` anyway).
4. telemetry.js:343 `person_profiles: "always"` turns every anonymous visitor into an identified person → PostHog bills identified-event rates (several × anonymous). Free tier covers ~30 students; set `"identified_only"` when it matters. Not tonight.
5. The raw `sendBeacon` to `<host>/batch/` (telemetry.js:233) with `distinct_id` inside `properties` is accepted by PostHog's batch endpoint; `text/plain` Blob avoids a preflight. OK on iOS.
6. index.html:109 appends " · no sensitive data pls" to "verify b4 use lol". D20 mandates the words; F's pain #10 says the slang line reads as a trust problem. Ship (D20 is the newer decision); K's C3 spec below replaces the line in the mockups.
7. Rollback: PostHog's localStorage keys stay; old main never reads them. Harmless.

### PR D `-queue` — VERDICT: SHIP after fix 1 + fix 3 (both small). Fix 2 and 4 are strongly advised tonight; 5–8 are notes.
1. **A question answered RIGHT comes back as a CLOSED showing (nothing to tap).** nav.js upNext: `r: redeem && code !== cur ? Math.floor(Date.now()/1000) : 0` — only a Redeem gets a fresh round; `use(e)` then calls `R.clear()` for everything else, so the real (finished) record paints: all options disabled, only Next works. A right first pick rests FAR=30 (tiny bank: n−1), then returns closed. For a 19-Q bank: after the first pass Next becomes a treadmill of answered questions; for a 5-Q bank it starts at slot 6; for a student who finished the bank before tonight, `qMigrate` makes EVERY slot from 1 a closed question (all seen, none due until 31, `soonest` picks the earliest). The old mastery order had the same "answered first" flaw, so it is not a regression, but D57 "smooth like Apple/Duolingo" promised better, and F's #9 pain ("didn't I just do this?") gets a new face. No test catches it: shuffle.test "all-right" asserts only the first 24 of 30 picks; "5-question bank" asserts the miss's gaps and no-repeat, never that a returning right is answerable; queue-walk asserts answerability only for the Redeem comeback. FIX (nav.js upNext, 1 line): fresh round for any non-history re-showing of a finished code — `const fin = c => { const m = mark(c); return !!m && m.done !== "open"; }` and `r: (redeem || fin(code)) && code !== cur ? Math.floor(Date.now()/1000) : 0`. Rewards already pay nothing twice (app.js:1535), so no farming. Spaced re-answering of a right one IS retrieval practice (research: "immediate for engagement + re-ask later"). TEST: in queue-walk, after the 20-answer walk, press Next until a non-redeem repeat appears (≤ FAR + n slots) and assert `#q .opt:not(:disabled)` > 0.
2. **Migration floods the first session with old misses.** shuffle.mjs qMigrate: every old miss gets `wait: NEAR(3), last: 0` → all due at slot 4 → a student with F's 7 misses sees slots 4–10 = 7 Redeems back-to-back (two of them the near-identical Q19 variants). D58's "3 → 8 → 20" was meant to space, not to stack. FIX (2 lines): stagger in qMigrate — `wait: ok ? FAR : NEAR + 2 * k` with `k` counting migrated misses; and/or in qPick, let a due miss take at most every other slot while fresh questions remain: `if (owed.length && (t % 2 === 0 || !ready.some(c => !S(c))))`. Update shuffle.test "migration" (`picks.slice(3,5).every(redeem)` becomes "both old misses return within 8 slots, never adjacent").
3. **The #1 audit pain is now a false sentence.** app.js:906 and :1086 "No tries left. Ask Tony about CODE." After PR D the question DOES come back with fresh tries (Redeem). Nobody owns that line tonight; no test pins it (`git grep "Ask Tony about" tests/` → none). FIX (2 lines, rides on D, Q already owns an app.js block): "Out of tries for now. This one comes back around." — true, forgiving (§1 #5/#9), no bridge-to-human framed as failure (§1 #6). Keep the lock icon.
4. **D59 "every 4th slot pulls the least-seen topic" is a no-op in prod.** No bank carries `topic`/`parent`; the fallback `family(code)` = prefix + first letter of a random 3-char code → BANK_P2X becomes ~15 single-member "topics", so the pull means "least-shown question". The 4 variants of Exam Q19 (PHYS_Z5BA/B/C/E, 4× in F's 10) and the 2 kWh twins (REFD/REFE) are grouped only by the luck of a shared letter. FIX (nav.js topicOf, 1 line, no bank edit): read the sugar title first — `const t = p.saccharine?.title || p.title; const m = t && t.match(/Question\s+(\d+)/); return (p.topic || p.parent) || (m ? "q" + m[1] : family(c));`. That makes D59 real tonight and spaces the Q19 variants (F's #9).
5. Uploads: all files share `stem-q-upload` (QUEUE.md "known limits") → D64 "never mix" is violated for uploads; `pos` keeps counting across files so gaps are measured in foreign slots. Key by the file name (`o.fileName(codes[0])`) later. Not on the student path tonight.
6. **The D71 gate ("20-answer walk in Chromium + WebKitGTK") is unmet as evidenced:** queue-walk.pw.mjs accepts `PW_BROWSER=webkit` but no WebKit is installed in the container (§2); nothing in QUEUE.md says a WebKitGTK/ios-sim walk ran. nav.js is DOM-light and there is no new CSS, so the Safari risk is low; say "Chromium only" in the PR body rather than claiming the gate.
7. `try/genui-redeem.html` (Q's 3 Redeem-chip variants) is not on the branch (`git ls-tree origin/…-queue try/` → nothing). Not on the deploy path; the brief's accept is unmet (A3).
8. nav.css:38–59 still styles `#qshuf` / `#qredo` / `.redo-on` (dead rules; harmless). Old sessionStorage Redo rounds vanish silently (fine). Rollback leaves `stem-q-*` + `stem-redo` in localStorage; old main ignores both.
9. Old-progress migration timing is fine for banks: app.js:2190 awaits `off.ready` (≤1.5 s) before `openBank`, and a bank's marks also come from the server payload (`bank.marks`), so `qMigrate` sees them. Only an upload on a phone whose IndexedDB takes >1.5 s to open would migrate blank (edge, accept).

### Merge order and the candidate
A → C → D. D already contains A (c4af164, 35f6667) and pre-resolves the only conflict (tests/redo.pw.mjs deleted). C's app.js hunks (load():466, record():915, wishStart():1142/1153, clOpen():1289, clClose():1297) and D's (369–430 stemRedo, 413 openBank, record():921) are ≥6 unchanged lines apart → clean either order. `.vercelignore` is the identical hunk on B, C and D. index.html: C appends (head meta, telemetry script, footer), D removes two buttons + two symbols → clean.

---------------------------------------------------------------------
## A1 — CONTRADICTIONS BETWEEN DECISIONS (newest D wins; where that is wrong, I say so)

| # | Pair | Verdict | Who wins / fix |
|---|---|---|---|
| 1 | D31 (right answer gets a visual) vs D41 (thumbnail, never blocks Next) vs D57 (hidden queue) | No contradiction: D41 narrows D31; D57 is orthogonal. The real tension is D31 vs §1 "cut everything that doesn't serve the contrast" + research (Schroeder: image may be unneeded) + F's S32 (the silent win). | A right pick needs WORDS first (praise the strategy, 1 line, the joke slot lives here — humor rule e), the thumbnail second. Make the affirm block `text` mandatory and `scene` optional in SCHEMA-V2 E11. |
| 2 | D52/D53 bet (−1/−2, red segment, double-or-nothing) vs §1 banned "score that drops" + #5 "error = a step" + #9 forgiving | Reconciled on paper (exception carved in; failed retry costs nothing). Still contradicts D42's purpose ("positive language pushes them to try again"): the retry — the pedagogical core (Metcalfe hypercorrection) — now carries a stake. | D69 north star wins: the retry must never be the gamble. Keep the bet on the FIRST pick only; "double-or-nothing" becomes "win it back" (same math, no loss framing). B-set will test it; log it now. |
| 3 | D52 random +3..+5 gacha vs D60 fixed +3 Redeem ("one variable reward per loop") | Consistent by design. | — |
| 4 | D18 tell-me pref → L3 vs §8a reveal-after-interact vs D38 (last try = L3 + requeue) vs D61 (Redeem starts L1) | Reconciled in SCHEMA-V2 §5 (first-match order). | — |
| 5 | D62 "re-rank on every answer" vs Tony Oct 3 "never move the list under you" | Reconciled by splitting list (fixed salted index) from queue. Side effect: list numbers ≠ play order, so "3 of 19" means nothing and F's S04 ("Question 12 on my Q1") stays. | Accept; hide row numbers in the list or number by play order later. |
| 6 | D64 per-bank queues vs uploads sharing `stem-q-upload` | Violated for uploads (QUEUE.md admits it). | Key uploads by file name. |
| 7 | D59 every-4th topic vs no `topic` field in any bank | D59 is fiction until banks carry topics or the title-derived parent (A0-D4). | Title-derived parent tonight. |
| 8 | D20/D24 "PostHog + Clarity, unmasked" vs D22 bench "drop Clarity" | D22 wins (newer, evidence-based). privacy.html + TELEMETRY.md still say Clarity. | Fix the doc (A0-C1). |
| 9 | D71 deploy Wed night vs analytics "FREEZE risky deploys through Thu night" | D71 is newer and Tony's. The mitigations (order, D gate, Promote rollback) stand; the D gate is only half-run (A0-D6). | Ship A+C first, D with fixes 1+3; if any doubt, D after Thu night as the plan itself allows. |
| 10 | D50 remove Redo (agency gone) vs §1 #7 agency + humor rule (i) "offer choices" + F's S40 (Redo was "the one thing that could bring her back") | Trade, not contradiction: the queue chooses when she redoes. | Keep a single choice at the lock moment: "[Next] [Try a twin]" (D38 twin) — restores agency without a button in the bar. |
| 11 | D38 twin + requeue vs the live lock copy "Ask Tony about CODE" | The copy contradicts tonight's queue (A0-D3). | Change the line. |
| 12 | D68 "QUACK anywhere but inside the explanation" vs humor research rule 3 "QUACK counts as a joke" vs F's S09 (QUACK-first hints read as a joke at her) | Tony's D68 wins, with one limit the research supports: not in the FIRST line of a wrong-pick message (that line is wise feedback, §1 #8 dose). The server hint copy ("QUACK. That's the no-friction answer.") breaks it today. | Prompt + hint rule: QUACK after line 1 only. |

---------------------------------------------------------------------
## A2 — FILE OWNERSHIP AND MERGE ORDER

Owned files (as landed):
- **A**: mode.mjs, offline.js, sw.js, serve.py (mode_of + comment only), tests/mode-reset.pw.mjs (new), tests/mode.test.mjs, tests/update.pw.mjs, tests/test_serve.py (cookie strings), tests/choose-all.pw.mjs, tests/rewards.pw.mjs, tests/redo.pw.mjs (cookie string; deleted by D).
- **C**: telemetry.js, privacy.html, tools/build_public.py (stamp_telemetry), index.html (meta + script tag + footer block), app.js (5 one-line `window.stemT?.()` hooks), tests/telemetry.test.mjs, tests/telemetry.pw.mjs, tools/bench-telemetry.mjs, design/plans/TELEMETRY.md, TELEMETRY-BENCH.md, design/shots/genui/footer-*.png, .vercelignore.
- **D** (includes A): shuffle.mjs, nav.js, app.js (stemRedo block, openBank, record() `drill:answer`), index.html (−2 buttons, −2 symbols), design/NAV.md, design/plans/QUEUE.md, tests/shuffle.test.mjs, tests/queue-walk.pw.mjs (new), tests/bank.pw.mjs, tests/nav-stable.pw.mjs, tests/render.pw.mjs, tests/easy.pw.mjs, tests/redo.pw.mjs (deleted), .vercelignore.
- **B**: design/plans/{FLUENCY-SAMPLES, AUDIT-FRUSTRATED, SCHEMA-V2, RUNTIME, VISUAL-TESTS}.md, design/plans/fluency/*.png, design/shots/genui/audit-*, tests/visual-cases/*.json, tests/scene.test.mjs, .vercelignore.

Shared files and the order that avoids conflicts:
| File | Touched by | Risk | Order |
|---|---|---|---|
| app.js | C (hooks), D (redo/openBank/record) | hunks ≥6 lines apart → clean | any; plan says C before D |
| index.html | C (append), D (remove) | disjoint regions | any |
| .vercelignore | B, C, D | identical hunk | any |
| tests/redo.pw.mjs | A (edit), D (delete) | the one conflict; resolved on D | A before D (D carries A) |
| serve.py | A only tonight; S/V will want grade() ghost fields later | — | A first |
| nav.css | nobody (dead #qshuf/#qredo rules) | — | U later |
| design/shots/genui/ | B (audit-*), C (footer-*) | different files | any |

Wave 2 collisions to pre-empt: U owns app.css and wants `.cl.part` (RUNTIME §2); V wants graph.js changes (RUNTIME §3); K writes `author/skills/cluck-author/*` and `author/prompts/scene-gen.md`; the orchestrator alone edits try/index.html. serve.py CLUCK_GENIE belongs to NO wave-2 agent — assign it (K writes the text, orchestrator applies) or the prompt fixes never ship.

---------------------------------------------------------------------
## A3 — WHICH ACCEPTANCE TESTS ONLY CHECK EXISTENCE

| Test | What it really proves | Gap |
|---|---|---|
| A tests/mode.test.mjs (D6) | Behaviour: reset once, DIET_ sticks, SUGAR_ switches back | — |
| A tests/mode-reset.pw.mjs | Behaviour in Chromium incl. cookie attrs | "a year" is false on Safari (ITP 7 d) |
| A tests/update.pw.mjs slow-install step | Behaviour: one tap, one load, no second bar, new shell | Chromium SW only; iOS unproven (checklist) |
| C tests/telemetry.pw.mjs DNT/GPC/no-key | Behaviour: zero requests to the hosts | — |
| C telemetry.pw "events arrive" | Our calls against a STUB `window.posthog`; checks option values and that `bail` was passed `transport:"sendBeacon"` on a SYNTHETIC `pagehide` | Does not prove PostHog accepts anything, or that a real pagehide beacon leaves the device. `LIVE=1` manual run = NEEDS_KEY; plan's "events visible in PostHog live view (screenshot)" not done |
| C telemetry.pw footer | Existence: an `a#privacy` with href + a page with 3 `<p>` | Copy not checked (and it is wrong: Clarity) |
| C TELEMETRY-BENCH | Real measurements, 5 runs, deltas | Shared-container noise acknowledged |
| C D23 dashboards | Existence: 4 insights created (HTTP 201), queries run clean, no data | Fine until events flow |
| D tests/shuffle.test.mjs | Behaviour for gaps/first-pick-only/tiny/no-repeat/isolation/determinism/resume | "every 4th" fabricates `seen`; "all-right" stops at pick 24 (the closed-treadmill from 25 on is invisible); "5-Q bank" never checks a returning right is answerable; migration uses synthetic marks |
| D tests/queue-walk.pw.mjs | Real browser, real bank, 20 answers, reload, Redeem answerable, no Shuffle/Redo | Chromium only; non-redeem comebacks not checked (A0-D1) |
| D "Impeccable on genui-redeem" | NOT DONE: the page does not exist | — |
| B tests/scene.test.mjs + visual-cases | Behaviour: 13 good pass, 21 planted-bad fail on the named rule | Covers scene JSON only; nothing renders them (graph.js has no poly fill / ghost style yet, RUNTIME §3) |
| B SCHEMA-V2 "examples validate" | Behaviour: §8 run against the draft schema | Draft schema is in the doc, not in `schema/` |
| B AUDIT-FRUSTRATED ≥30 steps | 44 steps, voice + defect + severity + technique, timings | Good |
| B RUNTIME.md | Docs | No code |

---------------------------------------------------------------------
## A4 — QUEUE EDGE CASES (shuffle.mjs + nav.js on the queue branch)

| Case | What happens | Verdict | Fix |
|---|---|---|---|
| Tiny bank < 10 (5) | gaps capped at n−1=4, no-repeat window min(3, n−1). Works (test). But after slot 5 every right comes back CLOSED (A0-D1). n=1: the same code re-shows as a new showing via `shown(e.c, true)` (nav.js go()) — fine. n=2: never-within-1 → alternates. | Pass with A0-D1 | A0-D1 |
| All right | One clean pass, no duplicates (test to 24). Then: closed treadmill (A0-D1). No "bank done" moment; Next never disables (by design). | Treadmill | A0-D1 + a one-line "That's the set. Going round again." toast on the first wrap (say()) |
| All wrong | Misses return on 3/8/20; fresh keep coming (≥8 distinct in 60, test). Under guess-spam (<2 s picks) every Q becomes a Redeem owed at 3 → the queue fills with Redeems of questions she never read. | Poisoned by spam | Ignore a first pick with `ms_since_open < 2000` for queue weight (nav.js drill:answer listener: app.js can pass `ms` in the event detail; or read telemetry's `why`) |
| Single topic | Every Q once before any repeat (test). Topic pull degenerates to "least-shown" — fine. | Pass | — |
| Multi-part | First graded PART is the question's first pick (QUEUE.md known limit). Part 1 wrong, parts 2–3 right → whole Q owes a Redeem; the Redeem re-grades all parts in a fresh round. `pending` (offline) verdicts never fire `drill:answer` → never scored; the showing counts as "skipped" (wait 8) and returns as a closed question once the server sync has the real record. | Acceptable; offline edge | Score the Q when `settle()` runs (all parts shut): right iff `S.solved`; else keep part-1 rule |
| Uploaded files sharing one queue | `stem-q-upload` shared; `pool()` is the live file so picks are right; `pos` and `hist` mix files; `hop()` skips foreign history codes. Not broken, but D64 is violated and gaps are measured across files. | Works, wrong per D64 | Key by file name |
| Codes with a letter suffix not in the bank file (sugar sub rows `…1A`, snacks) | Sub rows come from the server bank payload so they ARE in `all()`; snacks are excluded from the pool and glued before their real (`beforeOf`), shown once (`!st.seen[sn]`). `family()` of `CSCI26_SP1A` = `CSCI26_S` — fine. A `#CODE` typed that is not in the list: `here=false` → arrows off, `shown()` not called (guarded by `all().includes`). | Pass | — |
| Prev/Next through history | History steps never move `pos` (test). Next after Prev replays forward. A Redeem opened from history keeps its `r` (hist carries it). | Pass | — |
| Reload mid-walk | Same question (server pointer), same `at`, `pos` intact (test). If the server pointer differs from `hist[at]` (another device), a new showing is logged — harmless. | Pass | — |
| Migration of old progress | Works for banks (server marks). Flood of back-to-back Redeems (A0-D2). | Flood | A0-D2 |
| Topic pull with real topics | Title-derived parent groups the Q19 variants and the kWh twins (A0-D4). | Needs the 1-liner | A0-D4 |
| Storage blocked | `qLoad` null → fresh queue each load; `qSave` swallows. Each reload = new salt → different order, Prev empty. Acceptable (private mode). | Pass | — |

---------------------------------------------------------------------
## A5 — DOES THE GHOST SPEC SURVIVE THE UNDRAWABLE CASES?

What SCHEMA-V2 §9 "Undrawable → fallbacks" says, and my verdict per case:
| Case | Spec | Verdict | What should render instead |
|---|---|---|---|
| Mechanical (8G7 √, 6AA ×t, H3A 2π/÷60, pucks ÷t) | `chip`: the whole line in LaTeX, the dropped piece marked; no scene (E9) | RIGHT. The chip needs no drawing and no bank ghost; it is the one gen-UI block that can ship from `slip` text alone. | Ship the chip FIRST (text + KaTeX, `missing` highlighted with `--mark`). It covers 5 of the 9 fluency situations. |
| Symbolic Ferris 8U2 / ZAF | `scale:"schematic"` scene with a DIRECTION ghost ("her + sign = the pull points away from the hub") + "not to scale" (E8) | WEAK, and E8 is mislabeled: 8U2's pregen says the student used the TOP's sign at the BOTTOM ("At the lowest point… the common slip is C"), but E8 draws "seat at the top". A sign slip is not a belief about direction; inferring "she thinks the pull points away" from `mg − mrω²` is the viz-rule-12 failure (ghosting a distractor with no drawable meaning) and risks "I did NOT think that" (F S30). | `chip` (`N − mg = +mrω²`, the sign marked) + a TRUTH-ONLY still: seat at the bottom, hub above, one solid arrow toward the hub. No ghost. Tag 8U2/ZAF `kind: mechanical` in the bank proposal. |
| 5R_E orbit (H3A e, QZR d, RAO e) | `fit:"widen"` ≤1.35× (5/4 = 1.25) else `offscale:"edge"` with a break chevron (E7) | OK, but the aha is weak: a dashed circle at 5 beside a solid at 4 is a 25 % difference on a phone; "your 5R_E" alone does not say WHY. | Add a bracket mark "+1 R_E" from the truth orbit to her orbit with the label "you added a radius" (the line E7 already has). The chevron case (>1.35×) never occurs in Exam 2; cut it from the build list. |
| "That is v2", 2MO energy ratios | ratio → energy bars; "that is v2" → tag mechanical + chip | OK | — |
| Typed answer, no buggy rule | live gap (§6, 1500 ms) or text + L3 | OK, but for concept ghosts live should be OFF: a flash model inventing a ghost for a typed number is the slop case. | Live = text + chip only; ghosts are pregen (D28) or nothing. |
| No `ghost` in any bank (today) | — | THE REAL GAP: Tony applies bank fields by hand (invariant); graph.js has no poly fill / ghost style / `_block` merge (RUNTIME §3); `/check` has no `kind/ghost/chip` (serve.py grade). Nothing renders tonight or in the mockups beyond hand-authored scenes. | Build order: (1) chip from `slip` (regex on "forgot/dropped/missed X") — no bank edit; (2) `/check` `kind` from the slip text; (3) KWV/XX3/8VQ ghosts hand-written as the bank proposal E14. |

---------------------------------------------------------------------
## A6 — TELEMETRY UNMASKED: THE HARM NOT PRICED

Facts: session replay with `maskAllInputs:false` records keystrokes in the Cluck ask field (`#cluck .ask input`, 500 chars) and the scratchpad (`#scratch`, free text, 1500 chars ride into the NOTE call); autocapture logs element text. A student will type a phone number, a name, "my professor Mr X", a classmate's name, or paste a group-chat message. The DNT gate does not fire on iPhone (A0-C2). PostHog replays live in a US project Tony administers; retention default 30 d (replay) and events indefinitely. privacy.html's remedy is "Ask Tony" (the person she will not ask, §1 #6).

One-line mitigation that keeps "record all": scrub only the two free-text surfaces, only for PII shapes, client side, before capture:
`session_recording: { maskAllInputs: false, maskTextSelector: null, maskInputFn: (t, el) => el && el.closest("#scratch, #cluck .ask") ? t.replace(/\b(\+?\d[\d\s().-]{7,}\d|[\w.+-]+@[\w-]+\.[\w.]+)\b/g, "▮") : t }`
(telemetry.js:347). Everything else stays unmasked; the chat still reads as text; phone/e-mail shapes become blocks. Add the same regex to `scratch_block()` (serve.py:883) so the NOTE call never ships a phone number to OpenRouter. Second line, cheap: set PostHog replay retention to 7 days in the project (events keep the funnel; replay is the sensitive part).

---------------------------------------------------------------------
## C-SET — FLUENCY-SAMPLES + PROMPT + F's AUDIT

### C1 — Does a visual earn its place? (per situation)
| Situation | Verdict | Kit / ghost | Slop if… |
|---|---|---|---|
| Physics concept (KWV d, forgot ½) | YES, the best case | `xy-area`: solid rect + tri (c1), dashed box "your 80 J" (muted). L2 handle = the triangle apex (D44). | …the ghost gets a value label at L1 (gives the answer away) or a second knob. |
| Physics mechanical (8G7 forgot √) | NO scene. Text + chip | chip: `\dfrac{v}{v_0}=\sqrt{\dfrac{R_E}{r}}` with `\sqrt{}` in `--mark`; one line: "Right ratio. The root fell off." | Any orbit picture here is decoration: the slip is algebra. |
| Physics symbolic (8U2 sign at the bottom) | Chip + a truth-only still (orientation) | chip `N − mg = +mrω²` (+ marked); still: seat at bottom, hub above, one arrow to the hub. No ghost (A5). | A "direction ghost" invented from her sign. |
| Physics vector (8VQ b, 355 vs 286) | YES, strong | `mechanics` arrows: 274 N down, 80.6 N toward the hub, hypotenuse 286 (c2 solid); ghost = the two laid end-to-end as one 355 N dashed line "your 355 N". Zero knobs. | …a Ferris wheel is drawn: the lesson is the triangle, not the ride. |
| Calc ∫ area (sign flipped) | Scene WITHOUT a ghost + chip | `xy-area` shade between parabola and line, labels "top"/"bottom" on the curves; chip `\int_0^3 (\text{top}-\text{bottom})\,dx` with the order marked. | A ghost: her region has the SAME shape; a dashed copy teaches nothing. |
| Calc related rates (x/y flipped) | NO scene. Chip | `\dot y = -\dfrac{x}{y}\dot x` with the fraction marked; "6 over 8, not 8 over 6." | A ladder drawing (the slip is not geometry). |
| Calc sign (picked f'>0 region) | YES | `xy-area`/`fn`: f and f′ on one axis; truth = shaded (−1,1) where f′<0; ghost = her outer intervals hatched "your (−∞,−1)∪(1,∞)". Handle = a point sliding on f showing the slope sign. | …both f and f′ get full axes with ticks: one picture, the sign band only. |
| CS BFS order | Only the kit's step TRACE (`graph-search`), no ghost | the queue state per step is the teaching; her DFS order as a dashed path is a fair ghost but optional. | A static graph with no trace = decoration; the monospace step list does the same job. |
| CS big-O (doubling loop) | NO scene. Text + a 4-row table in prose | "i: 1, 2, 4, 8 … n → log₂n passes × n inner = n log n". | Bars of i doubling: a picture of a table. |

Rule of thumb for K: a scene earns its place only when the SLIP changes a SHAPE (area, direction, magnitude of a vector, a region on an axis, an order in a trace). A slip that changes a FACTOR, a SIGN, an EXPONENT or a UNIT gets the chip.

### C2 — Fluency grading (live gens + pregen)
Measured on the 9 gens (FLUENCY-SAMPLES.md):
| Gen | chars / lines before the fold | Longest sentence (words) | Tells | Voice |
|---|---|---|---|---|
| phys_concept KWV d | 1423 / ~13 | 33 | genie line; "You counted … as if …"; TEMPLATE LEAK "only one cart moves"; pun chain "quack-cident … down-right egg-cellent" | bot wearing a duck |
| phys_mechanical 8G7 | 1670 / ~14 | 43 | em-dash chain; "not in a straight line"; *italic* against FORMAT 3; TRUNCATED mid-sentence | lecture |
| phys_symbolic 8U2 | 1231 / ~12 | 37 | TEMPLATE LEAK "The push before" (2nd time); "isn't just … it's also" | ok physics, wrong register |
| phys_vector 8VQ | 1461 / ~13 | 38 | "corner-to-corner, not end-to-end"; "not like two scoops of feed" (2 not-X-but-Y); "missed-opposite-and-adjacent situation" (pun that is not a pun) | warm-ish, too long |
| calc_area | 1486 / ~14 | 41 | "not a real area"; TRUNCATED ("down-right") | fine physics, 4 steps too many |
| calc_rates | 1522 / ~13 | 25 | "a snapshot we differentiate around" (jargon); plain "ft/s" outside LaTeX (FORMAT 6); TRUNCATED | textbook |
| calc_sign | 1606 / ~12 | 36 | `\dot f(x)` for an x-derivative (WRONG notation for the course; sheet uses f′); "not the edges"; TRUNCATED | textbook |
| cs_bfs | 1360 / ~12 | 35 | "not a stack of plates"; "doesn't dive — it spreads"; math blocks full of `\text{}`; TRUNCATED | clear, but math abuse |
| cs_bigo | 1112 / ~11 | 22 | "doesn't walk; it doubles"; pun "log-a-rithmic" | the best of the nine |

Totals: 9/9 open with "POOF! You rubbed the lamp wrong" (a joke, first line, wrong pick — §1 #8 and humor rule (e) broken 9/9); 9/9 "You treated X as if Y" (a formula she will recognise by the third question); 5/9 truncated at `max_tokens=450` (serve.py:975); 2/9 template leaks; 7/9 carry a "not X but Y" construction (a model tell); FK grade ≈ 10–12 by sentence length (25–43-word sentences); every gen gives the boxed ANSWER in turn 1, so retry is theatre; 0/9 open with wise feedback; 0/9 end with a choice.
Pregen: `slip` = Tony's shorthand diagnoses — good DATA ("Forgot the 1/2 on the triangle … 80.0"), never teaching text; some state her belief as fact ("Thought gravity does not depend on distance", F S30 — shame trigger). `narration` = TTS-era number words ("sixty joules", "zero point five") + "Same steps as the original" (meaningless to her) → do not show. `tip` = terse, fine as an L2 hint. The two golds (A, B) hit the target: FK ≈ 5–6, ≤3 lines, first line wise/normalize, one contrast, choice at the end, joke on its own line only after a concept slip (none on the mechanical one).
Measurable target for Cluck's lines (K's rubric):
- L1 line: ≤ 2 lines at 393 px ≈ ≤ 160 chars, 1–2 sentences, ≤ 14 words avg / 20 max, FK grade ≤ 7 (Flesch-Kincaid on text with `$…$` removed), 0 em-dashes, 0 "not X but Y", 0 jokes, 0 QUACK, no number she did not pick, no answer value.
- Whole wrong-pick message: ≤ 3 lines before the fold; steps (L2/L3) ≤ 4, each = 1 plain line ≤ 12 words + 1 display equation; ≤ 1 QUACK; joke only on its own last line and only in an affirm; banned list grep = 0; numbers ⊆ KEY ∪ choices; units inside `$…$`.
- Timing: first readable line < 1.5 s after the pick (pregen), live first token < 2 s.
Where each falls short: LLM gens fail length, first line, truncation, notation, tells; pregen fails voice (shorthand/TTS) and framing (belief-as-fact). Neither is usable as the shown line without the skill.

### C3 — The CURRENT Cluck box: what is wrong, and the spec
From app.js 1248–1384, app.css 507–580 and F's shot audit-10:
- Block order today: orange casino head bar (phone) → chat chrome row (avatar, "Cluck", TUTOR tag, 1:16 PM) → 3 paragraphs (≈13 lines = the whole fold) → numbered steps with bold headings + an italic MONOSPACE sub-label ("one knob each", low contrast) → bullets → display math → `---` → boxed answer → pun → "verify b4 use lol" (+ " · no sensitive data pls" after C) → fold "See reference solution" → the ask field pinned at the bottom (90 px). Wrong: the lesson's one line is buried under a joke and two paragraphs; the timestamp and TUTOR tag are chat cosplay that cost a row; the sub-label font switch breaks the scan; the disclaimer sits where the affirm should; there is no slot for a scene or chip; math is set inline at body size so `\tfrac12` shrinks to unreadable.
- Streaming today: the chip says "Cluck is writing the steps…" until `w.done` (app.js:1237), i.e. until the WHOLE stream has arrived (F measured 15 s), and only then can she open the sheet — which then TYPES the complete text at 35 chars/s (`WISH_CPS`, app.js:1200): 1,400 chars = 40 s of typewriter on top of the wait, skippable by a tap she does not know about. `wishCut` holds back any half-open `$…$`, so a display equation pops in whole. Net: the first readable sentence is ~16 s + 2 taps away.
- Sheet: full-screen fixed on phones (app.css:522), scroll lock, the figure hidden, Next blocked (F S16), X at x=391/393 in Chromium (the `.cl-bar` margin `var(--s2)` is inside the gutter; the bar bleeds).
Improved spec (for K §7 and U):
1. Order for a wrong pick: **[L1 line]** (plain text, ≤2 lines, no math, no joke, no QUACK) → **[visual slot]** (ghost on the question's own figure, or a `scene` ≤45 svh, or a `chip` = one KaTeX line with the missing piece in `--mark`) → **[reveal strip]** `[Try again] [Just tell me]` in the thumb zone, ≥48 dp → fold **"Show the steps"** (closed by default; ≤4 steps; each step = one plain line + one display equation; numbers bold on first mention; answer boxed only at L3) → **[affirm slot]** (empty until a right answer: 1 line that names the fix + the joke line) → **[ask field]** pinned bottom.
2. Chrome: drop avatar/name/TUTOR/time on Cluck's first message (it is a card, not a chat); keep them for thread turns. Keep the duck in the chip only.
3. Spacing: 8-pt scale; paragraph gap 1 line; step gap 1.5 lines; one type size for prose (17–18 px on 393), one for the step label (bold, same size, no monospace); labels above controls.
4. Math: inline `$…$` for symbols and values inside a sentence; display `$$…$$` for the ONE key step per step; never `\tfrac` inline in body text; units always inside the math (`\ \text{J}`); course notation table in the skill (f′(x), ω, $N$, $R_E$).
5. Streaming: no typewriter. Render chunks as they arrive; KaTeX renders each completed `$…$`/`$$…$$` pair (`throwOnError:false`); the chip flips to "Read Cluck" on the FIRST token and opens the sheet in place; the visual slot keeps a reserved height so the text never reflows when the scene record lands (SCHEMA-V2 §1 RS records). Reduced motion = same, minus the ember.
6. Scannability: the first line is the whole lesson; the step labels are 2–5 plain words with no dash sub-label; one `---` max; the boxed value only at L3.
7. Disclaimer: one quiet line under the fold, once per sheet, not per message: "Cluck can slip. Check the key." + "Keep private stuff out of the chat." (no "lol"; the slang line fails humor rule (h): brainrot must not carry meaning).
8. Sheet geometry (phone): partial sheet 45 svh with a grab bar (RUNTIME §2), page scroll on, figure visible above; X inside the 16 px gutter (44×44); Next reachable while the sheet is open.
9. Right pick: no sheet; the affirm line + thumbnail in `#fb`; Next stays live (D41).

### C4 — Text ↔ visual ↔ math cohesion drift, and the automatic check
Drift found in the samples and specs:
- Notation: `\dot f(x)` for d/dx (calc_sign) — the sheet uses f′; `v_{sat}/v_{surf}` vs the KEY's "factor"; `\dot y` with "ft/s" outside math (calc_rates). SCHEMA E8 says "top" for a bottom-of-wheel question (8U2).
- Names: "Rectangle A to B / Triangle B to C" (KWV gen) — point names that exist only if the figure labels them (the alt must carry A, B, C); "corner-to-corner" vs "hypotenuse" vs "legs" for one idea in one message.
- Colour words: none yet (no scenes shipped) — the moment V's scenes land, "the orange triangle" will drift unless the label/colour token is quoted from the scene.
- Numbers: gens stayed inside the KEY (good) but "extra **20.0**" (KWV) is a derived number (80−60) not in the KEY or choices — FORMAT 2 says never invent; the rubric must allow differences of two KEY numbers or ban them explicitly.
- NOTE: the classifier labels every item `discrete_math` (server log), so the NOTE_RULE's "Looks like" hedge is random noise ("Looks like you treated the force as if only the radius moved" in F's shot). Either fix the field or drop the hedge.
Automatic check (`tests/fluency.test.mjs` on every gen log, and the same gate in the author skill):
1. Numbers: every number token in the text ⊆ KEY ∪ shown choices ∪ {pairwise differences/ratios of those} — else FAIL.
2. Units: regex `\d\s*(J|N|m/s|m/s\^?2|ft/s|kg|rad/s|W|kWh)\b` OUTSIDE `$…$` → FAIL (FORMAT 6).
3. Notation table per course: `\dot\{?[a-z]\}?\(x\)` → FAIL; `w` for ω → FAIL; `v_sat` vs KEY's symbol set → warn.
4. Scene ↔ text: every `label` in the scene (e.g. "your 80 J") must appear verbatim in a `text` block; every colour word in text (orange/blue/green/grey) must map to the token of the mark it names (c1 = force, c2 = velocity, c3 = accel per DESIGN-LANGUAGE) or FAIL; every point name (`A`, `B`, `C`) in text must be in the figure alt or a mark label.
5. Ghost ↔ /check: `ghost.label` value == the picked choice's numeric value ± sig figs; truth marks' value == KEY (the visual-cases `area`/`equals:"label"` rule already does this for scenes; extend to `/check` replies).
6. Structure: first line has no `$`, no "POOF", no QUACK, no banned phrase; the boxed value appears only when level == 3.

### C5 — Assumptions that will break
| Assumption | Likely failure | Early signal | Guard |
|---|---|---|---|
| Flash models write valid scene JSON | JSON that passes the schema but lies (sin/cos swap, ghost drawn as truth — exactly X's planted-bad set) | gate fail rate >30 % in GEN-QUALITY; `in_view`/`area` failures | Live = text + chip only; concept ghosts are pregen (D28) or nothing; ≤1500 ms then fallback (already in §6) |
| Pregen slips are good teaching text | Shorthand shown raw → "Thought gravity does not depend on distance" = belief-as-fact, shame (F S30) | F's audit | `slip` is data; the shown line is authored by the skill with the validation template (normalize → reason → expectation → next); never render `slip`/`narration` |
| One ghost explains a concept | Without the one line, "which one is mine?"; with two ghosts, noise | retry-wrong rate unchanged after a ghost; `viz_touch` ≈ 0 (expected ≤30 %) | Label + 1 line always; cap at 2 ghosts; the aha must land with zero touches (viz rule 2) |
| KaTeX streams cleanly | `\begin{aligned}`, a `$` inside `\text{}`, an unclosed `**` → a frozen caret or a `katex-error` block | `.katex-error` count in the DOM; `wishCut` stalls | Render only complete pairs; `throwOnError:false, strict:"ignore"`; test counts `.katex-error` = 0 per gen |
| Students read the 2 lines | They skip to the answer (Tse: assume no one sees the tooltip) | dashboard 4: dwell < 16 ms/char; `viz_skip` ≥ 60 % | The first line IS the lesson; the answer is behind "Just tell me" so skipping costs a tap, not the lesson |
| 450 tokens fit the format | 5/9 truncated mid-pun; one cut the boxed answer | gens ending without `---` | Answer-first ordering inside the steps (box before the pun), `max_tokens` 700 for L3, pun dropped from the wrong-pick prompt entirely |
| The NOTE classifier works | field = discrete_math on physics; the "Looks like" hedge is random | server log | Validate `field` against the bank subject; if mismatch, treat as `no_signal` |
| First-pick-only scoring is enough | Guess-spam makes every Q a Redeem → treadmill | `guess_spam` rate | Ignore picks < 2 s for queue weight (A4) |
| Banks carry `topic` | They do not; D59 is fiction | queue-walk `why:"topic"` picks random letters | Title-derived parent (A0-D4) |
| The prompt's one example is harmless | "only one cart moves" leaked 2/9 | grep gens for prompt strings | No worked example in the system prompt; put the shape rules in the skill, examples in `examples/*.md` with a leak grep |
| Chromium ≈ Safari for the sheet | WebKit showed "Similar solution steps" where Chromium showed "Cluck" (state, not engine — but the audits diverge) | F's table | Same-state screenshot pairs; ios-sim profiles on every sheet variant |
| One Opus agent per 25 min | V and T were 60–120 min (plan status) | — | Already logged for Tony |

### C6 — Turn-to-turn fluency: one lesson, not four restarts
Today: turn 1 is a complete 4-step lecture that ends in the boxed answer → the retry is theatre, the chat has nothing left to add, and the retry-right affirm is silent (F S28, S32). Each `/chat` turn re-sends the same persona prompt with the history; nothing names the contrast, so Cluck re-explains from zero ("picture a line at the coffee shop" twice is one bad model roll away).
What makes it ONE lesson:
1. A per-question `lesson` object threaded into every call: `{contrast_noun ("the half box"), exam_move (goal.say: "a triangle is half its box"), her_pick, her_2nd_pick, level}`. Turn 1 writes it; every later turn is told "CONTRAST SO FAR: …; reuse the noun, never re-explain".
2. Turn 1 (L1): wise feedback + the contrast + a choice ("Hint or retry?"). NO value, no steps. The ghost/chip is the visual.
3. Chat turn: answers the ask in ≤2 lines, in the same nouns, and ends by pointing back at the strip ("Grab the corner and watch the box.").
4. Retry wrong (L2): one line that names the NEW pick's picture ("Now that's the rectangle alone — 40 J is the box without the slope.") + 2nd ghost + the key step.
5. Retry right: the affirm names the fix she made, not the answer ("You halved the triangle. That's the move on the exam.") + the joke line (humor rule e: jokes return after a right answer).
6. Last try: L3 steps + "Twin or next?" (D38) and the Redeem promise ("It'll come back around").
7. The Redeem return (days later): "This one came back. You've got the half-box idea now." → L1 again (D61/E13).
Server change needed: `/explain` takes `level` + `lesson`; `/chat` takes `lesson`; the KEY goes to the model only at L3.

### C7 — For agent K: prioritized rules + 3 gold/bad pairs
Rules (highest first):
1. First line = wise feedback or normalize-as-fact, plain text, ≤2 lines, no math, no joke, no QUACK, no "POOF". It names the one contrast.
2. Never give the value before L3 or "Just tell me". Retry must be real.
3. Visual only when the slip changes a shape (area, direction, vector size, region, order); otherwise the chip. Never a direction ghost from a sign.
4. Scene labels and the line share words: the line quotes the ghost label ("your 80 J"); colour words only if they are the mark's token; point names only if the figure has them.
5. Numbers ⊆ KEY ∪ choices; units inside `$…$`; course notation (f′, ω, $R_E$); one display equation per step; no `\tfrac` inline.
6. Sentences ≤ 14 words average, 20 max; FK ≤ 7; no em-dash, no "not X but Y", no hypophora, no triple adjectives, no "just/simply/obviously/easy".
7. Praise the right part of her move before the slip ("Your rectangle is right."); never state her belief as fact ("You thought…") — say what the pick DID.
8. Steps ≤ 4, each = one plain line + one equation; the box only at L3; no pun inside the lesson.
9. Jokes: own line, after the lesson, only in an affirm or transition, physics/duck targets, ≤1 per 4–6 Qs, none after a wrong pick. QUACK: ≤1, never line 1, never inside the explanation sentence.
10. End a wrong-pick message with a choice, never an order: "Hint or retry?" / "Twin or next?".
11. Turn 2+ reuses turn 1's contrast noun and never restarts; the affirm names the fix she made.
12. Everything machine-checkable goes in `rubric.md` as a grep/number (C4 checks + C2 targets); the human score is only "sounds like a warm human tutor, 1–5".

Gold / bad pairs:
- **Pair 1 — physics concept, KWV d (forgot ½).**
  GOLD: "Tricky one; this graph is built to make the slope look like a full box. Your rectangle is right. The slanted part is a triangle, half its box — that's the dashed one. Hint or retry?" (+ ghost: dashed 8×4 box "your 80 J" beside solid rect + tri; no value.)
  BAD: "POOF! You rubbed the lamp wrong, but a wish is a wish. (waddles to the board) Work is just the area under that force-versus-position graph, because pushing harder over more distance piles up more energy… 1. The push before — only one cart moves …" — joke first, 13 lines before the point, template leak, the answer given, no choice.
- **Pair 2 — physics mechanical, 8G7 (forgot √).**
  GOLD: "Your setup is solid: right ratio, radii from the center. One piece fell off at the end." + chip `\dfrac{v}{v_0}=\sqrt{\dfrac{R_E}{r}}` (√ marked) + "Retry with the root on?" — no scene, no joke.
  BAD: "When you climb higher above the Earth, gravity pulls on you more weakly, and escape speed drops with distance — but it drops gently, not in a straight line, because the speed depends on the *square root* of the distance." — 43 words, em-dash, "not X", italics, then 3 steps and a truncated pun; an orbit figure would be slop.
- **Pair 3 — the affirm after a retry-right (any Q).**
  GOLD: "You halved the triangle. That's the move on the exam." / "QUACK. Triangles: the half-price boxes of physics." — names the fix, joke on its own line, Next stays live.
  BAD: (silence; a green pulse and a coin counter) — F S28/S32; or "Correct! You're so smart!" — intelligence praise (Mueller & Dweck), banned by humor rule (g).

---------------------------------------------------------------------
## SHAME CHECK (for what this critique asks to ship tonight)
1. Wrong pick, her voice: "Red X, still. But it says it'll come back around, and the next one is a different topic."
2. Banned items still present tonight: the lone red X + line-through (app.css `.opt.wrong`), the ✕✕ list ledger, POOF first line — none of these are on the A/C/D path; they are U/K/prompt work. The "Ask Tony" lock copy is fixed if A0-D3 lands.
3. Techniques: 5 (error = a step: the Redeem comes back with fresh tries, D), 9 (forgiving loop: never lost, D61), 10 (fast + light: telemetry after the first question, bench-proven, C), 6 (private: the PII scrub, A6).
4. Reopen tomorrow? Closer: the treadmill fix (A0-D1) and the stagger (A0-D2) make "Next" feel like a playlist instead of a re-run; the lock copy stops sending her to a stranger.
5. Seconds + taps to the aha: unchanged tonight (≈17 s + 3 taps on iPhone, F); the C3 streaming spec is what brings it under 2 s + 0 taps.
