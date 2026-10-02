# Multitask: the scratchpad next to the problem

Tony: on phones, selecting the scratchpad should expand it to fill the page (inside the page, not browser fullscreen), with a "multi-task" feel like iPadOS and Samsung One UI. Smooth and baby-friendly first. This file is research plus 6 phone variants, the tablet rule, and desktop options. Nothing here is built into the app yet.

Mock: `design/mockups/multitask.html`. Screenshots: `design/shots/mt-*.png`. Layout rules for panes live in [STYLE.md](STYLE.md) ("Panes and split"); this file owns the multitask layout.

## Flow (locked with Tony)

1. **Enter.** Tapping into the scratchpad opens it, with no extra step. A visible expand icon (`i-expand`) in the top-right corner of the pad's label row does the same.
2. **What stays visible.** Every variant has two modes, switched by Swap's two-icon pill (`.btn-tgl` look: document | pencil):
   - **peek**: the question text is pinned and scrolls by itself; the answer box is one tap away (tap the peek).
   - **full** ("nothing"): the pad fills the page and the problem shrinks to something tappable (chip, bubble, thumbnail, tabs or givens).
3. **Exit.** Three ways in every variant: the phone's Back gesture (`history.pushState` on open, `popstate` closes it, so you never leave the page); tapping the problem (the peek or the shrunk form), which closes and puts the caret in the answer box; and the collapse button (`i-collapse`), always in the **top-right corner of the pad**, which is where the expand icon was. Keyboard down never closes it.
4. **Memory.** The last mode and divider position or corner are remembered per device (`localStorage`, every read and write in try/catch; private mode just gets the defaults). The mock shows what it remembers in its top strip ("saved: peek ½") and in the side notes at desktop width.

## Research digest (principle, then what it means here)

Platform multitasking
- **Sheets rest at detents** (iOS: medium is about half, large is full; a grabber shows it can be resized, and it also resizes when you scroll its content). → Panes snap to 2 or 3 heights, never anywhere. The handle is a 36×4 pill in `--edge`, as the freeze strip already has. Source: Apple HIG, Sheets, https://developer.apple.com/design/human-interface-guidelines/sheets
- **Nonmodal sheets let you keep working in the parent view** (Notes' format sheet). → The problem never becomes a blocking modal: the pad and the problem are both live. Same source.
- **On iPhone, multitasking means Picture in Picture; on iPad, resizable windows with system tiling controls** (iPadOS 26 replaced the three-dot menu with window controls). → On a phone the only honest "second window" is a small floating thing (variants 1 and 5). Sources: Apple HIG, Multitasking, https://developer.apple.com/design/human-interface-guidelines/multitasking ; iPadOS split screen how-to, https://www.esper.io/blog/how-to-split-screen-apps-on-ipad ; iPadOS 26 windowing, https://www.switchingtomac.com/ipad-multitasking-ipados-26-guide/
- **A context-menu preview opens on a long press and can be tapped to open** (peek and pop). → Variant 4: hold to look, let go to return. Apple HIG, Context menus, https://developer.apple.com/design/human-interface-guidelines/context-menus
- **One UI pop-up view**: swipe from a top corner to float an app, drag its bar to move it, drag a corner to resize, minimize it to a bubble that can be dragged anywhere, flick it to an edge to shrink it. → Variant 1: the pad floats; in full mode the *problem* is the bubble. Our bubble snaps to an edge and 3 heights (no free floating). Sources: https://www.samsung.com/us/support/answer/ANS10002022/ ; https://www.androidauthority.com/samsung-pop-up-view-better-than-app-bubbles-how-use-3692326/ ; https://www.androidpolice.com/samsung-new-one-ui-5-gestures-step-up-multitasking-game/
- **Android split screen**: one divider, dragged; it snaps to fixed ratios (50/50, 70/30, 30/70) and dragging it to an edge gives the other app the whole screen. → Variant 2: snaps at ½ and ⅓; past the top the problem becomes a one-line chip. Sources: https://developer.android.com/develop/adaptive-apps/guides/support-multi-window-mode ; https://android-developers.googleblog.com/2016/05/designing-for-multi-window.html
- **Material bottom sheet**: peek height, half-expanded (default ratio 0.5) and expanded states; the drag handle is a 32×4 pill with a 48dp touch target, and tapping it cycles states for accessibility services. → Every handle here is tappable (tap cycles), drawn small, touched big (88×44). Sources: https://github.com/material-components/material-components-android/blob/master/docs/components/BottomSheet.md ; https://m3.material.io/components/bottom-sheets/guidelines
- **Material canonical layouts: list-detail, supporting pane, feed.** The supporting pane holds secondary content next to the primary task; on compact widths it drops below or becomes a sheet. → The problem is the "supporting pane" for the pad (and the other way round when answering). Tablet landscape and desktop are a supporting-pane layout. Sources: https://m3.material.io/foundations/adaptive-design/canonical-layouts ; https://developer.android.com/jetpack/androidx/releases/compose-material3-adaptive

Reference vs workspace (how designers keep a reference next to the work)
- **Pinned / sticky reference**: our own freeze layer (FREEZE.md) and Swap's peek (SWAP.md). → "peek" mode in every variant reuses Swap's peek rules (from the start, clamped, its own scroll, a bottom fade).
- **Glanceable summary**: show the few facts you need, not the document. → Variant 6 shrinks a problem to its givens (4.0 kg, 30°, 0.20, find a). Also usable as the chip text in variant 2.
- **Picture in picture**: small, always-on-top, snaps to corners, can be stashed at an edge. → Variant 5. Apple HIG, Playing video (PiP), https://developer.apple.com/design/human-interface-guidelines/playing-video
- **Hold to peek / transient preview**: look without leaving. → Variant 4.
- **Focus mode** (hide everything but the work, one tap to get context back): the "full" mode in every variant.

Ergonomics and access
- **Thumbs do most of the work; one-handed grip is about half of use; the top corners are hardest to reach.** → Bubbles and the PiP default to the right edge and bottom corner; the mode pill and collapse sit in the pad's header, which is mid-screen while the keyboard is up. Hoober, https://www.smashingmagazine.com/2016/09/the-thumb-zone-designing-for-mobile-users/
- **Gestures are invisible; many people never find them.** → Every gesture has a visible button (table below). NN/g on gesture discoverability, https://www.nngroup.com/articles/mobile-ux-study-guide/
- **WCAG 2.5.7 Dragging movements: anything done by dragging must also be doable with single taps.** → Divider, bubble, PiP, ribbon: tap the handle or the pill. https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html
- **Targets 44pt or more.** → All controls are `--btn` (48px); handles have 88×44 touch areas. https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum
- **Reversibility**: every state is one tap from the previous one (the pill toggles, Back undoes the open).

## Kept from Swap (hard-won fixes, apply to every variant)

- The stage is sized from `visualViewport`: `top: --kb-top`, `height: --vv-h`, so iOS (fixed elements on the layout viewport) still sees exactly the visible area. All pane sizes are percentages of that height, so the keyboard opening re-lays out on the same frame with no animation of ours ("nothing jumps").
- The keyboard stays up through every switch: buttons and handles cancel `pointerdown`, and a pane that is not shown stays laid out and focusable, so focus moves inside the tap (tiles: hidden tiles are visually hidden, not `display: none`).
- Insets: top `env(safe-area-inset-top)`, sides `--gut`, bottom none while the keyboard is up, `env(safe-area-inset-bottom)` when it is down.
- `interactive-widget=resizes-content` for Chromium; 16px+ fields (no iOS zoom); `overscroll-behavior: contain` on every scrolling peek.
- Motion: a snap or mode change is a 200ms View Transition crossfade; the layout itself is never animated. Reduced motion: instant.

## The 6 phone variants

States in the mock: `a` = just opened (peek, keyboard down), `b` = full, keyboard down, `peek` / `full` = the same with the keyboard up. Variant 4 also has `hold`.

| # | name | inspiration | peek | full (problem shrinks to) | enter / exit | gesture → visible button | keyboard up | risk |
|---|---|---|---|---|---|---|---|---|
| 1 | Pop-up | One UI pop-up view + minimize to bubble | the pad is a floating window over the bottom 58%; the problem page behind scrolls | window maximized; the problem is a floating 48px bubble at an edge (3 snap heights) | tap pad / Back, tap problem or bubble, collapse | drag the window bar up = full, down = peek → the pill, or tap the grip; drag the bubble → it snaps to an edge | the window keeps 58% of the visible height and sits on the keyboard; the bubble's slots are % of the visible height | two layers over each other; the heaviest to build (window + bubble + drag) |
| 2 | Split | Android / One UI split screen | problem pane on top at ½ or ⅓, the divider is the pad's header | divider at the top: the problem is a one-line chip (code + first words) | same three exits | drag the divider: snaps chip / ⅓ / ½ (flick biased) → tap the grip (½ → ⅓ → chip), or the pill | the ratio is of the visible height: ½ of 500px is 228px each; nothing else moves | at ⅓ with the keyboard up the peek is ~150px (4 lines) |
| 3 | Tiles | i3 / Pop Shell tiles, i3 tabbed | three tiles with 8px gaps: problem (34%), answer (its own live field), pad | one tile (the pad) plus two tabs: Problem (tap = back to it), Answer (tap = tiles with the caret in the answer) | same; also answer in place | swipe the pad's header sideways = toggle → the pill | the problem tile is 34% of the visible height; the answer tile keeps its 52px field | three things in 390px; the answer tile must be the very same field as on the page |
| 4 | Hold to peek | iOS context-menu preview (peek and pop) | the card pinned on top (40%), scrolls | a 52px chip; **hold** it and the card drops over the pad until you let go | same; a quick tap on the chip = back to the problem | hold the chip = look; hold + pull down = pin (peek) → the pill | chip and pinned pane are % of the visible height; the held card is capped to it | a hold is invisible (the chip says "Hold"); long-press fights text selection and the iOS callout (`-webkit-touch-callout: none`) |
| 5 | Picture in picture | iOS PiP, One UI pop-up | drop the thumbnail on the top edge: it docks as a 40% pane | a 152×116 thumbnail (figure + code) in a corner; default bottom right (thumb zone) | same; a tap on the thumbnail = back to the problem | drag it: snaps to the nearest corner, or docks at the top (a dashed ghost shows where) → the pill | bottom corners ride on the keyboard; the pad reserves bottom padding while the thumbnail is low | covers a corner of the pad; the thumbnail is a glance, not readable text |
| 6 | Givens ribbon | glanceable summary + the freeze strip's handle | the ribbon opens to the whole question, givens marked with a `--raised` knockout | a 56px ribbon of givens: m 4.0 kg, θ 30°, μk 0.20, find a | same; tap the ribbon = back to the problem | pull the handle down = peek, up = full → tap the handle, or the pill | ribbon 56px or 40% of the visible height | needs givens per problem (authored or extracted); MC and proofs have none, so they fall back to the chip of variant 2 |

### Pick

**Variant 2, Split.** One divider that everyone has seen on Android, both things visible at once, three snaps that cover both of Tony's modes, and pure ratios of the visible height, so the keyboard changes nothing but size. Fold in variant 6: when a problem has givens, the chip shows them instead of the first words.

## STYLE.md: rules each variant relies on, and open conflicts

All variants: `.btn` (48px, 2px `--edge`, 8px radius); the mode switch is the `.btn-tgl` look (active icon `--c1` on a `--raised` 6px pill), so the active pane is shown by its switch and never by a frame; one surface per pane on `--paper` with `--s2` gaps; problem surfaces `--sheet` at 10px; the pad is the scratchpad field (`--field`, `--mono` 16/1.6, `--focus` border only); handles in `--edge`; 200ms ease-out crossfade, instant with reduced motion; the hidden pane stays focusable; sprite icons at `--ico` in buttons and 20px next to text.

| variant | also relies on |
|---|---|
| 1 Pop-up | Elevation (a floating layer gets `--shadow-3`); the bubble is a plain `.btn`, not a round button |
| 2 Split | Panes and split (siblings, `--s2` gap); handle = the freeze strip's 36×4 pill |
| 3 Tiles | Tabs are controls: 2px `--edge`, 8px radius, `--raised` hover; Answer box (`.fld` = `.ff`, arrow flush) |
| 4 Hold | Elevation for the held card; Motion: moves 12px (under the 14px cap), opacity + transform only |
| 5 PiP | Elevation for the thumbnail; Figure frame (the figure sits straight on the card) |
| 6 Givens | Radius 4px for the inline knockout; weights: givens are not bolded inside the sentence |

Conflicts to settle in STYLE.md (I did not edit it):
1. **"The problem pane always shows the answer control"** vs Tony's locked peek ("answer box one tap away"). Proposal: in multitask peek the answer is one tap away (tap the peek); variant 3 meets both.
2. **Elevation table**: add "floating multitask layer (pop-up window, bubble, PiP, held card, desktop layout flyout): `--shadow-3`".
3. **New sprite symbols** to add to `index.html`: `i-expand`, `i-collapse`, `i-layout` (desktop option 2). `i-kb` and `i-back` are mock chrome only.
4. **Snap guides** (only while dragging) are 2px dashed `--edge`. A dash means "not accepted" on a control border; here it means "drop target". Alternative: solid 2px `--line`.
5. Durations are written as 120ms / 200ms until `--d-fast` / `--d-move` exist.

Tokens used (nothing else): colors `--paper --sheet --field --raised --ink --muted --hint --line --edge --focus --c1`; type `--t-md --t-sm --t-xs` (mock chrome only) `--mono` + Atkinson Hyperlegible; spacing `--s1`…`--s6`; sizes `--btn --fld --ico`; shadow `--shadow-3`; radii 10 / 8 / 6 / 4; borders 2px `--edge`, 1px `--line`. Layout constants: chip 52px, ribbon 56px, peek 40%, thumbnail 152×116, window 58%.

## Tablet (locked)

- Portrait, 600–839px (Material "medium"): the phone variant.
- Landscape, 840px and up (Material "expanded"): problem left, pad right, a draggable divider (24px column, 4×36 `--edge` grip) with snaps at ⅓, ½, ⅔, remembered per device. **The answer box stays under the problem** in the left pane in any side-by-side split. The divider is a `role="separator"` with arrow keys, Home and End (WAI-ARIA window splitter, https://www.w3.org/WAI/ARIA/apg/patterns/windowsplitter/), and double-click resets to ½ (as allotment does). Mock: `?v=tab`, shot `mt-tab-land-1180.png`.

## Desktop: research

| precedent | model | resize / snap | keyboard | what a problem \| pad page should copy |
|---|---|---|---|---|
| i3 / sway (https://i3wm.org/docs/userguide.html, https://github.com/swaywm/sway) | manual tree; containers split h or v; tabbed and stacked layouts | drag borders or a resize mode | everything (split, focus, layout toggle) | a one-key toggle between side by side and one column ("tabbed") |
| bspwm (https://github.com/baskerville/bspwm) | binary space partition | split ratio per node, keys or mouse | via sxhkd | two panes is one node with one ratio: keep the model that small |
| Hyprland dwindle / master (https://wiki.hypr.land/Configuring/Layouts/Dwindle-Layout/) | BSP (dwindle) or master + stack | split ratio / master factor | binds | "master" = the pad, the problem is the stack |
| Pop Shell (https://github.com/pop-os/shell) | auto-tiling on GNOME | drag, keys; floating exceptions | keyboard-first | auto side by side when wide enough; its colored active border is against STYLE.md |
| GNOME Tiling Assistant / Tiling Shell (https://github.com/Leleat/Tiling-Assistant, https://github.com/domferr/tilingshell) | halves and quarters, layout popup | drag to an edge, pick a layout | shortcuts | a small layout chooser |
| KDE Plasma tiling (https://kde.org/announcements/plasma/5/5.27.0/) | zones you edit (Meta+T) | Shift-drag into a zone | Meta+T editor | fixed zones, not free sizes |
| gTile (https://github.com/gTile/gTile) | grid picker | choose a cell span on a grid | arrow keys on the grid | presets drawn as little grids |
| FancyZones (https://learn.microsoft.com/en-us/windows/powertoys/fancyzones) | zone layouts | Shift+drag into a zone | Win+Shift+` editor | few preset zones |
| Windows Snap Layouts (https://learn.microsoft.com/en-us/windows/apps/desktop/modernize/ui/apply-snap-layout-menu) | 4–6 layout presets on the maximize button | click a zone in a preset | Win+Z | a layout button with 3 drawn presets (option 2) |
| Rectangle (https://github.com/rxhanson/Rectangle) | keyboard snaps: halves, thirds | repeating a shortcut cycles ½ → ⅔ → ⅓ | the whole point | one key steps through the snap ratios |
| Amethyst (https://github.com/ianyh/Amethyst) | xmonad-style automatic layouts | layouts, not drags | cycle layouts | cycle one column / side by side with one key |
| yabai (https://github.com/koekeishiya/yabai) | BSP, stack or float per space | keys, modifier + mouse | via skhd | "stack" = Swap's one pane at a time |
| komorebi (https://github.com/LGUG2Z/komorebi) | BSP, columns, rows, ultrawide | keys, mouse | via whkd | same as bspwm |
| Split.js (https://github.com/nathancahill/split) | two or more panes with gutters, sizes in % | `minSize`, `snapOffset` (snap to min within 30px), `dragInterval` steps | none built in | `%` sizes plus a snap near the edges |
| allotment, VS Code's sash (https://github.com/johnwalley/allotment) | split view | `minSize`/`maxSize`, `snap` to zero, `preferredSize`, double-click sash resets | not documented | double-click resets to ½; a pane can snap shut |
| react-mosaic (https://github.com/nomcopter/react-mosaic) | binary tree, `splitPercentage` | drag split; drag title bars to drop zones | little | the tree is overkill for 2 panes |
| Golden Layout (https://github.com/golden-layout/golden-layout) | rows, columns, stacks of tabs | drag tabs to dock, popouts | little | nothing: too heavy for 2 panes |
| dockview (https://dockview.dev/docs/overview/introduction/) | docking groups, grid and split views, floating groups, popouts | drag, touch support | some | floating group = the pop-up idea; heavy |
| FlexLayout (https://github.com/caplin/FlexLayout) | JSON model: rows, tabsets, borders | splitters, docking, popouts | some | "border" panels: a side pane you open on demand |

## Desktop options

| # | option | how | tradeoffs |
|---|---|---|---|
| 1 | **Side pane on demand** | Today's page stays the default (freeze layer, pad under the problem). The expand button on the pad's header, or Ctrl+\\, moves the pad to a right side pane. Sash with ⅓ ½ ⅔ snaps, arrow keys on the focused sash, double-click = ½, ratio remembered. The answer stays under the problem. | No change for anyone who does not want it; one button to learn. |
| 2 | **Snap layouts** | A layout button opens three drawn presets: One column, Side by side, Pad wide (⅓ \| ⅔). The sash still drags. | Most visible and self-explaining; one extra click every time; a flyout to maintain. |
| 3 | **Keyboard tiling (i3 style)** | Side by side by default at desktop width. Ctrl+\\ toggles one column, Ctrl+[ and Ctrl+] step ⅓ ½ ⅔ (Rectangle's cycling), Alt+1 / Alt+2 focus answer / pad (Ctrl+1/2 switch browser tabs), Esc goes back to the pad. A key legend under the panes. | Fastest for keyboard people; invisible without the legend; shortcuts can collide with extensions. |

**Pick: option 1**, with option 3's Ctrl+\\ and Ctrl+[ / ] as accelerators (shown in the button's tooltip). It keeps today's page as the default and adds one door, not a new layout system. Mock: `?v=desk&opt=1|2|3`, shots `mt-desk-1-1440.png` … `mt-desk-3-1440.png`.

## The mock

`design/mockups/multitask.html` links `../../app.css` and `../../vendor/fonts/atkinson.css`. The dashed strip at the top is mock chrome: variant chips 1–6, a keyboard toggle (a grey 300px block; its ⌄ key hides it without closing the pad) and a Back button that calls `history.back()`.

- `?v=N` opens variant N on the normal page; tap into the pad to open it.
- `?v=N&state=home|a|b|peek|full` shows a state statically for screenshots (defaults, not this browser's memory). `?v=4&state=hold` shows a held peek.
- `?v=tab` (tablet landscape), `?v=desk&opt=1|2|3` (desktop).

Screenshots (390×844, DPR 2, touch): `mt-N-a-390.png` (just opened: peek, keyboard down), `mt-N-b-390.png` (full, keyboard down), `mt-N-peek-390.png` and `mt-N-full-390.png` (keyboard up), `mt-4-hold-390.png`, `mt-home-390.png`; `mt-tab-land-1180.png` (1180×820); `mt-desk-1|2|3-1440.png` (1440×900).

## Not tested

- Chromium only (Playwright). No real iPhone or Android: the keyboard is simulated, so `visualViewport.offsetTop` and the iOS layout-viewport behaviour are reasoned from SWAP.md and FREEZE.md, not observed.
- Long-press on real iOS (variant 4) may still show the text callout or a haptic menu; needs a device.
- An interaction smoke test (scratchpad session only, not in `tests/`) checked: open by tapping the pad, collapse, Back closes without leaving the page, tapping the problem puts the caret in the answer, keyboard-down keeps it open, the split's drag and grip snaps, memory after reload, hold and release, PiP docking, the bubble's tap, the tablet sash snap.
