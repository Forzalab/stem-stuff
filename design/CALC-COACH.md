# Calc Coach

App chrome, like the popover and the toast. It is NOT a Cluck reply format: replies stay OpenUI Lang, the model never writes a Calc Coach panel, and the reply library (`views/library.json`) has no button or link to it. Test: `tests/calc.test.mjs` "no new reply format".

- Code: `calc-coach.js` (window.CalcCoach), `calc-coach.css`, panel page `calc.html` (inline mount, `?model=ti36xpro&routine=R1&step=3`; `?cram=BANK_P3X` for the cram card).
- Data (static, generic, no exam stems): `calc/calc-steps.json` (research: model -> routine -> steps), `calc/calc-keys.json` (names), `calc/calc-layout.json` (labels only, no verified positions), `calc/calc-pad.json` (approximate keypads; the TI-36X Pro follows Tony's photo), `calc/cram.json` (the cram panel, per bank).
- The calculator choice belongs to the picker (`calc-pick.js`, `window.stemCalcPick`); Calc Coach reads `get()` (ids mapped in `IDS`) and listens for `stem-calc-model`. No model = the chip opens the picker.
- Verified only: a model with no verified source says "check your manual"; a step sourced UNVERIFIED is hidden; an inferred screen says "Your screen may look slightly different"; composed sequences say "Built from the guide's keys."
- Entry points: welcome card (`welcomeCard`, under the Q1 ladder), the "Calc" chip in every item view, a link in Cluck's chrome next to `.cl-verify` (never inside the reply), the BANK_P3X cram strip and a once-per-device-per-day toast.
- Promo: `EXAM_END` = 2026-11-10T08:00:00Z (2026-11-09 23:59 America/Los_Angeles). Before it: exam-day copy, strip, toast. After: neutral copy on the welcome card, no strip or toast. The chip stays. Strip dismissal: localStorage `stem-calc-strip`; toast: `stem-calc-toast-<date>`.
- Cram skeleton ("Stuck? Hail Mary"): `calc/cram.json` per bank, shown while `FLAGS.hailMary` is true and the entry's `until` has not passed; a slot next to Calc (item row and Cluck chrome) and one line in the strip. Flag off or expired = hidden. Reuse for another bank by adding an entry.
- The app is dark only today; `.cc[data-theme=light]` exists for calc.html.
