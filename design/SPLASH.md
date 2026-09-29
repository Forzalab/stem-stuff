# Loading splash

Tony: "loading splash screen. no text just animation."

Mockup: `design/mockups/splash.html`. Frames in `design/shots/splash-mock-*` (regenerate with `node tools/splash_shots.mjs`), video `splash-mock.webm`.

## What it is

The favicon mark, 64 px, centred on `--paper`: the `--sheet` tile, the `--c1` curve that draws itself (stroke-dashoffset), the `--ink` dot that scales in as the curve finishes. It holds, erases in the direction it was drawn, and loops (2.2 s). Easing is ease-out-quart in, ease-in out; nothing bounces. No text anywhere, `aria-hidden="true"`.

## Where it lives

All inline in `index.html`: the CSS in the head, the markup and a small script at the top of the body. The stylesheet links sit *after* the splash and its script, on purpose: a stylesheet in the head holds back the first paint, in the body it only holds back what follows. So the splash paints before any CSS or JS file arrives (tested: `tests/splash.pw.mjs` delays `app.css` by 1.5 s and checks first-paint comes before it). The colors are copies of the app.css tokens because app.css isn't loaded yet. No new files, so nothing to add to sw.js `BASE` or `tools/bundle.py` (the bundler already inlines the stylesheets and leaves inline scripts alone).

## When it leaves

- `body[aria-busy="true"]` from the first line of the script until it leaves.
- Ready = `load` (stylesheets, KaTeX, the deferred scripts) + the three Atkinson faces loaded + `stemOffline.ready` (the saved bank restored from IndexedDB, design/RELOAD.md). A failed restore or font counts as done.
- At least 300 ms on screen, then a 200 ms opacity fade and removal.
- Hard cap 4 s from the script, whatever is still pending.
- `prefers-reduced-motion`: the static mark (no animation), and it goes without a fade.
- `pageshow` with `persisted` (bfcache): removed at once, no fade. There is no unload or beforeunload handler, so bfcache still works. A restored page normally has no splash left anyway.
- `noscript`: hidden.

It does not wait for the first problem to render (`#CODE` fetch): the entry box is usable underneath. Say so if you want that included.
