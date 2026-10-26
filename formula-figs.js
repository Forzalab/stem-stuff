/* formula-figs.js: a small picture for the formula sheet rows that are hard to read as symbols alone (Tony, Oct 26; design/FORMULA-FIGS.md).
   { <sheet row id>: <SCHEMA.md graph block> }. Drawn by graph.js under the formula in the "?" doc popover (app.js docHTML); role="img", its alt
   is the label. Author-time data only, no new format: each value is a plain "scene" graph block (tests/formula-figs.test.mjs checks the schema).
   Colours follow DESIGN-LANGUAGE.md: forces c1 (filled head), velocity c2 (open head); guides dashed muted. Angles: degrees CCW from +x, y up. */
(function (root) {
  "use strict";
  const F = {};

  /* τ = rF sinθ: the push at the rod's end, θ measured from the rod's line; the lever arm r sinθ is the perpendicular from the pivot to F's line.
     F at 60° on a 3 m rod: the foot of that perpendicular is (3,0) − 1.5·(cos60°, sin60°) = (2.25, −1.30), and |lever| = 3 sin60° = 2.60 */
  F.TORQUE = { type: "graph", kind: "scene",
    alt: "A rod on a pivot with a push F at its far end, at angle theta to the rod; a dashed line from the pivot meets the push's line at a right angle, and that distance is r sin theta.",
    marks: [
      { mark: "body", at: [1.5, 0], shape: "rod", w: 3, h: 0.14 },
      { mark: "pivot", at: [0, 0] },
      { mark: "seg", from: [3, 0], to: [4.1, 0], dash: true },
      { mark: "seg", from: [3, 0], to: [2.25, -1.299], dash: true },
      { mark: "seg", from: [0, 0], to: [2.25, -1.299], color: "ink", label: "$r\\sin\\theta$", anchor: "sw" },
      { mark: "right", at: [2.25, -1.299], from: [0, 0], to: [3, 0] },
      { mark: "dim", from: [0, 0], to: [3, 0], label: "$r$" },
      { mark: "force", at: [3, 0], angle: 60, len: 1.6, label: "$\\vec F$" },
      { mark: "angle", at: [3, 0], from: [4.1, 0], to: [3.8, 1.386], label: "$\\theta$", r: 0.45 }
    ] };

  /* W = Fd cosθ: θ is between F and the motion d; only F cosθ (the part along d) does work. F 2.4 at 35° from the box's center (0.6, 0.5):
     F cos35° = 1.966, F sin35° = 1.377, tip (2.566, 1.877) */
  F.WORK = { type: "graph", kind: "scene",
    alt: "A box slides to the right along the floor by d while a push F pulls at angle theta above the floor; the dashed part of F along the floor is F cos theta.",
    marks: [
      { mark: "surface", from: [-0.4, 0], to: [4.2, 0], side: "right" },
      { mark: "body", at: [0.6, 0.5], shape: "box", w: 1.2, h: 1 },
      { mark: "arrow", from: [0.6, 0.5], to: [2.566, 0.5], dash: true, color: "c1", label: "$F\\cos\\theta$", anchor: "s" },
      { mark: "seg", from: [2.566, 1.877], to: [2.566, 0.5], dash: true },
      { mark: "force", at: [0.6, 0.5], angle: 35, len: 2.4, label: "$\\vec F$" },
      { mark: "angle", at: [0.6, 0.5], from: [2.566, 0.5], to: [2.566, 1.877], label: "$\\theta$", r: 0.8 },
      { mark: "arrow", from: [0, -0.5], to: [3.9, -0.5], label: "$\\vec d$", anchor: "s" }
    ] };

  /* I = Σ m r²: three point masses, each at its own distance from the spin axis (the dot, out of the page) */
  F.I_SUM = { type: "graph", kind: "scene",
    alt: "Three small masses around a spin axis, each at its own distance r from the axis; every mass adds its m times r squared.",
    marks: [
      { mark: "arc", at: [0, 0], r: 0.45, from: 150, to: 260, arrow: true, color: "muted" },
      { mark: "seg", from: [0, 0], to: [1.3, 0.5], dash: true, label: "$r_1$", anchor: "n" },
      { mark: "seg", from: [0, 0], to: [-1.7, 0.6], dash: true, label: "$r_2$", anchor: "n" },
      { mark: "seg", from: [0, 0], to: [1.6, -1.6], dash: true, label: "$r_3$", anchor: "ne" },
      { mark: "point", at: [0, 0] },
      { mark: "body", at: [1.3, 0.5], shape: "dot", r: 0.13, label: "$m_1$", anchor: "ne" },
      { mark: "body", at: [-1.7, 0.6], shape: "dot", r: 0.13, label: "$m_2$", anchor: "nw" },
      { mark: "body", at: [1.6, -1.6], shape: "dot", r: 0.13, label: "$m_3$", anchor: "se" }
    ] };

  /* v_t = rω: on a spinning wheel every point turns at the same ω; its speed is along the rim (perpendicular to r) and grows with r.
     Rim point at 40°: (1.149, 0.964); v_t at 130° (CCW tangent), 1.3 long; the point at half the radius gets half the arrow */
  F.VT = { type: "graph", kind: "scene",
    alt: "A wheel spinning at omega; a point on the rim at distance r from the center moves along the rim, perpendicular to r, and a point halfway out moves half as fast.",
    marks: [
      { mark: "circle", c: [0, 0], r: 1.5, color: "muted" },
      { mark: "arc", at: [0, 0], r: 0.45, from: 170, to: 280, arrow: true, label: "$\\omega$", anchor: "sw" },
      { mark: "seg", from: [0, 0], to: [1.149, 0.964], label: "$r$", anchor: "se" },
      { mark: "right", at: [1.149, 0.964], from: [0, 0], to: [0.313, 1.96] },
      { mark: "point", at: [0, 0] },
      { mark: "point", at: [0.575, 0.482] },
      { mark: "point", at: [1.149, 0.964] },
      { mark: "force", at: [0.575, 0.482], angle: 130, len: 0.65, color: "c2", label: "$\\vec v$" },
      { mark: "force", at: [1.149, 0.964], angle: 130, len: 1.3, color: "c2", label: "$\\vec v_t$" }
    ] };

  /* s = rθ: the arc length cut off by the angle θ (in radians) on a circle of radius r */
  F.ARC = { type: "graph", kind: "scene",
    alt: "A slice of a circle: two radii r with the angle theta between them, and the curved length s along the circle between their ends.",
    marks: [
      { mark: "arc", at: [0, 0], r: 2, from: -15, to: 75, dash: true, color: "muted" },
      { mark: "seg", from: [0, 0], to: [2, 0], label: "$r$", anchor: "s" },
      { mark: "seg", from: [0, 0], to: [1.286, 1.532], label: "$r$", anchor: "nw" },
      { mark: "arc", at: [0, 0], r: 2, from: 0, to: 50, color: "c2", label: "$s$" },
      { mark: "angle", at: [0, 0], from: [2, 0], to: [1.286, 1.532], label: "$\\theta$", r: 0.5 },
      { mark: "point", at: [0, 0] }
    ] };

  /* F_s = −kΔx: the block is pulled right of where the spring is relaxed (x = 0); the spring pulls it back left: the minus sign */
  F.HOOKE = { type: "graph", kind: "scene",
    alt: "A spring from a wall to a block; the block is pulled right of where the spring is relaxed by delta x, and the spring force on it points the other way, back to the left.",
    marks: [
      { mark: "surface", from: [0, 0], to: [0, 1.4], side: "left" },
      { mark: "surface", from: [0, 0], to: [4.2, 0], side: "right" },
      { mark: "spring", from: [0, 0.6], to: [2.6, 0.6], coils: 8, width: 0.22 },
      { mark: "seg", from: [2, -0.7], to: [2, 1.45], dash: true },
      { mark: "seg", from: [2.6, -0.7], to: [2.6, 0], dash: true },
      { mark: "text", at: [2, 1.45], text: "$x=0$", anchor: "n" },
      { mark: "body", at: [3.2, 0.6], shape: "box", w: 1.2, h: 1.2 },
      { mark: "arrow", from: [2, -0.55], to: [2.6, -0.55], label: "$\\Delta\\vec x$", anchor: "s" },
      { mark: "force", at: [3.2, 0.6], angle: 180, len: 1.1, label: "$\\vec F_s$", anchor: "s" }
    ] };

  /* P = P0 + ρgh: the pressure at depth h is the surface pressure plus the weight of the water column above */
  F.P_DEPTH = { type: "graph", kind: "scene",
    alt: "A tank of water open to the air: pressure P0 at the surface, and a point h below the surface where the pressure is P.",
    marks: [
      { mark: "poly", pts: [[0, 0], [3.4, 0], [3.4, 2.2], [0, 2.2]], fill: true, color: "c1" },
      { mark: "rope", pts: [[0, 2.8], [0, 0], [3.4, 0], [3.4, 2.8]] },
      { mark: "arrow", from: [2.4, 2.9], to: [2.4, 2.25], color: "muted", label: "$P_0$", anchor: "e" },
      { mark: "dim", from: [0.5, 2.2], to: [0.5, 0.8], label: "$h$", side: "l" },
      { mark: "seg", from: [0.5, 0.8], to: [2.4, 0.8], dash: true },
      { mark: "point", at: [2.4, 0.8], label: "$P$", anchor: "e" }
    ] };

  /* B = ρ_fluid V g: a fully under-water object pushes aside its own volume of water; that water's weight is the push up B, whatever it is made of.
     Drawn as a sinking stone (mg > B): B is there even when it sinks */
  F.BUOY = { type: "graph", kind: "scene",
    alt: "A stone fully under water: the water pushes up on it with the buoyant force B and gravity pulls down with mg; the water it pushes aside has the stone's own volume.",
    marks: [
      { mark: "poly", pts: [[0, 0], [3.4, 0], [3.4, 2.4], [0, 2.4]], fill: true, color: "c1" },
      { mark: "rope", pts: [[0, 2.9], [0, 0], [3.4, 0], [3.4, 2.9]] },
      { mark: "body", at: [1.7, 1.2], shape: "box", w: 1, h: 0.7, label: "$V$" },
      { mark: "force", at: [1.7, 1.2], angle: 90, len: 0.9, label: "$\\vec B$" },
      { mark: "force", at: [1.7, 1.2], angle: 270, len: 1.15, label: "$m\\vec g$" }
    ] };

  /* ρ_obj/ρ_fluid = V_disp/V_obj: a floating block sits with the same fraction under water as its density is of the water's (60% here) */
  F.BUOY_FLOAT = { type: "graph", kind: "scene",
    alt: "A block floating in water: the part below the waterline is the fluid displaced, and that share of the whole block equals its density over the water's.",
    marks: [
      { mark: "poly", pts: [[0, 0], [3.6, 0], [3.6, 1.8], [0, 1.8]], fill: true, color: "c1" },
      { mark: "rope", pts: [[0, 2.6], [0, 0], [3.6, 0], [3.6, 2.6]] },
      { mark: "poly", pts: [[0.9, 1.8], [2.7, 1.8], [2.7, 2.2], [0.9, 2.2]], color: "ink" },
      { mark: "poly", pts: [[0.9, 1.2], [2.7, 1.2], [2.7, 1.8], [0.9, 1.8]], fill: true, color: "ink", label: "$V_{fluid\\ displaced}$" },
      { mark: "dim", from: [0.9, 2.2], to: [0.9, 1.2], label: "$V_{object}$", side: "r" }
    ] };

  /* x_cg = Σ m x / Σ m: m1 = 2 units at x = 1, m2 = 1 unit at x = 4 → x_cg = (2·1 + 1·4)/3 = 2: the balance point sits nearer the heavy mass */
  F.CG_X = { type: "graph", kind: "scene",
    alt: "A light bar with a heavy mass m1 near the left and a light mass m2 near the right; it balances on a point at x cg, closer to the heavier mass.",
    marks: [
      { mark: "arrow", from: [0, 0], to: [4.8, 0], color: "muted" },
      { mark: "text", at: [4.8, 0], text: "$x$", anchor: "e" },
      { mark: "body", at: [2.5, 0.75], shape: "rod", w: 3.4, h: 0.1 },
      { mark: "pivot", at: [2, 0.7] },
      { mark: "seg", from: [1, 0.75], to: [1, 0], dash: true },
      { mark: "seg", from: [4, 0.75], to: [4, 0], dash: true },
      { mark: "seg", from: [2, 0.4], to: [2, 0], dash: true },
      { mark: "body", at: [1, 1.09], shape: "dot", r: 0.28, label: "$m_1$", anchor: "n" },
      { mark: "body", at: [4, 1.01], shape: "dot", r: 0.2, label: "$m_2$", anchor: "n" },
      { mark: "point", at: [1, 0], label: "$x_1$", anchor: "s" },
      { mark: "point", at: [4, 0], label: "$x_2$", anchor: "s" },
      { mark: "point", at: [2, 0], color: "c1", label: "$x_{cg}$", anchor: "s" }
    ] };

  /* v0x = v0 cosθ0, v0y = v0 sinθ0: the launch velocity as two perpendicular parts; θ0 from the ground. v0 3 at 35°: (2.457, 1.721) */
  F.V0X = { type: "graph", kind: "scene",
    alt: "A launch velocity v0 at angle theta0 above the ground, split into a sideways part v0 cos theta0 and an upward part v0 sin theta0.",
    marks: [
      { mark: "arrow", from: [0, 0], to: [2.457, 0], dash: true, color: "c2", label: "$v_0\\cos\\theta_0$", anchor: "s" },
      { mark: "arrow", from: [2.457, 0], to: [2.457, 1.721], dash: true, color: "c2", label: "$v_0\\sin\\theta_0$", anchor: "e" },
      { mark: "right", at: [2.457, 0], from: [0, 0], to: [2.457, 1.721] },
      { mark: "force", at: [0, 0], angle: 35, len: 3, color: "c2", label: "$\\vec v_0$", anchor: "nw" },
      { mark: "angle", at: [0, 0], from: [2.457, 0], to: [2.457, 1.721], label: "$\\theta_0$", r: 0.7 },
      { mark: "point", at: [0, 0] }
    ] };
  F.V0Y = F.V0X;

  root.FormulaFigs = F;
})(window);
