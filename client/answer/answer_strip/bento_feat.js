/* bento_feat.js: bento4 PR1. Pure (no DOM): per-option content FEATURES + CLASS + the shapes an option may take, with a content preference per shape.
   Input is what bento.js measured in the hidden probe: {kind, chars, mathOnly, mathW, by:[{h, over}] for span 1..C}. Output {cls, lines, minRows, w, minCells, ...}.
   Classes (brain ui-polish/bento4/PLAN.md sec 2): TOKEN (<= 6 chars, or a small formula) | SHORT (<= 18 chars, one line at span 2) | WIDE (3+ lines at span 1, <= 2 at span 2, or a wide formula)
   | TALL (2..4 lines at span 1) | LONG (> 40 chars, or 3+ lines at span 2). Tony's answers (Nov 15): phone 1-col / tall tiles only for TOKEN + formulas, sentences go wide / full row;
   3x2 only from 5 columns; no 1x3 strips. Used by bento_cost.js (search) and bento.js (DOM). Loads in the browser (window.stemBentoFeat) and under node (vm / globalThis). */
(function () {
  "use strict";
  var root = typeof window !== "undefined" ? window : globalThis;
  var GAP = 8, PADX = 16, NEEDV = 52, SAFE = 2, RMAX = 5;

  /* geometry for a grid of width R and C columns (phone = narrow: unit row 88, else 100) */
  function geom(R, C) {
    var phone = R < 520, unit = phone ? 88 : 100;
    var cw = (R - (C - 1) * GAP) / C;
    return {
      R: R, C: C, phone: phone, unit: unit, gap: GAP,
      unitsH: function (u) { return u * unit + (u - 1) * GAP; },
      tileW: function (s) { return cw * s + (s - 1) * GAP; },
      wI: function (s) { return Math.max(20, cw * s + (s - 1) * GAP - 2 * PADX - SAFE); }
    };
  }

  /* shape table: pref per class, 0 = ideal, +1 = 10 cost points. "F" = full row (cs == C). Anything not listed gets BASE. */
  var BASE = 1.2;
  var PREF = {
    TOKEN: { "1x1": 0, "1x2": .3, "2x1": .25, "2x2": .05 },
    SHORT: { "2x1": .05, "1x1": 0, "1x2": .4, "2x2": .3, "3x1": .5 },
    WIDE: { "2x1": 0, "3x1": .1, "2x2": .2, "1x2": .8, "3x2": .5, F: .5 },
    TALL: { "1x2": 0, "2x2": .2, "2x1": .3, "1x1": .9 },
    LONG: { "2x2": 0, "3x2": 0, "2x1": .3, "3x1": .6, F: .4 }
  };
  var SHAPES = [[1, 1], [2, 1], [1, 2], [2, 2], [3, 1], [3, 2], [2, 3], [4, 1], [4, 2], [5, 1], [5, 2], [6, 1], [6, 2]];

  function median(a) { var s = a.slice().sort(function (x, y) { return x - y; }); return s.length ? s[s.length >> 1] : 0; }

  /* one option -> features */
  function classify(m, g) {
    var C = g.C, LH = m.kind === "t" ? 24 : 28, by = m.by, lines = [], minRows = [], over = [], h = [];
    for (var s = 1; s <= C; s++) {
      var b = by[s - 1]; h.push(b.h); over.push(!!b.over);
      lines.push(Math.max(1, Math.round(b.h / LH)));
      var r0 = 0; for (var r = 1; r <= RMAX; r++) if (b.h + NEEDV <= g.unitsH(r)) { r0 = r; break; }
      minRows.push(r0);
    }
    var chars = m.chars != null ? m.chars : (m.text || "").length, l1 = lines[0], l2 = lines[Math.min(1, C - 1)];
    var wI1 = g.wI(1), wI2 = g.wI(Math.min(2, C)), cls;
    if (m.mathOnly) cls = m.mathW <= .8 * wI1 ? "TOKEN" : m.mathW <= wI2 ? "WIDE" : "LONG";
    else if (chars <= 6) cls = "TOKEN";
    else if (chars > 40 || l2 >= 3) cls = "LONG";
    else if (chars <= 18 && l2 === 1) cls = "SHORT";
    else if (l1 >= 3 && l2 <= 2) cls = "WIDE";
    else if (l1 >= 2 && l1 <= 4 && !over[0]) cls = "TALL";
    else cls = "WIDE";
    var minCells = 1e9;
    for (s = 1; s <= C; s++) { if (over[s - 1] && s < C) continue; var mr = minRows[s - 1] || (s === C ? RMAX : 0); if (mr) minCells = Math.min(minCells, s * mr); }
    return {
      cls: cls, chars: chars, mathOnly: !!m.mathOnly, mathW: m.mathW || 0, lines: lines, h: h, over: over, minRows: minRows, minCells: minCells,
      w: Math.max(1, h[Math.min(1, C - 1)]) * wI2     // ink-area proxy: wrapped height at span 2 x inner width
    };
  }

  /* all options of one question: adds hero eligibility (content weight >= 1.4 x median) */
  function classifyAll(ms, g) {
    var F = ms.map(function (m) { return classify(m, g); }), ws = F.map(function (f) { return f.w; }), med = median(ws), mx = Math.max.apply(null, ws);
    F.forEach(function (f) { f.eligible = f.w >= 1.4 * med; f.top = f.w >= .95 * mx; });
    return F;
  }

  /* shapes this option may take: [{cs, rs, key, pref, grow, brk}] (pref in plan units, x10 = cost). forbid = {"2x1":1} from the render guard. */
  function candidates(f, g, forbid) {
    var C = g.C, phone = g.phone, out = [], seen = {}, list = SHAPES.filter(function (x) { return x[0] <= C; });
    for (var r = 1; r <= 3; r++) list.push([C, r]);
    var mathy = f.mathOnly || f.cls === "TOKEN";
    list.forEach(function (x) {
      var cs = x[0], rs = x[1], key = cs + "x" + rs;
      if (seen[key]) return; seen[key] = 1;
      if (forbid && forbid[key]) return;
      if (cs === 1 && rs >= 3) return;                      // no 1x3 strips (Tony)
      if (f.over[cs - 1] && cs < C) return;                 // the longest word / formula does not fit this width
      var mr = f.minRows[cs - 1] || (cs === C ? RMAX : 0);
      if (!mr || rs < mr || rs - mr > 2) return;
      if (rs > 4 && cs < C) return;
      if (cs === 3 && rs === 2 && C < 5) { if (cs !== C) return; }   // 3x2 hero only from 5 columns (at C = 3 it is a full row)
      if (phone) {
        if (cs === 1 && !mathy && f.cls !== "SHORT") return;          // sentences are wide on a phone (Tony)
        if (rs >= 2 && cs === 1 && !mathy) return;                    // tall 1-wide tiles: tokens + formulas only
      }
      var p = PREF[f.cls][key]; if (p == null) p = cs === C && PREF[f.cls].F != null ? PREF[f.cls].F : BASE;
      if (phone && f.cls === "SHORT" && cs === 1) p += .6;
      if (f.cls === "LONG" && cs === 1) return;
      out.push({ cs: cs, rs: rs, key: key, pref: p, grow: rs - mr, brk: !!f.over[cs - 1] });
    });
    if (!out.length) { var mr2 = f.minRows[C - 1] || RMAX; out.push({ cs: C, rs: mr2, key: C + "x" + mr2, pref: BASE, grow: 0, brk: true }); }
    return out;
  }

  root.stemBentoFeat = { geom: geom, classify: classify, classifyAll: classifyAll, candidates: candidates, PREF: PREF, GAP: GAP, PADX: PADX, NEEDV: NEEDV, SAFE: SAFE, RMAX: RMAX };
})();
