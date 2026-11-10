# usage: python3 -I audit.py AUDITDIR LIBDIR : the 3:1 table (best of disc mean / thin edge vs the background), DPR 1 (worst) and 2
import sys, json, numpy as np
from PIL import Image
sys.path.insert(0, sys.argv[2]); from checks_lib import cr
D = sys.argv[1]; M = json.load(open(f"{D}/meta.json"))
def rgb(h): h = h.lstrip("#"); return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))
out = []
for m in M:
    row = dict(m)
    for dpr in (1, 2):
        s = np.asarray(Image.open(f"{D}/s{m['k']}-{m['ver']}-{dpr}x.png").convert("RGB"), float)
        h, w, _ = s.shape; pad = m["pad"] * dpr; sz = m["sz"] * dpr
        cx, cy, R = pad + 80 / 160 * sz, pad + 78 / 160 * sz, 74 / 160 * sz
        yy, xx = np.mgrid[0:h, 0:w] + .5; d = np.hypot(xx - cx, yy - cy)
        bg = rgb(m["bg"])
        disc = s[d <= R - 1.5 * dpr].mean(0)
        # the edge as the eye meets it: along 360 rays, the darkest pixel within 2 px of the rim (inside or out); median over the rays
        Lum = s @ np.array([.299, .587, .114]); cols = []
        for a in np.linspace(0, 2 * np.pi, 360, endpoint=False):
            rs = np.arange(R - 2 * dpr, R + 2 * dpr, .25)
            px = np.clip((cx + rs * np.cos(a)).astype(int), 0, w - 1); py = np.clip((cy + rs * np.sin(a)).astype(int), 0, h - 1)
            j = np.argmin(Lum[py, px]); cols.append(s[py[j], px[j]])
        cols = np.array(cols); edge = np.median(cols, 0)
        row[f"disc{dpr}"], row[f"edge{dpr}"] = round(cr(disc, bg), 2), round(cr(edge, bg), 2)
        row[f"best{dpr}"] = max(row[f"disc{dpr}"], row[f"edge{dpr}"])
    out.append(row)
json.dump(out, open(f"{D}/table.json", "w"), indent=1)
for r in out:
    print(f"{r['label'][:52]:52s} {r['ver']:3s} {r['icon']:6s} {r['sz']:3d}px {r['bg']} o={r['op']:<4} disc {r['disc1']:5.2f} edge {r['edge1']:5.2f} best1x {r['best1']:5.2f} best2x {r['best2']:5.2f}")
