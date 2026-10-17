/* Cluck's duck + sky, and the T45 idle peek (design/IDLE-PEEK.md; 20261015-T45, Tony Oct 15: "idling for more than 2-3min in a
   question/quiz (in a bank, not each question)? cluck slowly peeks up sunrise").
   1. window.stemDuck: ONE duck and ONE sky for every Cluck rise. Every rise replays the same sunrise (same start, curve, end: the 🔒 SYNC);
      down = the duck goes and the sky goes back to night. The sun core always sits under the duck (🔒 position A). The P7 waiting duck
      (lane c) and the P8 ember (lane f) rise through this too once they land; nothing else draws a duck or a sky.
   2. The idle timer: one per bank session. Any input anywhere resets it; a question change by code does not. Sugar only, 3 min, then one
      more after 10 more idle min, max 2 per bank. Paused while the tab is hidden. The motion lives in app.css (".ck-rise"). */
(function () {
  "use strict";
  var H = document.documentElement, side = matchMedia("(min-width: 720px)"), fine = matchMedia("(hover: hover) and (pointer: fine)");
  var BLEED = 48;                                                          // 🔒 glow edge: the sky runs this far past its column, fading out (no hard cut)

  /* ---------- 1. the duck + the sky ---------- */
  var box = null, onTap = null, outT = 0;
  function build() {
    if (box) return box;
    box = document.createElement("div");
    box.className = "ck-rise ai-skin"; box.hidden = true;
    box.innerHTML = '<div class="ck-sky" aria-hidden="true"><i class="l1"></i><i class="l2"></i><i class="l3"></i></div>' +
      '<p class="ck-say" aria-hidden="true"></p><button type="button" class="ck-peek"><span class="ck-duck"></span></button>';
    box.querySelector(".ck-peek").addEventListener("click", function () { var f = onTap; down(); if (f) f(); });
    document.body.append(box);
    addEventListener("resize", function () { if (up()) place(); });
    return box;
  }
  /* phone: the duck at the bottom centre (no dock there in sugar), the sky across the screen; desktop: the Question column's foot, its sky */
  function place() {
    var W = H.clientWidth, q = side.matches && document.getElementById("freeze"), r = q && !q.hidden ? q.getBoundingClientRect() : null;
    var x0 = r ? r.left : 0, w = r ? r.width : W, cx = x0 + w / 2;
    box.style.setProperty("--cx", cx + "px");
    box.style.setProperty("--sky-x", (x0 - BLEED) + "px");
    box.style.setProperty("--sky-w", (w + 2 * BLEED) + "px");
    box.style.setProperty("--sun-x", (cx - x0 + BLEED) + "px");           // the sun core under the duck, always
  }
  function up() { return !!box && !box.hidden && !box.classList.contains("out"); }
  function rise(o) {
    build(); clearTimeout(outT);
    onTap = o.onTap || null;
    box.querySelector(".ck-say").textContent = o.line || "";
    box.querySelector(".ck-peek").setAttribute("aria-label", o.label || "Cluck");
    box.classList.remove("on", "out"); box.hidden = false; place();
    void box.offsetWidth;                                                   // restart: every rise plays the sunrise from the top
    box.classList.add("on");
  }
  function down() {
    if (!up()) return;
    box.classList.add("out");                                               // duck 300 ms, sky 400 ms (app.css), then night again
    outT = setTimeout(function () { box.hidden = true; box.classList.remove("on", "out"); }, 630);
  }
  window.stemDuck = { rise: rise, down: down, get up() { return up(); } };

  /* ---------- 2. the T45 idle peek ---------- */
  var IDLE = [180000, 600000], MOVE = 24;                                   // AMA 1 (3 min), AMA 5 (+10 min, max 2), AMA 8 (24 px of mouse travel)
  var last = performance.now(), n = 0, t = 0, mine = false, rest = null, mx = null, my = null;
  var wait = function () { return IDLE[n]; };
  /* AMA 3 sugar only · in a bank · a question open · AMA 9 Cluck closed · nothing over the page (question list, code bar, keyboard, reward FX) */
  function ok() {
    var c = H.classList;
    return c.contains("sugar") && !c.contains("start") && !!(window.stemBank && window.stemBank.code) &&
      !c.contains("ql-open") && !c.contains("bar-open") && !c.contains("kb") && !document.querySelector(".fx-ov") &&
      !(window.stemCluckOpen && window.stemCluckOpen()) && !(window.stemDuck.up && !mine);   // AMA 10: one duck per screen
  }
  function arm(ms) { clearTimeout(t); t = n < IDLE.length ? setTimeout(fire, Math.max(0, ms)) : 0; }
  function fire() {
    t = 0;
    if (document.visibilityState === "hidden") return;                      // visibilitychange re-arms it
    var idle = performance.now() - last;
    if (idle < wait()) return arm(wait() - idle);                           // input came since: wait out the rest
    if (!ok()) { last = performance.now(); return arm(wait()); }           // busy elsewhere (e.g. Cluck open): a fresh wait from now
    mine = true; n++; lastRise = performance.now();
    rise({ line: fine.matches ? "Stuck? Click me." : "Stuck? Tap me.", label: "Cluck: want a hint?",
      onTap: function () { mine = false; arm(wait()); if (window.stemIdleTap) window.stemIdleTap(); } });
  }
  /* the question's first wrong answer (app.js record): the same peek, ~0.7 s after the feedback settles, once per question. Same rules as
     the idle one (ok()): sugar, a bank, Cluck's sheet closed, nothing else over the page, one duck. Plus a cooldown since the last peek. It
     does not use up the idle peeks (n). Not retried: if it is busy at that moment, this question gets none. */
  var WRONG_MS = 700, COOL = 120000, wt = 0, wrongDone = {}, lastRise = -COOL;
  function wrong(code) {
    if (!code || wrongDone[code]) return;
    wrongDone[code] = 1; clearTimeout(wt);
    wt = setTimeout(function () {
      wt = 0;
      if (document.visibilityState === "hidden" || !ok() || performance.now() - lastRise < COOL) return;
      mine = true; lastRise = performance.now();
      rise({ line: fine.matches ? "Stuck? Click me." : "Stuck? Tap me.", label: "Cluck: want a hint?",
        onTap: function () { mine = false; arm(wait()); if (window.stemIdleTap) window.stemIdleTap(); } });
    }, WRONG_MS);
  }
  window.stemDuck.wrong = wrong;
  function input(e) {
    if (box && e && e.target && box.contains(e.target)) return;             // the duck's own tap / key is its action, not "idle over"
    last = performance.now(); mx = null;
    clearTimeout(wt); wt = 0;                                               // a try typed before the wrong-answer peek: no peek
    if (mine) { mine = false; down(); }                                     // AMA 14: it stays until any input
    if (!t && n < IDLE.length) arm(wait());
  }
  function move(e) {                                                        // a resting hand jitters: count travel, not events
    if (mx == null) { mx = e.clientX; my = e.clientY; return; }
    if (Math.hypot(e.clientX - mx, e.clientY - my) >= MOVE) input(e);
  }
  var opt = { capture: true, passive: true };
  ["pointerdown", "keydown", "wheel", "touchstart", "input"].forEach(function (k) { document.addEventListener(k, input, opt); });
  document.addEventListener("pointermove", move, opt);
  document.addEventListener("visibilitychange", function () {                // hidden time does not count (browsers throttle hidden timers anyway)
    if (document.visibilityState === "hidden") { clearTimeout(t); t = 0; rest = wait() - (performance.now() - last); }
    else if (rest != null) { last = performance.now() - (wait() - rest); arm(rest); rest = null; }
  });
  addEventListener("drill:bank", function () {                               // a bank opened or left: a new bank session
    n = 0; last = performance.now(); mx = null; wrongDone = {}; clearTimeout(wt); wt = 0;
    if (mine) { mine = false; down(); }
    arm(wait());
  });
  arm(wait());
})();
