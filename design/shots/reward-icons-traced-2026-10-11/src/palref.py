"""Cross-check: median blue and gold straight from the ref JPGs (V > 0.45 keeps the dark navy background out).
usage: python3 palref.py REF.jpg [...]"""
import colorsys, sys
import numpy as np
from PIL import Image
for f in sys.argv[1:]:
    px = np.array(Image.open(f).convert("RGB").resize((320, 320))).reshape(-1, 3).astype(float) / 255
    hsv = np.array([colorsys.rgb_to_hsv(*p) for p in px]); h = hsv[:, 0] * 360
    res = []
    for name, lo, hi in (("blue", 200, 235), ("gold", 36, 58)):
        m = (h >= lo) & (h <= hi) & (hsv[:, 1] > .25) & (hsv[:, 2] > .45)
        sel = px[m]; L = sel @ np.array([.2126, .7152, .0722]); o = np.argsort(L)
        q = lambda t: "#%02X%02X%02X" % tuple(int(round(x * 255)) for x in sel[o[int(t * (len(o) - 1))]])
        res.append(f"{name}: p10 {q(.1)} p50 {q(.5)} p90 {q(.9)} (n={m.sum()})")
    print(f.split("/")[-1], " | ".join(res))
