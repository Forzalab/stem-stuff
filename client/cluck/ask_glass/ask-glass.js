/* CODEMAP HEADER
   ask-glass.js: the R3 glass Ask bar of Cluck's sheet, behind html.ui-v7 (flag off = this file is inert; cluck.js only calls it under V7()).
   Classic script (no module import), one global: window.stemAskGlass = { html, mount, setLocked, textRect, snap, flip }.
   cluck.js §ask-field builds the form (.ask.ag) with html() layers inside it and calls mount(form, scroller, locked); everything below is DOM + SVG filter, no data.
   Sections (grep -n "== §name =="):
     == §engine ==   liquidglass optics, copied verbatim (DEFAULTS, profileTable, renderLensMap, bendScale) + glassOn (returns { img, destroy })
     == §bar ==      the bar's params (PAR, LOCKP), the layers markup (html), the aria-hidden synced copy of the reply (clone + scroll sync + MutationObserver)
     == §lock ==     setLocked: the locked strip and its unlock sequence (shackle, text lift, rim light, 44 -> 56 spring)
     == §think ==    while Cluck streams: 120 (72 on gecko) lens maps built in <= 8 ms chunks, the clock swaps pre-built filter clones (the compositor-only rim + glow live in ask-glass.css)
     == §flip ==     iMessage send morph: the typed text box flies to the new student bubble (WAAPI, ~420 ms critically damped)
   Related: client/cluck/ask_glass/ask-glass.css (layers, strip, send button, thinking, fallbacks), client/cluck/cluck.js §ask-field (clAsk, clLockSync, clSend),
   client/shell/fx.js (html.fx-dim gate), client/answer/keyf_glass/keyf-glass.js (a different glass: a static scene on the Key formulas card; same MIT lens recipe, kept apart).
   Fallbacks: html.fx-dim / prefers-reduced-transparency = a solid warm fill (class ag-solid); an SVG filter that fails, or a phone sheet drag = the R3 frost (class ag-frost, ask-glass.css).
   The optics below are liquidglass (gentpan/liquidglass @ d5db099, MIT). The notice is kept. Changes: wrapped in an IIFE, glassOn also returns the feImage (the thinking light swaps its map). */
(function (g) {
"use strict";
/* == §engine == */
/* hg.js - hand-copied subset of liquidglass (https://github.com/gentpan/liquidglass, lib/liquid-glass.js v1.0.0,
 * commit d5db099ef00828496aa2733e4f35542c05a0b1f8).
 *
 * MIT License - Copyright (c) 2026 gentpan
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
 * documentation files (the "Software"), to deal in the Software without restriction, including without limitation
 * the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so, subject to the following conditions: The above copyright
 * notice and this permission notice shall be included in all copies or substantial portions of the Software.
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE
 * WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
 * OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 *
 * Copied verbatim: DEFAULTS, detectEngine, profileTable, renderLensMap, rimLight, write, bendScale (the optics + the
 * per-engine scale fixes). Written here: glassOn() below (static lens = whole element, no springs/components).
 */
const NS = 'http://www.w3.org/2000/svg';
const XLINK = 'http://www.w3.org/1999/xlink';
const NEUTRAL = 128;

const DEFAULTS = Object.freeze({
  // Lens rectangle in CSS px, relative to the filtered element's border box.
  x: 0,
  y: 0,
  width: 120,
  height: 64,
  radius: 32,
  // Optics.
  refraction: 18, // maximum bend at the rim, CSS px
  bezel: 0.6, // curved rim width as a fraction of the lens half-size (min side); 1 = full dome
  curvature: 4, // rim profile exponent: 2 = circular, 4 = squircle-like, higher = steeper rim
  ior: 1.5, // index of refraction; shapes how quickly the bend fades from the rim inward
  invert: false, // false = convex lens (magnifies), true = concave (content pushed outward)
  chroma: 0.12, // colour fringe; blue bends (1 + chroma)x as far as red. 0 skips the extra passes
  blur: 0, // frost, CSS px
  specular: 0.45, // rim highlight 0..1. 0 skips the pass
  specularWidth: 2, // rim highlight width, CSS px
  lightAngle: -120, // degrees; 0 = light from the right, -90 = from the top. The lit rim is brightest, the far rim reflects dimly
  mapScale: 0, // map pixels per CSS px; 0 = devicePixelRatio capped at 2
});


const engine = detectEngine();

function detectEngine() {
  if (typeof navigator === 'undefined') return 'unknown';
  const brands = navigator.userAgentData?.brands;
  if (brands?.some((b) => /Chromium/.test(b.brand))) return 'blink';
  const ua = navigator.userAgent;
  if (/Firefox\//.test(ua)) return 'gecko';
  // Every iOS browser is WebKit; their UAs carry CriOS/FxiOS rather than Chrome/Firefox.
  if (/AppleWebKit\//.test(ua) && !/Chrome\/|Chromium\/|Edg\//.test(ua)) return 'webkit';
  return /Chrome\//.test(ua) ? 'blink' : 'unknown';
}

/* ------------------------------------------------------------------------------------------------ */
/* Displacement map                                                                                   */
const profileCache = new Map();

// Normalised bend m(s) for s = (distance from rim) / bezel in [0, 1], tabulated once per optics.
// The glass surface height is h(s) = (1 - (1 - s)^k)^(1/k). A vertical ray hitting a surface tilted
// by theta refracts to asin(sin(theta) / ior); the lateral offset grows with tan(theta - refracted).
function profileTable(curvature, ior) {
  const key = `${curvature}|${ior}`;
  let table = profileCache.get(key);
  if (table) return table;
  const N = 512;
  table = new Float32Array(N + 1);
  let max = 0;
  for (let i = 0; i <= N; i++) {
    const s = Math.min(i / N, 1 - 1e-6);
    const a = Math.pow(1 - s, curvature);
    const slope = Math.pow(1 - s, curvature - 1) * Math.pow(Math.max(1 - a, 1e-9), 1 / curvature - 1);
    const theta = Math.atan(slope);
    const refracted = Math.asin(Math.sin(theta) / ior);
    const bend = Math.tan(theta - refracted);
    table[i] = bend;
    if (bend > max) max = bend;
  }
  for (let i = 0; i <= N; i++) table[i] /= max || 1;
  table[N] = 0;
  profileCache.set(key, table);
  return table;
}

/**
 * Paint the displacement map for a lens into a canvas.
 * Returns { canvas, width, height, scale } — usable by the SVG path (as a data URL) and by WebGL
 * (as a texture), so both renderers share one optical model.
 */
function renderLensMap(options = {}, scale = 1) {
  const p = { ...DEFAULTS, ...options };
  const w = Math.max(2, Math.round(p.width * scale));
  const h = Math.max(2, Math.round(p.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(w, h);
  const px = image.data;

  const sx = p.width / w; // CSS px per map pixel (x); equals 1 / scale up to rounding
  const sy = p.height / h;
  const hw = p.width / 2;
  const hh = p.height / 2;
  const r = Math.max(0, Math.min(p.radius, hw, hh));
  const bezel = Math.max(0.5, p.bezel * Math.min(hw, hh));
  const table = profileTable(p.curvature, p.ior);
  const N = table.length - 1;
  const rimWidth = Math.max(0.5, p.specularWidth);
  const aa = Math.max(sx, sy); // one map pixel of anti-aliasing at the rim
  const angle = (p.lightAngle * Math.PI) / 180;
  const lx = Math.cos(angle);
  const ly = Math.sin(angle);
  const dir = p.invert ? -1 : 1;

  // The rounded rectangle is symmetric in both axes: compute the top-left quadrant only and mirror
  // it, flipping the sign of the x bend across the vertical axis and of the y bend across the
  // horizontal axis. This keeps per-frame regeneration (squish, resize) inside the frame budget.
  const qw = Math.ceil(w / 2);
  const qh = Math.ceil(h / 2);
  for (let j = 0; j < qh; j++) {
    const y = (j + 0.5) * sy - hh; // <= 0
    for (let i = 0; i < qw; i++) {
      const x = (i + 0.5) * sx - hw; // <= 0
      // Signed distance to the rounded rectangle, evaluated on |p|.
      const qx = -x - (hw - r);
      const qy = -y - (hh - r);
      const ox = Math.max(qx, 0);
      const oy = Math.max(qy, 0);
      const corner = Math.hypot(ox, oy);
      const dist = corner + Math.min(Math.max(qx, qy), 0) - r; // < 0 inside
      const alpha = Math.min(1, Math.max(0, 0.5 - dist / aa));
      if (alpha <= 0) continue; // transparent: composited over neutral grey in the filter

      // Outward normal on |p| (points away from the centre).
      let nx;
      let ny;
      if (qx > 0 && qy > 0) {
        nx = ox / corner;
        ny = oy / corner;
      } else if (qx > qy) {
        nx = 1;
        ny = 0;
      } else {
        nx = 0;
        ny = 1;
      }

      const inset = Math.max(0, -dist);
      const s = inset / bezel;
      const m = s >= 1 ? 0 : table[Math.min(N, Math.round(s * N))];
      // Convex glass samples from further inside (towards the centre) near the rim.
      const bx = Math.round(127 * m * nx * dir);
      const by = Math.round(127 * m * ny * dir);

      // Rim highlight: a crisp line plus a softer inner glow, brightest where the rim faces the
      // light, with a dimmer reflection on the far side.
      const crisp = Math.max(0, 1 - inset / rimWidth);
      const glow = Math.max(0, 1 - inset / (rimWidth * 5));
      const rim = p.specular * (crisp * crisp + 0.3 * glow * glow);
      const a = Math.round(alpha * 255);

      const i2 = w - 1 - i;
      const j2 = h - 1 - j;
      // top-left: outward normal (-nx, -ny); sample towards +x/+y (inward)
      write(px, (j * w + i) * 4, NEUTRAL + bx, NEUTRAL + by, rimLight(rim, -nx * lx - ny * ly), a);
      if (i2 !== i) write(px, (j * w + i2) * 4, NEUTRAL - bx, NEUTRAL + by, rimLight(rim, nx * lx - ny * ly), a);
      if (j2 !== j) write(px, (j2 * w + i) * 4, NEUTRAL + bx, NEUTRAL - by, rimLight(rim, -nx * lx + ny * ly), a);
      if (i2 !== i && j2 !== j) write(px, (j2 * w + i2) * 4, NEUTRAL - bx, NEUTRAL - by, rimLight(rim, nx * lx + ny * ly), a);
    }
  }
  ctx.putImageData(image, 0, 0);
  return { canvas, width: w, height: h, scale };
}

// Blue channel for a rim pixel: `facing` is n·L for its outward normal.
function rimLight(rim, facing) {
  const shade = 0.12 + 0.88 * (facing > 0 ? facing : -0.4 * facing);
  return NEUTRAL + Math.round(127 * Math.min(1, rim * shade));
}

function write(px, o, r, g, b, a) {
  px[o] = r;
  px[o + 1] = g;
  px[o + 2] = b;
  px[o + 3] = a;
}
// With primitiveUnits="objectBoundingBox" (the only units WebKit renders — userSpaceOnUse turns the
// whole element blank), feDisplacementMap's `scale` is a fraction of the box, and each engine turns
// it into pixels differently (measured):
//   Blink:  x and y both use width
//   WebKit: x uses width, y uses height
//   Gecko:  x and y both use sqrt((w^2 + h^2) / 2)
// Returns the `scale` that bends `px` pixels on both axes, plus per-axis factors (<= 1) that squeeze
// the map's R/G channels where the engine would otherwise over-bend one axis.
function bendScale(px, w, h) {
  if (engine === 'webkit') {
    const m = Math.min(w, h);
    return { scale: (2 * px) / m, kx: m / w, ky: m / h };
  }
  if (engine === 'gecko') return { scale: (2 * px) / Math.sqrt((w * w + h * h) / 2), kx: 1, ky: 1 };
  return { scale: (2 * px) / w, kx: 1, ky: 1 };
}

/* ---- own code: one static glass lens = whole element, filter on an aligned copy of the backdrop ---- */
function node(name, attrs) { const n = document.createElementNS(NS, name); for (const k in attrs) n.setAttribute(k, attrs[k]); return n; }
const CH = ['1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0', '0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0', '0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0'];
let defs = null, uid = 0;
/** el = the aligned copy (a div that already holds the backdrop copy). opts: DEFAULTS keys. Returns {destroy}. */
function glassOn(el, opts = {}) {
  const p = { ...DEFAULTS, ...opts };
  if (!defs?.isConnected) {
    const s = document.createElementNS(NS, 'svg');
    s.setAttribute('width', '0'); s.setAttribute('height', '0'); s.setAttribute('aria-hidden', 'true');
    s.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none';
    defs = document.createElementNS(NS, 'defs'); s.appendChild(defs); document.body.appendChild(s);
  }
  const W = el.offsetWidth, H = el.offsetHeight; p.width = W; p.height = H; p.x = 0; p.y = 0;
  const dpr = window.devicePixelRatio || 1, scale = Math.min(dpr, 2);
  const url = renderLensMap(p, scale).canvas.toDataURL('image/png');
  const f = node('filter', { id: `hg${++uid}`, filterUnits: 'objectBoundingBox', x: 0, y: 0, width: 1, height: 1, primitiveUnits: 'objectBoundingBox', 'color-interpolation-filters': 'sRGB' });
  f.appendChild(node('feFlood', { 'flood-color': 'rgb(128,128,128)', result: 'neutral' }));
  const img = node('feImage', { preserveAspectRatio: 'none', result: 'lensShape', x: 0, y: 0, width: 1, height: 1 });
  img.setAttribute('href', url); img.setAttributeNS(XLINK, 'xlink:href', url); f.appendChild(img);
  f.appendChild(node('feComposite', { in: 'lensShape', in2: 'neutral', operator: 'over', result: 'map' }));
  const { scale: k, kx, ky } = bendScale(p.refraction, W, H);
  let bend = 'map';
  if (engine === 'webkit') { f.appendChild(node('feColorMatrix', { in: 'map', type: 'matrix', result: 'bend', values: `${kx} 0 0 0 ${(1 - kx) / 2}  0 ${ky} 0 0 ${(1 - ky) / 2}  0 0 1 0 0  0 0 0 1 0` })); bend = 'bend'; }
  let src = 'SourceGraphic';
  if (p.blur > 0) { f.appendChild(node('feGaussianBlur', { in: 'SourceGraphic', stdDeviation: `${p.blur / W} ${p.blur / H}`, result: 'frosted' })); src = 'frosted'; }
  if (p.chroma > 0) {
    CH.forEach((values, i) => { f.appendChild(node('feDisplacementMap', { in: src, in2: bend, xChannelSelector: 'R', yChannelSelector: 'G', scale: k * (1 + (p.chroma * i) / 2) })); f.appendChild(node('feColorMatrix', { type: 'matrix', values, result: `ch${i}` })); });
    f.appendChild(node('feComposite', { in: 'ch0', in2: 'ch1', operator: 'arithmetic', k1: 0, k2: 1, k3: 1, k4: 0, result: 'rg' }));
    f.appendChild(node('feComposite', { in: 'rg', in2: 'ch2', operator: 'arithmetic', k1: 0, k2: 1, k3: 1, k4: 0, result: 'refracted' }));
  } else f.appendChild(node('feDisplacementMap', { in: src, in2: bend, xChannelSelector: 'R', yChannelSelector: 'G', scale: k, result: 'refracted' }));
  let last = 'refracted';
  if (p.specular > 0) {
    f.appendChild(node('feColorMatrix', { in: 'map', type: 'matrix', values: `0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 2 0 ${-(2 * NEUTRAL) / 255}`, result: 'rim' }));
    f.appendChild(node('feComposite', { in: 'rim', in2: 'refracted', operator: 'arithmetic', k1: 0, k2: 1, k3: 1, k4: 0, result: 'lit' })); last = 'lit';
  }
  f.appendChild(node('feComposite', { in: last, in2: 'lensShape', operator: 'in' }));
  defs.appendChild(f);
  el.style.filter = `url(#${f.id})`;
  return { img, destroy() { if (f.parentNode) f.parentNode.querySelectorAll('[id^="' + f.id + '_"]').forEach((c) => c.remove()); f.remove(); el.style.filter = ''; } };   // also drops the thinking light's pre-built clones (id + '_k')
}

/* == §bar == */
/* The bar = the Cluck ask form (.ask.ag) itself. Layers inside it: .g-haze (glow, bleed), .g-copy (the synced copy of the reply, the one filtered node), .g-tint, .g-rim,
   .g-sweep (the unlock light), .g-think (the thinking ring), .g-lock (the locked strip's lock + words); the real field, counter and send button sit above them (ask-glass.css). */
const D = document, H = D.documentElement;
const PAR = { invert: false, refraction: 26, bezel: 0.56, curvature: 6, ior: 1, chroma: 0.13, blur: 5, specular: 0.55, specularWidth: 2.5, lightAngle: -25 };   // Tony's glass, exact
const LOCKP = { refraction: 10, chroma: 0, specular: 0.25 };   // the locked strip: calm glass
const RAD = 20, LOCK_RAD = 14;
const mq = (q) => { try { return g.matchMedia(q).matches; } catch (e) { return false; } };
const reduced = () => mq('(prefers-reduced-motion: reduce)');
const solid = () => H.classList.contains('fx-dim') || mq('(prefers-reduced-transparency: reduce)');   // fx.js low tier / no-blur gate, or the person asked for less transparency
const ST = new WeakMap();   // form -> state
const LOCK_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="4.5" y="10.5" width="15" height="10.5" rx="3"/><path d="M12 14.6v2.4"/><path class="shk" d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/></svg>';   // Lucide lock, altered (ISC): narrower body, rx 3, short shackle, slot
function html() {
  return '<div class="g-haze"></div><div class="g-copy" aria-hidden="true"></div><div class="g-tint"></div><div class="g-rim"></div><div class="g-sweep"><i class="spin"></i></div><div class="g-think"><i class="spin"></i></div>'
    + '<div class="g-lock" role="note">' + LOCK_SVG + '<span class="txt">Available after first try.</span></div>';
}
function mount(form, sc, locked) {
  let s = ST.get(form);
  if (!s) {
    s = { form, sc, copy: form.querySelector('.g-copy'), cl: form.closest('.cl'), clone: null, gl: null, img: null, base: '', W: 0, H: 0, opts: null, locked: !!locked, last: 0, timer: 0, rt: 0,
      maps: null, thinkOn: false, raf: 0, gen: 0, dirty: true, t1: 0, t3: 0, trk: 0, tf: 0, onEnd: null, anim: null };
    ST.set(form, s); sc._ag = s;
    form.classList.toggle('locked', s.locked);
    form.querySelector('.g-lock').setAttribute('aria-hidden', String(!s.locked));
    attach(sc);
    if (g.ResizeObserver) { s.ro = new ResizeObserver(() => { clearTimeout(s.rt); s.rt = setTimeout(() => size(s), 150); }); s.ro.observe(form); s.ro.observe(sc); }
    if (s.cl) { s.mo = new MutationObserver(() => later(s)); s.mo.observe(s.cl, { attributes: true, attributeFilter: ['class', 'data-state'] }); }
    size(s);
  } else { s.sc = sc; sc._ag = s; }
  return s;
}
/* one scroll listener and one MutationObserver per scroller (the reply container .cl-bd); they talk to its current bar */
function attach(sc) {
  if (sc._agOn) return; sc._agOn = true;
  sc.addEventListener('scroll', () => { const s = sc._ag; if (s && s.clone) s.clone.style.transform = 'translate3d(0,' + (-sc.scrollTop) + 'px,0)'; }, { passive: true });   // the copy follows the scroll: one transform write, no layout read of the copy
  new MutationObserver(() => { const s = sc._ag; if (s && s.form.isConnected) later(s); }).observe(sc, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class', 'hidden'] });
}
const thinking = (s) => !s.locked && !!s.cl && (s.cl.classList.contains('wbusy') || !!s.cl.querySelector('.wtext.wrun'));
/* rebuild the copy at most every ~120 ms while Cluck streams (40 ms otherwise); the filter stays on .g-copy, so a new copy needs no new lens */
function later(s) {
  s.dirty = true;
  if (s.timer) return;
  s.timer = setTimeout(() => { s.timer = 0; run(s); }, Math.max(0, (s.thinkOn ? 120 : 40) - (performance.now() - s.last)));
}
const moving = (s) => !!s.cl && (s.cl.dataset.state === 'dragging' || s.cl.dataset.state === 'moving');
function run(s) {
  s.last = performance.now();
  if (!s.form.isConnected || moving(s)) return;   // a phone sheet drag or rise: the bar shows the frost until the sheet settles (ask-glass.css); the settle (data-state) brings the next run
  thinkSet(s, thinking(s));
  if (s.dirty) { s.dirty = false; size(s); }
}
function rebuild(s) {
  const f = s.form, sc = s.sc;
  if (!f.isConnected || !f.offsetWidth || !s.copy) return;
  const fr = f.getBoundingClientRect(), br = sc.getBoundingClientRect(), c = sc.cloneNode(true);
  c.classList.remove('below', 'above'); c.classList.add('ag-clone');
  c.removeAttribute('id'); c.setAttribute('aria-hidden', 'true'); c.setAttribute('inert', '');
  c.querySelectorAll('[id]').forEach((e) => e.removeAttribute('id'));
  c.querySelectorAll('video, audio, iframe, script').forEach((e) => e.remove());
  c.querySelectorAll('a, button, input, textarea, select, [tabindex]').forEach((e) => e.setAttribute('tabindex', '-1'));
  c.style.cssText = 'left:' + (br.left - fr.left) + 'px;top:' + (br.top - fr.top) + 'px;width:' + sc.clientWidth + 'px;transform:translate3d(0,' + (-sc.scrollTop) + 'px,0)';   // laid out where the real text is, so the lens bends what is behind the bar
  s.copy.replaceChildren(c); s.clone = c;
}
/* the bar's size changed (window, sheet, a growing field, the unlock): the lens map is cut to the box, so it is made again */
function size(s) {
  const f = s.form;
  if (!f.isConnected) return;
  const w = f.offsetWidth, h = f.offsetHeight;
  if (!w) { thinkSet(s, false); return; }   // hidden (sheet closed): the light stops; it starts again with the next size
  rebuild(s);
  if (w !== s.W || h !== s.H || (!s.gl && !s.bad && !solid())) glass(s);
  thinkSet(s, thinking(s));
}
function glass(s) {
  const f = s.form;
  if (!solid() && (!s.copy || !s.copy.offsetWidth || !s.copy.offsetHeight)) return;   // the copy is not laid out (display:none during a sheet drag, a hidden sheet): keep what there is, the next size() comes back
  if (s.gl) { s.gl.destroy(); s.gl = null; s.img = null; }
  s.bad = false;
  s.maps = null; cancelAnimationFrame(s.raf); cancelAnimationFrame(s.gen);
  const was = s.thinkOn; s.thinkOn = false;
  f.classList.toggle('ag-solid', solid());
  if (solid() || !s.copy || !f.offsetWidth) { s.W = f.offsetWidth; s.H = f.offsetHeight; return; }
  try {
    const o = Object.assign({}, PAR, { radius: s.locked ? LOCK_RAD : RAD }, s.locked ? LOCKP : {});
    s.gl = glassOn(s.copy, o); s.img = s.gl.img; s.base = s.img.getAttribute('href'); s.opts = o; s.W = s.copy.offsetWidth; s.H = s.copy.offsetHeight;
    f.classList.remove('ag-frost');
  } catch (e) { s.gl = null; s.img = null; s.bad = true; s.W = f.offsetWidth; s.H = f.offsetHeight; f.classList.add('ag-frost'); }   // the lens failed: the R3 frost (ask-glass.css)
  if (was) thinkSet(s, true);
}
/* == §lock == */
/* before the first try the bar is a 44px locked strip; the first graded try unlocks it. Sequence (the approved mock): the shackle swings open (rotate 32deg about its hinge, no translate),
   the words lift 14px, blur 4px and fade, a tangerine light runs once round the rim, the strip springs 44 -> 56 (radius 14 -> 20), the field rises in, then the glass is made again at the new size.
   Reduced motion = instant. */
/* while the bar grows or shrinks its bottom stays put, so its top moves: every frame the copy is re-offset (top/left = the scroller's origin minus the bar's) so the lens keeps bending the right text;
   it ends on the bar's own height transitionend / animation finish (a timeout is the fallback), then the glass is made again at the new size */
function track(s, anim) {
  const f = s.form;
  stopTrack(s);
  const t0 = performance.now(), c0 = s.clone, top0 = f.offsetTop, left0 = f.offsetLeft;
  const bt = c0 ? parseFloat(c0.style.top) || 0 : 0, bl = c0 ? parseFloat(c0.style.left) || 0 : 0;
  const done = () => { stopTrack(s); s.W = 0; size(s); };
  const tick = () => {
    s.trk = 0;
    if (s.clone) { s.clone.style.top = (bt + top0 - f.offsetTop) + 'px'; s.clone.style.left = (bl + left0 - f.offsetLeft) + 'px'; }
    if (performance.now() - t0 < 900) s.trk = requestAnimationFrame(tick);
  };
  s.trk = requestAnimationFrame(tick);
  s.onEnd = (e) => { if (e.target === f && e.propertyName === 'height') done(); };
  f.addEventListener('transitionend', s.onEnd);
  if (anim && anim.finished) anim.finished.then(done, () => {});
  s.tf = setTimeout(done, 900);
}
function stopTrack(s) {
  cancelAnimationFrame(s.trk); s.trk = 0; clearTimeout(s.tf);
  if (s.onEnd) { s.form.removeEventListener('transitionend', s.onEnd); s.onEnd = null; }
}
function setLocked(form, locked) {
  const s = ST.get(form);
  if (!s) return;
  locked = !!locked;
  if (s.locked === locked) return;
  const was = s.locked; s.locked = locked;
  clearTimeout(s.t1); clearTimeout(s.t3); stopTrack(s);
  if (s.anim) { s.anim.cancel(); s.anim = null; }
  form.classList.remove('opening', 'sweep');
  form.querySelector('.g-lock').setAttribute('aria-hidden', String(!locked));
  if (locked) {
    thinkSet(s, false); form.classList.add('locked');
    const d = !reduced() && parseFloat(g.getComputedStyle(form).transitionDuration) > 0;   // a height transition on the bar: follow it; none: rebuild at once
    if (d) track(s); else { s.W = 0; size(s); }
    return;
  }
  if (!was || reduced() || !form.offsetWidth) { form.classList.remove('locked'); s.W = 0; size(s); return; }
  const h0 = form.offsetHeight;
  form.classList.add('opening');
  track(s);
  s.t1 = setTimeout(() => {
    form.classList.remove('locked'); form.classList.add('sweep');
    const h1 = form.offsetHeight;
    if (form.animate) s.anim = form.animate([{ height: h0 + 'px', borderRadius: LOCK_RAD + 'px' }, { height: h1 + 'px', borderRadius: RAD + 'px' }], { duration: 460, delay: 160, easing: 'cubic-bezier(.2,1.35,.32,1)', fill: 'backwards' });
    if (s.anim) track(s, s.anim);   // the same follow, now ended by the animation's finish
  }, 170);
  s.t3 = setTimeout(() => { form.classList.remove('sweep', 'opening'); }, 1100);
}
/* == §think == */
/* While Cluck streams a reply the bar's glass light orbits: 120 lens maps (72 on gecko; light angle -25 + k*360/N deg, specular 1, width 5.5) are built in <= 8 ms chunks per frame, each into its own
   clone of the base <filter> (feImage href set once, never swapped: gecko re-decodes the PNG on every swap), and the clock (4.3 s per revolution) only sets the copy's style.filter to a clone. The ring (a rotating square under a static mask), the glow and the bleed are CSS compositor layers (ask-glass.css): no gradient angle is animated. */
const setMap = (img, url) => { img.setAttribute('href', url); img.setAttributeNS(XLINK, 'xlink:href', url); };
function thinkSet(s, on) {
  on = !!on && !s.locked;
  if (on === s.thinkOn && on === s.form.classList.contains('think')) return;
  s.thinkOn = on; s.form.classList.toggle('think', on);
  cancelAnimationFrame(s.raf); cancelAnimationFrame(s.gen);
  if (!s.img) return;                                     // no lens (solid, frost, hidden): the CSS light is all there is
  const fb = s.img.parentNode, bid = fb.id, drop = () => { (s.fids || []).forEach((id) => { const c = document.getElementById(id); if (c) c.remove(); }); s.fids = []; };
  drop();
  if (!on) { if (s.copy) s.copy.style.filter = `url(#${bid})`; return; }
  const N = engine === 'gecko' ? 72 : 120, REV = 4300, scale = Math.min(g.devicePixelRatio || 1, 2), calm = reduced();
  const o = Object.assign({}, s.opts, { x: 0, y: 0, width: s.W, height: s.H, specular: 1, specularWidth: 5.5 });
  const maps = s.maps = [], img = s.img, total = calm ? 1 : N, el = s.copy;
  const build = () => {
    const t0 = performance.now();
    while (maps.length < total && performance.now() - t0 < 8) {
      const k = maps.length, c = fb.cloneNode(true), ci = c.querySelector('feImage');
      c.id = bid + '_' + k; setMap(ci, renderLensMap(Object.assign({}, o, { lightAngle: -25 + k * 360 / N }), scale).canvas.toDataURL('image/png'));
      fb.parentNode.appendChild(c); s.fids.push(c.id); maps.push(c.id);
    }
    if (maps.length < total) s.gen = requestAnimationFrame(build);
    else if (calm) el.style.filter = `url(#${maps[0]})`;   // reduced motion: one static lit clone, no loop
  };
  build();
  if (calm) return;
  let last = -1; const t0 = performance.now();
  const step = (t) => {
    if (!s.form.isConnected || s.img !== img) return;
    const n = maps.length;
    if (n) { const k = Math.floor(((t - t0) / REV) * N) % N, i = k < n ? k : n - 1; if (i !== last) { el.style.filter = `url(#${maps[i]})`; last = i; } }
    s.raf = requestAnimationFrame(step);
  };
  s.raf = requestAnimationFrame(step);
}
/* == §flip == */
/* iMessage send: the typed text's box (textRect) flies to the new student bubble. One fixed element moves by transform while its size, radius, colours, font size and padding interpolate on a
   critically damped spring (~420 ms, no overshoot). The real bubble is hidden until it lands. Reduced motion: nothing flies. */
function textRect(ta) {
  const r = ta.getBoundingClientRect(), cs = getComputedStyle(ta), lh = parseFloat(cs.lineHeight) || (parseFloat(cs.fontSize) || 17) * 1.4;
  let w = 0;
  try { const c = D.createElement('canvas').getContext('2d'); c.font = cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily; ta.value.split('\n').forEach((l) => { w = Math.max(w, c.measureText(l).width); }); } catch (e) { w = r.width; }
  const wide = w > ta.clientWidth, h = wide ? Math.min(ta.scrollHeight, r.height) : lh * Math.max(1, ta.value.split('\n').length);
  return { left: r.left, top: r.top + (r.height - h) / 2, width: Math.min(Math.ceil(w) + 1, ta.clientWidth), height: h, fs: cs.fontSize, color: cs.color, bg: 'rgba(0,0,0,0)', rad: '0px', pad: '0px' };
}
const spring = () => {   // x(t) = 1 - (1 + wt) e^(-wt): critically damped, settled (< 1%) at 420 ms
  if (!(g.CSS && CSS.supports && CSS.supports('animation-timing-function', 'linear(0, 1)'))) return 'cubic-bezier(.2,.9,.25,1)';
  const n = 24, w = 15.7, p = [];
  for (let i = 0; i <= n; i++) { const t = (i / n) * 0.42; p.push((1 - (1 + w * t) * Math.exp(-w * t)).toFixed(4)); }
  p[n] = '1';
  return 'linear(' + p.join(',') + ')';
};
function flip(from, bubble) {
  if (!from || !bubble || reduced() || !bubble.animate) return;
  const to = bubble.getBoundingClientRect();
  if (!to.width || !to.height || to.bottom < 0 || to.top > g.innerHeight) return;
  const cs = getComputedStyle(bubble), fly = D.createElement('div');
  fly.className = 'ag-fly'; fly.setAttribute('aria-hidden', 'true'); fly.textContent = bubble.textContent;
  fly.style.cssText = 'position:fixed;left:0;top:0;margin:0;z-index:70;pointer-events:none;box-sizing:border-box;overflow:hidden;white-space:pre-wrap;overflow-wrap:anywhere;line-height:' + cs.lineHeight + ';font-family:' + cs.fontFamily + ';font-weight:' + cs.fontWeight;
  D.body.append(fly);
  bubble.style.visibility = 'hidden';
  const k = (r, st) => ({ transform: 'translate(' + r.left + 'px,' + r.top + 'px)', width: r.width + 'px', height: r.height + 'px', borderRadius: st.rad, backgroundColor: st.bg, color: st.color, fontSize: st.fs, padding: st.pad });
  const end = { rad: cs.borderTopLeftRadius, bg: cs.backgroundColor, color: cs.color, fs: cs.fontSize, pad: cs.padding };
  const a = fly.animate([k(from, from), k(to, end)], { duration: 420, easing: spring(), fill: 'both' });
  const done = () => { fly.remove(); bubble.style.visibility = ''; };
  a.finished.then(done, done);
}
function snap(el) {   // the first box when a chip (not the field) is the sender
  const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
  return { left: r.left, top: r.top, width: r.width, height: r.height, fs: cs.fontSize, color: cs.color, bg: cs.backgroundColor, rad: cs.borderTopLeftRadius, pad: cs.padding };
}
g.stemAskGlass = { html, mount, setLocked, textRect, snap, flip };
})(window);
