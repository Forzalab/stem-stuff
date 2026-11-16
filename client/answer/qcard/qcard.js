/* qcard.js: QCARD-SWISS v3, the question card redesign. BEHIND html.ui-v7 (fx.js, ?ui=v7). Flag off = this file touches nothing and the card is the one app.js draws.
   Flag on, after app.js render() fills #blocks (a MutationObserver on #blocks, so every re-render is covered), top to bottom on ONE card background:
   - GHOST: the question number as an ECHO numeral (6 Archivo 900 copies, step -12px x) at the card top; on a prev/next change the trail copies slide in (qcard.css .qanim, compositor only).
   - the figure(s), then the topic headline (the sugar title, lowercase), then ONE text block: the setup, then the question sentence (the last sentence of the last text block,
     kept bold); only the setup scrolls inside past a max height (the question stays fully visible, no Show all), then the small meta row: exam . q#, the Twist chip (app.js twistChip).
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
  /* ONLY the setup scrolls (div.qscroll, max height in qcard.css); the question sentence sits below it, always fully visible. Focusable when it overflows;
     a 16px fade at the top / bottom edge shows only where content is hidden (.qft / .qfb) */
  function fades(t) {
    t.classList.toggle("qft", t.scrollTop > 1);
    t.classList.toggle("qfb", t.scrollTop + t.clientHeight < t.scrollHeight - 1);
  }
  function scrollable(t) {
    var over = t.scrollHeight > t.clientHeight + 1;
    if (over) { t.tabIndex = 0; t.setAttribute("role", "region"); t.setAttribute("aria-label", "Question setup"); } else { t.removeAttribute("tabindex"); t.removeAttribute("role"); t.removeAttribute("aria-label"); }
    if (!t.hasAttribute("data-f")) { t.setAttribute("data-f", "1"); t.addEventListener("scroll", function () { fades(t); }, { passive: true }); }
    fades(t);
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
          var title = Array.prototype.filter.call(pt.childNodes, function (n) { return n.nodeType === 3; }).map(function (n) { return n.nodeValue; }).join("").trim();
          if (title) { head = D.createElement("h2"); head.className = "qhead"; head.textContent = title; }
        }
        var tx = D.createElement("div"); tx.className = "qtext";
        if (texts.length) { var sc = D.createElement("div"); sc.className = "qscroll"; texts.forEach(function (c) { sc.appendChild(c); }); tx.appendChild(sc); }
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
    var mm = blocks.querySelector(":scope > .qmeta"), tt = blocks.querySelector(":scope > .qtext");
    if (mm) meta(mm);
    var sc2 = tt && tt.querySelector(":scope > .qscroll"); if (sc2) scrollable(sc2);
  }
  /* ROW-ALIGN (Tony Nov 16, option B, every bank): a title-first card shares one row with the Ask Cluck float. The title reserves the button's MEASURED width
     (--cbw) + a gap; the button keeps its own size and drops so its BOTTOM sits on the title's last line (1, 2, 3+ lines alike). No title first / flag off = reset. */
  var ro = null;
  function rowAlign() {   // KICKER-C (Tony Nov 16): one layout (kicker row = code + Ask Cluck, then the headline); the old beside/stack measuring is retired, this only clears its leftovers and writes the code
    var p = D.getElementById("problem"), b = p && p.querySelector(":scope > .cluckbtn"), t = p && p.querySelector(":scope > .blocks > :is(.ptitle, .qhead):first-child");
    if (!p) return;
    if (b) b.style.marginTop = ""; if (t) t.style.paddingTop = ""; p.classList.remove("qstack"); p.style.removeProperty("--cbw");
    var c = D.getElementById("pcode"); p.dataset.code = c ? c.textContent.trim() : "";
  }
  /* Q-FOLD (Tony Nov 16): the chevron is a real button: tap = expand the card to full height; at the foot a reversed chevron collapses it (scrolls the card top back into view) */
  function foldBtn(p) {
    var b = p.querySelector(":scope > .qfold");
    if (!b) {
      b = D.createElement("button"); b.type = "button"; b.className = "qfold"; b.setAttribute("aria-label", "Show the whole question"); b.setAttribute("aria-expanded", "false");
      b.innerHTML = '<svg viewBox="0 0 20 12" width="20" height="12" aria-hidden="true"><path d="M2 2l8 8 8-8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      b.addEventListener("click", function (e) {
        e.stopPropagation();
        var open = !p.classList.contains("qopen"); p.classList.toggle("qopen", open);
        b.setAttribute("aria-expanded", String(open)); b.setAttribute("aria-label", open ? "Fold the question" : "Show the whole question");
        if (!open) { p.scrollTop = 0; var r = p.getBoundingClientRect(); if (r.top < 0) g.scrollBy({ top: r.top - 16, behavior: "smooth" }); }
        requestAnimationFrame(qmore);
      });
      p.appendChild(b);
    }
    return b;
  }
  function qmore() {
    var p = D.getElementById("problem"); if (!p) return;
    if (!on()) { p.classList.remove("qmore", "qopen"); return; }
    var open = p.classList.contains("qopen");
    var over = p.scrollHeight - p.clientHeight > 4, more = !open && over && p.scrollHeight - p.scrollTop - p.clientHeight > 4;
    p.classList.toggle("qmore", more);
    if (more || open || over) foldBtn(p).hidden = !(more || open); else { var b = p.querySelector(":scope > .qfold"); if (b) b.hidden = true; }
  }
  function later() { if (!raf) raf = requestAnimationFrame(function () { raf = 0; var pp = D.getElementById("problem"); if (pp && pp.dataset.qfor !== location.hash) { pp.dataset.qfor = location.hash; pp.classList.remove("qopen"); } build(); rowAlign(); qmore(); }); }

  function start() {
    var blocks = D.getElementById("blocks");
    if (!blocks) return;
    new MutationObserver(later).observe(blocks, { childList: true });
    var pr = D.getElementById("problem"); if (pr) pr.addEventListener("scroll", qmore, { passive: true });
    if (pr) new MutationObserver(function () { requestAnimationFrame(rowAlign); }).observe(pr, { childList: true });   // the Ask Cluck button lands after build (cluckbtn.js)
    g.addEventListener("drill:problem", later); g.addEventListener("drill:bank", later); g.addEventListener("resize", function () { if (on()) later(); });
    if (D.fonts && D.fonts.ready) D.fonts.ready.then(later);
    later();
  }
  if (D.readyState === "loading") D.addEventListener("DOMContentLoaded", start); else start();
})(window);
