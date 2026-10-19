/* Jev J1 + J2 (brain SPRINT §Render track P5; PATH.md §4): the event-line log + the homebrew rule counters, client only.
   🔒 Tony Oct 18: states F flow / S2 impasse / S5 guess-spam / S7 help abuse only; the rest are parked.
   Nothing leaves the device (J0 privacy text not done): lines + counters live in memory, the S2 step history in localStorage.
   Flag, default OFF: ?jev=1 turns it on for this device (localStorage stem-jev=1), ?jev=0 off. Also off with stem-t-off / DNT / GPC.
   Off = this file defines window.__stemJev (pure, for tests/intent.test.mjs) and does nothing else.
   On  = wraps window.stemT (app.js hook lines, telemetry.js keeps working) + 4 passive input listeners; window.stemJev reads the state.
   Line = "+SS.s  kind  args", seconds since q_open, no typed text. Rules (SPRINT §Jev rules; "ours" = J3 bench start values):
     F   item right, no wrong pick, < 80 s, no Cluck opened by hand → flow run +1; anything else on the item ends the run
     S2  no input for longer than p75 of this item's past steps (q_open or pick → next pick) (< 4 samples: 80 s, ours); depth = gap / p75
     S5  a fast pick (< 5 s after q_open or < 8 s after a wrong pick) that repeats a choice, or 2 fast picks in a row
     S7  Cluck opened by hand < 5 s after q_open (answer views come with the P3 view events) */
(function () {
  "use strict";
  var W = window;
  var FLOW_S = 80, S2_FALLBACK_S = 80, S2_MIN_N = 4, FAST_OPEN_S = 5, FAST_ERR_S = 8, HELP_S = 5, PAUSE_S = 5, CAP = 40, HIST_CAP = 20;
  var ACT = { F: "none", S2: "hint_offer", S5: "slow_cue", S7: "predict_first" };   // the table's actions; nothing draws them yet (J4)

  function p75(xs) {
    if (!xs || xs.length < S2_MIN_N) return S2_FALLBACK_S;
    var s = xs.slice().sort(function (a, b) { return a - b; });
    return s[Math.ceil(s.length * 0.75) - 1];
  }

  /* one learner session. now() = ms; hist = { code: [step seconds] } (the caller stores it) */
  function create(now, hist) {
    hist = hist || {};
    var q = null, lines = [], last = null, flowRun = 0, hidden = false;
    var counts = { F: 0, S2: 0, S5: 0, S7: 0 };
    function sec(t) { return (t - q.open) / 1000; }
    function log(kind, args) {
      if (!q) return;
      lines.push("+" + sec(now()).toFixed(1) + "  " + kind + (args ? "  " + args : ""));
      if (lines.length > CAP) lines.shift();
    }
    function hit(st, why) {
      counts[st]++; last = { state: st, action: ACT[st], src: "home", why: why };
      log("jev", st + " " + why);
    }
    function input() {
      var t = now();
      if (!q || hidden) return;
      if (t - q.step >= PAUSE_S * 1000) log("pause", Math.round((t - q.step) / 1000) + "s");
      q.step = t; q.depth = 0;
    }
    function ev(name, p) {
      p = p || {};
      var t = now();
      if (name === "q_open") {
        if (q && q.code === p.code) return;                              // a re-render of the same item
        if (q) flowRun = q.ok && !q.bad ? flowRun + 1 : 0;              // the item before it ends here
        q = { code: p.code, open: t, from: t, step: t, depth: 0, ok: false, bad: false, help: false, picks: [], fast: 0, errAt: 0 };
        lines = []; log("q_open", (p.code || "?") + " " + (p.type || "?"));
        if (flowRun) hit("F", "run=" + flowRun);
        return;
      }
      if (!q) return;
      if (name === "pick") {
        if (p.verdict !== "correct" && p.verdict !== "wrong") return;
        var ds = (t - q.from) / 1000, ch = p.choice == null ? "" : String(p.choice);
        (hist[q.code] = hist[q.code] || []).push(Math.round(ds));
        if (hist[q.code].length > HIST_CAP) hist[q.code].shift();
        log("pick", (ch || "-") + " " + p.verdict + (p.tries_left != null ? " tries_left=" + p.tries_left : ""));
        var fast = sec(t) < FAST_OPEN_S || (q.errAt && (t - q.errAt) / 1000 < FAST_ERR_S);
        var again = ch && q.picks.indexOf(ch) >= 0;
        q.fast = fast ? q.fast + 1 : 0;
        if (fast && (again || q.fast >= 2)) hit("S5", again ? "repeat " + ch : "fast x" + q.fast);
        if (ch) q.picks.push(ch);
        if (p.verdict === "wrong") { q.bad = true; q.errAt = t; }
        else if (!q.bad && !q.help && sec(t) < FLOW_S) q.ok = true;
        q.from = q.step = t; q.depth = 0;
        return;
      }
      if (name === "cluck_open") {
        if (p.auto) return;                                              // the desktop opens it by itself: not a help request
        q.help = true; q.ok = false;
        log("cluck", "open " + (p.tab || ""));
        if (sec(t) < HELP_S) hit("S7", "cluck at " + sec(t).toFixed(1) + "s");
        return;
      }
      if (name === "cluck_dwell") log("cluck", "close");
    }
    /* called on a timer: S2 fires once per depth step */
    function tick() {
      if (!q || hidden) return;
      var lim = p75(hist[q.code]), d = Math.floor((now() - q.step) / 1000 / lim);
      if (d > q.depth) { q.depth = d; hit("S2", "depth=" + d + " p75=" + lim + "s"); }
    }
    function vis(isHidden) {
      if (!q || hidden === isHidden) return;
      hidden = isHidden; log(isHidden ? "hide" : "show");
      if (!isHidden) { q.step = now(); q.depth = 0; }                   // back from away: a fresh step, never an impasse
    }
    return {
      ev: ev, input: input, tick: tick, vis: vis,
      state: function () {
        return { last: last, counts: Object.assign({}, counts), flowRun: flowRun, lines: lines.slice(), code: q && q.code };
      }
    };
  }
  W.__stemJev = { create: create, p75: p75, ACT: ACT };

  /* ---- the flag ---- */
  var on = false;
  try {
    var f = new URLSearchParams(location.search).get("jev");
    if (f === "1") localStorage.setItem("stem-jev", "1");
    if (f === "0") localStorage.removeItem("stem-jev");
    var tm = W.__stemTelemetry;
    on = localStorage.getItem("stem-jev") === "1" && !(tm && (tm.optedOut(navigator, W) || tm.userOff(localStorage)));
  } catch (e) { on = false; }
  if (!on) return;

  var HK = "stem-jev-h", hist;
  try { hist = JSON.parse(localStorage.getItem(HK) || "{}") || {}; } catch (e) { hist = {}; }
  var save = function () { try { localStorage.setItem(HK, JSON.stringify(hist)); } catch (e) { /* storage full / blocked */ } };
  var jev = create(function () { return performance.now(); }, hist);
  var old = W.stemT;
  W.stemT = function (name, props) {
    try { jev.ev(name, props); if (name === "pick") save(); } catch (e) { /* never break the app */ }
    return old && old(name, props);
  };
  ["pointerdown", "keydown", "input", "wheel"].forEach(function (k) {
    document.addEventListener(k, function () { try { jev.input(); } catch (e) { /* ignore */ } }, { capture: true, passive: true });
  });
  document.addEventListener("visibilitychange", function () { jev.vis(document.hidden); });
  setInterval(jev.tick, 5000);
  W.stemJev = jev.state;
})();
