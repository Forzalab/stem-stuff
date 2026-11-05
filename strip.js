/* The answer strip: typed answers (B3 PR-B1) + multiple choice, pick-all and multi-part (PR-B2) ( strip.css; STYLE §2.7 §2.8 §3 "Strip ship spec"; Tony "ship it", Nov 2).
   A verdict on a typed answer (num / expr / graph / proof) in a sugar bank with Cluck's key opens a cabinet DRAWER under the answer bar:
   [Ask Cluck] + a close. This file owns it end to end and talks to app.js only through the DOM, so app.js needs no call-in:
     reads   #q #ff.ff (.ok / .bad / .vk, #q.closed), #wish .wchip (or the chip rboxSync docked in the field), window.__drill.state
     writes  one <div class="vdrawer rbox"> as the bar's SIBLING (after the bar and its try pips), the chip moved into it, class .strip on the bar,
             role/aria on the verdict icon (.vk). The drawer carries class "rbox" so app.js's `:is(#wish, .rbox) .wchip` lookups find the chip there.
   Opens on a new verdict (animated when it lands live, instant when a closed question is restored); closes on the close button, Esc, a tap outside,
   or when the student edits the box; the verdict icon reopens it. No Cluck key / diet / mc / multi: no chip, so no drawer and nothing changes.
   Check and the labelled Next stay in the Check slot until the finger bar (PR-C).
   PR-B2 hosts (kind): ff = a typed bar or a multi part's box; row = single mc's picked .ch (the drawer follows .choices, never a child of it: fitChoices counts .choices' children) and carries [Ask Cluck][Skip | Next][^] spanning the row; list = pick-all's .chk row (drawer under the whole list).
   mc / pick-all have no verdict icon: a transparent .vkb button over the row's mark (the right-hand check / cross, or pick-all's square) reopens it, and the
   first time a student closes it a one-time toast teaches that. Multi: one chip per question, so one drawer that moves to the part whose verdict is newest
   (or whose icon was tapped). */
(function () {
  "use strict";
  var D = document, $ = function (s) { return D.querySelector(s); };
  var seen = new WeakMap();                                   // host -> { key, open, still }: one entry per rendered host, gone with it
  var drawer = null, owner = null, shutT = 0, queued = false;  // owner = the host element the (single) drawer hangs from
  var CHEV = '<svg class="ico" aria-hidden="true"><use href="#i-down"/></svg>';
  var WORDS = { "Explain my mistake": "Ask Cluck", "See Cluck's steps": "See steps" };   // STYLE §5: the drawer's labels (the chips keep their full names for screen readers)
  var TIP_KEY = "stem-strip-badge", TIP = "Tap the badge to bring Cluck back.";

  var state = function () { return window.__drill && window.__drill.state; };
  function verdict(q, ff) {
    if (ff.classList.contains("ok")) return "ok";
    if (q.classList.contains("closed")) return "lock";
    if (ff.classList.contains("bad")) return "wrong";
    return "";
  }
  /* every host the question can hang a drawer from, with its verdict ("" = none yet) and n = the verdict's try count (a new n or v = a new verdict) */
  function hostsOf(q, S) {
    var p = S.prob, out = [], fin = !!S.finished, won = function () { return S.tries.some(function (x) { return x.v === "correct"; }); };
    if (p.type === "multi") {
      q.querySelectorAll(".mparts .part").forEach(function (part, i) {
        var ff = part.querySelector(":scope > .ff"), vk = ff && ff.querySelector(".vk"), dv = vk && vk.dataset.v;
        if (ff) out.push({ el: ff, at: ff, kind: "ff", v: !vk ? "" : dv === "i-ok" ? "ok" : dv === "i-lock" ? "lock" : "wrong", ic: vk, n: S.tries.filter(function (x) { return x.part === i; }).length });
      });
    } else if (p.type === "mc") {
      var many = !!q.querySelector(".choices.all"), g = q.querySelector(".choices");
      if (many) {                                             // pick-all: the .chk row (Check / Next slot) is the bar; the drawer hangs under the whole list
        var chk = q.querySelector(".chk"), bad = q.querySelector(".opt.wrong"), t = S.tries[S.tries.length - 1];
        if (chk) out.push({ el: chk, at: chk, kind: "list", v: fin ? (won() ? "ok" : "lock") : t && t.v === "wrong" && bad ? "wrong" : "", n: S.tries.length, g: g });
      } else if (g) {                                         // single: the picked row
        var t1 = S.tries[S.tries.length - 1], row = t1 && [].find.call(q.querySelectorAll(".ch"), function (c) { return c.dataset.id === String(t1.c); }) || q.querySelector(".ch:has(.opt.right)");
        var o = row && row.querySelector(".opt"), v = !o ? "" : o.classList.contains("right") && !o.classList.contains("reveal") ? "ok" : o.classList.contains("wrong") ? (fin ? "lock" : "wrong") : "";
        if (row) out.push({ el: row, at: g.classList.contains("inline") ? g : row, after: g, g: g, kind: "row", v: v, n: S.tries.length, row: row });
      }
    } else {
      var ff1 = q.querySelector("#ff.ff");
      if (ff1) out.push({ el: ff1, at: ff1, kind: "ff", v: verdict(q, ff1), ic: ff1.querySelector(".vk"), n: S.tries.length });
    }
    return out;
  }
  function relabel(chip) {
    var spans = chip.querySelectorAll(":scope > span:not(.rw-coin2)"), lab = spans[spans.length - 1];
    var tn = lab && lab.firstChild && lab.firstChild.nodeType === 3 ? lab.firstChild : null;
    if (!tn || !WORDS[tn.data.trim()]) return;
    if (!chip.hasAttribute("aria-label")) chip.setAttribute("aria-label", tn.data.trim());
    tn.data = WORDS[tn.data.trim()];
  }
  function anchor(at) { var n = at.nextElementSibling; return n && n.classList.contains("pips") ? n : at; }   // pips() inserts right after the bar and removes at.nextElementSibling if it is a .pips
  function fxPlaying() { return D.documentElement.classList.contains("fx-busy") || !!D.querySelector(".fx-ov"); }   // a reward overlay (a level-up burst) is still playing: the slide would be a second animation group (blink-fx: one at a time), so the drawer just appears
  function make(h) {
    var d = D.createElement("div");
    d.className = "vdrawer rbox" + (fxPlaying() ? " vd-still" : ""); d.setAttribute("role", "group"); d.setAttribute("aria-label", "Cluck");
    d.innerHTML = '<button type="button" class="btn vd-x" aria-label="Close help">' + CHEV + "</button>";   // no Next in the tray (Tony, Nov 3 18:41; NOTES v9: "tray has no Next"): Next is the row's / the bar's
    d.querySelector(".vd-x").addEventListener("click", function () { close(true, true); });
    anchor(h.after || h.at).after(d);
    d.dataset.kind = h.kind;
    return d;
  }
  /* Tony, Nov 4 (live #415 shots 1-3): the tray SLIPS FROM UNDER the answer box, anchored to its BOTTOM-LEFT: left edge = the box's left edge, top tucked behind the box's bottom edge.
     The box = the typed bar plus its verdict line (.ansl, when it sits below the bar), or the whole choices list (mc / choose-all). The tray takes its flow room only while it is
     shown (a .vd-room spacer right after the box, gone with the tray: no orphan gap); what comes later (the choose-all Next row) is pushed down below it, never under it. */
  var room = null;
  function boxOf(h) {
    var b = boxOf1(h);
    if (D.documentElement.classList.contains("proof-split")) { b.free = true; b.after = null; }   // the proof pane (#418) is a scrolling flex column that already keeps room under the bar (#q:has(> #ff.strip) padding-bottom): a spacer there would resize the growing box
    return b;
  }
  function boxOf1(h) {                                         // the box the tray hangs from: its left, width, bottom, the element the room goes after, and how far the top tucks behind the bottom edge
    var g = h.g, at = h.at, pv = h.kind === "ff" && at.id === "ff" ? D.querySelector("#q #preview") : null;
    if (g) return { left: g.offsetLeft, w: g.offsetWidth, bottom: g.offsetTop + g.offsetHeight, after: h.kind === "row" ? null : g, tuck: 2 };   // a single mc's drawer already sits right after the list (sync keeps it there): its room goes after the drawer, or the two would keep swapping places
    if (pv && pv.querySelector(".ansl") && pv.getClientRects().length) return { left: at.offsetLeft, w: at.offsetWidth, bottom: pv.offsetTop + pv.offsetHeight, after: pv, tuck: 0 };   // the verdict line is part of the box: the tray starts under its text
    return { left: at.offsetLeft, w: at.offsetWidth, bottom: at.offsetTop + at.offsetHeight, after: null, tuck: 2, free: true };   // a bar with no verdict line under it (a wrong try): the tray may lie over what is below it (Tony, Nov 3 19:31), no room is kept
  }
  function reserve(after, d, h) {                             // flow room for the open tray (it is absolute): a spacer after the box, the tray's height less its tuck, + the 8px the row below has
    if (!room) { room = D.createElement("div"); room.className = "vd-room"; room.setAttribute("aria-hidden", "true"); }
    var anchorEl = after || d;
    if (room.previousElementSibling !== anchorEl || !room.isConnected) anchorEl.after(room);
    room.style.height = Math.max(0, d.offsetHeight - h) + 8 + "px";
  }
  function unreserve() { if (room) { room.remove(); room = null; } }
  function place(h, d) {
    var b = boxOf(h), w = b.w, dw = h.kind === "row" ? w : Math.round(w * 2 / 3);
    d.style.width = dw + "px";
    if (!d.hidden && d.scrollWidth > d.clientWidth + 1) dw = Math.min(w, d.scrollWidth + 2);   // the label keeps its words: a narrow bar (360, Next beside it) widens the drawer past 2/3
    d.style.width = dw + "px"; d.style.left = b.left + "px"; d.style.top = b.bottom - b.tuck + "px";
    d.style.setProperty("--vd-tuck", b.tuck + "px");
    if (!d.hidden && !b.free) reserve(b.after, d, b.tuck); else unreserve();
  }
  function show(d, still) {
    clearTimeout(shutT);
    d.classList.remove("vd-shut"); d.classList.toggle("vd-still", !!still || fxPlaying());
    d.hidden = false;
  }
  /* only the host that owns the OPEN drawer is lifted above it (.vd-host, z 3); every other verdict host (.strip) stays under it, so the tray may lie over the rows
     below (Tony, Nov 3 19:31) and no stale host paints over it. It drops when the drawer is gone: nothing stays lifted after the tray shuts. */
  function unlift() { D.querySelectorAll("#q .vd-host").forEach(function (e) { e.classList.remove("vd-host"); }); unreserve(); }
  function hide(d, instant) {
    clearTimeout(shutT);
    if (d.hidden) return;
    if (instant || getComputedStyle(d).animationName === "none" || matchMedia("(prefers-reduced-motion: reduce)").matches) { d.hidden = true; d.classList.remove("vd-shut"); unlift(); return; }
    d.classList.add("vd-shut");
    shutT = setTimeout(function () { d.hidden = true; d.classList.remove("vd-shut"); unlift(); }, 260);   // 240ms + a frame; animationend would not fire on a hidden tab
  }
  function clean() {                                          // strip every mark the strip put on the question
    D.querySelectorAll("#q .strip").forEach(function (e) { e.classList.remove("strip"); });
    unlift();
    D.querySelectorAll("#q .vkb").forEach(function (e) { e.remove(); });
    D.querySelectorAll("#q .ff .vk").forEach(function (e) { icon({ ic: e, kind: "ff" }, false, false); });
  }
  function drop() {                                           // no drawer wanted: tear it down, put nothing back
    if (!drawer) return;
    var d = drawer; drawer = null; owner = null; clearTimeout(shutT);
    clean(); d.remove();
  }
  function icon(h, on, open) {                                // the verdict icon (typed / multi) or the .vkb over a row's mark is the way back (aria-expanded)
    var vk = h.ic; if (!vk) return;
    if (!on) {
      ["role", "tabindex", "aria-expanded", "aria-label"].forEach(function (a) { vk.removeAttribute(a); }); vk.setAttribute("aria-hidden", "true"); return;
    }
    vk.removeAttribute("aria-hidden");
    if (h.kind === "ff") { vk.setAttribute("role", "button"); vk.setAttribute("tabindex", "0"); }
    vk.setAttribute("aria-label", open ? "Hide Cluck's help" : "Show Cluck's help");
    vk.setAttribute("aria-expanded", open ? "true" : "false");
  }
  function badges(h) {                                        // mc / pick-all: a transparent button over the mark; the rows' own buttons are disabled once closed, so it is a sibling
    var rows = h.kind === "row" ? [h.row] : [].filter.call(D.querySelectorAll("#q .choices.all .ch"), function (c) { return c.querySelector(".opt.wrong, .opt.right, .opt.kept"); });
    h.ic = null;
    rows.forEach(function (ch) {
      var b = ch.querySelector(":scope > .vkb");
      if (!b) { b = D.createElement("button"); b.type = "button"; b.className = "vkb " + (h.kind === "row" ? "vkb-r" : "vkb-l"); ch.append(b); }
      if (!h.ic) h.ic = b;
      h.more = (h.more || []).concat(b);
    });
  }

  function sync() {
    queued = false;
    var q = $("#q"), S = state();
    if (!q || !S || !S.prob || S.wl) { drop(); return; }
    var hs = hostsOf(q, S);
    if (!hs.length) { drop(); return; }
    var fresh = [], cur = null;
    hs.forEach(function (h) {
      h.key = S.code + "|" + h.n + "|" + h.v;
      var st = seen.get(h.el);
      if (!st) { st = { key: h.v ? null : h.key, open: false, still: !!h.v }; seen.set(h.el, st); }   // first sight: a host that already has a verdict is a restored question
      h.st = st;
      if (h.v && st.key !== h.key) fresh.push(h);
    });
    if (fresh.length) { cur = fresh[fresh.length - 1]; fresh.slice(0, -1).forEach(function (h) { h.st.key = h.key; }); }   // the newest verdict owns the drawer; the rest are acknowledged without opening
    else cur = hs.filter(function (h) { return h.el === owner && h.v; })[0] || hs.filter(function (h) { return h.v; }).pop() || null;
    var wish = $("#wish");
    var chipIn = drawer && drawer.querySelector(".wchip");
    var chipNew = $("#q #ff.ff > .wchip") || $("#wish .wbar .wchip");
    var chip = chipNew || chipIn;
    if (!cur || !chip) {                                      // nothing to say yet, or nothing to host (diet, no key, Cluck's text already streaming)
      if (!drawer) return;
      if (!chip) { drop(); return; }
      if (!drawer.hidden && !drawer.classList.contains("vd-shut")) { hide(drawer); clean(); }
      return;
    }
    var h = cur, st = h.st;
    if (h.kind !== "ff") badges(h);
    if (drawer && !drawer.isConnected) drawer = null;
    if (!drawer) drawer = make(h);
    else if (owner !== h.el || drawer.previousElementSibling !== anchor(h.after || h.at)) { anchor(h.after || h.at).after(drawer); drawer.dataset.kind = h.kind; }
    owner = h.el;
    if (chipNew && chipNew !== chipIn) {                      // a fresh chip from wishPaint / rboxSync replaces the one docked before
      if (chipIn) chipIn.remove();
      relabel(chipNew);
      drawer.insertBefore(chipNew, drawer.firstChild);
      var wb = $("#wish .wbar"); if (wb && !wb.children.length) wb.remove();
    }
    chip = drawer.querySelector(".wchip");
    var hid = !!(wish && wish.hidden);                        // desktop with Cluck's sheet open: #wish is hidden and so is its chip (wishPaint)
    if (chip.hidden !== hid) chip.hidden = hid;
    hs.forEach(function (x) { if (x.v && !x.el.classList.contains("strip")) x.el.classList.add("strip"); else if (!x.v && x.el.classList.contains("strip")) x.el.classList.remove("strip"); });   // guarded: a no-op classList.add still queues a mutation record, which would loop
    if (h.at !== h.el && !h.at.classList.contains("strip")) h.at.classList.add("strip");
    if (!drawer.hidden && !drawer.classList.contains("vd-shut")) {   // the owner of the open drawer is the one lifted above it
      D.querySelectorAll("#q .vd-host").forEach(function (e) { if (e !== h.el && e !== h.at && e !== h.g) e.classList.remove("vd-host"); });
      [h.el, h.at, h.g].forEach(function (e) { if (e && !e.classList.contains("vd-host")) e.classList.add("vd-host"); });
    }
    drawer.dataset.st = h.v;
    if (st.key !== h.key) {                                   // a new verdict: the drawer opens. Live it slides out; a closed question restored at first sight opens at rest
      if (st.key !== null) st.still = false;
      st.key = h.key; st.open = true;
    }
    var want = st.open && !chip.hidden;
    if (want && (drawer.hidden || drawer.classList.contains("vd-shut")) && sheetFocus && lost()) { sheetFocus = false; setTimeout(function () { if (drawer && !drawer.hidden && chip.isConnected && lost()) chip.focus({ preventScroll: true }); }, 0); }   // the sheet closed with the keyboard inside it: focus goes back to the chip it came from (app.js clClose focuses it while the drawer is still shut)
    if (want && (drawer.hidden || drawer.classList.contains("vd-shut"))) show(drawer, st.still);   // also while it is still sliding shut: its timer would hide it with st.open true and nothing left to reopen it (the sheet closing inside the 260ms)
    else if (!want && !drawer.hidden) hide(drawer);
    place(h, drawer);
    hs.forEach(function (x) { if (x.v && x.ic) icon(x, true, want && x === h); });
    (h.more || []).forEach(function (b) { b.setAttribute("aria-label", want ? "Hide Cluck's help" : "Show Cluck's help"); b.setAttribute("aria-expanded", want ? "true" : "false"); b.removeAttribute("aria-hidden"); });
    drawer._h = h;
  }
  function later() { if (!queued) { queued = true; queueMicrotask(sync); } }

  function tip(h) {                                           // one-time: the way back on a row is its badge. Never twice per user (localStorage; blocked storage = shown each time)
    try { if (localStorage.getItem(TIP_KEY)) return; localStorage.setItem(TIP_KEY, "1"); } catch (e) { /* blocked: show it anyway */ }
    var T = window.stemToast, at = h && h.ic;
    if (T && T.note && at) T.note({ text: TIP, at: at, loose: true, ms: 5000 });
  }
  function close(focus, byX) {
    var st = owner && seen.get(owner), h = drawer && drawer._h;
    if (!drawer || !st) return;
    st.open = false; hide(drawer);
    if (h) { h.kind === "ff" ? icon(h, true, false) : (h.more || []).forEach(function (b) { b.setAttribute("aria-expanded", "false"); b.setAttribute("aria-label", "Show Cluck's help"); }); }
    if (focus && h && h.ic) h.ic.focus({ preventScroll: true });
    if (byX && h && h.kind !== "ff") tip(h);
  }
  function toggle(ic) {
    var S = state(), q = $("#q"); if (!S || !q) return;
    var ff = ic.closest(".ff"), ch = ic.closest(".ch");
    var h = hostsOf(q, S).filter(function (x) { return ff ? x.el === ff : x.kind === "list" ? !!ch && !!ch.closest(".choices.all") : x.row === ch; })[0];
    if (!h) return;
    var st = seen.get(h.el);
    if (owner === h.el && st.open && drawer && !drawer.hidden) { close(false); return; }
    if (owner && owner !== h.el) { var o = seen.get(owner); if (o) o.open = false; if (drawer) hide(drawer, true); }
    owner = h.el; st.open = true; st.still = false; sync();
  }

  function lost() { var a = D.activeElement; return !a || a === D.body || !a.getClientRects().length; }   // nothing focused, or the focused element has just been hidden with the sheet
  var sheetFocus = false;                                    // the keyboard is inside Cluck's sheet or on the drawer (the sheet hides the chip and shuts the drawer under it)
  D.addEventListener("focusin", function (e) { sheetFocus = !!(e.target.closest && e.target.closest("#cluck, .vdrawer")); }, true);
  var BTN = "#q .ff .vk[role=button], #q .vkb";
  D.addEventListener("click", function (e) {
    var vk = e.target.closest && e.target.closest(BTN);
    if (vk) { e.preventDefault(); toggle(vk); }
  });
  D.addEventListener("keydown", function (e) {
    var vk = e.target.closest && e.target.closest("#q .ff .vk[role=button]");
    if (vk && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); toggle(vk); return; }
    if (e.key === "Escape" && drawer && !drawer.hidden && !(window.stemCluckModal && window.stemCluckModal())) close(true);
  });
  /* a tap outside closes it (POPOVER rule); the drawer and the verdict icons are inside. Only a REAL tap: pointerdown then pointerup, moved < 10 px,
     no pointercancel (the browser took the touch for a scroll) and no scroll between. A drag-scroll used to close it (Tony, phone). */
  var tap = null;
  function outside(t) {
    if (!drawer || drawer.hidden || drawer.classList.contains("vd-shut")) return false;
    if (!t || !t.closest) return false;
    return !(drawer.contains(t) || t.closest("#q .ff .vk, #q .vkb, #cluck"));   // Cluck's sheet is the drawer's own family: at phone width it floats over the drawer (#wish stays shown), and a tap in it (Try again) must not close the drawer for good
  }
  D.addEventListener("pointerdown", function (e) { tap = outside(e.target) && e.isPrimary !== false ? { id: e.pointerId, x: e.clientX, y: e.clientY } : null; }, true);
  D.addEventListener("pointermove", function (e) { if (tap && e.pointerId === tap.id && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) >= 10) tap = null; }, true);
  D.addEventListener("pointercancel", function () { tap = null; }, true);
  D.addEventListener("scroll", function () { tap = null; }, true);
  D.addEventListener("pointerup", function (e) {
    var t = tap; tap = null;
    if (t && e.pointerId === t.id && Math.hypot(e.clientX - t.x, e.clientY - t.y) < 10 && outside(e.target)) close(false);
  }, true);
  D.addEventListener("input", function (e) {                  // editing the box starts a new try: the old verdict's drawer goes
    if (!drawer || drawer.hidden || !e.target.closest || !e.target.closest("#ff, .part")) return;
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
    var re = function () { var h = drawer && drawer._h; if (h && h.at.isConnected && !drawer.hidden) place(h, drawer); };
    addEventListener("resize", re);
    if (window.ResizeObserver) new ResizeObserver(re).observe($("#q"));
    if (D.fonts && D.fonts.ready) D.fonts.ready.then(re);
    later();
  }
  if (D.readyState === "loading") D.addEventListener("DOMContentLoaded", start); else start();
  window.stemStrip = { sync: sync, close: function () { close(false); }, get open() { return !!drawer && !drawer.hidden; } };
})();
