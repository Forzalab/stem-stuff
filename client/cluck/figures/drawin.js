// FIG-DRAW-IN (client/cluck/figures/drawin.js): a Cluck reply figure enters like a construction site: the frame, then the
// shapes, then the details, then the labels, each stroke drawn by a pen (FIG-DRAW-IN Nov 25; the GLASS-FIG-POPIN todo is dead).
// LOCKED look (Tony 09:15/09:17 PT Nov 25): .figref/fig-wireframe-mock.html row A at SPEED 1x.
//   tiers 0 frame/axes -> 1 main shapes/curves -> 2 details (arcs, guides, points, accents) -> 3 labels
//   in a tier: longest stroke first, then the stroke whose start is nearest the previous end; a stroke starts at
//   prev.start + 0.5 * prev.dur. Open lines run top->bottom / left->right (reverse via a negative dashoffset, never a new d);
//   a closed shape is one stroke. d = 260 ms * sqrt(len / svg viewBox diagonal), clamped 120-400 ms; tier gap 90 ms;
//   strokes ease cubic-bezier(.6,0,.15,1). Fills fade in 150 ms right after their own outline; dashed strokes, circles/dots
//   and non-path marks fade 150 ms. Labels fade + rise 4 px, 120 ms, staggered 40 ms, sorted y then x.
//   WAAPI only (delay + fill:'backwards'); an undrawn stroke waits at offset +-(dash+1) with dasharray "dash dash+2", in the
//   element's dash units: getTotalLength() is user units, but a vector-effect:non-scaling-stroke element paints its dash in
//   screen px, so its dash is scaled by getScreenCTM (sqrt |det|). No round-cap dot shows at either end of the wait.
//   After the last mark the animations cancel and the inline dash styles go, so a later resize / zoom draws the finished figure.
// WHEN: a FRESH reply only (cluck.js wishStart sets wish.fresh). A cached/history reply, a reload and a redraw that reuses a
//   drawn node are static. One svg animates once (data-drawn). prefers-reduced-motion: reduce or a hidden page: no animation.
//   More than 60 animated marks in a figure: one 150 ms fade of the whole figure. The static <img> fallback never animates.
// TIERS: views.js by the classes it emits (gm-*, ed/hd, nd/cm, vw-doodle b/o/k/w/e), graph.js by data-tier + .lbl, else tier 1.
// PURE: orderTier() and timelineOf() are DOM-free (tests/fig-drawin.smoke.mjs checks the order and the clamp).
const EASE = "cubic-bezier(.6,0,.15,1)";
const T = { strokeRef: 260, strokeMin: 120, strokeMax: 400, fill: 150, label: 120, stagger: 40, lift: 4, gap: 90, maxMarks: 60 };

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const num = (v, d) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };
const tagOf = el => String(el.tagName || "").toLowerCase();
/** Does not use the semantic ly1/ly2/ly3 layer: that is emphasis, not construction order. */

/** One tier in draw order: longest first, then the start nearest the previous end (never a rewrite of d). */
export function orderTier(units) {
  const left = units.slice(), out = [];
  const top = (a, b) => a.pt0.y < b.pt0.y - 0.001 || (Math.abs(a.pt0.y - b.pt0.y) <= 0.001 && a.pt0.x < b.pt0.x - 0.001);
  let first = 0;
  for (let i = 1; i < left.length; i++) {
    if (left[i].len > left[first].len + 0.001 || (Math.abs(left[i].len - left[first].len) <= 0.001 && top(left[i], left[first]))) first = i;
  }
  out.push(left.splice(first, 1)[0]);
  while (left.length) {
    const prev = out[out.length - 1], pe = prev.pt1 || prev.pt0;
    let best = 0, bestD = Infinity;
    left.forEach((u, i) => {
      const d = Math.hypot(u.pt0.x - pe.x, u.pt0.y - pe.y);
      if (d < bestD - 0.001 || (Math.abs(d - bestD) <= 0.001 && top(u, left[best]))) { bestD = d; best = i; }
    });
    out.push(left.splice(best, 1)[0]);
  }
  return out;
}

/** The whole figure's clock, pure: tiers in order (gap 90), fills after their outline, labels last (40 ms apart). */
export function timelineOf(units, labels = [], diag = 1) {
  const d = Number.isFinite(diag) && diag > 0 ? diag : 1;
  for (const u of units) {
    u.dur = u.kind === "stroke" ? clamp(T.strokeRef * Math.sqrt(u.len / d), T.strokeMin, T.strokeMax) : T.fill;
    u.start = null; u.end = null;
  }
  let cursor = 0;
  for (let tier = 0; tier <= 2; tier++) {
    const list = units.filter(u => u.tier === tier);
    if (!list.length) continue;
    const ord = orderTier(list);
    ord.forEach((u, i) => {
      u.start = i === 0 ? cursor : ord[i - 1].start + 0.5 * ord[i - 1].dur;
      u.end = u.start + u.dur;
    });
    cursor = Math.max(...ord.map(u => u.end)) + T.gap;
  }
  const fills = units.filter(u => u.kind === "stroke" && u.selfFill).map(u => ({ el: u.el, start: u.start + u.dur, dur: T.fill }));
  const sorted = labels.slice().sort((a, b) => (a.y - b.y) || (a.x - b.x));
  const labs = sorted.map((l, i) => ({ el: l.el, start: cursor + i * T.stagger, dur: T.label }));
  let total = 0;
  for (const u of units) if (u.end != null) total = Math.max(total, u.end);
  for (const f of fills) total = Math.max(total, f.start + f.dur);
  for (const l of labs) total = Math.max(total, l.start + l.dur);
  return { units, fills, labels: labs, total };
}

const DEFS = /^(defs|clippath|mask|marker|symbol|pattern|lineargradient|radialgradient|filter)$/i;
function inDefs(el) {
  for (let n = el.parentNode; n && n.nodeType === 1; n = n.parentNode) if (DEFS.test(n.tagName)) return true;
  return false;
}

/** The CSS px one user unit paints as: viewBox fit, the element's own transform, any CSS scale. 1 when it cannot be measured. */
function screenScale(el) {
  try {
    const m = el.getScreenCTM && el.getScreenCTM();
    if (m) { const s = Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)); if (s > 0 && Number.isFinite(s)) return s; }
  } catch { /* not rendered: the user-unit length stands */ }
  return 1;
}

/* ---- the tier table: the real DOM each renderer emits (unknown element -> tier 1) ---- */
function tierOf(el) {
  const tag = tagOf(el), c = el.classList;
  if (tag === "text") return 3;
  if (el.closest(".vw-doodle")) return c.contains("e") || c.contains("k") ? 2 : 1;   // eye + beak are details, body/wing/ground are shapes
  const dt = el.getAttribute("data-tier");                                           // graph.js writes it at emit time
  if (dt != null && dt !== "") { const n = +dt; if (Number.isFinite(n)) return n; }
  if (el.closest(".gm-pt")) return 2;                                                // a point dot
  if (el.closest(".gm-arrow")) return 1;                                             // a vector + its head
  if (el.closest(".gm-dim")) return 2;                                               // a dimension guide
  if (c.contains("gm-angle") || c.contains("gm-right")) return 2;                    // an angle arc / right box
  if (el.closest(".gm-lead")) return 2;                                              // a label leader
  if (el.closest(".gm")) return 1;                                                   // a segment / polygon / circle: the shape
  if (c.contains("ed")) return 1;                                                    // views.js graph edge
  if (c.contains("hd")) return 2;                                                    // views.js graph arrowhead (an accent)
  if (el.closest(".nd, .cm")) return 1;                                              // views.js graph node
  if (el.closest(".lead")) return 2;                                                 // graph.js label leader
  if (/var\(--grid\)/.test(el.getAttribute("style") || "")) return 0;                // graph.js grid/graticule
  return 1;
}

/** One drawable mark: a stroke (dash-drawn) or a fade (dashed, circle/dot, fill-only/non-path). null = invisible. */
function unitOf(el, tier, win) {
  const tag = tagOf(el), cs = win.getComputedStyle(el);
  const stroke = !!cs.stroke && cs.stroke !== "none" && num(cs.strokeWidth, 0) > 0;
  const fill = tag !== "line" && tag !== "polyline" && !!cs.fill && cs.fill !== "none";
  if (!stroke && !fill) return null;
  const dashed = (el.getAttribute("stroke-dasharray") || cs.strokeDasharray || "none") !== "none";
  let len = 0;
  if (stroke && !dashed && tag !== "circle" && tag !== "ellipse") { try { len = el.getTotalLength() || 0; } catch { len = 0; } }
  if (!(len > 0)) {                                          // dashed stroke, circle/dot, fill-only: a 150 ms opacity fade
    let b = null;
    try { b = el.getBBox(); } catch { b = null; }
    const pt = b && (b.width > 0 || b.height > 0) ? { x: b.x + b.width / 2, y: b.y + b.height / 2 } : { x: 0, y: 0 };
    return { el, tier, kind: "fade", len: 0, pt0: pt, pt1: null, selfFill: false };
  }
  const closed = tag === "polygon" || tag === "rect" || /z\s*$/i.test(el.getAttribute("d") || "");
  let p0 = { x: 0, y: 0 }, p1 = { x: 0, y: 0 }, reversed = false;
  try {
    const a = el.getPointAtLength(0), b = el.getPointAtLength(len);
    p0 = { x: a.x, y: a.y }; p1 = { x: b.x, y: b.y };
    if (!closed) {                                           // top -> bottom, else left -> right; a negative offset reverse-draws
      const dx = p1.x - p0.x, dy = p1.y - p0.y;
      reversed = Math.abs(dx) >= Math.abs(dy) ? dx < 0 : dy < 0;
      if (reversed) { const q = p0; p0 = p1; p1 = q; }
    }
  } catch { /* no points: the sort sees the origin */ }
  return { el, tier, kind: "stroke", len, closed, reversed, selfFill: fill, pt0: p0, pt1: p1, dash: len * (cs.vectorEffect === "non-scaling-stroke" ? screenScale(el) : 1) };
}

function labelOf(el, win, html) {
  if (html) {
    const r = el.getBoundingClientRect ? el.getBoundingClientRect() : null;
    return { el, x: r ? r.left + r.width / 2 : 0, y: r ? r.top + r.height / 2 : 0 };
  }
  try { const b = el.getBBox(); return { el, x: b.x + b.width / 2, y: b.y + b.height / 2 }; }
  catch { const r = el.getBoundingClientRect ? el.getBoundingClientRect() : null; return { el, x: r ? r.left + r.width / 2 : 0, y: r ? r.top + r.height / 2 : 0 }; }
}

function figureOf(svg, win) {
  const units = [], labels = [];
  for (const el of svg.querySelectorAll("path,line,polyline,polygon,circle,ellipse,rect")) {
    if (inDefs(el)) continue;
    const tier = tierOf(el);
    if (tier > 2) continue;
    const u = unitOf(el, tier, win);
    if (u) units.push(u);
  }
  for (const el of svg.querySelectorAll("text")) if (!inDefs(el)) labels.push(labelOf(el, win, false));
  const host = svg.closest(".wfig, .fig, .vw-fig, .vw-doodle");
  if (host && host !== svg && host.querySelectorAll) for (const el of host.querySelectorAll(".lbl")) if (!el.closest(".vw-steps")) labels.push(labelOf(el, win, true));
  return { units, labels };
}

function diagOf(svg) {
  const vb = svg.viewBox && svg.viewBox.baseVal;
  if (vb && vb.width > 0 && vb.height > 0) return Math.hypot(vb.width, vb.height);
  const r = svg.getBoundingClientRect ? svg.getBoundingClientRect() : null;
  return r && r.width > 0 && r.height > 0 ? Math.hypot(r.width, r.height) : 320;
}

/**
 * drawIn(root, { fresh }) -> { total, cancel }
 * Animates every not-yet-drawn figure svg in root (a Cluck reply's .wfig) when the reply is fresh. A Steps anchor,
 * a legend sample, an icon, KaTeX's own svg and the static <img> fallback are never touched. total = ms, cancel = stop now.
 */
export function drawIn(root, opts = {}) {
  const none = { total: 0, cancel() {} };
  if (!root || !opts.fresh || !root.querySelectorAll) return none;
  const doc = root.ownerDocument || (typeof document !== "undefined" ? document : null);
  const win = doc && (doc.defaultView || (typeof window !== "undefined" ? window : null));
  if (!doc || !win) return none;
  if (win.matchMedia && win.matchMedia("(prefers-reduced-motion: reduce)").matches) return none;
  if (doc.hidden) return none;
  if ((root.classList && root.classList.contains("wstatic")) || root.querySelector("img.vw-static, .vw-static")) return none;
  const skip = ".vw-steps, .vw-mark, .vw-ico, .katex, .vw-static, button";
  const svgs = [];
  if (tagOf(root) === "svg") svgs.push(root);
  else for (const s of root.querySelectorAll("svg")) svgs.push(s);
  const keep = svgs.filter(s => !s.closest(skip) && !s.hasAttribute("data-drawn"));
  if (!keep.length) return none;
  const anims = [], touched = [];
  let total = 0, over = false;
  const restore = t => {
    if (t.a) t.el.style.setProperty("stroke-dasharray", t.a); else t.el.style.removeProperty("stroke-dasharray");
    if (t.b) t.el.style.setProperty("stroke-dashoffset", t.b); else t.el.style.removeProperty("stroke-dashoffset");
  };
  const clear = () => {
    if (over) return;
    over = true;
    for (const a of anims) { try { a.cancel(); } catch { /* gone */ } }
    anims.length = 0;
    for (const t of touched) restore(t);
    touched.length = 0;
  };
  for (const svg of keep) {
    svg.setAttribute("data-drawn", "");
    const fig = figureOf(svg, win);
    if (!fig.units.length && !fig.labels.length) continue;
    if (fig.units.length + fig.labels.length > T.maxMarks) {           // perf: one quiet fade, not 60+ pens
      const to = num(win.getComputedStyle(svg).opacity, 1);
      anims.push(svg.animate([{ opacity: 0 }, { opacity: String(to) }], { duration: T.fill, easing: "ease-out", fill: "backwards" }));
      total = Math.max(total, T.fill);
      continue;
    }
    const tl = timelineOf(fig.units, fig.labels, diagOf(svg));
    total = Math.max(total, tl.total);
    for (const u of tl.units) {
      if (u.kind === "stroke") {
        const dash = u.dash || u.len;                              // screen px when the element paints non-scaling
        const from = u.reversed ? -(dash + 1) : (dash + 1);       // no round-cap dot at either end of the wait
        touched.push({ el: u.el, a: u.el.style.getPropertyValue("stroke-dasharray"), b: u.el.style.getPropertyValue("stroke-dashoffset") });
        u.el.style.setProperty("stroke-dasharray", `${dash} ${dash + 2}`);
        u.el.style.setProperty("stroke-dashoffset", "0");
        anims.push(u.el.animate([{ strokeDashoffset: String(from) }, { strokeDashoffset: "0" }], { duration: u.dur, delay: u.start, easing: EASE, fill: "backwards" }));
      } else {
        const to = num(win.getComputedStyle(u.el).opacity, 1);
        anims.push(u.el.animate([{ opacity: 0 }, { opacity: String(to) }], { duration: u.dur, delay: u.start, easing: "ease-out", fill: "backwards" }));
      }
    }
    for (const f of tl.fills) {
      const to = num(win.getComputedStyle(f.el).fillOpacity, 1);
      if (!(to > 0)) continue;
      anims.push(f.el.animate([{ fillOpacity: 0 }, { fillOpacity: String(to) }], { duration: f.dur, delay: f.start, easing: "linear", fill: "backwards" }));
    }
    for (const l of tl.labels) {
      const to = num(win.getComputedStyle(l.el).opacity, 1);
      anims.push(l.el.animate([{ opacity: 0, translate: `0 ${T.lift}px` }, { opacity: String(to), translate: "0 0" }], { duration: l.dur, delay: l.start, easing: "ease-out", fill: "backwards" }));
    }
  }
  if (!anims.length) { clear(); return none; }
  Promise.all(anims.map(a => a.finished.catch(() => {}))).then(clear);
  return { total, cancel: clear };
}
