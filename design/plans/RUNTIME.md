# RUNTIME: where a ghost renders, what has to change, where telemetry hooks in

Status: DRAFT plan (agent S, Oct 7 2026). Docs only; nothing here is built. Data formats: `design/plans/SCHEMA-V2.md`.
This is gen-ui-spec §8 step 7: a wrong pick shows its pregen visual in Cluck's FIRST message; gaps go live.

> **North star (D69).** The aha lands with ZERO extra touches: she picks, and her own answer appears as a dashed shape next to the real one,
> on the figure she was already looking at. Every choice below is graded on "taps + seconds to that moment" on an iPhone.

## 0. The flow, end to end

```
pick ─► POST /check ─► reply {verdict, triesLeft, hint, kind, ghost | chip | affirm}      (~150–300 ms, no LLM)
          │
          ├─ concept  ─► paint ghost on the question figure (or its copy, per variant) ─► L1 strip: [Try again] [Just tell me]
          ├─ mechanical ─► algebra chip under the hint line (KaTeX), no scene
          ├─ correct ─► affirm thumbnail in #fb, Next stays live (D41)
          └─ (sugar + wish) ─► POST /explain stream: text first; any non-text block = one RS record, complete or dropped
```
Level state (SCHEMA-V2 §5) lives per question in `S` (app.js) as `S.lvl` + `S.ghosts[]`; it never goes to the server. The tell-me pref is
localStorage (key name owned by agent T; proposed `stem-tellme` + `stem-tellme-skips`).

## 1. Where the ghost renders, per viz-home variant (D34: the variants battle it out)

Today: the Cluck sheet auto-opens on desktop only (`app.js:1131`, `sideMQ` ≥720 px); on a phone she taps "Explain my mistake" (`app.js:1237`)
and the sheet covers the whole screen (`app.css:522` `html:not(.side) .cl{position:fixed;inset:0}` + `:523` `html.cl-open body{overflow:hidden}`),
so the question figure is hidden exactly when the ghost needs it.

| Variant | Ghost lives on | Phone (iPhone 15, 393 px) | Desktop (side layout) | Taps to aha (phone) | Cost / risk |
|---|---|---|---|---|---|
| **A. Partial sheet + live figure** | the question's own `.fig` (`#blocks .fig`, `f._block` += ghost marks) | figure stays on top; Cluck opens as a bottom sheet ≤45 svh with a grab bar; page scroll NOT locked | figure in the question column, Cluck in the notes column (as today) | **0** (ghost paints on `/check`; sheet optional) | needs the `.cl.part` CSS (§2); figure must be in view: scroll it into view (`scrollIntoView({block:"nearest"})`, reduced motion = instant) |
| **B. Figure copy in a full sheet** | a COPY of the question figure inside Cluck's first message (`scene` block, `size:"full"`) | today's full-screen sheet; the copy sits above the text | same copy in the sheet | **1** ("Explain my mistake") | zero CSS risk; the copy duplicates the figure (a second `.fig` with its own `_block`, own `_g`); she loses the question text while reading |
| **C. Sticky figure** | the question figure, made `position:sticky` at the top while the sheet is open | figure pinned top ≤35 svh, sheet below it, both scroll independently | figure sticky in the left column | **0–1** | iOS Safari sticky inside a scroll container + `svh` jitter when the toolbar collapses: needs real iOS |
| **D. Chat card** | a `scene` block card inside the thread (`.cl-thread`), like a message bubble | the card scrolls with the chat | the card in the notes column | **1** | lightest build; the ghost is away from the question, so "your 80 J" is beside the TRUTH but not beside her own figure |

Recommendation for the battle (not a decision): A is the only variant that hits the 0-tap aha on a phone without new scroll physics. B is the
safe fallback (no CSS change) and is what L3 uses anyway (the static figure). Whatever wins, the SAME `ghost` payload drives all four: the
renderer takes `(figureEl, ghost)`; only the mount point differs.

L2 (grab handle) in every variant: the handle is ONE hit target ≥48 dp, starts at her number (`handles[].start:"pick"`), sits bottom-center
of the figure, and only then does the figure get `touch-action:none` (L1 keeps page scroll working on the figure).

## 2. The phone blocker (`app.css:522`) and the partial sheet

Proposed CSS (agent U owns app.css; this is the spec):
- `html:not(.side) .cl.part { inset: auto 0 0 0; height: min(45svh, 420px); border-radius: 16px 16px 0 0; padding-bottom: env(safe-area-inset-bottom); }`
- `html.cl-open.cl-part body { overflow: auto; }`: the scroll lock (`:523`) applies only to the full sheet.
- A grab bar (≥48 dp tall) expands `.part` → full (today's sheet) and back; a swipe down closes. Expand/collapse = `transform: translateY`, ≤14 px
  overshoot, reduced-motion rule per keyframe (STYLE.md).
- The question scroll box `.freeze-in` (`app.css:207`, max 60 svh) must leave the figure above the sheet: when `.cl.part` is open, set
  `--freeze-max: 55svh` so figure + sheet fit 852 px.
- `svh` everywhere (not `vh`/`dvh`) so the iOS toolbar collapsing does not make the sheet jump ("nothing jumps").

## 3. graph.js changes

| # | Change | Where | Why |
|---|---|---|---|
| 1 | Ghost marks live in `f._block`: `f._base = b` once, then `f._block = {...f._base, marks: [...f._base.marks, ...ghost.marks]}` and `f._g = null` before `Graph.render(f, f._block)` | app.js (`paintGhost`), graph.js `render` (`:765` caches `el._g`) | the cache would keep the old marks; resize (`app.js:518` `drawFigures`) re-renders from `_block`, so the ghost survives rotation/resize |
| 2 | A `role` → style map in one place: `ghost` = `col("muted")`, `DASH.ghost` (`"8 5"`, exists at `:10`), no fill (or fill-opacity ≤0.08), label in a muted pill; `truth` = its colour, solid, `FILL` | `poly.draw` (`:267–272`) uses `DASH.guide` for any dash today; `seg`, `arc`, `arrow`, `vline` likewise | §1 viz rule: ghost dashed/grey, truth solid/coloured, and it must survive grayscale (dash + label carry it, not colour) |
| 3 | Bounds: `fit:"fixed"` = fit the frame WITHOUT ghost points, then clamp ghosts (`offscale:"edge"`: stop at the frame edge, draw a break chevron, keep the label); `fit:"widen"` = include ghost points if the bbox grows ≤1.35×, else fall back to edge | `scene()` autofit `:326–339` (fits ALL mark points today, so a 5R_E ghost silently shrinks the picture); cartesian clips to the axis range (`:362`, `:418`): widen `g.x`/`g.y` for `widen` | a ghost must never shrink the truth below ~74% or vanish off-axis |
| 4 | Hidden-until-reveal: marks whose id is in a `reveal[].show` not yet unlocked are skipped by `drawMarks`; `role:"readout"` is always gated | `drawMarks` (`:320–323`) | no value at L1 (D42); readout only after grab |
| 5 | Handles: move the drag code of `try/live-scene.html` (inverse of `el._X` at `:298`, pointer capture, `touch-action:none`) into `Graph.live(el, spec)`; params → derive (math.js, already loaded) → marks → `render`, rAF-throttled | new, ~2 KB | L2 grab handle; one code path for question figure and sheet copy |
| 6 | Ghost entrance: opacity 0→1 over ≤200 ms, no movement; `prefers-reduced-motion` = instant | CSS on `[data-role=ghost]` | "nothing jumps"; the ghost must not look like an error flash |
| 7 | Every mark gets `data-role` on its `<g>` | all `draw()`s | tests and telemetry can find ghost vs truth in the DOM |

Size: ~3 KB added to graph.js (gzip ~1.2 KB). No new dependency.

## 4. app.js wiring (for whoever builds step 7)

- `feedback(r)` (`app.js:1074`): if `r.ghost` → `paintGhost(fig, r.ghost)` where `fig` = the first `#blocks .fig` (`ghost.on:"question"`); if
  `r.chip` → render the chip (KaTeX, the `missing` piece in `--mark`) under the hint line; if `r.affirm` → a thumbnail in `#fb`, never a
  modal, Next stays enabled.
- The ghost path REPLACES the lone red X for concept picks: today a wrong pick adds `.bad` + `vmark(ff,"i-x")` (`app.js:1081`) and a burned
  last try says "No tries left. Ask Tony about CODE" (`:1086`). Both are banned by the PSYCH PRIMER (lone X; help-seeking framed as failure).
  Flag for G/U: the struck choice keeps a neutral "your pick" marker; the last try shows the L3 strip + twin offer instead.
- `wishStart` (`app.js:1137`) stream reader: split on `\x1e`; text before it goes to `w.text` as today; bytes after it buffer until `\n`,
  then `JSON.parse` + client schema check (`$defs/block`); fail = drop. A record never renders half-built.
- Level engine (`S.lvl`): SCHEMA-V2 §5 start rules; `+1` and a 2nd ghost on the 2nd wrong pick (both ghosts stay, `n:1` and `n:2`, at most 2).
  "Just tell me" is always visible (D18): jumps to L3, counts a skip. Three skips in a row → pref on. A real interaction (handle drag,
  retry) resets the count. A Redeem Q (queue agent Q's tag) always starts at L1.
- 2-choice MC (1 try): a wrong pick IS the last try → L3 + twin + re-queue directly.

## 5. Server changes (serve.py)

1. `grade()` (`:694`) after `_grade()` returns `wrong` in sugar mode: `layer = sugar(lookup(code, mode))`; `pick = body["choice"]` (pick-all:
   `out["struck"]`); copy `kind[pick]` and `ghost[pick]` or `chip[pick]` into the reply. On `correct`: copy `affirm`. Never `slip`, never `key`,
   never another letter's ghost. The `/check` route (`:1274`) grades `view(p, mode)`, which has no layer, so the lookup must be on the raw problem.
2. `/explain`: may append one RS record per non-text block after the gate. Pregen blocks are NOT re-sent (the browser has them from `/check`).
3. Live gap (D1, SCHEMA-V2 §6): only from `/explain` or `/chat`, inputs through `INJECT_RE` (`:1092`) first, model + gate ≤1500 ms on a
   server timer, `$defs/liveScene` + kit check, any fail = no record (text + L3). Log the spec + gate result for Tony to promote.
4. Tests: the SCHEMA-V2 gate (`validate.mjs`, SCHEMA-V2 Appendix A) ported into `tests/scene.test.mjs` by agent X; a `test_serve.py` case:
   `/check` wrong on a concept letter returns `ghost` with that letter's `pick` and no `slip`; a mechanical letter returns `chip` and no `ghost`.

## 6. Telemetry hook points (names from the brief; agent T owns the final names and props)

| Event | Fires when | Hook point | Props |
|---|---|---|---|
| `viz_view` | a ghost / scene / chip is painted AND ≥50% in the viewport (IntersectionObserver, once per level) | `paintGhost`, the chip render, the stream's scene record | `code, pick, kind, level, n_ghosts, src (pregen/live), home (A–D), layout (short/inter), ms_from_check` |
| `viz_touch` | first pointerdown on the handle or figure after `viz_view` | `Graph.live` pointer handler | `code, level, ms_from_view, target (handle/figure)` |
| `viz_skip` | Next, Retry or "Just tell me" tapped while the visual was viewed but never touched | the Next / Retry / tell-me buttons | `code, level, via (next/retry/tellme), ms_from_view, skips_in_row` |
| `tellme_on` / `tellme_off` | the pref flips (3 skips in a row → on; the "flip back" link → off) | the level engine | `skips_in_row, source (auto/link)` |
| `bet_*` (`bet_tick`, `bet_win`, `bet_loss`) | the "I'm sure" tick (D52) and its outcome on `/check` | the tick handler + `feedback(r)` | `code, sure, verdict, delta (+3..+5 / −1..−2), double (D53 retry)` |
| `redeem_*` (`redeem_shown`, `redeem_win`, `redeem_miss`) | a re-queued Q appears / is answered | the queue (agent Q) + `feedback(r)` | `code, gap (3/8/20), start_level (always 1), level_reached` |
| proposed: `viz_live` | a live-gap attempt ends | `/explain` response trailer or a server log | `ok, ms, fail (schema/gate/timeout/inject)` |

Funnel (D21): pick → wrong → `viz_view` → `viz_touch` → retry → right. The two numbers that say whether this works: % of `viz_view` followed by
a retry within 30 s, and retry-right rate after L1 vs after L3.

## 7. Safari / real-iOS list (no BrowserStack creds: Tony's checklist)

`svh` + the collapsing toolbar under a partial sheet; `env(safe-area-inset-bottom)` (WebKitGTK reports 0); `touch-action:none` on an inline
SVG inside a scrolling box; pointer capture during a drag that starts near the sheet's grab bar; `position:sticky` inside `.freeze-in`
(variant C); KaTeX baseline in the chip; SF font width of the "your 80 J" pill at 393 px; DPR 3 dash pattern legibility (`8 5` at 1 px).

## 8. Asks to other agents

- **X**: port `gate()` from SCHEMA-V2 Appendix A into `tests/scene.test.mjs`; migrate `tests/visual-cases` per SCHEMA-V2 §7b (`role`, `goal.kind`).
- **T**: confirm the event names/props in §6; own the pref key name.
- **U / G**: the `.cl.part` CSS (§2); drop the lone red X on concept picks (§4).
- **K**: the live-gap authoring prompt targets `$defs/liveScene` and the draft `xy-area` kit.
- **Tony**: the bank fields (SCHEMA-V2 §3): `topic`, `parent`, `saccharine.kind / ghost / chip / affirm`; the leak note (SCHEMA-V2 §4).

## 9. SHAME CHECK

1. **Wrong pick, her voice:** "It didn't yell at me. It just showed my 80 next to the real one, on the same graph."
2. **Banned items:** none added. This plan REMOVES two that prod has today: the lone red X on a wrong pick and "No tries left. Ask Tony about CODE" (§4).
3. **Techniques:** 4 interpret, don't grade (ghost on her own figure, §1); 5 error = a step (Retry first in the strip; 2nd wrong adds help instead of a verdict); 6 private (the ghost needs no sheet, no chat, no human); 7 agency (one handle at her number, L2); 9 forgiving (Redeem at L1; skips never punish, they only change the default); 10 fast + light (0-LLM ghost in `/check`, ~3 KB of JS, text-first stream).
4. **Reopen tomorrow?** Likely, if variant A wins: the first miss feels like being shown something, not caught. Variant B/D cost one tap and hide the question, which is weaker.
5. **Seconds + taps to the aha:** variant A on iPhone: 1 tap (the pick) + ~0.3–0.5 s (`/check` + paint), 0 extra taps. B/D: +1 tap, ~1 s. Mid Android: same taps, ~0.8–1.2 s. Estimates from the code path; not measured on a device.
