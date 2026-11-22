/* CODEMAP HEADER
   keyf-glass.js: the smoked-lens glass behind the live "Key formulas" card (section#fcard.fcard). Classic script, IIFE, no deps,
   one global: window.stemGlass = { mount(cardEl, { seed }) -> { refresh(), destroy() }, config }.
   mount() inserts ONE <div class="kg" aria-hidden="true"> as the first child of the card and adds class kg-on. Everything lives in .kg:
   blue paint + lamp + 5 seeded symbols (SVG scene) -> blur + STATIC displacement map (liquid rim + thin-lens magnifier + k1 + chroma)
   -> tint -> grain -> rim (hairline, fresnel, TIR, vignette). The formulas are never touched or filtered.
   Motion (prefers-reduced-motion: no-preference only): conveyor belt (one slow shared velocity, seamless wrap) + tiny water bob/spring; only symbol transforms change per frame.
   Look = LOCKED-smoked-lens.json (brain projects/calc/_files/ui-polish/keyf-v16/), spec = SPEC-live.md there.
   Sections (grep -n "== §name =="):
     == §config ==   the locked look as the default config (window.stemGlass.config)
     == §lens ==     profileTable, lensField (map), bendScale, glassOn (SVG filter)
     == §symbols ==  SYM paths (pi, sigma, bulb), text glyphs, seeded pick + layout
     == §motion ==   conveyor belt (wrap) + tiny water bob target() + spring step
     == §layers ==   scene svg, tint, grain, rim (paint)
     == §mount ==    mount / refresh / destroy, observers, media queries, rAF loop
   Related: client/answer/keyf_glass/keyf-glass.css (structure), client/answer/drill_core/app.css (.fcard rules).
   The lens recipe (profileTable / lensField rim / bendScale / glassOn) is derived from liquidglass:
     MIT License. Copyright (c) 2026 gentpan, https://github.com/gentpan/liquidglass (commit d5db099).
     Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files
     (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge,
     publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so,
     subject to the following conditions: the above copyright notice and this permission notice shall be included in all copies or
     substantial portions of the Software. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING
     BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
     AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE,
     ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE. */
(function () {
  "use strict";
  var NS = "http://www.w3.org/2000/svg", TAU = Math.PI * 2;

  /* == §config == */
  var config = {
    glass: { refr: 66, bezpx: 122, curv: 8.1, ior: 2.89, chroma: 0.5, blur: 8, mag: 1.1, k1: 0.08, magFall: 0.5, magCap: 18,
      fresnel: 0.1, tir: 0.3, vign: 0.25, tint: 0.4, tintRGB: [3, 16, 26], paint: 0.16, sym: 0.55, bright: 0.7, sat: 0.98,
      grain: 0.53, grainF: 1.72, hair: 0.04, shadow: 0.81, radius: 16 },
    motion: { mode: "conveyor", speed: 1, belt: { vx: -3, vy: 0 }, ampX: 0, ampY: 1.5, rotA: 0.3, breathe: 0.6, current: 0, springK: 8, zeta: 0.75 },
    symbols: { always: ["bulb"], pool: ["pi", "sigma", "integral", "sqrt", "infinity", "partial", "theta", "delta"], cell: [110, 140],
      size_px: [70, 130], rot_deg: [-25, 25], alpha: [0.6, 1] }
  };

  /* == §lens == */
  var ENGINE = (function () { var b = navigator.userAgentData && navigator.userAgentData.brands;
    if (b && b.some(function (x) { return /Chromium/.test(x.brand); })) return "blink"; var ua = navigator.userAgent;
    if (/Firefox\//.test(ua)) return "gecko"; if (/AppleWebKit\//.test(ua) && !/Chrome\/|Chromium\/|Edg\//.test(ua)) return "webkit"; return "blink"; })();
  var NEUTRAL = 128;
  function profileTable(curvature, ior) { var N = 512, t = new Float32Array(N + 1), max = 0, i;
    for (i = 0; i <= N; i++) { var s = Math.min(i / N, 1 - 1e-6), a = Math.pow(1 - s, curvature), slope = Math.pow(1 - s, curvature - 1) * Math.pow(Math.max(1 - a, 1e-9), 1 / curvature - 1);
      var th = Math.atan(slope), rf = Math.asin(Math.sin(th) / ior), b = Math.tan(th - rf); t[i] = b; if (b > max) max = b; }
    for (i = 0; i <= N; i++) t[i] /= max || 1; t[N] = 0; return t; }
  /* per pixel, px of "sample from here instead": rim bezel bend + thin-lens magnifier (faded to the rim by magFall) + radial k1.
     Encoded like liquidglass: R,G = 128 + 127 d/max; feDisplacementMap scale = 2 max (bendScale). */
  function lensField(w0, h0, g) {
    var sc = Math.min(window.devicePixelRatio || 1, 2), w = Math.round(w0 * sc), h = Math.round(h0 * sc), hw = w0 / 2, hh = h0 / 2, r = Math.min(g.radius, hw, hh);
    var bez = Math.max(.5, Math.min(g.bezpx, Math.min(hw, hh) * .6)), refr = g.refr * bez / g.bezpx, /* short cards: bezel and rim bend shrink together */ T = profileTable(g.curv, g.ior), N = T.length - 1, diag = Math.hypot(hw, hh), kM = 1 - 1 / g.mag;
    var D = new Float32Array(w * h * 2), A = new Uint8ClampedArray(w * h), max = 0, i, j;
    for (j = 0; j < h; j++) for (i = 0; i < w; i++) {
      var x = (i + .5) / sc - hw, y = (j + .5) / sc - hh, qx = Math.abs(x) - (hw - r), qy = Math.abs(y) - (hh - r), ox = Math.max(qx, 0), oy = Math.max(qy, 0), c = Math.hypot(ox, oy);
      var dist = c + Math.min(Math.max(qx, qy), 0) - r; if (dist > .5) continue; A[j * w + i] = Math.round(255 * Math.min(1, .5 - dist));
      var nx, ny; if (qx > 0 && qy > 0) { nx = ox / c; ny = oy / c; } else if (qx > qy) { nx = 1; ny = 0; } else { nx = 0; ny = 1; } nx *= Math.sign(x) || 1; ny *= Math.sign(y) || 1;
      var s = Math.max(0, -dist) / bez, m = s >= 1 ? 0 : T[Math.min(N, Math.round(s * N))], rn2 = (x * x + y * y) / (diag * diag);
      var fall = 1 - g.magFall * (s < 1 ? 1 - s : 0);
      var kk = kM * fall + g.k1 * rn2, mx = -x * kk, my = -y * kk, ml = Math.hypot(mx, my);   // magnifier + k1: smooth-capped (tanh) so wide cards do not blow up the chroma
      if (ml > 1e-6 && g.magCap > 0) { var cs = g.magCap * Math.tanh(ml / g.magCap) / ml; mx *= cs; my *= cs; }
      var dx = -nx * refr * m + mx, dy = -ny * refr * m + my;
      D[(j * w + i) * 2] = dx; D[(j * w + i) * 2 + 1] = dy; max = Math.max(max, Math.abs(dx), Math.abs(dy)); }
    var cv = document.createElement("canvas"); cv.width = w; cv.height = h; var ctx = cv.getContext("2d"), im = ctx.createImageData(w, h), px = im.data, mm = max || 1;
    for (var k = 0; k < w * h; k++) { px[k * 4] = 128 + Math.round(127 * D[k * 2] / mm); px[k * 4 + 1] = 128 + Math.round(127 * D[k * 2 + 1] / mm); px[k * 4 + 2] = 128; px[k * 4 + 3] = A[k]; }
    ctx.putImageData(im, 0, 0); return { url: cv.toDataURL(), max: max }; }
  function bendScale(px, w, h) { if (ENGINE === "webkit") { var m = Math.min(w, h); return { scale: 2 * px / m, kx: m / w, ky: m / h }; }
    if (ENGINE === "gecko") return { scale: 2 * px / Math.sqrt((w * w + h * h) / 2), kx: 1, ky: 1 }; return { scale: 2 * px / w, kx: 1, ky: 1 }; }
  var CH = ["1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0", "0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0", "0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0"];
  var uid = 0;
  function node(n, a) { var e = document.createElementNS(NS, n); for (var k in a) e.setAttribute(k, a[k]); return e; }
  /* builds the refraction <filter> into defs; the map covers the whole box. Returns the filter id. */
  function glassFilter(defs, p, W, H, url) {
    var f = node("filter", { id: "kgf" + (++uid) + "_" + Math.random().toString(36).slice(2, 6), filterUnits: "objectBoundingBox", x: 0, y: 0, width: 1, height: 1, primitiveUnits: "objectBoundingBox", "color-interpolation-filters": "sRGB" });
    f.appendChild(node("feFlood", { "flood-color": "rgb(128,128,128)", result: "neutral" }));
    var img = node("feImage", { preserveAspectRatio: "none", result: "lensShape", x: 0, y: 0, width: 1, height: 1 }); img.setAttribute("href", url); f.appendChild(img);
    f.appendChild(node("feComposite", { "in": "lensShape", in2: "neutral", operator: "over", result: "map" }));
    var bs = bendScale(p.refraction, W, H), k = bs.scale, bend = "map";
    if (ENGINE === "webkit") { f.appendChild(node("feColorMatrix", { "in": "map", type: "matrix", result: "bend", values: bs.kx + " 0 0 0 " + ((1 - bs.kx) / 2) + "  0 " + bs.ky + " 0 0 " + ((1 - bs.ky) / 2) + "  0 0 1 0 0  0 0 0 1 0" })); bend = "bend"; }
    var src = "SourceGraphic"; if (p.blur > 0) { f.appendChild(node("feGaussianBlur", { "in": src, stdDeviation: (p.blur / W) + " " + (p.blur / H), result: "frosted" })); src = "frosted"; }
    if (p.chroma > 0) { CH.forEach(function (v, i) { f.appendChild(node("feDisplacementMap", { "in": src, in2: bend, xChannelSelector: "R", yChannelSelector: "G", scale: k * (1 + p.chroma * i / 2) })); f.appendChild(node("feColorMatrix", { type: "matrix", values: v, result: "ch" + i })); });
      f.appendChild(node("feComposite", { "in": "ch0", in2: "ch1", operator: "arithmetic", k1: 0, k2: 1, k3: 1, k4: 0, result: "rg" }));
      f.appendChild(node("feComposite", { "in": "rg", in2: "ch2", operator: "arithmetic", k1: 0, k2: 1, k3: 1, k4: 0, result: "refracted" })); }
    else f.appendChild(node("feDisplacementMap", { "in": src, in2: bend, xChannelSelector: "R", yChannelSelector: "G", scale: k, result: "refracted" }));
    f.appendChild(node("feComposite", { "in": "refracted", in2: "lensShape", operator: "in" }));
    defs.appendChild(f); return f.id; }

  /* == §symbols == */
  var SYM = {
    sigma: { w: 268, h: 342, d: "M0 0H268V70L246 56L238 32H88L212 157L80 289H212L258 244L268 252V342H0L38 289L155 172L17 34Z" },
    pi: { w: 300, h: 262, d: "M8 74C22 30 44 12 86 12H292V66H226V192C226 214 236 222 250 222C262 222 270 214 276 200L292 208C284 246 262 262 232 262C192 262 172 240 172 196V66H120C116 150 98 214 66 254C60 262 52 262 44 262C30 262 22 254 22 242C22 232 28 226 36 218C66 186 76 132 78 66C54 66 40 76 26 96Z" },
    bulb: { w: 220, h: 330, d: "M110 6C170 6 214 50 214 110C214 146 198 170 178 192C164 208 156 222 154 244H66C64 222 56 208 42 192C22 170 6 146 6 110C6 50 50 6 110 6ZM62 256H158C164 256 168 260 168 266C168 272 164 276 158 276H62C56 276 52 272 52 266C52 260 56 256 62 256ZM68 286H152C158 286 162 290 162 296C162 302 158 306 152 306H68C62 306 58 302 58 296C58 290 62 286 68 286ZM86 314H134C130 324 122 330 110 330C98 330 90 324 86 314Z" }
  };
  /* glyphs drawn as SVG <text> in the page's KaTeX fonts (already loaded); aspect = width / size, used for margins */
  var TXT = { integral: { c: "∫", f: "KaTeX_Main", asp: 0.75, dy: 0.04 }, sqrt: { c: "√", f: "KaTeX_Main", asp: 0.85, dy: 0.05 },
    infinity: { c: "∞", f: "KaTeX_Main", asp: 1.1, dy: 0 }, partial: { c: "∂", f: "KaTeX_Math", asp: 0.6, dy: 0.02, it: 1 },
    theta: { c: "θ", f: "KaTeX_Math", asp: 0.55, dy: 0.02, it: 1 }, delta: { c: "δ", f: "KaTeX_Math", asp: 0.55, dy: 0.02, it: 1 } };
  var FONT_STACK = ', "KaTeX_Main", "Times New Roman", serif';
  function rng(seed) { var h = 2166136261, i; seed = String(seed); for (i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); } var a = h >>> 0;
    return function () { a = (a + 0x6D2B79F5) | 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  /* Fill (Tony 04:53): a jittered grid, one symbol per cell (~110-140 px), laid over ONE belt tile = card width + 2 margins, so the wrap
     (x modulo tile width) happens fully off-card and the strip is seamless. Pool cycled in seeded order; bulb at least once per tile.
     sym = { key, size, asp, x, y, rot, a, ph[], per, amp, + spring state }. x in [-m, W+m), y in [0, H): card px (scene coords). */
  function pickSymbols(seed, W, H, S, m) {
    var r = rng("kg" + seed), pool = S.pool.slice(), i, j, t, TW = W + 2 * m;
    var cell = S.cell[0] + r() * (S.cell[1] - S.cell[0]), cols = Math.max(1, Math.round(TW / cell)), rows = Math.max(1, Math.round(H / cell)), cw = TW / cols, ch = H / rows;
    var n = cols * rows, keys = [], k = 1, out = [], bulbs = {};
    function shuffle(a) { for (var q = a.length - 1; q > 0; q--) { var z = Math.floor(r() * (q + 1)), tt = a[q]; a[q] = a[z]; a[z] = tt; } return a; }
    for (i = 0; i < n; i++) { if (i % pool.length === 0) shuffle(pool); keys.push(pool[i % pool.length]); }
    var nb = Math.max(1, Math.round(n / 8)); S.always.forEach(function (al) { shuffle(keys.map(function (_, q) { return q; })).slice(0, nb).forEach(function (q) { keys[q] = al; bulbs[q] = 1; }); });
    keys.forEach(function (key, idx) {
      var c = idx % cols, rw = Math.floor(idx / cols), size = (S.size_px[0] + r() * (S.size_px[1] - S.size_px[0])) * k, asp = SYM[key] ? SYM[key].w / SYM[key].h : TXT[key].asp;
      out.push({ key: key, size: size, asp: asp, x: -m + (c + .5 + (r() - .5) * .5) * cw, y: (rw + .5 + (r() - .5) * .5) * ch, rot: S.rot_deg[0] + r() * (S.rot_deg[1] - S.rot_deg[0]),
        a: key === "bulb" ? Math.max(.7, S.alpha[0] + r() * (S.alpha[1] - S.alpha[0])) : S.alpha[0] + r() * (S.alpha[1] - S.alpha[0]),
        ph: [0, 1, 2, 3, 4].map(function () { return r() * TAU; }), per: 1 + (r() - .5) * .3, amp: 1 + (r() - .5) * .3,
        sx: 0, sy: 0, vx: 0, vy: 0, srot: 0, vr: 0, ssc: 1 }); });
    return out; }

  /* == §motion == */
  function target(s, t, g, hx) { var T = t * s.per * g.speed;
    var cur = Math.sin(TAU * (T / 23 + hx * .004)) * .6 + Math.sin(TAU * (T / 31.7 - hx * .002) + 1.3) * .4;
    return { x: (g.ampX * Math.sin(TAU * T / 11 + s.ph[0]) + g.ampX * .4 * Math.sin(TAU * T / 17.3 + s.ph[1]) + g.current * cur) * s.amp,
      y: (g.ampY * Math.sin(TAU * T / 9 + s.ph[2]) + g.ampY * .24 * Math.sin(TAU * T / 4.7 + s.ph[3]) + g.current * .5 * Math.cos(TAU * T / 19 + hx * .003)) * s.amp,
      rot: g.rotA * Math.sin(TAU * T / 17 + s.ph[4]) * s.amp, sc: 1 + g.breathe / 100 * Math.sin(TAU * T / 12 + s.ph[2] + Math.PI / 2) }; }
  var mod = function (a, n) { return ((a % n) + n) % n; };

  /* == §layers == */
  function grainURL(g) { return 'url("data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="' + g.grainF + '" numOctaves="2" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter><rect width="100%" height="100%" filter="url(#n)"/></svg>') + '")'; }
  function symNode(s, sym) {
    var gEl = node("g", { "data-k": s.key }), fill = "rgb(255 255 255 / " + Math.min(1, sym * s.a).toFixed(3) + ")";
    if (SYM[s.key]) { var d = SYM[s.key], sc = s.size / d.h;
      gEl.appendChild(node("path", { fill: fill, d: d.d, transform: "scale(" + sc + ") translate(" + (-d.w / 2) + " " + (-d.h / 2) + ")" })); }
    else { var t = TXT[s.key], el = node("text", { fill: fill, "text-anchor": "middle", "dominant-baseline": "central", x: 0, y: t.dy * s.size, "font-size": s.size,
        "font-family": t.f + FONT_STACK, "font-style": t.it ? "italic" : "normal" }); el.textContent = t.c; gEl.appendChild(el); }
    return gEl; }

  /* == §mount == */
  var RM = matchMedia("(prefers-reduced-motion: reduce)"), RT = matchMedia("(prefers-reduced-transparency: reduce)"), HC = matchMedia("(prefers-contrast: more)");
  var cards = new WeakMap();
  function onMQ(mq, fn) { if (mq.addEventListener) mq.addEventListener("change", fn); else if (mq.addListener) mq.addListener(fn); }
  function offMQ(mq, fn) { if (mq.removeEventListener) mq.removeEventListener("change", fn); else if (mq.removeListener) mq.removeListener(fn); }

  function mount(card, opts) {
    if (!card || card.nodeType !== 1) return { refresh: function () {}, destroy: function () {} };
    var have = cards.get(card); if (have) { have.refresh(); return have.handle; }
    var seed = (opts && opts.seed != null) ? opts.seed : (location.hash || "kg");
    var kg = null, defs = null, svgDefs = null, scene = null, symEls = [], syms = [], filterIds = [], ro = null, io = null, rt = 0, raf = 0, visible = true;
    var R = { w: 0, h: 0 }, beltM = 0, T = 0, last = 0, built = false, gone = false, madeRel = false;

    function glassOff() { return RT.matches || HC.matches; }
    function animOn() { return built && !RM.matches && !document.hidden && visible && !gone; }

    function teardownDom() {
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      if (kg && kg.parentNode) kg.parentNode.removeChild(kg);
      kg = defs = svgDefs = scene = null; symEls = []; syms = []; filterIds = [];
      card.classList.remove("kg-on"); card.style.removeProperty("--kg-sh");
      if (madeRel) { card.style.position = ""; madeRel = false; }
      built = false; R = { w: 0, h: 0 }; }

    function build() {
      if (gone || glassOff()) return;
      var w = card.clientWidth, h = card.clientHeight; if (w < 8 || h < 8) return;
      var g = config.glass, S = config.symbols;
      if (!kg) {
        kg = document.createElement("div"); kg.className = "kg"; kg.setAttribute("aria-hidden", "true");
        card.insertBefore(kg, card.firstChild); card.classList.add("kg-on");
        if (getComputedStyle(card).position === "static") { card.style.position = "relative"; madeRel = true; }
        kg.innerHTML = '<div class="kg-lensed"><div class="kg-bd"></div><div class="kg-tint"></div></div><div class="kg-grain"></div><div class="kg-hair"></div>';
        svgDefs = document.createElementNS(NS, "svg"); svgDefs.setAttribute("class", "kg-defs"); svgDefs.setAttribute("aria-hidden", "true"); defs = document.createElementNS(NS, "defs"); svgDefs.appendChild(defs); kg.appendChild(svgDefs); }
      var lensed = kg.querySelector(".kg-lensed"), bd = kg.querySelector(".kg-bd"), tint = kg.querySelector(".kg-tint"), grain = kg.querySelector(".kg-grain"), hair = kg.querySelector(".kg-hair");
      var cr = parseFloat(getComputedStyle(card).borderTopLeftRadius); var rad = isFinite(cr) && cr > 0 ? cr : g.radius;
      var sizeChanged = w !== R.w || h !== R.h; R = { w: w, h: h };
      card.style.setProperty("--kg-sh", g.shadow);
      // lens map: only regenerated here (init / resize); new filter id each time, old one removed
      while (defs.firstChild) defs.removeChild(defs.firstChild); filterIds = [];
      lensed.style.filter = "";
      var supported = typeof SVGFEDisplacementMapElement !== "undefined";
      if (supported) { var F = lensField(w, h, { refr: g.refr, bezpx: g.bezpx, curv: g.curv, ior: g.ior, mag: g.mag, k1: g.k1, magFall: g.magFall, magCap: g.magCap, radius: rad });
        var id = glassFilter(defs, { refraction: Math.max(F.max, .01), chroma: g.chroma, blur: g.blur }, w, h, F.url); filterIds.push(id); lensed.style.filter = "url(#" + id + ")"; }
      else lensed.style.filter = "blur(" + g.blur + "px)";   // frost only
      // scene
      if (!syms.length || sizeChanged) { var old = syms; var cell = Math.max(70, Math.min(140, Math.min(w, h) * .55)), ks = Math.min(1, cell / 125), S2 = { always: S.always, pool: S.pool, cell: [cell, cell * 1.1], rot_deg: S.rot_deg, alpha: S.alpha, size_px: [Math.max(44, S.size_px[0] * ks), Math.max(60, S.size_px[1] * ks)] };
        var mg = S2.size_px[1] * 1.4; beltM = mg; syms = pickSymbols(seed, w, h, S2, mg); if (old.length && old.length === syms.length) syms.forEach(function (s, i) { s.sx = old[i].sx; s.sy = old[i].sy; s.vx = old[i].vx; s.vy = old[i].vy; s.srot = old[i].srot; s.vr = old[i].vr; s.ssc = old[i].ssc; }); }
      bd.style.filter = "brightness(" + g.bright + ") saturate(" + g.sat + ")";
      bd.innerHTML = '<div style="inset:0;width:100%;height:100%;opacity:' + g.paint + ';background:radial-gradient(120% 140% at 12% -10%, #334979 0%, #263860 22%, #1a294b 45%, #111d3a 72%, #0b152e 100%)"></div>';
      scene = document.createElementNS(NS, "svg"); scene.setAttribute("width", w); scene.setAttribute("height", h); scene.setAttribute("viewBox", "0 0 " + w + " " + h); bd.appendChild(scene);
      symEls = syms.map(function (s) { var el = symNode(s, g.sym); scene.appendChild(el); return el; });
      // tint, grain, rim
      tint.style.background = "rgb(" + g.tintRGB[0] + " " + g.tintRGB[1] + " " + g.tintRGB[2] + " / " + g.tint + ")";
      grain.style.opacity = g.grain; grain.style.backgroundImage = grainURL(g);
      hair.style.boxShadow = "inset 0 0 0 1px rgb(255 255 255 / " + g.hair + "), inset 0 0 " + (g.bezpx * .25) + "px rgb(255 255 255 / " + g.fresnel + "), inset 0 0 " + Math.max(2, g.bezpx * .08) + "px " + Math.max(1, g.bezpx * .03) + "px rgb(0 0 0 / " + g.tir + ")";
      hair.style.background = "radial-gradient(120% 140% at 50% 50%, transparent 55%, rgb(0 0 0 / " + g.vign + ") 100%)";
      built = true; pose(); kick(); }

    /* margin >= largest symbol, so a symbol fully leaves one edge before re-entering the opposite one */
    function margin() { var mx = 0; syms.forEach(function (q) { mx = Math.max(mx, q.size * Math.max(1, q.asp) * 1.25); }); return mx; }
    function pose() {   // write all transforms from the current sim state (static pose when motion is off)
      if (!built) return; var m = beltM, belt = config.motion.belt, mo = T, W2 = R.w + 2 * m, H2 = R.h;
      syms.forEach(function (s, i) {
        var px = mod(s.x + m + belt.vx * mo * config.motion.speed, W2) - m, py = belt.vy ? mod(s.y + belt.vy * mo, H2) : s.y;
        symEls[i].setAttribute("transform", "translate(" + (px + s.sx).toFixed(2) + " " + (py + s.sy).toFixed(2) + ") rotate(" + (s.rot + s.srot).toFixed(3) + ") scale(" + s.ssc.toFixed(4) + ")"); }); }
    function frame(ts) {
      raf = 0; if (!animOn()) return;
      var t = ts / 1000, dt = Math.min(1 / 30, Math.max(0, t - last)); last = t; T += dt;
      var mo = config.motion, K = mo.springK, C = 2 * mo.zeta * Math.sqrt(K);
      syms.forEach(function (s) { var tg = target(s, T, mo, s.x);
        s.vx += (-K * (s.sx - tg.x) - C * s.vx) * dt; s.sx += s.vx * dt; s.vy += (-K * (s.sy - tg.y) - C * s.vy) * dt; s.sy += s.vy * dt;
        s.vr += (-K * (s.srot - tg.rot) - C * s.vr) * dt; s.srot += s.vr * dt; s.ssc += (tg.sc - s.ssc) * (1 - Math.exp(-dt / .6)); });
      pose(); raf = requestAnimationFrame(frame); }
    function kick() { if (animOn()) { if (!raf) { last = performance.now() / 1000; raf = requestAnimationFrame(frame); } } else if (raf) { cancelAnimationFrame(raf); raf = 0; } }
    function settle() {   // reduced motion: static pose (no drift, no bob)
      syms.forEach(function (s) { s.sx = s.sy = s.vx = s.vy = s.srot = s.vr = 0; s.ssc = 1; }); T = 0; pose(); }

    function refresh() { if (gone) return; if (glassOff()) { teardownDom(); return; } build(); }
    function debounced() { clearTimeout(rt); rt = setTimeout(function () { if (!gone && built && (card.clientWidth !== R.w || card.clientHeight !== R.h)) build(); else if (!built && !gone) build(); }, 120); }
    function onMotion() { if (RM.matches) { if (raf) { cancelAnimationFrame(raf); raf = 0; } settle(); } else kick(); }
    function onVis() { kick(); }
    function onTransp() { refresh(); }
    function destroy() {
      if (gone) return; gone = true; clearTimeout(rt);
      if (ro) ro.disconnect(); if (io) io.disconnect(); ro = io = null;
      document.removeEventListener("visibilitychange", onVis); offMQ(RM, onMotion); offMQ(RT, onTransp); offMQ(HC, onTransp);
      teardownDom(); cards.delete(card); }
    var handle = { refresh: refresh, destroy: destroy };
    cards.set(card, { refresh: refresh, handle: handle });

    document.addEventListener("visibilitychange", onVis); onMQ(RM, onMotion); onMQ(RT, onTransp); onMQ(HC, onTransp);
    if (typeof ResizeObserver !== "undefined") { ro = new ResizeObserver(debounced); ro.observe(card); }
    if (typeof IntersectionObserver !== "undefined") { io = new IntersectionObserver(function (es) { var e = es[es.length - 1]; visible = !!(e && e.isIntersecting); kick(); }); io.observe(card); }
    if (RM.matches) { /* static pose from the start */ }
    build();
    if (document.fonts && document.fonts.load) {   // glyph text needs the KaTeX fonts: redraw the scene once they are in (map is unchanged)
      Promise.all(["20px KaTeX_Main", "italic 20px KaTeX_Math"].map(function (f) { return document.fonts.load(f, "∫θ"); })).then(function () { if (!gone && built) { /* text re-rasterises by itself */ pose(); } }, function () {}); }
    return handle;
  }

  window.stemGlass = { mount: mount, config: config };
})();
