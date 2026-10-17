# Lane (b) shots: type stack + ladder (TYPE-DECISION v3.1), q | a letters UI 20/600

393x852, DPR 2. `before-*` = lane (a) (this PR stacks on it), `after-*` = this branch. Every frame also as `*-grey.png` (greyscale gate).

- Chromium (Playwright, mocked /check): `{before,after}-{diet,sugar}-{mc-rest,mc-selected,mc-wrong1,mc-right,mc-out,pills-right,all-wrong1,num-wrong1,num-right}`. Chromium takes the Atkinson branch: 17px body, 600 renders as Atkinson 700, KaTeX at 1.15em.
- WebKitGTK (`ios-sim.py --profile safari-expanded`): `webkit-{before,after}-{mc-rest,start}` on local CALC1_X2P and the start page. WebKit takes the `@supports (font: -apple-system-body)` branch (in the sim, -apple-system maps to Inter via ios-fonts.conf; a real iPhone shows SF). Greys are desaturated PNGs.

Greyscale read: no colour changed in this lane; the stem and choices stay the brightest text.
