/* The answer strip, typed answers (B3 PR-B1; strip.css; STYLE §2.7 §2.8 §3 "Strip ship spec"; Tony "ship it", Nov 2).
   A verdict on a typed answer (num / expr / graph / proof) in a sugar bank with Cluck's key opens a cabinet DRAWER under the answer bar:
   [Ask Cluck] + a close. This file owns it end to end and talks to app.js only through the DOM, so app.js needs no call-in:
     reads   #q #ff.ff (.ok / .bad / .vk, #q.closed), #wish .wchip (or the chip rboxSync docked in the field), window.__drill.state
     writes  one <div class="vdrawer rbox"> as the bar's SIBLING (after the bar and its try pips), the chip moved into it, class .strip on the bar,
             role/aria on the verdict icon (.vk). The drawer carries class "rbox" so app.js's `:is(#wish, .rbox) .wchip` lookups find the chip there.
   Opens on a new verdict (animated when it lands live, instant when a closed question is restored); closes on the close button, Esc, a tap outside,
   or when the student edits the box; the verdict icon reopens it. No Cluck key / diet / mc / multi: no chip, so no drawer and nothing changes.
   Check and the labelled Next are NOT here: they stay in the Check slot until the finger bar (PR-C). */
(function () {
  "use strict";
  var D = document, $ = function (s) { return D.querySelector(s); };
  var seen = new WeakMap();                                   // bar -> { key, open }: one entry per rendered bar, gone with it
  var drawer = null, shutT = 0, queued = false;
  var CHEV = '<svg class="ico" aria-hidden="true"><use href="#i-down"/></svg>';
  var WORDS = { "Explain my mistake": "Ask Cluck", "See Cluck's steps": "See steps" };   // STYLE §5: the drawer's labels (the chips keep their full names for screen readers)

  var state = function () { return window.__drill && window.__drill.state; };
  function verdict(q, ff) {
    if (ff.classList.contains("ok")) return "ok";
    if (q.classList.contains("closed")) return "lock";
    if (ff.classList.contains("bad")) return "wrong";
    return "";
  }
  function relabel(chip) {
    var spans = chip.querySelectorAll(":scope > span:not(.rw-coin2)"), lab = spans[spans.length - 1];
    var tn = lab && lab.firstChild && lab.firstChild.nodeType === 3 ? lab.firstChild : null;
    if (!tn || !WORDS[tn.data.trim()]) return;
    if (!chip.hasAttribute("aria-label")) chip.setAttribute("aria-label", tn.data.trim());
    tn.data = WORDS[tn.data.trim()];
  }
  function anchor(ff) { var n = ff.nextElementSibling; return n && n.classList.contains("pips") ? n : ff; }   // pips() inserts right after the bar and removes ff.nextElementSibling if it is a .pips
  function make(ff) {
    var d = D.createElement("div");
    d.className = "vdrawer rbox"; d.setAttribute("role", "group"); d.setAttribute("aria-label", "Cluck");
    d.innerHTML = '<button type="button" class="btn vd-x" aria-label="Close help">' + CHEV + "</button>";
    d.querySelector(".vd-x").addEventListener("click", function () { close(true); });
    anchor(ff).after(d);
    return d;
  }
  function place(ff, d) {                                     // 2/3 of the bar, right-aligned, top tucked 8px under it; both are children of one parent, so offsets share a frame
    var w = ff.offsetWidth, dw = Math.round(w * 2 / 3);
    d.style.width = dw + "px";
    if (!d.hidden && d.scrollWidth > d.clientWidth + 1) dw = Math.min(w, d.scrollWidth + 2);   // the label keeps its words: a narrow bar (360, Next beside it) widens the drawer past 2/3
    d.style.width = dw + "px"; d.style.left = ff.offsetLeft + w - dw + "px"; d.style.top = ff.offsetTop + ff.offsetHeight - 8 + "px";
  }
  function show(d, still) {
    clearTimeout(shutT);
    d.classList.remove("vd-shut"); d.classList.toggle("vd-still", !!still);
    d.hidden = false;
  }
  function hide(d, instant) {
    clearTimeout(shutT);
    if (d.hidden) return;
    if (instant || getComputedStyle(d).animationName === "none" || matchMedia("(prefers-reduced-motion: reduce)").matches) { d.hidden = true; d.classList.remove("vd-shut"); return; }
    d.classList.add("vd-shut");
    shutT = setTimeout(function () { d.hidden = true; d.classList.remove("vd-shut"); }, 260);   // 240ms + a frame; animationend would not fire on a hidden tab
  }
  function drop() {                                           // no drawer wanted: tear it down, put nothing back
    if (!drawer) return;
    var d = drawer; drawer = null; clearTimeout(shutT);
    var ff = $("#q #ff.ff"); if (ff) { ff.classList.remove("strip"); icon(ff, false, false); }
    d.remove();
  }
  function icon(ff, on, open) {                               // the verdict icon is the way back (aria-expanded)
    var vk = ff.querySelector(".vk"); if (!vk) return;
    if (!on) { ["role", "tabindex", "aria-expanded", "aria-label"].forEach(function (a) { vk.removeAttribute(a); }); vk.setAttribute("aria-hidden", "true"); return; }
    vk.removeAttribute("aria-hidden");
    vk.setAttribute("role", "button"); vk.setAttribute("tabindex", "0");
    vk.setAttribute("aria-label", open ? "Hide Cluck's help" : "Show Cluck's help");
    vk.setAttribute("aria-expanded", open ? "true" : "false");
  }

  function sync() {
    queued = false;
    var q = $("#q"), ff = q && $("#q #ff.ff"), S = state();
    if (!ff || !S || !S.prob || S.prob.type === "mc" || S.prob.type === "multi" || S.wl) { drop(); return; }
    var v = verdict(q, ff), wish = $("#wish");
    var key = S.code + "|" + S.tries.length + "|" + v, st = seen.get(ff);
    if (!st) { st = { key: v ? null : key, open: false, still: !!v }; seen.set(ff, st); }   // first sight: a bar that already has a verdict is a restored question
    var fresh = ff.querySelector(":scope > .wchip") || $("#wish .wbar .wchip");
    var docked = drawer && drawer.querySelector(".wchip");
    var chip = fresh || docked;
    if (!v || !chip) {                                        // nothing to say yet, or nothing to host (diet, no key, Cluck's text already streaming)
      if (!drawer) return;
      if (!chip) { drop(); return; }
      if (!drawer.hidden && !drawer.classList.contains("vd-shut")) { hide(drawer); icon(ff, false, false); if (ff.classList.contains("strip")) ff.classList.remove("strip"); }
      return;
    }
    if (drawer && !drawer.isConnected) drawer = null;
    if (!drawer) drawer = make(ff);
    else if (drawer.previousElementSibling !== anchor(ff)) anchor(ff).after(drawer);
    if (fresh && fresh !== docked) {                          // a fresh chip from wishPaint / rboxSync replaces the one docked before
      if (docked) docked.remove();
      relabel(fresh);
      drawer.insertBefore(fresh, drawer.querySelector(".vd-x"));
      var wb = $("#wish .wbar"); if (wb && !wb.children.length) wb.remove();
    }
    chip = drawer.querySelector(".wchip");
    var hid = !!(wish && wish.hidden);                        // desktop with Cluck's sheet open: #wish is hidden and so is its chip (wishPaint)
    if (chip.hidden !== hid) chip.hidden = hid;
    if (!ff.classList.contains("strip")) ff.classList.add("strip");   // guarded: a no-op classList.add still queues a mutation record, which would loop
    drawer.dataset.st = v;
    if (st.key !== key) {                                     // a new verdict: the drawer opens. Live it slides out; a closed question restored at first sight opens at rest
      if (st.key !== null) st.still = false;
      st.key = key; st.open = true;
    }
    var want = st.open && !chip.hidden;
    if (want && drawer.hidden) show(drawer, st.still);
    else if (!want && !drawer.hidden) hide(drawer);
    place(ff, drawer);
    icon(ff, true, want);
  }
  function later() { if (!queued) { queued = true; queueMicrotask(sync); } }

  function close(focus) {
    var ff = $("#q #ff.ff"), st = ff && seen.get(ff);
    if (!drawer || !st) return;
    st.open = false; hide(drawer); icon(ff, true, false);
    if (focus) { var vk = ff.querySelector(".vk"); if (vk) vk.focus({ preventScroll: true }); }
  }
  function toggle() {
    var ff = $("#q #ff.ff"), st = ff && seen.get(ff);
    if (!drawer || !st) return;
    if (st.open && !drawer.hidden) { close(false); return; }
    st.open = true; st.still = false; sync();
  }

  D.addEventListener("click", function (e) {
    var vk = e.target.closest && e.target.closest("#q #ff .vk[role=button]");
    if (vk) { e.preventDefault(); toggle(); }
  });
  D.addEventListener("keydown", function (e) {
    var vk = e.target.closest && e.target.closest("#q #ff .vk[role=button]");
    if (vk && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); toggle(); return; }
    if (e.key === "Escape" && drawer && !drawer.hidden && !(window.stemCluckOpen && window.stemCluckOpen())) close(true);
  });
  D.addEventListener("pointerdown", function (e) {            // a tap outside closes it (POPOVER rule); the drawer and the verdict icon are inside
    if (!drawer || drawer.hidden || drawer.classList.contains("vd-shut")) return;
    var t = e.target; if (!t || !t.closest) return;
    if (drawer.contains(t) || t.closest("#q #ff .vk")) return;
    close(false);
  }, true);
  D.addEventListener("input", function (e) {                  // editing the box starts a new try: the old verdict's drawer goes
    if (!drawer || drawer.hidden || !e.target.closest || !e.target.closest("#q #ff")) return;
    close(false);
  }, true);

  var mo = new MutationObserver(function (recs) {
    for (var i = 0; i < recs.length; i++) {
      var t = recs[i].target, el = t.nodeType === 1 ? t : t.parentElement;
      if (el && el.closest && el.closest("#q, #wish") && !(drawer && drawer.contains(el))) { later(); return; }
    }
  });
  function start() {
    mo.observe(D.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["class", "hidden", "data-v"] });
    addEventListener("resize", function () { var ff = $("#q #ff.ff"); if (ff && drawer && !drawer.hidden) place(ff, drawer); });
    if (window.ResizeObserver) new ResizeObserver(function () { var ff = $("#q #ff.ff"); if (ff && drawer && !drawer.hidden) place(ff, drawer); }).observe($("#q"));
    if (D.fonts && D.fonts.ready) D.fonts.ready.then(function () { var ff = $("#q #ff.ff"); if (ff && drawer && !drawer.hidden) place(ff, drawer); });
    later();
  }
  if (D.readyState === "loading") D.addEventListener("DOMContentLoaded", start); else start();
  window.stemStrip = { sync: sync, close: function () { close(false); }, get open() { return !!drawer && !drawer.hidden; } };
})();
