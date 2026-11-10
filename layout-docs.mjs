// layout-docs.mjs: the figure language's LLM docs (progressive disclosure: CORE goes in every prompt, the topics are served by a
// read_doc tool on demand) + the built-in scenes of the Figure Lab mockup. Data only, no imports. Every ``` example here and every
// scene except "broken" must evaluate with zero llm-class findings (tests/layout-core.test.mjs runs them all through evaluate()).
// The engine places and checks layout; the LLM owns the physics. Not a physics simulator.

// <gen figure-docs: do not edit, run node tools/client_generators/gen_figure_docs.mjs>
export const DOCS = [
  {"kind":"topic","id":"points","attrs":{"id":"points","title":"Points","use":"use when you place or derive points (midpoints, feet, rotations, intersections)"},"body":"Points (all computed by the engine, world units, y up):\n- Pt(x, y): a free point. The only kind a pass-2 Fix may move.\n- Mid(A, B): midpoint.\n- Along(A, B, t): A + t (B - A); t = 0.5 is the midpoint, t > 1 runs past B.\n- Off(P, dx, dy): P shifted by (dx, dy).\n- Foot(P, A, B): the foot of the perpendicular from P onto line AB (an altitude's foot).\n- Rot(O, P, deg): P turned about O by deg, counter-clockwise. Rot(P, Off(P, 0, 1), 30) is a unit normal of a 30 degree slope, set at P.\n- Meet(A, B, C, D): where line AB meets line CD. Parallel lines have no point: that is an error.\nDerive points from each other so a change to one anchor moves everything that hangs off it.\n```\nA = Pt(0, 0)\nB = Pt(6, 0)\nC = Pt(2, 4)\nM = Mid(A, B)\nH = Foot(C, A, B)\nT = Meet(A, Rot(A, B, 30), B, Off(B, 0, 1))\ntri = Poly([A, B, C], {kind: \"overlay\"})\nalt = Seg(C, H, {kind: \"overlay\", tone: \"violet\"})\n```"},
  {"kind":"topic","id":"shapes","attrs":{"id":"shapes","title":"Shapes","use":"use when you draw a body, line, box, polygon, circle, vector, label or angle"},"body":"Shapes (centre-based, world units):\n- Seg(A, B, opts?): a line (wire, rod, rope, ground). Thin: lines never conflict with each other.\n- Box(C, w, h, deg?, opts?): a w x h rectangle centred on C, turned deg counter-clockwise.\n- Poly([A, B, C, ...], opts?): a polygon (convex or not).\n- Circle(O, r, opts?).\n- Vec(A, B, label?, opts?): a vector arrow from A to B (force, velocity, current, pointer). Head at B.\n- Label(P, text, opts?): text centred on P when free, else moved nearby by the engine.\n- Angle(A, O, B, label?, opts?): an arc at O between rays OA and OB, with its label.\nA body resting on a slope: take a point P on the slope, the centre is P + normal * h/2:\n```\nA = Pt(0, 0)\nB = Pt(6, 0)\ntop = Meet(A, Rot(A, B, 25), B, Off(B, 0, 1))\nramp = Poly([A, B, top], {kind: \"surface\"})\nP = Along(A, top, 0.5)\nC = Rot(P, Off(P, 0, 0.5), 25)\nblk = Box(C, 1, 1, 25, {fill: true})\n```"},
  {"kind":"topic","id":"kinds","attrs":{"id":"kinds","title":"Kinds and findings","use":"use when you pick a kind (solid, surface, inside, overlay) or read a layout finding"},"body":"Kinds decide what the engine checks (layout only; never physics meaning):\n- solid (default for Seg Box Poly Circle): two solids may touch but not overlap beyond the tolerance (1% of the figure span).\n- surface: a one-sided floor, wall, ramp or face. Bodies rest on it; sinking in is an error. Vec heads may end inside it.\n- inside + in: id: stays inside its container (a Box, Poly or Circle); it may fill it exactly. Still solid against other shapes.\n- overlay: never checked. Use it for lines that join bodies (a tree edge centre to centre), construction lines, curves drawn over strips.\n- decor (Vec, Label, Angle, automatic): labels are never checked; a Vec is checked only at its head, against solids it does not start in.\nFindings come back as pairs ids [later, earlier]: the later line is blamed, with the amount and the push vector (where it must move).\nA dashed ghost shows where the later shape would have to go."},
  {"kind":"topic","id":"curves","attrs":{"id":"curves","title":"Curves and unions","use":"use when a part is organic or one object is made of several parts"},"body":"Curves and unions (organic parts: a beak, a horn, a tail, a lens, a field line). Prefer Box / Circle / Poly; reach for Curve only when a part is round or organic.\n- Curve([A, B, C, ...]): a smooth curve through every point (centripetal Catmull-Rom). The drawn curve and the checked outline are the same polyline.\n- closed: true closes it into a blob (an area: it collides, it can be filled, a label can sit inside).\n- w: 0.3 (a stroke 0.3 wide) or w: [0.4, 0.05] (tapered from 0.4 to 0.05, round ends): a horn, a beak, a tail, a neck. Open curves only.\n- mirror: [P, Q] adds the mirror image of the points across line PQ, joined at the axis: give half a symmetric outline.\n- An open Curve without w is a thin line (a path, a trajectory, a ripple): lines never conflict with lines.\n- A curve that crosses itself is an error: move a point, or make the stroke thinner at a tight bend.\n- Union([a, b, c], opts?): one object made of parts. Parts collide with OTHER objects, never with each other. The Union's legend / label name the whole group; its kind, tone, shade, fill fill in what a part leaves out (a part's own opts win).\nBuild organic things like a human in Canva: the prefix holds rough blocks, a Layer swaps them for the detailed parts.\n```\nG = Pt(0, 0)\nground = Seg(Off(G, -4, 0), Off(G, 4, 0), {kind: \"surface\", tone: \"muted\"})\ncube = Box(Off(G, 0, 2), 4, 4, 0)\ns1 = Layer([f1], {title: \"The cube\"})\nf1 = Fix(cube, {tone: \"amber\", fill: true})\ns2 = Layer([horn, beast], {lit: [horn], zoom: [horn], title: \"Add a horn\"})\nhorn = Curve([Off(G, -0.6, 4), Off(G, -0.3, 5), Off(G, 0.6, 5.9)], {w: [0.9, 0.05], fill: true, tone: \"violet\"})\nbeast = Union([cube, horn], {legend: \"horned cube\"})\n```\nSymmetric lens with mirror (half the outline, mirrored across the vertical through O):\n```\nO = Pt(0, 0)\nlens = Curve([Off(O, 0, 2.5), Off(O, 0.4, 0), Off(O, 0, -2.5)], {closed: true, mirror: [O, Off(O, 0, 1)], fill: true, tone: \"sky\", shade: 3})\n```"},
  {"kind":"topic","id":"legend","attrs":{"id":"legend","title":"Legend and labels","use":"use when an object needs a name or a short symbol or value"},"body":"Legend: names of objects go under the drawing, beside a small render of the object itself (not a colour swatch).\n- legend: \"elephant\" on a shape (or on a Union: the render shows every part). Use it for what an object IS: elephant, students, oil, lens.\n- label: \"m\" is for a short symbol or value ON the object (m, 2 Ω, A). The engine puts it inside the shape when it fits, else right beside it.\n- A label with no room inside or right next to its anchor (it would cross a line, a filled body or another label) moves to the legend by itself: the feedback says \"moved to legend\". No leader lines are drawn.\n```\nG = Pt(0, 0)\nfloor = Seg(Off(G, -3, 0), Off(G, 3, 0), {kind: \"surface\", tone: \"muted\"})\ncrate = Box(Off(G, -1.2, 0.6), 1.2, 1.2, 0, {fill: true, tone: \"sky\", label: \"m\", legend: \"crate\"})\nbody = Circle(Off(G, 1.4, 0.9), 0.9, {fill: true})\near = Circle(Off(G, 2.3, 1.5), 0.4, {fill: true})\ncat = Union([body, ear], {tone: \"muted\", legend: \"cat\"})\n```"},
  {"kind":"topic","id":"dim","attrs":{"id":"dim","title":"Dimensions","use":"use when you show a length, radius, height or distance"},"body":"Dim(A, B, text, opts?): a dimension line for the length AB: drawn beside AB on the outside of the figure, with a tick at each end and the text centred along it (or just beside it when the line is short).\n- The engine tries the outside, then the other side, then further out; if no spot is free the text moves to the legend.\n- A and B can be any points: Dim(Off(O, 0, 0), Off(O, 4, 0), \"4 m\") under a body, Dim(Foot(C, A, B), C, \"h\") for a height.\n- Use Dim for lengths, radii, distances and heights. Never a loose Label for a length.\n```\nA = Pt(0, 0)\nB = Pt(5, 0)\nC = Pt(1.5, 3)\ntri = Poly([A, B, C], {kind: \"overlay\", tone: \"ink\"})\nH = Foot(C, A, B)\nalt = Seg(C, H, {kind: \"overlay\", tone: \"violet\"})\nb = Dim(A, B, \"b = 5 cm\")\nh = Dim(H, C, \"h = 3 cm\", {tone: \"violet\"})\n```"},
  {"kind":"topic","id":"layers","attrs":{"id":"layers","title":"Steps and layers","use":"use when the drawing needs ordered reasoning steps"},"body":"Layers stack steps, like Photoshop layers that cannot be switched off in the middle (linear, no branches).\n- Plan first: // goal, // anchor, // layers: 1 <idea>, 2 <idea>, // budget: N statements. The engine compares the plan with what is drawn.\n- One layer = one reasoning step that changes what the student looks at; pure algebra stays in the text. 2-4 layers, at most 6.\n- HINT mode stops before the answer layer; EXPLAIN includes it.\n- The prefix = every line before the first Layer: the anchor's rough blocks only, drawn as a blueprint.\n- sN = Layer([ids...], opts) adds those statements (and every line written after it, until the next Layer) on top of all before it.\n- hide: [ids] hides earlier shapes from this step on (swap a rough block for its detailed parts).\n- lit: [ids] = where to look: the rest of the figure turns pale. zoom: [ids] = the camera fits those shapes for this step.\n- title: \"...\" = one short line for the step. A Fix listed in a Layer restyles from that step on (step 1 tone amber).\n- Checks: each step's new shapes are checked against everything shown with them; shapes never shown together never conflict.\n```\n// goal: why the block stays put, then what a push adds\n// anchor: a block on the floor\n// layers: 1 weight and normal force, 2 the push\n// budget: 8 statements\nO = Pt(0, 0)\nfloor = Seg(Off(O, -3, 0), Off(O, 3, 0), {kind: \"surface\", tone: \"muted\"})\nblk = Box(Off(O, 0, 0.75), 1.5, 1.5, 0, {fill: true, tone: \"muted\"})\ns1 = Layer([W, N], {lit: [W, N], title: \"Two forces\"})\nW = Vec(Off(O, 0, 0.75), Off(O, 0, -1), \"W\", {tone: \"sky\"})\nN = Vec(Off(O, 0, 0.75), Off(O, 0, 2.5), \"N\", {tone: \"amber\"})\ns2 = Layer([F], {lit: [F], zoom: [blk, F], title: \"Push it\"})\nF = Vec(Off(O, -2.6, 0.75), Off(O, -0.75, 0.75), \"F\", {tone: \"violet\"})\n```"},
  {"kind":"topic","id":"pass2","attrs":{"id":"pass2","title":"Reviews and Fix","use":"use when you answer a review or patch a point or shape"},"body":"Reviews (pass 2) append lines; they never delete.\n- Fix a free point or a shape's own traits with a PATCH holding only what changes:\n  f1 = Fix(C, {x: 1.2})            moves Pt C, and everything derived from it follows\n  f2 = Fix(blk, {w: 1.4, deg: 30}) Box traits w h deg; Circle r; Label text; Vec and Angle label; any shape's opts keys\n- Fix on a derived point (Mid Along Off Foot Rot Meet) is an error: fix its free source Pt instead.\n- New statements may be added (new ids). Redefining an old id is an error; to delete or restructure, rewrite pass 1.\n- After a review everything is evaluated and checked again.\nReview 1 = geometry: answer each finding with a Fix (use the ghost target). Reviews 2 and 3 = meaning: add or adjust what the scene shows.\nIf nothing needs changing, reply with the single line: // ok"},
  {"kind":"topic","id":"colors","attrs":{"id":"colors","title":"Colors and shade","use":"use when you pick a tone, shade or fill"},"body":"Colors: palette hues only, one hue per quantity, kept across the figure and the text.\ntone: sky amber orange violet pink cyan (quantities), ink (structure), muted (context, surfaces, wires). No green, no red.\nshade: 1 = asked (the unknown), 2 = given, 3 = implied or context. fill: true fills an area shape (a face, a liquid).\nVec and Label without a tone get their own hue automatically; structure without a tone is ink.\n```\nO = Pt(0, 0)\nv = Vec(O, Pt(3, 0), \"v\", {tone: \"sky\", shade: 2})\na = Vec(O, Pt(0, 2), \"a = ?\", {tone: \"amber\", shade: 1})\n```"},
  {"kind":"example","id":"ex-physics","attrs":{"id":"ex-physics","topic":"physics","tags":"lever,pulley,forces","title":"Physics: lever and pulley","use":"use when the problem is forces, a lever, a pulley or a hanging mass"},"body":"Lever on a fulcrum, loads on both ends:\n```\nG = Pt(0, 0)\nground = Seg(Off(G, -5, 0), Off(G, 5, 0), {kind: \"surface\", tone: \"muted\"})\nfulcrum = Poly([Off(G, -0.6, 0), Off(G, 0.6, 0), Off(G, 0, 1)], {fill: true, tone: \"muted\"})\nbeam = Box(Off(G, 0, 1.15), 8, 0.3, 0, {tone: \"ink\"})\nm1 = Box(Off(G, -3.2, 1.8), 1, 1, 0, {fill: true, tone: \"sky\", label: \"m₁\"})\nm2 = Box(Off(G, 3.4, 1.7), 0.8, 0.8, 0, {fill: true, tone: \"amber\", label: \"m₂\"})\nW1 = Vec(Off(G, -3.2, 1.8), Off(G, -3.2, -0.4), \"m₁g\", {tone: \"sky\"})\nW2 = Vec(Off(G, 3.4, 1.7), Off(G, 3.4, 0.2), \"m₂g\", {tone: \"amber\"})\nd1 = Label(Off(G, -1.6, 0.5), \"d₁\", {tone: \"ink\"})\n```\nPulley from a ceiling, rope over the wheel, a hanging mass:\n```\nO = Pt(0, 0)\nceiling = Seg(Off(O, -2, 2), Off(O, 2, 2), {kind: \"surface\", tone: \"muted\"})\naxle = Seg(Off(O, 0, 2), O, {kind: \"overlay\", tone: \"muted\"})\nwheel = Circle(O, 0.8, {tone: \"ink\"})\nropeL = Seg(Off(O, -0.8, 0), Off(O, -0.8, -3), {tone: \"muted\"})\nropeR = Seg(Off(O, 0.8, 0), Off(O, 0.8, -2), {tone: \"muted\"})\nmass = Box(Off(O, 0.8, -2.5), 1, 1, 0, {fill: true, tone: \"violet\", label: \"m\"})\nT = Vec(Off(O, -0.8, -3), Off(O, -0.8, -1.6), \"T\", {tone: \"cyan\"})\nW = Vec(Off(O, 0.8, -2.5), Off(O, 0.8, -4.2), \"mg\", {tone: \"violet\"})\n```"},
  {"kind":"example","id":"ex-calc","attrs":{"id":"ex-calc","topic":"calc","tags":"riemann,tangent,area","title":"Calculus: Riemann strips and tangent","use":"use when the problem is an area under a curve or a tangent line"},"body":"Riemann strips under a curve (strips solid and touching, the curve drawn over them as overlay):\n```\nO = Pt(0, 0)\nxAxis = Seg(O, Off(O, 6, 0), {tone: \"muted\"})\nyAxis = Seg(O, Off(O, 0, 4), {tone: \"muted\"})\ns1 = Box(Off(O, 1.5, 0.5), 1, 1, 0, {fill: true, tone: \"sky\", shade: 3})\ns2 = Box(Off(O, 2.5, 0.9), 1, 1.8, 0, {fill: true, tone: \"sky\", shade: 3})\ns3 = Box(Off(O, 3.5, 1.4), 1, 2.8, 0, {fill: true, tone: \"sky\", shade: 3})\ncurve = Poly([Off(O, 1, 0.6), Off(O, 2, 1.3), Off(O, 3, 2.3), Off(O, 4, 3.4), Off(O, 4, 0), Off(O, 1, 0)], {kind: \"overlay\", tone: \"amber\"})\nlab = Label(Off(O, 5, 3.5), \"f(x)\", {tone: \"amber\"})\ndx = Label(Off(O, 2.5, -0.5), \"Δx\", {tone: \"sky\"})\n```\nTangent line at a point of a curve:\n```\nP = Pt(2, 2)\nc1 = Seg(Pt(0, 0.2), Pt(1, 1), {tone: \"ink\"})\nc2 = Seg(Pt(1, 1), P, {tone: \"ink\"})\nc3 = Seg(P, Pt(3, 3.4), {tone: \"ink\"})\ntan = Seg(Along(P, Pt(3, 3.2), -1.5), Along(P, Pt(3, 3.2), 1.5), {kind: \"overlay\", tone: \"amber\"})\ndot = Circle(P, 0.08, {kind: \"overlay\", fill: true, tone: \"amber\"})\nlab = Label(Off(P, 0.6, -0.3), \"slope = f'(a)\", {tone: \"amber\"})\n```"},
  {"kind":"example","id":"ex-geometry","attrs":{"id":"ex-geometry","topic":"geometry","tags":"triangle,altitude,incircle","title":"Geometry: altitude and incircle","use":"use when the problem is a triangle, an altitude or an inscribed circle"},"body":"Right triangle with the altitude to the hypotenuse (Foot) and the inscribed circle (inside):\n```\nA = Pt(0, 0)\nB = Pt(4, 0)\nC = Pt(0, 3)\ntri = Poly([A, B, C], {kind: \"overlay\", tone: \"ink\"})\nH = Foot(A, B, C)\nalt = Seg(A, H, {kind: \"overlay\", tone: \"violet\", label: \"h\"})\nI = Pt(1, 1)\ninc = Circle(I, 1, {kind: \"inside\", in: tri, tone: \"sky\"})\nrA = Angle(B, A, C, \"90°\")\nlA = Label(Off(A, -0.3, -0.3), \"A\")\nlB = Label(Off(B, 0.3, -0.3), \"B\")\nlC = Label(Off(C, -0.3, 0.3), \"C\")\n```"},
  {"kind":"example","id":"ex-cs","attrs":{"id":"ex-cs","topic":"cs","tags":"array,pointer,binary-tree","title":"CS: array pointer and binary tree","use":"use when the problem is an array with a pointer or a binary tree"},"body":"An array with a pointer, then a binary tree (edges as overlay so they may end at the node centres):\n```\nO = Pt(0, 0)\na0 = Box(Off(O, 0.5, 0), 1, 1, 0, {label: \"3\"})\na1 = Box(Off(O, 1.5, 0), 1, 1, 0, {label: \"8\"})\na2 = Box(Off(O, 2.5, 0), 1, 1, 0, {fill: true, tone: \"amber\", shade: 2, label: \"5\"})\na3 = Box(Off(O, 3.5, 0), 1, 1, 0, {label: \"1\"})\nptr = Vec(Off(O, 2.5, 2), Off(O, 2.5, 0.5), \"i\", {tone: \"amber\"})\n```\n```\nR = Pt(0, 0)\nL = Pt(-2, -1.6)\nRr = Pt(2, -1.6)\nLL = Pt(-3, -3.2)\ne1 = Seg(R, L, {kind: \"overlay\", tone: \"muted\"})\ne2 = Seg(R, Rr, {kind: \"overlay\", tone: \"muted\"})\ne3 = Seg(L, LL, {kind: \"overlay\", tone: \"muted\"})\nn0 = Circle(R, 0.5, {fill: true, tone: \"sky\", label: \"8\"})\nn1 = Circle(L, 0.5, {fill: true, tone: \"sky\", shade: 2, label: \"3\"})\nn2 = Circle(Rr, 0.5, {fill: true, tone: \"sky\", shade: 2, label: \"10\"})\nn3 = Circle(LL, 0.5, {fill: true, tone: \"sky\", shade: 3, label: \"1\"})\n```"},
  {"kind":"example","id":"ex-chem","attrs":{"id":"ex-chem","topic":"chem","tags":"beaker,liquid,volume","title":"Chemistry: beaker of liquid","use":"use when the problem is a container holding a liquid"},"body":"A beaker of liquid: glass walls as surfaces, the inner space as an overlay container, the liquid inside it:\n```\nB0 = Pt(0, 0)\nB1 = Off(B0, 4, 0)\nT0 = Off(B0, 0, 5)\nT1 = Off(B1, 0, 5)\nspace = Poly([B0, B1, T1, T0], {kind: \"overlay\", tone: \"muted\", shade: 3})\nwl = Seg(B0, T0, {kind: \"surface\", tone: \"ink\"})\nwb = Seg(B0, B1, {kind: \"surface\", tone: \"ink\"})\nwr = Seg(B1, T1, {kind: \"surface\", tone: \"ink\"})\nliquid = Poly([B0, B1, Off(B1, 0, 3), Off(B0, 0, 3)], {kind: \"inside\", in: space, fill: true, tone: \"sky\", shade: 2, label: \"water\"})\nmark = Seg(Off(B1, -0.6, 3), Off(B1, 0, 3), {kind: \"overlay\", tone: \"muted\"})\nvol = Label(Off(B1, 1.2, 3), \"250 mL\", {tone: \"sky\"})\n```"},
  {"kind":"example","id":"ex-area-tangent","attrs":{"id":"ex-area-tangent","topic":"math","tags":"curve,tangent,area,slope","title":"Area under a curve and the tangent at P","use":"use when the problem asks for a slope at a point or the area under a curve","inline":"1","more":"ex-unit-circle ex-riemann"},"body":"A smooth curve y = f(x) with a point P on it, the tangent at P, and the area under f from x = a to x = b shaded.\n```\n// goal: read the slope at P and the area under f between a and b\n// anchor: the curve y = f(x) above the x axis\n// layers: 1 the curve and P, 2 the tangent at P, 3 the shaded area\n// budget: 20 statements\nO = Pt(0, 0)  // one free origin: every axis point is derived from it\nxAxis = Seg(O, Off(O, 6, 0), {tone: \"muted\"})  // x axis: muted context, so it never competes with f\nyAxis = Seg(O, Off(O, 0, 4), {tone: \"muted\"})  // y axis: same muted stroke, one hue for structure\nA = Pt(1, 0)  // a is a free anchor: the area, the Dim and f all hang off it\nB = Pt(5, 0)  // b is free too, so b - a is one span a Fix can move\ns1 = Layer([f, dotP], {title: \"The curve and P\"})  // step 1 adds the curve and the point; a Layer is one reasoning step\nT1 = Off(A, 0, 0.6)  // f at a: Off A, not a raw Pt, so moving a drags the curve with it\nT2 = Off(A, 1, 1.1)  // next sample: one unit right, height off the same anchor\nP = Off(A, 2, 1.5)  // P is a control point of f, so it lies on the curve exactly\nT4 = Off(A, 3, 2.1)  // sample after P: keeps the rise smooth, no extra anchor\nT5 = Off(A, 4, 2.8)  // f at b: last control point, again derived from A\nf = Curve([T1, T2, P, T4, T5], {tone: \"amber\"})  // open Curve is a thin line: it never collides with the area\ndotP = Circle(P, 0.07, {kind: \"overlay\", fill: true, tone: \"violet\"})  // a dot at P is a helper mark, so overlay, never solid\ns2 = Layer([tan], {title: \"The tangent at P\"})  // step 2 adds one construction line on top of step 1\nQ = Off(P, 1, 0.5)  // tangent direction: slope 0.5 as a step from P, no raw Pt\ntan = Seg(Along(P, Q, -1.3), Along(P, Q, 1.3), {kind: \"overlay\", tone: \"violet\"})  // Along both ways keeps the line centred on P; overlay because a tangent is a helper line over the area\ns3 = Layer([area], {title: \"The shaded area\"})  // step 3 adds the region: the step that answers the area question\narea = Poly([A, T1, T2, P, T4, T5, B], {fill: true, tone: \"sky\", shade: 3})  // a real region stays solid, not overlay; shade 3 = context\ndim = Dim(A, B, \"b - a\", {tone: \"muted\"})  // Dim, not a Label: a width gets ticks and sits outside; written last, so the later line yields to the shapes already there\nlab = Label(Off(T5, 0.25, 0.2), \"f(x)\", {tone: \"amber\"})  // symbol only: f(x), never a value the student must find\n```"},
  {"kind":"example","id":"ex-unit-circle","attrs":{"id":"ex-unit-circle","topic":"math","tags":"unit circle,sin,cos,right triangle","title":"Math: unit circle, sin and cos","use":"use when the problem is the unit circle, or cos and sin as the coordinates of a point"},"body":"The unit circle with the angle θ at the centre O and the point P on the circle; the cos leg lies on the x-axis, and the sin leg stands on it at the foot.\n```\n// goal: read cos θ and sin θ as the two coordinates of P on the unit circle\n// anchor: the unit circle, its centre O and the point P at θ\n// layers: 1 the circle and P, 2 the sin leg, 3 the cos leg\nO = Pt(0, 0)  // the centre: the one free anchor, and the only point a review may move\nxAx = Seg(Off(O, -1.15, 0), Off(O, 1.15, 0), {kind: \"overlay\", tone: \"muted\", shade: 3})  // the x-axis: a helper line through the centre, overlay because it is construction, not a body\nyAx = Seg(Off(O, 0, -1.15), Off(O, 0, 1.15), {kind: \"overlay\", tone: \"muted\", shade: 3})  // the y-axis: the same helper role as xAx, so overlay and muted too\nR = Off(O, 1, 0)  // the radius direction: Off, not a raw Pt, so R stays exactly one unit from O\ns1 = Layer([circ, rad, dot, th], {lit: [circ, rad, dot, th], title: \"The circle and the point P\"})  // one layer is one reasoning step: the given circle and point first, so every later leg is read against them\ncirc = Circle(O, 1, {tone: \"ink\", shade: 2, legend: \"unit circle\"})  // the unit circle is the real object, so it keeps the default solid kind; fill off draws only its outline, and the legend names the object itself, not a colour key\nP = Rot(O, R, 35)  // P at θ: Rot, not a raw Pt, so changing the angle turns P and every leg that hangs off it\nrad = Seg(O, P, {kind: \"overlay\", tone: \"ink\", shade: 2, label: \"1\"})  // the radius OP: an overlay construction line; label \"1\" is the given unit radius, not an answer\ndot = Circle(P, 0.06, {kind: \"overlay\", fill: true, tone: \"ink\"})  // a marker at P: overlay because a point mark is not a body\nth = Angle(R, O, P, \"θ\")  // the angle at O: Angle, not a text Label, so the arc marks exactly the angle between OR and OP\ns2 = Layer([sinL, rt1, rt2, dS], {lit: [sinL, rt1, rt2, dS], title: \"sin θ: the height of P\"})  // one reasoning step: drop the perpendicular, and sin θ appears as the height\nQ = Foot(P, O, R)  // the foot on the x-axis: Foot, not a raw Pt, so it stays under P when θ changes\nsinL = Seg(Q, P, {kind: \"overlay\", tone: \"violet\"})  // the sin leg: the vertical rise Q to P; overlay because it is a construction mark on the disc, and a plain Seg because dS carries the measure\nrt1 = Seg(Off(Q, -0.09, 0), Off(Q, -0.09, 0.09), {kind: \"overlay\", tone: \"muted\"})  // one side of the right-angle square at Q: a helper mark, overlay because it is construction, not a body\nrt2 = Seg(Off(Q, -0.09, 0.09), Off(Q, 0, 0.09), {kind: \"overlay\", tone: \"muted\"})  // the other side of the square: with the two legs it closes the right angle at the foot\ndS = Dim(Q, P, \"sin θ\", {tone: \"violet\"})  // sin θ as a length: Dim, not a Label, because Dim draws the measure beside the leg with a tick at each end\ns3 = Layer([cosL, dC], {lit: [cosL, dC], title: \"cos θ: the run to the foot\"})  // the last reasoning step: the horizontal leg, the second coordinate of P\ncosL = Seg(O, Q, {kind: \"overlay\", tone: \"sky\"})  // the cos leg: the run O to Q, drawn after Q exists, so the later line is placed against the earlier foot\ndC = Dim(O, Q, \"cos θ\", {tone: \"sky\"})  // cos θ as a length: Dim, not a Label, so the dimension line carries the measure outside the triangle\n```"},
  {"kind":"example","id":"ex-riemann","attrs":{"id":"ex-riemann","topic":"calc","tags":"riemann,left endpoint,rectangles,area","title":"Calculus: four left-endpoint rectangles","use":"use when the problem estimates an area under a curve with left-endpoint rectangles"},"body":"A curve y = f(x) over the interval from a to b, with four left-endpoint rectangles under it; each rectangle has its top-left corner on the curve, so its height is f at the left edge of its strip.\n```\n// goal: the area under f estimated by four left-endpoint rectangles\n// anchor: the interval a to b on the x-axis\n// layers: 1 the curve, 2 the rectangles, 3 the sum they stand for\n// budget: 22 statements\nA = Pt(0, 0)                    // a: the left end of [a, b]; a free anchor, so every strip below follows if a moves\nB = Pt(4, 0)                    // b: the right end; the second and last raw Pt, every other point is derived from these two\nX1 = Along(A, B, 0.25)          // first grid line: Along keeps it on AB, so re-placing B re-spaces all four strips at once\nX2 = Along(A, B, 0.5)           // second grid line: derived, never a retyped coordinate that could drift off AB\nX3 = Along(A, B, 0.75)          // third grid line: a derived point is what lets the strips stay equal in width\naxis = Seg(A, B, {tone: \"muted\"})   // the strip floor: a thin line, and lines never conflict with lines, so no kind is needed\ns1 = Layer([curve, fLab], {title: \"The curve y = f(x)\"})   // step 1: the function alone, because every strip height is read off it\nC0 = Off(A, 0, 0.6)             // f(a): the given height at the left end; Off climbs from the axis point instead of a new raw Pt\nC1 = Off(X1, 0, 1)              // f at grid line 1: the second strip's top-left corner, so this point supplies the height that strip copies\nC2 = Off(X2, 0, 1.6)            // f at grid line 2: the third strip's corner, and the point the sum label hangs above\nC3 = Off(X3, 0, 2.4)            // f at grid line 3: the fourth strip's top-left corner, so it must sit on the curve\nC4 = Off(B, 0, 3.4)             // f(b): the curve is sampled at the right end too, so it spans the whole interval\ncurve = Curve([C0, C1, C2, C3, C4], {kind: \"overlay\", tone: \"amber\"})   // overlay: a curve drawn over strips is the documented use; it is never checked, so grazing their corners is no conflict\nfLab = Label(Off(C4, 0.5, 0.15), \"f(x)\", {tone: \"amber\", shade: 2})   // a short symbol on the curve, given so shade 2: a Label is decor, never checked against the strips\ns2 = Layer([r1, r2, r3, r4, dx], {title: \"Four left-endpoint rectangles\"})   // step 2: the estimate; the strips arrive together with the width that defines them\nr1 = Box(Off(Mid(A, X1), 0, 0.3), 1, 0.6, 0, {fill: true, tone: \"sky\", shade: 2})   // centre = base midpoint + h/2, so the bottom edge rests on the axis; w = Δx and h = f(x0), so the top-left corner is C0\nr2 = Box(Off(Mid(X1, X2), 0, 0.5), 1, 1, 0, {fill: true, tone: \"sky\", shade: 2})    // each height is that strip's own left-end value, so its top-left corner stays on C1\nr3 = Box(Off(Mid(X2, X3), 0, 0.8), 1, 1.6, 0, {fill: true, tone: \"sky\", shade: 2})  // taller strips are not scaled copies: each is built from its own grid point and height\nr4 = Box(Off(Mid(X3, B), 0, 1.2), 1, 2.4, 0, {fill: true, tone: \"sky\", shade: 2})   // the last strip ends at b, and its top-left corner is C3, the point the curve passes through\ndx = Dim(A, X1, \"Δx\", {tone: \"sky\"})   // a width is measured, so Dim draws the ticks and the text; a loose Label would float and measure nothing\ns3 = Layer([sum], {lit: [sum], title: \"Add the four areas\"})   // step 3: the total; lit makes the rest pale so the eye lands on the named quantity\nsum = Label(Off(C2, 0, 1.6), \"Σ f(xᵢ) Δx\", {tone: \"violet\", shade: 1})   // a symbol for the unknown total, not a number; shade 1 marks it asked, and it sits in the free air above the curve\n```"},
  {"kind":"example","id":"ex-ladder","attrs":{"id":"ex-ladder","topic":"calc","tags":"related rates,ladder,sliding","title":"Calculus: the sliding ladder","use":"use when a ladder slides down a wall and its foot distance, height and angle are related"},"body":"A ladder leans across the corner between a wall and the ground. The foot distance x and the height y are dimensions; the angle sits at the foot, between the ground and the ladder.\n```\n// goal: see the sliding ladder as x, y and the angle between the ground and the ladder\n// anchor: the corner where the wall meets the ground\n// layers: 1 wall, ground, ladder, 2 the two dimensions, 3 the angle at the foot\n// budget: 12 statements\nO = Pt(0, 0)  // the one free anchor: the corner; every other point is derived from it, so the whole scene moves as one\nground = Seg(O, Off(O, 7, 0), {kind: \"surface\", tone: \"muted\"})  // the floor: Off derives its far end from O instead of a second raw Pt; surface, not overlay, because it is really a floor and nothing may be drawn sunk into it\nwall = Seg(O, Off(O, 0, 5), {kind: \"surface\", tone: \"muted\"})  // the same line stood up: a one-sided wall the ladder top rests on; muted because a surface is context, not a quantity\ns1 = Layer([ground, wall, ladder], {title: \"The ladder\"})  // step 1 is the whole scene at once: a Layer is one reasoning step, and the prefix keeps only the bare anchor\nF = Along(O, Off(O, 7, 0), 0.6)  // the foot is a fraction Along the ground, not a raw Pt, so it stays on the floor if O or the ground changes\nT = Along(O, Off(O, 0, 5), 0.72)  // the top is a fraction Along the wall, so it stays exactly on the wall whatever the wall height; a Rot or a guess by eye would leave the line\nladder = Seg(F, T, {tone: \"ink\"})  // the rod itself: a real body, so solid and never overlay; thin lines do not conflict with each other, so it may share its two ends with the wall and the ground\ns2 = Layer([dx, dy], {lit: [dx, dy], title: \"The two distances\"})  // step 2 adds only the two lengths: one layer per reasoning step keeps each thing to look at separate\ndx = Dim(O, F, \"x\", {tone: \"sky\", shade: 2})  // Dim, not a Label: a length gets a tick at each end and sits outside the figure, while a loose Label would float with no ends; shade 2 = given at this instant\ndy = Dim(T, O, \"y\", {tone: \"violet\", shade: 2})  // a height is still a Dim, measured from the top down to the corner; the engine places it outside the figure, away from the ladder\ns3 = Layer([ang], {lit: [ang], title: \"The angle at the foot\"})  // step 3 adds one idea: the angle, read after the ground and the lengths are already on the page\nang = Angle(O, F, T, \"θ\", {tone: \"amber\", shade: 3})  // Angle with the vertex in the middle: the rays are FO (the ground) and FT (the ladder); shade 3 = context, implied by the two lengths\n```"},
  {"kind":"example","id":"ex-cone-in-cylinder","attrs":{"id":"ex-cone-in-cylinder","topic":"geometry","tags":"cone,cylinder,inscribed,dimensions","title":"Geometry: cone in a cylinder","use":"use when a cone sits exactly inside a cylinder and you compare their volumes"},"body":"A cone inscribed in a cylinder, seen from the side: the cylinder is a rectangle with an ellipse at each rim, and the cone shares the base and the top centre.\nThe cylinder is a real body (solid); its rims are construction lines drawn over it (overlay); the cone is the body contained by it (inside), so the engine checks both the fit and the overlap.\n```\n// goal: the cone shares the cylinder's base and height, so the volume ratio is the question\n// anchor: the cylinder's base centre\n// layers: 1 the cylinder outline, 2 the cone inside it, 3 r and h\n// budget: 20 statements\nO = Pt(0, 0)  // the one raw anchor: every other point is Off/Along from O, so a change of r or h moves the whole figure\nBL = Off(O, -2, 0)  // bottom-left corner derived from O: a second raw Pt would not follow the anchor\nBR = Off(O, 2, 0)  // bottom-right corner: the base radius is read from O, never typed twice\nTL = Off(BL, 0, 5)  // top-left lifted straight up: Off keeps the wall vertical instead of guessing a Meet\nTR = Off(BR, 0, 5)  // top-right lifted by the same 5, so the walls stay parallel and equal\ns1 = Layer([cyl, bot, top], {title: \"The cylinder: rectangle and two rims\"})  // step 1 draws the outline only, before the cone is discussed\ncyl = Poly([BL, BR, TR, TL], {kind: \"solid\", tone: \"muted\", shade: 3})  // solid, not overlay: the cylinder is a real body, and a solid container is what makes the cone's inside test bite\nbot = Curve([BL, Off(O, 0, -0.6), BR, Off(O, 0, 0.6)], {closed: true, kind: \"overlay\", tone: \"muted\"})  // bottom rim as a closed Curve: a side-view circle is an ellipse; overlay, because a face line drawn across the body is not a second body\ntop = Curve([TL, Off(O, 0, 4.4), TR, Off(O, 0, 5.6)], {closed: true, kind: \"overlay\", tone: \"muted\"})  // top rim built from TL/TR so it rises with the corners; overlay for the same reason, closed so it reads as one face\ntube = Union([cyl, bot, top], {legend: \"cylinder\"})  // Union, not three loose shapes: the parts are one cylinder, and parts never conflict with each other\ns2 = Layer([cone], {lit: [cone], title: \"The cone: same base, same height\"})  // step 2 adds only the body, lit so the eye goes there\napex = Along(TL, TR, 0.5)  // t = 0.5 is the top face's centre, derived from the rim: the apex cannot drift off the axis\ncone = Poly([BL, BR, apex], {kind: \"inside\", in: cyl, fill: true, tone: \"amber\", shade: 2, legend: \"cone\"})  // inside, not solid: it must stay within the cylinder, and it may touch the base and top exactly\ns3 = Layer([dr, dh], {lit: [dr, dh], title: \"r and h\"})  // step 3 measures what the volume formula needs, after the shape is settled\ndr = Dim(O, BR, \"r\", {tone: \"sky\"})  // Dim, not a Label: a radius is a length, so it gets ticks and an outside spot the engine finds\ndh = Dim(BR, TR, \"h\", {tone: \"violet\"})  // h runs up the wall it measures, so the tick ends sit on the two rims\n```"},
  {"kind":"example","id":"ex-triangle-centers","attrs":{"id":"ex-triangle-centers","topic":"geometry","tags":"triangle,altitudes,orthocentre,feet","title":"Geometry: three altitudes and the orthocentre","use":"use when a triangle needs its altitudes, their feet or the orthocentre"},"body":"A scalene triangle ABC with its three altitudes: each runs from a corner to its Foot on the opposite side, and all three Meet at the orthocentre H, with a right-angle mark at every foot.\n```\n// goal: the three altitudes of a scalene triangle pass through one point\n// anchor: the wire triangle ABC, then one altitude, then all three\n// layers: 1 the triangle, 2 the altitude from C, 3 all three altitudes and H\n// budget: 24 statements\nA = Pt(0, 0)  // one of only three raw anchors: every other point is derived from these corners\nB = Pt(6, 0)  // the base is horizontal so the feet on AB read as a clean perpendicular\nC = Pt(1.5, 4)  // scalene and off-centre, so the three feet land apart instead of hiding each other\nsideAB = Seg(A, B)  // the triangle is three wire Segs, not a Poly: a solid area would conflict with every line drawn inside it\nsideBC = Seg(B, C)  // Segs never conflict with other Segs, so the altitudes may cross the sides with no finding\nsideCA = Seg(C, A)  // closes the outline; no tone, because the triangle is structure, not a measured quantity\ns1 = Layer([sideAB, sideBC, sideCA, lA, lB, lC], {title: \"The triangle ABC\"})  // step 1 shows only the outline and its names: the reasoning has not started\nlA = Label(Off(A, -0.35, -0.35), \"A\")  // labels are decor: no kind, never checked; Off keeps the name off the corner itself\nlB = Label(Off(B, 0.35, -0.35), \"B\")  // B is named below-right, where the angle mark at the foot on AB will not reach\nlC = Label(Off(C, -0.35, 0.35), \"C\")  // C is named above-left, away from the interior the altitudes will fill\ns2 = Layer([altC, rc], {title: \"One altitude: from C, perpendicular to AB\"})  // step 2 adds a single altitude, so a foot is seen before all three meet\nHc = Foot(C, A, B)  // Foot, not a raw Pt: the foot is exactly perpendicular and moves with A, B and C\naltC = Seg(C, Hc)  // the altitude is a Seg; crossing side AB at Hc is legal because lines never conflict with lines\nrc = Angle(A, Hc, C, \"\")  // an Angle at the foot is the right-angle mark; no label, since the corner is a given, not a value\ns3 = Layer([altA, altB, ra, rb], {title: \"All three altitudes meet at H\"})  // step 3 is the answer step; HINT mode stops before it\nHa = Foot(A, B, C)  // the second foot is derived the same way, so every foot follows any drag of the three anchors\nHb = Foot(B, A, C)  // the third foot: no raw coordinates are typed for any foot or centre\nH = Meet(A, Ha, B, Hb)  // Meet of two altitudes, not a guessed point: the orthocentre is their intersection by definition\naltA = Seg(A, Ha)  // later than the sides by line order, so if anything ever conflicts the later shape is the one blamed\naltB = Seg(B, Hb)  // the third altitude completes the pencil through H; lines crossing at one point is not an overlap\nra = Angle(A, Ha, B, \"\")  // right-angle mark at the foot on BC, between the altitude and side BC\nrb = Angle(A, Hb, B, \"\")  // same mark at the foot on AC: the foot is the vertex, the rays go to A and B\nmark = Circle(H, 0.07, {kind: \"overlay\", fill: true})  // a dot marking H is a helper mark, not a body; overlay is honest because a solid dot on three lines would be reported as overlapping them\nlH = Label(Off(H, 0.35, -0.35), \"H\")  // H is named last, after the lines exist, so the engine places it against the finished figure\n```"},
  {"kind":"example","id":"ex-double-slit","attrs":{"id":"ex-double-slit","topic":"physics","tags":"double slit,interference,fringes","title":"Physics: Young's double slit","use":"use when the problem is two slits, a fringe pattern or a path difference","inline":"1","more":"ex-incline-friction ex-physics"},"body":"Young's double slit: light from a source S passes two slits a distance d apart and reaches a point P on a screen a distance L away.\nThe two rays to P differ by Δ = d sin θ, so the bright fringes sit where d sin θ = mλ.\n```\n// goal: how one source through two slits builds the fringe pattern on a screen\n// anchor: the apparatus: source, barrier with two slits, screen\n// layers: 1 the apparatus, 2 a wavefront from each slit, 3 the two paths to P, 4 the fringes\n// budget: 32 statements\nS = Pt(0, 0)  // the one raw anchor: every other point is derived from it\nsrc = Circle(S, 0.14, {fill: true, tone: \"amber\", shade: 2})  // the source is a small body, so a filled Circle: a bare Pt would not be drawn\nsrcL = Label(Off(S, -0.35, 0.5), \"S\", {tone: \"ink\"})  // a name at a point is a Label; Off keeps it clear of the dot\nB0 = Off(S, 2.5, 0)  // barrier centre derived from S, so moving the source moves the whole rig\nSU = Off(B0, 0, 0.6)  // upper slit centre: half of d above the centre, so d stays one number\nSL = Off(B0, 0, -0.6)  // lower slit centre by the same Off: the pair stays symmetric about the axis\nM = Off(S, 9.5, 0)  // screen centre at distance L from the source, on the axis\ns1 = Layer([ax, topBar, midBar, botBar, barrier, scr, dGap, dLen], {title: \"Slits and screen\"})  // step 1 is the apparatus: setup, not a finding\nax = Seg(B0, M, {kind: \"overlay\", tone: \"muted\", shade: 3})  // the axis is a construction line, so overlay: it is not a body\ntopBar = Seg(Off(B0, 0, 2), Off(SU, 0, 0.15), {kind: \"surface\", tone: \"ink\"})  // a wall is a one-sided face, so surface, never a solid slab\nmidBar = Seg(Off(SU, 0, -0.15), Off(SL, 0, 0.15), {kind: \"surface\", tone: \"ink\"})  // the block between the slits: the two 0.15 gaps are the openings\nbotBar = Seg(Off(SL, 0, -0.15), Off(B0, 0, -2), {kind: \"surface\", tone: \"ink\"})  // the lower slice mirrors the top one about the centre\nbarrier = Union([topBar, midBar, botBar], {tone: \"ink\", legend: \"barrier with two slits\"})  // one object in three parts: Union stops the parts fighting, legend names the whole\nscr = Seg(Off(M, 0, 2.4), Off(M, 0, -2.4), {kind: \"surface\", tone: \"ink\"})  // the screen is the face the fringes land on, so surface\ndGap = Dim(SL, SU, \"d\", {shade: 2})  // a length between two points is a Dim, never a loose Label; d is given\ndLen = Dim(Off(B0, 0, 2), Off(M, 0, 2), \"L\", {shade: 2})  // L from two points at the same height, so the dimension line clears the rays\ns2 = Layer([wU, wL], {title: \"One wavefront from each slit\"})  // step 2 adds only the two fronts: one idea per Layer\nwU = Curve([Rot(SU, Off(SU, 1.2, 0), -35), Off(SU, 1.2, 0), Rot(SU, Off(SU, 1.2, 0), 35)], {kind: \"overlay\", tone: \"cyan\", shade: 3})  // Rot turns one radius point about the slit: both ends stay on the circle, no raw Pts\nwL = Curve([Rot(SL, Off(SL, 1.2, 0), -35), Off(SL, 1.2, 0), Rot(SL, Off(SL, 1.2, 0), 35)], {kind: \"overlay\", tone: \"cyan\", shade: 3})  // a wavefront is a helper curve drawn over the scene, so overlay\ns3 = Layer([pU, pDelta, pRest, perp, rayP, th], {lit: [scr, pU, pDelta, pRest, perp, rayP, th], title: \"Two paths to P\"})  // step 3 lights the paths and dims the rest: a Layer says where to look\nP = Off(M, 0, 1.7)  // P hangs off the screen point, so it stays on the screen when L changes\npU = Seg(SU, P, {kind: \"overlay\", tone: \"amber\", shade: 2})  // a light path is a construction line here, so overlay; its tone pairs it with the other ray\nQ = Foot(SU, SL, P)  // Q is the foot from the upper slit onto the lower ray: the later line is fitted to the ray already drawn\npDelta = Seg(SL, Q, {kind: \"overlay\", tone: \"pink\", shade: 1, label: \"Δ\"})  // the extra piece of the longer ray is Δ, the asked quantity: shade 1\npRest = Seg(Q, P, {kind: \"overlay\", tone: \"amber\", shade: 2})  // the rest of the lower ray, split at Q so Δ reads as its own piece\nperp = Seg(SU, Q, {kind: \"overlay\", tone: \"muted\", shade: 3})  // the dropped perpendicular is pure construction, so overlay and muted\nrayP = Seg(B0, P, {kind: \"overlay\", tone: \"muted\", shade: 3})  // the direction to P from the slit plane is another helper, so overlay\nth = Angle(M, B0, P, \"θ\", {shade: 2})  // an Angle needs no drawn rays: it measures the axis against the direction to P\ns4 = Layer([fr0, fr1, fr2], {lit: [scr, fr0, fr1, fr2], title: \"Bright fringes\"})  // step 4 is the meaning of step 3: where the path difference repeats\nfr0 = Seg(Off(M, -0.35, 0), Off(M, 0.35, 0), {tone: \"amber\", shade: 2})  // a fringe is a bright line on the screen: a short Seg across it\nfr1 = Seg(Off(M, -0.25, 0.55), Off(M, 0.25, 0.55), {tone: \"amber\", shade: 3})  // the next bright line, one Δ = λ higher\nfr2 = Seg(Off(M, -0.25, -0.55), Off(M, 0.25, -0.55), {tone: \"amber\", shade: 3})  // its mirror below: the pattern is symmetric about the axis\n```"},
  {"kind":"example","id":"ex-incline-friction","attrs":{"id":"ex-incline-friction","topic":"physics","tags":"incline,ramp,friction,forces","title":"Physics: block on a ramp with friction","use":"use when the problem is a block resting on a ramp with friction"},"body":"A block on a ramp of angle theta: the ramp is a surface the block rests on, and the three forces hang off the block's centre.\n```\n// goal: why friction points up the slope, and how mg splits into parts\n// anchor: a block resting on a ramp of angle theta\n// layers: 1 the ramp and the block, 2 the three forces, 3 the parts of mg\n// budget: 16 statements\nA = Pt(0, 0) // the ramp foot is one raw anchor, so every other point can be derived from it\nB = Pt(8, 0) // the base end is the second anchor, giving the slope line two fixed ends\ns1 = Layer([ramp, blk, th], {lit: [ramp, blk], title: \"The ramp and the block\"}) // step 1 is the anchor itself: one Layer = one reasoning step\ntop = Meet(A, Rot(A, B, 30), B, Off(B, 0, 1)) // Meet finds the corner where the 30 degree ray crosses B's vertical, so it follows both anchors\nramp = Poly([A, B, top], {kind: \"surface\", tone: \"muted\"}) // kind surface: a one-sided ramp bodies rest on, not a solid they sink into\nP = Along(A, top, 0.45) // Along puts the contact point partway up the slope, so it slides with the ramp instead of a raw number\nC = Rot(P, Off(P, 0, 0.8), 30) // Rot turns the outward offset onto the slope normal, so the centre sits half the block height above P\nblk = Box(C, 1.6, 1.6, 30, {fill: true, tone: \"muted\", shade: 2, legend: \"block\"}) // turned 30 degrees flat on the ramp; legend names what the body is, and this later line is the one that would move on a conflict\nth = Angle(B, A, top, \"θ\") // Angle draws the arc at A between base and slope, where a loose Label could not say which angle; it prints the symbol, not the value\ns2 = Layer([W, N, f], {lit: [W, N, f], title: \"The three forces on the block\"}) // step 2 adds only the forces, so the student can stop before the split\nW = Vec(C, Off(C, 0, -2.2), \"mg\", {tone: \"sky\"}) // weight leaves the centre straight down: Off keeps it vertical whatever the slope angle\nN = Vec(C, Rot(C, Off(C, 0, 2), 30), \"N\", {tone: \"amber\"}) // the same Rot turns the outward offset with the slope, so N is perpendicular to the ramp\nf = Vec(C, Rot(C, Off(C, 1.9, 0), 30), \"f\", {tone: \"violet\"}) // Rot carries the block's local +x up the slope, so friction points up it\ns3 = Layer([Wpar, Wperp], {lit: [Wpar, Wperp], title: \"mg split along and across the slope\"}) // step 3 is the component step: the algebra stays in the text\nWpar = Vec(C, Rot(C, Off(C, -1.1, 0), 30), \"mg sin θ\", {tone: \"cyan\"}) // the down-slope part of mg, drawn from the same centre so the split is visible\nWperp = Vec(C, Rot(C, Off(C, 0, -1.9), 30), \"mg cos θ\", {tone: \"pink\"}) // the part pressing into the ramp: a Vec head may end inside a surface\n```"},
  {"kind":"example","id":"ex-titration","attrs":{"id":"ex-titration","topic":"chem","tags":"titration,burette,flask","title":"Chemistry: titration setup","use":"use when the problem is a titration with a burette and a conical flask"},"body":"A burette of NaOH above a conical flask of HCl, with the drip falling between them.\nThe barrel and stopcock are one Union, both liquids sit inside their vessels, and the drip is a flow line.\n```\n// goal: a burette dripping NaOH into the HCl below it\n// anchor: the glassware, burette over flask\n// layers: 1 the two liquids, 2 the drop between them\n// budget: 14 statements\nG = Pt(0, 0)  // one free anchor for the kit: every other point is Off or Along of G, so a pass-2 Fix on G moves the setup together\ntube = Box(Off(G, 0, 6.9), 0.8, 5.4, 0, {tone: \"ink\"})  // the barrel is a tall thin box centred above the anchor; ink because glass is structure, not a quantity\ncock = Box(Off(G, 0, 4.25), 1.6, 0.7, 0, {tone: \"ink\"})  // the stopcock is a short wide box at the barrel's foot, its top deliberately overlapping the barrel\nburette = Union([tube, cock], {tone: \"ink\", legend: \"burette\"})  // Union, not two solids: cock and barrel overlap, and parts of one object never conflict with each other\nfL = Off(G, -2, 0)  // left foot: derived from the anchor rather than a new Pt, so the flask stays tied to G\nfR = Off(G, 2, 0)  // right foot: the base is the widest part, 4 units across\nnL = Off(G, -0.6, 3.2)  // left neck corner: the 2 to 0.6 taper is what makes the outline read as conical\nnR = Off(G, 0.6, 3.2)  // right neck corner, level with nL so the mouth is horizontal\nflask = Poly([fL, fR, nR, nL], {tone: \"ink\", legend: \"flask\"})  // a solid body, not a surface: a surface is a one-sided floor, while this closed outline is the vessel the acid must stay in; legend names the object, a label would be a symbol on it\ns1 = Layer([NaOH, HCl], {lit: [NaOH, HCl], title: \"Both liquids\"})  // a Layer because the reagents are the next thing to look at, after the empty glassware\nNaOH = Box(Off(G, 0, 6.65), 0.7, 3.9, 0, {kind: \"inside\", in: tube, fill: true, tone: \"sky\", shade: 2, legend: \"NaOH\"})  // inside in tube keeps the column in the barrel and lets it fill it; not overlay, because this is a real body; the reading is a volume, so no Dim: Dim is for lengths\nHCl = Poly([Off(fL, 0.1, 0.02), Off(fR, -0.1, 0.02), Along(nR, fR, 0.66), Along(nL, fL, 0.66)], {kind: \"inside\", in: flask, fill: true, tone: \"amber\", shade: 2, legend: \"HCl\"})  // inside in flask; its top corners are Along the flask's own neck-to-foot walls, so the later liquid fits the earlier flask and meets the glass\ns2 = Layer([drip], {lit: [drip], title: \"The drop\"})  // the transfer is the last reasoning step, so the drip appears only now\ndrip = Seg(Off(G, 0, 3.85), Off(G, 0, 3.25), {kind: \"overlay\", tone: \"sky\"})  // a flow/connector line, not a body: overlay keeps it out of the solid checks, and it is written last so it fits the gap between the placed cock and flask\n```"},
  {"kind":"example","id":"ex-galvanic-cell","attrs":{"id":"ex-galvanic-cell","topic":"chem","tags":"galvanic,cell,electrodes,salt-bridge","title":"Chemistry: galvanic cell","use":"use when the problem is a galvanic cell or two half-cells joined by a salt bridge"},"body":"Two half-cells: a zinc electrode in one beaker of solution, a copper electrode in the other.\nA salt bridge joins the two solutions and a wire joins the two electrodes, so electrons run from Zn to Cu.\n```\n// goal: how a galvanic cell keeps the two half-reactions apart while closing the circuit\n// anchor: two beakers of solution, joined by the salt bridge\n// layers: 1 the two electrodes, 2 the salt bridge, 3 the wire and the electron flow\n// budget: 30 statements\nG = Pt(0, 0)  // one free anchor at the centre of the cell; every other point hangs off it with Off, so the whole cell moves when G moves\nlB0 = Off(G, -6, 0)  // left beaker's outer bottom-left, derived with Off instead of a raw Pt so it follows the anchor\nlB1 = Off(G, -2, 0)  // outer bottom-right; the two beakers are mirror images about G, so one anchor sets both\nlT0 = Off(G, -6, 4)  // outer top-left, 4 units up; the wall height comes from the same anchor\nlT1 = Off(G, -2, 4)  // outer top-right; lB1 to lT1 is the open mouth the bridge will pass through\nrB0 = Off(G, 2, 0)  // right beaker's outer bottom-left, mirrored from the left one\nrB1 = Off(G, 6, 0)  // outer bottom-right of the right beaker\nrT0 = Off(G, 2, 4)  // outer top-left of the right beaker\nrT1 = Off(G, 6, 4)  // outer top-right; its open mouth\nlspace = Poly([lB0, lB1, lT1, lT0], {kind: \"overlay\", tone: \"muted\", shade: 3})  // the beaker's inner space is only an `in:` target, so overlay: it is a helper container and must never collide; shade 3 says context\nrspace = Poly([rB0, rB1, rT1, rT0], {kind: \"overlay\", tone: \"muted\", shade: 3})  // the right beaker's inner space, same helper role, so each liquid is checked against its own container\nwl1 = Seg(lB0, lT0, {kind: \"surface\", tone: \"ink\"})  // glass is a real one-sided boundary, so surface: the liquid rests against it and may not sink in; ink because glass is structure, not a quantity\nwb1 = Seg(lB0, lB1, {kind: \"surface\", tone: \"ink\"})  // the base is a surface too, so the liquid sits on it instead of overlapping it\nwr1 = Seg(lB1, lT1, {kind: \"surface\", tone: \"ink\"})  // the right wall closes the U shape; three surfaces draw a beaker without enclosing a solid area\nwl2 = Seg(rB0, rT0, {kind: \"surface\", tone: \"ink\"})  // the right beaker's left wall, a surface and never a solid block the liquid would have to dodge\nwb2 = Seg(rB0, rB1, {kind: \"surface\", tone: \"ink\"})  // its base, so the second liquid also rests on glass\nwr2 = Seg(rB1, rT1, {kind: \"surface\", tone: \"ink\"})  // its right wall\nsolL = Poly([lB0, lB1, Off(lB1, 0, 2.5), Off(lB0, 0, 2.5)], {kind: \"inside\", in: lspace, fill: true, tone: \"sky\", shade: 2})  // the solution has volume, so inside + in: lspace proves it stays in the beaker; sky shade 2 marks a given liquid\nsolR = Poly([rB0, rB1, Off(rB1, 0, 2.5), Off(rB0, 0, 2.5)], {kind: \"inside\", in: rspace, fill: true, tone: \"sky\", shade: 2})  // the copper half-cell's solution, inside its own container so the two liquids cannot mix\ns1 = Layer([zn, cu], {lit: [zn, cu], title: \"Two electrodes\"})  // one Layer is one reasoning step, and the first step is the pair of metals that exchange electrons\nzn = Box(Off(Mid(lB0, lB1), 0, 3.5), 0.4, 2, 0, {fill: true, tone: \"violet\", shade: 2, legend: \"Zn\"})  // the zinc strip stands at Mid of its beaker floor and is lifted by Off until its foot touches the solution top (contact, not overlap); legend, not label, because Zn is the object's name\ncu = Box(Off(Mid(rB0, rB1), 0, 3.5), 0.4, 2, 0, {fill: true, tone: \"orange\", shade: 2, legend: \"Cu\"})  // the copper strip, mirrored by the same Mid + Off; a second hue marks the second metal\ns2 = Layer([bridge], {lit: [bridge], title: \"Salt bridge\"})  // the next step is the internal path: ions move only once the bridge joins the two solutions\nbridge = Curve([Off(G, -3.3, 2.6), Off(G, -3.3, 3.6), Off(G, -3.2, 4.9), Off(G, -1.8, 5.35), Off(G, 0, 5.45), Off(G, 1.8, 5.35), Off(G, 3.2, 4.9), Off(G, 3.3, 3.6), Off(G, 3.3, 2.6)], {w: 0.35, fill: true, tone: \"pink\", shade: 2, legend: \"salt bridge\"})  // a thick Curve, not a Seg, because the bridge is a tube; its ends stop on the solution surfaces, and as the later line it is the bridge that yields to the beakers; legend names it\ns3 = Layer([wire, flow], {lit: [wire, flow], title: \"Wire and electrons\"})  // the last step is the external path, which is what turns the two half-cells into a circuit\nw1 = Seg(Off(G, -4, 4.5), Off(G, -4, 6), {kind: \"overlay\", tone: \"muted\"})  // a connector from the zinc top up into the wire; overlay because it joins bodies instead of being a body itself\nw2 = Seg(Off(G, -4, 6), Off(G, 4, 6), {kind: \"overlay\", tone: \"muted\"})  // the run across the gap; overlay keeps this helper line out of every collision check\nw3 = Seg(Off(G, 4, 6), Off(G, 4, 4.5), {kind: \"overlay\", tone: \"muted\"})  // down to the copper top; overlay lets the wire meet the electrode exactly at the joint\nwire = Union([w1, w2, w3], {kind: \"overlay\", tone: \"muted\"})  // the three Segs are one wire, so Union groups them as one object made of parts; overlay marks the whole connector unchecked, never a real body\nflow = Vec(Off(G, -2.5, 6), Off(G, -0.5, 6), \"e⁻\", {tone: \"cyan\"})  // electrons leave Zn and reach Cu, so the arrow points Zn to Cu; a Vec is decor, checked only at its head, and the head sits in open air\n```"},
  {"kind":"example","id":"ex-dijkstra","attrs":{"id":"ex-dijkstra","topic":"cs","tags":"dijkstra,shortest-path,weighted-graph","title":"CS: Dijkstra shortest path","use":"use when the problem is the shortest path in a weighted graph","inline":"1","more":"ex-bst-insert ex-cs"},"body":"A weighted graph rooted at the start node S, then the tentative distances beside the nodes, then the shortest path S to T lit:\n```\n// goal: the shortest path S to T, built up in Dijkstra steps\n// anchor: the graph, rooted at the start node S\n// layers: 1 the graph, 2 tentative distances, 3 the shortest path lit\n// budget: 28 statements\nS = Pt(0, 0)                                              // the one free Pt: every node is Off it, so a Fix on S moves the whole graph\nsn = Circle(S, 0.45, {tone: \"sky\", shade: 2, label: \"S\"})  // a node is a Circle; \"S\" is a symbol, and it fits inside so no legend row\ns1 = Layer([eSA, eSB, eAB, eAC, eBD, eCT, eDT], {title: \"The graph\"})  // step 1 adds the graph's body; the prefix holds only the anchor S\nT = Off(S, 7, 0)                                          // Off, not Pt(7, 0): T keeps its place relative to S, one anchor moves all\nA = Off(S, 2, 2)                                          // derived point, so A cannot drift away from the graph S holds together\nB = Off(S, 2, -2)                                         // same Off pattern: the six nodes share one origin, no loose coordinates\nC = Off(S, 5, 2)                                          // the far column, still measured from S, not from a second anchor\nD = Off(S, 5, -2)                                         // mirrors C about the S-to-T line, so the graph stays readable\neSA = Seg(S, A, {kind: \"overlay\", tone: \"muted\", label: \"4\"})  // overlay: the edge runs under the node circles and lines are never checked\neSB = Seg(S, B, {kind: \"overlay\", tone: \"muted\", label: \"2\"})  // weight as a label on the edge itself, placed by the engine beside it\neAB = Seg(A, B, {kind: \"overlay\", tone: \"muted\", label: \"2\"})  // a short cross edge: it exists to make a second route, nothing more\neAC = Seg(A, C, {kind: \"overlay\", tone: \"muted\", label: \"3\"})  // the top route out of A, one weight per edge\neBD = Seg(B, D, {kind: \"overlay\", tone: \"muted\", label: \"3\"})  // the bottom route out of B, the one the answer will use\neCT = Seg(C, T, {kind: \"overlay\", tone: \"muted\", label: \"5\"})  // every route must end at T, so T collects the last two edges\neDT = Seg(D, T, {kind: \"overlay\", tone: \"muted\", label: \"4\"})  // the second edge into T: the graph offers a choice, the step decides it\nnA = Circle(A, 0.45, {tone: \"sky\", shade: 2, label: \"A\"})  // the same Circle as S: all nodes read as one kind of object\nnB = Circle(B, 0.45, {tone: \"sky\", shade: 2, label: \"B\"})  // shade 2 = given: these nodes are data, not the asked value\nnC = Circle(C, 0.45, {tone: \"sky\", shade: 2, label: \"C\"})  // a short symbol only: never the distance the student must find\nnD = Circle(D, 0.45, {tone: \"sky\", shade: 2, label: \"D\"})  // keep the labels inside the radius so nothing lands in the legend row\nnT = Circle(T, 0.45, {tone: \"sky\", shade: 2, label: \"T\"})  // the target node, drawn like the others: the goal is a node, not a special shape\ns2 = Layer([dS, dA, dB, dD, dC, dT], {title: \"Tentative distances\"})  // step 2 adds only numbers: the graph does not change, so no redraw\ndS = Label(Off(S, -1, 0), \"0\", {tone: \"amber\", shade: 2})  // a Label, not a Dim: an edge weight is not the drawn length, so no dimension line\ndA = Label(Off(A, -1.2, 0.3), \"4\", {tone: \"amber\", shade: 3})  // shade 3 = context: the best route found so far, still open to change\ndB = Label(Off(B, -1.2, -0.3), \"2\", {tone: \"amber\", shade: 3})  // Off the node it belongs to: the later line is placed by the earlier one\ndD = Label(Off(D, 0, -1), \"5\", {tone: \"amber\", shade: 3})  // shade 3 = context: found so far, not yet the answer\ndC = Label(Off(C, 0, 1), \"7\", {tone: \"amber\", shade: 3})   // the top route's total, kept beside C so the student can compare routes\ndT = Label(Off(T, 1.2, 0.5), \"?\", {tone: \"amber\", shade: 1})  // shade 1 = asked; \"?\" is a symbol, never the total the student must find\ns3 = Layer([], {lit: [eSB, eBD, eDT], title: \"Shortest path\"})  // step 3 adds no line at all: lit is the step, the path exists and the rest pales\n```"},
  {"kind":"example","id":"ex-bst-insert","attrs":{"id":"ex-bst-insert","topic":"cs","tags":"bst,insert,comparison path,new leaf","title":"CS: binary search tree insert","use":"use when a binary search tree insert must show the comparison path and the new leaf"},"body":"A seven-node binary search tree; inserting the key 5 compares down from the root and hangs a new leaf.\n```\n// goal: show where a BST insert goes: compare down from the root, then attach one new leaf\n// anchor: the tree, rooted at one raw point\n// layers: 1 the tree, 2 the comparison path from the root, 3 the new leaf attached\n// budget: 28 statements\nO = Pt(0, 0)  // the one raw anchor; every other point is derived from it with Off so the whole tree moves together\nroot = Off(O, 0, 4.2)  // root centre, one level above the anchor; Off, not a second Pt, keeps it tied to O\nL = Off(O, -3, 2.5)  // left child of the root; the drop is wide enough for two node radii to clear\nR = Off(O, 3, 2.5)  // right child of the root, mirrored from L so the tree reads as one symmetric object\nLL = Off(O, -4.2, 0.8)  // key 2, the left child of 4; derived from O, never typed as its own free point\nLR = Off(O, -1.9, 0.8)  // key 6, the right child of 4; the insert will end under this node\nRL = Off(O, 1.9, 0.8)  // key 10, the left child of 12; its slot stays empty in this insert\nRR = Off(O, 4.2, 0.8)  // key 14, the right child of 12; same level as its siblings\ns1 = Layer([n0, n1, n2, n3, n4, n5, n6, e1, e2, e3, e4, e5, e6], {title: \"The tree\"})  // one layer = one reasoning step: the whole tree first, before any insert moves\nn0 = Circle(root, 0.5, {fill: true, tone: \"sky\", shade: 2, label: \"8\"})  // a real node body, solid: two nodes may touch but never overlap\nn1 = Circle(L, 0.5, {fill: true, tone: \"sky\", shade: 2, label: \"4\"})  // keys are givens, so a short symbol label; sky is the existing tree's one hue\nn2 = Circle(R, 0.5, {fill: true, tone: \"sky\", shade: 2, label: \"12\"})  // same body and tone as its siblings: one hue per quantity across the figure\nn3 = Circle(LL, 0.5, {fill: true, tone: \"sky\", shade: 2, label: \"2\"})  // drawn as the same solid body; no special kind for a leaf\nn4 = Circle(LR, 0.5, {fill: true, tone: \"sky\", shade: 2, label: \"6\"})  // the node whose empty left slot will take the new key\nn5 = Circle(RL, 0.5, {fill: true, tone: \"sky\", shade: 2, label: \"10\"})  // mirror of n3; kept for the shape of the tree, not stepped through\nn6 = Circle(RR, 0.5, {fill: true, tone: \"sky\", shade: 2, label: \"14\"})  // mirror of n3's sibling; only the left subtree is compared\ne1 = Seg(root, L, {kind: \"overlay\", tone: \"muted\"})  // a tree edge is overlay: it joins two bodies centre to centre, which a checked solid may not do\ne2 = Seg(root, R, {kind: \"overlay\", tone: \"muted\"})  // the mirrored edge; muted because an edge is structure, not a quantity\ne3 = Seg(L, LL, {kind: \"overlay\", tone: \"muted\"})  // same overlay rule: centre to centre, so the nodes stay solid and unchecked against it\ne4 = Seg(L, LR, {kind: \"overlay\", tone: \"muted\"})  // the second edge the comparison will follow\ne5 = Seg(R, RL, {kind: \"overlay\", tone: \"muted\"})  // drawn once, never lit: the insert never reaches the right subtree\ne6 = Seg(R, RR, {kind: \"overlay\", tone: \"muted\"})  // same rule on the far right; symmetry is drawn, not implied\ns2 = Layer([p3], {lit: [n0, n1, n4, e1, e4, p3], title: \"Follow the comparisons\"})  // step 2 changes what the student looks at: lit the chain, the rest pales\nslot = Off(O, -2.9, -0.9)  // the empty slot left of 6, derived from O so it hangs exactly one level below LR\np3 = Seg(LR, slot, {kind: \"overlay\", tone: \"amber\"})  // a construction probe, so overlay (never checked) and a plain Seg: a Vec tip would end inside the node and be blamed\ns3 = Layer([nn, e7], {hide: [p3], lit: [n4, nn, e7], title: \"The new leaf\"})  // the answer step: HINT stops before it, so the placed key is only drawn here\nnn = Circle(slot, 0.5, {fill: true, tone: \"amber\", shade: 1, label: \"5\"})  // the inserted key is what was asked, so shade 1; solid like every node\ne7 = Seg(LR, slot, {kind: \"overlay\", tone: \"amber\"})  // the real edge replaces the probe; written after nn, so line order would blame this edge if it clashed\n```"},
];
export const DOC_INDEX = "points: Points. use when you place or derive points (midpoints, feet, rotations, intersections)\nshapes: Shapes. use when you draw a body, line, box, polygon, circle, vector, label or angle\nkinds: Kinds and findings. use when you pick a kind (solid, surface, inside, overlay) or read a layout finding\ncurves: Curves and unions. use when a part is organic or one object is made of several parts\nlegend: Legend and labels. use when an object needs a name or a short symbol or value\ndim: Dimensions. use when you show a length, radius, height or distance\nlayers: Steps and layers. use when the drawing needs ordered reasoning steps\npass2: Reviews and Fix. use when you answer a review or patch a point or shape\ncolors: Colors and shade. use when you pick a tone, shade or fill\nex-physics: Physics: lever and pulley. use when the problem is forces, a lever, a pulley or a hanging mass\nex-calc: Calculus: Riemann strips and tangent. use when the problem is an area under a curve or a tangent line\nex-geometry: Geometry: altitude and incircle. use when the problem is a triangle, an altitude or an inscribed circle\nex-cs: CS: array pointer and binary tree. use when the problem is an array with a pointer or a binary tree\nex-chem: Chemistry: beaker of liquid. use when the problem is a container holding a liquid\nex-area-tangent: Area under a curve and the tangent at P. use when the problem asks for a slope at a point or the area under a curve\nex-unit-circle: Math: unit circle, sin and cos. use when the problem is the unit circle, or cos and sin as the coordinates of a point\nex-riemann: Calculus: four left-endpoint rectangles. use when the problem estimates an area under a curve with left-endpoint rectangles\nex-ladder: Calculus: the sliding ladder. use when a ladder slides down a wall and its foot distance, height and angle are related\nex-cone-in-cylinder: Geometry: cone in a cylinder. use when a cone sits exactly inside a cylinder and you compare their volumes\nex-triangle-centers: Geometry: three altitudes and the orthocentre. use when a triangle needs its altitudes, their feet or the orthocentre\nex-double-slit: Physics: Young's double slit. use when the problem is two slits, a fringe pattern or a path difference\nex-incline-friction: Physics: block on a ramp with friction. use when the problem is a block resting on a ramp with friction\nex-titration: Chemistry: titration setup. use when the problem is a titration with a burette and a conical flask\nex-galvanic-cell: Chemistry: galvanic cell. use when the problem is a galvanic cell or two half-cells joined by a salt bridge\nex-dijkstra: CS: Dijkstra shortest path. use when the problem is the shortest path in a weighted graph\nex-bst-insert: CS: binary search tree insert. use when a binary search tree insert must show the comparison path and the new leaf";
export const INLINE_EXAMPLES = "Worked example: Area under a curve and the tangent at P\nA smooth curve y = f(x) with a point P on it, the tangent at P, and the area under f from x = a to x = b shaded.\n```\n// goal: read the slope at P and the area under f between a and b\n// anchor: the curve y = f(x) above the x axis\n// layers: 1 the curve and P, 2 the tangent at P, 3 the shaded area\n// budget: 20 statements\nO = Pt(0, 0)  // one free origin: every axis point is derived from it\nxAxis = Seg(O, Off(O, 6, 0), {tone: \"muted\"})  // x axis: muted context, so it never competes with f\nyAxis = Seg(O, Off(O, 0, 4), {tone: \"muted\"})  // y axis: same muted stroke, one hue for structure\nA = Pt(1, 0)  // a is a free anchor: the area, the Dim and f all hang off it\nB = Pt(5, 0)  // b is free too, so b - a is one span a Fix can move\ns1 = Layer([f, dotP], {title: \"The curve and P\"})  // step 1 adds the curve and the point; a Layer is one reasoning step\nT1 = Off(A, 0, 0.6)  // f at a: Off A, not a raw Pt, so moving a drags the curve with it\nT2 = Off(A, 1, 1.1)  // next sample: one unit right, height off the same anchor\nP = Off(A, 2, 1.5)  // P is a control point of f, so it lies on the curve exactly\nT4 = Off(A, 3, 2.1)  // sample after P: keeps the rise smooth, no extra anchor\nT5 = Off(A, 4, 2.8)  // f at b: last control point, again derived from A\nf = Curve([T1, T2, P, T4, T5], {tone: \"amber\"})  // open Curve is a thin line: it never collides with the area\ndotP = Circle(P, 0.07, {kind: \"overlay\", fill: true, tone: \"violet\"})  // a dot at P is a helper mark, so overlay, never solid\ns2 = Layer([tan], {title: \"The tangent at P\"})  // step 2 adds one construction line on top of step 1\nQ = Off(P, 1, 0.5)  // tangent direction: slope 0.5 as a step from P, no raw Pt\ntan = Seg(Along(P, Q, -1.3), Along(P, Q, 1.3), {kind: \"overlay\", tone: \"violet\"})  // Along both ways keeps the line centred on P; overlay because a tangent is a helper line over the area\ns3 = Layer([area], {title: \"The shaded area\"})  // step 3 adds the region: the step that answers the area question\narea = Poly([A, T1, T2, P, T4, T5, B], {fill: true, tone: \"sky\", shade: 3})  // a real region stays solid, not overlay; shade 3 = context\ndim = Dim(A, B, \"b - a\", {tone: \"muted\"})  // Dim, not a Label: a width gets ticks and sits outside; written last, so the later line yields to the shapes already there\nlab = Label(Off(T5, 0.25, 0.2), \"f(x)\", {tone: \"amber\"})  // symbol only: f(x), never a value the student must find\n```\nMore like this: read_doc(id) for ex-unit-circle (Math: unit circle, sin and cos), ex-riemann (Calculus: four left-endpoint rectangles)\nWorked example: Physics: Young's double slit\nYoung's double slit: light from a source S passes two slits a distance d apart and reaches a point P on a screen a distance L away.\nThe two rays to P differ by Δ = d sin θ, so the bright fringes sit where d sin θ = mλ.\n```\n// goal: how one source through two slits builds the fringe pattern on a screen\n// anchor: the apparatus: source, barrier with two slits, screen\n// layers: 1 the apparatus, 2 a wavefront from each slit, 3 the two paths to P, 4 the fringes\n// budget: 32 statements\nS = Pt(0, 0)  // the one raw anchor: every other point is derived from it\nsrc = Circle(S, 0.14, {fill: true, tone: \"amber\", shade: 2})  // the source is a small body, so a filled Circle: a bare Pt would not be drawn\nsrcL = Label(Off(S, -0.35, 0.5), \"S\", {tone: \"ink\"})  // a name at a point is a Label; Off keeps it clear of the dot\nB0 = Off(S, 2.5, 0)  // barrier centre derived from S, so moving the source moves the whole rig\nSU = Off(B0, 0, 0.6)  // upper slit centre: half of d above the centre, so d stays one number\nSL = Off(B0, 0, -0.6)  // lower slit centre by the same Off: the pair stays symmetric about the axis\nM = Off(S, 9.5, 0)  // screen centre at distance L from the source, on the axis\ns1 = Layer([ax, topBar, midBar, botBar, barrier, scr, dGap, dLen], {title: \"Slits and screen\"})  // step 1 is the apparatus: setup, not a finding\nax = Seg(B0, M, {kind: \"overlay\", tone: \"muted\", shade: 3})  // the axis is a construction line, so overlay: it is not a body\ntopBar = Seg(Off(B0, 0, 2), Off(SU, 0, 0.15), {kind: \"surface\", tone: \"ink\"})  // a wall is a one-sided face, so surface, never a solid slab\nmidBar = Seg(Off(SU, 0, -0.15), Off(SL, 0, 0.15), {kind: \"surface\", tone: \"ink\"})  // the block between the slits: the two 0.15 gaps are the openings\nbotBar = Seg(Off(SL, 0, -0.15), Off(B0, 0, -2), {kind: \"surface\", tone: \"ink\"})  // the lower slice mirrors the top one about the centre\nbarrier = Union([topBar, midBar, botBar], {tone: \"ink\", legend: \"barrier with two slits\"})  // one object in three parts: Union stops the parts fighting, legend names the whole\nscr = Seg(Off(M, 0, 2.4), Off(M, 0, -2.4), {kind: \"surface\", tone: \"ink\"})  // the screen is the face the fringes land on, so surface\ndGap = Dim(SL, SU, \"d\", {shade: 2})  // a length between two points is a Dim, never a loose Label; d is given\ndLen = Dim(Off(B0, 0, 2), Off(M, 0, 2), \"L\", {shade: 2})  // L from two points at the same height, so the dimension line clears the rays\ns2 = Layer([wU, wL], {title: \"One wavefront from each slit\"})  // step 2 adds only the two fronts: one idea per Layer\nwU = Curve([Rot(SU, Off(SU, 1.2, 0), -35), Off(SU, 1.2, 0), Rot(SU, Off(SU, 1.2, 0), 35)], {kind: \"overlay\", tone: \"cyan\", shade: 3})  // Rot turns one radius point about the slit: both ends stay on the circle, no raw Pts\nwL = Curve([Rot(SL, Off(SL, 1.2, 0), -35), Off(SL, 1.2, 0), Rot(SL, Off(SL, 1.2, 0), 35)], {kind: \"overlay\", tone: \"cyan\", shade: 3})  // a wavefront is a helper curve drawn over the scene, so overlay\ns3 = Layer([pU, pDelta, pRest, perp, rayP, th], {lit: [scr, pU, pDelta, pRest, perp, rayP, th], title: \"Two paths to P\"})  // step 3 lights the paths and dims the rest: a Layer says where to look\nP = Off(M, 0, 1.7)  // P hangs off the screen point, so it stays on the screen when L changes\npU = Seg(SU, P, {kind: \"overlay\", tone: \"amber\", shade: 2})  // a light path is a construction line here, so overlay; its tone pairs it with the other ray\nQ = Foot(SU, SL, P)  // Q is the foot from the upper slit onto the lower ray: the later line is fitted to the ray already drawn\npDelta = Seg(SL, Q, {kind: \"overlay\", tone: \"pink\", shade: 1, label: \"Δ\"})  // the extra piece of the longer ray is Δ, the asked quantity: shade 1\npRest = Seg(Q, P, {kind: \"overlay\", tone: \"amber\", shade: 2})  // the rest of the lower ray, split at Q so Δ reads as its own piece\nperp = Seg(SU, Q, {kind: \"overlay\", tone: \"muted\", shade: 3})  // the dropped perpendicular is pure construction, so overlay and muted\nrayP = Seg(B0, P, {kind: \"overlay\", tone: \"muted\", shade: 3})  // the direction to P from the slit plane is another helper, so overlay\nth = Angle(M, B0, P, \"θ\", {shade: 2})  // an Angle needs no drawn rays: it measures the axis against the direction to P\ns4 = Layer([fr0, fr1, fr2], {lit: [scr, fr0, fr1, fr2], title: \"Bright fringes\"})  // step 4 is the meaning of step 3: where the path difference repeats\nfr0 = Seg(Off(M, -0.35, 0), Off(M, 0.35, 0), {tone: \"amber\", shade: 2})  // a fringe is a bright line on the screen: a short Seg across it\nfr1 = Seg(Off(M, -0.25, 0.55), Off(M, 0.25, 0.55), {tone: \"amber\", shade: 3})  // the next bright line, one Δ = λ higher\nfr2 = Seg(Off(M, -0.25, -0.55), Off(M, 0.25, -0.55), {tone: \"amber\", shade: 3})  // its mirror below: the pattern is symmetric about the axis\n```\nMore like this: read_doc(id) for ex-incline-friction (Physics: block on a ramp with friction), ex-physics (Physics: lever and pulley)\nWorked example: CS: Dijkstra shortest path\nA weighted graph rooted at the start node S, then the tentative distances beside the nodes, then the shortest path S to T lit:\n```\n// goal: the shortest path S to T, built up in Dijkstra steps\n// anchor: the graph, rooted at the start node S\n// layers: 1 the graph, 2 tentative distances, 3 the shortest path lit\n// budget: 28 statements\nS = Pt(0, 0)                                              // the one free Pt: every node is Off it, so a Fix on S moves the whole graph\nsn = Circle(S, 0.45, {tone: \"sky\", shade: 2, label: \"S\"})  // a node is a Circle; \"S\" is a symbol, and it fits inside so no legend row\ns1 = Layer([eSA, eSB, eAB, eAC, eBD, eCT, eDT], {title: \"The graph\"})  // step 1 adds the graph's body; the prefix holds only the anchor S\nT = Off(S, 7, 0)                                          // Off, not Pt(7, 0): T keeps its place relative to S, one anchor moves all\nA = Off(S, 2, 2)                                          // derived point, so A cannot drift away from the graph S holds together\nB = Off(S, 2, -2)                                         // same Off pattern: the six nodes share one origin, no loose coordinates\nC = Off(S, 5, 2)                                          // the far column, still measured from S, not from a second anchor\nD = Off(S, 5, -2)                                         // mirrors C about the S-to-T line, so the graph stays readable\neSA = Seg(S, A, {kind: \"overlay\", tone: \"muted\", label: \"4\"})  // overlay: the edge runs under the node circles and lines are never checked\neSB = Seg(S, B, {kind: \"overlay\", tone: \"muted\", label: \"2\"})  // weight as a label on the edge itself, placed by the engine beside it\neAB = Seg(A, B, {kind: \"overlay\", tone: \"muted\", label: \"2\"})  // a short cross edge: it exists to make a second route, nothing more\neAC = Seg(A, C, {kind: \"overlay\", tone: \"muted\", label: \"3\"})  // the top route out of A, one weight per edge\neBD = Seg(B, D, {kind: \"overlay\", tone: \"muted\", label: \"3\"})  // the bottom route out of B, the one the answer will use\neCT = Seg(C, T, {kind: \"overlay\", tone: \"muted\", label: \"5\"})  // every route must end at T, so T collects the last two edges\neDT = Seg(D, T, {kind: \"overlay\", tone: \"muted\", label: \"4\"})  // the second edge into T: the graph offers a choice, the step decides it\nnA = Circle(A, 0.45, {tone: \"sky\", shade: 2, label: \"A\"})  // the same Circle as S: all nodes read as one kind of object\nnB = Circle(B, 0.45, {tone: \"sky\", shade: 2, label: \"B\"})  // shade 2 = given: these nodes are data, not the asked value\nnC = Circle(C, 0.45, {tone: \"sky\", shade: 2, label: \"C\"})  // a short symbol only: never the distance the student must find\nnD = Circle(D, 0.45, {tone: \"sky\", shade: 2, label: \"D\"})  // keep the labels inside the radius so nothing lands in the legend row\nnT = Circle(T, 0.45, {tone: \"sky\", shade: 2, label: \"T\"})  // the target node, drawn like the others: the goal is a node, not a special shape\ns2 = Layer([dS, dA, dB, dD, dC, dT], {title: \"Tentative distances\"})  // step 2 adds only numbers: the graph does not change, so no redraw\ndS = Label(Off(S, -1, 0), \"0\", {tone: \"amber\", shade: 2})  // a Label, not a Dim: an edge weight is not the drawn length, so no dimension line\ndA = Label(Off(A, -1.2, 0.3), \"4\", {tone: \"amber\", shade: 3})  // shade 3 = context: the best route found so far, still open to change\ndB = Label(Off(B, -1.2, -0.3), \"2\", {tone: \"amber\", shade: 3})  // Off the node it belongs to: the later line is placed by the earlier one\ndD = Label(Off(D, 0, -1), \"5\", {tone: \"amber\", shade: 3})  // shade 3 = context: found so far, not yet the answer\ndC = Label(Off(C, 0, 1), \"7\", {tone: \"amber\", shade: 3})   // the top route's total, kept beside C so the student can compare routes\ndT = Label(Off(T, 1.2, 0.5), \"?\", {tone: \"amber\", shade: 1})  // shade 1 = asked; \"?\" is a symbol, never the total the student must find\ns3 = Layer([], {lit: [eSB, eBD, eDT], title: \"Shortest path\"})  // step 3 adds no line at all: lit is the step, the path exists and the rest pales\n```\nMore like this: read_doc(id) for ex-bst-insert (CS: binary search tree insert), ex-cs (CS: array pointer and binary tree)";
// </gen figure-docs>

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
opts object: {kind, in, tone, shade, fill, label, legend}
  kind solid (default for Seg Box Poly Circle Curve): may touch, never overlap.
  kind surface: one-sided ground, wall, ramp, water line; bodies rest on it and may not sink in; arrow heads may pass into it.
  kind inside + in: containerId: must stay inside that Box, Poly, Circle or closed Curve (liquid in a tank).
  kind overlay: never checked (connector lines, construction lines, field lines, helper marks).
  Vec, Label, Angle, Dim are decor: a Vec is checked only at its head, never against the body it starts in.
  tone sky amber orange violet pink cyan ink muted; shade 1 asked, 2 given, 3 context; one hue per quantity; fill: true fills.
  label: "m" on a shape: a short symbol or value, placed inside or beside it by the engine. Give only the anchor.
  legend: "elephant" on a shape or Union: the object's NAME goes to a legend row under the drawing, beside a small render of it.
  A label with no room by its anchor moves to the legend by itself. Lengths and distances: Dim(A, B, "2 m"), never a loose Label.
Steps: sN = Layer([ids...], {hide: [ids], zoom: [ids], lit: [ids], title: "..."}) stacks one more step on all before it.
  Lines before the first Layer = the prefix. Lines after a Layer join it. lit = where to look, zoom = camera. No step: // layers: none.
Inline point ops are fine inside args: Seg(Mid(A, B), Off(C, 0, 1)). Arithmetic + - * / on numbers is fine.
Forward references are fine. Order: basic shapes first, then details, then vectors, then labels.
Precedence = line order: when two shapes conflict, the LATER line is blamed and must move.
More on demand: read_doc(id) with an id from this list (read one before drawing a kind of figure you have no example for):
${DOC_INDEX}${INLINE_EXAMPLES ? "\n" + INLINE_EXAMPLES : ""}
Text in labels: short, no "I", no "!", no emoji.`;

/** every doc body by id (read_doc readers use this) */
export const TOPICS = Object.fromEntries(DOCS.map(d => [d.id, d.body]));

/** the read_doc tool's topic list */
export const TOPIC_NAMES = Object.keys(TOPICS);
/** one doc body by id, or null */
export function readDoc(id) {
  return Object.prototype.hasOwnProperty.call(TOPICS, id) ? TOPICS[id] : null;
}
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
req = Box(eqc, 2.4, 0.7, 0, {tone: "orange", shade: 2, label: "6 Ω total"})`,
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
blk = Box(C, 1.6, 1.6, 30, {fill: true, tone: "muted", shade: 2})
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
front = Poly([F0, F1, F2, F3], {fill: true, tone: "muted", shade: 3})
top = Poly([F3, F2, B2, B3], {kind: "surface", fill: true, tone: "amber", shade: 2, label: "A"})
side = Poly([F1, B1, B2, F2], {fill: true, tone: "muted", shade: 2})
p1 = Vec(Off(Along(B3, B2, 0.2), 0, 1.8), Along(B3, B2, 0.2), "", {tone: "amber"})
p2 = Vec(Off(Along(B3, B2, 0.5), 0, 1.8), Along(B3, B2, 0.5), "", {tone: "amber"})
p3 = Vec(Off(Along(B3, B2, 0.8), 0, 1.8), Along(B3, B2, 0.8), "F", {tone: "amber"})
pL = Vec(Off(Mid(F0, F3), -1.8, 0), Mid(F0, F3), "P", {tone: "violet", shade: 2})
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
tank = Poly([G, Off(G, 10, 0), Off(G, 10, 4.2), Off(G, 8, 4.2), Off(G, 8, 1.6), Off(G, 5, 1.6), Off(G, 5, 4.2), Off(G, 0, 4.2)], {kind: "overlay", tone: "muted", shade: 3})
wl = Seg(G, Off(G, 0, 4.2), {kind: "surface", tone: "muted"})
wb = Seg(G, Off(G, 10, 0), {kind: "surface", tone: "muted"})
wr = Seg(Off(G, 10, 0), Off(G, 10, 4.2), {kind: "surface", tone: "muted"})
hump = Poly([Off(G, 5, 1.6), Off(G, 8, 1.6), Off(G, 8, 4.2), Off(G, 5, 4.2)], {kind: "surface", tone: "muted"})
oil = Poly([G, Off(G, 10, 0), Off(G, 10, 3.6), Off(G, 8, 3.6), Off(G, 8, 1.6), Off(G, 5, 1.6), Off(G, 5, 3.6), Off(G, 0, 3.6)], {kind: "inside", in: tank, fill: true, tone: "muted", shade: 2, legend: "oil"})
big = Box(Off(G, 2.5, 3.9), 5, 0.6, 0, {kind: "inside", in: tank, fill: true, tone: "ink"})
small = Box(Off(G, 9, 3.9), 2, 0.6, 0, {kind: "inside", in: tank, fill: true, tone: "ink"})
body = Circle(Off(G, 2.3, 5.1), 0.9, {fill: true})
head = Circle(Off(G, 3.4, 5.5), 0.45, {fill: true})
eleph = Union([body, head], {tone: "muted", legend: "elephant, 1800 kg"})
studs = Box(Off(G, 9, 4.7), 1.2, 1, 0, {fill: true, tone: "violet", shade: 2, legend: "students"})
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
lens = Curve([Off(O, 0, 2.6), Off(O, 0.35, 0), Off(O, 0, -2.6)], {closed: true, mirror: [O, Off(O, 0, 1)], fill: true, tone: "sky", shade: 3, legend: "converging lens"})
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
water = Box(Off(G, -0.6, -0.5), 9, 1, 0, {kind: "overlay", fill: true, tone: "sky", shade: 3})
lake = Seg(Off(G, -5.1, 0), Off(G, 3.9, 0), {kind: "surface", tone: "sky"})
bodyB = Box(Off(G, 0.6, 0.8), 4, 1.6, 0)
headB = Circle(Off(G, -1.55, 3.7), 0.45)
s1 = Layer([body, neck, head, beak, pouch, wing, eye], {hide: [bodyB, headB], title: "Curves: body, neck, head, beak with its pouch, wing"})
body = Curve([Off(G, -1.5, 0.95), Off(G, -0.8, 0.25), Off(G, 0.6, 0), Off(G, 2, 0.25), Off(G, 3.1, 1.05), Off(G, 1.7, 1.45), Off(G, 0, 1.6), Off(G, -1, 1.5)], {closed: true, fill: true, tone: "muted", shade: 2})
neck = Curve([Off(G, -1, 1.3), Off(G, -1.65, 2.1), Off(G, -1.2, 2.9), Off(G, -1.5, 3.5)], {w: [0.6, 0.42], fill: true, tone: "muted", shade: 2})
head = Circle(Off(G, -1.55, 3.7), 0.45, {fill: true, tone: "muted", shade: 2})
beak = Curve([Off(G, -1.9, 3.8), Off(G, -3.3, 3.5), Off(G, -4.7, 3.05), Off(G, -4.85, 2.85)], {w: [0.3, 0.08], fill: true, tone: "amber", shade: 2})
pouch = Curve([Off(G, -1.85, 3.55), Off(G, -2.5, 2.8), Off(G, -3.6, 2.75), Off(G, -4.55, 3.0), Off(G, -3.3, 3.4)], {closed: true, fill: true, tone: "orange", shade: 2})
wing = Curve([Off(G, -0.6, 1.35), Off(G, 0.8, 1.3), Off(G, 2.2, 1.05), Off(G, 3.1, 0.95)], {w: [0.75, 0.1], fill: true, tone: "ink", shade: 1})
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
A = Poly([Pt(1, 0), Pt(1, 0.6), Pt(1.5, 0.725), Pt(2, 0.9), Pt(2.5, 1.125), Pt(3, 1.4), Pt(3.5, 1.725), Pt(4, 2.1), Pt(4, 0)], {kind: "overlay", fill: true, tone: "sky", shade: 2, label: "A"})
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
cyl = Union([bot, top, sideL, sideR], {tone: "sky", shade: 2, legend: "cylinder: V = πr²h"})
s1 = Layer([cone], {lit: [cone], title: "The cone: same base, same height"})
cone = Poly([Off(O, -2, 0), Off(O, 2, 0), Off(O, 0, 5)], {kind: "overlay", fill: true, tone: "amber", shade: 2, legend: "cone: V = ⅓πr²h"})
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
nA = Circle(A, 0.42, {fill: true, tone: "sky", shade: 2, label: "A"})
nB = Circle(B, 0.42, {fill: true, tone: "sky", shade: 2, label: "B"})
nC = Circle(C, 0.42, {fill: true, tone: "sky", shade: 2, label: "C"})
nD = Circle(D, 0.42, {fill: true, tone: "sky", shade: 2, label: "D"})
nE = Circle(E, 0.42, {fill: true, tone: "sky", shade: 2, label: "E"})
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
n8 = Circle(R, 0.45, {fill: true, tone: "sky", shade: 2, label: "8"})
n3 = Circle(L, 0.45, {fill: true, tone: "sky", shade: 2, label: "3"})
n10 = Circle(Rr, 0.45, {fill: true, tone: "sky", shade: 2, label: "10"})
n1 = Circle(LL, 0.45, {fill: true, tone: "sky", shade: 2, label: "1"})
n6 = Circle(LR, 0.45, {fill: true, tone: "sky", shade: 2, label: "6"})
n14 = Circle(RR, 0.45, {fill: true, tone: "sky", shade: 2, label: "14"})
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
vert = Seg(O, D, {kind: "overlay", tone: "muted", shade: 3})
swing = Curve([Rot(O, D, -30), D, B], {kind: "overlay", tone: "muted", shade: 3})
rope = Seg(O, B, {kind: "overlay", tone: "ink", label: "L"})
th = Angle(D, O, B, "θ")
bob = Circle(B, 0.45, {fill: true, tone: "violet", shade: 2, legend: "bob, mass m"})
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
m1 = Box(Off(O, -0.8, -3.5), 1, 1, 0, {fill: true, tone: "sky", shade: 2, label: "m₁"})
m2 = Box(Off(O, 0.8, -2.2), 1.1, 1.4, 0, {fill: true, tone: "violet", shade: 2, label: "m₂"})
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
screen = Box(Pt(7, 0), 0.2, 6, 0, {fill: true, tone: "muted", shade: 2, legend: "screen"})
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
axis = Seg(Pt(0.1, 0), Pt(6.9, 0), {kind: "overlay", tone: "muted", shade: 3})
mp = Seg(Pt(0.1, 0), P, {kind: "overlay", tone: "muted", shade: 3})
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
