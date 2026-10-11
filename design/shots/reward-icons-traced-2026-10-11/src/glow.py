"""glowing_star = the traced star (scaled into the middle) + a soft vector glow + 5 rays between the points. All vector, no filters.
usage: python3 glow.py STAR.svg OUT.svg [scale]"""
import math, re, sys
src, out = sys.argv[1], sys.argv[2]
sc = float(sys.argv[3]) if len(sys.argv) > 3 else 0.7
body = re.search(r'<svg[^>]*>(.*)</svg>', open(src).read(), re.S).group(1)
off = 16 * (1 - sc)
rays = []
for i in range(0, 10, 2):
    long = i % 2 == 0                        # 5 long rays between the star's points, 5 short ones past the tips
    a = math.radians(-54 + i * 36)
    r0, r1, wd = (10.4, 15.8, 1.9) if long else (12.6, 15.2, 0.9)
    px, py = -math.sin(a), math.cos(a)
    m = (r0 + r1) / 2
    pts = [(16 + math.cos(a) * r0, 16 + math.sin(a) * r0), (16 + math.cos(a) * m + px * wd, 16 + math.sin(a) * m + py * wd),
           (16 + math.cos(a) * r1, 16 + math.sin(a) * r1), (16 + math.cos(a) * m - px * wd, 16 + math.sin(a) * m - py * wd)]
    rays.append("M" + "L".join("%.2f %.2f" % p for p in pts) + "Z")
svg = ('<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">'
       '<defs><radialGradient id="g"><stop offset=".3" stop-color="#FEF585" stop-opacity=".9"/><stop offset=".62" stop-color="#F0BD37" stop-opacity=".35"/>'
       '<stop offset="1" stop-color="#E8A31B" stop-opacity="0"/></radialGradient></defs>'
       '<circle cx="16" cy="16" r="16" fill="url(#g)"/>'
       '<path fill="#FAE350" stroke="#B48329" stroke-width=".5" stroke-linejoin="round" d="%s"/>'
       '<g transform="translate(%.2f %.2f) scale(%.3f)">%s</g></svg>\n') % ("".join(rays), off, off, sc, body)
open(out, "w").write(svg)
print(out, len(svg), "bytes")
