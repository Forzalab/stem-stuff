/* cluckbtn.js: the ONE Ask Cluck button (CLUCK-BTN, Tony Nov 14; brain ui-v7-decisions.md, RESEARCH.md option A). BEHIND html.ui-v7: flag off = this file adds nothing.
   One button at the top right of every question card (#problem: all types, multi-part and MC included). It replaces every old entry (popover chip, verdict-slot duck, strip drawer chip,
   "Explain my mistake" chip, the "Cluck lives in Ask Cluck" toast); cluck.js draws none of them under the flag. Look: the glossary popover's chip (duck + "Ask Cluck", navy, no border,
   a very slight raise), roomier, >= 44px, floated right so the question text wraps beside it (space reserved, no overlap).
   States (aria-disabled, never the disabled attribute, never pointer-events:none; RESEARCH option A #141d36 / #7a8aae, no raise):
     first = before the first try      -> "Cluck unlocks after your first try."
     off   = no key / diet / out of asks / not a Cluck question -> "Cluck isn't available here."   (hover on desktop, tap on a phone, Enter / Space: a note from the toast family)
     ready = a press does what the old chip did (cluck.js window.stemCluckAsk.enter)
   disabled -> ready: the fill sweeps in left to right, 240 ms ease-out (a scaleX layer); reduced motion = instant (cluckbtn.css).
   Sheen: window.stemCluckBtn.sheen(why) plays one light sweep + a small spring (the streak WAVE's 0.9 s feel, progbar.js) whenever something happens where an old entry used to appear:
     wrong (a wrong try unlocked Cluck) · right / out (the steps are ready, app.js cueChip) · reply (Cluck's reply finished while the sheet is closed) ·
     Jev: jev-s6 (help-avoidance nudge), jev-stuck (the "stuck? ask me" duck), jev-open-help (the "Let me help you" modal opened the panel). Only while ready; none with reduced motion.
   Reads cluck.js through window.stemCluckAsk { state, enter }; writes <html class="cluck-ready"> (app.css keeps the orange "Cluck has help here" dot on it). */
(function (g) {
  "use strict";
  var D = g.document, H = D.documentElement, btn = null, why = null, raf = 0, enabledAt = 0, sheenT = 0, endT = 0;
  var MSG = { first: "Cluck unlocks after your first try.", off: "Cluck isn't available here." };
  var on = function () { return H.classList.contains("ui-v7"); };
  var reduced = function () { try { return g.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; } };
  var ask = function () { return g.stemCluckAsk || null; };
  var state = function () { var a = ask(); try { return a ? a.state() : "off"; } catch (e) { return "off"; } };

  function build() {
    btn = D.createElement("button");
    btn.type = "button"; btn.id = "cluckBtn"; btn.className = "cluckbtn";
    btn.setAttribute("aria-describedby", "cluckWhy");
    btn.innerHTML = '<svg class="cb-duck" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="#i-duck"/></svg><span class="cb-t">Ask Cluck</span>';
    why = D.createElement("span"); why.id = "cluckWhy"; why.className = "sr-only";
    btn.append(why);
    btn.addEventListener("click", press);
    btn.addEventListener("pointerenter", function (e) { if (e.pointerType === "mouse" && locked()) tell(); });   // desktop: hover; a phone has no hover, its tap is the click
    btn.addEventListener("animationend", function (e) { if (/^cb-/.test(e.animationName)) btn.classList.remove("cb-sheen"); });
  }
  var locked = function () { return !!btn && btn.getAttribute("aria-disabled") === "true"; };
  function tell() {
    var T = g.stemToast, st = btn && btn.getAttribute("data-st");
    if (T && T.note && st && MSG[st]) T.note({ text: MSG[st], at: btn, ms: 2400, prefer: "under" });
  }
  function press(e) {
    if (locked()) { e.preventDefault(); tell(); return; }
    var a = ask(); if (a) a.enter();
  }
  function mount() {
    var h = D.getElementById("problem");
    if (!h) return null;
    if (!btn) build();
    if (btn.parentNode !== h) h.insertBefore(btn, h.firstChild);
    return btn;
  }
  function sync() {
    raf = 0;
    if (!on()) { if (btn && btn.isConnected) btn.remove(); H.classList.remove("cluck-ready"); return; }
    var b = mount(); if (!b) return;
    var st = state(), was = b.getAttribute("data-st");
    if (was !== st) {
      b.setAttribute("data-st", st);
      if (st === "ready") { b.removeAttribute("aria-disabled"); enabledAt = Date.now(); } else b.setAttribute("aria-disabled", "true");
      why.textContent = MSG[st] || "";
    }
    H.classList.toggle("cluck-ready", st === "ready");
  }
  function later() { if (!raf) raf = requestAnimationFrame(sync); }
  function sheen(reason) {
    if (!on() || !btn || reduced() || state() !== "ready") return;
    sync();
    clearTimeout(sheenT);
    sheenT = setTimeout(function () {                     // just unlocked: let the fill sweep in first, then the light passes over it
      if (!btn || locked()) return;
      btn.classList.remove("cb-sheen"); void btn.offsetWidth; btn.classList.add("cb-sheen"); btn.dataset.sheen = reason || "";
      clearTimeout(endT); endT = setTimeout(function () { if (btn) btn.classList.remove("cb-sheen"); }, 1100);   // animationend does not fire if the media query flips mid-sweep
    }, Math.max(0, 260 - (Date.now() - enabledAt)));
  }
  function start() {
    if (!on()) return;
    var root = D.getElementById("freezeIn") || D.body;
    new MutationObserver(function (recs) {
      for (var i = 0; i < recs.length; i++) if (!btn || !btn.contains(recs[i].target)) { later(); return; }
    }).observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ["class", "hidden"] });
    g.addEventListener("drill:problem", later); g.addEventListener("drill:bank", later);
    later();
  }
  g.stemCluckBtn = { sync: function () { if (!raf) raf = requestAnimationFrame(sync); }, sheen: sheen, get el() { return btn; } };
  if (D.readyState === "loading") D.addEventListener("DOMContentLoaded", start); else start();
})(window);
