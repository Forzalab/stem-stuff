# HANDOFF: slips v2 (runtime algebra slips + dated bank versions)

Audience: the orchestrator session (runs it with subagents) and the tutor session (reviews it). Locked with Tony 2026-10-22 (PT).
Branch: `ccr-668d9f68-cd1c9u`. PR: Forzalab/stem-stuff#227. Already there: `form` + `ignore_slips` in SCHEMA.md,
`tools/slips.py` (sign flip, drop term, CLI), the test that `form` equals `answer`, and `design/BANK-MIGRATION.md`.
Do not open a new PR. Push to this branch.

## Locked decisions (do not re-ask)
1. **Families** (in this order, for hint priority): `distribute` (−(b+c)→−b+c; moved first, Tony Oct 22: on a tie with `sign` it names the real habit), `sign` (flip one term or the whole answer), `drop` (lose one term), `reciprocal` (a/b→b/a, lose the final 1/x),
   `power` (drop or add a square, drop or add a √), `factor` (whole answer ×2 or ×½),
   `dream` ((a+b)²→a²+b², √(a+b)→√a+√b), `trig` (sin↔cos, deg↔rad), `units` (whole answer ×10^±2, ×10^±3), `g` (9.8↔10).
2. **Runtime matching, in both modes** (diet and sugar). After the author's `wrong` entries miss and before `nudge`, a typed value that matches a slip of `form` within `tol` gets that family's hint. It counts as a normal wrong try.
3. **The hint names the family only.** It never prints a number or the answer; it may point to a place (amended, Tony Oct 24: on a `SLIP_TIE` collision the reply's `spot` line names where the slip is by structure, e.g. "the bottom of the fraction", never what it is; `slips.region`, `SPOT_COPY`). One fixed Cluck line per family (`FAMILY_HINT`), starting `QUACK.`.
4. **Hand-written `wrong` entries always win.**
5. **Uploads too.** Port the same mutants and matching to app.js `gradeLocal` (uploaded banks grade on the device). Tony: "JS doubles the code, who cares."
6. **`v` = yyyymmdd integer.** `1` = oldest. Cutoff `20261022`. The schema allows `1` or an 8-digit date.
7. **Gate for v ≥ 20261022** (tests fail): any `num` item or `num` part without `form`; any slip equal to the answer (`SAME`, unless listed in `ignore_slips`); two families giving the same value (unless listed in `ignore_slips`).
8. **Sunset for older banks: 2026-11-05.** Before that date, show a banner: "BANK_X must be updated by 2026-11-05". From that date, the bank does not load and shows the same message instead.

## Work units (one subagent each; A first, then B–E in parallel, F last)
- **A. Shared mutant engine.** Move the mutant logic out of `tools/slips.py` into an importable module (follow the repo layout). Export `mutants(form) -> [(family, value)]` for all 10 families. Use sympy `parse_expr(..., evaluate=False)` and `.doit()`. Folding the constants first destroys the terms. `tools/slips.py` becomes the CLI over the module: report, `--strict`, and the 3 gate rules. (D4, Oct 23: `parse()` is now stdlib `ast` + a small walker giving the same tree, except a unary minus on a bracket stays `(-1)*(..)`; parity is pinned by tests/fixtures/slips-golden-banks.json, regenerated with `python3 tools/slips.py --golden`.)
- **B. serve.py.** Wire `grade()` (~L781) num path: author `wrong` → slip match → `nudge`. Reply `error: <family>`, `hint: FAMILY_HINT[family]`. `form` must stay out of `public()` (it is a whitelist; add a test).
- **C. app.js `gradeLocal` (~L320).** A JS port of the 10 families plus matching, giving the same values as the Python (golden fixture shared by both test suites).
- **D. Versions.** SCHEMA.md: `v` = `1` or yyyymmdd. Add a **Version table** (first row: `20261022`, requires `form` on num, check `tools/slips.py --strict`, sunset for older banks `2026-11-05`). serve.py bank loading (`_index`/`banks()` ~L208): banner flag before the sunset, skip after it with the message. app.js shows the banner on the bank list and the message for a dropped bank. Test the date logic with an injectable clock.
- **E. Tests.** schema.test runs the gate on every bank with v ≥ 20261022. Unit tests: each family on a known `form`. Golden test: `PHYS_XZP` fixture with `form = 1/((4/3)^2+(1/3)^2+(2/3)^2)`, where typing `0.692` → `error: sign` in diet, sugar and upload.
- **F. Docs + review.** Update `design/BANK-MIGRATION.md` if anything drifted. Run `/code-review` on the diff. Fix what it finds.

## Must not
- Edit existing bank items. Migrating old banks is a separate task.
- Print a number or the answer in any slip hint (a hint may point to a place: rule 3).
- Send `form`, `ignore_slips` or slip values to the client for hosted banks.
- Change problem codes.

## Done when
- `cd tests && npm test` is green, and so is the Python test suite if the repo has one.
- `python3 tools/slips.py --strict` passes on a v20261022 fixture bank and fails on a broken one.
- PR #227 CI is green. Report back to the tutor session (`session_012wkqtt4zuekAJyu4UQ9obf`) with the commit list and gate output.
