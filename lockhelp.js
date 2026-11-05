/* "Let me help you with that!" (Tony, Nov 5): the help modal, an action Jev hosts (intent.js `help_modal`, the J5 decider: window.stemLockHelp.show(info) is
   called from there and nowhere else). Sugar, 2-try items. A dimmed screen; ON it, no box / card / border: Cluck's say-line, the big Cluck, two buttons
   ("No thanks", "Open help panel"). No backdrop tap, no Escape: only the buttons close it. It persists across reloads (localStorage "stem-lockhelp" =
   {code, item, at, via, m}) and is removed only by a button; leaving the item keeps the key and coming back re-shows it (max age 24 h).
   Telemetry: one event, `lockhelp`, via stemT: phase shown | reshown | no_thanks | open_help | left (Jev sends `held`) + code, item, via, p, roll, gap_s, decide_ms,
   shown_count (this device), tries_used, after_wrong. No typed text.
   window.stemLockHelp = { show(info), resume(code), close(), up }. app.js calls resume() when an item opens. While it is up the peek duck stays down and toasts yield. */
(function () {
  "use strict";
  var LOCKHELP_ART = "rewards/icons/duck-calm-nod-128.webp";   // placeholder: Tony drops the empathetic Cluck at rewards/icons/duck-help-256.webp and this constant changes
  var KEY = "stem-lockhelp", NKEY = "stem-lockhelp-n", MAX_AGE = 24 * 3600 * 1000, g = window;
  var mem = null, el = null, cur = null, since = 0, prevFocus = null, left = false;
  function read() {
    var s = null;
    try { s = localStorage.getItem(KEY); } catch (e) { s = mem; }
    if (!s) return null;
    try { var o = JSON.parse(s); if (o && o.code && Date.now() - o.at <= MAX_AGE) return o; } catch (e) { /* bad json */ }
    clear(); return null;
  }
  function write(o) { var s = JSON.stringify(o); mem = s; try { localStorage.setItem(KEY, s); } catch (e) { /* session-only */ } }
  function clear() { mem = null; try { localStorage.removeItem(KEY); } catch (e) { /* blocked */ } }
  function count(inc) {
    var n = 0;
    try { n = parseInt(localStorage.getItem(NKEY), 10) || 0; if (inc) localStorage.setItem(NKEY, String(++n)); } catch (e) { n = inc ? 1 : 0; }
    return n;
  }
  function tel(phase, o) {
    var m = o.m || {};
    try {
      g.stemT && g.stemT("lockhelp", { phase: phase, code: o.code, item: o.item, via: o.via, p: m.p, roll: m.roll, gap_s: m.gap_s,
        decide_ms: phase === "shown" || phase === "reshown" ? undefined : Date.now() - since, shown_count: count(false), tries_used: m.tu, after_wrong: m.aw });
    } catch (e) { /* never break the app */ }
  }
  function trap(e) {
    if (!el) return;
    if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); return; }   // Tony: only the 2 buttons
    if (e.key !== "Tab") return;
    var b = el.querySelectorAll("button"), first = b[0], last = b[b.length - 1];
    if (!el.contains(document.activeElement)) { e.preventDefault(); last.focus(); return; }
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
  function leftNow() { if (el && cur && !left) { left = true; tel("left", cur); } }
  function close() {
    if (!el) return;
    document.removeEventListener("keydown", trap, true);
    el.remove(); el = null; cur = null;
    document.documentElement.classList.remove("lh-on");
    if (prevFocus && prevFocus.focus && document.contains(prevFocus)) try { prevFocus.focus({ preventScroll: true }); } catch (e) { /* */ }
    prevFocus = null;
  }
  function end(kind) {
    var o = cur;
    tel(kind, o); clear(); close();
    try { g.stemJev && g.stemJev.helpEnd && g.stemJev.helpEnd(kind); } catch (e) { /* */ }   // Jev: No thanks doubles the gap, Open help panel resets it
    if (kind === "open_help" && typeof g.stemClOpen === "function") g.stemClOpen("explain", ":is(#wish, .rbox) .wchip");
  }
  function build(o, phase) {
    if (el) return false;
    since = Date.now(); prevFocus = document.activeElement; cur = o; left = false;
    el = document.createElement("div");
    el.className = "lockhelp"; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("aria-labelledby", "lhSay");
    el.innerHTML = '<div class="lh-col"><p class="lh-say" id="lhSay">Let me help you with that!</p>' +
      '<img class="lh-duck" src="' + LOCKHELP_ART + '" alt="" width="128" height="128">' +
      '<div class="lh-btns"><button type="button" class="btn btn-label lh-no">No thanks</button>' +
      '<button type="button" class="btn btn-label btn-go lh-go">Open help panel</button></div></div>';
    el.querySelector(".lh-no").addEventListener("click", function () { end("no_thanks"); });
    el.querySelector(".lh-go").addEventListener("click", function () { end("open_help"); });
    document.body.appendChild(el);
    document.documentElement.classList.add("lh-on");
    document.addEventListener("keydown", trap, true);
    try { g.stemDuck && g.stemDuck.down && g.stemDuck.down(); } catch (e) { /* */ }
    el.querySelector(".lh-go").focus({ preventScroll: true });
    if (phase === "shown") count(true);
    tel(phase, o);
    return true;
  }
  function show(info) {
    if (el || !info || !info.code) return false;
    var o = { code: info.code, item: info.item || info.code, at: Date.now(), via: info.via,
      m: { p: info.p, roll: info.roll, gap_s: info.gap_s, tu: info.tries_used, aw: info.after_wrong } };
    write(o);
    return build(o, "shown");
  }
  function resume(code) {
    var o = read();
    if (!o) return;
    if (o.code !== code) { leftNow(); close(); return; }   // another item: the key stays for when the student comes back
    build(o, "reshown");
  }
  document.addEventListener("visibilitychange", function () { if (document.hidden) leftNow(); });
  g.addEventListener("pagehide", leftNow);
  g.stemLockHelp = { show: show, resume: resume, close: close, get up() { return !!el; } };
})();
