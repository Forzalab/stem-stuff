/* Rewards engine + HUD for the sugar-mode mock. Sets window.Rewards. Spec: design/REWARDS.md */
(function () {
  'use strict';
  var KEY = 'stem-rw', CAP_MS = 60000;
  var LINES = ["QUACK! Brain +1.", "Clean hit. Keep rolling.", "That one was earned.", "Duck approves. Rare.",
    "Formula fed. Duck fed.", "Physics is scared of you.", "Streak sauce added.", "You did not guess that. Nice.",
    "Momentum conserved.", "Energy: fully stored.", "Free body, free XP.", "Newton nods slowly.",
    "Friction cannot stop you.", "Net force: forward.", "Quack quack, combo pack.", "Golden feather incoming…",
    "Torque? More like talk less, solve more.", "Spring loaded. Released.", "Centripetal? Central to the win.",
    "Exam 2 just got nervous."];
  var LEGEND = ["THE GOLDEN DUCK HAS NOTICED YOU.", "Achievement: Physics Goblin.", "Cluck sheds one proud tear."];
  // snack-run length 0/1/2/3 weights: base, struggling (<85%), cruising (>90%)
  var W_BASE = [30, 35, 25, 10], W_LOW = [15, 30, 35, 20], W_HIGH = [45, 35, 15, 5];
  // icons: Microsoft Fluent Emoji Color, MIT (icons/)
  var IC = function (n) { return '<img src="icons/' + n + '_color.svg" alt="" draggable="false">'; };

  var s, ui = null, lastLine = -1, shownLvl = null, raf = 0;

  function fresh() { return { xp: 0, streak: 0, dry: 0, lastBurst: 0, real: 0, snacks: 0, hist: [], queue: [] }; }
  function load() {
    var d = fresh();
    try { var j = JSON.parse(localStorage.getItem(KEY)); if (j) for (var k in d) if (j[k] != null) d[k] = j[k]; } catch (e) {}
    return d;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} }
  s = load();

  var ri = function (a, b) { return a + Math.floor(Math.random() * (b - a + 1)); };
  function weighted(w) { var r = Math.random() * 100; for (var i = 0; i < w.length; i++) if ((r -= w[i]) < 0) return i; return w.length - 1; }
  // cumulative XP to reach level L: per-level cost 30, 40, 50 …
  function floorOf(L) { return 20 * (L - 1) + 5 * (L - 1) * L; }
  function levelOf(xp) { var L = 1; while (floorOf(L + 1) <= xp) L++; return L; }
  function rate() { return s.hist.length ? s.hist.reduce(function (a, b) { return a + b; }, 0) / s.hist.length : null; }
  function commonLine() { var i; do i = ri(0, LINES.length - 1); while (i === lastLine); lastLine = i; return LINES[i]; }
  var reduced = function () { return !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); };

  function state() {
    var L = levelOf(s.xp), f = floorOf(L), n = floorOf(L + 1);
    return { xp: s.xp, level: L, floor: f, next: n, toNext: n - s.xp, streak: s.streak, dry: s.dry, real: s.real, snacks: s.snacks, rate: rate() };
  }

  // queue holds the pending snack run; empty → real. Runs are rolled only when a real finishes, so never back to back.
  function nextKind() {
    if (!s.queue.length) return 'real';
    s.queue.shift(); save(); return 'snack';
  }
  function rollRun() {
    var r = s.hist.length >= 5 ? rate() : null;
    var w = r == null ? W_BASE : r < 0.85 ? W_LOW : r > 0.9 ? W_HIGH : W_BASE;
    s.queue = []; for (var n = weighted(w); n > 0; n--) s.queue.push('snack');
  }

  function answer(o) {
    o = o || {};
    var first = !!o.firstTry, L0 = levelOf(s.xp), big = null;
    var r = { xp: 0, levelUp: false, level: L0, drop: null, line: null, sub: null, streakNote: null, burst: null, toast: false, streak: 0 };
    if (first) { s.hist.push(o.correct ? 1 : 0); if (s.hist.length > 10) s.hist.shift(); }
    if (!o.correct) s.streak = Math.floor(s.streak / 2);
    else {
      if (o.snack) s.snacks++; else s.real++;
      if (first) {
        s.streak++;
        r.xp = o.peeked ? 2 : o.snack ? ri(3, 5) : ri(9, 12);   // peeked at the worked twin: 2 XP, no roll (spec v2 1b)
        var p = Math.min(0.5, (o.snack ? 0.10 : 0.25) + 0.05 * s.streak);
        if (!o.peeked && (o.dwellMs || 0) >= 1000 && (s.dry >= 6 || Math.random() < p)) {
          var q = Math.random() * 100;
          r.drop = q < 80 ? 'common' : q < 97 ? 'rare' : 'legend';
          s.dry = 0;
        } else if (!o.peeked) s.dry++;                       // a peeked answer never feeds the pity timer
        if (r.drop === 'common') r.line = commonLine();
        else if (r.drop === 'rare') { r.line = 'BONUS LEVEL!'; r.sub = commonLine(); big = 'bonus'; }
        else if (r.drop === 'legend') { r.line = LEGEND[ri(0, LEGEND.length - 1)]; r.sub = '+50 XP'; r.xp += 50; big = 'legend'; }
        if (s.streak === 3 || s.streak === 5 || s.streak % 10 === 0) r.streakNote = s.streak + ' in a row';
      }
    }
    if (!o.snack && (o.correct || !first)) rollRun();   // real question finished
    s.xp += r.xp;
    r.level = levelOf(s.xp); r.levelUp = r.level > L0;
    var now = Date.now();
    if (r.levelUp) { r.burst = 'levelup'; s.lastBurst = now; }               // level up beats the cap
    else if (big && now - s.lastBurst >= CAP_MS) { r.burst = big; s.lastBurst = now; }
    r.toast = !!r.drop && (!big || r.burst !== big);
    r.streak = s.streak;
    save();
    return r;
  }

  function mountHUD(topEl, dockEl) {
    if (ui || !topEl || !dockEl) return;
    topEl.classList.add('rw-top');
    topEl.innerHTML = '<div class="rw-row">' +
      '<div class="rw-pill rw-coin" id="coinPill" aria-label="Total XP"><span class="rw-coin-ic">' + IC('coin') + '</span><b class="rw-num">0</b></div>' +
      '<div class="rw-pill rw-lvl" aria-label="Level"><span class="rw-star">' + IC('star') + '<b>1</b></span>' +
      '<span class="rw-lvl-body"><span class="rw-bar"><i></i></span><span class="rw-to"></span></span></div></div>';
    dockEl.classList.add('rw-dock');
    dockEl.innerHTML = '<div class="rw-row">' +
      '<span class="rw-streak" aria-label="Streak"><span class="rw-flame">' + IC('fire') + '</span><b>0</b></span>' +
      '<span class="rw-counts"></span><button class="rw-reset" type="button">reset</button></div>';
    var q = function (el, sel) { return el.querySelector(sel); };
    ui = { xp: q(topEl, '.rw-num'), lvl: q(topEl, '.rw-lvl'), lvlN: q(topEl, '.rw-star b'), bar: q(topEl, '.rw-bar i'), to: q(topEl, '.rw-to'),
      flame: q(dockEl, '.rw-flame'), streak: q(dockEl, '.rw-streak b'), counts: q(dockEl, '.rw-counts') };
    ui.lvl.addEventListener('animationend', function () { ui.lvl.classList.remove('rw-pulse'); });
    q(dockEl, '.rw-reset').addEventListener('click', function () { reset(); render(0); });
    render(0);
  }

  function countUp(to, gain) {
    cancelAnimationFrame(raf);
    if (!gain || reduced()) { ui.xp.textContent = to; return; }
    var from = to - gain, t0 = performance.now();
    (function step(t) {
      var k = Math.min(1, Math.max(0, (t - t0) / 600));
      ui.xp.textContent = Math.round(from + gain * (1 - Math.pow(1 - k, 3)));
      if (k < 1) raf = requestAnimationFrame(step);
    })(t0);
  }

  function render(gain) {
    if (!ui) return;
    var st = state();
    countUp(st.xp, +gain || 0);
    ui.lvlN.textContent = st.level;
    ui.bar.style.setProperty('--p', (st.xp - st.floor) / (st.next - st.floor));
    ui.to.innerHTML = '<b>' + st.toNext + ' XP</b> to LEVEL ' + (st.level + 1);
    if (shownLvl != null && st.level > shownLvl && !reduced()) {
      ui.lvl.classList.remove('rw-pulse'); void ui.lvl.offsetWidth; ui.lvl.classList.add('rw-pulse');
    }
    shownLvl = st.level;
    ui.streak.textContent = st.streak;
    ui.flame.style.setProperty('--fs', 1 + Math.min(st.streak, 10) * 0.04);
    ui.flame.classList.toggle('rw-lit', st.streak > 0);
    ui.counts.innerHTML = 'real <b>' + st.real + '</b> · snacks <b>' + st.snacks + '</b>';
  }

  function reset() {
    s = fresh(); lastLine = -1; shownLvl = null;
    try { localStorage.removeItem(KEY); } catch (e) {}
  }

  window.Rewards = { state: state, nextKind: nextKind, answer: answer, mountHUD: mountHUD, render: render, reset: reset };
})();
