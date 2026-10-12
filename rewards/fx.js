/* rewards/fx.js: the sugar reward FX (pops, sparks, coins, drop banner, slot reels, full-screen bursts). Port of design/rewards/fx.js
   for the app (design/REWARDS-WIRING.md §5): icons from window.RW_ICONS (rewards/icons.js, Fluent Emoji, MIT), canvas-confetti from
   vendor/ (ISC). Every node it adds is aria-hidden (app.js says the words once) and carries .rw-skin (rewards/rewards.css tokens).
   Nothing runs until app.js calls a function (diet never does), except one passive pointerdown listener that only settles a wiggling
   sugar Cluck chip (.rw-chip; diet has none). */
(function () {
  'use strict';
  const MQ = matchMedia('(prefers-reduced-motion: reduce)');
  const still = () => MQ.matches;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = a => a[Math.random() * a.length | 0];
  const mk = (tag, cls, html) => { const e = document.createElement(tag); e.className = cls; if (html) e.innerHTML = html; return e; };
  const host = cls => { const e = mk('div', cls + ' rw-skin'); e.setAttribute('aria-hidden', 'true'); return document.body.appendChild(e); };
  const src = n => (window.RW_ICONS || {})[n.replace(/_color$/, '')] || `rewards/icons/${n}.svg`;
  const txt = (tag, cls, s) => { const e = mk(tag, cls); e.textContent = s; return e; };
  const mid = el => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
  const img = (n, cls) => `<img src="${src(n)}" alt="" draggable="false"${cls ? ` class="${cls}"` : ''}>`;
  // animate a node, then remove it; resolves either way
  const run = (n, kf, o) => n.animate(kf, o).finished.catch(() => {}).then(() => n.remove());
  const EASE = { pop: 'cubic-bezier(.16,1,.3,1)', out: 'cubic-bezier(.2,.8,.3,1)' };
  const popKF = (s, o = 0) => [{ transform: 'scale(1)', opacity: 1 }, { transform: `scale(${s})`, opacity: 1, offset: .4 }, { transform: 'scale(1)', opacity: o || 1 }];
  const enterKF = (from) => [{ transform: `scale(${from})`, opacity: 0 }, { transform: 'scale(1.1)', opacity: 1, offset: .6 }, { transform: 'scale(1)', opacity: 1 }];
  const COLORS = ['#ff8a1f', '#ffd36b', '#d63fa8', '#fff3b0', '#ffb347'];
  const COUNT = { small: 10, medium: 18, large: 30 }, DIST = { small: 70, medium: 105, large: 145 }, CONF = { small: 24, medium: 40, large: 70 };

  /* ---------- one blink (STYLE.md §1.6, §2.8; design/shots/blink-fx-2026-10-12) ----------
     Every call app.js makes joins ONE queue; a step starts only when the one before has finished, so at most one group moves at a time:
     the answer's own pulse -> sparks, "+N XP" and coins (the FX layer) -> the HUD (shine, bar, level pulse) -> slots -> burst -> banner.
     Calls for the same group made before their step starts share it. While the queue runs the HUD bar and level pulse wait (.fx-hold)
     and a Cluck chip's ad wiggle stops (.fx-busy). Reduced motion: the whole sequence gets one fade (the first overlay or banner); the
     rest is instant. Triggers, odds, XP and payouts are rewards/engine.js's and app.js's; this only orders what is drawn. */
  const Q = [], ROOT = document.documentElement, CAP = 5000, GRACE = 400;
  let busy = false, lastEnd = -1e9, fadeLeft = true, pinned = null, snap = false;
  const fin = a => a.finished.then(() => {}, () => {});
  const finite = a => a.playState === 'running' && a.effect && a.effect.getComputedTiming().endTime !== Infinity;
  const moving = (root, skip) => (root ? (root === document ? document.getAnimations() : root.getAnimations({ subtree: true })) : [])
    .filter(a => finite(a) && !(skip && a.effect.target && a.effect.target.closest && a.effect.target.closest(skip)));
  // wait until nothing (finite) moves in root; skip = what is not this step's (chip, FX nodes, HUD)
  const settle = (root, skip, max) => Promise.race([Promise.all(moving(root, skip).map(fin)), new Promise(r => setTimeout(r, max || CAP))]);
  function hold(on) {
    if (on) {
      const b = document.querySelector('#rwHud .rw-bar i');
      if (b && !pinned) { const t = getComputedStyle(b).transform; b.style.transition = 'none'; b.style.transform = t; pinned = b; }   // the bar keeps its length until the HUD step
      ROOT.classList.add('fx-hold');
    } else if (snap) {                                                        // its HUD step was dropped (flush): catch up without motion
      snap = false;
      document.querySelectorAll('#rwHud .rw-lvl.rw-pulse').forEach(e => e.getAnimations().forEach(a => a.finish()));
      if (pinned) { pinned.style.transform = ''; void pinned.offsetWidth; pinned.style.transition = ''; pinned = null; }
      ROOT.classList.remove('fx-hold');
    } else {
      ROOT.classList.remove('fx-hold');
      if (pinned) { pinned.style.transition = pinned.style.transform = ''; pinned = null; }   // its .5 s fill now plays, alone
    }
  }
  const hush = () => document.querySelectorAll('.rw-chip.rw-wiggle').forEach(c => c.getAnimations().forEach(a => { try { a.finish(); } catch (e) { a.cancel(); } }));
  // a tap anywhere but the chip settles its wiggle at once (the student is answering: the ad never runs over Check). No chip = no work.
  document.addEventListener('pointerdown', e => { if (!(e.target.closest && e.target.closest('.rw-chip'))) hush(); }, { capture: true, passive: true });
  function begin() {
    busy = true;
    if (performance.now() - lastEnd > GRACE) fadeLeft = true;                 // a new reward: reduced motion gets its one fade again
    ROOT.classList.add('fx-busy');
    hold(true);
    hush();                                                                   // the answer is in: the ad stops
  }
  function next() {
    const s = Q.shift();
    if (!s) { busy = false; lastEnd = performance.now(); hold(false); ROOT.classList.remove('fx-busy'); return; }
    if (s.group === 'hud') hold(false);
    const ps = s.fns.map(([fn, res]) => { let p; try { p = Promise.resolve(fn()); } catch (e) { p = Promise.resolve(); } p.then(res, res); return p.then(() => {}, () => {}); });
    const tail = s.group === 'answer' ? settle(document, '.rw-chip, .fx-layer, .fx-ov, .fx-toast-host, #rwHud', 800)
      : s.group === 'hud' ? Promise.all([settle(document.getElementById('rwHud'), null, 1500), new Promise(r => setTimeout(r, still() ? 0 : 650))])   // + engine.js's 600 ms count-up (text, not WAAPI)
      : null;
    Promise.race([Promise.all(ps.concat(tail || [])), new Promise(r => setTimeout(r, CAP))]).then(next);
  }
  // a new answer or a new question while the last answer still plays: its queued answer / FX-layer / HUD steps are dropped (their promises
  // resolve; the HUD's numbers catch up on the next render) and the FX layer still moving finishes. Its slots, burst and banner stay queued
  // and play first: the engine already spent the burst cap on them (engine.js answer()), so they are never dropped or clicked away.
  const SKIP = { answer: 1, layer: 1, hud: 1 };
  function flush() {
    for (let i = Q.length - 1; i >= 0; i--) if (SKIP[Q[i].group]) { const s = Q.splice(i, 1)[0]; if (s.group === 'hud') snap = true; s.fns.forEach(([, res]) => res()); }
    if (L) L.querySelectorAll(':scope > :not(canvas)').forEach(n => n.getAnimations().forEach(a => a.finish()));
    if (layerConfetti && layerConfetti.reset) layerConfetti.reset();
  }
  addEventListener('hashchange', () => { if (busy) flush(); });             // the next question: a queued drop shows at once
  function seq(group, fn) {
    if (group === 'answer' && busy) flush();
    return new Promise(res => {
      const last = Q[Q.length - 1];
      if (last && last.group === group) last.fns.push([fn, res]);
      else Q.push({ group, fns: [[fn, res]] });
      if (!busy) { begin(); next(); }
    });
  }
  // the one fade under reduced motion; with motion every enter animates
  const fadeIn = (el, ms) => { if (still()) { if (!fadeLeft) return; fadeLeft = false; } el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: ms, easing: 'ease-out' }); };


  // shared fixed particle layer (never causes page overflow)
  let L, layerConfetti;
  const layer = () => (L && L.isConnected) ? L : (L = host('fx-layer'));

  // canvas-confetti bound to a canvas inside `par` (so it stacks with our overlays)
  function confettiIn(par) {
    if (!window.confetti) return null;
    const c = par.appendChild(mk('canvas', 'fx-canvas'));
    const f = window.confetti.create(c, { resize: true, disableForReducedMotion: true });
    f.canvas = c;
    return f;
  }

  // CSS particle burst at (x,y) inside par
  function spray(par, x, y, n, dist) {
    const f = par.appendChild(mk('i', 'fx-flash')), all = [];
    f.style.cssText = `left:${x}px;top:${y}px`;
    all.push(run(f, [{ transform: 'scale(.2)', opacity: 1 }, { transform: `scale(${dist / 40})`, opacity: 0 }], { duration: 380, easing: 'ease-out' }));
    for (let i = 0; i < n; i++) {
      const s = par.appendChild(mk('i', 'fx-sp fx-sp' + (i % 4)));
      s.style.cssText = `left:${x}px;top:${y}px;--c:${pick(COLORS)}`;
      const a = i / n * 360 + rnd(-12, 12), d = dist * rnd(.6, 1.2), r = `rotate(${a}deg) translateX`;
      all.push(run(s, [
        { transform: `${r}(0) scale(.3)`, opacity: 1 },
        { transform: `${r}(${d * .75}px) scale(1)`, opacity: 1, offset: .35 },
        { transform: `${r}(${d}px) scale(0)`, opacity: 0 }
      ], { duration: rnd(520, 820), delay: rnd(0, 40), easing: 'cubic-bezier(.1,.7,.3,1)' }));
    }
    return Promise.all(all);
  }

  // the answer's one pulse: app.css's .opt.pop when it runs (a right pick), else ours; the ring is gone (it was a second group)
  function pop(el) {
    if (!el || still() || el.getAnimations().some(finite)) return;
    return el.animate(popKF(1.12), { duration: 350, easing: EASE.pop }).finished.catch(() => {});
  }

  function sparks(el, tier) {
    if (!el || still()) return;
    tier = COUNT[tier] ? tier : 'small';
    const p = mid(el);
    const s = spray(layer(), p.x, p.y, COUNT[tier], DIST[tier]);
    if (!layerConfetti || !layerConfetti.canvas.isConnected) layerConfetti = confettiIn(layer());   // confetti on every correct (Tony, Oct 4)
    const c = layerConfetti && layerConfetti({ particleCount: CONF[tier], spread: 80, startVelocity: 32, ticks: 70, scalar: .9, colors: COLORS, shapes: ['star', 'circle'],
      origin: { x: p.x / innerWidth, y: p.y / innerHeight } });   // 70 ticks (~1.2 s, was 120): the FX layer's step ends with it
    return Promise.all([s, c && Promise.race([c, new Promise(r => setTimeout(r, 900))]).then(() => layerConfetti.reset && layerConfetti.reset())]);   // time-boxed: slow frames never stretch the step
  }

  function coinFly(fromEl, toEl, n) {
    toEl = toEl || document.getElementById('coinPill');
    n = n || 5;
    if (!fromEl || !toEl || still()) return Promise.resolve();
    const a = mid(fromEl), b = mid(toEl), Ly = layer();
    return Promise.all(Array.from({ length: n }, (_, i) => {
      const c = Ly.appendChild(mk('img', 'fx-fly'));
      c.src = src('coin_color'); c.alt = ''; c.draggable = false;
      const p0 = { x: a.x + rnd(-18, 18), y: a.y + rnd(-10, 10) };
      const p1 = { x: (a.x + b.x) / 2 + rnd(-50, 50), y: Math.min(a.y, b.y) - rnd(70, 140) };
      const kf = [];
      for (let k = 0; k <= 10; k++) { // quadratic bezier arc
        const t = k / 10, u = 1 - t;
        const x = u * u * p0.x + 2 * u * t * p1.x + t * t * b.x - 11, y = u * u * p0.y + 2 * u * t * p1.y + t * t * b.y - 11;
        kf.push({ transform: `translate(${x}px,${y}px) scale(${1 + .4 * Math.sin(Math.PI * t) - .35 * t}) rotate(${t * 300}deg)`, opacity: k ? 1 : 0 });
      }
      return c.animate(kf, { duration: 600, delay: i * 70, easing: 'cubic-bezier(.4,0,.7,1)', fill: 'backwards' }).finished.catch(() => {}).then(() => {
        c.remove();                                               // one blink: the pill's answer is the HUD step's shine (no pop / spray here)
      });
    })).then(() => {});
  }

  let tHost, cur, tTimer;
  function toast(text, sub) {                                     // the drop banner: never takes a tap (pointer-events: none in rewards.css)
    if (!tHost || !tHost.isConnected) tHost = host('fx-toast-host');
    clearTimeout(tTimer);
    if (cur) cur.remove();
    const t = cur = tHost.appendChild(mk('div', 'fx-toast', img('glowing_star_color', 'fx-toast-i')));
    const b = t.appendChild(mk('div', 'fx-toast-b'));
    b.append(txt('div', 'fx-toast-t', text));
    if (sub) b.append(txt('div', 'fx-toast-s', sub));
    if (still()) fadeIn(t, 200);
    else t.animate([{ opacity: 0, transform: 'translateY(-16px) scale(.96)' }, { opacity: 1, transform: 'none' }], { duration: 200, easing: 'ease-out' });
    const hide = () => {
      if (t !== cur) return;
      cur = null; clearTimeout(tTimer);
      if (still()) t.remove(); else run(t, [{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: 'forwards' });
    };
    t.addEventListener('click', hide);
    tTimer = setTimeout(hide, 2200);
    return t.getAnimations()[0] && t.getAnimations()[0].finished.catch(() => {});   // the queue moves on once it has landed
  }

  // full-screen overlay shell: tap / Escape -> skip(); close() fades 200ms and removes
  function overlay(cls, skip) {
    const el = host('fx-ov ' + cls);
    let closed = false, done;
    const p = new Promise(r => (done = r));
    const key = e => { if (e.key === 'Escape') skip(); };
    const close = () => {
      if (closed) return;
      closed = true;
      document.removeEventListener('keydown', key);
      el.style.pointerEvents = 'none';
      if (still()) { el.remove(); done(); }                                   // reduced motion: out at once (its one fade was the way in)
      else run(el, [{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: 'forwards' }).then(done);
    };
    el.addEventListener('click', skip);
    document.addEventListener('keydown', key);
    fadeIn(el, 180);
    return { el, close, done: p };
  }

  const TIER = { common: ['coin_color', 'COIN DROP', 'small'], rare: ['gem_stone_color', 'RARE DROP', 'medium'], legend: ['duck_color', 'LEGENDARY', 'large'] };
  const FILLER = ['cherries_color', 'star_color', 'trophy_color', 'glowing_star_color']; // never a tier icon -> no fake near-miss
  const CELL = 84;

  function slots(tier) {
    const T = TIER[tier] ? tier : 'common', [win, label, size] = TIER[T], calm = still();
    let landed = false, reels = [];
    const ov = overlay('fx-slots-ov', () => (landed ? ov.close() : land(350)));
    const p = ov.el.appendChild(mk('div', 'fx-slots fx-t-' + T,
      `<div class="fx-slots-in"><div class="fx-bulbs">${'<i></i>'.repeat(11)}</div><div class="fx-reels"></div><div class="fx-slabel"></div></div>`));
    p.style.setProperty('--cell', CELL + 'px');
    if (!calm) p.classList.add('fx-spin');            // marquee bulbs blink only while the reels move
    const lab = p.querySelector('.fx-slabel'), box = p.querySelector('.fx-reels');
    lab.textContent = label;
    const winCls = T === 'legend' ? 'fx-gold' : '';
    reels = [0, 1, 2].map(i => {
      const n = 12 + i * 4, icons = []; // icons[1] is the payline result; strip scrolls downward onto it
      for (let k = 0; k < n; k++) { let x = win; if (k !== 1) do x = pick(FILLER); while (x === icons[k - 1]); icons.push(x); }
      const reel = box.appendChild(mk('div', 'fx-reel',
        `<div class="fx-strip">${icons.map((x, k) => `<div class="fx-cell">${img(x, k === 1 ? winCls : '')}</div>`).join('')}</div>`));
      const strip = reel.firstChild, dur = 500 + i * 200;
      strip.style.transform = `translateY(${-CELL}px)`;
      if (calm) return { strip };
      strip.classList.add('spin');
      setTimeout(() => strip.classList.remove('spin'), dur * .7);
      const a = strip.animate([
        { transform: `translateY(${-(n - 1) * CELL}px)`, easing: 'cubic-bezier(.16,1,.3,1)' },
        { transform: `translateY(${-CELL}px)` }
      ], { duration: dur });
      return { strip, a };
    });

    function land(hold) {
      if (landed) return;
      landed = true;
      p.classList.remove('fx-spin');
      reels.forEach(r => { r.a && r.a.finish(); r.strip.classList.remove('spin'); });
      p.classList.add('win');
      if (!calm) {
        reels.forEach((r, i) => r.strip.children[1].firstChild.animate(popKF(1.25), { duration: 420, delay: i * 70, easing: EASE.out }));
        lab.animate(enterKF(.4), { duration: 420, easing: EASE.out });
        const c = mid(box);
        spray(ov.el, c.x, c.y, COUNT[size], DIST[size]);
      }
      setTimeout(ov.close, hold);
    }

    if (calm) land(900);
    else {
      p.animate(enterKF(.8), { duration: 260, easing: EASE.out });
      Promise.all(reels.map(r => r.a.finished)).then(() => land(500), () => {});
    }
    return ov.done;
  }

  const KIND = {
    levelup: { t: 'LEVEL UP', d: 1200 },
    win: { t: 'WIN!', d: 1200 },
    bonus: { t: 'BONUS!', d: 1200 },
    legend: { t: 'THE GOLDEN DUCK HAS NOTICED YOU.', s: '+50 XP', d: 2000 }
  };

  // pixel title: outline layer + gradient fill + shine sweep, stacked in one grid cell
  function titleEl(text) {
    const t = mk('div', 'fx-title');
    t.style.setProperty('--n', Math.max(8, Math.min(text.length, 16)));
    ['fx-o', 'fx-f', 'fx-s'].forEach(k => { const s = t.appendChild(txt('span', k, text)); if (k !== 'fx-f') s.setAttribute('aria-hidden', 'true'); });
    return t;
  }

  function stars() {
    const w = mk('div', 'fx-stars');
    ['l', 'm', 'r'].forEach((k, i) => {
      const s = w.appendChild(mk('span', 'fx-star fx-star-' + k, img('star_color')));
      s.firstChild.animate([
        { transform: 'scale(0) rotate(-40deg)', opacity: 0 },
        { transform: 'scale(1.3) rotate(8deg)', opacity: 1, offset: .6 },
        { transform: 'scale(1) rotate(0)', opacity: 1 }
      ], { duration: 380, delay: i * 80, easing: EASE.out, fill: 'backwards' });   // stars first (0 / 80 / 160 ms)
    });
    return w;
  }

  // falling coin images (CSS), plus confetti glitter when available
  function shower(par, n) {
    const H = innerHeight + 80;
    for (let i = 0; i < n; i++) {
      const c = par.appendChild(mk('img', 'fx-rain'));
      c.src = src('coin_color'); c.alt = '';
      const s = rnd(18, 34), r = rnd(-540, 540);
      c.style.cssText = `left:${rnd(0, 100)}%;width:${s}px;height:${s}px`;
      run(c, [0, .25, .5, .75, 1].map((t, k) => ({
        transform: `translateY(${-40 + H * Math.pow(t, 1.4)}px) rotate(${r * t}deg) scaleX(${k % 2 ? .25 : 1})`, opacity: 1
      })), { duration: rnd(1100, 1600), delay: rnd(0, 700), fill: 'backwards' });
    }
    const f = confettiIn(par);
    if (f) f({ particleCount: 90, spread: 120, startVelocity: 38, ticks: 200, gravity: .9, scalar: 1.1, shapes: ['circle', 'star'],
      colors: ['#ffd36b', '#ffb347', '#fff3b0', '#ff8a1f'], origin: { x: .5, y: .45 } });
  }

  function burst(kind, o) {
    o = o || {};
    if (!KIND[kind]) kind = 'levelup';
    const K = KIND[kind], calm = still(), title = o.title || K.t, sub = o.sub != null ? o.sub : K.s;
    let timer;
    const ov = overlay('fx-burst fx-' + kind, () => { clearTimeout(timer); ov.close(); });
    ov.el.innerHTML = '<div class="fx-rays"></div><div class="fx-dots"></div>';
    const c = ov.el.appendChild(mk('div', 'fx-bc'));
    if (!calm && (kind === 'levelup' || kind === 'win')) c.append(stars());   // the 3-star WIN banner of the slot kit
    const duck = !calm && kind === 'legend' && c.appendChild(mk('div', 'fx-duck', img('duck_color', 'fx-gold')));
    const t = c.appendChild(titleEl(title));
    const s = sub ? c.appendChild(txt('div', kind === 'levelup' ? 'fx-plate' : 'fx-sub', sub)) : null;
    if (!calm) {
      t.animate([{ transform: 'scale(.6)', opacity: 0 }, { transform: 'scale(1.1)', opacity: 1, offset: .6 }, { transform: 'scale(1)', opacity: 1 }],
        { duration: 400, delay: 200, easing: EASE.out, fill: 'backwards' });   // then the title ribbon (200 ms)
      if (s) s.animate([{ transform: 'translateY(14px) scale(.8)', opacity: 0 }, { transform: 'none', opacity: 1 }],
        { duration: 300, delay: 400, easing: EASE.pop, fill: 'backwards' });   // then the plate (400 ms)
      if (duck) {
        duck.animate([{ transform: 'scale(0) rotate(-30deg)', opacity: 0 }, { transform: 'scale(1.15) rotate(6deg)', opacity: 1, offset: .65 }, { transform: 'scale(1) rotate(0)', opacity: 1 }],
          { duration: 520, easing: EASE.out });
        shower(ov.el, 26);
      }
      setTimeout(() => { const m = mid(t); spray(ov.el, m.x, m.y, kind === 'legend' ? 30 : 22, 150); }, 600);   // the sparks last (600 ms)
    }
    timer = setTimeout(ov.close, K.d);
    return ov.done;
  }

  // "+10 XP" rising off the answer on every correct; cls "fx-float-sm" = a wrong try's quiet "+1"
  function float(el, text, cls) {
    if (!el || still()) return;
    const p = mid(el), f = layer().appendChild(txt('div', 'fx-float' + (cls ? ' ' + cls : ''), text));
    f.style.cssText = `left:${p.x}px;top:${p.y}px`;
    return run(f, [{ transform: 'translate(-50%,-50%) scale(.8)', opacity: 0 }, { transform: 'translate(-50%,-110%) scale(1)', opacity: 1, offset: .25 },
      { transform: 'translate(-50%,-220%) scale(1)', opacity: 0 }], { duration: 900, easing: 'cubic-bezier(.2,.8,.3,1)' });
  }

  // one light sweep across the HUD coin pill (rewards.css .rw-shine)
  function shine(el) {
    if (!el || still()) return;
    el.classList.remove('rw-shine'); void el.offsetWidth; el.classList.add('rw-shine');
    el.addEventListener('animationend', () => el.classList.remove('rw-shine'), { once: true });
  }

  // every entry point joins the one queue (seq); the step's promise resolves when its part is done (slots / burst: when the overlay is gone)
  window.FX = {
    pop: el => seq('answer', () => pop(el)),
    sparks: (el, tier) => seq('layer', () => sparks(el, tier)),
    float: (el, text, cls) => seq('layer', () => float(el, text, cls)),
    coinFly: (fromEl, toEl, n) => seq('layer', () => coinFly(fromEl, toEl, n)),
    shine: el => seq('hud', () => shine(el)),
    hud: fn => seq('hud', fn),                                              // app.js: the HUD's render (count-up, bar) in the HUD step
    slots: tier => seq('slots', () => slots(tier)),
    burst: (kind, o) => seq('burst', () => burst(kind, o)),
    toast: (text, sub) => seq('toast', () => toast(text, sub))
  };
})();
