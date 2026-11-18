/* bento_cost.js: bento4 PR2. Pure (no DOM): the search. Ordered exact cover (options placed IN ORDER at the first empty cell, row-major: reading order A,B,C.. and no holes by
   construction) over the shapes from bento_feat.js, scored by a content cost + a variety cost; it keeps the K best full solutions and picks one with a SEEDED softmax (same question
   + same column count = same layout, no Math.random; the px width is NOT in the seed: a drag must not re-roll the pick). Weights = W below (brain ui-polish/bento4/PLAN.md sec 3, Tony's Nov 15 answers on top):
     per tile  F1 pref x10 | F2 |ln(area / content-share area)| x6 | F3 grow x3 per extra row | F4 1-col wrapping text +12 | F5 uncramp +40 per text line over the full-row wrap | hero not the max-content option +6 | V7 aspect +5 | V8 jitter x2
     per set   V1 50 x rows | V2 -9 x distinct shapes (<= min(N,5)) | V3 no hero with N>=5 +25 | V4 3rd+ equal run +8 | V5 equal neighbours +4 | V6 3+ 1x1 in a row +10
   Heroes (>= 2x2, not a full row, and not forced by content): max 1 when N <= 6, max 2 when N >= 7 at C = 6. Rows start at ceil(N x A0 / C) so the average tile is ~A0 cells (AMBITION). */
(function () {
  "use strict";
  var root = typeof window !== "undefined" ? window : globalThis, Feat = root.stemBentoFeat;
  var W = { f1: 10, f2: 6, f3: 3, f4: 12, f5: 40, hero: 6, v1: 50, v2: 9, v3: 25, v4: 8, v5: 4, v6: 10, v7: 5, v8: 2, T: 4, K: 8, A0: 1.0, NODES: 9000, MS: 40 };
  var now = function () { return typeof performance !== "undefined" ? performance.now() : Date.now(); };
  function hashI(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  function stacked(F, ms, C) {
    var row = 1, out = [];
    F.forEach(function (f, i) { var rs = f.minRows[C - 1] || Feat.RMAX; out.push({ i: i, col: 1, cs: C, row: row, rs: rs, brk: true, kind: ms[i].kind }); row += rs; });
    return out;
  }

  /* ms: [{kind, chars, mathOnly, mathW, by:[{h,over}]}], R grid width px, C columns, o: {seed, forbid:[{"2x1":1}], stacked, W:{overrides}} -> [{i,col,cs,row,rs,brk,kind}] (+ .info) */
  function layout(ms, R, C, o) {
    o = o || {}; var w = W, n = ms.length, g = Feat.geom(R, C), t0 = now();
    if (o.W) { w = {}; for (var k in W) w[k] = W[k]; for (k in o.W) w[k] = o.W[k]; }
    var F = Feat.classifyAll(ms, g), info = { fallback: false, relaxed: false, nodes: 0, ms: 0, heroes: 0, sols: 0 };
    var done = function (res) { res.info = info; info.ms = now() - t0; return res; };
    if (o.stacked) { info.fallback = true; return done(stacked(F, ms, C)); }
    var seedS = (o.seed == null ? "" : o.seed) + "|" + C + "|" + n, rng = mulberry32(hashI(seedS));
    var sumMin = 0, wsum = 0, wmax = 0;
    F.forEach(function (f) { sumMin += f.minCells; wsum += f.w; wmax = Math.max(wmax, f.w); });
    var cap = n >= 7 && C >= 6 ? 2 : 1, Hmin = Math.ceil(sumMin / C), Hlo = Math.max(Hmin, Math.ceil(n * w.A0 / C), n <= 4 ? 2 : 1);
    var cands = F.map(function (f, i) { return Feat.candidates(f, g, o.forbid && o.forbid[i]); });
    /* per-tile cost that does not depend on the row count */
    var stat = cands.map(function (list, i) {
      var f = F[i];
      return list.map(function (x) {
        var c = x.pref * w.f1 + x.grow * w.f3, ar = g.tileW(x.cs) / g.unitsH(x.rs);
        if (g.phone && x.cs === 1 && !f.mathOnly && f.cls !== "TOKEN" && f.lines[0] >= 3) c += w.f4;
        /* F5 UNCRAMP (Tony Nov 18: "if text can be relatively UNcramped, do so"): every text line a shape adds over the full-row wrap costs f5, at every width.
           Before: 2 options, "Bad base case" in a 1-column tile on 3 lines beside a wide, near-empty "Bad inductive step" */
        if (!f.mathOnly) c += w.f5 * Math.max(0, f.lines[x.cs - 1] - f.lines[C - 1]);
        if ((ar > 3.3 || ar < 1 / 2.6) && !(x.cs === C && (f.cls === "LONG" || f.cls === "WIDE"))) c += w.v7;
        var hero = x.cs >= 2 && x.rs >= 2 && x.cs < C, forced = f.minCells >= 4;
        if (hero && !forced) c += (f.top ? 0 : w.hero) + (f.eligible ? 0 : w.hero * .5);
        c += w.v8 * (hashI(seedS + "|" + i + "|" + x.key) % 1000) / 1000;
        return { x: x, c: c, hero: hero, capHero: hero && !forced, big: hero };
      });
    });
    var K = [], nodes = 0, stop = false, Hs = [];
    function search(heroCap, Hh) {
      var list = stat.map(function (l, i) {
        var a = Math.max(.02, F[i].w / wsum) * C * Hh;
        return l.map(function (t) { var cc = t.c + w.f2 * Math.abs(Math.log(t.x.cs * t.x.rs / a)); return { x: t.x, c: cc, hero: t.hero, capHero: t.capHero }; })
          .sort(function (p, q) { return p.c - q.c || (p.x.key < q.x.key ? -1 : 1); });
      });
      var restMin = new Array(n + 1), tailMin = new Array(n + 1), tailMax = new Array(n + 1); restMin[n] = tailMin[n] = tailMax[n] = 0;
      for (var i = n - 1; i >= 0; i--) {
        restMin[i] = restMin[i + 1] + list[i][0].c; tailMin[i] = tailMin[i + 1] + F[i].minCells;
        var mx = 0; list[i].forEach(function (t) { mx = Math.max(mx, t.x.cs * t.x.rs); }); tailMax[i] = tailMax[i + 1] + mx;
      }
      var base = w.v1 * Hh - w.v2 * Math.min(n, 5), occ = new Int8Array(C * Hh), sel = [], pos = [], nh = 0, local = 0;
      function leaf(part) {
        var shapes = {}, ns = 0, c = part + w.v1 * Hh, run = 1, bigs = 0, j;
        for (j = 0; j < n; j++) {
          var kx = sel[j].x.key; if (!shapes[kx]) { shapes[kx] = 1; ns++; }
          if (sel[j].big) bigs++;
          if (j && kx === sel[j - 1].x.key) { run++; if (run >= 3) c += w.v4; } else run = 1;
        }
        c -= w.v2 * Math.min(ns, Math.min(n, 5));
        if (n >= 5 && !bigs) c += w.v3;
        var pr = {}, y, x;
        for (y = 0; y < Hh; y++) {
          var one = 0;
          for (x = 0; x < C; x++) {
            var a = occ[y * C + x] - 1, t = sel[a].x, isOne = t.cs === 1 && t.rs === 1;
            one = isOne ? one + 1 : 0; if (one === 3) c += w.v6;
            if (x + 1 < C) { var b = occ[y * C + x + 1] - 1; if (b !== a && sel[b].x.key === t.key && !pr[a * 16 + b]) { pr[a * 16 + b] = 1; c += w.v5; } }
            if (y + 1 < Hh) { var d = occ[(y + 1) * C + x] - 1; if (d !== a && sel[d].x.key === t.key && !pr[Math.min(a, d) * 16 + Math.max(a, d)]) { pr[Math.min(a, d) * 16 + Math.max(a, d)] = 1; c += w.v5; } }
          }
        }
        if (K.length < w.K || c < K[K.length - 1].cost) {
          K.push({ cost: c, sel: sel.map(function (s) { return s.x; }), pos: pos.slice(), H: Hh, heroes: nh });
          K.sort(function (p, q) { return p.cost - q.cost; }); if (K.length > w.K) K.pop();
        }
      }
      (function rec(i, free, from, part) {
        if (stop) return;
        if (i === n) { if (free === 0) leaf(part); return; }
        if (free < tailMin[i] || free > tailMax[i]) return;
        if (K.length >= w.K && part + restMin[i] + base >= K[K.length - 1].cost) return;
        var p = from; while (p < occ.length && occ[p]) p++;
        if (p >= occ.length) return;
        var r = (p / C) | 0, c0 = p % C, l = list[i];
        for (var q = 0; q < l.length; q++) {
          var t = l[q], x = t.x;
          if (c0 + x.cs > C || r + x.rs > Hh) continue;
          if (t.capHero && nh + 1 > heroCap) continue;
          var dy, dx, bad = false;
          for (dy = 0; dy < x.rs && !bad; dy++) for (dx = 0; dx < x.cs; dx++) if (occ[(r + dy) * C + c0 + dx]) { bad = true; break; }
          if (bad) continue;
          if (++local > w.NODES || ((local & 511) === 0 && now() - t0 > w.MS)) { stop = local > w.NODES ? "nodes" : "time"; break; }
          for (dy = 0; dy < x.rs; dy++) for (dx = 0; dx < x.cs; dx++) occ[(r + dy) * C + c0 + dx] = i + 1;
          sel.push({ x: x, big: t.hero }); pos.push({ row: r + 1, col: c0 + 1 }); if (t.capHero) nh++;
          rec(i + 1, free - x.cs * x.rs, p + x.cs, part + t.c);
          if (t.capHero) nh--; sel.pop(); pos.pop();
          for (dy = 0; dy < x.rs; dy++) for (dx = 0; dx < x.cs; dx++) occ[(r + dy) * C + c0 + dx] = 0;
        }
      })(0, C * Hh, 0, 0);
      nodes += local;
      if (stop === "nodes") stop = false;                    // per-row-count cap: try the next row count
    }
    for (var pass = 0; pass < 2 && !K.length; pass++) {
      if (pass) info.relaxed = true;
      for (var Hh = Hlo; Hh <= Hlo + 2 && !(stop === "time"); Hh++) search(pass ? 99 : cap, Hh);
      if (stop === "time") break;
    }
    info.nodes = nodes; info.sols = K.length;
    if (!K.length) { info.fallback = true; return done(stacked(F, ms, C)); }
    var pickI = 0, c0 = K[0].cost, tot = 0, ps = K.map(function (s) { var p = Math.exp(-(s.cost - c0) / w.T); tot += p; return p; }), r0 = rng() * tot;
    for (pickI = 0; pickI < K.length - 1; pickI++) { r0 -= ps[pickI]; if (r0 <= 0) break; }
    var best = K[pickI]; info.heroes = best.heroes; info.H = best.H; info.pick = pickI;
    return done(best.sel.map(function (x, i) { return { i: i, col: best.pos[i].col, cs: x.cs, row: best.pos[i].row, rs: x.rs, brk: !!x.brk, kind: ms[i].kind }; }));
  }

  root.stemBentoCost = { layout: layout, W: W, hashI: hashI };
})();
