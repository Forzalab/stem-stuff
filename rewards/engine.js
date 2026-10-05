/* rewards/engine.js: the sugar reward engine + HUD (design/REWARDS-WIRING.md; spec: brain projects/calc/topics/sugar-rewards.md;
   mock and research: design/rewards/, design/REWARDS.md). Sets window.Rewards. Inert until app.js calls Rewards.use(key) in sugar mode:
   no DOM, no listeners, no storage before that, so diet is untouched.
   State: localStorage "stem-rw:<bank code | file:name | solo>", one per bank, per device. Every access in try/catch.
   Dead easy, a participation trophy (Tony, Oct 4). XP: real first try 12-16, a 2-choice True/False row 8-10, snack 6, peeked at the
   original 2; a second-try correct 6 (snack 3); a wrong try +1 "for trying". Each code's correct pays once.
   Drop roll on every correct held >= 1 s (a peek at the original still rolls none): p = 0.6 real, 0.5 True/False, 0.45 snack; pity after
   2 dry; common 70 / rare 25 / legend 5.
   The streak never halves: a wrong try only pauses it; any correct adds one. A wrong try never rolls (no loss dressed up as a win). */
(function (g) {
  'use strict';
  var PRE = 'stem-rw:', CAP_MS = 15000, cfg = { minDwell: 1000 };
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
  // cumulative XP to reach level L: per-level cost 20, 30, 40 ...
  function floorOf(L) { return 20 * (L - 1) + 5 * (L - 1) * (L - 2); }
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
    var r = { xp: 0, levelUp: false, level: 1, drop: null, line: null, sub: null, streakNote: null, burst: null, toast: false, streak: 0, paid: false, tick: false };
    if (!s) return r;
    s = load();                                                    // another tab may have written since
    var code = o.code || '', first = !!o.firstTry, L0 = levelOf(s.xp), big = null;
    r.level = L0; r.streak = s.streak;
    if (code && s.paid[code]) return r;                            // a code pays once (reload, a reset by Tony, two tabs)
    if (first) { s.hist.push(o.correct ? 1 : 0); if (s.hist.length > 10) s.hist.shift(); }
    if (!o.correct) {
      if (code) s.missed[code] = 1;
      r.xp = 1; r.tick = true;                                      // "for trying": tiny, no fanfare, the streak just waits
    } else {
      if (code) s.paid[code] = 1;
      r.paid = true;
      if (o.snack) s.snacks++; else s.real++;
      s.streak++;
      r.xp = !first ? (o.snack ? 3 : 6) : o.peeked ? 2 : o.snack ? 6 : o.tf ? ri(8, 10) : ri(12, 16);
      var p = o.snack ? 0.45 : o.tf ? 0.5 : 0.6;
      if (!o.peeked && (o.dwellMs || 0) >= cfg.minDwell && (s.dry >= 2 || Math.random() < p)) {
        var q = Math.random() * 100;
        r.drop = q < 70 ? 'common' : q < 95 ? 'rare' : 'legend';
        s.dry = 0;
      } else if (!o.peeked) s.dry++;
      if (r.drop === 'common') { r.line = commonLine(); big = 'win'; }
      else if (r.drop === 'rare') { r.line = 'BONUS!'; r.sub = commonLine(); big = 'bonus'; }
      else if (r.drop === 'legend') { r.line = LEGEND[ri(0, LEGEND.length - 1)]; r.sub = '+50 XP'; r.xp += 50; big = 'legend'; }
      if (s.streak === 3 || s.streak === 5 || s.streak % 10 === 0) r.streakNote = s.streak + ' in a row';
    }
    s.xp += r.xp;
    r.level = levelOf(s.xp); r.levelUp = r.level > L0;
    var now = Date.now();
    if (r.levelUp && !r.tick) { r.burst = 'levelup'; s.lastBurst = now; }    // a level up beats the cap (a +1 for trying stays quiet)
    else if (big && now - s.lastBurst >= CAP_MS) { r.burst = big; s.lastBurst = now; }
    r.toast = !!r.drop && r.burst !== big;                                   // a capped drop becomes a toast
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

  /* one strip in the page flow (app.js puts it in the top bar's gap; HUD B, Tony Oct 5): XP balance, level star + bar + words, streak
     flame. One button over the strip opens "your progress" (a native popover: Escape and an outside tap close it, no key handler). */
  function mountHUD(el) {
    if (!el) return null;
    el.className = 'rw-hud rw-skin';
    el.setAttribute('role', 'group');
    el.innerHTML = '<span class="rw-coin" id="rwCoin"><span class="rw-coin-ic">' + img('coin') + '</span><b class="rw-num">0</b></span>' +
      '<span class="rw-lvl"><span class="rw-star">' + img('star') + '<b>1</b></span>' +
      '<span class="rw-lvl-body"><span class="rw-bar"><i></i></span><span class="rw-to"></span></span></span>' +
      '<span class="rw-streak"><span class="rw-flame">' + img('fire') + '</span><b>0</b></span>' +
      '<span class="rw-counts"></span>' +
      '<button type="button" class="rw-tap" aria-label="Your progress" popovertarget="rwPop"></button>';
    var pop = document.getElementById('rwPop');
    if (!pop) {
      pop = document.createElement('div'); pop.id = 'rwPop'; pop.className = 'rw-pop rw-skin'; pop.setAttribute('popover', '');
      pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Your progress');
      document.body.appendChild(pop);
      pop.addEventListener('beforetoggle', function (e) {
        if (e.newState !== 'open' || !ui) return;
        var r = ui.el.getBoundingClientRect(), w = Math.min(320, innerWidth - 24);
        pop.style.top = (r.bottom + 8) + 'px'; pop.style.left = Math.max(12, Math.min(r.right - w, innerWidth - w - 12)) + 'px'; pop.style.width = w + 'px';
      });
    }
    var q = function (sel) { return el.querySelector(sel); };
    ui = { el: el, xp: q('.rw-num'), lvl: q('.rw-lvl'), lvlN: q('.rw-star b'), bar: q('.rw-bar i'), to: q('.rw-to'),
      flame: q('.rw-flame'), streak: q('.rw-streak b'), counts: q('.rw-counts'), pop: pop };
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
    ui.counts.innerHTML = 'exam <b>' + st.real + '</b> · easy <b>' + st.snacks + '</b>';
    ui.pop.innerHTML = '<p class="rw-pop-h"><span class="rw-star">' + img('star') + '<b>' + st.level + '</b></span>Level ' + st.level + '</p>' +
      '<span class="rw-bar"><i></i></span><dl>' +
      '<dt>Next level</dt><dd>' + st.toNext + ' XP to go</dd><dt>Points</dt><dd>' + st.xp + ' XP</dd>' +
      '<dt>Streak</dt><dd>' + st.streak + ' right in a row</dd><dt>Exam questions</dt><dd>' + st.real + ' solved</dd>' +
      '<dt>Easy ones</dt><dd>' + st.snacks + ' solved</dd></dl>';
    ui.pop.querySelector('.rw-bar i').style.setProperty('--p', (st.xp - st.floor) / (st.next - st.floor));
    ui.el.setAttribute('aria-label', st.xp + ' XP (points), level ' + st.level + ', ' + st.toNext + ' XP to level ' + (st.level + 1) +
      ', ' + st.streak + ' in a row, ' + st.real + ' exam and ' + st.snacks + ' easy solved');
  }
  function config(o) { for (var k in o || {}) cfg[k] = o[k]; return cfg; }

  g.Rewards = { use: use, on: on, state: state, answer: answer, skipSnack: skipSnack, origLevel: origLevel, origSeen: origSeen,
    origSolved: origSolved, mountHUD: mountHUD, render: render, config: config, LINES: LINES, LEGEND: LEGEND };
})(typeof window !== 'undefined' ? window : globalThis);
