# Bounce at the end of a scroll (research and mock, nothing in the app yet)

Owner: Tony picks. Ask (Oct 3 ~02:15 PT): a bounce up / down when the question-answer box or the scratchpad is scrolled to its top or bottom. Inspo: Apple rubber-band, Android stretch.
Scope: research and a mock only. `app.js` and `app.css` are untouched. Mock: [mockups/bounce.html](mockups/bounce.html) (`?v=1` native, `?v=2` rubber-band, `?v=3` bump). Shots: `shots/bounce-v{1,2,3}-390.png`.
Each source below was fetched. A line marked *unverified* is general knowledge, not read on a page; test it on a real phone before building.

## Scroll containers in play (main)
`html.mt #problem`, `html.mt #q` (both `overscroll-behavior: contain`), `.freeze-in` (the strip), the pad textarea, the `#fb` box.

## 1. What the platforms do today
| | `auto` | `contain` | `none` |
|---|---|---|---|
| meaning | chains to the page, default effects | no chaining, the box keeps its own effect | no chaining, no effect |

Source: <https://developer.mozilla.org/en-US/docs/Web/CSS/overscroll-behavior>, <https://developer.chrome.com/blog/overscroll-behavior> (`contain` keeps the Android glow or the iOS rubber-band; `none` removes it).
- Safari (macOS and iOS) supports the property from 16.0, Chrome from 65, Firefox from 59: <https://caniuse.com/css-overscroll-behavior>. Older iOS ignores `contain`, so it chains.
- iOS Safari inner `overflow: auto` box: rubber-bands at its edge by default (*unverified*, no WebKit page read). With `contain` the box should still bounce and the page should not move (*unverified* in Safari).
- Android 12+ replaces the glow with a stretch that "stretches and bounces back": <https://developer.android.com/develop/ui/views/touch-and-input/gestures/scroll>. Whether Chrome draws it on web inner boxes is *unverified*.
- So `contain` on `#q` / `#problem` already gives the native bounce on iOS 16+ and (probably) Android 12+. It gives none on desktop Chrome / Windows.

## 2. The physics
- Apple rubber-band: `f(x, d, c) = x·d·c / (d + c·x)`, x = finger distance past the edge, d = the box's size, c = 0.55. Always below d. Source: <https://holko.pl/2014/07/06/inertia-bouncing-rubber-banding-uikit-dynamics/>.
- Release: the same page reproduces the bounce with a spring of length 0, damping 1, frequency 2 (found by trial and error by its author, not published by Apple). Equivalent tween used in the mock: 520 ms, `cubic-bezier(0.22, 1, 0.36, 1)`, no overshoot (*our choice, unverified against UIKit*).
- Android stretch: `getDistance()` / `onPullDistance()` since API 31, pull normalised by the view height: same Android page. Duration and easing are not published there (*unverified*).

## 3. Web techniques
| technique | feel | cost | risk | platforms |
|---|---|---|---|---|
| (a) CSS only: keep `contain` | native, exactly the platform's | none | none, but no bounce on desktop Chrome / old iOS; dropping `contain` for more bounce chains to the page and pull-to-refresh | iOS 16+, Android |
| (b) JS rubber-band, finger follows (v2) | Apple-like, direct manipulation | one `touchmove` handler per box, transform only | needs a non-passive `touchmove`; must stand aside for textarea selection and caret, the sash and horizontal edge swipes; doubles the native bounce on iOS unless `overscroll-behavior: none` | all touch |
| (c) one-shot bump after a fling or wheel at the edge (v3) | a nudge, not tied to the finger | one animation, no `preventDefault` | cooldown needed; `scrollend` does not fire when the position does not change, so detect with `scroll` / `wheel`: <https://developer.mozilla.org/en-US/docs/Web/API/Element/scrollend_event> | all, incl. desktop |

Conflicts, all handled in the mock: the pad skips (b) while text is selected; (b) acts on vertical drags only; `contain` stays on `#q` so the page, pull-to-refresh and Back never see the drag; nothing touches focus, so "keyboard-down never closes" is untouched.

## 4. Accessibility
- `prefers-reduced-motion: reduce` = no bounce at all (MDN says to drop panning and scaling for vestibular safety: <https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion>). The mock checks it at load and on change; verified in Chromium: transform stays `none` mid-drag.
- Transform only, no layout shift. No `aria-live`, no DOM change, focus order untouched. Screen-reader scroll actions are not touch events, so the handler never runs (*unverified*).
- Peak stays small: about 52 px at a long drag (damped), 24 px for a bump.

## 5. Desktop
macOS trackpads already bounce in Safari and Chrome (*unverified*); Chrome on Windows and Linux does not. Recommendation: skip. Gate any JS on `(pointer: coarse)`. STYLE.md has no desktop-only motion either.

## STYLE.md audit
- §1.5 Nothing jumps: transform only, layout never moves. Pass.
- §1.6 Motion answers a tap; direct manipulation is not animation. (b) follows the finger: pass. (c) plays with no finger on it: borderline, a response to the person's scroll but still ambient.
- §1.2 Calm: peak is small and there is no overshoot. Pass.
- §1.8 Improve by removing: (a) adds nothing. A bounce nobody asked for twice is cost.
- Tokens: the mock uses only `app.css` tokens. Impeccable (`detect`, static and live at 390x844 and 1920x1080, v1 to v3): 0 findings in every run, before and after (no earlier count, new file).

## Pick and runner-up
- **Pick: (b) v2 rubber-band on the question-answer box only**, touch only (`pointer: coarse`), reduced motion off, `overscroll-behavior: none` on the box while it is on so iOS does not bounce twice. The pad textarea keeps the native effect: a custom drag fights its caret and selection handles.
- **Runner-up: (a) v1, `contain` as it is** (zero risk; may already be what Tony saw on iOS but not on Android Chrome or desktop). Third: (c) v3 bump, only if (b) janks.
- Before building: on a real phone, check whether `#q` already bounces natively on Tony's device. If it does, the feature is a no-op there and (a) is the answer.
