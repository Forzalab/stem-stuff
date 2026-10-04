/* rewards/engine.js: the sugar reward engine + HUD (design/REWARDS-WIRING.md; spec: brain projects/calc/topics/sugar-rewards.md;
   mock and research: design/rewards/, design/REWARDS.md). Sets window.Rewards. Inert until app.js calls Rewards.use(key) in sugar mode:
   no DOM, no listeners, no storage before that, so diet is untouched.
   State: localStorage "stem-rw:<bank code | file:name | solo>", one per bank, per device. Every access in try/catch.
   XP (first try only): real 9-12, a 2-choice True/False row 6-8, snack 3-5, peeked at the original 2, second try 0. Each code pays once.
   Drop roll on a first-try correct held >= 3 s: p = 0.25 real, 0.15 True/False, 0.10 snack, +0.05 per streak step (cap 0.5); pity after
   6 dry; common 80 / rare 17 / legend 3. A wrong answer halves the streak once per question and never rolls. */
(function (g) {
  'use strict';
  var PRE = 'stem-rw:', CAP_MS = 60000, cfg = { minDwell: 3000 };
  var LINES = ["QUACK! Brain +1.", "Clean hit. Keep rolling.", "That one was earned.", "Duck approves. Rare.",
    "Formula fed. Duck fed.", "Physics is scared of you.", "Streak sauce added.", "You did not guess that. Nice.",
    "Momentum conserved.", "Energy: fully stored.", "Free body, free XP.", "Newton nods slowly.",
    "Friction cannot stop you.", "Net force: forward.", "Quack quack, combo pack.", "Golden feather incoming…",
    "Torque? More like talk less, solve more.", "Spring loaded. Released.", "Centripetal? Central to the win.",
    "Exam 2 just got nervous."];
  var LEGEND = ["THE GOLDEN DUCK HAS NOTICED YOU.", "Achievement: Physics Goblin.", "Cluck sheds one proud tear."];
  var key = null, s = null, ui = null, lastLine = -1, shownLvl = null, raf = 0;

  var icon = function (n) { var m = g.RW_ICONS || {}; return m[n] || ('rewards/icons/' + n + '_color.svg'); };
  var img = function (n) { return '<img src="' + icon(n) + '" alt="" draggable="false">'; };
  function fresh() { return { xp: 0, streak: 0, dry: 0, lastBurst: 0, real: 0, snacks: 0, hist: [], paid: {}, missed: {}, orig: {} }; }
  function ls() { try { return g.localStorage || null; } catch (e) { return null; } }
  function load() {
    var d = fresh();
    try { var j = JSON.parse(ls().getItem(PRE + key)); if (j) for (var k in d) if (j[k] != null) d[k] = j[k]; } catch (e) { /* blocked or empty */ }
    return d;
  }
  function save() { try { ls().setItem(PRE + key, JSON.stringify(s)); } catch (e) { /* blocked: this page only */ } }
  /* the bank (or file, or "solo") whose state is live; switching re-reads it */
  function use(k) { k = String(k || 'solo'); if (k !== key) { key = k; s = load(); shownLvl = null; } else s = load(); render(0); return k; }
  function on() { return key !== null; }

  var ri = function (a, b) { return a + Math.floor(Math.random() * (b - a + 1)); };
  // cumulative XP to reach level L: per-level cost 30, 40, 50 ...
  function floorOf(L) { return 20 * (L - 1) + 5 * (L - 1) * L; }
  function levelOf(xp) { var L = 1; while (floorOf(L + 1) <= xp) L++; return L; }
  function rate() { return s.hist.length ? s.hist.reduce(function (a, b) { return a + b; }, 0) / s.hist.length : null; }
  function commonLine() { var i; do i = ri(0, LINES.length - 1); while (i === lastLine); lastLine = i; return LINES[i]; }
  var reduced = function () { try { return !!(g.matchMedia && g.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; } };

  function state() {
    if (!s) return null;
    var L = levelOf(s.xp), f = floorOf(L), n = floorOf(L + 1);
    return { xp: s.xp, level: L, floor: f, next: n, toNext: n - s.xp, streak: s.streak, dry: s.dry, real: s.real, snacks: s.snacks, rate: rate() };
  }
  /* the 85% rule as a skip (Tony via the lead, Oct 4): last 10 first tries all but perfect (> 90%) = the student is cruising */
  function skipSnack() { if (!s) return false; s = load(); return s.hist.length >= 10 && rate() > 0.9; }

  /* o: { code, correct, firstTry, snack, tf (2-choice True/False row), peeked, dwellMs } -> what to show */
  function answer(o) {
    o = o || {};
    var r = { xp: 0, levelUp: false, level: 1, drop: null, line: null, sub: null, streakNote: null, burst: null, toast: false, streak: 0, paid: false };
    if (!s) return r;
    s = load();                                                    // another tab may have written since
    var code = o.code || '', first = !!o.firstTry, L0 = levelOf(s.xp), big = null;
    r.level = L0; r.streak = s.streak;
    if (code && s.paid[code]) return r;                            // a code pays once (reload, a reset by Tony, two tabs)
    if (first) { s.hist.push(o.correct ? 1 : 0); if (s.hist.length > 10) s.hist.shift(); }
    if (!o.correct) {
      if (!code || !s.missed[code]) s.streak = Math.floor(s.streak / 2);   // once per question, never to 0 from a high run
      if (code) s.missed[code] = 1;
    } else {
      if (code) s.paid[code] = 1;
      r.paid = true;
      if (o.snack) s.snacks++; else s.real++;
      if (first) {
        s.streak++;
        r.xp = o.peeked ? 2 : o.snack ? ri(3, 5) : o.tf ? ri(6, 8) : ri(9, 12);
        var p = Math.min(0.5, (o.snack ? 0.10 : o.tf ? 0.15 : 0.25) + 0.05 * s.streak);
        if (!o.peeked && (o.dwellMs || 0) >= cfg.minDwell && (s.dry >= 6 || Math.random() < p)) {
          var q = Math.random() * 100;
          r.drop = q < 80 ? 'common' : q < 97 ? 'rare' : 'legend';
          s.dry = 0;
        } else if (!o.peeked) s.dry++;
        if (r.drop === 'common') r.line = commonLine();
        else if (r.drop === 'rare') { r.line = 'BONUS LEVEL!'; r.sub = commonLine(); big = 'bonus'; }
        else if (r.drop === 'legend') { r.line = LEGEND[ri(0, LEGEND.length - 1)]; r.sub = '+50 XP'; r.xp += 50; big = 'legend'; }
        if (s.streak === 3 || s.streak === 5 || s.streak % 10 === 0) r.streakNote = s.streak + ' in a row';
      }
    }
    s.xp += r.xp;
    r.level = levelOf(s.xp); r.levelUp = r.level > L0;
    var now = Date.now();
    if (r.levelUp) { r.burst = 'levelup'; s.lastBurst = now; }               // a level up beats the cap
    else if (big && now - s.lastBurst >= CAP_MS) { r.burst = big; s.lastBurst = now; }
    r.toast = !!r.drop && (!big || r.burst !== big);                         // a capped big drop becomes a toast
    r.streak = s.streak;
    save();
    return r;
  }

  /* the fading original (spec 1b) per Practice Exam question q: 1 = the first snack of q, the whole solution; 2 = a later snack, the
     last line hidden ("tap to peek"); 3 = after a first-try correct on a snack of q, folded away */
  function origLevel(q, code) {
    if (!s) return 1;
    var o = s.orig[q] || { codes: [], solved: false };
    if (o.solved) return 3;
    var i = o.codes.indexOf(code);
    return (i < 0 ? o.codes.length : i) === 0 ? 1 : 2;
  }
  function origSeen(q, code) {
    if (!s || q == null) return;
    s = load();
    var o = s.orig[q] = s.orig[q] || { codes: [], solved: false };
    if (o.codes.indexOf(code) < 0) { o.codes.push(code); save(); }
  }
  function origSolved(q) { if (!s || q == null) return; s = load(); (s.orig[q] = s.orig[q] || { codes: [], solved: false }).solved = true; save(); }

  /* one row, in the page flow (app.js puts it in the top bar): XP coin, level + bar, streak flame, real / snack counts */
  function mountHUD(el) {
    if (!el) return null;
    el.className = 'rw-hud rw-skin';
    el.setAttribute('role', 'img');
    el.innerHTML = '<span class="rw-pill rw-coin" id="rwCoin"><span class="rw-coin-ic">' + img('coin') + '</span><b class="rw-num">0</b></span>' +
      '<span class="rw-pill rw-lvl"><span class="rw-star">' + img('star') + '<b>1</b></span>' +
      '<span class="rw-lvl-body"><span class="rw-bar"><i></i></span><span class="rw-to"></span></span></span>' +
      '<span class="rw-streak"><span class="rw-flame">' + img('fire') + '</span><b>0</b></span>' +
      '<span class="rw-counts"></span>';
    var q = function (sel) { return el.querySelector(sel); };
    ui = { el: el, xp: q('.rw-num'), lvl: q('.rw-lvl'), lvlN: q('.rw-star b'), bar: q('.rw-bar i'), to: q('.rw-to'),
      flame: q('.rw-flame'), streak: q('.rw-streak b'), counts: q('.rw-counts') };
    ui.lvl.addEventListener('animationend', function () { ui.lvl.classList.remove('rw-pulse'); });
    shownLvl = null;
    render(0);
    return el;
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
    if (!ui || !s || !ui.el.isConnected) return;
    var st = state();
    countUp(st.xp, +gain || 0);
    ui.lvlN.textContent = st.level;
    ui.bar.style.setProperty('--p', (st.xp - st.floor) / (st.next - st.floor));
    ui.to.innerHTML = '<b>' + st.toNext + ' XP</b> to level ' + (st.level + 1);
    if (shownLvl != null && st.level > shownLvl && !reduced()) {
      ui.lvl.classList.remove('rw-pulse'); void ui.lvl.offsetWidth; ui.lvl.classList.add('rw-pulse');
    }
    shownLvl = st.level;
    ui.streak.textContent = st.streak;
    ui.flame.style.setProperty('--fs', 1 + Math.min(st.streak, 10) * 0.04);
    ui.flame.classList.toggle('rw-lit', st.streak > 0);
    ui.counts.innerHTML = 'real <b>' + st.real + '</b> · snacks <b>' + st.snacks + '</b>';
    ui.el.setAttribute('aria-label', st.xp + ' XP, level ' + st.level + ', ' + st.toNext + ' XP to level ' + (st.level + 1) +
      ', streak ' + st.streak + ', ' + st.real + ' real solved, ' + st.snacks + ' snacks');
  }
  function config(o) { for (var k in o || {}) cfg[k] = o[k]; return cfg; }

  g.Rewards = { use: use, on: on, state: state, answer: answer, skipSnack: skipSnack, origLevel: origLevel, origSeen: origSeen,
    origSolved: origSolved, mountHUD: mountHUD, render: render, config: config, LINES: LINES, LEGEND: LEGEND };
})(typeof window !== 'undefined' ? window : globalThis);
