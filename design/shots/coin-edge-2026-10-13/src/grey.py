# usage: python3 -I grey.py CHECKDIR : Rec.601 mean luma over the whole disc and over its inside (rim edge excluded, d <= R - 1.5 px), per coin and size
import sys, numpy as np
from PIL import Image
D = sys.argv[1]; out = {}
for k in ["duck", "duck24", "traced", "fluent", "star", "glow"]:
    for s in [24, 48]:
        a = np.asarray(Image.open(f"{D}/{k}-{s}.png").convert("RGBA"), float); rgb, al = a[..., :3], a[..., 3] / 255; h, w = al.shape; m = al > .9
        if k.startswith("duck"): cx, cy, R = 80 / 160 * w, 78 / 160 * h, 74 / 160 * w
        else: ys, xs = np.nonzero(m); cx, cy = (xs.min() + xs.max() + 1) / 2, (ys.min() + ys.max() + 1) / 2; R = max(xs.max() - xs.min() + 1, ys.max() - ys.min() + 1) / 2
        yy, xx = np.mgrid[0:h, 0:w] + .5; d = np.hypot(xx - cx, yy - cy); L = rgb @ np.array([.299, .587, .114])
        out[f"{k}@{s}"] = (round(float(L[m & (d <= R)].mean()), 1), round(float(L[m & (d <= R - 1.5)].mean()), 1))
for k, v in out.items(): print(k, "whole", v[0], "inside", v[1])
