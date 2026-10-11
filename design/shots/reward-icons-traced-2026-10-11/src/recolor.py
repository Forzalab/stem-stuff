"""Recolour a traced SVG onto one ramp sampled from the gift refs (pal.json): each fill's luminance, normalised over the icon's
own fills, picks a point on the 5-stop ramp (dark -> highlight). Keeps the shading structure, swaps the hue family.
usage: python3 recolor.py IN.svg OUT.svg FAMILY [pal.json]"""
import json, re, sys
src, out, fam = sys.argv[1:4]
pal = json.load(open(sys.argv[4] if len(sys.argv) > 4 else "pal.json"))[fam]
rgb = lambda h: tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))
lum = lambda c: .2126 * c[0] + .7152 * c[1] + .0722 * c[2]
stops = [rgb(h) for h in pal]
s = open(src).read()
fills = sorted(set(re.findall(r'fill="(#[0-9A-Fa-f]{6})"', s)))
L = {f: lum(rgb(f)) for f in fills}
lo, hi = min(L.values()), max(L.values())
def at(t):
    t = min(max(t, 0), 1) * (len(stops) - 1)
    i = min(int(t), len(stops) - 2); u = t - i
    return "#%02X%02X%02X" % tuple(round(a + (b - a) * u) for a, b in zip(stops[i], stops[i + 1]))
mp = {f: at((L[f] - lo) / (hi - lo or 1)) for f in fills}
s = re.sub(r'fill="(#[0-9A-Fa-f]{6})"', lambda m: 'fill="%s"' % mp[m.group(1)], s)
open(out, "w").write(s)
print(out, fam, " ".join(f"{a}->{b}" for a, b in mp.items()))
