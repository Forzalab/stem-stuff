/* bento.js: the MC and pick-all answers as a bento3 mosaic (Tony Nov 15: "more aggressive", mixed 1x1 / 2x1 / 1x2 / 2x2 tiles, no holes; brain ui-polish/bento3/RESEARCH.md).
   BEHIND html.ui-v7 (fx.js, ?ui=v7). Flag off = this file touches nothing. Flag on = for a choices group of 2..8 options (single choice and pick-all) it
   (1) probes every option at every column span (hidden copy, same CSS) -> wrapped height + overflow -> the shapes (cs x rs) that fit its content,
   (2) searches an exact cover of a C-column grid (C = 3..6 from the width; unit row 100px, gap 8): options are placed IN ORDER at the first empty cell
       (row-major), so reading order A,B,C.. holds without grid-auto-flow:dense; area = C*H exactly, so no holes; cost = few rows, little growth,
       many distinct shapes, mild aspect penalty; deterministic (content + width, ties by a hash of the option text),
   (3) writes grid-column / grid-row on each .ch and class .bento (+ --bc) on .choices (bento.css does the look).
   Content only: never reads the key, the picked state or a verdict. Pick-all with fix boxes (prove mode) keeps its list. Stacked full-width rows is the fallback.
   Reads the DOM only (like strip.js); re-runs when #q gets a new question, when the width changes, and when fonts arrive. */
(function () {
  "use strict";
  var D = document, H = D.documentElement;
  var UNIT = 100, GAP = 8, PADX = 16, NEEDV = 52, SAFE = 2, RMAX = 6, MINW = 96, NODES = 60000;   // NEEDV: content height + 52 <= tile: two 24px lines fit one row; the Check arrow / Next may brush the text by a few px in the picked / verdict state
  var key = "", probe = null, queued = false;
  var on = function () { return H.classList.contains("ui-v7"); };
  var unitsH = function (u) { return u * UNIT + (u - 1) * GAP; };
  function colsFor(R) { return Math.max(3, Math.min(6, Math.floor((R + GAP) / (MINW + GAP)))); }
  function tileW(s, R, C) { return ((R - (C - 1) * GAP) / C) * s + (s - 1) * GAP; }
  function hash(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) % 1000 / 1000; }

  /* kind of an option's look: p = only math (display size), s = short text (big), t = text / mixed / long (small, wraps) */
  function kindOf(t) {
    if (!t) return "s";
    var c = t.cloneNode(true); c.querySelectorAll(".katex, .mx, .kx-scroll").forEach(function (k) { k.remove(); });
    var rest = c.textContent.trim();
    if (!rest) return "p";
    return t.textContent.trim().length <= 14 ? "s" : "t";
  }
  /* probe: for every option and every span 1..C one hidden copy at the tile's inner width -> {h, over} */
  function measure(chs, R, C) {
    if (!probe) { probe = D.createElement("div"); probe.className = "mc-probe"; probe.setAttribute("aria-hidden", "true"); }
    if (!probe.isConnected) D.body.appendChild(probe);
    var html = "", kinds = [];
    chs.forEach(function (c) {
      var t = c.querySelector(".opt .txt"), k = kindOf(t); kinds.push(k);
      for (var s = 1; s <= C; s++) html += '<div class="opt" data-k="' + k + '" style="width:' + Math.max(20, tileW(s, R, C) - 2 * PADX - SAFE) + 'px"><span class="txt">' + (t ? t.innerHTML : "") + "</span></div>";
    });
    probe.innerHTML = html;
    probe.querySelectorAll(".katex").forEach(function (k) { k.style.fontSize = ""; });   // app.js fitMath may have shrunk it: measure the natural size
    var kids = probe.children;
    return chs.map(function (c, i) {
      var row = [];
      for (var s = 1; s <= C; s++) { var b = kids[i * C + s - 1], t = b.firstChild; row.push({ h: t.getBoundingClientRect().height, over: t.scrollWidth > b.clientWidth + 0.5 }); }
      return { kind: kinds[i], by: row, text: (c.querySelector(".txt") || {}).textContent || "" };
    });
  }
  /* pure: measured options [{kind,text,by:[{h,over}]}] + R + C -> [{i,col,cs,row,rs}] in option order, no holes */
  function layout(ms, R, C) {
    var n = ms.length, cand = [], minCells = [];
    ms.forEach(function (m, i) {
      var list = [], best = 1e9;
      for (var s = 1; s <= C; s++) {
        var b = m.by[s - 1]; if (b.over && s < C) continue;
        var r0 = 0; for (var r = 1; r <= RMAX; r++) if (b.h + NEEDV <= unitsH(r)) { r0 = r; break; }
        if (!r0) { if (s < C) continue; r0 = RMAX; }
        best = Math.min(best, s * r0);
        for (var g = 0; g <= 2 && r0 + g <= RMAX + 2; g++) list.push({ cs: s, rs: r0 + g, grow: g, brk: !!b.over });
      }
      cand.push(list); minCells.push(best);
    });
    var tailMin = [0]; for (var i = n - 1; i >= 0; i--) tailMin[n - i] = tailMin[n - i - 1] + minCells[i];
    var tailMax = [0]; for (i = n - 1; i >= 0; i--) tailMax[n - i] = tailMax[n - i - 1] + Math.max.apply(null, cand[i].map(function (x) { return x.cs * x.rs; }));
    function cost(sel, Hh) {
      var c = 25 * Hh, shapes = {}, ns = 0;
      sel.forEach(function (x, ix) {
        var cells = x.cs * x.rs; c += 5 * (cells - minCells[ix]);
        shapes[x.cs + "x" + x.rs] = 1;
        var ar = tileW(x.cs, R, C) / unitsH(x.rs); c += 4 * Math.abs(Math.log(ar));
        if (x.cs === 1 && ms[ix].kind === "t") c += 6 + 2 * Math.max(0, Math.round(ms[ix].by[0].h / 24) - 3);   // a 1-col text tile: narrow, hard to read when it wraps a lot
        c += hash(ms[ix].text + x.cs + "x" + x.rs);
      });
      for (var k in shapes) ns++;
      if (n >= 3) c -= 14 * Math.min(ns, 4);
      return c;
    }
    var best = null, nodes = 0;
    var Hmin = Math.max(1, Math.ceil(tailMin[n] / C));
    for (var Hh = Hmin; Hh <= Hmin + 3; Hh++) {
      var occ = new Uint8Array(C * Hh), sel = [], pos = [];
      (function rec(i, free, from) {
        if (nodes > NODES) return;
        if (i === n) { if (free === 0) { var cc = cost(sel, Hh); if (!best || cc < best.cost) best = { cost: cc, sel: sel.slice(), pos: pos.slice() }; } return; }
        if (free < tailMin[n - i] || free > tailMax[n - i]) return;
        var p = from; while (p < occ.length && occ[p]) p++;
        if (p >= occ.length) return;
        var r = Math.floor(p / C), c0 = p % C;
        cand[i].forEach(function (x) {
          if (c0 + x.cs > C || r + x.rs > Hh) return;
          for (var dy = 0; dy < x.rs; dy++) for (var dx = 0; dx < x.cs; dx++) if (occ[(r + dy) * C + c0 + dx]) return;
          nodes++;
          for (dy = 0; dy < x.rs; dy++) for (dx = 0; dx < x.cs; dx++) occ[(r + dy) * C + c0 + dx] = 1;
          sel.push(x); pos.push({ row: r + 1, col: c0 + 1 });
          rec(i + 1, free - x.cs * x.rs, p + x.cs);
          sel.pop(); pos.pop();
          for (dy = 0; dy < x.rs; dy++) for (dx = 0; dx < x.cs; dx++) occ[(r + dy) * C + c0 + dx] = 0;
        });
      })(0, C * Hh, 0);
    }
    if (!best) {                                   // always valid: stacked full-width rows
      var row = 1; best = { sel: [], pos: [] };
      cand.forEach(function (l) { var x = l.filter(function (y) { return y.cs === C; })[0] || l[l.length - 1]; best.sel.push({ cs: C, rs: x.rs, brk: true }); best.pos.push({ row: row, col: 1 }); row += x.rs; });
    }
    return best.sel.map(function (x, i) { return { i: i, col: best.pos[i].col, cs: x.cs, row: best.pos[i].row, rs: x.rs, brk: !!x.brk, kind: ms[i].kind }; });
  }

  function clear(g) {
    g.classList.remove("bento");
    g.style.removeProperty("--bc");
    [].forEach.call(g.children, function (c) { c.style.gridColumn = c.style.gridRow = ""; var o = c.querySelector(".opt"); if (o) { o.removeAttribute("data-k"); o.removeAttribute("data-brk"); } });
    g.removeAttribute("data-bento");
  }
  function apply() {
    queued = false;
    var g = D.querySelector("#q .choices");
    if (!g) { key = ""; return; }
    var chs = [].filter.call(g.children, function (c) { return c.classList.contains("ch"); });
    if (!on() || chs.length < 2 || chs.length > 8 || g.querySelector(".fix")) { if (g.dataset.bento) clear(g); key = ""; return; }   // pick-all + fix boxes (prove mode): the list stays
    var R = Math.round(g.getBoundingClientRect().width);
    if (R < 200) return;                                           // laid out hidden (Swap, search mode): keep the last answer
    var k = R + "|" + chs.map(function (c) { return c.dataset.id + (c.querySelector(".txt") || {}).innerHTML; }).join("|");
    if (k === key && g.dataset.bento) return;
    key = k;
    var C = colsFor(R), cells = layout(measure(chs, R, C), R, C);
    g.style.setProperty("--bc", C);
    cells.forEach(function (c) {
      var el = chs[c.i], o = el.querySelector(".opt");
      el.style.gridColumn = c.col + " / span " + c.cs; el.style.gridRow = c.row + " / span " + c.rs;
      o.dataset.k = c.kind; if (c.brk) o.dataset.brk = "1"; else o.removeAttribute("data-brk");
    });
    g.classList.add("bento"); g.dataset.bento = "grid";
  }
  function soon() { if (!queued) { queued = true; requestAnimationFrame(apply); } }
  window.stemBento = { layout: layout, colsFor: colsFor };

  var q = D.getElementById("q");
  if (!q) return;
  new MutationObserver(soon).observe(q, { childList: true });
  if (window.ResizeObserver) new ResizeObserver(soon).observe(q);
  addEventListener("resize", soon);
  D.addEventListener("drill:problem", soon);
  if (D.fonts && D.fonts.ready) D.fonts.ready.then(function () { key = ""; soon(); });
  soon();
})();
