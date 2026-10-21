# Dismiss Cluck's column (desktop)

Tony, Oct 20, on the mock board `mock-dismiss.html` (variants A, B1-B4, H): "B4 look with H humor (with scrolling animation like loads of sassy phrases - test some humor kind thru A/B testing hash cookie), ship it".
Style exception: STYLE.md §5 (humour on this one row only). Render standard: repo CLAUDE.md (no new view or widget format; this is chrome in app.js / app.css).

## What it does
- **Where:** desktop side by side only (`html.side`). Phones are unchanged: the sheet keeps its own X, drag and Escape.
- **Dismiss:** Cluck's header X, Escape (Esc-to-close, not a new shortcut), or the sash dragged past 85% to the right edge (the mirror of today's 52px question strip on the left). The whole right column goes (Cluck's sheet, pad, videos). With a snack's original in the column, the X and Escape only close the sheet as before (its card is the way back); the drag still dismisses.
- **Dismissed (variant A):** `html.cl-gone`: one centred column (`--col` × 0.85: ~50rem at 1280, ~58rem at 1920), the question and the answers one type step up (`--t-md` to `--t-lg`), no "Question" label. An auto-open (desktop default) waits while dismissed; any tap that opens Cluck brings the column back.
- **The way back (B4):** `#clBack`, a hairline row under the verdict, last in the question column (the `.cl-fold` shape, no box, 48px tall). Duck icon, the rotating line, then "Show him", fixed. Its accessible name is "Show Cluck's explanation"; the line and "Show him" are `aria-hidden`. A tap restores the column and opens Cluck on his explanation (or the reference steps); with nothing to show, just the column.
- **The line (H):** rotates every 3.6 s; the next line slides up 60% and fades in over .45 s. Reduced motion: the first line of the kind, static.
- **No keyboard shortcut.** The mock's "E" is dropped (STYLE.md §5 Keyboard).
- Per question, in memory only: a new question (or a reload) starts side by side again. Nothing is stored.

## Phrase sets (one kind per device)
| kind | lines |
|---|---|
| sassy | Cluck is pretending not to watch · Cluck has notes. Many notes. · Cluck saw that. Just saying. · Cluck is waiting. Patiently. Mostly. · Cluck could explain, if asked |
| deadpan (default) | Cluck is still here · Cluck has an explanation · Cluck is available · Cluck remains a duck · Cluck is on standby |
| duck (self-aware) | Cluck knows ducks don't cluck · Cluck is folded, not offended · Cluck is sitting on an answer · Cluck promises not to quack · Cluck is floating nearby |
| nerd | Cluck is at rest, potential energy high · Cluck is in a superposition of helpful · Cluck has a derivation ready · Cluck is waiting for a nonzero input · Cluck is converging on an answer |

No exclamation marks. Sparse: one row, one line at a time, only while the column is dismissed.

## The A/B rule
- **Bucket** = FNV-1a hash of telemetry.js's existing anonymous id (`did`, localStorage `stem-tid`) mod 4, in the kind order above (sassy, deadpan, duck, nerd). `window.stemHk(n)` exists only while telemetry is on. No new cookie, no new id, no new storage: privacy.html ("just a random ID on this device") stays true word for word.
- **No id** (Do Not Track, Global Privacy Control, "Don't record me", no key stamped, local runs): the fixed default, **deadpan**; `stemT` is a no-op, so nothing is recorded.
- **Recorded** through `window.stemT` only: `hk` on the existing `cluck_open` event, and `cluck_back_seen { hk }` each time the row appears (the exposure).
- **QA force:** `#hk=<kind>` (alone or after a code, `#CALC1_E01&hk=nerd`) or `?hk=<kind>`; read once at load, never a question code.
- Read it as: `cluck_open` with `tab` and not `auto`, right after `cluck_back_seen`, per `hk`; the exposure count is the denominator.

## Code
- `app.js`: `clGoneSet`, `clBackSync`, `clBack`, `HK`, `hkKind` (after `clClose`); `applyMT` sets `html.cl-gone`; the sash drag; `load` resets it per question; `hkForced` strips `hk=` from the hash before boot.
- `app.css`: `html.side.cl-gone ...`, `.cl-back`, `hk-roll`.
- `telemetry.js`: `bucket(id, n)` (exported in `__stemTelemetry`), `window.stemHk`.
- Test: `tests/dismiss.pw.mjs`. Shots: `design/shots/dismiss-2026-10-20/`.
