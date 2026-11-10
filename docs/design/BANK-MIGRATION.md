# Bank version migration (any version)

For an LLM or a human who must move a bank file from an old `v` to a newer one.
Read this whole file before you edit a bank. Follow the steps in order.

## 1. Facts

- `v` is the bank's schema version. Old banks use `1`. New banks use a date as an integer: `yyyymmdd` (e.g. `20261022`).
- Bigger `v` = newer. `1` is older than every date.
- Each dated version has a row in the **Version table** (SCHEMA.md). The row lists what that version adds or requires.
- Old banks load until their **sunset date**. Before it, they show a banner. After it, they do not load.
- `tools/slips.py --strict <bank>` and `cd tests && npm test` are the gates. A migration is done only when both pass.
  `tools/ship.sh` refuses to deploy a bank that fails `--strict` or the SCHEMA.md `problems` schema (`node tools/schema-check.mjs <bank>`).

## 2. Inputs you need

1. The bank file: `banks/BANK_XXX.json` (or an uploaded copy).
2. Its current `v`.
3. The target `v` (the newest row in the Version table, unless the user names one).
4. Every Version-table row with `v` greater than the current `v` and less than or equal to the target. Apply them **in order, oldest first**.

## 3. Steps

1. **Copy, don't edit in place.** Work on a scratch copy. Keep the original for the diff.
2. **List the rows to apply.** Write them down. Do not skip a row.
3. **For each row, in order:**
   1. Read what the row requires (new field, new rule, renamed field, removed field).
   2. Find every problem (and every `multi` part) the rule touches.
   3. Change only what the rule needs. Do not reword bodies, hints or answers for style.
   4. Run the row's check (named in the row). Fix every failure before the next row.
4. **Set `v`** to the target. Only after all rows pass.
5. **Run the gates:** `python3 tools/slips.py --strict <bank>` then `cd tests && npm test`.
6. **Diff** the copy against the original. Every changed line must trace to a row. Revert anything else.

## 4. What to look for (checklist)

### Values
- [ ] Every `answer` still evaluates. Every new derived field (e.g. `form`) evaluates to `answer` within `tol` or to 3 s.f.
- [ ] Units are the units the question asks for (cm vs m, J vs kJ, deg vs rad).
- [ ] Signs follow the problem's own sign rule ("counterclockwise is positive", "+ for tension").
- [ ] "magnitude" in the question → the answer is ≥ 0.

### Slips (v ≥ 20261022)
- [ ] Every `num` item and `num` part has `form`.
- [ ] `form` is plain numbers and the allowed tokens only (SCHEMA.md §sympy). No variables.
- [ ] `form` keeps the structure a student writes. Write `1/((4/3)^2+(1/3)^2+(2/3)^2)`, not `3/7`. A folded number gives no slips.
- [ ] No slip equals the answer (`SAME` in the report). If one does: restructure `form`, or add the value to `ignore_slips` with a reason.
- [ ] No two slip families give the same value. Same fix.
- [ ] Hand-written `wrong` entries stay. They beat runtime slips.

### Structure
- [ ] Codes do not change. A changed code breaks saved progress and shared links.
- [ ] No field is added that the target schema does not list (`additionalProperties: false` will fail).
- [ ] Server-only fields (`answer`, `form`, `wrong`, `saccharine.key`, `saccharine.slip`) are never copied into public fields like `body`, `tip` or `title`.
- [ ] Hints still start with `QUACK.` and still do not state the answer.

### Stop and ask the user when
- A row's rule cannot be met without changing the question's meaning.
- `answer` looks wrong. (Report it. Do not fix it inside a migration.)
- Two rows conflict.
- The bank's `v` is newer than the target.

## 5. Output

Report, in this order:
1. `BANK_XXX: v <old> → <new>`
2. Rows applied.
3. Per row: count of items changed.
4. Items skipped or flagged, with the reason.
5. Gate results (pass/fail and the failing lines).

## 6. Adding a new version (for schema authors)

1. Pick `v` = today's date, `yyyymmdd`.
2. Add a row to the Version table: `v`, what it requires, the check that proves it, the sunset date for older banks.
3. Make the check runnable (a test or a `tools/` script with `--strict`).
4. Add one step to section 4 of this file if the new rule has a trap.
5. Never change an existing row. Fix mistakes with a new row.
