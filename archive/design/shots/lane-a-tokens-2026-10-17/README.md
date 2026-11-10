# Lane (a) shots: unified v5 palette, V1 thin-light rows, green Next

393x852, DPR 2. `before-*` = main @1bfc36f, `after-*` = this branch. Every state also as `*-grey.png` (greyscale gate, STYLE.md §7 item 16).

- Chromium (Playwright, reduced motion, mocked /check): `{before,after}-{diet,sugar}-{mc-rest,mc-selected,mc-wrong1,mc-right,mc-out,pills-right,all-wrong1,num-wrong1,num-right}`.
- WebKitGTK (`ios-sim.py --profile safari-expanded`, local CALC1_X2P): `webkit-{before,after}-1` = the 2nd row picked and checked (real local grading), `-2` = rest. Greys are desaturated PNGs.
- HUD + bursts (sugar, no reduced motion): `{before,after}-sugar-hud-right`, `{before,after}-burst-{levelup,win,bonus,legend}` (FX.burst at its title beat).

Greyscale read: right = bright 1px ring + check, wrong = mid ring + x + struck muted text, the stem and choice text stay the brightest areas; no state relies on hue alone.
Note: the diet frames show an empty stem strip on the card. The same is true on main (the shot fixture's text block does not render in diet); it is not this lane.
