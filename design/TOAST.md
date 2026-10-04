# "One try left" toast: 7 variants

Mockup: `design/mockups/toast.html` (buttons 1 to 7 play each one; `?v=N` shows N held still, `&y=200` scrolls first). Shots: `design/shots/toast-N-390.png` and `toast-N-1920.png`. The 390 shots are scrolled 200px, the way the page sits while you write.

Shared by all 7: text "One more try, so choose wisely. 😈" (no-break space before the emoji, so it never sits alone on a line). 18px+ bold (`--t-md`). `role="status" aria-live="polite"`. `position: fixed`, so nothing on the page moves. It hides itself after 2 s (Tony, Oct 3; was 2.5 s). Tap anywhere on it (52px+ tall) or press Esc to close it. In: 320 ms, 14px slide plus fade. With reduced motion it only fades (CSS animations, because app.css turns every transition off). Top and bottom toasts check for a live answer control (an open box or choice) underneath and move to the other edge if they find one. Bottom ones sit above the code-bar strip, the safe area and `--kb-bottom` (the iOS keyboard).

| # | look | position | Refactoring UI rule | risk |
|---|---|---|---|---|
| 1 | `--raised` pill with a 2px `--mark` ring, shadow-4 | top centre, slides down | Creating depth: one raised layer, colour only on the edge | A tall frozen strip puts it over the problem text (text only, never a box) |
| 2 | Same pill as 1 | bottom centre, above the dock strip, slides up | Same as 1. It sits where the thumb is. | On a short page it lands on the choices and has to flip to the top, so you can't predict where it shows |
| 3 | Solid `--mark` fill, `--field` ink | top centre | Max contrast for the one thing that matters | Loudest of the 7: a big yellow slab after every miss feels like a scolding, not "baby-friendly" |
| 4 | `--sheet` card, 36px yellow warning triangle, text beside it | top centre | Use icons to carry meaning, not words | Wraps to 2 lines on phones and is the tallest top toast (covers the most). The triangle reads as "error", and the 😈 joke is lost. |
| 5 | Ring callout with a caret pointing at the ✗ | fixed under the wrong box, right edges aligned | Proximity: the message sits next to what it is about | Covers whatever comes after the box (the next card's text here, a part hint in the app). Must follow the box on scroll. With MC there's no single box. |
| 6 | `--sheet` bar, 5px `--mark` left rule | top edge; full-bleed on phones, column width on desktop | Accent border instead of a big fill | Looks like a system alert / app banner more than a friendly nudge. Covers the top of the frozen strip. |
| 7 | Rounded chip with a tries meter (yellow dot = try left, ring = used) | bottom centre | Show state, not words (the dots) | Wraps to 2 lines at 390. The dots repeat what the text says. Same flip issue as 2. |

**Pick: 1.** It stays on one line at 390, keeps away from both the thumb and the keyboard, and the yellow ring says "careful" without shouting like 3. If Tony wants the eye to stay put, 5 is the runner-up, but it needs a rule for MC (anchor it to the struck choice).

## Round 2: variant 5

Tony picked 5 (anchored under the wrong box) but not its look: the color, font, text treatment and emoji. Five new takes, 5a to 5e, live in the same mockup: `?v=5a` to `?v=5e`, add `&on=mc` to anchor on a multiple-choice answer, or use the "Anchor" button. Shots: `shots/toast-5a-390.png` to `toast-5e-390.png`, `toast-5a-1920.png` to `toast-5e-1920.png`, plus `toast-5a-mc-390.png` to `toast-5e-mc-390.png`. The 390 shots are 390×844 at 2× pixel density, scrolled 200px.

### What the research says

- **Keep the message next to the box.** NN/g says to keep error messages next to the field that caused them, so the student can read and fix at the same time. Primer's InlineMessage goes "below an input field, next to a button". Stripe marks the field itself (`.Input--invalid`, a 2px ring in `colorDanger`) and puts the text under it.
- **Don't let color carry the meaning alone.** NN/g adds an icon for colorblind users. Impeccable's clarify rule says the same: punctuation, color or an icon must not carry the message alone. Here: the dashed red box plus ✗ says "wrong", the yellow ring plus the drawn imp says "careful", and the words say it in full.
- **A warning on a dark theme without looking cheap.** No big fill: STYLE.md 2.1 and round 1's variant 3 both show a yellow slab shouts. A 12% yellow tint over our blue-grey turned olive in the first 5a draft, so I dropped it. What's left: a `--sheet` surface, yellow only on a 2px ring or rule and on the icon. Impeccable's craft floor also refuses colored `border-left`/`border-right` above 1px on alerts, which rules out round 1's variant 6, and zero-offset glows.
- **Type.** Impeccable: light text on dark needs one more step of weight. STYLE.md: weights 400 and 700 only, never bold one word inside a sentence, sentence case, no tracking. So the whole sentence is bold `--t-md` in `--ink`. The first round-2 draft bolded "One more try," in yellow, which broke that rule, so I removed it. A no-break space keeps "choose wisely." together so lines break as "One more try, / so choose wisely."
- **Icon, not emoji.** Impeccable's craft floor refuses "Unicode glyphs or emoji standing in for an icon system". STYLE.md section 4 asks for a drawn `i-imp`. I drew it in the sprite's style (24 grid, 2px stroke, round caps, no fill, `currentColor`): a round face, two horns curving outward, slanted brows and a grin. It shows in `--mark` at 20px, at the end of the text, `aria-hidden`.
- **Tone.** Duolingo's wrong-answer sheet uses a "not scary red", slides up in about 200ms ease-out, and its copy "acknowledge[s] the mistake without punishing it". Impeccable's delight rule says warmth may reduce stress, but jokes must not trivialize the loss. The imp is the joke, kept small; the words stay plain.
- **Motion.** Impeccable: exits are faster than entrances, no bounce. STYLE.md caps this at `--d-move` 200ms ease-out, 14px of travel, opacity and transform only. So: in and out over 200ms with an 8px slide from the box's side. Reduced motion gets a 200ms fade.
- **Timing.** Sonner (Emil Kowalski) pauses the timer while the pointer rests on the toast and while the tab is hidden. The mockup does both. Geist: auto-dismiss unless the student must act on it, and they don't have to here.
- **Covering.** The box and the live choices are never covered. On MC the toast lies on the struck-out choice itself, which is a dead control, so no live choice is hidden.

Sources: [Impeccable repo](https://github.com/pbakaus/impeccable) (`reference/craft-floor.md`, `animate.md`, `clarify.md`, `delight.md`, `typeset.md`), [impeccable.style](https://impeccable.style), [Primer InlineMessage](https://primer.style/product/components/inline-message/), [Primer form validation](https://primer.style/product/ui-patterns/forms/), [NN/g error guidelines for forms](https://www.nngroup.com/articles/errors-forms-design-guidelines/), [Stripe Appearance API](https://docs.stripe.com/elements/appearance-api), [Vercel Geist toast](https://vercel.com/geist/toast), [Sonner](https://sonner.emilkowal.ski/) and [Building a toast component](https://emilkowal.ski/ui/building-a-toast-component), [Duolingo design notes](https://blakecrosley.com/guides/design/duolingo), [Material 3 snackbar](https://m3.material.io/components/snackbar/guidelines). Material and Apple HIG pages render with JavaScript and gave no readable rules when fetched; nothing above relies on them.

### The five takes

All five share these choices: `--sheet` surface, `--t-md` bold `--ink` text, `--shadow-3`, `i-imp` in `--mark` at 20px, 200ms ease-out with an 8px slide (fade only with reduced motion), `role="status"`, tap or Esc to close, 2 s timer that pauses on hover and while the tab is hidden. On MC every take lies exactly on the struck-out choice, with no caret.

| take | look and attachment | 😈 becomes | tokens beyond the shared ones | STYLE.md audit | risk |
|---|---|---|---|---|---|
| **5a tab** | Hangs from the box's bottom edge, inset 8px. The 2px `--mark` ring is open at the top, so the box and tab read as one piece. Text in two lines on phones. | the imp after "wisely." | `--mark` ring on 3 sides, `--s2`/`--s3`, radius 0 0 10px 10px | Passes. One reading call: the ring has no top edge, because the box's own border closes it. | Covers about 70px under the box (here, the top of the next card). |
| **5b ring bubble** | Floats 12px under the box, right edges aligned, with a caret at the ✗. One line on a 390 phone. | the imp after "wisely." | 2px `--mark` ring, `--s3`/`--s4`, 10px radius, caret 14px | Passes. This is STYLE.md's toast anatomy as written. | The most "toast-like" of the five; the caret is the only attachment. |
| **5c rule strip** | A `--sheet` strip as wide as the column. A 2px `--mark` underline only as wide as the box; the text starts at the box's left edge (on desktop it ends at the box's right edge). | the imp after "wisely." | `--mark` 2px rule, `--s3`/`--s4`, radius 0 0 10px 10px | Mostly passes. No ring (the rule replaces it); the rule is a bottom line, not a side stripe. | Covers the most (full column width). On desktop the wide, mostly empty strip looks heavy. |
| **5d quiet** | No ring. Two lines: "One more try," in `--ink`, "so choose wisely." in `--muted`, both bold. Caret in `--sheet`. Yellow appears only in the imp. | the imp after "wisely." | `--muted` second line, `--s3`/`--s4`, 10px radius | Breaks one rule: STYLE.md's toast has a 2px `--mark` ring, and 5d has none on purpose. | Calmest, but it can read as a hint rather than a warning. |
| **5e imp on the edge** | Ring bubble. The imp sits on the top ring, in a 28px `--sheet` disc with a 2px `--mark` ring, right under the ✗: the imp is the pointer. No icon after the text. On MC the disc is hidden and the imp goes back after the text. | the perched imp | 2px `--mark` ring, disc, `--s3`/`--s5` | Two breaks: a 50% radius (STYLE.md keeps that for choice badges) and the imp not at the end of the text. | Cutest. The disc is small on desktop, and the 20px imp's face is hard to read. |

**Pick: 5a.** The tab grows out of the wrong box, so the warning sits where the eye already is, with no gap and no pointer to read. It follows STYLE.md, and it's one line shorter than a bubble on desktop. Runner-up: 5b, if Tony wants the rule-book toast exactly as STYLE.md describes it.

Notes:
- STYLE.md issue #8 (toast timing 320ms in this doc, 200ms in the CSS) is settled for round 2 at 200ms. Round 1's 320ms, color emoji, pill radius, `--shadow-4` and variant 6's side stripe stay only as history; none of them carry into 5a to 5e.
- In the mockup the multiple-choice card stands in for the next problem, 48px below (the app shows one problem at a time). In the app, what sits under a wrong box is the part hint, the next part, or the scratchpad. Each take covers that for at most 2 s.
- The 20px imp is small at 1920. If Tony wants it bigger there, the STYLE.md fix is to put it on `--ico` (24px, grows on desktop) rather than adding a new size.

## Round 3: no yellow, the page's own type

Tony (Oct 2, on 5d): no yellow, and the font looks out of place, tacked on. Three takes: `?v=5f`, `?v=5g`, `?v=5h` (add `&on=mc` for the choice anchor). Shots: `shots/toast-5f-390.png` … `toast-5h-390.png`, `-mc-390`, `-1920`.

Shared: text in the part prompt's style (400, `--t-md`, `--ink`, `--lh`), no bold. The imp takes the text's colour family (`--muted`, or `--bad` in 5h), never `--mark`. Same anchoring, timing, motion and dismiss rules as round 2.

| take | look | risk |
|---|---|---|
| **5f page note** | `--paper` fill (the page itself), 1px `--line` hairline (the part divider), `--shadow-3`, caret at the ✗ | Quietest; the shadow is the only thing that lifts it off the page |
| **5g card** | Exactly a problem card: `--sheet`, 10px, no ring, caret at the ✗ | Reads as one more card; can blend with the Cluck hint card under it |
| **5h box tab** | Hangs from the wrong box, box-width, in the box's own 2px dashed `--bad` edge, open at the top, `--field` fill. The box grew a line. | Red twice (box + tab); small seam where the box's rounded corners meet the tab |

The mock now shows the part hint as main renders it under a wrong part (verdict line "Not quite. One more try." + the Cluck card). Every take covers the top of that hint for 2 s. 5h covers the verdict line, which says the same words.

> Superseded Oct 2 ~22:05: the shipped look is take 5f (paper, `--line` hairline, `--shadow-1`) with its caret on every toast (MC row and onboarding too). Rules: [STYLE.md](STYLE.md) §3 Toast. Everything below is history.

**Pick: 5h.** It is part of the box, not a sticker on top of it. It covers only the verdict line that repeats it. Runner-up: 5g.

Also in this round: a right answer box in a closed part (or question) dims like every closed box (`opacity: .5`); its green edge and check stay (app.css `.ff.shut`, `.q.closed .ff`; test `disabled.pw.mjs` updated). A right MC choice still stays bright (main, PR #30).
