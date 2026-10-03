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

### Pick (round 1; superseded by variant 9, see Round 2)

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
- Landscape, 840px and up (Material "expanded"): problem left, pad right, a draggable divider (24px column, 4×36 `--edge` grip) with snaps at ⅓, ½, ⅔, remembered per device. **The answer box stays under the problem** in the left pane in any side-by-side split. Double-click resets to ½ (as allotment does). Mock: `?v=tab`, shot `mt-tab-land-1180.png`.
- A11y note (not a feature, never shown): the divider is a `role="separator"` and follows the WAI-ARIA window splitter pattern for assistive tech, https://www.w3.org/WAI/ARIA/apg/patterns/windowsplitter/.

## Desktop: research (round 1)

| precedent | model | resize / snap | what a problem \| pad page should copy |
|---|---|---|---|
| i3 / sway (https://i3wm.org/docs/userguide.html, https://github.com/swaywm/sway) | manual tree; containers split h or v; tabbed and stacked layouts | drag borders | side by side or one pane, nothing else |
| bspwm (https://github.com/baskerville/bspwm) | binary space partition | split ratio per node | two panes is one node with one ratio: keep the model that small |
| Hyprland dwindle / master (https://wiki.hypr.land/Configuring/Layouts/Dwindle-Layout/) | BSP (dwindle) or master + stack | split ratio / master factor | "master" = the pad, the problem is the stack |
| Pop Shell (https://github.com/pop-os/shell) | auto-tiling on GNOME | drag; floating exceptions | auto side by side when wide enough; its colored active border is against STYLE.md |
| GNOME Tiling Assistant / Tiling Shell (https://github.com/Leleat/Tiling-Assistant, https://github.com/domferr/tilingshell) | halves and quarters, layout popup | drag to an edge, pick a layout | a small layout chooser |
| KDE Plasma tiling (https://kde.org/announcements/plasma/5/5.27.0/) | zones you edit | drag into a zone | fixed zones, not free sizes |
| gTile (https://github.com/gTile/gTile) | grid picker | choose a cell span on a grid | presets drawn as little grids |
| FancyZones (https://learn.microsoft.com/en-us/windows/powertoys/fancyzones) | zone layouts | drag into a zone | few preset zones |
| Windows Snap Layouts (https://learn.microsoft.com/en-us/windows/apps/desktop/modernize/ui/apply-snap-layout-menu) | 4–6 layout presets on the maximize button | click a zone in a preset | a layout button with 3 drawn presets (option 2) |
| Rectangle (https://github.com/rxhanson/Rectangle) | snaps to halves and thirds | repeating a snap cycles ½ → ⅔ → ⅓ | one tap on the handle steps through the anchors |
| Amethyst (https://github.com/ianyh/Amethyst) | xmonad-style automatic layouts | layouts, not drags | the layout is automatic, not chosen |
| yabai (https://github.com/koekeishiya/yabai) | BSP, stack or float per space | modifier + mouse | "stack" = Swap's one pane at a time |
| komorebi (https://github.com/LGUG2Z/komorebi) | BSP, columns, rows, ultrawide | mouse | same as bspwm |
| Split.js (https://github.com/nathancahill/split) | two or more panes with gutters, sizes in % | `minSize`, `snapOffset` (snap to min within 30px), `dragInterval` steps | `%` sizes plus a snap near the edges |
| allotment, VS Code's sash (https://github.com/johnwalley/allotment) | split view | `minSize`/`maxSize`, `snap` to zero, `preferredSize`, double-click sash resets | double-click resets to ½; a pane can snap shut |
| react-mosaic (https://github.com/nomcopter/react-mosaic) | binary tree, `splitPercentage` | drag split; drag title bars to drop zones | the tree is overkill for 2 panes |
| Golden Layout (https://github.com/golden-layout/golden-layout) | rows, columns, stacks of tabs | drag tabs to dock, popouts | nothing: too heavy for 2 panes |
| dockview (https://dockview.dev/docs/overview/introduction/) | docking groups, grid and split views, floating groups, popouts | drag, touch support | floating group = the pop-up idea; heavy |
| FlexLayout (https://github.com/caplin/FlexLayout) | JSON model: rows, tabsets, borders | splitters, docking, popouts | "border" panels: a side pane you open on demand |

## Desktop options (round 1, superseded by "Desktop, revised")

| # | option | how | tradeoffs |
|---|---|---|---|
| 1 | **Side pane on demand** | Today's page stays the default (pad under the problem). The expand button on the pad's header moves the pad to a right side pane. Sash with ⅓ ½ ⅔ snaps, double-click = ½, ratio remembered. | Out: Tony ruled "pad down = bad". |
| 2 | **Snap layouts** | A layout button opens three drawn presets: One column, Side by side, Pad wide (⅓ \| ⅔). The sash still drags. | One extra click every time; a flyout to maintain. |

Option 3 of round 1 was dropped whole, and with it every key-driven control and the legend: Tony ruled them out. Mock: `?v=desk&opt=1|2` (archive), shots `mt-desk-1-1440.png`, `mt-desk-2-1440.png`.

## Round 2

Variants 7–11 reworked through three references. The lock from round 1 stands: tap the pad or the expand icon to open; peek | full on the two-icon pill; exits = Back, tap the problem, collapse top right; the phone's on-screen keys going down never closes it; memory per device.

### Research (what we took)

- **Material 3 canonical layouts: list-detail and supporting pane.** On a compact screen show one pane, or the supporting pane below the main one; on an expanded screen, side by side. → 7 is list-detail on a phone (one column of tiles), 8 is the supporting pane docked below, the desktop is the supporting pane beside. https://m3.material.io/foundations/layout/canonical-layouts/list-detail ; https://m3.material.io/foundations/layout/canonical-layouts/supporting-pane
- **M3 pane expansion: a drag handle between panes, with anchors.** Drag snaps to an anchor; the handle can collapse a pane fully to switch between one and two panes; the handle has its own semantics for assistive tech. → every round-2 variant has one handle in the gap, 2–4 anchors, a tap goes to the next. https://developer.android.com/jetpack/androidx/releases/compose-material3-adaptive ; https://composables.com/jetpack-compose/androidx.compose.material3.adaptive/adaptive-layout/composable-functions ; https://m3.material.io/foundations/layout/applying-layout/window-size-classes
- **iPadOS Split View and Slide Over.** Split View opens at 50/50 and the divider snaps to 25/75 and 75/25 (thirds in portrait); Slide Over is a narrow pane that stashes off the edge. → 9 snaps ½ and ⅓ like Split View; 11 and the desktop stash the problem to a 52px strip at the edge instead of hiding it. https://developer.apple.com/library/archive/documentation/WindowsViews/Conceptual/AdoptingMultitaskingOniPad/QuickStartForSlideOverAndSplitView.html ; https://www.popsci.com/diy/how-to-split-screen-on-ipad/ ; https://www.imore.com/how-use-slide-over-and-split-view-ipad
- **Tiling window managers: auto-tile, gaps, no overlap.** Windows are placed side by side automatically, never over each other; inner gaps between windows, outer gaps to the screen edge. → the problem and the pad are sibling tiles; nothing floats, so no shadows (8's floating sheet is now docked); 8px outer gap, 16px inner gap where the handle sits. https://i3wm.org/docs/userguide.html ; https://wiki.archlinux.org/title/I3 ; https://www.omgubuntu.co.uk/2020/03/pop-shell-wants-to-bring-proper-tiling-window-features-to-gnome-shell

### Variants 7–11, reworked

States: `a` = just opened (peek), `b` = full, `peek` / `full` = the same with the on-screen keys up. "Anchors" are listed smallest first; anchor 0 is "full".

| # | name | lens | peek | full (anchor 0) | handle anchors (tap = next, wraps) | answer box visible | risk |
|---|---|---|---|---|---|---|---|
| 7 | Composer | M3 list-detail, one pane | quote tile 38% over the pad, answer tile docked at the bottom | quote = one-line chip | chip, 38% | always (own tile) | four stacked things on 390px; the quote is short at 38% |
| 8 | Docked sheet | M3 supporting pane, compact | pad on top, the problem tile docked below at half (no longer floating, no shadow) | a 60px bar with the code | bar, half | peek only | the problem sits under the pad, far from where you read first |
| 9 | Answer sliver | Split View, stacked | problem tile at ½ or ⅓, its bottom edge is the answer box | only the answer box (+ a doc button) stays | sliver, ⅓, ½ | always | at ⅓ with the keys up the question is about 4 lines |
| 10 | Inline title | pane expansion to one pane | problem tile 40% | the problem folds into the pad's header (code + "find a"); the scroll-linked fold of round 2 is gone (it moved things under the finger) | title, 40% | no | full mode hides the answer; the title row is cramped |
| 11 | Side column | Split View, side by side; Slide Over stash | problem column left \| pad right, ½ each, as on desktop | the problem stashes to a 52px strip at the left edge | strip, ½ | peek only | at 390px each column is ~180px: the problem wraps to 3–4 words a line |

Every variant: handle = 36×4 `--edge` pill (4×36 when vertical) in the gap, 88×44 touch area, `--muted` on hover and while dragging, 3px `--focus` ring. A drag past 40px (or a flick) goes one anchor that way, past ~120px two. Snaps are the 200ms crossfade. The handle's `aria-label` says the current and the next anchor.

### STYLE.md audit (round 2)

Meets: one surface per pane on `--paper`; the active pane is shown by the `.btn-tgl` pill, never a frame; hidden panes stay laid out and focusable (strip, sliver, chip); `.btn`, `.fld`, scratchpad field unchanged; handle pill = the freeze strip's; 120ms / 200ms ease-out, instant with reduced motion; tokens only (`--s2`, `--s4`, `--edge`, `--muted`, `--focus`, `--sheet`, `--raised`); no shadows at all in 7–11 and the desktop (round 1's open elevation question is moot for them).

Open, for Tony (I did not edit STYLE.md):
1. **Gap**: Panes and split says `--s2` between panes. Round 2 uses `--s4` where a handle sits (the pill needs room). Proposal: "`--s2` between panes, `--s4` when the gap holds a drag handle".
2. **Answer always visible**: "the problem pane always shows the answer control". 7 and 9 meet it in both modes; 8 and 11 only in peek; 10 never in full.
3. **The pane does not follow the finger** while dragging in the mock; it snaps on release. M3 has the pane follow. Following the finger is direct manipulation, not an animation, but it does resize layout live; needs a ruling against "never animate layout".
4. **Vertical code** in the strip (`writing-mode: vertical-rl`) is new type. Same size, weight and spacing as the code line.

Impeccable (`npx impeccable detect`; live with Chromium, states `a` and `full` of 7–11 at 390×844, `?v=desk` at 1920×1080 and 700×900): before 0 static, 135 live at 390 (26 per keys-up state were the simulated keys, `--ink` on `--line`; the rest chip text and hidden-pane text overflowing), 1 at 1920 (the mock tag's 4px padding). After: 0 static, 0 at 390, 0 at 1920, 0 at 700. Fixes: simulated keys on `--sheet`; chips in 7 and 8 say "find a" (what the question asks) instead of a cut-off sentence; hidden problem text in 8 and 11 is `visibility: hidden` (the answer box stays focusable); the mock tag gets `--s2` / `--s3` padding.

### Pick

**Pick: 9, Answer sliver.** The answer box never leaves the screen (the STYLE.md rule holds in both modes), and the anchors ½ ⅓ sliver are Split View's thirds on a handle everyone has dragged.
**Runner-up: 11, Side column.** The same layout as tablet and desktop (one model everywhere), but on a 390px phone each column is too narrow to read the question.
**Vs round 1's pick (2, Split):** 9 is 2 with two fixes: the answer box rides on the problem tile's bottom edge instead of disappearing with the chip, and the handle moves out of the pad's header into the gap, so the header keeps only the pill and collapse. 9 replaces 2 as the phone pick. Variant 6's givens can still go into the sliver's left slot later.

## Desktop, revised

- **Default: side by side.** Problem + answer box left, pad right, never the pad under the problem (Tony: "pad down = bad"). It is always on at desktop width: no open step, no collapse, so the phone's exits do not apply.
- **The sash is the M3 drag handle.** 24px gap with a 4×36 pill, 48px touch area. Anchors: strip, ⅓, ½ (default), ⅔. Drag snaps to the nearest; drag past 20% to the left stashes the problem to a 52px strip (Slide Over). A tap on the sash goes to the next anchor down (½ → ⅓ → strip → ⅔ → ½); double-click = ½. Remembered per device.
- **The pill** in the pad's header (document | pencil) does what it does on the phone: document = both panes, pencil = pad wide with the problem as the strip. Tapping the strip brings the problem back.
- **Narrow-window fallback.** Two panes need 340px each, so under 720px the window gets the phone page as it is (problem, then the pad), and the pad's expand icon opens the phone pick (variant 9). From 720px up it goes back to side by side. Tablets keep their own rule (portrait = phone, landscape = side by side).
- A11y note only: the sash is a `role="separator"` (WAI-ARIA window splitter) with arrow and Home / End support for assistive tech; it is never shown or documented as a feature.

Mock: `?v=desk` (or `?v=desk&opt=r2`), `?v=desk&state=full` for the strip. Shots: `mt-desk-r2-1440.png`, `mt-desk-r2-1920.png`, `mt-desk-r2-full-1440.png`, narrow fallback `mt-desk-r2-800.png` (still side by side) and `mt-desk-r2-700.png` (phone page).

## Shipped (stage 2, Oct 2)

In the app: phone = variant 9 (tap the pad or the expand icon), desktop and landscape tablets = side by side from 720px. No keyboard shortcuts; the sash takes arrows / Home / End only when focused (WAI-ARIA splitter). Keyboard up hides the expand icon, the pill and the old `#swap` toggle (gone); switching = keyboard down, a tap on the question peek, or the **pad peek** (one line above the keyboard: pencil + the pad's last line; a tap focuses the pad in the same tap). After keyboard down or Back the last edited field scrolls back into view, not focused; no pane change resets scroll. A fix box's `how` is its placeholder (20 characters at most, SCHEMA.md), with a wrapping caption as the fallback.

Fixes found while shipping: the pull-tab's margin rule (`.freeze + .work`) missed `#work` once the sash sat between them (`~` now); on a touch tablet the side-by-side pad now stops above the bottom bar (Cut / Copy were under it).

Tests that encoded the replaced behaviour (old → new): render "pull-tab" all views → phone only (side by side has none); render "balance" pad under the card → pad beside it, tops aligned; render "copy band" a tap on the pad → script focus on the phone (a tap opens the pad page), a column-tall pad walks the long line to the bottom row, a touch tablet's bar band always clears the buttons; polish (c) and swap.pw `#swap` clicks → the question peek / the pad peek; choose-all A8F caption on phones → placeholder (the short how fits). New: `tests/flow.pw.mjs` (390, 375, 1440), shots `design/shots/flow-{1..8}-390.png`, `flow-desktop-1440.png`. Impeccable live, app at 390 and 1920: 0 and 0.

## Round 3 (Oct 2, Tony on PR #32)

Rulings (Fri ~21:50 PT): tapping into the pad opens the **Question tile + big pad**; the pill becomes **Question | Answer** and the Question tile hides the answer control for every type (STYLE.md's "the problem pane always shows the answer control" gets rewritten at ship); on phones the **pad is hidden by default** and a **draggable floating button** shows it (reference: an M3 FAB, 56px rounded square, bottom right); the plain-page expand button goes. Onboarding: toasts under 10 words, only on a new device (no `stem-*` key in localStorage).

Mock: `design/mockups/fab.html` — `?f=1..5` button, `?i=1..5` icon pair, `?state=closed|open|drag|toast`, `?tile=q|a`, `?pad=0` (empty pad), `?idle=1` (3, dimmed).

| f | button | lens | drag | risk |
|---|---|---|---|---|
| 1 | M3 FAB | the reference: 56px, 16px corners, tonal `--raised`, pencil, dot = pad has text | anywhere, snaps to the left or right edge | covers a 56px square of content |
| 2 | M3 extended FAB | pencil + "Scratchpad" label (shrinks to 1 on scroll) | same as 1 | widest; covers the most |
| 3 | AssistiveTouch puck | iOS: translucent with a ring, dims to 45% after 3s idle | same as 1 | low contrast on `--paper`; reads as system UI |
| 4 | Edge tab | Slide Over grabber: 16x76 on the screen edge, 44x88 touch area | up and down the edge only | hard to find; a chevron says little |
| 5 | Pad-peek chip | the stage-2 pad peek as the button: pencil + the pad's last line | up and down, centred | covers the bottom centre (the Check arrow's row on short problems) |

| i | Question | Answer |
|---|---|---|
| 1 | document | pencil in a box |
| 2 | "?" speech bubble | check in a circle |
| 3 | text lines | radio list |
| 4 | magnifier | letter A |
| 5 | speech bubble with lines | checklist |

Onboarding copy (each once per new device, take-5f toast look): FAB first paint "Tap the pencil for your scratchpad." · first pad open "Switch question and answer view here." · after 2 opens with no drag "Drag the button anywhere."

**Pick: button 1 + pair 2.** The FAB is the pattern Tony pointed at, finds itself (contrast, size, the dot), and snaps to an edge so it never parks over a choice for long. Pair 2 reads without a label: "?" = the question, check = your answer. **Runner-up: button 5 + pair 3** (the chip tells you what is in the pad before you open it; lines | radios mirror what the tile shows).

Edge cases for ship: the button never rests over `#q` controls (snap nudges it off); hidden while an answer field has focus (keyboard up); a wrong answer in Question mode switches the tile to Answer before the toast; the dot follows the pad per problem; at 720px and up the button is gone and the pad is beside the problem; reduced motion = no snap animation; private mode = defaults, one toast per session.

Shots (390x844, DPR 2): `mt3-fab-{1..5}-{closed,drag,toast}-390.png`, `mt3-fab-3-idle-390.png`, `mt3-qa-{1..5}-{q,a}-390.png`, `mt3-toast-open-390.png`. Impeccable live on the mock, 8 states at 390: 0 (fixed: the mock strip's vertical padding).

## Round 3b (Oct 2 ~22:05 PT, Tony's picks)

- **Button: 2**, pen + "Scratchpad" (M3 extended FAB). Rounds 1/3/4/5 stay as history shots.
- **Toggle: lowercase q | a as text**, not icons. Faces tried (all already shipped, zero new bytes): `?q=1..7` = KaTeX_Math italic, KaTeX_Main, KaTeX_Main bold italic, KaTeX_Fraktur (the one wink), KaTeX_Typewriter, Atkinson Mono 700, Atkinson 700. **Pick: 1 KaTeX_Math italic** — it is how *q* and *a* already look in the problem text. Runner-up: 5 Typewriter. **Tony locked 1 (~22:50), 1.75rem, then 1.875rem, then back to the original 1.5rem (Oct 3 ~00:24).**
- Tony ~22:50: toast text layout was ugly (it wrapped mid-phrase at 16rem) → one line, centred, width up to the column; border 1px → 1.5px; the Scratchpad button's dot removed (it read as noise).
- **Toast: hybrid** = the shipped take-5f look (page `--paper`, 1px `--line`, `--shadow-1`, `--t-md` 400) + its 14px caret, on every toast: under its anchor (caret up), above it (`.up`, caret down: the onboarding note over the button), and on the MC row (`.side`: lies on the struck choice's text, caret points left at the X badge, so no live choice is covered).
- Onboarding copy: "Tap Scratchpad to open your pad." · "Switch question and answer view here." · "Drag the button anywhere."
- Impeccable live, 7 states at 390: 0, except the MC row state's "text covered by an opaque element" = the struck choice under the toast, on purpose (dead text; the app's take 5f does the same).
- Shots: `mt3b-qa-{1..7}-{q,a}-390.png`, `mt3b-toast-{fab,pill,mc}-390.png`, `mt3b-fab-2-closed-390.png`.

## Round 3c (Oct 3 ~00:20 PT): the gap under a short question

Tony: a short question leaves a big empty tile; kill the gap, dynamic by screen size, 5 variants beyond "hug". Mock `?short=1&g=0..6&state=open&q=1`:
0 today (⅓ tile) · 1 **hug** (Tony: tile = content, at most 45% of the screen) · 2 big type (the question grows to fill its tile, ≤ 2.25rem) · 3 both fit (question + answer in one tile when they fit in 45%, the pill hides; else falls back to 1) · 4 one-line strip (a question that fits one line becomes a 56px strip; tap to expand) · 5 in the header (the question sits in the pad's header row; no tile) · 6 notebook page (the question is the pad's first, read-only lines and scrolls away as you write).
**Pick: 4 when the question fits one line at this width, else 1** (both are content- and screen-sized; the pad gets the most room, nothing new to learn). Runner-up: 1 alone.
Shots: `mt3c-gap-{0..6}-{390,375}.png`.

Length test (Oct 3 ~00:30; `?len=1..4`: one line · a line + an equation · three lines · long + figure; pad height in px at 390×844 / 375×667):

| variant | 1 line | line + eq | 3 lines | long + fig | note |
|---|---|---|---|---|---|
| 0 today | 426 / 313 | 426 / 313 | 426 / 313 | 426 / 313 | the gap |
| 1 hug | 645 / 468 | 596 / 419 | 590 / 413 | 470 / 293 | long + figure on a small phone: 20px **less** than today (45% cap > ⅓) |
| 2 big type | 426 / 313 | same | same | same | gains nothing |
| 3 both fit | 357 / → 1 | → 1 | → 1 | → 1 | only a 1-line MC fits on a tall phone |
| 4 strip | 658 / 481 | 658 / 481 | → 1 | → 1 | strip only when the question fits one line, else hug |
| 5 header | 714 / 537 | 714 / 537 | cut off | cut off | long questions are lost behind "…" |
| 6 notebook | 714 / 537 | 714 / 537 | 714 / 537 | 714 / 537 | most room, but the question scrolls away while you write |

Pick stays **4, else 1**, with the hug cap made screen-dependent: at most ⅓ of the screen under 700px tall, 45% above, so a long question never costs pad room vs today.

## Round 3d (Oct 3 ~00:35 PT): no header row

Tony: the collapse button belongs to the pad, so it goes inside the pad box; the q | a switch moves into the answer view, or the tile bleeds into the page; a thin drag bar; no dead space; one-hand reach; 5 variants. Mock `design/mockups/pad3d.html?v=1..5&tile=q|a&len=1..4` (tile hugs its content, at most ⅓ of a short screen, 45% of a tall one). Every variant: collapse inside the pad's bottom-left, Cut / Copy bottom-right, a 3×32px bar with a 44px touch area.

| v | name | the switch | tile | pad px (q short / a / q long, 390×844) |
|---|---|---|---|---|
| 1 | corner kit | rides the tile's bottom-right corner | card | 620 / 478 / 506 |
| 2 | bleed + thumb row | in the pad's bottom row, next to collapse | bleeds into the page, a hairline divides | 668 / 526 / 554 |
| 3 | pad toolbar | left end of one tool row along the pad's bottom edge (collapse, Cut, Copy right) | card | 668 / 526 / 554 |
| 4 | the handle is the switch | one pill on the divider: tap q or a, drag it to resize | bleeds | 628 / 486 / 514 |
| 5 | swipe pages | none: swipe the tile sideways, or tap the q · a marks under it | bleeds | 628 / 486 / 514 |

**Tony picked 3 (~00:40), "consider my 3 points first" → shipped as 3 + bleed** (point 2: the question bleeds into the page, a hairline + the thin bar divide it from the pad; point 1: collapse in the pad's tool row; point 3: all in thumb reach). The tile hugs its content on every open (cap ⅓ under 700px tall, 45% above) until the handle is used. Strip-for-one-liners (3c 4) not built: hug already kills the gap (YAGNI).

alt's pick was 2. Every control is in the bottom thumb band, the tile costs no frame, the most pad room. Runner-up: 4 (one control does both jobs; the switch sits right where the eye crosses from question to pad). Impeccable live at 390, all five: 0.
Shots: `mt3d-{1..5}-{q2,a2,q4}-390.png`.

## The mock

`design/mockups/multitask.html` links `../../app.css` and `../../vendor/fonts/atkinson.css`. The dashed strip at the top is mock chrome: variant chips 1–11, a toggle for the simulated on-screen keys (a grey 300px block; its ⌄ key hides it without closing the pad) and a Back button that calls `history.back()`.

- `?v=N` opens variant N on the normal page; tap into the pad to open it.
- `?v=N&state=home|a|b|peek|full` shows a state statically for screenshots (defaults, not this browser's memory). `?v=4&state=hold` shows a held peek.
- `?v=tab` (tablet landscape), `?v=desk` (desktop, revised), `?v=desk&opt=1|2` (round 1 archive).

Screenshots (390×844, DPR 2, touch): `mt-N-a-390.png` (just opened: peek), `mt-N-b-390.png` (full), `mt-N-peek-390.png` and `mt-N-full-390.png` (on-screen keys up), `mt-4-hold-390.png`, `mt-home-390.png`; `mt-tab-land-1180.png` (1180×820); `mt-desk-r2-1440.png` (1440×900), `mt-desk-r2-1920.png` (1920×1080), `mt-desk-r2-full-1440.png`, `mt-desk-r2-800.png`, `mt-desk-r2-700.png`; round 1 `mt-desk-1|2-1440.png`.

## Not tested

- Chromium only (Playwright). No real iPhone or Android: the keyboard is simulated, so `visualViewport.offsetTop` and the iOS layout-viewport behaviour are reasoned from SWAP.md and FREEZE.md, not observed.
- Long-press on real iOS (variant 4) may still show the text callout or a haptic menu; needs a device.
- An interaction smoke test (scratchpad session only, not in `tests/`) checked: open by tapping the pad, collapse, Back closes without leaving the page, tapping the problem puts the caret in the answer, keys-down keeps it open, the split's drag and grip snaps, memory after reload, hold and release, PiP docking, the bubble's tap, the tablet sash snap. Round 2: the handle's tap cycles the anchors in 7–11 (9: ½ → ⅓ → sliver → ½), a drag up on 9 snaps one anchor, 11's strip tap goes back to the problem; desktop sash tap cycles ½ → ⅓ → strip → ⅔, a drag far left stashes to the strip, the strip and the pill bring it back. No page errors.
