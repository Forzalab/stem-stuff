// layout-docs.mjs: the figure language's LLM docs (progressive disclosure: CORE goes in every prompt, the topics are served by a
// read_doc tool on demand) + the built-in scenes of the Figure Lab mockup. Data only, no imports. Every ``` example here and every
// scene except "broken" must evaluate with zero llm-class findings (tests/layout-core.test.mjs runs them all through evaluate()).
// The engine places and checks layout; the LLM owns the physics. Not a physics simulator.

export const CORE = `You draw ONE diagram as a figure program: one statement per line, \`id = Comp(args)\`. Output only statements: no prose, no code fences.
The engine places and checks layout (contact, overlap, containment) and draws it. You own the physics and the meaning: what acts on what, directions, sizes.
World units, y points up. Make the main object about 4 to 10 units wide.
Points (the engine computes them; derive points, raw numbers only for a few anchors):
  Pt(x, y)  Mid(A, B)  Along(A, B, t)  Off(P, dx, dy)  Foot(P, A, B)  Rot(O, P, deg)  Meet(A, B, C, D)
Shapes:
  Seg(A, B, opts?)  Box(C, w, h, deg?, opts?)  Poly([A, B, C, ...], opts?)  Circle(O, r, opts?)
  Vec(A, B, label?, opts?)  Label(P, text, opts?)  Angle(A, O, B, label?, opts?)
opts object: {kind, in, tone, layer, fill, label}
  kind solid (default for Seg Box Poly Circle): may touch, never overlap.
  kind surface: one-sided ground, wall, ramp, face; bodies rest on it and may not sink in; arrow heads may pass into it.
  kind inside + in: containerId: must stay inside that Box, Poly or Circle (liquid in a tank).
  kind overlay: never checked (connector lines, construction lines, helper marks).
  Vec, Label, Angle are decor: a Vec is checked only at its head, never against the body it starts in.
  tone sky amber orange violet pink cyan ink muted; layer 1 asked, 2 given, 3 context; one hue per quantity; fill: true fills.
  label: "R" on a shape names it; the engine places every label, give only the anchor.
Inline point ops are fine inside args: Seg(Mid(A, B), Off(C, 0, 1)). Arithmetic + - * / on numbers is fine.
Forward references are fine. Order: basic shapes first, then vectors, then labels.
Precedence = line order: when two shapes conflict, the LATER line is blamed and must move.
Optional last line: fig = Figure([ids...]).
More on demand: read_doc(topic) with topic points, shapes, kinds, pass2, colors, ex-physics, ex-calc, ex-geometry, ex-cs, ex-chem.
Text in labels: short, no "I", no "!", no emoji.`;

export const TOPICS = {
  points: `Points (all computed by the engine, world units, y up):
- Pt(x, y): a free point. The only kind a pass-2 Fix may move.
- Mid(A, B): midpoint.
- Along(A, B, t): A + t (B - A); t = 0.5 is the midpoint, t > 1 runs past B.
- Off(P, dx, dy): P shifted by (dx, dy).
- Foot(P, A, B): the foot of the perpendicular from P onto line AB (an altitude's foot).
- Rot(O, P, deg): P turned about O by deg, counter-clockwise. Rot(P, Off(P, 0, 1), 30) is a unit normal of a 30 degree slope, set at P.
- Meet(A, B, C, D): where line AB meets line CD. Parallel lines have no point: that is an error.
Derive points from each other so a change to one anchor moves everything that hangs off it.
\`\`\`
A = Pt(0, 0)
B = Pt(6, 0)
C = Pt(2, 4)
M = Mid(A, B)
H = Foot(C, A, B)
T = Meet(A, Rot(A, B, 30), B, Off(B, 0, 1))
tri = Poly([A, B, C], {kind: "overlay"})
alt = Seg(C, H, {kind: "overlay", tone: "violet"})
\`\`\``,
  shapes: `Shapes (centre-based, world units):
- Seg(A, B, opts?): a line (wire, rod, rope, ground). Thin: lines never conflict with each other.
- Box(C, w, h, deg?, opts?): a w x h rectangle centred on C, turned deg counter-clockwise.
- Poly([A, B, C, ...], opts?): a polygon (convex or not).
- Circle(O, r, opts?).
- Vec(A, B, label?, opts?): a vector arrow from A to B (force, velocity, current, pointer). Head at B.
- Label(P, text, opts?): text centred on P when free, else moved nearby by the engine.
- Angle(A, O, B, label?, opts?): an arc at O between rays OA and OB, with its label.
A body resting on a slope: take a point P on the slope, the centre is P + normal * h/2:
\`\`\`
A = Pt(0, 0)
B = Pt(6, 0)
top = Meet(A, Rot(A, B, 25), B, Off(B, 0, 1))
ramp = Poly([A, B, top], {kind: "surface"})
P = Along(A, top, 0.5)
C = Rot(P, Off(P, 0, 0.5), 25)
blk = Box(C, 1, 1, 25, {fill: true})
\`\`\``,
  kinds: `Kinds decide what the engine checks (layout only; never physics meaning):
- solid (default for Seg Box Poly Circle): two solids may touch but not overlap beyond the tolerance (1% of the figure span).
- surface: a one-sided floor, wall, ramp or face. Bodies rest on it; sinking in is an error. Vec heads may end inside it.
- inside + in: id: stays inside its container (a Box, Poly or Circle); it may fill it exactly. Still solid against other shapes.
- overlay: never checked. Use it for lines that join bodies (a tree edge centre to centre), construction lines, curves drawn over strips.
- decor (Vec, Label, Angle, automatic): labels are never checked; a Vec is checked only at its head, against solids it does not start in.
Findings come back as pairs ids [later, earlier]: the later line is blamed, with the amount and the push vector (where it must move).
A dashed ghost shows where the later shape would have to go.`,
  pass2: `Reviews (pass 2) append lines; they never delete.
- Fix a free point or a shape's own traits with a PATCH holding only what changes:
  f1 = Fix(C, {x: 1.2})            moves Pt C, and everything derived from it follows
  f2 = Fix(blk, {w: 1.4, deg: 30}) Box traits w h deg; Circle r; Label text; Vec and Angle label; any shape's opts keys
- Fix on a derived point (Mid Along Off Foot Rot Meet) is an error: fix its free source Pt instead.
- New statements may be added (new ids). Redefining an old id is an error; to delete or restructure, rewrite pass 1.
- After a review everything is evaluated and checked again.
Review 1 = geometry: answer each finding with a Fix (use the ghost target). Reviews 2 and 3 = meaning: add or adjust what the scene shows.
If nothing needs changing, reply with the single line: // ok`,
  colors: `Colors: palette hues only, one hue per quantity, kept across the figure and the text.
tone: sky amber orange violet pink cyan (quantities), ink (structure), muted (context, surfaces, wires). No green, no red.
layer: 1 = asked (the unknown), 2 = given, 3 = implied or context. fill: true fills an area shape (a face, a liquid).
Vec and Label without a tone get their own hue automatically; structure without a tone is ink.
\`\`\`
O = Pt(0, 0)
v = Vec(O, Pt(3, 0), "v", {tone: "sky", layer: 2})
a = Vec(O, Pt(0, 2), "a = ?", {tone: "amber", layer: 1})
\`\`\``,
  "ex-physics": `Lever on a fulcrum, loads on both ends:
\`\`\`
G = Pt(0, 0)
ground = Seg(Off(G, -5, 0), Off(G, 5, 0), {kind: "surface", tone: "muted"})
fulcrum = Poly([Off(G, -0.6, 0), Off(G, 0.6, 0), Off(G, 0, 1)], {fill: true, tone: "muted"})
beam = Box(Off(G, 0, 1.15), 8, 0.3, 0, {tone: "ink"})
m1 = Box(Off(G, -3.2, 1.8), 1, 1, 0, {fill: true, tone: "sky", label: "m₁"})
m2 = Box(Off(G, 3.4, 1.7), 0.8, 0.8, 0, {fill: true, tone: "amber", label: "m₂"})
W1 = Vec(Off(G, -3.2, 1.8), Off(G, -3.2, -0.4), "m₁g", {tone: "sky"})
W2 = Vec(Off(G, 3.4, 1.7), Off(G, 3.4, 0.2), "m₂g", {tone: "amber"})
d1 = Label(Off(G, -1.6, 0.5), "d₁", {tone: "ink"})
\`\`\`
Pulley from a ceiling, rope over the wheel, a hanging mass:
\`\`\`
O = Pt(0, 0)
ceiling = Seg(Off(O, -2, 2), Off(O, 2, 2), {kind: "surface", tone: "muted"})
axle = Seg(Off(O, 0, 2), O, {kind: "overlay", tone: "muted"})
wheel = Circle(O, 0.8, {tone: "ink"})
ropeL = Seg(Off(O, -0.8, 0), Off(O, -0.8, -3), {tone: "muted"})
ropeR = Seg(Off(O, 0.8, 0), Off(O, 0.8, -2), {tone: "muted"})
mass = Box(Off(O, 0.8, -2.5), 1, 1, 0, {fill: true, tone: "violet", label: "m"})
T = Vec(Off(O, -0.8, -3), Off(O, -0.8, -1.6), "T", {tone: "cyan"})
W = Vec(Off(O, 0.8, -2.5), Off(O, 0.8, -4.2), "mg", {tone: "violet"})
\`\`\``,
  "ex-calc": `Riemann strips under a curve (strips solid and touching, the curve drawn over them as overlay):
\`\`\`
O = Pt(0, 0)
xAxis = Seg(O, Off(O, 6, 0), {tone: "muted"})
yAxis = Seg(O, Off(O, 0, 4), {tone: "muted"})
s1 = Box(Off(O, 1.5, 0.5), 1, 1, 0, {fill: true, tone: "sky", layer: 3})
s2 = Box(Off(O, 2.5, 0.9), 1, 1.8, 0, {fill: true, tone: "sky", layer: 3})
s3 = Box(Off(O, 3.5, 1.4), 1, 2.8, 0, {fill: true, tone: "sky", layer: 3})
curve = Poly([Off(O, 1, 0.6), Off(O, 2, 1.3), Off(O, 3, 2.3), Off(O, 4, 3.4), Off(O, 4, 0), Off(O, 1, 0)], {kind: "overlay", tone: "amber"})
lab = Label(Off(O, 5, 3.5), "f(x)", {tone: "amber"})
dx = Label(Off(O, 2.5, -0.5), "Δx", {tone: "sky"})
\`\`\`
Tangent line at a point of a curve:
\`\`\`
P = Pt(2, 2)
c1 = Seg(Pt(0, 0.2), Pt(1, 1), {tone: "ink"})
c2 = Seg(Pt(1, 1), P, {tone: "ink"})
c3 = Seg(P, Pt(3, 3.4), {tone: "ink"})
tan = Seg(Along(P, Pt(3, 3.2), -1.5), Along(P, Pt(3, 3.2), 1.5), {kind: "overlay", tone: "amber"})
dot = Circle(P, 0.08, {kind: "overlay", fill: true, tone: "amber"})
lab = Label(Off(P, 0.6, -0.3), "slope = f'(a)", {tone: "amber"})
\`\`\``,
  "ex-geometry": `Right triangle with the altitude to the hypotenuse (Foot) and the inscribed circle (inside):
\`\`\`
A = Pt(0, 0)
B = Pt(4, 0)
C = Pt(0, 3)
tri = Poly([A, B, C], {kind: "overlay", tone: "ink"})
H = Foot(A, B, C)
alt = Seg(A, H, {kind: "overlay", tone: "violet", label: "h"})
I = Pt(1, 1)
inc = Circle(I, 1, {kind: "inside", in: tri, tone: "sky"})
rA = Angle(B, A, C, "90°")
lA = Label(Off(A, -0.3, -0.3), "A")
lB = Label(Off(B, 0.3, -0.3), "B")
lC = Label(Off(C, -0.3, 0.3), "C")
\`\`\``,
  "ex-cs": `An array with a pointer, then a binary tree (edges as overlay so they may end at the node centres):
\`\`\`
O = Pt(0, 0)
a0 = Box(Off(O, 0.5, 0), 1, 1, 0, {label: "3"})
a1 = Box(Off(O, 1.5, 0), 1, 1, 0, {label: "8"})
a2 = Box(Off(O, 2.5, 0), 1, 1, 0, {fill: true, tone: "amber", layer: 2, label: "5"})
a3 = Box(Off(O, 3.5, 0), 1, 1, 0, {label: "1"})
ptr = Vec(Off(O, 2.5, 2), Off(O, 2.5, 0.5), "i", {tone: "amber"})
\`\`\`
\`\`\`
R = Pt(0, 0)
L = Pt(-2, -1.6)
Rr = Pt(2, -1.6)
LL = Pt(-3, -3.2)
e1 = Seg(R, L, {kind: "overlay", tone: "muted"})
e2 = Seg(R, Rr, {kind: "overlay", tone: "muted"})
e3 = Seg(L, LL, {kind: "overlay", tone: "muted"})
n0 = Circle(R, 0.5, {fill: true, tone: "sky", label: "8"})
n1 = Circle(L, 0.5, {fill: true, tone: "sky", layer: 2, label: "3"})
n2 = Circle(Rr, 0.5, {fill: true, tone: "sky", layer: 2, label: "10"})
n3 = Circle(LL, 0.5, {fill: true, tone: "sky", layer: 3, label: "1"})
\`\`\``,
  "ex-chem": `A beaker of liquid: glass walls as surfaces, the inner space as an overlay container, the liquid inside it:
\`\`\`
B0 = Pt(0, 0)
B1 = Off(B0, 4, 0)
T0 = Off(B0, 0, 5)
T1 = Off(B1, 0, 5)
space = Poly([B0, B1, T1, T0], {kind: "overlay", tone: "muted", layer: 3})
wl = Seg(B0, T0, {kind: "surface", tone: "ink"})
wb = Seg(B0, B1, {kind: "surface", tone: "ink"})
wr = Seg(B1, T1, {kind: "surface", tone: "ink"})
liquid = Poly([B0, B1, Off(B1, 0, 3), Off(B0, 0, 3)], {kind: "inside", in: space, fill: true, tone: "sky", layer: 2, label: "water"})
mark = Seg(Off(B1, -0.6, 3), Off(B1, 0, 3), {kind: "overlay", tone: "muted"})
vol = Label(Off(B1, 1.2, 3), "250 mL", {tone: "sky"})
\`\`\``,
};

/** the read_doc tool's topic list */
export const TOPIC_NAMES = Object.keys(TOPICS);
/** every ``` program in the docs: [{topic, src}] */
export function docExamples() {
  const out = [];
  for (const [topic, text] of Object.entries(TOPICS)) for (const m of text.matchAll(/```\n([\s\S]*?)```/g)) out.push({ topic, src: m[1] });
  return out;
}

// ─── built-in scenes (Tony's refs: circuit, ramp + friction, cube under pressure, two pistons; plus one broken on purpose) ───
export const SCENES = {
  circuit: {
    title: "Series circuit",
    problem: "A 9 V battery is connected to a 2 Ω and a 4 Ω resistor in a row. How much current flows?",
    pass1: `TL = Pt(0, 4)
TR = Pt(8, 4)
BR = Pt(8, 0)
BL = Pt(0, 0)
bTop = Off(BL, 0, 2.2)
bBot = Off(BL, 0, 1.8)
plus = Seg(Off(bTop, -0.6, 0), Off(bTop, 0.6, 0), {tone: "sky"})
minus = Seg(Off(bBot, -0.35, 0), Off(bBot, 0.35, 0), {tone: "sky"})
r1c = Off(TL, 3, 0)
r1 = Box(r1c, 1.2, 0.7, 0, {tone: "orange", label: "2 Ω"})
r2c = Off(TL, 5.4, 0)
r2 = Box(r2c, 2, 0.7, 0, {tone: "orange", label: "4 Ω"})
w1 = Seg(bTop, TL, {tone: "muted"})
w2 = Seg(TL, Off(r1c, -0.6, 0), {tone: "muted"})
w3 = Seg(Off(r1c, 0.6, 0), Off(r2c, -1, 0), {tone: "muted"})
w4 = Seg(Off(r2c, 1, 0), TR, {tone: "muted"})
w5 = Seg(TR, BR, {tone: "muted"})
w6 = Seg(BR, BL, {tone: "muted"})
w7 = Seg(BL, bBot, {tone: "muted"})
i1 = Vec(Off(TL, 0.9, 0), Off(TL, 1.6, 0), "", {tone: "cyan"})
i2 = Vec(Off(TR, 0, -1.6), Off(TR, 0, -2.3), "", {tone: "cyan"})
i3 = Vec(Off(BR, -3.6, 0), Off(BR, -4.3, 0), "", {tone: "cyan"})
vL = Label(Off(bTop, 1.3, -0.2), "9 V", {tone: "sky"})
iL = Label(Mid(TL, BR), "I = ?", {tone: "cyan"})
fig = Figure([plus, minus, r1, r2, w1, w2, w3, w4, w5, w6, w7, i1, i2, i3, vL, iL])`,
    pass2: `eqc = Off(BR, -4, -1.4)
req = Box(eqc, 2.4, 0.7, 0, {tone: "orange", layer: 2, label: "6 Ω total"})`,
  },
  ramp: {
    title: "Ramp with friction",
    problem: "A box rests on a 30° ramp. Which way does friction point, and what must it equal?",
    pass1: `A = Pt(0, 0)
B = Pt(8, 0)
top = Meet(A, Rot(A, B, 30), B, Off(B, 0, 1))
ramp = Poly([A, B, top], {kind: "surface", tone: "muted"})
P = Along(A, top, 0.45)
C = Rot(P, Off(P, 0, 0.8), 30)
blk = Box(C, 1.6, 1.6, 30, {fill: true, tone: "muted", layer: 2})
W = Vec(C, Off(C, 0, -2.2), "W", {tone: "sky"})
Wpar = Vec(C, Rot(C, Off(C, -1.1, 0), 30), "W∥", {tone: "cyan"})
Wperp = Vec(C, Rot(C, Off(C, 0, -1.9), 30), "W⊥", {tone: "violet"})
f = Vec(C, Rot(C, Off(C, 1.1, 0), 30), "f", {tone: "amber"})
th = Angle(B, A, top, "30°")`,
    pass2: "",
  },
  cube: {
    title: "Cube under pressure",
    problem: "A cube has side 20 cm. Force F presses on its top face. Find the pressure, then the volume strain.",
    pass1: `F0 = Pt(0, 0)
F1 = Off(F0, 4, 0)
F2 = Off(F0, 4, 4)
F3 = Off(F0, 0, 4)
B1 = Off(F1, 1.8, 1.6)
B2 = Off(F2, 1.8, 1.6)
B3 = Off(F3, 1.8, 1.6)
front = Poly([F0, F1, F2, F3], {fill: true, tone: "muted", layer: 3})
top = Poly([F3, F2, B2, B3], {kind: "surface", fill: true, tone: "amber", layer: 2, label: "A"})
side = Poly([F1, B1, B2, F2], {fill: true, tone: "muted", layer: 2})
M3 = Mid(F3, B3)
M2 = Mid(F2, B2)
p1 = Vec(Off(Along(M3, M2, 0.2), 0, 2), Along(M3, M2, 0.2), "", {tone: "amber"})
p2 = Vec(Off(Along(M3, M2, 0.5), 0, 2), Along(M3, M2, 0.5), "", {tone: "amber"})
p3 = Vec(Off(Along(M3, M2, 0.8), 0, 2), Along(M3, M2, 0.8), "F", {tone: "amber"})
pL = Vec(Off(Mid(F0, F3), -1.8, 0), Mid(F0, F3), "P", {tone: "violet", layer: 2})
dim = Seg(Off(F0, 0, -0.5), Off(F1, 0, -0.5), {tone: "muted"})
dimL = Label(Off(Mid(F0, F1), 0, -1), "20 cm", {tone: "muted"})
dV = Label(Off(F3, -1.4, 1.4), "ΔV", {tone: "pink"})`,
    pass2: "",
  },
  pistons: {
    title: "Two pistons",
    problem: "A 1800 kg elephant sits on the big piston (R = 1.0 m). Students climb onto the small piston (r = 0.20 m). What is the smallest mass that raises the elephant?",
    pass1: `G = Pt(0, 0)
tank = Poly([G, Off(G, 10, 0), Off(G, 10, 4.2), Off(G, 8, 4.2), Off(G, 8, 1.6), Off(G, 5, 1.6), Off(G, 5, 4.2), Off(G, 0, 4.2)], {kind: "overlay", tone: "muted", layer: 3})
wl = Seg(G, Off(G, 0, 4.2), {kind: "surface", tone: "muted"})
wb = Seg(G, Off(G, 10, 0), {kind: "surface", tone: "muted"})
wr = Seg(Off(G, 10, 0), Off(G, 10, 4.2), {kind: "surface", tone: "muted"})
hump = Poly([Off(G, 5, 1.6), Off(G, 8, 1.6), Off(G, 8, 4.2), Off(G, 5, 4.2)], {kind: "surface", tone: "muted"})
oil = Poly([G, Off(G, 10, 0), Off(G, 10, 3.6), Off(G, 8, 3.6), Off(G, 8, 1.6), Off(G, 5, 1.6), Off(G, 5, 3.6), Off(G, 0, 3.6)], {kind: "inside", in: tank, fill: true, tone: "muted", layer: 2})
big = Box(Off(G, 2.5, 3.9), 5, 0.6, 0, {kind: "inside", in: tank, fill: true, tone: "ink"})
small = Box(Off(G, 9, 3.9), 2, 0.6, 0, {kind: "inside", in: tank, fill: true, tone: "ink"})
body = Circle(Off(G, 2.3, 5.1), 0.9, {fill: true, tone: "muted"})
head = Circle(Off(G, 3.4, 5.5), 0.45, {kind: "overlay", fill: true, tone: "muted"})
studs = Box(Off(G, 9, 4.7), 1.2, 1, 0, {fill: true, tone: "violet", layer: 2, label: "students"})
F1 = Vec(Off(G, 2.3, 8), Off(G, 2.3, 6), "F₁ = mg", {tone: "pink"})
F2 = Vec(Off(G, 9, 7), Off(G, 9, 5.2), "F₂", {tone: "violet"})
mL = Label(Off(G, 2.5, 2), "1800 kg", {tone: "ink"})
oL = Label(Off(G, 6.5, 0.8), "oil", {tone: "muted"})`,
    pass2: "",
  },
  broken: {
    title: "Broken (every finding)",
    problem: "A test scene: one of every finding class. Turn the mover on to see the small sink auto-fixed.",
    pass1: `A = Pt(0, 0)
B = Pt(6, 0)
floor = Seg(A, B, {kind: "surface", tone: "muted"})
c1 = Off(A, 1.5, 0.5)
crate = Box(c1, 2, 1, 0)
c2 = Pt(2.2, 1.3)
crate2 = Box(c2, 1.6, 1, 0)
deep = Box(Pt(4.5, 0.3), 1, 1, 0)
pp = Pt(5.5, 0.2)
pebble = Circle(pp, 0.3)
cup = Box(Pt(8, 1), 2, 2, 0, {kind: "overlay"})
ball = Circle(Pt(8.8, 1), 0.5, {kind: "inside", in: cup})
v = Vec(Pt(0.8, 3), Off(c1, -0.7, 0.2), "F")
X = Meet(A, B, Off(A, 0, 1), Off(B, 0, 1))
xs = Seg(X, B)
xt = Label(X, "x")
k = Pt2(1, 1)
loopA = Mid(loopB, A)
loopB = Mid(loopA, B)
lost = Seg(A, nowhere)
L1 = Label(Pt(3, 3), "one")
L2 = Label(Pt(3, 3), "two")
L3 = Label(Pt(3, 3), "three")
L4 = Label(Pt(3, 3), "four")
L5 = Label(Pt(3, 3), "five")
L6 = Label(Pt(3, 3), "six")`,
    pass2: `fx1 = Fix(X, {x: 1})
fx2 = Fix(crate2, {spin: 3})
crate = Box(c1, 1, 1, 0)
fx3 = Fix(c2, {y: 1.5})`,
  },
};
