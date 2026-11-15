/* bento.js: the MC answers as a bento2 mosaic (PROTO-3WAY pick F, port "f-port-mc"; brain ui-polish/hintbox/v71/bento2/bento2.js, SPEC R3).
   BEHIND html.ui-v7 (fx.js, ?ui=v7). Flag off = this file touches nothing. Flag on = for a single-choice mc (2..5 options, not pick-all) it measures each
   option's one-line value, picks the cheapest letter-order mosaic on a 12-column grid and writes grid-column / grid-row on each .ch, plus class .bento on .choices
   (bento.css does the look). Content only: it never reads the key, the picked state or a verdict. A fraction (2 units tall) stands left over two half-rows.
   No layout fits one line (a sentence option) -> class and styles come off and today's stacked list stays (still state-by-fill via bento.css's list rules).
   Reads the DOM only (like strip.js); re-runs when #q gets a new question, when the width changes, and when fonts arrive. */
(function () {
  "use strict";
  var D = document, H = D.documentElement;
  var COLS = 12, UNIT = 96, GAP = 8, PADX = 20, PADT = 28, PADB = 20, SAFE = 3, LINE = 28;
  var ROWP = { 1: [[12]], 2: [[6, 6], [8, 4], [4, 8]], 3: [[4, 4, 4]] };   // spans >= 4 cols: Next (88px) must fit a tile even on a phone, so no 4-up row and no 3-col tile
  var RIGHT = { 8: [[8], [4, 4]], 6: [[6]], 4: [[4]] };                      // what may stand beside a 2-unit tile of 4 / 6 / 8 columns
  var key = "", probe = null, queued = false;
  var on = function () { return H.classList.contains("ui-v7"); };
  var tileW = function (s, R) { return ((R - (COLS - 1) * GAP) / COLS) * s + (s - 1) * GAP; };
  var unitsH = function (u) { return u * UNIT + (u - 1) * GAP; };

  /* a "pure" option is only math (display size, regular weight); text or mixed gets the bolder 22px look */
  function pure(t) {
    if (!t) return false;
    var c = t.cloneNode(true); c.querySelectorAll(".katex, .mx, .kx-scroll").forEach(function (k) { k.remove(); });
    return !c.textContent.trim();
  }
  function measure(chs) {
    if (!probe) { probe = D.createElement("div"); probe.className = "mc-probe"; probe.setAttribute("aria-hidden", "true"); }
    if (!probe.isConnected) D.body.appendChild(probe);
    probe.innerHTML = chs.map(function (c) {
      var t = c.querySelector(".opt .txt");
      return '<button class="opt" data-pure="' + (pure(t) ? 1 : 0) + '"><span class="txt">' + (t ? t.innerHTML : "") + "</span></button>";
    }).join("");
    probe.querySelectorAll(".katex").forEach(function (k) { k.style.fontSize = ""; });   // app.js fitMath may have shrunk it: measure the natural size
    return [].map.call(probe.children, function (b) { var r = b.querySelector(".txt").getBoundingClientRect(); return { w: r.width, h: r.height }; });
  }

  /* pure: boxes [{w,h}] in letter order + row width R -> [{i,col,cs,row,rs}] or null (no one-line fit) */
  function layout(boxes, R) {
    var n = boxes.length, memo = {}, best = null;
    function fit(i, s) {
      var k = i * 100 + s; if (k in memo) return memo[k];
      var r = null, W = tileW(s, R) - 2 * PADX - SAFE, b = boxes[i];
      if (b.w <= W) { var h = Math.max(LINE, b.h); for (var u = 1; u <= 3; u++) if (h + PADT + PADB + 2 <= unitsH(u)) { r = { u: u }; break; } }
      return (memo[k] = r);
    }
    function score(items) {
      var Ht = 0, shapes = {}, waste = 0, uneven = 0, orphan = 0, ns = 0;
      items.forEach(function (it, ix) {
        Ht += it.U;
        if (it.t === "mos") { shapes[it.tall.s + "x2"] = 1; it.top.concat(it.bot).forEach(function (x) { shapes[x.s + "x1"] = 1; }); }
        else it.tiles.forEach(function (x) { shapes[x.s + "x" + it.U] = 1; waste += it.U - x.f.u; uneven += Math.abs(x.s - 12 / it.tiles.length); });
        if (it.t === "row" && it.tiles.length === 1 && items.some(function (o) { return o.t === "mos" || o.tiles.length >= 2; })) orphan += (n === 3 ? 10 : 70) + 0.5 * (items.length - 1 - ix);
      });
      for (var s in shapes) ns++;
      return 100 * Ht + 25 * (ns - 1) + orphan + 8 * waste + 3 * uneven;
    }
    function rec(start, items) {
      if (start === n) { var c = score(items); if (!best || c < best.cost) best = { cost: c, items: items }; return; }
      for (var k = 1; k <= Math.min(3, n - start); k++) ROWP[k].forEach(function (pat) {
        var tiles = [], ok = true;
        for (var j = 0; j < k && ok; j++) { var f = fit(start + j, pat[j]); if (!f) ok = false; else tiles.push({ i: start + j, s: pat[j], f: f }); }
        if (ok) rec(start + k, items.concat([{ t: "row", tiles: tiles, U: Math.max.apply(null, tiles.map(function (x) { return x.f.u; })) }]));
      });
      [4, 6, 8].forEach(function (L) {
        var f = fit(start, L); if (!f || f.u !== 2) return; var rem = n - start - 1;
        for (var kt = 1; kt <= 2; kt++) for (var kb = 1; kb <= 2; kb++) {
          if (kt + kb > rem) continue;
          RIGHT[12 - L].forEach(function (pt) { if (pt.length !== kt) return; RIGHT[12 - L].forEach(function (pb) { if (pb.length !== kb) return;
            var mk = function (pat, off) { return pat.map(function (s, j) { var f1 = fit(start + 1 + off + j, s); return f1 && f1.u === 1 ? { i: start + 1 + off + j, s: s, f: f1 } : null; }); };
            var top = mk(pt, 0), bot = mk(pb, kt);
            if (top.some(function (x) { return !x; }) || bot.some(function (x) { return !x; })) return;
            rec(start + 1 + kt + kb, items.concat([{ t: "mos", U: 2, tall: { i: start, s: L, f: f }, top: top, bot: bot }]));
          }); });
        }
      });
    }
    rec(0, []);
    if (!best) return null;
    var cells = [], row = 1;
    best.items.forEach(function (it) {
      if (it.t === "row") { var c = 1; it.tiles.forEach(function (x) { cells.push({ i: x.i, col: c, cs: x.s, row: row, rs: it.U }); c += x.s; }); row += it.U; }
      else {
        cells.push({ i: it.tall.i, col: 1, cs: it.tall.s, row: row, rs: 2 });
        [[row, it.top], [row + 1, it.bot]].forEach(function (p) { var c = 1 + it.tall.s; p[1].forEach(function (x) { cells.push({ i: x.i, col: c, cs: x.s, row: p[0], rs: 1 }); c += x.s; }); });
        row += 2;
      }
    });
    cells.sort(function (a, b) { return a.i - b.i; });
    return cells;
  }

  function clear(g) {
    g.classList.remove("bento");
    [].forEach.call(g.children, function (c) { c.style.gridColumn = c.style.gridRow = ""; var o = c.querySelector(".opt"); if (o) o.removeAttribute("data-pure"); });
    g.removeAttribute("data-bento");
  }
  function apply() {
    queued = false;
    var g = D.querySelector("#q .choices");
    if (!g) { key = ""; return; }
    var chs = [].filter.call(g.children, function (c) { return c.classList.contains("ch"); });
    if (!on() || g.classList.contains("all") || chs.length < 2 || chs.length > 5) { if (g.dataset.bento) clear(g); key = ""; return; }
    var R = Math.round(g.getBoundingClientRect().width);
    if (R < 200) return;                                           // laid out hidden (Swap, search mode): keep the last answer
    var k = R + "|" + chs.map(function (c) { return c.dataset.id + (c.querySelector(".txt") || {}).innerHTML; }).join("|");
    if (k === key && g.dataset.bento) return;
    key = k;
    var cells = layout(measure(chs), R);
    if (!cells) { clear(g); g.dataset.bento = "list"; return; }    // a sentence option: the stacked list stays
    cells.forEach(function (c) { var el = chs[c.i]; el.style.gridColumn = c.col + " / span " + c.cs; el.style.gridRow = c.row + " / span " + c.rs; el.querySelector(".opt").dataset.pure = pure(el.querySelector(".txt")) ? 1 : 0; });
    g.classList.add("bento"); g.dataset.bento = "grid";
  }
  function soon() { if (!queued) { queued = true; requestAnimationFrame(apply); } }

  var q = D.getElementById("q");
  if (!q) return;
  new MutationObserver(soon).observe(q, { childList: true });
  if (window.ResizeObserver) new ResizeObserver(soon).observe(q);
  addEventListener("resize", soon);
  D.addEventListener("drill:problem", soon);
  if (D.fonts && D.fonts.ready) D.fonts.ready.then(function () { key = ""; soon(); });
  soon();
})();
