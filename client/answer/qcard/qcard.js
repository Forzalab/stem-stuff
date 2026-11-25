/* qcard.js: QCARD-SWISS v3, the question card redesign. BEHIND html.ui-v7 (fx.js, ?ui=v7). Flag off = this file touches nothing and the card is the one app.js draws.
   Flag on, after app.js render() fills #blocks (a MutationObserver on #blocks, so every re-render is covered), top to bottom on ONE card background:
   - GHOST: the question number as an ECHO numeral (6 Archivo 900 copies, step -12px x) at the card top; on a prev/next change the trail copies slide in (qcard.css .qanim, compositor only).
   - the figure(s), then the topic headline (the sugar title, lowercase; a bank "Q1 · " exam prefix keeps its capital Q, TITLE-EXAMQ), then ONE text block: the setup, then the question sentence (the last sentence of the last text block,
     kept bold); no fold and no inner scroller (ICK PR-A: the card is as tall as its text and the page scrolls), then the small meta row: exam . q#, the Twist chip (app.js twistChip).
   - ASK-PIN (ICK PR-A, F1): on a long card the page scrolls it away until only its last strip, the bold ask, is left; that strip stays pinned at the top, a tap on it scrolls back to the full question.
   - FROST (§frost, Tony Nov 23, pick 3): ONE liquid-glass sheet over the WHOLE card (inset 0), between the card background + ghost numeral and the text.
   Source: brain ui-polish/hintbox/v71/longq (DESIGN.md), ui-v7-decisions QCARD-SWISS v3 (owner picked V3). Looks: qcard.css. */
(function (g) {
  "use strict";
  var D = g.document, H = D.documentElement;
  var on = function () { return H.classList.contains("ui-v7"); };
  var ABBR = /(?:\be\.g|\bi\.e|\bvs|\bet al|\bDr|\bMr|\bMrs|\bMs|\bFig|\bapprox|\bNo|\b[A-Z])\.$/;
  var raf = 0;
  var EXAM = null;   // titles.mjs examPrefix, loaded by the dynamic import at the end (qcard.js is a classic script: no static import, the way shell.js reaches nav.js)

  /* the split point of the last sentence of <p>: { node, off } in a TOP-LEVEL text node (math / inline elements are never cut), or null = the whole p is one sentence */
  function lastSentenceStart(p) {
    var best = null;
    for (var n = p.firstChild; n; n = n.nextSibling) {
      if (n.nodeType !== 3) continue;
      var t = n.nodeValue, re = /[.?!:]["'”’)]*(\s+)(?=[A-Z0-9$\\(])/g, m;
      while ((m = re.exec(t))) {
        var head = t.slice(0, m.index + 1);
        if (ABBR.test(head)) continue;
        best = { node: n, off: m.index + m[0].length };
      }
    }
    return best;
  }
  function plainLen(el) { return (el.textContent || "").replace(/\s+/g, " ").trim().length; }

  /* the lead: the last <p> of the last .md; its last sentence moves into div.md.qlead. Returns the element or null (no clean question sentence: the card keeps its flow) */
  function takeLead(blocks) {
    var ask = blocks.querySelector(":scope > .md.qask");   // an explicit ask (SCHEMA.md `ask`) IS the lead; the setup is never cut, whatever its last sentence says
    if (ask) { ask.remove(); ask.classList.add("qlead"); return ask; }
    var mds = blocks.querySelectorAll(":scope > .md");
    var md = mds[mds.length - 1];
    if (!md) return null;
    var p = md.lastElementChild;
    if (!p || p.tagName !== "P" || (md.lastChild !== p && md.lastChild.textContent.trim())) return null;
    if (!plainLen(p)) return null;
    var lead = D.createElement("div");
    lead.className = "md qlead";
    var at = lastSentenceStart(p);
    if (at) {
      var r = D.createRange(); r.setStart(at.node, at.off); r.setEndAfter(p.lastChild);
      lead.appendChild(r.extractContents());
    } else { while (p.firstChild) lead.appendChild(p.firstChild); }
    if (!plainLen(p) && !p.querySelector("*")) p.remove();
    if (!md.children.length || (!plainLen(md) && !md.querySelector(".katex"))) md.remove();
    return lead;
  }

  function number() {
    var a = D.querySelector("#qlist [aria-current] .qn");
    if (a && a.textContent.trim()) return a.textContent.trim();
    var c = ((D.getElementById("pcode") || {}).textContent || "").match(/(\d+)\D*$/);
    return c ? String(+c[1]) : "1";
  }
  var animT = 0, cv = null;
  /* the first digit's left side bearing at the ghost's real size / weight / width (canvas measure, no hard-coded font numbers): the glyph box is shifted left by it, so the numeral's
     INK edge lands on --qc-pad, the text's left edge, for every digit (1, 2, 7, 12, 28 ...) */
  function inkLeft(gh, num) {
    if (!D.fonts) return;
    if (!D.fonts.check('900 20px "G Archivo"')) { D.fonts.load('900 20px "G Archivo"', "0123456789").then(later, function () {}); return; }   // not loaded yet: measure again the moment it is
    cv = cv || D.createElement("canvas").getContext("2d");
    var px = parseFloat(g.getComputedStyle(gh).fontSize) || 132;
    cv.font = '900 ' + px + 'px "G Archivo"'; if ("fontStretch" in cv) cv.fontStretch = "semi-expanded"; if ("letterSpacing" in cv) cv.letterSpacing = "0px";
    var m = cv.measureText(num.charAt(0));
    gh.style.setProperty("--lsb", (-m.actualBoundingBoxLeft).toFixed(2) + "px");
  }
  function ghost(p) {
    var box = p.querySelector(":scope > .qghostbox");
    if (!box) {
      box = D.createElement("div"); box.className = "qghostbox"; box.setAttribute("aria-hidden", "true");
      var gh = D.createElement("div"); gh.className = "qghost";
      for (var k = 0; k < 6; k++) { var i = D.createElement("i"); i.style.setProperty("--k", k); gh.appendChild(i); }
      box.appendChild(gh); p.insertBefore(box, p.firstChild);
    }
    p.classList.toggle("qbr", !/(^|[?&])qcecho=tl(&|$)/.test(g.location.search));   // prototype: the echo trail at the bottom-right (qcard.css)
    var num = number(), cur = box.firstChild, was = cur.getAttribute("data-n");
    inkLeft(cur, num);
    if (was !== num) {
      cur.setAttribute("data-n", num); cur.style.setProperty("--qd", String(num).length); for (var j = 0; j < cur.children.length; j++) cur.children[j].textContent = num;
      if (was !== null) echo(box);                                          // a question change (not the first paint): the trail slides in
    }
  }
  /* the echo animation: .qanim = transform + opacity keyframes (qcard.css); will-change only while it runs; off under prefers-reduced-motion */
  function echo(box) {
    if (g.matchMedia && g.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    box.classList.remove("qanim"); void box.offsetWidth; box.classList.add("qanim");
    clearTimeout(animT); animT = setTimeout(function () { box.classList.remove("qanim"); }, 620);
  }

  /* == §ghost-glass == the glass under the numeral (qcard.css §ghost-glass): one static SVG filter (lit rim, dark inner edge, grain), made once; one blurred scrim pill per text line */
  function glassDefs() {
    if (D.getElementById("qg-glass")) return;
    var NS = "http://www.w3.org/2000/svg", svg = D.createElementNS(NS, "svg"), f = D.createElementNS(NS, "filter");
    svg.setAttribute("aria-hidden", "true"); svg.style.cssText = "position:absolute;width:0;height:0;overflow:hidden"; f.setAttribute("id", "qg-glass");
    ["x", "y"].forEach(function (a) { f.setAttribute(a, "-8%"); }); ["width", "height"].forEach(function (a) { f.setAttribute(a, "116%"); }); f.setAttribute("color-interpolation-filters", "sRGB");
    f.innerHTML = '<feGaussianBlur in="SourceAlpha" stdDeviation="6" result="h"/><feSpecularLighting in="h" surfaceScale="5" specularConstant=".7" specularExponent="20" lighting-color="#d6e4ff" result="sp"><feDistantLight azimuth="235" elevation="38"/></feSpecularLighting>'
      + '<feComposite in="sp" in2="SourceAlpha" operator="in" result="spIn"/><feMorphology in="SourceAlpha" operator="erode" radius="2.5" result="er"/><feGaussianBlur in="er" stdDeviation="5" result="erb"/>'
      + '<feComposite in="SourceAlpha" in2="erb" operator="out" result="edge"/><feFlood flood-color="rgb(2,6,18)" flood-opacity=".45"/><feComposite in2="edge" operator="in" result="edgeDark"/>'
      + '<feTurbulence type="fractalNoise" baseFrequency="1.7" numOctaves="2" stitchTiles="stitch" result="n"/><feColorMatrix in="n" type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 .32 0 0 -.128" result="gr"/>'
      + '<feComposite in="gr" in2="SourceAlpha" operator="in" result="grIn"/><feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="edgeDark"/><feMergeNode in="grIn"/><feMergeNode in="spIn"/></feMerge>';
    svg.appendChild(f); D.body.appendChild(svg);
  }
  function scrims() {
    var p = D.getElementById("problem"), sl = p && p.querySelector(":scope > .qscrim");
    if (!p || !on() || !p.classList.contains("qbr")) { if (sl) sl.remove(); return; }
    glassDefs();
    if (!sl) { sl = D.createElement("div"); sl.className = "qscrim"; sl.setAttribute("aria-hidden", "true"); var gb = p.querySelector(":scope > .qghostbox"); p.insertBefore(sl, gb ? gb.nextSibling : p.firstChild); }
    var cr = p.getBoundingClientRect(), pad = 9, html = "";
    p.querySelectorAll(":scope > .blocks .qhead, :scope > .blocks .qsetup, :scope > .blocks .qlead").forEach(function (e) {
      var rg = D.createRange(), rows = []; rg.selectNodeContents(e);
      [].slice.call(rg.getClientRects()).forEach(function (q) {
        if (q.width < 2) return;
        var r = rows.filter(function (a) { return Math.abs(a.top - q.top) < 3; })[0];
        if (r) { r.left = Math.min(r.left, q.left); r.right = Math.max(r.right, q.right); r.bottom = Math.max(r.bottom, q.bottom); } else rows.push({ left: q.left, right: q.right, top: q.top, bottom: q.bottom });
      });
      rows.forEach(function (b) {
        var x = b.left - cr.left - pad, y = b.top - cr.top - pad * .7, w = b.right - b.left + 2 * pad, h = b.bottom - b.top + 1.4 * pad;
        html += '<i style="left:' + x.toFixed(1) + 'px;top:' + y.toFixed(1) + 'px;width:' + w.toFixed(1) + 'px;height:' + h.toFixed(1) + 'px"></i>';
      });
    });
    if (sl.innerHTML !== html) sl.innerHTML = html;
  }

  /* == §frost == GHOST-HYBRID-FROST (Tony Nov 23, pick 3): ONE liquid-glass sheet over the WHOLE question card (inset 0, the card's radius, qcard.css §frost),
     between the card background + ghost numeral and the text. Nothing to measure: the sheet is the card. qcard.css: a 3px frost as the no-SVG-filter fallback,
     swapped for the static displacement lens (#qg-lens) once the map is built. Flag off = no layer. */
  function frost() {
    var p = D.getElementById("problem"), el = p && p.querySelector(":scope > .qfrost");
    if (!p || !on() || !p.classList.contains("qbr")) { if (el) el.remove(); H.removeAttribute("data-qf-lens"); return; }
    if (!el) {
      el = D.createElement("div"); el.className = "qfrost"; el.setAttribute("aria-hidden", "true");
      var gb = p.querySelector(":scope > .qghostbox"); p.insertBefore(el, gb ? gb.nextSibling : p.firstChild);
    }
    var r = p.getBoundingClientRect();
    lens(r.width, r.height);
  }
  /* the lens map is liquidglass's displacement map (gentpan @ d5db099, MIT, via ask-glass.js §engine): a convex profile bend (refraction px at the rim) +
     a radial magnify term sampling towards the centre. Static, one map per layer size; chroma and specular are off. */
  var ENG = (function () {
    var nav = typeof navigator === "undefined" ? null : navigator;
    if (!nav) return "none";   // no browser (a node vm test): not blink, so no lens is ever built
    var br = nav.userAgentData && nav.userAgentData.brands;
    if (br && br.some(function (x) { return /Chromium/.test(x.brand); })) return "blink";
    var ua = nav.userAgent || "";
    if (/Firefox\//.test(ua)) return "gecko";
    if (/AppleWebKit\//.test(ua) && !/Chrome\/|Chromium\/|Edg\//.test(ua)) return "webkit";
    return "blink";
  })();
  var LENS = { mag: 1.04, refr: 8, curv: 6, ior: 1.5, blur: 4, id: "qg-lens", sig: "" };   /* blur 4 (was 3, Tony Nov 25: a softer frost between card and body text; still <= 4px so the numeral reads through the glass, was 6 before Nov 23) */
  function lensProfile(curv, ior) {
    var N = 512, t = new Float32Array(N + 1), max = 0, i;
    for (i = 0; i <= N; i++) {
      var s = Math.min(i / N, 1 - 1e-6), a = Math.pow(1 - s, curv), slope = Math.pow(1 - s, curv - 1) * Math.pow(Math.max(1 - a, 1e-9), 1 / curv - 1);
      var th = Math.atan(slope), rf = Math.asin(Math.sin(th) / ior), b = Math.tan(th - rf);
      t[i] = b; if (b > max) max = b;
    }
    for (i = 0; i <= N; i++) t[i] /= max || 1; t[N] = 0;
    return t;
  }
  var LPROF = lensProfile(LENS.curv, LENS.ior);
  function lensMap(w0, h0) {
    var w = Math.max(2, Math.round(w0)), h = Math.max(2, Math.round(h0)), sc = Math.min(1, Math.sqrt(9e4 / (w * h)));   // big layers: half-res map, stretched (the 3px frost hides it)
    var mw = Math.max(2, Math.round(w * sc)), mh = Math.max(2, Math.round(h * sc));
    var cv = D.createElement("canvas"); cv.width = mw; cv.height = mh;
    var ctx = cv.getContext("2d"), im = ctx.createImageData(mw, mh), px = im.data;
    var hw = w0 / 2, hh = h0 / 2, rad = Math.min(16, hw, hh), bez = Math.max(.5, .6 * Math.min(hw, hh));
    var N = LPROF.length - 1, diag = Math.hypot(hw, hh), kM = 1 - 1 / LENS.mag, max = 1e-6;
    var sx = w0 / mw, sy = h0 / mh, i, j;
    for (j = 0; j < mh; j++) for (i = 0; i < mw; i++) {
      var x = (i + .5) * sx - hw, y = (j + .5) * sy - hh;
      var qx = Math.abs(x) - (hw - rad), qy = Math.abs(y) - (hh - rad), ox = Math.max(qx, 0), oy = Math.max(qy, 0), c = Math.hypot(ox, oy);
      var dist = c + Math.min(Math.max(qx, qy), 0) - rad, alpha = Math.min(1, Math.max(0, .5 - dist / Math.max(sx, sy)));
      if (alpha <= 0) continue;
      var nx = 0, ny = 0;
      if (qx > 0 && qy > 0) { nx = (ox / c) * (x < 0 ? -1 : 1); ny = (oy / c) * (y < 0 ? -1 : 1); }
      else if (qx > qy) nx = x < 0 ? -1 : 1;
      else ny = y < 0 ? -1 : 1;
      var s = Math.max(0, -dist) / bez, m = s >= 1 ? 0 : LPROF[Math.min(N, Math.round(s * N))];
      var rr = Math.hypot(x, y) || 1, mag = kM * Math.min(rr, diag);
      var dx = LENS.refr * m * nx - mag * x / rr, dy = LENS.refr * m * ny - mag * y / rr;   // outward rim bend + inwards magnify sample
      if (Math.abs(dx) > max) max = Math.abs(dx); if (Math.abs(dy) > max) max = Math.abs(dy);
      var o = (j * mw + i) * 4;
      px[o] = 128 + Math.round(127 * dx / max); px[o + 1] = 128 + Math.round(127 * dy / max); px[o + 2] = 128; px[o + 3] = Math.round(alpha * 255);
    }
    ctx.putImageData(im, 0, 0);
    return { url: cv.toDataURL("image/png"), max: max };
  }
  function bendScale(px, w, h) {
    if (ENG === "webkit") { var m = Math.min(w, h); return { scale: 2 * px / m, kx: m / w, ky: m / h }; }
    if (ENG === "gecko") return { scale: 2 * px / Math.sqrt((w * w + h * h) / 2), kx: 1, ky: 1 };
    return { scale: 2 * px / w, kx: 1, ky: 1 };
  }
  var lensSvg = null;
  function lens(w, h) {
    if (ENG !== "blink") return;   // ENGINE GUARD: an SVG filter url() in backdrop-filter is only known to render on Blink; gecko / webkit keep the plain 3px frost (qcard.css), no map, no attribute
    var sig = Math.round(w) + "x" + Math.round(h);
    if (sig === LENS.sig && D.getElementById(LENS.id)) { H.setAttribute("data-qf-lens", "1"); return; }
    var map = lensMap(w, h), NS = "http://www.w3.org/2000/svg", old = D.getElementById(LENS.id);
    if (old) old.parentNode.removeChild(old);
    if (!lensSvg || !lensSvg.isConnected) {
      lensSvg = D.createElementNS(NS, "svg"); lensSvg.setAttribute("aria-hidden", "true");
      lensSvg.style.cssText = "position:absolute;width:0;height:0;overflow:hidden;pointer-events:none"; D.body.appendChild(lensSvg);
    }
    var f = D.createElementNS(NS, "filter"), mk = function (n, a) { var e = D.createElementNS(NS, n); for (var k in a) e.setAttribute(k, a[k]); return e; };
    f.setAttribute("id", LENS.id); f.setAttribute("filterUnits", "objectBoundingBox"); f.setAttribute("x", "0"); f.setAttribute("y", "0");
    f.setAttribute("width", "1"); f.setAttribute("height", "1"); f.setAttribute("primitiveUnits", "objectBoundingBox"); f.setAttribute("color-interpolation-filters", "sRGB");
    f.appendChild(mk("feFlood", { "flood-color": "rgb(128,128,128)", result: "neutral" }));
    var img = mk("feImage", { preserveAspectRatio: "none", result: "lensShape", x: 0, y: 0, width: 1, height: 1 });
    img.setAttribute("href", map.url); f.appendChild(img);
    f.appendChild(mk("feComposite", { in: "lensShape", in2: "neutral", operator: "over", result: "map" }));
    var bs = bendScale(map.max, w, h), bend = "map";
    if (ENG === "webkit") {
      f.appendChild(mk("feColorMatrix", { in: "map", type: "matrix", result: "bend", values: bs.kx + " 0 0 0 " + ((1 - bs.kx) / 2) + "  0 " + bs.ky + " 0 0 " + ((1 - bs.ky) / 2) + "  0 0 1 0 0  0 0 0 1 0" }));
      bend = "bend";
    }
    f.appendChild(mk("feGaussianBlur", { in: "SourceGraphic", stdDeviation: (LENS.blur / w) + " " + (LENS.blur / h), result: "frosted" }));
    f.appendChild(mk("feDisplacementMap", { in: "frosted", in2: bend, xChannelSelector: "R", yChannelSelector: "G", scale: bs.scale, result: "refracted" }));
    f.appendChild(mk("feComposite", { in: "refracted", in2: "lensShape", operator: "in" }));
    lensSvg.appendChild(f); LENS.sig = sig; H.setAttribute("data-qf-lens", "1");
  }

  function exam() { var n = D.getElementById("qlistName"); return n ? n.textContent.trim() : ""; }
  function span(cls, txt) { var e = D.createElement("span"); e.className = cls; e.textContent = txt; return e; }
  /* TITLE-EXAMQ-DIM: the bank title's "Q1 · " exam-question prefix keeps its capital Q inside the lower-case headline, in the dim ink, with NO dot drawn
     (Tony Nov 24: "remove the dot, keep the dim, the dot is ceremony"). The prefix comes from titles.mjs examPrefix (EXAM below), never a copied regex;
     built with textContent, so no bank text goes through innerHTML. The typed " · " stays in the DOM inside .sr-only for screen readers and copy; the one
     word space before the rest is .qexam's margin-right (qcard.css). No prefix = the same DOM as before. */
  function examSpan(head) {
    if (!EXAM || head.querySelector(":scope > .qexam")) return;
    var pre = EXAM(head.textContent).prefix;
    if (!pre) return;
    var w = D.createTreeWalker(head, 4), n = w.nextNode();
    if (!n || n.parentNode !== head || n.nodeValue.lastIndexOf(pre, 0) !== 0) return;
    var num = pre.slice(0, pre.length - 3);   // EXAMQ_PREFIX fixes the tail " · " (space, U+00B7, space): the visible part is the number only
    var q = span("qexam", num);
    q.appendChild(span("sr-only", pre.slice(num.length)));   // " · ": kept for screen readers and copy, never drawn, no gap
    head.insertBefore(q, n);
    n.nodeValue = n.nodeValue.slice(pre.length);
  }
  function meta(m) {
    var a = m.querySelector(".qexam"), e = exam(), t = (e ? e.toLowerCase() + " \u00b7 " : "") + "q" + number();
    if (!a) { a = span("qexam", ""); m.insertBefore(a, m.firstChild); }
    if (a.textContent !== t) a.textContent = t;
  }
  /* a number and its unit never wrap apart: plain text nodes only (KaTeX is left alone) */
  var UNIT = /(\d)[ \t\n]+(?=(?:(?:[kcmµμnMG]?(?:m|g|s|N|J|W|Pa|Hz|V|L)|mol|rad|deg|eV|atm|min|°C|%)(?![A-Za-z])))/g;
  function nbsp(root) {
    var w = D.createTreeWalker(root, 4, { acceptNode: function (n) { return n.parentNode.closest && n.parentNode.closest(".katex") ? 2 : 1; } }), n, list = [];
    while ((n = w.nextNode())) { UNIT.lastIndex = 0; if (UNIT.test(n.nodeValue)) list.push(n); }
    UNIT.lastIndex = 0;
    list.forEach(function (x) { x.nodeValue = x.nodeValue.replace(UNIT, "$1\u00a0"); });
  }
  function build() {
    raf = 0;
    var p = D.getElementById("problem"), blocks = D.getElementById("blocks");
    if (!p || !blocks) return;
    if (!on()) {
      p.classList.remove("qc7");
      var b0 = p.querySelector(":scope > .qghostbox"); if (b0) b0.remove();
      return;
    }
    if (!blocks.children.length) return;
    p.classList.add("qc7");
    ghost(p);
    if (!blocks.querySelector(":scope > .qtext")) {
      var lead = takeLead(blocks);
      if (lead) {
        var kids = Array.prototype.slice.call(blocks.children), figs = [], texts = [], rest = [], pt = null, chg = null, tw = null;
        kids.forEach(function (c) {
          if (c.classList.contains("fig")) figs.push(c);
          else if (c.classList.contains("md")) { c.classList.add("qsetup"); texts.push(c); }
          else if (c.classList.contains("ptitle")) pt = c;
          else if (c.classList.contains("chg-chip")) chg = c;
          else rest.push(c);
        });
        var head = null, m = D.createElement("div"); m.className = "qmeta";
        if (pt) {
          tw = pt.querySelector(".twist-chip");
          var kids = Array.prototype.filter.call(pt.childNodes, function (n) { return !(n.nodeType === 1 && n.classList.contains("twist-chip")); });   // TITLE-MATH: keep rendered math nodes, not only raw text
          if (kids.some(function (n) { return (n.textContent || "").trim(); })) { head = D.createElement("h2"); head.className = "qhead"; kids.forEach(function (n) { head.appendChild(n.cloneNode(true)); }); examSpan(head); }
        }
        var tx = D.createElement("div"); tx.className = "qtext";
        texts.forEach(function (c) { tx.appendChild(c); });
        tx.appendChild(lead);
        if (tw) m.appendChild(tw);
        figs.forEach(function (c) { blocks.appendChild(c); });
        if (head) blocks.appendChild(head);
        if (chg) blocks.appendChild(chg);
        nbsp(tx); blocks.appendChild(tx); blocks.appendChild(m);
        rest.forEach(function (c) { blocks.appendChild(c); });
        if (pt) pt.remove();
      }
    }
    var mm = blocks.querySelector(":scope > .qmeta");
    if (mm) meta(mm);
  }
  /* ROW-ALIGN (Tony Nov 16, option B, every bank): a title-first card shares one row with the Ask Cluck float. The title reserves the button's MEASURED width
     (--cbw) + a gap; the button keeps its own size and drops so its BOTTOM sits on the title's last line (1, 2, 3+ lines alike). No title first / flag off = reset. */
  var ro = null;
  function rowAlign() {   // KICKER-C (Tony Nov 16): one layout (kicker row = code + Ask Cluck, then the headline); the old beside/stack measuring is retired, this only clears its leftovers and writes the code
    var p = D.getElementById("problem"), b = p && p.querySelector(":scope > .cluckbtn"), t = p && p.querySelector(":scope > .blocks > :is(.ptitle, .qhead):first-child");
    if (!p) return;
    if (b) b.style.marginTop = ""; if (t) t.style.paddingTop = ""; p.classList.remove("qstack"); p.style.removeProperty("--cbw");
    var c = D.getElementById("pcode"), code = c ? c.textContent.trim() : ""; p.dataset.code = code;
    if (!on() || !p.classList.contains("qbr")) return;
    var k = p.querySelector(":scope > .qkicker");
    if (!k) { k = D.createElement("span"); k.className = "qkicker"; k.setAttribute("aria-hidden", "true"); p.insertBefore(k, p.firstChild); }
    if (k.textContent !== code) k.textContent = code;
    /* KICKER-BASELINE (Tony Nov 16): the Ask Cluck LABEL's baseline = the code's baseline (flex 'baseline' picked the duck icon) */
    k.style.marginTop = "";
    if (!b) return;
    var lab = [].slice.call(b.querySelectorAll("*")).filter(function (e) { return !e.children.length && /\S/.test(e.textContent) && e.getClientRects().length; })[0];
    if (!lab) return;
    var base = function (host) { var s = D.createElement("span"); s.style.cssText = "display:inline-block;width:0;height:0;vertical-align:baseline"; host.appendChild(s); var y = s.getBoundingClientRect().top; host.removeChild(s); return y; };
    var d = base(lab) - base(k);
    if (Math.abs(d) > 0.25) k.style.marginTop = d + "px";
  }
  /* ICK4-SHORT-LH (Tony Nov 18, 2a): the setup's rendered line count picks the leading (qcard.css: <= 4 lines read at 1.3). Counting the boxes, not raw text,
     keeps one rule for short sentences, lists and math. The bold ask is one question sentence, not body length (CEH_T2A: 4 setup lines + a 2-line ask still reads
     short); a card that is only an ask falls back to the lead. The class only changes leading, never the wrap, so later() cannot loop on its own toggle. */
  function shortText() {
    var p = D.getElementById("problem");
    if (!on() || !p) { if (p) p.classList.remove("qshort"); return; }
    var tx = p.querySelector(":scope > .blocks > .qtext");
    if (!tx) { p.classList.remove("qshort"); return; }
    var els = tx.querySelectorAll(":scope > p, :scope > li, :scope > .md:not(.qlead) p, :scope > .md:not(.qlead) li"), lines = 0;
    for (var i = 0; i < els.length; i++) {
      var h = els[i].getBoundingClientRect().height, lh = parseFloat(g.getComputedStyle(els[i]).lineHeight);
      if (!h || !lh) continue;   // NaN / 0: not laid out (display none, a hidden block)
      lines += Math.round(h / lh);
    }
    if (!lines) {
      var lead = tx.querySelector(":scope > .md.qlead"), lh0 = lead && parseFloat(g.getComputedStyle(lead).lineHeight), h0 = lead && lead.getBoundingClientRect().height;
      if (h0 && lh0) lines = Math.round(h0 / lh0);
    }
    p.classList.toggle("qshort", lines > 0 && lines <= 4);
  }
  /* ASK-PIN (ICK PR-A, Tony Nov 17 F1; brain ui-polish/ick-v1 R2): the card is no scroller, the page scrolls it. qcard.css gives a long card `position: sticky; top: -(offset of its
     last strip)`, so it scrolls away until only the bold ask (+ the card's bottom pad) is left at the top. This measures that offset (--qpin, on <html>: the proof page pins #freeze, an
     ancestor of the card), the pinned top bar's height (--qbar) and the strip's height + the bar's (--qstrip, the page's scroll-padding-top while pinned, WCAG 2.4.11). .qpin = it engages (an ask taller than a third of the screen
     never pins), .qpinned = the strip is stuck now (it gets the bar look). A tap on the stuck strip, not on a control, scrolls back to the full question. */
  var pinStrip = 0, pinEl = null, pinRaf = 0;
  /* the pinned top bar (header.top, sticky: the question bank bar on a multi-question bank) is on top of the strip's spot: the strip sticks under it (--qbar) */
  function barH() { var b = D.querySelector("header.top"), cs = b && g.getComputedStyle(b); return cs && cs.position === "sticky" ? Math.max(0, Math.round((parseFloat(cs.top) || 0) + b.offsetHeight)) : 0; }
  function pinVars() { var bar = barH(); H.style.setProperty("--qbar", bar + "px"); H.style.setProperty("--qstrip", (pinStrip + bar) + "px"); }
  function pinMeasure() {
    var p = D.getElementById("problem"), lead = p && p.querySelector(":scope > .blocks > .qtext > .qlead");
    if (!on() || !p || !lead || !p.classList.contains("qc7")) { if (p) p.classList.remove("qpin", "qpinned"); ["--qpin", "--qbar", "--qstrip"].forEach(function (k) { H.style.removeProperty(k); }); pinEl = null; return; }
    var off = Math.round(lead.getBoundingClientRect().top - p.getBoundingClientRect().top) - 12, strip = p.offsetHeight - off;   // strip = 12px air + the ask + the card's bottom pad
    pinStrip = strip; p.classList.toggle("qpin", off > 40 && strip < g.innerHeight * 0.34);
    H.style.setProperty("--qpin", off + "px"); pinVars();
    pinEl = H.classList.contains("proof-split") && p.parentNode && p.parentNode.parentNode && p.parentNode.parentNode.id === "freeze" ? p.parentNode.parentNode : p;
    pinState();
  }
  function pinState() {
    var p = D.getElementById("problem"); if (!p || !pinEl) return;
    if (p.classList.contains("qpin") && parseFloat(H.style.getPropertyValue("--qbar")) !== barH()) pinVars();   // the bar changed height since the last measure
    var on_ = p.classList.contains("qpin") && g.getComputedStyle(pinEl).position === "sticky" && pinEl.getBoundingClientRect().top <= (parseFloat(g.getComputedStyle(pinEl).top) || 0) + 1;
    p.classList.toggle("qpinned", on_);
  }
  function pinSoon() { if (!pinRaf) pinRaf = requestAnimationFrame(function () { pinRaf = 0; pinState(); }); }
  function pinTap(e) {
    var p = D.getElementById("problem");
    if (!p || !p.classList.contains("qpinned") || e.target.closest("button, a, input, textarea, select, [role=link], [role=button]")) return;
    g.scrollTo({ top: 0, behavior: g.matchMedia && g.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }
  /* ANCHOR-BOTTOM (Tony Nov 16 "anchor the title + question text to the bottom"), kept under ICK5-CLUCK-TR: the card is a block now (the Ask Cluck float needs one,
     qcard.css §ick5-tr), so the old flex spread is gone; a card shorter than its floor (min-height) gets the spare height as the text block's top margin instead.
     The float stays at the top right; when the spare is smaller than the button the first lines still wrap around it. Idempotent: it resets before it measures. */
  function anchor() {
    var p = D.getElementById("problem"), b = p && p.querySelector(":scope > .blocks"); if (!b) return;
    if (b.style.marginTop) b.style.marginTop = "";
    if (!on() || !p.classList.contains("qbr") || H.classList.contains("mt") || H.classList.contains("swap")) return;
    var h1 = p.offsetHeight; p.style.minHeight = "0"; var h0 = p.offsetHeight; p.style.minHeight = "";
    if (h1 - h0 >= 1) b.style.marginTop = (h1 - h0) + "px";
  }
  /* FIG-CLEAR (Tony Nov 23; qcard.css §fig-top): a phone card whose first block is a figure pulls it up under the Ask Cluck button. If the figure's INK (not its svg canvas) comes
     within CLEAR px of the button, the figure's margin-top grows by just the push that keeps CLEAR px between them; no hit = the CSS 21px stays. The button never moves.
     figPush is pure (rects {l,t,r,b}), testable on its own (tests/figclear.test.mjs). */
  var CLEAR = 12;
  function figPush(ink, btn, clear) {
    if (!ink || !btn) return 0;
    var c = clear == null ? CLEAR : clear;
    var hit = ink.l < btn.r + c && ink.r > btn.l - c && ink.t < btn.b + c && ink.b > btn.t - c;
    return hit ? Math.max(0, Math.ceil(btn.b + c - ink.t)) : 0;
  }
  /* the union of the drawn marks and labels in page px: getBBox mapped through getScreenCTM; the full-canvas background rect, defs and hidden marks are not ink */
  function inkBox(svg) {
    var vb = svg.viewBox && svg.viewBox.baseVal, u = null;
    svg.querySelectorAll("path, line, polyline, polygon, circle, ellipse, rect, text, image, use").forEach(function (e) {
      if (e.closest("defs, marker, clipPath, mask, pattern, [hidden]")) return;
      var bb, m;
      try { bb = e.getBBox(); m = e.getScreenCTM(); } catch (x) { return; }
      if (!bb || !m || (!bb.width && !bb.height)) return;
      if (vb && vb.width && e.tagName === "rect" && bb.width >= vb.width - 1 && bb.height >= vb.height - 1) return;
      var cs = g.getComputedStyle(e); if (cs.display === "none" || cs.visibility === "hidden" || +cs.opacity === 0) return;
      [[bb.x, bb.y], [bb.x + bb.width, bb.y], [bb.x, bb.y + bb.height], [bb.x + bb.width, bb.y + bb.height]].forEach(function (c) {
        var x = m.a * c[0] + m.c * c[1] + m.e, y = m.b * c[0] + m.d * c[1] + m.f;
        u = u ? { l: Math.min(u.l, x), t: Math.min(u.t, y), r: Math.max(u.r, x), b: Math.max(u.b, y) } : { l: x, t: y, r: x, b: y };
      });
    });
    return u;
  }
  function figClear() {
    var p = D.getElementById("problem"), f = p && p.querySelector(":scope > .blocks > .fig:first-child"); if (!f) return;
    var phone = g.matchMedia && g.matchMedia("(max-width: 899px)").matches;
    var btn = p.querySelector(":scope > button.cluckbtn"), svg = f.querySelector("svg");
    var applies = on() && phone && p.classList.contains("qbr") && btn && svg;
    var push = 0;
    if (applies) {
      if (f.style.marginTop) f.style.marginTop = "";                       // measure from the CSS state (21px), then write once
      var r = btn.getBoundingClientRect(), ink = inkBox(svg);
      push = figPush(ink, { l: r.left, t: r.top, r: r.right, b: r.bottom }, CLEAR);
    }
    if (!applies) { f.style.marginTop = ""; return; }
    if (push) f.style.marginTop = "calc(21px + " + push + "px)";
  }
  var figRaf = 0;
  function figSoon() { if (!figRaf) figRaf = requestAnimationFrame(function () { figRaf = 0; figClear(); }); }
  g.stemFigClear = { push: figPush, ink: inkBox, run: figClear };
  function later() { if (!raf) raf = requestAnimationFrame(function () { raf = 0; build(); rowAlign(); anchor(); pinMeasure(); shortText(); figSoon(); scrims(); frost(); }); }

  function start() {
    var blocks = D.getElementById("blocks");
    if (!blocks) return;
    new MutationObserver(later).observe(blocks, { childList: true });
    new MutationObserver(figSoon).observe(blocks, { childList: true, subtree: true });   // the figure draws after the card builds
    var pr = D.getElementById("problem");
    if (pr) new MutationObserver(function () { requestAnimationFrame(rowAlign); }).observe(pr, { childList: true });
    if (pr) { pr.addEventListener("click", pinTap); if (g.ResizeObserver) new g.ResizeObserver(function () { if (!pinRaf) pinRaf = requestAnimationFrame(function () { pinRaf = 0; anchor(); pinMeasure(); figSoon(); scrims(); frost(); }); }).observe(pr); }   // a figure / font landing changes the offset
    g.addEventListener("scroll", pinSoon, { passive: true });   // the Ask Cluck button lands after build (cluckbtn.js)
    g.addEventListener("drill:problem", later); g.addEventListener("drill:bank", later); g.addEventListener("resize", function () { if (on()) later(); });
    if (D.fonts && D.fonts.ready) D.fonts.ready.then(later);
    later();
  }
  /* TITLE-EXAMQ: one shape for the exam prefix, read from titles.mjs (never a copy of its regex). Already loaded by app.js, so it resolves before the first card;
     when it lands late (or not at all) the card keeps today's look and the sweep below fixes a card already on screen. */
  import("../../pure_logic_modules/titles.mjs").then(function (m) {
    EXAM = m.examPrefix;
    var hs = D.querySelectorAll("#problem.qc7 .qhead");
    for (var i = 0; i < hs.length; i++) examSpan(hs[i]);
  }).catch(function () {});
  if (D.readyState === "loading") D.addEventListener("DOMContentLoaded", start); else start();
})(window);
