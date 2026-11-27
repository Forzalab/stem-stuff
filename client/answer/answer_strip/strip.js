/* The answer strip: typed answers (B3 PR-B1) + multiple choice, pick-all and multi-part (PR-B2) ( strip.css; STYLE §2.7 §2.8 §3 "Strip ship spec"; Tony "ship it", Nov 2).
   A verdict on a typed answer (num / expr / graph / proof) in a sugar bank with Cluck's key opens a cabinet DRAWER under the answer bar:
   [Ask Cluck] + a close. This file owns it end to end and talks to app.js only through the DOM, so app.js needs no call-in:
     reads   #q #ff.ff (.ok / .bad / .vk, #q.closed), #wish .wchip (or the chip rboxSync docked in the field), window.__drill.state
     writes  one <div class="vdrawer rbox"> as the bar's SIBLING (after the bar and its try pips), the chip moved into it, class .strip on the bar,
             role/aria on the verdict icon (.vk). The drawer carries class "rbox" so app.js's `:is(#wish, .rbox) .wchip` lookups find the chip there.
   Opens on a new verdict (animated when it lands live, instant when a closed question is restored); closes on the close button, Esc, a tap outside,
   or when the student edits the box; the verdict icon reopens it. No Cluck key / diet / mc / multi: no chip, so no drawer and nothing changes.
   Check and the labelled Next stay in the Check slot until the finger bar (PR-C).
   PR-B2 hosts (kind): ff = a typed bar or a multi part's box; row = single mc's picked .ch (the drawer is a sibling after .choices, never a child of it: fitChoices counts .choices' children; it is placed under the picked card, over the cards below) and carries [Ask Cluck][Skip | Next][^] spanning the row; list = pick-all's .chk row (drawer under the whole list).
   mc / pick-all have no verdict icon: a transparent .vkb button over the row's mark (the right-hand check / cross, or pick-all's square) reopens it, and the
   first time a student closes it a one-time toast teaches that. Multi: one chip per question, so one drawer that moves to the part whose verdict is newest
   (or whose icon was tapped). */
(function () {
  "use strict";
  var D = document, $ = function (s) { return D.querySelector(s); };
  var seen = new WeakMap();                                   // host -> { key, open, still }: one entry per rendered host, gone with it
  var drawer = null, owner = null, shutT = 0, queued = false;  // owner = the host element the (single) drawer hangs from
  var CHEV = '<svg class="ico" aria-hidden="true"><use href="#i-down"/></svg>';
  /* KEEP AS IS: the Ask Cluck / See steps drawer is MEANT to cover the choice under it (Tony, Nov 13). Do not add space or move it to uncover a choice. Ask Tony before any behavior change. */
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
  /* Tony, Nov 5: "i want the cluck panel to come from under the input box, OVERLAPPING any other element". The tray hangs from the INPUT box (the typed bar .ff; mc / choose-all: the choices box):
     its top is tucked 2px behind the box's bottom edge, the box paints above it (.vd-host z 3 > tray z 2), and it floats OVER whatever follows (the verdict line, Next, the Cluck card).
     Single mc (Tony, Nov 6): the box is the PICKED card, not the list: the tray hangs under it and lies over the cards below (only the picked card is lifted); a last picked card has nothing below, so the box stays the list.
     It is absolute and keeps no flow room: opening or closing it moves nothing. Side (Tony, same day): "only go left IFF the form is choose all/tick box, bcs the next button is not
     convenient. otherwise, all stay at right": choose-all = the box's left edge; every other form = the box's right edge. */
  function boxOf(h, d) {
    var el = h.g || h.at, u = under(h);
    if (u) {                                                  // single mc, picked card not the last: the tray hangs from the PICKED card, over the cards below it (Tony, Nov 6)
      var cb = d.parentElement && containing(d), c = cb.getBoundingClientRect(), r = u.getBoundingClientRect();
      return { left: r.left - c.left - cb.clientLeft + cb.scrollLeft, w: r.width, bottom: r.bottom - c.top - cb.clientTop + cb.scrollTop, tuck: 2, side: "right" };
    }
    return { left: el.offsetLeft, w: el.offsetWidth, bottom: el.offsetTop + el.offsetHeight, tuck: 2, side: h.kind === "list" ? "left" : "right" };
  }
  /* the picked card a single mc's tray hangs under: null for every other form and when the picked card is the last one (the tray then hangs from the box, as before) */
  function under(h) { return h.kind === "row" && h.g && !h.g.classList.contains("inline") && h.row && h.row !== h.g.lastElementChild ? h.row : null; }
  function containing(d) { for (var e = d.parentElement; e && e !== D.documentElement; e = e.parentElement) if (getComputedStyle(e).position !== "static") return e; return D.documentElement; }
  function place(h, d) {
    var b = boxOf(h, d), w = b.w, dw = h.kind === "row" ? w : Math.round(w * 2 / 3);
    d.style.width = dw + "px";
    if (!d.hidden && d.scrollWidth > d.clientWidth + 1) dw = Math.min(w, d.scrollWidth + 2);   // the label keeps its words: a narrow bar (360, Next beside it) widens the drawer past 2/3
    d.style.width = dw + "px"; d.style.left = (b.side === "left" ? b.left : b.left + w - dw) + "px"; d.style.top = b.bottom - b.tuck + "px";
    d.style.setProperty("--vd-tuck", b.tuck + "px");
  }
  /* html.ui-v7 only (Tony Nov 14, CLUCK-BTN): no tray, no drawer, no Cluck button in the verdict slot. The one Ask Cluck button on the question card (cluck_btn/cluckbtn.js) is the only entry,
     so under the flag this file draws nothing and tears down what it marked; the verdict slot is back to a plain tick / X. */
  function V7() { return D.documentElement.classList.contains("ui-v7"); }
  function show(d, still) {
    clearTimeout(shutT);
    d.classList.remove("vd-shut"); d.classList.toggle("vd-still", !!still || fxPlaying());
    d.hidden = false;
  }
  /* only the host that owns the OPEN drawer is lifted above it (.vd-host, z 3); every other verdict host (.strip) stays under it, so the tray may lie over the rows
     below (Tony, Nov 3 19:31) and no stale host paints over it. It drops when the drawer is gone: nothing stays lifted after the tray shuts. */
  function unlift() { D.querySelectorAll("#q .vd-host").forEach(function (e) { e.classList.remove("vd-host"); }); }
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
    if (h.kind === "ff" && D.documentElement.classList.contains("ui-v7")) {   // ui-v7 (Tony Nov 15): the typed field's mark is decoration, not a button; the verdict is in the live region
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
    if (!q || !S || !S.prob || S.wl || V7()) { drop(); return; }
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
    if (chip && chip.hidden !== hid) chip.hidden = hid;
    hs.forEach(function (x) { if (x.v && !x.el.classList.contains("strip")) x.el.classList.add("strip"); else if (!x.v && x.el.classList.contains("strip")) x.el.classList.remove("strip"); });   // guarded: a no-op classList.add still queues a mutation record, which would loop
    if (h.at !== h.el && !h.at.classList.contains("strip")) h.at.classList.add("strip");
    if (!drawer.hidden && !drawer.classList.contains("vd-shut")) {   // the owner of the open drawer is the one lifted above it
      var lift = h.kind === "list" ? [h.g] : under(h) ? [h.el] : [h.el, h.at, h.g];   // choose-all: only the choices box (the anchor); its Check / Next row stays under the tray
      D.querySelectorAll("#q .vd-host").forEach(function (e) { if (lift.indexOf(e) < 0) e.classList.remove("vd-host"); });
      lift.forEach(function (e) { if (e && !e.classList.contains("vd-host")) e.classList.add("vd-host"); });
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
  /* ui-v7: a press on the decorative mark must not blur the typed field: the blur re-shows the hint line (HOW-KB hides it while the field has focus), the field slides down under the pointer
     and the click lands elsewhere (no toast) */
  D.addEventListener("mousedown", function (e) { if (e.target.closest && e.target.closest("#q .ff .vk") && D.documentElement.classList.contains("ui-v7")) e.preventDefault(); }, true);
  D.addEventListener("click", function (e) {
    var mark = e.target.closest && e.target.closest("#q .ff .vk");   // ui-v7: the typed field's tick / cross is no button; a tap points to Ask Cluck (no drawer)
    if (mark && D.documentElement.classList.contains("ui-v7")) { e.preventDefault(); if (window.stemToast) window.stemToast.show({ text: "Tap Ask Cluck for help", bar: false, ms: 3000, at: mark }); return; }
    var vk = e.target.closest && e.target.closest(BTN);
    if (vk) { e.preventDefault(); toggle(vk); }
  });
  /* ui-v7 focus (round 3): a mouse or tap on the typed field marks it [data-ptr] (no focus ring); the keyboard clears it, so Tab focus shows the outline */
  D.addEventListener("pointerdown", function (e) { var f = e.target.closest && e.target.closest("#q .ff, .code-box"); if (f) f.setAttribute("data-ptr", ""); }, true);
  D.addEventListener("keydown", function () { D.querySelectorAll("[data-ptr]").forEach(function (f) { f.removeAttribute("data-ptr"); }); }, true);
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
  /* IB-2 (SOFT-LIFT §4): a key press nudges the field's outline strength only. [data-ib2] is the CSS hook (strip.css):
     a new character 90%, a delete 60%, then back to the focus 75% over 320ms. Two frames so the stronger colour paints first. */
  D.addEventListener("input", function (e) {
    var t = e.target;
    if (!t || !t.matches || !t.matches("#q .ff > input.ans")) return;
    var ff = t.parentElement, it = e.inputType || "";
    if (!ff || ff.classList.contains("proof") || !/^(insert|delete)/.test(it)) return;
    if (ff.classList.contains("ok") || ff.classList.contains("bad") || ff.classList.contains("cue") || ff.classList.contains("rbox")) return;
    var g = (ff._ib2g = (ff._ib2g || 0) + 1);
    ff.setAttribute("data-ib2", it.indexOf("delete") === 0 ? "del" : "add");
    requestAnimationFrame(function () { requestAnimationFrame(function () { if (ff._ib2g === g) ff.removeAttribute("data-ib2"); }); });
  }, true);

  /* IB-3 (SOFT-LIFT §0.1 §0.4 §6): THINKING on the two typed fields. While html.grading names a field (the single typed #ff; a
     multi part only while it is .g-on) strip.js adds the aurora ring layers and sets the input readOnly. The ring is the compositor
     cure from app.css "the rim turns on the compositor": a big square with the conic gradient is ROTATED by transform keyframes
     (Web Animations API, no CSS @property, no conic repaint per frame) under the static ring masks in strip.css.
     EVEN SPEED: the rotate() angles are perimeter-spaced (64 samples of edge(s)), so the head moves the same px/s on every side;
     rebuilt per field and on resize. No animation under prefers-reduced-motion (strip.css shows a static ring). */
  var RM = window.matchMedia ? matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };
  var ib3 = new WeakMap();                                    // field -> { ring, glow, spins, anims, inp, ro, w, h }
  /* s = px along the outline from the top middle, clockwise; ang(s) = the clockwise angle from the top (mock edge()) */
  function edge(w, h) {
    var P = 2 * (w + h);
    function ang(s) {
      s = ((s % P) + P) % P;
      var x, y;
      if (s < w / 2) { x = s; y = -h / 2; }
      else if (s < w / 2 + h) { x = w / 2; y = s - w / 2 - h / 2; }
      else if (s < 1.5 * w + h) { x = w / 2 - (s - w / 2 - h); y = h / 2; }
      else if (s < 1.5 * w + 2 * h) { x = -w / 2; y = h / 2 - (s - 1.5 * w - h); }
      else { x = s - 1.5 * w - 2 * h - w / 2; y = -h / 2; }
      var t = Math.atan2(x, -y) * 180 / Math.PI;
      return t < 0 ? t + 360 : t;
    }
    function pos(a) {                                          // angle -> px along the outline (IB-4's handover + keyframes)
      a = ((a % 360) + 360) % 360; var lo = 0, hi = P;
      for (var i = 0; i < 24; i++) { var m = (lo + hi) / 2; if (ang(m) < a) lo = m; else hi = m; }
      return lo;
    }
    return { P: P, ang: ang, pos: pos };
  }
  function ib3Checking(q) {
    var out = [];
    var one = q.querySelector(":scope > .ff#ff:not(.proof)");
    if (one && one.querySelector("input.ans")) out.push(one);
    q.querySelectorAll(".mparts .part.g-on > .ff").forEach(function (f) { if (f.querySelector("input.ans")) out.push(f); });
    return out;
  }
  function ib3Run(f, st) {
    st.anims.forEach(function (a) { a.cancel(); });
    st.anims = [];
    if (RM.matches) return;                                   // reduced motion: the static ring is CSS only
    var w = f.offsetWidth, h = f.offsetHeight;
    if (!w || !h) return;
    var E = edge(w, h), N = 64, kf = [];
    for (var i = 0; i <= N; i++) kf.push({ transform: "rotate(" + (i === N ? 360 : E.ang(E.P * i / N)) + "deg)" });
    var opt = { duration: Math.min(2600, Math.max(1600, E.P / .475)), iterations: Infinity, easing: "linear" };   // 475 px/s, lap clamped 1.6..2.6 s
    st.spins.forEach(function (s) { st.anims.push(s.animate(kf, opt)); });
    st.w = w; st.h = h;
  }
  function ib3Start(f) {
    var ring = D.createElement("div"), glow = D.createElement("div");
    ring.className = "ib3-ring"; glow.className = "ib3-glow";
    ring.setAttribute("aria-hidden", "true"); glow.setAttribute("aria-hidden", "true");
    var a = D.createElement("i"), b = D.createElement("i");
    a.className = b.className = "ib3-spin"; a.setAttribute("aria-hidden", "true"); b.setAttribute("aria-hidden", "true");
    ring.append(a); glow.append(b); f.append(ring, glow);
    var inp = f.querySelector("input.ans");
    inp.readOnly = true;                                      // the input is read-only while checking (SOFT-LIFT §6)
    f.setAttribute("aria-busy", "true");
    var st = { ring: ring, glow: glow, spins: [a, b], anims: [], inp: inp, ro: null, w: 0, h: 0 };
    ib3.set(f, st);
    if (window.ResizeObserver) { st.ro = new ResizeObserver(function () { if (f.offsetWidth !== st.w || f.offsetHeight !== st.h) ib3Run(f, st); }); st.ro.observe(f); }
    ib3Run(f, st);
  }
  function ib3Stop(f) {
    var st = ib3.get(f); if (!st) return;
    st.anims.forEach(function (a) { a.cancel(); });
    if (st.ro) st.ro.disconnect();
    st.ring.remove(); st.glow.remove();
    st.inp.readOnly = false;
    f.removeAttribute("aria-busy");
    ib3.delete(f);
  }
  function ib3Sync() {
    var q = $("#q");
    var want = q && V7() && D.documentElement.classList.contains("grading") ? ib3Checking(q) : [];
    var live = [];
    D.querySelectorAll(".ib3-ring").forEach(function (e) {
      var f = e.parentElement; if (f && ib3.has(f)) live.push(f); else e.remove();
    });
    live.forEach(function (f) {
      if (want.indexOf(f) >= 0) return;
      var a0 = ib4Angle(f);                                   // read the aurora's current head BEFORE ib3Stop cancels it
      ib3Stop(f);
      if (a0 != null) ib4Sweep(f, a0);                        // IB-4: the verdict ring starts as that arc (judged fields only)
    });
    want.forEach(function (f) { if (!ib3.has(f)) ib3Start(f); });
  }
  var ib3q = false;
  function ib3Later() { if (!ib3q) { ib3q = true; queueMicrotask(function () { ib3q = false; ib3Sync(); ib4Sync(); }); } }

  /* IB-4 (SOFT-LIFT-SPEC §0.3 §7; mock PICK-soft-lift.src.html right/wrong): VERDICT RING on the two typed fields, html.ui-v7 only.
     The aurora's last head angle (read off the running .ib3-spin) is frozen; the verdict colour starts as the SAME ~173deg arc (layer A,
     static) and the ring closes by rotating two fixed conic arcs under the same static 3.5px mask (transform-only, no @property, no
     conic repaint per frame):
       A: 173.88deg, static at a0-173.88 (the frozen aurora arc, recoloured in place; 1.08deg of tail overlap for the final seam)
       B: 172.8deg,  rotates from a0-172.8 to a0  -> reveals a0..a0+172.8 (its extra tail always sits under A)
       C: 15.48deg,  rotates from a0-15.48 to a0+171.72 -> reveals the last a0+172.8..a0+187.2 (its extra tail sits under B)
     Both rotations share 32 perimeter-spaced keyframes (even px/s on every side) and one easing cubic-bezier(.3, .3k, .2, 1) with
     k = (aurora px/s * 440ms) / (px left to close): the head leaves at the aurora's pace. 440ms, no delay. The ring STAYS as the
     outline for right and wrong; the real border is never touched. The tick/cross waits for the close (the finished promise), then
     draws on in .24s (strip.css vk-draw: pathLength 1). A live verdict whose grade beat the 150 ms aurora still sweeps, from the arc
     start (a0 = 0), so a fast grade animates like a slow one; a RESTORED verdict (no check ran now) is the static closed ring.
     Reduced motion: the same layers at their final rotations, no motion. The ring is the property of the verdict: it goes
     when the verdict does (typing after a miss / a rebuilt question). */
  function ib4Angle(f) {
    var sp = f.querySelector(":scope > .ib3-ring .ib3-spin"); if (!sp) return null;
    var cs = getComputedStyle(sp).transform; if (!cs || cs === "none") return 0;
    try { var m = new DOMMatrix(cs), r = Math.atan2(m.b, m.a) * 180 / Math.PI; return r < 0 ? r + 360 : r; } catch (e) { return 0; }
  }
  function ib4Judge(f) {
    if (!V7() || f.classList.contains("proof") || f.classList.contains("rbox")) return "";
    var c = f.classList;
    if (c.contains("ok")) return "ok";                                   // the verdict classes ARE the state; a stale .vk stays in the DOM after a retype
    return c.contains("bad") || c.contains("lock") || c.contains("shut") ? "bad" : "";
  }
  function ib4Live(f) {                                      // app.js setBusy marks the page (single) / the part's row (multi) only while a check is out: a restore has no mark
    var H = D.documentElement;
    return H.hasAttribute("data-check-live") || !!(f.parentElement && f.parentElement.hasAttribute("data-check-live"));
  }
  function ib4Drop(f, ring) {
    if (ring) ring.remove();
    if (f) { f.removeAttribute("data-ib4"); f.classList.remove("ib4-done"); }
  }
  function ib4Sweep(f, a0, still) {
    var want = ib4Judge(f);
    if (!V7() || !want) return;
    var old = f.querySelector(":scope > .ib4-ring");
    if (old && old.dataset.v !== want) { ib4Drop(f, old); old = null; }   // a re-press with unchanged text can land a different verdict: rebuild, don't keep the old colour
    if (old) return;
    var w = f.offsetWidth, h = f.offsetHeight;
    if (!w || !h) return;
    var E = edge(w, h), P = E.P, LA = 173.88, LB = 172.8, LC = 15.48;
    var ring = D.createElement("div");
    ring.className = "ib4-ring"; ring.dataset.v = want; ring.dataset.a0 = (+a0 || 0).toFixed(2);
    ring.setAttribute("aria-hidden", "true");
    function arc(cls, len) {
      var i = D.createElement("i"); i.className = "ib4-arc " + cls; i.dataset.len = len; i.setAttribute("aria-hidden", "true");
      ring.append(i); return i;
    }
    var A = arc("ib4-a", LA), B = arc("ib4-b", LB), C = arc("ib4-c", LC);
    var set = function (el, deg) { el.style.transform = "rotate(" + (+deg).toFixed(3) + "deg)"; };
    set(A, a0 - LA); set(B, a0 - LB); set(C, a0 - LC);            // t = 0: every head sits on the frozen aurora head
    f.append(ring);
    if (still || RM.matches) {                                    // restored / reduced motion: the closed ring, no motion
      set(B, a0); set(C, a0 + 187.2 - LC);
      ring.classList.add("ib4-done", "ib4-still");
      f.dataset.ib4 = "still"; f.classList.add("ib4-done");
      return;
    }
    f.dataset.ib4 = "sweep"; f.classList.remove("ib4-done");
    var s0 = E.pos(((a0 % 360) + 360) % 360), s1 = E.pos((((a0 + 187.2) % 360) + 360) % 360);
    if (s1 <= s0) s1 += P;
    var dist = s1 - s0;
    if (!(dist > 0)) { ib4Drop(f, ring); return; }
    var N = 32, kb = [], kc = [], prev = 0;
    for (var i = 0; i <= N; i++) {
      var hp = dist * i / N, ang = E.ang((s0 + hp) % P);
      var d = (ang - a0) % 360; if (d < 0) d += 360;
      if (i === 0) d = 0; else if (d < prev && d + 360 - prev < 180) d += 360;
      if (d < prev) d = prev;
      prev = d;
      kb.push({ transform: "rotate(" + (a0 - LB + Math.min(d, LB)).toFixed(3) + "deg)", offset: i / N });
      kc.push({ transform: "rotate(" + (a0 - LC + d).toFixed(3) + "deg)", offset: i / N });
    }
    var lap = Math.min(2600, Math.max(1600, P / .475)), aurora = P / lap;   // px per ms (lap is ms)
    var k = Math.min(1, aurora * 440 / dist), ease = "cubic-bezier(.3," + (.3 * k).toFixed(3) + ",.2,1)";
    var opt = { duration: 440, easing: ease, fill: "forwards" };
    if (!B.animate) { set(B, a0); set(C, a0 + 187.2 - LC); ring.classList.add("ib4-done"); f.classList.add("ib4-done"); return; }
    var anB = B.animate(kb, opt), anC = C.animate(kc, opt);
    Promise.all([anB.finished, anC.finished]).then(function () {   // the icon starts only after the ring has closed
      if (!ring.isConnected) return;
      ring.classList.add("ib4-done"); f.classList.add("ib4-done");
    }).catch(function () { /* cancelled: the verdict changed, or a test froze it */ });
  }
  function ib4Sync() {
    var q = $("#q");
    if (!q || !V7()) { D.querySelectorAll(".ib4-ring").forEach(function (r) { ib4Drop(r.parentElement, r); }); return; }
    var fields = [];
    var one = q.querySelector(":scope > .ff#ff:not(.proof):not(.rbox)");
    if (one) fields.push(one);
    q.querySelectorAll(".mparts .part > .ff:not(.rbox)").forEach(function (f) { fields.push(f); });
    q.querySelectorAll(".ib4-ring").forEach(function (r) {
      var f = r.parentElement, want = f && f.classList.contains("ff") ? ib4Judge(f) : "";
      if (!want || r.dataset.v !== want) ib4Drop(f, r);   // verdict changed under the same ring (ok vs bad/lock): rebuild below
    });
    fields.forEach(function (f) {
      if (ib4Judge(f) && !f.querySelector(":scope > .ib4-ring")) ib4Sweep(f, 0, !ib4Live(f));   // live: sweep from the arc start even when the 150 ms aurora never ran; a restored verdict is the closed ring, still
    });
  }
  function ib3Watch() {
    var mo3 = new MutationObserver(ib3Later);
    mo3.observe(D.documentElement, { attributes: true, attributeFilter: ["class"] });
    var q = $("#q"); if (q) mo3.observe(q, { subtree: true, attributes: true, attributeFilter: ["class"], childList: true });
    if (RM.addEventListener) RM.addEventListener("change", ib3Later);
    ib3Later();
  }

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
    ib3Watch();
    later();
  }
  if (D.readyState === "loading") D.addEventListener("DOMContentLoaded", start); else start();
  window.stemStrip = { sync: sync, close: function () { close(false); }, get open() { return !!drawer && !drawer.hidden; } };
})();
