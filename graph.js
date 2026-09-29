/* graph.js: renders a problem "graph" block (schema/problem.schema.json) into an element.
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
      ? `<circle cx="${n2(x)}" cy="${n2(y)}" r="4.5" style="fill:var(--sheet);stroke:${col(m.color)}" stroke-width="${SW.out}"/>`
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
        let s = `<polygon points="${P(v)}" style="fill:var(--sheet);stroke:${col(m.color)}" stroke-width="${SW.out}"/>`;
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
        /* outline only (DESIGN-LANGUAGE.md 6): sheet fill so the body covers lines behind it */
        const fill = m.fill ? `fill:${col(m.color || "c1")};fill-opacity:${FILL}` : "fill:var(--sheet)";
        let s;
        if (m.shape === "box" || m.shape === "rod") {
          const w = m.w * k.s, h = Math.max(m.h * k.s, m.shape === "rod" ? 6 : 0), rx = m.shape === "rod" ? Math.min(h / 2, 3) : 2;
          s = `<rect x="${n2(-w / 2)}" y="${n2(-h / 2)}" width="${n2(w)}" height="${n2(h)}" rx="${rx}" transform="translate(${n2(x)} ${n2(y)}) rotate(${-(m.angle || 0)})" style="${fill};stroke:${st}" stroke-width="${SW.out}"/>`;
        } else if (m.shape === "dot") {
          s = `<circle cx="${n2(x)}" cy="${n2(y)}" r="${n2(Math.max(6, (m.r || 0) * k.s))}" style="fill:${st}"/>`;
        } else {
          const r = m.r * k.s;
          s = `<circle cx="${n2(x)}" cy="${n2(y)}" r="${n2(r)}" style="${fill};stroke:${st}" stroke-width="${SW.out}"/>`;
          if (m.shape === "ring") s += `<circle cx="${n2(x)}" cy="${n2(y)}" r="${n2(Math.max(1, r - 5))}" style="fill:var(--sheet);stroke:${st}" stroke-width="${SW.out}"/>`;
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
          s += `<polygon points="${P([[x, y], [q[0] - 7 * uy, q[1] + 7 * ux], [q[0] + 7 * uy, q[1] - 7 * ux]])}" style="fill:var(--sheet);stroke:${st}" stroke-width="${SW.out}"/>`; }
        s += `<circle cx="${n2(x)}" cy="${n2(y)}" r="${n2(r)}" style="fill:var(--sheet);stroke:${st}" stroke-width="${SW.out}"/>`;
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
        return `<polygon points="${P([[x, y], [bx - hw * d[1], by + hw * d[0]], [bx + hw * d[1], by - hw * d[0]]])}" style="fill:var(--sheet);stroke:${col(m.color)}" stroke-width="${SW.out}"/>` +
          `<circle cx="${n2(x)}" cy="${n2(y)}" r="3.5" style="fill:var(--sheet);stroke:${col(m.color)}" stroke-width="${SW.out}"/>`;
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
      const k = { label: (text, at, anchor, color, cls = "") => labels.push({ text, at, anchor, color, cls }) };
      const { svg, H } = build(W, pad, k);
      el.style.height = H + "px";
      el.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true" focusable="false">${svg}</svg>`;
      const grow = { l: 0, r: 0, t: 0, b: 0 };
      for (const L of labels) {
        if (!L.at || !fin(L.at)) continue;
        const sp = document.createElement("span");
        sp.className = "lbl " + L.cls; sp.setAttribute("aria-hidden", "true");
        sp.innerHTML = tex(L.text); sp.style.color = L.cls ? "" : labelColor(L.color);
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
      const pts = marks.filter(m => S[m.mark]).flatMap(m => S[m.mark].pts(m)).filter(fin);
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

  function prep(block) {
    const g = {};
    for (const k in block) g[k] = k === "marks" ? block.marks.map(m => prepMark(m, block.kind)) : numify(block[k], k);
    return g;
  }

  function render(el, block) {
    if (typeof math === "undefined") { el.textContent = block.alt || ""; el.classList.add("fig-off"); return; }
    if (!el._g) el._g = prep(block);
    const g = el._g;
    mount(el, g.kind === "scene" ? scene(g) : g.kind === "bars" ? bars(g) : cartesian(g));
  }

  root.Graph = { render, tex };
})(window);
