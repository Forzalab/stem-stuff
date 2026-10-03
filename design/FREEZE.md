# Freeze layer: problem + question stay on screen while you write

Tony: "freeze the problem box AND the MC/freeform question (like excel freeze row) if textbox scrolling down, ish."

Files: `index.html` (`#freeze`, `#freezeIn`, `#more`), `app.css` (section "freeze layer"), `app.js` (section "freeze layer"). Test: `tests/render.pw.mjs` (step "freeze").

## What it does

1. `#freeze` holds the problem card, the question (MC choices or the answer field) and the feedback. It is `position: sticky; top: var(--kb-top, 0)`, so it scrolls normally at first and then sticks to the top while the scratchpad and Copy scroll underneath.
2. It never takes the whole screen. Its inner box (`.freeze-in`) has `max-height: var(--freeze-max)` and its own scroll. `--freeze-max` is set from the **visual** viewport height:

   | state | cap |
   |---|---|
   | short screen (under 720px) | 50% |
   | 720 to 960px | 60% |
   | taller | 70% |
   | keyboard up and typing in the scratchpad | 34%, at least 96px |

   Where JS hasn't run yet, the CSS fallback is `60svh`.
3. When the layer first sticks, or when the keyboard opens for the scratchpad, its inner box scrolls so that **the question is at the bottom of the strip**. A tall problem shows its end plus the question, and the start is one small scroll up inside the strip.
4. When the content is clipped, the bottom edge fades out and a chevron button appears, overlapping the edge. Tapping it unfreezes the layer (`.open`: normal flow, full height). Tapping again freezes it. A sticky element taller than the screen would hide its own bottom, so "expanded" always means unfrozen.
5. Once stuck, the layer gets a shadow and a 1px bottom line (`.stuck`, from a 1px sentinel above it), so it reads as a layer above the page.

## Browser decisions

| issue | decision | source |
|---|---|---|
| Sticky breaks when any ancestor has `overflow` other than `visible`: that ancestor becomes the scroll container. | No `overflow` on `body`, `main` or any ancestor of `#freeze`. Wide tables and display math scroll inside their own `.tbl` / `.katex-display` boxes. | MDN, position: sticky: https://developer.mozilla.org/en-US/docs/Web/CSS/position#sticky_positioning |
| iOS Safari: the keyboard shrinks only the *visual* viewport. Sticky and fixed elements stay attached to the *layout* viewport, so a top-stuck header can slide off screen while typing. | `app.js` reads `visualViewport` (`resize` + `scroll`). While a text field is focused and the visual viewport is under 80% of the tallest height seen for this width, it sets `--kb-top = visualViewport.offsetTop`, which moves the sticky `top` down to the visible top. | MDN VisualViewport: https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport ; Apple forums report of the keyboard shifting fixed headers: https://developer.apple.com/forums/thread/800125 |
| Chromium on Android can resize the layout viewport for the keyboard instead. | `<meta name="viewport" ... interactive-widget=resizes-content>`. There, sticky just works and `offsetTop` stays 0. Safari ignores the key. | Chrome for Developers, "Prepare for viewport resize behavior changes": https://developer.chrome.com/blog/viewport-resize-behavior ; HTMHell, interactive-widget: https://htmhell.dev/adventcalendar/2024/4/ |
| `100vh` on iOS is the tallest viewport (toolbar hidden). | Caps use `svh` as the CSS fallback and the JS value from `visualViewport.height`. `body` uses `min-height: 100dvh`. | web.dev, "The large, small, and dynamic viewport units": https://web.dev/blog/viewport-units |
| Focused fields scroll under a sticky header. | `html { scroll-padding-top: var(--freeze-h) }`, which JS keeps equal to the layer height. | MDN scroll-padding: https://developer.mozilla.org/en-US/docs/Web/CSS/scroll-padding |
| iOS zooms the page when a focused input's font is under 16px. | Every input and the textarea are 18px (1.125rem). `text-size-adjust: 100%`. | CSS-Tricks, "16px or larger text prevents iOS form zoom": https://css-tricks.com/16px-or-larger-text-prevents-ios-form-zoom/ |
| Scrolling inside the strip should not drag the page. | `overscroll-behavior: contain` on `.freeze-in` and on the subject menu. Momentum scrolling is the default on iOS 13+, so there is no `-webkit-overflow-scrolling`. | MDN overscroll-behavior: https://developer.mozilla.org/en-US/docs/Web/CSS/overscroll-behavior |
| Notches and the home indicator with `viewport-fit=cover`. | Side gutters are `max(1.25rem, env(safe-area-inset-left/right))`. The stuck layer pads its top with `env(safe-area-inset-top)`. `main` pads its bottom with `env(safe-area-inset-bottom)`. | MDN env(): https://developer.mozilla.org/en-US/docs/Web/CSS/env |
| Touch targets. | Every button is 48x48 (`.btn`, the one button system) and MC rows are at least 52px. | WCAG 2.2 target size: https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum ; Apple HIG (44pt minimum): https://developer.apple.com/design/human-interface-guidelines/accessibility |
| Firefox | Sticky, `svh`/`dvh`, `visualViewport` and `overscroll-behavior` are all supported. `field-sizing` isn't, so the scratchpad uses `explain-box.js`'s fallback. | MDN compatibility tables on the pages above |

## Refactoring UI rules applied (Wathan and Schoger)

- **Depth: "Use shadows to convey elevation" and "Shadows can have two parts" (pp. 158-166).** The stuck layer is a raised element, so it gets `--shadow-3`: a large soft shadow plus a tight dark one. The subject menu sat higher, so it got `--shadow-4` (history: the menu is gone; see STYLE.md §2.7). The page has no other shadows, so the frozen layer is clearly "closer".
- **"Overlap elements to create layers" (p. 170).** The expand chevron straddles the frozen layer's bottom edge, so it reads as belonging to that layer.
- **"Emphasize by de-emphasizing" (p. 39) and "Balance weight and contrast" (p. 48).** The problem code is small and muted. The subject-group marks in the menu are small and muted, so the three subject buttons carry the weight. The one filled control is the submit arrow (c1 fill), the primary action. Everything else is an outline button ("Semantics are secondary", p. 52: primary solid, secondary outlined).
- **"Keep your line length in check" (p. 99), 45-75 characters.** Problem prose is capped at 65ch. (The scratchpad's 68ch cap was dropped Tue 9/29 for balance: it now spans the column.) Figures and tables use the full column ("Dealing with wider content", p. 100).
- **"Establish a spacing and sizing system" (p. 60).** Spacing uses only 4, 8, 12, 16, 24, 32 and 48px (`--s1` to `--s7`).
- **"Use fewer borders" (p. 206).** The frozen layer is separated by shadow and a single line, not a box. Cluck's hint uses a background tint and the duck icon, not a coloured side stripe.

## Tested

- Chromium (Playwright) at 390x844, 1024x1366 and 1920x1080: after 60 lines in the scratchpad and scrolling to the bottom, the layer's top is at 0, it is marked stuck, and it covers less than 75% of the viewport. Screenshots: `shots/app-freeze-390.png`, `shots/app-freeze-1024.png`, `shots/app-freeze-1920.png`.
- **Not tested:** WebKit and Firefox are not installed in this container (`/opt/pw-browsers` has Chromium only), and a headless browser has no software keyboard. The iOS keyboard path (`--kb-top`, the 34% cap) is reasoned from the sources above, not observed. Check on a real iPhone and iPad: open PHYS_S2K, scroll down, tap the scratchpad, type, and scroll.

## Entry box on phones (bottom dock)

- Under 700px wide, or with a coarse pointer (touch), the entry box (upload + code bar, plus the "File … in use." line) is `position: fixed` at the bottom centre, for one thumb. Its bottom padding is `max(12px, env(safe-area-inset-bottom))`. `main` gets extra bottom padding equal to the box height (`--dock-h`), so scrolling to the end always clears the scratchpad and Copy.
- **Keyboard while typing the code:** `--kb-bottom = innerHeight − (visualViewport.offsetTop + visualViewport.height)` lifts the box onto the iOS keyboard. iOS keeps fixed elements on the layout viewport, the same issue as the sticky top.
- **Keyboard while typing anywhere else** (scratchpad, answer): the box is hidden (`.dock-away`) so it can't cover the caret. The frozen strip's height is computed from the viewport minus the box, so the strip, the writing area and the box always add up to the screen.
- On desktop the box sits at the top of the content column, at the column's width.
- Tested in Chromium at 390: the box is fixed, at the bottom and centred, and doesn't overlap the scratchpad or Copy at the end of the page. `tools/dogfood.mjs` screenshots a shrunken viewport as the "keyboard" (`shots/dog-keyboard-scratch-390.png`, `shots/dog-keyboard-code-390.png`). iOS itself is still untested.
