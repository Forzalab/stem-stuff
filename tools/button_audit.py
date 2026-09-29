"""Measure every button from pixels (Pillow) and check they match: one button system.

    python3 serve.py 8812 &
    python3 tools/button_audit.py [http://localhost:8812] [outdir]

Runs tools/button_audit.mjs (Playwright) for screenshots + boxes, then from the PNG pixels only:
  size    bounding box of pixels that differ from the page around the button
  radius  from the empty gap along the top-left diagonal: r = gap / (1 - 1/sqrt 2)
  border  colour and width (run of border-coloured pixels on the left edge, mid-height)
  fill    colour just inside the border
  icon    ink bbox, colour, stroke width (coverage summed across single strokes, median)
Exit 1 if size, radius, border width or stroke differ by more than 1px, or a variant's colours differ.
"""
import json, math, os, statistics, subprocess, sys
from PIL import Image

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8812"
OUT = sys.argv[2] if len(sys.argv) > 2 else "design/shots/buttons"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

subprocess.run(["node", os.path.join(ROOT, "tools/button_audit.mjs"), BASE, OUT], check=True, cwd=ROOT)
rows = json.load(open(os.path.join(ROOT, OUT, "boxes.json")))

dist = lambda a, b: max(abs(a[i] - b[i]) for i in range(3))
hexc = lambda c: "#%02x%02x%02x" % c[:3]


def measure(img, r):
    px = img.load()
    W, H = img.size
    x0, y0, w, h = round(r["x"]), round(r["y"]), round(r["w"]), round(r["h"])
    # page colour right outside the top-left corner (a field or the sheet)
    mid_y, mid_x = y0 + h // 2, x0 + w // 2

    def edge(x, y, dx, dy):
        """walk inward from 1px outside the DOM box while pixels look like the outside"""
        out = px[x, y][:3]
        while dist(px[x, y][:3], out) <= 12 and abs(x - mid_x) + abs(y - mid_y) > 2:
            x += dx; y += dy
        return x if dx else y

    # a side that walks more than 4px in has merged with a same-coloured neighbour (the arrow flush inside a
    # selected MC choice shares its c1 border on three sides): use the DOM edge there and report it
    sides = dict(left=(edge(x0 - 1, mid_y, 1, 0), x0), right=(edge(x0 + w, mid_y, -1, 0), x0 + w - 1),
                 top=(edge(mid_x, y0 - 1, 0, 1), y0), bot=(edge(mid_x, y0 + h, 0, -1), y0 + h - 1))
    merged = [k for k, (got, dom) in sides.items() if abs(got - dom) > 4]
    left, right, top, bot = (sides[k][1] if k in merged else sides[k][0] for k in ("left", "right", "top", "bot"))
    flush = len(merged)
    bg = px[left, top][:3]               # the corner pixel of a rounded box is outside the shape
    if "left" in merged or "top" in merged: bg = None
    size = (right - left + 1, bot - top + 1)
    border = px[left, mid_y][:3]
    bw = 0
    while dist(px[left + bw, mid_y][:3], border) <= 16 and bw < 10:
        bw += 1
    if bw >= 10: bw = None                # filled button: border = fill, width not visible
    fill = px[left + (bw or 0) + 3, top + (bw or 0) + 3][:3]
    # radius: coverage-weighted gap along the diagonal from the outer corner
    # first half-covered pixel on the diagonal (sub-pixel), measured from the corner point
    gap, prev = 0.0, 0.0
    span = dist(border, bg) or 1 if bg else 1
    for k in (range(0, 24) if bg else ()):
        cov = min(1.0, dist(px[left + k, top + k][:3], bg) / span)
        if cov >= 0.5:
            gap = k - 1 + (0.5 - prev) / ((cov - prev) or 1) + 0.5
            break
        prev = cov
    radius = gap * math.sqrt(2) / (math.sqrt(2) - 1)   # diagonal gap = r(sqrt2 - 1)
    # icon: pixels inside the inner area that differ from the fill
    b2 = bw or 2
    ix0, iy0, ix1, iy1 = left + b2 + 4, top + b2 + 4, right - b2 - 4, bot - b2 - 4
    ink = [(x, y) for y in range(iy0, iy1 + 1) for x in range(ix0, ix1 + 1) if dist(px[x, y][:3], fill) > 40]
    if not ink:
        return dict(size=size, radius=radius, border=border, bw=bw, fill=fill, icon=None, flush=flush)
    ib = (min(p[0] for p in ink), min(p[1] for p in ink), max(p[0] for p in ink), max(p[1] for p in ink))
    far = max((px[x, y][:3] for x, y in ink), key=lambda c: dist(c, fill))
    ispan = dist(far, fill) or 1
    cov = lambda x, y: min(1.0, dist(px[x, y][:3], fill) / ispan)
    runs = []
    for y in range(ib[1], ib[3] + 1):          # horizontal scanlines
        s = 0.0
        for x in range(ib[0] - 1, ib[2] + 2):
            c = cov(x, y)
            if c > 0.5: s += c
            elif s: runs.append(s); s = 0.0
        if s: runs.append(s)
    for x in range(ib[0], ib[2] + 1):          # vertical scanlines
        s = 0.0
        for y in range(ib[1] - 1, ib[3] + 2):
            c = cov(x, y)
            if c > 0.5: s += c
            elif s: runs.append(s); s = 0.0
        if s: runs.append(s)
    runs = sorted(r for r in runs if r > 0.6)
    stroke = runs[len(runs) // 4] if runs else 0   # 25th percentile: perpendicular crossings of a single stroke
    return dict(size=size, radius=radius, border=border, bw=bw, fill=fill,
                flush=flush, icon=dict(ink=(ib[2] - ib[0] + 1, ib[3] - ib[1] + 1), color=far, stroke=stroke))


results = []
imgs = {}
for r in rows:
    img = imgs.setdefault(r["shot"], Image.open(os.path.join(ROOT, r["shot"])).convert("RGB"))
    m = measure(img, r)
    variant = "go" if m["fill"][2] > 200 and m["fill"][0] > 100 else "plain"
    results.append((r, m, variant))

hdr = f'{"button":16} {"var":5} {"size":7} {"radius":6} {"bord":4} {"border":8} {"fill":8} {"svg":5} {"css r":5} {"ink":6} {"stroke":6} {"icon col":8}'
print(hdr); print("-" * len(hdr))
for r, m, v in results:
    i = m["icon"] or {}
    note = f' flush{m["flush"]}' if m["flush"] else " current" if r.get("current") else ""
    print(f'{r["name"] + note:16} {v:5} {m["size"][0]}x{m["size"][1]:<4} {m["radius"]:6.1f} {"-" if m["bw"] is None else m["bw"]:>4} {hexc(m["border"]):8} {hexc(m["fill"]):8} '
          f'{int(r["icon_w"] or 0):5} {r["css_radius"]:5} {"%dx%d" % i["ink"] if i else "-":6} {i.get("stroke", 0):6.2f} {hexc(i["color"]) if i else "-":8}')

bad = []
ref = results[0][1]
for r, m, v in results:
    if abs(m["size"][0] - 48) > 1 or abs(m["size"][1] - 48) > 1: bad.append(f'{r["name"]}: size {m["size"]}')
    if not m["flush"] and abs(m["radius"] - ref["radius"]) > 1: bad.append(f'{r["name"]}: radius {m["radius"]:.1f} vs {ref["radius"]:.1f}')
    if m["bw"] is not None and abs(m["bw"] - ref["bw"]) > 1: bad.append(f'{r["name"]}: border width {m["bw"]}')
    if r["icon_w"] and abs(r["icon_w"] - 24) > 1: bad.append(f'{r["name"]}: icon box {r["icon_w"]}')
    if m["icon"] and abs(m["icon"]["stroke"] - 2) > 1: bad.append(f'{r["name"]}: stroke {m["icon"]["stroke"]:.2f}')
for v in ("go", "plain"):
    group = [(r, m) for r, m, vv in results if vv == v and not r.get("current")]
    for r, m in group[1:]:
        r0, m0 = group[0]
        for k in ("border", "fill"):
            if dist(m[k], m0[k]) > 3: bad.append(f'{r["name"]}: {k} {hexc(m[k])} vs {hexc(m0[k])} ({r0["name"]})')
        if m["icon"] and m0["icon"] and dist(m["icon"]["color"], m0["icon"]["color"]) > 6:
            bad.append(f'{r["name"]}: icon colour {hexc(m["icon"]["color"])} vs {hexc(m0["icon"]["color"])}')
print()
print("\n".join(bad) if bad else f"all {len(results)} buttons match (within 1px, same colours per variant)")
sys.exit(1 if bad else 0)
