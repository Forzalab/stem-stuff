/* graph.js: renders a problem "graph" block (SCHEMA.md) into an element.
   Ported from design/specimen.html; every number comes from design/DESIGN-LANGUAGE.md.
   Needs math.js (expressions) and KaTeX (labels) as globals; draws plain-text labels if KaTeX is missing.

   Graph.render(el, block)   draws (again) at el's current width
*/
(function (root) {
  "use strict";
  const SW = { grid: 1, axis: 1.5, con: 1.5, rope: 1.5, out: 2, curve: 2.5, vec: 2.5, force: 3 };
  const DASH = { asym: "6 4", guide: "2 4", ghost: "8 5", traj: "0 7" };
  const HATCH = { len: 10, gap: 8, inset: 4 };
  const OFF = 6, PAD = 16, FILL = 0.22;
  const deg = Math.PI / 180;
  const col = c => `var(--${c || "ink"})`;
  const esc = s => String(s).replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]);

  function tex(s) {
    if (typeof katex === "undefined") return esc(String(s).replace(/\$/g, ""));
    return String(s).split("$").map((t, i) => i % 2 ? katex.renderToString(t, { throwOnError: false }) : esc(t)).join("");
  }

  /* ---- JSON -> drawable: numbers may be math.js strings, expressions become functions ---- */
  const STR = new Set(["mark", "label", "text", "color", "anchor", "shape", "side", "alt", "kind", "type", "unit", "var", "sty"]);
  const EXPR = { fn: { y: "x" }, param: { x: "t", y: "t" }, shade: { f: 1, g: 1 }, tangent: { of: "x" }, path: { x: "t", y: "t", fn: "x" } };
  const evalNum = v => { const r = math.evaluate(String(v)); return typeof r === "number" ? r : math.number(r); };
  function numify(v, key) {
    if (Array.isArray(v)) return v.map(x => numify(x, key));
    if (v && typeof v === "object") { const o = {}; for (const k in v) o[k] = numify(v[k], k); return o; }
    if (typeof v === "string" && !STR.has(key)) return evalNum(v);
    return v;
  }
  function fnOf(expr, name) {
    const c = math.compile(String(expr));
    return x => { try { const r = c.evaluate({ [name]: x }); return typeof r === "number" ? r : NaN; } catch { return NaN; } };
  }
  function prepMark(m, kind) {
    const ex = EXPR[m.mark] || {}, out = {};
    for (const k in m) {
      if (k in ex && !(m.mark === "path" && k !== "fn" && !m.t)) {
        const v = m.mark === "shade" ? (m.var || "x") : ex[k];
        out[k] = fnOf(m[k], v);
      } else out[k] = numify(m[k], k);
    }
    if (m.mark === "shade" && !out.g) out.g = () => 0;
    return out;
  }

  const n2 = v => +(+v).toFixed(2);
  const P = a => a.map(p => n2(p[0]) + "," + n2(p[1])).join(" ");
  const norm = (x, y) => { const l = Math.hypot(x, y) || 1; return [x / l, y / l]; };
  const fin = p => Number.isFinite(p[0]) && Number.isFinite(p[1]);
  function line(pts, st, w, dash) {
    return `<polyline points="${P(pts)}" fill="none" style="stroke:${st}" stroke-width="${w}"${dash ? ` stroke-dasharray="${dash}"` : ""}/>`;
  }
  /* split a sampled curve at non-finite points and big jumps (asymptotes) */
  function curve(pts, st, w, dash, H) {
    let s = "", run = [];
    const flush = () => { if (run.length > 1) s += line(run, st, w, dash); run = []; };
    for (const p of pts) {
      if (!fin(p) || Math.abs(p[1]) > 20 * H) { flush(); continue; }
      if (run.length && Math.abs(p[1] - run[run.length - 1][1]) > 2 * H) flush();
      run.push(p);
    }
    flush();
    return s;
  }
  function arrow(a, b, w, st, head = "fill", dash) {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const [ux, uy] = norm(b[0] - a[0], b[1] - a[1]), nx = -uy, ny = ux;
    let L = Math.max(8, 4 * w); if (len < 1.6 * L) L = len / 1.6;
    const W = 0.75 * L;
    const wedge = t => { const bx = t[0] - L * ux, by = t[1] - L * uy;
      return `<polygon points="${P([t, [bx + W / 2 * nx, by + W / 2 * ny], [bx - W / 2 * nx, by - W / 2 * ny]])}" style="fill:${st};stroke:${st}" stroke-width="1"/>`; };
    const cut = head === "fill" ? 0.6 * L : head === "double" ? 1.35 * L : head === "open" ? 0.3 * w : 0;
    let s = line([a, [b[0] - cut * ux, b[1] - cut * uy]], st, w, dash);
    if (head === "fill") s += wedge(b);
    if (head === "double") s += wedge(b) + wedge([b[0] - 0.75 * L * ux, b[1] - 0.75 * L * uy]);
    if (head === "open") { const bx = b[0] - L * ux, by = b[1] - L * uy;
      s += line([[bx + W / 2 * nx, by + W / 2 * ny], b, [bx - W / 2 * nx, by - W / 2 * ny]], st, w); }
    return s;
  }
  function dirAnchor(dx, dy) {
    const a = (Math.atan2(-dy, dx) / deg + 360 + 22.5) % 360;
    return ["e", "ne", "n", "nw", "w", "sw", "s", "se"][Math.floor(a / 45)];
  }
  const labelColor = c => ["c1", "c2", "c3", "ok", "bad", "mark"].includes(c) ? col(c) : col("ink");
  /* Locked rule: every force arrow is c1. Only velocity (c2) and acceleration (c3) keep their own colour;
     a "force" mark is treated as one of those only when its label is \vec v... or \vec a... */
  const KIN = /^\$?\\vec\s*\{?\s*[va](?![a-zA-Z])/;
  function vecStyle(m) {
    const kin = typeof m.label === "string" && KIN.test(m.label.trim());
    const c = kin ? (m.color || "c1") : "c1";
    if (c === "c2") return { c, w: SW.vec, head: "open" };
    if (c === "c3") return { c, w: SW.vec, head: "double" };
    return { c, w: m.dash ? SW.out : SW.force, head: "fill" };
  }
  const rot = (p, a) => [p[0] * Math.cos(a) - p[1] * Math.sin(a), p[0] * Math.sin(a) + p[1] * Math.cos(a)];
  const add = (p, q) => [p[0] + q[0], p[1] + q[1]];
  function forceTip(m) { const a = (m.angle + (m.frame || 0)) * deg; return add(m.at, [m.len * Math.cos(a), m.len * Math.sin(a)]); }
  function inclinePts(m) {
    const sx = m.flip ? -1 : 1, B = add(m.at, [sx * m.base, 0]);
    return [m.at, B, add(B, [0, m.base * Math.tan(m.angle * deg)])];
  }
  function sample(m, n = 160) {
    if (m.pts) return m.pts;
    const out = [];
    if (typeof m.fn === "function") { const [a, b] = m.domain; for (let i = 0; i <= n; i++) { const x = a + (b - a) * i / n; out.push([x, m.fn(x)]); } return out; }
    const [t0, t1] = m.t;
    for (let i = 0; i <= n; i++) { const t = t0 + (t1 - t0) * i / n; out.push([m.x(t), m.y(t)]); }
    return out.filter(fin);
  }
  function pointSvg(x, y, m) {
    return m.open
      ? `<circle cx="${n2(x)}" cy="${n2(y)}" r="4.5" style="fill:var(--body);stroke:${col(m.color)}" stroke-width="${SW.out}"/>`
      : `<circle cx="${n2(x)}" cy="${n2(y)}" r="4.5" style="fill:${col(m.color)}"/>`;
  }
  function arcPath(c, r, a0, a1, st, w, dash = "") {
    const p = a => [c[0] + r * Math.cos(a * deg), c[1] - r * Math.sin(a * deg)];
    if (Math.abs(a1 - a0) >= 359.99) return `<circle cx="${n2(c[0])}" cy="${n2(c[1])}" r="${n2(r)}" fill="none" style="stroke:${st}" stroke-width="${w}"${dash ? ` stroke-dasharray="${dash}"` : ""}/>`;
    const [s, e] = [p(a0), p(a1)], big = Math.abs(a1 - a0) > 180 ? 1 : 0, sweep = a1 > a0 ? 0 : 1;
    return `<path d="M${n2(s[0])} ${n2(s[1])}A${n2(r)} ${n2(r)} 0 ${big} ${sweep} ${n2(e[0])} ${n2(e[1])}" fill="none" style="stroke:${st}" stroke-width="${w}"${dash ? ` stroke-dasharray="${dash}"` : ""}/>`;
  }
  function hatch(a, b, side) {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]), [ux, uy] = norm(b[0] - a[0], b[1] - a[1]);
    const sg = side === "left" ? -1 : 1, nx = -uy * sg, ny = ux * sg;
    const hx = (nx - ux) * Math.SQRT1_2, hy = (ny - uy) * Math.SQRT1_2;
    let s = "";
    for (let t = HATCH.inset + HATCH.len * Math.SQRT1_2; t <= L - HATCH.inset + 0.01; t += HATCH.gap) {
      const q = [a[0] + t * ux, a[1] + t * uy];
      s += `<line x1="${n2(q[0])}" y1="${n2(q[1])}" x2="${n2(q[0] + HATCH.len * hx)}" y2="${n2(q[1] + HATCH.len * hy)}" style="stroke:var(--muted)" stroke-width="${SW.con}"/>`;
    }
    return s;
  }

  /* ---- marks shared by scene and cartesian: pts(m) in world units, draw(m, k) -> svg ---- */
  const LAYER = { surface: 0, incline: 1, poly: 2, seg: 2, arc: 2, path: 3, rope: 4, spring: 4, pulley: 5, body: 6, pivot: 7, point: 8, axes: 8, force: 9, arrow: 9, text: 10 };
  const S = {
    surface: { pts: m => [m.from, m.to], draw: (m, k) => { const a = k.X(m.from), b = k.X(m.to); return line([a, b], col(m.color), SW.out) + hatch(a, b, m.side); } },
    incline: {
      pts: inclinePts,
      draw(m, k) {
        const v = inclinePts(m).map(k.X);
        let s = `<polygon points="${P(v)}" style="fill:var(--body);stroke:${col(m.color)}" stroke-width="${SW.out}"/>`;
        s += hatch(v[0], v[1], m.flip ? "left" : "right");
        const r = 30, a0 = m.flip ? 180 - m.angle : 0, a1 = m.flip ? 180 : m.angle;
        s += arcPath(v[0], r, a0, a1, col("muted"), SW.con);
        const mid = (a0 + a1) / 2 * deg, d = [Math.cos(mid), -Math.sin(mid)];
        if (m.label) k.label(m.label, [v[0][0] + d[0] * (r + 2), v[0][1] + d[1] * (r + 2)], m.anchor || dirAnchor(d[0], d[1]), "ink");
        return s;
      }
    },
    body: {
      pts: m => { const h = m.h || 2 * (m.r || 0), w = m.w || 2 * (m.r || 0);
        return [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(p => add(m.at, rot(p, (m.angle || 0) * deg))); },
      draw(m, k) {
        const [x, y] = k.X(m.at), st = col(m.color);
        /* outline only (DESIGN-LANGUAGE.md 6): the card's own fill (--body) so the body covers lines behind it */
        const fill = m.fill ? `fill:${col(m.color || "c1")};fill-opacity:${FILL}` : "fill:var(--body)";
        let s;
        if (m.shape === "box" || m.shape === "rod") {
          const w = m.w * k.s, h = Math.max(m.h * k.s, m.shape === "rod" ? 6 : 0), rx = m.shape === "rod" ? Math.min(h / 2, 3) : 2;
          s = `<rect x="${n2(-w / 2)}" y="${n2(-h / 2)}" width="${n2(w)}" height="${n2(h)}" rx="${rx}" transform="translate(${n2(x)} ${n2(y)}) rotate(${-(m.angle || 0)})" style="${fill};stroke:${st}" stroke-width="${SW.out}"/>`;
        } else if (m.shape === "dot") {
          s = `<circle cx="${n2(x)}" cy="${n2(y)}" r="${n2(Math.max(6, (m.r || 0) * k.s))}" style="fill:${st}"/>`;
        } else {
          const r = m.r * k.s;
          s = `<circle cx="${n2(x)}" cy="${n2(y)}" r="${n2(r)}" style="${fill};stroke:${st}" stroke-width="${SW.out}"/>`;
          if (m.shape === "ring") s += `<circle cx="${n2(x)}" cy="${n2(y)}" r="${n2(Math.max(1, r - 5))}" style="fill:var(--body);stroke:${st}" stroke-width="${SW.out}"/>`;
          s += `<circle cx="${n2(x)}" cy="${n2(y)}" r="2.5" style="fill:${st}"/>`;
        }
        if (m.label) k.label(m.label, [x, y], m.anchor || (m.shape === "dot" ? "ne" : "c"), m.color);
        return s;
      }
    },
    force: {
      pts: m => [m.at, forceTip(m)],
      draw(m, k) {
        const v = vecStyle(m), a = k.X(m.at), b = k.X(forceTip(m));
        if (m.label) k.label(m.label, b, m.anchor || dirAnchor(b[0] - a[0], b[1] - a[1]), v.c);
        return `<g data-mark="force" data-kind="${v.c === "c1" ? "force" : "kin"}">${arrow(a, b, v.w, col(v.c), v.head, m.dash ? DASH.ghost : "")}</g>`;
      }
    },
    arrow: {
      pts: m => [m.from, m.to],
      draw(m, k) {
        const a = k.X(m.from), b = k.X(m.to), c = col(m.color || "ink");
        if (m.label) k.label(m.label, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], m.anchor || "n", m.color);
        let s = arrow(a, b, SW.out, c, "fill", m.dash ? DASH.ghost : "");
        if (m.both) s += arrow(b, a, SW.out, c, "fill", m.dash ? DASH.ghost : "");
        return s;
      }
    },
    spring: {
      pts: m => [m.from, m.to],
      draw(m, k) {
        const a = k.X(m.from), b = k.X(m.to), L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const [ux, uy] = norm(b[0] - a[0], b[1] - a[1]), nx = -uy, ny = ux;
        const A = Math.min(10, Math.max(5, (m.width || 0.2) * k.s / 2)), lead = Math.min(16, Math.max(6, 0.12 * L));
        const n = 2 * (m.coils || 8), pts = [a, [a[0] + lead * ux, a[1] + lead * uy]];
        for (let i = 0; i < n; i++) { const t = lead + (L - 2 * lead) * (i + 0.5) / n, sg = i % 2 ? -1 : 1;
          pts.push([a[0] + t * ux + sg * A * nx, a[1] + t * uy + sg * A * ny]); }
        pts.push([b[0] - lead * ux, b[1] - lead * uy], b);
        if (m.label) { const side = (m.anchor === "se" || m.anchor === "s" || m.anchor === "sw") ? -1 : 1;
          k.label(m.label, [(a[0] + b[0]) / 2 - side * (A + 2) * nx, (a[1] + b[1]) / 2 - side * (A + 2) * ny], m.anchor || dirAnchor(-nx, -ny), m.color); }
        return line(pts, col(m.color), SW.out);
      }
    },
    pulley: {
      pts: m => [add(m.at, [-m.r, -m.r]), add(m.at, [m.r, m.r])].concat(m.mount ? [m.mount] : []),
      draw(m, k) {
        const [x, y] = k.X(m.at), r = m.r * k.s, st = col(m.color);
        let s = "";
        if (m.mount) { const q = k.X(m.mount), [ux, uy] = norm(q[0] - x, q[1] - y);
          s += `<polygon points="${P([[x, y], [q[0] - 7 * uy, q[1] + 7 * ux], [q[0] + 7 * uy, q[1] - 7 * ux]])}" style="fill:var(--body);stroke:${st}" stroke-width="${SW.out}"/>`; }
        s += `<circle cx="${n2(x)}" cy="${n2(y)}" r="${n2(r)}" style="fill:var(--body);stroke:${st}" stroke-width="${SW.out}"/>`;
        s += `<circle cx="${n2(x)}" cy="${n2(y)}" r="${n2(Math.max(1, r - 4))}" fill="none" style="stroke:var(--muted)" stroke-width="${SW.con}"/>`;
        s += `<circle cx="${n2(x)}" cy="${n2(y)}" r="3.5" style="fill:${st}"/>`;
        if (m.label) k.label(m.label, [x + r, y - r], m.anchor || "ne", m.color);
        return s;
      }
    },
    rope: { pts: m => m.pts, draw: (m, k) => line(m.pts.map(k.X), col(m.color), SW.rope) },
    pivot: {
      pts: m => [m.at],
      draw(m, k) {
        const [x, y] = k.X(m.at); let d = [0, 1], h = 14;
        for (const o of k.marks.filter(o => o.mark === "surface")) {
          const a = k.X(o.from), b = k.X(o.to), [ux, uy] = norm(b[0] - a[0], b[1] - a[1]);
          const t = (x - a[0]) * ux + (y - a[1]) * uy, c = [a[0] + t * ux, a[1] + t * uy], dist = Math.hypot(c[0] - x, c[1] - y);
          if (dist > 0.5 && dist < 40) { d = norm(c[0] - x, c[1] - y); h = Math.max(10, dist); }
        }
        const bx = x + h * d[0], by = y + h * d[1], hw = Math.max(8, 0.6 * h);
        return `<polygon points="${P([[x, y], [bx - hw * d[1], by + hw * d[0]], [bx + hw * d[1], by - hw * d[0]]])}" style="fill:var(--body);stroke:${col(m.color)}" stroke-width="${SW.out}"/>` +
          `<circle cx="${n2(x)}" cy="${n2(y)}" r="3.5" style="fill:var(--body);stroke:${col(m.color)}" stroke-width="${SW.out}"/>`;
      }
    },
    path: {
      pts: m => sample(m),
      draw(m, k) {
        const pts = sample(m).map(k.X), c = col(m.color || "muted");
        let s = line(pts, c, 3, DASH.traj);
        if (m.arrow && pts.length > 2) { const b = pts[pts.length - 1], a = pts[pts.length - 3]; const [ux, uy] = norm(b[0] - a[0], b[1] - a[1]); s += arrow([b[0] - 12 * ux, b[1] - 12 * uy], b, SW.vec, c); }
        if (m.label) { const i = Math.min(pts.length - 1, Math.floor(pts.length * (m.labelAt ?? 0.5))); k.label(m.label, pts[i], m.anchor || "n", m.color); }
        return s;
      }
    },
    seg: {
      pts: m => [m.from, m.to],
      draw(m, k) {
        const a = k.X(m.from), b = k.X(m.to);
        if (m.label) k.label(m.label, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], m.anchor || "n", m.color);
        return line([a, b], col(m.color || (m.dash ? "muted" : "ink")), m.dash ? SW.con : SW.out, m.dash ? DASH.guide : "");
      }
    },
    arc: {
      pts: m => [add(m.at, [-m.r, -m.r]), add(m.at, [m.r, m.r])],
      draw(m, k) {
        const c = k.X(m.at), r = m.r * k.s, st = col(m.color || "muted");
        const mid = (m.from + m.to) / 2 * deg, d = [Math.cos(mid), -Math.sin(mid)];
        if (m.label) k.label(m.label, [c[0] + d[0] * (r + 2), c[1] + d[1] * (r + 2)], m.anchor || dirAnchor(d[0], d[1]), m.color);
        let s = arcPath(c, r, m.from, m.to, st, SW.con, m.dash ? DASH.guide : "");
        if (m.arrow) { const e = m.to * deg, sg = m.to >= m.from ? 1 : -1, tip = [c[0] + r * Math.cos(e), c[1] - r * Math.sin(e)], tg = [-Math.sin(e) * sg, -Math.cos(e) * sg];
          s += arrow([tip[0] - 10 * tg[0], tip[1] - 10 * tg[1]], tip, SW.con, st); }
        return s;
      }
    },
    poly: {
      pts: m => m.pts,
      draw(m, k) {
        const v = m.pts.map(k.X), c = col(m.color || "ink");
        if (m.label) { const cx = v.reduce((a, p) => a + p[0], 0) / v.length, cy = v.reduce((a, p) => a + p[1], 0) / v.length; k.label(m.label, [cx, cy], m.anchor || "c", m.color); }
        return `<polygon points="${P(v)}" style="fill:${m.fill ? c : "none"};fill-opacity:${FILL};stroke:${c}" stroke-width="${SW.out}"${m.dash ? ` stroke-dasharray="${DASH.guide}"` : ""}/>`;
      }
    },
    point: {
      pts: m => [m.at],
      draw(m, k) { const [x, y] = k.X(m.at); if (m.label) k.label(m.label, [x, y], m.anchor || "ne", m.color); return pointSvg(x, y, m); }
    },
    axes: {
      pts: m => [m.at, add(m.at, rot([m.len || 1, 0], (m.angle || 0) * deg)), add(m.at, rot([0, m.len || 1], (m.angle || 0) * deg))],
      draw(m, k) {
        const a = (m.angle || 0) * deg, o = k.X(m.at), ex = k.X(add(m.at, rot([m.len || 1, 0], a))), ey = k.X(add(m.at, rot([0, m.len || 1], a)));
        if (m.x) k.label(m.x, ex, dirAnchor(ex[0] - o[0], ex[1] - o[1]), "muted");
        if (m.y) k.label(m.y, ey, dirAnchor(ey[0] - o[0], ey[1] - o[1]), "muted");
        return arrow(o, ex, SW.axis, col("muted")) + arrow(o, ey, SW.axis, col("muted"));
      }
    },
    text: { pts: m => [m.at], draw(m, k) { k.label(m.text, k.X(m.at), m.anchor || "c", m.color); return ""; } }
  };

  /* ---- layout: draw, measure labels, grow padding, redraw (max 3 passes) ---- */
  function mount(el, build) {
    const pad = { l: PAD, r: PAD, t: PAD, b: PAD };
    for (let pass = 0; pass < 3; pass++) {
      const W = el.clientWidth, labels = [];
      const k = el._k = { label: (text, at, anchor, color, cls = "", html = false) => labels.push({ text, at, anchor, color, cls, html }) };
      const { svg, H } = build(W, pad, k);
      el.style.height = H + "px";
      el.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true" focusable="false">${svg}</svg>`;
      const grow = { l: 0, r: 0, t: 0, b: 0 };
      for (const L of labels) {
        if (!L.at || !fin(L.at)) continue;
        const sp = document.createElement("span");
        sp.className = "lbl " + L.cls; sp.setAttribute("aria-hidden", "true");
        sp.innerHTML = L.html ? L.text : tex(L.text); sp.style.color = L.cls ? "" : labelColor(L.color);
        el.appendChild(sp);
        const w = sp.offsetWidth, h = sp.offsetHeight, a = L.anchor || "c", o = a === "c" ? 0 : a.length === 2 ? OFF * 0.7 : OFF;
        const fx = a.includes("e") ? 0 : a.includes("w") ? -1 : -0.5, fy = a.includes("n") ? -1 : a.includes("s") ? 0 : -0.5;
        const dx = a.includes("e") ? o : a.includes("w") ? -o : 0, dy = a.includes("n") ? -o : a.includes("s") ? o : 0;
        const x = L.at[0] + dx + fx * w, y = L.at[1] + dy + fy * h;
        sp.style.transform = `translate(${n2(x)}px, ${n2(y)}px)`;
        grow.l = Math.max(grow.l, 4 - x); grow.r = Math.max(grow.r, x + w - W + 4);
        grow.t = Math.max(grow.t, 4 - y); grow.b = Math.max(grow.b, y + h - H + 4);
      }
      if (grow.l <= 0.5 && grow.r <= 0.5 && grow.t <= 0.5 && grow.b <= 0.5) break;
      for (const s in pad) pad[s] += Math.max(0, Math.ceil(grow[s]));
    }
  }

  function drawMarks(marks, k) {
    return marks.filter(m => S[m.mark]).map((m, i) => [LAYER[m.mark] ?? 5, i, m]).sort((a, b) => a[0] - b[0] || a[1] - b[1])
      .map(([, , m]) => { try { return S[m.mark].draw(m, k); } catch (e) { console.warn("mark", m.mark, e); return ""; } }).join("");
  }

  function scene(g) {
    const marks = g.marks;
    return (W, pad, k) => {
      /* a live scene passes a fixed `frame` [x0, y0, x1, y1], so dragging never rescales the picture */
      const pts = g.frame ? [g.frame.slice(0, 2), g.frame.slice(2)] : marks.filter(m => S[m.mark]).flatMap(m => S[m.mark].pts(m)).filter(fin);
      const x0 = Math.min(...pts.map(p => p[0])), x1 = Math.max(...pts.map(p => p[0]));
      const y0 = Math.min(...pts.map(p => p[1])), y1 = Math.max(...pts.map(p => p[1]));
      /* scenes are capped (320px tall, 560px wide) and centred, so a diagram never outweighs the text on desktop */
      const maxH = Math.min(320, 0.9 * W), maxW = Math.min(W, 560);
      const s = Math.min((maxW - pad.l - pad.r) / (x1 - x0 || 1), (maxH - pad.t - pad.b) / (y1 - y0 || 1));
      const ox = pad.l + ((W - pad.l - pad.r) - (x1 - x0) * s) / 2;
      const H = Math.round((y1 - y0) * s + pad.t + pad.b);
      Object.assign(k, { s, marks, X: p => [ox + (p[0] - x0) * s, pad.t + (y1 - p[1]) * s] });
      return { svg: drawMarks(marks, k), H };
    };
  }

  function niceStep(span, px) {
    const raw = span / Math.max(2, Math.floor(px / 56)), p = 10 ** Math.floor(Math.log10(raw));
    return [1, 2, 5, 10].map(f => f * p).find(v => v >= raw);
  }
  function ticks(min, max, step) { const out = []; for (let v = Math.ceil(min / step - 1e-9) * step; v <= max + 1e-9; v += step) out.push(+v.toFixed(10)); return out; }
  const fmt = v => v < 0 ? "−" + Math.abs(v) : String(v);

  function cartesian(g) {
    return (W, pad, k) => {
      const grid = g.grid !== false, axesOn = g.axes !== false;
      const xr = g.x.max - g.x.min, yr = g.y.max - g.y.min;
      let pl = pad.l + (axesOn ? 14 : 0), pr = pad.r, pt = pad.t, pb = pad.b + (axesOn ? 6 : 0);
      let H = Math.round(Math.max(240, Math.min(420, W * 0.72))), sx = (W - pl - pr) / xr, sy = (H - pt - pb) / yr;
      if (g.equal) {
        const s = Math.min(sx, (Math.min(440, 0.9 * W) - pt - pb) / yr);
        sx = sy = s; H = Math.round(yr * s + pt + pb);
        const extra = (W - pl - pr) - xr * s; pl += extra / 2; pr += extra / 2;
      }
      const X = p => [pl + (p[0] - g.x.min) * sx, pt + (g.y.max - p[1]) * sy];
      Object.assign(k, { s: sx, marks: g.marks, X });
      const xs = g.x.step === 0 ? 0 : g.x.step || niceStep(xr, W - pl - pr), ys = g.y.step === 0 ? 0 : g.y.step || niceStep(yr, H - pt - pb);
      const xt = xs ? ticks(g.x.min, g.x.max, xs) : [], yt = ys ? ticks(g.y.min, g.y.max, ys) : [];
      const ax = Math.min(Math.max(0, g.x.min), g.x.max), ay = Math.min(Math.max(0, g.y.min), g.y.max);
      const id = "clip" + Math.random().toString(36).slice(2, 8);
      let s = `<defs><clipPath id="${id}"><rect x="${n2(pl)}" y="${n2(pt)}" width="${n2(W - pl - pr)}" height="${n2(H - pt - pb)}"/></clipPath></defs>`;
      if (grid) {
        for (const v of xt) { const [x] = X([v, 0]); s += line([[x, pt], [x, H - pb]], "var(--grid)", SW.grid); }
        for (const v of yt) { const [, y] = X([0, v]); s += line([[pl, y], [W - pr, y]], "var(--grid)", SW.grid); }
      }
      let body = "", top = "";
      const other = [];
      for (const m of g.marks) {
        const c = col(m.color || "c1");
        if (m.mark === "shade") {
          const n = 120, up = [], dn = [], vy = m.var === "y";
          for (let i = 0; i <= n; i++) { const t = m.from + (m.to - m.from) * i / n;
            up.push(X(vy ? [m.f(t), t] : [t, m.f(t)])); dn.unshift(X(vy ? [m.g(t), t] : [t, m.g(t)])); }
          body += `<polygon points="${P(up.concat(dn).filter(fin))}" style="fill:${c}" fill-opacity="${FILL}"/>`;
          if (m.label) { let cx = 0, cy = 0; up.concat(dn).forEach(p => { cx += p[0]; cy += p[1]; }); k.label(m.label, [cx / (2 * n + 2), cy / (2 * n + 2)], m.anchor || "c", m.color || "c1"); }
        } else if (m.mark === "fn") {
          const [a, b] = m.domain || [g.x.min, g.x.max], n = 360, pts = [];
          for (let i = 0; i <= n; i++) { const x = a + (b - a) * i / n; pts.push(X([x, m.y(x)])); }
          top += curve(pts, c, SW.curve, m.dash ? DASH.asym : "", H);
          if (m.label) { const x = m.labelAt ?? a + 0.85 * (b - a); k.label(m.label, X([x, m.y(x)]), m.anchor || "n", m.color || "c1"); }
        } else if (m.mark === "param") {
          const [a, b] = m.t, n = 360, pts = [];
          for (let i = 0; i <= n; i++) { const t = a + (b - a) * i / n; pts.push(X([m.x(t), m.y(t)])); }
          top += curve(pts, c, SW.curve, m.dash ? DASH.asym : "", H);
          if (m.label) { const t = m.labelAt ?? a + 0.85 * (b - a); k.label(m.label, X([m.x(t), m.y(t)]), m.anchor || "n", m.color || "c1"); }
        } else if (m.mark === "tangent") {
          const a = m.at, h = 1e-4 * (xr || 1), y0 = m.of(a), sl = (m.of(a + h) - m.of(a - h)) / (2 * h);
          const L = (m.len ?? 0.4 * xr) / 2, dx = L / Math.sqrt(1 + sl * sl);
          const tc = col(m.color || "c2");
          top += line([X([a - dx, y0 - sl * dx]), X([a + dx, y0 + sl * dx])], tc, SW.curve, m.dash ? DASH.asym : "");
          if (m.point !== false) top += pointSvg(...X([a, y0]), { color: m.color || "c2" });
          if (m.label) k.label(m.label, X([a + dx, y0 + sl * dx]), m.anchor || "e", m.color || "c2");
        } else if (m.mark === "vline" || m.mark === "hline") {
          const e = m.mark === "vline" ? [X([m.x, g.y.min]), X([m.x, g.y.max])] : [X([g.x.min, m.y]), X([g.x.max, m.y])];
          body += line(e, col(m.color || "muted"), SW.con, m.dash ? DASH.asym : "");
          if (m.label) k.label(m.label, e[1], m.anchor || (m.mark === "vline" ? "e" : "n"), m.color);
        } else other.push(m);
      }
      top += drawMarks(other.map(m => m.mark === "point" ? { ...m, color: m.color || "ink" } : m), k);
      let axes = "";
      if (axesOn) {
        const O = X([ax, ay]);
        axes = arrow([pl, O[1]], [W - pr, O[1]], SW.axis, col("muted")) + arrow([O[0], H - pb], [O[0], pt], SW.axis, col("muted"));
        const xl = g.x.ticks ? g.x.ticks.map(t => [t.at, t.label]) : xt.map(v => [v, fmt(v)]);
        const yl = g.y.ticks ? g.y.ticks.map(t => [t.at, t.label]) : yt.map(v => [v, fmt(v)]);
        for (const [v, lab] of xl) { if (Math.abs(v - ax) < 1e-9 || X([v, 0])[0] > W - pr - 12) continue; const [x] = X([v, 0]); axes += line([[x, O[1] - 3], [x, O[1] + 3]], col("muted"), SW.axis); k.label(lab, [x, O[1] + 3], "s", "", "tick"); }
        for (const [v, lab] of yl) { if (Math.abs(v - ay) < 1e-9 || X([0, v])[1] < pt + 12) continue; const [, y] = X([0, v]); axes += line([[O[0] - 3, y], [O[0] + 3, y]], col("muted"), SW.axis); k.label(lab, [O[0] - 3, y], "w", "", "tick"); }
        if (g.x.label) k.label(g.x.label, [W - pr, O[1]], "e", "ink");
        if (g.y.label) k.label(g.y.label, [O[0], pt], "n", "ink");
      }
      s += `<g clip-path="url(#${id})">${body}</g>` + axes + `<g clip-path="url(#${id})">${top}</g>`;
      return { svg: s, H };
    };
  }

  function bars(g) {
    return (W, pad, k) => {
      const H = 240, pl = pad.l + 18, pr = pad.r, pt = pad.t + 4, pb = pad.b + 48;
      const n = g.groups.reduce((a, gr) => a + gr.bars.length, 0), gaps = g.groups.length - 1;
      const bw = Math.max(20, Math.min(48, (W - pl - pr - gaps * 24 - n * 8) / n));
      const inner = n * (bw + 8) + gaps * 24, x0 = pl + ((W - pl - pr) - inner) / 2 + 4;
      const sy = (H - pt - pb) / (g.max - g.min), Y = v => pt + (g.max - v) * sy, step = niceStep(g.max - g.min, H - pt - pb);
      let s = "", x = x0;
      for (const v of ticks(g.min, g.max, step)) { s += line([[pl, Y(v)], [W - pr, Y(v)]], "var(--grid)", SW.grid); k.label(fmt(v), [pl - 4, Y(v)], "w", "", "tick"); }
      if (g.unit) k.label(g.unit, [pl - 4, pt - 2], "nw", "", "tick");
      g.groups.forEach((gr, gi) => {
        const start = x;
        gr.bars.forEach((b, i) => {
          const cc = b.color || ["c1", "c2", "c3", "ink"][i % 4], c = col(cc), y = Math.min(Y(b.value), Y(0)), h = Math.abs(Y(b.value) - Y(0));
          s += h < 2 ? `<rect x="${n2(x)}" y="${n2(Y(0) - 1)}" width="${n2(bw)}" height="2" style="fill:${c}"/>`
                     : `<rect x="${n2(x)}" y="${n2(y)}" width="${n2(bw)}" height="${n2(h)}" rx="2" style="fill:${c}"/>`;
          k.label(b.label, [x + bw / 2, H - pb + 4], "s", cc);
          x += bw + 8;
        });
        k.label(gr.label, [(start + x - 8) / 2, H - pb + 30], "s", "", "tick");
        if (gi < gaps) { s += line([[x + 8, pt], [x + 8, H - pb + 44]], "var(--grid)", SW.grid); x += 24; }
      });
      s += line([[pl, Y(0)], [W - pr, Y(0)]], col("ink"), SW.axis);
      return { svg: s, H };
    };
  }

  /* ---- kind: circuit (logic gates, SCHEMA.md). Layered layout: Kahn topo sort -> columns, dummy nodes for long edges,
     rows by barycenter (left->right), one right->left reorder, then left->right again; wires are orthogonal, one vertical
     track per net in the gap before its target column. Throws on a bad circuit (the caller then shows alt). ---- */
  const OPS = { and: { b: "and" }, nand: { b: "and", inv: 1 }, or: { b: "or" }, nor: { b: "or", inv: 1 },
    xor: { b: "xor" }, xnor: { b: "xor", inv: 1 }, not: { b: "not", inv: 1, one: 1 }, buf: { b: "not", one: 1 } };
  const SYM = /^[A-Za-z][A-Za-z0-9_]*$/;
  const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
  const stableSort = (a, key) => a.map((n, i) => [key(n), i, n]).sort((p, q) => p[0] - q[0] || p[1] - q[1]).map(p => p[2]);

  function circuitLayout(g) {
    const fail = m => { throw new Error("circuit: " + m); };
    const ins = (g.inputs || []).map(i => typeof i === "string" ? { name: i } : i), gates = g.gates || [], outs = g.outputs || [];
    if (!ins.length || !gates.length || !outs.length) fail("needs inputs, gates and outputs");
    const N = new Map();
    ins.forEach((i, r) => {
      if (!SYM.test(i.name) || N.has(i.name)) fail(`bad or repeated name ${i.name}`);
      N.set(i.name, { id: i.name, kind: "in", col: 0, row: r, src: [], value: i.value });
    });
    for (const q of gates) {
      const op = OPS[q.op], n = (q.in || []).length;
      if (!op) fail(`unknown op ${q.op}`);
      if (!SYM.test(q.id) || N.has(q.id)) fail(`bad or repeated name ${q.id}`);
      if (op.one ? n !== 1 : n < 2 || n > 4) fail(`${q.op} ${q.id} has ${n} inputs`);
      N.set(q.id, { id: q.id, kind: "gate", src: q.in.slice(), q, op });
    }
    for (const s of gates.flatMap(q => q.in).concat(outs.map(o => o.from))) if (!N.has(s)) fail(`unknown id ${s}`);
    /* Kahn: a gate is ready once every gate feeding it is placed */
    const deg = new Map(), users = new Map();
    for (const q of gates) {
      deg.set(q.id, 0);
      for (const s of q.in) if (N.get(s).kind === "gate") { deg.set(q.id, deg.get(q.id) + 1); users.set(s, (users.get(s) || []).concat(q.id)); }
    }
    const queue = gates.filter(q => !deg.get(q.id)).map(q => q.id), order = [];
    while (queue.length) {
      const id = queue.shift(); order.push(id);
      for (const v of users.get(id) || []) { deg.set(v, deg.get(v) - 1); if (!deg.get(v)) queue.push(v); }
    }
    if (order.length < gates.length) fail("cycle");
    let maxCol = 1;
    for (const id of order) {
      const n = N.get(id);
      n.col = Math.max(Number.isInteger(n.q.col) ? n.q.col : 0, 1 + Math.max(...n.src.map(s => N.get(s).col)));
      maxCol = Math.max(maxCol, n.col);
    }
    outs.forEach((o, i) => N.set("\u0000out" + i, { id: "\u0000out" + i, kind: "out", col: maxCol + 1, src: [o.from], o }));
    /* dummies: an edge spanning >1 column passes through one shared dummy per (source, column) */
    for (const n of [...N.values()]) n.src = n.src.map(s => {
      let prev = s;
      for (let c = N.get(s).col + 1; c < n.col; c++) {
        const id = `${s}\u0000${c}`;
        if (!N.has(id)) N.set(id, { id, kind: "dummy", col: c, src: [prev] });
        prev = id;
      }
      return prev;
    });
    const layers = Array.from({ length: maxCol + 2 }, () => []);
    for (const n of N.values()) layers[n.col].push(n);
    for (const n of N.values()) n.succ = [];
    for (const n of N.values()) for (const s of n.src) N.get(s).succ.push(n);
    const gap = (a, b) => [1, 0.6, 0.4][(a.kind === "dummy") + (b.kind === "dummy")];
    /* least-squares rows in a fixed order with minimum gaps (pool adjacent violators) */
    const place = (list, want, w) => {
      const off = [0];
      for (let i = 1; i < list.length; i++) off[i] = off[i - 1] + gap(list[i - 1], list[i]);
      const bl = [];
      list.forEach((n, i) => {
        bl.push({ w: w[i], s: w[i] * (want[i] - off[i]), n: 1 });
        while (bl.length > 1 && bl[bl.length - 2].s / bl[bl.length - 2].w > bl[bl.length - 1].s / bl[bl.length - 1].w) {
          const b = bl.pop(), a = bl.pop(); bl.push({ w: a.w + b.w, s: a.s + b.s, n: a.n + b.n });
        }
      });
      let i = 0;
      for (const b of bl) for (let j = 0; j < b.n; j++, i++) list[i].row = b.s / b.w + off[i];
    };
    const pinned = n => n.kind === "gate" && typeof n.q.row === "number";
    const wantL = n => pinned(n) ? n.q.row : mean(n.src.map(s => N.get(s).row));
    const weights = list => list.map(n => pinned(n) ? 1e3 : 1);
    for (let c = 1; c <= maxCol + 1; c++) {
      layers[c] = stableSort(layers[c], wantL);
      place(layers[c], layers[c].map(wantL), weights(layers[c]));
    }
    for (let c = maxCol; c >= 1; c--) {
      const key = n => pinned(n) ? n.q.row : n.succ.length ? mean(n.succ.map(s => s.row)) : n.row;
      layers[c] = stableSort(layers[c], key);
      place(layers[c], layers[c].map(key), weights(layers[c]));
    }
    for (let c = 1; c <= maxCol + 1; c++) {
      if (c === maxCol + 1) layers[c] = stableSort(layers[c], wantL);
      place(layers[c], layers[c].map(wantL), weights(layers[c]));
    }
    const lo = Math.min(...[...N.values()].map(n => n.row));
    for (const n of N.values()) n.row -= lo;
    return { N, layers, maxCol, maxRow: Math.max(...[...N.values()].map(n => n.row)) };
  }

  /* gate bodies in a unit box (x right, y down), scaled to u px */
  function gateBody(b, x, y, u) {
    const p = (a, c) => n2(x + a * u) + "," + n2(y + c * u);
    if (b === "and") return `M${p(0, 0)} H${n2(x + 0.5 * u)} A${n2(u / 2)},${n2(u / 2)} 0 0 1 ${p(0.5, 1)} H${n2(x)} Z`;
    if (b === "not") return `M${p(0, 0.15)} L${p(0.75, 0.5)} L${p(0, 0.85)} Z`;
    const or = `M${p(0, 0)} Q${p(0.6, 0)} ${p(1, 0.5)} Q${p(0.6, 1)} ${p(0, 1)} Q${p(0.25, 0.5)} ${p(0, 0)} Z`;
    return b === "xor" ? or + ` M${p(-0.15, 0)} Q${p(0.1, 0.5)} ${p(-0.15, 1)}` : or;
  }
  /* where an input wire stops, as a fraction of u from the body's left edge (OR family: on the back curve) */
  const pinStop = (b, t) => b === "or" ? 0.5 * t * (1 - t) : b === "xor" ? -0.15 + 0.5 * t * (1 - t) : 0;
  const texName = s => /^[A-Za-z]$/.test(s) ? `$${s}$` : /^[A-Za-z]_?\d+$/.test(s) ? `$${s[0]}_{${s.replace(/^[A-Za-z]_?/, "")}}$` : s;

  function circuit(g) {
    const L = circuitLayout(g), { N, layers, maxCol } = L;
    return (W, pad, k) => {
      const span = 4 + 2.6 * (maxCol - 1), avail = W - pad.l - pad.r;
      const u = Math.min(40, avail / span), RP = 1.4 * u, br = Math.max(0.09 * u, 3);
      const x0 = pad.l + Math.max(0, (avail - span * u) / 2);
      const colL = c => c === 0 ? x0 : x0 + 1.6 * u + (Math.min(c, maxCol) - 1) * 2.6 * u + (c > maxCol ? 2.1 * u : 0);
      const Y = r => pad.t + u / 2 + r * RP;
      const H = Math.round(Y(L.maxRow) + u / 2 + pad.b);
      const ink = col("ink");
      /* geometry: every node gets an out point; gates and dummies get in pins */
      const out = new Map(), pins = new Map();
      for (const n of N.values()) {
        const x = colL(n.col), y = Y(n.row);
        if (n.kind === "in") out.set(n.id, [x, y]);
        else if (n.kind === "dummy") { pins.set(n.id, [[x, y, n.src[0]]]); out.set(n.id, [x + 1.2 * u, y]); }
        else if (n.kind === "out") pins.set(n.id, [[x, y, n.src[0]]]);
        else {
          const srcs = n.op.one ? n.src : stableSort(n.src, s => N.get(s).row), m = srcs.length;   // multi-input ops commute: sort pins by source height
          pins.set(n.id, srcs.map((s, i) => { const t = (i + 1) / (m + 1); return [x + pinStop(n.op.b, t) * u, y - u / 2 + t * u, s]; }));
          out.set(n.id, [x + ((n.op.b === "not" ? 0.75 : 1) * u) + (n.op.inv ? 2 * br : 0), y]);
        }
      }
      let wires = "", dots = "";
      for (let c = 1; c <= maxCol + 1; c++) {
        const nets = new Map();   // source id -> target pins in column c
        for (const n of layers[c]) for (const [px, py, s] of pins.get(n.id)) nets.set(s, (nets.get(s) || []).concat([[px, py]]));
        const gl = colL(c - 1) + (c === 1 ? 0 : 1.2 * u) + 4, gr = colL(c) - (c > maxCol ? 0 : 0.15 * u) - 4;
        const straight = [], routed = [];
        for (const [s, ts] of nets) {
          const [sx, sy] = out.get(s);
          if (ts.length === 1 && Math.abs(ts[0][1] - sy) < 0.5) straight.push([sx, sy, ts[0][0]]);
          else routed.push({ sx, sy, ts, lo: Math.min(sy, ...ts.map(t => t[1])), hi: Math.max(sy, ...ts.map(t => t[1])) });
        }
        for (const [sx, sy, tx] of straight) wires += `M${n2(sx)} ${n2(sy)}H${n2(tx)}`;
        /* one vertical track per routed net, ~6px apart; try orders of the tracks, keep the one with the fewest crossings */
        const m = routed.length, step = m > 1 ? Math.min(6, (gr - gl) / (m - 1)) : 0, mid = (gl + gr) / 2;
        const xs = i => mid + (i - (m - 1) / 2) * step;
        const cross = ord => {
          let n = 0;
          ord.forEach((a, i) => ord.forEach((b, j) => {
            if (i === j) return;
            const xa = xs(i), xb = xs(j), hs = [[b.sx, xb, b.sy], ...b.ts.map(t => [xb, t[0], t[1]])];
            for (const [h0, h1, hy] of hs) if (xa > Math.min(h0, h1) + 0.1 && xa < Math.max(h0, h1) - 0.1 && hy > a.lo + 0.1 && hy < a.hi - 0.1) n++;
          }));
          return n;
        };
        const perms = a => a.length <= 1 ? [a] : a.flatMap((x, i) => perms(a.slice(0, i).concat(a.slice(i + 1))).map(p => [x, ...p]));
        const asc = stableSort(routed, r => r.sy);
        let best = asc, bestN = cross(asc);
        if (m <= 6) for (const p of perms(asc)) { const n = cross(p); if (n < bestN) { best = p; bestN = n; } }
        best.forEach((r, i) => {
          const x = xs(i);
          wires += `M${n2(r.sx)} ${n2(r.sy)}H${n2(x)}M${n2(x)} ${n2(r.lo)}V${n2(r.hi)}`;
          for (const [tx, ty] of r.ts) wires += `M${n2(x)} ${n2(ty)}H${n2(tx)}`;
          /* junction dot wherever 3+ segments meet on the trunk */
          for (const y of new Set([r.sy, ...r.ts.map(t => t[1])])) {
            const segs = (Math.abs(y - r.sy) < 0.5 ? 1 : 0) + r.ts.filter(t => Math.abs(t[1] - y) < 0.5).length + (y > r.lo + 0.5 ? 1 : 0) + (y < r.hi - 0.5 ? 1 : 0);
            if (segs >= 3) dots += `<circle cx="${n2(x)}" cy="${n2(y)}" r="3" style="fill:${ink}"/>`;
          }
        });
      }
      let bodies = "";
      for (const n of N.values()) {
        const x = colL(n.col), y = Y(n.row);
        if (n.kind === "dummy") wires += `M${n2(x)} ${n2(y)}H${n2(x + 1.2 * u)}`;
        else if (n.kind === "out") {
          const e = x + 0.3 * u; wires += `M${n2(x)} ${n2(y)}H${n2(e)}`;
          const src = N.get(n.o.from);
          k.label(n.o.label || (src.kind === "gate" && src.q.label) || texName(n.o.from), [e, y], "e", "c1");
        } else if (n.kind === "in") {
          const v = n.value === 0 || n.value === 1 ? `<span style="color:var(--c2);font-size:0.8em;margin-left:0.3em">= ${n.value}</span>` : "";
          k.label(tex(texName(n.id)) + v, [x, y], "w", "ink", "", true);
        } else {
          const top = y - u / 2, bx = x + (n.op.b === "not" ? 0.75 : 1) * u;
          let s = `<path d="${gateBody(n.op.b, x, top, u)}" style="fill:var(--bg, var(--body));stroke:${ink}" stroke-width="${SW.out}"/>`;
          if (n.op.inv) s += `<circle cx="${n2(bx + br)}" cy="${n2(y)}" r="${n2(br)}" style="fill:var(--bg, var(--body));stroke:${ink}" stroke-width="${SW.out}"/>`;
          bodies += `<g data-gate="${esc(n.id)}" data-op="${esc(n.q.op)}">${s}</g>`;
          if (n.q.label) k.label(n.q.label, [x + 0.5 * u, top], "n", "", "tick");
        }
      }
      const svg = `<path d="${wires}" fill="none" style="stroke:${ink}" stroke-width="${SW.con}"/>` + bodies + dots;
      return { svg, H };
    };
  }

  /* ---- kind: network (graph theory: vertices + edges, SCHEMA.md). World positions from the layout (circle, tree, free),
     fit 1:1 like a scene. Parallel edges bow apart, loops hang off the node away from the centre.
     Throws on a bad network (the caller then shows alt). ---- */
  function networkLayout(g) {
    const fail = m => { throw new Error("network: " + m); };
    const nodes = (g.nodes || []).map(n => typeof n === "string" ? { id: n } : n), edges = g.edges || [];
    if (!nodes.length) fail("needs nodes");
    const ids = new Map(nodes.map((n, i) => [n.id, i]));
    if (ids.size < nodes.length) fail("repeated node id");
    for (const e of edges) for (const s of [e.from, e.to]) if (!ids.has(s)) fail("unknown node " + s);
    const layout = g.layout || "circle", n = nodes.length;
    let at;
    if (layout === "free") {
      if (nodes.some(v => !v.at)) fail("free layout: every node needs at");
      at = nodes.map(v => v.at);
    } else if (layout === "tree") {
      if (!ids.has(g.root)) fail("tree layout: root is not a node");
      const kids = new Map(nodes.map(v => [v.id, []])), depth = new Map([[g.root, 0]]), q = [g.root];
      while (q.length) {
        const u = q.shift();
        for (const e of edges) {
          const v = e.from === u ? e.to : e.to === u ? e.from : null;
          if (v != null && !depth.has(v)) { depth.set(v, depth.get(u) + 1); kids.get(u).push(v); q.push(v); }
        }
      }
      if (depth.size < n) fail("tree layout: not every node hangs off the root");
      const x = new Map();
      let leaf = 0;
      const place = u => { const c = kids.get(u); c.forEach(place); x.set(u, c.length ? mean(c.map(v => x.get(v))) : leaf++); };
      place(g.root);
      at = nodes.map(v => [x.get(v.id), -depth.get(v.id)]);
    } else {
      const a0 = n === 2 ? 180 : 90;   // K2 lies flat; otherwise start at the top, clockwise
      at = n === 1 ? [[0, 0]] : nodes.map((_, i) => [Math.cos((a0 - 360 * i / n) * deg), Math.sin((a0 - 360 * i / n) * deg)]);
    }
    return { nodes, edges, at, ids };
  }

  function network(g) {
    const L = networkLayout(g), { nodes, edges, ids } = L, dir = !!g.directed;
    const hasLoop = edges.some(e => e.from === e.to);
    return (W, pad, k) => {
      const R = 14, AH = 9, E = R + (hasLoop ? 2 * R : 0) + 2;   // node radius, arrowhead length, room for loops
      const xs = L.at.map(p => p[0]), ys = L.at.map(p => p[1]);
      const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
      const maxH = Math.min(320, 0.9 * W), maxW = Math.min(W, 560);
      const pl = pad.l + E, pr = pad.r + E, pt = pad.t + E, pb = pad.b + E;
      const s = Math.min((maxW - pl - pr) / (x1 - x0 || 1), (maxH - pt - pb) / (y1 - y0 || 1));
      const ox = pl + ((W - pl - pr) - (x1 - x0) * s) / 2;
      const H = Math.round((y1 - y0) * s + pt + pb);
      const X = L.at.map(p => [ox + (p[0] - x0) * s, pt + (y1 - p[1]) * s]);
      const cen = [mean(X.map(p => p[0])), mean(X.map(p => p[1]))];
      const pos = id => X[ids.get(id)];
      const head = (tip, from, st) => {
        const [ux, uy] = norm(tip[0] - from[0], tip[1] - from[1]), b = [tip[0] - AH * ux, tip[1] - AH * uy], w = 0.38 * AH;
        return `<polygon points="${P([tip, [b[0] - w * uy, b[1] + w * ux], [b[0] + w * uy, b[1] - w * ux]])}" style="fill:${st};stroke:${st}" stroke-width="1"/>`;
      };
      const tag = e => e.label ?? (typeof e.w === "number" ? String(e.w) : null);
      /* group edges by unordered pair: m edges between the same two nodes bow out symmetrically */
      const groups = new Map(), loops = new Map();
      for (const e of edges) {
        if (e.from === e.to) { loops.set(e.from, (loops.get(e.from) || []).concat([e])); continue; }
        const key = ids.get(e.from) < ids.get(e.to) ? e.from + "\u0000" + e.to : e.to + "\u0000" + e.from;
        groups.set(key, (groups.get(key) || []).concat([e]));
      }
      let svg = "";
      for (const [key, es] of groups) {
        const [lo, hi] = key.split("\u0000").map(pos), [ux, uy] = norm(hi[0] - lo[0], hi[1] - lo[1]);
        let nx = -uy, ny = ux;   // one normal per pair (lo -> hi), so the bows of a group never cross
        const mid = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2];
        es.forEach((e, i) => {
          const bend = (i - (es.length - 1) / 2) * 1.6 * R, a = pos(e.from), b = pos(e.to), st = col(e.color);
          const c = [mid[0] + 2 * bend * nx, mid[1] + 2 * bend * ny];   // quadratic control: the curve peaks at bend
          const [sx, sy] = norm(c[0] - a[0], c[1] - a[1]), [tx, ty] = norm(b[0] - c[0], b[1] - c[1]);
          const p0 = [a[0] + R * sx, a[1] + R * sy], tip = [b[0] - R * tx, b[1] - R * ty];
          const p1 = dir ? [tip[0] - 0.6 * AH * tx, tip[1] - 0.6 * AH * ty] : tip;
          svg += `<g data-edge="${esc(e.from)}-${esc(e.to)}"><path d="M${n2(p0[0])} ${n2(p0[1])}Q${n2(c[0])} ${n2(c[1])} ${n2(p1[0])} ${n2(p1[1])}" fill="none" style="stroke:${st}" stroke-width="${SW.out}"${e.dash ? ` stroke-dasharray="${DASH.asym}"` : ""}/>${dir ? head(tip, c, st) : ""}</g>`;
          const t = tag(e);
          if (t != null) {
            const peak = [mid[0] + bend * nx, mid[1] + bend * ny];
            let [lx, ly] = bend ? norm(bend * nx, bend * ny) : [nx, ny];
            if (!bend && (peak[0] - cen[0]) * lx + (peak[1] - cen[1]) * ly < 0) { lx = -lx; ly = -ly; }   // straight edge: tag on the outer side
            k.label(t, peak, dirAnchor(lx, ly), e.color);
          }
        });
      }
      for (const [id, es] of loops) {
        const c = pos(id), [dx, dy] = Math.hypot(c[0] - cen[0], c[1] - cen[1]) < 1 ? [0, -1] : norm(c[0] - cen[0], c[1] - cen[1]);
        const th = Math.atan2(dy, dx), u = a => [Math.cos(th + a), Math.sin(th + a)];
        es.forEach((e, j) => {
          /* a circle through two points on the node rim, centre pushed outward; nested loops grow */
          const rl = 0.75 * R * (1 + 0.5 * j), st = col(e.color), at = (r, a) => [c[0] + r * u(a)[0], c[1] + r * u(a)[1]];
          const p0 = at(R, -0.5), tip = at(R, 0.5), Q = at(R * Math.cos(0.5) + Math.sqrt(rl * rl - (R * Math.sin(0.5)) ** 2), 0);
          let [tx, ty] = [-(tip[1] - Q[1]), tip[0] - Q[0]];
          if (tx * (c[0] - tip[0]) + ty * (c[1] - tip[1]) < 0) { tx = -tx; ty = -ty; }   // tangent at the tip, heading into the node
          svg += `<g data-edge="${esc(id)}-${esc(id)}"><path d="M${n2(p0[0])} ${n2(p0[1])}A${n2(rl)} ${n2(rl)} 0 1 1 ${n2(tip[0])} ${n2(tip[1])}" fill="none" style="stroke:${st}" stroke-width="${SW.out}"${e.dash ? ` stroke-dasharray="${DASH.asym}"` : ""}/>${dir ? head(tip, [tip[0] - tx, tip[1] - ty], st) : ""}</g>`;
          const t = tag(e);
          if (t != null) k.label(t, [Q[0] + rl * dx, Q[1] + rl * dy], dirAnchor(dx, dy), e.color);
        });
      }
      nodes.forEach((v, i) => {
        const [x, y] = X[i], st = col(v.color);
        svg += `<g data-node="${esc(v.id)}"><circle cx="${n2(x)}" cy="${n2(y)}" r="${R}" style="fill:var(--body);stroke:${st}" stroke-width="${SW.out}"/>` +
          (v.color ? `<circle cx="${n2(x)}" cy="${n2(y)}" r="${R}" style="fill:${st}" fill-opacity="${FILL}"/>` : "") + "</g>";
        k.label(v.label || texName(v.id), [x, y], "c", v.color);
      });
      return { svg, H };
    };
  }

  function prep(block) {
    if (block.kind === "network") {
      const g = structuredClone(block);
      g.nodes = g.nodes.map(v => typeof v === "object" && v.at ? { ...v, at: numify(v.at, "at") } : v);
      return g;
    }
    if (block.kind === "circuit") return structuredClone(block);   // names like "a" are not math.js numbers
    const g = {};
    for (const k in block) g[k] = k === "marks" ? block.marks.map(m => prepMark(m, block.kind)) : numify(block[k], k);
    return g;
  }

  function render(el, block) {
    if (typeof math === "undefined") { el.textContent = block.alt || ""; el.classList.add("fig-off"); return; }
    if (!el._g) el._g = prep(block);
    const g = el._g;
    mount(el, g.kind === "scene" ? scene(g) : g.kind === "bars" ? bars(g) : g.kind === "circuit" ? circuit(g) : g.kind === "network" ? network(g) : cartesian(g));
  }

  root.Graph = { render, tex };
})(window);
