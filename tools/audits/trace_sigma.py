#!/usr/bin/env python3
"""Trace the reference Sigma (white on black) to a compact cubic-Bezier SVG path.

Steps: blur -> threshold -> largest component -> sub-pixel threshold contour ->
Schneider cubic fit (tol 0.6 px @ 500) -> straight runs emitted as lineTo ->
normalise to a tight-bbox viewBox (height 100) -> verify by rasterising
(IoU, max contour deviation) -> shots-sg/trace-overlay.png.

    python3 tools/audits/trace_sigma.py [ref.jpg] [out.png]

Exit 0 only if IoU >= 0.97 and max contour deviation <= 0.6 px. The reference
is the owner's local .brief-refs/sigma-ref.jpg (not committed); the overlay
goes to the uncommitted shots-sg/.
"""
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from skimage import measure

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, ".brief-refs", "sigma-ref.jpg")
OUT_OVERLAY = sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, "shots-sg", "trace-overlay.png")
TOL = 0.6          # px at the 500 px reference
BLUR = 1.0
THRESH = 128


# ---------------------------------------------------------------- vector bits
def vsub(a, b): return (a[0] - b[0], a[1] - b[1])
def vadd(a, b): return (a[0] + b[0], a[1] + b[1])
def vmul(a, s): return (a[0] * s, a[1] * s)
def vdot(a, b): return a[0] * b[0] + a[1] * b[1]
def vlen(a): return math.hypot(*a)
def vunit(a):
    n = vlen(a)
    return (a[0] / n, a[1] / n) if n else (0.0, 0.0)
def vdist(a, b): return vlen(vsub(a, b))


def bez_point(c, u):
    p = list(c)
    for _ in range(3):
        p = [(p[i][0] * (1 - u) + p[i + 1][0] * u, p[i][1] * (1 - u) + p[i + 1][1] * u) for i in range(len(p) - 1)]
    return p[0]


def chord_param(pts):
    u = [0.0]
    for i in range(1, len(pts)):
        u.append(u[-1] + max(vdist(pts[i - 1], pts[i]), 1e-9))
    total = u[-1] or 1.0
    return [x / total for x in u]


def generate_bezier(pts, u, t1, t2):
    # t1 points forward at the start; t2 points backward at the end (Schneider)
    p0, p3 = pts[0], pts[-1]
    c00 = c01 = c11 = x0 = x1 = 0.0
    for i, p in enumerate(pts):
        b = u[i]
        b0 = (1 - b) ** 3
        b1 = 3 * b * (1 - b) ** 2
        b2 = 3 * b * b * (1 - b)
        b3 = b ** 3
        c00 += vdot(t1, t1) * b1 * b1
        c01 += vdot(t1, t2) * b1 * b2
        c11 += vdot(t2, t2) * b2 * b2
        tmp = vsub(p, vadd(vmul(p0, b0 + b1), vmul(p3, b2 + b3)))
        x0 += vdot(t1, tmp) * b1
        x1 += vdot(t2, tmp) * b2
    det = c00 * c11 - c01 * c01
    if abs(det) > 1e-12:
        al = (x0 * c11 - x1 * c01) / det
        ar = (c00 * x1 - c01 * x0) / det
    else:
        al = ar = 0.0
    seg = vdist(p0, p3)
    eps = 1e-6 * seg
    if al < eps or ar < eps:
        al = ar = seg / 3.0
    return [p0, vadd(p0, vmul(t1, al)), vadd(p3, vmul(t2, ar)), p3]


def max_error(pts, bez, u):
    best, idx = -1.0, len(pts) // 2
    for i, p in enumerate(pts):
        d = vdist(p, bez_point(bez, u[i]))
        if d > best:
            best, idx = d, i
    return best, idx


def reparam(pts, u, bez):
    out = []
    e = 1e-6
    for i, p in enumerate(pts):
        q = bez_point(bez, u[i])
        qa = bez_point(bez, min(1.0, u[i] + e))
        qb = bez_point(bez, max(0.0, u[i] - e))
        d1 = vmul(vsub(qa, qb), 1.0 / (2 * e))
        d2 = vmul(vadd(vsub(qa, vmul(q, 2.0)), qb), 1.0 / (e * e))
        num = vsub(q, p)
        den = vdot(d1, d1) + vdot(num, d2)
        out.append(u[i] - (vdot(num, d1) / den if abs(den) > 1e-12 else 0.0))
    out[0], out[-1] = 0.0, 1.0
    for i in range(1, len(out)):
        out[i] = min(max(out[i], out[i - 1] + 1e-9), 1.0)
    return out


def straight(pts, t1, t2):
    d = vdist(pts[0], pts[-1]) / 3.0
    return [pts[0], vadd(pts[0], vmul(t1, d)), vadd(pts[-1], vmul(t2, d)), pts[-1]]


def fit_cubic(pts, u, t1, t2, tol, out):
    if len(pts) == 2:
        out.append(straight(pts, t1, t2))
        return
    bez = generate_bezier(pts, u, t1, t2)
    err, idx = max_error(pts, bez, u)
    if err < tol:
        out.append(bez)
        return
    if err < tol * 4.0:                      # iterationError: try reparameterising
        for _ in range(4):
            u = reparam(pts, u, bez)
            bez = generate_bezier(pts, u, t1, t2)
            err, idx = max_error(pts, bez, u)
            if err < tol:
                out.append(bez)
                return
    if idx <= 0 or idx >= len(pts) - 1:
        idx = len(pts) // 2
    if idx < 1 or idx > len(pts) - 2:
        out.append(straight(pts, t1, t2))
        return
    us = u[idx]
    if not (0.0 < us < 1.0):
        out.append(straight(pts, t1, t2))
        return
    tan = vunit(vsub(pts[min(len(pts) - 1, idx + 3)], pts[max(0, idx - 3)]))
    left, lu = pts[:idx + 1], [x / us for x in u[:idx + 1]]
    right, ru = pts[idx:], [(x - us) / (1 - us) for x in u[idx:]]
    fit_cubic(left, lu, t1, vmul(tan, -1), tol, out)
    fit_cubic(right, ru, tan, t2, tol, out)


def fit_closed(pts, tol):
    n = len(pts)
    i0 = min(range(n), key=lambda i: (pts[i][1], pts[i][0]))
    pts = pts[i0:] + pts[:i0]
    t = vunit(vsub(pts[3], pts[-3]))         # tangent through the seam
    loop = pts + [pts[0]]
    out = []
    fit_cubic(loop, chord_param(loop), t, vmul(t, -1), tol, out)
    return out


# ---------------------------------------------------------------- simplify
def cross_dev(c, a, b):
    """Max distance of a cubic's controls/curve from the chord a-b."""
    L = vdist(a, b)
    if L < 1e-9:
        return 0.0
    def d(p):
        return abs((b[0] - a[0]) * (a[1] - p[1]) - (a[0] - p[0]) * (b[1] - a[1])) / L
    m = max(d(c[1]), d(c[2]))
    for i in range(1, 20):
        m = max(m, d(bez_point(c, i / 20)))
    return m


def simplify(curves, eps):
    """Consecutive near-straight cubics on one heading -> one line run."""
    runs, run = [], [curves[0]]
    for c in curves[1:]:
        prev = run[-1]
        same_heading = vdot(vunit(vsub(prev[3], prev[0])), vunit(vsub(c[3], c[0]))) > 0.999
        straight = cross_dev(c, c[0], c[3]) < eps
        prev_straight = cross_dev(prev, prev[0], prev[3]) < eps
        if straight and prev_straight and same_heading:
            run.append(c)
        else:
            runs.append(run)
            run = [c]
    runs.append(run)
    return [(r, cross_dev([r[0][0], r[0][1], r[-1][2], r[-1][3]], r[0][0], r[-1][3]) < eps) for r in runs]


# ---------------------------------------------------------------- main
def main():
    img = Image.open(SRC).convert("L")
    assert img.size == (500, 500), img.size
    soft = img.filter(ImageFilter.GaussianBlur(BLUR))
    arr = np.asarray(soft).astype(np.float32)
    mask = arr > THRESH

    lab = measure.label(mask)
    counts = np.bincount(lab.ravel())
    counts[0] = 0
    mask = lab == counts.argmax()
    ys, xs = np.nonzero(mask)
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    W, H = x1 - x0 + 1, y1 - y0 + 1
    print(f"glyph bbox px: x {x0}..{x1}, y {y0}..{y1}  W={W} H={H}  W:H={W/H:.4f}:1")

    cont = max(measure.find_contours(arr, THRESH), key=len)   # sub-pixel threshold contour
    pts = [(float(c[1]), float(c[0])) for c in cont]          # (row, col) -> (x, y)
    if vdist(pts[0], pts[-1]) < 1e-6:
        pts = pts[:-1]
    clean = [pts[0]]
    for p in pts[1:]:
        if vdist(p, clean[-1]) > 1e-6:
            clean.append(p)
    pts = clean
    cxs = [p[0] for p in pts]; cys = [p[1] for p in pts]
    cx0, cx1, cy0, cy1 = min(cxs), max(cxs), min(cys), max(cys)
    CW, CH = cx1 - cx0, cy1 - cy0
    print(f"contour: {len(pts)} pts, bbox x {cx0:.2f}..{cx1:.2f}, y {cy0:.2f}..{cy1:.2f}  W:H={CW/CH:.4f}:1")

    curves = fit_closed(pts, TOL)
    print(f"cubic segments: {len(curves)}")

    # ---- measurements on the reference pixels
    def bar_thickness(cols, top):
        vals = []
        for x in cols:
            col = np.nonzero(mask[:, x])[0]
            runs = np.split(col, np.where(np.diff(col) > 1)[0] + 1)
            if not len(runs):
                continue
            r = runs[0] if top else runs[-1]
            if (r.min() == y0) if top else (r.max() == y1):
                vals.append(int(r.max() - r.min() + 1))
        return sum(vals) / len(vals)

    top = bar_thickness([x0 + int(W * f) for f in (0.50, 0.60, 0.70)], True)
    bot = bar_thickness([x0 + int(W * f) for f in (0.55, 0.65, 0.75)], False)
    yy = y0 + int(H * 0.21)
    row = np.nonzero(mask[yy])[0]
    runs = np.split(row, np.where(np.diff(row) > 1)[0] + 1)
    diag = max((int(r.max() - r.min() + 1) for r in runs), default=0)

    def span_mid(y):
        rr = np.nonzero(mask[y])[0]
        if not len(rr):
            return None
        groups = np.split(rr, np.where(np.diff(rr) > 1)[0] + 1)
        g = max(groups, key=len) if len(groups) > 1 else groups[0]
        return (g.min() + g.max()) / 2

    ya, yb = y0 + int(H * 0.18), y0 + int(H * 0.28)
    ca, cb = span_mid(ya), span_mid(yb)
    slope = abs(cb - ca) / abs(yb - ya)                      # dy/dx of the diagonal
    perp = diag * slope / math.sqrt(1 + slope * slope)       # horizontal cut -> perpendicular
    best = (0, -1)
    for y in range(y0 + int(H * 0.30), y0 + int(H * 0.70)):
        rr = np.nonzero(mask[y])[0]
        if len(rr) and rr.max() > best[1]:
            best = (y, int(rr.max()))
    print(f"top bar {top:.0f}px = {top/H*100:.2f}% H; bottom bar {bot:.0f}px = {bot/H*100:.2f}% H; "
          f"diagonal cut {diag}px -> perpendicular {perp:.1f}px = {perp/H*100:.2f}% H")
    print(f"inner vertex ({best[1]}, {best[0]})  x/W = {(best[1]-x0)/W:.4f}  y/H = {(best[0]-y0)/H:.4f}")

    # ---- straight runs -> lineTo
    s = 100.0 / CH
    nx = lambda p: ((p[0] - cx0) * s, (p[1] - cy0) * s)
    curves = [[nx(p) for p in c] for c in curves]
    NW = CW * s
    groups = simplify(curves, 0.10)        # 0.10 unit = 0.34 px @ 500
    p0 = groups[0][0][0][0]
    d = f"M{p0[0]:.1f} {p0[1]:.1f}"
    nseg = 0
    for run, is_line in groups:
        if is_line:
            d += f"L{run[-1][3][0]:.1f} {run[-1][3][1]:.1f}"
        else:
            for c in run:
                d += f"C{c[1][0]:.1f} {c[1][1]:.1f} {c[2][0]:.1f} {c[2][1]:.1f} {c[3][0]:.1f} {c[3][1]:.1f}"
                nseg += 1
    d += "Z"
    print(f"groups: {len(groups)} ({sum(1 for g in groups if g[1])} line runs, {nseg} cubics)   d length: {len(d)}")

    # ---- rasterise the emitted path (line runs + cubics) at 500 px and verify
    def dense(cs, n=64):
        return [bez_point(c, i / n) for c in cs for i in range(n + 1)]

    poly = []
    for run, is_line in groups:
        if is_line:
            a, b = run[0][0], run[-1][3]
            poly += [(a[0] + (b[0] - a[0]) * i / 32, a[1] + (b[1] - a[1]) * i / 32) for i in range(32)]
        else:
            poly += dense(run)
    poly_px = [(p[0] / s + cx0, p[1] / s + cy0) for p in poly]
    xsb = [p[0] for p in poly]; ysb = [p[1] for p in poly]
    print(f"curve bbox in viewBox units: x {min(xsb):.2f}..{max(xsb):.2f}, y {min(ysb):.2f}..{max(ysb):.2f}")
    SS = 8                                   # 8x supersample: 50% coverage = the threshold edge
    canvas = Image.new("L", (500 * SS, 500 * SS), 0)
    ImageDraw.Draw(canvas).polygon([(x * SS, y * SS) for x, y in poly_px], fill=255)
    canvas = canvas.resize((500, 500), Image.BOX)
    fitted = np.asarray(canvas).astype(np.float32) > 127.5
    inter = np.logical_and(mask, fitted).sum()
    union = np.logical_or(mask, fitted).sum()
    iou = inter / union

    def seg_dist(p, a, b):
        dx, dy = b[0] - a[0], b[1] - a[1]
        L = dx * dx + dy * dy
        t = 0.0 if L == 0 else max(0.0, min(1.0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L))
        return math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy))

    def poly_dist(p, pl):
        return min(seg_dist(p, pl[i], pl[i + 1]) for i in range(len(pl) - 1))

    ref = pts + [pts[0]]
    polyc = poly_px + [poly_px[0]]
    d_r2c = max(poly_dist(ref[i], polyc) for i in range(0, len(ref)))
    d_c2r = max(poly_dist(polyc[i], ref) for i in range(0, len(polyc), 2))
    dev = max(d_r2c, d_c2r)
    print(f"IoU {iou:.4f}   max contour deviation {dev:.3f}px (ref->fit {d_r2c:.3f}, fit->ref {d_c2r:.3f})")

    # ---- overlay: reference red, path green, overlap yellow
    o = np.zeros((500, 500, 3), np.uint8)
    o[mask & ~fitted] = (220, 40, 40)
    o[fitted & ~mask] = (40, 220, 90)
    o[mask & fitted] = (225, 205, 40)
    Image.fromarray(o).save(OUT_OVERLAY)
    print("overlay ->", OUT_OVERLAY)

    print("\nPATH_D=" + d)
    print("VIEWBOX=0 0 %.2f 100" % NW)
    return iou, dev


if __name__ == "__main__":
    iou, dev = main()
    if iou < 0.97 or dev > TOL:
        print(f"FAIL: IoU {iou:.4f} (need >= 0.97), dev {dev:.3f} (need <= {TOL})")
        sys.exit(1)
    print("PASS")
