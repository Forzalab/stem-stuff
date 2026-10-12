import sys, numpy as np
from PIL import Image
sys.path.insert(0, sys.argv[2]); from checks_lib import cr, luma
D = sys.argv[1]
for k in ["duck", "duck24", "traced", "fluent"]:
    for s in [24, 48, 60]:
        a = np.asarray(Image.open(f"{D}/{k}-{s}.png").convert("RGBA"), float); rgb, al = a[..., :3], a[..., 3] / 255; h, w = al.shape
        m = al > .9
        if k.startswith("duck"): cx, cy, R = 80 / 160 * w, 78 / 160 * h, 74 / 160 * w
        else:
            ys, xs = np.nonzero(m); cx, cy = (xs.min() + xs.max() + 1) / 2, (ys.min() + ys.max() + 1) / 2; R = max(xs.max() - xs.min() + 1, ys.max() - ys.min() + 1) / 2
        yy, xx = np.mgrid[0:h, 0:w] + .5; d = np.hypot(xx - cx, yy - cy)
        band = m & (d > .9 * R) & (d <= R); L = luma(rgb[band]); c = np.median(rgb[band][L <= np.percentile(L, 50)], 0)
        print(k, s, "outer band (0.9R..R, darker half median)", c.round(), {b: round(cr(c, v), 2) for b, v in {"white": (255,255,255), "sky": (174,223,254), "dark": (10,19,34)}.items()})
