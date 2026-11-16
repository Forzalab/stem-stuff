/* bento_fill.js: PHONE-FILL (Tony Nov 15: "compact. however ALWAYS try to (research papers and algos) fit all spaces, no space goes to waste" / "dynamic and justified fill can ship").
   Pure (no DOM): the justified-rows plan for a phone (<= 480px) MC / pick-all answer block. Flickr / Google Photos model: tile weight from its text length, LINEAR PARTITION of the
   options (kept IN ORDER: reading order A,B,C.. left-to-right, top-to-bottom) into k rows whose weights balance (DP, minimise the heaviest row), tile widths in a row follow the weights
   (spans out of SPAN = 60 columns, largest remainder, a min span so a tile never drops under 44px), and k is chosen by a cheap estimate (aspect near 1.5, font estimate, feasibility).
   bento.js (DOM half) measures the real need per row, stretches the row heights so the block fills the available height, and fits each tile's font 15 -> 10px.
   plan(items, R, A, o): items [{len}] (chars of text, math counted by width), R block width px, A available height px -> {k, rows:[[i..]], spans:[s per item], estH:[px per row]}. */
(function () {
  "use strict";
  var root = typeof window !== "undefined" ? window : globalThis;
  var SPAN = 60, GAP = 6, PADX = 16, PADY = 12, LEAD = 18, FS_MAX = 15, FS_MIN = 10, MINH = 44, ASPECT = 1.5;
  function weight(len) { return Math.max(3, Math.sqrt(Math.max(0, len)) * 2.2); }   // the mock's tile weight
  /* linear partition of w[] (in order) into k contiguous rows minimising the heaviest row (classic DP, n <= 8) -> [[i..]] */
  function partition(w, k) {
    var n = w.length; k = Math.max(1, Math.min(k, n));
    var pre = [0]; for (var i = 0; i < n; i++) pre.push(pre[i] + w[i]);
    var M = [], D = [];
    for (i = 0; i <= n; i++) { M.push([]); D.push([]); for (var j = 0; j <= k; j++) { M[i].push(Infinity); D[i].push(0); } }
    M[0][0] = 0;
    for (i = 1; i <= n; i++) for (j = 1; j <= Math.min(k, i); j++) for (var p = j - 1; p < i; p++) {
      var c = Math.max(M[p][j - 1], pre[i] - pre[p]);
      if (c < M[i][j] - 1e-9) { M[i][j] = c; D[i][j] = p; }
    }
    var rows = [], e = n;
    for (j = k; j >= 1; j--) { var s = D[e][j], r = []; for (i = s; i < e; i++) r.push(i); rows.unshift(r); e = s; }
    return rows;
  }
  /* SPAN columns split by weight (largest remainder), each >= MINSPAN */
  function spansOf(ws, R) {
    var n = ws.length, tot = ws.reduce(function (a, b) { return a + b; }, 0), MINSPAN = Math.min(Math.floor(SPAN / n), Math.ceil((MINH + GAP) * SPAN / ((R || 330) + GAP))), room = SPAN - n * MINSPAN, out = [], rem = [], used = 0;
    ws.forEach(function (x, i) { var f = room * x / tot, b = Math.floor(f); out.push(MINSPAN + b); used += MINSPAN + b; rem.push([f - b, i]); });
    rem.sort(function (a, b) { return b[0] - a[0] || a[1] - b[1]; });
    for (var i = 0; used < SPAN; i++, used++) out[rem[i % n][1]]++;
    return out;
  }
  /* estimated px a tile needs at font fs: lines (wrapped text) x line height + padding */
  function need(len, tileW, fs) {
    var inner = Math.max(20, tileW - PADX - LEAD), cpl = Math.max(1, inner / (fs * 0.52)), lines = Math.max(1, Math.ceil(len * 1.1 / cpl));
    return Math.max(MINH, Math.ceil(lines * fs * 1.25 + PADY));
  }
  function tileWidth(span, R) { return span / SPAN * (R + GAP) - GAP; }
  /* the plan for one k */
  function planK(items, R, A, k) {
    var ws = items.map(function (t) { return weight(t.len); }), rows = partition(ws, k), spans = new Array(items.length), maxPer = Math.floor((R + GAP) / (44 + GAP));
    if (rows.some(function (r) { return r.length > maxPer; })) return null;                 // a tile narrower than a 44px tap target
    var n15 = [], n10 = [];
    rows.forEach(function (r) {
      var sp = spansOf(r.map(function (i) { return ws[i]; }), R), a = 0, b = 0;
      r.forEach(function (i, q) { spans[i] = sp[q]; var w = tileWidth(sp[q], R); a = Math.max(a, need(items[i].len, w, FS_MAX)); b = Math.max(b, need(items[i].len, w, FS_MIN)); });
      n15.push(a); n10.push(b);
    });
    var gaps = (rows.length - 1) * GAP, net = A - gaps, s15 = sum(n15), s10 = sum(n10), t = s15 <= s10 ? 1 : Math.max(0, Math.min(1, (net - s10) / (s15 - s10))), estFs = net >= s15 ? FS_MAX : FS_MIN + (FS_MAX - FS_MIN) * t;
    var estH = n15.map(function (h, i) { return net >= s15 ? h * net / s15 : n10[i] + t * (h - n10[i]); });
    var pen = 0, wsum = 0;
    rows.forEach(function (r, ri) { r.forEach(function (i) { pen += ws[i] * Math.abs(Math.log((tileWidth(spans[i], R) / estH[ri]) / ASPECT)); wsum += ws[i]; }); });
    var score = pen / wsum + 0.12 * (FS_MAX - estFs) + (net < s10 ? 3 + (s10 - net) / 60 : 0);
    return { k: rows.length, rows: rows, spans: spans, estH: estH, score: score, estFs: estFs };
  }
  function sum(a) { return a.reduce(function (x, y) { return x + y; }, 0); }
  function plan(items, R, A) {
    var n = items.length, best = null;
    for (var k = 1; k <= n; k++) { var p = planK(items, R, A, k); if (p && (!best || p.score < best.score - 1e-9)) best = p; }
    if (!best) best = planK(items, R, A, n) || { k: n, rows: items.map(function (_, i) { return [i]; }), spans: items.map(function () { return SPAN; }), estH: items.map(function () { return MINH; }), score: 99, estFs: FS_MIN };
    return best;
  }
  /* row heights: rows keep >= their need at 10px (need10) and take 15px (need15) when the room allows; the rest stretches proportionally (capped), so the block fills net.
     n15 / n10: measured px per row (DOM half), net = A - gaps. Returns [px per row] (sum = net unless every row hit the cap or the content needs more than net). */
  function heights(n15, n10, net, cap) {
    var s15 = sum(n15), s10 = sum(n10), cp = cap || 320, h;
    if (net <= s10) return n10.slice();
    if (net < s15) { var t = (net - s10) / (s15 - s10); return n15.map(function (v, i) { return n10[i] + t * (v - n10[i]); }); }
    h = n15.map(function (v) { return v * net / s15; });
    for (var it = 0; it < 4; it++) {                                                          // cap a row, hand its excess to the rest
      var over = 0, free = 0; h.forEach(function (v, i) { if (v > cp) { over += v - cp; h[i] = cp; } else free += v; });
      if (!over || !free) break;
      h = h.map(function (v) { return v >= cp ? v : v + over * v / free; });
    }
    return h;
  }
  root.stemBentoFill = { SPAN: SPAN, GAP: GAP, FS_MAX: FS_MAX, FS_MIN: FS_MIN, MINH: MINH, weight: weight, partition: partition, spansOf: spansOf, plan: plan, heights: heights, need: need };
})();
