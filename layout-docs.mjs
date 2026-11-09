// layout-docs.mjs: the figure language's LLM docs (progressive disclosure: CORE goes in every prompt, the topics are served by a
// read_doc tool on demand) + the built-in scenes of the Figure Lab mockup. Data only, no imports. Every ``` example here and every
// scene except "broken" must evaluate with zero llm-class findings (tests/layout-core.test.mjs runs them all through evaluate()).
// The engine places and checks layout; the LLM owns the physics. Not a physics simulator.

export const CORE = `You draw ONE diagram as a figure program: one statement per line, \`id = Comp(args)\`. Output only the plan lines and statements: no prose, no code fences.
Plan first (the // lines): up to 4 lines, each on its own line, before any statement:
  // goal: what the student must see   // anchor: the main object   // layers: 1 <idea>, 2 <idea>, ...   // budget: N statements
Pick layers by goal: one layer = one reasoning step that changes what the student looks at; pure algebra stays in text.
  Recommended 2-4 layers, max 6. HINT mode stops before the answer layer; EXPLAIN includes it. The prefix = the anchor's rough blocks only.
Draw MINIMALISTIC, FUNCTIONAL diagrams: only what the explanation needs, no extraneous elements, no decorative objects.
The engine places and checks layout (contact, overlap, containment) and draws it. You own the physics and the meaning: what acts on what, directions, sizes.
World units, y points up. Make the main object about 4 to 10 units wide.
Points (the engine computes them; derive points, raw numbers only for a few anchors):
  Pt(x, y)  Mid(A, B)  Along(A, B, t)  Off(P, dx, dy)  Foot(P, A, B)  Rot(O, P, deg)  Meet(A, B, C, D)
Shapes:
  Seg(A, B, opts?)  Box(C, w, h, deg?, opts?)  Poly([A, B, C, ...], opts?)  Circle(O, r, opts?)
  Curve([A, B, C, ...], opts?): smooth through the points; closed: true = a blob; w: 0.3 or w: [0.4, 0.05] = a (tapered) stroke; mirror: [P, Q].
  Union([ids...], opts?): parts that form ONE object; parts never conflict with each other; its opts fill in what parts leave out.
  Vec(A, B, label?, opts?)  Label(P, text, opts?)  Angle(A, O, B, label?, opts?)  Dim(A, B, text, opts?)
opts object: {kind, in, tone, layer, fill, label, legend}
  kind solid (default for Seg Box Poly Circle Curve): may touch, never overlap.
  kind surface: one-sided ground, wall, ramp, water line; bodies rest on it and may not sink in; arrow heads may pass into it.
  kind inside + in: containerId: must stay inside that Box, Poly, Circle or closed Curve (liquid in a tank).
  kind overlay: never checked (connector lines, construction lines, field lines, helper marks).
  Vec, Label, Angle, Dim are decor: a Vec is checked only at its head, never against the body it starts in.
  tone sky amber orange violet pink cyan ink muted; layer 1 asked, 2 given, 3 context; one hue per quantity; fill: true fills.
  label: "m" on a shape: a short symbol or value, placed inside or beside it by the engine. Give only the anchor.
  legend: "elephant" on a shape or Union: the object's NAME goes to a legend row under the drawing, beside a small render of it.
  A label with no room by its anchor moves to the legend by itself. Lengths and distances: Dim(A, B, "2 m"), never a loose Label.
Steps: sN = Layer([ids...], {hide: [ids], zoom: [ids], lit: [ids], title: "..."}) stacks one more step on all before it.
  Lines before the first Layer = the prefix. Lines after a Layer join it. lit = where to look, zoom = camera. No step: // layers: none.
Inline point ops are fine inside args: Seg(Mid(A, B), Off(C, 0, 1)). Arithmetic + - * / on numbers is fine.
Forward references are fine. Order: basic shapes first, then details, then vectors, then labels.
Precedence = line order: when two shapes conflict, the LATER line is blamed and must move.
More on demand: read_doc(topic) with topic points, shapes, kinds, curves, legend, dim, layers, pass2, colors, ex-physics, ex-calc, ex-geometry, ex-cs, ex-chem.
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
  curves: `Curves and unions (organic parts: a beak, a horn, a tail, a lens, a field line). Prefer Box / Circle / Poly; reach for Curve only when a part is round or organic.
- Curve([A, B, C, ...]): a smooth curve through every point (centripetal Catmull-Rom). The drawn curve and the checked outline are the same polyline.
- closed: true closes it into a blob (an area: it collides, it can be filled, a label can sit inside).
- w: 0.3 (a stroke 0.3 wide) or w: [0.4, 0.05] (tapered from 0.4 to 0.05, round ends): a horn, a beak, a tail, a neck. Open curves only.
- mirror: [P, Q] adds the mirror image of the points across line PQ, joined at the axis: give half a symmetric outline.
- An open Curve without w is a thin line (a path, a trajectory, a ripple): lines never conflict with lines.
- A curve that crosses itself is an error: move a point, or make the stroke thinner at a tight bend.
- Union([a, b, c], opts?): one object made of parts. Parts collide with OTHER objects, never with each other. The Union's legend / label name the whole group; its kind, tone, layer, fill fill in what a part leaves out (a part's own opts win).
Build organic things like a human in Canva: the prefix holds rough blocks, a Layer swaps them for the detailed parts.
\`\`\`
G = Pt(0, 0)
ground = Seg(Off(G, -4, 0), Off(G, 4, 0), {kind: "surface", tone: "muted"})
cube = Box(Off(G, 0, 2), 4, 4, 0)
s1 = Layer([f1], {title: "The cube"})
f1 = Fix(cube, {tone: "amber", fill: true})
s2 = Layer([horn, beast], {lit: [horn], zoom: [horn], title: "Add a horn"})
horn = Curve([Off(G, -0.6, 4), Off(G, -0.3, 5), Off(G, 0.6, 5.9)], {w: [0.9, 0.05], fill: true, tone: "violet"})
beast = Union([cube, horn], {legend: "horned cube"})
\`\`\`
Symmetric lens with mirror (half the outline, mirrored across the vertical through O):
\`\`\`
O = Pt(0, 0)
lens = Curve([Off(O, 0, 2.5), Off(O, 0.4, 0), Off(O, 0, -2.5)], {closed: true, mirror: [O, Off(O, 0, 1)], fill: true, tone: "sky", layer: 3})
\`\`\``,
  legend: `Legend: names of objects go under the drawing, beside a small render of the object itself (not a colour swatch).
- legend: "elephant" on a shape (or on a Union: the render shows every part). Use it for what an object IS: elephant, students, oil, lens.
- label: "m" is for a short symbol or value ON the object (m, 2 Ω, A). The engine puts it inside the shape when it fits, else right beside it.
- A label with no room inside or right next to its anchor (it would cross a line, a filled body or another label) moves to the legend by itself: the feedback says "moved to legend". No leader lines are drawn.
\`\`\`
G = Pt(0, 0)
floor = Seg(Off(G, -3, 0), Off(G, 3, 0), {kind: "surface", tone: "muted"})
crate = Box(Off(G, -1.2, 0.6), 1.2, 1.2, 0, {fill: true, tone: "sky", label: "m", legend: "crate"})
body = Circle(Off(G, 1.4, 0.9), 0.9, {fill: true})
ear = Circle(Off(G, 2.3, 1.5), 0.4, {fill: true})
cat = Union([body, ear], {tone: "muted", legend: "cat"})
\`\`\``,
  dim: `Dim(A, B, text, opts?): a dimension line for the length AB: drawn beside AB on the outside of the figure, with a tick at each end and the text centred along it (or just beside it when the line is short).
- The engine tries the outside, then the other side, then further out; if no spot is free the text moves to the legend.
- A and B can be any points: Dim(Off(O, 0, 0), Off(O, 4, 0), "4 m") under a body, Dim(Foot(C, A, B), C, "h") for a height.
- Use Dim for lengths, radii, distances and heights. Never a loose Label for a length.
\`\`\`
A = Pt(0, 0)
B = Pt(5, 0)
C = Pt(1.5, 3)
tri = Poly([A, B, C], {kind: "overlay", tone: "ink"})
H = Foot(C, A, B)
alt = Seg(C, H, {kind: "overlay", tone: "violet"})
b = Dim(A, B, "b = 5 cm")
h = Dim(H, C, "h = 3 cm", {tone: "violet"})
\`\`\``,
  layers: `Layers stack steps, like Photoshop layers that cannot be switched off in the middle (linear, no branches).
- Plan first: // goal, // anchor, // layers: 1 <idea>, 2 <idea>, // budget: N statements. The engine compares the plan with what is drawn.
- One layer = one reasoning step that changes what the student looks at; pure algebra stays in the text. 2-4 layers, at most 6.
- HINT mode stops before the answer layer; EXPLAIN includes it.
- The prefix = every line before the first Layer: the anchor's rough blocks only, drawn as a blueprint.
- sN = Layer([ids...], opts) adds those statements (and every line written after it, until the next Layer) on top of all before it.
- hide: [ids] hides earlier shapes from this step on (swap a rough block for its detailed parts).
- lit: [ids] = where to look: the rest of the figure turns pale. zoom: [ids] = the camera fits those shapes for this step.
- title: "..." = one short line for the step. A Fix listed in a Layer restyles from that step on (step 1 tone amber).
- Checks: each step's new shapes are checked against everything shown with them; shapes never shown together never conflict.
\`\`\`
// goal: why the block stays put, then what a push adds
// anchor: a block on the floor
// layers: 1 weight and normal force, 2 the push
// budget: 8 statements
O = Pt(0, 0)
floor = Seg(Off(O, -3, 0), Off(O, 3, 0), {kind: "surface", tone: "muted"})
blk = Box(Off(O, 0, 0.75), 1.5, 1.5, 0, {fill: true, tone: "muted"})
s1 = Layer([W, N], {lit: [W, N], title: "Two forces"})
W = Vec(Off(O, 0, 0.75), Off(O, 0, -1), "W", {tone: "sky"})
N = Vec(Off(O, 0, 0.75), Off(O, 0, 2.5), "N", {tone: "amber"})
s2 = Layer([F], {lit: [F], zoom: [blk, F], title: "Push it"})
F = Vec(Off(O, -2.6, 0.75), Off(O, -0.75, 0.75), "F", {tone: "violet"})
\`\`\``,
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
    pass1: `// goal: one current through the whole loop
// anchor: the loop: battery, two resistors, wires
// layers: none
// budget: 25 statements
TL = Pt(0, 4)
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
    pass1: `// goal: the forces on the box and which way friction points
// anchor: a box on a 30° ramp
// layers: none
// budget: 15 statements
A = Pt(0, 0)
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
    pass1: `// goal: the force on the top face, then the squeeze
// anchor: the cube
// layers: none
// budget: 20 statements
F0 = Pt(0, 0)
F1 = Off(F0, 4, 0)
F2 = Off(F0, 4, 4)
F3 = Off(F0, 0, 4)
B1 = Off(F1, 1.8, 1.6)
B2 = Off(F2, 1.8, 1.6)
B3 = Off(F3, 1.8, 1.6)
front = Poly([F0, F1, F2, F3], {fill: true, tone: "muted", layer: 3})
top = Poly([F3, F2, B2, B3], {kind: "surface", fill: true, tone: "amber", layer: 2, label: "A"})
side = Poly([F1, B1, B2, F2], {fill: true, tone: "muted", layer: 2})
p1 = Vec(Off(Along(B3, B2, 0.2), 0, 1.8), Along(B3, B2, 0.2), "", {tone: "amber"})
p2 = Vec(Off(Along(B3, B2, 0.5), 0, 1.8), Along(B3, B2, 0.5), "", {tone: "amber"})
p3 = Vec(Off(Along(B3, B2, 0.8), 0, 1.8), Along(B3, B2, 0.8), "F", {tone: "amber"})
pL = Vec(Off(Mid(F0, F3), -1.8, 0), Mid(F0, F3), "P", {tone: "violet", layer: 2})
dim = Dim(F0, F1, "20 cm")
dV = Label(Off(F3, -1.4, 1.4), "ΔV", {tone: "pink"})`,
    pass2: "",
  },
  pistons: {
    title: "Two pistons",
    problem: "A 1800 kg elephant sits on the big piston (R = 1.0 m). Students climb onto the small piston (r = 0.20 m). What is the smallest mass that raises the elephant?",
    pass1: `// goal: the same pressure under both pistons
// anchor: two pistons joined by oil
// layers: none
// budget: 20 statements
G = Pt(0, 0)
tank = Poly([G, Off(G, 10, 0), Off(G, 10, 4.2), Off(G, 8, 4.2), Off(G, 8, 1.6), Off(G, 5, 1.6), Off(G, 5, 4.2), Off(G, 0, 4.2)], {kind: "overlay", tone: "muted", layer: 3})
wl = Seg(G, Off(G, 0, 4.2), {kind: "surface", tone: "muted"})
wb = Seg(G, Off(G, 10, 0), {kind: "surface", tone: "muted"})
wr = Seg(Off(G, 10, 0), Off(G, 10, 4.2), {kind: "surface", tone: "muted"})
hump = Poly([Off(G, 5, 1.6), Off(G, 8, 1.6), Off(G, 8, 4.2), Off(G, 5, 4.2)], {kind: "surface", tone: "muted"})
oil = Poly([G, Off(G, 10, 0), Off(G, 10, 3.6), Off(G, 8, 3.6), Off(G, 8, 1.6), Off(G, 5, 1.6), Off(G, 5, 3.6), Off(G, 0, 3.6)], {kind: "inside", in: tank, fill: true, tone: "muted", layer: 2, legend: "oil"})
big = Box(Off(G, 2.5, 3.9), 5, 0.6, 0, {kind: "inside", in: tank, fill: true, tone: "ink"})
small = Box(Off(G, 9, 3.9), 2, 0.6, 0, {kind: "inside", in: tank, fill: true, tone: "ink"})
body = Circle(Off(G, 2.3, 5.1), 0.9, {fill: true})
head = Circle(Off(G, 3.4, 5.5), 0.45, {fill: true})
eleph = Union([body, head], {tone: "muted", legend: "elephant, 1800 kg"})
studs = Box(Off(G, 9, 4.7), 1.2, 1, 0, {fill: true, tone: "violet", layer: 2, legend: "students"})
F1 = Vec(Off(G, 2.3, 8), Off(G, 2.3, 6), "F₁ = mg", {tone: "pink"})
F2 = Vec(Off(G, 9, 7), Off(G, 9, 5.2), "F₂", {tone: "violet"})
dR = Dim(Off(G, 2.5, 0), Off(G, 5, 0), "R = 1.0 m")
dr = Dim(Off(G, 9, 0), Off(G, 10, 0), "r = 0.20 m")`,
    pass2: "",
  },
  lens: {
    title: "Thin lens (Dim + layers)",
    problem: "An object 10 cm tall stands 25 cm in front of a converging lens with focal length 10 cm. Where does the image form, and how tall is it?",
    pass1: `// goal: where the image forms, from three rays
// anchor: the lens on its axis with the object
// layers: 1 the distances, 2 ray 1, 3 ray 2, 4 ray 3, 5 the image
// budget: 25 statements
O = Pt(0, 0)
axis = Seg(Off(O, -6.5, 0), Off(O, 5, 0), {kind: "overlay", tone: "muted"})
lens = Curve([Off(O, 0, 2.6), Off(O, 0.35, 0), Off(O, 0, -2.6)], {closed: true, mirror: [O, Off(O, 0, 1)], fill: true, tone: "sky", layer: 3, legend: "converging lens"})
F = Off(O, -2, 0)
Fp = Off(O, 2, 0)
T = Off(O, -5, 2)
I = Off(O, 3.333, -1.333)
fd = Circle(F, 0.08, {kind: "overlay", fill: true, tone: "ink", label: "F"})
fpd = Circle(Fp, 0.08, {kind: "overlay", fill: true, tone: "ink", label: "F′"})
obj = Vec(Off(O, -5, 0), T, "", {tone: "amber", legend: "object"})
s1 = Layer([dO, dF], {title: "Object at 25 cm, focal length 10 cm"})
dO = Dim(Off(O, -5, 0), O, "dₒ = 25 cm", {tone: "amber"})
dF = Dim(O, Fp, "f = 10 cm")
s2 = Layer([r1a, r1b], {lit: [r1a, r1b, obj], title: "Ray 1: parallel, then through F′"})
r1a = Seg(T, Off(O, 0, 2), {kind: "overlay", tone: "orange"})
r1b = Seg(Off(O, 0, 2), I, {kind: "overlay", tone: "orange"})
s3 = Layer([r2], {lit: [r2, obj], title: "Ray 2: straight through the centre"})
r2 = Seg(T, I, {kind: "overlay", tone: "pink"})
s4 = Layer([r3a, r3b], {lit: [r3a, r3b, obj], title: "Ray 3: through F, then parallel"})
r3a = Seg(T, Off(O, 0, -1.333), {kind: "overlay", tone: "cyan"})
r3b = Seg(Off(O, 0, -1.333), I, {kind: "overlay", tone: "cyan"})
s5 = Layer([img, dI], {lit: [img, dI], zoom: [img, dI, r1b], title: "The rays meet: a real, inverted, smaller image"})
img = Vec(Off(O, 3.333, 0), I, "", {tone: "violet", legend: "image, 6.7 cm"})
dI = Dim(O, Off(O, 3.333, 0), "dᵢ = 16.7 cm", {tone: "violet"})`,
    pass2: "",
  },
  pelican: {
    title: "Pelican on a lake (Curve + Union)",
    problem: "Draw a pelican floating on a lake.",
    pass1: `// goal: a pelican floating on a lake
// anchor: rough blocks: lake, body, head
// layers: 1 the curves of the bird, 2 ripples and the name
// budget: 20 statements
G = Pt(0, 0)
water = Box(Off(G, -0.6, -0.5), 9, 1, 0, {kind: "overlay", fill: true, tone: "sky", layer: 3})
lake = Seg(Off(G, -5.1, 0), Off(G, 3.9, 0), {kind: "surface", tone: "sky"})
bodyB = Box(Off(G, 0.6, 0.8), 4, 1.6, 0)
headB = Circle(Off(G, -1.55, 3.7), 0.45)
s1 = Layer([body, neck, head, beak, pouch, wing, eye], {hide: [bodyB, headB], title: "Curves: body, neck, head, beak with its pouch, wing"})
body = Curve([Off(G, -1.5, 0.95), Off(G, -0.8, 0.25), Off(G, 0.6, 0), Off(G, 2, 0.25), Off(G, 3.1, 1.05), Off(G, 1.7, 1.45), Off(G, 0, 1.6), Off(G, -1, 1.5)], {closed: true, fill: true, tone: "muted", layer: 2})
neck = Curve([Off(G, -1, 1.3), Off(G, -1.65, 2.1), Off(G, -1.2, 2.9), Off(G, -1.5, 3.5)], {w: [0.6, 0.42], fill: true, tone: "muted", layer: 2})
head = Circle(Off(G, -1.55, 3.7), 0.45, {fill: true, tone: "muted", layer: 2})
beak = Curve([Off(G, -1.9, 3.8), Off(G, -3.3, 3.5), Off(G, -4.7, 3.05), Off(G, -4.85, 2.85)], {w: [0.3, 0.08], fill: true, tone: "amber", layer: 2})
pouch = Curve([Off(G, -1.85, 3.55), Off(G, -2.5, 2.8), Off(G, -3.6, 2.75), Off(G, -4.55, 3.0), Off(G, -3.3, 3.4)], {closed: true, fill: true, tone: "orange", layer: 2})
wing = Curve([Off(G, -0.6, 1.35), Off(G, 0.8, 1.3), Off(G, 2.2, 1.05), Off(G, 3.1, 0.95)], {w: [0.75, 0.1], fill: true, tone: "ink", layer: 1})
eye = Circle(Off(G, -1.45, 3.82), 0.08, {fill: true, tone: "ink"})
s2 = Layer([rip1, rip2, rip3, bird], {title: "Ripples on the water, and the name"})
rip1 = Curve([Off(G, -4.1, -0.35), Off(G, -3.4, -0.22), Off(G, -2.7, -0.35)], {kind: "overlay", tone: "sky"})
rip2 = Curve([Off(G, 2.1, -0.3), Off(G, 2.8, -0.18), Off(G, 3.5, -0.3)], {kind: "overlay", tone: "sky"})
rip3 = Curve([Off(G, -0.4, -0.6), Off(G, 0.6, -0.45), Off(G, 1.6, -0.6)], {kind: "overlay", tone: "sky"})
bird = Union([body, neck, head, beak, pouch, wing, eye], {legend: "pelican"})`,
    pass2: "",
  },
  horned: {
    title: "Horned cube (layers)",
    problem: "A cube on the ground; then it grows a horn.",
    pass1: `// goal: the same cube, then a horn added
// anchor: a cube on the ground
// layers: 1 the cube, 2 the horn
// budget: 10 statements
G = Pt(0, 0)
ground = Seg(Off(G, -4, 0), Off(G, 4, 0), {kind: "surface", tone: "muted"})
cube = Box(Off(G, 0, 2), 4, 4, 0)
s1 = Layer([f1], {title: "The cube"})
f1 = Fix(cube, {tone: "amber", fill: true})
s2 = Layer([horn, beast], {lit: [horn], zoom: [horn], title: "Add a horn"})
horn = Curve([Off(G, -0.6, 4), Off(G, -0.3, 5), Off(G, 0.6, 5.9)], {w: [0.9, 0.05], fill: true, tone: "violet"})
beast = Union([cube, horn], {legend: "horned cube"})`,
    pass2: "",
  },
  area: {
    title: "Area under a curve + tangent",
    problem: "Shade the area under f(x) = 0.1x² + 0.5 from x = 1 to x = 4, and draw the tangent at x = 5.",
    pass1: `// goal: the area under f, then the tangent at x = 5
// anchor: the axes and the curve f
// layers: 1 the area from 1 to 4, 2 the tangent at 5
// budget: 10 statements
O = Pt(0, 0)
xAx = Seg(Off(O, -0.4, 0), Off(O, 6.6, 0), {kind: "overlay", tone: "muted"})
yAx = Seg(Off(O, 0, -0.4), Off(O, 0, 4.6), {kind: "overlay", tone: "muted"})
f = Curve([Pt(0, 0.5), Pt(1, 0.6), Pt(2, 0.9), Pt(3, 1.4), Pt(4, 2.1), Pt(5, 3), Pt(6, 4.1)], {kind: "overlay", tone: "ink", label: "f(x)"})
s1 = Layer([A], {lit: [A], title: "The area from 1 to 4"})
A = Poly([Pt(1, 0), Pt(1, 0.6), Pt(1.5, 0.725), Pt(2, 0.9), Pt(2.5, 1.125), Pt(3, 1.4), Pt(3.5, 1.725), Pt(4, 2.1), Pt(4, 0)], {kind: "overlay", fill: true, tone: "sky", layer: 2, label: "A"})
ab = Dim(Pt(1, 0), Pt(4, 0), "from 1 to 4", {tone: "sky"})
s2 = Layer([tan, P], {lit: [tan, P], title: "The tangent at x = 5: slope f′(5) = 1"})
P = Circle(Pt(5, 3), 0.09, {kind: "overlay", fill: true, tone: "amber"})
tan = Seg(Pt(3.8, 1.8), Pt(6.4, 4.4), {kind: "overlay", tone: "amber", label: "slope 1"})`,
    pass2: "",
  },
  unit: {
    title: "Unit circle: sin and cos",
    problem: "On the unit circle, show cos θ and sin θ for θ = 35°.",
    pass1: `// goal: cos θ and sin θ as the coordinates of the point
// anchor: the unit circle with the point at 35°
// layers: 1 cos θ, 2 sin θ
// budget: 15 statements
O = Pt(0, 0)
xAx = Seg(Off(O, -3.6, 0), Off(O, 3.6, 0), {kind: "overlay", tone: "muted"})
yAx = Seg(Off(O, 0, -3.6), Off(O, 0, 3.6), {kind: "overlay", tone: "muted"})
circ = Circle(O, 3, {kind: "overlay", tone: "muted"})
P = Rot(O, Off(O, 3, 0), 35)
Q = Foot(P, O, Off(O, 1, 0))
rad = Seg(O, P, {kind: "overlay", tone: "ink", label: "1"})
dot = Circle(P, 0.08, {kind: "overlay", fill: true, tone: "ink"})
th = Angle(Q, O, P, "θ")
s1 = Layer([cosL, dC], {lit: [cosL, dC], title: "cos θ: the x of the point"})
cosL = Seg(O, Q, {kind: "overlay", tone: "sky"})
dC = Dim(O, Q, "cos θ", {tone: "sky"})
s2 = Layer([sinL, dS], {lit: [sinL, dS], title: "sin θ: the y of the point"})
sinL = Seg(Q, P, {kind: "overlay", tone: "violet"})
dS = Dim(Q, P, "sin θ", {tone: "violet"})`,
    pass2: "",
  },
  cone: {
    title: "Cone in a cylinder (volume)",
    problem: "A cone fits exactly inside a cylinder of radius r and height h. Compare their volumes.",
    pass1: `// goal: the cone has the same base and height as the cylinder
// anchor: the cylinder
// layers: 1 the cone, 2 r and h
// budget: 15 statements
O = Pt(0, 0)
bot = Curve([Off(O, -2, 0), Off(O, 0, -0.6), Off(O, 2, 0), Off(O, 0, 0.6)], {closed: true, kind: "overlay"})
top = Curve([Off(O, -2, 5), Off(O, 0, 4.4), Off(O, 2, 5), Off(O, 0, 5.6)], {closed: true, kind: "overlay", fill: true})
sideL = Seg(Off(O, -2, 0), Off(O, -2, 5), {kind: "overlay"})
sideR = Seg(Off(O, 2, 0), Off(O, 2, 5), {kind: "overlay"})
cyl = Union([bot, top, sideL, sideR], {tone: "sky", layer: 2, legend: "cylinder: V = πr²h"})
s1 = Layer([cone], {lit: [cone], title: "The cone: same base, same height"})
cone = Poly([Off(O, -2, 0), Off(O, 2, 0), Off(O, 0, 5)], {kind: "overlay", fill: true, tone: "amber", layer: 2, legend: "cone: V = ⅓πr²h"})
s2 = Layer([rad, dr, dh], {title: "r and h"})
rad = Seg(O, Off(O, 2, 0), {kind: "overlay", tone: "ink"})
dr = Dim(O, Off(O, 2, 0), "r")
dh = Dim(Off(O, 2, 0), Off(O, 2, 5), "h")`,
    pass2: "",
  },
  graph: {
    title: "Weighted graph: shortest path",
    problem: "Find the shortest path from A to E in the weighted graph.",
    pass1: `// goal: the shortest path from A to E
// anchor: the weighted graph
// layers: 1 the path A C B D E
// budget: 25 statements
A = Pt(0, 0)
B = Pt(2.5, 1.6)
C = Pt(2.5, -1.6)
D = Pt(5, 1)
E = Pt(7, -0.4)
eAB = Seg(A, B, {kind: "overlay", tone: "muted", label: "4"})
eAC = Seg(A, C, {kind: "overlay", tone: "muted", label: "2"})
eCB = Seg(C, B, {kind: "overlay", tone: "muted", label: "1"})
eBD = Seg(B, D, {kind: "overlay", tone: "muted", label: "5"})
eCD = Seg(C, D, {kind: "overlay", tone: "muted", label: "8"})
eDE = Seg(D, E, {kind: "overlay", tone: "muted", label: "3"})
eCE = Seg(C, E, {kind: "overlay", tone: "muted", label: "10"})
nA = Circle(A, 0.42, {fill: true, tone: "sky", layer: 2, label: "A"})
nB = Circle(B, 0.42, {fill: true, tone: "sky", layer: 2, label: "B"})
nC = Circle(C, 0.42, {fill: true, tone: "sky", layer: 2, label: "C"})
nD = Circle(D, 0.42, {fill: true, tone: "sky", layer: 2, label: "D"})
nE = Circle(E, 0.42, {fill: true, tone: "sky", layer: 2, label: "E"})
s1 = Layer([p1, p2, p3, p4], {lit: [eAC, eCB, eBD, eDE, nA, nB, nC, nD, nE], title: "A, C, B, D, E: 2 + 1 + 5 + 3 = 11"})
p1 = Fix(eAC, {tone: "amber"})
p2 = Fix(eCB, {tone: "amber"})
p3 = Fix(eBD, {tone: "amber"})
p4 = Fix(eDE, {tone: "amber"})`,
    pass2: "",
  },
  bst: {
    title: "BST: insert 7",
    problem: "Insert 7 into the binary search tree 8, 3, 10, 1, 6, 14.",
    pass1: `// goal: where 7 goes in the tree
// anchor: the tree 8, 3, 10, 1, 6, 14
// layers: 1 left at 8, 2 right at 3, 3 right at 6, 4 insert 7
// budget: 25 statements
R = Pt(0, 0)
L = Pt(-2, -1.5)
Rr = Pt(2, -1.5)
LL = Pt(-3, -3)
LR = Pt(-1, -3)
RR = Pt(3, -3)
N = Pt(-0.3, -4.5)
e1 = Seg(R, L, {kind: "overlay", tone: "muted"})
e2 = Seg(R, Rr, {kind: "overlay", tone: "muted"})
e3 = Seg(L, LL, {kind: "overlay", tone: "muted"})
e4 = Seg(L, LR, {kind: "overlay", tone: "muted"})
e5 = Seg(Rr, RR, {kind: "overlay", tone: "muted"})
n8 = Circle(R, 0.45, {fill: true, tone: "sky", layer: 2, label: "8"})
n3 = Circle(L, 0.45, {fill: true, tone: "sky", layer: 2, label: "3"})
n10 = Circle(Rr, 0.45, {fill: true, tone: "sky", layer: 2, label: "10"})
n1 = Circle(LL, 0.45, {fill: true, tone: "sky", layer: 2, label: "1"})
n6 = Circle(LR, 0.45, {fill: true, tone: "sky", layer: 2, label: "6"})
n14 = Circle(RR, 0.45, {fill: true, tone: "sky", layer: 2, label: "14"})
s1 = Layer([], {lit: [n8, e1], title: "7 < 8: go left"})
s2 = Layer([], {lit: [n3, e4], title: "7 > 3: go right"})
s3 = Layer([], {lit: [n6], title: "7 > 6: go right; the spot is empty"})
s4 = Layer([e6, n7], {lit: [e6, n7], title: "7 becomes the right child of 6"})
e6 = Seg(Along(LR, N, 0.28), N, {kind: "overlay", tone: "amber"})
n7 = Circle(N, 0.45, {fill: true, tone: "amber", label: "7"})`,
    pass2: "",
  },
  projectile: {
    title: "Projectile: velocity components",
    problem: "A ball is launched over level ground. Show its velocity and the components along the path.",
    pass1: `// goal: vx stays, vy shrinks to 0 at the top
// anchor: the ground and the path
// layers: 1 launch velocity, 2 on the way up, 3 at the top
// budget: 15 statements
O = Pt(0, 0)
ground = Seg(Off(O, -0.5, 0), Off(O, 9, 0), {kind: "surface", tone: "muted"})
path = Curve([O, Pt(2, 2.4), Pt(4, 3.2), Pt(6, 2.4), Pt(8, 0)], {kind: "overlay", tone: "muted"})
range = Dim(O, Pt(8, 0), "range R")
s1 = Layer([v0], {lit: [v0], title: "Launch velocity v₀"})
v0 = Vec(O, Pt(1.2, 1.92), "v₀", {tone: "amber"})
s2 = Layer([ball, vx, vy], {lit: [ball, vx, vy], title: "On the way up: vx stays, vy shrinks"})
ball = Circle(Pt(2, 2.4), 0.2, {fill: true, tone: "ink"})
vx = Vec(Pt(2, 2.4), Pt(3.2, 2.4), "vx", {tone: "sky"})
vy = Vec(Pt(2, 2.4), Pt(2, 3.36), "vy", {tone: "violet"})
s3 = Layer([top, vt, g], {lit: [top, vt, g], title: "At the top: vy = 0, only g acts"})
top = Circle(Pt(4, 3.2), 0.2, {fill: true, tone: "ink"})
vt = Vec(Pt(4, 3.2), Pt(5.2, 3.2), "vx", {tone: "sky"})
g = Vec(Pt(4, 3.2), Pt(4, 2.1), "g", {tone: "pink"})`,
    pass2: "",
  },
  pendulum: {
    title: "Pendulum: forces",
    problem: "A pendulum of length L swings out to θ = 30°. Show the forces on the bob and split the weight.",
    pass1: `// goal: the two forces on the bob, then mg split
// anchor: the pivot, rope and bob at 30°
// layers: 1 tension and weight, 2 the split of mg
// budget: 15 statements
O = Pt(0, 0)
ceiling = Seg(Off(O, -2.5, 0), Off(O, 2.5, 0), {kind: "surface", tone: "muted"})
D = Off(O, 0, -5)
B = Rot(O, D, 30)
vert = Seg(O, D, {kind: "overlay", tone: "muted", layer: 3})
swing = Curve([Rot(O, D, -30), D, B], {kind: "overlay", tone: "muted", layer: 3})
rope = Seg(O, B, {kind: "overlay", tone: "ink", label: "L"})
th = Angle(D, O, B, "θ")
bob = Circle(B, 0.45, {fill: true, tone: "violet", layer: 2, legend: "bob, mass m"})
s1 = Layer([T, W], {lit: [T, W], title: "Two forces: tension and weight"})
T = Vec(B, Along(B, O, 0.35), "T", {tone: "amber"})
W = Vec(B, Off(B, 0, -1.8), "mg", {tone: "sky"})
s2 = Layer([Wr, Wt], {lit: [Wr, Wt], title: "Split mg along the rope and along the swing"})
Wr = Vec(B, Along(O, B, 1.3118), "mg cos θ", {tone: "cyan"})
Wt = Vec(B, Off(B, -0.78, -0.45), "mg sin θ", {tone: "pink"})`,
    pass2: "",
  },
  atwood: {
    title: "Atwood machine",
    problem: "Two masses hang over a pulley (m₂ > m₁). Show the forces and the acceleration.",
    pass1: `// goal: the forces on each mass and the shared acceleration
// anchor: the pulley with two hanging masses
// layers: 1 forces on m1, 2 forces on m2, 3 the acceleration
// budget: 20 statements
O = Pt(0, 0)
ceiling = Seg(Off(O, -2, 1.8), Off(O, 2, 1.8), {kind: "surface", tone: "muted"})
axle = Seg(Off(O, 0, 1.8), O, {kind: "overlay", tone: "muted"})
wheel = Circle(O, 0.8, {tone: "ink", legend: "pulley"})
ropeL = Seg(Off(O, -0.8, 0), Off(O, -0.8, -3), {tone: "muted"})
ropeR = Seg(Off(O, 0.8, 0), Off(O, 0.8, -1.5), {tone: "muted"})
m1 = Box(Off(O, -0.8, -3.5), 1, 1, 0, {fill: true, tone: "sky", layer: 2, label: "m₁"})
m2 = Box(Off(O, 0.8, -2.2), 1.1, 1.4, 0, {fill: true, tone: "violet", layer: 2, label: "m₂"})
s1 = Layer([T1, W1], {lit: [m1, T1, W1], title: "Forces on m₁"})
T1 = Vec(Off(O, -0.8, -3), Off(O, -0.8, -1.6), "T", {tone: "amber"})
W1 = Vec(Off(O, -0.8, -3.5), Off(O, -0.8, -5), "m₁g", {tone: "sky"})
s2 = Layer([T2, W2], {lit: [m2, T2, W2], title: "Forces on m₂: the same T, a bigger weight"})
T2 = Vec(Off(O, 0.8, -1.5), Off(O, 0.8, -0.5), "T", {tone: "amber"})
W2 = Vec(Off(O, 0.8, -2.2), Off(O, 0.8, -4.4), "m₂g", {tone: "violet"})
s3 = Layer([a1, a2], {lit: [a1, a2], title: "m₂ falls, m₁ rises: the same a"})
a1 = Vec(Off(O, -1.75, -4), Off(O, -1.75, -2.8), "a", {tone: "pink"})
a2 = Vec(Off(O, 1.8, -1.6), Off(O, 1.8, -2.8), "a", {tone: "pink"})`,
    pass2: "",
  },
  field: {
    title: "Electric field of a dipole",
    problem: "Sketch the electric field between a positive and a negative charge.",
    pass1: `// goal: field lines run from + to −, E is tangent
// anchor: the two charges
// layers: 1 the field lines, 2 E at a point
// budget: 20 statements
P = Pt(-2, 0)
N = Pt(2, 0)
plus = Circle(P, 0.38, {fill: true, tone: "pink", label: "+"})
minus = Circle(N, 0.38, {fill: true, tone: "sky", label: "−"})
s1 = Layer([mid, l1, l2, l3, l4, a0, a1, a2, a3, a4], {title: "Field lines leave + and end on −"})
mid = Seg(Off(P, 0.38, 0), Off(N, -0.38, 0), {kind: "overlay", tone: "muted"})
l1 = Curve([Off(P, 0.3, 0.25), Pt(-1, 1), Pt(0, 1.3), Pt(1, 1), Off(N, -0.3, 0.25)], {kind: "overlay", tone: "muted"})
l2 = Curve([Off(P, 0.12, 0.36), Pt(-1.6, 1.8), Pt(0, 2.7), Pt(1.6, 1.8), Off(N, -0.12, 0.36)], {kind: "overlay", tone: "muted"})
l3 = Curve([Off(P, 0.3, -0.25), Pt(-1, -1), Pt(0, -1.3), Pt(1, -1), Off(N, -0.3, -0.25)], {kind: "overlay", tone: "muted"})
l4 = Curve([Off(P, 0.12, -0.36), Pt(-1.6, -1.8), Pt(0, -2.7), Pt(1.6, -1.8), Off(N, -0.12, -0.36)], {kind: "overlay", tone: "muted"})
a0 = Vec(Pt(-0.35, 0), Pt(0.35, 0), "", {tone: "amber"})
a1 = Vec(Pt(-0.35, 1.3), Pt(0.35, 1.3), "", {tone: "amber"})
a2 = Vec(Pt(-0.35, 2.7), Pt(0.35, 2.7), "", {tone: "amber"})
a3 = Vec(Pt(-0.35, -1.3), Pt(0.35, -1.3), "", {tone: "amber"})
a4 = Vec(Pt(-0.35, -2.7), Pt(0.35, -2.7), "", {tone: "amber"})
s2 = Layer([X, E], {lit: [X, E], title: "At a point, E is tangent to the line"})
X = Circle(Pt(1, 1), 0.09, {kind: "overlay", fill: true, tone: "violet"})
E = Vec(Pt(1, 1), Pt(1.75, 0.45), "E", {tone: "violet"})`,
    pass2: "",
  },
  slit: {
    title: "Young's double slit",
    problem: "Light from one source passes two slits d apart and lands on a screen L away. Why do bright and dark fringes appear, and where is the bright fringe at P?",
    pass1: `// goal: why bright and dark fringes alternate
// anchor: source, barrier with two slits, screen
// layers: 1 circular waves, 2 the path difference, 3 the fringes
// budget: 30 statements
src = Circle(Pt(-2.2, 0), 0.22, {fill: true, tone: "amber", legend: "light source"})
top = Box(Pt(0, 1.95), 0.2, 2.1, 0, {fill: true, tone: "ink"})
midB = Box(Pt(0, 0), 0.2, 0.8, 0, {fill: true, tone: "ink"})
low = Box(Pt(0, -1.95), 0.2, 2.1, 0, {fill: true, tone: "ink"})
wall = Union([top, midB, low], {legend: "barrier with two slits"})
screen = Box(Pt(7, 0), 0.2, 6, 0, {fill: true, tone: "muted", layer: 2, legend: "screen"})
S1 = Pt(0.1, 0.6)
S2 = Pt(0.1, -0.6)
P = Pt(6.9, 2)
d = Dim(Pt(-0.1, 0.6), Pt(-0.1, -0.6), "d")
L = Dim(Pt(0, -3), Pt(6.9, -3), "L")
s1 = Layer([w1, w2, w3, w4, w5, w6], {title: "Each slit sends out circular waves"})
w1 = Curve([Rot(S1, Off(S1, 1, 0), -60), Off(S1, 1, 0), Rot(S1, Off(S1, 1, 0), 60)], {kind: "overlay", tone: "sky"})
w2 = Curve([Rot(S1, Off(S1, 2, 0), -60), Off(S1, 2, 0), Rot(S1, Off(S1, 2, 0), 60)], {kind: "overlay", tone: "sky"})
w3 = Curve([Rot(S1, Off(S1, 3, 0), -60), Off(S1, 3, 0), Rot(S1, Off(S1, 3, 0), 60)], {kind: "overlay", tone: "sky"})
w4 = Curve([Rot(S2, Off(S2, 1, 0), -60), Off(S2, 1, 0), Rot(S2, Off(S2, 1, 0), 60)], {kind: "overlay", tone: "cyan"})
w5 = Curve([Rot(S2, Off(S2, 2, 0), -60), Off(S2, 2, 0), Rot(S2, Off(S2, 2, 0), 60)], {kind: "overlay", tone: "cyan"})
w6 = Curve([Rot(S2, Off(S2, 3, 0), -60), Off(S2, 3, 0), Rot(S2, Off(S2, 3, 0), 60)], {kind: "overlay", tone: "cyan"})
s2 = Layer([r1, r2, axis, mp, th, kk, dl], {hide: [w1, w2, w3, w4, w5, w6], lit: [r1, r2, th, dl], title: "Two paths to P differ by Δ = d sin θ"})
r1 = Seg(S1, P, {kind: "overlay", tone: "sky"})
r2 = Seg(S2, P, {kind: "overlay", tone: "cyan"})
axis = Seg(Pt(0.1, 0), Pt(6.9, 0), {kind: "overlay", tone: "muted", layer: 3})
mp = Seg(Pt(0.1, 0), P, {kind: "overlay", tone: "muted", layer: 3})
th = Angle(Pt(6.9, 0), Pt(0.1, 0), P, "θ")
K = Foot(S1, S2, P)
kk = Seg(S1, K, {kind: "overlay", tone: "muted"})
dl = Seg(S2, K, {kind: "overlay", tone: "pink", label: "Δ = d sin θ"})
s3 = Layer([prof], {lit: [prof, P], title: "Bright where Δ = mλ, dark where Δ = (m + ½)λ"})
prof = Curve([Pt(8.1, -3.0), Pt(7.983, -2.875), Pt(7.7, -2.75), Pt(7.417, -2.625), Pt(7.3, -2.5), Pt(7.417, -2.375), Pt(7.7, -2.25), Pt(7.983, -2.125), Pt(8.1, -2.0), Pt(7.983, -1.875), Pt(7.7, -1.75), Pt(7.417, -1.625), Pt(7.3, -1.5), Pt(7.417, -1.375), Pt(7.7, -1.25), Pt(7.983, -1.125), Pt(8.1, -1.0), Pt(7.983, -0.875), Pt(7.7, -0.75), Pt(7.417, -0.625), Pt(7.3, -0.5), Pt(7.417, -0.375), Pt(7.7, -0.25), Pt(7.983, -0.125), Pt(8.1, 0.0), Pt(7.983, 0.125), Pt(7.7, 0.25), Pt(7.417, 0.375), Pt(7.3, 0.5), Pt(7.417, 0.625), Pt(7.7, 0.75), Pt(7.983, 0.875), Pt(8.1, 1.0), Pt(7.983, 1.125), Pt(7.7, 1.25), Pt(7.417, 1.375), Pt(7.3, 1.5), Pt(7.417, 1.625), Pt(7.7, 1.75), Pt(7.983, 1.875), Pt(8.1, 2.0), Pt(7.983, 2.125), Pt(7.7, 2.25), Pt(7.417, 2.375), Pt(7.3, 2.5), Pt(7.417, 2.625), Pt(7.7, 2.75), Pt(7.983, 2.875), Pt(8.1, 3.0)], {kind: "overlay", tone: "amber", legend: "brightness on the screen"})`,
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
