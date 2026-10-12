import sys, json, numpy as np
from PIL import Image
D = sys.argv[1]
BGS = {"dark #0a1322": (10,19,34), "light #aedffe": (174,223,254), "HUD well #0d0903": (13,9,3), "reel #ffffff": (255,255,255)}
def lin(c):
    c = np.asarray(c, float) / 255
    return np.where(c <= .04045, c / 12.92, ((c + .055) / 1.055) ** 2.4)
def relL(rgb): r, g, b = lin(rgb).T; return .2126 * r + .7152 * g + .0722 * b
def cr(a, b): la, lb = relL(np.array([a]))[0], relL(np.array([b]))[0]; hi, lo = max(la, lb), min(la, lb); return (hi + .05) / (lo + .05)
def luma(rgb): return rgb[..., 0] * .299 + rgb[..., 1] * .587 + rgb[..., 2] * .114
def load(k, s):
    a = np.asarray(Image.open(f"{D}/{k}-{s}.png").convert("RGBA"), float); return a[..., :3], a[..., 3] / 255
out = {}
for k in ["duck", "duck24", "traced", "fluent", "star", "gem", "fire", "glow", "cherries"]:
    for s in [24, 48, 60]:
        rgb, al = load(k, s); h, w = al.shape
        m = al > .9
        if k.startswith("duck"): cx, cy, R = 80 / 160 * w, 78 / 160 * h, 74 / 160 * w
        else:
            ys, xs = np.nonzero(m); cx, cy = (xs.min() + xs.max() + 1) / 2, (ys.min() + ys.max() + 1) / 2; R = max(xs.max() - xs.min() + 1, ys.max() - ys.min() + 1) / 2
        yy, xx = np.mgrid[0:h, 0:w] + .5; d = np.hypot(xx - cx, yy - cy)
        disc = m & (d <= R); ring = m & (d > .8 * R) & (d <= R)
        L = luma(rgb)
        row = {"mean_luma": round(float(L[disc].mean()), 1)}
        if k in ("duck", "duck24", "traced", "fluent"):
            dl = L[disc]; dark = np.percentile(dl, 3); med = np.median(dl)
            row["feature_dL"] = round(float(med - dark), 1)     # eyes/beak (or glyph) vs face
            ringc = rgb[ring].mean(0); discc = rgb[disc].mean(0)
            # darkest edge: the 25% darkest ring pixels (the edge shade that outlines the coin)
            rl = L[ring]; dk = rgb[ring][rl <= np.percentile(rl, 25)].mean(0)
            row["contrast"] = {b: {"disc": round(cr(discc, c), 2), "edge_dark25": round(cr(dk, c), 2), "best": round(max(cr(discc, c), cr(dk, c)), 2)} for b, c in BGS.items()}
        out[f"{k}@{s}"] = row
json.dump(out, open(f"{D}/checks.json", "w"), indent=1)
for k, v in out.items():
    if "contrast" in v: print(k, v["mean_luma"], "dL", v["feature_dL"], {b: v["contrast"][b]["best"] for b in v["contrast"]})
print("greyscale mean luma @48:", {k.split("@")[0]: v["mean_luma"] for k, v in out.items() if k.endswith("@48")})
print("greyscale mean luma @24:", {k.split("@")[0]: v["mean_luma"] for k, v in out.items() if k.endswith("@24")})
