"""Sample the gift's blue and gold ramps from the isolated ref parts. Prints JSON {blue: [...5 hex], gold: [...5 hex]} (dark -> highlight).
usage: python3 pal.py PARTS_DIR"""
import colorsys, json, sys
import numpy as np
from PIL import Image
P = sys.argv[1]
SRC = {"blue": ["01-closed-gift-box.png", "02-open-lid-yellow-bow.png", "02-striped-box-base.png"],
       "gold": ["01-closed-gift-box.png", "02-open-lid-yellow-bow.png", "03-confetti.png"]}
HUE = {"blue": (200, 235), "gold": (36, 58)}
out, stats = {}, {}
for fam, files in SRC.items():
    px = []
    for f in files:
        a = np.array(Image.open(f"{P}/{f}").convert("RGBA").resize((256, 256))).reshape(-1, 4)
        px.append(a[a[:, 3] > 200][:, :3])
    px = np.concatenate(px).astype(float) / 255
    hsv = np.array([colorsys.rgb_to_hsv(*p) for p in px])
    h = hsv[:, 0] * 360
    lo, hi = HUE[fam]
    m = (h >= lo) & (h <= hi) & (hsv[:, 1] > 0.25) & (hsv[:, 2] > 0.25)
    sel = px[m]; v = sel @ np.array([.2126, .7152, .0722])          # sort by luminance
    order = np.argsort(v)
    ramp = []
    for q in (0.04, 0.25, 0.5, 0.78, 0.97):
        i = order[int(q * (len(order) - 1))]
        lo_i, hi_i = max(0, int((q - .03) * len(order))), min(len(order), int((q + .03) * len(order)) + 1)
        c = sel[order[lo_i:hi_i]].mean(0)                         # average a small band around the percentile
        ramp.append("#%02X%02X%02X" % tuple(int(round(x * 255)) for x in c))
    out[fam] = ramp
    stats[fam] = int(m.sum())
print(json.dumps(out))
print(json.dumps(stats), file=sys.stderr)
