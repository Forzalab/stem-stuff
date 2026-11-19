/* qcard.js: QCARD-SWISS v3, the question card redesign. BEHIND html.ui-v7 (fx.js, ?ui=v7). Flag off = this file touches nothing and the card is the one app.js draws.
   Flag on, after app.js render() fills #blocks (a MutationObserver on #blocks, so every re-render is covered), top to bottom on ONE card background:
   - GHOST: the question number as an ECHO numeral (6 Archivo 900 copies, step -12px x) at the card top; on a prev/next change the trail copies slide in (qcard.css .qanim, compositor only).
   - the figure(s), then the topic headline (the sugar title, lowercase), then ONE text block: the setup, then the question sentence (the last sentence of the last text block,
     kept bold); no fold and no inner scroller (ICK PR-A: the card is as tall as its text and the page scrolls), then the small meta row: exam . q#, the Twist chip (app.js twistChip).
   - ASK-PIN (ICK PR-A, F1): on a long card the page scrolls it away until only its last strip, the bold ask, is left; that strip stays pinned at the top, a tap on it scrolls back to the full question.
   Source: brain ui-polish/hintbox/v71/longq (DESIGN.md), ui-v7-decisions QCARD-SWISS v3 (owner picked V3). Looks: qcard.css. */
(function (g) {
  "use strict";
  var D = g.document, H = D.documentElement;
  var on = function () { return H.classList.contains("ui-v7"); };
  var ABBR = /(?:\be\.g|\bi\.e|\bvs|\bet al|\bDr|\bMr|\bMrs|\bMs|\bFig|\bapprox|\bNo|\b[A-Z])\.$/;
  var raf = 0;

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

  function exam() { var n = D.getElementById("qlistName"); return n ? n.textContent.trim() : ""; }
  function span(cls, txt) { var e = D.createElement("span"); e.className = cls; e.textContent = txt; return e; }
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
          if (kids.some(function (n) { return (n.textContent || "").trim(); })) { head = D.createElement("h2"); head.className = "qhead"; kids.forEach(function (n) { head.appendChild(n.cloneNode(true)); }); }
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
  function later() { if (!raf) raf = requestAnimationFrame(function () { raf = 0; build(); rowAlign(); anchor(); pinMeasure(); shortText(); }); }

  function start() {
    var blocks = D.getElementById("blocks");
    if (!blocks) return;
    new MutationObserver(later).observe(blocks, { childList: true });
    var pr = D.getElementById("problem");
    if (pr) new MutationObserver(function () { requestAnimationFrame(rowAlign); }).observe(pr, { childList: true });
    if (pr) { pr.addEventListener("click", pinTap); if (g.ResizeObserver) new g.ResizeObserver(function () { if (!pinRaf) pinRaf = requestAnimationFrame(function () { pinRaf = 0; anchor(); pinMeasure(); }); }).observe(pr); }   // a figure / font landing changes the offset
    g.addEventListener("scroll", pinSoon, { passive: true });   // the Ask Cluck button lands after build (cluckbtn.js)
    g.addEventListener("drill:problem", later); g.addEventListener("drill:bank", later); g.addEventListener("resize", function () { if (on()) later(); });
    if (D.fonts && D.fonts.ready) D.fonts.ready.then(later);
    later();
  }
  if (D.readyState === "loading") D.addEventListener("DOMContentLoaded", start); else start();
})(window);
