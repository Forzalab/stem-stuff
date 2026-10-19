/* Jev J1 + J2 (brain SPRINT §Render track P5; PATH.md §4): the event-line log + the homebrew rule counters, client only.
   🔒 Tony Oct 18: states F flow / S2 impasse / S5 guess-spam / S7 help abuse only; the rest are parked. J5 (🔒 Tony 18:5x) adds S6 + Q.
   Nothing leaves the device (J0 privacy text not done): lines + counters live in memory, the S2 step history in localStorage.
   Flag, default OFF: ?jev=1 turns it on for this device (localStorage stem-jev=1), ?jev=0 off. Also off with stem-t-off / DNT / GPC.
   Off = this file defines window.__stemJev (pure, for tests/intent.test.mjs) and does nothing else.
   On  = wraps window.stemT (app.js hook lines, telemetry.js keeps working) + 4 passive input listeners; window.stemJev reads the state.
   Line = "+SS.s  kind  args", seconds since q_open, no typed text. Rules (SPRINT §Jev rules; "ours" = J3 bench start values):
     F   item right, no wrong pick, < 80 s, no Cluck opened by hand → flow run +1; anything else on the item ends the run
     S2  no input for longer than p75 of this item's past steps (q_open or pick → next pick) (< 4 samples: 80 s, ours); depth = gap / p75
     S5  a fast pick (< 5 s after q_open or < 8 s after a wrong pick) that repeats a choice, or 2 fast picks in a row
     S7  Cluck opened by hand < 5 s after q_open (answer views come with the P3 view events)
     S6  ≥ 2 wrong picks on the item, Cluck not opened by hand on it nor on the last 3 items, skill not high (first-try right rate over the
         last 8 items ≤ 0.75, or < 4 items yet; ours). High skill retrying alone = fine (Aleven 2006) → none
     Q   (first item of this visit, no pick, no help, depth ≥ 1: the "refusal" shape, Botelho 2019) OR (left this item unsolved before on
         this device AND depth ≥ 2; Karumbaiah 2018). Past leaves live in localStorage stem-jev-q (code → count), nothing else
   J5 Cluck nudge, Tier 0 (brain cluck-nudge.md): S2 at depth ≥ 2, S6 and Q may each pick `cluck_say` = Cluck's peek (peek.js
   stemDuck.say, the one seam) carrying one line from copy/nudge-lines.js. On-device only, no LLM, no student turn used.
     budget  one shared budget: P_ONE = the fire chance when one trigger is on; with k of the 3 on, each live state rolls p_k once per
             item so that P(any | all k fire) = P_ONE × share(k); share(3) = SHARE_ALL = 0.85 (ours, J3 tunes), share(1) = 1, linear between
     caps    max 1 per item · ≥ GAP_S (3 min) since the last one · never in F flow (a run alive, no wrong pick on this item) · never while
             typing (a key < TYPING_S ago) · never while hidden · the peek must be free (one duck). A dismiss (the peek put away
             without a tap) doubles the gap (art. 7: a wrong nag costs more than a missed cue). S8 freeze has no detector (SPRINT): none */
(function () {
  "use strict";
  var W = window;
  var FLOW_S = 80, S2_FALLBACK_S = 80, S2_MIN_N = 4, FAST_OPEN_S = 5, FAST_ERR_S = 8, HELP_S = 5, PAUSE_S = 5, CAP = 40, HIST_CAP = 20;
  var ACT = { F: "none", S2: "hint_offer", S5: "slow_cue", S6: "cluck_say", S7: "predict_first", Q: "cluck_say" };   // J5 draws cluck_say (S2 from depth 2 too); the rest wait for J4
  var S6_WRONG = 2, S6_HELP_N = 3, SKILL_N = 8, SKILL_MIN_N = 4, SKILL_HIGH = 0.75;
  /* J5 nudge constants, all "ours" (J3 bench start values) */
  var NUDGE = { ACT: "cluck_say", STATES: ["S2", "S6", "Q"], P_ONE: 0.7, SHARE_ALL: 0.85, GAP_S: 180, TYPING_S: 3, S2_DEPTH: 2, Q_DEPTH: 2 };

  /* the share of P_ONE left when k of the n nudge states are on: 1 for one, SHARE_ALL for all, linear between */
  function share(k, n) { n = n || NUDGE.STATES.length; return k <= 1 ? 1 : 1 - (1 - NUDGE.SHARE_ALL) * (k - 1) / (n - 1); }
  /* each live state's roll, once per item, so that 1 − (1 − p)^k = P_ONE × share(k) */
  function chance(k, pOne) {
    pOne = pOne == null ? NUDGE.P_ONE : pOne;
    return k <= 1 ? pOne : 1 - Math.pow(1 - pOne * share(k), 1 / k);
  }

  function p75(xs) {
    if (!xs || xs.length < S2_MIN_N) return S2_FALLBACK_S;
    var s = xs.slice().sort(function (a, b) { return a - b; });
    return s[Math.ceil(s.length * 0.75) - 1];
  }

  /* one learner session. now() = ms; hist = { code: [step seconds] } (the caller stores it).
     o (J5, all optional): say(line, state) → true when the peek showed it · lines = { S2: [...], S6, Q } · on = the nudge states turned on
     (default all 3) · rand() in [0, 1) · quits = { code: times left unsolved } (the caller stores it) */
  function create(now, hist, o) {
    hist = hist || {}; o = o || {};
    var q = null, lines = [], last = null, flowRun = 0, hidden = false, items = 0, keyAt = -Infinity, firsts = [], helps = [];
    var counts = { F: 0, S2: 0, S5: 0, S6: 0, S7: 0, Q: 0 };
    var on = (o.on || NUDGE.STATES).filter(function (s) { return NUDGE.STATES.indexOf(s) >= 0; });
    var pk = chance(on.length), rand = o.rand || Math.random, pool = o.lines || {}, quits = o.quits || {};
    var nz = { n: 0, at: -Infinity, gap: NUDGE.GAP_S, dismissed: 0, taps: 0, last: null, prev: {}, up: false };
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
    function input(kind) {
      var t = now();
      if (kind === "keydown" || kind === "input") keyAt = t;
      if (!q || hidden) return;
      if (t - q.step >= PAUSE_S * 1000) log("pause", Math.round((t - q.step) / 1000) + "s");
      q.step = t; q.depth = 0;
    }
    function ev(name, p) {
      p = p || {};
      var t = now();
      if (name === "q_open") {
        if (q && q.code === p.code) return;                              // a re-render of the same item
        if (q) { flowRun = q.ok && !q.bad ? flowRun + 1 : 0; done(); }  // the item before it ends here
        items++;
        q = { code: p.code, open: t, from: t, step: t, depth: 0, ok: false, bad: false, help: false, picks: [], fast: 0, errAt: 0,
          wrong: 0, first: null, solved: false, firstItem: items === 1, nudged: false, rolled: {}, s6: false, q: false };
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
        if (q.first == null) q.first = p.verdict === "correct";
        if (p.verdict === "wrong") { q.bad = true; q.errAt = t; q.wrong++; }
        else { q.solved = true; if (!q.bad && !q.help && sec(t) < FLOW_S) q.ok = true; }
        q.from = q.step = t; q.depth = 0;
        if (!q.s6 && s6()) { q.s6 = true; hit("S6", "wrong=" + q.wrong); }
        nudges();
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
    /* called on a timer: S2 fires once per depth step; Q once per item; then a nudge may go */
    function tick() {
      if (!q || hidden) return;
      var lim = p75(hist[q.code]), d = Math.floor((now() - q.step) / 1000 / lim);
      if (d > q.depth) { q.depth = d; hit("S2", "depth=" + d + " p75=" + lim + "s"); }
      if (!q.q && qRule()) { q.q = true; hit("Q", q.firstItem && !q.picks.length ? "first item, no pick" : "left before x" + quits[q.code]); }
      nudges();
    }
    function vis(isHidden) {
      if (!q || hidden === isHidden) return;
      hidden = isHidden; log(isHidden ? "hide" : "show");
      if (!isHidden) { q.step = now(); q.depth = 0; }                   // back from away: a fresh step, never an impasse
    }
    /* the item ends (next item): skill + help history for S6 */
    function done() {
      if (q.first != null) { firsts.push(q.first); if (firsts.length > SKILL_N) firsts.shift(); }
      helps.push(q.help); if (helps.length > S6_HELP_N) helps.shift();
    }
    function s6() {
      if (q.wrong < S6_WRONG || q.help || q.solved || helps.indexOf(true) >= 0) return false;
      if (firsts.length < SKILL_MIN_N) return true;
      return firsts.filter(Boolean).length / firsts.length <= SKILL_HIGH;
    }
    function qRule() {
      if (q.help || q.solved) return false;
      return (q.firstItem && !q.picks.length && q.depth >= 1) || ((quits[q.code] || 0) >= 1 && q.depth >= NUDGE.Q_DEPTH);
    }

    /* ---- J5: the nudge gate. The live states in table order; each rolls once per item; the caps hold a roll for later ---- */
    function live() {
      if (q.help || q.solved) return [];
      return on.filter(function (st) { return st === "S2" ? q.depth >= NUDGE.S2_DEPTH : st === "S6" ? q.s6 : q.q; });
    }
    function block(t) {
      if (q.nudged) return "item";
      if (hidden) return "hidden";
      if (flowRun > 0 && !q.bad) return "flow";
      if ((t - keyAt) / 1000 < NUDGE.TYPING_S) return "typing";
      if ((t - nz.at) / 1000 < nz.gap) return "gap";
      return "";
    }
    function nudges() {
      var sts = live(), t = now();
      if (!sts.length || block(t)) return;
      for (var i = 0; i < sts.length; i++) {
        var st = sts[i];
        if (q.rolled[st]) continue;
        q.rolled[st] = 1;
        if (rand() >= pk) { log("jev", "nudge " + st + " pass"); continue; }
        var line = pick(st);
        if (!line || !o.say || !o.say(line, st)) { log("jev", "nudge " + st + " busy"); continue; }
        q.nudged = true; nz.n++; nz.at = t; nz.up = true; nz.prev[st] = line;
        nz.last = { state: st, line: line, code: q.code };
        last = { state: st, action: NUDGE.ACT, src: "home", why: "nudge", line: line };
        log("jev", "nudge " + st + " say");
        return;
      }
    }
    function pick(st) {
      var all = pool[st] || [], xs = all.filter(function (l) { return l !== nz.prev[st]; });   // never the same line twice in a row
      if (!xs.length) xs = all;
      return xs[Math.floor(rand() * xs.length)] || "";
    }
    /* the peek went: a tap = taken; put away without a tap = a dismiss → the gap doubles */
    function nudgeEnd(tapped) {
      if (!nz.up) return;
      nz.up = false;
      if (tapped) { nz.taps++; log("jev", "nudge tap"); }
      else { nz.dismissed++; nz.gap *= 2; log("jev", "nudge away gap=" + nz.gap + "s"); }
    }
    /* the page goes with this item open and unsolved: one "left before" for Q next time */
    function leave() {
      if (!q || q.solved) return false;
      quits[q.code] = (quits[q.code] || 0) + 1;
      return true;
    }
    return {
      ev: ev, input: input, tick: tick, vis: vis, nudgeEnd: nudgeEnd, leave: leave,
      state: function () {
        return { last: last, counts: Object.assign({}, counts), flowRun: flowRun, lines: lines.slice(), code: q && q.code,
          nudge: { n: nz.n, gap: nz.gap, dismissed: nz.dismissed, taps: nz.taps, last: nz.last, p: pk, on: on.slice() } };
      }
    };
  }
  W.__stemJev = { create: create, p75: p75, ACT: ACT, NUDGE: NUDGE, share: share, chance: chance };

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

  var HK = "stem-jev-h", QK = "stem-jev-q";
  function get(k) { try { return JSON.parse(localStorage.getItem(k) || "{}") || {}; } catch (e) { return {}; } }
  function put(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage full / blocked */ } }
  var hist = get(HK), quits = get(QK);
  var save = function () { put(HK, hist); };
  /* J5, the one seam to the peek (peek.js stemDuck.say): Jev decides, the peek only shows the line and tells back how it went */
  var jev = create(function () { return performance.now(); }, hist, {
    lines: W.__stemNudgeLines, quits: quits,
    rand: typeof W.__stemJevRand === "function" ? W.__stemJevRand : Math.random,   // tests pin the roll; the app never sets it
    say: function (line) {
      var d = W.stemDuck;
      return !!(d && d.say && d.say(line, { onTap: function () { jev.nudgeEnd(true); }, onAway: function () { jev.nudgeEnd(false); } }));
    }
  });
  var old = W.stemT;
  W.stemT = function (name, props) {
    try { jev.ev(name, props); if (name === "pick") save(); } catch (e) { /* never break the app */ }
    return old && old(name, props);
  };
  ["pointerdown", "keydown", "input", "wheel"].forEach(function (k) {
    document.addEventListener(k, function () { try { jev.input(k); } catch (e) { /* ignore */ } }, { capture: true, passive: true });
  });
  document.addEventListener("visibilitychange", function () { jev.vis(document.hidden); });
  if (W.addEventListener) W.addEventListener("pagehide", function () { if (jev.leave()) put(QK, quits); });
  setInterval(jev.tick, 5000);
  W.stemJev = jev.state;
})();
