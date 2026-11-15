# Real-iPhone check (paste into the PR for any client CSS/JS change)

CI WebKit is not an iPhone: no real keyboard, URL bar or notch. Spend 3 minutes on a device. Floor = iOS 17 (works with fallbacks); iOS 18.2+ also gets `text-box-trim`; Safari 26+ gets `field-sizing`.

Device / iOS version: ____ . Build / preview URL: ____

- [ ] Keyboard: tap the answer box and the explain box. The page does not jump, the input stays visible above the keyboard, the nav does not ride up, dismissing restores the layout.
- [ ] Safe area: home indicator and notch/Dynamic Island do not cover the nav, toast or buttons (portrait and landscape). Also installed to the home screen, if the change touches the shell.
- [ ] URL bar collapse: scroll down and up; the bar collapsing/expanding causes no layout jump, no gap under the nav, no stuck 100vh height.
- [ ] iOS 17 floor (or Safari with fallbacks forced): text boxes still grow, text is not clipped, spacing is acceptable without `text-box-trim` / `field-sizing`.
- [ ] Toast and back-swipe: toast shows once and is tappable; edge-swipe back behaves.
- [ ] Anything else the PR touched: ____

Result: pass / fail (what, screenshot).

CI side: the `webkit` job in `.github/workflows/tests.yml` (PRs touching `client/**`, `index.html`, `sw.js`) runs the key specs on WebKit; `PW_BROWSER=webkit` and `PW_FORCE_FALLBACK=1` are read by `tests/pw-browser.mjs`.
