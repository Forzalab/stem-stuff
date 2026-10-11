"""Trace an isolated transparent PNG part to a flat colour SVG on a square viewBox.
usage: python3 trace.py SRC.png OUT.svg [--px 128] [--k 10] [--speckle 6] [--layer 24] [--corner 60] [--pad 0.04] [--glow]"""
import argparse, io, re, sys
import numpy as np
from PIL import Image
import vtracer

ap = argparse.ArgumentParser()
ap.add_argument("src"); ap.add_argument("out")
ap.add_argument("--px", type=int, default=128)      # working raster size (detail level)
ap.add_argument("--k", type=int, default=10)        # palette size after quantising
ap.add_argument("--speckle", type=int, default=6)
ap.add_argument("--layer", type=int, default=24)
ap.add_argument("--cprec", type=int, default=6)
ap.add_argument("--corner", type=int, default=60)
ap.add_argument("--length", type=float, default=4.0)
ap.add_argument("--splice", type=int, default=45)
ap.add_argument("--pad", type=float, default=0.04)
ap.add_argument("--blur", type=float, default=0.0)
ap.add_argument("--sat", type=float, default=1.0)
ap.add_argument("--glow", default="")               # extra vector glow behind: colour hex
ap.add_argument("--debug", default="")
a = ap.parse_args()

im = Image.open(a.src).convert("RGBA")
al = np.array(im)[:, :, 3]
ys, xs = np.where(al > 24)
im = im.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
w, h = im.size
side = int(round(max(w, h) / (1 - 2 * a.pad)))
sq = Image.new("RGBA", (side, side), (0, 0, 0, 0))
sq.paste(im, ((side - w) // 2, (side - h) // 2))
sm = sq.resize((a.px, a.px), Image.LANCZOS)
if a.blur:
    from PIL import ImageFilter
    sm = sm.filter(ImageFilter.GaussianBlur(a.blur))
if a.sat != 1.0:
    from PIL import ImageEnhance
    rgb = ImageEnhance.Color(sm.convert("RGB")).enhance(a.sat)
    sm = Image.merge("RGBA", (*rgb.split(), sm.split()[3]))
arr = np.array(sm)
mask = arr[:, :, 3] >= 128
# quantise opaque pixels to k colours (merges near-identical shades -> few layers)
rgb = Image.fromarray(arr[:, :, :3])
q = rgb.quantize(colors=a.k, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert("RGB")
qa = np.array(q)
out = np.zeros_like(arr)
out[:, :, :3] = qa
out[:, :, 3] = np.where(mask, 255, 0)
qim = Image.fromarray(out, "RGBA")
if a.debug:
    qim.resize((512, 512), Image.NEAREST).save(a.debug)
buf = io.BytesIO(); qim.save(buf, "PNG")
svg = vtracer.convert_raw_image_to_svg(buf.getvalue(), img_format="png", colormode="color", hierarchical="stacked",
                                       mode="spline", filter_speckle=a.speckle, color_precision=a.cprec,
                                       layer_difference=a.layer, corner_threshold=a.corner, length_threshold=a.length,
                                       max_iterations=10, splice_threshold=a.splice, path_precision=1)
# collect paths -> one clean svg
paths = re.findall(r'<path d="([^"]+)" fill="([^"]+)" transform="translate\(([-\d.]+),([-\d.]+)\)"\s*/>', svg)
if not paths:
    sys.exit("no paths parsed:\n" + svg[:500])
S = 32.0 / a.px
def fmt(v):
    s = ("%.2f" % v).rstrip("0").rstrip(".")
    return "0" if s in ("-0", "") else s
body = []
for d, fill, tx, ty in paths:
    tx, ty = float(tx), float(ty)
    toks = re.findall(r"[MLCQZz]|-?\d+(?:\.\d+)?", d)
    o, xy = [], 0
    for t in toks:
        if t.isalpha():
            o.append(t); xy = 0
        else:
            v = float(t) + (tx if xy % 2 == 0 else ty)
            o.append(fmt(v * S)); xy += 1
    dd = re.sub(r" ?([MLCQZ]) ?", r"\1", " ".join(o))
    body.append('<path fill="%s" d="%s"/>' % (fill.upper(), dd))
glow = ""
if a.glow:
    glow = ('<defs><radialGradient id="g"><stop offset=".35" stop-color="%s" stop-opacity=".85"/>'
            '<stop offset="1" stop-color="%s" stop-opacity="0"/></radialGradient></defs><circle cx="16" cy="16" r="16" fill="url(#g)"/>' % (a.glow, a.glow))
res = '<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">' + glow + "".join(body) + "</svg>\n"
open(a.out, "w").write(res)
print(a.out, len(res), "bytes", len(body), "paths")
