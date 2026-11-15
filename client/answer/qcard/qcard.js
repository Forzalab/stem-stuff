/* qcard.js: QCARD-SWISS v2, the question card redesign. BEHIND html.ui-v7 (fx.js, ?ui=v7). Flag off = this file touches nothing and the card is the one app.js draws.
   Flag on, after app.js render() fills #blocks (a MutationObserver on #blocks, so every re-render is covered):
   - HERO: the question sentence (the last sentence of the last text block) becomes the big title, bottom-left of a hero band on the card, with a dark bottom scrim
     (Spotify-style) for legibility; the card's small meta (sugar title + the Twist chip) is the small line under it (type ratio ~ a Swiss poster: big bold : small meta).
   - GHOST: the question number as an ECHO B numeral (6 Archivo 900 copies, step (-12,0) on x, opacity .7 .55 .42 .3 .2 .12 of --qa1, blur 0: the LITE tier) behind the text.
   - SETUP: the rest of the text blocks stay in order under the hero, folded to 3 lines with a "Show all" button when they are longer.
   Source: brain ui-polish/hintbox/v71/longq (DESIGN.md dir C), ui-v7-decisions QCARD-SWISS v2. Looks: qcard.css. The Twist chip is app.js twistChip (kept; moved into the meta row). */
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
    var n = plainLen(lead);
    lead.className += n <= 70 ? " l" : n <= 140 ? " m" : " s";
    return lead;
  }

  function number() {
    var a = D.querySelector("#qlist [aria-current] .qn");
    if (a && a.textContent.trim()) return a.textContent.trim();
    var c = ((D.getElementById("pcode") || {}).textContent || "").match(/(\d+)\D*$/);
    return c ? String(+c[1]) : "1";
  }
  function ghost(p) {
    var box = p.querySelector(":scope > .qghostbox");
    if (!box) {
      box = D.createElement("div"); box.className = "qghostbox"; box.setAttribute("aria-hidden", "true");
      var gh = D.createElement("div"); gh.className = "qghost";
      for (var k = 0; k < 6; k++) { var i = D.createElement("i"); i.style.setProperty("--k", k); gh.appendChild(i); }
      box.appendChild(gh); p.insertBefore(box, p.firstChild);
    }
    var num = number(), cur = box.firstChild;
    if (cur.getAttribute("data-n") !== num) { cur.setAttribute("data-n", num); for (var j = 0; j < cur.children.length; j++) cur.children[j].textContent = num; }
  }

  /* setup fold: > 3 lines (72px + a little for a tall fraction) -> clamp + "Show all" */
  function fit(blocks) {
    blocks.querySelectorAll(":scope > .qsetup").forEach(function (el) {
      var btn = el.nextElementSibling && el.nextElementSibling.classList.contains("qshow") ? el.nextElementSibling : null;
      var open = btn && btn.getAttribute("aria-expanded") === "true";
      if (open) return;
      el.classList.remove("qfold");
      var tall = el.scrollHeight > 80;
      el.classList.toggle("qfold", tall);
      if (tall && !btn) {
        btn = D.createElement("button"); btn.type = "button"; btn.className = "qshow"; btn.textContent = "Show all"; btn.setAttribute("aria-expanded", "false");
        btn.addEventListener("click", function () {
          var o = btn.getAttribute("aria-expanded") !== "true";
          btn.setAttribute("aria-expanded", o ? "true" : "false"); btn.textContent = o ? "Show less" : "Show all"; el.classList.toggle("qfold", !o);
        });
        el.after(btn);
      }
      if (btn) btn.hidden = !tall;
    });
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
    if (!blocks.querySelector(":scope > .qhero")) {
      var lead = takeLead(blocks);
      if (lead) {
        var hero = D.createElement("div"); hero.className = "qhero";
        hero.appendChild(lead);
        var meta = D.createElement("div"); meta.className = "qmeta";
        var t = blocks.querySelector(":scope > .ptitle");          // sugar title and/or the Twist chip (app.js twistChip): the small line under the title
        if (t) meta.appendChild(t);
        if (meta.children.length) hero.appendChild(meta);
        blocks.insertBefore(hero, blocks.firstChild);
        blocks.querySelectorAll(":scope > .md").forEach(function (m) { if (!m.classList.contains("qlead")) m.classList.add("qsetup"); });
      }
    }
    fit(blocks);
  }
  function later() { if (!raf) raf = requestAnimationFrame(build); }

  function start() {
    var blocks = D.getElementById("blocks");
    if (!blocks) return;
    new MutationObserver(later).observe(blocks, { childList: true });
    g.addEventListener("drill:problem", later); g.addEventListener("drill:bank", later); g.addEventListener("resize", function () { if (on()) later(); });
    if (D.fonts && D.fonts.ready) D.fonts.ready.then(later);
    later();
  }
  if (D.readyState === "loading") D.addEventListener("DOMContentLoaded", start); else start();
})(window);
