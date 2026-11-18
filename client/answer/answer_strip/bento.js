/* bento.js (bento4 DOM half; the search is bento_cost.js, the features bento_feat.js): the MC and pick-all answers as a bento mosaic (Tony Nov 15: "more aggressive", mixed 1x1 / 2x1 / 1x2 / 2x2 tiles, no holes; brain ui-polish/bento3/RESEARCH.md).
   BEHIND html.ui-v7 (fx.js, ?ui=v7). Flag off = this file touches nothing. Flag on = for a choices group of 2..8 options (single choice and pick-all) it
   (1) probes every option at every column span (hidden copy, same CSS) -> wrapped height + overflow -> the shapes (cs x rs) that fit its content,
   (2) searches an exact cover of a C-column grid (C = 3..6 from the width; unit row 100px, gap 8): options are placed IN ORDER at the first empty cell
       (row-major), so reading order A,B,C.. holds without grid-auto-flow:dense; area = C*H exactly, so no holes; cost = few rows, little growth,
       many distinct shapes, mild aspect penalty; deterministic (content + width, ties by a hash of the option text),
   (3) writes grid-column / grid-row on each .ch and class .bento (+ --bc) on .choices (bento.css does the look).
   Content only: never reads the key, the picked state or a verdict. Pick-all with fix boxes (prove mode) keeps its list. Stacked full-width rows is the fallback.
   bento4: content-driven tile shapes (hero = most content, ~60% of tiles bigger than 1x1), seeded per question (#pcode + width), render guard (a clipped tile forbids its shape,
   one re-layout, then stacked), phone unit row 88, grid padding-bottom when a fixed Check bar exists.
   PHONE-FILL (<= 480px, bento_fill.js): MC / pick-all become JUSTIFIED ROWS that fill the whole answer area (viewport - the block's top - the Check row): linear partition by text weight,
   widths by weight (60 grid columns), row heights stretched to the room, per-tile font fit 15 -> 10px (measured once per layout, debounced on resize); no search, no probe, no guard.
   Reads the DOM only (like strip.js); re-runs when #q gets a new question, when the width changes, and when fonts arrive. */
(function () {
  "use strict";
  var D = document, H = D.documentElement;
  var GAP = 8, PADX = 16, SAFE = 2, MINW = 96;   // NEEDV: content height + 52 <= tile: two 24px lines fit one row; the Check arrow / Next may brush the text by a few px in the picked / verdict state
  var Feat = window.stemBentoFeat, Cost = window.stemBentoCost, Fill = window.stemBentoFill, key = "", probe = null, queued = false, cur = null, svhEl = null, mo = null, lateT = 0;
  if (!Feat || !Cost) return;
  var phone = function () { return !!Fill && (window.matchMedia ? matchMedia("(max-width: 480px)").matches : innerWidth <= 480); };
  function svh() {                                                // the SMALL viewport height (URL bar showing): stable while the bar collapses
    if (!svhEl) { svhEl = D.createElement("div"); svhEl.setAttribute("aria-hidden", "true"); svhEl.style.cssText = "position:fixed;left:0;top:0;width:0;height:100svh;visibility:hidden;pointer-events:none"; }
    if (!svhEl.isConnected) D.body.appendChild(svhEl);
    return svhEl.getBoundingClientRect().height || innerHeight;
  }
  var on = function () { return H.classList.contains("ui-v7"); };
  function colsFor(R, tiny) { var c = Math.max(3, Math.min(6, Math.floor((R + GAP) / (MINW + GAP)))); return tiny && R < 520 ? 4 : c; }   // phone: 4 columns when every option is a token
  function tileW(s, R, C) { return ((R - (C - 1) * GAP) / C) * s + (s - 1) * GAP; }

  /* kind of an option's look: p = only math (display size), s = short text (big), t = text / mixed / long (small, wraps) */
  function kindOf(t) {
    if (!t) return "s";
    var c = t.cloneNode(true); c.querySelectorAll(".katex, .mx, .kx-scroll").forEach(function (k) { k.remove(); });
    var rest = c.textContent.trim();
    if (!rest) return "p";
    return t.textContent.trim().length <= 14 ? "s" : "t";
  }
  function restLen(t) { if (!t) return 0; var c = t.cloneNode(true); c.querySelectorAll(".katex, .mx, .kx-scroll").forEach(function (k) { k.remove(); }); return c.textContent.trim().length; }
  /* probe: for every option and every span 1..C one hidden copy at the tile's inner width -> {h, over} */
  function measure(chs, R, C) {
    var g = Feat.geom(R, C);
    if (!probe) { probe = D.createElement("div"); probe.className = "mc-probe"; probe.setAttribute("aria-hidden", "true"); }
    if (!probe.isConnected) D.body.appendChild(probe);
    var html = "", kinds = [];
    chs.forEach(function (c) {
      var t = c.querySelector(".opt .txt"), k = kindOf(t); kinds.push(k);
      for (var s = 1; s <= C; s++) html += '<div class="opt" data-k="' + k + '" style="width:' + Math.max(20, g.tileW(s) - 2 * PADX - SAFE) + 'px"><span class="txt">' + (t ? t.innerHTML : "") + "</span></div>";
    });
    probe.innerHTML = html;
    probe.querySelectorAll(".katex").forEach(function (k) { k.style.fontSize = ""; });   // app.js fitMath may have shrunk it: measure the natural size
    var kids = probe.children;
    return chs.map(function (c, i) {
      var row = [];
      for (var s = 1; s <= C; s++) { var b = kids[i * C + s - 1], t = b.firstChild; row.push({ h: t.getBoundingClientRect().height, over: t.scrollWidth > b.clientWidth + 0.5 }); }
      var rl = restLen(c.querySelector(".opt .txt")), mw = 0;
      [].forEach.call(kids[i * C + C - 1].querySelectorAll(".katex"), function (k) { mw += k.getBoundingClientRect().width; });
      return { kind: kinds[i], by: row, text: (c.querySelector(".txt") || {}).textContent || "", mathOnly: !rl && mw > 0, mathW: mw, chars: rl + Math.round(mw / 9) };
    });
  }
  function clear(g) {
    g.classList.remove("bento");
    g.style.removeProperty("--bc");
    [].forEach.call(g.children, function (c) { c.style.gridColumn = c.style.gridRow = ""; var o = c.querySelector(".opt"); if (o) { o.removeAttribute("data-k"); o.removeAttribute("data-brk"); } });
    g.style.removeProperty("--bu"); g.style.removeProperty("--bar-pad"); g.removeAttribute("data-bento"); g.removeAttribute("data-fb");
    if (g.dataset.fill) {
      if (mo) mo.disconnect();
      g.classList.remove("fill"); g.removeAttribute("data-fill"); g.style.gridTemplateRows = "";
      [].forEach.call(g.querySelectorAll(".opt"), function (o) { o.style.removeProperty("--fs"); });
    }
  }
  /* ---- PHONE-FILL: justified rows ---- */
  function lenOf(c) {
    var t = c.querySelector(".opt .txt"), w = 0;
    if (t) [].forEach.call(t.querySelectorAll(".katex"), function (k) { k.style.fontSize = ""; w += k.getBoundingClientRect().width; });
    return restLen(t) + Math.round(w / 8) + 2;
  }
  function rowH(u, rows) { return rows.map(function (r) { return Math.max.apply(null, r.map(function (i) { return u.chs[i].getBoundingClientRect().height; })); }); }
  function over(o) {
    var t = o.querySelector(".txt"), r = o.getBoundingClientRect(), tr = t.getBoundingClientRect();
    return tr.height > r.height - 11.5 || t.scrollWidth > t.clientWidth + 1 || o.scrollWidth > o.clientWidth + 1;
  }
  /* fitty-style: every tile 15px, those that overflow step down by .5 to 10px; all reads, then all writes, <= 11 passes (once per layout / state change) */
  function fitAll(u) {
    var os = u.chs.map(function (c) { return c.querySelector(".opt"); }), fs = os.map(function () { return Fill.FS_MAX; }), live = os.map(function () { return true; });
    os.forEach(function (o) { o.style.setProperty("--fs", Fill.FS_MAX + "px"); o.removeAttribute("data-brk"); });
    for (var pass = 0; pass < 12; pass++) {
      var bad = []; os.forEach(function (o, i) { if (live[i] && over(o)) bad.push(i); });
      if (!bad.length) break;
      bad.forEach(function (i) {
        if (fs[i] <= Fill.FS_MIN) { live[i] = false; os[i].setAttribute("data-brk", "1"); } else { fs[i] = Math.max(Fill.FS_MIN, fs[i] - 0.5); os[i].style.setProperty("--fs", fs[i] + "px"); }
      });
    }
  }
  function fillLayout(g, chs, R, A) {
    if (mo) mo.disconnect();
    clear(g);
    var u = { g: g, chs: chs, R: R, fill: true }, P = Fill.plan(chs.map(function (c) { return { len: lenOf(c) }; }), R, A), col = 0, row = 0;
    cur = u; u.rows = P.rows;
    g.classList.add("bento", "fill"); g.dataset.bento = "grid"; g.dataset.fill = P.k; g.style.gridTemplateRows = "";
    P.rows.forEach(function (r, ri) { col = 1; r.forEach(function (i) { var el = chs[i]; el.style.gridColumn = col + " / span " + P.spans[i]; el.style.gridRow = (ri + 1) + " / span 1"; col += P.spans[i]; }); });
    chs.forEach(function (c) { c.querySelector(".opt").style.setProperty("--fs", Fill.FS_MAX + "px"); });
    var n15 = rowH(u, P.rows);
    chs.forEach(function (c) { c.querySelector(".opt").style.setProperty("--fs", Fill.FS_MIN + "px"); });
    var n10 = rowH(u, P.rows), net = A - (P.k - 1) * Fill.GAP, hs = Fill.heights(n15, n10, net, 320);
    g.style.gridTemplateRows = hs.map(function (h) { return h.toFixed(2) + "px"; }).join(" ");
    fitAll(u);
    u.hs = hs; u.A = A;
    if (window.MutationObserver) { mo = mo || new MutationObserver(function () { if (cur && cur.fill && cur.g.isConnected) requestAnimationFrame(function () { fitAll(cur); }); }); mo.observe(g, { attributes: true, subtree: true, attributeFilter: ["class", "hidden", "aria-checked"] }); }
  }
  function apply() {
    queued = false;
    var g = D.querySelector("#q .choices");
    if (!g) { key = ""; return; }
    var chs = [].filter.call(g.children, function (c) { return c.classList.contains("ch"); });
    if (!on() || chs.length < 2 || chs.length > 8 || g.querySelector(".fix")) { if (g.dataset.bento) clear(g); key = ""; return; }   // pick-all + fix boxes (prove mode): the list stays
    var R = Math.round(g.getBoundingClientRect().width);
    if (g.dataset.fill) R -= 6;                                    // the fill grid is 6px wider than its column (-3px margins)
    if (R < 200) return;                                           // laid out hidden (Swap, search mode): keep the last answer
    var fill = phone(), A = 0;
    if (fill) {
      var bar = D.querySelector("#q .chk"), bb = bar && bar.querySelector(".send"), top = g.getBoundingClientRect().top + (window.pageYOffset || 0);
      A = Math.floor(svh() - top - (bar ? ((bb && bb.offsetHeight) || 48) + 10 : 0) - 8);
      A = Math.max(A, Math.round(svh() * 0.35));                  // FILL-FLOOR (Tony Nov 16): a long card puts the grid below the first screen (A <= 0 -> 1px rows, 10px text); fill a third of a screen instead
    }
    var k = (fill ? "F" + Math.round(A / 8) + "|" : "") + R + "|" + chs.map(function (c) { return c.dataset.id + (c.querySelector(".txt") || {}).innerHTML; }).join("|");
    if (k === key && g.dataset.bento) return;
    key = k;
    if (fill) { fillLayout(g, chs, R, Math.max(A, 1)); return; }
    if (g.dataset.fill) clear(g);
    var tiny = R < 520 && chs.every(function (c) { var t = c.querySelector(".opt .txt"), w = 0; if (t) [].forEach.call(t.querySelectorAll(".katex"), function (k) { w += k.getBoundingClientRect().width; }); return restLen(t) <= 8 && w <= 44; }), C = colsFor(R, tiny), qid = (D.getElementById("pcode") || {}).textContent || "";
    cur = { g: g, chs: chs, ms: measure(chs, R, C), R: R, C: C, seed: qid + "|" + R + "|" + chs.map(function (c) { return (c.querySelector(".txt") || {}).textContent; }).join("|"), forbid: {}, tries: 0, stacked: false };
    place();
  }
  /* write the placement; the guard (next frame) forbids a shape whose text is clipped and lays out once more, the 2nd failure = stacked rows */
  function place() {
    var u = cur, g = u.g, cells = Cost.layout(u.ms, u.R, u.C, { seed: u.seed, forbid: u.forbid, stacked: u.stacked });
    g.style.setProperty("--bc", u.C); g.style.setProperty("--bu", Feat.geom(u.R, u.C).unit + "px");
    /* SAME-BOX-SAME-TYPE (Tony Nov 18): tiles of one box size share ONE text look (size + weight): the smallest look in that size group (t < s < p), so it still fits.
       Before: two equal boxes, "Bad base case" = s (22px / 600) and "Bad inductive step" = t (18px / 500). Boxes of different sizes keep their own look. */
    var RANK = { t: 0, s: 1, p: 2 }, low = {};
    cells.forEach(function (c) { var z = c.cs + "x" + c.rs; if (!(z in low) || RANK[c.kind] < RANK[low[z]]) low[z] = c.kind; });
    cells.forEach(function (c) {
      var el = u.chs[c.i], o = el.querySelector(".opt");
      el.style.gridColumn = c.col + " / span " + c.cs; el.style.gridRow = c.row + " / span " + c.rs;
      o.dataset.k = low[c.cs + "x" + c.rs]; if (c.brk) o.dataset.brk = "1"; else o.removeAttribute("data-brk");
    });
    u.cells = cells; g.classList.add("bento"); g.dataset.bento = "grid"; if (cells.info && cells.info.fallback) g.dataset.fb = "1"; else g.removeAttribute("data-fb");
    var bar = D.querySelector("#q .chk"), cs = bar && getComputedStyle(bar);
    g.style.setProperty("--bar-pad", cs && (cs.position === "fixed" || cs.position === "sticky") ? bar.offsetHeight + 12 + "px" : "0px");
    requestAnimationFrame(guard);
  }
  function clipped(el) {
    var o = el.querySelector(".opt"), t = o && o.querySelector(".txt"); if (!t) return false;
    var r = o.getBoundingClientRect(), tr = t.getBoundingClientRect();
    return o.scrollHeight > o.clientHeight + 1 || o.scrollWidth > o.clientWidth + 1 || t.scrollWidth > t.clientWidth + 1 ||
      tr.bottom > r.bottom - 3.5 || tr.top < r.top + 3.5 || tr.right > r.right - 3.5 || tr.left < r.left + 3.5;
  }
  function guard() {
    var u = cur; if (!u || u.fill || !u.g.isConnected || u.g.dataset.bento !== "grid" || u.g.getBoundingClientRect().width < 200) return;
    var bad = u.cells.filter(function (c) { return clipped(u.chs[c.i]); });
    if (!bad.length) return;
    if (++u.tries >= 2) u.stacked = true;
    else bad.forEach(function (c) { (u.forbid[c.i] = u.forbid[c.i] || {})[c.cs + "x" + c.rs] = 1; });
    place();
  }
  function soon() { if (!queued) { queued = true; requestAnimationFrame(apply); } }
  function late() { var g = D.querySelector("#q .choices"); if (g && g.dataset.fill) { clearTimeout(lateT); lateT = setTimeout(soon, 140); } else soon(); }   // resize: debounce the fill re-layout
  window.stemBento = { layout: Cost.layout, phone: phone, colsFor: colsFor, guard: guard };

  var q = D.getElementById("q");
  if (!q) return;
  new MutationObserver(soon).observe(q, { childList: true });
  if (window.ResizeObserver) new ResizeObserver(late).observe(q);
  addEventListener("resize", late);
  D.addEventListener("drill:problem", soon);
  if (D.fonts && D.fonts.ready) D.fonts.ready.then(function () { key = ""; soon(); });
  soon();
})();
