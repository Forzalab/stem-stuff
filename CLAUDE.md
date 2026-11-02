# CLAUDE.md

> **Render standard = the OpenUI Lang plan.** Runbook: brain `projects/calc/_files/sprint-render-v2/SPRINT.md` (plan: `projects/calc/topics/openui-render-arch-plan-2026-10-18.md`). No new view/widget format for what Cluck renders in replies: replies use OpenUI Lang only. App-wide UI components (popover, cards, toasts) may add new primitives (Tony, Oct 23; see `design/POPOVER.md`).

> **Figure amendment (Tony, Nov 1):** figures may use palette hues (`tone=`) with 3 shade layers (`layer=1|2|3`, Tailwind-style `--fig-<hue>-1..3`); figures only, no free colors. Layer 1 = asked, 2 = given, 3 = implied/context.

> **Fixed a bug? Log it.** Same turn as the fix PR: a short post-mortem + bug class in brain `projects/calc/topics/stem-stuff-bugs.md`. Read its class table before debugging. Every fix ships a test that fails before the fix.
