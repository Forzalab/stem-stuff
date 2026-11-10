# Popover: the rich-context popup

Tony, Oct 23: "make the popover a reusable rich-context popup". The look follows shadcn/ui Popover / HoverCard (rounded-md, 1px border, soft shadow, p-3, w-72, text-sm). It is built in vanilla JS on the site's tokens. Code: `popover.js` (component), `app.css` "Popover" block (look), `app.js` `formulaCard` (first user). Lab: `design/popover-lab.html`. Tests: `tests/popover.pw.mjs` (component), `tests/easy.pw.mjs` "?" docs step (formula card).

**Where it sits in the render standard.** The popover is an app-chrome primitive, like the toast or the dismiss row. It is free to exist as a new UI component. Tony, Oct 23: "No new view/widget format" covers only what Cluck renders in replies, and replies stay OpenUI Lang (brain `openui-render-arch-plan-2026-10-18.md`). The popover is never a reply format: the model never writes a popover, its markup or its content. See "Inside Cluck replies" below.

## Anatomy

```
 [anchor]            ← the button that opened it (aria-expanded, aria-controls, aria-haspopup="dialog")
 ┌───────────────┐   ← .pop  role="dialog" aria-label, tabindex -1 (takes focus), data-variant, data-side
 │  header       │   ← .pop-h   optional formula header (KaTeX, the card row's size), centred
 │  Title        │   ← .pop-t   bold --ink, one short line
 │  body …       │   ← p        --muted
 │  Like  …      │   ← .pop-x   tiny example (bold run-in label)
 │  [figure]     │   ← .pop-fig a graph.js figure, role="img" + aria-label    (media)
 │  caption      │   ← .pop-cap one line, --t-xs                              (media)
 │      [Button] │   ← .pop-act one .btn, never .btn-go                       (action)
 └───────────────┘
```

## Tokens and sizes

| what | value | why |
|---|---|---|
| surface | `--float` (the raised surface), 1px `--line`, radius 6px, `--shadow-3` | shadcn "rounded-md border shadow-md"; STYLE.md two-part shadows for elevation |
| padding | `--s3` (12px); note `--s2 --s3` | shadcn p-3 |
| width | max-content, max `min(18rem, 100vw − 32px)`; note and term 16rem; media a fixed `min(20rem, 100vw − 32px)` | shadcn w-72 = 18rem; 16px gutters at 360 |
| text | `--t-sm` / 1.45, body `--muted`, title and labels `--ink` weight `--w-em` | RUI p.33-35: hierarchy by colour and weight |
| header | `--t-md`, `--ink`, centred, scrolls sideways if too long | the card row's formula size (Tony: "same KaTeX, same size") |
| figure tokens | `--body: --float`, `--knock` on `--float` | graph.js fills and label knockouts follow the surface (DESIGN-LANGUAGE.md §1) |
| layer | `position: fixed`, z-index 40 (over the bars at 10/20/30, under the splash) | STYLE.md §5: "Overlays are fixed" |
| motion | 120ms fade + 4px slide from the anchor side; none under reduced motion | STYLE.md §6: motion answers a tap |

## Behaviour

- **Opens on click or tap only, never on hover.** Hover tooltips fail on touch screens and need WCAG 1.4.13 work (ladder RESEARCH.md #6; NN/g tooltip guidelines).
- **Lazy.** `Pop.open` builds the DOM, and `Pop.close` removes it. No hidden doc trees sit in the page. The trigger is plain markup until it is tapped.
- **One at a time.** Opening one closes the other.
- **Closing:** a second tap on the same anchor, Esc (focus goes back to the anchor; Esc is captured, so it closes only the popover), a tap outside, Tab out of it, its anchor leaving the page (re-render), or its anchor scrolling off screen.
- **Placement:**
  - It sits 6px under its `align` element (the anchor by default), centred on it.
  - It is clamped 16px inside the viewport. Alignment gives way; the popover never overflows.
  - It flips above the anchor when there is no room below.
  - It is repositioned on scroll and resize.
- **Focus.** On open, focus moves to the popover so a screen reader reads it. Esc brings focus back to the anchor.
- **Content.** `build(el)` fills the element from author-time data only: the formula sheet, bank JSON and repo copy. Text goes in through `textContent` or the app's `esc()`/`docText()`. Raw markup from a model or a student never goes in. Figures are drawn by graph.js from scene JSON (SCHEMA.md `kind: "scene"`), never pasted as SVG.

STYLE.md §5 says "a floating thing never rests on a live control". A popover is the one floating thing the student asked for, by tapping. It covers what is under it only until the next tap anywhere, and that tap closes it.

## API (popover.js)

```js
Pop.toggle(anchor, { variant, label, build, align, host })   // a click handler's call: open, or close if this anchor's is open
Pop.open(anchor, opts) · Pop.close(focusBack) · Pop.make(opts) · Pop.anchor()
```

`host` mounts the popover elsewhere for a token scope. Its default is `body`. A future Cluck popover would mount in `.ai-box` to pick up the warm help tokens.

## Variants (presets of the same component)

| variant | content | rules | grounded in |
|---|---|---|---|
| **doc** | the formula header (centred under the row's formula), purpose as the title, symbols with meanings and units, "Use it", "Example" | header = the row's KaTeX at the row's size | FORMULA-CARD.md; feedback-specs B ("?" = code docs); Tony Oct 23 |
| **note** | one or two plain lines, no title | 16rem, tighter padding; if it needs a title, it is a term | RUI p.41-45 (labels are a last resort); NN/g "keep it brief" |
| **term** | the word as the title, one-line meaning, then "Like …" with a concrete case | grade-2 wording, every symbol named in words (feedback-specs "Tooltip authoring rules") | the tooltip authoring rules (an abstract word gets concrete cases) |
| **action** | a title, one or two lines, and **one** `.btn` | never `.btn-go` (STYLE.md §4: the only filled control is submit); never open while another Cluck CTA is on screen (spec E, the double-CTA bug) | STYLE.md §4; feedback-specs E |
| **media** | a small figure plus a one-line caption | **required** (Tony: essential for physics). graph.js scene JSON, `role="img"` + `aria-label` = the scene's `alt`; the figure is drawn at the popover's width and themed by tokens (currentColor/`--ink`/`--c1`), so it works on the dark card | DESIGN-LANGUAGE.md (figure tokens, strokes); feedback-specs H (geometry must be drawn) |

Dropped: a "rich tooltip on hover" variant, because nothing opens on hover. A "menu" variant was also dropped: menus are a different pattern (roving focus) and the site has none.

## Applications (ranked proposals)

| # | where | variant | status |
|---|---|---|---|
| 1 | Key formulas "?" (formula doc) | doc | **wired** (app.js `formulaCard`) |
| 2 | A figure chip next to a formula or ladder piece ("see it": the pulley, the rod and pivot) | media | proposal: a `fig` field on a sheet row or a `ladder.mid` piece, holding scene JSON |
| 3 | A slip hint, "why was this flagged?" | action ("Show the step") | proposal: never alongside "ok but how?" (spec E) |
| 4 | Symbols and terms in the question text (torque, moment of inertia) | term | proposal: author-marked in bank `md`, never auto-detected |
| 5 | XP, level or streak badges in the HUD ("how?") | note | proposal: `--reward` stays on the HUD; the popover itself stays neutral (STYLE.md: `--reward` never in a help surface) |
| 6 | Reward or burst info ("what was that?") | note | proposal, low priority: bursts must not wait on a tap |
| 7 | Settings rows (a one-line explainer of a mode) | note | proposal |
| — | Ladder "why?" on older pieces | (inline fold) | **kept inline, not a popover.** The notes are task content that "pops inline with its piece" (feedback-specs, Lane 3 amendment). An in-flow fold covers nothing, so the next piece stays readable, and it needs no dismissal (ladder RESEARCH.md #6) |

## Inside Cluck replies (proposal only, nothing wired)

Replies stay OpenUI Lang. Feedback-specs H says geometry "MUST draw with OpenUI". A reply that wants a popover would get it as a *component* in the OpenUI library (e.g. an L1 `Term(word, meaning, like)` or `Peek(label, child)`), rendered by our renderer, which calls `Pop.toggle` with `host` = the reply's `.ai-box`. The model writes only the component call. It never writes popover markup, SVG or CSS. A media popover could later host the OpenUI Geometry component as its child, in place of a graph.js scene. That would be the same figure path as the reply body, gated the same way (parse, checker, leak check).

## Lab

`python3 serve.py 8815`, then open `http://localhost:8815/design/popover-lab.html`. serve.py serves `design/`, and only `/tests/`, `/tools/`, `/banks/` and similar are blocked. You can also open the file straight from disk (`file://…/design/popover-lab.html`), because it fetches nothing. The top half has live triggers for all five variants. The bottom half draws the same five side by side as static specimens. Try it at 360 and at desktop width.
