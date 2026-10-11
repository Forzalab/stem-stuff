"""Simplify the traced gem so it has no "teeth" at 60 px: keep the traced silhouette (path 0) and crown highlight (path 1),
drop the 14 small jagged traced facets, and lay clean straight-edged crown cuts and four pavilion facets on the blue ramp.
usage: python3 gemfix.py TRACED_GEM.svg OUT.svg   (run after recolor.py blue; the facet hexes are the gift blue ramp)"""
import re, sys
s = open(sys.argv[1]).read()
head = s[:s.index('<path')]
P = re.findall(r'<path fill="#\w+" d="[^"]+"/>', s)
poly = lambda f, pts: '<path fill="%s" d="M%sZ"/>' % (f, "L".join("%g %g" % p for p in pts))
Y = 12.6
L, a, c, b, R, T = (2.9, Y), (10.6, Y), (16.3, Y), (22, Y), (29.7, Y), (16.3, 27.7)
pav = [poly("#2C4EA3", [L, a, T]), poly("#3763C9", [a, c, T]), poly("#247AD5", [c, b, T]), poly("#1A4196", [b, R, T])]
crown = [poly("#3763C9", [(1.9, 10.4), (9.5, 10.4), (6.5, Y), (2.9, Y)]), poly("#247AD5", [(22.6, 10.4), (30.7, 10.4), (29.7, Y), (25.5, Y)])]
out = head + P[0] + P[1] + "".join(crown) + "".join(pav) + "</svg>\n"
open(sys.argv[2], "w").write(out)
print(sys.argv[2], len(out), "bytes")
