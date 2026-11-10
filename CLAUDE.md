# CLAUDE.md

> **Render standard = the OpenUI Lang plan.** Runbook: brain `projects/calc/_files/sprint-render-v2/SPRINT.md` (plan: `projects/calc/topics/openui-render-arch-plan-2026-10-18.md`). No new view/widget format for what Cluck renders in replies: replies use OpenUI Lang only. App-wide UI components (popover, cards, toasts) may add new primitives (Tony, Oct 23; see `design/POPOVER.md`).

> **Figure amendment (Tony, Nov 1):** figures may use palette hues (`tone=`) with 3 shade layers (`layer=1|2|3`, Tailwind-style `--fig-<hue>-1..3`); figures only, no free colors. Layer 1 = asked, 2 = given, 3 = implied/context. Auto-hue (W163): a figure mark with no tone/color gets its own palette hue (sky, amber, orange, violet, pink, cyan x 3 shades): fresh per figure, deterministic; no green/red auto-hues.

> **Stepper amendment (Tony, Nov 8):** `Steps` may carry one anchor figure (Geometry/Graph/Doodle) plus per-step `lit` parts (lit, rest dimmed, never removed), `say` + formula, Show all = key formulas. Still OpenUI Lang, no new reply format.

> **Fixed a bug? Log it.** Same turn as the fix PR: a short post-mortem + bug class in brain `projects/calc/topics/stem-stuff-bugs.md`. Read its class table before debugging. Tests follow brain AGENTS.md directive 23: at commit, smoke + sanity tests only, no new regression tests (regression = testing the full flow). TDD tests local to one feature count as smoke/sanity and are fine. Show the bug's repro command red before and green after the fix in the PR.

> **Orc/brain rules** live in the brain repo `AGENTS.md` (gitlab Forzalab-bravo/brain). This file holds repo-only rules.
